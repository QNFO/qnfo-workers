// STUCK-SUMMARY-SUPERSEDED-TERMINAL-1 offline suite: replays migrations/2026-10-19-stuck-summary-superseded-terminal.sql on node:sqlite.
// The live view text (3391 bytes, read from qnfo-audit sqlite_master 2026-10-19) is the pre-image carried in the file's own Rollback line.
// Proves: the new view is the old one with exactly one change ('superseded' joins the terminal statuses of code_tasks_stalled); the old
// code_tasks_stalled fragment counts a superseded task older than 120 minutes and the new one does not (the defect is reproduced first);
// the detector fm-stuck-summary-superseded-counted reads the defect on the old view and 0 on the new one; the Rollback line restores the old view
// byte for byte (whitespace-normalised); re-applying the file is harmless; the file keeps its backup and its decision row once.
// Run: node migrations/stuck-summary-superseded-terminal.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const FILE = new URL("./2026-10-19-stuck-summary-superseded-terminal.sql", import.meta.url);
const sql = readFileSync(FILE, "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const norm = (s) => s.replace(/\s+/g, " ").trim();

function statements(text) {
  const out = []; let cur = "";
  for (const line of text.split("\n")) {
    if (line.startsWith("--")) continue;
    cur += line + "\n";
    // a statement ends at a line ending with ';' when the quotes so far are balanced
    if (/;\s*$/.test(line) && (cur.match(/'/g) || []).length % 2 === 0) { out.push(cur.trim()); cur = ""; }
  }
  return out;
}
const stmts = statements(sql);
const rollbackLine = sql.split("\n").find((l) => l.startsWith("-- Rollback:"));
const rollbackSql = rollbackLine.slice("-- Rollback:".length).trim();
const rbParts = rollbackSql.split("; ");
const oldView = rbParts.find((p) => p.startsWith("CREATE VIEW v_stuck_summary AS"));
const createView = stmts.find((s) => s.startsWith("CREATE VIEW v_stuck_summary AS")).replace(/;$/, "");
ok(!!oldView, "the Rollback line carries the old view text");
ok(norm(createView).length === norm(oldView).length + ", 'superseded'".length, "the new view is longer by exactly the one added status", [norm(createView).length, norm(oldView).length]);
ok(norm(createView).replace(", 'superseded')", ")") === norm(oldView), "removing the added status gives back the old view text");
ok(norm(oldView).startsWith("CREATE VIEW v_stuck_summary AS SELECT (SELECT COUNT(*) FROM research_queue q JOIN research_review_seen s"), "the pre-image starts as the live view does");

// --- the defect and the fix on the code_tasks_stalled fragment ---------------------------------------------------------------------------
const frag = (viewSql) => viewSql.match(/\(SELECT COUNT\(\*\) FROM code_tasks WHERE status NOT IN \([^)]*\)\s+AND datetime\(updated_at\) < datetime\('now', '-120 minutes'\)\) AS code_tasks_stalled/)[0].replace(/ AS code_tasks_stalled$/, "");
function dbWith(viewSql) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, updated_at TEXT)");
  const old = (h) => new Date(Date.now() - h * 3600e3).toISOString().replace("T", " ").slice(0, 19);
  const add = (id, st, h) => db.prepare("INSERT INTO code_tasks VALUES (?, ?, ?)").run(id, st, old(h));
  add("a", "superseded", 5); add("b", "superseded", 9); add("c", "merged", 5); add("d", "queued", 5); add("e", "queued", 0.1); add("f", "superseded", 0.1); add("g", "needs_human", 7);
  db.exec(viewSql);
  return db;
}
const dOld = dbWith(oldView), dNew = dbWith(createView);
const countOld = dOld.prepare("SELECT " + frag(oldView) + " AS n").get().n;
const countNew = dNew.prepare("SELECT " + frag(createView) + " AS n").get().n;
ok(countOld === 3, "old fragment counts the two old superseded tasks and the old queued task (the defect)", countOld);
ok(countNew === 1, "new fragment counts only the old queued task", countNew);

// --- the detector --------------------------------------------------------------------------------------------------------------------------------
const detSql = stmts.find((s) => s.startsWith("INSERT OR IGNORE INTO remediation_contracts")).match(/VALUES \('fm-stuck-summary-superseded-counted'[\s\S]*?'(SELECT [\s\S]*?AS observed)',\n/)[1].replace(/''/g, "'");
ok(dOld.prepare(detSql).get().observed === "2" && dNew.prepare(detSql).get().observed === "0", "the detector reads 2 on the old view and 0 on the new one", [dOld.prepare(detSql).get(), dNew.prepare(detSql).get()]);

// --- the file applied to a database that holds the old view, twice ---------------------------------------------------------------------------
function applyFile(db) {
  for (const s of stmts) {
    if (/^INSERT INTO decision_log/.test(s) || /^INSERT OR IGNORE INTO (failure_modes|remediation_contracts)/.test(s)) continue; // registry tables are not modelled here
    db.exec(s);
  }
}
const dApply = dbWith(oldView);
applyFile(dApply);
const live = () => dApply.prepare("SELECT sql FROM sqlite_master WHERE name = 'v_stuck_summary'").get().sql;
ok(norm(live()) === norm(createView), "applying the file leaves the new view", norm(live()).slice(0, 80));
ok(dApply.prepare("SELECT COUNT(*) AS n FROM bak_20261019_stuck_summary_view").get().n === 1, "the backup table holds the view text once");
const bakText = dApply.prepare("SELECT sql FROM bak_20261019_stuck_summary_view").get().sql;
ok(norm(bakText) === norm(oldView), "the backup is the old view");
applyFile(dApply);
ok(norm(live()) === norm(createView) && dApply.prepare("SELECT COUNT(*) AS n FROM bak_20261019_stuck_summary_view").get().n === 1, "a second apply changes nothing and keeps the first backup");
ok(dApply.prepare("SELECT " + frag(live()) + " AS n").get().n === 1, "the applied view counts 1, not 3");

// --- the Rollback line ------------------------------------------------------------------------------------------------------------------------------
const rb = new DatabaseSync(":memory:");
rb.exec("CREATE TABLE code_tasks (id TEXT, status TEXT, updated_at TEXT); CREATE TABLE remediation_contracts (class TEXT); CREATE TABLE failure_modes (fm_key TEXT)");
rb.exec(createView);
for (const p of rbParts) { const s = p.trim().replace(/;$/, ""); if (s) rb.exec(s); }
ok(norm(rb.prepare("SELECT sql FROM sqlite_master WHERE name = 'v_stuck_summary'").get().sql) === norm(oldView), "the Rollback line restores the old view");

// --- the file's own bookkeeping --------------------------------------------------------------------------------------------------------------------
ok(/-- APPLY-BY: ci/.test(sql) && /-- DB: qnfo-audit/.test(sql) && /-- BACKUP: bak_20261019_stuck_summary_view/.test(sql), "the header carries APPLY-BY, DB and BACKUP");
ok((sql.match(/WHERE NOT EXISTS \(SELECT 1 FROM decision_log WHERE instr\(action, 'STUCK-SUMMARY-SUPERSEDED-TERMINAL-1:'\) = 1\)/g) || []).length === 1, "the decision row is guarded once");

console.log("stuck-summary-superseded-terminal: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
