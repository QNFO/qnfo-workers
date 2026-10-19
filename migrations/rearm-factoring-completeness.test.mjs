// REARM-FACTORING-COMPLETENESS-1 migration suite (node:sqlite, synthetic rows). Proves that
// migrations/2026-10-19-rearm-factoring-completeness.sql re-arms only the parked factoring remediation row, once, with a backup,
// that applying it twice changes nothing more, that its Rollback line restores the row, and that it logs one decision.
// Run: node migrations/rearm-factoring-completeness.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-rearm-factoring-completeness.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, stage TEXT, error TEXT, recover_count INTEGER DEFAULT 0, terminal_rearms INTEGER DEFAULT 0, attempt INTEGER DEFAULT 0, context TEXT, claimed_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
const P = "PARKED-POISON-1: recover_count exhausted (3); last error: review: 3 HARD findings unresolved after 6 revise cycles (H1,H2,H3)";
const FACT = "rem-9e69ce22-2d14-4d23-9468-cb130b873d86";
const ins = db.prepare("INSERT INTO research_queue (id, status, stage, error, recover_count, terminal_rearms, attempt, context, claimed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
ins.run(FACT, "wontfix", "parked", P, 3, 0, 1, '{"cycles":6,"patch":5,"verifyPass":0}', null);
ins.run("rem-other", "wontfix", "parked", P, 3, 0, 1, null, null);
ins.run("rem-live", "researching", "review", "", 0, 0, 1, null, "2026-10-19T10:00:00Z");
const get = (id) => db.prepare("SELECT * FROM research_queue WHERE id = ?").get(id);
const before = { other: JSON.stringify(get("rem-other")), live: JSON.stringify(get("rem-live")) };
const original = get(FACT);

db.exec(sql);
const r = get(FACT);
ok(r.status === "queued" && r.stage === null && r.recover_count === 0 && r.attempt === 0 && r.terminal_rearms === 1 && r.context === null && r.claimed_at === null, "the parked factoring row is re-armed once and restarts at ground", r);
ok(r.error.startsWith("REARMED 2026-10-19 (REARM-FACTORING-COMPLETENESS-1") && r.error.length <= 300, "the note names the migration and stays within 300 chars", r.error);
ok(JSON.stringify(get("rem-other")) === before.other && JSON.stringify(get("rem-live")) === before.live, "another parked row and a live row are untouched");
const bak = db.prepare("SELECT * FROM bak_20261019_rearm_factoring").all();
ok(bak.length === 1 && bak[0].id === FACT && bak[0].error === P && bak[0].status === "wontfix" && bak[0].terminal_rearms === 0 && bak[0].context === original.context, "the prior state is kept in the backup table", bak);
ok(db.prepare("SELECT count(*) n FROM decision_log WHERE action LIKE 'REARM-FACTORING-COMPLETENESS-1:%'").get().n === 1, "one decision_log row is written");
const dl = db.prepare("SELECT predicted_outcome, rollback_path, capability_gain FROM decision_log").get();
ok(/^\S.* (>=|<=|>|<|=) \d+ within \d+ h$/.test(dl.predicted_outcome) && dl.rollback_path.length > 0 && dl.capability_gain.length > 0, "the decision carries a '<metric> <op> <number> within <N> h' prediction, a rollback and a capability gain", dl);

db.exec(sql);
ok(get(FACT).terminal_rearms === 1 && db.prepare("SELECT count(*) n FROM bak_20261019_rearm_factoring").get().n === 1 && db.prepare("SELECT count(*) n FROM decision_log").get().n === 1, "applying the file twice re-arms and logs nothing twice");

// A row that parks again is not re-armed a second time.
db.prepare("UPDATE research_queue SET status = 'wontfix', stage = 'parked', error = ? WHERE id = ?").run(P, FACT);
db.exec(sql);
ok(get(FACT).status === "wontfix" && get(FACT).terminal_rearms === 1, "a row that parked again after its re-arm is left parked");

// The Rollback header restores the original row.
const rb = /^-- Rollback: (.+)$/m.exec(sql);
ok(!!rb && !/;\s*\S/.test(rb[1].trim().replace(/;$/, "")), "the Rollback line is one statement");
db.exec(rb[1].trim().replace(/;$/, ""));
const back = get(FACT);
ok(back.status === "wontfix" && back.stage === "parked" && back.error === P && back.terminal_rearms === 0 && back.recover_count === 3 && back.attempt === 1 && back.context === original.context, "the Rollback line restores the parked row", back);

// Headers the migration runner requires.
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- BACKUP: bak_20261019_rearm_factoring$/m.test(sql), "APPLY-BY, DB and BACKUP header lines are present");
ok(!/\b(DELETE|DROP)\b/i.test(sql.replace(/^--.*$/gm, "")), "the file deletes and drops nothing");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
