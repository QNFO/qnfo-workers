// REM-A7-QUEUE-2 offline suite: replays migrations/2026-10-26-rem-a7-queue.sql and then migrations/2026-10-26-rem-a7-queue-fix.sql on node:sqlite over the live-shaped base schema of
// qnfo-fleet-control/breach-doctor.test.mjs. Proves: the two evidence sentences are replaced exactly once and nowhere else, the rest of the evidence and the closed state are untouched, a replay changes
// nothing, a missing sentence (already corrected or never written) changes nothing, and the Rollback line restores both texts.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-queue-fix.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const first = readFileSync(here("./2026-10-26-rem-a7-queue.sql"), "utf8");
const fix = readFileSync(here("./2026-10-26-rem-a7-queue-fix.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = fix.split("\n").filter((l) => l.startsWith("--"));
const body = fix.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/im.test(body) && !/claude\.ai|anthropic\.com/i.test(fix) && !/[^\x00-\x7f]/.test(fix), "nothing is deleted or dropped, no claude.ai link, ASCII");

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
  w.exec(first);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const ev = (w, id) => q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = ?", id).e;

{
  const w = world();
  const b94 = ev(w, 1000094), b457 = ev(w, 1000457), b159 = ev(w, 1000159);
  const sd = () => q1(w, "SELECT description d, status s FROM agent_issues WHERE title LIKE 'RESEARCH-ERRATA-CLAIM-1:%'");
  const bSucc = sd().d;
  ok(b94.includes("233 implemented, which means routed") && b457.includes("the pipeline claims it when the daily neuron budget reopens at 00:00 UTC ("), "the first migration wrote the two sentences the fix replaces");
  w.exec(fix);
  const a94 = ev(w, 1000094), a457 = ev(w, 1000457);
  ok(a94.includes("234 implemented (233 internal_audit rows, which means routed, and one inbound-email row of 2026-08-28)") && !a94.includes("233 implemented, which means routed") && a94.replace("234 implemented (233 internal_audit rows, which means routed, and one inbound-email row of 2026-08-28)", "233 implemented, which means routed") === b94, "1000094 evidence carries the corrected count and is otherwise unchanged");
  ok(a457.includes("claims it in rank order, after re-armed proposals, revision rows and resumable-stage rows, while the daily neuron budget lasts (the budget reopens at 00:00 UTC; the 10-19 precedent") && !a457.includes("when the daily neuron budget reopens at 00:00 UTC ("), "1000457 evidence carries the rank-order wording");
  ok(ev(w, 1000159) === b159, "another card's evidence is untouched");
  const aSucc = sd();
  ok(aSucc.s === "open" && aSucc.d.startsWith(bSucc + "\nUPDATE 2026-10-26 18:45Z (REM-A7-QUEUE-2): lever (2) is live.") && aSucc.d.split("UPDATE 2026-10-26 18:45Z (REM-A7-QUEUE-2)").length === 2 && /87 duplicate errata rows/.test(aSucc.d) && /151 errata rows are waiting/.test(aSucc.d) && /0 published/.test(aSucc.d), "the open successor gets one dated line on the merged errata rows and keeps its text", aSucc.d.slice(-200));
  ok(q1(w, "SELECT status s FROM agent_issues WHERE id = 1000094").s === "closed" && q1(w, "SELECT status s FROM agent_issues WHERE id = 1000457").s === "closed", "both issues stay closed");
  const d = w.prepare("SELECT actor, action, predicted_outcome FROM decision_log ORDER BY id").all();
  ok(d.length === 2 && d[1].actor === "rem-a7-f3" && /^REM-A7-QUEUE-2:/.test(d[1].action) && /one to three budget days/.test(d[1].predicted_outcome), "one more decision_log row restates the expectation");
  const snap = () => JSON.stringify([w.prepare("SELECT * FROM issue_triage ORDER BY issue_id").all(), w.prepare("SELECT * FROM agent_issues ORDER BY id").all(), w.prepare("SELECT actor, action FROM decision_log ORDER BY id").all()]);
  const s1v = snap();
  w.exec(fix);
  ok(snap() === s1v, "a replay changes nothing");
  w.exec(fix.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  ok(ev(w, 1000094) === b94 && ev(w, 1000457) === b457 && sd().d === bSucc, "Rollback restores both texts and cuts the appended description line");
}
{
  const w = world();
  w.prepare("UPDATE issue_triage SET close_evidence = 'moot: handled elsewhere' WHERE issue_id IN (1000094, 1000457)").run();
  w.exec(fix);
  ok(ev(w, 1000094) === "moot: handled elsewhere" && ev(w, 1000457) === "moot: handled elsewhere", "evidence without the sentence is left as it is");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
