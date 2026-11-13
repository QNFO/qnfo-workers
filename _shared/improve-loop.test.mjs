// _shared/improve-loop.test.mjs: SELF-IMPROVE-1. Run: node _shared/improve-loop.test.mjs
import fs from "node:fs";
import * as IL from "./improve-loop.js";

const root = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok   " + n); } else { fail++; console.log("  FAIL " + n + (x !== undefined ? "  -> " + JSON.stringify(x) : "")); } };

ok("gap up", IL.normalizedGap({ value: 5, target: 10, worst: 0 }) === 0.5);
ok("gap down", IL.normalizedGap({ value: 30, target: 10, worst: 50, polarity: "down" }) === 0.5);
ok("gap met is zero", IL.normalizedGap({ value: 12, target: 10, worst: 0 }) === 0);
ok("gap unmeasured is null", IL.normalizedGap({ value: NaN, target: 10, worst: 0 }) === null);

const d = IL.diagnose([{ id: "a", gap: 0.4 }, { id: "b", gap: 0.35, external: true }, { id: "c", gap: null }]);
ok("external outcome outranks a slightly larger proxy gap", d.target.id === "b", d.ranked.map((r) => r.id));
ok("blind spot is reported", d.blind[0] === "c");

ok("untried knob first", IL.chooseKnob([{ knob: "x", tries: 3, keeps: 3 }, { knob: "y", tries: 0, keeps: 0 }]).knob === "y");
ok("retired knob skipped", IL.chooseKnob([{ knob: "x", tries: 3, keeps: 0, retired: true }, { knob: "y", tries: 2, keeps: 0 }]).knob === "y");
ok("all retired gives null", IL.chooseKnob([{ knob: "x", tries: 3, keeps: 0, retired: true }]) === null);

const b = { mean: 0.10, n: 200, sd: 0.05 };
ok("wait on few samples", IL.judge({ before: b, after: { mean: 0.2, n: 5, sd: 0.05 } }).verdict === "wait");
ok("keep on real move", IL.judge({ before: b, after: { mean: 0.14, n: 200, sd: 0.05 } }).verdict === "keep");
ok("revert on noise", IL.judge({ before: b, after: { mean: 0.101, n: 200, sd: 0.05 } }).verdict === "revert");
ok("revert when a guard worsens", IL.judge({ before: b, after: { mean: 0.2, n: 200, sd: 0.05 }, guards: [{ id: "cost", before: 1, after: 2, polarity: "down", tolerance: 0.1 }] }).verdict === "revert");

let r = { knob: "k", tries: 0, keeps: 0 };
r = IL.recordVerdict(r, "revert"); r = IL.recordVerdict(r, "revert");
ok("two reverts retire the knob", r.retired === true && r.tries === 2);
ok("a keep resets the streak", IL.recordVerdict({ knob: "k", tries: 1, keeps: 0, streak: 1 }, "keep").streak === 0);

ok("plan instruments a blind component", IL.plan({ signals: [{ id: "c", gap: null }], knobs: [] }).action === "instrument");
ok("plan originates when knobs are exhausted", IL.plan({ signals: [{ id: "a", gap: 0.5 }], knobs: [{ knob: "x", tries: 2, keeps: 0, retired: true }] }).action === "originate");
ok("plan changes one knob with a prediction", (() => { const p = IL.plan({ signals: [{ id: "a", gap: 0.5 }], knobs: [{ knob: "x", tries: 0, keeps: 0 }] }); return p.action === "change" && p.knob === "x" && p.prediction.metric === "a"; })());

for (const f of ["CLAUDE.md", "AGENTS.md", "agent-bootstrap.md"]) ok(f + " carries SELF-IMPROVE-1", fs.readFileSync(root + f, "utf8").includes("SELF-IMPROVE-1"));

console.log("improve-loop: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
