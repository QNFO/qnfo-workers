// personal-companion 1.13.0 COMPANION-PUBLISH-STALL-AUTO-1 suite (charter pillar: core).
// Failure mode proven: 48h with no piece and nothing outside the worker noticed. Now the hourly tick writes the metric,
// files one issue on a real stall (120 minutes since 1.25.5, 12h before + last 2 generation runs failed), never twice, and closes it when a piece lands.
// COMPANION-STALL-YIELD-1 (1.37.0, agent_issues 100064): one piece no longer closes the issue (99975 was closed at 04:04:54Z and 100064 filed at 07:00:43Z),
// the 120-minute boundary is judged on exact minutes, and the digest quotes a model-call error only from the last 24 h.
// Run: node personal-companion/stall-detector.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { importWorker } from "./_harness-import-worker.mjs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await importWorker(() => (src.replace(IMPORT, "var WorkflowEntrypoint = class {};")), new URL("./", import.meta.url));
const { companionStallDetector } = mod;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const wrap = (db) => ({ prepare(sql) { const mk = (args) => ({ bind: (...a) => mk(a),
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  first: async () => db.prepare(sql).get(...args) || null, all: async () => ({ results: db.prepare(sql).all(...args) }) }); return mk([]); } });
function setup() {
  const p = new DatabaseSync(":memory:"), a = new DatabaseSync(":memory:");
  p.exec("CREATE TABLE companion_pieces (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, created_at TEXT); CREATE TABLE companion_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_at TEXT, form TEXT, model TEXT, topic TEXT, status TEXT, detail TEXT)");
  a.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER, close_channel TEXT); CREATE TABLE issue_triage (issue_id INTEGER, close_evidence TEXT); CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT)");
  a.exec("INSERT INTO metric_registry (metric) VALUES ('companion_hours_since_last_piece')");
  return { p, a, env: { PERSONAL: wrap(p), AUDIT: wrap(a) } };
}
const NOW = Date.parse("2026-10-07T08:00:00Z");
// stalled: last piece 48h ago, 2 failed runs
{
  const T = setup();
  T.p.exec("INSERT INTO companion_pieces (slug, created_at) VALUES ('old', '2026-10-05T08:06:54.619Z')");
  T.p.exec("INSERT INTO companion_runs (run_at, form, model, topic, status, detail) VALUES ('2026-10-07T04:01Z','essay','deepseek-reasoner','a','failed','no piece survived the gate'), ('2026-10-07T07:01Z','steward','','steward','alert','collapse'), ('2026-10-07T08:01Z','essay','deepseek-reasoner','b','failed','no piece survived the gate'), ('2026-10-07T08:01Z','essay','deepseek-reasoner','b','stage','composed 0 err: deepseek-reasoner: HTTP 402 Insufficient Balance')");
  const r = await companionStallDetector(T.env, NOW);
  ok(r.filed === true, "files on a real stall: " + JSON.stringify(r));
  const iss = T.a.prepare("SELECT * FROM agent_issues").all();
  ok(iss.length === 1 && /48h/.test(iss[0].title) && /HTTP 402/.test(iss[0].description), "issue names hours and the call error");
  ok(T.a.prepare("SELECT last_value FROM metric_registry").get().last_value === "47.9", "metric written");
  await companionStallDetector(T.env, NOW + 36e5);
  ok(T.a.prepare("SELECT count(*) n FROM agent_issues").get().n === 1, "never files twice");
  // recovery: ONE new piece is not a recovery (COMPANION-STALL-YIELD-1), a second one inside the last 24 h is
  T.p.exec("INSERT INTO companion_pieces (slug, created_at) VALUES ('new', '2026-10-07T08:30:00Z')");
  T.a.exec("INSERT INTO issue_triage (issue_id) VALUES (1)");
  const r1 = await companionStallDetector(T.env, NOW + 36e5);
  ok(r1.closed === 0 && r1.held === 1 && T.a.prepare("SELECT status FROM agent_issues").get().status === "open", "a single new piece after the stall keeps the issue open: " + JSON.stringify(r1));
  T.p.exec("INSERT INTO companion_pieces (slug, created_at) VALUES ('newer', '2026-10-07T09:20:00Z')");
  const r2 = await companionStallDetector(T.env, NOW + 36e5 + 25 * 6e4);
  ok(r2.closed === 1, "closes once a second piece landed: " + JSON.stringify(r2));
  const row = T.a.prepare("SELECT status, close_channel FROM agent_issues").get();
  ok(row.status === "closed" && row.close_channel === "auto-recovery", "closed with auto-recovery");
  const evid = T.a.prepare("SELECT close_evidence FROM issue_triage").get().close_evidence;
  ok(/piece newer/.test(evid) && /piece new created/.test(evid), "close evidence names both pieces: " + evid);
}
// not stalled: old piece but a recent run succeeded
{
  const T = setup();
  T.p.exec("INSERT INTO companion_pieces (slug, created_at) VALUES ('old', '2026-10-06T08:00:00Z')");
  T.p.exec("INSERT INTO companion_runs (run_at, form, model, topic, status, detail) VALUES ('2026-10-07T04:01Z','essay','x','a','failed','g'), ('2026-10-07T08:01Z','essay','x','b','ok','slug')");
  const r = await companionStallDetector(T.env, NOW);
  ok(!r.filed && T.a.prepare("SELECT count(*) n FROM agent_issues").get().n === 0, "a recent ok run is not a stall");
}
// fresh piece: no issue, metric under threshold
{
  const T = setup();
  T.p.exec("INSERT INTO companion_pieces (slug, created_at) VALUES ('x', '2026-10-07T07:00:00Z')");
  const r = await companionStallDetector(T.env, NOW);
  ok(r.hours === 1 && r.closed === 0, "fresh piece: " + JSON.stringify(r));
}
// SLA-120M-COMPANION-1 (1.25.5): the stall SLA is 120 minutes, so a 3 h old piece is past it (no issue without two failed runs)
{
  const T = setup();
  T.p.exec("INSERT INTO companion_pieces (slug, created_at) VALUES ('x', '2026-10-07T05:00:00Z')");
  const r = await companionStallDetector(T.env, NOW);
  ok(r.hours === 3 && r.closed === undefined && r.stalled === false, "a 3 h old piece is past the 120-minute SLA and is judged on the last runs: " + JSON.stringify(r));
}
// PUBLISH-STALL-DIGEST-1 (1.19.0): the open issue is rewritten every stalled tick (hours, 24 h stage digest, newest rejections),
// turns critical after 24 h, and a second issue is never inserted (agent_issues 2222 kept "13h" for 73 h with no stage breakdown)
{
  const V = mod.__verify;
  ok(V.stallAttemptStage("critique objection=3 :: weak") === "critique" && V.stallAttemptStage("fact-check factcheck: unsupported claim: x") === "fact-check"
    && V.stallAttemptStage("validate: notes length 1007; banned: testament to || raw: ...") === "validate-banned" && V.stallAttemptStage("validate: notes length 1082 || in context:") === "validate-length"
    && V.stallAttemptStage("validate: grounding: name not in the source: X || raw") === "validate-grounding" && V.stallAttemptStage("time budget spent after 4 attempts") === "time budget"
    && V.stallAttemptStage("duplicate title: x") === "other", "each attempt maps to its stage");
  ok(V.companionStallDigest([{ detail: "critique a=1 :: x" }, { detail: "validate: notes length 9" }, { detail: "validate: notes length 8" }]) === "validate-length 2, critique 1", "the digest counts stages, most first");
  const T = setup();
  T.p.exec("INSERT INTO companion_pieces (slug, created_at) VALUES ('old', '2026-10-04T08:00:00Z')");
  T.p.exec("INSERT INTO companion_runs (run_at, form, model, topic, status, detail) VALUES ('2026-10-07T04:05Z','notes','m','a','rejected','validate: notes length 1007; banned: testament to || raw: x'), ('2026-10-07T04:06Z','notes','m','a','rejected','critique objection=3 :: weak'), ('2026-10-07T04:07Z','notes','m','a','stage','time budget spent after 4 attempts'), ('2026-10-07T04:07Z','notes','m','a','failed','no piece survived the gate'), ('2026-10-07T07:05Z','notes','m','b','rejected','fact-check factcheck: unsupported claim: iron tools -- not in source'), ('2026-10-07T07:06Z','notes','m','b','failed','no piece survived the gate'), ('2026-10-05T07:06Z','notes','m','z','rejected','critique old :: outside the 24 h window')");
  T.a.exec("INSERT INTO agent_issues (title, description, priority, status, created_at, updated_at) VALUES ('COMPANION-PUBLISH-STALL-AUTO-1: reading.q08.org published nothing for 13h; last 2 generation runs failed', 'old text', 'high', 'open', 1, 1)");
  const r = await companionStallDetector(T.env, NOW);
  const rows = T.a.prepare("SELECT * FROM agent_issues").all();
  ok(r.updated === true && rows.length === 1, "the open issue is updated, not a second one inserted: " + JSON.stringify(r));
  ok(/published nothing for 72h/.test(rows[0].title) && rows[0].priority === "critical", "title carries the current hours and priority is critical after 24 h: " + rows[0].title + " " + rows[0].priority);
  ok(/validate-banned 1/.test(rows[0].description) && /critique 1/.test(rows[0].description) && /fact-check 1/.test(rows[0].description) && /time budget 1/.test(rows[0].description) && !/outside the 24 h window/.test(rows[0].description), "the description carries the 24 h stage digest only", rows[0].description);
  ok(/Newest rejections: #\d+ fact-check: fact-check factcheck: unsupported claim: iron tools/.test(rows[0].description) && /2 failed or blocked runs/.test(rows[0].description), "and the newest rejection details");
  ok(!/old text/.test(rows[0].description) && rows[0].updated_at === NOW, "the old text is replaced and updated_at moves");
  // a 14h stall with no open issue inserts one at high priority
  const T2 = setup();
  T2.p.exec("INSERT INTO companion_pieces (slug, created_at) VALUES ('old', '2026-10-06T18:00:00Z')");
  T2.p.exec("INSERT INTO companion_runs (run_at, form, model, topic, status, detail) VALUES ('2026-10-07T04:01Z','essay','m','a','failed','g'), ('2026-10-07T07:01Z','essay','m','b','failed','g')");
  const r2 = await companionStallDetector(T2.env, NOW);
  const i2 = T2.a.prepare("SELECT * FROM agent_issues").all();
  ok(r2.filed === true && i2.length === 1 && i2[0].priority === "high", "under 24 h: one new issue at high priority");
  ok(!/catch \(eM\) \{\}|\.catch\(function \(\) \{\}\)/.test(src.slice(src.indexOf("async function companionStallDetector"), src.indexOf("async function companionStallDetector") + 6000)), "no swallowed catch in the stall detector");
}
// ---- COMPANION-STALL-YIELD-1 (1.37.0, agent_issues 100064) ------------------------------------------------------------------
{
  ok(mod.__verify.STALL_MIN === 120 && /var STALL_MIN = 120;/.test(src), "STALL_MIN is 120 minutes (PR 2745 had raised it to 180)");
  const iso = (ms) => new Date(ms).toISOString();
  const withIssue = async (pieces, nowMs) => {
    const T = setup();
    pieces.forEach(([slug, at]) => T.p.exec("INSERT INTO companion_pieces (slug, created_at) VALUES ('" + slug + "', '" + at + "')"));
    T.a.exec("INSERT INTO agent_issues (title, description, priority, status, created_at, updated_at) VALUES ('COMPANION-PUBLISH-STALL-AUTO-1: reading.q08.org published nothing for 13h; last 2 generation runs failed', 'x', 'high', 'open', 1, 1)");
    T.a.exec("INSERT INTO issue_triage (issue_id) VALUES (1)");
    const r = await companionStallDetector(T.env, nowMs);
    return { T, r, status: T.a.prepare("SELECT status FROM agent_issues").get().status };
  };
  // the 120-minute boundary is judged on exact minutes: 119 closes, 121 does not (the rounded 2.0 h of 119 minutes would have kept it open)
  const two = (ageMin) => [["earlier", iso(NOW - 5 * 36e5)], ["latest", iso(NOW - ageMin * 6e4)]];
  const r119 = await withIssue(two(119), NOW);
  ok(r119.r.closed === 1 && r119.status === "closed", "a piece 119 minutes old with a second piece in 24 h closes the issue: " + JSON.stringify(r119.r));
  const r121 = await withIssue(two(121), NOW);
  ok(r121.r.closed === undefined && r121.status === "open", "a piece 121 minutes old does not: " + JSON.stringify(r121.r));
  // one piece is not a recovery: the second newest piece is 30 h old, then 23 h old
  const old30 = await withIssue([["old", iso(NOW - 30 * 36e5)], ["latest", iso(NOW - 10 * 6e4)]], NOW);
  ok(old30.r.closed === 0 && old30.r.held === 1 && old30.status === "open", "one fresh piece with the previous one 30 h old keeps the issue open: " + JSON.stringify(old30.r));
  const old23 = await withIssue([["old", iso(NOW - 23 * 36e5)], ["latest", iso(NOW - 10 * 6e4)]], NOW);
  ok(old23.r.closed === 1 && old23.status === "closed", "with the previous piece 23 h old it closes: " + JSON.stringify(old23.r));
  const only = await withIssue([["only", iso(NOW - 10 * 6e4)]], NOW);
  ok(only.r.closed === 0 && only.status === "open", "a lone piece in the whole table does not close it: " + JSON.stringify(only.r));
  // no open issue: nothing is held or closed and the metric still moves
  const T0 = setup();
  T0.p.exec("INSERT INTO companion_pieces (slug, created_at) VALUES ('only', '" + iso(NOW - 10 * 6e4) + "')");
  const r0 = await companionStallDetector(T0.env, NOW);
  ok(r0.closed === 0 && r0.held === undefined && T0.a.prepare("SELECT last_value FROM metric_registry").get().last_value === "0.2", "with no open issue there is nothing to hold: " + JSON.stringify(r0));
  // the held issue is refreshed by the stalled branch once the newest piece ages past 120 minutes and the last two runs failed: one issue, no refile
  const T1 = setup();
  T1.p.exec("INSERT INTO companion_pieces (slug, created_at) VALUES ('only', '" + iso(NOW - 3 * 36e5) + "')");
  T1.p.exec("INSERT INTO companion_runs (run_at, form, model, topic, status, detail) VALUES ('2026-10-07T06:01Z','essay','m','a','failed','no piece survived the gate'), ('2026-10-07T07:01Z','essay','m','b','failed','no piece survived the gate')");
  T1.a.exec("INSERT INTO agent_issues (title, description, priority, status, created_at, updated_at) VALUES ('COMPANION-PUBLISH-STALL-AUTO-1: reading.q08.org published nothing for 1h; last 2 generation runs failed', 'old', 'high', 'open', 1, 1)");
  const r1b = await companionStallDetector(T1.env, NOW);
  ok(r1b.updated === true && T1.a.prepare("SELECT count(*) n FROM agent_issues").get().n === 1 && /younger than 120 minutes and a second piece/.test(T1.a.prepare("SELECT description FROM agent_issues").get().description), "the same issue is refreshed, not refiled, and says when it closes: " + JSON.stringify(r1b));
}
{
  // the digest's "latest model-call error" is read from the same 24 h window as the rest of the digest
  const mk = (rows) => {
    const T = setup();
    T.p.exec("INSERT INTO companion_pieces (slug, created_at) VALUES ('old', '2026-10-05T08:06:54.619Z')");
    T.p.exec("INSERT INTO companion_runs (run_at, form, model, topic, status, detail) VALUES ('2026-10-07T04:01Z','essay','m','a','failed','no piece survived the gate'), ('2026-10-07T07:01Z','essay','m','b','failed','no piece survived the gate')");
    rows.forEach(([at, d]) => T.p.exec("INSERT INTO companion_runs (run_at, form, model, topic, status, detail) VALUES ('" + at + "','essay','m','b','stage','" + d + "')"));
    return T;
  };
  const stale = mk([["2026-10-05T14:05Z", "composed 0 err: m: monthly-150 spend limit reached"]]);
  await companionStallDetector(stale.env, NOW);
  const d1 = stale.a.prepare("SELECT description FROM agent_issues").get().description;
  ok(!/monthly-150/.test(d1) && !/Latest model-call error/.test(d1), "an error row older than 24 h is not quoted: " + d1.slice(0, 400));
  const fresh = mk([["2026-10-05T14:05Z", "composed 0 err: m: monthly-150 spend limit reached"], ["2026-10-07T06:30Z", "composed 0 err: m: HTTP 429 rate limited"]]);
  await companionStallDetector(fresh.env, NOW);
  const d2 = fresh.a.prepare("SELECT description FROM agent_issues").get().description;
  ok(/Latest model-call error \(last 24 h\): composed 0 err: m: HTTP 429/.test(d2) && !/monthly-150/.test(d2), "the newest error inside the window is quoted, the old one is not: " + d2.slice(0, 600));
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
