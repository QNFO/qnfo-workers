// CF-AGENTS-1 (qnfo-ops 2.57.0), offline source-shape test. The live proof is an owner-authenticated GET https://ops.qnfo.org/v1/agents
// answering the qnfo-agents self-doc with you.caller "qnfo-ops", and a call without a credential answering 401.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
ok(/var OPS_AGENT_TOOL_CALLERS = \["qnfo-agents"\];/.test(src), "qnfo-agents is a named tool caller");
ok(/OPS_AGENT_TOOL_CALLERS\.indexOf\(_ic\) >= 0 && \(_ip === "\/v1\/tools" \|\| _ip === "\/v1\/tools\/call"\)\)/.test(src), "qnfo-agents is trusted on the tool catalogue and a tool call only");
ok(!/OPS_TOOL_CALL_CALLERS = \[[^\]]*qnfo-agents/.test(src) && !/OPS_INTERNAL_DEPLOY_CALLERS = \[[^\]]*qnfo-agents/.test(src), "qnfo-agents gets no chat, ops-exec or deploy trust");
const route = src.slice(src.indexOf('if (path === "/v1/agents" || path.indexOf("/v1/agents/") === 0) {'));
ok(route.length > 0, "the /v1/agents route exists");
const head = route.slice(0, 1400);
ok(head.indexOf("ownerKeyOk(env") > 0 && head.indexOf("ownerKeyOk(env") < head.indexOf("env.AGENTS.fetch"), "the owner check runs before the agent is called");
ok(/ah\.set\("x-agent-scope", "write"\)/.test(head) && head.indexOf('"authorization"') < 0, "the scope header is passed on and the caller's credential is not");
ok(/binding = "AGENTS"\nservice = "qnfo-agents"\nprops = \{ caller = "qnfo-ops" \}/.test(toml), "AGENTS binding carries caller qnfo-ops");
ok(src === readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8"), "mirror identical");
console.log("cf-agents: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
