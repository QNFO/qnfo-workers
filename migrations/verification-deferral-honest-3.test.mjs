// VERIFICATION-DEFERRAL-HONEST-3 offline suite: replays migrations/2026-10-26-verification-deferral-honest-3.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped); the contract of issue 100064 (active on the deferral, or active on the PARKED-REARM-1 re-arm that followed
// migrations/2026-10-26-verification-deferral-honest-2.sql) takes the loop-owned template form exactly as contract_probe_templates_loop_merged writes it; the LIVE red-drain step 6 (PARKED-REARM-1, text read
// from live qnfo-audit 2026-10-26) leaves that contract alone while it re-arms the same contract in the form honest-2 wrote; the new probe reads pending for 48 hours and stale after; a closed issue, another
// source and a contract another doer changed are left alone; a replay changes nothing; the decision is logged once; the Rollback line puts the old contract back.
// Run: node migrations/verification-deferral-honest-3.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-verification-deferral-honest-3.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 700))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");
ok([...body.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].every((m) => Buffer.byteLength(m[1]) <= 50), "every LIKE pattern is at most 50 bytes (D1 limit)");

// red-drain step 6 (PARKED-REARM-1), as stored in live qnfo-audit fleet_tasks on 2026-10-26
const STEP6 = `UPDATE remediation_contracts SET status='active', next_due_at=datetime('now'),
        last_verdict='rearmed: PARKED-REARM-1 (was ' || substr(COALESCE(last_verdict,'?'),1,60) || '; an open issue and a standing detector keep an hourly probe)'
      WHERE status IN ('escalated','monitoring')
        AND NOT (COALESCE(module, '') LIKE 'probe-template-v2%-loop' AND instr(verify_probe, 'SELECT status FROM agent_issues WHERE id =') > 0) /* LOOP-OWNED-CONTRACT-MONITORING-1 */
        AND (substr(class,1,3) = 'fm-' OR substr(class,1,7) = 'belief-'
             OR (issue_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = 'open' AND a.title NOT LIKE 'METRIC-TRIGGER-%')
                 AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = remediation_contracts.issue_id AND c2.status IN ('active','holding'))
                 AND COALESCE((SELECT replace(substr(MAX(v.verified_at),1,19),'T',' ') FROM remediation_verifications v WHERE v.class = remediation_contracts.class), '1970-01-01 00:00:00') <= datetime('now','-50 minutes')))`;

const OLD_PROBE = "SELECT 'ok' AS expected, CASE WHEN EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = 100064 AND t.close_evidence LIKE '%both after issue 100064%' AND t.close_evidence LIKE '%no two failed generation runs between them%') THEN 'ok' ELSE 'pending: no two-piece recovery with no stall between the pieces recorded for 100064' END AS observed";
function world({ verdict = "rearmed: PARKED-REARM-1 (was monitoring:loop-owned-48h (the filing loop closes it; SLA-12; an open issue and a standing detector keep an hourly probe)", status = "active", source = "personal-companion", issue = "open", createdAgoH = 24 * 7 } = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, source TEXT, status TEXT DEFAULT 'open', created_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT 'p', action TEXT NOT NULL DEFAULT 'a', verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL DEFAULT 'd1-query', max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL DEFAULT 'x', expected_cadence_h INTEGER, status TEXT DEFAULT 'active', last_verdict TEXT, module TEXT, next_due_at TEXT, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, class TEXT, verified_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
  w.prepare("INSERT INTO agent_issues (id, title, source, status, created_at) VALUES (100064, 'COMPANION-PUBLISH-STALL-AUTO-1: x', ?, ?, ?)").run(source, issue, Date.now() - createdAgoH * 3600e3);
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, status, last_verdict, module, next_due_at, attempts, escalate_to) VALUES ('issue-100064', 100064, 'old precondition', 'VERIFICATION-DEFERRAL-HONEST-2: parked by a recorded decision', ?, ?, ?, 'probe-template-v2d-loop', '2026-10-26 18:36:49', 384, 'qnfo-fleet-control')").run(OLD_PROBE, status, verdict);
  w.prepare("INSERT INTO remediation_verifications (class, verified_at) VALUES ('issue-100064', '2026-10-20 10:00:00')").run();
  return w;
}
const one = (w, s, ...p) => w.prepare(s).get(...p);
const contract = (w) => one(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-100064'");

// the red-drain re-arm, on the contract as honest-2 left it (status monitoring, the old probe): re-armed, which is what was seen live
const live = world({ status: "monitoring", verdict: "monitoring:loop-owned-48h (the filing loop closes it; SLA-120M-2 escalation and the stale view report it)" });
live.exec(STEP6);
ok(contract(live).status === "active" && /^rearmed: PARKED-REARM-1/.test(contract(live).last_verdict), "fixture check: the live red-drain step 6 re-arms the contract in the form honest-2 wrote (as seen live)");

// the fix
const w = world();
w.exec(sql); w.exec(sql);   // a replay changes nothing
const c = contract(w);
ok(c.status === "monitoring" && c.next_due_at === null && c.deferred_since === null && c.attempts === 0 && c.module === "probe-template-v2d-loop", "the contract is monitoring, not due, not deferred, module probe-template-v2d-loop", c);
ok(c.last_verdict === "monitoring:loop-owned-48h (the filing loop closes it; SLA-120M-2 escalation and the stale view report it)", "with the verdict text of the loop-owned template");
ok(/^LOOP-OWNED-CONTRACT-MONITORING-1: the filing loop closes this issue on recovery\. This contract is parked as monitoring and is not probed/.test(c.action) && /VERIFICATION-DEFERRAL-HONEST-3/.test(c.action) && /decision_log names issue-100064/.test(c.action), "and its action, with the sentence of the decision");
const template = "SELECT 'ok' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = 100064) <> 'open' THEN 'ok' WHEN (SELECT created_at FROM agent_issues WHERE id = 100064) > (CAST(strftime('%s', 'now') AS INTEGER) - 172800) * 1000 THEN 'pending: filed by personal-companion, which owns it for 48h' ELSE 'stale: the filing loop personal-companion did not close it within 48h' END AS observed";
ok(c.verify_probe === template, "the probe is the loop-owned template of contract_probe_templates_loop_merged for source personal-companion", c.verify_probe);
ok(/^filed by a fleet loop under a mapped label/.test(c.precondition), "the precondition is the template's");
// the probe reads what the template reads
ok(/^stale: the filing loop personal-companion/.test(one(w, c.verify_probe).observed), "a 7 day old open issue reads stale (a monitoring contract is not probed, the stale view reports it)", one(w, c.verify_probe));
const young = world({ createdAgoH: 3 }); young.exec(sql);
ok(/^pending: filed by personal-companion, which owns it for 48h$/.test(one(young, contract(young).verify_probe).observed), "a 3 hour old issue reads pending");
w.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 100064").run();
ok(one(w, c.verify_probe).observed === "ok", "and reads ok once the issue is closed");
w.prepare("UPDATE agent_issues SET status = 'open' WHERE id = 100064").run();

// the live red-drain step 6 leaves the new contract alone
w.exec(STEP6);
ok(contract(w).status === "monitoring" && /^monitoring:loop-owned-48h/.test(contract(w).last_verdict), "the live red-drain step 6 (PARKED-REARM-1) leaves it parked: the loop-owned template is exempt", contract(w));

// the deferral form (before the re-arm) is covered too
const dfr = world({ verdict: "deferred" }); dfr.exec(sql);
ok(contract(dfr).status === "monitoring", "a contract still active on the deferral takes the form as well");
// guards
const closed = world({ issue: "closed" }); closed.exec(sql);
ok(contract(closed).status === "active" && !/HONEST-3/.test(contract(closed).action), "a closed issue 100064 is left alone");
const other = world({ source: "someone-else" }); other.exec(sql);
ok(contract(other).status === "active", "an issue of another source is left alone");
const doer = world({ verdict: "pass" }); doer.exec(sql);
ok(contract(doer).status === "active", "a contract that passes (another doer fixed it) is left alone");
const mon = world({ status: "monitoring", verdict: "monitoring:loop-owned-48h (x)" }); mon.exec(sql);
ok(contract(mon).status === "monitoring" && !/HONEST-3/.test(contract(mon).action), "a contract already parked is not rewritten");

// the decision
ok(one(w, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'VERIFICATION-DEFERRAL-HONEST-3') > 0").n === 1, "one decision_log row after two applies");
const dl = one(w, "SELECT * FROM decision_log WHERE instr(action, 'VERIFICATION-DEFERRAL-HONEST-3') > 0");
ok(dl.actor.startsWith("rem-a2") && dl.rollback_path.length > 40 && dl.predicted_outcome.length > 40 && /issue-100064/.test(dl.action), "the decision names its actor, the class, rollback and prediction");
ok(one(w, "SELECT COUNT(*) n FROM bak_20261026_vdh3_contract").n === 1 && one(w, "SELECT verify_probe p FROM bak_20261026_vdh3_contract").p === OLD_PROBE, "the backup holds the contract as it was");

// the Rollback
const down = /^-- Rollback: (.*)$/m.exec(sql)[1].split(";").map((s) => s.trim()).filter(Boolean);
ok(down.length === 1, "the Rollback is one statement", down.length);
for (const s of down) w.exec(s);
const back = contract(w);
ok(back.status === "active" && back.verify_probe === OLD_PROBE && /^rearmed: PARKED-REARM-1/.test(back.last_verdict) && /^VERIFICATION-DEFERRAL-HONEST-2/.test(back.action) && back.precondition === "old precondition", "Rollback: the contract is back as it was", back);
ok(one(w, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'VERIFICATION-DEFERRAL-HONEST-3') > 0").n === 1, "decision_log keeps its row (append-only)");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
