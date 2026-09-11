var m0 = (function(){
var ideafactoryMod = (function(){
const QNFO_VERSION = "qnfo-idea-factory/fabric-20260910";
var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(raw || cooked.slice()) }));

// worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var SUGGEST_DENY = [
  "check my email",
  "check email",
  "check the inbox",
  "read my email",
  "read my inbox",
  "my inbox",
  "any new email",
  "send an email",
  "send email",
  "draft an email",
  "reply to",
  "outlook",
  "gmail",
  "mailbox",
  "inbox",
  "calendar",
  "appointment",
  "meeting today",
  "my tasks",
  "add a task",
  "remind me",
  "set a reminder",
  "reminder",
  "to-do",
  "post to bluesky",
  "post this",
  "to bluesky",
  "tweet",
  "social media",
  "linkedin",
  "whatsapp",
  "who should i contact",
  "reach out to",
  "suggest contacts",
  "contact me",
  "daily brief",
  "the fleet",
  "infra status",
  "cloudflare",
  "d1 database",
  "r2 bucket",
  "backup",
  "obsidian",
  "vault",
  "cron",
  "secret",
  "deploy",
  "wrangler",
  "worker status",
  "what's the tl;dr",
  "this would be good for a research paper"
];
var DENY_WORDS = [
  "email",
  "inbox",
  "mailbox",
  "gmail",
  "outlook",
  "calendar",
  "appointment",
  "bluesky",
  "tweet",
  "whatsapp",
  "remind",
  "reminder",
  "meeting",
  "contact",
  "notifications",
  "to-do",
  "task "
];
function suggestDomainSafe(t) {
  const s = String(t || "").toLowerCase();
  if (!s) return false;
  if (s.length < 12 || s.length > 130) return false;
  if (/[\n\r]/.test(s)) return false;
  for (let i = 0; i < SUGGEST_DENY.length; i++) if (s.indexOf(SUGGEST_DENY[i]) !== -1) return false;
  for (let i = 0; i < DENY_WORDS.length; i++) {
    const re = new RegExp("(^|[^a-z0-9])" + DENY_WORDS[i] + "($|[^a-z0-9])");
    if (re.test(s)) return false;
  }
  if (/^(what time|what day|what is the time|write a|write code|implement a|run |execute |check |read |send |reply |post |remind )/.test(s)) return false;
  return true;
}
__name(suggestDomainSafe, "suggestDomainSafe");
var FRONTIER_STARTERS = [
  "What is the Landauer floor for cryogenic quantum controllers?",
  "Can joules-per-compute benchmarking stay fair across very different architectures?",
  "Where does the Margolus-Levitin bound bind for a 1,000-logical-qubit surface code?",
  "Is energy per logical qubit the right normalization for quantum advantage claims?",
  "What would falsify p-adic valuations as a model of physical measurement?",
  "How do ultrametric geometries constrain what a discrete spacetime can compute?",
  "Can Laws-of-Form calculus be grounded in a measurable quantum process?",
  "Which thermodynamic constraints separate computation from physical evolution?",
  "Is wall-clock latency a more honest quantum metric than qubit count?",
  "What experiment would distinguish resonance computing from classical coupling?",
  "How should open-science audits handle papers that overclaim quantum advantage?",
  "What does the cmb higher-n point-function literature imply for early-universe models?",
  "When does a strange-loop architecture become a testable physical claim?",
  "What is the smallest honest demonstration of topological quantum computation?",
  "Can an LLM energy audit reach chip-benchmark rigor?",
  "Which condensed-matter systems give the most honest error-correction energy budget?"
];
function frontierPick(n) {
  const day = Math.floor(Date.now() / 864e5);
  const out = [];
  for (let k = 0; k < n && k < FRONTIER_STARTERS.length; k++) out.push(FRONTIER_STARTERS[(day + k * 5) % FRONTIER_STARTERS.length]);
  return out;
}
__name(frontierPick, "frontierPick");
async function handleSuggest(url, env) {
  const q = (url.searchParams.get("q") || "").trim().slice(0, 120);
  const ql = q.toLowerCase();
  let live = [];
  try {
    live = await liveThreads(env);
  } catch (e) {
    live = [];
  }
  const recency = /* @__PURE__ */ __name((s) => {
    const ms = Date.parse(s.updated_at || s.created_at || "");
    return Number.isFinite(ms) ? ms : 0;
  }, "recency");
  const dom = (live || []).filter((s) => suggestDomainSafe(s.title));
  dom.sort((a, b) => {
    const sa = Math.min(Number(a.message_count) || 0, 30) - Math.max(0, (Date.now() - recency(a)) / 864e5) * 0.35;
    const sb = Math.min(Number(b.message_count) || 0, 30) - Math.max(0, (Date.now() - recency(b)) / 864e5) * 0.35;
    return sb - sa;
  });
  const dedupe = /* @__PURE__ */ __name((arr) => {
    const seen = {};
    const out = [];
    for (const it of arr) {
      const k = String(it.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!k || seen[k]) continue;
      seen[k] = 1;
      out.push(it);
    }
    return out;
  }, "dedupe");
  const recent = dedupe(dom).slice(0, 20);
  const toItem = /* @__PURE__ */ __name((s) => ({ title: String(s.title || "").slice(0, 120), source: "recent", thread: s.id || null }), "toItem");
  const groups = [];
  const qIsOps = ql.length >= 2 && (SUGGEST_DENY.some((p) => ql.indexOf(p) >= 0) || DENY_WORDS.some((w) => {
    try {
      return new RegExp("(^|[^a-z0-9])" + w + "($|[^a-z0-9])").test(ql);
    } catch (e) {
      return false;
    }
  }));
  if (ql.length >= 2 && !qIsOps) {
    const matched = dedupe(recent.filter((s) => s.title.toLowerCase().indexOf(ql) >= 0).slice(0, 6).map(toItem));
    const fm = FRONTIER_STARTERS.filter((t) => t.toLowerCase().indexOf(ql) >= 0).slice(0, 2).map((t) => ({ title: t, source: "frontier" }));
    let cm = [];
    try {
      const ids = await searchThreadIds(env, q);
      const seenTitles = {};
      matched.concat(fm).forEach((m) => {
        seenTitles[String(m.title).toLowerCase()] = 1;
      });
      cm = recent.filter((s) => ids[s.id] && !seenTitles[s.title.toLowerCase()]).slice(0, 3).map(toItem);
    } catch (e) {
      cm = [];
    }
    const items = matched.concat(fm, cm).slice(0, 6);
    if (items.length) groups.push({ id: "match", label: "Live suggestions for your question", items });
    groups.push({ id: "recent", label: "Recent research questions", items: recent.filter((s) => s.title.toLowerCase().indexOf(ql) < 0).slice(0, 4).map(toItem) });
    groups.push({ id: "frontier", label: "Frontier questions", items: frontierPick(3) });
  } else {
    groups.push({ id: "recent", label: "Recent research questions", items: recent.slice(0, 6).map(toItem) });
    groups.push({ id: "frontier", label: "Frontier questions", items: frontierPick(4) });
  }
  return json({ q, policy: "research-domain only; personal/ops actions are never suggested", groups });
}
__name(handleSuggest, "handleSuggest");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }
    try {
      if (path === "/health") return json({ status: "ok", worker: "qnfo-idea-factory", version: "2.7.3", bindings: { d1: !!env.QNFO_AUDIT } });
      if (path === "/robots.txt") return new Response("User-agent: *\nAllow: /\n", { headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=86400" } });
      if (path === "/rss.xml") return handleRss(env);
      if (path === "/embed") return serveEmbed();
      if (path === "/api/sessions") return handleSessions(url, env);
      if (path.startsWith("/api/session/")) return handleSession(path, env);
      if (path === "/api/feed") return handleFeed(url, env);
      if (path === "/api/ask" && request.method === "POST") return handleAsk(url, request, env);
      if (path === "/api/suggest" && request.method === "GET") return handleSuggest(url, env);
      if (path === "/api/proposals" && request.method === "POST") return handleProposalPost(request, env);
      if (path === "/api/proposals" && request.method === "GET") return handleProposalList(request, env);
      if (path === "/") return serveUI();
      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: "Server error: " + e.message }, 500);
    }
  }
};
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
__name(cors, "cors");
__name2(cors, "cors");
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, cors())
  });
}
__name(json, "json");
__name2(json, "json");
var REDACT = "[redacted]";
function redact(s) {
  if (!s) return s;
  let t = String(s);
  const protectedParts = [];
  t = t.replace(/(https?:\/\/[^\s"'<>()]+)/g, (m) => {
    protectedParts.push(m);
    return "\0P" + (protectedParts.length - 1) + "\0";
  });
  t = t.replace(/(10\.\d{4,9}\/\S+)/g, (m) => {
    protectedParts.push(m);
    return "\0P" + (protectedParts.length - 1) + "\0";
  });
  t = t.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, REDACT);
  t = t.replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer " + REDACT);
  t = t.replace(/(\b(?:api[_-]?key|secret|password|passwd|authorization|auth[_-]?token|access[_-]?token|refresh[_-]?token|zenodo[_-]?token|cf[_-]?token|github[_-]?token)\b\s*[:=]\s*["']?)[A-Za-z0-9._~+/-]{8,}/gi, "$1" + REDACT);
  t = t.replace(/\b(?:wWbJ|AoG|cf-api|glpat|ghp_|xox[baprs]-)[A-Za-z0-9_-]{6,}/g, REDACT);
  t = t.replace(/\b[0-9a-fA-F]{32,}\b/g, REDACT);
  t = t.replace(/\b[A-Za-z]:\\[^\s"'<>|]*/g, REDACT);
  t = t.replace(/\/(?:c|d|e|f|g)\/Users\/[^\s"'<>|]*/gi, REDACT);
  t = t.replace(/%[A-Za-z]+%/g, REDACT);
  t = t.replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, REDACT);
  t = t.replace(/\+\d{1,3}[\d\s()-]{7,}\b/g, REDACT);
  t = t.replace(/\b(?:session|thread|run|task|delegation|bg_|th_)[A-Za-z0-9_-]{10,}\b/gi, (m) => m.split(/[:_-]/)[0] + ":" + REDACT);
  t = t.replace(/\b[A-Za-z0-9_-]{24,}\b/g, REDACT);
  t = t.replace(/\u0000P(\d+)\u0000/g, (_, i) => protectedParts[Number(i)] || "");
  return t;
}
__name(redact, "redact");
__name2(redact, "redact");
function normLabel(s) {
  if (typeof s !== "string") return s;
  return s.replace(/^(?:User message|Assistant message|System message|User|Assistant|Human|AI|System)\s*:\s*(?:\r?\n)+/i, "").replace(/^\r?\n+/, "");
}
__name(normLabel, "normLabel");
__name2(normLabel, "normLabel");
function collapseThreads(items) {
  var map = {}, order = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var key = (it.title || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
    if (!key || key === "test" || key === "hi" || key === "hello" || key === ".") continue;
    if (!(key in map)) {
      map[key] = it;
      order.push(key);
    } else if ((it.message_count || 0) > (map[key].message_count || 0)) {
      map[key] = it;
    }
  }
  return order.map(function(k) {
    return map[k];
  });
}
__name(collapseThreads, "collapseThreads");
__name2(collapseThreads, "collapseThreads");
var INTERNAL_MARKERS = [
  "INTENT_TOKEN",
  "rotation verification",
  "intent orchestrator accepts",
  "You decide how a newly extracted memory",
  "You synthesize a few durable",
  "memory relates to what is already known",
  "accepted the rotated",
  "web-search find email",
  "email received from",
  "email sync",
  "calendar event",
  "read-only context data",
  "the following sections are read-only",
  "strategy locked",
  "dedup-probe",
  "parity-probe",
  "filter-probe",
  "fix-ok",
  "fil-ok",
  "verify-5.8.0",
  "express desire",
  "intent-orchestrator",
  "auto-express note",
  "qnfo-ops.007",
  "mandate-chain",
  "object object"
];
function isInternalThread(title) {
  const t = String(title || "").toLowerCase();
  return INTERNAL_MARKERS.some((m) => t.indexOf(m.toLowerCase()) >= 0);
}
__name(isInternalThread, "isInternalThread");
__name2(isInternalThread, "isInternalThread");
var JUNK_MARKERS = ["say ok", "say okay", "test", "testing", "first turn", "second turn", "third turn", "auto-express", "block the response", "opening turn", "capital of", "what is the capital", "who is", "who are you", "what is your name", "tell me a joke", "write a poem", "write me a", "make me a", "create me", "explain simply", "explain everything", "explain like i", "3 sentences", "5 years old", "five years old", "good morning", "good night", "thank you", "thanks", "you're welcome", "are you sure", "can you", "please", "what can you tell me about", "what do you know about", "what is love", "the meaning of life", "continue", "repeat", "again", "this sucks", "terrible response", "needs remediation", "what time is it", "what time", "write a python", "write code", "implement a", "based on the chat history", "give this conversation a name", "reply with exactly", "reply with the single word ok", "list every event on the qnfo calendar", "qnfo calendar", "guard-probe", "probe-", "rotation verification", "you decide how a newly extracted memory", "you synthesize a few durable", "probe does", "probe: does", "does auto-express", "what is the capital of", "say the word", "just say", "use your ", "call the ", "express_intent", "social_compose", "email_check", "search_research", "tool with action", "say hello", "hello world", "what is 2+2", "reply with the single word", "source detection", "gateway passed", "note these as fixes", "note for remediation", "mismatch-probe", "reasoning-leak", "filter-probe", "verify-5.8.0", "say the word", "nebul", "fil-ok", "fix-ok", "guard-probe", "what should i do today", "be more productive", "personally and professionally", "productivity", "daily planning", "life advice"];
function isJunkThread(title) {
  const raw = String(title || "").trim();
  if (!raw) return true;
  if (raw.length < 12) return true;
  const t = raw.toLowerCase();
  return JUNK_MARKERS.some((m) => t.indexOf(m) >= 0);
}
__name(isJunkThread, "isJunkThread");
__name2(isJunkThread, "isJunkThread");
function isSystemContent(c) {
  const sc = String(c || "").trim();
  if (!sc) return true;
  if (sc[0] === "{" && /^\{\s*"type"\s*:/.test(sc)) return true;
  if (sc.indexOf("data: ") === 0) return true;
  if (/^1\.\s*\*\*Analyze/i.test(sc)) return true;
  if (/^Okay, the user is asking/i.test(sc) || /^The user is asking/i.test(sc) || /^Let me understand/i.test(sc)) return true;
  return false;
}
__name(isSystemContent, "isSystemContent");
__name2(isSystemContent, "isSystemContent");
async function liveThreads(env) {
  try {
    const res = await env.QNFO_AUDIT.prepare(
      "SELECT c.thread AS id, COUNT(*) AS n, MIN(c.ts) AS first_ts, MAX(c.ts) AS last_ts, (SELECT content FROM chat c2 WHERE c2.thread = c.thread AND c2.role = 'user' ORDER BY c2.ts ASC, c2.id ASC LIMIT 1) AS title, (SELECT model FROM chat c2 WHERE c2.thread = c.thread ORDER BY c2.ts DESC LIMIT 1) AS model, (SELECT COUNT(*) FROM chatbox_conversations cc WHERE cc.thread_id = c.thread AND cc.source IN ('chatbox','deepchat')) AS human_n, (SELECT COUNT(*) FROM chatbox_conversations cc WHERE cc.thread_id = c.thread AND cc.source = 'other' AND cc.ua LIKE 'Mozilla/%') AS human_browser_n FROM chat c GROUP BY c.thread ORDER BY last_ts DESC LIMIT 200"
    ).all();
    const items = [];
    for (const t of res.results || []) {
      const firstTs = normTs(t.first_ts);
      const lastTs = normTs(t.last_ts);
      if (!firstTs && !lastTs) continue;
      const rawTitle = String(t.title || "(untitled)");
      if (isInternalThread(rawTitle)) continue;
      if (isJunkThread(rawTitle)) continue;
      const humanN = Number(t.human_n) || 0;
      const browserN = Number(t.human_browser_n) || 0;
      const msgN = Number(t.n) || 0;
      if (humanN <= 0 && browserN <= 0 && msgN < 2) continue;
      items.push({
        id: t.id,
        kind: "thread",
        source: "live",
        title: redact(normLabel(String(t.title || "(untitled)")).slice(0, 200)),
        created_at: firstTs || lastTs,
        updated_at: lastTs || firstTs,
        message_count: Number(t.n) || 0,
        model: t.model || null,
        tags: ["conversation", "live"]
      });
    }
    return items;
  } catch (e) {
    return [];
  }
}
__name(liveThreads, "liveThreads");
__name2(liveThreads, "liveThreads");
async function archiveThreads(env) {
  try {
    const res = await env.QNFO_AUDIT.prepare(
      "SELECT thread_id, title, messages, created_at, updated_at FROM chat_sessions WHERE category = 'research' ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 300"
    ).all();
    const items = [];
    for (const t of res.results || []) {
      let messages = [];
      try {
        messages = JSON.parse(t.messages || "[]");
      } catch (e) {
        messages = [];
      }
      if (!Array.isArray(messages) || messages.length === 0) continue;
      const userMsg = messages.find((m) => m && m.role === "user");
      items.push({
        id: t.thread_id,
        kind: "thread",
        source: "archive",
        title: redact((t.title || userMsg && userMsg.content || t.thread_id).slice(0, 200)),
        created_at: normTs(t.updated_at || t.created_at),
        updated_at: normTs(t.updated_at || t.created_at),
        message_count: messages.length,
        model: t.model_id || null,
        tags: ["conversation", "archive"]
      });
    }
    return items;
  } catch (e) {
    return [];
  }
}
__name(archiveThreads, "archiveThreads");
__name2(archiveThreads, "archiveThreads");
async function allThreads(env) {
  const live = await liveThreads(env);
  live.sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
  return live;
}
__name(allThreads, "allThreads");
__name2(allThreads, "allThreads");
async function searchThreadIds(env, q) {
  const like = "%" + q + "%";
  const ids = {};
  try {
    const live = await env.QNFO_AUDIT.prepare("SELECT DISTINCT thread AS id FROM chat WHERE content LIKE ? LIMIT 300").bind(like).all();
    (live.results || []).forEach((r) => {
      ids[r.id] = 1;
    });
  } catch (e) {
  }
  return ids;
}
__name(searchThreadIds, "searchThreadIds");
__name2(searchThreadIds, "searchThreadIds");
async function handleSessions(url, env) {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  let all = await allThreads(env);
  if (q) {
    const ids = await searchThreadIds(env, q);
    all = all.filter((s) => ids[s.id]);
  }
  const page = all.slice(offset, offset + limit);
  return json({
    count: all.length,
    limit,
    offset,
    sessions: page.map((s) => ({ id: s.id, kind: s.kind, source: s.source, title: s.title, created_at: s.created_at, message_count: s.message_count, model: s.model, tags: s.tags }))
  });
}
__name(handleSessions, "handleSessions");
__name2(handleSessions, "handleSessions");
async function handleSession(path, env) {
  const id = decodeURIComponent(path.split("/").slice(3).join("/"));
  if (!id) return json({ error: "Missing id" }, 400);
  const chatRes = await env.QNFO_AUDIT.prepare(
    "SELECT ts, role, content, model FROM chat WHERE thread = ? ORDER BY ts ASC, CASE WHEN role = 'user' THEN 0 ELSE 1 END, id ASC LIMIT 500"
  ).bind(id).all();
  const chatRows = chatRes.results || [];
  if (chatRows.length) {
    const firstUser = chatRows.find((m) => m && m.role === "user");
    if (isInternalThread(firstUser && firstUser.content || "")) return json({ error: "Session not found or not public" }, 404);
    if (isJunkThread(firstUser && firstUser.content || "")) return json({ error: "Session not found or not public" }, 404);
    const messages = chatRows.filter((m) => !(m.role === "assistant" && isSystemContent(m.content))).map((m) => ({
      role: m.role || "unknown",
      content: redact(String(m.content || "").slice(0, 2e5)),
      timestamp: normTs(m.ts),
      model: m.model || null
    }));
    return json({
      id,
      kind: "thread",
      source: "live",
      title: redact(String(firstUser && firstUser.content || "(untitled)").slice(0, 500)),
      model: chatRows[chatRows.length - 1].model || null,
      created_at: normTs(chatRows[0].ts),
      updated_at: normTs(chatRows[chatRows.length - 1].ts),
      message_count: messages.length,
      messages
    });
  }
  return json({ error: "Session not found or not public" }, 404);
}
__name(handleSession, "handleSession");
__name2(handleSession, "handleSession");
async function handleFeed(url, env) {
  const afterParam = url.searchParams.get("after");
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "30", 10), 1), 100);
  let afterMs = 0;
  if (afterParam) {
    const n = Number(afterParam);
    afterMs = Number.isFinite(n) && n > 1e12 ? n : Date.parse(afterParam) || 0;
  }
  const now = Date.now();
  let all = await allThreads(env);
  const items = all.filter((s) => {
    const ms = Date.parse(s.updated_at || s.created_at || "");
    return Number.isFinite(ms) && ms > afterMs;
  }).slice(0, limit);
  const collapsed = collapseThreads(items);
  return json({ after: now, count: collapsed.length, sessions: collapsed });
}
__name(handleFeed, "handleFeed");
__name2(handleFeed, "handleFeed");
function normTs(v) {
  if (!v) return null;
  if (typeof v === "number") return new Date(v).toISOString();
  let s = String(v).replace(" ", "T");
  if (!/Z$|[+-]\d\d:\d\d$/.test(s)) s += "Z";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}
__name(normTs, "normTs");
__name2(normTs, "normTs");
async function handleAsk(url, request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    body = {};
  }
  const query = String(body.query || "").trim().slice(0, 500);
  if (!query) return json({ error: "Missing query" }, 400);
  try {
    const [qwavResp, threadRes] = await Promise.all([
      fetch("https://qnfo-qwav.q08.workers.dev/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "qnfo-idea-factory/2.0" },
        body: JSON.stringify({ query })
      }).then((r) => r.json()).catch(() => ({ error: "ask backend unreachable" })),
      relatedThreads(query, env)
    ]);
    const threads = [];
    for (const t of threadRes || []) {
      threads.push({
        id: t.id,
        title: t.title,
        created_at: t.created_at,
        message_count: t.message_count
      });
    }
    return json({
      query,
      answer: qwavResp.answer || null,
      sources: (qwavResp.sources || []).slice(0, 6).map((s) => ({ file: redact(s.file || ""), slug: s.slug, score: s.score })),
      model: qwavResp.model || null,
      backend_error: qwavResp.error || null,
      threads
    });
  } catch (e) {
    return json({ error: "Ask failed: " + e.message }, 502);
  }
}
__name(handleAsk, "handleAsk");
__name2(handleAsk, "handleAsk");
async function relatedThreads(query, env, limit = 6) {
  const terms = String(query || "").toLowerCase().replace(/[^a-z0-9+\- ]+/g, " ").split(/\s+/).filter((t) => t.length >= 3).slice(0, 8);
  if (!terms.length) return [];
  const hay = {};
  const meta = {};
  try {
    const chatRes = await env.QNFO_AUDIT.prepare("SELECT thread, role, content, ts FROM chat ORDER BY ts ASC").all();
    for (const r of chatRes.results || []) {
      if (!meta[r.thread]) meta[r.thread] = { title: "", n: 0, first_ts: r.ts, last_ts: r.ts };
      meta[r.thread].n++;
      if (r.ts < meta[r.thread].first_ts) meta[r.thread].first_ts = r.ts;
      if (r.ts > meta[r.thread].last_ts) meta[r.thread].last_ts = r.ts;
      if (!hay[r.thread]) hay[r.thread] = "";
      hay[r.thread] += " " + String(r.content || "");
      if (r.role === "user" && !meta[r.thread].title) meta[r.thread].title = String(r.content || "").slice(0, 200);
    }
  } catch (e) {
  }
  const scored = [];
  for (const id of Object.keys(hay)) {
    const lowerHay = hay[id].toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (lowerHay.includes(term)) score++;
    }
    if (terms.length <= 3 ? score >= 1 : score >= 2) {
      const m = meta[id] || {};
      scored.push({ id, title: redact(String(m.title || id).slice(0, 200)), created_at: normTs(m.last_ts), message_count: m.n || 0, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || (b.created_at || "").localeCompare(a.created_at || ""));
  return scored.slice(0, limit);
}
__name(relatedThreads, "relatedThreads");
__name2(relatedThreads, "relatedThreads");
async function handleProposalPost(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    body = {};
  }
  if (String(body.website || "").trim()) return json({ ok: true, status: "submitted" }, 200);
  const idea = String(body.idea || "").trim().slice(0, 2e3);
  if (idea.length < 20) return json({ error: "Please share a bit more (at least 20 characters)." }, 400);
  const name = String(body.name || "").trim().slice(0, 100);
  const contact = String(body.contact || "").trim().slice(0, 200);
  const cf = request.headers.get("CF-Connecting-IP") || "";
  const ipHash = await sha256(cf).catch(() => "");
  const hourAgo = new Date(Date.now() - 3600 * 1e3).toISOString();
  const recent = await env.QNFO_AUDIT.prepare(
    "SELECT COUNT(*) AS n FROM idea_proposals WHERE ip_hash = ? AND created_at > ?"
  ).bind(ipHash, hourAgo).first();
  if ((recent && recent.n || 0) >= 3) return json({ error: "Please wait a bit before submitting again." }, 429);
  const res = await env.QNFO_AUDIT.prepare(
    "INSERT INTO idea_proposals (name, idea, contact, status, ip_hash, created_at) VALUES (?, ?, ?, 'new', ?, ?)"
  ).bind(name, idea, contact, ipHash, (/* @__PURE__ */ new Date()).toISOString()).run();
  return json({ ok: true, status: "submitted", id: res.meta.last_row_id });
}
__name(handleProposalPost, "handleProposalPost");
__name2(handleProposalPost, "handleProposalPost");
async function handleProposalList(request, env) {
  const auth = request.headers.get("X-Sync-Token");
  if (!auth || auth !== (env.SYNC_TOKEN || "")) return json({ error: "Unauthorized" }, 401);
  const res = await env.QNFO_AUDIT.prepare(
    "SELECT id, name, idea, contact, status, created_at FROM idea_proposals ORDER BY created_at DESC LIMIT 100"
  ).all();
  return json({ count: res.results.length, proposals: res.results });
}
__name(handleProposalList, "handleProposalList");
__name2(handleProposalList, "handleProposalList");
async function sha256(s) {
  const data = new TextEncoder().encode(String(s));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
__name2(sha256, "sha256");
var _a;
var UI_HTML = String.raw(_a || (_a = __template([`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QNFO Ideas</title>
<meta name="description" content="A public, read-only window into the QNFO research conversations \u2014 live from the QNFO AI worker chat log.">
<meta property="og:title" content="QNFO Ideas">
<meta property="og:description" content="Public read-only window into QNFO research conversations \u2014 live from the QNFO AI worker.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://ideas.qnfo.org">
<link rel="canonical" href="https://ideas.qnfo.org">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2324315e'/%3E%3Ctext x='16' y='23' text-anchor='middle' font-size='17' fill='%23faf7f2' font-family='Georgia,serif'%3EQ%3C/text%3E%3C/svg%3E">
<script>window.MathJax={tex:{inlineMath:[['$','$'],['\\(','\\)']],displayMath:[['$$','$$'],['\\[','\\]']],processEscapes:true},options:{skipHtmlTags:['script','noscript','style','textarea','pre','code'],enableMenu:false}};<\/script>
<script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js" onerror="this.onerror=null;var s=document.createElement('script');s.src='https://unpkg.com/mathjax@3/es5/tex-svg.js';document.head.appendChild(s);"><\/script>
<style>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Public+Sans:wght@400;500;600&display=swap');
:root{--paper:#faf7f2;--surface:#f2eee6;--ink:#1b1915;--muted:#8a8376;--border:#e2dcd0;--accent:#24315e;--accent-soft:#eceef6;--live:#2f6d4f;--arch:#8a8376}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font-family:'Public Sans',system-ui,sans-serif;background:var(--paper);color:var(--ink);line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.top{display:flex;align-items:baseline;gap:1.5rem;padding:1.4rem 1.6rem 1rem;max-width:880px;margin:0 auto;border-bottom:1px solid var(--border)}
.brand{font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:1.35rem;letter-spacing:-.01em;color:var(--ink)}
.brand em{font-style:italic;color:var(--accent)}
.top nav{margin-left:auto;display:flex;gap:1.1rem}
.top nav a{font-size:.82rem;font-weight:500;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);padding:.2rem 0;border-bottom:2px solid transparent}
.top nav a:hover{color:var(--ink);text-decoration:none}
.top nav a.on{color:var(--ink);border-bottom-color:var(--accent)}
.live-dot{margin-left:.25rem;font-size:.7rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--live)}
main{max-width:880px;margin:0 auto;padding:2.2rem 1.6rem 4rem}
.page{max-width:720px;margin:0 auto}
.lede{color:var(--muted);font-size:.95rem;margin:0 0 1.8rem;max-width:56ch}
.toolbar{display:flex;align-items:center;gap:1rem;margin-bottom:1.6rem}
#search{flex:1;font:inherit;font-size:1rem;padding:.55rem 0;border:none;border-bottom:1.5px solid var(--border);background:transparent;color:var(--ink);outline:none;border-radius:0}
#search:focus{border-bottom-color:var(--accent)}
#search::placeholder{color:var(--muted)}
#count-label{font-size:.75rem;color:var(--muted);white-space:nowrap}
.list{display:flex;flex-direction:column}
.row{padding:1.05rem .2rem;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s}
.row:hover{background:var(--surface)}
.row-title{font-family:'Fraunces',Georgia,serif;font-weight:500;font-size:1.08rem;margin:0 0 .3rem;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.row-meta{font-size:.78rem;color:var(--muted);margin:0;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
.tag{font-size:.64rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:.12rem .45rem;border-radius:999px}
.tag.live{color:var(--live);background:#e7f0ea}
.tag.arch{color:var(--arch);background:#efede7}
.load-more{margin:1.6rem auto 0;display:block;font:inherit;font-size:.82rem;font-weight:500;color:var(--accent);background:transparent;border:1px solid var(--border);border-radius:999px;padding:.5rem 1.3rem;cursor:pointer;transition:all .12s}
.load-more:hover{border-color:var(--accent);background:var(--accent-soft)}
.empty,.loading,.err{padding:2.5rem 0;text-align:center;color:var(--muted)}
.back{display:inline-block;font-size:.8rem;color:var(--muted);margin-bottom:1.6rem;letter-spacing:.02em}
.back:hover{color:var(--accent)}
.detail-title{font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:1.75rem;margin:0 0 .5rem;line-height:1.3}
.detail-meta{font-size:.8rem;color:var(--muted);margin:0 0 2.2rem;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
.messages{display:flex;flex-direction:column;gap:1.4rem}
.msg{display:flex}
.msg.user{justify-content:flex-end}
.msg .bubble{max-width:78%;padding:.8rem 1rem;border-radius:10px;font-size:.94rem;line-height:1.7;white-space:pre-wrap;word-break:break-word;position:relative}
.msg.asst .bubble{max-width:100%;width:100%;background:var(--surface);border-left:2px solid var(--accent);border-radius:0;overflow-x:auto}
.msg.user .bubble{background:var(--ink);color:#f6f3ec;border-radius:10px 2px 10px 10px}
.msg .bubble pre{background:#26231d;color:#e8e2d6;padding:.6rem .8rem;border-radius:6px;overflow-x:auto;font-size:.8rem;white-space:pre-wrap}
.msg .bubble code{font-family:ui-monospace,Consolas,monospace;font-size:.86em}
.msg .meta{display:block;font-size:.68rem;color:var(--muted);margin-top:.45rem}
.msg.user .meta{color:rgba(246,243,236,.62);text-align:right}
.msg .bubble table,.ans table{border-collapse:collapse;width:100%;margin:.5rem 0 .9rem;font-size:.87rem;line-height:1.5}
.msg .bubble th,.msg .bubble td,.ans th,.ans td{border:1px solid var(--border);padding:.42rem .6rem;text-align:left;vertical-align:top}
.msg .bubble thead th,.ans thead th{background:var(--accent-soft);font-weight:600}
.msg .bubble tbody tr:nth-child(even),.ans tbody tr:nth-child(even){background:#fff}
.ask-row{display:flex;gap:.6rem;margin-bottom:.8rem}
#ask-input{flex:1;font:inherit;font-size:1.05rem;padding:.7rem .9rem;border:1.5px solid var(--border);border-radius:8px;background:#fff;color:var(--ink);outline:none}
#ask-input:focus{border-color:var(--accent)}
#ask-go{font:inherit;font-size:.9rem;font-weight:600;padding:.7rem 1.4rem;border:none;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer;transition:opacity .12s}
#ask-go:hover{opacity:.9}
#ask-go:disabled{opacity:.5;cursor:wait}
.chips{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1.4rem}
.chips button{font:inherit;font-size:.74rem;color:var(--muted);background:transparent;border:1px solid var(--border);border-radius:999px;padding:.28rem .7rem;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chips button:hover{color:var(--accent);border-color:var(--accent)}
.chips{row-gap:.35rem}.chips .grp{flex-basis:100%;font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-top:.2rem;user-select:none}
.ans{background:var(--surface);border-left:2px solid var(--accent);padding:1rem 1.2rem;border-radius:2px 10px 10px 2px;font-size:.95rem;line-height:1.75;white-space:pre-wrap;word-break:break-word;margin:0 0 1rem}
.srcs h4,.rel h4{font-size:.72rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:1.2rem 0 .5rem}
.src{padding:.45rem 0;border-bottom:1px solid var(--border);font-size:.85rem;margin:0;display:flex;justify-content:space-between;gap:.6rem}
.src a{color:var(--accent);font-weight:500}
.score{color:var(--muted);font-size:.75rem;white-space:nowrap}
.rel-link{display:block;padding:.55rem 0;border-bottom:1px solid var(--border);font-size:.88rem;color:var(--ink);font-weight:500}
.rel-link:hover{color:var(--accent);text-decoration:none}
#propose-page textarea{width:100%;min-height:130px;font:inherit;font-size:.98rem;padding:.8rem .9rem;border:1.5px solid var(--border);border-radius:8px;background:#fff;color:var(--ink);outline:none;resize:vertical;margin-bottom:.8rem}
#propose-page textarea:focus{border-color:var(--accent)}
.prop-fields{display:flex;gap:.6rem;margin-bottom:.9rem;flex-wrap:wrap}
.prop-fields input{flex:1;min-width:200px;font:inherit;font-size:.9rem;padding:.6rem .8rem;border:1.5px solid var(--border);border-radius:8px;background:#fff;color:var(--ink);outline:none}
.prop-fields input:focus{border-color:var(--accent)}
.hp{position:absolute;left:-9999px;opacity:0;height:0;width:0}
#prop-go{font:inherit;font-size:.9rem;font-weight:600;padding:.65rem 1.5rem;border:none;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer}
#prop-go:disabled{opacity:.5;cursor:wait}
#propose-status{font-size:.82rem;color:var(--muted);margin-top:.8rem}
.foot{max-width:880px;margin:0 auto;padding:1.4rem 1.6rem 2.4rem;border-top:1px solid var(--border);font-size:.74rem;color:var(--muted);display:flex;gap:1rem;align-items:center;flex-wrap:wrap}
@media(max-width:640px){.top{flex-wrap:wrap;gap:.8rem}.top nav{margin-left:0;width:100%;gap:1.4rem}.brand{width:100%}.msg .bubble{max-width:92%}.detail-title{font-size:1.45rem}}
</style>
</head>
<body>
<header class="top">
  <a class="brand" href="#/">QNFO <em>Ideas</em></a>
  <nav>
    <a href="#/" data-nav="feed">Conversations</a>
    <a href="#/ask" data-nav="ask">Ask</a>
    <a href="#/propose" data-nav="propose">Propose</a>
  </nav>
  <span class="live-dot" id="live-dot" hidden>&#9679; live</span>
</header>
<main id="view"></main>
<footer class="foot">
  <span>QNFO Ideas \u2014 a read-only window into the QNFO research conversations.</span>
  <a href="https://qnfo.org" target="_blank" rel="noopener">qnfo.org</a>
  <a href="/rss.xml">RSS</a>
</footer>
<script>
(function(){
var $=function(s){return document.querySelector(s);};
var view=$('#view');
var state={q:'',offset:0,limit:50,hasMore:false,lastAfter:Date.now(),sessions:[],selected:null,timer:null};
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fmtAgo(ts){
  if(!ts)return '';
  var d=new Date(ts);if(isNaN(d.getTime()))return '';
  var s=(Date.now()-d.getTime())/1000;
  if(s<60)return 'just now';
  if(s<3600)return Math.floor(s/60)+'m ago';
  if(s<86400)return Math.floor(s/3600)+'h ago';
  if(s<86400*7)return Math.floor(s/86400)+'d ago';
  return d.toLocaleDateString([],{month:'short',day:'numeric',year:d.getFullYear()===new Date().getFullYear()?undefined:'numeric'});
}
function fmtTs(ts){if(!ts)return '';var d=new Date(ts);if(isNaN(d.getTime()))return '';var now=new Date();return d.toDateString()===now.toDateString()?d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString([],{month:'short',day:'numeric'});}
function renderRich(s){
  var BK=String.fromCharCode(96);
  var A=String.fromCharCode(42);
  var raw=String(s||'').replace(/\r
/g,'
');
  var esc=function(x){return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
  var blocks=[];
  var fence=new RegExp(BK+BK+BK+'([\\s\\S]*?)'+BK+BK+BK,'g');
  raw=raw.replace(fence,function(m,code){
    var lang='';
    var lines=code.split('
');
    if(lines.length&&lines[0].trim()&&/^[A-Za-z0-9_+.-]+$/.test(lines[0].trim())){lang=lines[0].trim();code=lines.slice(1).join('
');}
    blocks.push('<pre><code'+(lang?' class="lang-'+esc(lang)+'"':'')+'>'+esc(code.replace(/
$/,''))+'</code></pre>');
    return ''+String(blocks.length-1)+'';
  });
  // Recover blank-line-collapsed markdown (producer stripped 

 -> space).
  // (1) Glued table header: split prose off BEFORE a header whose next line is a
  //     separator with matching column count (lookahead preserves the existing newline).
  raw=raw.replace(/([^
])[ 	]+(|[^
]*|)[ 	]*(?=
([ 	]*|?[s:|-]+|?[ 	]*
))/g,function(m,pre,hdr,sep){
    var nh=(hdr.split('|').filter(function(x){return x.trim()!=='';})).length;
    var ns=(sep.match(/-+/g)||[]).length;
    return (nh>0&&nh===ns)?(pre+'
'+hdr):m;
  });
  // (2) Horizontal rules glued to text: "text. --- ##" -> "text.
---
##".
  raw=raw.replace(/([^
])[ 	]+(---)[ 	]+(?=#{1,6}[ 	])/g,'$1
$2
');
  raw=raw.replace(/([^
])[ 	]+(---)[ 	]*(?=
)/g,'$1
$2
');
  // (3) Headings glued to preceding text.
  raw=raw.replace(/([^
])[ 	]+(#{1,6}[ 	])/g,'$1
$2');
  // (4) Blockquote glue: "text. > quote" -> "text.
> quote".
  raw=raw.replace(/([^
])[ 	]+(>[ 	]*S)/g,'$1
$2');
  var inline=function(x){
    var h=esc(x);
    var math=[];
    h=h.replace(/$$[sS]*?$$|$[^$
]*?$/g,function(m){math.push(m);return ''+String(math.length-1)+'';});
    h=h.replace(new RegExp(BK+'([^'+BK+']+)'+BK,'g'),function(m,c){return '<code>'+c+'</code>';});
    h=h.split(A+A).map(function(p,i){return i%2?'<strong>'+p+'</strong>':p;}).join('');
    h=h.split(A).map(function(p,i){return i%2?'<em>'+p+'</em>':p;}).join('');
    h=h.replace(/[([^]]+)]((https?:[^)s]+))/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
    h=h.replace(/(d+)/g,function(m,i){return math[+i]||'';});
    return h;
  };
  var lines=raw.split('
');
  var html=[],i,para=[],ul=0,ol=0,quote=0;
  function flush(){
    if(ul){html.push('</ul>');ul=0;}
    if(ol){html.push('</ol>');ol=0;}
    if(quote){html.push('</blockquote>');quote=0;}
    if(para.length){html.push('<p>'+para.map(inline).join('<br>')+'</p>');para=[];}
  }
  for(i=0;i<lines.length;i++){
    var line=lines[i];
    var t=line.trim();
    if(t===''){flush();continue;}
    if(/^d+$/.test(t)){flush();html.push(blocks[+t.slice(1,-1)]);continue;}
    var hm=t.match(/^(#{1,6})s+(.*)$/);
    if(hm){flush();var hh=hm[1].length;html.push('<h'+hh+'>'+inline(hm[2])+'</h'+hh+'>');continue;}
    if(/^(-{3,}|*{3,}|_{3,})$/.test(t)){flush();html.push('<hr>');continue;}
    var bq=t.match(/^>s?(.*)$/);
    if(bq){if(!quote){flush();html.push('<blockquote>');quote=1;}html.push(bq[1]);continue;}
    // Tolerant table parse: recover producer-collapsed blank lines and never swallow prose.
    // Table separator requires a real pipe row (a bare --- is an hr, not a table).
    if(t.indexOf('|')>=0&&lines[i+1]&&lines[i+1].indexOf('|')>=0&&/^s*|?[s:|-]+|?s*$/.test(lines[i+1])&&lines[i+1].indexOf('-')>=0){
      var sepCols=(lines[i+1].split('|').map(function(x){return x.trim();}).filter(function(x){return x!=='';})).length||1;
      var hdrCells=line.split('|').map(function(x){return x.trim();}).filter(function(x){return x!=='';});
      var prefixProse=null;
      // Glued header: prose ran onto the same line as the table header (blank line stripped).
      if(line.trim().charAt(0)!=='|'&&hdrCells.length>sepCols){
        var cut=line.indexOf('|');
        prefixProse=line.slice(0,cut).trim();
        hdrCells=hdrCells.slice(hdrCells.length-sepCols);
      } else if(hdrCells.length>sepCols){
        hdrCells=hdrCells.slice(0,sepCols);
      }
      var body=[];var tailProse=null;
      i+=2;
      while(i<lines.length&&lines[i].trim()!==''&&lines[i].indexOf('|')>=0){
        var rc=lines[i].split('|').map(function(x){return x.trim();}).filter(function(x){return x!=='';});
        // Row with trailing prose glued after the last cell: keep the row, carry the prose.
        if(rc.length>sepCols){
          var segs=lines[i].split('|');
          var used=0,cutIdx=segs.length-1;
          for(var k=0;k<segs.length;k++){if(segs[k].trim()!==''){used++;if(used===sepCols){cutIdx=k;break;}}}
          rc=segs.slice(0,cutIdx+1).map(function(x){return x.trim();}).filter(function(x){return x!=='';});
          tailProse=segs.slice(cutIdx+1).join('|').trim();
          body.push(rc);
          i++;
          break;
        }
        body.push(rc);
        i++;
      }
      flush();
      if(prefixProse&&prefixProse.length){para.push(prefixProse);flush();}
      if(hdrCells.length){
        var th='';hdrCells.forEach(function(c){th+='<th>'+inline(c)+'</th>';});
        var tb='';body.forEach(function(rw){if(rw.length){tb+='<tr>'+rw.map(function(c){return '<td>'+inline(c)+'</td>';}).join('')+'</tr>';}});
        html.push('<table><thead><tr>'+th+'</tr></thead><tbody>'+tb+'</tbody></table>');
      }
      if(tailProse&&tailProse.length){para.push(tailProse);}
      continue;
    }
    var um=t.match(/^[-*+]s+(.*)$/);
    if(um){if(!ul){flush();html.push('<ul>');ul=1;}html.push('<li>'+inline(um[1])+'</li>');continue;}
    var om=t.match(/^d+.s+(.*)$/);
    if(om){if(!ol){flush();html.push('<ol>');ol=1;}html.push('<li>'+inline(om[1])+'</li>');continue;}
    para.push(t);
  }
  flush();
  return html.join('
');
}
function typeset(el){
  function run(){if(window.MathJax&&MathJax.typesetPromise){MathJax.typesetPromise([el]).catch(function(){});}}
  if(window.MathJax){run();}else{setTimeout(run,300);setTimeout(run,1200);}
}
function tagHtml(s){return '<span class="tag live">LIVE</span>';}
/* feed */
function renderFeed(){
  state.offset=0;state.sessions=[];
  $('#live-dot').hidden=true;
  view.innerHTML='<section class="page"><p class="lede">Live research conversations submitted through the QNFO AI worker \u2014 the most recent threads, newest first.</p><div class="toolbar"><input id="search" type="search" placeholder="Search conversations\u2026" autocomplete="off" aria-label="Search conversations"><span id="count-label"></span></div><div id="feed-empty" class="empty" hidden>No conversations yet \u2014 new QNFO AI worker conversations will appear here live.</div><div id="session-list" class="list"></div></section>';
  var si=$('#search');si.addEventListener('input',function(){state.q=this.value.trim();loadSessions(true);});
  loadSessions(true);
  startPoll();
}
function renderList(){
  var el=$('#session-list');
  if(!state.sessions.length){el.innerHTML='';$('#feed-empty').hidden=false;return;}
  $('#feed-empty').hidden=true;
  el.innerHTML=state.sessions.map(function(s){
    var model=s.model?' \xB7 '+esc(s.model):'';
    return '<article class="row" data-id="'+esc(s.id)+'"><h3 class="row-title">'+esc(s.title||'(untitled)')+'</h3><p class="row-meta"><span>'+fmtAgo(s.created_at)+'</span><span>'+s.message_count+' messages</span>'+model+' '+tagHtml(s)+'</p></article>';
  }).join('');
  var lb=$('#count-label');lb.textContent=state.sessions.length+' conversations';
  if(state.hasMore)el.insertAdjacentHTML('beforeend','<button class="load-more" id="load-more">Load more</button>');
  Array.prototype.forEach.call(document.querySelectorAll('.row'),function(n){n.onclick=function(){location.hash='#/s/'+encodeURIComponent(n.getAttribute('data-id'));};});
  var lm=$('#load-more');if(lm)lm.onclick=loadMore;
}
function loadSessions(reset){
  if(reset){state.offset=0;state.sessions=[];}
  var params=new URLSearchParams({limit:String(state.limit),offset:String(state.offset)});
  if(state.q)params.set('q',state.q);
  fetch('/api/sessions?'+params.toString()).then(function(r){return r.json();}).then(function(d){
    if(d.error)return;
    state.sessions=d.sessions||[];
    state.hasMore=state.sessions.length>=state.limit;
    renderList();
  }).catch(function(){});
}
function loadMore(){
  state.offset+=state.limit;
  var params=new URLSearchParams({limit:String(state.limit),offset:String(state.offset)});
  if(state.q)params.set('q',state.q);
  fetch('/api/sessions?'+params.toString()).then(function(r){return r.json();}).then(function(d){
    if(d.error)return;
    state.sessions=state.sessions.concat(d.sessions||[]);
    state.hasMore=(d.sessions||[]).length>=state.limit;
    renderList();
  }).catch(function(){});
}
function startPoll(){
  stopPoll();
  state.timer=setInterval(function(){
    if(location.hash!=='#/'&&location.hash!=='')return;
    fetch('/api/feed?after='+state.lastAfter).then(function(r){return r.json();}).then(function(d){
      if(d.error)return;
      state.lastAfter=d.after||Date.now();
      if(d.sessions&&d.sessions.length&&!state.q){
        var known={};state.sessions.forEach(function(s){known[s.id]=1;});
        var fresh=d.sessions.filter(function(s){return !known[s.id];});
        if(fresh.length){state.sessions=fresh.concat(state.sessions);state.hasMore=state.sessions.length>=state.limit;renderList();$('#live-dot').hidden=false;}
      }
    }).catch(function(){});
  },30000);
}
function stopPoll(){if(state.timer){clearInterval(state.timer);state.timer=null;}}
/* detail */
function renderDetail(id){
  stopPoll();
  state.selected=id;
  $('#live-dot').hidden=true;
  view.innerHTML='<section class="page"><a class="back" href="#/">&#8592; Conversations</a><p class="loading">Loading conversation\u2026</p></section>';
  fetch('/api/session/'+encodeURIComponent(id)).then(function(r){return r.json();}).then(function(d){
    if(d.error){view.innerHTML='<section class="page"><a class="back" href="#/">&#8592; Conversations</a><p class="err">'+esc(d.error)+'</p></section>';return;}
    var head='<section class="page"><a class="back" href="#/">&#8592; Conversations</a><h1 class="detail-title">'+esc(d.title||'Conversation')+'</h1><p class="detail-meta"><span>'+d.message_count+' messages</span><span>started '+fmtAgo(d.created_at)+'</span>'+(d.model?'<span>'+esc(d.model)+'</span>':'')+' '+tagHtml(d)+'</p><div class="messages">';
    var body='';
    if(d.messages&&d.messages.length){
      body=d.messages.map(function(m){
        var who=m.role==='user'?'user':'asst';
        var inner=(m.role==='user')?esc(m.content):renderRich(m.content);
        return '<div class="msg '+who+'"><div class="bubble">'+inner+'<span class="meta">'+fmtTs(m.timestamp)+(m.role==='user'?' \xB7 you':' \xB7 QNFO')+'</span></div></div>';
      }).join('');
    }else{body='<p class="empty">No messages in this record.</p>';}
    view.innerHTML=head+body+'</div></section>';
    typeset(view);
  }).catch(function(e){view.innerHTML='<section class="page"><a class="back" href="#/">&#8592; Conversations</a><p class="err">Failed to load: '+esc(String(e))+'</p></section>';});
}
/* ask */
function renderAsk(){
  stopPoll();
  $('#live-dot').hidden=true;
  view.innerHTML='<section class="page"><p class="lede">Ask the QNFO research corpus \u2014 the indexed papers and knowledge base answer, with sources.</p><div class="ask-row"><input id="ask-input" type="text" maxlength="500" placeholder="Ask anything\u2026" autocomplete="off" aria-label="Ask the research corpus"><button id="ask-go">Ask</button></div><div class="chips" id="ask-chips"></div><div id="ask-result"></div></section>';
  var ai0=$('#ask-input');
  ai0.addEventListener('keydown',function(e){if(e.key==='Enter')doAsk();});
  $('#ask-go').addEventListener('click',doAsk);
  ai0.addEventListener('input',function(){var v=ai0.value.trim();if(askDebounce)clearTimeout(askDebounce);askDebounce=setTimeout(function(){loadAskChips(v.length>=2?v:'');},320);});
  loadAskChips('');
}
var askDebounce=null;
function loadAskChips(q){
  var el=$('#ask-chips');if(!el)return;
  var clean=String(q||'').trim().slice(0,120);
  var url='/api/suggest'+(clean?'?q='+encodeURIComponent(clean):'');
  fetch(url).then(function(r){return r.json();}).then(function(d){
    if(!d.groups||!d.groups.length){el.innerHTML='';return;}
    var html='';
    d.groups.forEach(function(g){
      html+='<span class="grp">'+esc(g.label||'')+'</span>';
      (g.items||[]).forEach(function(it){
        var full=String(it.title||'ask');
        var shown=full.length>84?full.slice(0,84)+'\u2026':full;
        html+='<button type="button" data-ask="'+esc(full)+'" title="'+esc(full)+'">'+esc(shown)+'</button>';
      });
    });
    el.innerHTML=html;
    var bs=el.querySelectorAll('button');
    for(var bj=0;bj<bs.length;bj++){
      (function(b){b.addEventListener('click',function(){var inp=$('#ask-input');if(inp){inp.value=b.getAttribute('data-ask')||'';doAsk();}});})(bs[bj]);
    }
  }).catch(function(){});
}
function doAsk(){
  var inp=$('#ask-input');if(!inp)return;
  var q=inp.value.trim();if(!q)return;
  var box=$('#ask-result');if(!box)return;
  box.style.display='block';box.innerHTML='<p class="ans">Searching for "'+esc(q)+'"\u2026</p>';
  var go=$('#ask-go');go.disabled=true;
  fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q})}).then(function(r){return r.json();}).then(function(d){
    if(d.error){box.innerHTML='<p class="ans">'+esc(d.error)+'</p>';return;}
    var html='';
    if(d.answer){html+='<div class="ans">'+renderRich(d.answer)+'</div>';}
    else if(d.backend_error){html+='<p class="ans">'+esc(d.backend_error)+'</p>';}
    if(d.sources&&d.sources.length){
      html+='<div class="srcs"><h4>Sources ('+d.sources.length+')</h4>';
      d.sources.forEach(function(s){
        var label=esc(s.file||s.slug||'source');
        html+='<p class="src">'+(s.slug?'<a href="https://papers.qnfo.org/papers/'+encodeURIComponent(s.slug)+'" target="_blank" rel="noopener">'+label+'</a>':'<span>'+label+'</span>')+(s.score!=null?' <span class="score">'+Number(s.score).toFixed(3)+'</span>':'')+'</p>';
      });
      html+='</div>';
    }
    if(d.threads&&d.threads.length){
      html+='<div class="rel"><h4>Related conversations ('+d.threads.length+')</h4>';
      d.threads.forEach(function(t){
        html+='<a class="rel-link" href="#/s/'+encodeURIComponent(t.id)+'">'+esc(t.title||'(untitled)')+' <span class="score">'+t.message_count+' messages</span></a>';
      });
      html+='</div>';
    }
    if(!d.answer&&!d.backend_error&&(!d.threads||!d.threads.length)){html='<p class="ans">No research found for that yet \u2014 try a different phrasing.</p>';}
    box.innerHTML=html;typeset(box);
  }).catch(function(e){box.innerHTML='<p class="ans">Failed: '+esc(String(e))+'</p>';}).finally(function(){go.disabled=false;});
}
/* propose */
function renderPropose(){
  stopPoll();
  $('#live-dot').hidden=true;
  view.innerHTML='<section class="page" id="propose-page"><p class="lede">Have an idea, question, or direction QNFO research should explore? Proposals land directly in the research queue for review.</p><textarea id="prop-idea" maxlength="2000" placeholder="Describe the idea, question, or experiment\u2026" aria-label="Your idea"></textarea><div class="prop-fields"><input id="prop-name" maxlength="100" placeholder="Your name (optional)" autocomplete="off"><input id="prop-contact" maxlength="200" placeholder="Email / handle (optional)" autocomplete="off"></div><input class="hp" id="prop-website" tabindex="-1" autocomplete="off"><button id="prop-go">Submit proposal</button><p id="propose-status"></p></section>';
  $('#prop-go').addEventListener('click',doPropose);
}
function doPropose(){
  var idea=$('#prop-idea');if(!idea)return;
  var st=$('#propose-status');
  if(idea.value.trim().length<20){st.textContent='Please share a bit more (at least 20 characters).';return;}
  var go=$('#prop-go');go.disabled=true;st.textContent='Submitting\u2026';
  var nm=$('#prop-name'),ct=$('#prop-contact'),wb=$('#prop-website');
  fetch('/api/proposals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idea:idea.value.trim(),name:nm?nm.value.trim():'',contact:ct?ct.value.trim():'',website:wb?wb.value:''})}).then(function(r){return r.json();}).then(function(d){
    if(d.error){st.textContent=esc(d.error);}
    else{st.textContent='Submitted \u2014 thank you. It will be reviewed for the research queue.';idea.value='';if(nm)nm.value='';if(ct)ct.value='';}
  }).catch(function(e){st.textContent='Failed: '+esc(String(e));}).finally(function(){go.disabled=false;});
}
/* router */
function route(){
  var h=location.hash||'#/';
  var navKey=(h.indexOf('#/ask')===0)?'ask':(h.indexOf('#/propose')===0)?'propose':'feed';
  Array.prototype.forEach.call(document.querySelectorAll('.top nav a'),function(a){a.classList.toggle('on',a.getAttribute('data-nav')===navKey);});
  if(h.indexOf('#/s/')===0){renderDetail(decodeURIComponent(h.slice(4)));}
  else if(h.indexOf('#/ask')===0){renderAsk();}
  else if(h.indexOf('#/propose')===0){renderPropose();}
  else{renderFeed();}
}
window.addEventListener('hashchange',route);
route();
})();
<\/script>
</body>
</html>
`], [`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QNFO Ideas</title>
<meta name="description" content="A public, read-only window into the QNFO research conversations \u2014 live from the QNFO AI worker chat log.">
<meta property="og:title" content="QNFO Ideas">
<meta property="og:description" content="Public read-only window into QNFO research conversations \u2014 live from the QNFO AI worker.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://ideas.qnfo.org">
<link rel="canonical" href="https://ideas.qnfo.org">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2324315e'/%3E%3Ctext x='16' y='23' text-anchor='middle' font-size='17' fill='%23faf7f2' font-family='Georgia,serif'%3EQ%3C/text%3E%3C/svg%3E">
<script>window.MathJax={tex:{inlineMath:[['$','$'],['\\\\(','\\\\)']],displayMath:[['$$','$$'],['\\\\[','\\\\]']],processEscapes:true},options:{skipHtmlTags:['script','noscript','style','textarea','pre','code'],enableMenu:false}};<\/script>
<script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js" onerror="this.onerror=null;var s=document.createElement('script');s.src='https://unpkg.com/mathjax@3/es5/tex-svg.js';document.head.appendChild(s);"><\/script>
<style>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Public+Sans:wght@400;500;600&display=swap');
:root{--paper:#faf7f2;--surface:#f2eee6;--ink:#1b1915;--muted:#8a8376;--border:#e2dcd0;--accent:#24315e;--accent-soft:#eceef6;--live:#2f6d4f;--arch:#8a8376}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font-family:'Public Sans',system-ui,sans-serif;background:var(--paper);color:var(--ink);line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.top{display:flex;align-items:baseline;gap:1.5rem;padding:1.4rem 1.6rem 1rem;max-width:880px;margin:0 auto;border-bottom:1px solid var(--border)}
.brand{font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:1.35rem;letter-spacing:-.01em;color:var(--ink)}
.brand em{font-style:italic;color:var(--accent)}
.top nav{margin-left:auto;display:flex;gap:1.1rem}
.top nav a{font-size:.82rem;font-weight:500;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);padding:.2rem 0;border-bottom:2px solid transparent}
.top nav a:hover{color:var(--ink);text-decoration:none}
.top nav a.on{color:var(--ink);border-bottom-color:var(--accent)}
.live-dot{margin-left:.25rem;font-size:.7rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--live)}
main{max-width:880px;margin:0 auto;padding:2.2rem 1.6rem 4rem}
.page{max-width:720px;margin:0 auto}
.lede{color:var(--muted);font-size:.95rem;margin:0 0 1.8rem;max-width:56ch}
.toolbar{display:flex;align-items:center;gap:1rem;margin-bottom:1.6rem}
#search{flex:1;font:inherit;font-size:1rem;padding:.55rem 0;border:none;border-bottom:1.5px solid var(--border);background:transparent;color:var(--ink);outline:none;border-radius:0}
#search:focus{border-bottom-color:var(--accent)}
#search::placeholder{color:var(--muted)}
#count-label{font-size:.75rem;color:var(--muted);white-space:nowrap}
.list{display:flex;flex-direction:column}
.row{padding:1.05rem .2rem;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s}
.row:hover{background:var(--surface)}
.row-title{font-family:'Fraunces',Georgia,serif;font-weight:500;font-size:1.08rem;margin:0 0 .3rem;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.row-meta{font-size:.78rem;color:var(--muted);margin:0;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
.tag{font-size:.64rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:.12rem .45rem;border-radius:999px}
.tag.live{color:var(--live);background:#e7f0ea}
.tag.arch{color:var(--arch);background:#efede7}
.load-more{margin:1.6rem auto 0;display:block;font:inherit;font-size:.82rem;font-weight:500;color:var(--accent);background:transparent;border:1px solid var(--border);border-radius:999px;padding:.5rem 1.3rem;cursor:pointer;transition:all .12s}
.load-more:hover{border-color:var(--accent);background:var(--accent-soft)}
.empty,.loading,.err{padding:2.5rem 0;text-align:center;color:var(--muted)}
.back{display:inline-block;font-size:.8rem;color:var(--muted);margin-bottom:1.6rem;letter-spacing:.02em}
.back:hover{color:var(--accent)}
.detail-title{font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:1.75rem;margin:0 0 .5rem;line-height:1.3}
.detail-meta{font-size:.8rem;color:var(--muted);margin:0 0 2.2rem;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
.messages{display:flex;flex-direction:column;gap:1.4rem}
.msg{display:flex}
.msg.user{justify-content:flex-end}
.msg .bubble{max-width:78%;padding:.8rem 1rem;border-radius:10px;font-size:.94rem;line-height:1.7;white-space:pre-wrap;word-break:break-word;position:relative}
.msg.asst .bubble{max-width:100%;width:100%;background:var(--surface);border-left:2px solid var(--accent);border-radius:0;overflow-x:auto}
.msg.user .bubble{background:var(--ink);color:#f6f3ec;border-radius:10px 2px 10px 10px}
.msg .bubble pre{background:#26231d;color:#e8e2d6;padding:.6rem .8rem;border-radius:6px;overflow-x:auto;font-size:.8rem;white-space:pre-wrap}
.msg .bubble code{font-family:ui-monospace,Consolas,monospace;font-size:.86em}
.msg .meta{display:block;font-size:.68rem;color:var(--muted);margin-top:.45rem}
.msg.user .meta{color:rgba(246,243,236,.62);text-align:right}
.msg .bubble table,.ans table{border-collapse:collapse;width:100%;margin:.5rem 0 .9rem;font-size:.87rem;line-height:1.5}
.msg .bubble th,.msg .bubble td,.ans th,.ans td{border:1px solid var(--border);padding:.42rem .6rem;text-align:left;vertical-align:top}
.msg .bubble thead th,.ans thead th{background:var(--accent-soft);font-weight:600}
.msg .bubble tbody tr:nth-child(even),.ans tbody tr:nth-child(even){background:#fff}
.ask-row{display:flex;gap:.6rem;margin-bottom:.8rem}
#ask-input{flex:1;font:inherit;font-size:1.05rem;padding:.7rem .9rem;border:1.5px solid var(--border);border-radius:8px;background:#fff;color:var(--ink);outline:none}
#ask-input:focus{border-color:var(--accent)}
#ask-go{font:inherit;font-size:.9rem;font-weight:600;padding:.7rem 1.4rem;border:none;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer;transition:opacity .12s}
#ask-go:hover{opacity:.9}
#ask-go:disabled{opacity:.5;cursor:wait}
.chips{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1.4rem}
.chips button{font:inherit;font-size:.74rem;color:var(--muted);background:transparent;border:1px solid var(--border);border-radius:999px;padding:.28rem .7rem;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chips button:hover{color:var(--accent);border-color:var(--accent)}
.chips{row-gap:.35rem}.chips .grp{flex-basis:100%;font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-top:.2rem;user-select:none}
.ans{background:var(--surface);border-left:2px solid var(--accent);padding:1rem 1.2rem;border-radius:2px 10px 10px 2px;font-size:.95rem;line-height:1.75;white-space:pre-wrap;word-break:break-word;margin:0 0 1rem}
.srcs h4,.rel h4{font-size:.72rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:1.2rem 0 .5rem}
.src{padding:.45rem 0;border-bottom:1px solid var(--border);font-size:.85rem;margin:0;display:flex;justify-content:space-between;gap:.6rem}
.src a{color:var(--accent);font-weight:500}
.score{color:var(--muted);font-size:.75rem;white-space:nowrap}
.rel-link{display:block;padding:.55rem 0;border-bottom:1px solid var(--border);font-size:.88rem;color:var(--ink);font-weight:500}
.rel-link:hover{color:var(--accent);text-decoration:none}
#propose-page textarea{width:100%;min-height:130px;font:inherit;font-size:.98rem;padding:.8rem .9rem;border:1.5px solid var(--border);border-radius:8px;background:#fff;color:var(--ink);outline:none;resize:vertical;margin-bottom:.8rem}
#propose-page textarea:focus{border-color:var(--accent)}
.prop-fields{display:flex;gap:.6rem;margin-bottom:.9rem;flex-wrap:wrap}
.prop-fields input{flex:1;min-width:200px;font:inherit;font-size:.9rem;padding:.6rem .8rem;border:1.5px solid var(--border);border-radius:8px;background:#fff;color:var(--ink);outline:none}
.prop-fields input:focus{border-color:var(--accent)}
.hp{position:absolute;left:-9999px;opacity:0;height:0;width:0}
#prop-go{font:inherit;font-size:.9rem;font-weight:600;padding:.65rem 1.5rem;border:none;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer}
#prop-go:disabled{opacity:.5;cursor:wait}
#propose-status{font-size:.82rem;color:var(--muted);margin-top:.8rem}
.foot{max-width:880px;margin:0 auto;padding:1.4rem 1.6rem 2.4rem;border-top:1px solid var(--border);font-size:.74rem;color:var(--muted);display:flex;gap:1rem;align-items:center;flex-wrap:wrap}
@media(max-width:640px){.top{flex-wrap:wrap;gap:.8rem}.top nav{margin-left:0;width:100%;gap:1.4rem}.brand{width:100%}.msg .bubble{max-width:92%}.detail-title{font-size:1.45rem}}
</style>
</head>
<body>
<header class="top">
  <a class="brand" href="#/">QNFO <em>Ideas</em></a>
  <nav>
    <a href="#/" data-nav="feed">Conversations</a>
    <a href="#/ask" data-nav="ask">Ask</a>
    <a href="#/propose" data-nav="propose">Propose</a>
  </nav>
  <span class="live-dot" id="live-dot" hidden>&#9679; live</span>
</header>
<main id="view"></main>
<footer class="foot">
  <span>QNFO Ideas \u2014 a read-only window into the QNFO research conversations.</span>
  <a href="https://qnfo.org" target="_blank" rel="noopener">qnfo.org</a>
  <a href="/rss.xml">RSS</a>
</footer>
<script>
(function(){
var $=function(s){return document.querySelector(s);};
var view=$('#view');
var state={q:'',offset:0,limit:50,hasMore:false,lastAfter:Date.now(),sessions:[],selected:null,timer:null};
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fmtAgo(ts){
  if(!ts)return '';
  var d=new Date(ts);if(isNaN(d.getTime()))return '';
  var s=(Date.now()-d.getTime())/1000;
  if(s<60)return 'just now';
  if(s<3600)return Math.floor(s/60)+'m ago';
  if(s<86400)return Math.floor(s/3600)+'h ago';
  if(s<86400*7)return Math.floor(s/86400)+'d ago';
  return d.toLocaleDateString([],{month:'short',day:'numeric',year:d.getFullYear()===new Date().getFullYear()?undefined:'numeric'});
}
function fmtTs(ts){if(!ts)return '';var d=new Date(ts);if(isNaN(d.getTime()))return '';var now=new Date();return d.toDateString()===now.toDateString()?d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString([],{month:'short',day:'numeric'});}
function renderRich(s){
  var BK=String.fromCharCode(96);
  var A=String.fromCharCode(42);
  var raw=String(s||'').replace(/\\r\\n/g,'\\n');
  var esc=function(x){return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
  var blocks=[];
  var fence=new RegExp(BK+BK+BK+'([\\\\s\\\\S]*?)'+BK+BK+BK,'g');
  raw=raw.replace(fence,function(m,code){
    var lang='';
    var lines=code.split('\\n');
    if(lines.length&&lines[0].trim()&&/^[A-Za-z0-9_+.-]+$/.test(lines[0].trim())){lang=lines[0].trim();code=lines.slice(1).join('\\n');}
    blocks.push('<pre><code'+(lang?' class="lang-'+esc(lang)+'"':'')+'>'+esc(code.replace(/\\n$/,''))+'</code></pre>');
    return '\\u0002'+String(blocks.length-1)+'\\u0002';
  });
  // Recover blank-line-collapsed markdown (producer stripped \\n\\n -> space).
  // (1) Glued table header: split prose off BEFORE a header whose next line is a
  //     separator with matching column count (lookahead preserves the existing newline).
  raw=raw.replace(/([^\\n])[ \\t]+(\\|[^\\n]*\\|)[ \\t]*(?=\\n([ \\t]*\\|?[\\s:|-]+\\|?[ \\t]*\\n))/g,function(m,pre,hdr,sep){
    var nh=(hdr.split('|').filter(function(x){return x.trim()!=='';})).length;
    var ns=(sep.match(/-+/g)||[]).length;
    return (nh>0&&nh===ns)?(pre+'\\n'+hdr):m;
  });
  // (2) Horizontal rules glued to text: "text. --- ##" -> "text.\\n---\\n##".
  raw=raw.replace(/([^\\n])[ \\t]+(---)[ \\t]+(?=#{1,6}[ \\t])/g,'$1\\n$2\\n');
  raw=raw.replace(/([^\\n])[ \\t]+(---)[ \\t]*(?=\\n)/g,'$1\\n$2\\n');
  // (3) Headings glued to preceding text.
  raw=raw.replace(/([^\\n])[ \\t]+(#{1,6}[ \\t])/g,'$1\\n$2');
  // (4) Blockquote glue: "text. > quote" -> "text.\\n> quote".
  raw=raw.replace(/([^\\n])[ \\t]+(>[ \\t]*\\S)/g,'$1\\n$2');
  var inline=function(x){
    var h=esc(x);
    var math=[];
    h=h.replace(/\\$\\$[\\s\\S]*?\\$\\$|\\$[^$\\n]*?\\$/g,function(m){math.push(m);return '\\u0001'+String(math.length-1)+'\\u0001';});
    h=h.replace(new RegExp(BK+'([^'+BK+']+)'+BK,'g'),function(m,c){return '<code>'+c+'</code>';});
    h=h.split(A+A).map(function(p,i){return i%2?'<strong>'+p+'</strong>':p;}).join('');
    h=h.split(A).map(function(p,i){return i%2?'<em>'+p+'</em>':p;}).join('');
    h=h.replace(/\\[([^\\]]+)\\]\\((https?:[^)\\s]+)\\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
    h=h.replace(/\\u0001(\\d+)\\u0001/g,function(m,i){return math[+i]||'';});
    return h;
  };
  var lines=raw.split('\\n');
  var html=[],i,para=[],ul=0,ol=0,quote=0;
  function flush(){
    if(ul){html.push('</ul>');ul=0;}
    if(ol){html.push('</ol>');ol=0;}
    if(quote){html.push('</blockquote>');quote=0;}
    if(para.length){html.push('<p>'+para.map(inline).join('<br>')+'</p>');para=[];}
  }
  for(i=0;i<lines.length;i++){
    var line=lines[i];
    var t=line.trim();
    if(t===''){flush();continue;}
    if(/^\\u0002\\d+\\u0002$/.test(t)){flush();html.push(blocks[+t.slice(1,-1)]);continue;}
    var hm=t.match(/^(#{1,6})\\s+(.*)$/);
    if(hm){flush();var hh=hm[1].length;html.push('<h'+hh+'>'+inline(hm[2])+'</h'+hh+'>');continue;}
    if(/^(-{3,}|\\*{3,}|_{3,})$/.test(t)){flush();html.push('<hr>');continue;}
    var bq=t.match(/^>\\s?(.*)$/);
    if(bq){if(!quote){flush();html.push('<blockquote>');quote=1;}html.push(bq[1]);continue;}
    // Tolerant table parse: recover producer-collapsed blank lines and never swallow prose.
    // Table separator requires a real pipe row (a bare --- is an hr, not a table).
    if(t.indexOf('|')>=0&&lines[i+1]&&lines[i+1].indexOf('|')>=0&&/^\\s*\\|?[\\s:|-]+\\|?\\s*$/.test(lines[i+1])&&lines[i+1].indexOf('-')>=0){
      var sepCols=(lines[i+1].split('|').map(function(x){return x.trim();}).filter(function(x){return x!=='';})).length||1;
      var hdrCells=line.split('|').map(function(x){return x.trim();}).filter(function(x){return x!=='';});
      var prefixProse=null;
      // Glued header: prose ran onto the same line as the table header (blank line stripped).
      if(line.trim().charAt(0)!=='|'&&hdrCells.length>sepCols){
        var cut=line.indexOf('|');
        prefixProse=line.slice(0,cut).trim();
        hdrCells=hdrCells.slice(hdrCells.length-sepCols);
      } else if(hdrCells.length>sepCols){
        hdrCells=hdrCells.slice(0,sepCols);
      }
      var body=[];var tailProse=null;
      i+=2;
      while(i<lines.length&&lines[i].trim()!==''&&lines[i].indexOf('|')>=0){
        var rc=lines[i].split('|').map(function(x){return x.trim();}).filter(function(x){return x!=='';});
        // Row with trailing prose glued after the last cell: keep the row, carry the prose.
        if(rc.length>sepCols){
          var segs=lines[i].split('|');
          var used=0,cutIdx=segs.length-1;
          for(var k=0;k<segs.length;k++){if(segs[k].trim()!==''){used++;if(used===sepCols){cutIdx=k;break;}}}
          rc=segs.slice(0,cutIdx+1).map(function(x){return x.trim();}).filter(function(x){return x!=='';});
          tailProse=segs.slice(cutIdx+1).join('|').trim();
          body.push(rc);
          i++;
          break;
        }
        body.push(rc);
        i++;
      }
      flush();
      if(prefixProse&&prefixProse.length){para.push(prefixProse);flush();}
      if(hdrCells.length){
        var th='';hdrCells.forEach(function(c){th+='<th>'+inline(c)+'</th>';});
        var tb='';body.forEach(function(rw){if(rw.length){tb+='<tr>'+rw.map(function(c){return '<td>'+inline(c)+'</td>';}).join('')+'</tr>';}});
        html.push('<table><thead><tr>'+th+'</tr></thead><tbody>'+tb+'</tbody></table>');
      }
      if(tailProse&&tailProse.length){para.push(tailProse);}
      continue;
    }
    var um=t.match(/^[-*+]\\s+(.*)$/);
    if(um){if(!ul){flush();html.push('<ul>');ul=1;}html.push('<li>'+inline(um[1])+'</li>');continue;}
    var om=t.match(/^\\d+\\.\\s+(.*)$/);
    if(om){if(!ol){flush();html.push('<ol>');ol=1;}html.push('<li>'+inline(om[1])+'</li>');continue;}
    para.push(t);
  }
  flush();
  return html.join('\\n');
}
function typeset(el){
  function run(){if(window.MathJax&&MathJax.typesetPromise){MathJax.typesetPromise([el]).catch(function(){});}}
  if(window.MathJax){run();}else{setTimeout(run,300);setTimeout(run,1200);}
}
function tagHtml(s){return '<span class="tag live">LIVE</span>';}
/* feed */
function renderFeed(){
  state.offset=0;state.sessions=[];
  $('#live-dot').hidden=true;
  view.innerHTML='<section class="page"><p class="lede">Live research conversations submitted through the QNFO AI worker \u2014 the most recent threads, newest first.</p><div class="toolbar"><input id="search" type="search" placeholder="Search conversations\u2026" autocomplete="off" aria-label="Search conversations"><span id="count-label"></span></div><div id="feed-empty" class="empty" hidden>No conversations yet \u2014 new QNFO AI worker conversations will appear here live.</div><div id="session-list" class="list"></div></section>';
  var si=$('#search');si.addEventListener('input',function(){state.q=this.value.trim();loadSessions(true);});
  loadSessions(true);
  startPoll();
}
function renderList(){
  var el=$('#session-list');
  if(!state.sessions.length){el.innerHTML='';$('#feed-empty').hidden=false;return;}
  $('#feed-empty').hidden=true;
  el.innerHTML=state.sessions.map(function(s){
    var model=s.model?' \xB7 '+esc(s.model):'';
    return '<article class="row" data-id="'+esc(s.id)+'"><h3 class="row-title">'+esc(s.title||'(untitled)')+'</h3><p class="row-meta"><span>'+fmtAgo(s.created_at)+'</span><span>'+s.message_count+' messages</span>'+model+' '+tagHtml(s)+'</p></article>';
  }).join('');
  var lb=$('#count-label');lb.textContent=state.sessions.length+' conversations';
  if(state.hasMore)el.insertAdjacentHTML('beforeend','<button class="load-more" id="load-more">Load more</button>');
  Array.prototype.forEach.call(document.querySelectorAll('.row'),function(n){n.onclick=function(){location.hash='#/s/'+encodeURIComponent(n.getAttribute('data-id'));};});
  var lm=$('#load-more');if(lm)lm.onclick=loadMore;
}
function loadSessions(reset){
  if(reset){state.offset=0;state.sessions=[];}
  var params=new URLSearchParams({limit:String(state.limit),offset:String(state.offset)});
  if(state.q)params.set('q',state.q);
  fetch('/api/sessions?'+params.toString()).then(function(r){return r.json();}).then(function(d){
    if(d.error)return;
    state.sessions=d.sessions||[];
    state.hasMore=state.sessions.length>=state.limit;
    renderList();
  }).catch(function(){});
}
function loadMore(){
  state.offset+=state.limit;
  var params=new URLSearchParams({limit:String(state.limit),offset:String(state.offset)});
  if(state.q)params.set('q',state.q);
  fetch('/api/sessions?'+params.toString()).then(function(r){return r.json();}).then(function(d){
    if(d.error)return;
    state.sessions=state.sessions.concat(d.sessions||[]);
    state.hasMore=(d.sessions||[]).length>=state.limit;
    renderList();
  }).catch(function(){});
}
function startPoll(){
  stopPoll();
  state.timer=setInterval(function(){
    if(location.hash!=='#/'&&location.hash!=='')return;
    fetch('/api/feed?after='+state.lastAfter).then(function(r){return r.json();}).then(function(d){
      if(d.error)return;
      state.lastAfter=d.after||Date.now();
      if(d.sessions&&d.sessions.length&&!state.q){
        var known={};state.sessions.forEach(function(s){known[s.id]=1;});
        var fresh=d.sessions.filter(function(s){return !known[s.id];});
        if(fresh.length){state.sessions=fresh.concat(state.sessions);state.hasMore=state.sessions.length>=state.limit;renderList();$('#live-dot').hidden=false;}
      }
    }).catch(function(){});
  },30000);
}
function stopPoll(){if(state.timer){clearInterval(state.timer);state.timer=null;}}
/* detail */
function renderDetail(id){
  stopPoll();
  state.selected=id;
  $('#live-dot').hidden=true;
  view.innerHTML='<section class="page"><a class="back" href="#/">&#8592; Conversations</a><p class="loading">Loading conversation\u2026</p></section>';
  fetch('/api/session/'+encodeURIComponent(id)).then(function(r){return r.json();}).then(function(d){
    if(d.error){view.innerHTML='<section class="page"><a class="back" href="#/">&#8592; Conversations</a><p class="err">'+esc(d.error)+'</p></section>';return;}
    var head='<section class="page"><a class="back" href="#/">&#8592; Conversations</a><h1 class="detail-title">'+esc(d.title||'Conversation')+'</h1><p class="detail-meta"><span>'+d.message_count+' messages</span><span>started '+fmtAgo(d.created_at)+'</span>'+(d.model?'<span>'+esc(d.model)+'</span>':'')+' '+tagHtml(d)+'</p><div class="messages">';
    var body='';
    if(d.messages&&d.messages.length){
      body=d.messages.map(function(m){
        var who=m.role==='user'?'user':'asst';
        var inner=(m.role==='user')?esc(m.content):renderRich(m.content);
        return '<div class="msg '+who+'"><div class="bubble">'+inner+'<span class="meta">'+fmtTs(m.timestamp)+(m.role==='user'?' \xB7 you':' \xB7 QNFO')+'</span></div></div>';
      }).join('');
    }else{body='<p class="empty">No messages in this record.</p>';}
    view.innerHTML=head+body+'</div></section>';
    typeset(view);
  }).catch(function(e){view.innerHTML='<section class="page"><a class="back" href="#/">&#8592; Conversations</a><p class="err">Failed to load: '+esc(String(e))+'</p></section>';});
}
/* ask */
function renderAsk(){
  stopPoll();
  $('#live-dot').hidden=true;
  view.innerHTML='<section class="page"><p class="lede">Ask the QNFO research corpus \u2014 the indexed papers and knowledge base answer, with sources.</p><div class="ask-row"><input id="ask-input" type="text" maxlength="500" placeholder="Ask anything\u2026" autocomplete="off" aria-label="Ask the research corpus"><button id="ask-go">Ask</button></div><div class="chips" id="ask-chips"></div><div id="ask-result"></div></section>';
  var ai0=$('#ask-input');
  ai0.addEventListener('keydown',function(e){if(e.key==='Enter')doAsk();});
  $('#ask-go').addEventListener('click',doAsk);
  ai0.addEventListener('input',function(){var v=ai0.value.trim();if(askDebounce)clearTimeout(askDebounce);askDebounce=setTimeout(function(){loadAskChips(v.length>=2?v:'');},320);});
  loadAskChips('');
}
var askDebounce=null;
function loadAskChips(q){
  var el=$('#ask-chips');if(!el)return;
  var clean=String(q||'').trim().slice(0,120);
  var url='/api/suggest'+(clean?'?q='+encodeURIComponent(clean):'');
  fetch(url).then(function(r){return r.json();}).then(function(d){
    if(!d.groups||!d.groups.length){el.innerHTML='';return;}
    var html='';
    d.groups.forEach(function(g){
      html+='<span class="grp">'+esc(g.label||'')+'</span>';
      (g.items||[]).forEach(function(it){
        var full=String(it.title||'ask');
        var shown=full.length>84?full.slice(0,84)+'\u2026':full;
        html+='<button type="button" data-ask="'+esc(full)+'" title="'+esc(full)+'">'+esc(shown)+'</button>';
      });
    });
    el.innerHTML=html;
    var bs=el.querySelectorAll('button');
    for(var bj=0;bj<bs.length;bj++){
      (function(b){b.addEventListener('click',function(){var inp=$('#ask-input');if(inp){inp.value=b.getAttribute('data-ask')||'';doAsk();}});})(bs[bj]);
    }
  }).catch(function(){});
}
function doAsk(){
  var inp=$('#ask-input');if(!inp)return;
  var q=inp.value.trim();if(!q)return;
  var box=$('#ask-result');if(!box)return;
  box.style.display='block';box.innerHTML='<p class="ans">Searching for "'+esc(q)+'"\u2026</p>';
  var go=$('#ask-go');go.disabled=true;
  fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q})}).then(function(r){return r.json();}).then(function(d){
    if(d.error){box.innerHTML='<p class="ans">'+esc(d.error)+'</p>';return;}
    var html='';
    if(d.answer){html+='<div class="ans">'+renderRich(d.answer)+'</div>';}
    else if(d.backend_error){html+='<p class="ans">'+esc(d.backend_error)+'</p>';}
    if(d.sources&&d.sources.length){
      html+='<div class="srcs"><h4>Sources ('+d.sources.length+')</h4>';
      d.sources.forEach(function(s){
        var label=esc(s.file||s.slug||'source');
        html+='<p class="src">'+(s.slug?'<a href="https://papers.qnfo.org/papers/'+encodeURIComponent(s.slug)+'" target="_blank" rel="noopener">'+label+'</a>':'<span>'+label+'</span>')+(s.score!=null?' <span class="score">'+Number(s.score).toFixed(3)+'</span>':'')+'</p>';
      });
      html+='</div>';
    }
    if(d.threads&&d.threads.length){
      html+='<div class="rel"><h4>Related conversations ('+d.threads.length+')</h4>';
      d.threads.forEach(function(t){
        html+='<a class="rel-link" href="#/s/'+encodeURIComponent(t.id)+'">'+esc(t.title||'(untitled)')+' <span class="score">'+t.message_count+' messages</span></a>';
      });
      html+='</div>';
    }
    if(!d.answer&&!d.backend_error&&(!d.threads||!d.threads.length)){html='<p class="ans">No research found for that yet \u2014 try a different phrasing.</p>';}
    box.innerHTML=html;typeset(box);
  }).catch(function(e){box.innerHTML='<p class="ans">Failed: '+esc(String(e))+'</p>';}).finally(function(){go.disabled=false;});
}
/* propose */
function renderPropose(){
  stopPoll();
  $('#live-dot').hidden=true;
  view.innerHTML='<section class="page" id="propose-page"><p class="lede">Have an idea, question, or direction QNFO research should explore? Proposals land directly in the research queue for review.</p><textarea id="prop-idea" maxlength="2000" placeholder="Describe the idea, question, or experiment\u2026" aria-label="Your idea"></textarea><div class="prop-fields"><input id="prop-name" maxlength="100" placeholder="Your name (optional)" autocomplete="off"><input id="prop-contact" maxlength="200" placeholder="Email / handle (optional)" autocomplete="off"></div><input class="hp" id="prop-website" tabindex="-1" autocomplete="off"><button id="prop-go">Submit proposal</button><p id="propose-status"></p></section>';
  $('#prop-go').addEventListener('click',doPropose);
}
function doPropose(){
  var idea=$('#prop-idea');if(!idea)return;
  var st=$('#propose-status');
  if(idea.value.trim().length<20){st.textContent='Please share a bit more (at least 20 characters).';return;}
  var go=$('#prop-go');go.disabled=true;st.textContent='Submitting\u2026';
  var nm=$('#prop-name'),ct=$('#prop-contact'),wb=$('#prop-website');
  fetch('/api/proposals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idea:idea.value.trim(),name:nm?nm.value.trim():'',contact:ct?ct.value.trim():'',website:wb?wb.value:''})}).then(function(r){return r.json();}).then(function(d){
    if(d.error){st.textContent=esc(d.error);}
    else{st.textContent='Submitted \u2014 thank you. It will be reviewed for the research queue.';idea.value='';if(nm)nm.value='';if(ct)ct.value='';}
  }).catch(function(e){st.textContent='Failed: '+esc(String(e));}).finally(function(){go.disabled=false;});
}
/* router */
function route(){
  var h=location.hash||'#/';
  var navKey=(h.indexOf('#/ask')===0)?'ask':(h.indexOf('#/propose')===0)?'propose':'feed';
  Array.prototype.forEach.call(document.querySelectorAll('.top nav a'),function(a){a.classList.toggle('on',a.getAttribute('data-nav')===navKey);});
  if(h.indexOf('#/s/')===0){renderDetail(decodeURIComponent(h.slice(4)));}
  else if(h.indexOf('#/ask')===0){renderAsk();}
  else if(h.indexOf('#/propose')===0){renderPropose();}
  else{renderFeed();}
}
window.addEventListener('hashchange',route);
route();
})();
<\/script>
</body>
</html>
`])));
async function handleRss(env) {
  const items = await allThreads(env);
  const base = "https://ideas.qnfo.org";
  const itemsXml = items.slice(0, 40).map((it) => {
    const title = xmlEsc(redact(String(it.title || it.id).slice(0, 200)));
    const link = base + "/#/s/" + encodeURIComponent(it.id);
    const desc = xmlEsc(redact(it.title || ""));
    const pub = it.updated_at || it.created_at ? new Date(it.updated_at || it.created_at).toUTCString() : (/* @__PURE__ */ new Date()).toUTCString();
    return "  <item>\n    <title>" + title + "</title>\n    <link>" + link + '</link>\n    <guid isPermaLink="false">' + it.id + "</guid>\n    <description>" + desc + "</description>\n    <pubDate>" + pub + "</pubDate>\n  </item>";
  }).join("\n");
  const now = (/* @__PURE__ */ new Date()).toUTCString();
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n  <title>QNFO Idea Factory</title>\n  <link>' + base + "/</link>\n  <description>Public read-only research conversations from QNFO \u2014 ideas as they develop.</description>\n  <lastBuildDate>" + now + "</lastBuildDate>\n" + itemsXml + "\n</channel>\n</rss>";
  return new Response(body, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
__name(handleRss, "handleRss");
__name2(handleRss, "handleRss");
function xmlEsc(t) {
  return String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
__name(xmlEsc, "xmlEsc");
__name2(xmlEsc, "xmlEsc");
function serveEmbed() {
  const html = `<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>QNFO Ideas \u2014 live</title>
<style>
:root{--ink:#1b1915;--muted:#8a8376;--border:#e2dcd0;--accent:#24315e;--live:#2f6d4f}
*{box-sizing:border-box}
body{margin:0;font-family:'Public Sans',system-ui,sans-serif;background:#faf7f2;color:var(--ink);padding:12px 14px;line-height:1.45}
.head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.head .dot{width:8px;height:8px;border-radius:50%;background:var(--live);animation:p 2s infinite}
@keyframes p{0%,100%{opacity:1}50%{opacity:.3}}
.head b{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600}
a{color:var(--accent);text-decoration:none;font-size:13px;font-weight:600}
a:hover{text-decoration:underline}
.item{padding:6px 0;border-bottom:1px solid var(--border)}
.item .t{font-family:'Fraunces',Georgia,serif;font-size:13.5px;line-height:1.35}
.item .m{color:var(--muted);font-size:11px}
.foot{font-size:10px;color:var(--muted);margin-top:8px;text-align:right}
</style></head><body>
<div class="head"><span class="dot"></span><b>QNFO Ideas \u2014 live</b></div>
<div id="list">loading\u2026</div>
<div class="foot"><a href="https://ideas.qnfo.org" target="_blank" rel="noopener">Open the full factory \u2192</a></div>
<script>
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function load(){
  fetch('/api/sessions?limit=10').then(function(r){return r.json();}).then(function(d){
    var el=document.getElementById('list');
    if(!d.sessions||!d.sessions.length){el.textContent='No research threads yet.';return;}
    el.innerHTML=d.sessions.map(function(s){
      var d2=s.created_at?s.created_at.slice(0,10):'';
      return '<div class="item"><div class="t"><a href="https://ideas.qnfo.org/#/s/'+encodeURIComponent(s.id)+'" target="_blank" rel="noopener">'+esc(s.title||'(untitled)')+'</a></div><div class="m">'+d2+' \xB7 '+s.message_count+' messages'+(s.source==='live'?' \xB7 LIVE':'')+'</div></div>';
    }).join('');
  }).catch(function(){});
}
load();
setInterval(load,60000);
<\/script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60" } });
}
__name(serveEmbed, "serveEmbed");
__name2(serveEmbed, "serveEmbed");
function serveUI() {
  return new Response(UI_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60"
    }
  });
}
__name(serveUI, "serveUI");
__name2(serveUI, "serveUI");
return { default: worker_default };
})();
var ideaminerMod = (function(){
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "0.1.2-glm53";
var WORKER = "qnfo-idea-miner";
var MODEL = "@cf/zai-org/glm-5.3-flash";
var MAX_IDEAS = 3;
var MAX_TOKENS = 1500;
function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
__name(json, "json");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = h * 31 + s.charCodeAt(i) | 0;
  }
  return "h" + (h >>> 0).toString(36) + s.length.toString(36);
}
__name(hash, "hash");
async function runModel(env, prompt) {
  try {
    const r = await env.AI.run(MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: MAX_TOKENS, temperature: 0.4 });
    const c = r && r.choices && r.choices[0] && r.choices[0].message;
    const text = c ? String(c.content || "") : r && typeof r.response === "string" ? r.response : "";
    return text.trim();
  } catch (e) {
    return "";
  }
}
__name(runModel, "runModel");
var MINER_PROMPT = [
  "From the recent research-session titles below, propose up to 3 specific, novel, publishable research questions.",
  "Each idea must be a concrete research direction - a falsifiable claim or a derivable mathematical/quantitative result - NOT a chat summary, NOT an ops command, NOT a meta question about the pipeline.",
  "Write each idea as one sentence stating the precise research question.",
  'Return JSON ONLY: {"ideas":["idea 1","idea 2","idea 3"]}',
  "Titles:"
].join("\n");
async function run(env) {
  const cooldown = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM idea_proposals WHERE name='auto-miner' AND created_at > ?").bind(new Date(Date.now() - 3 * 3600 * 1e3).toISOString()).first();
  if (cooldown && cooldown.n > 0) return { status: "ok", mined: 0, note: "cooldown: recent auto-miner idea" };
  const rows = await env.QNFO_AUDIT.prepare("SELECT thread_id, title, updated_at FROM chat_sessions WHERE category='research' ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 12").all();
  const titles = (rows.results || []).map(function(r) {
    return String(r.title || r.thread_id || "").slice(0, 120);
  }).filter(Boolean);
  if (!titles.length) return { status: "ok", mined: 0, note: "no research sessions" };
  const text = await runModel(env, MINER_PROMPT + "\n" + titles.join("\n"));
  if (!text) return { status: "error", mined: 0, note: "model empty" };
  let ideas = [];
  try {
    ideas = (JSON.parse(text).ideas || []).slice(0, MAX_IDEAS);
  } catch (e) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        ideas = (JSON.parse(m[0]).ideas || []).slice(0, MAX_IDEAS);
      } catch (e2) {
      }
    }
  }
  if (!ideas.length) ideas = [text.slice(0, 800)];
  let mined = 0;
  for (const idea of ideas) {
    const ideaText = String(idea).trim().slice(0, 2e3);
    if (ideaText.length < 20) continue;
    const h = hash(ideaText);
    const dup = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM idea_proposals WHERE ip_hash=?1").bind(h).first();
    if (dup && dup.n > 0) continue;
    await env.QNFO_AUDIT.prepare("INSERT INTO idea_proposals (name, idea, contact, status, ip_hash, created_at) VALUES (?1,?2,?3,'new',?4,?5)").bind("auto-miner", ideaText, "", h, nowIso()).run();
    mined++;
  }
  return { status: "ok", mined, total: ideas.length };
}
__name(run, "run");
var worker_default = {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, worker: WORKER, version: VERSION });
    if (url.pathname === "/run" && request.method === "POST") {
      const out = await run(env);
      return json({ ok: true, worker: WORKER, version: VERSION, out });
    }
    return json({ error: "not found" }, 404);
  }
};
return { default: worker_default };
})();
var ideatriageMod = (function(){
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "1.4.0-intake-only";
var MODELS = {
  a: "@cf/zai-org/glm-5.3-flash",
  b: "@cf/deepseek-ai/deepseek-v4-flash-0731",
  tiebreak: "@cf/zai-org/glm-5.3"
};
var MODEL_CHAIN = [
  "@cf/zai-org/glm-5.3-flash",
  "@cf/zai-org/glm-5.3",
  "@cf/deepseek-ai/deepseek-v4-flash-0731",
  "@cf/zai-org/glm-5.3",
  "@cf/zai-org/glm-5.3"
];
var ACCEPT_MIN = 0.7;
var FEAS_MIN = 0.5;
var RISK_MAX = 0.4;
var STD_TIE = 0.25;
var AGENT_ORCH_PUBLIC = "https://agent-orchestrator.qnfo.org";
function orchBase(env) {
  return AGENT_ORCH_PUBLIC;
}
__name(orchBase, "orchBase");
var MAX_REVISE = 2;
var MAX_STAGE_ATTEMPTS = 3;
var MAX_ACTIVE = 1;
var OUTREACH_CAP = 12;
var INDEXNOW_API = "https://api.indexnow.org/indexnow";
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}
__name(json, "json");
function auth(req, env) {
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  return !!env.TRIAGE_TOKEN && !!t && t === env.TRIAGE_TOKEN;
}
__name(auth, "auth");
function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "paper";
}
__name(slugify, "slugify");
function tryJson(s) {
  if (typeof s !== "string") return s || null;
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch (e) {
    return null;
  }
}
__name(tryJson, "tryJson");
var SCORECARD_PROMPT = `You are QNFO's research-idea merit reviewer. Score the idea below for the QNFO autonomous research pipeline.
Return JSON ONLY: {"novelty":0-1,"technical_merit":0-1,"impact_potential":0-1,"exposure_potential":0-1,"feasibility":0-1,"risk":0-1,"rationale":"<=120 chars","hook":"<=90 chars, one-line public-facing hook"}
Scoring guide: technical_merit = depth of technical content + verifiability; impact_potential = significance if proven; exposure_potential = breadth of audience/attention it can attract (social, media, cross-field); risk = probability of producing nothing citable (1 = near-certain dead end). IMPORTANT: feasibility means feasibility of the THEORETICAL/COMPUTATIONAL research itself (can the derivation, simulation, formal analysis, and computational verification be carried out by the QNFO autonomous pipeline) \u2014 NOT experimental testability. QNFO has no laboratory; an idea is feasible if its mathematics/computation can be executed and verified in silico, even if a confirming experiment would require external labs years away. Do NOT mark a theoretical physics idea infeasible merely because no experiment currently exists.
IDEA: `;
function extractText(r) {
  if (!r) return "";
  const ch = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
  if (ch) return String(ch);
  const c2 = r.result && r.result.choices && r.result.choices[0] && r.result.choices[0].message && r.result.choices[0].message.content;
  if (c2) return String(c2);
  if (typeof r.response === "string") return r.response;
  if (r.result && typeof r.result.response === "string") return r.result.response;
  if (r.result && typeof r.result === "object") {
    const s = JSON.stringify(r.result);
    if (s && s.length > 2) return s;
  }
  if (r.data && typeof r.data === "object") {
    const c3 = r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.content;
    if (c3) return String(c3);
    if (typeof r.data.response === "string") return r.data.response;
  }
  return "";
}
__name(extractText, "extractText");
async function runModel(env, name, prompt) {
  let lastErr = "";
  const chain = [name].concat(MODEL_CHAIN.filter(function(x) {
    return x !== name;
  })).slice(0, 4);
  for (const model of chain) {
    try {
      const r = await env.AI.run(model, { messages: [{ role: "user", content: prompt }], max_tokens: 700, temperature: 0.2 });
      const text = extractText(r);
      const mm = text && text.match(/\{[\s\S]*\}/);
      if (!mm) {
        lastErr = model + ": no JSON in output";
        continue;
      }
      const parsed = JSON.parse(mm[0]);
      const keys = ["novelty", "technical_merit", "impact_potential", "exposure_potential", "feasibility", "risk"];
      let ok = true;
      for (const k of keys) {
        const v = parseFloat(parsed[k]);
        if (!isFinite(v)) {
          ok = false;
          break;
        }
        parsed[k] = Math.max(0, Math.min(1, v));
      }
      if (!ok) {
        lastErr = model + ": invalid scorecard fields";
        continue;
      }
      return { card: parsed, model };
    } catch (e) {
      lastErr = model + ": " + (e && e.message || e);
      continue;
    }
  }
  return { error: "all scoring models failed: " + lastErr };
}
__name(runModel, "runModel");
function composite(c) {
  return 0.3 * c.novelty + 0.3 * c.technical_merit + 0.2 * c.impact_potential + 0.2 * c.exposure_potential;
}
__name(composite, "composite");
async function scoreIdea(env, desire) {
  const prompt = SCORECARD_PROMPT + String(desire || "").slice(0, 3e3);
  const [ra, rb] = await Promise.all([runModel(env, MODELS.a, prompt), runModel(env, MODELS.b, prompt)]);
  const a = ra && ra.card ? ra : null;
  const b = rb && rb.card ? rb : null;
  let card = null, models = [];
  if (a && b) {
    const keys = ["novelty", "technical_merit", "impact_potential", "exposure_potential", "feasibility", "risk"];
    card = {};
    for (const k of keys) card[k] = (a.card[k] + b.card[k]) / 2;
    card.rationale = a.card.rationale || "";
    card.hook = a.card.hook || "";
    models = [a.model, b.model];
    const std = Math.sqrt(keys.map(function(k) {
      return Math.pow(a.card[k] - b.card[k], 2);
    }).reduce(function(x, y) {
      return x + y;
    }, 0) / keys.length);
    if (std > STD_TIE) {
      const t = await runModel(env, MODELS.tiebreak, prompt);
      if (t && t.card) {
        for (const k of keys) card[k] = (a.card[k] + b.card[k] + t.card[k]) / 3;
        models.push(t.model);
      }
    }
  } else if (a) {
    card = a.card;
    models = [a.model];
  } else if (b) {
    card = b.card;
    models = [b.model];
  } else {
    const detail = [ra && ra.error, rb && rb.error].filter(Boolean).join(" | ");
    return { error: "all scoring models failed: " + detail };
  }
  const c = composite(card);
  const decision = c >= ACCEPT_MIN && card.feasibility >= FEAS_MIN && card.risk <= RISK_MAX ? "ACCEPT" : "HOLD";
  return {
    score: Math.round(c * 1e3) / 1e3,
    decision,
    novelty: card.novelty,
    technical_merit: card.technical_merit,
    impact_potential: card.impact_potential,
    exposure_potential: card.exposure_potential,
    feasibility: card.feasibility,
    risk: card.risk,
    rationale: card.rationale,
    hook: card.hook,
    model: models.join("+")
  };
}
__name(scoreIdea, "scoreIdea");
var NOISE_RE = [
  /^call (the )?[a-z_]+( tool)?(\s|$)/i,
  /(email_check|express_intent|intents_list|social_compose|search_research|search_papers tool)/i,
  /output the (complete )?raw json/i,
  /^reply with the single word/i,
  /^give this conversation a name/i,
  /^max \d+ chars/i,
  /based on the chat history/i,
  /rotation verification/i,
  /redirect probe/i,
  /auto-express block/i,
  /wrapped in/i,
  /^ok$/i
];
function isNoise(text) {
  const t = String(text || "");
  return NOISE_RE.some((re) => {
    re.lastIndex = 0;
    return re.test(t);
  });
}
__name(isNoise, "isNoise");
function isQuestion(text) {
  const t = String(text || "").trim();
  return t.length < 160 && /\?\s*$/.test(t) && /^(what|who|where|when|why|how|is|are|do|does|did|can|could|should|would|will|has|have|quick|one line|one sentence|in one sentence|probe)/i.test(t);
}
__name(isQuestion, "isQuestion");
async function enqueue(env, source, sourceId, idea, summary, s) {
  await env.QNFO_AUDIT.prepare(
    "INSERT OR IGNORE INTO research_queue (id, source, source_id, idea, summary, score, decision, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'queued',?8)"
  ).bind(crypto.randomUUID(), source, sourceId, String(idea || "").slice(0, 3e3), String(summary || "").slice(0, 200), s.score, s.decision, (/* @__PURE__ */ new Date()).toISOString()).run();
}
__name(enqueue, "enqueue");
async function triageOne(env, row) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (isNoise(row.desire)) {
    await env.QNFO_AUDIT.prepare("UPDATE intents SET triage_decision='NOISE', triage_rationale=?, triaged_at=?, status='triaged' WHERE id=?").bind("tool-instruction noise filter", now, row.id).run();
    return { id: row.id, verdict: "noise" };
  }
  if (isQuestion(row.desire)) {
    await env.QNFO_AUDIT.prepare("UPDATE intents SET triage_decision='HOLD', triage_rationale=?, triaged_at=?, status='triaged' WHERE id=?").bind("question, not an idea \u2014 routes to the answer path", now, row.id).run();
    return { id: row.id, verdict: "question" };
  }
  const s = await scoreIdea(env, row.desire);
  if (s.error) return { id: row.id, verdict: "error", error: s.error };
  await env.QNFO_AUDIT.prepare(
    "UPDATE intents SET triage_decision=?, triage_score=?, triage_rationale=?, triage_model=?, triaged_at=?, status='triaged' WHERE id=?"
  ).bind(s.decision, s.score, s.rationale || "", s.model, now, row.id).run();
  if (s.decision === "ACCEPT") {
    await enqueue(env, "intent", row.id, row.desire, row.summary || "", s);
  }
  return { id: row.id, verdict: s.decision, score: s.score };
}
__name(triageOne, "triageOne");
async function runPending(env, commit, limit) {
  const out = { triaged: [], queue_added: 0, errors: [], commit };
  const intents = await env.QNFO_AUDIT.prepare(
    "SELECT * FROM intents WHERE type='research' AND status='pending' AND (triage_decision IS NULL OR triage_decision='') ORDER BY created_at ASC LIMIT ?1"
  ).bind(limit).all();
  for (const row of intents.results || []) {
    try {
      if (!commit) {
        out.triaged.push({ id: row.id, preview: "would-score" });
        continue;
      }
      const t = await triageOne(env, row);
      if (t.verdict === "ACCEPT") out.queue_added++;
      out.triaged.push(t);
    } catch (e) {
      out.errors.push({ id: row.id, error: e.message });
    }
  }
  const props = await env.QNFO_AUDIT.prepare(
    "SELECT * FROM idea_proposals WHERE status='new' ORDER BY created_at ASC LIMIT ?1"
  ).bind(limit).all();
  for (const row of props.results || []) {
    try {
      if (!commit) {
        out.triaged.push({ id: String(row.id), preview: "would-score-proposal" });
        continue;
      }
      const desire = row.idea;
      let s;
      if (isNoise(desire) || isQuestion(desire)) {
        s = null;
        await env.QNFO_AUDIT.prepare("UPDATE idea_proposals SET decision='HOLD', rationale=?, triaged_at=?, status='triaged_hold' WHERE id=?").bind("noise/question filter", (/* @__PURE__ */ new Date()).toISOString(), row.id).run();
      } else {
        s = await scoreIdea(env, desire);
        if (s.error) {
          out.errors.push({ id: String(row.id), error: s.error });
          continue;
        }
        await env.QNFO_AUDIT.prepare("UPDATE idea_proposals SET decision=?, score=?, rationale=?, triaged_at=?, status=? WHERE id=?").bind(s.decision, s.score, s.rationale || "", (/* @__PURE__ */ new Date()).toISOString(), s.decision === "ACCEPT" ? "triaged_accepted" : "triaged_hold", row.id).run();
      }
      if (s && s.decision === "ACCEPT") {
        await enqueue(env, "proposal", String(row.id), desire, "", s);
        out.queue_added++;
      }
      out.triaged.push({ id: String(row.id), verdict: s ? s.decision : "HOLD" });
    } catch (e) {
      out.errors.push({ id: String(row.id), error: e.message });
    }
  }
  return out;
}
__name(runPending, "runPending");
async function ensureSchema(env) {
  const alters = [
    "ALTER TABLE research_queue ADD COLUMN stage TEXT",
    "ALTER TABLE research_queue ADD COLUMN agent_task_id TEXT",
    "ALTER TABLE research_queue ADD COLUMN attempt INTEGER DEFAULT 0",
    "ALTER TABLE research_queue ADD COLUMN revise_count INTEGER DEFAULT 0",
    "ALTER TABLE research_queue ADD COLUMN context TEXT",
    "ALTER TABLE research_queue ADD COLUMN published_at TEXT",
    "ALTER TABLE research_queue ADD COLUMN doi TEXT",
    "ALTER TABLE research_queue ADD COLUMN paper_url TEXT",
    "ALTER TABLE research_queue ADD COLUMN error TEXT"
  ];
  for (const a of alters) {
    try {
      await env.QNFO_AUDIT.prepare(a).run();
    } catch (e) {
    }
  }
  await env.QNFO_AUDIT.prepare(
    "CREATE TABLE IF NOT EXISTS pipeline_tasks (id TEXT PRIMARY KEY, queue_id TEXT, stage TEXT, action TEXT, status TEXT, detail TEXT, created_at TEXT)"
  ).run();
  await env.QNFO_AUDIT.prepare(
    "CREATE INDEX IF NOT EXISTS idx_pt_queue ON pipeline_tasks(queue_id)"
  ).run();
}
__name(ensureSchema, "ensureSchema");
async function logTask(env, queueId, stage, action, status, detail) {
  try {
    await env.QNFO_AUDIT.prepare(
      "INSERT INTO pipeline_tasks (id, queue_id, stage, action, status, detail, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)"
    ).bind(crypto.randomUUID(), queueId, stage, action, status, String(detail || "").slice(0, 2e3), (/* @__PURE__ */ new Date()).toISOString()).run();
  } catch (e) {
    console.log("logTask error", e.message);
  }
}
__name(logTask, "logTask");
async function setPipelineStatus(env, status, phase, notes) {
  try {
    await env.QNFO_AUDIT.prepare(
      "INSERT INTO pipeline_status (project_name, status, phase, last_updated, agent, notes) VALUES ('autonomous-research', ?1, ?2, ?3, 'qnfo-idea-triage', ?4) ON CONFLICT(project_name) DO UPDATE SET status=excluded.status, phase=excluded.phase, last_updated=excluded.last_updated, agent=excluded.agent, notes=excluded.notes"
    ).bind(status, phase, (/* @__PURE__ */ new Date()).toISOString(), String(notes || "").slice(0, 500)).run();
  } catch (e) {
  }
}
__name(setPipelineStatus, "setPipelineStatus");
function briefNote(row) {
  return [
    "You are executing stage NOTE of the QNFO autonomous research pipeline.",
    "RESEARCH IDEA: " + row.idea,
    "",
    "Goal: produce a literature-review note establishing the current state of knowledge for this idea.",
    "Steps:",
    "1) arxiv_search with at least 3 DISTINCT query formulations (different phrasings/keywords).",
    "2) web_search with at least 2 distinct formulations; web_fetch the 2 most relevant non-arXiv pages.",
    "3) search_papers (QNFO corpus vector search) for prior QNFO work; get_paper_context for the 2 most relevant QNFO papers.",
    "4) query_graph (stats, then neighbors) for related QNFO knowledge-graph nodes.",
    '5) store_note(key: "note", content: your findings).',
    "6) Final response (Markdown, NO further tool calls):",
    '   - "State of knowledge": 3-8 sentences.',
    '   - "Quantitative estimates": key numbers/bounds with explicit assumptions and derivation steps.',
    '   - "Open questions": 2-5 questions this idea could answer.',
    '   - "Citations": top 5 sources as arXiv ids / QNFO slugs / DOIs (ONLY sources you actually retrieved).',
    "Never fabricate a citation. If a source was not retrieved, do not cite it."
  ].join("\n");
}
__name(briefNote, "briefNote");
function briefDraft(row, note) {
  return [
    "You are executing stage DRAFT of the QNFO autonomous research pipeline.",
    "RESEARCH IDEA: " + row.idea,
    "LITERATURE NOTE: " + String(note || "").slice(0, 8e3),
    "",
    "Goal: write a complete, citable research paper (Markdown) advancing the idea.",
    "Requirements:",
    "- Title (specific, descriptive). Abstract (150-250 words). Body: Introduction, Prior work (cite the note's sources), Analysis/Results, Discussion, Conclusion, References.",
    "- Every quantitative claim must state assumptions and derivation steps (COMPUTATIONAL-VERIFICATION-1). Verify numerics step by step.",
    "- Citations: ONLY sources listed in the note. Reference format: [n] Author, Title, arXiv:XXXX or DOI.",
    "- Style: match QNFO published papers - rigorous, falsifiable claims, no hype; state what would disconfirm each strong claim.",
    "- Length: 2000-4000 words.",
    '- store_note(key: "draft", content: the full paper markdown).',
    "- Final response: the full paper markdown ONLY (no commentary)."
  ].join("\n");
}
__name(briefDraft, "briefDraft");
function briefReview(row, draft) {
  return [
    "You are the adversarial reviewer in the QNFO autonomous research pipeline (post-publication adversarial analysis gate, applied pre-publication).",
    "RESEARCH IDEA: " + row.idea,
    "DRAFT: " + String(draft || "").slice(0, 24e3),
    "",
    "Audit dimensions:",
    "- Accuracy: are claims, numbers, derivations, citations correct and traceable to retrieved sources?",
    "- Completeness: missing edge cases, error states, verification steps?",
    "- Dependency: do cited works exist and support the claim?",
    "- Novelty: does this say something not already in the cited prior work?",
    'Output JSON ONLY: {"verdict":"CLEAN|REVISIONS","findings":[{"severity":"HARD|SOFT|DESIGN","issue":"...","fix":"..."}]}',
    "- HARD = factual/derivation error, fabricated or unsupported citation, overclaimed result.",
    "- If no HARD findings: verdict CLEAN (findings may still list SOFT/DESIGN).",
    "Final response: the JSON only."
  ].join("\n");
}
__name(briefReview, "briefReview");
function briefRevise(row, draft, findings) {
  return [
    "You are revising a draft paper per adversarial-review findings in the QNFO autonomous research pipeline.",
    "RESEARCH IDEA: " + row.idea,
    "DRAFT: " + String(draft || "").slice(0, 24e3),
    "REVIEWER FINDINGS (JSON): " + String(findings || "").slice(0, 6e3),
    "",
    "Fix EVERY HARD finding precisely. Address SOFT findings where cheap. Do not weaken the paper's core claims unless a finding demands it.",
    '- store_note(key: "draft", content: the revised full paper markdown).',
    "- Final response: the full revised paper markdown ONLY."
  ].join("\n");
}
__name(briefRevise, "briefRevise");
function briefPublish(row, slug, draft) {
  return [
    "You are executing stage PUBLISH of the QNFO autonomous research pipeline.",
    "RESEARCH IDEA: " + row.idea,
    "PAPER (final, reviewed): " + String(draft || "").slice(0, 24e3),
    "",
    "Do the following IN ORDER:",
    '1) publish_paper(slug: "' + slug + '", title: <paper title>, authors: "Rowan Brad Quni-Gudzinas", abstract: <abstract>, body_md: <full paper markdown>).',
    '2) zenodo_publish(slug: "' + slug + '", title: <paper title>, body_md: <full paper markdown>, authors: "Rowan Brad Quni-Gudzinas", description: <abstract>, keywords: [<3-5 keywords>]).',
    '3) social_promote(slug: "' + slug + '", title: <paper title>, posts: [5 posts, each <=290 chars, strictly faithful to the abstract: hook -> plain-language claim -> why it matters -> 1 caveat -> link to https://papers.qnfo.org/papers/' + slug + "/]).",
    '4) github_publish(repo: "QNFO/qnfo-research", path: "papers/' + slug + '/paper.md", content: <full paper markdown>, message: "autonomous pipeline: ' + slug + '").',
    "Never invent numbers in the social posts beyond what the paper states.",
    'Final response: JSON ONLY: {"slug":"<slug>","doi":"<doi from zenodo_publish or null>","published":true}'
  ].join("\n");
}
__name(briefPublish, "briefPublish");
function briefFor(row, slug) {
  const ctx = tryJson(row.context) || {};
  switch (row.stage) {
    case "note":
      return { prompt: briefNote(row), maxSteps: 6 };
    case "draft":
      return { prompt: briefDraft(row, ctx.note), maxSteps: 8, maxTokens: 8192 };
    case "review":
      return { prompt: briefReview(row, ctx.draft), maxSteps: 6 };
    case "revise":
      return { prompt: briefRevise(row, ctx.draft, ctx.findings), maxSteps: 8, maxTokens: 8192 };
    case "publish":
      return { prompt: briefPublish(row, slug, ctx.draft), maxSteps: 6 };
    default:
      return null;
  }
}
__name(briefFor, "briefFor");
async function dispatchStage(env, row, slug) {
  const b = briefFor(row, slug);
  if (!b) return { error: "no brief for stage " + row.stage };
  if (!env.DISPATCH_TOKEN) return { error: "DISPATCH_TOKEN not configured" };
  const body = { prompt: b.prompt, max_steps: b.maxSteps };
  if (b.maxTokens) body.max_tokens = b.maxTokens;
  const base = orchBase(env);
  const r = await fetch(base + "/task", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sync-Token": env.DISPATCH_TOKEN },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    let detail = "";
    try {
      detail = (await r.text()).slice(0, 200);
    } catch (eD) {
    }
    console.log("[qnfo-idea-triage] dispatch fail", r.status, base, detail);
    return { error: "agent-http-" + r.status, detail };
  }
  const j = await r.json().catch(() => ({}));
  if (!j.task_id) return { error: "agent-no-task-id" };
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET agent_task_id=?1 WHERE id=?2").bind(j.task_id, row.id).run();
  await logTask(env, row.id, row.stage, "dispatch", "ok", "task " + j.task_id + " steps=" + b.maxSteps);
  return { ok: true, task_id: j.task_id };
}
__name(dispatchStage, "dispatchStage");
async function getTask(env, tid) {
  try {
    const r = await fetch(orchBase(env) + "/task/" + tid, { headers: { "X-Sync-Token": env.DISPATCH_TOKEN || "" } });
    if (!r.ok) return { error: "http-" + r.status };
    return await r.json();
  } catch (e) {
    return { error: String(e && e.message || e).slice(0, 200) };
  }
}
__name(getTask, "getTask");
async function advance(env, row, result) {
  const ctx = tryJson(row.context) || {};
  const slug = slugify(row.summary || row.idea);
  if (result.status === "completed") {
    const text = String(result.result || "");
    switch (row.stage) {
      case "note": {
        ctx.note = text;
        await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='draft', context=?1, attempt=0 WHERE id=?2").bind(JSON.stringify(ctx), row.id).run();
        await logTask(env, row.id, "note", "complete", "ok", "note " + text.length + " chars");
        return { advanced: true, stage: "draft" };
      }
      case "draft": {
        ctx.draft = text;
        await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='review', context=?1, attempt=0 WHERE id=?2").bind(JSON.stringify(ctx), row.id).run();
        await logTask(env, row.id, "draft", "complete", "ok", "draft " + text.length + " chars");
        return { advanced: true, stage: "review" };
      }
      case "review": {
        const rev = tryJson(text) || { verdict: "REVISIONS", findings: [{ severity: "HARD", issue: "review output unparseable: " + text.slice(0, 120), fix: "re-review" }] };
        ctx.findings = JSON.stringify(rev);
        const hard = (rev.findings || []).filter((f) => f && f.severity === "HARD").length;
        if (rev.verdict === "CLEAN" || hard === 0) {
          await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='publish', context=?1, attempt=0 WHERE id=?2").bind(JSON.stringify(ctx), row.id).run();
          await logTask(env, row.id, "review", "complete", "clean", "verdict CLEAN; findings=" + (rev.findings || []).length);
          return { advanced: true, stage: "publish" };
        }
        const rc = Number(row.revise_count) || 0;
        if (rc >= MAX_REVISE) {
          await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='failed', error=?1, completed_at=?2 WHERE id=?3").bind("review-gate: HARD findings persisted after " + rc + " revise rounds", (/* @__PURE__ */ new Date()).toISOString(), row.id).run();
          await logTask(env, row.id, "review", "fail", "gate", "persistent HARD findings; never published");
          await setPipelineStatus(env, "idle", "research", "idea failed review gate: " + row.id);
          return { advanced: true, stage: "failed" };
        }
        await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='revise', context=?1, attempt=0, revise_count=?2 WHERE id=?3").bind(JSON.stringify(ctx), rc + 1, row.id).run();
        await logTask(env, row.id, "review", "complete", "revisions", "HARD=" + hard + " -> revise round " + (rc + 1));
        return { advanced: true, stage: "revise" };
      }
      case "revise": {
        ctx.draft = text;
        await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='review', context=?1, attempt=0 WHERE id=?2").bind(JSON.stringify(ctx), row.id).run();
        await logTask(env, row.id, "revise", "complete", "ok", "revised draft " + text.length + " chars -> re-review");
        return { advanced: true, stage: "review" };
      }
      case "publish": {
        const pub = tryJson(text) || {};
        const claimedSlug = pub.slug || slug;
        let lp = null;
        try {
          lp = await env.LIVING_PAPER.prepare("SELECT slug, doi, zenodo_doi FROM papers WHERE slug=?1").bind(claimedSlug).first();
        } catch (e) {
          await logTask(env, row.id, "publish", "verify", "error", "living-paper check failed: " + e.message);
        }
        if (!lp) {
          await logTask(env, row.id, "publish", "verify", "fail", "slug not in living-paper: " + claimedSlug + "; will retry publish");
          return { advanced: false, retry: true, reason: "living-paper row missing" };
        }
        const doi = lp.zenodo_doi || lp.doi || pub.doi || null;
        const paperUrl = "https://papers.qnfo.org/papers/" + lp.slug + "/";
        await env.QNFO_AUDIT.prepare(
          "UPDATE research_queue SET status='completed', completed_at=?1, paper_slug=?2, doi=?3, paper_url=?4, published_at=?1 WHERE id=?5"
        ).bind((/* @__PURE__ */ new Date()).toISOString(), lp.slug, doi, paperUrl, row.id).run();
        await logTask(env, row.id, "publish", "complete", "ok", "slug=" + lp.slug + " doi=" + doi);
        await finalize(env, row, lp.slug, doi, paperUrl);
        await setPipelineStatus(env, "idle", "research", "published " + lp.slug);
        return { advanced: true, stage: "published", slug: lp.slug, doi };
      }
      default:
        return { advanced: false };
    }
  }
  return { advanced: false, doState: result.status };
}
__name(advance, "advance");
async function finalize(env, row, slug, doi, paperUrl) {
  try {
    const ctx = tryJson(row.context) || {};
    const hay = String((ctx.draft || "") + " " + (ctx.note || "")).toLowerCase();
    const contacts = await env.QNFO_AUDIT.prepare("SELECT email, name FROM contact_ledger WHERE name IS NOT NULL").all();
    let queued = 0;
    for (const c of contacts.results || []) {
      if (queued >= OUTREACH_CAP) break;
      const name = String(c.name || "").trim();
      if (name.length < 4) continue;
      const tokens = name.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
      if (!tokens.length) continue;
      const hit = tokens.some((t) => hay.includes(t));
      if (!hit) continue;
      await env.QNFO_AUDIT.prepare(
        "INSERT OR IGNORE INTO outreach_queue (id, paper_id, author, email, reason, status, created_at) VALUES (?1,?2,?3,?4,?5,'queued',?6)"
      ).bind(crypto.randomUUID(), slug, name, c.email, "cited/related work match", (/* @__PURE__ */ new Date()).toISOString()).run();
      queued++;
    }
    await logTask(env, row.id, "finalize", "outreach", queued > 0 ? "queued" : "none", "outreach_queue +" + queued);
  } catch (e) {
    await logTask(env, row.id, "finalize", "outreach", "error", e.message);
  }
  try {
    if (env.INDEXNOW_KEY) {
      const body = {
        host: "papers.qnfo.org",
        key: env.INDEXNOW_KEY,
        keyLocation: "https://papers.qnfo.org/" + env.INDEXNOW_KEY + ".txt",
        urlList: [paperUrl]
      };
      const r = await fetch(INDEXNOW_API, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "User-Agent": "QNFO/qnfo-idea-triage/1.1" },
        body: JSON.stringify(body)
      });
      await logTask(env, row.id, "finalize", "indexnow", r.ok ? "ok:" + r.status : "http-" + r.status, paperUrl);
    } else {
      await logTask(env, row.id, "finalize", "indexnow", "skipped", "INDEXNOW_KEY not set");
    }
  } catch (e) {
    await logTask(env, row.id, "finalize", "indexnow", "error", e.message);
  }
}
__name(finalize, "finalize");
async function claimNext(env) {
  const active = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) n FROM research_queue WHERE status='researching'").first();
  if (active && Number(active.n) >= MAX_ACTIVE) return { claimed: false, reason: "active-task-exists" };
  if (env.AUTO_PAUSE === "1") return { claimed: false, reason: "auto-pause" };
  const row = await env.QNFO_AUDIT.prepare("SELECT * FROM research_queue WHERE status='queued' ORDER BY score DESC LIMIT 1").first();
  if (!row) return { claimed: false, reason: "empty-queue" };
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const upd = await env.QNFO_AUDIT.prepare(
    "UPDATE research_queue SET status='researching', claimed_at=?1, stage='note', attempt=1, context=NULL WHERE id=?2 AND status='queued'"
  ).bind(now, row.id).run();
  if (!(upd.meta && upd.meta.changes)) return { claimed: false, reason: "claim-lost" };
  row.status = "researching";
  row.stage = "note";
  row.attempt = 1;
  await logTask(env, row.id, "note", "claim", "ok", "idea: " + String(row.idea || "").slice(0, 120));
  await setPipelineStatus(env, "active", "research", "researching: " + String(row.summary || row.idea || "").slice(0, 120));
  const d = await dispatchStage(env, row, slugify(row.summary || row.idea));
  return { claimed: true, queue_id: row.id, stage: "note", dispatch: d };
}
__name(claimNext, "claimNext");
async function syncStages(env) {
  const rows = await env.QNFO_AUDIT.prepare("SELECT * FROM research_queue WHERE status='researching'").all();
  const out = [];
  for (const row of rows.results || []) {
    if (!row.agent_task_id) {
      const attempt = (Number(row.attempt) || 0) + 1;
      if (attempt > MAX_STAGE_ATTEMPTS) {
        await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='failed', error=?1, completed_at=?2 WHERE id=?3").bind("no task id after " + MAX_STAGE_ATTEMPTS + " attempts", (/* @__PURE__ */ new Date()).toISOString(), row.id).run();
        out.push({ id: row.id, action: "failed-no-task" });
        continue;
      }
      await env.QNFO_AUDIT.prepare("UPDATE research_queue SET attempt=?1 WHERE id=?2").bind(attempt, row.id).run();
      const d = await dispatchStage(env, row, slugify(row.summary || row.idea));
      out.push({ id: row.id, action: "re-dispatch", dispatch: d });
      continue;
    }
    const st = await getTask(env, row.agent_task_id);
    if (st.error) {
      out.push({ id: row.id, action: "poll-error", error: st.error });
      continue;
    }
    if (st.status === "running") {
      const claimedMs = Date.parse(row.claimed_at || "");
      if (!isNaN(claimedMs) && Date.now() - claimedMs > 40 * 60 * 1e3) {
        await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='failed', error='watchdog: stage exceeded 40min', completed_at=?1 WHERE id=?2").bind((/* @__PURE__ */ new Date()).toISOString(), row.id).run();
        await logTask(env, row.id, row.stage, "watchdog", "fail", "40min stage timeout");
        out.push({ id: row.id, action: "watchdog-failed" });
      } else {
        out.push({ id: row.id, action: "running", step: st.step });
      }
      continue;
    }
    if (st.status === "completed") {
      const adv = await advance(env, row, st);
      if (adv.retry) {
        const attempt = (Number(row.attempt) || 0) + 1;
        if (attempt > MAX_STAGE_ATTEMPTS) {
          await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='failed', error=?1, completed_at=?2 WHERE id=?3").bind("publish verify failed " + MAX_STAGE_ATTEMPTS + " attempts", (/* @__PURE__ */ new Date()).toISOString(), row.id).run();
          out.push({ id: row.id, action: "failed-publish-verify" });
        } else {
          await env.QNFO_AUDIT.prepare("UPDATE research_queue SET attempt=?1 WHERE id=?2").bind(attempt, row.id).run();
          const d = await dispatchStage(env, row, slugify(row.summary || row.idea));
          out.push({ id: row.id, action: "re-dispatch-publish", dispatch: d });
        }
      } else {
        out.push({ id: row.id, action: adv.advanced ? "advanced->" + adv.stage : "held" });
        if (adv.advanced) {
          const fresh = await env.QNFO_AUDIT.prepare("SELECT * FROM research_queue WHERE id=?1").bind(row.id).first();
          if (fresh && fresh.status === "researching") {
            const d = await dispatchStage(env, fresh, slugify(fresh.summary || fresh.idea));
            out[out.length - 1].dispatch = d;
          }
        }
      }
      continue;
    }
    if (st.status === "failed") {
      const attempt = (Number(row.attempt) || 0) + 1;
      const err = String(st.error || "DO failed").slice(0, 300);
      if (attempt > MAX_STAGE_ATTEMPTS) {
        await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='failed', error=?1, completed_at=?2 WHERE id=?3").bind("stage failed after " + MAX_STAGE_ATTEMPTS + " attempts: " + err, (/* @__PURE__ */ new Date()).toISOString(), row.id).run();
        await logTask(env, row.id, row.stage, "fail", "terminal", err);
        await setPipelineStatus(env, "idle", "research", "stage failed: " + row.id);
        out.push({ id: row.id, action: "terminal-fail" });
      } else {
        await env.QNFO_AUDIT.prepare("UPDATE research_queue SET attempt=?1, agent_task_id=NULL WHERE id=?2").bind(attempt, row.id).run();
        await logTask(env, row.id, row.stage, "retry", "attempt-" + attempt, err);
        const d = await dispatchStage(env, row, slugify(row.summary || row.idea));
        out.push({ id: row.id, action: "retry-" + attempt, dispatch: d });
      }
      continue;
    }
    out.push({ id: row.id, action: "unknown-state", state: st.status });
  }
  return out;
}
__name(syncStages, "syncStages");
var worker_default = {
  async scheduled(event, env) {
    if (event.cron === "0 * * * *") {
      try {
        await ensureSchema(env);
        const r = await runPending(env, true, 8);
        console.log("[qnfo-idea-triage] triage cron:", JSON.stringify({ triaged: r.triaged.length, added: r.queue_added, errors: r.errors.length }));
      } catch (e) {
        console.log("[qnfo-idea-triage] triage cron error:", e.message);
      }
    }
    if (event.cron === "*/10 * * * *") {
      try {
        await ensureSchema(env);
        const r = await runPending(env, true, 4);
        console.log("[qnfo-idea-triage] intake cron:", JSON.stringify({ triaged: r.triaged.length, added: r.queue_added, errors: r.errors.length }));
      } catch (e) {
        console.log("[qnfo-idea-triage] intake cron error:", e.message);
      }
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
    }
    try {
      if (p === "/health") {
        return json({
          ok: true,
          worker: "qnfo-idea-triage",
          version: VERSION,
          bindings: { d1: !!env.QNFO_AUDIT, ai: !!env.AI, living_paper: !!env.LIVING_PAPER },
          secrets: { triage_token: !!env.TRIAGE_TOKEN, dispatch_token: !!env.DISPATCH_TOKEN, indexnow_key: !!env.INDEXNOW_KEY },
          policy: { acceptMin: ACCEPT_MIN, feasMin: FEAS_MIN, riskMax: RISK_MAX, stdTie: STD_TIE, maxActive: MAX_ACTIVE, maxRevise: MAX_REVISE, autoPause: env.AUTO_PAUSE === "1" }
        });
      }
      if (p === "/triage" && request.method === "POST") {
        if (!auth(request, env)) return json({ error: "unauthorized" }, 401);
        const body = await request.json().catch(() => ({}));
        const desire = String(body.desire || "").trim();
        if (!desire) return json({ error: "desire required" }, 400);
        if (isNoise(desire)) return json({ decision: "NOISE", score: 0, rationale: "noise filter" });
        if (isQuestion(desire)) return json({ decision: "HOLD", score: 0, rationale: "question, not an idea" });
        const s = await scoreIdea(env, desire);
        return json(s, s.error ? 502 : 200);
      }
      if (p === "/run/pending") {
        const commit = url.searchParams.get("commit") === "1";
        if (commit && !auth(request, env)) return json({ error: "unauthorized" }, 401);
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "8", 10) || 8, 20);
        const r = await runPending(env, commit, limit);
        return json(r);
      }
      if (p === "/run/queue") {
        const commit = url.searchParams.get("commit") === "1";
        if (commit && !auth(request, env)) return json({ error: "unauthorized" }, 401);
        await ensureSchema(env);
        if (!commit) {
          const q = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) n FROM research_queue WHERE status='queued'").first();
          const a = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) n FROM research_queue WHERE status='researching'").first();
          return json({ preview: true, queued: q ? q.n : 0, active: a ? a.n : 0 });
        }
        const r = await claimNext(env);
        return json(r);
      }
      if (p === "/run/sync") {
        const commit = url.searchParams.get("commit") === "1";
        if (commit && !auth(request, env)) return json({ error: "unauthorized" }, 401);
        await ensureSchema(env);
        const r = await syncStages(env);
        return json({ synced: r });
      }
      if (p === "/stats") {
        const intents = await env.QNFO_AUDIT.prepare("SELECT triage_decision, COUNT(*) n FROM intents WHERE triage_decision IS NOT NULL GROUP BY triage_decision").all();
        const queue = await env.QNFO_AUDIT.prepare("SELECT status, stage, COUNT(*) n FROM research_queue GROUP BY status, stage").all();
        const tasks = await env.QNFO_AUDIT.prepare("SELECT stage, status, COUNT(*) n FROM pipeline_tasks GROUP BY stage, status").all();
        return json({ intents: intents.results, queue: queue.results, pipeline_tasks: tasks.results });
      }
      return json({ error: "not found", path: p }, 404);
    } catch (e) {
      return json({ error: "server error: " + e.message }, 500);
    }
  }
};
return { default: worker_default };
})();

// ===== MERGE idea-hub =====
var m0D = {
  async fetch(request, env, ctx) {
    const p = new URL(request.url).pathname;
    if (p === "/health") return new Response(JSON.stringify({ ok: true, worker: "idea-hub", version: "merged-2026-09-11", members: 3 }), { headers: { "content-type": "application/json" } });
    if (p === "/idea-factory" || p.startsWith("/idea-factory/")) { const u = new URL(request.url); u.pathname = p.slice(13) || "/"; return ideafactoryMod.default.fetch(new Request(u.toString(), request), env, ctx); }
    if (p === "/idea-miner" || p.startsWith("/idea-miner/")) { const u = new URL(request.url); u.pathname = p.slice(11) || "/"; return ideaminerMod.default.fetch(new Request(u.toString(), request), env, ctx); }
    if (p === "/idea-triage" || p.startsWith("/idea-triage/")) { const u = new URL(request.url); u.pathname = p.slice(12) || "/"; return ideatriageMod.default.fetch(new Request(u.toString(), request), env, ctx); }
    return new Response("idea-hub", { status: 200 });
  },
  async scheduled(event, env, ctx) {
    const c = event.cron;
    if (c === "0 * * * *") return ideatriageMod.default.scheduled(event, env, ctx);
    if (c === "*/10 * * * *") return ideatriageMod.default.scheduled(event, env, ctx);
  },
};

return { default: m0D };

})();
var m1 = (function(){
const QNFO_VERSION = "qnfo-thread-ingest/fabric-20260910";
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker_ingest.js
var worker_ingest_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }
    const auth = request.headers.get("X-Sync-Token");
    if (path !== "/health" && (!auth || !env.SYNC_TOKEN || auth !== env.SYNC_TOKEN)) {
      return json({ error: "Unauthorized: missing or invalid X-Sync-Token" }, 401);
    }
    try {
      if (path === "/health") {
        return json({
          worker: "qnfo-thread-ingest",
          version: "1.0.0",
          status: "ok",
          bindings: { d1: !!env.QNFO_AUDIT, sync_token: !!env.SYNC_TOKEN }
        });
      }
      if (path === "/threads" && request.method === "POST") {
        return handleThreads(request, env);
      }
      if (path === "/stats" && request.method === "GET") {
        const res = await env.QNFO_AUDIT.prepare(
          "SELECT category, COUNT(*) n FROM chat_sessions GROUP BY category"
        ).all();
        return json({ sessions: res.results });
      }
      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: "Server error: " + e.message }, 500);
    }
  }
};
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Sync-Token"
  };
}
__name(cors, "cors");
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, cors())
  });
}
__name(json, "json");
async function handleThreads(request, env) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > 3e6) return json({ error: "payload too large (max 3MB)" }, 413);
  const body = await request.json().catch(() => null);
  if (!body || !body.session_id) return json({ error: "session_id required" }, 400);
  if (!Array.isArray(body.messages)) return json({ error: "messages array required" }, 400);
  const sessionId = String(body.session_id).slice(0, 200);
  const messages = body.messages.filter((m) => m && m.role && typeof m.content === "string" && m.content.trim()).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content).slice(0, 2e4),
    timestamp: m.timestamp || null
  }));
  const category = body.category === "infra" ? "infra" : "research";
  const title = String(body.title || "").slice(0, 500);
  const agentId = String(body.agent_id || "").slice(0, 100);
  const modelId = String(body.model_id || "").slice(0, 100);
  const source = String(body.source || "deepchat").slice(0, 50);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let createdAt = now;
  if (body.created_at) {
    const ms = Number(body.created_at);
    if (Number.isFinite(ms) && ms > 1e12) createdAt = new Date(ms).toISOString();
  }
  let updatedAt = now;
  if (body.updated_at) {
    const ms = Number(body.updated_at);
    if (Number.isFinite(ms) && ms > 1e12) updatedAt = new Date(ms).toISOString();
  }
  const res = await env.QNFO_AUDIT.prepare(
    `INSERT INTO chat_sessions (thread_id, messages, created_at, updated_at, category, agent_id, title, model_id, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(thread_id) DO UPDATE SET
       messages = excluded.messages,
       updated_at = excluded.updated_at,
       category = excluded.category,
       agent_id = excluded.agent_id,
       title = excluded.title,
       model_id = excluded.model_id,
       source = excluded.source`
  ).bind(sessionId, JSON.stringify(messages), createdAt, updatedAt, category, agentId, title, modelId, source).run();
  return json({ success: true, session_id: sessionId, category, message_count: messages.length, changed: res.meta.changes });
}
__name(handleThreads, "handleThreads");
return { default: worker_ingest_default };
//# sourceMappingURL=worker_ingest.js.map

})();

// ===== ABSORB idea-hub (absorbed3-2026-09-11: idea-hub+qnfo-thread-ingest) =====
export default {
  async fetch(request, env, ctx) {
    const p = new URL(request.url).pathname;
    if (p === "/health") return new Response(JSON.stringify({ ok: true, worker: "idea-hub", version: "absorbed3-2026-09-11", merged: ["idea-hub", "qnfo-thread-ingest"] }), { headers: { "content-type": "application/json" } });
    if (p === "/health") return m0.default.fetch(request, env, ctx);
    if (p === "/run") return m0.default.fetch(request, env, ctx);
    return m0.default.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    const c = event.cron;
    if (c === "*/10 * * * *") { m0.default.scheduled(event, env, ctx); return; }
    if (c === "0 * * * *") { m0.default.scheduled(event, env, ctx); return; }
  },
};
