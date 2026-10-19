// SLOP-SCAN-1 (#2407) and RESEARCH-REVIEW-BIB-TRUNC-1 (#2800) offline test.
// Proves: slopScan flags a section dense in the excess-style family as a SOFT finding with its location and leaves plain
// technical prose and the References list alone; reviewBibliography hands the reviewer every entry's index line even
// when the excerpts run far past the excerpt budget.
// Run: node qnfo-research-exec/slop-scan.test.mjs   -> prints "slop-scan tests passed"
import assert from "node:assert/strict";
import { slopScan, reviewBibliography } from "./worker.js";

const plain = "## Results\n\n" + Array.from({ length: 40 }, (_, i) => "The measured gate error at depth " + i + " was 0.3 percent, and the fit gives a decay constant of 12 cycles per qubit.").join(" ") + "\n";
const r0 = slopScan(plain, 6);
assert.equal(r0.findings.length, 0, "plain prose is not flagged: " + JSON.stringify(r0.findings));
const slop = "## Discussion\n\n" + Array.from({ length: 30 }, () => "Moreover, this pivotal and comprehensive framework notably underscores the crucial, multifaceted interplay that we delve into.").join(" ") + "\n\n## References\n\n" + "[1] Moreover pivotal crucial delve comprehensive. arXiv:2401.00001\n".repeat(50);
const r1 = slopScan(slop, 6);
assert.ok(r1.findings.some((f) => f.id === "slop-density" && f.severity === "SOFT" && /Discussion/.test(f.claim)), "dense section flagged SOFT with its location");
assert.ok(r1.findings.every((f) => f.severity === "SOFT"), "never HARD");
assert.ok(!r1.findings.some((f) => /References/.test(f.claim)), "References skipped");
assert.ok(r1.density > 0 && r1.baseline === 6, "density and baseline reported");

const entries = Array.from({ length: 14 }, (_, i) => "[" + (i + 1) + "] arXiv:2401.000" + (10 + i) + " | Work number " + (i + 1) + "\n" + "full text excerpt ".repeat(250)).join("\n");
const g = "# Grounding\n\n## Bibliography\n\n" + entries;
const b = reviewBibliography(g);
for (let i = 1; i <= 14; i++) assert.ok(b.indexOf("[" + i + "] arXiv:") >= 0, "entry " + i + " visible to the reviewer");
assert.ok(b.length < 25e3, "bounded: " + b.length);
assert.equal(reviewBibliography("no bibliography"), "", "no bibliography -> empty");
console.log("slop-scan tests passed");
