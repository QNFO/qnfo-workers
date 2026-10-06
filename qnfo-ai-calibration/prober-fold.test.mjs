// PROBER-FOLD-1 (qnfo-ai-calibration 1.3.0, agent_issues 1756) offline suite. No network, no production data.
// Proves: the ai-health-prober code runs unchanged as the member proberMod (only its version constant and its limitation
// text differ from ai-health-prober/worker.js); the */20 cron runs the prober and not the calibration, the */30 cron runs
// the calibration and not the prober; the member still writes as "ai-health-prober" with the member version; /prober/health
// and /prober/freshness are public, /prober/run needs the calibration key and spends nothing without it; /health lists the
// member and both crons; wrangler.toml declares both crons and the AI binding.
// Run: node qnfo-ai-calibration/prober-fold.test.mjs   -> prints "N passed, 0 failed"
import fs from "node:fs";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const prober = fs.readFileSync(new URL("../ai-health-prober/worker.js", import.meta.url), "utf8");
const toml = fs.readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
const api = new Function(src.replace(/export \{\s*worker_default as default\s*\};?/, "") +
  "\nreturn { worker_default, proberMod, PROBER_CRON, PROBER_VERSION, VERSION };")();
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (extra !== undefined ? " :: " + JSON.stringify(extra).slice(0, 300) : "")); } };

// 1. the member is the prober's code
{
  const lines = prober.split("\n");
  const body = lines.slice(lines.indexOf('var WORKER = "ai-health-prober";'), lines.indexOf("export {"));
  const changed = body.filter((l) => l.trim() && !src.includes(l.trim()));
  ok(changed.length === 2 && changed.some((l) => l.startsWith("var VERSION = ")) && changed.some((l) => l.startsWith("var LIMS = ")), "every prober line is in the host except its VERSION and LIMS lines", changed.map((l) => l.slice(0, 60)));
  ok(/^1\.3\.0/.test(api.VERSION) && api.PROBER_VERSION === "2.3.15-folded" && api.PROBER_CRON === "*/20 * * * *", "host 1.3.0, member 2.3.15-folded, member cron */20");
  ok((src.match(/var VERSION = "/g) || []).length === 1, "one quoted VERSION constant in the bundle (FM7 parity applies to the host)");
}

// a recording D1 and AI
function mkEnv() {
  const sql = [], ai = [];
  const stmt = (q) => { let a = []; const s = { bind(...x) { a = x; return s; }, async run() { sql.push({ q, a }); return { success: true, meta: { changes: 1 } }; }, async first() { sql.push({ q, a }); return null; }, async all() { sql.push({ q, a }); return { results: [] }; } }; return s; };
  const env = {
    QNFO_AUDIT: { prepare: stmt, batch: async (xs) => xs.map(() => ({ results: [] })) },
    AI: { async run(model, input) { ai.push(model); return { response: "ok", data: [[0.1, 0.2]] }; } },
    QNFO_AI: { async fetch() { return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }], data: [] }), { status: 200 }); } },
    QNFO_OPS: { async fetch() { return new Response("{}", { status: 200 }); } },
    PT_API: { async fetch() { return new Response("{}", { status: 200 }); } },
    QNFO_ROUTER_KEY: "calib-key"
  };
  return { env, sql, ai };
}
globalThis.fetch = async () => new Response("{}", { status: 200 });
const runCron = async (cron) => {
  const t = mkEnv(); const waits = [];
  await api.worker_default.scheduled({ cron, scheduledTime: Date.now() }, t.env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits.map((p) => p.catch(() => {})));
  return t;
};

// 2. cron dispatch
{
  const t = await runCron("*/20 * * * *");
  const hb = t.sql.find((x) => /INSERT INTO fleet_heartbeat/.test(x.q));
  ok(hb && hb.a[0] === "ai-health-prober" && hb.a[1] === "2.3.15-folded", "*/20 runs the prober member: heartbeat as ai-health-prober with the member version", hb && hb.a);
  ok(!t.sql.some((x) => /ai_calibration_(runs|results)/.test(x.q)), "*/20 does not run the calibration");
}
{
  const t = await runCron("*/30 * * * *");
  ok(t.sql.some((x) => /ai_calibration_(runs|results)/.test(x.q)), "*/30 runs the calibration");
  ok(!t.sql.some((x) => /INSERT INTO fleet_heartbeat/.test(x.q) && x.a[0] === "ai-health-prober"), "*/30 does not run the prober");
}

// 3. routes
const get = (path, headers, envv) => api.worker_default.fetch(new Request("https://qnfo-ai-calibration.q08.workers.dev" + path, { headers: headers || {} }), envv || mkEnv().env, { waitUntil() {} });
{
  const r = await get("/prober/health"); const j = await r.json();
  ok(r.status === 200 && j.worker === "ai-health-prober" && j.version === "2.3.15-folded" && /inside qnfo-ai-calibration/.test(j.limitations[0]), "/prober/health answers as the member", j);
  const f = await get("/prober/freshness");
  ok(f.status === 200, "/prober/freshness is public", f.status);
  const t = mkEnv();
  const run = await get("/prober/run", {}, t.env);
  ok(run.status === 401 && t.ai.length === 0, "/prober/run without the key is refused and calls no model", [run.status, t.ai.length]);
  const t2 = mkEnv();
  const run2 = await get("/prober/run", { Authorization: "Bearer calib-key" }, t2.env);
  ok(run2.status === 200, "/prober/run with the calibration key runs", run2.status);
  ok((await get("/prober/other")).status === 404, "other /prober paths are 404");
  const h = await (await get("/health")).json();
  ok(h.version === api.VERSION && h.members && h.members["ai-health-prober"] === "2.3.15-folded" && h.crons.includes("*/20 * * * *") && h.crons.includes("*/30 * * * *"), "/health lists the member and both crons", h);
}

// 4. wrangler
ok(/crons = \["\*\/30 \* \* \* \*", "\*\/20 \* \* \* \*"\]/.test(toml) && /\n\[ai\]\nbinding = "AI"/.test(toml), "wrangler.toml declares both crons and the AI binding");
ok(fs.existsSync(new URL("../ai-health-prober/FOLDED", import.meta.url)), "ai-health-prober carries a FOLDED marker");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
