// US-08 / charter pillar personal. Synthetic handler evidence, never live delivery evidence.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { importWorker } from "../personal-companion/_harness-import-worker.mjs";

const emailSource = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mail = await import("data:text/javascript;base64," + Buffer.from(emailSource + `
const privacyCalls = {};
const watch = (name, fn) => (...args) => { privacyCalls[name] = (privacyCalls[name] || 0) + 1; return fn(...args); };
storeEmail = watch("storeEmail", storeEmail); archiveRaw = watch("archiveRaw", archiveRaw);
processCommand = watch("processCommand", processCommand); enqueueHumanReply = watch("enqueueHumanReply", enqueueHumanReply);
itineraryIngest = watch("itineraryIngest", itineraryIngest); enqueueHandoff = watch("enqueueHandoff", enqueueHandoff);
recordParseFailure = watch("recordParseFailure", recordParseFailure);
export { drainCalendarMail, privacyCalls };
`).toString("base64"));
const email = mail.default;
const stores = [];
const database = () => {
  const db = new DatabaseSync(":memory:");
  stores.push(db);
  return db;
};
function d1(db, queries = []) {
  return {
    prepare(sql) {
      queries.push(sql);
      let args = [];
      const stmt = {
        bind(...values) { args = values.map(value => value === undefined ? null : value); return stmt; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        execute() {
          const result = db.prepare(sql).run(...args);
          return { success: true, meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) } };
        },
        async run() { return stmt.execute(); }
      };
      return stmt;
    },
    async batch(statements) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(statement => statement.execute());
        db.exec("COMMIT");
        return results;
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    }
  };
}
function context() {
  const pending = [];
  return { waitUntil(promise) { pending.push(promise); }, async drain() { await Promise.all(pending); } };
}
const iso = value => assert.equal(new Date(value).toISOString(), value);
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => {
  networkCalls++;
  throw new Error("US-08 forbids real network/provider calls");
};
const evidence = { email: {}, calendar: {}, brief: {}, gaps: [] };
try {
  const audit = database();
  audit.exec(`
    CREATE TABLE emails(id INTEGER PRIMARY KEY, message_id TEXT UNIQUE, sender TEXT, recipient TEXT,
      subject TEXT, body_text TEXT, body_html TEXT, headers_json TEXT, classification TEXT, received_at TEXT,
      status TEXT, in_reply_to TEXT, references_hdr TEXT, processing_ms INTEGER);
    CREATE TABLE email_filters(id INTEGER PRIMARY KEY, enabled INTEGER, priority INTEGER);
    CREATE TABLE email_command_senders(pattern TEXT, kind TEXT, enabled INTEGER);
    CREATE TABLE email_commands(id INTEGER PRIMARY KEY, email_id INTEGER, message_id TEXT, in_reply_to TEXT,
      sender TEXT, recipient TEXT, subject TEXT, verb TEXT, command_text TEXT, status TEXT, result TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT);
    CREATE TABLE email_raw_archive(email_id INTEGER UNIQUE, message_id TEXT, raw_text TEXT, raw_size INTEGER, created_at TEXT);
    CREATE TABLE email_parse_failures(email_id INTEGER, sender TEXT, subject TEXT, status TEXT, resolved_at TEXT, notes TEXT);
    CREATE TABLE email_suppression(email TEXT PRIMARY KEY);
    CREATE TABLE email_reply_queue(id INTEGER PRIMARY KEY, email_id INTEGER, sender TEXT, subject TEXT, draft_text TEXT,
      skip_reason TEXT, decision TEXT, sent_at TEXT, created_at TEXT, tier INTEGER);
    CREATE TABLE contact_ledger(email TEXT, suppress INTEGER);
    CREATE TABLE cron_fire_log(cron_name TEXT, task_id TEXT, cron_expr TEXT, fired_at TEXT, fired_epoch_ms INTEGER,
      outcome TEXT, source TEXT, note TEXT);
  `);
  const migration = readFileSync(new URL("../migrations/2026-10-25-personal-invite-reminders.sql", import.meta.url), "utf8");
  audit.exec(migration.split("-- Registry statements")[0]);
  audit.exec(`
    CREATE VIEW v_stuck_summary AS SELECT 13 AS newer_shared_logic_sentinel;
    CREATE TABLE queue_sla(stuck_type TEXT PRIMARY KEY,queue TEXT,definition TEXT,cycle_min INTEGER,sla_min INTEGER,
      auto_fix TEXT,owner TEXT,summary_column TEXT);
    CREATE TABLE metric_registry(metric TEXT PRIMARY KEY,layer TEXT,kind TEXT,formula TEXT,source_of_truth TEXT,
      target TEXT,owner TEXT,disposition_actor TEXT,refresh_cadence TEXT,state TEXT,last_value TEXT,last_refreshed TEXT);
    CREATE TABLE analytics_metric_triggers(metric_key TEXT PRIMARY KEY,title TEXT,source_table TEXT,operator TEXT,
      threshold REAL,priority INTEGER,action TEXT,owner TEXT,queue_target TEXT,cooldown_hours INTEGER,enabled INTEGER,notes TEXT);
    CREATE TABLE fleet_tasks(id TEXT PRIMARY KEY,name TEXT,type TEXT,definition TEXT,timeout_ms INTEGER,retries INTEGER,
      version INTEGER,enabled INTEGER,updated_at TEXT);
    CREATE TABLE fleet_crons(name TEXT PRIMARY KEY,cron_expr TEXT,task_id TEXT,enabled INTEGER,timezone TEXT,updated_at TEXT);
    CREATE TABLE failure_modes(fm_key TEXT PRIMARY KEY,failure_mode TEXT,root_cause TEXT,remediation TEXT,detector TEXT,
      probe_class TEXT,first_seen TEXT,trigger_condition TEXT,symptom TEXT,blast_radius TEXT);
    CREATE TABLE remediation_contracts(class TEXT PRIMARY KEY,precondition TEXT,action TEXT,verify_probe TEXT,
      verify_transport TEXT,max_attempts INTEGER,escalate_to TEXT,expected_cadence_h INTEGER,status TEXT,module TEXT);
    CREATE TABLE capability_ledger(capability TEXT PRIMARY KEY,provenance TEXT,prerequisites TEXT,reliability TEXT,
      acquired_at TEXT,evidence TEXT);
    CREATE TABLE decision_log(actor TEXT,assumption TEXT,action TEXT,evidence TEXT,outcome TEXT,blast_radius TEXT,
      rollback_path TEXT,capability_gain TEXT,predicted_outcome TEXT,reach_gain TEXT,surfaces_tested TEXT);
    CREATE TABLE session_records(session_id TEXT PRIMARY KEY,wbs_code TEXT,agent_name TEXT,summary TEXT,
      decisions_made TEXT,files_changed TEXT,commits TEXT,infrastructure_changes TEXT,handoff_notes TEXT,
      execution_ratio REAL,total_tasks INTEGER,completed_tasks INTEGER,started_at TEXT,completed_at TEXT);
  `);
  const doctrine = readFileSync(new URL("../migrations/2026-10-08-12-doctrine.sql", import.meta.url), "utf8");
  for (const table of ["control_registry", "belief_registry", "spof_registry"])
    audit.exec(new RegExp("CREATE TABLE IF NOT EXISTS " + table + " \\([\\s\\S]*?\\);").exec(doctrine)[0]);
  const sharedView = audit.prepare("SELECT sql FROM sqlite_master WHERE name='v_stuck_summary'").get().sql;
  audit.exec(migration);
  audit.exec(migration);
  assert.equal(audit.prepare("SELECT sql FROM sqlite_master WHERE name='v_stuck_summary'").get().sql, sharedView);
  const extended = audit.prepare("SELECT * FROM v_stuck_summary_personal_calendar").get();
  assert.equal(extended.newer_shared_logic_sentinel, 13);
  assert.equal(extended.personal_calendar_delivery_over_120m, 0);
  assert.equal(extended.personal_calendar_delivery_oldest_min, 0);
  assert.equal(audit.prepare("SELECT count(*) n FROM decision_log").get().n, 1, "migration registration is rerunnable");
  assert.equal(audit.prepare("SELECT count(*) n FROM session_records").get().n, 1);
  assert.match(audit.prepare("SELECT handoff_notes FROM session_records").get().handoff_notes, /not established/);
  assert.equal(audit.prepare("SELECT sla_min FROM queue_sla WHERE stuck_type='personal-calendar-delivery'").get().sla_min, 120);
  const observer = JSON.parse(audit.prepare("SELECT definition FROM fleet_tasks WHERE id='personal-calendar-monitor'").get().definition);
  const measure = () => { for (const step of observer.steps) audit.exec(step.sql); };
  const preferences = database();
  preferences.exec(`CREATE TABLE wellbeing_config(key TEXT PRIMARY KEY,value TEXT);
    INSERT INTO wellbeing_config VALUES('email_mode','"all"');`);
  // This known-owner fixture avoids the unrelated human-correspondence queue. SEND_EMAIL is a local array only.
  const sender = "rwnquni@outlook.com";
  audit.prepare("INSERT INTO email_command_senders VALUES(?,'owner',1)").run(sender);
  const sent = [];
  let providerFailure = false, providerHook = null;
  const env = { AUDIT_DB: d1(audit), PERSONAL: d1(preferences),
    AI: { async run() { assert.fail("calendar mail must not reach a model"); } },
    SEND_EMAIL: { async send(message) {
      if (providerFailure) throw new Error("synthetic provider failure");
      if (providerHook) await providerHook(message);
      sent.push({ ...message, accepted_at: new Date().toISOString() });
      return { messageId: "synthetic-provider-" + sent.length };
    } } };
  const deliver = async (id, command, auth = "pass") => {
    const headers = new Headers({
      subject: "Synthetic US08 command", "message-id": id,
      "authentication-results": "mx.cloudflare.net; dmarc=" + auth + " header.from=outlook.com"
    });
    const raw = "Content-Type: text/plain; charset=utf-8\r\n\r\n" + command;
    const ctx = context();
    await email.email({
      from: sender, to: "qnfo@qnfo.org", headers,
      raw: new Blob([raw]).stream(), rawSize: raw.length,
      setReject(reason) { assert.fail("synthetic command rejected: " + reason); }
    }, env, ctx);
    await ctx.drain();
  };
  await deliver("<synthetic-inbox-us08@fixture.invalid>", "inbox");
  const row = audit.prepare("SELECT * FROM email_commands").get();
  assert.equal(row.verb, "inbox");
  assert.equal(row.status, "done");
  assert.match(JSON.parse(row.result).text, /QNFO inbox \(1 total\)/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, sender);
  assert.match(sent[0].text, /QNFO command: inbox/);
  assert.match(sent[0].text, /Synthetic US08 command/);
  iso(sent[0].accepted_at);
  iso(audit.prepare("SELECT received_at FROM emails").get().received_at);
  assert.equal(audit.prepare("SELECT count(*) n FROM email_raw_archive").get().n, 1);
  evidence.email = { inbound: "stored", command: "inbox executed against synthetic SQLite", status: row.status, mock_ack_at: sent[0].accepted_at };

  const jobs = [];
  env.OPS = {
    async fetch(url, init) {
      jobs.push({ url: String(url), method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
      if (init.method === "POST") return Response.json({ id: "synthetic-job-us08" }, { status: 202 });
      return Response.json({ status: "succeeded", response: "SYNTHETIC-EXECUTED-US08" });
    }
  };
  env.AGENT_POLLS = "1";
  await deliver("<synthetic-action-us08@fixture.invalid>", "do synthetic acceptance action");
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].method, "POST");
  assert.equal(jobs[0].body.messages[0].content, "do synthetic acceptance action");
  assert.equal(jobs[1].method, "GET");
  assert.match(sent[1].text, /SYNTHETIC-EXECUTED-US08/);
  assert.equal(audit.prepare("SELECT status FROM email_commands ORDER BY id DESC").get().status, "done");
  await deliver("<synthetic-refused-us08@fixture.invalid>", "do synthetic acceptance action", "fail");
  assert.equal(jobs.length, 2, "unauthenticated owner command must never reach OPS");
  assert.match(sent[2].text, /owner sender not authenticated/);
  assert.equal(audit.prepare("SELECT status FROM email_commands ORDER BY id DESC").get().status, "error");
  evidence.email.action = "mock OPS succeeded; actual inbound handler polled and acknowledged it";
  for (const name of ["storeEmail", "archiveRaw", "processCommand", "enqueueHumanReply", "itineraryIngest", "enqueueHandoff", "recordParseFailure"])
    assert(mail.privacyCalls[name] > 0, name + " sentinel must have a generic-mail positive control");
  const genericCalls = { ...mail.privacyCalls }, genericJobs = jobs.length;
  const genericCounts = Object.fromEntries(["emails", "email_raw_archive", "email_commands", "email_reply_queue"]
    .map(table => [table, audit.prepare("SELECT count(*) n FROM " + table).get().n]));
  const marker = "SYNTHETIC-PRIVATE-CALENDAR-US08";
  const start = new Date(Date.now() + 3 * 864e5).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const invite = (sequence = 0, method = "REQUEST", extra = "", uid = "synthetic-us08") => [
    "BEGIN:VCALENDAR", "VERSION:2.0", "METHOD:" + method, "BEGIN:VEVENT", "UID:" + uid, "SEQUENCE:" + sequence,
    "SUMMARY:" + marker, "DTSTART:" + start, "DESCRIPTION:PRIVATE-HISTORY-US08", extra,
    "END:VEVENT", "END:VCALENDAR"
  ].filter(Boolean).join("\r\n");
  const receive = async (ics, { auth = "pass", from = sender, type = "text/calendar", cte = "", plain = "" } = {}) => {
    let rejection = null;
    const sendsBefore = sent.length;
    const raw = plain
      ? `Content-Type: multipart/mixed; boundary="fixture"\r\n\r\n--fixture\r\nContent-Type: text/plain\r\n\r\n${plain}\r\n--fixture\r\nContent-Type: ${type}; charset=utf-8\r\nContent-Transfer-Encoding: ${cte}\r\n\r\n${ics}\r\n--fixture--\r\n`
      : `Content-Type: ${type}; charset=utf-8\r\nContent-Transfer-Encoding: ${cte}\r\n\r\n${ics}`;
    const ctx = context(), queries = [];
    await email.email({ from, to: "qnfo@qnfo.org", raw: new Blob([raw]).stream(), rawSize: raw.length,
      headers: new Headers({ subject: marker, "authentication-results": "mx.cloudflare.net; dmarc=" + auth + " header.from=outlook.com" }),
      setReject(reason) { rejection = reason; }
    }, { ...env, AUDIT_DB: d1(audit, queries) }, ctx);
    await ctx.drain();
    assert.deepEqual(mail.privacyCalls, genericCalls, "calendar mail must bypass every shared archival/command/reply path");
    assert.equal(jobs.length, genericJobs, "calendar input must never become an OPS/model prompt");
    assert(!queries.some(sql => /\b(emails|email_raw_archive|email_commands|email_reply_queue|papers|research_queue)\b/i.test(sql)));
    for (const [table, n] of Object.entries(genericCounts)) assert.equal(audit.prepare("SELECT count(*) n FROM " + table).get().n, n);
    if (rejection) assert.equal(sent.length, sendsBefore, "rejected calendar input must not send any mail");
    return rejection;
  };
  const beforeCalendar = sent.length;
  assert.equal(await receive(invite()), null);
  const firstInvite = audit.prepare("SELECT * FROM email_calendar_invites").get();
  assert(!firstInvite.uid.includes("synthetic-us08"), "raw ICS UID must not be persisted");
  assert.equal(audit.prepare("SELECT plane FROM calendar WHERE uid=?").get(firstInvite.uid).plane, "personal");
  assert.equal(audit.prepare("SELECT description FROM calendar WHERE uid=?").get(firstInvite.uid).description, null);
  assert.equal(sent.length, beforeCalendar + 1);
  assert.match(sent.at(-1).text, /No RSVP/);
  assert.equal(sent.at(-1).to, sender);
  const ack = audit.prepare("SELECT * FROM email_calendar_delivery WHERE kind='ack'").get();
  assert.equal(ack.status, "sent");
  assert.equal(ack.provider_id, "synthetic-provider-" + sent.length);
  iso(ack.sent_at);
  assert.equal(audit.prepare("SELECT count(*) n FROM email_calendar_delivery WHERE kind='reminder' AND status='pending'").get().n, 2);
  assert.equal(await receive(invite()), null);
  assert.equal(sent.length, beforeCalendar + 1, "replayed UID/SEQUENCE must not send twice");
  assert.match(await receive(invite(0).replace(marker, "Conflicting title")), /conflicting/);
  assert.match(await receive(invite(1), { auth: "fail" }), /authenticated owner/);
  assert.match(await receive(invite(1), { from: "stranger@fixture.invalid" }), /authenticated owner/);
  env.COMMAND_TOKEN = "synthetic-calendar-command-token";
  assert.match(await receive(invite(1)), /COMMAND_TOKEN/);
  assert.equal(await receive(Buffer.from(invite(1)).toString("base64"), { cte: "base64", plain: env.COMMAND_TOKEN }), null);
  delete env.COMMAND_TOKEN;
  assert.equal(audit.prepare("SELECT sequence FROM email_calendar_invites").get().sequence, 1);
  assert.equal(audit.prepare("SELECT count(*) n FROM email_calendar_delivery WHERE sequence=0 AND kind='reminder' AND status='superseded'").get().n, 2);
  assert.match(await receive(invite(0)), /stale/);
  const invalid = [
    invite(2, "REQUEST", "RRULE:FREQ=DAILY"),
    invite(2).replace("DTSTART:", "DTSTART;TZID=Europe/Amsterdam:"),
    invite(2).replace(start, "20260230T120000Z"),
    invite(2).replace(start, start.slice(0, -1)),
    invite(2).replace("SEQUENCE:2", "SEQUENCE:-1"),
    invite(2).replace("END:VCALENDAR", "BEGIN:VEVENT\r\nUID:other\r\nEND:VEVENT\r\nEND:VCALENDAR"),
    invite(2).replace("END:VEVENT\r\n", ""),
    invite(2).replace("END:VCALENDAR", ""),
    invite(2, "PUBLISH"),
    invite(2, "REQUEST", "BEGIN:VALARM\r\nACTION:EMAIL\r\nEND:VALARM"),
    invite(2).replace("DTSTART:" + start, "DTSTART;VALUE=DATE:20990101")
  ];
  for (const raw of invalid) assert(await receive(raw), "malformed/unsupported calendar input must be rejected");
  assert(await receive(invite(2), { type: "application/ics" }));
  assert(await receive("%%%%", { cte: "base64" }));
  assert(await receive(Buffer.from(invite(2)).toString("base64"), {
    type: 'application/octet-stream;\r\n name="fixture.ics"', cte: "base64"
  }));
  assert(await receive(Buffer.from(invite(2)).toString("base64"), {
    type: "application/octet-stream; name*=utf-8''fixture%2Eics", cte: "base64"
  }));
  assert.equal(audit.prepare("SELECT sequence FROM email_calendar_invites").get().sequence, 1);
  assert.equal(await receive(invite(2, "CANCEL")), null);
  assert.equal(audit.prepare("SELECT status FROM calendar WHERE uid=?").get(firstInvite.uid).status, "cancelled");
  assert.equal(audit.prepare("SELECT count(*) n FROM email_calendar_delivery WHERE kind='reminder' AND status='pending'").get().n, 0);
  assert.match(await receive(invite(1)), /stale/);
  // An out-of-order cancellation retains a sequence tombstone before any request exists.
  assert.equal(await receive(invite(5, "CANCEL", "", "unknown-cancel")), null);
  assert.match(await receive(invite(4, "REQUEST", "", "unknown-cancel")), /stale/);
  assert.equal(await receive(invite(3)), null);
  audit.exec("UPDATE email_calendar_delivery SET due_at='2000-01-01T00:00:00.000Z' WHERE sequence=3 AND kind='reminder'");
  providerFailure = true;
  const failedCalendar = await mail.drainCalendarMail(env);
  assert.equal(failedCalendar.failed, 2);
  assert.equal(audit.prepare("SELECT count(*) n FROM email_calendar_delivery WHERE sequence=3 AND kind='reminder' AND sent_at IS NOT NULL").get().n, 0);
  assert.equal(audit.prepare("SELECT over_120m FROM v_personal_calendar_delivery_health").get().over_120m, 2, "retry delay must not reset the original overdue age");
  providerFailure = false;
  audit.exec("UPDATE email_calendar_delivery SET next_attempt_at=NULL WHERE sequence=3 AND kind='reminder'");
  const preDrain = sent.length;
  await Promise.all([mail.drainCalendarMail(env), mail.drainCalendarMail(env)]);
  assert.equal(sent.length, preDrain + 2, "concurrent drains claim each reminder once");
  assert.equal(audit.prepare("SELECT count(*) n FROM email_calendar_delivery WHERE sequence=3 AND kind='reminder' AND status='sent'").get().n, 2);
  assert.equal(await receive(invite(4)), null);
  audit.exec("UPDATE email_calendar_delivery SET status='sending',claimed_at='2000-01-01T00:00:00.000Z',claim_token='dead',due_at='2000-01-01T00:00:00.000Z' WHERE sequence=4 AND kind='reminder'");
  const scheduledCtxEmail = context();
  await email.scheduled({ cron: "*/15 * * * *", scheduledTime: Date.UTC(2026, 9, 25, 11, 0) }, env, scheduledCtxEmail);
  await scheduledCtxEmail.drain();
  assert.equal(audit.prepare("SELECT count(*) n FROM email_calendar_delivery WHERE sequence=4 AND kind='reminder' AND status='sent'").get().n, 2, "actual scheduled tick recovers expired claims");
  assert.equal(await receive(invite(6)), null);
  preferences.exec(`UPDATE wellbeing_config SET value='"daily"';`);
  audit.exec("UPDATE email_calendar_delivery SET due_at='2000-01-01T00:00:00.000Z' WHERE sequence=6 AND kind='reminder'");
  await mail.drainCalendarMail(env);
  assert.equal(audit.prepare("SELECT count(*) n FROM email_calendar_delivery WHERE sequence=6 AND kind='reminder' AND status='skipped' AND last_error='email-mode-not-all'").get().n, 2);
  audit.prepare("INSERT INTO email_suppression VALUES(?)").run(sender);
  const preSuppressed = sent.length;
  assert.equal(await receive(invite(7)), null);
  assert.equal(sent.length, preSuppressed, "suppression also prevents acknowledgment sends");
  assert.equal(audit.prepare("SELECT status FROM email_calendar_delivery WHERE sequence=7 AND kind='ack'").get().status, "skipped");
  audit.prepare("DELETE FROM email_suppression WHERE email=?").run(sender);
  preferences.exec(`UPDATE wellbeing_config SET value='"all"';`);
  assert.equal(await receive(invite(8)), null);
  audit.exec("UPDATE email_calendar_delivery SET due_at='2000-01-01T00:00:00.000Z' WHERE sequence=8 AND kind='reminder'; INSERT INTO calendar_meta VALUES('owner_notice_enabled','off')");
  await mail.drainCalendarMail(env);
  assert.equal(audit.prepare("SELECT count(*) n FROM email_calendar_delivery WHERE sequence=8 AND kind='reminder' AND last_error='owner-notices-disabled'").get().n, 2);
  audit.exec("DELETE FROM calendar_meta WHERE k='owner_notice_enabled'");
  assert.equal(await receive(invite(9)), null);
  audit.prepare("UPDATE calendar SET dtstart='2000-01-01T00:00:00.000Z' WHERE uid=?").run(firstInvite.uid);
  audit.exec("UPDATE email_calendar_delivery SET due_at='2000-01-01T00:00:00.000Z' WHERE sequence=9 AND kind='reminder'");
  await mail.drainCalendarMail(env);
  assert.equal(audit.prepare("SELECT count(*) n FROM email_calendar_delivery WHERE sequence=9 AND kind='reminder' AND last_error='event-cancelled-or-started'").get().n, 2);
  assert.equal(await receive(invite(10)), null);
  const reminderRows = audit.prepare("SELECT id FROM email_calendar_delivery WHERE sequence=10 AND kind='reminder' ORDER BY id").all();
  audit.prepare("UPDATE email_calendar_delivery SET due_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-119 minutes') WHERE id=?").run(reminderRows[0].id);
  audit.prepare("UPDATE email_calendar_delivery SET due_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-121 minutes') WHERE id=?").run(reminderRows[1].id);
  const age = audit.prepare("SELECT * FROM v_personal_calendar_delivery_health").get();
  assert.equal(age.over_120m, 1, "119 minutes is not a breach; 121 minutes is");
  assert(age.oldest_min >= 121 && age.oldest_min < 122);
  measure();
  assert.equal(audit.prepare("SELECT last_value FROM metric_registry WHERE metric='personal_calendar_delivery_over_120m'").get().last_value, "1");
  audit.exec("UPDATE email_calendar_delivery SET due_at='2099-01-01T00:00:00.000Z' WHERE sequence=10 AND kind='reminder'");
  audit.exec("CREATE TRIGGER synthetic_batch_failure BEFORE INSERT ON email_calendar_delivery WHEN NEW.sequence=11 BEGIN SELECT RAISE(ABORT,'synthetic batch failure'); END");
  await assert.rejects(receive(invite(11)), /synthetic batch failure/);
  assert.equal(audit.prepare("SELECT sequence FROM email_calendar_invites WHERE uid=?").get(firstInvite.uid).sequence, 10);
  assert.equal(audit.prepare("SELECT count(*) n FROM email_calendar_delivery WHERE sequence=10 AND status='superseded'").get().n, 0, "failed batch must roll back supersession");
  audit.exec("DROP TRIGGER synthetic_batch_failure");
  assert.equal(await receive(invite(11)), null);
  audit.exec("UPDATE email_calendar_delivery SET due_at='2000-01-01T00:00:00.000Z' WHERE sequence=11 AND kind='reminder'");
  const sendsBeforeReadFailure = sent.length, baseDb = env.AUDIT_DB;
  env.AUDIT_DB = { ...baseDb, prepare(sql) {
    if (/FROM email_suppression/i.test(sql)) throw new Error("synthetic suppression store unavailable");
    return baseDb.prepare(sql);
  } };
  await mail.drainCalendarMail(env);
  env.AUDIT_DB = baseDb;
  assert.equal(sent.length, sendsBeforeReadFailure, "failed suppression read must never send");
  assert.equal(audit.prepare("SELECT count(*) n FROM email_calendar_delivery WHERE sequence=11 AND kind='reminder' AND status='pending' AND sent_at IS NULL").get().n, 2);
  audit.exec("UPDATE email_calendar_delivery SET due_at='2099-01-01T00:00:00.000Z' WHERE sequence=11 AND kind='reminder'");
  audit.prepare("INSERT INTO email_command_senders VALUES(?,'owner',1)").run("other-owner@outlook.com");
  assert.match(await receive(invite(12), { from: "other-owner@outlook.com" }), /sender/);
  assert.equal(await receive(invite(12)), null);
  audit.exec("UPDATE email_calendar_delivery SET due_at='2000-01-01T00:00:00.000Z' WHERE sequence=12 AND kind='reminder'");
  audit.prepare("UPDATE email_command_senders SET enabled=0 WHERE pattern=?").run(sender);
  await mail.drainCalendarMail(env);
  assert.equal(audit.prepare("SELECT count(*) n FROM email_calendar_delivery WHERE sequence=12 AND kind='reminder' AND last_error='owner-authorization-removed'").get().n, 2);
  audit.prepare("UPDATE email_command_senders SET enabled=1 WHERE pattern=?").run(sender);
  assert.equal(await receive(invite(13)), null);
  audit.exec("UPDATE email_calendar_delivery SET due_at='2000-01-01T00:00:00.000Z' WHERE sequence=13 AND kind='reminder'");
  providerHook = async message => {
    if (message.subject !== "Calendar reminder") return;
    providerHook = null;
    assert.equal(await receive(invite(14, "CANCEL")), null);
  };
  await mail.drainCalendarMail(env);
  const inFlight = audit.prepare("SELECT * FROM email_calendar_delivery WHERE sequence=13 AND kind='reminder' AND sent_at IS NOT NULL").all();
  assert.equal(inFlight.length, 1, "a provider call already in flight cannot be retracted");
  assert.equal(inFlight[0].status, "superseded", "late provider acceptance must preserve cancellation disposition");
  iso(inFlight[0].sent_at);
  assert.equal(audit.prepare("SELECT count(*) n FROM email_calendar_delivery WHERE sequence=13 AND kind='reminder' AND status='pending'").get().n, 0);
  assert.equal(await receive(invite(15)), null);
  providerFailure = true;
  assert.equal(await receive(invite(100, "REQUEST", "", "synthetic-ack-failure")), null);
  const failedAck = audit.prepare("SELECT * FROM email_calendar_delivery WHERE sequence=100 AND kind='ack'").get();
  assert.equal(failedAck.status, "pending");
  assert.equal(failedAck.sent_at, null);
  assert(Date.parse(failedAck.next_attempt_at) - Date.parse(failedAck.due_at) >= 900000, "ack retry must wait 15 minutes");
  providerFailure = false;
  const beforeEarlyRetry = sent.length;
  await mail.drainCalendarMail(env);
  assert.equal(sent.length, beforeEarlyRetry, "failed acknowledgment must not retry before next_attempt_at");
  audit.prepare("UPDATE email_calendar_delivery SET next_attempt_at=NULL WHERE id=?").run(failedAck.id);
  await mail.drainCalendarMail(env);
  assert.equal(audit.prepare("SELECT status FROM email_calendar_delivery WHERE id=?").get(failedAck.id).status, "sent");
  evidence.email.invite = { input: "actual MIME handler", calendar: "personal plane", sequence: 15,
    mock_ack_at: ack.sent_at, provider_failure_retry: true, concurrent_claims: true, scheduled_claim_recovery: true,
    suppression_and_preferences: true, atomic_batch_rollback: true, age_threshold_min: 120,
    shared_paths_bypassed: Object.keys(genericCalls) };

  // Use the deployed host, not the retired calendar-intake implementation or only the standalone member.
  const lifecycleSource = readFileSync(new URL("../qnfo-lifecycle/worker.js", import.meta.url), "utf8");
  const lifecycleModule = await import("data:text/javascript;base64," + Buffer.from(
    lifecycleSource.replace(/^import \{([^}]*)\} from "cloudflare:[^"]+";$/gm,
      (_, names) => names.split(",").map(name => "class " + name.trim().split(/\s+as\s+/).pop() + " {}").join("\n")) +
      "\nexport { __fk_calendarApi_default as calendarWrapper };"
  ).toString("base64"));
  const lifecycle = lifecycleModule.default;
  const calendarStore = audit;
  const objects = new Map();
  const publications = [];
  const calendarEnv = {
    QNFO_AUDIT: d1(calendarStore), CF_API_TOKEN: "synthetic-host-seed-us08",
    ICS_R2: {
      async put(key, body) { objects.set(key, body); publications.push({ key, published_at: new Date().toISOString() }); },
      async delete(key) { objects.delete(key); }
    }
  };
  const bindingCtx = Object.assign(context(), { props: { caller: "personal-api", member: "calendar-api" } });
  const event = {
    title: "Synthetic invite US08", dtstart: new Date(Date.now() + 3 * 864e5).toISOString(),
    dtend: new Date(Date.now() + 3 * 864e5 + 36e5).toISOString(),
    description: "SYNTHETIC-PRIVATE-EVENT-US08", source: "email", location: "Fixture room"
  };
  const calCall = (path, body) => lifecycle.fetch(new Request("https://internal" + path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  }), calendarEnv, bindingCtx);
  const created = await calCall("/events?plane=personal", event);
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert(createdBody.id > 0);
  const stored = calendarStore.prepare("SELECT * FROM calendar WHERE id=?").get(createdBody.id);
  assert.equal(stored.plane, "personal");
  assert.equal(stored.title, event.title);
  assert.equal(stored.dtstart, event.dtstart);
  const personalFeed = [...objects.entries()].find(([key]) => key.startsWith("calendar/personal-"))[1];
  assert.match(personalFeed, /SUMMARY:Synthetic invite US08/);
  assert.match(personalFeed, /DTSTAMP:\d{8}T\d{6}Z/);
  for (const [key, body] of objects) {
    if (!key.startsWith("calendar/personal-")) assert(!body.includes(event.description) && !body.includes(event.title) && !body.includes(marker));
  }
  assert.match(personalFeed, new RegExp(marker), "actual host publisher includes the email-ingested personal event");
  const anonymousCalendar = await lifecycle.fetch(new Request("https://internal/calendar/events?plane=personal"),
    calendarEnv, context());
  assert([401, 403, 404].includes(anonymousCalendar.status), "anonymous requests must not read personal calendar rows");
  assert(!(await anonymousCalendar.text()).includes(marker));
  publications.length = 0;
  const scheduledCtx = context();
  const wrapper = lifecycleModule.calendarWrapper, hostScheduled = wrapper.__foldHost.scheduled;
  // Isolate unrelated lifecycle jobs; the real fold dispatcher and calendar member still run.
  wrapper.__foldHost.scheduled = async () => {};
  try {
    await wrapper.scheduled({ cron: "0 * * * *", scheduledTime: Date.UTC(2026, 9, 25, 11, 0, 3) }, calendarEnv, scheduledCtx);
    await scheduledCtx.drain();
  } finally {
    wrapper.__foldHost.scheduled = hostScheduled;
  }
  assert(publications.some(item => item.key.startsWith("calendar/personal-")), "host scheduled tick republishes personal calendar");
  for (const item of publications) iso(item.published_at);
  evidence.calendar = { structured_event: "stored in personal plane", scheduled_publications: publications };

  evidence.gaps.push("Calendar HTTP /ingest remains unsupported; active raw invite intake is the authenticated email handler. UTC-only single-event subset; no RSVP or recurrence support.");

  const companionSource = readFileSync(new URL("../personal-companion/worker.js", import.meta.url), "utf8");
  const companion = await importWorker(() => companionSource.replace(
    'import { WorkflowEntrypoint } from "cloudflare:workers";', "class WorkflowEntrypoint {}"
  ), new URL("../personal-companion/", import.meta.url));
  const personal = database(), briefAudit = database(), briefQueries = [];
  personal.exec(`
    CREATE TABLE daily_briefs(date TEXT PRIMARY KEY, payload TEXT);
    CREATE TABLE wellbeing_config(key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    INSERT INTO wellbeing_config VALUES('email_mode','"daily"','synthetic');
    CREATE TABLE companion_nudges(ts TEXT, day TEXT, kind TEXT, ladder_step INTEGER, ask TEXT, minutes INTEGER,
      expected TEXT, due_at TEXT, state TEXT, sent_at TEXT, reason TEXT);
  `);
  briefAudit.exec(`
    CREATE TABLE calendar_meta(k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE calendar_feedback(cal_id INTEGER);
    CREATE TABLE owner_questions(id INTEGER PRIMARY KEY, kind TEXT, ref TEXT, subject TEXT, sent_at TEXT,
      created_at TEXT, priority INTEGER);
  `);
  const now = Date.now(), day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date(now));
  personal.prepare("INSERT INTO daily_briefs VALUES(?,?)").run(day, JSON.stringify({
    weather: { text: "Synthetic mild weather" }, calendar: { today: [event], upcoming7: [] },
    open: { tasks: [{ title: "Synthetic reminder US08" }] }
  }));
  const briefSends = [];
  let reject = true;
  const briefEnv = { PERSONAL: d1(personal), AUDIT: d1(briefAudit, briefQueries),
    SEND_EMAIL: { async send(message) { if (reject) throw new Error("SYNTHETIC-PROVIDER-FAILURE-US08"); briefSends.push(message); } } };
  const failed = await companion.sendMorningBrief(briefEnv, now);
  assert.equal(failed.ok, false);
  assert.equal(personal.prepare("SELECT count(*) n FROM companion_morning_brief").get().n, 0, "failed provider cannot leave delivery evidence");
  reject = false;
  const delivered = await companion.sendMorningBrief(briefEnv, now);
  assert.equal(delivered.ok, true);
  assert.equal(briefSends.length, 1);
  assert.match(briefSends[0].text, /Synthetic invite US08/);
  assert.match(briefSends[0].text, /Synthetic reminder US08/);
  const receipt = personal.prepare("SELECT * FROM companion_morning_brief WHERE date=?").get(day);
  assert.equal(receipt.sent, 1);
  assert.equal(receipt.sent_at, new Date(now).toISOString());
  iso(receipt.sent_at);
  assert.equal((await companion.sendMorningBrief(briefEnv, now)).skipped, "already sent");
  assert.equal(briefSends.length, 1);
  assert(!briefQueries.some(sql => /owner_docs|papers|research/i.test(sql)));
  evidence.brief = { provider: "mock only", sent_at: receipt.sent_at, sent: receipt.sent, retry_after_failure: true, duplicate_send: false };
  evidence.gaps.push("Brief delivery handler and calendar host scheduled publication exercised offline; no mailbox receipt, subscribed-calendar refresh or deployed binding parity proven.");
  assert.equal(networkCalls, 0);
  console.log("PASS US08 bounded synthetic handler evidence " + JSON.stringify(evidence));
} finally {
  globalThis.fetch = originalFetch;
  for (const store of stores) store.close();
}
