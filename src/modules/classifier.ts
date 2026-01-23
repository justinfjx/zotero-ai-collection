import { config } from "../../package.json";
import { callAI } from "./api";
import { getString } from "../utils/locale";
import { getPref } from "../utils/prefs";

const PATH_SEPARATOR = "/";

/**
 * Build collection tree structure as paths
 * @param collections - All collections in library
 * @param parentID - Parent collection ID (null for root)
 * @param prefix - Path prefix
 * @returns Array of collection paths
 */
export function buildCollectionTree(
  collections: Zotero.Collection[],
  parentID: number | null = null,
  prefix: string = ""
): string[] {
  let result: string[] = [];
  const children = collections.filter((c) =>
    parentID === null ? !c.parentID : c.parentID === parentID
  );
  for (const col of children) {
    const path = prefix ? `${prefix}/${col.name}` : col.name;
    result.push(path);
    result = result.concat(buildCollectionTree(collections, col.id, path));
  }
  return result;
}

/**
 * Get collection by path string
 * @param pathStr - Collection path like "Parent/Child"
 * @param allCollections - All collections in library
 * @returns Collection object or null
 */
export function getCollectionByPath(
  pathStr: string,
  allCollections: Zotero.Collection[]
): Zotero.Collection | null {
  const parts = pathStr.split(PATH_SEPARATOR);
  let currentParentID: number | undefined = undefined;
  let targetCollection: Zotero.Collection | null = null;

  for (let i = 0; i < parts.length; i++) {
    const nameToFind = parts[i].toLowerCase();
    const match = allCollections.find(
      (c) =>
        c.name.toLowerCase() === nameToFind &&
        (i === 0 ? !c.parentID : c.parentID === currentParentID)
    );
    if (match) {
      currentParentID = match.id;
      targetCollection = match;
    } else {
      return null;
    }
  }
  return targetCollection;
}

/**
 * Safely add item to collection
 * @param collection - Target collection
 * @param itemID - Item ID to add
 * @returns true if added, false if already in collection
 */
async function safeAddToCollection(
  collection: Zotero.Collection,
  itemID: number
): Promise<boolean> {
  const item = await Zotero.Items.getAsync(itemID);
  if (!item) return false;

  const currentCollections = item.getCollections();
  if (currentCollections.includes(collection.id)) {
    return false;
  }

  item.addToCollection(collection.id);
  await item.saveTx();
  return true;
}

/**
 * Parse hierarchical path into parent/child components
 * @param path - Full collection path like "Parent/Child/GrandChild"
 * @returns Array of partial paths from root to full path
 */
function getHierarchicalPaths(path: string): string[] {
  const parts = path.split(PATH_SEPARATOR);
  const paths: string[] = [];
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    paths.push(current);
  }
  return paths;
}

/**
 * Show classification confirmation dialog
 * Uses simple confirm dialog for better Zotero 7/8 compatibility
 */
async function showClassificationDialog(
  title: string,
  chineseTitle: string | undefined,
  validPaths: string[],
  _allCollections: Zotero.Collection[]
): Promise<{ confirmed: boolean; selectedPaths: string[] }> {
  const win = Zotero.getMainWindow();

  // Build hierarchical display for each path
  const pathDisplays: string[] = [];
  for (const fullPath of validPaths) {
    const hierarchicalPaths = getHierarchicalPaths(fullPath);
    const lines: string[] = [];
    for (let i = 0; i < hierarchicalPaths.length; i++) {
      const partialPath = hierarchicalPaths[i];
      const pathParts = partialPath.split(PATH_SEPARATOR);
      const displayName = pathParts[pathParts.length - 1];
      const indent = "  ".repeat(i);
      const isLeaf = i === hierarchicalPaths.length - 1;
      lines.push(`${indent}${isLeaf ? "☑ 📁" : "☐ 📂"} ${displayName}`);
    }
    pathDisplays.push(lines.join("\n"));
  }

  let message = `${getString("dialog.itemTitle") || "文献标题:"}\n${title}`;

  if (chineseTitle) {
    message += `\n📖 ${chineseTitle}`;
  }

  message += `\n\n${getString("dialog.recommendedCollections") || "推荐分类:"}\n`;
  message += pathDisplays.join("\n\n");
  message += `\n\n${getString("dialog.helpText") || "确认将文献添加到以上选中(☑)的分类?"}`;

  const confirmed = win.confirm(message);

  if (confirmed) {
    // Return only the leaf paths (full paths)
    return {
      confirmed: true,
      selectedPaths: validPaths,
    };
  }

  return { confirmed: false, selectedPaths: [] };
}

/**
 * Main classification function - process selected items
 */
export async function classifyItems(items: Zotero.Item[]): Promise<void> {
  const win = Zotero.getMainWindow();
  const regularItems = items.filter((i) => i && i.isRegularItem());

  if (regularItems.length === 0) {
    win.alert(getString("error.noitems") || "No regular items selected");
    return;
  }

  const libraryID = regularItems[0].libraryID;
  const allCollections = Zotero.Collections.getByLibrary(libraryID);
  const collectionPaths = buildCollectionTree(allCollections);

  if (collectionPaths.length === 0) {
    win.alert(getString("error.nocollections") || "No collections found in library");
    return;
  }

  // Check if Chinese translation is enabled
  const enableTranslation = getPref("enableChineseTranslation") as boolean;

  let totalAdded = 0;
  let processed = 0;

  // Show progress window
  const popupWin = new ztoolkit.ProgressWindow(config.addonName, {
    closeOnClick: false,
    closeTime: -1,
  })
    .createLine({
      text: getString("progress.processing") || "Processing...",
      type: "default",
      progress: 0,
    })
    .show();

  for (const currentItem of regularItems) {
    processed++;
    const title = (currentItem.getField("title") as string) || "无标题";
    const abstract = (currentItem.getField("abstractNote") as string) || "无摘要";

    try {
      // Update progress
      popupWin.changeLine({
        progress: Math.round((processed / regularItems.length) * 100),
        text: `[${processed}/${regularItems.length}] ${title.slice(0, 30)}...`,
      });

      const aiResult = await callAI(title, abstract, collectionPaths, enableTranslation);
      const recommendedPaths = aiResult.collections || [];
      const chineseTitle = aiResult.chineseTitle;

      const validPaths = recommendedPaths.filter((p) =>
        getCollectionByPath(p, allCollections)
      );

      if (validPaths.length === 0) {
        win.alert(
          `[${processed}/${regularItems.length}] ${getString("error.noclassification") || "No suitable classification found"}\n\n${title}`
        );
        continue;
      }

      // Show confirmation dialog (uses fallback simple dialog)
      const dialogResult = await showClassificationDialog(
        title,
        chineseTitle,
        validPaths,
        allCollections
      );

      if (!dialogResult.confirmed || dialogResult.selectedPaths.length === 0) {
        continue;
      }

      // Add to selected collections
      for (const path of dialogResult.selectedPaths) {
        const collection = getCollectionByPath(path, allCollections);
        if (collection) {
          const added = await safeAddToCollection(collection, currentItem.id);
          if (added) {
            totalAdded++;
          }
        }
      }
    } catch (e: any) {
      ztoolkit.log("Classification error:", e);
      win.alert(
        `[${processed}/${regularItems.length}] ${getString("error.processing") || "Processing failed:"} ${e.message}\n\n${title}`
      );
    }
  }

  // Close progress window immediately before showing final alert
  popupWin.changeLine({
    progress: 100,
    text: getString("progress.complete") || "Classification complete",
    type: "success",
  });

  // Close progress window after a short delay, then show result
  // Use setTimeout to ensure UI updates before alert blocks
  setTimeout(() => {
    try {
      popupWin.close();
    } catch (e) {
      // Ignore close errors
    }
  }, 500);

  // Show result summary
  win.alert(
    `${getString("result.title") || "[AI Classification Complete]"}\n\n${getString("result.processed") || "Items processed:"} ${regularItems.length}\n${getString("result.added") || "Collections added:"} ${totalAdded}`
  );
}
