// SYMBOL-REPAIR-1 + YEAR-RANGE-1 offline suite (personal-companion 1.23.3, charter pillar: personal; agent_issues 2222).
// Proves: a draft rejected for "emoji present" (an arrow or emoji in a sentence) is repaired by deleting that sentence, alone or next to
// grounding problems, inside the quarter cap; the style rule names arrows; the two-digit end of a year range ("1770-71") is read as the
// full year it abbreviates and passes when the source has that year, and is still flagged when it does not.
// Run: node personal-companion/symbol-year.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()).toString("base64"));
const V = mod.__verify, P = V.prompts;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };

const source = "Herz Cerfbeer of Medelsheim was a French Jewish philanthropist. In recognition of services rendered during the famine of 1770 and 1771, Cerfbeer established factories where he employed Jews. The poll tax on Jews was abolished in 1784.";
const gp = (t, g) => V.groundingProblems(t, g === undefined ? source : g, {});

// YEAR-RANGE-1
for (const dash of ["-", "‑", "–", " – "]) {
  const p = gp("The famine of 1770" + dash + "71 brought Cerfbeer to the crown's notice.");
  ok(p.length === 0, "the year range 1770" + JSON.stringify(dash) + "71 is read as 1770 and 1771", p);
}
let p = gp("The famine of 1770-79 brought Cerfbeer to the crown's notice.");
ok(p.length === 1 && /figure not in the source: 79|year not in the source/.test(p[0]), "a range end the source does not hold is still flagged", p);
p = gp("He employed 71 workers in his factories.");
ok(p.length === 1 && /figure not in the source: 71/.test(p[0]), "a bare 71 that is no range end is still flagged", p);
p = gp("The poll tax was abolished in 1784-85.");
ok(p.length === 1 && /85/.test(p[0]), "a range end missing from the source is flagged", p);

// CENTURY-ORDINAL-1 (1.23.4)
p = gp("The palace changed hands in the early 21st-century and again in the mid\u201120th\u2011century.");
ok(p.length === 0, "a century ordinal is no figure", p);
p = gp("The palace had 21 rooms.");
ok(p.length === 1 && /figure not in the source: 21/.test(p[0]), "a plain 21 is still a figure", p);

// SYMBOL-REPAIR-1
const grounded = [
  "Herz Cerfbeer of Medelsheim was a French Jewish philanthropist.",
  "In recognition of services rendered during the famine of 1770 and 1771, Cerfbeer established factories where he employed Jews.",
  "The poll tax on Jews was abolished in 1784.",
  "Cerfbeer established factories where he employed Jews.",
  "The poll tax on Jews was abolished in 1784, according to the source."
];
const body = ["## One", "", grounded[0] + " " + grounded[1] + " " + grounded[3], "", "## Two", "", "The chain ran factories → wages → standing at court. " + grounded[2] + " " + grounded[4], "", "## Three", "", grounded[0] + " " + grounded[3] + " " + grounded[2] + " " + grounded[1]].join("\n");
const notes = { title: "Herz Cerfbeer and the poll tax", lede: "Herz Cerfbeer of Medelsheim was a French Jewish philanthropist, according to the Wikipedia article on him.", body_md: body, objection: "" };
const r = V.repairGroundingDraft(notes, ["emoji present"], "notes", source, { floorShare: 0.01 });
ok(r && r.piece && r.piece.body_md.indexOf("→") < 0, "the sentence holding the arrow is deleted", r && { removed: r.removed, v: r.v && r.v.problems });
ok(r && r.removed === 1 && r.piece.body_md.indexOf(grounded[2]) >= 0, "only that sentence goes", r && r.removed);
const r2 = V.repairGroundingDraft(Object.assign({}, notes, { body_md: body.replace(grounded[4], "Cerfbeer was born in Alsace.") }), ["emoji present", "grounding: name not in the source: Alsace"], "notes", source, { floorShare: 0.01 });
ok(r2 && r2.piece && r2.piece.body_md.indexOf("→") < 0 && r2.piece.body_md.indexOf("Alsace") < 0 && r2.removed === 2, "an arrow next to a grounding problem: both sentences go in one repair", r2 && r2.removed);
ok(V.repairGroundingDraft(notes, ["emoji present", "notes items 2"], "notes", source) === null, "another problem next to the symbols still blocks the repair");
const many = Object.assign({}, notes, { body_md: body.split(". ").join(" → ok. ") });
ok(V.repairGroundingDraft(many, ["emoji present"], "notes", source, { floorShare: 0.01 }) === null, "symbols in more than a quarter of the sentences are not repaired (the quarter cap)");
ok(/emojis, arrows \(→\) or other symbols written in place of words/.test(P.P_STYLE), "the style rule names arrows");

const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 1 || (ver[0] === 1 && (ver[1] > 23 || (ver[1] === 23 && ver[2] >= 3)))), "VERSION is at least 1.23.3", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
