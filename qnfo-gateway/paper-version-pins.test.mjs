// PAPER-PIDS-PIN-2 (issue 9790): the pin write is insert-or-ignore (pins never updated), drift is logged, and the header is set.
import { readFileSync } from "node:fs";
import assert from "node:assert";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mig = readFileSync(new URL("../migrations/2026-11-09-paper-version-pins.sql", import.meta.url), "utf8");
assert.ok(src.includes("INSERT OR IGNORE INTO paper_version_pins"), "insert-or-ignore pin");
assert.ok(!/UPDATE paper_version_pins/.test(src), "pins are never updated");
assert.ok(src.includes("INSERT INTO paper_version_drift"), "drift is logged");
assert.ok(src.includes('"X-Content-Pin-Status": pinStatus'), "header set");
assert.ok(/PRIMARY KEY \(slug, version\)/.test(mig), "one pin per slug+version");
console.log("paper-version-pins: passed");
