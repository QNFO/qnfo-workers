// CRON-ONLY-HEARTBEAT-1 (agent_issues 2397) offline suite for qnfo-intent-orchestrator.
// Proves: scheduled() upserts fleet_heartbeat once with (worker, VERSION, ISO ts, ok=1) after a successful run, ok=0 when the
// work throws (the 06:00 digest rethrows after the write) or the triage cron logs an error, and a failing heartbeat write never
// throws out of scheduled().
// Run: node qnfo-intent-orchestrator/cron-heartbeat.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const VERSION = /var VERSION = "([^"]*)"/.exec(src)[1];

let passed = 0, failed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("ok   " + name); } catch (e) { failed++; console.log("FAIL " + name + ": " + (e && e.message || e)); } };
const ok = (c, m) => { if (!c) throw new Error(m || "assertion"); };

// No network: the digest mail and the triage dispatch calls are answered here.
globalThis.fetch = async () => new Response("{}", { status: 200 });
const origError = console.error, origLog = console.log;

// Fake D1: records the heartbeat upserts; the work queries answer empty unless failWork is set; failHb makes the upsert reject.
function fakeEnv({ failWork = false, failHb = false } = {}) {
  const beats = [];
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => { if (failWork) throw new Error("d1 work down"); return { results: [] }; },
    first: async () => { if (failWork) throw new Error("d1 work down"); return { n: 0 }; },
    run: async () => {
      if (/fleet_heartbeat/.test(sql)) { if (failHb) throw new Error("d1 heartbeat down"); beats.push({ sql, args }); }
      else if (failWork) throw new Error("d1 work down");
      return { success: true };
    }
  });
  return { env: { D1: { prepare: (sql) => stmt(sql) } }, beats };
}
const quiet = async (fn) => { console.error = () => {}; console.log = () => {}; try { return await fn(); } finally { console.error = origError; console.log = origLog; } };

await t("source: the heartbeat upsert is in scheduled() after the work and names CRON-ONLY-HEARTBEAT-1", () => {
  const sched = src.slice(src.indexOf("async scheduled("), src.indexOf("async fetch("));
  ok(/CRON-ONLY-HEARTBEAT-1/.test(sched) && /agent_issues 2397/.test(sched), "marker");
  ok(sched.indexOf("fleet_heartbeat") > sched.indexOf("[triage-cron]"), "write must follow the work");
  ok(/ON CONFLICT\(worker\) DO UPDATE/.test(sched), "upsert");
  ok(/console\.error\("\[cron-heartbeat\]/.test(sched), "caught error logged");
});

await t("VERSION is at least 1.5.0", () => {
  const [a, b] = VERSION.split(".").map((x) => parseInt(x, 10));
  ok(a > 1 || (a === 1 && b >= 5), VERSION);
});

await t("triage cron success writes one heartbeat (worker, VERSION, ISO ts, ok=1)", async () => {
  const { env, beats } = fakeEnv();
  await quiet(() => worker.scheduled({ cron: "30 6 * * *" }, env));
  ok(beats.length === 1, "writes: " + beats.length);
  const [w, v, ts, okv] = beats[0].args;
  ok(w === "qnfo-intent-orchestrator" && v === VERSION, "worker/version");
  ok(new Date(ts).toISOString() === ts, "ISO ts " + ts);
  ok(okv === 1, "ok " + okv);
});

await t("triage cron error is logged and the heartbeat carries ok=0", async () => {
  const { env, beats } = fakeEnv({ failWork: true });
  await quiet(() => worker.scheduled({ cron: "30 6 * * *" }, env));
  ok(beats.length === 1 && beats[0].args[3] === 0, "ok=0 expected, got " + JSON.stringify(beats.map((b) => b.args)));
});

await t("digest cron success writes ok=1", async () => {
  const { env, beats } = fakeEnv();
  env.CF_TOKEN = "x"; env.CF_ACCOUNT = "a"; env.DIGEST_TO = "a@b.c"; env.DIGEST_FROM = "d@e.f";
  await quiet(() => worker.scheduled({ cron: "0 6 * * *" }, env));
  ok(beats.length === 1 && beats[0].args[3] === 1, JSON.stringify(beats.map((b) => b.args)));
});

await t("digest cron work throwing: heartbeat ok=0 is written and the error still propagates", async () => {
  const { env, beats } = fakeEnv();
  env.D1.prepare = (sql) => {
    if (/fleet_heartbeat/.test(sql)) return { bind: (...a) => ({ run: async () => { beats.push({ args: a }); } }) };
    throw new Error("work down");
  };
  let thrown = null;
  await quiet(async () => { try { await worker.scheduled({ cron: "0 6 * * *" }, env); } catch (e) { thrown = e; } });
  ok(thrown && /work down/.test(thrown.message), "the work error must propagate");
  ok(beats.length === 1 && beats[0].args[3] === 0, "ok=0 write: " + JSON.stringify(beats));
});

await t("a failing heartbeat write does not throw out of scheduled() and is logged", async () => {
  const { env, beats } = fakeEnv({ failHb: true });
  const errs = [];
  console.error = (...a) => errs.push(a.join(" ")); console.log = () => {};
  try { await worker.scheduled({ cron: "30 6 * * *" }, env); } finally { console.error = origError; console.log = origLog; }
  ok(beats.length === 0, "no row");
  ok(errs.some((e) => /cron-heartbeat/.test(e) && /heartbeat down/.test(e)), "logged: " + errs.join("|"));
});

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
