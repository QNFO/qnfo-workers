// EVOLVE-1 offline suite: proves the organ that turns the fleet's own gap registers into named work.
//
// It loads qnfo-evolve/worker.js the way the deployer ships it (one self-contained script, no
// imports -- canonical-deploy PUTs worker.js verbatim, so an import would ship as an unresolved
// specifier), stubs only addEventListener, and pins the four decisions that matter:
//   1. a step whose path list is literally "none automatic" is single-path, not healthy;
//   2. a gap keeps one stable key across ticks, so dedupe cannot re-file it every quarter hour;
//   3. the filed issue names the live worker AND the file AND a query for its definition of done --
//      the exact shape 67 of 128 plans were refused for missing on 2026-10-17;
//   4. the budget holds: never more than the per-tick cap, never past the open-filing cap.
//
// Run: node qnfo-evolve/evolve.test.mjs

import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) pass++;
  else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); }
};

/* Load without a bundler: the module has no imports, so the source can be evaluated as one body. */
const mod = new Function("addEventListener", "console", src + "\n;return { isSinglePath, gapKey, buildIssue, pickNew, VERSION, SOURCE, MAX_OPEN, MAX_NEW_PER_TICK };")
  (() => {}, { log() {} });

ok(/^\d+\.\d+\.\d+/.test(mod.VERSION), "VERSION is semver-shaped", mod.VERSION);
ok(mod.SOURCE === "qnfo-evolve|EVOLVE-1", "source carries the loop identity", mod.SOURCE);

/* Raw-PUT safety: the deployed artefact is this file, so it must not depend on a bundler. */
ok(!/^\s*import\s/m.test(src), "worker.js has no top-level import");
ok(!/^\s*export\s/m.test(src), "worker.js has no top-level export");

/* 1. single-path detection, including the fleet's own "none automatic" wording. */
ok(mod.isSinglePath('["a","b"]') === false, "two paths is not single-path");
ok(mod.isSinglePath('["none automatic beyond research-review-error","session doer"]') === true,
  '"none automatic" counts as single-path even beside a manual path');
ok(mod.isSinglePath('["a"]') === true, "one path is single-path");
ok(mod.isSinglePath("") === true, "an empty register entry is single-path");
ok(mod.isSinglePath('["re-dispatch","park","session"]') === false, "three paths is not single-path");

/* 2. stable keys. */
const k1 = mod.gapKey("single-path", "queue:code-task-stalled", "unfinished code task not updated");
const k2 = mod.gapKey("single-path", "queue:code-task-stalled", "unfinished code task not updated");
const k3 = mod.gapKey("single-path", "queue:issue-unremediated", "no doer");
ok(k1 === k2, "the same gap keeps the same key");
ok(k1 !== k3, "a different gap gets a different key");
ok(/^single-path:[0-9a-f]{8}$/.test(k1), "key shape is kind:hash", k1);

/* 3. the filed issue is farmable: worker, file, reproduce, definition of done. */
const row = {
  process: "queue:research-head-stalled",
  step: "rows queued or researching and no qnfo-research-exec done-ok event in 60 min",
  sla_min: 60,
  evidence: { paths: '["none automatic beyond research-review-error","session doer with close evidence"]' },
  probe: "SELECT COUNT(*) AS n FROM v_process_path_gaps WHERE process = 'queue:research-head-stalled'"
};
const issue = mod.buildIssue("single-path", row, "qnfo-research-exec", "qnfo-research-exec/worker.js");
ok(issue.title.startsWith("EVOLVE-1: "), "title carries the marker", issue.title);
ok(issue.title.includes("queue:research-head-stalled"), "title names the process", issue.title);
ok(issue.description.includes("worker: qnfo-research-exec"), "names the live worker");
ok(issue.description.includes("file: qnfo-research-exec/worker.js"), "names the file");
ok(issue.description.includes("reproduce: SELECT COUNT(*)"), "carries a query to reproduce");
ok(issue.description.includes("definition of done:"), "carries a definition of done");
ok(issue.description.includes("0 rows"), "done is a query result, not prose");
ok(issue.priority === "high", "single-path is high priority", issue.priority);
ok(issue.key === mod.gapKey("single-path", row.process, row.step), "issue key matches the gap", issue.key);

/* A quote in a step name must not break the probe SQL. */
const quoted = mod.buildIssue("single-path", { process: "p", step: "it's broken", probe: "SELECT 1" }, "qnfo-social", "qnfo-social/worker.js");
ok(quoted.description.includes("it's broken"), "quotes survive into the issue text");

/* 4. budget and dedupe. */
const cands = [
  { key: "a", title: "A" }, { key: "b", title: "B" },
  { key: "c", title: "C" }, { key: "d", title: "D" }
];
ok(mod.pickNew(cands, [], 10, 2).length === 2, "per-tick cap is honoured");
ok(mod.pickNew(cands, [], 1, 2).length === 1, "room cap is honoured");
ok(mod.pickNew(cands, ["a", "b"], 10, 5).map((x) => x.key).join("") === "cd", "open filings are deduped");
ok(mod.pickNew(cands, [], 0, 2).length === 0, "no room means no filing");

/* The cron must satisfy CRON_RATE_GUARD-1 (>= 10 minutes between fires, circular). */
const cronLine = (toml.match(/^crons\s*=\s*\[([^\]]+)\]/m) || [])[1] || "";
const minutes = cronLine.trim().replace(/"/g, "").split(",").map((s) => parseInt(s, 10));
ok(minutes.length >= 1 && minutes.every((m) => m >= 0 && m < 60), "cron minutes parse", minutes);
minutes.sort((a, b) => a - b);
let minGap = 60 - minutes[minutes.length - 1] + minutes[0];
for (let i = 1; i < minutes.length; i++) minGap = Math.min(minGap, minutes[i] - minutes[i - 1]);
ok(minGap >= 10, "cron spacing is at least 10 minutes", minGap);

/* The charter pillar comment charter-guard.py reads must be present and be a real pillar key. */
ok(/# charter-pillar: autonomy/.test(toml), "wrangler.toml declares a charter pillar");
ok(/binding = "AUDIT"/.test(toml), "the AUDIT binding is declared");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
