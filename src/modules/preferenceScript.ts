import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { testConnection } from "./api";

export function registerPrefsScripts(_window: Window) {
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: _window,
    };
  } else {
    addon.data.prefs.window = _window;
  }
  bindPrefEvents();
}

function bindPrefEvents() {
  // Test connection button
  addon.data.prefs!.window.document
    .querySelector(`#zotero-prefpane-${config.addonRef}-test`)
    ?.addEventListener("click", async () => {
      const win = addon.data.prefs!.window;
      const button = win.document.querySelector(
        `#zotero-prefpane-${config.addonRef}-test`
      ) as HTMLButtonElement;

      button.disabled = true;
      button.textContent = getString("prefs.testing") || "Testing...";

      try {
        const success = await testConnection();
        if (success) {
          win.alert(getString("prefs.testSuccess") || "Connection successful!");
        } else {
          win.alert(getString("prefs.testFailed") || "Connection failed. Please check your settings.");
        }
      } catch (e: any) {
        win.alert(`${getString("prefs.testError") || "Error:"} ${e.message}`);
      } finally {
        button.disabled = false;
        button.textContent = getString("prefs.testConnection") || "Test Connection";
      }
    });
}
