// AB-LENGTH-RETRY-1 migration suite (agent_issues 100277, qnfo-model-eval 1.8.0): applies migrations/2026-10-19-ab-length-retry.sql on SQLite (node:sqlite) over fixtures
// of the live remediation_contracts (with its probe triggers), failure_modes, decision_log (append-only), decision_predictions (the real table and parse trigger, read out of
// migrations/2026-10-12-22-calibration-scorer.sql) and model_ab_runs (read out of migrations/2026-10-19-model-ab.sql), and checks that
//   1. the header opts in (APPLY-BY ci, DB qnfo-audit), carries one single-line Rollback, names no BACKUP because the body deletes nothing, and states the measured evidence;
//   2. the circular placeholder contract of issue 100277 (born superseded) is replaced by an active d1-query probe that is a literal read the consumer accepts, binds a LIKE pattern
//      of 18 bytes, reads pending while no run of the fixed harness (detail starting with harness_rev 2) exists for errata-hub and kimi-k2.6 (a deferral, never a pass or a failure), and
//      reads the newest rev-2 verdict afterwards (pass closes it, regression keeps it open, an older-revision row, another worker or another model never counts), and reads
//      pending, which the consumer treats as a deferral and not a failure, when the newest rev-2 run is inconclusive or error (a run that reached no verdict);
//   3. the statement changes nothing when the issue is not open, the contract is absent, or the placeholder is already gone, and a replay changes nothing;
//   4. the failure mode ab-length-empty-scored-as-loss and its detector read 0 on rows the real (fixed) worker writes, including a model that stays length-empty after the retry,
//      and 1 when a loss that was not retried is stored (the retry bypassed), and ignore rows of the older revision and rows older than 120 minutes: the window is the SLA ceiling,
//      so a bad row (model_ab_runs rows are history and are never edited) cannot hold the contract at 1 for longer than 120 minutes and the read clears by itself;
//   4c. control_registry (DOCTRINE-1 section 16): model-ab-run-cap and model-ab-switch, read live 2026-10-20, state 24 calls and 288 a day, an alternate path tied to the ai_call_counters window
//      and a dedupe that is not revision-gated. Both rows are copied to bak_20261019_model_ab_controls, then rewritten (32 and 384, the stale-rev source, the rest of 3 runs a day, the
//      revision-gated dedupe) by statements guarded by the sentence they replace, so an absent row, a row already edited by hand and a replay change nothing, every other column stays,
//      and the Rollback restores evidence, alternate_path and reviewed_at from the copy;
//   4b. the premise of the prediction, replayed on live-shaped rows with the real worker.js: abObservedCandidates finds errata-hub only (qnfo-research-exec left its window at 00:00Z 2026-10-20),
//      abStaleRevCandidates finds both stale pairs (ids 1 and 4), q08-signal-engine is already done, so the next tick runs exactly those two and the judged-run metric can reach 6;
//   5. the decision row carries a prediction decision_predictions_parse turns into a decision_predictions row, and the Rollback restores the contract from its backup, removes the
//      failure mode and the detector and leaves the decision row (decision_log is append-only);
//   6. the file passes scripts/apply_migrations.py --check.
// Run: node --no-warnings migrations/ab-length-retry.test.mjs   (ALR_SKIP_MIGRATION=1 runs the same checks without applying the file: they must fail; ALR_MIGRATION=<file> tests a mutated copy;
// ALR_WORKER=<file> runs the checks that replay the worker against another worker.js, for example the 1.7.0 one: they must fail)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(process.env.ALR_MIGRATION || join(here, "2026-10-19-ab-length-retry.sql"), "utf8");
const MODEL_AB = readFileSync(join(here, "2026-10-19-model-ab.sql"), "utf8");
const CALIBRATION = readFileSync(join(here, "2026-10-12-22-calibration-scorer.sql"), "utf8");
const workerSrc = readFileSync(process.env.ALR_WORKER || join(here, "..", "qnfo-model-eval", "worker.js"), "utf8");
const SKIP = process.env.ALR_SKIP_MIGRATION === "1";
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
const body = lines.filter((l) => !l.startsWith("--")).join("\n");
const ISSUE = 100277, CLASS = "issue-100277", FM = "ab-length-empty-scored-as-loss", FMC = "fm-ab-length-empty-scored-as-loss";
const WORKER = "errata-hub", POST = "@cf/moonshotai/kimi-k2.6", PRE = "@cf/zai-org/glm-5.3-flash";

// ---- 1. header ----
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
const rollback = hdr("Rollback");
ok(lines.filter((l) => /^-- Rollback: /.test(l)).length === 1 && /^UPDATE remediation_contracts SET /.test(rollback) && /bak_20261019_issue_100277_contract/.test(rollback) && rollback.includes("DELETE FROM remediation_contracts WHERE class = '" + FMC + "'") && rollback.includes("DELETE FROM failure_modes WHERE fm_key = '" + FM + "'"), "one single-line Rollback: restore the contract from its backup, remove the detector and the failure mode", rollback.slice(0, 160));
ok(!/decision_log/i.test(rollback), "the Rollback never touches decision_log (append-only)");
ok(!/\bDELETE\b|\bDROP\b/i.test(body) && hdr("BACKUP") === "", "the body has no DELETE or DROP, so no BACKUP header is needed");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai or anthropic.com link and no skip-CI token");
{
  // the one live sentence the switch UPDATE has to quote to replace it states a duration in days; it is old text, not a threshold, and it is exempt (twice: the guard and the replace)
  const OLD_QUOTE = "dedupe on worker, pre and post model for 7 days";
  ok(body.split(OLD_QUOTE).length === 3, "the live switch sentence in days is quoted exactly twice (the guard and the replace), so the exemption below is narrow", body.split(OLD_QUOTE).length - 1);
  ok(!/\b\d+ ?(hours?|days?)\b/i.test(body.split(OLD_QUOTE).join("")), "no duration in the statements is stated in hours or days (the detector window is 120 minutes, the worker windows 10080)");
}
ok(/model_ab_runs id 1/.test(sql) && /id 4/.test(sql) && /win rate 0\.25/.test(sql) && /100167/.test(sql) && /1676 output tokens/.test(sql) && /thinking false/.test(sql) && /2048 tokens/.test(sql) && /x-eval-key/.test(sql), "the header states the measured evidence: run ids, win rate, the closed 100167, the 1676 output tokens and the thinking-off 2048-token production call");
ok(/append-only/.test(sql) && /changes nothing/.test(sql), "the header says why the Rollback leaves the decision row and that the UPDATE can change nothing");
ok(!/\bagent_issues\b[^\n]*\b(UPDATE|INSERT)\b|\bUPDATE agent_issues\b|\bINSERT[^;]*INTO agent_issues\b|\bissue_triage\b[^\n]*\b(UPDATE|INSERT)\b/i.test(body), "the statements write nothing to agent_issues or issue_triage (the issue closes through its contract)");
const stmts = body.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
ok(stmts.length === 8 && /^CREATE TABLE IF NOT EXISTS bak_20261019_issue_100277_contract AS/.test(stmts[0]) && /^UPDATE remediation_contracts SET/.test(stmts[1]) && /^INSERT OR IGNORE INTO failure_modes\b/.test(stmts[2]) && /^INSERT OR IGNORE INTO remediation_contracts\b/.test(stmts[3])
  && /^CREATE TABLE IF NOT EXISTS bak_20261019_model_ab_controls AS\s+SELECT \* FROM control_registry WHERE control IN \('model-ab-run-cap', 'model-ab-switch'\)$/.test(stmts[4])
  && /^UPDATE control_registry SET/.test(stmts[5]) && /WHERE control = 'model-ab-run-cap' AND instr\(evidence, 'A run is at most 24 calls'\) > 0$/.test(stmts[5])
  && /^UPDATE control_registry SET/.test(stmts[6]) && /WHERE control = 'model-ab-switch' AND instr\(evidence, 'dedupe on worker, pre and post model for 7 days'\) > 0$/.test(stmts[6])
  && /^INSERT INTO decision_log\b/.test(stmts[7]) && /WHERE NOT EXISTS \(SELECT 1 FROM decision_log\b/.test(stmts[7]),
  "exactly eight statements: the contract backup and guarded UPDATE, two INSERT OR IGNORE rows, the control backup and its two guarded UPDATEs, the guarded decision row", stmts.map((s) => s.slice(0, 40)));
ok(stmts.findIndex((s) => /^CREATE TABLE IF NOT EXISTS bak_20261019_model_ab_controls/.test(s)) < stmts.findIndex((s) => /^UPDATE control_registry/.test(s)), "the control_registry copy is made before either control is updated");
ok(!/No control_registry row changes/.test(sql) && /control_registry\s+model-ab-run-cap and model-ab-switch/.test(sql), "the header no longer says that no control_registry row changes and names the two rows it corrects");
ok(rollback.includes("UPDATE control_registry SET (alternate_path, evidence, reviewed_at) = (SELECT b.alternate_path, b.evidence, b.reviewed_at FROM bak_20261019_model_ab_controls b WHERE b.control = control_registry.control) WHERE control IN ('model-ab-run-cap', 'model-ab-switch')"), "the single-line Rollback also restores both control rows from bak_20261019_model_ab_controls", rollback.slice(-400));

// ---- 2. fixtures: the live shapes ----
const LIVE_PLACEHOLDER = "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = 100277) AS observed";
// control_registry as read live on 2026-10-20 (schema from sqlite_master, rows verbatim from SELECT; no trigger is defined on it)
const CONTROL_TABLE = "CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')))";
const LIVE_CAP = { control: "model-ab-run-cap", location: "qnfo-model-eval worker.js abTick(): cf_model_eval_config ab_max_runs_per_tick (2) and ab_daily_cap (12)", kind: "cap", guards_against: "a burst of detected model changes (a deploy that moves many workers at once) running dozens of A/B runs in an hour", critical_path: 0, disposition: "keep", disposition_state: "applied",
  alternate_path: "raise ab_max_runs_per_tick or ab_daily_cap in cf_model_eval_config, or run POST /ab/run by hand for one pair; unrun candidates are detected again on the next tick while the change is inside the 2-day observation window", alternate_tested_at: "2026-10-19",
  evidence: "MEASURED 2026-10-19: three observed model changes in the last two days (qnfo-research-exec, qnfo-code-orchestrator, qnfo-fleet-control); at most 2 runs a tick drains them in two ticks. A run is at most 24 calls, so 12 runs a day is at most 288 calls through qnfo-ai. A cadence cap, not a spend budget: a breached ai_spend cap does not skip a run (BUDGET-SOFT-ROUTE-1).", issue_id: 2828, reviewed_at: "2026-10-19T13:36:57Z" };
const LIVE_SWITCH = { control: "model-ab-switch", location: "qnfo-model-eval worker.js abTick(): cf_model_eval_config ab_enabled", kind: "kill-switch", guards_against: "the A/B harness spending judge and post-change calls through qnfo-ai on a bad trigger, or filing regression issues from fixtures that do not represent a worker", critical_path: 0, disposition: "keep", disposition_state: "applied",
  alternate_path: "set ab_enabled = 0: the hourly tick stops running A/B work within one tick, no deploy; POST /ab/run still runs one pair by hand; ab-harness.test.mjs proves the off path and that the 6-hourly battery is untouched", alternate_tested_at: "2026-10-19",
  evidence: "MEASURED 2026-10-19: no instrument compared the answers of a pre-change and a post-change model (model_ab_runs did not exist) while 20 workers changed model on 2026-10-17. The harness is bounded by this switch, by model-ab-run-cap and by dedupe on worker, pre and post model for 7 days; its judges are pinned through qnfo-ai and a reply served by another model is not counted.", issue_id: 2828, reviewed_at: "2026-10-19T13:36:57Z" };
// a control that is not one of the two, carrying the same sentences: the UPDATEs are keyed on the control and must not reach it
const OTHER_CONTROL = { control: "some-other-cap", location: "elsewhere", kind: "cap", guards_against: "g", critical_path: 1, disposition: "keep", disposition_state: "applied", alternate_path: "unrun candidates are detected again on the next tick while the change is inside the 2-day observation window", alternate_tested_at: null,
  evidence: LIVE_CAP.evidence + " " + LIVE_SWITCH.evidence, issue_id: null, reviewed_at: "2026-10-18T00:00:00Z" };
const modelAbRuns = /CREATE TABLE IF NOT EXISTS model_ab_runs \([\s\S]*?\n\);/.exec(MODEL_AB)[0];
const predTable = /CREATE TABLE IF NOT EXISTS decision_predictions \([\s\S]*?\n\);/.exec(CALIBRATION)[0];
const predTrigger = /CREATE TRIGGER IF NOT EXISTS decision_predictions_parse[\s\S]*?\nEND;/.exec(CALIBRATION)[0];
const world = (o = {}) => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TRIGGER remediation_probe_semicolon_upd AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END;
CREATE TRIGGER remediation_probe_edit_rerun AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_probe IS NOT OLD.verify_probe OR NEW.verify_transport IS NOT OLD.verify_transport
BEGIN
  UPDATE remediation_contracts SET next_due_at = datetime('now') WHERE class = NEW.class;
END;
CREATE TRIGGER remediation_contracts_cadence_floor_au AFTER UPDATE OF expected_cadence_h, status ON remediation_contracts
WHEN NEW.issue_id IS NOT NULL AND NEW.status IN ('active', 'needs-machine-probe') AND (NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1)
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class;
END;
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT);
${CONTROL_TABLE};
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TABLE cf_model_eval_config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, PRIMARY KEY (day, worker, purpose, model));
${modelAbRuns}
${predTable}
${predTrigger}
INSERT INTO metric_registry (metric, last_value) VALUES ('model_ab_judged_runs_7d', '4');
`);
  if (o.issueStatus !== null) db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, 'MODEL-AB-REGRESSION-1: errata-hub glm-5.3-flash -> kimi-k2.6 on grounded-qa: win rate 0.25 < 0.4', 'd', 'cf-model-eval', 'optimization', 'high', ?, 1, 1)").run(ISSUE, o.issueStatus || "open");
  if (!o.noContract) {
    db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, last_verdict, module, budget_ms, next_due_at, max_items, requires_container, attempts) VALUES (?, ?, 'no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)', 'VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open', ?, 'd1-query', 3, 'qnfo-fleet-control', 1, ?, 'superseded:closure-observing-probe-at-birth (CLOSE-PROBE-CIRCULAR-1)', 'probe-template-v3-generic', 45000, '2026-10-19 23:24:28', 5, 0, 0)")
      .run(CLASS, ISSUE, o.probe || LIVE_PLACEHOLDER, o.contractStatus || "superseded");
  }
  const putControl = (r) => db.prepare("INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(r.control, r.location, r.kind, r.guards_against, r.critical_path, r.disposition, r.disposition_state, r.alternate_path, r.alternate_tested_at, r.evidence, r.issue_id, r.reviewed_at);
  if (!o.noControls) { putControl(o.editedControls ? { ...LIVE_CAP, evidence: "edited by hand, no longer the live sentence" } : LIVE_CAP); putControl(o.editedControls ? { ...LIVE_SWITCH, evidence: "edited by hand, no longer the live sentence" } : LIVE_SWITCH); }
  putControl(OTHER_CONTROL);
  // siblings that must survive: the issue-2828 contract (holding, live) and a hand-made contract
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module) VALUES ('issue-2828', 2828, 'p', 'a', 'SELECT 1', 'd1-query', 'x', 'holding', 'issue-2828-ab-harness')").run();
  db.prepare("INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id) VALUES ('model-change-unjudged', 'fm', 'rc', 'rem', 'det', 'fm-model-change-unjudged', '2026-10-19', 2828)").run();
  db.prepare("INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path) VALUES ('other', 'a', 'AB-HARNESS-1: an older decision', 'e', 'o', 'b', 'r')").run();
  return db;
};
const snap = (db) => JSON.stringify([db.prepare("SELECT * FROM remediation_contracts ORDER BY class").all(), db.prepare("SELECT * FROM failure_modes ORDER BY fm_key").all(), db.prepare("SELECT * FROM decision_log ORDER BY id").all(), db.prepare("SELECT * FROM decision_predictions ORDER BY id").all(), db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'bak_%' ORDER BY name").all(), db.prepare("SELECT * FROM control_registry ORDER BY control").all()]);
const contract = (db, cls = CLASS) => db.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(cls);
const ctl = (d, k) => d.prepare("SELECT * FROM control_registry WHERE control = ?").get(k);

const db = world();
const before = snap(db);
const placeholder = contract(db);
ok(placeholder.status === "superseded" && placeholder.verify_probe === LIVE_PLACEHOLDER && /FROM agent_issues WHERE id = 100277/.test(placeholder.verify_probe), "fixture: the contract is born superseded with the circular placeholder, as live");
if (!SKIP) db.exec(sql);

// ---- 3. the contract of issue 100277 ----
const c = contract(db);
ok(c.status === "active" && c.verify_transport === "d1-query" && c.last_verdict === null && c.attempts === 0 && c.module === "issue-100277-ab-length-retry" && c.issue_id === ISSUE, "the contract is active, d1-query, with no stale verdict and no attempts", c);
ok(c.next_due_at !== "2026-10-19 23:24:28" && c.next_due_at.slice(0, 10) >= "2026-10-19", "and it is due now, not at the superseded time", c.next_due_at);
ok(c.escalate_to === "qnfo-fleet-control" && c.max_attempts === 3 && c.expected_cadence_h === 1 && c.budget_ms === 45000 && c.max_items === 5 && c.requires_container === 0, "its other columns are untouched", c);
ok(/AB-LENGTH-RETRY-1/.test(c.precondition) && /harness_rev 2/.test(c.action), "precondition and action name the change and the revision", [c.precondition, c.action]);
const probe = c.verify_probe;
ok(!/FROM agent_issues WHERE id = 100277/.test(probe) && !probe.includes(";"), "the probe no longer reads the issue's own status and has no semicolon (the fleet's trigger would rewrite it)", probe.slice(0, 120));
ok(/^SELECT 'pass' AS expected, /.test(probe) && / AS observed$/.test(probe) && probe.includes("worker = 'errata-hub'") && probe.includes("post_model = '@cf/moonshotai/kimi-k2.6'") && probe.includes("ORDER BY id DESC LIMIT 1"), "expected is pass and observed is the newest verdict for errata-hub and kimi-k2.6", probe);
const pat = /detail LIKE '([^']*)'/.exec(probe);
ok(pat && pat[1] === '{"harness_rev":2,%' && Buffer.byteLength(pat[1]) === 18 && Buffer.byteLength(pat[1]) < 50, "the LIKE pattern is the rev-2 prefix, 18 bytes (D1 refuses over 50)", pat && pat[1]);
const py = (code, ...args) => {
  const r = spawnSync("python3", ["-I", "-c", "import sys, json; sys.path.insert(0, sys.argv[1]); import remediation_consumer as rc\n" + code, join(here, "..", "scripts"), ...args], { encoding: "utf8" });
  try { return JSON.parse(r.stdout.trim().split("\n").pop()); } catch (e) { return { error: "no output", stderr: r.stderr }; }
};
{
  const lit = py("print(json.dumps(rc.is_literal_select(sys.argv[2])))", probe);
  ok(Array.isArray(lit) && lit[0] === true, "the consumer accepts it as a literal read-only SELECT (no write keyword, one statement)", lit);
  const det = py("print(json.dumps(rc.is_literal_select(sys.argv[2])))", db.prepare("SELECT verify_probe p FROM remediation_contracts WHERE class = ?").get(FMC)?.p || "");
  ok(Array.isArray(det) && det[0] === true, "and so is the detector probe", det);
}
const read = (d = db) => d.prepare(d.prepare("SELECT verify_probe p FROM remediation_contracts WHERE class = ?").get(CLASS).p).get();
const ins = (d, o) => d.prepare("INSERT INTO model_ab_runs (created_at, model_pair, worker, task_set, pre_model, post_model, threshold, verdict, detail) VALUES (datetime('now', ?), 'a -> b', ?, 'grounded-qa', ?, ?, 0.4, ?, ?)")
  .run(o.age || "-1 minutes", o.worker || WORKER, PRE, o.post || POST, o.verdict, o.detail === undefined ? '{"harness_rev":2,"reason":"x"}' : o.detail);
const REV1_DETAIL = '{"reason":"win rate 0.25 < threshold 0.4","wins":0,"ties":4,"losses":4,"judge_pairs":4,"min_valid":6,"independent_families":["openai","deepseek"],"post_paths":{"workers-ai":8},"skipped":[],"items":[{"id":"gq-3","s":0,"js":[],"via":"workers-ai","why":"empty post-change reply (finish length)"}]}';
{
  let r = read();
  ok(r.expected === "pass" && /^pending: /.test(r.observed), "no run: the probe reads pending (expected pass, observed pending), so it cannot pass before a fixed run exists", r);
  ins(db, { verdict: "regression", detail: REV1_DETAIL });
  ins(db, { verdict: "pass", detail: REV1_DETAIL.replace("0.25 < threshold", "0.5 >= threshold") });
  r = read();
  ok(/^pending: /.test(r.observed), "the two live rev-1 rows (a regression and a pass without harness_rev) do not count: still pending", r);
  ins(db, { verdict: "pass", worker: "qnfo-research-exec" });
  ins(db, { verdict: "pass", post: "@cf/openai/gpt-oss-120b" });
  ok(/^pending: /.test(read().observed), "a rev-2 pass for another worker or another model does not count", read());
  ins(db, { verdict: "pass", detail: '{"harness_rev":1,"reason":"x"}' });
  ins(db, { verdict: "pass", detail: '{"harness_rev":20,"reason":"x"}' });
  ins(db, { verdict: "pass", detail: null });
  ok(/^pending: /.test(read().observed), "revision 1, revision 20 and a row with no detail do not match the rev-2 prefix", read());
  ins(db, { verdict: "regression" });
  ok(read().observed === "regression" && read().expected === "pass", "a rev-2 regression is read as regression: the issue stays open", read());
  const PENDING_START = "pending: the newest errata-hub run on kimi-k2.6 of the fixed harness revision is missing or reached no verdict";
  const consumer = (r) => py("print(json.dumps([rc.classify(sys.argv[2], sys.argv[3]), rc.is_deferred_read(sys.argv[3])]))", r.expected, r.observed);
  {
    const rr = read();
    const cr = consumer(rr);
    ok(rr.observed === "regression" && JSON.stringify(cr) === JSON.stringify([[0, "fail"], false]), "before the next rows: a rev-2 regression is a failure for the consumer (classify 0, not a deferral)", { rr, cr });
  }
  ins(db, { verdict: "inconclusive" });
  {
    const rr = read();
    const cr = consumer(rr);
    ok(rr.expected === "pass" && String(rr.observed).startsWith(PENDING_START), "the newest rev-2 row is inconclusive: the probe reads pending, not 'inconclusive'", rr);
    ok(JSON.stringify(cr) === JSON.stringify([[0, "fail"], true]), "and the consumer reads it as a deferral (is_deferred_read true), so no pass = 0 verification row is written for a run that reached no verdict", cr);
    ok(py("print(json.dumps(rc.is_measured_pending(sys.argv[2])))", rr.observed) === false, "the pending text carries no bound, so the relapse trigger does not count it as a measurement off target", rr.observed);
  }
  ins(db, { verdict: "error" });
  {
    const rr = read();
    const cr = consumer(rr);
    ok(String(rr.observed).startsWith(PENDING_START) && JSON.stringify(cr) === JSON.stringify([[0, "fail"], true]), "an error run is a deferral too", { rr, cr });
  }
  ins(db, { verdict: "inconclusive", worker: "qnfo-research-exec" });
  ins(db, { verdict: "pass", post: "@cf/openai/gpt-oss-120b" });
  ok(String(read().observed).startsWith(PENDING_START), "an inconclusive run of another worker or a pass on another model changes nothing", read());
  ins(db, { verdict: "pass" });
  r = read();
  ok(r.expected === "pass" && r.observed === "pass", "a rev-2 pass for errata-hub on kimi-k2.6 reads pass: expected equals observed", r);
  const cls = py("print(json.dumps([rc.classify(sys.argv[2], sys.argv[3]), rc.is_deferred_read(sys.argv[3])]))", "pass", "pass");
  ok(JSON.stringify(cls) === JSON.stringify([[1, "pass"], false]), "the consumer judges the pass read as pass (1), not a deferral", cls);
  const none = world();
  if (!SKIP) none.exec(sql);
  const pendNone = none.prepare(none.prepare("SELECT verify_probe p FROM remediation_contracts WHERE class = ?").get(CLASS).p).get();
  const pend = consumer(pendNone);
  ok(String(pendNone.observed).startsWith(PENDING_START) && pend[0][0] === 0 && pend[1] === true, "with no rev-2 row at all the read is pending: never a pass (classify gives 0) and a deferral", { pendNone, pend });
  ins(db, { verdict: "regression", age: "-1 minutes" });
  ok(read().observed === "regression", "a later regression at rev 2 re-opens the question: the newest row decides", read());
}

// ---- 3b. the guards on the UPDATE ----
if (!SKIP) {
  const closed = world({ issueStatus: "closed" });
  const closedBefore = JSON.stringify(contract(closed));
  closed.exec(sql);
  ok(JSON.stringify(contract(closed)) === closedBefore, "the issue is not open: the UPDATE changes nothing and the contract stays superseded");
  const missing = world({ noContract: true });
  let err = null;
  try { missing.exec(sql); } catch (e) { err = e; }
  ok(err === null && missing.prepare("SELECT COUNT(*) n FROM remediation_contracts WHERE class = ?").get(CLASS).n === 0, "the contract row is absent: the statement changes nothing and inserts no contract", err && err.message);
  const noIssue = world({ issueStatus: null });
  noIssue.exec(sql);
  ok(contract(noIssue).status === "superseded", "the issue row is absent: nothing changes");
  const handMade = world({ probe: "SELECT 'pass' AS expected, 'pass' AS observed", contractStatus: "active" });
  const hm = JSON.stringify(contract(handMade));
  handMade.exec(sql);
  ok(JSON.stringify(contract(handMade)) === hm, "a contract whose placeholder was already replaced by hand is not overwritten");
  const backup = db.prepare("SELECT * FROM bak_20261019_issue_100277_contract").all();
  ok(backup.length === 1 && backup[0].status === "superseded" && backup[0].verify_probe === LIVE_PLACEHOLDER && backup[0].module === "probe-template-v3-generic", "the superseded row was copied to its backup first", backup);
  ok(contract(db, "issue-2828").status === "holding" && contract(db, "issue-2828").verify_probe === "SELECT 1", "the sibling issue-2828 contract is untouched");
}

// ---- 4. failure mode and detector ----
const fm = db.prepare("SELECT * FROM failure_modes WHERE fm_key = ?").get(FM);
ok(fm && fm.probe_class === FMC && fm.first_seen === "2026-10-19" && fm.issue_id === ISSUE, "one failure_modes row, probe_class fm- plus the key, first_seen 2026-10-19, issue 100277", fm);
ok(fm && ["failure_mode", "root_cause", "remediation", "detector", "trigger_condition", "symptom", "blast_radius"].every((k) => typeof fm[k] === "string" && fm[k].length > 40), "every failure_modes text column is filled");
ok(fm && /finish length/.test(fm.root_cause) && /ids? 1/.test(fm.root_cause) && /id 4/.test(fm.root_cause) && /window of ai_call_counters that closes by itself/.test(fm.root_cause) && /100167/.test(fm.root_cause) && /abAlreadyRun/.test(fm.root_cause) && /AB-LENGTH-RETRY-1/.test(fm.remediation) && /1\.8\.0/.test(fm.remediation) && /abStaleRevCandidates/.test(fm.remediation) && /issue-100277/.test(fm.remediation) && new RegExp(FMC).test(fm.detector), "the root cause is the budget and the stale dedupe, the remediation names 1.7.1 and the closing probe, the detector names its contract");
ok(!/\b\d+ ?(hours?|days?)\b/i.test(JSON.stringify(fm || {})), "the failure mode states no duration in hours or days");
const dc = db.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(FMC);
ok(dc && dc.verify_transport === "d1-query" && dc.status === "active" && dc.module === "failure-mode" && dc.escalate_to === "qnfo-fleet-control" && dc.max_attempts === 3 && dc.issue_id === null && dc.action === "failure mode detector" && dc.precondition === "AB-LENGTH-RETRY-1" && dc.expected_cadence_h === 1 && dc.budget_ms === 45000 && dc.max_items === 5 && dc.requires_container === 0 && dc.class === fm.probe_class, "the detector contract has the shape of fm-model-change-unjudged", dc);
{
  // the shape of the sibling INSERT (column list and the values after the probe) is the one the AB-HARNESS-1 migration wrote
  const shape = (text, cls) => { const m = new RegExp("INSERT OR IGNORE INTO remediation_contracts \\(([^)]*)\\)\\s*VALUES\\s*\\('" + cls + "', [\\s\\S]*?'d1-query', ([^;]*)\\);").exec(text); return m ? [m[1].replace(/\s+/g, " "), m[2].replace(/\s+/g, " ")] : null; };
  const a = shape(MODEL_AB, "fm-model-change-unjudged"), b = shape(sql, FMC);
  const norm = (x) => x && [x[0].replace(", next_due_at", ""), x[1].replace(", datetime('now')", "")];
  ok(a && b && JSON.stringify(norm(a)) === JSON.stringify(norm(b)), "the INSERT has the sibling's column list (plus next_due_at) and the sibling's values after the probe", { sibling: a, mine: b });
}
const dprobe = dc ? dc.verify_probe : "";
ok(/^SELECT '0' AS expected, CAST\(/.test(dprobe) && !dprobe.includes(";") && /detail LIKE '\{"harness_rev":%'/.test(dprobe) && /created_at >= datetime\('now', '-120 minutes'\)/.test(dprobe) && !/10080/.test(dprobe), "the detector is a literal read of the 120-minute window over rows that carry harness_rev", dprobe);
{
  // SLA-120M-1: no threshold exceeds 120 minutes; the contract is read hourly (expected_cadence_h 1), so a window under 60 could miss a row between two reads
  const win = Number((/datetime\('now', '-(\d+) minutes'\)/.exec(dprobe) || [])[1]);
  ok(Number.isInteger(win) && win >= 60 && win <= 120 && (dc ? dc.expected_cadence_h === 1 : false), "the detector window is at most 120 minutes and at least the hourly read cadence", { win, cadence: dc && dc.expected_cadence_h });
  ok(fm && /last 120 minutes/.test(fm.detector) && !/10080/.test(fm.detector), "and the failure_modes.detector text states the same 120-minute window", fm && fm.detector);
}
const dread = (d) => d.prepare(dprobe).get();
ok(dprobe !== "", "the detector contract exists, so its probe can be replayed on real rows");
if (dprobe) {
  // rows written by the real (fixed) worker, through the real abExecute
  const body2 = workerSrc.replace(/^export default /m, "var __default = ");
  const mod = new Function("console", "fetch", body2 + "\n;return { AB_FIXTURES, abExecute };")({ log() {}, error() {} }, async () => { throw new Error("unexpected fetch"); });
  const byPrompt = new Map();
  for (const set of Object.values(mod.AB_FIXTURES)) for (const f of set) byPrompt.set(f.prompt, f);
  const stub = (post) => ({ async fetch(url, init) {
    const b = JSON.parse(init.body);
    const fx = byPrompt.get(b.messages[0].content);
    const r = fx ? post(fx, b) : { text: "WINNER: TIE", finish: "stop" };
    return new Response(JSON.stringify({ model: b.model, choices: [{ message: { content: r.text }, finish_reason: r.finish }] }), { status: 200 });
  } });
  const small = (b) => b.max_tokens < 1000;
  const run = (d, post, o = {}) => mod.abExecute({ AUDIT: { prepare(s) { let p = []; const st = { bind(...a) { p = a; return st; }, async run() { const r = d.prepare(s).run(...p); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, async first() { const r = d.prepare(s).get(...p); return r ? { ...r } : null; }, async all() { return { results: d.prepare(s).all(...p).map((x) => ({ ...x })) }; } }; return st; } }, QNFO_AI: stub(post) },
    Object.assign({ worker: WORKER, pre_model: PRE, post_model: POST, task_set: "grounded-qa", source: "observed", worker_models: [PRE, POST] }, o));
  const d = world();
  if (!SKIP) d.exec(sql);
  ok(dread(d).expected === "0" && dread(d).observed === "0", "no rows: the detector reads 0", dread(d));
  ins(d, { verdict: "regression", detail: REV1_DETAIL, age: "-1 minutes" });
  ok(dread(d).observed === "0", "the live rev-1 regression rows (item text 'finish length)' with no harness_rev) are history and do not count", dread(d));
  // the reasoning model: empty with finish length at the fixture budget, an answer at the retry
  const r1 = await run(d, (fx, b) => (small(b) ? { text: "", finish: "length" } : { text: fx.baseline, finish: "stop" }));
  const row1 = d.prepare("SELECT * FROM model_ab_runs ORDER BY id DESC LIMIT 1").get();
  ok(r1.verdict === "pass" && row1.detail.startsWith('{"harness_rev":2,') && JSON.parse(row1.detail).items.every((i) => i.retried === 2048), "the real worker retries and passes, and stores the rev-2 prefix", { v: r1.verdict, head: row1.detail.slice(0, 40) });
  ok(dread(d).observed === "0", "the detector reads 0 on a retried run", dread(d));
  const issueRead = read(d);
  ok(issueRead.observed === "pass" && issueRead.expected === "pass", "and the issue-100277 probe reads pass on the row the real worker wrote", issueRead);
  // a model that is length-empty at both budgets: a genuine regression, its losses say 'after retry'
  const r2 = await run(d, () => ({ text: "", finish: "length" }), { worker: "other-worker" });
  const row2 = d.prepare("SELECT * FROM model_ab_runs ORDER BY id DESC LIMIT 1").get();
  ok(r2.verdict === "regression" && JSON.parse(row2.detail).items.every((i) => /finish length\) after retry at 2048 tokens$/.test(i.why)), "a model empty at both budgets regresses with 'after retry at 2048 tokens' on every loss", JSON.parse(row2.detail).items[0]);
  ok(dread(d).observed === "0", "the detector still reads 0: a retried loss is not an unretried one", dread(d));
  // the retry bypassed: the same stored loss without 'after retry' (the shape the 1.7.0 worker wrote, now under a revision that carries harness_rev)
  d.prepare("UPDATE model_ab_runs SET detail = replace(detail, ' after retry at 2048 tokens', '') WHERE id = ?").run(row2.id);
  ok(dread(d).observed === "1", "an unretried length-empty loss under a rev-2 detail reads 1", dread(d));
  ins(d, { verdict: "regression", detail: '{"harness_rev":2,"items":[{"id":"gq-3","s":0,"js":[],"why":"empty post-change reply (finish length)"},{"id":"gq-4","s":0,"js":[],"why":"empty post-change reply (finish length)"}]}' });
  ok(dread(d).observed === "2", "it counts rows, not items (two rows now)", dread(d));
  ins(d, { verdict: "regression", detail: '{"harness_rev":2,"items":[{"id":"gq-3","s":0,"js":[],"why":"empty post-change reply (finish stop)"}]}' });
  ok(dread(d).observed === "2", "an empty reply with another finish is the model's own silence and does not count", dread(d));
  ins(d, { verdict: "regression", age: "-10081 minutes", detail: '{"harness_rev":2,"items":[{"id":"gq-3","s":0,"js":[],"why":"empty post-change reply (finish length)"}]}' });
  ok(dread(d).observed === "2", "a row older than 120 minutes is out of the window", dread(d));
  ins(d, { verdict: "regression", age: "-121 minutes", detail: '{"harness_rev":2,"items":[{"id":"gq-3","s":0,"js":[],"why":"empty post-change reply (finish length)"}]}' });
  ok(dread(d).observed === "2", "a row 121 minutes old is out of the window", dread(d));
  ins(d, { verdict: "regression", age: "-119 minutes", detail: '{"harness_rev":2,"items":[{"id":"gq-3","s":0,"js":[],"why":"empty post-change reply (finish length)"}]}' });
  ok(dread(d).observed === "3", "and a row 119 minutes old is inside it", dread(d));
  ins(d, { verdict: "regression", detail: '{"harness_rev":3,"items":[{"id":"gq-3","s":0,"js":[],"why":"empty post-change reply (finish length)"}]}' });
  ok(dread(d).observed === "4", "a later harness revision is read too (the prefix is harness_rev, not the number 2)", dread(d));
  // the latch: model_ab_runs rows are history and are never edited, so the read has to clear by itself once the row is older than the window
  const l = world();
  if (!SKIP) l.exec(sql);
  ins(l, { verdict: "regression", detail: '{"harness_rev":2,"items":[{"id":"gq-3","s":0,"js":[],"why":"empty post-change reply (finish length)"}]}' });
  ok(dread(l).observed === "1", "a bypassed retry reads 1 now", dread(l));
  l.exec("UPDATE model_ab_runs SET created_at = datetime('now', '-121 minutes')");
  ok(dread(l).observed === "0" && l.prepare("SELECT COUNT(*) n FROM model_ab_runs WHERE detail LIKE '{\"harness_rev\":%' AND instr(detail, 'finish length)\"') > 0").get().n === 1, "and 0 once the same, unedited row is 121 minutes old: the contract (and the issue it raises) clears inside the 120-minute SLA with no data repair", dread(l));
}

// ---- 4b. the premise of the prediction: which pairs the next hourly tick runs, on live-shaped rows and the real worker ----
{
  const body3 = workerSrc.replace(/^export default /m, "var __default = ");
  const w = new Function("console", "fetch", body3 + "\n;return { abObservedCandidates, abAlreadyRun, abStaleRevCandidates: typeof abStaleRevCandidates === 'undefined' ? undefined : abStaleRevCandidates };")({ log() {}, error() {} }, async () => { throw new Error("unexpected fetch"); });
  const auditOf = (d) => ({ prepare(q) { let p = []; const st = { bind(...a) { p = a; return st; }, async first() { const r = d.prepare(q).get(...p); return r ? { ...r } : null; }, async all() { return { results: d.prepare(q).all(...p).map((x) => ({ ...x })) }; } }; return st; } });
  const d = world();
  if (!SKIP) d.exec(sql);
  // ai_call_counters as read on 2026-10-20 (days are relative to now, as the candidate statement's are)
  const cnt = d.prepare("INSERT INTO ai_call_counters (day, worker, purpose, model, calls, errors) VALUES (date('now', ?), ?, 'p', ?, ?, 0)");
  const GLM = "@cf/zai-org/glm-5.3-flash", KIMI = "@cf/moonshotai/kimi-k2.6", Q3 = "@cf/qwen/qwen3-30b-a3b-fp8", GO20 = "@cf/openai/gpt-oss-20b";
  cnt.run("-5 days", "errata-hub", GLM, 400); cnt.run("-1 day", "errata-hub", GLM, 24); cnt.run("-1 day", "errata-hub", KIMI, 20); cnt.run("0 days", "errata-hub", KIMI, 15);
  cnt.run("-6 days", "qnfo-research-exec", GLM, 300); cnt.run("-2 days", "qnfo-research-exec", KIMI, 223); cnt.run("-1 day", "qnfo-research-exec", KIMI, 340);
  cnt.run("-5 days", "q08-signal-engine", Q3, 300); cnt.run("-3 days", "q08-signal-engine", GO20, 2); cnt.run("-1 day", "q08-signal-engine", GO20, 21);
  // model_ab_runs ids 1 to 5 as read: two rev-1 regressions (research-exec, errata-hub), two passes of other workers, one inconclusive q08 run
  const row = d.prepare("INSERT INTO model_ab_runs (created_at, model_pair, worker, task_set, pre_model, post_model, threshold, verdict, detail) VALUES (datetime('now', ?), 'a -> b', ?, 'grounded-qa', ?, ?, 0.4, ?, ?)");
  row.run("-14 hours", "qnfo-research-exec", GLM, KIMI, "regression", REV1_DETAIL);
  row.run("-14 hours", "qnfo-code-orchestrator", "@cf/qwen/qwen2.5-coder-32b-instruct", "@cf/openai/gpt-oss-120b", "pass", REV1_DETAIL.replace("0.25 < threshold", "0.5 >= threshold"));
  row.run("-13 hours", "qnfo-fleet-control", "@cf/openai/gpt-oss-120b", "@cf/nvidia/nemotron-3-120b-a12b", "pass", REV1_DETAIL.replace("0.25 < threshold", "0.5 >= threshold"));
  row.run("-5 hours", "errata-hub", GLM, KIMI, "regression", REV1_DETAIL);
  row.run("-1 minutes", "q08-signal-engine", Q3, GO20, "inconclusive", '{"harness_rev":2,"reason":"no judge family is independent of the models the pair uses","skipped":[]}');
  const env3 = { AUDIT: auditOf(d) };
  const judged = d.prepare("SELECT COUNT(*) n FROM model_ab_runs WHERE verdict IN ('pass', 'regression') AND created_at >= datetime('now', '-7 days')").get().n;
  ok(judged === 4, "fixture: model_ab_judged_runs_7d reads 4 before the tick", judged);
  const names = (list) => list.map((x) => x.worker).sort();
  const observed = await w.abObservedCandidates(env3, []);
  ok(JSON.stringify(names(observed)) === JSON.stringify(["errata-hub", "q08-signal-engine"]), "abObservedCandidates finds errata-hub and q08-signal-engine and NOT qnfo-research-exec (its 223 calls of the earlier days are prior)", names(observed));
  const stale = typeof w.abStaleRevCandidates === "function" ? await w.abStaleRevCandidates(env3, []) : [];
  ok(JSON.stringify(names(stale)) === JSON.stringify(["errata-hub", "qnfo-research-exec"]), "abStaleRevCandidates finds exactly the two rev-1 regression pairs (ids 1 and 4)", names(stale));
  const toRun = async (list) => {
    const seen = new Set(), out = [];
    for (const c of list) {
      const k = c.worker + "|" + c.pre_model + "|" + c.post_model;
      if (seen.has(k)) continue;
      seen.add(k);
      const st = await w.abAlreadyRun(env3, c);
      if (!st.done && !st.exhausted) out.push(c.worker);
    }
    return out.sort();
  };
  const onlyObserved = await toRun(observed);
  ok(JSON.stringify(onlyObserved) === JSON.stringify(["errata-hub"]), "with the counters source alone the next tick runs one pair (errata-hub); q08-signal-engine is already done", onlyObserved);
  const both = await toRun(observed.concat(stale));
  ok(JSON.stringify(both) === JSON.stringify(["errata-hub", "qnfo-research-exec"]), "with the stale-rev source the next tick runs both stale pairs, which is what the prediction of 6 rests on", both);
  ok(judged + both.length === 6, "4 judged runs plus the two re-runs is the 6 the prediction names", { judged, runs: both.length });
  // the header and the decision row state this premise and not the old one
  ok(/returns exactly two pairs/.test(sql) && /qnfo-research-exec\/kimi-k2\.6 is NOT a candidate any more/.test(sql) && /00:00Z 2026-10-20/.test(sql) && /00:00Z 2026-10-21/.test(sql) && /stale-rev/.test(sql), "the header states which pairs the counters source finds, why research-exec left its window and when errata-hub's closes");
  ok(!/Both candidate windows are still open/.test(sql) && !/re-runs the two stale regression pairs \(qnfo-research-exec and errata-hub, glm-5\.3-flash to kimi-k2\.6\) while their candidate windows are open/.test(sql), "the earlier claim that both candidate windows are open is gone");
}

// ---- 4c. control_registry: the two controls this change alters (DOCTRINE-1 section 16) ----
{
  const cap = ctl(db, LIVE_CAP.control), sw = ctl(db, LIVE_SWITCH.control), other = ctl(db, OTHER_CONTROL.control);
  const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
  const KEEP = ["control", "location", "kind", "guards_against", "critical_path", "disposition", "disposition_state", "alternate_tested_at", "issue_id"];
  const sameCols = (row, live, cols) => !!row && cols.every((k) => row[k] === live[k]);
  ok(sameCols(cap, LIVE_CAP, KEEP) && sameCols(sw, LIVE_SWITCH, KEEP), "both controls keep location, kind, guards_against, critical_path, disposition (keep, applied), alternate_tested_at and issue 2828: only evidence, alternate_path and reviewed_at move", [cap, sw].map((r) => r && r.control));
  // model-ab-run-cap: evidence
  const capCut = LIVE_CAP.evidence.indexOf("A run is at most 24 calls");
  const capTail = "A cadence cap, not a spend budget: a breached ai_spend cap does not skip a run (BUDGET-SOFT-ROUTE-1).";
  ok(!!cap && cap.evidence.startsWith(LIVE_CAP.evidence.slice(0, capCut)) && cap.evidence.endsWith(capTail) && capCut > 0, "the cap's evidence keeps the 2026-10-19 measurement and the closing sentence around the corrected one", cap && cap.evidence.slice(0, 80));
  ok(!!cap && /a run is at most 32 calls/.test(cap.evidence) && /at most 384 calls through qnfo-ai/.test(cap.evidence) && /before the retry it was 24 and 288/.test(cap.evidence) && !/A run is at most 24 calls|is at most 24 calls|at most 288 calls/.test(cap.evidence), "the cap's evidence states 32 calls a run and 384 a day, the figures its own decision row states, and no longer 24 and 288 as the current ones", cap && cap.evidence);
  ok(!!cap && /stale-rev candidate source needs no ai_call_counters window/.test(cap.evidence) && /last 10080 minutes/.test(cap.evidence) && /"retry unavailable" counts with the error rows/.test(cap.evidence) && /rests after 3 such rows in a day \(at most 96 calls for that pair\)/.test(cap.evidence), "and that the stale-rev source needs no ai_call_counters window, and the new rest of 3 inconclusive 'retry unavailable' runs a day (96 calls)", cap && cap.evidence);
  // model-ab-run-cap: alternate path
  ok(!!cap && cap.alternate_path.startsWith("raise ab_max_runs_per_tick or ab_daily_cap in cf_model_eval_config, or run POST /ab/run by hand for one pair; unrun candidates are detected again on the next tick from ") && /stale-rev source/.test(cap.alternate_path) && /needs no ai_call_counters window/.test(cap.alternate_path) && /rests after 3 such runs in a day/.test(cap.alternate_path) && !/observation window/.test(cap.alternate_path), "the cap's alternate path names the three candidate sources and the stale-rev one that needs no ai_call_counters window, and no longer ties re-detection to the observation window", cap && cap.alternate_path);
  // model-ab-switch
  const [swPre, swPost] = LIVE_SWITCH.evidence.split("dedupe on worker, pre and post model for 7 days");
  ok(!!sw && swPost !== undefined && sw.evidence.startsWith(swPre + "dedupe on worker, pre and post model for 10080 minutes, revision-gated for regression rows since qnfo-model-eval 1.8.0 (") && sw.evidence.endsWith(")" + swPost) && !/for 7 days/.test(sw.evidence), "the switch's evidence swaps only the dedupe clause: 10080 minutes, revision-gated for regression rows, the rest of the sentence kept", sw && sw.evidence);
  ok(!!sw && /counts as done only when its detail starts with the current harness_rev/.test(sw.evidence) && /"retry unavailable" is not deduped but counts with the error rows and rests the pair after 3 in a day/.test(sw.evidence), "and states the revision gate and the retry-unavailable rest", sw && sw.evidence);
  ok(!!sw && sw.alternate_path === LIVE_SWITCH.alternate_path, "the switch's alternate path (ab_enabled = 0) is still true and unchanged");
  ok(!!cap && !!sw && ISO.test(cap.reviewed_at) && ISO.test(sw.reviewed_at) && cap.reviewed_at > LIVE_CAP.reviewed_at && sw.reviewed_at > LIVE_SWITCH.reviewed_at, "reviewed_at is refreshed on both rows", [cap && cap.reviewed_at, sw && sw.reviewed_at]);
  ok(!!cap && !!sw && !/\b\d+ ?(hours?|days?)\b/i.test(cap.evidence + " " + cap.alternate_path + " " + sw.evidence), "the corrected registry text states no duration in hours or days");
  ok(!!other && JSON.stringify(other) === JSON.stringify(OTHER_CONTROL), "a control with the same sentences but another key is untouched", other);
  if (!SKIP) {
    const bk = db.prepare("SELECT * FROM bak_20261019_model_ab_controls ORDER BY control").all();
    ok(bk.length === 2 && bk[0].control === LIVE_CAP.control && bk[1].control === LIVE_SWITCH.control && Object.keys(LIVE_CAP).every((k) => bk[0][k] === LIVE_CAP[k] && bk[1][k] === LIVE_SWITCH[k]), "bak_20261019_model_ab_controls holds the two rows as they were, every column", bk);
    ok(db.prepare("PRAGMA table_info(bak_20261019_model_ab_controls)").all().map((x) => x.name).join(",") === Object.keys(LIVE_CAP).join(","), "with the control_registry columns");
    // guards: absent rows, rows edited by hand, a replay
    const nc = world({ noControls: true });
    let e2 = null;
    try { nc.exec(sql); } catch (e) { e2 = e; }
    ok(e2 === null && nc.prepare("SELECT COUNT(*) n FROM control_registry WHERE control LIKE 'model-ab-%'").get().n === 0 && nc.prepare("SELECT COUNT(*) n FROM bak_20261019_model_ab_controls").get().n === 0, "the controls are absent: both UPDATEs change nothing and insert nothing, the copy is empty", e2 && e2.message);
    const ed = world({ editedControls: true });
    const edBefore = JSON.stringify(ed.prepare("SELECT * FROM control_registry ORDER BY control").all());
    ed.exec(sql);
    ok(JSON.stringify(ed.prepare("SELECT * FROM control_registry ORDER BY control").all()) === edBefore, "controls whose evidence no longer holds the live sentence (edited by hand) are not overwritten, reviewed_at included");
    const rp = world();
    rp.exec(sql);
    rp.exec("UPDATE control_registry SET reviewed_at = '2000-01-01T00:00:00Z' WHERE control LIKE 'model-ab-%'");
    const rpBefore = JSON.stringify(rp.prepare("SELECT * FROM control_registry ORDER BY control").all());
    rp.exec(sql);
    ok(JSON.stringify(rp.prepare("SELECT * FROM control_registry ORDER BY control").all()) === rpBefore && rp.prepare("SELECT COUNT(*) n FROM control_registry WHERE reviewed_at = '2000-01-01T00:00:00Z'").get().n === 2, "a replay does not touch the rewritten rows (reviewed_at set to a sentinel stays) and the copy keeps the original text", rp.prepare("SELECT control, reviewed_at FROM control_registry ORDER BY control").all());
    ok(rp.prepare("SELECT evidence FROM bak_20261019_model_ab_controls WHERE control = ?").get(LIVE_CAP.control).evidence === LIVE_CAP.evidence, "the backup is not overwritten by the replay: it still holds the original cap evidence");
  }
}

// ---- 5. the decision row and its prediction ----
const dl = db.prepare("SELECT * FROM decision_log WHERE instr(action, 'AB-LENGTH-RETRY-1:') = 1").all();
ok(dl.length === 1, "one decision_log row for AB-LENGTH-RETRY-1", dl.length);
const dr = dl[0] || {};
ok(dr.actor === "session_01QpQv19uh1padRwZ3u1r766", "the actor is the session", dr.actor);
ok(["assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "surfaces_tested"].every((k) => typeof dr[k] === "string" && dr[k].length > 3) && dr.reach_gain === "none" && dr.outcome_matched === null, "every doctrine column is filled and outcome_matched is left for the result", Object.keys(dr).filter((k) => dr[k] == null));
ok(/^model_ab_judged_runs_7d >= 6 within 4 h$/.test(dr.predicted_outcome || ""), "the prediction is in the form decision_predictions_parse reads", dr.predicted_outcome);
const dp = db.prepare("SELECT * FROM decision_predictions WHERE decision_id = ?").all(dr.id === undefined ? -1 : dr.id);
ok(dp.length === 1 && dp[0].kind === "metric" && dp[0].subject === "model_ab_judged_runs_7d" && dp[0].op === ">=" && dp[0].value === 6 && dp[0].origin === "parsed" && dp[0].scored_at === null, "the parser turns it into one metric prediction, unscored", dp);
ok(/1\.8\.0/.test(dr.action || "") && /abStaleRevCandidates/.test(dr.action || "") && /2048/.test(dr.action || "") && /4096/.test(dr.action || "") && /harness_rev 2/.test(dr.action || "") && /issue 100277/.test(dr.action || "") && /ab-length-empty-scored-as-loss/.test(dr.action || ""), "the action names the release, the budgets, the revision, the issue and the failure mode");
ok(/32 calls against 24/.test(dr.blast_radius || "") && /384 against 288/.test(dr.blast_radius || ""), "the blast radius states the extra calls (32 against 24, 384 against 288 a day)", dr.blast_radius);
ok(/bak_20261019_issue_100277_contract/.test(dr.rollback_path || "") && /append-only/.test(dr.rollback_path || "") && /ab_enabled = 0/.test(dr.rollback_path || ""), "the rollback path names the backup, the append-only note and the kill switch");
ok(/control_registry rows model-ab-run-cap/.test(dr.action || "") && /model-ab-switch/.test(dr.action || "") && /120-minute window/.test(dr.action || "") && /bak_20261019_model_ab_controls/.test(dr.blast_radius || "") && /bak_20261019_model_ab_controls/.test(dr.rollback_path || "") && /control_registry read live 2026-10-20/.test(dr.evidence || ""), "the decision row records the registry correction (action, evidence, blast radius, rollback path) and the 120-minute detector window", [dr.action && dr.action.slice(-420)]);
ok(!/metric_registry|analytics_metric_triggers/.test(body), "the file registers no metric: the prediction subject model_ab_judged_runs_7d exists live (AB-HARNESS-1) and the fixture seeds it");

// ---- 6. replay, pre-existing rows, rollback, append-only ----
if (!SKIP) {
  const once = snap(db);
  db.exec(sql);
  ok(snap(db) === once, "a replay changes nothing");
  ok(JSON.parse(once)[2].some((r) => r.actor === "other") && contract(db, "issue-2828").status === "holding", "the rows that were there are untouched");

  const pre = world();
  pre.prepare("INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id) VALUES (?, 'theirs', 'theirs', 'theirs', 'theirs', ?, '2026-10-18', 1)").run(FM, FMC);
  pre.prepare("INSERT INTO remediation_contracts (class, precondition, action, verify_probe, verify_transport, escalate_to, status) VALUES (?, 'theirs', 'theirs', 'SELECT ''0'' AS expected, ''0'' AS observed', 'd1-query', 'someone', 'paused')").run(FMC);
  pre.prepare("INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path) VALUES ('other', 'a', 'AB-LENGTH-RETRY-1: written by hand', 'e', 'o', 'b', 'r')").run();
  const fmBefore = JSON.stringify(pre.prepare("SELECT * FROM failure_modes WHERE fm_key = ?").get(FM)), dcBefore = JSON.stringify(pre.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(FMC));
  pre.exec(sql);
  ok(JSON.stringify(pre.prepare("SELECT * FROM failure_modes WHERE fm_key = ?").get(FM)) === fmBefore && JSON.stringify(pre.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(FMC)) === dcBefore && pre.prepare("SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'AB-LENGTH-RETRY-1:') = 1").get().n === 1, "a failure mode, a detector contract and a decision row that already exist are not overwritten or duplicated");

  db.exec(rollback);
  const back = contract(db);
  ok(back.status === "superseded" && back.verify_probe === LIVE_PLACEHOLDER && back.module === "probe-template-v3-generic" && /^no earlier birth template/.test(back.precondition) && back.last_verdict === placeholder.last_verdict && back.attempts === 0, "the Rollback restores the placeholder contract from its backup (status, probe, module, precondition, verdict)", back);
  ok(db.prepare("SELECT COUNT(*) n FROM failure_modes WHERE fm_key = ?").get(FM).n === 0 && db.prepare("SELECT COUNT(*) n FROM remediation_contracts WHERE class = ?").get(FMC).n === 0, "and removes the failure mode and its detector");
  ok(db.prepare("SELECT COUNT(*) n FROM failure_modes WHERE fm_key = 'model-change-unjudged'").get().n === 1 && contract(db, "issue-2828").status === "holding", "while the sibling rows stay");
  ok(Object.keys(LIVE_CAP).every((k) => ctl(db, LIVE_CAP.control)[k] === LIVE_CAP[k]) && Object.keys(LIVE_SWITCH).every((k) => ctl(db, LIVE_SWITCH.control)[k] === LIVE_SWITCH[k]), "the Rollback restores model-ab-run-cap and model-ab-switch exactly as they were live (evidence, alternate_path and reviewed_at from the copy, every column)", [ctl(db, LIVE_CAP.control).evidence.slice(-120), ctl(db, LIVE_SWITCH.control).evidence.slice(-120)]);
  ok(JSON.stringify(ctl(db, OTHER_CONTROL.control)) === JSON.stringify(OTHER_CONTROL), "and leaves the control that is not one of the two");
  ok(db.prepare("SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'AB-LENGTH-RETRY-1:') = 1").get().n === 1, "the Rollback leaves the decision row");
  let refused = false;
  try { db.exec("DELETE FROM decision_log WHERE instr(action, 'AB-LENGTH-RETRY-1:') = 1"); } catch (e) { refused = /append-only/.test(String(e.message)); }
  ok(refused, "the fixture's append-only trigger refuses a DELETE of the decision row, which is why the Rollback does not try");
  db.exec(sql);
  ok(contract(db).status === "active" && db.prepare("SELECT COUNT(*) n FROM failure_modes WHERE fm_key = ?").get(FM).n === 1 && db.prepare("SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'AB-LENGTH-RETRY-1:') = 1").get().n === 1, "re-applying after the Rollback restores the contract, the failure mode and the detector, with one decision row");
  ok(/at most 384 calls through qnfo-ai/.test(ctl(db, LIVE_CAP.control).evidence) && /revision-gated/.test(ctl(db, LIVE_SWITCH.control).evidence) && db.prepare("SELECT evidence FROM bak_20261019_model_ab_controls WHERE control = ?").get(LIVE_CAP.control).evidence === LIVE_CAP.evidence, "and rewrites the two controls again, while the copy still holds the original text");
  const chk = spawnSync("python3", [join(here, "..", "scripts", "apply_migrations.py"), "--check", join(here, "2026-10-19-ab-length-retry.sql")], { encoding: "utf8" });
  ok(chk.status === 0 && /"ok": true/.test(chk.stdout), "the file passes scripts/apply_migrations.py --check", chk.stdout + chk.stderr);
} else {
  ok(snap(db) !== before, "(skip mode) the file changed the world");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
