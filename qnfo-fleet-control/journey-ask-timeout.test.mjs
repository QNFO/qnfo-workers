// JRN-ASK-TIMEOUT-1 offline suite (qnfo-fleet-control 0.31.1, charter pillar: core; agent_issues 2574).
// Proves: jrnCall takes a per-call timeoutMs (the ask-path hop waits JRN_ASK_TIMEOUT_MS, 60 s, for an answer that streams 15-30 s) and
// never passes it on to fetch; the other hops keep JRN_TIMEOUT_MS; a body read cut by the timeout after the status arrived is marked
// timedOut, so the journey reports a timeout instead of "http 200, 0 events".
// Run: node qnfo-fleet-control/journey-ask-timeout.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };

const a = src.indexOf("async function jrnCall(env, j, binding, url, init) {"), b = src.indexOf("\n}\n", a);
ok(a > 0 && b > a, "jrnCall is present");
const mk = (timeoutMs) => new Function("JRN_TIMEOUT_MS", "JRN_TARGET", "JRN_UA", src.slice(a, b + 2) + "; return jrnCall;")(timeoutMs, {}, "test-ua");

// a stub service whose status arrives at once and whose body takes bodyMs, honouring the abort signal like a real stream
function slowSvc(bodyMs, seen) {
  return { fetch: async (url, init) => {
    seen.push(init);
    const text = () => new Promise((res, rej) => {
      const t = setTimeout(() => res("event: meta\ndata: {}\n\nevent: done\ndata: {}\n\n"), bodyMs);
      init.signal.addEventListener("abort", () => { clearTimeout(t); const e = new Error("aborted"); e.name = "AbortError"; rej(e); });
    });
    return { status: 200, text };
  } };
}

// 1. the default timeout cuts a slow stream after the 200: the result says timedOut, not just an empty body
let seen = [];
let call = mk(80);
let j = { path: [] };
let r = await call({ SVC: slowSvc(300, seen) }, j, "SVC", "https://ask.qwav.tech/api/ask", { method: "POST" });
ok(r.status === 200 && r.text === "" && r.timedOut === 80 && j.path[0].error === "timeout", "a stream cut by the timeout after its status is marked timedOut", r);

// 2. a per-call timeoutMs long enough lets the stream finish; it is not passed on to fetch
seen = [];
j = { path: [] };
r = await call({ SVC: slowSvc(150, seen) }, j, "SVC", "https://ask.qwav.tech/api/ask", { method: "POST", timeoutMs: 1000 });
ok(r.status === 200 && /event: done/.test(r.text) && !r.timedOut && !j.path[0].error, "a longer per-call timeout lets the answer finish streaming", r);
ok(seen[0] && !("timeoutMs" in seen[0]) && seen[0].method === "POST", "timeoutMs is not forwarded to fetch", Object.keys(seen[0] || {}));

// 3. a fast hop without timeoutMs keeps the default and is unaffected
seen = [];
j = { path: [] };
r = await mk(500)({ SVC: slowSvc(10, seen) }, j, "SVC", "https://x.internal/health");
ok(r.status === 200 && r.text.length > 0 && !r.timedOut, "a hop without timeoutMs keeps JRN_TIMEOUT_MS");

// 4. wiring
ok(/var JRN_ASK_TIMEOUT_MS = 60e3;/.test(src) && /var JRN_TIMEOUT_MS = 12e3;/.test(src), "the ask hop gets 60 s, every other hop keeps 12 s");
ok(/body: JSON\.stringify\(\{ query: JRN_ASK_QUERY \}\), timeoutMs: JRN_ASK_TIMEOUT_MS \}\);/.test(src), "jAskPath passes JRN_ASK_TIMEOUT_MS");
ok(/r\.timedOut \? " \(stream still open at the "/.test(src), "the ask-streams check names a timeout when the stream was cut");

const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 0 || ver[1] > 31 || (ver[1] === 31 && ver[2] >= 1)), "VERSION is at least 0.31.1", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
