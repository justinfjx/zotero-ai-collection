import { z } from "zod";
import { getPref } from "../utils/prefs";
import { exposeWebGlobals } from "../utils/webGlobals";
import { DEFAULT_PROMPT } from "../utils/constants";
import type { ProviderKind } from "./llm";
import type { NewCollectionProposal } from "./proposals";
import { parseCollectionSelection } from "./selection";

export interface AICollectionCandidate {
  id: number;
  path: string;
}

export interface AIClassificationResult {
  collectionIDs: number[];
  collections: string[];
  chineseTitle?: string;
  newCollection?: NewCollectionProposal;
}

/** What the AI needs to know to suggest a new collection */
export interface ProposalOptions {
  /** Existing collections a new collection can be placed under */
  parents: AICollectionCandidate[];
  allowTopLevel: boolean;
  /** Deepest level a new collection may have (0 = unlimited) */
  maxDepth: number;
  /** Paths already suggested, to be reused when the topic matches */
  openPaths: string[];
}

const baseSchema = z.object({
  collectionIDs: z.array(z.union([z.number(), z.string()])),
  chineseTitle: z.string().optional(),
});

// Only sent when the AI may suggest a new collection
const proposalSchema = baseSchema.extend({
  newCollection: z
    .object({ parentID: z.number().nullable(), name: z.string() })
    .nullish(),
});

// Hidden format instruction - not editable by user
const FORMAT_INSTRUCTION = `Rules: each available collection is listed as [ID] path. Choose only collections that exist in the list and return their numeric IDs as an array in the collectionIDs field, not their paths. If no collection fits, return an empty array.`;

// Hidden translation instruction - appended when translation is enabled
const TRANSLATION_INSTRUCTION = `Also translate the paper title into Chinese and put it in the chineseTitle field.`;

/**
 * Build the instruction that lets the AI suggest a new collection
 * @param options - Limits for the suggestion
 * @returns The instruction text
 */
function buildProposalInstruction(options: ProposalOptions): string {
  const top = options.allowTopLevel
    ? ", or null to create a top-level collection"
    : ", top-level collections are not allowed";
  const depth =
    options.maxDepth > 0
      ? ` The new collection must not be deeper than level ${options.maxDepth}.`
      : "";
  return `For unmatched papers, this rule takes precedence over instructions to use existing collections only: you may suggest one new collection in the newCollection field. parentID is the ID of its parent (choose only from the "Possible parents" list${top}) and name is the new collection's name (short, without "/"). Suggest one only when nothing fits; otherwise omit newCollection.${depth}`;
}

/**
 * Build the part of the user prompt that lists parents and open suggestions
 * @param options - Limits for the suggestion
 * @returns The prompt text
 */
function buildProposalContext(options: ProposalOptions): string {
  const parents = options.parents.map((p) => `[${p.id}] ${p.path}`).join("\n");
  const open = options.openPaths.length
    ? `\n\nAlready suggested new collections (use the exact same name for the same topic):\n${options.openPaths.join(
        "\n"
      )}`
    : "";
  return `\n\nPossible parents:\n${parents}${open}`;
}

/**
 * Load the LLM layer. The AI SDK needs web stream globals that Zotero's plugin
 * sandbox lacks, so it is imported lazily, after they are copied from the main window.
 */
async function loadLLM() {
  exposeWebGlobals(Zotero.getMainWindow());
  return import("./llm");
}

/**
 * Call AI API for classification
 * @param title - Article title
 * @param abstract - Article abstract
 * @param collectionCandidates - Available collection IDs and display paths
 * @param includeTranslation - Whether to include Chinese title translation
 * @param proposals - When set, the AI may suggest one new collection
 * @returns Object with recommended collection paths and optional Chinese title
 */
export async function callAI(
  title: string,
  abstract: string,
  collectionCandidates: AICollectionCandidate[],
  includeTranslation = false,
  proposals?: ProposalOptions
): Promise<AIClassificationResult> {
  const apiUrl = getPref("apiUrl") as string;
  const model = getPref("model") as string;
  const apiKey = getPref("apiKey") as string;
  const provider = (getPref("provider") as ProviderKind) || "openai-compatible";
  const customPrompt = (getPref("customPrompt") as string) || DEFAULT_PROMPT;

  if (!apiUrl || !apiKey) {
    throw new Error("API URL and API Key must be configured in preferences");
  }

  const collectionListStr = collectionCandidates
    .map((candidate, i) => `${i + 1}. [${candidate.id}] ${candidate.path}`)
    .join("\n");

  // Build system prompt with user-editable part and hidden format instruction
  const systemPrompt = [
    customPrompt,
    FORMAT_INSTRUCTION,
    includeTranslation ? TRANSLATION_INSTRUCTION : "",
    proposals ? buildProposalInstruction(proposals) : "",
  ]
    .filter(Boolean)
    .join("\n");

  const userPrompt = `Title: ${title}
Abstract: ${abstract}

Available collections:
${collectionListStr}${proposals ? buildProposalContext(proposals) : ""}`;

  const schema: z.ZodType<z.infer<typeof proposalSchema>> = proposals
    ? proposalSchema
    : baseSchema;

  const { generateJSON, toBaseURL } = await loadLLM();
  const result = await generateJSON(
    { provider, baseURL: toBaseURL(apiUrl), apiKey, model },
    systemPrompt,
    userPrompt,
    schema
  );

  return {
    ...parseCollectionSelection(result.collectionIDs),
    chineseTitle: result.chineseTitle,
    newCollection: result.newCollection ?? undefined,
  };
}

/**
 * Test API connection
 * @returns Object with success status and message
 */
export async function testConnection(): Promise<{
  success: boolean;
  message?: string;
}> {
  try {
    const result = await callAI("Test Title", "Test Abstract", [
      { id: 1, path: "Test/Category" },
    ]);
    if (
      Array.isArray(result.collectionIDs) &&
      Array.isArray(result.collections)
    ) {
      return { success: true, message: "API response received successfully" };
    }
    return { success: false, message: "Unexpected response format" };
  } catch (e: any) {
    ztoolkit.log("API connection test failed:", e);
    return { success: false, message: e.message || "Unknown error" };
  }
}
