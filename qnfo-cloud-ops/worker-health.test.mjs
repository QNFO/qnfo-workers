// WORKER-HEALTH-PROBE-AUTH-1 + GMAIL-TRIAGE-UNCONFIGURED-1 offline suite (qnfo-cloud-ops 1.18.2). Replays jobWorkerHealth
// and the GMAIL_PASS guard of jobGmailTriage from worker.js with stubbed fetch, service binding and D1. Proves: the qnfo-ai
// chat probe goes through the QNFO_AI binding with no Authorization header (props auth, #1703); a probe whose credential the
// worker does not hold is skipped with its reason and never sent as "Bearer " (the 401 false alarm since 2026-09-30); a real
// failure (5xx, timeout, 401 with a key that is set) is still an error that alerts and mails the digest; the job writes no
// job-run row of its own (its caller records one), and failed/skipped lead the notes so the 300-char job-run text keeps them.
// Run: node qnfo-cloud-ops/worker-health.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
function slice(start, end) {
  const a = src.indexOf(start), b = src.indexOf(end, a);
  if (a < 0 || b < a) throw new Error("block not found in worker.js: " + start);
  return src.slice(a, b + end.length);
}
const VERSION = (/var VERSION = "([^"]+)"/.exec(src) || [])[1];
const healthSrc = slice("function workerHealthEndpoints(env, UA)", '__name(jobWorkerHealth, "jobWorkerHealth");');
const gmailGuard = slice("async function jobGmailTriage(env) {", "const out = { checked: 0").replace(/const out = \{ checked: 0$/, "");

const log = { fetch: [], digests: [], events: [], alerts: [], invocations: [] };
let respond = async () => new Response("{}", { status: 200 });
const api = new Function("NL", "fetchStub", "log",
  "var __name = function(f) { return f; };\n" +
  "var fetch = function(u, i) { return fetchStub(u, i, 'public'); };\n" +
  "async function sendDigest(env, subject, text) { log.digests.push({ subject: subject, text: text }); return { sent: true }; }\n" +
  "async function recordEvent() { log.events.push(Array.from(arguments).slice(1)); }\n" +
  healthSrc + "\n" + gmailGuard + " return { status: 'would-run' }; }\n" +
  "return { jobWorkerHealth, workerHealthEndpoints, jobGmailTriage };"
)("\n", (u, i, via) => { log.fetch.push({ u: String(u), i, via }); return respond(String(u), i, via); }, log);

const AUDIT = {
  prepare(sql) {
    return { bind(...a) { return { async run() { if (/INTO alerts/.test(sql)) log.alerts.push(a); if (/INTO worker_invocations/.test(sql)) log.invocations.push(a); return { success: true }; } }; } };
  }
};
const binding = { fetch: (u, i) => { log.fetch.push({ u: String(u), i, via: "binding" }); return respond(String(u), i, "binding"); } };
const reset = () => { for (const k of Object.keys(log)) log[k].length = 0; };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

ok(/^1\.(18\.([2-9]|[1-9][0-9])|(19|[2-9][0-9])\.\d+)-/.test(VERSION), "VERSION is bumped (" + VERSION + ")");

// 1. This worker as it is live: QNFO_AI binding (after this deploy), no ROUTER_AUTH_KEY, no PL_API_KEY.
reset();
respond = async (u) => new Response(/chat\/completions/.test(u) ? '{"choices":[{"message":{"content":"pong"}}]}' : '{"ok":true}', { status: 200 });
let out = await api.jobWorkerHealth({ AUDIT, QNFO_AI: binding });
const aiChat = log.fetch.find((f) => /ai\.qnfo\.org\/v1\/chat/.test(f.u));
ok(aiChat && aiChat.via === "binding", "the qnfo-ai chat probe goes through the QNFO_AI service binding");
ok(aiChat && !("Authorization" in aiChat.i.headers), "and sends no Authorization header (qnfo-ai authenticates the binding's props caller)");
ok(!log.fetch.some((f) => /personal\.qnfo\.org\/v1\/chat/.test(f.u)), "personal-api chat is not probed without PL_API_KEY");
ok(!log.fetch.some((f) => f.i && f.i.headers && f.i.headers.Authorization === "Bearer "), "no probe is ever sent with an empty bearer");
ok(out.status === "ok" && out.notes.failed.length === 0 && out.notes.checks.length === 4, "4 probes pass, status ok (" + JSON.stringify(out.notes) + ")");
ok(out.notes.skipped.length === 1 && out.notes.skipped[0].worker === "personal-api-chat" && /PL_API_KEY/.test(out.notes.skipped[0].reason), "the skipped probe is named with its reason");
ok(log.alerts.length === 0 && log.digests.length === 0, "a skipped probe raises no alert and mails nothing");
ok(log.events.length === 0, "the job writes no job-run row itself (the dispatcher records exactly one)");
ok(Object.keys(out.notes).join(",") === "failed,skipped,checks", "failed and skipped lead the notes (they survive the 300-char job-run text)");

// 2. No binding and no key at all: the qnfo-ai chat probe is skipped too, never sent.
reset();
out = await api.jobWorkerHealth({ AUDIT });
ok(out.status === "ok" && out.notes.skipped.map((s) => s.worker).sort().join(",") === "personal-api-chat,qnfo-ai-chat" && log.fetch.length === 3, "no binding, no key: both chat probes skipped, the three /health probes still run");

// 3. Keys that ARE set but rejected stay real failures (key drift is not hidden).
reset();
respond = async (u) => (/chat\/completions/.test(u) ? new Response('{"error":"Unauthorized"}', { status: 401 }) : new Response('{"ok":true}', { status: 200 }));
out = await api.jobWorkerHealth({ AUDIT, ROUTER_AUTH_KEY: "stale", PL_API_KEY: "stale" });
ok(out.status === "error" && out.notes.failed.length === 2 && out.notes.failed.every((f) => f.status === 401), "a set-but-rejected key is still an error (" + JSON.stringify(out.notes.failed) + ")");
ok(log.fetch.find((f) => /ai\.qnfo\.org\/v1\/chat/.test(f.u)).i.headers.Authorization === "Bearer stale", "without the binding, a held ROUTER_AUTH_KEY is still used");
ok(log.alerts.length === 1 && log.digests.length === 1 && /FAILED/.test(log.digests[0].text), "a real failure still writes an alerts row and mails the digest");
ok(JSON.stringify(out.notes).slice(0, 300).indexOf("qnfo-ai-chat") >= 0, "the failure detail is inside the first 300 characters of the notes");

// 4. An endpoint that is down is an error whatever the credential.
reset();
respond = async (u) => (/ideas\.qnfo\.org/.test(u) ? new Response("bad gateway", { status: 502 }) : /chat\/completions/.test(u) ? new Response('{"choices":[]}', { status: 200 }) : new Response("{}", { status: 200 }));
out = await api.jobWorkerHealth({ AUDIT, QNFO_AI: binding });
ok(out.status === "error" && out.notes.failed.length === 1 && out.notes.failed[0].worker === "qnfo-idea-factory" && out.notes.failed[0].status === 502, "a 502 on a public /health is a failure");
reset();
respond = async () => { throw new Error("The operation was aborted due to timeout"); };
out = await api.jobWorkerHealth({ AUDIT, QNFO_AI: binding });
ok(out.status === "error" && out.notes.failed.length === 4 && out.notes.failed.every((f) => f.status === 0 && /aborted/.test(f.error)), "a timeout on every probed endpoint is a failure on each");
ok(log.invocations.length === 4, "each probed endpoint still writes one worker_invocations row (skipped ones write none)");

// 5. GMAIL-TRIAGE-UNCONFIGURED-1
const g = await api.jobGmailTriage({ AUDIT });
ok(g.status === "skipped" && /GMAIL_PASS/.test(g.notes.reason), "gmail-triage without GMAIL_PASS is skipped with the reason, not an error");
ok((await api.jobGmailTriage({ AUDIT, GMAIL_PASS: "x" })).status === "would-run", "with GMAIL_PASS set the guard lets the triage run");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
