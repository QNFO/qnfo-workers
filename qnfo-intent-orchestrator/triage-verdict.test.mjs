// INTENT-TRIAGE-SKIP-1 (agent_issues 100066) offline suite for qnfo-intent-orchestrator.
// Proves: a research idea from a research feed that the classifier typed event is triaged inline and in the 06:30 batch (it sat
// pending for good before); a calendar item from calendar-sync or mcp in the research domain is NOT sent to research triage;
// every terminal triage state writes its verdict (triaged_at, triage_decision, triage_score, triage_model); a table without the
// verdict columns gets them from ensureSchema.
// Run: node qnfo-intent-orchestrator/triage-verdict.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
// ensureSchema caches its result per module instance, as it does per isolate; every environment below gets a fresh instance.
let worker, loads = 0;
const load = async () => (await import(pathToFileURL(join(here, "worker.js")).href + "?instance=" + (++loads))).default;

let passed = 0, failed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("ok   " + name); } catch (e) { failed++; console.log("FAIL " + name + ": " + (e && e.message || e)); } };
const ok = (c, m) => { if (!c) throw new Error(m || "assertion"); };

function d1(db) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) || null,
    run: async () => { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
  });
  return { prepare: (sql) => stmt(sql) };
}
const VERDICT_COLS = ", triaged_at TEXT, triage_decision TEXT, triage_score REAL, triage_model TEXT";
const TRIAGE_OK = { is_noise: false, question: "q", cluster_key: "k", technical_merit: 80, impact_potential: 80, novelty: 80, feasibility: 80 };
const TRIAGE_LOW = { ...TRIAGE_OK, technical_merit: 20, impact_potential: 20, novelty: 20, feasibility: 20 };
const TRIAGE_NOISE = { ...TRIAGE_OK, is_noise: true };

// opts.cls: what the classifier answers at intake; opts.triage: what the triage model answers; opts.dupScore: similarity of the stored vector
async function mkEnv(opts = {}) {
  worker = await load();
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE intents (id TEXT PRIMARY KEY, desire TEXT, source TEXT, device TEXT, type TEXT, domain TEXT, priority TEXT, summary TEXT, due TEXT, status TEXT, wbs_code TEXT, created_at TEXT, processed_at TEXT, noise INTEGER DEFAULT 0, dup_of TEXT" + (opts.noVerdictCols ? "" : VERDICT_COLS) + ")");
  db.exec("CREATE TABLE intent_classify_stats (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, model TEXT, ok INTEGER DEFAULT 0, retry INTEGER DEFAULT 0)");
  const upserts = { p: [], r: [] };
  if (opts.seedVector) upserts.r.push({ id: "intent:" + opts.seedVector, metadata: {} });
  const vec = new Array(768).fill(0.01);
  const index = (k) => ({
    upsert: async (rows) => { upserts[k].push(...rows); },
    query: async (v, o) => ({ matches: upserts[k].slice(0, o.topK).map((x) => ({ id: x.id, score: opts.dupScore == null ? 0.5 : opts.dupScore, metadata: x.metadata })) })
  });
  const calls = { classify: 0, triage: 0 };
  const reply = (obj) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(obj) } }] }));
  const QNFO_AI = { fetch: async (url, init) => {
    const sys = JSON.parse(init.body).messages[0].content;
    if (/^You classify/.test(sys)) { calls.classify++; return reply(opts.cls || { type: "event", domain: "research", priority: "medium", summary: "s" }); }
    calls.triage++;
    return reply(opts.triage || TRIAGE_OK);
  } };
  const env = { INTENT_TOKEN: "tok-test", RT: "rt", D1: d1(db), AI: { run: async () => ({ data: [vec] }) }, VZ_P: index("p"), VZ_R: index("r"), QNFO_AI };
  return { env, db, calls, upserts };
}
const post = async (env, desire, source) => {
  const pending = [];
  const r = await worker.fetch(new Request("https://x/intent?source=" + encodeURIComponent(source), { method: "POST", headers: { Authorization: "Bearer tok-test", "Content-Type": "application/json" }, body: JSON.stringify({ desire }) }), env, { waitUntil: (p) => pending.push(p) });
  const j = await r.json();
  await Promise.all(pending);
  return j;
};
const insert = (db, id, over = {}) => {
  const r = { id, desire: "Research question about " + id, source: "qnfo-ops-research-feed", type: "event", domain: "research", status: "pending", created_at: "2026-10-19T05:00:00.000Z", ...over };
  db.prepare("INSERT INTO intents (id, desire, source, device, type, domain, priority, summary, due, status, wbs_code, created_at, processed_at) VALUES (?1,?2,?3,'d',?4,?5,'medium','s',NULL,?6,NULL,?7,NULL)").run(r.id, r.desire, r.source, r.type, r.domain, r.status, r.created_at);
};
const row = (db, id) => db.prepare("SELECT status, noise, dup_of, triaged_at, triage_decision, triage_score, triage_model FROM intents WHERE id = ?").get(id);
const quiet = async (fn) => { const l = console.log, e = console.error; console.log = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.error = e; } };
const cron = (env) => quiet(() => worker.scheduled({ cron: "30 6 * * *" }, env));

await t("VERSION is at least 1.6.0", async () => {
  const m = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
  ok(m && Number(m[1]) * 1e6 + Number(m[2]) * 1e3 + Number(m[3]) >= 1006000, "version " + (m && m[0]));
});
await t("a research idea from a research feed typed event is triaged inline and carries its verdict", async () => {
  const { env, db, calls } = await mkEnv();
  const j = await post(env, "Research whether the event horizon of a Kerr black hole admits a closed-form theorem", "qnfo-ops-research-feed");
  ok(j.type === "event" && j.domain === "research", "intake " + JSON.stringify(j));
  const r = row(db, j.id);
  ok(r.status === "triaged" && r.triage_decision === "TO-RESEARCH-CANDIDATE" && r.triage_score === 80 && r.triage_model === "deepseek-v4-flash" && r.triaged_at, JSON.stringify(r));
  ok(calls.triage === 1, "triage calls " + calls.triage);
  ok(db.prepare("SELECT COUNT(*) n FROM research_candidates").get().n === 1, "no candidate");
});
await t("a calendar item from calendar-sync or mcp in the research domain is left out of research triage", async () => {
  for (const source of ["calendar-sync", "mcp", "chatbox"]) {
    const { env, db, calls } = await mkEnv();
    const j = await post(env, "CALENDAR EVENT: CWI Workshop on Quantum Algorithms at 2026-09-16T07:00:00 (" + source + ")", source);
    const r = row(db, j.id);
    ok(r.status === "pending" && r.triage_decision === null && calls.triage === 0, source + ": " + JSON.stringify(r) + " triage calls " + calls.triage);
  }
});
await t("the 06:30 batch triages a research-feed event and a research-typed row, and not a calendar item", async () => {
  const { env, db } = await mkEnv();
  insert(db, "int-feed-event");
  insert(db, "int-typed-research", { type: "research", source: "chatbox" });
  insert(db, "int-calendar", { source: "calendar-sync", desire: "CALENDAR EVENT: seminar" });
  insert(db, "int-feed-task", { type: "task" });
  await cron(env);
  ok(row(db, "int-feed-event").status === "triaged" && row(db, "int-feed-event").triage_decision === "TO-RESEARCH-CANDIDATE", JSON.stringify(row(db, "int-feed-event")));
  ok(row(db, "int-typed-research").status === "triaged", JSON.stringify(row(db, "int-typed-research")));
  ok(row(db, "int-calendar").status === "pending" && row(db, "int-calendar").triage_decision === null, JSON.stringify(row(db, "int-calendar")));
  ok(row(db, "int-feed-task").status === "triaged", "a research-feed task in the research domain is also a submission: " + JSON.stringify(row(db, "int-feed-task")));
});
await t("below the threshold the verdict is BELOW-THRESHOLD with the score", async () => {
  const { env, db } = await mkEnv({ triage: TRIAGE_LOW });
  insert(db, "int-low");
  await cron(env);
  const r = row(db, "int-low");
  ok(r.status === "triaged" && r.triage_decision === "BELOW-THRESHOLD" && r.triage_score === 20 && r.triage_model === "deepseek-v4-flash" && r.triaged_at, JSON.stringify(r));
});
await t("an AI-flagged noise idea is rejected with decision NOISE and the model", async () => {
  const { env, db } = await mkEnv({ triage: TRIAGE_NOISE });
  insert(db, "int-ai-noise");
  await cron(env);
  const r = row(db, "int-ai-noise");
  ok(r.status === "rejected" && r.noise === 1 && r.triage_decision === "NOISE" && r.triage_model === "deepseek-v4-flash" && r.triaged_at, JSON.stringify(r));
});
await t("a regex-noise idea is rejected with decision NOISE from the rule, not a model", async () => {
  const { env, db, calls } = await mkEnv();
  insert(db, "int-rule-noise", { desire: "Call the email_check tool and output the raw json" });
  await cron(env);
  const r = row(db, "int-rule-noise");
  ok(r.status === "rejected" && r.noise === 1 && r.triage_decision === "NOISE" && r.triage_model === "rule:noise-patterns" && calls.triage === 0, JSON.stringify(r));
});
await t("a near-duplicate is deduped with decision DUPLICATE, its twin and the embedding model", async () => {
  const { env, db } = await mkEnv({ dupScore: 0.95, seedVector: "int-twin" });
  insert(db, "int-dup");
  await cron(env);
  const r = row(db, "int-dup");
  ok(r.status === "deduped" && r.dup_of === "int-twin" && r.triage_decision === "DUPLICATE" && r.triage_model === "@cf/baai/bge-base-en-v1.5" && r.triaged_at, JSON.stringify(r));
});
await t("a table without the verdict columns gets them from ensureSchema and the verdict is still written", async () => {
  const { env, db } = await mkEnv({ noVerdictCols: true });
  insert(db, "int-old-table");
  await cron(env);
  const cols = db.prepare("SELECT name FROM pragma_table_info('intents')").all().map((c) => c.name);
  ok(["triaged_at", "triage_decision", "triage_score", "triage_model"].every((c) => cols.includes(c)), cols.join());
  ok(row(db, "int-old-table").triage_decision === "TO-RESEARCH-CANDIDATE", JSON.stringify(row(db, "int-old-table")));
});
await t("the gate is the research feed suffix, not any research-domain row", async () => {
  ok(/var RESEARCH_FEED_RE = \/-research-feed\$\//.test(src), "suffix rule");
  ok(!/intent\.domain === "research"\)\s*&&\s*ctx/.test(src), "inline gate must not accept every research-domain row");
});

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
