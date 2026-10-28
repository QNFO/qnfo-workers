// Offline test for migrations/2026-10-28-cluster-e-b-doers.sql (ROADMAP-DOERS-EB-1). State-independent: it replays the file on SQLite against a fixture of the live
// layout and asserts the shape of what is written, never the content of a worker on this checkout (an anchor stops occurring once its fix lands).
//   * headers MIGRATION-RUNNER-1 needs, a BACKUP table for the rollback;
//   * every issue it gives a code-task gets exactly one code-task line naming an existing file, and a non-empty anchor line after a double apply;
//   * no code-probe line is written (a marker probe would close a measurement issue on its first edit);
//   * the three storage tables exist, the two metrics keep their [BP26] tag, the 1000638 contract becomes a code-read probe on an existing doc;
//   * other issues are untouched, and the session record is written once.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-28-cluster-e-b-doers.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const body = sql.replace(/^--.*$/gm, "");

ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+/m.test(sql), "migration headers present");
ok(/^-- BACKUP: bak_20261028_cluster_eb_issues$/m.test(sql) && /CREATE TABLE IF NOT EXISTS bak_20261028_cluster_eb_issues AS SELECT/.test(body), "backup table named in the header and created by the file");
ok(!/\bcode-probe:/.test(body), "no code-probe line is written");
ok(!/\b(DELETE FROM|DROP TABLE|DROP INDEX)\b/i.test(body), "the body deletes and drops nothing");

const CODE_IDS = [1000637, 1000639, 1000640, 1000641, 1000644, 1000648, 1000649, 1000650, 1000652, 1000664, 1000709];
const NOTE_IDS = [1000642, 1000651, 1000653, 1000665, 1000707];
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT, updated_at INTEGER)");
db.exec("CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, verify_probe TEXT, verify_transport TEXT, next_due_at TEXT)");
db.exec("CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, source_of_truth TEXT)");
db.exec(`CREATE TABLE session_records (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, wbs_code TEXT, agent_name TEXT, summary TEXT, decisions_made TEXT, files_changed TEXT,
  commits TEXT, infrastructure_changes TEXT, handoff_notes TEXT, execution_ratio REAL, total_tasks INTEGER, completed_tasks INTEGER, started_at TEXT, completed_at TEXT, created_at TEXT)`);
for (const id of [...CODE_IDS, ...NOTE_IDS, 1000999]) {
  const desc = id === 1000709 ? "MODEL-MATRIX-1 text\nsession-task: repo=qnfo-workers path=qnfo-research-exec/worker.js\ncode-anchor: var MODELS_COST_ORDER = [];" : "plain description " + id;
  db.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (?, ?, ?, 'open')").run(id, "t" + id, desc);
}
db.prepare("INSERT INTO remediation_contracts VALUES ('issue-1000638', 'WITH x AS (SELECT 1) SELECT 1', 'd1-query', NULL)").run();
db.prepare("INSERT INTO metric_registry VALUES ('claim_coverage', 'claims ledger (to build) [BP26]'), ('seeded_false_claim_catch_rate', 'verifier canary ledger (to build) [BP26]')").run();
db.exec(sql);
db.exec(sql);

for (const id of CODE_IDS) {
  const d = db.prepare("SELECT description FROM agent_issues WHERE id = ?").get(id).description;
  const tasks = d.match(/^code-task: repo=qnfo-workers path=(\S+)$/gm) || [];
  const anchors = d.match(/^code-anchor: (.+)$/gm) || [];
  ok(tasks.length === 1, id + ": exactly one code-task line after a double apply", tasks);
  ok(anchors.length === 1 && anchors[0].length > "code-anchor: ".length + 8, id + ": one non-trivial code-anchor line", anchors);
  const p = /^code-task: repo=qnfo-workers path=(\S+)$/m.exec(d);
  ok(!!p && existsSync(new URL("../" + p[1], import.meta.url)), id + ": the named file exists", p && p[1]);
  ok(!/session-task:/.test(d), id + ": no session-task line left");
}
for (const id of NOTE_IDS) {
  const d = db.prepare("SELECT description FROM agent_issues WHERE id = ?").get(id).description;
  ok(!/code-task:/.test(d) && d.length > ("plain description " + id).length, id + ": a state note, no code-task");
}
ok(db.prepare("SELECT description FROM agent_issues WHERE id = 1000999").get().description === "plain description 1000999", "an issue outside the list is untouched");

for (const t of ["paper_claims", "seeded_claim_runs", "ops_run_events"]) {
  ok(!!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(t), t + " exists");
}
const probe = db.prepare("SELECT verify_probe, verify_transport FROM remediation_contracts WHERE class = 'issue-1000638'").get();
const pj = JSON.parse(probe.verify_probe);
ok(probe.verify_transport === "code-read" && pj.paths.length === 1 && existsSync(new URL("../" + pj.paths[0], import.meta.url)), "1000638 contract is a code-read probe on an existing file", probe);
ok(readFileSync(new URL("../" + pj.paths[0], import.meta.url), "utf8").includes(pj.contains), "the 1000638 probe marker is present in the doc it reads");
const mr = db.prepare("SELECT metric, source_of_truth FROM metric_registry ORDER BY metric").all();
ok(mr.every((r) => r.source_of_truth.includes("[BP26]") && !r.source_of_truth.includes("to build")), "both metrics keep the [BP26] tag and lose to-build", mr);
ok(db.prepare("SELECT COUNT(*) AS n FROM session_records WHERE session_id = 'session-cluster-e-b-1028'").get().n === 1, "one session record after a double apply");
const bak = db.prepare("SELECT COUNT(*) AS n FROM bak_20261028_cluster_eb_issues").get().n;
ok(bak === CODE_IDS.length + NOTE_IDS.length - 0, "the backup holds every issue the file edits", bak);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
