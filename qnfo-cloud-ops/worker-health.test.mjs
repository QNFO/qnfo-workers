// HEALTH-KEYLESS-1 offline suite (qnfo-cloud-ops 1.18.3).
// Slices jobWorkerHealth out of the real worker.js and runs it with stubbed fetch, digest and event helpers. Proves:
// no probe sends an Authorization header or reads ROUTER_AUTH_KEY / PL_API_KEY (both stale since the 2026-10-01
// rotation, which made every run fail on 401); qnfo-ai's chat route is reached through the QNFO_AI service binding
// (qnfo-ai authenticates it by props.caller); personal-api is checked at its keyless /v1/models; a run with every probe
// answering 200 is ok; a probe whose binding is not installed yet is skipped, never sent unauthenticated; a real
// failure still fails the run and raises the alert.
// Run: node qnfo-cloud-ops/worker-health.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("async function jobWorkerHealth(env)"), b = src.indexOf('__name(jobWorkerHealth, "jobWorkerHealth");');
if (a < 0 || b < a) throw new Error("jobWorkerHealth not found in worker.js");
const body = src.slice(a, b);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

function load(fetchStub) {
  const events = [], digests = [];
  const job = new Function("fetchStub", "events", "digests",
    "var NL = '\\n';\n" +
    "var fetch = function(u, o) { return fetchStub('global', u, o); };\n" +
    "async function sendDigest(env, subject, text) { digests.push({ subject, text }); return { stored: true }; }\n" +
    "async function recordEvent(env, kind, id, text, meta) { events.push({ kind, id, text, meta }); }\n" +
    body + "\nreturn jobWorkerHealth;")(fetchStub, events, digests);
  return { job, events, digests };
}
const audit = { prepare() { const q = { bind() { return q; }, async run() { return {}; }, async all() { return { results: [] }; } }; return q; } };
const STALE = "stale-key-that-must-not-be-sent";

function harness(responder, withBinding = true) {
  const calls = [];
  const fetchStub = async (via, u, o) => {
    calls.push({ via, url: String(u), headers: (o && o.headers) || {}, method: (o && o.method) || "GET" });
    return responder(via, String(u), o);
  };
  const env = { AUDIT: audit, ROUTER_AUTH_KEY: STALE, PL_API_KEY: STALE };
  if (withBinding) env.QNFO_AI = { fetch: (u, o) => fetchStub("QNFO_AI", u, o) };
  return { calls, env, ...load(fetchStub) };
}
const allOk = () => new Response(JSON.stringify({ choices: [{ message: { content: "pong" } }], data: [] }), { status: 200 });

// A. every probe answers: the run is ok and no key is sent anywhere.
{
  const h = harness(allOk);
  const out = await h.job(h.env);
  ok(out.status === "ok", "A all probes 200 -> ok, got " + out.status + " " + JSON.stringify(out.notes.failed));
  ok(h.calls.every((c) => !Object.keys(c.headers).some((k) => k.toLowerCase() === "authorization")), "A no probe sends an Authorization header");
  ok(!JSON.stringify(h.calls).includes(STALE), "A the stale key copies are never sent");
  const chat = h.calls.find((c) => /\/v1\/chat\/completions$/.test(c.url));
  ok(chat && chat.via === "QNFO_AI" && chat.method === "POST", "A qnfo-ai chat goes through the QNFO_AI binding");
  ok(h.calls.some((c) => c.via === "global" && c.url === "https://personal.qnfo.org/v1/models" && c.method === "GET"), "A personal-api is checked at its keyless /v1/models");
  ok(!h.calls.some((c) => c.url === "https://personal.qnfo.org/v1/chat/completions"), "A personal-api chat (keyed) is no longer probed");
  ok(h.events.some((e) => /worker-health ok 5 endpoints/.test(e.text)), "A ok event names 5 endpoints");
}

// B. the binding is not installed yet: the chat probe is skipped, not sent unauthenticated over the public route.
{
  const h = harness(allOk, false);
  const out = await h.job(h.env);
  ok(out.status === "ok" && out.notes.skipped.length === 1 && out.notes.skipped[0].worker === "qnfo-ai-chat", "B missing binding -> chat probe skipped: " + JSON.stringify(out.notes.skipped));
  ok(!h.calls.some((c) => /chat\/completions/.test(c.url)), "B no unauthenticated chat request");
}

// C. a real failure still fails the run and raises the alert digest.
{
  const h = harness((via, u) => (/ideas\.qnfo\.org/.test(u) ? new Response("down", { status: 502 }) : allOk()));
  const out = await h.job(h.env);
  ok(out.status === "error" && out.notes.failed.length === 1 && out.notes.failed[0].worker === "qnfo-idea-factory", "C one failing endpoint fails the run");
  ok(h.digests.length === 1 && /qnfo-idea-factory -> HTTP 502/.test(h.digests[0].text), "C the alert digest names the failure");
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
