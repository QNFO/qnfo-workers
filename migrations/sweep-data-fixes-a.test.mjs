// Offline suite (node:sqlite) for migrations/2026-10-26-sweep-data-fixes-a.sql (SWEEP-DATA-FIXES-A-1), data fixes for agent_issues
// 99916, 100388, 100405, 1000100, 1000102 and 1000186 (3003 was fixed by CADENCE-SLA-CONTINUITY-1 first; the suite asserts this file leaves cadence_sla alone).
// The fixture is built from the live qnfo-audit shapes and values read on 2026-10-26 (SELECT only). The suite proves, for every closing probe the fixes name, that
// the probe FAILS on the pre-state and PASSES on the migrated state (the contract probes are read back from remediation_contracts, so what runs is what the file wrote);
// that exactly the intended rows change and no other row does; that a second apply and an already-fixed database change nothing but the one decision_log row; that no
// rule is appended twice; that the Rollback header line restores the pre-state and deletes only the rows this file created; and that the two third-party addresses
// occur nowhere in the migration (one INSERT ... SELECT takes lower(sender) of emails 1077 and 1104). It reads qnfo-email/worker.js (applyFilters) and, only while a follow-up is not yet done,
// the files the three follow-up issues name (the anchors must occur exactly once, as migrations/code-anchor-once.test.mjs demands of trigger levers); a follow-up that lands skips its check.
// SWEEP_A_SQL=<path> points the suite at a mutated copy of the migration (mutation checks). Run: node --no-warnings migrations/sweep-data-fixes-a.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const SQL = readFileSync(process.env.SWEEP_A_SQL || new URL("./2026-10-26-sweep-data-fixes-a.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const one = (db, sql, ...p) => db.prepare(sql).get(...p);
const all = (db, sql, ...p) => db.prepare(sql).all(...p).map((r) => ({ ...r }));
const count = (s, t) => s.split(t).length - 1;
const section = async (name, fn) => { try { await fn(); } catch (e) { fail++; console.log("FAIL section " + name + " threw :: " + (e && e.message)); } };

// The two senders (emails 1104 and 1077): fixture rows only. The migration never writes an address (it reads lower(sender) from emails).
const SENDER_1104 = ["ravi.kumar.13p01", "gmail.com"].join("@");
const SENDER_1077 = ["jornalpublication10", "gmail.com"].join("@");

const WATCHED = ["../qnfo-ai/worker.js", "../qnfo-fleet-dashboard/worker.js", "../docs/AUTONOMOUS-OPERATION-DOCTRINE.md"];
const readRepo = (rel) => { try { return readFileSync(new URL("../" + rel, import.meta.url), "utf8"); } catch (e) { return null; } };

const OPS_KEY = "OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1";
const TITLES = {
  enforce: "COST-QUALITY-FLOOR-ENFORCE-1: a downgrade at a spend cap must revert when output quality falls",
  narrative: "PSR-NARRATIVE-CAP-SOFT-1: the weekly program narrative stays silent at a breached ai_spend cap, against BUDGET-SOFT-ROUTE-1",
  doc: "COST-QUALITY-FLOOR-DOC-1: state the owner cost and quality directive in the autonomous operation doctrine",
};
const FM_CLASS = "fm-ticket-quotes-its-own-counted-marker";

// ------------------------------------------------------------------ probes this suite owns (the contract probes are read back from the migrated database)
const P = {
  "99916": "SELECT '0' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM agent_issues WHERE id = 99916 AND instr(description, 'session-task:') > 0",
  "99916b": "SELECT '0' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM analytics_metric_triggers WHERE id = 2934 AND instr(action, 'session-task:') > 0",
  "100388": "SELECT 'ok' AS expected, CASE WHEN (SELECT COUNT(DISTINCT i.slug) FROM cf_changelog_items i JOIN cloudflare_capability_catalog c ON c.slug = i.slug WHERE i.action IN ('reopened','new-row') AND c.status IN ('not_considered','proposed') AND replace(substr(i.seen_at,1,19),'T',' ') < datetime('now','-14 days')) <= 5 THEN 'ok' ELSE 'breach' END AS observed",
  "100405-record": "SELECT 'present' AS expected, (SELECT CASE WHEN COUNT(*) = 1 THEN 'present' END FROM ops_config WHERE key = '" + OPS_KEY + "') AS observed",
};
const run = (db, sql) => { const r = one(db, sql); return { passes: r.expected === r.observed, ...r }; };
const probe = (db, key) => run(db, P[key]);

// ------------------------------------------------------------------ live shapes (qnfo-audit, read 2026-10-26)
const DECISION_PARSE_TRIGGER = `CREATE TRIGGER decision_predictions_parse AFTER INSERT ON decision_log
WHEN instr(COALESCE(NEW.predicted_outcome, ''), ' within ') > 0
BEGIN
  INSERT OR IGNORE INTO decision_predictions (decision_id, kind, subject, op, value, due_at, origin)
    SELECT NEW.id, 'metric', t.tok1, t.tok2, CAST(t.tok3 AS REAL),
      strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+' || CAST(t.after AS INTEGER) || CASE WHEN instr(t.after, ' d') > 0 THEN ' days' ELSE ' hours' END), 'parsed'
    FROM (
      SELECT u.tok1, u.tok2,
        CASE WHEN instr(u.rest2, ' ') > 0 THEN substr(u.rest2, 1, instr(u.rest2, ' ') - 1) ELSE u.rest2 END AS tok3, u.after
      FROM (
        SELECT v.tok1,
          CASE WHEN instr(v.rest1, ' ') > 0 THEN substr(v.rest1, 1, instr(v.rest1, ' ') - 1) ELSE v.rest1 END AS tok2,
          CASE WHEN instr(v.rest1, ' ') > 0 THEN ltrim(substr(v.rest1, instr(v.rest1, ' ') + 1)) ELSE '' END AS rest2, v.after
        FROM (
          SELECT substr(w.p, 1, instr(w.p, ' ') - 1) AS tok1, ltrim(substr(w.p, instr(w.p, ' ') + 1)) AS rest1,
            ltrim(substr(w.p, instr(w.p, ' within ') + 8)) AS after
          FROM (SELECT trim(NEW.predicted_outcome) AS p) w
        ) v
      ) u
    ) t
    WHERE t.tok1 IN (SELECT metric FROM metric_registry) AND t.tok2 IN ('<', '<=', '>', '>=', '=')
      AND t.tok3 GLOB '[0-9]*' AND CAST(t.after AS INTEGER) > 0;
END`;

const SCHEMA = `
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, owner TEXT);
CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE cloudflare_capability_catalog (slug TEXT PRIMARY KEY, need TEXT NOT NULL, product TEXT NOT NULL, when_to_choose TEXT, skill TEXT, reference TEXT, status TEXT NOT NULL DEFAULT 'not_considered', source TEXT NOT NULL DEFAULT 'cloudflare-skills', source_sha TEXT, linked_issue INTEGER, metric_ref TEXT, first_seen TEXT DEFAULT (datetime('now')), last_synced TEXT DEFAULT (datetime('now')));
CREATE TABLE cf_changelog_items (guid TEXT PRIMARY KEY, seen_at TEXT, pub TEXT, title TEXT, link TEXT, products TEXT, klass TEXT, slug TEXT, action TEXT, issue_id INTEGER, prev_status TEXT, excerpt TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT, body_text TEXT, body_html TEXT, headers_json TEXT, classification TEXT DEFAULT 'general', status TEXT DEFAULT 'received', processing_ms INTEGER, received_at TEXT DEFAULT (datetime('now')), processed_at TEXT, in_reply_to TEXT, references_hdr TEXT);
CREATE TABLE email_filters (id INTEGER PRIMARY KEY AUTOINCREMENT, rule_type TEXT DEFAULT 'filter', field TEXT NOT NULL, pattern TEXT NOT NULL, action TEXT NOT NULL DEFAULT 'accept', reply_template TEXT, priority INTEGER DEFAULT 0, enabled BOOLEAN DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TRIGGER email_filters_no_unsafe_auto_reply_ins BEFORE INSERT ON email_filters FOR EACH ROW WHEN NEW.action = 'auto_reply' BEGIN SELECT RAISE(ABORT, 'EMAIL-AUTOREPLY-DISABLED-945'); END;
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE fleet_agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, system_prompt TEXT NOT NULL, model TEXT NOT NULL, tools TEXT, task_id TEXT, enabled INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE management_personas (persona_key TEXT PRIMARY KEY, level TEXT NOT NULL, scope TEXT NOT NULL, charter TEXT, kpis TEXT, decision_authority TEXT, sla_min INTEGER, path_a TEXT, path_b TEXT, status TEXT DEFAULT 'active', updated_at TEXT);
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 30000, retries INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TRIGGER remediation_probe_semicolon_ins AFTER INSERT ON remediation_contracts WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0 BEGIN UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class; END;
CREATE TRIGGER remediation_probe_semicolon_upd AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0 BEGIN UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class; END;
CREATE TRIGGER remediation_probe_edit_rerun AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts WHEN NEW.verify_probe IS NOT OLD.verify_probe OR NEW.verify_transport IS NOT OLD.verify_transport BEGIN UPDATE remediation_contracts SET next_due_at = datetime('now') WHERE class = NEW.class; END;
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
CREATE TABLE decision_predictions (decision_id INTEGER, kind TEXT, subject TEXT, op TEXT, value REAL, due_at TEXT, origin TEXT, PRIMARY KEY (decision_id, kind, subject));
${DECISION_PARSE_TRIGGER};
`;

// The birth template of an issue contract (ORPHAN-GUARD-BIRTH-1 + contract_probe_templates_v3_generic): born superseded with a probe that reads the issue's own status.
const VAC_ACTION = "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close. A doer that knows the defect replaces this probe with one that measures it.";
const vacProbe = (id) => `SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = ${id}) AS observed`;
const BIRTH_TRIGGER = `CREATE TRIGGER birth_contract AFTER INSERT ON agent_issues BEGIN
  INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module, last_verdict)
  VALUES ('issue-' || NEW.id, NEW.id, 'no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)', '${VAC_ACTION}',
    'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = ' || NEW.id || ') AS observed',
    'd1-query', 'qnfo-fleet-control', 'superseded', 'probe-template-v3-generic', 'superseded:closure-observing-probe-at-birth');
END`;

// ------------------------------------------------------------------ live values (read 2026-10-26)
const DESC_99916 = "METRIC-TRIGGER #2934 session_dependent_issues_open=9 gt 0 -> Pillar autonomy (AUTONOMY-FIRST-AUDIT-1). Read the issues: SELECT a.id, a.title, t.owner FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id = a.id WHERE a.status = 'open' AND (a.description LIKE '%session-task:%' OR t.owner LIKE 'session%'). Group them by why the code loop refused them (cont (owner qnfo-code-orchestrator, target agent_issues)";
const ACTION_2934 = "Pillar autonomy (AUTONOMY-FIRST-AUDIT-1). Read the issues: SELECT a.id, a.title, t.owner FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id = a.id WHERE a.status = 'open' AND (a.description LIKE '%session-task:%' OR t.owner LIKE 'session%'). Group them by why the code loop refused them (control-plane worker, scripts/ path, several files, file size, untrusted source, governance). Lever, in order: (1) an issue whose change is one file the loop may edit gets a code-task: and code-anchor: line in place of its session-task line; (2) the group that parks the most issues gets its scope gap closed in qnfo-code-orchestrator; (3) an issue that only states a decision gets the decision taken and recorded on the issue (AUTONOMY-FIRST-1). Never close an issue without its work to lower the count. Definition of done: session_dependent_issues_open lower than at filing at two refreshes 24 hours apart, then 0.";
const DESC_100405 = "The owner added a note on fleet.qnfo.org to the card code:ct_hoq2y5kjmyf7lp: Cost-consciousness directive: quality may not be reduced to cut cost; prefer lower-cost paths only when quality is preserved. Definition of done: act on it, or record why not, and close with evidence in issue_triage.close_evidence (CLAUDE.md). Filed by qnfo-fleet-dashboard OWNER-NOTES-ROUTE-1.\nRED-GATE-1: escalated to critical - open red with no update for 48h and no code task referencing it.";
const PM_CAD = "Cadence: weekly strategic review hosted in qnfo-fleet-dashboard portfolioStrategicRun (Mondays 06:00Z), reading the daily program scorecards.";
const PROG_CAD = "Cadence: daily read of the program scorecard; weekly program note into the portfolio review.";
const PROMPTS = {
  "portfolio-manager": "The QNFO portfolio manager persona (PORTFOLIO-MANAGER-1, 2026-10-25). Fleet-wide strategy review above the task plane: what the fleet is trying to do, which program is the constraint, what to accelerate/constrain/stop, and what genuinely needs the owner. " + PM_CAD + " Inputs: qnfo-audit program_charters, program_scorecards, portfolio_scorecards, v_program_health, v_metric_trigger_state, metric_registry, fleet_budget. Outputs: program_review_notes rows plus one portfolio_runs row (kind weekly-strategic) with per-program verdicts and portfolio decisions; owner cards (human_actions) ONLY for spend/irreversible/identity-bound items that persist after two loop cycles. Hard limits: never deploys, never deletes data, never raises a budget cap, never adds a worker or cron while a fleet_budget cap is breached (CORE-PROMPT-1 rule 8); decides within policy and records, never asks the owner for direction (AUTONOMY-NO-STOP-1).",
  "program-manager:QNFO.OPS": "Program manager persona for QNFO.OPS (Operations & Governance), bound to its program charter. Objective: keep the fleet self-maintaining: every open issue carries a doer, an SLA and a next action, and breaches are closed by root cause rather than by backlog shrinkage. Definition of done: issues_without_next_action at zero and guard breaches closed with a verified re-probe. Primary metric: issues_without_next_action. Owner service: qnfo-ops. " + PROG_CAD + " Escalates RED verdicts to the portfolio manager; never defers technical work to the owner (NEVER-DEFER-TO-USER-1).",
  "program-manager:QNFO.INFRA": "Program manager persona for QNFO.INFRA (Cloudflare Infrastructure), bound to its program charter. Objective: every worker, binding, cron and migration is declared, deployed, observed and reversible: no drift between the repo and live. Definition of done: fleet graph findings at zero drift, service_registry equals the live CF scripts list, declared crons converge with live schedules. Primary metric: fleet_graph_findings_warn. Owner service: qnfo-infra. " + PROG_CAD + " Escalates RED verdicts to the portfolio manager; never defers technical work to the owner (NEVER-DEFER-TO-USER-1).",
  "program-manager:QNFO.RSCH": "Program manager persona for QNFO.RSCH (Research & Publications), bound to its program charter. Objective: produce and publish verified research: an idea moves to draft, review and publication with citation integrity intact and the corpus typeset-clean. Definition of done: every publication computationally verified and every deposited record links its own site (PUBLICATION-FUNNEL-LINK-1). Primary metric: runtime_verified_share_24h. Owner service: qnfo-research-exec. " + PROG_CAD + " Escalates RED verdicts to the portfolio manager.",
  "program-manager:QNFO.REACH": "Program manager persona for QNFO.REACH (Reach & Distribution), bound to its program charter. Objective: grow reach on substance: pieces publish on schedule, feeds stay healthy, subscribers are retained, and outreach never exceeds its consent gate. Definition of done: publication cadence on schedule and outreach caps respected. Primary metric: q08_hours_since_last_piece. Owner service: qnfo-social. " + PROG_CAD + " Escalates RED verdicts to the portfolio manager.",
  "program-manager:QNFO.PERSONAL": "Program manager persona for QNFO.PERSONAL (Personal Twin), bound to its program charter. Objective: the personal twin serves the owner's life plane without leaking personal data into the research plane or onto any public surface (PERSONAL-QNFO-SEPARATION-1). Definition of done: zero personal_leak_incidents. Primary metric: personal_leak_incidents. Owner service: personal-companion. " + PROG_CAD + " Escalates RED verdicts to the portfolio manager.",
};
const AUTH_TAIL = "; files one ROOT-CAUSE-1 issue per issue family that keeps reopening and closes it when the family stops recurring; measures the quality index of the fleet and of each program hourly (quality_trend) and escalates a program whose quality fell";
const AUTH_PROGRAM = "decides every hour which open issues of its program are in focus, moves them to the front of the code loop's queue, promotes them to high and restores them when they leave focus, closes metric-trigger issues whose metric recovered and supersedes duplicate metric issues (persona_actions)" + AUTH_TAIL;
const AUTH_PORTFOLIO = "decides every hour how the focus slots are split across programs and which program is the constraint (portfolio_allocations), and demotes stale fleet-filed critical issues to high (persona_actions demote); money, credentials, legal or signing acts and the owner's accounts stay owner cards" + AUTH_TAIL;
const PERSONAS = [["program:QNFO.OPS", "program"], ["program:QNFO.RSCH", "program"], ["program:QNFO.INFRA", "program"], ["program:QNFO.REACH", "program"], ["program:QNFO.PERSONAL", "program"], ["portfolio:fleet", "portfolio"]];
const PATH_B = "qnfo-fleet-dashboard weekly review (PORTFOLIO-STRATEGIC-1) recomputes scorecards; POST /api/portfolio/strategic";
const CATALOG = [
  ["cfc-artifacts", "Artifacts is now in open beta", "Artifacts", "Artifacts , Cloudflare's versioned file system that speaks Git, is now in open beta.", "not_considered", "cf-changelog", "new-row", "2026-10-04T08:00:09.728Z"],
  ["data-pipelines", "Ingest event streams into an R2 data lake", "Pipelines, R2 Data Catalog, R2 SQL", "Rejected: event volume is a few hundred thousand requests per 30 days; D1 and Analytics Engine cover it. | cf-changelog 2026-10-01: Cloudflare Basin is now generally available (was rejected; re-evaluate)", "proposed", "claude-session:cf-capability-audit-2026-10-02", "reopened", "2026-10-04T08:00:09.728Z"],
  ["sandbox", "Give an agent a shell/filesystem/IDE", "Sandbox SDK", "AUDIT 2026-10-02: rejected for now. qnfo-containers-pilot already gives the code loop a container; a second executor adds a worker and a Durable Object class against breached caps. | cf-changelog 2026-09-30: Sandbox SDK 1.0: control every sandbox from your own Durable Object (was rejected; re-evaluate)", "proposed", "claude-session:cf-capability-audit-2026-10-02", "reopened", "2026-10-04T08:00:09.728Z"],
  ["cfc-logpush", "Logpush is now available on all plans with usage-based pricing", "logpush", "Cloudflare Logpush is now available on Free, Pro, Business, and Enterprise plans with usage-based pricing.", "not_considered", "cf-changelog", "new-row", "2026-10-04T08:00:09.728Z"],
  ["cfc-monetization-gateway", "Monetization Gateway closed beta", "Monetization Gateway", "Monetization Gateway is now available in closed beta.", "not_considered", "cf-changelog", "new-row", "2026-10-04T08:00:09.728Z"],
  ["cfc-cloudflare-wan", "BGP over IPsec and GRE tunnels generally available", "Cloudflare WAN", "BGP peering over IPsec and GRE tunnels is generally available for Cloudflare WAN and Magic Transit.", "not_considered", "cf-changelog", "new-row", "2026-10-06T21:00:06.263Z"],
  ["cfc-cloudflare-fundamentals", "Cloudflare Organizations is generally available", "Cloudflare Fundamentals", "Cloudflare Organizations is now generally available for Enterprise customers and MSSP/Distributor partners.", "not_considered", "cf-changelog", "new-row", "2026-10-08T13:00:44.583Z"],
];
const SLUGS = CATALOG.map((c) => c[0]).sort();

// The management-personas workflow: one SQL step carries the prompt that asks a model for a roadmap proposal (the live definition has the anchor sentence exactly once).
const ANCHOR = "Reply in exactly this form, each on its own line:";
const wfDefinition = (extra = "") => JSON.stringify({ steps: [
  { type: "sql", name: "recur-clear", db: "AUDIT", sql: "DELETE FROM issue_recurrence_now" },
  { type: "sql", name: "rm-research", db: "AUDIT", sql: "INSERT INTO cf_agent_requests (requester, kind, prompt, instance, priority) SELECT 'program-manager:' || c.program_code, 'run', 'You are the program manager of ' || c.program_code || '. Research it: read qnfo-audit and the code of the program''s workers in the repository. Then propose ONE new feature or quality improvement that a single-file change can deliver, not a fix for an open issue. " + extra + ANCHOR + "' || char(10) || 'TITLE: <under 80 characters>' || char(10) || 'EDIT: <the exact change, under 120 words>', 'roadmap-' || c.program_code, 'medium' FROM program_charters c WHERE c.status = 'active'" },
  { type: "sql", name: "lever-request", db: "AUDIT", sql: "INSERT INTO cf_agent_requests (requester, kind, prompt, instance, priority) SELECT 'x', 'run', 'Answer in under 250 words.', 'lever', 'medium'" },
] });

function seed(db) {
  db.exec(SCHEMA);
  // 99916 / 2934 / the session-dependent count
  const iss = db.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (?, ?, ?, 'open')");
  iss.run(99916, "METRIC-TRIGGER-2934-SESSION-DEPENDENT-ISSUES-OPEN: Autonomy-first gap", DESC_99916);
  iss.run(2604, "METRIC-TRIGGER #6116 papers_queued_over_120m", "papers queue breach, owner is a session");
  iss.run(100064, "personal-companion fix", "wo failed generation runs between them.\nsession-task: repo=qnfo-workers path=personal-companion/worker.js\n(INTAKE-PROVENANCE)");
  iss.run(777001, "an issue that quotes the marker in prose", "an ordinary issue that mentions `session-task: repo=qnfo-workers path=x/worker.js` as an example in the middle of a sentence");
  iss.run(100405, "OWNER-NOTE-46: code:ct_hoq2y5kjmyf7lp", DESC_100405);
  iss.run(1000100, "OWNER-TASK-op-mvn8obo496f4: Remediation record", "Remediation record: log that this chat thread has no write/dispatch tool and that execution authority rests with server-side action carriers");
  iss.run(1000102, "OWNER-TASK-op-mvn8ocpfc485: Classify the journal solicitations", "Classify the two solicitations as journal-pitch mail and mark them for blocking per NO-JOURNALS-1");
  iss.run(1000186, "OWNER-TASK-op-mvnqbba7470b: Enforce in the new agent personas", "Enforce in the new agent personas that personal-api work is never cross-pollinated and that publication goes only to papers.qnfo.org");
  iss.run(5000, "an ordinary open issue", "nothing to see");
  const tri = db.prepare("INSERT INTO issue_triage (issue_id, owner) VALUES (?, ?)");
  tri.run(99916, "qnfo-code-orchestrator"); tri.run(2604, "session-chatbox-20261017"); tri.run(100064, "personal-companion"); tri.run(777001, "qnfo-ops"); tri.run(5000, "qnfo-ops");
  const trg = db.prepare("INSERT INTO analytics_metric_triggers (id, metric_key, title, operator, threshold, action, owner) VALUES (?, ?, ?, 'gt', ?, ?, ?)");
  trg.run(2934, "session_dependent_issues_open", "Autonomy-first gap", 0, ACTION_2934, "qnfo-code-orchestrator");
  trg.run(1204, "cf_changelog_open_proposals_14d", "Autonomy gap: Cloudflare features undecided after 14 days", 5, "Pillar autonomy. The changelog loop reopens rejected catalog rows ...", "qnfo-fleet-control");
  // 100388
  const cat = db.prepare("INSERT INTO cloudflare_capability_catalog (slug, need, product, when_to_choose, status, source, first_seen, last_synced) VALUES (?, ?, ?, ?, ?, ?, '2026-10-04 08:00:12', '2026-10-04 08:00:12')");
  const itm = db.prepare("INSERT INTO cf_changelog_items (guid, seen_at, title, slug, action) VALUES (?, ?, ?, ?, ?)");
  for (const c of CATALOG) { cat.run(c[0], c[1], c[2], c[3], c[4], c[5]); itm.run("g-" + c[0], c[7], c[1], c[0], c[6]); }
  db.exec("UPDATE cloudflare_capability_catalog SET linked_issue = 4242 WHERE slug = 'cfc-logpush'"); // a pre-existing link the rollback must give back
  cat.run("media-products", "Images, Stream, Realtime", "Images, Stream, Realtime", "Rejected: no product in the fleet needs them.", "rejected", "cloudflare-skills");
  cat.run("observability", "Worker exceptions", "Workers Observability + Tail Workers", "Worker exceptions: enable Workers Observability", "in_use", "cloudflare-skills");
  cat.run("workflows", "Durable multi-step jobs", "Workflows", "Candidate for the multi-step jobs", "proposed", "cloudflare-skills");
  itm.run("g-noted-1", "2026-10-22T06:00:35.433Z", "Basin SQL supports OFFSET", "data-pipelines", "noted");
  // 100405
  db.prepare("INSERT INTO ops_config (key, value, note) VALUES ('OWNER_DIRECTIVE_2026_10_20_ISSUE_THROUGHPUT_1', '{\"id\":\"ISSUE-THROUGHPUT-1\"}', 'earlier directive row')").run();
  // 1000102
  const em = db.prepare("INSERT INTO emails (id, message_id, sender, recipient, subject, classification, status) VALUES (?, ?, ?, 'rowan.quni@qnfo.org', ?, 'personal-unverified', ?)");
  em.run(966, "m-966", "kavithakavi6162@gmail.com", "Editorial update and paper inquiry", "spam");
  em.run(1077, "m-1077", SENDER_1077, "Research Across All Disciplines", "spam");
  em.run(1104, "m-1104", SENDER_1104, "Details for research authors", "processed");
  em.run(1105, "m-1105", "someone.else@example.org", "Details for research authors", "processed");
  em.run(1150, "m-1150", SENDER_1104, "A different mail from the same sender", "processed");
  em.run(1200, "m-1200", SENDER_1104, "Another one", "received");
  const flt = db.prepare("INSERT INTO email_filters (id, rule_type, field, pattern, action, priority, enabled) VALUES (?, 'filter', ?, ?, ?, ?, 1)");
  flt.run(30, "from", "advancedresearchpub.com", "spam", 100); flt.run(37, "from", "rowan.quni@qnfo.org", "accept", 200); flt.run(38, "sender", "kavithakavi6162@gmail.com", "spam", 50);
  db.exec("INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, evidence) VALUES ('code-merge-trusted-sources', 'ops_config', 'filter', 'outside text', 1, 'replace', 'applied', 'seed')");
  // 1000186
  const ag = db.prepare("INSERT INTO fleet_agents (id, name, system_prompt, model, tools, enabled, version, updated_at) VALUES (?, ?, ?, 'router:qnfo-ai', '[]', 1, 1, '2026-10-25T11:26:40.180Z')");
  for (const [id, p] of Object.entries(PROMPTS)) ag.run(id, id, p);
  ag.run("some-other-agent", "Other", "An unrelated agent prompt without either rule.");
  const mp = db.prepare("INSERT INTO management_personas (persona_key, level, scope, decision_authority, sla_min, path_b, status, updated_at) VALUES (?, ?, ?, ?, 240, ?, 'active', '2026-10-26 07:00:00')");
  for (const [k, lvl] of PERSONAS) mp.run(k, lvl, k.split(":")[1], lvl === "portfolio" ? AUTH_PORTFOLIO : AUTH_PROGRAM, PATH_B);
  // two extra persona rows that already carry both rules: one with sla_min 90 and the old path_b (only path_b may change), one with sla_min 60 and another path_b (nothing may change)
  mp.run("program:QNFO.HALF", "program", "QNFO.HALF", "stated; PERSONAL-QNFO-SEPARATION-1; NO-JOURNALS-1", PATH_B);
  mp.run("program:QNFO.OTHER", "program", "QNFO.OTHER", "stated; PERSONAL-QNFO-SEPARATION-1; NO-JOURNALS-1", "something else entirely");
  db.exec("UPDATE management_personas SET sla_min = 90 WHERE persona_key = 'program:QNFO.HALF'");
  db.exec("UPDATE management_personas SET sla_min = 60 WHERE persona_key = 'program:QNFO.OTHER'");
  db.prepare("INSERT INTO fleet_tasks (id, name, type, definition, version, updated_at) VALUES ('management-personas', 'management-personas', 'workflow', ?, 7, '2026-10-26T09:43:36Z')").run(wfDefinition());
  db.prepare("INSERT INTO fleet_tasks (id, name, type, definition, version, updated_at) VALUES ('other-workflow', 'other', 'workflow', ?, 3, '2026-10-20T00:00:00Z')").run(wfDefinition("A different workflow that happens to contain the anchor. "));
  // the issue contracts as live: 100405 active (ISSUE-PROBE-AGENT-1, probe found_action), the others born superseded with the vacuous probe
  const con = db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module, last_verdict, attempts, max_attempts, next_due_at) VALUES (?, ?, ?, ?, ?, 'd1-query', 'qnfo-fleet-control', ?, 'probe-template-v3-generic', ?, ?, 3, ?)");
  con.run("issue-100405", 100405, "ISSUE-PROBE-AGENT-1", VAC_ACTION, "SELECT 'found_action' AS expected, CASE WHEN EXISTS (SELECT 1 FROM code_tasks WHERE lower(goal) LIKE '%100405%') THEN 'found_action' ELSE 'action_absent' END AS observed", "active", "fail", 1, "2026-10-26 10:18:39");
  for (const id of [1000100, 1000102, 1000186]) con.run("issue-" + id, id, "no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)", VAC_ACTION, vacProbe(id), "superseded", "superseded:closure-observing-probe-at-birth", 0, "2026-10-25 02:59:16");
  // decision_log and the metric the decision predicts
  db.exec("INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path) VALUES ('s', 'a', 'EARLIER-DECISION-1: x', 'e', 'o', 'b', 'r')");
  db.exec("INSERT INTO metric_registry (metric, last_value, last_refreshed) VALUES ('cf_changelog_open_proposals_14d', '7', '2026-10-26T09:01:00.746Z')");
  db.exec(BIRTH_TRIGGER); // from here on every filed issue is born with the vacuous contract, as live
  return db;
}
const fresh = () => seed(new DatabaseSync(":memory:"));
const apply = (db, sql = SQL) => db.exec(sql);

const PK = { agent_issues: "id", analytics_metric_triggers: "id", cloudflare_capability_catalog: "slug", ops_config: "key", email_filters: "id", emails: "id", control_registry: "control", fleet_agents: "id", management_personas: "persona_key", decision_log: "id", issue_triage: "issue_id", cf_changelog_items: "guid", fleet_tasks: "id", remediation_contracts: "class", failure_modes: "fm_key" };
function snap(db, skip = []) {
  const out = {};
  for (const [t, pk] of Object.entries(PK)) if (!skip.includes(t)) { out[t] = {}; for (const r of all(db, `SELECT * FROM ${t}`)) out[t][r[pk]] = JSON.stringify(r); }
  return out;
}
function changed(a, b, t) {
  const keys = new Set([...Object.keys(a[t]), ...Object.keys(b[t])]);
  return [...keys].filter((k) => a[t][k] !== b[t][k]).sort();
}
const same = (a, b, skip = []) => Object.keys(PK).filter((t) => !skip.includes(t) && changed(a, b, t).length).length === 0;
const contract = (db, cls) => one(db, "SELECT * FROM remediation_contracts WHERE class = ?", cls);
const issueByTitle = (db, t) => one(db, "SELECT * FROM agent_issues WHERE title = ?", t);

// The text of a function from its start to its closing brace (strings and comments skipped), so the extraction survives the function being reformatted over several lines.
function sliceFunction(src, start) {
  let i = src.indexOf("{", start), depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2) + 1; continue; }
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); continue; }
    if (c === '"' || c === "'" || c === "`") { for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error("applyFilters is not closed");
}

// ------------------------------------------------------------------ 0. the file itself
await section("0 the file itself", async () => {
  const stmts = SQL.split("\n").filter((l) => !l.startsWith("--")).join("\n");
  ok(/^-- APPLY-BY: ci$/m.test(SQL) && /^-- DB: qnfo-audit$/m.test(SQL), "header opts in: APPLY-BY ci, DB qnfo-audit");
  ok(/^-- Rollback: UPDATE /m.test(SQL), "a Rollback header line exists");
  ok(!/^\s*(DELETE\s+FROM|DROP\s)/im.test(stmts), "no statement deletes or drops (so no BACKUP header is needed)");
  ok(!/claude\.ai|anthropic\.com/i.test(SQL), "no claude.ai or anthropic.com link in a tracked file (cloudflare-only-host-guard)");
  ok(!/(secret|token|password|api[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}/i.test(SQL), "no secret value in the file");
  ok((stmts.match(/INSERT INTO decision_log/g) || []).length === 1, "exactly one decision_log INSERT statement");
  ok(!/(UPDATE|DELETE FROM)\s+decision_log/i.test(stmts), "decision_log is only appended to");
  ok(!/cadence_sla/.test(stmts), "the migration does not write cadence_sla: 3003 was fixed by CADENCE-SLA-CONTINUITY-1 (migrations/2026-10-26-cadence-sla-continuity.sql)");
  ok((stmts.match(/CREATE TABLE IF NOT EXISTS bak_20261026_sweep_a_/g) || []).length === 10, "ten bak_20261026_sweep_a_* tables are created in the file (nine before-state copies and the created-rows registry)");
  // the two third-party addresses: nowhere in the file (header, statements, Rollback), and one INSERT ... SELECT writes both filters from the emails table
  ok(!SQL.includes(SENDER_1104) && !SQL.includes(SENDER_1077) && !/[A-Za-z0-9._+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(SQL), "no e-mail address anywhere in the file");
  ok((stmts.match(/INSERT INTO email_filters/g) || []).length === 1 && /SELECT 'filter', 'sender', lower\(e\.sender\), 'spam', 50, 1 FROM emails e\s+WHERE e\.id IN \(1077, 1104\)/.test(stmts), "one INSERT ... SELECT writes both filters from the sender of emails 1077 and 1104");
  ok(!/COST-QUALITY-FLOOR-CLAUDE-1|MANAGEMENT-PERSONAS-SLA-1|MANAGEMENT-PERSONAS-PATH-B-1/.test(SQL), "the CLAUDE.md and the two management_personas follow-ups are not claimed anywhere (the personas fixes are in this file, the CLAUDE.md line has no code-loop doer)");
});

// ------------------------------------------------------------------ 1. every closing probe fails before and passes after
const pre = fresh();
const post = fresh();
const preSnap = snap(pre);
apply(post);
const postSnap = snap(post);
const stored = (cls) => contract(post, cls).verify_probe;
await section("1 every closing probe fails before and passes after", async () => {
  for (const k of Object.keys(P)) {
    const before = probe(pre, k), after = probe(post, k);
    ok(!before.passes, `probe ${k} does not pass on the pre-state`, before);
    if (k === "100405-record") ok(after.passes, `probe ${k} passes on the migrated state (the record exists; it is NOT the closing probe of 100405)`, after); else ok(after.passes, `probe ${k} passes on the migrated state`, after);
  }
  // the contract probes are read back from the migrated database: what the fleet will run is what is tested
  for (const cls of ["issue-1000100", "issue-1000102", "issue-1000186"]) {
    const sql = stored(cls);
    ok(!run(pre, sql).passes, `${cls}: the stored probe does not pass on the pre-state`, run(pre, sql));
    ok(run(post, sql).passes, `${cls}: the stored probe passes on the migrated state`, run(post, sql));
  }
  ok(!run(pre, stored(FM_CLASS)).passes && run(post, stored(FM_CLASS)).passes, "the detector probe fails on the pre-state (the ticket quotes the pattern) and passes after", [run(pre, stored(FM_CLASS)), run(post, stored(FM_CLASS))]);
});

// ------------------------------------------------------------------ 2. exactly the intended rows change
await section("2 exactly the intended rows change", async () => {
  const newIssueIds = Object.keys(postSnap.agent_issues).filter((k) => !(k in preSnap.agent_issues));
  const newClasses = newIssueIds.map((i) => "issue-" + i);
  const exp = {
    analytics_metric_triggers: ["2934"], cloudflare_capability_catalog: SLUGS, ops_config: [OPS_KEY], emails: ["1104"], control_registry: ["email-filter-journal-pitch-senders"],
    fleet_agents: Object.keys(PROMPTS).sort(), management_personas: [...PERSONAS.map((p) => p[0]), "program:QNFO.HALF"].sort(), decision_log: ["2"], issue_triage: [], cf_changelog_items: [],
    fleet_tasks: ["management-personas"], failure_modes: ["ticket-quotes-its-own-counted-marker"],
    agent_issues: ["99916", ...newIssueIds], remediation_contracts: ["issue-100405", "issue-1000100", "issue-1000102", "issue-1000186", FM_CLASS, ...newClasses],
  };
  for (const [t, keys] of Object.entries(exp)) ok(JSON.stringify(changed(preSnap, postSnap, t)) === JSON.stringify([...keys].sort()), `only the intended ${t} rows change`, { got: changed(preSnap, postSnap, t), want: keys });
  ok(newIssueIds.length === 3 && JSON.stringify(newIssueIds.map((i) => JSON.parse(postSnap.agent_issues[i]).title).sort()) === JSON.stringify(Object.values(TITLES).sort()), "exactly the three follow-up issues are filed, by title", newIssueIds.length);
  ok(changed(preSnap, postSnap, "email_filters").length === 2 && all(post, "SELECT id FROM email_filters WHERE id > 38").length === 2, "email_filters gains exactly two rows and no existing one changes");
});

// ------------------------------------------------------------------ 4. 99916: the ticket stops counting itself; the example query keeps its meaning
await section("4 99916: the ticket stops counting itself; the example query keeps its meaning", async () => {
  const countQ = "SELECT COUNT(*) n FROM agent_issues a WHERE a.status = 'open' AND (COALESCE(a.description, '') LIKE '%session-task:%' OR EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.owner LIKE 'session%'))";
  ok(one(pre, countQ).n === 4 && one(post, countQ).n === 3, "session_dependent_issues_open falls by exactly the ticket itself (4 -> 3), and the six new issues add none", { pre: one(pre, countQ).n, post: one(post, countQ).n });
  const d = (db) => one(db, "SELECT description FROM agent_issues WHERE id = 99916").description;
  const a = (db) => one(db, "SELECT action FROM analytics_metric_triggers WHERE id = 2934").action;
  ok(!d(post).includes("session-task:") && d(post).includes("'%session-task' || ':%'"), "ticket text holds the split literal, not the marker", d(post));
  ok(!a(post).includes("session-task:") && a(post).includes("'%session-task' || ':%'"), "trigger 2934 action holds the split literal, so a refile cannot count itself", a(post));
  ok(a(post).includes("a code-task: and code-anchor: line in place of its session-task line"), "the trigger's prose (session-task without a colon) is kept");
  const q = (txt) => txt.slice(txt.indexOf("SELECT a.id"), txt.indexOf("')", txt.indexOf("t.owner LIKE")) + 2);
  const rowsPre = all(pre, q(d(pre))).map((r) => r.id).sort((x, y) => x - y), rowsPost = all(post, q(d(post))).map((r) => r.id).sort((x, y) => x - y);
  ok(JSON.stringify(rowsPre) === JSON.stringify([2604, 100064, 99916, 777001].sort((x, y) => x - y)), "before: the quoted example query returns the ticket itself and the three other rows", rowsPre);
  ok(!rowsPost.includes(99916) && JSON.stringify(rowsPost) === JSON.stringify(rowsPre.filter((i) => i !== 99916)), "after: the rewritten example query returns the same rows minus the ticket", { rowsPre, rowsPost });
  ok(d(post).replace("'%session-task' || ':%'", "'%session-task:%'") === d(pre), "nothing else in the ticket text changed");
  ok(one(post, "SELECT description FROM agent_issues WHERE id = 777001").description === one(pre, "SELECT description FROM agent_issues WHERE id = 777001").description, "another issue that mentions the marker is not rewritten");
});

// ------------------------------------------------------------------ 5. 100388: seven Cloudflare catalog rows decided with a reason, none left undecided
await section("5 100388: seven Cloudflare catalog rows decided with a reason, none left undecided", async () => {
  const cat = (db) => Object.fromEntries(all(db, "SELECT * FROM cloudflare_capability_catalog").map((r) => [r.slug, r]));
  const b = cat(pre), a = cat(post);
  ok(a["cfc-artifacts"].status === "in_use" && a["cfc-artifacts"].linked_issue === 2967, "cfc-artifacts is in_use with linked_issue 2967 (qnfo-artifacts is live), not rejected", a["cfc-artifacts"]);
  for (const s of SLUGS.filter((x) => x !== "cfc-artifacts")) ok(a[s].status === "rejected", `${s} is rejected`, a[s].status);
  for (const s of SLUGS) {
    ok(a[s].when_to_choose.startsWith(b[s].when_to_choose + " | CF-CHANGELOG-DECIDE-1 2026-10-26 (agent_issues 100388): "), `${s}: the earlier text is kept and the decision is appended with its marker`);
    ok(a[s].when_to_choose.length > b[s].when_to_choose.length + 150, `${s}: a real reason is recorded`, a[s].when_to_choose.length - b[s].when_to_choose.length);
    ok(a[s].source === b[s].source && a[s].need === b[s].need && a[s].metric_ref === b[s].metric_ref && (s === "cfc-artifacts" || a[s].linked_issue === b[s].linked_issue), `${s}: source, need, metric_ref and (but for cfc-artifacts) linked_issue are not touched`);
  }
  ok(/Workers Trace Event Logpush/.test(a["cfc-logpush"].when_to_choose) && /already runs/.test(a["cfc-logpush"].when_to_choose), "cfc-logpush records that the Workers Trace Event variant is already in use");
  ok(/closed beta/.test(a["cfc-monetization-gateway"].when_to_choose) && /OPEN-ACCESS-1/.test(a["cfc-monetization-gateway"].when_to_choose), "monetization gateway: closed beta and OPEN-ACCESS-1");
  ok(/re-rejected/.test(a["data-pipelines"].when_to_choose) && /re-rejected/.test(a["sandbox"].when_to_choose) && /RULE-8-RETIRED-1/.test(a["sandbox"].when_to_choose), "data-pipelines and sandbox are re-rejected with their updated reasons");
  for (const s of ["media-products", "observability", "workflows"]) ok(JSON.stringify(a[s]) === JSON.stringify(b[s]), `unrelated catalog row ${s} is untouched`);
  ok(a["workflows"].status === "proposed", "an unrelated proposed row stays proposed (the migration decides only the seven)");
  const n = (db) => one(db, "SELECT COUNT(DISTINCT i.slug) n FROM cf_changelog_items i JOIN cloudflare_capability_catalog c ON c.slug = i.slug WHERE i.action IN ('reopened','new-row') AND c.status IN ('not_considered','proposed') AND replace(substr(i.seen_at,1,19),'T',' ') < datetime('now','-14 days')").n;
  ok(n(pre) === 7 && n(post) === 0, "the trigger-1204 query reads 7 before and 0 after", { pre: n(pre), post: n(post) });
});

// ------------------------------------------------------------------ 6. 100405: the owner's words, verbatim, recorded as what it is (a record nothing enforces yet)
await section("6 100405: the owner's words, verbatim, recorded as a record that nothing enforces yet", async () => {
  const r = one(post, `SELECT value, note FROM ops_config WHERE key = '${OPS_KEY}'`);
  let j = null; try { j = JSON.parse(r.value); } catch (e) { /* asserted below */ }
  ok(j && j.id === "COST-QUALITY-FLOOR-1" && j.date === "2026-10-21", "the value is JSON with the id and date", r.value && r.value.slice(0, 80));
  const m = /to the card code:ct_hoq2y5kjmyf7lp: (.*?) Definition of done:/s.exec(DESC_100405);
  ok(m && j && j.directive_verbatim === m[1], "directive_verbatim equals the owner's note text read from agent_issues 100405", { want: m && m[1], got: j && j.directive_verbatim });
  ok(j && /^none: recorded only/.test(j.enforced_by) && /no loop reads/.test(j.enforced_by), "enforced_by says none: recorded only, no loop reads the key", j && j.enforced_by);
  ok(j && !("carried_by" in j) && !("reading" in j) && typeof j.intended === "string" && /BUDGET-SOFT-ROUTE-1/.test(j.intended) && /v_output_quality_headline/.test(j.intended), "no carried_by or reading claim; an intended field states what enforcement will be");
  ok(j && /COST-QUALITY-FLOOR-ENFORCE-1/.test(j.follow_up) && /COST-QUALITY-FLOOR-DOC-1/.test(j.follow_up) && !/CLAUDE/.test(j.follow_up + r.note) && /OWNER-NOTE-46/.test(j.source) && /100405/.test(j.source) && /not the owner/.test(j.limits), "follow-up, source and the labelled limits are recorded");
  ok(/RECORD ONLY/.test(r.note) && /nothing enforces it yet/.test(r.note) && !/honor/i.test(r.note) && /COST-QUALITY-FLOOR-ENFORCE-1/.test(r.note), "the note says no loop honors the key yet and names the enforcement issue", r.note);
  // the contract of issue 100405 must not close on the record alone
  const c100405 = stored("issue-100405");
  ok(run(post, c100405).observed === "recorded-only" && !run(post, c100405).passes, "the 100405 contract does not pass while the key exists and the enforcement issue is open", run(post, c100405));
  const closed = fresh(); apply(closed);
  closed.prepare("UPDATE agent_issues SET status = 'closed' WHERE title = ?").run(TITLES.enforce);
  ok(run(closed, c100405).passes, "the 100405 contract passes once the enforcement issue is closed (key present)", run(closed, c100405));
  closed.prepare("DELETE FROM ops_config WHERE key = ?").run(OPS_KEY);
  ok(!run(closed, c100405).passes, "and not when the key is missing, whatever the issue status", run(closed, c100405));
});

// ------------------------------------------------------------------ 7. 1000100 / the decision row
await section("7 1000100 / the decision row", async () => {
  const d = all(post, "SELECT * FROM decision_log WHERE instr(action, 'SWEEP-DATA-FIXES-A-1:') = 1");
  ok(d.length === 1, "exactly one SWEEP-DATA-FIXES-A-1 decision row", d.length);
  const r = d[0];
  for (const c of ["actor", "assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "reach_gain", "surfaces_tested"]) ok(typeof r[c] === "string" && r[c].length > 0, `decision_log.${c} is filled`);
  ok(/op-mvn8obo496f4/.test(r.evidence) && /no write or dispatch tool/.test(r.assumption) && /server-side action carriers/.test(r.assumption), "the 1000100 record names the prompt, the missing tool and the carriers");
  for (const i of ["99916", "100388", "100405", "1000100", "1000102", "1000186"]) ok(r.action.includes(i), `the action names issue ${i}`);
  ok(!/@/.test([r.actor, r.assumption, r.action, r.evidence, r.outcome, r.blast_radius, r.rollback_path, r.capability_gain, r.predicted_outcome, r.reach_gain, r.surfaces_tested].join("\n")), "no e-mail address anywhere in the decision row");
  ok(/senders of emails 1077 and 1104/.test(r.action), "the row names the senders by email id");
  ok(/sla_min 240 -> 120/.test(r.action) && /path_b corrected/.test(r.action), "the action text names both management_personas fixes");
  ok(/rm-research only/.test(r.action) && /rc-agent-request, red-agent-request, parked-agent-request and lever-request/.test(r.action) && /not covered/.test(r.action), "the action says the hard limits are scoped to the roadmap-proposal prompt and names the steps that are not covered");
  ok(/rc-agent-request, red-agent-request, parked-agent-request and lever-request are not covered/.test(r.capability_gain) && /roadmap-proposal/.test(r.assumption), "capability_gain and the assumption carry the same scope");
  ok(!/CLAUDE-1|MANAGEMENT-PERSONAS-SLA|PATH-B-1|\b19\b/.test([r.assumption, r.action, r.evidence, r.capability_gain].join("\n")), "the row claims no dropped follow-up and carries no count of counted issues");
  // the wording says what is true: enforced where, not enforced where
  ok(/skipped while an ai_spend cap is breached/.test(r.assumption) && /management-personas workflow prompt that runs/.test(r.assumption), "the assumption says the dashboard narrative is skipped at a breached cap and the workflow prompt is what runs");
  ok(/PSR-NARRATIVE-CAP-SOFT-1/.test(r.capability_gain) && /nothing enforces yet/.test(r.capability_gain) && /COST-QUALITY-FLOOR-ENFORCE-1/.test(r.capability_gain), "capability_gain names the unenforced directive and the narrative gap, and claims no more");
  ok(!/loops? (honor|read)s? (it|the key)/i.test(r.capability_gain), "capability_gain does not claim a loop honors the directive");
  ok(/^[a-z0-9_]+ (<=|<|>=|>|=) [0-9.]+ within [0-9]+ hours$/.test(r.predicted_outcome), "predicted_outcome has the form the decision_predictions_parse trigger reads", r.predicted_outcome);
  const p = all(post, "SELECT * FROM decision_predictions");
  ok(p.length === 1 && p[0].subject === "cf_changelog_open_proposals_14d" && p[0].op === "<=" && p[0].value === 0 && p[0].decision_id === r.id, "the live parse trigger turns it into one metric prediction", p);
  ok(one(post, "SELECT COUNT(*) n FROM decision_log").n === 2, "the earlier decision_log row is untouched and one row is appended");
});

// ------------------------------------------------------------------ 8. 1000102: the two senders are blocked at ingest; no other email row moves
await section("8 1000102: the two senders are blocked at ingest; no other email row moves", async () => {
  const f = all(post, "SELECT rule_type, field, pattern, action, priority, enabled FROM email_filters WHERE id > 38 ORDER BY pattern");
  ok(JSON.stringify(f) === JSON.stringify([
    { rule_type: "filter", field: "sender", pattern: SENDER_1077, action: "spam", priority: 50, enabled: 1 },
    { rule_type: "filter", field: "sender", pattern: SENDER_1104, action: "spam", priority: 50, enabled: 1 }].sort((x, y) => (x.pattern < y.pattern ? -1 : 1))), "two enabled sender filters, spam, priority 50 (the row qnfo-email's own block path writes)", f.map((x) => x.field + "/" + x.priority));
  ok(one(post, "SELECT status FROM emails WHERE id = 1104").status === "spam", "email 1104 is spam");
  for (const id of [966, 1077, 1105, 1150, 1200]) ok(JSON.stringify(one(pre, "SELECT * FROM emails WHERE id = ?", id)) === JSON.stringify(one(post, "SELECT * FROM emails WHERE id = ?", id)), `email ${id} is not touched (1150 and 1200 come from the same sender)`);
  const c = one(post, "SELECT kind, disposition, disposition_state, issue_id, critical_path, location, guards_against, alternate_path, evidence FROM control_registry WHERE control = 'email-filter-journal-pitch-senders'");
  ok(c && c.kind === "filter" && c.disposition === "keep" && c.disposition_state === "applied" && c.issue_id === 1000102, "control_registry records the filter (DOCTRINE-1)", c);
  ok(c && !/@/.test(Object.values(c).join(" ")), "the control_registry row carries no e-mail address");
  // the filter pattern is the lower-cased sender of the email, whatever its case
  const mixed = fresh(); mixed.prepare("UPDATE emails SET sender = ? WHERE id = 1104").run(SENDER_1104.toUpperCase()); apply(mixed);
  ok(all(mixed, "SELECT pattern FROM email_filters WHERE id > 38").map((x) => x.pattern).sort().join() === [SENDER_1077, SENDER_1104].sort().join(), "the filter pattern is the lowercase sender even when the email row holds it in capitals");
  // a guard on the email: the same id with another subject is not moved
  const other = fresh(); other.prepare("UPDATE emails SET subject = 'something else' WHERE id = 1104").run(); apply(other);
  ok(one(other, "SELECT status FROM emails WHERE id = 1104").status === "processed", "email 1104 is moved only while it is the processed mail with the expected subject");
  // behaviour: qnfo-email's own applyFilters (extracted from the worker source) reads the new rows
  const worker = readFileSync(new URL("../qnfo-email/worker.js", import.meta.url), "utf8");
  const start = /^(?:async )?function applyFilters\(/m.exec(worker);
  ok(!!start, "applyFilters is found in qnfo-email/worker.js");
  if (start) {
    const applyFilters = new Function(sliceFunction(worker, start.index) + "\nreturn applyFilters;")();
    const ad = (db) => ({ prepare: (sql) => ({ all: async () => ({ results: db.prepare(sql).all() }) }) });
    const runF = async (db, from) => (await applyFilters(ad(db), from, "rowan.quni@qnfo.org", "Details for research authors", "hello")).action;
    ok((await runF(pre, "Sender <" + SENDER_1104 + ">")) === "process" && (await runF(pre, SENDER_1077)) === "process", "before: mail from the two senders is processed, not filed as spam");
    ok((await runF(post, "Sender <" + SENDER_1104 + ">")) === "spam" && (await runF(post, SENDER_1077)) === "spam", "after: qnfo-email applyFilters files both senders as spam");
    ok((await runF(post, "someone.else@example.org")) === "process" && (await runF(post, "rowan.quni@qnfo.org")) === "accept", "after: another sender is still processed and the owner is still accepted");
  }
});

// ------------------------------------------------------------------ 9. 1000186: each rule once, only where absent; cadence text matches what runs
await section("9 1000186: each rule once, only where absent; cadence text matches what runs", async () => {
  const pr = (db) => Object.fromEntries(all(db, "SELECT id, system_prompt, version FROM fleet_agents").map((r) => [r.id, r]));
  const b = pr(pre), a = pr(post);
  for (const id of Object.keys(PROMPTS)) {
    ok(count(a[id].system_prompt, "NO-JOURNALS-1") === 1 && count(a[id].system_prompt, "PERSONAL-QNFO-SEPARATION-1") === 1, `${id}: each rule appears exactly once`, [count(a[id].system_prompt, "NO-JOURNALS-1"), count(a[id].system_prompt, "PERSONAL-QNFO-SEPARATION-1")]);
    ok(!a[id].system_prompt.includes(PROG_CAD) && !a[id].system_prompt.includes(PM_CAD) && /Cadence: every hour at :35 \(fleet_tasks management-personas\)/.test(a[id].system_prompt) && !a[id].system_prompt.includes(".."), `${id}: the stale cadence sentence is replaced whole (no doubled full stop)`);
    ok(a[id].version > b[id].version, `${id}: version is raised`, [b[id].version, a[id].version]);
  }
  ok(a["program-manager:QNFO.PERSONAL"].system_prompt.indexOf("PERSONAL-QNFO-SEPARATION-1") === b["program-manager:QNFO.PERSONAL"].system_prompt.indexOf("PERSONAL-QNFO-SEPARATION-1"), "QNFO.PERSONAL keeps its own separation mention and gets the journals rule alone");
  ok(a["program-manager:QNFO.PERSONAL"].system_prompt.endsWith("(NO-JOURNALS-1)."), "the journals rule is appended after the existing text");
  ok(a["program-manager:QNFO.OPS"].system_prompt.includes(" Hard limit: personal-api work is never cross-pollinated into research endpoints (PERSONAL-QNFO-SEPARATION-1)."), "the separation rule is appended to a persona that lacked it");
  ok(a["portfolio-manager"].system_prompt.startsWith("The QNFO portfolio manager persona (PORTFOLIO-MANAGER-1, 2026-10-25)") && a["portfolio-manager"].system_prompt.includes("Mondays after 06:00Z"), "the portfolio manager prompt keeps its start and states the real Monday rule");
  ok(JSON.stringify(a["some-other-agent"]) === JSON.stringify(b["some-other-agent"]), "an unrelated agent prompt is untouched");
  const da = Object.fromEntries(all(post, "SELECT persona_key, decision_authority FROM management_personas").map((r) => [r.persona_key, r.decision_authority]));
  for (const [k, lvl] of PERSONAS) {
    const was = lvl === "portfolio" ? AUTH_PORTFOLIO : AUTH_PROGRAM;
    ok(da[k].startsWith(was) && count(da[k], "NO-JOURNALS-1") === 1 && count(da[k], "PERSONAL-QNFO-SEPARATION-1") === 1, `${k}: decision_authority keeps its text and gains each rule once`);
  }
  ok(all(post, "SELECT persona_key, level, scope, path_a, charter, kpis, status FROM management_personas").every((r, i) => JSON.stringify(r) === JSON.stringify(all(pre, "SELECT persona_key, level, scope, path_a, charter, kpis, status FROM management_personas")[i])), "management_personas columns other than decision_authority, sla_min and path_b are untouched");
  // a prompt that already carries one rule gets the other only
  const part = fresh();
  part.prepare("UPDATE fleet_agents SET system_prompt = system_prompt || ' Earlier edit: journals go nowhere (NO-JOURNALS-1).' WHERE id = 'portfolio-manager'").run();
  part.prepare("UPDATE management_personas SET decision_authority = decision_authority || '; never to journals (NO-JOURNALS-1)' WHERE persona_key = 'portfolio:fleet'").run();
  apply(part);
  const pm = one(part, "SELECT system_prompt FROM fleet_agents WHERE id = 'portfolio-manager'").system_prompt;
  ok(count(pm, "NO-JOURNALS-1") === 1 && count(pm, "PERSONAL-QNFO-SEPARATION-1") === 1, "a prompt that already names NO-JOURNALS-1 is not given it twice", [count(pm, "NO-JOURNALS-1"), count(pm, "PERSONAL-QNFO-SEPARATION-1")]);
  const pf = one(part, "SELECT decision_authority FROM management_personas WHERE persona_key = 'portfolio:fleet'").decision_authority;
  ok(count(pf, "NO-JOURNALS-1") === 1 && count(pf, "PERSONAL-QNFO-SEPARATION-1") === 1, "the same holds for decision_authority");
});

// ------------------------------------------------------------------ 17. management_personas: sla_min within QUEUE-SLA-1, path_b names the writers that exist
await section("17 management_personas sla_min and path_b", async () => {
  const rows = (db) => Object.fromEntries(all(db, "SELECT persona_key, sla_min, path_b, updated_at FROM management_personas").map((r) => [r.persona_key, r]));
  const b = rows(pre), a = rows(post);
  const NEWB = "qnfo-fleet-dashboard daily portfolio rollup (PORTFOLIO-STRATEGIC-2) and weekly review (PORTFOLIO-STRATEGIC-1) recompute scorecards; POST /api/portfolio/strategic";
  for (const [k] of PERSONAS) ok(b[k].sla_min === 240 && a[k].sla_min === 120 && b[k].path_b === PATH_B && a[k].path_b === NEWB, `${k}: sla_min 240 -> 120 and path_b names both writers`, [a[k].sla_min, a[k].path_b]);
  ok(a["program:QNFO.HALF"].sla_min === 90 && a["program:QNFO.HALF"].path_b === NEWB, "a row at or under 120 minutes keeps its sla_min while its path_b is still corrected");
  ok(JSON.stringify(a["program:QNFO.OTHER"]) === JSON.stringify(b["program:QNFO.OTHER"]), "a row with neither defect is not touched at all (updated_at included)");
  ok(!Object.values(a).some((r) => (r.path_b || "").includes("recomputes scorecards")) && Object.values(a).every((r) => r.sla_min <= 120), "no row keeps the old wording or an SLA above 120 minutes");
  const meta = all(post, "SELECT persona_key, sla_min, path_b FROM bak_20261026_sweep_a_personas_meta ORDER BY persona_key");
  ok(meta.length === 7 && meta.every((r) => r.path_b === PATH_B) && meta.filter((r) => r.sla_min === 240).length === 6 && !meta.some((r) => r.persona_key === "program:QNFO.OTHER"), "the before-state copy holds the seven rows that had a defect, with their old values, and not the clean one", meta.length);
  // the Rollback restores both columns from the copy
  const rb = /^-- Rollback: (.*)$/m.exec(SQL);
  const back = fresh(); apply(back); back.exec(rb[1]);
  ok(JSON.stringify(rows(back)) === JSON.stringify(b), "the Rollback line gives sla_min, path_b and updated_at back for every persona row");
  // each UPDATE guards on its own defect: a row with only one of them changes only that column
  const one1 = fresh(); one1.exec("UPDATE management_personas SET sla_min = 120"); apply(one1);
  ok(Object.values(rows(one1)).filter((r) => r.path_b === NEWB).length === 7 && Object.values(rows(one1)).every((r) => r.sla_min <= 120), "with sla_min already fixed only path_b is rewritten");
  const one2 = fresh(); one2.prepare("UPDATE management_personas SET path_b = ?").run(NEWB); apply(one2);
  ok(Object.values(rows(one2)).filter((r) => r.sla_min === 120).length === 6 && rows(one2)["program:QNFO.HALF"].sla_min === 90, "with path_b already fixed only sla_min is lowered");
});

// ------------------------------------------------------------------ 13. 1000186: the prompt that runs (fleet_tasks management-personas) carries the two hard limits
await section("13 the management-personas workflow prompt carries the hard limits", async () => {
  const w = (db, id = "management-personas") => one(db, "SELECT definition, version, updated_at FROM fleet_tasks WHERE id = ?", id);
  const b = w(pre), a = w(post);
  ok(count(b.definition, ANCHOR) === 1 && !b.definition.includes("NO-JOURNALS-1"), "fixture: the anchor occurs once and the limits are absent before");
  let doc = null; try { doc = JSON.parse(a.definition); } catch (e) { /* asserted */ }
  ok(!!doc && Array.isArray(doc.steps) && doc.steps.length === 3, "the definition is still valid JSON with its three steps");
  const i = a.definition.indexOf("Hard limits: never propose"), j = a.definition.indexOf(ANCHOR);
  ok(i > 0 && j > i && count(a.definition, ANCHOR) === 1, "the sentence sits before the anchor, which still occurs once");
  const sentence = a.definition.slice(i, j);
  ok(sentence.endsWith(". ") && !/['"\\;]/.test(sentence), "the inserted text has no apostrophe, double quote, backslash or semicolon (it sits inside a JSON string and a SQL literal)", sentence);
  ok(a.definition.replace(sentence, "") === b.definition, "removing exactly that sentence gives the old definition back (nothing else changed)");
  ok(count(sentence, "NO-JOURNALS-1") === 1 && count(sentence, "PERSONAL-QNFO-SEPARATION-1") === 1 && /papers\.qnfo\.org/.test(sentence) && /journal submission/.test(sentence) && /personal-api/.test(sentence), "the sentence states both rules once");
  const step = doc && doc.steps.find((s) => s.name === "rm-research");
  ok(step && step.sql.includes(sentence + ANCHOR) && doc.steps.find((s) => s.name === "lever-request").sql === JSON.parse(b.definition).steps[2].sql, "the limits are in the rm-research prompt and the other steps are unchanged");
  ok(a.version === b.version + 1 && a.updated_at !== b.updated_at, "version is raised by one", [b.version, a.version]);
  ok(JSON.stringify(w(pre, "other-workflow")) === JSON.stringify(w(post, "other-workflow")), "another workflow that happens to hold the anchor is not touched");
  // guards: already named, anchor twice, anchor absent
  const named = fresh(); named.prepare("UPDATE fleet_tasks SET definition = replace(definition, 'ONE new feature', 'ONE new feature (NO-JOURNALS-1 already stated)') WHERE id = 'management-personas'").run();
  const twice = fresh(); twice.prepare("UPDATE fleet_tasks SET definition = definition || ?  WHERE id = 'management-personas'").run(JSON.stringify({ more: ANCHOR }));
  const none = fresh(); none.prepare("UPDATE fleet_tasks SET definition = replace(definition, ?, 'Reply in the following form:') WHERE id = 'management-personas'").run(ANCHOR);
  for (const [name, db] of [["already names NO-JOURNALS-1", named], ["holds the anchor twice", twice], ["holds no anchor", none]]) {
    const before = w(db); apply(db);
    ok(JSON.stringify(before) === JSON.stringify(w(db)), `a definition that ${name} is left alone`);
  }
});

// ------------------------------------------------------------------ 14. the issue contracts measure their condition
await section("14 the issue contracts of 100405, 1000100, 1000102 and 1000186 measure their condition", async () => {
  for (const cls of ["issue-100405", "issue-1000100", "issue-1000102", "issue-1000186"]) {
    const b = contract(pre, cls), a = contract(post, cls);
    ok(a.status === "active" && a.verify_transport === "d1-query" && a.last_verdict === null && a.attempts === 0 && a.deferred_since === null && a.next_due_at !== null, `${cls}: active, d1-query, cleared verdict, due now`, [a.status, a.last_verdict, a.next_due_at]);
    ok(!a.action.startsWith("VACUOUS-PROBE-V3-1") && /MEASURES/.test(a.action) && a.verify_probe !== b.verify_probe, `${cls}: the vacuous probe and its action text are replaced`);
    ok(!/;/.test(a.verify_probe) && !/@/.test(a.verify_probe + a.action) && !/FROM agent_issues WHERE id = (100405|1000100|1000102|1000186)\b/.test(a.verify_probe), `${cls}: no semicolon (the live trigger would rewrite it), no address, and it does not read its own issue's status`, a.verify_probe.slice(0, 120));
    ok(a.module === b.module && a.max_attempts === b.max_attempts && a.escalate_to === b.escalate_to && a.class === b.class, `${cls}: module, max_attempts and escalation are not touched`);
  }
  ok(/found_action/.test(contract(pre, "issue-100405").verify_probe) && /code_tasks/.test(contract(pre, "issue-100405").verify_probe) && /enforced/.test(stored("issue-100405")) && /COST-QUALITY-FLOOR-ENFORCE-1/.test(stored("issue-100405")), "100405: the any-code-task probe is replaced by the enforcement probe");
  ok(/fleet_tasks/.test(stored("issue-1000186")) && /NO-JOURNALS-1/.test(stored("issue-1000186")), "1000186: the probe reads the workflow definition as well as the persona rows");
  // 1000186 enforcement: removing the sentence from the workflow makes the probe fail again
  const lost = fresh(); apply(lost);
  ok(run(lost, stored("issue-1000186")).passes, "1000186: passes with the sentence in place");
  lost.prepare("UPDATE fleet_tasks SET definition = replace(definition, 'Hard limits: never propose', 'Soft limits: never propose'), version = version + 1 WHERE id = 'management-personas'").run();
  lost.prepare("UPDATE fleet_tasks SET definition = replace(definition, '(NO-JOURNALS-1)', '(n)') WHERE id = 'management-personas'").run();
  ok(!run(lost, stored("issue-1000186")).passes, "1000186: fails again when a later rewrite of the workflow loses the limit");
  // each limit on its own: losing only one of the two tokens from the workflow definition fails the probe
  for (const [tok, what] of [["PERSONAL-QNFO-SEPARATION-1", "the separation rule"], ["NO-JOURNALS-1", "the journals rule"]]) {
    const one1 = fresh(); apply(one1);
    ok(run(one1, stored("issue-1000186")).passes, `1000186: passes before ${what} is lost`);
    one1.prepare("UPDATE fleet_tasks SET definition = replace(definition, ?, 'x') WHERE id = 'management-personas'").run("(" + tok + ")");
    ok(!run(one1, stored("issue-1000186")).passes, `1000186: fails when only ${what} is lost from the workflow definition`, run(one1, stored("issue-1000186")));
  }
  // a probe a doer wrote by hand is left alone
  const hand = fresh();
  hand.prepare("UPDATE remediation_contracts SET verify_probe = 'SELECT ''x'' AS expected, ''x'' AS observed', action = 'a doer wrote this by hand' WHERE class = 'issue-1000100'").run(); // still superseded: only the vacuous marker protects it
  const bh = contract(hand, "issue-1000100"); apply(hand);
  ok(JSON.stringify(bh) === JSON.stringify(contract(hand, "issue-1000100")), "a contract whose vacuous marker is gone (a hand-written probe) is left alone");
  // issue-100405 (active live) is guarded twice, by the vacuous marker and by the found_action probe: each guard alone must hold
  const hand5a = fresh(); // the probe was rewritten by hand but the action text still carries the vacuous marker
  hand5a.prepare("UPDATE remediation_contracts SET verify_probe = 'SELECT ''x'' AS expected, ''x'' AS observed' WHERE class = 'issue-100405'").run();
  const b5a = contract(hand5a, "issue-100405"); apply(hand5a);
  ok(JSON.stringify(b5a) === JSON.stringify(contract(hand5a, "issue-100405")), "issue-100405: a hand-written probe under the old action text is left alone (the found_action guard)");
  const hand5b = fresh(); // the action text was rewritten by hand but the probe is still the any-code-task probe
  hand5b.prepare("UPDATE remediation_contracts SET action = 'a doer wrote this by hand' WHERE class = 'issue-100405'").run();
  const b5b = contract(hand5b, "issue-100405"); apply(hand5b);
  ok(JSON.stringify(b5b) === JSON.stringify(contract(hand5b, "issue-100405")), "issue-100405: a hand-written action text over the old probe is left alone (the vacuous-marker guard)");
});

// ------------------------------------------------------------------ 15. the follow-ups promised in prose are filed, each with a doer and a probe
await section("15 follow-up issues with a doer and a probe", async () => {
  const marker = /session-task:/;
  for (const [k, t] of Object.entries(TITLES)) {
    const rows = all(post, "SELECT * FROM agent_issues WHERE title = ?", t);
    ok(rows.length === 1 && rows[0].status === "open", `${k}: filed once and open`, rows.length);
    const d = rows[0] ? rows[0].description : "";
    ok(/\nDoer: /.test(d) && /Definition of done: /.test(d), `${k}: names its doer and its definition of done`);
    ok(!marker.test(d), `${k}: the text does not contain the marker the session-dependent metric counts`);
    ok(!/@/.test(d), `${k}: no e-mail address in the text`);
    const lines = d.split("\n");
    const task = lines.find((l) => l.startsWith("code-task: ")), anchor = lines.find((l) => l.startsWith("code-anchor: ")), cp = lines.find((l) => l.startsWith("code-probe: {"));
    if (task) ok(/^code-task: repo=qnfo-workers path=[A-Za-z0-9._\/-]+$/.test(task), `${k}: a well-formed code-task line`, task);
    ok(!!task && !!anchor, `${k}: a code-task line and a code-anchor line`);
    if (["enforce", "narrative", "doc"].includes(k)) ok(!!anchor && anchor.length > "code-anchor: ".length + 20, `${k}: a code-anchor line follows the code-task line`);
    if (cp) { let j = null; try { j = JSON.parse(cp.slice("code-probe: ".length)); } catch (e) { /* asserted */ } ok(j && Array.isArray(j.paths) && j.paths.length === 1 && (typeof j.contains === "string") !== (typeof j.absent === "string"), `${k}: the code-probe line is JSON with one path and exactly one of contains or absent`, cp); }
    ok(!!cp, `${k}: it carries a code-probe line`);
  }
  const e = issueByTitle(post, TITLES.enforce).description;
  ok(/OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1/.test(e) && issueByTitle(post, TITLES.enforce).priority === "high", "the enforcement issue ties itself to the directive record and is high priority");
  ok(/\(1\) spendGovern, the route-level decision/.test(e) && /\(2\) spendGovernWA, the Workers AI chokepoint/.test(e) && /\(3\) the FLEET-CAP-STEER-1 twin switch \(ops_config ai_fleet_cap_steer, FLEET_STEER_SWITCH, fleetSteerDecide\)/.test(e) && /all three downgrade points/.test(e), "the enforcement issue covers all three downgrade points, each named in its own clause: spendGovern, spendGovernWA and the fleet cap steer switch");
  ok(/path=qnfo-ai\/worker\.js/.test(e) && /code-anchor: else if \(d\.action === "downgrade"\) spendRecord/.test(e), "the code-task stays on qnfo-ai/worker.js with its single-occurrence anchor");
  ok(/the doer creates qnfo-ai\/quality-floor\.test\.mjs/.test(e) && /must assert for each of the three points/.test(e) && /lifted when worse > 0/.test(e) && /does not close this issue/.test(e), "the text says the doer creates the suite and what it must assert");
  const ecp = JSON.parse(e.split("\n").find((l) => l.startsWith("code-probe: ")).slice("code-probe: ".length));
  ok(ecp.paths.length === 1 && ecp.paths[0] === "qnfo-ai/quality-floor.test.mjs" && ecp.contains === "spendGovernWA" && !("absent" in ecp), "the code-probe needs the suite that names spendGovernWA, not a string in worker.js", ecp);
  const n = issueByTitle(post, TITLES.narrative).description;
  ok(/psrNarrativeAllowed/.test(n) && /BUDGET-SOFT-ROUTE-1/.test(n) && /660\.09/.test(n), "the narrative issue names psrNarrativeAllowed, the rule it contradicts and the measured cap breach");
  const ncp = JSON.parse(n.split("\n").find((l) => l.startsWith("code-probe: ")).slice("code-probe: ".length));
  ok(ncp.paths[0] === "qnfo-fleet-dashboard/worker.js" && ncp.absent === "if (narrativeAllowed) {" && !("contains" in ncp), "the narrative code-probe is the absence of the gate itself, if (narrativeAllowed) {", ncp);
  ok(/rm-research/.test(n) && /rc-agent-request, red-agent-request, parked-agent-request and lever-request/.test(n) && /not covered/.test(n), "the narrative issue states the scope of the hard limits: the roadmap-proposal prompt only");
  const d3 = issueByTitle(post, TITLES.doc).description;
  ok(/docs\/\*\*\.md is inside the code loop/.test(d3) && /path=docs\/AUTONOMOUS-OPERATION-DOCTRINE\.md/.test(d3), "the doctrine issue names its doer: docs/**.md is inside the code loop's merge scope");
  // the three new issues add nothing to the metric that counts the marker
  ok(one(post, "SELECT COUNT(*) n FROM agent_issues WHERE status = 'open' AND instr(description, 'session-task:') > 0").n === 2, "the open issues containing the marker are the two real ones of the fixture, no new issue adds one");
  // the contracts of the three issues come from their code-probe lines (the line is the contract), so no d1-query contract is written for them
  ok(Object.values(TITLES).every((t) => !all(post, "SELECT 1 FROM remediation_contracts WHERE class = ? AND precondition = 'SWEEP-DATA-FIXES-A-1'", "issue-" + issueByTitle(post, t).id).length), "no d1-query contract is written for the three code-probe issues (their probe is the line)");
});

// ------------------------------------------------------------------ 16. the failure mode and its detector
await section("16 failure mode: a ticket quotes the marker its own metric counts", async () => {
  const fm = one(post, "SELECT * FROM failure_modes WHERE fm_key = 'ticket-quotes-its-own-counted-marker'");
  ok(fm && fm.issue_id === 99916 && fm.probe_class === FM_CLASS && fm.first_seen === "2026-10-26" && ["failure_mode", "root_cause", "remediation", "detector", "trigger_condition", "symptom", "blast_radius"].every((c) => fm[c] && fm[c].length > 20), "the failure mode is recorded with root cause, remediation, detector, trigger, symptom and blast radius", fm && fm.fm_key);
  const c = contract(post, FM_CLASS);
  ok(c && c.status === "active" && c.verify_transport === "d1-query" && c.issue_id === null && c.action === "failure-mode detector" && c.module === "failure-mode" && !/;/.test(c.verify_probe), "the detector contract is an active d1-query failure-mode contract without a semicolon", c && [c.status, c.verify_transport]);
  // the detector fires on a recurrence in either place
  const again = fresh(); apply(again);
  again.prepare("UPDATE agent_issues SET description = description || ? WHERE id = 5000").run(" and the query uses LIKE '%session-task:%'");
  ok(run(again, c.verify_probe).observed === "1", "an open issue that quotes the LIKE pattern is counted", run(again, c.verify_probe));
  again.prepare("UPDATE analytics_metric_triggers SET action = action || ? WHERE id = 1204").run(" (see LIKE '%session-task:%')");
  ok(run(again, c.verify_probe).observed === "2", "a trigger action that quotes it is counted too", run(again, c.verify_probe));
  again.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 5000").run();
  ok(run(again, c.verify_probe).observed === "1", "a closed issue is not counted", run(again, c.verify_probe));
});

// ------------------------------------------------------------------ 10. idempotence: a second apply changes nothing
await section("10 idempotence: a second apply changes nothing", async () => {
  const twice = fresh();
  apply(twice); const s1 = snap(twice);
  const bakBefore = JSON.stringify(all(twice, "SELECT name FROM sqlite_master WHERE name LIKE 'bak_20261026_sweep_a_%' ORDER BY name"));
  const createdBefore = JSON.stringify(all(twice, "SELECT tbl, pk FROM bak_20261026_sweep_a_created ORDER BY tbl, pk"));
  apply(twice); const s2 = snap(twice);
  ok(same(s1, s2), "second apply changes no row in any table", Object.keys(PK).filter((t) => changed(s1, s2, t).length));
  ok(JSON.stringify(s1) === JSON.stringify(s2), "the full snapshot is identical after the second apply");
  ok(one(twice, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'SWEEP-DATA-FIXES-A-1:') = 1").n === 1 && one(twice, "SELECT COUNT(*) n FROM decision_predictions").n === 1, "one decision row and one prediction after two applies");
  ok(bakBefore === JSON.stringify(all(twice, "SELECT name FROM sqlite_master WHERE name LIKE 'bak_20261026_sweep_a_%' ORDER BY name")) && JSON.parse(bakBefore).length === 10, "ten backup tables, unchanged by the second apply");
  ok(createdBefore === JSON.stringify(all(twice, "SELECT tbl, pk FROM bak_20261026_sweep_a_created ORDER BY tbl, pk")), "the created-rows registry is unchanged by the second apply");
  ok(one(twice, "SELECT COUNT(*) n FROM bak_20261026_sweep_a_fleet_agents").n === 6 && one(twice, "SELECT COUNT(*) n FROM bak_20261026_sweep_a_cf_catalog").n === 7 && one(twice, "SELECT COUNT(*) n FROM bak_20261026_sweep_a_emails").n === 1 && one(twice, "SELECT COUNT(*) n FROM bak_20261026_sweep_a_personas").n === 6 && one(twice, "SELECT COUNT(*) n FROM bak_20261026_sweep_a_workflow").n === 1 && one(twice, "SELECT COUNT(*) n FROM bak_20261026_sweep_a_contracts").n === 4 && one(twice, "SELECT COUNT(*) n FROM bak_20261026_sweep_a_personas_meta").n === 7, "the backups hold the pre-state rows (and keep them after a second apply)");
  ok(one(twice, "SELECT description FROM bak_20261026_sweep_a_issue_99916").description === DESC_99916 && one(twice, "SELECT action FROM bak_20261026_sweep_a_trigger_2934").action === ACTION_2934, "the 99916 and 2934 backups hold the original text");
  ok(one(twice, "SELECT definition FROM bak_20261026_sweep_a_workflow").definition === wfDefinition(), "the workflow backup holds the original definition");
  ok(JSON.stringify(all(twice, "SELECT tbl, pk FROM bak_20261026_sweep_a_created ORDER BY tbl, pk")) === JSON.stringify([
    { tbl: "email_filters:sender_of_email", pk: "1077" }, { tbl: "email_filters:sender_of_email", pk: "1104" }, { tbl: "failure_modes", pk: "ticket-quotes-its-own-counted-marker" },
    { tbl: "control_registry", pk: "email-filter-journal-pitch-senders" }, { tbl: "ops_config", pk: OPS_KEY }, { tbl: "remediation_contracts", pk: FM_CLASS }].sort((x, y) => (x.tbl + x.pk < y.tbl + y.pk ? -1 : 1))), "the registry holds exactly the rows this file created", all(twice, "SELECT tbl, pk FROM bak_20261026_sweep_a_created ORDER BY tbl, pk"));
});

// ------------------------------------------------------------------ 11. rollback: the header line restores the pre-state and deletes only the rows this file created
await section("11 rollback: the header line restores the pre-state and deletes only what this file created", async () => {
  const rb = /^-- Rollback: (.*)$/m.exec(SQL);
  ok(!!rb && !/@/.test(rb[1]), "the Rollback line exists and holds no e-mail address");
  const rolled = fresh();
  apply(rolled);
  rolled.exec(rb[1]);
  const s = snap(rolled);
  const skip = ["decision_log", "agent_issues", "remediation_contracts", "fleet_tasks"];
  const diff = Object.keys(PK).filter((t) => !skip.includes(t) && changed(preSnap, s, t).length);
  ok(diff.length === 0, "after the Rollback line every touched table equals its pre-state", diff.map((t) => [t, changed(preSnap, s, t)]));
  ok(JSON.parse(s.fleet_tasks["management-personas"]).definition === JSON.parse(preSnap.fleet_tasks["management-personas"]).definition && JSON.parse(s.fleet_tasks["other-workflow"]).definition === JSON.parse(preSnap.fleet_tasks["other-workflow"]).definition, "the workflow definition is restored (the version only moves forward)");
  ok(one(rolled, "SELECT description FROM agent_issues WHERE id = 99916").description === DESC_99916 && changed(preSnap, s, "agent_issues").length === 3, "99916 is restored and the three follow-up issues stay (an issue is never silently dropped)", changed(preSnap, s, "agent_issues"));
  const strip = (row) => { const r = JSON.parse(row); delete r.next_due_at; return JSON.stringify(r); };
  const cdiff = ["issue-100405", "issue-1000100", "issue-1000102", "issue-1000186"].filter((c) => strip(preSnap.remediation_contracts[c]) !== strip(s.remediation_contracts[c]));
  ok(cdiff.length === 0, "the four contracts are restored (but for the due time, which the live edit-rerun trigger moves)", cdiff);
  ok(!(FM_CLASS in s.remediation_contracts) && Object.keys(s.remediation_contracts).length === Object.keys(preSnap.remediation_contracts).length + 3, "the detector contract is removed and the three new issue contracts stay");
  ok(!run(rolled, P["99916"]).passes && !run(rolled, P["100388"]).passes && !run(rolled, stored("issue-1000186")).passes, "the probes fail again after the rollback");
  // bounded: a same-shape filter that someone else wrote first is not deleted by the Rollback, the one this file created is
  const other = fresh();
  other.prepare("INSERT INTO email_filters (rule_type, field, pattern, action, priority, enabled) VALUES ('filter', 'sender', ?, 'spam', 50, 1)").run(SENDER_1077.toUpperCase());
  other.prepare("INSERT INTO ops_config (key, value, note) VALUES (?, '{\"kept\":true}', 'written first by someone else')").run(OPS_KEY);
  apply(other); other.exec(rb[1]);
  ok(all(other, "SELECT pattern FROM email_filters WHERE id > 38").length === 1 && one(other, "SELECT pattern FROM email_filters WHERE id > 38").pattern === SENDER_1077.toUpperCase(), "the Rollback keeps a same-shape filter written before this file and deletes the one it created");
  ok(one(other, `SELECT value FROM ops_config WHERE key = '${OPS_KEY}'`).value === '{"kept":true}', "the Rollback keeps an ops_config row written before this file");
});

// ------------------------------------------------------------------ 12. an already-fixed database: nothing but the decision row is written
await section("12 an already-fixed database: nothing but the decision row is written", async () => {
  const done = fresh();
  done.prepare("UPDATE agent_issues SET description = replace(description, '''%session-task:%''', '''%session-task'' || '':%''') WHERE id = 99916").run();
  done.prepare("UPDATE analytics_metric_triggers SET action = replace(action, '''%session-task:%''', '''%session-task'' || '':%''') WHERE id = 2934").run();
  done.exec("UPDATE cloudflare_capability_catalog SET status = 'approved', metric_ref = 'x', linked_issue = 1 WHERE slug = 'cfc-artifacts'");
  done.exec("UPDATE cloudflare_capability_catalog SET status = 'rejected', when_to_choose = 'Rejected earlier.' WHERE slug IN ('cfc-logpush', 'cfc-monetization-gateway', 'cfc-cloudflare-wan', 'cfc-cloudflare-fundamentals', 'data-pipelines', 'sandbox')");
  done.exec("INSERT INTO ops_config (key, value, note) VALUES ('" + OPS_KEY + "', '{\"kept\":true}', 'written first by someone else')");
  done.prepare("INSERT INTO email_filters (rule_type, field, pattern, action, priority, enabled) VALUES ('filter', 'from', ?, 'spam', 100, 1), ('filter', 'sender', ?, 'spam', 50, 1)").run(SENDER_1104, SENDER_1077.toUpperCase());
  done.exec("UPDATE emails SET status = 'archived' WHERE id = 1104");
  done.exec("INSERT INTO control_registry (control, location, kind, evidence, disposition) VALUES ('email-filter-journal-pitch-senders', 'x', 'filter', 'earlier', 'keep')");
  for (const id of Object.keys(PROMPTS)) done.prepare("UPDATE fleet_agents SET system_prompt = ? WHERE id = ?").run("Fixed. PERSONAL-QNFO-SEPARATION-1. NO-JOURNALS-1. Cadence: hourly.", id);
  done.exec("UPDATE management_personas SET decision_authority = 'fixed; PERSONAL-QNFO-SEPARATION-1; NO-JOURNALS-1', sla_min = MIN(sla_min, 120), path_b = 'daily portfolio rollup (PORTFOLIO-STRATEGIC-2) and weekly review (PORTFOLIO-STRATEGIC-1) recompute scorecards'");
  done.prepare("UPDATE fleet_tasks SET definition = replace(definition, 'ONE new feature', 'ONE new feature (NO-JOURNALS-1 and PERSONAL-QNFO-SEPARATION-1 stated)') WHERE id = 'management-personas'").run();
  for (const id of [100405, 1000100, 1000102, 1000186]) done.prepare("UPDATE remediation_contracts SET verify_probe = 'SELECT ''x'' AS expected, ''x'' AS observed', action = 'MEASURES it, written by a doer', status = 'active' WHERE class = ?").run("issue-" + id);
  for (const t of Object.values(TITLES)) done.prepare("INSERT INTO agent_issues (title, description, status) VALUES (?, 'filed earlier', 'open')").run(t);
  done.exec("INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, first_seen) VALUES ('ticket-quotes-its-own-counted-marker', 'f', 'r', 'm', 'd', '2026-10-26')");
  done.exec("INSERT INTO remediation_contracts (class, precondition, action, verify_probe, verify_transport, escalate_to) VALUES ('" + FM_CLASS + "', 'p', 'failure-mode detector', 'SELECT ''0'' AS expected, ''0'' AS observed', 'd1-query', 'qnfo-fleet-control')");
  const before = snap(done);
  apply(done);
  const after = snap(done);
  ok(same(before, after, ["decision_log"]), "an already-fixed database: no row in any table changes", Object.keys(PK).filter((t) => t !== "decision_log" && changed(before, after, t).length).map((t) => [t, changed(before, after, t)]));
  ok(changed(before, after, "decision_log").length === 1, "only the decision_log row is added");
  ok(["issue_99916", "trigger_2934", "cf_catalog", "emails", "fleet_agents", "personas", "personas_meta", "workflow", "contracts", "created"].every((n) => one(done, `SELECT COUNT(*) n FROM bak_20261026_sweep_a_${n}`).n === 0), "the backups and the created-rows registry of an already-fixed database are empty (nothing to restore, nothing to delete)");
  ok(one(done, "SELECT COUNT(*) n FROM email_filters WHERE lower(pattern) = lower(?) OR lower(pattern) = lower(?)", SENDER_1104, SENDER_1077).n === 2, "an existing filter for either sender (any field spelling or case) is not duplicated");
  for (const t of Object.values(TITLES)) ok(one(done, "SELECT COUNT(*) n FROM agent_issues WHERE title = ?", t).n === 1, "a follow-up that is already open is not filed twice");
});

// ------------------------------------------------------------------ 18. each follow-up's code-anchor occurs exactly once on the checkout, while the fix is not yet on main
// Follows migrations/code-anchor-once.test.mjs: a code-task whose anchor is not placed exactly once cannot be built. Once the follow-up is done (its code-probe passes on this checkout)
// the check is skipped, because the fix itself moves the anchor. The filed text is the one the migration writes, read back from the migrated database.
await section("18 follow-up anchors on the checkout", async () => {
  const state = {};
  for (const [k, t] of Object.entries(TITLES)) {
    const lines = issueByTitle(post, t).description.split("\n");
    const task = /^code-task: repo=qnfo-workers path=(\S+)$/.exec(lines.find((l) => l.startsWith("code-task: ")) || "");
    const anchor = (lines.find((l) => l.startsWith("code-anchor: ")) || "").slice("code-anchor: ".length);
    const cp = JSON.parse(lines.find((l) => l.startsWith("code-probe: ")).slice("code-probe: ".length));
    const target = readRepo(cp.paths[0]);
    const passes = typeof cp.contains === "string" ? target !== null && target.includes(cp.contains) : target === null || !target.includes(cp.absent);
    const file = task ? readRepo(task[1]) : null;
    state[k] = { passes, anchors: file === null ? -1 : count(file, anchor) };
    if (passes) continue; // done on main: nothing to place any more
    ok(!!task && file !== null && anchor.length > 20 && count(file, anchor) === 1, `${k}: the code-anchor occurs exactly once in ${task && task[1]} on this checkout (the code loop can place the edit)`, state[k]);
  }
  ok(WATCHED.length === 3 && Object.keys(state).length === 3, "the suite names the three files it reads, so SUITE-DEPENDENTS-1 selects it when one of their directories changes");
});

console.log(`sweep-data-fixes-a: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
