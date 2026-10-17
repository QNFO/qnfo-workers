// AGENT-ISSUES-TRIGGER-DEPTH-2 offline suite: applies migrations/2026-10-17-consolidate-agent-issues-ts-triggers.sql on an
// in-memory SQLite shaped like the agent_issues table and proves: the 10 timestamp triggers become 2; null/text/seconds/ms
// timestamps normalise identically before and after; the UPDATE path normalises; a second apply changes nothing (idempotent);
// the backup table bak_20261017_agent_issues_ts_triggers captures the 10 originals for rollback.
// Run: node migrations/2026-10-17-consolidate-agent-issues-ts-triggers.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-17-consolidate-agent-issues-ts-triggers.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };

const OLD_TRIGGERS = [
  "agent_issues_created_at_default_ins", "agent_issues_created_at_norm_ins", "agent_issues_created_at_norm_secs_ins",
  "agent_issues_created_at_norm_upd", "agent_issues_created_at_norm_secs_upd",
  "agent_issues_updated_at_default_ins", "agent_issues_updated_at_norm_ins", "agent_issues_updated_at_norm_secs_ins",
  "agent_issues_updated_at_norm_upd", "agent_issues_updated_at_norm_secs_upd"
];

function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);`);
  // Recreate the 10 original triggers.
  const trigs = [
    ["agent_issues_created_at_default_ins", "AFTER INSERT ON agent_issues WHEN NEW.created_at IS NULL BEGIN UPDATE agent_issues SET created_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE id = NEW.id; END"],
    ["agent_issues_created_at_norm_ins", "AFTER INSERT ON agent_issues WHEN typeof(NEW.created_at) = 'text' BEGIN UPDATE agent_issues SET created_at = COALESCE(CAST(strftime('%s', NEW.created_at) AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE id = NEW.id; END"],
    ["agent_issues_created_at_norm_secs_ins", "AFTER INSERT ON agent_issues WHEN typeof(NEW.created_at)='integer' AND NEW.created_at > 0 AND NEW.created_at < 100000000000 BEGIN UPDATE agent_issues SET created_at = NEW.created_at * 1000 WHERE id = NEW.id; END"],
    ["agent_issues_created_at_norm_upd", "AFTER UPDATE OF created_at ON agent_issues WHEN typeof(NEW.created_at) = 'text' BEGIN UPDATE agent_issues SET created_at = COALESCE(CAST(strftime('%s', NEW.created_at) AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE id = NEW.id; END"],
    ["agent_issues_created_at_norm_secs_upd", "AFTER UPDATE OF created_at ON agent_issues WHEN typeof(NEW.created_at)='integer' AND NEW.created_at > 0 AND NEW.created_at < 100000000000 BEGIN UPDATE agent_issues SET created_at = NEW.created_at * 1000 WHERE id = NEW.id; END"],
    ["agent_issues_updated_at_default_ins", "AFTER INSERT ON agent_issues WHEN NEW.updated_at IS NULL BEGIN UPDATE agent_issues SET updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE id = NEW.id; END"],
    ["agent_issues_updated_at_norm_ins", "AFTER INSERT ON agent_issues WHEN typeof(NEW.updated_at) = 'text' BEGIN UPDATE agent_issues SET updated_at = COALESCE(CAST(strftime('%s', NEW.updated_at) AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE id = NEW.id; END"],
    ["agent_issues_updated_at_norm_secs_ins", "AFTER INSERT ON agent_issues WHEN typeof(NEW.updated_at)='integer' AND NEW.updated_at > 0 AND NEW.updated_at < 100000000000 BEGIN UPDATE agent_issues SET updated_at = NEW.updated_at * 1000 WHERE id = NEW.id; END"],
    ["agent_issues_updated_at_norm_upd", "AFTER UPDATE OF updated_at ON agent_issues WHEN typeof(NEW.updated_at) = 'text' BEGIN UPDATE agent_issues SET updated_at = COALESCE(CAST(strftime('%s', NEW.updated_at) AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE id = NEW.id; END"],
    ["agent_issues_updated_at_norm_secs_upd", "AFTER UPDATE OF updated_at ON agent_issues WHEN typeof(NEW.updated_at)='integer' AND NEW.updated_at > 0 AND NEW.updated_at < 100000000000 BEGIN UPDATE agent_issues SET updated_at = NEW.updated_at * 1000 WHERE id = NEW.id; END"],
  ];
  for (const [name, body] of trigs) db.exec(`CREATE TRIGGER ${name} ${body}`);
  return db;
}

function insertAndRead(db, label, ca, ua) {
  db.prepare("INSERT INTO agent_issues (title, created_at, updated_at) VALUES (?, ?, ?)").run(label, ca, ua);
  return db.prepare("SELECT typeof(created_at) t1, created_at c1, typeof(updated_at) t2, updated_at c2 FROM agent_issues WHERE title = ?").get(label);
}

// 1. Pre-state has all 10 triggers.
{
  const db = freshDb();
  const n = db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND tbl_name='agent_issues'").get().n;
  ok(n === 10, "pre-state has 10 agent_issues triggers", n);
  // record old normalisation behaviour for the four cases
  const oldResults = [
    insertAndRead(db, "null", null, null),
    insertAndRead(db, "text", "2026-10-17T14:40:52", "2026-10-17T15:00:00"),
    insertAndRead(db, "secs", 1792267258, 1792267300),
    insertAndRead(db, "ms", 1792267258000, 1792267300000),
  ];
  db.exec(sql);
  // 2. Post-state: exactly the 2 new triggers, no originals.
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='agent_issues' ORDER BY name").all().map(r => r.name);
  ok(names.length === 2, "post-state has 2 agent_issues triggers", names);
  ok(names.includes("agent_issues_ts_norm_ins") && names.includes("agent_issues_ts_norm_upd"), "the two consolidated triggers exist", names);
  for (const t of OLD_TRIGGERS) ok(!names.includes(t), "original trigger dropped: " + t);
  // 3. Idempotent second apply: still 2 triggers.
  db.exec(sql);
  const names2 = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='agent_issues' ORDER BY name").all().map(r => r.name);
  ok(names2.length === 2, "second apply leaves 2 triggers (idempotent)", names2);
  // 4. Backup table captures 10 originals.
  const bak = db.prepare("SELECT COUNT(*) n FROM bak_20261017_agent_issues_ts_triggers").get().n;
  ok(bak === 10, "backup table holds 10 originals for rollback", bak);
  // 5. Normalisation semantics preserved after consolidation (fresh rows in the same DB).
  db.prepare("DELETE FROM agent_issues").run();
  const newResults = [
    insertAndRead(db, "null2", null, null),
    insertAndRead(db, "text2", "2026-10-17T14:40:52", "2026-10-17T15:00:00"),
    insertAndRead(db, "secs2", 1792267258, 1792267300),
    insertAndRead(db, "ms2", 1792267258000, 1792267300000),
  ];
  for (let i = 0; i < oldResults.length; i++) {
    const a = oldResults[i], b = newResults[i];
    ok(a.t1 === b.t1 && a.t2 === b.t2, `case ${i} type parity (${a.t1}/${a.t2} vs ${b.t1}/${b.t2})`);
    if (a.c1 != null && b.c1 != null) ok(Math.abs(a.c1 - b.c1) <= 5000, `case ${i} created_at parity (${a.c1} vs ${b.c1})`);
    if (a.c2 != null && b.c2 != null) ok(Math.abs(a.c2 - b.c2) <= 5000, `case ${i} updated_at parity (${a.c2} vs ${b.c2})`);
  }
  // 6. UPDATE path normalises text -> ms.
  db.prepare("INSERT INTO agent_issues (title, created_at, updated_at) VALUES ('upd', 1792267258000, 1792267300000)").run();
  db.prepare("UPDATE agent_issues SET created_at = '2026-10-17T14:40:52' WHERE title = 'upd'").run();
  const up = db.prepare("SELECT typeof(created_at) t, created_at c FROM agent_issues WHERE title='upd'").get();
  ok(up.t === "integer" && up.c > 100000000000, "UPDATE path normalises text created_at to ms", up);
}

console.log(`\nPASS ${pass}  FAIL ${fail}`);
if (fail) process.exit(1);
