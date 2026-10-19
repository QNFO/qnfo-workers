// OPS-JOB-PROMPT-CAP-1 offline suite: applies migrations/2026-10-19-ops-job-prompt-cap.sql on SQLite (node:sqlite) over fixtures of control_registry, control_alternate_probes and decision_log
// (the live column lists, CHECK constraints, the two append-only decision_log triggers and the live v_control_alternate_status view) and of failure_modes, remediation_contracts and capability_ledger
// (the live columns) and checks that the cap gets its control_registry row,
// its control_alternate_probes row (so the new control adds nothing to v_control_alternate_untested.controls_untested_without_probe, which the detector fm-control-alternate-undrilled reads)
// and its decision_log row, that the sum-of-rounds failure mode ops-job-prompt-sum gets its failure_modes row, its code-read detector contract fm-ops-job-prompt-sum (run through the consumer's own
// parse_code_probe and run_code_probe against this checkout) and its capability_ledger row, that the probe reads ok over rows shaped like the two live wrap-up events and names the missing part otherwise, that every NOT NULL column and every CHECK passes,
// that a replay and a pre-existing row change nothing, that the Rollback line removes the probe row and the control row and leaves the decision row (decision_log is append-only: a DELETE is
// refused), that the Rollback also removes the failure mode, the detector contract and the capability row and nothing of the sibling fm-ops-agent-history-resend, and that the numbers the rows state are the numbers qnfo-ops 2.52.0 carries.
// Run: node --no-warnings migrations/ops-job-prompt-cap.test.mjs   (OJPC_SKIP_MIGRATION=1 runs the same checks without applying the file: they must fail; OJPC_MIGRATION=<file> tests a mutated copy)
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(process.env.OJPC_MIGRATION || join(here, "2026-10-19-ops-job-prompt-cap.sql"), "utf8");
const worker = readFileSync(join(here, "..", "qnfo-ops", "worker.js"), "utf8");
const SKIP = process.env.OJPC_SKIP_MIGRATION === "1";
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
const body = lines.filter((l) => !l.startsWith("--")).join("\n");

// ---- 1. header and vocabulary ----
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
const rollback = hdr("Rollback");
const ROLLBACK = "DELETE FROM capability_ledger WHERE capability = 'ops-job-ends-at-prompt-ceiling'; DELETE FROM remediation_contracts WHERE class = 'fm-ops-job-prompt-sum'; DELETE FROM failure_modes WHERE fm_key = 'ops-job-prompt-sum'; DELETE FROM control_alternate_probes WHERE control = 'ops-job-prompt-cap'; DELETE FROM control_registry WHERE control = 'ops-job-prompt-cap'";
ok(lines.filter((l) => /^-- Rollback: /.test(l)).length === 1 && rollback === ROLLBACK, "one single-line Rollback that removes only the capability row, the detector contract, the failure_modes row, the probe row and the control_registry row", rollback);
ok(!/decision_log/i.test(rollback), "the Rollback never touches decision_log (append-only)");
ok(!/\bDELETE\b|\bDROP\b/i.test(body) && hdr("BACKUP") === "", "the body has no DELETE or DROP, so no BACKUP header is needed");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai or anthropic.com link and no skip-CI token");
ok(!/\b\d+ ?(hours?|days?)\b/i.test(sql.replace(/Read 2026-10-19/g, "")), "no duration is stated in hours or days");
ok(/decision_log is append-only/.test(sql), "the file says why the Rollback leaves the decision row");
const stmts = body.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
ok(stmts.length === 6 && /^INSERT INTO control_registry\b/.test(stmts[0]) && /^INSERT OR IGNORE INTO control_alternate_probes\b/.test(stmts[1]) && /^INSERT OR IGNORE INTO failure_modes\b/.test(stmts[2]) && /^INSERT OR IGNORE INTO remediation_contracts\b/.test(stmts[3]) && /^INSERT OR IGNORE INTO capability_ledger\b/.test(stmts[4]) && /^INSERT INTO decision_log\b/.test(stmts[5]), "exactly six statements: the control row, its probe row, the failure mode, its detector contract, the capability row and the decision row", stmts.length);
ok(/\bWHERE NOT EXISTS \(SELECT 1 FROM control_registry\b/.test(stmts[0] || "") && /\bWHERE c\.control = 'ops-job-prompt-cap'$/.test(stmts[1] || "") && /\bWHERE NOT EXISTS \(SELECT 1 FROM decision_log\b/.test(stmts[5] || ""), "the control and decision rows are guarded by NOT EXISTS, the probe row by INSERT OR IGNORE on the control key; the failure mode, contract and capability rows are INSERT OR IGNORE on their primary keys");

// ---- 2. fixture: the live shapes ----
const world = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE control_registry (
  control TEXT PRIMARY KEY,
  location TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')),
  guards_against TEXT,
  critical_path INTEGER NOT NULL DEFAULT 0,
  disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')),
  disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')),
  alternate_path TEXT,
  alternate_tested_at TEXT,
  evidence TEXT NOT NULL,
  issue_id INTEGER,
  reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE TABLE control_alternate_probes (
  control TEXT PRIMARY KEY,
  probe_sql TEXT NOT NULL,
  window_note TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  last_pass INTEGER,
  last_pass_at TEXT,
  last_observed TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE TABLE failure_modes (
  fm_key TEXT PRIMARY KEY,
  failure_mode TEXT NOT NULL,
  root_cause TEXT NOT NULL,
  remediation TEXT NOT NULL,
  detector TEXT NOT NULL,
  probe_class TEXT,
  first_seen TEXT NOT NULL,
  issue_id INTEGER
, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE capability_ledger (
  capability TEXT PRIMARY KEY,
  provenance TEXT NOT NULL,
  prerequisites TEXT,
  reliability TEXT,
  acquired_at TEXT NOT NULL,
  last_exercised_at TEXT,
  evidence TEXT NOT NULL
);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE ops_ai_log (id TEXT PRIMARY KEY, ts TEXT, strategy TEXT, source TEXT, job_id TEXT, ok INTEGER);
CREATE VIEW v_control_alternate_status AS
SELECT c.control AS control, c.critical_path AS critical_path, c.disposition AS disposition, c.disposition_state AS disposition_state,
  c.alternate_path AS alternate_path, c.alternate_tested_at AS alternate_tested_at,
  p.enabled AS probe_enabled, p.last_run_at AS last_run_at, p.last_pass AS last_pass, p.last_pass_at AS last_pass_at, p.last_observed AS last_observed,
  p.window_note AS window_note,
  CASE
    WHEN c.alternate_path IS NULL OR trim(c.alternate_path) = '' THEN 'no-alternate'
    WHEN c.disposition = 'remove' AND c.disposition_state = 'applied' THEN 'removed'
    WHEN p.control IS NULL AND c.evidence LIKE '%ALTERNATE-NOT-EXERCISABLE%' THEN 'not-exercisable'
    WHEN p.control IS NULL THEN 'no-probe'
    WHEN p.enabled <> 1 THEN 'probe-disabled'
    WHEN p.last_run_at IS NULL THEN 'probe-never-run'
    WHEN p.last_pass IS NOT 1 THEN 'probe-failing'
    WHEN p.last_pass_at IS NULL OR p.last_pass_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-480 minutes') THEN 'probe-stale'
    ELSE 'drilled'
  END AS drill_state
FROM control_registry c LEFT JOIN control_alternate_probes p ON p.control = c.control;
CREATE VIEW v_control_alternate_untested AS
SELECT
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE critical_path = 1 AND drill_state NOT IN ('no-alternate', 'removed', 'not-exercisable', 'drilled')) AS critical_untested_by_probe,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE drill_state = 'no-probe' AND alternate_tested_at IS NULL) AS controls_untested_without_probe,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE drill_state = 'probe-failing') AS probes_failing;
CREATE TABLE decision_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actor TEXT NOT NULL,
  assumption TEXT NOT NULL,
  action TEXT NOT NULL,
  evidence TEXT NOT NULL,
  outcome TEXT NOT NULL,
  blast_radius TEXT NOT NULL,
  rollback_path TEXT NOT NULL
, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log
BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log
BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
`);
  db.prepare("INSERT INTO control_registry (control, location, kind, critical_path, disposition, disposition_state, alternate_path, evidence, issue_id) VALUES ('ops-jobs-terminal-sweep', 'qnfo-ops worker.js scheduled()', 'guard', 0, 'keep', 'applied', 'none needed', 'an older control', 100036)").run();
  db.prepare("INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path) VALUES ('other', 'a', 'BAD-TAG-FILTER-1: an older decision', 'e', 'o', 'b', 'r')").run();
  // the sibling rows of OPS-CONTEXT-COMPACT-2 (live 2026-10-19: status active, last_verdict pass): the new rows must sit beside them and the Rollback must leave them
  db.prepare("INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id) VALUES ('ops-agent-history-resend', 'fm', 'rc', 'rem', 'det', 'fm-ops-agent-history-resend', '2026-10-19', 2068)").run();
  db.prepare("INSERT INTO remediation_contracts (class, precondition, action, verify_probe, verify_transport, escalate_to) VALUES ('fm-ops-agent-history-resend', 'OPS-CONTEXT-COMPACT-2', 'failure-mode detector', '{\"paths\":[\"qnfo-ops/worker.js\"],\"contains\":\"x\"}', 'code-read', 'qnfo-fleet-control')").run();
  db.prepare("INSERT INTO capability_ledger (capability, provenance, acquired_at, evidence) VALUES ('companion-yield-self-stops', 'p', '2026-10-19T00:00:00Z', 'e')").run();
  return db;
};
const snap = (db) => JSON.stringify([db.prepare("SELECT * FROM control_registry ORDER BY control").all(), db.prepare("SELECT * FROM control_alternate_probes ORDER BY control").all(), db.prepare("SELECT * FROM decision_log ORDER BY id").all(), db.prepare("SELECT * FROM failure_modes ORDER BY fm_key").all(), db.prepare("SELECT class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container FROM remediation_contracts ORDER BY class").all(), db.prepare("SELECT * FROM capability_ledger ORDER BY capability").all()]);
const untested = (db) => db.prepare("SELECT controls_untested_without_probe AS n FROM v_control_alternate_untested").get().n;

const db = world();
const before = snap(db);
const untestedBefore = untested(db);
if (!SKIP) db.exec(sql);

// ---- 3. the control row ----
const c = db.prepare("SELECT * FROM control_registry WHERE control = 'ops-job-prompt-cap'").all();
ok(c.length === 1, "one control_registry row for ops-job-prompt-cap", c.length);
const row = c[0] || {};
ok(row.kind === "cap" && row.critical_path === 0 && row.disposition === "keep" && row.disposition_state === "applied" && row.issue_id === 2068, "it is a cap, off the critical path, kept, applied, and ties to issue 2068", row);
ok(typeof row.alternate_path === "string" && /maxTurns = 40/.test(row.alternate_path) && /JOB_BUDGET_EXCEEDED/.test(row.alternate_path) && /OPS_JOB_PROMPT_CAP/.test(row.alternate_path), "the alternate path names the 40-turn wrap-up, the dollar cap and the env override", row.alternate_path);
ok(row.alternate_tested_at === null, "the file never stamps alternate_tested_at (only a passing drill does)");
ok(/qnfo-ops\/worker\.js/.test(row.location || "") && /OPS_JOB_PROMPT_CAP/.test(row.location || "") && /opsJobPromptCapReached/.test(row.location || ""), "the location names the file, the constant and the helper", row.location);
ok(/issue-2068/.test(row.evidence || "") && /700000/.test(row.evidence || "") && /28/.test(row.evidence || "") && /context-compact\.test\.mjs/.test(row.evidence || ""), "the evidence cites the closing contract, the 700000 ceiling, the 28 calls and the suite");
ok(/800000/.test(row.guards_against || "") && /1,593,580/.test(row.guards_against || ""), "guards_against states the 800000 line and the measured job");

// ---- 3b. the tested alternate: a probe row, so the new control is not an untested control without a probe ----
const pr = db.prepare("SELECT * FROM control_alternate_probes WHERE control = 'ops-job-prompt-cap'").all();
ok(pr.length === 1, "one control_alternate_probes row for ops-job-prompt-cap", pr.length);
const prow = pr[0] || {};
ok(prow.enabled === 1 && prow.last_run_at === null && prow.last_pass === null && prow.last_pass_at === null, "the probe row is enabled and never run: the file stamps no pass (only the drill does)", prow);
ok(typeof prow.window_note === "string" && /\b2 minutes\b/.test(prow.window_note) && /\b120 minutes\b/.test(prow.window_note) && !/\b\d+ ?(hours?|days?)\b/i.test(prow.window_note), "the window note states its windows in minutes", prow.window_note);
const psql = String(prow.probe_sql || "");
const plow = " " + psql.toLowerCase() + " ";
const WRITE_KW = ["insert ", "update ", "delete ", "drop ", "alter ", "create ", "attach ", "detach ", "pragma ", "replace ", "vacuum", "reindex"];
ok(/^ select /.test(plow) && plow.indexOf(";") === -1 && !WRITE_KW.some((k) => plow.indexOf(" " + k) !== -1), "the probe is one literal read free of write keywords", psql.slice(0, 120));
ok(/'ok' AS expected/.test(psql) && /AS observed/.test(psql) && /ops_tool_budget_bail/.test(psql) && /job-workflow/.test(psql) && /ops_ai_log/.test(psql), "it is an expected/observed read of the job-workflow wrap-up event and the job row that ends with an answer");
ok(untested(db) === untestedBefore, "controls_untested_without_probe (read by fm-control-alternate-undrilled) is what it was before the file", { before: untestedBefore, after: untested(db) });
const st = db.prepare("SELECT drill_state FROM v_control_alternate_status WHERE control = 'ops-job-prompt-cap'").get() || {};
ok(st.drill_state === "probe-never-run", "the live view grades the new control probe-never-run until the drill runs it, not no-probe", st);
{
  // the shape the first version of the file had (control row, no probe): the invariant the detector enforces breaks, so the finding was real
  const bare = world();
  bare.exec(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n").split(/;\s*\n/).map((t) => t.trim()).filter((t) => t && !/^INSERT OR IGNORE INTO control_alternate_probes/.test(t)).join(";\n") + ";");
  ok(untested(bare) === untestedBefore + 1, "without the probe row the same file raises controls_untested_without_probe by one", { bare: untested(bare), before: untestedBefore });
}
{
  // the drill stamps a pass: the control becomes drilled
  const d2 = world();
  d2.exec(sql);
  d2.prepare("UPDATE control_alternate_probes SET last_run_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), last_pass = 1, last_pass_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE control = 'ops-job-prompt-cap'").run();
  ok(d2.prepare("SELECT drill_state FROM v_control_alternate_status WHERE control = 'ops-job-prompt-cap'").get().drill_state === "drilled", "after a passing drill the control reads drilled");
}

// ---- 3c. the probe against rows shaped like the live ones (cloud_ops_events 2026-10-06T07:53:58Z and 2026-10-17T18:01:49Z; ops_ai_log 2.3 and 8.1 seconds later) ----
{
  const pw = world();
  if (!SKIP) pw.exec(sql);
  const run = () => { try { const r = pw.prepare(psql).get(); return r.expected === "ok" ? String(r.observed) : "expected is " + r.expected; } catch (e) { return "probe error: " + String(e.message); } };
  const ev = (id, ts, text, meta) => pw.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, ?, 'ops_tool_budget_bail', ?, ?, 'qnfo-ops', 'ok')").run(id, ts, text, meta);
  const lg = (id, ts, ok1, strategy = "job-workflow", source = "job") => pw.prepare("INSERT INTO ops_ai_log (id, ts, strategy, source, job_id, ok) VALUES (?, ?, ?, ?, ?, ?)").run(id, ts, strategy, source, "job-" + id, ok1);
  ok(/no ops_tool_budget_bail event of the job-workflow loop at iteration 40 of 40/.test(run()), "no events: names the missing wrap-up event", run());
  ev("e1", "2026-10-19T10:24:03.737Z", "chat", '{"iter":40,"maxIters":40,"deadlineHit":false,"version":"2.50.0"}');
  ev("e2", "2026-10-19T10:37:01.118Z", "job-workflow", '{"iter":33,"maxIters":40,"deadlineHit":true,"version":"2.50.0"}');
  ok(/no ops_tool_budget_bail event/.test(run()), "a chat event at 40 of 40 and a job-workflow event that hit its deadline at 33 do not count", run());
  ev("e3", "2026-10-17T18:01:49.244Z", "job-workflow", '{"iter":40,"maxIters":40,"deadlineHit":false,"version":"2.48.3-model-floor-1"}');
  ok(/no job-workflow job ended with an answer within 2 minutes/.test(run()), "the wrap-up event without a job row after it: names the missing job row", run());
  lg("l1", "2026-10-17T18:01:35.000Z", 1);
  lg("l2", "2026-10-17T18:04:10.000Z", 1);
  lg("l3", "2026-10-17T18:01:57.362Z", 0);
  lg("l4", "2026-10-17T18:01:57.362Z", 1, "chat");
  lg("l5", "2026-10-17T18:01:57.362Z", 1, "job-workflow", "chat");
  ok(/no job-workflow job ended with an answer within 2 minutes/.test(run()), "a row before the event, a row 2 minutes 21 seconds after it, a failed row, a chat row and a non-job row do not count", run());
  lg("l6", "2026-10-17T18:01:57.362Z", 1);
  ok(run() === "ok", "a job-workflow job row with ok = 1, 8.1 seconds after the event: ok", run());
  pw.prepare("DELETE FROM ops_ai_log WHERE id = 'l6'").run();
  ev("e4", "2026-10-06T07:53:58.752Z", "job-workflow", '{"iter":40,"maxIters":40,"deadlineHit":false,"version":"2.38.45-archive-retire"}');
  lg("l7", "2026-10-06T07:54:01.030Z", 1);
  ok(run() === "ok", "the other live pair (2.3 seconds apart): ok", run());
  ev("e5", "2026-10-20T09:00:00.000Z", "job-workflow", '{"iter":40,"maxIters":40,"deadlineHit":false,"reason":"prompt-cap","version":"2.52.0-job-prompt-cap"}');
  ok(run() === "ok", "a later event, with or without a reason, does not disturb the read", run());
}

// ---- 3d. the failure mode, its detector contract and the capability row (the sum of bounded rounds is a different root cause from ops-agent-history-resend) ----
const MARKER = "const withTools = turn < maxTurns && !_promptCapHit;";
const SIB_MARKER = "truncateToContext(msgs, OPS_ROUND_INPUT_BUDGET_TOKENS + 4096, { hard: true })";
const fmRows = db.prepare("SELECT * FROM failure_modes WHERE fm_key = 'ops-job-prompt-sum'").all();
ok(fmRows.length === 1, "one failure_modes row for ops-job-prompt-sum", fmRows.length);
const fr = fmRows[0] || {};
ok(fr.probe_class === "fm-ops-job-prompt-sum" && fr.first_seen === "2026-10-19" && fr.issue_id === 2068, "its probe_class is fm-ops-job-prompt-sum, first_seen 2026-10-19, issue 2068", fr);
ok(["failure_mode", "root_cause", "remediation", "detector", "trigger_condition", "symptom", "blast_radius"].every((k) => typeof fr[k] === "string" && fr[k].length > 40), "every failure_modes text column is filled", Object.keys(fr).filter((k) => fr[k] == null));
ok(/41 rounds/.test(fr.failure_mode || "") && /9\.5k/.test(fr.root_cause || "") && /0\.78M to 0\.86M/.test(fr.root_cause || "") && /32,000/.test(fr.root_cause || "") && /2\.50\.5/.test(fr.root_cause || "") && /issue 2068/.test(fr.root_cause || ""), "the root cause is the sum: the fixed prefix on every one of 41 rounds under the 32,000-token round bound of 2.50.5, with the replay figures and the traffic-gated probe", fr.root_cause);
ok(/OPS_JOB_PROMPT_CAP/.test(fr.remediation || "") && /700000/.test(fr.remediation || "") && /2\.52\.0/.test(fr.remediation || "") && /28 upstream calls/.test(fr.remediation || "") && /jobToolsPayload/.test(fr.remediation || ""), "the remediation names 2.52.0, the ceiling, the lean tool list and the 28-call proof", fr.remediation);
ok((fr.detector || "").includes(MARKER) && /fm-ops-job-prompt-sum/.test(fr.detector || "") && /issue-2068/.test(fr.detector || ""), "the detector text names the code line it reads, the contract and the runtime probe that stays the outcome measure", fr.detector);
ok(!/\b\d+ ?(hours?|days?)\b/i.test(JSON.stringify(fr)), "the failure mode states no duration in hours or days");
ok(fr.probe_class === "fm-" + fr.fm_key, "the probe_class is fm- plus the key, as the sibling rows are");

const rcRows = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-ops-job-prompt-sum'").all();
ok(rcRows.length === 1, "one remediation_contracts row for fm-ops-job-prompt-sum", rcRows.length);
const rcr = rcRows[0] || {};
ok(rcr.class === fr.probe_class, "the contract class is the probe_class of the failure mode");
ok(rcr.verify_transport === "code-read" && rcr.status === "active" && rcr.module === "session-probe" && rcr.escalate_to === "qnfo-fleet-control" && rcr.max_attempts === 3 && rcr.issue_id === null && rcr.precondition === "OPS-CONTEXT-COMPACT-3" && rcr.action === "failure-mode detector" && rcr.expected_cadence_h === 1 && rcr.budget_ms === 45000 && rcr.max_items === 5 && rcr.requires_container === 0 && typeof rcr.next_due_at === "string", "it is an active code-read detector contract, due now, with the sibling's module, budget and escalation", rcr);
{
  // the column list and the values after the probe are the ones the sibling migration wrote for ops-agent-history-resend
  const sib = readFileSync(join(here, "2026-10-19-ops-context-compact-2.sql"), "utf8");
  const shape = (text, cls) => { const m = new RegExp("INSERT OR IGNORE INTO remediation_contracts \\(([^)]*)\\)\\s*VALUES \\('" + cls + "', [\\s\\S]*?'code-read', ([^;]*)\\);").exec(text); return m ? [m[1].replace(/\s+/g, " "), m[2].replace(/\s+/g, " ")] : null; };
  const a = shape(sib, "fm-ops-agent-history-resend"), b = shape(sql, "fm-ops-job-prompt-sum");
  ok(a && b && a[0] === b[0] && a[1] === b[1], "the INSERT has the sibling's column list and the sibling's values after the probe", { sibling: a, mine: b });
}
let spec = {};
try { spec = JSON.parse(rcr.verify_probe || ""); } catch (e) { spec = {}; }
ok(JSON.stringify(Object.keys(spec).sort()) === '["contains","paths"]' && JSON.stringify(spec.paths) === '["qnfo-ops/worker.js"]' && spec.contains === MARKER, "the probe reads qnfo-ops/worker.js for the line that ends a job round's tools at the ceiling", rcr.verify_probe);
ok(worker.split(MARKER).length - 1 === 1, "that line occurs exactly once in qnfo-ops/worker.js");
ok(readFileSync(join(here, "..", "qnfo-ops", "deployed-current.worker.js"), "utf8").split(MARKER).length - 1 === 1, "and exactly once in the mirror deployed-current.worker.js");
{
  // the consumer's own judge (scripts/remediation_consumer.py parse_code_probe and run_code_probe), against this checkout and against a worker.js with the ceiling taken out
  const judge = (probeText, root) => {
    const r = spawnSync("python3", ["-I", "-c", "import sys, json; sys.path.insert(0, sys.argv[1]); import remediation_consumer as rc; p, e = rc.parse_code_probe(sys.argv[2]); print(json.dumps({'err': e, 'observed': rc.run_code_probe(p, sys.argv[3]) if p else None}))", join(here, "..", "scripts"), probeText, root], { encoding: "utf8" });
    try { return JSON.parse(r.stdout.trim().split("\n").pop()); } catch (e) { return { err: "no output", observed: null, stderr: r.stderr }; }
  };
  const cut = mkdtempSync(join(tmpdir(), "ojpc-"));
  mkdirSync(join(cut, "qnfo-ops"));
  writeFileSync(join(cut, "qnfo-ops", "worker.js"), worker.split(MARKER).join("const withTools = turn < maxTurns;"));
  const here_ = judge(rcr.verify_probe || "{}", join(here, ".."));
  ok(here_.err === null && here_.observed === "ok", "the consumer parses the contract and judges it ok on this checkout", here_);
  const gone = judge(rcr.verify_probe || "{}", cut);
  ok(gone.err === null && gone.observed === "missing-marker:qnfo-ops/worker.js", "the same contract fails (missing-marker) on a worker.js whose job round ignores the ceiling", gone);
  const sibOnGone = judge(JSON.stringify({ paths: ["qnfo-ops/worker.js"], contains: SIB_MARKER }), cut);
  ok(sibOnGone.err === null && sibOnGone.observed === "ok", "the sibling detector fm-ops-agent-history-resend still reads ok on that worker.js: it cannot see the ceiling, which is why the new contract is needed", sibOnGone);
}

const capRows = db.prepare("SELECT * FROM capability_ledger WHERE capability = 'ops-job-ends-at-prompt-ceiling'").all();
ok(capRows.length === 1, "one capability_ledger row for ops-job-ends-at-prompt-ceiling", capRows.length);
const cr = capRows[0] || {};
ok(/2026-10-19-ops-job-prompt-cap\.sql/.test(cr.provenance || "") && /2\.52\.0/.test(cr.provenance || "") && /OPS_JOB_PROMPT_CAP/.test(cr.prerequisites || "") && /fm-ops-job-prompt-sum/.test(cr.reliability || "") && /issue 2068/.test(cr.evidence || "") && /28 upstream calls/.test(cr.evidence || ""), "the capability row names the migration, the release, the env override, the detector and the evidence", cr);
ok(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(cr.acquired_at || "") && cr.last_exercised_at === null, "acquired_at is an ISO instant and last_exercised_at is left for the first exercise", cr);
ok(!/\b\d+ ?(hours?|days?)\b/i.test(JSON.stringify(cr)), "the capability row states no duration in hours or days");

// ---- 4. the decision row ----
const d = db.prepare("SELECT * FROM decision_log WHERE instr(action, 'OPS-JOB-PROMPT-CAP-1:') = 1").all();
ok(d.length === 1, "one decision_log row for OPS-JOB-PROMPT-CAP-1", d.length);
const dr = d[0] || {};
ok(dr.actor === "session_01QpQv19uh1padRwZ3u1r766", "the actor is the session", dr.actor);
ok(["assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "reach_gain", "surfaces_tested"].every((k) => typeof dr[k] === "string" && dr[k].length > 10 || k === "reach_gain" && dr[k] === "none"), "every doctrine column is filled (capability_gain, predicted_outcome, reach_gain, surfaces_tested included)", Object.keys(dr).filter((k) => dr[k] == null));
ok(/max job prompt_tokens < 800000/.test(dr.predicted_outcome || "") && !/ within /.test(dr.predicted_outcome || "") && /issue-2068/.test(dr.predicted_outcome || ""), "the prediction is the 800000 line, names the contract and carries no 'within' clause for decision_predictions_parse", dr.predicted_outcome);
ok(/revert qnfo-ops 2\.52\.0/.test(dr.rollback_path || "") && /OPS_JOB_PROMPT_CAP/.test(dr.rollback_path || "") && /append-only/.test(dr.rollback_path || "") && /control_alternate_probes row/.test(dr.rollback_path || ""), "the rollback path names the revert, the env override, the probe row and the append-only note");
ok(/2\.52\.0/.test(dr.action || "") && /700000/.test(dr.action || "") && /jobToolsPayload/.test(dr.action || ""), "the action states the release, the ceiling and the lean tool list");
ok(/ops-job-prompt-sum/.test(dr.action || "") && /fm-ops-job-prompt-sum/.test(dr.action || "") && /ops-job-ends-at-prompt-ceiling/.test(dr.action || "") && /capability_ledger row/.test(dr.rollback_path || "") && /detector contract/.test(dr.rollback_path || "") && /failure_modes row/.test(dr.rollback_path || ""), "the decision row names the failure mode, the detector, the capability row and the Rollback that removes them");
ok(dr.outcome_matched === null, "outcome_matched is left for the result to set");

// ---- 5. the rows state what the worker carries ----
const cap = /var OPS_JOB_PROMPT_CAP = (\d+);/.exec(worker);
ok(cap && cap[1] === "700000" && /700000/.test(row.evidence || "") && /700000/.test(dr.action || ""), "the ceiling in the rows is the OPS_JOB_PROMPT_CAP in qnfo-ops/worker.js", cap && cap[1]);
const ver = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(worker);
ok(ver && (Number(ver[1]) > 2 || (Number(ver[1]) === 2 && Number(ver[2]) >= 52)), "qnfo-ops VERSION is at least 2.52.0, the release the rows describe", ver && ver[0]);
ok(/"OPS_JOB_PROMPT_CAP"/.test(worker) && /function opsJobPromptCapReached\(/.test(worker), "the env name and the helper in the rows exist in the worker");

// ---- 6. replay, pre-existing rows, rollback, append-only ----
if (!SKIP) {
  const once = snap(db);
  db.exec(sql);
  ok(snap(db) === once, "a replay changes nothing");
  ok(JSON.parse(once)[0].some((r) => r.control === "ops-jobs-terminal-sweep") && JSON.parse(once)[2].some((r) => r.actor === "other"), "the rows that were there are untouched");

  const pre = world();
  pre.prepare("INSERT INTO control_registry (control, location, kind, critical_path, disposition, disposition_state, alternate_path, evidence) VALUES ('ops-job-prompt-cap', 'someone else', 'cap', 1, 'demote', 'planned', 'theirs', 'their evidence')").run();
  pre.prepare("INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path) VALUES ('other', 'a', 'OPS-JOB-PROMPT-CAP-1: written by hand', 'e', 'o', 'b', 'r')").run();
  pre.prepare("INSERT INTO control_alternate_probes (control, probe_sql, window_note, enabled) VALUES ('ops-job-prompt-cap', 'SELECT ''ok'' AS expected, ''ok'' AS observed', 'theirs', 0)").run();
  pre.prepare("INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id) VALUES ('ops-job-prompt-sum', 'theirs', 'theirs', 'theirs', 'theirs', 'fm-ops-job-prompt-sum', '2026-10-18', 1)").run();
  pre.prepare("INSERT INTO remediation_contracts (class, precondition, action, verify_probe, verify_transport, escalate_to, status) VALUES ('fm-ops-job-prompt-sum', 'theirs', 'theirs', '{\"paths\":[\"x.js\"],\"contains\":\"y\"}', 'code-read', 'someone', 'paused')").run();
  pre.prepare("INSERT INTO capability_ledger (capability, provenance, acquired_at, evidence) VALUES ('ops-job-ends-at-prompt-ceiling', 'theirs', '2026-10-18T00:00:00Z', 'theirs')").run();
  const preSnap = snap(pre);
  pre.exec(sql);
  ok(snap(pre) === preSnap, "a control row, a probe row, a decision row, a failure mode, a detector contract and a capability row that already exist are not overwritten or duplicated");
  const preControl = world();
  preControl.prepare("INSERT INTO control_registry (control, location, kind, critical_path, disposition, disposition_state, alternate_path, evidence) VALUES ('ops-job-prompt-cap', 'someone else', 'cap', 1, 'demote', 'planned', 'theirs', 'their evidence')").run();
  const preControlRow = JSON.stringify(preControl.prepare("SELECT * FROM control_registry WHERE control = 'ops-job-prompt-cap'").all());
  preControl.exec(sql);
  ok(JSON.stringify(preControl.prepare("SELECT * FROM control_registry WHERE control = 'ops-job-prompt-cap'").all()) === preControlRow && preControl.prepare("SELECT COUNT(*) n FROM control_alternate_probes").get().n === 1, "a control row written by hand keeps its text and the control still gets exactly one probe row");

  db.exec(rollback);
  ok(db.prepare("SELECT COUNT(*) n FROM control_registry WHERE control = 'ops-job-prompt-cap'").get().n === 0 && db.prepare("SELECT COUNT(*) n FROM control_alternate_probes WHERE control = 'ops-job-prompt-cap'").get().n === 0, "the Rollback removes the control row and its probe row");
  ok(db.prepare("SELECT COUNT(*) n FROM failure_modes WHERE fm_key = 'ops-job-prompt-sum'").get().n === 0 && db.prepare("SELECT COUNT(*) n FROM remediation_contracts WHERE class = 'fm-ops-job-prompt-sum'").get().n === 0 && db.prepare("SELECT COUNT(*) n FROM capability_ledger WHERE capability = 'ops-job-ends-at-prompt-ceiling'").get().n === 0, "the Rollback removes the failure mode, the detector contract and the capability row");
  ok(db.prepare("SELECT COUNT(*) n FROM failure_modes WHERE fm_key = 'ops-agent-history-resend'").get().n === 1 && db.prepare("SELECT COUNT(*) n FROM remediation_contracts WHERE class = 'fm-ops-agent-history-resend'").get().n === 1 && db.prepare("SELECT COUNT(*) n FROM capability_ledger WHERE capability = 'companion-yield-self-stops'").get().n === 1, "the Rollback leaves the sibling failure mode, its contract and an older capability row");
  ok(db.prepare("SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'OPS-JOB-PROMPT-CAP-1:') = 1").get().n === 1, "the Rollback leaves the decision row");
  const w2 = world();
  const noStamp = "SELECT control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id FROM control_registry ORDER BY control"; // reviewed_at is a default of now(): two fixtures built seconds apart differ in it, which is not the Rollback
  ok(JSON.stringify(db.prepare(noStamp).all()) === JSON.stringify(w2.prepare(noStamp).all()) && db.prepare("SELECT COUNT(*) n FROM control_alternate_probes").get().n === 0, "after the Rollback the control table is what it was and no probe row is left");
  ok(untested(db) === untestedBefore, "after the Rollback the untested-control count is what it was before the file");
  let refused = false;
  try { db.exec("DELETE FROM decision_log WHERE instr(action, 'OPS-JOB-PROMPT-CAP-1:') = 1"); } catch (e) { refused = /append-only/.test(String(e.message)); }
  ok(refused, "the fixture's append-only trigger refuses a DELETE of the decision row, which is why the Rollback does not try");
  db.exec(sql);
  ok(db.prepare("SELECT COUNT(*) n FROM control_registry WHERE control = 'ops-job-prompt-cap'").get().n === 1 && db.prepare("SELECT COUNT(*) n FROM control_alternate_probes WHERE control = 'ops-job-prompt-cap'").get().n === 1 && db.prepare("SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'OPS-JOB-PROMPT-CAP-1:') = 1").get().n === 1, "the file applies again after a Rollback and adds the control row and the probe row only (the decision row is still the one)");
  ok(db.prepare("SELECT COUNT(*) n FROM failure_modes WHERE fm_key = 'ops-job-prompt-sum'").get().n === 1 && db.prepare("SELECT COUNT(*) n FROM remediation_contracts WHERE class = 'fm-ops-job-prompt-sum'").get().n === 1 && db.prepare("SELECT COUNT(*) n FROM capability_ledger WHERE capability = 'ops-job-ends-at-prompt-ceiling'").get().n === 1, "and it adds the failure mode, the detector contract and the capability row again");
  const chk = spawnSync("python3", [join(here, "..", "scripts", "apply_migrations.py"), "--check", join(here, "2026-10-19-ops-job-prompt-cap.sql")], { encoding: "utf8" });
  ok(chk.status === 0 && /"ok": true/.test(chk.stdout), "the file passes scripts/apply_migrations.py --check", chk.stdout + chk.stderr);
} else {
  ok(snap(db) !== before, "(skip mode) the file changed the world");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
