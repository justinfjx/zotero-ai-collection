import test from "node:test";
import assert from "node:assert/strict";
import { parseCollectionSelection } from "../src/modules/selection.ts";

test("keeps numeric IDs", () => {
  assert.deepEqual(parseCollectionSelection([101, 205]), {
    collectionIDs: [101, 205],
    collections: [],
  });
});

test("converts numeric strings to IDs and keeps other strings as paths", () => {
  assert.deepEqual(parseCollectionSelection(["101", " A/B ", "  "]), {
    collectionIDs: [101],
    collections: ["A/B"],
  });
});

test("removes duplicates", () => {
  assert.deepEqual(parseCollectionSelection([1, "1", 1, "A", "A"]), {
    collectionIDs: [1],
    collections: ["A"],
  });
});

test("ignores non-finite numbers and other types", () => {
  assert.deepEqual(parseCollectionSelection([NaN, Infinity, null, {}, 7]), {
    collectionIDs: [7],
    collections: [],
  });
});

test("returns empty selections for non-arrays", () => {
  const empty = { collectionIDs: [], collections: [] };
  assert.deepEqual(parseCollectionSelection(undefined), empty);
  assert.deepEqual(parseCollectionSelection("101"), empty);
  assert.deepEqual(parseCollectionSelection({ 0: 1 }), empty);
});
