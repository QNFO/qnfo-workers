// AIG-BINDING-1 (#1784) offline suite for qnfo-ai aiRunAttr. Run: node qnfo-ai/aig-binding.test.mjs
// Embedding calls go through AI Gateway "default" (cached 24h) with metadata {worker, purpose} on the log entry; a gateway
// error retries once on the plain binding; chat calls and callers that pass their own options are unchanged.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
function ok(c, m) { if (c) passed++; else { failed++; console.log("FAIL " + m); } }

const src = readFileSync(join(here, "worker.js"), "utf8");
const start = src.indexOf("async function aiRunAttr(");
const end = src.indexOf("\n// end aiRunAttr", start);
ok(start > 0 && end > start, "aiRunAttr found in worker.js");
const body = src.slice(start, end);
const make = new Function("AI_ATTR_DB_BINDINGS", "spendRecord", "spendUsageOf", "spendOutEstimate", body + "\nreturn aiRunAttr;");
const aiRunAttr = make([], () => {}, () => ({ in: 0, out: 0 }), () => 0);

function env(failGateway) {
  const calls = [];
  return { calls, AI: { async run(model, input, opts) { calls.push({ model, opts }); if (failGateway && opts && opts.gateway) throw new Error("gateway 429"); return { data: [[0.1]] }; } } };
}

// 1. an embedding call goes through the gateway with metadata
let e = env(false);
let r = await aiRunAttr(e, "qnfo-ai", "embed-search2", "@cf/baai/bge-base-en-v1.5", { text: ["q"] });
const g = e.calls[0] && e.calls[0].opts && e.calls[0].opts.gateway;
ok(r && r.data && e.calls.length === 1, "embedding call returns the binding result in one call");
ok(g && g.id === "default" && g.cacheTtl === 86400, "embedding call uses AI Gateway default with a 24h cache");
ok(g && g.metadata && g.metadata.worker === "qnfo-ai" && g.metadata.purpose === "embed-search2", "the gateway log entry carries metadata worker=qnfo-ai and the purpose");
ok(!g || !("skipCache" in g), "embedding calls may be served from the gateway cache");

// 2. a gateway failure falls back once to the plain binding
e = env(true);
r = await aiRunAttr(e, "qnfo-ai", "embed-index", "@cf/baai/bge-base-en-v1.5", { text: ["x"] });
ok(r && r.data && e.calls.length === 2 && e.calls[1].opts === undefined, "a gateway error retries once on the plain binding");

// 3. chat calls and explicit options are unchanged
e = env(false);
await aiRunAttr(e, "qnfo-ai", "chat", "@cf/zai-org/glm-4.7-flash", { messages: [] });
ok(e.calls.length === 1 && e.calls[0].opts === undefined, "chat calls do not go through the gateway option");
e = env(false);
const own = { gateway: { id: "other" } };
await aiRunAttr(e, "qnfo-ai", "embed-topic", "@cf/baai/bge-base-en-v1.5", { text: ["y"] }, own);
ok(e.calls.length === 1 && e.calls[0].opts === own, "a caller's own options are passed through unchanged");

// 4. a chat error still propagates (no silent fallback)
const bad = { AI: { async run() { throw new Error("model down"); } } };
let threw = false;
try { await aiRunAttr(bad, "qnfo-ai", "chat", "m", {}); } catch (x) { threw = /model down/.test(String(x && x.message)); }
ok(threw, "a chat error propagates");

ok(/var gwOpts = /.test(src), "the deployed source names gwOpts (the issue's source check)");
console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
