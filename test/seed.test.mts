import test from "node:test";
import assert from "node:assert/strict";
import { parseSeed } from "../src/modules/seed.ts";

test("expands each line into its parent paths, parents first", () => {
  assert.deepEqual(parseSeed("A/B/C"), ["A", "A/B", "A/B/C"]);
});

test("removes duplicate paths across lines", () => {
  assert.deepEqual(parseSeed("A/B\nA/C\nA/B"), ["A", "A/B", "A/C"]);
});

test("ignores blank lines, comments and stray whitespace", () => {
  const text = "# my topics\n\n  A / B  \r\n\nC\n";
  assert.deepEqual(parseSeed(text), ["A", "A/B", "C"]);
});

test("drops empty segments", () => {
  assert.deepEqual(parseSeed("A//B/"), ["A", "A/B"]);
});

test("truncates paths deeper than the depth limit", () => {
  assert.deepEqual(parseSeed("A/B/C\nD", 2), ["A", "A/B", "D"]);
  assert.deepEqual(parseSeed("A/B/C", 1), ["A"]);
});

test("returns nothing for empty input", () => {
  assert.deepEqual(parseSeed(""), []);
  assert.deepEqual(parseSeed("# only a comment"), []);
});
