// CODEQL-DEFAULT-PRECHECK-2 offline suite: the precheck of .github/workflows/codeql.yml decides whether the advanced CodeQL analysis runs or defers to GitHub's
// "default setup". It used to treat "the dynamic workflow is listed active" as "default setup is on". That entry stays active after default setup is switched
// off, so on 2026-10-30 the analysis had been skipped for good: the last scan of main was 2026-10-13 and 220 alerts were stale.
// This runs the real step script from the YAML against a fake `gh` that applies the script's own --jq filters with jq to canned API bodies.
// Proves: configured only while the dynamic workflow has run in the last 7 days; a listed-but-idle entry, a missing, disabled or run-less one runs the
// analysis; any failed read runs it (unknown); the analyze job still defers only on "configured".
// Run: node scripts/codeql-precheck.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const here = dirname(fileURLToPath(import.meta.url));
const yml = readFileSync(join(here, "..", ".github", "workflows", "codeql.yml"), "utf8");
const lines = yml.split("\n");
const at = lines.findIndex((l) => /^\s*- id: state\s*$/.test(l));
ok(at > 0, "the precheck has a step with id state");
const runAt = lines.findIndex((l, i) => i > at && /^\s*run: \|\s*$/.test(l));
const indent = lines[runAt].match(/^\s*/)[0].length + 2;
const body = [];
for (let i = runAt + 1; i < lines.length; i++) {
  if (lines[i].trim() === "") { body.push(""); continue; }
  if (lines[i].match(/^\s*/)[0].length < indent) break;
  body.push(lines[i].slice(indent));
}
const script = body.join("\n").replace(/\$\{\{\s*github\.repository\s*\}\}/g, "QNFO/qnfo-workers");
ok(/gh api/.test(script) && /GITHUB_OUTPUT/.test(script), "the real step script was extracted", script.slice(0, 120));

const dir = mkdtempSync(join(tmpdir(), "codeql-precheck-"));
// the fake gh: reads --jq <filter>, picks the canned body by URL, and applies the filter with jq like the real client does
writeFileSync(join(dir, "gh"), [
  "#!/bin/bash",
  'url=""; jq_f=""',
  'while [ $# -gt 0 ]; do case "$1" in api) shift; url="$1";; --jq) shift; jq_f="$1";; esac; shift; done',
  'case "$url" in',
  '  *"/actions/workflows/"*"/runs"*) [ "$FAKE_RUNS_FAIL" = 1 ] && exit 1; body="$FAKE_RUNS_JSON";;',
  '  *"/actions/workflows") [ "$FAKE_LIST_FAIL" = 1 ] && exit 1; body="$FAKE_LIST_JSON";;',
  '  *) exit 1;;',
  "esac",
  'printf "%s" "$body" | jq -r "$jq_f"',
].join("\n"));
chmodSync(join(dir, "gh"), 0o755);

const iso = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString().replace(/\.\d+Z$/, "Z");
const listWith = (state) => JSON.stringify({ total_count: 2, workflows: [{ id: 1, path: ".github/workflows/codeql.yml", state: "active" }, { id: 331018927, path: "dynamic/github-code-scanning/codeql", state }] });
const runsWith = (daysAgo) => JSON.stringify({ total_count: daysAgo === null ? 0 : 1, workflow_runs: daysAgo === null ? [] : [{ created_at: iso(daysAgo) }] });

function precheck(env) {
  const out = join(dir, "out-" + Math.random().toString(36).slice(2));
  writeFileSync(out, "");
  const r = spawnSync("bash", ["-e", "-c", script], { env: Object.assign({ PATH: dir + ":" + process.env.PATH, GITHUB_OUTPUT: out, GH_TOKEN: "x" }, env), encoding: "utf8" });
  const m = /default_setup=(\S+)/.exec(readFileSync(out, "utf8"));
  return { state: m && m[1], code: r.status, err: r.stderr };
}

try {
  let r = precheck({ FAKE_LIST_JSON: listWith("active"), FAKE_RUNS_JSON: runsWith(1) });
  ok(r.state === "configured" && r.code === 0, "default setup active and ran yesterday: configured, the advanced analysis defers", r);
  r = precheck({ FAKE_LIST_JSON: listWith("active"), FAKE_RUNS_JSON: runsWith(6.5) });
  ok(r.state === "configured", "active and last ran 6.5 days ago: still configured", r);
  r = precheck({ FAKE_LIST_JSON: listWith("active"), FAKE_RUNS_JSON: runsWith(17) });
  ok(r.state === "not-configured", "THE INCIDENT: listed active but last ran 17 days ago: not-configured, the analysis runs", r);
  r = precheck({ FAKE_LIST_JSON: listWith("active"), FAKE_RUNS_JSON: runsWith(8) });
  ok(r.state === "not-configured", "listed active, last run 8 days ago: not-configured", r);
  r = precheck({ FAKE_LIST_JSON: listWith("active"), FAKE_RUNS_JSON: runsWith(null) });
  ok(r.state === "not-configured", "listed active and never ran: not-configured", r);
  r = precheck({ FAKE_LIST_JSON: listWith("disabled_manually"), FAKE_RUNS_JSON: runsWith(1) });
  ok(r.state === "not-configured", "a disabled entry never counts, whatever its history", r);
  r = precheck({ FAKE_LIST_JSON: JSON.stringify({ total_count: 1, workflows: [{ id: 1, path: ".github/workflows/codeql.yml", state: "active" }] }), FAKE_RUNS_JSON: runsWith(1) });
  ok(r.state === "not-configured", "no dynamic CodeQL workflow listed: not-configured", r);
  r = precheck({ FAKE_LIST_FAIL: "1", FAKE_LIST_JSON: "", FAKE_RUNS_JSON: "" });
  ok(r.state === "unknown" && r.code === 0, "a failed workflow list is unknown, never an error, and the analysis runs", r);
  r = precheck({ FAKE_LIST_JSON: listWith("active"), FAKE_RUNS_FAIL: "1", FAKE_RUNS_JSON: "" });
  ok(r.state === "unknown" && r.code === 0, "a failed run read is unknown and the analysis runs", r);

  // the analyze job still defers only on "configured"
  ok(/needs\.precheck\.outputs\.default_setup != 'configured'/.test(yml), "analyze runs unless the precheck says configured");
  ok(/default_setup: \$\{\{ steps\.state\.outputs\.default_setup \}\}/.test(yml), "the precheck still publishes default_setup");
} finally { rmSync(dir, { recursive: true, force: true }); }

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
