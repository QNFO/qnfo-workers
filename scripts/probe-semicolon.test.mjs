// PROBE-SEMICOLON-NORMALIZE-1 offline suite (migrations/2026-10-06-probe-semicolon-normalize.sql, pillar autonomy).
// Replays the migration on the production schema of qnfo-audit.remediation_contracts and proves: a d1-query probe written
// with ';' inside its text (inserted, updated, or rewritten by another trigger such as contract_probe_templates_v1) is
// stored without one and passes the remediation tick's literal check; a trailing ';' is dropped; the normalised probe still
// runs and returns its expected/observed pair; an external-https probe and a status-only update of an old row are left
// alone; the migration applies twice without error.
// Run: node scripts/probe-semicolon.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
const MIG = readFileSync(new URL("../migrations/2026-10-06-probe-semicolon-normalize.sql", import.meta.url), "utf8");

// qnfo-fleet-control remediationContractsTick's literal check (worker.js, __RT_WRITE_KW), copied so the suite judges
// exactly what the tick judges.
const KW = ["insert ", "update ", "delete ", "drop ", "alter ", "create ", "attach ", "detach ", "pragma ", "replace ", "vacuum", "reindex"];
const literal = (q) => { q = String(q || "").trim(); const ql = " " + q.toLowerCase().replace(/\s+/g, " ") + " "; return /^(select|with) /.test(q.toLowerCase()) && q.indexOf(";") === -1 && !KW.some((k) => ql.indexOf(" " + k) !== -1); };

const db = new DatabaseSync(":memory:");
// production DDL, read from sqlite_master on 2026-10-06
db.exec("CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0)");
db.exec("CREATE TABLE fleet_budget (node_class TEXT PRIMARY KEY, current REAL, cap REAL)");
db.exec("INSERT INTO fleet_budget VALUES ('ai_spend:workers-ai', 12.5, 10)");
// rows that exist before the migration: an active probe with ';' (repaired by the migration) and a closed one (left alone)
const ins = db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status) VALUES (?, ?, 'p', 'a', ?, ?, 'x', ?)");
const P1815 = "SELECT 'ok' AS expected, CASE WHEN (SELECT current FROM fleet_budget WHERE node_class = 'ai_spend:workers-ai') > (SELECT cap FROM fleet_budget WHERE node_class = 'ai_spend:workers-ai') THEN 'pending: gated on the cap (no new Workers AI call, core rule 8); the fill job waits' ELSE 'gate open' END AS observed";
ins.run("issue-1815", 1815, P1815, "d1-query", "active");
ins.run("old-closed", 1, "SELECT 'a' AS expected, 'b; c' AS observed", "d1-query", "closed");
const get = (c) => db.prepare("SELECT verify_probe AS p, verify_transport AS t, status AS s FROM remediation_contracts WHERE class = ?").get(c);

db.exec(MIG);
ok(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'remediation_probe_semicolon_%'").get().n === 2, "both triggers exist");
let r = get("issue-1815");
ok(r.p.indexOf(";") === -1 && literal(r.p), "the migration repairs the active probe that had ';' in its text", r.p);
const out = db.prepare(r.p).get();
ok(out.expected === "ok" && /^pending: gated on the cap \(no new Workers AI call, core rule 8\), the fill job waits$/.test(out.observed), "the repaired probe runs and keeps its meaning", out);
ok(get("old-closed").p === "SELECT 'a' AS expected, 'b; c' AS observed", "a closed contract is left as it was");

// a new contract written with ';' inside its text
ins.run("issue-2060", 2060, "SELECT 'ok' AS expected, 'pending: 0 contracts passed (needs 6; PR 726 merge)' AS observed", "d1-query", "active");
r = get("issue-2060");
ok(r.p === "SELECT 'ok' AS expected, 'pending: 0 contracts passed (needs 6, PR 726 merge)' AS observed" && literal(r.p), "an insert is normalised", r.p);
// a trailing terminator
ins.run("issue-9", 9, "SELECT 'ok' AS expected, 'ok' AS observed;  ", "d1-query@personal-life", "active");
r = get("issue-9");
ok(r.p === "SELECT 'ok' AS expected, 'ok' AS observed" && literal(r.p), "a trailing ';' is dropped (plane transports too)", r.p);
// an update that brings a ';' back
db.prepare("UPDATE remediation_contracts SET verify_probe = ? WHERE class = 'issue-9'").run("SELECT 'ok' AS expected, 'a; b; c' AS observed");
ok(get("issue-9").p === "SELECT 'ok' AS expected, 'a, b, c' AS observed", "an update is normalised", get("issue-9").p);
// an external-https probe is JSON, not SQL
const J = '{"url":"https://example.org/health","expect":"a; b"}';
ins.run("ext-1", 10, J, "external-https", "active");
ok(get("ext-1").p === J, "an external-https probe is left alone", get("ext-1").p);
// a status-only update on an old row does not touch its probe
db.prepare("UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'x' WHERE class = 'old-closed'").run();
ok(get("old-closed").p === "SELECT 'a' AS expected, 'b; c' AS observed" && get("old-closed").s === "superseded", "a status-only update leaves an old probe as it is");
// another AFTER INSERT trigger that rewrites the probe (the shape of contract_probe_templates_v1) ends normalised, and the
// filing INSERT itself succeeds
db.exec("CREATE TRIGGER tmpl AFTER INSERT ON remediation_contracts WHEN NEW.status = 'needs-machine-probe' BEGIN UPDATE remediation_contracts SET status = 'active', verify_transport = 'd1-query', verify_probe = 'SELECT ''ok'' AS expected, ''pending: template; waits'' AS observed' WHERE class = NEW.class; END");
let threw = null;
try { ins.run("issue-77", 77, "needs-machine-probe", "needs-machine-probe", "needs-machine-probe"); } catch (e) { threw = String(e.message); }
r = get("issue-77");
ok(threw === null && r.s === "active" && r.p === "SELECT 'ok' AS expected, 'pending: template, waits' AS observed" && literal(r.p), "a probe written by another trigger at filing time is normalised and the filing succeeds", { threw, r });
// idempotent
let again = null;
try { db.exec(MIG); } catch (e) { again = String(e.message); }
ok(again === null, "the migration applies twice", again);
ok(db.prepare("SELECT count(*) AS n FROM remediation_contracts WHERE verify_transport LIKE 'd1-query%' AND status IN ('active', 'holding') AND instr(verify_probe, ';') > 0").get().n === 0, "no active d1-query probe holds ';' afterwards");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
