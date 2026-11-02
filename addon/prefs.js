/* eslint-disable no-undef */
pref("__prefsPrefix__.enable", true);
pref("__prefsPrefix__.apiUrl", "https://api.openai.com/v1/chat/completions");
pref("__prefsPrefix__.model", "gpt-3.5-turbo");

// API provider: "openai-compatible" or "anthropic"
pref("__prefsPrefix__.provider", "openai-compatible");
pref("__prefsPrefix__.apiKey", "");

// Custom prompt settings
// NOTE: Default value must match DEFAULT_PROMPT in src/utils/constants.ts
pref("__prefsPrefix__.customPrompt", "You are an academic literature classification assistant. Your task is to file a paper under the most suitable Zotero collections.\nYou will be given:\n1. The full collection tree, one collection per line\n2. The title and abstract of one paper\n\nChoose the 1-3 collections that best serve long-term research management.\n\nCore principles:\n1. Classify by the paper's core research contribution, not by surface keywords in the title.\n2. Decide mainly by the main problem the paper addresses and the core method it uses.\n3. Use the application domain (for example medicine or transport) as the main basis only when it is decisive for the contribution.\n\nChoosing several collections:\n- If the paper clearly serves a single research direction, choose only the one most specific collection.\n- If it makes equally important contributions in two or three directions (for example a method plus a specific application), choose 2-3.\n- Be comprehensive: if several sub-collections are all reasonable, include all of them.\n\nConsistency and restraint:\n- Put similar papers in consistent collections, so one research topic is not scattered.\n- Do not invent collections or rename existing ones.\n\nOutput:\n- Return only the chosen collections, most relevant first.\n- Do not include explanations, reasons or extra text.");

// API configurations (JSON array of config objects)
pref("__prefsPrefix__.apiConfigs", "[]");
pref("__prefsPrefix__.currentConfigName", "Default");

// Chinese title translation toggle
pref("__prefsPrefix__.enableChineseTranslation", false);

// Archive collection name (for "Reject & Archive" button)
pref("__prefsPrefix__.archiveCollectionName", "未分类");

// Batch processing mode: false = one-by-one confirmation, true = batch confirmation
pref("__prefsPrefix__.batchMode", false);

// Auto-classify unfiled items once more than this many are unfiled (off by default)
pref("__prefsPrefix__.autoClassifyUnfiled", false);
pref("__prefsPrefix__.autoClassifyThreshold", 5);

// Deepest collection level offered to the AI (0 = unlimited, 1 = top-level only)
pref("__prefsPrefix__.maxDepth", 0);

// Seed collections: one path per line (e.g. Algorithms/Variational)
pref("__prefsPrefix__.seedCollections", "");

// Let the AI suggest new collections; ask before creating one once this many items share it
pref("__prefsPrefix__.proposeNewCollections", false);
pref("__prefsPrefix__.proposalMinItems", 10);
pref("__prefsPrefix__.allowNewTopLevel", false);
pref("__prefsPrefix__.pendingProposals", "{}");
