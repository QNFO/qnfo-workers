import fs from "node:fs"; import assert from "node:assert";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
assert.match(src, /CREATE TABLE IF NOT EXISTS seo_404_paths/);
assert.match(src, /row\.status === 404 && row\.path/);
assert.match(src, /path: u\.pathname\.slice\(0, 160\)/);
console.log("ok");
