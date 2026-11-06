var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "0.28.2-forecast-repair";
var __AI_ATTR_RATES = { "@cf/zai-org/glm-5.3": [127273, 4e5], "@cf/zai-org/glm-5.3-flash": [13636, 45455], "@cf/nvidia/nemotron-3-120b-a12b": [45455, 136364], "@cf/moonshotai/kimi-k2.6": [86364, 363636], "@cf/moonshotai/kimi-k2.7-code": [86364, 363636], "@cf/openai/gpt-oss-120b": [31818, 68182], "@cf/openai/gpt-oss-20b": [18182, 27273], "@cf/deepseek-ai/deepseek-v4-pro-0813": [12e4, 36e4], "@cf/deepseek-ai/deepseek-v4-flash-0731": [4e4, 12e4], "@cf/meta/llama-3.3-70b-instruct-fp8-fast": [26668, 204805], "@cf/qwen/qwen3-30b-a3b-fp8": [4625, 30475], "@cf/qwen/qwen3.8-27b": [40909, 290909], "@cf/baai/bge-base-en-v1.5": [6058, 0], "@cf/baai/bge-small-en-v1.5": [1841, 0], "@cf/baai/bge-large-en-v1.5": [18582, 0] };
function __aiAttrEnv(env, worker, aiKey, dbKey) {
  try {
    if (!env || env.__aiAttr) return env;
    var ai = env[aiKey], db = env[dbKey];
    if (!ai || typeof ai.run !== "function" || !db) return env;
    var wrapped = new Proxy(ai, { get: /* @__PURE__ */ __name(function(t, p) {
      if (p !== "run") {
        var v = Reflect.get(t, p);
        return typeof v === "function" ? v.bind(t) : v;
      }
      return async function(model, input, opts) {
        var t0 = Date.now(), ok = 1, res;
        try {
          res = await t.run(model, input, (function() {
            try {
              if (opts && opts.extraHeaders && opts.extraHeaders["x-session-affinity"]) return opts;
              var m = input && input.messages, c = m && m.length ? m[0].content : input && input.prompt;
              var s = typeof c === "string" ? c : JSON.stringify(c || "");
              if (s.length < 1024) return opts;
              s = String(model) + "|" + s.slice(0, 4096);
              var h = 2166136261;
              for (var i = 0; i < s.length; i++) {
                h ^= s.charCodeAt(i);
                h = Math.imul(h, 16777619);
              }
              var o = Object.assign({}, opts || {});
              o.extraHeaders = Object.assign({}, o.extraHeaders || {}, { "x-session-affinity": "pc-" + (h >>> 0).toString(36) });
              return o;
            } catch (ePc) {
              return opts;
            }
          })());
          return res;
        } catch (e) {
          ok = 0;
          throw e;
        } finally {
          try {
            var u = res && typeof res === "object" && res.usage || {};
            if (!/bge|embed|whisper|m2m100|resnet|flux|sdxl/i.test(String(model))) try {
              var cTok = Number(u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens || u.cached_tokens || u.input_tokens_details && u.input_tokens_details.cached_tokens || 0) || 0;
              await db.prepare("INSERT INTO ai_cache_counters (day, worker, model, calls, cached_calls, in_tok, cached_tok) VALUES (?1,?2,?3,1,?4,?5,?6) ON CONFLICT(day, worker, model) DO UPDATE SET calls=calls+1, cached_calls=cached_calls+excluded.cached_calls, in_tok=in_tok+excluded.in_tok, cached_tok=cached_tok+excluded.cached_tok").bind((/* @__PURE__ */ new Date()).toISOString().slice(0, 10), worker, String(model).slice(0, 120), cTok > 0 ? 1 : 0, Number(u.prompt_tokens || u.input_tokens || 0) || 0, cTok).run();
            } catch (eCc) {
              console.error(JSON.stringify({ evt: "q08-signal-engine:__aiAttrEnv:caught", error: String(eCc && eCc.message || eCc) }));
            }
            var chars = 0;
            try {
              chars = JSON.stringify(input && (input.messages || input.prompt || input.text) || input || "").length;
            } catch (e1) {
              console.error(JSON.stringify({ evt: "q08-signal-engine:__aiAttrEnv:caught", error: String(e1 && e1.message || e1) }));
            }
            var inTok = Number(u.prompt_tokens || u.input_tokens || 0) || Math.round(chars / 4);
            var outTok = Number(u.completion_tokens || u.output_tokens || 0);
            var r = __AI_ATTR_RATES[String(model)] || [0, 0];
            var neurons = (inTok * r[0] + outTok * r[1]) / 1e6;
            await db.prepare("INSERT INTO ai_call_counters (day, worker, purpose, model, calls, errors, in_chars, ms, in_tok, out_tok, neurons) VALUES (?1,?2,'binding',?3,1,?4,?5,?6,?7,?8,?9) ON CONFLICT(day, worker, purpose, model) DO UPDATE SET calls=calls+1, errors=errors+excluded.errors, in_chars=in_chars+excluded.in_chars, ms=ms+excluded.ms, in_tok=in_tok+excluded.in_tok, out_tok=out_tok+excluded.out_tok, neurons=neurons+excluded.neurons").bind((/* @__PURE__ */ new Date()).toISOString().slice(0, 10), worker, String(model).slice(0, 120), ok ? 0 : 1, chars, Date.now() - t0, inTok, outTok, neurons).run();
          } catch (e2) {
            console.error(JSON.stringify({ evt: "q08-signal-engine:__aiAttrEnv:caught", error: String(e2 && e2.message || e2) }));
          }
        }
      };
    }, "get") });
    var copy = Object.assign({}, env);
    copy[aiKey] = wrapped;
    copy.__aiAttr = 1;
    return copy;
  } catch (e) {
    return env;
  }
}
__name(__aiAttrEnv, "__aiAttrEnv");
var WORKER = "q08-signal-engine";
var Q08_BOT_UA = /bot|crawl|spider|slurp|preview|headless|curl|wget|python|httpclient|go-http|java\/|okhttp|axios|node-fetch|lighthouse|pingdom|uptime|monitor|scanner|facebookexternalhit|embedly|whatsapp|telegram/i;
var VOTE_CUTOFF = "2026-10-03T00:00:00Z";
function isCrawler(req) {
  var ua = String(req.headers.get("user-agent") || "");
  if (!ua || Q08_BOT_UA.test(ua)) return true;
  var bm = req.cf && req.cf.botManagement;
  return !!(bm && bm.verifiedBot);
}
__name(isCrawler, "isCrawler");
async function countRead(env, req) {
  var col = isCrawler(req) ? "crawler" : "human";
  await env.DB.prepare("INSERT INTO q08_daily_reads (day, " + col + ") VALUES (?1, 1) ON CONFLICT(day) DO UPDATE SET " + col + " = " + col + " + 1").bind(utcDay()).run();
}
__name(countRead, "countRead");
function ratio(a, b) {
  return b > 0 ? Math.round(a / b * 1e3) / 1e3 : null;
}
__name(ratio, "ratio");
async function metrics7d(env) {
  var since = new Date(Date.now() - 7 * 864e5).toISOString();
  var voteSince = since > VOTE_CUTOFF ? since : VOTE_CUTOFF;
  var one = /* @__PURE__ */ __name(function(sql, args) {
    var st = env.DB.prepare(sql);
    return (args ? st.bind.apply(st, args) : st).first().catch(function() {
      return null;
    });
  }, "one");
  var pub = await one("SELECT COUNT(*) n FROM published_pieces WHERE published_at >= ?1", [since]);
  var runs = await one("SELECT COUNT(*) n, SUM(CASE WHEN piece_published = 1 THEN 1 ELSE 0 END) ok FROM engine_runs WHERE ran_at >= datetime('now','-7 days') AND status NOT IN ('running','abandoned','async-done','skipped','deferred')");
  var reads = await one("SELECT COALESCE(SUM(human),0) human, COALESCE(SUM(crawler),0) crawler, COUNT(*) days FROM q08_daily_reads WHERE day >= ?1", [since.slice(0, 10)]);
  var votes = await one("SELECT COUNT(*) n, SUM(CASE WHEN signal = 'good' THEN 1 ELSE 0 END) good FROM q08_feedback WHERE created_at >= ?1", [voteSince]);
  var subs = await one("SELECT COUNT(*) n FROM subscribers WHERE status = 'confirmed'");
  var neurons = null;
  if (env.AUDIT) {
    var nr = await env.AUDIT.prepare("SELECT COALESCE(SUM(neurons),0) n FROM ai_call_counters WHERE worker = ?1 AND day >= ?2").bind(WORKER, since.slice(0, 10)).first().catch(function() {
      return null;
    });
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
    published,
    finished_runs: finished,
    gate_pass_rate: ratio(ok, finished),
    human_reads: Number(reads && reads.human) || 0,
    crawler_reads: Number(reads && reads.crawler) || 0,
    read_days_measured: Number(reads && reads.days) || 0,
    verified_votes: nVotes,
    verified_good_share: ratio(Number(votes && votes.good) || 0, nVotes),
    neurons,
    neurons_per_published_piece: neurons == null ? null : ratio(neurons, published),
    confirmed_subscribers: Number(subs && subs.n) || 0,
    vote_cutoff: VOTE_CUTOFF
  };
}
__name(metrics7d, "metrics7d");
var Q08_METRIC_KEYS = [["q08_gate_pass_rate_7d", "gate_pass_rate"], ["q08_neurons_per_published_piece_7d", "neurons_per_published_piece"], ["q08_human_reads_7d", "human_reads"], ["q08_verified_votes_7d", "verified_votes"], ["q08_confirmed_subscribers", "confirmed_subscribers"], ["q08_panel_unavailable_share_7d", "panel_unavailable_share_7d"], ["q08_forecasts_overdue_open", "forecasts_overdue_open"], ["q08_forecast_void_share", "forecast_void_share"]];
function hoursSince(t, nowMs) {
  if (t == null || t === "") return null;
  var ms = typeof t === "number" ? t : Date.parse(String(t));
  if (!isFinite(ms) || ms > nowMs + 6e4) return null;
  return Math.round(Math.max(0, nowMs - ms) / 36e4) / 10;
}
__name(hoursSince, "hoursSince");
async function writeOwnMetrics(env) {
  if (!env.AUDIT) return 0;
  var m = await metrics7d(env), now = nowIso(), n = 0;
  for (var i = 0; i < Q08_METRIC_KEYS.length; i++) {
    var v = m[Q08_METRIC_KEYS[i][1]];
    if (typeof v !== "number" || !isFinite(v)) continue;
    var r = await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3, state = CASE WHEN state = 'UNMEASURED' THEN 'MEASURED' ELSE state END WHERE metric = ?1").bind(Q08_METRIC_KEYS[i][0], String(v), now).run().catch(function() {
      return null;
    });
    if (r && r.meta && r.meta.changes) n++;
  }
  try {
    var ev = effectiveVotes(await panelPairs(env));
    if (ev.n_eff != null) {
      var rr = await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3, state = 'MEASURED' WHERE metric = ?1").bind("q08_panel_effective_votes_30d", String(ev.n_eff), now).run();
      if (rr && rr.meta && rr.meta.changes) n++;
    }
  } catch (e) {
    console.error(JSON.stringify({ evt: "q08-signal-engine:writeOwnMetrics:caught", error: String(e && e.message || e) }));
  }
  try {
    var lp = env.DB ? await env.DB.prepare("SELECT MAX(published_at) t FROM published_pieces").first() : null;
    var hs = hoursSince(lp && lp.t, Date.now());
    if (hs != null) {
      var rh = await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3, state = 'MEASURED' WHERE metric = ?1").bind("q08_hours_since_last_piece", String(hs), now).run();
      if (rh && rh.meta && rh.meta.changes) n++;
    }
  } catch (e) {
    console.error(JSON.stringify({ evt: "q08-signal-engine:writeOwnMetrics:caught", error: String(e && e.message || e) }));
  }
  try {
    var us = await panelUnavailableShare(env);
    if (us != null) {
      var ru = await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3, state = 'MEASURED' WHERE metric = ?1").bind("q08_panel_unavailable_share_7d", String(us), now).run();
      if (ru && ru.meta && ru.meta.changes) n++;
    }
  } catch (e) {
    console.error(JSON.stringify({ evt: "q08-signal-engine:writeOwnMetrics:caught", error: String(e && e.message || e) }));
  }
  return n;
}
__name(writeOwnMetrics, "writeOwnMetrics");
var MAX_PER_DAY = 10;
var CAP_KEY = "q08_max_per_day";
function parseDailyCap(v) {
  var s = v == null ? "" : String(v).trim();
  if (!/^\d{1,3}$/.test(s)) return MAX_PER_DAY;
  return Math.min(Number(s), MAX_PER_DAY);
}
__name(parseDailyCap, "parseDailyCap");
async function dailyCap(env) {
  if (!env || !env.AUDIT) return MAX_PER_DAY;
  try {
    var r = await env.AUDIT.prepare("SELECT value FROM ops_config WHERE key = ?1").bind(CAP_KEY).first();
    return parseDailyCap(r && r.value);
  } catch (e) {
    return MAX_PER_DAY;
  }
}
__name(dailyCap, "dailyCap");
var HN_SEARCH = "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50";
var HN_ITEMS = "https://hn.algolia.com/api/v1/items/";
var UA = "q08-signal-engine/0.1.0 (+https://q08.org)";
var ORIGIN = "https://q08.org";
var INDEXNOW_KEY = "3f8a1c9e7b2d6045a1f3c8e5b9d20147";
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
function utcDay() {
  return nowIso().slice(0, 10);
}
__name(utcDay, "utcDay");
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
__name(slugify, "slugify");
function json(obj, status) {
  return new Response(JSON.stringify(obj, null, 2), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
__name(json, "json");
function html(body, status) {
  return new Response(q08Wrap(body), {
    status: status || 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" }
  });
}
__name(html, "html");
function escHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(escHtml, "escHtml");
async function scrapeHN() {
  const resp = await fetch(HN_SEARCH, { headers: { "User-Agent": UA } });
  if (!resp.ok) throw new Error("HN fetch " + resp.status);
  const data = await resp.json();
  const now = Date.now();
  const stories = [];
  for (const h of data.hits || []) {
    if (!h._tags || !h._tags.includes("story")) continue;
    if (/^(Ask HN|Show HN|Tell HN|Launch HN):/i.test(h.title || "")) continue;
    const pts = h.points || 0;
    const nc = h.num_comments || 0;
    let age_h = null;
    if (h.created_at) {
      try {
        age_h = (now - new Date(h.created_at).getTime()) / 36e5;
      } catch (_) {
        console.error(JSON.stringify({ evt: "q08-signal-engine:scrapeHN:caught", error: String(_ && _.message || _) }));
      }
    }
    const ratio2 = pts > 0 ? nc / pts : 0;
    const vel = age_h != null ? Math.max(0.05, 1 / (1 + age_h / 6)) : 0.5;
    const score = nc * vel + 10 * ratio2;
    stories.push({
      id: h.story_id || h.objectID,
      title: h.title || "",
      url: h.url || "",
      points: pts,
      num_comments: nc,
      age_h,
      ratio: Math.round(ratio2 * 100) / 100,
      volatility_score: Math.round(score * 100) / 100
    });
  }
  stories.sort((a, b) => b.volatility_score - a.volatility_score);
  return stories;
}
__name(scrapeHN, "scrapeHN");
function cleanHtml(s) {
  return (s || "").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
__name(cleanHtml, "cleanHtml");
function flattenComments(node, depth, out) {
  if (!node || typeof node !== "object") return;
  if (node.text) out.push({ depth, text: cleanHtml(node.text) });
  for (const child of node.children || []) flattenComments(child, depth + 1, out);
}
__name(flattenComments, "flattenComments");
var FRICTION_TOP_K = 8;
var FRICTION_MAX = 3e3;
async function extractFriction(storyId, topK) {
  topK = topK || FRICTION_TOP_K;
  const resp = await fetch(HN_ITEMS + storyId, { headers: { "User-Agent": UA } });
  if (!resp.ok) throw new Error("HN items " + resp.status);
  const item = await resp.json();
  const comments = [];
  for (const child of item.children || []) flattenComments(child, 0, comments);
  const topLevel = comments.filter((c) => c.depth === 0).sort((a, b) => b.text.length - a.text.length);
  const top = topLevel.slice(0, topK);
  const friction = top.map((c) => "Comment: " + String(c.text).replace(/\s+/g, " ").trim()).join("\n").slice(0, FRICTION_MAX);
  const strength = comments.length >= 100 ? "High" : comments.length >= 30 ? "Medium" : "Low";
  return {
    core_concept: item.title || "",
    friction_point: friction,
    signal_strength: strength + " (" + comments.length + " comments)",
    comment_count: comments.length
  };
}
__name(extractFriction, "extractFriction");
async function scrapeGitHub() {
  var since = new Date(Date.now() - 7 * 24 * 3600 * 1e3).toISOString().slice(0, 10);
  var url = "https://api.github.com/search/repositories?q=created:%3E" + since + "+stars:%3E50&sort=stars&order=desc&per_page=20";
  var resp = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/vnd.github+json" } });
  if (!resp.ok) throw new Error("github " + resp.status);
  var data = await resp.json();
  var out = [];
  for (var r of data.items || []) {
    var stars = r.stargazers_count || 0, issues = r.open_issues_count || 0;
    var issueRatio = stars > 0 ? issues / stars : 0;
    out.push({ source: "github", id: r.full_name, title: r.full_name, url: r.html_url, points: stars, num_comments: issues, ratio: Math.round(issueRatio * 100) / 100, volatility_score: Math.round((stars / 10 + 10 * Math.min(issueRatio, 2)) * 10) / 10, description: r.description || "" });
  }
  out.sort(function(a, b) {
    return b.volatility_score - a.volatility_score;
  });
  return out.slice(0, 15);
}
__name(scrapeGitHub, "scrapeGitHub");
var ARXIV_KEYWORDS = ["distributed system", "consensus", "fault tolerance", "compiler", "programming language", "database", "security", "privacy", "machine learning", "infrastructure", "network", "operating system", "formal verification", "cryptography", "scalability", "reliability", "architecture", "verification", "protocol"];
async function scrapeArxiv() {
  var q = "cat:cs.DC OR cat:cs.CR OR cat:cs.DB OR cat:cs.PL OR cat:cs.OS OR cat:cs.NI OR cat:cs.SY OR cat:cs.SE OR cat:cs.AR";
  var url = "http://export.arxiv.org/api/query?search_query=" + encodeURIComponent(q) + "&sortBy=submittedDate&sortOrder=descending&max_results=30";
  var resp = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(2e4) });
  if (!resp.ok) throw new Error("arxiv " + resp.status);
  var xml = await resp.text();
  var out = [];
  for (var e of xml.split("<entry>").slice(1)) {
    var title = ((e.match(/<title>([\s\S]*?)<\/title>/) || [, ""])[1] || "").replace(/\s+/g, " ").trim();
    var abs = ((e.match(/<summary>([\s\S]*?)<\/summary>/) || [, ""])[1] || "").replace(/\s+/g, " ").trim();
    var idm = (e.match(/<id>([\s\S]*?)<\/id>/) || [, ""])[1] || "";
    var arxid = idm.split("/abs/")[1] || idm.trim();
    var low = (title + " " + abs).toLowerCase();
    var hits = 0;
    for (var k of ARXIV_KEYWORDS) if (low.includes(k)) hits++;
    if (hits === 0 || !arxid) continue;
    out.push({ source: "arxiv", id: arxid, title, url: "https://arxiv.org/abs/" + arxid, points: hits, num_comments: 0, ratio: 0, volatility_score: hits * 20, abstract: abs });
  }
  out.sort(function(a, b) {
    return b.volatility_score - a.volatility_score;
  });
  return out.slice(0, 12);
}
__name(scrapeArxiv, "scrapeArxiv");
async function extractGitHubFriction(fullName, description) {
  var parts = [];
  if (description) parts.push(description);
  try {
    var url = "https://api.github.com/repos/" + fullName + "/issues?state=open&sort=comments&direction=desc&per_page=5";
    var resp = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/vnd.github+json" } });
    if (resp.ok) {
      var issues = await resp.json();
      for (var i of issues || []) {
        if (i.pull_request) continue;
        parts.push((i.title || "") + ": " + String(i.body || "").replace(/\s+/g, " ").slice(0, 300));
      }
    }
  } catch (e) {
    console.error(JSON.stringify({ evt: "q08-signal-engine:extractGitHubFriction:caught", error: String(e && e.message || e) }));
  }
  var friction = parts.join(" ").slice(0, 800);
  return { core_concept: fullName, friction_point: friction, signal_strength: parts.length >= 3 ? "Medium" : "Low", comment_count: parts.length };
}
__name(extractGitHubFriction, "extractGitHubFriction");
var FRAMING_RULE = "FRAMING IDIOMS (process rule, enforced by an automatic check that rejects the draft): never write that an incident, case or episode 'illustrates', 'reveals', 'exposes', 'underscores' or 'foregrounds' a broader, recurring, structural or similar pattern, dynamic, tension, logic or incentive; never write 'the same logic', 'the same dynamic', 'path forward', 'ecosystem of' or 'vibe'. Each of those phrases stands where a mechanism should be. In its place state the concrete mechanism of this case: which party does what, which information it lacks or withholds, and what breaks as a result.";
var Q08_DIRECTIVE = [
  "You are the writer for q08.org, a machine-written publication that takes a story from the technical front pages, explains it to a reader who missed it, and then explains the system that produced it: how the technology involved actually works and why it behaved as it did. The standard is the best system-design writing for engineers: concrete components, how data and requests move between them, the design decision or constraint that made this outcome possible, and the trade-off behind that decision. The story comes first; the system is the payoff.",
  "Your input is a story from a technical front page with its source text, the discussion around it and background reference text. Your output is a self-contained essay that an engineer who never saw the source can follow and learn from.",
  "",
  "NEWS FIRST, THEN THE SYSTEM: report the case before you analyse it, then explain the technical system the case runs on and the specific mechanism that produced the outcome, then the lesson a builder can take: under which design conditions the same outcome follows elsewhere, stated as reasoning ('a system that does X will Y when Z') without naming outside events. An essay that stays inside its incident is rejected, and so is one that reaches outside the source by asserting facts the source and the background do not contain.",
  "",
  "REGISTER: plain, exact explanatory journalism \u2014 a good science or technology desk explaining a story to a smart reader who missed it. Specific, unhurried, unimpressed; never a consultant describing a market.",
  "",
  "SECTION HEADERS (banned shapes): Banned section headers, exactly: 'How the Flaw Manifests', 'Cascading Failures', 'A Minimal Alternative', 'A Minimal Framework', 'Connections Across Disciplines', 'Echoes from the Past', 'A Path Forward', 'The Lens Restored', 'Lessons for the Future', 'Unexpected Parallels', 'The Broader Lesson', and any header of the form 'The [Adjective] [Lever/Bottleneck/Premise/Flaw]: X'. Never name a section after its rhetorical function.",
  "",
  "LEDE (inverted pyramid, checked): the first paragraph, at most 70 words, tells a reader who has never seen the source what happened: who did or said what, where it appeared (name it: the blog post and its author, the paper and where it was posted, the project and its repository, the publication), when if the source says, and why it matters. Name the subject in plain words in the first sentence. The second paragraph gives the context a newcomer needs: what the thing is and what is at stake. Then the most important facts from the source, most important first, and only then the analysis of the mechanism. Never open on an aphorism, a general claim, or an abstract noun such as 'the pattern', 'the mechanism' or 'the system'.",
  "",
  "CONCRETENESS FROM THE SOURCE: name the real things the SOURCE MATERIAL names \u2014 its products, people, organisations, figures and quotations, exactly as given. Elsewhere, be concrete by describing the mechanism step by step (who does what, which information is missing, where it breaks), never by adding named outside examples. Use at most one labelled hypothetical, in no more than three sentences, only if it makes the argument shorter or clearer; otherwise use none. It names no real person, company, product, date or number, describes parties only by their function, and says it is hypothetical. A sentence without a specific referent is a sentence to rewrite; a specific referent that is not in the source material is a sentence to delete.",
  "",
  "FACTS (hard, non-negotiable, and checked): every claim about the real world \u2014 an event, a date, a person, an organisation, a product, a law, a number, a price, a percentage, a count, an identifier, a quotation, a study, a historical episode \u2014 must be stated in the SOURCE MATERIAL you are given (the signal, the linked article text and the BACKGROUND reference text), verbatim or as a direct paraphrase. Your own memory is NOT a source: do not add historical precedents, case studies, statistics, dates, names of people or companies, laws, institutions, product details or 'studies show' from memory, however sure you are. If the source does not state it, delete it or turn it into labelled hypothetical reasoning with no real names. Every draft is fact-checked sentence by sentence against the source material by independent reviewers from other model families; a single unsupported claim means the piece is not published. A general honest sentence always beats a specific unsupported one. Before writing any name, date or number, ask: is this exact item in the source material? If not, do not write it.",
  "",
  "GENERAL CLAIMS: a sentence about what many programs, people, firms or systems do, how common, widespread, typical or reliable something is, or what 'the only' fix is, is a factual claim and is checked like any other. State a general mechanism only as conditional reasoning that follows from the source ('if a system does X, then Y follows'), never as an assertion about prevalence or reliability the source does not make. Attribute what you report to where it comes from, by name ('In a post on his blog, ...', 'The paper, posted to arXiv, ...', 'The project\u2019s README says ...').",
  "",
  "PROSE, NOT SCHEME: write prose, not a specification. Never enumerate with '(1) ... (2) ...' in running text, and never write like a design document; the reader is a person, not a reviewer.",
  "",
  "NO SECTION HEADERS: the essay is continuous prose. Do not use Markdown section headers (## or ###) anywhere in the body \u2014 paragraph breaks only. A header is a crutch; if you need one, the prose has failed to carry the argument.",
  "",
  "NO BORROWED HISTORY: do not cite historical episodes, past scandals, earlier industries, named laws, named institutions or named products that are not in the source material (the BACKGROUND reference text counts as source material, so context from it is welcome when attributed). A reader who checks must find every fact; the safest way to be checkable is to assert only what the source says and to reason openly about what follows from it. A metaphor ('it is like a telescope') is decorative and banned; reasoning from the stated facts to a general mechanism is the job.",
  "",
  "STRUCTURE (required, in this order): (1) the lede; (2) context a newcomer needs: what the thing is, how it came to this point, what came before, using the SOURCE and the BACKGROUND; (3) the key facts of this case, most important first; (4) the systems analysis; (5) an ending on the sharpest open question.",
  "",
  "SYSTEMS ANALYSIS (required; this is why the piece exists): after the facts, explain the system behind the story, technically and step by step. Name the components involved (the software, protocol, hardware, data store, model, service or organisation, as the SOURCE and BACKGROUND name them); say how data, requests or control move between them; locate the exact design decision, default, constraint or assumption that made this outcome possible; walk through how the event unfolded inside that system; and name the trade-off the designers made and what it costs, and whom. Where the source shows people or firms choosing, add who is rewarded for which choice. Abstract words are not analysis: 'the loop', 'the coupling', 'the structure', 'the dynamic', 'the information gap' must each be replaced by the concrete thing (which cookie, which queue, which check, which incentive, held by whom). Explain technical terms in a clause the first time they appear. Use BACKGROUND facts where they exist and attribute them; otherwise reason openly and say it is reasoning ('the incentive is ...', 'that means ...', 'if ... then ...'), introducing no new name, date, number or event. A piece that only retells its source is rejected. Begin the systems analysis with a line of its own that contains exactly <!-- analysis --> (readers never see it): everything before that line is reporting and is checked sentence by sentence against the sources; after it, reasoning about incentives and consequences is checked only for invented facts, and every name, date, number, event or quotation must still come from the sources.",
  "",
  "ENDING: end at the point of maximum implication. A closing paragraph that describes a healed system is forbidden. If a fix exists, fold it into the argument; the final sentences leave the reader with the sharpest unresolved fact \u2014 not a summary, not a resolution, not a flourish.",
  "",
  "VERDICT (mandatory final line, this is the last line of your output, after the essay): write exactly 'worth your time: yes|flat|no \u2014 one clause of justification'. State honestly whether a reader gains something by reading the essay that they would not get from the source thread itself. 'no' rejects the essay; 'flat' means it barely clears the bar. Omitting this line is a rejection on its own.",
  "",
  "MECHANISM, NOT LABEL: name the causal process \u2014 who is incentivised to do what, which information is missing, where the coupling breaks \u2014 as actors doing something, never as an abstract noun. 'Incentive structure', 'information asymmetry', 'coupling failure', 'structural dynamic' and 'systemic failure' are labels, not mechanisms: if a sentence reduces to one of them, the mechanism has not been found yet. The words 'structural', 'systemic' and 'dynamic' are permitted only as a precise description of a named mechanism, never as a summary of your own argument.",
  "BANNED FRAMING (automatic rejection \u2014 the tells of a banal essay): 'illustrates a broader structural dynamic', 'exposes a structural dynamic', 'reveals a structural dynamic', 'a recurring institutional dynamic', 'a systemic failure in which', 'a structural gap between', 'what this reveals about', 'the deeper pattern', 'the broader lesson'. Never tell the reader what the essay 'reveals'; demonstrate it and stop. A sentence that announces the significance of the essay instead of adding a fact is a sentence to delete.",
  'SIGNIFICANCE ANNOUNCEMENT (banned): never write "the incident illustrates / exposes / reveals / foregrounds / underscores a <noun phrase>". Those verbs, applied to the incident, are the banality signature \u2014 they announce that the essay has a point instead of making it. State the causal chain directly: who does what to whom, and what breaks as a result. If a draft contains any of these verbs, rewrite the sentence as a mechanism.',
  FRAMING_RULE,
  "TITLE: a plain headline in sentence case that names the subject (who or what) and the point, so a reader knows from the title alone what the piece is about \u2014 never an abstract label. A good title names the actors and what happens \u2014 e.g. 'The clearinghouse that paid itself first' or 'Why the map outlives the territory it describes'. Banned title shapes: the bare '[Adjective]-[Noun] [Preposition] [Abstract Noun]' stack ('Scale-Induced Professional Displacement'); 'The X of Y' ('The Incentive-Driven Misalignment of Threat Models'); 'X as Y' ('Formal Guarantees as Market Signal'); and any title opening with Structural, Systemic, Implicit, Opaque, Formal, Abstract, Externalized, Statistical or a similar nominalisation. If the title would work as a category label in a management deck, it is the wrong title. TITLE FORMAT: plain text; the only markup allowed is *italic* emphasis and math written as \\( ... \\); never use dollar signs for math, and write a literal dollar sign as \\$.",
  "PLAIN WORDING (this is what a reader judges first): write the way a sharp person explains something to a smart friend, not the way a paper abstracts it. Mix short sentences with long ones. Name who did what by what they are (the parties as the source describes them), never by role words: no 'the observer', 'the actor', 'the producer', 'the consumer', 'the proxy', 'the cue', 'the arrangement', 'the mechanism', 'the signal', 'the process'. A sentence that exists only to announce structure ('This same arrangement appears...', 'The mechanism works like this', 'The process therefore hinges on', 'not a quirk of a single product') is deleted. If you cannot picture a person doing the thing in a sentence, rewrite it. Say it once; do not restate a point in new abstract words.",
  "INTERNAL FIELDS: the SIGNAL block's field names and its signal_strength value are pipeline metadata, not facts about the world. Never mention them, never write 'signal strength', 'friction point' or 'core concept'. Open with what actually happened or was said, as one concrete event, in plain words.",
  "CONSTRAINTS (hard):",
  "- The structural claim must outlive the incident: dates may appear in the material, but the argument must not depend on them.",
  "- No @handles, no marketing register, no promotional language. No emotional vocabulary ('anxiety', 'dread', 'excitement'). No hedging ('it seems', 'perhaps').",
  "- No first person. No preamble, no meta-commentary about the essay itself.",
  "- 450-1100 words. Length follows the source material: a thin source gets a short, dense essay. Never pad: restating the mechanism in new words, closing summaries and filler cases are rejected. Complete sentences only: the essay ends on a full stop, never mid-sentence.",
  "- Output: valid Markdown, H1 title first, then the essay. The title names the subject and the point (see TITLE). Banned title forms: 'When X Meets Y', 'X: The Hidden Z', 'An Analysis of X', 'A Critique of Y'.",
  "- Mathematical notation: inline math as \\(...\\), display math as \\[...\\]. Use only these delimiters; never single-dollar signs."
].join("\n");
var REGISTER_EXEMPLAR = [
  "STYLE SPECIFICATION (a process and a register, not a sample to imitate and not a source of subjects):",
  "1. Title: a plain headline in sentence case naming the subject and the point, naming the parties as the source names them.",
  "2. Lede (first paragraph, at most 70 words): who did or said what, where it was published (named), when if the source says, and why it matters to the reader. Then one paragraph of context a newcomer needs.",
  "3. Body: the key facts, then how the system works: its components and how data or requests move between them, the design decision or constraint behind the event, the event traced step by step through that system, and the trade-off it reveals and who pays for it. Every real-world fact comes from the source material or the background; any extra case is a labelled hypothetical whose parties are described only by their function.",
  "4. Voice: precise, unimpressed, short and long sentences mixed, no announcement of structure, no moral.",
  "5. Ending: the sharpest unresolved fact, in one or two sentences."
].join("\n");
function exemplarOk(md) {
  if (!md) return false;
  var t = String(md);
  var tm = t.match(/^#\s+(.+)$/m);
  var title = (tm ? tm[1].trim() : String(t.split("\n")[0] || "").trim()).replace(/[\u2010-\u2015\u2212]/g, "-");
  if (title) {
    if (BAD_TITLE_RE.test(title)) return false;
    if (TITLE_FORMULA_RE.test(title) || TITLE_COLON_RE.test(title)) return false;
    for (var i = 0; i < LABEL_TITLE_RES.length; i++) {
      if (LABEL_TITLE_RES[i].test(title)) return false;
    }
  }
  if (new RegExp(STOCK_FRAMING_RE.source, "i").test(t)) return false;
  if (new RegExp(LABEL_PHRASE_RE.source, "i").test(t)) return false;
  return true;
}
__name(exemplarOk, "exemplarOk");
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
    for (var b of bodies || []) {
      if (v.re.test(String(b || ""))) n++;
    }
    if (n >= need) out.push(v);
  }
  return out;
}
__name(overusedPrecedents, "overusedPrecedents");
async function ownerDirectives(env) {
  if (!env || !env.AUDIT) return [];
  try {
    var r = await env.AUDIT.prepare("SELECT text FROM q08_editor_notes WHERE active = 1 ORDER BY id DESC LIMIT 8").all();
    return (r.results || []).map(function(x) {
      return String(x.text || "").replace(/\s+/g, " ").trim().slice(0, 400);
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}
__name(ownerDirectives, "ownerDirectives");
function aiReplyText(resp) {
  if (!resp) return "";
  var r = resp.response;
  if (r !== void 0 && r !== null && r !== "") return typeof r === "string" ? r : JSON.stringify(r);
  var m = resp.choices && resp.choices[0] && resp.choices[0].message;
  var c = m && m.content;
  if (Array.isArray(c)) c = c.map(function(p) {
    return typeof p === "string" ? p : p && p.text || "";
  }).join("");
  if (c && typeof c !== "string") c = JSON.stringify(c);
  return c || "";
}
__name(aiReplyText, "aiReplyText");
var READER_PROMPT = [
  "You are a busy, intelligent reader who has never heard of this site and owes it nothing. Read the essay below the way you read anything you found by chance: you stop at the first sentence that wastes your time.",
  "Answer with exactly one JSON object and nothing else:",
  '{"would_read_to_end": true or false, "score": 1 to 5 (5 = I would send it to a friend, 4 = worth the time, 3 = I would skim it, 1 = I stopped at the first paragraph), "slop_tells": [up to 3 short phrases copied from the essay that sound like generic machine prose], "fix": "one sentence telling the writer what to change"}',
  "Judge first the opening: does the first paragraph tell you, as someone who missed the story, what happened, who is involved, where it was published and why it matters? If it does not, the score is at most 3 and the fix says what the opening must state. Second: does it explain the system behind the story, concretely: how the technology involved works (its components and how data or requests move between them), which design decision or constraint produced this outcome, and what trade-off that reveals and who pays for it? A piece that only retells its source scores at most 3, and the fix names the system it should have explained. Abstract words standing in for that explanation ('the loop', 'the coupling', 'the structure') score at most 3. Then: does it open with something concrete that happened? Can you state its claim in one sentence? Does every paragraph add a new fact or step, or only restate in abstract words? Are the words plain, or do role words ('the observer', 'the actor', 'the arrangement') and announcements of structure stand in for people doing things? Does it reason from the facts it states to a general mechanism, or does it lean on a stock example? Be strict: a 4 must be earned. The writer may use only the facts of the story it was given and the reasoning that follows from them, so never ask for outside facts, history, examples, names or figures: when a paragraph is thin, the fix is to cut or merge it, and a short, dense, accurate piece that states its facts and reasons to one mechanism can earn a 4."
].join("\n");
function parseReaderVerdict(text) {
  var m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  var o;
  try {
    o = JSON.parse(m[0]);
  } catch (e) {
    return null;
  }
  var score = Number(o && o.score);
  if (!isFinite(score)) return null;
  score = Math.max(1, Math.min(5, Math.round(score)));
  var wr = o.would_read_to_end === true || o.would_read_to_end === "true";
  var tells = Array.isArray(o.slop_tells) ? o.slop_tells.slice(0, 3).map(function(t) {
    return String(t).slice(0, 120);
  }) : [];
  return { would_read: wr, score, tells, fix: String(o.fix || "").slice(0, 300), pass: wr && score >= 4 };
}
__name(parseReaderVerdict, "parseReaderVerdict");
var MODEL_FAMILY = {
  "@cf/nvidia/nemotron-3-120b-a12b": "nvidia",
  "@cf/openai/gpt-oss-120b": "openai",
  "@cf/openai/gpt-oss-20b": "openai",
  "@cf/google/gemma-4-26b-a4b-it": "google",
  "@cf/zai-org/glm-5.3-flash": "zai",
  "@cf/qwen/qwen3-30b-a3b-fp8": "alibaba",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": "meta",
  "@cf/deepseek-ai/deepseek-v4-flash-0731": "deepseek",
  "@cf/deepseek-ai/deepseek-v4-pro-0813": "deepseek",
  "@cf/moonshotai/kimi-k2.6": "moonshot",
  "@cf/zai-org/glm-5.3": "zai"
};
function familyOf(id) {
  return MODEL_FAMILY[id] || "unknown:" + String(id || "").split("/")[1];
}
__name(familyOf, "familyOf");
var READER_MAX_TOKENS = 6e3;
var PANEL_POOL = [
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/zai-org/glm-5.3-flash",
  "@cf/deepseek-ai/deepseek-v4-flash-0731"
];
function pickPanel(exclude, k, seed) {
  var ex = {};
  (exclude || []).forEach(function(f2) {
    ex[f2] = 1;
  });
  var n = PANEL_POOL.length, start = Math.abs(seed | 0) % n, out = [], seen = {};
  for (var i = 0; i < n && out.length < k; i++) {
    var id = PANEL_POOL[(start + i) % n], f = familyOf(id);
    if (ex[f] || seen[f]) continue;
    seen[f] = 1;
    out.push(id);
  }
  return out;
}
__name(pickPanel, "pickPanel");
function seedOf(str) {
  var h = 0, t = String(str || "");
  for (var i = 0; i < t.length; i++) h = h * 31 + t.charCodeAt(i) | 0;
  return Math.abs(h);
}
__name(seedOf, "seedOf");
async function readerTest(env, modelId, text, rprompt) {
  try {
    var essay = stripAnalysisMark(String(text || "").replace(/\n?worth your time:[^\n]*$/im, "").trim()).slice(0, 9e3);
    var resp = await env.AI.run(modelId, Object.assign({ messages: [{ role: "user", content: (rprompt || READER_PROMPT) + "\n\n--- ESSAY ---\n" + essay }], max_tokens: READER_MAX_TOKENS, temperature: 0.2 }, factCheckExtra(modelId)), { signal: AbortSignal.timeout(9e4) });
    var out = aiReplyText(resp);
    var v = parseReaderVerdict(String(out).replace(/<think>[\s\S]*?<\/think>/gi, ""));
    if (v) {
      v.model = modelId;
      v.family = familyOf(modelId);
    }
    return v;
  } catch (e) {
    return null;
  }
}
__name(readerTest, "readerTest");
var PANEL_PASS_MEAN = 3.5;
function aggregatePanel(judges) {
  var j = (judges || []).filter(Boolean);
  if (!j.length) return null;
  var mean = j.reduce(function(a, x) {
    return a + x.score;
  }, 0) / j.length;
  var wr = j.filter(function(x) {
    return x.would_read;
  }).length;
  var tells = [], fixes = [];
  j.forEach(function(x) {
    (x.tells || []).forEach(function(t) {
      if (tells.indexOf(t) < 0 && tells.length < 5) tells.push(t);
    });
    if (x.fix && fixes.indexOf(x.fix) < 0) fixes.push(x.fix);
  });
  return { judges: j, n: j.length, mean: Math.round(mean * 100) / 100, pass: mean >= PANEL_PASS_MEAN && wr >= 1 && j.every(function(x) {
    return x.score >= 3;
  }), fix: fixes.join(" | ").slice(0, 500), tells };
}
__name(aggregatePanel, "aggregatePanel");
async function panelRead(env, text, exclude, seed, k, rprompt) {
  var want = k || 2;
  var ids = pickPanel(exclude, want + 2, seed);
  var first = ids.slice(0, want), spare = ids.slice(want);
  var got = await Promise.all(first.map(function(id) {
    return readerTest(env, id, text, rprompt);
  }));
  for (var i = 0; i < got.length; i++) {
    if (!got[i] && spare.length) got[i] = await readerTest(env, spare.shift(), text, rprompt);
  }
  return aggregatePanel(got);
}
__name(panelRead, "panelRead");
function effectiveVotes(pairs) {
  var a = 0, b = 0, c = 0, d = 0;
  (pairs || []).forEach(function(p) {
    if (p[0] && p[1]) a++;
    else if (p[0] && !p[1]) b++;
    else if (!p[0] && p[1]) c++;
    else d++;
  });
  var n = a + b + c + d;
  if (n < 20) return { reads: n, phi: null, n_eff: null };
  var den = Math.sqrt((a + b) * (c + d) * (a + c) * (b + d));
  var phi = den === 0 ? 1 : (a * d - b * c) / den;
  phi = Math.max(0, Math.min(1, phi));
  return { reads: n, phi: Math.round(phi * 1e3) / 1e3, n_eff: Math.round(2 / (1 + phi) * 100) / 100 };
}
__name(effectiveVotes, "effectiveVotes");
async function panelUnavailableShare(env) {
  var r = await env.DB.prepare("SELECT SUM(CASE WHEN role = 'panel_unavailable' THEN 1 ELSE 0 END) u, SUM(CASE WHEN role = 'judge' THEN 1 ELSE 0 END) j FROM q08_reader_tests WHERE created_at >= datetime('now','-7 days')").first().catch(function() {
    return null;
  });
  if (!r) return null;
  var panels = (r.j || 0) / 2 + (r.u || 0);
  if (panels < 5) return null;
  return Math.round((r.u || 0) / panels * 1e3) / 1e3;
}
__name(panelUnavailableShare, "panelUnavailableShare");
async function panelPairs(env) {
  var rs = await env.DB.prepare("SELECT piece_key, round, pass FROM q08_reader_tests WHERE created_at >= datetime('now','-30 days') AND role = 'judge' ORDER BY piece_key, round, id").all().catch(function() {
    return { results: [] };
  });
  var by = {};
  (rs.results || []).forEach(function(r) {
    var k = r.piece_key + "#" + r.round;
    (by[k] = by[k] || []).push(!!r.pass);
  });
  return Object.keys(by).filter(function(k) {
    return by[k].length === 2;
  }).map(function(k) {
    return by[k];
  });
}
__name(panelPairs, "panelPairs");
async function ensureReaderTable(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS q08_reader_tests (id INTEGER PRIMARY KEY AUTOINCREMENT, piece_key TEXT, round INTEGER, role TEXT, model TEXT, family TEXT, would_read INTEGER, score INTEGER, tells TEXT, fix TEXT, pass INTEGER, created_at TEXT)").run();
  var info = await env.DB.prepare("PRAGMA table_info(q08_reader_tests)").all();
  var have = {};
  (info.results || []).forEach(function(c) {
    have[c.name] = 1;
  });
  if (!have.role) await env.DB.prepare("ALTER TABLE q08_reader_tests ADD COLUMN role TEXT").run();
  if (!have.family) await env.DB.prepare("ALTER TABLE q08_reader_tests ADD COLUMN family TEXT").run();
}
__name(ensureReaderTable, "ensureReaderTable");
async function saveReaderTests(env, key, rows) {
  if (!rows || !rows.length) return;
  try {
    await ensureReaderTable(env);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      await env.DB.prepare("INSERT INTO q08_reader_tests (piece_key, round, role, model, family, would_read, score, tells, fix, pass, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(String(key || "").slice(0, 200), r.round == null ? 1 : r.round, r.role || "judge", r.model || "", r.family || "", r.would_read ? 1 : 0, r.score == null ? null : r.score, JSON.stringify(r.tells || []), r.fix || "", r.pass ? 1 : 0, nowIso()).run();
    }
  } catch (e) {
    console.error("q08 reader_tests write failed: " + String(e && e.message || e).slice(0, 200));
  }
}
__name(saveReaderTests, "saveReaderTests");
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
    (t.results || []).forEach(function(x) {
      var a;
      try {
        a = JSON.parse(x.tells || "[]");
      } catch (e) {
        a = [];
      }
      a.forEach(function(ph) {
        var k = String(ph).toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
        if (k) count[k] = (count[k] || 0) + 1;
      });
    });
    out.top_tells = Object.keys(count).filter(function(k) {
      return count[k] >= 2;
    }).sort(function(a, b) {
      return count[b] - count[a];
    }).slice(0, 10).map(function(k) {
      return { phrase: k, n: count[k] };
    });
    var un = await env.DB.prepare("SELECT COUNT(*) n FROM q08_reader_tests WHERE role = 'panel_unavailable' AND " + since).first();
    out.panel_unavailable = un ? un.n : 0;
    out.recorded = out.by_family.length > 0 || out.panel_unavailable > 0;
  } catch (e) {
    console.error(JSON.stringify({ evt: "q08-signal-engine:ensembleReport:caught", error: String(e && e.message || e) }));
  }
  return out;
}
__name(ensembleReport, "ensembleReport");
function panelRows(panel, round) {
  return panel.judges.map(function(j) {
    return { round, role: "judge", model: j.model, family: j.family, would_read: j.would_read, score: j.score, tells: j.tells, fix: j.fix, pass: j.pass };
  });
}
__name(panelRows, "panelRows");
var LEDE_MAX_WORDS = 90;
var LEDE_ABSTRACT_RE = /^\s*(?:the|this|that|these|such)\s+(?:observable\s+|underlying\s+|core\s+|central\s+)?(?:pattern|mechanism|dynamics?|arrangement|system|process|loop|incentive|structure|tension|question|problem|gap)\b/i;
var LEDE_STOP = /^(this|that|with|from|have|were|their|there|which|when|what|into|than|then|they|them|been|also|only|more|most|such|does|each|over|will|would|could|should|about|after|before|because|while|where|your|show|using|via|based|towards?|new|how|why)$/;
function hostOf(u) {
  var m = String(u || "").match(/^https?:\/\/(?:www\.)?([^\/:?#]+)/i);
  return m ? m[1].toLowerCase() : "";
}
__name(hostOf, "hostOf");
function sourceKind(src) {
  var s = String(src && src.source || "hn"), host = hostOf(src && src.url);
  if (s === "github") return "a GitHub repository (" + String(src.title || "") + ")";
  if (s === "arxiv") return "a research paper posted to arXiv";
  return host ? "an article at " + host + ", discussed on Hacker News" : "a Hacker News discussion";
}
__name(sourceKind, "sourceKind");
function ledeWords(t) {
  return String(t || "").toLowerCase().replace(/[\u2010-\u2015\u2212]/g, "-").split(/[^a-z0-9]+/).filter(function(w) {
    return w.length >= 4 && !LEDE_STOP.test(w);
  });
}
__name(ledeWords, "ledeWords");
function ledeOf(text) {
  var parts = String(text || "").split(/\n{2,}/);
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (!p || /^#/.test(p) || /^(worth your time:|FORECAST-JSON:)/i.test(p)) continue;
    return p;
  }
  return "";
}
__name(ledeOf, "ledeOf");
function ledeProblems(text, src) {
  if (!src || !src.title) return [];
  var lede = ledeOf(text), out = [];
  if (!lede) return ["lede missing: the essay has no opening paragraph"];
  var n = lede.split(/\s+/).filter(Boolean).length;
  if (n > LEDE_MAX_WORDS) out.push("lede too long (" + n + " words; the first paragraph is at most " + LEDE_MAX_WORDS + ")");
  if (LEDE_ABSTRACT_RE.test(lede)) out.push("lede opens on an abstract noun ('" + lede.slice(0, 40) + "'): open with who did what, where");
  var want = ledeWords(src.title);
  if (hostOf(src.url)) want = want.concat(ledeWords(hostOf(src.url).split(".")[0]));
  var have = ledeWords(lede).map(function(w) {
    return w.slice(0, 5);
  });
  if (want.length && !want.some(function(w) {
    return have.indexOf(w.slice(0, 5)) >= 0;
  })) out.push("lede does not name the subject: the first paragraph must say what is being discussed (" + String(src.title).slice(0, 80) + ") and where it appeared");
  return out;
}
__name(ledeProblems, "ledeProblems");
function withLede(g, text, src) {
  var lp = ledeProblems(text, src);
  return lp.length ? { ok: false, problems: (g.problems || []).concat(lp) } : g;
}
__name(withLede, "withLede");
var BG_STOP = /^(this|that|with|from|have|were|their|there|which|when|what|into|than|then|they|them|been|also|only|more|most|such|does|each|over|will|would|could|should|about|after|before|because|while|where|your|show|using|says|said|just|like|make|made|years|later|first|says|look|looks|claims|claimed)$/;
var BG_ARTICLE_MAX = 6e3;
var BACKGROUND_PROMPT_MAX = 22e3;
var BG_ENTITY_MAX = 4500;
var BG_ENTITIES = 4;
var BG_ENTITY_SKIP = /^(Show|Ask|Tell|HN|The|A|An|How|Why|What|When|Where|Who|New|Our|We|I|It|Its|This|That|These|Those|My|Your|Is|Are|Was|Be|In|On|At|For|From|To|Of|And|Or|But|With|Without|Not|No|Yes|Now|Today|Why|Inside|Introducing|Announcing|Launch|Launches|Details|Campaign)$/;
function backgroundEntities(story) {
  var t = String(story && story.title || "").replace(/^(show|ask|tell) hn:\s*/i, "");
  var m = t.match(/^[A-Za-z0-9_.-]+\/([A-Za-z0-9_.-]+)$/);
  if (m) return [m[1]];
  var out = [];
  (t.match(/\b[A-Z][A-Za-z0-9+.#-]{2,}(?:\s+[A-Z][A-Za-z0-9+.#-]{1,})?/g) || []).forEach(function(w) {
    var first = w.split(/\s+/)[0];
    var clean = w.replace(/['\u2019]s$/, "").replace(/[.:,;]+$/, "");
    if (BG_ENTITY_SKIP.test(first) || clean.length < 3) return;
    if (out.map(function(x) {
      return x.toLowerCase();
    }).indexOf(clean.toLowerCase()) < 0) out.push(clean);
  });
  return out.slice(0, BG_ENTITIES);
}
__name(backgroundEntities, "backgroundEntities");
async function entityArticle(name, have) {
  var d = await (await evidenceFetch("https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=" + encodeURIComponent(name), 8e3)).json();
  var hit = (d.query && d.query.search || [])[0];
  if (!hit || !hit.title || have.indexOf(String(hit.title)) >= 0) return "";
  var j = await (await evidenceFetch("https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=" + encodeURIComponent(String(hit.title)), 8e3)).json();
  var pg = j.query && j.query.pages ? Object.keys(j.query.pages).map(function(k) {
    return j.query.pages[k];
  }).filter(function(x2) {
    return String(x2.title) === String(hit.title);
  })[0] : null;
  var x = pg ? String(pg.extract || "") : "";
  if (x.length < 300 || /may refer to/i.test(x.slice(0, 300))) return "";
  have.push(String(hit.title));
  return "Wikipedia, '" + String(hit.title).slice(0, 100) + "' (article, as fetched " + nowIso().slice(0, 10) + "): " + x.replace(/\s+/g, " ").slice(0, BG_ENTITY_MAX);
}
__name(entityArticle, "entityArticle");
function backgroundQuery(story) {
  var t = String(story && story.title || "");
  var m = t.match(/^[A-Za-z0-9_.-]+\/([A-Za-z0-9_.-]+)$/);
  if (m) t = m[1].replace(/[-_.]+/g, " ");
  return t.replace(/^(show|ask|tell) hn:\s*/i, "").split(/[^A-Za-z0-9'\u2019-]+/).filter(function(w) {
    return w.length >= 3 && !BG_STOP.test(w.toLowerCase());
  }).slice(0, 6).join(" ");
}
__name(backgroundQuery, "backgroundQuery");
async function backgroundPack(story) {
  var q = backgroundQuery(story);
  if (q.split(" ").length < 1 || q.length < 3) return "";
  var out = [];
  var wiki = (async function() {
    var d = await (await evidenceFetch("https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=" + encodeURIComponent(q), 8e3)).json();
    var titles = (d.query && d.query.search || []).map(function(h) {
      return String(h.title || "");
    }).filter(Boolean).slice(0, 3);
    if (!titles.length) return [];
    var e = await (await evidenceFetch("https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json&titles=" + encodeURIComponent(titles.join("|")), 8e3)).json();
    var pages = e.query && e.query.pages ? Object.keys(e.query.pages).map(function(k) {
      return e.query.pages[k];
    }) : [];
    var qw = q.toLowerCase().split(" ");
    var keep = pages.filter(function(p) {
      var x = String(p.extract || "");
      return x.length >= 200 && !/may refer to/i.test(x.slice(0, 300)) && qw.some(function(w) {
        return (String(p.title || "") + " " + x.slice(0, 400)).toLowerCase().indexOf(w) >= 0;
      });
    }).slice(0, 2);
    var full = await Promise.all(keep.map(function(p) {
      return evidenceFetch("https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=" + encodeURIComponent(String(p.title)), 8e3).then(function(r) {
        return r.json();
      }).then(function(j) {
        var pg = j.query && j.query.pages ? Object.keys(j.query.pages).map(function(k) {
          return j.query.pages[k];
        }).filter(function(x) {
          return String(x.title) === String(p.title);
        })[0] : null;
        return pg && String(pg.extract || "").length > String(p.extract || "").length ? String(pg.extract) : "";
      }).catch(function(e2) {
        console.error(JSON.stringify({ at: "q08.backgroundPack.wikipedia-full", error: String(e2 && e2.message || e2).slice(0, 160) }));
        return "";
      });
    }));
    return keep.map(function(p, i) {
      var body = full[i] || String(p.extract);
      return "Wikipedia, '" + String(p.title).slice(0, 100) + "' (" + (full[i] ? "article" : "lead section") + ", as fetched " + nowIso().slice(0, 10) + "): " + body.replace(/\s+/g, " ").slice(0, full[i] ? BG_ARTICLE_MAX : 1800);
    });
  })().catch(function(e) {
    console.error(JSON.stringify({ at: "q08.backgroundPack.wikipedia", error: String(e && e.message || e).slice(0, 160) }));
    return [];
  });
  var news = (async function() {
    var start = new Date(Date.now() - 30 * 864e5).toISOString().replace(/[-:T]/g, "").slice(0, 14);
    var d = await (await evidenceFetch("https://api.gdeltproject.org/api/v2/doc/doc?mode=artlist&format=json&maxrecords=8&sort=hybridrel&startdatetime=" + start + "&query=" + encodeURIComponent(q), 8e3)).json();
    return (d.articles || []).slice(0, 5).map(function(a) {
      var sd = String(a.seendate || "");
      return "News coverage (" + String(a.domain || "").slice(0, 60) + ", " + sd.slice(0, 4) + "-" + sd.slice(4, 6) + "-" + sd.slice(6, 8) + "): " + String(a.title || "").slice(0, 200);
    });
  })().catch(function(e) {
    console.error(JSON.stringify({ at: "q08.backgroundPack.news", error: String(e && e.message || e).slice(0, 160) }));
    return [];
  });
  var got = await Promise.all([wiki, news]);
  got.forEach(function(g) {
    g.forEach(function(x) {
      out.push(x);
    });
  });
  var have = out.map(function(x) {
    var mm = String(x).match(/^Wikipedia, '([^']+)'/);
    return mm ? mm[1] : "";
  }).filter(Boolean);
  var ents = backgroundEntities(story);
  for (var ei = 0; ei < ents.length; ei++) {
    try {
      var ea = await entityArticle(ents[ei], have);
      if (ea) out.push(ea);
    } catch (e) {
      console.error(JSON.stringify({ at: "q08.backgroundPack.entity", entity: ents[ei], error: String(e && e.message || e).slice(0, 160) }));
    }
  }
  return out.join("\n");
}
__name(backgroundPack, "backgroundPack");
function buildPrompt(friction, fewShot, recentStructures, opts) {
  var parts = [Q08_DIRECTIVE];
  parts.push("Remember: your final output line must be the verdict: 'worth your time: yes|flat|no \u2014 justification'.");
  if (fewShot && fewShot.length > 0) {
    parts.push("\n--- PROVEN EXEMPLAR STRUCTURES (quality floor, not templates to copy) ---");
    for (var ex of fewShot.slice(0, 2)) {
      parts.push(ex.structure_md.slice(0, 400));
    }
  } else {
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
    parts.push(banned.map(function(b) {
      return b.label;
    }).join("; "));
  }
  var notes = opts && opts.ownerNotes || [];
  if (notes.length) {
    parts.push("\n--- OWNER EDITORIAL DIRECTIVES (from the publication's editor, authenticated; they outrank the style defaults above, never the FACTS rule or the hard constraints) ---");
    for (var n of notes) parts.push("- " + n);
  }
  var src = opts && opts.source;
  if (src && src.title) {
    parts.push("\n--- SOURCE (name it in the lede: what it is and where it appeared) ---");
    parts.push("kind: " + sourceKind(src));
    parts.push("title: " + String(src.title).slice(0, 200));
    if (src.url) parts.push("link: " + String(src.url).slice(0, 300));
  }
  parts.push("\n--- SIGNAL (the field names and the signal_strength value are internal pipeline metadata: never mention them in the essay) ---");
  parts.push("core_concept: " + friction.core_concept);
  parts.push("friction_point: " + friction.friction_point);
  parts.push("signal_strength: " + friction.signal_strength);
  var art = opts && opts.article || "";
  if (art) {
    parts.push("\n--- LINKED ARTICLE TEXT (source material, may be partial; facts may be taken from it) ---");
    parts.push(String(art).slice(0, 6e3));
  }
  var bg = opts && opts.background || "";
  if (bg) {
    parts.push("\n--- BACKGROUND (verified reference text for context and the wider system; state its facts with attribution, only where they bear on this story) ---");
    parts.push(String(bg).slice(0, BACKGROUND_PROMPT_MAX));
  }
  return parts.join("\n");
}
__name(buildPrompt, "buildPrompt");
var COMPOSE_MODELS = [
  "@cf/moonshotai/kimi-k2.6",
  "@cf/nvidia/nemotron-3-120b-a12b",
  "@cf/openai/gpt-oss-120b"
];
var COMPOSE_MAX_TOKENS = 8e3;
var COMPOSE_MODELS_AT_CAP = [
  "@cf/nvidia/nemotron-3-120b-a12b",
  "@cf/openai/gpt-oss-120b",
  "@cf/moonshotai/kimi-k2.6"
];
async function composeOrder(env) {
  if (!env || !env.AUDIT) return COMPOSE_MODELS;
  try {
    var b = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM fleet_budget WHERE node_class IN ('ai_spend:workers-ai', 'ai_spend:total') AND current > cap").first();
    return b && Number(b.n) > 0 ? COMPOSE_MODELS_AT_CAP : COMPOSE_MODELS;
  } catch (e) {
    console.error("q08 composeOrder budget read failed: " + String(e && e.message || e).slice(0, 160));
    return COMPOSE_MODELS_AT_CAP;
  }
}
__name(composeOrder, "composeOrder");
var TEMP_KEY = "q08_compose_temperature";
var TEMP_DEFAULT = 0.65;
function parseTemperature(v) {
  var n = Number(String(v == null ? "" : v).trim());
  if (!String(v == null ? "" : v).trim() || !isFinite(n)) return TEMP_DEFAULT;
  return Math.min(0.8, Math.max(0.4, n));
}
__name(parseTemperature, "parseTemperature");
async function composeTemperature(env) {
  if (!env || !env.AUDIT) return TEMP_DEFAULT;
  try {
    var r = await env.AUDIT.prepare("SELECT value FROM ops_config WHERE key = ?1").bind(TEMP_KEY).first();
    return parseTemperature(r && r.value);
  } catch (e) {
    return TEMP_DEFAULT;
  }
}
__name(composeTemperature, "composeTemperature");
async function compose(env, prompt, banned, order, xform, opts) {
  var temperature = await composeTemperature(env);
  var lastErr;
  var best = null, trail = [];
  for (var modelId of order || await composeOrder(env)) {
    try {
      var resp = await env.AI.run(modelId, Object.assign({
        messages: [{ role: "user", content: prompt }],
        max_tokens: COMPOSE_MAX_TOKENS,
        temperature
      }, factCheckExtra(modelId)), { signal: AbortSignal.timeout(15e4) });
      var text = aiReplyText(resp);
      if (!text || text.length <= 200) {
        trail.push({ model: modelId, problems: ["empty or short reply (" + String(text || "").length + " chars)"] });
        continue;
      }
      var xr = xform ? xform(text) : null;
      var norm = normalizeDraft(xr ? xr.text : text);
      var g = gate(norm, banned);
      var allProblems = g.problems.concat(xr && xr.problems || []);
      trail.push({ model: modelId, problems: allProblems, chars: norm.length });
      if (!allProblems.length) return { text: norm, model: modelId, extra: xr ? xr.extra : void 0, trail };
      if (opts && opts.titleRepair && titleOnlyProblems(allProblems)) {
        var titled = null, tErr = "";
        try {
          titled = await titleMicroCall(env, modelId, norm);
        } catch (eT) {
          tErr = String(eT && eT.message || eT).slice(0, 160);
          console.error(JSON.stringify({ evt: "q08-signal-engine:titleMicroCall:caught", model: modelId, error: tErr }));
        }
        if (titled && titled.reply !== void 0) {
          trail.push({ model: modelId, problems: ["title repair: no title line in the reply: " + String(titled.reply).replace(/\s+/g, " ").slice(0, 120)], chars: norm.length });
          titled = null;
        } else if (!titled) trail.push({ model: modelId, problems: ["title repair failed: " + (tErr || "no reply")], chars: norm.length });
        if (titled) {
          var xr2 = xform ? xform(titled) : null, norm2 = normalizeDraft(xr2 ? xr2.text : titled);
          var p2 = gate(norm2, banned).problems.concat(xr2 && xr2.problems || []);
          trail.push({ model: modelId, problems: p2.length ? ["title repair: " + p2.join("; ")] : [], chars: norm2.length, note: "title repaired (was: " + allProblems.join("; ").slice(0, 160) + ")" });
          if (!p2.length) return { text: norm2, model: modelId, extra: xr2 ? xr2.extra : void 0, trail };
        }
      }
      if (!best || norm.length > best.text.length) best = { text: norm, model: modelId, problems: allProblems, extra: xr ? xr.extra : void 0 };
    } catch (e) {
      lastErr = e;
      trail.push({ model: modelId, problems: ["error: " + String(e && e.message || e).slice(0, 160)] });
    }
  }
  if (best) {
    best.trail = trail;
    return best;
  }
  throw new Error("all compose models failed: " + String(lastErr && lastErr.message || lastErr).slice(0, 200));
}
__name(compose, "compose");
var TITLE_REPAIR_ON = { titleRepair: true };
function titleOnlyProblems(problems) {
  return (problems || []).length > 0 && problems.every(function(p) {
    return /title/i.test(p) && !/^too short/i.test(p) && !/self-verdict/i.test(p);
  });
}
__name(titleOnlyProblems, "titleOnlyProblems");
var TITLE_REPAIR_PROMPT = "Here is an essay that passed every editorial check except its title. Write a new title for it: one plain sentence in sentence case (capitalise only the first word and names), at most 90 characters, that states what the essay argues about its subject. Use only names that appear in the essay. Output exactly one line, nothing else, in this form:\n# <title>";
async function titleMicroCall(env, modelId, essay) {
  var body = String(essay || "").replace(/^#\s+.+$/m, "").trim();
  var resp = await env.AI.run(modelId, Object.assign({ messages: [{ role: "user", content: TITLE_REPAIR_PROMPT + "\n--- ESSAY ---\n" + body.slice(0, 6e3) + "\n--- END ---" }], max_tokens: 400, temperature: 0.3 }, factCheckExtra(modelId)), { signal: AbortSignal.timeout(6e4) });
  var reply = aiReplyText(resp), line = titleLineOf(reply);
  if (!line) return { reply: String(reply || "") };
  return /^#\s+.+$/m.test(String(essay)) ? String(essay).replace(/^#\s+.+$/m, line) : line + "\n\n" + String(essay).replace(/^\s+/, "");
}
__name(titleMicroCall, "titleMicroCall");
function titleLineOf(reply) {
  var lines = String(reply || "").replace(/<think>[\s\S]*?<\/think>/gi, "").split("\n").map(function(x) {
    return x.trim();
  }).filter(function(x) {
    return x && !/^```/.test(x);
  });
  var cands = lines.filter(function(x) {
    return !/:\s*$/.test(x) && !/^(here|sure|certainly|okay|ok)\b/i.test(x);
  });
  var h = lines.filter(function(x) {
    return /^#\s+\S/.test(x);
  })[0] || lines.filter(function(x) {
    return /^[*_]*title[*_]*\s*:/i.test(x);
  }).map(function(x) {
    return x.replace(/^[*_]*title[*_]*\s*:\s*/i, "");
  })[0] || (cands.length === 1 ? cands[0] : "");
  var t = h.replace(/^#+\s*/, "").replace(/^(?:title\s*:\s*)/i, "").replace(/^[*_"\u201c\u2018']+|[*_"\u201d\u2019']+$/g, "").trim();
  return t && t.length <= 100 && t.indexOf("\n") < 0 ? "# " + t : null;
}
__name(titleLineOf, "titleLineOf");
var BANNED_BABBLE = [
  "digital transformation",
  "operational excellence",
  "strategic alignment",
  "moving forward",
  "going forward",
  "at the end of the day",
  "circle back",
  "key takeaways",
  "lessons learned",
  "best practices",
  "thought leadership",
  "game changer",
  "synergies"
];
var BANNED_BABBLE_RE = new RegExp(BANNED_BABBLE.map(function(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}).join("|"), "i");
var BANNED_HANDLES = /@\w+/g;
var BAD_TITLE_RE = /^(an? |the )?(analysis|critique|examination|exploration|overview|review|understanding|study|assessment|investigation) of /i;
var TITLE_FORMULA_RE = /^when .+ meets .+$/i;
var TITLE_COLON_RE = /: the (hidden|invisible|unseen|silent|quiet) /i;
var BANNED_H2_RE = /^#+\s+(how the flaw manifests|cascading failures|a minimal (alternative|framework|approach)|connections across disciplines|echoes from the past|a path forward|the lens restored|lessons for the future|the pattern across disciplines|unexpected parallels|the broader lesson)\b/i;
var FORMULA_H2_RE = /^#+\s+the (hidden|invisible|unseen|unspoken|silent|quiet) (lever|bottleneck|premise|flaw|cost|gear|engine|handoff|mismatch)\b/i;
var STOCK_PROPS_RE = /\b(telescopes?|galileo|alchem|philosopher.s stone|sonar|aperture|aerospace redundancy)\b/i;
var SOFT_REGISTER_RE = /\b(expectation gap|collective anxiety|vibe|democratiz\w*|future-proof|self-sustaining|path forward|healthy ecosystem|walks farther|ecosystem of)\b/i;
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
function stripHandles(text) {
  return String(text).replace(/(^|[^\w.@\/])@([A-Za-z_]\w*)(?![\w\/])/g, function(m, pre, h) {
    return h.toLowerCase() === "cf" ? m : pre + h;
  });
}
__name(stripHandles, "stripHandles");
var LEDE_SPLIT_WORDS = 70;
function splitLongLede(text) {
  var t = String(text || ""), parts = t.split(/\n{2,}/), idx = -1;
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (!p || /^#/.test(p) || /^(worth your time:|FORECAST-JSON:)/i.test(p)) continue;
    idx = i;
    break;
  }
  if (idx < 0) return t;
  var words = /* @__PURE__ */ __name(function(x) {
    return String(x).split(/\s+/).filter(Boolean).length;
  }, "words");
  if (words(parts[idx]) <= LEDE_MAX_WORDS) return t;
  var sents = parts[idx].trim().split(/(?<=[.!?]["\u201d\u2019)]?)\s+(?=[A-Z0-9"\u201c])/);
  if (sents.length < 2 || words(sents[0]) > LEDE_MAX_WORDS) return t;
  var lede = [sents[0]], n = words(sents[0]), k = 1;
  while (k < sents.length - 1 && n + words(sents[k]) <= LEDE_SPLIT_WORDS) {
    lede.push(sents[k]);
    n += words(sents[k]);
    k++;
  }
  parts.splice(idx, 1, lede.join(" "), sents.slice(k).join(" "));
  return parts.join("\n\n");
}
__name(splitLongLede, "splitLongLede");
function normalizeDraft(text) {
  return text ? normalizeVerdictLine(splitLongLede(normalizeDraftCore(text))) : text;
}
__name(normalizeDraft, "normalizeDraft");
var VERDICT_LOOSE_RE = /^[ \t>*_#-]*worth your time[*_ ]*[:\u2014\u2013-][*_ ]*(yes|flat|no)\b[*_]*\s*[.,:;!\u2014\u2013-]*\s*(\S[^\n]*)$/im;
function normalizeVerdictLine(text) {
  var t = String(text || "");
  if (/worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-]\s*\S[^\n]*$/im.test(t)) return t;
  var m = t.match(VERDICT_LOOSE_RE);
  if (!m) return t;
  return t.replace(m[0], "worth your time: " + m[1].toLowerCase() + " \u2014 " + m[2].replace(/[*_]+$/, "").trim());
}
__name(normalizeVerdictLine, "normalizeVerdictLine");
function verdictOnlyProblem(problems) {
  return (problems || []).length === 1 && /verdict/i.test(problems[0]) && problems[0].indexOf("self-verdict") < 0;
}
__name(verdictOnlyProblem, "verdictOnlyProblem");
async function verdictMicroCall(env, essay) {
  var vp = await compose(env, "Here is an essay that passed all editorial checks.\n--- ESSAY ---\n" + String(essay || "").slice(0, 6e3) + "\n--- END ---\nOutput exactly one line, nothing else, in this form:\nworth your time: yes|flat|no \u2014 one clause of justification\nUse flat only if a reader gains little beyond the source material; use no if the piece is not worth publishing.");
  var vm = normalizeVerdictLine(vp && vp.text || "").match(/worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-]\s*\S[^\n]*$/im);
  return vm ? vm[0] : null;
}
__name(verdictMicroCall, "verdictMicroCall");
function normalizeDraftCore(text) {
  if (!text) return text;
  var t = stripHandles(String(text).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"));
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
__name(normalizeDraftCore, "normalizeDraftCore");
function gate(text, banned) {
  var problems = [];
  var body = text.toLowerCase();
  if (text.length < 2800) problems.push("too short (" + text.length + " chars; 450-1100 words required)");
  var titleMatch = text.match(/^#\s+(.+)$/m);
  var title = titleMatch ? titleMatch[1].trim().replace(/[\u2010-\u2015\u2212]/g, "-") : "";
  if (!title) problems.push("no H1 title");
  else if (BAD_TITLE_RE.test(title)) problems.push("dry/abstract title '" + title.slice(0, 60) + "'");
  else if (title.length > 100) problems.push("title too long");
  var handles = (text.match(BANNED_HANDLES) || []).filter(function(h) {
    return h !== "@cf";
  });
  if (handles.length > 0) problems.push("handles: " + handles.slice(0, 3).join(", "));
  for (var phrase of BANNED_BABBLE) {
    if (body.includes(phrase)) {
      problems.push("management-babble: '" + phrase + "'");
      break;
    }
  }
  for (var hl of text.split("\n")) {
    var ht = hl.trim();
    if (BANNED_H2_RE.test(ht)) {
      problems.push("banned section header: '" + ht.slice(0, 50) + "'");
      break;
    }
    if (FORMULA_H2_RE.test(ht)) {
      problems.push("formula section header: '" + ht.slice(0, 50) + "'");
      break;
    }
  }
  if (TITLE_FORMULA_RE.test(title)) problems.push("formula title 'When X Meets Y'");
  else if (TITLE_COLON_RE.test(title)) problems.push("formula title 'X: The Hidden Z'");
  var sp = body.match(STOCK_PROPS_RE);
  if (sp) problems.push("stock analogy prop: '" + sp[1] + "'");
  var sr = body.match(SOFT_REGISTER_RE);
  if (sr) problems.push("soft register: '" + sr[1] + "'");
  var sf = text.match(STOCK_FRAMING_RE);
  if (sf) problems.push("stock framing tell: '" + sf[0].replace(/\s+/g, " ").slice(0, 80) + "' \u2014 name the mechanism, do not summarise the essay's significance");
  var absN = (text.match(ABSTRACT_SUMMARY_RE) || []).length;
  var lp = text.match(LABEL_PHRASE_RE);
  if (lp && lp.length >= 2) problems.push("abstraction labels x" + lp.length + " ('" + lp.slice(0, 3).join("', '") + "') - state the mechanisms instead of labelling them");
  if (absN >= 3) problems.push("abstraction-summary phrases x" + absN + " (e.g. 'structural dynamic') \u2014 state the mechanism instead of labelling it");
  var sentenceCase = title.split(/\s+/).filter(Boolean).length >= 5 && title.split(/\s+/).slice(1).every(function(w) {
    return !/^[A-Z]/.test(w);
  });
  for (var lt of LABEL_TITLE_RES) {
    if (sentenceCase && lt === LABEL_TITLE_RES[4]) continue;
    if (lt.test(title)) {
      problems.push("label title \u2014 names a category, not a mechanism: '" + title.slice(0, 60) + "'");
      break;
    }
  }
  var tw = title.split(/\s+/).filter(Boolean);
  if (tw.length >= 4 && tw.filter(function(w) {
    return /^[A-Z]/.test(w);
  }).length / tw.length >= 0.75) problems.push("Title Case title reads as a label, not a sentence: '" + title.slice(0, 60) + "'");
  if (/\b(?:signal_strength|friction_point|core_concept)\b|\bsignal strength (?:of|was|is|value)\s+[0-9.]+/i.test(text)) problems.push("pipeline metadata in the essay ('signal_strength', 'friction_point', 'core_concept' or a signal strength value) - open with what happened instead");
  if (banned && banned.length) {
    for (var bp of banned) {
      if (bp.re.test(text)) {
        problems.push("overused precedent on this site: " + bp.label + " - remove it");
        break;
      }
    }
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
  if (lastCh !== "." && lastCh !== "!" && lastCh !== "?" && lastCh !== "\u201D" && lastCh !== "\u2019") problems.push("truncated ending \u2014 essay must end on a full stop");
  return { ok: problems.length === 0, problems };
}
__name(gate, "gate");
async function persistPiece(env, piece, signal, story, model) {
  var salt = Date.now().toString(36) + rnd36(4);
  var slug = utcDay() + "-" + slugify(piece.title || signal.core_concept) + "-" + salt.slice(-6);
  var pieceId = "p-" + salt;
  var titleMatch = piece.text.match(/^#\s+(.+)$/m);
  var title = titleMatch ? titleMatch[1].trim() : signal.core_concept || "Untitled";
  var body = piece.text.replace(/^#\s+.+\n?/, "").trim();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO signal_log (id, source, source_id, title, url, points, num_comments, ratio, volatility_score, friction_point, signal_strength, status, processed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(
    "sig-" + salt,
    story.source || "hn",
    (story.source || "hn") + ":" + String(story.id || ""),
    story.title,
    story.url,
    story.points,
    story.num_comments,
    story.ratio,
    story.volatility_score,
    signal.friction_point,
    signal.signal_strength,
    "published",
    nowIso()
  ).run();
  await env.DB.prepare(
    "INSERT INTO published_pieces (id, signal_id, slug, title, body_md, core_concept, signal_source, published_at, sources_json) VALUES (?,?,?,?,?,?,?,?,?)"
  ).bind(
    pieceId,
    "sig-" + salt,
    slug,
    title,
    body,
    signal.core_concept,
    (story.source || "hn") + ":" + story.id,
    nowIso(),
    JSON.stringify(buildSources(story))
  ).run();
  var fx = story.source === "q08" && piece.extra ? piece.extra : null;
  if (fx) {
    await ensureForecastSchema(env);
    await env.DB.prepare("UPDATE published_pieces SET kind = 'forecast' WHERE id = ?").bind(pieceId).run();
    var fAlts = (fx.alternatives || []).map(function(a) {
      return { claim: String(a.claim || "").trim().slice(0, 300), probability: Math.round(Number(a.probability) * 100) / 100 };
    });
    var fInd = (fx.indicators || []).map(function(x) {
      return String(x).trim().slice(0, 200);
    });
    var fUrls = (fx.watch_urls || []).map(publicHttpsUrl).filter(Boolean);
    await env.DB.prepare("INSERT INTO q08_forecasts (piece_id, slug, source_slug, claim, probability, horizon, resolution, watch_query, watch_urls, alternatives_json, indicators_json, created_at, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'open')").bind(pieceId, slug, String(story.slug || ""), String(fx.claim).trim().slice(0, 300), Math.round(Number(fx.probability) * 100) / 100, String(fx.horizon), String(fx.resolution).trim().slice(0, 400), String(fx.watch_query).trim().slice(0, 80), JSON.stringify(fUrls), JSON.stringify(fAlts), JSON.stringify(fInd), nowIso()).run();
  }
  var skeleton = body.split("\n").filter((l) => l.startsWith("#") || l.startsWith("- ") || l.startsWith("**")).join("\n").slice(0, 800);
  if (skeleton.length < 50) {
    var leadPara = body.split("\n").map((l) => l.trim()).filter((l) => l.length > 40)[0] || "";
    skeleton = (title + "\n" + leadPara.slice(0, 400)).slice(0, 800);
  }
  if (skeleton.length > 50 && !fx) {
    await env.DB.prepare(
      "INSERT INTO prompt_pool (id, piece_id, structure_md, active) VALUES (?,?,?,1)"
    ).bind("pp-" + salt, pieceId, skeleton).run();
  }
  await env.DB.prepare(
    "DELETE FROM prompt_pool WHERE id NOT IN (SELECT id FROM prompt_pool ORDER BY created_at DESC LIMIT 40)"
  ).run().catch(function(e) {
    console.error(JSON.stringify({ evt: "q08-signal-engine:persistPiece:caught", error: String(e && e.message || e) }));
  });
  return { slug, title, pieceId };
}
__name(persistPiece, "persistPiece");
var OWNER_VERDICT_WEIGHT = 3;
async function feedbackScan(env) {
  var rows = await env.DB.prepare(
    "SELECT pp.id, pp.piece_id, pp.structure_md, p.slug, p.reads, (SELECT COUNT(*) FROM q08_feedback f WHERE f.slug = p.slug AND f.created_at >= '2026-10-03T00:00:00Z' AND f.signal = 'good') AS g, (SELECT COUNT(*) FROM q08_feedback f WHERE f.slug = p.slug AND f.created_at >= '2026-10-03T00:00:00Z' AND f.signal IN ('flat','no')) AS b FROM prompt_pool pp JOIN published_pieces p ON p.id = pp.piece_id WHERE pp.active = 1"
  ).all();
  var all = rows.results || [];
  try {
    if (env.AUDIT) {
      var ov = await env.AUDIT.prepare("SELECT slug, signal FROM q08_owner_verdicts").all();
      var ow = {};
      for (var o of ov.results || []) {
        var k = String(o.slug);
        ow[k] = ow[k] || { g: 0, b: 0 };
        if (o.signal === "good") ow[k].g++;
        else if (o.signal === "flat" || o.signal === "no") ow[k].b++;
      }
      for (var ar of all) {
        var w = ow[String(ar.slug)];
        if (w) {
          ar.g = (Number(ar.g) || 0) + w.g * OWNER_VERDICT_WEIGHT;
          ar.b = (Number(ar.b) || 0) + w.b * OWNER_VERDICT_WEIGHT;
        }
      }
    }
  } catch (e) {
    console.error(JSON.stringify({ evt: "q08-signal-engine:feedbackScan:caught", error: String(e && e.message || e) }));
  }
  var promoted = 0, purged = 0;
  for (var r of all) {
    var g = Number(r.g) || 0, b = Number(r.b) || 0;
    if (g + b > 0) {
      await env.DB.prepare("UPDATE published_pieces SET feedback_score = ? WHERE slug = ?").bind(g / (g + b), r.slug).run().catch(function(e) {
        console.error(JSON.stringify({ evt: "q08-signal-engine:feedbackScan:caught", error: String(e && e.message || e) }));
      });
    }
  }
  if (all.length < 4) return { promoted, purged };
  function readerScore(r2) {
    var g2 = Number(r2.g) || 0, b2 = Number(r2.b) || 0;
    return g2 + b2 > 0 ? g2 / (g2 + b2) : 0;
  }
  __name(readerScore, "readerScore");
  var sampled = all.filter(function(r2) {
    return (Number(r2.g) || 0) + (Number(r2.b) || 0) >= 3;
  });
  sampled.sort(function(x, y) {
    return readerScore(y) - readerScore(x) || (Number(y.g) || 0) - (Number(x.g) || 0);
  });
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
  return { promoted, purged };
}
__name(feedbackScan, "feedbackScan");
async function emitContentSignal(env, piece, saved) {
  try {
    if (!env.AUDIT) return;
    var bodyText = String(piece.text || "").replace(/\n?worth your time:[\s\S]*$/im, "").trim();
    var paras = bodyText.split("\n").map(function(l) {
      return l.trim();
    }).filter(function(l) {
      return l.length > 80;
    });
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
  }
}
__name(emitContentSignal, "emitContentSignal");
var PHRASE_LEVEL_RE = /^(?:stock framing tell|abstraction labels|abstraction-summary phrases|soft register|Title Case title|label title|management-babble|stock analogy prop|dry\/abstract title|formula title)/;
function phraseLevelOnly(problems) {
  return !!(problems && problems.length && problems.every(function(p) {
    return PHRASE_LEVEL_RE.test(String(p));
  }));
}
__name(phraseLevelOnly, "phraseLevelOnly");
function splitSentences(para) {
  return String(para || "").split(/(?<=[.!?]["\u201d\u2019)]?)\s+(?=["\u201c(]?[A-Z])/);
}
__name(splitSentences, "splitSentences");
function problemsWithSentences(draft, problems) {
  var sents = [];
  String(draft || "").split(/\n+/).forEach(function(l) {
    if (!/^\s*#/.test(l) && !/^\s*(FORECAST-JSON:|worth your time:)/i.test(l)) sents = sents.concat(splitSentences(l));
  });
  return (problems || []).map(function(p) {
    var q = String(p).match(/'([^']{3,})'/);
    if (!q) return p;
    var needle = q[1].toLowerCase().replace(/\s+/g, " "), hit = null;
    for (var i = 0; i < sents.length && !hit; i++) {
      if (sents[i].toLowerCase().replace(/\s+/g, " ").indexOf(needle) >= 0) hit = sents[i];
    }
    return hit ? p + ' [in the sentence: "' + hit.replace(/\s+/g, " ").trim().slice(0, 240) + '"]' : p;
  });
}
__name(problemsWithSentences, "problemsWithSentences");
function retryPromptFor(prompt, draft, problems, floor) {
  var list = (problems || []).join("; ");
  if (phraseLevelOnly(problems) && draft && draft.length >= (floor || 2800)) {
    return prompt + "\n\n--- REVISION: your draft below was rejected only for these phrases: " + problemsWithSentences(draft, problems).join("; ") + ". Return the SAME essay with only those sentences and, if named, the title rewritten so that each names the concrete mechanism (who does what, which information is missing, where it breaks) in plain words. Keep every other sentence, the facts, the structure, the length and the final 'worth your time' line exactly as they are. Output the full essay, starting with its '# ' H1 title line, and nothing else. ---\n\n" + draft;
  }
  return prompt + "\n\n--- CORRECTIVE FEEDBACK: your previous draft was rejected. Rewrite the ENTIRE essay from scratch with a completely different structure \u2014 continuous prose, no '##' section headers, but KEEP exactly one '# ' H1 title line as the FIRST line of the essay \u2014 fixing only these issues ---\n" + list;
}
__name(retryPromptFor, "retryPromptFor");
var FRAMING_REPAIR_MAX_SHARE = 0.25;
function framingTellMatchers(problems) {
  var matchers = [], unrepairable = [];
  (problems || []).forEach(function(p) {
    var s = String(p);
    if (/^stock framing tell/.test(s)) matchers.push(STOCK_FRAMING_RE);
    else if (/^soft register/.test(s)) matchers.push(SOFT_REGISTER_RE);
    else if (/^stock analogy prop/.test(s)) matchers.push(STOCK_PROPS_RE);
    else if (/^abstraction labels/.test(s)) matchers.push(LABEL_PHRASE_RE);
    else if (/^abstraction-summary phrases/.test(s)) matchers.push(ABSTRACT_SUMMARY_RE);
    else if (/^management-babble/.test(s)) matchers.push(BANNED_BABBLE_RE);
    else unrepairable.push(s);
  });
  return { matchers, unrepairable };
}
__name(framingTellMatchers, "framingTellMatchers");
function framingRepair(text, problems, gateFn) {
  if (!phraseLevelOnly(problems)) return null;
  var m = framingTellMatchers(problems);
  if (m.unrepairable.length || !m.matchers.length) return { accepted: false, text, removed: [], total: 0, reason: "not a body-sentence problem: " + String(m.unrepairable[0] || "").slice(0, 80) };
  var removed = [], keep = [], total = 0;
  String(text).split(/\n{2,}/).forEach(function(para) {
    var head = "";
    if (/^\s*#/.test(para)) {
      var nl = para.indexOf("\n");
      if (nl < 0) {
        keep.push(para);
        return;
      }
      head = para.slice(0, nl + 1);
      para = para.slice(nl + 1);
    }
    if (/^\s*(FORECAST-JSON:|worth your time:)/i.test(para)) {
      keep.push(head + para);
      return;
    }
    var out = [];
    splitSentences(para).forEach(function(sn) {
      if (!sn.trim()) return;
      total++;
      var hit = false;
      for (var i = 0; i < m.matchers.length && !hit; i++) hit = sn.search(m.matchers[i]) >= 0;
      if (hit) removed.push(sn.replace(/\s+/g, " ").trim().slice(0, 160));
      else out.push(sn);
    });
    if (out.length) keep.push(head + out.join(" "));
    else if (head) keep.push(head.trim());
  });
  if (!removed.length) return { accepted: false, text, removed: [], total, reason: "no body sentence holds the flagged phrase" };
  var cap = Math.floor(total * FRAMING_REPAIR_MAX_SHARE);
  if (removed.length > cap) return { accepted: false, text, removed, total, reason: "removing " + removed.length + " of " + total + " sentences is over the quarter cap (" + cap + ")" };
  var repaired = keep.join("\n\n");
  var rest = gateFn(repaired) || [];
  if (rest.length) return { accepted: false, text, removed, total, reason: "the repaired draft still fails the gate: " + rest.slice(0, 2).join("; ").slice(0, 200) };
  return { accepted: true, text: repaired, removed, total, reason: "" };
}
__name(framingRepair, "framingRepair");
function framingRepairRow(fr, stage) {
  return { round: 0, role: "framing_repair", model: "", family: "", would_read: false, score: null, tells: (fr.removed || []).slice(0, 5), fix: ("FRAMING-REPAIR-1 " + stage + ": removed " + (fr.removed || []).length + " of " + fr.total + " sentences; " + (fr.accepted ? "accepted, gate passed" : "not accepted: " + fr.reason)).slice(0, 300), pass: !!fr.accepted };
}
__name(framingRepairRow, "framingRepairRow");
function framingRepairNote(fr, stage) {
  return stage + " " + (fr.accepted ? "removed " + fr.removed.length + " of " + fr.total + " sentences" : fr.reason);
}
__name(framingRepairNote, "framingRepairNote");
var VERDICT_LINE_RE = /^[ \t]*worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-]\s*\S[^\n]*$/im;
function carryVerdictLine(edited, original) {
  var t = String(edited || "");
  if (VERDICT_LINE_RE.test(t)) return t;
  var m = String(original || "").match(VERDICT_LINE_RE);
  if (!m) return t;
  return t.replace(/\n?[ \t]*worth your time:[^\n]*$/im, "").replace(/\s+$/, "") + "\n\n" + m[0].trim();
}
__name(carryVerdictLine, "carryVerdictLine");
function titleProblem(title) {
  if (!title || BAD_TITLE_RE.test(title) || title.length > 100) return true;
  return gate("# " + title + "\n\nx", []).problems.some(function(p) {
    return /title/i.test(p) && !/^too short/.test(p);
  });
}
__name(titleProblem, "titleProblem");
function h1Of(text) {
  var m = String(text || "").match(/^#\s+(.+)$/m);
  return m ? m[1].trim().replace(/[\u2010-\u2015\u2212]/g, "-") : "";
}
__name(h1Of, "h1Of");
function carryTitle(edited, original) {
  var t = String(edited || "");
  if (!titleProblem(h1Of(t))) return t;
  var om = String(original || "").match(/^#\s+(.+)$/m);
  if (!om || titleProblem(h1Of(original))) return t;
  return /^#\s+.+$/m.test(t) ? t.replace(/^#\s+.+$/m, om[0].trim()) : om[0].trim() + "\n\n" + t.replace(/^\s+/, "");
}
__name(carryTitle, "carryTitle");
function carryFormat(edited, original) {
  return carryTitle(carryVerdictLine(edited, original), original);
}
__name(carryFormat, "carryFormat");
var CUT_NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
function cutNum(w) {
  w = String(w || "").toLowerCase();
  return /^\d{1,2}$/.test(w) ? Number(w) : CUT_NUMW[w] || 0;
}
__name(cutNum, "cutNum");
function readerCutIndices(fix, n) {
  var out = {}, f = String(fix || ""), re = /\b(?:delete|cut|remove|drop)\b([^.|;]{0,160})/gi, m;
  while (m = re.exec(f)) {
    var seg = m[1];
    var l = seg.match(/\b(?:the )?(?:final|last|closing)\s+(?:(\w+)\s+)?paragraphs?\b/i);
    if (l) {
      var k = l[1] ? cutNum(l[1]) : 1;
      for (var i = n - k; k && i < n; i++) if (i >= 0) out[i] = 1;
    }
    var pm = seg.match(/\bparagraphs?\s+(\w+(?:\s*(?:,\s*and|,|and|through|to|-|\u2013)\s*\w+)*)/i);
    if (pm) {
      var toks = pm[1].split(/\s*(?:,\s*and|,|\band\b)\s*/);
      for (var t = 0; t < toks.length; t++) {
        var rg = toks[t].match(/^(\w+)\s*(?:through|to|-|\u2013)\s*(\w+)$/i);
        if (rg) {
          var a = cutNum(rg[1]), b = cutNum(rg[2]);
          if (!a || !b || b < a) break;
          for (var j = a; j <= b; j++) out[j - 1] = 1;
          continue;
        }
        var v = cutNum(toks[t]);
        if (!v) break;
        out[v - 1] = 1;
      }
    }
  }
  return Object.keys(out).map(Number).filter(function(i2) {
    return i2 >= 0 && i2 < n;
  }).sort(function(x, y) {
    return x - y;
  });
}
__name(readerCutIndices, "readerCutIndices");
function applyReaderCuts(text, fix) {
  var parts = String(text || "").split(/\n{2,}/), body = [];
  parts.forEach(function(p, i) {
    if (!/^\s*#\s/.test(p) && !/^\s*(FORECAST-JSON:|worth your time:)/i.test(p) && !ANALYSIS_MARK_RE.test(p) && p.trim()) body.push(i);
  });
  var cut = readerCutIndices(fix, body.length).filter(function(c) {
    return c !== 0;
  });
  if (!cut.length || cut.length > Math.floor(body.length / 2)) return null;
  var drop = {};
  cut.forEach(function(c) {
    drop[body[c]] = 1;
  });
  return { text: parts.filter(function(p, i) {
    return !drop[i];
  }).join("\n\n"), cut: cut.map(function(c) {
    return c + 1;
  }) };
}
__name(applyReaderCuts, "applyReaderCuts");
async function runLevels(env, a) {
  var piece = a.piece, gateResult = a.gateResult, banned = a.banned, rows = [];
  if (!gateResult.ok) return { piece, gateResult, rows };
  var writerFam = familyOf(piece.model);
  var seed = seedOf(a.seedText);
  var p1 = await panelRead(env, piece.text, [writerFam], seed, 2, a.readerPrompt);
  if (!p1) {
    rows.push({ round: 1, role: "panel_unavailable", model: "", family: "", pass: 1 });
    return { piece, gateResult, rows };
  }
  rows = rows.concat(panelRows(p1, 1));
  if (p1.pass) return { piece, gateResult, rows };
  var editOrder = COMPOSE_MODELS.filter(function(m) {
    return familyOf(m) !== writerFam;
  }).concat(COMPOSE_MODELS.filter(function(m) {
    return familyOf(m) === writerFam;
  }));
  var edPrompt = a.prompt + "\n\n--- EDITOR PASS: below is a draft by another writer. Two independent readers from different model families would not read it to the end (mean score " + p1.mean + " of 5). What they said to fix: " + p1.fix + (p1.tells.length ? " Phrases they flagged as generic machine prose: " + p1.tells.join(" | ") + "." : "") + " Edit it, do not start over: keep every fact and the same case, keep the title line first and the verdict line last, keep the first paragraph as the news lede (who did what, where it appeared, why it matters; at most 70 words), keep the line <!-- analysis --> on its own line where the analysis starts, replace abstractions with people doing things, vary sentence length, cut anything that only restates. Use only facts already in the draft or in the source material above: delete instead of adding, and never introduce a new name, date, figure, quotation or example to make a paragraph more concrete. Cut what the readers asked you to cut, even when the essay gets shorter: keep it at least " + (a.forecast ? 2800 : EDIT_FLOOR) + " characters and never pad it back. Return the full edited essay. " + (a.forecast ? "This is a forecast: keep every probability, the horizon, and the whole FORECAST-JSON line exactly as in the draft, and keep the verdict line last. " : "") + FRAMING_RULE + " ---\n\n--- DRAFT ---\n" + (a.forecast ? piece.text + "\nFORECAST-JSON: " + JSON.stringify(piece.extra || {}) : piece.text);
  var ed = null;
  var rc1 = a.forecast ? null : applyReaderCuts(piece.text, p1.fix);
  if (rc1 && !editGateProblems(rc1.text, banned, false).length) {
    ed = { text: rc1.text, model: piece.model, extra: piece.extra };
    rows.push({ round: 2, role: "reader_cuts", model: "", family: "", pass: 1, fix: "Q08-READER-CUTS-1: deleted paragraphs " + rc1.cut.join(", ") });
  } else {
    try {
      ed = await compose(env, edPrompt, banned, editOrder, a.xform);
    } catch (e) {
      ed = null;
    }
  }
  if (ed && a.forecast && !ed.extra && piece.extra) ed.extra = piece.extra;
  if (ed && ed.text) ed.text = carryFormat(ed.text, piece.text);
  if (ed && ed.text && !a.forecast) {
    var edProblems = editGateProblems(ed.text, banned, a.forecast);
    if (edProblems.length && phraseLevelOnly(edProblems) && ed.text.length >= EDIT_FLOOR) {
      var edFr = framingRepair(ed.text, edProblems, function(t) {
        return editGateProblems(t, banned, a.forecast);
      });
      if (edFr) rows.push(framingRepairRow(edFr, "editor"));
      if (edFr && edFr.accepted) ed = { text: edFr.text, model: ed.model, extra: ed.extra, repaired: edFr.removed.length };
      else {
        var ed2 = null;
        try {
          ed2 = await compose(env, retryPromptFor(a.prompt, ed.text, edProblems, EDIT_FLOOR), banned, editOrder, a.xform);
        } catch (e) {
          ed2 = null;
        }
        if (ed2 && ed2.text) ed2.text = carryFormat(ed2.text, piece.text);
        if (ed2 && ed2.text && !editGateProblems(ed2.text, banned, a.forecast).length) ed = ed2;
      }
    }
  }
  var edOk = !!(ed && ed.text && !editGateProblems(ed.text, banned, a.forecast).length && (!a.forecast || validateForecast(ed.extra, ed.text, Date.now()).length === 0));
  if (!edOk) return { piece, gateResult: { ok: false, problems: ["ensemble: the editor's draft failed the gate (" + (ed && ed.text ? editGateProblems(ed.text, banned, a.forecast).slice(0, 3).join("; ").slice(0, 200) : "no editor draft") + ") - " + (p1.fix || "no fix given")] }, rows };
  var edFam = familyOf(ed.model);
  var usedFam = [writerFam, edFam].concat(p1.judges.map(function(j) {
    return j.family;
  }));
  var p2 = await panelRead(env, ed.text, usedFam, seed + 1, 2, a.readerPrompt);
  if (!p2) p2 = await panelRead(env, ed.text, [writerFam, edFam], seed + 1, 2, a.readerPrompt);
  if (p2) rows = rows.concat(panelRows(p2, 2));
  else rows.push({ round: 2, role: "panel_unavailable", model: "", family: "", pass: 1 });
  rows.push({ round: 2, role: "editor", model: ed.model, family: edFam, pass: p2 ? p2.pass : true });
  if (!p2 || p2.pass) return { piece: ed, gateResult, rows };
  if (!a.forecast && p2.mean >= CLOSE_MISS_MEAN && p2.fix) {
    var ed3 = null;
    var rc2 = applyReaderCuts(ed.text, p2.fix);
    if (rc2 && !editGateProblems(rc2.text, banned, false).length) {
      ed3 = { text: rc2.text, model: ed.model, extra: ed.extra };
      rows.push({ round: 3, role: "reader_cuts", model: "", family: "", pass: 1, fix: "Q08-READER-CUTS-1: deleted paragraphs " + rc2.cut.join(", ") });
    } else try {
      ed3 = await compose(env, a.prompt + "\n\n--- EDITOR PASS 2: below is an edited draft. Two fresh readers scored it " + p2.mean + " of 5. Apply exactly what they asked: " + p2.fix + (p2.tells.length ? " Phrases they flagged as generic machine prose: " + p2.tells.join(" | ") + "." : "") + " Delete and reorder; never add a name, date, figure, quotation or example that is not already in the draft or the source material above. Keep the title line first and the verdict line last, keep it at least " + EDIT_FLOOR + " characters, and return the full essay. " + FRAMING_RULE + " ---\n\n--- DRAFT ---\n" + ed.text, banned, editOrder, a.xform);
    } catch (e) {
      ed3 = null;
    }
    if (ed3 && ed3.text) ed3.text = carryFormat(ed3.text, ed.text);
    if (ed3 && ed3.text && !editGateProblems(ed3.text, banned, false).length) {
      var p3 = await panelRead(env, ed3.text, [writerFam, familyOf(ed3.model)], seed + 2, 2, a.readerPrompt);
      if (p3) rows = rows.concat(panelRows(p3, 3));
      else rows.push({ round: 3, role: "panel_unavailable", model: "", family: "", pass: 1 });
      rows.push({ round: 3, role: "editor", model: ed3.model, family: familyOf(ed3.model), pass: p3 ? p3.pass : true });
      if (!p3 || p3.pass) return { piece: ed3, gateResult, rows };
      p2 = p3;
    }
  }
  return { piece, gateResult: { ok: false, problems: ["ensemble: the edited draft was still not worth reading (panel mean " + p2.mean + " of 5) - " + (p2.fix || "no fix given")] }, rows };
}
__name(runLevels, "runLevels");
var CLOSE_MISS_MEAN = 3;
var PUBLISH_MIN_CHARS = 2800;
var FINAL_PASS_MEAN = 4;
var FINAL_READER_PROMPT = [
  "You are an editor deciding whether the essay below is published under your name. You are a busy, intelligent reader who has never heard of this site. Most drafts you see are vacuous: they restate the headline, then wrap it in abstract words ('the loop', 'the coupling', 'the structure', 'the mechanism', 'the dynamic', 'the arrangement') that sound like analysis and say nothing a reader did not already know.",
  "Answer with exactly one JSON object and nothing else:",
  '{"would_read_to_end": true or false, "score": 1 to 5, "slop_tells": [up to 3 short phrases copied from the essay that are vacuous or generic], "fix": "one sentence naming what is missing"}',
  "The bar is the best system-design writing for engineers: after reading, an engineer who missed the story understands how the system involved works (its components and how data or requests flow between them), which design decision or constraint produced the event, and what trade-off it reveals.",
  "Scores: 5 = I learned something non-obvious about how this system works and would send it to a colleague; 4 = a reader who knows only the headline comes away understanding why it happened, in concrete technical terms; 3 = accurate but adds little beyond the headline; 2 = mostly abstract restatement; 1 = empty.",
  "Score at most 2 when: the opening does not say plainly what happened, to whom, and where it was reported; or the piece never names the actual people or organisations and what each wants; or its analysis is abstract nouns instead of who does what and why; or a paragraph exists only to restate the previous one. Score at most 3 when a reader would learn nothing they could not guess from the title. A 4 must be earned with concrete reasoning a newcomer can follow."
].join("\n");
function publishBody(text) {
  return stripAnalysisMark(String(text || "").replace(/\n?worth your time:[^\n]*$/im, "").replace(/^#\s.*$/m, "")).replace(/\s+/g, " ").trim();
}
__name(publishBody, "publishBody");
async function finalRead(env, text, writerModel, seedText) {
  var n = publishBody(text).length;
  if (n < PUBLISH_MIN_CHARS) return { ok: false, rows: [], problems: ["final read: too short to publish (" + n + " chars of body; floor " + PUBLISH_MIN_CHARS + ")"] };
  var p = await panelRead(env, text, [familyOf(writerModel)], seedOf(seedText) + 7, 2, FINAL_READER_PROMPT);
  if (!p) return { ok: false, rows: [{ round: 9, role: "panel_unavailable", model: "", family: "", pass: 0 }], problems: ["final read: no reader verdict (fails closed)"] };
  var ok = p.mean >= FINAL_PASS_MEAN && p.judges.every(function(j) {
    return j.score >= 3;
  });
  var rows = panelRows(p, 9);
  return { ok, rows, mean: p.mean, problems: ok ? [] : ["final read: not worth publishing (panel mean " + p.mean + " of 5, bar " + FINAL_PASS_MEAN + ") - " + (p.fix || "no fix given") + (p.tells.length ? " | vacuous: " + p.tells.join(" | ") : "")] };
}
__name(finalRead, "finalRead");
function labelledGround(story, friction, article, background, ownerNotes) {
  var src = { source: story && story.source || "hn", title: story && story.title || "", url: story && story.url || "" };
  var kind = String(src.source);
  var sigLabel = kind === "github" ? "Repository description and README excerpt" : kind === "arxiv" ? "Paper abstract" : "Hacker News discussion comments on it";
  var parts = ["SOURCE: " + sourceKind(src) + ". Title: " + src.title + (src.url ? ". Link: " + src.url + " (site: " + hostOf(src.url) + ")" : "") + "."];
  if (src.title) parts.push("The item is titled \u201C" + src.title + "\u201D." + (src.url ? " It appeared on " + hostOf(src.url) + ", at " + src.url + "." : ""));
  if (friction && friction.core_concept) parts.push("Topic: " + friction.core_concept);
  if (friction && friction.friction_point) parts.push(sigLabel + ": " + friction.friction_point);
  if (article) parts.push("Linked article text: " + article);
  if (background) parts.push("Background reference text:\n" + background);
  if (ownerNotes && ownerNotes.length) parts.push(ownerNotes.join("\n"));
  return parts.join("\n");
}
__name(labelledGround, "labelledGround");
var SOURCE_RANK = { hn: 0, arxiv: 1, github: 2 };
function orderCandidates(candidates, lastSource) {
  var rank = /* @__PURE__ */ __name(function(c) {
    var r = SOURCE_RANK[c.source || "hn"];
    return r == null ? 1 : r;
  }, "rank");
  var list = (candidates || []).map(function(c, i) {
    return { c, i };
  }).sort(function(a, b) {
    return rank(a.c) - rank(b.c) || a.i - b.i;
  }).map(function(x) {
    return x.c;
  });
  var head = list.filter(function(c) {
    return (c.source || "hn") !== "github";
  });
  var diverse = head.find(function(c) {
    return (c.source || "hn") !== lastSource;
  });
  return diverse ? [diverse].concat(list.filter(function(c) {
    return c !== diverse;
  })) : list;
}
__name(orderCandidates, "orderCandidates");
async function generate(env) {
  var t0 = Date.now();
  async function quit(status, reason, scraped, scored) {
    await env.DB.prepare("INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, top_signal, model, ms, status, error) VALUES (?,?,?,?,?,?,?,?)").bind(scraped || 0, scored || 0, 0, "", "", Date.now() - t0, status, String(reason).slice(0, 500)).run().catch(function(e) {
      console.error(JSON.stringify({ at: "q08.generate.quit", error: String(e && e.message || e).slice(0, 200) }));
    });
    return { ok: false, reason };
  }
  __name(quit, "quit");
  if (!await ensureAccuracySchema(env)) return await quit("skipped", "accuracy schema unavailable (publishing fails closed)");
  var dayCount = await env.DB.prepare(
    "SELECT COUNT(*) n FROM published_pieces WHERE published_at >= ?1"
  ).bind(utcDay() + "T00:00:00.000Z").first();
  var todayN = dayCount && dayCount.n || 0;
  var cap = await dailyCap(env);
  if (todayN >= cap) {
    return await quit("skipped", "daily cap reached (" + todayN + "/" + cap + (cap < MAX_PER_DAY ? ", ops_config " + CAP_KEY : "") + ")");
  }
  var attempts = await env.DB.prepare("SELECT COUNT(*) n FROM engine_runs WHERE ran_at >= datetime('now','start of day') AND status IN ('ok','gate_failed')").first().catch(function() {
    return { n: 0 };
  });
  if ((attempts && attempts.n || 0) >= cap * 4) {
    return await quit("skipped", "daily attempt cap reached (" + attempts.n + "/" + cap * 4 + ")");
  }
  try {
    if (await forecastDue(env)) {
      var fout = await generateForecast(env, t0);
      if (fout) return fout;
      if (Date.now() - t0 > ESSAY_AFTER_FORECAST_MS) return await quit("deferred", "the essay waits for the next tick: the forecast attempt used " + Math.round((Date.now() - t0) / 1e3) + " s of this one");
    }
  } catch (e) {
    console.error("q08 forecast path failed: " + String(e && e.message || e).slice(0, 200));
  }
  var stories = [];
  try {
    stories = stories.concat(await scrapeHN());
  } catch (e) {
    console.error(JSON.stringify({ evt: "q08-signal-engine:quit:caught", error: String(e && e.message || e) }));
  }
  try {
    stories = stories.concat(await scrapeGitHub());
  } catch (e) {
    console.error(JSON.stringify({ evt: "q08-signal-engine:quit:caught", error: String(e && e.message || e) }));
  }
  try {
    stories = stories.concat(await scrapeArxiv());
  } catch (e) {
    console.error(JSON.stringify({ evt: "q08-signal-engine:quit:caught", error: String(e && e.message || e) }));
  }
  if (!stories.length) return await quit("skipped", "no signals scraped");
  var processed = await env.DB.prepare(
    "SELECT source_id FROM signal_log WHERE processed_at >= ?1"
  ).bind(new Date(Date.now() - 7 * 864e5).toISOString()).all();
  var processedIds = new Set((processed.results || []).map((r) => String(r.source_id)));
  var candidates = stories.filter((s) => !processedIds.has(String((s.source || "hn") + ":" + s.id)));
  if (!candidates.length) return await quit("skipped", "all signals already processed in the last 7 days", stories.length, 0);
  var lastRun = await env.DB.prepare("SELECT top_signal FROM engine_runs WHERE top_signal != '' ORDER BY id DESC LIMIT 1").first();
  var lastSource = lastRun ? String(lastRun.top_signal || "").split(":")[0] : "";
  var ordered = orderCandidates(candidates, lastSource);
  var story = null, friction = null, prefetched = null, bestThin = null;
  for (var ci = 0; ci < Math.min(ordered.length, 8); ci++) {
    var cand = ordered[ci];
    var f = null;
    try {
      if ((cand.source || "hn") === "github") f = await extractGitHubFriction(cand.id, cand.description || "");
      else if ((cand.source || "hn") === "arxiv") f = { core_concept: cand.title, friction_point: (String(cand.title || "") + ". " + String(cand.abstract || "")).slice(0, FRICTION_MAX), signal_strength: "Medium" };
      else f = await extractFriction(cand.id);
    } catch (e) {
      f = null;
    }
    if (f && f.friction_point && f.friction_point.length >= 60) {
      var art = await fetchArticleText(articleUrlFor(cand));
      var glen = String(cand.title || "").length + String(f.core_concept || "").length + String(f.friction_point || "").length + art.length;
      if (!bestThin || glen > bestThin.glen) bestThin = { cand, f, art, glen };
      if (glen >= MIN_GROUND_CHARS) {
        story = cand;
        friction = f;
        prefetched = art;
        break;
      }
    }
  }
  var thinOk = bestThin && String(bestThin.art || "").length >= THIN_MIN_ARTICLE;
  if (!story && thinOk) {
    story = bestThin.cand;
    friction = bestThin.f;
    prefetched = bestThin.art;
  }
  if (!story && bestThin && !thinOk) return await quit("skipped", "no candidate with readable full text (the richest, " + String(bestThin.cand && bestThin.cand.title || "").slice(0, 80) + ", has " + String(bestThin.art || "").length + " characters of fetched text)", stories.length, candidates.length);
  if (!story) {
    return await quit("skipped", "no candidate yielded sufficient friction (" + candidates.length + " available)", stories.length, candidates.length);
  }
  var exemplars = await env.DB.prepare(
    "SELECT pp.structure_md FROM prompt_pool pp JOIN published_pieces p ON p.id = pp.piece_id WHERE pp.active = 2 AND p.slug NOT IN (SELECT slug FROM q08_retractions) AND (p.reads > 0 OR p.feedback_score > 0) ORDER BY pp.performance_score DESC, p.feedback_score DESC LIMIT 2"
  ).all();
  var fewShot = (exemplars.results || []).filter(function(r) {
    return exemplarOk(r.structure_md);
  });
  var recentRows = await env.DB.prepare(
    "SELECT structure_md FROM prompt_pool ORDER BY created_at DESC LIMIT 6"
  ).all();
  var recentStructures = (recentRows.results || []).map(function(r) {
    return r.structure_md;
  });
  var recentBodies = await env.DB.prepare("SELECT body_md FROM published_pieces WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at DESC LIMIT 8").all().catch(function() {
    return { results: [] };
  });
  var banned = [];
  var ownerNotes = await ownerDirectives(env);
  var article = prefetched !== null ? prefetched : await fetchArticleText(articleUrlFor(story));
  var srcCtx = { source: story.source || "hn", title: story.title || "", url: story.url || "" };
  var background = await backgroundPack(story);
  var prompt = buildPrompt(friction, fewShot, recentStructures, { banned, ownerNotes, article, source: srcCtx, background });
  function gateW(t) {
    return withLede(gate(t, banned), t, srcCtx);
  }
  __name(gateW, "gateW");
  var piece = await compose(env, prompt, banned, void 0, void 0, TITLE_REPAIR_ON);
  var gateResult = gateW(piece.text);
  var repairRows = [], repairTrail = [];
  (piece.trail || []).forEach(function(t) {
    repairRows.push({ round: 0, role: "compose", model: t.model, family: familyOf(t.model), pass: t.problems.length ? 0 : 1, fix: (t.chars ? t.chars + " chars; " : "") + (t.note ? t.note + "; " : "") + (t.problems.join("; ") || "passed the writer gate").slice(0, 480) });
  });
  function tryFramingRepair(p, problems, stage) {
    var fr = framingRepair(p.text, problems, function(t) {
      return gateW(t).problems;
    });
    if (!fr) return null;
    repairRows.push(framingRepairRow(fr, stage));
    repairTrail.push(framingRepairNote(fr, stage));
    return fr.accepted ? { text: fr.text, model: p.model, extra: p.extra, repaired: fr.removed.length } : null;
  }
  __name(tryFramingRepair, "tryFramingRepair");
  if (!gateResult.ok) {
    var repaired0 = tryFramingRepair(piece, gateResult.problems, "writer");
    if (repaired0) {
      piece = repaired0;
      gateResult = gateW(piece.text);
    }
  }
  if (!gateResult.ok && verdictOnlyProblem(gateResult.problems)) {
    try {
      var v0 = await verdictMicroCall(env, piece.text);
      if (v0) {
        var vt0 = piece.text.replace(/\s*$/, "") + "\n\n" + v0, vg0 = gateW(vt0);
        if (vg0.ok) {
          piece = Object.assign({}, piece, { text: vt0 });
          gateResult = vg0;
        }
      }
    } catch (e) {
      console.error("q08 verdict micro-call failed: " + String(e && e.message || e).slice(0, 200));
    }
  }
  if (!gateResult.ok) {
    var retryPrompt = retryPromptFor(prompt, piece.text, gateResult.problems);
    var retryPiece = null;
    try {
      retryPiece = await compose(env, retryPrompt, banned, void 0, void 0, TITLE_REPAIR_ON);
    } catch (e) {
      retryPiece = null;
    }
    if (retryPiece && retryPiece.text) {
      var retryGate = gateW(retryPiece.text);
      if (retryGate.ok) {
        piece = retryPiece;
        gateResult = retryGate;
      } else if (phraseLevelOnly(retryGate.problems)) {
        var repaired1 = tryFramingRepair(retryPiece, retryGate.problems, "retry");
        if (repaired1) {
          piece = repaired1;
          gateResult = gateW(piece.text);
        }
      } else if (verdictOnlyProblem(retryGate.problems)) {
        try {
          var vm2 = await verdictMicroCall(env, retryPiece.text);
          if (vm2) {
            retryPiece.text = retryPiece.text.replace(/\s*$/, "") + "\n\n" + vm2;
            retryGate = gateW(retryPiece.text);
            if (retryGate.ok) {
              piece = retryPiece;
              gateResult = retryGate;
            }
          }
        } catch (e) {
          console.error(JSON.stringify({ evt: "q08-signal-engine:tryFramingRepair:caught", error: String(e && e.message || e) }));
        }
      }
    }
  }
  var lv = await runLevels(env, { piece, prompt, banned, seedText: story.title || "", gateResult });
  piece = lv.piece;
  gateResult = lv.gateResult;
  var readerRows = repairRows.concat(lv.rows);
  var essayVr = null;
  if (gateResult.ok) {
    var essayGround = labelledGround(story, friction, article, background, ownerNotes);
    var ev = await verifyAndRevise(env, { piece, prompt, banned, ground: essayGround, seedText: String(story.id || story.title || ""), forecast: false, deadline: t0 + TICK_BUDGET_MS, src: srcCtx });
    piece = ev.piece;
    essayVr = ev.vr;
    if (!ev.ok) gateResult = { ok: false, problems: ["accuracy: " + ev.problems.join("; ")] };
    else {
      var fin = await finalRead(env, piece.text, piece.model, String(story.id || story.title || ""));
      readerRows = readerRows.concat(fin.rows);
      if (!fin.ok) gateResult = { ok: false, problems: fin.problems };
    }
  }
  if (!gateResult.ok) {
    await saveReaderTests(env, (story.source || "hn") + ":" + String(story.id || ""), readerRows);
    try {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO signal_log (id, source, source_id, title, url, points, num_comments, ratio, volatility_score, friction_point, signal_strength, status, processed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
      ).bind("sig-" + Date.now().toString(36) + rnd36(4), story.source || "hn", (story.source || "hn") + ":" + String(story.id || ""), story.title, story.url, story.points, story.num_comments, story.ratio, story.volatility_score, friction.friction_point, friction.signal_strength, "gate_failed", nowIso()).run();
    } catch (e) {
      console.error(JSON.stringify({ evt: "q08-signal-engine:tryFramingRepair:caught", error: String(e && e.message || e) }));
    }
    await env.DB.prepare(
      "INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, top_signal, model, ms, status, error) VALUES (?,?,?,?,?,?,?,?)"
    ).bind(stories.length, candidates.length, 0, (story.source || "hn") + ":" + story.title.slice(0, 80), piece.model, Date.now() - t0, "gate_failed", gateResult.problems.join("; ") + (repairTrail.length ? " | framing repair: " + repairTrail.join("; ").slice(0, 300) : "")).run();
    return { ok: false, reason: "gate failed: " + gateResult.problems.join("; ") };
  }
  piece.text = stripAnalysisMark(piece.text.replace(/\n?worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-].*$/im, "").trim());
  var saved = await persistPiece(env, piece, friction, story, piece.model);
  if (essayVr) await recordAudit(env, saved.slug, "pass", "publish", essayVr).catch(function(e) {
    console.error(JSON.stringify({ evt: "q08-signal-engine:tryFramingRepair:caught", error: String(e && e.message || e) }));
  });
  await saveReaderTests(env, saved.slug, readerRows);
  await feedbackScan(env).catch((e) => {
    console.error(JSON.stringify({ evt: "q08-signal-engine:tryFramingRepair:caught", error: String(e && e.message || e) }));
  });
  await queueForDistribution(env, q08Plain(saved.title), saved.slug, null, q08Lede(piece.text || ""));
  pingIndexNow(env, ORIGIN + "/p/" + saved.slug).catch((e) => {
    console.error(JSON.stringify({ evt: "q08-signal-engine:tryFramingRepair:caught", error: String(e && e.message || e) }));
  });
  emitContentSignal(env, piece, saved).catch((e) => {
    console.error(JSON.stringify({ evt: "q08-signal-engine:tryFramingRepair:caught", error: String(e && e.message || e) }));
  });
  await env.DB.prepare(
    "INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, top_signal, model, ms, status) VALUES (?,?,?,?,?,?,?)"
  ).bind(stories.length, candidates.length, 1, (story.source || "hn") + ":" + story.title.slice(0, 80), piece.model, Date.now() - t0, "ok").run();
  return { ok: true, slug: saved.slug, title: saved.title, model: piece.model, source: story.source || "hn", story: story.title };
}
__name(generate, "generate");
var FORECAST_CAP_KEY = "q08_forecast_max_per_day";
var FORECAST_CAP_DEFAULT = 3;
var FORECAST_CAP_MAX = 10;
var FORECAST_EVERY = 3;
var FORECAST_MIN_DAYS = 14;
var FORECAST_MAX_DAYS = 730;
var FORECAST_RECHECK_DAYS = 7;
var FORECAST_MAX_CHECKS = 4;
var __forecastSchemaDone = false;
var __forecastSchemaTried = 0;
async function ensureForecastSchema(env) {
  if (__forecastSchemaDone) return true;
  if (Date.now() - __forecastSchemaTried < 6e4) return false;
  __forecastSchemaTried = Date.now();
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS q08_forecasts (id INTEGER PRIMARY KEY AUTOINCREMENT, piece_id TEXT, slug TEXT UNIQUE, source_slug TEXT, claim TEXT, probability REAL, horizon TEXT, resolution TEXT, watch_query TEXT, watch_urls TEXT, alternatives_json TEXT, indicators_json TEXT, created_at TEXT, status TEXT DEFAULT 'open', outcome INTEGER, brier REAL, checks INTEGER DEFAULT 0, last_check_at TEXT, resolved_at TEXT, disposition TEXT, evidence_json TEXT)").run();
    var info = await env.DB.prepare("PRAGMA table_info(published_pieces)").all();
    var have = {};
    (info.results || []).forEach(function(c) {
      have[c.name] = 1;
    });
    if (!have.kind) {
      try {
        await env.DB.prepare("ALTER TABLE published_pieces ADD COLUMN kind TEXT DEFAULT 'analysis'").run();
      } catch (e2) {
        if (!/duplicate column/i.test(String(e2 && e2.message || e2))) throw e2;
      }
    }
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_q08_forecasts_status ON q08_forecasts (status, horizon)").run();
    __forecastSchemaDone = true;
    return true;
  } catch (e) {
    console.error("q08 forecast schema failed: " + String(e && e.message || e).slice(0, 200));
    return false;
  }
}
__name(ensureForecastSchema, "ensureForecastSchema");
function parseForecastCap(v) {
  var s = v == null ? "" : String(v).trim();
  if (!/^\d{1,3}$/.test(s)) return FORECAST_CAP_DEFAULT;
  return Math.min(Number(s), FORECAST_CAP_MAX);
}
__name(parseForecastCap, "parseForecastCap");
async function forecastCap(env) {
  if (!env || !env.AUDIT) return FORECAST_CAP_DEFAULT;
  try {
    var r = await env.AUDIT.prepare("SELECT value FROM ops_config WHERE key = ?1").bind(FORECAST_CAP_KEY).first();
    return parseForecastCap(r && r.value);
  } catch (e) {
    return FORECAST_CAP_DEFAULT;
  }
}
__name(forecastCap, "forecastCap");
async function forecastDue(env) {
  if (!await ensureForecastSchema(env)) return false;
  var cap = await forecastCap(env);
  if (cap <= 0) return false;
  var n = await env.DB.prepare("SELECT COUNT(*) n FROM published_pieces WHERE kind = 'forecast' AND published_at >= ?1").bind(utcDay() + "T00:00:00.000Z").first();
  if ((n && n.n || 0) >= cap) return false;
  var ff = await env.DB.prepare("SELECT COUNT(*) n FROM engine_runs WHERE status = 'gate_failed' AND top_signal LIKE 'q08-forecast:%' AND ran_at >= datetime('now','start of day')").first().catch(function() {
    return { n: 0 };
  });
  if ((ff && ff.n || 0) >= 3) return false;
  var last = await env.DB.prepare("SELECT kind FROM published_pieces WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at DESC LIMIT ?1").bind(FORECAST_EVERY).all();
  var rows = last.results || [];
  if (rows.length < FORECAST_EVERY) return false;
  return rows.every(function(r) {
    return r.kind !== "forecast";
  });
}
__name(forecastDue, "forecastDue");
async function pickForecastSource(env) {
  if (!await ensureAccuracySchema(env)) return null;
  return await env.DB.prepare(
    "SELECT p.id, p.slug, p.title, p.body_md, p.core_concept, p.signal_source, p.published_at FROM published_pieces p WHERE COALESCE(p.kind, 'analysis') != 'forecast' AND p.published_at >= ?1 AND p.slug IN (SELECT slug FROM q08_audits WHERE verdict = 'pass') AND p.slug NOT IN (SELECT slug FROM q08_retractions) AND NOT EXISTS (SELECT 1 FROM q08_forecasts f WHERE f.source_slug = p.slug) AND (SELECT COUNT(*) FROM engine_runs e WHERE e.status = 'gate_failed' AND e.top_signal = substr('q08-forecast:' || p.slug, 1, 80)) < 2 ORDER BY COALESCE(p.feedback_score, 0) DESC, p.reads DESC, p.published_at DESC LIMIT 1"
  ).bind(new Date(Date.now() - 21 * 864e5).toISOString()).first();
}
__name(pickForecastSource, "pickForecastSource");
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
  "REGISTER: plain explanatory journalism, a sharp person explaining something to a smart friend. Name actors by what they are, never by role words ('the observer', 'the actor', 'the mechanism'). No bullets, no tables, no '##' headers: continuous prose. No first person, no hedging words, no emotional vocabulary, no marketing register, no @handles. Never mention 'the essay', 'the signal' or any pipeline field.",
  "",
  "LEDE (inverted pyramid, checked): the first paragraph, at most 70 words, tells a reader who has never seen q08 what is being forecast and why: the real case it starts from (who did what, where it was reported, as the ESSAY and SIGNAL state it) and the forecast itself with its probability. Then give the context a newcomer needs, then move forward in time.",
  "",
  FRAMING_RULE,
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
  'The JSON object has these keys: "claim" (the main scenario as one checkable sentence, 20-300 characters), "probability" (your probability for it as a number from 0.05 to 0.95, equal to the percent you state in the prose), "horizon" (the date by which the claim is settled, YYYY-MM-DD, between 30 and 540 days after today), "resolution" (one sentence, 30-400 characters: the public, checkable condition that makes the claim true), "alternatives" (1 to 3 objects with "claim" and "probability"), "indicators" (2 to 5 short strings), "watch_query" (3 to 8 words someone would search to find news that settles it), "watch_urls" (0 to 2 https URLs of public pages that would show the outcome; only addresses you are certain exist, otherwise an empty list).',
  "VERDICT (mandatory last line, after the FORECAST-JSON line): worth your time: yes|flat|no - one clause of justification. State honestly whether a reader gains something a plain extrapolation of the source would not give them."
].join("\n");
var READER_FORECAST_PROMPT = [
  "You are a busy, intelligent reader who has never heard of this site and owes it nothing. You are reading a forecast. You stop at the first sentence that wastes your time.",
  "Answer with exactly one JSON object and nothing else:",
  '{"would_read_to_end": true or false, "score": 1 to 5 (5 = I would send it to a friend, 4 = worth the time, 3 = I would skim it, 1 = I stopped at the first paragraph), "slop_tells": [up to 3 short phrases copied from the text that sound like generic machine prose], "fix": "one sentence telling the writer what to change"}',
  "Judge: does it open with something concrete that is happening now? Is the main claim sharp enough that it could plainly turn out false? Is the path from now to the claim a chain of people doing things, each step caused by the one before? Does it name the class of situations it reasons from, without citing outside cases it cannot support, and say why this one should or should not follow it? Are the probabilities stated and consistent with each other? Does it say what to watch? Does it end on the fact that would flip it? Is it more than extrapolating the source? Be strict: a 4 must be earned. The writer may use only the facts of the story it was given and the reasoning that follows from them, so never ask for outside facts, history, examples, names or figures: when a paragraph is thin, the fix is to cut or merge it, and a short, dense, accurate piece that states its facts and reasons to one mechanism can earn a 4."
].join("\n");
function publicHttpsUrl(u) {
  var x = safeUrl(u);
  if (!x || !/^https:\/\//i.test(x)) return "";
  try {
    var h = new URL(x).hostname.toLowerCase();
    if (h.indexOf(".") < 0 || /^\d+\.\d+\.\d+\.\d+$/.test(h) || /\.(internal|local|localhost)$/.test(h) || h === "localhost") return "";
  } catch (e) {
    return "";
  }
  return x;
}
__name(publicHttpsUrl, "publicHttpsUrl");
function parseForecastBlock(text) {
  var t = String(text || "");
  var m = t.match(/^[ \t]*FORECAST-JSON:[ \t]*(\{.*\})[ \t]*$/im);
  if (!m) return { text: t, extra: null };
  var extra = null;
  try {
    extra = JSON.parse(m[1]);
  } catch (e) {
    extra = null;
  }
  var rest = t.replace(m[0], "").replace(/^[ \t]*```[a-z]*[ \t]*$/gim, "").replace(/\n{3,}/g, "\n\n");
  return { text: rest, extra };
}
__name(parseForecastBlock, "parseForecastBlock");
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
  alts.forEach(function(a) {
    var ap = Number(a && a.probability);
    if (!a || String(a.claim || "").trim().length < 15 || !isFinite(ap) || ap <= 0 || ap > 0.9) altOk = false;
    else {
      sum += ap;
      if (ap > maxAlt) maxAlt = ap;
    }
  });
  if (!altOk) p.push("each alternative needs a claim of 15+ characters and a probability in (0, 0.9]");
  else {
    if (sum > 1.001) p.push("the main scenario and the alternatives sum to more than 100 percent");
    if (isFinite(pr) && maxAlt > pr + 1e-9) p.push("the main scenario must be at least as probable as every alternative (maximum likelihood)");
  }
  var ind = Array.isArray(f.indicators) ? f.indicators : [];
  if (ind.length < 2 || ind.length > 5 || ind.some(function(x) {
    return String(x || "").trim().length < 15;
  })) p.push("forecast needs 2-5 leading indicators of 15+ characters");
  var wq = String(f.watch_query || "").trim();
  if (wq.length < 3 || wq.length > 80) p.push("watch_query must be 3-80 characters");
  var wu = f.watch_urls == null ? [] : f.watch_urls;
  if (!Array.isArray(wu) || wu.length > 2 || wu.some(function(u) {
    return !publicHttpsUrl(u);
  })) p.push("watch_urls must be 0-2 public https URLs");
  if (isFinite(pr) && text != null) {
    var pct = Math.round(pr * 100);
    if (!new RegExp("(?:^|[^0-9])" + pct + "\\s?(?:%|percent|per cent)", "i").test(String(text))) p.push("the prose must state the main probability (" + pct + " percent) in its own words");
  }
  return p;
}
__name(validateForecast, "validateForecast");
function forecastXform(text) {
  var r = parseForecastBlock(text);
  r.problems = validateForecast(r.extra, r.text, Date.now());
  return r;
}
__name(forecastXform, "forecastXform");
async function repairForecastJson(env, essayText, src, signalText) {
  var today = new Date(Date.now()).toISOString().slice(0, 10);
  var schema = '{"claim":"<20-300 chars>","probability":<0.05-0.95>,"horizon":"YYYY-MM-DD","resolution":"<30-400 chars>","alternatives":[{"claim":"<15+ chars>","probability":<0.05-0.9>}],"indicators":["<15+ chars>","<15+ chars>"],"watch_query":"<3-8 words>","watch_urls":[]}';
  var prompt = "You are repairing the forecast record for a q08.org essay. Read the ESSAY and the SIGNAL and output ONLY one JSON object, no prose and no code fence, with this exact schema:\n" + schema + "\nRules: TODAY is " + today + "; the claim is the single main forecast the ESSAY states, 20-300 characters; the probability is the whole percent the ESSAY states, divided by 100 (0.05-0.95); the horizon is the ISO date by which the claim is settled (30-540 days after TODAY); the resolution is one checkable sentence of 30-400 characters; provide 1-3 alternative scenarios with claims of 15+ characters and probabilities in (0,0.9]; the main probability must be at least every alternative and all probabilities must sum to at most 1; provide 2-5 leading indicators of 15+ characters; watch_query is 3-8 words; watch_urls only real public https URLs stated in the source, otherwise []. Do not add facts that are not in the ESSAY or SIGNAL.\n\nESSAY:\n" + String(essayText || "").slice(0, 6e3) + "\n\nSIGNAL:\n" + String(signalText || src && src.body_md || "").slice(0, 2e3);
  for (var modelId of COMPOSE_MODELS) {
    try {
      var resp = await env.AI.run(modelId, { messages: [{ role: "user", content: prompt }], max_tokens: 1400, temperature: 0.2 }, { signal: AbortSignal.timeout(6e4) });
      var txt = aiReplyText(resp);
      var m = String(txt || "").match(/\{[\s\S]*\}/);
      if (!m) continue;
      var f = JSON.parse(m[0]);
      if (!validateForecast(f, essayText, Date.now()).length) return f;
    } catch (e) {
    }
  }
  return null;
}
__name(repairForecastJson, "repairForecastJson");
function forecastProblems(piece, banned) {
  return gate(piece.text, banned).problems.concat(validateForecast(piece.extra, piece.text, Date.now()));
}
__name(forecastProblems, "forecastProblems");
function buildForecastPrompt(src, signalText, opts) {
  var parts = [FORECAST_DIRECTIVE, "TODAY (UTC): " + utcDay()];
  var banned = opts && opts.banned || [];
  if (banned.length) {
    parts.push("\n--- OVERUSED PRECEDENTS ON THIS SITE (BANNED: do not cite it) ---");
    parts.push(banned.map(function(b) {
      return b.label;
    }).join("; "));
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
  parts.push(String(src.body_md || "").slice(0, 6e3));
  if (signalText) {
    parts.push("\n--- SIGNAL BEHIND IT (internal, never mention) ---");
    parts.push(signalText);
  }
  return parts.join("\n");
}
__name(buildForecastPrompt, "buildForecastPrompt");
async function generateForecast(env, t0) {
  var src = await pickForecastSource(env);
  if (!src) return null;
  var sg = await env.DB.prepare("SELECT friction_point FROM signal_log WHERE source_id = ?1 AND friction_point IS NOT NULL LIMIT 1").bind(String(src.signal_source || "")).first().catch(function() {
    return null;
  });
  var signalText = String(sg && sg.friction_point || "").slice(0, 800);
  var recentF = await env.DB.prepare("SELECT claim FROM q08_forecasts ORDER BY id DESC LIMIT 6").all().catch(function() {
    return { results: [] };
  });
  var recentBodies = await env.DB.prepare("SELECT body_md FROM published_pieces WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at DESC LIMIT 8").all().catch(function() {
    return { results: [] };
  });
  var banned = [];
  var prompt = buildForecastPrompt(src, signalText, { banned, ownerNotes: await ownerDirectives(env), recent: (recentF.results || []).map(function(r) {
    return r.claim;
  }) });
  var topSig = ("q08-forecast:" + src.slug).slice(0, 80);
  var piece = null, problems = [];
  try {
    piece = await compose(env, prompt, banned, void 0, forecastXform, TITLE_REPAIR_ON);
  } catch (e) {
    problems = ["compose failed: " + String(e && e.message || e).slice(0, 160)];
  }
  var fctx = { source: "q08", title: String(src.title || "") + " " + String(signalText || "").slice(0, 300), url: "" };
  if (piece) problems = forecastProblems(piece, banned).concat(ledeProblems(piece.text, fctx));
  if (piece && problems.length) {
    var rp = prompt + "\n\n--- CORRECTIVE FEEDBACK: your previous draft was rejected. Write the whole piece again, in the same output format (H1 title first, the prose, one FORECAST-JSON line, the verdict line), fixing these problems ---\n" + problems.join("; ");
    var retry = null;
    try {
      retry = await compose(env, rp, banned, void 0, forecastXform, TITLE_REPAIR_ON);
    } catch (e) {
      retry = null;
    }
    if (retry) {
      var rprob = forecastProblems(retry, banned).concat(ledeProblems(retry.text, fctx));
      if (!rprob.length) {
        piece = retry;
        problems = [];
      } else problems = problems.concat(["retry: " + rprob.join("; ")]);
    }
  }
  if (piece && problems.length && (!piece.extra || problems.some(function(p) {
    return /forecast|FORECAST-JSON|resolution|horizon|probability|alternative|indicator|watch_/i.test(String(p));
  }))) {
    var repaired = await repairForecastJson(env, piece.text, src, signalText);
    if (repaired) {
      var candText = String(piece.text || "").replace(/\s*$/, "") + "\n\nFORECAST-JSON: " + JSON.stringify(repaired);
      var xr2 = forecastXform(candText);
      if (!xr2.problems.length) {
        var np = forecastProblems({ text: xr2.text, extra: xr2.extra }, banned).concat(ledeProblems(xr2.text, fctx));
        if (!np.length) {
          piece = { text: xr2.text, model: piece.model, extra: xr2.extra };
          problems = [];
        } else problems = np;
      }
    }
  }
  var readerRows = [], gateResult = { ok: !!piece && problems.length === 0, problems };
  if (gateResult.ok) {
    var lv = await runLevels(env, { piece, prompt, banned, seedText: src.title || "", gateResult, xform: forecastXform, forecast: true, readerPrompt: READER_FORECAST_PROMPT });
    piece = lv.piece;
    gateResult = lv.gateResult;
    readerRows = lv.rows;
  }
  var fcVr = null;
  if (gateResult.ok) {
    var fcGround = [src.title || "", src.body_md || "", signalText].join("\n");
    var fv = await verifyAndRevise(env, { piece, prompt, banned, ground: fcGround, seedText: String(src.slug || ""), forecast: true, xform: forecastXform });
    piece = fv.piece;
    fcVr = fv.vr;
    if (!fv.ok) gateResult = { ok: false, problems: ["accuracy: " + fv.problems.join("; ")] };
  }
  if (!gateResult.ok) {
    await saveReaderTests(env, topSig, readerRows);
    await env.DB.prepare("INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, top_signal, model, ms, status, error) VALUES (?,?,?,?,?,?,?,?)").bind(1, 1, 0, topSig, piece ? piece.model : "", Date.now() - t0, "gate_failed", ("forecast: " + gateResult.problems.join("; ")).slice(0, 900)).run().catch(function(e) {
      console.error(JSON.stringify({ evt: "q08-signal-engine:generateForecast:caught", error: String(e && e.message || e) }));
    });
    return null;
  }
  piece.text = stripAnalysisMark(piece.text.replace(/\n?worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-].*$/im, "").trim());
  var pseudo = { source: "q08", id: src.id, slug: src.slug, title: src.title, url: ORIGIN + "/p/" + src.slug, points: 0, num_comments: 0, ratio: 0, volatility_score: 0 };
  var saved = await persistPiece(env, piece, { core_concept: src.core_concept || src.title, friction_point: signalText || String(src.title || ""), signal_strength: "Forecast" }, pseudo, piece.model);
  if (fcVr) await recordAudit(env, saved.slug, "pass", "publish", fcVr).catch(function(e) {
    console.error(JSON.stringify({ evt: "q08-signal-engine:generateForecast:caught", error: String(e && e.message || e) }));
  });
  await saveReaderTests(env, saved.slug, readerRows);
  var fcRow = await env.DB.prepare("SELECT claim, probability, horizon FROM q08_forecasts WHERE slug = ?").bind(saved.slug).first().catch(function() {
    return null;
  });
  await queueForDistribution(env, q08Plain(saved.title), saved.slug, fcRow);
  pingIndexNow(env, ORIGIN + "/p/" + saved.slug).catch(function(e) {
    console.error(JSON.stringify({ evt: "q08-signal-engine:generateForecast:caught", error: String(e && e.message || e) }));
  });
  emitContentSignal(env, piece, saved).catch(function(e) {
    console.error(JSON.stringify({ evt: "q08-signal-engine:generateForecast:caught", error: String(e && e.message || e) }));
  });
  await env.DB.prepare("INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, top_signal, model, ms, status) VALUES (?,?,?,?,?,?,?)").bind(1, 1, 1, topSig, piece.model, Date.now() - t0, "ok").run();
  return { ok: true, kind: "forecast", slug: saved.slug, title: saved.title, model: piece.model, source: "q08", story: src.title };
}
__name(generateForecast, "generateForecast");
var GROUND_MAX = 14e3;
var FACTCHECK_GROUND_MAX = 48e3;
var THIN_MIN_ARTICLE = 600;
var FACTCHECK_MAX_TOKENS = 8e3;
var __accSchemaDone = false;
var __accSchemaTried = 0;
async function ensureAccuracySchema(env) {
  if (__accSchemaDone) return true;
  if (Date.now() - __accSchemaTried < 3e4) return false;
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
__name(ensureAccuracySchema, "ensureAccuracySchema");
var MIN_GROUND_CHARS = 2200;
var GITHUB_REPO_RE = /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?(?:[?#].*)?$/i;
function githubReadmeUrl(u) {
  var m = String(u || "").match(GITHUB_REPO_RE);
  return m ? "https://raw.githubusercontent.com/" + m[1] + "/" + m[2] + "/HEAD/README.md" : "";
}
__name(githubReadmeUrl, "githubReadmeUrl");
function articleUrlFor(story) {
  var u = String(story && story.url || "");
  var m = u.match(/^https?:\/\/arxiv\.org\/abs\/(.+)$/i);
  return m ? "https://arxiv.org/html/" + m[1] : githubReadmeUrl(u) || u;
}
__name(articleUrlFor, "articleUrlFor");
async function fetchArticleText(url) {
  var u = publicHttpsUrl(String(url || "").replace(/^http:\/\//i, "https://"));
  if (!u) return "";
  var gm = u.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/HEAD\/README\.md$/i);
  if (gm) {
    var readme = await fetchArticleTextRaw(u);
    return readme.length >= 200 ? readme : await fetchArticleTextRaw("https://github.com/" + gm[1] + "/" + gm[2]);
  }
  return fetchArticleTextRaw(u);
}
__name(fetchArticleText, "fetchArticleText");
async function fetchArticleTextRaw(u) {
  try {
    var r = await fetch(u, { headers: { "User-Agent": UA, "Accept": "text/html,text/plain" }, signal: AbortSignal.timeout(15e3), redirect: "follow" });
    if (!r.ok) return "";
    var ct = String(r.headers.get("content-type") || "");
    if (!/text\/|html|xml/i.test(ct)) return "";
    return plainText((await r.text()).slice(0, 4e5)).slice(0, GROUND_MAX);
  } catch (e) {
    return "";
  }
}
__name(fetchArticleTextRaw, "fetchArticleTextRaw");
var GROUND_LEAD = /* @__PURE__ */ new Set(["the", "a", "an", "in", "on", "at", "when", "if", "but", "and", "so", "as", "that", "this", "these", "those", "it", "its", "each", "every", "most", "some", "no", "for", "with", "without", "before", "after", "once", "while", "because", "since", "what", "where", "who", "why", "how", "then", "there", "here", "not", "only", "even", "still", "yet", "or", "nor", "by", "from", "to", "of", "their", "his", "her", "our", "your", "one", "two", "three", "such", "both", "many", "any", "all", "i", "we", "you", "he", "she", "they", "my", "whether", "although", "though", "until", "unless", "instead", "perhaps", "suppose", "imagine", "consider", "now", "today", "later", "earlier", "first", "second", "third", "finally", "meanwhile", "however", "which", "whose", "than", "also", "just", "every", "another", "other", "either", "neither", "same", "more", "less", "few", "several", "unlike", "like", "despite", "across", "through", "during", "under", "over", "between", "among", "within", "against", "beyond", "per", "via", "consequently", "therefore", "thus", "hence", "moreover", "furthermore", "similarly", "likewise", "otherwise", "accordingly", "additionally", "specifically", "ultimately", "eventually", "typically", "usually", "often", "sometimes", "rather", "indeed", "western", "eastern", "northern", "southern", "central"]);
var GROUND_OK = /* @__PURE__ */ new Set(["readme", "changelog", "github", "gitlab", "repository", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "q08", "qnfo", "hacker news", "hn", "github", "arxiv", "markdown", "json", "html", "gpu", "cpu", "vpn", "api", "ai", "llm", "sdk", "ceo", "cto", "url", "dns", "pdf", "csv", "sql", "usb", "ram", "ssd", "gps", "ui", "ux", "os"]);
function groundWords(text) {
  var set = /* @__PURE__ */ new Set();
  String(text || "").toLowerCase().replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[‘’]/g, "'").replace(/[a-z0-9][a-z0-9'.-]*/g, function(w) {
    w = w.replace(/[.'-]+$/, "");
    set.add(w);
    if (w.indexOf("-") > 0) w.split("-").forEach(function(part) {
      if (part) set.add(part);
    });
    set.add(w.replace(/'s$/, ""));
    if (w.length > 3 && w.charAt(w.length - 1) === "s") set.add(w.slice(0, -1));
    else set.add(w + "s");
    return "";
  });
  return set;
}
__name(groundWords, "groundWords");
function groundNumbers(text) {
  var set = /* @__PURE__ */ new Set();
  (String(text || "").match(/\d[\d,]*(?:\.\d+)?/g) || []).forEach(function(n) {
    set.add(n.replace(/,/g, "").replace(/\.0+$/, ""));
  });
  return set;
}
__name(groundNumbers, "groundNumbers");
function groundingProblems(text, ground, opts) {
  var o = opts || {}, nowYear = Number(String(o.today || utcDay()).slice(0, 4));
  var body = String(text || "").replace(/^[ \t]*FORECAST-JSON:.*$/gim, " ").replace(/\n?worth your time:[^\n]*$/im, " ").replace(/^#\s+/gm, "").replace(/\(?(?:This|A|An) hypothetical[^)]*\)?/gi, " ");
  var words = groundWords(ground), nums = groundNumbers(ground), out = [], seen = {};
  function add(kind, v) {
    var k = kind + v.toLowerCase();
    if (seen[k]) return;
    seen[k] = 1;
    out.push(kind + ": " + v);
  }
  __name(add, "add");
  var nre = /\$?\d[\d,]*(?:\.\d+)?\s*(%|percent|days?|weeks?|months?|quarters?|years?|hours?)?/gi, m;
  while (m = nre.exec(body)) {
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
  var sentences = body.split(/(?<=[.!?:;—]["'\)\]”’*_]*)\s+|\n+/);
  sentences.forEach(function(sent) {
    var toks = sent.match(/[A-Za-z0-9][A-Za-z0-9&'.’-]*|[,;]/g) || [];
    var i = 0;
    while (i < toks.length) {
      var t = toks[i];
      if (!/^[A-Z]/.test(t) || /^[A-Z]$/.test(t) && toks[i + 1] && !/^[A-Z]/.test(toks[i + 1])) {
        i++;
        continue;
      }
      var j = i, phrase = [];
      while (j < toks.length && /^[A-Z][A-Za-z0-9&'.’-]*$/.test(toks[j])) {
        var endsDot = /\.$/.test(toks[j]);
        phrase.push(toks[j]);
        j++;
        if (endsDot) break;
        if (toks[j] && /^(of|the|de|von|van|del|la)$/i.test(toks[j]) && toks[j + 1] && /^[A-Z]/.test(toks[j + 1])) {
          phrase.push(toks[j]);
          j++;
        }
      }
      phrase = phrase.filter(function(w) {
        return !/^[A-Z]\.$/.test(w);
      });
      phrase = phrase.filter(function(w) {
        return !/^[A-Z]{2,5}s?[.,;:]?$/.test(w);
      });
      var lead = 0;
      while (lead < phrase.length - 1 && GROUND_LEAD.has(phrase[lead].toLowerCase().replace(/[^a-z]/g, ""))) lead++;
      var core = phrase.slice(lead).filter(function(w) {
        return !/^[A-Z]$/.test(w);
      });
      var first = i === 0;
      if (core.length === 1 && /^[A-Z][a-z]{3,}(ing|ed|ly|ness|less)$/.test(core[0])) {
        i = Math.max(j, i + 1);
        continue;
      }
      if (core.length && !(core.length === 1 && first && lead === 0) && !(core.length === 1 && GROUND_LEAD.has(core[0].toLowerCase()))) {
        var joined = core.join(" ").replace(/[’]/g, "'");
        var nameParts = core.map(function(w) {
          var parts = w.split(/[-\u2010-\u2015]/);
          return parts.length > 1 ? parts.filter(function(x) {
            return /[A-Z0-9]/.test(x);
          }).join(" ") : w;
        }).join(" ").replace(/[’]/g, "'");
        var low = nameParts.toLowerCase().replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();
        if (low && !GROUND_OK.has(low)) {
          var miss = low.split(" ").filter(function(w) {
            return w && !GROUND_OK.has(w) && !GROUND_LEAD.has(w) && !words.has(w) && !words.has(w.replace(/'s$/, "")) && !/^\d+$/.test(w);
          });
          if (miss.length) add("name not in the source", joined);
        }
      }
      i = Math.max(j, i + 1);
    }
  });
  return out.slice(0, 14);
}
__name(groundingProblems, "groundingProblems");
var ANALYSIS_MARK = "<!-- analysis -->";
var ANALYSIS_MARK_RE = /^[ \t]*<!--\s*analysis\s*-->[ \t]*$/im;
var ANALYSIS_MAX_SHARE = 0.6;
function stripAnalysisMark(text) {
  return String(text || "").replace(/\n?[ \t]*<!--\s*analysis\s*-->[ \t]*\n?/gi, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
__name(stripAnalysisMark, "stripAnalysisMark");
var ANALYSIS_VOCAB_RE = /\b(incentives?|rewards?|punish\w*|pays?|gains?|loses?|costs?|because|therefore|that means|which means|so that|feedback|loop|the system|systems?|structur\w*|constrain\w*|trade-?offs?|leverage|motivat\w*|if\b[^.]{0,80}\bthen)\b/i;
function autoAnalysisMark(text) {
  var t = String(text || ""), parts = t.split(/\n{2,}/), body = [];
  parts.forEach(function(p, i) {
    if (p.trim() && !/^\s*#/.test(p) && !/^\s*(worth your time:|FORECAST-JSON:)/i.test(p)) body.push(i);
  });
  for (var k = 2; k < body.length; k++) {
    if (!ANALYSIS_VOCAB_RE.test(parts[body[k]])) continue;
    var cand = parts.slice(0, body[k]).concat([ANALYSIS_MARK], parts.slice(body[k])).join("\n\n");
    var sp = splitAnalysisMarked(cand);
    if (sp.analysis) return cand;
  }
  return null;
}
__name(autoAnalysisMark, "autoAnalysisMark");
function splitAnalysis(text) {
  var t = String(text || "");
  if (ANALYSIS_MARK_RE.test(t)) {
    var r0 = splitAnalysisMarked(t);
    if (r0.analysis) {
      r0.mode = "marked";
      return r0;
    }
    var parts = t.split(/\n{2,}/), at = -1;
    for (var q = 0; q < parts.length; q++) {
      if (ANALYSIS_MARK_RE.test(parts[q]) && parts[q].trim().replace(/<!--\s*analysis\s*-->/i, "").trim() === "") {
        at = q;
        break;
      }
    }
    if (at >= 0) {
      var rest = parts.slice(0, at).concat(parts.slice(at + 1));
      for (var k = at + 1; k < rest.length; k++) {
        if (!rest[k].trim() || /^\s*(#|worth your time:|FORECAST-JSON:)/i.test(rest[k])) continue;
        var r2 = splitAnalysisMarked(rest.slice(0, k).concat([ANALYSIS_MARK], rest.slice(k)).join("\n\n"));
        if (r2.analysis) {
          r2.mode = "marked-shifted";
          return r2;
        }
      }
    }
    r0.mode = "marked-rejected";
    return r0;
  }
  var auto = autoAnalysisMark(t);
  if (auto) {
    var r1 = splitAnalysisMarked(auto);
    r1.mode = "auto";
    return r1;
  }
  return { report: t, analysis: null, mode: "none" };
}
__name(splitAnalysis, "splitAnalysis");
function splitAnalysisMarked(text) {
  var t = String(text || ""), m = t.match(ANALYSIS_MARK_RE);
  if (!m) return { report: t, analysis: null };
  var i = t.indexOf(m[0]);
  var report = t.slice(0, i).trim(), analysis = t.slice(i + m[0].length).replace(/\n?worth your time:[^\n]*$/im, "").trim();
  var bodyLen = /* @__PURE__ */ __name(function(x) {
    return String(x).replace(/^#.*$/m, "").replace(/\s+/g, " ").trim().length;
  }, "bodyLen");
  var total = bodyLen(report) + bodyLen(analysis);
  if (!analysis || !total || bodyLen(analysis) / total > ANALYSIS_MAX_SHARE || bodyLen(report) < 600) return { report: stripAnalysisMark(t), analysis: null, rejected: true };
  return { report, analysis };
}
__name(splitAnalysisMarked, "splitAnalysisMarked");
var NOT_A_NAME_RE = /^(I|A|An|The|This|That|These|Those|It|If|When|Whether|But|And|Or|So|Yet|However|Because|While|For|In|On|At|By|To|As|Its|Their|Our|We|They|He|She)$/;
function concreteClaim(item) {
  var raw = String(item || "").split(/\s+--\s+/)[0].replace(/^\s*(?:\*\*)?(?:FACT|INFERENCE)(?:\*\*)?\s*:\s*/i, "").trim();
  if (/without naming a claim/.test(item)) return true;
  var claim = raw.replace(/^["'\u2018\u201c]+|["'\u2019\u201d.]+$/g, "");
  if (/\d/.test(claim) || /["\u201c][^"\u201d]{3,}["\u201d]/.test(raw.replace(/^["\u201c]([\s\S]*)["\u201d]\.?$/, "$1"))) return true;
  var words = claim.split(/\s+/).slice(1).map(function(w) {
    return w.replace(/^[("'\u2018\u201c]+|[)"'\u2019\u201d.,;:!?]+$/g, "");
  });
  return words.some(function(w) {
    return /^[A-Z][A-Za-z0-9-]*[a-z0-9A-Z]$/.test(w) && !NOT_A_NAME_RE.test(w);
  });
}
__name(concreteClaim, "concreteClaim");
var SOURCE_CONCESSION_RE = /\b(but|though|although|however|yet)\b[^.;]*\b(in (the )?(source|faq|comments?|background|article|thread|discussion)|from (the )?(faq|comments?|background|article|thread|discussion|source))\b|\b(from|in) (the )?(faq|comments?|background reference|linked article|discussion)\b(?![^.;]*\bnot\b)/i;
var PARAPHRASE_REASON_RE = /\b(phrasing|wording|worded|not explicitly|not stated explicitly|paraphrase|implied|implicit|inferred|interpretation|editorial|characteri[sz]ation|framing)\b/i;
function paraphraseItemsDropped(fc) {
  var kept = (fc.unsupported || []).filter(function(u) {
    var reason = String(u).split(/\s+--\s+/).slice(1).join(" -- ");
    if (reason && SOURCE_CONCESSION_RE.test(reason) && !/\bnot (found |stated |mentioned )?(anywhere|at all)\b/i.test(reason)) return false;
    return !(reason && PARAPHRASE_REASON_RE.test(reason) && !concreteClaim(u));
  });
  var dropped = (fc.unsupported || []).length - kept.length;
  if (!dropped) return fc;
  return Object.assign({}, fc, { unsupported: kept, ok: kept.length === 0 ? true : fc.ok, droppedParaphrase: dropped });
}
__name(paraphraseItemsDropped, "paraphraseItemsDropped");
function concreteAnalysisItems(fa) {
  var kept = (fa.unsupported || []).filter(concreteClaim);
  var dropped = (fa.unsupported || []).length - kept.length;
  if (!dropped) return fa;
  return Object.assign({}, fa, { unsupported: kept, ok: kept.length === 0 ? true : fa.ok, droppedAbstract: dropped });
}
__name(concreteAnalysisItems, "concreteAnalysisItems");
var ANALYSIS_CHECK_PROMPT = [
  "You check the ANALYSIS section of an essay for a publication that must contain no invented facts. You are given SOURCE MATERIAL and the ANALYSIS section as the DRAFT.",
  "The section reasons about how a system works: incentives, constraints, feedback, who gains and who pays, consequences and where else the same arrangement could apply. Reasoning, interpretation, generalisation, conditional statements ('if ... then ...', 'when ...'), judgements and claims about what parties are motivated to do are expected here and are NEVER violations, even when the source does not state them.",
  "Everything under SOURCE MATERIAL counts as source: the source's own text, the discussion comments, the linked article and the Background reference text alike.",
  "List only concrete factual assertions about the real world that are not stated in, or a direct paraphrase of, the SOURCE MATERIAL: an event that happened; a specific named person, organisation, product, law or place doing or saying something; a date; a number, price, count or percentage; a quotation; a study, report or historical precedent. Your own knowledge is not support.",
  `Answer with exactly one JSON object and nothing else: {"unsupported": [up to 8 items, each starting with 'FACT: ', then a short quotation copied from the DRAFT, then ' -- ' and the reason in a few words], "verdict": "pass" or "fail"}. verdict is "fail" when any item is listed, else "pass".`
].join("\n");
var FACTCHECK_PROMPT = [
  "You are a strict fact-checker for a publication that must contain no unsupported claim. You are given SOURCE MATERIAL and a DRAFT.",
  "The SOURCE line and the sentence after it (the item's title, the site it appeared on and its link) are source material too: a statement that the item is titled so or appeared on that site is supported.",
  "Everything under SOURCE MATERIAL counts as source: the source's own text, the discussion comments, the linked article and the Background reference text alike. A claim found in any of them is supported; never list a claim because it comes from the background or the comments rather than the main source.",
  "List every sentence or clause in the DRAFT that asserts something about the real world and is not stated in, or a direct paraphrase of, the SOURCE MATERIAL. That covers events, dates, people, organisations, products, laws, institutions, numbers, quotations, studies, historical episodes and precedents, and statements that a practice or fact is 'known' or 'common'.",
  "Your own knowledge does not count as support, even if you are sure the claim is true: if it is not in the SOURCE MATERIAL, it is unsupported. These are NOT violations: analysis and interpretation the writer frames as such ('the incentive is ...', 'this means ...', 'the system rewards ...') that introduces no new name, date, number, event or quotation; reasoning that follows from the source's facts, conditional statements of the form 'if X then Y' that follow from them, mentions of the source itself ('the article'), definitions, and a clearly labelled hypothetical that names no real person, company, product, date or number.",
  'Example of the expected answer: {"unsupported": ["FACT: the release shipped on 4 March -- date not in source", "INFERENCE: so the maintainers run out of review time -- reasoning from the source"], "verdict": "fail"}.',
  "Label each item you list. FACT: a specific real-world assertion: something happened, exists, was said, decided, released or measured; any name of a person, organisation, product or place; any date, number, price, count or quotation; any study or precedent. INFERENCE: reasoning, interpretation, generalisation or consequence the writer draws from the source's facts, with no specific name, date, number or quotation of its own. When unsure, label it FACT.",
  `Answer with exactly one JSON object and nothing else: {"unsupported": [up to 8 items, each starting with 'FACT: ' or 'INFERENCE: ', then a short quotation copied from the DRAFT, then ' -- ' and the reason in a few words], "verdict": "pass" or "fail"}. verdict is "fail" when any FACT item is listed, else "pass".`
].join("\n");
var INFERENCE_REASON_RE = /\b(analy\w*|evaluat\w*|judge?ments?|inferen\w*|interpret\w*|generali[sz]\w*|assum\w*|speculat\w*|paraphras\w*|reasoning|opinion|editoriali[sz]\w*|characteri[sz]\w*)\b/i;
var FACT_REASON_RE = /\b(dates?|years?|numbers?|figures?|statistics?|names?|quot\w*|percent\w*|prices?|counts?|amounts?|fabricat\w*|invent\w*|false|wrong|incorrect|contradict\w*)\b/i;
function wordingOnly(reason) {
  reason = String(reason || "");
  return /\b(?:as an? (?:direct|exact|verbatim) quot\w*|not (?:a )?(?:direct|exact|verbatim) quot\w*|verbatim|exact wording|different wording|worded differently|paraphras\w*)\b/i.test(reason) && !/\b(?:dates?|years?|numbers?|figures?|names?|percent\w*|prices?|fabricat\w*|invent\w*|false|wrong|incorrect|contradict\w*)\b/i.test(reason);
}
__name(wordingOnly, "wordingOnly");
function reasonIsInference(item) {
  var i = String(item).lastIndexOf(" -- ");
  if (i < 0) return false;
  var reason = String(item).slice(i + 4);
  var saysSupported = /\bin (?:the )?source\b/i.test(reason) && !/\bnot (?:[\w-]+ ){0,2}in (?:the )?source\b/i.test(reason);
  if (wordingOnly(reason)) return true;
  return (INFERENCE_REASON_RE.test(reason) || saysSupported) && !FACT_REASON_RE.test(reason);
}
__name(reasonIsInference, "reasonIsInference");
function factItemText(x) {
  if (x == null) return "";
  if (typeof x !== "object") return String(x);
  var pick = /* @__PURE__ */ __name(function(keys) {
    for (var i = 0; i < keys.length; i++) {
      if (x[keys[i]] != null && String(x[keys[i]]).trim()) return String(x[keys[i]]).trim();
    }
    return "";
  }, "pick");
  var label = pick(["label", "type", "kind", "category"]).toUpperCase();
  var claim = pick(["claim", "quote", "quotation", "text", "sentence", "item", "excerpt"]);
  var reason = pick(["reason", "why", "explanation", "note", "issue"]);
  if (!claim) return JSON.stringify(x).slice(0, 260);
  return (label === "FACT" || label === "INFERENCE" ? label + ": " : "") + claim + (reason ? " -- " + reason : "");
}
__name(factItemText, "factItemText");
var REASONING_MARK_RE = /\b(incentives?|pressures?|mechanisms?|structures?|repeats?|wherever|whenever|because|therefore|thus|hence|so that|cannot|can|could|may|might|would|should|tends?|likely|levers?|creates?|means|translates?|prevent\w*|despite|based on|leads? to|result\w* in|unless|if|weak|stronger|weaker)\b/i;
var GENERAL_MARK_RE = /\b(wherever|whenever|any|every|mechanisms?|patterns?|incentives?|structures?|if|unless|therefore|thus|hence|would|could|might|tends?)\b/i;
function claimIsReasoning(item, labelledFact) {
  var s = String(item), i = s.lastIndexOf(" -- ");
  if (i < 0) return false;
  var claim = s.slice(0, i).trim(), reason = s.slice(i + 4);
  if (FACT_REASON_RE.test(reason) || /["\u201c\u2018'][^"\u201d\u2019']{3,}["\u201d\u2019']/.test(reason)) return false;
  if (/[0-9"\u201c\u201d]/.test(claim)) return false;
  if (claim.split(/\s+/).slice(1).some(function(w) {
    return /^[^a-z]*[A-Z]/.test(w) && w !== "I";
  })) return false;
  return labelledFact ? GENERAL_MARK_RE.test(claim) || INFERENCE_REASON_RE.test(reason) : REASONING_MARK_RE.test(claim);
}
__name(claimIsReasoning, "claimIsReasoning");
function splitFactItems(items) {
  var facts = [], inferences = [];
  (items || []).forEach(function(x) {
    var s = String(x).replace(/\s+/g, " ").trim();
    var m = s.match(/^\**\s*(FACT|INFERENCE)\s*\**\s*[:\-]\s*/i);
    if (m && (m[1].toUpperCase() === "INFERENCE" || claimIsReasoning(s.slice(m[0].length), true) || s.lastIndexOf(" -- ") > 0 && wordingOnly(s.slice(s.lastIndexOf(" -- ") + 4)))) inferences.push(s.slice(m[0].length).slice(0, 260));
    else if (!m && (reasonIsInference(s) || claimIsReasoning(s))) inferences.push(s.slice(0, 260));
    else facts.push((m ? s.slice(m[0].length) : s).slice(0, 260));
  });
  return { facts: facts.filter(Boolean), inferences: inferences.filter(Boolean) };
}
__name(splitFactItems, "splitFactItems");
function parseFactVerdict(text) {
  var t = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "");
  var o = null, m = t.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      o = JSON.parse(m[0]);
    } catch (e) {
      o = null;
    }
  }
  if (!o) {
    var vm = t.match(/"verdict"\s*:\s*"(pass|fail)"/gi);
    if (!vm) return null;
    var last = vm[vm.length - 1].match(/(pass|fail)/i)[1];
    var um = t.match(/"unsupported"\s*:\s*\[([\s\S]*?)(?:\]|"verdict")/i), items = [];
    if (um) {
      var re = /"((?:[^"\\]|\\.)*)"/g, x;
      while (x = re.exec(um[1])) {
        if (x[1].trim()) items.push(x[1]);
      }
    }
    o = { verdict: last, unsupported: items };
  }
  var v = String(o && o.verdict || "").toLowerCase().trim();
  if (v !== "pass" && v !== "fail") return null;
  var listed = Array.isArray(o.unsupported) ? o.unsupported.map(factItemText).filter(function(x2) {
    return x2.trim();
  }).slice(0, 8) : [];
  var sp = splitFactItems(listed), u = sp.facts;
  if (u.length) v = "fail";
  else if (v === "fail" && !sp.inferences.length) u = ["the reviewer rejected the draft without naming a claim"];
  else v = "pass";
  return { verdict: v, unsupported: u, inferences: sp.inferences };
}
__name(parseFactVerdict, "parseFactVerdict");
function factCheckExtra(modelId) {
  var m = String(modelId || "").toLowerCase();
  if (m.indexOf("kimi") >= 0 || m.indexOf("deepseek") >= 0) return { chat_template_kwargs: { thinking: false } };
  if (m.indexOf("nemotron") >= 0) return { chat_template_kwargs: { enable_thinking: false } };
  if (m.indexOf("gpt-oss") >= 0) return { reasoning: { effort: "low" } };
  return {};
}
__name(factCheckExtra, "factCheckExtra");
async function factCheckOne(env, modelId, essay, ground, prompt) {
  try {
    var body = (prompt || FACTCHECK_PROMPT) + "\n\n--- SOURCE MATERIAL ---\n" + String(ground).slice(0, FACTCHECK_GROUND_MAX) + "\n\n--- DRAFT ---\n" + String(essay).replace(/^[ \t]*FORECAST-JSON:.*$/gim, "").replace(/\n?worth your time:[^\n]*$/im, "").trim().slice(0, 9e3);
    var resp = await env.AI.run(modelId, Object.assign({ messages: [{ role: "user", content: body }], max_tokens: FACTCHECK_MAX_TOKENS, temperature: 0.1 }, factCheckExtra(modelId)), { signal: AbortSignal.timeout(75e3) });
    var msg = resp && resp.choices && resp.choices[0] && resp.choices[0].message;
    var out = aiReplyText(resp);
    var v = parseFactVerdict(out);
    if (v) {
      v.model = modelId;
      v.family = familyOf(modelId);
      return v;
    }
    return { failed: true, model: modelId, error: "no verdict in reply (" + String(out).length + " chars, finish " + String(resp && resp.choices && resp.choices[0] && resp.choices[0].finish_reason) + ")" };
  } catch (e) {
    return { failed: true, model: modelId, error: String(e && e.message || e).slice(0, 140) };
  }
}
__name(factCheckOne, "factCheckOne");
var FACTCHECK_POOL = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/qwen/qwen3-30b-a3b-fp8", "@cf/google/gemma-4-26b-a4b-it", "@cf/zai-org/glm-5.3-flash", "@cf/deepseek-ai/deepseek-v4-flash-0731", "@cf/openai/gpt-oss-20b", "@cf/nvidia/nemotron-3-120b-a12b", "@cf/openai/gpt-oss-120b"];
function pickFactPool(exclude, k) {
  var ex = {};
  (exclude || []).forEach(function(f2) {
    ex[f2] = 1;
  });
  var out = [], seen = {};
  for (var i = 0; i < FACTCHECK_POOL.length && out.length < k; i++) {
    var f = familyOf(FACTCHECK_POOL[i]);
    if (ex[f] || seen[f]) continue;
    seen[f] = 1;
    out.push(FACTCHECK_POOL[i]);
  }
  return out;
}
__name(pickFactPool, "pickFactPool");
function factCheckOrder(exclude) {
  var first = pickFactPool(exclude, FACTCHECK_POOL.length), ex = {};
  (exclude || []).forEach(function(f) {
    ex[f] = 1;
  });
  return first.concat(FACTCHECK_POOL.filter(function(id) {
    return first.indexOf(id) < 0 && !ex[familyOf(id)];
  }));
}
__name(factCheckOrder, "factCheckOrder");
async function factCheck(env, essay, ground, writerModel, seedText, prompt) {
  var wf = familyOf(writerModel || "");
  var ids = factCheckOrder([wf]);
  var got = [], failures = [], gotFam = {};
  for (var k = 0; k < ids.length && got.length < 2; k++) {
    if (gotFam[familyOf(ids[k])]) continue;
    var r = await factCheckOne(env, ids[k], essay, ground, prompt);
    if (r && !r.failed) {
      got.push(r);
      gotFam[r.family] = 1;
    } else if (r) failures.push(String(r.model).split("/").pop() + ": " + r.error);
  }
  if (got.length < 2) return { ok: false, unavailable: true, unsupported: [], judges: got, reason: "fewer than two fact-check verdicts from other model families (" + ids.length + " reviewers tried: " + failures.join(" | ").slice(0, 400) + ")" };
  var uns = [], inf = [];
  got.forEach(function(g) {
    g.unsupported.forEach(function(u) {
      if (uns.indexOf(u) < 0) uns.push(u);
    });
    (g.inferences || []).forEach(function(u) {
      if (inf.indexOf(u) < 0) inf.push(u);
    });
  });
  return { ok: got.every(function(g) {
    return g.verdict === "pass";
  }), unavailable: false, unsupported: uns.slice(0, 10), inferences: inf.slice(0, 12), judges: got, reason: "" };
}
__name(factCheck, "factCheck");
async function verifyPiece(env, text, ground, writerModel, seedText, opts) {
  var det = groundingProblems(text, ground, opts);
  if (det.length) return { ok: false, stage: "grounding", problems: det, judges: [], unavailable: false };
  var sp = splitAnalysis(text);
  var fc = await factCheck(env, sp.report, ground, writerModel, seedText);
  if (!fc.unavailable) fc = paraphraseItemsDropped(fc);
  fc.analysisMode = sp.mode;
  if (!fc.unavailable && sp.analysis) {
    var fa = await factCheck(env, sp.analysis, ground, writerModel, seedText, ANALYSIS_CHECK_PROMPT);
    if (!fa.unavailable) fa = concreteAnalysisItems(fa);
    if (fa.unavailable) fc = fa;
    else fc = { ok: fc.ok && fa.ok, unavailable: false, unsupported: fc.unsupported.concat(fa.unsupported.filter(function(u) {
      return fc.unsupported.indexOf(u) < 0;
    })).slice(0, 12), inferences: (fc.inferences || []).concat(fa.inferences || []).slice(0, 14), judges: fc.judges.concat(fa.judges), reason: "" };
  }
  if (fc.unavailable) return { ok: false, stage: "factcheck", problems: ["fact-check unavailable: " + fc.reason], judges: fc.judges, unavailable: true };
  if (!fc.ok) return { ok: false, stage: "factcheck", problems: fc.unsupported.map(function(u) {
    return "unsupported claim: " + u;
  }), judges: fc.judges, unavailable: false, analysisMode: sp.mode };
  return { ok: true, stage: "pass", problems: [], judges: fc.judges, unavailable: false, inferences: fc.inferences || [] };
}
__name(verifyPiece, "verifyPiece");
function pruneInferences(piece, vr, banned, forecast) {
  var inf = vr && vr.inferences || [];
  if (forecast || !inf.length) return { piece, removed: 0 };
  var src = String(piece.text), hadMark = ANALYSIS_MARK_RE.test(src);
  var marked = hadMark ? src : autoAnalysisMark(src) || src;
  var pr = pruneUnsupported(marked, inf.map(function(u) {
    return "unsupported claim: " + u;
  }), { keepAnalysis: true });
  var out = hadMark ? pr.text : stripAnalysisMark(pr.text);
  if (!pr.removed.length || prunedGateProblems(out, banned).length) return { piece, removed: 0 };
  return { piece: Object.assign({}, piece, { text: out, pruned: (piece.pruned || 0) + pr.removed.length }), removed: pr.removed.length };
}
__name(pruneInferences, "pruneInferences");
var ANALYSIS_MIN_CHARS = 700;
var ANALYSIS_MIN_PARAS = 2;
var DEMONSTRATIVE_RE = /^(?:["\u201c]?)(This|That|These|Those|Such)\s+([a-z][a-z-]+)(?:\s+([a-z][a-z-]+))?/;
var DEMO_VERB_RE = /^(is|was|are|were|means|meant|matters|explains|leaves|left|creates|makes|made|shows|suggests|has|had|gives|puts|turns|raises|matters|helps|keeps|sets|lets|does|did|can|could|will|would|may|might|should|must|also|alone|in|on|is)$/;
function danglingOpening(sentence, before) {
  var m = String(sentence || "").trim().match(DEMONSTRATIVE_RE);
  if (!m || DEMO_VERB_RE.test(m[2])) return false;
  var prior = " " + normForMatch(before) + " ";
  var words = [m[2]].concat(m[3] && !DEMO_VERB_RE.test(m[3]) ? [m[3]] : []);
  return !words.some(function(w) {
    return prior.indexOf(" " + w.slice(0, Math.max(4, Math.min(w.length, 6)))) >= 0;
  });
}
__name(danglingOpening, "danglingOpening");
function analysisDepthProblems(text) {
  var sp = splitAnalysis(text);
  if (!sp.analysis) return ["no systems analysis section: after the reported facts, add at least " + ANALYSIS_MIN_PARAS + " paragraphs, begun by a line containing exactly " + ANALYSIS_MARK + ", that name the parties in this story, what each is rewarded or punished for, the constraint or missing information that shapes their choices, who gains and who pays, and where the same arrangement operates beyond this case; reason openly and add no new name, date, number or event"];
  var paras = sp.analysis.split(/\n{2,}/).map(function(x) {
    return x.trim();
  }).filter(function(x) {
    return x.length >= 120 && !/^\s*(worth your time:|FORECAST-JSON:|#)/i.test(x);
  });
  var len = paras.join(" ").replace(/\s+/g, " ").length, out = [];
  if (len < ANALYSIS_MIN_CHARS || paras.length < ANALYSIS_MIN_PARAS) out.push("systems analysis too thin (" + paras.length + " paragraphs, " + len + " chars; need " + ANALYSIS_MIN_PARAS + " and " + ANALYSIS_MIN_CHARS + "): after the " + ANALYSIS_MARK + " line, name the parties in this story and what each is rewarded or punished for, the constraint or missing information that shapes their choices, who gains and who pays, and where the same arrangement operates beyond this case; reason openly and add no new name, date, number or event");
  if (paras.length && danglingOpening(paras[0], sp.report)) out.push("the systems analysis opens with '" + paras[0].split(/\s+/).slice(0, 4).join(" ") + "', which refers to something the piece never explains: first state it from the reported facts");
  return out;
}
__name(analysisDepthProblems, "analysisDepthProblems");
function factRevisionPrompt(prompt, draft, problems, ground, forecastExtra) {
  var d = String(draft || "") + (forecastExtra ? "\nFORECAST-JSON: " + JSON.stringify(forecastExtra) : "") + "\nworth your time: yes - revised for accuracy";
  var depth = (problems || []).filter(function(x) {
    return /^(no systems analysis section|systems analysis too thin|the systems analysis opens|keep the first paragraph a news lede)/.test(String(x));
  });
  var facts = (problems || []).filter(function(x) {
    return depth.indexOf(x) < 0;
  });
  return prompt + "\n\n--- " + (facts.length ? "FACT REVISION: independent fact-checkers rejected your draft. Every item below is a claim the source material does not support. Return the SAME piece in the SAME output format (H1 title first, then the prose" + (forecastExtra ? ", the FORECAST-JSON line" : "") + ", and the final 'worth your time' line) with each such name, date, figure or claim deleted or replaced by general reasoning or a labelled hypothetical that names no real person, company, product, date or number. Add no new facts. Keep everything else. Problems:\n- " + facts.join("\n- ") : "ANALYSIS REVISION: the reporting in your draft passed the fact check; its systems analysis did not meet the bar. Return the SAME piece in the SAME output format (H1 title first, then the prose" + (forecastExtra ? ", the FORECAST-JSON line" : "") + ", and the final 'worth your time' line). Keep the lede and the reporting exactly as they are. Add no new facts.") + (depth.length ? "\nALSO REQUIRED:\n- " + depth.join("\n- ") : "") + "\n--- SOURCE MATERIAL (the only facts you may use) ---\n" + String(ground).slice(0, 7e3) + "\n--- DRAFT TO REVISE ---\n" + d;
}
__name(factRevisionPrompt, "factRevisionPrompt");
var EXTEND_AIM_CHARS = 3600;
function shortOnly(problems) {
  return !!(problems && problems.length) && problems.every(function(p) {
    return /^too short after pruning \(/.test(String(p));
  });
}
__name(shortOnly, "shortOnly");
function extendRevisionPrompt(prompt, draft, cutClaims, ground) {
  var have = publishBody(draft).length;
  var cut = (cutClaims || []).map(function(x) {
    return String(x).replace(/\s+/g, " ").trim().slice(0, 200);
  }).filter(Boolean).slice(0, 12);
  return prompt + "\n\n--- LENGTH REVISION: independent fact-checkers flagged some sentences of your draft and they were deleted. The draft below is what remains, and it now has " + have + " characters of body; it needs at least " + PUBLISH_MIN_CHARS + " (aim for about " + EXTEND_AIM_CHARS + "). Return the SAME piece in the SAME output format (H1 title first, then the prose, and the final 'worth your time' line). Keep every sentence of the draft word for word and in order, the opening paragraph included, and add new sentences where they belong, built only from facts the SOURCE MATERIAL states: who did what, how the system works, what the source reports and why it matters, with any reasoning from those facts framed as reasoning. Add no name, date, figure, quotation or claim that the SOURCE MATERIAL does not state." + (cut.length ? " These sentences were deleted because the source does not support them; do not restate them or their claims in any form:\n- " + cut.join("\n- ") : "") + "\n--- SOURCE MATERIAL (the only facts you may use) ---\n" + String(ground).slice(0, 7e3) + "\n--- DRAFT TO EXTEND ---\n" + String(draft || "");
}
__name(extendRevisionPrompt, "extendRevisionPrompt");
function normForMatch(t) {
  return String(t || "").toLowerCase().replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d"]/g, "").replace(/[^a-z0-9' -]+/g, " ").replace(/\s+/g, " ").trim();
}
__name(normForMatch, "normForMatch");
var FUZZY_MIN_SHARED = 4;
var FUZZY_MIN_SHARE = 0.6;
function contentWords(t) {
  return normForMatch(t).split(" ").filter(function(w) {
    return w.length >= 4 && !/^(that|this|with|from|have|were|their|there|which|when|what|into|than|then|they|them|been|also|only|more|most|such|does|each|over|will|would|could|should|about|after|before|because|while|where)$/.test(w);
  });
}
__name(contentWords, "contentWords");
function pruneUnsupported(text, problems, popts) {
  var needles = [];
  (problems || []).forEach(function(pr) {
    var m = String(pr).match(/^unsupported claim:\s*([\s\S]*?)(?:\s+--\s+[\s\S]*)?$/);
    if (m) {
      var q = normForMatch(m[1]);
      if (q.length >= 18) needles.push({ nd: q.slice(0, 90), raw: m[1], hit: false });
      return;
    }
    var n = String(pr).match(/^(?:name|figure|year) not in the source:\s*(.+)$/i);
    if (n) {
      var w = normForMatch(n[1]);
      if (w) needles.push({ nd: "" + w, raw: "", hit: false });
    }
  });
  if (!needles.length) return { text, removed: [] };
  var vline = String(text).match(VERDICT_LINE_RE);
  var body = vline ? String(text).replace(VERDICT_LINE_RE, "").replace(/\s+$/, "") : String(text);
  var paras = body.split(/\n{2,}/).map(function(para) {
    if (/^\s*#\s/.test(para) || /^\s*(FORECAST-JSON:|worth your time:)/i.test(para)) return { fixed: para };
    return { lede: false, sents: para.split(/(?<=[.!?])\s+(?=[A-Z"\u201c])/).map(function(sn) {
      return { sn, cut: false };
    }) };
  });
  for (var li = 0; li < paras.length; li++) {
    if (paras[li].sents) {
      paras[li].lede = true;
      break;
    }
  }
  var inAnalysis = false;
  paras.forEach(function(p) {
    if (p.sents && p.sents.length === 1 && ANALYSIS_MARK_RE.test(p.sents[0].sn)) {
      p.fixed = p.sents[0].sn;
      p.sents = null;
      inAnalysis = true;
      return;
    }
    if (inAnalysis && popts && popts.keepAnalysis && p.sents) {
      p.fixed = p.sents.map(function(x) {
        return x.sn;
      }).join(" ");
      p.sents = null;
    }
  });
  var ledeHit = false;
  paras.forEach(function(p) {
    (p.sents || []).forEach(function(x) {
      var ns = normForMatch(x.sn);
      for (var i = 0; i < needles.length; i++) {
        var nd = needles[i].nd, hit;
        if (nd.charAt(0) === "") hit = (" " + ns + " ").indexOf(" " + nd.slice(1) + " ") >= 0;
        else hit = ns.indexOf(nd.slice(0, Math.min(nd.length, 60))) >= 0 || ns.length >= 30 && nd.indexOf(ns.slice(0, Math.min(ns.length, 60))) >= 0;
        if (hit) {
          x.cut = true;
          needles[i].hit = true;
        }
      }
    });
  });
  paras.forEach(function(p) {
    if (!p.lede || !p.sents) return;
    var live = p.sents.filter(function(x) {
      return x.sn.trim();
    });
    if (live.length && live.every(function(x) {
      return x.cut;
    })) {
      live.forEach(function(x) {
        x.cut = false;
      });
      ledeHit = true;
    }
  });
  needles.forEach(function(n) {
    if (n.hit || !n.raw) return;
    var want = contentWords(n.raw);
    if (want.length < FUZZY_MIN_SHARED) return;
    var best = null, bestShared = 0;
    paras.forEach(function(p) {
      (p.sents || []).forEach(function(x) {
        if (x.cut) return;
        x.inLede = !!p.lede;
        var have = contentWords(x.sn), shared = want.filter(function(w) {
          return have.indexOf(w) >= 0;
        }).length;
        if (shared > bestShared) {
          bestShared = shared;
          best = x;
        }
      });
    });
    if (best && bestShared >= FUZZY_MIN_SHARED && bestShared / want.length >= FUZZY_MIN_SHARE) {
      if (best.inLede) ledeHit = true;
      else best.cut = true;
      n.hit = true;
    }
  });
  var prevCut = false, seen = "";
  paras.forEach(function(p) {
    if (!p.sents) {
      prevCut = false;
      seen += " " + (p.fixed || "");
      return;
    }
    p.sents.forEach(function(x) {
      if (!x.cut && prevCut && !p.lede && danglingOpening(x.sn, seen)) x.cut = true;
      prevCut = x.cut;
      if (!x.cut) seen += " " + x.sn;
    });
  });
  var removed = [], keep = [];
  paras.forEach(function(p) {
    if (p.fixed != null) {
      keep.push(p.fixed);
      return;
    }
    var out = [];
    p.sents.forEach(function(x) {
      if (x.cut) removed.push(x.sn.slice(0, 120));
      else out.push(x.sn);
    });
    if (out.length) keep.push(out.join(" "));
  });
  return { text: keep.join("\n\n") + (vline ? "\n\n" + vline[0].trim() : ""), removed, ledeHit };
}
__name(pruneUnsupported, "pruneUnsupported");
async function verifyAndRevise(env, a) {
  var opts = { forecast: !!a.forecast };
  var vr = await verifyPiece(env, a.piece.text, a.ground, a.piece.model, a.seedText, opts);
  var depthHeld = null;
  if (vr.ok) {
    var pi0 = pruneInferences(a.piece, vr, a.banned, a.forecast);
    var dp0 = a.forecast ? [] : analysisDepthProblems(pi0.piece.text);
    if (!dp0.length) return { ok: true, piece: pi0.piece, vr, problems: [], pruned: pi0.removed };
    depthHeld = dp0;
  }
  if (vr.unavailable) return { ok: false, piece: a.piece, vr, problems: vr.problems };
  var cur = a.piece, problems = depthHeld || vr.problems, pruned = 0, revised = 0, trail = depthHeld ? ["r0 passed; analysis held: " + depthHeld[0].slice(0, 50)] : [];
  var shortPruned = null, cutClaims = [];
  function fail(extra) {
    return { ok: false, piece: a.piece, vr, problems: problems.concat(extra || [], ["repair trail: " + trail.join(", ") + (vr && vr.analysisMode ? "; analysis section: " + vr.analysisMode : "")]) };
  }
  __name(fail, "fail");
  var repairT0 = Date.now();
  for (var round = 0; round < PRUNE_ROUNDS_MAX && (round < PRUNE_ROUNDS || Date.now() - repairT0 < PRUNE_BUDGET_MS); round++) {
    if (a.deadline && Date.now() > a.deadline) {
      trail.push("r" + (round + 1) + " stopped: the tick budget is spent");
      break;
    }
    var cand = null;
    if (!a.forecast) {
      var pr = pruneUnsupported(cur.text, problems);
      if (pr.ledeHit) {
        trail.push("r" + (round + 1) + " prune blocked: a flagged claim is in the lede");
        problems = problems.concat(["a flagged claim is in the opening paragraph: rewrite the lede from the source's own facts (who did what, where it appeared, when, why it matters)"]);
      } else if (pr.removed.length) {
        var gp = prunedGateProblems(pr.text, a.banned).concat(ledeProblems(pr.text, a.src));
        if (!gp.length) {
          cand = { text: pr.text, model: cur.model, extra: cur.extra, pruned: (cur.pruned || 0) + pr.removed.length };
          pruned += pr.removed.length;
          cutClaims = cutClaims.concat(pr.removed);
          trail.push("r" + (round + 1) + " prune -" + pr.removed.length + " (" + pr.text.length + " chars)");
        } else {
          trail.push("r" + (round + 1) + " prune blocked: " + gp[0].slice(0, 60));
          problems = problems.concat(["pruning the unsupported sentences left a draft that failed the gate: " + gp.slice(0, 2).join("; ")]);
          if (shortOnly(gp)) {
            shortPruned = pr.text;
            cutClaims = cutClaims.concat(pr.removed);
          }
        }
      } else trail.push("r" + (round + 1) + " prune located nothing");
    }
    if (!cand) {
      if (revised >= 1) return fail();
      revised++;
      var rev = null;
      var revProblems = a.src && a.src.title ? problems.concat(["keep the first paragraph a news lede, at most 70 words, that names " + String(a.src.title).slice(0, 120) + (a.src.url ? " and where it appeared (" + hostOf(a.src.url) + ")" : "") + " and says what happened and why it matters"]) : problems;
      var base = shortPruned || cur.text;
      if (shortPruned) trail.push("r" + (round + 1) + " extending the pruned draft (" + publishBody(shortPruned).length + " chars of body)");
      try {
        rev = await compose(env, shortPruned ? extendRevisionPrompt(a.prompt, shortPruned, cutClaims, a.ground) : factRevisionPrompt(a.prompt, cur.text, revProblems, a.ground, a.forecast ? cur.extra : null), a.banned, void 0, a.xform);
      } catch (e) {
        rev = null;
      }
      if (!rev || !rev.text) return fail([shortPruned ? "length revision produced no draft" : "fact revision produced no draft"]);
      if (a.forecast && !rev.extra && cur.extra) rev.extra = cur.extra;
      if (!a.forecast) {
        rev.text = carryFormat(rev.text, base);
        var rp = prunedGateProblems(rev.text, a.banned);
        if (rp.length && phraseLevelOnly(rp)) {
          var rfr = framingRepair(rev.text, rp, function(t) {
            return prunedGateProblems(t, a.banned);
          });
          if (rfr && rfr.accepted) {
            rev.text = rfr.text;
            trail.push("r" + (round + 1) + " revision framing repair -" + rfr.removed.length);
          }
        }
      }
      var sp = a.forecast ? forecastProblems(rev, a.banned) : prunedGateProblems(rev.text, a.banned);
      if (sp.length) return fail(["fact revision failed the editorial gate: " + sp.join("; ")]);
      trail.push("r" + (round + 1) + (shortPruned ? " length revision (" + publishBody(rev.text).length + " chars of body)" : " model revision"));
      cand = rev;
      shortPruned = null;
    }
    vr = await verifyPiece(env, cand.text, a.ground, cand.model, a.seedText, opts);
    if (vr.ok) {
      var pi1 = pruneInferences(cand, vr, a.banned, a.forecast);
      var dp1 = a.forecast ? [] : analysisDepthProblems(pi1.piece.text);
      if (!dp1.length) return { ok: true, piece: pi1.piece, vr, problems: [], pruned: pruned + pi1.removed };
      trail.push("r" + (round + 1) + " passed; analysis held: " + dp1[0].slice(0, 50));
      cur = cand;
      problems = dp1;
      continue;
    }
    if (vr.unavailable) {
      problems = vr.problems;
      return fail();
    }
    cur = cand;
    problems = vr.problems;
  }
  return fail();
}
__name(verifyAndRevise, "verifyAndRevise");
var PRUNE_ROUNDS = 5;
var PRUNE_ROUNDS_MAX = 8;
var TICK_BUDGET_MS = 78e4;
var ESSAY_AFTER_FORECAST_MS = 24e4;
var PRUNE_BUDGET_MS = 36e4;
var PRUNE_FLOOR = 3e3;
var FLOOR_MIN_PARAS = 4;
function gateAtFloor(text, banned, floor, label) {
  var ps = gate(text, banned).problems.filter(function(p) {
    return !/^too short \(/.test(p);
  }).filter(function(p) {
    var m = p.match(/^insufficient prose \((\d+) substantial paragraphs\)$/);
    return !m || Number(m[1]) < FLOOR_MIN_PARAS;
  });
  if (String(text).length < floor) ps.unshift("too short " + label + " (" + String(text).length + " chars; floor " + floor + ")");
  return ps;
}
__name(gateAtFloor, "gateAtFloor");
function prunedGateProblems(text, banned) {
  var ps = gateAtFloor(text, banned, 0, "after pruning");
  var n = publishBody(text).length;
  if (n < PUBLISH_MIN_CHARS) ps.unshift("too short after pruning (" + n + " chars of body; floor " + PUBLISH_MIN_CHARS + ")");
  return ps;
}
__name(prunedGateProblems, "prunedGateProblems");
var EDIT_FLOOR = 1800;
function editGateProblems(text, banned, forecast) {
  return forecast ? gate(text, banned).problems : gateAtFloor(text, banned, EDIT_FLOOR, "after editing");
}
__name(editGateProblems, "editGateProblems");
function auditSeed(slug) {
  return "audit:" + slug;
}
__name(auditSeed, "auditSeed");
async function retractPiece(env, slug, reason, claims) {
  await ensureAccuracySchema(env);
  var now = nowIso(), cj = JSON.stringify((claims || []).slice(0, 8));
  await env.DB.prepare("INSERT OR REPLACE INTO q08_retractions (slug, reason, claims_json, retracted_at) VALUES (?,?,?,?)").bind(slug, String(reason || "").slice(0, 400), cj, now).run();
  try {
    var kids = await env.DB.prepare("SELECT slug FROM q08_forecasts WHERE source_slug = ?").bind(slug).all();
    for (var kid of kids.results || []) {
      await env.DB.prepare("INSERT OR IGNORE INTO q08_retractions (slug, reason, claims_json, retracted_at) VALUES (?,?,?,?)").bind(kid.slug, "Built on an essay that was retracted for unsupported claims.", "[]", now).run();
      await env.DB.prepare("UPDATE q08_forecasts SET status = 'void', disposition = 'retracted', resolved_at = ?1 WHERE slug = ?2 AND status = 'open'").bind(now, kid.slug).run().catch(function(e) {
        console.error(JSON.stringify({ evt: "q08-signal-engine:retractPiece:caught", error: String(e && e.message || e) }));
      });
    }
  } catch (e) {
    console.error(JSON.stringify({ evt: "q08-signal-engine:retractPiece:caught", error: String(e && e.message || e) }));
  }
  try {
    if (env.AUDIT) await env.AUDIT.prepare("UPDATE social_threads SET status = 'suppressed', notes = COALESCE(notes,'') || ' | Q08-VERIFY-1: piece retracted' WHERE status = 'queued' AND slug LIKE 'q08-%' AND posts LIKE ?1").bind("%/p/" + slug + "%").run();
  } catch (e) {
    console.error(JSON.stringify({ evt: "q08-signal-engine:retractPiece:caught", error: String(e && e.message || e) }));
  }
  return { ok: true, slug };
}
__name(retractPiece, "retractPiece");
async function recordAudit(env, slug, verdict, stage, vr) {
  await ensureAccuracySchema(env);
  await env.DB.prepare("INSERT OR REPLACE INTO q08_audits (slug, verdict, stage, models, unsupported_json, checked_at) VALUES (?,?,?,?,?,?)").bind(slug, verdict, stage, (vr.judges || []).map(function(j) {
    return j.model;
  }).join(","), JSON.stringify((vr.problems || []).slice(0, 10)), nowIso()).run();
}
__name(recordAudit, "recordAudit");
async function groundForPublished(env, p) {
  var parts = [p.title || "", p.core_concept || ""];
  var sig = null;
  try {
    sig = await env.DB.prepare("SELECT title, url, friction_point FROM signal_log WHERE id = ?").bind(p.signal_id).first();
  } catch (e) {
    sig = null;
  }
  if (sig) {
    parts.push(sig.title || "", sig.friction_point || "");
  }
  if (p.kind === "forecast") {
    var fr = await env.DB.prepare("SELECT source_slug FROM q08_forecasts WHERE slug = ?").bind(p.slug).first().catch(function() {
      return null;
    });
    var src = fr && await env.DB.prepare("SELECT title, body_md FROM published_pieces WHERE slug = ?").bind(fr.source_slug).first().catch(function() {
      return null;
    });
    if (src) parts.push(src.title || "", src.body_md || "");
  } else if (sig && sig.url) {
    parts.push(await fetchArticleText(articleUrlFor(sig)));
  }
  return parts.join("\n").slice(0, GROUND_MAX + 8e3);
}
__name(groundForPublished, "groundForPublished");
async function repairPublished(env, p, ground, problems) {
  if (p.kind === "forecast") return { ok: false, reason: "forecasts are retracted, not repaired" };
  var draft = "# " + p.title + "\n" + p.body_md;
  var rev = null;
  try {
    rev = await compose(env, factRevisionPrompt(Q08_DIRECTIVE, draft, problems, ground, null), []);
  } catch (e) {
    rev = null;
  }
  if (!rev || !rev.text) return { ok: false, reason: "no revision produced" };
  var text = rev.text.replace(/\n?worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-].*$/im, "").trim();
  var tm = text.match(/^#\s+(.+)$/m);
  if (!tm) return { ok: false, reason: "revision lost its title" };
  var body = text.replace(/^#\s+.+\n?/, "").trim();
  if (body.length < 1500) return { ok: false, reason: "revision too short to stand as an essay" };
  var vr = await verifyPiece(env, text, ground, rev.model, auditSeed(p.slug) + ":repair", { forecast: false, today: String(p.published_at || "").slice(0, 10) || utcDay() });
  if (!vr.ok) return { ok: false, reason: vr.problems.slice(0, 3).join("; "), unavailable: vr.unavailable, vr };
  var note = "*Corrected " + utcDay() + ": a fact-check against the source material removed statements it did not support.*\n\n";
  await env.DB.prepare("UPDATE published_pieces SET title = ?1, body_md = ?2 WHERE slug = ?3").bind(tm[1].trim(), note + body, p.slug).run();
  return { ok: true, vr };
}
__name(repairPublished, "repairPublished");
async function auditPublished(env, limit) {
  if (!await ensureAccuracySchema(env)) return { ok: false, reason: "schema" };
  var rows = await env.DB.prepare(
    "SELECT p.id, p.slug, p.title, p.body_md, p.core_concept, p.signal_id, p.kind, p.published_at FROM published_pieces p WHERE p.slug NOT IN (SELECT slug FROM q08_retractions) AND p.slug NOT IN (SELECT slug FROM q08_audits) ORDER BY p.published_at DESC LIMIT ?1"
  ).bind(limit || 3).all();
  var res = { checked: 0, passed: 0, repaired: 0, retracted: 0, deferred: 0, restored: 0 };
  for (var p of rows.results || []) {
    var ground = await groundForPublished(env, p);
    var vr = await verifyPiece(env, "# " + p.title + "\n" + p.body_md, ground, "", auditSeed(p.slug), { forecast: p.kind === "forecast", today: String(p.published_at || "").slice(0, 10) || utcDay() });
    if (vr.unavailable) {
      res.deferred++;
      continue;
    }
    res.checked++;
    if (vr.ok) {
      await recordAudit(env, p.slug, "pass", vr.stage, vr);
      res.passed++;
      continue;
    }
    var rp = await repairPublished(env, p, ground, vr.problems);
    if (rp.unavailable) {
      res.deferred++;
      continue;
    }
    if (rp.ok) {
      await recordAudit(env, p.slug, "pass", "repaired", rp.vr);
      res.repaired++;
      continue;
    }
    await recordAudit(env, p.slug, "fail", vr.stage, vr);
    await retractPiece(env, p.slug, "Retracted after an accuracy audit: the piece contained claims the source material does not support (" + vr.stage + " check) and could not be repaired.", vr.problems);
    res.retracted++;
  }
  var rest = await env.DB.prepare(
    "SELECT p.id, p.slug, p.title, p.body_md, p.core_concept, p.signal_id, p.kind, p.published_at FROM q08_retractions r JOIN published_pieces p ON p.slug = r.slug WHERE r.reason LIKE 'Retracted after an accuracy audit%' AND COALESCE(p.kind,'analysis') != 'forecast' AND r.reason NOT LIKE '%could not be repaired%' AND p.slug NOT IN (SELECT slug FROM q08_audits WHERE stage = 'repair-failed') ORDER BY p.published_at DESC LIMIT ?1"
  ).bind(Math.max(1, Math.min(3, limit || 3))).all().catch(function() {
    return { results: [] };
  });
  for (var q of rest.results || []) {
    var g2 = await groundForPublished(env, q);
    var v2 = await verifyPiece(env, "# " + q.title + "\n" + q.body_md, g2, "", auditSeed(q.slug) + ":restore", { forecast: false, today: String(q.published_at || "").slice(0, 10) || utcDay() });
    if (v2.unavailable) {
      res.deferred++;
      continue;
    }
    var r2 = v2.ok ? { ok: true, vr: v2 } : await repairPublished(env, q, g2, v2.problems);
    if (r2.unavailable) {
      res.deferred++;
      continue;
    }
    if (r2.ok) {
      await env.DB.prepare("DELETE FROM q08_retractions WHERE slug = ?1").bind(q.slug).run();
      await recordAudit(env, q.slug, "pass", "restored", r2.vr);
      res.restored++;
    } else {
      await recordAudit(env, q.slug, "fail", "repair-failed", { judges: [], problems: [r2.reason] });
      await env.DB.prepare("UPDATE q08_retractions SET reason = reason || ' (could not be repaired)' WHERE slug = ?1").bind(q.slug).run();
    }
  }
  return Object.assign({ ok: true }, res);
}
__name(auditPublished, "auditPublished");
function renderRetraction(r, p) {
  var claims = [];
  try {
    claims = JSON.parse(r.claims_json || "[]");
  } catch (e) {
    claims = [];
  }
  var date = String(r.retracted_at || "").slice(0, 10);
  var list = claims.length ? "<p>Examples of what could not be verified:</p><ul>" + claims.slice(0, 5).map(function(c) {
    return "<li>" + escHtml(c) + "</li>";
  }).join("") + "</ul>" : "";
  return '<meta name="robots" content="noindex"><article class="q08-piece"><p class="q-eyebrow"><a href="/" style="text-decoration:none;color:inherit">\u2190 Index</a></p><h1 class="q08-t">Retracted: ' + q08Inline(p && p.title || "this piece") + '</h1><p class="q-meta">Retracted ' + escHtml(date) + "</p><p>q08 withdrew this piece. " + escHtml(r.reason || "") + ' Every q08 piece is now checked against its source material by two independent reviewers before publication, and earlier pieces are being re-audited; any that fail are withdrawn and listed on the <a href="/retractions">retractions page</a>.</p>' + list + "</article>";
}
__name(renderRetraction, "renderRetraction");
function renderRetractions(rows) {
  var items = (rows || []).map(function(r) {
    return '<li><a href="/p/' + escHtml(r.slug) + '">' + q08Inline(r.title || r.slug) + "</a> \u2014 retracted " + escHtml(String(r.retracted_at || "").slice(0, 10)) + "</li>";
  }).join("");
  return '<article class="q08-piece"><p class="q-eyebrow"><a href="/" style="text-decoration:none;color:inherit">\u2190 Index</a></p><h1 class="q08-t">Corrections and retractions</h1><p>q08 publishes only claims its source material supports. When a piece is found to contain an unsupported claim, it is withdrawn and listed here.</p>' + (items ? "<ul>" + items + "</ul>" : "<p>No piece has been retracted.</p>") + "</article>";
}
__name(renderRetractions, "renderRetractions");
function plainText(h) {
  return String(h || "").replace(/<script\b[\s\S]*?<\/script[^>]*>/gi, " ").replace(/<style\b[\s\S]*?<\/style[^>]*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
__name(plainText, "plainText");
async function evidenceFetch(url, ms) {
  var r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(ms || 15e3) });
  if (!r.ok) throw new Error("http " + r.status);
  return r;
}
__name(evidenceFetch, "evidenceFetch");
var EVIDENCE_SOURCES = [
  { name: "Hacker News", run: /* @__PURE__ */ __name(async function(q, sinceSec) {
    var d = await (await evidenceFetch("https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=8&query=" + encodeURIComponent(q) + "&numericFilters=" + encodeURIComponent("created_at_i>" + sinceSec))).json();
    return (d.hits || []).slice(0, 8).map(function(h) {
      return "Hacker News story, " + String(h.created_at || "").slice(0, 10) + ", " + (h.points || 0) + " points: " + String(h.title || "").slice(0, 200) + (h.url ? " (" + String(h.url).slice(0, 160) + ")" : "");
    });
  }, "run") },
  { name: "news", run: /* @__PURE__ */ __name(async function(q, sinceSec) {
    var start = new Date(Math.max(sinceSec, Date.now() / 1e3 - 86400 * 365) * 1e3).toISOString().replace(/[-:T]/g, "").slice(0, 14);
    var d = await (await evidenceFetch("https://api.gdeltproject.org/api/v2/doc/doc?mode=artlist&format=json&maxrecords=10&sort=datedesc&startdatetime=" + start + "&query=" + encodeURIComponent(q))).json();
    return (d.articles || []).slice(0, 8).map(function(a) {
      var sd = String(a.seendate || "");
      return "News article (" + String(a.domain || "").slice(0, 60) + "), " + sd.slice(0, 4) + "-" + sd.slice(4, 6) + "-" + sd.slice(6, 8) + ": " + String(a.title || "").slice(0, 200) + (a.url ? " (" + String(a.url).slice(0, 160) + ")" : "");
    });
  }, "run") },
  { name: "Wikipedia", run: /* @__PURE__ */ __name(async function(q) {
    var d = await (await evidenceFetch("https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=" + encodeURIComponent(q))).json();
    return (d.query && d.query.search || []).slice(0, 3).map(function(h) {
      return "Wikipedia article '" + String(h.title || "").slice(0, 100) + "', last edited " + String(h.timestamp || "").slice(0, 10) + ": " + plainText(h.snippet).slice(0, 300);
    });
  }, "run") },
  { name: "arXiv", run: /* @__PURE__ */ __name(async function(q, sinceSec) {
    var x = await (await evidenceFetch("https://export.arxiv.org/api/query?sortBy=submittedDate&sortOrder=descending&max_results=5&search_query=all:" + encodeURIComponent('"' + q + '"'))).text();
    var out = [];
    for (var m of x.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      var t = (m[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1], pub = (m[1].match(/<published>([^<]*)<\/published>/) || [])[1] || "";
      if (t && Date.parse(pub) / 1e3 > sinceSec) out.push("arXiv paper, " + pub.slice(0, 10) + ": " + plainText(t).slice(0, 200));
    }
    return out;
  }, "run") }
];
async function gatherEvidence(f) {
  var ev = [];
  var since = Math.floor(Date.parse(f.created_at) / 1e3) || 0;
  var q = String(f.watch_query || "").trim();
  var got = await Promise.all(EVIDENCE_SOURCES.map(function(s) {
    return s.run(q, since).catch(function() {
      return [];
    });
  }));
  for (var g of got) for (var line of g) ev.push(line);
  var urls = [];
  try {
    urls = JSON.parse(f.watch_urls || "[]");
  } catch (e) {
    urls = [];
  }
  for (var wu of (Array.isArray(urls) ? urls : []).slice(0, 2)) {
    var pu = publicHttpsUrl(wu);
    if (!pu) continue;
    try {
      var pr = await fetch(pu, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12e3), redirect: "follow" });
      if (!pr.ok) continue;
      var len = Number(pr.headers.get("content-length") || 0);
      if (len > 3e6) continue;
      ev.push("Page " + pu + " as fetched " + nowIso().slice(0, 10) + ": " + plainText((await pr.text()).slice(0, 4e5)).slice(0, 3e3));
    } catch (e) {
      console.error(JSON.stringify({ evt: "q08-signal-engine:gatherEvidence:caught", error: String(e && e.message || e) }));
    }
  }
  return ev;
}
__name(gatherEvidence, "gatherEvidence");
var FORECAST_JUDGE_PROMPT = [
  "You settle forecasts for a publication. Use only the evidence listed below and the dates given; use no outside knowledge.",
  'Answer with exactly one JSON object and nothing else: {"outcome": "yes" or "no" or "unclear", "basis": "the evidence number and a short paraphrase of what it shows"}.',
  "yes: the evidence directly shows the resolution condition was met on or before the horizon date.",
  "no: the evidence directly shows the horizon date has passed and the condition was not met, or that the opposite happened. Not finding evidence that something happened is NOT evidence that it did not.",
  "unclear: anything else, including no evidence, off-topic evidence, or evidence that is dated after the horizon and does not say when the condition became true."
].join("\n");
function parseJudgeVerdict(text) {
  var m = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  var o;
  try {
    o = JSON.parse(m[0]);
  } catch (e) {
    return null;
  }
  var out = String(o && o.outcome || "").toLowerCase().trim();
  if (out !== "yes" && out !== "no" && out !== "unclear") return null;
  return { outcome: out, basis: String(o.basis || "").slice(0, 300) };
}
__name(parseJudgeVerdict, "parseJudgeVerdict");
function aggregateJudges(js) {
  var v = (js || []).filter(Boolean);
  if (v.length < 2) return { outcome: "unclear", basis: "fewer than two valid judge verdicts" };
  if (v[0].outcome === v[1].outcome && v[0].outcome !== "unclear") return { outcome: v[0].outcome, basis: v[0].basis };
  return { outcome: "unclear", basis: "judges did not agree or found the evidence insufficient" };
}
__name(aggregateJudges, "aggregateJudges");
async function judgeForecast(env, f, evidence) {
  if (!evidence.length) return { outcome: "unclear", basis: "no public evidence found", judges: [] };
  var body = FORECAST_JUDGE_PROMPT + "\n\nToday: " + utcDay() + "\nForecast made: " + String(f.created_at || "").slice(0, 10) + "\nHorizon date: " + f.horizon + "\nClaim: " + f.claim + "\nResolution condition: " + f.resolution + "\n\nEVIDENCE:\n" + evidence.map(function(e, i) {
    return i + 1 + ". " + e;
  }).join("\n");
  var ids = pickPanel([], 2, seedOf(f.slug));
  var got = await Promise.all(ids.map(async function(id) {
    try {
      var resp = await env.AI.run(id, { messages: [{ role: "user", content: body }], max_tokens: READER_MAX_TOKENS, temperature: 0.1 }, { signal: AbortSignal.timeout(9e4) });
      var out = aiReplyText(resp);
      var v = parseJudgeVerdict(out);
      if (v) v.model = id;
      return v;
    } catch (e) {
      return null;
    }
  }));
  var agg = aggregateJudges(got);
  agg.judges = got.filter(Boolean).map(function(j) {
    return { model: j.model, outcome: j.outcome };
  });
  return agg;
}
__name(judgeForecast, "judgeForecast");
async function resolveForecasts(env, max) {
  if (!await ensureForecastSchema(env)) return { checked: 0 };
  var cutoff = new Date(Date.now() - FORECAST_RECHECK_DAYS * 864e5 + 36e5).toISOString();
  var due = await env.DB.prepare("SELECT * FROM q08_forecasts WHERE status = 'open' AND horizon <= ?1 AND (last_check_at IS NULL OR last_check_at <= ?2) ORDER BY horizon ASC LIMIT ?3").bind(utcDay(), cutoff, max || 2).all();
  var done = 0;
  for (var f of due.results || []) {
    var ev = await gatherEvidence(f);
    var v = await judgeForecast(env, f, ev);
    var now = nowIso(), checks = (Number(f.checks) || 0) + 1;
    var evJson = JSON.stringify({ at: now, evidence: ev.map(function(e) {
      return e.slice(0, 400);
    }), verdict: v.outcome, basis: v.basis, judges: v.judges }).slice(0, 6e3);
    if (v.outcome === "yes" || v.outcome === "no") {
      var oc = v.outcome === "yes" ? 1 : 0, br = Math.round(Math.pow(Number(f.probability) - oc, 2) * 1e4) / 1e4;
      await env.DB.prepare("UPDATE q08_forecasts SET status = 'resolved', outcome = ?1, brier = ?2, checks = ?3, last_check_at = ?4, resolved_at = ?4, disposition = ?5, evidence_json = ?6 WHERE id = ?7 AND status = 'open'").bind(oc, br, checks, now, ("resolved " + v.outcome + ": " + v.basis).slice(0, 400), evJson, f.id).run();
    } else if (checks >= FORECAST_MAX_CHECKS) {
      await env.DB.prepare("UPDATE q08_forecasts SET status = 'void', checks = ?1, last_check_at = ?2, resolved_at = ?2, disposition = ?3, evidence_json = ?4 WHERE id = ?5 AND status = 'open'").bind(checks, now, ("void: no decidable public evidence after " + checks + " checks. Last basis: " + v.basis).slice(0, 400), evJson, f.id).run();
    } else {
      await env.DB.prepare("UPDATE q08_forecasts SET checks = ?1, last_check_at = ?2, evidence_json = ?3 WHERE id = ?4 AND status = 'open'").bind(checks, now, evJson, f.id).run();
    }
    done++;
  }
  return { checked: done };
}
__name(resolveForecasts, "resolveForecasts");
function calibration(rows) {
  var r = (rows || []).filter(function(x) {
    return x && (x.outcome === 0 || x.outcome === 1) && isFinite(Number(x.probability));
  });
  var n = r.length;
  var out = { n, brier: null, hit_rate: null, baseline_brier: 0.25, bins: [], reliable: n >= 20 };
  if (!n) return out;
  var sb = 0, hits = 0;
  r.forEach(function(x) {
    sb += Math.pow(Number(x.probability) - x.outcome, 2);
    hits += x.outcome;
  });
  out.brier = Math.round(sb / n * 1e3) / 1e3;
  out.hit_rate = Math.round(hits / n * 1e3) / 1e3;
  [[0.05, 0.3], [0.3, 0.5], [0.5, 0.7], [0.7, 0.96]].forEach(function(b) {
    var g = r.filter(function(x) {
      var p = Number(x.probability);
      return p >= b[0] && p < b[1];
    });
    if (!g.length) return;
    var mp = g.reduce(function(a, x) {
      return a + Number(x.probability);
    }, 0) / g.length, fq = g.reduce(function(a, x) {
      return a + x.outcome;
    }, 0) / g.length;
    out.bins.push({ from: b[0], to: b[1], n: g.length, mean_probability: Math.round(mp * 1e3) / 1e3, observed_frequency: Math.round(fq * 1e3) / 1e3 });
  });
  return out;
}
__name(calibration, "calibration");
async function forecastStats(env) {
  var out = { published_7d: 0, open: 0, overdue_open: 0, resolved: 0, void: 0, void_share: null, calibration: calibration([]) };
  if (!await ensureForecastSchema(env)) return out;
  try {
    var since = new Date(Date.now() - 7 * 864e5).toISOString();
    var a = await env.DB.prepare("SELECT COUNT(*) n FROM q08_forecasts WHERE created_at >= ?1").bind(since).first();
    var s = await env.DB.prepare("SELECT status, COUNT(*) n FROM q08_forecasts GROUP BY status").all();
    var od = await env.DB.prepare("SELECT COUNT(*) n FROM q08_forecasts WHERE status = 'open' AND horizon <= ?1").bind(new Date(Date.now() - 35 * 864e5).toISOString().slice(0, 10)).first();
    var rr = await env.DB.prepare("SELECT probability, outcome FROM q08_forecasts WHERE status = 'resolved'").all();
    out.published_7d = Number(a && a.n) || 0;
    (s.results || []).forEach(function(x) {
      if (x.status === "open") out.open = x.n;
      else if (x.status === "resolved") out.resolved = x.n;
      else if (x.status === "void") out.void = x.n;
    });
    out.overdue_open = Number(od && od.n) || 0;
    var fin = out.resolved + out.void;
    out.void_share = fin >= 10 ? Math.round(out.void / fin * 1e3) / 1e3 : null;
    out.calibration = calibration(rr.results || []);
  } catch (e) {
    console.error(JSON.stringify({ evt: "q08-signal-engine:forecastStats:caught", error: String(e && e.message || e) }));
  }
  return out;
}
__name(forecastStats, "forecastStats");
function fcPct(p) {
  return Math.round(Number(p) * 100) + "%";
}
__name(fcPct, "fcPct");
function fcStatus(f) {
  if (f.status === "resolved") return f.outcome === 1 ? "came true" : "did not come true";
  if (f.status === "void") return "void: no decidable public evidence";
  return Date.parse(String(f.horizon) + "T00:00:00Z") <= Date.now() ? "due, being checked" : "open";
}
__name(fcStatus, "fcStatus");
function renderForecastBox(f) {
  if (!f) return "";
  var alts = [];
  try {
    alts = JSON.parse(f.alternatives_json || "[]");
  } catch (e) {
    alts = [];
  }
  var ind = [];
  try {
    ind = JSON.parse(f.indicators_json || "[]");
  } catch (e) {
    ind = [];
  }
  var altText = (Array.isArray(alts) ? alts : []).map(function(a) {
    return q08Inline(String(a.claim || "")) + " (" + fcPct(a.probability) + ")";
  }).join("; ");
  return '<section class="q-panel" style="margin:32px 0 0"><h2 class="q-h3" style="margin:0 0 8px">Forecast record</h2><p style="margin:0 0 8px"><strong>Most likely scenario (' + fcPct(f.probability) + "):</strong> " + q08Inline(f.claim) + '</p><p class="q-meta" style="margin:0 0 6px">Settled by ' + escHtml(f.horizon) + " &middot; status: " + escHtml(fcStatus(f)) + (f.status === "resolved" && f.brier != null ? " &middot; Brier score " + escHtml(String(f.brier)) : "") + '</p><p class="q-meta" style="margin:0 0 6px">Resolves true if: ' + escHtml(f.resolution) + "</p>" + (altText ? '<p class="q-meta" style="margin:0 0 6px">Rival scenarios: ' + altText + "</p>" : "") + (ind.length ? '<p class="q-meta" style="margin:0 0 6px">Watch: ' + ind.map(function(x) {
    return escHtml(String(x));
  }).join("; ") + "</p>" : "") + '<p class="q-meta" style="margin:0"><a href="/forecasts">All forecasts and the scoring record</a></p></section>';
}
__name(renderForecastBox, "renderForecastBox");
function renderForecasts(rows, stats) {
  var item = /* @__PURE__ */ __name(function(f) {
    var extra = f.status === "resolved" ? " &middot; " + escHtml(fcStatus(f)) + (f.brier != null ? " &middot; Brier " + escHtml(String(f.brier)) : "") : " &middot; " + escHtml(fcStatus(f));
    return '<li class="q-item"><a class="q-item-title" href="/p/' + escHtml(f.slug) + '">' + q08Inline(f.claim) + '</a><div class="q-item-meta"><span class="q-badge">' + fcPct(f.probability) + "</span> settled by " + escHtml(f.horizon) + extra + "</div></li>";
  }, "item");
  var open = rows.filter(function(f) {
    return f.status === "open";
  }).sort(function(a, b) {
    return String(a.horizon).localeCompare(String(b.horizon));
  });
  var fin = rows.filter(function(f) {
    return f.status !== "open";
  });
  var c = stats.calibration;
  var cal = c.n ? "Scored so far: " + c.n + " resolved, mean Brier score " + c.brier + " (always saying 50% scores 0.25; lower is better)" + (c.reliable ? "" : ". Under 20 resolved forecasts a score is mostly noise") + ". Void: " + stats.void + (stats.void_share != null ? " (" + Math.round(stats.void_share * 100) + "% of finished)" : "") + "." : "No forecast has been scored yet. Void so far: " + stats.void + ".";
  var body = '<section class="q08-hero"><h1>Forecasts</h1><p class="q-lede">Each forecast takes a mechanism q08 has described and says where it most likely leads: one dated scenario, its probability, the rivals, and a condition anyone can check. When the date passes, two judges from different model families settle it from public evidence and the score is recorded here, misses included. A forecast the evidence cannot settle after four checks is marked void in public.</p><p class="q-meta">' + cal + '</p></section><section class="q08-feed" aria-label="Open forecasts"><h2 class="q-h3">Open</h2>' + (open.length ? '<ul class="q-list">' + open.map(item).join("") + "</ul>" : '<div class="q-note">No open forecasts yet. They appear after every few essays.</div>') + "</section>" + (fin.length ? '<section class="q08-feed" aria-label="Settled forecasts"><h2 class="q-h3">Settled</h2><ul class="q-list">' + fin.map(item).join("") + "</ul></section>" : "") + q08Sub(true);
  return q08Page({ title: "Forecasts \xB7 q08", canonical: ORIGIN + "/forecasts", active: "forecasts", description: "Dated, probability-weighted forecasts built from q08's structural analyses, scored when they resolve." }, body);
}
__name(renderForecasts, "renderForecasts");
var MATH_HEAD = `<script>window.MathJax={tex:{inlineMath:[["\\\\(","\\\\)"]],displayMath:[["$$","$$"],["\\\\[","\\\\]"]],processEscapes:true},svg:{scale:1.1,fontCache:"global"},options:{skipHtmlTags:["script","noscript","style","textarea","pre","code"],enableMenu:false}};function __mq(){if(window.MathJax&&MathJax.typesetPromise){MathJax.typesetPromise().catch(function (e) { console.error('mathjax-typeset', (e && e.message) || e); })}}if(document.readyState==="complete"){setTimeout(__mq,150)}else{window.addEventListener("load",function(){setTimeout(__mq,150)})}<\/script><script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js" onerror="this.onerror=null;var s=document.createElement('script');s.src='https://unpkg.com/mathjax@3/es5/tex-svg.js';document.head.appendChild(s);"><\/script>`;
function safeUrl(u) {
  var x = String(u || "").trim();
  return /^https?:\/\//i.test(x) ? x : "";
}
__name(safeUrl, "safeUrl");
function renderSources(sj) {
  var arr = [];
  try {
    arr = JSON.parse(sj || "[]");
  } catch (e) {
    arr = [];
  }
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
__name(renderSources, "renderSources");
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
    if (u) {
      var host = "";
      try {
        host = new URL(u).hostname.replace(/^www\./, "");
      } catch (e) {
        console.error(JSON.stringify({ evt: "q08-signal-engine:buildSources:caught", error: String(e && e.message || e) }));
      }
      out.push({ label: host || u, url: u });
    }
    if (story.id) out.push({ label: "Hacker News discussion", url: "https://news.ycombinator.com/item?id=" + story.id });
  }
  return out;
}
__name(buildSources, "buildSources");
var Q08_PH0 = "\uE000";
var Q08_PH1 = "\uE001";
var Q08_DOLLAR = "\uE002";
function q08Math(s, store) {
  var keep = /* @__PURE__ */ __name(function(tex, disp) {
    store.push([String(tex), disp]);
    return Q08_PH0 + (store.length - 1) + Q08_PH1;
  }, "keep");
  s = String(s == null ? "" : s).replace(/\\\$/g, Q08_DOLLAR);
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, function(m, t) {
    return keep(t, true);
  });
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, function(m, t) {
    return keep(t, true);
  });
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, function(m, t) {
    return keep(t, false);
  });
  s = s.replace(/\$(?=[^\s$])([^$\n]*?[^\s$])\$(?!\d)/g, function(m, t) {
    return /[\\^_{}]/.test(t) || /^[A-Za-z]$/.test(t) ? keep(t, false) : m;
  });
  return s;
}
__name(q08Math, "q08Math");
function q08Unmath(s, store, f) {
  return s.replace(/\uE000(\d+)\uE001/g, function(m, i) {
    return f(store[+i]);
  }).split(Q08_DOLLAR).join("$");
}
__name(q08Unmath, "q08Unmath");
var Q08_TEX = { alpha: "\u03B1", beta: "\u03B2", gamma: "\u03B3", delta: "\u03B4", epsilon: "\u03B5", varepsilon: "\u03B5", zeta: "\u03B6", eta: "\u03B7", theta: "\u03B8", iota: "\u03B9", kappa: "\u03BA", lambda: "\u03BB", mu: "\u03BC", nu: "\u03BD", xi: "\u03BE", pi: "\u03C0", rho: "\u03C1", sigma: "\u03C3", tau: "\u03C4", phi: "\u03C6", varphi: "\u03C6", chi: "\u03C7", psi: "\u03C8", omega: "\u03C9", Gamma: "\u0393", Delta: "\u0394", Theta: "\u0398", Lambda: "\u039B", Pi: "\u03A0", Sigma: "\u03A3", Phi: "\u03A6", Psi: "\u03A8", Omega: "\u03A9", times: "\xD7", cdot: "\xB7", leq: "\u2264", le: "\u2264", geq: "\u2265", ge: "\u2265", neq: "\u2260", ne: "\u2260", approx: "\u2248", to: "\u2192", rightarrow: "\u2192", leftarrow: "\u2190", infty: "\u221E", pm: "\xB1", sum: "\u03A3", log: "log", ln: "ln", min: "min", max: "max" };
var Q08_SUP = { "0": "\u2070", "1": "\xB9", "2": "\xB2", "3": "\xB3", "4": "\u2074", "5": "\u2075", "6": "\u2076", "7": "\u2077", "8": "\u2078", "9": "\u2079", "+": "\u207A", "-": "\u207B", "n": "\u207F", "i": "\u2071" };
var Q08_SUB = { "0": "\u2080", "1": "\u2081", "2": "\u2082", "3": "\u2083", "4": "\u2084", "5": "\u2085", "6": "\u2086", "7": "\u2087", "8": "\u2088", "9": "\u2089", "+": "\u208A", "-": "\u208B" };
function q08TexPlain(tex) {
  var t = String(tex).replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|mathcal|mathbb)\s*\{([^{}]*)\}/g, "$1");
  t = t.replace(/\\([A-Za-z]+)/g, function(m, n) {
    return Object.prototype.hasOwnProperty.call(Q08_TEX, n) ? Q08_TEX[n] : n;
  });
  t = t.replace(/\^\{?([0-9+\-ni]+)\}?/g, function(m, d) {
    var o = "";
    for (var i = 0; i < d.length; i++) {
      if (!Q08_SUP[d[i]]) return m;
      o += Q08_SUP[d[i]];
    }
    return o;
  });
  t = t.replace(/_\{?([0-9+\-]+)\}?/g, function(m, d) {
    var o = "";
    for (var i = 0; i < d.length; i++) {
      if (!Q08_SUB[d[i]]) return m;
      o += Q08_SUB[d[i]];
    }
    return o;
  });
  return t.replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim();
}
__name(q08TexPlain, "q08TexPlain");
function q08Inline(s) {
  var store = [];
  var t = escHtml(q08Math(s, store));
  var parts = t.split(/(`[^`\n]+`)/);
  for (var i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      parts[i] = "<code>" + parts[i].slice(1, -1) + "</code>";
      continue;
    }
    parts[i] = parts[i].replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>').replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![*\w])/g, "$1<em>$2</em>").replace(/(^|[^\w])_(?=[^\s_])([^_\n]*?[^\s_])_(?!\w)/g, "$1<em>$2</em>");
  }
  return q08Unmath(parts.join(""), store, function(m) {
    return m[1] ? "$$" + escHtml(m[0]) + "$$" : "\\(" + escHtml(m[0]) + "\\)";
  });
}
__name(q08Inline, "q08Inline");
function q08Plain(s) {
  var store = [];
  var t = q08Math(s, store).replace(/!?\[([^\]\n]*)\]\([^)\s]*\)/g, "$1").replace(/`([^`\n]*)`/g, "$1").replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "$1").replace(/(^|[^*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![*\w])/g, "$1$2").replace(/(^|[^\w])_(?=[^\s_])([^_\n]*?[^\s_])_(?!\w)/g, "$1$2");
  return q08Unmath(t, store, function(m) {
    return q08TexPlain(m[0]);
  }).replace(/\s+/g, " ").trim();
}
__name(q08Plain, "q08Plain");
var Q08_QDS = "1.0.0";
var Q08_FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap">';
var Q08_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23182042'/%3E%3Ctext x='16' y='21.5' text-anchor='middle' font-family='Georgia,serif' font-size='14' fill='%23F2906A'%3Eq08%3C/text%3E%3C/svg%3E";
var Q08_CSS = "<style>.q08-mark{font:600 1.15rem/1 var(--q-serif);letter-spacing:-.01em;text-decoration:none;color:var(--q-ink);display:flex;align-items:baseline;gap:10px}.q08-mark b{color:var(--q-accent);font-weight:600}.q08-mark small{font:400 var(--q-fs-sm)/1 var(--q-sans);color:var(--q-muted)}.q08-hero{padding:56px 0 24px;max-width:760px}.q08-hero h1{font:500 clamp(2rem,4.2vw,3.1rem)/1.08 var(--q-serif);letter-spacing:-.02em;margin:0 0 16px}.q08-feed{max-width:760px}.q08-piece{max-width:var(--q-measure);padding:40px 0 24px}.q08-piece h1.q08-t{font:500 clamp(1.85rem,3.4vw,2.6rem)/1.12 var(--q-serif);letter-spacing:-.015em;margin:0 0 14px;text-wrap:balance}.q08-fb{margin:40px 0 0;padding:20px 0 0;border-top:1px solid var(--q-rule);display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:var(--q-fs-sm);color:var(--q-muted)}.q08-fb span{margin-right:6px}.q08-refs{margin:40px 0 0;padding-top:20px;border-top:1px solid var(--q-rule)}.q08-refs h2{font:600 var(--q-fs-sm)/1.3 var(--q-sans);color:var(--q-muted);margin:0 0 12px}.q08-refs ul{margin:0;padding-left:1.2em;font-size:var(--q-fs-sm)}.q08-refs li{margin-bottom:6px}.q08-refs a{color:var(--q-accent)}.q08-msg{padding:72px 0;max-width:620px}.q08-sub form{display:flex;gap:8px;flex-wrap:wrap}.q08-sub .q-input{flex:1;min-width:220px}</style>";
function q08Attr(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
__name(q08Attr, "q08Attr");
function q08Page(o, body) {
  var t = q08Attr(o.title), d = q08Attr(o.description || "Explanatory essays on technology stories: what happened, and the system that made it happen.");
  var canon = o.canonical ? q08Attr(o.canonical) : "";
  var ld = o.jsonld ? '<script type="application/ld+json">' + JSON.stringify(o.jsonld).replace(/</g, "\\u003c") + "<\/script>" : "";
  var xh = o.extraHead || "";
  return '<!DOCTYPE html><html lang="en" data-brand="q08"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + t + '</title><meta name="description" content="' + d + '">' + xh + (canon ? '<link rel="canonical" href="' + canon + '"><meta property="og:url" content="' + canon + '">' : "") + (o.robots ? '<meta name="robots" content="' + q08Attr(o.robots) + '">' : "") + '<meta property="og:site_name" content="q08"><meta property="og:title" content="' + t + '"><meta property="og:description" content="' + d + '"><meta property="og:type" content="' + (o.ogType || "website") + '"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="' + t + '"><meta name="twitter:description" content="' + d + '"><meta name="theme-color" content="#F5F7FB" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#121731" media="(prefers-color-scheme: dark)"><link rel="icon" type="image/svg+xml" href="' + Q08_FAVICON + '"><link rel="alternate" type="application/rss+xml" title="q08" href="/feed.xml">' + Q08_FONTS + '<link rel="stylesheet" href="https://qnfo.org/qds.css?v=' + Q08_QDS + '"><script src="https://qnfo.org/qds.js?v=' + Q08_QDS + '" defer><\/script>' + Q08_CSS + ld + MATH_HEAD + '</head><body><a class="q-skip" href="#main">Skip to main content</a><header class="q-top"><div class="q-wrap"><a class="q08-mark" href="/" aria-label="q08 home"><b>q08</b><small>systems-level critique</small></a><nav class="q-nav q-nav-wide" aria-label="Main"><a href="/"' + (o.active === "index" ? ' aria-current="page"' : "") + '>Index</a><a href="/forecasts"' + (o.active === "forecasts" ? ' aria-current="page"' : "") + '>Forecasts</a><a href="/subscribe"' + (o.active === "subscribe" ? ' aria-current="page"' : "") + '>Subscribe</a><a href="/feed.xml">RSS</a></nav><details class="q-menu"><summary aria-label="Menu"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></summary><nav class="q-nav" aria-label="Main"><a href="/">Index</a><a href="/forecasts">Forecasts</a><a href="/subscribe">Subscribe</a><a href="/feed.xml">RSS</a></nav></details><button class="q-theme" type="button" data-q-theme aria-label="Switch between light and dark theme"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor"/></svg></button></div></header><main id="main"><div class="q-wrap">' + body + '</div></main><footer class="q-foot"><div class="q-wrap"><div class="q-foot-base" style="border-top:0;padding-top:0;margin-top:0"><span>q08: an autonomous signal engine, updated continuously</span><span>Pieces are machine-written and gated before publication. <a href="/feed.xml">RSS</a> \xB7 <a href="/subscribe">Daily digest</a> \xB7 <a href="/health">Status</a></span></div></div></footer><script src="https://fleet.qnfo.org/ctl.js" defer><\/script></body></html>';
}
__name(q08Page, "q08Page");
function q08Sub(compact) {
  return '<section class="q-panel q08-sub" style="margin:48px 0 64px' + (compact ? ";max-width:760px" : "") + '"><h2 class="q-h3" style="margin:0 0 6px">The daily digest</h2><p class="q-meta" style="margin:0 0 14px">One email a day with that day\u2019s pieces. Confirm by email; unsubscribe from any digest.</p><form method="post" action="/subscribe"><label class="q-sr" for="q08-e">Email address</label><input class="q-input" id="q08-e" type="email" name="email" placeholder="you@example.com" autocomplete="email" required><button class="q-btn q-btn-accent" type="submit">Subscribe</button></form></section>';
}
__name(q08Sub, "q08Sub");
function q08Short(t, n) {
  t = String(t || "");
  if (t.length <= n) return t;
  var c = t.slice(0, n), sp = c.lastIndexOf(" ");
  return (sp > n * 0.5 ? c.slice(0, sp) : c).replace(/[\s,;:.\-]+$/, "") + "\u2026";
}
__name(q08Short, "q08Short");
function q08Lede(md) {
  return q08Plain(String(md || "").replace(/^#+\s*.+\n?/m, "").replace(/^[ \t]*(?:#{1,6}|[-*]|>|\d+[.)])[ \t]+/gm, ""));
}
__name(q08Lede, "q08Lede");
function renderIndex(pieces) {
  var items = pieces.map(function(p) {
    var date = (p.published_at || "").slice(0, 10);
    var lede = q08Short(q08Lede(p.body_md), 220);
    return '<li class="q-item"><a class="q-item-title" href="/p/' + escHtml(p.slug) + '">' + q08Inline(p.title) + '</a><div class="q-item-meta"><time datetime="' + escHtml(p.published_at || "") + '">' + date + "</time>" + (p.kind === "forecast" ? '<span class="q-badge">Forecast</span>' : p.core_concept ? '<span class="q-badge">' + escHtml(q08Short(p.core_concept, 44)) + "</span>" : "") + "</div>" + (lede ? '<p class="q-item-text">' + escHtml(lede) + "</p>" : "") + "</li>";
  }).join("");
  var body = '<section class="q08-hero"><h1>What happened, and the system that made it happen.</h1><p class="q-lede">Each piece reports one story from the technical front page for a reader who missed it, then explains the system that produced it. Every fact is checked against its source.</p></section><section class="q08-feed" aria-label="Pieces">' + (items ? '<ul class="q-list">' + items + "</ul>" : '<div class="q-note">No pieces published yet. The engine publishes a few times a day; subscribe below to get the next one.</div>') + "</section>" + q08Sub(true);
  return q08Page({ title: "q08 \xB7 systems-level critique", canonical: ORIGIN + "/", active: "index", jsonld: { "@context": "https://schema.org", "@type": "Blog", name: "q08", url: ORIGIN + "/", description: "Systems-level critique of technical industry friction." } }, body);
}
__name(renderIndex, "renderIndex");
function shareText(p) {
  return p.kind === "forecast" ? "A scored forecast: " + q08Plain(p.title) : q08Plain(p.title);
}
__name(shareText, "shareText");
function renderShare(p) {
  var u = ORIGIN + "/p/" + p.slug, t = shareText(p), eu = encodeURIComponent(u), et = encodeURIComponent(t);
  var links = [["Bluesky", "https://bsky.app/intent/compose?text=" + encodeURIComponent(t + " " + u)], ["X", "https://twitter.com/intent/tweet?text=" + et + "&url=" + eu], ["LinkedIn", "https://www.linkedin.com/sharing/share-offsite/?url=" + eu], ["Mastodon", "https://mastodon.social/share?text=" + encodeURIComponent(t + " " + u)], ["Hacker News", "https://news.ycombinator.com/submitlink?u=" + eu + "&t=" + et], ["Reddit", "https://www.reddit.com/submit?url=" + eu + "&title=" + et], ["Email", "mailto:?subject=" + et + "&body=" + encodeURIComponent(t + "\n" + u)]];
  var yr = (p.published_at || "").slice(0, 4);
  var cite = "q08. (" + yr + "). " + q08Plain(p.title) + ". q08.org. " + u;
  return '<section class="q08-share" aria-label="Share and cite" style="margin:28px 0"><p class="q-meta" style="margin:0 0 8px">Pass it on: ' + links.map(function(l) {
    return '<a href="' + escHtml(l[1]) + '" rel="noopener" target="_blank">' + l[0] + "</a>";
  }).join(" \xB7 ") + "</p>" + (p.kind === "forecast" ? '<p class="q-meta" style="margin:0 0 8px">Disagree? Post your own probability for the claim and link this page; q08 settles it in public on the stated date.</p>' : "") + '<p class="q-meta" style="margin:0 0 8px">Download citation: <a href="/p/' + escHtml(p.slug) + '.bib">BibTeX</a> \xB7 <a href="/p/' + escHtml(p.slug) + '.ris">RIS</a></p><p class="q-meta" style="margin:0"><label>Cite as <input class="q-input" readonly value="' + escHtml(cite) + '" onfocus="this.select()" style="width:100%"></label></p></section>';
}
__name(renderShare, "renderShare");
function citationFile(p, fmt) {
  var u = ORIGIN + "/p/" + p.slug, y = (p.published_at || "").slice(0, 4), m = (p.published_at || "").slice(5, 7), d = (p.published_at || "").slice(8, 10);
  var t = q08Plain(p.title).replace(/[{}\r\n]+/g, " ");
  if (fmt === "bib") return "@online{q08_" + String(p.slug).replace(/[^a-z0-9]/g, "") + ",\n  author = {{q08}},\n  title = {" + t + "},\n  year = {" + y + "},\n  month = {" + m + "},\n  url = {" + u + "},\n  organization = {q08},\n  note = {q08.org}\n}\n";
  return "TY  - ELEC\r\nAU  - q08\r\nTI  - " + t + "\r\nPY  - " + y + "\r\nDA  - " + y + "/" + m + "/" + d + "\r\nPB  - q08\r\nUR  - " + u + "\r\nER  - \r\n";
}
__name(citationFile, "citationFile");
function funnelUrl(base, slug) {
  return base + "?utm_source=q08&utm_medium=piece&utm_campaign=" + encodeURIComponent(String(slug || "home"));
}
__name(funnelUrl, "funnelUrl");
function renderFunnel(slug) {
  return '<aside class="q08-funnel q-panel" aria-label="From the same imprint" style="margin:28px 0"><p class="q-meta" style="margin:0 0 6px">q08 is published by QNFO, an independent research imprint. Same author, slower and checked line by line:</p><ul class="q-list" style="margin:0"><li><a href="' + escHtml(funnelUrl("https://papers.qnfo.org/", slug)) + '">Open-access research papers</a></li><li><a href="' + escHtml(funnelUrl("https://ipatent.qnfo.org/", slug)) + '">iPatent</a>: free, private-by-default provisional patent drafting</li><li><a href="' + escHtml(funnelUrl("https://qnfo.org/", slug)) + '">QNFO</a>: the work and the author</li></ul></aside>';
}
__name(renderFunnel, "renderFunnel");
function pieceHead(p, desc) {
  var u = ORIGIN + "/p/" + p.slug, d = (p.published_at || "").slice(0, 10).replace(/-/g, "/");
  return '<meta name="citation_title" content="' + q08Attr(q08Plain(p.title)) + '"><meta name="citation_publication_date" content="' + q08Attr(d) + '"><meta name="citation_abstract_html_url" content="' + q08Attr(u) + '"><meta name="citation_publisher" content="q08"><meta name="citation_author" content="q08"><meta property="article:published_time" content="' + q08Attr(p.published_at || "") + '"><meta property="article:section" content="' + (p.kind === "forecast" ? "Forecast" : "Analysis") + '">';
}
__name(pieceHead, "pieceHead");
function renderPiece(p, fr) {
  var body = mdToHtml(p.body_md || "").replace(/^\s*<h1>[\s\S]*?<\/h1>\s*/, "");
  var refs = renderSources(p.sources_json);
  var fb = '<form class="q08-fb" method="post"><span>Was this worth your time?</span><textarea class="q-input" name="note" maxlength="280" rows="2" style="flex-basis:100%;order:2" placeholder="Optional: what was missing?" aria-label="Optional note: what was missing?"></textarea><button class="q-btn q-btn-ghost" formaction="/api/f?slug=' + escHtml(p.slug) + '&amp;s=good">Yes</button> <button class="q-btn q-btn-ghost" formaction="/api/f?slug=' + escHtml(p.slug) + '&amp;s=flat">Flat</button> <button class="q-btn q-btn-ghost" formaction="/api/f?slug=' + escHtml(p.slug) + '&amp;s=no">No</button></form>';
  var date = (p.published_at || "").slice(0, 10);
  var desc = q08Short(q08Lede(p.body_md), 160);
  var html2 = '<article class="q08-piece"><p class="q-eyebrow"><a href="/" style="text-decoration:none;color:inherit">\u2190 Index</a></p><h1 class="q08-t">' + q08Inline(p.title) + '</h1><p class="q-meta" style="margin:0 0 28px"><time datetime="' + escHtml(p.published_at || "") + '">' + date + "</time>" + (p.kind === "forecast" ? ' \xB7 <span class="q-badge">Forecast</span>' : p.core_concept ? ' \xB7 <span class="q-badge">' + escHtml(q08Short(p.core_concept, 44)) + "</span>" : "") + '</p><div class="q-prose piece">' + body + "</div>" + (p.kind === "forecast" ? renderForecastBox(fr) : "") + fb + renderShare(p) + renderFunnel(p.slug) + (refs ? '<div class="q08-refs">' + refs.replace(/^\s*<section class="refs">/, "").replace(/<\/section>\s*$/, "") + "</div>" : "") + "</article>" + q08Sub(false);
  return q08Page({
    title: q08Plain(p.title) + " \xB7 q08",
    description: desc,
    canonical: ORIGIN + "/p/" + p.slug,
    ogType: "article",
    extraHead: pieceHead(p, desc),
    jsonld: { "@context": "https://schema.org", "@type": "Article", headline: q08Plain(p.title).slice(0, 110), description: desc, datePublished: p.published_at || void 0, dateModified: p.published_at || void 0, url: ORIGIN + "/p/" + p.slug, mainEntityOfPage: ORIGIN + "/p/" + p.slug, isAccessibleForFree: true, inLanguage: "en", articleSection: p.kind === "forecast" ? "Forecast" : "Analysis", isPartOf: p.kind === "forecast" ? { "@type": "CreativeWorkSeries", name: "q08 Forecast Ledger", url: ORIGIN + "/forecasts" } : void 0, author: { "@type": "Organization", name: "q08", url: ORIGIN + "/" }, publisher: { "@type": "Organization", name: "q08", url: ORIGIN + "/", parentOrganization: { "@type": "Organization", name: "QNFO", url: "https://qnfo.org/" } } }
  }, html2);
}
__name(renderPiece, "renderPiece");
function q08Wrap(fragment, title) {
  if (/^\s*<!doctype/i.test(fragment)) return fragment;
  var t = title || ((/<h[12][^>]*>([^<]{1,80})<\/h[12]>/.exec(fragment) || [])[1] || "q08");
  var f = String(fragment).replace(/<form method=post action=\/subscribe><input type=email name=email required><button>Subscribe<\/button><\/form>/, '<form method="post" action="/subscribe" class="q08-sub" style="margin:20px 0"><label class="q-sr" for="q08-e2">Email address</label><input class="q-input" id="q08-e2" type="email" name="email" placeholder="you@example.com" autocomplete="email" required><button class="q-btn q-btn-accent" type="submit">Subscribe</button></form>').replace(/<h[12]>/, '<h1 class="q-h1">').replace(/<\/h[12]>/, "</h1>");
  return q08Page({ title: t + " \xB7 q08", active: /subscri/i.test(t) ? "subscribe" : "", robots: "noindex" }, '<section class="q08-msg">' + f + "</section>");
}
__name(q08Wrap, "q08Wrap");
function mdToHtml(md) {
  var lines = String(md || "").split("\n");
  var out = [];
  var list = "";
  var close = /* @__PURE__ */ __name(function() {
    if (list) {
      out.push("</" + list + ">");
      list = "";
    }
  }, "close");
  for (var line of lines) {
    var hm = line.match(/^(#{1,3}) +(.+)/);
    var ul = line.match(/^[-*] +(.+)/);
    var ol = line.match(/^\d+[.)] +(.+)/);
    var bq = line.match(/^> ?(.+)/);
    if (hm) {
      close();
      out.push("<h" + hm[1].length + ">" + q08Inline(hm[2]) + "</h" + hm[1].length + ">");
    } else if (ul) {
      if (list !== "ul") {
        close();
        out.push("<ul>");
        list = "ul";
      }
      out.push("<li>" + q08Inline(ul[1]) + "</li>");
    } else if (ol) {
      if (list !== "ol") {
        close();
        out.push("<ol>");
        list = "ol";
      }
      out.push("<li>" + q08Inline(ol[1]) + "</li>");
    } else if (bq) {
      close();
      out.push("<blockquote><p>" + q08Inline(bq[1]) + "</p></blockquote>");
    } else if (line.trim() === "") {
      close();
    } else {
      close();
      out.push("<p>" + q08Inline(line) + "</p>");
    }
  }
  close();
  return out.join("\n");
}
__name(mdToHtml, "mdToHtml");
function renderFeed(pieces) {
  var items = pieces.map(function(p) {
    var date = new Date(p.published_at || Date.now()).toUTCString();
    var desc = escHtml(q08Short(q08Lede(p.body_md), 500));
    return "<item><title>" + escHtml(q08Plain(p.title)) + "</title><link>https://q08.org/p/" + escHtml(p.slug) + "</link><pubDate>" + date + "</pubDate><description>" + desc + "...</description></item>";
  }).join("\n");
  return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>q08</title><link>https://q08.org</link><description>Systems-level critique. Structural. Timeless.</description>' + items + "</channel></rss>";
}
__name(renderFeed, "renderFeed");
async function sha16(s) {
  var enc = new TextEncoder();
  var buf = await crypto.subtle.digest("SHA-256", enc.encode(String(s)));
  return Array.from(new Uint8Array(buf)).slice(0, 16).map(function(b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}
__name(sha16, "sha16");
async function sendEmail(env, to, subject, body, unsubUrl) {
  if (env.SEND_EMAIL) {
    try {
      var msg = { to, from: "digest@q08.org", subject, text: body };
      if (unsubUrl) msg.headers = { "List-Unsubscribe": "<" + unsubUrl + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
      await env.SEND_EMAIL.send(msg);
      return { ok: true, via: "send_email" };
    } catch (e) {
      return { ok: false, error: "send_email: " + String(e && e.message || e) };
    }
  }
  if (!env.EMAIL) return { ok: false, error: "no email path" };
  try {
    var resp = await env.EMAIL.fetch("https://email.internal/send", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (env.EMAIL_API_KEY || "") }, body: JSON.stringify({ to, from: "qnfo@qnfo.org", subject, body }) });
    return { ok: resp.ok, status: resp.status };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(sendEmail, "sendEmail");
async function sendDigest(env) {
  var day = utcDay();
  await ensureForecastSchema(env);
  var pieces = await env.DB.prepare("SELECT slug, title" + (__forecastSchemaDone ? ", kind" : "") + " FROM published_pieces WHERE published_at >= ?1 AND slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at ASC").bind(day + "T00:00:00.000Z").all();
  var rows = pieces.results || [];
  if (!rows.length) return { ok: true, skipped: "no pieces today", pieces: 0 };
  var subs = await env.DB.prepare("SELECT email, token FROM subscribers WHERE status='confirmed' LIMIT 500").all();
  var list = rows.map(function(r2) {
    return "- " + (r2.kind === "forecast" ? "Forecast: " : "") + q08Plain(r2.title) + " - https://q08.org/p/" + r2.slug;
  }).join("\n");
  var sent = 0;
  for (var s of subs.results || []) {
    var unsubUrl = "https://q08.org/unsubscribe?t=" + s.token;
    var body = "q08 - daily digest (" + day + ")\n\n" + list + "\n\nUnsubscribe: " + unsubUrl;
    var r = await sendEmail(env, s.email, "q08 - daily digest", body, unsubUrl);
    if (r && r.ok) sent++;
  }
  return { ok: true, pieces: rows.length, subscribers: (subs.results || []).length, sent };
}
__name(sendDigest, "sendDigest");
async function pingIndexNow(env, url) {
  try {
    var resp = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: "q08.org", key: INDEXNOW_KEY, keyLocation: ORIGIN + "/" + INDEXNOW_KEY + ".txt", urlList: [url] })
    });
    return { ok: resp.ok, status: resp.status };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(pingIndexNow, "pingIndexNow");
async function queueForDistribution(env, title, slug, fc, hook) {
  if (env.Q08_SOCIAL_QUEUE === "0" || !fc && env.Q08_SOCIAL_QUEUE !== "1" && env.Q08_SOCIAL_ESSAYS !== "1") return { ok: false, skip: "Q08-PERSONAL-CHANNEL-HOLD-1" };
  if (!env.AUDIT) return { ok: false, skip: "no audit binding" };
  try {
    var _u = "https://q08.org/p/" + slug;
    var _s = " \u2014 ";
    var _t = String(title || "");
    if (fc) {
      _t = forecastPostText(fc, _u);
      _s = "";
      _u = "";
    } else if (hook) {
      var _room = 280 - _t.length - _u.length - 4, _h = String(hook).replace(/\s+/g, " ").trim().replace(/^(.{20,}?[.!?])\s.*$/, "$1");
      if (_room >= 40 && _h.length > _room) _h = _h.slice(0, _room - 1).replace(/\s+\S*$/, "") + "\u2026";
      if (_room >= 40 && _h) {
        _t = _t + "\n\n" + _h;
        _s = "\n\n";
      }
    }
    var text = _t.length + _s.length + _u.length <= 280 ? _t + _s + _u : _t.slice(0, Math.max(0, 280 - _u.length - _s.length)) + _s + _u;
    var id = (fc ? "q08-fc-" : "q08-") + Date.now().toString(36) + rnd36(4);
    await env.AUDIT.prepare("INSERT OR IGNORE INTO social_threads (slug, title, posts, status, notes) VALUES (?,?,?, 'queued', ?)").bind(id, String(title || "").slice(0, 300), JSON.stringify([text]), "selected: q08 piece (Q08-OPEN-1, owner directive 2026-10-09)").run();
    return { ok: true, queued: id };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(queueForDistribution, "queueForDistribution");
function forecastPostText(fc, url) {
  var tail = "\n\nSettles by " + fc.horizon + ", scored in public. What is your number? " + url;
  var head = "Forecast, " + Math.round(Number(fc.probability) * 100) + "%: ";
  var room = 280 - tail.length - head.length;
  var claim = q08Plain(fc.claim);
  if (claim.length > room) claim = claim.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, "") + "\u2026";
  return head + claim + tail;
}
__name(forecastPostText, "forecastPostText");
async function handleSubscribe(req, env, url) {
  var email = "";
  if (req.method === "POST") {
    try {
      var ct = req.headers.get("Content-Type") || "";
      if (ct.indexOf("application/json") >= 0) {
        var b = await req.json();
        email = b && b.email || "";
      } else if (ct.indexOf("form") >= 0) {
        var fd = await req.formData();
        email = fd.get("email") || "";
      }
    } catch (e) {
      console.error(JSON.stringify({ evt: "q08-signal-engine:handleSubscribe:caught", error: String(e && e.message || e) }));
    }
  }
  email = String(email || url.searchParams.get("email") || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    var bad = req.method === "POST";
    return html("<h2>Subscribe</h2><form method=post action=/subscribe><input type=email name=email required><button>Subscribe</button></form>" + (bad ? "<p>Enter a valid email address.</p>" : "<p>One email a day \u2014 the daily digest. No spam.</p>"), bad ? 400 : 200);
  }
  var token = await sha16(email + ":q08:sub");
  await env.DB.prepare("INSERT INTO subscribers(email, status, token, created_at) VALUES(?, 'pending', ?, ?) ON CONFLICT(email) DO UPDATE SET token=excluded.token, status=CASE WHEN status='confirmed' THEN 'confirmed' ELSE 'pending' END").bind(email, token, nowIso()).run();
  await sendEmail(env, email, "Confirm your q08 subscription", "Tap to confirm: https://q08.org/confirm?t=" + token);
  return html("<h2>Almost there</h2><p>Check your inbox for a confirmation link.</p>");
}
__name(handleSubscribe, "handleSubscribe");
async function sweepStaleRuns(env) {
  await env.DB.prepare("UPDATE engine_runs SET status='abandoned', error=COALESCE(error,'') || ' | STALE-RUN-SWEEP: isolate ended before finalize' WHERE status='running' AND ran_at < datetime('now','-30 minutes')").run().catch(function(e) {
    console.error(JSON.stringify({ evt: "q08-signal-engine:sweepStaleRuns:caught", error: String(e && e.message || e) }));
  });
}
__name(sweepStaleRuns, "sweepStaleRuns");
function stallStage(r) {
  var e = String(r && r.error || ""), st = String(r && r.status || "");
  if (st !== "gate_failed") return st || "unknown";
  if (/^accuracy:/.test(e)) return "fact-check";
  if (/^ensemble: the edited draft was still not worth reading/.test(e)) return "reader panel";
  if (/^ensemble: the editor's draft failed the gate/.test(e)) return "editor gate";
  if (/\blede\b/.test(e)) return "lede";
  return "writer gate";
}
__name(stallStage, "stallStage");
function stallDigest(rows) {
  var n = {}, order = [];
  (rows || []).forEach(function(r) {
    var k = stallStage(r);
    if (!n[k]) {
      n[k] = 0;
      order.push(k);
    }
    n[k]++;
  });
  return order.sort(function(x, y) {
    return n[y] - n[x];
  }).map(function(k) {
    return k + " " + n[k];
  }).join(", ");
}
__name(stallDigest, "stallDigest");
async function stallDetector(env) {
  if (!env.AUDIT) return;
  try {
    var runs = await env.DB.prepare("SELECT id, status, piece_published, error FROM engine_runs WHERE status NOT IN ('running','abandoned','async-done','skipped','deferred') ORDER BY id DESC LIMIT 3").all();
    var rs = runs && runs.results || [];
    var pub = rs.filter(function(r) {
      return Number(r.piece_published) > 0;
    });
    if (pub.length) {
      var open = await env.AUDIT.prepare("SELECT id FROM agent_issues WHERE status='open' AND title LIKE 'Q08-PUBLISH-STALL-AUTO-1:%'").all();
      for (var o of open && open.results || []) {
        await env.AUDIT.prepare("UPDATE issue_triage SET close_evidence=?1 WHERE issue_id=?2").bind("q08-signal-engine " + VERSION + " stallDetector: engine_runs #" + pub[0].id + " published (piece_published=1) at " + (/* @__PURE__ */ new Date()).toISOString()).run();
        await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', close_channel='auto-recovery', updated_at=?1 WHERE id=?2").bind(Date.now(), o.id).run();
      }
      return;
    }
    if (rs.length < 3) return;
    var last = await env.DB.prepare("SELECT MAX(published_at) m FROM published_pieces").first();
    var lastMs = last && last.m ? Date.parse(last.m) : 0;
    var hours = lastMs ? (Date.now() - lastMs) / 36e5 : Infinity;
    if (hours < 8) return;
    var day = await env.DB.prepare("SELECT id, status, error FROM engine_runs WHERE ran_at >= datetime('now','-24 hours') AND status NOT IN ('running','abandoned','async-done') ORDER BY id DESC LIMIT 60").all();
    var dayRows = day && day.results || [];
    var causes = rs.map(function(r) {
      return "#" + r.id + " " + stallStage(r) + ": " + String(r.error || "").slice(0, 160);
    }).join(" | ");
    var title = "Q08-PUBLISH-STALL-AUTO-1: q08-signal-engine published nothing in the last 3 runs and " + (isFinite(hours) ? Math.round(hours) + "h" : "ever") + " since the last piece";
    var desc = "Filed and refreshed automatically by q08-signal-engine " + VERSION + " stallDetector (PUBLISH-STALL-DIGEST-1), " + (/* @__PURE__ */ new Date()).toISOString() + ". Stage each finished run ended at, last 24 h (" + dayRows.length + " runs): " + (stallDigest(dayRows) || "none") + ". Newest runs: " + causes + ". Fix the stage with the most runs first; the full errors are in engine_runs.error and GET https://q08.org/api/runs. Closes itself with evidence when a run publishes.";
    var prio = hours >= 24 ? "critical" : "high";
    var now = Date.now();
    var cur = await env.AUDIT.prepare("SELECT id FROM agent_issues WHERE status='open' AND title LIKE 'Q08-PUBLISH-STALL-AUTO-1:%' ORDER BY id DESC LIMIT 1").first();
    if (cur && cur.id) {
      await env.AUDIT.prepare("UPDATE agent_issues SET title=?1, description=?2, priority=?3, updated_at=?4 WHERE id=?5").bind(title, desc, prio, now, cur.id).run();
    } else {
      await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) SELECT ?1, ?2, 'q08-signal-engine', 'reliability', ?4, 'open', ?3, ?3 WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE status='open' AND title LIKE 'Q08-PUBLISH-STALL-AUTO-1:%')").bind(title, desc, now, prio).run().catch(function(e) {
        console.error(JSON.stringify({ at: "q08.stallDetector.insert", error: String(e && e.message || e).slice(0, 200) }));
      });
    }
    await env.AUDIT.prepare("INSERT INTO alerts (source, level, message) VALUES ('q08-signal-engine', 'warn', ?1)").bind(title).run().catch(function(e) {
      console.error(JSON.stringify({ at: "q08.stallDetector.alert", error: String(e && e.message || e).slice(0, 200) }));
    });
  } catch (e) {
    console.error(JSON.stringify({ at: "q08.stallDetector", error: String(e && e.message || e).slice(0, 300) }));
  }
}
__name(stallDetector, "stallDetector");
function cleanNote(v) {
  var t = String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/https?:\/\/\S+/gi, "[link]").replace(/\s+/g, " ").trim().slice(0, 280);
  return t || null;
}
__name(cleanNote, "cleanNote");
var __forecast = { forecastPostText, gatherEvidence, forecastDue, resolveForecasts, ensureForecastSchema, generateForecast, forecastStats, parseForecastBlock, validateForecast, forecastXform, forecastProblems, buildForecastPrompt, calibration, parseJudgeVerdict, aggregateJudges, parseForecastCap, publicHttpsUrl, fcStatus, renderForecastBox, renderForecasts, FORECAST_DIRECTIVE, FORECAST_EVERY, FORECAST_MAX_CHECKS };
var __gen = { composeOrder, COMPOSE_MODELS_AT_CAP, generate, get TICK_BUDGET_MS() {
  return TICK_BUDGET_MS;
}, get ESSAY_AFTER_FORECAST_MS() {
  return ESSAY_AFTER_FORECAST_MS;
} };
var __stall = { stallRetryDue, stallDetector, stallDigest, stallStage, get STALL_RETRY_H() {
  return STALL_RETRY_H;
} };
var __cuts = { readerCutIndices, applyReaderCuts };
var __order = { orderCandidates };
var __ground = { labelledGround };
var __analysis = { paraphraseItemsDropped, finalRead, publishBody, PUBLISH_MIN_CHARS, FINAL_PASS_MEAN, concreteClaim, concreteAnalysisItems, analysisDepthProblems, danglingOpening, ANALYSIS_MIN_CHARS, autoAnalysisMark, splitAnalysis, stripAnalysisMark, ANALYSIS_CHECK_PROMPT, ANALYSIS_MARK };
var __context = { backgroundEntities, backgroundPack, backgroundQuery };
var __lede = { normalizeVerdictLine, verdictOnlyProblem, splitLongLede, normalizeDraft, ledeProblems, ledeOf, sourceKind, withLede, buildPrompt, READER_PROMPT, Q08_DIRECTIVE, LEDE_MAX_WORDS };
var __title = { compose, titleOnlyProblems, titleMicroCall, titleLineOf, gate };
var __carry = { carryVerdictLine, carryTitle, carryFormat, stripHandles, normalizeDraft };
var __edge = { edgeCachedFetch, edgeCacheable, withPolicyHeaders };
var __pipeline = { mirrorPipeline, pipeItem, pipeSince, PIPE_SELECT, PIPE_PROPERTY, PIPE_ID_PREFIX };
var __verify = { shortOnly, extendRevisionPrompt, get EXTEND_AIM_CHARS() {
  return EXTEND_AIM_CHARS;
}, factCheckExtra, pruneUnsupported, groundingProblems, parseFactVerdict, factCheck, verifyPiece, verifyAndRevise, splitFactItems, factItemText, claimIsReasoning, pruneInferences, prunedGateProblems, editGateProblems, EDIT_FLOOR, PRUNE_FLOOR, PRUNE_ROUNDS, PRUNE_ROUNDS_MAX, retractPiece, auditPublished, ensureAccuracySchema, renderRetraction, fetchArticleText, THIN_MIN_ARTICLE, articleUrlFor, githubReadmeUrl, factRevisionPrompt, Q08_DIRECTIVE, FORECAST_DIRECTIVE, REGISTER_EXEMPLAR };
var __framing = { framingRepair, framingRepairRow, framingTellMatchers, problemsWithSentences, retryPromptFor, phraseLevelOnly, splitSentences, FRAMING_RULE, FRAMING_REPAIR_MAX_SHARE, FACTCHECK_POOL, factCheckOrder, MODEL_FAMILY };
var __quality = { gate, overusedPrecedents, parseReaderVerdict, buildPrompt, ownerDirectives, readerTest, pickPanel, familyOf, aggregatePanel, panelRead, effectiveVotes, PANEL_POOL, ensembleReport, saveReaderTests, runLevels, panelUnavailableShare, ensureReaderTable, OWNER_VERDICT_WEIGHT, REGISTER_EXEMPLAR };
function q08SitemapXml(rows) {
  var esc = /* @__PURE__ */ __name(function(x) {
    return String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }, "esc");
  var day = /* @__PURE__ */ __name(function(x) {
    var d = String(x || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
  }, "day");
  var newest = rows.length ? day(rows[0].published_at) : "";
  var urls = rows.map(function(r) {
    var d = day(r.published_at);
    return "<url><loc>" + esc(ORIGIN + "/p/" + encodeURIComponent(r.slug)) + "</loc>" + (d ? "<lastmod>" + d + "</lastmod>" : "") + "</url>";
  }).join("");
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>' + ORIGIN + "/</loc>" + (newest ? "<lastmod>" + newest + "</lastmod>" : "") + "</url><url><loc>" + ORIGIN + "/forecasts</loc></url>" + urls + "</urlset>";
}
__name(q08SitemapXml, "q08SitemapXml");
async function safeEqual(a, b) {
  var enc = new TextEncoder();
  var ha = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(String(a))));
  var hb = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(String(b))));
  var diff = 0;
  for (var i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}
__name(safeEqual, "safeEqual");
function rnd36(n) {
  var out = "";
  while (out.length < n) {
    var b = crypto.getRandomValues(new Uint8Array(n * 2));
    for (var i = 0; i < b.length && out.length < n; i++) if (b[i] < 252) out += (b[i] % 36).toString(36);
  }
  return out;
}
__name(rnd36, "rnd36");
function logBg(evt, extra) {
  return function(e) {
    console.error(JSON.stringify(Object.assign({ evt, err: String(e && e.message || e) }, extra || {})));
  };
}
__name(logBg, "logBg");
var EDGE_CACHE_SKIP = /^\/(?:api\/|health$|run$|regen$|feed|rss|sitemap|robots|vote|feedback|subscribe|unsubscribe|confirm)/;
function edgeCacheable(req, path) {
  if (req.method !== "GET") return false;
  var u = new URL(req.url);
  if (u.search || u.hostname === "www.q08.org") return false;
  return !EDGE_CACHE_SKIP.test(path);
}
__name(edgeCacheable, "edgeCacheable");
function withPolicyHeaders(resp) {
  var ct = resp.headers.get("Content-Type") || "";
  if (ct.indexOf("text/html") < 0) return resp;
  var r = new Response(resp.body, resp);
  r.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  r.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  return r;
}
__name(withPolicyHeaders, "withPolicyHeaders");
async function countPieceRead(env, req, slug, ctx) {
  ctx.waitUntil(env.DB.prepare("UPDATE published_pieces SET reads=reads+1 WHERE slug=?").bind(slug).run().catch(logBg("reads_increment_failed", { slug })));
  ctx.waitUntil(countRead(env, req).catch(logBg("count_read_failed", { slug })));
}
__name(countPieceRead, "countPieceRead");
async function edgeCachedFetch(req, env, ctx, inner) {
  var path = new URL(req.url).pathname.replace(/\/+$/, "") || "/";
  var cache = typeof caches !== "undefined" && caches.default ? caches.default : null;
  var useCache = !!cache && edgeCacheable(req, path);
  var key = useCache ? new Request(new URL(req.url).toString(), { method: "GET" }) : null;
  if (useCache) {
    var hit = null;
    try {
      hit = await cache.match(key);
    } catch (e) {
      hit = null;
    }
    if (hit) {
      var pm = path.match(/^\/p\/([^/.]+)$/);
      if (pm) await countPieceRead(env, req, pm[1], ctx);
      return hit;
    }
  }
  var resp = withPolicyHeaders(await inner(req, env, ctx));
  if (useCache && resp.status === 200 && /text\/html/.test(resp.headers.get("Content-Type") || "") && /public/.test(resp.headers.get("Cache-Control") || "") && !resp.headers.has("Set-Cookie")) {
    ctx.waitUntil(cache.put(key, resp.clone()).catch(logBg("edge_cache_put_failed", { path })));
  }
  return resp;
}
__name(edgeCachedFetch, "edgeCachedFetch");
var worker_default = {
  async fetch(req, env, ctx) {
    return edgeCachedFetch(req, env, ctx, q08Fetch);
  },
  async scheduled(controller, env, ctx) {
    return q08Scheduled(controller, env, ctx);
  }
};
async function q08Fetch(req, env, ctx) {
  env = __aiAttrEnv(env, "q08-signal-engine", "AI", "AUDIT");
  var url = new URL(req.url);
  var path = url.pathname.replace(/\/+$/, "") || "/";
  await ensureAccuracySchema(env);
  if (url.hostname === "www.q08.org" && (req.method === "GET" || req.method === "HEAD") && path.indexOf("/api/") !== 0) {
    return new Response(null, { status: 301, headers: { "Location": ORIGIN + url.pathname + url.search, "Cache-Control": "public, max-age=86400" } });
  }
  await ensureForecastSchema(env);
  if (path === "/api/ensemble") {
    return json(Object.assign({ ok: true, worker: WORKER, version: VERSION, generated_at: nowIso() }, await ensembleReport(env)));
  }
  if (path === "/api/metrics") {
    return json({ ok: true, worker: WORKER, version: VERSION, generated_at: nowIso(), windows: { "7d": await metrics7d(env) } });
  }
  if (path === "/health") {
    var m7 = await metrics7d(env).catch(function() {
      return null;
    });
    var cnt = await env.DB.prepare("SELECT COUNT(*) n FROM published_pieces").first().catch(() => ({ n: 0 }));
    var last = await env.DB.prepare("SELECT slug, title, published_at FROM published_pieces WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at DESC LIMIT 1").first().catch(() => null);
    var runs = await env.DB.prepare("SELECT status, COUNT(*) n FROM engine_runs GROUP BY status").all().catch(() => ({ results: [] }));
    return json({ ok: true, worker: WORKER, version: VERSION, capabilities: ["signal-scrape", "llm-compose", "essay-publish", "essay-regen", "rss", "mathjax-render", "sources-footer", "email-digest", "indexnow", "reader-verdict-vote", "self-verdict-gate", "feedback-calibration", "cross-day-signal-dedup", "fabrication-gate", "self-referential-signal-emit", "reader-test", "owner-editorial-directives", "owner-verdict-weight", "forecast-scenarios", "forecast-resolution", "forecast-calibration", "citation-files", "edge-cache", "stall-retry"], limitations: ["publisher/composer only - does NOT run a general agent tool loop and does not execute arbitrary code", "not a general-purpose model endpoint; use qnfo-ai for inference", "POST /run and POST /regen need x-loop-token (they spend model calls and change published essays; OPEN-ACCESS-1); every read stays open", "writes only to its own q08-signal D1; never writes research or personal stores", "no streaming"], metrics_7d: m7, pieces: cnt.n, daily_cap: await dailyCap(env), daily_cap_key: "ops_config " + CAP_KEY, last, runs: runs.results });
  }
  if ((path === "/run" || path === "/regen") && req.method === "POST") {
    var lt = req.headers.get("x-loop-token") || "";
    if (!env.LOOP_TOKEN || !await safeEqual(lt, env.LOOP_TOKEN)) return json({ ok: false, error: "unauthorized: " + path + " spends model calls and changes published essays; it needs x-loop-token (OPEN-ACCESS-1)" }, 401);
  }
  if (path === "/run" && req.method === "POST") {
    var runIp = String(req.headers.get("cf-connecting-ip") || "anon");
    var runIk = await sha16("run:" + runIp);
    var runRate = await env.DB.prepare("SELECT COUNT(*) n FROM q08_run_rate WHERE ip_key=? AND created_at > datetime('now','-1 hour')").bind(runIk).first().catch(function() {
      return { n: 0 };
    });
    if ((runRate && runRate.n || 0) >= 5) return json({ ok: false, error: "rate limited" }, 429);
    await env.DB.prepare("INSERT INTO q08_run_rate (ip_key, created_at) VALUES (?,?)").bind(runIk, nowIso()).run().catch(function(e) {
      console.error(JSON.stringify({ evt: "q08-signal-engine:q08Fetch:caught", error: String(e && e.message || e) }));
    });
    await env.DB.prepare("DELETE FROM q08_run_rate WHERE created_at < datetime('now','-24 hours')").run().catch(function(e) {
      console.error(JSON.stringify({ evt: "q08-signal-engine:q08Fetch:caught", error: String(e && e.message || e) }));
    });
    var async_mode = url.searchParams.get("async") !== "0";
    if (async_mode) {
      var runId = Date.now().toString(36);
      var ph = await env.DB.prepare("INSERT INTO engine_runs (ms,status,error) VALUES (0,'running',?)").bind("run-id:" + runId + " async generation started").run().catch(function() {
        return null;
      });
      var phId = ph && ph.meta ? ph.meta.last_row_id : null;
      ctx.waitUntil(generate(env).then(async (out2) => {
        if (phId) await env.DB.prepare("UPDATE engine_runs SET status='async-done', error=? WHERE id=? AND status='running'").bind("run-id:" + runId + " result:" + JSON.stringify(out2).slice(0, 200), phId).run().catch((e) => {
          console.error(JSON.stringify({ evt: "q08-signal-engine:q08Fetch:caught", error: String(e && e.message || e) }));
        });
      }).catch(async (e) => {
        if (phId) await env.DB.prepare("UPDATE engine_runs SET status='error', error=? WHERE id=?").bind(String(e && e.message || e).slice(0, 500), phId).run().catch((e2) => {
          console.error(JSON.stringify({ evt: "q08-signal-engine:q08Fetch:caught", error: String(e2 && e2.message || e2) }));
        });
        else await env.DB.prepare("INSERT INTO engine_runs (ms,status,error) VALUES (0,'error',?)").bind(String(e && e.message || e).slice(0, 500)).run().catch((e2) => {
          console.error(JSON.stringify({ evt: "q08-signal-engine:q08Fetch:caught", error: String(e2 && e2.message || e2) }));
        });
      }));
      return json({ ok: true, worker: WORKER, version: VERSION, mode: "async", run_id: runId, note: "generating in background; poll /api/runs or /health. Async runs may be cut short by the platform after ~30s; the cron path is the reliable one." });
    }
    var out = await generate(env);
    return json({ ok: true, worker: WORKER, version: VERSION, out });
  }
  if (path === "/regen" && req.method === "POST") {
    var rip2 = String(req.headers.get("cf-connecting-ip") || "anon");
    var rik2 = await sha16("regen:" + rip2);
    var rr2 = await env.DB.prepare("SELECT COUNT(*) n FROM q08_run_rate WHERE ip_key=? AND created_at > datetime('now','-1 hour')").bind(rik2).first().catch(function() {
      return { n: 0 };
    });
    if ((rr2 && rr2.n || 0) >= 10) return json({ ok: false, error: "rate limited" }, 429);
    await env.DB.prepare("INSERT INTO q08_run_rate (ip_key, created_at) VALUES (?,?)").bind(rik2, nowIso()).run().catch(function(e) {
      console.error(JSON.stringify({ evt: "q08-signal-engine:q08Fetch:caught", error: String(e && e.message || e) }));
    });
    var target = String(url.searchParams.get("slug") || "").slice(0, 200);
    if (!target) return json({ ok: false, error: "slug required" }, 400);
    var prow = await env.DB.prepare("SELECT * FROM published_pieces WHERE slug = ?").bind(target).first();
    if (!prow) return json({ ok: false, error: "piece not found" }, 404);
    var srow = await env.DB.prepare("SELECT * FROM signal_log WHERE (source_id = ? OR source_id = ?) AND friction_point IS NOT NULL AND length(friction_point) > 40 ORDER BY length(friction_point) DESC LIMIT 1").bind(prow.signal_source, String(prow.signal_source || "").indexOf(":") >= 0 ? String(prow.signal_source).split(":").slice(1).join(":") : prow.signal_source).first();
    if (!srow) return json({ ok: false, error: "signal friction not found" }, 404);
    var friction = { core_concept: prow.core_concept || srow.title, friction_point: srow.friction_point || "", signal_strength: srow.signal_strength || "Medium" };
    var recentRows = await env.DB.prepare("SELECT structure_md FROM prompt_pool ORDER BY created_at DESC LIMIT 6").all();
    var recentStructures = (recentRows.results || []).map(function(r) {
      return r.structure_md;
    });
    var prompt = buildPrompt(friction, [], recentStructures);
    var piece = await compose(env, prompt);
    var gateResult = gate(piece.text);
    if (!gateResult.ok) {
      var retryPrompt = prompt + "\n\n--- CORRECTIVE FEEDBACK: your previous draft was rejected. Rewrite the ENTIRE essay from scratch with a completely different structure \u2014 continuous prose, no '##' section headers, but KEEP exactly one '# ' H1 title line as the FIRST line of the essay \u2014 fixing only these issues ---\n" + gateResult.problems.join("; ");
      var retryPiece = null;
      try {
        retryPiece = await compose(env, retryPrompt);
      } catch (e) {
        retryPiece = null;
      }
      if (retryPiece && retryPiece.text) {
        var retryGate = gate(retryPiece.text);
        if (retryGate.ok) {
          piece = retryPiece;
          gateResult = retryGate;
        } else if (retryGate.problems.length === 1 && /verdict/i.test(retryGate.problems[0]) && retryGate.problems[0].indexOf("self-verdict") < 0) {
          try {
            var vp2 = await compose(env, "You have written an essay that passed all editorial checks. Output exactly one line, nothing else, in this form:\nworth your time: yes|flat|no \u2014 one clause of justification\nUse flat only if a reader gains little beyond the source material; use no if the piece is not worth publishing.");
            var vm3 = (vp2 && vp2.text || "").match(/worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-]\s*\S[^\n]*$/im);
            if (vm3) {
              retryPiece.text = retryPiece.text.replace(/\s*$/, "") + "\n\n" + vm3[0];
              retryGate = gate(retryPiece.text);
              if (retryGate.ok) {
                piece = retryPiece;
                gateResult = retryGate;
              }
            }
          } catch (e) {
            console.error(JSON.stringify({ evt: "q08-signal-engine:q08Fetch:caught", error: String(e && e.message || e) }));
          }
        }
      }
    }
    if (!gateResult.ok) return json({ ok: false, error: "gate failed: " + gateResult.problems.join("; ") }, 422);
    var rgArticle = await fetchArticleText(articleUrlFor(srow));
    var rgv = await verifyPiece(env, piece.text, [srow.title || "", friction.core_concept || "", friction.friction_point || "", rgArticle].join("\n"), piece.model, target, { forecast: false });
    if (!rgv.ok) return json({ ok: false, error: "accuracy check failed: " + rgv.problems.join("; ") }, 422);
    piece.text = stripAnalysisMark(piece.text.replace(/\n?worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-].*$/im, "").trim());
    var tm = piece.text.match(/^#\s+(.+)$/m);
    var title = tm ? tm[1].trim() : prow.title;
    var body = piece.text.replace(/^#\s+.+\n?/, "").trim();
    await env.DB.prepare("UPDATE published_pieces SET title = ?, body_md = ? WHERE slug = ?").bind(title, body, target).run();
    var skel = body.split("\n").filter((l) => l.startsWith("#") || l.startsWith("- ") || l.startsWith("**")).join("\n").slice(0, 800);
    if (skel.length < 50) {
      var lp = body.split("\n").map((l) => l.trim()).filter((l) => l.length > 40)[0] || "";
      skel = (title + "\n" + lp.slice(0, 400)).slice(0, 800);
    }
    await env.DB.prepare("UPDATE prompt_pool SET structure_md = ?, active = 0 WHERE piece_id = ?").bind(skel, prow.id).run().catch(function(e) {
      console.error(JSON.stringify({ evt: "q08-signal-engine:q08Fetch:caught", error: String(e && e.message || e) }));
    });
    return json({ ok: true, slug: prow.slug, title, model: piece.model, words: body.split(/\s+/).length });
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
    var prev = await env.DB.prepare("SELECT id FROM q08_feedback WHERE ip_key = ? AND slug = ?").bind(ipKey, fslug).first().catch(function() {
      return null;
    });
    if (prev) return json({ ok: true, updated: false, note: "vote already recorded" });
    var rate = await env.DB.prepare("SELECT COUNT(*) n FROM q08_feedback WHERE ip_key = ? AND created_at > datetime('now','-1 hour')").bind(ipKey).first().catch(function() {
      return { n: 0 };
    });
    if ((rate && rate.n || 0) >= 5) return json({ ok: false, error: "rate limited" }, 429);
    var fnote = null;
    try {
      if (String(req.headers.get("Content-Type") || "").indexOf("form") >= 0) fnote = cleanNote((await req.formData()).get("note"));
    } catch (e) {
      fnote = null;
    }
    await env.DB.prepare("INSERT OR IGNORE INTO q08_feedback (slug, signal, ip_key, note, created_at) VALUES (?,?,?,?,?)").bind(fslug, s, ipKey, fnote, nowIso()).run();
    return json({ ok: true, recorded: s, note_stored: !!fnote });
  }
  if (path === "/feed.xml") {
    var rows = await env.DB.prepare("SELECT slug, title, body_md, core_concept, published_at FROM published_pieces WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at DESC LIMIT 20").all();
    return new Response(renderFeed(rows.results || []), { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
  }
  var cm = /^\/p\/([a-z0-9-]+)\.(bib|ris)$/.exec(path);
  if (cm) {
    var cp = await env.DB.prepare("SELECT slug, title, published_at FROM published_pieces WHERE slug=? AND slug NOT IN (SELECT slug FROM q08_retractions)").bind(cm[1]).first();
    if (!cp) return html("<h1>Not found</h1>", 404);
    return new Response(citationFile(cp, cm[2]), { headers: { "Content-Type": cm[2] === "bib" ? "application/x-bibtex; charset=utf-8" : "application/x-research-info-systems; charset=utf-8", "Content-Disposition": 'attachment; filename="q08-' + cp.slug + "." + cm[2] + '"' } });
  }
  if (path.startsWith("/p/")) {
    var slug = path.slice(3);
    var piece = await env.DB.prepare("SELECT * FROM published_pieces WHERE slug=?").bind(slug).first();
    if (!piece) return html("<h1>Not found</h1>", 404);
    var retr = await env.DB.prepare("SELECT * FROM q08_retractions WHERE slug = ?").bind(slug).first().catch(function() {
      return null;
    });
    if (retr) return html(renderRetraction(retr, piece), 410);
    await countPieceRead(env, req, slug, ctx);
    var frow = piece.kind === "forecast" ? await env.DB.prepare("SELECT * FROM q08_forecasts WHERE slug = ?").bind(slug).first().catch(function() {
      return null;
    }) : null;
    return html(renderPiece(piece, frow));
  }
  if (path === "/sitemap.xml") {
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
  if (path === "/confirm") {
    var t0 = url.searchParams.get("t") || "";
    await env.DB.prepare("UPDATE subscribers SET status='confirmed', confirmed_at=? WHERE token=? AND status!='unsubscribed'").bind(nowIso(), t0).run();
    return html("<h2>Subscribed</h2><p>You are subscribed. The daily digest arrives each evening.</p>");
  }
  if (path === "/unsubscribe") {
    var t1 = (url.searchParams.get("t") || "").trim();
    if (!t1) return html("<h2>Invalid link</h2><p>No unsubscribe token provided.</p>", 400);
    var unsub = await env.DB.prepare("UPDATE subscribers SET status='unsubscribed' WHERE token=?").bind(t1).run();
    return unsub && unsub.meta && unsub.meta.changes > 0 ? html("<h2>Unsubscribed</h2><p>You have been removed from the daily digest.</p>") : html("<h2>Not found</h2><p>That unsubscribe link is invalid or already used.</p>", 404);
  }
  if (path === "/forecasts") {
    var frs = await env.DB.prepare("SELECT slug, source_slug, claim, probability, horizon, resolution, status, outcome, brier FROM q08_forecasts WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY id DESC LIMIT 200").all().catch(function() {
      return { results: [] };
    });
    return html(renderForecasts(frs.results || [], await forecastStats(env)));
  }
  if (path === "/retractions" || path === "/api/retractions") {
    var rrows = await env.DB.prepare("SELECT r.slug, r.reason, r.retracted_at, p.title FROM q08_retractions r LEFT JOIN published_pieces p ON p.slug = r.slug ORDER BY r.retracted_at DESC LIMIT 500").all().catch(function() {
      return { results: [] };
    });
    if (path === "/api/retractions") return json({ ok: true, worker: WORKER, version: VERSION, retractions: rrows.results || [] });
    return html(renderRetractions(rrows.results || []));
  }
  if (path === "/api/forecasts") {
    var fr2 = await env.DB.prepare("SELECT slug, source_slug, claim, probability, horizon, resolution, alternatives_json, status, outcome, brier, checks, created_at, resolved_at, disposition FROM q08_forecasts WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY id DESC LIMIT 200").all().catch(function() {
      return { results: [] };
    });
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
  if (path !== "/" && path !== "/index.html") {
    return new Response('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Not found \xB7 q08</title></head><body style="font-family:system-ui,sans-serif;max-width:640px;margin:15vh auto;padding:0 16px"><h1>Not found</h1><p>There is no page at this address. <a href="' + ORIGIN + '/">Go to q08</a>.</p></body></html>', { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  }
  var pieces = await env.DB.prepare("SELECT slug, title, body_md, core_concept, published_at" + (__forecastSchemaDone ? ", kind" : "") + " FROM published_pieces WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at DESC LIMIT 20").all().catch(() => ({ results: [] }));
  return html(renderIndex(pieces.results || []));
}
__name(q08Fetch, "q08Fetch");
var STALL_RETRY_H = 2;
var STALL_RETRY_QUIET_MIN = 20;
async function stallRetryDue(env) {
  try {
    if (env.AUDIT) {
      var flag = await env.AUDIT.prepare("SELECT value FROM ops_config WHERE key = 'q08_stall_retry'").first().catch(function() {
        return null;
      });
      if (flag && String(flag.value).toLowerCase() === "off") return false;
    }
    var last = await env.DB.prepare("SELECT MAX(published_at) AS t FROM published_pieces").first();
    var lastMs = last && last.t ? Date.parse(last.t) : 0;
    if (lastMs && Date.now() - lastMs < STALL_RETRY_H * 36e5) return false;
    var hourStart = Math.floor(Date.now() / 36e5) * 36e5;
    if (Date.now() - hourStart >= STALL_RETRY_QUIET_MIN * 6e4) return true;
    var run = await env.DB.prepare("SELECT MAX(ran_at) AS t FROM engine_runs").first();
    var runMs = run && run.t ? Date.parse(String(run.t).replace(" ", "T") + (/Z$/.test(String(run.t)) ? "" : "Z")) : 0;
    return runMs >= hourStart;
  } catch (e) {
    return false;
  }
}
__name(stallRetryDue, "stallRetryDue");
var PIPE_PROPERTY = "q08.org";
var PIPE_ID_PREFIX = "run-";
var PIPE_WORKER = "q08-signal-engine";
function PIPE_DB(env) {
  return env.DB;
}
__name(PIPE_DB, "PIPE_DB");
function pipeSince(ms) {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}
__name(pipeSince, "pipeSince");
var PIPE_SELECT = "SELECT id, ran_at, status, top_signal, error FROM engine_runs WHERE id > ?1 AND ran_at >= ?2 AND status IN ('ok', 'gate_failed') ORDER BY id LIMIT ?3";
function pipeItem(r) {
  var sig = String(r.top_signal || ""), ok = r.status === "ok";
  return {
    id: r.id,
    flow: sig.indexOf("q08-forecast:") === 0 ? "forecast" : "essay",
    title: sig.replace(/^q08-forecast:/, "").replace(/^(hn|arxiv|github):/, ""),
    raw: ok ? "published" : "gate_failed: " + String(r.error || "").slice(0, 140),
    stage: ok ? "published" : "rejected",
    state: ok ? "done" : "rejected",
    since: String(r.ran_at || "").replace(" ", "T").slice(0, 19) + "Z"
  };
}
__name(pipeItem, "pipeItem");
var PIPE_DAYS = 7;
var PIPE_ROWS_PER_STMT = 10;
var PIPE_MAX_ROWS = 700;
async function mirrorPipeline(env) {
  if (!env.AUDIT || !PIPE_DB(env)) return { ok: false, skipped: "no binding" };
  try {
    var last = await env.AUDIT.prepare("SELECT MAX(CAST(substr(item_id, ?2) AS INTEGER)) AS m FROM content_external_items WHERE property = ?1").bind(PIPE_PROPERTY, PIPE_ID_PREFIX.length + 1).first();
    var after = Number(last && last.m) || 0;
    var rows = (await PIPE_DB(env).prepare(PIPE_SELECT).bind(after, pipeSince(Date.now() - PIPE_DAYS * 864e5), PIPE_MAX_ROWS).all()).results || [];
    var items = rows.map(pipeItem).filter(Boolean);
    var stmts = [];
    for (var i = 0; i < items.length; i += PIPE_ROWS_PER_STMT) {
      var chunk = items.slice(i, i + PIPE_ROWS_PER_STMT), vals = [], binds = [];
      chunk.forEach(function(it) {
        vals.push("(?, ?, ?, ?, ?, ?, ?, ?)");
        binds.push(PIPE_PROPERTY, it.flow, PIPE_ID_PREFIX + it.id, String(it.title || "").slice(0, 160), String(it.raw || "").slice(0, 160), it.stage, it.state, it.since);
      });
      var st = env.AUDIT.prepare("INSERT OR REPLACE INTO content_external_items (property, flow, item_id, title, raw_status, stage, state, since) VALUES " + vals.join(", "));
      stmts.push(st.bind.apply(st, binds));
    }
    stmts.push(env.AUDIT.prepare("DELETE FROM content_external_items WHERE property = ?1 AND since < ?2").bind(PIPE_PROPERTY, new Date(Date.now() - PIPE_DAYS * 864e5).toISOString()));
    await env.AUDIT.batch(stmts);
    return { ok: true, mirrored: items.length };
  } catch (e) {
    console.error(JSON.stringify({ worker: PIPE_WORKER, where: "mirrorPipeline", error: String(e && e.message || e).slice(0, 300) }));
    return { ok: false, error: String(e && e.message || e).slice(0, 200) };
  }
}
__name(mirrorPipeline, "mirrorPipeline");
async function q08Heartbeat(env, ok) {
  await mirrorPipeline(env);
  try {
    await env.AUDIT.prepare("INSERT INTO fleet_heartbeat (worker, version, ts, ok) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(worker) DO UPDATE SET version=excluded.version, ts=excluded.ts, ok=excluded.ok").bind("q08-signal-engine", VERSION, (/* @__PURE__ */ new Date()).toISOString(), ok ? 1 : 0).run();
  } catch (e) {
    console.error("q08 fleet_heartbeat write failed: " + String(e && e.message || e).slice(0, 200));
  }
}
__name(q08Heartbeat, "q08Heartbeat");
async function q08Scheduled(controller, env, ctx) {
  env = __aiAttrEnv(env, "q08-signal-engine", "AI", "AUDIT");
  if (controller.cron === "0 17 * * *") {
    ctx.waitUntil(sendDigest(env));
    return;
  }
  if (controller.cron === "30 * * * *") {
    ctx.waitUntil(auditPublished(env, 3).catch(function(e) {
      console.error("q08 auditPublished failed: " + String(e && e.message || e).slice(0, 200));
    }).then(function() {
      return stallRetryDue(env);
    }).then(function(due) {
      if (due) return generate(env).then(function() {
        return stallDetector(env);
      }).then(function() {
        return writeOwnMetrics(env);
      });
    }).then(function() {
      return true;
    }, function(e) {
      console.error("q08 stall retry failed: " + String(e && e.message || e).slice(0, 200));
      return false;
    }).then(function(ok) {
      return q08Heartbeat(env, ok);
    }));
    return;
  }
  var hbOk = true;
  ctx.waitUntil(ensureAccuracySchema(env).then(() => sweepStaleRuns(env)).then(() => generate(env)).catch(async (e) => {
    hbOk = false;
    console.error("q08 generate failed: " + String(e && e.message || e).slice(0, 200));
    await env.DB.prepare(
      "INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, ms, status, error) VALUES (0,0,0,0,'error',?)"
    ).bind(String(e && e.message || e).slice(0, 500)).run().catch(function(e2) {
      console.error("q08 engine_runs error row failed: " + String(e2 && e2.message || e2).slice(0, 200));
    });
  }).then(function() {
    return resolveForecasts(env, 2).catch(function(e) {
      console.error("q08 resolveForecasts failed: " + String(e && e.message || e).slice(0, 200));
    });
  }).then(() => stallDetector(env)).then(() => writeOwnMetrics(env)).catch(function(e) {
    hbOk = false;
    console.error("q08 scheduled tail failed: " + String(e && e.message || e).slice(0, 200));
  }).then(function() {
    return q08Heartbeat(env, hbOk);
  }));
}
__name(q08Scheduled, "q08Scheduled");
export {
  __analysis,
  __carry,
  __context,
  __cuts,
  __edge,
  __forecast,
  __framing,
  __gen,
  __ground,
  __lede,
  __order,
  __pipeline,
  __quality,
  __stall,
  __title,
  __verify,
  worker_default as default
};
//# sourceMappingURL=worker.js.map
