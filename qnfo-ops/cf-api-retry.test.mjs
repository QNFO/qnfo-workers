// CF-API-RETRY-1 offline suite (qnfo-ops 2.43.1, agent_issues 2396). No network.
// Loads the real worker.js (the cloudflare:workers import swapped for stubs) and drives cfFetchRetry / cfRetryClass against a
// scripted fetch. Proves: a 429 or a 5xx or a 10013 body is retried with backoff (1 s, 2 s) and Retry-After wins when present
// (capped at 10 s); a network error is retried; a definite refusal (10021, 10020, any other 4xx) returns at once; after the last
// attempt the last answer is returned (or the network error thrown); the body is rebuilt for every attempt; a 2xx returns at
// once; the deploy function's four Cloudflare calls go through the helper.
// Run: node qnfo-ops/cf-api-retry.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";

const IMPORT = 'import { WorkflowEntrypoint, DurableObject } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (src.indexOf(IMPORT) < 0) throw new Error("worker.js import line changed: update the loader in this test");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {}; var DurableObject = class {};") +
  "\nexport { cfFetchRetry as __retry, cfRetryClass as __cls, CF_RETRY_MAX as __max };\n").toString("base64"));

const say = console.log.bind(console);
console.log = () => {};
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; say("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

// the pure classifier
ok(mod.__cls(200, "") === "ok" && mod.__cls(201, "{}") === "ok", "2xx is ok");
ok(mod.__cls(429, "") === "transient" && mod.__cls(500, "") === "transient" && mod.__cls(503, "x") === "transient", "429 and 5xx are transient");
ok(mod.__cls(400, JSON.stringify({ errors: [{ code: 10013, message: "workers.api.error.internal_server" }] })) === "transient", "a 10013 body is transient whatever the status");
ok(mod.__cls(400, JSON.stringify({ errors: [{ code: 10021, message: "Uncaught SyntaxError" }] })) === "fatal", "10021 is a definite refusal");
ok(mod.__cls(500, JSON.stringify({ errors: [{ code: 10020, message: "x" }] })) === "fatal", "10020 is fatal even on a 5xx status");
ok(mod.__cls(400, JSON.stringify({ errors: [{ code: 10144, message: "dangling" }] })) === "fatal" && mod.__cls(404, "") === "fatal", "other 4xx answers are not retried");

// scripted fetch
function script(answers) {
  const calls = [], sleeps = [];
  let i = 0;
  globalThis.fetch = async (u, o) => {
    calls.push({ url: String(u), method: o && o.method, body: o && o.body });
    const a = answers[Math.min(i++, answers.length - 1)];
    if (a instanceof Error) throw a;
    return new Response(a.body == null ? null : a.body, { status: a.status, headers: a.headers || {} });
  };
  return { calls, sleeps, sleep: async (ms) => { sleeps.push(ms); } };
}
const J = (codes) => JSON.stringify({ success: false, errors: codes.map((c) => ({ code: c, message: "m" })) });

// A. 429 then 200: two attempts, one backoff of 1 s
{
  const s = script([{ status: 429, body: J([]) }, { status: 200, body: "{\"success\":true}" }]);
  const r = await mod.__retry("https://api.cloudflare.com/x", { headers: {} }, { sleep: s.sleep });
  ok(r.status === 200 && s.calls.length === 2 && s.sleeps.join(",") === "1000", "A 429 then 200: retried once after 1 s", { n: s.calls.length, sleeps: s.sleeps });
}
// B. three 500s: three attempts, backoff 1 s then 2 s, the last 500 returned
{
  const s = script([{ status: 500, body: "" }]);
  const r = await mod.__retry("https://api.cloudflare.com/x", {}, { sleep: s.sleep });
  ok(r.status === 500 && s.calls.length === mod.__max && s.sleeps.join(",") === "1000,2000", "B persistent 5xx: max attempts, last answer returned", { n: s.calls.length, sleeps: s.sleeps });
}
// C. Retry-After wins, capped at 10 s
{
  const s = script([{ status: 429, body: "", headers: { "retry-after": "3" } }, { status: 429, body: "", headers: { "retry-after": "120" } }, { status: 200, body: "{}" }]);
  const r = await mod.__retry("https://api.cloudflare.com/x", {}, { sleep: s.sleep });
  ok(r.status === 200 && s.sleeps.join(",") === "3000,10000", "C Retry-After honoured and capped", s.sleeps);
}
// D. a 10013 body on a 400 is retried; a 10021 is not
{
  const s = script([{ status: 400, body: J([10013]) }, { status: 200, body: "{}" }]);
  const r = await mod.__retry("https://api.cloudflare.com/x", {}, { sleep: s.sleep });
  ok(r.status === 200 && s.calls.length === 2, "D 10013 retried", s.calls.length);
  const s2 = script([{ status: 400, body: J([10021]) }, { status: 200, body: "{}" }]);
  const r2 = await mod.__retry("https://api.cloudflare.com/x", {}, { sleep: s2.sleep });
  ok(r2.status === 400 && s2.calls.length === 1 && (await r2.json()).errors[0].code === 10021, "D 10021 returned at once with its body readable", s2.calls.length);
}
// E. a network error is retried; a persistent one is thrown after the last attempt
{
  const s = script([new Error("fetch failed"), { status: 200, body: "{}" }]);
  const r = await mod.__retry("https://api.cloudflare.com/x", {}, { sleep: s.sleep });
  ok(r.status === 200 && s.calls.length === 2, "E network error then 200", s.calls.length);
  const s2 = script([new Error("fetch failed")]);
  let threw = null;
  try { await mod.__retry("https://api.cloudflare.com/x", {}, { sleep: s2.sleep }); } catch (e) { threw = e; }
  ok(threw && /fetch failed/.test(String(threw.message)) && s2.calls.length === mod.__max, "E persistent network error thrown after max attempts", s2.calls.length);
}
// F. the body is rebuilt for every attempt and the init is not mutated
{
  let built = 0;
  const init = { method: "PUT", headers: { a: "b" } };
  const s = script([{ status: 503, body: "" }, { status: 200, body: "{}" }]);
  await mod.__retry("https://api.cloudflare.com/x", init, { sleep: s.sleep, body: () => "body-" + (++built) });
  ok(built === 2 && s.calls.map((c) => c.body).join(",") === "body-1,body-2" && !("body" in init), "F body rebuilt per attempt, init untouched", { built, bodies: s.calls.map((c) => c.body) });
}
// G. a 2xx returns at once with no sleep; the trace records attempts
{
  const s = script([{ status: 200, body: "{}" }]);
  const trace = [];
  const r = await mod.__retry("https://api.cloudflare.com/x", {}, { sleep: s.sleep, trace });
  ok(r.status === 200 && s.calls.length === 1 && s.sleeps.length === 0 && trace.length === 0, "G first answer ok: one call, no sleep");
  const s2 = script([{ status: 502, body: "" }, { status: 200, body: "{}" }]);
  const t2 = [];
  await mod.__retry("https://api.cloudflare.com/x", {}, { sleep: s2.sleep, trace: t2 });
  ok(t2.length === 1 && t2[0].status === 502 && t2[0].cls === "transient", "G the trace names the retried answer", t2);
}
// H. the deploy function routes its Cloudflare calls through the helper
{
  const i = src.indexOf("async function cfWorkerDeploy(");
  const body = src.slice(i, src.indexOf("\n__name(cfWorkerDeploy", i));
  const direct = (body.match(/await fetch\(/g) || []).length;
  const viaRetry = (body.match(/await cfFetchRetry\(/g) || []).length;
  ok(direct === 0 && viaRetry >= 4, "H every Cloudflare call in cfWorkerDeploy goes through cfFetchRetry (bindings, settings, PUT, re-uploads)", { direct, viaRetry });
  ok(/\{ body: _buildBody \}/.test(body), "H the PUT passes the body builder, not a built body");
}

say(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
