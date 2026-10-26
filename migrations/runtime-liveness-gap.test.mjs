// RUNTIME-LIVENESS-GAP-1 offline suite: replays migrations/2026-10-26-runtime-liveness-gap.sql on node:sqlite over a red-drain row shaped like the live one (steps 2 and the PARKED-REARM-2
// marker verbatim), the contract columns it writes and the registries it extends.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, a backup of the red-drain row); red-drain step 2 parks a failing standing liveness contract before the file and
// does not after it, while an ordinary failing contract is still parked and a detector still is not; the new last step re-arms an escalated or monitoring liveness contract and nothing else;
// the six parked rt-page contracts are active again and rt-page-fleet-queue carries the title the page has today; fifteen new contracts exist whose probe specs the REAL parser of
// scripts/remediation_consumer.py accepts (allowlisted https host, status 200, a marker), whose classes are unique and whose URLs are not probed by any other contract in the fixture;
// the canonical copy moves with the live one (drift gate); the failure mode and its detector exist and the detector reads 0 and then 1 on a parked contract; the arithmetic of the
// share; a replay changes nothing; the Rollback line restores red-drain and supersedes the fifteen.
// Output MUST contain "0 failed" on success.   node migrations/runtime-liveness-gap.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = (p) => new URL(p, import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(here("./2026-10-26-runtime-liveness-gap.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing, so no BACKUP header is needed");
ok(/CREATE TABLE IF NOT EXISTS bak_20261026_liveness_never_parked_task AS SELECT \* FROM fleet_tasks WHERE id = 'red-drain'/.test(body) && body.indexOf("bak_20261026_liveness_never_parked_task") < body.indexOf("UPDATE fleet_tasks SET"), "the red-drain row is saved before it is edited");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");

// ---- the live shape: red-drain step 2 with the PARKED-REARM-2 marker (verbatim from fleet_tasks, 2026-10-26)
const STEP2 = `UPDATE remediation_contracts SET status='escalated',
        last_verdict='escalated:over-retried (probe re-ran past 5x max_attempts with no code task in flight; parked for RED-DRAIN while the issue stays open)',
        last_attempt_at=datetime('now')
      WHERE status IN ('active','holding') AND last_verdict='fail' AND attempts > 5*COALESCE(max_attempts,3)
        AND substr(class,1,3) <> 'fm-' AND substr(class,1,7) <> 'belief-'
        AND NOT EXISTS (SELECT 1 FROM code_tasks ct WHERE ct.status NOT IN ('closed','superseded') AND ct.goal LIKE '%#' || remediation_contracts.issue_id || ' %')
        AND NOT (issue_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = 'open' AND a.title NOT LIKE 'METRIC-TRIGGER-%')
                 AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = remediation_contracts.issue_id AND c2.class <> remediation_contracts.class AND c2.status IN ('active','holding')))
        /* PARKED-REARM-2 */`;
const steps = (n) => Array.from({ length: n }, (_, i) => ({ type: "sql", db: "AUDIT", sql: i === 2 ? STEP2 : "SELECT " + i + " /* step " + i + " */" }));
const DEF = JSON.stringify({ steps: steps(8) });

const CONTRACT_DDL = `CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER DEFAULT 3, escalate_to TEXT, expected_cadence_h INTEGER DEFAULT 1, status TEXT DEFAULT 'active', module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER DEFAULT 0, next_due_at TEXT, attempts INTEGER DEFAULT 0, last_verdict TEXT, last_attempt_at TEXT);`;
function world() {
  const raw = new DatabaseSync(":memory:");
  raw.exec(CONTRACT_DDL + `
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, type TEXT, definition TEXT, version INTEGER DEFAULT 1, updated_at TEXT);
CREATE TABLE fleet_tasks_canonical (id TEXT PRIMARY KEY, definition TEXT, repo_path TEXT, exported_at TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, goal TEXT, status TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
  raw.prepare("INSERT INTO fleet_tasks (id, type, definition, version, updated_at) VALUES ('red-drain', 'workflow', ?, 3, '2026-10-19T06:00:00Z')").run(DEF);
  raw.prepare("INSERT INTO fleet_tasks_canonical (id, definition, repo_path, exported_at) VALUES ('red-drain', ?, 'migrations/2026-10-19-parked-contract-rearm-2.sql', '2026-10-19')").run(DEF);
  const c = (cls, o) => raw.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, status, module, attempts, last_verdict) VALUES (?, ?, ?, ?, 3, ?, ?, ?, ?)").run(cls, o.issue ?? null, o.probe ?? '{"url": "https://qnfo.org/x", "status": 200}', o.transport ?? "runner-https", o.status ?? "active", o.module ?? null, o.attempts ?? 0, o.verdict ?? null);
  // the six parked rt-page contracts, as live
  const parked = { "rt-page-fleet-queue": '{"url": "https://fleet.qnfo.org/", "status": 200, "contains": "your queue", "max_ms": 15000}', "rt-page-fleet-kpi": '{"url": "https://fleet.qnfo.org/kpi", "status": 200, "contains": "Fleet metrics", "max_ms": 15000}', "rt-page-fleet-api-kpi": '{"url": "https://fleet.qnfo.org/api/kpi", "status": 200, "contains": "window_days", "max_ms": 15000}', "rt-page-fleet-changelog": '{"url": "https://fleet.qnfo.org/changelog", "status": 200, "contains": "Fleet changelog", "max_ms": 15000}', "rt-page-ideas": '{"url": "https://ideas.qnfo.org/", "status": 200, "contains": "research questions", "max_ms": 10000}', "rt-page-paper-scholar-tags": '{"url": "https://papers.qnfo.org/papers/scale-invariant-physics", "status": 200, "contains": "citation_pdf_url", "max_ms": 10000}' };
  for (const [cls, probe] of Object.entries(parked)) c(cls, { module: "runtime-liveness-v1", status: "escalated", attempts: 250, verdict: "escalated:over-retried (probe re-ran past 5x max_attempts ...)", probe });
  c("rt-live-qnfo-ops", { module: "runtime-liveness-v1", attempts: 300, verdict: "pass", probe: '{"url": "https://ops.qnfo.org/health", "status": 200, "contains": "version"}' });
  c("fm-some-detector", { transport: "d1-query", attempts: 300, verdict: "fail", module: "failure-mode" });
  c("issue-bound", { issue: 7, attempts: 300, verdict: "fail", transport: "d1-query" });
  c("rt-issue-less-other", { module: null, attempts: 300, verdict: "pass" });
  return raw;
}
const q1 = (raw, s, ...p) => raw.prepare(s).get(...p);
const qa = (raw, s, ...p) => raw.prepare(s).all(...p);
const st = (raw, cls) => (q1(raw, "SELECT status s FROM remediation_contracts WHERE class = ?", cls) || {}).s;
const stepSql = (raw, i) => JSON.parse(q1(raw, "SELECT definition d FROM fleet_tasks WHERE id = 'red-drain'").d).steps[i].sql;

// ---- control: before the file a failing standing liveness contract is parked by step 2
{
  const w = world();
  w.prepare("UPDATE remediation_contracts SET last_verdict = 'fail', attempts = 300 WHERE class = 'rt-live-qnfo-ops'").run();
  w.exec(stepSql(w, 2));
  ok(st(w, "rt-live-qnfo-ops") === "escalated", "control: the live step 2 parks a failing standing liveness contract (attempts 300 > 5 x 3) before this file", st(w, "rt-live-qnfo-ops"));
}

// ---- apply
const w = world();
const defBefore = q1(w, "SELECT definition d FROM fleet_tasks WHERE id = 'red-drain'").d;
w.exec(sql);
const defAfter = JSON.parse(q1(w, "SELECT definition d FROM fleet_tasks WHERE id = 'red-drain'").d);
ok(defAfter.steps.length === 9, "red-drain has one more step", defAfter.steps.length);
ok(q1(w, "SELECT definition d FROM bak_20261026_liveness_never_parked_task WHERE id = 'red-drain'").d === defBefore, "the backup holds the previous definition byte for byte");
ok(q1(w, "SELECT version v FROM fleet_tasks WHERE id = 'red-drain'").v === 4, "the task version is bumped once");
ok(defAfter.steps.every((s, i) => i === 2 || i === 8 || s.sql === steps(8)[i].sql), "steps other than 2 and the new 8 are untouched");
ok(/AND COALESCE\(module, ''\) <> 'runtime-liveness-v1' \/\* STANDING-LIVENESS-NEVER-PARKS-1 \*\//.test(defAfter.steps[2].sql) && defAfter.steps[2].sql.includes("/* PARKED-REARM-2 */") && defAfter.steps[2].sql.includes("last_verdict='fail' AND attempts > 5*COALESCE(max_attempts,3)"), "step 2 keeps its rule and gains the module exclusion");
ok(defAfter.steps[8].type === "sql" && defAfter.steps[8].db === "AUDIT" && /STANDING-LIVENESS-NEVER-PARKS-1/.test(defAfter.steps[8].sql), "the new last step is a sql step on AUDIT");
const canon = q1(w, "SELECT definition d, repo_path p FROM fleet_tasks_canonical WHERE id = 'red-drain'");
ok(canon.d === q1(w, "SELECT definition d FROM fleet_tasks WHERE id = 'red-drain'").d && canon.p === "migrations/2026-10-26-runtime-liveness-gap.sql", "the canonical row moves with the live one (drift gate)");

// ---- step 2 after the file
{
  const t = world();
  t.exec(sql);
  t.prepare("UPDATE remediation_contracts SET status = 'active', last_verdict = 'fail', attempts = 300 WHERE class IN ('rt-live-qnfo-ops', 'rt-issue-less-other')").run();
  t.exec(stepSql(t, 2));
  ok(st(t, "rt-live-qnfo-ops") === "active", "after: a failing standing liveness contract with 300 attempts is NOT parked", st(t, "rt-live-qnfo-ops"));
  ok(st(t, "rt-issue-less-other") === "escalated", "after: an ordinary issue-less contract that fails past 5 x max_attempts is still parked (the rule is unchanged for them)", st(t, "rt-issue-less-other"));
  ok(st(t, "fm-some-detector") === "active", "after: a detector is still never parked");
}

// ---- the new last step
{
  const t = world();
  t.exec(sql);
  t.prepare("UPDATE remediation_contracts SET status = 'escalated', last_verdict = 'escalated:over-retried (x)' WHERE class IN ('rt-live-qnfo-ops', 'rt-issue-less-other')").run();
  t.prepare("UPDATE remediation_contracts SET status = 'monitoring' WHERE class = 'rt-page-ideas'").run();
  t.exec(stepSql(t, 8));
  ok(st(t, "rt-live-qnfo-ops") === "active" && st(t, "rt-page-ideas") === "active", "the last step re-arms an escalated or monitoring standing liveness contract");
  ok(st(t, "rt-issue-less-other") === "escalated", "and re-arms nothing outside module runtime-liveness-v1");
  ok(/^rearmed: STANDING-LIVENESS-NEVER-PARKS-1/.test(q1(t, "SELECT last_verdict v FROM remediation_contracts WHERE class = 'rt-live-qnfo-ops'").v), "and records why");
}

// ---- the parked six and the fifteen new
const SIX = ["rt-page-fleet-queue", "rt-page-fleet-kpi", "rt-page-fleet-api-kpi", "rt-page-fleet-changelog", "rt-page-ideas", "rt-page-paper-scholar-tags"];
ok(SIX.every((c) => st(w, c) === "active"), "the six parked rt-page contracts are active again", SIX.map((c) => c + ":" + st(w, c)));
ok(JSON.parse(q1(w, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'rt-page-fleet-queue'").p).contains === "<title>QNFO fleet status", "rt-page-fleet-queue is probed on the title the page carries today");
ok(JSON.parse(q1(w, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'rt-page-fleet-kpi'").p).contains === "Fleet metrics", "the other five keep their probe");
ok(st(w, "issue-bound") === "active" && st(w, "fm-some-detector") === "active" && st(w, "rt-issue-less-other") === "active", "no other contract changed state");

const created = qa(w, "SELECT * FROM remediation_contracts WHERE module = 'runtime-liveness-v1' AND class NOT IN ('rt-live-qnfo-ops', 'rt-page-fleet-queue', 'rt-page-fleet-kpi', 'rt-page-fleet-api-kpi', 'rt-page-fleet-changelog', 'rt-page-ideas', 'rt-page-paper-scholar-tags') ORDER BY class");
ok(created.length === 15, "fifteen new standing liveness contracts", created.length);
ok(created.every((r) => r.verify_transport === "runner-https" && r.status === "active" && r.issue_id === null && r.expected_cadence_h === 1 && r.max_attempts === 3 && /^rt-(live|page)-/.test(r.class) && r.escalate_to === "qnfo-ops"), "each is an active hourly runner-https contract with no issue, 3 attempts, escalating to qnfo-ops");
const urls = created.map((r) => JSON.parse(r.verify_probe).url);
ok(new Set(urls).size === 15 && new Set(created.map((r) => r.class)).size === 15, "the fifteen URLs and classes are distinct");
const existingUrls = qa(w, "SELECT verify_probe p FROM remediation_contracts WHERE class IN ('rt-live-qnfo-ops', 'rt-page-fleet-kpi', 'rt-page-fleet-api-kpi', 'rt-page-fleet-changelog', 'rt-page-ideas', 'rt-page-paper-scholar-tags', 'rt-page-fleet-queue')").map((r) => JSON.parse(r.p).url);
ok(urls.every((u) => !existingUrls.includes(u)), "none of them duplicates a URL already probed in the fixture (fleet.qnfo.org/ stays with rt-page-fleet-queue)");
{
  // the REAL parser and allowlist of scripts/remediation_consumer.py
  const PY = (() => { for (const c of ["python3", "python"]) { const r = spawnSync(c, ["-I", "-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" }); if (r.status === 0 && String(r.stdout).trim() === "3") return c; } return null; })();
  if (!PY) { console.log("note: no python 3 on this host, the consumer parser check is skipped"); }
  else {
    const specs = created.concat(qa(w, "SELECT * FROM remediation_contracts WHERE class = 'rt-page-fleet-queue'")).map((r) => r.verify_probe);
    const prog = "import sys, json\nsys.path.insert(0, 'scripts')\nimport remediation_consumer as r\nout = []\nfor s in json.loads(sys.stdin.read()):\n    p, why = r.parse_https_probe(s)\n    out.append([p is not None and p['status'] == 200 and bool(p['contains']), why])\nprint(json.dumps(out))";
    const run = spawnSync(PY, ["-I", "-c", prog], { cwd: root, input: JSON.stringify(specs), encoding: "utf8" });
    let parsed = null;
    try { parsed = JSON.parse(String(run.stdout).trim().split("\n").pop()); } catch (e) { parsed = null; }
    ok(run.status === 0 && Array.isArray(parsed) && parsed.length === 16 && parsed.every((x) => x[0] === true), "the consumer's own parse_https_probe accepts all sixteen specs (allowlisted https host, status 200, a marker)", { status: run.status, parsed, err: String(run.stderr).slice(0, 200) });
  }
}

// ---- failure mode and detector
ok(q1(w, "SELECT fm_key FROM failure_modes WHERE fm_key = 'standing-liveness-parked'") && q1(w, "SELECT probe_class p FROM failure_modes WHERE fm_key = 'standing-liveness-parked'").p === "fm-standing-liveness-parked", "failure mode standing-liveness-parked with its probe class");
{
  const det = q1(w, "SELECT verify_probe p, verify_transport t, status s FROM remediation_contracts WHERE class = 'fm-standing-liveness-parked'");
  ok(det && det.t === "d1-query" && det.s === "active", "its detector contract is an active d1-query");
  const read = () => q1(w, det.p);
  ok(read().expected === "0" && read().observed === "0", "the detector reads 0 when no standing liveness contract is parked", read());
  w.prepare("UPDATE remediation_contracts SET status = 'escalated' WHERE class = 'rt-live-qnfo-ops'").run();
  ok(read().observed === "1", "and 1 when one is parked", read());
  w.prepare("UPDATE remediation_contracts SET status = 'active' WHERE class = 'rt-live-qnfo-ops'").run();
}

// ---- the arithmetic of the share (measured 2026-10-26 16:20Z: runner-https 2421 of 28236 attributable rows, 40 rows a day per hourly contract)
{
  const rt = 2421, tot = 28236, perDay = 40, contracts = 21;
  const share = 100 * (rt + contracts * perDay) / (tot + contracts * perDay);
  ok(share > 10.8 && share < 11.6, "21 more hourly contracts move the share from 8.6 to about 11.2", share);
}

// ---- replay and rollback
{
  const snap = () => JSON.stringify([qa(w, "SELECT * FROM remediation_contracts ORDER BY class"), qa(w, "SELECT * FROM fleet_tasks"), qa(w, "SELECT * FROM fleet_tasks_canonical"), qa(w, "SELECT actor, action FROM decision_log"), qa(w, "SELECT * FROM failure_modes")]);
  const s1 = snap();
  w.exec(sql);
  ok(snap() === s1, "a second apply changes nothing (contracts, red-drain, canonical, decision_log, failure_modes)");
  ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'RUNTIME-LIVENESS-GAP-1:%'").n === 1, "exactly one decision_log row");
}
{
  const rb = sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length);
  const r = world();
  r.exec(sql);
  r.exec(rb);
  const d = JSON.parse(q1(r, "SELECT definition d FROM fleet_tasks WHERE id = 'red-drain'").d);
  ok(d.steps.length === 8 && !JSON.stringify(d).includes("STANDING-LIVENESS-NEVER-PARKS-1"), "Rollback restores the previous red-drain definition");
  ok(qa(r, "SELECT status FROM remediation_contracts WHERE class IN ('rt-live-q08-mind', 'rt-live-voice-stt', 'rt-page-ideas-feed', 'rt-page-fleet-api-cost', 'rt-live-work-locks')").every((x) => x.status === "superseded"), "and supersedes the new contracts");
  ok(q1(r, "SELECT COUNT(*) n FROM remediation_contracts WHERE status = 'superseded' AND module = 'runtime-liveness-v1'").n === 15, "exactly the fifteen, no other liveness contract");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
