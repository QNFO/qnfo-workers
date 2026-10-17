// FACTCHECK-FIRST-TWO-1 + REVIEWER-HEALTH-1 offline suite (personal-companion 1.19.6, charter pillar: personal; agent_issues 2222).
// companion_runs 5404-5408 of 2026-10-13 11:00 UTC: every verification took 220 s because each round waited the full reviewer timeout for
// one reviewer (glm-5.3 failed 10 of 11 fact-check calls that day) while the other had answered; the run's budget went on three
// verifications and the prune stopped with 3 items left. Proves: two quick verdicts end the check without waiting for a hanging reviewer;
// a failed reviewer is replaced at once; a third reviewer is asked after the hedge delay when one hangs; a reviewer failing half of its
// calls today is asked last; the two-family rule is unchanged (two valid verdicts from two families other than the writer's, a failing
// verdict still fails, every reviewer failing still fails closed).
// Run: node personal-companion/factcheck-race.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { importWorker } from "./_harness-import-worker.mjs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await importWorker(() => (src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()), new URL("./", import.meta.url));
const V = mod.__verify;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 600) : "")); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PASS = '{"unsupported":[],"verdict":"pass"}';
const WRITER = "@cf/openai/gpt-oss-120b";
const source = "The Alpha Subject recorded 14 measurements in 1987 at the Beta Station.";
const draft = "# Drift in the readings\n\nThe Alpha Subject recorded 14 measurements in 1987 at the Beta Station.";

{
  const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
  ok(vm && (+vm[1] > 1 || (+vm[1] === 1 && (+vm[2] > 19 || (+vm[2] === 19 && +vm[3] >= 6)))), "VERSION is at least 1.19.6", vm && vm[0]);
  ok(V.FACTCHECK_HEDGE_MS > 0 && V.FACTCHECK_HEDGE_MS < 110e3, "the hedge delay is shorter than the reviewer timeout", V.FACTCHECK_HEDGE_MS);
}

// A scripted AI binding: per model, a delay in ms and a reply (string, or Error to throw). Unlisted models hang "forever" (2 s here).
function world(plan) {
  const calls = [];
  const AI = { run: async (model) => { calls.push({ model, at: Date.now() }); const p = plan[model] || { ms: 2000, reply: new Error("The operation was aborted due to timeout") }; await sleep(p.ms); if (p.reply instanceof Error) throw p.reply; return { response: p.reply }; } };
  return { env: { AI }, calls };
}
const ids = V.pickReviewers(["openai"], 5, 7);
ok(ids.length === 4 && !ids.some((id) => /openai/.test(id)), "four reviewers from families other than the writer's", ids);

// ---- (1) two quick verdicts end the check; the hanging reviewer is never waited for ----------------------------------------------
{
  const [a, b, c, d] = ids;
  const w = world({ [a]: { ms: 30, reply: PASS }, [b]: { ms: 40, reply: PASS }, [c]: { ms: 30, reply: PASS }, [d]: { ms: 30, reply: PASS } });
  const t0 = Date.now();
  const g = await V.gatherVerdicts(w.env, ids, draft, source, 500);
  ok(g.got.length === 2 && w.calls.length === 2 && Date.now() - t0 < 400, "two quick valid verdicts: two calls, no hedge, no wait", { n: w.calls.length, ms: Date.now() - t0 });
}
{
  // the 11:00 UTC shape: the first reviewer hangs, the second answers; the hedge brings a third and the check ends without the hanging one
  const [a, b, c, d] = ids;
  const w = world({ [a]: { ms: 2000, reply: new Error("The operation was aborted due to timeout") }, [b]: { ms: 20, reply: PASS }, [c]: { ms: 20, reply: PASS }, [d]: { ms: 20, reply: PASS } });
  const t0 = Date.now();
  const g = await V.gatherVerdicts(w.env, ids, draft, source, 150);
  const el = Date.now() - t0;
  ok(g.got.length === 2 && el >= 150 && el < 600 && w.calls.length === 3 && !g.got.some((x) => x.model === a), "a hanging reviewer costs the hedge delay, not its timeout", { el, n: w.calls.length, got: g.got.map((x) => x.model) });
  ok(new Set(g.got.map((x) => x.family)).size === 2, "the two verdicts come from two families", g.got.map((x) => x.family));
}
{
  // a reviewer that fails fast is replaced at once, before any hedge
  const [a, b, c, d] = ids;
  const w = world({ [a]: { ms: 10, reply: new Error("model down") }, [b]: { ms: 30, reply: PASS }, [c]: { ms: 30, reply: PASS }, [d]: { ms: 30, reply: PASS } });
  const t0 = Date.now();
  const g = await V.gatherVerdicts(w.env, ids, draft, source, 5000);
  ok(g.got.length === 2 && Date.now() - t0 < 400 && w.calls.length === 3 && g.lastFail[a], "a failed reviewer is replaced at once by the next one", { ms: Date.now() - t0, n: w.calls.length });
}
{
  // every reviewer fails: each is retried once and the result has fewer than two verdicts (factCheck turns that into "unavailable")
  const w = world({});
  ids.forEach((id) => {});
  const plan = {}; ids.forEach((id) => { plan[id] = { ms: 5, reply: new Error("down") }; });
  const w2 = world(plan);
  const g = await V.gatherVerdicts(w2.env, ids, draft, source, 1000);
  ok(g.got.length === 0 && w2.calls.length === 8, "all four down: four calls plus one retry each, then it stops", { n: w2.calls.length });
  const r = await V.factCheck(w2.env, draft, source, WRITER, "s9");
  ok(!r.ok && r.unavailable === true, "every reviewer failing still fails closed (nothing publishes)", r);
}

// ---- (2) a failing verdict still fails; the rule is unchanged ------------------------------------------------------------------
{
  const plan = {}; ids.forEach((id, i) => { plan[id] = { ms: 10 + i, reply: i === 0 ? '{"unsupported":["FACT: The Gamma Committee met in 1990 -- date not in source"],"verdict":"fail"}' : PASS }; });
  const w = world(plan);
  const g = await V.gatherVerdicts(w.env, ids, draft, source, 1000);
  ok(g.got.length === 2 && g.got.some((x) => x.verdict === "fail"), "a failing verdict is one of the two that decide", g.got.map((x) => x.verdict));
  const r = await V.factCheck(w.env, draft, source, WRITER, "s7");
  ok(r.unavailable === false && (r.ok === false ? r.unsupported.length >= 1 : r.judges.length === 2), "factCheck reports the failing reviewer's claim when it is among the two", { ok: r.ok, u: r.unsupported });
}

// ---- (3) REVIEWER-HEALTH-1: a reviewer failing half of its calls today is asked last ---------------------------------------------
{
  const sick = { [ids[0]]: 1 };
  const o = V.orderByHealth(ids, sick);
  ok(o.length === ids.length && o[o.length - 1] === ids[0] && o.slice(0, -1).join() === ids.slice(1).join(), "a sick reviewer moves to the end, the rest keep their order", o);
  ok(V.orderByHealth(ids, {}).join() === ids.join() && V.orderByHealth(ids, null).join() === ids.join(), "no health data leaves the order unchanged");
  const day = new Date().toISOString().slice(0, 10);
  const rows = [{ model: "@cf/zai-org/glm-5.3", calls: 11, errors: 10 }, { model: "@cf/nvidia/nemotron-3-120b-a12b", calls: 8, errors: 2 }, { model: "@cf/moonshotai/kimi-k2.6", calls: 2, errors: 2 }];
  let seen = null;
  const AUDIT = { prepare: (sql) => ({ bind: (...a) => ({ all: async () => { seen = { sql, a }; return { results: rows }; } }) }) };
  const s = await V.sickReviewers({ AUDIT });
  ok(s["@cf/zai-org/glm-5.3"] === 1 && !s["@cf/nvidia/nemotron-3-120b-a12b"] && !s["@cf/moonshotai/kimi-k2.6"], "10 of 11 failed is sick; 2 of 8 is not; 2 calls are too few to judge", s);
  ok(seen && seen.a[0] === day && /purpose = 'factcheck'/.test(seen.sql) && /worker = 'personal-companion'/.test(seen.sql), "health is read for today's companion fact-check calls only", seen);
}
{
  // in a run, the sick reviewer is not among the first two asked
  const glm = "@cf/zai-org/glm-5.3";
  const plan = {}; ids.forEach((id) => { plan[id] = { ms: 10, reply: PASS }; });
  const w = world(plan);
  const g = await V.gatherVerdicts(w.env, V.orderByHealth(ids, { [glm]: 1 }), draft, source, 1000);
  ok(g.got.length === 2 && !w.calls.some((c) => c.model === glm), "with healthy reviewers answering, the sick one is never called", w.calls.map((c) => c.model));
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
