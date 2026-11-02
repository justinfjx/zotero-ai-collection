import type { AICollectionCandidate } from "./api";

export const PATH_SEPARATOR = "/";

export interface CollectionOption extends AICollectionCandidate {
  collection: Zotero.Collection;
  segments: string[];
  ancestors: Zotero.Collection[];
}

export interface CollectionNode {
  option: CollectionOption;
  children: CollectionNode[];
}

/**
 * Build the collection tree below one collection
 * @param collection - The root collection of the subtree
 * @param maxDepth - Deepest level to include (1 = top-level only); 0 means unlimited
 * @param parentSegments - Names of the parents above this collection
 * @param ancestors - The parent collections above this collection
 * @returns The node for this collection with its children
 */
function buildNodeFromCollection(
  collection: Zotero.Collection,
  maxDepth: number,
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

  const atDepthLimit = maxDepth > 0 && segments.length >= maxDepth;

  return {
    option,
    children: atDepthLimit
      ? []
      : collection
          .getChildCollections(false)
          .map((child) =>
            buildNodeFromCollection(child, maxDepth, segments, [
              ...ancestors,
              collection,
            ])
          ),
  };
}

/**
 * Build the collection trees for a library
 * @param collections - All collections in the library
 * @param maxDepth - Deepest level to include (1 = top-level only); 0 means unlimited
 * @returns One node per top-level collection
 */
export function buildCollectionNodes(
  collections: Zotero.Collection[],
  maxDepth = 0
): CollectionNode[] {
  return collections
    .filter((col) => !col.parentID)
    .map((col) => buildNodeFromCollection(col, maxDepth));
}

export function flattenNodes(nodes: CollectionNode[]): CollectionNode[] {
  let result: CollectionNode[] = [];
  for (const node of nodes) {
    result.push(node);
    result = result.concat(flattenNodes(node.children));
  }
  return result;
}

export function getLeafOptions(node: CollectionNode): CollectionOption[] {
  if (node.children.length === 0) {
    return [node.option];
  }

  let options: CollectionOption[] = [];
  for (const child of node.children) {
    options = options.concat(getLeafOptions(child));
  }
  return options;
}
