// qnfo-autonomy-scorer v1.0.0 - MEASURED autonomy scores, recomputed daily from live audit facts.
// Worker Contract v1: VERSION constant + GET /health.
// WHY: autonomy_scores had no writer anywhere in the repo; every row was hand-entered in an agent session and the
// table went stale (last 2026-09-24). A score nobody recomputes is an assertion, not a measurement.
//
// SCOPE (deliberate): only dimensions that can be derived from data are written. Judgement dimensions
// (s4_intelligence, independent_decision, s5_policy, ooda_closure, watchmaker_inverted, novelty, s1/s2 ...) are NEVER
// touched; when one is past its own next_score date the composite says so instead of pretending it is fresh.
// Every write is a bounded UPSERT of a known dimension plus an append to autonomy_score_history. If the fact query
// fails, nothing is written (fail closed).
var VERSION = "1.0.0-measured";
var WORKER = "qnfo-autonomy-scorer";
var DAY = 86400000;
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function r1(x) { return Math.round(x * 10) / 10; }
function pct(x) { return Math.round(x * 1000) / 10; }
function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
// Pure: facts -> measured dimensions. No I/O, so it is unit-testable.
function scoreFromFacts(f, nowMs) {
  var out = [];
  var depTotal = f.dep_ok + f.dep_fail;
  var depRatio = depTotal > 0 ? f.dep_ok / depTotal : null;
  var syncTotal = f.sync_n + f.drift_n;
  var syncRatio = syncTotal > 0 ? f.sync_n / syncTotal : null;
  if (depRatio !== null && syncRatio !== null) {
    out.push({
      dimension: "s3_control", framework: "VSM",
      score: r1(5 * (0.5 * depRatio + 0.5 * syncRatio)),
      evidence: "MEASURED: canonical deploys last 7d " + f.dep_ok + " ok / " + f.dep_fail + " failed (" + pct(depRatio) + "%); live==repo " + f.sync_n + " SYNC / " + f.drift_n + " DRIFT across deployable workers (" + pct(syncRatio) + "%). score = 5 x (0.5 x deploy_ok + 0.5 x sync).",
      gap: depRatio < syncRatio ? "deploy failures in the last 7d (" + f.dep_fail + ")" : (f.drift_n ? f.drift_n + " worker(s) drifted from repo" : "none measured"),
      confidence: depTotal >= 20 ? "high" : "medium"
    });
  }
  var healActed = f.heal_acted;
  if (healActed > 0) {
    var hr = f.heal_good / healActed;
    var healDim = {
      framework: "fleet", score: r1(5 * hr),
      evidence: "MEASURED: self_heal_actions last 7d, excluding no-action and superseded rows: " + f.heal_good + " of " + healActed + " acted rows verified and not failed (" + pct(hr) + "%).",
      gap: healActed - f.heal_good ? (healActed - f.heal_good) + " acted row(s) unverified or failed" : "none measured",
      confidence: healActed >= 20 ? "high" : "medium"
    };
    out.push(Object.assign({ dimension: "self_healing" }, healDim));
    out.push(Object.assign({ dimension: "self_heal" }, healDim));
  }
  // FM-4: file rate vs close rate, plus absolute backlog pressure against a ceiling of 50 open issues.
  var closeRate = f.filed7 > 0 ? Math.min(1, f.closed7 / f.filed7) : 1;
  var pressure = 1 / (1 + Math.max(0, f.open_now - 50) / 50);
  out.push({
    dimension: "issue_flow", framework: "fleet", score: r1(5 * closeRate * pressure),
    evidence: "MEASURED (FM-4 backpressure): last 7d filed " + f.filed7 + ", closed " + f.closed7 + " (close rate " + pct(closeRate) + "%); open now " + f.open_now + " vs ceiling 50 (pressure factor " + r1(pressure * 100) / 100 + "). score = 5 x close_rate x pressure.",
    gap: f.open_now > 50 ? "open backlog " + f.open_now + " above ceiling 50" : (closeRate < 1 ? "closing slower than filing" : "none measured"),
    confidence: f.filed7 >= 10 ? "high" : "medium"
  });
  return out;
}
// Pure: measured dims + the current table -> overall row. Judgement dims are carried unchanged.
function composite(measured, current, nowMs) {
  var merged = {}; var i;
  for (i = 0; i < current.length; i++) if (current[i].dimension !== "overall") merged[current[i].dimension] = { score: Number(current[i].score), next: current[i].next_score, measured: false };
  for (i = 0; i < measured.length; i++) merged[measured[i].dimension] = { score: measured[i].score, next: isoDay(nowMs + DAY), measured: true };
  var names = Object.keys(merged); var sum = 0, n = 0, stale = [], meas = 0;
  var today = isoDay(nowMs);
  for (i = 0; i < names.length; i++) {
    var d = merged[names[i]];
    if (isFinite(d.score)) { sum += d.score; n++; }
    if (d.measured) meas++; else if (d.next && String(d.next) < today) stale.push(names[i]);
  }
  if (!n) return null;
  return {
    dimension: "overall", framework: "composite", score: r1(sum / n),
    evidence: "MEASURED composite: mean of " + n + " dimensions, " + meas + " recomputed today by " + WORKER + ", " + (n - meas) + " carried from hand-scored judgement rows. " + (stale.length ? stale.length + " judgement dimension(s) are past their own next_score date and are NOT fresh: " + stale.join(", ") + "." : "No judgement dimension is past its next_score date."),
    gap: stale.length ? "re-score judgement dimensions: " + stale.join(", ") : "none measured",
    confidence: stale.length > n / 2 ? "low" : "medium"
  };
}
var FACT_SQL = "SELECT " +
  "(SELECT count(*) FROM fleet_deploys WHERE ts > datetime('now','-7 day') AND ok=1) AS dep_ok," +
  "(SELECT count(*) FROM fleet_deploys WHERE ts > datetime('now','-7 day') AND ok=0) AS dep_fail," +
  "(SELECT count(*) FROM worker_live_audit WHERE note='SYNC') AS sync_n," +
  "(SELECT count(*) FROM worker_live_audit WHERE note='DRIFT') AS drift_n," +
  "(SELECT count(*) FROM self_heal_actions WHERE ts > datetime('now','-7 day') AND status NOT IN ('no-action','superseded')) AS heal_acted," +
  "(SELECT count(*) FROM self_heal_actions WHERE ts > datetime('now','-7 day') AND status NOT IN ('no-action','superseded','failed','verified-failed') AND verified_at IS NOT NULL) AS heal_good," +
  "(SELECT count(*) FROM agent_issues WHERE created_at > (strftime('%s','now')-604800)*1000) AS filed7," +
  "(SELECT count(*) FROM agent_issues WHERE status!='open' AND updated_at > (strftime('%s','now')-604800)*1000) AS closed7," +
  "(SELECT count(*) FROM agent_issues WHERE status='open') AS open_now";
function json(o, s) { return new Response(JSON.stringify(o, null, 1), { status: s || 200, headers: { "content-type": "application/json" } }); }
async function collect(env) {
  var r = await env.AUDIT.prepare(FACT_SQL).first();
  if (!r) throw new Error("fact query returned no row");
  var keys = ["dep_ok", "dep_fail", "sync_n", "drift_n", "heal_acted", "heal_good", "filed7", "closed7", "open_now"];
  var f = {};
  for (var i = 0; i < keys.length; i++) { var v = Number(r[keys[i]]); if (!isFinite(v) || v < 0) throw new Error("bad fact " + keys[i]); f[keys[i]] = v; }
  return f;
}
async function run(env, write) {
  var now = Date.now();
  var facts = await collect(env);
  var cur = await env.AUDIT.prepare("SELECT dimension, score, next_score FROM autonomy_scores").all();
  var measured = scoreFromFacts(facts, now);
  var comp = composite(measured, (cur && cur.results) || [], now);
  var rows = comp ? measured.concat([comp]) : measured;
  if (write && rows.length) {
    var day = isoDay(now), next = isoDay(now + DAY);
    await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS autonomy_score_history (id INTEGER PRIMARY KEY AUTOINCREMENT, dimension TEXT, score REAL, evidence TEXT, scored_at TEXT, ts INTEGER)").run();
    var stmts = [];
    for (var i = 0; i < rows.length; i++) {
      var x = rows[i];
      stmts.push(env.AUDIT.prepare("INSERT INTO autonomy_scores (dimension, framework, score, scale, evidence, gap, confidence, scored_at, next_score) VALUES (?1,?2,?3,'0-5',?4,?5,?6,?7,?8) ON CONFLICT(dimension) DO UPDATE SET framework=excluded.framework, score=excluded.score, scale=excluded.scale, evidence=excluded.evidence, gap=excluded.gap, confidence=excluded.confidence, scored_at=excluded.scored_at, next_score=excluded.next_score").bind(x.dimension, x.framework, x.score, x.evidence, x.gap, x.confidence, day, next));
      stmts.push(env.AUDIT.prepare("INSERT INTO autonomy_score_history (dimension, score, evidence, scored_at, ts) VALUES (?1,?2,?3,?4,?5)").bind(x.dimension, x.score, x.evidence, day, now));
    }
    stmts.push(env.AUDIT.prepare("INSERT INTO fleet_heartbeat (worker,version,ts,ok) VALUES (?1,?2,?3,1) ON CONFLICT(worker) DO UPDATE SET version=excluded.version, ts=excluded.ts, ok=excluded.ok").bind(WORKER, VERSION, new Date(now).toISOString()));
    await env.AUDIT.batch(stmts);
  }
  return { ts: new Date(now).toISOString(), version: VERSION, wrote: !!write, facts: facts, rows: rows };
}
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env, true).catch(async function (e) {
      try { await env.AUDIT.prepare("INSERT INTO alerts (source, level, message, digested) VALUES (?1,'warn',?2,1)").bind(WORKER, "autonomy scoring failed, nothing written: " + String(e && e.message || e).slice(0, 300)).run(); } catch (e2) {}
    }));
  },
  async fetch(request, env) {
    var p = new URL(request.url).pathname;
    if (p === "/health") return json({ ok: true, worker: WORKER, version: VERSION, ts: new Date().toISOString() });
    if (request.method !== "GET") return json({ error: "read-only; scoring runs on the daily cron" }, 405);
    if (p === "/preview") { try { return json(await run(env, false)); } catch (e) { return json({ error: String(e && e.message || e) }, 500); } }
    if (p === "/scores") { var r = await env.AUDIT.prepare("SELECT dimension, framework, score, scale, confidence, scored_at, next_score, gap FROM autonomy_scores ORDER BY dimension").all(); return json({ scores: (r && r.results) || [] }); }
    return json({ worker: WORKER, version: VERSION, routes: ["/health", "/preview", "/scores"] }, 404);
  }
};
