// ISSUES-CHAIN-DRAINABLE-1 (qnfo-observability 1.5.6) offline suite. No network.
// Proves: the issues chain points at the live folded consumer and counts only open issue titles its member handles;
// unmarked health reports and prose mentioning exceptions do not turn residual defects into backpressure.
// Run: node --no-warnings qnfo-observability/issue-backpressure-drainable.test.mjs
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { assessIntegration as __assess, INTEGRATION_CHAINS as __chains, VERSION as __v };\n").toString("base64"));
let pass = 0, fail = 0;
const ok = (condition, message, value) => {
  if (condition) pass++;
  else { fail++; console.log("FAIL " + message + (value !== undefined ? " :: " + JSON.stringify(value).slice(0, 400) : "")); }
};

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT);
  CREATE TABLE integration_state (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, json TEXT);
  CREATE TABLE fleet_probe_log (name TEXT);
  CREATE TABLE worker_logs (script_name TEXT);
  CREATE TABLE worker_invocations (worker_name TEXT);
  CREATE TABLE service_registry (service TEXT, state TEXT);
  CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
`);
const env = { AUDIT: { prepare(sql) {
  let args = [];
  const statement = {
    bind(...values) { args = values; return statement; },
    async first() { return db.prepare(sql).get(...args) ?? null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async run() { return { meta: db.prepare(sql).run(...args) }; },
  };
  return statement;
} } };
const issue = db.prepare("INSERT INTO agent_issues (title, description, status) VALUES (?, ?, 'open')");
const add = (title, description = "") => issue.run(title, description);
const assessment = async () => {
  const realError = console.error;
  console.error = () => {};
  try { return await mod.__assess(env); }
  finally { console.error = realError; }
};

for (let i = 0; i < 8; i++) {
  add("Worker health unavailable " + i, "probe_target=qnfo-worker-" + i + " probe_class=worker-process");
}
add("WORKER-EXCEPTION-DETECTED qnfo-gateway (window)", "detector issue");
add("MODEL-DEGRADED model-a", "model issue");
add("legacy health is failing", "No probe opt-in: probe_target is absent");
add("ERROR-DETAIL-CAPTURE-1: worker exceptions are counted but not recorded", "Residual code defect");
add("Worker availability degraded", "probe_target=qnfo-worker-x probe_class=network-endpoint");
add("Unhealthy worker shutdown", "probe_target=qnfo-worker-y probe_class=worker-process");

{
  const summary = await assessment();
  const chain = summary.chains.find((candidate) => candidate.id === "issues");
  ok(chain && chain.n === 10 && chain.status === "healthy", "only the ten supported drainable issue families count", chain);
  ok(chain && chain.total === 14, "the monitor retains the full medium total separately", chain && chain.total);
  ok(chain && chain.consumer === "qnfo-lifecycle (qnfo-backlog-exec member)", "the chain names the actual folded consumer", chain && chain.consumer);
}

add("ALERT-STORM-DETECTED qnfo-gateway (window)", "detector issue");
{
  const chain = (await assessment()).chains.find((candidate) => candidate.id === "issues");
  ok(chain && chain.n === 11 && chain.status === "stuck", "the eleventh drainable issue still trips backpressure", chain);
  ok(chain && chain.detail.startsWith("backpressure: 11 waiting"), "backpressure detail keeps the actual count and threshold", chain && chain.detail);
}

{
  const version = /^(\d+)\.(\d+)\.(\d+)/.exec(String(mod.__v));
  ok(version && (Number(version[1]) > 1 || Number(version[2]) > 5 || (Number(version[2]) === 5 && Number(version[3]) >= 6)), "VERSION is at least 1.5.6", mod.__v);
  ok(mirror === src, "deployed-current.worker.js is identical to worker.js");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
