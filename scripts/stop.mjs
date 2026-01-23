import process from "process";
import { execSync } from "child_process";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const cmd = require("./zotero-cmd.json");
const { killZoteroWindows, killZoteroUnix } = cmd;

try {
  if (process.platform === "win32") {
    execSync(killZoteroWindows);
  } else {
    execSync(killZoteroUnix);
  }
} catch (e) {
  console.error(e);
}
