/**
 * Normalize a model's collection selection into numeric IDs and path strings
 * @param value - Raw `collectionIDs` value from the model
 * @returns De-duplicated IDs and any non-numeric entries (treated as paths)
 */
export function parseCollectionSelection(value: unknown): {
  collectionIDs: number[];
  collections: string[];
} {
  const collectionIDs: number[] = [];
  const collections: string[] = [];

  if (!Array.isArray(value)) {
    return { collectionIDs, collections };
  }

  for (const item of value) {
    if (typeof item === "number" && Number.isFinite(item)) {
      collectionIDs.push(item);
      continue;
    }

    if (typeof item === "string") {
      const trimmed = item.trim();
      if (!trimmed) {
        continue;
      }

      if (/^\d+$/.test(trimmed)) {
        collectionIDs.push(Number(trimmed));
      } else {
        collections.push(trimmed);
      }
    }
  }

  return {
    collectionIDs: Array.from(new Set(collectionIDs)),
    collections: Array.from(new Set(collections)),
  };
}
