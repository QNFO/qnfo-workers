// COMPANION-SYSTEMS-ANALYSIS-1 offline suite (personal-companion 1.20.0, charter pillar: personal; agent_issues 2222).
// Owner 2026-10-13 11:26 UTC: "q08.org content is totally lacking in context and big-picture systems analysis. Fail, not worth publishing."
// Proves: the writer is required to give context and a systems analysis framed as reasoning; the critic scores systems and the score gates
// every form; the fact-check prompt treats framed analysis as not a violation; a FACT item whose reason calls it analysis is reasoning
// when it carries no name, number or quotation (run 5408's shape), while a figure, a named outlet or a quoted reason stays a FACT.
// Run: node personal-companion/systems-analysis.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()).toString("base64"));
const V = mod.__verify, P = V.prompts;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };
{
  const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
  ok(vm && (+vm[1] > 1 || (+vm[1] === 1 && +vm[2] >= 20)), "VERSION is at least 1.20.0", vm && vm[0]);
}
ok(/CONTEXT AND SYSTEMS ANALYSIS \(required/.test(P.P_STYLE) && /who gains and who pays/.test(P.P_STYLE) && /feedback loop/.test(P.P_STYLE) && /only retells its source is rejected/.test(P.P_STYLE), "the writer must give context and a systems analysis");
ok(/introducing no name, date, number, event or quotation the source material does not contain/.test(P.P_STYLE), "the analysis adds no unsourced name, date, number, event or quotation");
ok(/^systems: /m.test(P.P_CRITIQUE) && /A retelling scores at most 3/.test(P.P_CRITIQUE) && /"systems":n/.test(P.P_CRITIQUE), "the critic scores systems and returns it");
ok(/var dims = form === "notes" \? \["specificity", "argument", "voice", "systems"\] : \["specificity", "argument", "objection", "voice", "systems"\];/.test(src), "the systems score gates every form");
ok(/NOT violations: analysis and interpretation the writer frames as such/.test(P.FACTCHECK_PROMPT), "the fact-check prompt treats framed analysis as not a violation");
{
  const sp = V.splitFactItems([
    "FACT: recognizing this bias is the first step in an audit of his later histories -- analytical claims not stated in source",
    "FACT: the incentive keeps the archive closed -- interpretation, not in source",
    "FACT: the ministry fined 3 schools in 2025 -- analysis not in source",
    "FACT: the review was first reported by Le Monde -- analysis not in source",
    "FACT: recognizing this bias is the first step in an 'epistemic audit' -- 'epistemic audit' is not stated in source",
    "FACT: the road was finished early -- not in source"
  ]);
  ok(sp.inferences.length === 2 && /recognizing this bias/.test(sp.inferences[0]) && /incentive keeps/.test(sp.inferences[1]), "analysis-labelled FACT items without a name, number or quotation are reasoning", sp);
  ok(sp.facts.length === 4 && sp.facts.some((f) => /3 schools/.test(f)) && sp.facts.some((f) => /Le Monde/.test(f)) && sp.facts.some((f) => /epistemic audit/.test(f)) && sp.facts.some((f) => /road was finished/.test(f)), "a figure, a named outlet, a quoted reason or a plain 'not in source' stays a FACT", sp);
}
{
  const v = V.parseFactVerdict('{"unsupported":["FACT: the incentive keeps the archive closed -- interpretation, not in source"],"verdict":"fail"}');
  ok(v && v.verdict === "pass" && v.unsupported.length === 0 && v.inferences.length === 1, "a fail that lists only framed analysis is a pass with the sentence to spare", v);
  const w = V.parseFactVerdict('{"unsupported":["FACT: the ministry fined 3 schools in 2025 -- analysis not in source"],"verdict":"pass"}');
  ok(w && w.verdict === "fail" && w.unsupported.length === 1, "a figure called analysis still fails the draft", w);
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
