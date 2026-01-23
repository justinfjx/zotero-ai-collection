// Import from specific submodules for toolkit 2.x compatibility
import { BasicTool, unregister } from "zotero-plugin-toolkit/dist/basic";
import { UITool } from "zotero-plugin-toolkit/dist/tools/ui";
import { MenuManager } from "zotero-plugin-toolkit/dist/managers/menu";
import { PreferencePaneManager } from "zotero-plugin-toolkit/dist/managers/preferencePane";
import { ProgressWindowHelper } from "zotero-plugin-toolkit/dist/helpers/progressWindow";
import { DialogHelper } from "zotero-plugin-toolkit/dist/helpers/dialog";
import { config } from "../../package.json";

export { createZToolkit };

function createZToolkit() {
  // Use custom MyToolkit instead of full ZoteroToolkit
  // to avoid ReaderInstanceManager initialization issue (globalCache undefined)
  const _ztoolkit = new MyToolkit();
  initZToolkit(_ztoolkit);
  return _ztoolkit;
}

function initZToolkit(_ztoolkit: ReturnType<typeof createZToolkit>) {
  const env = __env__;
  _ztoolkit.basicOptions.log.prefix = `[${config.addonName}]`;
  _ztoolkit.basicOptions.log.disableConsole = env === "production";
  _ztoolkit.UI.basicOptions.ui.enableElementJSONLog = __env__ === "development";
  _ztoolkit.UI.basicOptions.ui.enableElementDOMLog = __env__ === "development";
  _ztoolkit.basicOptions.api.pluginID = config.addonID;
  _ztoolkit.ProgressWindow.setIconURI(
    "default",
    `chrome://${config.addonRef}/content/icons/favicon.png`
  );
}

/**
 * Custom toolkit class that only includes modules we need.
 * This avoids the ReaderInstanceManager initialization issue
 * that causes "globalCache is undefined" error in newer Zotero versions.
 */
class MyToolkit extends BasicTool {
  UI: UITool;
  Menu: MenuManager;
  PreferencePane: PreferencePaneManager;
  ProgressWindow: typeof ProgressWindowHelper;
  Dialog: typeof DialogHelper;

  constructor() {
    super();
    this.UI = new UITool(this);
    this.Menu = new MenuManager(this);
    this.PreferencePane = new PreferencePaneManager(this);
    this.ProgressWindow = ProgressWindowHelper;
    this.Dialog = DialogHelper;
  }

  unregisterAll() {
    unregister(this);
  }
}
