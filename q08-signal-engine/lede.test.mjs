// Q08-LEDE-1 (0.17.0): inverted-pyramid ledes. Owner 2026-10-13: pieces "lack context without a lede that fills in for the reader
// what is being discussed".
const mod = await import("./worker.js");
const L = mod.__lede;
let passes = 0, fails = 0;
function check(name, cond, info) { if (cond) passes++; else { fails++; console.log("FAIL " + name + (info !== undefined ? " -- " + JSON.stringify(info) : "")); } }
const body = "\n\nSecond paragraph with context.\n\nworth your time: yes - x";
const hn = { source: "hn", title: "Leaving Tech", url: "https://ryanbigg.com/2026/10/leaving-tech" };
// run 360's real opening names a person but not what is being discussed
check("an opening that names neither the post nor its subject fails", L.ledeProblems("# T\n\nRyan Bigg posted on 12 Oct 2026 that he had applied for over 3 dozen jobs and heard back from 24 of them with a rejection." + body, { source: "hn", title: "Leaving Tech", url: "https://example.org/x" }).some((p) => /does not name the subject/.test(p)));
check("a news lede naming the post and its site passes", L.ledeProblems("# T\n\nIn a blog post titled Leaving Tech, published on 12 October, Ruby developer Ryan Bigg says he is quitting software after more than 3 dozen applications brought 24 rejections." + body, hn).length === 0, L.ledeProblems("# T\n\nIn a blog post titled Leaving Tech, published on 12 October, Ruby developer Ryan Bigg says he is quitting software." + body, hn));
check("the site name counts as naming the source", L.ledeProblems("# T\n\nA post on ryanbigg.com describes a developer leaving the industry after two dozen rejections." + body, hn).length === 0);
check("an abstract opening fails", L.ledeProblems("# T\n\nThe observable pattern is that an employer hires a developer for a tech role and ends it." + body, hn).some((p) => /abstract noun/.test(p)));
const long = "# T\n\n" + "Leaving tech is the subject of this very long opening sentence that keeps going ".repeat(8) + "." + body;
check("a lede over the word limit fails", L.ledeProblems(long, hn).some((p) => /lede too long/.test(p)));
check("a GitHub repository is named by its repository name", L.ledeProblems("# T\n\nGridcraft, an open-source spreadsheet written in Rust and published on GitHub by storytold, claims Excel compatibility." + body, { source: "github", title: "storytold/gridcraft", url: "https://github.com/storytold/gridcraft" }).length === 0);
check("an arXiv lede that names the paper's subject passes", L.ledeProblems("# T\n\nA paper posted to arXiv this week proposes goal-oriented bundle management for relays in deep-space communications, where feedback arrives hours late." + body, { source: "arxiv", title: "Goal-Oriented Bundle Management and Flow Control for Deep-Space Communications", url: "https://arxiv.org/abs/2610.00001" }).length === 0);
check("no source context, no lede check (forecasts, audits)", L.ledeProblems("# T\n\nThe pattern is x." + body, null).length === 0);
check("withLede adds the problems and fails the gate result", L.withLede({ ok: true, problems: [] }, "# T\n\nThe mechanism is x." + body, hn).ok === false);
check("sourceKind names the kind", /blog|article at ryanbigg\.com/.test(L.sourceKind(hn)) && /arXiv/.test(L.sourceKind({ source: "arxiv" })) && /GitHub repository/.test(L.sourceKind({ source: "github", title: "a/b" })));
const pr = L.buildPrompt({ core_concept: "c", friction_point: "f", signal_strength: "High" }, [], [], { source: hn, article: "" });
check("the writer prompt carries the SOURCE block and the LEDE rule", /--- SOURCE \(name it in the lede/.test(pr) && /title: Leaving Tech/.test(pr) && /LEDE \(inverted pyramid/.test(pr));
check("the directive no longer forbids naming the post", !/Never refer to 'the article' or 'the post'/.test(L.Q08_DIRECTIVE) && !/the incident is a probe, never the subject/.test(L.Q08_DIRECTIVE));
check("readers judge the opening first", /Judge first the opening/.test(L.READER_PROMPT));
// 0.17.3: forecasts and the site copy
const fsrc = (await import("node:fs")).readFileSync(new URL("./worker.js", import.meta.url), "utf8");
check("forecast drafts are gated with the lede check", /forecastProblems\(piece, banned\)\.concat\(ledeProblems\(piece\.text, fctx\)\)/.test(fsrc) && /forecastProblems\(retry, banned\)\.concat\(ledeProblems\(retry\.text, fctx\)\)/.test(fsrc));
check("no prompt or page prescribes cold structural objectivity any more", !/cold structural objectivity/i.test(fsrc) && !/Cold, structural, timeless/.test(fsrc));
check("the forecast directive has a LEDE rule", /LEDE \(inverted pyramid, checked\): the first paragraph, at most 70 words, tells a reader who has never seen q08 what is being forecast/.test(fsrc));
// Q08-LEDE-SPLIT-1 (0.17.5, run 368)
{
  const s1 = "Kevin Kelly published a list of predictions about artificial intelligence in 2016, and a post on his blog this week checks each one against what happened.";
  const s2 = "He finds that most of the predictions about cheap cloud intelligence came true sooner than he expected.";
  const s3 = "The ones about how people would feel about it did not, and he says so plainly in a closing section that lists each miss and what he got wrong about the way companies and users would adopt the tools over the following decade, from the first chat assistants in offices to the coding tools that most developers now use every day at work.";
  const draft = "# Kevin Kelly checks his 2016 AI predictions\n\n" + [s1, s2, s3].join(" ") + "\n\nSecond paragraph.\n\nworth your time: yes - x";
  const out = L.splitLongLede(draft);
  const first = L.ledeOf(out);
  check("an overlong lede is split at a sentence boundary", first === s1 + " " + s2 && out.includes("\n\n" + s3 + "\n\n"), out);
  check("the split lede passes the lede check", L.ledeProblems(out, { source: "hn", title: "Kevin Kelly's 2016 AI Predictions, 10 Years Later", url: "https://kk.org/x" }).length === 0, L.ledeProblems(out, { source: "hn", title: "Kevin Kelly's 2016 AI Predictions, 10 Years Later" }));
  check("no word is added or removed", out.replace(/\s+/g, " ") === draft.replace(/\s+/g, " "));
  check("a short lede is left alone", L.splitLongLede("# T\n\nShort lede here.\n\nBody.") === "# T\n\nShort lede here.\n\nBody.");
  const one = "# T\n\n" + "word ".repeat(120).trim() + ".\n\nBody.";
  check("a single overlong sentence is left for the gate", L.splitLongLede(one) === one);
  check("normalizeDraft applies the split", L.ledeOf(L.normalizeDraft(draft)) === s1 + " " + s2);
}
// ---- Q08-VERDICT-NORM-1 (0.20.2, run 382) ------------------------------------------------------------------------------------
{
  const canon = /worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-]\s*\S[^\n]*$/im;
  for (const v of ["**Worth your time:** yes. It explains the incentive.", "worth your time - flat: the source says most of it", "Worth your time: Yes, it names the parties", "_worth your time:_ **no** \u2014 retells the post"]) {
    const out = L.normalizeVerdictLine("# T\n\nBody.\n\n" + v);
    check("near-miss verdict is normalised: " + v.slice(0, 30), canon.test(out) && out.includes("Body."), out.slice(-80));
  }
  check("the writer's own verdict word is kept", /worth your time: no \u2014/.test(L.normalizeVerdictLine("x\n\n_worth your time:_ **no** \u2014 retells the post")));
  check("a canonical line is left unchanged", L.normalizeVerdictLine("a\n\nworth your time: yes - x") === "a\n\nworth your time: yes - x");
  check("no verdict at all is not invented", !/worth your time/i.test(L.normalizeVerdictLine("# T\n\nBody only.")));
  check("a verdict-only problem list is recognised; a self-verdict no is not", L.verdictOnlyProblem(["missing or malformed 'worth your time' verdict line"]) && !L.verdictOnlyProblem(["self-verdict 'no' \u2014 essay does not clear the worth-reading bar"]));
}
console.log("lede.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
