// REMEDIATION-STAMP-STATUS-1 offline suite (qnfo-fleet-control 0.37.0): the remediation tick's contract stamp must not write back a status another
// writer set between the probe and the stamp. Live case: issue 100000 closed as superseded at 10:45:49Z, agent_issues_superseded_contracts_upd set its
// contract to superseded, the tick's stamp at 10:45:50Z wrote it back to holding (fm-superseded-closure-reopened and -via-status read recurring).
// The suite extracts the statement from worker.js and runs it on SQLite, so it fails if the guard is removed.
// Run: node --no-warnings qnfo-fleet-control/remediation-stamp-guard.test.mjs
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const m = /db\.prepare\("(UPDATE remediation_contracts SET attempts = COALESCE\(attempts,0\) \+ 1[^"]*)"\)/.exec(src);
ok(!!m, "the tick's stamp statement is found in worker.js");
const sql = m ? m[1] : "";
ok((src.match(/UPDATE remediation_contracts SET attempts = COALESCE\(attempts,0\) \+ 1/g) || []).length === 1, "exactly one stamp statement in the worker");
ok(/CASE WHEN status IN \('active', 'holding'\) THEN COALESCE\(\?4, status\) ELSE status END/.test(sql), "the status column is guarded: only an active or holding contract takes the next status");
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, status TEXT, attempts INTEGER, last_attempt_at TEXT, last_verdict TEXT, next_due_at TEXT);");
const stamp = db.prepare(sql); // binds: ?1 verdict, ?2 next-due offset, ?3 class, ?4 next status (as the worker binds them)
const row = (cls) => db.prepare("SELECT status, attempts, last_verdict FROM remediation_contracts WHERE class = ?").get(cls);
const seed = (cls, status) => db.prepare("INSERT INTO remediation_contracts (class, status) VALUES (?, ?)").run(cls, status);
for (const [cls, status] of [["sup", "superseded"], ["act", "active"], ["hold", "holding"], ["clo", "closed"], ["esc", "escalated"]]) seed(cls, status);
stamp.run("pass", "+1 hours", "sup", "holding");
ok(row("sup").status === "superseded" && row("sup").attempts === 1 && row("sup").last_verdict === "pass", "a superseded contract stays superseded (the attempt is still counted)", row("sup"));
stamp.run("pass", "+1 hours", "act", "closed");
ok(row("act").status === "closed", "an active contract takes the verdict's next status (closed)", row("act"));
stamp.run("fail", "+1 hours", "hold", "active");
ok(row("hold").status === "active", "a holding contract takes the next status (active, a re-arm)", row("hold"));
stamp.run("pass", "+1 hours", "act", null);
stamp.run("fail", "+1 hours", "esc", null);
ok(row("esc").status === "escalated", "no next status leaves the status alone", row("esc"));
stamp.run("pass", "+1 hours", "clo", "holding");
ok(row("clo").status === "closed", "a closed contract is not reopened by the stamp", row("clo"));
console.log("remediation-stamp-guard: " + pass + " pass, " + fail + " fail");
if (fail) process.exit(1);
