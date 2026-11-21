// DEV-FOCUS-1 (owner 2026-11-21): automated development goes to the personal companion; QNFO, QWav and the Q08 side projects are parked.
// Proves the focus file is well formed and that its consumer, the Copilot assignment sweep, parks off-focus issues by default.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { focusDenied, DEV_FOCUS } from "../scripts/assign-copilot-sweep.mjs";

const focus = JSON.parse(readFileSync(new URL("./dev-focus.json", import.meta.url), "utf8"));
const issue = (o) => Object.assign({ owner: "QNFO", repo: "qnfo-workers", number: 1, title: "", body: "", labels: [] }, o);

test("the focus file names the companion, its build repository, and what is parked", () => {
  assert.equal(focus.id, "DEV-FOCUS-1");
  assert.ok(focus.build_repos.includes("rwnq8/personal-life"));
  assert.ok(focus.keywords.length >= 3 && focus.parked.length >= 3);
  assert.ok(focus.kept_running.some((k) => /mail/i.test(k)), "QNFO mail keeps running");
  assert.deepEqual(DEV_FOCUS, focus, "the sweep reads the same file");
});

test("off-focus QNFO work is parked; companion work, red main and security still go", () => {
  assert.equal(focusDenied(issue({ title: "IDA-SIGNAL-2: paper signal view" }), focus), "parked-by-dev-focus");
  assert.equal(focusDenied(issue({ title: "METRIC-TRIGGER-9: papers_queued_over_120m" }), focus), "parked-by-dev-focus");
  assert.equal(focusDenied(issue({ title: "COMPANION-SELFCHECK-1:inbox-stuck" }), focus), null);
  assert.equal(focusDenied(issue({ title: "Fix Ask", body: "me.q08.org shows the fallback line" }), focus), null);
  assert.equal(focusDenied(issue({ owner: "rwnq8", repo: "personal-life", title: "anything" }), focus), null);
  assert.equal(focusDenied(issue({ title: "main is red", labels: ["ci-watchdog"] }), focus), null);
  assert.equal(focusDenied(issue({ title: "x", priority: true }), focus), null, "the issue that fired the run still goes");
});

test("the sweep runs with the focus filter on unless ASSIGN_COPILOT_FOCUS is off", () => {
  const src = readFileSync(new URL("../scripts/assign-copilot-sweep.mjs", import.meta.url), "utf8");
  assert.match(src, /focusFilter: String\(env\.ASSIGN_COPILOT_FOCUS \|\| "on"\)\.toLowerCase\(\) !== "off"/);
  assert.match(src, /if \(o\.focusFilter === true\) \{ const why = focusDenied\(n\)/);
});
