// RECALL-LOOP-1 offline suite: runs migrations/2026-11-09-recall-loop.sql on SQLite with the live research_queue shape (qnfo-audit sqlite_master,
// 2026-11-09), then answers the questions it asks the way the companion and fleet.qnfo.org/focus do (UPDATE owner_asks SET answer ...).
// Proves: one question per research line with 3 choices plus Not sure and a cue built from the queue; a pause moves that line's queued and deferred
// ground ideas to owner_paused (never remediation, an owner intent or a started draft) and the backpressure release (status 'deferred' only) cannot
// pick them up; new ideas of a paused line are paused on insert; a pushed line wins over a paused one and is lifted to score 0.95; "Keep it as is"
// releases what the pause held; the weekly "which line matters most" pick pushes that line; the daily fleet task asks again only after 14 days.
// Run: node migrations/recall-loop.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-11-09-recall-loop.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE research_queue (
    id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT,
    score REAL, decision TEXT, status TEXT DEFAULT 'queued',
    claimed_at TEXT, completed_at TEXT, paper_slug TEXT, created_at TEXT, stage TEXT, agent_task_id TEXT, attempt INTEGER DEFAULT 0, revise_count INTEGER DEFAULT 0, context TEXT, published_at TEXT, doi TEXT, paper_url TEXT, error TEXT, recover_count INTEGER DEFAULT 0, terminal_rearms INTEGER DEFAULT 0, publish_due_at TEXT,
    UNIQUE(source, source_id));
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT, type TEXT, definition TEXT, timeout_ms INTEGER, retries INTEGER, version INTEGER, enabled INTEGER, updated_at TEXT);
CREATE TABLE fleet_crons (name TEXT PRIMARY KEY, cron_expr TEXT, task_id TEXT, enabled INTEGER, timezone TEXT, updated_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, surfaces_tested TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);`);
const add = (id, source, idea, status, extra) => db.prepare("INSERT INTO research_queue (id, source, source_id, idea, status, score, stage, published_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
  .run(id, source, id, idea, status, (extra && extra.score) ?? 0.4, (extra && extra.stage) ?? null, (extra && extra.published_at) ?? null, "2026-11-01T00:00:00Z");
const recent = new Date(Date.now() - 3 * 864e5).toISOString();
add("q1", "proposal", "Can a physical binning mechanism derive Planck's law without circularity?. The note ...", "queued");
add("q2", "proposal", "Discreteness as Emergent Measurement Effect on Continuous Substrate. Wigner-function dynamics", "deferred");
add("q3", "remediation", "Revise the quantum decoherence paper", "queued");
add("q4", "intent", "Owner request: quantum entanglement follow-up", "queued");
add("q5", "proposal", "Quantum measurement half drafted", "queued", { stage: "revise" });
add("a1", "proposal", "Audit trails for autonomous AI agents in production. A governance study", "deferred", { score: 0.3 });
add("a2", "proposal", "Quantum-inspired alignment checks for LLM agents", "queued", { score: 0.2 });
add("p1", "proposal", "Wavefunction collapse as bookkeeping. Published already", "published", { published_at: recent });
add("p2", "proposal", "Agentic loops that audit themselves. A field study", "published", { published_at: recent });

db.exec(sql);
const asks = db.prepare("SELECT * FROM owner_asks WHERE kind = 'research-line' ORDER BY id").all();
const lines = db.prepare("SELECT COUNT(*) n FROM research_lines").get().n;
ok(lines === 9 && asks.length === lines, "one question per research line", { lines, asks: asks.length });
const qa = asks.find((a) => a.ref.startsWith("quantum-foundations@"));
const opts = JSON.parse(qa.options_json);
ok(opts.length === 4 && opts[3].key === "unsure" && opts.map((o) => o.key).join() === "push,keep,pause,unsure", "three choices plus Not sure", opts);
ok(/In the queue: 6 ideas/.test(qa.cue) && /Published in the last 30 days: 1\./.test(qa.cue) && /Latest: Wavefunction collapse as bookkeeping\./.test(qa.cue), "cue counts the line in the queue and names the latest paper", qa.cue);
ok(/^Research line: Quantum foundations/.test(qa.question), "question names the line in plain words", qa.question);
const top = db.prepare("SELECT * FROM owner_asks WHERE kind = 'research-top'").get();
const topOpts = JSON.parse(top.options_json);
ok(top && topOpts.length === 5 && topOpts[0].key === "ai-systems" && topOpts[4].key === "unsure", "weekly pick: four lines, AI systems first, then Not sure", topOpts);
ok(db.prepare("SELECT enabled FROM fleet_crons WHERE name = 'recall-loop-daily'").get().enabled === 1, "daily fleet task is scheduled");

const answer = (a, key) => db.prepare("UPDATE owner_asks SET answer = ?, answer_label = ?, answered_at = ?, answered_via = 'test' WHERE id = ?").run(key, key, new Date().toISOString(), a.id);
const st = (id) => db.prepare("SELECT status, score, error FROM research_queue WHERE id = ?").get(id);
answer(qa, "pause");
ok(db.prepare("SELECT stance FROM owner_focus WHERE line = 'quantum-foundations'").get().stance === "pause", "the answer becomes the line's stance");
ok(st("q1").status === "owner_paused" && st("q2").status === "owner_paused", "queued and deferred ideas of a paused line are held", [st("q1"), st("q2")]);
ok(st("q3").status === "queued" && st("q4").status === "queued" && st("q5").status === "queued", "remediation, an owner intent and a started draft are never paused");
ok(st("a2").status === "owner_paused", "an idea in a paused line and no pushed line is held", st("a2"));
// The backpressure release in qnfo-fleet-control reads status = 'deferred' only (RB_ORDER_SQL over research_queue WHERE status = 'deferred').
ok(!db.prepare("SELECT id FROM research_queue WHERE status = 'deferred'").all().some((r) => r.id === "q1" || r.id === "q2"), "backpressure release cannot pick a held idea");
add("q6", "proposal", "Quantum Zeno effect as an epistemic artefact", "queued");
ok(st("q6").status === "owner_paused" && /OWNER-FOCUS-1 paused quantum-foundations/.test(st("q6").error), "a new idea of a paused line is held on insert", st("q6"));
add("x1", "proposal", "Number theory of prime gaps", "queued");
ok(st("x1").status === "queued", "a new idea outside every paused line is untouched");

const aa = asks.find((a) => a.ref.startsWith("ai-systems@"));
answer(aa, "push");
ok(st("a1").score >= 0.95 && st("a1").status === "deferred", "a pushed line is lifted to score 0.95", st("a1"));
ok(st("a2").status === "deferred" && st("a2").score >= 0.95, "a pushed line wins over a paused one", st("a2"));
add("a3", "proposal", "Quantum noise in LLM agent evaluations", "queued", { score: 0.1 });
ok(st("a3").status === "queued" && st("a3").score >= 0.95, "a new idea in a pushed line is lifted on insert, even if a paused line also matches", st("a3"));
const view = db.prepare("SELECT * FROM v_owner_focus WHERE line = 'quantum-foundations'").get();
ok(view.stance === "pause" && view.paused_by_owner === 3, "v_owner_focus shows the stance and what it holds", view);

// Keep it as is releases what the pause held (a later answer to the same question).
db.prepare("UPDATE owner_asks SET answer = 'keep' WHERE id = ?").run(qa.id);
ok(st("q1").status === "deferred" && st("q6").status === "deferred" && /released/.test(st("q1").error), "Keep it as is releases the held ideas into the normal order", st("q1"));
ok(db.prepare("SELECT COUNT(*) n FROM owner_focus_log").get().n === 3, "every stance change is logged");

// Weekly pick.
answer(top, "math");
ok(db.prepare("SELECT stance FROM owner_focus WHERE line = 'math'").get().stance === "push" && st("x1").score >= 0.95, "the weekly pick pushes that line", st("x1"));
const unsureTop = db.prepare("SELECT COUNT(*) n FROM owner_focus").get().n;
db.prepare("UPDATE owner_asks SET answer = 'unsure' WHERE id = ?").run(top.id);
ok(db.prepare("SELECT COUNT(*) n FROM owner_focus").get().n === unsureTop, "Not sure changes nothing");

// The daily task: nothing new within 14 days of an answer; an unanswered question is not duplicated; after 14 days the line is asked again.
const task = JSON.parse(db.prepare("SELECT definition FROM fleet_tasks WHERE id = 'recall-loop'").get().definition);
const runTask = () => { for (const s of task.steps) db.exec(s.sql); };
const before = db.prepare("SELECT COUNT(*) n FROM owner_asks WHERE kind = 'research-line'").get().n;
runTask();
ok(db.prepare("SELECT COUNT(*) n FROM owner_asks WHERE kind = 'research-line'").get().n === before, "no duplicate while a question is open or answered in 14 days");
db.prepare("UPDATE owner_asks SET answered_at = ?, created_at = ? WHERE id = ?").run(new Date(Date.now() - 15 * 864e5).toISOString(), new Date(Date.now() - 16 * 864e5).toISOString(), aa.id);
db.prepare("UPDATE owner_asks SET ref = 'ai-systems@2026-10-20' WHERE id = ?").run(aa.id);
runTask();
const again = db.prepare("SELECT cue FROM owner_asks WHERE kind = 'research-line' AND ref LIKE 'ai-systems@%' AND answered_at IS NULL").get();
ok(again && /You said last time: do more\./.test(again.cue), "after 14 days the line is asked again and the cue recalls the last answer", again);
ok(db.prepare("SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'recall-loop'").get().n >= 1, "the task writes a ledger row");
ok(db.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1, "one decision_log row with the prediction");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
