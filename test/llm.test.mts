import test from "node:test";
import assert from "node:assert/strict";
import { APICallError, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import {
  generateJSON,
  toBaseURL,
  type LLMConfig,
  type ProviderKind,
} from "../src/modules/llm.ts";
import { startFakeLLM } from "./fakeLLM.mts";

const schema = z.object({ collectionIDs: z.array(z.number()) });
const answer = { collectionIDs: [101, 205] };

const providers: ProviderKind[] = ["anthropic", "openai-compatible"];

function configFor(provider: ProviderKind, serverURL: string): LLMConfig {
  return {
    provider,
    baseURL: `${serverURL}/v1`,
    apiKey: "test-key",
    model: "test-model",
  };
}

for (const provider of providers) {
  test(`${provider}: returns the parsed object and sends model, prompts and key`, async () => {
    const fake = await startFakeLLM(answer);
    try {
      const result = await generateJSON(
        configFor(provider, fake.baseURL),
        "SYSTEM-PROMPT",
        "USER-PROMPT",
        schema
      );

      assert.deepEqual(result, answer);
      assert.equal(fake.requests.length, 1);
      const request = fake.requests[0];
      assert.equal(request.body.model, "test-model");
      assert.match(JSON.stringify(request.body), /SYSTEM-PROMPT/);
      assert.match(JSON.stringify(request.body), /USER-PROMPT/);
      const credential =
        request.headers["x-api-key"] ?? request.headers.authorization;
      assert.match(String(credential), /test-key/);
    } finally {
      await fake.close();
    }
  });

  test(`${provider}: an HTTP error rejects with the status code`, async () => {
    const fake = await startFakeLLM(answer, 500);
    try {
      await assert.rejects(
        generateJSON(
          configFor(provider, fake.baseURL),
          "system",
          "prompt",
          schema
        ),
        (error) => APICallError.isInstance(error) && error.statusCode === 500
      );
    } finally {
      await fake.close();
    }
  });

  test(`${provider}: an answer that breaks the schema rejects`, async () => {
    const fake = await startFakeLLM({ collectionIDs: "not-an-array" });
    try {
      await assert.rejects(
        generateJSON(
          configFor(provider, fake.baseURL),
          "system",
          "prompt",
          schema
        ),
        (error) => NoObjectGeneratedError.isInstance(error)
      );
    } finally {
      await fake.close();
    }
  });
}

test("toBaseURL strips known endpoint suffixes and trailing slashes", () => {
  assert.equal(
    toBaseURL("https://api.openai.com/v1/chat/completions"),
    "https://api.openai.com/v1"
  );
  assert.equal(
    toBaseURL(" https://api.anthropic.com/v1/messages/ "),
    "https://api.anthropic.com/v1"
  );
  assert.equal(
    toBaseURL("http://localhost:11434/v1/"),
    "http://localhost:11434/v1"
  );
  assert.equal(toBaseURL("https://example.com/api"), "https://example.com/api");
});

test("OpenAI-compatible JSON generation also works on plain Chat Completions servers", async () => {
  const fake = await startFakeLLM(answer, 200, { rejectResponseFormat: true });
  try {
    const result = await generateJSON(
      configFor("openai-compatible", fake.baseURL),
      "system",
      "prompt",
      schema
    );
    assert.deepEqual(result, answer);
    assert.equal(fake.requests.length, 1);
    assert.equal(fake.requests[0].body.response_format, undefined);
    assert.match(
      JSON.stringify(fake.requests[0].body.messages),
      /collectionIDs/
    );
  } finally {
    await fake.close();
  }
});

test("validates JSON returned inside a Markdown fence", async () => {
  const fake = await startFakeLLM(answer, 200, {
    text: "```json\n" + JSON.stringify(answer) + "\n```",
  });
  try {
    assert.deepEqual(
      await generateJSON(
        configFor("openai-compatible", fake.baseURL),
        "system",
        "prompt",
        schema
      ),
      answer
    );
  } finally {
    await fake.close();
  }
});
