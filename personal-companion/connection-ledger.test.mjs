// personal-companion 1.10.0 CONNECTION-LEDGER-1 step 2 / CONNECTION-ENGAGEMENT-1 suite (charter pillar: personal).
// Proves: a due Ledger person becomes one follow-up owner question (template text, priority 4, ref <id>-<ISO week>); at most one
// new follow-up a day; the same person is not asked twice in a week; nobody due queues nothing; Ledger rows are only read; the
// metrics are written to metric_registry (answer rate n/a under 6 sent, 48h answer window, kinds filtered) and the migration applies
// cleanly and idempotently. Run: node personal-companion/connection-ledger.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};")).toString("base64"));
const { queueLedgerFollowUp, refreshConnectionMetrics, isoWeekKey } = mod;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const wrap = (db, log) => ({ prepare(sql) { if (log) log.push(sql); const mk = (args) => ({
  bind: (...a) => mk(a),
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  first: async () => db.prepare(sql).get(...args) || null,
  all: async () => ({ results: db.prepare(sql).all(...args) }) }); return mk([]); } });
const OQ = "CREATE TABLE owner_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref TEXT, subject TEXT NOT NULL, body TEXT NOT NULL, priority INTEGER DEFAULT 5, not_before TEXT, created_at TEXT DEFAULT (datetime('now')), sent_at TEXT, attempts INTEGER DEFAULT 0, last_error TEXT, UNIQUE(kind, ref))";
function setup() {
  const p = new DatabaseSync(":memory:"), a = new DatabaseSync(":memory:"), psql = [];
  p.exec("CREATE TABLE ledger_people (id TEXT PRIMARY KEY, name TEXT, met_where TEXT, status TEXT DEFAULT 'active'); CREATE TABLE ledger_interactions (person_id TEXT, kind TEXT DEFAULT 'in_person');");
  p.exec("CREATE VIEW v_ledger_due AS SELECT id, name, met_where, 30 AS days_since FROM ledger_people WHERE status = 'active' ORDER BY id");
  p.exec("CREATE VIEW v_ledger_seen_twice AS SELECT (SELECT COUNT(*) FROM (SELECT person_id FROM ledger_interactions WHERE kind='in_person' GROUP BY person_id HAVING COUNT(*)>=2)) AS seen_twice");
  a.exec(OQ); a.exec("CREATE TABLE calendar_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, cal_id INTEGER, ts TEXT DEFAULT (datetime('now')))");
  a.exec("CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT)");
  a.exec("INSERT INTO metric_registry (metric) VALUES ('ledger_people_seen_twice'), ('owner_question_answer_rate_14d')");
  return { p, a, psql, env: { PERSONAL: wrap(p, psql), AUDIT: wrap(a) } };
}
const noon = new Date("2026-10-06T10:00:00Z").getTime();
let T = setup();
let r = await queueLedgerFollowUp(T.env, noon); ok(r.skipped === "nobody due" && r.queued === 0, "nobody due queues nothing");
T.p.exec("INSERT INTO ledger_people (id, name, met_where) VALUES ('anna-2026-10-01','Anna','the climbing gym'), ('bo-2026-10-02','Bo','')");
r = await queueLedgerFollowUp(T.env, noon);
let q = T.a.prepare("SELECT * FROM owner_questions").all();
ok(r.queued === 1 && q.length === 1, "one follow-up queued (" + JSON.stringify(r) + ")");
ok(q[0].kind === "follow-up" && q[0].ref === "anna-2026-10-01-2026-W41" && q[0].subject === "Message Anna?" && q[0].priority === 4, "kind, ref with ISO week, subject, priority 4 (" + q[0].ref + ")");
ok(/Hi Anna, good to meet you at the climbing gym\. Want to get a coffee sometime\?/.test(q[0].body) && /Replying here is not needed\./.test(q[0].body), "template draft plus the reply-not-needed sentence");
T.a.exec("UPDATE owner_questions SET created_at = '2026-10-06 10:00:00'");
r = await queueLedgerFollowUp(T.env, noon + 36e5); ok(r.skipped === "daily cap" && T.a.prepare("SELECT count(*) n FROM owner_questions").get().n === 1, "cap: one new follow-up per day");
T.a.exec("UPDATE owner_questions SET created_at = '2026-10-04 10:00:00'");
r = await queueLedgerFollowUp(T.env, noon); q = T.a.prepare("SELECT ref FROM owner_questions ORDER BY id").all();
ok(r.queued === 1 && q.length === 2 && /^bo-2026-10-02-/.test(q[1].ref), "next day the next person (same week's first person is not asked twice)");
ok(!T.psql.some((s) => /(insert|update|delete|drop|alter|create)\b/i.test(s)), "Ledger database is only read");
T = setup(); T.p.prepare("INSERT INTO ledger_people (id, name, met_where) VALUES (?,?,?)").run("x", "Ev\u0007il\nName", "a\nb");
await queueLedgerFollowUp(T.env, noon); q = T.a.prepare("SELECT subject, body FROM owner_questions").get();
ok(q.subject === "Message Ev il Name?" && !/[\u0007]/.test(q.body), "control characters in names are flattened");
ok(isoWeekKey(Date.UTC(2026, 0, 1)) === "2026-W01" && isoWeekKey(Date.UTC(2025, 11, 29)) === "2026-W01" && isoWeekKey(Date.UTC(2027, 0, 1)) === "2026-W53", "ISO week key at year boundaries");

// metrics
T = setup();
T.p.exec("INSERT INTO ledger_interactions VALUES ('a','in_person'),('a','in_person'),('b','in_person'),('c','message'),('c','message')");
r = await refreshConnectionMetrics(T.env);
ok(r.seen_twice === 1 && T.a.prepare("SELECT last_value FROM metric_registry WHERE metric='ledger_people_seen_twice'").get().last_value === "1", "ledger_people_seen_twice written (1)");
ok(r.answer_rate === null && T.a.prepare("SELECT last_value FROM metric_registry WHERE metric='owner_question_answer_rate_14d'").get().last_value === "n/a", "answer rate is n/a under 6 sent");
const send = (kind, ref, ago) => T.a.prepare("INSERT INTO owner_questions (kind, ref, subject, body, sent_at) VALUES (?,?,?,?, datetime('now', ?))").run(kind, ref, "s", "b", ago);
for (let i = 1; i <= 6; i++) send(i % 2 ? "after-event" : "triage", String(i), "-3 days");
send("follow-up", "99", "-3 days"); send("after-event", "50", "-20 days");
T.a.exec("INSERT INTO calendar_feedback (cal_id, ts) VALUES (1, datetime('now','-3 days','+1 hour')), (2, datetime('now','-3 days','+47 hours')), (3, datetime('now','-3 days','+49 hours')), (4, datetime('now','-3 days','-1 hour')), (99, datetime('now','-3 days','+1 hour')), (50, datetime('now','-20 days','+1 hour'))");
r = await refreshConnectionMetrics(T.env);
ok(r.answer_rate === 0.333, "2 of 6 answered within 48h, follow-up and old rows excluded (" + r.answer_rate + ")");
ok(T.a.prepare("SELECT last_value FROM metric_registry WHERE metric='owner_question_answer_rate_14d'").get().last_value === "0.333", "answer rate written");
r = await refreshConnectionMetrics({ PERSONAL: T.env.PERSONAL }); ok(r.answer_rate === null && !r.error, "no AUDIT binding is a skip");

// migration
{
  const sql = readFileSync(new URL("../migrations/2026-10-04-personal-connection-metrics.sql", import.meta.url), "utf8");
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE metric_registry(metric TEXT PRIMARY KEY,layer,kind,formula,source_of_truth,baseline,target,owner,disposition_actor,refresh_cadence,warning_band,kill_band,last_value,last_refreshed,state,refresh_class); CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title, source_table, operator, threshold REAL, priority INTEGER, action, owner, queue_target, cooldown_hours INTEGER, enabled INTEGER, notes, created_at TEXT DEFAULT (datetime('now')))");
  d.exec(sql); d.exec(sql);
  ok(d.prepare("SELECT count(*) n FROM metric_registry").get().n === 2 && d.prepare("SELECT count(*) n FROM analytics_metric_triggers").get().n === 2, "migration applies twice with no duplicates");
  const t = d.prepare("SELECT action FROM analytics_metric_triggers WHERE metric_key='owner_question_answer_rate_14d'").get().action;
  const anchor = /code-anchor: (.*)$/m.exec(t)[1];
  ok(/code-task: repo=qnfo-workers path=personal-companion\/worker\.js/.test(t) && src.split(anchor).length === 2, "code-anchor occurs exactly once in worker.js");
}
console.log(pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
