// ACCURACY-GROUND-1 offline suite (qnfo-research-exec 0.12.0, owner directive 2026-10-10: generated text states only what the
// supplied text states). No network, synthetic data. Proves:
//  1. the errata drafter prompt requires every name, year, figure, title, DOI and link to come from the email or the paper, and
//     a corrected reference the email does not supply makes the draft high risk (a model-recalled citation is never "low");
//  2. a correction whose names, years and links are in the email or paper stays as the drafter rated it;
//  3. the same code is in errata-hub, qnfo-errata-respond and the research-exec members (line for line);
//  4. the writer / reconcile / review preambles tie every statement about a cited work to its supplied bibliography entry and
//     ask for a note when the entry is thin; the shared preamble stays long enough to be a cached prefix;
//  5. no example nouns remain in the errata drafter's version-label hint.
// Run: node qnfo-research-exec/ground.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import vm from "node:vm";
const rd = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const host = rd("./worker.js"), hub = rd("../errata-hub/worker.js"), resp = rd("../qnfo-errata-respond/worker.js"), reviser = rd("../qnfo-paper-reviser/worker.js");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

function load(src) {
  const a = src.indexOf("// ACCURACY-GROUND-1"), b = src.indexOf("function insertClarification(");
  if (a < 0 || b < a) throw new Error("grounding block not found");
  const ctx = vm.createContext({ MODEL: "stub", __name: (f) => f, console, JSON, String, Object, Array, Math, Number });
  return vm.runInContext("(function(){" + src.slice(a, b) + "\nreturn { ungroundedTerms, enforceCorrectionGrounding, correctionGroundingProblems, draftCorrection };})()", ctx);
}
const G = load(hub);

const paper = { title: "On the Ledger Model", body_md: "# On the Ledger Model\n\nThe ledger approach follows Alvarez [3]. See [3] for the original treatment.\n\n## References\n\n[3] Alvarez, M. A Ledger Account. 2011." };
const item = { sender: "Jordan Lee <jordan@example.org>", subject: "Miscitation in reference 3", claim: "Reference [3] should be Alvarez and Ng, 2012, doi 10.1000/led.77, not Alvarez 2011." };

// 1. model-recalled citation
{
  const corr = { risk: "low", clarification: "Reference [3] is Alvarez and Okafor (2014), published in the Annals of Bookkeeping, doi 10.5555/zzz.", anchor: "See [3] for the original treatment.", acknowledgement: "We thank Jordan Lee.", changelog: "Corrected reference 3." };
  const probs = G.enforceCorrectionGrounding(corr, item, paper);
  ok(probs.length >= 3 && corr.risk === "high", "a recalled author, year, venue and DOI make the draft high risk", probs);
  ok(probs.some((p) => /Okafor/.test(p)) && probs.some((p) => /2014/.test(p)) && probs.some((p) => /10\.5555/.test(p)), "the unsupported name, year and DOI are each named", probs);
  ok(/ERRATA-GROUND-1/.test(corr.judge_note || ""), "the reason is recorded on the draft for the owner receipt", corr.judge_note);
}
// 2. supplied citation
{
  const corr = { risk: "low", clarification: "Reference [3] should read Alvarez and Ng, 2012, doi 10.1000/led.77.", anchor: "See [3] for the original treatment.", acknowledgement: "We thank Jordan Lee for this correction.", changelog: "Corrected reference 3 (v1.0.1).", version: "1.0.1" };
  const probs = G.enforceCorrectionGrounding(corr, item, paper);
  ok(probs.length === 0 && corr.risk === "low", "a correction copied from the email stays as rated", probs);
}
// 3. unsupported link only
{
  const corr = { risk: "low", clarification: "Reference [3] is available at https://example.com/ledger.pdf.", anchor: "x", acknowledgement: null, changelog: "Corrected." };
  ok(G.enforceCorrectionGrounding(corr, item, paper).some((p) => /link or identifier/.test(p)) && corr.risk === "high", "a link in neither the email nor the paper is rejected");
}
// 4. drafter prompt
{
  let seen = "";
  const env = { AI: { async run(m, input) { seen = input.messages[0].content; return { response: '{"risk":"high","clarification":null,"anchor":null,"position":"after","acknowledgement":null,"changelog":null,"version":null}' }; } } };
  await G.draftCorrection(env, item, paper);
  ok(/must be copied from the ERRATA EMAIL or the PAPER/.test(seen) && /your own memory is not a source/.test(seen) && /set risk to high/.test(seen), "the drafter prompt requires email or paper support for a corrected reference");
  ok(!/e\.g\. 1\.1/.test(seen) && /numbering scheme the paper already uses/.test(seen), "the version-label hint carries no example value");
}
// 5. same code everywhere
{
  for (const [name, src] of [["errata-hub", hub], ["qnfo-errata-respond", resp]]) {
    const a = src.indexOf("var GROUND_ALLOW"), b = src.indexOf("async function draftCorrection(");
    ok(a > 0 && host.includes(src.slice(a, b)), name + " grounding block is in the research-exec member, line for line");
    ok(src.includes("enforceCorrectionGrounding(corr, item, paper);") && src.includes("must be copied from the ERRATA EMAIL or the PAPER"), name + " gates the draft and states the rule");
  }
  ok(host.includes("enforceCorrectionGrounding(corr, item, paper);"), "the research-exec member gates the draft");
  const r = reviser.indexOf("var GROUND_ALLOW"), e = reviser.indexOf("function auditPrompt(");
  ok(r > 0 && host.includes(reviser.slice(r, e)), "the reviser guard is in the research-exec member, line for line");
}
// 5b. the classifier cannot invent the DOI it routes a correction to
{
  const line = "let doi = cls.paper_doi && ((e.subject || \"\") + \" \" + (e.body_text || \"\")).toLowerCase().indexOf(String(cls.paper_doi).toLowerCase()) >= 0 ? cls.paper_doi : null;";
  for (const [name, src] of [["errata-hub", hub], ["qnfo-errata-watch", rd("../qnfo-errata-watch/worker.js")], ["qnfo-research-exec", host]]) ok(src.includes(line) && !src.includes("let doi = cls.paper_doi || null;"), name + ": a model-named DOI must occur in the email");
}
// 6. preambles
{
  const a = host.indexOf("var RESEARCH_SHARED_PREAMBLE = ["), b = host.indexOf('].join("\\n");', a);
  const pre = host.slice(a, b);
  ok(/derivable from that entry's own supplied text/.test(pre) && /your memory of a work is not a source/.test(pre) && /supplied gives no further detail/.test(pre), "the writer rule ties statements about a cited work to its supplied entry and asks for a thin-entry note");
  ok(/Keep only statements about a work that its supplied entry supports/.test(pre), "the reconcile rule drops statements added from memory");
  ok(/Source support: any statement about what a cited work did/.test(pre), "the review rule flags unsupported statements about cited works as HARD");
  ok(!/what they did, how it relates to your argument/.test(pre), "the old permissive wording is gone");
  ok(pre.length > 4096, "the shared preamble is still longer than the 4096-char cache-affinity window", pre.length);
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
