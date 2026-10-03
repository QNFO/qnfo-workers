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
var VERSION = "0.8.5-ensemble"; // v0.8.5 Q08-ENSEMBLE-1 (pillar: reach): writer -> 2-judge reader panel from model families other than the writer -> editor from the other writer family -> fresh panel; judges are small-active-parameter models; panel agreement measured (q08_panel_effective_votes_30d); v0.8.4 Q08-QUALITY-1 (pillar: reach): plain-wording and no-pipeline-metadata rules, overused-precedent ban, Title Case title gate, owner editorial directives (qnfo-audit q08_editor_notes), reader-test rounds by the other model (max 1 rewrite, fail-open on a critic error), daily attempt cap of 2x the publish cap, owner verdict weight 3 (q08_owner_verdicts); v0.8.3 Q08-NOTE-1 (pillar: reach): optional sanitized note on the verdict form, stored in q08_feedback.note, never read by any prompt; v0.8.2 Q08-METRICS-1: daily human/crawler read counter, GET /api/metrics, metrics_7d on /health, own registry values (#1759); compose temperature from ops_config q08_compose_temperature 0.4..0.8 (#1760); v0.7.37 Q08-CADENCE-CAP-1: daily cap read from ops_config q08_max_per_day (#1716); v0.7.36 personal-channel-hold-ascii; v0.7.16 ANTI-BANAL-1: ban stock "structural dynamic" framing + label/abstraction titles; title must name a mechanism, not a category
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
        try { res = await t.run(model, input, opts); return res; } catch (e) { ok = 0; throw e; }
        finally {
          try {
            var u = res && typeof res === "object" && res.usage || {};
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
  return {
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
var Q08_METRIC_KEYS = [["q08_gate_pass_rate_7d", "gate_pass_rate"], ["q08_neurons_per_published_piece_7d", "neurons_per_published_piece"], ["q08_human_reads_7d", "human_reads"], ["q08_verified_votes_7d", "verified_votes"], ["q08_confirmed_subscribers", "confirmed_subscribers"]];
async function writeOwnMetrics(env) {
  if (!env.AUDIT) return 0;
  var m = await metrics7d(env), now = nowIso(), n = 0;
  for (var i = 0; i < Q08_METRIC_KEYS.length; i++) {
    var v = m[Q08_METRIC_KEYS[i][1]];
    if (typeof v !== "number" || !isFinite(v)) continue;
    var r = await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3 WHERE metric = ?1").bind(Q08_METRIC_KEYS[i][0], String(v), now).run().catch(function () { return null; });
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
  "SYSTEMIC, NOT SPECIFIC \u2014 HISTORY RHYMES: the incident is a probe, never the subject. Extract the universal system the incident instantiates \u2014 the specific mechanism that would produce the same breakdown in any domain and any century. Then show it is universal by connecting it across domains and, where a real recurrence fits, across history. Historical precedent is a suggestion, not a requirement \u2014 use a well-known recurrence when it genuinely illuminates the system, but never force a rhyme, never fabricate a historical event to create one, and never let the search for a precedent crowd out the argument itself. The nouns change \u2014 a guild\u2019s quality mark becomes a verification badge, a patent-medicine advertisement becomes a sponsored result \u2014 the system does not. Your central claim must survive the disappearance of this specific incident. An essay that stays inside its incident, or that reaches for a metaphor instead of a true historical recurrence, is rejected.",
  "",
  "REGISTER: cold structural objectivity. An engineer describing a mechanism, not a consultant describing a market. Write the way a precise bug report reads: specific, unimpressed, exact.",
  "",
  "STRUCTURE: let the material dictate the shape. No required arc, no three-movement template. Banned section headers, exactly: 'How the Flaw Manifests', 'Cascading Failures', 'A Minimal Alternative', 'A Minimal Framework', 'Connections Across Disciplines', 'Echoes from the Past', 'A Path Forward', 'The Lens Restored', 'Lessons for the Future', 'Unexpected Parallels', 'The Broader Lesson', and any header of the form 'The [Adjective] [Lever/Bottleneck/Premise/Flaw]: X'. Never name a section after its rhetorical function.",
  "",
  "OPENING: in one or two sentences name the incident, then pivot immediately to the system it reveals. The incident earns at most one paragraph; the reader should know within the first paragraph what universal dynamic is at stake, not merely what specific product broke. Never open on an aphorism or a general claim; never dwell on the incident.",
  "",
  "CONCRETENESS ACROSS ERAS: name the real things \u2014 but across history, not only in the present. The signal\u2019s particulars are one instance; the essay earns its length by naming the OTHER eras and institutions where the same system operated (a medieval guild\u2019s forged marks, a nineteenth-century patent-medicine boom, a twentieth-century ratings failure). Anonymizing the material is a register failure; refusing to leave the present is a depth failure. A sentence without a specific referent is a sentence to rewrite.",
  "",
  "FACTS (hard, non-negotiable): every specific fact \u2014 number, price, percentage, count, identifier, channel ID, database schema, SQL query, or log excerpt \u2014 must come from the SIGNAL, verbatim or as a direct paraphrase. The signal is your only source of specifics about the incident; historical precedents are drawn from real, verifiable history. If the signal gives no figure, write the claim in general terms ('the score is computed from static signals') and never supply a value. Inventing a number, a channel ID, a dollar amount, a database schema, or a log excerpt to sound concrete is the single worst failure this publication can commit \u2014 a reader who checks will find nothing behind it. A general honest sentence always beats a specific fabricated one. Before writing any number, ask: is this exact figure in the signal? If not, write the general claim instead.",
  "",
  "PROSE, NOT SCHEME: write prose, not a specification. Never enumerate with '(1) ... (2) ...' in running text, and never write like a design document; the reader is a person, not a reviewer.",
  "",
  "NO SECTION HEADERS: the essay is continuous prose. Do not use Markdown section headers (## or ###) anywhere in the body \u2014 paragraph breaks only. A header is a crutch; if you need one, the prose has failed to carry the argument.",
  "",
  "PRECEDENT, NOT METAPHOR: a historical precedent is a real, well-known recurrence of the same system \u2014 a named era and institution where the identical incentive or structural dynamic operated. Never fabricate a historical event or date to force a rhyme; a reader who checks must find it. A vague \u2018throughout history\u2019 with no named instance is not a precedent. A metaphor (\u2018it is like a telescope\u2019) is decorative and banned.",
  "",
  "CROSS-DOMAIN SYNTHESIS: the essay\u2019s spine is the universal system, and you must show it operating in genuinely different domains \u2014 engineering, economics, biology, law, politics, infrastructure, finance, military history \u2014 not as a list of analogies but as evidence the system is domain-independent. A decorative stock prop is banned; a historical recurrence of the same mechanism is required. Breadth is the point: an essay that never leaves its source domain has not found the signal.",
  "",
  "ENDING: end at the point of maximum implication. A closing paragraph that describes a healed system is forbidden. If a fix exists, fold it into the argument; the final sentences leave the reader with the sharpest unresolved fact \u2014 not a summary, not a resolution, not a flourish.",
  "",
  "VERDICT (mandatory final line, this is the last line of your output, after the essay): write exactly 'worth your time: yes|flat|no \u2014 one clause of justification'. State honestly whether a reader gains something by reading the essay that they would not get from the source thread itself. 'no' rejects the essay; 'flat' means it barely clears the bar. Omitting this line is a rejection on its own.",
  "",
    "MECHANISM, NOT LABEL: name the causal process \u2014 who is incentivised to do what, which information is missing, where the coupling breaks \u2014 as actors doing something, never as an abstract noun. 'Incentive structure', 'information asymmetry', 'coupling failure', 'structural dynamic' and 'systemic failure' are labels, not mechanisms: if a sentence reduces to one of them, the mechanism has not been found yet. The words 'structural', 'systemic' and 'dynamic' are permitted only as a precise description of a named mechanism, never as a summary of your own argument.",
    "BANNED FRAMING (automatic rejection \u2014 the tells of a banal essay): 'illustrates a broader structural dynamic', 'exposes a structural dynamic', 'reveals a structural dynamic', 'a recurring institutional dynamic', 'a systemic failure in which', 'a structural gap between', 'what this reveals about', 'the deeper pattern', 'the broader lesson'. Never tell the reader what the essay 'reveals'; demonstrate it and stop. A sentence that announces the significance of the essay instead of adding a fact is a sentence to delete.",
    "SIGNIFICANCE ANNOUNCEMENT (banned): never write \"the incident illustrates / exposes / reveals / foregrounds / underscores a <noun phrase>\". Those verbs, applied to the incident, are the banality signature \u2014 they announce that the essay has a point instead of making it. State the causal chain directly: who does what to whom, and what breaks as a result. If a draft contains any of these verbs, rewrite the sentence as a mechanism.",
    "TITLE: name the mechanism, not the category. A good title names a specific causal process or its actors \u2014 e.g. 'The clearinghouse that paid itself first' or 'Why the map outlives the territory it describes'. Banned title shapes: the bare '[Adjective]-[Noun] [Preposition] [Abstract Noun]' stack ('Scale-Induced Professional Displacement'); 'The X of Y' ('The Incentive-Driven Misalignment of Threat Models'); 'X as Y' ('Formal Guarantees as Market Signal'); and any title opening with Structural, Systemic, Implicit, Opaque, Formal, Abstract, Externalized, Statistical or a similar nominalisation. If the title would work as a category label in a management deck, it is the wrong title.",
  "PLAIN WORDING (this is what a reader judges first): write the way a sharp person explains something to a smart friend, not the way a paper abstracts it. Mix short sentences with long ones. Name who did what by what they are (the maintainers, the buyers, the vendor, the shipping line), never by role words: no 'the observer', 'the actor', 'the producer', 'the consumer', 'the proxy', 'the cue', 'the arrangement', 'the mechanism', 'the signal', 'the process'. A sentence that exists only to announce structure ('This same arrangement appears...', 'The mechanism works like this', 'The process therefore hinges on', 'not a quirk of a single product') is deleted. If you cannot picture a person doing the thing in a sentence, rewrite it. Say it once; do not restate a point in new abstract words.",
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
  "# The rating agency that switched who paid",
  "",
  "Until the early 1970s the big credit rating agencies sold their ratings to investors. Then they switched: the company issuing the bond paid for its own rating. The letter grades looked the same on the day of the switch. What had changed was who could take their business elsewhere. An agency that rated a bond too harshly lost the issuer to a competitor, and the fee with it. Investors kept reading the grade as a judgement made on their behalf, and nothing on the page told them the customer had changed. Years later the top grade sat on thousands of mortgage securities that lost most of their value. The agencies had not faked a number. They had learned which answer kept the client.",
  "",
  "# The freight office that priced its own risk",
  "",
  "A shipping line asked its own freight office to set the insurance premium on the cargo it carried. The office priced each consignment from the manifest, and the manifest was written by the same clerks who loaded the hold. Nobody falsified a document; the incentive did the work. A consignment that was awkward to stow was written up as routine, because routine cargo cleared faster. The premium fell, the line won more contracts, and the losses surfaced only when a hull was opened in dry dock two seasons later. The party who could have measured the risk was the party paid to understate it.",
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
  "Judge: does it open with something concrete that happened? Can you state its claim in one sentence? Does every paragraph add a new fact or step, or only restate in abstract words? Are the words plain, or do role words ('the observer', 'the actor', 'the arrangement') and announcements of structure stand in for people doing things? Is the historical parallel specific and real, or a stock example? Be strict: a 4 must be earned."
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
var PANEL_POOL = [
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/zai-org/glm-5.3-flash",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/deepseek-ai/deepseek-v4-flash-0731",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
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
async function readerTest(env, modelId, text) {
  try {
    var essay = String(text || "").replace(/\n?worth your time:[^\n]*$/im, "").trim().slice(0, 9000);
    var resp = await env.AI.run(modelId, { messages: [{ role: "user", content: READER_PROMPT + "\n\n--- ESSAY ---\n" + essay }], max_tokens: 700, temperature: 0.2 }, { signal: AbortSignal.timeout(60000) });
    var out = resp.response || (resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) || "";
    var v = parseReaderVerdict(out);
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
async function panelRead(env, text, exclude, seed, k) {
  var want = k || 2;
  var ids = pickPanel(exclude, want + 2, seed);
  var first = ids.slice(0, want), spare = ids.slice(want);
  var got = await Promise.all(first.map(function (id) { return readerTest(env, id, text); }));
  for (var i = 0; i < got.length; i++) { if (!got[i] && spare.length) got[i] = await readerTest(env, spare.shift(), text); }
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
async function panelPairs(env) {
  var rs = await env.DB.prepare("SELECT piece_key, round, pass FROM q08_reader_tests WHERE created_at >= datetime('now','-30 days') AND role = 'judge' ORDER BY piece_key, round, id").all().catch(function () { return { results: [] }; });
  var by = {};
  (rs.results || []).forEach(function (r) { var k = r.piece_key + "#" + r.round; (by[k] = by[k] || []).push(!!r.pass); });
  return Object.keys(by).filter(function (k) { return by[k].length === 2; }).map(function (k) { return by[k]; });
}
async function saveReaderTests(env, key, rows) {
  if (!rows || !rows.length) return;
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS q08_reader_tests (id INTEGER PRIMARY KEY AUTOINCREMENT, piece_key TEXT, round INTEGER, role TEXT, model TEXT, family TEXT, would_read INTEGER, score INTEGER, tells TEXT, fix TEXT, pass INTEGER, created_at TEXT)").run();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      await env.DB.prepare("INSERT INTO q08_reader_tests (piece_key, round, role, model, family, would_read, score, tells, fix, pass, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(String(key || "").slice(0, 200), r.round || 1, r.role || "judge", r.model || "", r.family || "", r.would_read ? 1 : 0, r.score == null ? null : r.score, JSON.stringify(r.tells || []), r.fix || "", r.pass ? 1 : 0, nowIso()).run();
    }
  } catch (e) {}
}
// One row per judge, plus an editor row, so the chain of models behind a piece is recorded.
// Q08-ENSEMBLE-1 read-out (public, aggregate only; no IP, cookie or visitor text). It is the evidence the loop needs: does each
// family read like the others (n_eff), does the editor round actually raise the score, and which phrases do judges keep flagging.
async function ensembleReport(env) {
  var out = { window_days: 30, by_family: [], by_round: [], effective_votes: effectiveVotes([]), top_tells: [], recorded: false };
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
    out.recorded = out.by_family.length > 0;
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
    parts.push("\n--- OVERUSED PRECEDENTS ON THIS SITE (BANNED: pick a different real case, or use none) ---");
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
async function compose(env, prompt, banned, order) {
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
      var norm = normalizeDraft(text);
      var g = gate(norm, banned);
      if (g.ok) return { text: norm, model: modelId };
      if (!best || norm.length > best.text.length) best = { text: norm, model: modelId, problems: g.problems };
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
var HISTORICAL_RE = /\b([0-9]+th century|\d{3,4}0s|19[0-9]{2}|18[0-9]{2}|1[0-7][0-9]{2}|medieval|renaissance|enlightenment|industrial revolution|gilded age|antiquity|ancient|roman|greek|victorian|edwardian|byzantine|feudal|dynast\w*|pharaoh|mesopotamia|bronze age|iron age|middle ages|mongol|ottoman|colonial|belle ?poque|preindustrial|great depression|south sea|tulip|dot-com|dotcom|hanseatic|medici|silk road|printing press|gutenberg|panic of|railway mania)\b/i;
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
    for (var bp of banned) { if (bp.re.test(text)) { problems.push("overused precedent on this site: " + bp.label + " - use a different real case, or none"); break; } }
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
  // Seed prompt pool with structure skeleton (headings, else title + lead paragraph).
  var skeleton = body.split("\n").filter(l => l.startsWith("#") || l.startsWith("- ") || l.startsWith("**")).join("\n").slice(0, 800);
  if (skeleton.length < 50) {
    var leadPara = body.split("\n").map(l => l.trim()).filter(l => l.length > 40)[0] || "";
    skeleton = (title + "\n" + leadPara.slice(0, 400)).slice(0, 800);
  }
  if (skeleton.length > 50) {
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

async function generate(env) {
  var t0 = Date.now();
  // Daily cap check
  var dayCount = await env.DB.prepare(
    "SELECT COUNT(*) n FROM published_pieces WHERE published_at >= ?1"
  ).bind(utcDay() + "T00:00:00.000Z").first();
  var todayN = (dayCount && dayCount.n) || 0;
  var cap = await dailyCap(env);
  if (todayN >= cap) {
    return { ok: false, reason: "daily cap reached (" + todayN + "/" + cap + (cap < MAX_PER_DAY ? ", ops_config " + CAP_KEY : "") + ")" };
  }
  // Q08-QUALITY-1: attempts are bounded at twice the publish cap, so reader-test rounds cannot add model calls beyond what the
  // lower cap saves (fleet_budget caps are breached; CORE PROMPT rule 8 forbids adding paid calls).
  var attempts = await env.DB.prepare("SELECT COUNT(*) n FROM engine_runs WHERE ran_at >= datetime('now','start of day') AND status IN ('ok','gate_failed')").first().catch(function () { return { n: 0 }; });
  if ((attempts && attempts.n || 0) >= cap * 2) {
    return { ok: false, reason: "daily attempt cap reached (" + attempts.n + "/" + (cap * 2) + ")" };
  }
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
    "SELECT pp.structure_md FROM prompt_pool pp JOIN published_pieces p ON p.id = pp.piece_id WHERE pp.active = 2 AND (p.reads > 0 OR p.feedback_score > 0) ORDER BY pp.performance_score DESC, p.feedback_score DESC LIMIT 2"
  ).all();
  var fewShot = (exemplars.results || []).filter(function(r){ return exemplarOk(r.structure_md); });
  // Recent structures as divergence priming: the model must NOT repeat them.
  var recentRows = await env.DB.prepare(
    "SELECT structure_md FROM prompt_pool ORDER BY created_at DESC LIMIT 6"
  ).all();
  var recentStructures = (recentRows.results || []).map(function(r){ return r.structure_md; });
  // Compose
  var recentBodies = await env.DB.prepare("SELECT body_md FROM published_pieces ORDER BY published_at DESC LIMIT 8").all().catch(function () { return { results: [] }; });
  var banned = overusedPrecedents((recentBodies.results || []).map(function (r) { return r.body_md; }), 2);
  var ownerNotes = await ownerDirectives(env);
  var prompt = buildPrompt(friction, fewShot, recentStructures, { banned: banned, ownerNotes: ownerNotes });
  var piece  = await compose(env, prompt, banned);
  // Gate \u2014 one corrective retry on failure
  var gateResult = gate(piece.text, banned);
  if (!gateResult.ok) {
    var retryPrompt = prompt + "\n\n--- CORRECTIVE FEEDBACK: your previous draft was rejected. Rewrite the ENTIRE essay from scratch with a completely different structure \u2014 continuous prose, no '##' section headers, but KEEP exactly one '# ' H1 title line as the FIRST line of the essay \u2014 fixing only these issues ---\n" + gateResult.problems.join("; ");
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
  // Q08-ENSEMBLE-1. Levels: 1 writer (family W) -> 0 deterministic gate (uncorrelated with every model) -> 2 reader panel of two small
  // models from families other than W -> 3 editor from the other writer family, editing the draft against the panel's notes ->
  // 4 fresh panel from families other than W, the editor and the first panel where the pool allows. Publish only on a passing last
  // read. A panel with no valid verdict fails open (the gate already passed), so a model outage never stalls q08.
  var readerRows = [];
  var writerFam = familyOf(piece.model);
  if (gateResult.ok) {
    var seed = seedOf(story.title || "");
    var p1 = await panelRead(env, piece.text, [writerFam], seed, 2);
    if (p1) readerRows = readerRows.concat(panelRows(p1, 1));
    if (p1 && !p1.pass) {
      var editOrder = COMPOSE_MODELS.filter(function (m) { return familyOf(m) !== writerFam; }).concat(COMPOSE_MODELS.filter(function (m) { return familyOf(m) === writerFam; }));
      var edPrompt = prompt + "\n\n--- EDITOR PASS: below is a draft by another writer. Two independent readers from different model families would not read it to the end (mean score " + p1.mean + " of 5). What they said to fix: " + p1.fix + (p1.tells.length ? " Phrases they flagged as generic machine prose: " + p1.tells.join(" | ") + "." : "") + " Edit it, do not start over: keep every fact and the same case, keep the title line first and the verdict line last, replace abstractions with people doing things, vary sentence length, cut anything that only restates. Return the full edited essay. ---\n\n--- DRAFT ---\n" + piece.text;
      var ed = null;
      try { ed = await compose(env, edPrompt, banned, editOrder); } catch (e) { ed = null; }
      var edOk = ed && ed.text && gate(ed.text, banned).ok;
      var p2 = null;
      if (edOk) {
        var edFam = familyOf(ed.model);
        var usedFam = [writerFam, edFam].concat(p1.judges.map(function (j) { return j.family; }));
        p2 = await panelRead(env, ed.text, usedFam, seed + 1, 2);
        if (!p2) p2 = await panelRead(env, ed.text, [writerFam, edFam], seed + 1, 2);
        if (p2) readerRows = readerRows.concat(panelRows(p2, 2));
        readerRows.push({ round: 2, role: "editor", model: ed.model, family: edFam, pass: !!(p2 ? p2.pass : true) });
      }
      if (edOk && (!p2 || p2.pass)) { piece = ed; }
      else { gateResult = { ok: false, problems: ["ensemble: " + (edOk ? "the edited draft was still not worth reading (panel mean " + (p2 && p2.mean) + " of 5)" : "the editor's draft failed the gate") + " - " + (((p2 || p1).fix) || "no fix given")] }; }
    }
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
  await saveReaderTests(env, saved.slug, readerRows);
  // Feedback loop. MUST be awaited: as a floating promise with no ctx.waitUntil it
  // was truncated by the Worker runtime once the response returned, so the promotion
  // loop never completed and the reader-proven pool stayed empty (feedback_score
  // updates landed, promotions did not).
  await feedbackScan(env).catch(() => {});
  // Social cross-post (Bluesky via qnfo-social; skips silently if unset)
  await queueForDistribution(env, saved.title, saved.slug);
  pingIndexNow(env, ORIGIN + "/p/" + saved.slug).catch(() => {});
  emitContentSignal(env, piece, saved).catch(() => {});
  // Log run
  await env.DB.prepare(
    "INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, top_signal, model, ms, status) VALUES (?,?,?,?,?,?,?)"
  ).bind(stories.length, candidates.length, 1, (story.source||"hn") + ":" + story.title.slice(0, 80), piece.model, Date.now()-t0, "ok").run();
  return { ok: true, slug: saved.slug, title: saved.title, model: piece.model, source: (story.source||"hn"), story: story.title };
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
  if (src === "github") {
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
  return '<!DOCTYPE html><html lang="en" data-brand="q08"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + t + '</title><meta name="description" content="' + d + '">' +
    (canon ? '<link rel="canonical" href="' + canon + '"><meta property="og:url" content="' + canon + '">' : "") + (o.robots ? '<meta name="robots" content="' + q08Attr(o.robots) + '">' : "") +
    '<meta property="og:site_name" content="q08"><meta property="og:title" content="' + t + '"><meta property="og:description" content="' + d + '"><meta property="og:type" content="' + (o.ogType || "website") + '"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="' + t + '"><meta name="twitter:description" content="' + d + '">' +
    '<meta name="theme-color" content="#F5F7FB" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#121731" media="(prefers-color-scheme: dark)"><link rel="icon" type="image/svg+xml" href="' + Q08_FAVICON + '"><link rel="alternate" type="application/rss+xml" title="q08" href="/feed.xml">' +
    Q08_FONTS + '<link rel="stylesheet" href="https://qnfo.org/qds.css?v=' + Q08_QDS + '"><script src="https://qnfo.org/qds.js?v=' + Q08_QDS + '" defer><\/script>' + Q08_CSS + ld + MATH_HEAD + "</head><body>" +
    '<a class="q-skip" href="#main">Skip to main content</a><header class="q-top"><div class="q-wrap"><a class="q08-mark" href="/" aria-label="q08 home"><b>q08</b><small>systems-level critique</small></a>' +
    '<nav class="q-nav q-nav-wide" aria-label="Main"><a href="/"' + (o.active === "index" ? ' aria-current="page"' : "") + '>Index</a><a href="/subscribe"' + (o.active === "subscribe" ? ' aria-current="page"' : "") + '>Subscribe</a><a href="/feed.xml">RSS</a></nav>' +
    '<details class="q-menu"><summary aria-label="Menu"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></summary><nav class="q-nav" aria-label="Main"><a href="/">Index</a><a href="/subscribe">Subscribe</a><a href="/feed.xml">RSS</a></nav></details>' +
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
      '<div class="q-item-meta"><time datetime="' + escHtml(p.published_at || "") + '">' + date + "</time>" + (p.core_concept ? '<span class="q-badge">' + escHtml(q08Short(p.core_concept, 44)) + "</span>" : "") + "</div>" +
      (lede ? '<p class="q-item-text">' + escHtml(lede) + "\u2026</p>" : "") + "</li>";
  }).join("");
  var body = '<section class="q08-hero"><h1>Systems-level critique of technical industry friction.</h1><p class="q-lede">Cold, structural, timeless. Each piece takes one story from the technical front page and asks what system produced it.</p></section>' +
    '<section class="q08-feed" aria-label="Pieces">' + (items ? '<ul class="q-list">' + items + "</ul>" : '<div class="q-note">No pieces published yet. The engine publishes a few times a day; subscribe below to get the next one.</div>') + "</section>" + q08Sub(true);
  return q08Page({ title: "q08 \u00b7 systems-level critique", canonical: ORIGIN + "/", active: "index", jsonld: { "@context": "https://schema.org", "@type": "Blog", name: "q08", url: ORIGIN + "/", description: "Systems-level critique of technical industry friction." } }, body);
}
function renderPiece(p) {
  var body = mdToHtml(p.body_md || "").replace(/^\s*<h1>[\s\S]*?<\/h1>\s*/, "");
  var refs = renderSources(p.sources_json);
  var fb = '<form class="q08-fb" method="post"><span>Was this worth your time?</span><textarea class="q-input" name="note" maxlength="280" rows="2" style="flex-basis:100%;order:2" placeholder="Optional: what was missing?" aria-label="Optional note: what was missing?"></textarea><button class="q-btn q-btn-ghost" formaction="/api/f?slug=' + escHtml(p.slug) + '&amp;s=good">Yes</button> <button class="q-btn q-btn-ghost" formaction="/api/f?slug=' + escHtml(p.slug) + '&amp;s=flat">Flat</button> <button class="q-btn q-btn-ghost" formaction="/api/f?slug=' + escHtml(p.slug) + '&amp;s=no">No</button></form>';
  var date = (p.published_at || "").slice(0, 10);
  var desc = q08Lede(p.body_md).slice(0, 160);
  var html = '<article class="q08-piece"><p class="q-eyebrow"><a href="/" style="text-decoration:none;color:inherit">\u2190 Index</a></p><h1 class="q08-t">' + escHtml(p.title) + '</h1><p class="q-meta" style="margin:0 0 28px"><time datetime="' + escHtml(p.published_at || "") + '">' + date + "</time>" + (p.core_concept ? ' \u00b7 <span class="q-badge">' + escHtml(q08Short(p.core_concept, 44)) + "</span>" : "") + "</p>" +
    '<div class="q-prose piece">' + body + "</div>" + fb + (refs ? '<div class="q08-refs">' + refs.replace(/^\s*<section class="refs">/, "").replace(/<\/section>\s*$/, "") + "</div>" : "") + "</article>" + q08Sub(false);
  return q08Page({ title: p.title + " \u00b7 q08", description: desc, canonical: ORIGIN + "/p/" + p.slug, ogType: "article",
    jsonld: { "@context": "https://schema.org", "@type": "Article", headline: String(p.title || "").slice(0, 110), datePublished: p.published_at || undefined, url: ORIGIN + "/p/" + p.slug, publisher: { "@type": "Organization", name: "q08", url: ORIGIN + "/" } } }, html);
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
  var pieces = await env.DB.prepare("SELECT slug, title FROM published_pieces WHERE published_at >= ?1 ORDER BY published_at ASC").bind(day + "T00:00:00.000Z").all();
  var rows = pieces.results || [];
  if (!rows.length) return { ok: true, skipped: "no pieces today", pieces: 0 };
  var subs = await env.DB.prepare("SELECT email, token FROM subscribers WHERE status='confirmed' LIMIT 500").all();
  var list = rows.map(function(r){ return "- " + r.title + " - https://q08.org/p/" + r.slug; }).join("\n");
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
async function queueForDistribution(env, title, slug) {
  // Q08-PERSONAL-CHANNEL-HOLD-1 (2026-10-01): social_threads is drained by qnfo-social onto the
  // owner's PERSONAL Bluesky account, so every q08 essay posted under the owner's name. Off by default;
  // set the plain var Q08_SOCIAL_QUEUE="1" to re-enable once q08 has its own channel.
  if (env.Q08_SOCIAL_QUEUE !== "1") return { ok: false, skip: "Q08-PERSONAL-CHANNEL-HOLD-1" };
  if (!env.AUDIT) return { ok: false, skip: "no audit binding" };
  try {
    // NO-TRUNCATED-LINK-1 (2026-09-27): never slice the URL. A long title used to
    // truncate the permalink (e.g. ".../p/2026-09-18-...-the-lar") -> 404 -> link-dead.
    var _u = "https://q08.org/p/" + slug;
    var _s = " \u2014 ";
    var _t = String(title || "");
    var text = (_t.length + _s.length + _u.length <= 280) ? (_t + _s + _u) : (_t.slice(0, Math.max(0, 280 - _u.length - _s.length)) + _s + _u);
    var id = "q08-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await env.AUDIT.prepare("INSERT OR IGNORE INTO social_threads (slug, title, posts, status) VALUES (?,?,?, 'queued')").bind(id, String(title || "").slice(0, 300), JSON.stringify([text])).run();
    return { ok: true, queued: id };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
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
export const __quality = { gate: gate, overusedPrecedents: overusedPrecedents, parseReaderVerdict: parseReaderVerdict, buildPrompt: buildPrompt, ownerDirectives: ownerDirectives, readerTest: readerTest, pickPanel: pickPanel, familyOf: familyOf, aggregatePanel: aggregatePanel, panelRead: panelRead, effectiveVotes: effectiveVotes, PANEL_POOL: PANEL_POOL, ensembleReport: ensembleReport, saveReaderTests: saveReaderTests, OWNER_VERDICT_WEIGHT: OWNER_VERDICT_WEIGHT, REGISTER_EXEMPLAR: REGISTER_EXEMPLAR };

export default {
  async fetch(req, env, ctx) {
    env = __aiAttrEnv(env, "q08-signal-engine", "AI", "AUDIT");
    var url  = new URL(req.url);
    var path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/api/ensemble") {
      return json(Object.assign({ ok: true, worker: WORKER, version: VERSION, generated_at: nowIso() }, await ensembleReport(env)));
    }
    if (path === "/api/metrics") {
      return json({ ok: true, worker: WORKER, version: VERSION, generated_at: nowIso(), windows: { "7d": await metrics7d(env) } });
    }
    if (path === "/health") {
      var m7 = await metrics7d(env).catch(function () { return null; });
      var cnt = await env.DB.prepare("SELECT COUNT(*) n FROM published_pieces").first().catch(() => ({n:0}));
      var last = await env.DB.prepare("SELECT slug, title, published_at FROM published_pieces ORDER BY published_at DESC LIMIT 1").first().catch(() => null);
      var runs = await env.DB.prepare("SELECT status, COUNT(*) n FROM engine_runs GROUP BY status").all().catch(() => ({results:[]}));
      return json({ ok: true, worker: WORKER, version: VERSION, capabilities: ["signal-scrape", "llm-compose", "essay-publish", "essay-regen", "rss", "mathjax-render", "sources-footer", "email-digest", "indexnow", "reader-verdict-vote", "self-verdict-gate", "feedback-calibration", "cross-day-signal-dedup", "fabrication-gate", "self-referential-signal-emit", "reader-test", "owner-editorial-directives", "owner-verdict-weight"], limitations: ["publisher/composer only - does NOT run a general agent tool loop and does not execute arbitrary code", "not a general-purpose model endpoint; use qnfo-ai for inference", "/run is unauthenticated but rate-limited to 5 per IP per hour", "writes only to its own q08-signal D1; never writes research or personal stores", "no streaming"], metrics_7d: m7, pieces: cnt.n, daily_cap: await dailyCap(env), daily_cap_key: "ops_config " + CAP_KEY, last, runs: runs.results });
    }

    if (path === "/run" && req.method === "POST") {
      // Unauthenticated trigger: bound abuse with a per-IP rate limit (crons call generate() directly).
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
      // current directive. Reuses buildPrompt/compose/gate. Rate-limited per IP.
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

    if (path === "/api/f") {
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
      var rows = await env.DB.prepare("SELECT slug, title, body_md, core_concept, published_at FROM published_pieces ORDER BY published_at DESC LIMIT 20").all();
      return new Response(renderFeed(rows.results || []), { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
    }

    if (path.startsWith("/p/")) {
      var slug = path.slice(3);
      var piece = await env.DB.prepare("SELECT * FROM published_pieces WHERE slug=?").bind(slug).first();
      if (!piece) return html("<h1>Not found</h1>", 404);
      // Increment read count
      env.DB.prepare("UPDATE published_pieces SET reads=reads+1 WHERE slug=?").bind(slug).run().catch(() => {});
      ctx.waitUntil(countRead(env, req).catch(function () {}));
      return html(renderPiece(piece));
    }

    if (path === "/sitemap.xml") {
      var srows = await env.DB.prepare("SELECT slug, published_at FROM published_pieces ORDER BY published_at DESC LIMIT 5000").all();
      var surls = (srows.results || []).map(function (r) {
        return "<url><loc>" + ORIGIN + "/p/" + encodeURIComponent(r.slug) + "</loc><lastmod>" + String(r.published_at || "").slice(0, 10) + "</lastmod></url>";
      }).join("");
      var sxml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + '<url><loc>' + ORIGIN + '</loc></url><url><loc>' + ORIGIN + '/feed.xml</loc></url>' + surls + '</urlset>';
      return new Response(sxml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=1800" } });
    }

    if (path === "/robots.txt") {
      return new Response("User-agent: *\nAllow: /\n\nSitemap: " + ORIGIN + "/sitemap.xml\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    if (path === "/" + INDEXNOW_KEY + ".txt") return new Response(INDEXNOW_KEY, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    if (path === "/subscribe") return await handleSubscribe(req, env, url);
    if (path === "/confirm") { var t0 = url.searchParams.get("t")||""; await env.DB.prepare("UPDATE subscribers SET status='confirmed', confirmed_at=? WHERE token=? AND status!='unsubscribed'").bind(nowIso(), t0).run(); return html("<h2>Subscribed</h2><p>You are subscribed. The daily digest arrives each evening.</p>"); }
    if (path === "/unsubscribe") { var t1 = (url.searchParams.get("t")||"").trim(); if (!t1) return html("<h2>Invalid link</h2><p>No unsubscribe token provided.</p>", 400); var unsub = await env.DB.prepare("UPDATE subscribers SET status='unsubscribed' WHERE token=?").bind(t1).run(); return (unsub && unsub.meta && unsub.meta.changes > 0) ? html("<h2>Unsubscribed</h2><p>You have been removed from the daily digest.</p>") : html("<h2>Not found</h2><p>That unsubscribe link is invalid or already used.</p>", 404); }
    if (path === "/api/pieces") {
      var rows = await env.DB.prepare("SELECT slug, title, core_concept, published_at, reads FROM published_pieces ORDER BY published_at DESC LIMIT 50").all();
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

    // Index
    var pieces = await env.DB.prepare("SELECT slug, title, body_md, core_concept, published_at FROM published_pieces ORDER BY published_at DESC LIMIT 20").all().catch(() => ({results:[]}));
    return html(renderIndex(pieces.results || []));
  },

  async scheduled(controller, env, ctx) {
    env = __aiAttrEnv(env, "q08-signal-engine", "AI", "AUDIT");
    if (controller.cron === "0 17 * * *") { ctx.waitUntil(sendDigest(env)); return; }
    ctx.waitUntil(sweepStaleRuns(env).then(() => generate(env)).catch(async (e) => {
      await env.DB.prepare(
        "INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, ms, status, error) VALUES (0,0,0,0,'error',?)"
      ).bind(String(e && e.message || e).slice(0, 500)).run().catch(() => {});
    }).then(() => stallDetector(env)).then(() => writeOwnMetrics(env)).catch(function () {}));
  },
};