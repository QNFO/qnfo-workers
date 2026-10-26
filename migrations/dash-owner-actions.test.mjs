// DASH-OWNER-ACTIONS-1 offline suite: replays migrations/2026-10-26-dash-owner-actions.sql on SQLite (node:sqlite).
// Proves, for each statement of the file:
//  * the three failure modes and their fm- detectors are written once and a replay changes nothing;
//  * fm-cmd-owner-verb-unparsed counts only the STRICT forms the grammar must answer in code (the verb alone, or the verb and one id, #id, ha: key,
//    UPPER-DASH keyword or slug) that reached the AI path 60 minutes after the migration ran, and stays at 0 for ordinary sentences that start with a verb
//    ('resolved issues today?', 'Resolve next fleet open item and deploy', 'Approve the Living Papers launch post', 'Retry the failed deploy of PR #1001 ...');
//  * fm-owner-approval-without-handoff counts an owner-session approve whose card never had an OWNER-DECISION task, and two approval tasks filed under one issue
//    (the server's hand-off marker, owner_prompts.visitor = owner-decision), and nothing else;
//  * fm-owner-decision-on-hard-card counts an approve or decline of a card whose text matches a default_approve_markers hard pattern, and nothing else;
//  * the live issue-100360 contract (a probe for a table named owner_decisions that the change never creates, 299 failed attempts) is repointed, guarded, to a
//    probe that FAILS today and passes only after a real approve (human_responses kind approve, credential owner-session, plus the hand-off task);
//  * human_actions 135 is reopened by a guarded UPDATE (not an INSERT) only while it is still the Done pressed for lack of an Approve, the issue is open and no
//    decision exists, and a replay never reopens it after the owner has decided;
//  * the re-ask issue is filed once with a probe of its own (the birth and template triggers of the live database are in the fixture), a replay neither
//    duplicates nor reopens it, and its probe fails before the reopen and passes after;
//  * every probe is one read free of the write keywords the runners refuse, with LIKE and GLOB literals under D1's 50 byte limit;
//  * review round 4: the three controls the change adds or leans on (hard-marker gate, owner-session gate, the exemption of the owner's hand-off from the Ask cap)
//    are in control_registry once each with a valid kind, disposition keep, critical path 0, an alternate and evidence, the model-free decision path is in
//    capability_ledger, and the re-ask probe passes only once the approval has reached the fleet (never while the card is merely open); the verb detector reads
//    120 minutes; the decision rows state their predictions in minutes;
//  * the Rollback line removes only what the file added, restores the issue-100360 contract and the card, and never touches decision_log.
// Run: node migrations/dash-owner-actions.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const FILE = "2026-10-26-dash-owner-actions.sql";
const sql = readFileSync(here(FILE), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const OLD_PROBE = "SELECT 'owner_decisions' AS expected, COALESCE((SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'owner_decisions'), 'absent') AS observed";
const OLD_ACTION = "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close. A doer that knows the defect replaces this probe with one that measures it.";
const OLD_PRE = "no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)";
const DONE_RES = "done via dashboard by owner (fleet.qnfo.org, emailed code)";
const FIXTURE = `
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '', verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL DEFAULT '', expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
CREATE TABLE cmd_log (id TEXT PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), text TEXT, from_url TEXT, kind TEXT, status TEXT, answer TEXT, actions_json TEXT, model TEXT, error TEXT, owner INTEGER DEFAULT 0, visitor TEXT, done_ms INTEGER, retries INTEGER);
CREATE TABLE migration_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, file TEXT, sha256 TEXT, commit_sha TEXT, db TEXT, status TEXT, statements INTEGER, error TEXT, applied_by TEXT, applied_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, status TEXT DEFAULT 'open', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, resolution TEXT);
CREATE TABLE human_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, kind TEXT NOT NULL, note TEXT, until TEXT, ts TEXT DEFAULT (datetime('now')), issue_id INTEGER, credential TEXT);
CREATE TABLE owner_prompts (id TEXT PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), mode TEXT, prompt TEXT, status TEXT, intent_id TEXT, issue_id INTEGER, visitor TEXT);
CREATE TABLE default_approve_markers (kind TEXT NOT NULL, pattern TEXT NOT NULL, note TEXT, PRIMARY KEY (kind, pattern));
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
INSERT INTO default_approve_markers (kind, pattern) VALUES ('hard', '% legal %'), ('hard', '%renew%'), ('hard', '%token%'), ('decision_action', '%approve:%');
-- the live birth and template triggers: a new open issue gets a placeholder contract that a template then rewrites
CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id) BEGIN INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES ('issue-' || NEW.id, NEW.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 1, 'needs-machine-probe', 'birth'); END;
CREATE TRIGGER contract_probe_templates_v3_generic AFTER INSERT ON remediation_contracts WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL BEGIN UPDATE remediation_contracts SET status = 'active', module = 'probe-template-v3-generic', action = 'VACUOUS-PROBE-V3-1: template', verify_probe = 'SELECT ''x'' AS expected, ''absent'' AS observed' WHERE class = NEW.class; END;
-- the live rows this file acts on (read from qnfo-audit 2026-10-26)
INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (100140, 'UIA-SOURCE-FIDELITY-1: fix factual inconsistencies', 'seven items', 'x', 'pipeline', 'medium', 'open', 1, 1);
INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (100360, 'DASH-OWNER-ACTIONS-1: the fleet command line does not execute an approval', 'owner_decisions', 'claude-session', 'reliability', 'critical', 'open', 1, 1);
INSERT INTO human_actions (slug, title, why, default_in_effect, action, status, created_at, updated_at, resolved_at, resolution) VALUES ('uia-source-fidelity-100140', 'UIA-SOURCE-FIDELITY-1: authorize the seven fixes', 'IDENTITY-BOUND: edits to the author''s own paper bodies', 'The papers stay as published.', 'Approve or decline each of the seven fixes in agent_issues 100140.', 'resolved', '2026-10-20T06:40:06Z', '2026-10-24 00:11:33', '2026-10-24 00:11:33', '${DONE_RES}');
`;
const CLS = ["fm-cmd-owner-verb-unparsed", "fm-owner-approval-without-handoff", "fm-owner-decision-on-hard-card"];
const FMS = ["cmd-owner-verb-unparsed", "owner-approval-without-handoff", "owner-decision-on-hard-card"];
const db = new DatabaseSync(":memory:");
db.exec(FIXTURE);
// the live contract of issue 100360 as it stood: the generic template, rewritten to what qnfo-audit held
db.prepare("UPDATE remediation_contracts SET verify_probe = ?, action = ?, precondition = ?, module = 'probe-template-v3-generic', status = 'active', attempts = 299, last_verdict = 'fail' WHERE class = 'issue-100360'").run(OLD_PROBE, OLD_ACTION, OLD_PRE);
const n = (q, ...a) => db.prepare(q).get(...a).n;
const one = (q, ...a) => db.prepare(q).get(...a);
db.exec(sql);

// header
const head = sql.split("\n").slice(0, 3);
ok(head[0] === "-- APPLY-BY: ci" && head[1] === "-- DB: qnfo-audit" && /^-- Rollback: .+$/.test(head[2]) && (sql.match(/^-- Rollback:/gm) || []).length === 1, "the file opts in with APPLY-BY, DB and ONE Rollback line", head);
ok(!/\bDELETE\b|\bDROP\b/i.test(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "the body runs no DELETE or DROP (so no BACKUP line is needed)");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link");

// failure modes and detector contracts
for (let i = 0; i < 3; i++) {
  const fm = one("SELECT * FROM failure_modes WHERE fm_key = ?", FMS[i]);
  ok(fm && fm.probe_class === CLS[i] && fm.issue_id === 100360 && fm.root_cause && fm.remediation && fm.symptom && fm.blast_radius, "failure mode " + FMS[i] + " names its detector, issue, cause, remedy, symptom and blast radius");
  const c = one("SELECT * FROM remediation_contracts WHERE class = ?", CLS[i]);
  ok(c && c.verify_transport === "d1-query" && c.status === "active" && c.module === "failure-mode" && c.expected_cadence_h === 1 && c.max_attempts === 3 && c.issue_id === null, "one active hourly d1-query detector " + CLS[i], c && { t: c.verify_transport, s: c.status });
}
ok(n("SELECT COUNT(*) n FROM decision_log") === 3 && n("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'DASH-OWNER-ACTIONS-1: %'") === 1 && n("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'DASH-OWNER-ACTIONS-1-REVIEW: %'") === 1 && n("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'DASH-OWNER-ACTIONS-1-REVIEW-4: %'") === 1, "three decision_log rows: the feature, the review round and the home-page round");
// QUEUE-SLA-1: no threshold or prediction in hours or days (the historical facts in the symptom and evidence texts are dates and counts, not windows)
for (const dl of db.prepare("SELECT predicted_outcome p FROM decision_log").all()) ok(!/\b\d+\s*(h|hours?|days?|d|weeks?)\b|\ban hour\b/i.test(dl.p) && /\b\d+ minutes?\b/.test(dl.p), "the prediction is stated in minutes", dl.p);
ok(!/'-\d+ (hours?|days?)'/.test(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")) && /''-120 minutes''/.test(sql), "no SQL window in hours or days: the verb detector reads 120 minutes");
for (const dl of db.prepare("SELECT * FROM decision_log").all()) ok(dl.capability_gain && dl.predicted_outcome && dl.surfaces_tested && dl.rollback_path && dl.reach_gain, "decision row carries capability_gain, predicted_outcome, reach_gain, surfaces_tested and a rollback path");

// every probe in the file: one read, no write keywords, short LIKE and GLOB literals
const probes = db.prepare("SELECT class, verify_probe FROM remediation_contracts WHERE class IN (?, ?, ?, 'issue-100360') OR class LIKE 'issue-1003%'").all(...CLS);
ok(probes.length === 5, "five probes: the three detectors, issue 100360 and the re-ask issue", probes.map((p) => p.class));
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
const RT_WRITE_KW = ["insert ", "update ", "delete ", "drop ", "alter ", "create ", "attach ", "detach ", "pragma ", "replace ", "vacuum", "reindex"];
for (const p of probes) {
  const low = " " + p.verify_probe.toLowerCase().replace(/\s+/g, " ") + " ";
  ok(/^ (select|with) /.test(low) && low.indexOf(";") === -1 && !WRITE_KW.some((w) => low.indexOf(w) !== -1) && !RT_WRITE_KW.some((w) => low.indexOf(" " + w) !== -1) && !/\breplace\b/.test(low), p.class + " is one literal read free of the write keywords of the consumer and the runtime guard");
  const lits = [...p.verify_probe.matchAll(/(?:LIKE|GLOB) '([^']*)'/g)].map((m) => Buffer.byteLength(m[1]));
  ok(lits.every((b) => b <= 50), p.class + " keeps every LIKE and GLOB literal under D1's 50 byte limit", lits);
  ok(!/\bFROM\s+(?:sqlite_master|pragma)/i.test(p.verify_probe) || p.class === "never", p.class + " does not read the schema for a table it could create (no circular probe)");
}
const read = (cls) => { const r = db.prepare(one("SELECT verify_probe p FROM remediation_contracts WHERE class = ?", cls).p).get(); return { expected: String(r.expected), observed: String(r.observed) }; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ts = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString().slice(0, 19).replace("T", " ");
let k = 0;
const addLog = (text, kind = "ai", status = "fallback", minAgo = 5) => db.prepare("INSERT INTO cmd_log (id, ts, text, kind, status) VALUES (?, ?, ?, ?, ?)").run("c" + (++k), ts(minAgo), text, kind, status);

// detector 1: strict-form verb lines
const V = "fm-cmd-owner-verb-unparsed";
ok(same(read(V), { expected: "0", observed: "0" }), "verb detector reads 0 on a clean cmd_log", read(V));
addLog("Approve UIA-SOURCE-FIDELITY-1", "ai", "fallback", 5);
ok(read(V).observed === "0", "reads 0 while the migration has no ok row in migration_runs (no floor yet)", read(V));
const ranAt = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString().slice(0, 19) + "Z";
db.prepare("INSERT INTO migration_runs (file, db, status, applied_at) VALUES (?, 'qnfo-audit', 'ok', ?)").run("migrations/" + FILE, ranAt(300));
ok(read(V).observed === "1", "counts the strict form 'Approve UIA-SOURCE-FIDELITY-1' that arrived after the migration ran", read(V));
for (const t of ["Decline 100140", "diagnose #100140", "retry", "Resolve ha:uia-source-fidelity-100140", "approve 100140.", "Resolve orcid-link-works", "RETRY 1001!"]) addLog(t, "ai", k % 2 ? "fallback" : "answered");
ok(read(V).observed === "8", "counts each of the five verbs with a bare form, an id, #id, a ha: key, a keyword or a slug, in any status, ignoring case and trailing punctuation", read(V));
const before = read(V).observed;
for (const t of ["resolved issues today?", "Resolve next fleet open item and deploy", "Resolve all content queues", "Approve the Living Papers launch post", "Retry the failed deploy of PR #1001 and tell me why", "Resolve GitHub PR #3608 and #3445 conflicts and merge to main", "approve papers", "approve all", "approve 1-5", "please approve 100140", "what is the state of the fleet", "retrying later", "approved 100140", "declined"]) addLog(t);
ok(read(V).observed === before, "ordinary sentences, other verbs, filler and verb look-alikes ('resolved', 'retrying', 'approved') stay uncounted", read(V));
addLog("approve 100140", "action", "done"); addLog("approve 100140", "data", "answered"); addLog("approve 100140", "tool", "done");
addLog("approve 100140", "ai", "fallback", 125);
ok(read(V).observed === before, "other kinds of cmd_log row and a line older than 120 minutes do not count", read(V));
addLog("approve 100140", "ai", "fallback", 115);
ok(Number(read(V).observed) === Number(before) + 1, "a line from 115 minutes ago still counts", read(V));
db.prepare("DELETE FROM cmd_log WHERE ts < ? AND text = 'approve 100140' AND kind = 'ai' AND ts > ?").run(ts(100), ts(120));
db.prepare("UPDATE migration_runs SET applied_at = ?").run(ranAt(30));
ok(read(V).observed === "0", "with the migration run 30 minutes ago the 60 minute grace (the worker deploy lag) has not passed: nothing counts yet", read(V));
db.prepare("UPDATE migration_runs SET applied_at = ?").run(ranAt(70));
ok(read(V).observed === before, "70 minutes after the run the lines newer than the floor count again", read(V));
db.prepare("UPDATE migration_runs SET applied_at = ?").run(ranAt(300));
db.prepare("UPDATE migration_runs SET status = 'failed'").run();
ok(read(V).observed === "0", "reads 0 when the only migration_runs row is not ok", read(V));
db.prepare("UPDATE migration_runs SET status = 'ok'").run();

// detector 2: an approval without its hand-off task
const H = "fm-owner-approval-without-handoff";
ok(same(read(H), { expected: "0", observed: "0" }), "hand-off detector reads 0 with no approval", read(H));
const resp = (key, kind, cred = "owner-session") => db.prepare("INSERT INTO human_responses (key, kind, credential) VALUES (?, ?, ?)").run(key, kind, cred);
const task = (text) => db.prepare("INSERT INTO owner_prompts (id, mode, prompt, status) VALUES (?, 'task', ?, 'queued')").run("op-" + (++k), text);
resp("ha:card-a", "approve");
ok(read(H).observed === "1", "an owner-session approve with no OWNER-DECISION task for its card counts", read(H));
task("OWNER-DECISION from fleet.qnfo.org (owner session, decision 1): the owner APPROVED the decision on owner card ha:card-a.\nCard: A");
ok(read(H).observed === "0", "the card's hand-off task clears it", read(H));
resp("ha:card-a", "approve");
resp("ha:card-b", "decline");
resp("ha:card-c", "approve", "owner-key");
resp("ha:card-d", "note");
task("an Ask about ha:card-e that is not a hand-off");
resp("ha:card-e", "approve");
ok(read(H).observed === "1", "a repeated approve of a handed-off card, a decline, another credential, a note and an ordinary task do not count; an approve whose only task is not a hand-off does", read(H));
// two approval tasks under one ticket: OWNER-PROMPT-TWIN-LINK-1 once linked the second card's hand-off to the first's issue and the reply still said it was filed
const handoff = (text, issue, visitor = "owner-decision") => db.prepare("INSERT INTO owner_prompts (id, mode, prompt, status, issue_id, visitor) VALUES (?, 'task', ?, 'queued', ?, ?)").run("ho-" + (++k), text, issue, visitor);
const base = Number(read(H).observed);
handoff("OWNER-DECISION from fleet.qnfo.org: the owner APPROVED the decision on owner card ha:x1 (decision 1)", 100141);
handoff("OWNER-DECISION from fleet.qnfo.org: the owner APPROVED the decision on owner card ha:x2 (decision 1)", 100142);
ok(Number(read(H).observed) === base, "approval tasks that each have their own issue do not count", read(H));
handoff("OWNER-DECISION from fleet.qnfo.org: the owner APPROVED the decision on owner card ha:x3 (decision 1)", 100141);
ok(Number(read(H).observed) === base + 2, "two approval tasks under one issue count (both rows), the one under its own issue does not", read(H));
handoff("an ordinary task twin-linked to 100143", 100143, null); handoff("the same ordinary task", 100143, null);
handoff("OWNER-DECISION from fleet.qnfo.org: not filed yet", null); handoff("OWNER-DECISION from fleet.qnfo.org: not filed yet either", null);
ok(Number(read(H).observed) === base + 2, "ordinary tasks that share an issue (the twin link they are meant to have) and approval tasks with no issue yet are not counted", read(H));
db.exec("DELETE FROM owner_prompts WHERE id LIKE 'ho-%'");
ok(Number(read(H).observed) === base, "and the count returns to its base when those rows go", read(H));

// detector 3: a decision on a card the hard markers keep to the owner
const D = "fm-owner-decision-on-hard-card";
const card = (slug, title, why = "", action = "", def = "") => db.prepare("INSERT INTO human_actions (slug, title, why, action, default_in_effect) VALUES (?, ?, ?, ?, ?)").run(slug, title, why, action, def);
card("eb1a", "Sign or decline the statement", "a legal statement in the owner's name", "Sign or decline.", "Nothing is signed.");
card("logo", "Approve the logo", "brand", "Approve or decline.", "The logo stays.");
card("renewal", "Approve the renewal", "", "Approve the renewal.", "");
ok(same(read(D), { expected: "0", observed: "0" }), "hard-card detector reads 0 with no decision on any card", read(D));
resp("ha:logo", "approve"); resp("ha:logo", "decline");
ok(read(D).observed === "0", "decisions on a card that matches no hard marker do not count", read(D));
resp("ha:eb1a", "approve", "owner-key"); resp("ha:eb1a", "note");
ok(read(D).observed === "0", "a decision of another credential and a note on a hard card do not count", read(D));
resp("ha:eb1a", "decline"); resp("ha:renewal", "approve");
ok(read(D).observed === "2", "an owner-session decline of the signing card and approve of the renewal card (' legal ', 'renew') count", read(D));

// issue 100360: the circular probe is replaced by a real-use probe
const c360 = one("SELECT * FROM remediation_contracts WHERE class = 'issue-100360'");
ok(c360.verify_probe.indexOf("live-approve-recorded") >= 0 && c360.verify_probe.indexOf("owner_decisions") === -1 && c360.verify_transport === "d1-query" && c360.status === "active" && c360.module === "doer-authored" && c360.attempts === 0 && c360.last_verdict === null && c360.issue_id === 100360, "the issue-100360 contract is repointed (the owner_decisions table probe is gone), counters restart, still an active d1-query", c360);
ok(/Replaces the VACUOUS-PROBE-V3-1 probe/.test(c360.action) && /human_responses kind approve/.test(c360.action), "its action says what it reads and what it replaced");
db.exec("DELETE FROM human_responses; DELETE FROM owner_prompts");
const R = (cls) => read(cls);
ok(same(R("issue-100360"), { expected: "live-approve-recorded", observed: "no-live-approve-yet" }), "issue 100360's probe FAILS today (no approve, no hand-off): it cannot pass while the defect exists", R("issue-100360"));
task("OWNER-DECISION from fleet.qnfo.org: hand-off with no recorded approve");
ok(R("issue-100360").observed === "no-live-approve-yet", "a hand-off alone does not pass it");
db.exec("DELETE FROM owner_prompts");
resp("ha:x", "approve");
ok(R("issue-100360").observed === "no-live-approve-yet", "a recorded approve alone does not pass it");
db.exec("DELETE FROM human_responses");
resp("ha:x", "approve", "owner-key"); task("OWNER-DECISION from fleet.qnfo.org: hand-off");
ok(R("issue-100360").observed === "no-live-approve-yet", "an approve under another credential does not pass it");
resp("ha:x", "approve");
ok(same(R("issue-100360"), { expected: "live-approve-recorded", observed: "live-approve-recorded" }), "an owner-session approve with its hand-off task passes it", R("issue-100360"));
db.exec("DELETE FROM human_responses; DELETE FROM owner_prompts");

// card 135: reopened by a guarded UPDATE
const c135 = one("SELECT * FROM human_actions WHERE slug = 'uia-source-fidelity-100140'");
ok(c135.status === "open" && c135.resolved_at === null && c135.resolution === null && c135.updated_at !== "2026-10-24 00:11:33", "owner card 135 is open again, with no stale resolution", c135);
db.prepare("UPDATE human_actions SET status = 'resolved', resolution = 'approve via dashboard by owner (fleet.qnfo.org, emailed code): approved 1-7' WHERE slug = 'uia-source-fidelity-100140'").run();
db.exec(sql);
ok(one("SELECT status FROM human_actions WHERE slug = 'uia-source-fidelity-100140'").status === "resolved", "a replay does not reopen a card the owner has approved");
db.prepare("UPDATE human_actions SET resolution = ? WHERE slug = 'uia-source-fidelity-100140'").run(DONE_RES);
resp("ha:uia-source-fidelity-100140", "decline");
db.exec(sql);
ok(one("SELECT status FROM human_actions WHERE slug = 'uia-source-fidelity-100140'").status === "resolved", "nor one that has a recorded decision, whatever its resolution text");
db.exec("DELETE FROM human_responses");
db.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 100140").run();
db.exec(sql);
ok(one("SELECT status FROM human_actions WHERE slug = 'uia-source-fidelity-100140'").status === "resolved", "nor while issue 100140 is closed");
db.prepare("UPDATE agent_issues SET status = 'open' WHERE id = 100140").run();
db.exec(sql);
ok(one("SELECT status FROM human_actions WHERE slug = 'uia-source-fidelity-100140'").status === "open", "with the issue open, no decision and the Done resolution it reopens (the guard is exactly that)");

// the re-ask issue and its probe
const TITLE = "DASH-OWNER-ACTIONS-1: re-ask the owner for the seven decisions of agent_issues 100140 (owner card ha:uia-source-fidelity-100140 was closed with Done because Approve did not exist)";
const reask = one("SELECT * FROM agent_issues WHERE title = ?", TITLE);
ok(reask && reask.status === "open" && reask.priority === "high" && /Doer: migrations\/2026-10-26-dash-owner-actions\.sql reopens the card/.test(reask.description) && /Closing probe: remediation contract issue-<id>/.test(reask.description) && !/runtime-probe:|code-probe:|code-task:/.test(reask.description) && n("SELECT COUNT(*) n FROM agent_issues WHERE title = ?", TITLE) === 1, "the re-ask issue is filed once, names its doer and its closing probe, and carries no probe line that would start another contract", reask && reask.description.slice(0, 120));
const cre = one("SELECT * FROM remediation_contracts WHERE class = ?", "issue-" + reask.id);
ok(cre.status === "active" && cre.module === "doer-authored" && cre.verify_probe.indexOf("reask-100140") >= 0 && cre.verify_transport === "d1-query" && cre.attempts === 0, "its contract is the card probe, not the generic template the birth trigger put there", cre);
ok(/Closing probe: remediation contract issue-<id> passes once the owner's decision has reached the fleet/.test(reask.description) && /does not pass while the card is merely open/.test(reask.description) && !/passes while an open human_actions row/.test(reask.description), "the issue text says what the probe measures: the decision reaching the fleet, not an open card");
const reaskObserved = () => String(db.prepare(cre.verify_probe).get().observed);
const DECIDED = "reask-100140-decided", NONE = "reask-100140-no-decision-reached-the-fleet";
const KEY = "ha:uia-source-fidelity-100140";
const handoffRow = (visitor = "owner-decision", text = "OWNER-DECISION from fleet.qnfo.org: the owner APPROVED the decision on owner card " + KEY + " (decision 1)") => db.prepare("INSERT INTO owner_prompts (id, mode, prompt, status, visitor) VALUES (?, 'task', ?, 'queued', ?)").run("ra-" + (++k), text, visitor);
const clearDecisions = () => db.exec("DELETE FROM human_responses; DELETE FROM owner_prompts");
const card135 = (status) => db.prepare("UPDATE human_actions SET status = ?, resolution = ? WHERE slug = 'uia-source-fidelity-100140'").run(status, status === "open" ? null : DONE_RES);
clearDecisions();
ok(one("SELECT status FROM human_actions WHERE slug = 'uia-source-fidelity-100140'").status === "open" && reaskObserved() === NONE, "right after this file reopens the card the probe FAILS (an open card is not a decision: it cannot pass the moment the migration ran)", reaskObserved());
card135("resolved");
ok(reaskObserved() === NONE, "and it FAILS when the card is closed with no decision recorded", reaskObserved());
card135("open");
resp(KEY, "approve");
ok(reaskObserved() === NONE, "an owner-session approve with no hand-off task does not pass it (the approval did not reach the fleet)");
clearDecisions();
handoffRow();
ok(reaskObserved() === NONE, "a hand-off task with no recorded approve does not pass it");
clearDecisions();
resp(KEY, "approve", "owner-key"); handoffRow();
ok(reaskObserved() === NONE, "an approve under another credential is not the owner's decision");
clearDecisions();
resp(KEY, "approve"); handoffRow(null);
ok(reaskObserved() === NONE, "a task without the server's hand-off marker does not count (a stranger's Ask can carry the same words)");
clearDecisions();
resp(KEY, "approve"); handoffRow("owner-decision", "OWNER-DECISION from fleet.qnfo.org: the owner APPROVED the decision on owner card ha:another-card (decision 1)");
ok(reaskObserved() === NONE, "a hand-off for another card does not count");
clearDecisions();
resp(KEY, "approve"); handoffRow();
ok(reaskObserved() === DECIDED, "an owner-session approve of the card together with its hand-off task (the server's marker) passes it, even while the card still waits on other items", reaskObserved());
clearDecisions();
resp(KEY, "decline");
ok(reaskObserved() === NONE, "a decline while the card is still open does not pass it (parts are undecided)");
card135("dismissed");
ok(reaskObserved() === DECIDED, "an owner-session decline that closed the card passes it (the owner decided; there is nothing to hand over)", reaskObserved());
resp(KEY, "approve");
ok(reaskObserved() === NONE, "a decline of some parts and an approve with no hand-off is not a decision that reached the fleet");
clearDecisions();
card135("open");

// control_registry and capability_ledger (DOCTRINE-1): the gate, the gate and the cap this change adds or leans on, and the capability it gives the fleet
const CTRL = { "dash-owner-decision-hard-marker-gate": "gate", "dash-owner-decision-session-gate": "gate", "owner-prompts-cap-owner-decision-exempt": "cap" };
const ctrlRows = db.prepare("SELECT * FROM control_registry ORDER BY control").all();
ok(ctrlRows.length === 3 && ctrlRows.every((r) => CTRL[r.control] === r.kind), "control_registry holds the three controls with kind gate, gate and cap", ctrlRows.map((r) => r.control + ":" + r.kind));
for (const r of ctrlRows) {
  ok(r.disposition === "keep" && r.disposition_state === "applied" && r.critical_path === 0 && r.issue_id === 100360 && r.location.length > 40 && r.guards_against.length > 40 && r.alternate_path.length > 20 && r.evidence.length > 80 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(r.reviewed_at), r.control + " is kept, applied, off the critical path, tied to issue 100360, and names its location, what it guards against, an alternate and its evidence", r);
}
const hg = one("SELECT * FROM control_registry WHERE control = 'dash-owner-decision-hard-marker-gate'");
ok(hg.alternate_path === "Done on the card; default_approve_markers is data, edited by migration" && hg.alternate_tested_at && /T18j/.test(hg.evidence) && /fm-owner-decision-on-hard-card/.test(hg.evidence), "the hard-marker gate names its alternate (Done on the card; the markers are data) with the date the suite ran it, and its detector");
const ck = one("SELECT * FROM control_registry WHERE control = 'owner-prompts-cap-owner-decision-exempt'");
ok(/owner-decision/.test(ck.location) && /OWNER_PROMPTS_DAILY_CAP/.test(ck.location) && /cannot reach the exemption/.test(ck.evidence) && /ownerCredential\(owner\) is owner-session/.test(ck.evidence) && /askVisitor/.test(ck.evidence) && /T17j/.test(ck.evidence) && /T17k/.test(ck.evidence), "the cap row records why a stranger cannot reach the exemption: the marker is set server-side only after a verified owner session", ck.evidence.slice(0, 200));
const sg = one("SELECT * FROM control_registry WHERE control = 'dash-owner-decision-session-gate'");
ok(sg.alternate_tested_at === null && /T5/.test(sg.evidence) && /T6/.test(sg.evidence) && /T7/.test(sg.evidence) && /fleet never waits on a decision/.test(sg.alternate_path), "the owner-session gate says it has no critical-path alternate to test, and cites the suites that prove it");
// every test label the evidence cites exists in the dashboard suite (the evidence is checkable, not a story)
const decideSuite = readFileSync(new URL("../qnfo-fleet-dashboard/cmd-decide.test.mjs", import.meta.url), "utf8");
const cited = new Set(); for (const r of ctrlRows) for (const m of r.evidence.matchAll(/\bT\d+[a-z]?\b/g)) cited.add(m[0]);
const missing = [...cited].filter((t) => !new RegExp("[\"'\\s/]" + t + "[\\s\"':a-z(]").test(decideSuite));
ok(cited.size >= 8 && missing.length === 0, "every T-label the control evidence cites is in qnfo-fleet-dashboard/cmd-decide.test.mjs", { cited: [...cited], missing });
const cap = one("SELECT * FROM capability_ledger");
ok(cap.capability === "owner-decisions-without-a-model" && /migrations\/2026-10-26-dash-owner-actions\.sql/.test(cap.provenance) && /no model/.test(cap.prerequisites) && cap.last_exercised_at === null && /not yet used live/.test(cap.reliability) && /router_timeout x3/.test(cap.evidence) && /^\d{4}-\d{2}-\d{2}T/.test(cap.acquired_at), "capability_ledger records the model-free decision path, with the evidence and the fact that it has not yet been used live", cap);

// replay: no duplicates, no overwrite of a later edit, no reopened issue
db.prepare("UPDATE remediation_contracts SET max_attempts = 7 WHERE class = ?").run(CLS[0]);
db.prepare("UPDATE remediation_contracts SET attempts = 5, verify_probe = verify_probe || ' ' WHERE class = ?").run("issue-" + reask.id);
db.prepare("UPDATE remediation_contracts SET attempts = 9 WHERE class = 'issue-100360'").run();
db.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = ?").run(reask.id);
const probeBefore = one("SELECT verify_probe p FROM remediation_contracts WHERE class = ?", "issue-" + reask.id).p;
db.exec(sql);
ok(n("SELECT COUNT(*) n FROM failure_modes") === 3 && n("SELECT COUNT(*) n FROM remediation_contracts WHERE class LIKE 'fm-%'") === 3 && n("SELECT COUNT(*) n FROM decision_log") === 3 && n("SELECT COUNT(*) n FROM control_registry") === 3 && n("SELECT COUNT(*) n FROM capability_ledger") === 1 && one("SELECT max_attempts m FROM remediation_contracts WHERE class = ?", CLS[0]).m === 7, "a replay is a no-op: no duplicate failure mode, contract or decision row, and a later edit survives");
ok(n("SELECT COUNT(*) n FROM agent_issues WHERE title = ?", TITLE) === 1 && one("SELECT status s FROM agent_issues WHERE id = ?", reask.id).s === "closed" && one("SELECT verify_probe p FROM remediation_contracts WHERE class = ?", "issue-" + reask.id).p === probeBefore && one("SELECT attempts a FROM remediation_contracts WHERE class = ?", "issue-" + reask.id).a === 5 && one("SELECT attempts a FROM remediation_contracts WHERE class = 'issue-100360'").a === 9, "nor does it re-file or reopen the re-ask issue, rewrite its probe or reset either contract's attempts");

// rollback: what the file added goes; the contract and the card are restored; decision_log stays
const rb = /^-- Rollback: (.+)$/m.exec(sql)[1];
ok(!/decision_log/i.test(rb), "the Rollback line never touches decision_log");
db.prepare("UPDATE human_actions SET status = 'resolved', resolved_at = '2026-10-26 07:00:00', resolution = 'whatever' WHERE slug = 'uia-source-fidelity-100140'").run();
db.prepare("UPDATE human_actions SET status = 'open', resolved_at = NULL, resolution = NULL WHERE slug = 'uia-source-fidelity-100140'").run();
db.exec(rb);
const back = one("SELECT * FROM remediation_contracts WHERE class = 'issue-100360'");
ok(back.verify_probe === OLD_PROBE && back.action === OLD_ACTION && back.precondition === OLD_PRE && back.module === "probe-template-v3-generic", "the Rollback line restores the issue-100360 contract text exactly as the live row held it", back);
const card2 = one("SELECT * FROM human_actions WHERE slug = 'uia-source-fidelity-100140'");
ok(card2.status === "resolved" && card2.resolution === DONE_RES && card2.resolved_at === "2026-10-24 00:11:33" && card2.updated_at === "2026-10-24 00:11:33", "and re-resolves the card with its old resolution and times", card2);
ok(n("SELECT COUNT(*) n FROM failure_modes") === 0 && n("SELECT COUNT(*) n FROM remediation_contracts WHERE class LIKE 'fm-%'") === 0 && n("SELECT COUNT(*) n FROM decision_log") === 3 && n("SELECT COUNT(*) n FROM control_registry") === 0 && n("SELECT COUNT(*) n FROM capability_ledger") === 0, "removes the failure modes, detector contracts, control_registry rows and the capability row, never the decision_log rows");
const re2 = one("SELECT status s, last_verdict v FROM remediation_contracts WHERE class = ?", "issue-" + reask.id);
ok(re2.s === "superseded" && re2.v === "superseded:rollback", "and supersedes the re-ask contract (the issue itself stays, to be closed with evidence)", re2);

console.log("dash-owner-actions: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
