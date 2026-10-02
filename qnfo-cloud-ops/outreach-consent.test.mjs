// OUTREACH-CONSENT-1 + OUTREACH-SHARED-CAP-1 + OUTREACH-OPTOUT-EVIDENCE-1 offline suite for qnfo-cloud-ops jobOutreach.
// Drives the real job against in-memory SQLite D1 shims (qnfo-audit as AUDIT, qnfo-outreach as OUTREACH) with a
// recording SEND_EMAIL and proves: the kill switch holds; every first mail and follow-up carries the opt-out line;
// the follow-up subject is "Following up:", never "Re:"; suppressed addresses (email_suppression, contact_ledger,
// qnfo-outreach contacts) are never mailed; the shared 8/day and 3/day-per-domain caps hold across both engines; and
// each send leaves a cloud_ops_events row keyed by message_id whose meta records opt_out, so the #1710 DoD probes
// (also run here, verbatim) can measure the opt-out line from D1. Synthetic data only.
// Run: node qnfo-cloud-ops/outreach-consent.test.mjs   -> prints "N passed, 0 failed" (Node 22: node:sqlite)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const IMPORT = 'import { connect } from "cloudflare:sockets";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const patched = src.replace(IMPORT, "var connect = function () { throw new Error('sockets are stubbed in this test'); };") +
  "\nexport { jobOutreach as __jobOutreach, OUTREACH_OPT_OUT as __OPT_OUT };\n";
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));
const jobOutreach = mod.__jobOutreach;
const OPT_OUT = mod.__OPT_OUT;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

function stmtOn(dbx, sql) {
  let args = [];
  const self = {
    bind(...a) { args = a.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v)); return self; },
    async all() { return { results: dbx.prepare(sql).all(...args) }; },
    async first() { return dbx.prepare(sql).get(...args) || null; },
    async run() { const r = dbx.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
  };
  return self;
}
const shim = (dbx) => ({ prepare: (sql) => stmtOn(dbx, sql) });

function fresh(killSwitch) {
  const audit = new DatabaseSync(":memory:");
  audit.exec(`CREATE TABLE scheduler_state (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE outreach_queue (id TEXT PRIMARY KEY, paper_id TEXT, author TEXT, email TEXT, reason TEXT, status TEXT, created_at TEXT, sent_at TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE outreach_log (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, subject TEXT, message_id TEXT, sent_at TEXT, status TEXT);
    CREATE TABLE contact_ledger (email TEXT PRIMARY KEY, name TEXT, affiliation TEXT, first_contact TEXT, last_contact TEXT, contact_count INTEGER DEFAULT 0, status TEXT, suppress_reason TEXT, person_key TEXT, last_reply_at TEXT, suppress INTEGER DEFAULT 0, reply_count INTEGER DEFAULT 0);
    CREATE TABLE email_suppression (email TEXT PRIMARY KEY, reason TEXT, source TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
    CREATE TABLE deployment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, resource_type TEXT, resource_name TEXT, action TEXT, version_id TEXT, deployed_by TEXT, deployed_at TEXT DEFAULT (datetime('now')), status TEXT DEFAULT 'success', notes TEXT);`);
  const outreach = new DatabaseSync(":memory:");
  outreach.exec(`CREATE TABLE pipeline_state (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT, suppress INTEGER DEFAULT 0, suppress_reason TEXT);
    CREATE TABLE sends (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id TEXT, contact_id INTEGER, kind TEXT, subject TEXT, body TEXT, status TEXT DEFAULT 'draft', message_id TEXT, sent_at TEXT, created_at TEXT);`);
  outreach.prepare("INSERT INTO pipeline_state (key, value, updated_at) VALUES ('external_sends_enabled', ?, datetime('now'))").run(killSwitch);
  const sent = [];
  const env = {
    AUDIT: shim(audit), OUTREACH: shim(outreach),
    SEND_EMAIL: { async send(m) { sent.push(m); return { messageId: "<t" + sent.length + "@qnfo.org>" }; } }
  };
  let n = 0;
  const queue = (email, status) => audit.prepare("INSERT INTO outreach_queue (id, paper_id, author, email, reason, status, created_at) VALUES (?, ?, 'A. Author', ?, 'test reason', ?, datetime('now', ?))")
    .run("aq-" + (++n), "2609." + String(10000 + n) + "v1", email, status || "pending", "-" + (100 - n) + " minutes");
  return { audit, outreach, env, sent, queue };
}
const qStatus = (t, email) => (t.audit.prepare("SELECT status FROM outreach_queue WHERE email = ?").get(email) || {}).status;
const isRe = (s) => /^\s*Re:/i.test(String(s || ""));

// The two #1710 DoD probes exactly as reported (read-only; no semicolon). PROBE_BUILD: the first post-resume send and
// whether the qnfo-cloud-ops build live at that instant carries the opt-out line (works for sends by 1.16.4, which
// records no evidence). PROBE_EVIDENCE: every post-resume send that left OUTREACH-OPTOUT-EVIDENCE-1 evidence (1.16.5+).
const PROBE_EVIDENCE = "SELECT COUNT(*) AS sends_since_resume, COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS expected_with_opt_out, COALESCE(SUM(CASE WHEN json_extract(e.meta, '$.opt_out') = 1 THEN 1 ELSE 0 END), 0) AS observed_with_opt_out, 0 AS expected_fake_re, COALESCE(SUM(CASE WHEN LTRIM(COALESCE(o.subject, '')) LIKE 'Re:%' THEN 1 ELSE 0 END), 0) AS observed_fake_re FROM outreach_log o LEFT JOIN cloud_ops_events e ON e.kind = 'outreach' AND COALESCE(o.message_id, '') <> '' AND json_extract(e.meta, '$.message_id') = o.message_id WHERE o.sent_at >= '2026-10-01 10:41:21' AND o.status IN ('sent', 'followup', 'replied', 'rejected')";
const PROBE_BUILD = "SELECT x.id, x.email, x.subject, x.sent_at, x.status, x.live_build, 1 AS expected_build_has_opt_out, CASE WHEN x.live_build IS NOT NULL AND x.live_build NOT IN (SELECT version_id FROM deployment_history WHERE resource_name = 'qnfo-cloud-ops' AND version_id IS NOT NULL AND datetime(deployed_at) < datetime('2026-10-01 10:39:18')) THEN 1 ELSE 0 END AS observed_build_has_opt_out, 0 AS expected_fake_re, CASE WHEN LTRIM(COALESCE(x.subject, '')) LIKE 'Re:%' THEN 1 ELSE 0 END AS observed_fake_re FROM (SELECT o.id, o.email, o.subject, o.sent_at, o.status, (SELECT d.version_id FROM deployment_history d WHERE d.resource_name = 'qnfo-cloud-ops' AND d.action = 'deploy' AND d.status = 'success' AND datetime(d.deployed_at) <= datetime(o.sent_at) ORDER BY datetime(d.deployed_at) DESC, d.id DESC LIMIT 1) AS live_build FROM outreach_log o WHERE o.sent_at >= '2026-10-01 10:41:21' AND o.status IN ('sent', 'followup', 'replied', 'rejected') ORDER BY o.sent_at ASC, o.id ASC LIMIT 1) x";

ok(typeof OPT_OUT === "string" && /stop/i.test(OPT_OUT), "OUTREACH_OPT_OUT is a non-empty opt-out line");

// 1. Kill switch off: nothing is mailed.
{
  const t = fresh("0");
  t.queue("a@uni-a.edu");
  const r = await jobOutreach(t.env);
  ok(r.status === "gated" && t.sent.length === 0, "external_sends_enabled=0 gates every send");
}

// 2. First mails: opt-out line, suppression, dedupe, shared caps, evidence.
{
  const t = fresh("1");
  t.queue("first@uni-a.edu");
  t.queue("opted@uni-b.edu");
  t.audit.prepare("INSERT INTO email_suppression (email, reason, source) VALUES ('opted@uni-b.edu', 'reply-stop', 'reply-scan')").run();
  t.queue("held@uni-c.edu");
  t.outreach.prepare("INSERT INTO contacts (email, suppress, suppress_reason) VALUES ('held@uni-c.edu', 1, 'reply-stop')").run();
  t.queue("old@uni-d.edu");
  t.audit.prepare("INSERT INTO outreach_log (email, subject, message_id, sent_at, status) VALUES ('old@uni-d.edu', 'x', '<old@qnfo.org>', '2026-09-20 09:00:00', 'sent')").run();
  for (const p of ["d1", "d2", "d3", "d4"]) t.queue(p + "@same.edu");
  for (const p of ["b1@one.org", "b2@two.org", "b3@three.org", "b4@four.org", "b5@five.org"]) t.queue(p);
  const r = await jobOutreach(t.env);
  const to = t.sent.map((m) => m.to);
  ok(t.sent.length === 8, "shared daily cap: exactly 8 mails (got " + t.sent.length + ")");
  ok(r.status === "capped", "a cap-limited drain reports capped (got " + r.status + ")");
  ok(t.sent.every((m) => String(m.text).includes(OPT_OUT)), "every first mail carries the opt-out line");
  ok(t.sent.every((m) => !isRe(m.subject)), "no first mail subject starts with Re:");
  ok(!to.includes("opted@uni-b.edu") && qStatus(t, "opted@uni-b.edu") === "skipped-suppressed", "email_suppression is honoured");
  ok(!to.includes("held@uni-c.edu") && qStatus(t, "held@uni-c.edu") === "skipped-suppressed", "qnfo-outreach contacts.suppress is honoured");
  ok(!to.includes("old@uni-d.edu") && qStatus(t, "old@uni-d.edu") === "skipped-dup", "an already contacted address is not mailed again");
  ok(to.filter((e) => e.endsWith("@same.edu")).length === 3 && qStatus(t, "d4@same.edu") === "pending", "3/day per-domain cap; the 4th stays queued");
  ok(!to.includes("b5@five.org") && qStatus(t, "b5@five.org") === "pending", "the 9th eligible row waits for the next day");
  const logs = t.audit.prepare("SELECT email, message_id FROM outreach_log WHERE status = 'sent' AND sent_at >= '2026-10-01 10:41:21'").all();
  ok(logs.length === 8, "8 outreach_log rows written");
  const ev = t.audit.prepare("SELECT meta FROM cloud_ops_events WHERE kind = 'outreach'").all().map((r) => JSON.parse(r.meta));
  ok(ev.length === 8, "one evidence event per send, no id collision (got " + ev.length + ")");
  ok(logs.every((l) => ev.some((m) => m.message_id === l.message_id && m.email === l.email && m.opt_out === true && m.fake_re === false && m.send === "first")), "each send's evidence is keyed by message_id and records opt_out=true, fake_re=false");
  const p = t.audit.prepare(PROBE_EVIDENCE).get();
  ok(p.sends_since_resume === 8 && p.expected_with_opt_out === 8 && p.observed_with_opt_out === 8 && p.observed_fake_re === 0, "DoD probe (evidence): 8 sends, 8 with opt-out, no Re:");
  // A send without evidence (as 1.16.4 makes) is counted but not expected; a reply flipping status keeps the row in.
  t.audit.prepare("INSERT INTO outreach_log (email, subject, message_id, sent_at, status) VALUES ('legacy@uni-e.edu', 'QNFO', '<legacy@qnfo.org>', datetime('now'), 'sent')").run();
  t.audit.prepare("UPDATE outreach_log SET status = 'replied' WHERE email = 'first@uni-a.edu'").run();
  const p2 = t.audit.prepare(PROBE_EVIDENCE).get();
  ok(p2.sends_since_resume === 9 && p2.expected_with_opt_out === 8 && p2.observed_with_opt_out === 8, "DoD probe (evidence): evidence-less and replied rows handled");
  // Build-ledger probe: the build live at the send carries the opt-out; a rollback to a pre-consent build does not.
  t.audit.exec(`INSERT INTO deployment_history (resource_name, action, version_id, deployed_at, status) VALUES
    ('qnfo-cloud-ops', 'deploy', '1.15.7-radar-truthful', '2026-10-01T08:13:39.236Z', 'success'),
    ('qnfo-cloud-ops', 'deploy', '1.15.8-outreach-consent', '2026-10-01T10:39:18.612Z', 'success'),
    ('qnfo-cloud-ops', 'deploy', '1.16.4-capability-contract', '2026-10-01T21:38:53.846Z', 'success')`);
  const b = t.audit.prepare(PROBE_BUILD).get();
  ok(b && b.live_build === "1.16.4-capability-contract" && b.observed_build_has_opt_out === 1 && b.observed_fake_re === 0, "DoD probe (build ledger): live build carries the opt-out");
  t.audit.prepare("INSERT INTO deployment_history (resource_name, action, version_id, deployed_at, status) VALUES ('qnfo-cloud-ops', 'deploy', '1.15.7-radar-truthful', '2026-10-01T22:00:00Z', 'success')").run();
  ok(t.audit.prepare(PROBE_BUILD).get().observed_build_has_opt_out === 0, "DoD probe (build ledger): a rollback to a pre-consent build reads 0");
  // A second run the same day sends nothing more (the cap is per UTC day, shared across runs).
  const before = t.sent.length;
  await jobOutreach(t.env);
  ok(t.sent.length === before, "a second run on the same UTC day sends nothing");
}

// 3. Follow-ups: one honest follow-up, opt-out line, suppression, replied excluded, evidence.
{
  const t = fresh("1");
  const legacy = "Re: QNFO — the energy-efficiency benchmark for quantum computing";
  t.audit.prepare("INSERT INTO outreach_log (email, subject, message_id, sent_at, status) VALUES ('f1@x.edu', ?, '<f1@qnfo.org>', datetime('now', '-20 days'), 'sent')").run(legacy);
  t.audit.prepare("INSERT INTO outreach_log (email, subject, message_id, sent_at, status) VALUES ('f2@y.edu', 'QNFO', '<f2@qnfo.org>', datetime('now', '-20 days'), 'sent')").run();
  t.audit.prepare("INSERT INTO contact_ledger (email, suppress, suppress_reason) VALUES ('f2@y.edu', 1, 'opt-out')").run();
  t.audit.prepare("INSERT INTO outreach_log (email, subject, message_id, sent_at, status) VALUES ('f3@z.edu', 'QNFO', '<f3@qnfo.org>', datetime('now', '-20 days'), 'replied')").run();
  t.audit.prepare("INSERT INTO outreach_log (email, subject, message_id, sent_at, status) VALUES ('f4@w.edu', 'QNFO', '<f4@qnfo.org>', datetime('now', '-3 days'), 'sent')").run();
  await jobOutreach(t.env);
  ok(t.sent.length === 1 && t.sent[0].to === "f1@x.edu", "only the eligible address gets a follow-up (got " + t.sent.map((m) => m.to).join(",") + ")");
  ok(t.sent[0] && t.sent[0].subject === "Following up: QNFO — the energy-efficiency benchmark for quantum computing", "follow-up subject is 'Following up:' with the legacy Re: stripped");
  ok(t.sent[0] && String(t.sent[0].text).includes(OPT_OUT), "the follow-up carries the opt-out line");
  ok(t.audit.prepare("SELECT status FROM outreach_log WHERE email = 'f2@y.edu'").get().status === "rejected", "a suppressed address is never followed up (row rejected)");
  const ev = t.audit.prepare("SELECT meta FROM cloud_ops_events WHERE kind = 'outreach'").all().map((r) => JSON.parse(r.meta));
  ok(ev.length === 1 && ev[0].send === "followup" && ev[0].opt_out === true && ev[0].fake_re === false && ev[0].message_id === "<t1@qnfo.org>", "the follow-up leaves evidence keyed by message_id");
  await jobOutreach(t.env);
  ok(t.sent.length === 1, "one follow-up only: a second run does not follow up again");
}

// 4. The shared cap counts the other engine (qnfo-outreach sends) too.
{
  const t = fresh("1");
  for (let i = 0; i < 8; i++) {
    t.outreach.prepare("INSERT INTO contacts (email) VALUES (?)").run("c" + i + "@other" + i + ".org");
    t.outreach.prepare("INSERT INTO sends (contact_id, kind, status, sent_at) VALUES (?, 'rfc', 'sent', datetime('now'))").run(i + 1);
  }
  t.queue("late@uni-z.edu");
  const r = await jobOutreach(t.env);
  ok(t.sent.length === 0 && r.status === "capped", "8 sends by qnfo-outreach today leave no room for this engine");
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
