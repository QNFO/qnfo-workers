// Q08-TITLE-REPAIR-1 offline suite (q08-signal-engine 0.26.0, charter pillar: reach; agent_issues 2284, 2503).
// Proves: a writer draft whose only writer-gate problems are its title gets one short title call to the same writer, keeps its body
// byte for byte, is gated again and is returned as that writer's draft, so the next writer is not asked; a draft with any other
// problem goes to the next writer as before; a bad or empty title reply falls through; the trail records the repair.
// Run: node q08-signal-engine/title-repair.test.mjs   -> prints "N passed, 0 failed"
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
const mod = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href);
const T = mod.__title;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };

const para = (i) => `The operators of the storage cluster in paragraph ${i} chose to keep three replicas of every block because a single disk failure during a rebuild would otherwise lose data, and that choice set the cost of every write they accepted from then on. The trade is plain: each extra replica buys time during a rebuild and charges it back on every ordinary write, so the cluster paid for safety in latency long before any disk failed.`;
const body = [1, 2, 3, 4, 5, 6, 7].map(para).join("\n\n");
const verdict = "\n\nworth your time: yes — it names the cost of the replica choice.";
const labelDraft = "# A Baseline Assessment For The Agentic Web Technology Stack\n\n" + body + verdict;
const noTitleDraft = body + verdict;
const shortDraft = "# Replicas cost writes\n\nToo short to pass." + verdict;

ok(T.gate(labelDraft, []).problems.length === 1 && T.titleOnlyProblems(T.gate(labelDraft, []).problems), "the fixture fails the writer gate on its title alone");
ok(T.titleOnlyProblems(["no H1 title"]) && T.titleOnlyProblems(["title too long"]), "no H1 title and title too long are title-only problems");
ok(!T.titleOnlyProblems(["no H1 title", "insufficient prose (3 substantial paragraphs)"]) && !T.titleOnlyProblems([]) && !T.titleOnlyProblems(["too short (2911 chars; 450-1100 words required)"]), "a draft with any other problem (or none) is not title-only");
ok(T.titleLineOf("# Three replicas made every write slower") === "# Three replicas made every write slower", "a # line is the title");
ok(T.titleLineOf("Title: \"Three replicas made every write slower\"") === "# Three replicas made every write slower", "a single unmarked line is the title, quotes and label removed");
ok(T.titleLineOf("Here are options:\nOne\nTwo") === null && T.titleLineOf("") === null, "a multi-line reply without a # line is refused");

function fakeEnv(replies) {
  const calls = [];
  return { calls, AI: { run: async (model, req) => { calls.push({ model, prompt: req.messages[0].content, max: req.max_tokens }); const q = replies[model] || []; const r = q.shift(); if (r instanceof Error) throw r; return { response: r }; } } };
}
const N = "@cf/nvidia/nemotron-3-120b-a12b", G = "@cf/openai/gpt-oss-120b";

// 1. the label title is repaired by the same writer; gpt-oss is never asked
let env = fakeEnv({ [N]: [labelDraft, "# Three replicas made every write on the cluster slower"], [G]: ["# Unused\n\n" + body + verdict] });
let r = await T.compose(env, "PROMPT", [], [N, G], undefined, { titleRepair: true });
ok(r.model === N && /^# Three replicas made every write on the cluster slower$/m.test(r.text), "the repaired draft is returned as nemotron's", r.text.slice(0, 80));
ok(r.text.replace(/^#.*$/m, "") === labelDraft.replace(/^#.*$/m, ""), "the body is kept byte for byte");
ok(env.calls.length === 2 && env.calls.every((c) => c.model === N) && env.calls[1].max <= 400, "one short title call to the same writer, no call to the next writer", env.calls.map((c) => c.model));
ok(/except its title/.test(env.calls[1].prompt) && env.calls[1].prompt.indexOf("A Baseline Assessment") < 0, "the title call reads the body without the refused title");
ok(r.trail.length === 2 && r.trail[1].problems.length === 0 && /title repaired \(was: Title Case/.test(r.trail[1].note), "the trail records the refused title and the repair", r.trail);

// 2. a missing H1 gets one inserted above the body
env = fakeEnv({ [N]: [noTitleDraft, "# Three replicas made every write slower"] });
r = await T.compose(env, "PROMPT", [], [N, G], undefined, { titleRepair: true });
ok(r.model === N && r.text.indexOf("# Three replicas made every write slower\n\n") === 0, "a draft without an H1 gets the repaired title on top", r.text.slice(0, 60));

// 3. the repaired title still fails (Title Case again): fall through to the next writer as before
env = fakeEnv({ [N]: [labelDraft, "# Another Title Case Label For The Stack"], [G]: ["# Three replicas made every write slower\n\n" + body + verdict] });
r = await T.compose(env, "PROMPT", [], [N, G], undefined, { titleRepair: true });
ok(r.model === G && r.trail.length === 3 && /^title repair: /.test(r.trail[1].problems[0]), "a repaired title that fails the gate falls through to the next writer", r.trail);

// 4. the title call throws: logged, falls through
const errs = []; const oe = console.error; console.error = (x) => errs.push(String(x));
env = fakeEnv({ [N]: [labelDraft, new Error("timeout")], [G]: ["# Three replicas made every write slower\n\n" + body + verdict] });
r = await T.compose(env, "PROMPT", [], [N, G], undefined, { titleRepair: true });
console.error = oe;
ok(r.model === G && errs.some((x) => /titleMicroCall:caught/.test(x)), "a failed title call is logged and the next writer is asked", errs);

// 5. a draft with a non-title problem gets no title call
env = fakeEnv({ [N]: [shortDraft], [G]: ["# Three replicas made every write slower\n\n" + body + verdict] });
r = await T.compose(env, "PROMPT", [], [N, G], undefined, { titleRepair: true });
ok(r.model === G && env.calls.filter((c) => c.model === N).length === 1, "a draft that is too short gets no title call", env.calls.map((c) => c.model));

// 6. without the option (editor passes, fact revisions, the verdict micro-call) no title call is made
env = fakeEnv({ [N]: [labelDraft, "# Unused title"] });
r = await T.compose(env, "PROMPT", [], [N]);
ok(env.calls.length === 1 && r.model === N && /A Baseline Assessment/.test(r.text), "compose without titleRepair makes no title call (the caller carries the title)", env.calls.length);


// Q08-TITLE-REPAIR-2 (0.26.1): tolerant parse and a trail note for every attempt
ok(T.titleLineOf("Here is a title for the essay:\n\nThree replicas made every write slower") === "# Three replicas made every write slower", "a title after a preamble line is read");
ok(T.titleLineOf("**Title:** Three replicas made every write slower") === "# Three replicas made every write slower", "a Title: label is read");
ok(T.titleLineOf("```\n# Three replicas made every write slower\n```") === "# Three replicas made every write slower", "a fenced # line is read");
ok(T.titleLineOf("<think>pondering</think>\nThree replicas made every write slower") === "# Three replicas made every write slower", "a think block is ignored");
env = fakeEnv({ [N]: [labelDraft, "Option A\nOption B\nOption C"], [G]: ["# Three replicas made every write slower\n\n" + body + verdict] });
r = await T.compose(env, "PROMPT", [], [N, G], undefined, { titleRepair: true });
ok(r.model === G && r.trail.some((t) => /^title repair: no title line in the reply: Option A/.test((t.problems || [])[0] || "")), "a reply with no title line leaves a trail note and the next writer is asked", r.trail);
const errs2 = []; const oe2 = console.error; console.error = (x) => errs2.push(String(x));
env = fakeEnv({ [N]: [labelDraft, new Error("The operation was aborted due to timeout")], [G]: ["# Three replicas made every write slower\n\n" + body + verdict] });
r = await T.compose(env, "PROMPT", [], [N, G], undefined, { titleRepair: true });
console.error = oe2;
ok(r.trail.some((t) => /^title repair failed: The operation was aborted due to timeout/.test((t.problems || [])[0] || "")), "a failed title call leaves a trail note with its error", r.trail);
const src = (await import("node:fs")).readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok((src.match(/TITLE_REPAIR_ON\)/g) || []).length === 4, "the writer, its retry and the forecast writer and retry ask for the repair, nothing else");
ok(ver.length === 3 && (ver[0] > 0 || ver[1] > 26 || (ver[1] === 26 && ver[2] >= 1)), "VERSION is at least 0.26.1", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
