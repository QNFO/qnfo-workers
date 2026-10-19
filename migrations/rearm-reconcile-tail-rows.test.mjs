// REARM-RECONCILE-TAIL-1 migration suite (node:sqlite, synthetic rows). Proves that
// migrations/2026-10-19-rearm-reconcile-tail-rows.sql re-arms only the five named remediation rows parked on the reconcile contract
// refusal, once, with a backup; that applying the file twice re-arms nothing twice; that its Rollback line restores the prior state;
// and that a thin-draft row, an already re-armed row, a live row and an unrelated park are untouched.
// Run: node migrations/rearm-reconcile-tail-rows.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-19-rearm-reconcile-tail-rows.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };

ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- BACKUP: bak_20261019_reconcile_tail_rearm$/m.test(sql) && /^-- Rollback: .+/m.test(sql), "the file opts in with APPLY-BY, DB, BACKUP and a Rollback line");

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, stage TEXT, error TEXT, recover_count INTEGER DEFAULT 0, terminal_rearms INTEGER DEFAULT 0, attempt INTEGER DEFAULT 0, context TEXT, claimed_at TEXT)");
const ins = db.prepare("INSERT INTO research_queue (id, status, stage, error, recover_count, terminal_rearms, attempt, context, claimed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
const P = "PARKED-POISON-1: recover_count exhausted (3); last error: ";
const R = "reconcile: invalid paper contract: missing: Discussion, Practical, Conclusion";
const named = ["rem-5311e867-c7f0-4559-a58c-bfefc49705c6", "rem-90c03612-96cf-457b-aa5f-7a5f5fdf132f", "rem-cb30180a-e2fd-4198-8c27-f247f0db7cce", "rem-c7f5832b-a057-47e5-b67a-5e0d6d6259ac", "rem-3f9c61f3-63c7-42f5-a99b-3a06d5e2d716"];
for (const id of named) ins.run(id, "wontfix", "parked", P + R, 3, 0, 1, '{"pipeline":"0.8.0-artifact-deposit","bibCount":12}', "2026-10-18T10:00:00Z");
ins.run("rem-90c03612-extra", "wontfix", "parked", P + R, 3, 0, 1, null, null);                                     // same error, not named
ins.run("db5dc635-d7d5-471a-aae7-fd2e5bba318d", "wontfix", "parked", P + "reconcile: invalid paper contract", 3, 0, 1, null, null); // thin draft, not named
ins.run("77ddda46-f30c-4692-8135-f828593cb3bc", "wontfix", "parked", P + "reconcile: invalid paper contract", 6, 1, 1, null, null); // already re-armed once
const rearmedOnce = "rem-cb30180a-e2fd-4198-8c27-f247f0db7cce";
ins.run("live", "researching", "review", "none", 1, 0, 1, null, null);
ins.run("other-park", "wontfix", "parked", P + "verify: unresolved after revision - mismatch=true gates=gate-length", 3, 0, 1, null, null);
const get = (id) => db.prepare("SELECT * FROM research_queue WHERE id = ?").get(id);
const untouchedIds = ["rem-90c03612-extra", "db5dc635-d7d5-471a-aae7-fd2e5bba318d", "77ddda46-f30c-4692-8135-f828593cb3bc", "live", "other-park"];
const before = Object.fromEntries(untouchedIds.map((id) => [id, JSON.stringify(get(id))]));
const beforeNamed = Object.fromEntries(named.map((id) => [id, get(id)]));

db.exec(sql);
ok(named.every((id) => { const r = get(id); return r.status === "queued" && r.stage === null && r.recover_count === 0 && r.attempt === 0 && r.terminal_rearms === 1 && r.context === null && r.claimed_at === null && r.error.startsWith("REARMED 2026-10-19 (REARM-RECONCILE-TAIL-1"); }), "the five named rows return to the queue once, with a note");
ok(named.every((id) => get(id).error.indexOf("reconcile: invalid paper contract") > 0), "the note keeps the prior error for the paper's history");
ok(untouchedIds.every((id) => JSON.stringify(get(id)) === before[id]), "an unnamed row with the same error, a thin-draft row, a row re-armed before, a live row and another park are untouched");
const bak = db.prepare("SELECT * FROM bak_20261019_reconcile_tail_rearm").all();
ok(bak.length === 5 && named.every((id) => bak.some((b) => b.id === id && b.status === "wontfix" && b.stage === "parked" && b.terminal_rearms === 0 && b.error.startsWith(P))), "the backup holds the five rows as they were", bak.length);

db.exec(sql);
ok(named.every((id) => get(id).terminal_rearms === 1) && db.prepare("SELECT count(*) n FROM bak_20261019_reconcile_tail_rearm").get().n === 5, "applying the file twice re-arms nothing twice");

// A re-armed row that parks again is not re-armed a second time.
db.prepare("UPDATE research_queue SET status = 'wontfix', stage = 'parked', recover_count = 3 WHERE id = ?").run(rearmedOnce);
db.exec(sql);
ok(get(rearmedOnce).status === "wontfix" && get(rearmedOnce).terminal_rearms === 1, "a row that parks again after its re-arm stays parked");

// The Rollback line restores the prior state of every backed-up row.
const rb = /^-- Rollback: (.+)$/m.exec(sql)[1];
db.exec(rb);
ok(named.every((id) => { const r = get(id), b = beforeNamed[id]; return r.status === b.status && r.stage === b.stage && r.error === b.error && r.recover_count === b.recover_count && r.terminal_rearms === b.terminal_rearms && r.attempt === b.attempt && r.context === b.context && r.claimed_at === b.claimed_at; }), "the Rollback line restores status, stage, error, counters, context and claim");
ok(untouchedIds.every((id) => JSON.stringify(get(id)) === before[id]), "the rollback leaves every other row alone");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
