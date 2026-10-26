// STATE-RETIRED-1 offline suite (qnfo-fleet-control 0.56.1, agent_issues 1000154 FLEET-HEALTH-RETIRED-410). Measured 2026-10-25 and again 2026-10-26: the fleet state snapshot (fleet_state_snapshots,
// every hour) counted qnfo-workers, a retired repository-root stub that answers HTTP 410 with a RETIRED notice (Workers Builds recreates it on every push, so it cannot simply be deleted), as
// down: down_list ["cloudflare-mcp:404","qnfo-workers:410"], workers_down 2. Every digest that reports a down worker was reporting a fixed artifact, and a real new failure hid inside the same count.
// Runs the real selfState against stubbed fetch and a stub D1. Proves: an HTTP 410 whose body says retired, decommissioned or tombstone is retired (up null, retired true), not down; so is a worker
// whose service_registry state is retired and that does not answer 200; a 410 without a marker, a 404 and a 500 are still down; a registry-retired worker that still answers 200 is up; the summary
// carries workers_retired and retired_list, down_list lists only real failures, workers_down excludes retired, version_unknown does not count a retired worker; a retired worker is recorded in
// worker_live_audit with a TOMBSTONE_410 note instead of being omitted; a heartbeat row cannot turn a retired worker back into up or down.
// Run: node --no-warnings qnfo-fleet-control/state-retired.test.mjs   -> prints "N checks, 0 failure(s)"
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("var STATE_RETIRED_RE"), b = src.indexOf('var ACCOUNT = "edb167b78c9fb901ea5bca3ce58ccc4b";', a);
if (a < 0 || b < a) throw new Error("state block not found in worker.js");
let fails = 0, n = 0;
const check = (c, m, x) => { n++; if (!c) { fails++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x) : "")); } };
const vmV = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
check(vmV && (+vmV[1] > 0 || +vmV[2] > 56 || (+vmV[2] === 56 && +vmV[3] >= 1)), "VERSION is at least 0.56.1", vmV && vmV[0]);
check(src === readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8"), "deployed-current.worker.js is identical to worker.js");
check(/if \(stateIsRetired\(o\.st, o\.t, regRetired\[s\.service\]\)\) \{/.test(src) && /out\.summary = stateSummary\(out\.workers\);/.test(src) && /if \(hw\.up === true \|\| hw\.retired\) continue;/.test(src), "selfState uses the helpers on the probe, the heartbeat loop and the summary");

const writes = [], snapshots = [];
const registry = [
  { service: "qnfo-fleet-control", version: "0.56.0", base_url: "https://qnfo-fleet-control.q08.workers.dev" },
  { service: "live-ok", version: "1.0.0", base_url: "https://live-ok.q08.workers.dev" },
  { service: "qnfo-workers", version: "unknown", base_url: "https://qnfo-workers.q08.workers.dev" },
  { service: "decom", version: "1.0.0", base_url: "https://decom.q08.workers.dev" },
  { service: "gone-plain", version: "1.0.0", base_url: "https://gone-plain.q08.workers.dev" },
  { service: "cloudflare-mcp", version: "1.0.0", base_url: "https://cloudflare-mcp.q08.workers.dev" },
  { service: "live-500", version: "1.0.0", base_url: "https://live-500.q08.workers.dev" },
  { service: "reg-retired-410", version: "1.0.0", base_url: "https://reg-retired-410.q08.workers.dev" },
  { service: "reg-retired-200", version: "1.0.0", base_url: "https://reg-retired-200.q08.workers.dev" },
  { service: "tomb-hb", version: "1.0.0", base_url: "https://tomb-hb.q08.workers.dev" },
  { service: "blocked-1042", version: "1.0.0", base_url: "https://blocked-1042.q08.workers.dev" }
];
const answers = {
  "live-ok": () => new Response(JSON.stringify({ version: "1.0.0" }), { status: 200 }),
  "qnfo-workers": () => new Response("RETIRED: the repository root is not a worker.", { status: 410 }),
  "decom": () => new Response("This worker was decommissioned on 2026-10-01", { status: 410 }),
  "gone-plain": () => new Response("gone", { status: 410 }),
  "cloudflare-mcp": () => new Response("not found", { status: 404 }),
  "live-500": () => new Response("boom", { status: 500 }),
  "reg-retired-410": () => new Response("nothing here", { status: 410 }),
  "reg-retired-200": () => new Response(JSON.stringify({ version: "9.9.9" }), { status: 200 }),
  "tomb-hb": () => new Response("tombstone", { status: 410 }),
  "blocked-1042": () => new Response("error code: 1042", { status: 404 })
};
const fetchStub = async (url) => { const m = /^https:\/\/([a-z0-9-]+)\.q08\.workers\.dev\/health$/.exec(String(url)); return m && answers[m[1]] ? answers[m[1]]() : new Response("nf", { status: 404 }); };
const heartbeats = [{ worker: "tomb-hb", version: "1.0.0", ts: new Date().toISOString(), ok: 1 }, { worker: "cloudflare-mcp", version: "1.0.0", ts: new Date(Date.now() - 5 * 36e5).toISOString(), ok: 1 }];
const mkDb = (regState) => ({
  prepare(sql) {
    let args = [];
    const st = {
      bind(...x) { args = x; return st; },
      async all() {
        if (/FROM service_registry WHERE lower\(COALESCE\(state/.test(sql)) return { results: regState.map((s) => ({ service: s })) };
        if (/FROM service_registry ORDER BY service/.test(sql)) return { results: registry };
        if (/FROM fleet_heartbeat/.test(sql)) return { results: heartbeats };
        return { results: [] };
      },
      async first() { return null; },
      async run() { if (/INSERT INTO worker_live_audit/.test(sql)) writes.push({ worker: args[0], http: args[1], note: args[3] }); if (/INSERT INTO fleet_state_snapshots/.test(sql)) snapshots.push(args); return { meta: { changes: 1 } }; }
    };
    return st;
  }
});
const ctx = vm.createContext({ randHex: () => "abc123", STATE_SCHEMA: "fleet-state/v1", VERSION: "0.56.1-test", __name: (f) => f, __name2: (f) => f, __name22: (f) => f, Date, Math, Number, String, JSON, Object, Array, RegExp, Promise, AbortController, setTimeout, clearTimeout, fetch: fetchStub, console: { error() {}, log() {} }, isFinite });
const X = vm.runInContext(src.slice(a, b) + "\n;({ selfState, stateIsRetired, stateSummary });", ctx, { filename: "fleet-control#STATE-RETIRED-1" });

// pure helpers
check(X.stateIsRetired(410, "RETIRED: gone", false) === true && X.stateIsRetired(410, "decommissioned", false) === true && X.stateIsRetired(410, "Tombstone stub", false) === true, "410 with a retired, decommissioned or tombstone marker is retired");
check(X.stateIsRetired(410, "gone", false) === false && X.stateIsRetired(500, "retired", false) === false && X.stateIsRetired(404, "tombstone", false) === false, "a 410 without a marker, or a marker on another status, is not retired");
check(X.stateIsRetired(410, "x", true) === true && X.stateIsRetired(404, "x", true) === true && X.stateIsRetired(200, "x", true) === false, "a registry retired state counts only while the worker does not answer 200");
check(X.stateIsRetired(410, "retiredness", false) === false, "the marker is a whole word");

const out = await X.selfState({ DB_AUDIT: mkDb(["qnfo-workers", "reg-retired-410", "reg-retired-200"]) });
const by = Object.fromEntries(out.workers.map((w) => [w.service, w]));
check(by["qnfo-workers"].retired === true && by["qnfo-workers"].up === null && by["qnfo-workers"].http === 410, "qnfo-workers (410 RETIRED) is retired, not down", by["qnfo-workers"]);
check(by["decom"].retired === true, "a 410 that says decommissioned is retired (the marker is read from the answer, not from a name)", by["decom"]);
check(by["tomb-hb"].retired === true && by["tomb-hb"].up === null, "a retired worker with a fresh heartbeat row stays retired", by["tomb-hb"]);
check(!by["gone-plain"].retired && by["gone-plain"].up === false, "a 410 with no marker is still down", by["gone-plain"]);
check(!by["cloudflare-mcp"].retired && by["cloudflare-mcp"].up === false, "a 404 is still down (negative control)", by["cloudflare-mcp"]);
check(!by["live-500"].retired && by["live-500"].up === false, "a 500 from a live worker is still down (negative control)", by["live-500"]);
check(by["reg-retired-410"].retired === true, "a registry-retired worker that answers 410 is retired", by["reg-retired-410"]);
check(!by["reg-retired-200"].retired && by["reg-retired-200"].up === true, "a registry-retired worker that still answers 200 is up, not hidden", by["reg-retired-200"]);
check(by["blocked-1042"].up === null && !by["blocked-1042"].retired, "a 1042 answer stays unknown, not retired", by["blocked-1042"]);
check(by["live-ok"].up === true && by["qnfo-fleet-control"].up === true, "healthy workers are up");

const s = out.summary;
check(s.workers_retired === 4 && s.retired_list.length === 4 && s.retired_list.indexOf("qnfo-workers:410") >= 0, "the summary counts and lists the four retired workers", s);
check(s.down_list.join() === "gone-plain:410,cloudflare-mcp:404,live-500:500" && s.workers_down === 3, "down_list holds only the real failures and workers_down excludes retired", s);
check(s.workers_up === 3 && s.workers_unknown === 1 && s.workers_total === 11, "up 3 (self, live-ok, reg-retired-200), unknown 1 (1042), total 11 including the retired", s);
check(s.workers_up + s.workers_down + s.workers_unknown + s.workers_retired === s.workers_total, "every worker is in exactly one count");
check(s.version_unknown === 3, "version_unknown does not count the retired workers (gone-plain, live-500 and the 1042 worker have no version; cloudflare-mcp takes its version from its heartbeat row)", s.version_unknown);
check(snapshots.length === 1 && snapshots[0][3] === 11 && snapshots[0][4] === 3 && snapshots[0][5] === 3, "the snapshot row stores workers_total 11, workers_up 3 and workers_down 3", snapshots[0] && snapshots[0].slice(0, 6));
const w1 = writes.find((w) => w.worker === "qnfo-workers");
check(w1 && w1.http === 410 && /^TOMBSTONE_410 selfstate-probe .* up=retired/.test(w1.note), "the retired worker is recorded in worker_live_audit with a TOMBSTONE_410 note, not omitted", w1);
check(writes.length === registry.length, "one worker_live_audit row per registry worker", writes.length);
const w2 = writes.find((w) => w.worker === "live-500");
check(w2 && /up=0/.test(w2.note) && !/TOMBSTONE/.test(w2.note), "a down worker's row is unchanged", w2);

// without the registry state query (an older schema) the marker rule still holds
const out2 = await X.selfState({ DB_AUDIT: { prepare(sql) { const base = mkDb([]).prepare(sql); if (/lower\(COALESCE\(state/.test(sql)) return { bind: () => ({ all: async () => { throw new Error("no such column: state"); } }), all: async () => { throw new Error("no such column: state"); }, run: async () => ({}), first: async () => null }; return base; } } });
const by2 = Object.fromEntries(out2.workers.map((w) => [w.service, w]));
check(by2["qnfo-workers"].retired === true && !by2["reg-retired-410"].retired && by2["reg-retired-410"].up === false, "a database without a state column keeps the body-marker rule and loses only the registry rule", { q: by2["qnfo-workers"], r: by2["reg-retired-410"] });

console.log(n + " checks, " + fails + " failure(s)");
if (fails) process.exit(1);
