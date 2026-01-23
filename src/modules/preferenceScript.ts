import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { testConnection } from "./api";
import { getPref, setPref } from "../utils/prefs";

const DEFAULT_PROMPT = "请从给定的分类中选择最合适的 1-3 个分类路径。";

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

  // Initialize custom prompt textarea with default value
  const promptTextarea = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-customPrompt`
  ) as HTMLTextAreaElement;
  if (promptTextarea) {
    const savedPrompt = getPref("customPrompt") as string;
    promptTextarea.value = savedPrompt && savedPrompt !== "undefined" ? savedPrompt : DEFAULT_PROMPT;
  }

  // Initialize config selector
  refreshConfigList();

  // Initialize collection tree
  loadCollectionTree();
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
  const defaultItem = doc.createXULElement("menuitem");
  defaultItem.setAttribute("label", "Default");
  defaultItem.setAttribute("value", "Default");
  popup.appendChild(defaultItem);

  // Add saved configs
  for (const cfg of configs) {
    const item = doc.createXULElement("menuitem");
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
        win.alert(getString("prefs.invalidConfigName") || "Invalid configuration name.");
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
        win.alert(getString("prefs.cannotRenameDefault") || "Cannot rename Default configuration.");
        return;
      }

      const newName = win.prompt(
        getString("prefs.renameConfigPrompt") || "Enter new configuration name:",
        currentName
      );
      if (!newName || newName.trim() === "" || newName === "Default") {
        win.alert(getString("prefs.invalidConfigName") || "Invalid configuration name.");
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
        win.alert(getString("prefs.cannotDeleteDefault") || "Cannot delete Default configuration.");
        return;
      }

      if (!win.confirm(getString("prefs.confirmDelete") || `Delete configuration "${currentName}"?`)) {
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
  doc
    .querySelector(`#zotero-prefpane-${config.addonRef}-test`)
    ?.addEventListener("click", async () => {
      const button = doc.querySelector(
        `#zotero-prefpane-${config.addonRef}-test`
      ) as HTMLButtonElement;
      const resultDiv = doc.querySelector(
        `#zotero-prefpane-${config.addonRef}-testResult`
      ) as HTMLDivElement;

      button.disabled = true;
      button.textContent = getString("prefs.testing") || "Testing...";
      resultDiv.textContent = getString("prefs.testing") || "Testing connection...";
      resultDiv.style.color = "#666";

      try {
        const result = await testConnection();
        if (result.success) {
          resultDiv.textContent = `✓ ${getString("prefs.testSuccess") || "Connection successful!"}`;
          resultDiv.style.color = "#2e7d32";
        } else {
          resultDiv.textContent = `✗ ${getString("prefs.testFailed") || "Connection failed."} ${result.message || ""}`;
          resultDiv.style.color = "#c62828";
        }
      } catch (e: any) {
        resultDiv.textContent = `✗ ${getString("prefs.testError") || "Error:"} ${e.message}`;
        resultDiv.style.color = "#c62828";
      } finally {
        button.disabled = false;
        button.textContent = getString("prefs.testConnection") || "Test Connection";
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

/**
 * Get enabled collection paths from preferences
 */
function getEnabledCollections(): string[] {
  try {
    const enabledJson = getPref("enabledCollections") as string;
    if (!enabledJson || enabledJson === "undefined") {
      return [];
    }
    return JSON.parse(enabledJson);
  } catch {
    return [];
  }
}

/**
 * Save enabled collection paths to preferences
 */
function setEnabledCollections(paths: string[]) {
  setPref("enabledCollections", JSON.stringify(paths));
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
    children: childCollections.map(child =>
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

  return topLevelCollections.map(col =>
    buildCollectionNodeFromCollection(col, "")
  );
}

/**
 * Get all paths from collection tree (flattened)
 */
function getAllPaths(nodes: CollectionNode[]): string[] {
  let paths: string[] = [];
  for (const node of nodes) {
    paths.push(node.path);
    paths = paths.concat(getAllPaths(node.children));
  }
  return paths;
}

/**
 * Get all descendant paths of a given path
 */
function getDescendantPaths(nodes: CollectionNode[], targetPath: string): string[] {
  for (const node of nodes) {
    if (node.path === targetPath) {
      return getAllPaths(node.children);
    }
    const found = getDescendantPaths(node.children, targetPath);
    if (found.length > 0 || node.children.some(c => c.path === targetPath)) {
      return found;
    }
  }
  return [];
}

/**
 * Get all ancestor paths of a given path
 */
function getAncestorPaths(path: string): string[] {
  const parts = path.split("/");
  const ancestors: string[] = [];
  let current = "";
  for (let i = 0; i < parts.length - 1; i++) {
    current = current ? `${current}/${parts[i]}` : parts[i];
    ancestors.push(current);
  }
  return ancestors;
}

// Store collection tree globally for the preference window
let collectionTree: CollectionNode[] = [];
let allCollectionPaths: string[] = [];

/**
 * Load and render collection tree
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
    allCollectionPaths = getAllPaths(collectionTree);

    // Get enabled collections (default all enabled if empty)
    let enabledPaths = getEnabledCollections();
    if (enabledPaths.length === 0 && allCollectionPaths.length > 0) {
      // First time: enable all collections
      enabledPaths = [...allCollectionPaths];
      setEnabledCollections(enabledPaths);
    }

    // Clean up stale paths (collections that no longer exist)
    const validEnabledPaths = enabledPaths.filter(p => allCollectionPaths.includes(p));

    // Add new collections (that weren't in preferences before)
    const newPaths = allCollectionPaths.filter(p => !enabledPaths.includes(p) && !validEnabledPaths.includes(p));
    const finalEnabledPaths = [...validEnabledPaths, ...newPaths];

    if (finalEnabledPaths.length !== enabledPaths.length) {
      setEnabledCollections(finalEnabledPaths);
    }

    // Render the tree
    renderCollectionTree(container, collectionTree, new Set(finalEnabledPaths));
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
  enabledPaths: Set<string>,
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
    const isEnabled = enabledPaths.has(node.path);

    // Create node container
    const nodeDiv = doc.createElement("div") as HTMLDivElement;
    nodeDiv.setAttribute("data-path", node.path);
    nodeDiv.style.cssText = `margin-left: ${level * 20}px; margin-bottom: 2px;`;

    // Create header row (toggle + checkbox + name)
    const headerDiv = doc.createElement("div") as HTMLDivElement;
    headerDiv.style.cssText = "display: flex; align-items: center; padding: 2px 0;";

    // Toggle button for folders with children
    const toggleSpan = doc.createElement("span") as HTMLSpanElement;
    toggleSpan.style.cssText = "width: 16px; cursor: pointer; user-select: none; font-size: 10px; opacity: 0.7;";
    if (hasChildren) {
      toggleSpan.textContent = "▶";
      toggleSpan.setAttribute("data-expanded", "false");
      toggleSpan.addEventListener("click", () => {
        const expanded = toggleSpan.getAttribute("data-expanded") === "true";
        toggleSpan.setAttribute("data-expanded", String(!expanded));
        toggleSpan.textContent = expanded ? "▶" : "▼";
        const childrenContainer = nodeDiv.querySelector(".children-container") as HTMLDivElement;
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
    checkbox.setAttribute("data-path", node.path);
    checkbox.style.cssText = "margin: 0 5px 0 0; cursor: pointer;";
    checkbox.addEventListener("change", () => {
      handleCheckboxChange(node.path, checkbox.checked);
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
      renderCollectionTree(childrenContainer, node.children, enabledPaths, level + 1);
    }

    container.appendChild(nodeDiv);
  }
}

/**
 * Handle checkbox change with parent-child cascading logic
 */
function handleCheckboxChange(path: string, checked: boolean) {
  const win = addon.data.prefs!.window;
  const doc = win.document;

  let enabledPaths = new Set(getEnabledCollections());

  if (checked) {
    // When checking: enable this path and all ancestors
    enabledPaths.add(path);

    // Enable all ancestors to ensure path integrity
    const ancestors = getAncestorPaths(path);
    for (const ancestor of ancestors) {
      enabledPaths.add(ancestor);
    }

    // Enable all descendants
    const descendants = getDescendantPaths(collectionTree, path);
    for (const desc of descendants) {
      enabledPaths.add(desc);
    }
  } else {
    // When unchecking: disable this path and all descendants
    enabledPaths.delete(path);

    // Disable all descendants
    const descendants = getDescendantPaths(collectionTree, path);
    for (const desc of descendants) {
      enabledPaths.delete(desc);
    }
  }

  // Save to preferences
  setEnabledCollections(Array.from(enabledPaths));

  // Update UI checkboxes
  updateCheckboxStates(doc, enabledPaths);
}

/**
 * Update all checkbox states in the UI
 */
function updateCheckboxStates(doc: Document, enabledPaths: Set<string>) {
  const checkboxes = doc.querySelectorAll(
    `#zotero-prefpane-${config.addonRef}-collectionTree input[type="checkbox"]`
  );

  checkboxes.forEach((cb) => {
    const checkbox = cb as HTMLInputElement;
    const path = checkbox.getAttribute("data-path");
    if (path) {
      checkbox.checked = enabledPaths.has(path);
    }
  });
}

/**
 * Select all collections
 */
function selectAllCollections() {
  const win = addon.data.prefs!.window;
  const doc = win.document;

  setEnabledCollections([...allCollectionPaths]);
  updateCheckboxStates(doc, new Set(allCollectionPaths));
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
