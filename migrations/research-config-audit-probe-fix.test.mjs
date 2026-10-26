// RESEARCH-CONFIG-AUDIT-PROBE-FIX-1 offline suite. The doer probe of issue 100626 (migrations/2026-10-26-research-config-audit.sql) held the failure text "the update audit trigger is missing";
// the runners' write-keyword guard (scripts/remediation_consumer.py WRITE_KW) scans string literals too and refused it: probe-not-machine-executable on the first run. This suite applies both
// files in order on SQLite (node:sqlite) and runs EVERY probe the first file writes (three issue probes, two failure-mode detectors) through the guard's own keyword list, one statement
// and read-only checks, then replays the repaired probe on the states it describes. It fails on the first file alone.
// Run: node migrations/research-config-audit-probe-fix.test.mjs        (RCAF_SKIP_FIX=1 applies only the first file and must fail)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), "utf8");
const NL = String.fromCharCode(10);
const strip = (t) => t.split(NL).filter((l) => !l.startsWith("--")).join(NL);
const first = read("2026-10-26-research-config-audit.sql");
const fix = read("2026-10-26-research-config-audit-probe-fix.sql");
const SKIP = process.env.RCAF_SKIP_FIX === "1";
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
// scripts/remediation_consumer.py WRITE_KW and is_literal_select, copied: keep in step with the runner.
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
function literalSelect(sql) {
  const s = (sql || "").trim(); if (!s) return "empty-probe";
  const low = s.toLowerCase(); if (!(low.startsWith("select") || low.startsWith("with"))) return "not-a-select";
  for (const kw of WRITE_KW) if (low.includes(kw)) return "write-keyword:" + kw.trim();
  let body = s.trimEnd(); if (body.endsWith(";")) body = body.slice(0, -1);
  if (body.includes(";")) return "multi-statement";
  return "ok";
}
ok(literalSelect("SELECT 'the update audit trigger is missing'") === "write-keyword:update", "the guard copy refuses the old failure text (control)");

// ---- static ----
const lines = fix.split(NL);
const hdr = (k) => (lines.find((l) => l.startsWith("-- " + k + ": ")) || "").slice(("-- " + k + ": ").length);
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit" && hdr("Rollback").startsWith("UPDATE remediation_contracts SET verify_probe = replace("), "the fix opts in with APPLY-BY, DB and a single-line Rollback");
ok(!/\b(DELETE\s+FROM|DROP)\b/i.test(strip(fix)), "the fix deletes and drops nothing");

// ---- fixture (the objects the first file touches) ----
const BORN = "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open";
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT);
CREATE TABLE deployment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, resource_type TEXT, resource_name TEXT, action TEXT, version_id TEXT, deployed_by TEXT, deployed_at TEXT DEFAULT (datetime('now')), status TEXT DEFAULT 'success', notes TEXT);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, published_at TEXT);`);
  for (const id of [100623, 100626, 1000005]) {
    w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, module) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run("issue-" + id, id, "no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)", BORN + ".", "SELECT 'closed' AS expected, NULL AS observed", "d1-query", "qnfo-fleet-control", 1, "superseded", "probe-template-v3-generic");
  }
  w.prepare("INSERT INTO agent_issues VALUES (1000029, 'REVISE-NOOP-WAIVE-1', 'filed text', 'open'), (100439, 'Q08-GATE-ECONOMICS', 'filed text', 'open'), (100453, 'q08 preflight', 'filed text', 'open')").run();
  w.prepare("INSERT INTO ops_config (key, value, note) VALUES ('research_daily_neurons', '360000', NULL)").run();
  return w;
}

// ---- the probes ----
const CLASSES = ["issue-100623", "issue-100626", "issue-1000005", "fm-research-watchdog-held-stall", "fm-research-config-unlogged"];
const applied = () => { const w = world(); w.exec(strip(first)); if (!SKIP) w.exec(strip(fix)); return w; };
{
  const w = applied();
  for (const cls of CLASSES) {
    const p = (w.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = ?").get(cls) || {}).verify_probe || "";
    ok(literalSelect(p) === "ok", cls + " passes the runner's literal-select guard", literalSelect(p));
  }
  const c = w.prepare("SELECT status, last_verdict, attempts FROM remediation_contracts WHERE class = 'issue-100626'").get();
  ok(c.status === "active" && c.last_verdict === null && c.attempts === 0, "the repaired contract is active and re-armed for the runner", c);
  const p = w.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-100626'").get().verify_probe;
  ok(p.includes("the audit trigger for changes is missing") && !p.includes("the update audit trigger"), "only the words of the failure text changed");
  let o = w.prepare(p).get();
  ok(o.expected === "ok" && o.observed === "ok", "the repaired probe still reads ok on a working audit", o);
  w.exec("DROP TRIGGER ops_config_research_audit_upd");
  o = w.prepare(p).get();
  ok(o.observed === "the audit trigger for changes is missing", "and still fails, with its reason, when the trigger is gone", o);
}
if (!SKIP) {
  const w = applied(); w.exec(strip(fix));
  ok(w.prepare("SELECT COUNT(*) c FROM remediation_contracts WHERE class = 'issue-100626'").get().c === 1, "the fix is re-runnable");
  w.exec(hdr("Rollback"));
  ok(w.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-100626'").get().verify_probe.includes("the update audit trigger is missing"), "the Rollback restores the earlier words");
}

console.log((fail ? "FAILED " : "all assertions passed: ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
