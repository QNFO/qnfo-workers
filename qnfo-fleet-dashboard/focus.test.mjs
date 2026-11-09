// RECALL-LOOP-1 (qnfo-fleet-dashboard 1.103.0) offline suite: fleet.qnfo.org/focus asks the owner one research question at a time and shows the focus
// his answers set. Runs migrations/2026-11-09-recall-loop.sql on SQLite, then drives the worker's fetch.
// Proves: GET /focus shows the next question with its cue and every option, plus the focus table; a visitor who is not signed in sees the question
// and where to answer it, but no buttons; a signed-in tap (form post, no script) records the answer, redirects back and the page then shows the
// line's new stance and what it holds; a button that is not one of the options is refused; GET /api/focus is open JSON.
// Run: node qnfo-fleet-dashboard/focus.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "" });
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT, score REAL, decision TEXT, status TEXT DEFAULT 'queued', claimed_at TEXT, completed_at TEXT, paper_slug TEXT, created_at TEXT, stage TEXT, agent_task_id TEXT, attempt INTEGER DEFAULT 0, revise_count INTEGER DEFAULT 0, context TEXT, published_at TEXT, doi TEXT, paper_url TEXT, error TEXT, recover_count INTEGER DEFAULT 0, terminal_rearms INTEGER DEFAULT 0, publish_due_at TEXT, UNIQUE(source, source_id));
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT, type TEXT, definition TEXT, timeout_ms INTEGER, retries INTEGER, version INTEGER, enabled INTEGER, updated_at TEXT);
CREATE TABLE fleet_crons (name TEXT PRIMARY KEY, cron_expr TEXT, task_id TEXT, enabled INTEGER, timezone TEXT, updated_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, surfaces_tested TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);`);
db.prepare("INSERT INTO research_queue (id, source, source_id, idea, status, score) VALUES ('q1','proposal','1','Autonomous agents that audit their own logs. Study','queued',0.3)").run();
db.prepare("INSERT INTO research_queue (id, source, source_id, idea, status, score) VALUES ('q2','proposal','2','Quantum binning and Planck. Note','deferred',0.6)").run();
db.exec(readFileSync(join(here, "../migrations/2026-11-09-recall-loop.sql"), "utf8"));
const wrap = (d) => ({ prepare(sql) { const mk = (args) => ({ bind: (...a) => mk(a), run: async () => { const r = d.prepare(sql).run(...args); return { meta: { changes: r.changes } }; }, first: async () => d.prepare(sql).get(...args) || null, all: async () => ({ results: d.prepare(sql).all(...args) }) }); return mk([]); }, batch: async (st) => Promise.all(st.map((x) => x.all())) });
const LOOP = "loop-secret-focus-test";
const env = { AUDIT: wrap(db), LOOP_TOKEN: LOOP };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const get = (p, h) => worker.fetch(new Request("https://fleet.qnfo.org" + p, { headers: h || {} }), env, ctx);

let r = await get("/focus");
let html = await r.text();
ok(r.status === 200 && /Research focus/.test(html), "GET /focus answers", r.status);
const first = db.prepare("SELECT * FROM owner_asks WHERE answered_at IS NULL ORDER BY priority, id LIMIT 1").get();
ok(html.includes(first.question.replace(/&/g, "&amp;").slice(0, 40)), "the next question is on the page", first.question);
ok(!/<form method="post" action="\/focus"/.test(html) && /me\.q08\.org/.test(html), "not signed in: no buttons, says where to answer");
ok(/Where attention goes now/.test(html) && /not asked yet/i.test(html), "the focus table is shown before any answer");
ok(!/<script/i.test(html), "no script on the page (the owner CSP forbids it)");

r = await get("/focus", { "x-loop-token": LOOP });
html = await r.text();
ok(/<form method="post" action="\/focus"/.test(html) && /name="key" value="unsure"/.test(html), "signed in: one button per option, Not sure included");

// Answer the AI systems line with "Yes, do more of it".
const ai = db.prepare("SELECT id FROM owner_asks WHERE kind = 'research-line' AND ref LIKE 'ai-systems@%'").get();
const post = (body, h) => worker.fetch(new Request("https://fleet.qnfo.org/focus", { method: "POST", headers: Object.assign({ "Content-Type": "application/x-www-form-urlencoded" }, h || {}), body }), env, ctx);
r = await post("id=" + ai.id + "&key=push");
ok(r.status === 401, "a post without sign-in is refused", r.status);
ok(!db.prepare("SELECT answered_at FROM owner_asks WHERE id = ?").get(ai.id).answered_at, "and records nothing");
r = await post("id=" + ai.id + "&key=push", { "x-loop-token": LOOP });
ok(r.status === 303 && /\/focus\?done=Saved/.test(r.headers.get("Location") || ""), "a tap saves and redirects back", r.headers.get("Location"));
const row = db.prepare("SELECT answer, answer_label, answered_via FROM owner_asks WHERE id = ?").get(ai.id);
ok(row.answer === "push" && row.answered_via === "fleet.qnfo.org/focus", "the answer is recorded with where it came from", row);
ok(db.prepare("SELECT score FROM research_queue WHERE id = 'q1'").get().score >= 0.95, "the answer changes the research queue at once");
r = await post("id=" + ai.id + "&key=bogus", { "x-loop-token": LOOP });
ok(/Pick%20one%20of%20the%20buttons/.test(r.headers.get("Location") || ""), "a value that is not an option is refused", r.headers.get("Location"));

r = await get("/focus?done=Saved%3A%20Yes", { "x-loop-token": LOOP });
html = await r.text();
ok(/Saved: Yes/.test(html) && /class="ds-badge ds-badge-good">Do more<\/span>/.test(html) && /DESIGN-SYSTEM-1 v/.test(html), "the page confirms and shows the new stance");
ok(/Your last answers/.test(html), "recent answers are listed");

r = await get("/api/focus");
const j = await r.json();
ok(j.ok && j.schema_version === "owner-focus/v1" && j.lines.find((l) => l.line === "ai-systems").stance === "push" && j.answered_14d === 1, "GET /api/focus is open JSON with the stance", j);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
