// RESEARCH-WATCHDOG-HELD-1 (qnfo-cloud-ops 1.40.1, agent_issues 100623): a stage held by the daily neuron budget (COST-SUSTAIN-1) is a refusal by design, not a stall.
// Measured 2026-10-26: the budget was spent at 04:11Z, the executor logged "daily budget exhausted" every tick, and the watchdog forced a stage six times an hour and recorded
// "no stage finished in 688 minutes" each time. This suite replays the pure decision and runs the real job against an in-memory ledger: a fresh hold suppresses the kick and
// writes no research-watchdog event, a stale hold (the executor's tick stopped) or no hold keeps the stall path, and the daily proof stage is unchanged.
// Run: node qnfo-cloud-ops/research-watchdog-held.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let fails = 0;
const check = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " -- " + JSON.stringify(x) : "")); if (!c) fails++; };

const a = src.indexOf("// ---- RESEARCH-WATCHDOG-1:BEGIN"), b = src.indexOf("// ---- RESEARCH-WATCHDOG-1:END");
check(a > 0 && b > a, "RESEARCH-WATCHDOG-1 pure block is marked");
const jobSrc = src.slice(src.indexOf("async function jobResearchExecWatchdog"), src.indexOf('__name(jobResearchExecWatchdog, "jobResearchExecWatchdog")'));
check(jobSrc.length > 500, "the job exists");

const ago = (min) => new Date(Date.now() - min * 6e4).toISOString();
const calls = [];
function makeEnv(o) {
  const events = (o.events || []).slice();
  const state = {};
  const env = {
    AUDIT: {
      prepare(sql) {
        return {
          bind() { return this; },
          run: async () => ({ meta: { changes: 0 } }),
          first: async () => {
            if (/FROM research_queue/.test(sql)) return { n: o.active };
            if (/kind = 'done'/.test(sql)) { const t = events.filter((e) => e.job === "qnfo-research-exec" && e.kind === "done").map((e) => e.ts).sort().pop(); return { t: t || null }; }
            if (/kind = 'research-watchdog'/.test(sql)) {
              const k = events.filter((e) => e.kind === "research-watchdog");
              const t = k.map((e) => e.ts).sort().pop();
              const ok = k.filter((e) => e.status === "ok").map((e) => e.ts).sort().pop();
              return { t: t || null, ok: ok || null };
            }
            if (/kind = 'research-budget'/.test(sql)) {
              if (o.heldReadError) throw new Error("D1 down");
              const t = events.filter((e) => e.kind === "research-budget" && /^daily budget exhausted/.test(e.text)).map((e) => e.ts).sort().pop();
              return { t: t || null };
            }
            if (/FROM research_exec_lease/.test(sql)) return null;
            return null;
          },
        };
      },
    },
  };
  env.RESEARCH_EXEC = { fetch: async (url, init) => { calls.push({ url, method: init.method }); return { status: 200, json: async () => ({ out: { stage: "held" } }) }; } };
  return { env, events, state };
}
async function run(o) {
  const led = makeEnv(o);
  const sandbox = {
    Date, Math, Number, JSON, String, Promise, Infinity, AbortController, setTimeout, clearTimeout, console,
    __name: () => {},
    stateGet: async (_e, k, fb) => (led.state[k] !== undefined ? led.state[k] : fb),
    stateSet: async (_e, k, v) => { led.state[k] = String(v); },
    recordEvent: async (_e, kind, id, text, meta) => { led.events.push({ kind, id, text, job: (meta || {}).job || null, status: (meta || {}).status || null, ts: new Date().toISOString(), meta }); },
  };
  vm.createContext(sandbox);
  vm.runInContext(src.slice(a, b) + "\n" + jobSrc + "\n__export = { researchWatchdogDecide, jobResearchExecWatchdog, RESEARCH_WATCHDOG_HELD_FRESH_MIN };", sandbox);
  calls.length = 0;
  const out = await sandbox.__export.jobResearchExecWatchdog(led.env);
  return { out, led, ex: sandbox.__export };
}

// ---- pure decision ----
{
  const { ex } = await run({ active: 0 });
  const d = ex.researchWatchdogDecide, now = Date.parse("2026-10-26T16:00:00Z"), m = (x) => now - x * 6e4;
  check(ex.RESEARCH_WATCHDOG_HELD_FRESH_MIN === 15, "a hold counts for 15 minutes (the executor ticks every 10)", ex.RESEARCH_WATCHDOG_HELD_FRESH_MIN);
  let r = d(192, m(688), m(60), m(10), now, m(1));
  check(!r.kick && r.reason === "budget-held", "work waits, no stage for 688 minutes, a hold logged a minute ago: no kick, reason budget-held", r);
  r = d(192, m(688), m(60), m(10), now, m(14));
  check(!r.kick && r.reason === "budget-held", "a hold 14 minutes old still counts (one missed tick)", r);
  r = d(192, m(688), m(60), m(10), now, m(16));
  check(r.kick && r.reason === "stalled", "a hold 16 minutes old is stale (the executor tick stopped): the stall path forces a stage", r);
  r = d(192, m(688), m(60), m(10), now, null);
  check(r.kick && r.reason === "stalled", "no hold on record: a stalled queue is kicked as before", r);
  r = d(192, m(688), m(60), m(10), now);
  check(r.kick && r.reason === "stalled", "the old five-argument call keeps its behaviour", r);
  r = d(192, m(10), m(60), m(10), now, m(1));
  check(!r.kick && r.reason === "armed", "a stage finished 10 minutes ago and a fresh hold: still armed", r);
  r = d(0, m(5), m(1441), m(1441), now, m(1));
  check(r.kick && r.reason === "proof", "the daily proof kick is not suppressed by a hold (the second path stays exercised)", r);
}

// ---- the real job ----
{
  const held = { kind: "research-budget", text: "daily budget exhausted: spent=405876 budget=360000 (COST-SUSTAIN-1; work resumes at 00:00 UTC)", status: "ok", ts: ago(2), job: "qnfo-research-exec" };
  const lastOk = { kind: "research-watchdog", status: "ok", ts: ago(60), text: "earlier forced stage" };
  let { out, led } = await run({ active: 192, events: [held, lastOk, { kind: "done", job: "qnfo-research-exec", ts: ago(688), text: "x" }] });
  check(calls.length === 0, "a fresh hold: no stage is forced through the service binding", calls);
  check(led.events.filter((e) => e.kind === "research-watchdog" && e.ts > lastOk.ts).length === 0, "a fresh hold: no research-watchdog event is written", led.events);
  check(out.status === "ok" && out.notes.reason === "budget-held" && /held by design/.test(out.notes.decision), "the state note says held by design", out.notes);
  check(out.notes.held_at && Date.parse(out.notes.held_at) > Date.now() - 5 * 6e4, "the state note carries when the hold was logged", out.notes);

  ({ out, led } = await run({ active: 192, events: [{ ...held, ts: ago(40) }, lastOk, { kind: "done", job: "qnfo-research-exec", ts: ago(688), text: "x" }] }));
  check(calls.length === 1 && led.events.some((e) => e.kind === "research-watchdog" && /no stage finished/.test(e.text)), "a hold 40 minutes old: the executor tick stopped, the stall path forces a stage", { calls: calls.length });

  ({ out, led } = await run({ active: 192, events: [lastOk, { kind: "done", job: "qnfo-research-exec", ts: ago(688), text: "x" }] }));
  check(calls.length === 1 && out.notes.reason === "stalled", "no hold at all: a stalled queue is forced as before", out.notes);

  ({ out, led } = await run({ active: 192, heldReadError: true, events: [lastOk, { kind: "done", job: "qnfo-research-exec", ts: ago(688), text: "x" }] }));
  check(calls.length === 1 && out.status === "ok", "an unreadable hold ledger never blocks the stall path", out);

  ({ out, led } = await run({ active: 192, events: [{ kind: "research-budget", text: "stages held: spent=1 pace=1", status: "ok", ts: ago(1), job: "qnfo-research-exec" }, lastOk, { kind: "done", job: "qnfo-research-exec", ts: ago(688), text: "x" }] }));
  check(calls.length === 1, "only the 'daily budget exhausted' event counts as a hold", { calls: calls.length });
}

// ---- wiring ----
check(/researchWatchdogDecide\(active, lastDone, lastOk, lastAny, now, heldAt\)/.test(src), "the job passes the hold to the decision");
const ver = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
check(ver && (Number(ver[1]) > 1 || (Number(ver[1]) === 1 && (Number(ver[2]) > 40 || (Number(ver[2]) === 40 && Number(ver[3]) >= 1)))), "VERSION is at least 1.40.1", ver && ver[0]);
check(readFileSync(join(here, "deployed-current.worker.js"), "utf8") === src, "deployed-current.worker.js mirrors worker.js");

console.log(fails ? "FAILED " + fails : "ALL PASS");
process.exit(fails ? 1 : 0);
