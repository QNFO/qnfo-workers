// VERIFY-AUTOCORRECT-PRECISION-1 (qnfo-research-exec 0.39.0, agent_issues 1000537, pillar research): the verify autocorrection writes the computed value at the
// precision of the stated one, and skips a correction that would contradict a displayed derivation by more than that derivation's own rounding.
// Live case (verify-autocorrect of 2026-10-26T02:43:00Z, research row d66c40b5, claim Q14): the paper derived 0.99^63 as 0.528 and stated "1 - 0.528 = 0.472"; the script's
// 0.46909446 replaced the result only, so the published line read "1 - 0.528 = 0.46909446". Four more corrections in the 72 hours before added four or more digits (2.60 to 2.617914).
// Run: node qnfo-research-exec/autocorrect-precision.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { autoCorrectNumeric, numLit } from "./worker.js";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 500) : "")); } };
const row = (id, computed, expected) => ({ id, computed, expected, decided: true, match: false });
const run = (paper, rows) => autoCorrectNumeric(paper, { rows }, []);
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");

// 1. The live case: the displayed derivation 1 - 0.528 = 0.472 is not contradicted by a rounded script value three units away.
const incident = "## 4.3 Failure probability\n\nThe survival probability is 0.99^63 = 10^{-0.2772} = 0.528 (rounded intermediates). The failure probability is then 1 - 0.528 = 0.472, below the 0.5 bound.\n";
let r = run(incident, [row("Q14", "0.46909446", "0.472")]);
ok(!/0\.46909446/.test(r.paper), "the script's value is never written at full precision", r.paper);
ok(r.paper === incident && r.changed === false && r.applied.length === 0, "the paper is left as it was", r);
ok(r.skipped.length === 1 && r.skipped[0].id === "Q14" && /displayed derivation \(1, 0\.528\)/.test(r.skipped[0].reason) && /3 units of its last digit/.test(r.skipped[0].reason), "the skip names the derivation and the distance, so verify falls through to revise", r.skipped);

// 2. A correction within one unit of the last digit is rounding the displayed intermediates explain: it is written at the stated precision.
r = run("The failure probability is then 1 - 0.528 = 0.472, below the 0.5 bound.\n", [row("Q14", "0.4713", "0.472")]);
ok(r.changed && /1 - 0\.528 = 0\.471,/.test(r.paper) && r.applied[0].to === "0.471" && r.applied[0].sig === 3 && r.applied[0].computedSig === 4 && r.applied[0].derivation === 2, "one unit away beside a derivation: 0.471, with both precisions recorded", r);

// 3. No derivation: the value is still written at the stated precision (the live rows that added four or more digits: 2.60 to 2.617914).
r = run("The ratio is 2.60 for the base case.\n", [row("Q1", "2.617914", "2.60")]);
ok(r.changed && r.paper === "The ratio is 2.62 for the base case.\n" && r.applied[0].sig === 3 && r.applied[0].computedSig === 7 && !r.applied[0].derivation, "2.60 becomes 2.62, not 2.617914", r);
r = run("The cooling gap is about 92 (Eq. 5) in the base case.\n", [row("Q2", "95.3", "92")]);
ok(r.changed && /about 95 \(Eq\. 5\)/.test(r.paper), "an equation label is no derivation: 92 becomes 95 at two digits", r);
r = run("With p = 0.01 and n = 63, the failure probability is 0.472.\n", [row("Q3", "0.46909446", "0.472")]);
ok(r.changed && /is 0\.469\.$/m.test(r.paper) && !/0\.4690/.test(r.paper), "inputs shown in the sentence are not a derivation of the result: 0.469, three digits", r);

// 4. Scientific notation keeps its digits and its style.
r = run("The thermal energy is k_B T = 4.2800e-21 J.\n", [row("Q4", "4.31001e-21", "4.2800e-21")]);
ok(r.changed && r.applied[0].to === "4.3100e-21" && /= 4\.3100e-21 J/.test(r.paper), "4.31001e-21 is written with the five digits of 4.2800e-21", r);
r = run("The thermal energy is k_B T = 4.2800e-21 J at T = 310 K.\n", [row("Q4", "4.28001e-21", "4.2800e-21")]);
ok(r.changed === false && r.skipped[0].reason === "no change at the stated precision", "a value that rounds to the stated one changes nothing", r);
r = run("The critical density is $n_c \\approx 1.36 \\times 10^{8}\\ \\text{m}^{-2}$.\n", [row("Q5", "1.42e+08", "1.36e+08")]);
ok(r.changed && /\\approx 1\.42 \\times 10\^\{8\}/.test(r.paper) && r.applied[0].from === "1.36" && r.applied[0].to === "1.42", "the LaTeX mantissa is corrected at its own precision; units and exponent are no derivation", r);
r = run("Hence $P = 1 - 0.528 = 0.472$ in the base case.\n", [row("Q6", "0.46909446", "0.472")]);
ok(r.changed === false && /displayed derivation/.test(r.skipped[0].reason), "a LaTeX derivation is read like a plain one", r);
r = run("Hence $0.472 = 1 - 0.528$ in the base case.\n", [row("Q6", "0.46909446", "0.472")]);
ok(r.changed === false && /displayed derivation/.test(r.skipped[0].reason), "and so is one with the stated value on the left of the equals sign", r);

// 5. What the function did before stays: a repeated stated value, a decided match, a value that is not a number.
r = run("First 0.472 here and again 0.472 there.\n", [row("Q7", "0.469", "0.472")]);
ok(r.changed === false && r.skipped[0].reason === "stated value appears multiple times", "a stated value that appears twice is skipped", r);
r = autoCorrectNumeric("The value is 0.472.\n", { rows: [{ id: "Q8", computed: "0.472", expected: "0.472", decided: true, match: true }, { id: "Q9", computed: "True", expected: "none", decided: true, match: false }] }, []);
ok(r.changed === false && r.skipped.length === 1 && r.skipped[0].reason === "non-numeric value", "a match is left alone and a non-number is skipped", r);

// 6. Several claims in one paper: each is judged on its own sentence.
r = run("The ratio is 2.60 here. The failure probability is then 1 - 0.528 = 0.472.\n", [row("Q1", "2.617914", "2.60"), row("Q14", "0.46909446", "0.472")]);
ok(r.applied.length === 1 && r.applied[0].id === "Q1" && r.skipped.length === 1 && r.skipped[0].id === "Q14" && /The ratio is 2\.62 here\./.test(r.paper) && /= 0\.472\./.test(r.paper), "one applied, one skipped, in the same paper", r);

// 7. Property: no applied correction adds digits, whatever the inputs.
const cases = [["2.60", "2.617914"], ["0.472", "0.46909446"], ["92", "95.31"], ["4.2800e-21", "4.31001e-21"], ["1200", "1234.5678"], ["0.0553679", "0.05536799999"], ["3.5", "3.4999999"]];
ok(cases.every(([stated, computed]) => {
  const out = run("Value " + stated + " is stated.\n", [row("Q", computed, stated)]);
  return out.applied.length === 0 || out.applied.every((a) => numLit(a.to).sig === numLit(a.from).sig);
}), "an applied correction has exactly the significant digits of the value it replaces");

// 8. The marker, the event fields and the probe text stay in the worker.
ok(/VERIFY-AUTOCORRECT-PRECISION-1/.test(src), "the worker carries the VERIFY-AUTOCORRECT-PRECISION-1 marker the closing probe reads");
ok(/"verify-autocorrect", "row=" \+ row\.id \+ " claim=" \+ a\.id \+ " from=" \+ a\.from \+ " to=" \+ a\.to \+ " stated_sig=" \+ a\.sig \+ " computed_sig=" \+ a\.computedSig/.test(src), "the verify-autocorrect event records both precisions");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
