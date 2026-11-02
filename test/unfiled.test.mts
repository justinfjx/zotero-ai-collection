import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import {
  getUnfiledItems,
  registerUnfiledObserver,
  unregisterUnfiledObserver,
} from "../src/modules/unfiled.ts";

const PREFIX = "extensions.zotero.zoteroaicollection";
let notify: (event: string) => void;
let items: any[];
let searches: number;
let alerts: string[];
let errors: unknown[];
let holdSearch: Promise<void> | undefined;
let searchError: Error | undefined;
let enabled: boolean;
let conditions: unknown[][];

function addItems(count: number) {
  for (let i = 0; i < count; i++) {
    items.push({
      id: items.length + 1,
      libraryID: 1,
      deleted: false,
      isRegularItem: () => true,
    });
  }
}

beforeEach(() => {
  items = [];
  searches = 0;
  alerts = [];
  errors = [];
  conditions = [];
  holdSearch = undefined;
  searchError = undefined;
  enabled = true;
  const g = globalThis as any;
  g.addon = {
    data: {
      locale: { stringBundle: { GetStringFromName: (key: string) => key } },
    },
  };
  g.ztoolkit = { log: (...args: unknown[]) => errors.push(args) };
  g.Zotero = {
    Libraries: { userLibraryID: 1 },
    Prefs: {
      get: (key: string) =>
        key === `${PREFIX}.autoClassifyUnfiled` ? enabled : undefined,
    },
    Notifier: {
      registerObserver: (observer: { notify: typeof notify }) => {
        notify = observer.notify;
        return "test-observer";
      },
      unregisterObserver: () => {},
    },
    Search: class {
      addCondition(...condition: unknown[]) {
        conditions.push(condition);
      }
      async search() {
        searches++;
        if (searchError) {
          const error = searchError;
          searchError = undefined;
          throw error;
        }
        const ids = items.map((item) => item.id);
        await holdSearch;
        return ids;
      }
    },
    Items: {
      getAsync: async (ids: number[]) =>
        items.filter((item) => ids.includes(item.id)),
    },
    Collections: { getByLibrary: () => [] },
    getMainWindow: () => ({ alert: (message: string) => alerts.push(message) }),
  };
});

afterEach(() => {
  unregisterUnfiledObserver();
  for (const key of ["Zotero", "addon", "ztoolkit"])
    delete (globalThis as any)[key];
});

test("searches My Library for live regular unfiled items", async () => {
  addItems(3);
  items[1].deleted = true;
  items[2].isRegularItem = () => false;
  assert.deepEqual(
    (await getUnfiledItems()).map((item) => item.id),
    [1]
  );
  assert.deepEqual(conditions, [
    ["libraryID", "is", "1"],
    ["unfiled", "true"],
    ["noChildren", "true"],
  ]);
});

test("debounces additions and requires more than the threshold", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  registerUnfiledObserver();
  addItems(5);
  notify("modify");
  t.mock.timers.tick(10000);
  assert.equal(searches, 0);
  notify("add");
  t.mock.timers.tick(9000);
  notify("add");
  t.mock.timers.tick(9999);
  assert.equal(searches, 0);
  t.mock.timers.tick(1);
  await setImmediate();
  assert.equal(searches, 1);
  assert.equal(alerts.length, 0);
  addItems(1);
  notify("add");
  t.mock.timers.tick(10000);
  await setImmediate();
  assert.equal(alerts.length, 1);
});

test("queues additions during an active run and prevents overlapping searches", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  registerUnfiledObserver();
  addItems(6);
  let release!: () => void;
  holdSearch = new Promise<void>((resolve) => (release = resolve));
  notify("add");
  t.mock.timers.tick(10000);
  assert.equal(searches, 1);

  addItems(6);
  notify("add");
  t.mock.timers.tick(10000);
  assert.equal(searches, 1);

  holdSearch = undefined;
  release();
  await setImmediate();
  assert.equal(alerts.length, 1);
  t.mock.timers.tick(10000);
  await setImmediate();
  assert.equal(searches, 2);
  assert.equal(alerts.length, 2);

  notify("add");
  t.mock.timers.tick(10000);
  await setImmediate();
  assert.equal(alerts.length, 2);
});

test("unregistering during a search stops pending classification and reruns", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  registerUnfiledObserver();
  addItems(6);
  let release!: () => void;
  holdSearch = new Promise<void>((resolve) => (release = resolve));
  notify("add");
  t.mock.timers.tick(10000);
  notify("add");
  t.mock.timers.tick(10000);
  unregisterUnfiledObserver();
  release();
  await setImmediate();
  t.mock.timers.tick(10000);
  assert.equal(searches, 1);
  assert.deepEqual(alerts, []);
});

test("a failed search is reported and a later addition can trigger another run", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  registerUnfiledObserver();
  addItems(6);
  searchError = new Error("search failed");
  notify("add");
  t.mock.timers.tick(10000);
  await setImmediate();
  assert.equal(errors.length, 1);
  notify("add");
  t.mock.timers.tick(10000);
  await setImmediate();
  assert.equal(searches, 2);
  assert.equal(alerts.length, 1);
});

test("automatic classification stays idle when disabled", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  registerUnfiledObserver();
  enabled = false;
  addItems(6);
  notify("add");
  t.mock.timers.tick(10000);
  await setImmediate();
  assert.equal(searches, 0);
});
