// LENGTH-LEDE-1 offline suite (personal-companion 1.22.7, charter pillar: personal; agent_issues 2222).
// Proves: a piece is measured as lede + body, the lede once; a draft that opens with a paragraph (lede stored apart) and the same draft
// opening with a heading (lede left in the body) measure the same; the invisible analysis line is not counted; validatePiece applies the
// floor to that measure, so a notes draft whose body alone is under the floor passes when the lede the reader sees brings it over.
// Run: node personal-companion/length-lede.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()).toString("base64"));
const V = mod.__verify;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };
const words = (n, w) => Array.from({ length: n }, () => w || "word").join(" ");

ok(typeof V.pieceWords === "function", "pieceWords is exported");
const lede = words(90, "lede") + ".";
const body = "## One\n\n" + words(260) + ".\n\n## Two\n\n" + words(260) + ".\n\n## Three\n\n" + words(260) + ".";
const bodyWords = V.pieceWords({ lede: "", body_md: body });
ok(bodyWords === 786, "a body without a lede counts its own words (780 words and three two-word headings)", bodyWords);
ok(V.pieceWords({ lede: lede, body_md: body }) === bodyWords + 90, "a lede stored apart is counted with the body", V.pieceWords({ lede: lede, body_md: body }));
ok(V.pieceWords({ lede: lede, body_md: lede + "\n\n" + body }) === bodyWords + 90, "a lede the body already holds is counted once");
const marked = { lede: lede, body_md: body + "\n\n<!-- analysis -->\n\n" + words(40) + "." };
ok(V.pieceWords(marked) === bodyWords + 90 + 40, "the invisible analysis line is not counted", V.pieceWords(marked));
ok(V.pieceWords({ lede: null, body_md: body }) === bodyWords && V.pieceWords({ body_md: body }) === bodyWords, "a missing lede counts nothing");
ok(V.pieceWords(null) === 0 && V.pieceWords({}) === 0, "no piece measures zero");

// validatePiece measures lede + body against the floor in effect (no grounding check: ground undefined)
const floor = V.floorFor("notes");
ok(typeof floor === "number" && floor > 0, "the notes floor is a number", floor);
const short = Math.max(10, floor - 60);
const per = Math.ceil(short / 3);
const nb = "## One\n\n" + words(per) + ".\n\n## Two\n\n" + words(per) + ".\n\n## Three\n\n" + words(per) + ".";
const nbWords = V.pieceWords({ body_md: nb });
ok(nbWords < floor, "the test body alone is under the notes floor", { nbWords, floor });
const piece = (l) => ({ title: "A test title", lede: l, body_md: nb, objection: V.NOTES_OBJECTION_PLACEHOLDER });
// validatePiece is not exported: its length rule is read from the source
const vp = src.slice(src.indexOf("function validatePiece(piece, form, ground, opts) {"), src.indexOf("__name(validatePiece"));
ok(/var wc = pieceWords\(piece\); \/\/ LENGTH-LEDE-1/.test(vp), "validatePiece measures with pieceWords");
ok(!/var wc = wordCount\(md\);/.test(vp), "validatePiece no longer measures the body alone");
ok(/if \(wc < floorFor\("notes", o\.floorShare\) \|\| wc > 3200\) problems\.push\("notes length " \+ wc\);/.test(vp), "the notes floor and ceiling are unchanged");
ok(/return \{ ok: problems\.length === 0, problems, words: wc \};/.test(vp), "the stored word count is the same measure");
// the ceiling holds for the whole piece too
ok(V.pieceWords({ lede: words(100, "lede"), body_md: words(3150) }) === 3250, "a lede can push a piece over the ceiling (the ceiling also measures lede + body)");
// the extend feedback reads the same number the validator wrote
const fb = V.expandFeedback(["notes length " + nbWords], "notes", piece(lede));
ok(typeof fb === "string" && fb.indexOf(nbWords + " words against a floor of " + floor) >= 0, "the extend path quotes the measured length", fb && fb.slice(0, 120));
ok(/LENGTH-LEDE-1/.test(src.split("\n").find((l) => l.startsWith("var VERSION")) || ""), "the VERSION comment names the change");
const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 1 || (ver[0] === 1 && (ver[1] > 22 || (ver[1] === 22 && ver[2] >= 7)))), "VERSION is at least 1.22.7", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
