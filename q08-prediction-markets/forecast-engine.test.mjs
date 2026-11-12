// FORECAST-ENGINE-1 tests: node q08-prediction-markets/forecast-engine.test.mjs
import { readFileSync } from "node:fs";
import { classify, deadlineOf, familyKey, isotonic, termStructure, properEntities, matchEvidence, needsUpdate, buildPrompt, parseShift, combine, valueAdded, plan, renderPage, forecastOne, sha256Hex } from "./forecast-engine.mjs";
import { block, apply } from "./inline-forecast-engine.mjs";
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL", m, x === undefined ? "" : JSON.stringify(x)); } };
const near = (a, b, e = 1e-3) => Math.abs(a - b) < e;
const snap = JSON.parse(readFileSync(new URL("./forecast-demo/snapshot-2026-11-12.json", import.meta.url), "utf8"));
const now = Date.parse(snap.now);

// 1 select
ok(classify("Will there be no change in Fed interest rates after the December 2026 meeting?")?.key === "monetary", "Fed question is monetary");
ok(classify("Jensen Huang announced resignation or removal by December 31?")?.key === "leadership", "CEO removal is leadership");
ok(classify("Will Anthropic IPO by November 20, 2026?")?.key === "capital", "IPO is capital");
ok(classify("US announces end of Iranian blockade by December 31, 2026?")?.key === "energy-geopolitics", "blockade is energy");
for (const t of ["Buccaneers vs. Bears", "Will Bitcoin dip to $60,000 November 9-15?", "Will Kai Cenat finish his GTA marathon by November 11, 7:59 AM ET?", "Will Bilibili Gaming win Worlds 2026?", "Jensen Huang divorce in 2026?", "Rates cut next meeting (synthetic)"])
  ok(classify(t) === null, "trivial or synthetic dropped: " + t);

// 2 prior
ok(deadlineOf("Will Anthropic IPO by November 20, 2026?", 2026) === "2026-11-20", "deadline with year");
ok(deadlineOf("Jensen Huang announced resignation or removal by December 31?", 2026) === "2026-12-31", "deadline without year");
ok(deadlineOf("Will the U.S. invade Iran before 2027?", 2026) === "2026-12-31", "before a year");
ok(deadlineOf("Will there be no change in Fed interest rates after the December 2026 meeting?", 2026) === "2026-12-31", "month-year meeting");
ok(familyKey("Pete Hegseth out as Secretary of Defense by November 21?") === familyKey("Pete Hegseth out as Secretary of Defense by December 31?"), "legs share a family");
const iso = isotonic([0.455, 0.55, 0.155], [6, 6, 0.01], 1);
ok(iso[0] <= iso[1] && iso[1] <= iso[2] + 1e-9, "isotonic is monotone", iso);
ok(iso[2] > 0.5, "a stale low leg is pulled up to the fresh legs", iso);
const dec = isotonic([0.935, 0.745, 0.565], [1, 1, 1], -1);
ok(dec[0] >= dec[1] && dec[1] >= dec[2], "continues-through legs are non-increasing", dec);
const ts = termStructure(snap.markets.filter((m) => classify(m.title)), now);
const huang = ts.find((q) => q.slug === "jensen-huang-announced-resignation-or-removal-by-december-31");
ok(huang && huang.incoherent && huang.prior > huang.quoted + 0.3, "the stale Dec 31 Huang quote (15.5%) is flagged and repaired above the Nov 13 leg", huang && { q: huang.quoted, p: huang.prior });
ok(ts.every((q) => q.prior > 0 && q.prior < 1), "priors in (0,1)");

// 3 match
ok(properEntities("Jensen Huang announced resignation or removal by December 31?").join() === "jensen,huang", "proper entities skip stop words and months", properEntities("Jensen Huang announced resignation or removal by December 31?"));
const ev = matchEvidence(huang, snap.signals, { sinceMs: now - 21 * 86400000 });
ok(ev.length === 4 && ev.every((e) => /huang/i.test(e.title)), "Huang evidence is the four Huang headlines", ev.map((e) => e.title));
ok(matchEvidence({ title: "Will the U.S. invade Iran before 2027?" }, snap.signals).length === 0, "no Iran signals in the stream: no evidence, no tokens");

// 4 trigger
ok(needsUpdate(null, 0.5, ev).yes, "first forecast triggers");
ok(!needsUpdate({ prior: 0.5, evidence_json: JSON.stringify(ev) }, 0.52, ev).yes, "same evidence, small move: skip");
ok(needsUpdate({ prior: 0.5, evidence_json: JSON.stringify(ev) }, 0.56, ev).yes, "crowd moved 6 points: update");
ok(needsUpdate({ prior: 0.5, evidence_json: JSON.stringify(ev.slice(1)) }, 0.5, ev).yes, "one new signal: update");

// 5 prompt stays small
const prompt = buildPrompt({ ...huang, title: huang.title }, ev, "2026-11-12");
ok(prompt.length < 2000 && prompt.includes("E2") && prompt.includes("54.2%"), "prompt is compact and carries the repaired prior", prompt.length);

// 6 gate
const ids = ["E1", "E2"];
ok(parseShift('{"shift": 0.5, "cites": ["E2"], "mechanism": "m", "watch": "w"}', ids).ok, "valid verdict");
ok(!parseShift('{"shift": 0.8, "cites": [], "mechanism": "m"}', ids).ok, "uncited shift rejected");
ok(!parseShift('{"shift": 0.8, "cites": ["E9"]}', ids).ok, "citation of unknown evidence rejected");
ok(!parseShift('{"shift": 3, "cites": ["E1"]}', ids).ok, "out-of-range shift rejected");
ok(!parseShift("I think it goes up", ids).ok, "prose rejected");
ok(parseShift('Sure. {"shift": 0, "cites": []}', ids).ok, "zero shift needs no citation");
const v = (s) => ({ ok: true, shift: s, cites: ["E1"] });
ok(combine(0.3, [v(0.5)]).p === 0.3, "one verdict: crowd stands");
ok(combine(0.3, [v(0.5), v(-0.5)]).p === 0.3, "opposite directions: crowd stands");
ok(combine(0.3, [v(0), v(0.5)]).p === 0.3, "only one model moves: crowd stands");
ok(combine(0.3, [v(0), v(0)]).p === 0.3, "both zero: crowd stands");
const up = combine(0.5, [v(2), v(2)]);
ok(near(up.shift, 1) && up.p < 0.74, "shift halved then capped at 1 logit", up);
// the real 2026-11-12 run
const answers = JSON.parse(readFileSync(new URL("./forecast-demo/answers-2026-11-12.json", import.meta.url), "utf8"));
const pl = plan(snap.markets, snap.signals, {}, now);
ok(pl.consequential === 16 && pl.skipped.trivial === 6, "snapshot: 16 consequential, 6 trivial", pl);
ok(pl.chosen.length === 3 && pl.chosen.every((q) => answers[q.slug]), "snapshot: three questions with fresh evidence are chosen", pl.chosen.map((q) => q.slug));
const today = "2026-11-12";
const res = {};
for (const q of pl.chosen) res[q.slug] = await forecastOne(q, async (m) => answers[q.slug].find((a) => a.model === m), today);
const h = res["jensen-huang-announced-resignation-or-removal-by-december-31"];
ok(near(h.p, 0.6445, 0.002) && h.tokens === 752, "Huang: 54.2% crowd -> 64.4%, 752 tokens", { p: h.p, t: h.tokens });
ok(res["will-anthropic-ipo-by-november-20-2026"].p === res["will-anthropic-ipo-by-november-20-2026"].prior, "Anthropic IPO: crowd stands");
ok(res["will-there-be-no-change-in-fed-interest-rates-after-the-december-2026-meeting-20260729232808635"].why.startsWith("only one model"), "Fed: one model moved, crowd stands");
const total = Object.values(res).reduce((a, r) => a + r.tokens, 0);
ok(total < 3000, "three forecasts cost under 3,000 tokens (q08 essays: ~2.6 million per published piece)", total);
const thrown = await forecastOne(pl.chosen[0], async () => { throw new Error("down"); }, today);
ok(thrown.p === thrown.prior, "model outage: crowd stands, nothing thrown");

// 7 ledger
ok(valueAdded([]).n === 0, "no resolved rows");
const va = valueAdded([{ prior: 0.5, p: 0.7, outcome: 1 }, { prior: 0.2, p: 0.2, outcome: 0 }]);
ok(va.n === 2 && va.value_added > 0, "moving toward the outcome adds value", va);
ok((await sha256Hex("a")).length === 64, "sha256");

// 8 page
const rows = Object.values(res).map((r) => ({ ...r, evidence_json: JSON.stringify(r.evidence), verdicts_json: JSON.stringify(r.verdicts), hash: "abc" }));
const head = (t, d, css) => `<meta name="viewport" content="width=device-width"><title>${t}</title><style>${css}</style>`;
const page = renderPage(rows, { value: { n: 0 }, tokens_per: 748 }, head);
ok(page.includes("Forecasts that move money") && page.includes("64.4%") && page.includes("+10 pts vs crowd"), "page renders the forecasts");
ok(page.includes("inconsistent with the other dates"), "page explains the repaired stale quote");
ok(renderPage([], {}, head).includes("No forecasts yet"), "empty state says what happens next");
// the deployed copy inside worker.js and its mirror is the current module
for (const f of ["worker.js", "deployed-current.worker.js"]) {
  const t = readFileSync(new URL("./" + f, import.meta.url), "utf8");
  ok(apply(t) === t && t.includes(block()), f + " holds the current FORECAST-ENGINE-1 block (run node q08-prediction-markets/inline-forecast-engine.mjs)");
}
const W = (await import("./worker.js")).default;
const fp = await (await W.fetch(new Request("https://t.invalid/forecasts"), {})).text();
ok(fp.includes("No forecasts yet") && /<body class="ds">/.test(fp), "the /forecasts route renders its empty state without a database");
const hj = await (await W.fetch(new Request("https://t.invalid/health"), {})).json();
ok(hj.features.includes("forecasts"), "health lists the forecasts feature");
console.log("forecast-engine: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
