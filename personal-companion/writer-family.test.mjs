// WRITER-FAMILY-1 offline suite (personal-companion 1.25.0, charter pillar: personal; agent_issues 2552).
// Proves: deepseek-v4-pro writes first with its reasoning off and gpt-oss-120b is the per-request fallback; a critic call skips every
// family that wrote or edited the draft in hand, so kimi falling through never hands the draft to its own family; the editor follows the
// writer's family; ops_config companion_writer = gpt-oss restores the old order without a deploy, and an unreadable switch keeps the new one.
// Run: node personal-companion/writer-family.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()).toString("base64"));
const V = mod.__verify;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };
const fam = (m) => V.familyOf(m);

// the chains
ok(V.WRITER_LEAD === "@cf/deepseek-ai/deepseek-v4-pro-0813", "deepseek-v4-pro leads the writers");
ok(V.CF_FALLBACK.essay[0] === V.WRITER_LEAD && V.CF_FALLBACK.essay[1] === "@cf/openai/gpt-oss-120b" && V.CF_FALLBACK.writer[1] === "@cf/openai/gpt-oss-120b", "gpt-oss-120b is the writer's per-request fallback");
ok(fam(V.WRITER_LEAD) !== fam(V.CF_FALLBACK.critic[0]), "the writer is not the critic's first family (moonshot)");
ok(V.CF_FALLBACK.essay.every((m) => !/-flash|-mini|-small|llama/.test(m)), "no banned writer (fleet policy: no -flash, -mini, -small, llama)");
ok(V.CF_FALLBACK_GPT_OSS.essay[0] === "@cf/openai/gpt-oss-120b" && V.CF_FALLBACK_GPT_OSS.editor[0] === "@cf/openai/gpt-oss-120b", "the gpt-oss order is the 1.24.0 order");

// the switch
const envSwitch = (value, throws) => ({ AUDIT: { prepare: () => ({ first: async () => { if (throws) throw new Error("d1 down"); return value === null ? null : { value }; } }) } });
ok(await V.loadWriterOrder(envSwitch("gpt-oss")) === "gpt-oss" && V.fallbackChain("deepseek-reasoner", "essay")[0] === "@cf/openai/gpt-oss-120b", "ops_config companion_writer = gpt-oss restores gpt-oss first");
ok(V.fallbackChain("", "editor")[0] === "@cf/openai/gpt-oss-120b" && V.fallbackChain("", "critic")[0] === V.CF_FALLBACK.critic[0], "under the switch the editor follows the writer and the critic is unchanged");
const errs = []; const orig = console.error; console.error = (x) => errs.push(x);
ok(await V.loadWriterOrder(envSwitch(null, true)) === "deepseek" && V.fallbackChain("deepseek-reasoner", "essay")[0] === V.WRITER_LEAD && errs.length === 1, "an unreadable switch keeps the new order and is logged", errs);
console.error = orig;
ok(await V.loadWriterOrder(envSwitch(null)) === "deepseek" && await V.loadWriterOrder({}) === "deepseek", "no row and no binding keep the new order");

// a writer call, then critic calls with kimi failing: the author's family is skipped
const seen = [];
const env = { AI: { run: async (m, input) => {
  seen.push({ m, input });
  if (/kimi/.test(m)) throw new Error("timeout");
  if (/deepseek|gpt-oss/.test(m) && input.temperature !== V.CRITIC_TEMPERATURE) return { response: "w".repeat(400) };
  return { response: '{"verdict":"accept","why":"' + "x ".repeat(60) + '"}' };
} } };
const w = await mod.callModel(env, [{ role: "user", content: "write" }], 4000, 30000, "deepseek-reasoner", "essay");
ok(w && w.model === V.WRITER_LEAD, "the draft is written by deepseek-v4-pro", w && w.model);
ok(seen[0].input.chat_template_kwargs && seen[0].input.chat_template_kwargs.thinking === false, "the writer runs with its reasoning off", seen[0].input);
seen.length = 0;
const c = await mod.callModel(env, [{ role: "user", content: "judge" }], 900, 30000, "deepseek-chat", "critic");
ok(c && c.model === "@cf/openai/gpt-oss-120b", "kimi failed, deepseek wrote the draft, so gpt-oss judges it", c && c.model);
ok(seen.map((x) => x.m).every((m) => !/deepseek/.test(m)), "the critic never called the writer's family", seen.map((x) => x.m));

// composePiece starts a new set of author families
const cp = src.slice(src.indexOf("async function composePiece("), src.indexOf("__name(composePiece"));
ok(/authorFamilies = \{\}; \/\/ WRITER-FAMILY-1/.test(cp), "every new draft resets the author families");
const cw = src.slice(src.indexOf("async function callWorkersAI("), src.indexOf("async function callModel("));
ok(/if \(role !== "critic"\) authorFamilies\[familyOf\(m\)\] = 1;/.test(cw), "a writer or editor answer records its family; a critic answer does not");
ok(/schema ok, writer order " \+ await loadWriterOrder\(env\)/.test(src), "each run reads the switch and logs the writer order");

const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 1 || (ver[0] === 1 && ver[1] >= 25)), "VERSION is at least 1.25.0", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
