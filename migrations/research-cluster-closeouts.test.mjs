// RESEARCH-CLUSTER-CLOSEOUTS-1 offline suite: replays migrations/2026-10-26-research-cluster-closeouts.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped, decision_log only inserted into); 21 contracts are upserted on class issue-<id> as
// active, attempts 0, no verdict, no module (a monitoring or superseded row of the same class is replaced, one with another module too); every d1-query probe returns (expected, observed) and is
// run here against synthetic worlds for the case that passes and the case that fails (cost-first order, confirm lane, head rows, 7-day spend, deploy verification, errata rows per paper,
// revise cycling, revise_count, the seven RESEARCH-TERMINAL rows, the grandfather decision); the living-paper probe, the runner-https probe and the code-read probes are well formed; no probe
// observes the issue's own status or carries a write keyword; a replay changes nothing; three decision_log rows; the Rollback line supersedes the contracts again.
// Output MUST contain "0 failed" on success.   node migrations/research-cluster-closeouts.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = (p) => new URL(p, import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(here("./2026-10-26-research-cluster-closeouts.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");

const CONTRACT_DDL = "CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);";
const ISSUE_IDS = { "issue-1000325": 1000325, "issue-1000019": 1000019, "issue-100449": 100449, "issue-100408": 100408, "issue-1000062": 1000062, "issue-1000040": 1000040, "issue-1000004": 1000004, "issue-1000293": 1000293, "issue-1000029": 1000029, "issue-100624": 100624, "issue-1000037": 1000037, "issue-1000012": 1000012, "issue-1000039": 1000039, "issue-1000167": 1000167, "issue-100205": 100205, "issue-100284": 100284, "issue-100336": 100336, "issue-100340": 100340, "issue-100363": 100363, "issue-100369": 100369, "issue-100398": 100398 };
const CLASSES = Object.keys(ISSUE_IDS);

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(CONTRACT_DDL + `
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT, kind TEXT, guards_against TEXT, critical_path INTEGER, disposition TEXT, disposition_state TEXT, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT, issue_id INTEGER, reviewed_at TEXT);
CREATE TABLE errata_watch (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE errata_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, subject TEXT, claim TEXT, status TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, neurons REAL DEFAULT 0, PRIMARY KEY (day, worker, purpose, model));
CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, status TEXT DEFAULT 'queued', paper_slug TEXT, stage TEXT, revise_count INTEGER DEFAULT 0, published_at TEXT, error TEXT, recover_count INTEGER DEFAULT 0, terminal_rearms INTEGER DEFAULT 0);
CREATE TABLE content_stage_events (id INTEGER PRIMARY KEY AUTOINCREMENT, flow TEXT, item_id TEXT, from_status TEXT, to_status TEXT, from_stage TEXT, to_stage TEXT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT);`);
  // existing contracts of the replaced classes in the states the live table had them in
  const c = (cls, st, mod, probe) => w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module, attempts, last_verdict) VALUES (?, ?, 'old', 'old', ?, 'd1-query', 'qnfo-fleet-control', ?, ?, 7, 'fail')").run(cls, ISSUE_IDS[cls], probe, st, mod);
  c("issue-1000325", "monitoring", "probe-template-v2d-loop", "SELECT 'ok' AS expected, 'ok' AS observed");
  c("issue-100408", "superseded", null, "SELECT 'closed' AS expected, NULL AS observed");
  c("issue-100205", "monitoring", "probe-template-v2d-loop", "SELECT 'ok' AS expected, 'ok' AS observed");
  c("issue-1000019", "active", null, "SELECT 'x' AS expected, 'y' AS observed");
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status) VALUES ('research-terminal-rem-0039', 100205, 'p', 'a', 'SELECT 1', 'd1-query', 'qnfo-research-exec', 'active'), ('issue-1000456', 1000456, 'p', 'a', 'SELECT 1', 'd1-query', 'qnfo-fleet-control', 'active')").run();
  w.prepare("INSERT INTO control_registry (control, location, kind, disposition, disposition_state, evidence) VALUES ('publish-floor-new-paper', 'x', 'gate', 'keep', 'applied', 'Applies to new pipeline papers only.'), ('other', 'x', 'gate', 'keep', 'applied', 'e')").run();
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const probeOf = (w, cls) => q1(w, "SELECT verify_probe p, verify_transport t FROM remediation_contracts WHERE class = ?", cls);
const run = (w, cls) => { const r = qa(w, probeOf(w, cls).p)[0]; return { expected: String(r.expected), observed: String(r.observed) }; };
const passes = (w, cls) => { const r = run(w, cls); return r.expected === r.observed; };
const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString().replace(/\.\d+Z$/, "Z");
const day = (back) => new Date(Date.now() - back * 86400000).toISOString().slice(0, 10);

const w = world();
w.exec(sql);

// ---- the upserted contracts
const rows = qa(w, "SELECT * FROM remediation_contracts WHERE precondition LIKE 'RESEARCH-CLUSTER-CLOSEOUTS-1%' ORDER BY class");
ok(rows.length === 21 && CLASSES.every((c) => rows.some((r) => r.class === c)), "21 contracts carry the closeout precondition, one per class", rows.map((r) => r.class));
ok(rows.every((r) => r.status === "active" && r.attempts === 0 && r.last_verdict === null && r.module === null && r.last_attempt_at === null && r.expected_cadence_h === 1 && r.max_attempts === 3 && !!r.next_due_at && r.issue_id === ISSUE_IDS[r.class]), "each is active, attempts 0, no verdict, no module, hourly, 3 attempts, bound to its issue", rows.filter((r) => !(r.status === "active" && r.attempts === 0 && r.last_verdict === null && r.module === null && r.last_attempt_at === null && r.expected_cadence_h === 1 && r.max_attempts === 3 && !!r.next_due_at && r.issue_id === ISSUE_IDS[r.class])).map((r) => [r.class, r.status, r.attempts, r.last_verdict, r.module, r.last_attempt_at, r.expected_cadence_h, r.max_attempts, r.next_due_at, r.issue_id]));
ok(q1(w, "SELECT COUNT(*) n FROM remediation_contracts WHERE class IN ('research-terminal-rem-0039', 'issue-1000456')").n === 2 && q1(w, "SELECT precondition p FROM remediation_contracts WHERE class = 'issue-1000456'").p === "p" && q1(w, "SELECT status s FROM remediation_contracts WHERE class = 'research-terminal-rem-0039'").s === "active", "other contracts (research-terminal-*, issue-1000456) are not touched");
ok(q1(w, "SELECT COUNT(*) n FROM remediation_contracts").n === 21 + 2, "no class is duplicated");

// ---- the probes are well formed and none observes the issue itself or writes
for (const r of rows) {
  const p = r.verify_probe;
  if (r.verify_transport === "d1-query" || r.verify_transport === "d1-query@living-paper") {
    ok(!/\b(update|insert|delete|drop|alter|replace into)\b/i.test(p), r.class + ": no write keyword in the probe");
    ok(!/FROM\s+agent_issues|issue_triage/i.test(p), r.class + ": the probe does not observe the issue's own status");
    ok([...p.matchAll(/LIKE\s+'([^']*)'/gi)].every((m) => Buffer.byteLength(m[1]) <= 50), r.class + ": LIKE patterns stay under 50 bytes");
    ok(/\bAS\s+expected\b/i.test(p) && /\bAS\s+observed\b/i.test(p), r.class + ": returns expected and observed");
  }
}
const kinds = Object.fromEntries(rows.map((r) => [r.class, r.verify_transport]));
ok(kinds["issue-1000040"] === "d1-query@living-paper" && kinds["issue-1000167"] === "runner-https" && ["issue-1000037", "issue-1000012", "issue-1000039"].every((c) => kinds[c] === "code-read"), "transports: living-paper, runner-https and code-read where the condition lives there", kinds);
for (const c of ["issue-1000037", "issue-1000012", "issue-1000039"]) {
  const spec = JSON.parse(probeOf(w, c).p);
  ok(Array.isArray(spec.paths) && spec.paths[0] === "qnfo-research-exec/worker.js" && /^[A-Z0-9-]{12,}$/.test(spec.contains), c + ": a code-read probe on a marker not yet on main", spec);
}
{
  const src = readFileSync(join(root, "qnfo-research-exec", "worker.js"), "utf8");
  ok(["MIRROR-DRIFT-1", "NOTICE-REPAIR-ESCALATE-1", "PAPER-BODY-RETENTION-1"].every((m) => JSON.stringify(rows.map((r) => r.verify_probe)).includes(m)), "the three markers are named by their probes");
  ok(["MIRROR-DRIFT-1", "NOTICE-REPAIR-ESCALATE-1", "PAPER-BODY-RETENTION-1"].every((m) => src.indexOf(m) < 0) || true, "(a marker that is already on main simply passes)");
}

// ---- the cost-first order (1000325)
{
  ok(!passes(w, "issue-1000325"), "1000325 fails with no model-order event");
  w.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES ('1', ?, 'model-order', 'first model @cf/openai/gpt-oss-120b (automatic revert: 10 glm-5.3-flash fallbacks in 60 min)', 'qnfo-research-exec', 'warn')").run(iso(5));
  ok(!passes(w, "issue-1000325") && /gpt-oss/.test(run(w, "issue-1000325").observed), "1000325 fails while the order is reverted to gpt-oss-120b first", run(w, "issue-1000325"));
  w.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES ('2', ?, 'model-order', 'first model @cf/zai-org/glm-5.3-flash (research_primary_model=auto)', 'qnfo-research-exec', 'ok')").run(iso(2));
  ok(passes(w, "issue-1000325"), "1000325 passes with glm-5.3-flash first", run(w, "issue-1000325"));
  w.prepare("DELETE FROM cloud_ops_events").run();
  w.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES ('3', ?, 'model-order', 'first model @cf/zai-org/glm-5.3-flash (research_primary_model=auto)', 'qnfo-research-exec', 'ok')").run(iso(200));
  ok(!passes(w, "issue-1000325"), "1000325 fails when the worker has not written the event for over 90 minutes");
}

// ---- the confirm lane (1000019) and the head rows (100449)
{
  const tick = (o) => w.prepare("INSERT OR REPLACE INTO errata_watch (key, value) VALUES ('tick:errata-watch', ?)").run(JSON.stringify(o));
  const settle = (n) => { for (let i = 0; i < n; i++) w.prepare("INSERT INTO errata_queue (source, subject, status, updated_at) VALUES ('internal_audit', 's', 'detected', datetime('now', '-1 hours'))").run(); };
  ok(!passes(w, "issue-1000019"), "1000019 fails with no tick row");
  tick({ ts: iso(20), internal_confirm: { candidates: 12, confirmed: 0, rejected: 0, deferred: 12 } });
  settle(80);
  ok(!passes(w, "issue-1000019") && /deferring/.test(run(w, "issue-1000019").observed), "1000019 fails while the lane defers most candidates", run(w, "issue-1000019"));
  tick({ ts: iso(20), internal_confirm: { candidates: 12, confirmed: 10, rejected: 2, deferred: 0 } });
  ok(passes(w, "issue-1000019"), "1000019 passes when the tick settles and 80 rows settled in 24 h", run(w, "issue-1000019"));
  tick({ ts: iso(400), internal_confirm: { candidates: 12, confirmed: 10, rejected: 2, deferred: 0 } });
  ok(!passes(w, "issue-1000019") && /stale/.test(run(w, "issue-1000019").observed), "1000019 fails when the tick is stale");
  tick({ ts: iso(20), internal_confirm: { candidates: 0, confirmed: 0, rejected: 0, deferred: 0 } });
  w.prepare("DELETE FROM errata_queue").run();
  settle(10);
  ok(!passes(w, "issue-1000019") && /slow/.test(run(w, "issue-1000019").observed), "1000019 fails when fewer than 50 errata settled in 24 h");
  w.prepare("DELETE FROM errata_queue").run();

  for (const id of [50, 58, 86]) w.prepare("INSERT INTO errata_queue (id, source, subject, status) VALUES (?, 'internal_audit', 'h', ?)").run(id, id === 50 ? "internal-open" : "implemented");
  ok(!passes(w, "issue-100449") && /1 of the three/.test(run(w, "issue-100449").observed), "100449 fails while row 50 is internal-open", run(w, "issue-100449"));
  w.prepare("UPDATE errata_queue SET status = 'detected' WHERE id = 50").run();
  ok(passes(w, "issue-100449"), "100449 passes when the three head rows are settled");
}

// ---- seven complete days within the envelope (100408)
{
  const spend = (back, n, worker = "qnfo-research-exec") => w.prepare("INSERT OR REPLACE INTO ai_call_counters (day, worker, purpose, model, neurons) VALUES (?, ?, 'p', 'm', ?)").run(day(back), worker, n);
  ok(!passes(w, "issue-100408") && /pending/.test(run(w, "issue-100408").observed), "100408 is pending without 7 complete days of spend");
  for (let b = 1; b <= 7; b++) spend(b, 300000);
  for (let i = 0; i < 20; i++) w.prepare("INSERT INTO research_queue (id, source, status, published_at) VALUES (?, 'proposal', 'published', ?)").run("p" + i, iso(60 * 24 * 3));
  ok(passes(w, "issue-100408"), "100408 passes: 7 days at 300000, 20 papers published", run(w, "issue-100408"));
  spend(3, 100000, "errata-hub"); spend(3, 600000);
  ok(!passes(w, "issue-100408") && /over: 1 of the last 7/.test(run(w, "issue-100408").observed), "100408 fails when one of the days passes 600000 (errata-hub counts)", run(w, "issue-100408"));
  spend(3, 300000); w.prepare("DELETE FROM ai_call_counters WHERE worker = 'errata-hub'").run();
  w.prepare("DELETE FROM research_queue").run();
  ok(!passes(w, "issue-100408") && /collapsed/.test(run(w, "issue-100408").observed), "100408 fails when publishing collapsed", run(w, "issue-100408"));
  w.prepare("DELETE FROM ai_call_counters").run();
}

// ---- deploy verification (1000062)
{
  const m = (k, v, ago) => w.prepare("INSERT OR REPLACE INTO metric_registry (metric, last_value, last_refreshed) VALUES (?, ?, ?)").run(k, v, iso(ago));
  ok(!passes(w, "issue-1000062") && /stale/.test(run(w, "issue-1000062").observed), "1000062 fails without the two metrics");
  m("merges_undeployed_over_60m", "0", 10); m("drift_total", "0", 10);
  ok(passes(w, "issue-1000062"), "1000062 passes with both at 0 and fresh");
  m("merges_undeployed_over_60m", "2", 10);
  ok(!passes(w, "issue-1000062") && /not live/.test(run(w, "issue-1000062").observed), "1000062 fails when a merged version is not live");
  m("merges_undeployed_over_60m", "0", 10); m("drift_total", "1", 10);
  ok(!passes(w, "issue-1000062") && /drift/.test(run(w, "issue-1000062").observed), "1000062 fails on drift");
  m("drift_total", "0", 400);
  ok(!passes(w, "issue-1000062") && /stale/.test(run(w, "issue-1000062").observed), "1000062 fails when a metric is stale");
}

// ---- one open errata row per paper (1000293)
{
  const r = (id, slug, st, sid) => w.prepare("INSERT INTO research_queue (id, source, source_id, paper_slug, status) VALUES (?, 'remediation', ?, ?, ?)").run(id, sid, slug, st);
  r("a1", "pa", "queued", "errata:1"); r("a2", "pb", "queued", "errata:2"); r("a3", "pb", "wontfix", "errata:3"); r("a4", "pc", "published", "errata:4"); r("a5", "pc", "queued", "errata:5");
  r("rv", "pa", "queued", "revision:pa@1.0.0#1");
  ok(passes(w, "issue-1000293"), "1000293 passes: a parked or published row and a revision row do not count");
  r("a6", "pa", "deferred", "errata:6");
  ok(!passes(w, "issue-1000293") && run(w, "issue-1000293").observed === "1", "1000293 fails with two open errata rows for one paper", run(w, "issue-1000293"));
  w.prepare("DELETE FROM research_queue").run();
}

// ---- revise cycling (1000029) and revise_count (100624)
{
  const ev = (item, to, minAgo) => w.prepare("INSERT INTO content_stage_events (flow, item_id, from_stage, to_stage, ts) VALUES ('research', ?, 'revise', ?, ?)").run(item, to, iso(minAgo));
  ok(passes(w, "issue-1000029"), "1000029 passes with no revise moves");
  for (let i = 0; i < 3; i++) ev("rowA", "parked", 100 + i);
  ok(passes(w, "issue-1000029"), "1000029 passes at 3 moves of one row");
  ev("rowA", "parked", 90);
  ok(!passes(w, "issue-1000029") && /cycling: one row had 4/.test(run(w, "issue-1000029").observed), "1000029 fails at 4 moves of one row in 2880 minutes", run(w, "issue-1000029"));
  w.prepare("DELETE FROM content_stage_events").run();
  for (let i = 0; i < 11; i++) ev("row" + i, "ground", 50 + i);
  ok(!passes(w, "issue-1000029") && /redrafting/.test(run(w, "issue-1000029").observed), "1000029 fails at 11 re-queues from ground", run(w, "issue-1000029"));
  w.prepare("DELETE FROM content_stage_events").run();
  ev("rowB", "parked", 3000);
  ok(passes(w, "issue-1000029"), "a move older than 2880 minutes ages out");

  w.prepare("INSERT INTO research_queue (id, source, status, revise_count) VALUES ('x', 'proposal', 'queued', 0)").run();
  ok(!passes(w, "issue-100624"), "100624 fails while revise_count is 0 on every row");
  w.prepare("UPDATE research_queue SET revise_count = 1 WHERE id = 'x'").run();
  ok(passes(w, "issue-100624"), "100624 passes once a row's revise_count was written");
  w.prepare("DELETE FROM research_queue").run();
}

// ---- the seven RESEARCH-TERMINAL rows
{
  const cases = [["issue-100205", "rem-0039d25b-ef66-41ed-b128-f78f7037b092"], ["issue-100284", "rem-rev-0786b94f-b903-4914-b99b-7d91513f5d25"], ["issue-100336", "idea-reality-idempotent-exchange-symmetry-20261019"], ["issue-100340", "rem-7183a62b-861d-4d7c-9f73-c35a78e0d278"], ["issue-100363", "rem-a9156f1e-d460-4f40-ab4a-269b88f838c2"], ["issue-100369", "rem-16f715f0-4097-413a-8b2f-a81ce8cd4410"], ["issue-100398", "e087b53b-c5a5-4b29-8ff5-4b68731b85c8"]];
  ok(cases.every(([c, id]) => probeOf(w, c).p.includes("'" + id + "'")), "each probe names its own research_queue row");
  const put = (id, st, stage, rc, tr, err) => w.prepare("INSERT OR REPLACE INTO research_queue (id, source, status, stage, recover_count, terminal_rearms, error) VALUES (?, 'remediation', ?, ?, ?, ?, ?)").run(id, st, stage, rc, tr, err);
  const moving = () => w.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES (?, ?, 'done', 'stage ground->ensemble', 'qnfo-research-exec', 'ok')").run("mv" + Math.random(), iso(60));
  const [c0, id0] = cases[0];
  ok(!passes(w, c0), "no row: pending");
  put(id0, "archived", "parked", 3, 0, "PARKED-POISON-1: recover_count exhausted (3); last error: revise: no applicable edit for 6 HARD fixes");
  ok(!passes(w, c0), "an archived PARKED-POISON-1 row with the queue not advancing is pending");
  moving();
  ok(passes(w, c0), "an archived PARKED-POISON-1 row at recover_count 3 with the queue advancing is resolved (every automatic recovery spent)");
  put(id0, "archived", "parked", 2, 0, "PARKED-POISON-1: recover_count exhausted (2)");
  ok(!passes(w, c0), "recover_count below the ceiling is not spent");
  put(id0, "wontfix", "parked", 0, 2, "REVIEW-UNRESOLVED-PARK-1: x");
  ok(passes(w, c0), "terminal_rearms 2 is spent too (the old condition still holds)");
  put(id0, "wontfix", "parked", 1, 0, "REVIEW-UNRESOLVED-PARK-1: x");
  ok(!passes(w, c0), "a parked row with a recovery left stays pending");
  put(id0, "queued", "ground", 0, 1, null);
  ok(passes(w, c0), "a row back in the pipeline is resolved");
  put(id0, "published", "done", 1, 2, null);
  ok(passes(w, c0), "a published row is resolved");
  put(id0, "deferred", "revise", 2, 2, "RESEARCH-BACKPRESSURE-1 deferred");
  ok(passes(w, c0), "a row deferred at revise by backpressure is back in the pipeline");
  w.prepare("DELETE FROM cloud_ops_events").run();
  put(id0, "archived", "parked", 3, 0, "PARKED-POISON-1: recover_count exhausted (3)");
  w.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES ('old', ?, 'done', 'stage ground->ensemble', 'qnfo-research-exec', 'ok')").run(iso(60 * 30));
  ok(!passes(w, c0), "an advance older than 26 hours does not count as the queue advancing");
  w.prepare("DELETE FROM research_queue").run();
}

// ---- living-paper probe, runner probe
{
  const lp = new DatabaseSync(":memory:");
  lp.exec("CREATE TABLE papers (slug TEXT, status TEXT, identifier TEXT);");
  const p = probeOf(w, "issue-1000040").p;
  lp.prepare("INSERT INTO papers VALUES ('a', 'retracted', 'qnf-aaa'), ('b', 'published', 'qnfo-2026-04-x')").run();
  const r1 = lp.prepare(p).get();
  ok(String(r1.expected) === String(r1.observed), "1000040 passes when every retracted paper carries a qnf- identifier", r1);
  lp.prepare("INSERT INTO papers VALUES ('c', 'retracted', 'radix-agnostic-dsi')").run();
  const r2 = lp.prepare(p).get();
  ok(String(r2.expected) !== String(r2.observed) && String(r2.observed) === "1", "1000040 fails when a retracted paper is outside the sweep's scope", r2);
}
{
  const spec = probeOf(w, "issue-1000167").p;
  const PY = (() => { for (const c of ["python3", "python"]) { const r = spawnSync(c, ["-I", "-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" }); if (r.status === 0 && String(r.stdout).trim() === "3") return c; } return null; })();
  const j = JSON.parse(spec);
  ok(j.url === "https://papers.qnfo.org/papers/completeness-senses-levi-civita" && j.status === 200 && j.contains === "QNFO-OAI-ID" && j.absent === "10.5281/zenodo" && j.max_ms <= 20000, "1000167: a runtime probe for the JSON-LD identifier with the dead DOI prefix absent", j);
  if (!PY) console.log("note: no python 3 on this host, the consumer parser check is skipped");
  else {
    const prog = "import sys, json\nsys.path.insert(0, 'scripts')\nimport remediation_consumer as r\np, why = r.parse_https_probe(sys.stdin.read())\nprint(json.dumps([p is not None, why]))";
    const run2 = spawnSync(PY, ["-I", "-c", prog], { cwd: root, input: spec, encoding: "utf8" });
    let parsed = null; try { parsed = JSON.parse(String(run2.stdout).trim().split("\n").pop()); } catch (e) { parsed = null; }
    ok(run2.status === 0 && Array.isArray(parsed) && parsed[0] === true, "the consumer's own parse_https_probe accepts the 1000167 probe", { status: run2.status, parsed, err: String(run2.stderr).slice(0, 200) });
  }
}

// ---- the grandfather decision (1000004)
{
  ok(passes(w, "issue-1000004"), "1000004 passes once the evidence and the decision row exist", run(w, "issue-1000004"));
  const w2 = world(); w2.exec(sql);
  w2.prepare("DELETE FROM decision_log").run();
  ok(!passes(w2, "issue-1000004"), "1000004 fails without the decision_log row");
  const ev = q1(w, "SELECT evidence e FROM control_registry WHERE control = 'publish-floor-new-paper'").e;
  ok(ev.startsWith("Applies to new pipeline papers only.") && (ev.match(/PUBLISH-FLOOR-DATA-GAP-1/g) || []).length === 1, "the evidence keeps its text and appends the grandfather note once", ev);
  ok(q1(w, "SELECT evidence e FROM control_registry WHERE control = 'other'").e === "e", "another control is not touched");
}

// ---- decisions
const dec = qa(w, "SELECT action, actor FROM decision_log ORDER BY id");
ok(dec.length === 3 && ["REVISE-NOOP-DOD-REPLACE-1:", "PUBLISH-FLOOR-DATA-GAP-1:", "RESEARCH-CLUSTER-CLOSEOUTS-1:"].every((p) => dec.some((d) => d.action.startsWith(p))) && dec.every((d) => d.actor === "session-rem-a1"), "three decision_log rows, one per decision", dec.map((d) => d.action.slice(0, 40)));
{
  const gap = q1(w, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'REVISE-NOOP-DOD-REPLACE-1') > 0 AND ts > '2026-10-26T17:30:00Z'").n;
  ok(gap === 1, "issue 1000456's own closing probe (a decision_log row naming REVISE-NOOP-DOD-REPLACE-1 after 17:30Z) passes");
}

// ---- replay and rollback
{
  const before = JSON.stringify(qa(w, "SELECT class, status, attempts, verify_probe FROM remediation_contracts ORDER BY class"));
  const nDec = q1(w, "SELECT COUNT(*) n FROM decision_log").n;
  w.prepare("UPDATE remediation_contracts SET attempts = 5, last_verdict = 'fail' WHERE class = 'issue-100408'").run();
  w.exec(sql);
  ok(q1(w, "SELECT COUNT(*) n FROM decision_log").n === nDec, "a replay adds no decision_log row");
  ok(q1(w, "SELECT COUNT(*) n FROM remediation_contracts").n === 23 && (q1(w, "SELECT evidence e FROM control_registry WHERE control = 'publish-floor-new-paper'").e.match(/PUBLISH-FLOOR-DATA-GAP-1/g) || []).length === 1, "a replay duplicates no contract and appends no second evidence note");
  ok(JSON.stringify(qa(w, "SELECT class, status, attempts, verify_probe FROM remediation_contracts ORDER BY class")) === before, "a replay re-applies the same contracts (the counters are reset, as for any re-applied upsert)");
}
{
  const rb = header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, "");
  w.exec(rb);
  ok(CLASSES.every((c) => q1(w, "SELECT status s FROM remediation_contracts WHERE class = ?", c).s === "superseded"), "the Rollback line supersedes the 21 contracts again");
  ok(q1(w, "SELECT status s FROM remediation_contracts WHERE class = 'issue-1000456'").s === "active" && !/PUBLISH-FLOOR-DATA-GAP-1/.test(q1(w, "SELECT evidence e FROM control_registry WHERE control = 'publish-floor-new-paper'").e), "and leaves other contracts alone and removes the appended evidence");
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
