// DIGEST-TABLE-1 (issue 9645): the sent-as-you digest is a table, not truncated prose.
import { readFileSync } from "node:fs";
import assert from "node:assert";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
assert.ok(src.includes('"date | channel | title | link"'), "digest has a table header");
assert.ok(src.includes('"By channel: "'), "digest has per-channel counts");
assert.ok(!src.includes("items.slice(0, 80)"), "digest lists every item, not the first 80");
console.log("digest-table ok");
