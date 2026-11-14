// SHIP-NO-STUB-2 / CODE-FOCUS-NUDGE-1 / TASK-PIN-FIRST-1: source-level wiring; behaviour is in ship-change.test.mjs.
import { readFileSync } from "node:fs";
import assert from "node:assert";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
assert.ok(src.includes("SHIP-NO-STUB-2: the change is a handoff note"), "stub guard present");
assert.ok(!src.includes("allow_docs"), "no self-service opt-out");
assert.ok(!src.includes("Analytics tasks live in"), "focus nudge is generic");
assert.ok(src.includes("iter === 3) messages.push({ role: \"system\", content: CODE_FOCUS_NUDGE"), "focus nudge wired at round 3");
assert.ok(src.includes("TASK-PIN-FIRST-1") && src.includes("[original task, kept when older history was dropped]"), "first user message is pinned through truncation");
console.log("ship-no-stub ok");
