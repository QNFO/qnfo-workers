// QUICK-READ-1 offline suite (qnfo-gateway 3.20.0, owner directive 2026-10-19, pillar reach).
// The feature: one paper presented as it answers ONE question — overview, Answers, Approach, Considerations — after
// Google Scholar's Quick Read (2026-08-25). The invariant this suite exists to hold: every statement the page shows
// quotes a sentence of the paper, and a statement whose evidence is not in the text is dropped and counted, never
// softened. Also proved here: a question the paper does not touch is answered without a model call; a failed model
// falls back to a verbatim extractive read; the cache answers the second identical question without spending; the
// GET page makes no model call (a crawler following ?q= costs nothing) while POST renders server-side; and the
// evidence anchors are the very ids the paper page publishes.
// Run: node qnfo-gateway/quick-read.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 400) : "")); } };

const BODY = [
  "---", "title: Energy Floor Of The Controller", "---", "",
  "## Abstract", "",
  "The controller ran 42 trials on the cryostat and measured 1.7 joules per solution under load, which is the main result of this paper.", "",
  "## The energy floor", "",
  "We compute the energy floor of the benchmark from the Landauer bound and compare it with the measured cost of each run.", "",
  "The margin between the two is the headroom the design buys at the thousand-qubit scale.", "",
  "## Method", "",
  "We measure the cost of every run with a calibrated joule counter and we derive the bound from the entropy of the schedule.", "",
  "## Limitations", "",
  "The measurement holds only for schedules that fit inside the controller window, and we assume the counter shares the reference of the cryostat.", "",
  "We do not measure the cost of state preparation, which limits the claim to the compiled part of the pipeline."
].join("\n");

const SLUG = "energy-floor-of-the-controller";
const papers = { [SLUG]: { slug: SLUG, title: "Energy Floor Of The Controller", body_md: BODY, abstract: "", created_at: "2026-10-01", version: "2.0.0" } };

let aiCalls = 0, aiOut = "", lastModel = null, lastUser = null;
const AI = { run: async (model, input) => { aiCalls++; lastModel = model; lastUser = (input.messages && input.messages[1] && input.messages[1].content) || ""; return { response: typeof aiOut === "function" ? aiOut() : aiOut }; } };

function mkEnv() {
  const qr = new Map();
  let n = 0;
  const stmt = (sql) => {
    const st = {
      a: [], bind(...a) { st.a = a; return st; },
      async first() {
        if (/INSERT INTO ask_rate/i.test(sql)) { n++; return { n }; }
        if (/FROM quick_read/i.test(sql)) return qr.get(st.a[0] + "|" + st.a[1]) || null;
        if (/FROM papers/i.test(sql)) return papers[st.a[0]] || null;
        return null;
      },
      async run() {
        if (/INSERT INTO quick_read/i.test(sql)) { qr.set(st.a[0] + "|" + st.a[1], { payload: st.a[3] }); }
        return {};
      },
      async all() { return /FROM papers/i.test(sql) ? { results: Object.values(papers) } : { results: [] }; }
    };
    return st;
  };
  return { LIVING_PAPER: { prepare: stmt }, DB: { prepare: stmt }, AI, RELEASES: { head: async () => null } };
}
globalThis.fetch = async () => new Response("", { status: 404 });
const gw = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const call = (env, url, init) => gw.fetch(new Request(url, init), env, { waitUntil() {} });
const qrGet = async (env, q, extra) => {
  const r = await call(env, "https://papers.qnfo.org/api/quickread/" + SLUG + "?q=" + encodeURIComponent(q) + (extra || ""));
  let body = "";
  const ct = r.headers.get("Content-Type") || "";
  if (ct.indexOf("application/json") === 0) { try { body = await r.json(); } catch (e) { body = null; } } else body = await r.text();
  return { s: r.status, j: body };
};
const postPage = async (env, q) => {
  const r = await call(env, "https://papers.qnfo.org/papers/" + SLUG + "/quickread", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "q=" + encodeURIComponent(q) });
  return { s: r.status, h: await r.text() };
};

const Q = "What did the controller measure about the energy cost of one solution?";

// ---- 1. structure: the anchors are the paper page's own ids
{
  const env = mkEnv();
  const page = await call(env, "https://papers.qnfo.org/papers/" + SLUG);
  const html = await page.text();
  const ids = [...html.matchAll(/<h[234] id="([^"]+)"/g)].map((m) => m[1]);
  ok(ids.length >= 4, "the paper page publishes section ids", ids);
  aiOut = JSON.stringify({
    overview: "The paper measures the joules one solution costs in its own benchmark.",
    answers: [{ point: "It measured 1.7 joules per solution.", evidence: "The controller ran 42 trials on the cryostat and measured 1.7 joules per solution under load, which is the main result of this paper.", section: "Abstract" }],
    approach: [{ point: "It measures cost with a calibrated joule counter.", evidence: "We measure the cost of every run with a calibrated joule counter and we derive the bound from the entropy of the schedule.", section: "Method" }],
    considerations: [{ point: "The claim is limited to the compiled part of the pipeline.", evidence: "We do not measure the cost of state preparation, which limits the claim to the compiled part of the pipeline.", section: "Limitations" }]
  });
  const r = await qrGet(env, Q);
  ok(r.s === 200 && r.j.coverage === "answered" && r.j.method === "model", "a model read answers with coverage answered", r.j);
  ok(r.j.answers.length === 1 && r.j.approach.length === 1 && r.j.considerations.length === 1, "answers, approach and considerations each carry their item", r.j);
  const anchors = r.j.answers.concat(r.j.approach, r.j.considerations).map((x) => x.section);
  ok(anchors.every((a) => ids.indexOf(a) >= 0), "every evidence anchor is an id the paper page publishes", anchors);
  ok(r.j.answers[0].section === ids[0] && r.j.considerations[0].section === "limitations", "evidence is filed under the section it was taken from", anchors);
  ok(/1.7 joules per solution/.test(r.j.answers[0].quote) && /42 trials/.test(r.j.answers[0].quote), "the quote shown is the paper's sentence", r.j.answers[0]);
  ok(lastModel === "@cf/openai/gpt-oss-120b" && /PASSAGES:/.test(lastUser) && /reasoning_effort: "low"/.test(src.slice(src.indexOf("async function qrModel"), src.indexOf("async function qrBuild"))) && /word for word/.test(src.slice(src.indexOf("function qrSystemPrompt"), src.indexOf("function qrParse"))), "QUICK-READ-3: the measured model is used with its working reasoning effort, and the prompt demands verbatim evidence");
}

// ---- 2. the invariant: unquotable statements are dropped and counted, never shown
{
  const env = mkEnv();
  aiCalls = 0;
  aiOut = JSON.stringify({
    overview: "The paper measures joules.",
    answers: [
      { point: "It measured 1.7 joules per solution.", evidence: "The controller ran 42 trials on the cryostat and measured 1.7 joules per solution under load, which is the main result of this paper." },
      { point: "It beats the published baseline by 63.5%.", evidence: "The authors report a 63.5% saving against the published baseline while keeping the same schedule." },
      { point: "It saves 63.5% of the energy.", evidence: "We compute the energy floor of the benchmark from the Landauer bound and compare it with the measured cost of each run." }
    ],
    approach: [], considerations: []
  });
  const r = await qrGet(env, Q + " (fabrication check)");
  ok(r.j.answers.length === 1, "an invented sentence and an invented figure are not shown", r.j.answers);
  ok(r.j.dropped >= 2, "both dropped statements are counted", r.j.dropped);
  ok(!/63\.5/.test(JSON.stringify(r.j.answers)), "no unverifiable figure survives in the answer", r.j.answers);
  ok(r.j.answers[0].quote === "The controller ran 42 trials on the cryostat and measured 1.7 joules per solution under load, which is the main result of this paper.", "the surviving quote is the paper's text, not the model's", r.j.answers[0]);
}

// ---- 3. a failed model still answers, from the paper's own sentences
{
  const env = mkEnv();
  aiCalls = 0;
  aiOut = "I am sorry, but I cannot help with that.";
  const r = await qrGet(env, Q + " (fallback)");
  ok(aiCalls === 1 && r.s === 200, "the model was tried once and the request still answered", { aiCalls, s: r.s });
  ok(r.j.method === "extractive" && r.j.answers.length > 0, "unparseable model output falls back to the extractive read", r.j.method);
  const bodyNorm = BODY.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const allQuotes = r.j.answers.concat(r.j.approach, r.j.considerations).map((x) => x.quote);
  const verbatim = allQuotes.every((q) => bodyNorm.indexOf(q.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()) >= 0);
  ok(allQuotes.length > 0 && verbatim, "every extractive quote is verbatim paper text", allQuotes);
  ok(r.j.considerations.length > 0 && /do not measure|assume|holds only/.test(r.j.considerations.map((x) => x.quote).join(" ")), "the extractive read finds the paper's own caveats", r.j.considerations);
  ok(r.j.overview && r.j.overview.length > 10, "an extractive read still carries an overview", r.j.overview);
}

// ---- 4. a question the paper never uses the words of: no model call, no invention
{
  const env = mkEnv();
  aiCalls = 0;
  const r = await qrGet(env, "How do migratory birds navigate by magnetoreception?");
  ok(r.s === 200 && r.j.coverage === "none", "coverage none for an unrelated question", r.j.coverage);
  ok(aiCalls === 0, "no model call is spent on a question the paper does not touch", aiCalls);
  ok(r.j.answers.length === 0 && r.j.approach.length === 0 && r.j.considerations.length === 0, "nothing is invented for an untouched question", r.j);
  ok((r.j.closest || []).length > 0 && r.j.sections_total >= 4, "the page can name what the paper does cover", r.j.closest);
  const f = await qrGet(env, "How do migratory birds navigate by magnetoreception?", "&format=html");
  ok(typeof f.j === "string" && /does not answer this question/.test(f.j) && /Nothing was generated from outside the text/.test(f.j), "the rendered page says the paper does not answer, and says nothing was invented", String(f.j).slice(0, 300));
}

// ---- 5. the cache answers the second identical question without spending a model call
{
  const env = mkEnv();
  aiCalls = 0;
  aiOut = JSON.stringify({ overview: "Measured.", answers: [{ point: "It measured 1.7 joules per solution.", evidence: "The controller ran 42 trials on the cryostat and measured 1.7 joules per solution under load, which is the main result of this paper." }], approach: [], considerations: [] });
  const a = await qrGet(env, Q + " cache me");
  const b = await qrGet(env, Q + " cache me");
  ok(aiCalls === 1 && a.j.cached === false && b.j.cached === true, "the second call is served from the cache", { aiCalls, first: a.j.cached, second: b.j.cached });
  ok(JSON.stringify(a.j.answers) === JSON.stringify(b.j.answers), "the cached answer is the same answer");
}

// ---- 6. the GET page is a shell (a crawler following ?q= spends nothing); POST renders server-side
{
  const env = mkEnv();
  aiCalls = 0;
  aiOut = JSON.stringify({ overview: "Measured.", answers: [{ point: "It measured 1.7 joules per solution.", evidence: "The controller ran 42 trials on the cryostat and measured 1.7 joules per solution under load, which is the main result of this paper." }], approach: [], considerations: [] });
  const shell = await call(env, "https://papers.qnfo.org/papers/" + SLUG + "/quickread?q=" + encodeURIComponent(Q));
  const sh = await shell.text();
  ok(shell.status === 200 && aiCalls === 0, "GET with ?q= makes no model call", aiCalls);
  ok(/id="qr-q"[^>]*value="What did the controller measure/.test(sh), "the shell carries the question in the form", sh.slice(0, 200));
  ok(/method="post"/.test(sh) && /noindex/.test(sh) && /"rendered":false/.test(sh), "the shell posts, is noindex, and tells the browser it must ask", sh.slice(0, 200));
  ok(/\/api\/quickread\//.test(sh), "the shell asks the JSON endpoint from the browser");
  const p = await postPage(env, Q);
  ok(p.s === 200 && aiCalls === 1, "POST renders the answer on the server", { s: p.s, aiCalls });
  ok(/<h2>Answers<\/h2>/.test(p.h) && /<h2>Approach<\/h2>/.test(p.h) && /<h2>Considerations<\/h2>/.test(p.h), "the POST page carries all three sections", p.h.length);
  ok(/Show details/.test(p.h) && /Quoted from the paper|Read it in the paper/.test(p.h), "each point offers its supporting detail", p.h.length);
  ok(/\d+ of \d+ sections read/.test(p.h.replace(/<[^>]+>/g, " ")), "the page discloses how much of the paper was read", (p.h.match(/\d+ of \d+ sections read[^<]*/) || [])[0]);
}

// ---- 7. rate limit: a burst of distinct questions is capped with 429
{
  const env = mkEnv();
  aiOut = JSON.stringify({ overview: "Measured.", answers: [], approach: [], considerations: [] });
  let last = null;
  for (let i = 0; i < 22; i++) last = await qrGet(env, Q + " burst " + i);
  ok(last.s === 429 && last.j.error === "rate_limited", "the per-address hourly cap answers 429", last);
}

// ---- 8. the entry points exist: index rows under a search, the paper page, and robots
{
  const env = mkEnv();
  const idx = await call(env, "https://papers.qnfo.org/papers?search=energy");
  const ih = await idx.text();
  ok(/\/papers\/[a-z0-9-]+\/quickread"/.test(ih) && /data-qr-q="energy"/.test(ih), "a search result offers Quick read for the typed question", ih.length);
  ok(!/\/quickread\?q=/.test(ih), "the row's href carries no ?q= (ASK-CLIENT-GONE-CRAWL-1: a crawler must not walk into a model call)", (ih.match(/\/quickread[^"']*/) || [])[0]);
  const page = await call(env, "https://papers.qnfo.org/papers/" + SLUG);
  const ph = await page.text();
  ok(/\/papers\/energy-floor-of-the-controller\/quickread/.test(ph) && /Quick read/.test(ph), "the paper page offers Quick read");
  const robots = await call(env, "https://papers.qnfo.org/robots.txt");
  const rh = await robots.text();
  ok(/Disallow: \/\*quickread/.test(rh), "question pages are kept out of the crawl (they are unbounded)", rh);
}

// ---- 9. the source carries the three paths and the deadline, not one shot
{
  const block = src.slice(src.indexOf("QUICK-READ-1:BEGIN"), src.indexOf("QUICK-READ-1:END"));
  ok(/quick_read/.test(block) && /qrCacheGet/.test(block) && /qrBuild/.test(block) && /qrExtractive/.test(block), "the block carries the cache, the model read and the extractive read");
  ok(/QR_TIMEOUT_MS/.test(block) && /clearTimeout\(timer\)/.test(block), "the model call has a deadline that is cleared when it answers");
  ok(/qrNorm\(/.test(block) && /byNorm/.test(block), "evidence is matched in comparison form against the paper's own sentences");
  ok(/noindex/.test(block) && /rendered: !!fragment/.test(block), "the page is noindex and knows whether it was server-rendered");
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
