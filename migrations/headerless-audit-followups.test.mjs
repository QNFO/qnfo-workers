// MIGRATION-HEADERLESS-AUDIT-1 offline suite (agent_issues 100056).
// Applies migrations/2026-10-20-headerless-audit-followups.sql on SQLite (node:sqlite) over fixtures shaped like the live tables and proves:
//   1. the header (APPLY-BY ci, DB qnfo-audit, one single-line Rollback, no DELETE or DROP in the body, so no BACKUP header);
//   2. the three indexes are the ones 2026-10-18-artifacts-canonical-sync.sql declared, on columns the live tables have, are created, and a
//      replay is a no-op (the control_registry evidence is appended once);
//   3. the control_registry row of the emptied allowlist becomes remove/applied, no other row changes, and the Rollback restores the
//      disposition and drops the indexes;
//   4. migrations/headerless-allowlist.txt names no file and carries no ".sql" (the closing code-probe is absent ".sql");
//   5. scripts/apply_migrations.py --check over every migration refuses nothing, and every file that was on the allowlist (all of them
//      now carry an APPLY-BY: manual line first in the file, reason of 40 or more characters) declares its result;
//   6. the six files that needed a decision name their database or their missing part in the declaration.
// Run: node --no-warnings migrations/headerless-audit-followups.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const norm = (t) => t.replace(/\r\n/g, "\n");
const sql = norm(readFileSync(join(here, "2026-10-20-headerless-audit-followups.sql"), "utf8"));
const orig = norm(readFileSync(join(here, "2026-10-18-artifacts-canonical-sync.sql"), "utf8"));
const allow = norm(readFileSync(join(here, "headerless-allowlist.txt"), "utf8"));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

// ---- 1. header ----
const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
const body = lines.filter((l) => !l.startsWith("--")).join("\n");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
ok(lines.filter((l) => /^-- Rollback: /.test(l)).length === 1 && hdr("Rollback").length > 100, "one single-line Rollback");
ok(!/\bDELETE\b|\bDROP\b/i.test(body) && hdr("BACKUP") === "", "the body has no DELETE or DROP, so no BACKUP header is needed");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link");

// ---- 2. the indexes are the original file's ----
const idx = (t) => (t.match(/CREATE INDEX IF NOT EXISTS\s+\w+\s+ON\s+\w+\([^)]*\)/g) || []).map((s) => s.replace(/\s+/g, " "));
const mine = idx(body), theirs = idx(orig.split("\n").filter((l) => !l.startsWith("--")).join("\n"));
ok(mine.length === 3 && JSON.stringify(mine.slice().sort()) === JSON.stringify(theirs.slice().sort()), "the three index definitions equal those of 2026-10-18-artifacts-canonical-sync.sql", { mine, theirs });

const DDL = `
CREATE TABLE artifact_sync_state (repo_id TEXT PRIMARY KEY, namespace TEXT NOT NULL, repo TEXT NOT NULL, branch TEXT, github_sha TEXT, artifacts_sha TEXT, in_sync INTEGER NOT NULL DEFAULT 0, github_committed_at TEXT, artifacts_committed_at TEXT, last_checked TEXT, last_error TEXT, drift_since TEXT, repair_count INTEGER NOT NULL DEFAULT 0, last_repaired TEXT, waived_reason TEXT);
CREATE TABLE repo_file_index (id TEXT PRIMARY KEY, repo_id TEXT NOT NULL, namespace TEXT NOT NULL, repo TEXT NOT NULL, path TEXT NOT NULL, blob_sha TEXT, bytes INTEGER, lines INTEGER, lang TEXT, vector_ids TEXT, chunks INTEGER DEFAULT 0, indexed_at TEXT, error TEXT);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT, kind TEXT, guards_against TEXT, critical_path INTEGER, disposition TEXT, disposition_state TEXT, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT, issue_id INTEGER, reviewed_at TEXT);
INSERT INTO control_registry (control, kind, disposition, disposition_state, evidence, reviewed_at) VALUES ('migration-headerless-allowlist', 'filter', 'demote', 'planned', 'Reason and expiry recorded 2026-10-19', '2026-10-20T00:00:35.734Z');
INSERT INTO control_registry (control, kind, disposition, disposition_state, evidence, reviewed_at) VALUES ('migration-header-guard', 'gate', 'keep', 'applied', 'unchanged', '2026-10-19T00:00:00Z');
INSERT INTO artifact_sync_state (repo_id, namespace, repo, in_sync) VALUES ('r1', 'qnfo', 'a', 1), ('r2', 'qnfo', 'b', 0);
INSERT INTO repo_file_index (id, repo_id, namespace, repo, path, blob_sha) VALUES ('f1', 'r1', 'qnfo', 'a', 'x', 's1');`;
const db = new DatabaseSync(":memory:");
db.exec(DDL);
const idxNames = () => db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name").all().map((r) => r.name);
ok(idxNames().length === 0, "fixture starts without the three indexes (the live state)");
db.exec(sql);
ok(JSON.stringify(idxNames()) === JSON.stringify(["idx_artifact_sync_drift", "idx_repo_file_index_repo", "idx_repo_file_index_sha"]), "the three indexes exist after the file", idxNames());
ok(db.prepare("SELECT count(*) n FROM artifact_sync_state").get().n === 2 && db.prepare("SELECT count(*) n FROM repo_file_index").get().n === 1, "no row of the indexed tables changed");
const row = () => db.prepare("SELECT * FROM control_registry WHERE control = 'migration-headerless-allowlist'").get();
ok(row().disposition === "remove" && row().disposition_state === "applied" && /EMPTIED 2026-10-20/.test(row().evidence) && row().evidence.startsWith("Reason and expiry recorded 2026-10-19"), "the allowlist control becomes remove/applied and keeps its earlier evidence", row());
ok(db.prepare("SELECT disposition, evidence FROM control_registry WHERE control = 'migration-header-guard'").get().disposition === "keep" && db.prepare("SELECT evidence FROM control_registry WHERE control = 'migration-header-guard'").get().evidence === "unchanged", "no other control row changes");
const ev1 = row().evidence;
db.exec(sql);
ok(row().evidence === ev1 && idxNames().length === 3, "a replay is a no-op (evidence appended once)");

// ---- 3. rollback ----
db.exec(hdr("Rollback"));
ok(idxNames().length === 0 && row().disposition === "demote" && row().disposition_state === "planned", "the Rollback drops the indexes and restores demote/planned", { idx: idxNames(), row: row() });
db.exec(sql);
ok(idxNames().length === 3 && row().disposition === "remove", "the file applies again after a rollback");

// ---- 4. the allowlist ----
const listed = allow.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
ok(listed.length === 0, "migrations/headerless-allowlist.txt names no file", listed.slice(0, 3));
ok(!allow.toLowerCase().includes(".sql"), "the allowlist text carries no .sql, which is the closing code-probe (absent)");
ok(/^# EXPIRES: \d{4}-\d{2}-\d{2}/m.test(allow), "the allowlist still parses its EXPIRES date");

// ---- 5. every migration passes --check, and the audited files declare ----
const PY = ["python3", "python"].find((c) => { const r = spawnSync(c, ["-I", "-c", "print(1)"], { encoding: "utf8" }); return r.status === 0; });
ok(!!PY, "a python 3 interpreter is available");
const files = readdirSync(here).filter((f) => f.endsWith(".sql")).sort().map((f) => join("migrations", f));
// SUITE-PORT-32K-1: the full list is ~42 KB of arguments, past the ~32k CreateProcess command-line limit on Windows
// (spawnSync fails before python starts and the suite used to crash on out.stdout === undefined). One spawn per
// batch of 60 files keeps every platform under the limit; the assertions below read the merged records.
const recs = [];
let spawnError = null, batchFailures = 0, expiredSeen = false;
for (let i = 0; i < files.length; i += 60) {
  const out = spawnSync(PY, [join(root, "scripts", "apply_migrations.py"), "--check", "--history", ...files.slice(i, i + 60)], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (out.error) { spawnError = out.error; continue; }
  if (out.status !== 0) batchFailures++;
  if ((out.stderr || "").includes("expired")) expiredSeen = true;
  recs.push(...String(out.stdout || "").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean));
}
ok(!spawnError && batchFailures === 0 && !recs.some((r) => r.refused), "apply_migrations.py --check over every migration refuses nothing", { spawnError: spawnError && String(spawnError), batchFailures, refused: recs.filter((r) => r.refused).slice(0, 2) });
const declared = recs.filter((r) => r.declared);
ok(declared.length >= 92, "at least the 92 audited files are declared (APPLY-BY: manual or none)", declared.length);
ok(!expiredSeen, "no expiry warning is printed");
const manualFirst = [];
for (const r of declared) {
  const t = readFileSync(join(root, r.file), "utf8");
  const m = /^-- APPLY-BY: (manual|none) \((.+)\)$/.exec(t.split("\n")[0]);
  if (m && m[2].length >= 40) manualFirst.push(r.file);
}
ok(manualFirst.length >= 92, "92 or more files carry their APPLY-BY declaration, with a reason of 40+ characters, as the first line", manualFirst.length);

// ---- 6. the six files that needed a decision ----
const decl = (f) => norm(readFileSync(join(here, f), "utf8")).split("\n")[0];
ok(/living-paper/.test(decl("2026-10-18-paper-tags.sql")) && /living-paper/.test(decl("2026-10-18-paper-audience-categories.sql")) && /living-paper/.test(decl("2026-10-05-guard-trigger-order-and-shadow.sql")), "the three living-paper files say so");
ok(/personal-life/.test(decl("2026-10-01-personal-life-vestigial-planes.sql")), "the personal-life file says so");
ok(/2026-10-20-headerless-audit-followups/.test(decl("2026-10-18-artifacts-canonical-sync.sql")), "the partial artifacts file names the migration that creates its indexes");
ok(/project_state_v2 is absent because this file renames it/.test(decl("2026-10-06-project-state-second-collision.sql")), "the rename file explains the object that looks missing");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
