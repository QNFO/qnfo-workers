// ROADMAP-TWIN-ROWS-1 offline suite: migrations/2026-10-26-roadmap-twin-rows.sql makes v_portfolio_drift_roadmap and the detector
// fm-roadmap-catalogue-as-issues read the same rule as qnfo-github-steward 0.9.0: a roadmap row of artifact_type agent_issue is the twin of a
// TRACKER-SYNC-1 ticket and is never a GitHub issue. Proves:
//  * before the file, an unfiled twin reads as roadmap-unmirrored drift and a closed twin mirror as roadmap-state drift (the defect);
//  * after it, neither does, while an ordinary row still reads as drift in all three ways (the rule is not a blanket mute);
//  * the detector counts an open GitHub issue linked to a twin row, still counts the scoped sources, and ignores an ordinary open issue;
//  * a second apply changes nothing and a detector that was already edited is not overwritten; one decision is logged;
//  * the Rollback line restores the old view and the old detector; the file adds no trigger and no row-level DELETE.
// Run: node --no-warnings migrations/roadmap-twin-rows.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-roadmap-twin-rows.sql", import.meta.url), "utf8");
const scopeSql = readFileSync(new URL("./2026-10-26-roadmap-mirror-scope.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];
const split = (text) => text.replace(/^\s*--.*$/gm, "").split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);

function build(opts = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE roadmap_implementation (id INTEGER PRIMARY KEY AUTOINCREMENT, item TEXT NOT NULL, source TEXT NOT NULL, title TEXT NOT NULL, artifact_type TEXT NOT NULL, artifact_ref TEXT, status TEXT NOT NULL, evidence TEXT, verified_at TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE roadmap_gh_links (roadmap_id INTEGER PRIMARY KEY, gh_number INTEGER NOT NULL, gh_state TEXT, d1_status TEXT, synced_at TEXT, project_code TEXT, gh_node TEXT);
CREATE TABLE projects (project_code TEXT PRIMARY KEY, status TEXT, gh_milestone INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
  db.exec("INSERT INTO projects VALUES ('P1', 'active', 1)");
  // the scope file's own table, seed and view (the live state this file starts from)
  for (const stmt of split(scopeSql)) if (/^(CREATE TABLE IF NOT EXISTS roadmap_mirror_scope|INSERT OR IGNORE INTO roadmap_mirror_scope|DROP VIEW|CREATE VIEW)/i.test(stmt)) db.exec(stmt);
  // the detector exactly as the scope file leaves it
  const probe = opts.probe ?? /VALUES\s*\('fm-roadmap-catalogue-as-issues'[^]*?'(SELECT [^]*?)',\s*'d1-query'/.exec(scopeSql)[1].replace(/''/g, "'");
  db.prepare("INSERT INTO remediation_contracts (class, precondition, action, verify_probe, verify_transport, status, module) VALUES ('fm-roadmap-catalogue-as-issues', 'p', 'a', ?, 'd1-query', 'active', 'failure-mode')").run(probe);
  return db;
}
const rm = (db, item, source, type, status = "planned") => Number(db.prepare("INSERT INTO roadmap_implementation (item, source, title, artifact_type, status) VALUES (?, ?, 't', ?, ?)").run(item, source, type, status).lastInsertRowid);
const link = (db, id, n, state, d1, project = "P1") => db.prepare("INSERT INTO roadmap_gh_links (roadmap_id, gh_number, gh_state, d1_status, project_code) VALUES (?, ?, ?, ?, ?)").run(id, n, state, d1, project);
const drift = (db) => db.prepare("SELECT kind, ref FROM v_portfolio_drift_roadmap ORDER BY kind, CAST(ref AS INTEGER)").all().map((r) => r.kind + ":" + r.ref).join(",");
const detector = (db) => db.prepare(db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-roadmap-catalogue-as-issues'").get().verify_probe).get();

function seed(db) {
  const twinUnfiled = rm(db, "AI-1000348", "best-practice-2026", "agent_issue");          // 1: no GitHub issue
  const twinClosed = rm(db, "AI-1000347", "best-practice-2026", "agent_issue"); link(db, twinClosed, 9001, "closed", "planned"); // 2: the steward closed its mirror
  const twinOpen = rm(db, "AI-1000346", "best-practice-2026", "agent_issue"); link(db, twinOpen, 9002, "open", "planned");      // 3: still open on GitHub
  const plainUnfiled = rm(db, "GL-OTHER", "best-practice-2026", "goal");                  // 4: an ordinary row nobody filed
  const plainClosed = rm(db, "GL-CLOSED", "charter", "worker"); link(db, plainClosed, 9003, "closed", "planned");               // 5: an ordinary row whose issue was closed by hand
  const twinUnplaced = rm(db, "AI-1000345", "best-practice-2026", "agent_issue"); link(db, twinUnplaced, 9006, "closed", "planned", "NOPROJ"); // 6: closed twin whose project has no milestone
  const plainUnplaced = rm(db, "GL-UNPLACED", "charter", "worker"); link(db, plainUnplaced, 9007, "closed", "planned", "NOPROJ");  // 7: ordinary row, same
  return { twinUnfiled, twinClosed, twinOpen, plainUnfiled, plainClosed, twinUnplaced, plainUnplaced };
}

// 1. before the file: the defect (the twin rows read as drift)
let db = build();
let r = seed(db);
const before = drift(db);
ok(before.includes("roadmap-unmirrored:" + r.twinUnfiled) && before.includes("roadmap-state:" + r.twinClosed) && before.includes("roadmap-unplaced:" + r.twinUnplaced), "before the file an unfiled twin, a closed twin mirror and an unplaced twin all read as drift (the defect)", before);

// 2. after the file
for (const stmt of split(sql)) db.exec(stmt);
const after = drift(db);
ok(!after.includes("roadmap-unmirrored:" + r.twinUnfiled) && !after.includes("roadmap-state:" + r.twinClosed), "after it, an unfiled twin and a closed twin mirror are no drift", after);
ok(after.includes("roadmap-state:" + r.twinOpen), "a twin whose mirror is still open on GitHub reads state drift until the steward closes it (GitHub disagrees with the rule)", after);
db.prepare("UPDATE roadmap_gh_links SET gh_state = 'closed' WHERE roadmap_id = ?").run(r.twinOpen);
ok(!drift(db).includes("roadmap-state:" + r.twinOpen), "and none once it is closed", drift(db));
db.prepare("UPDATE roadmap_gh_links SET gh_state = 'open' WHERE roadmap_id = ?").run(r.twinOpen);
ok(!after.includes("roadmap-unplaced:" + r.twinUnplaced), "an unplaced twin mirror is no drift", after);
ok(after.includes("roadmap-unmirrored:" + r.plainUnfiled) && after.includes("roadmap-state:" + r.plainClosed) && after.includes("roadmap-unplaced:" + r.plainUnplaced), "an ordinary unfiled row, an ordinary closed-by-hand row and an ordinary unplaced row still read as drift (the rule is not a blanket mute)", after);
const d = detector(db);
ok(d.expected === "0" && d.observed === "1", "the detector counts the one open GitHub issue linked to a twin row", d);
db.prepare("UPDATE roadmap_gh_links SET gh_state = 'closed' WHERE roadmap_id = ?").run(r.twinOpen);
ok(detector(db).observed === "0", "and reads 0 once the steward has closed it", detector(db));
const plainOpen = rm(db, "GL-OPEN", "charter", "worker"); link(db, plainOpen, 9004, "open", "planned");
ok(detector(db).observed === "0", "an ordinary open mirror is not counted", detector(db));
const scoped = rm(db, "PROJ-W.x", "projects", "project"); link(db, scoped, 9005, "open", "open");
ok(detector(db).observed === "1", "an open issue of a scoped-out source is still counted", detector(db));

// 3. idempotence, no overwrite, one decision
const snap = () => JSON.stringify([db.prepare("SELECT * FROM remediation_contracts").all(), db.prepare("SELECT COUNT(*) n FROM decision_log").get(), db.prepare("SELECT sql FROM sqlite_master WHERE name = 'v_portfolio_drift_roadmap'").get()]);
const s1 = snap();
for (const stmt of split(sql)) db.exec(stmt);
ok(snap() === s1, "a second apply changes nothing");
ok(db.prepare("SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'ROADMAP-TWIN-ROWS-1: qnfo-github-steward 0.9.0') = 1").get().n === 1, "one decision is logged");
const edited = "SELECT '0' AS expected, '0' AS observed /* agent_issue edited by hand */";
const db2 = build({ probe: edited });
for (const stmt of split(sql)) db2.exec(stmt);
ok(db2.prepare("SELECT verify_probe FROM remediation_contracts").get().verify_probe === edited, "a detector that already mentions agent_issue is not overwritten");

// 4. rollback
db = build();
r = seed(db);
const oldView = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'v_portfolio_drift_roadmap'").get().sql;
const oldProbe = db.prepare("SELECT verify_probe FROM remediation_contracts").get().verify_probe;
for (const stmt of split(sql)) db.exec(stmt);
for (const stmt of split(rollback.replace(/;\s*/g, ";\n"))) db.exec(stmt);
ok(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'v_portfolio_drift_roadmap'").get().sql.replace(/\s+/g, " ") === oldView.replace(/\s+/g, " "), "the Rollback line restores the old view");
ok(db.prepare("SELECT verify_probe FROM remediation_contracts").get().verify_probe === oldProbe, "and the old detector");
ok(drift(db).includes("roadmap-unmirrored:" + r.twinUnfiled), "so the twin reads as drift again after the rollback");

// 5. shape
ok(!/\bCREATE\s+TRIGGER\b/i.test(sql) && !/^\s*DELETE\b/im.test(sql.replace(/^--.*$/gm, "")), "the file adds no trigger and no row-level DELETE");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- BACKUP: roadmap_implementation$/m.test(sql), "the opt-in headers and the backup line (for the DROP VIEW) are present");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
