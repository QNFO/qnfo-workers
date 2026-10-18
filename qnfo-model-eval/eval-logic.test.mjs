// CF-MODEL-EVAL-1 offline suite: pins the decisions that were measurably wrong live.
//
// It loads qnfo-model-eval/worker.js the way the deployer ships it (one
// self-contained script, no imports -- canonical-deploy PUTs worker.js verbatim,
// so an import would ship as an unresolved specifier), stubs nothing but the
// module body, and pins:
//   1. promotion is REACHABLE against a saturated control -- the 1.0.0 defect was
//      `delta >= 0.1` against a control that already scored 1.0, so the branch was
//      dead code and 0 models were ever promoted;
//   2. a saturated control decides on COST, and a model at parity with no cost win
//      is kept, not promoted;
//   3. a quality gain above an unsaturated control also promotes;
//   4. harness failures (system-role rejection, missing account config) are not
//      quality verdicts, so a fixable integration gap cannot reject a model;
//   5. the per-run cap is config-driven and not clamped to the old 3;
//   6. the battery graders behave (they decide every verdict, so a broken grader
//      silently rejects models).
//
// Run: node qnfo-model-eval/eval-logic.test.mjs

import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) pass++;
  else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); }
};

/* Load without a bundler: the module has no imports, so the source can be evaluated as one body.
 * `export default {` is rewritten to a local binding so the same file that ships to Cloudflare is the
 * file under test. */
const body = src.replace(/^export default /m, "var __default = ");
const mod = new Function("console", body +
  "\n;return { decideVerdict, gradeChat, gradeClef, clefPick, isHarnessError, VERSION, BATTERY_VERSION, QUALITY_BAND, COST_WIN_RATIO, handlers: __default };")
  ({ log() {} });

const dv = (x) => mod.decideVerdict(x);

/* ---- module shape: raw-PUT safety ---------------------------------------- */
ok(/^\d+\.\d+\.\d+/.test(mod.VERSION), "VERSION is semver-shaped", mod.VERSION);
ok(!/^\s*import\s/m.test(src), "worker.js has no top-level import");
ok(/^export default \{/m.test(src), "worker.js exports the default handler set");
ok(typeof mod.handlers.fetch === "function", "default export has a fetch handler");
ok(typeof mod.handlers.scheduled === "function", "default export has a scheduled handler");

/* ---- wrangler: cadence and binding --------------------------------------- */
ok(/crons\s*=\s*\["17 \*\/6 \* \* \*"\]/.test(toml), "wrangler declares the 6-hourly sweep", toml.match(/crons.*$/m)?.[0]);
ok(/binding\s*=\s*"AUDIT"/.test(toml), "wrangler binds AUDIT");
ok(/traces\]\s*\n\s*enabled\s*=\s*true/.test(toml), "wrangler enables traces");

/* ---- 1. THE DEFECT: promotion against a saturated control ---------------- */
{
  const r = dv({ kind: "chat", score: 1, controlScore: 1, priceIn: 0.2, controlPriceIn: 1.0 });
  ok(r.verdict === "promote", "saturated control + quality parity + 20% price -> promote", r);
  ok(/cost win/.test(r.reason), "promotion reason names the cost win", r.reason);
}
{
  const r = dv({ kind: "chat", score: 1, controlScore: 1, priceIn: 1.0, controlPriceIn: 1.0 });
  ok(r.verdict === "keep", "saturated control + parity + equal price -> keep, not promote", r);
}
{
  const r = dv({ kind: "chat", score: 1, controlScore: 1, priceIn: 0.8, controlPriceIn: 1.0 });
  ok(r.verdict === "keep", "price 80% of control is inside the cost bar -> keep", r);
}

/* ---- 2. quality gain above an unsaturated control ------------------------ */
{
  const r = dv({ kind: "chat", score: 1, controlScore: 0.875, priceIn: 2, controlPriceIn: 0.5 });
  ok(r.verdict === "promote", "strictly better quality promotes even when dearer", r);
  ok(/beats control .* quality win/.test(r.reason), "reason names the quality win", r.reason);
}

/* ---- 3. rejects and the band -------------------------------------------- */
{
  ok(dv({ kind: "chat", score: 0.4, controlScore: 1, priceIn: 0.1, controlPriceIn: 1 }).verdict === "reject",
    "score below the 0.5 capability floor rejects");
  ok(dv({ kind: "chat", score: 0.9, controlScore: 1, priceIn: 0.1, controlPriceIn: 1 }).verdict === "keep",
    "score inside the 0.15 band below control is kept");
  ok(dv({ kind: "chat", score: 0.8, controlScore: 1, priceIn: 0.1, controlPriceIn: 1 }).verdict === "reject",
    "score 0.2 below control leaves the band and rejects");
  ok(dv({ kind: "chat", score: 0.625, controlScore: 0.5, priceIn: 0.1, controlPriceIn: 1 }).verdict === "keep",
    "a quality gain between two weak models does not promote");
  ok(dv({ kind: "chat", score: 0.7, controlScore: 1, priceIn: 0.1, controlPriceIn: 1 }).verdict === "reject",
    "score below control - 0.15 rejects");
  ok(dv({ kind: "chat", score: 0.9, controlScore: null, priceIn: null, controlPriceIn: null }).verdict === "keep",
    "no control baseline -> keep, never promote");
}

/* ---- 4. harness errors are not quality verdicts -------------------------- */
{
  const r = dv({ kind: "chat", score: 0, controlScore: 1, harness: true });
  ok(r.verdict === "harness_error", "harness failure is its own verdict", r);
  ok(/integration gap, not a quality signal/.test(r.reason), "harness reason says so", r.reason);
  ok(mod.isHarnessError("5006: Error: enum system not in user,assistant at '/messages/0/role'"), "5006 is harness-class");
  ok(mod.isHarnessError("4003: AI model does not have config"), "4003 is harness-class");
  ok(!mod.isHarnessError("the reply was empty"), "an empty reply is not harness-class");
}

/* ---- 5. decision models never inherit chat routing ---------------------- */
{
  ok(dv({ kind: "clef", score: 0.9, controlScore: 0.8, priceIn: 0.04 }).verdict === "promote",
    "decision model above the family best promotes");
  ok(dv({ kind: "clef", score: 0.5, controlScore: 0.8, priceIn: 0.04 }).verdict === "reject",
    "decision model below 0.6 rejects");
  const r = dv({ kind: "clef", score: 0.8, controlScore: 0.8, priceIn: 0.04 });
  ok(r.verdict === "promote", "decision model tying the family best promotes (cheapest wins the tie)", r);
}

/* ---- 6. graders decide every verdict ------------------------------------ */
{
  const g = mod.gradeChat;
  ok(g({ grader: "first_token", expected: "611" }, "611\n\nAcknowledged."), "first_token strips trailing prose");
  ok(g({ grader: "first_token", expected: "outage" }, " outage"), "first_token ignores leading space");
  ok(!g({ grader: "first_token", expected: "outage" }, "The answer is outage"), "first_token does not scan the middle");
  ok(g({ grader: "exact", expected: "READY" }, "**READY**"), "exact normalises markdown emphasis");
  ok(g({ grader: "json_field", expected: "total=43.2" }, "{\"total\": 43.20}"), "json_field compares numerically");
  ok(!g({ grader: "json_field", expected: "total=43.2" }, "total is 43.2"), "json_field needs real JSON");
  ok(g({ grader: "ordered", expected: "from events|order by ts desc|limit 3" },
    "SELECT * FROM events ORDER BY ts DESC LIMIT 3"), "ordered matches in sequence");
  ok(!g({ grader: "ordered", expected: "from events|order by ts desc|limit 3" },
    "SELECT * FROM events LIMIT 3 ORDER BY ts DESC"), "ordered rejects the wrong sequence");
  ok(g({ grader: "regex", expected: "<{7} SEARCH[\\s\\S]*={7}[\\s\\S]*>{7} REPLACE" },
    "<<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE"), "regex grader accepts a SEARCH/REPLACE block");
  ok(g({ grader: "not_contains", expected: "as an ai" }, "611"), "not_contains passes a clean answer");
}

{
  const gc = mod.gradeClef;
  const opts = JSON.stringify({ questions: { q: {} }, expect: { q: { mode: "argmax", v: "technical" } } });
  ok(gc({ expected: "q", options: opts }, { q: { type: "choice", choice: "technical", probabilities: { technical: 0.9 } } }),
    "clef argmax accepts the chosen label");
  ok(!gc({ expected: "q", options: opts }, { q: { type: "choice", choice: "billing", probabilities: { billing: 0.9 } } }),
    "clef argmax rejects the wrong label");
  const p = JSON.stringify({ questions: { q: {} }, expect: { q: { mode: "prob_gte", v: 0.5 } } });
  ok(gc({ expected: "q", options: p }, { q: { type: "noul", noul: 0.7 } }), "clef prob_gte accepts 0.7 >= 0.5");
  ok(!gc({ expected: "q", options: p }, { q: { type: "noul", noul: 0.3 } }), "clef prob_gte rejects 0.3 < 0.5");
  const s = JSON.stringify({ questions: { q: {} }, expect: { q: { mode: "score_gte", v: 2 } } });
  ok(gc({ expected: "q", options: s }, { q: { type: "score", score: 3 } }), "clef score_gte accepts a high score");
  ok(!gc({ expected: "q", options: s }, { q: { type: "score", score: 0 } }), "clef score_gte rejects a low score");
  const l = JSON.stringify({ questions: { q: {} }, expect: { q: { mode: "score_lte", v: 0 } } });
  ok(gc({ expected: "q", options: l }, { q: { type: "score", score: 0 } }), "clef score_lte accepts the low end (no extreme bias)");
}

/* ---- 7. the per-run cap is config-driven, not the old hardcoded 3 ------- */
ok(/max_models_per_run/.test(src), "worker reads max_models_per_run from config");
ok(!/Math\.min\(4,/.test(src), "worker no longer clamps the cap to 4");
ok(/Math\.min\(12,/.test(src), "worker clamps the cap to 12");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
