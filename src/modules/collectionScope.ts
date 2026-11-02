import { getPref } from "../utils/prefs";
import type { AICollectionCandidate } from "./api";

export interface EnabledCollections {
  ids: Set<number>;
  paths: Set<string>;
  allEnabledByDefault: boolean;
}

/**
 * Get enabled collection identities from preferences.
 * Numeric IDs are the current format; paths are kept only for older saved settings.
 */
export function getEnabledCollections(): EnabledCollections {
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

/** Whether a collection is included in the user's saved classification scope. */
export function isCollectionEnabled(
  collection: AICollectionCandidate,
  enabled: EnabledCollections = getEnabledCollections()
): boolean {
  return (
    enabled.allEnabledByDefault ||
    enabled.ids.has(collection.id) ||
    enabled.paths.has(collection.path)
  );
}
