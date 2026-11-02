import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getProposalOptions,
  recordSuggestion,
  type SuggestionMap,
  reviewSuggestions as reviewRun,
} from "../src/modules/newCollections.ts";

const PREFIX = "extensions.zotero.zoteroaicollection";
const LIBRARY = 1;

class FakeCollection {
  id = 0;
  libraryID: number;
  name: string;
  parentID?: number;
  children: FakeCollection[] = [];

  constructor(params: { libraryID: number; name: string; parentID?: number }) {
    this.libraryID = params.libraryID;
    this.name = params.name;
    this.parentID = params.parentID;
  }

  getChildCollections() {
    return this.children;
  }

  async save() {
    this.id = world.saved.length + 1;
    world.saved.push(this);
    world.saved.find((c) => c.id === this.parentID)?.children.push(this);
  }
}

class FakeItem {
  static nextID = 1;
  id = FakeItem.nextID++;
  deleted = false;
  collections: number[] = [];
  libraryID = LIBRARY;

  constructor(public key: string, public title: string) {}

  getCollections() {
    return this.collections;
  }

  isRegularItem() {
    return true;
  }

  getField() {
    return this.title;
  }

  addToCollection(id: number) {
    this.collections.push(id);
  }

  removeFromCollection(id: number) {
    this.collections = this.collections.filter((c) => c !== id);
  }

  async save() {}
}

interface World {
  saved: FakeCollection[];
  items: Map<string, FakeItem>;
  prefs: Record<string, unknown>;
  dialogs: string[];
  alerts: string[];
  choice: number;
}

let world: World;
let suggestions: SuggestionMap;

function reviewSuggestions(libraryID: number, items: Zotero.Item[]) {
  return reviewRun(libraryID, items, suggestions);
}

function stored(libraryID = LIBRARY) {
  return (
    JSON.parse(pref("pendingProposals") as string).libraries?.[libraryID] ?? {}
  );
}

function pref(name: string): unknown {
  return world.prefs[`${PREFIX}.${name}`];
}

async function addCollections(...paths: string[]) {
  for (const path of paths) {
    const segments = path.split("/");
    const parent = world.saved.find(
      (c) => c.name === segments[segments.length - 2]
    );
    const collection = new FakeCollection({
      libraryID: LIBRARY,
      name: segments[segments.length - 1],
      parentID: parent?.id,
    });
    await collection.save();
  }
}

function addItems(count: number): FakeItem[] {
  return Array.from({ length: count }, (_, i) => {
    const item = new FakeItem(`K${world.items.size}`, `Paper ${i}`);
    world.items.set(item.key, item);
    return item;
  });
}

function suggest(
  items: FakeItem[],
  suggestion = { parentID: 1, name: "Walks" }
) {
  for (const item of items) {
    recordSuggestion(
      item as any,
      {
        collectionIDs: [],
        collections: [],
        newCollection: suggestion,
      },
      suggestions
    );
  }
}

beforeEach(async () => {
  FakeItem.nextID = 1;
  suggestions = new Map();
  world = {
    saved: [],
    items: new Map(),
    prefs: {
      [`${PREFIX}.proposeNewCollections`]: true,
      [`${PREFIX}.proposalMinItems`]: 3,
      [`${PREFIX}.maxDepth`]: 2,
      [`${PREFIX}.allowNewTopLevel`]: false,
      [`${PREFIX}.pendingProposals`]: "{}",
    },
    dialogs: [],
    alerts: [],
    choice: 0,
  };
  const g = globalThis as any;
  g.addon = {
    data: {
      locale: { stringBundle: { GetStringFromName: (key: string) => key } },
    },
  };
  g.Zotero = {
    Prefs: {
      get: (key: string) => world.prefs[key],
      set: (key: string, value: unknown) => (world.prefs[key] = value),
    },
    Collection: FakeCollection,
    DB: {
      executeTransaction: async (action: () => Promise<void>) => {
        const collections = [...world.saved];
        const children = world.saved.map((c) => [...c.children]);
        const memberships = Array.from(
          world.items.values(),
          (item) => [item, [...item.collections]] as const
        );
        try {
          await action();
        } catch (error) {
          world.saved = collections;
          collections.forEach((c, index) => (c.children = children[index]));
          memberships.forEach(([item, ids]) => (item.collections = ids));
          throw error;
        }
      },
    },
    Collections: {
      getByLibrary: (libraryID: number) =>
        world.saved.filter((c) => c.libraryID === libraryID && !c.parentID),
    },
    Items: {
      getByLibraryAndKey: (_lib: number, key: string) =>
        world.items.get(key) ?? false,
      getByLibraryAndKeyAsync: async (lib: number, key: string) =>
        Array.from(world.items.values()).find(
          (item) => item.libraryID === lib && item.key === key
        ) ?? false,
    },
    Libraries: { userLibraryID: LIBRARY },
    getMainWindow: () => ({ alert: (m: string) => world.alerts.push(m) }),
  };
  g.Services = {
    prompt: {
      BUTTON_TITLE_IS_STRING: 127,
      BUTTON_POS_0: 1,
      BUTTON_POS_1: 256,
      BUTTON_POS_2: 65536,
      confirmEx: (_w: unknown, _t: string, message: string) => {
        world.dialogs.push(message);
        return world.choice;
      },
    },
  };
  await addCollections("Algorithms", "Algorithms/Core");
});

test("does nothing when suggestions are turned off", async () => {
  world.prefs[`${PREFIX}.proposeNewCollections`] = false;
  const items = addItems(3);
  suggest(items);

  await reviewSuggestions(LIBRARY, items as any);

  assert.equal(pref("pendingProposals"), "{}");
  assert.deepEqual(world.dialogs, []);
  assert.equal(getProposalOptions(LIBRARY), undefined);
});

test("stores suggestions for unfiled items and skips filed ones", async () => {
  const items = addItems(3);
  items[2].collections = [2];
  suggest(items);

  await reviewSuggestions(LIBRARY, items as any);

  const store = stored();
  assert.deepEqual(Object.keys(store), ["Algorithms/Walks"]);
  assert.deepEqual(Object.keys(store["Algorithms/Walks"].items), ["K0", "K1"]);
  assert.deepEqual(world.dialogs, []);
});

test("ignores suggestions that break the rules", async () => {
  const items = addItems(2);
  suggest(items, { parentID: 2, name: "TooDeep" });
  await reviewSuggestions(LIBRARY, items as any);
  assert.equal(pref("pendingProposals"), "{}");

  suggest(items, { parentID: null as any, name: "TopLevel" });
  await reviewSuggestions(LIBRARY, items as any);
  assert.equal(pref("pendingProposals"), "{}");
});

test("asks once enough items share a suggestion, then creates it and moves them", async () => {
  const items = addItems(3);
  suggest(items);

  await reviewSuggestions(LIBRARY, items as any);

  assert.equal(world.dialogs.length, 1);
  assert.match(world.dialogs[0], /Algorithms\/Walks/);
  assert.match(world.dialogs[0], /Paper 0/);
  const walks = world.saved.find((c) => c.name === "Walks")!;
  assert.equal(walks.parentID, 1);
  assert.ok(items.every((item) => item.collections.includes(walks.id)));
  assert.equal(pref("pendingProposals"), "{}");
  assert.match(world.alerts[0], /Algorithms\/Walks/);
  assert.match(world.alerts[0], /3/);
});

test("skips deleted items when moving", async () => {
  const items = addItems(4);
  suggest(items);
  items[1].deleted = true;

  await reviewSuggestions(LIBRARY, items as any);

  const walks = world.saved.find((c) => c.name === "Walks")!;
  assert.deepEqual(
    items.map((i) => i.collections.includes(walks.id)),
    [true, false, true, true]
  );
});

test("'Not now' keeps the suggestion and asks again only after it grows", async () => {
  world.choice = 1;
  const items = addItems(3);
  suggest(items);
  await reviewSuggestions(LIBRARY, items as any);
  assert.equal(world.dialogs.length, 1);
  assert.equal(
    world.saved.some((c) => c.name === "Walks"),
    false
  );

  await reviewSuggestions(LIBRARY, items as any);
  assert.equal(world.dialogs.length, 1);

  const more = addItems(1);
  suggest(more);
  await reviewSuggestions(LIBRARY, more as any);
  assert.equal(world.dialogs.length, 2);
});

test("'Don't suggest again' stops the suggestion for good", async () => {
  world.choice = 2;
  const items = addItems(3);
  suggest(items);
  await reviewSuggestions(LIBRARY, items as any);

  const more = addItems(2);
  suggest(more);
  await reviewSuggestions(LIBRARY, more as any);

  assert.equal(world.dialogs.length, 1);
  assert.equal(
    world.saved.some((c) => c.name === "Walks"),
    false
  );
  assert.deepEqual(getProposalOptions(LIBRARY)!.openPaths, []);
});

test("does not create a collection that appeared in the meantime", async () => {
  world.choice = 1;
  const items = addItems(3);
  suggest(items);
  await reviewSuggestions(LIBRARY, items as any);

  await addCollections("Algorithms/Walks");
  world.choice = 0;
  const more = addItems(1);
  suggest(more, { parentID: 1, name: "Walks" });
  await reviewSuggestions(LIBRARY, more as any);

  assert.equal(world.saved.filter((c) => c.name === "Walks").length, 1);
});

test("items filed by hand leave the suggestion", async () => {
  const items = addItems(2);
  suggest(items);
  await reviewSuggestions(LIBRARY, items as any);

  items[0].collections = [2];
  await reviewSuggestions(LIBRARY, items as any);

  const store = stored();
  assert.deepEqual(Object.keys(store["Algorithms/Walks"].items), ["K1"]);
});

test("offers parents within the depth limit and the open suggestions", async () => {
  const items = addItems(1);
  suggest(items);
  await reviewSuggestions(LIBRARY, items as any);

  const options = getProposalOptions(LIBRARY)!;

  assert.deepEqual(options.parents, [{ id: 1, path: "Algorithms" }]);
  assert.deepEqual(options.openPaths, ["Algorithms/Walks"]);
  assert.equal(options.maxDepth, 2);
  assert.equal(options.allowTopLevel, false);
});

test("excluded collections are absent from possible parents and cannot receive suggestions", async () => {
  world.prefs[`${PREFIX}.enabledCollections`] = "[]";
  const items = addItems(3);
  suggest(items);
  await reviewSuggestions(LIBRARY, items as any);

  assert.deepEqual(getProposalOptions(LIBRARY)?.parents ?? [], []);
  assert.deepEqual(world.dialogs, []);
  assert.equal(
    world.saved.some((c) => c.name === "Walks"),
    false
  );
});

test("selecting one branch keeps an excluded sibling out of proposal prompts and validation", async () => {
  await addCollections("Hardware");
  world.prefs[`${PREFIX}.enabledCollections`] = "[1,2]";
  assert.deepEqual(getProposalOptions(LIBRARY)!.parents, [
    { id: 1, path: "Algorithms" },
  ]);
  const items = addItems(3);
  suggest(items, { parentID: 3, name: "Chips" });
  await reviewSuggestions(LIBRARY, items as any);
  assert.deepEqual(stored(), {});
  assert.deepEqual(world.dialogs, []);
});

test("historical items filed outside the current batch leave pending suggestions before the threshold check", async () => {
  const old = addItems(2);
  suggest(old);
  await reviewSuggestions(LIBRARY, old as any);
  old[0].collections = [2];
  const fresh = addItems(1);
  suggest(fresh);
  await reviewSuggestions(LIBRARY, fresh as any);

  assert.deepEqual(world.dialogs, []);
  assert.equal(
    world.saved.some((c) => c.name === "Walks"),
    false
  );
});

test("accepting a proposal skips items filed while its dialog was open", async () => {
  const items = addItems(4);
  suggest(items);
  (globalThis as any).Services.prompt.confirmEx = () => {
    items[0].collections = [2];
    return 0;
  };
  await reviewSuggestions(LIBRARY, items as any);
  const walks = world.saved.find((c) => c.name === "Walks")!;
  assert.ok(walks);
  assert.deepEqual(items[0].collections, [2]);
  assert.ok(
    items.slice(1).every((item) => item.collections.includes(walks.id))
  );
});

test("each library counts and presents only its own pending suggestions", async () => {
  world.prefs[`${PREFIX}.allowNewTopLevel`] = true;
  const first = addItems(2);
  suggest(first, { parentID: null as any, name: "New topic" });
  await reviewSuggestions(LIBRARY, first as any);

  const second = addItems(1);
  second[0].libraryID = 2;
  suggest(second, { parentID: null as any, name: "New topic" });
  await reviewSuggestions(2, second as any);

  assert.deepEqual(world.dialogs, []);
  assert.deepEqual(getProposalOptions(LIBRARY)!.openPaths, ["New topic"]);
  assert.deepEqual(getProposalOptions(2)!.openPaths, ["New topic"]);
});

test("accepting one library's proposal preserves another library even when item keys coincide", async () => {
  world.prefs[`${PREFIX}.allowNewTopLevel`] = true;
  const first = addItems(2);
  suggest(first, { parentID: null as any, name: "New topic" });
  await reviewSuggestions(LIBRARY, first as any);
  const second = addItems(3);
  second.forEach((item) => (item.libraryID = 2));
  second[0].key = first[0].key;
  suggest(second, { parentID: null as any, name: "New topic" });
  await reviewSuggestions(2, second as any);

  const collection = world.saved.find((c) => c.name === "New topic")!;
  assert.equal(collection.libraryID, 2);
  assert.ok(first.every((item) => item.collections.length === 0));
  assert.ok(second.every((item) => item.collections.includes(collection.id)));
  assert.equal(Object.keys(stored()["New topic"].items).length, 2);
  assert.deepEqual(stored(2), {});
});

test("concurrent reviews retain suggestions from both runs", async () => {
  world.choice = 1;
  const items = addItems(3);
  const first: SuggestionMap = new Map([
    [items[0].id, { parentID: 1, name: "Walks" }],
  ]);
  const second: SuggestionMap = new Map(
    items.slice(1).map((item) => [item.id, { parentID: 1, name: "Walks" }])
  );
  await Promise.all([
    reviewRun(LIBRARY, [items[0]] as any, first),
    reviewRun(LIBRARY, items.slice(1) as any, second),
  ]);
  assert.equal(Object.keys(stored()["Algorithms/Walks"].items).length, 3);
  assert.equal(world.dialogs.length, 1);
});

test("rechecks the threshold after the proposal dialog closes", async () => {
  const items = addItems(3);
  suggest(items);
  (globalThis as any).Services.prompt.confirmEx = () => {
    items[0].collections = [2];
    return 0;
  };
  await reviewSuggestions(LIBRARY, items as any);
  assert.equal(
    world.saved.some((c) => c.name === "Walks"),
    false
  );
  assert.deepEqual(Object.keys(stored()["Algorithms/Walks"].items), [
    "K1",
    "K2",
  ]);
});

test("creation follows the parent ID when it is renamed while the dialog is open", async () => {
  const items = addItems(3);
  suggest(items);
  (globalThis as any).Services.prompt.confirmEx = () => {
    world.saved[0].name = "Methods";
    return 0;
  };
  await reviewSuggestions(LIBRARY, items as any);
  assert.equal(world.saved.find((c) => c.name === "Walks")!.parentID, 1);
  assert.match(world.alerts[0], /Methods\/Walks/);
});

test("a failed save rolls back creation and filing, and the retained proposal can be retried", async () => {
  const items = addItems(3);
  suggest(items);
  items[1].save = async () => {
    throw new Error("save failed");
  };
  await assert.rejects(reviewSuggestions(LIBRARY, items as any), /save failed/);
  assert.match(world.alerts[0], /save failed/);
  assert.equal(
    world.saved.some((c) => c.name === "Walks"),
    false
  );
  assert.ok(items.every((item) => item.collections.length === 0));
  assert.equal(Object.keys(stored()["Algorithms/Walks"].items).length, 3);

  items[1].save = async () => {};
  await reviewSuggestions(LIBRARY, []);
  const collection = world.saved.find((c) => c.name === "Walks")!;
  assert.ok(items.every((item) => item.collections.includes(collection.id)));
});

test("a dismissed topic remains dismissed after its earlier items are filed", async () => {
  world.choice = 2;
  const items = addItems(3);
  suggest(items);
  await reviewSuggestions(LIBRARY, items as any);
  items.forEach((item) => (item.collections = [2]));
  await reviewSuggestions(LIBRARY, []);
  world.choice = 0;
  const fresh = addItems(3);
  suggest(fresh);
  await reviewSuggestions(LIBRARY, fresh as any);
  assert.equal(world.dialogs.length, 1);
  assert.equal(
    world.saved.some((c) => c.name === "Walks"),
    false
  );
});

test("an existing match keeps a simultaneous new-collection suggestion out of the pending store", async () => {
  const items = addItems(3);
  for (const item of items) {
    recordSuggestion(
      item as any,
      {
        collectionIDs: [2],
        collections: [],
        newCollection: { parentID: 1, name: "Walks" },
      },
      suggestions
    );
  }
  await reviewSuggestions(LIBRARY, items as any);
  assert.deepEqual(stored(), {});
  assert.deepEqual(world.dialogs, []);
});
