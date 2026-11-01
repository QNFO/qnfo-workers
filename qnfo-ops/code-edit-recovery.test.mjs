// CODE-EDIT-RECOVERY-1: stale search anchors must lead to a fresh read, not repeated failed edits.
import { readFileSync } from "node:fs";
import { versionAtLeast } from "../scripts/version-at-least.mjs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const prompt = src.split("\n").find((line) => line.trimStart().startsWith('"C4. LOOP UNTIL DONE.')) || "";
let pass = 0, fail = 0;
const ok = (condition, message) => {
  if (condition) pass++;
  else {
    fail++;
    console.log("FAIL " + message);
  }
};

ok(prompt.includes("stale or unmatched SEARCH/hunk"), "the code-agent prompt recognizes stale edit anchors");
ok(prompt.includes("re-read the current file and rebuild the edit"), "the code agent is directed to recover from the current source");
ok(prompt.includes("never retry the same stale search"), "the code agent is told not to repeat a failed anchor");
ok(versionAtLeast((/var VERSION = "([^"]*)"/.exec(src) || [])[1] || "", "2.60.4"), "VERSION is at least 2.60.4");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
