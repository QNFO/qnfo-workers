// Q08-REVIEWER-SWAP-1 + Q08-REVIEWER-HEALTH-1 offline suite (q08-signal-engine 0.31.0, charter pillar: research, cost second;
// agent_issues 2606 and 100118, cluster publish-stalls).
// Measured 2026-10-19 from qnfo-audit ai_call_counters (worker q08-signal-engine, three days): qwen3.8-27b errored on 104 of 134 calls at
// 80 s and glm-5.3-flash on 175 of 400 at 58 s, while kimi-k2.6 (0 of 310) and deepseek-v4-flash-0731 (4 of 401) answered; both failing models
// sat at the head of the reader panel and the fact-check lists, so a round waited out their failures before a reviewer answered.
// Proves: (1) the working reviewers lead both lists and the previous reviewers are the per-request fallback at the tail, so no model and no
// family leaves a pool; (2) no model id the MODEL-FLOOR-1 guard bans is named in code; (3) a reviewer erroring now (30% of 12 calls over two
// days) is ordered behind the working ones, which restores the previous reviewers by itself when the new head fails, and the read fails open;
// (4) the panel and the fact-check never call the previous reviewers while the working ones answer, and still reach them when those fail.
// Run: node q08-signal-engine/reviewer-pool.test.mjs   -> prints "N passed, 0 failed"
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const mod = await import(pathToFileURL(join(here, "worker.js")).href);
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 500) : "")); } };
const R = mod.__reviewers;
if (!R) { console.log("FAIL the worker exports no __reviewers helpers (Q08-REVIEWER-HEALTH-1 absent)"); console.log("reviewer-pool.test.mjs: 0 passed, 1 failed"); process.exit(1); }
const short = (id) => String(id).split("/").pop();
const KIMI = "@cf/moonshotai/kimi-k2.6", DSF = "@cf/deepseek-ai/deepseek-v4-flash-0731", DSP = "@cf/deepseek-ai/deepseek-v4-pro-0813";
const GLM = "@cf/zai-org/glm-5.3-flash", QWEN = "@cf/qwen/qwen3.8-27b", NEMO = "@cf/nvidia/nemotron-3-120b-a12b";
const OSS20 = "@cf/openai/gpt-oss-20b", OSS120 = "@cf/openai/gpt-oss-120b";
const fam = R.familyOf;

// ---- 1. the pools: working reviewers first, the previous reviewers kept as the tail ------------------------------------------------
ok(R.PANEL_POOL.length === 4 && new Set(R.PANEL_POOL.map(fam)).size === 4, "the panel pool holds four models over four families", R.PANEL_POOL);
ok(R.PANEL_PRIMARY_N === 2 && R.PANEL_POOL.slice(0, 2).join() === [KIMI, DSF].join(), "the two primary judges are kimi-k2.6 and deepseek-v4-flash, the measured working ones", R.PANEL_POOL);
ok(R.PANEL_POOL.slice(2).join() === [GLM, QWEN].join(), "the previous panel (glm-5.3-flash, then qwen3.8-27b, which errs more) follows them", R.PANEL_POOL);
ok(R.FACTCHECK_POOL.length === 8 && new Set(R.FACTCHECK_POOL.map(fam)).size === 6 && R.FACTCHECK_TAIL_N === 2, "the fact-check pool keeps its eight models over six families", R.FACTCHECK_POOL);
ok(R.FACTCHECK_POOL.slice(0, 3).join() === [DSF, OSS20, KIMI].join() && R.FACTCHECK_POOL.slice(-2).join() === [GLM, QWEN].join(), "deepseek-v4-flash then the cheaper gpt-oss-20b then kimi-k2.6 lead (spend: 462 neurons a verdict pair against 972 for flash + kimi); glm-5.3-flash and qwen3.8-27b are the tail", R.FACTCHECK_POOL);
ok([KIMI, DSF, GLM, QWEN].every((m) => R.PANEL_POOL.includes(m)) && [DSF, KIMI, DSP, NEMO, OSS20, OSS120, GLM, QWEN].every((m) => R.FACTCHECK_POOL.includes(m)), "no model and no family left either pool: the previous reviewers are the fallback");
ok(!R.PANEL_POOL.some((m) => /nemotron|gpt-oss/.test(m)), "no 120B writer model sits in the judge pool (ENSEMBLE-POLICY-1 rule 3)", R.PANEL_POOL);
ok(src.includes("var PANEL_POOL = ["), "the PANEL_POOL declaration trigger 797 anchors on is intact");

// ---- 2. the MODEL-FLOOR-1 guard: no banned model id is chosen in code ----------------------------------------------------------------
{
  const guard = await import(pathToFileURL(join(here, "..", "scripts", "model-floor-guard.mjs")).href);
  const hits = guard.scan(src).filter((h) => h.kind === "VIOLATION");
  ok(hits.length === 0, "model-floor-guard finds no banned model in worker.js (qwen3-30b, llama and gemma-4 stay out)", hits);
  const banned = ["qwen3-30b", "llama", "gemma-4"];
  ok(![...R.PANEL_POOL, ...R.FACTCHECK_POOL].some((m) => banned.some((b) => m.includes(b))), "neither pool names a banned model", [R.PANEL_POOL, R.FACTCHECK_POOL]);
}

// ---- 3. panel order: primaries rotate with the seed, the tail follows, a writer's family is skipped ----------------------------------
{
  const firstTwo = new Set();
  for (let sd = 0; sd < 12; sd++) {
    const p = R.pickPanel([], 4, sd);
    ok(p.length === 4 && p.slice(0, 2).sort().join() === [DSF, KIMI].sort().join() && p.slice(2).join() === [GLM, QWEN].join(), "seed " + sd + ": both primaries lead (either order), then glm-5.3-flash, then qwen3.8-27b", p.map(short));
    firstTwo.add(short(p[0]));
  }
  ok(firstTwo.size === 2, "the primary judges still rotate with the seed", [...firstTwo]);
  const w = R.pickPanel(["nvidia"], 4, 0);
  ok(w.length === 4 && !w.some((m) => fam(m) === "nvidia"), "an nvidia writer's family is never a judge", w.map(short));
  const kw = R.pickPanel(["moonshot"], 4, 0);
  ok(kw.join() === [DSF, GLM, QWEN].join(), "a kimi writer: the other primary, then the previous panel", kw.map(short));
  ok(R.pickPanel(R.PANEL_POOL.map(fam), 2, 0).length === 0, "every family excluded: no panel");
  ok(R.pickPanel(["moonshot", "deepseek"], 2, 0).join() === [GLM, QWEN].join(), "a fresh panel (both primary families used) still reaches the previous panel", R.pickPanel(["moonshot", "deepseek"], 2, 0).map(short));
}

// ---- 4. flagging: 30% of at least 12 calls ----------------------------------------------------------------------------------------------
{
  ok(R.REVIEWER_FLAG_ERR === 0.3 && R.REVIEWER_FLAG_MIN_CALLS === 12, "thresholds: 30% errors, 12 calls", [R.REVIEWER_FLAG_ERR, R.REVIEWER_FLAG_MIN_CALLS]);
  const f = R.flaggedFrom([
    { model: GLM, c: 400, e: 175 }, { model: QWEN, c: 134, e: 104 }, { model: KIMI, c: 310, e: 0 }, { model: DSF, c: 401, e: 4 },
    { model: "m-few", c: 11, e: 11 }, { model: "m-edge-in", c: 40, e: 12 }, { model: "m-edge-out", c: 40, e: 11 }, { model: "m-twelve", c: 12, e: 4 }, { model: "m-twelve-low", c: 12, e: 3 }, { model: "", c: 50, e: 50 }, null,
  ]);
  ok(f[GLM] && f[QWEN] && !f[KIMI] && !f[DSF], "the live 2026-10-19 figures flag glm-5.3-flash (43.8%) and qwen3.8-27b (77.6%) and clear kimi-k2.6 and deepseek-v4-flash", f);
  ok(!f["m-few"] && f["m-edge-in"] && !f["m-edge-out"] && f["m-twelve"] && !f["m-twelve-low"] && !f[""], "under 12 calls never flags; exactly 30% flags; 29% does not", f);
  ok(Object.keys(R.flaggedFrom(undefined)).length === 0 && Object.keys(R.flaggedFrom([{ model: "x", c: "n", e: "z" }])).length === 0, "no rows or unreadable numbers flag nothing");
  ok(R.healthFirst([1, 2, 3, 4], { 1: true, 3: true }).join() === "2,4,1,3" && R.healthFirst([1, 2, 3], {}).join() === "1,2,3" && R.healthFirst([1, 2], undefined).join() === "1,2", "healthFirst keeps each group's own order");
}

// ---- 5. the automatic revert: flagged reviewers go behind the working ones, in both lists ------------------------------------------
{
  const dsf = { [DSF]: true }, both = { [KIMI]: true, [DSF]: true }, allf = {}; R.PANEL_POOL.forEach((m) => { allf[m] = true; });
  ok(R.pickPanel([], 4, 0, dsf).join() === [KIMI, GLM, QWEN, DSF].join(), "a primary that starts failing drops behind the previous panel (the previous order comes back)", R.pickPanel([], 4, 0, dsf).map(short));
  ok(R.pickPanel([], 4, 0, both).join() === [GLM, QWEN, KIMI, DSF].join(), "both primaries failing: the previous panel leads", R.pickPanel([], 4, 0, both).map(short));
  ok(R.pickPanel([], 4, 0, allf).join() === R.pickPanel([], 4, 0).join(), "every reviewer flagged: the static order stands and the panel still runs");
  const glqw = { [GLM]: true, [QWEN]: true };
  ok(R.pickPanel([], 4, 0, glqw).join() === R.pickPanel([], 4, 0).join(), "the failing tail is already last: flagging it changes nothing");
  const fo = R.factCheckOrder(["openai"]);
  ok(fo.map(short).join() === ["deepseek-v4-flash-0731", "kimi-k2.6", "nemotron-3-120b-a12b", "deepseek-v4-pro-0813", "glm-5.3-flash", "qwen3.8-27b"].join(), "static fact-check order for a gpt-oss writer: working families, the deepseek sibling, then the previous reviewers", fo.map(short));
  const fo2 = R.factCheckOrder([], undefined);
  ok(fo2.length === 8 && fo2.slice(-2).join() === [GLM, QWEN].join(), "no writer: all eight models, the previous reviewers last", fo2.map(short));
  const fh = R.factCheckOrder(["openai"], both);
  ok(fh.map(short).join() === ["nemotron-3-120b-a12b", "deepseek-v4-pro-0813", "glm-5.3-flash", "qwen3.8-27b", "deepseek-v4-flash-0731", "kimi-k2.6"].join(), "both fact-check leaders failing: the other working models, then the previous reviewers, then the failing leaders", fh.map(short));
  const nf = R.factCheckOrder([], Object.fromEntries(R.FACTCHECK_POOL.map((m) => [m, true])));
  ok(nf.join() === R.factCheckOrder([]).join(), "all eight flagged: the static order stands");
}

// ---- 6. reviewerHealth: reads the counters, caches five minutes, fails open ----------------------------------------------------------
{
  R.resetReviewerHealth();
  let queries = 0, lastSql = "";
  const rows = [{ model: GLM, c: 400, e: 175 }, { model: QWEN, c: 134, e: 104 }, { model: KIMI, c: 310, e: 0 }, { model: DSF, c: 401, e: 4 }, { model: NEMO, c: 376, e: 20 }];
  const env = { AUDIT: { prepare: (sql) => { lastSql = sql; return { all: async () => { queries++; return { results: rows }; } }; } } };
  const h1 = await R.reviewerHealth(env);
  ok(h1[GLM] && h1[QWEN] && !h1[KIMI] && !h1[DSF] && !h1[NEMO] && queries === 1, "the counters flag the two failing reviewers (nemotron at 5% stays clear)", { h1, queries });
  ok(/FROM ai_call_counters/.test(lastSql) && /worker = 'q08-signal-engine'/.test(lastSql) && /-2 days/.test(lastSql) && /SUM\(errors\)/.test(lastSql), "it reads this worker's ai_call_counters over two days", lastSql);
  await R.reviewerHealth(env); await R.reviewerHealth(env);
  ok(queries === 1, "the answer is cached: three reads, one query", queries);
  const realNow = Date.now; Date.now = () => realNow() + 301000;
  try { await R.reviewerHealth(env); } finally { Date.now = realNow; }
  ok(queries === 2, "after five minutes the next read asks again", queries);
  // fail open: no binding, a failing read, a stub without prepare
  R.resetReviewerHealth();
  ok(Object.keys(await R.reviewerHealth({})).length === 0 && Object.keys(await R.reviewerHealth(null)).length === 0 && Object.keys(await R.reviewerHealth({ AUDIT: {} })).length === 0, "no AUDIT binding: the static order (empty answer), no throw");
  R.resetReviewerHealth();
  const origErr = console.error; let logged = 0; console.error = () => { logged++; };
  let threw = false, hf;
  try { hf = await R.reviewerHealth({ AUDIT: { prepare: () => ({ all: async () => { throw new Error("D1 down"); } }) } }); } catch (e) { threw = true; } finally { console.error = origErr; }
  ok(!threw && Object.keys(hf).length === 0 && logged === 1, "a failing read is logged and answers with the static order", { threw, hf, logged });
  // a failing read after a good one keeps the last answer
  R.resetReviewerHealth();
  await R.reviewerHealth(env);
  Date.now = () => realNow() + 301000;
  console.error = () => {};
  let keep;
  try { keep = await R.reviewerHealth({ AUDIT: { prepare: () => ({ all: async () => { throw new Error("D1 down"); } }) } }); } finally { Date.now = realNow; console.error = origErr; }
  ok(keep[GLM] && keep[QWEN], "a failed refresh keeps the last good answer", keep);
  R.resetReviewerHealth();
}

// ---- 7. behaviour: the previous reviewers are not asked while the working ones answer, and still are when those fail ----------------
const READER_OK = JSON.stringify({ would_read_to_end: true, score: 5, slop_tells: [], fix: "" });
const FACT_OK = JSON.stringify({ unsupported: [], verdict: "pass" });
{
  R.resetReviewerHealth();
  let calls = [];
  const slow = new Set([GLM, QWEN]);
  const envOk = { Q08_PANEL_ORDER: "measured", AI: { run: async (model) => { calls.push(model); if (slow.has(model)) throw new Error("timeout after 80 s"); return { response: READER_OK }; } } };
  const pan = await R.panelRead(envOk, "# t\n\nbody", ["nvidia"], 3, 2);
  ok(pan && pan.n === 2 && pan.judges.map((j) => j.model).sort().join() === [DSF, KIMI].sort().join() && calls.length === 2 && !calls.some((m) => slow.has(m)), "panel: the two working judges answer and the failing ones are never called", { calls: calls.map(short), judges: pan && pan.judges.map((j) => short(j.model)) });
  calls = [];
  const down = new Set([KIMI, DSF]);
  const envDown = { Q08_PANEL_ORDER: "measured", AI: { run: async (model) => { calls.push(model); if (down.has(model)) throw new Error("down"); return { response: READER_OK }; } } };
  const pan2 = await R.panelRead(envDown, "# t\n\nbody", ["nvidia"], 3, 2);
  ok(pan2 && pan2.n === 2 && pan2.judges.map((j) => j.model).join() === [GLM, QWEN].join() && calls.length === 4, "panel: both primaries down, the previous panel answers (per-request fallback)", { calls: calls.map(short), judges: pan2 && pan2.judges.map((j) => short(j.model)) });
  calls = [];
  const envFc = { AI: { run: async (model) => { calls.push(model); if (slow.has(model)) throw new Error("timeout after 80 s"); return { response: FACT_OK }; } } };
  const fc = await R.factCheck(envFc, "# T\n\nSome essay text that is long enough.", "Some source text.", NEMO, "s");
  ok(fc.ok === true && fc.unavailable === false && calls.join() === [DSF, OSS20].join(), "fact-check: deepseek-v4-flash then gpt-oss-20b give the two verdicts, with no call to a failing reviewer", calls.map(short));
  calls = [];
  const envFc2 = { AI: { run: async (model) => { calls.push(model); if (!slow.has(model)) throw new Error("down"); return { response: FACT_OK }; } } };
  const fc2 = await R.factCheck(envFc2, "# T\n\nSome essay text that is long enough.", "Some source text.", NEMO, "s");
  ok(fc2.ok === true && fc2.judges.length === 2 && calls.slice(-2).join() === [GLM, QWEN].join() && calls.length === 7, "fact-check: every other model down, the previous reviewers still give the two verdicts after the other five were tried", calls.map(short));
}

// ---- 8. the health order reaches the live path: flagged leaders are skipped by the call order itself -----------------------------------
{
  R.resetReviewerHealth();
  const calls = [];
  const env = {
    AUDIT: { prepare: () => ({ all: async () => ({ results: [{ model: DSF, c: 50, e: 30 }, { model: KIMI, c: 50, e: 20 }, { model: GLM, c: 400, e: 10 }] }) }) },
    AI: { run: async (model) => { calls.push(model); return { response: FACT_OK }; } },
  };
  const fc = await R.factCheck(env, "# T\n\nSome essay text that is long enough.", "Some source text.", "@cf/zzz/writer", "s");
  ok(fc.ok === true && calls.join() === [OSS20, NEMO].join(), "fact-check: leaders erroring in ai_call_counters (deepseek-v4-flash, kimi) are asked after the healthy models (gpt-oss-20b and nemotron answer first)", calls.map(short));
  R.resetReviewerHealth();
  calls.length = 0;
  const pan = await R.panelRead({ Q08_PANEL_ORDER: "measured", AUDIT: env.AUDIT, AI: { run: async (model) => { calls.push(model); return { response: READER_OK }; } } }, "# t\n\nbody", ["nvidia"], 0, 2);
  ok(pan && pan.n === 2 && calls.join() === [GLM, QWEN].join(), "panel (q08_panel_order measured): with both primaries flagged in ai_call_counters the previous panel is asked first (the revert)", calls.map(short));
  R.resetReviewerHealth();
}


// ---- 10. Q08-PANEL-CALIBRATION-1: the reader panel rotates over the whole pool unless ops_config q08_panel_order is measured ------------------
{
  const LEG = R.LEGACY_PANEL;
  ok(LEG.length === 4 && [KIMI, QWEN, GLM, DSF].every((m) => LEG.includes(m)) && LEG.join() === [KIMI, QWEN, GLM, DSF].join(), "the rotating pool is the pre-0.31.0 order (kimi, qwen3.8, glm, deepseek)", LEG);
  const heads = new Set();
  for (let sd = 0; sd < 4; sd++) { const p = R.pickPanel([], 2, sd, undefined, "rotate"); heads.add(p[0]); ok(p.length === 2, "rotate: a two-judge panel for seed " + sd, p.map(short)); }
  ok(heads.size === 4, "rotate: every model of the pool takes the head over four seeds (no permanent strict pair)", [...heads].map(short));
  const flaggedAll = { [GLM]: true, [QWEN]: true };
  ok(R.pickPanel([], 2, 0, flaggedAll, "rotate").join() === R.pickPanel([], 2, 0, undefined, "rotate").join(), "rotate: the health flags do not reorder the reader panel");
  ok(R.pickPanel([], 2, 0, flaggedAll).join() === R.pickPanel([], 2, 0, flaggedAll, "measured").join(), "no mode keeps the measured order (existing callers unchanged)");
  ok(R.pickPanel(["moonshot"], 2, 0, undefined, "rotate").every((m) => fam(m) !== "moonshot"), "rotate: an excluded family is never asked");

  // the switch: default rotate, env override, ops_config, cache, fail open
  R.resetPanelOrder();
  ok(await R.panelOrderMode(null) === "rotate" && await R.panelOrderMode({}) === "rotate" && await R.panelOrderMode({ AUDIT: {} }) === "rotate", "no binding: rotate");
  ok(await R.panelOrderMode({ Q08_PANEL_ORDER: "measured" }) === "measured" && await R.panelOrderMode({ Q08_PANEL_ORDER: "anything else" }) === "rotate", "the env override reads measured and nothing else");
  let qn = 0, lastSql = "", val = "measured";
  const envCfg = { AUDIT: { prepare: (sql) => { lastSql = sql; return { first: async () => { qn++; return val === null ? null : { value: val }; } }; } } };
  R.resetPanelOrder();
  ok(await R.panelOrderMode(envCfg) === "measured" && /FROM ops_config WHERE key = 'q08_panel_order'/.test(lastSql), "ops_config q08_panel_order = measured switches the order", lastSql);
  await R.panelOrderMode(envCfg); await R.panelOrderMode(envCfg);
  ok(qn === 1, "the answer is cached for five minutes", qn);
  val = "rotate"; R.resetPanelOrder();
  ok(await R.panelOrderMode(envCfg) === "rotate", "ops_config rotate (or any other value) rotates");
  val = null; R.resetPanelOrder();
  ok(await R.panelOrderMode(envCfg) === "rotate", "no row: rotate");
  R.resetPanelOrder();
  const origErr = console.error; console.error = () => {};
  let failMode;
  try { failMode = await R.panelOrderMode({ AUDIT: { prepare: () => ({ first: async () => { throw new Error("D1 down"); } }) } }); } finally { console.error = origErr; }
  ok(failMode === "rotate", "a failing read fails open to rotate");
  R.resetPanelOrder();

  // behaviour: with no switch, flagged primaries do not move the panel; with the switch they do
  R.resetReviewerHealth();
  const flaggedRows = { prepare: (sql) => ({ all: async () => ({ results: [{ model: DSF, c: 50, e: 30 }, { model: KIMI, c: 50, e: 20 }, { model: GLM, c: 400, e: 10 }] }), first: async () => null }) };
  const calls = [];
  const envRot = { AUDIT: flaggedRows, AI: { run: async (model) => { calls.push(model); return { response: READER_OK }; } } };
  const pr = await R.panelRead(envRot, "# t\n\nbody", ["nvidia"], 0, 2);
  ok(pr && pr.n === 2 && calls.join() === [KIMI, QWEN].join(), "panelRead default: the seed-0 panel is kimi-k2.6 and qwen3.8 whatever ai_call_counters says", calls.map(short));
  R.resetReviewerHealth(); R.resetPanelOrder();
}

// ---- 9. wiring and the ASCII rule ---------------------------------------------------------------------------------------------------------
ok(/pickPanel\(exclude, want \+ 2, seed, mode === "measured" \? await reviewerHealth\(env\) : undefined, mode\)/.test(src) && /factCheckOrder\(\[wf\], await reviewerHealth\(env\)\)/.test(src), "panelRead orders its reviewers by reviewerHealth only in measured mode and factCheck always");
{
  // Q08-ASCII-SOURCE-1: new literals are escaped. (Ten older lines of worker.js hold raw non-ASCII characters; this change adds none.)
  const blocks = [src.slice(src.indexOf("// Q08-REVIEWER-SWAP-1 (0.31.0, Q08-YIELD-1"), src.indexOf("function seedOf(")), src.slice(src.indexOf("// Q08-REVIEWER-SWAP-1 (0.31.0): the same eight"), src.indexOf("async function factCheck("))];
  ok(blocks.every((b) => b.length > 200) && !blocks.some((b) => /[^\x00-\x7F]/.test(b)), "the reviewer blocks added here are ASCII-only (Q08-ASCII-SOURCE-1)", blocks.map((b) => b.length));
}
const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 0 || ver[1] > 31 || (ver[1] === 31 && ver[2] >= 0)), "VERSION is at least 0.31.0", ver);
// Spend (Workers AI is in breach): neurons per answered call measured in ai_call_counters (q08, three days to 2026-10-19). The leading pair of the
// new order must cost less than the expected pair of the order on main (glm answers 57% of the time, kimi takes the rest): 462 against 696.
{
  const N = { [DSF]: 241, [OSS20]: 221, [GLM]: 247, [OSS120]: 385, [KIMI]: 731, [QWEN]: 1230 };
  const oldPair = 0.57 * (N[GLM] + N[DSF]) + 0.43 * (N[DSF] + N[KIMI]);
  const lead = R.factCheckOrder([fam(NEMO)]).slice(0, 2).reduce((a, m) => a + N[m], 0);
  ok(lead < oldPair, "the leading fact-check pair costs fewer neurons than the old order's expected pair", [lead, Math.round(oldPair)]);
}
console.log("reviewer-pool.test.mjs: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
