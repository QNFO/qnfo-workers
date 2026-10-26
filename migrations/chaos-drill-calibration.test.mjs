// CHAOS-DRILL-CALIBRATION-1 offline suite: migrations/2026-10-26-chaos-drill-calibration.sql recalibrates four drill probes. Proves, by running the probes the migration STORES
// (read back from control_alternate_probes after it applies) against crafted qnfo-audit data:
//  * ops-jobs-payload-redaction: a user-typed payload (origin NULL or any origin but budget-promote) holding a login link or a one-time code still fires, whichever of the eight
//    phrase shapes; a budget-promote source bundle that merely mentions the phrase does not; a terminal row older than 15 days still fires; clean data reads ok;
//  * research-floor-rearm: no longer fails for a missing bak table, still fires for a bad park_rearm value and for no park-rearm-tick in 48 hours;
//  * evolve-wip-recovery and research-quality-gate get probes that fire when their evidence is absent and read ok when it is present;
//  * a second apply changes nothing, a probe someone has since changed is left alone, the Rollback line restores the two edited probes and removes the two added ones,
//    and the file adds no trigger and no DELETE or DROP.
// Run: node --no-warnings migrations/chaos-drill-calibration.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-chaos-drill-calibration.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];

const OLD_OPS = "SELECT 'ok' AS expected, CASE WHEN EXISTS (SELECT 1 FROM ops_jobs WHERE payload LIKE '%one-time code%') THEN 'old ops probe' ELSE 'ok' END AS observed";
const OLD_RF = "SELECT 'ok' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'bak_20261019_research_parked') THEN 'old rf probe' ELSE 'ok' END AS observed";
const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();
const day = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);

function build(pre = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, window_note TEXT, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE ops_jobs (id TEXT PRIMARY KEY, status TEXT, payload TEXT, origin TEXT, updated_at TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE TABLE cloud_ops_events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, ts TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, updated_at TEXT);
CREATE TABLE quality_scores (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, slug TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
  const ins = db.prepare("INSERT INTO control_alternate_probes (control, probe_sql, window_note, enabled, last_run_at, last_pass, last_observed) VALUES (?, ?, 'old note', 1, '2026-10-26T07:01:00Z', 0, 'old')");
  ins.run("ops-jobs-payload-redaction", pre.ops ?? OLD_OPS);
  ins.run("research-floor-rearm", pre.rf ?? OLD_RF);
  return db;
}
const probe = (db, control) => db.prepare("SELECT probe_sql FROM control_alternate_probes WHERE control = ?").get(control).probe_sql;
const observed = (db, control) => db.prepare(probe(db, control)).get().observed;
const job = (db, id, o) => db.prepare("INSERT INTO ops_jobs (id, status, payload, origin, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, o.status ?? "succeeded", o.payload, o.origin ?? null, o.updated ?? iso(30));
const clear = (db) => { for (const t of ["ops_jobs", "ops_config", "cloud_ops_events", "code_tasks", "quality_scores"]) db.exec("DELETE FROM " + t); };

// fresh apply
let db = build();
db.exec(sql);
ok(db.prepare("SELECT COUNT(*) n FROM control_alternate_probes").get().n === 4, "two probes are edited and two are added");
ok(db.prepare("SELECT COUNT(*) n FROM bak_20261026_control_alt_probes_calib").get().n === 2 && db.prepare("SELECT probe_sql FROM bak_20261026_control_alt_probes_calib WHERE control = 'research-floor-rearm'").get().probe_sql === OLD_RF, "the two edited probes are saved first");
ok(db.prepare("SELECT enabled, last_run_at FROM control_alternate_probes WHERE control = 'evolve-wip-recovery'").get().enabled === 1 && db.prepare("SELECT last_run_at FROM control_alternate_probes WHERE control = 'research-quality-gate'").get().last_run_at === null, "the added probes are enabled and have not run");
ok(!/\bCREATE\s+TRIGGER\b/i.test(sql) && !/^\s*(DELETE|DROP)\b/im.test(sql.replace(/^--.*$/gm, "")), "no trigger, no DELETE or DROP in the body");
ok(db.prepare("SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'CHAOS-DRILL-CALIBRATION-1:') = 1").get().n === 1, "one decision is logged");
ok(!/budget-promote/.test(OLD_OPS) && /COALESCE\(origin, ''\) <> 'budget-promote'/.test(probe(db, "ops-jobs-payload-redaction")), "the stored ops probe skips origin budget-promote");

// 1. ops-jobs-payload-redaction
const OPS = "ops-jobs-payload-redaction";
clear(db);
ok(observed(db, OPS) === "ok", "no ops_jobs rows: ok");
job(db, "src1", { origin: "budget-promote", payload: "/* 3.1.4 OWNER-OTP-1: owner login by emailed one-time code for chat, REST and MCP */ ".repeat(50) });
job(db, "src2", { origin: "budget-promote", payload: "cf auth login prints a link and a one-time code, then opens the browser; a verification code is typed back; magic-link; /login?token=${t}" });
job(db, "short", { origin: null, payload: "please summarise the open issues" });
ok(observed(db, OPS) === "ok", "source bundles that mention the phrases and a clean user-typed row read ok (the false positive of 2026-10-26)", observed(db, OPS));
for (const [i, p] of ["sign in at https://x.example/login?token=abc123", "open https://x.example/verify?token=zzz", "https://x.example/reset?token=q", "my verification code is 123456", "the one-time code is 654321", "here is the magic-link", "the magic_link was pasted", "login code 111222"].entries()) {
  clear(db);
  job(db, "u" + i, { origin: null, payload: p });
  ok(observed(db, OPS).startsWith("a stored ops_jobs payload still holds"), "a user-typed payload (origin NULL) with a leak shape still fires: " + p.slice(0, 32), observed(db, OPS));
}
clear(db);
job(db, "chat1", { origin: "chat", payload: "the one-time code is 654321" });
ok(observed(db, OPS).startsWith("a stored ops_jobs payload still holds"), "any origin other than budget-promote is still scanned", observed(db, OPS));
clear(db);
job(db, "old1", { origin: "budget-promote", status: "succeeded", payload: "x", updated: iso(16 * 1440) });
ok(observed(db, OPS).startsWith("a terminal ops_jobs row is older than 15 days"), "a terminal row older than 15 days still fires", observed(db, OPS));
clear(db);
job(db, "old2", { origin: null, status: "queued", payload: "x", updated: iso(16 * 1440) });
ok(observed(db, OPS) === "ok", "a queued row is not a terminal row", observed(db, OPS));

// 2. research-floor-rearm
const RF = "research-floor-rearm";
clear(db);
db.prepare("INSERT INTO cloud_ops_events (kind, ts) VALUES ('park-rearm-tick', ?)").run(iso(60));
ok(!db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'bak_20261019%'").get() && observed(db, RF) === "ok", "no bak_20261019_research_parked table and a recent tick: ok (the false failure of 2026-10-26)", observed(db, RF));
db.prepare("INSERT INTO ops_config VALUES ('park_rearm', 'maybe', 'n', ?)").run(iso(1));
ok(/park_rearm holds a value/.test(observed(db, RF)), "a park_rearm value the sweep does not read still fires", observed(db, RF));
db.exec("UPDATE ops_config SET value = 'off'");
ok(observed(db, RF) === "ok", "park_rearm off is a lever the sweep reads: ok", observed(db, RF));
db.exec("DELETE FROM cloud_ops_events");
db.prepare("INSERT INTO cloud_ops_events (kind, ts) VALUES ('park-rearm-tick', ?)").run(iso(49 * 60));
ok(/no park-rearm-tick event in 48 h/.test(observed(db, RF)), "no tick in 48 hours still fires", observed(db, RF));

// 3. evolve-wip-recovery
const EV = "evolve-wip-recovery";
clear(db);
ok(/not draining/.test(observed(db, EV)), "no code task at all fires", observed(db, EV));
db.prepare("INSERT INTO code_tasks VALUES ('a', 'failed', ?), ('b', 'queued', ?), ('c', 'merged', ?)").run(iso(10), iso(10), iso(25 * 60));
ok(/not draining/.test(observed(db, EV)), "only failed and queued tasks in 24 hours and an old merge fires", observed(db, EV));
db.prepare("INSERT INTO code_tasks VALUES ('d', 'published', ?)").run(iso(60));
ok(observed(db, EV) === "ok", "a task published an hour ago: ok", observed(db, EV));
db.exec("DELETE FROM code_tasks");
db.prepare("INSERT INTO code_tasks VALUES ('e', 'merged', ?)").run(iso(23 * 60));
ok(observed(db, EV) === "ok", "a task merged 23 hours ago: ok", observed(db, EV));

// 4. research-quality-gate
const RQ = "research-quality-gate";
clear(db);
ok(/wrote no quality_scores snapshot/.test(observed(db, RQ)), "no snapshot fires", observed(db, RQ));
db.prepare("INSERT INTO quality_scores (ts, slug) VALUES (?, 'p')").run(day(3));
ok(/wrote no quality_scores snapshot/.test(observed(db, RQ)), "a three-day-old snapshot fires", observed(db, RQ));
db.prepare("INSERT INTO quality_scores (ts, slug) VALUES (?, 'p')").run(day(1));
ok(observed(db, RQ) === "ok", "a snapshot from yesterday (the midnight edge) is ok", observed(db, RQ));
db.exec("DELETE FROM quality_scores");
db.prepare("INSERT INTO quality_scores (ts, slug) VALUES (?, 'p')").run(day(0));
ok(observed(db, RQ) === "ok", "today's snapshot is ok", observed(db, RQ));

// second apply changes nothing
db.prepare("UPDATE control_alternate_probes SET last_run_at = '2026-10-26T13:01:00Z', last_pass = 1 WHERE control = 'evolve-wip-recovery'").run();
const snap = JSON.stringify([db.prepare("SELECT * FROM control_alternate_probes ORDER BY control").all(), db.prepare("SELECT COUNT(*) n FROM decision_log").get(), db.prepare("SELECT * FROM bak_20261026_control_alt_probes_calib ORDER BY control").all()]);
db.exec(sql);
ok(JSON.stringify([db.prepare("SELECT * FROM control_alternate_probes ORDER BY control").all(), db.prepare("SELECT COUNT(*) n FROM decision_log").get(), db.prepare("SELECT * FROM bak_20261026_control_alt_probes_calib ORDER BY control").all()]) === snap, "a second apply changes no row and keeps the first backup");

// a probe someone changed since is left alone
db = build({ ops: "SELECT 'ok' AS expected, 'ok' AS observed", rf: "SELECT 'ok' AS expected, 'ok' AS observed" });
db.exec(sql);
ok(probe(db, OPS) === "SELECT 'ok' AS expected, 'ok' AS observed" && probe(db, RF) === "SELECT 'ok' AS expected, 'ok' AS observed", "a probe that no longer has the old shape is not overwritten");
db = build({ ops: OLD_OPS + " -- already has budget-promote" });
db.exec(sql);
ok(probe(db, OPS).endsWith("already has budget-promote"), "an ops probe that already mentions budget-promote is not edited again");

// rollback
db = build();
db.exec(sql);
db.exec(rollback);
ok(probe(db, OPS) === OLD_OPS && probe(db, RF) === OLD_RF && db.prepare("SELECT window_note FROM control_alternate_probes WHERE control = 'research-floor-rearm'").get().window_note === "old note", "the Rollback line restores both edited probes and their notes");
ok(db.prepare("SELECT COUNT(*) n FROM control_alternate_probes WHERE control IN ('evolve-wip-recovery', 'research-quality-gate')").get().n === 0, "the Rollback line removes the two added probes that have not run");
db = build();
db.exec(sql);
db.prepare("UPDATE control_alternate_probes SET last_run_at = '2026-10-26T13:01:00Z' WHERE control = 'evolve-wip-recovery'").run();
db.exec(rollback);
ok(db.prepare("SELECT COUNT(*) n FROM control_alternate_probes WHERE control = 'evolve-wip-recovery'").get().n === 1, "a probe that has already run is kept by the Rollback line (its history is evidence)");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
