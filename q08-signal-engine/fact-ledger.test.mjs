// Q08-FACT-LEDGER-1 offline suite (q08-signal-engine 0.32.0, charter pillar: research; agent_issues 2606 Q08-PUBLISH-STALL-AUTO-1).
// Proves: (1) buildPrompt numbers the sentences of the item, the signal and the linked article into a SOURCE LEDGER with the rule that the
// reporting sections reuse a ledger sentence's names and figures and the analysis section stays exempt, and the FACTS rule text is byte for
// byte what it was (sha256 pinned from origin/main before this change); (2) groundPreCheck, the free deterministic check that now runs on the
// writer's draft before the reader panel: a draft whose names and figures are all in the ground passes untouched, one unsupported sentence is
// pruned and the re-check passes, a mutated figure or an untagged year the prune cannot remove fails, a forecast is not pruned, and an error
// inside the check lets the draft go to the panel as before; (3) generate() end to end: a draft that fails the pre-check makes ZERO reader
// panel calls and ends as an accuracy failure that stallStage reads as fact-check, a draft the prune repairs reaches the panel without the
// pruned sentence, a clean draft reaches the panel; (4) a ledger tag copied into a draft is removed, single, grouped ([S1, S2], [S3;S4]),
// ranged ([S2-S3], en dash) and two-digit ([S12]), and a grouped tag in the lede no longer makes the pre-check refuse the draft; (5) the
// wiring order in the source; (7) the off switch ops_config q08_ground_precheck (on | prune | off): its read (default, env override, cache,
// fail open), the pre-check in each mode on an essay and a forecast, generate() and generateForecast() end to end in each mode, and `off`
// making zero pre-check calls; (8) review repairs, each pinned by a mutant that survived the suite: the ledger bounds as literals (80 lines, 7500
// characters, 280 per line) read from the real buildPrompt output, and the three gates after the prune in groundPreCheck (the re-check that refuses a
// draft the prune leaves flagged, the essay flag of that re-check and of the first check, ledeProblems on the pruned text), each through the pre-check
// and through generate() with zero panel calls, plus the forecast flag at the generateForecast call site.
// Fixtures follow the failing engine_runs of 2026-10-19 (#659: "Ruby ... created in the mid-1990s by Yukihiro Matsumoto", name and year not in
// the source; #660: the co-founder "announced" what the blog post by the team said; 'figure not in the source' and 'year not in the source').
// Run: node q08-signal-engine/fact-ledger.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
const here = dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(join(here, "worker.js")).href);
const src = readFileSync(join(here, "worker.js"), "utf8");
const F = mod.__factledger || {};
const G = mod.__gen, L = mod.__lede, A = mod.__analysis, S = mod.__stall;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 600) : "")); } };
const quiet = (fn) => { const e = console.error; console.error = () => {}; try { return fn(); } finally { console.error = e; } };

ok(typeof F.groundPreCheck === "function" && typeof F.sourceLedger === "function" && typeof F.ledgerBlock === "function", "the worker exports the pre-check and the ledger builders");

// ---- fixtures: the source of run #659 (an open-source maintainer archives his Ruby gems)
const story = { source: "hn", title: "Paul Battley archives his Ruby gems", url: "https://paul.battley.org.uk/archive" };
const friction = { core_concept: "Ruby gems archived", friction_point: "Commenters argue about maintainers who stop work on open-source libraries. One says the volunteer bargain has changed.", signal_strength: "High" };
const article = "Paul Battley wrote on his blog that he no longer cares to work on any Ruby gems. He has archived the repositories. He says the age of that kind of contribution has passed. The settlement in the dispute was $42 million.";
const srcCtx = { source: "hn", title: story.title, url: story.url };
const ground = F.labelledGround ? F.labelledGround(story, friction, article, "", []) : "";

// ---- 1. the ledger in the prompt
const prompt = L.buildPrompt(friction, [], [], { source: srcCtx, article: article, background: "Wikipedia, 'Ruby': a language." });
const ledgerLines = prompt.split("\n").filter((l) => /^\[S\d+\] /.test(l));
ok(ledgerLines.length >= 7 && ledgerLines.every((l, i) => l.startsWith("[S" + (i + 1) + "] ")), "the prompt carries numbered ledger lines [S1], [S2], ... in order", ledgerLines.slice(0, 3));
ok(/^\[S1\] The item is titled .Paul Battley archives his Ruby gems.\. It appeared on paul\.battley\.org\.uk\./.test(ledgerLines[0] || ""), "S1 is the item's own description, as the ground states it", ledgerLines[0]);
ok(ledgerLines.some((l) => /^\[S\d+\] Commenters argue about maintainers who stop work on open-source libraries\.$/.test(l)) && ledgerLines.some((l) => /^\[S\d+\] The settlement in the dispute was \$42 million\.$/.test(l)) && ledgerLines.some((l) => /^\[S\d+\] He says the age of that kind of contribution has passed\.$/.test(l)), "the signal's and the article's sentences are each one ledger line", ledgerLines);
ok(/--- SOURCE LEDGER /.test(prompt) && /LEDGER RULE: every assertion about the real world in the reporting sections/.test(prompt) && /reuses the names, figures, dates and attributions of one ledger sentence/.test(prompt) && /If no ledger sentence states a claim, leave the claim out\./.test(prompt), "the prompt states the ledger rule for the reporting sections");
ok(/The analysis section is exempt: its reasoning may go beyond the ledger as conditional reasoning/.test(prompt) && /it adds no new name, date or figure/.test(prompt), "the analysis section stays exempt (Q08-FACT-INFERENCE-1)");
ok(prompt.indexOf("--- BACKGROUND") > 0 && prompt.indexOf("--- BACKGROUND") < prompt.indexOf("--- SOURCE LEDGER") && /BACKGROUND facts stay attributed to the background as before\./.test(prompt), "the ledger follows the background and leaves the background rule alone");
ok(/Never write a ledger tag such as \[S3\] in the essay\./.test(prompt), "the writer is told never to print a tag");
// the FACTS rule text is what origin/main held before this change
const dir = L.Q08_DIRECTIVE, fi = dir.indexOf("FACTS (hard, non-negotiable, and checked)"), facts = dir.slice(fi, dir.indexOf("\n", fi));
ok(createHash("sha256").update(facts).digest("hex") === "95588ae9d7dfafaa2a7b124b2e499c77b3c3d8dfed7aa94c9aba56f6083bf76f" && facts.length === 1104, "the FACTS rule text is byte-identical to origin/main (1104 characters)", [facts.length, createHash("sha256").update(facts).digest("hex")]);
ok(createHash("sha256").update(dir).digest("hex") === "9692ec1eed6b6b25398f545c4ec339bd85e9f476762a03ac1a1de873650860ee" && prompt.startsWith(dir), "the whole directive is unchanged and still opens the prompt");
// bounds and the empty case
{
  const big = Array.from({ length: 400 }, (_, i) => "Sentence number " + i + " of the long article states a fact about the outage.").join(" ");
  const lines = F.sourceLedger ? F.sourceLedger(friction, big, srcCtx) : [];
  const total = lines.reduce((n, t) => n + t.length, 0);
  ok(lines.length > 0 && lines.length <= F.LEDGER_MAX_LINES && total <= F.LEDGER_MAX_CHARS && lines.every((t) => t.length <= 280), "the ledger is bounded in lines, characters and line length", [lines.length, total]);
  ok(F.ledgerBlock && F.ledgerBlock({ friction_point: "" }, "", null) === "" && !/SOURCE LEDGER/.test(L.buildPrompt({ core_concept: "c", friction_point: "", signal_strength: "High" }, [], [], { article: "" })), "no sentences, no ledger block");
}

// ---- 1b. the ledger bounds as LITERALS, read from the real buildPrompt output (review repair). The check above compares against the constants the
// worker exports and feeds the ledger short lines, so a changed constant or a deleted guard passed it. 80 lines, 7500 characters, 280 per line.
{
  const fp = (txt) => ({ core_concept: "c", friction_point: txt, signal_strength: "High" });
  const ledgerOf = (p) => { const a = p.indexOf("--- SOURCE LEDGER"), b = p.indexOf("LEDGER RULE:", a); return a < 0 || b < 0 ? [] : p.slice(a, b).split("\n").filter((l) => /^\[S\d+\] /.test(l)).map((l) => l.replace(/^\[S\d+\] /, "")); };
  const build = (txt, art, bg) => L.buildPrompt(fp(txt), [], [], { source: srcCtx, article: art || "", background: bg || "" });
  const sum = (ls) => ls.reduce((n, t) => n + t.length, 0);
  // one sentence of exactly `len` characters: capital letter, words of letters, one full stop at the end, no other full stop
  const sentOf = (len, tag) => { let s = ("Sentence " + tag + " of the signal states a fact about the outage and the abcdefghi ").repeat(20).slice(0, len - 1); if (s.endsWith(" ")) s = s.slice(0, -1) + "x"; return s + "."; };
  ok(F.LEDGER_MAX_LINES === 80 && F.LEDGER_MAX_CHARS === 7500, "the exported bounds are 80 lines and 7500 characters (a change to either is a change to this test)", [F.LEDGER_MAX_LINES, F.LEDGER_MAX_CHARS]);
  // (i) 280 characters per line: 280 is kept whole, 281 and 600 are cut at a word boundary to at most 280
  const s280 = sentOf(280, "a"), s281 = sentOf(281, "b"), s600 = sentOf(600, "c");
  ok(s280.length === 280 && s281.length === 281 && s600.length === 600 && [s280, s281, s600].every((s) => /^Sentence [abc] /.test(s) && s.indexOf(".") === s.length - 1), "fixture: three sentences of 280, 281 and 600 characters, each one sentence", [s280.length, s281.length, s600.length]);
  const lenLines = ledgerOf(build([s280, s281, s600].join(" ")));
  const l280 = lenLines.find((t) => t.startsWith("Sentence a ")), l281 = lenLines.find((t) => t.startsWith("Sentence b ")), l600 = lenLines.find((t) => t.startsWith("Sentence c "));
  ok(l280 === s280, "a sentence of exactly 280 characters is kept whole in the prompt's ledger", l280 && l280.length);
  for (const [lbl, s, ln] of [["281", s281, l281], ["600", s600, l600]]) {
    ok(!!ln && ln.length <= 280 && ln.length >= 268 && s.startsWith(ln) && s.charAt(ln.length) === " " && ln !== s, "a sentence of " + lbl + " characters is cut to at most 280, a prefix of itself ending on a whole word", [ln && ln.length, ln && ln.slice(-20)]);
  }
  ok(lenLines.length === 4 && lenLines.every((t) => t.length <= 280), "no line of the prompt's ledger is longer than 280 characters", lenLines.map((t) => t.length));
  // (ii) 7500 characters: the item line plus sentences that add up to exactly 7500 are all kept, the next sentence (25 characters, the shortest a line can be) is not
  const itemLine = ledgerOf(build(""))[0], X = itemLine.length;
  const lens = []; let rem = 7500 - X;
  while (rem > 280) { lens.push(250); rem -= 250; }
  lens.push(rem);
  const fill = lens.map((n, i) => sentOf(n, "f" + i)), extra = sentOf(25, "extra");
  ok(/^The item is titled /.test(itemLine) && lens.every((n) => n >= 25 && n <= 280) && X + lens.reduce((a, b) => a + b, 0) === 7500 && lens.length + 1 < 80 && extra.length === 25, "fixture: the item line and " + lens.length + " sentences add up to exactly 7500 characters in fewer than 80 lines", [X, lens]);
  const capPrompt = build(fill.concat([extra]).join(" ")), capLines = ledgerOf(capPrompt);
  ok(sum(capLines) === 7500 && capLines.length === 1 + fill.length && capLines[capLines.length - 1] === fill[fill.length - 1], "a ledger that reaches exactly 7500 characters keeps every sentence up to the cap", [sum(capLines), capLines.length, fill.length]);
  ok(!capLines.some((t) => t.startsWith("Sentence extra ")) && capPrompt.includes("Sentence extra "), "the sentence that would pass 7500 characters is not in the ledger (it is still in the signal text)", capLines.length);
  // (iii) 80 lines: the item line and 79 sentences, the 80th sentence and later ones are dropped though they would fit in characters
  const many = Array.from({ length: 150 }, (_, i) => "Sentence number " + i + " of the signal states a fact about the outage.");
  const manyPrompt = build(many.join(" ")), manyLines = ledgerOf(manyPrompt);
  ok(manyLines.length === 80 && manyLines[0] === itemLine && manyLines[79] === many[78] && !/\[S81\] /.test(manyPrompt) && /\[S80\] Sentence number 78 /.test(manyPrompt) && sum(manyLines) < 7500, "the ledger stops at 80 lines when the characters would still fit (S80 is the 79th sentence, there is no S81)", [manyLines.length, sum(manyLines)]);
  // (iv) a signal, a linked article and a background that together exceed 7500 characters: the total cap holds on the real prompt, the background adds no line
  const sig = Array.from({ length: 12 }, (_, i) => sentOf(270, "g" + i)).join(" ");
  const art = Array.from({ length: 200 }, (_, i) => "Article sentence " + i + " says the operators described the fault in detail and the cost.").join(" ");
  const bgText = Array.from({ length: 400 }, (_, i) => "Background sentence " + i + " says something about the wider system and its long history.").join(" ");
  const bigPrompt = build(sig, art, bgText), bigLines = ledgerOf(bigPrompt);
  ok(sig.length + art.slice(0, 6000).length + itemLine.length > 7500 && art.length > 6000 && bgText.length > 22000, "fixture: item, signal and the first 6000 characters of the article add up to more than 7500 characters", [sig.length, art.length, bgText.length]);
  ok(bigLines.length <= 80 && sum(bigLines) <= 7500 && sum(bigLines) > 7400, "the total of the ledger on a prompt with more material than fits is capped at 7500 characters and fills the cap", [bigLines.length, sum(bigLines)]);
  ok(bigLines.some((t) => /^Sentence g0 /.test(t)) && bigLines.some((t) => /^Article sentence 0 /.test(t)) && !bigLines.some((t) => /^Background sentence /.test(t)), "the signal and the article feed the ledger, the background does not", bigLines.length);
}

// ---- 2. groundPreCheck on fixtures
const tags = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const para = (i) => "The operator in case " + tags[i] + " watched the queue grow while the dashboard stayed green, because the dashboard measured the database and not the disk beneath it. In case " + tags[i] + " each hour widened the gap between what was measured and what was felt, and nobody owned the space between the two numbers.";
const TITLE = "# Battley archives his Ruby gems and the maintainer bargain changes";
const LEDE = "Paul Battley wrote on his blog that he no longer cares to work on any Ruby gems and has archived them.";
function mkEssay(lede, inject, n) {
  const body = tags.slice(0, n || 10).map((_, i) => para(i));
  if (inject) body[3] = body[3] + " " + inject;
  return TITLE + "\n\n" + lede + "\n\n" + body.join("\n\n") + "\n\nworth your time: yes - names the mechanism";
}
const NONE = { ok: undefined, piece: { text: "" }, problems: [], trail: "", rows: [] }; // what a worker without the pre-check yields, so every assertion below reports instead of throwing
const pre = (p, g, o) => (F.groundPreCheck ? F.groundPreCheck(p, g, o) : NONE);
const piece = (text) => ({ text, model: "@cf/openai/gpt-oss-120b" });
const opts = { forecast: false, banned: [], src: srcCtx };
const RUBY = "Ruby is a general-purpose programming language created in the mid-1990s by Yukihiro Matsumoto.";
const gateOk = (t) => mod.__title.gate(t, []).problems;
{
  // (a) a ledger-matching sentence passes, and the piece is returned untouched
  const text = mkEssay(LEDE, "He says the age of that kind of contribution has passed.");
  const p = piece(text);
  ok(gateOk(text).length === 0, "fixture: the clean essay passes the writer gate", gateOk(text));
  const r = pre(p, ground, opts);
  ok(r.ok === true && r.piece === p && r.rows.length === 0 && r.problems.length === 0, "(a) a draft whose sentences are all in the ledger passes the pre-check untouched, with no stage row", r);
}
{
  // (d) one unsupported sentence (run 659): the name and the year are not in the source; pruned, re-checked, passes
  const text = mkEssay(LEDE, RUBY);
  const flagged = F.groundingProblems ? F.groundingProblems(text, ground, { forecast: false }) : [];
  ok(flagged.some((x) => /^year not in the source: 1990$/.test(x)) && flagged.some((x) => /^name not in the source: Yukihiro Matsumoto\.?$/.test(x)), "fixture: the grounding check flags the year and the name of run 659", flagged);
  const r = pre(piece(text), ground, opts);
  ok(r.ok === true && r.pruned === 1 && !/Yukihiro|1990/.test(r.piece.text) && r.piece.pruned === 1 && r.piece.text.includes("case three") && r.piece.text.includes("case five"), "(d) the prune removes the one unsupported sentence and the re-check passes", r);
  ok(F.groundingProblems && F.groundingProblems(r.piece.text, ground, { forecast: false }).length === 0 && gateOk(r.piece.text).length === 0, "the repaired draft is clean and still passes the writer gate");
  ok(r.rows.length === 1 && r.rows[0].role === "ground_precheck" && r.rows[0].round === 0 && r.rows[0].pass === true && /pruned 1 sentences/.test(r.rows[0].fix), "the repair is recorded as a ground_precheck stage row", r.rows);
}
{
  // (b) a mutated figure: the source says $42 million, the draft says $4.2 million in its one-sentence lede; the prune cannot remove a lede
  const ledeBad = "Paul Battley wrote on his blog about a settlement of $4.2 million and archived his Ruby gems.";
  const text = mkEssay(ledeBad);
  const flagged = F.groundingProblems ? F.groundingProblems(text, ground, { forecast: false }) : [];
  ok(flagged.some((x) => /^figure not in the source: \$4\.2$/.test(x)), "fixture: the mutated figure is flagged", flagged);
  const r = pre(piece(text), ground, opts);
  ok(r.ok === false && r.problems.some((x) => /^figure not in the source: \$4\.2$/.test(x)) && /prune blocked: a flagged name or figure is in the lede/.test(r.trail) && r.piece.text === text, "(b) a mutated figure in the lede fails the pre-check and the draft is not altered", r);
  ok(r.rows.length === 1 && r.rows[0].pass === false && /the panel was not asked/.test(r.rows[0].fix), "the refusal is a ground_precheck stage row", r.rows);
  const same = mkEssay(ledeBad.replace("$4.2 million", "$42 million"));
  ok(pre(piece(same), ground, opts).ok === true, "the same sentence with the source's own figure passes");
  // the same mutated figure in a forecast: no prune, fails
  const fr = pre(piece(mkEssay("Paul Battley wrote about a $4.2 million settlement and archived his Ruby gems.")), ground, { forecast: true, banned: [] });
  ok(fr.ok === false && /^figure not in the source: \$4\.2$/.test((fr.problems || [])[0] || "") && /no prune for a forecast/.test(fr.trail || ""), "(b) a forecast draft with a mutated figure fails without a prune", fr);
}
{
  // (c) an untagged year the prune cannot remove: the draft sits just above the body floor, so cutting the sentence leaves it short
  let n = 1; while (A.publishBody(mkEssay(LEDE, "", n)).length < 2800) n++; n--; // the largest draft still under the floor
  let filler = "", inject = "In 2019 the maintainers moved their work to a private host before the archive was announced";
  const mk = () => mkEssay(LEDE, inject + filler + ".", n);
  while (A.publishBody(mk()).length < 2800) filler += " and the move was noted by the commenters";
  const text = mk();
  const flagged = F.groundingProblems ? F.groundingProblems(text, ground, { forecast: false }) : [];
  ok(A.publishBody(text).length >= 2800 && A.publishBody(mkEssay(LEDE, "", n)).length < 2800, "fixture: the injected sentence is what lifts the draft over the 2800-character floor", [A.publishBody(text).length, A.publishBody(mkEssay(LEDE, "", n)).length]);
  ok(flagged.some((x) => /^year not in the source: 2019$/.test(x)), "fixture: the untagged year is flagged", flagged);
  const r = pre(piece(text), ground, opts);
  ok(r.ok === false && r.problems.some((x) => /^year not in the source: 2019$/.test(x)) && /prune -1 blocked: too short after pruning/.test(r.trail), "(c) an untagged year whose prune leaves the draft under the floor fails the pre-check", r);
}
// ---- 2b. the gates after the prune (review repair). Each case is a draft that only one line of groundPreCheck refuses: the re-check of the pruned
// text, the flag of that re-check, the flag of the first check, and ledeProblems on the pruned text.
const onOpts = Object.assign({}, opts, { mode: "on" }), pruneOpts = Object.assign({}, opts, { mode: "prune" });
const withTitle = (t, title) => t.replace(TITLE, title);
{
  // (e) the prune cannot cut a title: a body sentence is prunable (RUBY: a year and a name) and the title names what the source does not hold, so one
  // prune leaves one flagged item. Mode on refuses with the remaining item; mode prune passes the ORIGINAL draft on (never the half-pruned text).
  const text = withTitle(mkEssay(LEDE, RUBY), "# Battley archives his Ruby gems and Quillfeather Labs takes notice");
  const flagged = F.groundingProblems(text, ground, { forecast: false });
  ok(gateOk(text).length === 0 && flagged.length === 3 && flagged.some((x) => /^year not in the source: 1990$/.test(x)) && flagged.some((x) => /^name not in the source: Yukihiro Matsumoto\.?$/.test(x)) && flagged.some((x) => /^name not in the source: Quillfeather Labs$/.test(x)), "fixture: a clean-looking draft whose body holds one prunable sentence (year and name) and whose title names Quillfeather Labs", [gateOk(text), flagged]);
  const cut = text.replace(" " + RUBY, "");
  ok(cut !== text && F.groundingProblems(cut, ground, { forecast: false }).join("|") === "name not in the source: Quillfeather Labs" && gateOk(cut).length === 0, "fixture: removing that one sentence leaves exactly one flagged item, the title's name, and a draft the gate accepts", F.groundingProblems(cut, ground, { forecast: false }));
  const p = piece(text);
  const r = pre(p, ground, onOpts);
  ok(r.ok === false && r.piece === p && r.piece.text === text && r.problems.length === 1 && r.problems[0] === "name not in the source: Quillfeather Labs" && r.trail === "prune -1 left 1 flagged" && !r.pruned && !r.passedOn, "(e) mode on: the pruned draft still holds a flagged item, so the pre-check refuses it and returns the original piece", r);
  ok(r.rows.length === 1 && r.rows[0].role === "ground_precheck" && r.rows[0].pass === false && /prune -1 left 1 flagged; 3 flagged, the panel was not asked/.test(r.rows[0].fix), "(e) the refusal is recorded as a ground_precheck stage row with the first count and the remainder", r.rows);
  const rp = pre(p, ground, pruneOpts);
  ok(rp.ok === true && rp.passedOn === true && rp.piece === p && rp.piece.text.includes("Yukihiro Matsumoto") && !rp.pruned && rp.problems.length === 0 && rp.flagged.length === 1 && rp.flagged[0] === "name not in the source: Quillfeather Labs" && rp.trail === "prune -1 left 1 flagged (q08_ground_precheck=prune: the draft goes to the panel unchanged)", "(e) mode prune: the draft goes to the panel as written (the original text, not the pruned one) with the remaining item named", rp);
  ok(rp.rows.length === 1 && rp.rows[0].pass === false && /went to the panel unchanged/.test(rp.rows[0].fix) && !/the panel was not asked/.test(rp.rows[0].fix), "(e) mode prune: the pass-through is recorded as a ground_precheck stage row", rp.rows);
  // the same body with a title the source supports: pruned once, clean (the contrast that proves the title is what the refusal is about)
  const rc = pre(piece(mkEssay(LEDE, RUBY)), ground, onOpts);
  ok(rc.ok === true && rc.pruned === 1 && rc.trail === "pruned 1 sentences, then clean", "(e) contrast: with a supported title the same prune passes", rc);
}
{
  // (f) the flag of the re-check: a title (never cut) holding a figure, a future year or a duration that only a forecast may state. The first check flags it
  // as an essay, the prune cuts RUBY, and the re-check must flag it again (forecast false); with forecast true it would call the pruned draft clean.
  // A body sentence with the same item is cut by the first check (forecast false there too), which a first check made with forecast true would miss.
  const flavours = [
    ["a percentage", "# Battley archives his Ruby gems and 55 percent of readers follow", "Roughly 55 percent of the commenters agree with him.", "figure not in the source: 55 percent"],
    ["a future year", "# Battley archives his Ruby gems and the fork lands by 2099", "He says the fork may land by 2099.", "year not in the source: 2099"],
    ["a duration", "# Battley archives his Ruby gems and the move took 6 months", "He says the archive took 6 months to finish.", "figure not in the source: 6 months"],
  ];
  for (const [what, title, inject, item] of flavours) {
    const tt = withTitle(mkEssay(LEDE, RUBY), title);
    const asEssay = F.groundingProblems(tt, ground, { forecast: false }), asForecast = F.groundingProblems(tt, ground, { forecast: true });
    ok(gateOk(tt).length === 0 && asEssay.includes(item) && !asForecast.includes(item) && asEssay.length === asForecast.length + 1, "fixture (" + what + "): the flag decides whether the title's item is flagged", [asEssay, asForecast]);
    const r = pre(piece(tt), ground, onOpts);
    ok(r.ok === false && r.problems.length === 1 && r.problems[0] === item && r.trail === "prune -1 left 1 flagged" && r.piece.text === tt, "(f) the re-check holds " + what + " in the title against an essay: refused after one prune with " + item, r);
    const rp = pre(piece(tt), ground, pruneOpts);
    ok(rp.ok === true && rp.passedOn === true && rp.flagged.length === 1 && rp.flagged[0] === item && /left 1 flagged/.test(rp.trail), "(f) mode prune passes it on with the remaining item named (" + what + ")", rp);
    const tb = mkEssay(LEDE, inject);
    ok(gateOk(tb).length === 0 && F.groundingProblems(tb, ground, { forecast: false }).join("|") === item && F.groundingProblems(tb, ground, { forecast: true }).length === 0, "fixture (" + what + "): a body sentence holding only that item is flagged as an essay and not as a forecast", F.groundingProblems(tb, ground, { forecast: false }));
    const rb = pre(piece(tb), ground, onOpts);
    ok(rb.ok === true && rb.pruned === 1 && rb.piece.text !== tb && rb.piece.text.includes("case three") && F.groundingProblems(rb.piece.text, ground, { forecast: false }).length === 0 && /pruned 1 sentences/.test(rb.rows[0].fix), "(f) the first check of an essay flags " + what + " and the prune cuts that sentence", rb);
  }
  // what the forecast flag changes, pinned on the text of the forecast case above: nothing is flagged for a forecast, the figures are flagged for an essay
  const fg = "Battley archived his Ruby gems. The settlement was $42 million.";
  const ftx = "# Battley may archive more Ruby gems\n\nBattley archived his Ruby gems, and by 2030 the settlement of $42 million may be followed, at a probability of 55 percent, by more.\n\nFORECAST-JSON: {\"claim\":\"x\"}\n\nworth your time: yes - names the mechanism";
  const fF = F.groundingProblems(ftx, fg, { forecast: true }), fE = F.groundingProblems(ftx, fg, { forecast: false });
  ok(fF.length === 0 && fE.includes("year not in the source: 2030") && fE.includes("figure not in the source: 55 percent"), "a probability and a future year the ground lacks are flagged for an essay and not for a forecast", [fF, fE]);
  ok(pre(piece(ftx), fg, { forecast: true, banned: [] }).ok === true && pre(piece(ftx), fg, { forecast: false, banned: [], src: srcCtx }).ok === false, "so the pre-check passes that text as a forecast and refuses it as an essay (the draft has no body sentence the prune could cut)", pre(piece(ftx), fg, { forecast: false, banned: [], src: srcCtx }));
}
{
  // (g) ledeProblems on the pruned text. The lede holds two sentences; the first one is flagged (a year the source lacks) and is the one that names the subject,
  // so LEDE-PRUNE-2 cuts it and the lede that remains no longer says what is discussed, or opens on an abstract noun. The draft before the prune is fine.
  const cases = [
    ["does not name the subject", "Paul Battley wrote in 2019 that he archived his Ruby gems. The repositories are now read-only.", /^prune -1 blocked: lede does not name the subject/],
    ["opens on an abstract noun", "Paul Battley wrote in 2019 that he archived his Ruby gems. The pattern is that Battley archived the Ruby gems and left the repositories read-only.", /^prune -1 blocked: lede opens on an abstract noun/],
  ];
  for (const [what, lede, trailRe] of cases) {
    const text = mkEssay(lede), p = piece(text);
    const flagged = F.groundingProblems(text, ground, { forecast: false });
    const cutText = text.replace(lede.split(". ")[0] + ". ", "");
    ok(gateOk(text).length === 0 && L.ledeProblems(text, srcCtx).length === 0 && flagged.join("|") === "year not in the source: 2019" && cutText !== text && L.ledeProblems(cutText, srcCtx).length === 1 && F.groundingProblems(cutText, ground, { forecast: false }).length === 0 && gateOk(cutText).length === 0, "fixture (" + what + "): the draft passes the lede check, one lede sentence is flagged, and cutting it fails only the lede check", [L.ledeProblems(text, srcCtx), L.ledeProblems(cutText, srcCtx), flagged]);
    const r = pre(p, ground, onOpts);
    ok(r.ok === false && trailRe.test(r.trail) && r.piece === p && r.problems.length === 1 && r.problems[0] === "year not in the source: 2019" && r.rows.length === 1 && r.rows[0].pass === false && /the panel was not asked/.test(r.rows[0].fix), "(g) mode on: a prune that leaves a lede that " + what + " is refused, the original piece is returned", r);
    const rp = pre(p, ground, pruneOpts);
    ok(rp.ok === true && rp.passedOn === true && rp.piece === p && rp.piece.text.includes("in 2019") && trailRe.test(rp.trail) && rp.flagged.join("|") === "year not in the source: 2019", "(g) mode prune: the original draft goes to the panel, the prune is not applied (" + what + ")", rp);
  }
  // contrast: the second lede sentence names the subject too, so the same prune is accepted
  const rc = pre(piece(mkEssay("Paul Battley wrote in 2019 that he archived his Ruby gems. Battley says the repositories are now read-only.")), ground, onOpts);
  ok(rc.ok === true && rc.pruned === 1 && !/2019/.test(rc.piece.text) && L.ledeProblems(rc.piece.text, srcCtx).length === 0, "(g) contrast: a lede that still names the subject after the cut passes", rc);
}
{
  // a forecast whose names and figures are in the ground, with a future year and a probability, is not refused
  const fground = "Battley archived his Ruby gems. The settlement was $42 million.";
  const ft = "# Battley may archive more Ruby gems\n\nBattley archived his Ruby gems, and by 2030 the settlement of $42 million may be followed, at a probability of 55 percent, by more.\n\nFORECAST-JSON: {\"claim\":\"x\"}\n\nworth your time: yes - names the mechanism";
  const fr = pre(piece(ft), fground, { forecast: true, banned: [] });
  ok(fr.ok === true && fr.rows.length === 0, "a forecast with future years and probabilities inside its ground passes", fr);
  const fb = pre(piece(ft.replace("by 2030", "by 2030 Zorblax Systems")), fground, { forecast: true, banned: [] });
  ok(fb.ok === false && fb.problems.some((x) => /^name not in the source: Zorblax/.test(x)), "a forecast naming what its ground does not hold is refused", fb);
}
{
  // fail-safe: an error inside the check lets the draft go to the panel as before
  const boom = { get text() { throw new Error("boom"); }, model: "m" };
  let r = null;
  quiet(() => { r = pre(boom, ground, opts); });
  ok(r.ok === true && r.piece === boom && r.error === true && r.rows.length === 0, "an error inside the pre-check is logged and the draft goes on to the panel unchanged", r);
  let r2 = null;
  quiet(() => { r2 = pre(null, ground, opts); });
  ok(r2.ok === true && r2.piece === null, "a missing piece cannot stop the run either");
  const logged = []; const orig = console.error; console.error = (m) => logged.push(String(m));
  try { pre(boom, ground, opts); } finally { console.error = orig; }
  ok(logged.some((m) => /groundPreCheck:caught/.test(m) && /boom/.test(m)), "the error is written to the log", logged);
}

// ---- 3. a copied ledger tag is removed; a text without one is untouched
{
  const N = mod.__carry.normalizeDraft;
  const tagged = "# Battley archives his Ruby gems [S1]\n\n[S2] Paul Battley wrote on his blog [S3]. He archived the repositories [S4][S5].\n\nworth your time: yes - names the mechanism [S9]";
  const out = N(tagged);
  ok(!/\[S\d+\]/.test(out) && /^# Battley archives his Ruby gems\n/.test(out) && /\nPaul Battley wrote on his blog\. He archived the repositories\.\n/.test(out) && /names the mechanism$/.test(out), "ledger tags the writer copies into its text are removed before any check reads it", out);
  const plain = "# Battley archives his Ruby gems\n\n  An indented line stays as it is.\n\nworth your time: yes - names the mechanism";
  ok(N(plain) === plain || N(plain) === plain.replace(/\r/g, ""), "a text without a tag is not touched");
}
{
  // grouped, ranged and two-digit tags (review finding): each form leaves no tag, a cosmetic tag in the lede cannot refuse the draft, a year is not a tag
  const N = mod.__carry.normalizeDraft, strip = F.stripLedgerTags;
  const forms = ["[S1, S2]", "[S1,S2]", "[S2 S3]", "[S2 S3 S4]", "[S1, S2 S3]", "[S2-S3]", "[S2\u2013S3]", "[S2\u2014S3]", "[S3;S4]", "[S3; S4]", "[S1, S2, S5]", "[S12]", "[S12, S14]", "[S10-S12]", "[S2-3]", "[S1][S2]"];
  for (const f of forms) {
    const out = strip("He archived the repositories " + f + ".");
    ok(out === "He archived the repositories.", "stripLedgerTags removes " + f + " with the space before it", out);
  }
  ok(strip("[S1, S2] He archived them. [S3;S4]\nA second line [S12].") === "He archived them.\nA second line.", "tags at the start of a line and of the text go with their space", strip("[S1, S2] He archived them. [S3;S4]\nA second line [S12]."));
  // text that only looks like a tag is left alone
  for (const keep of ["Amazon Simple Storage Service (S3) stores objects.", "He archived them (S3).", "The sample [S&P 500] rose.", "He cited [S3, 2019] in the paper.", "He cited [S3, 1999] in the paper.", "He cited [S3 2019] in the paper.", "The [S] key and the [S-curve] stay.", "See [S1 and S2] for the rest.", "A plain sentence."]) {
    ok(strip(keep) === keep, "stripLedgerTags leaves " + JSON.stringify(keep) + " untouched", strip(keep));
  }
  // the failure the widening removes: before it, [S1, S2] in the one-sentence lede reads as a name the source lacks and the pre-check refuses the draft
  const stripOld = (t) => /\[S\d{1,3}\]/.test(t) ? t.replace(/[ \t]*\[S\d{1,3}\]/g, "").replace(/^[ \t]+(?=\S)/gm, "") : t;
  for (const f of ["[S1, S2]", "[S1 S2]", "[S1, S2 S3]", "[S2-S3]", "[S3;S4]", "[S12]"]) {
    const raw = mkEssay(LEDE.replace(/\.$/, " " + f + "."));
    const viaOld = stripOld(raw.replace(/\r\n/g, "\n"));
    const flaggedOld = F.groundingProblems(viaOld, ground, { forecast: false });
    const rOld = pre(piece(viaOld), ground, opts);
    const rNew = pre(piece(N(raw)), ground, opts);
    if (f !== "[S12]") ok(rOld.ok === false && flaggedOld.some((x) => /^name not in the source: S\d/.test(x)) && /prune blocked: a flagged name or figure is in the lede/.test(rOld.trail), "the old single-tag strip left " + f + " in the lede and the pre-check refused the draft (the defect)", [flaggedOld, rOld.trail]);
    ok(!/\[S\d/.test(N(raw)) && rNew.ok === true && rNew.rows.length === 0 && rNew.problems.length === 0, "with " + f + " in the lede the normalised draft passes the pre-check clean", rNew);
  }
  // in a body paragraph a grouped tag is stripped too, so the sentence is not pruned and the draft is not pushed under the 2800-character floor
  const body = mkEssay(LEDE, "He says the age of that kind of contribution has passed [S2, S4].");
  const nb = N(body), rb = pre(piece(nb), ground, opts);
  ok(!/\[S\d/.test(nb) && rb.ok === true && rb.rows.length === 0 && nb.includes("has passed."), "a grouped tag in a body paragraph is stripped and the sentence survives the pre-check", rb);
  const cleanLen = A.publishBody(mkEssay(LEDE, "He says the age of that kind of contribution has passed.")).length;
  ok(A.publishBody(nb).length === cleanLen, "the stripped body has the length of the untagged one (nothing is pruned)", [A.publishBody(nb).length, cleanLen]);
}

// ---- 4. stallStage still reads the pre-check failure as fact-check
{
  const row = { status: "gate_failed", error: "accuracy: figure not in the source: 4200; name not in the source: Zorblax Systems; pre-check: prune blocked: a flagged name or figure is in the lede" };
  ok(S.stallStage(row) === "fact-check", "an essay pre-check failure is a fact-check failure in the stage digest", S.stallStage(row));
  ok(S.stallStage({ status: "gate_failed", error: "forecast: accuracy: name not in the source: Zorblax; pre-check: x" }) === "fact-check", "so is a forecast pre-check failure");
  ok(S.stallStage({ status: "gate_failed", error: "ensemble: the edited draft was still not worth reading (panel mean 3 of 5)" }) === "reader panel" && S.stallStage({ status: "gate_failed", error: "forecast: compose failed: x" }) === "writer gate" && S.stallStage({ status: "skipped", error: "daily attempt cap reached (40/40)" }) === "skipped", "the other stages are classified as before");
  ok(S.stallDigest([row, row, { status: "gate_failed", error: "ensemble: the edited draft was still not worth reading" }]) === "fact-check 2, reader panel 1", "the digest counts it under fact-check", S.stallDigest([row, row]));
}

// ---- 5. generate() end to end: the panel is never asked about a draft the pre-check refuses
const realFetch = globalThis.fetch;
function stubFetch() {
  globalThis.fetch = async (url) => {
    const u = String(url), res = (body, type) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200, headers: { "content-type": type || "application/json" } });
    if (u.includes("hn.algolia.com/api/v1/search")) return res({ hits: [{ _tags: ["story"], title: "Operators describe a regional outage", objectID: "7001", story_id: "7001", url: "https://example.org/7001", points: 300, num_comments: 120, created_at: new Date().toISOString() }] });
    if (u.includes("hn.algolia.com/api/v1/items/")) return res({ title: "Operators describe a regional outage", children: [1, 2, 3].map((k) => ({ text: "<p>" + ("Comment " + k + " about how the system behaved under load. ").repeat(8) + "</p>", children: [] })) });
    if (u.startsWith("https://example.org/")) return res("<html><body><p>" + "The service reported a fault and the operators described it in detail. ".repeat(130) + "</p></body></html>", "text/html");
    return new Response("nope", { status: 500 });
  };
}
function makeDb() {
  G.resetRunColumns();
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE engine_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at TEXT DEFAULT (datetime('now')), signals_scraped INTEGER DEFAULT 0, signals_scored INTEGER DEFAULT 0, piece_published INTEGER DEFAULT 0, top_signal TEXT, model TEXT, ms INTEGER DEFAULT 0, status TEXT, error TEXT)");
  db.exec("CREATE TABLE published_pieces (id TEXT PRIMARY KEY, signal_id TEXT, slug TEXT UNIQUE, title TEXT, body_md TEXT, body_html TEXT, core_concept TEXT, signal_source TEXT, published_at TEXT, reads INTEGER DEFAULT 0, feedback_score REAL DEFAULT 0, promoted INTEGER DEFAULT 0, sources_json TEXT, kind TEXT DEFAULT 'analysis', property TEXT)");
  db.exec("CREATE TABLE signal_log (id TEXT PRIMARY KEY, source TEXT NOT NULL, source_id TEXT, title TEXT, url TEXT, points INTEGER DEFAULT 0, num_comments INTEGER DEFAULT 0, ratio REAL DEFAULT 0, volatility_score REAL DEFAULT 0, friction_point TEXT, signal_strength TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')), processed_at TEXT)");
  db.exec("CREATE TABLE q08_retractions (slug TEXT PRIMARY KEY, reason TEXT, claims_json TEXT, retracted_at TEXT)");
  db.exec("CREATE TABLE prompt_pool (id TEXT PRIMARY KEY, piece_id TEXT, structure_md TEXT NOT NULL, performance_score REAL DEFAULT 0, reads INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))");
  const shim = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, run: async () => { db.prepare(sql).run(...a); return { meta: {} }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return st; } };
  return { db, shim };
}
const E_TITLE = "# Operators describe a regional outage and the alert that never fired";
const E_LEDE = "The operators of a regional service described an outage in detail on a public forum, and the service reported a fault.";
function eEssay(lede, inject) {
  const body = tags.slice(0, 10).map((_, i) => para(i));
  if (inject) body[3] = body[3] + " " + inject;
  return E_TITLE + "\n\n" + lede + "\n\n" + body.join("\n\n") + "\n\nworth your time: yes - names the mechanism";
}
const Z_SENT = "In case four the vendor Zorblax Systems paid 4200 in credits after the outage.";
async function runGenerate(draft, extraEnv) {
  const { db, shim } = makeDb();
  F.resetGroundPreCheck && F.resetGroundPreCheck();
  const panel = []; let writerCalls = 0;
  const env = Object.assign({ DB: shim }, extraEnv || {}, { AI: { run: async (m, a) => {
    const pr = (a.messages || []).map((x) => x.content).join("\n") + (a.prompt || "");
    if (/You are a busy, intelligent reader/.test(pr)) { panel.push(pr); return { response: JSON.stringify({ would_read_to_end: false, score: 2, slop_tells: [], fix: "tighten the opening" }) }; }
    if (/You are the writer for q08\.org/.test(pr)) writerCalls++;
    return { response: draft };
  } } });
  stubFetch();
  let out = null, thrown = null;
  quiet(() => {});
  const e = console.error; console.error = () => {};
  try { out = await G.generate(env); } catch (err) { thrown = String(err && err.message || err); } finally { console.error = e; }
  return { db, env, out, thrown, panel, preCalls: F.groundPreCalls, get writerCalls() { return writerCalls; }, runs: db.prepare("SELECT * FROM engine_runs ORDER BY id").all(), stage: db.prepare("SELECT * FROM q08_reader_tests WHERE role = 'ground_precheck'").all() };
}
try {
  const fixtureGate = gateOk(eEssay(E_LEDE, Z_SENT));
  ok(fixtureGate.length === 0, "fixture: the end-to-end drafts pass the writer gate", fixtureGate);
  // A: the unsupported name and figure sit in the one-sentence lede, which a prune cannot remove
  const ledeBad = "The operators of a regional service said Zorblax Systems owed its customers 4200 in credits after the outage.";
  const a = await runGenerate(eEssay(ledeBad));
  const rowA = a.runs[a.runs.length - 1] || {};
  ok(a.thrown === null && a.writerCalls >= 1 && rowA.status === "gate_failed", "A: the run ends gate_failed after the writer", [a.thrown, a.writerCalls, a.runs]);
  ok(a.panel.length === 0, "A: the reader panel makes ZERO calls for a draft the deterministic pre-check refuses", a.panel.length);
  ok(/^accuracy: .*name not in the source: Zorblax Systems/.test(rowA.error || "") && /pre-check: prune blocked: a flagged name or figure is in the lede/.test(rowA.error || ""), "A: the run error is an accuracy failure that names the flagged items and the pre-check", rowA.error);
  ok(S.stallStage(rowA) === "fact-check" && S.stallDigest(a.runs) === "fact-check 1", "A: stallStage classifies the run as fact-check", S.stallDigest(a.runs));
  ok(a.stage.length === 1 && a.stage[0].pass === 0 && /the panel was not asked/.test(a.stage[0].fix), "A: the refusal is saved as a q08_reader_tests stage row", a.stage);
  ok(a.db.prepare("SELECT status FROM signal_log WHERE source_id = 'hn:7001'").get().status === "gate_failed", "A: the story is marked processed as for any gate failure (no silent drop)");
  // B: the unsupported sentence is in a body paragraph: pruned, and the panel reads the pruned draft
  const b = await runGenerate(eEssay(E_LEDE, Z_SENT));
  ok(b.panel.length >= 1 && !/Zorblax|4200/.test(b.panel[0]) && b.panel[0].includes("case three") && b.panel[0].includes("case five"), "B: a draft the prune repairs reaches the panel (first read) without the pruned sentence", b.panel.length);
  ok(b.stage.length === 1 && b.stage[0].pass === 1 && /pruned 1 sentences/.test(b.stage[0].fix), "B: the repair is saved as a stage row", b.stage);
  ok(!/^accuracy:/.test((b.runs[b.runs.length - 1] || {}).error || ""), "B: the run does not end as an accuracy failure", (b.runs[b.runs.length - 1] || {}).error);
  // C: a clean draft reaches the panel untouched
  const c = await runGenerate(eEssay(E_LEDE));
  ok(c.panel.length >= 1 && c.stage.length === 0, "C: a clean draft is read by the panel and leaves no stage row", [c.panel.length, c.stage.length]);
} finally { globalThis.fetch = realFetch; }

// ---- 6. the wiring in the source
const gen = src.slice(src.indexOf("async function generate(env) {"), src.indexOf("// Q08-FORECAST-1 (v0.9.0"));
ok(gen.indexOf("var essayGround = labelledGround(story, friction, article, background, ownerNotes);") > 0 && gen.indexOf("var essayGround = labelledGround(") < gen.indexOf("groundPreCheck(piece, essayGround") && gen.indexOf("groundPreCheck(piece, essayGround") < gen.indexOf("await runLevels(env, {"), "generate(): the ground is built, then the pre-check runs, then the panel");
ok(gen.indexOf("await runLevels(env, {") < gen.indexOf("await verifyAndRevise(env, {") && gen.indexOf("await verifyAndRevise(env, {") < gen.indexOf("await finalRead("), "generate(): the LLM fact-check (verifyAndRevise) and the final read still run after the panel, unchanged in order");
ok(/else gateResult = \{ ok: false, problems: \["accuracy: " \+ pre\.problems\.join\("; "\), "pre-check: " \+ pre\.trail\] \};/.test(gen), "generate(): a refused draft becomes an accuracy failure");
const fgen = src.slice(src.indexOf("async function generateForecast(env, t0) {"), src.indexOf("async function generateForecast(env, t0) {") + 9000);
ok(fgen.indexOf("var fcGround = ") > 0 && fgen.indexOf("var fcGround = ") < fgen.indexOf("groundPreCheck(piece, fcGround") && fgen.indexOf("groundPreCheck(piece, fcGround") < fgen.indexOf("await runLevels(env, {") && fgen.indexOf("await runLevels(env, {") < fgen.indexOf("await verifyAndRevise(env, {"), "generateForecast(): ground, pre-check, panel, then verifyAndRevise");
ok(/var readerRows = repairRows\.concat\(lv\.rows\);/.test(src), "the reader rows are still saved with the repair rows (framing-repair suite contract)");

// ---- 7. the off switch ops_config q08_ground_precheck: on (default) | prune | off
{
  const M = F.groundPreCheckMode, reset = F.resetGroundPreCheck;
  ok(typeof M === "function" && typeof reset === "function", "the worker exports the mode read and its cache reset");
  reset();
  ok(await M(null) === "on" && await M({}) === "on" && await M({ AUDIT: {} }) === "on", "no binding: on, the shipped default");
  ok(await M({ Q08_GROUND_PRECHECK: "off" }) === "off" && await M({ Q08_GROUND_PRECHECK: "prune" }) === "prune" && await M({ Q08_GROUND_PRECHECK: " OFF " }) === "off" && await M({ Q08_GROUND_PRECHECK: "nonsense" }) === "on", "the env override reads off and prune, anything else is on");
  let qn = 0, lastSql = "", val = "off";
  const cfg = { AUDIT: { prepare: (sql) => { lastSql = sql; return { first: async () => { qn++; return val === null ? null : { value: val }; } }; } } };
  reset();
  ok(await M(cfg) === "off" && /FROM ops_config WHERE key = 'q08_ground_precheck'/.test(lastSql), "ops_config q08_ground_precheck = off switches the pre-check off", lastSql);
  await M(cfg); await M(cfg);
  ok(qn === 1, "the answer is cached for five minutes", qn);
  val = "prune"; reset();
  ok(await M(cfg) === "prune", "ops_config prune reads prune");
  val = "on"; reset();
  ok(await M(cfg) === "on", "ops_config on reads on");
  val = "yes please"; reset();
  ok(await M(cfg) === "on", "an unknown value reads on");
  val = null; reset();
  ok(await M(cfg) === "on", "no row: on");
  // a failing read: on when nothing is known, the last known mode afterwards (and the error is logged)
  const logged = []; const orig = console.error; console.error = (m) => logged.push(String(m));
  const realNow = Date.now;
  try {
    reset();
    const down = { AUDIT: { prepare: () => ({ first: async () => { throw new Error("D1 down"); } }) } };
    ok(await M(down) === "on", "a failing first read fails open to on");
    val = "off"; reset(); await M(cfg);
    Date.now = () => realNow() + 6 * 60000; // past the five-minute cache
    ok(await M(down) === "off", "a failing read after the switch was read keeps the last known mode", await M(down));
  } finally { Date.now = realNow; console.error = orig; reset(); }
  ok(logged.some((m) => /groundPreCheckMode:caught/.test(m) && /D1 down/.test(m)), "the failed read is logged, not swallowed", logged);
}
{
  // the pre-check in each mode: an unsupported figure in the one-sentence lede (a prune cannot remove it), an essay and a forecast
  const ledeBad = "Paul Battley wrote on his blog about a settlement of $4.2 million and archived his Ruby gems.";
  const text = mkEssay(ledeBad), p = piece(text);
  const rOn = pre(p, ground, Object.assign({}, opts, { mode: "on" })), rNone = pre(p, ground, opts);
  ok(rOn.ok === false && rNone.ok === false && rOn.trail === rNone.trail, "mode on (and no mode, for an existing caller) refuses the draft", [rOn.trail, rNone.trail]);
  const rP = pre(p, ground, Object.assign({}, opts, { mode: "prune" }));
  ok(rP.ok === true && rP.piece === p && rP.passedOn === true && rP.problems.length === 0 && /q08_ground_precheck=prune: the draft goes to the panel unchanged/.test(rP.trail) && rP.flagged.some((x) => /^figure not in the source: \$4\.2$/.test(x)), "mode prune passes the draft, unchanged, to the panel where the prune cannot clear the problem", rP);
  ok(rP.rows.length === 1 && rP.rows[0].role === "ground_precheck" && rP.rows[0].round === 0 && rP.rows[0].pass === false && /went to the panel unchanged/.test(rP.rows[0].fix) && !/the panel was not asked/.test(rP.rows[0].fix), "the pass-through is still recorded as a ground_precheck stage row", rP.rows);
  // prune mode still prunes what the prune can clear, and a clean draft is untouched
  const rPr = pre(piece(mkEssay(LEDE, RUBY)), ground, Object.assign({}, opts, { mode: "prune" }));
  ok(rPr.ok === true && rPr.pruned === 1 && !rPr.passedOn && !/Yukihiro|1990/.test(rPr.piece.text) && rPr.rows[0].pass === true, "mode prune keeps the essay prune", rPr);
  const clean = piece(mkEssay(LEDE, "He says the age of that kind of contribution has passed."));
  ok(pre(clean, ground, Object.assign({}, opts, { mode: "prune" })).piece === clean, "mode prune leaves a clean draft untouched");
  // a prune that located nothing / was blocked by the gate also passes on in prune mode, the original text
  const rLoc = pre(piece(mkEssay("Paul Battley wrote about a $4.2 million settlement and archived his Ruby gems.")), ground, Object.assign({}, opts, { mode: "prune" }));
  ok(rLoc.ok === true && rLoc.passedOn === true && /\$4\.2 million/.test(rLoc.piece.text), "the passed-on draft is the original, never a half-pruned text", rLoc.trail);
  // a forecast: refused on, passed on in prune, never pruned
  const fground = "Battley archived his Ruby gems. The settlement was $42 million.";
  const ft = "# Battley may archive more Ruby gems\n\nBattley archived his Ruby gems, and by 2030 the settlement of $42 million may be followed, at a probability of 55 percent, by Zorblax Systems.\n\nFORECAST-JSON: {\"claim\":\"x\"}\n\nworth your time: yes - names the mechanism";
  const fp = piece(ft);
  const fOn = pre(fp, fground, { forecast: true, banned: [], mode: "on" }), fP = pre(fp, fground, { forecast: true, banned: [], mode: "prune" });
  ok(fOn.ok === false && fOn.problems.some((x) => /^name not in the source: Zorblax/.test(x)), "forecast, mode on: refused", fOn);
  ok(fP.ok === true && fP.piece === fp && fP.passedOn === true && fP.rows.length === 1 && fP.rows[0].pass === false && /no prune for a forecast/.test(fP.trail), "forecast, mode prune: never refused, passed on unchanged with a stage row", fP);
  // the error fail-safe is unchanged in every mode
  const boom = { get text() { throw new Error("boom"); }, model: "m" };
  let rb = null; quiet(() => { rb = pre(boom, ground, Object.assign({}, opts, { mode: "prune" })); });
  ok(rb.ok === true && rb.error === true, "an error inside the check still lets the draft go on in prune mode");
}
// generate() end to end in each mode: the draft of fixture A names what the source does not hold in its one-sentence lede
const stubAudit = (value) => ({ AUDIT: { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, first: async () => (/q08_ground_precheck/.test(sql) && value !== null ? { value } : null), run: async () => ({ meta: { changes: 0 } }), all: async () => ({ results: [] }) }; return st; } } });
try {
  const ledeBadE = "The operators of a regional service said Zorblax Systems owed its customers 4200 in credits after the outage.";
  const draftA = eEssay(ledeBadE);
  const on = await runGenerate(draftA, { Q08_GROUND_PRECHECK: "on" });
  const rowOn = on.runs[on.runs.length - 1] || {};
  ok(on.thrown === null && on.panel.length === 0 && on.preCalls === 1 && /pre-check: prune blocked/.test(rowOn.error || "") && on.stage.length === 1 && on.stage[0].pass === 0, "mode on: the pre-check runs once, refuses the draft and the panel makes ZERO calls", [on.thrown, on.panel.length, on.preCalls, rowOn.error]);
  const dflt = await runGenerate(draftA);
  ok(dflt.panel.length === 0 && dflt.preCalls === 1 && /pre-check: prune blocked/.test((dflt.runs[dflt.runs.length - 1] || {}).error || ""), "no switch set: the default is on", [dflt.panel.length, dflt.preCalls]);
  const prune = await runGenerate(draftA, { Q08_GROUND_PRECHECK: "prune" });
  const rowPr = prune.runs[prune.runs.length - 1] || {};
  ok(prune.thrown === null && prune.preCalls === 1 && prune.panel.length >= 1 && !/pre-check:/.test(rowPr.error || ""), "mode prune: the draft the prune cannot clear is read by the panel instead of being refused", [prune.thrown, prune.panel.length, rowPr.error]);
  ok(prune.panel[0].includes("Zorblax Systems") && prune.stage.length === 1 && prune.stage[0].pass === 0 && /went to the panel unchanged/.test(prune.stage[0].fix), "mode prune: the panel read the unchanged draft and the pass-through is saved as a stage row", prune.stage);
  const off = await runGenerate(draftA, { Q08_GROUND_PRECHECK: "off" });
  const rowOff = off.runs[off.runs.length - 1] || {};
  ok(off.thrown === null && off.preCalls === 0 && off.panel.length >= 1 && off.stage.length === 0 && !/pre-check:/.test(rowOff.error || ""), "mode off: ZERO pre-check calls, no stage row, the draft goes to the panel as in 0.31.3", [off.thrown, off.preCalls, off.panel.length, off.stage.length, rowOff.error]);
  const offCfg = await runGenerate(draftA, stubAudit("off"));
  ok(offCfg.thrown === null && offCfg.preCalls === 0 && offCfg.panel.length >= 1, "ops_config q08_ground_precheck = off (read through the AUDIT binding) switches the pre-check off without a deploy", [offCfg.thrown, offCfg.preCalls, offCfg.panel.length]);
  const pruneCfg = await runGenerate(draftA, stubAudit("prune"));
  ok(pruneCfg.preCalls === 1 && pruneCfg.panel.length >= 1, "ops_config q08_ground_precheck = prune reads through the AUDIT binding", [pruneCfg.preCalls, pruneCfg.panel.length]);
  const unset = await runGenerate(draftA, stubAudit(null));
  ok(unset.preCalls === 1 && unset.panel.length === 0, "an unset ops_config row leaves the pre-check on", [unset.preCalls, unset.panel.length]);
  // a clean draft and a prunable draft behave the same in every mode
  for (const mode of ["on", "prune", "off"]) {
    const c2 = await runGenerate(eEssay(E_LEDE), { Q08_GROUND_PRECHECK: mode });
    ok(c2.panel.length >= 1 && c2.stage.length === 0, "mode " + mode + ": a clean draft reaches the panel with no stage row", [c2.panel.length, c2.stage.length]);
    const b2 = await runGenerate(eEssay(E_LEDE, Z_SENT), { Q08_GROUND_PRECHECK: mode });
    ok(b2.panel.length >= 1 && (mode === "off" ? b2.panel[0].includes("Zorblax") && b2.stage.length === 0 : !/Zorblax/.test(b2.panel[0]) && b2.stage.length === 1 && b2.stage[0].pass === 1), "mode " + mode + ": " + (mode === "off" ? "the unsupported body sentence is left for the later stages (the 0.31.3 flow)" : "the unsupported body sentence is pruned before the panel"), [b2.panel.length, b2.stage.length]);
  }
} finally { globalThis.fetch = realFetch; }

// generate() end to end: the gates after the prune (review repair). The same drafts as section 2b, through the real call site (the essay flag, the mode,
// the panel). A draft one of those gates refuses makes ZERO reader panel calls in mode on; in mode prune the panel reads the ORIGINAL draft.
try {
  const eT = (title, lede, inject) => eEssay(lede, inject).replace(E_TITLE, title);
  const lastRun = (x) => x.runs[x.runs.length - 1] || {};
  const srcCtxE = { source: "hn", title: "Operators describe a regional outage", url: "https://example.org/7001" }; // what generate() passes as srcCtx for the stubbed story
  // (e) a prunable body sentence (Z_SENT: a name and a figure) and a title that names what the source does not hold: one prune leaves one flagged item
  const dName = eT("# Operators describe a regional outage and the Quillfeather alert that never fired", E_LEDE, Z_SENT);
  ok(gateOk(dName).length === 0 && dName.includes("Quillfeather") && dName.includes("Zorblax Systems"), "fixture: the end-to-end draft with a prunable body sentence and an unsupported name in the title passes the writer gate", gateOk(dName));
  for (const [label, env] of [["mode on", { Q08_GROUND_PRECHECK: "on" }], ["no switch set", undefined]]) {
    const x = await runGenerate(dName, env), row = lastRun(x);
    ok(x.thrown === null && x.writerCalls >= 1 && x.preCalls === 1 && x.panel.length === 0 && row.status === "gate_failed", label + ": the pruned draft still holds the title's name, so the run ends gate_failed with ZERO reader panel calls", [x.thrown, x.panel.length, x.preCalls, row.status, row.error]);
    ok(/^accuracy: name not in the source: Quillfeather; pre-check: prune -1 left 1 flagged/.test(row.error || "") && !/Zorblax|4200/.test(row.error || "") && S.stallStage(row) === "fact-check", label + ": the error names only what the prune left (Quillfeather) and the stall digest reads fact-check", row.error);
    ok(x.stage.length === 1 && x.stage[0].pass === 0 && /prune -1 left 1 flagged/.test(x.stage[0].fix) && /the panel was not asked/.test(x.stage[0].fix), label + ": the refusal is saved as a stage row", x.stage);
  }
  const dNamePrune = await runGenerate(dName, { Q08_GROUND_PRECHECK: "prune" });
  ok(dNamePrune.thrown === null && dNamePrune.preCalls === 1 && dNamePrune.panel.length >= 1 && dNamePrune.panel[0].includes("Zorblax Systems") && dNamePrune.panel[0].includes("Quillfeather") && !/pre-check:/.test(lastRun(dNamePrune).error || ""), "mode prune: the panel reads the original draft (nothing pruned), the run is not refused at the pre-check", [dNamePrune.thrown, dNamePrune.panel.length, lastRun(dNamePrune).error]);
  ok(dNamePrune.stage.length === 1 && dNamePrune.stage[0].pass === 0 && /prune -1 left 1 flagged/.test(dNamePrune.stage[0].fix) && /went to the panel unchanged/.test(dNamePrune.stage[0].fix), "mode prune: the pass-through is saved as a stage row", dNamePrune.stage);
  // (f) the essay flag: the title holds a percentage the source lacks (an essay may not state one; a forecast may), plus the same prunable sentence
  const dPct = eT("# Operators describe a regional outage that 55 percent of alerts missed", E_LEDE, Z_SENT);
  ok(gateOk(dPct).length === 0, "fixture: the title with a percentage passes the writer gate", gateOk(dPct));
  const xPct = await runGenerate(dPct, { Q08_GROUND_PRECHECK: "on" }), rowPct = lastRun(xPct);
  ok(xPct.thrown === null && xPct.preCalls === 1 && xPct.panel.length === 0 && /^accuracy: figure not in the source: 55 percent; pre-check: prune -1 left 1 flagged/.test(rowPct.error || ""), "mode on: a percentage left in the title after the prune refuses the essay before the panel", [xPct.thrown, xPct.panel.length, rowPct.error]);
  //     and a body sentence holding only that percentage is an essay's problem too: the first check flags it, the prune cuts it, the panel reads the rest
  const dBody = eEssay(E_LEDE, "Roughly 55 percent of the commenters agree with the operators.");
  ok(gateOk(dBody).length === 0, "fixture: the body sentence with a percentage passes the writer gate", gateOk(dBody));
  const xBody = await runGenerate(dBody, { Q08_GROUND_PRECHECK: "on" });
  ok(xBody.thrown === null && xBody.preCalls === 1 && xBody.panel.length >= 1 && !/55 percent/.test(xBody.panel[0]) && xBody.panel[0].includes("case three") && xBody.stage.length === 1 && xBody.stage[0].pass === 1 && /pruned 1 sentences/.test(xBody.stage[0].fix), "an essay with an unsupported percentage in a body sentence has that sentence pruned before the panel reads it", [xBody.thrown, xBody.panel.length, xBody.stage.length]);
  // (g) a two-sentence lede whose flagged first sentence is the one that names the subject: the prune leaves a lede the lede check refuses
  const ledeBadSubject = "In 2019 the operators of a regional service described an outage in detail on a public forum. The service reported a fault and the matter was closed.";
  const dLede = eEssay(ledeBadSubject);
  ok(gateOk(dLede).length === 0 && L.ledeProblems(dLede, srcCtxE).length === 0 && L.ledeProblems(dLede.replace("In 2019 the operators of a regional service described an outage in detail on a public forum. ", ""), srcCtxE).length === 1, "fixture: the lede passes the lede check, and without its first sentence it fails it", L.ledeProblems(dLede, srcCtxE));
  const xLede = await runGenerate(dLede, { Q08_GROUND_PRECHECK: "on" }), rowLede = lastRun(xLede);
  ok(xLede.thrown === null && xLede.preCalls === 1 && xLede.panel.length === 0 && rowLede.status === "gate_failed" && /^accuracy: year not in the source: 2019; pre-check: prune -1 blocked: lede does not name the subject/.test(rowLede.error || "") && S.stallStage(rowLede) === "fact-check", "mode on: a prune that leaves a lede which no longer names the subject is refused before the panel (ZERO panel calls)", [xLede.thrown, xLede.panel.length, rowLede.error]);
  ok(xLede.stage.length === 1 && xLede.stage[0].pass === 0 && /prune -1 blocked: lede does not name the subject/.test(xLede.stage[0].fix), "the lede refusal is saved as a stage row", xLede.stage);
  const xLedeOk = await runGenerate(eEssay("In 2019 the operators of a regional service described an outage in detail on a public forum. The operators say the service reported a fault and the matter was closed."), { Q08_GROUND_PRECHECK: "on" });
  ok(xLedeOk.thrown === null && xLedeOk.panel.length >= 1 && !/2019/.test(xLedeOk.panel[0]) && xLedeOk.stage.length === 1 && xLedeOk.stage[0].pass === 1, "contrast: a lede whose second sentence still names the subject is pruned and read by the panel", [xLedeOk.panel.length, xLedeOk.stage.length]);
} finally { globalThis.fetch = realFetch; }

// generateForecast() end to end in each mode (the harness of forecast.test.mjs, one source essay)
{
  const F2 = mod.__forecast;
  const ymd = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
  const good = () => ({ claim: "The maintainers will publish a hard fork of the library before the vendor ships its rewrite.", probability: 0.55, horizon: ymd(120), resolution: "Resolves yes if the GitHub release page of the successor repository shows a tagged release dated no later than " + ymd(120) + "; void if the repository is deleted.", alternatives: [{ claim: "The vendor ships its rewrite first and the maintainers fold into it.", probability: 0.25 }, { claim: "Neither happens and the library stays as it is.", probability: 0.1 }], indicators: ["Maintainers announce a separate release channel", "The vendor publishes a rewrite roadmap with dates"], watch_query: "library hard fork maintainers", watch_urls: [] });
  const fpara = "The maintainers priced their own risk, the vendor priced the rest, and each side read the other's silence as consent while the shipping date drifted. ";
  const mkF = (inject) => ["# Maintainers will fork the library before the vendor ships its rewrite", "",
    "The maintainers of a widely used library are arguing in public about a vendor rewrite that would cut them out of the roadmap; this forecast says they will fork the library before the rewrite ships.", "",
    fpara.repeat(5), "",
    "How situations like this ended before is the first anchor: when a steward and a sponsor stopped sharing a roadmap, the steward usually forked within a year. " + fpara.repeat(5), "",
    "The most likely course runs in order. The sponsor posts a rewrite date, the maintainers ask for a shared governance seat, and the sponsor declines. " + fpara.repeat(5), "",
    "That path is judged at 55 percent by the writer, with the rival scenarios below it. " + fpara.repeat(5), "",
    "A rival course has the vendor ship first and fold the maintainers in, at 25 percent, and a third has neither happen, at 10 percent. " + fpara.repeat(5), "",
    "What to watch is the announcement of a separate release channel and any dated roadmap from the vendor. " + fpara.repeat(5), "",
    (inject ? inject + " " : "") + "The fact that would change the number most is whether the vendor accepts a governance seat before its rewrite date passes."].join("\n")
    + "\nFORECAST-JSON: " + JSON.stringify(good()) + "\nworth your time: yes - it commits to a claim a reader can check.";
  async function runForecast(draftText, extraEnv) {
    F.resetGroundPreCheck();
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE published_pieces (id TEXT, signal_id TEXT, slug TEXT UNIQUE, title TEXT, body_md TEXT, body_html TEXT, core_concept TEXT, signal_source TEXT, published_at TEXT, sources_json TEXT, reads INTEGER DEFAULT 0, feedback_score REAL, promoted INTEGER DEFAULT 0, kind TEXT DEFAULT 'analysis', property TEXT);
    CREATE TABLE engine_runs (id INTEGER PRIMARY KEY, ran_at TEXT DEFAULT (datetime('now')), status TEXT, piece_published INTEGER DEFAULT 0, error TEXT, ms INTEGER, signals_scraped INTEGER, signals_scored INTEGER, top_signal TEXT, model TEXT);
    CREATE TABLE signal_log (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, title TEXT, url TEXT, points INTEGER, num_comments INTEGER, ratio REAL, volatility_score REAL, friction_point TEXT, signal_strength TEXT, status TEXT, processed_at TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE prompt_pool (id TEXT PRIMARY KEY, piece_id TEXT, structure_md TEXT, active INTEGER DEFAULT 1, performance_score REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE q08_audits (slug TEXT PRIMARY KEY, verdict TEXT, stage TEXT, models TEXT, unsupported_json TEXT, checked_at TEXT);
    CREATE TABLE q08_retractions (slug TEXT PRIMARY KEY, reason TEXT, claims_json TEXT, retracted_at TEXT);`);
    const nowIso = new Date().toISOString();
    db.prepare("INSERT INTO published_pieces (id, signal_id, slug, title, body_md, core_concept, signal_source, published_at, sources_json) VALUES (?,?,?,?,?,?,?,?,?)").run("p1", "sig1", "essay-1", "A clearinghouse that paid itself first", "The maintainers of a widely used library priced their own risk. ".repeat(40), "Self-priced risk", "hn:101", nowIso, "[]");
    db.prepare("INSERT INTO q08_audits (slug, verdict, stage, checked_at) VALUES ('essay-1', 'pass', 'publish', ?)").run(nowIso);
    db.prepare("INSERT INTO signal_log (id, source, source_id, title, url, friction_point, status, processed_at) VALUES ('sg1','hn','hn:101','t','u','Maintainers argue the vendor will rewrite the library and cut them out of the roadmap.','published',?)").run(nowIso);
    const shim = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return st; } };
    const panel = [];
    // the worker creates this table once per process (the essay runs above already did), so the fixture takes the worker's own statement
    db.exec(src.match(/"(CREATE TABLE IF NOT EXISTS q08_forecasts \(.*?\))"\)\.run\(\)/)[1]);
    db.exec("ALTER TABLE q08_forecasts ADD COLUMN ground_json TEXT");
    shim.batch = async (statements) => {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const statement of statements) out.push(await statement.run());
        db.exec("COMMIT");
        return out;
      } catch (e) { db.exec("ROLLBACK"); throw e; }
    };
    const audit = { prepare: (sql) => ({ first: async () => /key = 'q08_forecast_ledger'/.test(sql) ? { value: "off" } : null }) };
    const env = Object.assign({ DB: shim, AUDIT: audit }, extraEnv || {}, { AI: { run: async (m, a) => {
      const c = (a.messages || []).map((x) => x.content).join("\n");
      if (/strict fact-checker/.test(c)) return { response: '{"unsupported":[],"verdict":"pass"}' };
      if (/busy, intelligent reader/.test(c)) { panel.push(c); return { response: '{"would_read_to_end":true,"score":5,"slop_tells":[],"fix":"none"}' }; }
      return { response: draftText };
    } } });
    const e = console.error; console.error = () => {};
    let out = null, thrown = null;
    try { out = await F2.generateForecast(env, Date.now()); } catch (err) { thrown = String(err && err.message || err); } finally { console.error = e; }
    return { db, out, thrown, panel, preCalls: F.groundPreCalls, runs: db.prepare("SELECT * FROM engine_runs ORDER BY id").all(), stage: (() => { try { return db.prepare("SELECT * FROM q08_reader_tests WHERE role = 'ground_precheck'").all(); } catch (e) { return []; } })() };
  }
  const bad = mkF("In the earlier case Zorblax Systems paid out 4200 in credits."), cleanF = mkF("");
  const fOn = await runForecast(bad, { Q08_GROUND_PRECHECK: "on" });
  const rowF = fOn.runs[fOn.runs.length - 1] || {};
  ok(fOn.thrown === null && fOn.out === null && fOn.preCalls === 1 && fOn.panel.length === 0 && /^forecast: accuracy: .*Zorblax/.test(rowF.error || "") && /pre-check: a forecast draft names or counts what the source does not hold/.test(rowF.error || ""), "forecast, mode on: refused before the panel (zero panel calls), the run is an accuracy failure", [fOn.thrown, fOn.panel.length, fOn.preCalls, rowF.error]);
  const fPr = await runForecast(bad, { Q08_GROUND_PRECHECK: "prune" });
  const rowFP = fPr.runs[fPr.runs.length - 1] || {};
  ok(fPr.thrown === null && fPr.preCalls === 1 && fPr.panel.length >= 1 && !/pre-check:/.test(rowFP.error || "") && fPr.stage.length === 1 && fPr.stage[0].pass === 0, "forecast, mode prune: never refused at the pre-check, the panel reads the draft (the later accuracy stages still decide)", [fPr.thrown, fPr.panel.length, rowFP.error]);
  const fOff = await runForecast(bad, { Q08_GROUND_PRECHECK: "off" });
  const rowFO = fOff.runs[fOff.runs.length - 1] || {};
  ok(fOff.thrown === null && fOff.preCalls === 0 && fOff.panel.length >= 1 && fOff.stage.length === 0 && !/pre-check:/.test(rowFO.error || ""), "forecast, mode off: ZERO pre-check calls, the 0.31.3 flow", [fOff.thrown, fOff.preCalls, fOff.panel.length, rowFO.error]);
  for (const mode of ["on", "prune", "off"]) {
    const c3 = await runForecast(cleanF, { Q08_GROUND_PRECHECK: mode });
    ok(c3.thrown === null && c3.out && c3.out.ok === true && c3.preCalls === (mode === "off" ? 0 : 1) && c3.stage.length === 0, "forecast, mode " + mode + ": a clean forecast is published", [c3.thrown, c3.out, c3.preCalls, (c3.runs[c3.runs.length - 1] || {}).error]);
  }
  // the forecast flag at the real call site (review repair): a forecast states a probability, a future year and a duration the ground does not hold, and the
  // pre-check (made with forecast true) leaves them to the later stages; made with forecast false it would refuse a forecast for being one
  const flagged = mkF("By 2099 the vendor may publish a dated roadmap, which this forecast puts at 60 percent within 18 months of the first post.");
  const fcg = ["A clearinghouse that paid itself first", "The maintainers of a widely used library priced their own risk. ".repeat(40), "Maintainers argue the vendor will rewrite the library and cut them out of the roadmap."].join("\n"); // the shape of the forecast ground
  const asEssay = F.groundingProblems(flagged, fcg, { forecast: false }), asForecast = F.groundingProblems(flagged, fcg, { forecast: true });
  ok(asEssay.includes("year not in the source: 2099") && asEssay.includes("figure not in the source: 60 percent") && asEssay.includes("figure not in the source: 18 months") && !asForecast.some((x) => /2099|60 percent|18 months/.test(x)), "fixture: the injected sentence is flagged when read as an essay and not when read as a forecast", [asEssay, asForecast]);
  for (const mode of ["on", "prune"]) {
    const c4 = await runForecast(flagged, { Q08_GROUND_PRECHECK: mode });
    const err4 = (c4.runs[c4.runs.length - 1] || {}).error || "";
    ok(c4.thrown === null && c4.out && c4.out.ok === true && c4.preCalls === 1 && c4.stage.length === 0 && c4.panel.length >= 1 && !/pre-check/.test(err4), "forecast, mode " + mode + ": a probability, a future year and a duration the ground lacks pass the pre-check (no refusal, no pass-through row) and the forecast is published", [c4.thrown, c4.out, c4.preCalls, c4.stage.length, err4]);
  }
}

const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 0 || ver[1] >= 32), "VERSION is at least 0.32.0", ver);
ok((src.split("\n").find((l) => l.startsWith("var VERSION")) || "").length < 200, "the VERSION line stays short: release notes live in the block below it (VERSION-LINE-NOTES-1)");
const added = [["function sourceLedger", "function buildPrompt"], ["function groundPreCheck", "// Q08-ANALYSIS-SECTION-1 (0.19.0"], ["function stripLedgerTags", "function normalizeDraftCore"]].map(([a, b]) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)))).join("\n");
ok(added.length > 3000 && !/[^\x00-\x7f]/.test(added) && !/[^\x00-\x7f]/.test(src.slice(0, src.indexOf("// WORKERS-AI-ATTRIBUTION-1"))), "the code and notes this change adds are ASCII-only (Q08-ASCII-SOURCE-1)", added.length);
console.log("fact-ledger.test.mjs: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
