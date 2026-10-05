#!/usr/bin/env node
// GUARD-VERIFY-OFFLINE-1 (2026-10-05) - agent_issues #1629 GUARD-REGISTRY-36-UNVERIFIED-1 (charter pillar: security).
//
// Negative tests for the guard_registry rows that carried verified_at NULL, run OFFLINE in node:sqlite against the
// live DDL in scripts/guard-registry-ddl-2026-10-05.json (sqlite_master of D1 qnfo-audit, personal-life and
// living-paper, read 2026-10-05). Never run against live D1: a guard that does not fire would let the forbidden write
// land there (for example erase contact_ledger rows the never-email-twice rule depends on).
//
// Per guard, on fresh in-memory databases:
//   1. the enforcing object must exist in the snapshot (sqlite_master); otherwise FAIL (no enforcing object);
//   2. every table, index and trigger of the snapshot is created (all live triggers on the involved tables, so a
//      sibling trigger can neither hide nor fake an outcome), with foreign keys ON as in D1; seed rows are written
//      BEFORE the triggers exist (they stand for rows already live) and FTS indexes are rebuilt from them;
//   3. the statement the registry's negative_test describes is run: a kind 'abort' guard must reject it with the
//      trigger's own RAISE(ABORT) message (SQLITE_CONSTRAINT_TRIGGER) and leave the rows unchanged; a kind 'effect'
//      guard (FTS sync, cascade, rewrite, ledger) must produce the effect the negative_test names;
//   4. control: the same statement on a database WITHOUT the guard's trigger must not give that outcome, which proves
//      the outcome is the guard's own (a case marked control: false checks a property of the trigger set, e.g. that
//      no credential survives in meta, and is reported but not attributed);
//   5. allowed: where the guard text implies a legitimate write, that write must succeed without the guard's outcome.
// Output: one JSON line per guard, then "N passed, M failed". Exit 0 when all pass, 1 when any fails, 2 when the
// DDL snapshot does not match the live read (len/chk recorded by D1) or the repair migration's rollback block is not
// the live DDL.
//
// Follow-up (same issue, 2026-10-05):
//   * Repairs: migrations/2026-10-05-guard-trigger-repairs.sql re-creates trg_registry_audit_log and trg_dns_pages_fk.
//     Each repaired guard is tested twice: against the live DDL (where it still fails until the migration is applied)
//     and against the CREATE TRIGGER text read from the migration (ddl = the migration path). The migration entry
//     passes only when the repaired DDL passes AND the live DDL fails the same test, so the test discriminates.
//   * Coverage: the 75 live triggers that had no guard_registry row (snapshot coverage read 18:51Z) each have a test
//     here with the registry text (invariant, negative_test, remediation_hint) the row is inserted with.
// Run: node scripts/guard-registry-negative-tests.mjs   (Node >= 22.5; no network, no credentials, no live writes)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const SNAP = JSON.parse(readFileSync(new URL("./guard-registry-ddl-2026-10-05.json", import.meta.url), "utf8"));
const SQLITE_CONSTRAINT_TRIGGER = 1811;

// ---- repair migration: CREATE TRIGGER texts, and a rollback block that must equal the live DDL -------------------
const MIGRATION_PATH = "migrations/2026-10-05-guard-trigger-repairs.sql";
const MIG_TEXT = readFileSync(new URL("../" + MIGRATION_PATH, import.meta.url), "utf8");
const MIG = {};
for (const m of MIG_TEXT.matchAll(/^CREATE TRIGGER (\w+)[\s\S]*?^END;$/gm)) MIG[m[1]] = m[0].slice(0, -1);
const ROLLBACK = {};
for (const m of MIG_TEXT.matchAll(/^-- ROLLBACK-BEGIN (\w+)\n([\s\S]*?)^-- ROLLBACK-END \1$/gm)) {
  const lines = m[2].split("\n").filter((l) => l.length).map((l) => l.replace(/^-- ?/, ""));
  ROLLBACK[m[1]] = lines.filter((l) => !/^DROP TRIGGER /.test(l)).join("\n").replace(/;$/, "");
}

// ---- snapshot integrity: the DDL texts must be exactly what D1 returned -------------------------------------------
function chk(sql) {
  let s = 0, i = 0;
  for (const ch of sql) { i++; s += ch.codePointAt(0) * ((i % 97) + 1); }
  return s;
}
const drift = [];
for (const [key, d] of Object.entries(SNAP.databases)) {
  for (const o of d.objects) {
    const len = Array.from(o.sql).length;
    if (len !== o.len || chk(o.sql) !== o.chk) drift.push(`${key}.${o.name}: len ${len}/${o.len} chk ${chk(o.sql)}/${o.chk}`);
  }
}
if (drift.length) {
  console.error("SNAPSHOT DRIFT (DDL text differs from the live read):\n" + drift.join("\n"));
  process.exit(2);
}
{
  const bad = [];
  const names = new Set([...Object.keys(MIG), ...Object.keys(ROLLBACK)]);
  for (const n of names) {
    const live = (SNAP.databases.audit.objects.find((o) => o.name === n) || {}).sql;
    if (!MIG[n]) bad.push(`${n}: rollback block without a CREATE TRIGGER`);
    else if (!ROLLBACK[n]) bad.push(`${n}: CREATE TRIGGER without a rollback block`);
    else if (ROLLBACK[n] !== live) bad.push(`${n}: rollback block is not the live sqlite_master text`);
  }
  if (!names.size) bad.push("no repairs parsed from " + MIGRATION_PATH);
  if (bad.length) {
    console.error("MIGRATION CHECK FAIL:\n" + bad.join("\n"));
    process.exit(2);
  }
}

// ---- helpers --------------------------------------------------------------------------------------------------------
function findObject(dbKey, name) {
  return (SNAP.databases[dbKey]?.objects || []).find((o) => o.name === name) || null;
}
function build(dbKey, seed = [], without = null, overrides = null) {
  const objs = SNAP.databases[dbKey].objects;
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const o of objs) if (o.type === "table") db.exec(o.sql);
  for (const o of objs) if (o.type === "index") db.exec(o.sql);
  for (const s of seed) db.exec(s);
  for (const o of objs) {
    if (o.type === "table" && /^CREATE VIRTUAL TABLE\b[\s\S]*\bfts5\b/i.test(o.sql)) {
      db.exec(`INSERT INTO ${o.name}(${o.name}) VALUES ('rebuild')`);
    }
  }
  for (const o of objs) if (o.type === "trigger" && o.name !== without) db.exec((overrides && overrides[o.name]) || o.sql);
  return db;
}
function run(db, sql) {
  try { db.exec(sql); return { ok: true }; }
  catch (e) { return { ok: false, message: e.message, errcode: e.errcode ?? null, errstr: e.errstr ?? null }; }
}
const one = (db, sql) => db.prepare(sql).get();
const all = (db, sql) => db.prepare(sql).all();
const count = (db, sql) => Number(Object.values(one(db, sql))[0]);
const fts = (db, table, term) => all(db, `SELECT rowid FROM ${table} WHERE ${table} MATCH '${term}'`).length;
function raiseText(sql) {
  const m = /RAISE\s*\(\s*ABORT\s*,\s*'((?:[^']|'')*)'\s*\)/i.exec(sql || "");
  return m ? m[1].replace(/''/g, "'") : null;
}
const squash = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const abbr = (s, n) => { const t = squash(s); return t.length > n ? t.slice(0, n - 3) + "..." : t; };

// ---- shared seeds ---------------------------------------------------------------------------------------------------
// portfolios -> programs -> projects as read live 2026-10-05 (QNFO / QNFO.INFRA / QNFO.INFRA.{DNS,PAGE,WORK}); the
// fk-violation snapshots reference these projects and D1 enforces the foreign key.
const WBS = [
  "INSERT INTO portfolios (portfolio_code, name) VALUES ('QNFO', 'QNFO')",
  "INSERT INTO programs (program_code, portfolio_code, name) VALUES ('QNFO.INFRA', 'QNFO', 'Infrastructure')",
  "INSERT INTO projects (project_code, program_code, name) VALUES ('QNFO.INFRA.DNS', 'QNFO.INFRA', 'DNS'), ('QNFO.INFRA.PAGE', 'QNFO.INFRA', 'Pages'), ('QNFO.INFRA.WORK', 'QNFO.INFRA', 'Workers')",
];
const NEG_PROJECTS = "INSERT INTO projects (project_code, program_code, name) VALUES ('NEGTEST.A', 'QNFO.INFRA', 'negtest A'), ('NEGTEST.B', 'QNFO.INFRA', 'negtest B')";
const T0 = "2026-10-05T18:00:00Z";
const AUDIT_EVENT = `INSERT INTO events (id, timestamp, thread_id, agent, action, summary) VALUES ('01NEGTEST000000000000000001', '${T0}', 'negtest-thread', 'DEFAULT', 'DECISION', 'negtestzebra guard probe')`;
const AUDIT_TASK = `INSERT INTO tasks (id, project, title, description, created_at, updated_at) VALUES ('TNEG1', 'negtest', 'negtestzebra title', 'negtestokapi description', '${T0}', '${T0}')`;
const PAPER = `INSERT INTO papers (identifier, title, authors, abstract, status) VALUES ('negtest-paper-1', 'Negtestzebra resonance', '["negtest"]', 'negtestokapi abstract', 'draft')`;
const eff = (ok, observed) => ({ ok: !!ok, observed });

// ---- the 36 rows ----------------------------------------------------------------------------------------------------
// kind 'abort': cases are forbidden statements; state is the query whose rows must not change.
// kind 'effect': cases are { sql, effect(db) -> {ok, observed} }.
// allowed: { seed?, sql, check(db) -> {ok, observed} } runs on its own fresh database with the guard present.
const GUARDS = [
  {
    guard: "contact_ledger_no_erase_guard", db: "audit", kind: "abort",
    seed: ["INSERT INTO contact_ledger (email, reply_count, suppress) VALUES ('negtest-replied@example.org', 2, 0), ('negtest-suppressed@example.org', 0, 1), ('negtest-plain@example.org', 0, 0)"],
    state: "SELECT email, suppress, reply_count FROM contact_ledger ORDER BY email",
    cases: [
      "DELETE FROM contact_ledger WHERE email = 'negtest-replied@example.org'",
      "DELETE FROM contact_ledger WHERE email = 'negtest-suppressed@example.org'",
    ],
    allowed: { sql: "DELETE FROM contact_ledger WHERE email = 'negtest-plain@example.org'", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM contact_ledger WHERE email = 'negtest-plain@example.org'"); return eff(n === 0, `never-contacted row deleted (remaining ${n})`); } },
  },
  {
    guard: "contact_ledger_unsuppress_guard", db: "audit", kind: "abort",
    seed: ["INSERT INTO contact_ledger (email, suppress, suppress_reason) VALUES ('negtest-suppressed@example.org', 1, 'unsubscribe')"],
    state: "SELECT email, suppress, suppress_reason FROM contact_ledger ORDER BY email",
    cases: [
      "UPDATE contact_ledger SET suppress = 0, suppress_reason = 'cleared' WHERE email = 'negtest-suppressed@example.org'",
      "UPDATE contact_ledger SET suppress = 0 WHERE email = 'negtest-suppressed@example.org'",
    ],
    allowed: { sql: "UPDATE contact_ledger SET suppress = 0, suppress_reason = 'OVERRIDE:negtest owner re-enabled' WHERE email = 'negtest-suppressed@example.org'", check: (db) => { const r = one(db, "SELECT suppress FROM contact_ledger WHERE email = 'negtest-suppressed@example.org'"); return eff(r?.suppress === 0, `suppress=${r?.suppress} with an OVERRIDE: reason`); } },
  },
  {
    guard: "email_filters_no_unsafe_auto_reply_ins", db: "audit", kind: "abort",
    seed: [],
    state: "SELECT id, field, pattern, action FROM email_filters ORDER BY id",
    cases: ["INSERT INTO email_filters (field, pattern, action) VALUES ('sender', 'negtest@example.org', 'auto_reply')"],
    allowed: { sql: "INSERT INTO email_filters (field, pattern, action) VALUES ('sender', 'negtest@example.org', 'archive')", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM email_filters WHERE action = 'archive'"); return eff(n === 1, `action=archive row inserted (${n})`); } },
  },
  {
    guard: "email_filters_no_unsafe_auto_reply_upd", db: "audit", kind: "abort",
    seed: ["INSERT INTO email_filters (field, pattern, action) VALUES ('sender', 'negtest@example.org', 'accept')"],
    state: "SELECT id, field, pattern, action FROM email_filters ORDER BY id",
    cases: ["UPDATE email_filters SET action = 'auto_reply' WHERE pattern = 'negtest@example.org'"],
    allowed: { sql: "UPDATE email_filters SET action = 'archive' WHERE pattern = 'negtest@example.org'", check: (db) => { const r = one(db, "SELECT action FROM email_filters WHERE pattern = 'negtest@example.org'"); return eff(r?.action === "archive", `action=${r?.action}`); } },
  },
  {
    guard: "email_first_touch_terminal_insert", db: "audit", kind: "effect",
    seed: [],
    cases: [
      { sql: "INSERT INTO emails (message_id, sender, recipient, subject, status) VALUES ('<negtest-ft-1@example.org>', 'noreply@example.com', 'owner@qnfo.org', 'Your receipt', 'received')", effect: (db) => { const r = one(db, "SELECT status FROM emails WHERE message_id = '<negtest-ft-1@example.org>'"); return eff(r?.status === "archived", `noreply row status=${r?.status}`); } },
      { sql: "INSERT INTO emails (message_id, sender, recipient, subject, status) VALUES ('<negtest-ft-2@example.org>', 'editor@evalsignal.example', 'owner@qnfo.org', 'Call for papers', 'received')", effect: (db) => { const r = one(db, "SELECT status FROM emails WHERE message_id = '<negtest-ft-2@example.org>'"); return eff(r?.status === "spam", `marketing row status=${r?.status}`); } },
    ],
    allowed: { sql: "INSERT INTO emails (message_id, sender, recipient, subject, status) VALUES ('<negtest-ft-3@example.org>', 'alice@example.org', 'owner@qnfo.org', 'Question on the paper', 'received')", check: (db) => { const r = one(db, "SELECT status FROM emails WHERE message_id = '<negtest-ft-3@example.org>'"); return eff(r?.status === "received", `human row status=${r?.status}`); } },
  },
  {
    guard: "email_first_touch_terminal_processed", db: "audit", kind: "effect",
    seed: ["INSERT INTO emails (message_id, sender, recipient, subject, status) VALUES ('<negtest-ftp-1@example.org>', 'noreply@example.com', 'owner@qnfo.org', 'Your receipt', 'read'), ('<negtest-ftp-2@example.org>', 'alice@example.org', 'owner@qnfo.org', 'Question on the paper', 'read')"],
    cases: [
      { sql: "UPDATE emails SET status = 'processed' WHERE message_id = '<negtest-ftp-1@example.org>'", effect: (db) => { const r = one(db, "SELECT status FROM emails WHERE message_id = '<negtest-ftp-1@example.org>'"); return eff(r?.status === "archived", `noreply row status=${r?.status}`); } },
    ],
    allowed: { sql: "UPDATE emails SET status = 'processed' WHERE message_id = '<negtest-ftp-2@example.org>'", check: (db) => { const r = one(db, "SELECT status FROM emails WHERE message_id = '<negtest-ftp-2@example.org>'"); return eff(r?.status === "processed", `human row status=${r?.status}`); } },
  },
  {
    guard: "email_reply_queue_no_machine", db: "audit", kind: "effect",
    seed: [],
    cases: [
      { sql: "INSERT INTO email_reply_queue (email_id, sender, subject) VALUES (101, 'noreply@example.com', 'Your receipt')", effect: (db) => { const r = one(db, "SELECT decision, skip_reason FROM email_reply_queue WHERE email_id = 101"); return eff(r?.decision === "skip" && /^db-trigger:/.test(r?.skip_reason || ""), `decision=${r?.decision} skip_reason=${r?.skip_reason == null ? "NULL" : abbr(r.skip_reason, 40)}`); } },
    ],
    allowed: { sql: "INSERT INTO email_reply_queue (email_id, sender, subject) VALUES (102, 'alice@example.org', 'Question on the paper')", check: (db) => { const r = one(db, "SELECT decision FROM email_reply_queue WHERE email_id = 102"); return eff(r?.decision === "pending", `human row decision=${r?.decision}`); } },
  },
  {
    guard: "email_reply_queue_terminal_parent", db: "audit", kind: "effect",
    seed: [
      "INSERT INTO emails (id, message_id, sender, recipient, subject, body_text, status) VALUES (201, '<negtest-tp-1@example.org>', 'alice@example.org', 'owner@qnfo.org', 'Question', 'hello', 'received'), (202, '<negtest-tp-2@example.org>', 'bob@example.org', 'owner@qnfo.org', 'Duplicate', 'hello again', 'read')",
      "INSERT INTO email_reply_queue (email_id, sender, subject) VALUES (201, 'alice@example.org', 'Question'), (202, 'bob@example.org', 'Duplicate')",
    ],
    cases: [
      { sql: "UPDATE email_reply_queue SET decision = 'sent' WHERE email_id = 201", effect: (db) => { const r = one(db, "SELECT status FROM emails WHERE id = 201"); return eff(r?.status === "replied", `parent status=${r?.status}`); } },
      { sql: "UPDATE email_reply_queue SET decision = 'skip', skip_reason = 'negtest: duplicate thread' WHERE email_id = 202", effect: (db) => { const r = one(db, "SELECT status FROM emails WHERE id = 202"); return eff(r?.status === "archived", `skipped parent status=${r?.status}`); } },
    ],
    allowed: { sql: "UPDATE email_reply_queue SET decision = 'drafted' WHERE email_id = 201", check: (db) => { const r = one(db, "SELECT status FROM emails WHERE id = 201"); return eff(r?.status === "received", `non-terminal decision leaves parent status=${r?.status}`); } },
  },
  {
    guard: "email_reply_queue_tone_gate_draft", db: "audit", kind: "abort",
    seed: ["INSERT INTO email_reply_queue (email_id, sender, subject) VALUES (301, 'alice@example.org', 'Invitation')"],
    state: "SELECT id, draft_text FROM email_reply_queue ORDER BY id",
    cases: [
      "UPDATE email_reply_queue SET draft_text = 'Thank you for the invitation, but we must decline.' WHERE email_id = 301",
      "UPDATE email_reply_queue SET draft_text = 'Unfortunately this is not a fit.' WHERE email_id = 301",
    ],
    allowed: { sql: "UPDATE email_reply_queue SET draft_text = 'Thank you for writing; the paper and the data are linked below.' WHERE email_id = 301", check: (db) => { const r = one(db, "SELECT draft_text FROM email_reply_queue WHERE email_id = 301"); return eff(!!r?.draft_text, `friendly draft stored (${abbr(r?.draft_text, 30)})`); } },
  },
  {
    guard: "emails_outbound_violation_detect", db: "audit", kind: "effect",
    seed: ["INSERT INTO contact_ledger (email, suppress, suppress_reason, reply_count) VALUES ('negtest-suppressed@example.org', 1, 'unsubscribe', 0), ('negtest-replied@example.org', 0, NULL, 1)"],
    cases: [
      { sql: "INSERT INTO emails (message_id, sender, recipient, subject, status) VALUES ('<negtest-ov-1@example.org>', 'owner@qnfo.org', 'negtest-suppressed@example.org', 'Follow-up', 'sent')", effect: (db) => { const n = count(db, "SELECT COUNT(*) FROM email_send_violations WHERE recipient = 'negtest-suppressed@example.org' AND violation = 'UNGATED-SEND-TO-SUPPRESSED-OR-REPEAT'"); return eff(n === 1, `violation rows for suppressed recipient=${n}`); } },
      { sql: "INSERT INTO emails (message_id, sender, recipient, subject, status) VALUES ('<negtest-ov-2@example.org>', 'owner@qnfo.org', 'negtest-replied@example.org', 'Second note', 'sent')", effect: (db) => { const n = count(db, "SELECT COUNT(*) FROM email_send_violations WHERE recipient = 'negtest-replied@example.org'"); return eff(n === 1, `violation rows for already-contacted recipient=${n}`); } },
    ],
    allowed: { sql: "INSERT INTO emails (message_id, sender, recipient, subject, status) VALUES ('<negtest-ov-3@example.org>', 'owner@qnfo.org', 'negtest-fresh@example.org', 'First note', 'sent')", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM email_send_violations"); return eff(n === 0, `first send to a fresh recipient: violation rows=${n}`); } },
  },
  {
    guard: "emails_selfloop_quarantine", db: "audit", kind: "effect",
    seed: [],
    cases: [
      { sql: "INSERT INTO emails (message_id, sender, recipient, subject, body_text, status) VALUES ('<negtest-sl-1@example.org>', 'monitor@qnfo.org', 'alerts@qnfo.org', 'Health alert: qnfo-ai degraded', 'probe body', 'received')", effect: (db) => { const inEmails = count(db, "SELECT COUNT(*) FROM emails WHERE message_id = '<negtest-sl-1@example.org>'"); const q = count(db, "SELECT COUNT(*) FROM email_loop_quarantine WHERE message_id = '<negtest-sl-1@example.org>' AND reason = 'self-ingestion loop (issue 951)'"); return eff(inEmails === 0 && q === 1, `emails rows=${inEmails}, quarantine rows=${q}`); } },
    ],
    allowed: { sql: "INSERT INTO emails (message_id, sender, recipient, subject, body_text, status) VALUES ('<negtest-sl-2@example.org>', 'alice@example.org', 'alerts@qnfo.org', 'Question about a paper', 'hello', 'received')", check: (db) => { const inEmails = count(db, "SELECT COUNT(*) FROM emails WHERE message_id = '<negtest-sl-2@example.org>'"); const q = count(db, "SELECT COUNT(*) FROM email_loop_quarantine"); return eff(inEmails === 1 && q === 0, `human mail to alerts@ kept: emails rows=${inEmails}, quarantine rows=${q}`); } },
  },
  {
    guard: "emails_sent_contact_ledger_upsert", db: "audit", kind: "effect",
    seed: [],
    cases: [
      { sql: "INSERT INTO emails (message_id, sender, recipient, subject, status) VALUES ('<negtest-up-1@example.org>', 'owner@qnfo.org', 'Negtest-New@Example.org', 'Hello', 'sent')", effect: (db) => { const r = one(db, "SELECT contact_count, status FROM contact_ledger WHERE email = 'negtest-new@example.org'"); return eff(r?.contact_count === 1 && r?.status === "sent-ledger", r ? `ledger contact_count=${r.contact_count} status=${r.status}` : "no ledger row"); } },
      { sql: "INSERT INTO emails (message_id, sender, recipient, subject, status) VALUES ('<negtest-up-2@example.org>', 'owner@qnfo.org', 'negtest-new@example.org', 'Hello again', 'sent')", effect: (db) => { const r = one(db, "SELECT contact_count FROM contact_ledger WHERE email = 'negtest-new@example.org'"); return eff(r?.contact_count === 2, r ? `ledger contact_count after second send=${r.contact_count}` : "no ledger row after second send"); } },
    ],
    allowed: { sql: "INSERT INTO emails (message_id, sender, recipient, subject, status) VALUES ('<negtest-up-3@example.org>', 'alice@example.org', 'owner@qnfo.org', 'Question', 'received')", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM contact_ledger"); return eff(n === 0, `received mail writes no ledger row (rows=${n})`); } },
  },
  {
    guard: "events_ad", db: "audit", kind: "effect", seed: [AUDIT_EVENT],
    cases: [{ sql: "DELETE FROM events WHERE id = '01NEGTEST000000000000000001'", effect: (db) => { const n = fts(db, "events_fts", "negtestzebra"); return eff(n === 0, `MATCH negtestzebra after delete=${n}`); } }],
  },
  {
    guard: "events_ai", db: "audit", kind: "effect", seed: [],
    cases: [{ sql: AUDIT_EVENT, effect: (db) => { const n = fts(db, "events_fts", "negtestzebra"); return eff(n === 1, `MATCH negtestzebra after insert=${n}`); } }],
  },
  {
    guard: "events_au", db: "audit", kind: "effect", seed: [AUDIT_EVENT],
    cases: [{ sql: "UPDATE events SET summary = 'negtestquokka guard probe' WHERE id = '01NEGTEST000000000000000001'", effect: (db) => { const o = fts(db, "events_fts", "negtestzebra"), n = fts(db, "events_fts", "negtestquokka"); return eff(o === 0 && n === 1, `MATCH old=${o} new=${n}`); } }],
  },
  {
    guard: "tasks_ad", db: "audit", kind: "effect", seed: [AUDIT_TASK],
    cases: [{ sql: "DELETE FROM tasks WHERE id = 'TNEG1'", effect: (db) => { const t = fts(db, "tasks_fts", "negtestzebra"), d = fts(db, "tasks_fts", "negtestokapi"); return eff(t === 0 && d === 0, `MATCH title=${t} description=${d} after delete`); } }],
  },
  {
    guard: "tasks_ai", db: "audit", kind: "effect", seed: [],
    cases: [{ sql: AUDIT_TASK, effect: (db) => { const t = fts(db, "tasks_fts", "negtestzebra"), d = fts(db, "tasks_fts", "negtestokapi"); return eff(t === 1 && d === 1, `MATCH title=${t} description=${d} after insert`); } }],
  },
  {
    guard: "tasks_au", db: "audit", kind: "effect", seed: [AUDIT_TASK],
    cases: [{ sql: "UPDATE tasks SET title = 'negtestquokka title' WHERE id = 'TNEG1'", effect: (db) => { const o = fts(db, "tasks_fts", "negtestzebra"), n = fts(db, "tasks_fts", "negtestquokka"), d = fts(db, "tasks_fts", "negtestokapi"); return eff(o === 0 && n === 1 && d === 1, `MATCH old title=${o} new title=${n} description=${d}`); } }],
  },
  {
    guard: "service_registry_deps_guard", db: "audit", kind: "effect",
    seed: [`INSERT INTO service_registry (service, deps) VALUES ('negtest-svc', '["qnfo-ai"]')`],
    cases: [
      { sql: "UPDATE service_registry SET deps = '[]' WHERE service = 'negtest-svc'", effect: (db) => { const r = one(db, "SELECT deps FROM service_registry WHERE service = 'negtest-svc'"); return eff(r?.deps === '["qnfo-ai"]', `deps after blanking to []: ${r?.deps}`); } },
      { sql: "UPDATE service_registry SET deps = NULL WHERE service = 'negtest-svc'", effect: (db) => { const r = one(db, "SELECT deps FROM service_registry WHERE service = 'negtest-svc'"); return eff(r?.deps === '["qnfo-ai"]', `deps after NULL: ${r?.deps}`); } },
      { sql: "UPDATE service_registry SET deps = '' WHERE service = 'negtest-svc'", effect: (db) => { const r = one(db, "SELECT deps FROM service_registry WHERE service = 'negtest-svc'"); return eff(r?.deps === '["qnfo-ai"]', `deps after '': ${r?.deps}`); } },
    ],
    allowed: { sql: `UPDATE service_registry SET deps = '["qnfo-ai","qnfo-ops"]' WHERE service = 'negtest-svc'`, check: (db) => { const r = one(db, "SELECT deps FROM service_registry WHERE service = 'negtest-svc'"); return eff(r?.deps === '["qnfo-ai","qnfo-ops"]', `non-empty deps change kept: ${r?.deps}`); } },
  },
  {
    guard: "trg_cascade_phases", db: "audit", kind: "effect",
    seed: [...WBS, NEG_PROJECTS, "INSERT INTO phases (phase_code, project_code, phase_number, name, status) VALUES ('NEGTEST.A.1', 'NEGTEST.A', 1, 'a1', 'completed'), ('NEGTEST.A.2', 'NEGTEST.A', 2, 'a2', 'in_progress'), ('NEGTEST.B.1', 'NEGTEST.B', 1, 'b1', 'pending'), ('NEGTEST.B.2', 'NEGTEST.B', 2, 'b2', 'pending')"],
    cases: [{ sql: "UPDATE phases SET status = 'completed' WHERE phase_code = 'NEGTEST.A.2'", effect: (db) => { const r = one(db, "SELECT status, completed_at FROM projects WHERE project_code = 'NEGTEST.A'"); return eff(r?.status === "completed" && !!r?.completed_at, `project status=${r?.status}`); } }],
    allowed: { sql: "UPDATE phases SET status = 'completed' WHERE phase_code = 'NEGTEST.B.1'", check: (db) => { const r = one(db, "SELECT status FROM projects WHERE project_code = 'NEGTEST.B'"); return eff(r?.status === "active", `non-final phase leaves project status=${r?.status}`); } },
  },
  {
    guard: "trg_cascade_subtasks", db: "audit", kind: "effect",
    seed: [...WBS, NEG_PROJECTS,
      "INSERT INTO phases (phase_code, project_code, phase_number, name, status) VALUES ('NEGTEST.A.1', 'NEGTEST.A', 1, 'a1', 'in_progress')",
      "INSERT INTO tasks_wbs (task_code, phase_code, task_number, title, status) VALUES ('NEGTEST.A.1.1', 'NEGTEST.A.1', 1, 't1', 'in_progress'), ('NEGTEST.A.1.2', 'NEGTEST.A.1', 2, 't2', 'pending')",
      "INSERT INTO subtasks (subtask_code, task_code, subtask_number, title, status) VALUES ('NEGTEST.A.1.1.a', 'NEGTEST.A.1.1', 1, 's1', 'completed'), ('NEGTEST.A.1.1.b', 'NEGTEST.A.1.1', 2, 's2', 'in_progress'), ('NEGTEST.A.1.2.a', 'NEGTEST.A.1.2', 1, 's3', 'pending'), ('NEGTEST.A.1.2.b', 'NEGTEST.A.1.2', 2, 's4', 'pending')"],
    cases: [{ sql: "UPDATE subtasks SET status = 'completed' WHERE subtask_code = 'NEGTEST.A.1.1.b'", effect: (db) => { const r = one(db, "SELECT status FROM tasks_wbs WHERE task_code = 'NEGTEST.A.1.1'"); return eff(r?.status === "completed", `parent task status=${r?.status}`); } }],
    allowed: { sql: "UPDATE subtasks SET status = 'completed' WHERE subtask_code = 'NEGTEST.A.1.2.a'", check: (db) => { const r = one(db, "SELECT status FROM tasks_wbs WHERE task_code = 'NEGTEST.A.1.2'"); return eff(r?.status === "pending", `non-final subtask leaves task status=${r?.status}`); } },
  },
  {
    guard: "trg_cascade_tasks", db: "audit", kind: "effect",
    seed: [...WBS, NEG_PROJECTS,
      "INSERT INTO phases (phase_code, project_code, phase_number, name, status) VALUES ('NEGTEST.A.1', 'NEGTEST.A', 1, 'a1', 'in_progress'), ('NEGTEST.A.2', 'NEGTEST.A', 2, 'a2', 'pending')",
      "INSERT INTO tasks_wbs (task_code, phase_code, task_number, title, status) VALUES ('NEGTEST.A.1.1', 'NEGTEST.A.1', 1, 't1', 'completed'), ('NEGTEST.A.1.2', 'NEGTEST.A.1', 2, 't2', 'in_progress'), ('NEGTEST.A.2.1', 'NEGTEST.A.2', 1, 't3', 'pending'), ('NEGTEST.A.2.2', 'NEGTEST.A.2', 2, 't4', 'pending')"],
    cases: [{ sql: "UPDATE tasks_wbs SET status = 'completed' WHERE task_code = 'NEGTEST.A.1.2'", effect: (db) => { const r = one(db, "SELECT status FROM phases WHERE phase_code = 'NEGTEST.A.1'"); return eff(r?.status === "completed", `parent phase status=${r?.status}`); } }],
    allowed: { sql: "UPDATE tasks_wbs SET status = 'completed' WHERE task_code = 'NEGTEST.A.2.1'", check: (db) => { const r = one(db, "SELECT status FROM phases WHERE phase_code = 'NEGTEST.A.2'"); return eff(r?.status === "pending", `non-final task leaves phase status=${r?.status}`); } },
  },
  {
    guard: "trg_dns_pages_fk", db: "audit", kind: "effect",
    seed: [...WBS, "INSERT INTO audit_pages (project_name, subdomain) VALUES ('negtest-registered', 'negtest-registered.pages.dev')"],
    cases: [{ sql: "INSERT INTO dns_redirects (id, record_type, source, target) VALUES ('negtest-dns-1', 'CNAME', 'negtest.qnfo.org', 'negtest-site.pages.dev')", effect: (db) => { const n = count(db, "SELECT COUNT(*) FROM project_state WHERE project_code = 'QNFO.INFRA.DNS' AND session_id = 'fk-violation' AND json_extract(resource_counts, '$.record_target') = 'negtest-site.pages.dev'"); return eff(n === 1, `fk-violation snapshots for the unregistered target=${n}`); } }],
    // The registry row and the trigger's own message say the snapshot is for a target with no audit_pages entry, so a
    // CNAME to a registered Pages project must not produce one.
    allowed: { sql: "INSERT INTO dns_redirects (id, record_type, source, target) VALUES ('negtest-dns-2', 'CNAME', 'registered.qnfo.org', 'negtest-registered.pages.dev')", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM project_state WHERE session_id = 'fk-violation'"); return eff(n === 0, `CNAME to a project registered in audit_pages: fk-violation snapshots=${n}`); } },
  },
  {
    guard: "trg_pages_domain_check", db: "audit", kind: "effect",
    seed: [...WBS, "INSERT INTO dns_redirects (id, record_type, source, target) VALUES ('negtest-dns-ok', 'CNAME', 'ok.qnfo.org', 'negtest-site.pages.dev')"],
    cases: [{ sql: "INSERT INTO cf_pages_domain_mappings (project_name, pages_subdomain, custom_domain) VALUES ('negtest-site', 'negtest-site.pages.dev', 'negtest.qnfo.org')", effect: (db) => { const n = count(db, "SELECT COUNT(*) FROM project_state WHERE project_code = 'QNFO.INFRA.PAGE' AND session_id = 'fk-violation' AND json_extract(resource_counts, '$.domain') = 'negtest.qnfo.org'"); return eff(n === 1, `fk-violation snapshots for the uncovered domain=${n}`); } }],
    allowed: { sql: "INSERT INTO cf_pages_domain_mappings (project_name, pages_subdomain, custom_domain) VALUES ('negtest-site', 'negtest-site.pages.dev', 'ok.qnfo.org')", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM project_state WHERE project_code = 'QNFO.INFRA.PAGE'"); return eff(n === 0, `domain with an active CNAME: fk-violation snapshots=${n}`); } },
  },
  {
    guard: "trg_registry_audit_log", db: "audit", kind: "effect",
    seed: [...WBS],
    cases: [{ sql: "INSERT INTO audit_workers (worker_name) VALUES ('negtest-worker')", effect: (db) => { const n = count(db, "SELECT COUNT(*) FROM audit_trail WHERE session_id = 'registry-sync' AND evidence = 'Worker registered: negtest-worker'"); const w = count(db, "SELECT COUNT(*) FROM audit_workers WHERE worker_name = 'negtest-worker'"); return eff(n === 1 && w === 1, `audit_workers rows=${w}, audit_trail rows=${n}`); } }],
  },
  {
    guard: "trg_worker_archive_cascade", db: "audit", kind: "effect",
    seed: [...WBS,
      "INSERT INTO audit_workers (worker_name, status) VALUES ('negtest-worker', 'active'), ('negtest-other', 'active')",
      "INSERT INTO dns_redirects (id, record_type, source, target) VALUES ('negtest-dns-w', 'CNAME', 'w.qnfo.org', 'negtest-worker.workers.dev'), ('negtest-dns-o', 'CNAME', 'o.qnfo.org', 'negtest-other.workers.dev')"],
    cases: [{ sql: "UPDATE audit_workers SET status = 'archived' WHERE worker_name = 'negtest-worker'", effect: (db) => { const w = one(db, "SELECT deleted_on, notes FROM dns_redirects WHERE id = 'negtest-dns-w'"); const o = one(db, "SELECT deleted_on FROM dns_redirects WHERE id = 'negtest-dns-o'"); return eff(!!w?.deleted_on && w?.notes === "auto-archived: worker deleted" && o?.deleted_on == null, `archived worker's record deleted_on=${w?.deleted_on ? "set" : "NULL"}, other worker's record deleted_on=${o?.deleted_on ? "set" : "NULL"}`); } }],
    allowed: { sql: "UPDATE audit_workers SET status = 'paused' WHERE worker_name = 'negtest-worker'", check: (db) => { const w = one(db, "SELECT deleted_on FROM dns_redirects WHERE id = 'negtest-dns-w'"); return eff(w?.deleted_on == null, `non-archive status change: deleted_on=${w?.deleted_on ? "set" : "NULL"}`); } },
  },
  // ---- personal-life ----
  {
    guard: "email_index_received_at_iso_insert", db: "personal", kind: "abort", seed: [],
    state: "SELECT message_id, received_at FROM email_index ORDER BY message_id",
    cases: [`INSERT INTO email_index (message_id, sender, subject, received_at, ingested_at) VALUES ('<negtest-ei-1@example.org>', 'alice@example.org', 'negtest', '2026/09/27', '${T0}')`],
    allowed: { sql: `INSERT INTO email_index (message_id, sender, subject, received_at, ingested_at) VALUES ('<negtest-ei-1@example.org>', 'alice@example.org', 'negtest', '2026-09-27T10:00:00Z', '${T0}')`, check: (db) => { const n = count(db, "SELECT COUNT(*) FROM email_index"); return eff(n === 1, `ISO received_at inserted (rows=${n})`); } },
  },
  {
    guard: "email_index_received_at_iso_update", db: "personal", kind: "abort",
    seed: [`INSERT INTO email_index (message_id, sender, subject, received_at, ingested_at) VALUES ('<negtest-ei-2@example.org>', 'alice@example.org', 'negtest', '2026-09-27T10:00:00Z', '${T0}')`],
    state: "SELECT message_id, received_at FROM email_index ORDER BY message_id",
    cases: ["UPDATE email_index SET received_at = '27/09/2026 10:00' WHERE message_id = '<negtest-ei-2@example.org>'"],
    allowed: { sql: "UPDATE email_index SET received_at = '2026-09-28T09:30:00Z' WHERE message_id = '<negtest-ei-2@example.org>'", check: (db) => { const r = one(db, "SELECT received_at FROM email_index"); return eff(r?.received_at === "2026-09-28T09:30:00Z", `received_at=${r?.received_at}`); } },
  },
  {
    guard: "events_block_system_reminder_insert", db: "personal", kind: "abort", seed: [],
    state: "SELECT id, notes FROM events ORDER BY id",
    cases: [`INSERT INTO events (id, category, title, source, notes, ingested_at) VALUES ('negtest-ev-1', 'other', 'Dinner', 'chat', 'copied text <system-reminder> scaffolding', '${T0}')`],
    allowed: { sql: `INSERT INTO events (id, category, title, source, notes, ingested_at) VALUES ('negtest-ev-2', 'other', 'Dinner', 'chat', 'table for two at eight', '${T0}')`, check: (db) => { const n = count(db, "SELECT COUNT(*) FROM events WHERE id = 'negtest-ev-2'"); return eff(n === 1, `plain chat event inserted (rows=${n})`); } },
  },
  {
    guard: "events_block_system_reminder_update", db: "personal", kind: "abort",
    seed: [`INSERT INTO events (id, category, title, source, notes, ingested_at) VALUES ('negtest-ev-3', 'other', 'Dinner', 'calendar', 'table for two', '${T0}')`],
    state: "SELECT id, title, notes FROM events ORDER BY id",
    cases: ["UPDATE events SET notes = 'pasted <system-reminder> block' WHERE id = 'negtest-ev-3'"],
    allowed: { sql: "UPDATE events SET notes = 'moved to nine' WHERE id = 'negtest-ev-3'", check: (db) => { const r = one(db, "SELECT notes FROM events WHERE id = 'negtest-ev-3'"); return eff(r?.notes === "moved to nine", `notes=${r?.notes}`); } },
  },
  {
    guard: "events_start_date_iso_insert", db: "personal", kind: "abort", seed: [],
    state: "SELECT id, start_date FROM events ORDER BY id",
    cases: [`INSERT INTO events (id, category, title, start_date, ingested_at) VALUES ('negtest-ev-4', 'travel', 'Train', '27-09-2026', '${T0}')`],
    allowed: { sql: `INSERT INTO events (id, category, title, start_date, ingested_at) VALUES ('negtest-ev-4', 'travel', 'Train', '2026-09-27', '${T0}')`, check: (db) => { const n = count(db, "SELECT COUNT(*) FROM events WHERE start_date = '2026-09-27'"); return eff(n === 1, `ISO start_date inserted (rows=${n})`); } },
  },
  {
    guard: "events_start_date_iso_update", db: "personal", kind: "abort",
    seed: [`INSERT INTO events (id, category, title, start_date, ingested_at) VALUES ('negtest-ev-5', 'travel', 'Train', '2026-09-27', '${T0}')`],
    state: "SELECT id, start_date FROM events ORDER BY id",
    cases: ["UPDATE events SET start_date = '27-09-2026' WHERE id = 'negtest-ev-5'"],
    allowed: { sql: "UPDATE events SET start_date = '2026-09-28' WHERE id = 'negtest-ev-5'", check: (db) => { const r = one(db, "SELECT start_date FROM events WHERE id = 'negtest-ev-5'"); return eff(r?.start_date === "2026-09-28", `start_date=${r?.start_date}`); } },
  },
  // ---- living-paper ----
  {
    guard: "papers_ad", db: "living", kind: "effect", seed: [PAPER],
    cases: [{ sql: "DELETE FROM papers WHERE identifier = 'negtest-paper-1'", effect: (db) => { const t = fts(db, "papers_fts", "negtestzebra"), a = fts(db, "papers_fts", "negtestokapi"); return eff(t === 0 && a === 0, `MATCH title=${t} abstract=${a} after delete`); } }],
  },
  {
    guard: "papers_ai", db: "living", kind: "effect", seed: [],
    cases: [{ sql: PAPER, effect: (db) => { const t = fts(db, "papers_fts", "negtestzebra"), a = fts(db, "papers_fts", "negtestokapi"); return eff(t === 1 && a === 1, `MATCH title=${t} abstract=${a} after insert`); } }],
  },
  {
    guard: "papers_au", db: "living", kind: "effect", seed: [PAPER],
    cases: [{ sql: "UPDATE papers SET title = 'Negtestquokka resonance' WHERE identifier = 'negtest-paper-1'", effect: (db) => { const o = fts(db, "papers_fts", "negtestzebra"), n = fts(db, "papers_fts", "negtestquokka"), a = fts(db, "papers_fts", "negtestokapi"); return eff(o === 0 && n === 1 && a === 1, `MATCH old title=${o} new title=${n} abstract=${a}`); } }],
  },
  // ---- invariant (no schema object) ----
  { guard: "guard-registry-coverage", db: "audit", kind: "invariant" },
];

// ---- repaired guards, tested against the CREATE TRIGGER text in the migration (ddl: "migration") ---------------------
// The same statements are also run against the live DDL; the entry passes only if the live DDL fails them.
GUARDS.push(
  {
    guard: "trg_registry_audit_log", db: "audit", kind: "effect", ddl: "migration", seed: [...WBS],
    cases: [{ sql: "INSERT INTO audit_workers (worker_name) VALUES ('negtest-worker')", effect: (db) => { const w = count(db, "SELECT COUNT(*) FROM audit_workers WHERE worker_name = 'negtest-worker'"); const t = one(db, "SELECT COUNT(*) AS n, MAX(task_id) AS task_id, MAX(action) AS action, MAX(worker_name) AS worker_name FROM audit_trail WHERE session_id = 'registry-sync'"); return eff(w === 1 && t.n === 1 && t.task_id === "registry-sync:negtest-worker" && t.action === "deployed" && t.worker_name === "negtest-worker", `audit_workers rows=${w}, audit_trail rows=${t.n} task_id=${t.task_id} action=${t.action} worker_name=${t.worker_name}`); } }],
    allowed: { sql: "INSERT INTO audit_workers (worker_name) VALUES (NULL)", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM audit_trail WHERE task_id = 'registry-sync:'"); return eff(n === 1, `a registration without worker_name is still logged (audit_trail rows=${n})`); } },
  },
  {
    guard: "trg_dns_pages_fk", db: "audit", kind: "effect", ddl: "migration",
    seed: [...WBS, "INSERT INTO audit_pages (project_name, subdomain) VALUES ('negtest-registered', 'negtest-registered.pages.dev')"],
    cases: [
      { sql: "INSERT INTO dns_redirects (id, record_type, source, target) VALUES ('negtest-dns-1', 'CNAME', 'negtest.qnfo.org', 'negtest-site.pages.dev')", effect: (db) => { const n = count(db, "SELECT COUNT(*) FROM project_state WHERE project_code = 'QNFO.INFRA.DNS' AND session_id = 'fk-violation' AND json_extract(resource_counts, '$.record_target') = 'negtest-site.pages.dev'"); return eff(n === 1, `unregistered target: fk-violation snapshots=${n}`); } },
      { isolate: true, sql: "INSERT INTO dns_redirects (id, record_type, source, target) VALUES ('negtest-dns-3', 'CNAME', 'near.qnfo.org', 'xnegtest-registered.pages.dev')", effect: (db) => { const n = count(db, "SELECT COUNT(*) FROM project_state WHERE session_id = 'fk-violation' AND json_extract(resource_counts, '$.record_target') = 'xnegtest-registered.pages.dev'"); return eff(n === 1, `near-miss target (suffix without a dot): fk-violation snapshots=${n}`); } },
    ],
    allowed: { sql: "INSERT INTO dns_redirects (id, record_type, source, target) VALUES ('negtest-dns-2', 'CNAME', 'registered.qnfo.org', 'negtest-registered.pages.dev'); INSERT INTO dns_redirects (id, record_type, source, target) VALUES ('negtest-dns-4', 'CNAME', 'upper.qnfo.org', 'Negtest-Registered.Pages.Dev'); INSERT INTO dns_redirects (id, record_type, source, target) VALUES ('negtest-dns-5', 'CNAME', 'alias.qnfo.org', 'preview.negtest-registered.pages.dev')", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM project_state WHERE session_id = 'fk-violation'"); const d = count(db, "SELECT COUNT(*) FROM dns_redirects"); return eff(n === 0 && d === 3, `registered project (exact, upper-case, branch alias): dns rows=${d}, fk-violation snapshots=${n}`); } },
  },
);

// ---- the 75 triggers that had no guard_registry row (coverage read 2026-10-05T18:51:13Z) ---------------------------
// register: the guard_registry text the row is inserted with. Seeds mirror live reference rows read 2026-10-05
// (status_canon, priority_canon, transport_trust, tool_error_exclusions, worker_schedules for fleet-exec).
const CANON = [
  "INSERT INTO status_canon (raw_value, canonical, is_open, is_terminal) VALUES ('open', 'open', 1, 0), ('closed', 'closed', 0, 1), ('resolved', 'closed', 0, 1), ('wontfix', 'closed', 0, 1)",
  "INSERT INTO priority_canon (raw_value, canonical, rank) VALUES ('critical', 'critical', 0), ('high', 'high', 1), ('medium', 'medium', 2), ('low', 'low', 3)",
];
const ISSUE = (id, title, status = "open") => `INSERT INTO agent_issues (id, title, status, priority, created_at, updated_at) VALUES (${id}, '${title}', '${status}', 'low', 1791223200000, 1791223200000)`;
const NOW_ISO = "strftime('%Y-%m-%dT%H:%M:%S.000Z','now')";
const OPS_EVENT = (id) => `INSERT INTO cloud_ops_events (id, ts, kind, text, status) VALUES ('${id}', ${NOW_ISO}, 'ops_ai_tool', 'fleet_status', 'ok')`;
const SELF_HEAL = (ref, hoursAgo) => `INSERT INTO self_heal_actions (kind, ref, action, ts, status) VALUES ('node-budget', '${ref}', 'throttle', strftime('%Y-%m-%dT%H:%M:%SZ','now','-${hoursAgo} hours'), 'dispatched')`;
const LIVE_SCHED = '["*/10 * * * *"]';
const HOURLY_SCHED = '["0 * * * *"]';
const CRON_SEED = (sched) => [
  "INSERT INTO fleet_tasks (id, name, type, definition) VALUES ('negtest-task', 'negtest', 'http', '{}'), ('negtest-task-2', 'negtest 2', 'http', '{}')",
  `INSERT INTO worker_schedules (name, crons_json) VALUES ('fleet-exec', '${sched}')`,
  "INSERT INTO fleet_crons (name, cron_expr, task_id, next_fire) VALUES ('negtest-cron', '0 * * * *', 'negtest-task', '2026-10-05T19:00:00Z')",
];
const EVIDENCE_OK = "probe: GET /api/metrics shows the metric back at 0 (negtest)";
const TRIAGE = (id, state, evidence = EVIDENCE_OK) => `INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (${id}, 'negtest', '${state}', 'qnfo-ops', '2026-10-05 18:00:00', ${evidence === null ? "NULL" : `'${evidence}'`})`;
const RV_SEED = [...CANON, "INSERT INTO transport_trust (transport, observation_class, trusted) VALUES ('d1-query', 'data-plane', 1), ('self', 'internal-self', 0)"];
const RV = (issue, transport, expected, observed, pass) => `INSERT INTO remediation_verifications (issue_id, class, transport, expected, observed, pass) VALUES (${issue}, 'negtest', '${transport}', ${expected === null ? "NULL" : `'${expected}'`}, ${observed === null ? "NULL" : `'${observed}'`}, ${pass})`;
const METRIC = (cols) => `INSERT INTO metric_registry (metric, layer, kind, source_of_truth, disposition_actor, refresh_cadence${cols.last ? ", last_refreshed" : ""}) VALUES ('${cols.metric || "negtest_metric"}', 'ops', 'target', ${cols.source === null ? "NULL" : `'${cols.source ?? "qnfo-audit.agent_issues"}'`}, ${cols.actor === null ? "NULL" : `'${cols.actor ?? "qnfo-fleet-control"}'`}, '${cols.cadence ?? "hourly"}'${cols.last ? `, '${cols.last}'` : ""})`;
const val = (db, sql) => { const r = db.prepare(sql).get(); return r ? Object.values(r)[0] : undefined; };
const reg = (target_table, invariant, negative_test, remediation_hint) => ({ target_table, invariant, negative_test, remediation_hint });
const tsEff = (sql, want, label) => (db) => { const r = one(db, `SELECT (${sql}) AS got, (${want}) AS want, typeof((${sql})) AS t`); return eff(r.got === r.want && r.got !== null, `${label}=${r.got} (${r.t})`); };
const issueCount = (title) => (db) => count(db, `SELECT COUNT(*) FROM agent_issues WHERE title = '${title}'`);

const REGISTER = [
  // agent_issues
  {
    guard: "agent_issues_updated_at_norm_ins", db: "audit", kind: "effect", seed: CANON,
    register: reg("agent_issues", "AFTER INSERT: a TEXT updated_at is rewritten to INTEGER epoch milliseconds (now when unparseable)", "Insert an agent_issues row with updated_at = '2026-10-05 18:00:00' (text); expect updated_at to become the INTEGER epoch ms of that time", "Write epoch ms; the trigger only repairs text timestamps"),
    cases: [{ sql: "INSERT INTO agent_issues (title, status, priority, created_at, updated_at) VALUES ('NEGTEST-TS-1: probe', 'open', 'low', 1791223200000, '2026-10-05 18:00:00')", effect: tsEff("SELECT updated_at FROM agent_issues WHERE title = 'NEGTEST-TS-1: probe'", "CAST(strftime('%s','2026-10-05 18:00:00') AS INTEGER) * 1000", "updated_at") }],
  },
  {
    guard: "agent_issues_updated_at_norm_upd", db: "audit", kind: "effect", seed: [...CANON, ISSUE(501, "NEGTEST-TS-2: probe")],
    register: reg("agent_issues", "AFTER UPDATE OF updated_at: a TEXT updated_at is rewritten to INTEGER epoch milliseconds", "Set updated_at = '2026-10-05 19:00:00' (text) on an agent_issues row; expect the INTEGER epoch ms of that time", "Write epoch ms; the trigger only repairs text timestamps"),
    cases: [{ sql: "UPDATE agent_issues SET updated_at = '2026-10-05 19:00:00' WHERE id = 501", effect: tsEff("SELECT updated_at FROM agent_issues WHERE id = 501", "CAST(strftime('%s','2026-10-05 19:00:00') AS INTEGER) * 1000", "updated_at") }],
  },
  {
    guard: "agent_issues_created_at_norm_secs_ins", db: "audit", kind: "effect", seed: CANON,
    register: reg("agent_issues", "AFTER INSERT: an INTEGER created_at in epoch seconds (0 < v < 1e11) is multiplied to epoch milliseconds", "Insert an agent_issues row with created_at = 1791223200 (seconds); expect 1791223200000", "Write epoch ms; seconds are repaired, not rejected"),
    cases: [{ sql: "INSERT INTO agent_issues (title, status, priority, created_at, updated_at) VALUES ('NEGTEST-TS-3: probe', 'open', 'low', 1791223200, 1791223200000)", effect: tsEff("SELECT created_at FROM agent_issues WHERE title = 'NEGTEST-TS-3: probe'", "1791223200000", "created_at") }],
  },
  {
    guard: "agent_issues_updated_at_norm_secs_ins", db: "audit", kind: "effect", seed: CANON,
    register: reg("agent_issues", "AFTER INSERT: an INTEGER updated_at in epoch seconds (0 < v < 1e11) is multiplied to epoch milliseconds", "Insert an agent_issues row with updated_at = 1791223200 (seconds); expect 1791223200000", "Write epoch ms; seconds are repaired, not rejected"),
    cases: [{ sql: "INSERT INTO agent_issues (title, status, priority, created_at, updated_at) VALUES ('NEGTEST-TS-4: probe', 'open', 'low', 1791223200000, 1791223200)", effect: tsEff("SELECT updated_at FROM agent_issues WHERE title = 'NEGTEST-TS-4: probe'", "1791223200000", "updated_at") }],
  },
  {
    guard: "agent_issues_updated_at_norm_secs_upd", db: "audit", kind: "effect", seed: [...CANON, ISSUE(502, "NEGTEST-TS-5: probe")],
    register: reg("agent_issues", "AFTER UPDATE OF updated_at: an INTEGER value in epoch seconds is multiplied to epoch milliseconds", "Set updated_at = 1791226800 (seconds) on an agent_issues row; expect 1791226800000", "Write epoch ms; seconds are repaired, not rejected"),
    cases: [{ sql: "UPDATE agent_issues SET updated_at = 1791226800 WHERE id = 502", effect: tsEff("SELECT updated_at FROM agent_issues WHERE id = 502", "1791226800000", "updated_at") }],
  },
  {
    guard: "agent_issues_created_at_norm_secs_upd", db: "audit", kind: "effect", seed: [...CANON, ISSUE(503, "NEGTEST-TS-6: probe")],
    register: reg("agent_issues", "AFTER UPDATE OF created_at: an INTEGER value in epoch seconds is multiplied to epoch milliseconds", "Set created_at = 1791226800 (seconds) on an agent_issues row; expect 1791226800000", "Write epoch ms; seconds are repaired, not rejected"),
    cases: [{ sql: "UPDATE agent_issues SET created_at = 1791226800 WHERE id = 503", effect: tsEff("SELECT created_at FROM agent_issues WHERE id = 503", "1791226800000", "created_at") }],
  },
  {
    guard: "agent_issues_updated_at_default_ins", db: "audit", kind: "effect", seed: CANON,
    register: reg("agent_issues", "AFTER INSERT: a NULL updated_at is set to now in epoch milliseconds", "Insert an agent_issues row without updated_at; expect an INTEGER epoch-ms updated_at", "None needed; writers may omit updated_at"),
    cases: [{ sql: "INSERT INTO agent_issues (title, status, priority, created_at) VALUES ('NEGTEST-TS-7: probe', 'open', 'low', 1791223200000)", effect: (db) => { const r = one(db, "SELECT updated_at AS u, typeof(updated_at) AS t FROM agent_issues WHERE title = 'NEGTEST-TS-7: probe'"); return eff(r?.t === "integer" && r.u > 1.7e12, `updated_at=${r?.u} (${r?.t})`); } }],
  },
  {
    guard: "agent_issues_created_at_default_ins", db: "audit", kind: "effect", seed: CANON,
    register: reg("agent_issues", "AFTER INSERT: a NULL created_at is set to now in epoch milliseconds", "Insert an agent_issues row without created_at; expect an INTEGER epoch-ms created_at", "None needed; writers may omit created_at"),
    cases: [{ sql: "INSERT INTO agent_issues (title, status, priority, updated_at) VALUES ('NEGTEST-TS-8: probe', 'open', 'low', 1791223200000)", effect: (db) => { const r = one(db, "SELECT created_at AS c, typeof(created_at) AS t FROM agent_issues WHERE title = 'NEGTEST-TS-8: probe'"); return eff(r?.t === "integer" && r.c > 1.7e12, `created_at=${r?.c} (${r?.t})`); } }],
  },
  {
    guard: "agent_issues_recheck_count_upd", db: "audit", kind: "effect", seed: [...CANON, ISSUE(504, "NEGTEST-RC-1: probe"), ISSUE(505, "NEGTEST-RC-2: probe", "closed")],
    register: reg("agent_issues", "AFTER UPDATE OF updated_at on an issue that stays open: recheck_count is incremented by 1", "Change updated_at of an open agent_issues row; expect recheck_count 0 -> 1 (a closed row stays 0)", "recheck_count counts re-checks; do not reset it by hand"),
    cases: [{ sql: "UPDATE agent_issues SET updated_at = 1791223260000 WHERE id = 504", effect: (db) => { const n = val(db, "SELECT recheck_count FROM agent_issues WHERE id = 504"); return eff(n === 1, `open issue recheck_count=${n}`); } }],
    allowed: { sql: "UPDATE agent_issues SET updated_at = 1791223260000 WHERE id = 505", check: (db) => { const n = val(db, "SELECT recheck_count FROM agent_issues WHERE id = 505"); return eff(n === 0, `closed issue recheck_count=${n}`); } },
  },
  {
    guard: "tool_error_triage_mark_filed_rate_ins", db: "audit", kind: "effect",
    seed: [...CANON, "INSERT INTO tool_error_triage (event_id, tool, err_class, filed) VALUES ('negtest-e1', 'ops_d1_query', 'x', 0), ('negtest-e2', 'web_fetch', 'x', 0)"],
    register: reg("agent_issues", "AFTER INSERT of an issue titled TOOL-ERROR-RATE-<tool>-1: tool_error_triage rows for that tool are marked filed = 1", "Insert agent_issues title 'TOOL-ERROR-RATE-ops_d1_query-1'; expect tool_error_triage rows for ops_d1_query filed=1 and other tools unchanged", "Keep the TOOL-ERROR-RATE-<tool>-1 title shape; the tool name is parsed from it"),
    cases: [{ sql: "INSERT INTO agent_issues (title, status, priority) VALUES ('TOOL-ERROR-RATE-ops_d1_query-1', 'open', 'high')", effect: (db) => { const a = val(db, "SELECT filed FROM tool_error_triage WHERE event_id = 'negtest-e1'"), b = val(db, "SELECT filed FROM tool_error_triage WHERE event_id = 'negtest-e2'"); return eff(a === 1 && b === 0, `ops_d1_query filed=${a}, web_fetch filed=${b}`); } }],
  },
  {
    guard: "tool_error_triage_mark_filed_ins", db: "audit", kind: "effect",
    seed: [...CANON, "INSERT INTO tool_error_triage (event_id, tool, err_class, filed) VALUES ('negtest-e1', 'ops_d1_query', 'x', 0), ('negtest-e2', 'web_fetch', 'x', 0)"],
    register: reg("agent_issues", "AFTER INSERT of an issue titled 'TOOL-FAILURE: <tool> [error]': tool_error_triage rows for that tool are marked filed = 1", "Insert agent_issues title 'TOOL-FAILURE: ops_d1_query [error]'; expect tool_error_triage rows for ops_d1_query filed=1 and other tools unchanged", "Keep the 'TOOL-FAILURE: <tool> [error]' title shape; the tool name is parsed from it"),
    cases: [{ sql: "INSERT INTO agent_issues (title, status, priority) VALUES ('TOOL-FAILURE: ops_d1_query [error]', 'open', 'medium')", effect: (db) => { const a = val(db, "SELECT filed FROM tool_error_triage WHERE event_id = 'negtest-e1'"), b = val(db, "SELECT filed FROM tool_error_triage WHERE event_id = 'negtest-e2'"); return eff(a === 1 && b === 0, `ops_d1_query filed=${a}, web_fetch filed=${b}`); } }],
  },
  {
    guard: "agent_issues_predicate_default_ins", db: "audit", kind: "effect", seed: CANON,
    register: reg("agent_issues", "AFTER INSERT with predicate_id NULL: predicate_id is set to the title up to its first ':' (max 80 chars), else the first 80 chars", "Insert agent_issues title 'NEGTEST-PRED-1: probe text' without predicate_id; expect predicate_id 'NEGTEST-PRED-1'", "Set predicate_id explicitly when the title prefix is not the predicate"),
    cases: [{ sql: "INSERT INTO agent_issues (title, status, priority) VALUES ('NEGTEST-PRED-1: probe text', 'open', 'low')", effect: (db) => { const p = val(db, "SELECT predicate_id FROM agent_issues WHERE title = 'NEGTEST-PRED-1: probe text'"); return eff(p === "NEGTEST-PRED-1", `predicate_id=${p}`); } }],
    allowed: { sql: "INSERT INTO agent_issues (title, status, priority, predicate_id) VALUES ('NEGTEST-PRED-2: probe text', 'open', 'low', 'explicit-pred')", check: (db) => { const p = val(db, "SELECT predicate_id FROM agent_issues WHERE title = 'NEGTEST-PRED-2: probe text'"); return eff(p === "explicit-pred", `explicit predicate_id kept: ${p}`); } },
  },
  {
    guard: "agent_issues_autotriage2_ins", db: "audit", kind: "effect", seed: [...CANON, "INSERT INTO service_registry (service) VALUES ('qnfo-fleet-control')"],
    register: reg("agent_issues", "AFTER INSERT of an open issue: an issue_triage row is created (AUTOTRIAGE-1 owner qnfo-ops; AUTOTRIAGE-2 owner = the service named by a code-task path or a metric trigger's owner)", "Insert an open issue; expect issue_triage rc AUTOTRIAGE-1 owner qnfo-ops. Insert one whose description has 'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js'; expect rc AUTOTRIAGE-2 owner qnfo-fleet-control", "Name the owning service in a code-task line or a metric trigger owner"),
    cases: [
      { sql: "INSERT INTO agent_issues (title, status, priority) VALUES ('NEGTEST-AT-1: probe', 'open', 'medium')", effect: (db) => { const r = one(db, "SELECT t.rc, t.owner FROM issue_triage t JOIN agent_issues a ON a.id = t.issue_id WHERE a.title = 'NEGTEST-AT-1: probe'"); return eff(r?.rc === "AUTOTRIAGE-1" && r?.owner === "qnfo-ops", r ? `rc=${r.rc} owner=${r.owner}` : "no triage row"); } },
      { sql: "INSERT INTO agent_issues (title, description, status, priority) VALUES ('NEGTEST-AT-2: probe', 'fix it. code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js', 'open', 'medium')", effect: (db) => { const r = one(db, "SELECT t.rc, t.owner FROM issue_triage t JOIN agent_issues a ON a.id = t.issue_id WHERE a.title = 'NEGTEST-AT-2: probe'"); return eff(r?.rc === "AUTOTRIAGE-2" && r?.owner === "qnfo-fleet-control", r ? `code-task issue rc=${r.rc} owner=${r.owner}` : "code-task issue: no triage row"); } },
    ],
    allowed: { sql: "INSERT INTO agent_issues (title, status, priority) VALUES ('NEGTEST-AT-3: probe', 'closed', 'low')", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM issue_triage"); return eff(n === 0, `closed issue: triage rows=${n}`); } },
  },
  // cloud_ops_events
  {
    guard: "self_heal_reap_stale_ins", db: "audit", kind: "effect", seed: [SELF_HEAL("negtest-old", 13)],
    register: reg("cloud_ops_events", "AFTER INSERT of an ops_ai_tool event: self_heal_actions dispatched more than 12h ago with no verification are set verified-failed with claim REAPER-SELFHEAL-STALE-1", "Seed a self_heal_actions row dispatched 13h ago, then add an ops_ai_tool cloud_ops_events row; expect status verified-failed and claim REAPER-SELFHEAL-STALE-1", "The dispatcher should write a terminal status itself"),
    cases: [{ sql: OPS_EVENT("negtest-ops-1"), effect: (db) => { const r = one(db, "SELECT status, claim FROM self_heal_actions WHERE ref = 'negtest-old'"); return eff(r?.status === "verified-failed" && /^REAPER-SELFHEAL-STALE-1 /.test(r?.claim || ""), `status=${r?.status} claim=${abbr(r?.claim, 26)}`); } }],
    allowed: { seed: [SELF_HEAL("negtest-fresh", 1)], sql: OPS_EVENT("negtest-ops-2"), check: (db) => { const s = val(db, "SELECT status FROM self_heal_actions WHERE ref = 'negtest-fresh'"); return eff(s === "dispatched", `1h-old dispatch status=${s}`); } },
  },
  {
    guard: "self_heal_reap_stale_v2_ins", db: "audit", kind: "effect", seed: [SELF_HEAL("negtest-3h", 3)],
    register: reg("cloud_ops_events", "AFTER INSERT of an ops_ai_tool event: self_heal_actions dispatched more than 2h ago with no verification are set verified-failed with claim REAPER-SELFHEAL-STALE-2", "Seed a self_heal_actions row dispatched 3h ago, then add an ops_ai_tool cloud_ops_events row; expect status verified-failed and claim REAPER-SELFHEAL-STALE-2 (a 1h-old row stays dispatched)", "The dispatcher should write a terminal status itself"),
    cases: [{ sql: OPS_EVENT("negtest-ops-1"), effect: (db) => { const r = one(db, "SELECT status, claim FROM self_heal_actions WHERE ref = 'negtest-3h'"); return eff(r?.status === "verified-failed" && /^REAPER-SELFHEAL-STALE-2 /.test(r?.claim || ""), `status=${r?.status} claim=${abbr(r?.claim, 26)}`); } }],
    allowed: { seed: [SELF_HEAL("negtest-fresh", 1)], sql: OPS_EVENT("negtest-ops-2"), check: (db) => { const s = val(db, "SELECT status FROM self_heal_actions WHERE ref = 'negtest-fresh'"); return eff(s === "dispatched", `1h-old dispatch status=${s}`); } },
  },
  {
    guard: "deploy_locks_reap_expired_v2_ins", db: "audit", kind: "effect",
    seed: ["INSERT INTO deploy_locks (worker, token_hash, since, expires_at) VALUES ('negtest-w1', 'h', 'x', CAST(strftime('%s','now') AS INTEGER) * 1000 - 60000), ('negtest-w2', 'h', 'x', CAST(strftime('%s','now') AS INTEGER) * 1000 + 600000)"],
    register: reg("cloud_ops_events", "AFTER INSERT of an ops_ai_tool event: deploy_locks past expires_at (epoch ms) are released with released_by LOCK-REAPER-1", "Seed one expired and one live deploy_locks row, then add an ops_ai_tool cloud_ops_events row; expect only the expired lock released", "Release locks explicitly; the reaper is a backstop"),
    cases: [{ sql: OPS_EVENT("negtest-ops-1"), effect: (db) => { const a = one(db, "SELECT released_at, released_by FROM deploy_locks WHERE worker = 'negtest-w1'"); const b = val(db, "SELECT released_at FROM deploy_locks WHERE worker = 'negtest-w2'"); return eff(!!a?.released_at && /^LOCK-REAPER-1 /.test(a?.released_by || "") && b == null, `expired lock released=${a?.released_at ? "yes" : "no"}, live lock released=${b ? "yes" : "no"}`); } }],
  },
  {
    guard: "cloud_ops_events_ts_norm_epoch_ins", db: "audit", kind: "effect", seed: [],
    register: reg("cloud_ops_events", "AFTER INSERT: a 10-digit epoch-seconds ts is rewritten to ISO YYYY-MM-DDTHH:MM:SS.000Z", "Insert cloud_ops_events ts = '1791223200'; expect the ISO form of that instant", "Write ISO timestamps"),
    cases: [{ sql: "INSERT INTO cloud_ops_events (id, ts, kind, text) VALUES ('negtest-ts-e', '1791223200', 'negtest', 'probe')", effect: tsEff("SELECT ts FROM cloud_ops_events WHERE id = 'negtest-ts-e'", "strftime('%Y-%m-%dT%H:%M:%S.000Z', 1791223200, 'unixepoch')", "ts") }],
  },
  {
    guard: "cloud_ops_events_ts_norm_upd", db: "audit", kind: "effect", seed: ["INSERT INTO cloud_ops_events (id, ts, kind, text) VALUES ('negtest-ts-u', '2026-10-05T18:00:00.000Z', 'negtest', 'probe')"],
    register: reg("cloud_ops_events", "AFTER UPDATE OF ts: a 19-char 'YYYY-MM-DD HH:MM:SS' ts is rewritten to ISO with T and .000Z", "Set cloud_ops_events ts = '2026-10-05 19:00:00'; expect '2026-10-05T19:00:00.000Z'", "Write ISO timestamps"),
    cases: [{ sql: "UPDATE cloud_ops_events SET ts = '2026-10-05 19:00:00' WHERE id = 'negtest-ts-u'", effect: tsEff("SELECT ts FROM cloud_ops_events WHERE id = 'negtest-ts-u'", "'2026-10-05T19:00:00.000Z'", "ts") }],
  },
  {
    guard: "cloud_ops_events_ts_norm_ins", db: "audit", kind: "effect", seed: [],
    register: reg("cloud_ops_events", "AFTER INSERT: a 19-char 'YYYY-MM-DD HH:MM:SS' ts is rewritten to ISO with T and .000Z", "Insert cloud_ops_events ts = '2026-10-05 18:00:00'; expect '2026-10-05T18:00:00.000Z'", "Write ISO timestamps"),
    cases: [{ sql: "INSERT INTO cloud_ops_events (id, ts, kind, text) VALUES ('negtest-ts-i', '2026-10-05 18:00:00', 'negtest', 'probe')", effect: tsEff("SELECT ts FROM cloud_ops_events WHERE id = 'negtest-ts-i'", "'2026-10-05T18:00:00.000Z'", "ts") }],
    allowed: { sql: "INSERT INTO cloud_ops_events (id, ts, kind, text) VALUES ('negtest-ts-ok', '2026-10-05T18:00:00.000Z', 'negtest', 'probe')", check: (db) => { const t = val(db, "SELECT ts FROM cloud_ops_events WHERE id = 'negtest-ts-ok'"); return eff(t === "2026-10-05T18:00:00.000Z", `ISO ts kept: ${t}`); } },
  },
  {
    guard: "cloud_ops_events_secret_scrub_ins", db: "audit", kind: "effect", seed: [],
    register: reg("cloud_ops_events", "AFTER INSERT: text containing a credential prefix (cfat_, ghp_, github_pat_, sk-ant-, AIza, AKIA, ops-key prefix) is cut at the prefix and marked [REDACTED-...]", "Insert cloud_ops_events text 'call failed token=ghp_NEGTESTFAKE'; expect 'call failed token=[REDACTED-GH-TOKEN]'", "Never log credentials; the scrub is a backstop"),
    cases: [
      { sql: `INSERT INTO cloud_ops_events (id, ts, kind, text) VALUES ('negtest-s1', ${NOW_ISO}, 'negtest', 'call failed token=ghp_NEGTESTFAKE')`, effect: (db) => { const t = val(db, "SELECT text FROM cloud_ops_events WHERE id = 'negtest-s1'"); return eff(t === "call failed token=[REDACTED-GH-TOKEN]", `text=${t}`); } },
      { sql: `INSERT INTO cloud_ops_events (id, ts, kind, text) VALUES ('negtest-s2', ${NOW_ISO}, 'negtest', 'key OPSKEYPX-NEGTEST leaked')`, effect: (db) => { const t = val(db, "SELECT text FROM cloud_ops_events WHERE id = 'negtest-s2'"); return eff(t === "key [REDACTED-OPS-KEY]", `text=${t}`); } },
    ],
    allowed: { sql: `INSERT INTO cloud_ops_events (id, ts, kind, text) VALUES ('negtest-s3', ${NOW_ISO}, 'negtest', 'plain message')`, check: (db) => { const t = val(db, "SELECT text FROM cloud_ops_events WHERE id = 'negtest-s3'"); return eff(t === "plain message", `clean text kept: ${t}`); } },
  },
  {
    guard: "cloud_ops_events_secret_guard_ins", db: "audit", kind: "effect", seed: [],
    register: reg("cloud_ops_events", "AFTER INSERT: meta containing a credential prefix is cut at the prefix and marked [REDACTED-...], so no credential persists in meta", "Insert cloud_ops_events meta '{\"auth\":\"ghp_NEGTESTFAKE\"}' and, separately, a non-JSON meta 'Authorization: ghp_NEGTESTFAKE'; expect neither stored meta to contain the credential", "Never log credentials; the scrub is a backstop"),
    cases: [
      { sql: `INSERT INTO cloud_ops_events (id, ts, kind, text, meta) VALUES ('negtest-m1', ${NOW_ISO}, 'negtest', 'probe', '{"auth":"ghp_NEGTESTFAKE"}')`, effect: (db) => { const m = val(db, "SELECT meta FROM cloud_ops_events WHERE id = 'negtest-m1'"); return eff(m != null && !m.includes("ghp_NEGTESTFAKE") && m.includes("[REDACTED-GH-TOKEN]"), `JSON meta stored as ${abbr(m, 60)}`); } },
      { isolate: true, control: false, sql: `INSERT INTO cloud_ops_events (id, ts, kind, text, meta) VALUES ('negtest-m2', ${NOW_ISO}, 'negtest', 'probe', 'Authorization: ghp_NEGTESTFAKE')`, effect: (db) => { const m = val(db, "SELECT meta FROM cloud_ops_events WHERE id = 'negtest-m2'"); return eff(m != null && !m.includes("ghp_NEGTESTFAKE"), `non-JSON meta stored as ${abbr(m, 80)}`); } },
    ],
  },
  {
    guard: "cloud_ops_events_secret_guard_upd", db: "audit", kind: "effect", seed: ["INSERT INTO cloud_ops_events (id, ts, kind, text, meta) VALUES ('negtest-m3', '2026-10-05T18:00:00.000Z', 'negtest', 'probe', '{}')"],
    register: reg("cloud_ops_events", "AFTER UPDATE OF meta: meta containing a credential prefix is cut at the prefix and marked [REDACTED-...]", "Set cloud_ops_events meta = '{\"auth\":\"sk-ant-NEGTESTFAKE\"}'; expect the stored meta to hold no credential", "Never log credentials; the scrub is a backstop"),
    cases: [{ sql: `UPDATE cloud_ops_events SET meta = '{"auth":"sk-ant-NEGTESTFAKE"}' WHERE id = 'negtest-m3'`, effect: (db) => { const m = val(db, "SELECT meta FROM cloud_ops_events WHERE id = 'negtest-m3'"); return eff(m != null && !m.includes("sk-ant-NEGTESTFAKE") && m.includes("[REDACTED-ANTHROPIC-KEY]"), `meta stored as ${abbr(m, 80)}`); } }],
  },
  {
    guard: "cloud_ops_events_secret_scrub_upd", db: "audit", kind: "effect", seed: ["INSERT INTO cloud_ops_events (id, ts, kind, text) VALUES ('negtest-s4', '2026-10-05T18:00:00.000Z', 'negtest', 'ok')"],
    register: reg("cloud_ops_events", "AFTER UPDATE OF text: text containing a credential prefix is cut at the prefix and marked [REDACTED-...]", "Set cloud_ops_events text = 'leaked AKIANEGTESTFAKE'; expect 'leaked [REDACTED-AWS-KEY]'", "Never log credentials; the scrub is a backstop"),
    cases: [{ sql: "UPDATE cloud_ops_events SET text = 'leaked AKIANEGTESTFAKE' WHERE id = 'negtest-s4'", effect: (db) => { const t = val(db, "SELECT text FROM cloud_ops_events WHERE id = 'negtest-s4'"); return eff(t === "leaked [REDACTED-AWS-KEY]", `text=${t}`); } }],
  },
  {
    guard: "cloud_ops_events_meta_json_guard_ins", db: "audit", kind: "effect", seed: [],
    register: reg("cloud_ops_events", "AFTER INSERT: a meta that is not valid JSON is replaced by json_object(_truncated 1, _len, _raw first 2000 chars)", "Insert cloud_ops_events meta 'not json {'; expect valid JSON meta with _truncated=1 and _raw='not json {'", "Write JSON meta"),
    cases: [{ sql: `INSERT INTO cloud_ops_events (id, ts, kind, text, meta) VALUES ('negtest-j1', ${NOW_ISO}, 'negtest', 'probe', 'not json {')`, effect: (db) => { const r = one(db, "SELECT json_valid(meta) AS v, CASE WHEN json_valid(meta) THEN json_extract(meta, '$._truncated') END AS t, CASE WHEN json_valid(meta) THEN json_extract(meta, '$._raw') END AS raw FROM cloud_ops_events WHERE id = 'negtest-j1'"); return eff(r?.v === 1 && r?.t === 1 && r?.raw === "not json {", `json_valid=${r?.v} _truncated=${r?.t} _raw=${r?.raw}`); } }],
    allowed: { sql: `INSERT INTO cloud_ops_events (id, ts, kind, text, meta) VALUES ('negtest-j2', ${NOW_ISO}, 'negtest', 'probe', '{"a":1}')`, check: (db) => { const m = val(db, "SELECT meta FROM cloud_ops_events WHERE id = 'negtest-j2'"); return eff(m === '{"a":1}', `valid JSON kept: ${m}`); } },
  },
  {
    guard: "cloud_ops_events_meta_json_guard_upd", db: "audit", kind: "effect", seed: ["INSERT INTO cloud_ops_events (id, ts, kind, text, meta) VALUES ('negtest-j3', '2026-10-05T18:00:00.000Z', 'negtest', 'probe', '{}')"],
    register: reg("cloud_ops_events", "AFTER UPDATE OF meta: a meta that is not valid JSON is replaced by json_object(_truncated 1, _len, _raw)", "Set cloud_ops_events meta = 'broken {'; expect valid JSON meta with _truncated=1", "Write JSON meta"),
    cases: [{ sql: "UPDATE cloud_ops_events SET meta = 'broken {' WHERE id = 'negtest-j3'", effect: (db) => { const r = one(db, "SELECT json_valid(meta) AS v, CASE WHEN json_valid(meta) THEN json_extract(meta, '$._truncated') END AS t FROM cloud_ops_events WHERE id = 'negtest-j3'"); return eff(r?.v === 1 && r?.t === 1, `json_valid=${r?.v} _truncated=${r?.t}`); } }],
  },
  {
    guard: "tool_error_files_issue_v2", db: "audit", kind: "effect", seed: [...CANON, "INSERT INTO tool_error_exclusions (pattern, err_class) VALUES ('no such table', 'agent-schema-guess')"],
    register: reg("cloud_ops_events", "AFTER INSERT of an ops_ai_tool error event whose meta is readable (no _truncated) and matches no tool_error_exclusions pattern: an open 'TOOL-FAILURE: <tool> [error]' issue citing the event is filed once", "Insert an ops_ai_tool status=error event for tool negtest_tool; expect one open agent_issues 'TOOL-FAILURE: negtest_tool [error]' with source cloud_ops_events:<id>. An excluded pattern files nothing", "Add a tool_error_exclusions pattern for a known non-defect class"),
    cases: [{ sql: `INSERT INTO cloud_ops_events (id, ts, kind, text, meta, status) VALUES ('negtest-err-1', ${NOW_ISO}, 'ops_ai_tool', 'negtest_tool', '{"error":"boom"}', 'error')`, effect: (db) => { const n = count(db, "SELECT COUNT(*) FROM agent_issues WHERE title = 'TOOL-FAILURE: negtest_tool [error]' AND source = 'cloud_ops_events:negtest-err-1' AND status = 'open'"); return eff(n === 1, `TOOL-FAILURE issues filed=${n}`); } }],
    allowed: { sql: `INSERT INTO cloud_ops_events (id, ts, kind, text, meta, status) VALUES ('negtest-err-2', ${NOW_ISO}, 'ops_ai_tool', 'negtest_tool2', '{"error":"no such table: x"}', 'error')`, check: (db) => { const n = count(db, "SELECT COUNT(*) FROM agent_issues WHERE title LIKE 'TOOL-FAILURE: negtest_tool2%'"); return eff(n === 0, `excluded error: issues filed=${n}`); } },
  },
  {
    guard: "tool_error_rate_filer_v3_ins", db: "audit", kind: "effect",
    seed: [...CANON, `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 19) INSERT INTO cloud_ops_events (id, ts, kind, text, meta, status) SELECT 'negtest-rate-' || i, strftime('%Y-%m-%dT%H:%M:%S.000Z','now','-1 hours'), 'ops_ai_tool', 'negtest_rate_tool', '{"error":"boom"}', CASE WHEN i <= 9 THEN 'error' ELSE 'ok' END FROM n`],
    register: reg("cloud_ops_events", "AFTER INSERT of an ops_ai_tool error event: when the tool has >= 20 calls and >= 10 unexcluded errors in 24h and a fail rate >= 0.25 (or >= 60 errors), one open TOOL-ERROR-RATE-<tool>-1 issue is filed", "Seed 19 calls (9 errors) for one tool in the last hour, add a 20th call with status=error; expect one open 'TOOL-ERROR-RATE-negtest_rate_tool-1' issue (a 20th ok call files none)", "Fix the tool or add a tool_error_exclusions pattern for a known class"),
    cases: [{ sql: `INSERT INTO cloud_ops_events (id, ts, kind, text, meta, status) VALUES ('negtest-rate-20', ${NOW_ISO}, 'ops_ai_tool', 'negtest_rate_tool', '{"error":"boom"}', 'error')`, effect: (db) => { const n = issueCount("TOOL-ERROR-RATE-negtest_rate_tool-1")(db); return eff(n === 1, `TOOL-ERROR-RATE issues=${n}`); } }],
    allowed: { sql: `INSERT INTO cloud_ops_events (id, ts, kind, text, meta, status) VALUES ('negtest-rate-20', ${NOW_ISO}, 'ops_ai_tool', 'negtest_rate_tool', '{}', 'ok')`, check: (db) => { const n = issueCount("TOOL-ERROR-RATE-negtest_rate_tool-1")(db); return eff(n === 0, `9 errors in 20 calls: TOOL-ERROR-RATE issues=${n}`); } },
  },
  // deployment_history
  {
    guard: "deployment_history_provenance_required_ins", db: "audit", kind: "abort", seed: CANON,
    register: reg("deployment_history", "BEFORE INSERT: a deploy-ledger row needs non-empty notes (provenance), else ABORT deploy-ledger-row-without-provenance", "Insert deployment_history with notes NULL, and with notes of only spaces; expect ABORT deploy-ledger-row-without-provenance", "Write the run or PR that produced the deploy into notes"),
    state: "SELECT id, resource_name, version_id FROM deployment_history ORDER BY id",
    cases: [
      "INSERT INTO deployment_history (resource_type, resource_name, action, version_id, notes) VALUES ('pages', 'negtest-site', 'deploy', 'abc123', NULL)",
      "INSERT INTO deployment_history (resource_type, resource_name, action, version_id, notes) VALUES ('pages', 'negtest-site', 'deploy', 'abc123', '   ')",
    ],
    allowed: { sql: "INSERT INTO deployment_history (resource_type, resource_name, action, version_id, notes) VALUES ('pages', 'negtest-site', 'deploy', 'abc123', 'canonical-deploy negtest')", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM deployment_history"); return eff(n === 1, `row with provenance inserted (${n})`); } },
  },
  {
    guard: "deployment_history_deployed_at_norm_ins", db: "audit", kind: "effect", seed: CANON,
    register: reg("deployment_history", "AFTER INSERT: a deployed_at without a T separator is rewritten to ISO with T and .000Z", "Insert deployment_history deployed_at = '2026-10-05 18:00:00'; expect '2026-10-05T18:00:00.000Z'", "Write ISO timestamps"),
    cases: [{ sql: "INSERT INTO deployment_history (resource_type, resource_name, action, version_id, notes, deployed_at) VALUES ('pages', 'negtest-site', 'deploy', 'abc123', 'negtest', '2026-10-05 18:00:00')", effect: tsEff("SELECT deployed_at FROM deployment_history WHERE resource_name = 'negtest-site'", "'2026-10-05T18:00:00.000Z'", "deployed_at") }],
    allowed: { sql: "INSERT INTO deployment_history (resource_type, resource_name, action, version_id, notes, deployed_at) VALUES ('pages', 'negtest-site', 'deploy', 'abc123', 'negtest', '2026-10-05T18:00:00Z')", check: (db) => { const t = val(db, "SELECT deployed_at FROM deployment_history WHERE resource_name = 'negtest-site'"); return eff(t === "2026-10-05T18:00:00Z", `ISO deployed_at kept: ${t}`); } },
  },
  {
    guard: "version_regression_files_issue_ins", db: "audit", kind: "effect",
    seed: [...CANON, "INSERT INTO deployment_history (resource_type, resource_name, action, version_id, notes) VALUES ('worker', 'negtest-worker', 'deploy', '2.5.0', 'seed')"],
    register: reg("deployment_history", "AFTER INSERT of a worker deploy whose dotted version is lower than a prior deploy of the same worker: one open VERSION-LITERAL-NOT-MONOTONIC-1 issue is filed (detect-only)", "With 2.5.0 recorded for a worker, insert 2.4.0 with notes ROLLBACK-OK (so the monotonic guard lets it through); expect one open 'VERSION-LITERAL-NOT-MONOTONIC-1: negtest-worker regressed to 2.4.0' issue", "Redeploy with a VERSION at or above the highest deployed"),
    cases: [{ sql: "INSERT INTO deployment_history (resource_type, resource_name, action, version_id, notes) VALUES ('worker', 'negtest-worker', 'deploy', '2.4.0', 'ROLLBACK-OK negtest rollback')", effect: (db) => { const n = issueCount("VERSION-LITERAL-NOT-MONOTONIC-1: negtest-worker regressed to 2.4.0")(db); return eff(n === 1, `regression issues=${n}`); } }],
    allowed: { sql: "INSERT INTO deployment_history (resource_type, resource_name, action, version_id, notes) VALUES ('worker', 'negtest-worker', 'deploy', '2.6.0', 'deploy')", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM agent_issues WHERE title LIKE 'VERSION-LITERAL-NOT-MONOTONIC-1:%'"); return eff(n === 0, `forward deploy: regression issues=${n}`); } },
  },
  {
    guard: "deployment_history_mirrors_fleet_deploys_ins", db: "audit", kind: "effect", seed: CANON,
    register: reg("deployment_history", "AFTER INSERT of a worker deploy with a version: one fleet_deploys row (note MIRRORED-FROM-DEPLOYMENT-HISTORY-1) is written unless the same worker/version/ts exists", "Insert a worker deploy 2.6.0 for negtest-worker; expect one fleet_deploys row worker=negtest-worker to_sha=2.6.0 note MIRRORED-FROM-DEPLOYMENT-HISTORY-1 (a pages deploy mirrors nothing)", "Mirroring is automatic"),
    cases: [{ sql: "INSERT INTO deployment_history (resource_type, resource_name, action, version_id, notes, deployed_at) VALUES ('worker', 'negtest-worker', 'deploy', '2.6.0', 'deploy', '2026-10-05T18:00:00.000Z')", effect: (db) => { const n = count(db, "SELECT COUNT(*) FROM fleet_deploys WHERE worker = 'negtest-worker' AND to_sha = '2.6.0' AND note = 'MIRRORED-FROM-DEPLOYMENT-HISTORY-1'"); return eff(n === 1, `fleet_deploys mirror rows=${n}`); } }],
    allowed: { sql: "INSERT INTO deployment_history (resource_type, resource_name, action, version_id, notes) VALUES ('pages', 'negtest-site', 'deploy', 'abc123', 'deploy')", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM fleet_deploys"); return eff(n === 0, `pages deploy: fleet_deploys rows=${n}`); } },
  },
  {
    guard: "deployment_history_version_monotonic_ins", db: "audit", kind: "abort",
    seed: [...CANON, "INSERT INTO deployment_history (resource_type, resource_name, action, version_id, notes) VALUES ('worker', 'negtest-worker', 'deploy', '2.5.0', 'seed')"],
    register: reg("deployment_history", "BEFORE INSERT: a dotted version (<= 6 digits) lower than the highest already recorded for the resource is refused unless notes contain ROLLBACK-OK", "With 2.5.0 recorded for negtest-worker, insert 2.4.0 and 2.4.9-rc1 without ROLLBACK-OK; expect ABORT VERSION-MONOTONIC-1 (2.5.1 is accepted)", "Redeploy from current main, or add ROLLBACK-OK to notes for a deliberate rollback"),
    state: "SELECT id, version_id FROM deployment_history ORDER BY id",
    cases: [
      "INSERT INTO deployment_history (resource_type, resource_name, action, version_id, notes) VALUES ('worker', 'negtest-worker', 'deploy', '2.4.0', 'deploy negtest')",
      "INSERT INTO deployment_history (resource_type, resource_name, action, version_id, notes) VALUES ('worker', 'negtest-worker', 'deploy', '2.4.9-rc1', 'deploy negtest')",
    ],
    allowed: { sql: "INSERT INTO deployment_history (resource_type, resource_name, action, version_id, notes) VALUES ('worker', 'negtest-worker', 'deploy', '2.5.1', 'deploy')", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM deployment_history WHERE version_id = '2.5.1'"); return eff(n === 1, `forward version inserted (${n})`); } },
  },
  // ai_queries, analytics_metric_triggers
  {
    guard: "trg_ai_gateway_usage_from_ai_queries", db: "audit", kind: "effect", seed: [],
    register: reg("ai_queries", "AFTER INSERT: each ai_queries row is mirrored once into ai_gateway_usage as id 'aq-<id>' with token totals", "Insert ai_queries id negtest-q1 with 10 prompt and 5 completion tokens; expect ai_gateway_usage id aq-negtest-q1 with total_tokens 15", "Mirroring is automatic"),
    cases: [{ sql: "INSERT INTO ai_queries (id, ts, model, strategy, complexity, prompt_tokens, completion_tokens, cost_usd, latency_ms) VALUES ('negtest-q1', '2026-10-05T18:00:00Z', '@cf/meta/llama-3.1-8b-instruct', 'direct', 'low', 10, 5, 0.0, 120)", effect: (db) => { const r = one(db, "SELECT total_tokens, caller FROM ai_gateway_usage WHERE id = 'aq-negtest-q1'"); return eff(r?.total_tokens === 15 && r?.caller === "qnfo-ai", r ? `ai_gateway_usage total_tokens=${r.total_tokens} caller=${r.caller}` : "no ai_gateway_usage row"); } }],
  },
  {
    guard: "trg_metric_trigger_cooldown_cap_ins", db: "audit", kind: "effect", seed: [],
    register: reg("analytics_metric_triggers", "AFTER INSERT: cooldown_hours above 24 is capped at 24 (CYCLE-TIME-1)", "Insert analytics_metric_triggers cooldown_hours = 168; expect 24 (12 stays 12)", "Choose a cooldown of at most 24h"),
    cases: [{ sql: "INSERT INTO analytics_metric_triggers (metric_key, cooldown_hours) VALUES ('negtest_metric', 168)", effect: (db) => { const h = val(db, "SELECT cooldown_hours FROM analytics_metric_triggers WHERE metric_key = 'negtest_metric'"); return eff(h === 24, `cooldown_hours=${h}`); } }],
    allowed: { sql: "INSERT INTO analytics_metric_triggers (metric_key, cooldown_hours) VALUES ('negtest_metric', 12)", check: (db) => { const h = val(db, "SELECT cooldown_hours FROM analytics_metric_triggers WHERE metric_key = 'negtest_metric'"); return eff(h === 12, `cooldown_hours=${h}`); } },
  },
  {
    guard: "trg_metric_trigger_cooldown_cap_upd", db: "audit", kind: "effect", seed: ["INSERT INTO analytics_metric_triggers (metric_key, cooldown_hours) VALUES ('negtest_metric', 24)"],
    register: reg("analytics_metric_triggers", "AFTER UPDATE OF cooldown_hours: a value above 24 is capped at 24 (CYCLE-TIME-1)", "Set analytics_metric_triggers cooldown_hours = 336; expect 24 (6 stays 6)", "Choose a cooldown of at most 24h"),
    cases: [{ sql: "UPDATE analytics_metric_triggers SET cooldown_hours = 336 WHERE metric_key = 'negtest_metric'", effect: (db) => { const h = val(db, "SELECT cooldown_hours FROM analytics_metric_triggers WHERE metric_key = 'negtest_metric'"); return eff(h === 24, `cooldown_hours=${h}`); } }],
    allowed: { sql: "UPDATE analytics_metric_triggers SET cooldown_hours = 6 WHERE metric_key = 'negtest_metric'", check: (db) => { const h = val(db, "SELECT cooldown_hours FROM analytics_metric_triggers WHERE metric_key = 'negtest_metric'"); return eff(h === 6, `cooldown_hours=${h}`); } },
  },
  // email_reply_queue
  {
    guard: "email_reply_queue_terminal_parent_guard", db: "audit", kind: "abort",
    seed: [
      "INSERT INTO emails (id, message_id, sender, recipient, subject, body_text, status) VALUES (401, '<negtest-tpg-1@example.org>', 'alice@example.org', 'owner@qnfo.org', 'Question', NULL, 'received'), (402, '<negtest-tpg-2@example.org>', 'bob@example.org', 'owner@qnfo.org', 'Question', 'a real question', 'received'), (403, '<negtest-tpg-3@example.org>', 'carol@example.org', 'owner@qnfo.org', 'Note', 'thanks', 'received')",
      "INSERT INTO email_reply_queue (email_id, sender, subject, human_score) VALUES (401, 'alice@example.org', 'Question', 0), (402, 'bob@example.org', 'Question', 3), (403, 'carol@example.org', 'Note', 0)",
    ],
    register: reg("email_reply_queue", "BEFORE UPDATE OF decision to closed/skip with skip_reason terminal-parent%: refused when the parent email has no body, has an unresolved parse failure, or is a human message (human_score >= 2, not spam) with no outbound answer", "Close a queue row with skip_reason 'terminal-parent: auto' whose parent has an empty body, and one whose parent is a human message with no reply; expect ABORT EMAIL-REPLY-TERMINAL-PARENT-GUARD-1", "Escalate to the owner instead of closing"),
    state: "SELECT id, decision, skip_reason FROM email_reply_queue ORDER BY id",
    cases: [
      "UPDATE email_reply_queue SET decision = 'closed', skip_reason = 'terminal-parent: auto' WHERE email_id = 401",
      "UPDATE email_reply_queue SET decision = 'skip', skip_reason = 'terminal-parent: auto' WHERE email_id = 402",
    ],
    allowed: { sql: "UPDATE email_reply_queue SET decision = 'closed', skip_reason = 'terminal-parent: auto' WHERE email_id = 403", check: (db) => { const d = val(db, "SELECT decision FROM email_reply_queue WHERE email_id = 403"); return eff(d === "closed", `parsed non-human parent closed: decision=${d}`); } },
  },
  // fleet_crons
  {
    guard: "trg_cron_fire_log", db: "audit", kind: "effect", seed: CRON_SEED(LIVE_SCHED),
    register: reg("fleet_crons", "AFTER UPDATE OF last_fired to a new value: one cron_fire_log row (outcome fired, source trigger:fleet_crons) is written", "Set fleet_crons last_fired = '2026-10-05T18:00:00Z'; expect one cron_fire_log row for that cron with outcome fired (changing next_fire alone writes none)", "The fire log is written by the database; do not write it from worker code"),
    cases: [{ sql: "UPDATE fleet_crons SET last_fired = '2026-10-05T18:00:00Z' WHERE name = 'negtest-cron'", effect: (db) => { const n = count(db, "SELECT COUNT(*) FROM cron_fire_log WHERE cron_name = 'negtest-cron' AND outcome = 'fired' AND fired_at = '2026-10-05T18:00:00Z' AND source = 'trigger:fleet_crons'"); return eff(n === 1, `cron_fire_log rows=${n}`); } }],
    allowed: { sql: "UPDATE fleet_crons SET next_fire = '2026-10-05T20:00:00Z' WHERE name = 'negtest-cron'", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM cron_fire_log"); return eff(n === 0, `next_fire change: cron_fire_log rows=${n}`); } },
  },
  {
    guard: "fleet_crons_task_ref_upd", db: "audit", kind: "abort", seed: CRON_SEED(LIVE_SCHED),
    register: reg("fleet_crons", "BEFORE UPDATE OF task_id: the task_id must exist in fleet_tasks, else ABORT CRON-TASK-REFERENTIAL-INTEGRITY-1", "Set fleet_crons task_id to a value with no fleet_tasks row; expect ABORT CRON-TASK-REFERENTIAL-INTEGRITY-1", "Create the fleet_tasks row first"),
    state: "SELECT name, task_id FROM fleet_crons ORDER BY name",
    cases: ["UPDATE fleet_crons SET task_id = 'negtest-missing' WHERE name = 'negtest-cron'"],
    allowed: { sql: "UPDATE fleet_crons SET task_id = 'negtest-task-2' WHERE name = 'negtest-cron'", check: (db) => { const t = val(db, "SELECT task_id FROM fleet_crons WHERE name = 'negtest-cron'"); return eff(t === "negtest-task-2", `task_id=${t}`); } },
  },
  {
    guard: "fleet_crons_task_ref_ins", db: "audit", kind: "abort", seed: CRON_SEED(LIVE_SCHED),
    register: reg("fleet_crons", "BEFORE INSERT: the task_id must exist in fleet_tasks, else ABORT CRON-TASK-REFERENTIAL-INTEGRITY-1", "Insert fleet_crons with a task_id that has no fleet_tasks row; expect ABORT CRON-TASK-REFERENTIAL-INTEGRITY-1", "Create the fleet_tasks row first"),
    state: "SELECT name, task_id FROM fleet_crons ORDER BY name",
    cases: ["INSERT INTO fleet_crons (name, cron_expr, task_id) VALUES ('negtest-cron-2', '0 * * * *', 'negtest-missing')"],
    allowed: { sql: "INSERT INTO fleet_crons (name, cron_expr, task_id) VALUES ('negtest-cron-2', '0 * * * *', 'negtest-task')", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM fleet_crons WHERE name = 'negtest-cron-2'"); return eff(n === 1, `cron with an existing task inserted (${n})`); } },
  },
  {
    guard: "fleet_crons_next_fire_canonical_upd", db: "audit", kind: "abort", seed: CRON_SEED(LIVE_SCHED),
    register: reg("fleet_crons", "BEFORE UPDATE OF next_fire: next_fire must be ISO-8601 with a literal T (YYYY-MM-DDTHH:MM:SS...), else ABORT CRON-TIMESTAMP-CANONICAL-1", "Set fleet_crons next_fire = '2026-10-05 19:00:00'; expect ABORT CRON-TIMESTAMP-CANONICAL-1", "Write next_fire with a T separator"),
    state: "SELECT name, next_fire FROM fleet_crons ORDER BY name",
    cases: ["UPDATE fleet_crons SET next_fire = '2026-10-05 19:00:00' WHERE name = 'negtest-cron'"],
    allowed: { sql: "UPDATE fleet_crons SET next_fire = '2026-10-05T20:00:00Z' WHERE name = 'negtest-cron'", check: (db) => { const t = val(db, "SELECT next_fire FROM fleet_crons WHERE name = 'negtest-cron'"); return eff(t === "2026-10-05T20:00:00Z", `next_fire=${t}`); } },
  },
  {
    guard: "fleet_crons_next_fire_canonical_ins", db: "audit", kind: "abort", seed: CRON_SEED(LIVE_SCHED),
    register: reg("fleet_crons", "BEFORE INSERT: next_fire must be ISO-8601 with a literal T, else ABORT CRON-TIMESTAMP-CANONICAL-1", "Insert fleet_crons next_fire = '2026-10-05 19:00:00'; expect ABORT CRON-TIMESTAMP-CANONICAL-1", "Write next_fire with a T separator"),
    state: "SELECT name, next_fire FROM fleet_crons ORDER BY name",
    cases: ["INSERT INTO fleet_crons (name, cron_expr, task_id, next_fire) VALUES ('negtest-cron-3', '0 * * * *', 'negtest-task', '2026-10-05 19:00:00')"],
    allowed: { sql: "INSERT INTO fleet_crons (name, cron_expr, task_id, next_fire) VALUES ('negtest-cron-3', '0 * * * *', 'negtest-task', '2026-10-05T19:00:00Z')", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM fleet_crons WHERE name = 'negtest-cron-3'"); return eff(n === 1, `ISO next_fire inserted (${n})`); } },
  },
  {
    guard: "fleet_crons_minute_achievable_ins", db: "audit", kind: "abort", seed: CRON_SEED(HOURLY_SCHED),
    register: reg("fleet_crons", "BEFORE INSERT: a non-zero minute field is refused while worker_schedules shows no sub-hourly fleet-exec tick, else ABORT CRON-MINUTE-UNACHIEVABLE-1v2", "With the fleet-exec schedule mirror at ['0 * * * *'], insert fleet_crons cron_expr '15 * * * *'; expect ABORT CRON-MINUTE-UNACHIEVABLE-1v2 (accepted with the live mirror ['*/10 * * * *'])", "Refresh the CF schedule mirror, or declare minute 0"),
    state: "SELECT name, cron_expr FROM fleet_crons ORDER BY name",
    cases: ["INSERT INTO fleet_crons (name, cron_expr, task_id) VALUES ('negtest-cron-4', '15 * * * *', 'negtest-task')"],
    allowed: { seed: CRON_SEED(LIVE_SCHED), sql: "INSERT INTO fleet_crons (name, cron_expr, task_id) VALUES ('negtest-cron-4', '15 * * * *', 'negtest-task')", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM fleet_crons WHERE name = 'negtest-cron-4'"); return eff(n === 1, `sub-hourly mirror: minute-15 cron inserted (${n})`); } },
  },
  {
    guard: "fleet_crons_minute_achievable_upd", db: "audit", kind: "abort", seed: CRON_SEED(HOURLY_SCHED),
    register: reg("fleet_crons", "BEFORE UPDATE OF cron_expr: a non-zero minute field is refused while worker_schedules shows no sub-hourly fleet-exec tick, else ABORT CRON-MINUTE-UNACHIEVABLE-1v2", "With the fleet-exec schedule mirror at ['0 * * * *'], set fleet_crons cron_expr = '15 * * * *'; expect ABORT CRON-MINUTE-UNACHIEVABLE-1v2 (accepted with the live mirror ['*/10 * * * *'])", "Refresh the CF schedule mirror, or declare minute 0"),
    state: "SELECT name, cron_expr FROM fleet_crons ORDER BY name",
    cases: ["UPDATE fleet_crons SET cron_expr = '15 * * * *' WHERE name = 'negtest-cron'"],
    allowed: { seed: CRON_SEED(LIVE_SCHED), sql: "UPDATE fleet_crons SET cron_expr = '15 * * * *' WHERE name = 'negtest-cron'", check: (db) => { const c = val(db, "SELECT cron_expr FROM fleet_crons WHERE name = 'negtest-cron'"); return eff(c === "15 * * * *", `sub-hourly mirror: cron_expr=${c}`); } },
  },
  // fleet_issue_loop, fleet_tasks
  {
    guard: "fleet_issue_loop_state_guard", db: "audit", kind: "abort",
    seed: ["INSERT INTO fleet_issue_loop (fingerprint, dispatch_state, closed_at) VALUES ('negtest-fp-closed', 'closed', '2026-10-05T10:00:00Z'), ('negtest-fp-open', 'new', NULL)"],
    register: reg("fleet_issue_loop", "BEFORE UPDATE OF dispatch_state: a fingerprint with closed_at set can only have dispatch_state closed, else ABORT closed-fingerprint-cannot-be-dispatched", "Set dispatch_state = 'queued' on a fleet_issue_loop row with closed_at set; expect ABORT closed-fingerprint-cannot-be-dispatched", "Reopen the fingerprint (clear closed_at) before dispatching it"),
    state: "SELECT fingerprint, dispatch_state FROM fleet_issue_loop ORDER BY fingerprint",
    cases: ["UPDATE fleet_issue_loop SET dispatch_state = 'queued' WHERE fingerprint = 'negtest-fp-closed'"],
    allowed: { sql: "UPDATE fleet_issue_loop SET dispatch_state = 'queued' WHERE fingerprint = 'negtest-fp-open'", check: (db) => { const s = val(db, "SELECT dispatch_state FROM fleet_issue_loop WHERE fingerprint = 'negtest-fp-open'"); return eff(s === "queued", `open fingerprint dispatch_state=${s}`); } },
  },
  {
    guard: "reconcile_dispatch_on_clear", db: "audit", kind: "effect",
    seed: ["INSERT INTO fleet_issue_loop (fingerprint, gh_state) VALUES ('negtest-fp', 'open')", "INSERT INTO fleet_issue_dispatch (fingerprint, state, exec_state) VALUES ('negtest-fp', 'queued', 'needs-human')"],
    register: reg("fleet_issue_loop", "AFTER UPDATE OF gh_state to cleared: the fingerprint's queued needs-human fleet_issue_dispatch row is closed (exec_state cleared, STALE-DISP-RECONCILE-1)", "Set fleet_issue_loop gh_state = 'cleared' for a fingerprint with a queued needs-human dispatch; expect the dispatch state closed and exec_state cleared", "Reconciliation is automatic"),
    cases: [{ sql: "UPDATE fleet_issue_loop SET gh_state = 'cleared' WHERE fingerprint = 'negtest-fp'", effect: (db) => { const r = one(db, "SELECT state, exec_state FROM fleet_issue_dispatch WHERE fingerprint = 'negtest-fp'"); return eff(r?.state === "closed" && r?.exec_state === "cleared", `dispatch state=${r?.state} exec_state=${r?.exec_state}`); } }],
    allowed: { sql: "UPDATE fleet_issue_loop SET gh_state = 'stale' WHERE fingerprint = 'negtest-fp'", check: (db) => { const s = val(db, "SELECT state FROM fleet_issue_dispatch WHERE fingerprint = 'negtest-fp'"); return eff(s === "queued", `gh_state stale: dispatch state=${s}`); } },
  },
  {
    guard: "fleet_tasks_updated_at_default_ins", db: "audit", kind: "effect", seed: [],
    register: reg("fleet_tasks", "AFTER INSERT with updated_at NULL: updated_at is set to now as ISO YYYY-MM-DDTHH:MM:SS.sssZ", "Insert fleet_tasks without updated_at; expect an ISO updated_at", "None needed; writers may omit updated_at"),
    cases: [{ sql: "INSERT INTO fleet_tasks (id, name, type, definition) VALUES ('negtest-task', 'negtest', 'http', '{}')", effect: (db) => { const t = val(db, "SELECT updated_at FROM fleet_tasks WHERE id = 'negtest-task'"); return eff(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(t || ""), `updated_at=${t}`); } }],
    allowed: { sql: "INSERT INTO fleet_tasks (id, name, type, definition, updated_at) VALUES ('negtest-task', 'negtest', 'http', '{}', '2026-10-05T18:00:00.000Z')", check: (db) => { const t = val(db, "SELECT updated_at FROM fleet_tasks WHERE id = 'negtest-task'"); return eff(t === "2026-10-05T18:00:00.000Z", `explicit updated_at kept: ${t}`); } },
  },
  {
    guard: "fleet_tasks_updated_at_norm_epochms_upd", db: "audit", kind: "effect", seed: ["INSERT INTO fleet_tasks (id, name, type, definition, updated_at) VALUES ('negtest-task', 'negtest', 'http', '{}', '2026-10-05T18:00:00.000Z')"],
    register: reg("fleet_tasks", "AFTER UPDATE: an all-digit updated_at of 10 to 13 characters (epoch ms) is rewritten to ISO YYYY-MM-DDTHH:MM:SS.sssZ", "Set fleet_tasks updated_at = '1791223200000'; expect the ISO form of that instant", "Write ISO timestamps"),
    cases: [{ sql: "UPDATE fleet_tasks SET updated_at = '1791223200000' WHERE id = 'negtest-task'", effect: tsEff("SELECT updated_at FROM fleet_tasks WHERE id = 'negtest-task'", "strftime('%Y-%m-%dT%H:%M:%fZ', 1791223200000 / 1000.0, 'unixepoch')", "updated_at") }],
  },
  // human_actions, intents
  {
    guard: "human_actions_no_claude_ins", db: "audit", kind: "abort", seed: [],
    register: reg("human_actions", "BEFORE INSERT: an owner queue card may not route work to Claude or link claude.ai / anthropic.com, else ABORT NO-CLAUDE-RUNTIME-DEPENDENCY-1", "Insert a human_actions card whose action says 'Ask Claude to merge the pull request', and one whose url is on anthropic.com; expect ABORT NO-CLAUDE-RUNTIME-DEPENDENCY-1", "Describe what the owner does on fleet.qnfo.org or on the site itself"),
    state: "SELECT slug, action, url FROM human_actions ORDER BY slug",
    cases: [
      "INSERT INTO human_actions (slug, title, action) VALUES ('negtest-card-1', 'Approve the release', 'Ask Claude to merge the pull request')",
      "INSERT INTO human_actions (slug, title, url) VALUES ('negtest-card-2', 'Read the report', 'https://www.anthropic.com/negtest')",
    ],
    allowed: { sql: "INSERT INTO human_actions (slug, title, action) VALUES ('negtest-card-3', 'Approve the release', 'Open fleet.qnfo.org and approve the card')", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM human_actions WHERE slug = 'negtest-card-3'"); return eff(n === 1, `fleet-routed card inserted (${n})`); } },
  },
  {
    guard: "human_actions_no_claude_upd", db: "audit", kind: "abort", seed: ["INSERT INTO human_actions (slug, title, action) VALUES ('negtest-card', 'Approve the release', 'Approve on fleet.qnfo.org')"],
    register: reg("human_actions", "BEFORE UPDATE OF action, why, default_in_effect, title, url: the same no-Claude rule as on insert", "Set a human_actions card's action = 'Hand this to Claude'; expect ABORT NO-CLAUDE-RUNTIME-DEPENDENCY-1", "Describe what the owner does on fleet.qnfo.org or on the site itself"),
    state: "SELECT slug, action FROM human_actions ORDER BY slug",
    cases: ["UPDATE human_actions SET action = 'Hand this to Claude' WHERE slug = 'negtest-card'"],
    allowed: { sql: "UPDATE human_actions SET action = 'Approve on fleet.qnfo.org today' WHERE slug = 'negtest-card'", check: (db) => { const a = val(db, "SELECT action FROM human_actions WHERE slug = 'negtest-card'"); return eff(a === "Approve on fleet.qnfo.org today", `action=${a}`); } },
  },
  {
    guard: "intents_research_type_norm_ins", db: "audit", kind: "effect", seed: [],
    register: reg("intents", "AFTER INSERT: an intent with domain research and type NULL or unknown gets type research", "Insert intents domain 'research' type NULL (and type 'unknown'); expect type 'research' (domain 'personal' stays NULL)", "Set type explicitly when it is not research"),
    cases: [
      { sql: "INSERT INTO intents (id, domain, type) VALUES ('negtest-intent-1', 'research', NULL)", effect: (db) => { const t = val(db, "SELECT type FROM intents WHERE id = 'negtest-intent-1'"); return eff(t === "research", `type=${t}`); } },
      { sql: "INSERT INTO intents (id, domain, type) VALUES ('negtest-intent-3', 'research', 'unknown')", effect: (db) => { const t = val(db, "SELECT type FROM intents WHERE id = 'negtest-intent-3'"); return eff(t === "research", `type=${t}`); } },
    ],
    allowed: { sql: "INSERT INTO intents (id, domain, type) VALUES ('negtest-intent-4', 'personal', NULL)", check: (db) => { const t = val(db, "SELECT type FROM intents WHERE id = 'negtest-intent-4'"); return eff(t == null, `personal intent type=${t}`); } },
  },
  {
    guard: "intents_research_type_norm_upd", db: "audit", kind: "effect", seed: ["INSERT INTO intents (id, domain, type) VALUES ('negtest-intent-2', 'personal', 'unknown')"],
    register: reg("intents", "AFTER UPDATE OF type, domain: an intent with domain research and type NULL or unknown gets type research", "Set intents domain = 'research' on a row with type 'unknown'; expect type 'research'", "Set type explicitly when it is not research"),
    cases: [{ sql: "UPDATE intents SET domain = 'research' WHERE id = 'negtest-intent-2'", effect: (db) => { const t = val(db, "SELECT type FROM intents WHERE id = 'negtest-intent-2'"); return eff(t === "research", `type=${t}`); } }],
    allowed: { sql: "UPDATE intents SET domain = 'ops' WHERE id = 'negtest-intent-2'", check: (db) => { const t = val(db, "SELECT type FROM intents WHERE id = 'negtest-intent-2'"); return eff(t === "unknown", `ops intent type=${t}`); } },
  },
  // issue_triage
  {
    guard: "triage_close_sync_issue_upd", db: "audit", kind: "effect", seed: [...CANON, ISSUE(601, "NEGTEST-TC-1: probe"), TRIAGE(601, "triaged")],
    register: reg("issue_triage", "AFTER UPDATE OF triage_state to closed, closed-refuted or wontfix: the open agent_issues row is set closed (or wontfix)", "Set issue_triage triage_state = 'closed' for an open issue with close_evidence; expect agent_issues status 'closed' (in_progress leaves it open)", "Close through issue_triage with close_evidence"),
    cases: [{ sql: "UPDATE issue_triage SET triage_state = 'closed' WHERE issue_id = 601", effect: (db) => { const s = val(db, "SELECT status FROM agent_issues WHERE id = 601"); return eff(s === "closed", `issue status=${s}`); } }],
    allowed: { sql: "UPDATE issue_triage SET triage_state = 'in_progress' WHERE issue_id = 601", check: (db) => { const s = val(db, "SELECT status FROM agent_issues WHERE id = 601"); return eff(s === "open", `in_progress: issue status=${s}`); } },
  },
  {
    guard: "triage_close_sync_issue_ins", db: "audit", kind: "effect", seed: [...CANON, ISSUE(602, "NEGTEST-TC-2: probe"), ISSUE(603, "NEGTEST-TC-3: probe")],
    register: reg("issue_triage", "AFTER INSERT with triage_state closed, closed-refuted or wontfix: the open agent_issues row is set closed (or wontfix)", "Insert issue_triage triage_state 'closed' (and 'wontfix') with close_evidence for open issues; expect agent_issues status 'closed' (and 'wontfix')", "Close through issue_triage with close_evidence"),
    cases: [
      { sql: TRIAGE(602, "closed"), effect: (db) => { const s = val(db, "SELECT status FROM agent_issues WHERE id = 602"); return eff(s === "closed", `issue status=${s}`); } },
      { sql: TRIAGE(603, "wontfix"), effect: (db) => { const s = val(db, "SELECT status FROM agent_issues WHERE id = 603"); return eff(s === "wontfix", `wontfix issue status=${s}`); } },
    ],
  },
  {
    guard: "triage_close_sync_resolved_ins", db: "audit", kind: "effect", seed: [...CANON, ISSUE(604, "NEGTEST-TC-4: probe")],
    register: reg("issue_triage", "AFTER INSERT with triage_state resolved or resolved-refuted: the open agent_issues row is closed with close_channel auto:triage-resolved-sync", "Insert issue_triage triage_state 'resolved' with close_evidence for an open issue; expect status 'closed' and close_channel 'auto:triage-resolved-sync'", "Close through issue_triage with close_evidence"),
    cases: [{ sql: TRIAGE(604, "resolved"), effect: (db) => { const r = one(db, "SELECT status, close_channel FROM agent_issues WHERE id = 604"); return eff(r?.status === "closed" && r?.close_channel === "auto:triage-resolved-sync", `status=${r?.status} close_channel=${r?.close_channel}`); } }],
  },
  {
    guard: "triage_close_sync_resolved_upd", db: "audit", kind: "effect", seed: [...CANON, ISSUE(605, "NEGTEST-TC-5: probe"), TRIAGE(605, "triaged")],
    register: reg("issue_triage", "AFTER UPDATE OF triage_state to resolved or resolved-refuted: the open agent_issues row is closed with close_channel auto:triage-resolved-sync", "Set issue_triage triage_state = 'resolved' for an open issue with close_evidence; expect status 'closed' and close_channel 'auto:triage-resolved-sync'", "Close through issue_triage with close_evidence"),
    cases: [{ sql: "UPDATE issue_triage SET triage_state = 'resolved' WHERE issue_id = 605", effect: (db) => { const r = one(db, "SELECT status, close_channel FROM agent_issues WHERE id = 605"); return eff(r?.status === "closed" && r?.close_channel === "auto:triage-resolved-sync", `status=${r?.status} close_channel=${r?.close_channel}`); } }],
  },
  {
    guard: "issue_close_evidence_weak_predicate_ins", db: "audit", kind: "abort", seed: [...CANON, ISSUE(606, "NEGTEST-TC-6: probe")],
    register: reg("issue_triage", "BEFORE INSERT: close_evidence that only says a file is 'present in' a 'directory listing' is refused, ABORT CLOSE-EVIDENCE-WEAK-PREDICATE-1", "Insert issue_triage close_evidence 'worker.js present in the directory listing'; expect ABORT CLOSE-EVIDENCE-WEAK-PREDICATE-1", "Close with a live measurement, not file presence"),
    state: "SELECT issue_id, close_evidence FROM issue_triage ORDER BY issue_id",
    cases: [TRIAGE(606, "triaged", "worker.js present in the directory listing")],
    allowed: { sql: TRIAGE(606, "triaged", "GET /health returned 200 with VERSION 1.2.3"), check: (db) => { const n = count(db, "SELECT COUNT(*) FROM issue_triage WHERE issue_id = 606"); return eff(n === 1, `measured evidence inserted (${n})`); } },
  },
  {
    guard: "issue_close_evidence_weak_predicate_upd", db: "audit", kind: "abort", seed: [...CANON, ISSUE(607, "NEGTEST-TC-7: probe"), TRIAGE(607, "triaged", null)],
    register: reg("issue_triage", "BEFORE UPDATE OF close_evidence: the same file-presence evidence is refused, ABORT CLOSE-EVIDENCE-WEAK-PREDICATE-1", "Set issue_triage close_evidence = 'file present in directory listing'; expect ABORT CLOSE-EVIDENCE-WEAK-PREDICATE-1", "Close with a live measurement, not file presence"),
    state: "SELECT issue_id, close_evidence FROM issue_triage ORDER BY issue_id",
    cases: ["UPDATE issue_triage SET close_evidence = 'file present in directory listing' WHERE issue_id = 607"],
    allowed: { sql: "UPDATE issue_triage SET close_evidence = 'GET /health returned 200 with VERSION 1.2.3' WHERE issue_id = 607", check: (db) => { const e = val(db, "SELECT close_evidence FROM issue_triage WHERE issue_id = 607"); return eff(e === "GET /health returned 200 with VERSION 1.2.3", `close_evidence=${abbr(e, 40)}`); } },
  },
  // metric_registry
  {
    guard: "metric_registry_source_required_ins", db: "audit", kind: "abort", seed: [],
    register: reg("metric_registry", "BEFORE INSERT: source_of_truth, disposition_actor and refresh_cadence are mandatory, else ABORT METRIC-INTEGRITY-1", "Insert metric_registry without source_of_truth, and without disposition_actor; expect ABORT METRIC-INTEGRITY-1", "Name the source table, the acting worker and the cadence"),
    state: "SELECT metric FROM metric_registry ORDER BY metric",
    cases: [METRIC({ source: null }), METRIC({ metric: "negtest_metric_2", actor: null })],
    allowed: { sql: METRIC({}), check: (db) => { const n = count(db, "SELECT COUNT(*) FROM metric_registry"); return eff(n === 1, `complete metric inserted (${n})`); } },
  },
  {
    guard: "metric_registry_cadence_canonical_ins", db: "audit", kind: "abort", seed: [],
    register: reg("metric_registry", "BEFORE INSERT: refresh_cadence must be a whitespace-free canonical token (*/N, Nm, Nh, hourly, daily, weekly, monthly), else ABORT METRIC-CADENCE-CANONICAL-1", "Insert metric_registry refresh_cadence '0 * * * *' and 'every hour'; expect ABORT METRIC-CADENCE-CANONICAL-1 ('*/15' is accepted)", "Use a canonical cadence token"),
    state: "SELECT metric FROM metric_registry ORDER BY metric",
    cases: [METRIC({ cadence: "0 * * * *" }), METRIC({ metric: "negtest_metric_2", cadence: "every hour" })],
    allowed: { sql: METRIC({ cadence: "*/15" }), check: (db) => { const c = val(db, "SELECT refresh_cadence FROM metric_registry"); return eff(c === "*/15", `refresh_cadence=${c}`); } },
  },
  {
    guard: "metric_registry_cadence_canonical_upd", db: "audit", kind: "abort", seed: [METRIC({})],
    register: reg("metric_registry", "BEFORE UPDATE: the row's refresh_cadence must be a canonical token, else ABORT METRIC-CADENCE-CANONICAL-1", "Set metric_registry refresh_cadence = 'every 2 hours'; expect ABORT METRIC-CADENCE-CANONICAL-1 ('daily' is accepted)", "Use a canonical cadence token"),
    state: "SELECT metric, refresh_cadence FROM metric_registry ORDER BY metric",
    cases: ["UPDATE metric_registry SET refresh_cadence = 'every 2 hours' WHERE metric = 'negtest_metric'"],
    allowed: { sql: "UPDATE metric_registry SET refresh_cadence = 'daily' WHERE metric = 'negtest_metric'", check: (db) => { const c = val(db, "SELECT refresh_cadence FROM metric_registry"); return eff(c === "daily", `refresh_cadence=${c}`); } },
  },
  {
    guard: "metric_staleness_breach_rec", db: "audit", kind: "effect", seed: [METRIC({ last: "2026-10-05T10:00:00Z" })],
    register: reg("metric_registry", "AFTER UPDATE OF last_refreshed: a gap longer than 1.5x the cadence writes a metric_staleness_breaches row with gap and cadence hours", "On an hourly metric, move last_refreshed from 10:00 to 13:00; expect one metric_staleness_breaches row gap_hours 3.0 cadence_hours 1.0 (a 1h step writes none)", "Breaches are evidence for the freshness loop; fix the refresher"),
    cases: [{ sql: "UPDATE metric_registry SET last_refreshed = '2026-10-05T13:00:00Z' WHERE metric = 'negtest_metric'", effect: (db) => { const r = one(db, "SELECT COUNT(*) AS n, MAX(gap_hours) AS gap, MAX(cadence_hours) AS cad FROM metric_staleness_breaches WHERE metric = 'negtest_metric'"); return eff(r.n === 1 && r.gap === 3 && r.cad === 1, `breaches=${r.n} gap_hours=${r.gap} cadence_hours=${r.cad}`); } }],
    allowed: { sql: "UPDATE metric_registry SET last_refreshed = '2026-10-05T11:00:00Z' WHERE metric = 'negtest_metric'", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM metric_staleness_breaches"); return eff(n === 0, `1h step: breaches=${n}`); } },
  },
  // remediation_verifications
  {
    guard: "remediation_verification_transport_guard_ins", db: "audit", kind: "abort", seed: RV_SEED,
    register: reg("remediation_verifications", "BEFORE INSERT with pass=1: the transport must be trusted in transport_trust, else ABORT unclassified-or-untrusted-verification-transport", "Insert remediation_verifications pass=1 transport 'self' (trusted 0); expect ABORT unclassified-or-untrusted-verification-transport", "Verify through a trusted, independent transport"),
    state: "SELECT id, transport, pass FROM remediation_verifications ORDER BY id",
    cases: [RV(9999, "self", "0", "0", 1)],
    allowed: { sql: RV(9999, "d1-query", "0", "0", 1), check: (db) => { const n = count(db, "SELECT COUNT(*) FROM remediation_verifications WHERE pass = 1"); return eff(n === 1, `trusted transport pass row inserted (${n})`); } },
  },
  {
    guard: "remediation_verification_transport_guard_upd", db: "audit", kind: "abort", seed: [...RV_SEED, RV(9999, "self", "0", "0", 0)],
    register: reg("remediation_verifications", "BEFORE UPDATE OF pass, transport: pass=1 needs a trusted transport, else ABORT unclassified-or-untrusted-verification-transport", "Set pass = 1 on a remediation_verifications row whose transport is 'self'; expect ABORT unclassified-or-untrusted-verification-transport", "Verify through a trusted, independent transport"),
    state: "SELECT id, transport, pass FROM remediation_verifications ORDER BY id",
    cases: ["UPDATE remediation_verifications SET pass = 1 WHERE issue_id = 9999"],
    allowed: { sql: "UPDATE remediation_verifications SET transport = 'd1-query', pass = 1 WHERE issue_id = 9999", check: (db) => { const p = val(db, "SELECT pass FROM remediation_verifications WHERE issue_id = 9999"); return eff(p === 1, `trusted transport: pass=${p}`); } },
  },
  {
    guard: "remediation_verification_autoclose_upd", db: "audit", kind: "effect", seed: [...RV_SEED, ISSUE(701, "NEGTEST-RV-1: probe"), RV(701, "d1-query", "0", "0", 0)],
    register: reg("remediation_verifications", "AFTER UPDATE OF pass to 1: the open issue gets an issue_triage closed row with close_evidence remediation_verifications#<id> and is closed", "Set pass = 1 on a verification for an open issue; expect the issue closed and issue_triage close_evidence 'remediation_verifications#...'", "Closure follows the verification; do not close by hand"),
    cases: [{ sql: "UPDATE remediation_verifications SET pass = 1 WHERE issue_id = 701", effect: (db) => { const s = val(db, "SELECT status FROM agent_issues WHERE id = 701"); const e = val(db, "SELECT close_evidence FROM issue_triage WHERE issue_id = 701"); return eff(s === "closed" && /^remediation_verifications#\d+ pass=1/.test(e || ""), `issue status=${s}, close_evidence=${abbr(e, 40)}`); } }],
  },
  {
    guard: "remediation_verification_autoclose_ins", db: "audit", kind: "effect", seed: [...RV_SEED, ISSUE(702, "NEGTEST-RV-2: probe")],
    register: reg("remediation_verifications", "AFTER INSERT with pass=1: the open issue gets an issue_triage closed row with close_evidence remediation_verifications#<id> and is closed", "Insert a pass=1 verification for an open issue; expect the issue closed and issue_triage close_evidence 'remediation_verifications#...' (pass=0 leaves it open)", "Closure follows the verification; do not close by hand"),
    cases: [{ sql: RV(702, "d1-query", "0", "0", 1), effect: (db) => { const s = val(db, "SELECT status FROM agent_issues WHERE id = 702"); const e = val(db, "SELECT close_evidence FROM issue_triage WHERE issue_id = 702"); return eff(s === "closed" && /^remediation_verifications#\d+ pass=1/.test(e || ""), `issue status=${s}, close_evidence=${abbr(e, 40)}`); } }],
    allowed: { sql: RV(702, "d1-query", "0", "1", 0), check: (db) => { const s = val(db, "SELECT status FROM agent_issues WHERE id = 702"); return eff(s === "open", `pass=0: issue status=${s}`); } },
  },
  {
    guard: "remediation_verification_evidence_guard_ins", db: "audit", kind: "abort", seed: RV_SEED,
    register: reg("remediation_verifications", "BEFORE INSERT with pass=1: expected and observed must both be non-empty, else ABORT VACUOUS-VERIFICATION-EVIDENCE-1", "Insert remediation_verifications pass=1 with expected '' and, separately, observed NULL; expect ABORT VACUOUS-VERIFICATION-EVIDENCE-1", "Record what was expected and what was observed"),
    state: "SELECT id, expected, observed FROM remediation_verifications ORDER BY id",
    cases: [RV(9999, "d1-query", "", "0", 1), RV(9999, "d1-query", "0", null, 1)],
    allowed: { sql: RV(9999, "d1-query", "0", "0", 1), check: (db) => { const n = count(db, "SELECT COUNT(*) FROM remediation_verifications"); return eff(n === 1, `verification with evidence inserted (${n})`); } },
  },
  {
    guard: "remediation_verification_evidence_guard_upd", db: "audit", kind: "abort", seed: [...RV_SEED, RV(9999, "d1-query", "", "", 0)],
    register: reg("remediation_verifications", "BEFORE UPDATE OF pass, expected, observed: pass=1 needs non-empty expected and observed, else ABORT VACUOUS-VERIFICATION-EVIDENCE-1", "Set pass = 1 on a verification whose expected and observed are empty; expect ABORT VACUOUS-VERIFICATION-EVIDENCE-1", "Record what was expected and what was observed"),
    state: "SELECT id, expected, observed, pass FROM remediation_verifications ORDER BY id",
    cases: ["UPDATE remediation_verifications SET pass = 1 WHERE issue_id = 9999"],
    allowed: { sql: "UPDATE remediation_verifications SET expected = '0', observed = '0', pass = 1 WHERE issue_id = 9999", check: (db) => { const p = val(db, "SELECT pass FROM remediation_verifications WHERE issue_id = 9999"); return eff(p === 1, `with evidence: pass=${p}`); } },
  },
  // self_heal_actions, tool_error_triage
  {
    guard: "self_heal_dedupe_recurring_ins", db: "audit", kind: "effect", seed: ["INSERT INTO self_heal_actions (kind, ref, action, status) VALUES ('node-budget', 'qnfo-ai', 'throttle', 'detected')"],
    register: reg("self_heal_actions", "BEFORE INSERT: a node-budget action that duplicates an open (detected or dispatched) one for the same ref and action is silently dropped (RAISE IGNORE)", "Insert a node-budget self_heal_actions row equal to an open one; expect the statement to succeed and still one row (a different ref is inserted)", "None needed; duplicates are dropped by design"),
    cases: [{ sql: "INSERT INTO self_heal_actions (kind, ref, action, status) VALUES ('node-budget', 'qnfo-ai', 'throttle', 'detected')", effect: (db) => { const n = count(db, "SELECT COUNT(*) FROM self_heal_actions WHERE ref = 'qnfo-ai'"); return eff(n === 1, `rows for the duplicated action=${n}`); } }],
    allowed: { sql: "INSERT INTO self_heal_actions (kind, ref, action, status) VALUES ('node-budget', 'qnfo-ops', 'throttle', 'detected')", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM self_heal_actions WHERE ref = 'qnfo-ops'"); return eff(n === 1, `different ref inserted (${n})`); } },
  },
  {
    guard: "tool_error_triage_secret_guard_upd", db: "audit", kind: "effect", seed: ["INSERT INTO tool_error_triage (event_id, tool, err_class, err_head) VALUES ('negtest-t1', 'web_fetch', 'x', 'timeout')"],
    register: reg("tool_error_triage", "AFTER UPDATE OF err_head: an err_head containing a credential prefix is cut at the prefix and marked [REDACTED-...]", "Set tool_error_triage err_head = 'auth failed github_pat_NEGTESTFAKE'; expect 'auth failed [REDACTED-GH-PAT]'", "Never log credentials; the scrub is a backstop"),
    cases: [{ sql: "UPDATE tool_error_triage SET err_head = 'auth failed github_pat_NEGTESTFAKE' WHERE event_id = 'negtest-t1'", effect: (db) => { const h = val(db, "SELECT err_head FROM tool_error_triage WHERE event_id = 'negtest-t1'"); return eff(h === "auth failed [REDACTED-GH-PAT]", `err_head=${h}`); } }],
    allowed: { sql: "UPDATE tool_error_triage SET err_head = 'timeout after 30s' WHERE event_id = 'negtest-t1'", check: (db) => { const h = val(db, "SELECT err_head FROM tool_error_triage WHERE event_id = 'negtest-t1'"); return eff(h === "timeout after 30s", `clean err_head kept: ${h}`); } },
  },
  {
    guard: "tool_error_triage_secret_guard_ins", db: "audit", kind: "effect", seed: [],
    register: reg("tool_error_triage", "AFTER INSERT: an err_head containing a credential prefix is cut at the prefix and marked [REDACTED-...]", "Insert tool_error_triage err_head 'key AIzaNEGTESTFAKE rejected'; expect 'key [REDACTED-GOOGLE-KEY]'", "Never log credentials; the scrub is a backstop"),
    cases: [{ sql: "INSERT INTO tool_error_triage (event_id, tool, err_class, err_head) VALUES ('negtest-t2', 'web_fetch', 'x', 'key AIzaNEGTESTFAKE rejected')", effect: (db) => { const h = val(db, "SELECT err_head FROM tool_error_triage WHERE event_id = 'negtest-t2'"); return eff(h === "key [REDACTED-GOOGLE-KEY]", `err_head=${h}`); } }],
    allowed: { sql: "INSERT INTO tool_error_triage (event_id, tool, err_class, err_head) VALUES ('negtest-t3', 'web_fetch', 'x', 'timeout after 30s')", check: (db) => { const h = val(db, "SELECT err_head FROM tool_error_triage WHERE event_id = 'negtest-t3'"); return eff(h === "timeout after 30s", `clean err_head kept: ${h}`); } },
  },
  // worker_consolidation, worker_live_audit
  {
    guard: "worker_removals_from_consolidation_upd", db: "audit", kind: "effect", seed: ["INSERT INTO worker_consolidation (worker, action, status) VALUES ('negtest-worker', 'keep', 'active')"],
    register: reg("worker_consolidation", "AFTER UPDATE OF status, action into a RETIR* value: one worker_removals row (source trigger:worker_consolidation) is written for the worker", "Set worker_consolidation status = 'RETIRED'; expect one worker_removals row for that worker (status 'merging' writes none)", "Removal records are automatic"),
    cases: [{ sql: "UPDATE worker_consolidation SET status = 'RETIRED' WHERE worker = 'negtest-worker'", effect: (db) => { const n = count(db, "SELECT COUNT(*) FROM worker_removals WHERE worker = 'negtest-worker' AND source = 'trigger:worker_consolidation'"); return eff(n === 1, `worker_removals rows=${n}`); } }],
    allowed: { sql: "UPDATE worker_consolidation SET status = 'merging' WHERE worker = 'negtest-worker'", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM worker_removals"); return eff(n === 0, `non-retire status: worker_removals rows=${n}`); } },
  },
  {
    guard: "worker_removals_from_consolidation_ins", db: "audit", kind: "effect", seed: [],
    register: reg("worker_consolidation", "AFTER INSERT with a RETIR* status or action: one worker_removals row (source trigger:worker_consolidation) is written for the worker", "Insert worker_consolidation action 'retire'; expect one worker_removals row for that worker (action 'keep' writes none)", "Removal records are automatic"),
    cases: [{ sql: "INSERT INTO worker_consolidation (worker, action, status) VALUES ('negtest-worker-2', 'retire', 'planned')", effect: (db) => { const n = count(db, "SELECT COUNT(*) FROM worker_removals WHERE worker = 'negtest-worker-2' AND source = 'trigger:worker_consolidation'"); return eff(n === 1, `worker_removals rows=${n}`); } }],
    allowed: { sql: "INSERT INTO worker_consolidation (worker, action, status) VALUES ('negtest-worker-3', 'keep', 'active')", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM worker_removals"); return eff(n === 0, `keep: worker_removals rows=${n}`); } },
  },
  {
    guard: "worker_removals_from_live_audit", db: "audit", kind: "effect", seed: ["INSERT INTO worker_live_audit (worker, http, live_version, note) VALUES ('negtest-worker', 200, '1.0.0', 'SYNC')"],
    register: reg("worker_live_audit", "AFTER UPDATE OF note from SYNC, DRIFT or CRON_ONLY to NOT_DEPLOYED: one worker_removals row OBSERVED-REMOVED is written (once per worker per day)", "Set worker_live_audit note = 'NOT_DEPLOYED' on a SYNC worker; expect one worker_removals row action OBSERVED-REMOVED (SYNC to DRIFT writes none)", "Removal records are automatic"),
    cases: [{ sql: "UPDATE worker_live_audit SET note = 'NOT_DEPLOYED', http = 404 WHERE worker = 'negtest-worker'", effect: (db) => { const n = count(db, "SELECT COUNT(*) FROM worker_removals WHERE worker = 'negtest-worker' AND action = 'OBSERVED-REMOVED'"); return eff(n === 1, `worker_removals rows=${n}`); } }],
    allowed: { sql: "UPDATE worker_live_audit SET note = 'DRIFT' WHERE worker = 'negtest-worker'", check: (db) => { const n = count(db, "SELECT COUNT(*) FROM worker_removals"); return eff(n === 0, `SYNC to DRIFT: worker_removals rows=${n}`); } },
  },
  // living-paper
  {
    guard: "trg_papers_doi_converge_ins", db: "living", kind: "effect", seed: [],
    register: reg("living.papers", "AFTER INSERT of a paper with a Zenodo DOI: zenodo_doi is set to the DOI and zenodo_url to https://zenodo.org/records/<id> when missing or inconsistent", "Insert a draft paper with doi '10.5281/zenodo.1234567' and no Zenodo fields; expect zenodo_doi = that DOI and zenodo_url 'https://zenodo.org/records/1234567' (a non-Zenodo DOI leaves them NULL)", "Convergence is automatic; fix the DOI, not the derived fields"),
    cases: [{ sql: "INSERT INTO papers (identifier, title, authors, status, doi) VALUES ('negtest-paper-2', 'Negtest', '[\"negtest\"]', 'draft', '10.5281/zenodo.1234567')", effect: (db) => { const r = one(db, "SELECT zenodo_doi, zenodo_url FROM papers WHERE identifier = 'negtest-paper-2'"); return eff(r?.zenodo_doi === "10.5281/zenodo.1234567" && r?.zenodo_url === "https://zenodo.org/records/1234567", `zenodo_doi=${r?.zenodo_doi} zenodo_url=${r?.zenodo_url}`); } }],
    allowed: { sql: "INSERT INTO papers (identifier, title, authors, status, doi) VALUES ('negtest-paper-4', 'Negtest', '[\"negtest\"]', 'draft', '10.48550/arXiv.2401.00001')", check: (db) => { const r = one(db, "SELECT zenodo_doi, zenodo_url FROM papers WHERE identifier = 'negtest-paper-4'"); return eff(r?.zenodo_doi == null && r?.zenodo_url == null, `non-Zenodo DOI: zenodo_doi=${r?.zenodo_doi}`); } },
  },
  {
    guard: "trg_papers_doi_converge_upd", db: "living", kind: "effect", seed: ["INSERT INTO papers (identifier, title, authors, status) VALUES ('negtest-paper-3', 'Negtest', '[\"negtest\"]', 'draft')"],
    register: reg("living.papers", "AFTER UPDATE OF doi, zenodo_doi, zenodo_url with a Zenodo DOI: zenodo_doi and zenodo_url converge to the DOI and https://zenodo.org/records/<id>", "Set doi = '10.5281/zenodo.7654321' on a draft paper; expect zenodo_doi = that DOI and zenodo_url 'https://zenodo.org/records/7654321'", "Convergence is automatic; fix the DOI, not the derived fields"),
    cases: [{ sql: "UPDATE papers SET doi = '10.5281/zenodo.7654321' WHERE identifier = 'negtest-paper-3'", effect: (db) => { const r = one(db, "SELECT zenodo_doi, zenodo_url FROM papers WHERE identifier = 'negtest-paper-3'"); return eff(r?.zenodo_doi === "10.5281/zenodo.7654321" && r?.zenodo_url === "https://zenodo.org/records/7654321", `zenodo_doi=${r?.zenodo_doi} zenodo_url=${r?.zenodo_url}`); } }],
    allowed: { sql: "UPDATE papers SET title = 'Negtest renamed' WHERE identifier = 'negtest-paper-3'", check: (db) => { const r = one(db, "SELECT zenodo_doi FROM papers WHERE identifier = 'negtest-paper-3'"); return eff(r?.zenodo_doi == null, `no DOI: zenodo_doi=${r?.zenodo_doi}`); } },
  },
];
GUARDS.push(...REGISTER);

// ---- runner ---------------------------------------------------------------------------------------------------------
const coverageGap = (registry, triggers) => Object.fromEntries(Object.entries(triggers).map(([k, names]) => [k, names.filter((n) => !registry.has(n))]));

function testInvariant(g) {
  const before = coverageGap(new Set(SNAP.coverage.registry_guards), SNAP.coverage.live_triggers);
  const beforeTotal = Object.values(before).flat().length;
  const planned = new Set([...SNAP.coverage.registry_guards, ...REGISTER.map((x) => x.guard)]);
  const plannedGap = Object.values(coverageGap(planned, SNAP.coverage.live_triggers)).flat();
  const beforeText = `read ${SNAP.coverage.read_at}: ${Object.entries(before).map(([k, v]) => `${k} ${v.length}/${SNAP.coverage.live_triggers[k].length}`).join(", ")} live triggers had no guard_registry row; this change registers ${REGISTER.length} (gap left by it: ${plannedGap.length})`;
  const base = {
    name: g.guard, db: g.db, enforcing_object: null, kind: g.kind,
    forbidden_sql: "add a trigger and skip registration (registry negative_test)", rejected: false,
  };
  const ca = SNAP.coverage_after;
  if (!ca) {
    return { ...base, message: `invariant, no schema object; ${beforeText}; no post-registration read recorded`, pass: false, reason: `${beforeTotal} live triggers unregistered in the snapshot read and no post-registration read recorded` };
  }
  const unreg = Object.values(ca.unregistered).reduce((a, b) => a + b, 0);
  const others = Object.values(ca.other_databases_triggers).reduce((a, b) => a + b, 0);
  const pass = unreg === 0 && others === 0 && plannedGap.length === 0;
  const out = {
    ...base,
    message: `invariant, no schema object, checked by query; ${beforeText}; read ${ca.read_at} after registration: ${Object.entries(ca.live).map(([k, n]) => `${k} ${ca.unregistered[k]}/${n}`).join(", ")} unregistered; the other ${Object.keys(ca.other_databases_triggers).length} D1 databases hold ${others} triggers`,
    pass,
  };
  if (!pass) out.reason = `coverage does not hold: ${unreg} live triggers unregistered after registration, ${others} triggers in other databases, ${plannedGap.length} not covered by this change`;
  return out;
}

function testGuard(g) {
  if (g.kind === "invariant") return testInvariant(g);
  const ov = g.ddl === "migration" ? MIG : null;
  const obj = findObject(g.db, g.guard);
  const ddlText = (ov && ov[g.guard]) || (obj && obj.sql);
  const read_at = (obj && obj.read_at) || SNAP.databases[g.db].read_at;
  const base = {
    name: g.guard, db: g.db, ddl: ov ? MIGRATION_PATH : `live sqlite_master read ${read_at}`,
    enforcing_object: obj ? `${obj.type} ${obj.name} ON ${obj.tbl_name}` : null, kind: g.kind,
  };
  const firstSql = g.kind === "abort" ? g.cases[0] : g.cases[0].sql;
  if (!obj) {
    return { ...base, forbidden_sql: squash(firstSql), rejected: false, message: "enforcing object not found in sqlite_master snapshot", pass: false, reason: "no enforcing object" };
  }
  const fails = [];
  let message = null, rejected = null, effect_observed = null, state_unchanged = null;

  // negative test with the guard present
  const db = build(g.db, g.seed, null, ov);
  if (g.kind === "abort") {
    const expected = raiseText(ddlText);
    const before = JSON.stringify(all(db, g.state));
    const results = g.cases.map((sql) => run(db, sql));
    const after = JSON.stringify(all(db, g.state));
    state_unchanged = before === after;
    rejected = results.every((r) => !r.ok && r.errcode === SQLITE_CONSTRAINT_TRIGGER && r.message === expected);
    message = results[0].ok ? "statement succeeded (not rejected)" : `${results[0].message} [errcode ${results[0].errcode} ${results[0].errstr}]`;
    results.forEach((r, i) => {
      if (r.ok) fails.push(`case ${i + 1} not rejected`);
      else if (r.errcode !== SQLITE_CONSTRAINT_TRIGGER || r.message !== expected) fails.push(`case ${i + 1} rejected by something else: ${r.message} [errcode ${r.errcode}]`);
    });
    if (!state_unchanged) fails.push("row state changed");
  } else {
    const obs = [];
    effect_observed = true;
    g.cases.forEach((c, i) => {
      const cdb = c.isolate ? build(g.db, g.seed, null, ov) : db;
      const r = run(cdb, c.sql);
      if (!r.ok) {
        effect_observed = false;
        obs.push(`case ${i + 1} statement failed: ${r.message} [errcode ${r.errcode} ${r.errstr}]`);
        fails.push(`case ${i + 1} statement failed: ${r.message}`);
      } else {
        const e = c.effect(cdb);
        obs.push(e.observed);
        if (!e.ok) { effect_observed = false; fails.push(`case ${i + 1} effect missing: ${e.observed}`); }
      }
      if (c.isolate) cdb.close();
    });
    rejected = false;
    message = obs.join("; ");
  }
  db.close();

  // control: same statements without the guard's trigger must not give the guard's outcome
  const ctl = build(g.db, g.seed, g.guard, ov);
  const ctrl = [];
  if (g.kind === "abort") {
    g.cases.forEach((sql, i) => {
      const r = run(ctl, sql);
      ctrl.push(r.ok ? "write lands" : `still refused: ${r.message}`);
      if (!r.ok) fails.push(`control case ${i + 1}: refused even without the guard (${r.message}), so the outcome is not attributable to it`);
    });
  } else {
    g.cases.forEach((c, i) => {
      const cdb = c.isolate ? build(g.db, g.seed, g.guard, ov) : ctl;
      const r = run(cdb, c.sql);
      if (!r.ok) ctrl.push(`statement failed: ${r.message}`);
      else {
        const e = c.effect(cdb);
        if (c.control === false) ctrl.push(`(system property, not attributed) ${e.observed}`);
        else {
          ctrl.push(e.observed);
          if (e.ok) fails.push(`control case ${i + 1}: effect also present without the guard (${e.observed}), so it is not attributable to it`);
        }
      }
      if (c.isolate) cdb.close();
    });
  }
  ctl.close();

  // allowed: a legitimate write the guard text implies must pass without the guard's outcome
  let allowed_sql = null, allowed_ok = null, allowed_observed = null;
  if (g.allowed) {
    const adb = build(g.db, g.allowed.seed || g.seed, null, ov);
    allowed_sql = squash(g.allowed.sql);
    const r = run(adb, g.allowed.sql);
    if (!r.ok) { allowed_ok = false; allowed_observed = `blocked: ${r.message}`; }
    else { const c = g.allowed.check(adb); allowed_ok = c.ok; allowed_observed = c.observed; }
    if (!allowed_ok) fails.push(`allowed write: ${allowed_observed}`);
    adb.close();
  }

  const pass = fails.length === 0;
  const out = {
    ...base, forbidden_sql: squash(firstSql), cases: g.cases.length, rejected, message,
    ...(g.kind === "abort" ? { state_unchanged } : { effect_observed }),
    control_without_guard: ctrl.join("; "), allowed_sql, allowed_ok, allowed_observed, pass,
  };
  if (!pass) out.reason = fails.join(" | ");
  if (ov) {
    // a repair counts only if the live DDL fails the same test
    const live = testGuard({ ...g, ddl: undefined });
    out.live_ddl_pass = live.pass;
    out.live_ddl_result = live.pass ? "passes" : abbr(live.reason, 220);
    out.discriminates = out.pass && !live.pass;
    if (out.pass && !out.discriminates) { out.pass = false; out.reason = "the live DDL passes the same test, so the test does not discriminate"; }
    return out;
  }
  if (pass) {
    const head = `GUARD-VERIFY-OFFLINE-1 2026-10-05: negative test against the live DDL (sqlite_master read ${read_at}) in node:sqlite, scripts/guard-registry-negative-tests.mjs: ${abbr(firstSql, 150)}`;
    const tail = g.kind === "abort"
      ? ` -> rejected: ${abbr(results0Message(message), 170)} (SQLITE_CONSTRAINT_TRIGGER, rows unchanged; ${g.cases.length} case(s); without the trigger the write lands${g.allowed ? "; allowed write passes" : ""})`
      : ` -> effect: ${abbr(message, 170)}; without the trigger: ${abbr(ctrl[0], 80)}${g.allowed ? `; allowed: ${abbr(allowed_observed, 70)}` : ""}`;
    out.evidence = head + tail;
  }
  if (g.register) out.register = g.register;
  return out;
}
function results0Message(m) { return String(m).replace(/\s*\[errcode[^\]]*\]$/, ""); }

// every unverified row and every trigger that had no registry row must have exactly one live-DDL test
{
  const registered = new Set(SNAP.coverage.registry_guards);
  const uncovered = Object.values(SNAP.coverage.live_triggers).flat().filter((n) => !registered.has(n));
  const want = [...SNAP.unverified_rows.rows.map((r) => r.guard), ...uncovered].sort();
  const tested = GUARDS.filter((g) => g.ddl !== "migration").map((g) => g.guard).sort();
  const problems = [];
  if (JSON.stringify(want) !== JSON.stringify(tested)) problems.push("tests " + JSON.stringify(tested) + " vs expected " + JSON.stringify(want));
  const noText = uncovered.filter((n) => !REGISTER.some((x) => x.guard === n && x.register));
  if (noText.length) problems.push("no registry text for " + noText.join(", "));
  const noRepair = GUARDS.filter((g) => g.ddl === "migration" && !MIG[g.guard]).map((g) => g.guard);
  if (noRepair.length) problems.push("migration entries without a repair: " + noRepair.join(", "));
  if (problems.length) {
    console.error("TEST LIST MISMATCH: " + problems.join(" | "));
    process.exit(2);
  }
}

let passed = 0, failed = 0;
const results = [];
for (const g of GUARDS) {
  let r;
  try { r = testGuard(g); }
  catch (e) { r = { name: g.guard, db: g.db, enforcing_object: null, kind: g.kind, forbidden_sql: null, rejected: false, message: `harness error: ${e.message}`, pass: false, reason: `harness error: ${e.message}` }; }
  if (r.pass) passed++; else failed++;
  results.push(r);
  console.log(JSON.stringify(r));
}
console.log(`${passed} passed, ${failed} failed`);
const repaired = results.filter((r) => r.ddl === MIGRATION_PATH && r.pass).map((r) => r.name);
const pendingRepair = results.filter((r) => !r.pass && r.ddl && r.ddl.startsWith("live") && repaired.includes(r.name)).map((r) => r.name);
if (pendingRepair.length) console.log(`of the failures, ${pendingRepair.join(" and ")} fail on the live DDL and pass with the repair in ${MIGRATION_PATH} (not applied)`);
process.exit(failed ? 1 : 0);
