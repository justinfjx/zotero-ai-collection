import { getPref } from "../utils/prefs";
import { DEFAULT_PROMPT } from "../utils/constants";

export interface AICollectionCandidate {
  id: number;
  path: string;
}

interface AIClassificationResult {
  collectionIDs: number[];
  collections: string[];
  chineseTitle?: string;
}

// Hidden format instruction - not editable by user
const FORMAT_INSTRUCTION = `规则：可用分类每行格式为 [分类ID] 分类路径。只能选择列表中已存在的分类ID，返回 JSON 数组，数组元素必须是数字ID，不要返回分类路径。
示例格式：
- 单个分类: [101]
- 多个分类: [101, 205, 309]
- 无合适分类: []`;

// Hidden translation instruction - appended when translation is enabled
const TRANSLATION_INSTRUCTION = `另外，请将文献标题翻译成中文，在返回的JSON中增加一个"chineseTitle"字段。
返回格式示例：
- 单个分类: {"collectionIDs": [101], "chineseTitle": "中文标题"}
- 多个分类: {"collectionIDs": [101, 205], "chineseTitle": "中文标题"}
- 无合适分类: {"collectionIDs": [], "chineseTitle": "中文标题"}`;

function parseCollectionSelection(value: unknown): {
  collectionIDs: number[];
  collections: string[];
} {
  const collectionIDs: number[] = [];
  const collections: string[] = [];

  if (!Array.isArray(value)) {
    return { collectionIDs, collections };
  }

  for (const item of value) {
    if (typeof item === "number" && Number.isFinite(item)) {
      collectionIDs.push(item);
      continue;
    }

    if (typeof item === "string") {
      const trimmed = item.trim();
      if (!trimmed) {
        continue;
      }

      if (/^\d+$/.test(trimmed)) {
        collectionIDs.push(Number(trimmed));
      } else {
        collections.push(trimmed);
      }
    }
  }

  return {
    collectionIDs: Array.from(new Set(collectionIDs)),
    collections: Array.from(new Set(collections)),
  };
}

function parseSelectionArrayFromContent(content: string): {
  collectionIDs: number[];
  collections: string[];
} {
  const arrayMatch = content.match(/\[[\s\S]*?\]/);
  if (!arrayMatch) {
    return { collectionIDs: [], collections: [] };
  }

  try {
    return parseCollectionSelection(JSON.parse(arrayMatch[0]));
  } catch {
    return { collectionIDs: [], collections: [] };
  }
}

/**
 * Call AI API for classification
 * @param title - Article title
 * @param abstract - Article abstract
 * @param collectionCandidates - Available collection IDs and display paths
 * @param includeTranslation - Whether to include Chinese title translation
 * @returns Object with recommended collection paths and optional Chinese title
 */
export async function callAI(
  title: string,
  abstract: string,
  collectionCandidates: AICollectionCandidate[],
  includeTranslation: boolean = false
): Promise<AIClassificationResult> {
  const apiUrl = getPref("apiUrl") as string;
  const model = getPref("model") as string;
  const apiKey = getPref("apiKey") as string;
  const customPrompt = (getPref("customPrompt") as string) || DEFAULT_PROMPT;

  if (!apiUrl || !apiKey) {
    throw new Error("API URL and API Key must be configured in preferences");
  }

  const collectionListStr = collectionCandidates
    .map((candidate, i) => `${i + 1}. [${candidate.id}] ${candidate.path}`)
    .join("\n");

  // Build system prompt with user-editable part and hidden format instruction
  let systemPrompt = `${customPrompt}\n${FORMAT_INSTRUCTION}`;

  if (includeTranslation) {
    systemPrompt = `${customPrompt}\n${TRANSLATION_INSTRUCTION}`;
  }

  const userPrompt = `标题: ${title}
摘要: ${abstract}

可用分类:
${collectionListStr}

返回 JSON${
    includeTranslation ? " (包含collectionIDs数组和chineseTitle字段)" : " 数组"
  }:`;

  // Log the full prompt to Error Console for debugging
  // Zotero.log("[AI-Collection] ========== 发送给LLM的完整Prompt ==========");
  // Zotero.log("[AI-Collection] API URL: " + apiUrl);
  // Zotero.log("[AI-Collection] Model: " + model);
  // Zotero.log("[AI-Collection] --- System Prompt ---");
  // Zotero.log(systemPrompt);
  // Zotero.log("[AI-Collection] --- User Prompt ---");
  // Zotero.log(userPrompt);
  // Zotero.log("[AI-Collection] ================================================");

  const response = await Zotero.HTTP.request("POST", apiUrl, {
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
    }),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    responseType: "json",
    timeout: 60000,
  });

  const content = response.response.choices[0].message.content.trim();

  // Log the model's output to Error Console
  // Zotero.log("[AI-Collection] ========== LLM返回结果 ==========");
  // Zotero.log(content);
  // Zotero.log("[AI-Collection] ================================");

  if (includeTranslation) {
    // Parse JSON object with collections and chineseTitle
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const selection = parseCollectionSelection(
          parsed.collectionIDs || parsed.ids || parsed.collections || []
        );
        return {
          ...selection,
          chineseTitle: parsed.chineseTitle || undefined,
        };
      } catch {
        return parseSelectionArrayFromContent(content);
      }
    }
    return parseSelectionArrayFromContent(content);
  } else {
    // Parse simple array
    return parseSelectionArrayFromContent(content);
  }
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
