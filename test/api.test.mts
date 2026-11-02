import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { callAI, type ProposalOptions } from "../src/modules/api.ts";
import { startFakeLLM } from "./fakeLLM.mts";

const PREFIX = "extensions.zotero.zoteroaicollection";
const candidates = [{ id: 101, path: "A/B" }];

let prefs: Record<string, unknown> = {};

function setPrefs(values: Record<string, unknown>) {
  prefs = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [`${PREFIX}.${key}`, value])
  );
}

beforeEach(() => {
  (globalThis as any).Zotero = {
    Prefs: { get: (key: string) => prefs[key] },
    getMainWindow: () => globalThis,
  };
});

afterEach(() => {
  delete (globalThis as any).Zotero;
});

test("calls an OpenAI-compatible endpoint saved as a full URL", async () => {
  const fake = await startFakeLLM({ collectionIDs: [101] });
  try {
    setPrefs({
      provider: "openai-compatible",
      apiUrl: `${fake.baseURL}/v1/chat/completions`,
      apiKey: "key",
      model: "m",
    });

    const result = await callAI("Title", "Abstract", candidates);

    assert.deepEqual(result.collectionIDs, [101]);
    assert.equal(fake.requests[0].path, "/v1/chat/completions");
    assert.match(JSON.stringify(fake.requests[0].body), /\[101\] A\/B/);
  } finally {
    await fake.close();
  }
});

test("calls Anthropic when the provider is anthropic", async () => {
  const fake = await startFakeLLM({ collectionIDs: [101] });
  try {
    setPrefs({
      provider: "anthropic",
      apiUrl: `${fake.baseURL}/v1/messages`,
      apiKey: "key",
      model: "m",
    });

    const result = await callAI("Title", "Abstract", candidates);

    assert.deepEqual(result.collectionIDs, [101]);
    assert.equal(fake.requests[0].path, "/v1/messages");
    assert.equal(fake.requests[0].headers["x-api-key"], "key");
  } finally {
    await fake.close();
  }
});

test("defaults to the OpenAI-compatible provider", async () => {
  const fake = await startFakeLLM({ collectionIDs: [] });
  try {
    setPrefs({ apiUrl: `${fake.baseURL}/v1`, apiKey: "key", model: "m" });
    await callAI("Title", "Abstract", candidates);
    assert.equal(fake.requests[0].path, "/v1/chat/completions");
  } finally {
    await fake.close();
  }
});

test("normalizes ids and paths returned by the model", async () => {
  const fake = await startFakeLLM({ collectionIDs: [101, "202", "A/B"] });
  try {
    setPrefs({ apiUrl: `${fake.baseURL}/v1`, apiKey: "key", model: "m" });
    const result = await callAI("Title", "Abstract", candidates);
    assert.deepEqual(result.collectionIDs, [101, 202]);
    assert.deepEqual(result.collections, ["A/B"]);
  } finally {
    await fake.close();
  }
});

test("returns the Chinese title when translation is requested", async () => {
  const fake = await startFakeLLM({ collectionIDs: [], chineseTitle: "标题" });
  try {
    setPrefs({ apiUrl: `${fake.baseURL}/v1`, apiKey: "key", model: "m" });
    const result = await callAI("Title", "Abstract", candidates, true);
    assert.equal(result.chineseTitle, "标题");
    assert.match(JSON.stringify(fake.requests[0].body), /chineseTitle/);
  } finally {
    await fake.close();
  }
});

test("requires an endpoint and a key", async () => {
  setPrefs({ model: "m" });
  await assert.rejects(
    callAI("Title", "Abstract", candidates),
    /API URL and API Key/
  );
});

const proposalOptions: ProposalOptions = {
  parents: [{ id: 7, path: "Hardware" }],
  allowTopLevel: false,
  maxDepth: 2,
  openPaths: ["Hardware/Chips"],
};

test("asks for a new collection only when proposals are enabled", async () => {
  const fake = await startFakeLLM({ collectionIDs: [] });
  try {
    setPrefs({ apiUrl: `${fake.baseURL}/v1`, apiKey: "key", model: "m" });

    await callAI("Title", "Abstract", candidates);
    await callAI("Title", "Abstract", candidates, false, proposalOptions);

    const [without, withProposals] = fake.requests.map((request) =>
      JSON.stringify(request.body)
    );
    assert.doesNotMatch(without, /newCollection/);
    assert.match(withProposals, /newCollection/);
    assert.match(withProposals, /\[7\] Hardware/);
    assert.match(withProposals, /Hardware\/Chips/);
    assert.match(withProposals, /not be deeper than level 2/);
    assert.match(withProposals, /top-level collections are not allowed/);
  } finally {
    await fake.close();
  }
});

test("allowing top-level collections changes the instruction", async () => {
  const fake = await startFakeLLM({ collectionIDs: [] });
  try {
    setPrefs({ apiUrl: `${fake.baseURL}/v1`, apiKey: "key", model: "m" });
    await callAI("T", "A", candidates, false, {
      ...proposalOptions,
      allowTopLevel: true,
      maxDepth: 0,
    });
    const sent = JSON.stringify(fake.requests[0].body);
    assert.match(sent, /or null to create a top-level collection/);
    assert.doesNotMatch(sent, /not be deeper than/);
  } finally {
    await fake.close();
  }
});

test("returns a suggested new collection, and none when the model sends null", async () => {
  const suggestion = { parentID: 7, name: "Chips" };
  const withSuggestion = await startFakeLLM({
    collectionIDs: [],
    newCollection: suggestion,
  });
  const withNull = await startFakeLLM({
    collectionIDs: [],
    newCollection: null,
  });
  try {
    setPrefs({
      apiUrl: `${withSuggestion.baseURL}/v1`,
      apiKey: "key",
      model: "m",
    });
    const first = await callAI("T", "A", candidates, false, proposalOptions);
    assert.deepEqual(first.newCollection, suggestion);

    setPrefs({ apiUrl: `${withNull.baseURL}/v1`, apiKey: "key", model: "m" });
    const second = await callAI("T", "A", candidates, false, proposalOptions);
    assert.equal(second.newCollection, undefined);
  } finally {
    await withSuggestion.close();
    await withNull.close();
  }
});
