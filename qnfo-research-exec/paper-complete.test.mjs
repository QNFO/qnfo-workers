// PAPER-COMPLETE-1 / REFS-MOJIBAKE-1 (0.14.0) suite: completeness detection, continuation stitching, middle-section insertion,
// mojibake repair and the prompt rules. Offline, no bindings.
// Run: node qnfo-research-exec/paper-complete.test.mjs
import assert from "node:assert/strict";
import { paperCompleteness, completionBase, stitchContinuation, insertSection, fixMojibake, RESEARCH_SHARED_PREAMBLE } from "./worker.js";
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
