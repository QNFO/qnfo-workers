// qnfo-autonomy-scorer v1.0.0 - MEASURED autonomy scores, recomputed daily from live audit facts.
// Worker Contract v1: VERSION constant + GET /health.
// WHY: autonomy_scores had no writer anywhere in the repo; every row was hand-entered in an agent session and the
// table went stale (last 2026-09-24). A score nobody recomputes is an assertion, not a measurement.
//
// SCOPE (deliberate): only dimensions that can be derived from data are written. Judgement dimensions
// (independent_decision, watchmaker_inverted, novelty) are NEVER touched; when one is past its own next_score
// date the composite says so instead of pretending it is fresh.
// v1.1.0 VSM-OODA-MEASURED-1 (2026-10-01, issues 1679 / 1690): mission 2.1 requires periodic autonomy scores under
// BOTH frameworks, but s1/s2/s4/s5 and ooda_closure were still hand-scored (last 09-10..09-24). Every VSM system
// (S1-S5 plus S3*) and every OODA stage is now recomputed daily from live registers; each formula is stated in
// the row's evidence. (1.1.x mirrored the unweighted composite into survival_state.sai; 1.2.0 writes the weighted SAI.)
// Every write is a bounded UPSERT of a known dimension plus an append to autonomy_score_history. If the fact query
// fails, nothing is written (fail closed).
// v1.2.0 SAI-COMPOSITE-WEIGHTS-1 (2026-10-02, issue 1739): survival_state.sai was the UNWEIGHTED mean of every
// dimension and never read sai_config, so an owner-ratified weight revision (OBJECTIVE-REVISION-APPLY-1) moved the
// dashboard SAI but not the number the charter grades. The scorer now computes the owner-weighted SAI itself: the
// eight terms of the objective function weighted by sai_config w_*, with the same formula and inputs as
// qnfo-fleet-dashboard computeSai (sai.test.mjs locks the two together), and publishes it on a 0-5 scale (SAI/20) as
// the `sai_weighted` row and survival_state.sai. The unweighted mean stays the `overall` row ("Autonomy dimension
// mean"). When the SAI cannot be measured (dashboard state older than 6h, a missing weight, no decision dimension),
// survival_state.sai is set NULL, sai_weighted keeps its last measured value and date, and an alert is written.
// GET /preview?w_autonomy=0.20&w_self_improv=0.15 recomputes the SAI with what-if weights next to the live ones and
// writes nothing, so a weight change can be shown to move the SAI without touching the ratified weights.
var VERSION = "1.3.0-kaizen-gradient"; // 1.3.0 SAI-KAIZEN-GRADIENT-1 (agent_issues 2054): kaizen = 1 / (1 + step x open issues); this folded copy is the parity reference sai.test.mjs reads, and qnfo-observability (the live scorer) carries the same function.
// PRIORITY-QUEUE-1 (2026-10-03, owner directive "dates aren't important, the order of priority is"): the OODA decide stage
// no longer counts issues past an SLA date (every issue is now due on arrival and worked in v_issue_queue order). It counts
// open issues with no next action: no code-task line, no active remediation contract, no triage remediation. Stricter.
var WORKER = "qnfo-autonomy-scorer";
var DAY = 86400000;
var SAI_TERMS = ["autonomy", "thinking", "decision", "self_improv", "reliability", "integration", "external_impact", "governance"];
var SAI_STATE_MAX_AGE_MS = 6 * 3600000;
// Rows this worker derives from the others; never inputs to the mean or to the SAI.
var COMPOSITE_DIMS = { overall: true, sai_weighted: true };
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
  // ---- VSM S1, S2, S3*, S4, S5 ----
  var liveRatio = f.live_n > 0 ? f.live_ok / f.live_n : null;
  if (liveRatio !== null) {
    var pubRatio = Math.min(1, f.pub30 / 30);
    out.push({
      dimension: "s1_operations", framework: "VSM", score: r1(5 * liveRatio * (0.5 + 0.5 * pubRatio)),
      evidence: "MEASURED: operational units serving " + f.live_ok + "/" + f.live_n + " (worker_live_audit http=200 among deployable workers, " + pct(liveRatio) + "%); research published last 30d " + f.pub30 + " vs mission target 30 (one per day). score = 5 x serving x (0.5 + 0.5 x min(1, pub30/30)).",
      gap: pubRatio < 1 ? "publishing " + f.pub30 + "/30 per 30d" : (f.live_ok < f.live_n ? (f.live_n - f.live_ok) + " unit(s) not serving" : "none measured"),
      confidence: "high"
    });
  }
  var syncT = f.sync_n + f.drift_n;
  var fgT = f.fg_fresh + f.fg_stale;
  if (syncT > 0 && fgT > 0) {
    var s2 = 0.5 * (f.sync_n / syncT) + 0.5 * (f.fg_fresh / fgT);
    out.push({
      dimension: "s2_coordination", framework: "VSM", score: r1(5 * s2),
      evidence: "MEASURED: shared-state coherence. live==repo " + f.sync_n + "/" + syncT + "; freshness_guard shared registers fresh " + f.fg_fresh + "/" + fgT + " (stale " + f.fg_stale + "). score = 5 x (0.5 x sync + 0.5 x fresh).",
      gap: f.fg_stale ? f.fg_stale + " shared register(s) stale" : (f.drift_n ? f.drift_n + " worker(s) drifted" : "none measured"),
      confidence: "medium"
    });
  }
  if (f.guards_n > 0) {
    out.push({
      dimension: "s3_star_audit", framework: "VSM", score: r1(5 * f.guards_ok / f.guards_n),
      evidence: "MEASURED: guard_registry " + f.guards_ok + "/" + f.guards_n + " guards status=verified with a negative test. score = 5 x verified/total.",
      gap: f.guards_n - f.guards_ok ? (f.guards_n - f.guards_ok) + " guard(s) unverified" : "none measured",
      confidence: "medium"
    });
  }
  if (f.sig30 > 0) {
    out.push({
      dimension: "s4_intelligence", framework: "VSM", score: r1(5 * f.sig30_done / f.sig30),
      evidence: "MEASURED: environment signals last 30d (expired orphans excluded) " + f.sig30 + ", triaged (status != new) " + f.sig30_done + " (" + pct(f.sig30_done / f.sig30) + "%). score = 5 x triaged/received.",
      gap: f.sig30 - f.sig30_done ? (f.sig30 - f.sig30_done) + " signal(s) untriaged" : "none measured",
      confidence: f.sig30 >= 50 ? "high" : "medium"
    });
  }
  if (f.gates_n > 0) {
    out.push({
      dimension: "s5_policy", framework: "VSM", score: r1(5 * f.gates_met / f.gates_n),
      evidence: "MEASURED: identity/impact gates (impact_thresholds) MET " + f.gates_met + "/" + f.gates_n + ". score = 5 x met/total. Business gates cannot be met by engineering alone; see the owner-decision list.",
      gap: f.gates_n - f.gates_met ? (f.gates_n - f.gates_met) + " gate(s) open" : "none measured",
      confidence: "high"
    });
  }
  // ---- OODA: each stage measured; closure is the weakest stage (a loop is as fast as its slowest leg) ----
  var stages = [];
  if (fgT > 0) stages.push(["observe", f.fg_fresh / fgT, "freshness_guard fresh " + f.fg_fresh + "/" + fgT]);
  if (f.open_now > 0) stages.push(["orient", f.triaged / f.open_now, "open issues triaged " + f.triaged + "/" + f.open_now]);
  else stages.push(["orient", 1, "no open issues"]);
  if (f.triaged > 0) stages.push(["decide", 1 - f.breached / f.triaged, "open issues with a next action (code task, active closing contract or remediation) " + (f.triaged - f.breached) + "/" + f.triaged]);
  var actR = f.filed7 > 0 ? Math.min(1, f.closed7 / f.filed7) : 1;
  stages.push(["act", actR, "7d closed/filed " + f.closed7 + "/" + f.filed7]);
  var weakest = null;
  for (var k = 0; k < stages.length; k++) {
    out.push({ dimension: "ooda_" + stages[k][0], framework: "OODA", score: r1(5 * stages[k][1]),
      evidence: "MEASURED: " + stages[k][2] + " (" + pct(stages[k][1]) + "%). score = 5 x ratio.",
      gap: stages[k][1] < 1 ? stages[k][0] + " below 100%" : "none measured", confidence: "medium" });
    if (!weakest || stages[k][1] < weakest[1]) weakest = stages[k];
  }
  out.push({ dimension: "ooda_closure", framework: "OODA", score: r1(5 * weakest[1]),
    evidence: "MEASURED: loop closure = weakest stage (" + stages.map(function (x) { return x[0] + " " + pct(x[1]) + "%"; }).join(", ") + ").",
    gap: "weakest stage: " + weakest[0], confidence: "medium" });
  return out;
}
// Pure: the current table overlaid with today's measured dims (what the table holds after this run's write).
// Judgement dims are carried unchanged; the derived composite rows are left out.
function mergeDims(measured, current, nowMs) {
  var merged = {}; var i;
  // isNum: the stored score is a number (the dashboard's liveSaiInputs skips NULL or text scores; the SAI does too).
  for (i = 0; i < current.length; i++) if (!COMPOSITE_DIMS[current[i].dimension]) merged[current[i].dimension] = { score: Number(current[i].score), isNum: typeof current[i].score === "number", next: current[i].next_score, measured: false };
  for (i = 0; i < measured.length; i++) merged[measured[i].dimension] = { score: measured[i].score, isNum: typeof measured[i].score === "number", next: isoDay(nowMs + DAY), measured: true };
  return merged;
}
// Pure: measured dims + the current table -> overall row (the UNWEIGHTED dimension mean).
function composite(measured, current, nowMs) {
  var merged = mergeDims(measured, current, nowMs); var i;
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
    evidence: "MEASURED composite: unweighted mean of " + n + " dimensions, " + meas + " recomputed today by " + WORKER + ", " + (n - meas) + " carried from hand-scored judgement rows. " + (stale.length ? stale.length + " judgement dimension(s) are past their own next_score date and are NOT fresh: " + stale.join(", ") + "." : "No judgement dimension is past its next_score date.") + " This is the dimension mean; the owner-weighted SAI is the sai_weighted row and survival_state.sai (SAI-COMPOSITE-WEIGHTS-1).",
    gap: stale.length ? "re-score judgement dimensions: " + stale.join(", ") : "none measured",
    confidence: stale.length > n / 2 ? "low" : "medium"
  };
}
// ---- SAI-COMPOSITE-WEIGHTS-1: the owner-weighted SAI ----
// Pure: a line-for-line port of qnfo-fleet-dashboard computeSai(st, bench, cfg, live). st is the dashboard's own
// state (fleet_dashboard_state.state_json), cfg is sai_config, live is { dims, closureRate, healRate, externalImpact }
// read exactly as the dashboard's liveSaiInputs reads them. sai.test.mjs slices the dashboard's function out of its
// source and asserts both return the same SAI, terms and signals, so a formula change in one fails CI until the
// other follows. The one addition is sai_raw (the unrounded 0-100 value) for the 0-5 scale.
function computeSai(st, bench, cfg, live) {
  var clamp01 = function (x) { return Math.max(0, Math.min(1, x)); };
  var P = cfg || {};
  var LD = live || {};
  var dims = LD.dims || {};
  var nd = function (k) { return typeof dims[k] === "number" ? dims[k] : null; };
  var probes = st.probes || [];
  var probeRatio = probes.length ? probes.filter(function (p) { return p.ok; }).length / probes.length : 0;
  var issues = st.issues || [];
  var nErr = issues.filter(function (i) { return i.sev === "err"; }).length;
  var nWarn = issues.filter(function (i) { return i.sev === "warn"; }).length;
  var chains = st.chains || [];
  var chainRatio = chains.length ? chains.filter(function (c) { return c.state === "ok"; }).length / chains.length : 0;
  var ig = st.integration || {};
  var islands = ig.islands || [];
  var drift = ig.drift || {};
  var driftBad = (drift.ghost || 0) + (drift.unregistered || 0) + (drift.unversioned || 0);
  var density = ig.density_contract || ig.density || 0;
  var audits = {};
  (st.audits || []).forEach(function (a) { if (a && a.key) audits[a.key] = a; });
  var openIssues = -1, userWait = -1;
  var m1 = ((audits.agent_issues || {}).detail || "").match(/(\d+) open of/);
  if (m1) openIssues = Number(m1[1]);
  var m2 = ((audits.register || {}).detail || "").match(/v_waiting_on_human=(\d+)/);
  if (m2) userWait = Number(m2[1]);
  var noRun = (st.scheduled || []).filter(function (s) { return s.status === "NO-RUN"; }).length;
  var userFreedom = userWait === 0 ? 1 : userWait > 0 ? clamp01(1 - P.uf_step * userWait) : 1;
  var loopHealth = P.lh_probe * probeRatio + P.lh_chain * chainRatio + P.lh_norun * (noRun === 0 ? 1 : P.lh_norun_penalty);
  var autonomy = Math.min(P.aut_user * userFreedom + P.aut_loop * loopHealth, P.autonomy_ceiling);
  var thinking = P.thinking_base + P.thinking_scale * (typeof bench === "number" && bench >= 0 && bench <= 1 ? bench : 0);
  var decLive = ["independent_decision", "ooda_closure", "s3_control", "s5_policy"].map(nd).filter(function (x) { return x != null; });
  var decision = decLive.length ? decLive.reduce(function (a, b) { return a + b; }, 0) / decLive.length / 5 : null;
  // SAI-KAIZEN-GRADIENT-1 (agent_issues 2054): 1 / (1 + step x open) keeps a gradient at every backlog size (the linear
  // clamp read 0 for any backlog above 20, so closing 30 issues moved nothing); parity with qnfo-fleet-dashboard computeSai.
  var kaizen = openIssues > 0 ? 1 / (1 + P.kaizen_step * openIssues) : 1;
  var closureRate = typeof LD.closureRate === "number" ? LD.closureRate : 0;
  var healRate = typeof LD.healRate === "number" ? LD.healRate : 0;
  var selfImprov = P.si_kaizen * kaizen + P.si_closure * closureRate + P.si_heal * healRate;
  var reliability = P.rel_probe * probeRatio + P.rel_err * clamp01(1 - P.rel_err_step * nErr) + P.rel_warn * clamp01(1 - P.rel_warn_step * nWarn);
  var driftPen = clamp01(1 - P.drift_step * driftBad);
  var islandPen = clamp01(1 - P.island_step * islands.length);
  var densityScore = clamp01(density * P.density_mult);
  var structural = P.st_chain * chainRatio + P.st_drift * (P.st_drift_w * driftPen + P.st_island_w * islandPen) + P.st_density * densityScore;
  var sysInt = ig.system || {};
  var sysScore = sysInt.score && typeof sysInt.score.total === "number" ? sysInt.score.total : null;
  var integration = sysScore != null ? P.int_struct * structural + P.int_sys * clamp01(sysScore / 100) : structural;
  var govPol = nd("s5_policy") != null ? nd("s5_policy") / 5 : P.gov_policy;
  var governance = P.gov_user * userFreedom + P.gov_pol_w * govPol;
  var externalImpact = typeof LD.externalImpact === "number" ? Math.max(0, Math.min(1, LD.externalImpact)) : 0;
  var scores = { autonomy: autonomy, thinking: thinking, decision: decision, self_improv: selfImprov, reliability: reliability, integration: integration, external_impact: externalImpact, governance: governance };
  var weights = ["w_autonomy", "w_thinking", "w_decision", "w_self_improv", "w_reliability", "w_integration", "w_external_impact", "w_governance"];
  var missing = weights.filter(function (k) { return typeof P[k] !== "number"; });
  var sai = missing.length || scores.decision == null ? null : 100 * (P.w_autonomy * scores.autonomy + P.w_thinking * scores.thinking + P.w_decision * scores.decision + P.w_self_improv * scores.self_improv + P.w_reliability * scores.reliability + P.w_integration * scores.integration + P.w_external_impact * scores.external_impact + P.w_governance * scores.governance);
  return { sai: sai == null ? null : Math.round(sai * 10) / 10, sai_raw: sai, scores: scores, weights_source: "sai_config", config_missing: missing, decision_source: decLive.length ? "autonomy_scores" : "unavailable", signals: { probe_ratio: probeRatio, chain_ratio: chainRatio, issues_err: nErr, issues_warn: nWarn, open_agent_issues: openIssues, user_wait: userWait, islands: islands.length, drift_bad: driftBad, density: density, no_run: noRun, closure_rate: closureRate, heal_rate: healRate } };
}
function r3(x) { return Math.round(x * 1000) / 1000; }
// Pure: gathered inputs + the merged dims -> the weighted SAI on 0-100 and 0-5, or the reason it cannot be measured.
// `weights` (optional) overrides w_* for a what-if; it never reaches a write.
function weightedSai(inp, merged, nowMs, weights) {
  if (!inp || !inp.state) return { ok: false, reason: "no fleet_dashboard_state row (the dashboard has not refreshed)" };
  var at = Date.parse(String(inp.state_at || "").replace(" ", "T"));
  if (isNaN(at)) return { ok: false, reason: "dashboard state carries no timestamp" };
  var ageMin = Math.max(0, Math.round((nowMs - at) / 60000));
  if (nowMs - at > SAI_STATE_MAX_AGE_MS) return { ok: false, reason: "dashboard state is " + ageMin + " min old (limit " + SAI_STATE_MAX_AGE_MS / 60000 + "): its probes, chains and issues are not today's", state_at: inp.state_at };
  var dims = {};
  Object.keys(merged || {}).forEach(function (k) { if (merged[k].isNum !== false && isFinite(merged[k].score)) dims[k] = merged[k].score; });
  var cfg = Object.assign({}, inp.cfg || {}, weights || {});
  var res = computeSai(inp.state, inp.bench, cfg, { dims: dims, closureRate: inp.closureRate, healRate: inp.healRate, externalImpact: inp.externalImpact });
  if (res.config_missing.length) return { ok: false, reason: "sai_config has no " + res.config_missing.join(", ") };
  if (res.scores.decision == null) return { ok: false, reason: "no decision dimension (independent_decision, ooda_closure, s3_control, s5_policy) is scored" };
  if (typeof res.sai_raw !== "number" || !isFinite(res.sai_raw)) return { ok: false, reason: "SAI is not finite: a formula parameter is missing from sai_config" };
  var w = {}, wsum = 0;
  SAI_TERMS.forEach(function (t) { w[t] = cfg["w_" + t]; wsum += cfg["w_" + t]; });
  return { ok: true, sai: Math.round(res.sai_raw / 20 * 100) / 100, sai_100: res.sai, scores: res.scores, weights: w, weight_sum: r3(wsum), state_at: inp.state_at, state_age_min: ageMin, bench: inp.bench, signals: res.signals };
}
// Pure: a measured SAI -> the sai_weighted autonomy_scores row.
function saiRow(s, mean) {
  var worst = null;
  SAI_TERMS.forEach(function (t) { var short = s.weights[t] * (1 - s.scores[t]); if (!worst || short > worst.short) worst = { t: t, short: short }; });
  return {
    dimension: "sai_weighted", framework: "composite", score: s.sai,
    evidence: "MEASURED (SAI-COMPOSITE-WEIGHTS-1): the objective-function SAI, the eight terms weighted by the owner-ratified sai_config w_*, with the same formula and inputs as qnfo-fleet-dashboard computeSai. SAI " + s.sai_100 + "/100 = " + s.sai + "/5 (SAI/20). Terms, weight x score: " + SAI_TERMS.map(function (t) { return t + " " + s.weights[t] + " x " + r3(s.scores[t]); }).join(", ") + " (weights sum " + s.weight_sum + "). Inputs: dashboard state " + s.state_at + " (" + s.state_age_min + " min old), bench " + s.bench + ". Unweighted dimension mean (overall) " + (mean == null ? "n/a" : mean) + "/5.",
    gap: "largest weighted shortfall: " + worst.t + " (" + s.weights[worst.t] + " x (1 - " + r3(s.scores[worst.t]) + ") = " + r3(worst.short) + " of 1.00)",
    confidence: s.state_age_min <= 60 ? "medium" : "low"
  };
}
// Pure: ?w_<term>=<0..1> query parameters -> what-if weights. Other parameters are ignored; a bad w_* is refused.
function parseWhatIf(searchParams) {
  var w = {}, n = 0, bad = [];
  searchParams.forEach(function (v, k) {
    if (k.indexOf("w_") !== 0) return;
    var x = Number(v);
    if (SAI_TERMS.indexOf(k.slice(2)) < 0 || v === "" || !isFinite(x) || x < 0 || x > 1) { bad.push(k); return; }
    w[k] = x; n++;
  });
  return { weights: n ? w : null, bad: bad };
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
// Split from FACT_SQL: D1 caps the number of terms in one compound SELECT.
var FACT_SQL2 = "SELECT " +
  "(SELECT count(*) FROM worker_live_audit WHERE note NOT IN ('NOT_A_WORKER','NOT_DEPLOYED','CRON_ONLY')) AS live_n," +
  "(SELECT count(*) FROM worker_live_audit WHERE note NOT IN ('NOT_A_WORKER','NOT_DEPLOYED','CRON_ONLY') AND http=200) AS live_ok," +
  "(SELECT count(*) FROM research_queue WHERE published_at > datetime('now','-30 day')) AS pub30," +
  "(SELECT count(*) FROM freshness_guard WHERE status='fresh') AS fg_fresh," +
  "(SELECT count(*) FROM freshness_guard WHERE status='stale') AS fg_stale," +
  "(SELECT count(*) FROM guard_registry) AS guards_n," +
  "(SELECT count(*) FROM guard_registry WHERE status='verified') AS guards_ok";
var FACT_SQL3 = "SELECT " +
  "(SELECT count(*) FROM signals WHERE COALESCE(created_at,ts) > datetime('now','-30 day') AND status!='expired') AS sig30," +
  "(SELECT count(*) FROM signals WHERE COALESCE(created_at,ts) > datetime('now','-30 day') AND status NOT IN ('new','expired')) AS sig30_done," +
  // REVIEW-GATE-1 (2026-10-01, docs/STRATEGY.md s9): a RETIRED threshold is history, not a gate; it counts in neither term.
  "(SELECT count(*) FROM impact_thresholds WHERE state != 'RETIRED') AS gates_n," +
  "(SELECT count(*) FROM impact_thresholds WHERE state='MET') AS gates_met," +
  "(SELECT count(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id=a.id WHERE a.status='open') AS triaged," +
  "(SELECT count(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id=a.id WHERE a.status='open' AND COALESCE(a.description,'') NOT LIKE '%code-task:%' AND COALESCE(t.remediation,'') = '' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id=a.id AND c.status='active')) AS breached";
function json(o, s) { return new Response(JSON.stringify(o, null, 1), { status: s || 200, headers: { "content-type": "application/json" } }); }
async function collect(env) {
  var r = await env.AUDIT.prepare(FACT_SQL).first();
  var r2 = await env.AUDIT.prepare(FACT_SQL2).first();
  var r3 = await env.AUDIT.prepare(FACT_SQL3).first();
  if (!r || !r2 || !r3) throw new Error("fact query returned no row");
  r = Object.assign({}, r, r2, r3);
  var keys = ["dep_ok", "dep_fail", "sync_n", "drift_n", "heal_acted", "heal_good", "filed7", "closed7", "open_now",
    "live_n", "live_ok", "pub30", "fg_fresh", "fg_stale", "guards_n", "guards_ok", "sig30", "sig30_done", "gates_n", "gates_met", "triaged", "breached"];
  var f = {};
  for (var i = 0; i < keys.length; i++) { var v = Number(r[keys[i]]); if (!isFinite(v) || v < 0) throw new Error("bad fact " + keys[i]); f[keys[i]] = v; }
  return f;
}
// The SAI inputs, read from the same registers as the dashboard's loadSaiConfig, liveSaiInputs and weekly report
// card. Stricter than the dashboard in one way: a failed read throws (the SAI is then not measured) instead of
// silently counting as 0. A missing benchmark row is 0, as on the dashboard.
async function collectSai(env) {
  var A = env.AUDIT;
  var cfgR = await A.prepare("SELECT k, v FROM sai_config").all();
  var cfg = {};
  ((cfgR && cfgR.results) || []).forEach(function (x) { if (x && typeof x.v === "number") cfg[x.k] = x.v; });
  var stRow = await A.prepare("SELECT updated_at, state_json FROM fleet_dashboard_state WHERE id = 1").first();
  var state = stRow && stRow.state_json ? JSON.parse(stRow.state_json) : null;
  var br = await A.prepare("SELECT value FROM report_card_inputs WHERE key = 'arc_agi_10task_pass_rate'").first();
  var bench = br && br.value != null && !isNaN(Number(br.value)) ? Number(br.value) : 0;
  var ic = await A.prepare("SELECT COUNT(*) AS c, SUM(CASE WHEN status NOT IN ('closed','done','resolved','wontfix','cancelled') THEN 1 ELSE 0 END) AS o FROM agent_issues").first();
  var tc = ic ? Number(ic.c || 0) : 0, oc = ic ? Number(ic.o || 0) : 0;
  var hc = await A.prepare("SELECT COUNT(*) AS c, SUM(CASE WHEN status IN ('healed','resolved') THEN 1 ELSE 0 END) AS h FROM self_heal_actions").first();
  var ss = await A.prepare("SELECT survival_score FROM survival_state WHERE id = 1").first();
  return {
    cfg: cfg, state: state, state_at: stRow ? stRow.updated_at : null, bench: bench,
    closureRate: tc > 0 ? clamp((tc - oc) / tc, 0, 1) : null,
    healRate: hc && Number(hc.c) > 0 ? clamp(Number(hc.h || 0) / Number(hc.c), 0, 1) : null,
    externalImpact: ss && typeof ss.survival_score === "number" ? clamp(ss.survival_score, 0, 1) : undefined
  };
}
async function run(env, write, whatIf) {
  if (write && whatIf) throw new Error("what-if weights are preview-only");
  var now = Date.now();
  var facts = await collect(env);
  var cur = await env.AUDIT.prepare("SELECT dimension, score, next_score FROM autonomy_scores").all();
  var current = (cur && cur.results) || [];
  var measured = scoreFromFacts(facts, now);
  var comp = composite(measured, current, now);
  var merged = mergeDims(measured, current, now);
  var sai, alt = null;
  try {
    var inp = await collectSai(env);
    sai = weightedSai(inp, merged, now, null);
    if (whatIf) {
      alt = weightedSai(inp, merged, now, whatIf);
      if (alt.ok && sai.ok) alt.delta = { sai: Math.round((alt.sai - sai.sai) * 100) / 100, sai_100: Math.round((alt.sai_100 - sai.sai_100) * 10) / 10 };
    }
  } catch (e) {
    sai = { ok: false, reason: "SAI inputs unreadable: " + String(e && e.message || e).slice(0, 200) };
  }
  var sRow = sai.ok ? saiRow(sai, comp ? comp.score : null) : null;
  var rows = measured.concat(comp ? [comp] : [], sRow ? [sRow] : []);
  if (write && rows.length) {
    var day = isoDay(now), next = isoDay(now + DAY);
    await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS autonomy_score_history (id INTEGER PRIMARY KEY AUTOINCREMENT, dimension TEXT, score REAL, evidence TEXT, scored_at TEXT, ts INTEGER)").run();
    var stmts = [];
    for (var i = 0; i < rows.length; i++) {
      var x = rows[i];
      stmts.push(env.AUDIT.prepare("INSERT INTO autonomy_scores (dimension, framework, score, scale, evidence, gap, confidence, scored_at, next_score) VALUES (?1,?2,?3,'0-5',?4,?5,?6,?7,?8) ON CONFLICT(dimension) DO UPDATE SET framework=excluded.framework, score=excluded.score, scale=excluded.scale, evidence=excluded.evidence, gap=excluded.gap, confidence=excluded.confidence, scored_at=excluded.scored_at, next_score=excluded.next_score").bind(x.dimension, x.framework, x.score, x.evidence, x.gap, x.confidence, day, next));
      stmts.push(env.AUDIT.prepare("INSERT INTO autonomy_score_history (dimension, score, evidence, scored_at, ts) VALUES (?1,?2,?3,?4,?5)").bind(x.dimension, x.score, x.evidence, day, now));
    }
    // SAI-COMPOSITE-WEIGHTS-1: survival_state.sai is the owner-weighted SAI (0-5), never the unweighted mean. An
    // unmeasured SAI is written as NULL (survival_state has no SAI timestamp, so a carried value would read as today's).
    stmts.push(env.AUDIT.prepare("INSERT INTO survival_state (id, ts, sai) VALUES (1, ?1, ?2) ON CONFLICT(id) DO UPDATE SET sai=excluded.sai").bind(new Date(now).toISOString(), sai.ok ? sai.sai : null));
    stmts.push(env.AUDIT.prepare("INSERT INTO fleet_heartbeat (worker,version,ts,ok) VALUES (?1,?2,?3,1) ON CONFLICT(worker) DO UPDATE SET version=excluded.version, ts=excluded.ts, ok=excluded.ok").bind(WORKER, VERSION, new Date(now).toISOString()));
    await env.AUDIT.batch(stmts);
    if (!sai.ok) {
      try { await env.AUDIT.prepare("INSERT INTO alerts (source, level, message) VALUES (?1,'warn',?2)").bind(WORKER, "SAI-COMPOSITE-WEIGHTS-1: weighted SAI not measured, survival_state.sai set NULL and sai_weighted left at its last value: " + sai.reason).run(); } catch (e2) {}
    }
  }
  var out = { ts: new Date(now).toISOString(), version: VERSION, wrote: !!write, facts: facts, rows: rows, sai: sai };
  if (whatIf) out.what_if = alt;
  return out;
}
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env, true).catch(async function (e) {
      try { await env.AUDIT.prepare("INSERT INTO alerts (source, level, message) VALUES (?1,'warn',?2)").bind(WORKER, "autonomy scoring failed, nothing written: " + String(e && e.message || e).slice(0, 300)).run(); } catch (e2) {}
    }));
  },
  async fetch(request, env) {
    var u = new URL(request.url); var p = u.pathname;
    if (p === "/health") return json({ ok: true, worker: WORKER, version: VERSION, ts: new Date().toISOString(), capabilities: ["autonomy-scoring", "score-preview", "score-history", "sai-weighted", "sai-what-if"], limitations: ["read-only over HTTP; scoring runs on the daily 05:17 cron", "recomputes only measurable dimensions; judgement dimensions are never touched", "the weighted SAI needs a dashboard state younger than 6h; otherwise survival_state.sai is NULL", "what-if weights (/preview?w_<term>=x) are computed, never written"] });
    if (request.method !== "GET") return json({ error: "read-only; scoring runs on the daily cron" }, 405);
    if (p === "/preview") {
      var wi = parseWhatIf(u.searchParams);
      if (wi.bad.length) return json({ error: "what-if weights must be w_<term>=<0..1> with term one of " + SAI_TERMS.join(", "), refused: wi.bad }, 400);
      try { return json(await run(env, false, wi.weights)); } catch (e) { return json({ error: String(e && e.message || e) }, 500); }
    }
    if (p === "/scores") { var r = await env.AUDIT.prepare("SELECT dimension, framework, score, scale, confidence, scored_at, next_score, gap FROM autonomy_scores ORDER BY dimension").all(); return json({ scores: (r && r.results) || [] }); }
    return json({ worker: WORKER, version: VERSION, routes: ["/health", "/preview", "/scores"] }, 404);
  }
};
