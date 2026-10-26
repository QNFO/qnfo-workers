// DASH-OWNER-ACTIONS-1 follow-up offline suite: replays migrations/2026-10-26-dash-owner-actions.sql (already applied, not edited) and then
// migrations/2026-10-26-dash-owner-actions-followup.sql on SQLite (node:sqlite) with the live column lists and the live texts of agent_issues 1000412 and 100576
// (read from qnfo-audit 2026-10-26). Proves, for each statement of the follow-up:
//  * agent_issues 1000412 no longer says that 'the loop that works 100576 reads that row' (no worker.js on main reads human_responses kind approve or the
//    OWNER-DECISION hand-off), its closing-probe sentence says the card must be closed, and every other word of it is kept;
//  * agent_issues 100576 keeps its text and gains ONE paragraph (a replay appends nothing) that says it is NOT an owner authorization and must not be executed before the
//    approve exists in human_responses with the OWNER-DECISION hand-off; the paragraph starts no probe contract and fires none of the description triggers;
//  * control_registry holds the hold (kind hold, reason, release condition, expiry in minutes, none above 120), the asks-a-decision gate (alternate 'Done or Snooze on
//    the card') and the twin-link hand-off exemption, each kept, applied, off the critical path, citing T-labels that exist in cmd-decide.test.mjs; the hard-marker gate
//    row no longer claims an embedded list stands in (it fails closed);
//  * belief_registry's one row gains the follow-up evidence once, every other column (created_at included) unchanged;
//  * the detector fm-owner-task-100576-acted-without-approve reads 0 on a clean table and above 0 when 100576 is closed or a new version of an item 2, 4 or 5 paper is
//    recorded (paper_revision_log, errata_actions) with no owner-session approve of the card, and returns to 0 when the approve exists;
//  * the re-ask probe of issue 1000412 passed on ANY approve row and ANY hand-off task while the card stayed open (reproduced here against the probe migration 1 wrote)
//    and now needs the card closed, in the approve branch only; a replay changes nothing;
//  * the decision_log row is appended once with its columns and a prediction in minutes; every probe is one read free of the write keywords;
//  * the Rollback line restores the probe, the action, both descriptions, the gate row and the belief evidence, removes the rows the file added and never touches decision_log.
// Run: node migrations/dash-owner-actions-followup.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const FILE1 = "2026-10-26-dash-owner-actions.sql", FILE2 = "2026-10-26-dash-owner-actions-followup.sql";
const sql1 = readFileSync(here(FILE1), "utf8"), sql2 = readFileSync(here(FILE2), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
const LIVE = {
 "title100576": "OWNER-TASK-op-mvln7t9l2192: Execute the seven fixes listed in agent issue 100140 (UIA-SOURCE-FIDELITY-1), now owner-authorized. Apply items 2, 4 and 5 (authorship wording in the ow",
 "d100576": "The owner queued this task on fleet.qnfo.org (owner_prompts op-mvln7t9l2192): Execute the seven fixes listed in agent issue 100140 (UIA-SOURCE-FIDELITY-1), now owner-authorized. Apply items 2, 4 and 5 (authorship wording in the owner's Ignorance Audit papers) exactly as specified on the issue, item 3 in the same owner paper, items 6 and 7 in the external repository and the registered abstract. For item 1, first re-check against the live text of qwave-qudit-advantage v0.7; if the issue's quoted text still cannot be reproduced, report the discrepancy back instead of guessing. Do not lower verification bars; do not touch papers.qnfo.org publication flow beyond the specified fixes. Definition of done: act on it, or record why not, and close with evidence in issue_triage.close_evidence (CLAUDE.md). Filed by qnfo-fleet-dashboard OWNER-NOTES-ROUTE-1.",
 "d1000412": "Charter pillar: autonomy. Parent: agent_issues 100360 (DASH-OWNER-ACTIONS-1).\nFact (cmd_log 2026-10-20 11:20Z to 11:34Z and 2026-10-24 00:10Z; human_actions 135): the owner typed Approve for the seven fixes in agent_issues 100140 five times and none executed, because the command line had no approve verb and the model path timed out or answered in prose. The owner card was then closed with Done on 2026-10-24 00:11:33Z, so 'approve 100140' now answers that no open card names that issue and the decision was never made. Related: 46 seconds before that Done a model-proposed button filed agent_issues 100576 (owner_prompts op-mvln7t9l2192, open), which tells the fleet to execute the seven fixes as 'now owner-authorized'. That wording is the model's, not the owner's: the notes of the same minute (human_responses 49 and 50) say authorization is pending, and the owner's decision is a human_responses row of kind approve with credential owner-session. The loop that works 100576 reads that row and does not treat the task text as the approval.\nDoer: migrations/2026-10-26-dash-owner-actions.sql reopens the card with a guarded UPDATE (its revert is in the Rollback line). qnfo-fleet-dashboard 1.70.0 shows Approve and Decline for each of the seven items on the card and files the approved items as ONE task for the revision and errata path of qnfo-research-exec. The decision is the owner's: the items edit the author's own paper bodies, so the fleet re-asks and never decides it.\nClosing probe: remediation contract issue-<id> passes once the owner's decision has reached the fleet: an approve of the card recorded with credential owner-session together with the OWNER-DECISION hand-off task in owner_prompts (the server's own marker), or an owner-session decline of every part with the card closed. It does not pass while the card is merely open, so reopening it proves nothing. The live proof that approve works end to end is issue 100360's own probe.\nDefinition of done: the owner has decided the card on fleet.qnfo.org and the probe reads the decision; close with that read in issue_triage.close_evidence."
};
const TITLE = "DASH-OWNER-ACTIONS-1: re-ask the owner for the seven decisions of agent_issues 100140 (owner card ha:uia-source-fidelity-100140 was closed with Done because Approve did not exist)";
const DONE_RES = "done via dashboard by owner (fleet.qnfo.org, emailed code)";
const KEY = "ha:uia-source-fidelity-100140";
// the live columns of qnfo-audit (sqlite_master, 2026-10-26)
const FIXTURE = `
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT DEFAULT 'normal', due TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, resolution TEXT);
CREATE TABLE human_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, kind TEXT NOT NULL, note TEXT, until TEXT, ts TEXT DEFAULT (datetime('now')), issue_id INTEGER, credential TEXT);
CREATE TABLE owner_prompts (id TEXT PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), mode TEXT, prompt TEXT, status TEXT, response TEXT, model TEXT, intent_id TEXT, error TEXT, issue_id INTEGER, visitor TEXT, retries INTEGER DEFAULT 0);
CREATE TABLE paper_revision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, doi TEXT, title TEXT, version_from TEXT, version_to TEXT, audit_summary TEXT, findings_json TEXT, status TEXT DEFAULT 'queued', changelog TEXT, new_doi TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE errata_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, queue_id INTEGER NOT NULL, email_id INTEGER, paper_doi TEXT, slug TEXT, version_from TEXT, version_to TEXT, risk TEXT DEFAULT 'low', clarification TEXT, acknowledgement TEXT, changelog TEXT, corrected_md TEXT, status TEXT DEFAULT 'drafted', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE belief_registry (belief_key TEXT PRIMARY KEY, claim TEXT NOT NULL, confidence REAL, evidence TEXT NOT NULL, probe_class TEXT NOT NULL, built_on TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE trigger_hits (t TEXT, issue_id INTEGER);
-- live triggers of agent_issues that a description or timestamp update meets (simplified where the live body is long; the conditions are the live ones)
CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id) BEGIN INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES ('issue-' || NEW.id, NEW.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 1, 'needs-machine-probe', 'birth'); END;
CREATE TRIGGER contract_probe_templates_v3_generic AFTER INSERT ON remediation_contracts WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL BEGIN UPDATE remediation_contracts SET status = 'active', module = 'probe-template-v3-generic', action = 'VACUOUS-PROBE-V3-1: template', verify_probe = 'SELECT ''x'' AS expected, ''absent'' AS observed' WHERE class = NEW.class; END;
CREATE TRIGGER agent_issues_recheck_count_upd AFTER UPDATE OF updated_at ON agent_issues WHEN NEW.status='open' AND OLD.status='open' AND OLD.updated_at IS NOT NULL AND NEW.updated_at IS NOT OLD.updated_at BEGIN UPDATE agent_issues SET recheck_count = COALESCE(recheck_count,0)+1 WHERE id = NEW.id; END;
CREATE TRIGGER agent_issues_runtime_probe_upd AFTER UPDATE OF description ON agent_issues WHEN NEW.status = 'open' AND instr(COALESCE(NEW.description, ''), 'runtime-probe: {') > 0 AND instr(COALESCE(OLD.description, ''), 'runtime-probe: {') = 0 BEGIN INSERT INTO trigger_hits VALUES ('runtime-probe', NEW.id); END;
CREATE TRIGGER agent_issues_code_probe_upd AFTER UPDATE OF description ON agent_issues WHEN NEW.status = 'open' AND instr(COALESCE(NEW.description, ''), 'code-probe: {') > 0 AND instr(COALESCE(OLD.description, ''), 'code-probe: {') = 0 BEGIN INSERT INTO trigger_hits VALUES ('code-probe', NEW.id); END;
`;
const db = new DatabaseSync(":memory:");
db.exec(FIXTURE);
const n = (q, ...a) => db.prepare(q).get(...a).n;
const one = (q, ...a) => db.prepare(q).get(...a);
const ins = db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)");
ins.run(100140, "UIA-SOURCE-FIDELITY-1: fix factual inconsistencies in the Ignorance Audit papers", "seven items", "x", "pipeline", "medium", 1, 1);
ins.run(100360, "DASH-OWNER-ACTIONS-1: the fleet command line does not execute an approval", "owner_decisions", "claude-session", "reliability", "critical", 1, 1);
ins.run(100576, LIVE.title100576, LIVE.d100576, "qnfo-fleet-dashboard:owner-request", "ops", "high", 1792800648033, 1792852560000);
ins.run(1000412, TITLE, LIVE.d1000412, "claude-session", "autonomy", "high", 1793013017000, 1793013017000);
// live: the contract of 100576 is born superseded (CLOSE-PROBE-CIRCULAR-1), the card was closed with Done, the notes and the Done are human_responses 49 to 51
db.prepare("UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-observing-probe-at-birth' WHERE class = 'issue-100576'").run();
db.prepare("INSERT INTO human_actions (slug, title, why, default_in_effect, action, status, created_at, updated_at, resolved_at, resolution) VALUES ('uia-source-fidelity-100140', 'UIA-SOURCE-FIDELITY-1: authorize the seven fixes', 'IDENTITY-BOUND: edits to the author''s own paper bodies', 'The papers stay as published.', 'Approve or decline each of the seven fixes in agent_issues 100140.', 'resolved', '2026-10-20T06:40:06Z', '2026-10-24 00:11:33', '2026-10-24 00:11:33', ?)").run(DONE_RES);
for (const kind of ["note", "note", "done"]) db.prepare("INSERT INTO human_responses (key, kind, credential) VALUES (?, ?, 'owner-session')").run(KEY, kind);

// the applied migration first (the live state the follow-up meets)
db.exec(sql1);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ctr = (cls) => one("SELECT * FROM remediation_contracts WHERE class = ?", cls);
const CLS = "issue-1000412";
const before = { probe: ctr(CLS).verify_probe, action: ctr(CLS).action, d412: one("SELECT description d FROM agent_issues WHERE id = 1000412").d, d576: one("SELECT description d FROM agent_issues WHERE id = 100576").d, belief: one("SELECT * FROM belief_registry"), gate: one("SELECT * FROM control_registry WHERE control = 'dash-owner-decision-hard-marker-gate'"), hits: n("SELECT COUNT(*) n FROM trigger_hits") };
ok(n("SELECT COUNT(*) n FROM agent_issues WHERE title = ?", TITLE) === 1 && one("SELECT id FROM agent_issues WHERE title = ?", TITLE).id === 1000412, "the first file did not re-file the re-ask issue (the live row, id 1000412, is the one the follow-up acts on)");
ok(before.probe.indexOf("THEN 'reask-100140-decided' WHEN EXISTS") > 0 && before.d412 === LIVE.d1000412 && before.d412.indexOf("The loop that works 100576 reads that row") > 0, "the state the follow-up meets: the live probe of migration 1, the live description with the false sentence", before.probe.slice(0, 80));
ok(n("SELECT COUNT(*) n FROM control_registry") === 3 && n("SELECT COUNT(*) n FROM decision_log") === 4 && n("SELECT COUNT(*) n FROM failure_modes") === 3, "migration 1 left 3 control rows, 4 decision rows and 3 failure modes");

// the defect of item 4, reproduced against the probe as migration 1 wrote it: an approve of ONE item and its hand-off pass it while the card is open
const cardOpen = () => db.prepare("UPDATE human_actions SET status = 'open', resolved_at = NULL, resolution = NULL WHERE slug = 'uia-source-fidelity-100140'").run();
const cardClose = (st = "resolved") => db.prepare("UPDATE human_actions SET status = ?, resolution = 'approve via dashboard by owner (fleet.qnfo.org, emailed code): approved 1-7' WHERE slug = 'uia-source-fidelity-100140'").run(st);
let k = 0;
const resp = (kind, cred = "owner-session", key = KEY) => db.prepare("INSERT INTO human_responses (key, kind, credential) VALUES (?, ?, ?)").run(key, kind, cred);
const handoff = (card = KEY, visitor = "owner-decision") => db.prepare("INSERT INTO owner_prompts (id, mode, prompt, status, visitor) VALUES (?, 'task', ?, 'queued', ?)").run("ho-" + (++k), "OWNER-DECISION from fleet.qnfo.org (owner session, decision 1): the owner APPROVED items 1 of 7 on owner card " + card + " (decision 1)", visitor);
const clear = () => db.exec("DELETE FROM human_responses WHERE id > 3; DELETE FROM owner_prompts");
const probeOf = (probe) => String(db.prepare(probe).get().observed);
const DECIDED = "reask-100140-decided", NONE = "reask-100140-no-decision-reached-the-fleet";
cardOpen(); resp("approve"); handoff();
ok(probeOf(before.probe) === DECIDED, "DEFECT 4 reproduced: with ONE approved item and its hand-off, and the card still open (six items undecided), the old probe reads decided", probeOf(before.probe));
clear();

db.exec(sql2);

// header and lint
const head = sql2.split("\n").slice(0, 3);
ok(head[0] === "-- APPLY-BY: ci" && head[1] === "-- DB: qnfo-audit" && /^-- Rollback: .+$/.test(head[2]) && (sql2.match(/^-- Rollback:/gm) || []).length === 1, "the file opts in with APPLY-BY, DB and ONE Rollback line", head);
const body = sql2.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(!/\bDELETE\b|\bDROP\b/i.test(body), "the body runs no DELETE or DROP (so no BACKUP line is needed)");
ok(!/claude\.ai|anthropic\.com/i.test(sql2), "no claude.ai or anthropic.com link");
ok(!/'-\d+ (hours?|days?)'/.test(body) && !/\b\d+\s*(hours?|days?|weeks?)\b/i.test(body), "no SQL window or threshold in hours or days (QUEUE-SLA-1)");
ok(!/^-- (BACKUP|APPLY-BY: manual)/m.test(sql2), "no BACKUP or manual header");

// 1. agent_issues 1000412
const d412 = one("SELECT description d, updated_at u, status s FROM agent_issues WHERE id = 1000412");
ok(d412.d.indexOf("The loop that works 100576 reads that row") === -1 && /no loop reads that row today/.test(d412.d) && /No worker\.js on main reads human_responses kind approve or the OWNER-DECISION hand-off \(only qnfo-fleet-dashboard writes them\)/.test(d412.d) && /not an authorization/.test(d412.d) && /owner-authorization-hold-100576/.test(d412.d), "1000412 no longer claims a loop reads the approve; it says none does and where 100576 is held", d412.d.slice(1000, 1700));
ok(/\(the server's own marker\) and the card closed because all seven items are decided, or an owner-session decline/.test(d412.d) && /It does not pass while the card is open \(a partial approval proves nothing until the last item is decided\)/.test(d412.d) && d412.s === "open", "its closing-probe sentence says the approve counts only with the card closed");
const keep = ["Charter pillar: autonomy. Parent: agent_issues 100360", "Fact (cmd_log 2026-10-20 11:20Z", "The decision is the owner's: the items edit the author's own paper bodies", "Definition of done: the owner has decided the card on fleet.qnfo.org"];
ok(keep.every((s) => d412.d.indexOf(s) >= 0) && d412.d.length > before.d412.length - 100, "every other paragraph of 1000412 is kept");
ok(!/runtime-probe: \{|code-probe: \{|code-task:|session-task:|depends-on:/.test(d412.d), "and it starts no probe line");
ok(d412.u !== 1793013017000 && d412.u > 1700000000000, "updated_at moved");

// 2. agent_issues 100576
const d576 = one("SELECT description d, status s, priority p FROM agent_issues WHERE id = 100576");
ok(d576.d.startsWith(before.d576) && d576.d.slice(before.d576.length, before.d576.length + 2) === "\n\n" && (d576.d.match(/OWNER-AUTHORIZATION-HOLD-1/g) || []).length === 1 && d576.s === "open" && d576.p === "high", "100576 keeps its text, gains ONE paragraph after a blank line, and stays open at its priority");
const para = d576.d.slice(before.d576.length + 2);
ok(/is NOT an owner authorization/.test(para) && /human_responses row of kind approve, credential owner-session, on owner card ha:uia-source-fidelity-100140/.test(para) && /OWNER-DECISION hand-off task in owner_prompts \(visitor owner-decision\)/.test(para) && /Do not execute this task/.test(para) && /do not close it before that approve exists/.test(para), "the paragraph says: not an owner authorization, what the owner's decision is, and not to execute or close before it exists", para.slice(0, 300));
ok(/Release: the approve and its hand-off exist/.test(para) && /re-evaluated every 120 minutes/.test(para) && /not a block without release/.test(para) && /fm-owner-task-100576-acted-without-approve/.test(para), "it names the release, the 120 minute re-evaluation and the detector");
ok(!/runtime-probe: \{|code-probe: \{|code-task:|session-task:|depends-on:/.test(para) && n("SELECT COUNT(*) n FROM trigger_hits") === before.hits, "it starts no probe line and fires none of the description triggers", n("SELECT COUNT(*) n FROM trigger_hits"));
ok(one("SELECT status s FROM remediation_contracts WHERE class = 'issue-100576'").s === "superseded", "the superseded birth contract of 100576 is untouched");

// 3. re-ask probe
const c412 = ctr(CLS);
ok(c412.verify_probe.indexOf("> 0) AND NOT EXISTS (SELECT 1 FROM human_actions WHERE slug = 'uia-source-fidelity-100140' AND status = 'open') THEN 'reask-100140-decided' WHEN EXISTS") > 0 && (c412.verify_probe.match(/AND NOT EXISTS \(SELECT 1 FROM human_actions WHERE slug = 'uia-source-fidelity-100140' AND status = 'open'\)/g) || []).length === 2, "the approve branch gains the open-card clause (the decline branch already had it): two clauses, one per branch");
ok(c412.attempts === 0 && c412.last_verdict === null && c412.status === "active" && c412.verify_transport === "d1-query" && c412.module === "doer-authored" && /once the card is closed because all seven items are decided/.test(c412.action), "the contract restarts, is still an active d1-query, and its action says the card must be closed");
cardOpen(); clear();
ok(probeOf(c412.verify_probe) === NONE, "no decision: NONE", probeOf(c412.verify_probe));
resp("approve"); handoff();
ok(probeOf(c412.verify_probe) === NONE, "FIX 4: one approved item and its hand-off with the card still open reads no-decision-reached-the-fleet (old probe: decided)", probeOf(c412.verify_probe));
cardClose("resolved");
ok(probeOf(c412.verify_probe) === DECIDED, "the approve and its hand-off with the card closed (all seven decided) read decided", probeOf(c412.verify_probe));
clear(); resp("approve");
ok(probeOf(c412.verify_probe) === NONE, "a closed card and an approve with no hand-off is still not a decision that reached the fleet");
clear(); resp("approve", "owner-key"); handoff();
ok(probeOf(c412.verify_probe) === NONE, "another credential does not pass it");
clear(); resp("approve"); handoff(KEY, null);
ok(probeOf(c412.verify_probe) === NONE, "a task without the server's marker does not pass it");
clear(); resp("decline"); cardClose("dismissed");
ok(probeOf(c412.verify_probe) === DECIDED, "the decline branch is unchanged: an owner-session decline that closed the card reads decided");
cardOpen();
ok(probeOf(c412.verify_probe) === NONE, "and a decline with the card open does not");
clear();

// 4. control_registry
const CTRL = { "owner-authorization-hold-100576": "hold", "dash-owner-decision-asks-gate": "gate", "owner-prompt-twin-link-handoff-exempt": "filter" };
const rows = db.prepare("SELECT * FROM control_registry WHERE control IN (?, ?, ?) ORDER BY control").all(...Object.keys(CTRL));
ok(rows.length === 3 && rows.every((r) => CTRL[r.control] === r.kind) && n("SELECT COUNT(*) n FROM control_registry") === 6, "control_registry holds the hold (hold), the asks-a-decision gate (gate) and the twin-link exemption (filter) beside the first file's three", rows.map((r) => r.control + ":" + r.kind));
for (const r of rows) ok(r.disposition === "keep" && r.disposition_state === "applied" && r.critical_path === 0 && r.location.length > 60 && r.guards_against.length > 60 && r.alternate_path.length > 20 && r.evidence.length > 100 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(r.reviewed_at) && (r.issue_id === 100360 || r.issue_id === 100576), r.control + " is kept, applied, off the critical path, tied to its issue, with location, what it guards against, an alternate and its evidence", r);
const g = rows.find((r) => r.control === "dash-owner-decision-asks-gate");
ok(g.alternate_path === "Done or Snooze on the card" && g.issue_id === 100360 && /decAsksDecision/.test(g.location) && /DEC_ASK_RX/.test(g.location) && /^\d{4}-/.test(g.alternate_tested_at) && /T2\b/.test(g.evidence) && /T18\b/.test(g.evidence) && /T19\b/.test(g.evidence), "the asks-a-decision gate: alternate 'Done or Snooze on the card', evidence T2, T18 and T19", g);
const t = rows.find((r) => r.control === "owner-prompt-twin-link-handoff-exempt");
ok(t.kind === "filter" && /noTwin/.test(t.location) && /OWNER-PROMPT-TWIN-LINK-1/.test(t.location + t.guards_against) && /\bT22\b/.test(t.evidence) && /cannot reach the exemption/.test(t.evidence), "the twin-link exemption: a filter, names noTwin and OWNER-PROMPT-TWIN-LINK-1, cites T22 and why a stranger cannot reach it");
const h = rows.find((r) => r.control === "owner-authorization-hold-100576");
const hold = h.location + " " + h.guards_against + " " + h.alternate_path + " " + h.evidence;
const mins = [...hold.matchAll(/\b(\d+) minutes?\b/g)].map((m) => Number(m[1]));
ok(h.issue_id === 100576 && /agent_issues 100576/.test(h.location) && /OWNER-AUTHORIZATION-HOLD-1/.test(h.location) && /recorded reason:/.test(h.evidence) && /Release condition: a human_responses row \(kind approve, credential owner-session, key ha:uia-source-fidelity-100140\) together with the OWNER-DECISION hand-off/.test(h.alternate_path) && /Expiry: 120 minutes/.test(h.evidence) && /with a release, not a block/.test(h.evidence), "the hold records its reason, its release condition (the approve with its hand-off) and a 120 minute expiry", h.evidence.slice(0, 200));
ok(mins.length >= 2 && mins.every((m) => m <= 120) && !/\b\d+\s*(hours?|days?|weeks?)\b|\bhourly\b/i.test(hold), "every period of the hold is in minutes and none is above 120", mins);
ok(h.alternate_tested_at === null && /Every other task of the fleet proceeds/.test(h.alternate_path), "the hold says what keeps running and does not claim a tested alternate");
const gate = one("SELECT * FROM control_registry WHERE control = 'dash-owner-decision-hard-marker-gate'");
ok(/FAILING CLOSED when the table cannot be read or holds no rows/.test(gate.location) && gate.location.indexOf("with an embedded list when the table cannot be read") === -1 && gate.evidence.indexOf("the embedded list stands in without the table") === -1 && /T18h, and T29 for each of the 73 live patterns/.test(gate.evidence) && gate.disposition === "keep" && gate.critical_path === 0 && gate.alternate_path === before.gate.alternate_path, "the hard-marker gate row says it fails closed (not that an embedded list stands in); disposition, alternate and the rest are unchanged", gate.location.slice(100, 400));
const decideSuite = readFileSync(new URL("../qnfo-fleet-dashboard/cmd-decide.test.mjs", import.meta.url), "utf8");
const cited = new Set(); for (const r of [...rows, gate]) for (const m of r.evidence.matchAll(/\bT\d+[a-z]?\b/g)) cited.add(m[0]);
const missing = [...cited].filter((x) => !new RegExp("[\"'\\s/]" + x + "[\\s\"':a-z(.,]").test(decideSuite));
ok(cited.size >= 7 && missing.length === 0, "every T-label the control evidence cites is in qnfo-fleet-dashboard/cmd-decide.test.mjs", { cited: [...cited], missing });

// 5. belief_registry
const bel = db.prepare("SELECT * FROM belief_registry").all();
ok(bel.length === 1 && bel[0].belief_key === before.belief.belief_key && bel[0].claim === before.belief.claim && bel[0].confidence === before.belief.confidence && bel[0].probe_class === before.belief.probe_class && bel[0].built_on === before.belief.built_on && bel[0].created_at === before.belief.created_at, "belief_registry still has the one row with every column but evidence unchanged (created_at kept by the INSERT OR REPLACE)");
ok(bel[0].evidence.startsWith(before.belief.evidence) && (bel[0].evidence.match(/ Follow-up 2026-10-26 \(/g) || []).length === 1 && /no worker\.js on main reads human_responses kind approve or the OWNER-DECISION marker/.test(bel[0].evidence) && /agent_issues 100576 still says 'now owner-authorized'/.test(bel[0].evidence) && /The confidence is unchanged/.test(bel[0].evidence), "its evidence keeps the original text and gains the follow-up once");

// 6. failure mode and detector
const FM = "owner-task-100576-acted-without-approve", D = "fm-" + FM;
const fm = one("SELECT * FROM failure_modes WHERE fm_key = ?", FM);
ok(fm && fm.probe_class === D && fm.issue_id === 100576 && fm.first_seen === "2026-10-26" && fm.root_cause && fm.remediation && fm.symptom && fm.blast_radius && fm.detector.indexOf(D) >= 0, "failure mode " + FM + " names its detector, issue, cause, remedy, symptom and blast radius");
const dc = ctr(D);
ok(dc && dc.verify_transport === "d1-query" && dc.status === "active" && dc.module === "failure-mode" && dc.expected_cadence_h === 1 && dc.max_attempts === 3 && dc.issue_id === null && dc.escalate_to === "qnfo-fleet-control", "one active hourly d1-query detector " + D, dc && { t: dc.verify_transport, s: dc.status });
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
const RT_WRITE_KW = ["insert ", "update ", "delete ", "drop ", "alter ", "create ", "attach ", "detach ", "pragma ", "replace ", "vacuum", "reindex"];
for (const cls of [D, CLS]) {
  const p = ctr(cls).verify_probe, low = " " + p.toLowerCase().replace(/\s+/g, " ") + " ";
  ok(/^ (select|with) /.test(low) && low.indexOf(";") === -1 && !WRITE_KW.some((w) => low.indexOf(w) !== -1) && !RT_WRITE_KW.some((w) => low.indexOf(" " + w) !== -1) && !/\breplace\b/.test(low), cls + " is one literal read free of the write keywords of the consumer and the runtime guard");
  const lits = [...p.matchAll(/(?:LIKE|GLOB) '([^']*)'/g)].map((m) => Buffer.byteLength(m[1]));
  ok(lits.every((b) => b <= 50), cls + " keeps every LIKE and GLOB literal under D1's 50 byte limit", lits);
  ok(!/\bFROM\s+(?:sqlite_master|pragma)/i.test(p), cls + " does not read the schema (no circular probe)");
}
const read = () => { const r = db.prepare(dc.verify_probe).get(); return { expected: String(r.expected), observed: String(r.observed) }; };
clear(); db.exec("DELETE FROM paper_revision_log; DELETE FROM errata_actions");
ok(same(read(), { expected: "0", observed: "0" }), "the detector reads 0 on a clean table (100576 open, no new version, no approve needed)", read());
const rev = (slug, from, to, created, status = "published") => db.prepare("INSERT INTO paper_revision_log (slug, version_from, version_to, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(slug, from, to, status, created, created);
const err = (slug, from, to, created) => db.prepare("INSERT INTO errata_actions (queue_id, slug, version_from, version_to, status, created_at, updated_at) VALUES (1, ?, ?, ?, 'routed', ?, ?)").run(slug, from, to, created, created);
rev("universal-ignorance-audit", "1.0.1", "v0.3", "2026-10-20 00:51:01", "integrity-restored"); rev("universal-ignorance-audit", "v0.3", "1.0.1", "2026-10-19 18:23:57", "claim-withdrawn");
ok(read().observed === "0", "the live rows of 2026-10-19 and 20 (before the hold) do not count", read());
rev("some-other-paper", "1.0.0", "1.0.1", "2026-10-26 13:00:00"); rev("ignorance-ai-pipeline-synthesis", "1.0.0", "1.0.0", "2026-10-26 13:00:00"); rev("ignorance-ai-pipeline-synthesis", "1.0.0", null, "2026-10-26 13:00:00", "flagged"); rev("universal-ignorance-audit", "1.0.1", "", "2026-10-26 13:00:00", "needs-substantive-revision");
ok(read().observed === "0", "another paper, an unchanged version, a row with no new version and a flag do not count", read());
rev("ignorance-ai-pipeline-synthesis", "1.0.0", "1.0.1", "2026-10-26 13:05:00");
ok(read().observed === "1", "a new version of an item 2 paper, with no approve, counts", read());
rev("universal-ignorance-audit", "1.0.1", "1.0.2", "2026-10-26 14:00:00", "claim-corrected"); rev("ai4metascience-ignorance-audit", "1.0.0", "1.0.1", "2026-10-26 14:00:01");
ok(read().observed === "3", "a new version of an item 4 paper and of the ai4metascience paper count too", read());
err("universal-ignorance-audit", "1.0.2", "1.0.3", "2026-10-26 15:00:00");
ok(read().observed === "4", "an errata_actions row that changes a version counts", read());
db.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 100576").run();
ok(read().observed === "5", "100576 closed with no approve counts", read());
resp("approve", "owner-key"); resp("decline"); resp("approve", "owner-session", "ha:another-card"); resp("note");
ok(read().observed === "5", "an approve under another credential, a decline, an approve of another card and a note do not release it", read());
resp("approve");
ok(read().observed === "0", "the owner-session approve of the card releases the hold: the same rows read 0", read());
db.exec("DELETE FROM human_responses WHERE id > 3");
db.prepare("UPDATE agent_issues SET status = 'open' WHERE id = 100576").run();
db.exec("DELETE FROM paper_revision_log; DELETE FROM errata_actions");

// 7. decision_log
ok(n("SELECT COUNT(*) n FROM decision_log") === 5 && n("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'DASH-OWNER-ACTIONS-1-FOLLOWUP: %'") === 1, "one decision_log row is appended (five in all)");
const dl = one("SELECT * FROM decision_log WHERE action LIKE 'DASH-OWNER-ACTIONS-1-FOLLOWUP: %'");
ok(dl.capability_gain && dl.predicted_outcome && dl.surfaces_tested && dl.rollback_path && dl.reach_gain && dl.assumption && dl.evidence && dl.blast_radius && dl.outcome === "pending post-deploy measurement" && /^session_01QpQv19uh1padRwZ3u1r766:/.test(dl.actor), "it carries every real column: capability_gain, predicted_outcome, reach_gain, surfaces_tested and a rollback path");
ok(!/\b\d+\s*(h|hours?|days?|d|weeks?)\b|\ban hour\b/i.test(dl.predicted_outcome) && /\b\d+ minutes?\b/.test(dl.predicted_outcome) && dl.predicted_outcome.indexOf(" within ") === -1, "its prediction is stated in minutes (and does not start the decision_predictions parser)", dl.predicted_outcome);

// replay: a no-op
const snap = () => JSON.stringify([db.prepare("SELECT * FROM agent_issues ORDER BY id").all().map((r) => r.id + ":" + r.description.length + ":" + r.recheck_count), db.prepare("SELECT class, verify_probe, action, attempts FROM remediation_contracts ORDER BY class").all(), db.prepare("SELECT * FROM control_registry ORDER BY control").all(), db.prepare("SELECT * FROM belief_registry").all(), n("SELECT COUNT(*) n FROM decision_log"), n("SELECT COUNT(*) n FROM failure_modes")]);
const s1 = snap();
db.exec(sql2);
ok(snap() === s1, "a replay is a no-op: no second paragraph, sentence, probe clause, control row, belief line, failure mode or decision row; nothing restarted");
db.prepare("UPDATE remediation_contracts SET attempts = 2 WHERE class = ?").run(CLS);
db.prepare("UPDATE control_registry SET evidence = evidence || ' (edited later)' WHERE control = 'owner-authorization-hold-100576'").run();
db.exec(sql2);
ok(ctr(CLS).attempts === 2 && /\(edited later\)$/.test(one("SELECT evidence e FROM control_registry WHERE control = 'owner-authorization-hold-100576'").e), "and it does not reset attempts or overwrite a later edit");
db.prepare("UPDATE remediation_contracts SET attempts = 0 WHERE class = ?").run(CLS);
db.prepare("UPDATE control_registry SET evidence = replace(evidence, ' (edited later)', '') WHERE control = 'owner-authorization-hold-100576'").run();

// rollback
const rb = /^-- Rollback: (.+)$/m.exec(sql2)[1];
ok(!/decision_log/i.test(rb), "the Rollback line never touches decision_log");
ok(rb.indexOf(before.probe.replace(/'/g, "''")) >= 0, "the Rollback line carries the old probe text in full");
db.exec(rb);
const after = ctr(CLS);
ok(after.verify_probe === before.probe && after.action === before.action, "the Rollback line restores the re-ask probe and action byte for byte", { p: after.verify_probe === before.probe, a: after.action === before.action });
ok(one("SELECT description d FROM agent_issues WHERE id = 1000412").d === before.d412 && one("SELECT description d FROM agent_issues WHERE id = 100576").d === before.d576, "and both descriptions exactly as they were");
const gate2 = one("SELECT * FROM control_registry WHERE control = 'dash-owner-decision-hard-marker-gate'");
ok(gate2.location === before.gate.location && gate2.evidence === before.gate.evidence && n("SELECT COUNT(*) n FROM control_registry") === 3, "the hard-marker gate row text is back and the three added control rows are gone");
ok(same(one("SELECT * FROM belief_registry"), before.belief), "the belief row is exactly as it was");
ok(n("SELECT COUNT(*) n FROM failure_modes WHERE fm_key = ?", FM) === 0 && n("SELECT COUNT(*) n FROM remediation_contracts WHERE class = ?", D) === 0 && n("SELECT COUNT(*) n FROM failure_modes") === 3, "the failure mode and its detector are gone, the first file's three remain");
ok(n("SELECT COUNT(*) n FROM decision_log") === 5, "decision_log keeps its rows (append-only)");
db.exec(sql2);
ok(ctr(CLS).verify_probe.indexOf("> 0) AND NOT EXISTS (SELECT 1 FROM human_actions") > 0 && n("SELECT COUNT(*) n FROM decision_log") === 5 && n("SELECT COUNT(*) n FROM control_registry") === 6, "and the file applies again after a rollback (one decision row, not two)");

console.log("dash-owner-actions-followup: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
