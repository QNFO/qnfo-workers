// QNFO-AI-SPEND-REFUSAL-TWIN-1 offline suite: migrations/2026-10-26-qnfo-ai-spend-refusal-twin.sql files two open issues for the code loop (the stream path and the oversize-ensemble context fallback of
// qnfo-ai), each with a code-task, a code-anchor that occurs exactly once in qnfo-ai/worker.js and a code-probe that does not pass while the defect exists, and records one decision row, idempotently.
// Replayed in node:sqlite. Run: node --no-warnings migrations/qnfo-ai-spend-refusal-twin.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { versionAtLeast } from "../scripts/version-at-least.mjs";
const sql = readFileSync(new URL("./2026-10-26-qnfo-ai-spend-refusal-twin.sql", import.meta.url), "utf8");
const worker = readFileSync(new URL("../qnfo-ai/worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
const count = (src, needle) => { let n = 0, i = -1; while ((i = src.indexOf(needle, i + 1)) >= 0) n++; return n; };
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+$/m.test(sql), "the file carries the three migration headers");
ok(!/\b(DELETE|DROP)\b/i.test(sql.replace(/^--.*$/gm, "").replace(/'(?:[^']|'')*'/g, "''")), "the body runs no DELETE or DROP outside quoted text");
db.exec(sql); db.exec(sql);
const issues = db.prepare("SELECT * FROM agent_issues ORDER BY id").all();
ok(issues.length === 2 && issues.every((i) => i.status === "open" && i.source === "session"), "applied twice: two open session issues", issues.map((i) => i.title));
ok(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "applied twice: one decision row");
const byTitle = (p) => issues.find((i) => i.title.startsWith(p));
const cases = [
  { prefix: "QNFO-AI-STREAM-SPEND-TWIN-1:", marker: "QNFO-AI-STREAM-SPEND-TWIN-1", priority: "medium" },
  { prefix: "QNFO-AI-ENSEMBLE-CTX-SPEND-TWIN-1:", marker: "QNFO-AI-ENSEMBLE-CTX-SPEND-TWIN-1", priority: "low" },
];
for (const c of cases) {
  const i = byTitle(c.prefix);
  ok(!!i && i.priority === c.priority, c.marker + ": the issue exists with its priority", i && i.priority);
  if (!i) continue;
  const d = i.description;
  ok(/^code-task: repo=qnfo-workers path=qnfo-ai\/worker\.js$/m.test(d), c.marker + ": the code-task line is on a line of its own");
  const anchor = (/^code-anchor: (.+)$/m.exec(d) || [])[1];
  const probe = (() => { try { return JSON.parse((/^code-probe: (\{.*\})$/m.exec(d) || [])[1]); } catch (e) { return null; } })();
  ok(!!anchor && !!probe && probe.paths[0] === "qnfo-ai/worker.js" && probe.contains === c.marker, c.marker + ": the code-probe names the marker in qnfo-ai/worker.js", probe);
  // while the defect exists the anchor occurs once and the marker is absent; once the doer has fixed it the marker is present (the suite stays green)
  ok((count(worker, anchor) === 1 && !worker.includes(c.marker)) || worker.includes(c.marker), c.marker + ": the anchor occurs exactly once in qnfo-ai/worker.js and the closing probe does not already pass (or the fix is in)", { anchors: count(worker, anchor), marker: worker.includes(c.marker) });
  ok(/Doer: qnfo-code-orchestrator/.test(d) && /Definition of done:/.test(d) && /Charter pillar: cost\./.test(d), c.marker + ": the issue names its doer, its definition of done and its charter pillar");
}
const stream = byTitle("QNFO-AI-STREAM-SPEND-TWIN-1:");
ok(stream && stream.description.includes("callDeepSeek(env, effSpec.api, messages, max_tokens, true,") && /DEEPSEEK-TWIN-1/.test(stream.description), "the stream issue's anchor is the stream call of the api branch");
// the facts the issues state about the code are true on this checkout, or the code they were written beside has been superseded: qnfo-ai 5.41.0 (#5572) routes paid
// inference through AI Gateway dynamic routes and removed the direct-DeepSeek non-stream catch (the "^deepseek 402|^spend-governor" pattern and `served_by: effSpec.waTwin`).
// Both issues were done in 5.40.3 (their markers stay in the worker), so the premise is pinned only while that catch exists; a worker that has neither the catch nor the
// dynamic routes still fails here. Suites assert a minimum VERSION, never a pin (VERSION-PIN-TESTS-1).
const qnfoAiVersion = (/^var VERSION = "([^"]+)"/m.exec(worker) || [])[1];
const catchExists = worker.includes("DEEPSEEK-TWIN-1") && /\/\^deepseek 402\|\^spend-governor\//.test(worker) && worker.includes("served_by: effSpec.waTwin");
const dynamicRoutes = versionAtLeast(qnfoAiVersion, "5.41.0") && worker.includes("DYNAMIC_ROUTES") && worker.includes("isDynamicRoute(");
ok(catchExists || dynamicRoutes, "the non-stream twin catch the issues point at exists in qnfo-ai/worker.js (pattern and served_by), or the dynamic routes (5.41.0) superseded it", { qnfoAiVersion, catchExists, dynamicRoutes });
ok(/model: routedModel, choices: \[\{ index: 0, delta: \{ role: "assistant", content: _ft \}/.test(worker) || worker.includes("QNFO-AI-STREAM-SPEND-TWIN-1"), "the stream fallback chunk names routedModel (until the stream issue is done)");
ok(worker.includes('"ensemble-context-fallback"') && worker.includes("callDeepSeek(env, MODELS[\"deepseek-v4-flash\"].api, messages, fbCap, false)") || worker.includes("QNFO-AI-ENSEMBLE-CTX-SPEND-TWIN-1"), "the ensemble context fallback calls callDeepSeek unguarded (until the ensemble issue is done)");
const dl = db.prepare("SELECT * FROM decision_log").get();
ok(dl.actor.startsWith("session_") && dl.rollback_path && dl.capability_gain && dl.predicted_outcome && dl.reach_gain && dl.surfaces_tested, "the decision row is complete", dl);
ok(dl.predicted_outcome.indexOf(" within ") === -1, "the decision row's predicted outcome holds no ' within ' (the live prediction parser would read it)");
for (const w of ["(a)", "(b)", "(c)", "(d)", "(e)"]) ok(dl.action.includes(w), "the decision row records the not-scheduled finding " + w);
// a pre-existing open issue with the same title is not filed again
const again = new DatabaseSync(":memory:");
again.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
again.prepare("INSERT INTO agent_issues (title, description, source, status) VALUES ('QNFO-AI-STREAM-SPEND-TWIN-1: already open', 'x', 'loop', 'open')").run();
again.exec(sql);
ok(again.prepare("SELECT COUNT(*) AS n FROM agent_issues WHERE title LIKE 'QNFO-AI-STREAM-SPEND-TWIN-1:%'").get().n === 1 && again.prepare("SELECT COUNT(*) AS n FROM agent_issues").get().n === 2, "an open issue with the same title prefix is not filed twice");
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
