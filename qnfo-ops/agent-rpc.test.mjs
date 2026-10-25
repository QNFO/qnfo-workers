// AGENT-RPC-1 (qnfo-ops 2.55.0), offline. Locks the two defects found on 2026-10-25:
//   1. AgenticOpsExec never called super(ctx, env): every request to /agents/ops-exec answered HTTP 500
//      (edge error 1101) because a derived-class constructor touched `this` before super().
//   2. The durable agent could only be driven over a WebSocket, so no dashboard or worker could use it.
// ADVERSARIAL: this is a source-shape test. It proves the constructor calls super() and that the HTTP RPC and the
// shared runTurn exist in the deployed file; it cannot prove the DO boots. The live proof is a POST to
// /agents/ops-exec answering {ok:true, reply:...} and a WebSocket upgrade answering 101.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const cls = src.slice(src.indexOf("var AgenticOpsExec = class extends DurableObject"));
ok(cls.length > 0, "AgenticOpsExec class present");
const ctor = cls.slice(0, cls.indexOf("async fetch(request)"));
ok(/constructor\(ctx, env\) \{\s*super\(ctx, env\);/.test(ctor), "DO constructor calls super(ctx, env) before touching this");
ok(ctor.indexOf("super(ctx, env)") < ctor.indexOf("this.ctx = ctx"), "super() precedes the first this access");

const body = cls.slice(cls.indexOf("async fetch(request)"), cls.indexOf("async webSocketClose"));
ok(/request\.method === "POST"/.test(body), "DO fetch handles POST (HTTP RPC)");
ok(/op === "history"/.test(body) && /op === "reset"/.test(body) && /op === "run"|const op = String/.test(body), "HTTP RPC ops: run / history / reset");
ok(/this\.runTurn\(sid, text\)/.test(body), "HTTP RPC runs a real agent turn");

ok(/async runTurn\(sid, userContent\)/.test(cls), "runTurn is the shared agent loop");
ok(/webSocketMessage[\s\S]{0,900}await this\.runTurn\(sid, userContent\)/.test(cls), "the WebSocket path delegates to runTurn (no duplicated loop)");
ok((cls.match(/callDeepSeek\(this\.env, messages/g) || []).length === 2, "exactly two model calls in runTurn (loop + final no-tools round)");

const manifest = src.slice(src.indexOf("function manifest()"), src.indexOf("function manifest()") + 4000);
ok(/"agent-http-rpc"/.test(manifest), "capability agent-http-rpc advertised");
ok(/"tool-bridge"/.test(manifest), "capability tool-bridge advertised");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
