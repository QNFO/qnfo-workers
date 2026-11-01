// COST-SUSTAIN-1 / SOFT-DAILY-BUDGET-1 offline suite: the daily neuron target keeps work running and selects the lean route.
// Run: node qnfo-research-exec/budget-gate.test.mjs -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const line = (n) => { const m = new RegExp("\\nvar " + n + " = [^\\n]*").exec(src); if (!m) throw new Error("missing " + n); return m[0]; };
const fn = (h) => { const a = src.indexOf("\n" + h); if (a < 0) throw new Error("missing " + h); return src.slice(a, src.indexOf("\n}\n", a) + 2); };
console.error = () => {};
const { researchBudget } = new Function(["WORKER", "RESEARCH_DAILY_NEURONS_DEFAULT", "RESEARCH_BUDGET_WORKERS", "RESEARCH_BUDGET_BURST"].map(line).join("") + fn("async function researchBudget(") + "\nreturn { researchBudget };")();
function mk(cfg, rows) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE ai_call_counters (day TEXT, worker TEXT, neurons REAL);");
  if (cfg !== undefined) db.prepare("INSERT INTO ops_config VALUES ('research_daily_neurons', ?)").run(String(cfg));
  for (const r of rows || []) db.prepare("INSERT INTO ai_call_counters VALUES (?,?,?)").run(r[0], r[1], r[2]);
  return { QNFO_AUDIT: { prepare(sql) { let a = []; const q = { bind(...x) { a = x; return q; }, async first() { return db.prepare(sql).get(...a) || null; } }; return q; } } };
}
const T = (h) => Date.parse("2026-10-21T" + String(h).padStart(2, "0") + ":05:00Z");
let r = await researchBudget(mk(undefined, []), T(0));
ok(r.ok && r.budget === 360000, "default budget 360k, nothing spent -> ok");
ok(r.pace === Math.round(360000 * (1 / 24 + 0.1)), "pace at 00h is 1/24 + 10% burst");
r = await researchBudget(mk(undefined, [["2026-10-21", "qnfo-research-exec", 70000]]), T(0));
ok(r.ok && r.overPace, "70k by 00:05 is over the 00h pace (~51k) but under the daily budget -> runs (100622)");
r = await researchBudget(mk(undefined, [["2026-10-21", "qnfo-research-exec", 70000]]), T(5));
ok(r.ok, "the same spend at 05h is under pace -> runs");
r = await researchBudget(mk(undefined, [["2026-10-21", "qnfo-research-exec", 359999]]), T(0));
ok(r.ok, "359,999 neurons by 00:05 is under the daily cap -> runs");
r = await researchBudget(mk(undefined, [["2026-10-21", "qnfo-research-exec", 360000]]), T(0));
ok(r.ok && r.overBudget, "360,000 neurons by 00:05 exceeds the target but still runs");
r = await researchBudget(mk(undefined, [["2026-10-21", "qnfo-research-exec", 300000], ["2026-10-21", "errata-hub", 100000], ["2026-10-21", "qnfo-paper-reviser", 60000]]), T(23));
ok(r.ok && r.overBudget && r.spent === 460000, "folded members count toward the target; 460k >= 360k still runs lean");
r = await researchBudget(mk(undefined, [["2026-10-21", "q08-signal-engine", 900000], ["2026-10-20", "qnfo-research-exec", 900000]]), T(12));
ok(r.ok && r.spent === 0, "other workers and other days do not count");
r = await researchBudget(mk(0, [["2026-10-21", "qnfo-research-exec", 9e9]]), T(1));
ok(r.ok && r.disabled, "budget 0 disables the gate (explicit override)");
r = await researchBudget(mk(200000, [["2026-10-21", "qnfo-research-exec", 150000]]), T(23));
ok(r.ok && r.budget === 200000 && r.pace === 200000, "ops_config budget is read; pace never exceeds the budget");
r = await researchBudget(mk(200000, [["2026-10-21", "qnfo-research-exec", 200000]]), T(23));
ok(r.ok && r.overBudget, "reaching the daily target routes work through the lean path without holding it");
r = await researchBudget({ QNFO_AUDIT: { prepare() { throw new Error("d1 down"); } } }, T(3));
ok(r.ok && r.unreadable, "unreadable counters fail open (verified work is not stopped by a D1 fault)");
const today = new Date().toISOString().slice(0, 10);
const envOver = mk(undefined, [[today, "qnfo-research-exec", 360000]]);
const leased = new Function("researchBudget", "logEvent", "leaseAcquire", "leaseRelease", "researchParallel", "run", "runSlot", "INFLIGHT_SQL", "__attrSlotEnv",
  fn("async function runLeased(") + "\nreturn runLeased;")(
  researchBudget, async () => {}, async () => true, async () => {}, async () => 1,
  async () => ({ status: "ok", claimed: 0 }), async () => ({}), "", (e) => e
);
let ran = 0;
const runOnce = new Function("researchBudget", "logEvent", "leaseAcquire", "leaseRelease", "researchParallel", "run", "runSlot", "INFLIGHT_SQL", "__attrSlotEnv",
  fn("async function runLeased(") + "\nreturn runLeased;")(
  researchBudget, async () => {}, async () => true, async () => {}, async () => 1,
  async () => { ran++; return { status: "ok", claimed: 0 }; }, async () => ({}), "", (e) => e
);
const out = await runOnce(envOver, "test", 1, 1000);
ok(ran === 1 && !out.budgetHeld, "runLeased advances work after the daily neuron target is exceeded");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
