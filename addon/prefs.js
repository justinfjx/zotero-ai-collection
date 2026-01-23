/* eslint-disable no-undef */
pref("__prefsPrefix__.enable", true);
pref("__prefsPrefix__.apiUrl", "https://api.openai.com/v1/chat/completions");
pref("__prefsPrefix__.model", "gpt-3.5-turbo");
pref("__prefsPrefix__.apiKey", "");

// Custom prompt settings
// NOTE: Default value must match DEFAULT_PROMPT in src/utils/constants.ts
pref("__prefsPrefix__.customPrompt", "你是一个学术文献分类助手。请从给定的分类中选择最合适的 1-3 个分类路径。");

// API configurations (JSON array of config objects)
pref("__prefsPrefix__.apiConfigs", "[]");
pref("__prefsPrefix__.currentConfigName", "Default");

// Chinese title translation toggle
pref("__prefsPrefix__.enableChineseTranslation", false);
