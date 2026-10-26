// REM-A1-HANDOFF-2 offline suite: replays migrations/2026-10-26-rem-a1-handoff-2.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped, ASCII only); eight named issues get one dated note each (appended once, a replay adds nothing, other issues are
// untouched) and the Rollback line strips exactly those notes; one decision_log row; a replay changes nothing.
// Output MUST contain "0 failed" on success.   node migrations/rem-a1-handoff-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a1-handoff-2.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)) && header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "header opts in with one Rollback line");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(sql) && !/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body) && !/fleet_tick|claude\.ai|anthropic\.com/i.test(sql), "nothing deleted or dropped, decision_log only inserted into");
ok(/^[\x00-\x7F]*$/.test(sql), "the file is ASCII only");
ok([...sql.matchAll(/LIKE\s+'([^']*)'/gi)].every((m) => Buffer.byteLength(m[1]) <= 50), "LIKE patterns stay under 50 bytes");

const MARK = "REM-A1-HANDOFF-2 2026-10-26";
const IDS = [100622, 100629, 1000005, 100615, 1000029, 100624, 2402, 2521];
const DECOYS = [1, 5, 100211, 1000319];
const w = new DatabaseSync(":memory:");
w.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
for (const id of IDS.concat(DECOYS)) w.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, ?, 'test', 'research', 'medium', 'open', 1, 1)").run(id, "issue " + id, "original " + id);
const desc = (id) => w.prepare("SELECT description FROM agent_issues WHERE id = ?").get(id).description;
const before = Object.fromEntries(IDS.concat(DECOYS).map((id) => [id, desc(id)]));
w.exec(sql);
for (const id of IDS) ok(desc(id).startsWith("original " + id + "\n\n" + MARK + " (read ") && desc(id).split(MARK).length === 2, "issue " + id + " has its original text and one dated note", desc(id).slice(0, 120));
for (const id of DECOYS) ok(desc(id) === before[id], "issue " + id + " is untouched");
const has = (id, re) => re.test(desc(id));
for (const id of [100622, 100629]) ok(has(id, /research_ready_cap is 192/) && has(id, /DAILY-BUDGET-SCHEDULE-1/) && has(id, /queued <= 150/), id + ": the probe contradiction and the fixed cause");
ok(has(1000005, /8 papers published in the last 1440 minutes against the 10/) && has(1000005, /PR 4845/), "1000005: the count and the watchdog fixes");
for (const id of [100615, 1000029, 100624]) ok(has(id, /ct_rvnp3b02c956c0/) && has(id, /attempts 3/) && has(id, /did not touch the revise stage/), id + ": the code task, its state and what this session left alone");
ok(has(2402, /PAPER-CONTRACT-1 is not on main/) && has(2402, /10 to 14 calls per writer/), "2402: the cost reason and the missing marker");
ok(has(2521, /issue-2521-radar/) && has(2521, /issue-2521-intent/) && has(2521, /issue-2521-outreach/) && has(2521, /one code-task line/), "2521: the three open items and the next action");
ok(w.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'REM-A1-HANDOFF-2:%'").get().n === 1, "one decision_log row");

const snap = JSON.stringify(w.prepare("SELECT id, description FROM agent_issues ORDER BY id").all());
w.exec(sql);
ok(JSON.stringify(w.prepare("SELECT id, description FROM agent_issues ORDER BY id").all()) === snap && w.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1, "a replay adds no note and no decision row");

w.exec(header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, ""));
for (const id of IDS) ok(desc(id) === before[id], "after Rollback issue " + id + " has its original text", desc(id).slice(0, 80));
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
