// ASK-GROUND-1 offline suite (qnfo-gateway 3.13.0, owner directive 2026-10-10): POST /api/ask answers only from the text of one
// published paper. Proves: a missing slug is 400 no_source and an unknown slug 404 no_source, both without a model call; the
// prompt is process-only; more of the paper is supplied (36000 chars, was 6000) and truncation is stated; an invented DOI, link,
// author citation or figure in the model's answer is removed; a supported answer is kept.
// Run: node qnfo-gateway/ask-ground.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 400) : "")); } };

const prompt = (src.match(/function askSystemPrompt\(paperTitle\) \{([\s\S]*?)\n\}/) || [])[1] || "";
ok(prompt.indexOf("Your memory is not a source") > 0 && /PAPER TEXT/.test(prompt), "prompt is process-only and names memory as no source");
ok(!/QNFO paper|research assistant/.test(prompt), "prompt has no topic or persona");
ok(/ASK_PAPER_MAX = 36000/.test(src) && !/slice\(0, 6e3\)/.test(src.slice(src.indexOf("ASK-GROUND-BEGIN"), src.indexOf("ASK-GROUND-END"))), "36000 characters of the paper are supplied, not 6000");

const longBody = "Intro. The device ran 42 trials in the first run. " + "x ".repeat(20000);
const papers = { real: { title: "A Paper", body_md: "---\nt: 1\n---\nThe device ran 42 trials; the result is stated at https://example.test/real.", abstract: "" }, long: { title: "Long", body_md: longBody, abstract: "" } };
let modelCalls = 0, lastMsgs = null, modelOut = "";
const stmt = (sql) => { const st = { a: [], bind(...a) { st.a = a; return st; }, async first() { if (/FROM papers/.test(sql)) return papers[st.a[0]] || null; return { n: 1 }; }, async run() { return {}; }, async all() { return { results: [] }; } }; return st; };
const env = { LIVING_PAPER: { prepare: stmt }, DB: { prepare: stmt }, AI: { run: async (m, input) => { modelCalls++; lastMsgs = input.messages; return { response: modelOut }; } }, QNFO_BUCKET: { get: async () => null } };
globalThis.fetch = async () => new Response("", { status: 404 });
const gw = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const ask = async (b) => { const r = await gw.fetch(new Request("https://papers.qnfo.org/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }), env, { waitUntil() {} }); let j = null; try { j = await r.json(); } catch (e) {} return { s: r.status, j }; };

let r = await ask({ question: "What happened?" });
ok(r.s === 400 && r.j.error === "no_source" && r.j.answer === null && modelCalls === 0, "no slug: 400 no_source and no model call", r);
r = await ask({ slug: "missing", question: "What happened?" });
ok(r.s === 404 && r.j.error === "no_source" && r.j.answer === null && r.j.grounded === false && modelCalls === 0, "unknown slug: 404 no_source and no model call", r);

modelOut = "The device ran 42 trials [see https://example.test/real]. It was confirmed by Smith et al. (2019), doi 10.9999/invented.1, with a 63.5% gain.\nThe paper does not cover the cost.";
r = await ask({ slug: "real", question: "What happened?" });
ok(r.s === 200 && r.j.grounded === true && /42 trials/.test(r.j.answer) && /does not cover the cost/.test(r.j.answer), "supported statements survive", r);
ok(!/Smith|10\.9999|63\.5/.test(r.j.answer) && r.j.removed_statements >= 1, "invented author citation, DOI and figure are removed", r);
ok(modelCalls === 1 && /42 trials/.test(lastMsgs[1].content) && !/t: 1/.test(lastMsgs[1].content), "the model sees the paper text without front matter");

modelOut = "Totals 12345 units in 2031 per the DOI 10.1/z.";
r = await ask({ slug: "real", question: "What happened?" });
ok(/No part of the generated answer|removed/.test(r.j.answer) && !/12345/.test(r.j.answer), "an answer with nothing supported is replaced by a plain statement", r);

modelOut = "The run is described in the first section.";
r = await ask({ slug: "long", question: "Summarise." });
ok(r.j.source_truncated === true && r.j.source_chars === 36000 && /first 36000 characters/.test(lastMsgs[1].content), "a long paper is supplied up to 36000 characters and the cut is stated", r.j);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
