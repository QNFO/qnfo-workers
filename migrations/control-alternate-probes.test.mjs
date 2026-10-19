// CONTROL-ALT-PROBES-1 offline suite: runs migrations/2026-10-19-control-alternate-probes.sql on SQLite (node:sqlite) over fixtures built from the
// live qnfo-audit schemas. Proves: the table has the columns the brief names and is seeded with one read-only expected/observed probe per exercisable
// control (the 7 critical controls first); every probe passes on a fixture where its alternate is in place and FAILS, with a reason, on a fixture where
// that alternate is broken (one failing fixture per control, several for the guards); the verdicts are judged by the real chaosJudge sliced from
// qnfo-fleet-control/worker.js; the live enum and evidence triggers (their sqlite_master text) do their job when fired; the views v_control_alternate_status
// and v_control_alternate_untested compute the critical-path count from the table and agree with the scorecard expression; v_path_coverage_gaps reads a
// recorded ALTERNATE-NOT-EXERCISABLE row as its own state (and the old definition does not); the fm- detector passes at birth and fails for a control with
// an alternate, no tested date and no probe; the runner issue carries a precise code-task / code-anchor / code-probe; re-applying changes nothing.
// Run: node migrations/control-alternate-probes.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, "2026-10-19-control-alternate-probes.sql");
const sql = readFileSync(MIGRATION, "utf8");
const workerSrc = readFileSync(join(here, "..", "qnfo-fleet-control", "worker.js"), "utf8");

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

// ---- the real judge, sliced from the worker (the same function the chaos drill uses) ----
const BEGIN = "// ---- CHAOS-DRILL-1:BEGIN", END = "// ---- CHAOS-DRILL-1:END ----";
const a = workerSrc.indexOf(BEGIN), b = workerSrc.indexOf(END);
ok(a > 0 && b > a, "chaos drill block markers present in qnfo-fleet-control/worker.js");
let block = workerSrc.slice(a, b);
block = block.slice(0, block.indexOf("async function chaosExercise("));
const { chaosJudge, chaosPlan } = new Function("__name", block + "\nreturn { chaosJudge, chaosPlan };")(function () {});

// ---- fixture: live schemas, minimal rows ----
const NOW = Date.now();
const iso = (minAgo) => new Date(NOW - minAgo * 6e4).toISOString();
const ms = (minAgo) => NOW - minAgo * 6e4;
const TODAY = "2026-10-19";

const SCHEMA = `
CREATE TABLE control_registry (
  control TEXT PRIMARY KEY, location TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')),
  guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0,
  disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')),
  disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')),
  alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER,
  reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE process_contracts (process TEXT PRIMARY KEY, paths_json TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization',
  priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER,
  pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL,
  verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active',
  ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT,
  max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL,
  probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL,
  assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL,
  capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE status_canon (raw_value TEXT PRIMARY KEY, canonical TEXT NOT NULL, is_open INTEGER NOT NULL, is_terminal INTEGER NOT NULL, note TEXT);
CREATE TABLE priority_canon (raw_value TEXT PRIMARY KEY, canonical TEXT NOT NULL, rank INTEGER NOT NULL, note TEXT);
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), source TEXT NOT NULL);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE pipeline_flags (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT);
CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, idea TEXT NOT NULL, contact TEXT, status TEXT DEFAULT 'new', ip_hash TEXT,
  created_at TEXT DEFAULT (datetime('now')), decision TEXT, score REAL, rationale TEXT, triaged_at TEXT);
CREATE TABLE signals (id TEXT PRIMARY KEY, ts TEXT, source TEXT, source_ref TEXT, content TEXT, open_questions TEXT, evidential_weight REAL, domain TEXT,
  status TEXT DEFAULT 'new', decision TEXT, score REAL, created_at TEXT);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT, score REAL, decision TEXT, status TEXT DEFAULT 'queued',
  claimed_at TEXT, completed_at TEXT, paper_slug TEXT, created_at TEXT, stage TEXT, agent_task_id TEXT, attempt INTEGER DEFAULT 0, revise_count INTEGER DEFAULT 0,
  context TEXT, published_at TEXT, doi TEXT, paper_url TEXT, error TEXT, recover_count INTEGER DEFAULT 0, terminal_rearms INTEGER DEFAULT 0, publish_due_at TEXT);
CREATE TABLE research_hold_seen (id TEXT PRIMARY KEY, first_seen TEXT NOT NULL);
CREATE TABLE queue_sla_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, stuck_type TEXT, n INTEGER, note TEXT);
CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, published_at TEXT, status TEXT DEFAULT 'published');
CREATE TABLE deployment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, status TEXT, deployed_at TEXT);
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, enabled INTEGER DEFAULT 1);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT);
CREATE TABLE migration_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, file TEXT, status TEXT NOT NULL, applied_at TEXT);
CREATE TABLE ops_jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'queued', model TEXT, strategy TEXT, payload TEXT, response TEXT, tool_log TEXT, error TEXT,
  created_at TEXT, updated_at TEXT, origin TEXT, surfaced_at TEXT);
CREATE TABLE queue_sla (stuck_type TEXT PRIMARY KEY, queue TEXT, definition TEXT);
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), issue_id INTEGER, event TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL,
  triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE tool_error_exclusions (pattern TEXT PRIMARY KEY, err_class TEXT NOT NULL, rationale TEXT, added_at TEXT DEFAULT (datetime('now')));
CREATE TABLE tracker_sync_state (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT);
CREATE TABLE gh_issue_links (issue_id INTEGER PRIMARY KEY, gh_number INTEGER NOT NULL UNIQUE, gh_state TEXT, d1_status TEXT, synced_at TEXT, gh_close_reason TEXT);
CREATE VIEW v_human_action_gate AS SELECT 'owner-request-issue' AS source, 'receipt' AS gate;
CREATE VIEW tool_failures_excluded_24h AS SELECT pattern, err_class FROM tool_error_exclusions;
CREATE VIEW tool_failures_24h AS SELECT pattern AS tool, err_class AS failure_class FROM tool_error_exclusions;
-- the live trigger texts of the guards the probes read (sqlite_master, qnfo-audit, 2026-10-19)
CREATE TRIGGER agent_issues_normalise_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE agent_issues SET
    description = COALESCE(description, '') || char(10) || 'NO-SILENT-DROP-1: unmapped status/priority "' || COALESCE(status, '') || '"/"' || COALESCE(priority, '') || '" normalised by the fleet tick instead of refused.',
    status = CASE WHEN status IS NULL OR EXISTS (SELECT 1 FROM status_canon s WHERE s.raw_value = agent_issues.status) THEN status ELSE 'open' END,
    priority = CASE WHEN priority IS NULL OR EXISTS (SELECT 1 FROM priority_canon p WHERE p.raw_value = agent_issues.priority) THEN priority ELSE 'medium' END
  WHERE (status IS NOT NULL AND NOT EXISTS (SELECT 1 FROM status_canon s WHERE s.raw_value = agent_issues.status))
     OR (priority IS NOT NULL AND NOT EXISTS (SELECT 1 FROM priority_canon p WHERE p.raw_value = agent_issues.priority));
END;
CREATE TRIGGER agent_issues_evidence_annotate_ai AFTER INSERT ON agent_issues
WHEN NEW.source LIKE 'cloud_ops_events:%' AND NOT EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.id = replace(NEW.source, 'cloud_ops_events:', ''))
BEGIN
  UPDATE agent_issues SET description = COALESCE(description, '') || char(10) || 'NO-SILENT-DROP-1: the cited evidence event ' || NEW.source || ' does not exist; the issue was kept and needs its evidence re-attached.'
  WHERE id = NEW.id;
END;
CREATE TRIGGER research_hold_expiry_tick AFTER INSERT ON fleet_tick
BEGIN
  DELETE FROM research_hold_seen WHERE id NOT IN (SELECT id FROM research_queue WHERE status = 'held');
  INSERT OR IGNORE INTO research_hold_seen (id, first_seen)
    SELECT id, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') FROM research_queue WHERE status = 'held';
  UPDATE research_queue SET status = 'review', stage = 'publish', claimed_at = NULL,
      error = substr('HOLD-EXPIRY-1 ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ': released after 6 h held (a hold needs an expiry). Was: ' || COALESCE(error, ''), 1, 500)
  WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
    AND status = 'held' AND instr(COALESCE(error, ''), 'Revert: status review, stage publish') > 0
    AND id IN (SELECT id FROM research_hold_seen WHERE first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-360 minutes'));
END;
CREATE TRIGGER owner_request_requires_card BEFORE UPDATE OF status ON agent_issues BEGIN SELECT 1; END;
CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id)
BEGIN INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
  VALUES ('issue-' || NEW.id, NEW.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 1, 'needs-machine-probe', 'birth'); END;
`;

// control_registry rows: [control, critical, disposition, state, alternate, tested_at, evidence]
const CONTROLS = [
  ["agent-issues-enum-guard", 1, "replace", "applied", "accept then normalise", null, "RAISE(ABORT) became a silent drop"],
  ["agent-issues-evidence-guard", 1, "replace", "applied", "accept and annotate", null, "abort dropped the issue"],
  ["idea-triaged-hold-owner-and-reentry", 1, "replace", "planned", "owner ideas accepted, re-entry as a rate", null, "31 held ideas released"],
  ["research-citation-unverified-hold", 1, "keep", "applied", "second lookup, expiry after 6 h", null, "7 of 77 runs unverified"],
  ["research-gate-structure", 1, "keep", "applied", "a failing first pass goes to revise", null, "sections 5 to 7 absent"],
  ["research-review-hard-gate", 1, "keep", "applied", "measure restores the advance", null, "158 of 421 steps"],
  ["zenodo-enabled", 1, "demote", "planned", "in-house publication", null, "the switch mirrors an outside refusal"],
  ["social-weekly-caps", 0, "demote", "applied", "spacing keeps posts spread", null, "raised by owner directive"],
  ["cf-obs-nested-too-deep-pin", 0, "demote", "applied", "holds only while seen inside 72 h", null, "7 of 10 assertions pass"],
  ["compat-advance-review-gate", 0, "keep", "applied", "withholds only the date change", null, "runs each branch"],
  ["gh_app_primary", 0, "keep", "applied", "per-request fallback", null, "0.32.0"],
  ["improvement-loop-superseded-marker", 0, "keep", "applied", "successor carries its own trigger", null, "10 of 19 assertions pass"],
  ["migration-header-guard", 0, "keep", "applied", "the remediation consumer sweep", null, "a headerless file fails --check"],
  ["migration-headerless-allowlist", 0, "demote", "planned", "none needed: a file on the list is simply not checked", null, "grandfather clause only"],
  ["ops-jobs-payload-redaction", 0, "keep", "applied", "system and user messages stay verbatim", null, "TRADEOFF: replay sees redacted output"],
  ["ops-jobs-terminal-sweep", 0, "keep", "applied", "none needed: a failure only keeps rows longer", null, "cancelled was never swept"],
  ["owner-request-receipt-gate", 0, "keep", "applied", "autonomy_first_gate = off stops the reroute", null, "5 of 7 receipts"],
  ["owner-request-requires-card", 0, "keep", "applied", "the closure is also recorded in issue_lifecycle", null, "kept as live"],
  ["perf-loop-enabled", 0, "replace", "applied", "PERF-PIN-1", null, "paused 2026-10-06"],
  ["research-admission-cap", 0, "demote", "applied", "a generated accept over the cap waits as triaged_hold", null, "before 1.10.12"],
  ["tool_error_exclusions", 0, "keep", "applied", "tool_failures_excluded_24h lists every excluded row", null, "every pattern carries a rationale"],
  ["tracker-mass-flip-guard", 0, "demote", "applied", "a disagreement is explained when D1 moved", null, "the guard had never fired"],
  // not exercisable, recorded reason (live: research-owner-hold and command-drain-key are removed, outreach-consent-gate is kept)
  ["research-owner-hold", 1, "remove", "applied", "none needed", null, "19 rows released | PATHS-UNTESTED-1: ALTERNATE-NOT-EXERCISABLE: the declared alternate is none needed"],
  ["command-drain-key", 0, "remove", "applied", "none needed", null, "removed | PATHS-UNTESTED-1: ALTERNATE-NOT-EXERCISABLE: the declared alternate is none needed"],
  ["outreach-consent-gate", 0, "keep", "applied", "none needed: protects people outside the fleet", null, "never on a research path | PATHS-UNTESTED-1: ALTERNATE-NOT-EXERCISABLE: the declared alternate is none needed"],
  // already tested by hand, no probe: stays tested, shows as hand-stamped without a probe
  ["canary-functional", 1, "keep", "applied", "a second canary", "2026-10-12T08:30:00Z", "stamped by hand"],
  ["code-merge-max-per-tick", 1, "demote", "applied", "the stale-PR lane", "2026-10-08", "stamped by hand"],
  // no alternate at all
  ["bare-control", 0, "keep", "applied", "", null, "no alternate declared"]
];

function seedGood(db) {
  for (const c of CONTROLS) db.prepare("INSERT INTO control_registry (control, location, kind, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence) VALUES (?, 'loc', 'guard', ?, ?, ?, ?, ?, ?)").run(c[0], c[1], c[2], c[3], c[4], c[5], c[6]);
  db.exec("INSERT INTO process_contracts VALUES ('p-ok', '[1,2,3]'), ('p-single', '[1]'), ('p-two', '[1,2]'), ('p-bad', 'not json')");
  for (const s of ["open", "closed", "resolved", "wontfix", "OPEN"]) db.prepare("INSERT INTO status_canon VALUES (?, ?, 1, 0, NULL)").run(s, s.toLowerCase());
  for (const p of ["low", "medium", "high", "critical"]) db.prepare("INSERT INTO priority_canon VALUES (?, ?, 1, NULL)").run(p, p);
  const cfg = db.prepare("INSERT INTO ops_config (key, value) VALUES (?, ?)");
  for (const [k, v] of [["research_review_gate", "enforce"], ["gh_app_primary", "on"], ["autonomy_first_gate", "on"], ["perf_loop_enabled", "1"], ["perf_pin:q08-cadence", "owner cap q08_max_per_day (card 58)"], ["q08_max_per_day", "10"], ["queue_sla_autofix", "on"]]) cfg.run(k, v);
  db.prepare("INSERT INTO pipeline_flags VALUES ('social_channel_caps', '{\"linkedin\":7,\"mastodon\":14,\"twitter\":14,\"substack\":14}', ?)").run(iso(5));
  const post = db.prepare("INSERT INTO social_media_posts (id, platform, published_at) VALUES (?, ?, ?)");
  post.run("p1", "buffer-x", iso(60 * 30)); post.run("p2", "buffer-x", iso(60 * 10));
  post.run("p3", "buffer-substack", iso(60 * 3)); post.run("p4", "buffer-substack", iso(60 * 3 - 20));
  const ev = db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, status) VALUES (?, ?, ?, ?)");
  ev.run("e-revise", iso(60), "revise-patch", "ok"); ev.run("e-triage", iso(60), "review-triage", "ok");
  ev.run("e-compat", iso(60 * 24), "compat-verify", "ok"); ev.run("e-github", iso(60), "github", "ok");
  db.prepare("INSERT INTO deployment_history (action, status, deployed_at) VALUES ('deploy', 'success', ?)").run(iso(60));
  db.prepare("INSERT INTO research_queue (id, status, published_at, doi) VALUES ('r1', 'published', ?, NULL)").run(iso(60));
  db.prepare("INSERT INTO signals (id, ts, source, status) VALUES ('s1', ?, 'artifact_reentry', 'consumed')").run(iso(60 * 24));
  const idea = db.prepare("INSERT INTO idea_proposals (name, idea, contact, status, rationale, created_at, triaged_at) VALUES (?, 'x', ?, ?, ?, ?, ?)");
  idea.run("rowan-chat", "chat", "triaged_accepted", "OWNER-IDEA-PRIORITY-1: released", iso(60 * 24 * 3), iso(60));
  idea.run("owner-import", "owner", "triaged_hold", "withdrawn by owner 2026-10-04: premature", iso(60 * 24 * 5), iso(60));
  idea.run("auto-scan", null, "triaged_hold", "[research admission cap 300/120] scored", iso(60 * 24), iso(30));
  const rc = db.prepare("INSERT INTO remediation_contracts (class, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict) VALUES (?, 'p', 'a', 'x', 'd1-query', 'e', 'active', ?)");
  rc.run("fm-trigger-depth-compile", "pass"); rc.run("fm-migration-headerless-silent-skip", "pass"); rc.run("fm-ops-jobs-sweep-status-gap", "pass");
  const trg = db.prepare("INSERT INTO analytics_metric_triggers (metric_key, enabled) VALUES (?, 1)");
  trg.run("issues_open_over_120m"); trg.run("open_issues_without_doer_120m");
  const mr = db.prepare("INSERT INTO metric_registry (metric, last_value, last_refreshed) VALUES (?, '0', ?)");
  mr.run("issues_open_over_120m"); mr.run("open_issues_without_doer_120m"); mr.run("migrations_unapplied");
  db.prepare("UPDATE metric_registry SET last_refreshed = ?").run(iso(60));
  db.prepare("INSERT INTO migration_runs (file, status, applied_at) VALUES ('f.sql', 'ok', ?)").run(iso(60));
  db.prepare("INSERT INTO ops_jobs (id, status, payload, updated_at) VALUES ('j1', 'succeeded', 'plain request', ?)").run(iso(60 * 24));
  db.exec("INSERT INTO queue_sla (stuck_type, queue, definition) VALUES ('ops-job-terminal-retained', 'ops_jobs', 'd')");
  db.prepare("INSERT INTO issue_lifecycle (ts, issue_id, event) VALUES (?, 1, 'dispositioned')").run(iso(60));
  db.exec("INSERT INTO tool_error_exclusions (pattern, err_class, rationale) VALUES ('bad input', 'caller', 'caller-input errors are not tool defects')");
  db.prepare("INSERT INTO tracker_sync_state VALUES ('last_run', '{}', ?)").run(iso(10));
  db.prepare("INSERT INTO gh_issue_links (issue_id, gh_number, d1_status, synced_at) VALUES (1, 101, 'open', ?)").run(iso(10));
}

function fresh(applyMigration = true) {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  seedGood(db);
  if (applyMigration) db.exec(sql);
  return db;
}

// the probes read date('now') for the one stated expiry (2026-11-19): pin the date so the suite does not turn red on that day
function runProbe(db, control, today = TODAY) {
  const row = db.prepare("SELECT probe_sql FROM control_alternate_probes WHERE control = ?").get(control);
  if (!row) return { missing: true };
  const probe = row.probe_sql.split("date('now')").join("date('" + today + "')");
  const before = db.prepare("SELECT total_changes() AS n").get().n;
  const rows = db.prepare(probe).all();
  const after = db.prepare("SELECT total_changes() AS n").get().n;
  const v = chaosJudge(rows);
  v.readOnly = before === after;
  v.cols = rows[0] ? Object.keys(rows[0]).join(",") : "";
  v.rows = rows.length;
  return v;
}

// ---- 1. the table, the seeds ----
const db0 = fresh();
const cols = db0.prepare("PRAGMA table_info(control_alternate_probes)").all().map((c) => c.name);
ok(JSON.stringify(cols) === JSON.stringify(["control", "probe_sql", "window_note", "enabled", "last_run_at", "last_pass", "last_pass_at", "last_observed", "created_at"]), "control_alternate_probes has the columns of the brief (control PK, probe_sql, window_note, enabled, last_run_at, last_pass, last_pass_at, last_observed)", cols);
ok(db0.prepare("PRAGMA table_info(control_alternate_probes)").all().find((c) => c.name === "control").pk === 1, "control is the primary key");
const seeded = db0.prepare("SELECT control, probe_sql, window_note, enabled FROM control_alternate_probes ORDER BY rowid").all();
const CRITICAL = ["agent-issues-enum-guard", "agent-issues-evidence-guard", "idea-triaged-hold-owner-and-reentry", "research-citation-unverified-hold", "research-gate-structure", "research-review-hard-gate", "zenodo-enabled"];
ok(seeded.length === 23, "23 probes are seeded (7 critical, 15 other exercisable controls, the probe set's own control)", seeded.length);
ok(JSON.stringify(seeded.slice(0, 7).map((r) => r.control)) === JSON.stringify(CRITICAL), "the 7 critical controls come first", seeded.slice(0, 7).map((r) => r.control));
const names = new Set(CONTROLS.map((c) => c[0]));
ok(seeded.filter((r) => r.control !== "control-alternate-probes").every((r) => names.has(r.control)), "every seeded probe names a control_registry control");
ok(!seeded.some((r) => ["research-owner-hold", "command-drain-key", "outreach-consent-gate"].includes(r.control)), "the three not-exercisable controls have no probe (no stamp from a declaration)");
ok(seeded.every((r) => r.enabled === 1 && r.window_note.length > 20), "every probe is enabled and says how far back its evidence may be");
const WRITE = /\b(insert|update|delete|drop|alter|create|replace|attach|pragma|vacuum|reindex)\b/i;
for (const r of seeded) {
  ok(/^SELECT 'ok' AS expected, /.test(r.probe_sql) && /AS observed$/.test(r.probe_sql), r.control + ": probe is the expected/observed shape");
  ok(!WRITE.test(r.probe_sql) && !r.probe_sql.includes(";"), r.control + ": probe is a single read-only SELECT (no write keyword, no semicolon)", r.probe_sql.match(WRITE));
}
const lastRun = db0.prepare("SELECT COUNT(*) AS n FROM control_alternate_probes WHERE last_run_at IS NOT NULL OR last_pass IS NOT NULL OR last_pass_at IS NOT NULL").get().n;
ok(lastRun === 0, "nothing is stamped as run by the migration (the runner writes last_run_at)");
ok(db0.prepare("SELECT COUNT(*) AS n FROM control_registry WHERE alternate_tested_at IS NOT NULL").get().n === 2, "the migration stamps no alternate_tested_at (only the two hand-stamped fixture rows have one)");

// ---- 2. every probe passes where the alternate is in place, read-only, judged by the real chaosJudge ----
for (const r of seeded) {
  const v = runProbe(db0, r.control);
  ok(v.pass === true && v.observed === "ok", r.control + ": passes on a fixture where its alternate is in place", v);
  ok(v.readOnly === true && v.rows === 1 && v.cols === "expected,observed", r.control + ": one row (expected, observed), no change to the database", v);
}

// ---- 3. a failing fixture per control: the broken alternate is reported with a reason ----
const trig = (n) => "DROP TRIGGER " + n + ";";
const BREAKS = {
  "agent-issues-enum-guard": [
    ["the normalise trigger is gone", trig("agent_issues_normalise_tick"), /normalise tick trigger/],
    ["the canon tables are empty", "DELETE FROM status_canon;", /canon/],
    ["a row keeps an unmapped status for 2 h", `INSERT INTO agent_issues (title, status, priority, created_at, updated_at) VALUES ('t-weird', 'weird', 'medium', ${ms(120)}, ${ms(120)});`, /did not normalise/],
    ["a row keeps an unmapped priority for 2 h", `INSERT INTO agent_issues (title, status, priority, created_at, updated_at) VALUES ('t-prio', 'open', 'P9', ${ms(120)}, ${ms(120)});`, /did not normalise/],
    ["a monitoring row with no open twin is not the parked-twin state", `INSERT INTO agent_issues (title, status, priority, created_at, updated_at) VALUES ('t-mon', 'monitoring', 'medium', ${ms(120)}, ${ms(120)});`, /did not normalise/]
  ],
  "agent-issues-evidence-guard": [
    ["the annotate trigger is gone", trig("agent_issues_evidence_annotate_ai"), /annotate trigger/],
    ["the abort trigger is back", "CREATE TRIGGER agent_issues_evidence_must_exist_ins BEFORE INSERT ON agent_issues BEGIN SELECT 1; END;", /abort trigger/],
    ["an issue cites a missing event and was left unannotated", trig("agent_issues_evidence_annotate_ai") + ` INSERT INTO agent_issues (title, source, description, created_at, updated_at) VALUES ('t-ev', 'cloud_ops_events:nope', 'plain', ${ms(60)}, ${ms(60)}); CREATE TRIGGER agent_issues_evidence_annotate_ai AFTER INSERT ON agent_issues BEGIN SELECT 'NO-SILENT'; END;`, /no annotation/]
  ],
  "idea-triaged-hold-owner-and-reentry": [
    ["an owner-authored idea is held", `INSERT INTO idea_proposals (name, idea, contact, status, rationale, created_at) VALUES ('owner-chat', 'x', 'owner', 'triaged_hold', 'LLM HOLD', '${iso(60)}');`, /owner-authored idea/],
    ["re-entry signals stopped flowing", "DELETE FROM signals;", /re-entry/]
  ],
  "research-citation-unverified-hold": [
    ["the 6 h expiry trigger is gone", trig("research_hold_expiry_tick"), /hold-expiry trigger/],
    ["the citation gate lever holds a stray value", "INSERT INTO ops_config (key, value) VALUES ('research_citation_gate', 'off');", /research_citation_gate/],
    ["a hold passed 8 h without release", `INSERT INTO research_queue (id, status, error) VALUES ('h1', 'held', 'x Revert: status review, stage publish'); INSERT INTO research_hold_seen VALUES ('h1', '${iso(9 * 60)}');`, /passed 8 h/]
  ],
  "research-gate-structure": [["no revise-patch event in 7 days", "DELETE FROM cloud_ops_events WHERE kind = 'revise-patch';", /revise route/]],
  "research-review-hard-gate": [
    ["the lever is unreadable", "UPDATE ops_config SET value = 'banana' WHERE key = 'research_review_gate';", /research_review_gate/],
    ["no review triage in 48 h", "DELETE FROM cloud_ops_events WHERE kind = 'review-triage';", /review-triage/]
  ],
  "zenodo-enabled": [
    ["a Zenodo switch is on again", "INSERT INTO ops_config (key, value) VALUES ('zenodo_enabled', '1');", /Zenodo switch/],
    ["nothing published in 48 h", "DELETE FROM research_queue;", /no paper/],
    ["a published paper carries a Zenodo DOI", "UPDATE research_queue SET doi = '10.5281/zenodo.1';", /Zenodo DOI/]
  ],
  "social-weekly-caps": [
    ["two posts on one channel an hour apart", `INSERT INTO social_media_posts (id, platform, published_at) VALUES ('p9', 'buffer-x', '${iso(60 * 9)}');`, /under 6 h/],
    ["the caps flag is not JSON", "UPDATE pipeline_flags SET value = 'not json';", /not JSON/]
  ],
  "cf-obs-nested-too-deep-pin": [["the detector reads fail", "UPDATE remediation_contracts SET last_verdict = 'fail' WHERE class = 'fm-trigger-depth-compile';", /does not read pass/], ["the detector is retired", "UPDATE remediation_contracts SET status = 'retired' WHERE class = 'fm-trigger-depth-compile';", /not active/]],
  "compat-advance-review-gate": [["no deploy in 24 h", "DELETE FROM deployment_history;", /no successful deploy/], ["no compat-verify in 7 days", "DELETE FROM cloud_ops_events WHERE kind = 'compat-verify';", /compat-verify/]],
  "gh_app_primary": [["the switch is unreadable", "UPDATE ops_config SET value = 'maybe' WHERE key = 'gh_app_primary';", /kill switch/], ["no github event in 24 h", "DELETE FROM cloud_ops_events WHERE kind = 'github';", /no ok github event/]],
  "improvement-loop-superseded-marker": [["a successor trigger is disabled", "UPDATE analytics_metric_triggers SET enabled = 0 WHERE metric_key = 'issues_open_over_120m';", /no enabled trigger/], ["a successor metric is gone", "DELETE FROM metric_registry WHERE metric = 'open_issues_without_doer_120m';", /not in metric_registry/]],
  "migration-header-guard": [["the detector is retired", "UPDATE remediation_contracts SET status = 'retired' WHERE class = 'fm-migration-headerless-silent-skip';", /detector contract/], ["no migration applied in 7 days", "DELETE FROM migration_runs;", /no migration run/], ["the unapplied sweep metric is stale", `UPDATE metric_registry SET last_refreshed = '${iso(5 * 60)}' WHERE metric = 'migrations_unapplied';`, /not refreshed/]],
  "migration-headerless-allowlist": [["no migration applied in 7 days", "DELETE FROM migration_runs;", /no migration run/]],
  "ops-jobs-payload-redaction": [["a stored payload holds a login link", "INSERT INTO ops_jobs (id, status, payload, updated_at) VALUES ('j2', 'queued', 'sign in at https://x.example/login?token=abc', '" + iso(5) + "');", /login link/], ["a terminal row outlived the 14-day sweep", "INSERT INTO ops_jobs (id, status, payload, updated_at) VALUES ('j3', 'cancelled', 'old', '" + iso(60 * 24 * 20) + "');", /sweep is not running/]],
  "ops-jobs-terminal-sweep": [["the queue_sla row is gone", "DELETE FROM queue_sla;", /queue_sla row/], ["the detector reads fail", "UPDATE remediation_contracts SET last_verdict = 'fail' WHERE class = 'fm-ops-jobs-sweep-status-gap';", /does not read pass/]],
  "owner-request-receipt-gate": [["the lever is unreadable", "UPDATE ops_config SET value = 'x' WHERE key = 'autonomy_first_gate';", /off lever/]],
  "owner-request-requires-card": [["the card trigger is gone", trig("owner_request_requires_card"), /trigger is missing/], ["no closure recorded in 7 days", "DELETE FROM issue_lifecycle;", /no closure/], ["an owner-request closed without evidence", `INSERT INTO agent_issues (title, category, status, created_at, updated_at) VALUES ('t-or', 'owner-request', 'closed', ${ms(60)}, ${ms(60)});`, /no close_evidence/]],
  "perf-loop-enabled": [["the loop is paused again", "UPDATE ops_config SET value = '0' WHERE key = 'perf_loop_enabled';", /paused again/], ["the pin is gone", "DELETE FROM ops_config WHERE key = 'perf_pin:q08-cadence';", /pin or the cap/]],
  "research-admission-cap": [["a cap-held row was rejected", "UPDATE idea_proposals SET status = 'rejected' WHERE rationale LIKE '[research admission cap%';", /left the hold/], ["triage stopped", "UPDATE idea_proposals SET triaged_at = NULL;", /triage recorded nothing/]],
  "tool_error_exclusions": [["the excluded view is gone", "DROP VIEW tool_failures_excluded_24h;", /excluded errors/], ["failure_class is gone", "DROP VIEW tool_failures_24h; CREATE VIEW tool_failures_24h AS SELECT pattern AS tool FROM tool_error_exclusions;", /failure_class/], ["a pattern has no rationale", "INSERT INTO tool_error_exclusions (pattern, err_class, rationale) VALUES ('x', 'y', '  ');", /no rationale/]],
  "tracker-mass-flip-guard": [["the sync stopped", `UPDATE tracker_sync_state SET updated_at = '${iso(5 * 60)}';`, /no run in 2 h/], ["d1_status is never refreshed", `UPDATE gh_issue_links SET synced_at = '${iso(60 * 48)}';`, /d1_status/]],
  "control-alternate-probes": [
    ["the detector contract is retired", "UPDATE remediation_contracts SET status = 'retired' WHERE class = 'fm-control-alternate-undrilled';", /detector contract/],
    ["a control with an alternate has neither a probe nor a tested date", "INSERT INTO control_registry (control, location, kind, disposition, alternate_path, evidence) VALUES ('new-control', 'l', 'gate', 'keep', 'a second path', 'e');", /no probe and no tested date/]
  ]
};
ok(JSON.stringify(Object.keys(BREAKS).sort()) === JSON.stringify(seeded.map((r) => r.control).sort()), "a failing fixture is defined for every seeded control", { missing: seeded.map((r) => r.control).filter((c) => !BREAKS[c]) });
for (const [control, cases] of Object.entries(BREAKS)) {
  for (const [what, brk, re] of cases) {
    const db = fresh();
    db.exec(brk);
    const v = runProbe(db, control);
    ok(v.pass === false && v.expected === "ok" && v.observed !== "ok" && re.test(v.observed), control + ": fails when " + what, v);
    ok(v.readOnly === true, control + ": the failing run still changed nothing (" + what + ")");
  }
}
{ // the allowlist's stated expiry is a failure of its own once the date passes
  const db = fresh();
  const v = runProbe(db, "migration-headerless-allowlist", "2026-11-20");
  ok(v.pass === false && /stated expiry 2026-11-19/.test(v.observed), "migration-headerless-allowlist: fails after its recorded expiry date", v);
  ok(runProbe(db, "migration-headerless-allowlist", "2026-11-19").pass === true, "migration-headerless-allowlist: still passes on the expiry day itself");
}

// ---- 4. the exemptions and the live guards in action ----
{
  const db = fresh();
  // the parked-twin state: a monitoring row whose open twin exists is exempt; a fresh unmapped row is inside the 30-minute grace
  db.exec(`INSERT INTO agent_issues (title, status, priority, created_at, updated_at) VALUES ('Twin', 'open', 'medium', ${ms(300)}, ${ms(300)}), ('twin', 'monitoring', 'medium', ${ms(300)}, ${ms(300)}), ('t-new', 'weird', 'medium', ${ms(5)}, ${ms(5)});`);
  const v = runProbe(db, "agent-issues-enum-guard");
  ok(v.pass === true, "enum guard: a monitoring row with an open twin and a row unmapped for 5 minutes are not failures", v);
  // the live normalise trigger text, fired by a fleet_tick row, repairs the stale unmapped row and the probe passes
  db.exec(`INSERT INTO agent_issues (title, status, priority, created_at, updated_at) VALUES ('t-stale', 'weird', 'medium', ${ms(120)}, ${ms(120)});`);
  ok(runProbe(db, "agent-issues-enum-guard").pass === false, "enum guard: the stale unmapped row fails the probe before the tick");
  db.exec("INSERT INTO fleet_tick (source) VALUES ('cron:test')");
  const fixed = db.prepare("SELECT status, description FROM agent_issues WHERE title = 't-stale'").get();
  ok(fixed.status === "open" && /NO-SILENT-DROP-1: unmapped status/.test(fixed.description), "enum guard: the live normalise trigger text rewrites the unmapped status and annotates the row", fixed);
  ok(runProbe(db, "agent-issues-enum-guard").pass === true, "enum guard: the probe passes once the tick normalised the row");
}
{
  const db = fresh();
  db.exec(`INSERT INTO agent_issues (title, source, description, created_at, updated_at) VALUES ('t-ev', 'cloud_ops_events:missing', 'plain', ${ms(60)}, ${ms(60)});`);
  const row = db.prepare("SELECT description FROM agent_issues WHERE title = 't-ev'").get();
  ok(/NO-SILENT-DROP-1: the cited evidence event cloud_ops_events:missing does not exist/.test(row.description), "evidence guard: the live annotate trigger text keeps and annotates an issue that cites a missing event", row);
  ok(runProbe(db, "agent-issues-evidence-guard").pass === true, "evidence guard: the annotated issue keeps the probe green");
  db.exec("INSERT INTO cloud_ops_events (id, ts, kind, status) VALUES ('present', '" + iso(1) + "', 'x', 'ok'); INSERT INTO agent_issues (title, source, description, created_at, updated_at) VALUES ('t-ev2', 'cloud_ops_events:present', 'plain', " + ms(60) + ", " + ms(60) + ");");
  ok(db.prepare("SELECT description FROM agent_issues WHERE title = 't-ev2'").get().description === "plain", "evidence guard: an issue that cites an existing event is untouched");
}
{
  const db = fresh();
  db.exec("INSERT INTO research_queue (id, status, error) VALUES ('h2', 'held', 'x Revert: status review, stage publish'); INSERT INTO research_hold_seen VALUES ('h2', '" + iso(7 * 60) + "');");
  ok(runProbe(db, "research-citation-unverified-hold").pass === true, "citation hold: a hold 7 h old is inside the 8 h allowance");
  db.exec("INSERT INTO fleet_tick (source) VALUES ('cron:test')");
  const h = db.prepare("SELECT status, stage FROM research_queue WHERE id = 'h2'").get();
  ok(h.status === "review" && h.stage === "publish", "citation hold: the live expiry trigger text releases a hold past 6 h", h);
}

// ---- 5. the views: the critical-path count comes from the table ----
{
  const db = fresh();
  const state = (c) => db.prepare("SELECT drill_state FROM v_control_alternate_status WHERE control = ?").get(c).drill_state;
  const counts = () => db.prepare("SELECT * FROM v_control_alternate_untested").get();
  ok(state("agent-issues-enum-guard") === "probe-never-run", "status: a seeded control whose probe never ran reads probe-never-run");
  ok(state("research-owner-hold") === "removed" && state("command-drain-key") === "removed", "status: a removed control reads removed");
  ok(state("outreach-consent-gate") === "not-exercisable", "status: a none-needed control with the recorded reason reads not-exercisable");
  ok(state("canary-functional") === "no-probe", "status: a hand-stamped control without a probe reads no-probe");
  ok(state("bare-control") === "no-alternate", "status: no alternate declared reads no-alternate");
  const scorecard = db.prepare("SELECT COUNT(*) AS n FROM control_registry WHERE critical_path = 1 AND NOT (disposition = 'remove' AND disposition_state = 'applied') AND alternate_tested_at IS NULL").get().n;
  let c = counts();
  ok(c.critical_untested_by_register === scorecard && scorecard === 7, "untested view: critical_untested_by_register equals the v_doctrine_scorecard_v2 expression (7 critical controls untested)", { c, scorecard });
  ok(c.critical_probe_not_drilled === 7 && c.critical_without_probe === 2 && c.critical_untested_by_probe === 9, "untested view: before any drill 7 critical probes are not drilled and 2 hand-stamped critical controls have no probe", c);
  ok(c.controls_untested_without_probe === 0 && c.controls_hand_stamped_without_probe === 2 && c.probes_total === 23 && c.probes_enabled === 23 && c.probes_failing === 0, "untested view: no control is untested without a probe, 2 are hand-stamped without one", c);
  // what the runner will write: a pass, a stale pass, a failure, a disabled row
  const run = db.prepare("UPDATE control_alternate_probes SET last_run_at = ?1, last_pass = ?2, last_pass_at = ?3, last_observed = ?4, enabled = ?5 WHERE control = ?6");
  for (const k of CRITICAL.slice(0, 4)) run.run(iso(5), 1, iso(5), "ok", 1, k);
  c = counts();
  ok(c.critical_probe_not_drilled === 3 && c.critical_untested_by_probe === 5, "untested view: four passing probes leave three critical probes undrilled", c);
  ok(state("research-gate-structure") === "probe-never-run" && state("agent-issues-enum-guard") === "drilled", "status: a fresh pass reads drilled");
  run.run(iso(5), 1, iso(30 * 60), "ok", 1, "research-gate-structure");
  ok(state("research-gate-structure") === "probe-stale", "status: a pass older than 24 h reads probe-stale");
  run.run(iso(5), 1, iso(7 * 60), "ok", 1, "research-gate-structure");
  ok(state("research-gate-structure") === "drilled", "status: a pass 7 h old (inside the 6 h cadence plus 120 minutes) still reads drilled");
  run.run(iso(5), 1, iso(9 * 60), "ok", 1, "research-gate-structure");
  ok(state("research-gate-structure") === "probe-stale", "status: a pass 9 h old (past the cadence plus 120 minutes) reads probe-stale");
  run.run(iso(5), 1, iso(30 * 60), "ok", 1, "research-gate-structure");
  run.run(iso(5), 0, iso(30 * 60), "the revise route recorded no revise-patch event", 1, "research-review-hard-gate");
  ok(state("research-review-hard-gate") === "probe-failing" && counts().probes_failing === 1, "status: a failing probe reads probe-failing and is counted");
  run.run(iso(5), 1, iso(5), "ok", 0, "zenodo-enabled");
  ok(state("zenodo-enabled") === "probe-disabled", "status: a disabled probe reads probe-disabled");
  for (const k of CRITICAL) run.run(iso(5), 1, iso(5), "ok", 1, k);
  c = counts();
  ok(c.critical_probe_not_drilled === 0 && c.critical_untested_by_probe === c.critical_without_probe && c.critical_without_probe === 2, "untested view: with every critical probe passing only the two critical controls without a probe remain", c);
}

// ---- 6. v_path_coverage_gaps / violations ----
{
  const db = fresh(false);
  const OLD = `CREATE VIEW v_path_coverage_gaps AS SELECT 'control_registry' AS source, control AS process, kind AS path_kind, CASE WHEN alternate_path IS NULL OR trim(alternate_path) = '' THEN 'no-alternate' WHEN alternate_tested_at IS NULL THEN 'alternate-untested' ELSE 'ok' END AS path_state, alternate_path AS alternate, alternate_tested_at FROM control_registry UNION ALL SELECT 'process_contracts' AS source, process, 'contract-paths' AS path_kind, CASE WHEN json_valid(paths_json) = 0 THEN 'paths-not-json' WHEN json_array_length(paths_json) < 2 THEN 'single-path' WHEN json_array_length(paths_json) = 2 THEN 'two-paths-no-spare' ELSE 'ok' END AS path_state, NULL AS alternate, NULL AS alternate_tested_at FROM process_contracts;
CREATE VIEW v_path_coverage_violations AS SELECT source, process, path_kind, path_state, alternate, alternate_tested_at FROM v_path_coverage_gaps WHERE path_state <> 'ok';`;
  db.exec(OLD);
  const st = (d, p) => d.prepare("SELECT path_state FROM v_path_coverage_gaps WHERE process = ?").get(p).path_state;
  ok(st(db, "outreach-consent-gate") === "alternate-untested", "pre-fix: a recorded ALTERNATE-NOT-EXERCISABLE row still reads alternate-untested (the defect)");
  const before = db.prepare("SELECT COUNT(*) AS n FROM v_path_coverage_violations WHERE path_state = 'alternate-untested'").get().n;
  db.exec(sql);
  const after = db.prepare("SELECT COUNT(*) AS n FROM v_path_coverage_violations WHERE path_state = 'alternate-untested'").get().n;
  ok(st(db, "outreach-consent-gate") === "alternate-not-exercisable" && st(db, "command-drain-key") === "alternate-not-exercisable" && st(db, "research-owner-hold") === "alternate-not-exercisable", "the three recorded not-exercisable rows read alternate-not-exercisable");
  ok(before - after === 2, "alternate-untested falls by those three rows and gains the probe set's own control (not yet stamped): net 2", { before, after });
  ok(db.prepare("SELECT COUNT(*) AS n FROM v_path_coverage_violations WHERE path_state = 'alternate-untested' AND process = 'control-alternate-probes'").get().n === 1, "the probe set's own control reads alternate-untested until the drill stamps it (not stamped from a declaration)");
  ok(st(db, "ops-jobs-terminal-sweep") === "alternate-untested" && st(db, "migration-headerless-allowlist") === "alternate-untested", "a none-needed row WITHOUT the recorded reason stays alternate-untested (it has a probe instead)");
  ok(st(db, "canary-functional") === "ok" && st(db, "bare-control") === "no-alternate", "tested rows stay ok and an empty alternate stays no-alternate");
  ok(st(db, "p-ok") === "ok" && st(db, "p-single") === "single-path" && st(db, "p-two") === "two-paths-no-spare" && st(db, "p-bad") === "paths-not-json", "the process_contracts branch is unchanged");
  const viol = db.prepare("SELECT path_state, COUNT(*) AS n FROM v_path_coverage_violations GROUP BY path_state ORDER BY path_state").all();
  ok(!viol.some((r) => r.path_state === "alternate-not-exercisable"), "v_path_coverage_violations lists no alternate-not-exercisable row", viol);
  ok(db.prepare("SELECT alternate_tested_at FROM v_path_coverage_gaps WHERE process = 'outreach-consent-gate'").get().alternate_tested_at === null, "the not-exercisable row is not stamped (alternate_tested_at stays NULL)");
  // a later stamp (the runner on a pass) turns an untested row ok
  db.exec("UPDATE control_registry SET alternate_tested_at = '2026-10-19T14:00:00Z' WHERE control = 'social-weekly-caps'");
  ok(st(db, "social-weekly-caps") === "ok", "a stamped row reads ok");
}

// ---- 7. failure mode, detector, control row, evidence, decision, issue ----
{
  const db = fresh();
  const fm = db.prepare("SELECT * FROM failure_modes WHERE fm_key = 'control-alternate-undrilled'").get();
  ok(fm && fm.probe_class === "fm-control-alternate-undrilled" && fm.issue_id === 2826 && [fm.failure_mode, fm.root_cause, fm.remediation, fm.detector, fm.trigger_condition, fm.symptom, fm.blast_radius].every((s) => s && s.length > 30), "failure mode control-alternate-undrilled is recorded with root cause, remediation, detector and blast radius", fm);
  const rc = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-control-alternate-undrilled'").get();
  ok(rc && rc.verify_transport === "d1-query" && rc.status === "active" && rc.module === "failure-mode", "the fm- detector contract is an active d1-query contract", rc);
  const det = (d) => chaosJudge(d.prepare(rc.verify_probe).all());
  ok(det(db).pass === true && det(db).observed === "0", "the detector reads 0 at birth: every control with an alternate and no tested date has a probe or a recorded reason", det(db));
  db.exec("INSERT INTO control_registry (control, location, kind, disposition, alternate_path, evidence) VALUES ('new-control', 'l', 'gate', 'keep', 'a second path', 'e')");
  ok(det(db).pass === false && det(db).observed === "1", "the detector FAILS for a new control with an alternate, no tested date and no probe", det(db));
  db.exec("INSERT INTO control_alternate_probes (control, probe_sql, window_note) VALUES ('new-control', 'SELECT ''ok'' AS expected, ''ok'' AS observed', 'test')");
  ok(det(db).pass === true, "the detector passes again once the control has a probe row");
  db.exec("INSERT INTO control_registry (control, location, kind, disposition, alternate_path, alternate_tested_at, evidence) VALUES ('stamped-control', 'l', 'gate', 'keep', 'a second path', '2026-10-01', 'e')");
  ok(det(db).pass === true, "a hand-stamped control without a probe is reported by v_control_alternate_untested, not by the detector");

  const self = db.prepare("SELECT * FROM control_registry WHERE control = 'control-alternate-probes'").get();
  ok(self && self.kind === "guard" && self.alternate_tested_at === null && self.disposition === "keep" && self.alternate_path.length > 40 && self.evidence.includes("CONTROL-ALT-PROBES-1"), "the probe set is a control_registry row with its own alternate, not stamped", self);
  const withEv = db.prepare("SELECT control, evidence, alternate_tested_at FROM control_registry WHERE evidence LIKE '%CONTROL-ALT-PROBES-1 2026-10-19%' AND control <> 'control-alternate-probes'").all();
  ok(withEv.length === 22 && withEv.every((r) => (r.evidence.match(/CONTROL-ALT-PROBES-1 2026-10-19/g) || []).length === 1), "the 22 drilled controls carry the evidence note exactly once", withEv.length);
  ok(db.prepare("SELECT alternate_tested_at FROM control_registry WHERE control = 'canary-functional'").get().alternate_tested_at === "2026-10-12T08:30:00Z" && !db.prepare("SELECT evidence FROM control_registry WHERE control = 'canary-functional'").get().evidence.includes("CONTROL-ALT-PROBES-1"), "a control without a probe keeps its stamp and gets no note");

  const dl = db.prepare("SELECT * FROM decision_log").all();
  ok(dl.length === 1 && dl[0].actor.startsWith("session_") && [dl[0].assumption, dl[0].action, dl[0].evidence, dl[0].outcome, dl[0].blast_radius, dl[0].rollback_path, dl[0].capability_gain, dl[0].predicted_outcome, dl[0].surfaces_tested].every((s) => s && s.length > 5), "one decision_log row with capability_gain, predicted_outcome and surfaces_tested", dl.length);

  const iss = db.prepare("SELECT * FROM agent_issues WHERE title LIKE 'CONTROL-ALT-PROBES-RUNNER-1:%'").all();
  ok(iss.length === 1 && iss[0].status === "open" && iss[0].priority === "high", "exactly one open runner issue is filed", iss.length);
  const lines = iss[0].description.split("\n");
  const taskLine = lines.find((l) => l.startsWith("code-task: "));
  const anchorLine = lines.find((l) => l.startsWith("code-anchor: "));
  const probeLine = lines.find((l) => l.startsWith("code-probe: "));
  ok(taskLine === "code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js", "the issue carries the code-task line on a line of its own (ACT-BRIDGE-1)", taskLine);
  const anchor = anchorLine && anchorLine.slice("code-anchor: ".length);
  const cp = probeLine && JSON.parse(probeLine.slice("code-probe: ".length));
  ok(cp && Array.isArray(cp.paths) && cp.paths[0] === "qnfo-fleet-control/worker.js" && typeof cp.contains === "string" && cp.contains.includes("control_alternate_probes"), "the code-probe line is valid JSON naming the file and the text the runner must contain", cp);
  const landed = cp && workerSrc.includes(cp.contains);
  const occ = anchor ? workerSrc.split(anchor).length - 1 : 0;
  ok(landed || occ === 1, "the code-anchor occurs exactly once in qnfo-fleet-control/worker.js (or the runner has landed)", { occ, landed });
  ok(landed || !workerSrc.includes("control_alternate_probes"), "until the runner lands the worker does not read the table (so the code-probe is a real pending check)");
  const ct = db.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get("issue-" + iss[0].id);
  ok(ct && ct.verify_transport === "code-read" && ct.status === "active" && JSON.parse(ct.verify_probe).contains === cp.contains && ct.module === "code-probe-line-v1", "the issue's contract is the code-read probe on main (UPDATE on class issue-<id>)", ct);
  ok(/spof_alternate_probes/.test(iss[0].description) && /chaosJudge/.test(iss[0].description) && /control:<name>/.test(iss[0].description) && /alternate_tested_at/.test(iss[0].description), "the issue names the exact change: second pass, chaosJudge, control:<name> verdicts, the stamp");
}

// ---- 8. re-applying changes nothing ----
{
  const db = fresh();
  const snap = () => JSON.stringify([
    db.prepare("SELECT COUNT(*) AS n FROM control_alternate_probes").get().n,
    db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n,
    db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts").get().n,
    db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n,
    db.prepare("SELECT COUNT(*) AS n FROM agent_issues").get().n,
    db.prepare("SELECT COUNT(*) AS n FROM control_registry").get().n,
    db.prepare("SELECT group_concat(evidence, '|') AS e FROM control_registry").get().e
  ]);
  const s1 = snap();
  let threw = null;
  try { db.exec(sql); } catch (e) { threw = String(e && e.message || e); }
  ok(threw === null && snap() === s1, "applying the migration a second time changes nothing", threw);
}

// ---- 9. house rules on the text we wrote ----
{
  const test = readFileSync(fileURLToPath(import.meta.url), "utf8");
  for (const [name, text] of [["migration", sql], ["test", test]]) {
    ok(!new RegExp("claude" + "\\.ai", "i").test(text), name + ": no link to the assistant vendor host");
    ok(!/(^|[^\w&])#\d+/m.test(text), name + ": no bare hash-number issue reference");
    ok(!/\[skip ci\]|\[ci skip\]/i.test(text), name + ": no skip-CI token");
  }
  ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+/m.test(sql) && /^-- BACKUP: control_registry$/m.test(sql), "migration header lines: APPLY-BY ci, DB qnfo-audit, Rollback, BACKUP");
  ok(!/^\s*(DELETE\s+FROM|DROP\s+TABLE)\b/im.test(sql.replace(/^--.*$/gm, "")), "the file deletes no rows and drops no table (only views are redefined)");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
