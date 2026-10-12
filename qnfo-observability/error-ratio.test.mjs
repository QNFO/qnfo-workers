// WORKER-LOGS-SAMPLED-ERROR-VISIBILITY-1 (qnfo-observability 1.4.4, agent_issues 1223) offline suite. No network.
// Proves: the digest divides captured failures by the census requests, so a script whose worker_logs rows are all
// captured failures is not reported at 100%; a real majority-failure script still alerts; a client disconnect is not a
// failure; a script with failures and no census row is unrated, not alerted; a Logpush script keeps its own ratio; the
// digest states the log contract; a worker with census traffic and no captured failure is not called silent.
// Run: node --no-warnings qnfo-observability/error-ratio.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { digest as __digest, VERSION as __hv, LOG_CONTRACT as __lc };\n").toString("base64"));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE worker_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, event_hash TEXT, ts_ms INTEGER, ingested_at TEXT, script_name TEXT, event_type TEXT, outcome TEXT, url TEXT, method TEXT, status INTEGER, cpu_ms REAL, wall_ms REAL, logs_json TEXT, exceptions_json TEXT);
CREATE TABLE worker_usage_daily (day TEXT, script TEXT, requests_24h INTEGER, errors_24h INTEGER, requests_7d INTEGER, errors_7d INTEGER, source TEXT, ts TEXT);
CREATE TABLE service_registry (service TEXT, state TEXT);
CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, level TEXT, message TEXT, digested TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, repeats INTEGER);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);`);
const AUDIT = { prepare(sql) { const q = sql.replace(/"digest"/g, "'digest'"); let a = []; const s = { bind: (...x) => { a = x; return s; }, run: async () => { db.prepare(q).run(...a); return {}; }, first: async () => db.prepare(q).get(...a) || null, all: async () => ({ results: db.prepare(q).all(...a) }) }; return s; } };
const env = { AUDIT };
const now = Date.now();
const log = (script, type, outcome, status, n) => { const st = db.prepare("INSERT INTO worker_logs (ts_ms, script_name, event_type, outcome, status) VALUES (?, ?, ?, ?, ?)"); for (let i = 0; i < n; i++) st.run(now - 1000 - i, script, type, outcome, status); };
const census = (script, req, err) => db.prepare("INSERT INTO worker_usage_daily (day, script, requests_24h, errors_24h) VALUES ('2026-10-12', ?, ?, ?)").run(script, req, err);
for (const w of ["busy", "broken", "walkouts", "nocensus", "pushed", "quiet", "dead"]) db.prepare("INSERT INTO service_registry VALUES (?, 'live')").run(w);
db.prepare("INSERT INTO worker_usage_daily (day, script, requests_24h, errors_24h) VALUES ('2026-10-11', 'busy', 5, 5)").run(); // an older census day is ignored

log("busy", "telemetry:fetch", "exception", null, 30); census("busy", 900, 30);          // 30 failures of 900 requests
log("broken", "telemetry:scheduled", "exceededWallTime", null, 40); census("broken", 50, 40); // 40 of 50
log("walkouts", "telemetry:fetch", "canceled", null, 78); census("walkouts", 600, 0);    // client disconnects only
log("nocensus", "telemetry:fetch", "exception", null, 25);                                // failures, no census row
log("pushed", "fetch", "ok", 200, 10); log("pushed", "fetch", "exception", 500, 30);      // Logpush rows, own denominator
census("quiet", 300, 0);                                                                   // traffic, no captured failure

const sum = await mod.__digest(env, { files: 0 });
const alerts = db.prepare("SELECT message FROM alerts").all().map((r) => r.message);
const an = Object.fromEntries(sum.anomalies.map((a) => [a.worker, a]));

ok(!an.busy && !alerts.some((m) => /busy error ratio/.test(m)), "30 captured failures of 900 census requests is not an anomaly (was 30/30 = 100%)", sum.anomalies);
ok(an.broken && an.broken.bad === 40 && an.broken.events === 50 && an.broken.ratio === 0.8 && an.broken.denominator === "worker_usage_daily" && alerts.some((m) => /broken error ratio 80% \(40\/50 last 24h\)/.test(m)), "40 failures of 50 census requests still alerts, with the census denominator", [an.broken, alerts]);
ok(!an.walkouts && !alerts.some((m) => /walkouts/.test(m)), "client disconnects (outcome canceled) are not failures", sum.anomalies);
ok(!an.nocensus && sum.unrated.some((u) => u.worker === "nocensus" && u.bad === 25) && !alerts.some((m) => /nocensus/.test(m)), "captured failures with no census row are listed as unrated, not alerted on a self-ratio", sum.unrated);
ok(an.pushed && an.pushed.bad === 30 && an.pushed.events === 40 && an.pushed.denominator === "worker_logs", "a Logpush script (ok rows present) keeps its own denominator", an.pushed);
ok(sum.workers_silent_24h.includes("dead") && !sum.workers_silent_24h.includes("quiet") && sum.workers_without_captured_failures_24h === 2, "a worker with census traffic and no captured failure is not silent", [sum.workers_silent_24h, sum.workers_without_captured_failures_24h]);
ok(sum.census_day === "2026-10-12" && sum.census_scripts === 4 && typeof sum.log_contract === "string" && /not an invocation census/.test(mod.__lc), "the digest names the census day and states the log contract", [sum.census_day, sum.census_scripts]);
const stored = JSON.parse(db.prepare("SELECT meta FROM cloud_ops_events").get().meta);
ok(stored.log_contract === mod.__lc && stored.anomalies.length === 2, "the stored digest row carries the contract and the two real anomalies", stored.anomalies);
ok(/log_contract: LOG_CONTRACT \}\)/.test(src), "/fleet/summary states the log contract beside log_stats");
{
  // the census read failing must not stop the digest; nothing is alerted on a self-ratio of captured failures
  db.exec("DROP TABLE worker_usage_daily; DELETE FROM alerts;");
  const errs = []; const orig = console.error; console.error = (...a) => errs.push(a.join(" "));
  let s2; try { s2 = await mod.__digest(env, null); } finally { console.error = orig; }
  ok(s2.census_day === null && s2.anomalies.length === 1 && s2.anomalies[0].worker === "pushed" && errs.some((e) => /usage-census/.test(e)), "without a census the digest still runs, logs why, and rates only scripts with their own denominator", [s2.anomalies, errs]);
}
const a = String(mod.__hv).split("-")[0].split(".").map(Number);
ok(a[0] > 1 || (a[0] === 1 && (a[1] > 4 || (a[1] === 4 && a[2] >= 4))), "VERSION is at least 1.4.4", mod.__hv);
ok(!/Math\.random\(\)/.test(src.split("// ---- SCORER")[0].split("\n").filter((l) => /hash:/.test(l)).join("\n")), "the custom-event hash does not use Math.random");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
