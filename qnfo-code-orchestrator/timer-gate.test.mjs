// WORKER-TIMER-GATE-1 (0.14.0, agent_issues 2379): a proposal that schedules its work with a timer a Worker never fires
// (setInterval, or setTimeout a minute or more out) goes back to the next rung once; short timers and variable delays pass.
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orch-timer-"));
const src = fs.readFileSync(path.join(here, "worker.js"), "utf8");
fs.writeFileSync(path.join(tmp, "w.mjs"), src + "\nexport { workerTimers as __timers, timerDelayMs as __delay, danglingRefs as __dangling, VERSION as __version };\n");
const mod = await import(pathToFileURL(path.join(tmp, "w.mjs")).href);
const { __timers: workerTimers, __delay: timerDelayMs } = mod;

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? "  -- " + JSON.stringify(x).slice(0, 500) : "")); } };

const vm = /^(\d+)\.(\d+)\./.exec(mod.__version);
ok(vm && (+vm[1] > 0 || +vm[2] >= 14), "VERSION at least 0.14");

// delay parsing
ok(timerDelayMs("fn, 60000") === 60000, "delay: literal");
ok(timerDelayMs("fn, 6e4") === 60000, "delay: exponent literal");
ok(timerDelayMs("function () { verify(a, b); }, 5 * 60 * 1000") === 300000, "delay: product with nested call before it");
ok(timerDelayMs("fn, ms") === null, "delay: variable is not judged");
ok(timerDelayMs("fn") === null, "delay: absent is not judged");
ok(timerDelayMs("(res) => setTimeout(res, 300), 1000 + 500") === 1500, "delay: sum, nested parens");

const base = "function a() {\n  return 1;\n}\nexport default { fetch() { return new Response(String(a())); } };\n";
const withInterval = base.replace("return 1;", "return 1;\n  setInterval(function () { verifyLater(); }, 1000);");
const withLongTimeout = base.replace("return 1;", "return 1;\n  setTimeout(async function () { await verifyInsert(); }, 5 * 60 * 1000);");
const withAbort = base.replace("return 1;", "return 1;\n  const t = setTimeout(function () { ctrl.abort(); }, 8e3);");
const withSleep = base.replace("return 1;", "return 1;\n  await new Promise(function (r) { setTimeout(r, 300); });");
const withVar = base.replace("return 1;", "return 1;\n  setTimeout(run, delayMs);");
const inString = base.replace("return 1;", 'return 1;\n  const note = "do not use setInterval(x, 1) here"; // setTimeout(f, 60000) in a comment');

ok(workerTimers("w/worker.js", base, base) === null, "no change: null");
const r1 = workerTimers("w/worker.js", base, withInterval);
ok(r1 && r1.names.indexOf("timer:setInterval") >= 0 && /worker-timer: .*setInterval/.test(r1.why), "setInterval added: refused", r1);
const r2 = workerTimers("w/worker.js", base, withLongTimeout);
ok(r2 && r2.names.indexOf("timer:setTimeout") >= 0 && /300 s/.test(r2.why), "setTimeout 5 min: refused with the delay", r2);
ok(workerTimers("w/worker.js", base, withAbort) === null, "abort timer of 8 s: not judged");
ok(workerTimers("w/worker.js", base, withSleep) === null, "sleep of 300 ms: not judged");
ok(workerTimers("w/worker.js", base, withVar) === null, "variable delay: not judged");
ok(workerTimers("w/worker.js", base, inString) === null, "timers in strings and comments: not judged");
ok(workerTimers("w/worker.test.mjs", base, withInterval) === null, "a test file is not judged");
ok(workerTimers("scripts/x.py", "a", "b\nsetInterval(") === null, "a non-JS file is not judged");
// an existing timer on main that the edit does not add is not judged
const baseTimer = withLongTimeout;
ok(workerTimers("w/worker.js", baseTimer, baseTimer.replace("return 1;", "return 2;")) === null, "an existing long timer the edit leaves alone: not judged");

// the gate is wired next to the dangling-reference gate, with the same once-only pass-through
ok(src.indexOf("const dr = danglingRefs(task.path, base, prop0) || workerTimers(task.path, base, prop0);") > 0, "propose step: timer gate wired after the dangling gate");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
