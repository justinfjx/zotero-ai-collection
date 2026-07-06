import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { testConnection } from "./api";
import { getPref, setPref } from "../utils/prefs";
import { DEFAULT_PROMPT } from "../utils/constants";

interface ApiConfig {
  name: string;
  apiUrl: string;
  model: string;
  apiKey: string;
}

interface CollectionNode {
  id: number;
  name: string;
  path: string;
  children: CollectionNode[];
  parentID: number | null;
}

export function registerPrefsScripts(_window: Window) {
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: _window,
    };
  } else {
    addon.data.prefs.window = _window;
  }

  // Initialize default prompt if not set
  initDefaultPrefs();

  initPrefsUI();
  bindPrefEvents();
}

/**
 * Initialize default preference values if they are not set
 */
function initDefaultPrefs() {
  // Ensure customPrompt has a default value
  const currentPrompt = getPref("customPrompt");
  if (!currentPrompt || currentPrompt === "undefined" || currentPrompt === "") {
    setPref("customPrompt", DEFAULT_PROMPT);
  }

  // Ensure currentConfigName has a default
  const currentConfigName = getPref("currentConfigName");
  if (!currentConfigName || currentConfigName === "undefined") {
    setPref("currentConfigName", "Default");
  }

  // Ensure apiConfigs is valid JSON
  const apiConfigs = getPref("apiConfigs");
  if (!apiConfigs || apiConfigs === "undefined") {
    setPref("apiConfigs", "[]");
  }
}

function initPrefsUI() {
  const win = addon.data.prefs!.window;
  const doc = win.document;

  // Apply localized text to UI elements
  localizePrefsUI(doc);

  // Initialize custom prompt textarea with default value
  const promptTextarea = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-customPrompt`
  ) as HTMLTextAreaElement;
  if (promptTextarea) {
    const savedPrompt = getPref("customPrompt") as string;
    promptTextarea.value =
      savedPrompt && savedPrompt !== "undefined" ? savedPrompt : DEFAULT_PROMPT;
  }

  // Initialize config selector
  refreshConfigList();

  // Initialize collection tree
  loadCollectionTree();
}

/**
 * Apply localized text to all UI elements in preferences
 */
function localizePrefsUI(doc: Document) {
  const prefix = `zotero-prefpane-${config.addonRef}`;

  // Helper function to set element text
  const setText = (
    id: string,
    key: string,
    attr: "textContent" | "label" = "textContent"
  ) => {
    const el = doc.getElementById(`${prefix}-${id}`);
    if (el) {
      const text = getString(key);
      if (attr === "label") {
        el.setAttribute("label", text);
      } else {
        el.textContent = text;
      }
    }
  };

  // Section titles
  setText("title", "prefs.title");
  setText("promptTitle", "prefs.classificationPrompt");
  setText("collectionTitle", "prefs.collectionSelection");
  setText("behaviorTitle", "prefs.classificationBehavior");
  setText("translationTitle", "prefs.translationSettings");

  // API Configuration section
  setText("configLabel", "prefs.configuration");
  setText("saveConfig", "prefs.saveConfig", "label");
  setText("renameConfig", "prefs.rename", "label");
  setText("deleteConfig", "prefs.delete", "label");
  setText("apiUrlLabel", "prefs.apiUrl");
  setText("modelLabel", "prefs.model");
  setText("apiKeyLabel", "prefs.apiKey");
  setText("test", "prefs.testConnection", "label");

  // Prompt section
  setText("promptHelp", "prefs.promptHelp");
  setText("savePrompt", "prefs.savePrompt", "label");
  setText("resetPrompt", "prefs.resetToDefault", "label");

  // Collection section
  setText("collectionHelp", "prefs.collectionSelectionHelp");
  setText("selectAll", "prefs.selectAll", "label");
  setText("deselectAll", "prefs.deselectAll", "label");
  setText("refreshCollections", "prefs.refresh", "label");
  setText("loadingText", "prefs.loadingCollections");
  setText("collectionTip", "prefs.collectionSelectionTip");

  // Behavior section
  setText("processingModeLabel", "prefs.processingMode");
  setText("modeOneByOne", "prefs.modeOneByOne", "label");
  setText("modeBatch", "prefs.modeBatch", "label");
  setText("batchModeHelp", "prefs.modeBatchHelp");
  setText("addToAllPathCollections", "prefs.addToAllPathCollections", "label");
  setText("addToAllPathHelp", "prefs.addToAllPathCollectionsHelp");
  setText("archiveLabel", "prefs.archiveCollectionName");
  setText("archiveHelp", "prefs.archiveCollectionNameHelp");

  // Translation section
  setText(
    "enableChineseTranslation",
    "prefs.enableChineseTranslation",
    "label"
  );
}

function getApiConfigs(): ApiConfig[] {
  try {
    const configsJson = getPref("apiConfigs") as string;
    if (!configsJson || configsJson === "undefined") {
      return [];
    }
    return JSON.parse(configsJson);
  } catch {
    return [];
  }
}

function setApiConfigs(configs: ApiConfig[]) {
  setPref("apiConfigs", JSON.stringify(configs));
}

function refreshConfigList() {
  const win = addon.data.prefs!.window;
  const doc = win.document;
  const popup = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-configPopup`
  ) as XUL.MenuPopup;
  const menulist = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-configSelect`
  ) as XUL.MenuList;

  if (!popup || !menulist) return;

  // Clear existing items
  while (popup.firstChild) {
    popup.removeChild(popup.firstChild);
  }

  const configs = getApiConfigs();
  const currentName = (getPref("currentConfigName") as string) || "Default";

  // Add "Default" option
  const defaultItem = (doc as any).createXULElement("menuitem");
  defaultItem.setAttribute("label", "Default");
  defaultItem.setAttribute("value", "Default");
  popup.appendChild(defaultItem);

  // Add saved configs
  for (const cfg of configs) {
    const item = (doc as any).createXULElement("menuitem");
    item.setAttribute("label", cfg.name);
    item.setAttribute("value", cfg.name);
    popup.appendChild(item);
  }

  // Set selected value
  menulist.value = currentName;
}

function loadConfig(name: string) {
  const win = addon.data.prefs!.window;
  const doc = win.document;

  if (name === "Default") {
    // Reset to default values
    setPref("apiUrl", "https://api.openai.com/v1/chat/completions");
    setPref("model", "gpt-3.5-turbo");
    setPref("apiKey", "");
  } else {
    const configs = getApiConfigs();
    const cfg = configs.find((c) => c.name === name);
    if (cfg) {
      setPref("apiUrl", cfg.apiUrl);
      setPref("model", cfg.model);
      setPref("apiKey", cfg.apiKey);
    }
  }

  setPref("currentConfigName", name);

  // Update UI
  const apiUrlInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-apiUrl`
  ) as HTMLInputElement;
  const modelInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-model`
  ) as HTMLInputElement;
  const apiKeyInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-apiKey`
  ) as HTMLInputElement;

  if (apiUrlInput) apiUrlInput.value = getPref("apiUrl") as string;
  if (modelInput) modelInput.value = getPref("model") as string;
  if (apiKeyInput) apiKeyInput.value = getPref("apiKey") as string;
}

function bindPrefEvents() {
  const win = addon.data.prefs!.window;
  const doc = win.document;

  // 🥚 Easter Egg 1: Title click easter egg (5 clicks)
  let titleClickCount = 0;
  let titleLastClickTime = 0;
  doc
    .querySelector(`#zotero-prefpane-${config.addonRef}-title`)
    ?.addEventListener("click", () => {
      const now = Date.now();
      if (now - titleLastClickTime < 500) {
        titleClickCount++;
        if (titleClickCount >= 5) {
          win.alert(
            "🎉 你发现了彩蛋！\n\n感谢使用 Collection for Zotero\n\nMade with ❤️ by Justin\n\n愿你的文献永远井井有条 📚"
          );
          titleClickCount = 0;
        }
      } else {
        titleClickCount = 1;
      }
      titleLastClickTime = now;
    });

  // Config selector change
  doc
    .querySelector(`#zotero-prefpane-${config.addonRef}-configSelect`)
    ?.addEventListener("command", (e: any) => {
      const selectedValue = e.target.value;
      loadConfig(selectedValue);
    });

  // Save config button
  doc
    .querySelector(`#zotero-prefpane-${config.addonRef}-saveConfig`)
    ?.addEventListener("click", () => {
      const name = win.prompt(
        getString("prefs.saveConfigPrompt") || "Enter configuration name:",
        (getPref("currentConfigName") as string) || "My Config"
      );
      if (!name || name.trim() === "" || name === "Default") {
        win.alert(
          getString("prefs.invalidConfigName") || "Invalid configuration name."
        );
        return;
      }

      const configs = getApiConfigs();
      const existingIdx = configs.findIndex((c) => c.name === name);
      const newConfig: ApiConfig = {
        name: name.trim(),
        apiUrl: getPref("apiUrl") as string,
        model: getPref("model") as string,
        apiKey: getPref("apiKey") as string,
      };

      if (existingIdx >= 0) {
        configs[existingIdx] = newConfig;
      } else {
        configs.push(newConfig);
      }

      setApiConfigs(configs);
      setPref("currentConfigName", name.trim());
      refreshConfigList();

      win.alert(getString("prefs.configSaved") || "Configuration saved!");
    });

  // Rename config button
  doc
    .querySelector(`#zotero-prefpane-${config.addonRef}-renameConfig`)
    ?.addEventListener("click", () => {
      const currentName = getPref("currentConfigName") as string;
      if (currentName === "Default") {
        win.alert(
          getString("prefs.cannotRenameDefault") ||
            "Cannot rename Default configuration."
        );
        return;
      }

      const newName = win.prompt(
        getString("prefs.renameConfigPrompt") ||
          "Enter new configuration name:",
        currentName
      );
      if (!newName || newName.trim() === "" || newName === "Default") {
        win.alert(
          getString("prefs.invalidConfigName") || "Invalid configuration name."
        );
        return;
      }

      const configs = getApiConfigs();
      const idx = configs.findIndex((c) => c.name === currentName);
      if (idx >= 0) {
        configs[idx].name = newName.trim();
        setApiConfigs(configs);
        setPref("currentConfigName", newName.trim());
        refreshConfigList();
        win.alert(getString("prefs.configRenamed") || "Configuration renamed!");
      }
    });

  // Delete config button
  doc
    .querySelector(`#zotero-prefpane-${config.addonRef}-deleteConfig`)
    ?.addEventListener("click", () => {
      const currentName = getPref("currentConfigName") as string;
      if (currentName === "Default") {
        win.alert(
          getString("prefs.cannotDeleteDefault") ||
            "Cannot delete Default configuration."
        );
        return;
      }

      if (
        !win.confirm(
          getString("prefs.confirmDelete") ||
            `Delete configuration "${currentName}"?`
        )
      ) {
        return;
      }

      const configs = getApiConfigs();
      const filtered = configs.filter((c) => c.name !== currentName);
      setApiConfigs(filtered);
      loadConfig("Default");
      refreshConfigList();
      win.alert(getString("prefs.configDeleted") || "Configuration deleted!");
    });

  // Toggle API key visibility
  const toggleBtn = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-toggleApiKey`
  );

  // 🥚 Easter Egg 2: Long press eye button (3 seconds)
  let pressTimer: number | null = null;
  toggleBtn?.addEventListener("mousedown", () => {
    pressTimer = win.setTimeout(() => {
      win.alert(
        "👀 你盯着我看了好久...\n\n是想偷看 API Key 吗？\n\n放心，你的密钥很安全 🔐"
      );
    }, 3000) as unknown as number;
  });
  toggleBtn?.addEventListener("mouseup", () => {
    if (pressTimer) clearTimeout(pressTimer);
  });
  toggleBtn?.addEventListener("mouseleave", () => {
    if (pressTimer) clearTimeout(pressTimer);
  });

  doc
    .querySelector(`#zotero-prefpane-${config.addonRef}-toggleApiKey`)
    ?.addEventListener("click", () => {
      const apiKeyInput = doc.querySelector(
        `#zotero-prefpane-${config.addonRef}-apiKey`
      ) as HTMLInputElement;
      const toggleBtn = doc.querySelector(
        `#zotero-prefpane-${config.addonRef}-toggleApiKey`
      ) as HTMLButtonElement;

      if (apiKeyInput) {
        if (apiKeyInput.type === "password") {
          apiKeyInput.type = "text";
          toggleBtn.textContent = "🙈";
        } else {
          apiKeyInput.type = "password";
          toggleBtn.textContent = "👁";
        }
      }
    });

  // Test connection button
  // 🥚 Easter Egg 3: Click test button 10 times
  let testClickCount = 0;
  doc
    .querySelector(`#zotero-prefpane-${config.addonRef}-test`)
    ?.addEventListener("click", async () => {
      const button = doc.querySelector(
        `#zotero-prefpane-${config.addonRef}-test`
      ) as HTMLButtonElement;
      const resultDiv = doc.querySelector(
        `#zotero-prefpane-${config.addonRef}-testResult`
      ) as HTMLDivElement;

      // Easter egg: 10 rapid clicks
      testClickCount++;
      if (testClickCount >= 10) {
        resultDiv.textContent = "🤖 别点了！AI 说它很累...需要休息一下 😴";
        resultDiv.style.color = "#ff9800";
        testClickCount = 0;
        return;
      }

      button.disabled = true;
      button.textContent = getString("prefs.testing") || "Testing...";
      resultDiv.textContent =
        getString("prefs.testing") || "Testing connection...";
      resultDiv.style.color = "#666";

      try {
        const result = await testConnection();
        if (result.success) {
          resultDiv.textContent = `✓ ${
            getString("prefs.testSuccess") || "Connection successful!"
          }`;
          resultDiv.style.color = "#2e7d32";
        } else {
          resultDiv.textContent = `✗ ${
            getString("prefs.testFailed") || "Connection failed."
          } ${result.message || ""}`;
          resultDiv.style.color = "#c62828";
        }
      } catch (e: any) {
        resultDiv.textContent = `✗ ${
          getString("prefs.testError") || "Error:"
        } ${e.message}`;
        resultDiv.style.color = "#c62828";
      } finally {
        button.disabled = false;
        button.textContent =
          getString("prefs.testConnection") || "Test Connection";
      }
    });

  // Save prompt button
  doc
    .querySelector(`#zotero-prefpane-${config.addonRef}-savePrompt`)
    ?.addEventListener("click", () => {
      const promptTextarea = doc.querySelector(
        `#zotero-prefpane-${config.addonRef}-customPrompt`
      ) as HTMLTextAreaElement;

      if (promptTextarea) {
        const value = promptTextarea.value.trim() || DEFAULT_PROMPT;
        setPref("customPrompt", value);
        win.alert(getString("prefs.promptSaved") || "Prompt saved!");
      }
    });

  // Reset prompt button
  doc
    .querySelector(`#zotero-prefpane-${config.addonRef}-resetPrompt`)
    ?.addEventListener("click", () => {
      const promptTextarea = doc.querySelector(
        `#zotero-prefpane-${config.addonRef}-customPrompt`
      ) as HTMLTextAreaElement;

      if (promptTextarea) {
        promptTextarea.value = DEFAULT_PROMPT;
        setPref("customPrompt", DEFAULT_PROMPT);
        win.alert(getString("prefs.promptReset") || "Prompt reset to default!");
      }
    });

  // Collection selection buttons
  doc
    .querySelector(`#zotero-prefpane-${config.addonRef}-selectAll`)
    ?.addEventListener("click", () => {
      selectAllCollections();
    });

  doc
    .querySelector(`#zotero-prefpane-${config.addonRef}-deselectAll`)
    ?.addEventListener("click", () => {
      deselectAllCollections();
    });

  doc
    .querySelector(`#zotero-prefpane-${config.addonRef}-refreshCollections`)
    ?.addEventListener("click", () => {
      loadCollectionTree();
    });
}

// ==================== Collection Tree Functions ====================

interface EnabledCollectionPrefs {
  ids: number[];
  legacyPaths: string[];
}

/**
 * Read enabled collection identities from preferences.
 * Numeric IDs are current; path strings are migrated from older versions.
 */
function readEnabledCollectionPrefs(): EnabledCollectionPrefs {
  try {
    const enabledJson = getPref("enabledCollections") as string;
    if (!enabledJson || enabledJson === "undefined") {
      return { ids: [], legacyPaths: [] };
    }

    const rawValues = JSON.parse(enabledJson);
    const ids: number[] = [];
    const legacyPaths: string[] = [];

    if (!Array.isArray(rawValues)) {
      return { ids, legacyPaths };
    }

    for (const value of rawValues) {
      if (typeof value === "number" && Number.isFinite(value)) {
        ids.push(value);
      } else if (typeof value === "string") {
        const trimmed = value.trim();
        if (/^\d+$/.test(trimmed)) {
          ids.push(Number(trimmed));
        } else if (trimmed) {
          legacyPaths.push(trimmed);
        }
      }
    }

    return {
      ids: Array.from(new Set(ids)),
      legacyPaths: Array.from(new Set(legacyPaths)),
    };
  } catch {
    return { ids: [], legacyPaths: [] };
  }
}

/**
 * Save enabled collection IDs to preferences
 */
function setEnabledCollections(ids: number[]) {
  setPref("enabledCollections", JSON.stringify(Array.from(new Set(ids))));
}

/**
 * Build collection tree structure from a single collection and its children
 */
function buildCollectionNodeFromCollection(
  collection: Zotero.Collection,
  prefix: string = ""
): CollectionNode {
  const path = prefix ? `${prefix}/${collection.name}` : collection.name;
  const childCollections = collection.getChildCollections(false);

  const node: CollectionNode = {
    id: collection.id,
    name: collection.name,
    path: path,
    parentID: collection.parentID || null,
    children: childCollections.map((child) =>
      buildCollectionNodeFromCollection(child, path)
    ),
  };

  return node;
}

/**
 * Build collection tree structure from Zotero collections
 * Uses getChildCollections() method for reliable parent-child relationships
 */
function buildCollectionNodes(
  collections: Zotero.Collection[]
): CollectionNode[] {
  // Find top-level collections (those without a parent)
  const topLevelCollections = collections.filter((c) => !c.parentID);

  return topLevelCollections.map((col) =>
    buildCollectionNodeFromCollection(col, "")
  );
}

function flattenCollectionNodes(nodes: CollectionNode[]): CollectionNode[] {
  let result: CollectionNode[] = [];
  for (const node of nodes) {
    result.push(node);
    result = result.concat(flattenCollectionNodes(node.children));
  }
  return result;
}

/**
 * Get all IDs from collection tree (flattened)
 */
function getAllIDs(nodes: CollectionNode[]): number[] {
  return flattenCollectionNodes(nodes).map((node) => node.id);
}

function getEnabledCollectionIDs(nodes: CollectionNode[]): number[] {
  const prefs = readEnabledCollectionPrefs();
  const enabledIDs = new Set(prefs.ids);

  if (prefs.legacyPaths.length > 0) {
    const allNodes = flattenCollectionNodes(nodes);
    for (const path of prefs.legacyPaths) {
      for (const node of allNodes) {
        if (node.path === path) {
          enabledIDs.add(node.id);
        }
      }
    }

    setEnabledCollections(Array.from(enabledIDs));
  }

  return Array.from(enabledIDs);
}

/**
 * Get all descendant IDs of a given collection ID
 */
function getDescendantIDs(nodes: CollectionNode[], targetID: number): number[] {
  for (const node of nodes) {
    if (node.id === targetID) {
      return getAllIDs(node.children);
    }
    const found = getDescendantIDs(node.children, targetID);
    if (found.length > 0 || node.children.some((c) => c.id === targetID)) {
      return found;
    }
  }
  return [];
}

/**
 * Get all ancestor IDs of a given collection ID
 */
function getAncestorIDs(
  nodes: CollectionNode[],
  targetID: number,
  ancestors: number[] = []
): number[] {
  for (const node of nodes) {
    if (node.id === targetID) {
      return ancestors;
    }

    const found = getAncestorIDs(node.children, targetID, [
      ...ancestors,
      node.id,
    ]);
    if (found.length > 0) {
      return found;
    }
  }
  return [];
}

// Store collection tree globally for the preference window
let collectionTree: CollectionNode[] = [];
let allCollectionIDs: number[] = [];

/**
 * Check if collections have been initialized before
 */
function isCollectionsInitialized(): boolean {
  const initialized = getPref("collectionsInitialized") as string;
  return initialized === "true";
}

/**
 * Mark collections as initialized
 */
function markCollectionsInitialized() {
  setPref("collectionsInitialized", "true");
}

/**
 * Load and render collection tree (preserves user selections)
 */
function loadCollectionTree() {
  const win = addon.data.prefs!.window;
  const doc = win.document;
  const container = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-collectionTree`
  ) as HTMLDivElement;

  if (!container) return;

  // Clear container safely
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  try {
    // Get collections from the user's library
    const libraryID = Zotero.Libraries.userLibraryID;
    const collections = Zotero.Collections.getByLibrary(libraryID);

    // Build tree structure
    collectionTree = buildCollectionNodes(collections);
    allCollectionIDs = getAllIDs(collectionTree);

    let enabledIDs = getEnabledCollectionIDs(collectionTree);

    // First time initialization: enable all collections
    if (!isCollectionsInitialized() && allCollectionIDs.length > 0) {
      enabledIDs = [...allCollectionIDs];
      setEnabledCollections(enabledIDs);
      markCollectionsInitialized();
    } else {
      // Clean up stale IDs (collections that no longer exist)
      const validEnabledIDs = enabledIDs.filter((id) =>
        allCollectionIDs.includes(id)
      );

      // Only update if IDs were removed (don't add new IDs automatically)
      if (validEnabledIDs.length !== enabledIDs.length) {
        setEnabledCollections(validEnabledIDs);
      }

      enabledIDs = validEnabledIDs;
    }

    // Render the tree with preserved user selections
    renderCollectionTree(container, collectionTree, new Set(enabledIDs));
  } catch (e: any) {
    const errorDiv = doc.createElement("div") as HTMLDivElement;
    errorDiv.style.color = "#c62828";
    errorDiv.textContent = `Error loading collections: ${e.message}`;
    container.appendChild(errorDiv);
  }
}

/**
 * Render collection tree to container
 */
function renderCollectionTree(
  container: HTMLDivElement,
  nodes: CollectionNode[],
  enabledIDs: Set<number>,
  level: number = 0
) {
  const doc = container.ownerDocument;

  if (level === 0 && nodes.length === 0) {
    const emptyDiv = doc.createElement("div") as HTMLDivElement;
    emptyDiv.style.color = "#999";
    emptyDiv.textContent = "No collections found in library.";
    container.appendChild(emptyDiv);
    return;
  }

  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const isEnabled = enabledIDs.has(node.id);

    // Create node container
    const nodeDiv = doc.createElement("div") as HTMLDivElement;
    nodeDiv.setAttribute("data-collection-id", String(node.id));
    nodeDiv.style.cssText = `margin-left: ${level * 20}px; margin-bottom: 2px;`;

    // Create header row (toggle + checkbox + name)
    const headerDiv = doc.createElement("div") as HTMLDivElement;
    headerDiv.style.cssText =
      "display: flex; align-items: center; padding: 2px 0;";

    // Toggle button for folders with children
    const toggleSpan = doc.createElement("span") as HTMLSpanElement;
    toggleSpan.style.cssText =
      "width: 16px; cursor: pointer; user-select: none; font-size: 10px; opacity: 0.7;";
    if (hasChildren) {
      toggleSpan.textContent = "▶";
      toggleSpan.setAttribute("data-expanded", "false");
      toggleSpan.addEventListener("click", () => {
        const expanded = toggleSpan.getAttribute("data-expanded") === "true";
        toggleSpan.setAttribute("data-expanded", String(!expanded));
        toggleSpan.textContent = expanded ? "▶" : "▼";
        const childrenContainer = nodeDiv.querySelector(
          ".children-container"
        ) as HTMLDivElement;
        if (childrenContainer) {
          childrenContainer.style.display = expanded ? "none" : "block";
        }
      });
    } else {
      toggleSpan.textContent = " ";
    }
    headerDiv.appendChild(toggleSpan);

    // Checkbox
    const checkbox = doc.createElement("input") as HTMLInputElement;
    checkbox.type = "checkbox";
    checkbox.checked = isEnabled;
    checkbox.setAttribute("data-collection-id", String(node.id));
    checkbox.style.cssText = "margin: 0 5px 0 0; cursor: pointer;";
    checkbox.addEventListener("change", () => {
      handleCheckboxChange(node.id, checkbox.checked);
    });
    headerDiv.appendChild(checkbox);

    // Folder icon and name
    const nameSpan = doc.createElement("span") as HTMLSpanElement;
    nameSpan.style.cssText = "cursor: default;";
    nameSpan.textContent = `${hasChildren ? "📂" : "📁"} ${node.name}`;
    headerDiv.appendChild(nameSpan);

    nodeDiv.appendChild(headerDiv);

    // Children container (initially collapsed)
    if (hasChildren) {
      const childrenContainer = doc.createElement("div") as HTMLDivElement;
      childrenContainer.className = "children-container";
      childrenContainer.style.display = "none";
      nodeDiv.appendChild(childrenContainer);

      // Recursively render children
      renderCollectionTree(
        childrenContainer,
        node.children,
        enabledIDs,
        level + 1
      );
    }

    container.appendChild(nodeDiv);
  }
}

/**
 * Handle checkbox change with parent-child cascading logic
 */
function handleCheckboxChange(collectionID: number, checked: boolean) {
  const win = addon.data.prefs!.window;
  const doc = win.document;

  const enabledIDs = new Set(getEnabledCollectionIDs(collectionTree));

  if (checked) {
    // When checking: enable this collection and all ancestors
    enabledIDs.add(collectionID);

    // Enable all ancestors to ensure path integrity
    const ancestors = getAncestorIDs(collectionTree, collectionID);
    for (const ancestor of ancestors) {
      enabledIDs.add(ancestor);
    }

    // Enable all descendants
    const descendants = getDescendantIDs(collectionTree, collectionID);
    for (const desc of descendants) {
      enabledIDs.add(desc);
    }
  } else {
    // When unchecking: disable this collection and all descendants
    enabledIDs.delete(collectionID);

    // Disable all descendants
    const descendants = getDescendantIDs(collectionTree, collectionID);
    for (const desc of descendants) {
      enabledIDs.delete(desc);
    }
  }

  // Save to preferences
  setEnabledCollections(Array.from(enabledIDs));

  // Update UI checkboxes
  updateCheckboxStates(doc, enabledIDs);
}

/**
 * Update all checkbox states in the UI
 */
function updateCheckboxStates(doc: Document, enabledIDs: Set<number>) {
  const checkboxes = doc.querySelectorAll(
    `#zotero-prefpane-${config.addonRef}-collectionTree input[type="checkbox"]`
  );

  checkboxes.forEach((cb) => {
    const checkbox = cb as HTMLInputElement;
    const collectionID = Number(checkbox.getAttribute("data-collection-id"));
    if (Number.isFinite(collectionID)) {
      checkbox.checked = enabledIDs.has(collectionID);
    }
  });
}

/**
 * Select all collections
 */
function selectAllCollections() {
  const win = addon.data.prefs!.window;
  const doc = win.document;

  setEnabledCollections([...allCollectionIDs]);
  updateCheckboxStates(doc, new Set(allCollectionIDs));
}

/**
 * Deselect all collections
 */
function deselectAllCollections() {
  const win = addon.data.prefs!.window;
  const doc = win.document;

  setEnabledCollections([]);
  updateCheckboxStates(doc, new Set());
}
