// COMPANION-REVIEWER-HYGIENE-1 offline suite (personal-companion 1.43.3, charter pillar: personal; agent_issues 1000298). Port of q08-signal-engine
// 0.36.0 Q08-REVIEWER-HYGIENE-1 (q08-signal-engine/reviewer-hygiene.test.mjs) onto the companion's own fact-check classifier. PR 4447 had added one
// regex line to reasonIsInference ("matches source" / "so supported") with no test; that line is replaced by the helpers below.
// Proves: (1) an item a reviewer printed as an object inside a string (plain, fenced, truncated, keyed FACT/INFERENCE or claim/verdict) is unwrapped to
// its claim before classification, so the prune finds the sentence; (2) an item with no claim text is set aside, and a fail that names nothing else
// still fails closed; (3) an item whose closing clause says the claim is supported ("matches source", "so supported", "which the source supports", with
// or without trailing punctuation, labelled or not) is acquitted, and one whose clause or reason denies it (not, no, absent, missing, lacks, unsupported,
// partly, but, a question mark) is not; (4) a fail that names a real unsupported claim still fails, alone or beside an acquitted item or an empty one,
// and the classifier's earlier rules (inference labels, wording-only reasons, reasoning shape) are unchanged.
// No production data is read; every sentence below is invented. Run: node personal-companion/reviewer-hygiene.test.mjs  -> "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { importWorker } from "./_harness-import-worker.mjs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await importWorker(() => (src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()), new URL("./", import.meta.url));
const V = mod.__verify;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 500) : "")); } };
const P = V.parseFactVerdict;
const fc = (items, verdict) => P(JSON.stringify({ unsupported: items, verdict: verdict || "fail" }));

ok(["unwrapJsonItem", "itemHasNoClaim", "reviewerSaysSupported", "factItemText", "splitFactItems"].every((k) => typeof V[k] === "function"), "the helpers are exported");

// ---- 1. an object printed as a string is unwrapped -----------------------------------------------------------------------------------
{
  const a = fc(["{\"fact\":\"FACT: The harbour pilot logged a detailed timeline on a Saturday evening -- date not in source; the source gives no weekday\"}"]);
  ok(a.verdict === "fail" && a.unsupported.length === 1 && a.unsupported[0].startsWith("The harbour pilot logged a detailed timeline") && !/\{"fact"/.test(a.unsupported[0]), "(1) a JSON object printed as a string is unwrapped to its claim", a);
  const b = fc([{ FACT: "The committee met after the court ordered both sides to share the hall -- the source says the meeting followed the ruling" }]);
  ok(b.verdict === "fail" && b.unsupported.length === 1 && b.unsupported[0].startsWith("The committee met after the court"), "(1) an object keyed FACT is unwrapped to its claim", b);
  const c = fc(["{\"fact\":\"FACT: The old tortoise is 190 years old -- the source says roughly"]);
  ok(c.verdict === "fail" && c.unsupported[0].startsWith("The old tortoise is 190 years old") && !/\{"fact"/.test(c.unsupported[0]), "(1) a truncated object string still yields its claim", c);
  const d = fc(["{\"fact\":\"INFERENCE: the incentive is to ship early -- reasoning from the source\"}"]);
  ok(d.verdict === "pass" && d.inferences.length === 1 && d.unsupported.length === 0, "(1) an unwrapped INFERENCE item does not fail the draft", d);
  const e = fc(["{\"claim\":\"The ferry carried 40 passengers on the first crossing\",\"reason\":\"number not in source\",\"verdict\":\"unsupported\"}"]);
  ok(e.verdict === "fail" && e.unsupported.length === 1 && e.unsupported[0] === "The ferry carried 40 passengers on the first crossing -- number not in source", "(1) a claim/reason/verdict object in a string becomes 'claim -- reason'", e);
  const f = fc(["```json\n{\"claim\":\"The ferry carried 40 passengers on the first crossing\",\"verdict\":\"fail\"}\n```"]);
  ok(f.verdict === "fail" && f.unsupported.length === 1 && f.unsupported[0] === "The ferry carried 40 passengers on the first crossing", "(1) a fenced object is unwrapped too", f);
  const g = fc(["{\"label\":\"FACT\",\"claim\":\"The mill closed in the spring\",\"reason\":\"season not in source\"}"]);
  ok(g.verdict === "fail" && g.unsupported[0] === "The mill closed in the spring -- season not in source", "(1) an object with label, claim and reason keeps the label rule and the reason", g);
  // plain text is not touched
  ok(V.unwrapJsonItem("{curly} remark about the lock -- note") === "{curly} remark about the lock -- note" && V.unwrapJsonItem("FACT: the lock opened -- date not in source") === "FACT: the lock opened -- date not in source", "(1) text that is not an object string is returned as it came");
  ok(V.factItemText(null) === "" && V.factItemText(7) === "7" && V.factItemText({ claim: "x claim here", reason: "r" }) === "x claim here -- r", "(1) the earlier object, null and number forms still read as before");
  // the prune can find the sentence once it is unwrapped (the JSON text never occurs in a draft)
  const piece = { title: "T", lede: "", body_md: "The first sentence sets out the harbour and its long quays for readers. The harbour pilot logged a detailed timeline on a Saturday evening in the log. A closing sentence returns to the quays and the tide tables.", objection: "" };
  const wrapped = "{\"fact\":\"FACT: The harbour pilot logged a detailed timeline on a Saturday evening -- date not in source\"}";
  const viaUnwrap = V.pruneUnsupported(piece, ["unsupported claim: " + fc([wrapped]).unsupported[0]]);
  ok(viaUnwrap.removed.length === 1 && !/harbour pilot logged/.test(viaUnwrap.piece.body_md) && /first sentence sets out/.test(viaUnwrap.piece.body_md), "(1) the unwrapped claim lets the prune delete the sentence it names and only that one", viaUnwrap.removed);
}

// ---- 2. items with no claim text ---------------------------------------------------------------------------------------------------------------
{
  const only = fc(["reason"]);
  ok(only.verdict === "fail" && only.unsupported.length === 1 && /without naming a claim/.test(only.unsupported[0]) && only.acquitted === 0, "(2) a fail whose only item has no claim still fails closed", only);
  const dash = fc(["-- The date is in the source, but the claim that it 'matters' is an inference"]);
  ok(dash.verdict === "fail" && /without naming a claim/.test(dash.unsupported[0]), "(2) an item that is only a reason names nothing, and the fail stands", dash);
  for (const empty of ["FACT: -- reason", "claim", "none", "null", "FACT:   ", "INFERENCE: reason -- because"]) {
    const r = fc([empty]);
    ok(r.verdict === "fail" && /without naming a claim/.test(r.unsupported[0]) && r.unsupported.length === 1, "(2) '" + empty + "' is set aside and the fail still closes", r);
  }
  const several = fc(["reason", "claim", "-- why"]);
  ok(several.verdict === "fail" && /without naming a claim/.test(several.unsupported[0]), "(2) only contentless items remain: fail closed", several);
  const withReal = fc(["reason", "FACT: The firm laid off 40 staff in May -- number not in source"]);
  ok(withReal.verdict === "fail" && withReal.unsupported.length === 1 && /40 staff/.test(withReal.unsupported[0]), "(2) an empty item beside a real one is dropped and the real one fails the draft", withReal);
  ok(fc(["reason"], "pass").verdict === "pass", "(2) a pass that lists only an empty item stays a pass (no claim, no failure)");
  ok(P("{\"unsupported\":[\"a\"],\"verdict\":\"pass\"}").verdict === "fail", "(2) a one-letter claim is still a claim (the existing contract)");
  ok(P("{\"unsupported\":[],\"verdict\":\"pass\"}").verdict === "pass" && P("{\"unsupported\":[],\"verdict\":\"pass\"}").acquitted === 0, "no items and a pass is a pass");
  ok(P("{\"unsupported\":[],\"verdict\":\"fail\"}").verdict === "fail" && /without naming a claim/.test(P("{\"unsupported\":[],\"verdict\":\"fail\"}").unsupported[0]), "a bare fail with no items is a fail (the existing contract)");
  ok(P("no json at all") === null && P("{\"verdict\":\"maybe\"}") === null, "junk and an unknown verdict still give no verdict");
}

// ---- 3. a closing clause that says the claim is supported ------------------------------------------------------------------------------------
{
  const claim = "The canal reopened to barge traffic after the repairs";
  const supported = ["matches source", "matches source.", "Matches source!", "matches the source", "matched source", "it matches source", "so supported", "so supported.", "So supported)", "the dates agree, so supported", "and it matches source", "the figure appears twice and matches source",
    "it is in the source material, so supported", "it is supported by the source", "supported", "in source", "in the source", "it is in the source", "this is fully supported", "which the source supports", "which the source supports.", "which the source confirms",
    "the source supports it", "the source confirms this", "therefore supported", "thus in the source", "still, it is in the source material, so supported", "the source says 12 but not about the cost; still, it is in the source material, so supported"];
  for (const reason of supported) {
    for (const label of ["FACT: ", ""]) {
      const r = fc([label + claim + " -- " + reason]);
      ok(r.verdict === "pass" && r.unsupported.length === 0 && r.acquitted === 1 && r.inferences.length === 0, "(3) '" + label + "... -- " + reason + "' is acquitted", r);
    }
  }
  const mixed = fc(["FACT: the cost is about $2.5 -- it is in the source material, so supported", "FACT: the fund was set up in 2019 -- year not in source"]);
  ok(mixed.verdict === "fail" && mixed.unsupported.length === 1 && /2019/.test(mixed.unsupported[0]) && mixed.acquitted === 1, "(3) an acquitted item beside a real one leaves only the real one", mixed);
  const split = V.splitFactItems(["FACT: the cost is about $2.5 -- matches source", "the lock opened early -- date not in source"]);
  ok(split.acquitted.length === 1 && split.facts.length === 1 && split.inferences.length === 0 && /the cost is about \$2\.5/.test(split.acquitted[0]), "(3) splitFactItems returns facts, inferences and acquitted", split);
  ok(V.reviewerSaysSupported("a claim without any reason") === false && V.reviewerSaysSupported("") === false, "(3) an item with no reason is never acquitted");
}

// ---- 3b. a clause or reason that denies the support is not an acquittal -----------------------------------------------------------------------------
{
  const claim = "The grant was announced on 4 March by the foundation";
  const denied = ["date not in source", "the claim is not supported", "unsupported", "partly supported", "partially in source", "supported in part but the date is invented", "the source supports the date but not the claim", "not entirely in source",
    "not directly stated in source", "only partially in source", "the number is wrong; the source says 12, so not supported", "matches source? no, absent", "matches source?", "matches source, no", "does not match source", "no, it does not match source",
    "absent from the source, so supported", "missing from source, so supported", "the source lacks the date, so supported", "it matches source but the name is invented", "so supported? the source says nothing about it", "not in source, matches source",
    "source does not mention it; so supported", "it is not in the source", "never in source", "isn't supported", "cannot be supported", "unsupported by the source", "supported by nothing", "matches source only in part"];
  for (const reason of denied) {
    // a FACT-labelled item fails; an unlabelled one is read by the rules that were already there (some reasons, such as "partially in source", make
    // it an inference to prune), but it is never an acquittal: it stays a finding the draft pays for
    const lab = fc(["FACT: " + claim + " -- " + reason]);
    ok(lab.verdict === "fail" && lab.unsupported.length === 1 && lab.acquitted === 0, "(3b) 'FACT: ... -- " + reason + "' is NOT acquitted and fails", lab);
    const unl = fc([claim + " -- " + reason]);
    ok(unl.acquitted === 0 && unl.unsupported.length + unl.inferences.length === 1, "(3b) '... -- " + reason + "' (unlabelled) is NOT acquitted and stays a finding", unl);
  }
}

// ---- 4. real failures still fail; the earlier classifier rules are unchanged -----------------------------------------------------------------------------------
{
  const real = fc(["FACT: The harbour opened in 1952 -- date not in source"]);
  ok(real.verdict === "fail" && real.unsupported.length === 1 && real.acquitted === 0, "(4) a fail naming a real unsupported claim still fails", real);
  const realUnlabelled = fc(["The harbour opened in 1952 -- source does not mention iron tools"]);
  ok(realUnlabelled.verdict === "fail" && realUnlabelled.unsupported.length === 1, "(4) an unlabelled real item still fails", realUnlabelled);
  const twoJudges = [fc(["FACT: The harbour opened in 1952 -- matches source"]), fc(["FACT: The harbour opened in 1952 -- date not in source"])];
  ok(twoJudges[0].verdict === "pass" && twoJudges[1].verdict === "fail", "(4) one reviewer acquitting does not change what another reviewer's verdict says");
  const inf = fc(["INFERENCE: so the builders worked under pressure -- reasoning from the source"]);
  ok(inf.verdict === "pass" && inf.inferences.length === 1 && inf.acquitted === 0, "(4) a labelled INFERENCE is still an inference, not an acquittal", inf);
  const paraphrase = fc(["The quay was called the long wall -- paraphrase, not a direct quote"]);
  ok(paraphrase.verdict === "pass" && paraphrase.inferences.length === 1, "(4) a wording-only reason is still an inference", paraphrase);
  const reasoning = fc(["Their reliance on oak underscores a commitment to craft -- analytical claim not stated in source"]);
  ok(reasoning.verdict === "pass" && reasoning.inferences.length === 1, "(4) reasoning with an analysis reason is still an inference", reasoning);
  const factWithYear = fc(["The harbour opened in 1952 -- year not in source, paraphrase"]);
  ok(factWithYear.verdict === "fail", "(4) a reason that names a year keeps the item a fact", factWithYear);
  const fallbackShape = P("The model wrote some prose first. {\"unsupported\": [\"FACT: The harbour opened in 1952 -- date not in source\"], \"verdict\": \"fail\"");
  ok(fallbackShape && fallbackShape.verdict === "fail" && fallbackShape.unsupported.length === 1 && fallbackShape.acquitted === 0, "(4) a reply cut off before the closing brace still gives its verdict and items", fallbackShape);
  ok(V.itemHasNoClaim("FACT: The harbour opened in 1952 -- date not in source") === false && V.itemHasNoClaim("reason") === true && V.itemHasNoClaim("") === true, "(4) itemHasNoClaim reads a real claim as a claim");
}

// ---- the code: the marker, the replaced line --------------------------------------------------------------------------------------------------------
{
  const fn = src.slice(src.indexOf("function reasonIsInference(item) {"), src.indexOf("var REASONING_MARK_RE"));
  ok(/COMPANION-REVIEWER-HYGIENE-1/.test(src) && /function unwrapJsonItem\(/.test(src) && /function itemHasNoClaim\(/.test(src) && /function reviewerSaysSupported\(/.test(src) && /var SUPPORTED_CLAUSE_RE = /.test(src), "the source names the change and holds the four helpers");
  ok(fn.length > 100 && !/matches source\|so supported/.test(fn), "the single regex line PR 4447 added to reasonIsInference is gone");
  ok(/if \(wordingOnly\(reason\)\) return true;\n  return \(INFERENCE_REASON_RE\.test\(reason\) \|\| saysSupported\) && !FACT_REASON_RE\.test\(reason\);/.test(fn), "reasonIsInference is otherwise as it was");
  const sp = src.slice(src.indexOf("function splitFactItems(items) {"), src.indexOf("function parseFactVerdict(text) {"));
  ok(sp.indexOf("itemHasNoClaim(s)") > 0 && sp.indexOf("reviewerSaysSupported(s)") > sp.indexOf("itemHasNoClaim(s)") && sp.indexOf("reviewerSaysSupported(s)") < sp.indexOf("claimIsReasoning(rest, true)"), "splitFactItems sets contentless items aside, then acquits, before it classifies");
  const pv = src.slice(src.indexOf("function parseFactVerdict(text) {"), src.indexOf("function aiReplyText("));
  ok(/if \(u\.length\) v = "fail";\n  else if \(v === "fail" && !sp\.inferences\.length && !sp\.acquitted\.length\) u = \["the reviewer rejected the draft without naming a claim"\];/.test(pv), "parseFactVerdict still fails closed on a fail that names nothing");
  ok((src.split("\n").find((l) => l.startsWith("var VERSION")) || "").length < 200, "the VERSION line stays short (VERSION-LINE-NOTES-COMPANION-1)");
  const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
  ok(ver.length === 3 && (ver[0] > 1 || (ver[0] === 1 && (ver[1] > 43 || (ver[1] === 43 && ver[2] >= 3)))), "VERSION is at least 1.43.3", ver);
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
