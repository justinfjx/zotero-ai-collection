import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createMissingCollections,
  getCollectionsByPath,
} from "../src/modules/collectionWriter.ts";

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

  async saveTx() {
    this.id = saved.length + 1;
    saved.push(this);
    const parent = saved.find((c) => c.id === this.parentID);
    parent?.children.push(this);
  }
}

let saved: FakeCollection[] = [];

beforeEach(() => {
  saved = [];
  (globalThis as any).Zotero = {
    Collection: FakeCollection,
    Collections: {
      getByLibrary: () => saved.filter((c) => !c.parentID),
    },
  };
});

test("creates missing collections and links children to their parents", async () => {
  const created = await createMissingCollections(1, ["A", "A/B", "C"]);

  assert.deepEqual(created, ["A", "A/B", "C"]);
  const [a, b] = saved;
  assert.equal(b.parentID, a.id);
  assert.equal(saved[2].parentID, undefined);
  assert.ok(saved.every((c) => c.libraryID === 1));
});

test("skips collections that already exist", async () => {
  await createMissingCollections(1, ["A"]);
  const created = await createMissingCollections(1, ["A", "A/B"]);

  assert.deepEqual(created, ["A/B"]);
  assert.equal(saved.length, 2);
});

test("is idempotent", async () => {
  await createMissingCollections(1, ["A", "A/B"]);
  assert.deepEqual(await createMissingCollections(1, ["A", "A/B"]), []);
});

test("rejects a path whose parent does not exist", async () => {
  await assert.rejects(
    createMissingCollections(1, ["A/B"]),
    /Parent collection is missing for A\/B/
  );
  assert.equal(saved.length, 0);
});

test("getCollectionsByPath includes nested collections", async () => {
  await createMissingCollections(1, ["A", "A/B", "A/B/C"]);
  assert.deepEqual(Array.from(getCollectionsByPath(1).keys()), [
    "A",
    "A/B",
    "A/B/C",
  ]);
});
