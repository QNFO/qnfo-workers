// CLOSE-CHANNEL-PROBE-2 offline suite: replays migrations/2026-10-26-rem-a4-close-channel-probe.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs
// (agent_issues, issue_triage, the live close-sync triggers, issue_close_evidence_required) plus issue_lifecycle with its live trigger issue_lifecycle_au, and the live text of the old contract issue-100419.
// Proves: the header opts in and rolls back; the OLD probe (two evidence families, rolling updated_at window) was blind to a session close that carries neither evidence family; the NEW probe reads
// ok only with at least 20 closes in the last 2880 minutes and none of them unchannelled, whatever wrote the close (a trigger sync, a script channel, a raw session close); it names the count when one
// close carries no channel, lets a NULL close age out after 48 hours, refuses to pass on a quiet fleet (fewer than 20 closes), and ignores an issue that was reopened; the probe is one literal SELECT
// without a write keyword; the contract keeps its class, module and status, the backup holds the old text, the note lands once, a replay changes nothing and the Rollback line restores the old contract.
// Output MUST contain "0 failed" on success.   node migrations/rem-a4-close-channel-probe.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a4-close-channel-probe.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");
ok(!/\bCREATE\s+TRIGGER\b/i.test(body), "no trigger is created (AGENT-ISSUES-TRIGGER-DEPTH-1)");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);

// the live text of contract issue-100419 before this file (read from qnfo-audit 2026-10-26 19:30Z)
const OLD_PROBE = "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.status IN ('closed', 'resolved', 'wontfix') AND a.close_channel IS NULL AND a.updated_at > (strftime('%s', 'now') - 2880 * 60) * 1000 AND (t.close_evidence LIKE 'CONFLICT-REPAIR-SETTLE-1:%' OR t.close_evidence LIKE 'migration_runs ok for %')) AS TEXT) AS observed";
const OLD_ACTION = "MEASURES the defect: counts agent_issues closed, resolved or wontfix in the last 2880 minutes with a NULL close_channel whose issue_triage.close_evidence starts with CONFLICT-REPAIR-SETTLE-1: (scripts/conflict_repair.py settle_issue) or migration_runs ok for (scripts/apply_migrations.py resolve_failure_issue); 0 means no script close is unchannelled.";
const LIFECYCLE_DDL = `CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, event TEXT NOT NULL, from_status TEXT, to_status TEXT, has_evidence INTEGER, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TRIGGER issue_lifecycle_au AFTER UPDATE OF status ON agent_issues WHEN COALESCE(OLD.status, '') <> COALESCE(NEW.status, '') BEGIN INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, has_evidence) VALUES (NEW.id, CASE WHEN NEW.status IN ('closed', 'resolved', 'wontfix') THEN 'dispositioned' ELSE 'reopened' END, OLD.status, NEW.status, CASE WHEN EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '') THEN 1 ELSE 0 END); END;`;

const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString().slice(0, 19) + "Z";
let nextId = 5000;
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec(LIFECYCLE_DDL);
  w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (100419, 'CLOSE-CHANNEL-REQUIRED-1: 449/900 issue closes in 7d have NULL close_channel', 'text', 'claude-session', 'critical', 'open', 1, 1)").run();
  w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (100420, 'SOME-OTHER-ISSUE: unrelated', 'text', 'x', 'medium', 'open', 1, 1)").run();
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, status, module, attempts, last_verdict) VALUES ('issue-100419', 100419, 'p', ?, ?, 'd1-query', 60, 'qnfo-fleet-control', 'active', 'canary-ahead-probes-1', 17, 'fail')").run(OLD_ACTION, OLD_PROBE);
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, status) VALUES ('issue-100420', 100420, 'p', 'a', 'SELECT 1 AS expected, 1 AS observed', 'd1-query', 3, 'qnfo-ops', 'active')").run();
  return w;
}
// close an issue the way a real writer does: close_evidence first (issue_close_evidence_required), then the status change; the live trigger writes the dispositioned event, which is then dated minAgo
function closeIssue(w, { channel, minAgo, evidence = "evidence text", viaTriage = false }) {
  const id = nextId++;
  w.prepare("INSERT INTO agent_issues (id, title, description, source, status, created_at, updated_at) VALUES (?, ?, 't', 'x', 'open', 1, 1)").run(id, "CLOSED ISSUE " + id);
  if (viaTriage) w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (?, 'x', 'closed', 'tester', '2026-10-01', ?)").run(id, evidence);
  else {
    w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (?, 'x', 'triaged', 'tester', '2026-10-01', ?)").run(id, evidence);
    w.prepare("UPDATE agent_issues SET status = 'closed', close_channel = ?, updated_at = ? WHERE id = ?").run(channel, Date.now(), id);
  }
  w.prepare("UPDATE issue_lifecycle SET ts = ? WHERE issue_id = ? AND event = 'dispositioned'").run(iso(minAgo), id);
  return id;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const contract = (w) => q1(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-100419'");
const probe = (w) => q1(w, contract(w).verify_probe);
const channelled = (w, n, minAgo = 60) => { for (let i = 0; i < n; i++) closeIssue(w, { channel: i % 2 ? "auto:verified-remediation-trigger" : "auto:conflict-repair-settle", minAgo: minAgo + i }); };

// 1. the old probe was blind to a session close outside its two evidence families (issue 1000254's shape)
{
  const w = world();
  channelled(w, 25);
  closeIssue(w, { channel: null, minAgo: 120, evidence: "PR 4254 closed as duplicate 2026-10-26T04:22Z: its sign-in fix merged via PR 4252" });
  const before = probe(w);
  ok(before.expected === "0" && before.observed === "0", "the OLD probe reads 0 although a close with no channel sits in the window (it only counts CONFLICT-REPAIR-SETTLE-1 and migration_runs ok evidence)", before);
  w.exec(sql);
  const c = contract(w);
  ok(/issue_lifecycle/.test(c.verify_probe) && !/CONFLICT-REPAIR-SETTLE-1/.test(c.verify_probe), "the contract now reads issue_lifecycle and no evidence family");
  const after = probe(w);
  ok(after.expected === "ok" && after.observed === "1 issues closed in the last 48 hours carry no close_channel", "the NEW probe names the one unchannelled close", after);
  ok(c.class === "issue-100419" && c.issue_id === 100419 && c.status === "active" && c.module === "canary-ahead-probes-1" && c.verify_transport === "d1-query" && c.attempts === 17, "class, issue, status, module, transport and attempts are kept", c);
  ok(!/VACUOUS/.test(c.action) && /CLOSE-CHANNEL-PROBE-2/.test(c.action) && /issue_lifecycle/.test(c.action) && /2026-10-28T09:08Z/.test(c.action), "the action text says what the probe measures and when it can read ok");
  ok(c.next_due_at !== null && Math.abs(Date.parse(c.next_due_at.replace(" ", "T") + "Z") - Date.now()) < 120000, "next_due_at is now, so the next consumer pass re-probes at once", c.next_due_at);
  ok(q1(w, "SELECT COUNT(*) n FROM bak_20261026_close_channel_contract").n === 1 && q1(w, "SELECT verify_probe p FROM bak_20261026_close_channel_contract WHERE class = 'issue-100419'").p === OLD_PROBE, "the backup table holds the old contract text");
  ok(q1(w, "SELECT COUNT(*) n FROM agent_issues WHERE id = 100419 AND instr(description, 'CLOSE-CHANNEL-PROBE-2') > 0").n === 1, "the issue carries the measured note");
  ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'CLOSE-CHANNEL-PROBE-2:%'").n === 1, "one decision_log row");
  ok(q1(w, "SELECT verify_probe p, action a FROM remediation_contracts WHERE class = 'issue-100420'").p === "SELECT 1 AS expected, 1 AS observed", "another contract is untouched");
  // the probe is one literal read-only statement (scripts/remediation_consumer.py is_literal_select)
  const low = c.verify_probe.toLowerCase(), WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
  ok(low.startsWith("select") && !WRITE_KW.some((k) => low.includes(k)) && !c.verify_probe.replace(/;\s*$/, "").includes(";"), "the probe is a single literal SELECT with no write keyword");
  // replay
  const snap = () => JSON.stringify([w.prepare("SELECT * FROM remediation_contracts ORDER BY class").all().map((r) => Object.assign({}, r, { next_due_at: null })), w.prepare("SELECT id, description FROM agent_issues ORDER BY id").all(), w.prepare("SELECT COUNT(*) n FROM decision_log").get(), w.prepare("SELECT * FROM bak_20261026_close_channel_contract").all()]);
  const s1 = snap();
  w.exec(sql);
  ok(snap() === s1, "a replay changes nothing (the first backup and the first note are kept)");
  // rollback
  w.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  const r = contract(w);
  ok(r.verify_probe === OLD_PROBE && r.action === OLD_ACTION, "the Rollback line restores the old probe and action from the backup");
}

// 2. ok needs volume and no unchannelled close, whatever wrote the close
{
  const w = world();
  w.exec(sql);
  channelled(w, 12);
  const few = probe(w);
  ok(few.observed === "unmeasured: fewer than 20 issue closes in the last 48 hours" && few.observed !== few.expected, "12 closes in the window: unmeasured, never ok (a quiet fleet cannot pass vacuously)", few);
  channelled(w, 12, 300);
  for (let i = 0; i < 3; i++) closeIssue(w, { viaTriage: true, minAgo: 30 + i });
  ok(q1(w, "SELECT COUNT(*) n FROM agent_issues WHERE close_channel LIKE 'auto:triage-sync:%'").n === 3, "the live close-sync trigger channels a close made through issue_triage");
  const good = probe(w);
  ok(good.expected === "ok" && good.observed === "ok", "27 closes in the window, every one channelled (script channels and the trigger sync): ok", good);
  // a raw session close with no channel inside the window
  const bad = closeIssue(w, { channel: null, minAgo: 45, evidence: "owner-chat session close" });
  const one = probe(w);
  ok(one.observed === "1 issues closed in the last 48 hours carry no close_channel", "one raw session close without a channel: the probe names it", one);
  closeIssue(w, { channel: null, minAgo: 200, evidence: "another" });
  ok(probe(w).observed === "2 issues closed in the last 48 hours carry no close_channel", "two unchannelled closes are counted as two");
  // the unchannelled closes age out after 2880 minutes
  w.prepare("UPDATE issue_lifecycle SET ts = ? WHERE event = 'dispositioned' AND issue_id IN (SELECT id FROM agent_issues WHERE close_channel IS NULL AND status = 'closed')").run(iso(2881));
  const aged = probe(w);
  ok(aged.observed === "ok", "once the unchannelled closes are older than 48 hours the probe reads ok (the 48 hours of soak)", aged);
  // an issue reopened after an unchannelled close is not counted
  const re = closeIssue(w, { channel: null, minAgo: 10, evidence: "closed too early" });
  ok(probe(w).observed === "1 issues closed in the last 48 hours carry no close_channel", "an unchannelled close counts while the issue is closed");
  w.prepare("UPDATE agent_issues SET status = 'open' WHERE id = ?").run(re);
  ok(probe(w).observed === "ok", "the same issue reopened is not counted", probe(w));
  // a channel stamped later (a backfill) clears the close
  const late = closeIssue(w, { channel: null, minAgo: 20, evidence: "stamped later" });
  ok(probe(w).observed !== "ok", "an unchannelled close is counted");
  w.prepare("UPDATE agent_issues SET close_channel = 'session:backfill' WHERE id = ?").run(late);
  ok(probe(w).observed === "ok", "stamping the channel clears it");
}

// 3. the migration touches nothing when the contract is already on the new probe or the issue is closed
{
  const w = world();
  w.exec(sql);
  const snap = () => JSON.stringify([w.prepare("SELECT * FROM remediation_contracts ORDER BY class").all(), w.prepare("SELECT id, description, status FROM agent_issues ORDER BY id").all()]);
  w.prepare("UPDATE remediation_contracts SET next_due_at = '2030-01-01 00:00:00' WHERE class = 'issue-100419'").run();
  const s1 = snap();
  w.exec(sql);
  ok(snap() === s1, "an applied contract keeps its own next_due_at on a second apply");
}
{
  const w = world();
  const closedEv = "closed by someone with evidence";
  w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (100419, 'x', 'triaged', 'tester', '2026-10-01', ?)").run(closedEv);
  w.prepare("UPDATE remediation_contracts SET status = 'monitoring', last_verdict = 'pass' WHERE class = 'issue-100419'").run();
  w.prepare("UPDATE agent_issues SET status = 'closed', close_channel = 'auto:verified-remediation-trigger' WHERE id = 100419").run();
  w.exec(sql);
  ok(q1(w, "SELECT instr(description, 'CLOSE-CHANNEL-PROBE-2') p FROM agent_issues WHERE id = 100419").p === 0, "a closed issue gets no note");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
