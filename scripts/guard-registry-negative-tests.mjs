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
//      the outcome is the guard's own;
//   5. allowed: where the guard text implies a legitimate write, that write must succeed without the guard's outcome.
// Output: one JSON line per guard, then "N passed, M failed". Exit 0 when all pass, 1 when any fails, 2 when the
// DDL snapshot does not match the live read (len/chk recorded by D1).
// Run: node scripts/guard-registry-negative-tests.mjs   (Node >= 22.5; no network, no credentials, no live writes)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const SNAP = JSON.parse(readFileSync(new URL("./guard-registry-ddl-2026-10-05.json", import.meta.url), "utf8"));
const SQLITE_CONSTRAINT_TRIGGER = 1811;

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

// ---- helpers --------------------------------------------------------------------------------------------------------
function findObject(dbKey, name) {
  return (SNAP.databases[dbKey]?.objects || []).find((o) => o.name === name) || null;
}
function build(dbKey, seed = [], without = null) {
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
  for (const o of objs) if (o.type === "trigger" && o.name !== without) db.exec(o.sql);
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

// ---- runner ---------------------------------------------------------------------------------------------------------
function testInvariant(g) {
  const reg = new Set(SNAP.coverage.registry_guards);
  const gaps = Object.entries(SNAP.coverage.live_triggers).map(([k, names]) => {
    const missing = names.filter((n) => !reg.has(n));
    return `${k} ${missing.length}/${names.length}`;
  });
  const total = Object.values(SNAP.coverage.live_triggers).flat().filter((n) => !reg.has(n)).length;
  return {
    name: g.guard, db: g.db, enforcing_object: null, kind: g.kind,
    forbidden_sql: "add a trigger and skip registration (registry negative_test)", rejected: false,
    message: `no enforcing object in sqlite_master (object_type=invariant: nothing refuses an unregistered trigger); parity read ${SNAP.coverage.read_at}: live triggers without a guard_registry row: ${gaps.join(", ")}`,
    pass: false,
    reason: total > 0
      ? `no enforcing object, and the invariant does not hold live: ${total} live triggers have no guard_registry row`
      : "no enforcing object in sqlite_master",
  };
}

function testGuard(g) {
  if (g.kind === "invariant") return testInvariant(g);
  const obj = findObject(g.db, g.guard);
  const base = { name: g.guard, db: g.db, enforcing_object: obj ? `${obj.type} ${obj.name} ON ${obj.tbl_name}` : null, kind: g.kind };
  const firstSql = g.kind === "abort" ? g.cases[0] : g.cases[0].sql;
  if (!obj) {
    return { ...base, forbidden_sql: squash(firstSql), rejected: false, message: "enforcing object not found in sqlite_master snapshot", pass: false, reason: "no enforcing object" };
  }
  const read_at = SNAP.databases[g.db].read_at;
  const fails = [];
  let message = null, rejected = null, effect_observed = null, state_unchanged = null;

  // negative test with the guard present
  const db = build(g.db, g.seed);
  if (g.kind === "abort") {
    const expected = raiseText(obj.sql);
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
      const r = run(db, c.sql);
      if (!r.ok) { effect_observed = false; obs.push(`case ${i + 1} statement failed: ${r.message} [errcode ${r.errcode} ${r.errstr}]`); fails.push(`case ${i + 1} statement failed: ${r.message}`); return; }
      const e = c.effect(db);
      obs.push(e.observed);
      if (!e.ok) { effect_observed = false; fails.push(`case ${i + 1} effect missing: ${e.observed}`); }
    });
    rejected = false;
    message = obs.join("; ");
  }
  db.close();

  // control: same statements without the guard's trigger must not give the guard's outcome
  const cdb = build(g.db, g.seed, g.guard);
  const ctrl = [];
  if (g.kind === "abort") {
    g.cases.forEach((sql, i) => {
      const r = run(cdb, sql);
      ctrl.push(r.ok ? "write lands" : `still refused: ${r.message}`);
      if (!r.ok) fails.push(`control case ${i + 1}: refused even without the guard (${r.message}), so the outcome is not attributable to it`);
    });
  } else {
    g.cases.forEach((c, i) => {
      const r = run(cdb, c.sql);
      if (!r.ok) { ctrl.push(`statement failed: ${r.message}`); return; }
      const e = c.effect(cdb);
      ctrl.push(e.observed);
      if (e.ok) fails.push(`control case ${i + 1}: effect also present without the guard (${e.observed}), so it is not attributable to it`);
    });
  }
  cdb.close();

  // allowed: a legitimate write the guard text implies must pass without the guard's outcome
  let allowed_sql = null, allowed_ok = null, allowed_observed = null;
  if (g.allowed) {
    const adb = build(g.db, g.allowed.seed || g.seed);
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
  if (pass) {
    const head = `GUARD-VERIFY-OFFLINE-1 2026-10-05: negative test against the live DDL (sqlite_master read ${read_at}) in node:sqlite, scripts/guard-registry-negative-tests.mjs: ${abbr(firstSql, 150)}`;
    const tail = g.kind === "abort"
      ? ` -> rejected: ${abbr(results0Message(message), 170)} (SQLITE_CONSTRAINT_TRIGGER, rows unchanged; ${g.cases.length} case(s); without the trigger the write lands${g.allowed ? "; allowed write passes" : ""})`
      : ` -> effect: ${abbr(message, 170)}; without the trigger: ${abbr(ctrl[0], 80)}${g.allowed ? `; allowed: ${abbr(allowed_observed, 70)}` : ""}`;
    out.evidence = head + tail;
  }
  return out;
}
function results0Message(m) { return String(m).replace(/\s*\[errcode[^\]]*\]$/, ""); }

// every unverified row must have a test, and no test may target a row that is not in the list
const listed = SNAP.unverified_rows.rows.map((r) => r.guard).sort();
const tested = GUARDS.map((g) => g.guard).sort();
if (JSON.stringify(listed) !== JSON.stringify(tested)) {
  console.error("TEST LIST MISMATCH: registry rows " + JSON.stringify(listed) + " vs tests " + JSON.stringify(tested));
  process.exit(2);
}

let passed = 0, failed = 0;
for (const g of GUARDS) {
  let r;
  try { r = testGuard(g); }
  catch (e) { r = { name: g.guard, db: g.db, enforcing_object: null, kind: g.kind, forbidden_sql: null, rejected: false, message: `harness error: ${e.message}`, pass: false, reason: `harness error: ${e.message}` }; }
  if (r.pass) passed++; else failed++;
  console.log(JSON.stringify(r));
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
