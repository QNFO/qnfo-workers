// AUTOROUTER-EVAL-1.2 offline suite: the hourly worker-health run replays the Auto Router shadow once per UTC day through the QNFO_AI binding.
// Slices autorouterShadowDaily out of worker.js and runs it against fakes. Run: node qnfo-cloud-ops/autorouter-shadow-daily.test.mjs -> "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const a = src.indexOf("async function autorouterShadowDaily(env) {"), b = src.indexOf("\n__name(autorouterShadowDaily", a);
if (a < 0 || b < a) throw new Error("autorouterShadowDaily not found");
const events = [];
const make = new Function("recordEvent", "rndB36", "VERSION", "WORKER_NAME", "__name", src.slice(a, b) + "\nreturn autorouterShadowDaily;");
const run = make(async (env, kind, id, text, meta) => { events.push({ kind, id, text, meta }); }, () => "abc123", "9.9.9", "qnfo-cloud-ops", () => {});

function envWith({ cfg = null, seen = null, ai } = {}) {
  return {
    QNFO_AI: ai,
    AUDIT: { prepare(sql) { const q = { bind() { return q; }, async first() { return /ops_config/.test(sql) ? cfg : /cloud_ops_events/.test(sql) ? seen : null; } }; return q; } }
  };
}
const calls = [];
const aiOk = { async fetch(url, init) { calls.push({ url, init }); return new Response(JSON.stringify({ ok: true, count: 3, results: [1, 2, 3] }), { status: 200 }); } };

let r = await run(envWith({ ai: aiOk }));
ok(r.ran === true && r.ok === true && calls.length === 1, "a day with no shadow event calls the route once", r);
ok(calls[0].url === "https://ai.qnfo.org/internal/eval/autorouter-shadow" && calls[0].init.method === "POST" && JSON.parse(calls[0].init.body).confirm === true && JSON.parse(calls[0].init.body).limit === 3, "POST with confirm true and limit 3", calls[0]);
ok(events.length === 1 && events[0].kind === "autorouter-shadow-run" && events[0].meta.status === "ok" && events[0].meta.counts.results === 3, "the answer is written as an autorouter-shadow-run event", events[0]);

r = await run(envWith({ ai: aiOk, seen: { x: 1 } }));
ok(r.ran === false && calls.length === 1 && events.length === 1, "an autorouter-shadow event of the same UTC day gates the call", r);
r = await run(envWith({ ai: aiOk, cfg: { value: "off" } }));
ok(r.ran === false && calls.length === 1, "ops_config autorouter_shadow_daily = off skips it", r);
r = await run(envWith({}));
ok(r.ran === false, "no QNFO_AI binding is a skip, not an error", r);
const aiDown = { async fetch() { throw new Error("boom"); } };
r = await run(envWith({ ai: aiDown }));
ok(r.ran === true && r.ok === false && events[events.length - 1].meta.status === "error" && /boom/.test(events[events.length - 1].meta.error), "a failing call is recorded and never throws", r);
const ai500 = { async fetch() { return new Response(JSON.stringify({ ok: false, error: "shadow evaluation unavailable" }), { status: 500 }); } };
r = await run(envWith({ ai: ai500 }));
ok(r.ran === true && r.ok === false && events[events.length - 1].meta.http === 500, "an error answer is recorded with its status", r);
ok(/try \{ await autorouterShadowDaily\(env\); \}/.test(src), "jobWorkerHealth calls it inside a try");
ok(/AUTOROUTER-EVAL-1\.2/.test(src), "the marker AUTOROUTER-EVAL-1.2 is in the worker");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
