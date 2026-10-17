// LEDE-PRUNE-EXTEND-1 offline suite (personal-companion 1.21.6, charter pillar: personal; agent_issues 2222).
// companion_runs 5540 (2026-10-13 15:06 UTC): the third fact-prune round removed every quoted sentence and was blocked only by "notes length
// 550" and "lede does not name the subject"; the run then rewrote the dirtier round-2 draft. Proves: a prune blocked only by its length
// and/or a lede without the subject is kept; its repair feedback extends it and asks for a first paragraph naming the subject; any other
// problem (banned phrase, grounding, items) still falls back to the corrective revision; generate() builds the feedback before logging.
// Run: node personal-companion/prune-extend.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { importWorker } from "./_harness-import-worker.mjs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await importWorker(() => (src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()), new URL("./", import.meta.url));
const V = mod.__verify;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };
const subject = "The Black Book of Soviet Jewry";
const lede = "lede does not name the subject: the first paragraph must say what " + subject + " is and where it comes from";
const piece = { title: "The Black Book", body_md: "Grossman and Ehrenburg gathered testimony.\n\n## What it shows\n\nThe committee compiled accounts." };
ok(V.pruneBlockFixable(["notes length 550", lede], "notes"), "run 5540's block (length and lede) is fixable");
ok(V.pruneBlockFixable(["notes length 550"], "notes") && V.pruneBlockFixable([lede], "essay"), "length alone and lede alone are fixable");
ok(!V.pruneBlockFixable(["notes length 550", "banned: tapestry"], "notes"), "a banned phrase is not fixed by an extension");
ok(!V.pruneBlockFixable(["essay length 550"], "notes"), "a length problem of another form is not this draft's");
ok(!V.pruneBlockFixable([], "notes") && !V.pruneBlockFixable(null, "notes"), "no problems means nothing to repair here");
ok(!V.pruneBlockFixable(["notes items 2"], "notes"), "a missing section is not fixed by an extension");
const floor = V.floorFor("notes");
const fb1 = V.pruneRepairFeedback(["notes length 550", lede], "notes", piece, subject);
ok(fb1 && /too short: 550 words/.test(fb1) && fb1.indexOf("Its first paragraph must say what " + subject + " is and where it comes from") > 0, "length and lede: extend, and name the subject first", fb1 && fb1.slice(0, 300));
ok(fb1 && fb1.indexOf("Its first paragraph") < fb1.indexOf("The draft follows.") && /# The Black Book/.test(fb1), "the lede instruction comes before the draft, which follows in full");
const fb2 = V.pruneRepairFeedback([lede], "notes", piece, subject);
ok(fb2 && /no longer names its subject/.test(fb2) && /Do not start over/.test(fb2) && /Keep every other sentence as it is/.test(fb2) && /Grossman and Ehrenburg/.test(fb2), "lede alone: keep the piece, fix the first paragraph", fb2 && fb2.slice(0, 200));
const fb3 = V.pruneRepairFeedback(["notes length 550"], "notes", piece, subject);
ok(fb3 && fb3 === V.expandFeedback(["notes length 550"], "notes", piece), "length alone: exactly the existing extension feedback");
ok(V.pruneRepairFeedback(["notes length " + (floor + 10)], "notes", piece, subject) === null, "a length at or over the floor gives no extension (nothing to extend)");
ok(V.pruneRepairFeedback(["notes length 550", "banned: tapestry"], "notes", piece, subject) === null, "an unfixable block gives no feedback, so the corrective revision runs");
const loop = src.slice(src.indexOf("var prunedShort = null;"), src.indexOf("var rp = rev && rev.piece ? splitLongLede(rev.piece) : null;"));
ok(/if \(pruneBlockFixable\(pv\.problems, form\)\) prunedShort = \{ piece: pr\.piece, words: pv\.words, problems: pv\.problems \};/.test(loop), "generate keeps a fixable pruned draft with its problems");
ok(loop.indexOf("var extendFb = prunedShort ? pruneRepairFeedback(prunedShort.problems, form,") >= 0 && loop.indexOf("var extendFb") < loop.indexOf('(extending the pruned draft, '), "the repair feedback is built before the log line that announces it");
ok(/if \(prunedShort && extendFb\) finalPiece = prunedShort\.piece;/.test(loop), "the extension starts from the cleaned draft");
const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(vm && (+vm[1] > 1 || (+vm[1] === 1 && (+vm[2] > 21 || (+vm[2] === 21 && +vm[3] >= 6)))), "VERSION is at least 1.21.6", vm && vm[0]);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
