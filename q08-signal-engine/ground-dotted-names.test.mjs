// Q08-DOTTED-NAMES-1 (0.37.3, agent_issues 100607): the deterministic grounding check no longer refuses a name that stands verbatim in the source
// when it carries a dot ("Qwen3.8-27B", "PLAN.md", "Node.js", "DeepSeek V4.1 Flash") or is a possessive plural ("ShinyHunters'"), and still
// refuses the same names when the source does not hold them. Output MUST contain "0 failed".   node q08-signal-engine/ground-dotted-names.test.mjs
const W = await import("./worker.js");
const V = W.__verify;
let passes = 0, fails = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };
const names = (draft, ground) => V.groundingProblems(draft, ground, {}).filter((p) => /^name not in the source/.test(p));
const lede = "A short post reports the work. ";

// the shape of engine_runs 930: the title and the article name dotted tools and files
const ground930 = "SOURCE: an article at example.com. The item is titled “Five Qwen3.8-27B models match Fable 5 Using GVS5H Harness”. The post keeps PLAN.md, STATUS.md and GOTCHAS.md in the repository and also tried Qwen3.8 Flash Next. It runs on Node.js and DeepSeek V4.1 Flash and compares them with Qwen2.5 Coder.";
const draft930 = "# Five models match one\n\n" + lede + "The harness runs Qwen3.8-27B models and keeps PLAN.md, STATUS.md and GOTCHAS.md in the repository. It also tried Qwen3.8 Flash Next, on Node.js, next to DeepSeek V4.1 Flash and Qwen2.5 Coder.";
check("dotted names that stand in the source are not refused", names(draft930, ground930).length === 0, names(draft930, ground930));
for (const nm of ["Qwen3.8-27B", "PLAN.md", "STATUS.md", "GOTCHAS.md", "Qwen3.8 Flash Next", "Node.js", "DeepSeek V4.1 Flash", "Qwen2.5 Coder"]) {
  const one = "# A title here\n\n" + lede + "The post mentions " + nm + " and nothing else of note.";
  check("verbatim in the source: " + nm, names(one, ground930).length === 0, names(one, ground930));
}

// the same names with a source that does not hold them are still refused (the check is not weakened)
const bare = "SOURCE: an article at example.com. The item is titled “A harness for local models”. The post describes a harness that runs several models side by side and keeps notes between runs.";
for (const nm of ["Qwen3.8-27B", "PLAN.md", "Node.js", "DeepSeek V4.1 Flash"]) {
  const one = "# A title here\n\n" + lede + "The post mentions " + nm + " and nothing else of note.";
  check("not in the source, still refused: " + nm, names(one, bare).length >= 1, names(one, bare));
}
// a dotted source token grants its parts, so it does not grant an unrelated name
check("an unrelated capitalised name is still refused beside a dotted source name", names("# A title here\n\n" + lede + "Zelda Fitzgerald wrote about Node.js.", ground930).some((p) => /Zelda/.test(p)), names("# A title here\n\n" + lede + "Zelda Fitzgerald wrote about Node.js.", ground930));

// a possessive plural keeps its closing apostrophe in the draft and loses it in the ground word set
const groundP = "The group ShinyHunters claimed the breach. The Workers Party leader spoke on Tuesday.";
const draftP = "# A title here\n\n" + lede + "ShinyHunters' claim was disputed, and the Workers' Party leader answered it.";
check("a possessive plural of a name in the source is not refused", names(draftP, groundP).length === 0, names(draftP, groundP));
check("a possessive plural of a name NOT in the source is still refused", names("# A title here\n\n" + lede + "Lazarus Group' claim was disputed.", groundP).length >= 1, names("# A title here\n\n" + lede + "Lazarus Group' claim was disputed.", groundP));

// existing behaviour that must not move: a plain absent name, a hyphenated name, a unicode hyphen
check("a plain absent name is refused", names("# A title here\n\n" + lede + "The report said Ada Lovelace disagreed.", groundP).some((p) => /Ada Lovelace/.test(p)));
check("a hyphenated source name with a unicode hyphen still matches", names("# A title here\n\n" + lede + "A team built Dex‑One2Many to learn from video.", "Dex-One2Many learns dexterous manipulation from a single human video.").length === 0);
check("figures are untouched: a dotted version number in the source passes, an invented one is flagged", !V.groundingProblems("# A title here\n\n" + lede + "It ran Qwen3.8 on 4.1 hardware.", ground930, {}).some((p) => /figure not in the source: 3\.8/.test(p)) && V.groundingProblems("# A title here\n\n" + lede + "It ran on 9.7 machines.", ground930, {}).some((p) => /figure not in the source: 9\.7/.test(p)));

console.log("ground-dotted-names.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
