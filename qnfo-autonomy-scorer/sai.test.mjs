// SAI-COMPOSITE-WEIGHTS-1 (issue 1739) offline suite for qnfo-autonomy-scorer.
// Proves, without network or a live D1:
//   1. PARITY: the scorer's computeSai returns exactly what qnfo-fleet-dashboard computeSai returns (the dashboard's
//      function is sliced out of its own source), on a live-shaped fixture and on 400 seeded random inputs. A formula
//      change in either worker fails here until the other follows.
//   2. WEIGHTS MOVE THE SAI: changing a w_* in sai_config changes the computed SAI by exactly sum(dw x term).
//   3. DoD REPLAY: run() against an in-memory SQLite D1. Run 1 at the pre-revision weights, a ratified revision is
//      applied (sai_config updated, objective_revision_applies outcome=applied), run 2 publishes a different
//      survival_state.sai and sai_weighted row while the unweighted mean (overall) is unchanged; the post-deploy DoD SQL
//      from the issue report returns moved=1.
//   4. FAIL CLOSED + WHAT-IF: a stale dashboard state or a missing weight writes survival_state.sai NULL and an alert;
//      /preview?w_*=x shows the what-if SAI next to the live one and writes nothing.
// Run: node qnfo-autonomy-scorer/sai.test.mjs   (or node --test qnfo-autonomy-scorer/sai.test.mjs). Needs Node 22.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const scorerSrc = readFileSync(join(here, "worker.js"), "utf8");
const S = await import("data:text/javascript;base64," + Buffer.from(scorerSrc + "\nexport { computeSai, weightedSai, saiRow, parseWhatIf, mergeDims, composite, run, SAI_TERMS, VERSION };\n").toString("base64"));
const worker = S.default;

// The dashboard's computeSai, sliced verbatim from its bundle (its only free symbol is the esbuild __name222 helper).
const dashSrc = readFileSync(join(here, "..", "qnfo-fleet-dashboard", "worker.js"), "utf8");
const A0 = dashSrc.indexOf("function computeSai(st, bench, cfg, live) {");
const A1 = dashSrc.indexOf('__name(computeSai, "computeSai");', A0);
assert.ok(A0 >= 0 && A1 > A0, "computeSai found in qnfo-fleet-dashboard/worker.js");
const dashComputeSai = new Function("__name222", dashSrc.slice(A0, A1) + "\nreturn computeSai;")((f) => f);

// Live sai_config on 2026-10-02 (qnfo-audit), weights after goal 58 (OBJECTIVE-REVISION-APPLY-1, 2026-10-01 21:06).
const PARAMS = { uf_step: 0.15, lh_probe: 0.4, lh_chain: 0.4, lh_norun: 0.2, lh_norun_penalty: 0.5, aut_user: 0.5, aut_loop: 0.5, autonomy_ceiling: 0.7,
  thinking_base: 0.5, thinking_scale: 0.5, kaizen_step: 0.05, si_kaizen: 0.3, si_closure: 0.2, si_heal: 0.5, rel_probe: 0.5, rel_err: 0.3, rel_err_step: 0.25,
  rel_warn: 0.2, rel_warn_step: 0.1, drift_step: 0.05, island_step: 0.01, density_mult: 8, st_chain: 0.4, st_drift: 0.3, st_drift_w: 0.5, st_island_w: 0.5,
  st_density: 0.3, int_struct: 0.6, int_sys: 0.4, gov_user: 0.5, gov_pol_w: 0.5, gov_policy: 0.8 };
const W_POST58 = { w_autonomy: 0.15, w_thinking: 0.15, w_decision: 0.15, w_self_improv: 0.2, w_reliability: 0.1, w_integration: 0.1, w_external_impact: 0.1, w_governance: 0.05 };
const SAI_W_TERMS = ["w_autonomy", "w_thinking", "w_decision", "w_self_improv", "w_reliability", "w_integration", "w_external_impact", "w_governance"];
const W_PRE58 = Object.assign({}, W_POST58, { w_autonomy: 0.2, w_self_improv: 0.15 });
// fleet_dashboard_state on 2026-10-02 02:46Z, reduced to the fields computeSai reads.
function liveState(generatedAt) {
  return {
    generated_at: generatedAt,
    probes: Array.from({ length: 43 }, () => ({ ok: true })),
    issues: [{ sev: "warn" }, { sev: "warn" }],
    chains: Array.from({ length: 11 }, () => ({ state: "ok" })),
    scheduled: Array.from({ length: 35 }, () => ({ status: "OK" })),
    integration: { islands: [], drift: { ghost: 0, unregistered: 0, unversioned: 0 }, density_contract: 0.167, density: 0.0322, system: { score: { total: 85 } } },
    audits: [{ key: "agent_issues", detail: "25 open of 1711" }, { key: "register", detail: "0 open (v_waiting_on_human=0)" }]
  };
}
const LIVE = { dims: { independent_decision: 4.0, ooda_closure: 4.1, s3_control: 4.8, s5_policy: 2.1 }, closureRate: (1711 - 25) / 1711, healRate: 1959 / 3871, externalImpact: 0.24241379310344824 };
const pick = (r) => JSON.stringify({ sai: r.sai, scores: r.scores, config_missing: r.config_missing, decision_source: r.decision_source, signals: r.signals, weights_source: r.weights_source });

test("parity on the live-shaped fixture: scorer computeSai === dashboard computeSai", () => {
  for (const W of [W_POST58, W_PRE58]) {
    const cfg = Object.assign({}, PARAMS, W);
    const d = dashComputeSai(liveState("2026-10-02T02:46:04.504Z"), 0.2, cfg, LIVE);
    const s = S.computeSai(liveState("2026-10-02T02:46:04.504Z"), 0.2, cfg, LIVE);
    assert.equal(pick(s), pick(d));
    assert.ok(d.sai > 0 && d.sai < 100, "a real 0-100 SAI: " + d.sai);
  }
});

test("parity on 400 seeded random inputs (missing weights, NO-RUN crons, err issues, absent signals)", () => {
  let seed = 1739;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (n) => Math.floor(rnd() * n);
  const many = (n, f) => Array.from({ length: int(n) }, f);
  for (let k = 0; k < 400; k++) {
    const st = {
      probes: many(50, () => ({ ok: rnd() < 0.85 })),
      issues: many(8, () => ({ sev: ["err", "warn", "info"][int(3)] })),
      chains: many(12, () => ({ state: rnd() < 0.8 ? "ok" : "warn" })),
      scheduled: many(40, () => ({ status: rnd() < 0.9 ? "OK" : "NO-RUN" })),
      integration: rnd() < 0.1 ? undefined : { islands: many(4, () => ({})), drift: rnd() < 0.2 ? undefined : { ghost: int(3), unregistered: int(2), unversioned: int(2) },
        density_contract: rnd() < 0.5 ? rnd() * 0.3 : 0, density: rnd() * 0.1, system: rnd() < 0.3 ? {} : { score: { total: int(101) } } },
      audits: [rnd() < 0.8 ? { key: "agent_issues", detail: int(60) + " open of 1700" } : { key: "agent_issues", detail: "unavailable" },
        rnd() < 0.8 ? { key: "register", detail: "x (v_waiting_on_human=" + int(5) + ")" } : null]
    };
    const raw = SAI_W_TERMS.map(() => rnd());
    const tot = raw.reduce((a, b) => a + b, 0);
    const cfg = Object.assign({}, PARAMS);
    SAI_W_TERMS.forEach((t, i) => { cfg[t] = raw[i] / tot; });
    if (rnd() < 0.05) delete cfg[SAI_W_TERMS[int(8)]];
    const dims = {};
    ["independent_decision", "ooda_closure", "s3_control", "s5_policy"].forEach((d) => { if (rnd() < 0.8) dims[d] = Math.round(rnd() * 50) / 10; });
    const live = { dims, closureRate: rnd() < 0.9 ? rnd() : null, healRate: rnd() < 0.9 ? rnd() : null, externalImpact: rnd() < 0.8 ? rnd() * 1.4 - 0.2 : undefined };
    const bench = rnd() < 0.9 ? rnd() * 1.4 - 0.2 : "n/a";
    assert.equal(pick(S.computeSai(st, bench, cfg, live)), pick(dashComputeSai(st, bench, cfg, live)), "case " + k);
  }
});

test("changing a weight in sai_config changes the computed SAI by exactly sum(dw x term)", () => {
  const now = Date.parse("2026-10-02T03:00:00Z");
  const merged = {}; Object.keys(LIVE.dims).forEach((k) => { merged[k] = { score: LIVE.dims[k] }; });
  const inp = (W) => ({ cfg: Object.assign({}, PARAMS, W), state: liveState("2026-10-02T02:46:04.504Z"), state_at: "2026-10-02T02:46:04.504Z", bench: 0.2, closureRate: LIVE.closureRate, healRate: LIVE.healRate, externalImpact: LIVE.externalImpact });
  const post = S.weightedSai(inp(W_POST58), merged, now, null);
  const pre = S.weightedSai(inp(W_PRE58), merged, now, null);
  assert.ok(post.ok && pre.ok, "both measured");
  assert.notEqual(post.sai, pre.sai, "0-5 SAI moves with the weights: " + pre.sai + " -> " + post.sai);
  assert.notEqual(post.sai_100, pre.sai_100, "0-100 SAI moves with the weights: " + pre.sai_100 + " -> " + post.sai_100);
  const expected = 100 * (0.05 * post.scores.self_improv - 0.05 * post.scores.autonomy);
  const raw = (W) => S.computeSai(liveState(""), 0.2, Object.assign({}, PARAMS, W), LIVE).sai_raw;
  assert.ok(Math.abs((raw(W_POST58) - raw(W_PRE58)) - expected) < 1e-9, "delta is the weighted term difference " + expected);
  assert.equal(post.sai, Math.round(raw(W_POST58) / 20 * 100) / 100, "0-5 scale is SAI/20 at 2 decimals");
  // the terms do not depend on the weights; only the weighted sum does
  assert.deepEqual(pre.scores, post.scores);
  // a what-if override reaches the same number as editing sai_config
  const wi = S.weightedSai(inp(W_POST58), merged, now, { w_autonomy: 0.2, w_self_improv: 0.15 });
  assert.equal(wi.sai, pre.sai);
  // and the matching dashboard SAI (0-100) is the scorer's sai_100
  assert.equal(post.sai_100, dashComputeSai(liveState(""), 0.2, Object.assign({}, PARAMS, W_POST58), LIVE).sai);
});

test("the derived rows never feed the mean: sai_weighted and overall are excluded from composite()", () => {
  const now = Date.parse("2026-10-02T05:17:00Z");
  const cur = [{ dimension: "novelty", score: 3.5, next_score: "2026-10-10" }, { dimension: "overall", score: 0.1, next_score: "2026-10-03" }];
  const a = S.composite([{ dimension: "s3_control", score: 4.5 }], cur, now);
  const b = S.composite([{ dimension: "s3_control", score: 4.5 }], cur.concat([{ dimension: "sai_weighted", score: 0.2, next_score: "2026-10-03" }]), now);
  assert.equal(a.score, 4);
  assert.equal(b.score, a.score);
  assert.ok(!("sai_weighted" in S.mergeDims([], cur.concat([{ dimension: "sai_weighted", score: 1 }]), now)));
});

test("a NULL-scored decision dimension is skipped by the SAI, as the dashboard's liveSaiInputs skips it", () => {
  const now = Date.parse("2026-10-02T03:00:00Z");
  const inp = { cfg: Object.assign({}, PARAMS, W_POST58), state: liveState(""), state_at: "2026-10-02T02:46:04.504Z", bench: 0.2, closureRate: LIVE.closureRate, healRate: LIVE.healRate, externalImpact: LIVE.externalImpact };
  const cur = [{ dimension: "independent_decision", score: 4.0, next_score: "2099-01-01" }, { dimension: "s5_policy", score: null, next_score: "2099-01-01" }];
  const got = S.weightedSai(inp, S.mergeDims([], cur, now), now, null);
  const want = dashComputeSai(liveState(""), 0.2, inp.cfg, { dims: { independent_decision: 4.0 }, closureRate: LIVE.closureRate, healRate: LIVE.healRate, externalImpact: LIVE.externalImpact });
  assert.equal(got.sai_100, want.sai);
  assert.equal(got.scores.decision, 0.8, "decision = 4.0 / 5, the NULL row is not a 0");
});

test("parseWhatIf accepts only w_<term> in [0,1] and ignores other parameters", () => {
  const ok = S.parseWhatIf(new URL("https://x/preview?w_autonomy=0.20&w_self_improv=0.15&_=123").searchParams);
  assert.deepEqual(JSON.parse(JSON.stringify(ok)), { weights: { w_autonomy: 0.2, w_self_improv: 0.15 }, bad: [] });
  assert.deepEqual(S.parseWhatIf(new URL("https://x/preview?w_charisma=0.2&w_autonomy=1.5&w_thinking=").searchParams).bad, ["w_charisma", "w_autonomy", "w_thinking"]);
  assert.equal(S.parseWhatIf(new URL("https://x/preview").searchParams).weights, null);
});

// ---------- DoD replay against an in-memory SQLite D1 ----------
function makeDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE fleet_deploys (ts TEXT, ok INTEGER);
CREATE TABLE worker_live_audit (worker TEXT, note TEXT, http INTEGER);
CREATE TABLE self_heal_actions (ts TEXT, status TEXT, verified_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, status TEXT);
CREATE TABLE research_queue (published_at TEXT);
CREATE TABLE freshness_guard (status TEXT);
CREATE TABLE guard_registry (status TEXT);
CREATE TABLE signals (created_at TEXT, ts TEXT, status TEXT);
CREATE TABLE impact_thresholds (metric TEXT, state TEXT);
CREATE TABLE issue_triage (issue_id INTEGER, sla_due_at TEXT, remediation TEXT);
CREATE TABLE autonomy_scores (dimension TEXT PRIMARY KEY, framework TEXT, score REAL, scale TEXT, evidence TEXT, gap TEXT, confidence TEXT, scored_at TEXT, next_score TEXT);
CREATE TABLE survival_state (id INTEGER PRIMARY KEY CHECK (id=1), ts TEXT, sai REAL, survival_score REAL, graded_score REAL, gates_json TEXT, leading_json TEXT, note TEXT);
CREATE TABLE fleet_heartbeat (worker TEXT PRIMARY KEY, version TEXT, ts TEXT, ok INTEGER);
CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, level TEXT, message TEXT);
CREATE TABLE sai_config (k TEXT PRIMARY KEY, v REAL, source TEXT, updated_at TEXT);
CREATE TABLE fleet_dashboard_state (id INTEGER PRIMARY KEY, updated_at TEXT, state_json TEXT, refresh_ms INTEGER);
CREATE TABLE report_card_inputs (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE objective_revision_applies (goal_id INTEGER PRIMARY KEY, outcome TEXT NOT NULL, detail TEXT, before_json TEXT, after_json TEXT, issue_id INTEGER, via TEXT, applied_at TEXT DEFAULT (datetime('now')));`);
  const nowMs = Date.now();
  const ins = (sql, rows) => { const p = db.prepare(sql); rows.forEach((r) => p.run(...r)); };
  ins("INSERT INTO fleet_deploys (ts, ok) VALUES (datetime('now','-1 day'), ?)", [[1], [1], [1], [0]]);
  ins("INSERT INTO worker_live_audit (worker, note, http) VALUES (?, ?, ?)", [["a", "SYNC", 200], ["b", "SYNC", 200], ["c", "DRIFT", 200], ["d", "CRON_ONLY", null]]);
  ins("INSERT INTO self_heal_actions (ts, status, verified_at) VALUES (datetime('now','-1 day'), ?, ?)", [["healed", "x"], ["resolved", "x"], ["failed", null], ["no-action", null]]);
  ins("INSERT INTO agent_issues (title, status, created_at, updated_at) VALUES (?, ?, ?, ?)", [["a", "open", nowMs - 1e6, nowMs - 1e6], ["b", "closed", nowMs - 2e6, nowMs - 1e6], ["c", "closed", nowMs - 9e9, nowMs - 9e9], ["d", "wontfix", nowMs - 9e9, nowMs - 9e9]]);
  ins("INSERT INTO issue_triage (issue_id, sla_due_at) VALUES (?, ?)", [[1, "2099-01-01T00:00:00Z"]]);
  ins("INSERT INTO research_queue (published_at) VALUES (datetime('now','-2 day'))", [[]]);
  ins("INSERT INTO freshness_guard (status) VALUES (?)", [["fresh"], ["fresh"], ["stale"]]);
  ins("INSERT INTO guard_registry (status) VALUES (?)", [["verified"], ["verified"]]);
  ins("INSERT INTO signals (created_at, ts, status) VALUES (datetime('now','-1 day'), NULL, ?)", [["triaged"], ["new"]]);
  ins("INSERT INTO impact_thresholds (metric, state) VALUES (?, ?)", [["m1", "MET"], ["m2", "OPEN"], ["m3", "RETIRED"]]);
  ins("INSERT INTO autonomy_scores (dimension, framework, score, scale, scored_at, next_score) VALUES (?, ?, ?, '0-5', '2026-09-15', '2099-01-01')", [["independent_decision", "AGI-LoA", 4.0], ["novelty", "fleet", 3.5]]);
  ins("INSERT INTO survival_state (id, ts, sai, survival_score) VALUES (1, '2026-10-02 02:46:09', 4.1, ?)", [[0.24241379310344824]]);
  ins("INSERT INTO report_card_inputs (key, value) VALUES ('arc_agi_10task_pass_rate', ?)", [["0.2"]]);
  const cfg = Object.assign({}, PARAMS, W_PRE58);
  ins("INSERT INTO sai_config (k, v, source) VALUES (?, ?, 'seed')", Object.keys(cfg).map((k) => [k, cfg[k]]));
  return db;
}
function d1(db) {
  const stmt = (sql) => {
    let args = [];
    const self = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return self; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
    };
    return self;
  };
  return { prepare: stmt, async batch(list) { db.exec("BEGIN"); try { const out = []; for (const s of list) out.push(await s.run()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}
const setState = (db, atMs) => db.prepare("INSERT INTO fleet_dashboard_state (id, updated_at, state_json, refresh_ms) VALUES (1, ?1, ?2, 7000) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, state_json=excluded.state_json")
  .run(new Date(atMs).toISOString(), JSON.stringify(liveState(new Date(atMs).toISOString())));
const sqlTs = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);
// The post-deploy DoD check given in the issue report, verbatim.
const DOD_SQL = `SELECT a.goal_id, a.applied_at,
  (SELECT score FROM autonomy_score_history WHERE dimension='sai_weighted' AND ts < CAST(strftime('%s', a.applied_at) AS INTEGER) * 1000 ORDER BY ts DESC LIMIT 1) AS sai_before,
  (SELECT score FROM autonomy_score_history WHERE dimension='sai_weighted' AND ts >= CAST(strftime('%s', a.applied_at) AS INTEGER) * 1000 ORDER BY ts ASC LIMIT 1) AS sai_after,
  (SELECT sai FROM survival_state WHERE id = 1) AS survival_sai,
  (SELECT score FROM autonomy_scores WHERE dimension = 'sai_weighted') AS sai_weighted_now
FROM objective_revision_applies a WHERE a.outcome = 'applied' ORDER BY a.applied_at DESC LIMIT 1`;

async function atTime(ms, fn) {
  const real = Date.now;
  Date.now = () => ms;
  try { return await fn(); } finally { Date.now = real; }
}
const T1 = Date.parse("2026-10-03T05:17:00Z"), T2 = T1 + 86400000;

test("DoD replay: a ratified weight revision moves survival_state.sai and sai_weighted on the next run; the mean does not move", async () => {
  const db = makeDb();
  const env = { AUDIT: d1(db) };
  setState(db, T1 - 10 * 60000);
  let waited = null;
  await atTime(T1, async () => { await worker.scheduled({}, env, { waitUntil(p) { waited = p; } }); await waited; });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM alerts").get().n, 0, "run 1 raised no alert");
  const s1 = db.prepare("SELECT sai FROM survival_state WHERE id=1").get().sai;
  const w1 = db.prepare("SELECT score, evidence FROM autonomy_scores WHERE dimension='sai_weighted'").get();
  const m1 = db.prepare("SELECT score FROM autonomy_scores WHERE dimension='overall'").get().score;
  assert.equal(s1, w1.score, "survival_state.sai mirrors the sai_weighted row");
  assert.ok(s1 > 0 && s1 < 5 && s1 !== m1, "weighted SAI " + s1 + " is not the unweighted mean " + m1);
  assert.match(w1.evidence, /autonomy 0\.2 x /);

  // OBJECTIVE-REVISION-APPLY-1 applies goal 58 between the two scorer runs.
  db.prepare("UPDATE sai_config SET v = 0.15 WHERE k = 'w_autonomy'").run();
  db.prepare("UPDATE sai_config SET v = 0.20 WHERE k = 'w_self_improv'").run();
  db.prepare("INSERT INTO objective_revision_applies (goal_id, outcome, via, applied_at) VALUES (58, 'applied', 'test', ?)").run(sqlTs(T1 + 3600000));
  setState(db, T2 - 10 * 60000);
  await atTime(T2, () => S.run(env, true));
  const s2 = db.prepare("SELECT sai FROM survival_state WHERE id=1").get().sai;
  const m2 = db.prepare("SELECT score FROM autonomy_scores WHERE dimension='overall'").get().score;
  assert.notEqual(s2, s1, "survival_state.sai moved: " + s1 + " -> " + s2);
  assert.equal(m2, m1, "the unweighted mean is untouched by a weight revision");
  assert.match(db.prepare("SELECT evidence FROM autonomy_scores WHERE dimension='sai_weighted'").get().evidence, /autonomy 0\.15 x .*self_improv 0\.2 x /);

  const dod = db.prepare(DOD_SQL).get();
  assert.equal(dod.goal_id, 58);
  assert.equal(dod.sai_before, s1);
  assert.equal(dod.sai_after, s2);
  assert.equal(dod.survival_sai, s2);
  assert.notEqual(dod.sai_before, dod.sai_after, "the DoD query sees the move");
});

test("fail closed: a stale dashboard state or a missing weight writes survival_state.sai NULL, keeps sai_weighted, alerts", async () => {
  const db = makeDb();
  const env = { AUDIT: d1(db) };
  setState(db, T1 - 5 * 60000);
  await atTime(T1, () => S.run(env, true));
  const good = db.prepare("SELECT score, scored_at FROM autonomy_scores WHERE dimension='sai_weighted'").get();
  assert.ok(good && good.score > 0);
  // dashboard stopped refreshing 7h before the next run
  setState(db, T2 - 7 * 3600000);
  const out = await atTime(T2, () => S.run(env, true));
  assert.equal(out.sai.ok, false);
  assert.match(out.sai.reason, /min old/);
  assert.equal(db.prepare("SELECT sai FROM survival_state WHERE id=1").get().sai, null);
  assert.deepEqual({ ...db.prepare("SELECT score, scored_at FROM autonomy_scores WHERE dimension='sai_weighted'").get() }, { ...good }, "last measured value and its date are kept");
  assert.match(db.prepare("SELECT message FROM alerts ORDER BY id DESC LIMIT 1").get().message, /SAI-COMPOSITE-WEIGHTS-1/);
  assert.ok(db.prepare("SELECT score FROM autonomy_scores WHERE dimension='overall'").get().score > 0, "the measured dims and the mean are still written");
  // a weight removed from sai_config
  db.prepare("DELETE FROM sai_config WHERE k = 'w_governance'").run();
  setState(db, T2 + 86400000 - 60000);
  const out2 = await atTime(T2 + 86400000, () => S.run(env, true));
  assert.equal(out2.sai.ok, false);
  assert.match(out2.sai.reason, /w_governance/);
  assert.equal(db.prepare("SELECT sai FROM survival_state WHERE id=1").get().sai, null);
});

test("GET /preview?w_*=x is a what-if: it reports the SAI with and without the override and writes nothing", async () => {
  const db = makeDb();
  const env = { AUDIT: d1(db) };
  const now = Date.now();
  setState(db, now - 60000);
  const snap = () => JSON.stringify([db.prepare("SELECT k, v FROM sai_config ORDER BY k").all(), db.prepare("SELECT * FROM autonomy_scores ORDER BY dimension").all(), db.prepare("SELECT * FROM survival_state").all()]);
  const before = snap();
  const r = await worker.fetch(new Request("https://scorer/preview?w_autonomy=0.15&w_self_improv=0.20"), env);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.wrote, false);
  assert.equal(j.sai.ok, true);
  assert.equal(j.sai.weights.autonomy, 0.2, "live weights are the seeded pre-revision ones");
  assert.equal(j.what_if.weights.autonomy, 0.15);
  assert.notEqual(j.what_if.sai, j.sai.sai, "the what-if SAI differs");
  assert.equal(j.what_if.delta.sai, Math.round((j.what_if.sai - j.sai.sai) * 100) / 100);
  assert.equal(snap(), before, "nothing was written");
  const bad = await worker.fetch(new Request("https://scorer/preview?w_charisma=0.3"), env);
  assert.equal(bad.status, 400);
  const h = await (await worker.fetch(new Request("https://scorer/health"), env)).json();
  assert.equal(h.version, S.VERSION);
  assert.ok(h.capabilities.includes("sai-weighted"));
});
