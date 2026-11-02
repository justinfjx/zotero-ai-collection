import { getString } from "../utils/locale";
import { getPref, setPref } from "../utils/prefs";
import type { AIClassificationResult, ProposalOptions } from "./api";
import { buildCollectionNodes, flattenNodes } from "./collectionTree";
import { getEnabledCollections, isCollectionEnabled } from "./collectionScope";
import {
  addToStore,
  checkProposal,
  depthOf,
  dismiss,
  markPrompted,
  openPaths,
  parseLibraryStores,
  readyProposals,
  removeProposal,
  type CollectionRef,
  type NewCollectionProposal,
  type ProposalLimits,
  type ProposalStore,
} from "./proposals";

const DEFAULT_MIN_ITEMS = 10;
const TITLES_SHOWN = 5;

/** Suggestions belong to one classification run. */
export type SuggestionMap = Map<number, NewCollectionProposal>;

// Serialize reviews across runs so prompts and preference updates have one owner.
let reviewQueue: Promise<void> = Promise.resolve();

function isEnabled(): boolean {
  return getPref("proposeNewCollections") === true;
}

function readLimits(): ProposalLimits {
  return {
    maxDepth: Number(getPref("maxDepth")) || 0,
    allowTopLevel: getPref("allowNewTopLevel") === true,
  };
}

function readStores() {
  return parseLibraryStores(
    getPref("pendingProposals") as string | undefined,
    Zotero.Libraries.userLibraryID
  );
}

function readStore(libraryID: number): ProposalStore {
  return readStores()[libraryID] ?? {};
}

function writeStore(libraryID: number, store: ProposalStore): void {
  const libraries = readStores();
  if (Object.keys(store).length > 0) {
    libraries[libraryID] = store;
  } else {
    delete libraries[libraryID];
  }
  setPref(
    "pendingProposals",
    Object.keys(libraries).length
      ? JSON.stringify({ version: 1, libraries })
      : "{}"
  );
}

function listCollections(libraryID: number): CollectionRef[] {
  return flattenNodes(
    buildCollectionNodes(Zotero.Collections.getByLibrary(libraryID))
  ).map(({ option }) => ({ id: option.id, path: option.path }));
}

function checkSuggestion(
  suggestion: NewCollectionProposal,
  collections: CollectionRef[],
  limits: ProposalLimits
) {
  const parent = collections.find(({ id }) => id === suggestion.parentID);
  if (parent && !isCollectionEnabled(parent)) {
    return {
      ok: false,
      reason: "parent excluded by collection selection",
    } as const;
  }
  return checkProposal(suggestion, collections, limits);
}

async function getEligibleItem(libraryID: number, key: string) {
  const item = (await Zotero.Items.getByLibraryAndKeyAsync(libraryID, key)) as
    | Zotero.Item
    | false;
  return item &&
    item.libraryID === libraryID &&
    item.isRegularItem() &&
    !item.deleted &&
    item.getCollections().length === 0
    ? item
    : undefined;
}

/** Refresh every pending item, including items outside the current batch. */
async function pruneStore(
  libraryID: number,
  store: ProposalStore
): Promise<ProposalStore> {
  const entries = await Promise.all(
    Object.entries(store).map(async ([path, proposal]) => {
      const items: Record<string, string> = {};
      for (const key of Object.keys(proposal.items)) {
        const item = await getEligibleItem(libraryID, key);
        if (item) {
          items[key] = item.getField("title") as string;
        }
      }
      return [path, { ...proposal, items }] as const;
    })
  );
  return Object.fromEntries(
    entries.filter(
      ([, proposal]) =>
        proposal.dismissed || Object.keys(proposal.items).length > 0
    )
  );
}

/**
 * Get what the AI needs to suggest a new collection
 * @param libraryID - The library ID
 * @returns The options, or undefined when suggestions are turned off
 */
export function getProposalOptions(
  libraryID: number
): ProposalOptions | undefined {
  if (!isEnabled()) {
    return undefined;
  }
  const limits = readLimits();
  const collections = listCollections(libraryID);
  const enabled = getEnabledCollections();
  const parents = collections.filter(
    (collection) =>
      isCollectionEnabled(collection, enabled) &&
      (limits.maxDepth === 0 || depthOf(collection.path) < limits.maxDepth)
  );
  if (!limits.allowTopLevel && parents.length === 0) {
    return undefined;
  }
  const store = readStore(libraryID);
  return {
    parents,
    ...limits,
    openPaths: openPaths(store).filter(
      (path) => checkSuggestion(store[path], collections, limits).ok
    ),
  };
}

/**
 * Remember a new collection the AI suggested for an item
 * @param item - The item that was classified
 * @param result - The AI's answer
 */
export function recordSuggestion(
  item: Zotero.Item,
  result: AIClassificationResult,
  suggestions: SuggestionMap
): void {
  suggestions.delete(item.id);
  if (
    isEnabled() &&
    result.newCollection &&
    result.collectionIDs.length === 0 &&
    result.collections.length === 0
  ) {
    suggestions.set(item.id, result.newCollection);
  }
}

/**
 * Collect suggestions for items that stayed unfiled, then ask the user about
 * every suggestion that now has enough items.
 * @param libraryID - The library ID
 * @param items - The items that were just classified
 */
export function reviewSuggestions(
  libraryID: number,
  items: Zotero.Item[],
  suggestions: SuggestionMap
): Promise<void> {
  const review = reviewQueue.then(() =>
    reviewRun(libraryID, items, suggestions)
  );
  reviewQueue = review.catch(() => undefined);
  return review;
}

async function reviewRun(
  libraryID: number,
  items: Zotero.Item[],
  suggestions: SuggestionMap
): Promise<void> {
  if (!isEnabled()) {
    return;
  }
  const collections = listCollections(libraryID);
  const limits = readLimits();
  let store = await pruneStore(libraryID, readStore(libraryID));
  for (const item of items) {
    const suggestion = suggestions.get(item.id);
    if (
      !suggestion ||
      item.libraryID !== libraryID ||
      !(await getEligibleItem(libraryID, item.key))
    ) {
      continue;
    }
    const check = checkSuggestion(suggestion, collections, limits);
    if (check.ok) {
      store = addToStore(
        store,
        check.path,
        { parentID: check.parentID, name: suggestion.name },
        item.key,
        item.getField("title") as string
      );
    }
  }
  suggestions.clear();
  writeStore(libraryID, store);

  const minItems = Number(getPref("proposalMinItems")) || DEFAULT_MIN_ITEMS;
  for (const path of readyProposals(store, minItems)) {
    if (checkSuggestion(store[path], collections, limits).ok) {
      await askAboutProposal(libraryID, path);
    }
  }
}

/**
 * Ask whether to create a suggested collection and move its items into it
 * @param libraryID - The library ID
 * @param path - The path of the suggested collection
 */
async function askAboutProposal(
  libraryID: number,
  path: string
): Promise<void> {
  const proposal = readStore(libraryID)[path];
  const titles = Object.values(proposal.items);
  const message = [
    path,
    `${getString("proposal.items")} ${titles.length}`,
    "",
    ...titles.slice(0, TITLES_SHOWN).map((title) => `• ${title}`),
    titles.length > TITLES_SHOWN ? "…" : "",
  ].join("\n");

  const prompts = Services.prompt;
  const flags =
    prompts.BUTTON_TITLE_IS_STRING *
    (prompts.BUTTON_POS_0 + prompts.BUTTON_POS_1 + prompts.BUTTON_POS_2);
  const choice = prompts.confirmEx(
    Zotero.getMainWindow(),
    getString("proposal.title"),
    message,
    flags,
    getString("proposal.create"),
    getString("proposal.later"),
    getString("proposal.never"),
    null,
    {}
  );

  if (choice === 0) {
    try {
      await createAndFile(libraryID, path);
    } catch (error: any) {
      Zotero.getMainWindow().alert(
        `${getString("error.processing")} ${error.message}`
      );
      throw error;
    }
  } else if (choice === 1) {
    writeStore(libraryID, markPrompted(readStore(libraryID), path));
  } else {
    writeStore(libraryID, dismiss(readStore(libraryID), path));
  }
}

/**
 * Create a suggested collection and move its items into it
 * @param libraryID - The library ID
 * @param path - The path of the suggested collection
 */
async function createAndFile(libraryID: number, path: string): Promise<void> {
  const store = await pruneStore(libraryID, readStore(libraryID));
  writeStore(libraryID, store);
  const proposal = store[path];
  const minItems = Number(getPref("proposalMinItems")) || DEFAULT_MIN_ITEMS;
  if (!proposal || Object.keys(proposal.items).length < minItems) {
    return;
  }
  const check = checkSuggestion(
    { parentID: proposal.parentID, name: proposal.name },
    listCollections(libraryID),
    readLimits()
  );
  if (!check.ok) {
    Zotero.getMainWindow().alert(`${path}: ${check.reason}`);
    return;
  }

  let moved = 0;
  await Zotero.DB.executeTransaction(async () => {
    const collection = new Zotero.Collection({
      libraryID,
      parentID: check.parentID ?? undefined,
      name: proposal.name.trim(),
    });
    await collection.save();
    for (const key of Object.keys(proposal.items)) {
      const item = await getEligibleItem(libraryID, key);
      if (item) {
        item.addToCollection(collection.id);
        await item.save();
        moved++;
      }
    }
  });
  writeStore(libraryID, removeProposal(readStore(libraryID), path));
  Zotero.getMainWindow().alert(
    `${getString("proposal.created")} ${check.path}\n${getString(
      "proposal.moved"
    )} ${moved}`
  );
}
