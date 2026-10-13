// CRON-ONLY-HEARTBEAT-1 offline suite (agent_issues 2397): scheduled() upserts the qnfo-ai-search fleet_heartbeat row once,
// after the tick finishes, ok=1 on success, ok=0 when the tick throws, and a failing heartbeat write never throws out.
// Run: node qnfo-ai-search/cron-heartbeat.test.mjs   (Node 22)
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { versionAtLeast } from "../scripts/version-at-least.mjs";

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
function ok(c, m) { if (c) { passed++; } else { failed++; console.log("FAIL " + m); } }

const src = readFileSync(join(here, "worker.js"), "utf8");
const VERSION = /var VERSION = "([^"]*)"/.exec(src)[1];
ok(versionAtLeast(VERSION, "2.6.0"), "VERSION is at least 2.6.0 (VERSION-PIN-TESTS-1): " + VERSION);
ok(src.includes("CRON-ONLY-HEARTBEAT-1") && src.includes("INSERT INTO fleet_heartbeat (worker, version, ts, ok)"), "source carries the heartbeat upsert");

let n = 0;
async function load() {
  const dir = mkdtempSync(join(tmpdir(), "cronhb-"));
  writeFileSync(join(dir, "w" + (n++) + ".mjs"), src);
  return (await import(pathToFileURL(join(dir, "w" + (n - 1) + ".mjs")).href)).default;
}
// Fake D1: records every prepare/bind; the schema batch fails when failTick, the heartbeat write fails when failBeat.
function fakeEnv({ failTick, failBeat }) {
  const calls = [], order = [];
  const D1 = {
    prepare(sql) {
      const c = { sql, args: null };
      const s = {
        bind(...a) { c.args = a; return s; },
        async run() { if (/fleet_heartbeat/.test(sql)) { order.push("beat"); if (failBeat) throw new Error("D1 down"); calls.push(c); } return { meta: { changes: 1 } }; },
        async first() { return null; },
        async all() { return { results: [] }; },
      };
      return s;
    },
    async batch() { order.push("tick"); if (failTick) throw new Error("tick exploded"); return []; },
  };
  return { env: { QNFO_AUDIT: D1 }, calls, order };
}
async function run(opts) {
  const worker = await load();
  const f = fakeEnv(opts);
  const waits = [], ctx = { waitUntil: (p) => waits.push(p) };
  const errs = [], orig = console.error;
  console.error = (...a) => errs.push(a.join(" "));
  let threw = null;
  try { await worker.scheduled({ scheduledTime: Date.UTC(2026, 9, 13, 5, 41) }, f.env, ctx); await Promise.all(waits); } catch (e) { threw = e; }
  finally { console.error = orig; }
  return { ...f, threw, errs };
}

const good = await run({});
ok(!good.threw && good.calls.length === 1, "a successful run writes the heartbeat once");
const a = good.calls[0] && good.calls[0].args || [];
ok(a[0] === "qnfo-ai-search" && a[1] === VERSION && !Number.isNaN(Date.parse(a[2])) && new Date(a[2]).toISOString() === a[2] && a[3] === 1, "args are (worker, VERSION, ISO ts, ok=1)");
ok(/ON CONFLICT\(worker\) DO UPDATE SET version=excluded.version, ts=excluded.ts, ok=excluded.ok/.test(good.calls[0].sql), "the write is an upsert on worker");
ok(good.order.indexOf("tick") !== -1 && good.order.lastIndexOf("beat") > good.order.lastIndexOf("tick"), "the heartbeat is written after the tick's work");

const bad = await run({ failTick: true });
ok(!bad.threw && bad.calls.length === 1 && bad.calls[0].args[3] === 0, "when the tick throws, the heartbeat is written once with ok=0 and scheduled() does not throw");
ok(bad.errs.some((e) => /tick/.test(e) && /qnfo-ai-search/.test(e)), "the tick failure is logged with console.error");

const dead = await run({ failBeat: true });
ok(!dead.threw, "a D1 failure on the heartbeat write does not throw out of scheduled()");
ok(dead.errs.some((e) => /write_failed/.test(e)), "the heartbeat failure is logged with console.error");

console.log("cron-heartbeat: " + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
