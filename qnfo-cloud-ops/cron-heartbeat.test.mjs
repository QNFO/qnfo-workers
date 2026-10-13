// CRON-ONLY-HEARTBEAT-1 (qnfo-cloud-ops 1.27.0, agent_issues 2397) offline suite. The worker imports cloudflare:sockets, so the helper is
// cut out of worker.js and run in a vm against a fake AUDIT binding, and the three call sites are pinned by their source text. Proves:
// the upsert is the production statement with (worker, VERSION, ISO ts, ok); a failing write never throws; the tick path writes after its
// jobs settled (ok 0 when one rejected); the legacy per-slot trigger paths write too; the folded email-orchestrator row is untouched.
// Run: node qnfo-cloud-ops/cron-heartbeat.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { versionAtLeast } from "../scripts/version-at-least.mjs";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

const a = src.indexOf("async function cronHeartbeat(env, ok) {");
const b = src.indexOf('__name(cronHeartbeat, "cronHeartbeat");');
if (a < 0 || b < a) throw new Error("cronHeartbeat not found in worker.js");
const VERSION = /var VERSION = "([^"]+)"/.exec(src)[1];
const errors = [];
const sandbox = { VERSION, Date, String, JSON, console: { error: (x) => errors.push(String(x)) } };
vm.createContext(sandbox);
vm.runInContext(src.slice(a, b) + "\n__export = { cronHeartbeat };", sandbox);
const { cronHeartbeat } = sandbox.__export;

const fakeEnv = (mode, log) => ({ AUDIT: { prepare(sql) {
  if (mode === "throw-prepare") throw new Error("d1 down");
  return { bind(...x) { return { async run() { if (mode === "reject") throw new Error("d1 reject"); log.push({ sql, x }); } }; } };
} } });

// the helper
{
  const log = [];
  await cronHeartbeat(fakeEnv("ok", log), 1);
  ok(log.length === 1, "one upsert per call", log.length);
  const w = log[0];
  ok(/^INSERT INTO fleet_heartbeat \(worker, version, ts, ok\) VALUES \(\?1, \?2, \?3, \?4\) ON CONFLICT\(worker\) DO UPDATE SET version=excluded\.version, ts=excluded\.ts, ok=excluded\.ok$/.test(w.sql), "the production statement, keyed on worker", w.sql);
  ok(w.x[0] === "qnfo-cloud-ops" && w.x[1] === VERSION && new Date(w.x[2]).toISOString() === w.x[2] && w.x[3] === 1, "args are (qnfo-cloud-ops, VERSION, ISO ts, ok=1)", w.x);
  const log0 = [];
  await cronHeartbeat(fakeEnv("ok", log0), 0);
  ok(log0[0].x[3] === 0, "ok=0 is written as 0");
  for (const mode of ["throw-prepare", "reject"]) {
    errors.length = 0;
    let threw = false;
    try { await cronHeartbeat(fakeEnv(mode, []), 1); } catch (e) { threw = true; }
    ok(!threw, "a D1 failure (" + mode + ") never throws out of the helper");
    ok(errors.length === 1 && /fleet-heartbeat-write-failed/.test(errors[0]), "and is logged once as a structured line (" + mode + ")", errors);
  }
  let threw = false;
  try { await cronHeartbeat({}, 1); } catch (e) { threw = true; }
  ok(!threw, "a missing AUDIT binding does not throw");
}

// the call sites
{
  const s = src.indexOf("var worker_default = {");
  const body = src.slice(s, src.indexOf("async fetch(request, env, ctx) {", s));
  ok(/const settled = await Promise\.allSettled\(runs\);\s*await cronHeartbeat\(env, settled\.every\(\(r\) => r\.status === "fulfilled"\) \? 1 : 0\);/.test(body), "the tick path writes after its jobs settled, ok 0 when one rejected");
  ok(/await runScheduledJob\(env, job\);\s*await cronHeartbeat\(env, 1\);\s*return;/.test(body), "the legacy per-slot trigger path writes after its job");
  ok(/console\.log\("no job for cron", cron, "offset", off\);[\s\S]*?await cronHeartbeat\(env, 1\);\s*return;/.test(body), "the legacy path with no mapped job writes too");
  ok((body.match(/await cronHeartbeat\(/g) || []).length === 3, "exactly three call sites");
  ok(/runs\.push\(runEmailOrchMember\(env, ctx, at\)\);/.test(body), "the folded email-orchestrator member still runs on the tick");
}

// the folded member keeps publishing its own row, under its own name
ok(/\.bind\("qnfo-email-orchestrator", VERSION/.test(src), "the folded member's own heartbeat row is untouched");
ok(versionAtLeast(VERSION, "1.27.0"), "VERSION is at least 1.27.0 (a new cron step is a minor bump)", VERSION);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
