// IDEA-SCORING-POISON-1 (idea-hub 1.13.0, agent_issues 100145) offline suite. Runs the worker's own triageProposals in a vm against in-memory SQLite.
// A row that no model in T_CHAIN could score stayed status new, was scored again on every hourly cycle and counted out.errors, so fleet_heartbeat
// idea-hub read ok=0 on every cycle (CRON-FAULT-1 100145). Proves:
//   - a failing row is marked on the row ([scoring-error N ISO] in rationale), stays new, is counted as scoring_failed and NOT as errors, the clean
//     rows of the same batch are triaged, and the heartbeat is ok=1;
//   - it is retried on the next cycles up to SCORING_RETRY_FAST (3) failures, then not for 24 hours (no model call, counted as scoring_cooling), then
//     once more;
//   - rows without a marker are taken before marked rows, so TRIAGE_BATCH failing rows cannot starve a clean row;
//   - a marked row that is scored later has its marker replaced by the rationale;
//   - an owner-authored (direct) row is unchanged: held at once with "scoring unavailable";
//   - a thrown error is still a cron fault (errors counted, heartbeat ok=0);
//   - the idea-triage-budget event carries scoring_failed, scoring_cooling, scoring_error and errors.
// Run: node idea-hub/scoring-failure.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { stripWorkerDefaultExport } from "../scripts/worker-source-test.mjs";
import { DatabaseSync } from "node:sqlite";
const here = dirname(fileURLToPath(import.meta.url));
const src = stripWorkerDefaultExport(readFileSync(join(here, "worker.js"), "utf8")).replace(/export default\s*\{/, "var __default = {");
const sb = { console: { log() {}, error() {} }, Date, JSON, Math, Number, String, RegExp, Set, Map, Array, Object, Promise, URL, Response, Request, Headers, TextEncoder, crypto, fetch: async () => { throw new Error("no network"); } };
vm.createContext(sb);
vm.runInContext(src + "\n__x = { triageProposals, scoringErrorState, TRIAGE_BATCH, SCORING_RETRY_FAST, SCORING_RETRY_SLOW_MS };", sb);
const api = sb.__x;
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const shim = (db, before) => ({ prepare(sql) { let a = []; const q = sql.replace(/\?(\d+)/g, "?"); const st = { bind(...x) { a = x; return st; }, async all() { return { results: db.prepare(q).all(...a) }; }, async first() { return db.prepare(q).get(...a) ?? null; }, async run() { if (before) before(sql, a); const r = db.prepare(q).run(...a); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }; return st; } });
const fresh = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, idea TEXT NOT NULL, contact TEXT, status TEXT DEFAULT 'new', ip_hash TEXT, created_at TEXT, decision TEXT, score REAL, rationale TEXT, triaged_at TEXT);
CREATE TABLE fleet_budget (node_class TEXT PRIMARY KEY, cap REAL, target REAL, current REAL, unit TEXT, updated_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT, score REAL, decision TEXT, status TEXT, created_at TEXT, UNIQUE(source, source_id));
CREATE TABLE fleet_heartbeat (worker TEXT PRIMARY KEY, version TEXT, ts TEXT, ok INTEGER);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT);
CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, PRIMARY KEY (day, worker, purpose, model));
CREATE TABLE ai_cache_counters (day TEXT, worker TEXT, model TEXT, calls INTEGER DEFAULT 0, cached_calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, cached_tok INTEGER DEFAULT 0, PRIMARY KEY (day, worker, model));`);
  return db;
};
// A scorecard that scores low (HOLD) so nothing is queued; an idea containing POISON gets a reply with no JSON from every model.
const CARD = JSON.stringify({ novelty: 0.1, technical_merit: 0.1, impact_potential: 0.1, exposure_potential: 0.1, feasibility: 0.1, risk: 0.9, rationale: "thin" });
let aiCalls = 0, poison = true;
const mk = (db, before) => ({ QNFO_AUDIT: shim(db, before), AI: { async run(model, input) { aiCalls++; const text = JSON.stringify(input.messages); return { response: poison && /POISON/.test(text) ? "I cannot produce JSON for this one." : CARD }; } } });
const add = (db, name, idea, created, rationale) => db.prepare("INSERT INTO idea_proposals (name, idea, status, created_at, rationale) VALUES (?, ?, 'new', ?, ?)").run(name, idea, created, rationale ?? null).lastInsertRowid;
const row = (db, id) => db.prepare("SELECT id, status, decision, rationale FROM idea_proposals WHERE id = ?").get(id);
const hb = (db) => db.prepare("SELECT ok FROM fleet_heartbeat WHERE worker = 'idea-hub'").get();
const LONG = " A longer research idea about invariants of the standardized coordinates that clears the noise filter and the chat-question filter easily.";
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();

// 1. a failing corpus row and a clean one in the same batch
{
  const db = fresh(), env = mk(db);
  const bad = add(db, "owner-corpus", "POISON one" + LONG, "2026-10-19T13:00:00Z"), good = add(db, "intake:think", "clean idea" + LONG, "2026-10-19T14:00:00Z");
  const out = await api.triageProposals(env);
  ok(out.errors === 0 && out.scoring_failed === 1 && out.scoring_cooling === 0, "a failing row is a scoring_failed, not an error", out);
  ok(row(db, bad).status === "new" && /^\[scoring-error 1 \d{4}-\d\d-\d\dT[\d:.]+Z\] /.test(row(db, bad).rationale), "it stays new with a [scoring-error 1 ISO] marker and the reason", row(db, bad));
  ok(row(db, good).status !== "new" && row(db, good).decision === "HOLD", "the clean row of the same batch is triaged", row(db, good));
  ok(out.triaged === 1 && hb(db) && hb(db).ok === 1, "the cycle is healthy: heartbeat ok=1", { out, hb: hb(db) });
  const ev = db.prepare("SELECT meta FROM cloud_ops_events WHERE id = 'idea-triage-budget'").get();
  const m = ev && JSON.parse(ev.meta);
  ok(m && m.scoring_failed === 1 && m.scoring_cooling === 0 && /lean scoring failed|all scoring models failed/.test(m.scoring_error) && m.errors === 0, "the event meta carries scoring_failed, scoring_cooling, scoring_error and errors", m);

  // 2. retried on the next cycles up to 3 failures, then cooled for 24 h
  let o2 = await api.triageProposals(env);
  ok(o2.scoring_failed === 1 && /^\[scoring-error 2 /.test(row(db, bad).rationale), "cycle 2: retried, marker N=2", row(db, bad));
  o2 = await api.triageProposals(env);
  ok(o2.scoring_failed === 1 && /^\[scoring-error 3 /.test(row(db, bad).rationale), "cycle 3: retried, marker N=3", row(db, bad));
  aiCalls = 0;
  o2 = await api.triageProposals(env);
  ok(o2.scoring_cooling === 1 && o2.scoring_failed === 0 && o2.errors === 0 && aiCalls === 0, "after 3 failures the row is not scored again for 24 h: no model call, counted as scoring_cooling", { o2, aiCalls });
  ok(/^\[scoring-error 3 /.test(row(db, bad).rationale) && hb(db).ok === 1, "its marker is unchanged and the heartbeat stays ok=1", row(db, bad));
  db.prepare("UPDATE idea_proposals SET rationale = ? WHERE id = ?").run("[scoring-error 3 " + iso(25 * 3600e3) + "] old", bad);
  o2 = await api.triageProposals(env);
  ok(o2.scoring_failed === 1 && /^\[scoring-error 4 /.test(row(db, bad).rationale), "after 24 h it is tried once more (N=4)", row(db, bad));

  // 5. scored later: the marker is replaced by the rationale
  poison = false;
  db.prepare("UPDATE idea_proposals SET rationale = ? WHERE id = ?").run("[scoring-error 3 " + iso(25 * 3600e3) + "] old", bad);
  o2 = await api.triageProposals(env);
  ok(row(db, bad).status !== "new" && !/scoring-error/.test(row(db, bad).rationale || ""), "a marked row that is scored later leaves the queue and loses the marker", row(db, bad));
  poison = true;
}

// 3. TRIAGE_BATCH marked rows cannot starve a clean row
{
  const db = fresh(), env = mk(db);
  const n = api.TRIAGE_BATCH;
  for (let i = 0; i < n + 2; i++) add(db, "owner-corpus", "POISON " + i + LONG, "2026-10-19T0" + (i % 10) + ":00:00Z", "[scoring-error 1 " + iso(2 * 3600e3) + "] earlier");
  const good = add(db, "intake:think", "late clean idea" + LONG, "2026-10-19T20:00:00Z");
  const out = await api.triageProposals(env);
  ok(row(db, good).status !== "new", "rows without a marker are taken before marked rows: a clean row behind TRIAGE_BATCH+2 marked rows is triaged in the first run", { good: row(db, good), out });
  ok(out.errors === 0 && out.scoring_failed === n - 1, "the rest of the batch is the marked rows, each counted as scoring_failed", out);
}

// 8. IDEA-TRIAGE-COOLING-STARVE-1 (1.14.4): rows still cooling do not take batch slots, and marked rows go oldest last failure first
{
  const db = fresh(), env = mk(db);
  const n = api.TRIAGE_BATCH;
  // n rows past their third failure (one try a day), created long before everything else, failed 2 h ago: they fill the whole batch under the old selection
  const cool = [];
  for (let i = 0; i < n; i++) cool.push(add(db, "owner-corpus", "POISON cooling " + i + LONG, "2026-10-1" + (i % 10) + "T00:00:00Z", "[scoring-error 3 " + iso(2 * 3600e3) + "] earlier"));
  // rows that failed once, created later: they must be retried this run
  const once = [];
  for (let i = 0; i < 3; i++) once.push(add(db, "owner-corpus", "POISON once " + i + LONG, "2026-10-20T0" + i + ":00:00Z", "[scoring-error 1 " + iso((10 - i) * 3600e3) + "] earlier"));
  aiCalls = 0;
  const out = await api.triageProposals(env);
  ok(out.scoring_cooling === n, "the cooling rows are counted (scoring_cooling) without being selected", out);
  ok(once.every((id) => /^\[scoring-error 2 /.test(row(db, id).rationale)), "the rows that failed once are retried although n older cooling rows exist: they are not starved", once.map((id) => row(db, id).rationale));
  ok(cool.every((id) => /^\[scoring-error 3 /.test(row(db, id).rationale)), "the cooling rows keep their marker (no model call for them)", cool.map((id) => row(db, id).rationale));
  ok(out.scoring_failed === 3 && out.errors === 0, "exactly the three untried rows were scored and failed, no error", out);
}
{
  // the batch is the marked rows with the oldest last failure first, not the oldest created
  const db = fresh(), env = mk(db);
  const n = api.TRIAGE_BATCH, ids = [];
  for (let i = 0; i < n + 2; i++) ids.push(add(db, "owner-corpus", "POISON ordered " + i + LONG, "2026-10-19T0" + i + ":00:00Z", "[scoring-error 1 " + iso((i + 1) * 3600e3) + "] earlier"));
  // ids[0] failed 1 h ago (most recent), ids[n+1] failed n+2 h ago (oldest failure): the last n by failure age are tried, the two most recently failed wait
  const out = await api.triageProposals(env);
  const tried = ids.filter((id) => /^\[scoring-error 2 /.test(row(db, id).rationale));
  ok(tried.length === n && !tried.includes(ids[0]) && !tried.includes(ids[1]), "with more marked rows than the batch holds, those whose last failure is oldest are tried first", { tried, ids, out });
}

// 6. a thrown error is still a cron fault
{
  const db = fresh();
  const env = mk(db, (sql) => { if (/SET rationale = \?\d+ WHERE id = \?\d+ AND status = 'new'/.test(sql)) throw new Error("D1 write failed"); });
  add(db, "owner-corpus", "POISON two" + LONG, "2026-10-19T13:00:00Z");
  const out = await api.triageProposals(env);
  ok(out.errors === 1 && hb(db) && hb(db).ok === 0, "a thrown error (the marker write failed) is counted as errors and the heartbeat reads ok=0", { out, hb: hb(db) });
}

// 7. an owner-authored row is unchanged
{
  const db = fresh(), env = mk(db);
  const id = add(db, "owner", "POISON owner idea" + LONG, "2026-10-19T13:00:00Z");
  const out = await api.triageProposals(env);
  ok(row(db, id).status === "triaged_accepted" && /owner-authored/.test(row(db, id).rationale) && out.scoring_failed === 0, "a direct (owner-authored) row whose scoring fails is accepted as owner-authored, never marked", { r: row(db, id), out });
}

// the marker parser
const st = api.scoringErrorState("[scoring-error 4 2026-10-19T17:30:00.000Z] x");
ok(st.n === 4 && st.at === Date.parse("2026-10-19T17:30:00.000Z") && api.scoringErrorState("").n === 0 && api.scoringErrorState(null).n === 0 && api.scoringErrorState("plain rationale").n === 0, "scoringErrorState reads N and the time, and an unmarked rationale as 0");
const v = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(v && (Number(v[1]) > 1 || Number(v[2]) >= 13), "VERSION is at least 1.13.0", v && v[0]);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
