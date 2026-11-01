// METRIC-FAMILY-CLUSTER-B offline suite: replays migrations/2026-10-28-metric-family-cluster-b.sql on node:sqlite.
// Proves: the header opts in; nothing is deleted or dropped; the 35 cause mappings use known causes, are unique and are idempotent; the new metric and its trigger exist once;
// the issue-1000645 probe passes with no recent reopen of a sample-bound ticket, fails on one, and ignores qnfo-gateway; the producer in qnfo-research-exec writes the metric.
// Also the registration rule of METRIC-CAUSE-AT-REGISTRATION-1 (deploy gate): a migration dated 2026-10-29 or later that registers a metric also maps its cause, in the same file
// or, for a file that already merged, in a listed forward migration.
// Run: node migrations/metric-family-cluster-b.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-28-metric-family-cluster-b.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "one Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok([...body.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].every((m) => Buffer.byteLength(m[1]) <= 50), "every LIKE pattern is at most 50 bytes");

const CAUSES = ["spend", "structure", "publishing", "issue-backlog", "owner-routing", "heartbeat", "code-loop", "breach-doctor", "measurement"];
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE metric_breach_cause (metric_key TEXT PRIMARY KEY, cause_key TEXT NOT NULL, note TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, next_due_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, status TEXT DEFAULT 'open');
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, event TEXT NOT NULL, ts TEXT NOT NULL);
INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport) VALUES ('issue-1000645', 1000645, 'SELECT 1', 'd1-query');
INSERT INTO metric_breach_cause (metric_key, cause_key, note) VALUES ('open_agent_issues', 'issue-backlog', 'pre-existing');`);
  return w;
}
const w = world();
w.exec(body);
w.exec(body);
const nMap = w.prepare("SELECT COUNT(*) n FROM metric_breach_cause WHERE note LIKE 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28:%'").get().n;
ok(nMap === 35, "35 mappings after a replay (idempotent)", nMap);
ok(w.prepare("SELECT COUNT(*) n FROM metric_breach_cause WHERE cause_key NOT IN (" + CAUSES.map((c) => "'" + c + "'").join(",") + ")").get().n === 0, "every cause is a known cause");
ok(w.prepare("SELECT cause_key FROM metric_breach_cause WHERE metric_key = 'open_agent_issues'").get().cause_key === "issue-backlog", "an existing mapping is left alone");
ok(w.prepare("SELECT COUNT(*) n FROM metric_registry WHERE metric = 'owner_papers_retracted_over_24h' AND owner = 'qnfo-research-exec' AND state = 'PENDING' AND refresh_cadence = '10m'").get().n === 1, "metric registered once, PENDING until the producer writes it");
const trig = w.prepare("SELECT operator, threshold, enabled, action FROM analytics_metric_triggers WHERE metric_key = 'owner_papers_retracted_over_24h'").all();
ok(trig.length === 1 && trig[0].operator === "gt" && trig[0].threshold === 0 && trig[0].enabled === 1 && /Done:/.test(trig[0].action), "one enabled trigger with a definition of done", trig);
ok(w.prepare("SELECT COUNT(*) n FROM metric_breach_cause WHERE metric_key = 'owner_papers_retracted_over_24h'").get().n === 1, "the new metric is mapped at birth");

// issue 1000645 probe
const probe = w.prepare("SELECT verify_probe p FROM remediation_contracts WHERE class = 'issue-1000645'").get().p;
const run = () => { const r = w.prepare(probe).get(); return r.expected === r.observed; };
const iso = (h) => new Date(Date.now() - h * 3600e3).toISOString().slice(0, 19) + "Z";
w.exec("INSERT INTO agent_issues (id, title) VALUES (1, 'METRIC-UNMEASURED-1: qnfo-jobsearch has metrics with no value'), (2, 'METRIC-UNMEASURED-1: qnfo-gateway has metrics with no value')");
ok(run(), "probe passes with no reopen");
w.prepare("INSERT INTO issue_lifecycle (issue_id, event, ts) VALUES (2, 'reopened', ?1)").run(iso(1));
ok(run(), "a qnfo-gateway reopen (a real producer defect) does not hold the probe");
w.prepare("INSERT INTO issue_lifecycle (issue_id, event, ts) VALUES (1, 'reopened', ?1)").run(iso(30));
ok(run(), "a reopen older than 24 h does not hold the probe");
w.prepare("INSERT INTO issue_lifecycle (issue_id, event, ts) VALUES (1, 'reopened', ?1)").run(iso(2));
ok(!run(), "a sample-bound ticket reopened 2 h ago fails the probe");

// the producer
const src = readFileSync(new URL("../qnfo-research-exec/worker.js", import.meta.url), "utf8");
ok(/WHERE metric = 'owner_papers_retracted_over_24h'/.test(src) && /_staleOk/.test(src), "noticeRepairTick writes the metric only when the backup times were read");
const mirror = readFileSync(new URL("../qnfo-research-exec/deployed-current.worker.js", import.meta.url), "utf8");
ok(/var VERSION = "([^"]+)"/.exec(mirror)?.[1] === /var VERSION = "([^"]+)"/.exec(src)?.[1], "the Wrangler-built deploy mirror carries the source VERSION");
ok(mirror.includes("owner_papers_retracted_over_24h") && mirror.includes("_staleOk"), "the built deploy mirror includes the guarded metric producer");
const ver = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(ver && (+ver[1] > 0 || +ver[2] >= 40), "VERSION is at least 0.40.0");

const throughputCause = readFileSync(new URL("./2026-11-01-issue-family-throughput-cause.sql", import.meta.url), "utf8");
const throughputCauseBody = throughputCause.split("\n").filter((line) => !line.startsWith("--")).join("\n");
w.exec(throughputCauseBody);
w.exec(throughputCauseBody);
ok(w.prepare("SELECT cause_key FROM metric_breach_cause WHERE metric_key = 'largest_issue_family_net_inflow_24h'").get()?.cause_key === "issue-backlog",
  "the forward migration idempotently maps issue-family throughput to the issue-backlog cause");
const throughputRollback = throughputCause.match(/^-- Rollback: (.+)$/m)?.[1];
ok(!!throughputRollback, "the forward cause migration has a rollback");
if (throughputRollback) w.exec(throughputRollback);
ok(w.prepare("SELECT COUNT(*) n FROM metric_breach_cause WHERE metric_key = 'largest_issue_family_net_inflow_24h'").get().n === 0,
  "the forward cause migration rollback removes only its cause mapping");

// registration rule (deploy gate): a migration dated after this one that registers a metric maps its cause in the same file.
// A file that already merged may not be edited to add the row (MIGRATION-NO-CLOBBER-1: the runner re-applies an edited file, and 2026-10-29-plussing-3.sql also rewrites the live
// management-personas workflow), so a later migration may map the metric instead. Each such file is listed here with the metric and the forward file, and this test reads the
// forward file to prove the mapping exists. A new registration still maps its cause in its own file.
const MAPPED_FORWARD = {
  "2026-10-29-plussing-3.sql": { file: "2026-10-30-product-plus-cause.sql", metrics: ["product_plus_deployed_7d"] },
  "2026-11-01-plussing-4.sql": { file: "2026-11-01-plussing-4a-cause.sql", metrics: ["plus_shipped_7d", "plus_kept_share_30d"] },
  "2026-11-01-issue-family-throughput-action.sql": { file: "2026-11-01-issue-family-throughput-cause.sql", metrics: ["largest_issue_family_net_inflow_24h"] },
};
const files = readdirSync(new URL("./", import.meta.url)).filter((f) => /^\d{4}-\d{2}-\d{2}.*\.sql$/.test(f) && f.slice(0, 10) >= "2026-10-29");
for (const f of files) {
  const t = readFileSync(new URL("./" + f, import.meta.url), "utf8");
  const reg = /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+metric_registry\b/i.test(t);
  if (!reg) continue;
  const here = /INTO\s+metric_breach_cause\b/i.test(t) || /^-- (?:CAUSE-EXEMPT|CAUSE-MAPPED): .{10,}/m.test(t);
  const fwd = MAPPED_FORWARD[f];
  let later = false;
  if (fwd) {
    const ft = readFileSync(new URL("./" + fwd.file, import.meta.url), "utf8");
    later = fwd.file > f && fwd.metrics.every((metric) => t.includes("'" + metric + "'") && new RegExp("INTO\\s+metric_breach_cause\\b[\\s\\S]*'" + metric + "'", "i").test(ft)) && /^-- APPLY-BY: ci\s*$/m.test(ft);
  }
  ok(here || later,
    f + " registers a metric: add INSERT INTO metric_breach_cause in the same file (METRIC-CAUSE-AT-REGISTRATION-1), or a '-- CAUSE-MAPPED: <where and why>' line");
}
for (const f of Object.keys(MAPPED_FORWARD)) {
  const t = readFileSync(new URL("./" + f, import.meta.url), "utf8");
  ok(!/INTO\s+metric_breach_cause\b/i.test(t), f + " stays as merged: its cause mapping lives in " + MAPPED_FORWARD[f].file + " (MIGRATION-NO-CLOBBER-1)");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
