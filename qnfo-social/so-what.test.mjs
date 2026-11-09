// SO-WHAT-POST-1 offline suite (qnfo-social, pillar reach). Proves the so-what gate rejects hype, questions, links, overlong text and
// names/figures the abstract lacks; that soWhatSentence returns a grounded sentence when the model and checker agree and null
// (so the old title + link post is kept) when anything fails; and that every outcome is counted in reach_signals.
// Run: node qnfo-social/so-what.test.mjs   -> prints "N passed, 0 failed"
const mod = await import("./worker.js");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const title = "Error-corrected sensing with algebraic codes";
const abstract = "We show that algebraic codes let a sensor array detect and correct drift without recalibration. The construction applies to engineers who maintain long-lived sensor networks, and we give a procedure a reader can run to check the claim on their own data. The result reduces the maintenance burden of networks that cannot be visited often.";
const good = "Engineers who maintain long-lived sensor networks can use algebraic codes to correct drift without recalibrating.";
ok(mod.soWhatGate(good, title, abstract).length === 0, "a grounded one-sentence benefit passes", mod.soWhatGate(good, title, abstract));
ok(mod.soWhatGate("A groundbreaking result for sensor networks everywhere and all engineers.", title, abstract).includes("hype"), "hype is refused");
ok(mod.soWhatGate("Why do sensor networks drift, and can algebraic codes help engineers fix it?", title, abstract).includes("question-or-exclamation"), "a question is refused");
ok(mod.soWhatGate(good + " https://x.org/a", title, abstract).includes("link-or-hashtag"), "a link is refused");
ok(mod.soWhatGate("x".repeat(mod.SOWHAT_MAX_CHARS + 1) + ".", title, abstract).includes("too-long"), "an overlong sentence is refused");
ok(mod.soWhatGate("Engineers at Siemens can cut recalibration cost by 40 percent with algebraic codes.", title, abstract).some((x) => x.startsWith("ungrounded")), "an invented company and figure are refused");
ok(mod.soWhatGate("", title, abstract).includes("empty"), "empty is refused");
const p = mod.soWhatPrompt(title, abstract);
ok(/GROUNDING RULE/.test(p) && /Title: /.test(p) && /Abstract: /.test(p), "the prompt carries the grounding rule, title and abstract");
const signals = [];
const mk = (aiText, checkerText) => ({
  LIVING_PAPER: { prepare: () => ({ bind: () => ({ first: async () => ({ title, abstract }) }) }) },
  DB: { prepare: (sql) => { const o = { bind: (...a) => ({ run: async () => { if (/reach_signals/.test(sql)) signals.push(a); return {}; }, all: async () => ({ results: [] }), first: async () => null }), run: async () => ({}), all: async () => ({ results: [] }), first: async () => null }; return o; } },
  AI: { run: async (model, input) => ({ response: /list every claim/.test(JSON.stringify(input)) ? checkerText : aiText }) },
});
let t = await mod.soWhatSentence(mk(good, "[]"), "p-accept", "linkedin");
ok(t === good, "model + checker agree: the sentence is used", t);
ok(signals.some((a) => a[2] === "accepted" && a[1] === "p-accept"), "acceptance is counted", signals);
t = await mod.soWhatSentence(mk("Why does this matter?", "[]"), "p-bad", "x");
ok(t === null && signals.some((a) => a[1] === "p-bad" && /^fallback:/.test(a[2])), "a gate failure keeps the old text and is counted", signals);
t = await mod.soWhatSentence(mk(good, 'not json'), "p-chk", "x");
ok(t === null, "an unusable checker reply keeps the old text (fail closed)", t);
t = await mod.soWhatSentence({ DB: mk(good, "[]").DB }, "p-nobind", "x");
ok(t === null, "no LIVING_PAPER binding keeps the old text", t);
// SO-WHAT-POST-1.1: the live model is a reasoning model; with max_tokens 200 it spent the budget thinking and returned empty text
// (4 of 4 live calls read fallback:empty or reach-denied on 2026-11-06..08). The call must leave room for the answer and switch reasoning off.
let seen = null;
const env2 = mk(good, "[]"); const run0 = env2.AI.run; env2.AI.run = async (m, i) => { if (!/list every claim/.test(JSON.stringify(i))) seen = i; return run0(m, i); };
await mod.soWhatSentence(env2, "p-budget", "x");
ok(seen && seen.max_tokens >= 1000 && seen.reasoning_effort === "none", "the so-what call leaves room for the answer and turns reasoning off", seen && { t: seen.max_tokens, r: seen.reasoning_effort });
// SO-WHAT-POST-1.2: a failed attempt must not be cached for the 6 hours a sentence is (it would starve the retry).
let calls = 0; const env3 = mk(good, "[]"); const r3 = env3.AI.run; env3.AI.run = async (m, i) => { calls++; return r3(m, i); };
env3.AI.run = async () => { calls++; return { response: "" }; };
await mod.soWhatSentence(env3, "p-neg", "x"); const c1 = calls;
await mod.soWhatSentence(env3, "p-neg", "x");
ok(calls === c1, "within the 10-minute window a failure is not retried (no model storm)", { c1, calls });
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
