// BP26-PRIVACY-1 offline suite: replays migrations/2026-10-26-bp26-privacy.sql on node:sqlite against synthetic tables whose rows have known ages.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped by the body); the retention_policy registry holds the 19 policies (13 counted by the trigger, 6 by the
// runner), every one report-only and still a proposal; each registered past_sql counts exactly the rows past its period that still hold the data (an empty body, a fresh row, a suppressed contact and a
// pending delivery are not counted); the metric reads the sum at apply, is MEASURED by the d1-trigger class, and keeps its [BP26] tag; the heavy-tick trigger honours its 50-minute gate, refreshes once the
// gate is open and adds what the runner wrote for the other databases; a replay changes no count; the owner card is IDENTITY-BOUND; the Rollback line undoes the file.
// Output MUST contain "0 failed" on success.   node migrations/bp26-privacy.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-bp26-privacy.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing (nothing is purged)");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick\b/i.test(body) && !/(AFTER|BEFORE)\s+\w+\s+ON\s+fleet_tick\b/i.test(body) && /AFTER INSERT ON fleet_tick_heavy/.test(body), "the trigger is on fleet_tick_heavy, never fleet_tick");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link");
ok(!/\b(LIKE|GLOB)\s+'[^']{51,}'/i.test(body), "no LIKE or GLOB pattern over 50 bytes");

const rollback = header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, "");
const iso = (mod) => new Date(Date.now() + mod).toISOString().replace(/\.\d+Z$/, "Z");

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`
CREATE TABLE fleet_tick_heavy (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT DEFAULT 'normal', due TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, resolution TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, source_of_truth TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT, sender TEXT, recipient TEXT, subject TEXT, body_text TEXT, body_html TEXT, headers_json TEXT, received_at TEXT);
CREATE TABLE email_raw_archive (email_id INTEGER PRIMARY KEY, raw_text TEXT, created_at TEXT);
CREATE TABLE email_reply_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, draft_text TEXT, draft_proposed TEXT, created_at TEXT);
CREATE TABLE email_loop_quarantine (id INTEGER PRIMARY KEY AUTOINCREMENT, body_text TEXT, quarantined_at TEXT, received_at TEXT);
CREATE TABLE email_commands (id INTEGER PRIMARY KEY AUTOINCREMENT, command_text TEXT, created_at TEXT);
CREATE TABLE email_parse_failures (email_id INTEGER PRIMARY KEY, content_hint TEXT, created_at TEXT);
CREATE TABLE subscribers (email TEXT PRIMARY KEY, status TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE contact_ledger (email TEXT PRIMARY KEY, first_contact TEXT, last_contact TEXT, suppress INTEGER DEFAULT 0);
CREATE TABLE mcp_log (id TEXT PRIMARY KEY, ts TEXT, args TEXT, result TEXT);
CREATE TABLE email_calendar_delivery (id INTEGER PRIMARY KEY, status TEXT, due_at TEXT);
CREATE TABLE handoffs (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, summary TEXT, timestamp TEXT);
INSERT INTO metric_registry (metric, layer, kind, source_of_truth, state) VALUES
 ('records_past_retention', 'surface', 'guard', 'retention registry (to build) [BP26]', 'UNMEASURED'),
 ('ropa_last_reviewed_days', 'surface', 'guard', 'repository (to compute) [BP26]', 'UNMEASURED'),
 ('dpia_current', 'surface', 'guard', 'repository docs/dpia/ (to compute) [BP26]', 'UNMEASURED'),
 ('subscribers_with_consent_proof', 'surface', 'guard', 'subscriber tables (to compute) [BP26]', 'UNMEASURED'),
 ('pii_in_logs', 'surface', 'guard', 'log sample scan (to build) [BP26]', 'UNMEASURED'),
 ('other_metric', 'surface', 'guard', 'someone else', 'MEASURED');
`);
  const d = (n) => `date('now','-${n} days')`;
  // emails: bodies_30d counts e1 and e5; metadata_365d counts e4 and e5
  w.exec(`INSERT INTO emails (body_text, body_html, received_at) VALUES ('x', NULL, ${d(40)}), ('', NULL, ${d(40)}), ('y', NULL, ${d(5)}), ('', NULL, ${d(400)}), ('z', NULL, ${d(400)});`);
  w.exec(`INSERT INTO email_raw_archive (email_id, raw_text, created_at) VALUES (1, 'm', ${d(40)}), (2, '', ${d(40)}), (3, 'n', ${d(1)});`);                          // 1
  w.exec(`INSERT INTO email_reply_queue (draft_text, draft_proposed, created_at) VALUES ('d', NULL, ${d(100)}), (NULL, 'p', ${d(100)}), ('e', NULL, ${d(10)});`);        // 2
  w.exec(`INSERT INTO email_loop_quarantine (body_text, quarantined_at, received_at) VALUES ('b', ${d(40)}, NULL), ('b', NULL, ${d(40)}), ('b', ${d(1)}, ${d(1)});`);     // 2
  w.exec(`INSERT INTO email_commands (command_text, created_at) VALUES ('go', ${d(200)}), ('go', ${d(1)});`);                                                           // 1
  w.exec(`INSERT INTO email_parse_failures (email_id, content_hint, created_at) VALUES (1, 'h', ${d(100)}), (2, 'h', ${d(3)});`);                                       // 1
  w.exec(`INSERT INTO subscribers (email, status, created_at, updated_at) VALUES ('a', 'pending', ${d(40)}, NULL), ('b', 'pending', ${d(5)}, NULL), ('c', 'unsubscribed', ${d(90)}, ${d(40)}), ('d', 'subscribed', ${d(400)}, NULL), ('e', 'unsubscribed', ${d(40)}, NULL);`); // pending 1, unsubscribed 2
  w.exec(`INSERT INTO contact_ledger (email, first_contact, last_contact, suppress) VALUES ('k1', NULL, ${d(1200)}, 0), ('k2', NULL, ${d(1200)}, 1), ('k3', NULL, NULL, 0), ('k4', NULL, ${d(100)}, 0), ('k5', ${d(1200)}, NULL, 0);`); // 2
  w.exec(`INSERT INTO mcp_log (id, ts, args, result) VALUES ('1', ${d(100)}, 'a', ''), ('2', ${d(100)}, '', ''), ('3', ${d(1)}, 'a', 'b');`);                          // 1
  w.exec(`INSERT INTO email_calendar_delivery (id, status, due_at) VALUES (1, 'sent', ${d(100)}), (2, 'pending', ${d(100)}), (3, 'skipped', ${d(5)});`);                // 1
  w.exec(`INSERT INTO handoffs (session_id, summary, timestamp) VALUES ('email-strategic-1', 's', ${d(200)}), ('other-1', 's', ${d(200)}), ('email-x', 's', ${d(1)});`); // 1
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const past = (w, key) => (q1(w, "SELECT past_retention p FROM retention_policy WHERE policy_key = ?", key) || {}).p;
const metric = (w, m = "records_past_retention") => q1(w, "SELECT last_value v, state s, refresh_class c, source_of_truth t, last_refreshed r FROM metric_registry WHERE metric = ?", m);

const w = world();
w.exec(sql);

const pol = qa(w, "SELECT * FROM retention_policy ORDER BY policy_key");
ok(pol.length === 19, "19 policies are registered", pol.length);
ok(pol.filter((p) => p.measured_by === "d1-trigger").length === 13 && pol.filter((p) => p.measured_by === "runner").length === 6, "13 are counted by the trigger and 6 by the runner");
ok(pol.every((p) => p.enforcement === "report" && p.policy_status === "proposed" && p.personal_data === 1), "every policy is report-only, a proposal, and personal data");
ok(pol.every((p) => /^SELECT COUNT\(\*\) FROM /.test(p.past_sql) && !/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i.test(p.past_sql)), "every past_sql is one read-only SELECT COUNT(*)");
ok(pol.filter((p) => p.db !== "qnfo-audit").every((p) => p.measured_by === "runner") && pol.filter((p) => p.db === "qnfo-audit").every((p) => p.measured_by === "d1-trigger"), "qnfo-audit policies are the trigger's, other databases are the runner's");
const emailBody = pol.find((p) => p.policy_key === "emails_bodies_30d");
ok(emailBody && emailBody.retention_days === 30, "message bodies are held at 30 days, the BP26-RETENTION-1 figure");

const expect = { emails_bodies_30d: 2, email_raw_archive_30d: 1, email_reply_queue_drafts_90d: 2, email_loop_quarantine_30d: 2, email_commands_180d: 1, email_parse_failures_90d: 1,
  subscribers_pending_30d: 1, subscribers_unsubscribed_30d: 2, contact_ledger_1095d: 2, mcp_log_90d: 1, email_calendar_delivery_90d: 1, handoffs_email_180d: 1, emails_metadata_365d: 2 };
for (const [k, n] of Object.entries(expect)) ok(past(w, k) === n, "policy " + k + " counts " + n, past(w, k));
let sum = 0; for (const n of Object.values(expect)) sum += n;
ok(pol.filter((p) => p.measured_by === "runner").every((p) => past(w, p.policy_key) === null), "the runner's policies are not counted until the runner counts them (unknown is never a value)");
for (const p of pol.filter((x) => x.measured_by === "d1-trigger")) ok(q1(w, p.past_sql.replace(/^SELECT COUNT\(\*\)/, "SELECT COUNT(*) AS n")).n === past(w, p.policy_key), "the registered past_sql of " + p.policy_key + " equals what the file wrote");

let m = metric(w);
ok(m.v === String(sum) && m.s === "MEASURED" && m.c === "d1-trigger", "records_past_retention reads the sum at apply, MEASURED, class d1-trigger", m);
ok(/\[BP26\]/.test(m.t) && /retention_policy/.test(m.t), "its source_of_truth names the registry and keeps the [BP26] tag", m.t);
for (const k of ["ropa_last_reviewed_days", "dpia_current", "subscribers_with_consent_proof", "pii_in_logs"]) {
  const r = metric(w, k);
  ok(/\[BP26\]/.test(r.t) && /bp26_privacy\.py/.test(r.t) && r.v === null && r.s === "UNMEASURED", "the source of " + k + " names its producer; the file writes no value for it", r);
}
ok(metric(w, "other_metric").t === "someone else", "a metric outside the BP26 tag is untouched");

// the trigger: gate closed, then open
w.exec(`INSERT INTO emails (body_text, received_at) VALUES ('new', date('now','-40 days'));`);
w.exec("INSERT INTO fleet_tick_heavy (ts) VALUES ('t1');");
ok(past(w, "emails_bodies_30d") === 2 && metric(w).v === String(sum), "within 50 minutes the heavy tick changes nothing (the gate)");
const old = iso(-2 * 3600 * 1000);
w.exec(`UPDATE retention_policy SET checked_at = '${old}'; UPDATE metric_registry SET last_refreshed = '${old}' WHERE metric = 'records_past_retention';`);
w.exec("INSERT INTO fleet_tick_heavy (ts) VALUES ('t2');");
ok(past(w, "emails_bodies_30d") === 3 && metric(w).v === String(sum + 1), "after the gate the heavy tick recounts (+1 body) and the metric follows", [past(w, "emails_bodies_30d"), metric(w).v]);
// the runner writes its counts; the next gated refresh adds them
w.exec(`UPDATE retention_policy SET past_retention = 11, checked_at = '${iso(0)}' WHERE policy_key = 'ipatent_sessions_90d'; UPDATE retention_policy SET past_retention = 41, checked_at = '${iso(0)}' WHERE policy_key = 'ipatent_analytics_90d';`);
w.exec(`UPDATE retention_policy SET checked_at = '${old}' WHERE measured_by = 'd1-trigger'; UPDATE metric_registry SET last_refreshed = '${old}' WHERE metric = 'records_past_retention';`);
w.exec("INSERT INTO fleet_tick_heavy (ts) VALUES ('t3');");
ok(metric(w).v === String(sum + 1 + 11 + 41), "the metric adds the counts the runner wrote for the other databases", metric(w).v);

// the owner card and the decision
const card = q1(w, "SELECT * FROM human_actions WHERE slug = 'bp26-retention-enforce'");
ok(card && /IDENTITY-BOUND:/.test(card.why) && card.status === "open" && /retention_enforce/.test(card.action) && /Report-only/.test(card.default_in_effect), "the owner card names the irreversible, identity-bound step, its default and the key that resolves it", card && card.slug);
ok(!/\b(delete|blank|purge)[a-z]* (it|them) (now|today)\b/i.test(card.why), "the card does not claim a purge happened");
ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'BP26-PRIVACY-1:%'").n === 1, "the decision is logged once");

// replay changes no count
const before = JSON.stringify(qa(w, "SELECT policy_key, past_retention FROM retention_policy ORDER BY policy_key").filter((r) => r.past_retention !== null && !String(r.policy_key).startsWith("ipatent")));
w.exec(sql);
const after = JSON.stringify(qa(w, "SELECT policy_key, past_retention FROM retention_policy ORDER BY policy_key").filter((r) => r.past_retention !== null && !String(r.policy_key).startsWith("ipatent")));
ok(before === after, "a replay changes no count");
ok(q1(w, "SELECT COUNT(*) n FROM retention_policy").n === 19 && q1(w, "SELECT COUNT(*) n FROM human_actions WHERE slug = 'bp26-retention-enforce'").n === 1 && q1(w, "SELECT COUNT(*) n FROM decision_log").n === 1, "a replay adds no policy, card or decision");

w.exec(rollback);
ok(q1(w, "SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('retention_policy', 'bp26_retention_heavy_tick')").n === 0, "the Rollback line drops the table and the trigger");
ok(["records_past_retention", "ropa_last_reviewed_days", "dpia_current", "subscribers_with_consent_proof", "pii_in_logs"].every((k) => { const r = metric(w, k); return r.v === null && r.s === "UNMEASURED" && r.c === null && /to (build|compute)\) \[BP26\]$/.test(r.t); }), "and puts the five metrics back to UNMEASURED with their old sources");
ok(q1(w, "SELECT COUNT(*) n FROM human_actions WHERE slug = 'bp26-retention-enforce'").n === 0 && metric(w, "other_metric").t === "someone else", "and removes the card without touching other rows");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
