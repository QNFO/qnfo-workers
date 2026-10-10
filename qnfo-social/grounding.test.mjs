// SOCIAL-GROUND-1 offline suite (qnfo-social 0.11.0): a thread is queued only when every capitalised name, year and figure in it
// occurs in the title, author or abstract it was written from (mechanical, no model can override it) AND the LLM checker returns a
// clean verdict; an unavailable checker returns null (the callers hold the thread as a draft). The composer and checker prompts
// state that the model's own knowledge is not a source and name no example topics. Run: node qnfo-social/grounding.test.mjs
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const dir = mkdtempSync(join(tmpdir(), "gr-"));
writeFileSync(join(dir, "w.mjs"), src + "\nexport { checkThread };\n");
const W = await import(join(dir, "w.mjs"));
let fails = 0, passes = 0;
const ok = (c, m, x) => { if (c) passes++; else { fails++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

const title = "Energy Cost Of A Single Inference Step";
const abstract = "We measure the energy used by one inference step of a small model and report 3.2 joules per step across 12 runs. The authors note the measurement excludes cooling.";
const doi = "10.1000/t.23105375";
const AUTHOR = "Rowan Brad Quni-Gudzinas";
const goodPosts = [
  "One inference step of a small model uses a measurable amount of energy.",
  "The authors report 3.2 joules per step across 12 runs.",
  "The measurement excludes cooling, so it is a floor, not a total.",
  "Check the numbers yourself; the paper is open access.",
  "Author: " + AUTHOR + ". Paper: https://doi.org/" + doi + " What would you measure next?"
];

// ---- mechanical check ----
ok(W.threadGroundingIssues(title, abstract, goodPosts, doi).length === 0, "a grounded thread (author, link, figures from the abstract) has no issues", W.threadGroundingIssues(title, abstract, goodPosts, doi));
const bad = goodPosts.slice(); bad[1] = "The authors report 9.7 joules per step across 40 runs, as Acme Labs found in 2031.";
const iss = W.threadGroundingIssues(title, abstract, bad, doi);
ok(iss.length >= 4 && iss.every((i) => i.post === 2), "an invented figure, name and year are each rejected, on the right post", iss);
ok(iss.some((i) => /9\.7/.test(i.issue)) && iss.some((i) => /Acme/.test(i.issue)) && iss.some((i) => /2031/.test(i.issue)), "figure, name and year all named", iss);
const hedged = goodPosts.slice(); hedged[2] = "This could help Contoso Bank cut its power bill by 20 percent.";
ok(W.threadGroundingIssues(title, abstract, hedged, doi).length >= 2, "hedged invented claims are rejected too");
ok(W.threadGroundingIssues(title, abstract, ["A post by Someone Else."], doi).some((i) => /Someone Else/.test(i.issue)), "an author name that is not the paper's author is rejected");
ok(W.threadGroundingIssues(title, abstract, ["Link https://doi.org/10.1000/t.23105375 only."], doi).length === 0, "the paper link is not counted as a figure");

// ---- checkThread: mechanical first, then the model; outage fails closed ----
let calls = 0;
const mkEnv = (reply) => ({ DB: { prepare: () => { const st = { bind: () => st, run: async () => ({}), first: async () => ({ n: 1, m: 0 }), all: async () => ({ results: [] }) }; return st; } }, AI: { run: async (model, input) => { calls++; if (reply instanceof Error) throw reply; return { response: reply }; } } });
{
  calls = 0;
  const r = await W.checkThread(mkEnv("[]"), title, abstract, bad, doi);
  ok(Array.isArray(r) && r.length >= 4 && calls === 0, "an invented name/figure is an issue even when the model would say []; no model call is spent", { r, calls });
}
{
  calls = 0;
  const r = await W.checkThread(mkEnv("[]"), title, abstract, goodPosts, doi);
  ok(Array.isArray(r) && r.length === 0 && calls === 1, "grounded thread + clean checker verdict = faithful", { r, calls });
}
{
  const r = await W.checkThread(mkEnv('[{"post": 2, "issue": "overclaim"}]'), title, abstract, goodPosts, doi);
  ok(Array.isArray(r) && r.length === 1, "grounded thread + checker finding = issue");
}
{
  calls = 0;
  const r = await W.checkThread(mkEnv("Looks fine to me."), title, abstract, goodPosts, doi);
  ok(r === null && calls === 2, "unparseable checker reply twice = null (unavailable; callers hold the thread as a draft)", { r, calls });
}
{
  let threw = false, r;
  try { r = await W.checkThread(mkEnv(new Error("AI down")), title, abstract, goodPosts, doi); } catch (e) { threw = true; }
  ok(threw || r === null, "a checker outage never returns a clean verdict");
}

// ---- prompts: process and style only ----
const cp = W.composePrompt(doi, title, abstract).split("Title: ")[0];
ok(/Your own knowledge is not a source/.test(cp) && /state results no more strongly than the abstract/.test(cp), "composer prompt: own knowledge is not a source");
ok(!/falsifiab/i.test(cp), "composer prompt no longer asks for a falsifiability claim the abstract may not make");
const cps = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const checkerPrompt = cps.slice(cps.indexOf("async function checkThread"), cps.indexOf("function parseIssues"));
ok(/Your own knowledge does not count as support/.test(checkerPrompt), "checker prompt: own knowledge does not count");
ok(!/health|climate|energy|money|\bbills?\b|habit|medic|finance|medieval|guild/i.test(cp + checkerPrompt.replace(/PAPER:.*$/m, "")), "generative and checker instructions name no example topics", (cp + checkerPrompt).match(/health|climate|energy|money|bill|habit|medic|finance|medieval|guild/i));

console.log((fails ? "FAILED " : "OK ") + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
