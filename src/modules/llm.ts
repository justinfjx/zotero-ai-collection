import {
  extractJsonMiddleware,
  generateText,
  Output,
  wrapLanguageModel,
  type FlexibleSchema,
} from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const MAX_OUTPUT_TOKENS = 4096;

export type ProviderKind = "anthropic" | "openai-compatible";

export interface LLMConfig {
  provider: ProviderKind;
  /** API root including the version path, e.g. https://api.anthropic.com/v1 */
  baseURL: string;
  apiKey: string;
  model: string;
  /** Custom fetch, used by tests */
  fetch?: typeof fetch;
}

/**
 * Create a language model for the configured provider
 * @param config - Provider settings
 * @returns An AI SDK language model
 */
export function createModel(config: LLMConfig) {
  const { baseURL, apiKey, model, fetch } = config;
  if (config.provider === "anthropic") {
    return createAnthropic({ baseURL, apiKey, fetch })(model);
  }
  return wrapLanguageModel({
    model: createOpenAICompatible({
      name: "openai-compatible",
      baseURL,
      apiKey,
      fetch,
    })(model),
    middleware: [
      {
        specificationVersion: "v4",
        transformParams: async ({ params }) => {
          if (params.responseFormat?.type !== "json") {
            return params;
          }
          // Saved profiles also target servers with prompt-based JSON support.
          // Keep that request contract; Output.object still validates the answer.
          return {
            ...params,
            responseFormat: { type: "text" },
            prompt: [
              {
                role: "system",
                content: `Return only a JSON object matching this schema:\n${JSON.stringify(
                  params.responseFormat.schema
                )}`,
              },
              ...params.prompt,
            ],
          };
        },
      },
      extractJsonMiddleware(),
    ],
  });
}

/**
 * Ask the model for an object and validate it against a schema
 * @param config - Provider settings
 * @param system - System prompt
 * @param prompt - User prompt
 * @param schema - Zod schema (or AI SDK schema) the answer must satisfy
 * @returns The validated answer; rejects if the answer does not match
 */
export async function generateJSON<T>(
  config: LLMConfig,
  system: string,
  prompt: string,
  schema: FlexibleSchema<T>
): Promise<T> {
  const { output } = await generateText({
    model: createModel(config),
    system,
    prompt,
    output: Output.object({ schema }),
    temperature: 0,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: 0,
    timeout: 60000,
  });
  return output;
}

/**
 * Turn a stored endpoint into the API root the SDK expects.
 * Profiles saved by earlier versions hold a full URL such as
 * https://api.openai.com/v1/chat/completions.
 * @param endpoint - API root or full endpoint URL
 * @returns The API root, e.g. https://api.openai.com/v1
 */
export function toBaseURL(endpoint: string): string {
  return endpoint
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/(chat\/completions|messages)$/, "");
}
