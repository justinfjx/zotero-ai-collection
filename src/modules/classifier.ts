import { config } from "../../package.json";
import { AICollectionCandidate, callAI } from "./api";
import { getString } from "../utils/locale";
import { getPref } from "../utils/prefs";

const PATH_SEPARATOR = "/";

interface CollectionOption extends AICollectionCandidate {
  collection: Zotero.Collection;
  segments: string[];
  ancestors: Zotero.Collection[];
}

interface CollectionNode {
  option: CollectionOption;
  children: CollectionNode[];
}

interface EnabledCollections {
  ids: Set<number>;
  paths: Set<string>;
  allEnabledByDefault: boolean;
}

/**
 * Batch processing result for a single item
 */
interface BatchItemResult {
  item: Zotero.Item;
  title: string;
  chineseTitle?: string;
  validOptions: CollectionOption[];
  selectedOptionIDs: number[];
  action: "pending" | "confirm" | "reject" | "archive";
  error?: string;
}

/**
 * Get enabled collection identities from preferences.
 * Numeric IDs are the current format; paths are kept only for older saved settings.
 */
function getEnabledCollections(): EnabledCollections {
  try {
    const enabledJson = getPref("enabledCollections") as string;
    if (!enabledJson || enabledJson === "undefined") {
      return {
        ids: new Set(),
        paths: new Set(),
        allEnabledByDefault: true,
      };
    }
    const rawValues = JSON.parse(enabledJson);
    const ids = new Set<number>();
    const paths = new Set<string>();

    if (Array.isArray(rawValues)) {
      for (const value of rawValues) {
        if (typeof value === "number" && Number.isFinite(value)) {
          ids.add(value);
        } else if (typeof value === "string") {
          const trimmed = value.trim();
          if (/^\d+$/.test(trimmed)) {
            ids.add(Number(trimmed));
          } else if (trimmed) {
            paths.add(trimmed);
          }
        }
      }
    }

    return {
      ids,
      paths,
      allEnabledByDefault: false,
    };
  } catch {
    return {
      ids: new Set(),
      paths: new Set(),
      allEnabledByDefault: true,
    };
  }
}

function buildNodeFromCollection(
  collection: Zotero.Collection,
  parentSegments: string[] = [],
  ancestors: Zotero.Collection[] = []
): CollectionNode {
  const segments = [...parentSegments, collection.name];
  const option: CollectionOption = {
    id: collection.id,
    path: segments.join(PATH_SEPARATOR),
    collection,
    segments,
    ancestors,
  };

  return {
    option,
    children: collection
      .getChildCollections(false)
      .map((child) =>
        buildNodeFromCollection(child, segments, [...ancestors, collection])
      ),
  };
}

function buildCollectionNodes(
  collections: Zotero.Collection[]
): CollectionNode[] {
  return collections
    .filter((col) => !col.parentID)
    .map((col) => buildNodeFromCollection(col));
}

function flattenNodes(nodes: CollectionNode[]): CollectionNode[] {
  let result: CollectionNode[] = [];
  for (const node of nodes) {
    result.push(node);
    result = result.concat(flattenNodes(node.children));
  }
  return result;
}

function isNodeEnabled(
  node: CollectionNode,
  enabledCollections: EnabledCollections
): boolean {
  return (
    enabledCollections.ids.has(node.option.id) ||
    enabledCollections.paths.has(node.option.path)
  );
}

function hasEnabledDescendant(
  node: CollectionNode,
  enabledCollections: EnabledCollections
): boolean {
  for (const child of node.children) {
    if (
      isNodeEnabled(child, enabledCollections) ||
      hasEnabledDescendant(child, enabledCollections)
    ) {
      return true;
    }
  }
  return false;
}

function getLeafOptions(node: CollectionNode): CollectionOption[] {
  if (node.children.length === 0) {
    return [node.option];
  }

  let options: CollectionOption[] = [];
  for (const child of node.children) {
    options = options.concat(getLeafOptions(child));
  }
  return options;
}

/**
 * Build collection options, filtered by enabled collections.
 * Returns actual leaf nodes (deepest paths) for each enabled subtree
 */
function buildCollectionOptions(
  collections: Zotero.Collection[]
): CollectionOption[] {
  const enabledCollections = getEnabledCollections();
  const tree = buildCollectionNodes(collections);
  const allNodes = flattenNodes(tree);

  // If no enabled collections stored yet (first time), return all leaf nodes
  if (enabledCollections.allEnabledByDefault) {
    return allNodes
      .filter((node) => node.children.length === 0)
      .map((node) => node.option);
  }

  const result = new Map<number, CollectionOption>();

  for (const node of allNodes) {
    if (!isNodeEnabled(node, enabledCollections)) {
      continue;
    }

    // Skip enabled ancestors; the deepest enabled nodes define the candidate subtrees.
    if (hasEnabledDescendant(node, enabledCollections)) {
      continue;
    }

    for (const leaf of getLeafOptions(node)) {
      result.set(leaf.id, leaf);
    }
  }

  return Array.from(result.values());
}

export function buildCollectionTree(
  collections: Zotero.Collection[]
): string[] {
  return buildCollectionOptions(collections).map((option) => option.path);
}

function normalizePathForMatch(path: string): string {
  return path.trim().replace(/\s+/g, " ").toLowerCase();
}

function findOptionByPath(
  path: string,
  collectionOptions: CollectionOption[]
): CollectionOption | null {
  const exactMatch = collectionOptions.find((option) => option.path === path);
  if (exactMatch) {
    return exactMatch;
  }

  const caseInsensitiveMatches = collectionOptions.filter(
    (option) => option.path.toLowerCase() === path.trim().toLowerCase()
  );
  if (caseInsensitiveMatches.length === 1) {
    return caseInsensitiveMatches[0];
  }

  const normalizedPath = normalizePathForMatch(path);
  const normalizedMatches = collectionOptions.filter(
    (option) => normalizePathForMatch(option.path) === normalizedPath
  );
  return normalizedMatches.length === 1 ? normalizedMatches[0] : null;
}

function resolveAICollectionOptions(
  aiResult: { collectionIDs: number[]; collections: string[] },
  collectionOptions: CollectionOption[]
): CollectionOption[] {
  const optionByID = new Map(
    collectionOptions.map((option) => [option.id, option])
  );
  const resolved = new Map<number, CollectionOption>();

  for (const id of aiResult.collectionIDs || []) {
    const option = optionByID.get(id);
    if (option) {
      resolved.set(option.id, option);
    }
  }

  for (const path of aiResult.collections || []) {
    const option = findOptionByPath(path, collectionOptions);
    if (option) {
      resolved.set(option.id, option);
    }
  }

  return Array.from(resolved.values());
}

function getCollectionsToAdd(
  option: CollectionOption,
  addToAllPath: boolean
): Zotero.Collection[] {
  return addToAllPath
    ? [...option.ancestors, option.collection]
    : [option.collection];
}

interface RGBAColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

function clampColorChannel(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function parseCssColor(color: string): RGBAColor | null {
  const match = color.match(/^rgba?\((.+)\)$/i);
  if (!match) return null;

  const parts = match[1]
    .replace(/\s*\/\s*/, " ")
    .split(/[,\s]+/)
    .filter(Boolean);
  if (parts.length < 3) return null;

  const channels = parts.slice(0, 3).map((part) => {
    const value = Number.parseFloat(part);
    if (!Number.isFinite(value)) return NaN;
    return part.endsWith("%") ? (value / 100) * 255 : value;
  });
  if (channels.some((value) => !Number.isFinite(value))) return null;

  const alpha = parts[3] ? Number.parseFloat(parts[3]) : 1;

  return {
    r: clampColorChannel(channels[0]),
    g: clampColorChannel(channels[1]),
    b: clampColorChannel(channels[2]),
    a: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1,
  };
}

function getVisibleBackgroundColor(
  win: Window,
  elements: Array<Element | null>
): RGBAColor | null {
  for (const element of elements) {
    if (!element) continue;

    const color = parseCssColor(win.getComputedStyle(element).backgroundColor);
    if (color && color.a > 0.5) {
      return color;
    }
  }

  return null;
}

function getDialogBackgroundColor(doc: Document): RGBAColor | null {
  const win = doc.defaultView;
  if (!win) return null;

  return getVisibleBackgroundColor(win, [doc.body, doc.documentElement]);
}

function getZoteroWindowBackgroundColor(): RGBAColor | null {
  try {
    const win = Zotero.getMainWindow();
    const doc = win?.document;
    if (!doc) return null;

    return getVisibleBackgroundColor(win, [
      doc.querySelector("#zotero-pane"),
      doc.querySelector("#zotero-items-tree"),
      doc.body,
      doc.documentElement,
    ]);
  } catch {
    return null;
  }
}

function isDarkColor(color: RGBAColor): boolean {
  const luminance =
    (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
  return luminance < 0.5;
}

function applyReadableDialogTextColor(doc: Document): void {
  const backgroundColor =
    getDialogBackgroundColor(doc) || getZoteroWindowBackgroundColor();
  const prefersDark =
    doc.defaultView?.matchMedia?.("(prefers-color-scheme: dark)").matches ??
    false;
  const useDarkTextScheme = backgroundColor
    ? isDarkColor(backgroundColor)
    : prefersDark;
  const colorScheme = useDarkTextScheme ? "dark" : "light";
  const textColor = useDarkTextScheme ? "#ffffff" : "CanvasText";

  doc.documentElement.style.setProperty("color-scheme", colorScheme);
  doc.documentElement.style.color = textColor;

  if (doc.body) {
    doc.body.style.setProperty("color-scheme", colorScheme);
    doc.body.style.backgroundColor = "Canvas";
    doc.body.style.color = textColor;
  }
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
 * Show classification confirmation dialog with interactive checkboxes
 * Uses ztoolkit.Dialog for interactive selection
 * @returns action: "confirm" | "reject" | "archive" - user's choice
 */
async function showClassificationDialog(
  title: string,
  chineseTitle: string | undefined,
  validOptions: CollectionOption[]
): Promise<{
  action: "confirm" | "reject" | "archive" | "cancel";
  selectedOptionIDs: number[];
}> {
  return new Promise((resolve) => {
    // Track whether the promise has been resolved (to avoid duplicate resolution)
    let resolved = false;
    const safeResolve = (result: {
      action: "confirm" | "reject" | "archive" | "cancel";
      selectedOptionIDs: number[];
    }) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    const selectedOptionIDs = new Set(validOptions.map((option) => option.id));

    // Build rows for the dialog
    const rows: Array<{
      tag: string;
      namespace?: string;
      attributes?: Record<string, string>;
      properties?: Record<string, unknown>;
      children?: unknown[];
    }> = [];

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
      attributes: {
        style:
          "border-top: 1px solid currentColor; opacity: 0.3; margin: 8px 0;",
      },
    });

    // Recommended collections label
    rows.push({
      tag: "div",
      attributes: { style: "font-weight: bold; margin-bottom: 8px;" },
      properties: {
        innerText: getString("dialog.recommendedCollections") || "推荐分类:",
      },
    });

    // Create checkbox for each option with hierarchical display
    for (const option of validOptions) {
      // Show hierarchy as context (parent folders)
      const parentSegments = option.segments.slice(0, -1);
      if (parentSegments.length > 0) {
        const parentDisplay = parentSegments
          .map((name, i) => {
            return "  ".repeat(i) + "📂 " + name;
          })
          .join("\n");

        rows.push({
          tag: "div",
          attributes: {
            style:
              "opacity: 0.6; font-size: 12px; white-space: pre-wrap; margin-left: 20px;",
          },
          properties: { innerText: parentDisplay },
        });
      }

      // Leaf node with checkbox
      const leafName =
        option.segments[option.segments.length - 1] || option.path;
      const indent = "  ".repeat(option.segments.length - 1);

      rows.push({
        tag: "div",
        attributes: {
          style: "display: flex; align-items: center; margin: 4px 0 8px 20px;",
        },
        children: [
          {
            tag: "input",
            namespace: "html",
            attributes: {
              type: "checkbox",
              "data-option-id": String(option.id),
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
                  const optionID = Number(
                    target.getAttribute("data-option-id")
                  );
                  if (Number.isFinite(optionID)) {
                    if (target.checked) {
                      selectedOptionIDs.add(optionID);
                    } else {
                      selectedOptionIDs.delete(optionID);
                    }
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
      properties: {
        innerText:
          getString("dialog.helpText") || "勾选要添加的分类，然后点击确认",
      },
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
          safeResolve({
            action: "confirm",
            selectedOptionIDs: Array.from(selectedOptionIDs),
          });
        },
      })
      .addButton(
        getString("dialog.rejectAndArchive") || "拒绝并移至归档",
        "archive",
        {
          callback: () => {
            safeResolve({ action: "archive", selectedOptionIDs: [] });
          },
        }
      )
      .addButton(getString("dialog.cancel") || "拒绝添加", "cancel", {
        callback: () => {
          safeResolve({ action: "reject", selectedOptionIDs: [] });
        },
      })
      // Handle window close button (X) - resolve as cancel to stop entire process
      .setDialogData({
        loadCallback: () => {
          if (dialogHelper.window?.document) {
            applyReadableDialogTextColor(dialogHelper.window.document);
          }

          // Add unload event listener after window is loaded
          if (dialogHelper.window) {
            dialogHelper.window.addEventListener("unload", () => {
              ztoolkit.log("[AI Classifier] Window unload event triggered");
              safeResolve({ action: "cancel", selectedOptionIDs: [] });
            });
          }
        },
        beforeUnloadCallback: () => {
          ztoolkit.log(
            "[AI Classifier] beforeUnloadCallback triggered, resolved=",
            resolved
          );
          safeResolve({ action: "cancel", selectedOptionIDs: [] });
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
    const itemStates: Map<
      number,
      {
        action: "pending" | "confirm" | "reject" | "archive";
        selectedOptionIDs: Set<number>;
      }
    > = new Map();

    // Store results for access in event handlers
    const resultsMap: Map<number, BatchItemResult> = new Map();

    // Initialize states
    for (const result of results) {
      resultsMap.set(result.item.id, result);
      if (result.error || result.validOptions.length === 0) {
        itemStates.set(result.item.id, {
          action: "reject",
          selectedOptionIDs: new Set(),
        });
      } else {
        itemStates.set(result.item.id, {
          action: "confirm",
          selectedOptionIDs: new Set(
            result.validOptions.map((option) => option.id)
          ),
        });
      }
    }

    // Function to update item display
    const updateItemDisplay = (doc: Document, itemId: number) => {
      const state = itemStates.get(itemId);
      if (!state) return;

      const statusEl = doc.querySelector(
        `[data-item-id="${itemId}"][data-status="true"]`
      );
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
      const collectionsEl = doc.querySelector(
        `[data-item-id="${itemId}"][data-collections="true"]`
      );
      if (collectionsEl) {
        (collectionsEl as HTMLElement).style.opacity =
          state.action === "confirm" ? "1" : "0.4";
      }

      // Update checkbox states
      const checkboxes = doc.querySelectorAll(
        `input[data-item-id="${itemId}"][data-option-id]`
      );
      checkboxes.forEach((cb) => {
        const checkbox = cb as HTMLInputElement;
        const optionID = Number(checkbox.getAttribute("data-option-id"));
        if (Number.isFinite(optionID)) {
          checkbox.checked = state.selectedOptionIDs.has(optionID);
        }
      });
    };

    // Create button click handler factory
    const createButtonClickHandler = (
      dialog: any,
      itemId: number,
      action: "confirm" | "reject" | "archive"
    ) => {
      return () => {
        const state = itemStates.get(itemId);
        const result = resultsMap.get(itemId);
        if (state && result) {
          state.action = action;
          if (action === "confirm") {
            state.selectedOptionIDs = new Set(
              result.validOptions.map((option) => option.id)
            );
          } else {
            state.selectedOptionIDs.clear();
          }
          if (dialog.window?.document) {
            updateItemDisplay(dialog.window.document, itemId);
          }
        }
      };
    };

    // Create checkbox change handler factory
    const createCheckboxChangeHandler = (
      dialog: any,
      itemId: number,
      optionID: number
    ) => {
      return (e: Event) => {
        const checkbox = e.target as HTMLInputElement;
        const state = itemStates.get(itemId);
        if (state) {
          if (checkbox.checked) {
            state.selectedOptionIDs.add(optionID);
            state.action = "confirm";
          } else {
            state.selectedOptionIDs.delete(optionID);
            if (
              state.selectedOptionIDs.size === 0 &&
              state.action === "confirm"
            ) {
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
      properties: {
        innerText: `📚 ${
          getString("dialog.batchTitle") || "AI 批量分类确认"
        } (${results.length} ${results.length > 1 ? "items" : "item"})`,
      },
    });

    // Help text
    rows.push({
      tag: "div",
      styles: { opacity: "0.7", marginBottom: "12px", fontSize: "12px" },
      properties: {
        innerText: getString("dialog.batchHelpText") || "为每篇文献选择操作",
      },
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
          properties: {
            innerText: `${i + 1}. 📄 ${result.title.slice(0, 60)}${
              result.title.length > 60 ? "..." : ""
            }`,
          },
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
            {
              type: "click",
              listener: createButtonClickHandler(
                dialogHelper,
                itemId,
                "confirm"
              ),
            },
          ],
        },
        {
          tag: "button",
          styles: { padding: "2px 6px", fontSize: "10px", cursor: "pointer" },
          properties: {
            textContent: getString("dialog.rejectAndArchive") || "拒绝并归档",
          },
          listeners: [
            {
              type: "click",
              listener: createButtonClickHandler(
                dialogHelper,
                itemId,
                "archive"
              ),
            },
          ],
        },
        {
          tag: "button",
          styles: { padding: "2px 6px", fontSize: "10px", cursor: "pointer" },
          properties: { textContent: getString("dialog.reject") || "拒绝" },
          listeners: [
            {
              type: "click",
              listener: createButtonClickHandler(
                dialogHelper,
                itemId,
                "reject"
              ),
            },
          ],
        },
      ];

      // Header row with title and buttons
      const headerRow: any = {
        tag: "div",
        styles: {
          display: "flex",
          alignItems: "flex-start",
          gap: "8px",
          marginBottom: "6px",
        },
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
      } else if (result.validOptions.length > 0) {
        const collectionItems: any[] = [];
        for (const option of result.validOptions) {
          collectionItems.push({
            tag: "div",
            styles: { display: "flex", alignItems: "center", margin: "2px 0" },
            children: [
              {
                tag: "input",
                attributes: {
                  type: "checkbox",
                  "data-item-id": String(itemId),
                  "data-option-id": String(option.id),
                },
                properties: { checked: true },
                styles: { marginRight: "6px" },
                listeners: [
                  {
                    type: "change",
                    listener: createCheckboxChangeHandler(
                      dialogHelper,
                      itemId,
                      option.id
                    ),
                  },
                ],
              },
              {
                tag: "span",
                properties: { innerText: `📁 ${option.path}` },
              },
            ],
          });
        }

        itemBoxChildren.push({
          tag: "div",
          attributes: {
            "data-item-id": String(itemId),
            "data-collections": "true",
          },
          styles: { marginLeft: "20px", fontSize: "12px" },
          children: collectionItems,
        });
      } else {
        itemBoxChildren.push({
          tag: "div",
          styles: { opacity: "0.6", fontSize: "12px", marginLeft: "20px" },
          properties: {
            innerText:
              getString("error.noclassification") || "未找到合适的分类",
          },
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
        styles: {
          borderBottom: "1px solid currentColor",
          opacity: "0.8",
          padding: "10px 0",
          marginBottom: "8px",
        },
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
            if (state && !result.error && result.validOptions.length > 0) {
              state.action = "confirm";
              state.selectedOptionIDs = new Set(
                result.validOptions.map((option) => option.id)
              );
            }
          }
          const finalResults = results.map((r) => {
            const state = itemStates.get(r.item.id);
            return {
              ...r,
              action: state?.action || "reject",
              selectedOptionIDs: state
                ? Array.from(state.selectedOptionIDs)
                : [],
            } as BatchItemResult;
          });
          resolve(finalResults);
        },
      })
      .addButton(
        getString("dialog.archiveAll") || "全部拒绝并归档",
        "archiveAll",
        {
          callback: () => {
            const finalResults = results.map((r) => ({
              ...r,
              action: "archive" as const,
              selectedOptionIDs: [],
            }));
            resolve(finalResults);
          },
        }
      )
      .addButton(getString("dialog.rejectAll") || "全部拒绝", "rejectAll", {
        callback: () => {
          const finalResults = results.map((r) => ({
            ...r,
            action: "reject" as const,
            selectedOptionIDs: [],
          }));
          resolve(finalResults);
        },
      })
      .addButton(
        getString("dialog.confirmAllStates") || "确认以上所有状态",
        "confirmStates",
        {
          callback: () => {
            // Build final results based on current individual states
            const finalResults = results.map((r) => {
              const state = itemStates.get(r.item.id);
              return {
                ...r,
                action: state?.action || "reject",
                selectedOptionIDs: state
                  ? Array.from(state.selectedOptionIDs)
                  : [],
              } as BatchItemResult;
            });
            resolve(finalResults);
          },
        }
      )
      .setDialogData({
        itemStates,
        resultsMap,
        loadCallback: () => {
          if (dialogHelper.window?.document) {
            applyReadableDialogTextColor(dialogHelper.window.document);
          }
        },
      })
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
  collectionOptions: CollectionOption[],
  libraryID: number,
  enableTranslation: boolean
): Promise<{ processed: number; totalAdded: number }> {
  const win = Zotero.getMainWindow();
  let totalAdded = 0;
  let processed = 0;
  const optionByID = new Map(
    collectionOptions.map((option) => [option.id, option])
  );

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
    const abstract =
      (currentItem.getField("abstractNote") as string) || "无摘要";

    try {
      // Update progress
      popupWin.changeLine({
        progress: Math.round((processed / regularItems.length) * 100),
        text: `[${processed}/${regularItems.length}] ${title.slice(0, 30)}...`,
      });

      const aiResult = await callAI(
        title,
        abstract,
        collectionOptions,
        enableTranslation
      );
      const chineseTitle = aiResult.chineseTitle;
      const validOptions = resolveAICollectionOptions(
        aiResult,
        collectionOptions
      );

      if (validOptions.length === 0) {
        win.alert(
          `[${processed}/${regularItems.length}] ${
            getString("error.noclassification") ||
            "No suitable classification found"
          }\n\n${title}`
        );
        continue;
      }

      // Show confirmation dialog
      const dialogResult = await showClassificationDialog(
        title,
        chineseTitle,
        validOptions
      );

      // Handle user's choice
      ztoolkit.log(
        "[AI Classifier] Dialog result action:",
        dialogResult.action
      );
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
        const added = await safeAddToCollection(
          archiveCollection,
          currentItem.id
        );
        if (added) {
          totalAdded++;
        }
        continue;
      }

      // action === "confirm"
      if (dialogResult.selectedOptionIDs.length === 0) {
        continue;
      }

      const addToAllPath = getPref("addToAllPathCollections") as boolean;

      for (const optionID of dialogResult.selectedOptionIDs) {
        const option = optionByID.get(optionID);
        if (!option) {
          continue;
        }

        for (const collection of getCollectionsToAdd(option, addToAllPath)) {
          const added = await safeAddToCollection(collection, currentItem.id);
          if (added) {
            totalAdded++;
          }
        }
      }
    } catch (e: any) {
      ztoolkit.log("Classification error:", e);
      win.alert(
        `[${processed}/${regularItems.length}] ${
          getString("error.processing") || "Processing failed:"
        } ${e.message}\n\n${title}`
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
  collectionOptions: CollectionOption[],
  libraryID: number,
  enableTranslation: boolean
): Promise<{ processed: number; totalAdded: number }> {
  let totalAdded = 0;
  const optionByID = new Map(
    collectionOptions.map((option) => [option.id, option])
  );

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
    const abstract =
      (currentItem.getField("abstractNote") as string) || "无摘要";

    // Update progress
    popupWin.changeLine({
      progress: Math.round(((i + 1) / regularItems.length) * 100),
      text: `[${i + 1}/${regularItems.length}] ${title.slice(0, 30)}...`,
    });

    try {
      const aiResult = await callAI(
        title,
        abstract,
        collectionOptions,
        enableTranslation
      );
      const chineseTitle = aiResult.chineseTitle;
      const validOptions = resolveAICollectionOptions(
        aiResult,
        collectionOptions
      );

      batchResults.push({
        item: currentItem,
        title,
        chineseTitle,
        validOptions,
        selectedOptionIDs: validOptions.map((option) => option.id),
        action: validOptions.length > 0 ? "pending" : "reject",
      });
    } catch (e: any) {
      ztoolkit.log("Classification error:", e);
      batchResults.push({
        item: currentItem,
        title,
        validOptions: [],
        selectedOptionIDs: [],
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
      const added = await safeAddToCollection(
        archiveCollection,
        result.item.id
      );
      if (added) {
        totalAdded++;
      }
      continue;
    }

    // action === "confirm"
    if (result.selectedOptionIDs.length === 0) {
      continue;
    }

    for (const optionID of result.selectedOptionIDs) {
      const option = optionByID.get(optionID);
      if (!option) {
        continue;
      }

      for (const collection of getCollectionsToAdd(option, addToAllPath)) {
        const added = await safeAddToCollection(collection, result.item.id);
        if (added) {
          totalAdded++;
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
  const collectionOptions = buildCollectionOptions(allCollections);

  if (collectionOptions.length === 0) {
    win.alert(
      getString("error.nocollections") || "No collections found in library"
    );
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
      collectionOptions,
      libraryID,
      enableTranslation
    );
  } else {
    result = await classifyItemsOneByOne(
      regularItems,
      collectionOptions,
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
    `${getString("result.title") || "[AI Classification Complete]"}\n\n${
      getString("result.processed") || "Items processed:"
    } ${result.processed}\n${
      getString("result.added") || "Collections added:"
    } ${result.totalAdded}${egg}`
  );
}
