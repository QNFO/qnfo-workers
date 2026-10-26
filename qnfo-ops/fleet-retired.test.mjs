// OPS-FLEET-RETIRED-1 offline suite (qnfo-ops 2.59.0, agent_issues 1000154 FLEET-HEALTH-RETIRED-410). No network: the Cloudflare script list, the workers' /health answers and
// qnfo-audit are stubs. Measured 2026-10-25: fleet_status reported 35 of 36 healthy for ever because qnfo-workers, a retired repository-root stub that answers HTTP 410 with a RETIRED
// notice (it cannot simply be deleted: Workers Builds recreates it on every push), was counted as unhealthy, so a real new failure hid inside the same count.
// Proves: an HTTP 410 answer with a retired, decommissioned or tombstone marker in its body is a third state (retired: true, healthy null) that leaves the healthy ratio; so does a
// worker whose service_registry state is retired and that does not answer 200; a 410 without a marker, a 500 from a live worker and a registry-retired worker that still answers 200
// are what they were (unhealthy, unhealthy, healthy); the counts are healthy + retired + unhealthy and activeTotal excludes the retired rows; a retired row is not read as unprobed.
// Run: node --no-warnings qnfo-ops/fleet-retired.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 500) : "")); } };
const a = src.indexOf("async function fleetStatus(env) {"), b = src.indexOf('__name(fleetStatus, "fleetStatus");', a);
ok(a > 0 && b > a, "fleetStatus is found");
const make = new Function("FLEET", "probeService", "COMPAT_HEALTH_BINDINGS", "CF_ACCOUNT_ID", "VERSION", "iso", "console", src.slice(a, b) + "\nreturn fleetStatus;");
const fleetStatus = make([], async () => ({ ok: false, http: 0 }), {}, "acct", "2.59.0-test", () => "2026-10-26T18:00:00.000Z", console);

const answers = {
  "qnfo-workers": () => new Response("RETIRED: the repository root is not a worker. See the README.", { status: 410 }),
  "live-ok": () => new Response(JSON.stringify({ version: "1.2.3" }), { status: 200 }),
  "live-500": () => new Response("boom", { status: 500 }),
  "gone-plain": () => new Response("gone", { status: 410 }),
  "reg-retired-410": () => new Response("not here", { status: 410 }),
  "reg-retired-200": () => new Response(JSON.stringify({ version: "9.9.9" }), { status: 200 }),
  "decom": () => new Response("This worker was decommissioned on 2026-10-01", { status: 410 })
};
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith("https://api.cloudflare.com/")) return new Response(JSON.stringify({ result: Object.keys(answers).map((id) => ({ id, handlers: ["fetch"] })) }), { status: 200 });
  const m = /^https:\/\/([a-z0-9-]+)\.q08\.workers\.dev\/health$/.exec(u);
  return m && answers[m[1]] ? answers[m[1]]() : new Response("nf", { status: 404 });
};
const registry = [{ service: "qnfo-workers", base_url: "https://qnfo-workers.q08.workers.dev", state: "live" }, { service: "reg-retired-410", base_url: "https://reg-retired-410.q08.workers.dev", state: "retired" }, { service: "reg-retired-200", base_url: "https://reg-retired-200.q08.workers.dev", state: "retired" }];
const env = { CF_API_TOKEN: "x", QNFO_AUDIT: { prepare(sql) { const s = { bind: () => s, all: async () => ({ results: /service_registry/.test(sql) ? registry : [] }), first: async () => null }; return s; } } };

(async () => {
  const r = await fleetStatus(env);
  const by = Object.fromEntries(r.fleet.map((x) => [x.name, x]));
  ok(r.ok === true && r.total === 7, "seven workers are listed", r.total);
  ok(by["qnfo-workers"].retired === true && by["qnfo-workers"].healthy === null && by["qnfo-workers"].http === 410, "a 410 with a RETIRED notice is retired, not unhealthy (qnfo-workers)", by["qnfo-workers"]);
  ok(by["decom"].retired === true, "a 410 that says decommissioned is retired too (the marker is read from the answer, not from a name)", by["decom"]);
  ok(by["gone-plain"].retired === false && by["gone-plain"].healthy === false, "a 410 with no marker is still unhealthy", by["gone-plain"]);
  ok(by["live-500"].healthy === false && by["live-500"].retired === false, "a synthetic 500 from a live worker still reports unhealthy (negative control)", by["live-500"]);
  ok(by["live-ok"].healthy === true && by["live-ok"].retired === false && by["live-ok"].version === "1.2.3", "a healthy worker is healthy", by["live-ok"]);
  ok(by["reg-retired-410"].retired === true && by["reg-retired-410"].healthy === null, "a registry row in state retired that does not answer 200 is retired", by["reg-retired-410"]);
  ok(by["reg-retired-200"].retired === false && by["reg-retired-200"].healthy === true, "a registry-retired worker that still answers 200 is not hidden as retired", by["reg-retired-200"]);
  ok(r.healthyCount === 2 && r.retiredCount === 3 && r.unhealthyCount === 2 && r.activeTotal === 4 && r.total === 7, "healthy 2 + retired 3 + unhealthy 2 = 7, activeTotal 4", { h: r.healthyCount, rt: r.retiredCount, u: r.unhealthyCount, a: r.activeTotal });
  ok(r.unprobedCount === 0, "a retired row is not counted as unprobed", r.unprobedCount);
  ok(r.healthyCount + r.retiredCount + r.unhealthyCount + r.unprobedCount === r.total, "every worker is in exactly one count");
  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
