import test from "node:test";
import assert from "node:assert/strict";
import {
  addToStore,
  checkProposal,
  dismiss,
  markPrompted,
  openPaths,
  parseStore,
  parseLibraryStores,
  readyProposals,
  removeItems,
  removeProposal,
  type CollectionRef,
  type ProposalLimits,
  type ProposalStore,
} from "../src/modules/proposals.ts";

const collections: CollectionRef[] = [
  { id: 1, path: "Algorithms" },
  { id: 2, path: "Algorithms/Core" },
  { id: 3, path: "Hardware" },
];
const limits: ProposalLimits = { maxDepth: 2, allowTopLevel: false };

test("accepts a new collection under an existing parent", () => {
  assert.deepEqual(
    checkProposal({ parentID: 1, name: " Walks " }, collections, limits),
    { ok: true, path: "Algorithms/Walks", parentID: 1 }
  );
});

test("rejects names that are empty, too long or contain the separator", () => {
  const reason = (name: string) => {
    const check = checkProposal({ parentID: 1, name }, collections, limits);
    return check.ok ? "ok" : check.reason;
  };
  assert.equal(reason("   "), "empty name");
  assert.equal(reason("x".repeat(61)), "name too long");
  assert.match(reason("A/B"), /contains \//);
});

test("rejects a parent that does not exist", () => {
  const check = checkProposal({ parentID: 99, name: "X" }, collections, limits);
  assert.deepEqual(check, { ok: false, reason: "parent does not exist" });
});

test("top-level proposals need allowTopLevel", () => {
  const proposal = { parentID: null, name: "Software" };
  assert.deepEqual(checkProposal(proposal, collections, limits), {
    ok: false,
    reason: "new top-level collections are not allowed",
  });
  assert.deepEqual(
    checkProposal(proposal, collections, { ...limits, allowTopLevel: true }),
    { ok: true, path: "Software", parentID: null }
  );
});

test("enforces the depth limit, and 0 means unlimited", () => {
  const proposal = { parentID: 2, name: "Deep" };
  assert.deepEqual(checkProposal(proposal, collections, limits), {
    ok: false,
    reason: "deeper than 2 levels",
  });
  assert.equal(
    checkProposal(proposal, collections, { ...limits, maxDepth: 0 }).ok,
    true
  );
});

test("rejects a collection that already exists, ignoring case and spacing", () => {
  const check = checkProposal(
    { parentID: 1, name: "  core " },
    collections,
    limits
  );
  assert.deepEqual(check, { ok: false, reason: "already exists" });
});

const proposal = { parentID: 1, name: "Walks" };

function storeWith(count: number, path = "Algorithms/Walks"): ProposalStore {
  let store: ProposalStore = {};
  for (let i = 0; i < count; i++) {
    store = addToStore(store, path, proposal, `K${i}`, `Title ${i}`);
  }
  return store;
}

test("collects items under a proposal", () => {
  const store = storeWith(2);
  assert.deepEqual(store["Algorithms/Walks"], {
    parentID: 1,
    name: "Walks",
    items: { K0: "Title 0", K1: "Title 1" },
    prompted: 0,
    dismissed: false,
  });
});

test("an item belongs to only one proposal", () => {
  let store = storeWith(2);
  store = addToStore(
    store,
    "Hardware/Chips",
    { parentID: 3, name: "Chips" },
    "K0",
    "Title 0"
  );
  assert.deepEqual(Object.keys(store["Algorithms/Walks"].items), ["K1"]);
  assert.deepEqual(Object.keys(store["Hardware/Chips"].items), ["K0"]);
});

test("a proposal is ready once it has enough new items", () => {
  assert.deepEqual(readyProposals(storeWith(2), 3), []);
  assert.deepEqual(readyProposals(storeWith(3), 3), ["Algorithms/Walks"]);
});

test("after asking, it is ready again only when it grows", () => {
  let store = markPrompted(storeWith(3), "Algorithms/Walks");
  assert.deepEqual(readyProposals(store, 3), []);
  store = addToStore(store, "Algorithms/Walks", proposal, "K9", "More");
  assert.deepEqual(readyProposals(store, 3), ["Algorithms/Walks"]);
});

test("a dismissed proposal is never ready and is not offered to the AI", () => {
  const store = dismiss(storeWith(5), "Algorithms/Walks");
  assert.deepEqual(readyProposals(store, 3), []);
  assert.deepEqual(openPaths(store), []);
  assert.deepEqual(openPaths(storeWith(1)), ["Algorithms/Walks"]);
});

test("removeItems drops emptied proposals; removeProposal drops one", () => {
  assert.deepEqual(removeItems(storeWith(2), ["K0", "K1"]), {});
  assert.deepEqual(
    Object.keys(removeItems(storeWith(2), ["K0"])["Algorithms/Walks"].items),
    ["K1"]
  );
  assert.deepEqual(removeProposal(storeWith(2), "Algorithms/Walks"), {});
});

test("operations do not modify the store they were given", () => {
  const store = storeWith(2);
  const snapshot = JSON.stringify(store);
  addToStore(store, "Algorithms/Walks", proposal, "K7", "x");
  markPrompted(store, "Algorithms/Walks");
  dismiss(store, "Algorithms/Walks");
  removeItems(store, ["K0"]);
  assert.equal(JSON.stringify(store), snapshot);
});

test("parseStore tolerates missing and invalid text", () => {
  assert.deepEqual(parseStore(undefined), {});
  assert.deepEqual(parseStore(""), {});
  assert.deepEqual(parseStore("not json"), {});
  assert.deepEqual(parseStore("[1]"), {});
  const store = storeWith(1);
  assert.deepEqual(parseStore(JSON.stringify(store)), store);
});

test("a dismissed topic stays dismissed after all of its items are removed", () => {
  const empty = removeItems(dismiss(storeWith(1), "Algorithms/Walks"), ["K0"]);
  const grown = addToStore(
    empty,
    "Algorithms/Walks",
    proposal,
    "NEW",
    "New paper"
  );
  assert.deepEqual(readyProposals(grown, 1), []);
  assert.equal(grown["Algorithms/Walks"].dismissed, true);
});

test("reads separate library stores and keeps the unscoped format in My Library", () => {
  const store = storeWith(1);
  assert.deepEqual(parseLibraryStores(JSON.stringify(store), 1), { 1: store });
  const libraries = { 1: store, 2: storeWith(2) };
  assert.deepEqual(
    parseLibraryStores(JSON.stringify({ version: 1, libraries }), 1),
    libraries
  );
  assert.deepEqual(parseLibraryStores("not json", 1), {});
});

test("malformed stored entries are ignored individually", () => {
  const store = storeWith(1);
  assert.deepEqual(
    parseStore(JSON.stringify({ ...store, broken: { items: null } })),
    store
  );
});

test("collection names that match object property names are stored normally", () => {
  const store = addToStore(
    {},
    "constructor",
    { parentID: null, name: "constructor" },
    "K1",
    "Paper"
  );
  assert.equal(store.constructor.name, "constructor");
  assert.deepEqual(Object.keys(store.constructor.items), ["K1"]);
});
