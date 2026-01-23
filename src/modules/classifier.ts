import { config } from "../../package.json";
import { callAI } from "./api";
import { getString } from "../utils/locale";
import { getPref } from "../utils/prefs";

const PATH_SEPARATOR = "/";

/**
 * Get enabled collection paths from preferences
 */
function getEnabledCollections(): Set<string> {
  try {
    const enabledJson = getPref("enabledCollections") as string;
    if (!enabledJson || enabledJson === "undefined") {
      return new Set(); // Empty set means all enabled (first time use)
    }
    return new Set(JSON.parse(enabledJson));
  } catch {
    return new Set();
  }
}

/**
 * Build collection paths recursively from a single collection
 * @param collection - The collection to process
 * @param prefix - Path prefix
 * @returns Array of collection paths (this collection and all descendants)
 */
function buildPathsFromCollection(
  collection: Zotero.Collection,
  prefix: string = ""
): string[] {
  const path = prefix ? `${prefix}/${collection.name}` : collection.name;
  let result: string[] = [path];

  // Use getChildCollections() to get actual child collections
  const children = collection.getChildCollections(false);
  for (const child of children) {
    result = result.concat(buildPathsFromCollection(child, path));
  }

  return result;
}

/**
 * Build collection tree structure as paths (all collections)
 * Uses getChildCollections() for reliable parent-child relationships
 * @param collections - Top-level collections from getByLibrary()
 * @param _parentID - Unused, kept for API compatibility
 * @param _prefix - Unused, kept for API compatibility
 * @returns Array of all collection paths including nested children
 */
function buildAllCollectionPaths(
  collections: Zotero.Collection[],
  _parentID: number | null = null,
  _prefix: string = ""
): string[] {
  let result: string[] = [];

  // collections from getByLibrary() are top-level only
  // Use getChildCollections() to recursively get all descendants
  for (const col of collections) {
    // Only process top-level collections (parentID is false or falsy in Zotero 7)
    if (!col.parentID) {
      result = result.concat(buildPathsFromCollection(col, ""));
    }
  }

  return result;
}

/**
 * Check if a path has any enabled children
 * @param path - The path to check
 * @param enabledCollections - Set of enabled collection paths
 * @returns true if the path has enabled children
 */
function hasEnabledChildren(path: string, enabledCollections: Set<string>): boolean {
  const prefix = path + "/";
  for (const enabledPath of enabledCollections) {
    if (enabledPath.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/**
 * Build collection tree structure as paths, filtered by enabled collections
 * Returns actual leaf nodes (deepest paths) for each enabled subtree
 * @param collections - All collections in library
 * @param parentID - Parent collection ID (null for root)
 * @param prefix - Path prefix
 * @returns Array of leaf collection paths within enabled subtrees
 */
export function buildCollectionTree(
  collections: Zotero.Collection[],
  parentID: number | null = null,
  prefix: string = ""
): string[] {
  const enabledCollections = getEnabledCollections();
  const allPaths = buildAllCollectionPaths(collections, parentID, prefix);

  // Helper: check if a path is an actual leaf (has no children in allPaths)
  const isActualLeaf = (path: string): boolean => {
    const pathPrefix = path + "/";
    return !allPaths.some((p) => p.startsWith(pathPrefix));
  };

  // Helper: get all actual leaf descendants of a path (including itself if it's a leaf)
  const getLeafDescendants = (basePath: string): string[] => {
    const pathPrefix = basePath + "/";
    const descendants = allPaths.filter(
      (p) => p === basePath || p.startsWith(pathPrefix)
    );
    return descendants.filter(isActualLeaf);
  };

  // If no enabled collections stored yet (first time), return all leaf nodes
  if (enabledCollections.size === 0) {
    return allPaths.filter(isActualLeaf);
  }

  // For each enabled path without enabled children, expand to its actual leaf descendants
  const result: Set<string> = new Set();

  for (const path of allPaths) {
    if (!enabledCollections.has(path)) {
      continue;
    }

    // Skip paths that have enabled children (they'll be handled when we reach those children)
    if (hasEnabledChildren(path, enabledCollections)) {
      continue;
    }

    // Get all actual leaf descendants and add them
    for (const leaf of getLeafDescendants(path)) {
      result.add(leaf);
    }
  }

  return Array.from(result);
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
      // Check user preference: add to leaf only or all path collections
      const addToAllPath = getPref("addToAllPathCollections") as boolean;

      for (const path of dialogResult.selectedPaths) {
        if (addToAllPath) {
          // Add to all collections in the path (A, A/b, A/b/c)
          const hierarchicalPaths = getHierarchicalPaths(path);
          for (const partialPath of hierarchicalPaths) {
            const collection = getCollectionByPath(partialPath, allCollections);
            if (collection) {
              const added = await safeAddToCollection(collection, currentItem.id);
              if (added) {
                totalAdded++;
              }
            }
          }
        } else {
          // Add to leaf collection only (just c in A/b/c)
          const collection = getCollectionByPath(path, allCollections);
          if (collection) {
            const added = await safeAddToCollection(collection, currentItem.id);
            if (added) {
              totalAdded++;
            }
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
