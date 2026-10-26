// Offline suite (node:sqlite) for migrations/2026-10-26-sweep-data-fixes-a.sql (SWEEP-DATA-FIXES-A-1), data fixes for agent_issues
// 99916, 100388, 100405, 1000100, 1000102 and 1000186 (3003 was fixed by CADENCE-SLA-CONTINUITY-1 first; the suite asserts this file leaves cadence_sla alone). The fixture is built from the live qnfo-audit shapes and values read on 2026-10-26
// (SELECT only). The suite proves, for every closing probe the fixes name, that the probe FAILS on the pre-state and PASSES on the migrated
// state; that exactly the intended rows change and no other row does; that a second apply and an already-fixed database change nothing but
// the one decision_log row; that no rule is appended twice; and that the Rollback header line restores the pre-state from the backup tables.
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

// ------------------------------------------------------------------ the owner's closing probes (d1-query: expected/observed)
const P = {
  "99916": "SELECT '0' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM agent_issues WHERE id = 99916 AND instr(description, 'session-task:') > 0",
  "99916b": "SELECT '0' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM analytics_metric_triggers WHERE id = 2934 AND instr(action, 'session-task:') > 0",
  "100388": "SELECT 'ok' AS expected, CASE WHEN (SELECT COUNT(DISTINCT i.slug) FROM cf_changelog_items i JOIN cloudflare_capability_catalog c ON c.slug = i.slug WHERE i.action IN ('reopened','new-row') AND c.status IN ('not_considered','proposed') AND replace(substr(i.seen_at,1,19),'T',' ') < datetime('now','-14 days')) <= 5 THEN 'ok' ELSE 'breach' END AS observed",
  "100405": "SELECT 'present' AS expected, (SELECT CASE WHEN COUNT(*) = 1 THEN 'present' END FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1') AS observed",
  "1000100": "SELECT 'recorded' AS expected, CASE WHEN COUNT(*) >= 1 THEN 'recorded' END AS observed FROM decision_log WHERE instr(evidence, 'op-mvn8obo496f4') > 0 AND instr(assumption, 'no write or dispatch tool') > 0",
  "1000102": "SELECT '2|spam' AS expected, (SELECT CAST(COUNT(*) AS TEXT) FROM email_filters WHERE enabled = 1 AND action = 'spam' AND lower(field) IN ('from','sender') AND lower(pattern) IN ('ravi.kumar.13p01@gmail.com','jornalpublication10@gmail.com')) || '|' || COALESCE((SELECT status FROM emails WHERE id = 1104), '') AS observed",
  "1000186": "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM fleet_agents WHERE (id = 'portfolio-manager' OR id LIKE 'program-manager:%') AND (instr(system_prompt, 'PERSONAL-QNFO-SEPARATION-1') = 0 OR instr(system_prompt, 'NO-JOURNALS-1') = 0 OR instr(system_prompt, 'weekly program note into the portfolio review.') > 0 OR instr(system_prompt, '(Mondays 06:00Z)') > 0)) + (SELECT COUNT(*) FROM management_personas WHERE instr(decision_authority, 'PERSONAL-QNFO-SEPARATION-1') = 0 OR instr(decision_authority, 'NO-JOURNALS-1') = 0) AS TEXT) AS observed",
};
const probe = (db, key) => { const r = one(db, P[key]); return { passes: r.expected === r.observed, ...r }; };

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
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
CREATE TABLE decision_predictions (decision_id INTEGER, kind TEXT, subject TEXT, op TEXT, value REAL, due_at TEXT, origin TEXT, PRIMARY KEY (decision_id, kind, subject));
${DECISION_PARSE_TRIGGER};
`;

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

function seed(db) {
  db.exec(SCHEMA);
  // 99916 / 2934
  const iss = db.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (?, ?, ?, 'open')");
  iss.run(99916, "METRIC-TRIGGER-2934-SESSION-DEPENDENT-ISSUES-OPEN: Autonomy-first gap", DESC_99916);
  iss.run(2604, "METRIC-TRIGGER #6116 papers_queued_over_120m", "papers queue breach, owner is a session");
  iss.run(100064, "personal-companion fix", "wo failed generation runs between them.\nsession-task: repo=qnfo-workers path=personal-companion/worker.js\n(INTAKE-PROVENANCE)");
  iss.run(1000189, "issue 1000189", "reopens issue 1000183 which carries `session-task: repo=qnfo-workers path=scripts/remediation_consumer.py` in prose");
  iss.run(100405, "OWNER-NOTE-46: code:ct_hoq2y5kjmyf7lp", DESC_100405);
  iss.run(1000100, "OWNER-TASK-op-mvn8obo496f4: Remediation record", "Remediation record: log that this chat thread has no write/dispatch tool and that execution authority rests with server-side action carriers");
  iss.run(5000, "an ordinary open issue", "nothing to see");
  const tri = db.prepare("INSERT INTO issue_triage (issue_id, owner) VALUES (?, ?)");
  tri.run(99916, "qnfo-code-orchestrator"); tri.run(2604, "session-chatbox-20261017"); tri.run(100064, "personal-companion"); tri.run(1000189, "qnfo-ops"); tri.run(5000, "qnfo-ops");
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
  em.run(1077, "m-1077", "jornalpublication10@gmail.com", "Research Across All Disciplines", "spam");
  em.run(1104, "m-1104", "ravi.kumar.13p01@gmail.com", "Details for research authors", "processed");
  em.run(1105, "m-1105", "someone.else@example.org", "Details for research authors", "processed");
  em.run(1150, "m-1150", "ravi.kumar.13p01@gmail.com", "A different mail from the same address", "processed");
  em.run(1200, "m-1200", "ravi.kumar.13p01@gmail.com", "Another one", "received");
  const flt = db.prepare("INSERT INTO email_filters (id, rule_type, field, pattern, action, priority, enabled) VALUES (?, 'filter', ?, ?, ?, ?, 1)");
  flt.run(30, "from", "advancedresearchpub.com", "spam", 100); flt.run(37, "from", "rowan.quni@qnfo.org", "accept", 200); flt.run(38, "sender", "kavithakavi6162@gmail.com", "spam", 50);
  db.exec("INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, evidence) VALUES ('code-merge-trusted-sources', 'ops_config', 'filter', 'outside text', 1, 'replace', 'applied', 'seed')");
  // 1000186
  const ag = db.prepare("INSERT INTO fleet_agents (id, name, system_prompt, model, tools, enabled, version, updated_at) VALUES (?, ?, ?, 'router:qnfo-ai', '[]', 1, 1, '2026-10-25T11:26:40.180Z')");
  for (const [id, p] of Object.entries(PROMPTS)) ag.run(id, id, p);
  ag.run("some-other-agent", "Other", "An unrelated agent prompt without either rule.");
  const mp = db.prepare("INSERT INTO management_personas (persona_key, level, scope, decision_authority, sla_min, status, updated_at) VALUES (?, ?, ?, ?, 240, 'active', '2026-10-26 07:00:00')");
  for (const [k, lvl] of PERSONAS) mp.run(k, lvl, k.split(":")[1], lvl === "portfolio" ? AUTH_PORTFOLIO : AUTH_PROGRAM);
  // decision_log and the metric the decision predicts
  db.exec("INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path) VALUES ('s', 'a', 'EARLIER-DECISION-1: x', 'e', 'o', 'b', 'r')");
  db.exec("INSERT INTO metric_registry (metric, last_value, last_refreshed) VALUES ('cf_changelog_open_proposals_14d', '7', '2026-10-26T09:01:00.746Z')");
  return db;
}
const fresh = () => seed(new DatabaseSync(":memory:"));
const apply = (db, sql = SQL) => db.exec(sql);

const PK = { agent_issues: "id", analytics_metric_triggers: "id", cloudflare_capability_catalog: "slug", ops_config: "key", email_filters: "id", emails: "id", control_registry: "control", fleet_agents: "id", management_personas: "persona_key", decision_log: "id", issue_triage: "issue_id", cf_changelog_items: "guid" };
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

// ------------------------------------------------------------------ 0. the file itself
await section("0 the file itself", async () => {
  ok(/^-- APPLY-BY: ci$/m.test(SQL) && /^-- DB: qnfo-audit$/m.test(SQL), "header opts in: APPLY-BY ci, DB qnfo-audit");
  ok(/^-- Rollback: UPDATE /m.test(SQL), "a Rollback header line exists");
  ok(!/^\s*(DELETE\s+FROM|DROP\s)/im.test(SQL.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "no statement deletes or drops (so no BACKUP header is needed)");
  ok(!/claude\.ai|anthropic\.com/i.test(SQL), "no claude.ai or anthropic.com link in a tracked file (cloudflare-only-host-guard)");
  ok(!/(secret|token|password|api[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}/i.test(SQL), "no secret value in the file");
  const stmts = SQL.split("\n").filter((l) => !l.startsWith("--")).join("\n");
  ok((stmts.match(/INSERT INTO decision_log/g) || []).length === 1, "exactly one decision_log INSERT statement");
  ok(!/cadence_sla/.test(stmts), "the migration does not write cadence_sla: 3003 was fixed by CADENCE-SLA-CONTINUITY-1 (migrations/2026-10-26-cadence-sla-continuity.sql)");
  ok(!/(UPDATE|DELETE FROM)\s+decision_log/i.test(stmts), "decision_log is only appended to");
  ok(/CREATE TABLE IF NOT EXISTS bak_20261026_sweep_a_/.test(stmts) && (stmts.match(/CREATE TABLE IF NOT EXISTS bak_20261026_sweep_a_/g) || []).length === 6, "six bak_20261026_sweep_a_* before-state tables are created in the file");
});

// ------------------------------------------------------------------ 1. every closing probe fails before and passes after
const pre = fresh();
const post = fresh();
const preSnap = snap(pre);
apply(post);
const postSnap = snap(post);
for (const k of Object.keys(P)) {
  const before = probe(pre, k), after = probe(post, k);
  ok(!before.passes, `probe ${k} does not pass on the pre-state`, before);
  ok(after.passes, `probe ${k} passes on the migrated state`, after);
}

// ------------------------------------------------------------------ 2. exactly the intended rows change
await section("2 exactly the intended rows change", async () => {
  const exp = {
    agent_issues: ["99916"], analytics_metric_triggers: ["2934"],
    cloudflare_capability_catalog: SLUGS, ops_config: ["OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1"], emails: ["1104"],
    control_registry: ["email-filter-journal-pitch-senders"], fleet_agents: Object.keys(PROMPTS).sort(), management_personas: PERSONAS.map((p) => p[0]).sort(),
    decision_log: ["2"], issue_triage: [], cf_changelog_items: [],
  };
  for (const [t, keys] of Object.entries(exp)) ok(JSON.stringify(changed(preSnap, postSnap, t)) === JSON.stringify([...keys].sort()), `only the intended ${t} rows change`, { got: changed(preSnap, postSnap, t), want: keys });
  ok(changed(preSnap, postSnap, "email_filters").length === 2 && all(post, "SELECT id FROM email_filters WHERE id > 38").length === 2, "email_filters gains exactly two rows and no existing one changes");
});

// ------------------------------------------------------------------ 4. 99916: the ticket stops counting itself; the example query keeps its meaning
await section("4 99916: the ticket stops counting itself; the example query keeps its meaning", async () => {
  const countQ = "SELECT COUNT(*) n FROM agent_issues a WHERE a.status = 'open' AND (COALESCE(a.description, '') LIKE '%session-task:%' OR EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.owner LIKE 'session%'))";
  ok(one(pre, countQ).n === 4 && one(post, countQ).n === 3, "session_dependent_issues_open falls by exactly the ticket itself (4 -> 3)", { pre: one(pre, countQ).n, post: one(post, countQ).n });
  const d = (db) => one(db, "SELECT description FROM agent_issues WHERE id = 99916").description;
  const a = (db) => one(db, "SELECT action FROM analytics_metric_triggers WHERE id = 2934").action;
  ok(!d(post).includes("session-task:") && d(post).includes("'%session-task' || ':%'"), "ticket text holds the split literal, not the marker", d(post));
  ok(!a(post).includes("session-task:") && a(post).includes("'%session-task' || ':%'"), "trigger 2934 action holds the split literal, so a refile cannot count itself", a(post));
  ok(a(post).includes("a code-task: and code-anchor: line in place of its session-task line"), "the trigger's prose (session-task without a colon) is kept");
  const q = (txt) => txt.slice(txt.indexOf("SELECT a.id"), txt.indexOf("')", txt.indexOf("t.owner LIKE") ) + 2);
  const rowsPre = all(pre, q(d(pre))).map((r) => r.id).sort((x, y) => x - y), rowsPost = all(post, q(d(post))).map((r) => r.id).sort((x, y) => x - y);
  ok(JSON.stringify(rowsPre) === JSON.stringify([2604, 100064, 99916, 1000189].sort((x, y) => x - y)), "before: the quoted example query returns the ticket itself and the three other rows", rowsPre);
  ok(!rowsPost.includes(99916) && JSON.stringify(rowsPost) === JSON.stringify(rowsPre.filter((i) => i !== 99916)), "after: the rewritten example query returns the same rows minus the ticket", { rowsPre, rowsPost });
  ok(d(post).replace("'%session-task' || ':%'", "'%session-task:%'") === d(pre), "nothing else in the ticket text changed");
  ok(one(post, "SELECT description FROM agent_issues WHERE id = 1000189").description === one(pre, "SELECT description FROM agent_issues WHERE id = 1000189").description, "another issue that quotes the marker is not rewritten");
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

// ------------------------------------------------------------------ 6. 100405: the owner's words, verbatim, in the shape of the earlier directive rows
await section("6 100405: the owner's words, verbatim, in the shape of the earlier directive rows", async () => {
  const r = one(post, "SELECT value, note FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1'");
  let j = null; try { j = JSON.parse(r.value); } catch (e) { /* asserted below */ }
  ok(j && j.id === "COST-QUALITY-FLOOR-1" && j.date === "2026-10-21", "the value is JSON with the id and date", r.value && r.value.slice(0, 80));
  const m = /to the card code:ct_hoq2y5kjmyf7lp: (.*?) Definition of done:/s.exec(DESC_100405);
  ok(m && j && j.directive_verbatim === m[1], "directive_verbatim equals the owner's note text read from agent_issues 100405", { want: m && m[1], got: j && j.directive_verbatim });
  ok(j && /OWNER-NOTE-46/.test(j.source) && /100405/.test(j.source) && /BUDGET-SOFT-ROUTE-1/.test(j.reading) && /not the owner/.test(j.limits), "source, reading and limits are recorded, the reading labelled as the fleet's");
  ok(/follow-up PR/.test(r.note), "the note records that the CLAUDE.md line is a follow-up");
});

// ------------------------------------------------------------------ 7. 1000100 / the decision row
await section("7 1000100 / the decision row", async () => {
  const d = all(post, "SELECT * FROM decision_log WHERE instr(action, 'SWEEP-DATA-FIXES-A-1:') = 1");
  ok(d.length === 1, "exactly one SWEEP-DATA-FIXES-A-1 decision row", d.length);
  const r = d[0];
  for (const c of ["actor", "assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "reach_gain", "surfaces_tested"]) ok(typeof r[c] === "string" && r[c].length > 0, `decision_log.${c} is filled`);
  ok(/op-mvn8obo496f4/.test(r.evidence) && /no write or dispatch tool/.test(r.assumption) && /server-side action carriers/.test(r.assumption), "the 1000100 record names the prompt, the missing tool and the carriers");
  for (const i of ["99916", "100388", "100405", "1000100", "1000102", "1000186"]) ok(r.action.includes(i), `the action names issue ${i}`);
  ok(/^[a-z0-9_]+ (<=|<|>=|>|=) [0-9.]+ within [0-9]+ hours$/.test(r.predicted_outcome), "predicted_outcome has the form the decision_predictions_parse trigger reads", r.predicted_outcome);
  const p = all(post, "SELECT * FROM decision_predictions");
  ok(p.length === 1 && p[0].subject === "cf_changelog_open_proposals_14d" && p[0].op === "<=" && p[0].value === 0 && p[0].decision_id === r.id, "the live parse trigger turns it into one metric prediction", p);
  ok(one(post, "SELECT COUNT(*) n FROM decision_log").n === 2, "the earlier decision_log row is untouched and one row is appended");
});

// ------------------------------------------------------------------ 8. 1000102: the two senders are blocked at ingest; no other email row moves
await section("8 1000102: the two senders are blocked at ingest; no other email row moves", async () => {
  const f = all(post, "SELECT rule_type, field, pattern, action, priority, enabled FROM email_filters WHERE id > 38 ORDER BY pattern");
  ok(JSON.stringify(f) === JSON.stringify([
    { rule_type: "filter", field: "sender", pattern: "jornalpublication10@gmail.com", action: "spam", priority: 50, enabled: 1 },
    { rule_type: "filter", field: "sender", pattern: "ravi.kumar.13p01@gmail.com", action: "spam", priority: 50, enabled: 1 }]), "two enabled sender filters, spam, priority 50 (the row qnfo-email's own block path writes)", f);
  ok(one(post, "SELECT status FROM emails WHERE id = 1104").status === "spam", "email 1104 is spam");
  for (const id of [966, 1077, 1105, 1150, 1200]) ok(JSON.stringify(one(pre, "SELECT * FROM emails WHERE id = ?", id)) === JSON.stringify(one(post, "SELECT * FROM emails WHERE id = ?", id)), `email ${id} is not touched`);
  const c = one(post, "SELECT kind, disposition, disposition_state, issue_id, critical_path FROM control_registry WHERE control = 'email-filter-journal-pitch-senders'");
  ok(c && c.kind === "filter" && c.disposition === "keep" && c.disposition_state === "applied" && c.issue_id === 1000102, "control_registry records the filter (DOCTRINE-1)", c);
  // behaviour: qnfo-email's own applyFilters (extracted from the worker source) reads the new rows
  const worker = readFileSync(new URL("../qnfo-email/worker.js", import.meta.url), "utf8");
  const line = worker.split("\n").find((l) => l.startsWith("async function applyFilters("));
  ok(!!line, "applyFilters is found in qnfo-email/worker.js");
  if (line) {
    const applyFilters = new Function(line + "\nreturn applyFilters;")();
    const ad = (db) => ({ prepare: (sql) => ({ all: async () => ({ results: db.prepare(sql).all() }) }) });
    const run = async (db, from) => (await applyFilters(ad(db), from, "rowan.quni@qnfo.org", "Details for research authors", "hello")).action;
    ok((await run(pre, "Ravi Kumar <ravi.kumar.13p01@gmail.com>")) === "process" && (await run(pre, "jornalpublication10@gmail.com")) === "process", "before: mail from the two senders is processed, not filed as spam");
    ok((await run(post, "Ravi Kumar <ravi.kumar.13p01@gmail.com>")) === "spam" && (await run(post, "jornalpublication10@gmail.com")) === "spam", "after: qnfo-email applyFilters files both senders as spam");
    ok((await run(post, "someone.else@example.org")) === "process" && (await run(post, "rowan.quni@qnfo.org")) === "accept", "after: another sender is still processed and the owner is still accepted");
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
  ok(all(post, "SELECT sla_min, path_a, path_b, charter FROM management_personas").every((r, i) => JSON.stringify(r) === JSON.stringify(all(pre, "SELECT sla_min, path_a, path_b, charter FROM management_personas")[i])), "management_personas columns other than decision_authority are untouched");
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

// ------------------------------------------------------------------ 10. idempotence: a second apply changes nothing
await section("10 idempotence: a second apply changes nothing", async () => {
  const twice = fresh();
  apply(twice); const s1 = snap(twice);
  const bakBefore = JSON.stringify(all(twice, "SELECT name FROM sqlite_master WHERE name LIKE 'bak_20261026_sweep_a_%' ORDER BY name"));
  apply(twice); const s2 = snap(twice);
  ok(same(s1, s2), "second apply changes no row in any table", Object.keys(PK).filter((t) => changed(s1, s2, t).length));
  ok(JSON.stringify(s1) === JSON.stringify(s2), "the full snapshot is identical after the second apply");
  ok(one(twice, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'SWEEP-DATA-FIXES-A-1:') = 1").n === 1 && one(twice, "SELECT COUNT(*) n FROM decision_predictions").n === 1, "one decision row and one prediction after two applies");
  ok(bakBefore === JSON.stringify(all(twice, "SELECT name FROM sqlite_master WHERE name LIKE 'bak_20261026_sweep_a_%' ORDER BY name")) && JSON.parse(bakBefore).length === 6, "six backup tables, unchanged by the second apply");
  ok(one(twice, "SELECT COUNT(*) n FROM bak_20261026_sweep_a_fleet_agents").n === 6 && one(twice, "SELECT COUNT(*) n FROM bak_20261026_sweep_a_cf_catalog").n === 7 && one(twice, "SELECT COUNT(*) n FROM bak_20261026_sweep_a_emails").n === 1 && one(twice, "SELECT COUNT(*) n FROM bak_20261026_sweep_a_personas").n === 6, "the backups hold the pre-state rows (and keep them after a second apply)");
  ok(one(twice, "SELECT description FROM bak_20261026_sweep_a_issue_99916").description === DESC_99916 && one(twice, "SELECT action FROM bak_20261026_sweep_a_trigger_2934").action === ACTION_2934, "the 99916 and 2934 backups hold the original text");
});

// ------------------------------------------------------------------ 11. rollback: the header line restores the pre-state from the backup tables
await section("11 rollback: the header line restores the pre-state from the backup tables", async () => {
  const rb = /^-- Rollback: (.*)$/m.exec(SQL);
  const rolled = fresh();
  apply(rolled);
  rolled.exec(rb[1]);
  const s = snap(rolled);
  const diff = Object.keys(PK).filter((t) => t !== "decision_log" && changed(preSnap, s, t).length);
  ok(diff.length === 0, "after the Rollback line every touched table equals its pre-state (decision_log keeps its append-only row)", diff.map((t) => [t, changed(preSnap, s, t)]));
  ok(probe(rolled, "1000186").passes === false && probe(rolled, "99916").passes === false && probe(rolled, "100388").passes === false, "the probes fail again after the rollback");
});

// ------------------------------------------------------------------ 12. an already-fixed database: nothing but the decision row is written
await section("12 an already-fixed database: nothing but the decision row is written", async () => {
  const done = fresh();
  done.prepare("UPDATE agent_issues SET description = replace(description, '''%session-task:%''', '''%session-task'' || '':%''') WHERE id = 99916").run();
  done.prepare("UPDATE analytics_metric_triggers SET action = replace(action, '''%session-task:%''', '''%session-task'' || '':%''') WHERE id = 2934").run();
  done.exec("UPDATE cloudflare_capability_catalog SET status = 'approved', metric_ref = 'x', linked_issue = 1 WHERE slug = 'cfc-artifacts'");
  done.exec("UPDATE cloudflare_capability_catalog SET status = 'rejected', when_to_choose = 'Rejected earlier.' WHERE slug IN ('cfc-logpush', 'cfc-monetization-gateway', 'cfc-cloudflare-wan', 'cfc-cloudflare-fundamentals', 'data-pipelines', 'sandbox')");
  done.exec("INSERT INTO ops_config (key, value, note) VALUES ('OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1', '{\"kept\":true}', 'written first by someone else')");
  done.exec("INSERT INTO email_filters (rule_type, field, pattern, action, priority, enabled) VALUES ('filter', 'from', 'ravi.kumar.13p01@gmail.com', 'spam', 100, 1), ('filter', 'sender', 'JornalPublication10@gmail.com', 'spam', 50, 1)");
  done.exec("UPDATE emails SET status = 'archived' WHERE id = 1104");
  done.exec("INSERT INTO control_registry (control, location, kind, evidence, disposition) VALUES ('email-filter-journal-pitch-senders', 'x', 'filter', 'earlier', 'keep')");
  for (const id of Object.keys(PROMPTS)) done.prepare("UPDATE fleet_agents SET system_prompt = ? WHERE id = ?").run("Fixed. PERSONAL-QNFO-SEPARATION-1. NO-JOURNALS-1. Cadence: hourly.", id);
  done.exec("UPDATE management_personas SET decision_authority = 'fixed; PERSONAL-QNFO-SEPARATION-1; NO-JOURNALS-1'");
  const before = snap(done);
  apply(done);
  const after = snap(done);
  ok(same(before, after, ["decision_log"]), "an already-fixed database: no row in any table changes", Object.keys(PK).filter((t) => t !== "decision_log" && changed(before, after, t).length).map((t) => [t, changed(before, after, t)]));
  ok(changed(before, after, "decision_log").length === 1, "only the decision_log row is added");
  ok(["issue_99916", "trigger_2934", "cf_catalog", "emails", "fleet_agents", "personas"].every((n) => one(done, `SELECT COUNT(*) n FROM bak_20261026_sweep_a_${n}`).n === 0), "the backups of an already-fixed database are empty (nothing to restore)");
  ok(one(done, "SELECT COUNT(*) n FROM email_filters WHERE lower(pattern) IN ('ravi.kumar.13p01@gmail.com', 'jornalpublication10@gmail.com')").n === 2, "an existing filter for either address (any field spelling or case) is not duplicated");
});

console.log(`sweep-data-fixes-a: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
