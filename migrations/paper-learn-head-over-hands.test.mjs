// PAPER-LEARN-HEAD-OVER-HANDS-1 offline suite: replays migrations/2026-10-26-paper-learn-head-over-hands.sql on SQLite.
// Proves: the six direct learnings of head-over-hands 1.0.1 each get the intended disposition and a PL-TRIAGE-1 note, so the closing probe of issue 1000487 reads 0; the two analogy-only
// learnings and a row someone else settled are untouched; every in-place note names its mechanism and a probe that read ok, the routed one names its successor issue; the new
// catalogue probe is one read-only SELECT that reads ok on a fleet with an open ROOT-CAUSE-1 issue and absent without; the decision is written once; a second apply changes nothing;
// the Rollback line restores the six rows and removes the mechanism.
// Run: node --no-warnings migrations/paper-learn-head-over-hands.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-paper-learn-head-over-hands.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x === undefined ? "" : " :: " + JSON.stringify(x).slice(0, 300))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
ok(!/[^\x00-\x7F]/.test(sql), "the file is ASCII only (D1-WRITE-ASCII-1)");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- BACKUP: bak_20261026_paper_learnings_hoh$/m.test(sql), "the opt-in, DB and BACKUP headers are present");

const d = new DatabaseSync(":memory:");
d.exec(`CREATE TABLE paper_learnings (id INTEGER PRIMARY KEY, slug TEXT, version TEXT, claim TEXT, kind TEXT, applicability TEXT, fleet_status TEXT DEFAULT 'proposed', status_note TEXT, issue_id INTEGER, updated_at TEXT);
  CREATE TABLE paper_learning_mechanisms (mech_key TEXT PRIMARY KEY, title TEXT NOT NULL, terms TEXT NOT NULL DEFAULT '', citation TEXT NOT NULL, evidence_probe TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
  CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
  CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;`);
for (const id of [5457, 5458, 5459, 5460, 5461, 5462]) d.prepare("INSERT INTO paper_learnings (id, slug, version, claim, kind, applicability, issue_id, status_note) VALUES (?, 'head-over-hands', '1.0.1', 'c', 'derived', 'direct', 1000487, 'PL-TRIAGE-1 apply (one model)')").run(id);
for (const id of [5463, 5464]) d.prepare("INSERT INTO paper_learnings (id, slug, version, claim, kind, applicability) VALUES (?, 'head-over-hands', '1.0.1', 'c', 'cited', 'analogy')").run(id);
d.prepare("INSERT INTO paper_learnings (id, slug, version, claim, kind, applicability, fleet_status, status_note) VALUES (9003, 'head-over-hands', '1.0.1', 'c', 'derived', 'direct', 'applied', 'by hand')").run();
d.prepare("INSERT INTO agent_issues (id, title, status) VALUES (1000301, 'ROOT-CAUSE-1: CF-OBS-ISSUE-1 keeps recurring', 'open')").run();
const snapshot = () => JSON.stringify(d.prepare("SELECT id, fleet_status, status_note FROM paper_learnings ORDER BY id").all());
d.exec(sql);
const row = (id) => d.prepare("SELECT * FROM paper_learnings WHERE id = ?").get(id);
const want = { "already-in-place": [5457, 5458, 5459, 5461, 5462], routed: [5460] };
let n = 0;
for (const [st, ids] of Object.entries(want)) for (const id of ids) {
  n++;
  const r = row(id);
  ok(r.fleet_status === st && /^PL-TRIAGE-1 /.test(r.status_note) && r.status_note.includes("session-old-issues-6d-2038") && r.status_note.length <= 700 && r.status_note.length > 120, "learning " + id + " is " + st + " with a bounded PL-TRIAGE-1 note", [r.fleet_status, r.status_note.length]);
  if (st === "already-in-place") ok(/ - /.test(r.status_note) && /probe ok 2026-10-26/.test(r.status_note), "learning " + id + " cites its mechanism and a probe that read ok", r.status_note);
  if (st === "routed") ok(/routed to issue 1000459/.test(r.status_note), "learning " + id + " names the successor issue", r.status_note);
}
ok(n === 6, "all six direct learnings have a disposition", n);
const open = d.prepare("SELECT COUNT(*) AS n FROM paper_learnings WHERE slug = 'head-over-hands' AND version = '1.0.1' AND applicability = 'direct' AND fleet_status = 'proposed'").get().n;
ok(open === 0, "the closing probe of issue 1000487 reads 0", open);
ok(row(5463).fleet_status === "proposed" && row(5464).fleet_status === "proposed", "the analogy-only learnings are left to the hourly triage");
ok(row(9003).fleet_status === "applied" && row(9003).status_note === "by hand", "a row someone else settled is untouched");
const mech = d.prepare("SELECT * FROM paper_learning_mechanisms WHERE mech_key = 'root-cause-recurrence'").get();
ok(mech && mech.status === "active", "the root-cause-recurrence mechanism is catalogued", mech && mech.mech_key);
ok(/^SELECT /.test(mech.evidence_probe) && !/\b(INSERT|UPDATE|DELETE|DROP|REPLACE)\b/i.test(mech.evidence_probe), "its probe is one read-only SELECT");
ok(d.prepare(mech.evidence_probe).get().observed === "ok", "its probe reads ok with an open ROOT-CAUSE-1 issue");
d.exec("UPDATE agent_issues SET status = 'closed'");
ok(d.prepare(mech.evidence_probe).get().observed === "absent", "and absent without one (no pass by absence)");
const decisions = d.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE 'PAPER-LEARN-HEAD-OVER-HANDS-1:%'").get().n;
ok(decisions === 1, "one decision row", decisions);
const afterOnce = snapshot();
d.exec(sql);
ok(snapshot() === afterOnce && d.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "a second apply changes nothing");
ok(d.prepare("SELECT COUNT(*) AS n FROM bak_20261026_paper_learnings_hoh").get().n === 6 && d.prepare("SELECT COUNT(*) AS n FROM bak_20261026_paper_learnings_hoh WHERE fleet_status = 'proposed'").get().n === 6, "the backup holds the six rows as they were");
d.exec(rollback.split("decision_log is append-only")[0]);
const back = d.prepare("SELECT id, fleet_status, status_note FROM paper_learnings WHERE id BETWEEN 5457 AND 5462 ORDER BY id").all();
ok(back.every((r) => r.fleet_status === "proposed" && r.status_note === "PL-TRIAGE-1 apply (one model)") && d.prepare("SELECT COUNT(*) AS n FROM paper_learning_mechanisms").get().n === 0 && d.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "the Rollback line restores the six rows, removes the mechanism and keeps the decision", back);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
