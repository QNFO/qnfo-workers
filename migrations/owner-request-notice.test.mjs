// OWNER-QUEUE-VERSIONED-1 offline suite for migrations/2026-10-19-owner-queue-triggers-versioned.sql (agent_issues 2783, 2865, 2900, 2933,
// 99956, 100023 = QNFO/qnfo-workers#1696-1712, #1732, #1880, #1927, #2402, #2585). The closure trigger owner_request_requires_card, the
// reroute queue, the QUEUE-BREAK-CYCLE-1 form of human_actions_autonomy_first_ai and the fleet task autonomy-reroute-drain live only in D1;
// a database rebuilt from migrations/ gets the cyclic 2026-10-08 trigger form (agent_issues 99919) and none of the rest. The file versions the
// live text and changes nothing on production. It builds on OWNER-NOTICE-GATE-1 (migrations/2026-10-19-owner-notice-gate.sql): the closure
// notices stay OPEN for the owner and grade 'notice'; this suite pins that the file neither closes nor re-grades them (the owner keeps the
// review, and an attempt to post them pre-resolved was refused). The fixture is the live qnfo-audit DDL of every object the file touches
// (sqlite_master read 2026-10-19), with v_human_action_gate as OWNER-NOTICE-GATE-1 left it.
// Second review (2026-10-19): the file also versions the fleet_crons row that runs the drain task (a rebuilt database got a drain task that never
// fired), puts the reroute queue under QUEUE-SLA-1 (queue_sla row + a v_stuck_summary_kernel column, view text replayed from the live read), and
// restricts the detector to gate 'fleet' so an open IDENTITY-BOUND notice (gate 'owner') does not fail it.
// Run: node migrations/owner-request-notice.test.mjs
// To see the suite fail on the base, point it at a migration that does nothing:
//   : > /tmp/empty.sql; OWNER_REQUEST_NOTICE_MIGRATION=/tmp/empty.sql node migrations/owner-request-notice.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = process.env.OWNER_REQUEST_NOTICE_MIGRATION || join(here, "2026-10-19-owner-queue-triggers-versioned.sql");
let pass = 0, fail = 0;
const collapse = (s) => String(s || "").replace(/\s+/g, " ").trim();
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const section = (f) => { try { f(); } catch (e) { fail++; console.log("FAIL section threw :: " + String(e && e.message || e).slice(0, 200)); } };

// The first view is the one migrations/2026-10-08-autonomy-first.sql created, the second the one OWNER-NOTICE-GATE-1 replaced it with (live).
const autonomyFirst = readFileSync(join(here, "2026-10-08-autonomy-first.sql"), "utf8");
const OLD_VIEW = "CREATE VIEW " + autonomyFirst.match(/CREATE VIEW IF NOT EXISTS (v_human_action_gate AS[\s\S]*?);\n\n-- Backfill/)[1];
const noticeGate = readFileSync(join(here, "2026-10-19-owner-notice-gate.sql"), "utf8");
const NOTICE_VIEW = noticeGate.match(/CREATE VIEW v_human_action_gate AS[\s\S]*?;\n\n-- Refresh/)[0].replace(/;\n\n-- Refresh$/, "");

const SCHEMA = String.raw`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, event TEXT NOT NULL, from_status TEXT, to_status TEXT, has_evidence INTEGER, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT DEFAULT 'normal', due TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, resolution TEXT);
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 30000, retries INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
-- the autonomy queue exactly as live on 2026-10-19 (QUEUE-BREAK-CYCLE-1, created in D1 outside the repo)
CREATE TABLE autonomy_reroute_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, human_action_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT, priority TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), drained_at TEXT, issue_id INTEGER);
-- fleet_crons and queue_sla exactly as live (sqlite_master read 2026-10-19)
CREATE TABLE fleet_crons (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, cron_expr TEXT NOT NULL, task_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, timezone TEXT NOT NULL DEFAULT 'UTC', last_fired TEXT, next_fire TEXT, updated_at TEXT);
CREATE TABLE queue_sla (stuck_type TEXT PRIMARY KEY, queue TEXT NOT NULL, definition TEXT NOT NULL, cycle_min INTEGER NOT NULL, sla_min INTEGER NOT NULL, auto_fix TEXT NOT NULL, owner TEXT NOT NULL, summary_column TEXT NOT NULL, producer_cycle_min INTEGER);
-- the kernel view reads these three
CREATE TABLE decision_predictions (id INTEGER PRIMARY KEY AUTOINCREMENT, scored_at TEXT, due_at TEXT);
CREATE TABLE doctrine_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT, ts TEXT);
CREATE TABLE tick_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, tick_id INTEGER, ok INTEGER);
`;
// v_stuck_summary_kernel exactly as live on 2026-10-19 (sqlite_master read; the same text migrations/2026-10-14-sla-120m.sql creates)
const LIVE_KERNEL = `CREATE VIEW v_stuck_summary_kernel AS
SELECT
  (SELECT COUNT(*) FROM decision_predictions WHERE scored_at IS NULL AND due_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS predictions_unscored_over_sla,
  (SELECT COUNT(*) FROM doctrine_proposals WHERE status = 'proposed' AND ts < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS doctrine_proposals_waiting,
  (SELECT COUNT(*) FROM tick_runs WHERE ok = 0 AND tick_id = (SELECT MAX(tick_id) FROM tick_runs)) AS tick_steps_missed_last_slot`;
// the live fleet_crons row of the drain task (id 55, read 2026-10-19)
const LIVE_CRON = "INSERT INTO fleet_crons (id, name, cron_expr, task_id, enabled, timezone, last_fired, next_fire, updated_at) VALUES (55, 'autonomy-reroute-drain-10m', '*/10 * * * *', 'autonomy-reroute-drain', 1, 'UTC', '2026-10-19T07:10:42.363Z', '2026-10-19T07:20:00.000Z', '2026-10-19T07:10:42.363Z')";
const LIVE_TRIGGERS = String.raw`
CREATE TRIGGER human_actions_no_claude_ins BEFORE INSERT ON human_actions WHEN COALESCE(NEW.action,'') LIKE '%Claude%' OR COALESCE(NEW.why,'') LIKE '%Claude%' OR COALESCE(NEW.default_in_effect,'') LIKE '%Claude%' OR COALESCE(NEW.title,'') LIKE '%Claude%' OR COALESCE(NEW.url,'') LIKE '%claude.ai%' OR COALESCE(NEW.url,'') LIKE '%anthropic.com%' BEGIN SELECT RAISE(ABORT, 'NO-CLAUDE-RUNTIME-DEPENDENCY-1: an owner queue card never routes work to Claude or links claude.ai/anthropic.com; describe what the owner does on Cloudflare (fleet.qnfo.org) or on the site itself'); END;
CREATE TRIGGER human_actions_no_claude_upd BEFORE UPDATE OF action, why, default_in_effect, title, url ON human_actions WHEN COALESCE(NEW.action,'') LIKE '%Claude%' OR COALESCE(NEW.why,'') LIKE '%Claude%' OR COALESCE(NEW.default_in_effect,'') LIKE '%Claude%' OR COALESCE(NEW.title,'') LIKE '%Claude%' OR COALESCE(NEW.url,'') LIKE '%claude.ai%' OR COALESCE(NEW.url,'') LIKE '%anthropic.com%' BEGIN SELECT RAISE(ABORT, 'NO-CLAUDE-RUNTIME-DEPENDENCY-1: an owner queue card never routes work to Claude or links claude.ai/anthropic.com; describe what the owner does on Cloudflare (fleet.qnfo.org) or on the site itself'); END;
CREATE TRIGGER human_actions_default_adopt_ai AFTER INSERT ON human_actions
WHEN NEW.status='open' AND TRIM(COALESCE(NEW.default_in_effect,''))<>''
  AND COALESCE((SELECT value FROM ops_config WHERE key='default_adopt_gate'),'on')<>'off'
BEGIN
  UPDATE human_actions SET status='resolved', resolved_at=datetime('now'), updated_at=datetime('now'),
    resolution='DEFAULT-ADOPTED-1: closed at birth on its stated default (owner directive 2026-10-12). Reopen with status=open.'
  WHERE id=NEW.id;
  INSERT INTO decision_log(actor,assumption,action,evidence,outcome,blast_radius,rollback_path,predicted_outcome,reach_gain,surfaces_tested,capability_gain)
  VALUES ('trigger:human_actions_default_adopt_ai','owner wants the waiting-on-you queue resolved autonomously','adopted stated default for card '||NEW.slug,COALESCE(NEW.default_in_effect,''),'card closed, default in force','none beyond the default the card already named','UPDATE human_actions SET status=''open'' WHERE id='||NEW.id,
    'the card stays resolved on its stated default',
    '0', 'human_actions.default_in_effect (the card''s own text), ops_config default_adopt_gate', 'none (removes a wait on the owner)');
END;
CREATE TRIGGER human_actions_autonomy_first_ai AFTER INSERT ON human_actions
WHEN NEW.status = 'open'
  AND COALESCE((SELECT value FROM ops_config WHERE key = 'autonomy_first_gate'), 'on') <> 'off'
  AND (SELECT gate FROM v_human_action_gate WHERE id = NEW.id) = 'fleet'
  AND COALESCE(NEW.source, '') <> 'owner-request-issue'
BEGIN
  INSERT INTO autonomy_reroute_queue (human_action_id, title, description, category, priority)
  VALUES (NEW.id,
    'AUTONOMY-FIRST-REROUTE-1: ' || NEW.title,
    'AUTONOMY-FIRST-1 (migrations/2026-10-08-autonomy-first.sql): owner card #' || NEW.id || ' (' || COALESCE(NEW.slug, '') || ', from '
      || COALESCE(NEW.source, '?') || ') asked the owner for a decision that is not irreversible and identity-bound, so it is the fleet''s. '
      || 'Decide and execute: pick the best lever in the card''s action text (or a better one), apply it through the canonical path '
      || '(PR, migration, ops_config row), and close this issue with close_evidence naming the lever and a live measurement. '
      || 'Never re-open the card for the owner. Why: ' || COALESCE(NEW.why, '') || ' Default in effect: ' || COALESCE(NEW.default_in_effect, '')
      || ' Card action: ' || COALESCE(NEW.action, '') || ' Charter pillar: autonomy.',
    'governance', CASE NEW.sev WHEN 'urgent' THEN 'critical' WHEN 'high' THEN 'high' ELSE 'medium' END);
  UPDATE human_actions SET status = 'rerouted', resolved_at = datetime('now'), updated_at = datetime('now'),
    resolution = 'AUTONOMY-FIRST-1: queued for the fleet as an agent_issue (QUEUE-BREAK-CYCLE-1; drained by fleet_cron autonomy-reroute-drain)'
  WHERE id = NEW.id;
END;
CREATE TRIGGER owner_request_requires_card BEFORE UPDATE OF status ON agent_issues WHEN NEW.category = 'owner-request' AND NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix') AND NOT EXISTS (SELECT 1 FROM human_actions h WHERE h.slug = 'issue-' || NEW.id) BEGIN INSERT INTO human_actions (slug, title, why, default_in_effect, action, url, sev, status, source, created_at, updated_at) VALUES ('issue-' || NEW.id, substr(REPLACE(REPLACE(REPLACE(NEW.title,'Claude','owner agent'),'claude','owner agent'),'CLAUDE','OWNER AGENT'),1,120), substr(REPLACE(REPLACE(REPLACE(COALESCE(NEW.description,''),'Claude','owner agent'),'claude','owner agent'),'CLAUDE','OWNER AGENT'),1,400), '', 'Open fleet.qnfo.org and decide or dismiss this card.', 'https://fleet.qnfo.org/content', 'normal', 'open', 'owner-request-issue', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')); END;
-- two agent_issues triggers that sit beside it on the close path
CREATE TRIGGER issue_lifecycle_au AFTER UPDATE OF status ON agent_issues WHEN COALESCE(OLD.status, '') <> COALESCE(NEW.status, '')
BEGIN INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, has_evidence) VALUES (NEW.id, CASE WHEN NEW.status = 'open' THEN 'reopened' ELSE 'dispositioned' END, OLD.status, NEW.status, 1); END;
CREATE TRIGGER issue_close_evidence_required BEFORE UPDATE OF status ON agent_issues WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix') AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '') BEGIN SELECT RAISE(ABORT,'close-without-evidence'); END;
`;
const now = "strftime('%Y-%m-%dT%H:%M:%SZ','now')";
// the seven open owner-request-issue cards of 2026-10-19 (gate fleet x5, owner x2), a done and a rerouted one, and two other sources
const SEED = String.raw`
INSERT INTO ops_config (key, value) VALUES ('autonomy_first_gate', 'on');
INSERT INTO agent_issues (id, title, description, source, category, status) VALUES (2783, 'MODEL-FLOOR-1 handoff', 'worker.js model floor', 'owner', 'owner-request', 'closed'), (100023, 'Restore the mail binding', 'a verification code via Gmail', 'owner', 'owner-request', 'closed');
INSERT INTO issue_triage (issue_id, rc, owner, sla_due_at, close_evidence) VALUES (2783, 'rc', 'fleet', 'x', 'RESOLVE-ALL-OPEN-1 2026-10-19: scripts/model-floor-guard.mjs reports 1 worker (was 22)'), (100023, 'rc', 'fleet', 'x', 'one-time codes stay out of every automated mail path (MSGRAPH-NO-CODES-1)');
INSERT INTO human_actions (id, slug, title, why, default_in_effect, action, url, sev, status, source, created_at, updated_at) VALUES
 (103, 'issue-2783', 'MODEL-FLOOR-1 handoff', 'worker.js model floor', '', 'Open fleet.qnfo.org and decide or dismiss this card.', 'https://fleet.qnfo.org/content', 'normal', 'open', 'owner-request-issue', ${now}, ${now}),
 (104, 'issue-2865', 'KPI crash', 'threshold on the code_tasks read', '', 'Open fleet.qnfo.org and decide or dismiss this card.', 'https://fleet.qnfo.org/content', 'normal', 'open', 'owner-request-issue', ${now}, ${now}),
 (105, 'issue-2900', 'Research cap', 'a cap on the queue', '', 'Open fleet.qnfo.org and decide or dismiss this card.', 'https://fleet.qnfo.org/content', 'normal', 'open', 'owner-request-issue', ${now}, ${now}),
 (106, 'issue-2933', 'Artifacts namespace', 'worker.js routes', '', 'Open fleet.qnfo.org and decide or dismiss this card.', 'https://fleet.qnfo.org/content', 'normal', 'open', 'owner-request-issue', ${now}, ${now}),
 (107, 'issue-99956', 'Research task', 'cadence of the research queue', '', 'Open fleet.qnfo.org and decide or dismiss this card.', 'https://fleet.qnfo.org/content', 'normal', 'open', 'owner-request-issue', ${now}, ${now}),
 (108, 'issue-100023', 'Restore the mail binding', 'a verification code via Gmail', '', 'Open fleet.qnfo.org and decide or dismiss this card.', 'https://fleet.qnfo.org/content', 'normal', 'open', 'owner-request-issue', ${now}, ${now}),
 (112, 'issue-2811', 'Probe issue', 'your account', '', 'Open fleet.qnfo.org and decide or dismiss this card.', 'https://fleet.qnfo.org/content', 'normal', 'open', 'owner-request-issue', ${now}, ${now}),
 (79, 'issue-2690', 'old task', 'worker.js', '', 'x', 'u', 'normal', 'rerouted', 'owner-request-issue', '2026-10-17T14:55:29Z', '2026-10-17T14:55:29Z'),
 (60, 'issue-2600', 'older task', 'x', '', 'x', 'u', 'normal', 'done', 'owner-request-issue', '2026-10-16T10:00:00Z', '2026-10-16T10:00:00Z'),
 (120, 'real-owner-card', 'Provide the signing credential', 'a credential only you can mint', '', 'x', 'u', 'normal', 'open', 'ask', ${now}, ${now});
`;
const CYCLIC_AUTONOMY = "CREATE TRIGGER human_actions_autonomy_first_ai AFTER INSERT ON human_actions BEGIN INSERT INTO agent_issues (title, description, source) VALUES (NEW.title, NEW.why, 'autonomy-first-gate'); END;\n";
// production: the live objects, the OWNER-NOTICE-GATE-1 view, the drain task
function fresh() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.exec(NOTICE_VIEW);
  db.exec(LIVE_KERNEL);
  db.exec(LIVE_TRIGGERS);
  db.exec(SEED);
  db.exec(LIVE_CRON);
  db.exec("INSERT INTO fleet_tasks (id, name, type, definition, timeout_ms) VALUES ('autonomy-reroute-drain', 'live drain', 'workflow', 'LIVE-DEFINITION', 60000)");
  return db;
}
// a database rebuilt from migrations/: the 2026-10-08 view then OWNER-NOTICE-GATE-1, the cyclic autonomy trigger, no closure trigger, no queue, no drain task
function rebuilt() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA.replace(/CREATE TABLE autonomy_reroute_queue[^\n]*\n/, ""));
  db.exec(OLD_VIEW);
  db.exec("DROP VIEW v_human_action_gate");
  db.exec(NOTICE_VIEW);
  db.exec(readFileSync(join(here, "2026-10-14-sla-120m.sql"), "utf8").match(/CREATE VIEW v_stuck_summary_kernel AS[\s\S]*?;\n/)[0]);
  db.exec(LIVE_TRIGGERS.replace(/CREATE TRIGGER human_actions_autonomy_first_ai[\s\S]*?\nEND;\n/, CYCLIC_AUTONOMY).replace(/CREATE TRIGGER owner_request_requires_card[^\n]*\n/, ""));
  return db;
}
const all = (db, sql, ...p) => db.prepare(sql).all(...p);
const one = (db, sql, ...p) => db.prepare(sql).get(...p);
const def = (db, name) => (one(db, "SELECT sql FROM sqlite_master WHERE name = ?", name) || {}).sql;
const text = readFileSync(MIGRATION, "utf8");
const apply = (db) => { db.exec(text); };
const rollbackLine = () => {
  const m = text.split("\n").map((l) => l.match(/^--\s*Rollback:\s*(.+)$/i)).find(Boolean);
  return m ? m[1] : "";
};
let issueSeq = 5000;
// close a new owner-request issue (with the close evidence the evidence trigger demands) and return the card it produced
function closeOwnerRequest(db, { title = "Restore the Gmail binding", description = "needs your api key and an account", evidence = "closed: binding declined by policy (MSGRAPH-NO-CODES-1)" } = {}) {
  const id = ++issueSeq;
  db.prepare("INSERT INTO agent_issues (id, title, description, source, category, status) VALUES (?, ?, ?, 'owner', 'owner-request', 'open')").run(id, title, description);
  db.prepare("INSERT INTO issue_triage (issue_id, rc, owner, sla_due_at, close_evidence) VALUES (?, 'rc', 'fleet', 'x', ?)").run(id, evidence);
  db.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = ?").run(id);
  return { id, cards: all(db, "SELECT * FROM human_actions WHERE slug = ?", "issue-" + id) };
}
const fleetOpen = (db) => one(db, "SELECT COUNT(*) AS n FROM human_actions h JOIN v_human_action_gate g ON g.id = h.id WHERE h.status = 'open' AND g.gate = 'fleet'").n;
const ownerDispatch = (db) => one(db, "SELECT COUNT(*) AS n FROM human_actions h JOIN v_human_action_gate g ON g.id = h.id WHERE g.gate = 'owner' AND h.created_at >= datetime('now', '-7 days')").n;
const openRequests = (db) => one(db, "SELECT COUNT(*) AS n FROM human_actions WHERE source = 'owner-request-issue' AND status = 'open'").n;

// D1-TRIGGER-DEPTH-1: D1 refuses a write whose trigger programs nest deeper than 10 levels or form a static cycle ("nested too deep",
// agent_issues 99919). The runner (scripts/apply_migrations.py depth_canary) probes this live after each CREATE TRIGGER; this is the same
// question asked offline, per (table, event): the longest chain of trigger bodies a write to it can start, or Infinity on a cycle.
function nestDepth(db) {
  const trig = all(db, "SELECT name, sql FROM sqlite_master WHERE type = 'trigger'").map((r) => {
    const m = r.sql.match(/CREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s+(?:BEFORE|AFTER|INSTEAD\s+OF)?\s*(INSERT|UPDATE|DELETE)\b[\s\S]*?\bON\s+"?(\w+)"?/i);
    const begin = r.sql.search(/\bBEGIN\b/i);
    const bodyText = (begin < 0 ? "" : r.sql.slice(begin + 5)).replace(/'(?:[^']|'')*'/g, "''");
    const writes = [];
    for (const w of bodyText.matchAll(/\bINSERT(?:\s+OR\s+\w+)?\s+INTO\s+"?(\w+)"?/gi)) writes.push(w[1].toLowerCase() + ":insert");
    for (const w of bodyText.matchAll(/\bUPDATE(?:\s+OR\s+\w+)?\s+"?(\w+)"?\s+SET\b/gi)) writes.push(w[1].toLowerCase() + ":update");
    for (const w of bodyText.matchAll(/\bDELETE\s+FROM\s+"?(\w+)"?/gi)) writes.push(w[1].toLowerCase() + ":delete");
    return { name: r.name, key: m[3].toLowerCase() + ":" + m[2].toLowerCase(), writes };
  });
  const memo = new Map();
  const nest = (key, stack) => {
    if (stack.includes(key)) return Infinity;
    if (memo.has(key)) return memo.get(key);
    let best = 0;
    for (const t of trig.filter((x) => x.key === key)) best = Math.max(best, 1 + Math.max(0, ...t.writes.map((w) => nest(w, stack.concat(key)))));
    memo.set(key, best);
    return best;
  };
  return Math.max(0, ...[...new Set(trig.map((t) => t.key))].map((k) => nest(k, [])));
}

const OBJECTS = ["owner_request_requires_card", "human_actions_autonomy_first_ai", "autonomy_reroute_queue", "v_human_action_gate"];

// 0. fixture checks: production and the rebuilt database are what the issue describes
section(() => {
  const live = fresh();
  ok(openRequests(live) === 7 && fleetOpen(live) === 0, "production fixture: 7 open owner-request-issue notices, none graded fleet (OWNER-NOTICE-GATE-1)", [openRequests(live), fleetOpen(live)]);
  ok(all(live, "SELECT DISTINCT gate FROM v_human_action_gate WHERE source = 'owner-request-issue'").map((r) => r.gate).join() === "notice", "production fixture: every owner-request-issue card grades notice");
  const rb = rebuilt();
  ok(/INTO agent_issues/.test(def(rb, "human_actions_autonomy_first_ai")), "rebuilt fixture: the autonomy trigger is the cyclic 2026-10-08 form", def(rb, "human_actions_autonomy_first_ai"));
  ok(!def(rb, "owner_request_requires_card") && !def(rb, "autonomy_reroute_queue") && !one(rb, "SELECT 1 AS x FROM fleet_tasks WHERE id = 'autonomy-reroute-drain'"), "rebuilt fixture: no closure trigger, no queue table, no drain task");
});

// 1. header the runner needs
ok(/^-- APPLY-BY: ci$/m.test(text) && /^-- DB: qnfo-audit$/m.test(text), "header opts in to CI on qnfo-audit");
ok(/^-- BACKUP: bak_20261019_owner_queue_triggers$/m.test(text) && rollbackLine().length > 100, "header names its BACKUP table and a Rollback line", rollbackLine().slice(0, 80));

// 2. on production the file changes no behaviour and no card
section(() => {
  const db = fresh();
  const before = OBJECTS.map((n) => def(db, n));
  const cardsBefore = JSON.stringify(all(db, "SELECT id, status, resolved_at, resolution, updated_at FROM human_actions ORDER BY id"));
  const metricsBefore = [fleetOpen(db), ownerDispatch(db)];
  apply(db);
  ok(JSON.stringify(OBJECTS.map((n) => def(db, n))) === JSON.stringify(before), "the four objects keep their live text byte for byte (closure trigger, autonomy trigger, queue table, notice-gate view)");
  ok(JSON.stringify(all(db, "SELECT id, status, resolved_at, resolution, updated_at FROM human_actions ORDER BY id")) === cardsBefore, "no human_actions row changes: the 7 open notices stay open and unresolved");
  ok(openRequests(db) === 7, "the 7 open owner-request-issue notices are still open for the owner", openRequests(db));
  ok(JSON.stringify([fleetOpen(db), ownerDispatch(db)]) === JSON.stringify(metricsBefore), "owner_queue_fleet_cards_open and owner_dispatch_7d do not move", metricsBefore);
  ok(one(db, "SELECT definition FROM fleet_tasks WHERE id = 'autonomy-reroute-drain'").definition === "LIVE-DEFINITION", "an existing drain task is left as it is");
  ok(one(db, "SELECT COUNT(*) AS n FROM fleet_tasks").n === 1, "no second drain task");
  // a close still writes an OPEN notice, graded notice, that is never rerouted (the refusal to pre-resolve stands)
  const r = closeOwnerRequest(db);
  const c = r.cards[0] || {};
  ok(r.cards.length === 1 && c.status === "open" && c.source === "owner-request-issue" && c.resolved_at === null, "a close still writes one OPEN notice card for the owner, not a pre-resolved one", c);
  ok(one(db, "SELECT gate FROM v_human_action_gate WHERE slug = ?", "issue-" + r.id).gate === "notice", "the new notice grades notice");
  ok(one(db, "SELECT COUNT(*) AS n FROM autonomy_reroute_queue WHERE title LIKE '%Gmail binding%'").n === 0, "a notice never reaches the reroute queue");
  ok([fleetOpen(db), ownerDispatch(db)].join() === metricsBefore.join(), "a new notice moves neither owner_queue_fleet_cards_open nor owner_dispatch_7d");
  // an IDENTITY-BOUND: line is a real owner step and stays 'owner' (OWNER-NOTICE-GATE-1)
  const k = closeOwnerRequest(db, { title: "Rotate the key", description: "IDENTITY-BOUND: only you can sign in" });
  ok(one(db, "SELECT gate FROM v_human_action_gate WHERE slug = ?", "issue-" + k.id).gate === "owner" && k.cards[0].status === "open", "an IDENTITY-BOUND: notice stays an open owner card", k.cards[0]);
  // other sources behave as before
  db.prepare("INSERT INTO human_actions (slug, title, why, status, source) VALUES ('ask-1', 'Tune the cap', 'raise the cap in ops_config', 'open', 'ask-tune')").run();
  ok(one(db, "SELECT status FROM human_actions WHERE slug = 'ask-1'").status === "rerouted", "a fleet-readable card from another source still reroutes");
  ok(one(db, "SELECT COUNT(*) AS n FROM autonomy_reroute_queue WHERE human_action_id = (SELECT id FROM human_actions WHERE slug = 'ask-1')").n === 1, "the reroute still goes through autonomy_reroute_queue");
  // re-closing does not duplicate the card (the slug guard is kept)
  db.prepare("UPDATE agent_issues SET status = 'open' WHERE id = ?").run(r.id);
  db.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = ?").run(r.id);
  ok(one(db, "SELECT COUNT(*) AS n FROM human_actions WHERE slug = ?", "issue-" + r.id).n === 1, "re-closing an issue keeps one card");
});

// 3. a database rebuilt from migrations/ ends with the live objects
section(() => {
  const live = fresh();
  const want = { trig: def(live, "human_actions_autonomy_first_ai"), close: def(live, "owner_request_requires_card"), table: def(live, "autonomy_reroute_queue") };
  const db = rebuilt();
  apply(db);
  ok(def(db, "human_actions_autonomy_first_ai") === want.trig, "the autonomy trigger is the queue form, byte for byte the live text");
  ok(!/INTO agent_issues/.test(def(db, "human_actions_autonomy_first_ai")), "the autonomy trigger never writes agent_issues (issue 99919)");
  ok(collapse(def(db, "owner_request_requires_card")) === collapse(want.close), "the closure trigger exists with the live text (whitespace aside)", def(db, "owner_request_requires_card"));
  ok(def(db, "autonomy_reroute_queue") === want.table, "the queue table exists, byte for byte the live text");
  const t = one(db, "SELECT * FROM fleet_tasks WHERE id = 'autonomy-reroute-drain'");
  ok(!!t && t.type === "workflow" && t.timeout_ms === 60000 && t.enabled === 1, "fleet_tasks autonomy-reroute-drain exists", t);
  const steps = JSON.parse(t.definition).steps;
  ok(steps.length === 2 && steps.every((s) => s.type === "sql" && s.db === "AUDIT") && /INSERT INTO agent_issues/.test(steps[0].sql) && /UPDATE autonomy_reroute_queue/.test(steps[1].sql) && /'autonomy-first-gate'/.test(steps[0].sql), "the drain definition is valid JSON with the two sql steps", steps.map((s) => s.sql.slice(0, 40)));
  // and the rebuilt database behaves like production on a close and on a reroute
  const r = closeOwnerRequest(db);
  ok(r.cards.length === 1 && r.cards[0].status === "open" && one(db, "SELECT gate FROM v_human_action_gate WHERE slug = ?", "issue-" + r.id).gate === "notice", "a close on the rebuilt database writes one open notice graded notice", r.cards);
  db.prepare("INSERT INTO human_actions (slug, title, why, status, source) VALUES ('ask-1', 'Tune the cap', 'raise the cap in ops_config', 'open', 'ask-tune')").run();
  ok(one(db, "SELECT status FROM human_actions WHERE slug = 'ask-1'").status === "rerouted", "a reroute works on the rebuilt database");
});

// 4. backup table
section(() => {
  const db = fresh();
  const old = { a: def(db, "owner_request_requires_card"), b: def(db, "human_actions_autonomy_first_ai") };
  apply(db);
  const bak = all(db, "SELECT name, type, sql FROM bak_20261019_owner_queue_triggers ORDER BY name");
  ok(bak.length === 3 && bak.filter((r) => r.type === "trigger").length === 2 && bak.filter((r) => r.type === "view").length === 1, "backup holds the two trigger definitions and the kernel view", bak.map((r) => r.name));
  ok(bak.find((r) => r.name === "owner_request_requires_card").sql === old.a && bak.find((r) => r.name === "human_actions_autonomy_first_ai").sql === old.b, "backup text equals the definitions before the file, byte for byte");
  ok((bak.find((r) => r.name === "v_stuck_summary_kernel") || {}).sql === LIVE_KERNEL, "backup keeps the live text of v_stuck_summary_kernel as it was before the file, byte for byte");
  const rb = rebuilt();
  const cyc = def(rb, "human_actions_autonomy_first_ai");
  apply(rb);
  const rbak = all(rb, "SELECT name, sql FROM bak_20261019_owner_queue_triggers");
  ok(rbak.find((r) => r.name === "human_actions_autonomy_first_ai").sql === cyc, "on a rebuilt database the backup keeps the cyclic form it replaced", rbak.map((r) => r.name));
});

// 5. registries and the detector
section(() => {
  const db = fresh();
  apply(db);
  const c = one(db, "SELECT * FROM control_registry WHERE control = 'owner-request-requires-card'");
  ok(!!c && c.disposition === "keep" && c.disposition_state === "applied" && c.critical_path === 0 && c.kind === "guard" && !!c.alternate_path, "control_registry names the kept guard and its alternate", c);
  ok(/pre-resolved was refused/.test(c.evidence), "the registry evidence records the refusal that the notices stay open", c.evidence);
  const f = one(db, "SELECT * FROM failure_modes WHERE fm_key = 'owner-queue-objects-outside-repo'");
  ok(!!f && f.probe_class === "fm-owner-queue-objects-outside-repo", "failure_modes row with its detector class", f);
  const rc = one(db, "SELECT * FROM remediation_contracts WHERE class = 'fm-owner-queue-objects-outside-repo'");
  ok(!!rc && rc.verify_transport === "d1-query" && rc.status === "active", "the fm detector contract exists", rc);
  // the consumer runs only a literal read-only select (scripts/remediation_consumer.py WRITE_KW)
  const low = rc.verify_probe.toLowerCase();
  ok(low.startsWith("select") && !["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"].some((k) => low.includes(k)) && !low.includes(";"), "the probe is a single literal read-only select");
  const d = one(db, "SELECT * FROM decision_log WHERE action LIKE 'OWNER-QUEUE-VERSIONED-1:%'");
  ok(!!d && !!d.predicted_outcome && !!d.capability_gain && !!d.surfaces_tested, "decision_log row with prediction, capability_gain and surfaces", d);
  ok(/pre-resolved was refused/.test(d.assumption) && /stay open/.test(d.action), "decision_log records that the open notices stay open and why", d);
  const probe = (d2) => d2.prepare(rc.verify_probe).get();
  const p = probe(db);
  ok(p.expected === "1" && p.observed === "1", "detector passes on production after the file", p);
  const rb = rebuilt();
  ok(probe(rb).observed === "0", "detector fails on a rebuilt database before the file (cyclic trigger, no closure trigger)", probe(rb));
  apply(rb);
  ok(probe(rb).observed === "1", "detector passes on a rebuilt database after the file", probe(rb));
  const drop = (name) => { const x = fresh(); apply(x); x.exec("DROP TRIGGER " + name); return probe(x).observed; };
  ok(drop("owner_request_requires_card") === "0", "detector fails when the closure trigger is dropped (a positive assertion)");
  ok(drop("human_actions_autonomy_first_ai") === "0", "detector fails when the autonomy trigger is dropped");
  const cyc = fresh(); apply(cyc);
  cyc.exec("DROP TRIGGER human_actions_autonomy_first_ai");
  cyc.exec(CYCLIC_AUTONOMY);
  ok(probe(cyc).observed === "0", "detector fails when the cyclic form comes back");
  const task = fresh(); apply(task);
  task.exec("DELETE FROM fleet_tasks WHERE id = 'autonomy-reroute-drain'");
  ok(probe(task).observed === "0", "detector fails when the drain task is gone");
  const old = fresh(); apply(old);
  old.exec("DROP VIEW v_human_action_gate");
  old.exec(OLD_VIEW);
  ok(probe(old).observed === "0", "detector fails when an open owner-request-issue card grades fleet (the 2026-10-08 view)", probe(old));
  // second review: an open IDENTITY-BOUND notice grades 'owner' on purpose (OWNER-NOTICE-GATE-1) and must not fail the detector
  const idb = fresh(); apply(idb);
  const kb = closeOwnerRequest(idb, { title: "Rotate the key", description: "IDENTITY-BOUND: only you can sign in" });
  ok(one(idb, "SELECT gate FROM v_human_action_gate WHERE slug = ?", "issue-" + kb.id).gate === "owner" && kb.cards[0].status === "open", "fixture: an open IDENTITY-BOUND notice grades owner", kb.cards[0]);
  ok(probe(idb).observed === "1", "detector stays at observed 1 while an open IDENTITY-BOUND notice exists", probe(idb));
  // second review: the cron that runs the drain task is part of the positive assertion
  const nocron = fresh(); apply(nocron);
  nocron.exec("DELETE FROM fleet_crons WHERE task_id = 'autonomy-reroute-drain'");
  ok(probe(nocron).observed === "0", "detector fails when no fleet_crons row runs the drain task");
  const offcron = fresh(); apply(offcron);
  offcron.exec("UPDATE fleet_crons SET enabled = 0 WHERE task_id = 'autonomy-reroute-drain'");
  ok(probe(offcron).observed === "0", "detector fails when the drain cron is disabled");
});

// 6. idempotent re-apply
section(() => {
  const db = fresh();
  apply(db);
  const snap = () => JSON.stringify({
    defs: OBJECTS.map((n) => def(db, n)),
    cards: all(db, "SELECT id, status, resolved_at, resolution FROM human_actions ORDER BY id").map((c) => [c.id, c.status, c.resolution]),
    n: ["bak_20261019_owner_queue_triggers", "control_registry", "failure_modes", "remediation_contracts", "decision_log", "fleet_tasks", "autonomy_reroute_queue", "human_actions"].map((t) => one(db, "SELECT COUNT(*) AS n FROM " + t).n),
    triggers: all(db, "SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").map((r) => r.name),
  });
  const a = snap();
  let err = "";
  try { apply(db); } catch (e) { err = String(e && e.message || e); }
  ok(err === "", "re-applying the file does not error", err);
  ok(snap() === a, "re-applying changes nothing (backup keeps the first definitions, one decision_log row)");
  ok(one(db, "SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE 'OWNER-QUEUE-VERSIONED-1:%'").n === 1, "one decision_log row after two applies");
});

// 7. rollback removes the registry rows and touches nothing else
section(() => {
  const db = fresh();
  apply(db);
  const defs = JSON.stringify(OBJECTS.map((n) => def(db, n)));
  let err = "";
  try { db.exec(rollbackLine()); } catch (e) { err = String(e && e.message || e); }
  ok(err === "", "the Rollback line runs", err);
  ok(!one(db, "SELECT 1 AS x FROM control_registry WHERE control = 'owner-request-requires-card'") && !one(db, "SELECT 1 AS x FROM failure_modes WHERE fm_key = 'owner-queue-objects-outside-repo'") && !one(db, "SELECT 1 AS x FROM remediation_contracts WHERE class = 'fm-owner-queue-objects-outside-repo'"), "rollback removes the registry rows");
  ok(JSON.stringify(OBJECTS.map((n) => def(db, n))) === defs && openRequests(db) === 7, "rollback leaves the live objects and the 7 open notices as they are");
  ok(!one(db, "SELECT 1 AS x FROM queue_sla WHERE stuck_type = 'autonomy-reroute-undrained'"), "rollback removes the queue_sla row");
  ok(collapse(def(db, "v_stuck_summary_kernel")) === collapse(LIVE_KERNEL), "rollback restores the three-column kernel view as it was (whitespace aside)", def(db, "v_stuck_summary_kernel"));
  ok(one(db, "SELECT COUNT(*) AS n FROM fleet_crons WHERE task_id = 'autonomy-reroute-drain' AND enabled = 1").n === 1, "rollback leaves the drain cron alone (it ran live before this file)");
  let err2 = "";
  try { apply(db); } catch (e) { err2 = String(e && e.message || e); }
  ok(err2 === "" && !!one(db, "SELECT 1 AS x FROM control_registry WHERE control = 'owner-request-requires-card'"), "the file applies again after a rollback", err2);
});

// 8. D1-TRIGGER-DEPTH-1: the graph the file leaves is acyclic and shallow; the 2026-10-08 form is caught by the same check
section(() => {
  const db = fresh();
  const base = nestDepth(db);
  apply(db);
  const after = nestDepth(db);
  ok(Number.isFinite(base) && base <= 10, "production trigger graph is acyclic", base);
  ok(Number.isFinite(after) && after <= 10 && after <= base, "the trigger graph after the file is acyclic, within D1's 10 levels and no deeper", [base, after]);
  const rb = rebuilt();
  apply(rb);
  ok(Number.isFinite(nestDepth(rb)) && nestDepth(rb) <= 10, "a rebuilt database is acyclic after the file", nestDepth(rb));
  const cyc = rebuilt();
  cyc.exec("CREATE TRIGGER agent_issues_to_card_ai AFTER INSERT ON agent_issues BEGIN INSERT INTO human_actions (slug, title, status, source) VALUES ('c-' || NEW.id, NEW.title, 'open', 'x'); END");
  ok(nestDepth(cyc) === Infinity, "control: the agent_issues <-> human_actions cycle (issue 99919) of the rebuilt form is detected by the same check");
});

// 9. second review: the cron that runs the drain, and the queue under QUEUE-SLA-1
section(() => {
  // the cron row
  const live = fresh();
  const rowBefore = JSON.stringify(all(live, "SELECT * FROM fleet_crons"));
  apply(live);
  ok(JSON.stringify(all(live, "SELECT * FROM fleet_crons")) === rowBefore, "production: the live fleet_crons row (id 55, last_fired, next_fire) is left exactly as it is", all(live, "SELECT * FROM fleet_crons"));
  const db = rebuilt();
  ok(all(db, "SELECT * FROM fleet_crons WHERE task_id = 'autonomy-reroute-drain'").length === 0, "rebuilt fixture: no cron runs the drain task before the file");
  apply(db);
  const c = all(db, "SELECT name, cron_expr, task_id, enabled, timezone FROM fleet_crons WHERE task_id = 'autonomy-reroute-drain'");
  ok(c.length === 1 && c[0].name === "autonomy-reroute-drain-10m" && c[0].cron_expr === "*/10 * * * *" && c[0].enabled === 1 && c[0].timezone === "UTC", "a rebuilt database gets the live cron row: autonomy-reroute-drain-10m, */10 * * * *, enabled, UTC", c);
  apply(db);
  ok(one(db, "SELECT COUNT(*) AS n FROM fleet_crons WHERE task_id = 'autonomy-reroute-drain'").n === 1, "re-applying does not add a second cron row");
  // a row that exists under the same name with other settings (an operator change) is not overwritten
  const op = rebuilt();
  op.exec("INSERT INTO fleet_crons (name, cron_expr, task_id, enabled) VALUES ('autonomy-reroute-drain-10m', '*/5 * * * *', 'autonomy-reroute-drain', 1)");
  apply(op);
  ok(one(op, "SELECT cron_expr AS e FROM fleet_crons WHERE name = 'autonomy-reroute-drain-10m'").e === "*/5 * * * *" && one(op, "SELECT COUNT(*) AS n FROM fleet_crons").n === 1, "an existing cron row of that name or task is kept as the operator left it");

  // queue_sla row
  const q = all(db, "SELECT * FROM queue_sla WHERE queue = 'autonomy_reroute_queue'");
  ok(q.length === 1, "queue_sla has one row for autonomy_reroute_queue", q);
  const r = q[0] || {};
  ok(r.stuck_type === "autonomy-reroute-undrained" && r.cycle_min === 10 && r.sla_min > 0 && r.sla_min <= 120 && r.owner === "qnfo-fleet-control" && r.producer_cycle_min === 10, "queue_sla row: 10-minute cycle, SLA at most 120 minutes, owner qnfo-fleet-control", r);
  ok(/autonomy-reroute-drain-10m/.test(r.auto_fix) && /INSERT INTO agent_issues/.test(r.auto_fix) && /UPDATE autonomy_reroute_queue/.test(r.auto_fix), "queue_sla auto_fix names the cron and the drain statements", r.auto_fix);
  ok(/revert/i.test(r.auto_fix || ""), "queue_sla auto_fix states its revert");
  ok(r.summary_column === "v_stuck_summary_kernel.reroute_queue_undrained_over_sla", "queue_sla summary_column names the kernel view column", r.summary_column);
  // the column exists, keeps the three live columns, and measures the age of the oldest undrained item
  const cols = all(db, "PRAGMA table_info(v_stuck_summary_kernel)").map((x) => x.name);
  ok(cols.join() === "predictions_unscored_over_sla,doctrine_proposals_waiting,tick_steps_missed_last_slot,reroute_queue_undrained_over_sla", "kernel view keeps its three columns and adds reroute_queue_undrained_over_sla", cols);
  const body = collapse(def(db, "v_stuck_summary_kernel"));
  const liveLines = LIVE_KERNEL.split("\n").filter((l) => / AS (predictions_unscored_over_sla|doctrine_proposals_waiting|tick_steps_missed_last_slot),?$/.test(l)).map((l) => collapse(l.replace(/,$/, "")));
  ok(liveLines.length === 3 && liveLines.every((l) => body.includes(l)), "the three live column expressions are kept unchanged", body);
  const n = () => one(db, "SELECT reroute_queue_undrained_over_sla AS n FROM v_stuck_summary_kernel").n;
  ok(n() === 0, "an empty queue reads 0", n());
  const ins = (age, drained) => db.prepare("INSERT INTO autonomy_reroute_queue (human_action_id, title, description, created_at, drained_at) VALUES (1, 't', 'd', datetime('now', ?), ?)").run(age, drained);
  ins("-5 minutes", null);
  ok(n() === 0, "an undrained item younger than the SLA is not counted", n());
  ins("-130 minutes", null);
  ok(n() === 1, "an undrained item older than 120 minutes is counted", n());
  ins("-300 minutes", datetime_now(db));
  ok(n() === 1, "a drained item is not counted however old", n());
  // the drain statements (the fleet task's own SQL) clear the measure, so the cron is the automatic fix
  const steps = JSON.parse(one(db, "SELECT definition FROM fleet_tasks WHERE id = 'autonomy-reroute-drain'").definition).steps;
  db.prepare("UPDATE autonomy_reroute_queue SET title = 'AUTONOMY-FIRST-REROUTE-1: x' WHERE drained_at IS NULL").run();
  for (const st of steps) db.exec(st.sql);
  ok(n() === 0 && one(db, "SELECT COUNT(*) AS n FROM agent_issues WHERE title = 'AUTONOMY-FIRST-REROUTE-1: x'").n === 2, "running the drain steps empties the undrained set and files the issues", [n()]);
  // nothing else moved
  ok(one(live, "SELECT COUNT(*) AS n FROM queue_sla").n === 1, "the file adds exactly one queue_sla row");
});
function datetime_now(db) { return one(db, "SELECT datetime('now') AS d").d; }

console.log("owner-request-notice: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
