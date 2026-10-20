// RESEARCH-WATCHDOG-1 (qnfo-cloud-ops 1.33.0, agent_issues 2838 EVOLVE-1): qnfo-research-exec gets a second trigger path. Every tick the job forces one stage through the
// RESEARCH_EXEC service binding when the queue holds work and no stage finished in 30 minutes, and one proof stage a day. This suite replays the pure decision, runs the real job
// against an in-memory ledger (stalled, armed, proof, busy, error, missing binding), and checks the wiring (tick, JOBS, wrangler binding, mirror, minimum VERSION).
// Run: node qnfo-cloud-ops/research-exec-watchdog.test.mjs
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

// in-memory ledger
function makeEnv(o) {
  const events = (o.events || []).slice();
  const state = {};
  const env = {
    AUDIT: {
      prepare(sql) {
        return {
          first: async () => {
            if (o.readError) throw new Error("D1 down");
            if (/FROM research_queue/.test(sql)) return { n: o.active };
            if (/kind = 'done'/.test(sql)) { const t = events.filter((e) => e.job === "qnfo-research-exec" && e.kind === "done").map((e) => e.ts).sort().pop(); return { t: t || null }; }
            if (/kind = 'research-watchdog'/.test(sql)) { const k = events.filter((e) => e.kind === "research-watchdog"); const t = k.map((e) => e.ts).sort().pop(); const ok = k.filter((e) => e.status === "ok").map((e) => e.ts).sort().pop(); return { t: t || null, ok: ok || null }; }
            return null;
          },
        };
      },
    },
  };
  if (o.svc) env.RESEARCH_EXEC = o.svc;
  return { env, events, state };
}
const calls = [];
const mkSvc = (resp, throwErr) => ({ fetch: async (url, init) => { calls.push({ url, method: init.method }); if (throwErr) throw new Error(throwErr); return { status: resp.status, json: async () => resp.body }; } });
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
  vm.runInContext(src.slice(a, b) + "\n" + jobSrc + "\n__export = { researchWatchdogDecide, jobResearchExecWatchdog, RESEARCH_WATCHDOG_STALE_MIN, RESEARCH_WATCHDOG_PROOF_MIN };", sandbox);
  const out = await sandbox.__export.jobResearchExecWatchdog(led.env);
  return { out, led, ex: sandbox.__export };
}
const ago = (min) => new Date(Date.now() - min * 6e4).toISOString();

// ---- pure decision ----
{
  const { ex } = await run({ active: 0 });
  const d = ex.researchWatchdogDecide, now = Date.parse("2026-10-20T06:00:00Z"), m = (x) => now - x * 6e4;
  check(ex.RESEARCH_WATCHDOG_STALE_MIN === 30, "the stall window is the issue's 30 minutes", ex.RESEARCH_WATCHDOG_STALE_MIN);
  check(ex.RESEARCH_WATCHDOG_STALE_MIN + 10 <= 120 && ex.RESEARCH_WATCHDOG_PROOF_MIN + 120 <= 1560, "windows plus a tick stay inside the 120-minute SLA and the daily proof inside 1560 minutes");
  check(d(5, m(10), m(60), m(60), now).kick === false && d(5, m(10), m(60), m(60), now).reason === "armed", "work waits but a stage finished 10 minutes ago: armed, no kick");
  let r = d(5, m(31), m(60), m(60), now); check(r.kick && r.reason === "stalled", "work waits and the last stage finished 31 minutes ago: stalled kick", r);
  r = d(5, m(31), m(60), m(3), now); check(!r.kick && r.reason === "wait", "a stalled queue is not kicked twice inside 5 minutes", r);
  r = d(0, m(300), m(60), m(60), now); check(!r.kick, "an empty queue with a quiet research-exec is not a stall");
  r = d(3, null, m(60), m(60), now); check(r.kick && r.reason === "stalled", "work waits and no stage was ever seen: stalled kick", r);
  r = d(0, m(5), m(1441), m(1441), now); check(r.kick && r.reason === "proof", "no forced stage in 1441 minutes: the daily proof kick", r);
  r = d(0, m(5), m(1439), m(1439), now); check(!r.kick, "a forced stage 1439 minutes ago keeps the proof quiet");
  r = d(0, m(5), null, null, now); check(r.kick && r.reason === "proof", "no forced stage on record: the proof kick");
  r = d(0, m(5), m(2000), m(2), now); check(!r.kick, "a failed attempt 2 minutes ago holds the proof for the 5-minute retry gap");
}

// ---- the job ----
{
  calls.length = 0;
  let r = await run({ active: 12, events: [{ kind: "done", job: "qnfo-research-exec", ts: ago(2), status: "ok" }, { kind: "research-watchdog", ts: ago(100), status: "ok", job: "research-exec-watchdog" }], svc: mkSvc({ status: 200, body: { ok: true } }) });
  check(r.out.status === "ok" && calls.length === 0 && r.led.events.filter((e) => e.kind === "research-watchdog").length === 1, "armed tick: no call, no new event, state only", { calls, out: r.out.notes });
  check(JSON.parse(r.led.state.research_exec_watchdog).reason === "armed" && JSON.parse(r.led.state.research_exec_watchdog).active === 12, "the armed state is written for the next tick and the probe");

  calls.length = 0;
  r = await run({ active: 12, events: [{ kind: "done", job: "qnfo-research-exec", ts: ago(45), status: "ok" }, { kind: "research-watchdog", ts: ago(100), status: "ok", job: "research-exec-watchdog" }], svc: mkSvc({ status: 200, body: { ok: true, out: { stage: "extract" } } }) });
  const ev = r.led.events.filter((e) => e.kind === "research-watchdog").pop();
  check(calls.length === 1 && calls[0].url === "https://qnfo-research-exec.internal/run?sync=1" && calls[0].method === "POST", "a stalled queue forces one stage on the internal host", calls);
  check(ev && ev.status === "ok" && ev.job === "research-exec-watchdog" && /stalled|queued or researching rows/.test(ev.text) && /HTTP 200/.test(ev.text) && /stage extract/.test(ev.text), "the forced stage leaves a research-watchdog event with status ok", ev);
  check(JSON.parse(r.led.state.research_exec_watchdog).kicks === 1, "the kick is counted");

  calls.length = 0;
  r = await run({ active: 12, events: [{ kind: "done", job: "qnfo-research-exec", ts: ago(45), status: "ok" }], svc: mkSvc({ status: 409, body: { busy: true } }) });
  const evb = r.led.events.filter((e) => e.kind === "research-watchdog").pop();
  check(evb && evb.status === "ok" && /busy/.test(evb.text) && r.out.status === "ok", "409 busy is a healthy run (the single-flight lease is held), not a failure", evb);

  calls.length = 0;
  r = await run({ active: 0, events: [{ kind: "done", job: "qnfo-research-exec", ts: ago(3), status: "ok" }], svc: mkSvc({ status: 200, body: { ok: true } }) });
  const evp = r.led.events.filter((e) => e.kind === "research-watchdog").pop();
  check(calls.length === 1 && evp && evp.status === "ok" && evp.meta.reason === "proof", "the daily proof stage is forced even with an empty queue", { calls, evp });

  calls.length = 0;
  r = await run({ active: 4, events: [{ kind: "done", job: "qnfo-research-exec", ts: ago(90), status: "ok" }], svc: mkSvc({ status: 500, body: {} }) });
  const eve = r.led.events.filter((e) => e.kind === "research-watchdog").pop();
  check(r.out.status === "error" && eve && eve.status === "error", "an HTTP 500 is recorded as an error event and the job reports error", { out: r.out, eve });
  check(JSON.parse(r.led.state.research_exec_watchdog).kicks === 0, "a failed kick is not counted as a kick");

  calls.length = 0;
  r = await run({ active: 4, events: [{ kind: "done", job: "qnfo-research-exec", ts: ago(90), status: "ok" }], svc: mkSvc(null, "boom") });
  check(r.out.status === "error" && /fetch failed/.test(r.led.events.filter((e) => e.kind === "research-watchdog").pop().text), "a thrown fetch is an error event");

  r = await run({ active: 4, events: [{ kind: "done", job: "qnfo-research-exec", ts: ago(90), status: "ok" }] });
  const evm = r.led.events.filter((e) => e.kind === "research-watchdog").pop();
  check(r.out.status === "error" && evm && evm.status === "error" && /binding RESEARCH_EXEC missing/.test(evm.text), "a missing binding is an error event with the reason, never a silent skip");

  r = await run({ active: 1, readError: true });
  check(r.out.status === "error" && /could not read/.test(r.out.notes.decision), "an unreadable ledger reports error with the reason and does not throw");
}

// ---- wiring ----
check(/"research-exec-watchdog": jobResearchExecWatchdog,/.test(src), "POST /run?job=research-exec-watchdog reaches it");
check(/runs\.push\(jobResearchExecWatchdog\(env\)\.catch\(/.test(src), "every tick runs the job");
check(jobSrc.indexOf("logRun(") < 0 && /stateSet\(env, "research_exec_watchdog"/.test(jobSrc), "state plus an event only when it acts, no run-log row per tick");
const toml = readFileSync(join(here, "wrangler.toml"), "utf8");
check(/\[\[services\]\]\s*\nbinding = "RESEARCH_EXEC"\s*\nservice = "qnfo-research-exec"\s*\nprops = \{ caller = "qnfo-cloud-ops" \}/.test(toml), "wrangler.toml binds RESEARCH_EXEC to qnfo-research-exec with props.caller (no key copy)");
const mirror = readFileSync(join(here, "deployed-current.worker.js"), "utf8");
check(mirror === src, "deployed-current.worker.js is identical to worker.js");
const ver = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
check(ver && (Number(ver[1]) > 1 || (Number(ver[1]) === 1 && Number(ver[2]) >= 33)), "VERSION is at least 1.33.0 (a new capability raises the minor)", ver && ver[0]);
check(!/claude\.ai|anthropic\.com/i.test(jobSrc), "no claude.ai link in the job");
console.log(fails ? fails + " FAILED" : "research-exec-watchdog: all assertions passed");
process.exit(fails ? 1 : 0);
