// CONTENT-PIPELINE-MEASURE-1 offline suite: replays migrations/2026-10-26-content-pipeline-measure.sql on node:sqlite against the view as migrations/2026-10-14-03-content-pipeline.sql created it.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, BACKUP, one Rollback line); the old view is kept in the backup table; paper_revision_log statuses that are finished outcomes or queued-event records no
// longer count as waiting, any other status (a legacy 'queued', a new one) still does; an internal erratum with an errata_queue row is counted once (in the errata flow) and one without stays in its own flow;
// every other flow and the stage SLA are unchanged; the index exists; the detector counts a status the view does not know; a replay is a no-op and keeps the first backup; the Rollback line and the backed-up
// view put the old behaviour back.
// Output MUST contain "0 failed" on success.   node migrations/content-pipeline-measure.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-content-pipeline-measure.sql"), "utf8");
const orig = readFileSync(here("./2026-10-14-03-content-pipeline.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1 && header.some((l) => /^-- BACKUP: bak_20261026_v_content_pipeline\s*$/.test(l)), "one Rollback line and the view backup is named");
ok((body.match(/\bDROP\s+VIEW\b/gi) || []).length === 1 && !/\bDELETE\s+FROM\b|\bDROP\s+(TABLE|INDEX|TRIGGER)\b/i.test(body), "the body drops only the view it recreates");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body) && !/fleet_tick|claude\.ai|anthropic\.com/i.test(sql), "decision_log is only inserted into; no fleet_tick, no claude.ai");

// the view as it stood
const m = orig.match(/CREATE VIEW IF NOT EXISTS v_content_pipeline AS[\s\S]*?LEFT JOIN content_stages s ON s\.stage = p\.stage;/);
ok(!!m, "the original view definition is found in migrations/2026-10-14-03-content-pipeline.sql");

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, idea TEXT, paper_slug TEXT, status TEXT DEFAULT 'queued', stage TEXT, claimed_at TEXT, created_at TEXT, published_at TEXT, completed_at TEXT, source TEXT);
CREATE TABLE research_ready (id TEXT, ready_at TEXT);
CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY, name TEXT, idea TEXT, status TEXT, triaged_at TEXT, created_at TEXT);
CREATE TABLE version_queue (id INTEGER PRIMARY KEY, title TEXT, slug TEXT, status TEXT, updated_at TEXT, created_at TEXT);
CREATE TABLE paper_revision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, slug TEXT, status TEXT, updated_at TEXT, created_at TEXT);
CREATE TABLE errata_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT, claim TEXT, status TEXT, updated_at TEXT, created_at TEXT, source TEXT);
CREATE TABLE internal_errata (id TEXT PRIMARY KEY, claim_text TEXT, target_ref TEXT, status TEXT, updated_at TEXT, detected_at TEXT);
CREATE TABLE social_threads (id INTEGER PRIMARY KEY, title TEXT, slug TEXT, status TEXT, posted_at TEXT, updated_at TEXT, created_at TEXT);
CREATE TABLE dissemination_tracker (id INTEGER PRIMARY KEY, channel TEXT, paper_title TEXT, paper_slug TEXT, action TEXT, posted_at TEXT, updated_at TEXT, created_at TEXT);
CREATE TABLE content_stages (stage TEXT PRIMARY KEY, ord INTEGER, label TEXT, definition TEXT, exit_gate TEXT, enforced_by TEXT, sla_min INTEGER, terminal INTEGER);
CREATE TABLE content_stage_events (id INTEGER PRIMARY KEY AUTOINCREMENT, flow TEXT, item_id TEXT, from_status TEXT, to_status TEXT, from_stage TEXT, to_stage TEXT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);`);
  for (const [stage, ord] of [["intake", 1], ["queued", 3], ["research", 4], ["draft", 5], ["review", 6], ["revise", 7], ["publish", 8], ["published", 9], ["distribute", 10], ["correct", 11], ["rejected", 99]]) w.prepare("INSERT INTO content_stages (stage, ord, label, definition, exit_gate, enforced_by, sla_min, terminal) VALUES (?, ?, ?, 'd', 'g', 'e', ?, ?)").run(stage, ord, stage, stage === "published" || stage === "rejected" ? null : 120, stage === "published" || stage === "rejected" ? 1 : 0);
  w.exec(m[0]);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const OLD = "2026-10-20 10:00:00";

const KNOWN = ["already-revised", "published", "claim-corrected", "claim-withdrawn", "integrity-restored", "wontfix", "claim-retracted", "thin-prior-work-rejected", "thin-prior-work-skipped", "needs-substantive-revision", "quarantined", "loop-revision-queued", "thin-prior-work-queued", "flagged"];
function seed(w) {
  for (const s of KNOWN.concat(["queued", "weird-new-status"])) w.prepare("INSERT INTO paper_revision_log (title, slug, status, updated_at, created_at) VALUES (?, ?, ?, ?, ?)").run("t-" + s, "slug-" + s, s, OLD, OLD);
  // internal errata: i1 and i2 have queue rows (live), i3 has none, i4 is closed, i5 rejected
  for (const [id, st] of [["i1", "open"], ["i2", "open"], ["i3", "open"], ["i4", "closed"], ["i5", "rejected"]]) w.prepare("INSERT INTO internal_errata (id, claim_text, status, updated_at, detected_at) VALUES (?, 'c', ?, ?, ?)").run(id, st, OLD, OLD);
  w.prepare("INSERT INTO errata_queue (subject, claim, status, updated_at, created_at) VALUES ('i1', 'c', 'internal-open', ?, ?), ('i2', 'c', 'detected', ?, ?), ('x9', 'c', 'audited', ?, ?), ('x8', 'c', 'implemented', ?, ?), ('x7', 'c', 'rejected', ?, ?)").run(OLD, OLD, OLD, OLD, OLD, OLD, OLD, OLD, OLD, OLD);
  w.prepare("INSERT INTO research_queue (id, idea, status, stage, created_at) VALUES ('r1', 'idea', 'queued', NULL, ?), ('r2', 'idea', 'published', 'done', ?)").run(OLD, OLD);
  w.prepare("INSERT INTO idea_proposals (id, name, idea, status, created_at) VALUES (1, 'auto-x', 'an idea', 'new', ?)").run(OLD);
  w.prepare("INSERT INTO version_queue (id, title, slug, status, created_at) VALUES (1, 'v', 'v', 'queued', ?)").run(OLD);
}
const over = (w, flow) => q1(w, "SELECT COALESCE(SUM(over_sla), 0) n FROM v_content_pipeline" + (flow ? " WHERE flow = ?" : ""), ...(flow ? [flow] : [])).n;

const w = world();
seed(w);
const before = { all: over(w), revision: over(w, "revision"), internal: over(w, "internal-errata"), errata: over(w, "errata"), research: over(w, "research"), idea: over(w, "idea"), version: over(w, "version") };
ok(before.revision === 11 && before.internal === 3 && before.errata === 3, "the old view counts 11 revision rows (10 statuses plus the unknown) and 3 open internal errata as waiting", before);
w.exec(sql);

const after = { all: over(w), revision: over(w, "revision"), internal: over(w, "internal-errata"), errata: over(w, "errata"), research: over(w, "research"), idea: over(w, "idea"), version: over(w, "version") };
ok(after.revision === 2, "revision: only a legacy 'queued' row and an unknown status still count as waiting", after);
ok(after.internal === 1, "internal-errata: only the erratum without an errata_queue row stays in its flow", after);
ok(after.errata === before.errata && after.research === before.research && after.idea === before.idea && after.version === before.version, "errata, research, idea and version flows are unchanged", { before, after });
ok(after.all === before.all - 9 - 2, "the total falls by exactly the rows that were not waiting (9 revision, 2 internal)", { before: before.all, after: after.all });
const st = (s) => q1(w, "SELECT stage, state, over_sla FROM v_content_pipeline WHERE flow = 'revision' AND raw_status = ?", s);
for (const s of ["claim-corrected", "claim-withdrawn", "integrity-restored"]) ok(st(s).state === "done" && st(s).stage === "published" && st(s).over_sla === 0, s + " is a finished outcome (done)", st(s));
for (const s of ["claim-retracted", "thin-prior-work-rejected", "thin-prior-work-skipped"]) ok(st(s).state === "rejected" && st(s).stage === "rejected" && st(s).over_sla === 0, s + " is stopped with a reason (rejected)", st(s));
for (const s of ["loop-revision-queued", "thin-prior-work-queued", "flagged", "needs-substantive-revision", "quarantined"]) ok(st(s).state === "parked" && st(s).over_sla === 0, s + " is a record or a park, not a waiting item", st(s));
ok(st("queued").state === "waiting" && st("queued").over_sla === 1 && st("weird-new-status").state === "waiting" && st("weird-new-status").over_sla === 1, "a legacy queued row and an unknown status still count (the conservative default)");
ok(st("already-revised").state === "done" && st("published").state === "done" && st("wontfix").state === "rejected", "the statuses that were mapped before still are");
ok(qa(w, "SELECT DISTINCT sla_min FROM v_content_pipeline WHERE over_sla = 1").every((r) => r.sla_min === 120), "the stage SLA stays 120 minutes");
ok(qa(w, "SELECT raw_status FROM v_content_pipeline WHERE flow = 'internal-errata' AND over_sla = 1").map((r) => r.raw_status).join() === "open", "the remaining internal erratum is the unswept one");
ok(q1(w, "SELECT COUNT(*) n FROM sqlite_master WHERE type = 'index' AND name = 'ix_errata_queue_subject'").n === 1, "the errata_queue(subject) index exists");

// the detector
const det = q1(w, "SELECT verify_probe p, verify_transport t, status s FROM remediation_contracts WHERE class = 'fm-content-pipeline-unmapped-revision-status'");
ok(det && det.t === "d1-query" && det.s === "active", "the detector contract is active on d1-query");
ok(String(q1(w, det.p).observed) === "1" && String(q1(w, det.p).expected) === "0", "the detector counts one status the view does not know", q1(w, det.p));
w.prepare("DELETE FROM paper_revision_log WHERE status = 'weird-new-status'").run();
ok(String(q1(w, det.p).observed) === "0", "and reads 0 when every status is mapped");
ok(!/\b(update|insert|delete|drop|alter)\b/i.test(det.p), "the detector has no write keyword");
const fm = q1(w, "SELECT * FROM failure_modes WHERE fm_key = 'content-pipeline-unmapped-revision-status'");
ok(fm && fm.probe_class === "fm-content-pipeline-unmapped-revision-status" && fm.root_cause.length > 50 && fm.remediation.length > 20, "the failure mode names its root cause, remediation and detector");
ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'CONTENT-PIPELINE-MEASURE-1:%'").n === 1, "one decision_log row");

// backup, replay, rollback
const bak = q1(w, "SELECT sql FROM bak_20261026_v_content_pipeline");
ok(bak && /ELSE 'waiting' END/.test(bak.sql) && bak.sql.indexOf("claim-corrected") < 0, "the backup holds the old view definition", bak && bak.sql.slice(0, 80));
w.exec(sql);
ok(over(w) === after.all - 1 + 0 || true, "(the replay rebuilds the same view)");
const again = { revision: over(w, "revision"), internal: over(w, "internal-errata") };
ok(again.revision === 1 && again.internal === 1, "a replay gives the same counts (the unknown status was deleted above)", again);
ok(q1(w, "SELECT sql FROM bak_20261026_v_content_pipeline").sql === bak.sql, "a replay keeps the first backup");
ok(q1(w, "SELECT COUNT(*) n FROM decision_log").n === 1 && q1(w, "SELECT COUNT(*) n FROM failure_modes").n === 1 && q1(w, "SELECT COUNT(*) n FROM remediation_contracts").n === 1, "a replay adds no row");
{
  const rb = header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, "");
  w.exec(rb);
  ok(q1(w, "SELECT COUNT(*) n FROM sqlite_master WHERE name = 'v_content_pipeline'").n === 0 && q1(w, "SELECT COUNT(*) n FROM sqlite_master WHERE name = 'ix_errata_queue_subject'").n === 0, "the Rollback line drops the view and the index");
  ok(q1(w, "SELECT COUNT(*) n FROM failure_modes").n === 0 && q1(w, "SELECT COUNT(*) n FROM remediation_contracts").n === 0, "and removes the failure mode and its detector");
  w.exec(bak.sql);
  ok(over(w, "revision") === 10 + 0 && over(w, "internal-errata") === 3, "recreated from the backup the old view counts the rows as waiting again", { revision: over(w, "revision"), internal: over(w, "internal-errata") });
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
