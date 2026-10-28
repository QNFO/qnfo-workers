// CLUSTER-F-A part 2 offline suite: replays migrations/2026-10-28-cluster-f-a-no-doer-drain-2.sql on SQLite (node:sqlite) over the shapes of the rows it touches. State-independent.
// Proves: a version_queue row in 'error' becomes terminal ('wontfix') with its revision-log row set to needs-substantive-revision and one gov_gate_log row, only for that row and only while it is in error;
// 1000546 closes only while the parent carries the DELTA-NOTE; 1000631 closes only after 1000619 is closed; the close channel is session:cluster-f-a; a replay changes nothing; the Rollback line restores.
// Run: node migrations/cluster-f-a-no-doer-drain-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-28-cluster-f-a-no-doer-drain-2.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const hdr = sql.split("\n").filter((l) => l.startsWith("--"));
ok(hdr.some((l) => l === "-- APPLY-BY: ci") && hdr.some((l) => l === "-- DB: qnfo-audit") && hdr.some((l) => l.startsWith("-- Rollback: ")) && hdr.some((l) => l.startsWith("-- BACKUP: bak_20261028_cfa2_")), "header lines");

function fresh(o = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT DEFAULT 'open', close_channel TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, close_evidence TEXT);
CREATE TABLE version_queue (id INTEGER PRIMARY KEY, slug TEXT, status TEXT, updated_at TEXT);
CREATE TABLE paper_revision_log (id INTEGER PRIMARY KEY, slug TEXT, status TEXT, error TEXT, updated_at TEXT);
CREATE TABLE gov_gate_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, diff_sha TEXT, decision TEXT, reason TEXT, touched_gates TEXT, actor TEXT, wbs_code TEXT);
CREATE TRIGGER triage_close_sync_issue_ins AFTER INSERT ON issue_triage WHEN NEW.triage_state IN ('closed') BEGIN UPDATE agent_issues SET status = 'closed', close_channel = COALESCE(close_channel, 'auto:triage-sync' || CASE WHEN COALESCE(NEW.owner, '') <> '' THEN ':' || NEW.owner ELSE '' END) WHERE id = NEW.issue_id AND status = 'open'; END;
CREATE TRIGGER triage_close_sync_issue_upd AFTER UPDATE OF triage_state ON issue_triage WHEN NEW.triage_state IN ('closed') BEGIN UPDATE agent_issues SET status = 'closed', close_channel = COALESCE(close_channel, 'auto:triage-sync' || CASE WHEN COALESCE(NEW.owner, '') <> '' THEN ':' || NEW.owner ELSE '' END) WHERE id = NEW.issue_id AND status = 'open'; END;
`);
  db.prepare("INSERT INTO version_queue VALUES (257, 'topological-extension-hypothesis', ?, '2026-10-28 04:31:16')").run(o.vqStatus ?? "error");
  db.prepare("INSERT INTO version_queue VALUES (258, 'other-paper', 'error', '2026-10-28 04:31:16')").run();
  db.prepare("INSERT INTO paper_revision_log VALUES (1453, 'topological-extension-hypothesis', 'queued', NULL, '2026-10-28 04:24:42')").run();
  db.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (1000546, 'CODE-LOOP-EXHAUSTED-1: ct_im1000340', 'x', 'open')").run();
  db.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (1000631, 'CODE-MERGE-REFUSED-1: ct_im1000625', 'x', 'open')").run();
  db.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (1000340, 'BP26-SOCIAL-AUTOMATION-1', ?, 'open')").run(o.noDelta ? "no note" : "text DELTA-NOTE (session-cluster-e-a, 2026-10-28): the REM-ORCH item is already in qnfo-social");
  db.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (1000619, 'ROADMAP-1: sla-gap', 'x', ?)").run(o.slaClosed === false ? "open" : "closed");
  return db;
}
const one = (db, q, p = []) => db.prepare(q).get(...p);

{
  const db = fresh();
  db.exec(sql);
  const vq = one(db, "SELECT status FROM version_queue WHERE id = 257").status, other = one(db, "SELECT status FROM version_queue WHERE id = 258").status;
  ok(vq === "wontfix" && other === "error", "only version_queue 257 becomes terminal", { vq, other });
  const prl = one(db, "SELECT status, error FROM paper_revision_log WHERE id = 1453");
  ok(prl.status === "needs-substantive-revision" && /MIN-PAPER-LENGTH-4/.test(prl.error) && /37858/.test(prl.error), "the revision log row says why", prl);
  ok(one(db, "SELECT COUNT(*) n FROM gov_gate_log WHERE decision = 'RESOLVE' AND touched_gates = 'MIN-PAPER-LENGTH-4'").n === 1, "one gov_gate_log row");
  for (const id of [1000546, 1000631]) {
    const a = one(db, "SELECT status, close_channel c FROM agent_issues WHERE id = ?", [id]);
    ok(a.status === "closed" && a.c === "session:cluster-f-a" && one(db, "SELECT close_evidence e FROM issue_triage WHERE issue_id = ?", [id]).e.length > 300, "closed with evidence and the session channel: " + id, a);
  }
  db.exec(sql);
  ok(one(db, "SELECT COUNT(*) n FROM gov_gate_log").n === 1 && one(db, "SELECT status FROM version_queue WHERE id = 257").status === "wontfix", "a replay changes nothing and adds no second gate row");
}
{
  const db = fresh({ vqStatus: "published" });
  db.exec(sql);
  ok(one(db, "SELECT status FROM version_queue WHERE id = 257").status === "published" && one(db, "SELECT status FROM paper_revision_log WHERE id = 1453").status === "queued" && one(db, "SELECT COUNT(*) n FROM gov_gate_log").n === 0, "a row no longer in error is left alone");
}
{
  const db = fresh({ noDelta: true, slaClosed: false });
  db.exec(sql);
  ok(one(db, "SELECT status FROM agent_issues WHERE id = 1000546").status === "open", "1000546 stays open without the parent's DELTA-NOTE");
  ok(one(db, "SELECT status FROM agent_issues WHERE id = 1000631").status === "open", "1000631 stays open while 1000619 is open");
}
{
  const rb = hdr.find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length);
  const d = fresh();
  const snap = (x) => JSON.stringify([x.prepare("SELECT * FROM version_queue ORDER BY id").all(), x.prepare("SELECT id, status, error FROM paper_revision_log").all(), x.prepare("SELECT id, status, close_channel FROM agent_issues ORDER BY id").all()]);
  d.exec(sql);
  d.exec(rb);
  const a = one(d, "SELECT status FROM version_queue WHERE id = 257").status, p = one(d, "SELECT status, error FROM paper_revision_log WHERE id = 1453");
  ok(a === "error" && p.status === "queued" && p.error === null && one(d, "SELECT status FROM agent_issues WHERE id = 1000546").status === "open" && one(d, "SELECT status FROM agent_issues WHERE id = 1000631").status === "open", "the Rollback line restores the rows and reopens both issues", { a, p });
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
