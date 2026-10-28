// CLUSTER-F-A part 3 offline suite: replays migrations/2026-10-28-cluster-f-a-no-doer-drain-3.sql on SQLite (node:sqlite) over the shapes of the rows it touches. State-independent.
// Proves: the YT-6 parent's contract becomes a read of the metric (measured only with a real value, never at a marker); 1000599 closes only after the tick that carries a retention report and while the
// column exists, with the session close channel; 100166 gains one code-task line pair on lines of their own; every state note is appended once to its own issue and nowhere else; a replay changes
// nothing; the Rollback line restores contracts, descriptions and the closed issue.
// Run: node migrations/cluster-f-a-no-doer-drain-3.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-28-cluster-f-a-no-doer-drain-3.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const hdr = sql.split("\n").filter((l) => l.startsWith("--"));
ok(hdr.some((l) => l === "-- APPLY-BY: ci") && hdr.some((l) => l === "-- DB: qnfo-audit") && hdr.some((l) => l.startsWith("-- Rollback: ")) && hdr.some((l) => l.startsWith("-- BACKUP: bak_20261028_cfa3_")), "header lines");

const NOTED = [1000629, 1000302, 1000301, 1000303, 1000309, 1000310, 1000558, 1000489, 1000630, 1000734, 1000610, 1000573, 1000571, 1000681, 1000682, 1000683, 1000678];
const ALL = NOTED.concat([100166, 1000599, 999999]);
function fresh(o = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT DEFAULT 'open', close_channel TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, close_evidence TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, verify_probe TEXT, verify_transport TEXT, last_verdict TEXT, next_due_at TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, state TEXT, last_value TEXT);
CREATE TABLE cloud_ops_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, kind TEXT, job TEXT, text TEXT, status TEXT);
CREATE TABLE youtube_videos (id INTEGER PRIMARY KEY, slug TEXT${o.noColumn ? "" : ", avg_view_duration_s REAL"});
CREATE TRIGGER triage_close_sync_issue_ins AFTER INSERT ON issue_triage WHEN NEW.triage_state IN ('closed') BEGIN UPDATE agent_issues SET status = 'closed', close_channel = COALESCE(close_channel, 'auto:triage-sync' || CASE WHEN COALESCE(NEW.owner, '') <> '' THEN ':' || NEW.owner ELSE '' END) WHERE id = NEW.issue_id AND status = 'open'; END;
CREATE TRIGGER triage_close_sync_issue_upd AFTER UPDATE OF triage_state ON issue_triage WHEN NEW.triage_state IN ('closed') BEGIN UPDATE agent_issues SET status = 'closed', close_channel = COALESCE(close_channel, 'auto:triage-sync' || CASE WHEN COALESCE(NEW.owner, '') <> '' THEN ':' || NEW.owner ELSE '' END) WHERE id = NEW.issue_id AND status = 'open'; END;
`);
  for (const id of ALL) db.prepare("INSERT INTO agent_issues (id, title, description) VALUES (?, ?, 'base text')").run(id, "issue " + id);
  db.prepare("INSERT INTO remediation_contracts VALUES ('issue-1000597', ?, 'code-read', 'fail', NULL)").run('{"paths": ["qnfo-youtube-shorts/worker.js"], "contains": "averageViewDuration"}');
  db.prepare("INSERT INTO metric_registry VALUES ('youtube_avg_view_duration_s', 'UNMEASURED', NULL)").run();
  if (!o.noTick) db.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text, status) VALUES ('2026-10-28T21:00:45Z', 'youtube.tick', 'qnfo-youtube-shorts', '{\"retention\":{\"rows\":2,\"wrote\":0,\"failure\":\"scope-missing\"}}', 'ok')").run();
  return db;
}
const one = (db, q, p = []) => db.prepare(q).get(...p);

{
  const db = fresh();
  db.exec(sql);
  const c = one(db, "SELECT verify_probe p, verify_transport t, last_verdict v FROM remediation_contracts WHERE class = 'issue-1000597'");
  ok(c.t === "d1-query" && c.v === null && !c.p.includes(";") && /youtube_avg_view_duration_s/.test(c.p) && !/averageViewDuration/.test(c.p), "the YT-6 contract reads the metric, not a marker", c);
  ok(String(db.prepare(c.p).get().observed).startsWith("unmeasured"), "the probe reads unmeasured while the metric has no value");
  db.prepare("UPDATE metric_registry SET state = 'MEASURED', last_value = '21.4'").run();
  ok(db.prepare(c.p).get().observed === "measured", "and measured once the metric holds a value");
  db.prepare("UPDATE metric_registry SET last_value = ''").run();
  ok(String(db.prepare(c.p).get().observed).startsWith("unmeasured"), "an empty value is not a reading");
  const a = one(db, "SELECT status, close_channel c FROM agent_issues WHERE id = 1000599");
  ok(a.status === "closed" && a.c === "session:cluster-f-a" && /tick of 2026-10-28T21:00:42Z/.test(one(db, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 1000599").e), "1000599 closes on the deployed, exercised change", a);
  const d = one(db, "SELECT description d FROM agent_issues WHERE id = 100166").d;
  ok(/\ncode-task: repo=qnfo-workers path=qnfo-fleet-control\/worker\.js\ncode-anchor: var blind = rows\.filter\(function\(x\) \{ return x\.healthy === null \|\| x\.healthy === undefined; \}\)\.map\(function\(x\) \{ return x\.name; \}\);$/.test(d), "100166 carries a code-task and an anchor on lines of their own");
  for (const id of NOTED) {
    const t = one(db, "SELECT description d FROM agent_issues WHERE id = ?", [id]).d;
    ok((t.match(/CLUSTER-F-A 2026-10-28 \(state\)/g) || []).length === 1, "one state note on " + id);
  }
  ok(one(db, "SELECT description d FROM agent_issues WHERE id = 999999").d === "base text", "an issue outside the list is untouched");
  const before = JSON.stringify(db.prepare("SELECT * FROM agent_issues ORDER BY id").all());
  db.exec(sql);
  ok(JSON.stringify(db.prepare("SELECT * FROM agent_issues ORDER BY id").all()) === before, "a replay appends nothing");
}
{
  const db = fresh({ noTick: true });
  db.exec(sql);
  ok(one(db, "SELECT status FROM agent_issues WHERE id = 1000599").status === "open", "1000599 stays open before a tick carries a retention report");
}
{
  const db = fresh({ noColumn: true });
  db.exec(sql);
  ok(one(db, "SELECT status FROM agent_issues WHERE id = 1000599").status === "open", "1000599 stays open while the column is absent (the deploy has not run)");
}
{
  const rb = hdr.find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length);
  const d = fresh();
  const snap = (x) => JSON.stringify([x.prepare("SELECT * FROM remediation_contracts").all(), x.prepare("SELECT id, description FROM agent_issues ORDER BY id").all()]);
  const s0 = snap(d);
  d.exec(sql);
  d.exec(rb);
  ok(snap(d) === s0 && one(d, "SELECT status FROM agent_issues WHERE id = 1000599").status === "open", "the Rollback line restores contracts, descriptions and reopens 1000599");
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
