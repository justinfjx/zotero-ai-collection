import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCollectionNodes,
  flattenNodes,
  getLeafOptions,
} from "../src/modules/collectionTree.ts";

type FakeCollection = {
  id: number;
  name: string;
  parentID: number | null;
  getChildCollections: () => FakeCollection[];
};

function collection(
  id: number,
  name: string,
  parentID: number | null = null,
  children: FakeCollection[] = []
): FakeCollection {
  return { id, name, parentID, getChildCollections: () => children };
}

// A
// ├── B
// │   └── C
// └── D
// E
const c = collection(3, "C", 2);
const b = collection(2, "B", 1, [c]);
const d = collection(4, "D", 1);
const a = collection(1, "A", null, [b, d]);
const e = collection(5, "E");
const library = [a, b, c, d, e] as unknown as Zotero.Collection[];

function leafPaths(maxDepth?: number): string[] {
  return buildCollectionNodes(library, maxDepth)
    .flatMap(getLeafOptions)
    .map((option) => option.path);
}

test("without a depth limit the leaves are the deepest collections", () => {
  assert.deepEqual(leafPaths(), ["A/B/C", "A/D", "E"]);
  assert.deepEqual(leafPaths(0), ["A/B/C", "A/D", "E"]);
});

test("a depth limit turns collections at that depth into leaves", () => {
  assert.deepEqual(leafPaths(2), ["A/B", "A/D", "E"]);
});

test("a depth limit of 1 keeps only top-level collections", () => {
  assert.deepEqual(leafPaths(1), ["A", "E"]);
});

test("a limit deeper than the tree changes nothing", () => {
  assert.deepEqual(leafPaths(10), ["A/B/C", "A/D", "E"]);
});

test("nodes record their path segments and ancestors", () => {
  const nodes = flattenNodes(buildCollectionNodes(library));
  const deepest = nodes.find((node) => node.option.path === "A/B/C");
  assert.deepEqual(deepest?.option.segments, ["A", "B", "C"]);
  assert.deepEqual(
    deepest?.option.ancestors.map((ancestor) => ancestor.name),
    ["A", "B"]
  );
});

test("only top-level collections start a tree", () => {
  assert.deepEqual(
    buildCollectionNodes(library).map((node) => node.option.path),
    ["A", "E"]
  );
});
