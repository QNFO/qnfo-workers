// RM-CODE-SESSION-1 (dashboard 1.78.0): the owner's plain-English line enters CodeSession, with the ops agent as fallback.
// Source-shape test: it proves the route and poll contract exist; the live proof is a streamed session turn, or a pending ops run
// showing "step n: <tool>" progress and then an answer that carries the tool trace.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const ver = /var VERSION = "(\d+)\.(\d+)\.(\d+)"/.exec(src);
ok(ver && (Number(ver[1]) > 1 || Number(ver[2]) >= 77), "version is at least 1.77.0");
const routeStart = src.indexOf("// RM-CODE-SESSION-1:");
const nl = src.indexOf("// Natural language: capped AI in the background");
const route = src.slice(routeStart, nl);
ok(routeStart >= 0 && /if \(holder\) \{/.test(route), "only the signed-in owner is routed to the session or agent");
ok(/cmdCodeSessionFetch\(env, sessionPath/.test(route) && /kind: "stream", session_id: session\.session_id/.test(route),
  "the owner starts or resumes a CodeSession turn");
ok(/op: "start"/.test(route) && /run_id: aid/.test(route) && /max_iters: 16/.test(route), "CodeSession failure falls back to a background ops-exec run keyed by the cmd id");
ok(/kind: "pending", id: aid, agent: true/.test(route), "the page gets a pending job with agent:true");
ok(nl > routeStart, "the capped RAG answer stays as the fallback after the session and agent routes");
ok(/if \(st\.json && st\.json\.ok\)/.test(route), "a failed start falls through to the grounded answer");
ok(/row\.kind === "agent" && row\.status === "running"/.test(src) && /cmdAgentPoll\(env, id\)/.test(src), "the job poll reads the agent run");
ok(/op: "result", id: id/.test(src) && /status=\?1, answer=\?2, error=\?3/.test(src), "a finished run is written back to cmd_log");
ok(/kind != 'agent' AND ts < datetime\('now', '-3 minutes'\)/.test(src) && /kind = 'agent' AND ts < datetime\('now', '-30 minutes'\)/.test(src), "the sweep spares agent runs for 30 minutes");
ok(/j\.agent\?1500000:45000/.test(src) && /j\.progress\|\|'thinking'/.test(src), "the page polls an agent run for 25 minutes and shows its step");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
