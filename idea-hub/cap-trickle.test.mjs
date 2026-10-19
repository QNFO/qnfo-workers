// IDEAS-CAP-RATE-1 (idea-hub 1.12.0, agent_issues 100047) offline suite. Runs the worker's own capRelease and triageProposals in a vm
// against in-memory SQLite.
// The 1.11.1 release fitted held rows under RESEARCH_ADMISSION_CAP only; research_queue sat at 473 of 120 (active rows plus the deferred
// overflow), so room was never positive, 80 cap-held accepts stayed held with no expiry and the oldest was 44 hours old. Proves:
//   - room <= 0 with 10 held rows: exactly CAP_TRICKLE_PER_RUN (3) oldest rows are released per run, oldest first by created_at (not by
//     insert order), the cap note is stripped, the rows are in research_queue, the rest stay held, a hold for another reason and a
//     non-ACCEPT row are untouched, and the run drains the backlog at a rate (3, 3, 3, 1, 0);
//   - room > 0: unchanged (min(room, TRIAGE_BATCH) rows, no trickle counted, no trickle event);
//   - every trickle run is logged: an append-only cloud_ops_events row of kind idea-cap-trickle names the rows and what is still held,
//     and the hourly idea-triage-budget event carries cap_trickled_run; a run that admits nothing writes no trickle row;
//   - a row another path already released (UPDATE changes 0 rows) is skipped, not counted and not queued.
// Run: node idea-hub/cap-trickle.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8").replace(/export default\s*\{/, "var __default = {");
const sb = { console: { log() {}, error() {} }, Date, JSON, Math, Number, String, RegExp, Set, Map, Array, Object, Promise, URL, Response, Request, Headers, TextEncoder, crypto, fetch: async () => { throw new Error("no network"); } };
vm.createContext(sb);
vm.runInContext(src + "\n__x = { triageProposals, capRelease, RESEARCH_ADMISSION_CAP, TRIAGE_BATCH, CAP_TRICKLE_PER_RUN: typeof CAP_TRICKLE_PER_RUN === 'undefined' ? undefined : CAP_TRICKLE_PER_RUN };", sb);
const api = sb.__x;
const CAP = api.RESEARCH_ADMISSION_CAP;
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const shim = (db, before) => ({ prepare(sql) { let a = []; const q = sql.replace(/\?(\d+)/g, "?"); const st = { bind(...x) { a = x; return st; }, async all() { return { results: db.prepare(q).all(...a) }; }, async first() { return db.prepare(q).get(...a) ?? null; }, async run() { if (before) before(sql, a); const r = db.prepare(q).run(...a); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }; return st; } });
const fresh = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, idea TEXT NOT NULL, contact TEXT, status TEXT DEFAULT 'new', ip_hash TEXT, created_at TEXT, decision TEXT, score REAL, rationale TEXT, triaged_at TEXT);
CREATE TABLE fleet_budget (node_class TEXT PRIMARY KEY, cap REAL, target REAL, current REAL, unit TEXT, updated_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT, score REAL, decision TEXT, status TEXT, created_at TEXT, UNIQUE(source, source_id));
CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, PRIMARY KEY (day, worker, purpose, model));
CREATE TABLE ai_cache_counters (day TEXT, worker TEXT, model TEXT, calls INTEGER DEFAULT 0, cached_calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, cached_tok INTEGER DEFAULT 0, PRIMARY KEY (day, worker, model));`);
  return db;
};
const seed = (db, n, status = "queued") => { const ins = db.prepare("INSERT INTO research_queue (id, source, source_id, idea, summary, score, decision, status, created_at) VALUES (?, 'seed', ?, 'x', '', 0.5, 'ACCEPT', ?, datetime('now'))"); for (let i = 0; i < n; i++) ins.run(status + "-" + i, status + "-" + i, status); };
const activeN = (db) => db.prepare("SELECT COUNT(*) AS n FROM research_queue WHERE status IN ('queued','researching','review','deferred')").get().n;
const heldN = (db) => db.prepare("SELECT COUNT(*) AS n FROM idea_proposals WHERE decision = 'ACCEPT' AND status = 'triaged_hold' AND rationale LIKE '[research admission cap %'").get().n;
// Ten held cap rows inserted out of age order (ids 1..10), created 01:00..10:00 on 2026-10-17: "held 01" is the oldest.
const AGES = [5, 3, 9, 1, 7, 2, 10, 4, 8, 6];
const holdTen = (db) => { const ins = db.prepare("INSERT INTO idea_proposals (name, idea, status, created_at, decision, score, rationale) VALUES ('auto-scan', ?, 'triaged_hold', ?, 'ACCEPT', 0.8, ?)"); AGES.forEach((h, i) => ins.run("held " + String(h).padStart(2, "0"), "2026-10-17T" + String(h).padStart(2, "0") + ":00:00Z", "[research admission cap 473/120] note " + String(h).padStart(2, "0"))); };
const byIdea = (db, idea) => db.prepare("SELECT id, status, rationale FROM idea_proposals WHERE idea = ?").get(idea);
const queuedIdea = (db, idea) => !!db.prepare("SELECT 1 FROM research_queue WHERE idea = ?").get(idea);
const trickleRows = (db) => db.prepare("SELECT id, kind, text, meta, job, status FROM cloud_ops_events WHERE kind = 'idea-cap-trickle' ORDER BY id").all();
const mk = (db, before) => ({ QNFO_AUDIT: shim(db, before), AI: { async run() { return { response: "{}" }; } } });

ok(api.CAP_TRICKLE_PER_RUN === 3, "the trickle is 3 rows a run", api.CAP_TRICKLE_PER_RUN);

// 1. Room <= 0 (the live shape: queue far over the cap), 10 held rows: exactly 3 oldest per run.
{
  const db = fresh();
  seed(db, CAP + 353, "queued");
  holdTen(db);
  db.prepare("INSERT INTO idea_proposals (name, idea, status, created_at, decision, rationale) VALUES ('x', 'a real hold', 'triaged_hold', '2026-10-01T00:00:00Z', 'HOLD', 'noise/question filter')").run();
  db.prepare("INSERT INTO idea_proposals (name, idea, status, created_at, decision, score, rationale) VALUES ('x', 'accept held for another reason', 'triaged_hold', '2026-10-01T00:00:00Z', 'ACCEPT', 0.9, '[diversity hold expired] other')").run();
  const env = mk(db);
  const before = activeN(db);
  let out = await api.triageProposals(env);
  ok(out.cap_released === 3 && out.cap_trickled === 3 && out.released === 3, "queue over the cap, 10 held: exactly 3 released in the run", [out.cap_released, out.cap_trickled, out.released]);
  ok(["held 01", "held 02", "held 03"].every((i) => byIdea(db, i).status === "triaged_accepted"), "the 3 oldest by created_at are the ones released (not insert order)", ["held 01", "held 02", "held 03"].map((i) => byIdea(db, i).status));
  ok(["held 04", "held 05", "held 06", "held 07", "held 08", "held 09", "held 10"].every((i) => byIdea(db, i).status === "triaged_hold"), "the other 7 stay held");
  ok(byIdea(db, "held 01").rationale === "note 01", "the cap note is stripped from a released row", byIdea(db, "held 01").rationale);
  ok(["held 01", "held 02", "held 03"].every((i) => queuedIdea(db, i)) && !queuedIdea(db, "held 04"), "released rows are in research_queue, held ones are not");
  ok(activeN(db) === before + 3, "the queue grew by exactly the 3 admitted", [before, activeN(db)]);
  ok(byIdea(db, "a real hold").status === "triaged_hold" && byIdea(db, "accept held for another reason").status === "triaged_hold", "a hold for another reason is untouched");
  const ev = trickleRows(db);
  const meta = ev[0] && JSON.parse(ev[0].meta);
  ok(ev.length === 1 && ev[0].job === "idea-hub" && ev[0].status === "ok", "one idea-cap-trickle event logged for the run", ev.length);
  ok(meta && meta.queue_n === before && meta.cap === CAP && meta.trickle_per_run === 3 && meta.admitted_ids.length === 3 && meta.held_left === 7, "the event records queue size, cap, rate, admitted ids and rows still held", meta);
  const ids = [byIdea(db, "held 01").id, byIdea(db, "held 02").id, byIdea(db, "held 03").id];
  ok(meta && JSON.stringify(meta.admitted_ids) === JSON.stringify(ids) && ids.every((i) => ev[0].text.includes(String(i))), "the event names the admitted proposal ids, oldest first", [meta && meta.admitted_ids, ids]);
  const hourly = db.prepare("SELECT meta FROM cloud_ops_events WHERE id = 'idea-triage-budget'").get();
  const hm = hourly && JSON.parse(hourly.meta);
  ok(hm && hm.cap_trickled_run === 3 && hm.cap_released_run === 3 && hm.released_run === 3, "the hourly idea-triage-budget event carries the trickle", hm && [hm.cap_trickled_run, hm.cap_released_run, hm.released_run]);
  // The backlog drains at a rate: 3, 3, 1 more runs, then nothing and no further event.
  const counts = [out.cap_trickled];
  for (let r = 0; r < 4; r++) { out = await api.triageProposals(env); counts.push(out.cap_trickled); await new Promise((res) => setTimeout(res, 2)); }
  ok(JSON.stringify(counts) === JSON.stringify([3, 3, 3, 1, 0]), "the backlog drains 3, 3, 3, 1, 0 over five runs", counts);
  ok(heldN(db) === 0 && byIdea(db, "a real hold").status === "triaged_hold", "no cap-held row is left, other holds still are");
  ok(trickleRows(db).length === 4, "four runs admitted rows, four trickle events; the empty run wrote none", trickleRows(db).length);
  const lastEv = trickleRows(db)[3], last = lastEv ? JSON.parse(lastEv.meta) : {};
  ok(Array.isArray(last.admitted_ids) && last.admitted_ids.length === 1 && last.held_left === 0, "the last event records 1 admitted and 0 left", last);
  // No silent loss: all 10 ended in research_queue exactly once.
  const rq = db.prepare("SELECT COUNT(*) AS n FROM research_queue WHERE source = 'proposal'").get().n;
  ok(rq === 10, "all 10 held accepts reached research_queue exactly once", rq);
}

// 2. Room > 0 is unchanged: min(room, TRIAGE_BATCH), no trickle counted, no trickle event.
{
  const db = fresh();
  seed(db, CAP - 2, "queued");
  holdTen(db);
  const env = mk(db);
  let out = await api.triageProposals(env);
  ok(out.cap_released === 2 && !out.cap_trickled, "room 2: 2 released by room, trickle not counted", [out.cap_released, out.cap_trickled]);
  ok(byIdea(db, "held 01").status === "triaged_accepted" && byIdea(db, "held 02").status === "triaged_accepted" && byIdea(db, "held 03").status === "triaged_hold", "room path is oldest first");
  ok(trickleRows(db).length === 0, "no trickle event on the room path", trickleRows(db).length);
  const db2 = fresh();
  holdTen(db2);
  out = await api.triageProposals(mk(db2));
  ok(out.cap_released === api.TRIAGE_BATCH && !out.cap_trickled, "an empty queue releases TRIAGE_BATCH (6), more than the trickle", [out.cap_released, out.cap_trickled]);
  ok(heldN(db2) === 10 - api.TRIAGE_BATCH && trickleRows(db2).length === 0, "4 left held, no trickle event");
}

// 3. At exactly the cap the room is 0: the trickle applies (the boundary).
{
  const db = fresh();
  seed(db, CAP, "queued");
  holdTen(db);
  const out = await api.triageProposals(mk(db));
  ok(out.cap_released === 3 && out.cap_trickled === 3, "queue exactly at the cap: the trickle admits 3", [out.cap_released, out.cap_trickled]);
}

// 4. Deferred and researching rows count toward the queue (as before), published ones do not; a trickle needs no room either way.
{
  const db = fresh();
  seed(db, 300, "published");
  seed(db, 2, "queued");
  holdTen(db);
  const out = await api.triageProposals(mk(db));
  ok(out.cap_released === 6 && !out.cap_trickled, "published rows do not count: room is positive and the room path runs", [out.cap_released, out.cap_trickled]);
}

// 5. Fewer held than the rate: only those are released.
{
  const db = fresh();
  seed(db, CAP + 5, "deferred");
  db.prepare("INSERT INTO idea_proposals (name, idea, status, created_at, decision, score, rationale) VALUES ('auto-scan', 'only one', 'triaged_hold', '2026-10-17T01:00:00Z', 'ACCEPT', 0.8, '[research admission cap 125/120] solo')").run();
  const out = await api.triageProposals(mk(db));
  ok(out.cap_released === 1 && out.cap_trickled === 1 && byIdea(db, "only one").rationale === "solo", "one held row, rate 3: one released", [out.cap_released, out.cap_trickled]);
  const ev = trickleRows(db);
  ok(ev.length === 1 && ev[0].text.includes("1 oldest held accept ") && ev[0].text.includes("0 still held"), "event text is singular and says nothing is left", ev[0] && ev[0].text);
}

// 6. A row another path released between the read and the UPDATE is skipped: not counted, not queued twice.
{
  const db = fresh();
  seed(db, CAP + 5, "queued");
  holdTen(db);
  const raced = db.prepare("SELECT id FROM idea_proposals WHERE idea = 'held 02'").get().id;
  let fired = false;
  const env = mk(db, (sql, a) => { if (!fired && /^UPDATE idea_proposals SET status = 'triaged_accepted'/.test(sql) && a[1] === raced) { fired = true; db.prepare("UPDATE idea_proposals SET status = 'triaged_accepted' WHERE id = ?").run(raced); } });
  const out = await api.triageProposals(env);
  ok(fired && out.cap_released === 2 && out.cap_trickled === 2, "a row already released by another path is skipped and not counted", [fired, out.cap_released, out.cap_trickled]);
  ok(!queuedIdea(db, "held 02") && queuedIdea(db, "held 01") && queuedIdea(db, "held 03"), "the raced row was not queued by this run, the other two were");
  const ev6 = trickleRows(db)[0], meta = ev6 ? JSON.parse(ev6.meta) : {};
  ok(Array.isArray(meta.admitted_ids) && meta.admitted_ids.length === 2 && !meta.admitted_ids.includes(raced), "the event lists only the rows this run admitted", meta.admitted_ids);
}

// 7. The log row is best effort: a failing cloud_ops_events insert never undoes or blocks the admission.
{
  const db = fresh();
  seed(db, CAP + 5, "queued");
  holdTen(db);
  db.exec("DROP TABLE cloud_ops_events");
  const out = { };
  await api.capRelease(mk(db), out);
  ok(out.cap_released === 3 && out.cap_trickled === 3 && queuedIdea(db, "held 01"), "a missing event table does not stop the admission", [out.cap_released, out.cap_trickled]);
}

// 8. Revert switch without a deploy: ops_config ideas_cap_trickle_per_run overrides the rate; 0 restores the old hold; an absent
// table or row, or a value out of 0..12, keeps the default of 3 (the read can never stop the admission).
{
  const withCfg = (v) => { const db = fresh(); db.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)"); if (v !== null) db.prepare("INSERT INTO ops_config (key, value) VALUES ('ideas_cap_trickle_per_run', ?)").run(v); seed(db, CAP + 5, "queued"); holdTen(db); return db; };
  let db = withCfg("0");
  let out = {};
  await api.capRelease(mk(db), out);
  ok(out.cap_released === 0 && out.cap_trickled === 0 && heldN(db) === 10 && trickleRows(db).length === 0, "ops_config 0: the trickle is off, every row stays held, no event", [out.cap_released, heldN(db)]);
  db = withCfg("5");
  out = {};
  await api.capRelease(mk(db), out);
  const ev8 = trickleRows(db)[0], m8 = ev8 ? JSON.parse(ev8.meta) : {};
  ok(out.cap_released === 5 && out.cap_trickled === 5 && heldN(db) === 5 && m8.trickle_per_run === 5, "ops_config 5: five oldest rows per run and the event records the rate used", [out.cap_released, m8.trickle_per_run]);
  for (const bad of ["13", "-1", "abc", ""]) {
    db = withCfg(bad);
    out = {};
    await api.capRelease(mk(db), out);
    ok(out.cap_released === 3 && out.cap_trickled === 3, "ops_config out of range or not a number (" + JSON.stringify(bad) + "): the default of 3 applies", [out.cap_released]);
  }
  db = withCfg(null);
  out = {};
  await api.capRelease(mk(db), out);
  ok(out.cap_released === 3, "ops_config with no row: the default of 3 applies", out.cap_released);
  // The switch is for the trickle only: the room path (queue under the cap) ignores it.
  db = fresh();
  db.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)");
  db.prepare("INSERT INTO ops_config (key, value) VALUES ('ideas_cap_trickle_per_run', '0')").run();
  holdTen(db);
  out = {};
  await api.capRelease(mk(db), out);
  ok(out.cap_released === api.TRIAGE_BATCH && !out.cap_trickled, "ops_config 0 does not stop the room path", [out.cap_released, out.cap_trickled]);
}

console.log(`cap-trickle: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
