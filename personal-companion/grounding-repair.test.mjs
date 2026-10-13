// GROUNDING-REPAIR-1 offline suite (personal-companion 1.16.0, issue 2354 COMPANION-GROUNDING-REPAIR-1, charter pillar: personal).
// reading.q08.org published nothing for 57 h because every draft failed validation for grounding problems only (a name or a figure
// the source material does not contain) and the retry feedback made the writer recall the same items again. The repair removes
// each sentence that contains a flagged item, with no model call, and keeps the draft only when it passes validatePiece in full
// (length floor included) and at most a quarter of its sentences went. Proves: all-grounding problems -> the sentences are removed
// and the draft is accepted under the quarter cap; too many removals -> not accepted; a non-grounding problem -> no repair; the match
// is case-insensitive; headings, paragraph breaks and the objection field survive; the compose loop logs the repair as a stage row.
// Run: node personal-companion/grounding-repair.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()).toString("base64"));
const V = mod.__verify;
const repair = V.repairGroundingDraft, validatePiece = mod.validatePiece;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 500) : "")); } };
const words = (s) => String(s).split(/\s+/).filter(Boolean).length;

// ---- the validator prefix the repair matches ------------------------------------------------------------------------------------
ok(V.GROUNDING_PREFIX === "grounding:", "the repair matches the prefix the validator emits");
ok(/problems\.push\("grounding: " \+ gp\[gi\]\)/.test(src), "validatePiece emits that prefix verbatim");

// ---- source material and a grounded vocabulary --------------------------------------------------------------------------------
const source = "The Alpha Subject recorded 14 measurements in 1987 at the Beta Station. Surveyors at the Beta Station said the readings drifted by 2.5 percent a year. A later review by the Gamma Committee found the drift was real and that the Lantern Index described it.";
const grounded = [
  "The Alpha Subject recorded 14 measurements in 1987 at the Beta Station, and the surveyors there watched the readings drift.",
  "The drift the surveyors described was real, and the later review by the Gamma Committee said so in plain words.",
  "What the readings show is a slow movement, not a jump, and the surveyors treated it as such from the first year.",
  "If the drift holds at the rate the surveyors gave, it follows that the station's record cannot be read without a correction.",
  "The Lantern Index described the drift, and the review treated the index as the plainest account of what the station saw."
];
const para = (n) => { const out = []; for (let i = 0; i < n; i++) out.push(grounded[i % grounded.length]); return out.join(" "); };
const notesBody = [
  "## The station and its readings", "", para(30) + " In 1863 Dr. Delmore Quill built the first Zorblax Engine for the surveyors.", "",
  "## The drift", "", para(30) + " The engine reached 78 % on the Quimby benchmark.", "",
  "## The review", "", para(30)
].join("\n");
const notes = { title: "Notes on the drift at the station", subtitle: "", lede: "The surveyors at the Beta Station saw the readings drift.", body_md: notesBody, objection: "Each item stands or falls on its own." };

// ---- all-grounding problems -> sentences removed, accepted under the quarter cap --------------------------------------------------
{
  const v = validatePiece(notes, "notes", source);
  ok(!v.ok && v.problems.length >= 3 && v.problems.every((p) => p.indexOf("grounding:") === 0), "the invented year, names and figure fail validation as grounding problems only", v.problems);
  const r = repair(notes, v.problems, "notes", source);
  ok(r && r.ok === true, "the draft is repaired and accepted", r && r.v);
  ok(r && r.removed === 2 && r.total > 60, "two sentences were removed out of many", r && { removed: r.removed, total: r.total });
  ok(r && !/Zorblax|Quill|1863|78 %|Quimby/.test(r.piece.body_md), "no flagged item remains in the body");
  ok(r && r.piece.body_md.split("\n").filter((l) => l.indexOf("## ") === 0).length === 3, "all three headings survive at the start of their lines");
  ok(r && /\n\n## The drift\n\n/.test(r.piece.body_md), "paragraph breaks around a heading survive");
  ok(r && r.piece.objection === notes.objection && r.piece.title === notes.title && r.piece.lede === notes.lede, "title, lede and objection are carried over unchanged");
  ok(r && r.v.ok && validatePiece(r.piece, "notes", source).ok, "the repaired draft passes validatePiece in full, length floor included");
  ok(r && words(r.piece.body_md) >= 1700, "the repaired notes stay above the 1700-word floor", r && words(r.piece.body_md));
}

// ---- an essay keeps its objection, so the full re-validation can pass ------------------------------------------------------------
{
  const essayBody = [para(70), "", "## The strongest objection", "", para(32) + " Dr. Delmore Quill reached 78 % in 1863.", "", para(32)].join("\n");
  const essay = { title: "The drift at the station", subtitle: "", lede: "The surveyors at the Beta Station saw the readings drift.", body_md: essayBody, objection: "The drift could be an artefact of the instruments rather than of what they measured, and the review does not rule that out." };
  const v = validatePiece(essay, "essay", source);
  ok(!v.ok && v.problems.every((p) => p.indexOf("grounding:") === 0), "the essay fails for grounding problems only", v.problems);
  const r = repair(essay, v.problems, "essay", source);
  ok(r && r.ok && r.removed === 1 && r.piece.objection === essay.objection, "the essay is repaired with its objection intact", r && r.v);
  ok(r && words(r.piece.body_md) >= 2000 && /^## The strongest objection$/m.test(r.piece.body_md), "the essay stays above its floor and keeps its heading", r && words(r.piece.body_md));
}

// ---- too many removals -> not accepted ---------------------------------------------------------------------------------------
{
  const body = ["## One", "", "Zorblax Quimby built it. " + grounded[0] + " Zorblax Quimby ran it. Zorblax Quimby sold it.", "", "## Two", "", grounded[1], "", "## Three", "", grounded[2]].join("\n");
  const piece = { title: "Three short notes", lede: "", body_md: body, objection: "" };
  const r = repair(piece, ["grounding: name not in the source: Zorblax Quimby"], "notes", source);
  ok(r === null, "a draft that would lose more than a quarter of its sentences is not repaired");
}
{
  const r = repair(notes, ["grounding: name not in the source: Alpha Subject"], "notes", source);
  ok(r === null, "a needle that occurs in most sentences is refused by the quarter cap");
}

// ---- the repaired draft must pass validatePiece in full --------------------------------------------------------------------------
{
  const short = { title: "Short notes", lede: "", body_md: ["## One", "", grounded[0] + " Zorblax Quimby ran it.", "", "## Two", "", grounded[1], "", "## Three", "", grounded[2], grounded[3], grounded[4]].join("\n"), objection: "" };
  const r = repair(short, ["grounding: name not in the source: Zorblax Quimby"], "notes", source);
  ok(r && r.ok === false && r.piece && !/Zorblax/.test(r.piece.body_md), "a repaired draft below the length floor is not accepted; the cleaned draft is handed to the extend path (1.17.0)");
}

// ---- a non-grounding problem -> no repair ---------------------------------------------------------------------------------------
{
  const rl = repair(notes, ["notes length 900"].concat(validatePiece(notes, "notes", source).problems), "notes", source);
  ok(rl && rl.ok && !/Zorblax/.test(rl.piece.body_md), "a length problem next to a grounding problem: the grounding sentence goes and the draft is re-validated in full (1.17.0)");
  ok(repair(notes, ["banned: delve"], "notes", source) === null, "a banned phrase the draft does not contain removes nothing, so no repair");
  ok(repair(notes, ["emoji present", "grounding: name not in the source: Zorblax Engine"], "notes", source) === null, "any problem other than grounding, banned or length is not repaired");
  ok(repair(notes, [], "notes", source) === null && repair(notes, null, "notes", source) === null, "no problems, no repair");
  ok(repair(notes, ["grounding: something the needle parser cannot read"], "notes", source) === null, "a grounding problem with no readable needle is left alone");
}

// ---- case-insensitive match, hyphen and quote normalisation -----------------------------------------------------------------------
{
  const r = repair(notes, ["grounding: name not in the source: ZORBLAX ENGINE", "grounding: figure not in the source: 78 %", "grounding: year not in the source: 1863"], "notes", source);
  ok(r && r.ok && r.removed === 2 && !/Zorblax|78 %/.test(r.piece.body_md), "an upper-case needle removes the mixed-case sentence");
  const hy = { title: "Notes on the drift at the station", lede: "", body_md: notes.body_md.replace("Zorblax Engine", "Zorblax‑Engine"), objection: "" };
  const r2 = repair(hy, ["grounding: name not in the source: Zorblax-Engine", "grounding: figure not in the source: 78 %", "grounding: year not in the source: 1863"], "notes", source);
  ok(r2 && r2.ok && !/Zorblax/.test(r2.piece.body_md), "a unicode hyphen in the draft matches the ASCII hyphen the name check reports");
}

// ---- sentence splitting: decimals and abbreviations do not end a sentence ------------------------------------------------------------
{
  const body = ["## One", "", para(30) + " The ratio was 8.34 in the Quimby run. " + grounded[1], "", "## Two", "", para(30), "", "## Three", "", para(30)].join("\n");
  const piece = { title: "Notes on the drift at the station", lede: "", body_md: body, objection: "" };
  const r = repair(piece, ["grounding: figure not in the source: 8.34", "grounding: name not in the source: Quimby"], "notes", source);
  ok(r && r.ok && r.removed === 1 && !/8\.34|Quimby/.test(r.piece.body_md) && r.piece.body_md.indexOf(grounded[1]) !== -1, "the decimal sentence goes as one sentence and its neighbours stay", r && { removed: r.removed });
  const body2 = ["## One", "", para(30) + " Dr. Quimby ran the engine. " + grounded[1], "", "## Two", "", para(30), "", "## Three", "", para(30)].join("\n");
  const r2 = repair({ title: "Notes on the drift at the station", lede: "", body_md: body2, objection: "" }, ["grounding: name not in the source: Quimby"], "notes", source);
  ok(r2 && r2.ok && r2.removed === 1 && !/Dr\./.test(r2.piece.body_md), "an abbreviation is kept with its sentence, so no dangling 'Dr.' remains");
}

// ---- the compose loop uses it, logs a stage row, and the style prompt carries the process line --------------------------------------
{
  const loop = src.slice(src.indexOf("async function generate("), src.indexOf("var CRON_TABLE"));
  ok(/var gr = repairGroundingDraft\(piece, v\.problems, form, ground, vopts\);/.test(loop), "the compose loop calls the repair where validatePiece fails");
  ok(/logRun\(env, form, model, topic\.id, "stage", "grounding repair: removed " \+ gr\.removed \+ " sentences"/.test(loop), "the repair is logged as a companion_runs stage row");
  ok(loop.indexOf("repairGroundingDraft(") < loop.indexOf("var shortOnly = expandFeedback(v.problems, form, piece);"), "the repair runs before the feedback path");
  ok(!/await (callModel|composePiece|aiRun)[^\n]*grounding/.test(loop), "the repair makes no model call");
  const style = V.prompts.P_STYLE;
  const line = "Figures, dates, names and quotations: use one only exactly as the source material states it. Never compute, round, convert, estimate, combine or recall a number from memory; if a point needs a figure the sources do not give, make the point without one.";
  ok(style.indexOf(line) !== -1 && style.indexOf(line) < style.indexOf("Forbidden, without exception:"), "P_STYLE carries the process line before the Forbidden list");
  const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
  ok(vm && (Number(vm[1]) > 1 || Number(vm[2]) >= 16), "VERSION is at least 1.16.0", vm && vm[0]);
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
