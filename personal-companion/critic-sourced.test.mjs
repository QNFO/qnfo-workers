// CRITIC-QUOTE-SOURCED-1 + SENT-INITIALISM-1 + FULLTEXT-BUDGET-1 offline suite (personal-companion 1.26.2, charter pillar: personal;
// agent_issues 2552).
// Proves: a critic grounding quote that one source passage states (companion_runs 6178: "The emperor fled to Rehe, and Prince Gong stayed
// to sign the Convention of Peking") is recognised with its source sentence, while a quote with a figure, a negation or content the source
// does not hold is not; only a rejection whose every quote is sourced gets the re-read note, and both critic re-read sites use it after
// the analysis-rule case; a dotted initialism ("U.S.") no longer ends a sentence, so deleting the sentence that holds it leaves no
// "Consul." fragment (run 6224); the source budget is 36000 characters with 70% for the primary article.
// Run: node personal-companion/critic-sourced.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { importWorker } from "./_harness-import-worker.mjs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await importWorker(() => (src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()), new URL("./", import.meta.url));
const V = mod.__verify;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };

// the source the 08:00 UTC run was given (companion_anchor_cache 34, characters 2050-2570), with its neighbours
const ground = "These events prompted Lord Elgin to order his soldiers to loot and burn the Old Summer Palace as soon as they captured Beijing. The emperor and his entourage fled to Rehe, while Prince Gong stayed to conduct the negotiations, signing the Convention of Peking with the alliance on 24 October 1860, thus ratifying the Treaty of Tientsin and bringing the Second Opium War to an end. On 23 October 1856, the U.S. Consul James Keenan planted a flag on the walls of Canton.";

// 1. run 6178: the critic's "invented" sentence is stated by the source
const q6178 = "The emperor fled to Rehe, and Prince Gong stayed to sign the Convention of Peking";
const sp = V.sourcedPassage(V.sourceSentences(ground), q6178);
ok(sp && /fled to Rehe, while Prince Gong/.test(sp), "run 6178: the quote is found with its source sentence", sp);
const all = V.quotesAllSourced(ground, [q6178]);
ok(all && all.length === 1 && all[0].quote === q6178, "a rejection whose only quote is sourced is recognised", all);
const note = V.sourcedRereadNote(all);
ok(/^RUBRIC CHECK: /.test(note) && note.includes(q6178) && /source: "The emperor and his entourage fled to Rehe/.test(note) && /including names, figures and negation/.test(note), "the note shows each quote beside its source sentence and asks for a compare", note.slice(0, 300));

// 2. what is not sourced stays a rejection
ok(V.sourcedPassage(V.sourceSentences(ground), "The emperor did not flee to Rehe, and Prince Gong refused to sign the Convention of Peking") === null, "a negation the source does not have is not sourced");
ok(V.sourcedPassage(V.sourceSentences(ground), "Prince Gong signed the Convention of Peking with the alliance on 25 October 1860") === null, "a figure the source does not have (25 October) is not sourced");
ok(V.sourcedPassage(V.sourceSentences(ground), "The emperor's flight showed the court valued its survival over the capital and its palaces") === null, "an interpretation the source does not state is not sourced");
ok(V.quotesAllSourced(ground, [q6178, "Consul. Negotiations failed and the city was bombarded."]) === null, "one unsourced quote among sourced ones: no re-read (every quote must be sourced)");
ok(V.quotesAllSourced(ground, []) === null, "no quotes: not this case (RUBRIC-NO-QUOTE-1 handles it)");

// 3. wiring: both re-read sites, after the analysis-rule case, and the stage log says which case ran
ok(/var rqSrc = rq\.length \? quotesAllSourced\(ground, rq\) : null;[\s\S]{0,40}var rrNote = !rq\.length \? rubricNoQuoteNote\(\) : analysisSplitOk\(splitText\(piece\)\) && quotesAllInAnalysis\(piece, rq\) \? rubricRereadNote\(rq\) : rqSrc \? sourcedRereadNote\(rqSrc\) : "";/.test(src), "the first critic read gets the sourced re-read after the analysis-rule case");
ok(/var rqfSrc = rqf\.length \? quotesAllSourced\(ground, rqf\) : null;[\s\S]{0,40}var rrNoteF = [^\n]*rqfSrc \? sourcedRereadNote\(rqfSrc\) : "";/.test(src), "the final read gets it too");
ok((src.match(/" quoted passages the source states"/g) || []).length === 2, "both stage logs name the sourced case");

// 4. SENT-INITIALISM-1: "U.S." does not end a sentence
ok(V.SENT_ABBREV_RE.test("planted on the order of the U.S.") && V.SENT_ABBREV_RE.test("moved to Washington, D.C.") && !V.SENT_ABBREV_RE.test("the war ended in 1860.") && !V.SENT_ABBREV_RE.test("World War II."), "dotted initialisms are abbreviations; a year or a roman numeral still ends a sentence");
const piece = { lede: "", body_md: "The flag was planted on the order of the U.S. Consul. Negotiations failed and the city was bombarded. The fleet sailed north." };
const r = V.deleteSentences(piece, (units) => { units.forEach((u) => { if (/planted/.test(u.sn)) u.cut = true; }); });
ok(r.removed.length === 1 && /U\.S\. Consul\./.test(r.removed[0]) && /^Negotiations failed/.test(r.piece.body_md) && !/Consul/.test(r.piece.body_md), "deleting the sentence that holds U.S. leaves no Consul. fragment (run 6224)", r);
ok(r.total === 3, "the paragraph still has three sentences", r.total);

// 5. FULLTEXT-BUDGET-1
ok(V.GROUND_MAX === 36000 && V.PRIMARY_SHARE === 0.7 && Math.floor(V.GROUND_MAX * V.PRIMARY_SHARE) >= 25000, "36000 characters, 70% for the primary article (about 25200)");
ok(/String\(ground \|\| ""\)\.slice\(0, GROUND_MAX \+ 2000\)/.test(src) && /String\(ground\)\.slice\(0, GROUND_MAX \+ 2000\)/.test(src), "the critic and the fact-check read the same budget");

const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 1 || (ver[0] === 1 && (ver[1] > 26 || (ver[1] === 26 && ver[2] >= 2)))), "VERSION is at least 1.26.2", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
