// Q08-GATE-RATE-1 (agent_issues 1002036): 12 gate_failed essay runs limit the 4th attempt of an hour; one ok run lifts it.
// Output MUST contain "0 failed" on success.   node q08-signal-engine/gate-rate.test.mjs
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const consts = src.split("\n").find((l) => l.startsWith("var Q08_GATE_RATE_WINDOW"));
const start = src.indexOf("function q08GateRateLimited(");
const end = src.indexOf("\nasync function generate(env) {");
ok(consts && start > 0 && end > start, "the constants and the pure function are in the worker");
const limited = new Function(consts + "\n" + src.slice(start, end) + "\nreturn q08GateRateLimited;")();

const now = Date.parse("2026-11-09T12:00:00Z");
const at = (minAgo) => new Date(now - minAgo * 6e4).toISOString().slice(0, 19).replace("T", " ");
const failed = (mins) => mins.map((m) => ({ status: "gate_failed", ran_at: at(m) }));

// 12 failures, three of them inside the last hour: the 4th attempt of the hour is limited.
const three = failed([5, 20, 40, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
ok(limited(three, now).limited === true && limited(three, now).recent === 3, "12 gate_failed rows with 3 in the hour limit the next attempt");
// 12 failures, only two inside the hour: a third attempt is still allowed.
const two = failed([5, 20, 70, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
ok(limited(two, now).limited === false && limited(two, now).recent === 2, "two attempts in the hour leave room for the third");
// one ok run among the newest 12 lifts the limit at once.
const lifted = [{ status: "ok", ran_at: at(1) }].concat(failed([5, 20, 40, 90, 120, 150, 180, 210, 240, 270, 300]));
ok(limited(lifted, now).limited === false, "one ok run lifts the limit");
// fewer than 12 runs is not a streak.
ok(limited(failed([5, 20, 40]), now).limited === false, "fewer than 12 rows never limit");
ok(limited(null, now).limited === false, "no rows never limit");
ok(/Q08-GATE-RATE-1/.test(src) && /writes? one skipped|quit\("skipped", "Q08-GATE-RATE-1/.test(src), "generate writes a skipped engine_runs row with the reason when it limits a tick");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
