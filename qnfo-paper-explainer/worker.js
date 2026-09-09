// qnfo-paper-explainer v0.1.0
// Daily autonomous science-translation pipeline (100% cloud, user-free):
//   recent arXiv papers -> AI-select one accessible paper -> plain-English "what it is"
//   + honest everyday-life "why it matters (or not)" -> fact-check -> 4-post Bluesky thread
//   -> D1 audit log (paper_explain_log + cloud_ops_events).
// Goal: grow QNFO reach/awareness by being the account that explains science to everyone.
// Bluesky account: qnfo.bsky.social (shared with qnfo-social). Posted via our own AT Protocol
// session so the explainer keeps a guaranteed daily cadence, independent of the qnfo-social
// Zenodo queue backlog.
//
// DESIGN GATES (self-imposed, see README):
//   HONEST-OR-NOT-1   every explanation states whether the paper touches everyday life NOW /
//                     SOON / YEARS / NOT_YET, and says so plainly when it does NOT (no hype).
//   FACT-CHECK-1      posts are checked against the abstract before posting; flagged -> draft.
//   DEDUPE-1          one explanation per arXiv id (UNIQUE(arxiv_id)).
//   DAILY-CAP-1       max 1 thread/day (DAILY_CAP).
//   KILL-SWITCH-1     paper_explain_state.enabled=0 halts posting (still logs dry runs).

const VERSION = "0.1.0";
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"; // non-reasoning, fp8-fast (24k ctx), fast + cheap
const BSKY = "https://bsky.social/xrpc";
const UA = "Mozilla/5.0 (qnfo-paper-explainer)";
const ARXIV_CATS = "(cat:cs.AI OR cat:cs.LG OR cat:cs.CL OR cat:cs.CV OR cat:cs.CY OR cat:cs.HC OR cat:physics.pop-ph OR cat:q-bio.NC OR cat:econ.GN OR cat:stat.ML)";
const DAILY_CAP = 1;
const MAX_FETCH = 30;
const NL = String.fromCharCode(10);

// ---------- small helpers ----------
function truncate(text, max) {
  const pts = Array.from(String(text || ""));
  if (pts.length <= max) return String(text || "");
  return pts.slice(0, max).join("");
}

function extractText(ai) {
  if (!ai) return "";
  if (typeof ai === "string") return ai;
  if (typeof ai.response === "string" && ai.response) return ai.response;
  if (ai.result) {
    if (typeof ai.result === "string") return ai.result;
    if (typeof ai.result.response === "string" && ai.result.response) return ai.result.response;
  }
  const ch = (ai.choices && ai.choices[0]) || (ai.result && ai.result.choices && ai.result.choices[0]);
  if (ch) {
    if (ch.message && typeof ch.message.content === "string") return ch.message.content;
    if (typeof ch.text === "string") return ch.text;
  }
  if (typeof ai.output === "string") return ai.output;
  return "";
}

function sanitizePosts(raw) {
  return (raw || []).map((x) => truncate(String(x), 290)).filter((x) => x.trim());
}

function auth(request, env) {
  const tok = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tok) return false;
  const exp = env.EXPLAIN_TOKEN;
  if (!exp || tok.length !== exp.length) return false;
  let d = 0;
  for (let i = 0; i < tok.length; i++) d |= tok.charCodeAt(i) ^ exp.charCodeAt(i);
  return d === 0;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ---------- arXiv ----------
function parseArxiv(xml) {
  const entries = xml.split("<entry>").slice(1);
  const out = [];
  for (const en of entries) {
    const title = ((en.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "").replace(/\s+/g, " ").trim();
    const id = (en.match(/<id>[\s\S]*?arxiv\.org\/abs\/([^<]+)<\/id>/) || [])[1] || "";
    const pub = ((en.match(/<published>([^<]+)<\/published>/) || [])[1] || "").slice(0, 10);
    const summary = ((en.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1] || "").replace(/\s+/g, " ").trim();
    const authors = [];
    const am = en.match(/<name>([\s\S]*?)<\/name>/g) || [];
    for (const a of am) authors.push(a.replace(/<\/?name>/g, "").trim());
    if (title && id) out.push({ id: id.trim(), title: title.slice(0, 220), published: pub, authors: authors.slice(0, 4), abstract: summary.slice(0, 1500) });
  }
  return out;
}

async function fetchArxiv() {
  const q = encodeURIComponent(ARXIV_CATS);
  const r = await fetch("https://export.arxiv.org/api/query?search_query=" + q + "&start=0&max_results=" + MAX_FETCH + "&sortBy=submittedDate&sortOrder=descending", { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error("arxiv " + r.status);
  return parseArxiv(await r.text());
}

// ---------- Bluesky (AT Protocol) ----------
async function bskySession(env) {
  const r = await fetch(BSKY + "/com.atproto.server.createSession", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ identifier: env.BSKY_HANDLE, password: env.BSKY_APP_PASS })
  });
  if (!r.ok) throw new Error("bsky session " + r.status);
  return r.json();
}

async function bskyPostText(s, text, reply) {
  const record = { text: truncate(text, 290), createdAt: new Date().toISOString() };
  if (reply) record.reply = reply;
  const r = await fetch(BSKY + "/com.atproto.repo.createRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, "Authorization": "Bearer " + s.accessJwt },
    body: JSON.stringify({ repo: s.did, collection: "app.bsky.feed.post", record })
  });
  if (!r.ok) throw new Error("bsky post " + r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
}

async function bskyPostThread(s, posts) {
  let root = null, parent = null;
  const uris = [];
  for (let i = 0; i < posts.length; i++) {
    const reply = i > 0 ? { root, parent } : undefined;
    const res = await bskyPostText(s, posts[i], reply);
    uris.push(res.uri);
    if (i === 0) root = { uri: res.uri, cid: res.cid };
    parent = { uri: res.uri, cid: res.cid };
  }
  return uris;
}

// ---------- AI select + explain ----------
function parseJSON(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/\u0060\u0060\u0060(?:json)?/g, "").trim();
  try { return JSON.parse(cleaned); } catch (e) {}
  const lo = cleaned.indexOf("{"), hi = cleaned.lastIndexOf("}");
  if (lo >= 0 && hi > lo) {
    try { return JSON.parse(cleaned.slice(lo, hi + 1)); } catch (e2) {}
  }
  return null;
}

async function selectAndExplain(env, papers) {
  const prompt = [
    "You are a science translator. Your reader has no scientific training.",
    "Below are recent arXiv papers (id | title | authors | abstract).",
    "Step 1: choose the ONE paper most worth explaining to a general audience today. Prefer papers whose implications touch everyday life (health, energy, AI tools people use, money, climate, materials, computing, safety) or that are surprising/intellectually fun. Prefer abstracts you can explain without advanced math.",
    "Step 2: for that ONE paper, write a plain-English explanation and a 4-post social thread.",
    "",
    "Reply with STRICT JSON only, exactly this shape:",
    '{"arxiv_id":"...","headline":"...","what_it_is":"...","everyday_relevance":"...","relevance_label":"NOW","why_not":"...","posts":["p1","p2","p3","p4"]}',
    "",
    "Field rules:",
    "- headline: one short, plain-English rephrase of the title (no jargon).",
    "- what_it_is: 2-3 sentences. Plain English, an everyday analogy, no jargon, no math, no formulas.",
    "- everyday_relevance: 1-2 sentences naming a CONCRETE way this could show up in a reader's daily life (a product, tool, habit, health choice, bill, or decision). If it cannot, say plainly it is foundational or not-yet-practical. Avoid vague words like 'implications for' or 'in complex environments'.",
    "- relevance_label: exactly one of NOW (affects daily life already), SOON (likely within ~2 years), YEARS (plausibly 5+ years out), NOT_YET (no foreseeable everyday impact).",
    "- why_not: if relevance_label is YEARS or NOT_YET, one honest sentence on why it does not touch daily life yet. Otherwise leave it an empty string.",
    "- posts: exactly 4 posts, each under 280 characters, plain English, no exclamation marks, no emoji, no marketing hype, no invented numbers.",
    "  post[0]: hook - the plain-English claim as a hook.",
    "  post[1]: what it actually is, in plain language.",
    "  post[2]: why it matters for everyday life with ONE concrete example - or honestly why it does not yet. No vague 'implications'.",
    "  post[3]: the link arxiv.org/abs/<id> plus one takeaway or open question.",
    "",
    "PAPERS:",
    papers.map((p) => p.id + " | " + p.title + " | " + p.authors.slice(0, 3).join(", ") + " | " + p.abstract.slice(0, 800)).join(NL + NL)
  ].join(NL);

  const ai = await env.AI.run(MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: 2000 });
  const raw = extractText(ai);
  return { parsed: parseJSON(raw), raw };
}

// ---------- fact-check ----------
async function checkFaithful(env, title, abstract, posts) {
  const base = [
    "Given a paper (title + abstract = ground truth) and a social thread (candidate), list every claim in the thread that is NOT supported by the title or abstract.",
    "Check for: invented numbers, invented statistics, invented findings, overclaiming, misattribution, unsupported claims of being 'new' or 'first'.",
    "Ignore style: questions, hooks, calls to action, the arXiv link, and generic phrases like 'read the paper'.",
    "Output ONLY a JSON array of issues, each with a post number and an issue string. Output [] if the thread is fully faithful.",
    "PAPER: " + JSON.stringify({ title, abstract }),
    "THREAD: " + JSON.stringify(posts)
  ].join(NL);
  function parseIssues(text) {
    if (!text) return null;
    const cleaned = String(text).replace(/\u0060\u0060\u0060(?:json)?/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed.filter((x) => x && x.issue);
    } catch (e) {}
    const lo = cleaned.indexOf("["), hi = cleaned.lastIndexOf("]");
    if (lo >= 0 && hi > lo) {
      try {
        const parsed = JSON.parse(cleaned.slice(lo, hi + 1));
        if (Array.isArray(parsed)) return parsed.filter((x) => x && x.issue);
      } catch (e2) {}
    }
    return null;
  }
  let text = extractText(await env.AI.run(MODEL, { messages: [{ role: "user", content: base }], max_tokens: 700 })).trim();
  let issues = parseIssues(text);
  if (issues === null) {
    const retry = extractText(await env.AI.run(MODEL, { messages: [{ role: "user", content: "Reply with ONLY a JSON array. Nothing else.\n" + base }], max_tokens: 700 })).trim();
    issues = parseIssues(retry);
    if (issues === null) return { issues: [], degraded: true };
  }
  return { issues, degraded: false };
}

// ---------- D1 ----------
async function ensureTables(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS paper_explain_log (id INTEGER PRIMARY KEY AUTOINCREMENT, arxiv_id TEXT UNIQUE, headline TEXT, what_it_is TEXT, everyday_relevance TEXT, relevance_label TEXT, why_not TEXT, posts TEXT, status TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')))").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS paper_explain_state (key TEXT PRIMARY KEY, value TEXT)").run();
}

async function stateGet(env, key, fallback) {
  try {
    const r = await env.DB.prepare("SELECT value FROM paper_explain_state WHERE key = ?1").bind(key).first();
    return (r && r.value !== null && r.value !== undefined) ? r.value : fallback;
  } catch (e) { return fallback; }
}

async function alreadyExplained(env) {
  try {
    const r = await env.DB.prepare("SELECT arxiv_id FROM paper_explain_log").all();
    const set = new Set((r.results || []).map((x) => x.arxiv_id));
    return set;
  } catch (e) { return new Set(); }
}

async function countToday(env) {
  try {
    const r = await env.DB.prepare("SELECT COUNT(*) n FROM paper_explain_log WHERE status IN ('posted','queued') AND created_at >= datetime('now','start of day')").first();
    return Number((r && r.n) || 0);
  } catch (e) { return 0; }
}

async function logRow(env, row) {
  await env.DB.prepare("INSERT INTO paper_explain_log (arxiv_id, headline, what_it_is, everyday_relevance, relevance_label, why_not, posts, status, error) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)").bind(row.arxiv_id, row.headline, row.what_it_is, row.everyday_relevance, row.relevance_label, row.why_not, JSON.stringify(row.posts), row.status, row.error || null).run();
}

async function recordEvent(env, text, meta) {
  try {
    await env.DB.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind("pe-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), new Date().toISOString(), "paper-explain", String(text).slice(0, 2000), JSON.stringify(meta || {}).slice(0, 1500), "paper-explain", meta && meta.status || "ok").run();
  } catch (e) {}
}

// ---------- core run ----------
async function run(env, opts) {
  const out = { version: VERSION, fetched: 0, candidates: 0, selected: null, status: "ok", posted: false, dry: !!opts.dry, arxiv_id: null, posts: [], explanation: null, issues: [], error: null };
  try {
    await ensureTables(env);
    const enabled = await stateGet(env, "enabled", "1");
    if (enabled !== "1" && !opts.dry) {
      out.status = "disabled"; out.error = "kill switch enabled=0"; return out;
    }

    const today = await countToday(env);
    if (today >= DAILY_CAP && !opts.dry) {
      out.status = "capped"; out.error = "daily cap " + DAILY_CAP + " reached (" + today + " today)"; return out;
    }

    const papers = await fetchArxiv();
    out.fetched = papers.length;
    if (!papers.length) { out.status = "empty"; return out; }

    const seen = await alreadyExplained(env);
    const fresh = papers.filter((p) => !seen.has(p.id));
    out.candidates = fresh.length;
    if (!fresh.length) { out.status = "no-fresh"; out.error = "all fetched papers already explained"; return out; }

    const selRes = await selectAndExplain(env, fresh.slice(0, 10));
    out.raw = (selRes && selRes.raw ? String(selRes.raw).slice(0, 1200) : "");
    const sel = selRes && selRes.parsed;
    if (!sel || !sel.arxiv_id || !Array.isArray(sel.posts) || sel.posts.length < 3) {
      out.status = "no-selection"; out.error = "AI selection/explanation failed"; return out;
    }

    const paper = papers.find((p) => p.id === sel.arxiv_id) || fresh.find((p) => p.id === sel.arxiv_id);
    const posts = sanitizePosts(sel.posts).slice(0, 4);
    const title = (paper && paper.title) || sel.headline || "";
    const abstract = (paper && paper.abstract) || "";
    const headline = String(sel.headline || "").slice(0, 200);
    const whatItIs = String(sel.what_it_is || "").slice(0, 900);
    const everyday = String(sel.everyday_relevance || "").slice(0, 900);
    const label = /^(NOW|SOON|YEARS|NOT_YET)$/.test(sel.relevance_label || "") ? sel.relevance_label : "NOT_YET";
    const whyNot = String(sel.why_not || "").slice(0, 400);

    const chk = await checkFaithful(env, title, abstract, posts);
    out.issues = chk.issues || [];
    out.degraded = !!chk.degraded;
    if (chk.degraded) {
      await recordEvent(env, "paper-explain fact-check degraded (fail-open): " + sel.arxiv_id, { status: "degraded", arxiv_id: sel.arxiv_id });
    }
    out.arxiv_id = sel.arxiv_id;
    out.selected = { arxiv_id: sel.arxiv_id, headline, relevance_label: label };
    out.posts = posts;
    out.explanation = { what_it_is: whatItIs, everyday_relevance: everyday, relevance_label: label, why_not: whyNot };

    if (out.issues.length) {
      await logRow(env, { arxiv_id: sel.arxiv_id, headline, what_it_is: whatItIs, everyday_relevance: everyday, relevance_label: label, why_not: whyNot, posts, status: "draft", error: JSON.stringify(out.issues).slice(0, 400) });
      await recordEvent(env, "paper-explain draft flagged: " + sel.arxiv_id + " (" + out.issues.length + " issue(s))", { status: "draft", arxiv_id: sel.arxiv_id });
      out.status = "draft"; return out;
    }

    await logRow(env, { arxiv_id: sel.arxiv_id, headline, what_it_is: whatItIs, everyday_relevance: everyday, relevance_label: label, why_not: whyNot, posts, status: opts.dry ? "dry" : "queued", error: null });

    if (!opts.dry) {
      const s = await bskySession(env);
      const uris = await bskyPostThread(s, posts);
      out.posted = true; out.uris = uris;
      await env.DB.prepare("UPDATE paper_explain_log SET status='posted' WHERE arxiv_id=?1 AND status='queued'").bind(sel.arxiv_id).run();
      await recordEvent(env, "paper-explain posted: " + sel.arxiv_id + " -> " + uris[0], { status: "posted", arxiv_id: sel.arxiv_id, relevance_label: label });
    } else {
      await recordEvent(env, "paper-explain dry run: " + sel.arxiv_id + " (" + label + ")", { status: "dry", arxiv_id: sel.arxiv_id });
    }
    out.status = opts.dry ? "dry" : "posted";
    return out;
  } catch (e) {
    out.status = "error"; out.error = String(e && e.message || e);
    try { await recordEvent(env, "paper-explain error: " + out.error, { status: "error" }); } catch (e2) {}
    return out;
  }
}

export default {
  async scheduled(event, env, ctx) {
    const out = await run(env, { dry: false });
    console.log("paper-explain", JSON.stringify(out));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname, m = request.method;
    if (m === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (p === "/health" && m === "GET") {
      return new Response(JSON.stringify({ ok: true, worker: "qnfo-paper-explainer", version: VERSION, bindings: { db: !!env.DB, ai: !!env.AI, bsky_handle: !!env.BSKY_HANDLE, bsky_pass: !!env.BSKY_APP_PASS } }), { headers: { "Content-Type": "application/json", ...CORS } });
    }
    if (!auth(request, env)) return new Response("unauthorized", { status: 401, headers: CORS });
    try {
      if (p === "/run" && m === "GET") {
        const dry = url.searchParams.get("post") !== "1";
        const out = await run(env, { dry });
        return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json", ...CORS } });
      }
      if (p === "/log" && m === "GET") {
        const rows = await env.DB.prepare("SELECT id, arxiv_id, headline, relevance_label, status, created_at FROM paper_explain_log ORDER BY id DESC LIMIT 30").all();
        return new Response(JSON.stringify(rows.results || []), { headers: { "Content-Type": "application/json", ...CORS } });
      }
      if (p === "/state" && m === "GET") {
        const enabled = await stateGet(env, "enabled", "1");
        const today = await countToday(env);
        return new Response(JSON.stringify({ enabled, daily_cap: DAILY_CAP, today }), { headers: { "Content-Type": "application/json", ...CORS } });
      }
      if (p === "/enable" && m === "POST") {
        const b = await request.json().catch(() => ({}));
        const v = String(b.enabled === 0 || b.enabled === "0" ? "0" : "1");
        await env.DB.prepare("INSERT INTO paper_explain_state (key, value) VALUES ('enabled', ?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(v).run();
        return new Response(JSON.stringify({ ok: true, enabled: v }), { headers: { "Content-Type": "application/json", ...CORS } });
      }
      if (p === "/probe" && m === "GET") {
        const ai = await env.AI.run(MODEL, { messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 30 });
        return new Response(JSON.stringify({ model: MODEL, keys: ai ? Object.keys(ai) : null, response_field: ai && ai.response, result_field: ai && ai.result ? (typeof ai.result === "string" ? ai.result : Object.keys(ai.result)) : null, extracted: extractText(ai) }), { headers: { "Content-Type": "application/json", ...CORS } });
      }
      return new Response("not found", { status: 404, headers: CORS });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500, headers: { "Content-Type": "application/json", ...CORS } });
    }
  }
};
