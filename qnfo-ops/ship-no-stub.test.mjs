// SHIP-NO-STUB-1: a docs-only change is refused; the focus nudge exists.
import { readFileSync } from "node:fs";
import assert from "node:assert";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
assert.ok(src.includes("SHIP-NO-STUB-1: every file is documentation"), "stub guard present in shipChange");
assert.ok(/var CODE_FOCUS_NUDGE = /.test(src) && src.includes("iter === 3) messages.push({ role: \"system\", content: CODE_FOCUS_NUDGE"), "focus nudge wired at round 3");
const guard = src.indexOf("SHIP-NO-STUB-1: every file");
assert.ok(guard > src.indexOf("async function shipChange") && guard < src.indexOf("opsFileCodeIssue(env, title, summary || title, \"ship_change\")"), "guard runs before the issue is filed");
console.log("ship-no-stub ok");
