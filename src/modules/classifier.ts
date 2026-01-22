import { config } from "../../package.json";
import { callAI } from "./api";
import { getString } from "../utils/locale";

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

      const recommendedPaths = await callAI(title, abstract, collectionPaths);
      const validPaths = (recommendedPaths || []).filter((p) =>
        getCollectionByPath(p, allCollections)
      );

      if (validPaths.length === 0) {
        win.alert(
          `[${processed}/${regularItems.length}] ${getString("error.noclassification") || "No suitable classification found"}\n\n${title}`
        );
        continue;
      }

      const confirmMsg = `[${processed}/${regularItems.length}] ${getString("confirm.message") || "AI recommends these collections:"}\n\n${validPaths.join("\n")}\n\n${getString("confirm.item") || "Item:"} ${title}\n\n${getString("confirm.proceed") || "Confirm adding to these collections?"}`;

      if (!win.confirm(confirmMsg)) {
        continue;
      }

      // Add to collections
      for (const path of validPaths) {
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

  popupWin.changeLine({
    progress: 100,
    text: getString("progress.complete") || "Classification complete",
    type: "success",
  });
  popupWin.startCloseTimer(3000);

  win.alert(
    `${getString("result.title") || "[AI Classification Complete]"}\n\n${getString("result.processed") || "Items processed:"} ${regularItems.length}\n${getString("result.added") || "Collections added:"} ${totalAdded}`
  );
}
