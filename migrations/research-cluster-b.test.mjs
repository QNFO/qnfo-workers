// RESEARCH CLUSTER B offline suite: replays migrations/2026-10-20-research-cluster-b.sql on SQLite.
// Proves: the issue-99913 probe measures its definition of done (reads ok on the 2026-10-20 measurements, defect when the ETA is 100 h or more, a live row is at 5 recoveries, work waits with
// concurrency at the old constant, the floor gives up, or a gate-length terminal issue is under 24 h old) and does not count a HARD-review terminal issue; the issue-2792 probe counts pipeline
// papers failing the gate only (0 while the thin cohort is owner-authored, 1 for a pipeline paper); the owner-cohort goal, the two render errata and the reopened erratum are written, the
// reopened one only when it was closed; the blocker red team rows and capability ledger rows are written once; a second apply changes nothing; the Rollback line restores both contracts.
// Run: node --no-warnings migrations/research-cluster-b.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-20-research-cluster-b.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
const d = new DatabaseSync(":memory:");
d.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, status TEXT, last_verdict TEXT, next_due_at TEXT);
  CREATE TABLE cloud_ops_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, kind TEXT, text TEXT, job TEXT, status TEXT);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, created_at INTEGER);
  CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, recover_count INTEGER DEFAULT 0);
  CREATE TABLE burn (stream TEXT, eta_h REAL); CREATE VIEW v_backlog_burndown AS SELECT * FROM burn;
  CREATE TABLE papers (slug TEXT, status TEXT, release_gate_pass INTEGER, release_gate_reason TEXT, identifier TEXT);
  CREATE TABLE goals (id INTEGER PRIMARY KEY AUTOINCREMENT, goal_key TEXT UNIQUE, statement TEXT, goal_type TEXT, parent_objective TEXT, alignment TEXT, source TEXT, priority INTEGER, status TEXT, dod TEXT, owner TEXT, program_code TEXT);
  CREATE TABLE internal_errata (id TEXT PRIMARY KEY, target_kind TEXT NOT NULL, target_ref TEXT NOT NULL, detected_at TEXT NOT NULL, detected_by TEXT, severity TEXT, claim_text TEXT, falsification TEXT, evidence TEXT, remediation TEXT, status TEXT, owner TEXT, updated_at TEXT);
  CREATE TABLE blocker_redteam (id INTEGER PRIMARY KEY AUTOINCREMENT, target TEXT NOT NULL, claim TEXT, attempt TEXT NOT NULL, verdict TEXT NOT NULL, evidence TEXT NOT NULL, actor TEXT, ts TEXT, text_sig TEXT);
  CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT, prerequisites TEXT, reliability TEXT, acquired_at TEXT, last_exercised_at TEXT, evidence TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
d.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, status, last_verdict) VALUES ('issue-99913', 99913, 'p', 'VACUOUS-PROBE-V3-1 old', 'SELECT 1 AS old99913', 'd1-query', 'active', 'fail'), ('issue-2792', 2792, 'p', 'VACUOUS-PROBE-V3-1 old', 'SELECT 1 AS old2792', 'd1-query@living-paper', 'active', 'fail')").run();
const ev = (kind, text, n = 1, hoursAgo = 1) => { for (let i = 0; i < n; i++) d.prepare("INSERT INTO cloud_ops_events (ts, kind, text, job, status) VALUES (strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?), ?, ?, 'qnfo-research-exec', 'ok')").run("-" + hoursAgo + " hours", kind, text); };
ev("complete", "row=x floor_rounds=2 complete=true", 25);
d.prepare("INSERT INTO burn VALUES ('publication', 57.8), ('issue-remediation', 5)").run();
for (let i = 0; i < 23; i++) d.prepare("INSERT INTO research_queue VALUES (?, 'researching', 1)").run("r" + i);
d.prepare("INSERT INTO research_queue VALUES ('q1', 'queued', 3), ('p1', 'wontfix', 7)").run();
const issue = (id, title, hoursAgo) => d.prepare("INSERT INTO agent_issues (id, title, status, created_at) VALUES (?, ?, 'open', (CAST(strftime('%s', 'now') AS INTEGER) - ? * 3600) * 1000)").run(id, title, hoursAgo);
issue(1, "RESEARCH-TERMINAL 1ac11b67: review: 6 HARD findings unresolved after 7 revise cycles (H1,H2)", 2);
issue(2, "RESEARCH-TERMINAL 3d4f191b: verify: unresolved after revision - mismatch=true gates=gate-length", 30);
d.prepare("INSERT INTO papers VALUES ('own-1', 'published', 0, 'quality:thin score=40', 'qnfo-2025-09-x'), ('own-2', 'published', 0, 'quality:thin score=40', 'ai4metascience'), ('pipe-ok', 'published', 1, 'ok score=85', 'qnf-aaa'), ('gone', 'retracted', 0, 'quality:thin', 'qnf-bbb')").run();
d.prepare("INSERT INTO internal_errata (id, target_kind, target_ref, detected_at, status, owner, evidence) VALUES ('render-scale-invariant-physics-math-1', 'paper', 'scale-invariant-physics', 'x', 'closed', 'errata-hub', '{}')").run();
d.exec(sql);

const cls = (c) => d.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(c);
const c99 = cls("issue-99913"), c27 = cls("issue-2792");
ok(c99.status === "active" && c99.last_verdict === null && /definition of done/.test(c99.action) && c99.verify_transport === "d1-query", "99913 contract replaced", c99);
ok(/^SELECT /.test(c99.verify_probe) && !c99.verify_probe.includes(";") && !/LIKE '[^']{50,}'/.test(c99.verify_probe) && !/agent_issues WHERE id/.test(c99.verify_probe), "99913 probe: one SELECT, no long LIKE, never reads its own issue");
const p99 = () => d.prepare(c99.verify_probe).get().observed;
ok(p99() === "ok", "99913 reads ok on the 2026-10-20 measurements (a HARD-review terminal issue of 2 h ago does not count)", p99());
d.prepare("UPDATE burn SET eta_h = 100 WHERE stream = 'publication'").run();
ok(p99() === "defect", "ETA of 100 h or more is a defect");
d.prepare("UPDATE burn SET eta_h = 57.8 WHERE stream = 'publication'").run();
d.prepare("UPDATE research_queue SET recover_count = 5 WHERE id = 'q1'").run();
ok(p99() === "defect", "a live row at 5 recoveries is a defect");
d.prepare("UPDATE research_queue SET recover_count = 3 WHERE id = 'q1'").run();
d.prepare("DELETE FROM research_queue WHERE id IN ('r20', 'r21', 'r22', 'r19', 'r18', 'r17', 'r16', 'r15', 'r14', 'r13', 'r12')").run();
ok(p99() === "defect", "work waiting with 12 rows in flight is a defect (the old constant was 12)");
d.prepare("DELETE FROM research_queue WHERE status = 'queued'").run();
ok(p99() === "ok", "with nothing waiting a small flight is fine");
d.prepare("INSERT INTO research_queue VALUES ('q2', 'queued', 0)").run();
for (let i = 0; i < 13; i++) d.prepare("INSERT INTO research_queue VALUES (?, 'researching', 0)").run("n" + i);
ok(p99() === "ok", "restored concurrency reads ok");
ev("complete", "row=y floor_rounds=2 floor=gave-up", 5);
ok(p99() === "defect", "the floor giving up on 1 in 6 completes is a defect");
d.prepare("DELETE FROM cloud_ops_events WHERE instr(text, 'gave-up') > 0").run();
issue(3, "RESEARCH-TERMINAL aaaa0000: verify: unresolved after revision - mismatch=true gates=gate-refcount", 3);
ok(p99() === "defect", "a gate-refcount terminal issue under 24 h old is a defect");
d.prepare("UPDATE agent_issues SET created_at = created_at - 90000000 WHERE id = 3").run();
ok(p99() === "ok", "it ages out of the window");

ok(c27.verify_transport === "d1-query@living-paper" && /RELEASE-GATE-DECISION-1/.test(c27.action) && c27.last_verdict === null, "2792 contract replaced, decision named", c27);
const p27 = () => d.prepare(c27.verify_probe).get();
ok(p27().observed === "0" && p27().expected === "0", "2792: zero pipeline papers fail the gate while the thin cohort is owner-authored", p27());
d.prepare("INSERT INTO papers VALUES ('pipe-thin', 'published', 0, 'quality:thin', 'qnf-ccc')").run();
ok(p27().observed === "1", "2792: a pipeline paper failing the gate is counted");
d.prepare("DELETE FROM papers WHERE slug = 'pipe-thin'").run();
ok(/qnf-%/.test(c27.verify_probe) && !/;/.test(c27.verify_probe), "2792 probe is one SELECT");

const goal = d.prepare("SELECT * FROM goals WHERE goal_key = 'OWNER-PAPERS-THIN-GATE-1'").get();
ok(goal && goal.status === "proposed" && goal.program_code === "QNFO.RSCH" && /owner's text/.test(goal.statement) && /NOT LIKE 'qnf-%'/.test(goal.dod), "the owner-paper cohort is a goal", goal);
const errata = d.prepare("SELECT * FROM internal_errata ORDER BY id").all();
ok(errata.length === 3 && errata.filter((e) => e.status === "open").length === 3, "three errata open (two new, one reopened)", errata.map((e) => e.id + ":" + e.status));
ok(errata.filter((e) => e.owner === "qnfo-research-exec").length === 2 && errata.every((e) => e.target_kind === "paper"), "the pipeline pages are owned by qnfo-research-exec");
ok(/REOPENED 2026-10-20/.test(errata.find((e) => e.id === "render-scale-invariant-physics-math-1").evidence), "the reopened erratum says why");
ok(errata.some((e) => e.target_ref === "wheeler-dewitt-zero-mode-a-structural-test-of-the-majorana-analogy-in-minisupers") && errata.some((e) => e.target_ref === "automorphisms-and-scaling-transformations-a-re-entry-analysis-across-algebraic-g"), "slugs match the published slugs");
const rt = d.prepare("SELECT verdict, evidence FROM blocker_redteam ORDER BY id").all();
ok(rt.length === 2 && rt[0].verdict === "workaround-built" && rt[1].verdict === "confirmed-with-evidence" && rt.every((r) => /\| surfaces: /.test(r.evidence)) && /PUBLISH-FLOOR-BLOCKED/.test(rt[1].evidence), "two red-team rows, each with a surfaces line, the refusal text recorded", rt.map((r) => r.verdict));
ok(d.prepare("SELECT COUNT(*) AS n FROM capability_ledger").get().n === 3, "three capabilities recorded");
const snap = () => JSON.stringify([d.prepare("SELECT COUNT(*) n FROM goals").get(), d.prepare("SELECT COUNT(*) n FROM internal_errata").get(), d.prepare("SELECT COUNT(*) n FROM blocker_redteam").get(), d.prepare("SELECT COUNT(*) n FROM capability_ledger").get(), d.prepare("SELECT COUNT(*) n FROM decision_log").get(), d.prepare("SELECT COUNT(*) n FROM bak_20261020_cluster_b_contracts").get()]);
const before = snap();
d.exec(sql);
ok(snap() === before, "a second apply adds no rows", [before, snap()]);
d.exec(rollback);
ok(cls("issue-99913").verify_probe === "SELECT 1 AS old99913" && cls("issue-2792").verify_probe === "SELECT 1 AS old2792" && cls("issue-2792").verify_transport === "d1-query@living-paper", "Rollback restores both contracts", cls("issue-99913"));
ok(d.prepare("SELECT COUNT(*) AS n FROM goals").get().n === 0 && d.prepare("SELECT COUNT(*) AS n FROM internal_errata").get().n === 1 && d.prepare("SELECT status FROM internal_errata").get().status === "closed", "Rollback removes the goal and the new errata and re-closes the reopened one");
console.log("research-cluster-b: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
