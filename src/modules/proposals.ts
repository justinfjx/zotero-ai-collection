import { PATH_SEPARATOR } from "./collectionTree";

const MAX_NAME_LENGTH = 60;

/** A new collection suggested by the AI */
export interface NewCollectionProposal {
  parentID: number | null;
  name: string;
}

/** An existing collection */
export interface CollectionRef {
  id: number;
  path: string;
}

export interface ProposalLimits {
  /** Deepest level a new collection may have (0 = unlimited) */
  maxDepth: number;
  allowTopLevel: boolean;
}

export type ProposalCheck =
  | { ok: true; path: string; parentID: number | null }
  | { ok: false; reason: string };

/** A proposed collection waiting for enough items to justify creating it */
export interface PendingProposal {
  parentID: number | null;
  name: string;
  /** Item key -> title */
  items: Record<string, string>;
  /** How many items it had when the user was last asked */
  prompted: number;
  dismissed: boolean;
}

/** Pending proposals by the path the collection would have */
export type ProposalStore = Record<string, PendingProposal>;

export type LibraryProposalStores = Record<string, ProposalStore>;

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Get the nesting level of a collection path
 * @param path - A collection path such as "A/B"
 * @returns 1 for a top-level collection
 */
export function depthOf(path: string): number {
  return path.split(PATH_SEPARATOR).length;
}

/**
 * Check a proposed collection against the existing collections and the limits
 * @param proposal - The suggestion from the AI
 * @param collections - All existing collections
 * @param limits - Depth and top-level rules
 * @returns The path it would get, or the reason it was rejected
 */
export function checkProposal(
  proposal: NewCollectionProposal,
  collections: CollectionRef[],
  limits: ProposalLimits
): ProposalCheck {
  const name = proposal.name.trim();
  if (!name) {
    return { ok: false, reason: "empty name" };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, reason: "name too long" };
  }
  if (name.includes(PATH_SEPARATOR)) {
    return { ok: false, reason: `name contains ${PATH_SEPARATOR}` };
  }

  let parentPath = "";
  if (proposal.parentID === null) {
    if (!limits.allowTopLevel) {
      return { ok: false, reason: "new top-level collections are not allowed" };
    }
  } else {
    const parent = collections.find((c) => c.id === proposal.parentID);
    if (!parent) {
      return { ok: false, reason: "parent does not exist" };
    }
    parentPath = parent.path;
  }

  const path = parentPath ? `${parentPath}${PATH_SEPARATOR}${name}` : name;
  if (limits.maxDepth > 0 && depthOf(path) > limits.maxDepth) {
    return { ok: false, reason: `deeper than ${limits.maxDepth} levels` };
  }

  const duplicate = collections.some(
    (c) => normalize(c.path) === normalize(path)
  );
  if (duplicate) {
    return { ok: false, reason: "already exists" };
  }
  return { ok: true, path, parentID: proposal.parentID };
}

/**
 * Read the stored proposals
 * @param text - The stored JSON
 * @returns The store, empty if the text is missing or invalid
 */
export function parseStore(text: string | undefined): ProposalStore {
  try {
    const value = JSON.parse(text || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value).filter(
        ([, entry]: [string, any]) =>
          entry &&
          (entry.parentID === null || Number.isInteger(entry.parentID)) &&
          typeof entry.name === "string" &&
          entry.items &&
          typeof entry.items === "object" &&
          !Array.isArray(entry.items) &&
          Object.values(entry.items).every(
            (title) => typeof title === "string"
          ) &&
          Number.isInteger(entry.prompted) &&
          entry.prompted >= 0 &&
          typeof entry.dismissed === "boolean"
      )
    ) as ProposalStore;
  } catch {
    return {};
  }
}

/** Read library-scoped stores, assigning the earlier unscoped format to My Library. */
export function parseLibraryStores(
  text: string | undefined,
  userLibraryID: number
): LibraryProposalStores {
  try {
    const value = JSON.parse(text || "{}");
    if (
      value?.version === 1 &&
      value.libraries &&
      typeof value.libraries === "object"
    ) {
      return Object.fromEntries(
        Object.entries(value.libraries)
          .filter(([libraryID]) => /^\d+$/.test(libraryID))
          .map(([libraryID, store]) => [
            libraryID,
            parseStore(JSON.stringify(store)),
          ])
      );
    }
    const legacy = parseStore(text);
    return Object.keys(legacy).length > 0 ? { [userLibraryID]: legacy } : {};
  } catch {
    return {};
  }
}

/**
 * Add an item to a proposal. An item belongs to at most one proposal.
 * @param store - The current store
 * @param path - The path of the proposed collection
 * @param proposal - The proposed collection
 * @param itemKey - Key of the item that did not fit anywhere
 * @param title - Title of that item
 * @returns A new store
 */
export function addToStore(
  store: ProposalStore,
  path: string,
  proposal: { parentID: number | null; name: string },
  itemKey: string,
  title: string
): ProposalStore {
  const next = removeItems(store, [itemKey]);
  const entry = (Object.prototype.hasOwnProperty.call(next, path)
    ? next[path]
    : undefined) ?? {
    parentID: proposal.parentID,
    name: proposal.name.trim(),
    items: {},
    prompted: 0,
    dismissed: false,
  };
  return {
    ...next,
    [path]: { ...entry, items: { ...entry.items, [itemKey]: title } },
  };
}

/**
 * Remove items from every proposal, preserving dismissed topics even when empty
 * @param store - The current store
 * @param itemKeys - Keys to remove
 * @returns A new store
 */
export function removeItems(
  store: ProposalStore,
  itemKeys: string[]
): ProposalStore {
  const drop = new Set(itemKeys);
  return Object.fromEntries(
    Object.entries(store)
      .map(
        ([path, entry]) =>
          [
            path,
            {
              ...entry,
              items: Object.fromEntries(
                Object.entries(entry.items).filter(([key]) => !drop.has(key))
              ),
            },
          ] as const
      )
      .filter(
        ([, entry]) => Object.keys(entry.items).length > 0 || entry.dismissed
      )
  );
}

/**
 * Proposals the user should be asked about: enough items, not dismissed,
 * and more items than when they were last asked.
 * @param store - The current store
 * @param minItems - Items needed before asking
 * @returns The paths of the proposals that are ready
 */
export function readyProposals(
  store: ProposalStore,
  minItems: number
): string[] {
  return Object.keys(store).filter((path) => {
    const count = Object.keys(store[path].items).length;
    return (
      !store[path].dismissed &&
      count >= minItems &&
      count > store[path].prompted
    );
  });
}

/**
 * Remember how many items a proposal had when the user was asked
 * @param store - The current store
 * @param path - The proposal path
 * @returns A new store
 */
export function markPrompted(
  store: ProposalStore,
  path: string
): ProposalStore {
  const entry = store[path];
  if (!entry) {
    return store;
  }
  const prompted = Object.keys(entry.items).length;
  return { ...store, [path]: { ...entry, prompted } };
}

/**
 * Stop suggesting a proposal
 * @param store - The current store
 * @param path - The proposal path
 * @returns A new store
 */
export function dismiss(store: ProposalStore, path: string): ProposalStore {
  const entry = store[path];
  return entry ? { ...store, [path]: { ...entry, dismissed: true } } : store;
}

/**
 * Drop a proposal, for example after its collection was created
 * @param store - The current store
 * @param path - The proposal path
 * @returns A new store
 */
export function removeProposal(
  store: ProposalStore,
  path: string
): ProposalStore {
  const { [path]: _removed, ...rest } = store;
  return rest;
}

/**
 * Paths of proposals still open, so the AI can reuse the exact names
 * @param store - The current store
 * @returns The open proposal paths
 */
export function openPaths(store: ProposalStore): string[] {
  return Object.keys(store).filter((path) => !store[path].dismissed);
}
