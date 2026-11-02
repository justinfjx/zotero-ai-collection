import { PATH_SEPARATOR } from "./collectionTree";

/**
 * Parse seed text into collection paths.
 * One path per line, e.g. "Algorithms/Variational". Blank lines and lines
 * starting with # are ignored.
 * @param text - The seed text
 * @param maxDepth - Deepest level to keep (0 = unlimited)
 * @returns Every path including its parent paths, parents first, without duplicates
 */
export function parseSeed(text: string, maxDepth = 0): string[] {
  const paths = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const segments = trimmed
      .split(PATH_SEPARATOR)
      .map((segment) => segment.trim())
      .filter(Boolean);
    const kept = maxDepth > 0 ? segments.slice(0, maxDepth) : segments;
    for (let depth = 1; depth <= kept.length; depth++) {
      paths.add(kept.slice(0, depth).join(PATH_SEPARATOR));
    }
  }
  return Array.from(paths);
}
