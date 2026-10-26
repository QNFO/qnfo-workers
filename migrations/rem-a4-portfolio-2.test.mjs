// REM-A4-PORTFOLIO-2 offline suite: replays the live D1 triggers remediation_probe_semicolon_ins/_upd (a semicolon in a d1-query verify_probe becomes a comma, inside a string literal too) and
// remediation_probe_edit_rerun on node:sqlite, writes the probe of issue-1000194 exactly as migrations/2026-10-26-rem-a4-portfolio.sql wrote it, and runs migrations/2026-10-26-rem-a4-portfolio-2.sql. Proves:
//  * the first file's probe is corrupted by the trigger (the stored text holds '), portfolio risk ') and reads the label as missing on the live summary shape (the defect);
//  * the second file stores a probe without any semicolon that passes on the live data shape (summary '... (program risk 666); portfolio risk 768 ...', notes with counts, a scorecard today) and fails on a summary
//    with neither label (run 32), on notes without counts and on scorecards older than a day;
//  * the contract is re-armed (verdict NULL, attempts 0, due now), a probe another session repaired is left alone, a second apply changes nothing, the Rollback line restores the saved probe;
//  * no probe or detector literal of the three REM-A4 portfolio files holds a semicolon (the lesson: the trigger rewrites it).
// Run: node --no-warnings migrations/rem-a4-portfolio-2.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const sql = readFileSync(here("2026-10-26-rem-a4-portfolio-2.sql"), "utf8");
const first = readFileSync(here("2026-10-26-rem-a4-portfolio.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const one = (db, s, ...a) => db.prepare(s).get(...a);
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];

ok(/^-- APPLY-BY: ci\s*$/m.test(sql) && /^-- DB: qnfo-audit\s*$/m.test(sql) && sql.split("\n").filter((l) => l.startsWith("-- Rollback:")).length === 1, "header opts in, one single-line Rollback");
ok(!/^\s*(DELETE\s+FROM|DROP\s)/im.test(sql.replace(/^--.*$/gm, "")) && !/claude\.ai|anthropic\.com/i.test(sql), "no DELETE or DROP, no claude.ai link");

// the probe as the first file wrote it
const st = first.split(/;\s*\n/).map((s) => s.trim()).find((s) => /^UPDATE remediation_contracts SET status = 'active'/.test(s.replace(/^(--.*\n)+/, "")) && s.includes("WHERE class = 'issue-1000194'"));
ok(!!st, "the first file's statement for issue-1000194 is found");
const m = /verify_probe = '([\s\S]*?)', action = '/.exec(st || "");
const written = m ? m[1].replace(/''/g, "'") : "";
ok(written.includes("'); portfolio risk '"), "the first file wrote the label with a semicolon");

const LIVE_TRIGGERS = [
  `CREATE TRIGGER remediation_probe_semicolon_ins AFTER INSERT ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END`,
  `CREATE TRIGGER remediation_probe_semicolon_upd AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END`,
  `CREATE TRIGGER remediation_probe_edit_rerun AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_probe IS NOT OLD.verify_probe OR NEW.verify_transport IS NOT OLD.verify_transport
BEGIN
  UPDATE remediation_contracts SET next_due_at = datetime('now') WHERE class = NEW.class;
END`,
];
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
function world(o = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT 'p', action TEXT NOT NULL DEFAULT 'a', verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL DEFAULT 'd1-query', escalate_to TEXT NOT NULL DEFAULT 'x', status TEXT, last_verdict TEXT, attempts INTEGER DEFAULT 0, module TEXT, next_due_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
CREATE TABLE portfolio_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_date TEXT, kind TEXT, session TEXT, summary TEXT);
CREATE TABLE program_review_notes (day TEXT, program_code TEXT, roadmap_now INTEGER, goals_adopted INTEGER);
CREATE TABLE program_scorecards (day TEXT, program_code TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
`);
  for (const t of LIVE_TRIGGERS) db.exec(t);
  db.prepare("INSERT INTO portfolio_runs (run_date, kind, summary) VALUES (?, 'weekly-strategic', ?)").run(day(0), o.summary ?? "weekly-strategic 2026-10-26: programs 5; RED 4; constraint QNFO.OPS (program risk 666); portfolio risk 768; cost 423.98 (ceiling 200)");
  db.prepare("INSERT INTO portfolio_runs (run_date, kind, summary) VALUES (?, 'weekly-strategic', 'weekly-strategic: constraint QNFO.OPS risk 801; cost 426.89')").run(day(1));
  db.prepare("INSERT INTO program_review_notes VALUES (?, 'QNFO.OPS', ?, 2)").run(day(0), o.now === undefined ? 3 : o.now);
  db.prepare("INSERT INTO program_scorecards VALUES (?, 'QNFO.OPS')").run(o.sc ?? day(0));
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, status, last_verdict, attempts, module) VALUES ('issue-1000194', 1000194, ?, 'active', 'fail', 1, 'rem-a4-portfolio')").run(written);
  return db;
}
const val = (db) => { const r = db.prepare(one(db, "SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-1000194'").verify_probe).get(); return [r.expected, r.observed]; };

// the defect: the stored probe is corrupted and fails on the live shape
const a = world();
const stored0 = one(a, "SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-1000194'").verify_probe;
ok(stored0.includes("'), portfolio risk '") && !stored0.includes(";"), "the live trigger rewrites the semicolon in the string literal (the stored probe holds a comma)");
ok(/does not label/.test(val(a)[1]), "the corrupted probe reads the label as missing on the live summary (the defect)", val(a));

// the fix
const backup0 = one(a, "SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-1000194'").verify_probe;
a.exec(sql);
const c = one(a, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000194'");
ok(!c.verify_probe.includes(";") && c.verify_probe.includes("' portfolio risk '"), "the stored probe holds no semicolon and keeps the two label tests");
ok(val(a)[0] === "ok" && val(a)[1] === "ok", "the probe passes on the live data shape", val(a));
ok(/does not label/.test(val(world({ summary: "weekly-strategic: constraint QNFO.OPS risk 801; cost 1" }))[1]), "it fails on a summary with neither label (run 32)");
const half = world({ summary: "weekly-strategic: constraint QNFO.OPS (program risk 666); cost 1" }); half.exec(sql);
ok(/does not label/.test(val(half)[1]), "it fails on a summary that has only one of the two labels");
for (const [label, o, re] of [["notes without counts", { now: null }, /no roadmap or goal counts/], ["scorecards older than a day", { sc: day(3) }, /more than a day old/]]) {
  const w = world(o); w.exec(sql);
  ok(re.test(val(w)[1]), "it fails on " + label, val(w));
}
ok(c.last_verdict === null && c.attempts === 0 && c.next_due_at !== null && c.status === "active", "the contract is re-armed (verdict NULL, attempts 0, due now)", c);

// idempotent, repaired probe untouched, rollback
const snap = (db) => JSON.stringify([db.prepare("SELECT * FROM remediation_contracts").all(), db.prepare("SELECT COUNT(*) AS n FROM decision_log").all(), db.prepare("SELECT id, title FROM agent_issues").all()]);
const s0 = snap(a); a.exec(sql);
ok(snap(a) === s0, "a second apply changes nothing");
const b = world(); b.prepare("UPDATE remediation_contracts SET verify_probe = 'SELECT ''ok'' AS expected, ''ok'' AS observed', attempts = 7 WHERE class = 'issue-1000194'").run(); b.exec(sql);
ok(one(b, "SELECT attempts AS n FROM remediation_contracts WHERE class = 'issue-1000194'").n === 7 && one(b, "SELECT verify_probe AS p FROM remediation_contracts WHERE class = 'issue-1000194'").p.startsWith("SELECT 'ok' AS expected, 'ok'"), "a probe that is not the corrupted one is left alone");
ok(one(a, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'REM-A4-PORTFOLIO-2:') = 1").n === 1, "the decision is logged once");
const lint = one(a, "SELECT * FROM agent_issues WHERE instr(title, 'PROBE-SEMICOLON-LINT-1:') = 1");
ok(lint && lint.status === "open" && lint.priority === "medium" && /session-task: repo=qnfo-workers path=scripts\/apply_migrations\.py/.test(lint.description) && !/^code-task:/m.test(lint.description) && /code-probe: \{"paths": \["scripts\/apply_migrations\.py"\], "contains": "PROBE-SEMICOLON-LINT-1"\}/.test(lint.description) && one(a, "SELECT COUNT(*) AS n FROM agent_issues WHERE instr(title, 'PROBE-SEMICOLON-LINT-1:') = 1").n === 1, "the lint gap is filed once for a session (not a code-task: the code loop may not change apply_migrations) with a code-probe");

for (const s of rollback.split("; ")) a.exec(s);
const rb = one(a, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000194'");
ok(rb.verify_probe === backup0 && rb.last_verdict === "fail" && rb.attempts === 1, "Rollback restores the saved probe, verdict and attempts");

// the lesson, as a static check over the probes the three portfolio files write: no semicolon inside a verify_probe or detector probe literal
const probesOf = (text) => [...text.matchAll(/(?:verify_probe = |'failure-mode detector', )'((?:[^']|'')*)'/g)].map((x) => x[1]);
const all = [...probesOf(first), ...probesOf(readFileSync(here("2026-10-26-rem-a4-bp26-map.sql"), "utf8")), ...probesOf(sql)];
ok(all.length >= 6, "the static check finds the probe literals of the portfolio files", all.length);
ok(all.filter((p) => p.includes(";")).length === 1 && all.find((p) => p.includes(";")).includes("'); portfolio risk '".replace(/'/g, "''")), "exactly one probe literal holds a semicolon: the corrupted one in the already merged first file; the new file's probe and every other have none");
ok(!probesOf(sql).some((p) => p.includes(";")), "the second file's probe holds no semicolon");
const bp = existsSync(here("2026-10-26-rem-a4-bp26-map.sql"));
ok(bp, "the BP26 file is present");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
