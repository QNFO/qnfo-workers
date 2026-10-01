/**
 * objective-revision.test.mjs -- offline regression lock for OBJECTIVE-REVISION-APPLY-1 (agent_issues #1725).
 * Slices the block out of worker.js and drives the pure planner with the live objective statement and the
 * live goal statements of 2026-10-01. Output MUST contain "0 failed" on success; charter-guard.yml greps
 * for exactly that string.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const BEGIN = "// ---- OBJECTIVE-REVISION-APPLY-1:BEGIN";
const END = "// ---- OBJECTIVE-REVISION-APPLY-1:END ----";
const a = src.indexOf(BEGIN), b = src.indexOf(END);
if (a < 0 || b < 0 || b < a) { console.error("FAIL objective-revision block markers missing"); console.log("1 failed"); process.exit(1); }
const sandbox = { charterOne: null, charterRows: null, __name: (f) => f, console, Date, Math, JSON, Number, String, Object, Array, RegExp, isNaN, __export: null };
vm.createContext(sandbox);
vm.runInContext(src.slice(a, b + END.length) + "\n__export = { parseSaiWeights, parseWeightRevision, planObjectiveRevisions, renderSaiStatement, objectiveRevisionApply };", sandbox, { filename: "objective-revision-block.js" });
const O = sandbox.__export;

let passed = 0, failed = 0;
function eq(actual, expected, label) { if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; return; } failed++; console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
function ok(cond, label, extra) { if (cond) { passed++; return; } failed++; console.error(`FAIL ${label}${extra !== undefined ? ": " + JSON.stringify(extra) : ""}`); }

// The live objectives.id=2 statement (v2, ratified 2026-09-26).
const LIVE = "Maximize SAI = 0.20*autonomy + 0.15*thinking + 0.15*decision + 0.15*self_improv + 0.10*reliability + 0.10*integration + 0.10*external_impact + 0.05*governance, subject to the autonomy-ladder cap, cost ceilings (A9), and the residual-consent boundary. external_impact = goals.id=50 cost-per-impact: cost_usd / (impressions + citations + subscribers + downloads), refreshed daily, scored 0..1 against the survival-gate headroom. RATIFIED 2026-09-26 by owner directive (adds the external-impact term absent from v1 objective-function; autonomy funded 0.30 -> 0.20; sum stays 1.00). Was v1: 0.30*autonomy + ... + 0.05*governance (internal-only, zero impact weight).";
const objective = { id: 2, objective_key: "objective-function", statement: LIVE, version: 2 };

// --- parsing -------------------------------------------------------------
const w = O.parseSaiWeights(LIVE);
eq(w.order, ["autonomy", "thinking", "decision", "self_improv", "reliability", "integration", "external_impact", "governance"], "live formula yields the 8 dimensions in order");
eq(w.weights.autonomy, 0.2, "autonomy weight");
eq(w.sum, 1, "live weights sum to 1");
eq(O.parseSaiWeights("no formula here"), null, "a statement without a formula parses to null");

// Live goal statements (goals 42, 43, 44, 56, 58, 41).
const g42 = { id: 42, statement: "Increase the weight of self_improv from 0.15 to 0.20" };
const g43 = { id: 43, statement: "Add a new constraint: 'energy_efficiency >= 0.8', to ensure the fleet prioritizes energy-efficient solutions" };
const g44 = { id: 44, statement: "Decrease the weight of governance from 0.05 to 0.03" };
const g56 = { id: 56, statement: "Increase the weight of external_impact from 0.10 to 0.15" };
const g58 = { id: 58, statement: "Decrease the weight of autonomy from 0.20 to 0.15 and increase the weight of self_improv from 0.15 to 0.20" };
const g41 = { id: 41, statement: "The fleet will re-evaluate its terminal objectives to consider the potential inherent limits of its systems of knowledge, logic, and formal reasoning, and propose revisions if necessary." };
const g19 = { id: 19, statement: "Increase the weight of 'thinking' from 0.15 to 0.20" };
eq(O.parseWeightRevision(g58.statement), [{ dim: "autonomy", from: 0.2, to: 0.15, verb: "decrease" }, { dim: "self_improv", from: 0.15, to: 0.2, verb: "increase" }], "two-clause revision parses both clauses");
eq(O.parseWeightRevision(g19.statement), [{ dim: "thinking", from: 0.15, to: 0.2, verb: "increase" }], "quoted dimension name parses");
eq(O.parseWeightRevision(g43.statement), null, "a constraint is not a weight change");
eq(O.parseWeightRevision(g41.statement), null, "a re-evaluation is not a weight change");
eq(O.parseWeightRevision("Increase the weight of self-improvement from 0.15 to 0.20")[0].dim, "self_improv", "alias self-improvement -> self_improv");

// --- planning: the rules ---------------------------------------------------
const plan = O.planObjectiveRevisions(objective, [g43, g42, g58, g41], "2026-10-02");
eq(plan.decisions.map((d) => d.id + ":" + d.verdict), ["41:manual", "42:refused", "43:manual", "58:apply"], "decisions in id order: manual, unbalanced refused, manual, balanced applied");
ok(/sum to 1\.050/.test(plan.decisions[1].why), "unbalanced revision names the sum", plan.decisions[1].why);
eq(plan.weights.autonomy, 0.15, "autonomy funded down");
eq(plan.weights.self_improv, 0.2, "self_improv raised");
eq(plan.applied, 1, "one applied"); eq(plan.refused, 1, "one refused"); eq(plan.manual, 2, "two manual");
ok(plan.statement.startsWith("Maximize SAI = 0.15*autonomy + 0.15*thinking + 0.15*decision + 0.20*self_improv + 0.10*reliability + 0.10*integration + 0.10*external_impact + 0.05*governance, subject to"), "new statement carries the new formula in place", plan.statement.slice(0, 160));
ok(plan.statement.includes("RATIFIED 2026-10-02 by the owner on the fleet dashboard (goals #58)") && plan.statement.includes("Was: 0.20*autonomy"), "new statement records the ratification and the previous formula");
ok(plan.statement.includes("external_impact = goals.id=50"), "the rest of the statement is preserved");

// conflict: a second ratified revision touching a weight already changed in this batch is refused
const g99 = { id: 99, statement: "Decrease the weight of self_improv from 0.20 to 0.15 and increase the weight of thinking from 0.15 to 0.20" };
const plan2 = O.planObjectiveRevisions(objective, [g58, g99], "2026-10-02");
eq(plan2.decisions.map((d) => d.id + ":" + d.verdict), ["58:apply", "99:refused"], "conflicting later revision refused");
ok(/conflicts with ratified revision #58/.test(plan2.decisions[1].why), "conflict names the earlier revision", plan2.decisions[1].why);

// stale: the proposal's 'from' is not today's weight
const plan3 = O.planObjectiveRevisions(objective, [{ id: 7, statement: "Decrease the weight of autonomy from 0.30 to 0.20 and increase the weight of thinking from 0.15 to 0.25" }], "2026-10-02");
eq(plan3.decisions[0].verdict, "refused", "stale from-value refused");
ok(/is 0\.20 today, not 0\.30 \(stale proposal\)/.test(plan3.decisions[0].why), "stale reason names today's weight", plan3.decisions[0].why);

// unknown dimension and out-of-range target
const plan4 = O.planObjectiveRevisions(objective, [{ id: 8, statement: "Increase the weight of velocity from 0.00 to 0.10 and decrease the weight of autonomy from 0.20 to 0.10" }], "2026-10-02");
ok(/unknown dimension 'velocity'/.test(plan4.decisions[0].why), "unknown dimension refused", plan4.decisions[0].why);
const plan5 = O.planObjectiveRevisions(objective, [{ id: 9, statement: "Increase the weight of autonomy from 0.20 to 1.20 and decrease the weight of thinking from 0.15 to -0.85" }], "2026-10-02");
eq(plan5.decisions[0].verdict, "refused", "out-of-range target refused");

// a two-revision balanced batch applies both and composes
const plan6 = O.planObjectiveRevisions(objective, [g44, { id: 60, statement: "Increase the weight of reliability from 0.10 to 0.12" }], "2026-10-02");
eq(plan6.decisions.map((d) => d.verdict), ["refused", "refused"], "two single-sided revisions each fail the sum rule on their own");
const plan7 = O.planObjectiveRevisions(objective, [{ id: 61, statement: "Decrease the weight of governance from 0.05 to 0.03 and increase the weight of reliability from 0.10 to 0.12" }], "2026-10-02");
eq(plan7.applied, 1, "one balanced two-clause revision applies");
eq(plan7.weights.governance, 0.03, "governance lowered");

// no formula in the objective -> error, nothing applied
const planE = O.planObjectiveRevisions({ id: 2, statement: "free text", version: 2 }, [g58], "2026-10-02");
ok(!!planE.error && planE.applied === 0, "unparseable objective is an error with nothing applied", planE.error);

// --- the writer, with a mocked D1 ------------------------------------------
const log = [];
const env = { AUDIT: { prepare(sql) { const st = { sql, args: [] }; st.bind = (...x) => { st.args = x; return st; }; st.run = async () => { log.push(st); return {}; }; st.all = async () => ({ results: [] }); st.first = async () => null; return st; }, async batch(stmts) { for (const s of stmts) log.push(s); return stmts.map(() => ({})); } } };
sandbox.charterRows = async (e, sql) => sql.includes("FROM goals") ? [g43, g42, g58] : [];
sandbox.charterOne = async (e, sql) => sql.includes("FROM objectives") ? objective : null;
const res = await O.objectiveRevisionApply(env);
eq([res.ratified, res.applied, res.refused, res.manual, res.version], [3, 1, 1, 1, 3], "writer summary: 3 ratified, 1 applied, 1 refused, 1 manual, objective v3");
const upd = (id) => log.find((s) => s.sql.startsWith("UPDATE goals") && s.args[s.args.length - 1] === id);
ok(upd(58) && upd(58).sql.includes("status='applied'") && /APPLIED 20\d\d-\d\d-\d\d by qnfo-fleet-control .* v2 -> v3 \(autonomy 0\.20 -> 0\.15, self_improv 0\.15 -> 0\.20\)/.test(upd(58).args[1]), "applied goal marked applied with the version step", upd(58) && upd(58).args[1]);
ok(upd(42) && upd(42).sql.includes("status='proposed'") && /APPLY-REFUSED .*sum to 1\.050.*back to you/.test(upd(42).args[1]), "refused goal goes back to the owner with the reason", upd(42) && upd(42).args[1]);
ok(upd(43) && upd(43).sql.includes("status='ratified-manual'"), "constraint goal becomes ratified-manual");
const objUpd = log.find((s) => s.sql.startsWith("UPDATE objectives"));
ok(objUpd && objUpd.args[1] === 3 && objUpd.args[5] === 2 && objUpd.args[0].startsWith("Maximize SAI = 0.15*autonomy") && /applied by qnfo-fleet-control/.test(objUpd.args[2]), "objective rewritten to v3 with an optimistic version check", objUpd && objUpd.args.slice(1));
eq(log.filter((s) => s.sql.startsWith("INSERT INTO objective_revision_log")).length, 3, "one log row per ratified goal");
ok(log.every((s) => !s.sql.startsWith("UPDATE goals") || s.sql.includes("AND status='ratified'")), "goal updates only move rows that are still ratified");

// nothing ratified -> no writes at all
log.length = 0;
sandbox.charterRows = async () => [];
const res0 = await O.objectiveRevisionApply(env);
eq([res0.ratified, log.length], [0, 0], "no ratified rows: no-op, no writes");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
