// SPEND-DOWNGRADE-INCONCLUSIVE-1 registry migration suite: applies migrations/2026-10-19-calibration-ping-swapped.sql on SQLite.
// Proves: the failure mode and its detector name each other and the detector is one literal d1-query read (no write keyword, no semicolon, no LIKE) that returns
// expected and observed; the detector reads 0 with no rows and with only rows of other probes or other statuses, counts distinct models whose probe = model row reads
// downgraded, ignores a row from before the qnfo-ai 5.37.0 deploy (the floor that keeps the contract from failing at birth, read 6 without it and 0 with it on 2026-10-19
// 23:08Z), ignores a row older than the 150 minute lookback, and counts a row inside it; a second apply changes nothing and keeps one decision_log row with a prediction in
// the parsed form; the Rollback header removes the two registry rows and leaves decision_log alone; the file passes apply_migrations --check.
// The probe is read at pinned instants by replacing the one 'now' it contains, so the floor and the lookback are tested at fixed times; one case reads it unmodified
// against the real clock.
// Run: node migrations/calibration-ping-swapped.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const mig = readFileSync(new URL("./2026-10-19-calibration-ping-swapped.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '', verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', module TEXT, next_due_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE ai_calibration_results (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, ts INTEGER, probe TEXT, target TEXT, status TEXT, latency_ms INTEGER, detail TEXT);
`);
db.exec(mig);

const fm = db.prepare("SELECT * FROM failure_modes WHERE fm_key = 'calibration-ping-swapped'").get();
const det = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-calibration-ping-swapped'").get();
ok(fm && det && fm.probe_class === det.class && fm.issue_id === 100238 && fm.first_seen === "2026-10-19", "the failure mode names its detector and issue 100238", fm);
ok(det.verify_transport === "d1-query" && det.status === "active" && det.module === "failure-mode" && det.expected_cadence_h === 1 && det.issue_id === null && det.escalate_to === "qnfo-ai-calibration", "the detector is an active hourly d1-query failure-mode contract owned by qnfo-ai-calibration", det);
for (const col of ["failure_mode", "root_cause", "remediation", "detector", "trigger_condition", "symptom", "blast_radius"]) ok(typeof fm[col] === "string" && fm[col].length > 40, "failure mode column " + col + " is filled", fm[col]);
ok(/SPEND-DOWNGRADE-INCONCLUSIVE-1/.test(fm.remediation) && /5\.37\.0/.test(fm.remediation) && /1\.6\.4/.test(fm.remediation), "the remediation names the fix and both versions");
ok(/150 minutes/.test(fm.detector) && /60 minutes/.test(fm.detector) && !/\b(hours?|days?)\b/.test(fm.detector.replace(/24 h roster/g, "")), "the detector text states its lookback and cadence in minutes", fm.detector);

const probe = det.verify_probe;
const low = " " + probe.toLowerCase().replace(/\s+/g, " ") + " ";
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
const RT_WRITE_KW = ["insert ", "update ", "delete ", "drop ", "alter ", "create ", "attach ", "detach ", "pragma ", "replace ", "vacuum", "reindex"];
ok(/^ select /.test(low) && low.indexOf(";") === -1 && !WRITE_KW.some((w) => low.indexOf(w) !== -1) && !RT_WRITE_KW.some((w) => low.indexOf(" " + w) !== -1), "the detector is one literal read free of the write keywords");
ok(!/\blike\b/i.test(probe), "no LIKE literal, so D1's 50 byte limit cannot apply");
ok(/ AS expected\b/.test(probe) && / AS observed$/.test(probe), "the probe returns expected and observed by name, as the consumer reads them");
const lookbackS = Number((/- (\d+)\) \* 1000/.exec(probe) || [])[1]);
ok(lookbackS === 9000 && lookbackS / 60 === 150, "the lookback is 9000 seconds, 150 minutes", lookbackS);
const FLOOR = Number((/, (\d{13})\)\)/.exec(probe) || [])[1]);
ok(FLOOR === 1792448295000 && new Date(FLOOR).toISOString() === "2026-10-19T22:18:15.000Z", "the floor is the qnfo-ai 5.37.0 deploy, 2026-10-19T22:18:15Z", FLOOR);

// read the probe at a pinned instant: the one 'now' it contains becomes that datetime
const nowTokens = probe.split("'now'").length - 1;
ok(nowTokens === 1, "the probe has exactly one 'now' to pin", nowTokens);
const at = (iso) => { const r = db.prepare(probe.replace("'now'", "'" + iso.replace("T", " ").replace("Z", "") + "'")).get(); return { e: String(r.expected), o: String(r.observed) }; };
const realNow = () => { const r = db.prepare(probe).get(); return { e: String(r.expected), o: String(r.observed) }; };
const ms = (iso) => Date.parse(iso);
const clear = () => db.exec("DELETE FROM ai_calibration_results");
const add = (target, tsMs, status = "downgraded", p = "model") => db.prepare("INSERT INTO ai_calibration_results (run_id, ts, probe, target, status, latency_ms, detail) VALUES ('r', ?, ?, ?, ?, 100, ?)").run(tsMs, p, target, status, status === "downgraded" ? "downgraded to glm-5.3-flash" : "ok");

const T1 = "2026-10-19T23:08:00Z"; // the read of 2026-10-19, 50 minutes after the deploy
ok(JSON.stringify(at(T1)) === JSON.stringify({ e: "0", o: "0" }), "reads 0 on an empty table", at(T1));
add("kimi-k2.6", ms("2026-10-19T22:30:30Z"), "pass"); add("glm-5.3", ms("2026-10-19T22:30:30Z"), "fail"); add("gpt-oss-120b", ms("2026-10-19T22:30:30Z"), "downgraded", "model-budget"); add("gpt-oss-120b", ms("2026-10-19T22:30:30Z"), "downgraded", "vision");
ok(at(T1).o === "0", "a pass, a fail and a downgraded row of another probe are not counted", at(T1));

// the six swapped rows of the 22:00:31Z sweep, before the deploy
clear();
for (const m of ["kimi-k2.6", "kimi-k2.7-code", "gpt-oss-120b", "glm-5.3", "deepseek-v4-pro-wa", "deepseek-v4-flash-wa"]) add(m, ms("2026-10-19T22:00:31Z"));
ok(at(T1).o === "0", "the six swapped rows of 22:00:31Z, inside the lookback and before the deploy, are not counted (the birth reading: 0)", at(T1));
const noFloor = db.prepare(probe.replace("'now'", "'2026-10-19 23:08:00'").replace(String(FLOOR), "0")).get();
ok(String(noFloor.observed) === "6", "without the floor the same rows read 6, so the floor is what keeps the contract from failing at birth", noFloor);
add("kimi-k2.6", FLOOR); add("glm-5.3", FLOOR - 1);
ok(at(T1).o === "0", "a row at the floor itself, or before it, is not counted (ts must be after the deploy)", at(T1));
add("kimi-k2.6", FLOOR + 1);
ok(at(T1).o === "1", "a row 1 ms after the deploy is counted", at(T1));

// after the deploy: a swap at the next full sweep
clear();
add("kimi-k2.6", ms("2026-10-19T22:30:30Z"));
ok(at(T1).o === "1", "one swapped row after the deploy and inside the lookback reads 1", at(T1));
add("kimi-k2.6", ms("2026-10-19T22:45:00Z"));
ok(at(T1).o === "1", "the same model swapped twice counts once (distinct models)", at(T1));
add("glm-5.3", ms("2026-10-19T22:50:00Z"));
ok(at(T1).o === "2", "a second model counts", at(T1));
ok(at(T1).e === "0", "expected stays the literal 0", at(T1));

// the lookback, with the floor out of the way (the sweep of 2026-10-20T00:00:31Z has a 02:00Z read)
clear();
const T2 = "2026-10-20T02:00:00Z";
add("kimi-k2.6", ms("2026-10-19T22:50:00Z")); // 190 minutes old
add("glm-5.3", ms("2026-10-19T23:25:00Z")); // 155 minutes old
ok(at(T2).o === "0", "rows 190 and 155 minutes old are outside the 150 minute lookback", at(T2));
add("gpt-oss-120b", ms("2026-10-19T23:35:00Z")); // 145 minutes old
ok(at(T2).o === "1", "a row 145 minutes old is inside the lookback", at(T2));
add("kimi-k2.7-code", ms("2026-10-20T00:00:31Z")); // the first full sweep after the deploy
ok(at(T2).o === "2", "a swapped row of the first full sweep after the deploy is counted", at(T2));
clear();
add("kimi-k2.6", ms("2026-10-19T22:19:00Z")); // 1 minute 45 seconds after the deploy
ok(at("2026-10-20T00:48:00Z").o === "1" && at("2026-10-20T00:50:00Z").o === "0", "the lookback takes over from the floor after 00:48:15Z: the 22:19:00Z row is counted at 00:48:00Z and not at 00:50:00Z", [at("2026-10-20T00:48:00Z"), at("2026-10-20T00:50:00Z")]);

// the unmodified probe on the real clock (any run after the deploy is past the floor)
clear();
ok(JSON.stringify(realNow()) === JSON.stringify({ e: "0", o: "0" }), "the unmodified probe reads 0 on an empty table", realNow());
add("kimi-k2.6", Date.now() - 60000);
ok(realNow().o === "1", "the unmodified probe counts a swapped row from a minute ago", realNow());
add("glm-5.3", Date.now() - 200 * 60000);
ok(realNow().o === "1", "the unmodified probe ignores a row 200 minutes old", realNow());
clear();

// replay and decision_log
const snap = () => JSON.stringify([db.prepare("SELECT * FROM failure_modes").all(), db.prepare("SELECT * FROM remediation_contracts").all(), db.prepare("SELECT * FROM decision_log").all()]);
const s1 = snap();
db.exec(mig);
ok(s1 === snap(), "a second apply changes nothing");
const dl = db.prepare("SELECT * FROM decision_log").all();
ok(dl.length === 1 && /^SPEND-DOWNGRADE-INCONCLUSIVE-1: /.test(dl[0].action), "one decision_log row whose action begins SPEND-DOWNGRADE-INCONCLUSIVE-1:", dl.map((r) => r.action.slice(0, 60)));
const d = dl[0];
for (const col of ["actor", "assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "reach_gain", "surfaces_tested"]) ok(typeof d[col] === "string" && d[col].length > 0, "decision_log column " + col + " is filled", d[col]);
ok(/^[a-z_0-9]+ (<|<=|>|>=|=) \d+ within \d+ h$/.test(d.predicted_outcome), "the prediction is in the parsed form <metric> <op> <number> within <N> h", d.predicted_outcome);
ok(/1\.6\.3/.test(d.rollback_path) && /budget_probe = off/.test(d.rollback_path), "the rollback path names the revert to 1.6.3 and the budget_probe switch", d.rollback_path);
ok(/^session_01QpQv19uh1padRwZ3u1r766/.test(d.actor), "the actor is this session", d.actor);

// rollback header
const rbLines = mig.split("\n").filter((l) => l.startsWith("-- Rollback: "));
ok(rbLines.length === 1, "exactly one Rollback header line", rbLines.length);
const rb = rbLines[0].slice("-- Rollback: ".length);
ok(!/decision_log/i.test(rb), "the Rollback never touches decision_log");
db.exec(rb);
ok(db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 0 && db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts").get().n === 0, "the Rollback header removes the failure mode and its detector");
ok(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "decision_log keeps its row after the rollback (append-only)");
db.exec(mig);
ok(db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 1 && db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts").get().n === 1 && db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "re-applying after a rollback restores the two rows and does not add a second decision_log row");

const chk = spawnSync("python3", [fileURLToPath(new URL("../scripts/apply_migrations.py", import.meta.url)), "--check", fileURLToPath(new URL("./2026-10-19-calibration-ping-swapped.sql", import.meta.url))], { encoding: "utf8" });
ok(chk.status === 0 && /"ok": true/.test(chk.stdout), "the file passes scripts/apply_migrations.py --check", chk.stdout + chk.stderr);
console.log("calibration-ping-swapped: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
