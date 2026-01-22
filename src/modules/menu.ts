import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { classifyItems } from "./classifier";

/**
 * Register right-click menu item for AI classification
 */
export function registerMenu(): void {
  const menuIcon = `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`;

  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: `zotero-itemmenu-${config.addonRef}-classify`,
    label: getString("menuitem.aiclassify") || "AI Smart Classify",
    commandListener: async () => {
      const items = ZoteroPane.getSelectedItems();
      if (items.length === 0) {
        Zotero.getMainWindow().alert(
          getString("error.noselection") || "Please select items to classify"
        );
        return;
      }
      await classifyItems(items);
    },
    icon: menuIcon,
  });
}
