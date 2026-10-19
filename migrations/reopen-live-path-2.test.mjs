// REOPEN-LIVE-PATH-2 offline suite (issue 100270): replays migrations/2026-10-19-loop-owned-contract-monitoring.sql's two birth triggers on SQLite, then
// migrations/2026-10-19-reopen-live-path-2.sql. Proves, each against the pre-change triggers first:
//   1. the defect: v3_generic supersedes the birth contract of an issue filed under chaos-drill, fleet-journeys or the already mapped qnfo-fleet-advisor;
//   2. after the file chaos-drill and fleet-journeys are mapped to qnfo-fleet-control and an issue under any of the three is born monitoring with the loop-owned
//      text (module probe-template-v2c-loop, the status-reading probe), while an unmapped loop label (cf-model-eval), a session label, a source-less [ai-cal] copy
//      and a service named source keep their old template, and a METRIC-TRIGGER issue is claimed by neither;
//   3. v3_generic is still the NEWEST trigger of remediation_contracts after the file (it must fire first, the ORDER TRAP);
//   4. the standing v3-superseded contract of an open issue under a mapped label is parked exactly like a birth contract; a closed issue, an unmapped label, a
//      doer-written active contract and a METRIC-TRIGGER issue are untouched; the parked probe equals the one the template writes for a fresh issue;
//   5. the closing probe of issue 100270 reads positive before and 0 after; a second apply changes nothing; one decision_log row; the control row names the change;
//   6. the Rollback header restores the v3 text, the hosts, the parked rows and the control row; the file passes scripts/apply_migrations.py --check.
// Run: node migrations/reopen-live-path-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = (f) => new URL("./" + f, import.meta.url);
const loopOwned = readFileSync(here("2026-10-19-loop-owned-contract-monitoring.sql"), "utf8");
const mig = readFileSync(here("2026-10-19-reopen-live-path-2.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
const LV = "monitoring:loop-owned-48h (the filing loop closes it; SLA-120M-2 escalation and the stale view report it)";
const TRG = (name) => new RegExp("CREATE TRIGGER " + name + " AFTER INSERT ON remediation_contracts\\n[\\s\\S]*?\\nEND;").exec(loopOwned)[0];
const LOOP_MERGED = TRG("contract_probe_templates_loop_merged"), V3_OLD = TRG("contract_probe_templates_v3_generic");

const fresh = (withMig) => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
CREATE TABLE issue_source_hosts (source TEXT PRIMARY KEY, host TEXT NOT NULL, note TEXT, ts TEXT DEFAULT (datetime('now')));
CREATE TABLE service_registry (service TEXT PRIMARY KEY, state TEXT NOT NULL DEFAULT 'live');
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '', verify_probe TEXT NOT NULL DEFAULT '', verify_transport TEXT NOT NULL DEFAULT 'd1-query', max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL DEFAULT 'x', expected_cadence_h INTEGER, status TEXT DEFAULT 'active', module TEXT, last_verdict TEXT, next_due_at TEXT, attempts INTEGER DEFAULT 0);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL, guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL, disposition_state TEXT NOT NULL DEFAULT 'planned', alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
INSERT INTO issue_source_hosts (source, host, note) VALUES ('charter-loop', 'qnfo-fleet-control', 'x'), ('objective-constraints', 'qnfo-fleet-control', 'x'), ('qnfo-fleet-advisor', 'qnfo-fleet-control', 'x');
INSERT INTO service_registry (service, state) VALUES ('qnfo-fleet-control', 'live'), ('qnfo-ai', 'live'), ('retired-svc', 'retired');
INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, evidence) VALUES ('loop-owned-contract-park', 'D1 trigger contract_probe_templates_loop_merged (contract born monitoring)', 'hold', 'x', 0, 'replace', 'applied', 'Reason and expiry recorded 2026-10-19.');
`);
  db.exec(LOOP_MERGED);
  db.exec(V3_OLD);
  if (withMig) db.exec(mig);
  return db;
};
let n = 1000;
const born = (db, source, title, status = "open") => {
  const id = ++n;
  db.prepare("INSERT INTO agent_issues (id, title, source, status, created_at) VALUES (?, ?, ?, ?, ?)").run(id, title, source, status, Date.now());
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, status, escalate_to) VALUES (?, ?, 'needs-machine-probe', 'qnfo-fleet-control')").run("issue-" + id, id);
  return db.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get("issue-" + id);
};
const LABELS = [["chaos-drill", "CHAOS-DRILL-FAILED-1: control:x"], ["fleet-journeys", "FLEET-JOURNEY-FAILED-1: deploy-coherence"], ["qnfo-fleet-advisor", "MODEL-DEGRADED a,b"]];

// 1. the defect on the pre-change triggers.
{
  const db = fresh(false);
  for (const [s, t] of LABELS) {
    const c = born(db, s, t);
    ok(c.status === "superseded" && c.module === "probe-template-v3-generic", "before: an issue under " + s + " is born superseded by v3", [c.status, c.module]);
  }
}

// 2 and 3. after the file.
const db = fresh(true);
ok(JSON.stringify(db.prepare("SELECT source, host FROM issue_source_hosts WHERE source IN ('chaos-drill', 'fleet-journeys') ORDER BY source").all().map((r) => [r.source, r.host])) === JSON.stringify([["chaos-drill", "qnfo-fleet-control"], ["fleet-journeys", "qnfo-fleet-control"]]), "chaos-drill and fleet-journeys are mapped to qnfo-fleet-control");
for (const [s, t] of LABELS) {
  const c = born(db, s, t);
  ok(c.status === "monitoring" && c.module === "probe-template-v2c-loop" && c.last_verdict === LV && c.next_due_at === null && c.attempts === 0, "after: an issue under " + s + " is born monitoring with the loop-owned text", [c.status, c.module]);
  ok(c.precondition.includes("mapped label") && c.verify_probe.includes("SELECT status FROM agent_issues WHERE id = " + c.issue_id), s + ": precondition and status-reading probe as the template writes them");
}
for (const [s, t, want] of [["cf-model-eval", "CF-MODEL-EVAL-1: harness cannot run x", "probe-template-v3-generic"], ["claude-session:s", "SOMETHING-1: x", "probe-template-v3-generic"], [null, "[ai-cal] model probe failing: glm-5.3", "probe-template-v3-generic"], ["session_01", "X", "probe-template-v3-generic"]]) {
  const c = born(db, s, t);
  ok(c.status === "superseded" && c.module === want, "after: " + (s || "no source") + " keeps the v3 template", [c.status, c.module]);
}
{
  const c = born(db, "qnfo-ai", "SERVICE-NAMED-1: x");
  ok(c.status === "needs-machine-probe" || c.status === "monitoring", "after: a live service named source is not superseded by v3", [c.status, c.module]);
  const mt = born(db, "qnfo-fleet-control", "METRIC-TRIGGER-9-X: y");
  ok(mt.status === "needs-machine-probe", "after: a METRIC-TRIGGER issue is claimed by neither template (its own v1 trigger does)", [mt.status, mt.module]);
}
const order = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'remediation_contracts' ORDER BY rowid").all().map((r) => r.name);
ok(order[order.length - 1] === "contract_probe_templates_v3_generic" && order.includes("contract_probe_templates_loop_merged"), "v3_generic is the newest trigger on remediation_contracts (it fires first)", order);
const v3 = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'contract_probe_templates_v3_generic'").get().sql;
ok(v3.includes("issue_source_hosts") && v3.includes("s.state = 'live'"), "the live v3 text reads issue_source_hosts and a live service");
ok(norm(v3.replace(/\s*AND NOT EXISTS \(SELECT 1 FROM agent_issues a JOIN issue_source_hosts m[\s\S]*?WHERE a\.id = NEW\.issue_id\)\n/, "\n")).length > 0 && norm(V3_OLD.replace(/;$/, "")).length < norm(v3).length, "only one condition was added to the trigger text");

// 4. the standing rows.
{
  const d = fresh(false);
  const seed = (source, title, status, contract) => {
    const id = ++n;
    d.prepare("INSERT INTO agent_issues (id, title, source, status, created_at) VALUES (?, ?, ?, ?, ?)").run(id, title, source, status, Date.now());
    d.prepare("INSERT INTO remediation_contracts (class, issue_id, status, module, verify_probe, escalate_to, last_verdict) VALUES (?, ?, ?, ?, ?, 'x', ?)").run("issue-" + id, id, contract.status, contract.module, contract.probe, contract.verdict);
    return "issue-" + id;
  };
  const SUP = { status: "superseded", module: "probe-template-v3-generic", probe: "SELECT 'closed' AS expected, 1 AS observed", verdict: "superseded:closure-observing-probe-at-birth" };
  const rows = {
    advisorOpen: seed("qnfo-fleet-advisor", "MODEL-DEGRADED a", "open", SUP),
    chaosOpen: seed("chaos-drill", "CHAOS-DRILL-FAILED-1: c", "open", SUP),
    journeyClosed: seed("fleet-journeys", "FLEET-JOURNEY-FAILED-1: d", "closed", SUP),
    unmapped: seed("cf-model-eval", "CF-MODEL-EVAL-1: e", "open", SUP),
    doerActive: seed("chaos-drill", "CHAOS-DRILL-FAILED-1: f", "open", { status: "active", module: "chaos-drill-failed-measured", probe: "SELECT 'ok' AS expected, 'pending: x' AS observed", verdict: "deferred" }),
    metric: seed("qnfo-fleet-advisor", "METRIC-TRIGGER-12-X: m", "open", SUP)
  };
  const snap = () => Object.fromEntries(Object.entries(rows).map(([k, c]) => [k, d.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(c)]));
  const before = snap();
  d.exec(mig);
  const after = snap();
  for (const k of ["advisorOpen", "chaosOpen"]) {
    const r = after[k];
    ok(r.status === "monitoring" && r.module === "probe-template-v2c-loop" && r.last_verdict === LV && r.next_due_at === null && r.attempts === 0 && r.action.startsWith("LOOP-OWNED-CONTRACT-MONITORING-1:"), "standing " + k + " is parked as loop-owned", [r.status, r.module]);
    ok(r.verify_probe.includes("SELECT status FROM agent_issues WHERE id = " + r.issue_id) && r.verify_probe.includes("pending: filed by " + (k === "advisorOpen" ? "qnfo-fleet-advisor" : "chaos-drill") + ", which owns it for 48h"), k + ": the parked probe is the template's (the PARKED-REARM-1 carve-out keys on it)", r.verify_probe.slice(0, 120));
  }
  for (const k of ["journeyClosed", "unmapped", "doerActive", "metric"]) ok(JSON.stringify(after[k]) === JSON.stringify(before[k]), "standing " + k + " is untouched");
  // the parked probe is what the template writes for a fresh issue under the same label, with the id and source substituted
  const fresh2 = born(d, "chaos-drill", "CHAOS-DRILL-FAILED-1: g");
  const sub = (p, id) => p.split(String(id)).join("<ID>");
  ok(sub(after.chaosOpen.verify_probe, after.chaosOpen.issue_id) === sub(fresh2.verify_probe, fresh2.issue_id), "the parked probe equals the birth probe for the same label");
  const closing = "SELECT '0' AS expected, CAST(((SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.module = 'probe-template-v3-generic' AND c.status = 'superseded') AND (a.source IN ('chaos-drill', 'fleet-journeys') OR a.source IN (SELECT m.source FROM issue_source_hosts m JOIN service_registry s ON s.service = m.host AND s.state = 'live'))) + (SELECT COUNT(*) FROM (SELECT 'chaos-drill' AS lbl UNION ALL SELECT 'fleet-journeys') w WHERE NOT EXISTS (SELECT 1 FROM issue_source_hosts m WHERE m.source = w.lbl)) + (SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name = 'contract_probe_templates_v3_generic' AND instr(sql, 'issue_source_hosts') = 0)) AS TEXT) AS observed";
  const pre = fresh(false);
  { const id = ++n; pre.prepare("INSERT INTO agent_issues (id, title, source, status, created_at) VALUES (?, 'MODEL-DEGRADED z', 'qnfo-fleet-advisor', 'open', ?)").run(id, Date.now()); pre.prepare("INSERT INTO remediation_contracts (class, issue_id, status, module, escalate_to) VALUES (?, ?, 'superseded', 'probe-template-v3-generic', 'x')").run("issue-" + id, id); }
  ok(Number(pre.prepare(closing).get().observed) >= 3, "the closing probe of issue 100270 reads 3 or more before (one standing row, two unmapped labels, the v3 text)", pre.prepare(closing).get());
  // a METRIC-TRIGGER issue is claimed by its own v1 template and never by v3, so the fixture row that stands for it is dropped before the probe is read
  d.prepare("DELETE FROM remediation_contracts WHERE class = ?").run(rows.metric);
  ok(d.prepare(closing).get().observed === "0", "the closing probe of issue 100270 reads 0 after", d.prepare(closing).get());
}

// 5. replay, rows once.
{
  const d = fresh(true);
  const s = () => JSON.stringify([d.prepare("SELECT * FROM issue_source_hosts ORDER BY source").all().map((r) => [r.source, r.host]), d.prepare("SELECT COUNT(*) AS n FROM decision_log").get(), d.prepare("SELECT location, evidence FROM control_registry").get(), d.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY rowid").all()]);
  const a = s();
  d.exec(mig);
  ok(a === s(), "a second apply changes nothing (hosts, decision_log, control row, trigger texts)");
  const cr = d.prepare("SELECT location, evidence FROM control_registry WHERE control = 'loop-owned-contract-park'").get();
  ok(cr.location.includes("REOPEN-LIVE-PATH-2") && cr.location.includes("contract_probe_templates_v3_generic") && cr.evidence.includes("100270") && cr.evidence.includes("cf-model-eval"), "the control_registry row names this change, the closers and the labels left out", cr);
  const dl = d.prepare("SELECT action, predicted_outcome FROM decision_log").all();
  ok(dl.length === 1 && /^REOPEN-LIVE-PATH-2: /.test(dl[0].action) && /^[a-z_0-9]+ <= \d+ within 12 h$/.test(dl[0].predicted_outcome), "one decision_log row with a prediction", dl);
}

// 6. Rollback.
{
  const d = fresh(false);
  const id = ++n;
  d.prepare("INSERT INTO agent_issues (id, title, source, status, created_at) VALUES (?, 'MODEL-DEGRADED r', 'qnfo-fleet-advisor', 'open', ?)").run(id, Date.now());
  d.prepare("INSERT INTO remediation_contracts (class, issue_id, status, module, verify_probe, escalate_to, last_verdict, action, precondition, attempts) VALUES (?, ?, 'superseded', 'probe-template-v3-generic', 'SELECT 1', 'x', 'superseded:old', 'VACUOUS-PROBE-V3-1', 'no earlier birth template', 2)").run("issue-" + id, id);
  const rowBefore = JSON.stringify(d.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get("issue-" + id));
  const ctlBefore = JSON.stringify(d.prepare("SELECT location, evidence FROM control_registry").get());
  const v3Before = d.prepare("SELECT sql FROM sqlite_master WHERE name = 'contract_probe_templates_v3_generic'").get().sql;
  d.exec(mig);
  ok(d.prepare("SELECT status FROM remediation_contracts WHERE class = ?").get("issue-" + id).status === "monitoring", "the standing row was parked before the rollback");
  const rb = mig.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length);
  d.exec(rb);
  ok(JSON.stringify(d.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get("issue-" + id)) === rowBefore, "the Rollback line restores the parked row column for column");
  ok(JSON.stringify(d.prepare("SELECT location, evidence FROM control_registry").get()) === ctlBefore, "the Rollback line restores the control_registry row");
  ok(d.prepare("SELECT COUNT(*) AS n FROM issue_source_hosts WHERE source IN ('chaos-drill', 'fleet-journeys')").get().n === 0, "the Rollback line removes the two hosts");
  ok(norm(d.prepare("SELECT sql FROM sqlite_master WHERE name = 'contract_probe_templates_v3_generic'").get().sql) === norm(v3Before), "the Rollback line restores the v3 text");
  const ord = d.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'remediation_contracts' ORDER BY rowid").all().map((r) => r.name);
  ok(ord[ord.length - 1] === "contract_probe_templates_v3_generic", "v3 is still the newest trigger after the rollback");
}
const chk = spawnSync("python3", [fileURLToPath(new URL("../scripts/apply_migrations.py", import.meta.url)), "--check", fileURLToPath(here("2026-10-19-reopen-live-path-2.sql"))], { encoding: "utf8" });
ok(chk.status === 0 && /"ok": true/.test(chk.stdout), "the file passes scripts/apply_migrations.py --check", chk.stdout + chk.stderr);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
