var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "0.6.2";
var WORKER = "q08-signal-engine";
var MAX_PER_DAY = 10;
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
  return new Response(body, {
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
      }
    }
    const ratio = pts > 0 ? nc / pts : 0;
    const vel = age_h != null ? Math.max(0.05, 1 / (1 + age_h / 6)) : 0.5;
    const score = nc * vel + 10 * ratio;
    stories.push({
      id: h.story_id || h.objectID,
      title: h.title || "",
      url: h.url || "",
      points: pts,
      num_comments: nc,
      age_h,
      ratio: Math.round(ratio * 100) / 100,
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
async function extractFriction(storyId, topK) {
  topK = topK || 5;
  const resp = await fetch(HN_ITEMS + storyId, { headers: { "User-Agent": UA } });
  if (!resp.ok) throw new Error("HN items " + resp.status);
  const item = await resp.json();
  const comments = [];
  for (const child of item.children || []) flattenComments(child, 0, comments);
  const topLevel = comments.filter((c) => c.depth === 0).sort((a, b) => b.text.length - a.text.length);
  const top = topLevel.slice(0, topK);
  const friction = top.map((c) => c.text).join(" ").slice(0, 800);
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
  }
  var friction = parts.join(" ").slice(0, 800);
  return { core_concept: fullName, friction_point: friction, signal_strength: parts.length >= 3 ? "Medium" : "Low", comment_count: parts.length };
}
__name(extractGitHubFriction, "extractGitHubFriction");
var Q08_DIRECTIVE = [
  "You are the writer for q08.org \u2014 long-form analytical essays for a curious, technically-literate reader who wants to understand why things break and what that reveals.",
  "Your input is a friction signal from a technical community debate. Your output is a self-contained essay that a reader with no knowledge of the source thread can follow and enjoy.",
  "",
  "OPENING (the hook): begin with 2-4 sentences that make a reader want to keep reading. Do not start with a definition or 'This essay...'. Open with a concrete observation, a striking tension, or a question that reveals why this matters. Establish in the first paragraph why a reader should care.",
  "",
  "BODY: write flowing prose paragraphs. NO bullet lists. NO numbered lists. NO tables. Use 2-4 H2 subheadings, but every section is prose, never lists.",
  "Weave at least two surprising connections through the essay: historical parallels, cross-domain analogies, or timeless structural patterns that illuminate the friction from an unexpected angle. The signature of this publication is 'connections a reader did not expect, woven honestly.'",
  "Make every claim concrete: name the actual mechanism, the actual constraint, the actual failure \u2014 never a category label or a capitalized abstraction.",
  "",
  "ARC (three movements, written as prose):",
  "1. Identify the underlying structural flaw \u2014 the single cause that, if removed, would dissolve most of the friction.",
  "2. Walk through the failure modes as prose, each with a concrete cause and consequence.",
  "3. Close with a minimal alternative framework: what the system becomes when the flaw is removed, described concretely and specifically.",
  "",
  "CONSTRAINTS (hard):",
  "- Timeless: no dates, no current events, no named products, companies, platforms, or websites.",
  "- No personal names, no usernames, no @handles. No emotional vocabulary. No hedging ('it seems', 'perhaps').",
  "- No first person. No preamble or meta-commentary.",
  "- 700-1100 words.",
  "- Output: valid Markdown, H1 title first, then the essay. The H1 title must be concrete and intriguing, not abstract (never 'An Analysis of X' or 'A Critique of Y').",
  "- Mathematical notation: inline math as \\(...\\), display math as \\[...\\]. Use only these delimiters; never single-dollar signs.",
].join("\n");
function buildPrompt(friction, fewShot) {
  var parts = [Q08_DIRECTIVE];
  if (fewShot && fewShot.length > 0) {
    parts.push("\n--- HIGH-PERFORMING STRUCTURE EXAMPLES ---");
    for (var ex of fewShot.slice(0, 2)) {
      parts.push(ex.structure_md.slice(0, 600));
    }
  }
  parts.push("\n--- SIGNAL ---");
  parts.push("core_concept: " + friction.core_concept);
  parts.push("friction_point: " + friction.friction_point);
  parts.push("signal_strength: " + friction.signal_strength);
  return parts.join("\n");
}
__name(buildPrompt, "buildPrompt");
var COMPOSE_MODELS = [
  "@cf/openai/gpt-oss-120b",
  "@cf/moonshotai/kimi-k2.6",
  "@cf/zai-org/glm-5.3"
];
async function compose(env, prompt) {
  var lastErr;
  for (var modelId of COMPOSE_MODELS) {
    try {
      var resp = await env.AI.run(modelId, {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2e3,
        temperature: 0.65
      }, { signal: AbortSignal.timeout(12e4) });
      var text = resp.response || resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content || "";
      if (text && text.length > 200) return { text, model: modelId };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("all compose models failed: " + String(lastErr && lastErr.message || lastErr).slice(0, 200));
}
__name(compose, "compose");
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
var BANNED_HANDLES = /@\w+/g;
var BAD_TITLE_RE = /^(an? |the )?(analysis|critique|examination|exploration|overview|review|understanding|study|assessment|investigation) of /i;
function gate(text) {
  var problems = [];
  var body = text.toLowerCase();
  if (text.length < 600) problems.push("too short for long-form (" + text.length + " chars)");
  var titleMatch = text.match(/^#\s+(.+)$/m);
  var title = titleMatch ? titleMatch[1].trim() : "";
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
  return { ok: problems.length === 0, problems };
}
__name(gate, "gate");
async function persistPiece(env, piece, signal, story, model) {
  var salt = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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
  var skeleton = body.split("\n").filter((l) => l.startsWith("#") || l.startsWith("- ") || l.startsWith("**")).join("\n").slice(0, 800);
  if (skeleton.length > 50) {
    await env.DB.prepare(
      "INSERT INTO prompt_pool (id, piece_id, structure_md, active) VALUES (?,?,?,1)"
    ).bind("pp-" + salt, pieceId, skeleton).run();
  }
  return { slug, title, pieceId };
}
__name(persistPiece, "persistPiece");
async function feedbackScan(env) {
  var rows = await env.DB.prepare(
    "SELECT pp.id, pp.piece_id, pp.structure_md, p.reads FROM prompt_pool pp JOIN published_pieces p ON p.id=pp.piece_id WHERE pp.active=1 ORDER BY p.reads DESC"
  ).all();
  var all = rows.results || [];
  if (all.length < 4) return { promoted: 0, purged: 0 };
  var topK = Math.max(1, Math.floor(all.length * 0.15));
  var bottomK = Math.max(1, Math.floor(all.length * 0.15));
  var topIds = all.slice(0, topK).map((r) => r.id);
  var bottomIds = all.slice(-bottomK).map((r) => r.id);
  for (var id of topIds) {
    await env.DB.prepare("UPDATE prompt_pool SET active=2 WHERE id=?").bind(id).run();
  }
  for (var id of bottomIds) {
    await env.DB.prepare("UPDATE prompt_pool SET active=0 WHERE id=?").bind(id).run();
  }
  return { promoted: topIds.length, purged: bottomIds.length };
}
__name(feedbackScan, "feedbackScan");
async function generate(env) {
  var t0 = Date.now();
  var dayCount = await env.DB.prepare(
    "SELECT COUNT(*) n FROM published_pieces WHERE published_at >= ?1"
  ).bind(utcDay() + "T00:00:00.000Z").first();
  var todayN = dayCount && dayCount.n || 0;
  if (todayN >= MAX_PER_DAY) {
    return { ok: false, reason: "daily cap reached (" + todayN + "/" + MAX_PER_DAY + ")" };
  }
  var stories = [];
  try {
    stories = stories.concat(await scrapeHN());
  } catch (e) {
  }
  try {
    stories = stories.concat(await scrapeGitHub());
  } catch (e) {
  }
  try {
    stories = stories.concat(await scrapeArxiv());
  } catch (e) {
  }
  if (!stories.length) return { ok: false, reason: "no signals scraped" };
  var processed = await env.DB.prepare(
    "SELECT source_id FROM signal_log WHERE processed_at >= ?1"
  ).bind(utcDay() + "T00:00:00.000Z").all();
  var processedIds = new Set((processed.results || []).map((r) => String(r.source_id)));
  var candidates = stories.filter((s) => !processedIds.has(String((s.source || "hn") + ":" + s.id)));
  if (!candidates.length) return { ok: false, reason: "all signals already processed today" };
  var lastRun = await env.DB.prepare("SELECT top_signal FROM engine_runs WHERE top_signal != '' ORDER BY id DESC LIMIT 1").first();
  var lastSource = lastRun ? String(lastRun.top_signal || "").split(":")[0] : "";
  var diverse = candidates.find(function(s) {
    return (s.source || "hn") !== lastSource;
  });
  var ordered = diverse ? [diverse].concat(candidates.filter(function(s) {
    return s !== diverse;
  })) : candidates;
  var story = null, friction = null;
  for (var ci = 0; ci < Math.min(ordered.length, 8); ci++) {
    var cand = ordered[ci];
    var f = null;
    try {
      if ((cand.source || "hn") === "github") f = await extractGitHubFriction(cand.id, cand.description || "");
      else if ((cand.source || "hn") === "arxiv") f = { core_concept: cand.title, friction_point: (String(cand.title || "") + ". " + String(cand.abstract || "")).slice(0, 800), signal_strength: "Medium" };
      else f = await extractFriction(cand.id);
    } catch (e) {
      f = null;
    }
    if (f && f.friction_point && f.friction_point.length >= 60) {
      story = cand;
      friction = f;
      break;
    }
  }
  if (!story) {
    return { ok: false, reason: "no candidate yielded sufficient friction (" + candidates.length + " available)" };
  }
  var exemplars = await env.DB.prepare(
    "SELECT structure_md FROM prompt_pool WHERE active=2 ORDER BY performance_score DESC LIMIT 2"
  ).all();
  var fewShot = exemplars.results || [];
  var prompt = buildPrompt(friction, fewShot);
  var piece = await compose(env, prompt);
  var gateResult = gate(piece.text);
  if (!gateResult.ok) {
    await env.DB.prepare(
      "INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, top_signal, model, ms, status, error) VALUES (?,?,?,?,?,?,?,?)"
    ).bind(stories.length, candidates.length, 0, (story.source || "hn") + ":" + story.title.slice(0, 80), piece.model, Date.now() - t0, "gate_failed", gateResult.problems.join("; ")).run();
    return { ok: false, reason: "gate failed: " + gateResult.problems.join("; ") };
  }
  var saved = await persistPiece(env, piece, friction, story, piece.model);
  feedbackScan(env).catch(() => {
  });
  await queueForDistribution(env, saved.title, saved.slug);
  pingIndexNow(env, ORIGIN + "/p/" + saved.slug).catch(() => {
  });
  await env.DB.prepare(
    "INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, top_signal, model, ms, status) VALUES (?,?,?,?,?,?,?)"
  ).bind(stories.length, candidates.length, 1, (story.source || "hn") + ":" + story.title.slice(0, 80), piece.model, Date.now() - t0, "ok").run();
  return { ok: true, slug: saved.slug, title: saved.title, model: piece.model, source: story.source || "hn", story: story.title };
}
__name(generate, "generate");
var MATH_HEAD = "<script>window.MathJax={tex:{inlineMath:[[\"\\\\(\",\"\\\\)\"]],displayMath:[[\"$$\",\"$$\"],[\"\\\\[\",\"\\\\]\"]],processEscapes:true},svg:{scale:1.1,fontCache:\"global\"},options:{skipHtmlTags:[\"script\",\"noscript\",\"style\",\"textarea\",\"pre\",\"code\"],enableMenu:false}};function __mq(){if(window.MathJax&&MathJax.typesetPromise){MathJax.typesetPromise().catch(function(){})}}if(document.readyState===\"complete\"){setTimeout(__mq,150)}else{window.addEventListener(\"load\",function(){setTimeout(__mq,150)})}</script><script async src=\"https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js\" onerror=\"this.onerror=null;var s=document.createElement('script');s.src='https://unpkg.com/mathjax@3/es5/tex-svg.js';document.head.appendChild(s);\"></script>";
function safeUrl(u) {
  var x = String(u || "").trim();
  return /^https?:\/\//i.test(x) ? x : "";
}
__name(safeUrl, "safeUrl");
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
__name(renderSources, "renderSources");
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
__name(buildSources, "buildSources");
function mdEmph(x) {
  var parts = String(x).split(/(\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  for (var i = 0; i < parts.length; i++) {
    if (i % 2 === 1) continue;
    parts[i] = parts[i].replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/_(.+?)_/g, "<em>$1</em>");
  }
  return parts.join("");
}
__name(mdEmph, "mdEmph");
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
footer{margin-top:4rem;padding-top:1.5rem;border-top:1px solid var(--line);font-size:.82rem;color:var(--mut)}
.chip{display:inline-block;font-size:.75rem;padding:.15rem .5rem;border-radius:3px;background:var(--line);color:var(--mut);margin-right:.4rem}
.refs{margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid var(--line)}
.refs h2{font-size:.95rem;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);font-weight:400;margin-bottom:.8rem}
.refs ul{margin:0;padding-left:1.2rem}
.refs li{margin-bottom:.4rem;font-size:.92rem}
.refs a{color:var(--acc)}
.refs a:hover{text-decoration:underline}
`;
function renderIndex(pieces) {
  var items = pieces.map(function(p) {
    var date = (p.published_at || "").slice(0, 10);
    var lede = (p.body_md || "").replace(/^#+\s*.+\n?/m, "").replace(/[#*_`]/g, "").trim().slice(0, 180);
    return [
      "<article>",
      '<h2><a href="/p/' + escHtml(p.slug) + '">' + escHtml(p.title) + "</a></h2>",
      '<div class="meta">' + date + (p.core_concept ? ' &middot; <span class="chip">' + escHtml(p.core_concept.slice(0, 40)) + "</span>" : "") + "</div>",
      lede ? '<div class="lede">' + escHtml(lede) + "&hellip;</div>" : "",
      "</article>"
    ].join("\n");
  }).join("\n");
  return '<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>q08</title><meta name=description content="Systems-level critique of technical industry friction. Cold, structural, timeless."><style>' + CSS + '</style>' + MATH_HEAD + '</head><body><div class=wrap><header><h1>q08</h1><p>Systems-level critique. Structural. Timeless.</p><nav><a href="/">Index</a><a href="/feed.xml">RSS</a><a href="/subscribe">Subscribe</a><a href="/health">Status</a></nav></header>' + (items || '<p style="color:var(--mut)">No pieces published yet. Check back soon.</p>') + "<footer>q08 &mdash; autonomous signal engine &mdash; updated continuously</footer></div></body></html>";
}
__name(renderIndex, "renderIndex");
function mdToHtml(md) {
  var lines = md.split("\n");
  var out = [];
  var inUl = false;
  for (var line of lines) {
    var h3 = line.match(/^### (.+)/);
    var h2 = line.match(/^## (.+)/);
    var h1 = line.match(/^# (.+)/);
    var li = line.match(/^[-*] (.+)/);
    var blank = line.trim() === "";
    if (h1) {
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      out.push("<h1>" + escHtml(h1[1]) + "</h1>");
    } else if (h2) {
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      out.push("<h2>" + escHtml(h2[1]) + "</h2>");
    } else if (h3) {
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      out.push("<h3>" + escHtml(h3[1]) + "</h3>");
    } else if (li) {
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push("<li>" + mdEmph(escHtml(li[1])) + "</li>");
    } else if (blank) {
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
    } else {
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      out.push("<p>" + mdEmph(escHtml(line)) + "</p>");
    }
  }
  if (inUl) out.push("</ul>");
  return out.join("\n");
}
__name(mdToHtml, "mdToHtml");
function renderPiece(p) {
  var body = mdToHtml(p.body_md || "");
  var refs = renderSources(p.sources_json);
  var date = (p.published_at || "").slice(0, 10);
  return '<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>' + escHtml(p.title) + ' \u2014 q08</title><meta name=description content="' + escHtml((p.body_md || "").replace(/[#*_`\n]/g, " ").trim().slice(0, 160)) + '"><style>' + CSS + '</style>' + MATH_HEAD + '</head><body><div class=wrap><header><h1><a href="/" style="color:inherit;text-decoration:none">q08</a></h1><nav><a href="/">\u2190 Index</a><a href="/feed.xml">RSS</a><a href="/subscribe">Subscribe</a></nav></header><div class=piece><h1>' + escHtml(p.title) + '</h1><div class="meta" style="margin-bottom:1.5rem">' + date + (p.core_concept ? ' &middot; <span class="chip">' + escHtml(p.core_concept.slice(0, 40)) + "</span>" : "") + "</div>" + body + refs + "</div><footer>q08 &mdash; autonomous signal engine</footer></div></body></html>";
}
__name(renderPiece, "renderPiece");
function renderFeed(pieces) {
  var items = pieces.map(function(p) {
    var date = new Date(p.published_at || Date.now()).toUTCString();
    var desc = (p.body_md || "").replace(/\\/g, "").replace(/[<>&"]/g, function(c) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c];
    }).slice(0, 500);
    return "<item><title>" + escHtml(p.title) + "</title><link>https://q08.org/p/" + escHtml(p.slug) + "</link><pubDate>" + date + "</pubDate><description>" + desc + "...</description></item>";
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
async function sendEmail(env, to, subject, body) {
  if (env.SEND_EMAIL) {
    try {
      await env.SEND_EMAIL.send({ to, from: "digest@q08.org", subject, text: body });
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
  var pieces = await env.DB.prepare("SELECT slug, title FROM published_pieces WHERE published_at >= ?1 ORDER BY published_at ASC").bind(day + "T00:00:00.000Z").all();
  var rows = pieces.results || [];
  if (!rows.length) return { ok: true, skipped: "no pieces today", pieces: 0 };
  var subs = await env.DB.prepare("SELECT email, token FROM subscribers WHERE status='confirmed' LIMIT 500").all();
  var list = rows.map(function(r2) {
    return "- " + r2.title + " - https://q08.org/p/" + r2.slug;
  }).join("\n");
  var sent = 0;
  for (var s of subs.results || []) {
    var body = "q08 - daily digest (" + day + ")\n\n" + list + "\n\nUnsubscribe: https://q08.org/unsubscribe?t=" + s.token;
    var r = await sendEmail(env, s.email, "q08 - daily digest", body);
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
async function queueForDistribution(env, title, slug) {
  if (!env.AUDIT) return { ok: false, skip: "no audit binding" };
  try {
    var text = (title + " \u2014 https://q08.org/p/" + slug).slice(0, 280);
    var id = "q08-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await env.AUDIT.prepare("INSERT OR IGNORE INTO social_threads (slug, title, posts, status) VALUES (?,?,?, 'queued')").bind(id, String(title || "").slice(0, 300), JSON.stringify([text])).run();
    return { ok: true, queued: id };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(queueForDistribution, "queueForDistribution");
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
var worker_default = {
  async fetch(req, env, ctx) {
    var url = new URL(req.url);
    var path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/health") {
      var cnt = await env.DB.prepare("SELECT COUNT(*) n FROM published_pieces").first().catch(() => ({ n: 0 }));
      var last = await env.DB.prepare("SELECT slug, title, published_at FROM published_pieces ORDER BY published_at DESC LIMIT 1").first().catch(() => null);
      var runs = await env.DB.prepare("SELECT status, COUNT(*) n FROM engine_runs GROUP BY status").all().catch(() => ({ results: [] }));
      return json({ ok: true, worker: WORKER, version: VERSION, pieces: cnt.n, last, runs: runs.results });
    }
    if (path === "/run" && req.method === "POST") {
      var async_mode = url.searchParams.get("async") !== "0";
      if (async_mode) {
        var runId = Date.now().toString(36);
        ctx.waitUntil(generate(env).then(async (out2) => {
          await env.DB.prepare("UPDATE engine_runs SET error=? WHERE id=(SELECT MAX(id) FROM engine_runs)").bind("run-id:" + runId + " result:" + JSON.stringify(out2).slice(0, 200)).run().catch(() => {
          });
        }).catch(async (e) => {
          await env.DB.prepare("INSERT INTO engine_runs (ms,status,error) VALUES (0,'error',?)").bind(String(e && e.message || e).slice(0, 500)).run().catch(() => {
          });
        }));
        return json({ ok: true, worker: WORKER, version: VERSION, mode: "async", run_id: runId, note: "generating in background; poll /api/runs or /health for result" });
      }
      var out = await generate(env);
      return json({ ok: true, worker: WORKER, version: VERSION, out });
    }
    if (path === "/feed.xml") {
      var rows = await env.DB.prepare("SELECT slug, title, body_md, core_concept, published_at FROM published_pieces ORDER BY published_at DESC LIMIT 20").all();
      return new Response(renderFeed(rows.results || []), { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
    }
    if (path.startsWith("/p/")) {
      var slug = path.slice(3);
      var piece = await env.DB.prepare("SELECT * FROM published_pieces WHERE slug=?").bind(slug).first();
      if (!piece) return html("<h1>Not found</h1>", 404);
      env.DB.prepare("UPDATE published_pieces SET reads=reads+1 WHERE slug=?").bind(slug).run().catch(() => {
      });
      return html(renderPiece(piece));
    }
    if (path === "/" + INDEXNOW_KEY + ".txt") return new Response(INDEXNOW_KEY, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    if (path === "/subscribe") return await handleSubscribe(req, env, url);
    if (path === "/confirm") {
      var t0 = url.searchParams.get("t") || "";
      await env.DB.prepare("UPDATE subscribers SET status='confirmed', confirmed_at=? WHERE token=? AND status!='unsubscribed'").bind(nowIso(), t0).run();
      return html("<h2>Subscribed</h2><p>You are subscribed. The daily digest arrives each evening.</p>");
    }
    if (path === "/unsubscribe") {
      var t1 = url.searchParams.get("t") || "";
      await env.DB.prepare("UPDATE subscribers SET status='unsubscribed' WHERE token=?").bind(t1).run();
      return html("<h2>Unsubscribed</h2><p>You have been removed from the daily digest.</p>");
    }
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
    var pieces = await env.DB.prepare("SELECT slug, title, body_md, core_concept, published_at FROM published_pieces ORDER BY published_at DESC LIMIT 20").all().catch(() => ({ results: [] }));
    return html(renderIndex(pieces.results || []));
  },
  async scheduled(controller, env, ctx) {
    if (controller.cron === "0 17 * * *") {
      ctx.waitUntil(sendDigest(env));
      return;
    }
    ctx.waitUntil(generate(env).catch(async (e) => {
      await env.DB.prepare(
        "INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, ms, status, error) VALUES (0,0,0,0,'error',?)"
      ).bind(String(e && e.message || e).slice(0, 500)).run().catch(() => {
      });
    }));
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
