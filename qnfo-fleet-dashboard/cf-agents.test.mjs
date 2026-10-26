// CF-AGENTS-1 (1.64.0) offline suite: the cfagent console commands drive qnfo-agents over SVC_QNFO_AGENTS.
// Proves: the binding carries props caller qnfo-fleet-dashboard; read turns and reads run at once in the read scope; the write
// scope and agent changes are destructive ops (a fresh code); a turn's code-task proposals come back as 'task' buttons; a dead
// binding answers an error, never a throw. ADVERSARIAL: does not prove the live binding resolves; the live proof is
// "cfagent tools" in fleet.qnfo.org/cmd listing repo_read_file.
// Run: node qnfo-fleet-dashboard/cf-agents.test.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const fnSrc = (name) => { const i = src.indexOf((name.startsWith("async") ? "" : "function ") + name + "("); const j = src.indexOf("\n}\n", i); return src.slice(i, j + 2); };

ok(/\[\[services\]\]\nbinding = "SVC_QNFO_AGENTS"\nservice = "qnfo-agents"\nprops = \{ caller = "qnfo-fleet-dashboard" \}/.test(toml), "SVC_QNFO_AGENTS declared with props caller");
ok(/cfagent: \{ destructive: false/.test(src) && /cfagentget: \{ destructive: false/.test(src) && /cfagentbox: \{ destructive: false/.test(src), "turns, reads and sandbox are not destructive");
ok(/cfagentw: \{ destructive: true/.test(src) && /cfagentset: \{ destructive: true/.test(src), "write scope and agent changes need a fresh code");
ok(/"qnfo-agents": "SVC_QNFO_AGENTS"/.test(src), "CON_SVC knows qnfo-agents");
ok(/executed: a\.op, actions: r\.actions/.test(src), "the auto path passes actions through");

const conOps = src.slice(src.indexOf("var CON_OPS = {"), src.indexOf("\n};\n", src.indexOf("var CON_OPS = {")) + 3);
const cmdAction = new Function(conOps + "\nvar CMD_OPS = CON_OPS;\n" + fnSrc("cmdAction") + "; return cmdAction;")();
const conClip = new Function(fnSrc("conClip") + "; return conClip;")();
const conCfAgent = new Function("cmdAction", "conClip", "async " + fnSrc("conCfAgent") + "; return conCfAgent;")(cmdAction, conClip);
let seen = [];
const env = (reply) => ({ SVC_QNFO_AGENTS: { fetch: async (u, init) => { seen.push({ u, init }); return { status: 200, text: async () => JSON.stringify(reply) }; } } });

const run = { id: "run_abc_123456", status: "done", steps: 3, scope: "read", model: "m", result: "answer", proposals: [{ path: "qnfo-ops/worker.js", task_text: "Fix it well\ncode-task: repo=qnfo-workers path=qnfo-ops/worker.js" }] };
let r = await conCfAgent(env({ ok: true, run }), "cfagent", { text: "hello" });
ok(seen[0].u === "https://agents.qnfo.org/run" && seen[0].init.method === "POST" && seen[0].init.headers["x-agent-scope"] === "read", "cfagent posts /run in the read scope");
ok(r.ok && /answer/.test(r.text) && r.actions.length === 1 && r.actions[0].op === "task" && /code-task: repo=qnfo-workers/.test(r.actions[0].args.text), "a proposal becomes a task button");
seen = [];
await conCfAgent(env({ ok: true, run: Object.assign({}, run, { scope: "write" }) }), "cfagentw", { text: "do it" });
ok(seen[0].init.headers["x-agent-scope"] === "write", "cfagentw sends the write scope");
seen = [];
r = await conCfAgent(env({ ok: true, runs: [] }), "cfagentget", { path: "/runs?limit=12" });
ok(seen[0].init.method === "GET" && seen[0].init.headers["x-agent-scope"] === "read" && /No agent runs yet/.test(r.text), "cfagent runs reads in the read scope");
r = await conCfAgent(env({ ok: true }), "cfagentget", { path: "https://evil.example/" });
ok(!r.ok && /bad agent route/.test(r.error), "only relative agent routes");
r = await conCfAgent(env({ ok: false, error: "nope" }), "cfagentset", { method: "POST", path: "/schedules", body: {} });
ok(!r.ok && r.error === "nope", "an agent error is relayed");
r = await conCfAgent({}, "cfagent", { text: "x" });
ok(!r.ok && /SVC_QNFO_AGENTS/.test(r.error), "a missing binding answers an error");
r = await conCfAgent({ SVC_QNFO_AGENTS: { fetch: async () => { throw new Error("boom"); } } }, "cfagent", { text: "x" });
ok(!r.ok && /boom/.test(r.error), "a thrown fetch answers an error");

// conParse's cfagent block, executed.
const pb0 = src.indexOf("    if (/^cf-?agents?\\b/i.test(at)) {");
const pb1 = src.indexOf("\n    }\n", pb0) + 6;
const parse = new Function("cmdAction", "text", "const at = String(text).trim(); let am;\n" + src.slice(pb0, pb1) + "\nreturn null;").bind(null, cmdAction);
ok(pb0 > 0, "conParse has the cfagent block");
let p = parse("cfagent what changed in qnfo-ops?");
ok(p && p.auto && p.actions[0].op === "cfagent" && p.actions[0].args.text === "what changed in qnfo-ops?", "cfagent <request> runs at once in the read scope");
p = parse("cfagent! open the fix");
ok(p && !p.auto && p.actions[0].op === "cfagentw" && p.actions[0].destructive, "cfagent! is a confirm button with the write scope");
p = parse("cfagent runs");
ok(p && p.auto && p.actions[0].op === "cfagentget" && p.actions[0].args.path === "/runs?limit=12", "cfagent runs reads");
p = parse("cfagent run run_mk1_abcdef012345");
ok(p && p.actions[0].args.path === "/runs/run_mk1_abcdef012345", "cfagent run <id> reads one run");
p = parse('cfagent schedule "0 * * * *" summarise new issues');
ok(p && !p.auto && p.actions[0].op === "cfagentset" && p.actions[0].args.body.cron === "0 * * * *", "cfagent schedule takes a quoted cron");
p = parse("cfagent schedule 3600s check the deploy queue");
ok(p && p.actions[0].args.body.delay_s === 3600, "cfagent schedule takes a delay");
p = parse("cfagent mcp add docs https://docs.mcp.cloudflare.com/mcp");
ok(p && p.actions[0].op === "cfagentset" && p.actions[0].args.body.url === "https://docs.mcp.cloudflare.com/mcp", "cfagent mcp add connects a server");
p = parse("cfagent sandbox async () => 1 + 1");
ok(p && p.auto && p.actions[0].op === "cfagentbox", "cfagent sandbox runs code at once");
ok(parse("cfagent") && !parse("cfagent").actions, "bare cfagent answers usage");
ok(parse("agent hello") === null, "the older agent command is untouched");
// FM7-PARITY-MANAGERS-1: the qnfo-ops deploy guard's /health parity scan, run on this file. A literal "version:" after "ok: true"
// makes /ops/deploy refuse the worker, and the code-only second path then ships it without new bindings (SVC_QNFO_AGENTS).
{
  const vc = src.match(/(?:var|const|let)\s+VERSION\s*=\s*["'][^"']+["']/g) || [];
  const vv = vc.length === 1 ? vc[0].match(/["']([^"']+)["']/)[1] : null;
  const rx = /(?:ok:\s*true|status:\s*["']ok["'])[^}]{0,800}?version:\s*["']([^"']+)["']/g;
  const bad = []; let m;
  while ((m = rx.exec(src)) !== null) if (m[1] !== vv) bad.push(m[1]);
  ok(vc.length === 1 && bad.length === 0, "FM7 parity: no hardcoded version literal after ok: true " + JSON.stringify(bad));
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
