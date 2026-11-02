import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

const source = transformSync(
  readFileSync(new URL("../src/utils/webGlobals.ts", import.meta.url), "utf8"),
  { loader: "ts", format: "cjs" }
).code;

test("exposes the SDK's stream and request-cancellation globals in a bare plugin scope", () => {
  const sandbox: any = { module: { exports: {} }, console: undefined };
  runInNewContext(source, sandbox);
  const win: any = {
    TransformStream,
    ReadableStream,
    WritableStream,
    TextDecoderStream,
    TextEncoderStream,
    AbortController,
    AbortSignal,
    console,
  };
  sandbox.module.exports.exposeWebGlobals(win);
  for (const [name, value] of Object.entries(win))
    assert.equal(sandbox[name], value);
  const controller = new sandbox.AbortController();
  assert.ok(controller.signal instanceof sandbox.AbortSignal);
  controller.abort();
  assert.equal(controller.signal.aborted, true);
});

test("keeps globals that the host already provides", () => {
  const existing = class ExistingReadable {};
  const sandbox: any = {
    module: { exports: {} },
    ReadableStream: existing,
    console,
  };
  runInNewContext(source, sandbox);
  sandbox.module.exports.exposeWebGlobals({ ReadableStream, console: {} });
  assert.equal(sandbox.ReadableStream, existing);
  assert.equal(sandbox.console, console);
});
