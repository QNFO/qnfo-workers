// REM-A4-BP26-MAP-1 offline suite: replays migrations/2026-10-26-rem-a4-bp26-map.sql on node:sqlite over the live-shaped tables (agent_issues with predicate_id, issue_project_map, projects,
// portfolio_gaps, remediation_contracts, decision_log). Proves:
//  * the 30 mappings the file writes are exactly the catalogue's own (predicate_id -> project, program) pairs of migrations/2026-10-26-best-practice-catalogue.sql;
//  * the 30 catalogue issues that the steward moved to W.qnfo-ops (open and closed) are mapped back to their BP26 project and program; a row already on a BP26 project, an issue whose BP26 project
//    is not active, an issue that is not a catalogue issue and a catalogue issue with no map row are not touched; the kind and the other columns are kept;
//  * the open no-mapped-work gap rows of a project that now has a mapped issue are closed with a resolved_at; a project with no mapped issue (a derived QNFO.INFRA stub) keeps its open row; closed rows
//    and other gap kinds are not touched; the umbrella probe (open non-infra no-mapped-work rows) reads 0 afterwards and 5 before;
//  * the action text of issue-2993 stops saying VACUOUS-PROBE-V3-1 and its probe is unchanged; a second apply changes nothing; the Rollback line restores the 30 rows, the gap rows and the action;
//    the decision is logged once; the file runs no DELETE or DROP.
// Run: node --no-warnings migrations/rem-a4-bp26-map.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const here = (f) => new URL("./" + f, import.meta.url);
// RA4B_MIGRATION points the suite at a mutated copy of the migration (mutation checks); unset, it reads the merged file.
const sql = readFileSync(process.env.RA4B_MIGRATION ? resolve(process.env.RA4B_MIGRATION) : here("2026-10-26-rem-a4-bp26-map.sql"), "utf8");
const catalogue = readFileSync(here("2026-10-26-best-practice-catalogue.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const one = (db, s, ...a) => db.prepare(s).get(...a);
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];

ok(/^-- APPLY-BY: ci\s*$/m.test(sql) && /^-- DB: qnfo-audit\s*$/m.test(sql) && sql.split("\n").filter((l) => l.startsWith("-- Rollback:")).length === 1, "header opts in, one single-line Rollback");
ok(!/^\s*(DELETE\s+FROM|DROP\s)/im.test(sql.replace(/^--.*$/gm, "")) && !/claude\.ai|anthropic\.com/i.test(sql), "no DELETE or DROP, no claude.ai link");

// the catalogue's own pairs
const pairs = [...catalogue.matchAll(/INSERT OR IGNORE INTO issue_project_map \(issue_id, project_code, program_code, kind, updated_at\) SELECT \(SELECT MAX\(id\) FROM agent_issues WHERE predicate_id = '([A-Z0-9-]+)'\), '([A-Z0-9.]+)', '([A-Z0-9.]+)', '([a-z]+)'/g)].map((m) => [m[1], m[2], m[3], m[4]]);
ok(pairs.length === 30, "the catalogue maps 30 issues", pairs.length);
const fileValues = [...sql.matchAll(/\('(BP26-[A-Z0-9-]+)', '(BP26\.[A-Z]+)', '(QNFO\.[A-Z]+)'\)/g)].map((m) => [m[1], m[2], m[3]]);
ok(fileValues.length === 30 && JSON.stringify(fileValues) === JSON.stringify(pairs.map((p) => p.slice(0, 3))), "the file's 30 pairs are the catalogue's, in order");

function build() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT DEFAULT 'open', predicate_id TEXT);
CREATE TABLE issue_project_map (issue_id INTEGER PRIMARY KEY, project_code TEXT NOT NULL, program_code TEXT NOT NULL, kind TEXT NOT NULL, synced_milestone INTEGER, synced_labels TEXT, gh_node TEXT, gh_item TEXT, updated_at TEXT, synced_at TEXT);
CREATE TABLE projects (project_code TEXT PRIMARY KEY, program_code TEXT NOT NULL, name TEXT, status TEXT NOT NULL DEFAULT 'active', source TEXT);
CREATE TABLE portfolio_gaps (kind TEXT NOT NULL, entity TEXT NOT NULL, detail TEXT, first_seen TEXT DEFAULT (datetime('now')), day TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', resolved_at TEXT, issue_id INTEGER, attempts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (kind, entity, day));
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT 'p', action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL DEFAULT 'd1-query', escalate_to TEXT NOT NULL DEFAULT 'x', status TEXT, last_verdict TEXT, attempts INTEGER DEFAULT 0, module TEXT, max_attempts INTEGER DEFAULT 3, expected_cadence_h INTEGER);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
`);
  return db;
}
const PROBE_2993 = "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM portfolio_gaps WHERE status='open' AND kind='no-mapped-work' AND entity NOT LIKE 'QNFO.INFRA.%') AS TEXT) AS observed";
const VAC = "VACUOUS-PROBE-V3-1: no verdict while the issue is open (nothing here measures its defect); passes once the issue is closed with issue_triage.close_evidence. A doer that knows the defect replaces this probe with one that measures it.";
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
function world() {
  const db = build();
  for (const p of ["BP26.EDITORIAL", "BP26.COMPLIANCE", "BP26.REACH", "BP26.ENGINEERING", "BP26.AGENTOPS"]) db.prepare("INSERT INTO projects (project_code, program_code, name, status, source) VALUES (?, 'P', ?, 'active', 'bp26')").run(p, p);
  db.prepare("INSERT INTO projects (project_code, program_code, name, status, source) VALUES ('W.qnfo-ops', 'QNFO.OPS', 'ops', 'active', 'derived'), ('QNFO.INFRA.D1', 'QNFO.INFRA', 'd1', 'active', 'derived'), ('BP26.OLD', 'QNFO.OPS', 'old', 'completed', 'bp26')").run();
  let id = 1000332;
  const ids = {};
  for (const [pred] of pairs) {
    id++; ids[pred] = id;
    db.prepare("INSERT INTO agent_issues (id, title, status, predicate_id) VALUES (?, ?, ?, ?)").run(id, pred, id === 1000342 ? "closed" : "open", pred);
    db.prepare("INSERT INTO issue_project_map (issue_id, project_code, program_code, kind, updated_at, synced_milestone, gh_node) VALUES (?, 'W.qnfo-ops', 'QNFO.OPS', 'enhancement', '2026-10-26T10:00:00Z', 7, 'N')").run(id);
  }
  // not touched: an issue with no catalogue predicate, a catalogue-like issue whose BP26 project is not active, one that already sits on a BP26 project, one with no map row
  db.prepare("INSERT INTO agent_issues (id, title, status, predicate_id) VALUES (9001, 'plain', 'open', NULL), (9002, 'old-project issue', 'open', 'OTHER-LEGACY'), (9003, 'no map row', 'open', 'BP26-EVALS')").run();
  db.prepare("INSERT INTO issue_project_map (issue_id, project_code, program_code, kind) VALUES (9001, 'W.qnfo-ops', 'QNFO.OPS', 'fix'), (9002, 'W.qnfo-ops', 'QNFO.OPS', 'fix')").run();
  db.prepare("UPDATE issue_project_map SET project_code = 'BP26.EDITORIAL', program_code = 'KEEP' WHERE issue_id = ?").run(ids["BP26-CLAIM-LEDGER"]);   // already on a BP26 project
  // the gaps: the five BP26 rows (open, the umbrella's five), a derived stub with no mapped issue, an old closed row, another kind, a gap for a project that has a mapped non-catalogue issue
  for (const p of ["BP26.EDITORIAL", "BP26.COMPLIANCE", "BP26.REACH", "BP26.ENGINEERING", "BP26.AGENTOPS"]) db.prepare("INSERT INTO portfolio_gaps (kind, entity, day, status) VALUES ('no-mapped-work', ?, ?, 'open')").run(p, day(0));
  db.prepare("INSERT INTO portfolio_gaps (kind, entity, day, status) VALUES ('no-mapped-work', 'QNFO.INFRA.D1', ?, 'open'), ('no-mapped-work', 'QNFO.OPS.AUDT', ?, 'closed'), ('upgrade-compat', 'BP26.EDITORIAL', ?, 'open')").run(day(0), day(9), day(0));
  db.prepare("UPDATE portfolio_gaps SET resolved_at = '2026-10-19 10:00:00' WHERE entity = 'QNFO.OPS.AUDT'").run();
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, action, verify_probe, status, last_verdict, attempts, module) VALUES ('issue-2993', 2993, ?, ?, 'active', 'fail', 196, 'probe-template-v3-generic')").run(VAC, PROBE_2993);
  return { db, ids };
}
const probe = (db) => db.prepare(PROBE_2993).get().observed;
const { db, ids } = world();
ok(probe(db) === "5", "before: the umbrella probe reads 5 (the five BP26 projects)", probe(db));
const before = Object.fromEntries(db.prepare("SELECT * FROM issue_project_map").all().map((r) => [r.issue_id, r]));
db.exec(sql);
const after = Object.fromEntries(db.prepare("SELECT * FROM issue_project_map").all().map((r) => [r.issue_id, r]));

for (const [pred, proj, prog, kind] of pairs) {
  if (pred === "BP26-CLAIM-LEDGER") continue;
  const r = after[ids[pred]];
  ok(r.project_code === proj && r.program_code === prog && r.kind === kind, "mapped back: " + pred, r);
}
const cl = after[ids["BP26-CLAIM-LEDGER"]];
ok(cl.project_code === "BP26.EDITORIAL" && cl.program_code === "KEEP", "a row already on a BP26 project is not touched");
ok(after[ids["BP26-GDPR-RECORDS"]].project_code === "BP26.COMPLIANCE", "a closed catalogue issue is mapped too (1000342)");
ok(after[9001].project_code === "W.qnfo-ops" && after[9002].project_code === "W.qnfo-ops", "a plain issue and an issue whose BP26 project is not in the catalogue list are not touched");
ok(after[9003] === undefined, "a catalogue issue with no map row gets none (the file moves rows, it does not create them)");
ok(after[ids["BP26-EVALS"]].project_code === "BP26.AGENTOPS", "the catalogue predicate of the issue picks the project");
const keep = (id) => after[id].synced_milestone === before[id].synced_milestone && after[id].gh_node === before[id].gh_node && after[id].kind === before[id].kind;
ok(Object.values(ids).every(keep), "kind, synced_milestone and gh_node are kept (the steward re-syncs the labels)");
ok(Object.values(ids).filter((i) => after[i].project_code.startsWith("BP26.")).length === 30, "all 30 catalogue issues sit on a BP26 project");

const gaps = db.prepare("SELECT kind, entity, day, status, resolved_at FROM portfolio_gaps").all();
const g = (kind, entity) => gaps.find((x) => x.kind === kind && x.entity === entity);
for (const p of ["BP26.EDITORIAL", "BP26.COMPLIANCE", "BP26.REACH", "BP26.ENGINEERING", "BP26.AGENTOPS"]) ok(g("no-mapped-work", p).status === "closed" && /^\d{4}-\d{2}-\d{2} \d{2}:/.test(g("no-mapped-work", p).resolved_at), "gap closed with a resolved_at: " + p);
ok(g("no-mapped-work", "QNFO.INFRA.D1").status === "open", "a project with no mapped issue keeps its open gap (derived stub)");
ok(g("no-mapped-work", "QNFO.OPS.AUDT").resolved_at === "2026-10-19 10:00:00" && g("upgrade-compat", "BP26.EDITORIAL").status === "open", "closed rows and other gap kinds are not touched");
ok(probe(db) === "0", "after: the umbrella probe reads 0", probe(db));

const k = one(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-2993'");
ok(!/VACUOUS-PROBE-V3-1/.test(k.action) && /MEASURES the defect/.test(k.action) && k.verify_probe === PROBE_2993 && k.status === "active" && k.attempts === 196 && k.module === "rem-a4-portfolio", "the umbrella contract has an honest action; its probe, status and attempts are unchanged", k.action);
ok(one(db, "SELECT COUNT(*) AS n FROM bak_20261026_rem_a4_portfolio_map").n === 30 && one(db, "SELECT COUNT(*) AS n FROM bak_20261026_rem_a4_portfolio_gaps").n === 6 && one(db, "SELECT COUNT(*) AS n FROM bak_20261026_rem_a4_portfolio_contract_2993").n === 1, "the before-state is saved (the 30 mapped catalogue issues, the 6 open no-mapped-work rows, the contract)");
ok(one(db, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'REM-A4-BP26-MAP-1:') = 1").n === 1, "the decision is logged once");
const fm = one(db, "SELECT * FROM failure_modes WHERE fm_key = 'catalogue-mapping-overwritten'");
const det = one(db, "SELECT * FROM remediation_contracts WHERE class = 'fm-catalogue-mapping-overwritten'");
ok(fm && fm.probe_class === "fm-catalogue-mapping-overwritten" && fm.issue_id === 2993 && det && det.status === "active" && det.module === "failure-mode" && det.issue_id === null, "the failure mode and its detector contract are registered");
const dprobe = (d) => d.prepare(det.verify_probe).get();
ok(dprobe(db).expected === "0" && dprobe(db).observed === "0", "the detector reads 0 once the 30 issues sit on their BP26 projects");
db.prepare("UPDATE issue_project_map SET project_code = 'W.qnfo-ops' WHERE issue_id = ?").run(ids["BP26-EVALS"]);
ok(dprobe(db).observed === "1", "the detector reads 1 when a placement pass moves one open catalogue issue off its project again");
db.prepare("UPDATE issue_project_map SET project_code = 'BP26.AGENTOPS' WHERE issue_id = ?").run(ids["BP26-EVALS"]);
const w2 = world();
ok(w2.db.prepare(det.verify_probe).get().observed === "28", "on the pre-apply world the detector would read 28 (30 catalogue issues, one closed, one already on a BP26 project)");

const snap = () => JSON.stringify([db.prepare("SELECT * FROM issue_project_map ORDER BY issue_id").all(), db.prepare("SELECT * FROM portfolio_gaps ORDER BY kind, entity, day").all(), db.prepare("SELECT * FROM remediation_contracts").all(), db.prepare("SELECT COUNT(*) AS n FROM decision_log").all()]);
const s0 = snap(); db.exec(sql);
ok(snap() === s0, "a second apply changes nothing (the backups keep the first before-state)");

for (const stmt of rollback.split("; ")) db.exec(stmt);
const rb = Object.fromEntries(db.prepare("SELECT * FROM issue_project_map").all().map((r) => [r.issue_id, r]));
ok(Object.values(ids).every((i) => rb[i].project_code === before[i].project_code && rb[i].program_code === before[i].program_code && rb[i].updated_at === before[i].updated_at), "Rollback restores the 30 rows (project, program, updated_at)");
ok(probe(db) === "5" && db.prepare("SELECT status FROM portfolio_gaps WHERE entity = 'BP26.REACH' AND kind = 'no-mapped-work'").get().status === "open" && one(db, "SELECT action FROM remediation_contracts WHERE class = 'issue-2993'").action === VAC, "Rollback reopens the gap rows and restores the action");

// the steward fix is what keeps the mapping: a file applied while a worker still moves the rows is undone at the next pass (documented in the file header)
ok(/applied after the steward fix is live/.test(sql), "the header says the file is applied after the steward fix");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
