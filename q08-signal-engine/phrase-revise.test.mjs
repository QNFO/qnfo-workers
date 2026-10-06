// Q08-PHRASE-REVISE-1 offline suite (q08-signal-engine 0.8.12, agent_issues 2034): a gate failure made only of
// phrase-level problems is retried as a revision of the same draft; anything else keeps the rewrite from scratch. The
// problem strings come from the real gate() so a renamed problem cannot silently disable the revision path.
// Run: node q08-signal-engine/phrase-revise.test.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("./worker.js");
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
const block = src.slice(src.indexOf("var PHRASE_LEVEL_RE"), src.indexOf("async function runLevels"));
const f = new Function(block + "; return { phraseLevelOnly, retryPromptFor };")();
const draft = "# The clearinghouse that paid itself first\n\n" + "A sentence about who did what. ".repeat(200) + "\n\nworth your time: yes — it names the mechanism.";
const real = [
  "stock framing tell: 'illustration of a historical dynamic' — name the mechanism, do not summarise the essay's significance",
  "abstraction labels x3 ('concrete instance of', 'incentive structure', 'coupling failure') - state the mechanisms instead of labelling them",
  "Title Case title reads as a label, not a sentence: 'Selective Redaction of Site-Level Consumption Data'",
  "soft register: 'ecosystem of'"
];
ok(f.phraseLevelOnly(real), "the four observed phrase-level failures (runs 239-244) qualify");
let p = f.retryPromptFor("BASE", draft, real);
ok(p.startsWith("BASE") && /--- REVISION:/.test(p) && p.endsWith(draft) && /Keep every other sentence/.test(p), "phrase-level failure: revision prompt carries the same draft", p.slice(0, 200));
for (const other of [["missing or malformed 'worth your time' verdict line"], ["too short for long-form (3000 chars; 1200-1800 words required)"], [real[0], "bullet lists (4 lines) — long-form prose required"], []]) {
  p = f.retryPromptFor("BASE", draft, other);
  ok(/CORRECTIVE FEEDBACK/.test(p) && !/--- REVISION:/.test(p) && p.indexOf(draft) < 0, "non-phrase problem keeps the rewrite from scratch: " + JSON.stringify(other).slice(0, 60));
}
ok(/CORRECTIVE FEEDBACK/.test(f.retryPromptFor("BASE", "# short\n\ntoo short", real)), "a draft under 4000 chars is not revised");
// The real gate produces strings the revision path recognises.
const gateSrc = src.slice(src.indexOf("function gate("), src.indexOf("\n}\n", src.indexOf("function gate(")) + 2);
ok(/problems\.push\("stock framing tell: /.test(gateSrc) && /problems\.push\("abstraction labels x/.test(gateSrc) && /problems\.push\("Title Case title/.test(gateSrc) && /problems\.push\("soft register: /.test(gateSrc), "gate() still emits the phrase-level problem prefixes");
ok(/var retryPrompt = retryPromptFor\(prompt, piece\.text, gateResult\.problems\);/.test(src), "generate() uses retryPromptFor for its one retry");
ok(typeof mod.default.fetch === "function", "worker module loads");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
