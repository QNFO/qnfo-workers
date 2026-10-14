// HEADING-LABEL-1 + SENT-LEGAL-ABBREV-1 offline suite (personal-companion 1.28.1, charter pillar: personal; agent_issues 2552).
// Proves, from companion_runs 6525 (2026-10-14 13:13 UTC, wiki:Bush v. Gore, rejected after five fact-prune rounds): "Bush v. Gore" and
// a title or legal abbreviation stay inside one sentence, so deleting the sentence leaves no "Bush v." fragment; the fact prune deletes a
// "## " heading a FACT item quotes and keeps the section's paragraphs; the inference prune and a call without opts leave headings alone;
// a reason that calls an item framing reads as interpretation while a heading naming an unsupported date stays a FACT; the reviewer
// prompt reads headings as labels and the fact-prune loop passes { headings: true }.
// Run: node personal-companion/heading-label.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()).toString("base64"));
const V = mod.__verify;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };

// 1. SENT-LEGAL-ABBREV-1: "v." and title abbreviations do not end a sentence
ok(V.SENT_ABBREV_RE.test("the Court decided Bush v.") && V.SENT_ABBREV_RE.test("signed by Gov.") && V.SENT_ABBREV_RE.test("Martin Luther King Jr.") && V.SENT_ABBREV_RE.test("under Fla. Stat."), "v., Gov., Jr. and Stat. are abbreviations");
ok(!V.SENT_ABBREV_RE.test("the recount was stopped.") && !V.SENT_ABBREV_RE.test("the vote went to Gore.") && !V.SENT_ABBREV_RE.test("in the year 2000."), "an ordinary word, a name or a year still ends a sentence");
const p1 = { lede: "", body_md: "The decision in Bush v. Gore ended the recount. The Court split five to four. Florida certified the result." };
const r1 = V.deleteSentences(p1, (units) => { units.forEach((u) => { if (/ended the recount/.test(u.sn)) u.cut = true; }); });
ok(r1.removed.length === 1 && /^The decision in Bush v\. Gore ended the recount\.$/.test(r1.removed[0]) && /^The Court split/.test(r1.piece.body_md) && !/Bush v\./.test(r1.piece.body_md), "deleting the sentence that holds Bush v. Gore leaves no fragment (run 6525)", r1);
ok(r1.total === 3, "the paragraph has three sentences, not four", r1.total);

// 2. the fact prune deletes a quoted heading; the section keeps its paragraphs
const body = [
  "The recount began in November.", "",
  "## The machine that missed the ballots", "",
  "Punch-card machines left some ballots without a counted vote.", "",
  "## The clock as the real decision-maker", "",
  "The deadline set by state law left little time for a manual count."
].join("\n");
const piece = { title: "Bush v. Gore", lede: "", body_md: body };
const probs = [
  "unsupported claim: The machine that missed the ballots -- heading introduces new framing not in source",
  "unsupported claim: The clock as the real decision-maker -- heading introduces new framing not in source"
];
const r2 = V.pruneUnsupported(piece, probs, { headings: true });
ok(r2.removed.length === 2 && r2.headings === 2 && !/^##/m.test(r2.piece.body_md), "both quoted headings are deleted", r2);
ok(/Punch-card machines left some ballots/.test(r2.piece.body_md) && /The deadline set by state law/.test(r2.piece.body_md) && /The recount began/.test(r2.piece.body_md), "every paragraph stays", r2.piece.body_md);
ok(!/\n{3,}/.test(r2.piece.body_md), "no triple line break where a heading was", r2.piece.body_md);
ok(r2.piece.title === "Bush v. Gore", "the title is never deleted");

// 3. a heading and a sentence quoted together: both go
const r3 = V.pruneUnsupported(piece, [probs[0], "unsupported claim: The deadline set by state law left little time for a manual count -- not in source"], { headings: true });
ok(r3.removed.length === 2 && !/The machine that missed/.test(r3.piece.body_md) && !/The deadline set by state law/.test(r3.piece.body_md) && /## The clock as the real decision-maker/.test(r3.piece.body_md), "a quoted heading and a quoted sentence are both removed, the other heading stays", r3);

// 4. without opts.headings (inference prune, critic prune) headings stay as before
const r4 = V.pruneUnsupported(piece, probs);
ok(r4.removed.length === 0 && /## The machine that missed the ballots/.test(r4.piece.body_md), "without opts the headings are untouched", r4);
// a short heading (under 12 normalised characters) is never matched
const r5 = V.pruneHeadings({ body_md: "## Origins\n\nText here." }, [{ nd: "origins of the dispute in florida", raw: "x", hit: false }]);
ok(r5.removed.length === 0, "a short heading is not matched by a longer needle", r5);

// 5. framing reads as interpretation; a heading naming an unsupported date stays a FACT
const sp = V.splitFactItems(["FACT: The machine that missed the ballots -- heading introduces new framing not in source", "FACT: The ruling of 14 December 2000 -- date not in source"]);
ok(sp.inferences.length === 1 && /machine that missed/.test(sp.inferences[0]) && sp.facts.length === 1 && /14 December 2000/.test(sp.facts[0]), "framing is an inference, a date is a fact", sp);

// 6. wiring
ok(/A heading or the title labels what follows it: list one only when it states a specific fact/.test(V.FACTCHECK_PROMPT || src), "the reviewer prompt reads headings as labels");
ok(/var pr = pruneUnsupported\(finalPiece, vr\.problems, \{ headings: true \}\);/.test(src), "the fact-prune loop removes quoted headings");
ok(/var pi = pruneUnsupported\(finalPiece, vr\.inferences\.map\(function \(u\) \{ return "unsupported claim: " \+ u; \}\)\);/.test(src), "the inference prune does not");

const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 1 || (ver[0] === 1 && (ver[1] > 28 || (ver[1] === 28 && ver[2] >= 1)))), "VERSION is at least 1.28.1", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
