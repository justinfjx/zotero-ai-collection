import { config } from "../package.json";
import { initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { registerMenu } from "./modules/menu";

/**
 * Startup hook - called when the plugin is enabled
 */
async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  // Initialize locale
  initLocale();

  // Register preference pane
  ztoolkit.PreferencePane.register({
    pluginID: config.addonID,
    src: rootURI + "chrome/content/preferences.xhtml",
    label: config.addonName,
    image: `chrome://${config.addonRef}/content/icons/favicon.png`,
    defaultXUL: true,
  });

  // Register right-click menu
  registerMenu();
}

/**
 * Shutdown hook - called when the plugin is disabled
 */
function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-ignore - plugin instance cleanup
  delete Zotero[config.addonInstance];
}

/**
 * Preference event hook
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      break;
  }
}

export default { onStartup, onShutdown, onPrefsEvent };
