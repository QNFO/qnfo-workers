// Offline execution of the folded advisor with isolated async tracing and model/D1 stubs.
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const config = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
const moduleSource = src.slice(src.indexOf("var advisorMod ="), src.indexOf("var calibratorMod ="));
const context = new AsyncLocalStorage();
let passed = 0;
function check(value, expected, message) {
  assert.deepEqual(value, expected, message);
  passed++;
}

function fixture({ replies = ["private proposal", "ACCEPT"], findings = true, prior, ai = true, advisorModel = "@cf/test/proposer" } = {}) {
  const spans = [], calls = [], events = [];
  const env = {
    PROBE_WORKERS: "test-worker",
    ADVISOR_MODEL: advisorModel,
    REVIEW_MODEL: "@cf/test/reviewer",
    ADVISOR_ITERS: "3",
    ADVISOR_TOKEN: "private-secret",
    AI: ai ? {} : undefined,
    AUDIT_DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async all() {
            if (sql.includes("FROM ai_model_health")) return { results: findings ? [{ model_id: "private-finding" }] : [] };
            if (sql.includes("FROM cloud_ops_events")) return { results: prior ? [{ text: JSON.stringify(prior) }] : [] };
            return { results: [] };
          },
          async run() { events.push(sql); return { meta: { changes: 1 } }; }
        };
      }
    }
  };
  const sandbox = {
    __name: (fn) => fn,
    __name2: (fn) => fn,
    VERSION: "test",
    Request, Response, URL, AbortSignal, console,
    crypto: { randomUUID },
    secretEq: () => true,
    fetch: async () => Response.json({ result: [{ id: "test-worker" }] }),
    aiRunAttr: async (actualEnv, worker, purpose, model, input) => {
      const span = context.getStore();
      calls.push({ env: actualEnv, worker, purpose, model, input, span });
      const reply = replies[calls.length - 1];
      await Promise.resolve();
      if (reply instanceof Error) throw reply;
      return typeof reply === "object" ? reply : { response: reply };
    },
    tracing: {
      enterSpan(name, callback) {
        const span = { name, parent: context.getStore(), attributes: {}, ended: false };
        spans.push(span);
        return context.run(span, async () => {
          try {
            return await callback({
              setAttributes(attrs) {
                for (const [key, value] of Object.entries(attrs)) {
                  if (value !== undefined) span.attributes[key] = value;
                }
              }
            });
          } finally {
            span.ended = true;
          }
        });
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(moduleSource, sandbox);
  const mod = sandbox.advisorMod;
  const request = () => new Request("https://example.test/run-audit", { method: "POST" });
  return {
    spans, calls, events, env, mod,
    run: async () => (await mod.default.fetch(request(), env)).json(),
    runDO: async () => (await new mod.FleetAdvisor({}, env).fetch(request())).json(),
    async runCron() {
      let pending;
      await mod.default.scheduled({}, env, { waitUntil(promise) { pending = promise; } });
      return pending;
    }
  };
}

function verifySpans(f, count) {
  check(f.spans.length, count + 1, "exactly one turn and one chat per model call");
  const [turn, ...chats] = f.spans;
  check(turn.name, "invoke_agent qnfo-fleet-advisor", "stable turn name");
  check(turn.parent, undefined, "turn is outermost custom span");
  const id = turn.attributes["gen_ai.conversation.id"];
  check(/^[0-9a-f-]{36}$/.test(id), true, "opaque UUID identity");
  for (const span of f.spans) {
    check(span.ended, true, "span ends even on rejection");
    check(span.attributes["gen_ai.agent.name"], "qnfo-fleet-advisor", "shared logical agent");
    check(span.attributes["gen_ai.agent.id"], "qnfo-fleet-control/advisor", "stable deployment instance");
    check(span.attributes["gen_ai.conversation.id"], id, "conversation shared across the turn");
    check(Object.keys(span.attributes).sort(), [
      "gen_ai.agent.id", "gen_ai.agent.name", "gen_ai.conversation.id", "gen_ai.operation.name",
      ...(span === turn ? [] : ["gen_ai.request.model"])
    ].sort(), "only metadata allowlist is recorded");
  }
  check(turn.attributes["gen_ai.operation.name"], "invoke_agent", "turn operation");
  for (const [i, chat] of chats.entries()) {
    check(chat.parent, turn, "every chat is a direct child, not nested under a previous chat");
    check(chat.attributes["gen_ai.operation.name"], "chat", "model operation");
    check(chat.attributes["gen_ai.request.model"], f.calls[i].model, "actual requested model");
    check(chat.name, "chat " + f.calls[i].model, "model span name");
    check(f.calls[i].span, chat, "model executes inside its chat span");
    check(f.calls[i].env, f.env, "existing model environment preserved");
    check(f.calls[i].worker, "fleet-control", "existing spend attribution preserved");
  }
  check(/private|ACCEPT|IMPROVE/.test(JSON.stringify(f.spans.map((s) => ({ name: s.name, attributes: s.attributes })))), false, "no inputs, outputs or secrets in span data");
}

const accepted = fixture();
const result = await accepted.run();
verifySpans(accepted, 2);
check(result.suggestion, "private proposal", "accepted suggestion unchanged");
check(accepted.calls.map((c) => c.purpose), ["advisor-propose", "advisor-review"], "one proposal and review");
check(accepted.calls[0].input.max_tokens, 350, "proposal options preserved");
check(accepted.calls[1].input.temperature, 0.2, "review options preserved");

const gemma = fixture({ advisorModel: "", replies: ["private proposal", "ACCEPT"] });
await gemma.run();
check(gemma.calls.map((c) => c.model), ["@cf/google/gemma-4-26b-a4b-it", "@cf/test/reviewer"], "Gemma is the default proposal model and the separate reviewer is unchanged");
verifySpans(gemma, 2);

for (const replies of [
  [new Error("private upstream error"), "fallback proposal", "ACCEPT"],
  ["", "fallback proposal", "ACCEPT"]
]) {
  const fallback = fixture({ advisorModel: "", replies });
  check((await fallback.run()).suggestion, "fallback proposal", "the previous proposal model answers after Gemma errors or returns empty content");
  check(fallback.calls.map((c) => c.model), [
    "@cf/google/gemma-4-26b-a4b-it",
    "@cf/zai-org/glm-5.3-flash",
    "@cf/test/reviewer"
  ], "fallback model and independent reviewer are recorded in order");
  verifySpans(fallback, 3);
}

const improved = fixture({ replies: ["private proposal", "IMPROVE private revised proposal", "ACCEPT"] });
check((await improved.runDO()).suggestion, "private revised proposal", "DO entry uses same turn and improvement behavior");
verifySpans(improved, 3);
check(improved.calls[2].input.messages[0].content.includes("private revised proposal"), true, "next review receives revised proposal");

const bounded = fixture({ replies: ["private proposal", "IMPROVE private first revision", "IMPROVE private second revision", "IMPROVE private third revision"] });
check((await bounded.runCron()).suggestion, "private third revision", "cron keeps existing review limit");
verifySpans(bounded, 4);

const empty = fixture({ advisorModel: "", replies: ["", ""] });
check((await empty.run()).suggestion, null, "empty proposal still skips review");
check(empty.calls.map((c) => c.model), ["@cf/google/gemma-4-26b-a4b-it", "@cf/zai-org/glm-5.3-flash"], "an empty Gemma answer retries the control model before skipping review");
verifySpans(empty, 2);

const choices = fixture({ replies: [{ choices: [{ message: { content: "private choices proposal" } }] }, "ACCEPT"] });
check((await choices.run()).suggestion, "private choices proposal", "alternate model response shape preserved");
verifySpans(choices, 2);

for (const replies of [[new Error("private upstream error")], ["private proposal", new Error("private review error")]]) {
  const failed = fixture({ replies });
  const output = await failed.run();
  check(output.ok, true, "model failures retain existing audit success semantics");
  check(output.suggestion, null, "model failures retain null suggestion");
  check(failed.events.some((sql) => sql.includes("INSERT INTO cloud_ops_events")), true, "audit still recorded after failure");
  verifySpans(failed, failed.calls.length);
}

for (const options of [
  { findings: false },
  { ai: false },
  { prior: { suggestion: "private cached advice", finding_sig: "MODEL-DEGRADED private-finding", advice_ts: new Date().toISOString() } }
]) {
  const skipped = fixture(options);
  const output = await skipped.run();
  check(skipped.spans.length, 0, "no turn when no model is called");
  check(skipped.calls.length, 0, "cache, no findings and missing AI skip inference");
  check(output.suggestion, options.prior ? "private cached advice" : null, "skip result preserved");
}

const concurrent = fixture({ replies: ["private one", "private two", "ACCEPT", "ACCEPT"] });
await Promise.all([concurrent.run(), concurrent.run()]);
const turns = concurrent.spans.filter((s) => s.attributes["gen_ai.operation.name"] === "invoke_agent");
check(turns.length, 2, "concurrent audits have distinct turns");
check(turns[0].attributes["gen_ai.conversation.id"] !== turns[1].attributes["gen_ai.conversation.id"], true, "concurrent conversation IDs are distinct");
for (const call of concurrent.calls) {
  check(call.span.parent.attributes["gen_ai.conversation.id"], call.span.attributes["gen_ai.conversation.id"], "async context keeps concurrent children with their turn");
}

check((src.match(/import \{ tracing \} from "cloudflare:workers";/g) || []).length, 1, "native Workers tracing imported once");
check((moduleSource.match(/advisorSpan\("invoke_agent"/g) || []).length, 1, "one shared turn boundary");
check((moduleSource.match(/aiRunAttr\(/g) || []).length, 2, "only advisor proposal and review instrumented");
check(/\[observability\.traces\]\s+enabled = true\s+head_sampling_rate = 0\.1\b/.test(config), true, "existing ten percent trace sampling preserved");
check(/\[observability\.logs\]\s+enabled = true\s+head_sampling_rate = 1\b/.test(config), true, "existing log sampling preserved");
check(src, readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n"), "deployment mirror synchronized");
console.log(`${passed} passed, 0 failed`);
