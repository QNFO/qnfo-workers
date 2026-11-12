// CONSUMER-SPEED-METRIC-1: offline suite for the consumer-speed metrics (producer, migration, workflow step). Run: node scripts/consumer-speed-metric.test.mjs
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
let fail = 0;
const ok = (c, m, x) => { if (c) console.log("PASS " + m); else { fail++; console.log("FAIL " + m + (x === undefined ? "" : " " + JSON.stringify(x))); } };

// 1. The producer's own offline suite (the Python port of summarize()).
let out = "";
for (const py of ["python3", "python"]) {
  try { out = execFileSync(py, [join(here, "consumer_speed_metric.py"), "--selftest"], { encoding: "utf8" }); break; } catch (e) { out = String(e.stdout || e.message); }
}
ok(/selftest: ok/.test(out) && !/FAIL/.test(out), "consumer_speed_metric.py --selftest passes", out.slice(-300));

// 2. The migration registers both metrics with trigger and cause, with the CI headers.
const sql = readFileSync(join(root, "migrations", "2026-11-12-consumer-speed-metrics.sql"), "utf8");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: /m.test(sql), "migration carries APPLY-BY, DB and Rollback headers");
for (const m of ["consumer_run_median_min_24h", "consumer_run_cap_cancellations_24h"]) {
  ok(new RegExp("INSERT OR IGNORE INTO metric_registry[\\s\\S]*'" + m + "'[\\s\\S]*'runner'\\)").test(sql), m + " is registered with refresh_class runner");
  ok(new RegExp("INTO metric_breach_cause[\\s\\S]*\\('" + m + "', 'code-loop'").test(sql), m + " has its breach cause");
  ok(new RegExp("INTO analytics_metric_triggers[\\s\\S]*\\('" + m + "', '[^']+', 'metric_registry', 'gt', (12|0),").test(sql), m + " has its trigger");
}
ok(/INTO analytics_metric_triggers[\s\S]*'consumer_run_median_min_24h', '[^']+', 'metric_registry', 'gt', 12,/.test(sql) && /'consumer_run_cap_cancellations_24h', '[^']+', 'metric_registry', 'gt', 0,/.test(sql), "targets: median above 12 breaches, any cap cancellation breaches");

// 3. The producer's metric names match the migration; the workflow runs it in the audits job, once, never in the contract path.
const py = readFileSync(join(here, "consumer_speed_metric.py"), "utf8");
ok(/M_MEDIAN = "consumer_run_median_min_24h"/.test(py) && /M_CAPS = "consumer_run_cap_cancellations_24h"/.test(py), "producer and migration use the same metric names");
ok(/MAX_JOBS_READS = 12/.test(py) && /workflow_dispatch/.test(py), "producer caps jobs reads at 12 and excludes manual dispatches");
const wf = readFileSync(join(root, ".github", "workflows", "remediation-consumer.yml"), "utf8");
const jobsStart = wf.indexOf("\njobs:\n");
const parts = wf.slice(jobsStart).split(/\n(?=  [a-z-]+:\n)/);
const job = (n) => parts.find((p) => p.trimStart().startsWith(n + ":")) || "";
ok((wf.match(/scripts\/consumer_speed_metric\.py/g) || []).length === 2 && /scripts\/consumer_speed_metric\.py/.test(job("audits")), "the audits job runs the producer (selftest and run), no other job does");
ok(/GH_TOKEN: \$\{\{ github\.token \}\}/.test(job("audits").slice(job("audits").indexOf("Measure the consumer run speed"))), "the producer step gets the run's own token");
ok(/Measure the consumer run speed\n\s+continue-on-error: true/.test(wf), "the producer step never fails the job");
ok((wf.match(/- name: Plan every qnfo-audit view/g) || []).length === 1 && /code-anchor: - name: Plan every qnfo-audit view/.test(sql), "the trigger's code-anchor occurs once in the workflow");
console.log(fail ? "consumer-speed-metric: " + fail + " FAILED" : "consumer-speed-metric: ok");
process.exit(fail ? 1 : 0);
