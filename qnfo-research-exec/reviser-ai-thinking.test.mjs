// BREACH-LEVER-5916 offline suite (agent_issues 100214, qnfo-research-exec 0.28.3). 13 of 22 thin-prior-work writer calls came back with 0 characters because a deepseek model
// spent the whole token budget on reasoning. The reviser's aiText (the folded copy in this host and its twin in qnfo-paper-reviser) now sends chat_template_kwargs { thinking: false }
// to a deepseek model. runModel in this host already did; the earlier fix there never reached aiText, which is what the reviser calls.
// Proves: a deepseek model gets the switch; a non-deepseek model gets an unchanged body; the text is still extracted from the response; the host and the guest carry the same aiText.
// Run: node qnfo-research-exec/reviser-ai-thinking.test.mjs   (exit 0 = all passed)
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
const host = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const guest = readFileSync(new URL("../qnfo-paper-reviser/worker.js", import.meta.url), "utf8");
const fnOf = (s) => { const i = s.indexOf("async function aiText(env, prompt, model, maxTokens)"); const j = s.indexOf("__name(aiText", i); return s.slice(i, j); };
ok(fnOf(host).length > 200 && fnOf(host) === fnOf(guest), "the host and the guest carry the same aiText", fnOf(host).length);
const load = (s) => new Function("MODEL", "__name", "attributeAiCall", "return (" + fnOf(s).replace(/^async function aiText/, "async function") + ")")("@cf/default/model", (f) => f, () => {});
for (const [name, src] of [["host", host], ["guest", guest]]) {
  let fn;
  try { fn = load(src); } catch (e) { ok(false, name + " aiText loads standalone", String(e)); continue; }
  const seen = [];
  const env = { AI: { run: async (m, body, opts) => { seen.push({ m, body, opts }); return { response: "hello" }; } } };
  const t1 = await fn(env, "p", "@cf/deepseek-ai/deepseek-v4-pro", 100);
  const t2 = await fn(env, "p", "@cf/zai-org/glm-5.3", 100);
  ok(seen[0].body.chat_template_kwargs && seen[0].body.chat_template_kwargs.thinking === false, name + ": a deepseek model gets thinking:false", seen[0].body);
  ok(!("chat_template_kwargs" in seen[1].body) && seen[1].body.max_tokens === 100 && seen[1].body.messages[0].content === "p", name + ": another model's body is unchanged", seen[1].body);
  ok(seen[0].opts && seen[0].opts.gateway && seen[0].opts.gateway.id === "default", name + ": the gateway option is still passed", seen[0].opts);
  ok(t1 === "hello" && t2 === "hello", name + ": the text is still extracted", [t1, t2]);
}
ok(/var VERSION = "0\.(28\.[3-9]|29|[3-9]\d)|var VERSION = "[1-9]/.test(host), "the host VERSION is at least 0.28.3 (a minimum)");
console.log("reviser-ai-thinking: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
