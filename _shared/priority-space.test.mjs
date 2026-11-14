import assert from "node:assert/strict";
import { familyOf, rank, paretoFront, learnWeights, vectorize, DEFAULT_WEIGHTS } from "./priority-space.js";

const now = Date.parse("2026-11-14T12:00:00Z");
assert.equal(familyOf("CF-OBS-ISSUE-1: worker x"), "CF-OBS-ISSUE-1");
assert.equal(familyOf("METRIC-TRIGGER-3061-UNVERIFIED: y"), "METRIC-TRIGGER-3061-UNVERIFIED");

const issues = [
  ...Array.from({ length: 10 }, (_, k) => ({ id: 100 + k, title: `CF-OBS-ISSUE-1: w${k}`, priority: "critical", description: "code-task: repo=x", created_at: "2026-11-10 00:00:00" })),
  { id: 1, title: "LONE-1: thing", priority: "critical", description: "", created_at: "2026-11-14 11:00:00" },
  { id: 2, title: "CLAIMED-1: busy", priority: "critical", description: "code-task:", linked_session: "s", created_at: "2026-11-01 00:00:00" },
];
const r = rank(issues, { nowMs: now });
// one representative per family
assert.equal(r.picks.length, 3);
// the big, ready, aged family ranks first despite equal labels
assert.equal(familyOf(issues.find((i) => i.id === r.picks[0].id).title), "CF-OBS-ISSUE-1");
// budget is respected
assert.ok(rank(issues, { nowMs: now, budget: 2 }).spent <= 2);
// pareto: dominated item excluded
const f = paretoFront([{ id: 1, cost: 1, s: { value: 2 } }, { id: 2, cost: 2, s: { value: 1 } }]);
assert.deepEqual(f.map((x) => x.id), [1]);
// learning raises the axis that predicted closes
const a = vectorize(issues[0], 10, now), b = vectorize(issues[10], 1, now);
const w = learnWeights(DEFAULT_WEIGHTS, [{ vec: a, closed: true }, { vec: b, closed: false }]);
assert.ok(w.leverage > DEFAULT_WEIGHTS.leverage);
console.log("priority-space ok");
