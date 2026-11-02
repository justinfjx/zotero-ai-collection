import {
  buildCollectionNodes,
  flattenNodes,
  PATH_SEPARATOR,
} from "./collectionTree";

/**
 * Get the existing collections of a library by path
 * @param libraryID - The library ID
 * @returns Map from path (e.g. "A/B") to collection
 */
export function getCollectionsByPath(
  libraryID: number
): Map<string, Zotero.Collection> {
  const collections = Zotero.Collections.getByLibrary(libraryID);
  return new Map(
    flattenNodes(buildCollectionNodes(collections)).map((node) => [
      node.option.path,
      node.option.collection,
    ])
  );
}

/**
 * Create the collections in a list of paths that do not exist yet
 * @param libraryID - The library ID
 * @param paths - Paths to create, parents before children
 * @returns The paths that were created
 */
export async function createMissingCollections(
  libraryID: number,
  paths: string[]
): Promise<string[]> {
  const byPath = getCollectionsByPath(libraryID);
  const created: string[] = [];

  for (const path of paths) {
    if (byPath.has(path)) {
      continue;
    }
    const segments = path.split(PATH_SEPARATOR);
    const parentPath = segments.slice(0, -1).join(PATH_SEPARATOR);
    const parent = byPath.get(parentPath);
    if (parentPath && !parent) {
      throw new Error(`Parent collection is missing for ${path}`);
    }

    const collection = new Zotero.Collection({
      libraryID,
      name: segments[segments.length - 1],
      parentID: parent?.id,
    });
    await collection.saveTx();

    byPath.set(path, collection);
    created.push(path);
  }
  return created;
}
