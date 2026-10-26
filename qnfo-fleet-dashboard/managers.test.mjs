// MANAGEMENT-PERSONAS-1 offline suite: /api/managers and /managers read the hourly persona tables and show every program's
// decision, focus and doer gaps; an empty ledger is a page that says the tick has not run, never an error.
// Run: node qnfo-fleet-dashboard/managers.test.mjs
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const mkEnv = (db) => ({ AUDIT: { prepare(sql) { let params = []; const st = { bind(...v) { params = v; return st; }, async all() { return { results: db.prepare(sql).all(...params) }; }, async first() { return db.prepare(sql).get(...params) || null; }, async run() { return { meta: {} }; } }; return st; } } });
const call = (env, p) => worker.fetch(new Request("https://fleet.qnfo.org" + p), env, { waitUntil() {} });
const schema = `CREATE TABLE portfolio_allocations (tick TEXT NOT NULL, program_code TEXT NOT NULL, manager_persona TEXT, verdict TEXT, risk_score REAL, risk_24h REAL, open_issues INTEGER, slots INTEGER NOT NULL, decision TEXT NOT NULL, reason TEXT, computed_at TEXT, PRIMARY KEY (tick, program_code));
CREATE TABLE program_focus (program_code TEXT NOT NULL, issue_id INTEGER NOT NULL, rank INTEGER, tier INTEGER, reason TEXT, has_doer INTEGER, entered_at TEXT, last_tick TEXT, PRIMARY KEY (program_code, issue_id));
CREATE TABLE program_focus_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), program_code TEXT NOT NULL, issue_id INTEGER NOT NULL, action TEXT NOT NULL, reason TEXT);
CREATE TABLE persona_briefs (tick TEXT NOT NULL, persona_key TEXT NOT NULL, level TEXT NOT NULL, scope TEXT NOT NULL, verdict TEXT, decision TEXT, summary TEXT NOT NULL, computed_at TEXT, PRIMARY KEY (tick, persona_key));
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, priority TEXT, status TEXT);
CREATE TABLE persona_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), persona_key TEXT NOT NULL, kind TEXT NOT NULL, issue_id INTEGER, from_value TEXT, to_value TEXT, evidence TEXT NOT NULL, reverted_at TEXT);`;

{
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  const empty = await (await call(mkEnv(db), "/api/managers")).json();
  ok(empty.ok && empty.tick === null && empty.programs.length === 0, "an empty ledger reads as no tick yet", empty);
  const h = await (await call(mkEnv(db), "/managers")).text();
  ok(/has not run yet/.test(h), "the page says the tick has not run");
}
{
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  const T = "2026-10-26T05:00Z";
  db.exec(`INSERT INTO portfolio_allocations VALUES ('${T}', 'QNFO.OPS', 'program-manager:QNFO.OPS', 'RED', 647.7, NULL, 389, 13, 'constrain', 'highest risk', NULL), ('${T}', 'QNFO.RSCH', 'program-manager:QNFO.RSCH', 'RED', 40.5, 30.1, 25, 4, 'escalate', 'risk rose', NULL);
    INSERT INTO agent_issues VALUES (7, 'METRIC-TRIGGER-1-ISSUES-WITHOUT-NEXT-ACTION <b>gap</b>', 'critical', 'open'), (9, 'rsch high', 'high', 'open');
    INSERT INTO program_focus VALUES ('QNFO.OPS', 7, 1, 0, 'primary metric issues_without_next_action', 1, '${T}', '${T}'), ('QNFO.RSCH', 9, 1, 3, 'high', 0, '${T}', '${T}');
    INSERT INTO program_focus_log (program_code, issue_id, action, reason) VALUES ('QNFO.RSCH', 9, 'enter', 'rank 1: high');
    INSERT INTO persona_actions (persona_key, kind, issue_id, from_value, to_value, evidence) VALUES ('program-manager:QNFO.OPS', 'close', 12, 'open', 'closed', 'metric recovered: x reads 0'), ('program-manager:QNFO.RSCH', 'promote', 9, 'medium', 'high', 'in program focus at rank 1'), ('portfolio-manager', 'demote', 15, 'critical', 'high', 'fleet-filed critical <i>stale</i>');
    INSERT INTO persona_briefs VALUES ('${T}', 'portfolio-manager', 'portfolio', 'QNFO', 'RED', 'allocate', 'Constraint: QNFO.OPS (risk 647.7)', NULL), ('${T}', 'program-manager:QNFO.RSCH', 'program', 'QNFO.RSCH', 'RED', 'escalate', 'QNFO.RSCH is RED', NULL);`);
  const r = await call(mkEnv(db), "/api/managers");
  const j = await r.json();
  ok(r.status === 200 && j.schema_version === "fleet-managers/v1" && j.tick === T, "the feed names the tick", j);
  ok(j.portfolio && /Constraint: QNFO\.OPS/.test(j.portfolio.summary), "the portfolio brief is in the feed");
  ok(j.programs[0].program_code === "QNFO.OPS" && j.programs[0].focus[0].issue_id === 7 && j.programs[0].focus[0].has_doer === true, "programs ordered by risk with their focus");
  ok(j.programs[1].decision === "escalate" && j.programs[1].focus[0].has_doer === false && j.programs[1].brief === "QNFO.RSCH is RED", "each program carries decision, doer flag and brief", j.programs[1]);
  ok(j.focus_moves_24h.length === 1 && j.unavailable.length === 0, "moves are listed and nothing is unavailable", j);
  const h = await (await call(mkEnv(db), "/managers")).text();
  ok(h.includes("Portfolio and program managers") && h.includes("QNFO.RSCH") && h.includes("no doer yet") && h.includes("escalate"), "the page shows decisions and doer gaps");
  ok(!h.includes("<b>gap</b>") && h.includes("&lt;b&gt;gap"), "issue titles are escaped");
  ok(j.decisions_24h.length === 3 && j.decision_counts_24h.close === 1 && j.decision_counts_24h.demote === 1, "the managers' own decisions are in the feed", j.decisions_24h);
  ok(h.includes("Decisions the managers took") && h.includes("closed, metric recovered") && h.includes("critical lowered to high") && h.includes("(medium to high)"), "the page lists the decisions");
  ok(!h.includes("<i>stale</i>"), "decision evidence is escaped");
  ok(!/undefined|NaN|\[object/.test(h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "")), "the page leaks nothing");
}
{
  const broken = { AUDIT: { prepare() { const st = { bind() { return st; }, async all() { throw new Error("no such table"); } }; return st; } } };
  const j = await (await call(broken, "/api/managers")).json();
  ok(j.unavailable.includes("portfolio_allocations") && j.tick === null, "an unreadable table is named, not shown as empty", j);
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
