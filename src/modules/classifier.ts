import { config } from "../../package.json";
import { callAI } from "./api";
import { getString } from "../utils/locale";
import { getPref } from "../utils/prefs";

const PATH_SEPARATOR = "/";

/**
 * Batch processing result for a single item
 */
interface BatchItemResult {
  item: Zotero.Item;
  title: string;
  chineseTitle?: string;
  validPaths: string[];
  selectedPaths: string[];
  action: "pending" | "confirm" | "reject" | "archive";
  error?: string;
}

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
 * Uses smart matching to handle collection names containing "/"
 * @param pathStr - Collection path like "Parent/Child"
 * @param allCollections - Top-level collections from getByLibrary()
 * @returns Collection object or null
 */
export function getCollectionByPath(
  pathStr: string,
  allCollections: Zotero.Collection[]
): Zotero.Collection | null {
  // Try to find a matching collection by traversing the tree
  // This handles cases where collection names contain "/"

  function findInChildren(
    remainingPath: string,
    collections: Zotero.Collection[]
  ): Zotero.Collection | null {
    if (!remainingPath) return null;

    // Try each possible split point (greedy match - try longest name first)
    // This handles names like "Aerial Manipulation/Contact"
    for (let i = remainingPath.length; i > 0; i--) {
      const possibleName = remainingPath.substring(0, i);
      const rest = remainingPath.substring(i);

      // Check if rest starts with "/" or is empty
      if (rest && !rest.startsWith("/")) continue;

      // Remove leading "/" from rest
      const nextPath = rest.startsWith("/") ? rest.substring(1) : rest;

      // Find collection with this name
      const match = collections.find(
        (c) => c.name.toLowerCase() === possibleName.toLowerCase()
      );

      if (match) {
        if (!nextPath) {
          // Found the target collection
          return match;
        }
        // Continue searching in children
        const children = match.getChildCollections(false);
        const result = findInChildren(nextPath, children);
        if (result) return result;
      }
    }

    return null;
  }

  // Start with top-level collections only
  const topLevel = allCollections.filter((c) => !c.parentID);
  return findInChildren(pathStr, topLevel);
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
 * Get or create the archive collection (default: "未分类")
 * Uses the configured collection name from preferences
 * @param libraryID - The library ID
 * @returns The collection object
 */
async function getOrCreateArchiveCollection(
  libraryID: number
): Promise<Zotero.Collection> {
  // Get collection name from preferences, default to "未分类"
  const archiveName = (getPref("archiveCollectionName") as string) || "未分类";

  // Search for existing collection
  const allCollections = Zotero.Collections.getByLibrary(libraryID);
  const existing = allCollections.find(
    (c) => c.name === archiveName && !c.parentID
  );

  if (existing) {
    return existing;
  }

  // Create new collection using Zotero API
  const newCollection = new Zotero.Collection({
    libraryID: libraryID,
    name: archiveName,
  });
  await newCollection.saveTx();

  return newCollection;
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
 * Show classification confirmation dialog with interactive checkboxes
 * Uses ztoolkit.Dialog for interactive selection
 * @returns action: "confirm" | "reject" | "archive" - user's choice
 */
async function showClassificationDialog(
  title: string,
  chineseTitle: string | undefined,
  validPaths: string[],
  _allCollections: Zotero.Collection[]
): Promise<{ action: "confirm" | "reject" | "archive" | "cancel"; selectedPaths: string[] }> {
  return new Promise((resolve) => {
    // Track whether the promise has been resolved (to avoid duplicate resolution)
    let resolved = false;
    const safeResolve = (result: { action: "confirm" | "reject" | "archive" | "cancel"; selectedPaths: string[] }) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    // Track selected paths
    const selectedPaths: Record<string, boolean> = {};

    // Initialize all paths as selected by default
    for (const path of validPaths) {
      selectedPaths[path] = true;
    }

    // Build rows for the dialog (no color styles for dark mode compatibility)
    const rows: Array<{ tag: string; namespace?: string; attributes?: Record<string, string>; properties?: Record<string, unknown>; children?: unknown[] }> = [];

    // Title row
    rows.push({
      tag: "div",
      attributes: { style: "font-weight: bold; margin-bottom: 8px;" },
      properties: { innerText: `📄 ${title}` },
    });

    // Chinese title if available
    if (chineseTitle) {
      rows.push({
        tag: "div",
        attributes: { style: "opacity: 0.7; margin-bottom: 12px;" },
        properties: { innerText: `📖 ${chineseTitle}` },
      });
    }

    // Separator
    rows.push({
      tag: "div",
      attributes: { style: "border-top: 1px solid currentColor; opacity: 0.3; margin: 8px 0;" },
    });

    // Recommended collections label
    rows.push({
      tag: "div",
      attributes: { style: "font-weight: bold; margin-bottom: 8px;" },
      properties: { innerText: getString("dialog.recommendedCollections") || "推荐分类:" },
    });

    // Create checkbox for each path with hierarchical display
    for (const fullPath of validPaths) {
      const hierarchicalPaths = getHierarchicalPaths(fullPath);

      // Show hierarchy as context (parent folders)
      const parentPaths = hierarchicalPaths.slice(0, -1);
      if (parentPaths.length > 0) {
        const parentDisplay = parentPaths.map((p, i) => {
          const parts = p.split(PATH_SEPARATOR);
          const name = parts[parts.length - 1];
          return "  ".repeat(i) + "📂 " + name;
        }).join("\n");

        rows.push({
          tag: "div",
          attributes: { style: "opacity: 0.6; font-size: 12px; white-space: pre-wrap; margin-left: 20px;" },
          properties: { innerText: parentDisplay },
        });
      }

      // Leaf node with checkbox
      const leafName = fullPath.split(PATH_SEPARATOR).pop() || fullPath;
      const indent = "  ".repeat(hierarchicalPaths.length - 1);

      rows.push({
        tag: "div",
        attributes: { style: "display: flex; align-items: center; margin: 4px 0 8px 20px;" },
        children: [
          {
            tag: "input",
            namespace: "html",
            attributes: {
              type: "checkbox",
              "data-path": fullPath,
              style: "margin-right: 8px;",
            },
            properties: {
              checked: true,
            },
            listeners: [
              {
                type: "change",
                listener: (e: Event) => {
                  const target = e.target as HTMLInputElement;
                  const path = target.getAttribute("data-path");
                  if (path) {
                    selectedPaths[path] = target.checked;
                  }
                },
              },
            ],
          },
          {
            tag: "span",
            attributes: { style: "font-weight: 500;" },
            properties: { innerText: `${indent}📁 ${leafName}` },
          },
        ],
      });
    }

    // Help text
    rows.push({
      tag: "div",
      attributes: { style: "opacity: 0.7; margin-top: 12px; font-size: 12px;" },
      properties: { innerText: getString("dialog.helpText") || "勾选要添加的分类，然后点击确认" },
    });

    // Create dialog
    const dialogHelper = new ztoolkit.Dialog(rows.length, 1);

    // Add all rows
    for (let i = 0; i < rows.length; i++) {
      dialogHelper.addCell(i, 0, rows[i] as any);
    }

    // Add buttons with callbacks to handle dialog close
    dialogHelper
      .addButton(getString("dialog.confirm") || "确认", "confirm", {
        callback: () => {
          const selected = Object.entries(selectedPaths)
            .filter(([_, checked]) => checked)
            .map(([path, _]) => path);
          safeResolve({ action: "confirm", selectedPaths: selected });
        },
      })
      .addButton(getString("dialog.rejectAndArchive") || "拒绝并移至归档", "archive", {
        callback: () => {
          safeResolve({ action: "archive", selectedPaths: [] });
        },
      })
      .addButton(getString("dialog.cancel") || "拒绝添加", "cancel", {
        callback: () => {
          safeResolve({ action: "reject", selectedPaths: [] });
        },
      })
      // Handle window close button (X) - resolve as cancel to stop entire process
      .setDialogData({
        loadCallback: () => {
          // Add unload event listener after window is loaded
          if (dialogHelper.window) {
            dialogHelper.window.addEventListener("unload", () => {
              ztoolkit.log("[AI Classifier] Window unload event triggered");
              safeResolve({ action: "cancel", selectedPaths: [] });
            });
          }
        },
        beforeUnloadCallback: () => {
          ztoolkit.log("[AI Classifier] beforeUnloadCallback triggered, resolved=", resolved);
          safeResolve({ action: "cancel", selectedPaths: [] });
        },
      })
      .open(getString("dialog.title") || "AI 分类确认", {
        fitContent: true,
        centerscreen: true,
        resizable: true,
        width: 450,
        height: 400,
      });
  });
}

/**
 * Show batch classification confirmation dialog
 * Displays all items with their AI recommendations for batch review
 */
async function showBatchClassificationDialog(
  results: BatchItemResult[]
): Promise<BatchItemResult[]> {
  return new Promise((resolve) => {
    // Track states for each item
    const itemStates: Map<number, {
      action: "pending" | "confirm" | "reject" | "archive";
      selectedPaths: Set<string>;
    }> = new Map();

    // Store results for access in event handlers
    const resultsMap: Map<number, BatchItemResult> = new Map();

    // Initialize states
    for (const result of results) {
      resultsMap.set(result.item.id, result);
      if (result.error) {
        itemStates.set(result.item.id, {
          action: "reject",
          selectedPaths: new Set(),
        });
      } else {
        itemStates.set(result.item.id, {
          action: "confirm",
          selectedPaths: new Set(result.validPaths),
        });
      }
    }

    // Function to update item display
    const updateItemDisplay = (doc: Document, itemId: number) => {
      const state = itemStates.get(itemId);
      if (!state) return;

      const statusEl = doc.querySelector(`[data-item-id="${itemId}"][data-status="true"]`);
      if (statusEl) {
        let statusText = "";
        switch (state.action) {
          case "confirm":
            statusText = `✓ ${getString("dialog.statusAccepted") || "已接受"}`;
            break;
          case "reject":
            statusText = `✗ ${getString("dialog.statusRejected") || "已拒绝"}`;
            break;
          case "archive":
            statusText = `📦 ${getString("dialog.statusArchived") || "已归档"}`;
            break;
        }
        (statusEl as HTMLElement).innerText = statusText;
      }

      // Update checkboxes visibility based on action
      const collectionsEl = doc.querySelector(`[data-item-id="${itemId}"][data-collections="true"]`);
      if (collectionsEl) {
        (collectionsEl as HTMLElement).style.opacity = state.action === "confirm" ? "1" : "0.4";
      }

      // Update checkbox states
      const checkboxes = doc.querySelectorAll(`input[data-item-id="${itemId}"][data-path]`);
      checkboxes.forEach((cb) => {
        const checkbox = cb as HTMLInputElement;
        const path = checkbox.getAttribute("data-path");
        if (path) {
          checkbox.checked = state.selectedPaths.has(path);
        }
      });
    };

    // Create button click handler factory
    const createButtonClickHandler = (dialog: any, itemId: number, action: "confirm" | "reject" | "archive") => {
      return () => {
        const state = itemStates.get(itemId);
        const result = resultsMap.get(itemId);
        if (state && result) {
          state.action = action;
          if (action === "confirm") {
            state.selectedPaths = new Set(result.validPaths);
          } else {
            state.selectedPaths.clear();
          }
          if (dialog.window?.document) {
            updateItemDisplay(dialog.window.document, itemId);
          }
        }
      };
    };

    // Create checkbox change handler factory
    const createCheckboxChangeHandler = (dialog: any, itemId: number, path: string) => {
      return (e: Event) => {
        const checkbox = e.target as HTMLInputElement;
        const state = itemStates.get(itemId);
        if (state) {
          if (checkbox.checked) {
            state.selectedPaths.add(path);
            state.action = "confirm";
          } else {
            state.selectedPaths.delete(path);
            if (state.selectedPaths.size === 0 && state.action === "confirm") {
              state.action = "reject";
            }
          }
          if (dialog.window?.document) {
            updateItemDisplay(dialog.window.document, itemId);
          }
        }
      };
    };

    // Create dialog first so we can reference it in listeners
    const dialogHelper = new ztoolkit.Dialog(3, 1);

    // Build dialog content
    const rows: Array<any> = [];

    // Header
    rows.push({
      tag: "div",
      styles: { fontWeight: "bold", marginBottom: "12px", fontSize: "14px" },
      properties: { innerText: `📚 ${getString("dialog.batchTitle") || "AI 批量分类确认"} (${results.length} ${results.length > 1 ? "items" : "item"})` },
    });

    // Help text
    rows.push({
      tag: "div",
      styles: { opacity: "0.7", marginBottom: "12px", fontSize: "12px" },
      properties: { innerText: getString("dialog.batchHelpText") || "为每篇文献选择操作" },
    });

    // Build items container children
    const itemChildren: any[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const itemId = result.item.id;

      // Title elements
      const titleChildren: any[] = [
        {
          tag: "div",
          styles: { fontWeight: "bold", wordWrap: "break-word" },
          properties: { innerText: `${i + 1}. 📄 ${result.title.slice(0, 60)}${result.title.length > 60 ? "..." : ""}` },
        },
      ];

      if (result.chineseTitle) {
        titleChildren.push({
          tag: "div",
          styles: { opacity: "0.7", fontSize: "12px", marginTop: "2px" },
          properties: { innerText: `📖 ${result.chineseTitle}` },
        });
      }

      // Action buttons with listeners
      const actionButtonsChildren: any[] = [
        {
          tag: "button",
          styles: { padding: "2px 6px", fontSize: "10px", cursor: "pointer" },
          properties: { textContent: getString("dialog.accept") || "接受" },
          listeners: [
            { type: "click", listener: createButtonClickHandler(dialogHelper, itemId, "confirm") },
          ],
        },
        {
          tag: "button",
          styles: { padding: "2px 6px", fontSize: "10px", cursor: "pointer" },
          properties: { textContent: getString("dialog.rejectAndArchive") || "拒绝并归档" },
          listeners: [
            { type: "click", listener: createButtonClickHandler(dialogHelper, itemId, "archive") },
          ],
        },
        {
          tag: "button",
          styles: { padding: "2px 6px", fontSize: "10px", cursor: "pointer" },
          properties: { textContent: getString("dialog.reject") || "拒绝" },
          listeners: [
            { type: "click", listener: createButtonClickHandler(dialogHelper, itemId, "reject") },
          ],
        },
      ];

      // Header row with title and buttons
      const headerRow: any = {
        tag: "div",
        styles: { display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "6px" },
        children: [
          {
            tag: "div",
            styles: { flex: "1", minWidth: "0" },
            children: titleChildren,
          },
          {
            tag: "div",
            styles: { display: "flex", gap: "4px", flexShrink: "0" },
            children: actionButtonsChildren,
          },
        ],
      };

      // Item box children
      const itemBoxChildren: any[] = [headerRow];

      // Error or collections
      if (result.error) {
        itemBoxChildren.push({
          tag: "div",
          styles: { color: "#cc0000", fontSize: "12px", margin: "4px 0" },
          properties: { innerText: `⚠️ ${result.error}` },
        });
      } else if (result.validPaths.length > 0) {
        const collectionItems: any[] = [];
        for (const path of result.validPaths) {
          collectionItems.push({
            tag: "div",
            styles: { display: "flex", alignItems: "center", margin: "2px 0" },
            children: [
              {
                tag: "input",
                attributes: { type: "checkbox" },
                properties: { checked: true },
                styles: { marginRight: "6px" },
                listeners: [
                  { type: "change", listener: createCheckboxChangeHandler(dialogHelper, itemId, path) },
                ],
              },
              {
                tag: "span",
                properties: { innerText: `📁 ${path}` },
              },
            ],
          });
        }

        itemBoxChildren.push({
          tag: "div",
          attributes: { "data-item-id": String(itemId), "data-collections": "true" },
          styles: { marginLeft: "20px", fontSize: "12px" },
          children: collectionItems,
        });
      } else {
        itemBoxChildren.push({
          tag: "div",
          styles: { opacity: "0.6", fontSize: "12px", marginLeft: "20px" },
          properties: { innerText: getString("error.noclassification") || "未找到合适的分类" },
        });
      }

      // Status indicator
      itemBoxChildren.push({
        tag: "div",
        attributes: { "data-item-id": String(itemId), "data-status": "true" },
        styles: { fontSize: "11px", marginTop: "4px", opacity: "0.7" },
        properties: { innerText: "" },
      });

      // Complete item box
      itemChildren.push({
        tag: "div",
        attributes: { "data-item-id": String(itemId) },
        styles: { borderBottom: "1px solid currentColor", opacity: "0.8", padding: "10px 0", marginBottom: "8px" },
        children: itemBoxChildren,
      });
    }

    // Scrollable container
    rows.push({
      tag: "div",
      id: "batch-items-container",
      styles: {
        maxHeight: "400px",
        overflowY: "auto",
        border: "1px solid currentColor",
        borderRadius: "4px",
        padding: "8px",
      },
      children: itemChildren,
    });

    // Add cells to dialog
    dialogHelper.addCell(0, 0, rows[0]);
    dialogHelper.addCell(1, 0, rows[1]);
    dialogHelper.addCell(2, 0, rows[2]);

    // Add main buttons
    dialogHelper
      .addButton(getString("dialog.acceptAll") || "全部接受", "acceptAll", {
        callback: () => {
          // Set all to confirm first, then build results
          for (const result of results) {
            const state = itemStates.get(result.item.id);
            if (state && !result.error) {
              state.action = "confirm";
              state.selectedPaths = new Set(result.validPaths);
            }
          }
          const finalResults = results.map((r) => {
            const state = itemStates.get(r.item.id);
            return {
              ...r,
              action: state?.action || "reject",
              selectedPaths: state ? Array.from(state.selectedPaths) : [],
            } as BatchItemResult;
          });
          resolve(finalResults);
        },
      })
      .addButton(getString("dialog.archiveAll") || "全部拒绝并归档", "archiveAll", {
        callback: () => {
          const finalResults = results.map((r) => ({
            ...r,
            action: "archive" as const,
            selectedPaths: [],
          }));
          resolve(finalResults);
        },
      })
      .addButton(getString("dialog.rejectAll") || "全部拒绝", "rejectAll", {
        callback: () => {
          const finalResults = results.map((r) => ({
            ...r,
            action: "reject" as const,
            selectedPaths: [],
          }));
          resolve(finalResults);
        },
      })
      .addButton(getString("dialog.confirmAllStates") || "确认以上所有状态", "confirmStates", {
        callback: () => {
          // Build final results based on current individual states
          const finalResults = results.map((r) => {
            const state = itemStates.get(r.item.id);
            return {
              ...r,
              action: state?.action || "reject",
              selectedPaths: state ? Array.from(state.selectedPaths) : [],
            } as BatchItemResult;
          });
          resolve(finalResults);
        },
      })
      .setDialogData({ itemStates, resultsMap })
      .open(getString("dialog.batchTitle") || "AI 批量分类确认", {
        fitContent: true,
        centerscreen: true,
        resizable: true,
        noDialogMode: true,
        width: 650,
        height: 550,
      });

    // Initial status update after dialog opens
    setTimeout(() => {
      if (dialogHelper.window?.document) {
        for (const result of results) {
          updateItemDisplay(dialogHelper.window.document, result.item.id);
        }
      }
    }, 100);
  });
}

/**
 * Process items one by one with individual confirmation dialogs
 */
async function classifyItemsOneByOne(
  regularItems: Zotero.Item[],
  allCollections: Zotero.Collection[],
  collectionPaths: string[],
  libraryID: number,
  enableTranslation: boolean
): Promise<{ processed: number; totalAdded: number }> {
  const win = Zotero.getMainWindow();
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

      // Show confirmation dialog
      const dialogResult = await showClassificationDialog(
        title,
        chineseTitle,
        validPaths,
        allCollections
      );

      // Handle user's choice
      ztoolkit.log("[AI Classifier] Dialog result action:", dialogResult.action);
      if (dialogResult.action === "cancel") {
        // User clicked window close button - stop entire process
        ztoolkit.log("[AI Classifier] Cancel detected, breaking loop");
        break;
      }

      if (dialogResult.action === "reject") {
        continue;
      }

      if (dialogResult.action === "archive") {
        const archiveCollection = await getOrCreateArchiveCollection(libraryID);
        const added = await safeAddToCollection(archiveCollection, currentItem.id);
        if (added) {
          totalAdded++;
        }
        continue;
      }

      // action === "confirm"
      if (dialogResult.selectedPaths.length === 0) {
        continue;
      }

      const addToAllPath = getPref("addToAllPathCollections") as boolean;

      for (const path of dialogResult.selectedPaths) {
        if (addToAllPath) {
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

  // Close progress window
  popupWin.changeLine({
    progress: 100,
    text: getString("progress.complete") || "Classification complete",
    type: "success",
  });

  setTimeout(() => {
    try {
      popupWin.close();
    } catch (e) {
      // Ignore close errors
    }
  }, 500);

  return { processed: regularItems.length, totalAdded };
}

/**
 * Process all items first, then show batch confirmation dialog
 */
async function classifyItemsBatch(
  regularItems: Zotero.Item[],
  allCollections: Zotero.Collection[],
  collectionPaths: string[],
  libraryID: number,
  enableTranslation: boolean
): Promise<{ processed: number; totalAdded: number }> {
  let totalAdded = 0;

  // Show progress window for AI processing
  const popupWin = new ztoolkit.ProgressWindow(config.addonName, {
    closeOnClick: false,
    closeTime: -1,
  })
    .createLine({
      text: getString("progress.processing") || "Processing with AI...",
      type: "default",
      progress: 0,
    })
    .show();

  // Process all items with AI first
  const batchResults: BatchItemResult[] = [];

  for (let i = 0; i < regularItems.length; i++) {
    const currentItem = regularItems[i];
    const title = (currentItem.getField("title") as string) || "无标题";
    const abstract = (currentItem.getField("abstractNote") as string) || "无摘要";

    // Update progress
    popupWin.changeLine({
      progress: Math.round(((i + 1) / regularItems.length) * 100),
      text: `[${i + 1}/${regularItems.length}] ${title.slice(0, 30)}...`,
    });

    try {
      const aiResult = await callAI(title, abstract, collectionPaths, enableTranslation);
      const recommendedPaths = aiResult.collections || [];
      const chineseTitle = aiResult.chineseTitle;

      const validPaths = recommendedPaths.filter((p) =>
        getCollectionByPath(p, allCollections)
      );

      batchResults.push({
        item: currentItem,
        title,
        chineseTitle,
        validPaths,
        selectedPaths: validPaths,
        action: validPaths.length > 0 ? "pending" : "reject",
      });
    } catch (e: any) {
      ztoolkit.log("Classification error:", e);
      batchResults.push({
        item: currentItem,
        title,
        validPaths: [],
        selectedPaths: [],
        action: "reject",
        error: e.message,
      });
    }
  }

  // Close progress window
  popupWin.changeLine({
    progress: 100,
    text: getString("progress.complete") || "AI processing complete",
    type: "success",
  });

  setTimeout(() => {
    try {
      popupWin.close();
    } catch (e) {
      // Ignore close errors
    }
  }, 300);

  // Wait a bit for progress window to close
  await new Promise((r) => setTimeout(r, 400));

  // Show batch confirmation dialog
  const confirmedResults = await showBatchClassificationDialog(batchResults);

  // Apply the confirmed actions
  const addToAllPath = getPref("addToAllPathCollections") as boolean;

  for (const result of confirmedResults) {
    if (result.action === "reject") {
      continue;
    }

    if (result.action === "archive") {
      const archiveCollection = await getOrCreateArchiveCollection(libraryID);
      const added = await safeAddToCollection(archiveCollection, result.item.id);
      if (added) {
        totalAdded++;
      }
      continue;
    }

    // action === "confirm"
    if (result.selectedPaths.length === 0) {
      continue;
    }

    for (const path of result.selectedPaths) {
      if (addToAllPath) {
        const hierarchicalPaths = getHierarchicalPaths(path);
        for (const partialPath of hierarchicalPaths) {
          const collection = getCollectionByPath(partialPath, allCollections);
          if (collection) {
            const added = await safeAddToCollection(collection, result.item.id);
            if (added) {
              totalAdded++;
            }
          }
        }
      } else {
        const collection = getCollectionByPath(path, allCollections);
        if (collection) {
          const added = await safeAddToCollection(collection, result.item.id);
          if (added) {
            totalAdded++;
          }
        }
      }
    }
  }

  return { processed: regularItems.length, totalAdded };
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

  // Check settings
  const enableTranslation = getPref("enableChineseTranslation") as boolean;
  const batchMode = getPref("batchMode") as boolean | string;
  // Handle both boolean and string values from radio buttons
  const isBatchMode = batchMode === true || batchMode === "true";

  let result: { processed: number; totalAdded: number };

  if (isBatchMode) {
    result = await classifyItemsBatch(
      regularItems,
      allCollections,
      collectionPaths,
      libraryID,
      enableTranslation
    );
  } else {
    result = await classifyItemsOneByOne(
      regularItems,
      allCollections,
      collectionPaths,
      libraryID,
      enableTranslation
    );
  }

  // 🥚 Easter Egg 4: Random fun messages on completion
  const easterEggs = [
    "",
    "",
    "",
    "",
    "",
    "\n\n🎲 今日幸运提示：好好读论文！",
    "\n\n☕ 分类完成，该喝杯咖啡了",
    "\n\n📚 论文虐我千百遍，我待论文如初恋",
    "\n\n🚀 又整理了一批文献，离毕业更近一步！",
    "\n\n🧠 AI 已尽力，剩下的看你了",
  ];
  const egg = easterEggs[Math.floor(Math.random() * easterEggs.length)];

  // Show result summary
  win.alert(
    `${getString("result.title") || "[AI Classification Complete]"}\n\n${getString("result.processed") || "Items processed:"} ${result.processed}\n${getString("result.added") || "Collections added:"} ${result.totalAdded}${egg}`
  );
}
