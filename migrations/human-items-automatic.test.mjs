// HUMAN-ITEMS-AUTOMATIC-1 offline suite: replays migrations/2026-10-20-human-items-automatic.sql on SQLite, starting from the earlier v_human_action_gate text taken from its own Rollback line.
// Proves: a card from the owner task intake (INTENT-TASK-, OWNER-TASK-) that only trips a weak keyword (account, public, personal, delete, profile, licen) is graded fleet, so
// AUTONOMY-FIRST-REROUTE-1 takes it; an explicit IDENTITY-BOUND: line and each hard marker (token, credential, secret, payment, legal, ...) still grade it owner; a card that is not from the task
// intake keeps its earlier grade; the detector reads the wait (a needs_human code task over 120 minutes, an owner-task card over 120 minutes with no IDENTITY-BOUND: line) and 0 otherwise;
// a second apply changes nothing; the Rollback line restores the earlier grading.
// Run: node migrations/human-items-automatic.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-20-human-items-automatic.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
const oldView = /DROP VIEW IF EXISTS v_human_action_gate; (CREATE VIEW v_human_action_gate AS .+?); DELETE FROM ops_config/.exec(rollback)[1];
const d = new DatabaseSync(":memory:");
d.exec(`CREATE TABLE human_actions (id INTEGER PRIMARY KEY, slug TEXT, title TEXT, why TEXT, default_in_effect TEXT, action TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT);
  CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, updated_at TEXT);
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT);
  CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT, next_due_at TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
d.exec(oldView + ";");
const card = (id, title, why) => d.prepare("INSERT INTO human_actions (id, slug, title, why, action, default_in_effect, source, created_at) VALUES (?, ?, ?, ?, '', '', NULL, ?)").run(id, "s" + id, title, why, new Date().toISOString());
card(1, "INTENT-TASK-a: publish the public account page", "update the personal profile text");
card(2, "OWNER-TASK-b: rotate the credential store", "a credential only the owner can mint");
card(3, "OWNER-TASK-c: sign the thing", "IDENTITY-BOUND: a signature on the form");
card(4, "INTENT-TASK-d: delete the old public drafts", "licen review");
card(5, "Post the Bluesky thread", "needs your account");
card(6, "OWNER-TASK-e: pay the invoice", "a payment");
card(7, "INTENT-TASK-f: fix kpi.test.mjs offline", "plain code");
d.prepare("INSERT INTO human_actions (id, slug, title, why, action, default_in_effect, source, created_at) VALUES (?, ?, ?, ?, '', '', ?, ?)").run(
  8, "closed-owner-request", "MODEL-FLOOR-1 handoff", "worker.js model floor", "owner-request-issue", new Date().toISOString());
const gate = (id) => d.prepare("SELECT gate FROM v_human_action_gate WHERE id = ?").get(id).gate;
const before = [1, 2, 3, 4, 5, 6, 7, 8].map(gate);
ok(before.join() === "owner,owner,owner,owner,owner,owner,fleet,receipt", "earlier grading: the weak keywords hold cards 1 and 4 for the owner", before);
d.exec(sql);
const after = [1, 2, 3, 4, 5, 6, 7].map(gate);
ok(after.join() === "fleet,owner,owner,fleet,owner,owner,fleet", "intake cards on a weak keyword go fleet; hard markers and IDENTITY-BOUND stay owner; a card outside the intake keeps its grade", after);
ok(gate(8) === "receipt", "a closed owner-request notice stays outside fleet grading despite technical text", gate(8));
ok(d.prepare("SELECT COUNT(*) AS n FROM human_actions h JOIN v_human_action_gate g ON g.id = h.id WHERE g.gate = 'fleet' AND COALESCE(h.status, '') <> 'rerouted' AND h.created_at > datetime('now', '-7 days')").get().n === 3,
  "owner_dispatched_items_7d excludes an open closure notice while counting genuine fleet cards");
ok(d.prepare("SELECT status FROM human_actions WHERE id = 8").get().status === "open", "the closure notice remains available to the owner");
ok(d.prepare("SELECT COUNT(*) AS n FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_10_20_HUMAN_ITEMS_AUTOMATIC_1'").get().n === 1 && JSON.parse(d.prepare("SELECT value FROM ops_config").get().value).id === "HUMAN-ITEMS-AUTOMATIC-1", "the directive row is written and parses");
const probe = () => d.prepare(d.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-human-items-waiting'").get().verify_probe).get();
const old = new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 19) + "Z";
d.exec("UPDATE human_actions SET created_at = '" + old + "'");
ok(probe().expected === "0" && probe().observed === "5", "the detector counts the intake cards open over 120 minutes without an IDENTITY-BOUND: line (cards 1, 2, 4, 6, 7; card 3 carries the line; card 5 is not from the intake)", probe());
d.exec("UPDATE human_actions SET status = 'resolved'");
d.prepare("INSERT INTO code_tasks VALUES ('a', 'needs_human', ?), ('b', 'needs_human', ?), ('c', 'merged', ?)").run(old, new Date().toISOString(), old);
ok(probe().observed === "1", "a needs_human code task untouched for 120 minutes counts, a fresh one and a merged one do not", probe());
d.exec("UPDATE code_tasks SET status = 'superseded'");
ok(probe().observed === "0", "0 once everything is handled", probe());
const rows = (t) => d.prepare("SELECT COUNT(*) AS n FROM " + t).get().n;
d.exec(sql);
ok(rows("decision_log") === 1 && rows("failure_modes") === 1 && rows("remediation_contracts") === 1 && rows("ops_config") === 1, "a second apply changes nothing");
d.exec(rollback);
ok([1, 2, 3, 4, 5, 6, 7, 8].map(gate).join() === before.join() && rows("ops_config") === 0 && rows("remediation_contracts") === 0 && rows("failure_modes") === 0, "Rollback restores the earlier grading and removes the rows");
console.log("human-items-automatic: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
