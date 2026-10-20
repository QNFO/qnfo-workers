// PAPER-COMPLETE-1 / REFS-MOJIBAKE-1 (0.14.0) suite: completeness detection, continuation stitching, middle-section insertion,
// mojibake repair and the prompt rules. Offline, no bindings.
// Run: node qnfo-research-exec/paper-complete.test.mjs
import assert from "node:assert/strict";
import { paperCompleteness, danglingSectionRefs, repairDanglingSectionRefs, completionBase, stitchContinuation, insertSection, fixMojibake, RESEARCH_SHARED_PREAMBLE } from "./worker.js";
import { readFileSync } from "node:fs";

const para = (s) => s + " ".repeat(1) + "This sentence carries the argument forward with enough words to count as a real paragraph of prose.";
const sec = (n, h, body) => "## " + n + ". " + h + "\n\n" + para(body) + "\n\n" + para(body + " More") + "\n";
const refs = "## References\n\n[1] A work. arXiv:2401.00001.\n[2] Another work. arXiv:2401.00002.\n";
const full = [
  "# A Title\n", "## Abstract\n\n" + para("Abstract text.") + "\n",
  sec(1, "Introduction", "We study X; see Section 6."), sec(2, "Background and Related Work", "Prior work [1]."),
  sec(3, "Methods", "We model it."), sec(4, "Analysis", "We derive $a = 1$."), sec(5, "Results", "The result is 1."),
  sec(6, "Discussion", "Limits."), sec(7, "Practical Implications and Engineering Pathways", "Users and build path."),
  sec(8, "Conclusion", "It holds."), refs
].join("\n");

// A complete paper passes.
let pc = paperCompleteness(full);
assert.equal(pc.complete, true, pc.reasons.join("; "));

// The published factoring-hardness shape: cut inside display math after 4.2, mechanical references appended, Section 6 cited.
const cut = full.split("## 5. Results")[0].replace(/\s+$/, "") + "\n\n**Step 4: break-even prior.**\n\n$$\nC_b\\, d = 200 \\times 0.6,\n\\qquad\np\n\n" + refs;
pc = paperCompleteness(cut);
assert.equal(pc.complete, false);
assert.equal(pc.truncated, true);
assert.ok(pc.reasons.some((r) => /ends mid-text/.test(r)), pc.reasons.join("; "));
assert.ok(pc.reasons.some((r) => /cites missing section 6/.test(r)), pc.reasons.join("; "));
assert.deepEqual(pc.tailMissing, ["Results", "Discussion", "Practical", "Conclusion"]);

// Mid-sentence and mid-list cuts are caught; a table row, a closed $$ block and a horizontal rule are clean endings.
for (const tail of ["so $S_{50} = 0.421519 + 0.026850 = 0", "Since $0.46112 <", "- $n=2", "(checked: $2^{61} = 2{,}305{"]) {
  assert.equal(paperCompleteness(full.replace("## References", tail + "\n\n## References")).complete, false, tail);
}
for (const tail of ["| a | b |", "$$\nx = 1\n$$", "It ends here."]) {
  assert.equal(paperCompleteness(full.replace("## References", "Extra paragraph.\n\n" + tail + "\n\n## References")).complete, true, tail);
}

// completionBase drops the reference list and the unfinished paragraph (including the open $$ block).
const base = completionBase(cut);
assert.ok(!/## References/.test(base));
assert.ok(!/\\qquad/.test(base) && !/\$\$/.test(base.split("**Step 4")[1] || ""), base.slice(-200));
assert.ok(/\*\*Step 4: break-even prior\.\*\*$/.test(base.trim()), base.slice(-80));

// Stitching keeps new sections, drops a restarted section and a restated References list, and strips a code fence.
const cont = "```markdown\n## 4. Analysis\n\nRestarted analysis that must be dropped.\n\n## 5. Results\n\n" + para("New results.") + "\n\n## 6. Discussion\n\n" + para("New discussion.") + "\n\n## References\n\n[1] Dup.\n```";
const st = stitchContinuation(base, cont);
assert.ok(/## 5\. Results/.test(st) && /## 6\. Discussion/.test(st));
assert.equal((st.match(/^## 4\. Analysis/gm) || []).length, 1);
assert.ok(!/Restarted analysis/.test(st) && !/## References/.test(st) && !/```/.test(st));

// A plain-paragraph continuation (no heading first) is kept.
const st2 = stitchContinuation("## 4. Analysis\n\nFirst part.", "Second part of the section.\n\n## 5. Results\n\nR.");
assert.ok(/First part\.\n\nSecond part/.test(st2));

// Inserting the Practical section before an old-numbered Conclusion renumbers the Conclusion and the references to it.
const old = full.replace(/## 7\. Practical[\s\S]*?(?=## 8\. Conclusion)/, "").replace("## 8. Conclusion", "## 7. Conclusion").replace("see Section 6.", "see Section 7.");
pc = paperCompleteness(old);
assert.equal(pc.complete, false);
assert.deepEqual(pc.middleMissing, ["Practical"]);
assert.equal(pc.truncated, false);
const ins = insertSection(old, "Practical", "## 7. Practical Implications and Engineering Pathways\n\n" + para("Who uses it, how it is built."));
assert.ok(/## 7\. Practical Implications/.test(ins) && /## 8\. Conclusion/.test(ins), ins.slice(-900));
assert.ok(/see Section 8\./.test(ins));
assert.ok(ins.indexOf("## 7. Practical") < ins.indexOf("## 8. Conclusion") && ins.indexOf("## 8. Conclusion") < ins.indexOf("## References"));
assert.equal(paperCompleteness(ins).complete, true, paperCompleteness(ins).reasons.join("; "));

// Legacy mode (published-paper sweep) does not demand the new Practical section, but still catches a cut.
assert.equal(paperCompleteness(old, { legacy: true }).complete, true);
assert.equal(paperCompleteness(cut, { legacy: true }).complete, false);

// XREF-REPAIR-1 (0.28.2, agent_issues 2671): a "Section N" above the highest numbered heading in an otherwise complete paper is
// still reported (complete stays false, so review, revise and verify still bounce it to `complete`), but it is no longer a sign of
// a cut, so `complete` rewords it instead of asking a model to continue a paper that has nothing left to continue.
const full12 = full.replace("see Section 6.", "see Section 12.");
pc = paperCompleteness(full12);
assert.equal(pc.complete, false);
assert.equal(pc.truncated, false, "a dangling reference alone is not a cut");
assert.deepEqual(pc.dangling, [12]);
assert.deepEqual(pc.reasons, ["cites missing section 12"]);
assert.deepEqual(pc.middleMissing, []);
assert.equal(pc.maxSec, 8);
// A cut paper stays truncated whatever else it cites: a cut inside text, a missing tail, a heading with no body.
assert.equal(paperCompleteness(cut).truncated, true);
const cutClean = full.split("## 5. Results")[0].replace(/\s+$/, "") + "\n\n" + refs;
pc = paperCompleteness(cutClean);
assert.equal(pc.truncated, true, "a paper cut at a paragraph end with the later sections gone is truncated");
assert.deepEqual(pc.tailMissing, ["Results", "Discussion", "Practical", "Conclusion"]);
assert.ok(pc.reasons.some((r) => /cites missing section 6/.test(r)));
const thin = full12.replace(/## 8\. Conclusion[\s\S]*?(?=## References)/, "## 8. Conclusion\n\nIt holds.\n\n");
pc = paperCompleteness(thin);
assert.equal(pc.truncated, true, "a Conclusion with no body is still a cut");
assert.ok(pc.reasons.includes("conclusion has no body") && pc.reasons.includes("cites missing section 12"));
// A paper that cites a missing section AND lacks a middle section is written by the section branch first.
const mid = old.replace("see Section 7.", "see Section 12.");
pc = paperCompleteness(mid);
assert.deepEqual(pc.middleMissing, ["Practical"]);
assert.deepEqual(pc.dangling, [12]);

// The helper: what counts as a dangling span.
const spans = (body, max) => danglingSectionRefs(body, max).map((s) => body.slice(s.start, s.end));
assert.deepEqual(spans("See Section 12 and Section 3.", 8), ["Section 12"]);
assert.deepEqual(spans("See Sections 9 and 11, or Section 9.1.", 8), ["Sections 9 and 11", "Section 9.1"]);
assert.deepEqual(spans("See Sections 9, 10 and 11, then Sections 9-11.", 8), ["Sections 9, 10 and 11", "Sections 9-11"]);
assert.deepEqual(spans("See Sections 9–11 and Sections 12—13.", 8), ["Sections 9–11", "Sections 12—13"], "an en or em dash range is one span");
assert.deepEqual(spans("Section 12 of [3] and Section 230 of the Communications Act and Section 9 of Smith et al.", 8), [], "a section of another document is not a reference to this paper");
assert.deepEqual(spans("Section 12 of this paper and Section 9 of the paper.", 8), ["Section 12", "Section 9"], "'of this paper' is this paper");
assert.deepEqual(spans("```\nSection 12 in code\n```\nBut Section 13 is prose.", 8), ["Section 13"], "fenced code is not scanned");
assert.deepEqual(spans("Sections 5 and 12 are related.", 8), [], "a list that starts at a real section is not newly flagged");
assert.deepEqual(spans("See Section 12.", 0), [], "an unnumbered paper has no dangling references");

// The repair: deterministic, body only, exactly the dangling spans.
const messy = full12
  .replace("Limits.", "Limits. Section 12 shows the bound. Compare Sections 9 and 11, and Section 6 and Section 12 of [3].")
  .replace("It holds.", "It holds (see Section 10).");
pc = paperCompleteness(messy);
assert.deepEqual(pc.dangling, [12, 9, 10]);
const fixed = repairDanglingSectionRefs(messy, pc.maxSec);
assert.equal(paperCompleteness(fixed).complete, true, paperCompleteness(fixed).reasons.join("; "));
assert.ok(/Limits\. The relevant section shows the bound\./.test(fixed), "capitalised at a sentence start");
assert.ok(/Compare the relevant sections, and Section 6 and Section 12 of \[3\]\./.test(fixed), "a plural span, a real section and an external section are handled separately");
assert.ok(/We study X; see the relevant section\./.test(fixed) && /It holds \(see the relevant section\)\./.test(fixed));
assert.ok(!/Section (?:9|10|11)\b/.test(fixed.split("## References")[0]));
assert.equal(fixed.slice(fixed.indexOf("## References")), messy.slice(messy.indexOf("## References")), "the References block is byte-identical");
assert.equal(repairDanglingSectionRefs(fixed, 8), fixed, "the repair is idempotent");
assert.equal(repairDanglingSectionRefs(full, 8), full, "a paper with nothing dangling comes back unchanged");
const fixed12 = repairDanglingSectionRefs(full12, 8);
assert.equal(paperCompleteness(fixed12).complete, true);
assert.equal(fixed12.length - full12.length, "the relevant section".length - "Section 12".length, "only the one span changed");
// A reference to a heading that exists is never touched, and a refs-only paper is not rewritten.
const legit = full.replace("Limits.", "Limits; Section 6 and Section 8 apply.");
assert.equal(repairDanglingSectionRefs(legit, 8), legit);

// XREF-REPAIR-NO-LOSS-1 (0.28.3): the repair never deletes a number from the paper. A list tail belongs to a span only after the
// plural "Sections", and each tail number is one or two digits, so a figure that follows a singular "Section N" survives.
assert.equal(repairDanglingSectionRefs("As shown in Section 12, 100 trials were run.", 8), "As shown in the relevant section, 100 trials were run.", "a count after a comma is kept");
assert.equal(repairDanglingSectionRefs("Section 12 - 3 items follow.", 8), "The relevant section - 3 items follow.", "a dash and a number after a singular section are kept");
assert.equal(repairDanglingSectionRefs("See Section 9, 2023 results.", 8), "See the relevant section, 2023 results.", "a year after a comma is kept");
assert.equal(repairDanglingSectionRefs("Section 9 and 11 apply.", 8), "The relevant section and 11 apply.", "a singular keyword takes no list tail");
assert.equal(repairDanglingSectionRefs("See Sections 12, 100 trials.", 8), "See the relevant sections, 100 trials.", "a three-digit number is never part of a plural tail");
assert.equal(repairDanglingSectionRefs("See Sections 9 and 2023 results.", 8), "See the relevant sections and 2023 results.", "a four-digit number is never part of a plural tail");
assert.deepEqual(spans("As shown in Section 12, 100 trials were run.", 8), ["Section 12"]);
assert.deepEqual(spans("Section 12 - 3 items follow.", 8), ["Section 12"]);
assert.deepEqual(spans("See Section 9, 2023 results.", 8), ["Section 9"]);
assert.deepEqual(spans("See Section 12.4, 5 items and Section 12.40 apply.", 8), ["Section 12.4", "Section 12.40"], "a sub-number is part of a singular span, a tail is not");
assert.deepEqual(spans("See Sections 9 and 11, 100 more.", 8), ["Sections 9 and 11"], "a plural tail of one or two digits still belongs to the span");
assert.deepEqual(spans("See Sections 9, 10.2023 and 11.", 8), ["Sections 9, 10"], "a long sub-number is not part of a plural tail");
// The plural flag follows the keyword: a singular span is reworded to the singular, whatever follows it.
assert.equal(danglingSectionRefs("Section 9, 10 and 11 apply.", 8)[0].plural, false);
assert.equal(danglingSectionRefs("Sections 9, 10 and 11 apply.", 8)[0].plural, true);
assert.equal(danglingSectionRefs("Sections 12 apply.", 8)[0].plural, true);
// Every digit run of the body outside the rewritten spans survives the repair, in order.
const figures = "Section 12, 100 trials ran. Section 9 - 3 items, 2023 results, Section 13.2, 45 runs and Sections 9 and 11, 700 more.";
const digitsOf = (t) => (t.match(/\d+/g) || []).join(",");
assert.equal(digitsOf(repairDanglingSectionRefs(figures, 8)), "100,3,2023,45,700", "no figure outside the rewritten spans is lost");

// REFS-MOJIBAKE-1
assert.equal(fixMojibake("Why We Don't Have Quantum Computers Yet â€” and What"), "Why We Don't Have Quantum Computers Yet — and What");
assert.equal(fixMojibake("CafÃ©"), "Café");
assert.equal(fixMojibake("Plain ASCII title"), "Plain ASCII title");
assert.equal(fixMojibake("Schrödinger equation"), "Schrödinger equation");

// Prompts: no maximum length, the practical section and the so-what framing are required; the continuation tasks exist.
assert.ok(!/15000-22000 characters|18000-30000 characters/.test(RESEARCH_SHARED_PREAMBLE));
assert.ok(/Length: no maximum/.test(RESEARCH_SHARED_PREAMBLE));
assert.ok(/'## 7\. Practical Implications and Engineering Pathways', '## 8\. Conclusion'/.test(RESEARCH_SHARED_PREAMBLE));
assert.ok(/so what\?/.test(RESEARCH_SHARED_PREAMBLE));
assert.ok(/### TASK CONTINUE/.test(RESEARCH_SHARED_PREAMBLE) && /### TASK SECTION/.test(RESEARCH_SHARED_PREAMBLE));
assert.ok(/never invent an application, market, cost or performance figure/i.test(RESEARCH_SHARED_PREAMBLE));
const VERSION = readFileSync(new URL("./worker.js", import.meta.url), "utf8").match(/var VERSION = "([^"]+)"/)[1];
const [maj, min] = VERSION.split(/[.-]/).map(Number);
assert.ok(maj > 0 || min >= 14, VERSION);

console.log("paper-complete: ok");
