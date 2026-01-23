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
}
