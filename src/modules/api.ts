import { getPref } from "../utils/prefs";

/**
 * Call AI API for classification
 * @param title - Article title
 * @param abstract - Article abstract
 * @param collectionPaths - Available collection paths
 * @returns Array of recommended collection paths
 */
export async function callAI(
  title: string,
  abstract: string,
  collectionPaths: string[]
): Promise<string[]> {
  const apiUrl = getPref("apiUrl") as string;
  const model = getPref("model") as string;
  const apiKey = getPref("apiKey") as string;

  if (!apiUrl || !apiKey) {
    throw new Error("API URL and API Key must be configured in preferences");
  }

  const collectionListStr = collectionPaths
    .map((p, i) => `${i + 1}. ${p}`)
    .join("\n");

  const systemPrompt = `你是一个学术文献分类助手。请从给定的分类中选择最合适的 1-3 个分类路径。
规则：只能选择列表中已存在的完整路径，返回 JSON 数组，如: ["分类A/子分类B"]或["分类A"]`;

  const userPrompt = `标题: ${title}
摘要: ${abstract}

可用分类:
${collectionListStr}

返回 JSON 数组:`;

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
  const match = content.match(/\[[\s\S]*\]/);
  return match ? JSON.parse(match[0]) : [];
}

/**
 * Test API connection
 * @returns true if connection successful
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await callAI("Test Title", "Test Abstract", ["Test/Category"]);
    return Array.isArray(result);
  } catch (e) {
    ztoolkit.log("API connection test failed:", e);
    return false;
  }
}
