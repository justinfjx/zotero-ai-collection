const SDK_GLOBALS = [
  "TransformStream",
  "ReadableStream",
  "WritableStream",
  "TextDecoderStream",
  "TextEncoderStream",
  "AbortController",
  "AbortSignal",
];

/**
 * Copy stream, request-cancellation and console globals from the main window.
 * Must run after the main window exists and before libraries that use them load.
 * @param win - The Zotero main window
 */
export function exposeWebGlobals(win: Window): void {
  const target = globalThis as Record<string, any>;
  for (const name of SDK_GLOBALS) {
    if (typeof target[name] === "undefined") {
      target[name] = (win as any)[name];
    }
  }
  // The AI SDK reports warnings through console, which the sandbox lacks
  if (typeof target.console === "undefined") {
    target.console = (win as any).console;
  }
}
