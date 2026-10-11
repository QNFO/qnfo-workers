// MODEL-ID-AUDIT-1: bare model ids that fleet callers send to qnfo-ai must be keys of its MODELS table
// (an unknown id silently falls back to deepseek-v4-flash, so a dead id never errors and is never noticed).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => readFileSync(join(root, p), "utf8");
const ai = rd("qnfo-ai/worker.js");
const table = ai.slice(ai.indexOf("var MODELS = {"), ai.indexOf("var MAX_OUT"));
const routable = new Set([...table.matchAll(/^\s*"([a-z0-9.-]+)": \{ tier:/gm)].map((m) => m[1]).concat(["auto", "qnfo", "ensemble"]));
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
ok(routable.has("glm-5.3-flash") && routable.has("gpt-oss-120b") && routable.has("deepseek-v4-flash"), "MODELS table parsed");
const ask = /var ASK_MODELS = \[([^\]]*)\]/.exec(rd("qnfo-fleet-dashboard/worker.js"));
for (const id of ask[1].match(/"[^"]+"/g).map((x) => x.slice(1, -1))) ok(routable.has(id), "dashboard ASK_MODELS id routable: " + id);
const io = rd("qnfo-intent-orchestrator/worker.js");
const order = [...io.matchAll(/\["([a-z0-9.-]+)", "([a-z0-9.-]+)"\]/g)];
for (const m of order) for (const id of [m[1], m[2]]) ok(routable.has(id), "intent-orchestrator id routable: " + id);
ok(!/model='glm-5\.2'/.test(io) && !/return "glm-5\.2"/.test(io), "intent-orchestrator no longer returns glm-5.2");
process.exit(fail ? 1 : 0);
