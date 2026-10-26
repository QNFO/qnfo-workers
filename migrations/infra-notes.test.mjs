// INFRA-NOTES-1 offline suite: replays migrations/2026-10-26-infra-notes.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, a BACKUP table that the file creates first, nothing deleted or dropped, decision_log only inserted into); the ten issues each get one dated
// note appended to their own description and no other issue changes; the previous description is kept in the backup table before any update; a replay appends nothing (instr guard) and adds no decision row; no note
// carries a word the code-loop planner refuses except the one issue that already carried it (2582); every note names what was measured and the next step; the contract of issue 1000177 is re-pointed at a code-read
// probe that PASSES against this tree once the staging code is on main (the marker is read from the real file when it is present) and is accepted by the consumer's parser; the Rollback line restores the descriptions.
// Output MUST contain "0 failed" on success.   node migrations/infra-notes.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = (p) => new URL(p, import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(here("./2026-10-26-infra-notes.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(header.some((l) => /^-- BACKUP: bak_20261026_rem_a6_issue_desc\s*$/.test(l)) && /CREATE TABLE IF NOT EXISTS bak_20261026_rem_a6_issue_desc AS/.test(body), "the BACKUP table is named and created first");
ok(body.indexOf("CREATE TABLE IF NOT EXISTS bak_20261026_rem_a6_issue_desc") < body.indexOf("UPDATE agent_issues"), "the backup is created before the first update");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");

const IDS = [2805, 100168, 2582, 2596, 2754, 1000152, 1000156, 1000161, 1000162, 1000315];
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT DEFAULT 'open', updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '', verify_probe TEXT NOT NULL DEFAULT '', verify_transport TEXT NOT NULL DEFAULT 'd1-query', max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL DEFAULT 'x', expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
  for (const id of IDS.concat([1000177, 999001])) w.prepare("INSERT INTO agent_issues (id, title, description, updated_at) VALUES (?, ?, ?, 1)").run(id, "t" + id, "ORIGINAL-" + id);
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status, last_verdict, module) VALUES ('issue-1000177', 1000177, 'SELECT 1', 'd1-query', 'superseded', 'superseded:closure-observing-probe-at-birth', 'probe-template-v3-generic')").run();
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const w = world();
w.exec(sql);
const desc = (id) => q1(w, "SELECT description d, updated_at u FROM agent_issues WHERE id = ?", id);

ok(IDS.every((id) => desc(id).d.startsWith("ORIGINAL-" + id + "\n\nREM-A6 2026-10-26") && /^[ :]/.test(desc(id).d.slice(("ORIGINAL-" + id + "\n\nREM-A6 2026-10-26").length)) && desc(id).u > 1), "each of the ten issues keeps its description and gains one dated REM-A6 note, with updated_at moved");
ok(desc(1000177).d === "ORIGINAL-1000177" && desc(999001).d === "ORIGINAL-999001", "issue 1000177 (a contract change only) and an unrelated issue keep their descriptions");
ok(IDS.every((id) => (desc(id).d.match(/REM-A6 2026-10-26/g) || []).length === 1), "exactly one note on each");
const bak = qa(w, "SELECT id, description FROM bak_20261026_rem_a6_issue_desc ORDER BY id");
ok(bak.length === 10 && bak.every((r) => r.description === "ORIGINAL-" + r.id), "the backup holds the ten previous descriptions");
const deny = /\b(secret|credential|password|api[ _-]?key|private key|rotate|revoke|drop table)\b/i;
ok(IDS.filter((id) => id !== 2582).every((id) => !deny.test(desc(id).d.replace("ORIGINAL-" + id, ""))), "no note except the one of 2582 (which already carried the word) holds a word the code-loop planner refuses");
for (const [id, must] of [[2805, /owner card 125/], [100168, /design choice/], [2582, /GH_WEBHOOK_SECRET/], [2596, /GH_APP_BROKER/], [2754, /scan at 19:07Z/], [1000152, /no reader/], [1000156, /1000154/], [1000161, /canonical\(\)/], [1000162, /ops_stream_abort/], [1000315, /research_run_ledger holds 0 rows/]]) {
  ok(must.test(desc(id).d) && /(Next|next step|The change to make|What is left|Decide|doer|The doer)/.test(desc(id).d), "the note of " + id + " states what was measured and what is next", desc(id).d.slice(-200));
}
ok(IDS.every((id) => desc(id).d.length < 4000 + ("ORIGINAL-" + id).length), "every note is under 4000 characters");

// the contract of issue 1000177
const c = q1(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000177'");
const spec = JSON.parse(c.verify_probe);
ok(c.status === "active" && c.verify_transport === "code-read" && c.last_verdict === null && c.attempts === 0 && c.module === "infra-probes-1" && JSON.stringify(spec) === JSON.stringify({ paths: ["qnfo-ops/worker.js"], contains: "WORKSPACE-STAGE-1" }), "issue-1000177 is a code-read contract on WORKSPACE-STAGE-1 in qnfo-ops/worker.js", c);
if (existsSync(join(root, "qnfo-ops/workspace-stage.test.mjs"))) ok(readFileSync(join(root, "qnfo-ops/worker.js"), "utf8").includes("WORKSPACE-STAGE-1"), "the marker is in qnfo-ops/worker.js of this tree (the probe passes)");
else console.log("note: the staging change (PR 4838) is not in this tree yet: the probe passes once it is on main");
{
  const PY = (() => { for (const cand of ["python3", "python"]) { const r = spawnSync(cand, ["-I", "-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" }); if (r.status === 0 && String(r.stdout).trim() === "3") return cand; } return null; })();
  if (!PY) console.log("note: no python 3 on this host, the consumer parser check is skipped");
  else {
    const prog = "import sys, json, os\nos.environ.setdefault('CLOUDFLARE_ACCOUNT_ID','a'); os.environ.setdefault('CLOUDFLARE_API_TOKEN','t'); os.environ.setdefault('CF_API_TOKEN','t')\nsys.path.insert(0, 'scripts')\nimport remediation_consumer as r\np, why = r.parse_code_probe(sys.stdin.read())\nprint(json.dumps([p is not None, why]))";
    const run = spawnSync(PY, ["-I", "-c", prog], { cwd: root, input: c.verify_probe, encoding: "utf8" });
    let parsed = null;
    try { parsed = JSON.parse(String(run.stdout).trim().split("\n").pop()); } catch (e) { parsed = null; }
    ok(run.status === 0 && parsed && parsed[0] === true, "the consumer's own parse_code_probe accepts the spec", { status: run.status, parsed, err: String(run.stderr).slice(0, 200) });
  }
}
ok(qa(w, "SELECT * FROM decision_log").length === 1 && /^INFRA-NOTES-1: one dated note appended/.test(q1(w, "SELECT action a FROM decision_log").a), "one decision_log row");

// replay appends nothing
{
  const before = JSON.stringify(IDS.map((id) => desc(id).d));
  w.exec(sql);
  ok(JSON.stringify(IDS.map((id) => desc(id).d)) === before && qa(w, "SELECT * FROM decision_log").length === 1 && qa(w, "SELECT * FROM bak_20261026_rem_a6_issue_desc").length === 10, "a replay appends no second note, adds no decision row and keeps the backup");
}
// rollback
{
  const rb = (header.find((l) => /^-- Rollback:/.test(l)) || "").replace(/^-- Rollback:\s*/, "");
  w.exec(rb);
  ok(IDS.every((id) => desc(id).d === "ORIGINAL-" + id), "the Rollback line restores the ten descriptions from the backup");
  ok(q1(w, "SELECT status s FROM remediation_contracts WHERE class = 'issue-1000177'").s === "superseded", "and supersedes the 1000177 contract");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
