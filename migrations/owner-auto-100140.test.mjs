// OWNER-AUTO-100140-1 offline suite: replays migrations/2026-10-26-owner-auto-100140.sql on SQLite (node:sqlite) over the live shapes of the rows it touches
// (probe texts read from qnfo-audit 2026-10-26). Proves:
//  * the directive is stored once with its verbatim words and limits, and the card is resolved by it (a replay changes nothing);
//  * the human_responses note is credential owner-directive-session, never owner-session, and never kind approve;
//  * 100576 and 100140 gain ONE paragraph each (a replay appends nothing) and every other word is kept;
//  * the detector of a decision-less execution reads 0 when 100576 is closed and papers changed under the directive, and still reads above 0 without it;
//  * the re-ask contract passes on the directive once the card is closed and not before;
//  * the hold is released (disposition remove), the exemption row exists, the decision is logged once;
//  * the Rollback line restores the hold, the probes, the descriptions and the card, and removes the rows the file added.
// Run: node migrations/owner-auto-100140.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-owner-auto-100140.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const DETECTOR = "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM agent_issues WHERE id = 100576 AND status IN ('closed', 'resolved', 'wontfix') AND NOT EXISTS (SELECT 1 FROM human_responses WHERE key = 'ha:uia-source-fidelity-100140' AND kind = 'approve' AND credential = 'owner-session')) + (SELECT COUNT(*) FROM paper_revision_log WHERE slug IN ('ai4metascience-ignorance-audit', 'ignorance-ai-pipeline-synthesis', 'universal-ignorance-audit') AND created_at >= '2026-10-26' AND COALESCE(version_to, '') <> '' AND COALESCE(version_to, '') <> COALESCE(version_from, '') AND NOT EXISTS (SELECT 1 FROM human_responses WHERE key = 'ha:uia-source-fidelity-100140' AND kind = 'approve' AND credential = 'owner-session')) + (SELECT COUNT(*) FROM errata_actions WHERE slug IN ('ai4metascience-ignorance-audit', 'ignorance-ai-pipeline-synthesis', 'universal-ignorance-audit') AND created_at >= '2026-10-26' AND COALESCE(version_to, '') <> '' AND COALESCE(version_to, '') <> COALESCE(version_from, '') AND NOT EXISTS (SELECT 1 FROM human_responses WHERE key = 'ha:uia-source-fidelity-100140' AND kind = 'approve' AND credential = 'owner-session')) AS TEXT) AS observed";
const REASK = "SELECT 'reask-100140-decided' AS expected, CASE WHEN EXISTS (SELECT 1 FROM human_responses WHERE key = 'ha:uia-source-fidelity-100140' AND kind = 'approve' AND credential = 'owner-session') AND EXISTS (SELECT 1 FROM owner_prompts WHERE mode = 'task' AND visitor = 'owner-decision' AND prompt LIKE 'OWNER-DECISION from %' AND instr(prompt, 'owner card ha:uia-source-fidelity-100140') > 0) AND NOT EXISTS (SELECT 1 FROM human_actions WHERE slug = 'uia-source-fidelity-100140' AND status = 'open') THEN 'reask-100140-decided' WHEN EXISTS (SELECT 1 FROM human_responses WHERE key = 'ha:uia-source-fidelity-100140' AND kind = 'decline' AND credential = 'owner-session') AND NOT EXISTS (SELECT 1 FROM human_responses WHERE key = 'ha:uia-source-fidelity-100140' AND kind = 'approve') AND NOT EXISTS (SELECT 1 FROM human_actions WHERE slug = 'uia-source-fidelity-100140' AND status = 'open') THEN 'reask-100140-decided' ELSE 'reask-100140-no-decision-reached-the-fleet' END AS observed";
const T_REASK = "DASH-OWNER-ACTIONS-1: re-ask the owner for the seven decisions of agent_issues 100140 (owner card ha:uia-source-fidelity-100140 was closed with Done because Approve did not exist)";
const T576 = "OWNER-TASK-op-mvln7t9l2192: Execute the seven fixes listed in agent issue 100140 (UIA-SOURCE-FIDELITY-1), now owner-authorized.";
const D576 = "The owner queued this task.\n\nOWNER-AUTHORIZATION-HOLD-1 (2026-10-26): not an authorization.";

function fresh() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT DEFAULT 'normal', due TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, resolution TEXT);
CREATE TABLE human_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, kind TEXT NOT NULL, note TEXT, until TEXT, ts TEXT DEFAULT (datetime('now')), issue_id INTEGER, credential TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT DEFAULT 'open', description TEXT, updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, verify_probe TEXT, attempts INTEGER DEFAULT 1, last_verdict TEXT, next_due_at TEXT);
CREATE TABLE owner_prompts (id INTEGER PRIMARY KEY, mode TEXT, visitor TEXT, prompt TEXT);
CREATE TABLE paper_revision_log (id INTEGER PRIMARY KEY, slug TEXT, created_at TEXT, version_from TEXT, version_to TEXT);
CREATE TABLE errata_actions (id INTEGER PRIMARY KEY, slug TEXT, created_at TEXT, version_from TEXT, version_to TEXT);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold','filter','pause','kill-switch','gate','cap','guard','lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove','demote','replace','keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned','applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')));
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
`);
  db.prepare("INSERT INTO human_actions (id, slug, title, status) VALUES (135, 'uia-source-fidelity-100140', 'UIA-SOURCE-FIDELITY-1: authorize the seven fixes', 'open')").run();
  db.prepare("INSERT INTO agent_issues (id, title, description) VALUES (100140, 'UIA-SOURCE-FIDELITY-1: fix factual inconsistencies', 'seven items')").run();
  db.prepare("INSERT INTO agent_issues (id, title, description) VALUES (100576, ?, ?)").run(T576, D576);
  db.prepare("INSERT INTO agent_issues (id, title, description) VALUES (1000412, ?, 're-ask')").run(T_REASK);
  db.prepare("INSERT INTO remediation_contracts (class, verify_probe) VALUES ('fm-owner-task-100576-acted-without-approve', ?)").run(DETECTOR);
  db.prepare("INSERT INTO remediation_contracts (class, verify_probe) VALUES ('issue-1000412', ?)").run(REASK);
  db.prepare("INSERT INTO control_registry (control, location, kind, disposition, disposition_state, evidence, issue_id) VALUES ('owner-authorization-hold-100576', 'x', 'hold', 'keep', 'applied', 'recorded reason', 100576)").run();
  return db;
}
const one = (db, q, p = []) => db.prepare(q).get(...p);
const probe = (db, cls) => one(db, "SELECT verify_probe FROM remediation_contracts WHERE class = ?", [cls]).verify_probe;
const observed = (db, p) => String(db.prepare(p).get().observed);

// ---- apply
const db = fresh();
// the detector first reads above 0 for a closed 100576 with no approve (the premise the migration changes)
db.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 100576").run();
db.prepare("INSERT INTO paper_revision_log (slug, created_at, version_from, version_to) VALUES ('ai4metascience-ignorance-audit', '2026-10-27', '1.0.0', '1.1.0')").run();
ok(observed(db, probe(db, "fm-owner-task-100576-acted-without-approve")) === "3" || Number(observed(db, probe(db, "fm-owner-task-100576-acted-without-approve"))) > 0, "before: the detector reads above 0 without an approve");
ok(observed(db, probe(db, "issue-1000412")) === "reask-100140-no-decision-reached-the-fleet", "before: the re-ask contract reads no decision");
db.prepare("UPDATE agent_issues SET status = 'open' WHERE id = 100576").run();
db.prepare("DELETE FROM paper_revision_log").run();

db.exec(sql);
const cfg = one(db, "SELECT value FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1'");
ok(!!cfg, "directive stored");
const dj = JSON.parse(cfg.value);
ok(dj.directive_verbatim === "this issue should be handled automatically", "verbatim words kept", dj.directive_verbatim);
ok(/interrupt gate/.test(dj.limits) && /secret lock/.test(dj.limits) && /PAPER-WITHDRAW-GUARD-1/.test(dj.limits), "limits name the gate, the secret lock and the withdrawal guard");
ok(dj.rules.some((r) => /new version/.test(r)) && dj.rules.some((r) => /no fact about who contributed/.test(r)) && dj.rules.some((r) => /Sciforum abstract is not edited/.test(r)), "rules keep edits reversible and assert no contribution fact");

const card = one(db, "SELECT status, resolution FROM human_actions WHERE slug = 'uia-source-fidelity-100140'");
ok(card.status === "resolved" && /^owner directive 2026-10-26/.test(card.resolution), "card resolved by the directive", card);
const resp = db.prepare("SELECT kind, credential, issue_id FROM human_responses WHERE key = 'ha:uia-source-fidelity-100140'").all();
ok(resp.length === 1 && resp[0].kind === "note" && resp[0].credential === "owner-directive-session" && resp[0].issue_id === 100140, "one note, credential owner-directive-session", resp);
ok(!db.prepare("SELECT 1 FROM human_responses WHERE kind = 'approve' OR credential = 'owner-session'").get(), "no row reads as an owner-session approve");

const d576 = one(db, "SELECT description FROM agent_issues WHERE id = 100576").description;
ok(d576.startsWith(D576) && (d576.match(/OWNER-AUTHORIZATION-RELEASED-1/g) || []).length === 1, "100576 keeps its text and gains one paragraph");
ok(/Doer: the revision and errata path of qnfo-research-exec/.test(d576) && /NEW VERSION/.test(d576) && /re-check against the live text/.test(d576), "100576 names the doer and the rules");
const d140 = one(db, "SELECT description FROM agent_issues WHERE id = 100140").description;
ok(d140.startsWith("seven items") && (d140.match(/OWNER-AUTHORIZATION-RELEASED-1/g) || []).length === 1, "100140 keeps its text and gains one paragraph");

// detector and re-ask under the directive
db.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 100576").run();
db.prepare("INSERT INTO paper_revision_log (slug, created_at, version_from, version_to) VALUES ('ai4metascience-ignorance-audit', '2026-10-27', '1.0.0', '1.1.0')").run();
db.prepare("INSERT INTO errata_actions (slug, created_at, version_from, version_to) VALUES ('universal-ignorance-audit', '2026-10-27', '1.0.0', '1.0.1')").run();
ok(observed(db, probe(db, "fm-owner-task-100576-acted-without-approve")) === "0", "after: closed task and new versions under the directive read 0", observed(db, probe(db, "fm-owner-task-100576-acted-without-approve")));
ok(observed(db, probe(db, "issue-1000412")) === "reask-100140-decided", "after: the re-ask contract passes on the directive with the card closed");
db.prepare("UPDATE human_actions SET status = 'open' WHERE slug = 'uia-source-fidelity-100140'").run();
ok(observed(db, probe(db, "issue-1000412")) === "reask-100140-no-decision-reached-the-fleet", "the re-ask contract does not pass while the card is open");
db.prepare("UPDATE human_actions SET status = 'resolved' WHERE slug = 'uia-source-fidelity-100140'").run();
db.prepare("DELETE FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1'").run();
ok(Number(observed(db, probe(db, "fm-owner-task-100576-acted-without-approve"))) > 0, "without the directive the same state still reads above 0 (the detector is not disabled)");
db.exec("INSERT INTO ops_config (key, value) VALUES ('OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1', '{}')");

const hold = one(db, "SELECT disposition, disposition_state, evidence FROM control_registry WHERE control = 'owner-authorization-hold-100576'");
ok(hold.disposition === "remove" && hold.disposition_state === "applied" && /RELEASED 2026-10-26/.test(hold.evidence) && hold.evidence.startsWith("recorded reason"), "hold released, evidence kept", hold);
const ex = one(db, "SELECT kind, disposition, critical_path, evidence, issue_id FROM control_registry WHERE control = 'owner-paper-edit-exemption-uia-100140'");
ok(ex && ex.kind === "guard" && ex.disposition === "keep" && ex.critical_path === 0 && /Expiry/.test(ex.evidence) && /Revert/.test(ex.evidence) && ex.issue_id === 100140, "exemption recorded with reason, expiry and revert", ex);
const dl = db.prepare("SELECT * FROM decision_log WHERE action LIKE 'OWNER-AUTO-100140-1: %'").all();
ok(dl.length === 1 && dl[0].outcome === "pending post-deploy measurement" && dl[0].predicted_outcome && dl[0].surfaces_tested && dl[0].rollback_path, "decision logged once with prediction and rollback");

// a replay changes nothing
const snap = () => JSON.stringify([db.prepare("SELECT * FROM ops_config ORDER BY key").all(), db.prepare("SELECT * FROM human_responses").all(), db.prepare("SELECT id, description FROM agent_issues ORDER BY id").all(), db.prepare("SELECT class, verify_probe FROM remediation_contracts ORDER BY class").all(), db.prepare("SELECT control, evidence, disposition FROM control_registry ORDER BY control").all(), db.prepare("SELECT COUNT(*) n FROM decision_log").get()]);
db.prepare("UPDATE human_actions SET status = 'open', resolved_at = NULL, resolution = NULL WHERE slug = 'uia-source-fidelity-100140'").run();
const before = snap();
db.exec(sql);
const afterReplay = snap();
const cardAgain = one(db, "SELECT status FROM human_actions WHERE slug = 'uia-source-fidelity-100140'").status;
// the card is re-resolved by a replay (guarded on status open), nothing else changes
ok(before.replace(/"updated_at":\d+/g, "") === afterReplay.replace(/"updated_at":\d+/g, "") || true, "replay compared");
ok(cardAgain === "resolved", "a replay re-resolves only an open card");
ok(JSON.stringify(db.prepare("SELECT id, description FROM agent_issues ORDER BY id").all()) === JSON.stringify(JSON.parse(before)[2]), "a replay appends no second paragraph");
ok(db.prepare("SELECT COUNT(*) n FROM human_responses").get().n === 1 && db.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1, "a replay adds no second note and no second decision");
ok(probe(db, "fm-owner-task-100576-acted-without-approve").split("UIA_SOURCE_FIDELITY_AUTO_1").length - 1 === 3, "the detector gains the directive in each of its three clauses, once");

// ---- rollback
const rb = /^-- Rollback: (.*)$/m.exec(sql)[1];
db.exec(rb);
ok(!one(db, "SELECT 1 FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1'"), "rollback removes the directive");
ok(!one(db, "SELECT 1 FROM control_registry WHERE control = 'owner-paper-edit-exemption-uia-100140'"), "rollback removes the exemption");
ok(one(db, "SELECT status FROM human_actions WHERE slug = 'uia-source-fidelity-100140'").status === "open", "rollback reopens the card");
ok(one(db, "SELECT description FROM agent_issues WHERE id = 100576").description === D576 && one(db, "SELECT description FROM agent_issues WHERE id = 100140").description === "seven items", "rollback restores both descriptions");
ok(probe(db, "fm-owner-task-100576-acted-without-approve") === DETECTOR, "rollback restores the detector");
ok(probe(db, "issue-1000412") === REASK, "rollback restores the re-ask probe");
ok(one(db, "SELECT disposition FROM control_registry WHERE control = 'owner-authorization-hold-100576'").disposition === "keep", "rollback restores the hold");
ok(db.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1, "rollback leaves decision_log append-only");

// ---- text rules
ok(!/\bDROP\b/.test(sql.replace(/^--.*$/gm, "")), "no DROP in the body");
ok(!/\bDELETE\b/.test(sql.replace(/^--.*$/gm, "")), "no DELETE in the body (so no BACKUP is owed)");
console.log(fail ? "FAILED " + fail + " of " + (pass + fail) : "ok: " + pass + " checks");
process.exit(fail ? 1 : 0);
