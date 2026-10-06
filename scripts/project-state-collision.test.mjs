#!/usr/bin/env node
// PROJECT-STATE-SECOND-COLLISION-1 (#1998): two fk-violation snapshots for one project inside the same instant must not
// abort the second parent write. Offline, node:sqlite, no network, no credentials, no live writes.
//   live DDL (the ROLLBACK blocks of the migration, verbatim sqlite_master text): the second violating INSERT in one
//     statement batch fails with "UNIQUE constraint failed" and the parent row is lost (the defect, reproduced);
//   repaired DDL (the CREATE statements of the migration): both parent rows land, two snapshots exist, a registered
//     target or a covered domain still writes no snapshot (the guards are not weakened).
// Run: node --no-warnings scripts/project-state-collision.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const MIG = readFileSync(new URL("../migrations/2026-10-06-project-state-second-collision.sql", import.meta.url), "utf8");
const ROLLBACK = {};
for (const m of MIG.matchAll(/^-- ROLLBACK-BEGIN (\w+)\n([\s\S]*?)^-- ROLLBACK-END \1$/gm)) {
  const lines = m[2].split("\n").filter((l) => l.length).map((l) => l.replace(/^-- ?/, ""));
  ROLLBACK[m[1]] = lines.filter((l) => !/^DROP (TRIGGER|TABLE) /.test(l)).join("\n");
}
const APPLY = MIG.split("\n").filter((l) => !l.startsWith("--")).join("\n");

let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

// the live DDL of the tables the triggers touch (sqlite_master 2026-10-06T05:46Z), trimmed to the columns they use
const BASE = `
CREATE TABLE programs (program_code TEXT PRIMARY KEY);
CREATE TABLE projects (project_code TEXT PRIMARY KEY, program_code TEXT NOT NULL REFERENCES programs(program_code), name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active');
INSERT INTO programs (program_code) VALUES ('QNFO.INFRA');
INSERT INTO projects (project_code, program_code, name) VALUES ('QNFO.INFRA.DNS', 'QNFO.INFRA', 'DNS'), ('QNFO.INFRA.PAGE', 'QNFO.INFRA', 'Pages');
CREATE TABLE dns_redirects (id TEXT PRIMARY KEY, record_type TEXT, source TEXT, target TEXT, status_code INTEGER, enabled BOOLEAN, created_on TEXT, modified_on TEXT, deleted_on TEXT, cloudflare_id TEXT, notes TEXT);
CREATE TABLE cf_pages_domain_mappings (id INTEGER PRIMARY KEY AUTOINCREMENT, project_name TEXT, pages_subdomain TEXT, custom_domain TEXT, zone_name TEXT, dns_record_id TEXT, domain_status TEXT DEFAULT "active");
CREATE TABLE audit_pages (id INTEGER PRIMARY KEY AUTOINCREMENT, project_name TEXT UNIQUE, subdomain TEXT, custom_domains TEXT, last_deployed TEXT, security_headers INTEGER DEFAULT 0, cache_headers INTEGER DEFAULT 0, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')), _version INTEGER DEFAULT 1);
INSERT INTO audit_pages (project_name, subdomain) VALUES ('registered', 'registered.pages.dev');
INSERT INTO dns_redirects (id, record_type, source, target) VALUES ('covered', 'CNAME', 'covered.qnfo.org', 'registered.pages.dev');
`;
const TWO_DNS = "INSERT INTO dns_redirects (id, record_type, source, target) VALUES ('c1', 'CNAME', 'a.qnfo.org', 'ghost-a.pages.dev'); INSERT INTO dns_redirects (id, record_type, source, target) VALUES ('c2', 'CNAME', 'b.qnfo.org', 'ghost-b.pages.dev');";
const TWO_PAGES = "INSERT INTO cf_pages_domain_mappings (project_name, pages_subdomain, custom_domain) VALUES ('p', 'p.pages.dev', 'x.qnfo.org'); INSERT INTO cf_pages_domain_mappings (project_name, pages_subdomain, custom_domain) VALUES ('q', 'q.pages.dev', 'y.qnfo.org');";
const count = (db, sql) => Number(db.prepare(sql).get().n);

function live() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(BASE);
  db.exec(ROLLBACK.project_state);
  db.exec(ROLLBACK.trg_dns_pages_fk);
  db.exec(ROLLBACK.trg_pages_domain_check);
  return db;
}
function repaired() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(BASE);
  db.exec(ROLLBACK.project_state); // the migration starts from the live table
  db.exec(APPLY);
  return db;
}

// 1 the defect on the live DDL: the second parent write in the same second is lost
let db = live();
let err = null;
try { db.exec(TWO_DNS); } catch (e) { err = String(e && e.message || e); }
check(/UNIQUE constraint failed/.test(err || ""), "live DDL: two violating CNAMEs in one second abort the second (" + (err || "no error") + ")");
check(count(db, "SELECT COUNT(*) AS n FROM dns_redirects WHERE id IN ('c1','c2')") === 1, "live DDL: only one of the two CNAME rows landed");

// 2 the repaired DDL: both parent rows land, both violations are recorded
db = repaired();
err = null;
try { db.exec(TWO_DNS); } catch (e) { err = String(e && e.message || e); }
check(err === null, "repaired: two violating CNAMEs in one batch both succeed" + (err ? " (" + err + ")" : ""));
check(count(db, "SELECT COUNT(*) AS n FROM dns_redirects WHERE id IN ('c1','c2')") === 2, "repaired: both CNAME rows landed");
check(count(db, "SELECT COUNT(*) AS n FROM project_state WHERE project_code = 'QNFO.INFRA.DNS' AND session_id = 'fk-violation'") === 2, "repaired: two DNS fk-violation snapshots");
const targets = db.prepare("SELECT json_extract(resource_counts, '$.record_target') AS t FROM project_state WHERE project_code = 'QNFO.INFRA.DNS' ORDER BY snapshot_id").all().map((r) => r.t);
check(JSON.stringify(targets) === JSON.stringify(["ghost-a.pages.dev", "ghost-b.pages.dev"]), "repaired: both snapshots name their own target, in order");
err = null;
try { db.exec(TWO_PAGES); } catch (e) { err = String(e && e.message || e); }
check(err === null && count(db, "SELECT COUNT(*) AS n FROM cf_pages_domain_mappings") === 2, "repaired: two uncovered Pages domains in one batch both land");
check(count(db, "SELECT COUNT(*) AS n FROM project_state WHERE project_code = 'QNFO.INFRA.PAGE'") === 2, "repaired: two PAGE fk-violation snapshots");
const at = db.prepare("SELECT snapshot_at FROM project_state ORDER BY snapshot_id LIMIT 1").get().snapshot_at;
check(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}$/.test(at), "repaired: snapshot_at has millisecond resolution (" + at + ")");
check(db.prepare("SELECT date(snapshot_at) AS d FROM project_state LIMIT 1").get().d === at.slice(0, 10), "repaired: date() still reads the new timestamp");
const cols = db.prepare("PRAGMA table_info(project_state)").all().map((c) => c.name);
check(JSON.stringify(cols) === JSON.stringify(["snapshot_id", "project_code", "snapshot_at", "session_id", "current_phase", "phase_progress", "resource_counts", "git_branch", "git_commit", "r2_snapshot_path"]), "repaired: every live column kept, snapshot_id added first");
check(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND name = 'idx_project_state_code_at'").get().n === 1, "repaired: (project_code, snapshot_at) is still indexed");

// 3 the guards are not weakened: a registered target and a covered domain write no snapshot; an unknown project still fails the FK
db = repaired();
db.exec("INSERT INTO dns_redirects (id, record_type, source, target) VALUES ('ok1', 'CNAME', 'ok.qnfo.org', 'registered.pages.dev'); INSERT INTO dns_redirects (id, record_type, source, target) VALUES ('ok2', 'CNAME', 'alias.qnfo.org', 'preview.registered.pages.dev');");
db.exec("INSERT INTO cf_pages_domain_mappings (project_name, pages_subdomain, custom_domain) VALUES ('registered', 'registered.pages.dev', 'covered.qnfo.org');");
check(count(db, "SELECT COUNT(*) AS n FROM project_state") === 0, "repaired: registered target, branch alias and covered domain write no snapshot");
err = null;
try { db.exec("INSERT INTO project_state (project_code, session_id) VALUES ('QNFO.NOPE', 'x')"); } catch (e) { err = String(e && e.message || e); }
check(/FOREIGN KEY constraint failed/.test(err || ""), "repaired: the projects foreign key is kept");

// 4 the migration copies existing rows
db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON;");
db.exec(BASE);
db.exec(ROLLBACK.project_state);
db.exec("INSERT INTO project_state (project_code, snapshot_at, session_id, current_phase, phase_progress, resource_counts, git_branch) VALUES ('QNFO.INFRA.DNS', '2026-10-01 10:00:00', 'old', 1, 0.5, '{}', 'main')");
db.exec(APPLY);
const old = db.prepare("SELECT * FROM project_state").get();
check(old && old.snapshot_id === 1 && old.snapshot_at === "2026-10-01 10:00:00" && old.git_branch === "main", "existing rows are copied with their values");

console.log(fails + " failure(s)");
process.exit(fails ? 1 : 0);
