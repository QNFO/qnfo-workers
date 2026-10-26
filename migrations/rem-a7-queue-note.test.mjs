// REM-A7-QUEUE-3 offline suite: replays migrations/2026-10-26-rem-a7-queue.sql, then -queue-fix.sql, then -queue-note.sql on node:sqlite over the live-shaped base schema of
// qnfo-fleet-control/breach-doctor.test.mjs. Proves: the successor title and description say one errata row was claimed once and failed at reconcile (and the finding for the doer is appended once), the close evidence
// of 100129 and the failure wording of the successor probe are corrected, the probe still fails on a live-shaped queue and passes at 7 published corrections, nothing else changes, a replay changes nothing, a text that
// is already corrected is left alone, and the Rollback line restores the title, description, evidence and probe.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-queue-note.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const first = readFileSync(here("./2026-10-26-rem-a7-queue.sql"), "utf8");
const fix = readFileSync(here("./2026-10-26-rem-a7-queue-fix.sql"), "utf8");
const note = readFileSync(here("./2026-10-26-rem-a7-queue-note.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = note.split("\n").filter((l) => l.startsWith("--"));
const body = note.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/im.test(body) && !/claude\.ai|anthropic\.com/i.test(note) && !/[^\x00-\x7f]/.test(note), "nothing is deleted or dropped, no claude.ai link, ASCII");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);
const DESIRE = "Is mathematics invented or discovered? Consolidated from a video thesis (10 arguments for discovery: Plimpton 322 cross-cultural convergence) and a critique arguing the dichotomy is false (we invent representations and discover constrained consequences). Research sub-questions: (1) Which aspects of mathematical practice are invented vs discovered? (2) Does cross-cultural convergence evidence shared constraints? Target output: a defensible middle position that states the applicability puzzle precisely.";
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec("CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT, score REAL, decision TEXT, status TEXT DEFAULT 'queued', claimed_at TEXT, completed_at TEXT, paper_slug TEXT, created_at TEXT, stage TEXT, error TEXT, published_at TEXT, UNIQUE(source, source_id))");
  w.exec("CREATE TABLE intents (id TEXT PRIMARY KEY, desire TEXT, type TEXT, status TEXT)");
  w.prepare("INSERT INTO intents (id, desire, type, status) VALUES ('int-022429ffmvpihdfe', ?, 'task', 'promoted')").run(DESIRE);
  for (const id of [100129, 1000159, 1000231, 1000094, 1000457]) {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, 'text', 'qnfo-fleet-dashboard:owner-request', 'high', 'open', 1, 1)").run(id, "OWNER-TASK-" + id + ": a stalled queue card");
    w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01')").run(id);
    w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict) VALUES (?, ?, 'p', 'VACUOUS-PROBE-V3-1: a doer replaces this probe', 'SELECT 1 AS expected, 0 AS observed', 'd1-query', 'qnfo-fleet-control', ?, ?)").run("issue-" + id, id, id === 1000457 ? "superseded" : "active", id === 1000457 ? "superseded:birth" : "fail");
  }
  const rq = w.prepare("INSERT INTO research_queue (id, source, source_id, idea, score, decision, status, created_at) VALUES (?, 'remediation', ?, 'Correct the published paper x', 0.95, 'ACCEPT', 'queued', '2026-10-20T00:00:00Z')");
  for (let i = 1; i <= 3; i++) rq.run("rem-e" + i, "errata:" + i);
  w.exec(first);
  w.exec(fix);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const succ = (w) => q1(w, "SELECT id, title, description, status FROM agent_issues WHERE title LIKE 'RESEARCH-ERRATA-CLAIM-1:%'");
const probe = (w) => q1(w, "SELECT verify_probe p FROM remediation_contracts WHERE class = ?", "issue-" + succ(w).id).p;
const ev = (w, id) => q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = ?", id).e;
const snap = (w) => JSON.stringify([w.prepare("SELECT * FROM issue_triage ORDER BY issue_id").all(), w.prepare("SELECT * FROM agent_issues ORDER BY id").all(), w.prepare("SELECT class, verify_probe FROM remediation_contracts ORDER BY class").all(), w.prepare("SELECT actor, action FROM decision_log ORDER BY id").all()]);

{
  const w = world();
  const b = succ(w), bp = probe(w), b100129 = ev(w, 100129), b1000159 = ev(w, 1000159);
  ok(b.title.includes("none of the 233 errata remediation rows has ever been claimed") && b.description.includes("cloud_ops_events kind claim holds 0 claims of an errata: row.") && bp.includes(" ever claimed, ") && b100129.includes("174 errata remediation rows (0 ever claimed)"), "the earlier files wrote the four texts this file corrects");
  w.exec(note);
  const a = succ(w), ap = probe(w);
  ok(a.status === "open" && a.title.startsWith("RESEARCH-ERRATA-CLAIM-1: of the 233 errata remediation rows one was ever claimed (errata:7 on 10-18, which failed at reconcile) and none was published; they hold 174 of 192 ready slots"), "the successor title says one row was claimed once and keeps its prefix and tail", a.title);
  ok(a.description.includes("published_at is set on 0 and claimed_at is NULL on all of them (a re-arm resets it); cloud_ops_events kind claim holds one claim of an errata: row, errata:7 on 2026-10-18T13:51:04Z, which ended in reconcile: invalid paper contract and was re-armed, and none since.") && !a.description.includes("holds 0 claims of an errata: row"), "the description states the one claim");
  ok(a.description.split("FINDING 2026-10-26 19:05Z (REM-A7-QUEUE-3)").length === 2 && /stageReconcile writes that error when paperCompleteness\(draft-0\) fails/.test(a.description) && /run a single row first/.test(a.description) && a.description.includes("UPDATE 2026-10-26 18:45Z (REM-A7-QUEUE-2)"), "the finding for the doer is appended once after the earlier addendum");
  ok(/\ncode-task: repo=qnfo-workers path=qnfo-research-exec\/worker\.js\ncode-anchor: async function claimNew\(env\) \{\n/.test(a.description), "the code-task and code-anchor lines are still intact for the code loop");
  ok(ev(w, 100129) === b100129.replace("174 errata remediation rows (0 ever claimed)", "174 errata remediation rows (claimed_at is NULL on all of them; one claim event in the ledger, errata:7 on 2026-10-18T13:51Z, which stopped at reconcile: invalid paper contract)") && ev(w, 1000159) === b1000159, "100129 evidence carries the corrected clause and 1000159 is untouched");
  ok(ap === bp.replace(" ever claimed, ", " with claimed_at set, ") && !ap.includes(";"), "the probe differs only in the wording of one failure string");
  const r0 = q1(w, ap);
  ok(r0.expected === "ok" && r0.observed === "fewer than 7 errata corrections published in 7 days: 0 published, 0 with claimed_at set, 3 waiting", "the probe still fails on the live shape with the new wording", r0);
  for (let i = 10; i < 17; i++) w.prepare("INSERT INTO research_queue (id, source, source_id, idea, status, created_at, published_at, claimed_at) VALUES (?, 'remediation', ?, 'x', 'published', '2026-10-25T00:00:00Z', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day'), '2026-10-24T00:00:00Z')").run("rem-p" + i, "errata:" + i);
  ok(q1(w, ap).observed === "ok", "and passes at 7 published corrections, as before");
  const d = w.prepare("SELECT actor, action FROM decision_log ORDER BY id").all();
  ok(d.length === 3 && d[2].actor === "rem-a7-f3" && /^REM-A7-QUEUE-3:/.test(d[2].action), "one more decision_log row");
  ok(q1(w, "SELECT status s FROM agent_issues WHERE id = 100129").s === "closed", "closed cards stay closed");
  const s1v = snap(w);
  w.exec(note);
  ok(snap(w) === s1v, "a replay changes nothing");
  w.exec(note.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  const r = succ(w);
  ok(r.title === b.title && r.description === b.description && probe(w) === bp && ev(w, 100129) === b100129, "Rollback restores the title, description, evidence and probe");
}
{
  // texts that are already corrected or rewritten are left alone
  const w = world();
  w.prepare("UPDATE agent_issues SET title = 'RESEARCH-ERRATA-CLAIM-1: reworded by the doer', description = 'reworded description' WHERE title LIKE 'RESEARCH-ERRATA-CLAIM-1:%'").run();
  w.prepare("UPDATE issue_triage SET close_evidence = 'superseded by x: reworded' WHERE issue_id = 100129").run();
  const bp = probe(w);
  w.exec(note);
  const a = succ(w);
  ok(a.title === "RESEARCH-ERRATA-CLAIM-1: reworded by the doer" && a.description.startsWith("reworded description\nFINDING 2026-10-26 19:05Z (REM-A7-QUEUE-3)") && ev(w, 100129) === "superseded by x: reworded", "a reworded title and evidence are left as they are; the finding line is still appended once");
  ok(probe(w) === bp.replace(" ever claimed, ", " with claimed_at set, "), "the probe wording is still corrected");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
