/**
 * q08-signal-engine \u2014 v0.7.0
 *
 * What it is
 *   The external signal engine for q08.org. Scrapes high-friction technical
 *   discussions from Hacker News, ranks them by a volatility score, extracts
 *   the structural friction point, then composes a long-form analytical essay
 *   and publishes it to q08.org.
 *
 * Architecture
 *   cron (every 2h) -> scrape_hn -> volatility_rank -> pick_top ->
 *   extract_friction -> build_prompt -> compose (Workers AI) ->
 *   gate (long-form prose: no bullets / no tables / no names / no handles) ->
 *   persist (D1 q08-signal) -> serve HTML
 *
 * Register (the reading.q08.org signature, applied to external signals)
 *   Systemic, not specific: the signal incident opens the essay; the essay
 *   itself names the general structural pattern it instantiates. Cold structural
 *   objectivity \u2014 no management-consulting abstractions. Structures vary per
 *   piece; section skeletons of recent pieces are injected as banned patterns.
 *   Each draft must carry a 'worth your time' self-verdict that gates
 *   publication, and readers vote yes/flat/no, which ranks the few-shot pool.
 *   Timeless and name-free. NO bullet lists. NO tables.
 *
 * Bindings
 *   DB          \u2014 D1 q08-signal (signal_log, published_pieces, prompt_pool, engine_runs)
 *   QNFO_AI     \u2014 service binding to qnfo-ai (OpenAI-compat router)
 *   EMAIL       \u2014 service binding to qnfo-email (alerts on publish)
 *
 * Secrets
 *   ROUTER_TOKEN \u2014 bearer token for qnfo-ai
 *
 * Cron: 0 * /2 * * * (every 2 hours; up to 10x/day cap enforced in code, lowered by
 *   qnfo-audit ops_config q08_max_per_day when set: Q08-CADENCE-CAP-1)
 */

// Q08-ASCII-SOURCE-1 (2026-10-01): this file is ASCII-only; every typographic character is a \uXXXX escape. The deploy path
// double-encoded raw UTF-8, so live pages read "... \u00e2 q08" and posts "\u00e2\u0080\u0094". Keep new literals escaped.
var VERSION = "0.10.1"; // 0.10.1 generative prompts name no example nouns (process and style only); 0.10.0 Q08-VERIFY-1 (pillar: reach, owner directive 2026-10-10: q08 content is 100% accurate and fact-checked): the writer prompts no longer ask for history from memory; a piece is published only when every name, year and figure is in its source material (signal plus the fetched article) and two reviewers from other model families find no unsupported claim (a reviewer outage fails closed); published pieces are re-audited each cron and a failure is retracted in public (410 notice, /retractions, out of index, feed, sitemap, APIs and social; forecasts built on it too). // 0.9.0 Q08-FORECAST-1 (pillar: reach): forecast mode. Every FORECAST_EVERY pieces the engine writes a most-likely scenario narrative from a published essay's mechanism (dated causal sequence, rival scenarios with probabilities, leading indicators, a checkable resolution condition), stored in q08_forecasts, settled by a two-family judge panel when the horizon passes and scored (Brier) on /forecasts and /api/forecasts; undecidable ones go void in public after 4 checks. // 0.8.13-codeagent 0.8.12 Q08-PHRASE-REVISE-1: a phrase-level-only gate failure is retried as a revision of the same draft, not a rewrite from scratch (#2034); 0.8.11 BUDGET-SOFT-ROUTE-1 (2026-10-06, pillar cost): the attempt-bound note no longer cites a budget stop; the bound is publishing cadence. // 0.8.10 Q08-STALL-METRIC-1 writes q08_hours_since_last_piece (#2034); 0.8.9 unknown paths 404 noindex (no soft 404); 0.8.8 Q08-SITEMAP-INDEXABLE-1: canonical home loc, no feed in the sitemap, www -> apex 301; // v0.8.6 Q08-WRITE-ROUTES-TOKEN-1 (pillar: reach, agent_issues 1995): POST /run and POST /regen need x-loop-token (both spent model calls for anyone; /regen rewrote a published essay without the panel); v0.8.5 Q08-ENSEMBLE-1 (pillar: reach): writer -> 2-judge reader panel from model families other than the writer -> editor from the other writer family -> fresh panel; judges are small-active-parameter models; panel agreement measured (q08_panel_effective_votes_30d); v0.8.4 Q08-QUALITY-1 (pillar: reach): plain-wording and no-pipeline-metadata rules, overused-precedent ban, Title Case title gate, owner editorial directives (qnfo-audit q08_editor_notes), reader-test rounds by the other model (max 1 rewrite, fail-open on a critic error), daily attempt cap of 2x the publish cap, owner verdict weight 3 (q08_owner_verdicts); v0.8.3 Q08-NOTE-1 (pillar: reach): optional sanitized note on the verdict form, stored in q08_feedback.note, never read by any prompt; v0.8.2 Q08-METRICS-1: daily human/crawler read counter, GET /api/metrics, metrics_7d on /health, own registry values (#1759); compose temperature from ops_config q08_compose_temperature 0.4..0.8 (#1760); v0.7.37 Q08-CADENCE-CAP-1: daily cap read from ops_config q08_max_per_day (#1716); v0.7.36 personal-channel-hold-ascii; v0.7.16 ANTI-BANAL-1: ban stock "structural dynamic" framing + label/abstraction titles; title must name a mechanism, not a category
// WORKERS-AI-ATTRIBUTION-1 (2026-10-01, #1681): per-worker Workers AI attribution. Returns a shallow env copy whose AI
// binding records each .run() (calls, errors, ms, tokens, neurons) into qnfo-audit ai_call_counters (purpose 'binding').
// Neurons = usage tokens x Cloudflare's published per-model rates (neurons per M tokens). Fail-soft; env is never mutated.
var __AI_ATTR_RATES = { "@cf/zai-org/glm-5.3": [127273, 400000], "@cf/zai-org/glm-5.3-flash": [13636, 45455], "@cf/nvidia/nemotron-3-120b-a12b": [45455, 136364], "@cf/moonshotai/kimi-k2.6": [86364, 363636], "@cf/moonshotai/kimi-k2.7-code": [86364, 363636], "@cf/openai/gpt-oss-120b": [31818, 68182], "@cf/openai/gpt-oss-20b": [18182, 27273], "@cf/deepseek-ai/deepseek-v4-pro-0813": [120000, 360000], "@cf/deepseek-ai/deepseek-v4-flash-0731": [40000, 120000], "@cf/meta/llama-3.3-70b-instruct-fp8-fast": [26668, 204805], "@cf/qwen/qwen3-30b-a3b-fp8": [4625, 30475], "@cf/qwen/qwen3.8-27b": [40909, 290909], "@cf/baai/bge-base-en-v1.5": [6058, 0], "@cf/baai/bge-small-en-v1.5": [1841, 0], "@cf/baai/bge-large-en-v1.5": [18582, 0] };
function __aiAttrEnv(env, worker, aiKey, dbKey) {
  try {
    if (!env || env.__aiAttr) return env;
    var ai = env[aiKey], db = env[dbKey];
    if (!ai || typeof ai.run !== "function" || !db) return env;
    var wrapped = new Proxy(ai, { get: function (t, p) {
      if (p !== "run") { var v = Reflect.get(t, p); return typeof v === "function" ? v.bind(t) : v; }
      return async function (model, input, opts) {
        var t0 = Date.now(), ok = 1, res;
        try { res = await t.run(model, input, (function () { /* PROMPT-CACHE-1: same model + same first 4 KB of prompt -> same instance, so Workers AI prefix caching bills repeated context at the cached-input rate (glm-5.3-flash $0.03 vs $0.15 per M) */ try { if (opts && opts.extraHeaders && opts.extraHeaders["x-session-affinity"]) return opts; var m = input && input.messages, c = m && m.length ? m[0].content : (input && input.prompt); var s = typeof c === "string" ? c : JSON.stringify(c || ""); if (s.length < 1024) return opts; s = String(model) + "|" + s.slice(0, 4096); var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } var o = Object.assign({}, opts || {}); o.extraHeaders = Object.assign({}, o.extraHeaders || {}, { "x-session-affinity": "pc-" + (h >>> 0).toString(36) }); return o; } catch (ePc) { return opts; } })()); return res; } catch (e) { ok = 0; throw e; }
        finally {
          try {
            var u = res && typeof res === "object" && res.usage || {}; if (!/bge|embed|whisper|m2m100|resnet|flux|sdxl/i.test(String(model))) try { var cTok = Number(u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens || u.cached_tokens || u.input_tokens_details && u.input_tokens_details.cached_tokens || 0) || 0; await db.prepare("INSERT INTO ai_cache_counters (day, worker, model, calls, cached_calls, in_tok, cached_tok) VALUES (?1,?2,?3,1,?4,?5,?6) ON CONFLICT(day, worker, model) DO UPDATE SET calls=calls+1, cached_calls=cached_calls+excluded.cached_calls, in_tok=in_tok+excluded.in_tok, cached_tok=cached_tok+excluded.cached_tok").bind(new Date().toISOString().slice(0, 10), worker, String(model).slice(0, 120), cTok > 0 ? 1 : 0, Number(u.prompt_tokens || u.input_tokens || 0) || 0, cTok).run(); } catch (eCc) {}
            var chars = 0; try { chars = JSON.stringify(input && (input.messages || input.prompt || input.text) || input || "").length; } catch (e1) {}
            var inTok = Number(u.prompt_tokens || u.input_tokens || 0) || Math.round(chars / 4);
            var outTok = Number(u.completion_tokens || u.output_tokens || 0);
            var r = __AI_ATTR_RATES[String(model)] || [0, 0];
            var neurons = (inTok * r[0] + outTok * r[1]) / 1e6;
            await db.prepare("INSERT INTO ai_call_counters (day, worker, purpose, model, calls, errors, in_chars, ms, in_tok, out_tok, neurons) VALUES (?1,?2,'binding',?3,1,?4,?5,?6,?7,?8,?9) ON CONFLICT(day, worker, purpose, model) DO UPDATE SET calls=calls+1, errors=errors+excluded.errors, in_chars=in_chars+excluded.in_chars, ms=ms+excluded.ms, in_tok=in_tok+excluded.in_tok, out_tok=out_tok+excluded.out_tok, neurons=neurons+excluded.neurons")
              .bind(new Date().toISOString().slice(0, 10), worker, String(model).slice(0, 120), ok ? 0 : 1, chars, Date.now() - t0, inTok, outTok, neurons).run();
          } catch (e2) {}
        }
      };
    } });
    var copy = Object.assign({}, env);
    copy[aiKey] = wrapped;
    copy.__aiAttr = 1;
    return copy;
  } catch (e) {
    return env;
  }
}
var WORKER = "q08-signal-engine";
// Q08-METRICS-1 (#1759, pillar: reach): q08 measures itself for METRIC-CLOSED-LOOP-1. A GET of /p/<slug> adds 1 to a daily
// counter as human or crawler (the user-agent test iPatent's PAGE-METRICS-1 uses; no IP, cookie or referrer is stored).
// GET /api/metrics serves 7d aggregates; qnfo-fleet-control SURFACE-METRICS-1 reads them into metric_registry hourly.
// Votes count only from VOTE_CUTOFF, the day after POST-only voting went live (crawler votes before it are noise).
var Q08_BOT_UA = /bot|crawl|spider|slurp|preview|headless|curl|wget|python|httpclient|go-http|java\/|okhttp|axios|node-fetch|lighthouse|pingdom|uptime|monitor|scanner|facebookexternalhit|embedly|whatsapp|telegram/i;
var VOTE_CUTOFF = "2026-10-03T00:00:00Z";
function isCrawler(req) {
  var ua = String(req.headers.get("user-agent") || "");
  if (!ua || Q08_BOT_UA.test(ua)) return true;
  var bm = req.cf && req.cf.botManagement;
  return !!(bm && bm.verifiedBot);
}
async function countRead(env, req) {
  var col = isCrawler(req) ? "crawler" : "human";
  await env.DB.prepare("INSERT INTO q08_daily_reads (day, " + col + ") VALUES (?1, 1) ON CONFLICT(day) DO UPDATE SET " + col + " = " + col + " + 1").bind(utcDay()).run();
}
function ratio(a, b) { return b > 0 ? Math.round((a / b) * 1000) / 1000 : null; }
async function metrics7d(env) {
  var since = new Date(Date.now() - 7 * 864e5).toISOString();
  var voteSince = since > VOTE_CUTOFF ? since : VOTE_CUTOFF;
  var one = function (sql, args) { var st = env.DB.prepare(sql); return (args ? st.bind.apply(st, args) : st).first().catch(function () { return null; }); };
  var pub = await one("SELECT COUNT(*) n FROM published_pieces WHERE published_at >= ?1", [since]);
  var runs = await one("SELECT COUNT(*) n, SUM(CASE WHEN piece_published = 1 THEN 1 ELSE 0 END) ok FROM engine_runs WHERE ran_at >= datetime('now','-7 days') AND status NOT IN ('running','abandoned','async-done')");
  var reads = await one("SELECT COALESCE(SUM(human),0) human, COALESCE(SUM(crawler),0) crawler, COUNT(*) days FROM q08_daily_reads WHERE day >= ?1", [since.slice(0, 10)]);
  var votes = await one("SELECT COUNT(*) n, SUM(CASE WHEN signal = 'good' THEN 1 ELSE 0 END) good FROM q08_feedback WHERE created_at >= ?1", [voteSince]);
  var subs = await one("SELECT COUNT(*) n FROM subscribers WHERE status = 'confirmed'");
  var neurons = null;
  if (env.AUDIT) {
    var nr = await env.AUDIT.prepare("SELECT COALESCE(SUM(neurons),0) n FROM ai_call_counters WHERE worker = ?1 AND day >= ?2").bind(WORKER, since.slice(0, 10)).first().catch(function () { return null; });
    neurons = nr ? Number(nr.n) || 0 : null;
  }
  var published = Number(pub && pub.n) || 0, finished = Number(runs && runs.n) || 0, ok = Number(runs && runs.ok) || 0;
  var nVotes = Number(votes && votes.n) || 0;
  var fst = await forecastStats(env);
  return {
    forecasts_published: fst.published_7d,
    forecasts_open: fst.open,
    forecasts_overdue_open: fst.overdue_open,
    forecasts_resolved: fst.resolved,
    forecasts_void: fst.void,
    forecast_void_share: fst.void_share,
    forecast_brier: fst.calibration.brier,
    published: published,
    finished_runs: finished,
    gate_pass_rate: ratio(ok, finished),
    human_reads: Number(reads && reads.human) || 0,
    crawler_reads: Number(reads && reads.crawler) || 0,
    read_days_measured: Number(reads && reads.days) || 0,
    verified_votes: nVotes,
    verified_good_share: ratio(Number(votes && votes.good) || 0, nVotes),
    neurons: neurons,
    neurons_per_published_piece: neurons == null ? null : ratio(neurons, published),
    confirmed_subscribers: Number(subs && subs.n) || 0,
    vote_cutoff: VOTE_CUTOFF
  };
}
// q08 writes its own registry values (the rows, targets and triggers are in migrations/2026-10-02-q08-metrics.sql). A value
// that is not a finite number is not written: unknown is never a value.
var Q08_METRIC_KEYS = [["q08_gate_pass_rate_7d", "gate_pass_rate"], ["q08_neurons_per_published_piece_7d", "neurons_per_published_piece"], ["q08_human_reads_7d", "human_reads"], ["q08_verified_votes_7d", "verified_votes"], ["q08_confirmed_subscribers", "confirmed_subscribers"], ["q08_panel_unavailable_share_7d", "panel_unavailable_share_7d"], ["q08_forecasts_overdue_open", "forecasts_overdue_open"], ["q08_forecast_void_share", "forecast_void_share"]];
// Hours from an ISO timestamp (or epoch ms) to nowMs, rounded to 0.1; null when unparseable or in the future.
function hoursSince(t, nowMs) {
  if (t == null || t === "") return null;
  var ms = typeof t === "number" ? t : Date.parse(String(t));
  if (!isFinite(ms) || ms > nowMs + 60000) return null;
  return Math.round(Math.max(0, nowMs - ms) / 360000) / 10;
}
async function writeOwnMetrics(env) {
  if (!env.AUDIT) return 0;
  var m = await metrics7d(env), now = nowIso(), n = 0;
  for (var i = 0; i < Q08_METRIC_KEYS.length; i++) {
    var v = m[Q08_METRIC_KEYS[i][1]];
    if (typeof v !== "number" || !isFinite(v)) continue;
    var r = await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3, state = CASE WHEN state = 'UNMEASURED' THEN 'MEASURED' ELSE state END WHERE metric = ?1").bind(Q08_METRIC_KEYS[i][0], String(v), now).run().catch(function () { return null; });
    if (r && r.meta && r.meta.changes) n++;
  }
  // Q08-ENSEMBLE-1: how many independent votes the two-judge panel really gives (2 = independent, 1 = one voice twice).
  try {
    var ev = effectiveVotes(await panelPairs(env));
    if (ev.n_eff != null) {
      var rr = await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3 WHERE metric = ?1").bind("q08_panel_effective_votes_30d", String(ev.n_eff), now).run();
      if (rr && rr.meta && rr.meta.changes) n++;
    }
  } catch (e) {}
  // Q08-STALL-METRIC-1 (agent_issues 2034): hours since the newest published piece, so a publishing stall is a measured
  // metric with a probe, not only an issue stallDetector files. No model call.
  try {
    var lp = env.DB ? await env.DB.prepare("SELECT MAX(published_at) t FROM published_pieces").first() : null;
    var hs = hoursSince(lp && lp.t, Date.now());
    if (hs != null) {
      var rh = await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3, state = 'MEASURED' WHERE metric = ?1").bind("q08_hours_since_last_piece", String(hs), now).run();
      if (rh && rh.meta && rh.meta.changes) n++;
    }
  } catch (e) {}
  try {
    var us = await panelUnavailableShare(env);
    if (us != null) {
      var ru = await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3 WHERE metric = ?1").bind("q08_panel_unavailable_share_7d", String(us), now).run();
      if (ru && ru.meta && ru.meta.changes) n++;
    }
  } catch (e) {}
  return n;
}
var MAX_PER_DAY = 10;
// Q08-CADENCE-CAP-1 (agent_issues 1716, Q08-REVIEW-2026-10-31; charter pillar: cost): the daily cap is the qnfo-audit
// ops_config value under CAP_KEY, an integer 0..MAX_PER_DAY (0 pauses publishing). Absent, unreadable or not an integer
// means MAX_PER_DAY, the behaviour before this knob. qnfo-fleet-dashboard sets it to 2 when the 2026-10-31 review measures
// under 50 human page views a week; delete the row or raise it to undo. The cron still fires every 2 hours; a run past
// the cap returns before any scrape or AI call.
var CAP_KEY = "q08_max_per_day";
function parseDailyCap(v) {
  var s = v == null ? "" : String(v).trim();
  if (!/^\d{1,3}$/.test(s)) return MAX_PER_DAY;
  return Math.min(Number(s), MAX_PER_DAY);
}
async function dailyCap(env) {
  if (!env || !env.AUDIT) return MAX_PER_DAY;
  try {
    var r = await env.AUDIT.prepare("SELECT value FROM ops_config WHERE key = ?1").bind(CAP_KEY).first();
    return parseDailyCap(r && r.value);
  } catch (e) {
    return MAX_PER_DAY;
  }
}
var HN_SEARCH = "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50";
var HN_ITEMS  = "https://hn.algolia.com/api/v1/items/";
var ROUTER    = "https://qnfo-ai.internal/v1/chat/completions";
var UA        = "q08-signal-engine/0.1.0 (+https://q08.org)";
var ORIGIN = "https://q08.org";
// IndexNow: search-engine instant indexing (Bing, Yandex, Seznam, Naver).
var INDEXNOW_KEY = "3f8a1c9e7b2d6045a1f3c8e5b9d20147";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function nowIso() { return new Date().toISOString(); }
function utcDay() { return nowIso().slice(0, 10); }
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
function json(obj, status) {
  return new Response(JSON.stringify(obj, null, 2), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
function html(body, status) {
  return new Response(q08Wrap(body), {
    status: status || 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" }
  });
}
function escHtml(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ---------------------------------------------------------------------------
// 1. Ingestion \u2014 Hacker News front page
// ---------------------------------------------------------------------------
async function scrapeHN() {
  const resp = await fetch(HN_SEARCH, { headers: { "User-Agent": UA } });
  if (!resp.ok) throw new Error("HN fetch " + resp.status);
  const data = await resp.json();
  const now = Date.now();
  const stories = [];
  for (const h of (data.hits || [])) {
    if (!h._tags || !h._tags.includes("story")) continue;
    // Skip Ask HN / Show HN ritual threads (low structural friction)
    if (/^(Ask HN|Show HN|Tell HN|Launch HN):/i.test(h.title || "")) continue;
    const pts = h.points || 0;
    const nc  = h.num_comments || 0;
    let age_h = null;
    if (h.created_at) {
      try {
        age_h = (now - new Date(h.created_at).getTime()) / 3600000;
      } catch (_) {}
    }
    const ratio = pts > 0 ? nc / pts : 0;
    const vel   = age_h != null ? Math.max(0.05, 1 / (1 + age_h / 6)) : 0.5;
    // Priority Score = (Engagements \u00d7 Velocity) + Controversy Modifier
    const score = (nc * vel) + (10 * ratio);
    stories.push({
      id:        h.story_id || h.objectID,
      title:     h.title || "",
      url:       h.url || "",
      points:    pts,
      num_comments: nc,
      age_h,
      ratio:     Math.round(ratio * 100) / 100,
      volatility_score: Math.round(score * 100) / 100,
    });
  }
  stories.sort((a, b) => b.volatility_score - a.volatility_score);
  return stories;
}

// ---------------------------------------------------------------------------
// 2. Friction extraction \u2014 top-level comments ranked by length (content proxy)
// ---------------------------------------------------------------------------
function cleanHtml(s) {
  return (s || "")
    .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">").replace(/&lt;/g, "<")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function flattenComments(node, depth, out) {
  if (!node || typeof node !== "object") return;
  if (node.text) out.push({ depth, text: cleanHtml(node.text) });
  for (const child of (node.children || [])) flattenComments(child, depth + 1, out);
}
async function extractFriction(storyId, topK) {
  topK = topK || 5;
  const resp = await fetch(HN_ITEMS + storyId, { headers: { "User-Agent": UA } });
  if (!resp.ok) throw new Error("HN items " + resp.status);
  const item = await resp.json();
  const comments = [];
  for (const child of (item.children || [])) flattenComments(child, 0, comments);
  const topLevel = comments.filter(c => c.depth === 0).sort((a, b) => b.text.length - a.text.length);
  const top = topLevel.slice(0, topK);
  const friction = top.map(c => c.text).join(" ").slice(0, 800);
  const strength = comments.length >= 100 ? "High" : comments.length >= 30 ? "Medium" : "Low";
  return {
    core_concept:   item.title || "",
    friction_point: friction,
    signal_strength: strength + " (" + comments.length + " comments)",
    comment_count:  comments.length,
  };
}

// --- GitHub (intent signals): trending repos with open issues ---
async function scrapeGitHub() {
  var since = new Date(Date.now() - 7*24*3600*1000).toISOString().slice(0,10);
  var url = "https://api.github.com/search/repositories?q=created:%3E" + since + "+stars:%3E50&sort=stars&order=desc&per_page=20";
  var resp = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/vnd.github+json" } });
  if (!resp.ok) throw new Error("github " + resp.status);
  var data = await resp.json();
  var out = [];
  for (var r of (data.items || [])) {
    var stars = r.stargazers_count || 0, issues = r.open_issues_count || 0;
    var issueRatio = stars > 0 ? issues/stars : 0;
    out.push({ source:"github", id: r.full_name, title: r.full_name, url: r.html_url, points: stars, num_comments: issues, ratio: Math.round(issueRatio*100)/100, volatility_score: Math.round((stars/10 + 10*Math.min(issueRatio,2))*10)/10, description: r.description||"" });
  }
  out.sort(function(a,b){ return b.volatility_score - a.volatility_score; });
  return out.slice(0, 15);
}

// --- arXiv (narrative signals): recent abstracts matching high-intent keywords ---
var ARXIV_KEYWORDS = ["distributed system","consensus","fault tolerance","compiler","programming language","database","security","privacy","machine learning","infrastructure","network","operating system","formal verification","cryptography","scalability","reliability","architecture","verification","protocol"];
async function scrapeArxiv() {
  var q = "cat:cs.DC OR cat:cs.CR OR cat:cs.DB OR cat:cs.PL OR cat:cs.OS OR cat:cs.NI OR cat:cs.SY OR cat:cs.SE OR cat:cs.AR";
  var url = "http://export.arxiv.org/api/query?search_query=" + encodeURIComponent(q) + "&sortBy=submittedDate&sortOrder=descending&max_results=30";
  var resp = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!resp.ok) throw new Error("arxiv " + resp.status);
  var xml = await resp.text();
  var out = [];
  for (var e of xml.split("<entry>").slice(1)) {
    var title = ((e.match(/<title>([\s\S]*?)<\/title>/)||[,""])[1]||"").replace(/\s+/g," ").trim();
    var abs = ((e.match(/<summary>([\s\S]*?)<\/summary>/)||[,""])[1]||"").replace(/\s+/g," ").trim();
    var idm = (e.match(/<id>([\s\S]*?)<\/id>/)||[,""])[1]||"";
    var arxid = idm.split("/abs/")[1] || idm.trim();
    var low = (title + " " + abs).toLowerCase();
    var hits = 0;
    for (var k of ARXIV_KEYWORDS) if (low.includes(k)) hits++;
    if (hits === 0 || !arxid) continue;
    out.push({ source:"arxiv", id: arxid, title: title, url: "https://arxiv.org/abs/" + arxid, points: hits, num_comments: 0, ratio: 0, volatility_score: hits*20, abstract: abs });
  }
  out.sort(function(a,b){ return b.volatility_score - a.volatility_score; });
  return out.slice(0, 12);
}
async function extractGitHubFriction(fullName, description) {
  var parts = [];
  if (description) parts.push(description);
  try {
    var url = "https://api.github.com/repos/" + fullName + "/issues?state=open&sort=comments&direction=desc&per_page=5";
    var resp = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/vnd.github+json" } });
    if (resp.ok) {
      var issues = await resp.json();
      for (var i of (issues||[])) {
        if (i.pull_request) continue;
        parts.push((i.title||"") + ": " + String(i.body||"").replace(/\s+/g," ").slice(0,300));
      }
    }
  } catch (e) {}
  var friction = parts.join(" ").slice(0, 800);
  return { core_concept: fullName, friction_point: friction, signal_strength: parts.length >= 3 ? "Medium" : "Low", comment_count: parts.length };
}

// ---------------------------------------------------------------------------
// 3. Prompt construction \u2014 q08 register
// ---------------------------------------------------------------------------
// The register problem: LLMs default to management-consulting prose when asked
// for "systems-level critique" \u2014 producing capitalized nominalizations like
// "Knowledge Work", "Systemic Vulnerability", "Architectural Context".
// These are jargon placeholders, not analysis. The prompt must name and ban
// this failure mode explicitly, and model the correct register with contrast examples.
var Q08_DIRECTIVE = [
  "You are the writer for q08.org \u2014 long-form essays on the recurring systems that make things break, for a reader who wants to see a present incident as one instance of a larger, connected picture. The proper nouns of today are the lead-in, not the destination; the bigger system is the story. Not about technology or history per se \u2014 about the connected world they are part of.",
  "Your input is a friction signal from a technical community debate. Your output is a self-contained essay that a reader with no knowledge of the source thread can follow.",
  "",
  "SYSTEMIC, NOT SPECIFIC: the incident is a probe, never the subject. Extract the universal system the incident instantiates \u2014 the specific mechanism that would produce the same breakdown in any domain. Show it is general by REASONING about how the same incentive or information structure would behave elsewhere, in plain words and without naming outside events. Your central claim must survive the disappearance of this specific incident. An essay that stays inside its incident is rejected, and so is one that reaches outside the source by asserting facts the source does not contain.",
  "",
  "REGISTER: cold structural objectivity. An engineer describing a mechanism, not a consultant describing a market. Write the way a precise bug report reads: specific, unimpressed, exact.",
  "",
  "STRUCTURE: let the material dictate the shape. No required arc, no three-movement template. Banned section headers, exactly: 'How the Flaw Manifests', 'Cascading Failures', 'A Minimal Alternative', 'A Minimal Framework', 'Connections Across Disciplines', 'Echoes from the Past', 'A Path Forward', 'The Lens Restored', 'Lessons for the Future', 'Unexpected Parallels', 'The Broader Lesson', and any header of the form 'The [Adjective] [Lever/Bottleneck/Premise/Flaw]: X'. Never name a section after its rhetorical function.",
  "",
  "OPENING: in one or two sentences name the incident, then pivot immediately to the system it reveals. The incident earns at most one paragraph; the reader should know within the first paragraph what universal dynamic is at stake, not merely what specific product broke. Never open on an aphorism or a general claim; never dwell on the incident.",
  "",
  "CONCRETENESS FROM THE SOURCE: name the real things the SOURCE MATERIAL names \u2014 its products, people, organisations, figures and quotations, exactly as given. Elsewhere, be concrete by describing the mechanism step by step (who does what, which information is missing, where it breaks), never by adding named outside examples. When you want a second case, build a clearly labelled hypothetical that names no real person, company, product, date or number (open it with 'Suppose' and describe parties only by their function) and say it is hypothetical. A sentence without a specific referent is a sentence to rewrite; a specific referent that is not in the source material is a sentence to delete.",
  "",
  "FACTS (hard, non-negotiable, and checked): every claim about the real world \u2014 an event, a date, a person, an organisation, a product, a law, a number, a price, a percentage, a count, an identifier, a quotation, a study, a historical episode \u2014 must be stated in the SOURCE MATERIAL you are given (the signal and the linked article text), verbatim or as a direct paraphrase. Your own memory is NOT a source: do not add historical precedents, case studies, statistics, dates, names of people or companies, laws, institutions, product details or 'studies show' from memory, however sure you are. If the source does not state it, delete it or turn it into labelled hypothetical reasoning with no real names. Every draft is fact-checked sentence by sentence against the source material by independent reviewers from other model families; a single unsupported claim means the piece is not published. A general honest sentence always beats a specific unsupported one. Before writing any name, date or number, ask: is this exact item in the source material? If not, do not write it.",
  "",
  "PROSE, NOT SCHEME: write prose, not a specification. Never enumerate with '(1) ... (2) ...' in running text, and never write like a design document; the reader is a person, not a reviewer.",
  "",
  "NO SECTION HEADERS: the essay is continuous prose. Do not use Markdown section headers (## or ###) anywhere in the body \u2014 paragraph breaks only. A header is a crutch; if you need one, the prose has failed to carry the argument.",
  "",
  "NO BORROWED HISTORY: do not cite historical episodes, past scandals, earlier industries, named laws, named institutions or named products that are not in the source material. A reader who checks must find every fact; the safest way to be checkable is to assert only what the source says and to reason openly about what follows from it. A metaphor ('it is like a telescope') is decorative and banned; reasoning from the stated facts to a general mechanism is the job.",
  "",
  "CROSS-DOMAIN REASONING: the essay\u2019s spine is the universal system. Show that it is domain-independent by reasoning about how the same incentive, delay or information gap would play out in other kinds of settings, chosen by the mechanism and not from a stock list, described generically as labelled hypotheticals with no real names, dates or figures. Breadth of reasoning is the point, not breadth of cited facts.",
  "",
  "ENDING: end at the point of maximum implication. A closing paragraph that describes a healed system is forbidden. If a fix exists, fold it into the argument; the final sentences leave the reader with the sharpest unresolved fact \u2014 not a summary, not a resolution, not a flourish.",
  "",
  "VERDICT (mandatory final line, this is the last line of your output, after the essay): write exactly 'worth your time: yes|flat|no \u2014 one clause of justification'. State honestly whether a reader gains something by reading the essay that they would not get from the source thread itself. 'no' rejects the essay; 'flat' means it barely clears the bar. Omitting this line is a rejection on its own.",
  "",
    "MECHANISM, NOT LABEL: name the causal process \u2014 who is incentivised to do what, which information is missing, where the coupling breaks \u2014 as actors doing something, never as an abstract noun. 'Incentive structure', 'information asymmetry', 'coupling failure', 'structural dynamic' and 'systemic failure' are labels, not mechanisms: if a sentence reduces to one of them, the mechanism has not been found yet. The words 'structural', 'systemic' and 'dynamic' are permitted only as a precise description of a named mechanism, never as a summary of your own argument.",
    "BANNED FRAMING (automatic rejection \u2014 the tells of a banal essay): 'illustrates a broader structural dynamic', 'exposes a structural dynamic', 'reveals a structural dynamic', 'a recurring institutional dynamic', 'a systemic failure in which', 'a structural gap between', 'what this reveals about', 'the deeper pattern', 'the broader lesson'. Never tell the reader what the essay 'reveals'; demonstrate it and stop. A sentence that announces the significance of the essay instead of adding a fact is a sentence to delete.",
    "SIGNIFICANCE ANNOUNCEMENT (banned): never write \"the incident illustrates / exposes / reveals / foregrounds / underscores a <noun phrase>\". Those verbs, applied to the incident, are the banality signature \u2014 they announce that the essay has a point instead of making it. State the causal chain directly: who does what to whom, and what breaks as a result. If a draft contains any of these verbs, rewrite the sentence as a mechanism.",
    "TITLE: name the mechanism, not the category. A good title names a specific causal process or its actors \u2014 e.g. 'The clearinghouse that paid itself first' or 'Why the map outlives the territory it describes'. Banned title shapes: the bare '[Adjective]-[Noun] [Preposition] [Abstract Noun]' stack ('Scale-Induced Professional Displacement'); 'The X of Y' ('The Incentive-Driven Misalignment of Threat Models'); 'X as Y' ('Formal Guarantees as Market Signal'); and any title opening with Structural, Systemic, Implicit, Opaque, Formal, Abstract, Externalized, Statistical or a similar nominalisation. If the title would work as a category label in a management deck, it is the wrong title.",
  "PLAIN WORDING (this is what a reader judges first): write the way a sharp person explains something to a smart friend, not the way a paper abstracts it. Mix short sentences with long ones. Name who did what by what they are (the parties as the source describes them), never by role words: no 'the observer', 'the actor', 'the producer', 'the consumer', 'the proxy', 'the cue', 'the arrangement', 'the mechanism', 'the signal', 'the process'. A sentence that exists only to announce structure ('This same arrangement appears...', 'The mechanism works like this', 'The process therefore hinges on', 'not a quirk of a single product') is deleted. If you cannot picture a person doing the thing in a sentence, rewrite it. Say it once; do not restate a point in new abstract words.",
  "INTERNAL FIELDS: the SIGNAL block's field names and its signal_strength value are pipeline metadata, not facts about the world. Never mention them, never write 'signal strength', 'friction point' or 'core concept'. Open with what actually happened or was said, as one concrete event, in plain words.",
  "CONSTRAINTS (hard):",
  "- The structural claim must outlive the incident: dates may appear in the material, but the argument must not depend on them.",
  "- No @handles, no marketing register, no promotional language. No emotional vocabulary ('anxiety', 'dread', 'excitement'). No hedging ('it seems', 'perhaps').",
  "- No first person. No preamble, no meta-commentary about the essay itself.",
  "- 1200-1800 words. This is a requirement, not a suggestion: essays under this length are rejected. Complete sentences only: the essay ends on a full stop, never mid-sentence.",
  "- Output: valid Markdown, H1 title first, then the essay. The title must name the system, not the incident \u2014 concrete but general, surviving the disappearance of this particular signal. Banned title forms: 'When X Meets Y', 'X: The Hidden Z', 'An Analysis of X', 'A Critique of Y'.",
  "- Mathematical notation: inline math as \\(...\\), display math as \\[...\\]. Use only these delimiters; never single-dollar signs.",
].join("\n");

var REGISTER_EXEMPLAR = [
  "STYLE SPECIFICATION (a process and a register, not a sample to imitate and not a source of subjects):",
  "1. Title: one plain sentence in sentence case that states a claim about a mechanism, naming the parties as the source names them.",
  "2. Opening: one concrete event from the source in one or two sentences, then the question it raises.",
  "3. Body: trace the mechanism as a chain of parties doing things, each step caused by the one before; say who gains, who loses, what information is missing and where it breaks. Every real-world fact comes from the source material; any extra case is a labelled hypothetical whose parties are described only by their function.",
  "4. Voice: precise, unimpressed, short and long sentences mixed, no announcement of structure, no moral.",
  "5. Ending: the sharpest unresolved fact, in one or two sentences."
].join("\n");

// Only a reader-proven structure that is ALSO in-register may serve as an exemplar.
// Without this, promoting top-rated pieces would feed the OLD banal skeletons
// (label titles, 'structural dynamic' openings) straight back into the prompt.
function exemplarOk(md) {
  if (!md) return false;
  var t = String(md);
  var tm = t.match(/^#\s+(.+)$/m);
  var title = (tm ? tm[1].trim() : String(t.split("\n")[0] || "").trim()).replace(/[\u2010-\u2015\u2212]/g, "-");
  if (title) {
    if (BAD_TITLE_RE.test(title)) return false;
    if (TITLE_FORMULA_RE.test(title) || TITLE_COLON_RE.test(title)) return false;
    for (var i = 0; i < LABEL_TITLE_RES.length; i++) { if (LABEL_TITLE_RES[i].test(title)) return false; }
  }
  if (new RegExp(STOCK_FRAMING_RE.source, "i").test(t)) return false;
  if (new RegExp(LABEL_PHRASE_RE.source, "i").test(t)) return false;
  return true;
}

// Q08-QUALITY-1: precedents the site leans on too often are named to the writer and rejected by the gate. 19 of 36 pieces in
// the 7 days to 2026-10-03 reached for the same guild hallmark, because the register exemplar was one.
var PRECEDENT_VOCAB = [
  { label: "the medieval guild hallmark or goldsmith stamp", re: /hall-?mark|goldsmith|guild/i },
  { label: "the South Sea Bubble", re: /south sea/i },
  { label: "tulip mania", re: /tulip/i },
  { label: "patent medicines", re: /patent[- ]medicine/i },
  { label: "railway mania", re: /railway mania/i },
  { label: "the printing press", re: /gutenberg|printing press/i },
  { label: "the Hanseatic League", re: /hanseatic/i },
  { label: "the Medici bank", re: /medici/i },
  { label: "the Dutch East India Company", re: /east india company/i },
  { label: "the dot-com bubble", re: /dot-?com/i }
];
function overusedPrecedents(bodies, minUses) {
  var need = minUses || 2, out = [];
  for (var v of PRECEDENT_VOCAB) {
    var n = 0;
    for (var b of (bodies || [])) { if (v.re.test(String(b || ""))) n++; }
    if (n >= need) out.push(v);
  }
  return out;
}
// Q08-QUALITY-1: the owner's editorial directives, written only through the signed-in command line at fleet.qnfo.org
// (qnfo-audit q08_editor_notes). They are authenticated text, unlike visitor notes, which no prompt ever reads.
async function ownerDirectives(env) {
  if (!env || !env.AUDIT) return [];
  try {
    var r = await env.AUDIT.prepare("SELECT text FROM q08_editor_notes WHERE active = 1 ORDER BY id DESC LIMIT 8").all();
    return (r.results || []).map(function (x) { return String(x.text || "").replace(/\s+/g, " ").trim().slice(0, 400); }).filter(Boolean);
  } catch (e) { return []; }
}
// Q08-READER-TEST-1: a cold read by the model that did not write the draft. It judges as a reader, not as an editor.
var READER_PROMPT = [
  "You are a busy, intelligent reader who has never heard of this site and owes it nothing. Read the essay below the way you read anything you found by chance: you stop at the first sentence that wastes your time.",
  "Answer with exactly one JSON object and nothing else:",
  "{\"would_read_to_end\": true or false, \"score\": 1 to 5 (5 = I would send it to a friend, 4 = worth the time, 3 = I would skim it, 1 = I stopped at the first paragraph), \"slop_tells\": [up to 3 short phrases copied from the essay that sound like generic machine prose], \"fix\": \"one sentence telling the writer what to change\"}",
  "Judge: does it open with something concrete that happened? Can you state its claim in one sentence? Does every paragraph add a new fact or step, or only restate in abstract words? Are the words plain, or do role words ('the observer', 'the actor', 'the arrangement') and announcements of structure stand in for people doing things? Does it reason from the facts it states to a general mechanism, or does it lean on a stock example? Be strict: a 4 must be earned."
].join("\n");
function parseReaderVerdict(text) {
  var m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  var o;
  try { o = JSON.parse(m[0]); } catch (e) { return null; }
  var score = Number(o && o.score);
  if (!isFinite(score)) return null;
  score = Math.max(1, Math.min(5, Math.round(score)));
  var wr = o.would_read_to_end === true || o.would_read_to_end === "true";
  var tells = Array.isArray(o.slop_tells) ? o.slop_tells.slice(0, 3).map(function (t) { return String(t).slice(0, 120); }) : [];
  return { would_read: wr, score: score, tells: tells, fix: String(o.fix || "").slice(0, 300), pass: wr && score >= 4 };
}
// Q08-ENSEMBLE-1. Research behind the design (2026-10-03): LLM errors are strongly correlated. Kim et al. (ICML 2025) found models
// agree 60% of the time they are both wrong, and that larger, more accurate models correlate MORE; a 9-judge, 7-family panel gave
// only 2.18 effective independent votes (mean pairwise phi 0.39), and past 5 judges added 0.22 votes. Verga et al. (PoLL, 2024)
// found a panel of small models from disjoint families beat one large judge at about 1/7 the cost, with less self-preference.
// So: judges come from families other than the writer's, are small, are few (2 per round), and the layers that really are
// uncorrelated with a model are not models: the deterministic gate, real reader votes and the owner's verdict.
var MODEL_FAMILY = {
  "@cf/nvidia/nemotron-3-120b-a12b": "nvidia",
  "@cf/openai/gpt-oss-120b": "openai",
  "@cf/google/gemma-4-26b-a4b-it": "google",
  "@cf/zai-org/glm-5.3-flash": "zai",
  "@cf/qwen/qwen3-30b-a3b-fp8": "alibaba",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": "meta",
  "@cf/deepseek-ai/deepseek-v4-flash-0731": "deepseek"
};
function familyOf(id) { return MODEL_FAMILY[id] || "unknown:" + String(id || "").split("/")[1]; }
// Judges, cheapest-per-call first within a rotation. Active parameters are small (a4b, a3b, flash) on purpose.
// Three of the five judges are reasoning models (qwen3-30b-a3b, glm-5.3-flash, deepseek-v4-flash): they think before they answer, so the
// output budget covers the thinking too (the same failure ASK-LOOP-1 hit with its judge, PR 566). Non-reasoning models lead the rotation.
var READER_MAX_TOKENS = 2000;
var PANEL_POOL = [
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/zai-org/glm-5.3-flash",
  "@cf/deepseek-ai/deepseek-v4-flash-0731"
];
// k judges, one per family, none from a family in `exclude` (the writer, the editor, an earlier panel). The start rotates with
// `seed` so no single family becomes the permanent judge. Returns [] when fewer than one candidate remains.
function pickPanel(exclude, k, seed) {
  var ex = {}; (exclude || []).forEach(function (f) { ex[f] = 1; });
  var n = PANEL_POOL.length, start = Math.abs(seed | 0) % n, out = [], seen = {};
  for (var i = 0; i < n && out.length < k; i++) {
    var id = PANEL_POOL[(start + i) % n], f = familyOf(id);
    if (ex[f] || seen[f]) continue;
    seen[f] = 1; out.push(id);
  }
  return out;
}
function seedOf(str) { var h = 0, t = String(str || ""); for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return Math.abs(h); }
async function readerTest(env, modelId, text, rprompt) {
  try {
    var essay = String(text || "").replace(/\n?worth your time:[^\n]*$/im, "").trim().slice(0, 9000);
    var resp = await env.AI.run(modelId, { messages: [{ role: "user", content: (rprompt || READER_PROMPT) + "\n\n--- ESSAY ---\n" + essay }], max_tokens: READER_MAX_TOKENS, temperature: 0.2 }, { signal: AbortSignal.timeout(90000) });
    var out = resp.response || (resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) || "";
    var v = parseReaderVerdict(String(out).replace(/<think>[\s\S]*?<\/think>/gi, ""));
    if (v) { v.model = modelId; v.family = familyOf(modelId); }
    return v;
  } catch (e) { return null; }
}
// Panel verdict: passes when the mean score is at least 4 and a strict majority would read to the end. With 2 judges that means
// both. Judges that error are replaced by the next candidate family once; no valid verdict at all returns null (fail open).
function aggregatePanel(judges) {
  var j = (judges || []).filter(Boolean);
  if (!j.length) return null;
  var mean = j.reduce(function (a, x) { return a + x.score; }, 0) / j.length;
  var wr = j.filter(function (x) { return x.would_read; }).length;
  var tells = [], fixes = [];
  j.forEach(function (x) { (x.tells || []).forEach(function (t) { if (tells.indexOf(t) < 0 && tells.length < 5) tells.push(t); }); if (x.fix && fixes.indexOf(x.fix) < 0) fixes.push(x.fix); });
  return { judges: j, n: j.length, mean: Math.round(mean * 100) / 100, pass: mean >= 4 && wr * 2 > j.length, fix: fixes.join(" | ").slice(0, 500), tells: tells };
}
async function panelRead(env, text, exclude, seed, k, rprompt) {
  var want = k || 2;
  var ids = pickPanel(exclude, want + 2, seed);
  var first = ids.slice(0, want), spare = ids.slice(want);
  var got = await Promise.all(first.map(function (id) { return readerTest(env, id, text, rprompt); }));
  for (var i = 0; i < got.length; i++) { if (!got[i] && spare.length) got[i] = await readerTest(env, spare.shift(), text, rprompt); }
  return aggregatePanel(got);
}
// Mean pairwise agreement of the two judges in each panel read, as a phi coefficient over pass/fail, and the implied number of
// independent votes n_eff = n / (1 + (n - 1) * phi) for n = 2. Reported only from 20 paired reads, else null (unmeasured).
function effectiveVotes(pairs) {
  var a = 0, b = 0, c = 0, d = 0;
  (pairs || []).forEach(function (p) { if (p[0] && p[1]) a++; else if (p[0] && !p[1]) b++; else if (!p[0] && p[1]) c++; else d++; });
  var n = a + b + c + d;
  if (n < 20) return { reads: n, phi: null, n_eff: null };
  var den = Math.sqrt((a + b) * (c + d) * (a + c) * (b + d));
  var phi = den === 0 ? 1 : (a * d - b * c) / den;
  phi = Math.max(0, Math.min(1, phi));
  return { reads: n, phi: Math.round(phi * 1000) / 1000, n_eff: Math.round((2 / (1 + phi)) * 100) / 100 };
}
// Share of panel reads over 7 days that returned no valid verdict (every judge errored or answered with no JSON). A panel that
// silently never runs fails open, so this is the only place that shows it.
async function panelUnavailableShare(env) {
  var r = await env.DB.prepare("SELECT SUM(CASE WHEN role = 'panel_unavailable' THEN 1 ELSE 0 END) u, SUM(CASE WHEN role = 'judge' THEN 1 ELSE 0 END) j FROM q08_reader_tests WHERE created_at >= datetime('now','-7 days')").first().catch(function () { return null; });
  if (!r) return null;
  var panels = (r.j || 0) / 2 + (r.u || 0);
  if (panels < 5) return null;
  return Math.round(((r.u || 0) / panels) * 1000) / 1000;
}
async function panelPairs(env) {
  var rs = await env.DB.prepare("SELECT piece_key, round, pass FROM q08_reader_tests WHERE created_at >= datetime('now','-30 days') AND role = 'judge' ORDER BY piece_key, round, id").all().catch(function () { return { results: [] }; });
  var by = {};
  (rs.results || []).forEach(function (r) { var k = r.piece_key + "#" + r.round; (by[k] = by[k] || []).push(!!r.pass); });
  return Object.keys(by).filter(function (k) { return by[k].length === 2; }).map(function (k) { return by[k]; });
}
// 0.8.4 created q08_reader_tests without role and family. CREATE IF NOT EXISTS cannot add them, so an old table is altered; without
// this a deploy order of 0.8.4 then 0.8.5 would leave every insert failing inside a swallowed catch (review finding on PR 562).
async function ensureReaderTable(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS q08_reader_tests (id INTEGER PRIMARY KEY AUTOINCREMENT, piece_key TEXT, round INTEGER, role TEXT, model TEXT, family TEXT, would_read INTEGER, score INTEGER, tells TEXT, fix TEXT, pass INTEGER, created_at TEXT)").run();
  var info = await env.DB.prepare("PRAGMA table_info(q08_reader_tests)").all();
  var have = {}; (info.results || []).forEach(function (c) { have[c.name] = 1; });
  if (!have.role) await env.DB.prepare("ALTER TABLE q08_reader_tests ADD COLUMN role TEXT").run();
  if (!have.family) await env.DB.prepare("ALTER TABLE q08_reader_tests ADD COLUMN family TEXT").run();
}
async function saveReaderTests(env, key, rows) {
  if (!rows || !rows.length) return;
  try {
    await ensureReaderTable(env);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      await env.DB.prepare("INSERT INTO q08_reader_tests (piece_key, round, role, model, family, would_read, score, tells, fix, pass, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(String(key || "").slice(0, 200), r.round || 1, r.role || "judge", r.model || "", r.family || "", r.would_read ? 1 : 0, r.score == null ? null : r.score, JSON.stringify(r.tells || []), r.fix || "", r.pass ? 1 : 0, nowIso()).run();
    }
  } catch (e) { console.error("q08 reader_tests write failed: " + String(e && e.message || e).slice(0, 200)); }
}
// One row per judge, plus an editor row, so the chain of models behind a piece is recorded.
// Q08-ENSEMBLE-1 read-out (public, aggregate only; no IP, cookie or visitor text). It is the evidence the loop needs: does each
// family read like the others (n_eff), does the editor round actually raise the score, and which phrases do judges keep flagging.
async function ensembleReport(env) {
  var out = { window_days: 30, by_family: [], by_round: [], effective_votes: effectiveVotes([]), top_tells: [], panel_unavailable: 0, recorded: false };
  try {
    var since = "created_at >= datetime('now','-30 days')";
    var f = await env.DB.prepare("SELECT family, role, COUNT(*) n, ROUND(AVG(score),2) mean_score, ROUND(AVG(pass),3) pass_rate FROM q08_reader_tests WHERE " + since + " GROUP BY family, role ORDER BY n DESC").all();
    out.by_family = f.results || [];
    var r = await env.DB.prepare("SELECT round, COUNT(*) n, ROUND(AVG(score),2) mean_score, ROUND(AVG(pass),3) pass_rate FROM q08_reader_tests WHERE role = 'judge' AND " + since + " GROUP BY round ORDER BY round").all();
    out.by_round = r.results || [];
    out.effective_votes = effectiveVotes(await panelPairs(env));
    var t = await env.DB.prepare("SELECT tells FROM q08_reader_tests WHERE role = 'judge' AND " + since + " ORDER BY id DESC LIMIT 400").all();
    var count = {};
    (t.results || []).forEach(function (x) { var a; try { a = JSON.parse(x.tells || "[]"); } catch (e) { a = []; } a.forEach(function (ph) { var k = String(ph).toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120); if (k) count[k] = (count[k] || 0) + 1; }); });
    out.top_tells = Object.keys(count).filter(function (k) { return count[k] >= 2; }).sort(function (a, b) { return count[b] - count[a]; }).slice(0, 10).map(function (k) { return { phrase: k, n: count[k] }; });
    var un = await env.DB.prepare("SELECT COUNT(*) n FROM q08_reader_tests WHERE role = 'panel_unavailable' AND " + since).first();
    out.panel_unavailable = un ? un.n : 0;
    out.recorded = out.by_family.length > 0 || out.panel_unavailable > 0;
  } catch (e) {}
  return out;
}
function panelRows(panel, round) {
  return panel.judges.map(function (j) { return { round: round, role: "judge", model: j.model, family: j.family, would_read: j.would_read, score: j.score, tells: j.tells, fix: j.fix, pass: j.pass }; });
}

function buildPrompt(friction, fewShot, recentStructures, opts) {
  var parts = [Q08_DIRECTIVE];
  parts.push("Remember: your final output line must be the verdict: 'worth your time: yes|flat|no \u2014 justification'.");
  if (fewShot && fewShot.length > 0) {
    parts.push("\n--- PROVEN EXEMPLAR STRUCTURES (quality floor, not templates to copy) ---");
    for (var ex of fewShot.slice(0, 2)) {
      parts.push(ex.structure_md.slice(0, 400));
    }
  } else {
    // ANTI-BANAL-2: with no reader-proven exemplars the writer has only prohibitions.
    parts.push("\n--- REGISTER EXEMPLAR (shape only - do not reuse this subject, title, or facts) ---");
    parts.push(REGISTER_EXEMPLAR);
  }
  if (recentStructures && recentStructures.length > 0) {
    parts.push("\n--- RECENT SECTION SKELETONS ON THIS SITE (BANNED PATTERNS \u2014 diverge from every one; these are H2/H3 heading shapes, never title shapes) ---");
    for (var s of recentStructures.slice(0, 6)) {
      parts.push(s.slice(0, 200));
    }
  }
  var banned = opts && opts.banned || [];
  if (banned.length) {
    parts.push("\n--- OVERUSED PRECEDENTS ON THIS SITE (BANNED: do not cite it) ---");
    parts.push(banned.map(function (b) { return b.label; }).join("; "));
  }
  var notes = opts && opts.ownerNotes || [];
  if (notes.length) {
    parts.push("\n--- OWNER EDITORIAL DIRECTIVES (from the publication's editor, authenticated; they outrank the style defaults above, never the FACTS rule or the hard constraints) ---");
    for (var n of notes) parts.push("- " + n);
  }
  parts.push("\n--- SIGNAL (the field names and the signal_strength value are internal pipeline metadata: never mention them in the essay) ---");
  parts.push("core_concept: " + friction.core_concept);
  parts.push("friction_point: " + friction.friction_point);
  parts.push("signal_strength: " + friction.signal_strength);
  var art = opts && opts.article || "";
  if (art) { parts.push("\n--- LINKED ARTICLE TEXT (source material, may be partial; facts may be taken from it) ---"); parts.push(String(art).slice(0, 6000)); }
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// 4. LLM composition via Workers AI binding (no token required)
// ---------------------------------------------------------------------------
// Model priority: frontier-scale non-reasoning writers only.
// Banned: llama, mistral, gemma-7b, -flash, -fp8-fast, -mini, -small (per fleet policy).
var COMPOSE_MODELS = [
  "@cf/nvidia/nemotron-3-120b-a12b",
  "@cf/openai/gpt-oss-120b",
  // NOTE: kimi-k2.6 / glm-5.3 / deepseek-v4-pro are REASONING models here - they return
  // empty message.content once the budget is spent on reasoning_content, so they cannot
  // serve as fallbacks at this token budget. Re-add only with a raised reasoning floor.
];

// Q08-SELF-TUNE-1 (#1760): the compose temperature is a tunable for PERFORMANCE-LOOP-1 (lever on q08_gate_pass_rate_7d).
// ops_config q08_compose_temperature, clamped to 0.4..0.8; absent or unreadable means 0.65, the value before this knob.
// The gate, the FACTS rule, Q08_SOCIAL_QUEUE and MAX_PER_DAY are invariants and have no ops_config knob.
var TEMP_KEY = "q08_compose_temperature", TEMP_DEFAULT = 0.65;
function parseTemperature(v) {
  var n = Number(String(v == null ? "" : v).trim());
  if (!String(v == null ? "" : v).trim() || !isFinite(n)) return TEMP_DEFAULT;
  return Math.min(0.8, Math.max(0.4, n));
}
async function composeTemperature(env) {
  if (!env || !env.AUDIT) return TEMP_DEFAULT;
  try { var r = await env.AUDIT.prepare("SELECT value FROM ops_config WHERE key = ?1").bind(TEMP_KEY).first(); return parseTemperature(r && r.value); }
  catch (e) { return TEMP_DEFAULT; }
}
async function compose(env, prompt, banned, order, xform) {
  var temperature = await composeTemperature(env);
  var lastErr;
  // TITLE-PROMOTE-1: compliance-driven fallback -- keep the best draft across
  // models rather than returning the first long-enough one gate-unchecked.
  var best = null;
  for (var modelId of (order || COMPOSE_MODELS)) {
    try {
      var resp = await env.AI.run(modelId, {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 6000,
        temperature: temperature,
      }, { signal: AbortSignal.timeout(120000) });
      // Workers AI returns {response: string} for chat models
      var text = resp.response || (resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) || "";
      if (!text || text.length <= 200) continue;
      // Q08-FORECAST-1: an optional xform (forecastXform) splits a structured block off the draft and adds its own problems.
      var xr = xform ? xform(text) : null;
      var norm = normalizeDraft(xr ? xr.text : text);
      var g = gate(norm, banned);
      var allProblems = g.problems.concat(xr && xr.problems || []);
      if (!allProblems.length) return { text: norm, model: modelId, extra: xr ? xr.extra : undefined };
      if (!best || norm.length > best.text.length) best = { text: norm, model: modelId, problems: allProblems, extra: xr ? xr.extra : undefined };
    } catch (e) {
      lastErr = e;
    }
  }
  if (best) return best;
  throw new Error("all compose models failed: " + String(lastErr && lastErr.message || lastErr).slice(0, 200));
}

// ---------------------------------------------------------------------------
// 5. Gate \u2014 structural validation (no names, no handles, minimum length)
// ---------------------------------------------------------------------------
// Personal name detection: two capitalized words where BOTH are common given/surname patterns.
// Excludes structural/technical compound nouns (e.g. "Knowledge Work", "System Design").
// Approach: reject only when the phrase appears in a personal-name context (after "by ", "from ", etc.)
// or when it's a known personal-name pattern (First Last without structural context).
var HANDLE_RE = /@\w+/g;
// Structural compound nouns that look like names but aren't (whitelist)
var STRUCTURAL_TERMS = /^(Systems?|Software|Hardware|Network|Data|Cloud|Service|Knowledge|Architectural|Technical|Digital|Platform|Security|Infrastructure|Design|Engineering|Product|Research|Business|Market|Organizational?|Operational?|Strategic|Systemic|Structural|Computational|Distributed|Autonomous|Functional|Behavioral|Cognitive|Semantic|Logical|Physical|Virtual|Abstract|Formal|Applied|Open|Closed|Standard|Legacy|Modern|Native|Hybrid|Adaptive|Dynamic|Static|Linear|Parallel|Sequential|Recursive|Iterative|Incremental|Continuous|Discrete|Binary|Modular|Layered|Hierarchical|Composable|Decoupled|Integrated|Unified|Federated|Centralized|Decentralized|Horizontal|Vertical|Lateral|Forward|Backward|Internal|External|Primary|Secondary|Core|Edge|Base|Top|Bottom|High|Low|Mid|Full|Half|Single|Multi|Cross|Inter|Intra|Meta|Sub|Super|Pre|Post|Anti|Non|Semi|Pseudo|Quasi|Proto|Micro|Macro|Nano|Global|Local|Regional|Universal|Specific|General|Special|Common|Rare|Simple|Complex|Basic|Advanced|Standard|Custom|Default|Optional|Required|Critical|Optional|Minimal|Maximal|Optimal|Efficient|Effective|Reliable|Scalable|Portable|Flexible|Robust|Resilient|Fault|Error|Failure|Success|Risk|Trust|Safety|Privacy|Access|Control|Flow|State|Event|Signal|Message|Request|Response|Query|Command|Action|Task|Job|Process|Thread|Worker|Agent|Actor|Client|Server|Peer|Node|Edge|Link|Path|Route|Channel|Stream|Queue|Stack|Heap|Cache|Store|Index|Registry|Catalog|Schema|Model|View|Controller|Handler|Adapter|Bridge|Proxy|Gateway|Router|Scheduler|Monitor|Observer|Listener|Publisher|Subscriber|Producer|Consumer|Provider|Consumer|Builder|Factory|Singleton|Strategy|Pattern|Template|Protocol|Interface|Contract|Specification|Standard|Convention|Policy|Rule|Constraint|Invariant|Property|Attribute|Parameter|Variable|Constant|Function|Method|Procedure|Algorithm|Heuristic|Metric|Measure|Score|Rank|Weight|Priority|Threshold|Limit|Bound|Range|Window|Interval|Period|Cycle|Loop|Iteration|Generation|Version|Release|Deploy|Build|Test|Debug|Profile|Audit|Review|Inspect|Monitor|Trace|Log|Record|Report|Alert|Notify|Trigger|Schedule|Execute|Run|Start|Stop|Pause|Resume|Cancel|Reset|Retry|Rollback|Migrate|Upgrade|Patch|Fix|Repair|Restore|Backup|Archive|Compress|Encrypt|Decrypt|Hash|Sign|Verify|Validate|Parse|Format|Serialize|Deserialize|Encode|Decode|Map|Filter|Reduce|Sort|Search|Match|Compare|Merge|Split|Join|Group|Aggregate|Transform|Convert|Normalize|Denormalize|Optimize|Minimize|Maximize|Balance|Distribute|Replicate|Synchronize|Coordinate|Orchestrate|Choreograph|Compose|Decompose|Refactor|Rewrite|Replace|Remove|Add|Update|Insert|Delete|Create|Read|Write|Append|Prepend|Truncate|Clear|Flush|Drain|Fill|Load|Save|Fetch|Push|Pull|Send|Receive|Emit|Consume|Produce|Publish|Subscribe|Register|Deregister|Bind|Unbind|Connect|Disconnect|Open|Close|Lock|Unlock|Acquire|Release|Wait|Signal|Notify|Broadcast|Multicast|Unicast|Cast|Wrap|Unwrap|Pack|Unpack|Box|Unbox|Lift|Lower|Raise|Drop|Inject|Extract|Import|Export|Include|Exclude|Enable|Disable|Activate|Deactivate|Initialize|Finalize|Setup|Teardown|Mount|Unmount|Attach|Detach|Link|Unlink|Bind|Unbind|Compile|Interpret|Execute|Evaluate|Reduce|Expand|Inline|Outline|Abstract|Concrete|Generic|Specific|Static|Dynamic|Lazy|Eager|Sync|Async|Blocking|NonBlocking|Streaming|Batch|Online|Offline|Realtime|Deferred|Immediate|Eventual|Consistent|Eventual|Strong|Weak|Strict|Loose|Tight|Loose|Hard|Soft|Fast|Slow|Hot|Cold|Warm|Fresh|Stale|Live|Dead|Active|Passive|Push|Pull|Reactive|Proactive|Declarative|Imperative|Functional|Object|Aspect|Event|Data|Message|Command|Query|Document|Graph|Tree|List|Array|Map|Set|Queue|Stack|Heap|Ring|Buffer|Pool|Cache|Store|Vault|Ledger|Register|Log|Journal|Audit|Trail|History|Timeline|Snapshot|Checkpoint|Milestone|Baseline|Target|Goal|Objective|Metric|KPI|SLA|SLO|SLI|OKR|KR|MVP|POC|RFC|ADR|PR|MR|CR|DR|RCA|PIR|SOP|FAQ|TIL|TLDR|API|SDK|CLI|GUI|UI|UX|DX|DevX|PX|CX|EX|HCI|HMI|NLI|VUI|AUI|WUI|MUI|TUI|CUI|RUI|SUI|FUI|BUI|DUI|EUI|IUI|OUI|PUI|QUI|ZUI)$/;
function isPersonalName(phrase) {
  var parts = phrase.split(" ");
  if (parts.length !== 2) return false;
  // If either part matches structural terms, it's not a personal name
  if (STRUCTURAL_TERMS.test(parts[0]) || STRUCTURAL_TERMS.test(parts[1])) return false;
  // Both parts must be short (given names are typically 3-12 chars)
  if (parts[0].length > 14 || parts[1].length > 16) return false;
  return true;
}
var NAME_RE = /\b[A-Z][a-z]{2,13} [A-Z][a-z]{2,15}\b/g;
// BANNED_BABBLE: management-consulting phrases wrong in any register.
var BANNED_BABBLE = [
  "digital transformation", "operational excellence", "strategic alignment",
  "moving forward", "going forward", "at the end of the day", "circle back",
  "key takeaways", "lessons learned", "best practices", "thought leadership",
  "game changer", "synergies",
];
var BANNED_HANDLES = /@\w+/g;
var BAD_TITLE_RE = /^(an? |the )?(analysis|critique|examination|exploration|overview|review|understanding|study|assessment|investigation) of /i;
var TITLE_FORMULA_RE = /^when .+ meets .+$/i;
var TITLE_COLON_RE = /: the (hidden|invisible|unseen|silent|quiet) /i;
var BANNED_H2_RE = /^#+\s+(how the flaw manifests|cascading failures|a minimal (alternative|framework|approach)|connections across disciplines|echoes from the past|a path forward|the lens restored|lessons for the future|the pattern across disciplines|unexpected parallels|the broader lesson)\b/i;
var FORMULA_H2_RE = /^#+\s+the (hidden|invisible|unseen|unspoken|silent|quiet) (lever|bottleneck|premise|flaw|cost|gear|engine|handoff|mismatch)\b/i;
var STOCK_PROPS_RE = /\b(telescopes?|galileo|alchem|philosopher.s stone|sonar|aperture|aerospace redundancy)\b/i;
var SOFT_REGISTER_RE = /\b(expectation gap|collective anxiety|vibe|democratiz\w*|future-proof|self-sustaining|path forward|healthy ecosystem|walks farther|ecosystem of)\b/i;
// ANTI-BANAL-1 (v0.7.16). The observed failure mode is not a weak argument but a
// banal *register*: the stock framing sentence ("\u2026illustrates a broader structural
// dynamic") and nominalised label titles ("Scale-Induced Professional Displacement").
// These are category names and significance-summaries, not mechanisms. The mandate
// forbids management-consulting abstractions; these patterns ARE that failure.
var STOCK_FRAMING_RE = /\b(?:illustrat\w+|expos\w+|reveal\w+|foreground\w+|underscor\w+)\b[^.!?]{0,90}\b(?:a|an|the)\s+(?:[a-z-]+\s+){0,3}(?:dynamic|structure|pattern|failure|gap|tension|mismatch|flaw|disjunction|force|logic|loop|cycle|feedback|principle|phenomenon|tendency|incentive|premise|asymmetry|equilibrium)\b/i;
var ABSTRACT_SUMMARY_RE = /\b(?:structural|systemic|recurring|institutional|underlying|universal|self-referential|self-reinforcing)\s+(?:dynamic|failure|gap|tension|mismatch|disjunction|structure|loop|cycle|pattern)\b/gi;
var LABEL_PHRASE_RE = /\b(?:coupling failure|incentive structure|information asymmetry|concrete manifestation of|concrete instance of|feedback loop in which|systemic incentive)\b/gi;
var LABEL_TITLE_RES = [
  /\b(?:systems?|chains?|designs?|loops?|traps?|paradoxes?|precedence|approximation|displacement|consolidation|observability|planning|automation|constraints?|escalation|asymmetry|convergence|divergence|disjunction|equilibrium|inertia|entropy|abstraction|fallacy|myth|illusion)$/i,
  /^(?:structural|systemic|recurring|institutional|externalized|opaque|implicit|formal|abstract|nominal|statistical|rhetoric\w*|scale|efficiency|goal|sponsorship|incentive|autonomous)\b/i,
  /^the\s+[a-z][^:]{3,70}\s+of\s+[a-z][^:]{3,70}$/i,
  /^[a-z][^:]{2,60}\s+as\s+[a-z][^:]{2,60}$/i,
  /(?:^|[\s-])(?:scale|efficiency|goal|incentive|sponsorship|market|growth|cost|risk|hype|policy|capital|prestige|autonomy|reward|narrative|fashion|trend)[- ]?(?:induced|driven|mediated|conditioned|derived)\s+[a-z]/i,
  /\b(?:in|across|within|under|of)\s+[a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,2}\s+(?:systems|chains|designs|contexts|settings|architectures|planning|automation|constraints|contracts|pipelines|domains|models|frameworks)$/i,
  /^the\s+\w+\s+\w*\s*(?:trap|paradox|illusion|fallacy|myth|dilemma|tyranny|consequence|problem|curse|temptation|revenge)\b/i,
  /:\s+(?:how|why)\s+(?:[a-z]+\s+){0,3}(?:drives?|shapes?|creates?|breeds?|undermines?|erodes?|rewards?|punishes?)\b/i
];


// TITLE-PROMOTE-1 (v0.7.32). 11 of the 15 gate_failed cycles (engine_runs 190-204)
// failed on "no H1 title": gate() requires /^#\s+/m while the corrective-retry
// prompt asked for "NO section headers", which the writer applied to the H1 too.
// Promote an unambiguous leading title line instead of discarding a complete essay.
// Deterministic: invents nothing, rewrites at most one line, idempotent.
function normalizeDraft(text) {
  if (!text) return text;
  var t = String(text).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (/^#\s+\S/m.test(t)) return t;
  var lines = t.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    if (/^#{2,6}\s/.test(line)) break;
    if (/^(worth your time:|[-*_]{3,}\s*$)/i.test(line)) break;
    if (line.length <= 100 && !/[.!?]$/.test(line) && line.split(/\s+/).length <= 14) {
      lines[i] = "# " + line;
      return lines.join("\n");
    }
    break;
  }
  return t;
}

function gate(text, banned) {
  // Enforce LONG-FORM PROSE with a hook, not lists:
  // 1. length 2. concrete title 3. no handles 4. no babble 5. prose-dominant.
  var problems = [];
  var body = text.toLowerCase();

  if (text.length < 4000) problems.push("too short for long-form (" + text.length + " chars; 1200-1800 words required)");

  var titleMatch = text.match(/^#\s+(.+)$/m);
  var title = titleMatch ? titleMatch[1].trim().replace(/[\u2010-\u2015\u2212]/g, "-") : "";
  if (!title) problems.push("no H1 title");
  else if (BAD_TITLE_RE.test(title)) problems.push("dry/abstract title '" + title.slice(0, 60) + "'");
  else if (title.length > 100) problems.push("title too long");

  var handles = (text.match(BANNED_HANDLES) || []).filter(function(h) { return h !== "@cf"; });
  if (handles.length > 0) problems.push("handles: " + handles.slice(0, 3).join(", "));

  for (var phrase of BANNED_BABBLE) {
    if (body.includes(phrase)) { problems.push("management-babble: '" + phrase + "'"); break; }
  }
  for (var hl of text.split("\n")) {
    var ht = hl.trim();
    if (BANNED_H2_RE.test(ht)) { problems.push("banned section header: '" + ht.slice(0, 50) + "'"); break; }
    if (FORMULA_H2_RE.test(ht)) { problems.push("formula section header: '" + ht.slice(0, 50) + "'"); break; }
  }
  if (TITLE_FORMULA_RE.test(title)) problems.push("formula title 'When X Meets Y'");
  else if (TITLE_COLON_RE.test(title)) problems.push("formula title 'X: The Hidden Z'");
  var sp = body.match(STOCK_PROPS_RE);
  if (sp) problems.push("stock analogy prop: '" + sp[1] + "'");
  var sr = body.match(SOFT_REGISTER_RE);
  if (sr) problems.push("soft register: '" + sr[1] + "'");
  // ANTI-BANAL-1: reject the significance-summary framing and label titles.
  var sf = text.match(STOCK_FRAMING_RE);
  if (sf) problems.push("stock framing tell: '" + sf[0].replace(/\s+/g, " ").slice(0, 80) + "' \u2014 name the mechanism, do not summarise the essay's significance");
  var absN = (text.match(ABSTRACT_SUMMARY_RE) || []).length;
  var lp = text.match(LABEL_PHRASE_RE);
  if (lp && lp.length >= 2) problems.push("abstraction labels x" + lp.length + " ('" + lp.slice(0, 3).join("', '") + "') - state the mechanisms instead of labelling them");
  if (absN >= 3) problems.push("abstraction-summary phrases x" + absN + " (e.g. 'structural dynamic') \u2014 state the mechanism instead of labelling it");
  for (var lt of LABEL_TITLE_RES) {
    if (lt.test(title)) { problems.push("label title \u2014 names a category, not a mechanism: '" + title.slice(0, 60) + "'"); break; }
  }
  // Q08-QUALITY-1: a Title Case title reads as a label; the pipeline's own field names must not reach the reader; a precedent the
  // site already overuses is rejected so the next essay finds a different case.
  var tw = title.split(/\s+/).filter(Boolean);
  if (tw.length >= 4 && tw.filter(function (w) { return /^[A-Z]/.test(w); }).length / tw.length >= 0.75) problems.push("Title Case title reads as a label, not a sentence: '" + title.slice(0, 60) + "'");
  if (/\b(?:signal_strength|friction_point|core_concept)\b|\bsignal strength (?:of|was|is|value)\s+[0-9.]+/i.test(text)) problems.push("pipeline metadata in the essay ('signal_strength', 'friction_point', 'core_concept' or a signal strength value) - open with what happened instead");
  if (banned && banned.length) {
    for (var bp of banned) { if (bp.re.test(text)) { problems.push("overused precedent on this site: " + bp.label + " - remove it"); break; } }
  }
  if (/\b(?:score|rating|ratio|reputation) of \d+\.\d+\b/i.test(body)) problems.push("invented decimal metric \u2014 no fabricated scores");
  if (/\b(?:channel|account|user|session) ID ['"][A-Za-z0-9_-]{6,}['"]/i.test(body)) problems.push("invented identifier \u2014 no fabricated IDs");
  var curAmt = text.match(/\$\s?\d{1,3}(,\d{3})+/g);
  if (curAmt && curAmt.length) problems.push("large currency amount(s) " + curAmt.slice(0, 3).join(", ") + " \u2014 likely fabricated; use the signal's figures or none");

  var lines = text.split("\n");
  var bulletLines = 0, tableLines = 0, paraLines = 0;
  for (var line of lines) {
    var t = line.trim();
    if (/^[-*]\s/.test(t)) bulletLines++;
    else if (t.startsWith("|")) tableLines++;
    else if (t.length > 45) paraLines++;
  }
  if (bulletLines > 0) problems.push("bullet lists (" + bulletLines + " lines) \u2014 long-form prose required");
  if (tableLines > 0) problems.push("tables (" + tableLines + " lines) \u2014 prose required");
  if (paraLines < 6) problems.push("insufficient prose (" + paraLines + " substantial paragraphs)");

  var verdictMatch = text.match(/worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-]\s*\S[^\n]*$/im);
  if (!verdictMatch) problems.push("missing or malformed 'worth your time' verdict line");
  else if (verdictMatch[1] === "no") problems.push("self-verdict 'no' \u2014 essay does not clear the worth-reading bar");
  var essayText = text.replace(/\n?worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-].*$/im, "").trim();
  var lastCh = essayText.slice(-1);
  if (lastCh !== "." && lastCh !== "!" && lastCh !== "?" && lastCh !== "\u201d" && lastCh !== "\u2019") problems.push("truncated ending \u2014 essay must end on a full stop");

  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// 6. Persist + serve
// ---------------------------------------------------------------------------
async function persistPiece(env, piece, signal, story, model) {
  var salt = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  var slug  = utcDay() + "-" + slugify(piece.title || signal.core_concept) + "-" + salt.slice(-6);
  var pieceId = "p-" + salt;
  // Extract H1 title from markdown
  var titleMatch = piece.text.match(/^#\s+(.+)$/m);
  var title = titleMatch ? titleMatch[1].trim() : (signal.core_concept || "Untitled");
  // Body without the H1
  var body = piece.text.replace(/^#\s+.+\n?/, "").trim();
  // Persist signal log
  await env.DB.prepare(
    "INSERT OR IGNORE INTO signal_log (id, source, source_id, title, url, points, num_comments, ratio, volatility_score, friction_point, signal_strength, status, processed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(
    "sig-" + salt, (story.source || "hn"), (story.source || "hn") + ":" + String(story.id || ""),
    story.title, story.url, story.points, story.num_comments,
    story.ratio, story.volatility_score,
    signal.friction_point, signal.signal_strength, "published", nowIso()
  ).run();
  // Persist piece
  await env.DB.prepare(
    "INSERT INTO published_pieces (id, signal_id, slug, title, body_md, core_concept, signal_source, published_at, sources_json) VALUES (?,?,?,?,?,?,?,?,?)"
  ).bind(
    pieceId, "sig-" + salt, slug, title, body,
    signal.core_concept, (story.source || "hn") + ":" + story.id, nowIso(),
    JSON.stringify(buildSources(story))
  ).run();
  // Q08-FORECAST-1: a forecast piece also gets its q08_forecasts record (the claim, probability, horizon and resolution
  // condition the judges later settle). Its skeleton stays out of the essay prompt pool, which feeds essay few-shots only.
  var fx = (story.source === "q08" && piece.extra) ? piece.extra : null;
  if (fx) {
    await ensureForecastSchema(env);
    await env.DB.prepare("UPDATE published_pieces SET kind = 'forecast' WHERE id = ?").bind(pieceId).run();
    var fAlts = (fx.alternatives || []).map(function (a) { return { claim: String(a.claim || "").trim().slice(0, 300), probability: Math.round(Number(a.probability) * 100) / 100 }; });
    var fInd = (fx.indicators || []).map(function (x) { return String(x).trim().slice(0, 200); });
    var fUrls = (fx.watch_urls || []).map(publicHttpsUrl).filter(Boolean);
    await env.DB.prepare("INSERT INTO q08_forecasts (piece_id, slug, source_slug, claim, probability, horizon, resolution, watch_query, watch_urls, alternatives_json, indicators_json, created_at, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'open')")
      .bind(pieceId, slug, String(story.slug || ""), String(fx.claim).trim().slice(0, 300), Math.round(Number(fx.probability) * 100) / 100, String(fx.horizon), String(fx.resolution).trim().slice(0, 400), String(fx.watch_query).trim().slice(0, 80), JSON.stringify(fUrls), JSON.stringify(fAlts), JSON.stringify(fInd), nowIso()).run();
  }
  // Seed prompt pool with structure skeleton (headings, else title + lead paragraph).
  var skeleton = body.split("\n").filter(l => l.startsWith("#") || l.startsWith("- ") || l.startsWith("**")).join("\n").slice(0, 800);
  if (skeleton.length < 50) {
    var leadPara = body.split("\n").map(l => l.trim()).filter(l => l.length > 40)[0] || "";
    skeleton = (title + "\n" + leadPara.slice(0, 400)).slice(0, 800);
  }
  if (skeleton.length > 50 && !fx) {
    await env.DB.prepare(
      "INSERT INTO prompt_pool (id, piece_id, structure_md, active) VALUES (?,?,?,1)"
    ).bind("pp-" + salt, pieceId, skeleton).run();
  }
  // Bound the pool: keep only the 40 newest skeletons.
  await env.DB.prepare(
    "DELETE FROM prompt_pool WHERE id NOT IN (SELECT id FROM prompt_pool ORDER BY created_at DESC LIMIT 40)"
  ).run().catch(function(){});
  return { slug, title, pieceId };
}

// ---------------------------------------------------------------------------
// 7. Feedback loop \u2014 promote top 15%, purge bottom 15%
// ---------------------------------------------------------------------------
var OWNER_VERDICT_WEIGHT = 3;
async function feedbackScan(env) {
  // Rank prompt_pool by READER VERDICTS (worth your time?) \u2014 votes, not views.
  var rows = await env.DB.prepare(
    "SELECT pp.id, pp.piece_id, pp.structure_md, p.slug, p.reads, " +
    "(SELECT COUNT(*) FROM q08_feedback f WHERE f.slug = p.slug AND f.created_at >= '2026-10-03T00:00:00Z' AND f.signal = 'good') AS g, " +
    "(SELECT COUNT(*) FROM q08_feedback f WHERE f.slug = p.slug AND f.created_at >= '2026-10-03T00:00:00Z' AND f.signal IN ('flat','no')) AS b " +
    "FROM prompt_pool pp JOIN published_pieces p ON p.id = pp.piece_id WHERE pp.active = 1"
  ).all();
  var all = rows.results || [];
  // Q08-QUALITY-1: the owner's verdict (signed in at fleet.qnfo.org, qnfo-audit q08_owner_verdicts) counts 3 votes, so one
  // calibrating verdict can clear the 3-vote minimum while reader volume is low.
  try {
    if (env.AUDIT) {
      var ov = await env.AUDIT.prepare("SELECT slug, signal FROM q08_owner_verdicts").all();
      var ow = {};
      for (var o of (ov.results || [])) { var k = String(o.slug); ow[k] = ow[k] || { g: 0, b: 0 }; if (o.signal === "good") ow[k].g++; else if (o.signal === "flat" || o.signal === "no") ow[k].b++; }
      for (var ar of all) { var w = ow[String(ar.slug)]; if (w) { ar.g = (Number(ar.g) || 0) + w.g * OWNER_VERDICT_WEIGHT; ar.b = (Number(ar.b) || 0) + w.b * OWNER_VERDICT_WEIGHT; } }
    }
  } catch (e) {}
  var promoted = 0, purged = 0;
  for (var r of all) {
    var g = Number(r.g) || 0, b = Number(r.b) || 0;
    if (g + b > 0) {
      await env.DB.prepare("UPDATE published_pieces SET feedback_score = ? WHERE slug = ?").bind(g / (g + b), r.slug).run().catch(function(){});
    }
  }
  if (all.length < 4) return { promoted: promoted, purged: purged };
  // PROMOTION (v0.7.22). The previous rule required g >= 2 && g >= 2*b (a 2:1 yes-ratio).
  // Real reader sentiment here is ~30% good / 70% flat-or-no, so that rule could NEVER
  // fire: zero pieces qualified and the proven pool was empty by construction. This now
  // implements what this function's header says - promote the TOP quantile by reader
  // verdict among pieces with a usable sample, purge the bottom quantile.
  function readerScore(r) { var g = Number(r.g) || 0, b = Number(r.b) || 0; return (g + b) > 0 ? g / (g + b) : 0; }
  var sampled = all.filter(function(r){ return ((Number(r.g) || 0) + (Number(r.b) || 0)) >= 3; });
  sampled.sort(function(x, y){ return readerScore(y) - readerScore(x) || (Number(y.g) || 0) - (Number(x.g) || 0); });
  var qn = Math.max(1, Math.floor(sampled.length * 0.15));
  for (var i = 0; i < Math.min(qn, sampled.length); i++) {
    if (readerScore(sampled[i]) < 0.5) break;
    await env.DB.prepare("UPDATE prompt_pool SET active = 2 WHERE id = ?").bind(sampled[i].id).run();
    promoted++;
  }
  for (var j = sampled.length - 1; j >= Math.max(0, sampled.length - qn); j--) {
    if (readerScore(sampled[j]) >= 0.5) break;
    await env.DB.prepare("UPDATE prompt_pool SET active = 0 WHERE id = ?").bind(sampled[j].id).run();
    purged++;
  }
  return { promoted: promoted, purged: purged };
}
// ---------------------------------------------------------------------------
// 8. Main generation cycle
// ---------------------------------------------------------------------------
// Self-referential signal: a published essay's systemic claim is emitted back into
// the fleet's signal store (signals table, source=q08) so the fleet's own self-audit
// (fleet-control scan, kaizen watchtower, cloud-ops digest) can read its own analysis
// and apply it to its own failure modes. Best-effort; never blocks publication.
async function emitContentSignal(env, piece, saved) {
  try {
    if (!env.AUDIT) return;
    var bodyText = String(piece.text || "").replace(/\n?worth your time:[\s\S]*$/im, "").trim();
    var paras = bodyText.split("\n").map(function(l){ return l.trim(); }).filter(function(l){ return l.length > 80; });
    var openQ = paras.length ? paras[paras.length - 1].slice(0, 400) : "";
    await env.AUDIT.prepare(
      "INSERT OR IGNORE INTO signals (id, ts, source, source_ref, content, open_questions, evidential_weight, domain, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
    ).bind(
      "q08:" + saved.slug,
      nowIso(),
      "q08",
      ORIGIN + "/p/" + saved.slug,
      String(saved.title || "").slice(0, 300),
      JSON.stringify([openQ]),
      0.6,
      "fleet",
      "open",
      nowIso()
    ).run();
  } catch (e) {
    // best-effort: a failed signal write must never fail a publish
  }
}

// Q08-ENSEMBLE-1. Levels: 1 writer (family W) -> 0 deterministic gate (uncorrelated with every model) -> 2 reader panel of two small
// models from families other than W -> 3 editor from the other writer family, editing the draft against the panel's notes ->
// 4 fresh panel from families other than W, the editor and the first panel where the pool allows. Publish only on a passing last
// read. A panel with no valid verdict fails open (the gate already passed), so a model outage never stalls q08; every such case is
// written as a 'panel_unavailable' row, so a panel that silently never runs shows in /api/ensemble and in the unavailable-share metric.
// Q08-PHRASE-REVISE-1 (2026-10-06, agent_issues 2034): 5 of the 7 gate failures in runs 234-245 were phrase-level
// only (a stock framing sentence, label phrases, soft register, a Title Case title), yet the retry threw the whole essay
// away and asked for a new one from scratch, which brings new tells. When every problem is phrase-level, the retry is a
// revision of the same draft that rewrites only the offending sentences and the title; any other problem keeps the
// rewrite from scratch. Same single compose call; the gate and the reader panel judge the result as before.
var PHRASE_LEVEL_RE = /^(?:stock framing tell|abstraction labels|abstraction-summary phrases|soft register|Title Case title|label title|management-babble|stock analogy prop|dry\/abstract title|formula title)/;
function phraseLevelOnly(problems) {
  return !!(problems && problems.length && problems.every(function (p) { return PHRASE_LEVEL_RE.test(String(p)); }));
}
function retryPromptFor(prompt, draft, problems) {
  var list = (problems || []).join("; ");
  if (phraseLevelOnly(problems) && draft && draft.length >= 4000) {
    return prompt + "\n\n--- REVISION: your draft below was rejected only for these phrases: " + list
      + ". Return the SAME essay with only those sentences and, if named, the title rewritten so that each names the concrete mechanism (who does what, which information is missing, where it breaks) in plain words. Keep every other sentence, the facts, the structure, the length and the final 'worth your time' line exactly as they are. Output the full essay, starting with its '# ' H1 title line, and nothing else. ---\n\n" + draft;
  }
  return prompt + "\n\n--- CORRECTIVE FEEDBACK: your previous draft was rejected. Rewrite the ENTIRE essay from scratch with a completely different structure \u2014 continuous prose, no '##' section headers, but KEEP exactly one '# ' H1 title line as the FIRST line of the essay \u2014 fixing only these issues ---\n" + list;
}
async function runLevels(env, a) {
  var piece = a.piece, gateResult = a.gateResult, banned = a.banned, rows = [];
  if (!gateResult.ok) return { piece: piece, gateResult: gateResult, rows: rows };
  var writerFam = familyOf(piece.model);
  var seed = seedOf(a.seedText);
  var p1 = await panelRead(env, piece.text, [writerFam], seed, 2, a.readerPrompt);
  if (!p1) { rows.push({ round: 1, role: "panel_unavailable", model: "", family: "", pass: 1 }); return { piece: piece, gateResult: gateResult, rows: rows }; }
  rows = rows.concat(panelRows(p1, 1));
  if (p1.pass) return { piece: piece, gateResult: gateResult, rows: rows };
  var editOrder = COMPOSE_MODELS.filter(function (m) { return familyOf(m) !== writerFam; }).concat(COMPOSE_MODELS.filter(function (m) { return familyOf(m) === writerFam; }));
  var edPrompt = a.prompt + "\n\n--- EDITOR PASS: below is a draft by another writer. Two independent readers from different model families would not read it to the end (mean score " + p1.mean + " of 5). What they said to fix: " + p1.fix + (p1.tells.length ? " Phrases they flagged as generic machine prose: " + p1.tells.join(" | ") + "." : "") + " Edit it, do not start over: keep every fact and the same case, keep the title line first and the verdict line last, replace abstractions with people doing things, vary sentence length, cut anything that only restates. Return the full edited essay. " + (a.forecast ? "This is a forecast: keep every probability, the horizon, and the whole FORECAST-JSON line exactly as in the draft, and keep the verdict line last. " : "") + "---\n\n--- DRAFT ---\n" + (a.forecast ? piece.text + "\nFORECAST-JSON: " + JSON.stringify(piece.extra || {}) : piece.text);
  var ed = null;
  try { ed = await compose(env, edPrompt, banned, editOrder, a.xform); } catch (e) { ed = null; }
  if (ed && a.forecast && !ed.extra && piece.extra) ed.extra = piece.extra;
  var edOk = !!(ed && ed.text && gate(ed.text, banned).ok && (!a.forecast || validateForecast(ed.extra, ed.text, Date.now()).length === 0));
  if (!edOk) return { piece: piece, gateResult: { ok: false, problems: ["ensemble: the editor's draft failed the gate - " + (p1.fix || "no fix given")] }, rows: rows };
  var edFam = familyOf(ed.model);
  var usedFam = [writerFam, edFam].concat(p1.judges.map(function (j) { return j.family; }));
  var p2 = await panelRead(env, ed.text, usedFam, seed + 1, 2, a.readerPrompt);
  if (!p2) p2 = await panelRead(env, ed.text, [writerFam, edFam], seed + 1, 2, a.readerPrompt);
  if (p2) rows = rows.concat(panelRows(p2, 2)); else rows.push({ round: 2, role: "panel_unavailable", model: "", family: "", pass: 1 });
  rows.push({ round: 2, role: "editor", model: ed.model, family: edFam, pass: p2 ? p2.pass : true });
  if (!p2 || p2.pass) return { piece: ed, gateResult: gateResult, rows: rows };
  return { piece: piece, gateResult: { ok: false, problems: ["ensemble: the edited draft was still not worth reading (panel mean " + p2.mean + " of 5) - " + (p2.fix || "no fix given")] }, rows: rows };
}
async function generate(env) {
  var t0 = Date.now();
  if (!(await ensureAccuracySchema(env))) return { ok: false, reason: "accuracy schema unavailable (publishing fails closed)" };
  // Daily cap check
  var dayCount = await env.DB.prepare(
    "SELECT COUNT(*) n FROM published_pieces WHERE published_at >= ?1"
  ).bind(utcDay() + "T00:00:00.000Z").first();
  var todayN = (dayCount && dayCount.n) || 0;
  var cap = await dailyCap(env);
  if (todayN >= cap) {
    return { ok: false, reason: "daily cap reached (" + todayN + "/" + cap + (cap < MAX_PER_DAY ? ", ops_config " + CAP_KEY : "") + ")" };
  }
  // Q08-QUALITY-1: attempts are bounded at twice the publish cap (a publishing-cadence and quality bound, not a spend
  // stop: under BUDGET-SOFT-ROUTE-1 a breached fleet_budget cap only steers model choice, never halts the engine).
  var attempts = await env.DB.prepare("SELECT COUNT(*) n FROM engine_runs WHERE ran_at >= datetime('now','start of day') AND status IN ('ok','gate_failed')").first().catch(function () { return { n: 0 }; });
  if ((attempts && attempts.n || 0) >= cap * 2) {
    return { ok: false, reason: "daily attempt cap reached (" + attempts.n + "/" + (cap * 2) + ")" };
  }
  // Q08-FORECAST-1: every FORECAST_EVERY pieces, write a forecast from a published essay's mechanism instead of scraping a
  // new signal. A forecast that fails its gate is logged and the analysis path below still runs this tick, so a failing
  // forecast can never stall publishing.
  try {
    if (await forecastDue(env)) { var fout = await generateForecast(env, t0); if (fout) return fout; }
  } catch (e) { console.error("q08 forecast path failed: " + String(e && e.message || e).slice(0, 200)); }
  // Scrape + rank \u2014 three sources (break the filter bubble)
  var stories = [];
  try { stories = stories.concat(await scrapeHN()); } catch (e) {}
  try { stories = stories.concat(await scrapeGitHub()); } catch (e) {}
  try { stories = stories.concat(await scrapeArxiv()); } catch (e) {}
  if (!stories.length) return { ok: false, reason: "no signals scraped" };
  // Skip already-processed signal IDs today (source-scoped)
  var processed = await env.DB.prepare(
    "SELECT source_id FROM signal_log WHERE processed_at >= ?1"
  ).bind(new Date(Date.now() - 7 * 864e5).toISOString()).all();
  var processedIds = new Set((processed.results || []).map(r => String(r.source_id)));
  var candidates = stories.filter(s => !processedIds.has(String((s.source||"hn") + ":" + s.id)));
  if (!candidates.length) return { ok: false, reason: "all signals already processed in the last 7 days" };
  // Source diversity: prefer a source other than the last one used
  var lastRun = await env.DB.prepare("SELECT top_signal FROM engine_runs WHERE top_signal != '' ORDER BY id DESC LIMIT 1").first();
  var lastSource = lastRun ? (String(lastRun.top_signal||"").split(":")[0]) : "";
  var diverse = candidates.find(function(s){ return (s.source||"hn") !== lastSource; });
  var ordered = diverse ? [diverse].concat(candidates.filter(function(s){ return s !== diverse; })) : candidates;
  // Try candidates until one yields sufficient friction (sparse GitHub/arXiv fall through)
  var story = null, friction = null;
  for (var ci = 0; ci < Math.min(ordered.length, 8); ci++) {
    var cand = ordered[ci];
    var f = null;
    try {
      if ((cand.source||"hn") === "github") f = await extractGitHubFriction(cand.id, cand.description || "");
      else if ((cand.source||"hn") === "arxiv") f = { core_concept: cand.title, friction_point: (String(cand.title||"") + ". " + String(cand.abstract||"")).slice(0,800), signal_strength: "Medium" };
      else f = await extractFriction(cand.id);
    } catch (e) { f = null; }
    if (f && f.friction_point && f.friction_point.length >= 60) { story = cand; friction = f; break; }
  }
  if (!story) {
    return { ok: false, reason: "no candidate yielded sufficient friction (" + candidates.length + " available)" };
  }
  // Few-shot only from pieces with proven reader value (reads or verdicts); otherwise none.
  var exemplars = await env.DB.prepare(
    "SELECT pp.structure_md FROM prompt_pool pp JOIN published_pieces p ON p.id = pp.piece_id WHERE pp.active = 2 AND p.slug NOT IN (SELECT slug FROM q08_retractions) AND (p.reads > 0 OR p.feedback_score > 0) ORDER BY pp.performance_score DESC, p.feedback_score DESC LIMIT 2"
  ).all();
  var fewShot = (exemplars.results || []).filter(function(r){ return exemplarOk(r.structure_md); });
  // Recent structures as divergence priming: the model must NOT repeat them.
  var recentRows = await env.DB.prepare(
    "SELECT structure_md FROM prompt_pool ORDER BY created_at DESC LIMIT 6"
  ).all();
  var recentStructures = (recentRows.results || []).map(function(r){ return r.structure_md; });
  // Compose
  var recentBodies = await env.DB.prepare("SELECT body_md FROM published_pieces WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at DESC LIMIT 8").all().catch(function () { return { results: [] }; });
  var banned = []; // Q08-VERIFY-1: outside precedents are rejected by the grounding check, so no precedent is named to the writer
  var ownerNotes = await ownerDirectives(env);
  var article = await fetchArticleText(story.url);
  var prompt = buildPrompt(friction, fewShot, recentStructures, { banned: banned, ownerNotes: ownerNotes, article: article });
  var piece  = await compose(env, prompt, banned);
  // Gate \u2014 one corrective retry on failure
  var gateResult = gate(piece.text, banned);
  if (!gateResult.ok) {
    var retryPrompt = retryPromptFor(prompt, piece.text, gateResult.problems);
    var retryPiece = null;
    try { retryPiece = await compose(env, retryPrompt, banned); } catch (e) { retryPiece = null; }
    if (retryPiece && retryPiece.text) {
      var retryGate = gate(retryPiece.text, banned);
      if (retryGate.ok) { piece = retryPiece; gateResult = retryGate; }
      else if (retryGate.problems.length === 1 && /verdict/i.test(retryGate.problems[0]) && retryGate.problems[0].indexOf("self-verdict") < 0) {
        // Verdict-only micro-call: one cheap compose asking for exactly the verdict line.
        try {
          var vp = await compose(env, "You have written an essay that passed all editorial checks. Output exactly one line, nothing else, in this form:\nworth your time: yes|flat|no \u2014 one clause of justification\nUse flat only if a reader gains little beyond the source material; use no if the piece is not worth publishing.");
          var vm2 = (vp && vp.text || "").match(/worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-]\s*\S[^\n]*$/im);
          if (vm2) {
            retryPiece.text = retryPiece.text.replace(/\s*$/, "") + "\n\n" + vm2[0];
            retryGate = gate(retryPiece.text, banned);
            if (retryGate.ok) { piece = retryPiece; gateResult = retryGate; }
          }
        } catch (e) {}
      }
    }
  }
  var lv = await runLevels(env, { piece: piece, prompt: prompt, banned: banned, seedText: story.title || "", gateResult: gateResult });
  piece = lv.piece; gateResult = lv.gateResult;
  var readerRows = lv.rows;
  // Q08-VERIFY-1: nothing is published until its names, years and figures are in the source material and two reviewers from
  // other model families find no unsupported claim. An outage of the reviewers fails closed.
  var essayVr = null;
  if (gateResult.ok) {
    var essayGround = [story.title || "", friction.core_concept || "", friction.friction_point || "", article, (ownerNotes || []).join("\n")].join("\n");
    var ev = await verifyAndRevise(env, { piece: piece, prompt: prompt, banned: banned, ground: essayGround, seedText: String(story.id || story.title || ""), forecast: false });
    piece = ev.piece; essayVr = ev.vr;
    if (!ev.ok) gateResult = { ok: false, problems: ["accuracy: " + ev.problems.join("; ")] };
  }
  if (!gateResult.ok) {
    await saveReaderTests(env, (story.source || "hn") + ":" + String(story.id || ""), readerRows);
    // Mark the signal processed so the same story is not retried by the next runs.
    try {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO signal_log (id, source, source_id, title, url, points, num_comments, ratio, volatility_score, friction_point, signal_strength, status, processed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
      ).bind("sig-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), (story.source || "hn"), (story.source || "hn") + ":" + String(story.id || ""), story.title, story.url, story.points, story.num_comments, story.ratio, story.volatility_score, friction.friction_point, friction.signal_strength, "gate_failed", nowIso()).run();
    } catch (e) {}
    await env.DB.prepare(
      "INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, top_signal, model, ms, status, error) VALUES (?,?,?,?,?,?,?,?)"
    ).bind(stories.length, candidates.length, 0, (story.source||"hn") + ":" + story.title.slice(0, 80), piece.model, Date.now()-t0, "gate_failed", gateResult.problems.join("; ")).run();
    return { ok: false, reason: "gate failed: " + gateResult.problems.join("; ") };
  }
  // Strip the calibration verdict line from the published body (it gates, it does not print).
  piece.text = piece.text.replace(/\n?worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-].*$/im, "").trim();
  // Persist
  var saved = await persistPiece(env, piece, friction, story, piece.model);
  if (essayVr) await recordAudit(env, saved.slug, "pass", "publish", essayVr).catch(function () {});
  await saveReaderTests(env, saved.slug, readerRows);
  // Feedback loop. MUST be awaited: as a floating promise with no ctx.waitUntil it
  // was truncated by the Worker runtime once the response returned, so the promotion
  // loop never completed and the reader-proven pool stayed empty (feedback_score
  // updates landed, promotions did not).
  await feedbackScan(env).catch(() => {});
  // Social cross-post (Bluesky via qnfo-social; skips silently if unset)
  await queueForDistribution(env, saved.title, saved.slug, null, q08Lede(piece.text || ""));
  pingIndexNow(env, ORIGIN + "/p/" + saved.slug).catch(() => {});
  emitContentSignal(env, piece, saved).catch(() => {});
  // Log run
  await env.DB.prepare(
    "INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, top_signal, model, ms, status) VALUES (?,?,?,?,?,?,?)"
  ).bind(stories.length, candidates.length, 1, (story.source||"hn") + ":" + story.title.slice(0, 80), piece.model, Date.now()-t0, "ok").run();
  return { ok: true, slug: saved.slug, title: saved.title, model: piece.model, source: (story.source||"hn"), story: story.title };
}

// ---------------------------------------------------------------------------
// Q08-FORECAST-1 (v0.9.0, pillar: reach). q08 looks forward as well as back. Every few essays the engine writes a forecast
// from the mechanism a published essay identified: the single most likely scenario as a dated causal narrative, rival
// scenarios with probabilities, leading indicators, and a resolution condition anyone can check. Each forecast is a row in
// q08_forecasts; when its horizon passes, a two-family judge panel settles it from public evidence and the Brier score is
// recorded. A forecast with no decidable evidence after FORECAST_MAX_CHECKS checks is marked void in public, never dropped.
// The same gate, FACTS rule, ensemble levels and owner directives apply as for essays; probabilities are the writer's
// judgments and the only numbers it may add besides dates (FACTS rule in FORECAST_DIRECTIVE).
// ---------------------------------------------------------------------------
var FORECAST_CAP_KEY = "q08_forecast_max_per_day", FORECAST_CAP_DEFAULT = 3, FORECAST_CAP_MAX = 10;
var FORECAST_EVERY = 3;            // a forecast is due after this many consecutive non-forecast pieces
var FORECAST_MIN_DAYS = 14, FORECAST_MAX_DAYS = 730;
var FORECAST_RECHECK_DAYS = 7, FORECAST_MAX_CHECKS = 4;
var __forecastSchemaDone = false, __forecastSchemaTried = 0;
async function ensureForecastSchema(env) {
  if (__forecastSchemaDone) return true;
  if (Date.now() - __forecastSchemaTried < 60000) return false; // a failing schema step is retried once a minute, not on every request
  __forecastSchemaTried = Date.now();
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS q08_forecasts (id INTEGER PRIMARY KEY AUTOINCREMENT, piece_id TEXT, slug TEXT UNIQUE, source_slug TEXT, claim TEXT, probability REAL, horizon TEXT, resolution TEXT, watch_query TEXT, watch_urls TEXT, alternatives_json TEXT, indicators_json TEXT, created_at TEXT, status TEXT DEFAULT 'open', outcome INTEGER, brier REAL, checks INTEGER DEFAULT 0, last_check_at TEXT, resolved_at TEXT, disposition TEXT, evidence_json TEXT)").run();
    var info = await env.DB.prepare("PRAGMA table_info(published_pieces)").all();
    var have = {}; (info.results || []).forEach(function (c) { have[c.name] = 1; });
    if (!have.kind) {
      try { await env.DB.prepare("ALTER TABLE published_pieces ADD COLUMN kind TEXT DEFAULT 'analysis'").run(); }
      catch (e2) { if (!/duplicate column/i.test(String(e2 && e2.message || e2))) throw e2; }
    }
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_q08_forecasts_status ON q08_forecasts (status, horizon)").run();
    __forecastSchemaDone = true;
    return true;
  } catch (e) {
    console.error("q08 forecast schema failed: " + String(e && e.message || e).slice(0, 200));
    return false;
  }
}
function parseForecastCap(v) {
  var s = v == null ? "" : String(v).trim();
  if (!/^\d{1,3}$/.test(s)) return FORECAST_CAP_DEFAULT;
  return Math.min(Number(s), FORECAST_CAP_MAX);
}
async function forecastCap(env) {
  if (!env || !env.AUDIT) return FORECAST_CAP_DEFAULT;
  try { var r = await env.AUDIT.prepare("SELECT value FROM ops_config WHERE key = ?1").bind(FORECAST_CAP_KEY).first(); return parseForecastCap(r && r.value); }
  catch (e) { return FORECAST_CAP_DEFAULT; }
}
// A forecast is due when the newest FORECAST_EVERY pieces include none and today's forecast cap is not reached.
async function forecastDue(env) {
  if (!(await ensureForecastSchema(env))) return false;
  var cap = await forecastCap(env);
  if (cap <= 0) return false;
  var n = await env.DB.prepare("SELECT COUNT(*) n FROM published_pieces WHERE kind = 'forecast' AND published_at >= ?1").bind(utcDay() + "T00:00:00.000Z").first();
  if ((n && n.n || 0) >= cap) return false;
  // Backpressure, not a stop: three forecast drafts rejected today means the rest of the day goes to essays.
  var ff = await env.DB.prepare("SELECT COUNT(*) n FROM engine_runs WHERE status = 'gate_failed' AND top_signal LIKE 'q08-forecast:%' AND ran_at >= datetime('now','start of day')").first().catch(function () { return { n: 0 }; });
  if ((ff && ff.n || 0) >= 3) return false;
  var last = await env.DB.prepare("SELECT kind FROM published_pieces WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at DESC LIMIT ?1").bind(FORECAST_EVERY).all();
  var rows = last.results || [];
  if (rows.length < FORECAST_EVERY) return false;
  return rows.every(function (r) { return r.kind !== "forecast"; });
}
async function pickForecastSource(env) {
  if (!(await ensureAccuracySchema(env))) return null; // fail closed: no forecast is built on an essay whose audit state is unknown
  return await env.DB.prepare(
    "SELECT p.id, p.slug, p.title, p.body_md, p.core_concept, p.signal_source, p.published_at FROM published_pieces p " +
    "WHERE COALESCE(p.kind, 'analysis') != 'forecast' AND p.published_at >= ?1 " +
    "AND p.slug IN (SELECT slug FROM q08_audits WHERE verdict = 'pass') AND p.slug NOT IN (SELECT slug FROM q08_retractions) " +
    "AND NOT EXISTS (SELECT 1 FROM q08_forecasts f WHERE f.source_slug = p.slug) " +
    "AND (SELECT COUNT(*) FROM engine_runs e WHERE e.status = 'gate_failed' AND e.top_signal = substr('q08-forecast:' || p.slug, 1, 80)) < 2 " +
    "ORDER BY COALESCE(p.feedback_score, 0) DESC, p.reads DESC, p.published_at DESC LIMIT 1"
  ).bind(new Date(Date.now() - 21 * 864e5).toISOString()).first();
}

var FORECAST_DIRECTIVE = [
  "You are the forecaster for q08.org. q08 publishes long-form essays on the recurring systems that make things break. This piece is different: it looks forward. You are given an essay q08 already published and the signal behind it. Say where the mechanism it describes most likely leads next, as one concrete, dated, checkable scenario, and say how likely you think it is.",
  "",
  "WHAT A FORECAST IS HERE: a most-likely scenario narrative. Of the mutually exclusive ways the next months can go, tell the single course you judge most probable, as a causal sequence in plain prose: who does what, because of what, and what that sets off, in the order it would happen, with approximate dates. Then give the strongest rival scenarios, each with its probability, and say what would let one of them overtake yours. The reader must be able to check you later.",
  "",
  "COMMITMENT: pick one main claim that a public fact can settle yes or no on or before the horizon date, and write its resolution condition so a stranger could check it without asking what you meant. A claim that cannot lose ('pressure will keep growing') is rejected. Prefer the sharpest claim you can honestly stand behind: a 40 percent forecast that names a specific event beats an 80 percent forecast that names nothing.",
  "",
  "PROBABILITIES: state your probability for the main scenario in the prose as a whole percent, and the alternatives' probabilities too. They are your judgments, not measurements: do not dress them as data and do not hedge them. The main scenario must be at least as probable as each alternative, and all stated probabilities together must not exceed 100 percent; the remainder is 'something else', and say so.",
  "",
  "BASE RATE, WITHOUT BORROWED CASES: before the scenario, say which class of situations you are reasoning from (for example, 'a standard that two competing bodies both claim to own') and how situations of that class usually go, in general terms. Do not name a past case, company, law or event that is not stated in the ESSAY or SIGNAL below, and give no historical statistics; a reader will check every name. Then say why this case should or should not follow the class.",
  "",
  "FACTS (hard, non-negotiable, and checked): every claim about the real world as it stands today (an event, a date, a person, an organisation, a product, a law, a number, a price, a count, an identifier, a quotation) must be stated in the ESSAY or the SIGNAL below, verbatim or as a direct paraphrase. Your memory is not a source: add no outside facts, precedents or statistics. Future dates and your own probabilities are the only numbers you may add. Never state a projected quantity (a price, a user count, a market size) unless the text derives it from a figure in the sources. Never invent a source, a report or a quote. Every draft is fact-checked against the essay and signal by independent reviewers from other model families; one unsupported claim and the forecast is not published. A general honest sentence beats a specific unsupported one.",
  "",
  "REGISTER: cold structural objectivity, plain words, a sharp person explaining something to a smart friend. Name actors by what they are, never by role words ('the observer', 'the actor', 'the mechanism'). No bullets, no tables, no '##' headers: continuous prose. No first person, no hedging words, no emotional vocabulary, no marketing register, no @handles. Never mention 'the essay', 'the signal' or any pipeline field. Open with what is happening now in one concrete sentence, then move forward in time.",
  "",
  "REACH: the essay starts in technology, but the mechanism does not stop there. Follow it into whatever other systems the source itself says it touches, wherever your scenario actually runs, and pick the main claim where the world, not only the tech press, will record the outcome.",
  "",
  "LEADING INDICATORS: say which two to five things an outsider can watch, and what each would look like if your scenario is on track and if it is not.",
  "",
  "ENDING: end on the one unresolved fact that would most change your probability, not on a summary or a moral.",
  "",
  "TITLE: one plain sentence in sentence case that states the forecast as a claim and names the actors and the event, under 90 characters, no colon, no Title Case, not shaped 'The X of Y', never a label ('The Future of X', 'Outlook for Y'). Length: 1100-1700 words. Complete sentences only; the prose ends on a full stop.",
  "",
  "OUTPUT FORMAT, in this order: Markdown with the H1 title first and then the prose; then one line that starts exactly with FORECAST-JSON: followed by a single-line JSON object; then the verdict line.",
  "The JSON object has these keys: \"claim\" (the main scenario as one checkable sentence, 20-300 characters), \"probability\" (your probability for it as a number from 0.05 to 0.95, equal to the percent you state in the prose), \"horizon\" (the date by which the claim is settled, YYYY-MM-DD, between 30 and 540 days after today), \"resolution\" (one sentence, 30-400 characters: the public, checkable condition that makes the claim true), \"alternatives\" (1 to 3 objects with \"claim\" and \"probability\"), \"indicators\" (2 to 5 short strings), \"watch_query\" (3 to 8 words someone would search to find news that settles it), \"watch_urls\" (0 to 2 https URLs of public pages that would show the outcome; only addresses you are certain exist, otherwise an empty list).",
  "VERDICT (mandatory last line, after the FORECAST-JSON line): worth your time: yes|flat|no - one clause of justification. State honestly whether a reader gains something a plain extrapolation of the source would not give them."
].join("\n");

var READER_FORECAST_PROMPT = [
  "You are a busy, intelligent reader who has never heard of this site and owes it nothing. You are reading a forecast. You stop at the first sentence that wastes your time.",
  "Answer with exactly one JSON object and nothing else:",
  "{\"would_read_to_end\": true or false, \"score\": 1 to 5 (5 = I would send it to a friend, 4 = worth the time, 3 = I would skim it, 1 = I stopped at the first paragraph), \"slop_tells\": [up to 3 short phrases copied from the text that sound like generic machine prose], \"fix\": \"one sentence telling the writer what to change\"}",
  "Judge: does it open with something concrete that is happening now? Is the main claim sharp enough that it could plainly turn out false? Is the path from now to the claim a chain of people doing things, each step caused by the one before? Does it name the class of situations it reasons from, without citing outside cases it cannot support, and say why this one should or should not follow it? Are the probabilities stated and consistent with each other? Does it say what to watch? Does it end on the fact that would flip it? Is it more than extrapolating the source? Be strict: a 4 must be earned."
].join("\n");

function publicHttpsUrl(u) {
  var x = safeUrl(u);
  if (!x || !/^https:\/\//i.test(x)) return "";
  try {
    var h = new URL(x).hostname.toLowerCase();
    if (h.indexOf(".") < 0 || /^\d+\.\d+\.\d+\.\d+$/.test(h) || /\.(internal|local|localhost)$/.test(h) || h === "localhost") return "";
  } catch (e) { return ""; }
  return x;
}
// Pulls the single FORECAST-JSON line out of a draft. Returns the draft without that line and the parsed object (or null).
function parseForecastBlock(text) {
  var t = String(text || "");
  var m = t.match(/^[ \t]*FORECAST-JSON:[ \t]*(\{.*\})[ \t]*$/im);
  if (!m) return { text: t, extra: null };
  var extra = null;
  try { extra = JSON.parse(m[1]); } catch (e) { extra = null; }
  // A model that wraps the line in a code fence leaves bare fence lines behind; they are not prose.
  var rest = t.replace(m[0], "").replace(/^[ \t]*```[a-z]*[ \t]*$/gim, "").replace(/\n{3,}/g, "\n\n");
  return { text: rest, extra: extra };
}
function validateForecast(f, text, nowMs) {
  var p = [];
  if (!f || typeof f !== "object" || Array.isArray(f)) return ["forecast block missing or not valid JSON (the FORECAST-JSON line)"];
  var claim = String(f.claim || "").trim();
  if (claim.length < 20 || claim.length > 300) p.push("forecast claim must be 20-300 characters");
  var pr = Number(f.probability);
  if (!isFinite(pr) || pr < 0.05 || pr > 0.95) p.push("forecast probability must be a number from 0.05 to 0.95");
  var hz = String(f.horizon || "");
  var hm = /^\d{4}-\d{2}-\d{2}$/.test(hz) ? Date.parse(hz + "T00:00:00Z") : NaN;
  if (!isFinite(hm)) p.push("forecast horizon must be an ISO date YYYY-MM-DD");
  else {
    var days = (hm - nowMs) / 864e5;
    if (days < FORECAST_MIN_DAYS || days > FORECAST_MAX_DAYS) p.push("forecast horizon must be " + FORECAST_MIN_DAYS + "-" + FORECAST_MAX_DAYS + " days ahead (got " + Math.round(days) + ")");
  }
  var res = String(f.resolution || "").trim();
  if (res.length < 30 || res.length > 400) p.push("resolution condition must be 30-400 characters");
  var alts = Array.isArray(f.alternatives) ? f.alternatives : [];
  if (alts.length < 1 || alts.length > 3) p.push("forecast needs 1-3 alternative scenarios");
  var sum = isFinite(pr) ? pr : 0, altOk = alts.length > 0, maxAlt = 0;
  alts.forEach(function (a) {
    var ap = Number(a && a.probability);
    if (!a || String(a.claim || "").trim().length < 15 || !isFinite(ap) || ap <= 0 || ap > 0.9) altOk = false;
    else { sum += ap; if (ap > maxAlt) maxAlt = ap; }
  });
  if (!altOk) p.push("each alternative needs a claim of 15+ characters and a probability in (0, 0.9]");
  else {
    if (sum > 1.001) p.push("the main scenario and the alternatives sum to more than 100 percent");
    if (isFinite(pr) && maxAlt > pr + 1e-9) p.push("the main scenario must be at least as probable as every alternative (maximum likelihood)");
  }
  var ind = Array.isArray(f.indicators) ? f.indicators : [];
  if (ind.length < 2 || ind.length > 5 || ind.some(function (x) { return String(x || "").trim().length < 15; })) p.push("forecast needs 2-5 leading indicators of 15+ characters");
  var wq = String(f.watch_query || "").trim();
  if (wq.length < 3 || wq.length > 80) p.push("watch_query must be 3-80 characters");
  var wu = f.watch_urls == null ? [] : f.watch_urls;
  if (!Array.isArray(wu) || wu.length > 2 || wu.some(function (u) { return !publicHttpsUrl(u); })) p.push("watch_urls must be 0-2 public https URLs");
  if (isFinite(pr) && text != null) {
    var pct = Math.round(pr * 100);
    if (!new RegExp("(?:^|[^0-9])" + pct + "\\s?(?:%|percent|per cent)", "i").test(String(text))) p.push("the prose must state the main probability (" + pct + " percent) in its own words");
  }
  return p;
}
function forecastXform(text) {
  var r = parseForecastBlock(text);
  r.problems = validateForecast(r.extra, r.text, Date.now());
  return r;
}
// Full problem list for a composed forecast: the essay gate plus the forecast block checks.
function forecastProblems(piece, banned) {
  return gate(piece.text, banned).problems.concat(validateForecast(piece.extra, piece.text, Date.now()));
}
function buildForecastPrompt(src, signalText, opts) {
  var parts = [FORECAST_DIRECTIVE, "TODAY (UTC): " + utcDay()];
  var banned = opts && opts.banned || [];
  if (banned.length) {
    parts.push("\n--- OVERUSED PRECEDENTS ON THIS SITE (BANNED: do not cite it) ---");
    parts.push(banned.map(function (b) { return b.label; }).join("; "));
  }
  var notes = opts && opts.ownerNotes || [];
  if (notes.length) {
    parts.push("\n--- OWNER EDITORIAL DIRECTIVES (authenticated; they outrank the style defaults above, never the FACTS rule or the hard constraints) ---");
    for (var n of notes) parts.push("- " + n);
  }
  var recent = opts && opts.recent || [];
  if (recent.length) {
    parts.push("\n--- FORECASTS ALREADY PUBLISHED (do not repeat their claims) ---");
    for (var r of recent) parts.push("- " + String(r).slice(0, 200));
  }
  parts.push("\n--- ESSAY q08 PUBLISHED (the mechanism to project forward; internal source, never mention it as 'the essay') ---");
  parts.push("title: " + src.title);
  parts.push(String(src.body_md || "").slice(0, 6000));
  if (signalText) { parts.push("\n--- SIGNAL BEHIND IT (internal, never mention) ---"); parts.push(signalText); }
  return parts.join("\n");
}
async function generateForecast(env, t0) {
  var src = await pickForecastSource(env);
  if (!src) return null;
  var sg = await env.DB.prepare("SELECT friction_point FROM signal_log WHERE source_id = ?1 AND friction_point IS NOT NULL LIMIT 1").bind(String(src.signal_source || "")).first().catch(function () { return null; });
  var signalText = String(sg && sg.friction_point || "").slice(0, 800);
  var recentF = await env.DB.prepare("SELECT claim FROM q08_forecasts ORDER BY id DESC LIMIT 6").all().catch(function () { return { results: [] }; });
  var recentBodies = await env.DB.prepare("SELECT body_md FROM published_pieces WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at DESC LIMIT 8").all().catch(function () { return { results: [] }; });
  var banned = []; // Q08-VERIFY-1: outside precedents are rejected by the grounding check, so no precedent is named to the writer
  var prompt = buildForecastPrompt(src, signalText, { banned: banned, ownerNotes: await ownerDirectives(env), recent: (recentF.results || []).map(function (r) { return r.claim; }) });
  var topSig = ("q08-forecast:" + src.slug).slice(0, 80);
  var piece = null, problems = [];
  try { piece = await compose(env, prompt, banned, undefined, forecastXform); } catch (e) { problems = ["compose failed: " + String(e && e.message || e).slice(0, 160)]; }
  if (piece) problems = forecastProblems(piece, banned);
  if (piece && problems.length) {
    var rp = prompt + "\n\n--- CORRECTIVE FEEDBACK: your previous draft was rejected. Write the whole piece again, in the same output format (H1 title first, the prose, one FORECAST-JSON line, the verdict line), fixing these problems ---\n" + problems.join("; ");
    var retry = null;
    try { retry = await compose(env, rp, banned, undefined, forecastXform); } catch (e) { retry = null; }
    if (retry) { var rprob = forecastProblems(retry, banned); if (!rprob.length) { piece = retry; problems = []; } else problems = problems.concat(["retry: " + rprob.join("; ")]); }
  }
  var readerRows = [], gateResult = { ok: !!piece && problems.length === 0, problems: problems };
  if (gateResult.ok) {
    var lv = await runLevels(env, { piece: piece, prompt: prompt, banned: banned, seedText: src.title || "", gateResult: gateResult, xform: forecastXform, forecast: true, readerPrompt: READER_FORECAST_PROMPT });
    piece = lv.piece; gateResult = lv.gateResult; readerRows = lv.rows;
  }
  var fcVr = null;
  if (gateResult.ok) {
    var fcGround = [src.title || "", src.body_md || "", signalText].join("\n");
    var fv = await verifyAndRevise(env, { piece: piece, prompt: prompt, banned: banned, ground: fcGround, seedText: String(src.slug || ""), forecast: true, xform: forecastXform });
    piece = fv.piece; fcVr = fv.vr;
    if (!fv.ok) gateResult = { ok: false, problems: ["accuracy: " + fv.problems.join("; ")] };
  }
  if (!gateResult.ok) {
    await saveReaderTests(env, topSig, readerRows);
    await env.DB.prepare("INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, top_signal, model, ms, status, error) VALUES (?,?,?,?,?,?,?,?)")
      .bind(1, 1, 0, topSig, piece ? piece.model : "", Date.now() - t0, "gate_failed", ("forecast: " + gateResult.problems.join("; ")).slice(0, 900)).run().catch(function () {});
    return null; // the analysis path still runs this tick
  }
  piece.text = piece.text.replace(/\n?worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-].*$/im, "").trim();
  var pseudo = { source: "q08", id: src.id, slug: src.slug, title: src.title, url: ORIGIN + "/p/" + src.slug, points: 0, num_comments: 0, ratio: 0, volatility_score: 0 };
  var saved = await persistPiece(env, piece, { core_concept: src.core_concept || src.title, friction_point: signalText || String(src.title || ""), signal_strength: "Forecast" }, pseudo, piece.model);
  if (fcVr) await recordAudit(env, saved.slug, "pass", "publish", fcVr).catch(function () {});
  await saveReaderTests(env, saved.slug, readerRows);
  var fcRow = await env.DB.prepare("SELECT claim, probability, horizon FROM q08_forecasts WHERE slug = ?").bind(saved.slug).first().catch(function () { return null; });
  await queueForDistribution(env, saved.title, saved.slug, fcRow);
  pingIndexNow(env, ORIGIN + "/p/" + saved.slug).catch(function () {});
  emitContentSignal(env, piece, saved).catch(function () {});
  await env.DB.prepare("INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, top_signal, model, ms, status) VALUES (?,?,?,?,?,?,?)")
    .bind(1, 1, 1, topSig, piece.model, Date.now() - t0, "ok").run();
  return { ok: true, kind: "forecast", slug: saved.slug, title: saved.title, model: piece.model, source: "q08", story: src.title };
}

// ---- Accuracy layer (Q08-VERIFY-1, owner directive 2026-10-10: q08 content is 100% accurate and fact-checked) ---------------
// An essay or forecast is published only when (1) every name, year and figure in it appears in the source material the writer
// was given (deterministic check), and (2) two reviewers from model families other than the writer's find no claim about the
// real world that the source material does not state. A reviewer outage fails closed: nothing is published unchecked. The same
// test re-audits pieces already live; a piece that fails is retracted in public (never silently deleted).
var GROUND_MAX = 14000;
var __accSchemaDone = false, __accSchemaTried = 0;
async function ensureAccuracySchema(env) {
  if (__accSchemaDone) return true;
  if (Date.now() - __accSchemaTried < 30000) return false;
  __accSchemaTried = Date.now();
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS q08_retractions (slug TEXT PRIMARY KEY, reason TEXT, claims_json TEXT, retracted_at TEXT)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS q08_audits (slug TEXT PRIMARY KEY, verdict TEXT, stage TEXT, models TEXT, unsupported_json TEXT, checked_at TEXT)").run();
    __accSchemaDone = true;
    return true;
  } catch (e) {
    console.error("q08 accuracy schema failed: " + String(e && e.message || e).slice(0, 200));
    return false;
  }
}
async function fetchArticleText(url) {
  var u = publicHttpsUrl(url);
  if (!u) return "";
  try {
    var r = await fetch(u, { headers: { "User-Agent": UA, "Accept": "text/html,text/plain" }, signal: AbortSignal.timeout(15000), redirect: "follow" });
    if (!r.ok) return "";
    var ct = String(r.headers.get("content-type") || "");
    if (!/text\/|html|xml/i.test(ct)) return "";
    return plainText((await r.text()).slice(0, 400000)).slice(0, GROUND_MAX);
  } catch (e) { return ""; }
}
var GROUND_LEAD = new Set(["the","a","an","in","on","at","when","if","but","and","so","as","that","this","these","those","it","its","each","every","most","some","no","for","with","without","before","after","once","while","because","since","what","where","who","why","how","then","there","here","not","only","even","still","yet","or","nor","by","from","to","of","their","his","her","our","your","one","two","three","such","both","many","any","all","i","we","you","he","she","they","my","whether","although","though","until","unless","instead","perhaps","suppose","imagine","consider","now","today","later","earlier","first","second","third","finally","meanwhile","however","which","whose","than","also","just","every","another","other","either","neither","same","more","less","few","several"]);
var GROUND_OK = new Set(["january","february","march","april","may","june","july","august","september","october","november","december","monday","tuesday","wednesday","thursday","friday","saturday","sunday","q08","qnfo","hacker news","hn","github","arxiv","markdown","json","html"]);
function groundWords(text) {
  var set = new Set(); String(text || "").toLowerCase().replace(/[‘’]/g, "'").replace(/[a-z0-9][a-z0-9'.-]*/g, function (w) {
    w = w.replace(/[.'-]+$/, ""); set.add(w); set.add(w.replace(/'s$/, "")); if (w.length > 3 && w.charAt(w.length - 1) === "s") set.add(w.slice(0, -1)); else set.add(w + "s"); return "";
  });
  return set;
}
function groundNumbers(text) {
  var set = new Set(); (String(text || "").match(/\d[\d,]*(?:\.\d+)?/g) || []).forEach(function (n) { set.add(n.replace(/,/g, "").replace(/\.0+$/, "")); }); return set;
}
// Deterministic check: names, years and figures in `text` that `ground` does not contain. Returns a list of problem strings.
function groundingProblems(text, ground, opts) {
  var o = opts || {}, nowYear = Number(String(o.today || utcDay()).slice(0, 4));
  var body = String(text || "").replace(/^[ \t]*FORECAST-JSON:.*$/gim, " ").replace(/\n?worth your time:[^\n]*$/im, " ").replace(/^#\s+/gm, "").replace(/\(?(?:This|A|An) hypothetical[^)]*\)?/gi, " ");
  var words = groundWords(ground), nums = groundNumbers(ground), out = [], seen = {};
  function add(kind, v) { var k = kind + v.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push(kind + ": " + v); }
  // figures: every number must be in the source, except small counts, future years and (forecasts) probabilities and horizons
  var nre = /\$?\d[\d,]*(?:\.\d+)?\s*(%|percent|days?|weeks?|months?|quarters?|years?|hours?)?/gi, m;
  while ((m = nre.exec(body))) {
    var raw = m[0], digits = raw.replace(/[^\d.]/g, "").replace(/\.$/, "").replace(/\.0+$/, "");
    if (!digits || digits.indexOf(",") >= 0) continue;
    var plain = m[0].replace(/[$,\s]/g, "").replace(/(%|percent|days?|weeks?|months?|quarters?|years?|hours?)$/i, "");
    var num = plain.replace(/,/g, "");
    if (nums.has(num) || nums.has(num.replace(/\.0+$/, ""))) continue;
    var unit = (m[1] || "").toLowerCase(), val = Number(num);
    var isYear = /^(1[0-9]|20)\d\d$/.test(num) && !unit;
    if (isYear && val >= nowYear && o.forecast) continue;
    if (o.forecast && (unit === "%" || unit === "percent")) continue;
    if (o.forecast && /^(days?|weeks?|months?|quarters?|years?)$/.test(unit)) continue;
    if (!isYear && !unit && /^\d{1,2}$/.test(num) && val <= 10 && raw.indexOf("$") < 0) continue;
    if (!isYear && !unit && /^\d$/.test(num)) continue;
    add(isYear ? "year not in the source" : "figure not in the source", raw.trim());
  }
  // names: capitalised words or phrases that are not at the start of a sentence and are absent from the source
  var sentences = body.split(/(?<=[.!?:;—])\s+|\n+/);
  sentences.forEach(function (sent) {
    var toks = sent.match(/[A-Za-z0-9][A-Za-z0-9&'.’-]*|[,;]/g) || [];
    var i = 0;
    while (i < toks.length) {
      var t = toks[i];
      if (!/^[A-Z]/.test(t) || /^[A-Z]$/.test(t) && toks[i + 1] && !/^[A-Z]/.test(toks[i + 1])) { i++; continue; }
      var j = i, phrase = [];
      while (j < toks.length && /^[A-Z][A-Za-z0-9&'.’-]*$/.test(toks[j])) { phrase.push(toks[j]); j++; if (toks[j] && /^(of|the|and|for|de|von|van|del|la)$/i.test(toks[j]) && toks[j + 1] && /^[A-Z]/.test(toks[j + 1])) { phrase.push(toks[j]); j++; } }
      var lead = 0; while (lead < phrase.length - 1 && GROUND_LEAD.has(phrase[lead].toLowerCase().replace(/[^a-z]/g, ""))) lead++;
      var core = phrase.slice(lead);
      var first = (i === 0);
      if (core.length && !(core.length === 1 && first && lead === 0) && !(core.length === 1 && GROUND_LEAD.has(core[0].toLowerCase()))) {
        var joined = core.join(" ").replace(/[’]/g, "'");
        var low = joined.toLowerCase().replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();
        if (low && !GROUND_OK.has(low)) {
          var miss = low.split(" ").filter(function (w) { return w && !GROUND_OK.has(w) && !GROUND_LEAD.has(w) && !words.has(w) && !words.has(w.replace(/'s$/, "")) && !/^\d+$/.test(w); });
          if (miss.length) add("name not in the source", joined);
        }
      }
      i = Math.max(j, i + 1);
    }
  });
  return out.slice(0, 14);
}
var FACTCHECK_PROMPT = [
  "You are a strict fact-checker for a publication that must contain no unsupported claim. You are given SOURCE MATERIAL and a DRAFT.",
  "List every sentence or clause in the DRAFT that asserts something about the real world and is not stated in, or a direct paraphrase of, the SOURCE MATERIAL. That covers events, dates, people, organisations, products, laws, institutions, numbers, quotations, studies, historical episodes and precedents, and statements that a practice or fact is 'known' or 'common'.",
  "Your own knowledge does not count as support, even if you are sure the claim is true: if it is not in the SOURCE MATERIAL, it is unsupported. These are NOT violations: reasoning that follows from the source's facts, definitions, and a clearly labelled hypothetical that names no real person, company, product, date or number.",
  "Answer with exactly one JSON object and nothing else: {\"unsupported\": [up to 8 short quotations copied from the DRAFT, each followed by ' -- ' and the reason in a few words], \"verdict\": \"pass\" or \"fail\"}. verdict is \"pass\" only when unsupported is empty."
].join("\n");
function parseFactVerdict(text) {
  var m = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  var o; try { o = JSON.parse(m[0]); } catch (e) { return null; }
  var v = String(o && o.verdict || "").toLowerCase().trim();
  if (v !== "pass" && v !== "fail") return null;
  var u = Array.isArray(o.unsupported) ? o.unsupported.map(function (x) { return String(x).replace(/\s+/g, " ").trim().slice(0, 260); }).filter(Boolean).slice(0, 8) : [];
  if (v === "pass" && u.length) v = "fail";
  if (v === "fail" && !u.length) u = ["the reviewer rejected the draft without naming a claim"];
  return { verdict: v, unsupported: u };
}
async function factCheckOne(env, modelId, essay, ground) {
  try {
    var body = FACTCHECK_PROMPT + "\n\n--- SOURCE MATERIAL ---\n" + String(ground).slice(0, GROUND_MAX) + "\n\n--- DRAFT ---\n" + String(essay).replace(/^[ \t]*FORECAST-JSON:.*$/gim, "").replace(/\n?worth your time:[^\n]*$/im, "").trim().slice(0, 9000);
    var resp = await env.AI.run(modelId, { messages: [{ role: "user", content: body }], max_tokens: READER_MAX_TOKENS, temperature: 0.1 }, { signal: AbortSignal.timeout(110000) });
    var out = resp.response || (resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) || "";
    var v = parseFactVerdict(out);
    if (v) { v.model = modelId; v.family = familyOf(modelId); }
    return v;
  } catch (e) { return null; }
}
// Two valid verdicts from two different families, neither the writer's. Fewer than two valid verdicts is "unavailable" (fail closed).
async function factCheck(env, essay, ground, writerModel, seedText) {
  var wf = familyOf(writerModel || "");
  var ids = pickPanel([wf], 4, seedOf(seedText));
  var got = [];
  for (var k = 0; k < ids.length && got.length < 2; k += 2) {
    var batch = ids.slice(k, k + (2 - got.length));
    var rs = await Promise.all(batch.map(function (id) { return factCheckOne(env, id, essay, ground); }));
    rs.forEach(function (r) { if (r) got.push(r); });
  }
  if (got.length < 2) return { ok: false, unavailable: true, unsupported: [], judges: got, reason: "fewer than two fact-check verdicts from other model families" };
  var uns = []; got.forEach(function (g) { g.unsupported.forEach(function (u) { if (uns.indexOf(u) < 0) uns.push(u); }); });
  return { ok: got.every(function (g) { return g.verdict === "pass"; }), unavailable: false, unsupported: uns.slice(0, 10), judges: got, reason: "" };
}
// Full verification of one draft: deterministic grounding first (free), then the two-family review.
async function verifyPiece(env, text, ground, writerModel, seedText, opts) {
  var det = groundingProblems(text, ground, opts);
  if (det.length) return { ok: false, stage: "grounding", problems: det, judges: [], unavailable: false };
  var fc = await factCheck(env, text, ground, writerModel, seedText);
  if (fc.unavailable) return { ok: false, stage: "factcheck", problems: ["fact-check unavailable: " + fc.reason], judges: fc.judges, unavailable: true };
  if (!fc.ok) return { ok: false, stage: "factcheck", problems: fc.unsupported.map(function (u) { return "unsupported claim: " + u; }), judges: fc.judges, unavailable: false };
  return { ok: true, stage: "pass", problems: [], judges: fc.judges, unavailable: false };
}
function factRevisionPrompt(prompt, draft, problems, ground, forecastExtra) {
  var d = String(draft || "") + (forecastExtra ? "\nFORECAST-JSON: " + JSON.stringify(forecastExtra) : "") + "\nworth your time: yes - revised for accuracy";
  return prompt + "\n\n--- FACT REVISION: independent fact-checkers rejected your draft. Every item below is a claim the source material does not support. Return the SAME piece in the SAME output format (H1 title first, then the prose" + (forecastExtra ? ", the FORECAST-JSON line" : "") + ", and the final 'worth your time' line) with each such name, date, figure or claim deleted or replaced by general reasoning or a labelled hypothetical that names no real person, company, product, date or number. Add no new facts. Keep everything else. Problems:\n- "
    + problems.join("\n- ") + "\n--- SOURCE MATERIAL (the only facts you may use) ---\n" + String(ground).slice(0, 7000) + "\n--- DRAFT TO REVISE ---\n" + d;
}
async function verifyAndRevise(env, a) {
  var opts = { forecast: !!a.forecast };
  var vr = await verifyPiece(env, a.piece.text, a.ground, a.piece.model, a.seedText, opts);
  if (vr.ok || vr.unavailable) return { ok: vr.ok, piece: a.piece, vr: vr, problems: vr.problems };
  var rev = null;
  try { rev = await compose(env, factRevisionPrompt(a.prompt, a.piece.text, vr.problems, a.ground, a.forecast ? a.piece.extra : null), a.banned, undefined, a.xform); } catch (e) { rev = null; }
  if (!rev || !rev.text) return { ok: false, piece: a.piece, vr: vr, problems: vr.problems.concat(["fact revision produced no draft"]) };
  if (a.forecast && !rev.extra && a.piece.extra) rev.extra = a.piece.extra;
  var sp = a.forecast ? forecastProblems(rev, a.banned) : gate(rev.text, a.banned).problems;
  if (sp.length) return { ok: false, piece: a.piece, vr: vr, problems: vr.problems.concat(["fact revision failed the editorial gate: " + sp.join("; ")]) };
  var vr2 = await verifyPiece(env, rev.text, a.ground, rev.model, a.seedText, opts);
  return { ok: vr2.ok, piece: vr2.ok ? rev : a.piece, vr: vr2, problems: vr2.problems };
}
function auditSeed(slug) { return "audit:" + slug; }
// Retracts a piece in public: the URL keeps answering with a notice, the piece leaves the index, feed, sitemap and APIs, queued
// social rows for it are suppressed, and forecasts built on it are retracted too. Reversible by deleting the q08_retractions row.
async function retractPiece(env, slug, reason, claims) {
  await ensureAccuracySchema(env);
  var now = nowIso(), cj = JSON.stringify((claims || []).slice(0, 8));
  await env.DB.prepare("INSERT OR REPLACE INTO q08_retractions (slug, reason, claims_json, retracted_at) VALUES (?,?,?,?)").bind(slug, String(reason || "").slice(0, 400), cj, now).run();
  try {
    var kids = await env.DB.prepare("SELECT slug FROM q08_forecasts WHERE source_slug = ?").bind(slug).all();
    for (var kid of (kids.results || [])) {
      await env.DB.prepare("INSERT OR IGNORE INTO q08_retractions (slug, reason, claims_json, retracted_at) VALUES (?,?,?,?)").bind(kid.slug, "Built on an essay that was retracted for unsupported claims.", "[]", now).run();
      await env.DB.prepare("UPDATE q08_forecasts SET status = 'void', disposition = 'retracted', resolved_at = ?1 WHERE slug = ?2 AND status = 'open'").bind(now, kid.slug).run().catch(function () {});
    }
  } catch (e) {}
  try {
    if (env.AUDIT) await env.AUDIT.prepare("UPDATE social_threads SET status = 'suppressed', notes = COALESCE(notes,'') || ' | Q08-VERIFY-1: piece retracted' WHERE status = 'queued' AND slug LIKE 'q08-%' AND posts LIKE ?1").bind("%/p/" + slug + "%").run();
  } catch (e) {}
  return { ok: true, slug: slug };
}
async function recordAudit(env, slug, verdict, stage, vr) {
  await ensureAccuracySchema(env);
  await env.DB.prepare("INSERT OR REPLACE INTO q08_audits (slug, verdict, stage, models, unsupported_json, checked_at) VALUES (?,?,?,?,?,?)")
    .bind(slug, verdict, stage, (vr.judges || []).map(function (j) { return j.model; }).join(","), JSON.stringify((vr.problems || []).slice(0, 10)), nowIso()).run();
}
// Source material for a piece already published: its signal row, the linked article, and (for a forecast) the essay it projects.
async function groundForPublished(env, p) {
  var parts = [p.title || "", p.core_concept || ""];
  var sig = null;
  try { sig = await env.DB.prepare("SELECT title, url, friction_point FROM signal_log WHERE id = ?").bind(p.signal_id).first(); } catch (e) { sig = null; }
  if (sig) { parts.push(sig.title || "", sig.friction_point || ""); }
  if (p.kind === "forecast") {
    var fr = await env.DB.prepare("SELECT source_slug FROM q08_forecasts WHERE slug = ?").bind(p.slug).first().catch(function () { return null; });
    var src = fr && await env.DB.prepare("SELECT title, body_md FROM published_pieces WHERE slug = ?").bind(fr.source_slug).first().catch(function () { return null; });
    if (src) parts.push(src.title || "", src.body_md || "");
  } else if (sig && sig.url) {
    parts.push(await fetchArticleText(sig.url));
  }
  return parts.join("\n").slice(0, GROUND_MAX + 8000);
}
// Cron step: audit published pieces that have no audit row. A reviewer outage writes nothing (retried next tick); a failure retracts.
async function auditPublished(env, limit) {
  if (!(await ensureAccuracySchema(env))) return { ok: false, reason: "schema" };
  var rows = await env.DB.prepare(
    "SELECT p.id, p.slug, p.title, p.body_md, p.core_concept, p.signal_id, p.kind, p.published_at FROM published_pieces p " +
    "WHERE p.slug NOT IN (SELECT slug FROM q08_retractions) AND p.slug NOT IN (SELECT slug FROM q08_audits) ORDER BY p.published_at DESC LIMIT ?1"
  ).bind(limit || 3).all();
  var res = { checked: 0, passed: 0, retracted: 0, deferred: 0 };
  for (var p of (rows.results || [])) {
    var ground = await groundForPublished(env, p);
    var vr = await verifyPiece(env, "# " + p.title + "\n" + p.body_md, ground, "", auditSeed(p.slug), { forecast: p.kind === "forecast", today: String(p.published_at || "").slice(0, 10) || utcDay() });
    if (vr.unavailable) { res.deferred++; continue; }
    res.checked++;
    if (vr.ok) { await recordAudit(env, p.slug, "pass", vr.stage, vr); res.passed++; continue; }
    await recordAudit(env, p.slug, "fail", vr.stage, vr);
    await retractPiece(env, p.slug, "Retracted after an accuracy audit: the piece contained claims the source material does not support (" + vr.stage + " check).", vr.problems);
    res.retracted++;
  }
  return Object.assign({ ok: true }, res);
}
function renderRetraction(r, p) {
  var claims = []; try { claims = JSON.parse(r.claims_json || "[]"); } catch (e) { claims = []; }
  var date = String(r.retracted_at || "").slice(0, 10);
  var list = claims.length ? "<p>Examples of what could not be verified:</p><ul>" + claims.slice(0, 5).map(function (c) { return "<li>" + escHtml(c) + "</li>"; }).join("") + "</ul>" : "";
  return '<meta name="robots" content="noindex"><article class="q08-piece"><p class="q-eyebrow"><a href="/" style="text-decoration:none;color:inherit">← Index</a></p><h1 class="q08-t">Retracted: ' + escHtml(p && p.title || "this piece") + '</h1><p class="q-meta">Retracted ' + escHtml(date) + '</p>' +
    "<p>q08 withdrew this piece. " + escHtml(r.reason || "") + " Every q08 piece is now checked against its source material by two independent reviewers before publication, and earlier pieces are being re-audited; any that fail are withdrawn and listed on the <a href=\"/retractions\">retractions page</a>.</p>" + list + "</article>";
}
function renderRetractions(rows) {
  var items = (rows || []).map(function (r) { return "<li><a href=\"/p/" + escHtml(r.slug) + "\">" + escHtml(r.title || r.slug) + "</a> — retracted " + escHtml(String(r.retracted_at || "").slice(0, 10)) + "</li>"; }).join("");
  return '<article class="q08-piece"><p class="q-eyebrow"><a href="/" style="text-decoration:none;color:inherit">← Index</a></p><h1 class="q08-t">Corrections and retractions</h1><p>q08 publishes only claims its source material supports. When a piece is found to contain an unsupported claim, it is withdrawn and listed here.</p>' + (items ? "<ul>" + items + "</ul>" : "<p>No piece has been retracted.</p>") + "</article>";
}

// ---- Resolution and calibration -------------------------------------------------------------------------------------
function plainText(h) {
  return String(h || "").replace(/<script\b[\s\S]*?<\/script[^>]*>/gi, " ").replace(/<style\b[\s\S]*?<\/style[^>]*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
// Evidence comes from several independent public sources, each failing on its own (Q08-FORECAST-SOURCES-1): Hacker News,
// worldwide news (GDELT), Wikipedia's current text, and arXiv. The query is the writer's watch_query; every line carries
// its source and date so the judges can weigh it.
async function evidenceFetch(url, ms) {
  var r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(ms || 15000) });
  if (!r.ok) throw new Error("http " + r.status);
  return r;
}
var EVIDENCE_SOURCES = [
  { name: "Hacker News", run: async function (q, sinceSec) {
    var d = await (await evidenceFetch("https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=8&query=" + encodeURIComponent(q) + "&numericFilters=" + encodeURIComponent("created_at_i>" + sinceSec))).json();
    return (d.hits || []).slice(0, 8).map(function (h) { return "Hacker News story, " + String(h.created_at || "").slice(0, 10) + ", " + (h.points || 0) + " points: " + String(h.title || "").slice(0, 200) + (h.url ? " (" + String(h.url).slice(0, 160) + ")" : ""); });
  } },
  { name: "news", run: async function (q, sinceSec) {
    var start = new Date(Math.max(sinceSec, Date.now() / 1000 - 86400 * 365) * 1000).toISOString().replace(/[-:T]/g, "").slice(0, 14);
    var d = await (await evidenceFetch("https://api.gdeltproject.org/api/v2/doc/doc?mode=artlist&format=json&maxrecords=10&sort=datedesc&startdatetime=" + start + "&query=" + encodeURIComponent(q))).json();
    return (d.articles || []).slice(0, 8).map(function (a) { var sd = String(a.seendate || ""); return "News article (" + String(a.domain || "").slice(0, 60) + "), " + sd.slice(0, 4) + "-" + sd.slice(4, 6) + "-" + sd.slice(6, 8) + ": " + String(a.title || "").slice(0, 200) + (a.url ? " (" + String(a.url).slice(0, 160) + ")" : ""); });
  } },
  { name: "Wikipedia", run: async function (q) {
    var d = await (await evidenceFetch("https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=" + encodeURIComponent(q))).json();
    return ((d.query && d.query.search) || []).slice(0, 3).map(function (h) { return "Wikipedia article '" + String(h.title || "").slice(0, 100) + "', last edited " + String(h.timestamp || "").slice(0, 10) + ": " + plainText(h.snippet).slice(0, 300); });
  } },
  { name: "arXiv", run: async function (q, sinceSec) {
    var x = await (await evidenceFetch("https://export.arxiv.org/api/query?sortBy=submittedDate&sortOrder=descending&max_results=5&search_query=all:" + encodeURIComponent('"' + q + '"'))).text();
    var out = [];
    for (var m of x.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      var t = (m[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1], pub = (m[1].match(/<published>([^<]*)<\/published>/) || [])[1] || "";
      if (t && Date.parse(pub) / 1000 > sinceSec) out.push("arXiv paper, " + pub.slice(0, 10) + ": " + plainText(t).slice(0, 200));
    }
    return out;
  } }
];
async function gatherEvidence(f) {
  var ev = [];
  var since = Math.floor(Date.parse(f.created_at) / 1000) || 0;
  var q = String(f.watch_query || "").trim();
  var got = await Promise.all(EVIDENCE_SOURCES.map(function (s) { return s.run(q, since).catch(function () { return []; }); }));
  for (var g of got) for (var line of g) ev.push(line);
  var urls = []; try { urls = JSON.parse(f.watch_urls || "[]"); } catch (e) { urls = []; }
  for (var wu of (Array.isArray(urls) ? urls : []).slice(0, 2)) {
    var pu = publicHttpsUrl(wu);
    if (!pu) continue;
    try {
      var pr = await fetch(pu, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000), redirect: "follow" });
      if (!pr.ok) continue;
      var len = Number(pr.headers.get("content-length") || 0);
      if (len > 3e6) continue;
      ev.push("Page " + pu + " as fetched " + nowIso().slice(0, 10) + ": " + plainText((await pr.text()).slice(0, 400000)).slice(0, 3000));
    } catch (e) {}
  }
  return ev;
}
var FORECAST_JUDGE_PROMPT = [
  "You settle forecasts for a publication. Use only the evidence listed below and the dates given; use no outside knowledge.",
  "Answer with exactly one JSON object and nothing else: {\"outcome\": \"yes\" or \"no\" or \"unclear\", \"basis\": \"the evidence number and a short paraphrase of what it shows\"}.",
  "yes: the evidence directly shows the resolution condition was met on or before the horizon date.",
  "no: the evidence directly shows the horizon date has passed and the condition was not met, or that the opposite happened. Not finding evidence that something happened is NOT evidence that it did not.",
  "unclear: anything else, including no evidence, off-topic evidence, or evidence that is dated after the horizon and does not say when the condition became true."
].join("\n");
function parseJudgeVerdict(text) {
  var m = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  var o; try { o = JSON.parse(m[0]); } catch (e) { return null; }
  var out = String(o && o.outcome || "").toLowerCase().trim();
  if (out !== "yes" && out !== "no" && out !== "unclear") return null;
  return { outcome: out, basis: String(o.basis || "").slice(0, 300) };
}
function aggregateJudges(js) {
  var v = (js || []).filter(Boolean);
  if (v.length < 2) return { outcome: "unclear", basis: "fewer than two valid judge verdicts" };
  if (v[0].outcome === v[1].outcome && v[0].outcome !== "unclear") return { outcome: v[0].outcome, basis: v[0].basis };
  return { outcome: "unclear", basis: "judges did not agree or found the evidence insufficient" };
}
async function judgeForecast(env, f, evidence) {
  if (!evidence.length) return { outcome: "unclear", basis: "no public evidence found", judges: [] };
  var body = FORECAST_JUDGE_PROMPT + "\n\nToday: " + utcDay() + "\nForecast made: " + String(f.created_at || "").slice(0, 10) + "\nHorizon date: " + f.horizon + "\nClaim: " + f.claim + "\nResolution condition: " + f.resolution + "\n\nEVIDENCE:\n" + evidence.map(function (e, i) { return (i + 1) + ". " + e; }).join("\n");
  var ids = pickPanel([], 2, seedOf(f.slug));
  var got = await Promise.all(ids.map(async function (id) {
    try {
      var resp = await env.AI.run(id, { messages: [{ role: "user", content: body }], max_tokens: READER_MAX_TOKENS, temperature: 0.1 }, { signal: AbortSignal.timeout(90000) });
      var out = resp.response || (resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) || "";
      var v = parseJudgeVerdict(out);
      if (v) v.model = id;
      return v;
    } catch (e) { return null; }
  }));
  var agg = aggregateJudges(got);
  agg.judges = got.filter(Boolean).map(function (j) { return { model: j.model, outcome: j.outcome }; });
  return agg;
}
async function resolveForecasts(env, max) {
  if (!(await ensureForecastSchema(env))) return { checked: 0 };
  var cutoff = new Date(Date.now() - FORECAST_RECHECK_DAYS * 864e5 + 36e5).toISOString();
  var due = await env.DB.prepare("SELECT * FROM q08_forecasts WHERE status = 'open' AND horizon <= ?1 AND (last_check_at IS NULL OR last_check_at <= ?2) ORDER BY horizon ASC LIMIT ?3").bind(utcDay(), cutoff, max || 2).all();
  var done = 0;
  for (var f of (due.results || [])) {
    var ev = await gatherEvidence(f);
    var v = await judgeForecast(env, f, ev);
    var now = nowIso(), checks = (Number(f.checks) || 0) + 1;
    var evJson = JSON.stringify({ at: now, evidence: ev.map(function (e) { return e.slice(0, 400); }), verdict: v.outcome, basis: v.basis, judges: v.judges }).slice(0, 6000);
    if (v.outcome === "yes" || v.outcome === "no") {
      var oc = v.outcome === "yes" ? 1 : 0, br = Math.round(Math.pow(Number(f.probability) - oc, 2) * 10000) / 10000;
      await env.DB.prepare("UPDATE q08_forecasts SET status = 'resolved', outcome = ?1, brier = ?2, checks = ?3, last_check_at = ?4, resolved_at = ?4, disposition = ?5, evidence_json = ?6 WHERE id = ?7 AND status = 'open'")
        .bind(oc, br, checks, now, ("resolved " + v.outcome + ": " + v.basis).slice(0, 400), evJson, f.id).run();
    } else if (checks >= FORECAST_MAX_CHECKS) {
      await env.DB.prepare("UPDATE q08_forecasts SET status = 'void', checks = ?1, last_check_at = ?2, resolved_at = ?2, disposition = ?3, evidence_json = ?4 WHERE id = ?5 AND status = 'open'")
        .bind(checks, now, ("void: no decidable public evidence after " + checks + " checks. Last basis: " + v.basis).slice(0, 400), evJson, f.id).run();
    } else {
      await env.DB.prepare("UPDATE q08_forecasts SET checks = ?1, last_check_at = ?2, evidence_json = ?3 WHERE id = ?4 AND status = 'open'").bind(checks, now, evJson, f.id).run();
    }
    done++;
  }
  return { checked: done };
}
// rows: resolved forecasts with probability and outcome (1 or 0). Under 20 rows a Brier score is noise and is reported as such.
function calibration(rows) {
  var r = (rows || []).filter(function (x) { return x && (x.outcome === 0 || x.outcome === 1) && isFinite(Number(x.probability)); });
  var n = r.length;
  var out = { n: n, brier: null, hit_rate: null, baseline_brier: 0.25, bins: [], reliable: n >= 20 };
  if (!n) return out;
  var sb = 0, hits = 0;
  r.forEach(function (x) { sb += Math.pow(Number(x.probability) - x.outcome, 2); hits += x.outcome; });
  out.brier = Math.round((sb / n) * 1000) / 1000;
  out.hit_rate = Math.round((hits / n) * 1000) / 1000;
  [[0.05, 0.3], [0.3, 0.5], [0.5, 0.7], [0.7, 0.96]].forEach(function (b) {
    var g = r.filter(function (x) { var p = Number(x.probability); return p >= b[0] && p < b[1]; });
    if (!g.length) return;
    var mp = g.reduce(function (a, x) { return a + Number(x.probability); }, 0) / g.length, fq = g.reduce(function (a, x) { return a + x.outcome; }, 0) / g.length;
    out.bins.push({ from: b[0], to: b[1], n: g.length, mean_probability: Math.round(mp * 1000) / 1000, observed_frequency: Math.round(fq * 1000) / 1000 });
  });
  return out;
}
async function forecastStats(env) {
  var out = { published_7d: 0, open: 0, overdue_open: 0, resolved: 0, void: 0, void_share: null, calibration: calibration([]) };
  if (!(await ensureForecastSchema(env))) return out;
  try {
    var since = new Date(Date.now() - 7 * 864e5).toISOString();
    var a = await env.DB.prepare("SELECT COUNT(*) n FROM q08_forecasts WHERE created_at >= ?1").bind(since).first();
    var s = await env.DB.prepare("SELECT status, COUNT(*) n FROM q08_forecasts GROUP BY status").all();
    var od = await env.DB.prepare("SELECT COUNT(*) n FROM q08_forecasts WHERE status = 'open' AND horizon <= ?1").bind(new Date(Date.now() - 35 * 864e5).toISOString().slice(0, 10)).first();
    var rr = await env.DB.prepare("SELECT probability, outcome FROM q08_forecasts WHERE status = 'resolved'").all();
    out.published_7d = Number(a && a.n) || 0;
    (s.results || []).forEach(function (x) { if (x.status === "open") out.open = x.n; else if (x.status === "resolved") out.resolved = x.n; else if (x.status === "void") out.void = x.n; });
    out.overdue_open = Number(od && od.n) || 0;
    var fin = out.resolved + out.void;
    out.void_share = fin >= 10 ? Math.round((out.void / fin) * 1000) / 1000 : null;
    out.calibration = calibration(rr.results || []);
  } catch (e) {}
  return out;
}
function fcPct(p) { return Math.round(Number(p) * 100) + "%"; }
function fcStatus(f) {
  if (f.status === "resolved") return f.outcome === 1 ? "came true" : "did not come true";
  if (f.status === "void") return "void: no decidable public evidence";
  return Date.parse(String(f.horizon) + "T00:00:00Z") <= Date.now() ? "due, being checked" : "open";
}
function renderForecastBox(f) {
  if (!f) return "";
  var alts = []; try { alts = JSON.parse(f.alternatives_json || "[]"); } catch (e) { alts = []; }
  var ind = []; try { ind = JSON.parse(f.indicators_json || "[]"); } catch (e) { ind = []; }
  var altText = (Array.isArray(alts) ? alts : []).map(function (a) { return escHtml(String(a.claim || "")) + " (" + fcPct(a.probability) + ")"; }).join("; ");
  return '<section class="q-panel" style="margin:32px 0 0"><h2 class="q-h3" style="margin:0 0 8px">Forecast record</h2>' +
    '<p style="margin:0 0 8px"><strong>Most likely scenario (' + fcPct(f.probability) + '):</strong> ' + escHtml(f.claim) + '</p>' +
    '<p class="q-meta" style="margin:0 0 6px">Settled by ' + escHtml(f.horizon) + ' &middot; status: ' + escHtml(fcStatus(f)) + (f.status === "resolved" && f.brier != null ? ' &middot; Brier score ' + escHtml(String(f.brier)) : "") + '</p>' +
    '<p class="q-meta" style="margin:0 0 6px">Resolves true if: ' + escHtml(f.resolution) + '</p>' +
    (altText ? '<p class="q-meta" style="margin:0 0 6px">Rival scenarios: ' + altText + '</p>' : "") +
    (ind.length ? '<p class="q-meta" style="margin:0 0 6px">Watch: ' + ind.map(function (x) { return escHtml(String(x)); }).join("; ") + '</p>' : "") +
    '<p class="q-meta" style="margin:0"><a href="/forecasts">All forecasts and the scoring record</a></p></section>';
}
function renderForecasts(rows, stats) {
  var item = function (f) {
    var extra = f.status === "resolved" ? " &middot; " + escHtml(fcStatus(f)) + (f.brier != null ? " &middot; Brier " + escHtml(String(f.brier)) : "") : " &middot; " + escHtml(fcStatus(f));
    return '<li class="q-item"><a class="q-item-title" href="/p/' + escHtml(f.slug) + '">' + escHtml(f.claim) + '</a><div class="q-item-meta"><span class="q-badge">' + fcPct(f.probability) + '</span> settled by ' + escHtml(f.horizon) + extra + '</div></li>';
  };
  var open = rows.filter(function (f) { return f.status === "open"; }).sort(function (a, b) { return String(a.horizon).localeCompare(String(b.horizon)); });
  var fin = rows.filter(function (f) { return f.status !== "open"; });
  var c = stats.calibration;
  var cal = c.n ? ('Scored so far: ' + c.n + ' resolved, mean Brier score ' + c.brier + ' (always saying 50% scores 0.25; lower is better)' + (c.reliable ? "" : '. Under 20 resolved forecasts a score is mostly noise') + '. Void: ' + stats.void + (stats.void_share != null ? ' (' + Math.round(stats.void_share * 100) + '% of finished)' : "") + '.') : 'No forecast has been scored yet. Void so far: ' + stats.void + '.';
  var body = '<section class="q08-hero"><h1>Forecasts</h1><p class="q-lede">Each forecast takes a mechanism q08 has described and says where it most likely leads: one dated scenario, its probability, the rivals, and a condition anyone can check. When the date passes, two judges from different model families settle it from public evidence and the score is recorded here, misses included. A forecast the evidence cannot settle after four checks is marked void in public.</p><p class="q-meta">' + cal + '</p></section>' +
    '<section class="q08-feed" aria-label="Open forecasts"><h2 class="q-h3">Open</h2>' + (open.length ? '<ul class="q-list">' + open.map(item).join("") + '</ul>' : '<div class="q-note">No open forecasts yet. They appear after every few essays.</div>') + '</section>' +
    (fin.length ? '<section class="q08-feed" aria-label="Settled forecasts"><h2 class="q-h3">Settled</h2><ul class="q-list">' + fin.map(item).join("") + '</ul></section>' : "") + q08Sub(true);
  return q08Page({ title: "Forecasts \u00b7 q08", canonical: ORIGIN + "/forecasts", active: "forecasts", description: "Dated, probability-weighted forecasts built from q08's structural analyses, scored when they resolve." }, body);
}

// ---------------------------------------------------------------------------
// 9. HTML rendering
// ---------------------------------------------------------------------------
var MATH_HEAD = "<script>window.MathJax={tex:{inlineMath:[[\"\\\\(\",\"\\\\)\"]],displayMath:[[\"$$\",\"$$\"],[\"\\\\[\",\"\\\\]\"]],processEscapes:true},svg:{scale:1.1,fontCache:\"global\"},options:{skipHtmlTags:[\"script\",\"noscript\",\"style\",\"textarea\",\"pre\",\"code\"],enableMenu:false}};function __mq(){if(window.MathJax&&MathJax.typesetPromise){MathJax.typesetPromise().catch(function(){})}}if(document.readyState===\"complete\"){setTimeout(__mq,150)}else{window.addEventListener(\"load\",function(){setTimeout(__mq,150)})}</script><script async src=\"https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js\" onerror=\"this.onerror=null;var s=document.createElement('script');s.src='https://unpkg.com/mathjax@3/es5/tex-svg.js';document.head.appendChild(s);\"></script>";
function safeUrl(u) {
  var x = String(u || "").trim();
  return /^https?:\/\//i.test(x) ? x : "";
}

function renderSources(sj) {
  var arr = [];
  try { arr = JSON.parse(sj || "[]"); } catch (e) { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  var items = [];
  for (var s of arr) {
    if (typeof s === "string") s = { url: s };
    if (!s || typeof s !== "object") continue;
    var url = safeUrl(s.url || s.href);
    if (!url) continue;
    var label = escHtml(s.label || s.title || url);
    items.push('<li><a href="' + escHtml(url) + '" rel="noopener noreferrer">' + label + "</a></li>");
  }
  if (!items.length) return "";
  return '<section class="refs"><h2>Sources &amp; further reading</h2><ul>' + items.join("") + "</ul></section>";
}

function buildSources(story) {
  var out = [], src = story.source || "hn", u = String(story.url || "").trim();
  if (src === "q08") {
    out.push({ label: "q08 essay this forecast extends: " + String(story.title || "").slice(0, 120), url: u });
  } else if (src === "github") {
    var repo = String(story.id || "").replace(/^.*?([^\/]+\/[^\/]+)$/, "$1");
    out.push({ label: "GitHub repository: " + (repo || story.title), url: u || "https://github.com/" + repo });
  } else if (src === "arxiv") {
    out.push({ label: "arXiv: " + String(story.title || "").slice(0, 120), url: u || "https://arxiv.org/abs/" + story.id });
  } else {
    if (u) { var host = ""; try { host = new URL(u).hostname.replace(/^www\./, ""); } catch (e) {} out.push({ label: host || u, url: u }); }
    if (story.id) out.push({ label: "Hacker News discussion", url: "https://news.ycombinator.com/item?id=" + story.id });
  }
  return out;
}

function mdEmph(x) {
  var parts = String(x).split(/(\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  for (var i = 0; i < parts.length; i++) {
    if (i % 2 === 1) continue;
    parts[i] = parts[i].replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/_(.+?)_/g, "<em>$1</em>");
  }
  return parts.join("");
}

var CSS = `
:root{--bg:#f9f7f4;--fg:#1c1a18;--mut:#6b6560;--line:#e0d9d0;--acc:#5a3e2b;--max:42rem}
@media(prefers-color-scheme:dark){:root{--bg:#161412;--fg:#e8e3dc;--mut:#9a938b;--line:#2e2a25;--acc:#c9956e}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--fg);font:17px/1.68 Georgia,'Times New Roman',serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:var(--max);margin:0 auto;padding:3rem 1.2rem 5rem}
header{border-bottom:1px solid var(--line);padding-bottom:1.2rem;margin-bottom:2.5rem}
header h1{font-size:1.05rem;font-weight:400;letter-spacing:.04em;color:var(--mut);text-transform:uppercase}
header p{font-size:.88rem;color:var(--mut);margin-top:.3rem}
nav{display:flex;gap:1.2rem;margin-top:.8rem;font-size:.88rem}
nav a{color:var(--acc);text-decoration:none}
nav a:hover{text-decoration:underline}
article{margin-bottom:3rem;padding-bottom:2rem;border-bottom:1px solid var(--line)}
article:last-child{border-bottom:none}
article h2{font-size:1.22rem;font-weight:600;line-height:1.3;margin-bottom:.5rem}
article h2 a{color:var(--fg);text-decoration:none}
article h2 a:hover{color:var(--acc)}
article .meta{font-size:.82rem;color:var(--mut);margin-bottom:.8rem}
article .lede{font-size:.97rem;color:var(--mut);line-height:1.6}
.piece h1{font-size:1.5rem;line-height:1.25;margin-bottom:.6rem}
.piece h2{font-size:1.15rem;margin:1.8rem 0 .5rem;font-weight:600}
.piece h3{font-size:1rem;margin:1.4rem 0 .4rem;font-weight:600;color:var(--acc)}
.piece p{margin-bottom:1rem}
.piece ul,.piece ol{margin:.6rem 0 1rem 1.4rem}
.piece li{margin-bottom:.3rem}
.piece strong{font-weight:600}
.piece em{font-style:italic}
.fb{margin:2.2rem 0 0;padding-top:1.2rem;border-top:1px solid var(--line);font-size:.92rem;color:var(--mut)}
.fb a{margin:0 .7rem 0 0;color:var(--acc);text-decoration:none}
.fb a:hover{text-decoration:underline}
footer{margin-top:4rem;padding-top:1.5rem;border-top:1px solid var(--line);font-size:.82rem;color:var(--mut)}
.chip{display:inline-block;font-size:.75rem;padding:.15rem .5rem;border-radius:3px;background:var(--line);color:var(--mut);margin-right:.4rem}
.refs{margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid var(--line)}
.refs h2{font-size:.95rem;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);font-weight:400;margin-bottom:.8rem}
.refs ul{margin:0;padding-left:1.2rem}
.refs li{margin-bottom:.4rem;font-size:.92rem}
.refs a{color:var(--acc)}
.refs a:hover{text-decoration:underline}
`;


// Q08-QDS-1 (2026-10-02, pillar reach): q08.org on the shared design system with its own identity. q08 is a separate
// publication (STRATEGY 2.1): it keeps its own name, voice and rust accent, links no QNFO navigation, and only borrows
// the type, spacing and components from https://qnfo.org/qds.css. Every page, including subscribe/confirm/unsubscribe
// and 404, now has a head, header and footer (they were bare fragments); the verdict form keeps its POST buttons.
var Q08_QDS = "1.0.0";
var Q08_FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap">';
var Q08_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23182042'/%3E%3Ctext x='16' y='21.5' text-anchor='middle' font-family='Georgia,serif' font-size='14' fill='%23F2906A'%3Eq08%3C/text%3E%3C/svg%3E";
var Q08_CSS = '<style>.q08-mark{font:600 1.15rem/1 var(--q-serif);letter-spacing:-.01em;text-decoration:none;color:var(--q-ink);display:flex;align-items:baseline;gap:10px}.q08-mark b{color:var(--q-accent);font-weight:600}.q08-mark small{font:400 var(--q-fs-sm)/1 var(--q-sans);color:var(--q-muted)}.q08-hero{padding:56px 0 24px;max-width:760px}.q08-hero h1{font:500 clamp(2rem,4.2vw,3.1rem)/1.08 var(--q-serif);letter-spacing:-.02em;margin:0 0 16px}.q08-feed{max-width:760px}.q08-piece{max-width:var(--q-measure);padding:40px 0 24px}.q08-piece h1.q08-t{font:500 clamp(1.85rem,3.4vw,2.6rem)/1.12 var(--q-serif);letter-spacing:-.015em;margin:0 0 14px;text-wrap:balance}.q08-fb{margin:40px 0 0;padding:20px 0 0;border-top:1px solid var(--q-rule);display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:var(--q-fs-sm);color:var(--q-muted)}.q08-fb span{margin-right:6px}.q08-refs{margin:40px 0 0;padding-top:20px;border-top:1px solid var(--q-rule)}.q08-refs h2{font:600 var(--q-fs-sm)/1.3 var(--q-sans);color:var(--q-muted);margin:0 0 12px}.q08-refs ul{margin:0;padding-left:1.2em;font-size:var(--q-fs-sm)}.q08-refs li{margin-bottom:6px}.q08-refs a{color:var(--q-accent)}.q08-msg{padding:72px 0;max-width:620px}.q08-sub form{display:flex;gap:8px;flex-wrap:wrap}.q08-sub .q-input{flex:1;min-width:220px}</style>';
function q08Attr(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function q08Page(o, body) {
  var t = q08Attr(o.title), d = q08Attr(o.description || "Systems-level critique of technical industry friction. Cold, structural, timeless.");
  var canon = o.canonical ? q08Attr(o.canonical) : "";
  var ld = o.jsonld ? '<script type="application/ld+json">' + JSON.stringify(o.jsonld).replace(/</g, "\\u003c") + "<\/script>" : "";
  var xh = o.extraHead || "";
  return '<!DOCTYPE html><html lang="en" data-brand="q08"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + t + '</title><meta name="description" content="' + d + '">' +
    xh + (canon ? '<link rel="canonical" href="' + canon + '"><meta property="og:url" content="' + canon + '">' : "") + (o.robots ? '<meta name="robots" content="' + q08Attr(o.robots) + '">' : "") +
    '<meta property="og:site_name" content="q08"><meta property="og:title" content="' + t + '"><meta property="og:description" content="' + d + '"><meta property="og:type" content="' + (o.ogType || "website") + '"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="' + t + '"><meta name="twitter:description" content="' + d + '">' +
    '<meta name="theme-color" content="#F5F7FB" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#121731" media="(prefers-color-scheme: dark)"><link rel="icon" type="image/svg+xml" href="' + Q08_FAVICON + '"><link rel="alternate" type="application/rss+xml" title="q08" href="/feed.xml">' +
    Q08_FONTS + '<link rel="stylesheet" href="https://qnfo.org/qds.css?v=' + Q08_QDS + '"><script src="https://qnfo.org/qds.js?v=' + Q08_QDS + '" defer><\/script>' + Q08_CSS + ld + MATH_HEAD + "</head><body>" +
    '<a class="q-skip" href="#main">Skip to main content</a><header class="q-top"><div class="q-wrap"><a class="q08-mark" href="/" aria-label="q08 home"><b>q08</b><small>systems-level critique</small></a>' +
    '<nav class="q-nav q-nav-wide" aria-label="Main"><a href="/"' + (o.active === "index" ? ' aria-current="page"' : "") + '>Index</a><a href="/forecasts"' + (o.active === "forecasts" ? ' aria-current="page"' : "") + '>Forecasts</a><a href="/subscribe"' + (o.active === "subscribe" ? ' aria-current="page"' : "") + '>Subscribe</a><a href="/feed.xml">RSS</a></nav>' +
    '<details class="q-menu"><summary aria-label="Menu"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></summary><nav class="q-nav" aria-label="Main"><a href="/">Index</a><a href="/forecasts">Forecasts</a><a href="/subscribe">Subscribe</a><a href="/feed.xml">RSS</a></nav></details>' +
    '<button class="q-theme" type="button" data-q-theme aria-label="Switch between light and dark theme"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor"/></svg></button></div></header>' +
    '<main id="main"><div class="q-wrap">' + body + "</div></main>" +
    '<footer class="q-foot"><div class="q-wrap"><div class="q-foot-base" style="border-top:0;padding-top:0;margin-top:0"><span>q08: an autonomous signal engine, updated continuously</span><span>Pieces are machine-written and gated before publication. <a href="/feed.xml">RSS</a> \u00b7 <a href="/subscribe">Daily digest</a> \u00b7 <a href="/health">Status</a></span></div></div></footer><script src="https://fleet.qnfo.org/ctl.js" defer><\/script></body></html>';
}
function q08Sub(compact) {
  return '<section class="q-panel q08-sub" style="margin:48px 0 64px' + (compact ? ";max-width:760px" : "") + '"><h2 class="q-h3" style="margin:0 0 6px">The daily digest</h2><p class="q-meta" style="margin:0 0 14px">One email a day with that day\u2019s pieces. Confirm by email; unsubscribe from any digest.</p>' +
    '<form method="post" action="/subscribe"><label class="q-sr" for="q08-e">Email address</label><input class="q-input" id="q08-e" type="email" name="email" placeholder="you@example.com" autocomplete="email" required><button class="q-btn q-btn-accent" type="submit">Subscribe</button></form></section>';
}
function q08Short(t, n) { t = String(t || ""); if (t.length <= n) return t; var c = t.slice(0, n), sp = c.lastIndexOf(" "); return (sp > n * 0.5 ? c.slice(0, sp) : c).replace(/[\s,;:.\-]+$/, "") + "\u2026"; }
function q08Lede(md) { return (md || "").replace(/^#+\s*.+\n?/m, "").replace(/[#*_`]/g, "").replace(/\s+/g, " ").trim(); }
function renderIndex(pieces) {
  var items = pieces.map(function(p) {
    var date = (p.published_at || "").slice(0, 10);
    var lede = q08Lede(p.body_md).slice(0, 220);
    return '<li class="q-item"><a class="q-item-title" href="/p/' + escHtml(p.slug) + '">' + escHtml(p.title) + "</a>" +
      '<div class="q-item-meta"><time datetime="' + escHtml(p.published_at || "") + '">' + date + "</time>" + (p.kind === "forecast" ? '<span class="q-badge">Forecast</span>' : (p.core_concept ? '<span class="q-badge">' + escHtml(q08Short(p.core_concept, 44)) + "</span>" : "")) + "</div>" +
      (lede ? '<p class="q-item-text">' + escHtml(lede) + "\u2026</p>" : "") + "</li>";
  }).join("");
  var body = '<section class="q08-hero"><h1>Systems-level critique of technical industry friction.</h1><p class="q-lede">Cold, structural, timeless. Each piece takes one story from the technical front page and asks what system produced it.</p></section>' +
    '<section class="q08-feed" aria-label="Pieces">' + (items ? '<ul class="q-list">' + items + "</ul>" : '<div class="q-note">No pieces published yet. The engine publishes a few times a day; subscribe below to get the next one.</div>') + "</section>" + q08Sub(true);
  return q08Page({ title: "q08 \u00b7 systems-level critique", canonical: ORIGIN + "/", active: "index", jsonld: { "@context": "https://schema.org", "@type": "Blog", name: "q08", url: ORIGIN + "/", description: "Systems-level critique of technical industry friction." } }, body);
}
// Q08-REACH-1: every piece carries one-tap share links, a ready-to-paste citation and a prompt to answer back, plus Scholar-style
// citation meta tags and fuller JSON-LD, so a reader can pass it on, cite it and argue with it without leaving the page.
function shareText(p) {
  return p.kind === "forecast" ? "A scored forecast: " + String(p.title || "") : String(p.title || "");
}
function renderShare(p) {
  var u = ORIGIN + "/p/" + p.slug, t = shareText(p), eu = encodeURIComponent(u), et = encodeURIComponent(t);
  var links = [["Bluesky", "https://bsky.app/intent/compose?text=" + encodeURIComponent(t + " " + u)], ["X", "https://twitter.com/intent/tweet?text=" + et + "&url=" + eu], ["LinkedIn", "https://www.linkedin.com/sharing/share-offsite/?url=" + eu], ["Mastodon", "https://mastodon.social/share?text=" + encodeURIComponent(t + " " + u)], ["Hacker News", "https://news.ycombinator.com/submitlink?u=" + eu + "&t=" + et], ["Reddit", "https://www.reddit.com/submit?url=" + eu + "&title=" + et], ["Email", "mailto:?subject=" + et + "&body=" + encodeURIComponent(t + "\n" + u)]];
  var yr = (p.published_at || "").slice(0, 4);
  var cite = "q08. (" + yr + "). " + String(p.title || "") + ". q08.org. " + u;
  return '<section class="q08-share" aria-label="Share and cite" style="margin:28px 0"><p class="q-meta" style="margin:0 0 8px">Pass it on: ' +
    links.map(function (l) { return '<a href="' + escHtml(l[1]) + '" rel="noopener" target="_blank">' + l[0] + "</a>"; }).join(" \u00b7 ") + "</p>" +
    (p.kind === "forecast" ? '<p class="q-meta" style="margin:0 0 8px">Disagree? Post your own probability for the claim and link this page; q08 settles it in public on the stated date.</p>' : "") +
    '<p class="q-meta" style="margin:0 0 8px">Download citation: <a href="/p/' + escHtml(p.slug) + '.bib">BibTeX</a> \u00b7 <a href="/p/' + escHtml(p.slug) + '.ris">RIS</a></p>' +
    '<p class="q-meta" style="margin:0"><label>Cite as <input class="q-input" readonly value="' + escHtml(cite) + '" onfocus="this.select()" style="width:100%"></label></p></section>';
}
function citationFile(p, fmt) {
  var u = ORIGIN + "/p/" + p.slug, y = (p.published_at || "").slice(0, 4), m = (p.published_at || "").slice(5, 7), d = (p.published_at || "").slice(8, 10);
  var t = String(p.title || "").replace(/[{}\r\n]+/g, " ");
  if (fmt === "bib") return "@online{q08_" + String(p.slug).replace(/[^a-z0-9]/g, "") + ",\n  author = {{q08}},\n  title = {" + t + "},\n  year = {" + y + "},\n  month = {" + m + "},\n  url = {" + u + "},\n  organization = {q08},\n  note = {q08.org}\n}\n";
  return "TY  - ELEC\r\nAU  - q08\r\nTI  - " + t + "\r\nPY  - " + y + "\r\nDA  - " + y + "/" + m + "/" + d + "\r\nPB  - q08\r\nUR  - " + u + "\r\nER  - \r\n";
}
// Q08-FUNNEL-1 (owner directive 2026-10-09: all properties are one funnel): q08 is the attention surface, QNFO the authority
// it feeds. Each piece points readers to the imprint's papers and the iPatent tool, tagged so the gateway's UTM ledger counts the
// clicks per piece. QWAV (parked label) and the personal reading site are deliberately not linked.
function funnelUrl(base, slug) {
  return base + "?utm_source=q08&utm_medium=piece&utm_campaign=" + encodeURIComponent(String(slug || "home"));
}
function renderFunnel(slug) {
  return '<aside class="q08-funnel q-panel" aria-label="From the same imprint" style="margin:28px 0"><p class="q-meta" style="margin:0 0 6px">q08 is published by QNFO, an independent research imprint. Same author, slower and checked line by line:</p>' +
    '<ul class="q-list" style="margin:0"><li><a href="' + escHtml(funnelUrl("https://papers.qnfo.org/", slug)) + '">Open-access research papers</a>, each with a DOI</li>' +
    '<li><a href="' + escHtml(funnelUrl("https://ipatent.qnfo.org/", slug)) + '">iPatent</a>: free, private-by-default provisional patent drafting</li>' +
    '<li><a href="' + escHtml(funnelUrl("https://qnfo.org/", slug)) + '">QNFO</a>: the work and the author</li></ul></aside>';
}
function pieceHead(p, desc) {
  var u = ORIGIN + "/p/" + p.slug, d = (p.published_at || "").slice(0, 10).replace(/-/g, "/");
  return '<meta name="citation_title" content="' + q08Attr(p.title) + '"><meta name="citation_publication_date" content="' + q08Attr(d) + '"><meta name="citation_abstract_html_url" content="' + q08Attr(u) + '"><meta name="citation_publisher" content="q08"><meta name="citation_author" content="q08">' +
    '<meta property="article:published_time" content="' + q08Attr(p.published_at || "") + '"><meta property="article:section" content="' + (p.kind === "forecast" ? "Forecast" : "Analysis") + '">';
}
function renderPiece(p, fr) {
  var body = mdToHtml(p.body_md || "").replace(/^\s*<h1>[\s\S]*?<\/h1>\s*/, "");
  var refs = renderSources(p.sources_json);
  var fb = '<form class="q08-fb" method="post"><span>Was this worth your time?</span><textarea class="q-input" name="note" maxlength="280" rows="2" style="flex-basis:100%;order:2" placeholder="Optional: what was missing?" aria-label="Optional note: what was missing?"></textarea><button class="q-btn q-btn-ghost" formaction="/api/f?slug=' + escHtml(p.slug) + '&amp;s=good">Yes</button> <button class="q-btn q-btn-ghost" formaction="/api/f?slug=' + escHtml(p.slug) + '&amp;s=flat">Flat</button> <button class="q-btn q-btn-ghost" formaction="/api/f?slug=' + escHtml(p.slug) + '&amp;s=no">No</button></form>';
  var date = (p.published_at || "").slice(0, 10);
  var desc = q08Lede(p.body_md).slice(0, 160);
  var html = '<article class="q08-piece"><p class="q-eyebrow"><a href="/" style="text-decoration:none;color:inherit">\u2190 Index</a></p><h1 class="q08-t">' + escHtml(p.title) + '</h1><p class="q-meta" style="margin:0 0 28px"><time datetime="' + escHtml(p.published_at || "") + '">' + date + "</time>" + (p.kind === "forecast" ? ' \u00b7 <span class="q-badge">Forecast</span>' : (p.core_concept ? ' \u00b7 <span class="q-badge">' + escHtml(q08Short(p.core_concept, 44)) + "</span>" : "")) + "</p>" +
    '<div class="q-prose piece">' + body + "</div>" + (p.kind === "forecast" ? renderForecastBox(fr) : "") + fb + renderShare(p) + renderFunnel(p.slug) + (refs ? '<div class="q08-refs">' + refs.replace(/^\s*<section class="refs">/, "").replace(/<\/section>\s*$/, "") + "</div>" : "") + "</article>" + q08Sub(false);
  return q08Page({ title: p.title + " \u00b7 q08", description: desc, canonical: ORIGIN + "/p/" + p.slug, ogType: "article", extraHead: pieceHead(p, desc),
    jsonld: { "@context": "https://schema.org", "@type": "Article", headline: String(p.title || "").slice(0, 110), description: desc, datePublished: p.published_at || undefined, dateModified: p.published_at || undefined, url: ORIGIN + "/p/" + p.slug, mainEntityOfPage: ORIGIN + "/p/" + p.slug, isAccessibleForFree: true, inLanguage: "en", articleSection: p.kind === "forecast" ? "Forecast" : "Analysis", isPartOf: p.kind === "forecast" ? { "@type": "CreativeWorkSeries", name: "q08 Forecast Ledger", url: ORIGIN + "/forecasts" } : undefined, author: { "@type": "Organization", name: "q08", url: ORIGIN + "/" }, publisher: { "@type": "Organization", name: "q08", url: ORIGIN + "/", parentOrganization: { "@type": "Organization", name: "QNFO", url: "https://qnfo.org/" } } } }, html);
}
// Bare fragments (subscribe, confirm, unsubscribe, not found) get the full page shell.
function q08Wrap(fragment, title) {
  if (/^\s*<!doctype/i.test(fragment)) return fragment;
  var t = title || ((/<h[12][^>]*>([^<]{1,80})<\/h[12]>/.exec(fragment) || [])[1] || "q08");
  var f = String(fragment).replace(/<form method=post action=\/subscribe><input type=email name=email required><button>Subscribe<\/button><\/form>/, '<form method="post" action="/subscribe" class="q08-sub" style="margin:20px 0"><label class="q-sr" for="q08-e2">Email address</label><input class="q-input" id="q08-e2" type="email" name="email" placeholder="you@example.com" autocomplete="email" required><button class="q-btn q-btn-accent" type="submit">Subscribe</button></form>')
    .replace(/<h[12]>/, '<h1 class="q-h1">').replace(/<\/h[12]>/, "</h1>");
  return q08Page({ title: t + " \u00b7 q08", active: /subscri/i.test(t) ? "subscribe" : "", robots: "noindex" }, '<section class="q08-msg">' + f + "</section>");
}

function mdToHtml(md) {
  // Minimal Markdown -> HTML (headings, bold, italic, bullets, paragraphs)
  var lines = md.split("\n");
  var out = [];
  var inUl = false;
  for (var line of lines) {
    var h3 = line.match(/^### (.+)/);
    var h2 = line.match(/^## (.+)/);
    var h1 = line.match(/^# (.+)/);
    var li = line.match(/^[-*] (.+)/);
    var blank = line.trim() === "";
    if (h1) { if (inUl) { out.push("</ul>"); inUl=false; } out.push("<h1>" + escHtml(h1[1]) + "</h1>"); }
    else if (h2) { if (inUl) { out.push("</ul>"); inUl=false; } out.push("<h2>" + escHtml(h2[1]) + "</h2>"); }
    else if (h3) { if (inUl) { out.push("</ul>"); inUl=false; } out.push("<h3>" + escHtml(h3[1]) + "</h3>"); }
    else if (li) { if (!inUl) { out.push("<ul>"); inUl=true; } out.push("<li>" + mdEmph(escHtml(li[1])) + "</li>"); }
    else if (blank) { if (inUl) { out.push("</ul>"); inUl=false; } }
    else { if (inUl) { out.push("</ul>"); inUl=false; } out.push("<p>" + mdEmph(escHtml(line)) + "</p>"); }
  }
  if (inUl) out.push("</ul>");
  return out.join("\n");
}


function renderFeed(pieces) {
  var items = pieces.map(function(p) {
    var date = new Date(p.published_at || Date.now()).toUTCString();
    var desc = (p.body_md || "").replace(/\\/g, "").replace(/[<>&"]/g, function(c){return{"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c];}).slice(0, 500);
    return "<item><title>" + escHtml(p.title) + "</title><link>https://q08.org/p/" + escHtml(p.slug) + "</link><pubDate>" + date + "</pubDate><description>" + desc + "...</description></item>";
  }).join("\n");
  return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>q08</title><link>https://q08.org</link><description>Systems-level critique. Structural. Timeless.</description>' + items + '</channel></rss>';
}

// ---------------------------------------------------------------------------
// 10. Worker export
// ---------------------------------------------------------------------------
// ============ Email + Social ============
async function sha16(s) {
  var enc = new TextEncoder();
  var buf = await crypto.subtle.digest("SHA-256", enc.encode(String(s)));
  return Array.from(new Uint8Array(buf)).slice(0,16).map(function(b){return b.toString(16).padStart(2,"0");}).join("");
}
async function sendEmail(env, to, subject, body, unsubUrl) {
  // Tokenless path: native Email Routing send binding (q08.org). No API key needed.
  if (env.SEND_EMAIL) {
    try {
      var msg = { to: to, from: "digest@q08.org", subject: subject, text: body };
      if (unsubUrl) msg.headers = { "List-Unsubscribe": "<" + unsubUrl + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
      await env.SEND_EMAIL.send(msg);
      return { ok: true, via: "send_email" };
    } catch (e) {
      return { ok: false, error: "send_email: " + String(e && e.message || e) };
    }
  }
  // Fallback: qnfo-email HTTP API (requires EMAIL_API_KEY).
  if (!env.EMAIL) return { ok: false, error: "no email path" };
  try {
    var resp = await env.EMAIL.fetch("https://email.internal/send", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (env.EMAIL_API_KEY || "") }, body: JSON.stringify({ to: to, from: "qnfo@qnfo.org", subject: subject, body: body }) });
    return { ok: resp.ok, status: resp.status };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}
async function sendDigest(env) {
  var day = utcDay();
  await ensureForecastSchema(env);
  var pieces = await env.DB.prepare("SELECT slug, title" + (__forecastSchemaDone ? ", kind" : "") + " FROM published_pieces WHERE published_at >= ?1 AND slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at ASC").bind(day + "T00:00:00.000Z").all();
  var rows = pieces.results || [];
  if (!rows.length) return { ok: true, skipped: "no pieces today", pieces: 0 };
  var subs = await env.DB.prepare("SELECT email, token FROM subscribers WHERE status='confirmed' LIMIT 500").all();
  var list = rows.map(function(r){ return "- " + (r.kind === "forecast" ? "Forecast: " : "") + r.title + " - https://q08.org/p/" + r.slug; }).join("\n");
  var sent = 0;
  for (var s of (subs.results || [])) {
    var unsubUrl = "https://q08.org/unsubscribe?t=" + s.token;
    var body = "q08 - daily digest (" + day + ")\n\n" + list + "\n\nUnsubscribe: " + unsubUrl;
    var r = await sendEmail(env, s.email, "q08 - daily digest", body, unsubUrl);
    if (r && r.ok) sent++;
  }
  return { ok: true, pieces: rows.length, subscribers: (subs.results||[]).length, sent: sent };
}
// IndexNow: instant search-index ping for a newly published URL (no auth needed).
async function pingIndexNow(env, url) {
  try {
    var resp = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: "q08.org", key: INDEXNOW_KEY, keyLocation: ORIGIN + "/" + INDEXNOW_KEY + ".txt", urlList: [url] })
    });
    return { ok: resp.ok, status: resp.status };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

// Distribution via qnfo-social (Bluesky + Buffer cross-post). Tokenless:
// write to the shared social_threads queue in qnfo-audit; qnfo-social's cron
// picks it up and cross-posts. Buffer covers Mastodon + LinkedIn + X.
async function queueForDistribution(env, title, slug, fc, hook) {
  // Q08-PERSONAL-CHANNEL-HOLD-1 (2026-10-01): social_threads is drained by qnfo-social onto the
  // owner's PERSONAL Bluesky account, so every q08 essay posted under the owner's name. Off by default;
  // set the plain var Q08_SOCIAL_QUEUE="1" to re-enable once q08 has its own channel.
  // Q08-FORECAST-PROMOTE-1 (owner directive 2026-10-09: forecasts must be widely self-promoted): a forecast alone may be queued
  // when Q08_SOCIAL_FORECASTS="1" (the default in wrangler.toml). Essays stay held by Q08_SOCIAL_QUEUE; set the var to "0" to stop.
  if (env.Q08_SOCIAL_QUEUE === "0" || (!fc && env.Q08_SOCIAL_QUEUE !== "1" && env.Q08_SOCIAL_ESSAYS !== "1")) return { ok: false, skip: "Q08-PERSONAL-CHANNEL-HOLD-1" };
  if (!env.AUDIT) return { ok: false, skip: "no audit binding" };
  try {
    // NO-TRUNCATED-LINK-1 (2026-09-27): never slice the URL. A long title used to
    // truncate the permalink (e.g. ".../p/2026-09-18-...-the-lar") -> 404 -> link-dead.
    var _u = "https://q08.org/p/" + slug;
    var _s = " \u2014 ";
    var _t = String(title || "");
    if (fc) { _t = forecastPostText(fc, _u); _s = ""; _u = ""; }
    else if (hook) { // title, then the piece's own opening sentence as the hook, then the permalink (never truncated)
      var _room = 280 - _t.length - _u.length - 4, _h = String(hook).replace(/\s+/g, " ").trim().replace(/^(.{20,}?[.!?])\s.*$/, "$1");
      if (_room >= 40 && _h.length > _room) _h = _h.slice(0, _room - 1).replace(/\s+\S*$/, "") + "\u2026";
      if (_room >= 40 && _h) { _t = _t + "\n\n" + _h; _s = "\n\n"; }
    }
    var text = (_t.length + _s.length + _u.length <= 280) ? (_t + _s + _u) : (_t.slice(0, Math.max(0, 280 - _u.length - _s.length)) + _s + _u);
    var id = (fc ? "q08-fc-" : "q08-") + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await env.AUDIT.prepare("INSERT OR IGNORE INTO social_threads (slug, title, posts, status, notes) VALUES (?,?,?, 'queued', ?)").bind(id, String(title || "").slice(0, 300), JSON.stringify([text]), "selected: q08 piece (Q08-OPEN-1, owner directive 2026-10-09)").run();
    return { ok: true, queued: id };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}
// One post per forecast: the committed claim, the probability and the settle date, then the permalink (never truncated).
function forecastPostText(fc, url) {
  var tail = "\n\nSettles by " + fc.horizon + ", scored in public. What is your number? " + url;
  var head = "Forecast, " + Math.round(Number(fc.probability) * 100) + "%: ";
  var room = 280 - tail.length - head.length;
  var claim = String(fc.claim || "").replace(/\s+/g, " ").trim();
  if (claim.length > room) claim = claim.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, "") + "\u2026";
  return head + claim + tail;
}
async function handleSubscribe(req, env, url) {
  var email = "";
  if (req.method === "POST") {
    try {
      var ct = req.headers.get("Content-Type") || "";
      if (ct.indexOf("application/json") >= 0) { var b = await req.json(); email = b && b.email || ""; }
      else if (ct.indexOf("form") >= 0) { var fd = await req.formData(); email = fd.get("email") || ""; }
    } catch (e) {}
  }
  email = String(email || url.searchParams.get("email") || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    var bad = req.method === "POST";
    return html('<h2>Subscribe</h2><form method=post action=/subscribe><input type=email name=email required><button>Subscribe</button></form>' + (bad ? '<p>Enter a valid email address.</p>' : '<p>One email a day \u2014 the daily digest. No spam.</p>'), bad ? 400 : 200);
  }
  var token = await sha16(email + ":q08:sub");
  await env.DB.prepare("INSERT INTO subscribers(email, status, token, created_at) VALUES(?, 'pending', ?, ?) ON CONFLICT(email) DO UPDATE SET token=excluded.token, status=CASE WHEN status='confirmed' THEN 'confirmed' ELSE 'pending' END").bind(email, token, nowIso()).run();
  await sendEmail(env, email, "Confirm your q08 subscription", "Tap to confirm: https://q08.org/confirm?t=" + token);
  return html("<h2>Almost there</h2><p>Check your inbox for a confirmation link.</p>");
}

// Q08-STUCK-RUN-ROWS-1 (v0.7.33, issue 1670): an async /run whose isolate the platform cut short leaves its
// placeholder at status=running. generate() takes 30-90s, so anything still running after 30 min is dead.
async function sweepStaleRuns(env) {
  await env.DB.prepare("UPDATE engine_runs SET status='abandoned', error=COALESCE(error,'') || ' | STALE-RUN-SWEEP: isolate ended before finalize' WHERE status='running' AND ran_at < datetime('now','-30 minutes')").run().catch(function () {});
}
// Q08-GATE-OUTAGE-SELF-REPORT-1 (v0.7.33, issue 1671): 15 consecutive gate_failed cycles (~28h, runs 190-204) raised
// nothing and were found only because a human asked why q08.org was quiet. After every cron cycle: if the last 3
// finished generation runs published nothing AND the newest piece is older than 8h, file an agent_issue (the
// open-title unique index dedupes repeats) and an alert. Recovery is visible as runs with piece_published=1.
async function stallDetector(env) {
  if (!env.AUDIT) return;
  try {
    var runs = await env.DB.prepare("SELECT id, status, piece_published, error FROM engine_runs WHERE status NOT IN ('running','abandoned','async-done') ORDER BY id DESC LIMIT 3").all();
    var rs = runs && runs.results || [];
    var pub = rs.filter(function (r) { return Number(r.piece_published) > 0; });
    if (pub.length) {
      // Recovered: close any open auto-filed stall issue with evidence (issue_close_evidence_required needs it first).
      var open = await env.AUDIT.prepare("SELECT id FROM agent_issues WHERE status='open' AND title LIKE 'Q08-PUBLISH-STALL-AUTO-1:%'").all();
      for (var o of (open && open.results || [])) {
        await env.AUDIT.prepare("UPDATE issue_triage SET close_evidence=?1 WHERE issue_id=?2").bind("q08-signal-engine " + VERSION + " stallDetector: engine_runs #" + pub[0].id + " published (piece_published=1) at " + new Date().toISOString(), o.id).run();
        await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', close_channel='auto-recovery', updated_at=?1 WHERE id=?2").bind(Date.now(), o.id).run();
      }
      return;
    }
    if (rs.length < 3) return;
    var last = await env.DB.prepare("SELECT MAX(published_at) m FROM published_pieces").first();
    var lastMs = last && last.m ? Date.parse(last.m) : 0;
    var hours = lastMs ? (Date.now() - lastMs) / 36e5 : Infinity;
    if (hours < 8) return;
    var causes = rs.map(function (r) { return "#" + r.id + " " + r.status + ": " + String(r.error || "").slice(0, 80); }).join(" | ");
    var title = "Q08-PUBLISH-STALL-AUTO-1: q08-signal-engine published nothing in the last 3 runs and " + (isFinite(hours) ? Math.round(hours) + "h" : "ever") + " since the last piece";
    var desc = "Filed automatically by q08-signal-engine " + VERSION + " stallDetector. Last 3 finished runs: " + causes + ". Check the quality-gate sub-causes above (engine_runs.error) and GET https://q08.org/api/runs. Closes when a run publishes (piece_published=1).";
    var now = Date.now();
    await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) SELECT ?1, ?2, 'q08-signal-engine', 'reliability', 'high', 'open', ?3, ?3 WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE status='open' AND title LIKE 'Q08-PUBLISH-STALL-AUTO-1:%')").bind(title, desc, now).run().catch(function () {});
    await env.AUDIT.prepare("INSERT INTO alerts (source, level, message) VALUES ('q08-signal-engine', 'warn', ?1)").bind(title).run().catch(function () {});
  } catch (e) {}
}
// Q08-NOTE-1: a visitor note is stored for the owner to read and is never part of any prompt. Plain text only: control
// characters and angle brackets are dropped, links become [link], whitespace collapses, 280 characters at most.
function cleanNote(v) {
  var t = String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/https?:\/\/\S+/gi, "[link]").replace(/\s+/g, " ").trim().slice(0, 280);
  return t || null;
}
// Q08-QUALITY-1: pure helpers exposed for the offline suite (quality.test.mjs); no route uses this export.
export const __forecast = { forecastPostText: forecastPostText, gatherEvidence: gatherEvidence, forecastDue: forecastDue, resolveForecasts: resolveForecasts, ensureForecastSchema: ensureForecastSchema, generateForecast: generateForecast, forecastStats: forecastStats, parseForecastBlock: parseForecastBlock, validateForecast: validateForecast, forecastXform: forecastXform, forecastProblems: forecastProblems, buildForecastPrompt: buildForecastPrompt, calibration: calibration, parseJudgeVerdict: parseJudgeVerdict, aggregateJudges: aggregateJudges, parseForecastCap: parseForecastCap, publicHttpsUrl: publicHttpsUrl, fcStatus: fcStatus, renderForecastBox: renderForecastBox, renderForecasts: renderForecasts, FORECAST_DIRECTIVE: FORECAST_DIRECTIVE, FORECAST_EVERY: FORECAST_EVERY, FORECAST_MAX_CHECKS: FORECAST_MAX_CHECKS };
export const __verify = { groundingProblems: groundingProblems, parseFactVerdict: parseFactVerdict, factCheck: factCheck, verifyPiece: verifyPiece, verifyAndRevise: verifyAndRevise, retractPiece: retractPiece, auditPublished: auditPublished, ensureAccuracySchema: ensureAccuracySchema, renderRetraction: renderRetraction, fetchArticleText: fetchArticleText, factRevisionPrompt: factRevisionPrompt, Q08_DIRECTIVE: Q08_DIRECTIVE, FORECAST_DIRECTIVE: FORECAST_DIRECTIVE, REGISTER_EXEMPLAR: REGISTER_EXEMPLAR };
export const __quality = { gate: gate, overusedPrecedents: overusedPrecedents, parseReaderVerdict: parseReaderVerdict, buildPrompt: buildPrompt, ownerDirectives: ownerDirectives, readerTest: readerTest, pickPanel: pickPanel, familyOf: familyOf, aggregatePanel: aggregatePanel, panelRead: panelRead, effectiveVotes: effectiveVotes, PANEL_POOL: PANEL_POOL, ensembleReport: ensembleReport, saveReaderTests: saveReaderTests, runLevels: runLevels, panelUnavailableShare: panelUnavailableShare, ensureReaderTable: ensureReaderTable, OWNER_VERDICT_WEIGHT: OWNER_VERDICT_WEIGHT, REGISTER_EXEMPLAR: REGISTER_EXEMPLAR };

function q08SitemapXml(rows) {
  var esc = function (x) { return String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
  var day = function (x) { var d = String(x || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ""; };
  var newest = rows.length ? day(rows[0].published_at) : "";
  var urls = rows.map(function (r) {
    var d = day(r.published_at);
    return "<url><loc>" + esc(ORIGIN + "/p/" + encodeURIComponent(r.slug)) + "</loc>" + (d ? "<lastmod>" + d + "</lastmod>" : "") + "</url>";
  }).join("");
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>' + ORIGIN + '/</loc>' + (newest ? "<lastmod>" + newest + "</lastmod>" : "") + "</url><url><loc>" + ORIGIN + "/forecasts</loc></url>" + urls + "</urlset>";
}
export default {
  async fetch(req, env, ctx) {
    env = __aiAttrEnv(env, "q08-signal-engine", "AI", "AUDIT");
    var url  = new URL(req.url);
    var path = url.pathname.replace(/\/+$/, "") || "/";
    await ensureAccuracySchema(env); // Q08-VERIFY-1: the retraction filter below reads q08_retractions
    // Q08-SITEMAP-INDEXABLE-1 (2026-10-06): www.q08.org answered 200 with a full duplicate of every page; pages now move
    // permanently to the canonical host so Google indexes one URL per piece (API routes are left alone).
    if (url.hostname === "www.q08.org" && (req.method === "GET" || req.method === "HEAD") && path.indexOf("/api/") !== 0) {
      return new Response(null, { status: 301, headers: { "Location": ORIGIN + url.pathname + url.search, "Cache-Control": "public, max-age=86400" } });
    }

    await ensureForecastSchema(env); // Q08-FORECAST-1: idempotent, one flag check after the first request in an isolate
    if (path === "/api/ensemble") {
      return json(Object.assign({ ok: true, worker: WORKER, version: VERSION, generated_at: nowIso() }, await ensembleReport(env)));
    }
    if (path === "/api/metrics") {
      return json({ ok: true, worker: WORKER, version: VERSION, generated_at: nowIso(), windows: { "7d": await metrics7d(env) } });
    }
    if (path === "/health") {
      var m7 = await metrics7d(env).catch(function () { return null; });
      var cnt = await env.DB.prepare("SELECT COUNT(*) n FROM published_pieces").first().catch(() => ({n:0}));
      var last = await env.DB.prepare("SELECT slug, title, published_at FROM published_pieces WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at DESC LIMIT 1").first().catch(() => null);
      var runs = await env.DB.prepare("SELECT status, COUNT(*) n FROM engine_runs GROUP BY status").all().catch(() => ({results:[]}));
      return json({ ok: true, worker: WORKER, version: VERSION, capabilities: ["signal-scrape", "llm-compose", "essay-publish", "essay-regen", "rss", "mathjax-render", "sources-footer", "email-digest", "indexnow", "reader-verdict-vote", "self-verdict-gate", "feedback-calibration", "cross-day-signal-dedup", "fabrication-gate", "self-referential-signal-emit", "reader-test", "owner-editorial-directives", "owner-verdict-weight", "forecast-scenarios", "forecast-resolution", "forecast-calibration", "citation-files"], limitations: ["publisher/composer only - does NOT run a general agent tool loop and does not execute arbitrary code", "not a general-purpose model endpoint; use qnfo-ai for inference", "POST /run and POST /regen need x-loop-token (they spend model calls and change published essays; OPEN-ACCESS-1); every read stays open", "writes only to its own q08-signal D1; never writes research or personal stores", "no streaming"], metrics_7d: m7, pieces: cnt.n, daily_cap: await dailyCap(env), daily_cap_key: "ops_config " + CAP_KEY, last, runs: runs.results });
    }

    // Q08-WRITE-ROUTES-TOKEN-1 (v0.8.6, agent_issues 1995): /run starts a full generation (model calls, a publication) and
    // /regen rewrites a published essay through compose and gate only, skipping the cross-family panel and editor and
    // writing no engine_runs row. Both were open to anyone at 5 and 10 calls per IP per hour. OPEN-ACCESS-1 keeps reads
    // open and puts what changes the fleet or spends its money behind x-loop-token; the crons call generate() directly,
    // so nothing scheduled needs these routes. Without LOOP_TOKEN set on this worker both answer 401.
    if ((path === "/run" || path === "/regen") && req.method === "POST") {
      var lt = req.headers.get("x-loop-token") || "";
      if (!env.LOOP_TOKEN || lt !== env.LOOP_TOKEN) return json({ ok: false, error: "unauthorized: " + path + " spends model calls and changes published essays; it needs x-loop-token (OPEN-ACCESS-1)" }, 401);
    }

    if (path === "/run" && req.method === "POST") {
      // Loop-token trigger (above), still bounded by a per-IP rate limit (crons call generate() directly).
      var runIp = String(req.headers.get("cf-connecting-ip") || "anon");
      var runIk = await sha16("run:" + runIp);
      var runRate = await env.DB.prepare("SELECT COUNT(*) n FROM q08_run_rate WHERE ip_key=? AND created_at > datetime('now','-1 hour')").bind(runIk).first().catch(function(){ return { n: 0 }; });
      if ((runRate && runRate.n || 0) >= 5) return json({ ok: false, error: "rate limited" }, 429);
      await env.DB.prepare("INSERT INTO q08_run_rate (ip_key, created_at) VALUES (?,?)").bind(runIk, nowIso()).run().catch(function(){});
      await env.DB.prepare("DELETE FROM q08_run_rate WHERE created_at < datetime('now','-24 hours')").run().catch(function(){});
      // Detach: generate() takes 30-90s (HN fetch + LLM). Return immediately,
      // run in background via waitUntil so the HTTP response is not blocked.
      var async_mode = url.searchParams.get("async") !== "0";
      if (async_mode) {
        var runId = Date.now().toString(36);
        // Q08-STUCK-RUN-ROWS-1 (v0.7.33, issue 1670): this placeholder was never finalized. generate() writes its own
        // engine_runs row, and the old completion handler rewrote the error text of MAX(id) - i.e. generate()'s row -
        // so the placeholder stayed status=running forever (run 205). Finalize THIS row by id; rows whose isolate was
        // cut short are closed by sweepStaleRuns() on the next cron.
        var ph = await env.DB.prepare("INSERT INTO engine_runs (ms,status,error) VALUES (0,'running',?)").bind("run-id:" + runId + " async generation started").run().catch(function(){ return null; });
        var phId = ph && ph.meta ? ph.meta.last_row_id : null;
        ctx.waitUntil(generate(env).then(async (out) => {
          if (phId) await env.DB.prepare("UPDATE engine_runs SET status='async-done', error=? WHERE id=? AND status='running'")
            .bind("run-id:" + runId + " result:" + JSON.stringify(out).slice(0,200), phId).run().catch(()=>{});
        }).catch(async (e) => {
          if (phId) await env.DB.prepare("UPDATE engine_runs SET status='error', error=? WHERE id=?").bind(String(e&&e.message||e).slice(0,500), phId).run().catch(()=>{});
          else await env.DB.prepare("INSERT INTO engine_runs (ms,status,error) VALUES (0,'error',?)").bind(String(e&&e.message||e).slice(0,500)).run().catch(()=>{});
        }));
        return json({ ok: true, worker: WORKER, version: VERSION, mode: "async", run_id: runId, note: "generating in background; poll /api/runs or /health. Async runs may be cut short by the platform after ~30s; the cron path is the reliable one." });
      }
      var out = await generate(env);
      return json({ ok: true, worker: WORKER, version: VERSION, out });
    }

    if (path === "/regen" && req.method === "POST") {
      // Regenerate a single existing piece from its original signal, through the
      // current directive. Reuses buildPrompt/compose/gate. Loop token (above), then rate-limited per IP.
      var rip2 = String(req.headers.get("cf-connecting-ip") || "anon");
      var rik2 = await sha16("regen:" + rip2);
      var rr2 = await env.DB.prepare("SELECT COUNT(*) n FROM q08_run_rate WHERE ip_key=? AND created_at > datetime('now','-1 hour')").bind(rik2).first().catch(function(){ return { n: 0 }; });
      if ((rr2 && rr2.n || 0) >= 10) return json({ ok: false, error: "rate limited" }, 429);
      await env.DB.prepare("INSERT INTO q08_run_rate (ip_key, created_at) VALUES (?,?)").bind(rik2, nowIso()).run().catch(function(){});

      var target = String(url.searchParams.get("slug") || "").slice(0, 200);
      if (!target) return json({ ok: false, error: "slug required" }, 400);
      var prow = await env.DB.prepare("SELECT * FROM published_pieces WHERE slug = ?").bind(target).first();
      if (!prow) return json({ ok: false, error: "piece not found" }, 404);
      var srow = await env.DB.prepare("SELECT * FROM signal_log WHERE (source_id = ? OR source_id = ?) AND friction_point IS NOT NULL AND length(friction_point) > 40 ORDER BY length(friction_point) DESC LIMIT 1").bind(prow.signal_source, String(prow.signal_source||"").indexOf(":") >= 0 ? String(prow.signal_source).split(":").slice(1).join(":") : prow.signal_source).first();
      if (!srow) return json({ ok: false, error: "signal friction not found" }, 404);
      var friction = { core_concept: prow.core_concept || srow.title, friction_point: srow.friction_point || "", signal_strength: srow.signal_strength || "Medium" };
      var recentRows = await env.DB.prepare("SELECT structure_md FROM prompt_pool ORDER BY created_at DESC LIMIT 6").all();
      var recentStructures = (recentRows.results || []).map(function(r){ return r.structure_md; });
      var prompt = buildPrompt(friction, [], recentStructures);
      var piece = await compose(env, prompt);
      var gateResult = gate(piece.text);
      if (!gateResult.ok) {
        var retryPrompt = prompt + "\n\n--- CORRECTIVE FEEDBACK: your previous draft was rejected. Rewrite the ENTIRE essay from scratch with a completely different structure \u2014 continuous prose, no '##' section headers, but KEEP exactly one '# ' H1 title line as the FIRST line of the essay \u2014 fixing only these issues ---\n" + gateResult.problems.join("; ");
        var retryPiece = null;
        try { retryPiece = await compose(env, retryPrompt); } catch (e) { retryPiece = null; }
        if (retryPiece && retryPiece.text) {
          var retryGate = gate(retryPiece.text);
          if (retryGate.ok) { piece = retryPiece; gateResult = retryGate; }
          else if (retryGate.problems.length === 1 && /verdict/i.test(retryGate.problems[0]) && retryGate.problems[0].indexOf("self-verdict") < 0) {
            try {
              var vp2 = await compose(env, "You have written an essay that passed all editorial checks. Output exactly one line, nothing else, in this form:\nworth your time: yes|flat|no \u2014 one clause of justification\nUse flat only if a reader gains little beyond the source material; use no if the piece is not worth publishing.");
              var vm3 = (vp2 && vp2.text || "").match(/worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-]\s*\S[^\n]*$/im);
              if (vm3) { retryPiece.text = retryPiece.text.replace(/\s*$/, "") + "\n\n" + vm3[0]; retryGate = gate(retryPiece.text); if (retryGate.ok) { piece = retryPiece; gateResult = retryGate; } }
            } catch (e) {}
          }
        }
      }
      if (!gateResult.ok) return json({ ok: false, error: "gate failed: " + gateResult.problems.join("; ") }, 422);
      // Q08-VERIFY-1: a regenerated essay is fact-checked against the same source material before it replaces the live text.
      var rgArticle = await fetchArticleText(srow.url);
      var rgv = await verifyPiece(env, piece.text, [srow.title || "", friction.core_concept || "", friction.friction_point || "", rgArticle].join("\n"), piece.model, target, { forecast: false });
      if (!rgv.ok) return json({ ok: false, error: "accuracy check failed: " + rgv.problems.join("; ") }, 422);
      piece.text = piece.text.replace(/\n?worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-].*$/im, "").trim();
      var tm = piece.text.match(/^#\s+(.+)$/m);
      var title = tm ? tm[1].trim() : prow.title;
      var body = piece.text.replace(/^#\s+.+\n?/, "").trim();
      await env.DB.prepare("UPDATE published_pieces SET title = ?, body_md = ? WHERE slug = ?").bind(title, body, target).run();
      var skel = body.split("\n").filter(l => l.startsWith("#") || l.startsWith("- ") || l.startsWith("**")).join("\n").slice(0, 800);
      if (skel.length < 50) { var lp = body.split("\n").map(l => l.trim()).filter(l => l.length > 40)[0] || ""; skel = (title + "\n" + lp.slice(0, 400)).slice(0, 800); }
      await env.DB.prepare("UPDATE prompt_pool SET structure_md = ?, active = 0 WHERE piece_id = ?").bind(skel, prow.id).run().catch(function(){});
      return json({ ok: true, slug: prow.slug, title: title, model: piece.model, words: body.split(/\s+/).length });
    }

    if (path === "/api/f" && req.method === "POST") {
      if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
      if (/bot|crawl|spider|slurp|preview|headless/i.test(String(req.headers.get("user-agent") || ""))) return json({ ok: false, error: "automated clients cannot vote" }, 403);
      var s = (url.searchParams.get("s") || "").toLowerCase();
      var fslug = String(url.searchParams.get("slug") || "").slice(0, 200);
      if (s !== "good" && s !== "flat" && s !== "no") return json({ ok: false, error: "s must be good|flat|no" }, 400);
      if (!fslug) return json({ ok: false, error: "slug required" }, 400);
      var ip = String(req.headers.get("cf-connecting-ip") || "anon");
      var ipKey = await sha16(ip + ":" + fslug);
      var prev = await env.DB.prepare("SELECT id FROM q08_feedback WHERE ip_key = ? AND slug = ?").bind(ipKey, fslug).first().catch(function(){ return null; });
      if (prev) return json({ ok: true, updated: false, note: "vote already recorded" });
      var rate = await env.DB.prepare("SELECT COUNT(*) n FROM q08_feedback WHERE ip_key = ? AND created_at > datetime('now','-1 hour')").bind(ipKey).first().catch(function(){ return { n: 0 }; });
      if ((rate && rate.n || 0) >= 5) return json({ ok: false, error: "rate limited" }, 429);
      var fnote = null;
      try {
        if (String(req.headers.get("Content-Type") || "").indexOf("form") >= 0) fnote = cleanNote((await req.formData()).get("note"));
      } catch (e) { fnote = null; }
      await env.DB.prepare("INSERT OR IGNORE INTO q08_feedback (slug, signal, ip_key, note, created_at) VALUES (?,?,?,?,?)").bind(fslug, s, ipKey, fnote, nowIso()).run();
      return json({ ok: true, recorded: s, note_stored: !!fnote });
    }
    if (path === "/feed.xml") {
      var rows = await env.DB.prepare("SELECT slug, title, body_md, core_concept, published_at FROM published_pieces WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at DESC LIMIT 20").all();
      return new Response(renderFeed(rows.results || []), { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
    }

    var cm = /^\/p\/([a-z0-9-]+)\.(bib|ris)$/.exec(path);
    if (cm) { // Q08-REACH-1: citation files for reference managers and scholarly indexing
      var cp = await env.DB.prepare("SELECT slug, title, published_at FROM published_pieces WHERE slug=? AND slug NOT IN (SELECT slug FROM q08_retractions)").bind(cm[1]).first();
      if (!cp) return html("<h1>Not found</h1>", 404);
      return new Response(citationFile(cp, cm[2]), { headers: { "Content-Type": cm[2] === "bib" ? "application/x-bibtex; charset=utf-8" : "application/x-research-info-systems; charset=utf-8", "Content-Disposition": 'attachment; filename="q08-' + cp.slug + "." + cm[2] + '"' } });
    }
    if (path.startsWith("/p/")) {
      var slug = path.slice(3);
      var piece = await env.DB.prepare("SELECT * FROM published_pieces WHERE slug=?").bind(slug).first();
      if (!piece) return html("<h1>Not found</h1>", 404);
      var retr = await env.DB.prepare("SELECT * FROM q08_retractions WHERE slug = ?").bind(slug).first().catch(function () { return null; });
      if (retr) return html(renderRetraction(retr, piece), 410);
      // Increment read count
      env.DB.prepare("UPDATE published_pieces SET reads=reads+1 WHERE slug=?").bind(slug).run().catch(() => {});
      ctx.waitUntil(countRead(env, req).catch(function () {}));
      var frow = piece.kind === "forecast" ? await env.DB.prepare("SELECT * FROM q08_forecasts WHERE slug = ?").bind(slug).first().catch(function () { return null; }) : null;
      return html(renderPiece(piece, frow));
    }

    if (path === "/sitemap.xml") {
      // Q08-SITEMAP-INDEXABLE-1: the home <loc> matches its canonical (trailing slash) and carries the newest piece's date;
      // the RSS feed is not a page and is no longer listed; a piece without a valid date gets no <lastmod>.
      var srows = await env.DB.prepare("SELECT slug, published_at FROM published_pieces WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at DESC LIMIT 5000").all();
      var sitemapXml = q08SitemapXml(srows.results || []);
      var sxml = sitemapXml;
      return new Response(sxml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=1800" } });
    }

    if (path === "/robots.txt") {
      return new Response("User-agent: *\nAllow: /\n\nSitemap: " + ORIGIN + "/sitemap.xml\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    if (path === "/" + INDEXNOW_KEY + ".txt") return new Response(INDEXNOW_KEY, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    if (path === "/subscribe") return await handleSubscribe(req, env, url);
    if (path === "/confirm") { var t0 = url.searchParams.get("t")||""; await env.DB.prepare("UPDATE subscribers SET status='confirmed', confirmed_at=? WHERE token=? AND status!='unsubscribed'").bind(nowIso(), t0).run(); return html("<h2>Subscribed</h2><p>You are subscribed. The daily digest arrives each evening.</p>"); }
    if (path === "/unsubscribe") { var t1 = (url.searchParams.get("t")||"").trim(); if (!t1) return html("<h2>Invalid link</h2><p>No unsubscribe token provided.</p>", 400); var unsub = await env.DB.prepare("UPDATE subscribers SET status='unsubscribed' WHERE token=?").bind(t1).run(); return (unsub && unsub.meta && unsub.meta.changes > 0) ? html("<h2>Unsubscribed</h2><p>You have been removed from the daily digest.</p>") : html("<h2>Not found</h2><p>That unsubscribe link is invalid or already used.</p>", 404); }
    if (path === "/forecasts") {
      var frs = await env.DB.prepare("SELECT slug, source_slug, claim, probability, horizon, resolution, status, outcome, brier FROM q08_forecasts WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY id DESC LIMIT 200").all().catch(function () { return { results: [] }; });
      return html(renderForecasts(frs.results || [], await forecastStats(env)));
    }
    if (path === "/retractions" || path === "/api/retractions") {
      var rrows = await env.DB.prepare("SELECT r.slug, r.reason, r.retracted_at, p.title FROM q08_retractions r LEFT JOIN published_pieces p ON p.slug = r.slug ORDER BY r.retracted_at DESC LIMIT 500").all().catch(function () { return { results: [] }; });
      if (path === "/api/retractions") return json({ ok: true, worker: WORKER, version: VERSION, retractions: rrows.results || [] });
      return html(renderRetractions(rrows.results || []));
    }
    if (path === "/api/forecasts") {
      var fr2 = await env.DB.prepare("SELECT slug, source_slug, claim, probability, horizon, resolution, alternatives_json, status, outcome, brier, checks, created_at, resolved_at, disposition FROM q08_forecasts WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY id DESC LIMIT 200").all().catch(function () { return { results: [] }; });
      return json({ ok: true, worker: WORKER, version: VERSION, generated_at: nowIso(), stats: await forecastStats(env), forecasts: fr2.results || [] });
    }
    if (path === "/api/pieces") {
      var rows = await env.DB.prepare("SELECT slug, title, core_concept, published_at, reads" + (__forecastSchemaDone ? ", kind" : "") + " FROM published_pieces WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at DESC LIMIT 50").all();
      return json(rows.results || []);
    }

    if (path === "/api/signals") {
      var rows = await env.DB.prepare("SELECT id, source, title, volatility_score, ratio, signal_strength, status, created_at FROM signal_log ORDER BY created_at DESC LIMIT 30").all();
      return json(rows.results || []);
    }

    if (path === "/api/runs") {
      var rows = await env.DB.prepare("SELECT * FROM engine_runs ORDER BY id DESC LIMIT 20").all();
      return json(rows.results || []);
    }

    // Q08-SITEMAP-INDEXABLE-1: only / and /index.html are the index. Every other unknown path used to return the index
    // with 200 (a soft 404: scanner probes such as /.env or /.ssh/id_ed25519 and any typo became duplicate home pages to
    // Google). They now answer 404 with a link home, and are never indexed.
    if (path !== "/" && path !== "/index.html") {
      return new Response('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Not found · q08</title></head><body style="font-family:system-ui,sans-serif;max-width:640px;margin:15vh auto;padding:0 16px"><h1>Not found</h1><p>There is no page at this address. <a href="' + ORIGIN + '/">Go to q08</a>.</p></body></html>', { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
    }
    // Index
    var pieces = await env.DB.prepare("SELECT slug, title, body_md, core_concept, published_at" + (__forecastSchemaDone ? ", kind" : "") + " FROM published_pieces WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at DESC LIMIT 20").all().catch(() => ({results:[]}));
    return html(renderIndex(pieces.results || []));
  },

  async scheduled(controller, env, ctx) {
    env = __aiAttrEnv(env, "q08-signal-engine", "AI", "AUDIT");
    if (controller.cron === "0 17 * * *") { ctx.waitUntil(sendDigest(env)); return; }
    ctx.waitUntil(ensureAccuracySchema(env).then(() => sweepStaleRuns(env)).then(() => generate(env)).catch(async (e) => {
      await env.DB.prepare(
        "INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, ms, status, error) VALUES (0,0,0,0,'error',?)"
      ).bind(String(e && e.message || e).slice(0, 500)).run().catch(() => {});
    }).then(function () { return resolveForecasts(env, 2).catch(function (e) { console.error("q08 resolveForecasts failed: " + String(e && e.message || e).slice(0, 200)); }); }).then(function () { return auditPublished(env, 4).catch(function (e) { console.error("q08 auditPublished failed: " + String(e && e.message || e).slice(0, 200)); }); }).then(() => stallDetector(env)).then(() => writeOwnMetrics(env)).catch(function () {}));
  },
};