// Q08-GATE-GROUND-BLIND-1 (0.37.4, agent_issues 100607 and 100439): the writer gate no longer refuses a comma-grouped dollar amount or a "score, rating,
// ratio or reputation of 0.85" without reading the source; the grounding check refuses the same figures when the source does not hold them and
// accepts them when it does. The identifier check stays. Output MUST contain "0 failed".   node q08-signal-engine/ground-blind-gate.test.mjs
import { readFileSync } from "node:fs";
const W = await import("./worker.js");
const gate = W.__quality.gate, V = W.__verify;
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let passes = 0, fails = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };

// an essay body that passes every other writer-gate check, with one sentence swapped per case
const para = (s) => s + " A second sentence adds context about how the parties behave and what each of them wants from the arrangement. The clerk who handles the file keeps a log of every call, and the log shows the same three questions arriving each week from the same two offices. Each office wants the record closed before the next budget meeting, and each one reads the rules in the way that leaves its own work smaller.";
function essay(sentence) {
  const ps = [para("The county filed a public records response on Tuesday, reported by a local newsroom."), para(sentence), para("The records office answered the request in writing and named the unit that would search the files."), para("A reporter at the outlet read the fee schedule line by line and asked who set the hourly rate and why."), para("The county counsel said the fee follows a state formula that bills every hour of search and review."), para("The newsroom said it would appeal, which moves the argument to the state's public records ombudsman."), para("What the arrangement shows is that a fee for access works as a price on scrutiny, and the party that sets it also decides what is asked.")];
  return "# A county bills a newsroom for the files it asked to read\n\n" + ps.join("\n\n") + "\n\nworth your time: yes - concrete case with named parties and a checkable fee.";
}
const problems = (t) => gate(t, []).problems;
const amount = essay("The county quoted $2,484,599 for the search and $195,869 for the review of the responsive files.");
const decimal = essay("The paper reports a ratio of 1.5 between the two throughput figures and a score of 0.85 on the benchmark.");
const clean = essay("The county quoted a large sum for the search and a smaller one for the review of the responsive files.");
check("the baseline essay passes the writer gate", problems(clean).length === 0, problems(clean));
check("a comma-grouped dollar amount is no longer refused by the writer gate", !problems(amount).some((p) => /currency|fabricated/i.test(p)), problems(amount));
check("a 'ratio of 1.5' and 'score of 0.85' are no longer refused by the writer gate", !problems(decimal).some((p) => /decimal metric|fabricated scores/i.test(p)), problems(decimal));
check("the amount essay passes the writer gate as a whole", problems(amount).length === 0, problems(amount));
check("the decimal essay passes the writer gate as a whole", problems(decimal).length === 0, problems(decimal));
check("the invented-identifier check is kept", problems(essay("The user ID 'abc123xyz789' appears in the log.")).some((p) => /invented identifier/.test(p)));

// the grounding check decides: the same figures are refused when the source does not hold them, accepted when it does
const groundWith = "SOURCE: a local newsroom reports on a public records fee. The county quoted $2,484,599 for the search and $195,869 for the review. The paper reports a ratio of 1.5 and a score of 0.85.";
const groundWithout = "SOURCE: a local newsroom reports on a public records fee. The county quoted a large sum for the search and a smaller one for the review.";
const figs = (text, ground) => V.groundingProblems(text, ground, {}).filter((p) => /^figure not in the source/.test(p));
check("dollar amounts in the source are accepted by the grounding check", figs(amount, groundWith).length === 0, figs(amount, groundWith));
check("dollar amounts NOT in the source are refused by the grounding check", figs(amount, groundWithout).length >= 2 && figs(amount, groundWithout).some((p) => /2,484,599/.test(p)), figs(amount, groundWithout));
check("decimals in the source are accepted", figs(decimal, groundWith).length === 0, figs(decimal, groundWith));
check("decimals NOT in the source are refused", figs(decimal, groundWithout).length >= 2, figs(decimal, groundWithout));

// the two removed checks are gone from the source, the pre-compose and grounding machinery is untouched
const code = src.replace(/\/\/[^\n]*/g, "");
check("the currency and decimal-metric regexes are gone from gate()", !/likely fabricated; use the signal/.test(code) && !/invented decimal metric/.test(code), "still present");
check("groundingProblems still reads every figure against the ground", /nums\.has\(num\)/.test(src) && /figure not in the source/.test(src));
check("the pre-check still runs before the panel in generate()", /groundPreCheck\(piece, essayGround/.test(src) && /var lv = await runLevels\(/.test(src));
{
  const a = src.indexOf("// Q08-GATE-GROUND-BLIND-1 (0.37.4, agent_issues"), b = src.indexOf("if (/\\b(?:channel|account|user|session) ID");
  check("the new note is ASCII-only (Q08-ASCII-SOURCE-1)", a > 0 && b > a && !/[^\x00-\x7f]/.test(src.slice(a, b)));
}

console.log("ground-blind-gate.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
