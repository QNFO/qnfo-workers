/**
 * q08-signal-engine — v0.1.0
 *
 * What it is
 *   The external signal engine for q08.org. Scrapes high-friction technical
 *   discussions from Hacker News (and later GitHub Trending / arXiv), ranks
 *   them by a volatility score, extracts the structural friction point, then
 *   composes a timeless systems-level essay via the qnfo-ai router and
 *   publishes it to q08.org.
 *
 * Architecture (per notes _26257092731.md + _26257093042.md)
 *   cron (every 2h) -> scrape_hn -> volatility_rank -> pick_top ->
 *   extract_friction -> build_prompt -> compose (qnfo-ai) ->
 *   gate (no names / no handles / no emotional vocab) ->
 *   persist (D1 q08-signal) -> serve HTML
 *
 * Register
 *   Cold, structural, systems-level objectivity. H3 scaffolding.
 *   Bulleted taxonomies. No names. No handles. No emotional vocabulary.
 *   Timeless. Weave multiple diverse threads. Synthesize honestly.
 *
 * Bindings
 *   DB          — D1 q08-signal (signal_log, published_pieces, prompt_pool, engine_runs)
 *   QNFO_AI     — service binding to qnfo-ai (OpenAI-compat router)
 *   EMAIL       — service binding to qnfo-email (alerts on publish)
 *
 * Secrets
 *   ROUTER_TOKEN — bearer token for qnfo-ai
 *
 * Cron: 0 * /2 * * * (every 2 hours; up to 10x/day cap enforced in code)
 */

var VERSION = "0.1.0";
var WORKER = "q08-signal-engine";
var MAX_PER_DAY = 10;
var HN_SEARCH = "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50";
var HN_ITEMS  = "https://hn.algolia.com/api/v1/items/";
var ROUTER    = "https://qnfo-ai.internal/v1/chat/completions";
var UA        = "q08-signal-engine/0.1.0 (+https://q08.org)";

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
  return new Response(body, {
    status: status || 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" }
  });
}
function escHtml(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ---------------------------------------------------------------------------
// 1. Ingestion — Hacker News front page
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
    // Priority Score = (Engagements × Velocity) + Controversy Modifier
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
// 2. Friction extraction — top-level comments ranked by length (content proxy)
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

// ---------------------------------------------------------------------------
// 3. Prompt construction — q08 register
// ---------------------------------------------------------------------------
var Q08_DIRECTIVE = [
  "Take this external industrial tension. Strip out names, handles, and emotional vocabulary.",
  "Reframe the argument into a timeless, systems-level architecture critique.",
  "Requirements:",
  "- Use strict structural scaffolding: H2 and H3 headers, bulleted taxonomies, high visual scannability.",
  "- Write with cold, structural objectivity. No first person. No hedging.",
  "- Do NOT mention the source website, platform, or specific users.",
  "- Weave together multiple, diverse threads from the friction signal.",
  "- Address the underlying structural flaw.",
  "- Provide a 3-point taxonomy of the failure modes.",
  "- Outline a minimal alternative framework.",
  "- Synthesize diverse information honestly and objectively.",
  "- Length: 600–900 words. Timeless — no references to current events or dates.",
  "Output format: valid Markdown starting with a H1 title, then the body. No preamble, no meta-commentary.",
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

// ---------------------------------------------------------------------------
// 4. LLM composition via qnfo-ai service binding
// ---------------------------------------------------------------------------
async function compose(env, prompt) {
  var body = JSON.stringify({
    model: "auto",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.65,
    max_tokens: 2000,
  });
  var resp;
  if (env.QNFO_AI && typeof env.QNFO_AI.fetch === "function") {
    resp = await env.QNFO_AI.fetch(ROUTER, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + (env.ROUTER_TOKEN || ""),
        "User-Agent": UA,
      },
      body,
    });
  } else {
    resp = await fetch("https://qnfo-ai.q08.workers.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + (env.ROUTER_TOKEN || ""),
        "User-Agent": UA,
      },
      body,
    });
  }
  if (!resp.ok) throw new Error("compose " + resp.status + " " + await resp.text().catch(() => ""));
  const data = await resp.json();
  const text = (data.choices || [])[0]?.message?.content || "";
  const model = data.model || "unknown";
  return { text, model };
}

// ---------------------------------------------------------------------------
// 5. Gate — structural validation (no names, no handles, minimum length)
// ---------------------------------------------------------------------------
var NAME_RE = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
var HANDLE_RE = /@\w+/g;
var EMOTION_WORDS = ["frustrated", "angry", "upset", "excited", "thrilled", "disappointed", "outraged", "amazing", "terrible", "horrible"];
function gate(text) {
  var problems = [];
  if (text.length < 400) problems.push("too short (" + text.length + " chars)");
  var names = text.match(NAME_RE) || [];
  if (names.length > 0) problems.push("contains names: " + names.slice(0, 3).join(", "));
  var handles = text.match(HANDLE_RE) || [];
  if (handles.length > 0) problems.push("contains handles: " + handles.slice(0, 3).join(", "));
  for (var w of EMOTION_WORDS) {
    if (text.toLowerCase().includes(w)) { problems.push("emotional vocabulary: " + w); break; }
  }
  if (!text.includes("##") && !text.includes("- ")) problems.push("missing structural scaffolding (H2/bullets)");
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
    "sig-" + (story.id || salt), "hn", String(story.id || ""),
    story.title, story.url, story.points, story.num_comments,
    story.ratio, story.volatility_score,
    signal.friction_point, signal.signal_strength, "published", nowIso()
  ).run();
  // Persist piece
  await env.DB.prepare(
    "INSERT INTO published_pieces (id, signal_id, slug, title, body_md, core_concept, signal_source, published_at) VALUES (?,?,?,?,?,?,?,?)"
  ).bind(
    pieceId, "sig-" + (story.id || salt), slug, title, body,
    signal.core_concept, "hn:" + story.id, nowIso()
  ).run();
  // Seed prompt pool with structure skeleton (H2/H3 headings only)
  var skeleton = body.split("\n").filter(l => l.startsWith("#") || l.startsWith("- ") || l.startsWith("**")).join("\n").slice(0, 800);
  if (skeleton.length > 50) {
    await env.DB.prepare(
      "INSERT INTO prompt_pool (id, piece_id, structure_md, active) VALUES (?,?,?,1)"
    ).bind("pp-" + salt, pieceId, skeleton).run();
  }
  return { slug, title, pieceId };
}

// ---------------------------------------------------------------------------
// 7. Feedback loop — promote top 15%, purge bottom 15%
// ---------------------------------------------------------------------------
async function feedbackScan(env) {
  // Rank prompt_pool by reads (from published_pieces joined)
  var rows = await env.DB.prepare(
    "SELECT pp.id, pp.piece_id, pp.structure_md, p.reads FROM prompt_pool pp JOIN published_pieces p ON p.id=pp.piece_id WHERE pp.active=1 ORDER BY p.reads DESC"
  ).all();
  var all = rows.results || [];
  if (all.length < 4) return { promoted: 0, purged: 0 };
  var topK    = Math.max(1, Math.floor(all.length * 0.15));
  var bottomK = Math.max(1, Math.floor(all.length * 0.15));
  var topIds    = all.slice(0, topK).map(r => r.id);
  var bottomIds = all.slice(-bottomK).map(r => r.id);
  // Promote top (mark active=2 = few-shot exemplar)
  for (var id of topIds) {
    await env.DB.prepare("UPDATE prompt_pool SET active=2 WHERE id=?").bind(id).run();
  }
  // Purge bottom (deactivate)
  for (var id of bottomIds) {
    await env.DB.prepare("UPDATE prompt_pool SET active=0 WHERE id=?").bind(id).run();
  }
  return { promoted: topIds.length, purged: bottomIds.length };
}

// ---------------------------------------------------------------------------
// 8. Main generation cycle
// ---------------------------------------------------------------------------
async function generate(env) {
  var t0 = Date.now();
  // Daily cap check
  var dayCount = await env.DB.prepare(
    "SELECT COUNT(*) n FROM published_pieces WHERE published_at >= ?1"
  ).bind(utcDay() + "T00:00:00.000Z").first();
  var todayN = (dayCount && dayCount.n) || 0;
  if (todayN >= MAX_PER_DAY) {
    return { ok: false, reason: "daily cap reached (" + todayN + "/" + MAX_PER_DAY + ")" };
  }
  // Scrape + rank
  var stories = await scrapeHN();
  if (!stories.length) return { ok: false, reason: "no stories scraped" };
  // Skip already-processed story IDs today
  var processed = await env.DB.prepare(
    "SELECT source_id FROM signal_log WHERE source='hn' AND processed_at >= ?1"
  ).bind(utcDay() + "T00:00:00.000Z").all();
  var processedIds = new Set((processed.results || []).map(r => String(r.source_id)));
  var candidates = stories.filter(s => !processedIds.has(String(s.id)));
  if (!candidates.length) return { ok: false, reason: "all top stories already processed today" };
  var story = candidates[0];
  // Extract friction
  var friction = await extractFriction(story.id);
  if (!friction.friction_point || friction.friction_point.length < 100) {
    return { ok: false, reason: "insufficient friction extracted from story " + story.id };
  }
  // Fetch few-shot exemplars from prompt pool (top performers)
  var exemplars = await env.DB.prepare(
    "SELECT structure_md FROM prompt_pool WHERE active=2 ORDER BY performance_score DESC LIMIT 2"
  ).all();
  var fewShot = (exemplars.results || []);
  // Compose
  var prompt = buildPrompt(friction, fewShot);
  var piece  = await compose(env, prompt);
  // Gate
  var gateResult = gate(piece.text);
  if (!gateResult.ok) {
    await env.DB.prepare(
      "INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, top_signal, model, ms, status, error) VALUES (?,?,?,?,?,?,?,?)"
    ).bind(stories.length, candidates.length, 0, story.title.slice(0, 120), piece.model, Date.now()-t0, "gate_failed", gateResult.problems.join("; ")).run();
    return { ok: false, reason: "gate failed: " + gateResult.problems.join("; ") };
  }
  // Persist
  var saved = await persistPiece(env, piece, friction, story, piece.model);
  // Feedback loop (async, non-blocking)
  feedbackScan(env).catch(() => {});
  // Log run
  await env.DB.prepare(
    "INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, top_signal, model, ms, status) VALUES (?,?,?,?,?,?,?)"
  ).bind(stories.length, candidates.length, 1, story.title.slice(0, 120), piece.model, Date.now()-t0, "ok").run();
  return { ok: true, slug: saved.slug, title: saved.title, model: piece.model, story: story.title };
}

// ---------------------------------------------------------------------------
// 9. HTML rendering
// ---------------------------------------------------------------------------
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
`;

function renderIndex(pieces) {
  var items = pieces.map(function(p) {
    var date = (p.published_at || "").slice(0, 10);
    var lede = (p.body_md || "").replace(/^#+\s*.+\n?/m, "").replace(/[#*_`]/g, "").trim().slice(0, 180);
    return [
      '<article>',
      '<h2><a href="/p/' + escHtml(p.slug) + '">' + escHtml(p.title) + '</a></h2>',
      '<div class="meta">' + date + (p.core_concept ? ' &middot; <span class="chip">' + escHtml(p.core_concept.slice(0,40)) + '</span>' : '') + '</div>',
      lede ? '<div class="lede">' + escHtml(lede) + '&hellip;</div>' : '',
      '</article>',
    ].join("\n");
  }).join("\n");
  return '<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>q08</title><meta name=description content="Systems-level critique of technical industry friction. Cold, structural, timeless."><style>' + CSS + '</style></head><body><div class=wrap><header><h1>q08</h1><p>Systems-level critique. Structural. Timeless.</p><nav><a href="/">Index</a><a href="/feed.xml">RSS</a><a href="/health">Status</a></nav></header>' + (items || '<p style="color:var(--mut)">No pieces published yet. Check back soon.</p>') + '<footer>q08 &mdash; autonomous signal engine &mdash; updated continuously</footer></div></body></html>';
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
    else if (li) { if (!inUl) { out.push("<ul>"); inUl=true; } out.push("<li>" + escHtml(li[1]).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/_(.+?)_/g,"<em>$1</em>") + "</li>"); }
    else if (blank) { if (inUl) { out.push("</ul>"); inUl=false; } }
    else { if (inUl) { out.push("</ul>"); inUl=false; } out.push("<p>" + escHtml(line).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/_(.+?)_/g,"<em>$1</em>") + "</p>"); }
  }
  if (inUl) out.push("</ul>");
  return out.join("\n");
}

function renderPiece(p) {
  var body = mdToHtml(p.body_md || "");
  var date = (p.published_at || "").slice(0, 10);
  return '<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>' + escHtml(p.title) + ' — q08</title><meta name=description content="' + escHtml((p.body_md||"").replace(/[#*_`\n]/g," ").trim().slice(0,160)) + '"><style>' + CSS + '</style></head><body><div class=wrap><header><h1><a href="/" style="color:inherit;text-decoration:none">q08</a></h1><nav><a href="/">← Index</a><a href="/feed.xml">RSS</a></nav></header><div class=piece><h1>' + escHtml(p.title) + '</h1><div class="meta" style="margin-bottom:1.5rem">' + date + (p.core_concept ? ' &middot; <span class="chip">' + escHtml(p.core_concept.slice(0,40)) + '</span>' : '') + '</div>' + body + '</div><footer>q08 &mdash; autonomous signal engine</footer></div></body></html>';
}

function renderFeed(pieces) {
  var items = pieces.map(function(p) {
    var date = new Date(p.published_at || Date.now()).toUTCString();
    var desc = (p.body_md || "").replace(/[<>&"]/g, function(c){return{"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c];}).slice(0, 500);
    return "<item><title>" + escHtml(p.title) + "</title><link>https://q08.org/p/" + escHtml(p.slug) + "</link><pubDate>" + date + "</pubDate><description>" + desc + "...</description></item>";
  }).join("\n");
  return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>q08</title><link>https://q08.org</link><description>Systems-level critique. Structural. Timeless.</description>' + items + '</channel></rss>';
}

// ---------------------------------------------------------------------------
// 10. Worker export
// ---------------------------------------------------------------------------
export default {
  async fetch(req, env, ctx) {
    var url  = new URL(req.url);
    var path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/health") {
      var cnt = await env.DB.prepare("SELECT COUNT(*) n FROM published_pieces").first().catch(() => ({n:0}));
      var last = await env.DB.prepare("SELECT slug, title, published_at FROM published_pieces ORDER BY published_at DESC LIMIT 1").first().catch(() => null);
      var runs = await env.DB.prepare("SELECT status, COUNT(*) n FROM engine_runs GROUP BY status").all().catch(() => ({results:[]}));
      return json({ ok: true, worker: WORKER, version: VERSION, pieces: cnt.n, last, runs: runs.results });
    }

    if (path === "/run" && req.method === "POST") {
      // Detach: generate() takes 30-90s (HN fetch + LLM). Return immediately,
      // run in background via waitUntil so the HTTP response is not blocked.
      var async_mode = url.searchParams.get("async") !== "0";
      if (async_mode) {
        var runId = Date.now().toString(36);
        ctx.waitUntil(generate(env).then(async (out) => {
          await env.DB.prepare("UPDATE engine_runs SET error=? WHERE id=(SELECT MAX(id) FROM engine_runs)")
            .bind("run-id:" + runId + " result:" + JSON.stringify(out).slice(0,200)).run().catch(()=>{});
        }).catch(async (e) => {
          await env.DB.prepare("INSERT INTO engine_runs (ms,status,error) VALUES (0,'error',?)").bind(String(e&&e.message||e).slice(0,500)).run().catch(()=>{});
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
      // Increment read count
      env.DB.prepare("UPDATE published_pieces SET reads=reads+1 WHERE slug=?").bind(slug).run().catch(() => {});
      return html(renderPiece(piece));
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

    // Index
    var pieces = await env.DB.prepare("SELECT slug, title, body_md, core_concept, published_at FROM published_pieces ORDER BY published_at DESC LIMIT 20").all().catch(() => ({results:[]}));
    return html(renderIndex(pieces.results || []));
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(generate(env).catch(async (e) => {
      await env.DB.prepare(
        "INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, ms, status, error) VALUES (0,0,0,0,'error',?)"
      ).bind(String(e && e.message || e).slice(0, 500)).run().catch(() => {});
    }));
  },
};
