// CHAOS-DRILL-1 (0.22.0, agent_issues 2180): the pure functions of the 6-hourly alternate-path drill, sliced from worker.js.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const BEGIN = "// ---- CHAOS-DRILL-1:BEGIN", END = "// ---- CHAOS-DRILL-1:END ----";
const a = src.indexOf(BEGIN), b = src.indexOf(END);
assert.ok(a > 0 && b > a, "block markers present");
let block = src.slice(a, b);
block = block.slice(0, block.indexOf("async function chaosExercise("));
const mod = new Function("__name", block + "\nreturn { CHAOS_DRILL_EVERY_H, CHAOS_DRILL_ISSUE, chaosJudge, chaosPlan, chaosUntested };")(function () {});
const { chaosJudge, chaosPlan, chaosUntested, CHAOS_DRILL_EVERY_H, CHAOS_DRILL_ISSUE } = mod;

let pass = 0, fail = 0;
function ok(cond, msg, x) { if (cond) pass++; else { fail++; console.log("FAIL " + msg + (x !== undefined ? "  -- " + JSON.stringify(x).slice(0, 400) : "")); } }

const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(vm && (Number(vm[1]) > 0 || Number(vm[2]) >= 22), "VERSION is at least 0.22");
ok(CHAOS_DRILL_EVERY_H === 6 && CHAOS_DRILL_ISSUE === "CHAOS-DRILL-FAILED-1: ", "constants");

// judge
ok(chaosJudge([{ expected: "ok", observed: "ok" }]).pass === true, "judge: equal passes");
ok(chaosJudge([{ expected: "ok", observed: "no row in 24 h" }]).pass === false, "judge: different fails");
ok(chaosJudge([]).pass === false && /no row/.test(chaosJudge([]).observed), "judge: empty result fails with a reason");
ok(chaosJudge([{ expected: "", observed: "" }]).pass === false, "judge: an empty expected never passes");
ok(chaosJudge([{ expected: 1, observed: 1 }]).pass === true, "judge: numbers compare as strings");

// plan
const verdicts = [
  { component: "A", pass: true, observed: "ok" },
  { component: "B", pass: false, observed: "no evidence" },
  { component: "C", pass: true, observed: "ok" },
  { component: "D", pass: false, observed: "probe error: x" }
];
const plan = chaosPlan(verdicts, ["CHAOS-DRILL-FAILED-1: C", "CHAOS-DRILL-FAILED-1: D"]);
ok(plan.stamp.join(",") === "A,C", "plan: passing components are stamped", plan);
ok(plan.file.length === 1 && plan.file[0].component === "B" && plan.file[0].title === "CHAOS-DRILL-FAILED-1: B", "plan: a new failure files once", plan);
ok(plan.close.length === 1 && plan.close[0] === "CHAOS-DRILL-FAILED-1: C", "plan: a pass closes its open issue", plan);
ok(plan.file.every(f => f.component !== "D"), "plan: an already-open failure is not filed twice", plan);

// untested metric
const now = Date.parse("2026-10-12T18:00:00Z");
ok(chaosUntested([{ last_pass: 1, last_pass_at: "2026-10-12T12:00:00Z" }], now) === 0, "untested: a pass 6 h ago counts as tested");
ok(chaosUntested([{ last_pass: 1, last_pass_at: "2026-10-11T12:00:00Z" }], now) === 1, "untested: a pass 30 h ago is untested");
ok(chaosUntested([{ last_pass: 0, last_pass_at: "2026-10-12T17:00:00Z" }], now) === 1, "untested: a failing probe counts even with a recent old pass stamp");
ok(chaosUntested([{ last_pass: null, last_pass_at: null }, { last_pass: 1, last_pass_at: "2026-10-12 17:30:00" }], now) === 1, "untested: never-run counts; a space-separated timestamp parses");

// wiring and relay force flag
ok(src.indexOf('ctx.waitUntil(chaosDrill(env).catch(') > 0, "hourly tick runs the drill");
ok(src.indexOf("async function pdfBacklogRelay(env, force)") > 0 && src.indexOf("if (!force && lastTs && Date.now() - lastTs < PDF_RELAY_QUIET_MIN * 60000)") > 0, "relay: a forced call skips the quiet window");
ok(src.indexOf('drill: "router-down"') > 0, "exercise: the router-down drill body");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
