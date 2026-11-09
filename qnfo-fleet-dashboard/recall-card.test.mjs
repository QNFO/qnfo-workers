// RECALL-CARD-1: the overview card for the jobs recall loop. Owner session only, reached through a service binding with the loop token, text written with
// textContent, and the card outside the 15 s refresh region. Run: node qnfo-fleet-dashboard/recall-card.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const i = src.indexOf("var RECALL_CARD_HTML"), j = src.indexOf("// ==== AREA-MAP platform: overview page wrapper");
ok(i > 0 && j > i, "the card block exists");
const ctx = {}; vm.createContext(ctx); vm.runInContext(src.slice(i, j) + "\nthis.F = recallForward; this.HTML = RECALL_CARD_HTML; this.JS = RECALL_JS;", ctx);
ok(/binding = "SVC_JOBSEARCH"\s+service = "qnfo-jobsearch"/.test(toml), "wrangler declares the SVC_JOBSEARCH service binding");
ok(/if \(holder\) o\.push\(RECALL_CARD_HTML \+ RECALL_JS\);[\s\S]{0,80}<div id="live">/.test(src), "the card is for the signed-in owner and sits before the refreshed #live region");
ok(/path === "\/api\/recall"[\s\S]{0,260}owner session required/.test(src) && /return json\(\{ error: "owner session required" \}, 401\)/.test(src), "both routes refuse a visitor with 401");
ok(!/innerHTML/.test(ctx.JS) && /textContent/.test(ctx.JS), "the page script writes text with textContent, never innerHTML");
ok(/hidden/.test(ctx.HTML) && /data-a="yes"/.test(ctx.HTML) && /data-a="no"/.test(ctx.HTML) && /data-a="unsure"/.test(ctx.HTML), "the card has Yes, No and Not sure and starts hidden");
ok(!/<textarea|<input/.test(ctx.HTML + ctx.JS), "nothing is typed: no text field in the card (PROMPTED-RECALL-1)");
const calls = [];
const env = { LOOP_TOKEN: "tok", SVC_JOBSEARCH: { fetch: async (u, init) => { calls.push({ u, init }); return new Response(JSON.stringify({ questions: [{ key: "term:simulation", ask: "q" }], total: 1 }), { status: 200 }); } } };
const g = await ctx.F(env, "GET", null);
ok(g.status === 200 && g.body.questions[0].key === "term:simulation" && calls[0].u === "https://qnfo-jobsearch/api/recall?limit=1" && calls[0].init.headers["x-loop-token"] === "tok", "GET asks for one question with the loop token", calls[0]);
const p = await ctx.F(env, "POST", { key: "term:simulation", answer: "yes", role: "R10", depth: "hands" });
ok(p.status === 200 && calls[1].u === "https://qnfo-jobsearch/api/recall/answer" && JSON.parse(calls[1].init.body).depth === "hands", "POST goes to /api/recall/answer with the body");
const none = await ctx.F({}, "GET", null);
ok(none.status === 503, "without the binding or the token the answer is 503, not a crash");
const bad = await ctx.F({ LOOP_TOKEN: "t", SVC_JOBSEARCH: { fetch: async () => { throw new Error("x"); } } }, "GET", null);
ok(bad.status === 502, "a failing jobs app is a 502");
console.log("qnfo-fleet-dashboard recall-card: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
