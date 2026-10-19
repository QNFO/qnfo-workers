// SLA-STAGES-1 offline suite: replays migrations/2026-10-19-sla-stage-columns.sql twice on SQLite against the live v_sla_compliance
// (read from migrations/2026-10-17-path-enforcement.sql, equal to qnfo-audit by length on 2026-10-19). Proves: the nine existing columns keep
// their names, positions and values on the same rows (state and queue_state rules and the 120-minute sla_min unchanged); three columns are
// appended to both processes (propose_wait_minutes, work_minutes, recent_24h_minutes) and split a code task's minutes into the wait before
// its PR and the merge lane; rows merged more than a day ago are outside recent_24h_minutes, which is NULL when nothing finished; the issue
// 2827 contract probe measures the SLA (pending with the split, ok when state and queue_state are ok, ok when the issue is closed, and
// stops on a DoD worklist that is not empty); the file is idempotent and keeps the replaced view and probe in its backup.
// SLA_STAGES_SQL=<path> replays another file (an empty one shows the suite failing on the base).
// Run: node migrations/sla-stage-columns.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const sql = readFileSync(process.env.SLA_STAGES_SQL || here("2026-10-19-sla-stage-columns.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];

function viewDdl(file, name) {
  const t = readFileSync(here(file), "utf8");
  const at = t.search(new RegExp("^CREATE VIEW (?:IF NOT EXISTS )?" + name + "\\s+AS", "m"));
  if (at < 0) throw new Error(name + " not found in " + file);
  let q = false, i = at;
  for (; i < t.length; i++) { const c = t[i]; if (c === "'") q = !q; else if (c === ";" && !q) break; }
  return t.slice(at, i);
}
const OLD_VIEW = viewDdl("2026-10-17-path-enforcement.sql", "v_sla_compliance");
// the generic loop template live on issue-2827's contract (read from qnfo-audit on 2026-10-19): it tests the issue's age, not the SLA
const OLD_PROBE = "SELECT 'ok' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = 2827) <> 'open' THEN 'ok' WHEN (SELECT created_at FROM agent_issues WHERE id = 2827) > (CAST(strftime('%s', 'now') AS INTEGER) - 172800) * 1000 THEN 'pending: filed by qnfo-fleet-control, which owns it for 48h' ELSE 'stale' END AS observed";

// one frozen clock for every fixture, so the base and migrated databases (two build() calls) hold identical timestamps: a whole-minute span such as
// R1's 120 minutes of work reads 119 or 120 in worst_step_minutes (MAX(CAST(minutes AS INTEGER))) when each build samples Date.now() separately
const NOW = Date.now();
const at = (minAgo, iso) => { const d = new Date(NOW - minAgo * 6e4); return iso ? d.toISOString() : d.toISOString().slice(0, 19).replace("T", " "); };

function build(withMigration) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, claimed_at TEXT, created_at TEXT, published_at TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, created_at TEXT NOT NULL, updated_at TEXT, pr_opened_at TEXT, merged_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, status TEXT, created_at INTEGER);
CREATE TABLE process_dod (process TEXT);
CREATE VIEW v_process_contract_dod_worklist AS SELECT process FROM process_dod;
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT NOT NULL, status TEXT, ts TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
  db.exec(OLD_VIEW);
  db.exec("CREATE VIEW v_sla_instrument_coverage AS SELECT process FROM v_sla_compliance");
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, status) VALUES ('issue-2827', 2827, ?, 'active')").run(OLD_PROBE);
  db.prepare("INSERT INTO agent_issues (id, status, created_at) VALUES (2827, 'open', ?)").run(NOW - 5 * 864e5);
  // code tasks (live formats: created 'YYYY-MM-DD hh:mm:ss', PR and merge ISO)
  //  A: created 600 min ago, PR 100 min ago, merged 90 min ago   -> total 510, wait 500, lane 10, inside 24 h
  //  B: created 3 days ago, PR 20 min later, merged 10 min later  -> total 30,  wait 20,  lane 10, outside 24 h
  //  C: merged 10 days ago (outside the 7 days)   D: not merged
  const ct = db.prepare("INSERT INTO code_tasks (id, status, created_at, pr_opened_at, merged_at) VALUES (?, ?, ?, ?, ?)");
  ct.run("A", "merged", at(600), at(100, true), at(90, true));
  ct.run("B", "merged", at(4320), at(4300, true), at(4290, true));
  ct.run("C", "merged", at(14500), at(14490, true), at(14480, true));
  ct.run("D", "queued", at(300), null, null);
  // research: R1 created 300 min ago, claimed 180 ago, published 60 ago -> total 240, wait 120, work 120, inside 24 h
  //           R2 created 3 days ago, claimed 1 min later, published 100 min later -> total 100, wait 1, work 99, outside 24 h
  const rq = db.prepare("INSERT INTO research_queue (id, status, claimed_at, created_at, published_at) VALUES (?, 'published', ?, ?, ?)");
  rq.run("R1", at(180, true), at(300, true), at(60, true));
  rq.run("R2", at(4319, true), at(4320, true), at(4220, true));
  if (withMigration) db.exec(sql);
  return db;
}
const q = (db, s, ...a) => db.prepare(s).all(...a);
const one = (db, s, ...a) => db.prepare(s).get(...a);
const near = (a, b, tol = 0.6) => typeof a === "number" && Math.abs(a - b) <= tol;
const byProc = (db) => Object.fromEntries(q(db, "SELECT * FROM v_sla_compliance").map((r) => [r.process, { ...r }]));

const base = build(false);
const old = byProc(base);
const OLD_COLS = ["process", "finished_7d", "queue_minutes", "step_minutes", "worst_step_minutes", "sla_min", "state", "queue_state", "measurement"];
ok(Object.keys(old["code-task-merge"]).join() === OLD_COLS.join(), "base: v_sla_compliance has the nine columns", Object.keys(old["code-task-merge"]));
ok(old["code-task-merge"].finished_7d === 2 && near(old["code-task-merge"].queue_minutes, 270) && old["code-task-merge"].queue_minutes === old["code-task-merge"].step_minutes, "base: code-task-merge queue and step are the same clock (mean of 510 and 30)", old["code-task-merge"]);

const db = build(true);
const nw = byProc(db);
const cm = nw["code-task-merge"], rp = nw["research-publish"];
ok(Object.keys(cm).join() === OLD_COLS.concat(["propose_wait_minutes", "work_minutes", "recent_24h_minutes"]).join(), "the nine columns keep their positions and three are appended", Object.keys(cm));
ok(OLD_COLS.every((k) => old["code-task-merge"][k] === cm[k] && old["research-publish"][k] === rp[k]), "every existing column keeps its value for both processes", { old, nw });
ok(cm.sla_min === 120 && rp.sla_min === 120 && cm.state === "breach" && cm.queue_state === "breach" && rp.state === "ok" && rp.queue_state === "breach", "sla_min stays 120 and the state rules give the same verdicts", [cm, rp]);
ok(near(cm.propose_wait_minutes, 260) && near(cm.work_minutes, 10) && near(cm.recent_24h_minutes, 510), "code-task-merge: wait before the PR 260, merge lane 10, last 24 h 510 (only task A)", cm);
ok(near(cm.propose_wait_minutes + cm.work_minutes, cm.queue_minutes), "the two stages add up to the end-to-end minutes", cm);
ok(near(rp.propose_wait_minutes, 60.5) && near(rp.work_minutes, 109.5) && near(rp.recent_24h_minutes, 240) && near(rp.work_minutes, rp.step_minutes), "research-publish: wait before the claim 60.5, work 109.5 (= step_minutes), last 24 h 240 (only R1)", rp);
ok(cm.measurement === old["code-task-merge"].measurement, "the measurement text is untouched");
// a row older than a day leaves recent_24h_minutes, and nothing finished means NULL rather than 0
db.exec("UPDATE code_tasks SET created_at = '" + at(4500) + "', pr_opened_at = '" + at(4400, true) + "', merged_at = '" + at(4300, true) + "' WHERE id = 'A'; UPDATE research_queue SET created_at = '" + at(4600, true) + "', claimed_at = '" + at(4500, true) + "', published_at = '" + at(4220, true) + "' WHERE id = 'R1'");
const aged = byProc(db);
ok(aged["code-task-merge"].recent_24h_minutes === null && aged["research-publish"].recent_24h_minutes === null, "with nothing finished in the last 24 hours recent_24h_minutes is NULL", aged);
// a merged task without a PR timestamp counts in the end-to-end minutes and is left out of the stage means
db.exec("INSERT INTO code_tasks (id, status, created_at, pr_opened_at, merged_at) VALUES ('E', 'merged', '" + at(200) + "', NULL, '" + at(10, true) + "')");
const e = byProc(db)["code-task-merge"];
ok(e.finished_7d === 3 && near(e.queue_minutes, 140) && near(e.propose_wait_minutes, 60) && near(e.work_minutes, 55), "a merge with no PR time counts in finished_7d and queue_minutes (200, 30, 190) and not in the stage means (60 and 55)", e);

// ---- the probe of issue 2827
const probe = one(db, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'issue-2827'").p;
ok(probe !== OLD_PROBE && probe.startsWith("SELECT 'ok' AS expected"), "the contract probe was replaced and still expects ok");
const low = probe.toLowerCase();
ok(!probe.includes(";") && WRITE_KW.every((k) => !low.includes(k)), "the probe is a single read-only SELECT the consumer accepts");
const fresh = build(true);
let r = one(fresh, probe);
ok(r.expected === "ok" && /^pending: code-task-merge breach\/breach 270(\.0)? min vs 120, wait before PR 260(\.0)?/.test(r.observed) && /merge lane 10(\.0)?, finished in last 24h 510(\.0)?$/.test(r.observed), "breach: pending with the split", r);
ok(one(fresh, OLD_PROBE).observed.startsWith("stale") || one(fresh, OLD_PROBE).observed.startsWith("pending"), "base: the old template never looked at the SLA (it reads the issue's age)");
fresh.exec("INSERT INTO process_dod VALUES ('x')");
ok(one(fresh, probe).observed === "dod-worklist-nonzero", "a DoD that is still intent keeps the probe from passing");
fresh.exec("DELETE FROM process_dod; DELETE FROM code_tasks WHERE id IN ('A', 'B'); INSERT INTO code_tasks (id, status, created_at, pr_opened_at, merged_at) VALUES ('F', 'merged', '" + at(60) + "', '" + at(40, true) + "', '" + at(30, true) + "')");
ok(one(fresh, probe).observed === "ok" && byProc(fresh)["code-task-merge"].state === "ok", "state and queue_state ok: the probe reads ok", one(fresh, probe));
fresh.exec("DELETE FROM code_tasks");
ok(one(fresh, probe).observed === "no-merges-in-window", "no merge in the window is not read as a pass of the SLA", one(fresh, probe));
fresh.exec("UPDATE agent_issues SET status = 'closed' WHERE id = 2827");
ok(one(fresh, probe).observed === "ok", "a closed issue reads ok, as the template did (the close is bound to the probe elsewhere)");
// the end-to-end clock gates the probe, not only the step clock: queue_state breach with state ok must not pass
const split = build(true);
split.exec("DROP VIEW v_sla_instrument_coverage; DROP VIEW v_sla_compliance");
split.exec("CREATE VIEW v_sla_compliance AS SELECT 'code-task-merge' AS process, 1 AS finished_7d, 300.0 AS queue_minutes, 50.0 AS step_minutes, 90 AS worst_step_minutes, 120 AS sla_min, 'ok' AS state, 'breach' AS queue_state, 'm' AS measurement, 250.0 AS propose_wait_minutes, 50.0 AS work_minutes, 300.0 AS recent_24h_minutes");
ok(/^pending: code-task-merge ok\/breach/.test(one(split, probe).observed), "state ok with queue_state breach is still pending", one(split, probe));

// ---- replay, backup, bookkeeping
const snap = (d) => JSON.stringify([q(d, "SELECT sql FROM sqlite_master WHERE name = 'v_sla_compliance'"), q(d, "SELECT class, verify_probe FROM remediation_contracts"), q(d, "SELECT action FROM decision_log")]);
const rep = build(true);
const s1 = snap(rep);
rep.exec(sql);
ok(snap(rep) === s1, "a second replay changes nothing");
const bk = q(rep, "SELECT kind, v FROM bak_20261019_v_sla_compliance ORDER BY kind");
ok(bk.length === 2 && bk[0].v === OLD_PROBE && bk[1].v === OLD_VIEW, "the backup keeps the replaced view and probe after the second replay", bk.map((x) => x.kind));
ok(one(rep, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'SLA-STAGES-1:') = 1").n === 1, "one decision_log row after two replays");
ok(q(rep, "SELECT process FROM v_sla_instrument_coverage").length === 2, "the dependent coverage view still reads both processes");
const body = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
ok(!/(CREATE|DROP)\s+(TEMP\s+)?TRIGGER|analytics_metric_triggers|queue_sla\b|control_registry|fleet_budget/i.test(body), "no trigger, threshold, queue_sla or control_registry row is written");
ok(/^-- APPLY-BY: ci/m.test(sql) && /^-- DB: qnfo-audit/m.test(sql) && /^-- BACKUP: bak_20261019_v_sla_compliance/m.test(sql) && /^-- Rollback:/m.test(sql), "the header carries APPLY-BY, DB, BACKUP and Rollback");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
