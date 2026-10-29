// CMD-AGENT-1 (dashboard 1.77.0): the owner's plain-English line runs the ops agent, not the no-tools RAG prompt.
// Source-shape test: it proves the routing and the poll contract exist; the live proof is POST /api/cmd as the owner answering
// kind "pending" with agent:true and /api/cmd/job/<id> showing "step n: <tool>" progress, then an answer that carries the tool trace.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const ver = /var VERSION = "(\d+)\.(\d+)\.(\d+)"/.exec(src);
ok(ver && (Number(ver[1]) > 1 || Number(ver[2]) >= 77), "version is at least 1.77.0");
const nl = src.indexOf("// Natural language: capped AI in the background");
const route = src.slice(src.lastIndexOf("CMD-AGENT-1 (1.77.0", nl), nl);
ok(/if \(holder\) \{/.test(route), "only the signed-in owner is routed to the agent");
ok(/op: "start"/.test(route) && /run_id: aid/.test(route) && /max_iters: 16/.test(route), "the line starts a background ops-exec run keyed by the cmd id");
ok(/kind: "pending", id: aid, agent: true/.test(route), "the page gets a pending job with agent:true");
ok(nl > src.indexOf("CMD-AGENT-1 (1.77.0"), "the capped RAG answer stays as the fallback after the agent route");
ok(/if \(st\.json && st\.json\.ok\)/.test(route), "a failed start falls through to the grounded answer");
ok(/row\.kind === "agent" && row\.status === "running"/.test(src) && /cmdAgentPoll\(env, id\)/.test(src), "the job poll reads the agent run");
ok(/op: "result", id: id/.test(src) && /status=\?1, answer=\?2, error=\?3/.test(src), "a finished run is written back to cmd_log");
ok(/kind != 'agent' AND ts < datetime\('now', '-3 minutes'\)/.test(src) && /kind = 'agent' AND ts < datetime\('now', '-30 minutes'\)/.test(src), "the sweep spares agent runs for 30 minutes");
ok(/j\.agent\?1500000:45000/.test(src) && /j\.progress\|\|'thinking'/.test(src), "the page polls an agent run for 25 minutes and shows its step");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
