// ASK-GROUND-2 offline suite (qnfo-ai-search 2.4.0, owner directive 2026-10-10): an answer on ask.qwav.tech is published only
// after it is checked against its excerpts. Proves: the system prompt names no topic and allows no general-knowledge content;
// an invented DOI, link, author citation, figure, missing-excerpt citation or "general knowledge" sentence is removed before
// anything is sent; supported sentences survive; tokens are held back (one checked token event); a question with no excerpt
// gets a fixed no-answer text and no model call; the page names no topics.
// Run: node qnfo-ai-search/ask-ground.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };

// ---- prompts and page ----
const sysBlock = src.slice(src.indexOf("var SYSTEM = ["), src.indexOf("function buildMessages"));
ok(!/p-adic|adelic|ultrametric|topological|JPCUB|QWAV|QNFO/i.test(sysBlock), "system prompt names no topic or program term");
ok(/your memory is not a source/.test(sysBlock) && /Add nothing from general knowledge, labelled or not/.test(sysBlock) && !/without labelling it/.test(sysBlock), "system prompt forbids general knowledge, labelled or not");
const page = src.slice(src.indexOf("<main>"), src.indexOf("</main>"));
ok(!/p-adic|adelic|ultrametric|Compton|Majorana|JPCUB/i.test(page + src.slice(src.indexOf("drawTree([]);") - 200, src.indexOf("drawTree([]);") + 50)), "page lede, placeholder and fallback seeds name no topic");
ok(/drawTree\(\[\]\);/.test(src), "fallback seeds are empty");

// ---- the checker ----
const a = src.indexOf("// ---- ASK-GROUND-BEGIN"), b = src.indexOf("// ---- ASK-GROUND-END ----");
const sb = { Set, String, Number, Array };
vm.createContext(sb);
vm.runInContext(src.slice(a, b) + "\n;__x = { groundBody, groundText, sentenceProblems, groundNums, NO_EXCERPTS_TEXT, NOT_SUPPORTED_TEXT };", sb);
const { groundBody, groundText, NO_EXCERPTS_TEXT, NOT_SUPPORTED_TEXT } = sb.__x;
const sources = [{ n: 1, title: "Paper One", doi: "10.1111/one.1", excerpt: "The device ran 42 trials and reports a ratio of 0.75. See https://example.test/one for details." }, { n: 2, title: "Paper Two", excerpt: "A second excerpt about method." }];
const ground = groundText(sources, "What did it report?", [], null);
const body = [
  "The device ran 42 trials and reports a ratio of 0.75 [1].",
  "A follow-up by Jones et al. (2019) found 91% agreement [2].",
  "It is detailed in 10.9999/made.up and at https://made-up.test/x [1].",
  "The method is described in the second excerpt [2].",
  "As general knowledge, the field settled on 3 standards.",
  "A third source supports this [5]."
].join("\n");
const g = groundBody(body, ground, sources.length);
ok(/42 trials/.test(g.text) && /second excerpt/.test(g.text), "supported sentences survive", g.text);
ok(!/Jones|91|made|general knowledge|\[5\]/.test(g.text) && g.removed >= 4, "invented author citation, DOI, link, general-knowledge sentence and missing citation are removed", g);
ok(groundBody("The excerpts do not cover costs; this is outside the corpus.", ground, 2).text.length > 0, "a plain statement that something is not covered is kept");
ok(groundBody("# Heading only\nIt cost 5000 units.", ground, 2).text === "", "a heading left with nothing under it is not an answer");
ok(groundBody("```js\nconst n = 987654;\n```\nThe ratio is 0.75.", ground, 2).text.indexOf("987654") > 0, "code blocks are untouched");

// ---- end to end ----
let modelCalls = 0, modelText = "";
const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { "content-type": "application/json" } });
let corpus = true;
const PAPERS = [{ slug: "paper-one", title: "Paper One", doi: "10.1111/one.1", abstract: "The device ran 42 trials and reports a ratio of 0.75. ".repeat(6), created_at: "2026-10-01 10:00:00" }];
const gatewayFetch = async (u) => {
  const url = new URL(typeof u === "string" ? u : u.url);
  if (url.host === "papers.qnfo.org" && url.pathname === "/papers") return J({ papers: corpus ? PAPERS : [], total: corpus ? 1 : 0 });
  if (url.host === "graph-api.qnfo.org" && url.pathname === "/nodes") return J({ nodes: [] });
  if (url.host === "graph-api.qnfo.org") return J({ error: "nf" }, 404);
  return J({ error: "unexpected" }, 404);
};
const AI_SEARCH = { get() { return { items: { async upload() { return {}; } }, async search() { return { chunks: corpus ? [{ score: 0.8, text: "# Paper One\n\nThe device ran 42 trials and reports a ratio of 0.75.", item: { key: "paper-one.md" } }] : [] }; } }; }, async list() { return ["c"]; } };
const AI = { async run(model, input) {
  modelCalls++;
  const enc = new TextEncoder();
  return new ReadableStream({ start(c) { for (const p of modelText.match(/[\s\S]{1,16}/g)) c.enqueue(enc.encode("data: " + JSON.stringify({ response: p }) + "\n\n")); c.enqueue(enc.encode("data: [DONE]\n\n")); c.close(); } });
} };
globalThis.caches = { default: { async match() { return undefined; }, async put() {} } };
const env = { AI, AI_SEARCH, GATEWAY: { fetch: gatewayFetch }, IDEAS: { fetch: async () => J({ sessions: [] }) }, SPEND_CAP_TOTAL_USD: "60" };
const dir = mkdtempSync(join(tmpdir(), "askground-"));
writeFileSync(join(dir, "w.mjs"), src);
const { default: worker } = await import(pathToFileURL(join(dir, "w.mjs")).href);
const waits = [], ctx = { waitUntil: (p) => waits.push(p) };
const ask = async (q) => { const r = await worker.fetch(new Request("https://ask.qwav.tech/api/ask", { method: "POST", headers: { "content-type": "application/json", "CF-Connecting-IP": "8.8.8.8" }, body: JSON.stringify({ query: q }) }), env, ctx); const t = await r.text(); await Promise.allSettled(waits.splice(0)); return t; };
const sse = (t, ev) => t.split("\n\n").filter((x) => x.startsWith("event: " + ev)).map((x) => JSON.parse(x.split("data: ")[1]));

modelText = "The device ran 42 trials [1]. It was confirmed by Smith et al. (2020), doi 10.5555/invented.9, with a 63.5% gain [1]. Outside the corpus, it is widely used.\n\nFOLLOWUPS:\n- What did the 42 trials measure?\n- Did Smith et al. replicate it?\n- How was the ratio 0.75 obtained?";
let t = await ask("What did the device do in the trials?");
const toks = sse(t, "token"), done = sse(t, "done")[0];
ok(toks.length === 1, "tokens are held back: exactly one checked token event", toks.length);
ok(toks.length && /42 trials/.test(toks[0].t) && !/Smith|10\.5555|63\.5|Outside the corpus/.test(toks[0].t.split("FOLLOWUPS")[0]), "the published text has no invented citation, DOI, figure or outside-corpus sentence", toks[0] && toks[0].t);
ok(done && done.followups.length === 2 && !done.followups.some((f) => /Smith/.test(f)), "a follow-up naming an author absent from the excerpts is dropped", done);

modelText = "Founded in 1887 by Dr. Nobody (doi 10.7777/x.1).";
modelCalls = 0;
t = await ask("Who founded it?");
ok(sse(t, "token")[0].t === NOT_SUPPORTED_TEXT && modelCalls === 1, "an answer with nothing supported is replaced by the not-covered text", sse(t, "token"));

corpus = false; modelCalls = 0; modelText = "Anything from memory.";
t = await ask("A question the corpus has nothing on?");
ok(modelCalls === 0 && sse(t, "token")[0].t === NO_EXCERPTS_TEXT && sse(t, "done")[0].uncovered === 1, "no excerpt: fixed no-answer text, no model call", t.slice(0, 300));
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
