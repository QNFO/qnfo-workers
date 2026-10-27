var VERSION = "0.1.5-manim-pin"; /* 0.1.5 YT-MANIM-PIN-1 (2026-10-27, pillar reach; patch): the render image pins manim 0.22.0, the version the scene was tested on; 0.18.1 has no Scene.time and the first container render failed with that AttributeError (visible since 0.1.4 returns the Manim stderr). */ /* prior: 0.1.4 */ /* 0.1.4 YT-RENDER-ERR-1 (2026-10-27, pillar reach; patch): the render container returns the Manim stderr tail when Manim fails (the first live render failed with only a traceback of the wrapper). */ /* prior: 0.1.3 */ /* 0.1.3 YT-DIRECTOR-1 (2026-10-27, pillar reach; patch): the director takes the first reply that holds a beats array from qnfo-ai, then Workers AI kimi, then gpt-oss, and a failure note quotes each reply (the first live run failed with "no JSON in model reply" from one model). */ /* prior: 0.1.2 */ /* 0.1.2 YT-EXPORTS-1 (2026-10-27, pillar reach; patch): wrangler.toml declares RenderContainer in `exports` instead of `migrations`, so a deploy after a secrets write through the script API is accepted and re-attaches the container (the pilot incident 1485 class). */ /* prior: 0.1.1 */ /* 0.1.1 YT-RUN-SYNC-1 (2026-10-27, pillar reach; patch): POST /run did its pass inside ctx.waitUntil, which a fetch handler loses 30 s after the response, so a manual run died at the director; it now awaits one bounded pass (budget_s, default 80, under the edge 100 s limit) and returns the row states. */ /* prior: 0.1.0 */ /* 0.1.0 YT-SERVER-1 (2026-10-27, pillar reach; minor: a new worker): the plain-language paper to YouTube Short pipeline runs on Cloudflare only. One hourly tick takes the newest plain_article (living-paper, status ok) with no youtube_videos row (cap 2 videos a week), an LLM director writes the beats, a second model family and a number check drop any beat the article does not support, Workers AI TTS speaks each sentence, a Cloudflare Container renders 1080x1920 with Manim, word-timed captions and the visible AI-narration tag into R2, and videos.insert uploads it (public by default, owner directive 2026-10-27) with containsSyntheticMedia. */
// Owner directive 2026-10-27: "all of this needs to run 100% server-side on Cloudflare Quniverse". docs/YOUTUBE-PIPELINE.md has the design.
// State machine per paper (D1 qnfo-audit.youtube_videos.state): queued -> directed -> audio -> rendering -> rendered -> uploaded;
// terminal: rejected (director left too few supported beats), failed (4 attempts), uploaded. Every tick resumes an unfinished row before
// it starts a new paper, so a slow render or a missing credential never loses work (state and artifacts live in D1 and R2).
// Secrets (wrangler secret put, under the deploy-guard secret lock): YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN, YT_RUN_TOKEN.
var WORKER = "qnfo-youtube-shorts";
var CRON_TABLE = ["0 * * * *"]; // CRON-SINGLE-TRIGGER-1: one hourly trigger; every entry runs once in the hour it fires
var WEEKLY_CAP = 2;
var MAX_ATTEMPTS = 4;
var PRIVACY = "public"; // owner directive 2026-10-27: "ALL VIDEOS/SHORTS SHALL BE PUBLIC BY DEFAULT". An API project that has not passed the YouTube audit is forced to private by YouTube; the privacy YouTube returns is what the ledger stores.
var BASE = "https://papers.qnfo.org";
var TTS_MODEL = "@cf/myshell-ai/melotts";
var CHECK_MODEL = "@cf/openai/gpt-oss-120b";
var WRITE_FALLBACK_MODEL = "@cf/moonshotai/kimi-k2.6";
var KINDS = ["hook", "versus", "payoff", "meter", "dots", "points", "stat"];
var MAX_NARR_WORDS = 150; // about 55 seconds at the voice's pace; a Short is under 60 s
var MIN_CONTENT_BEATS = 3;
var RENDER_POLLS = 40; // x 15 s inside one tick
// COST-CAP (owner 2026-10-27: at most USD 50 a month added expense, all-in; hard stop at SPEND_STOP_USD). Rates are list prices used as ESTIMATES;
// youtube_spend stores units next to usd so the rates can be corrected from measured runs (docs/YOUTUBE-PIPELINE.md cost model).
var SPEND_STOP_USD = 45;
var PRICES = { neuron_usd: 0.011 / 1000, tts_neurons_per_char: 1.0, llm_neurons_per_call: 3000, container_vcpu_s: 0.000020, container_gib_s: 0.0000025, container_vcpu: 1, container_gib: 6 };
var NUM_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, thousand: 1000, million: 1000000 };

function json(data, status) {
  return new Response(JSON.stringify(data, null, 2), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8" } });
}
function safeEqual(a, b) {
  var x = new TextEncoder().encode(String(a)), y = new TextEncoder().encode(String(b));
  if (x.length !== y.length) return false;
  var d = 0;
  for (var i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
function nowIso() { return new Date().toISOString(); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function b64FromBytes(u8) {
  var s = "", i = 0;
  for (; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------- pure helpers (tested in youtube.test.mjs) ----------
function splitSentences(text) {
  return String(text || "").replace(/\s+/g, " ").trim().split(/(?<=[.?!])\s+/).filter(Boolean);
}
function numTokens(text) {
  var t = String(text || "").toLowerCase().replace(/(\d),(\d{3})/g, "$1$2");
  t = t.replace(/\b([a-z]+)\b/g, function (m, w) { return Object.prototype.hasOwnProperty.call(NUM_WORDS, w) ? String(NUM_WORDS[w]) : m; });
  var out = t.match(/\d+(?:\.\d+)?/g) || [];
  return out.map(function (x) { return String(parseFloat(x)); });
}
function beatStrings(b) {
  var out = [b.narr];
  ["lines", "items"].forEach(function (k) { if (Array.isArray(b[k])) b[k].forEach(function (x) { out.push(x); }); });
  ["left", "right", "value", "label", "need_label", "have_label", "axis_label", "verdict", "a", "b"].forEach(function (k) { if (typeof b[k] === "string") out.push(b[k]); });
  if (Array.isArray(b.bars)) b.bars.forEach(function (r) { if (Array.isArray(r) && typeof r[3] === "string") out.push(r[3]); });
  return out.filter(function (x) { return typeof x === "string"; });
}
function articleText(article) {
  var parts = [article.title || "", article.short || ""];
  (article.sections || []).forEach(function (s) { parts.push(s.h || ""); (s.paras || []).forEach(function (p) { parts.push(p); }); });
  return parts.join("\n");
}
function shapeOk(b) {
  if (!b || typeof b !== "object" || KINDS.indexOf(b.kind) < 0 || typeof b.narr !== "string" || !b.narr.trim()) return false;
  var strs = function (a, n) { return Array.isArray(a) && a.length >= 1 && a.length <= n && a.every(function (x) { return typeof x === "string" && x.length <= 60; }); };
  var s = function (x) { return typeof x === "string" && x.length > 0 && x.length <= 60; };
  var n01 = function (x) { return typeof x === "number" && x >= 0 && x <= 1; };
  switch (b.kind) {
    case "hook": return strs(b.lines, 6) && (b.hi === undefined || (Array.isArray(b.hi) && b.hi.every(function (i) { return Number.isInteger(i) && i >= 0 && i < b.lines.length; })));
    case "versus": return s(b.left) && s(b.right);
    case "payoff": return Array.isArray(b.bars) && b.bars.length >= 2 && b.bars.length <= 3 && b.bars.every(function (r) { return Array.isArray(r) && r.length === 4 && typeof r[1] === "number" && Math.abs(r[1]) <= 3 && s(r[3]); });
    case "meter": return n01(b.need) && n01(b.have) && s(b.need_label) && s(b.have_label) && s(b.axis_label) && s(b.verdict);
    case "dots": return n01(b.from) && n01(b.to) && s(b.a) && s(b.b);
    case "points": return strs(b.items, 4);
    case "stat": return s(b.value) && s(b.label);
  }
  return false;
}
// Drops every beat whose shape is wrong or whose numbers are not in the article; unsupportedIdx (from the checker model) drops the rest.
function validateBeats(beats, article, unsupportedIdx) {
  var known = {};
  numTokens(articleText(article)).forEach(function (t) { known[t] = 1; });
  var kept = [], dropped = [], words = 0;
  (Array.isArray(beats) ? beats : []).forEach(function (b, i) {
    if (!shapeOk(b)) { dropped.push({ i: i, why: "shape" }); return; }
    if ((unsupportedIdx || []).indexOf(i) >= 0) { dropped.push({ i: i, why: "claim-not-in-article" }); return; }
    var bad = numTokens(beatStrings(b).join(" \n ")).filter(function (t, k, arr) { return !known[t] && arr.indexOf(t) === k; });
    if (bad.length) { dropped.push({ i: i, why: "number-not-in-article", numbers: bad }); return; }
    var w = b.narr.trim().split(/\s+/).length;
    if (words + w > MAX_NARR_WORDS) { dropped.push({ i: i, why: "too-long" }); return; }
    words += w;
    kept.push(b);
  });
  return { kept: kept, dropped: dropped, words: words };
}
function monthKey(d) { return (d || new Date()).toISOString().slice(0, 7); }
function spendUsd(kind, units) {
  if (kind === "tts") return units * PRICES.tts_neurons_per_char * PRICES.neuron_usd;
  if (kind === "llm") return units * PRICES.llm_neurons_per_call * PRICES.neuron_usd;
  if (kind === "container") return units * (PRICES.container_vcpu * PRICES.container_vcpu_s + PRICES.container_gib * PRICES.container_gib_s);
  return 0;
}
function spendAllows(monthUsd) { return monthUsd < SPEND_STOP_USD; }
function capAllows(startedLast7d) { return startedLast7d < WEEKLY_CAP; }
function nextCandidate(rows, takenSlugs) {
  var taken = {};
  (takenSlugs || []).forEach(function (s) { taken[s] = 1; });
  for (var i = 0; i < rows.length; i++) if (!taken[rows[i].slug]) return rows[i];
  return null;
}
function parseSections(body) {
  try { var a = JSON.parse(body); return Array.isArray(a) ? a.filter(function (s) { return s && Array.isArray(s.paras); }) : []; } catch (e) { return []; }
}
function jsonFromText(t) {
  var s = String(t || "").replace(/<think>[\s\S]*?<\/think>/g, "");
  var a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no JSON in model reply");
  return JSON.parse(s.slice(a, b + 1));
}
function buildMetadata(article, slug, title, durationS) {
  var url = BASE + "/papers/" + slug + "/quickread";
  return {
    title: (String(title || article.title).slice(0, 80) + " #Shorts").slice(0, 100),
    description: String(article.short || "").slice(0, 600) + "\n\nFull plain-language article (no jargon, no mathematics): " + url + "\nPaper: " + BASE + "/papers/" + slug +
      "\n\nAI disclosure: the voice is synthetic (text-to-speech) and the animations are generated from the plain-language version of a QNFO paper.\n#Shorts #science #research",
    tags: ["Shorts", "science", "research explained", "QNFO"], categoryId: "27", privacyStatus: PRIVACY, containsSyntheticMedia: true, madeForKids: false, duration_s: durationS
  };
}

// ---------- ledger ----------
async function logEvent(env, kind, text, meta, status) {
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), nowIso(), String(kind).slice(0, 200), String(text || "").slice(0, 2000), meta ? JSON.stringify(meta).slice(0, 4000) : null, WORKER, status || "ok").run();
  } catch (e) { console.error(JSON.stringify({ worker: WORKER, where: "logEvent", error: String(e && e.message || e) })); }
}
async function addSpend(env, rowId, kind, units, note) {
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO youtube_spend (month, row_id, kind, units, usd, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
      .bind(monthKey(), rowId, kind, units, spendUsd(kind, units), note || null, nowIso()).run();
  } catch (e) { console.error(JSON.stringify({ worker: WORKER, where: "addSpend", error: String(e && e.message || e) })); }
}
async function monthSpend(env) {
  var r = await env.QNFO_AUDIT.prepare("SELECT COALESCE(SUM(usd), 0) AS usd FROM youtube_spend WHERE month = ?1").bind(monthKey()).first();
  return r ? Number(r.usd) : 0;
}
async function ensureTable(env) {
  await env.QNFO_AUDIT.prepare("CREATE TABLE IF NOT EXISTS youtube_spend (id INTEGER PRIMARY KEY AUTOINCREMENT, month TEXT NOT NULL, row_id INTEGER, kind TEXT NOT NULL, units REAL NOT NULL, usd REAL NOT NULL, note TEXT, created_at TEXT NOT NULL)").run();
  await env.QNFO_AUDIT.prepare("CREATE TABLE IF NOT EXISTS youtube_videos (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, rev TEXT, state TEXT NOT NULL, title TEXT, attempts INTEGER NOT NULL DEFAULT 0, note TEXT, duration_s REAL, video_id TEXT, privacy TEXT, synthetic INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, uploaded_at TEXT, views INTEGER)").run();
}
async function setState(env, id, state, fields) {
  var f = fields || {};
  await env.QNFO_AUDIT.prepare("UPDATE youtube_videos SET state = ?1, note = ?2, title = COALESCE(?3, title), duration_s = COALESCE(?4, duration_s), video_id = COALESCE(?5, video_id), privacy = COALESCE(?6, privacy), uploaded_at = COALESCE(?7, uploaded_at), attempts = attempts + ?8, updated_at = ?9 WHERE id = ?10")
    .bind(state, f.note == null ? null : String(f.note).slice(0, 1500), f.title || null, f.duration_s == null ? null : f.duration_s, f.video_id || null, f.privacy || null, f.uploaded_at || null, f.bump ? 1 : 0, nowIso(), id).run();
}

// ---------- stages ----------
async function loadArticle(env, slug) {
  var r = await env.LIVING_PAPER.prepare("SELECT slug, rev, title, short, body FROM plain_article WHERE slug = ?1 AND status = 'ok'").bind(slug).first();
  if (!r) throw new Error("plain_article row missing or not ok: " + slug);
  return { slug: r.slug, rev: r.rev, title: r.title, short: r.short, sections: parseSections(r.body) };
}
function modelText(w) {
  return (w && (typeof w.response === "string" ? w.response : (w.choices && w.choices[0] && w.choices[0].message && w.choices[0].message.content))) || "";
}
// YT-DIRECTOR-1: the first reply that holds JSON wins; the order is qnfo-ai (router), then Workers AI kimi, then gpt-oss, so one model that
// answers with prose, an empty reply or only reasoning does not strand a paper. The failure note carries a snippet of each reply.
async function aiJson(env, system, user, maxTokens) {
  var msgs = [{ role: "system", content: system }, { role: "user", content: user }], notes = [];
  var sources = [];
  if (env.QNFO_AI && typeof env.QNFO_AI.fetch === "function") sources.push({ n: "qnfo-ai", run: async function () {
    var r = await env.QNFO_AI.fetch("https://qnfo-ai.internal/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "auto", messages: msgs, max_tokens: maxTokens, stream: false, temperature: 0.3 }) });
    if (!r.ok) throw new Error("http " + r.status + " " + (await r.text()).slice(0, 120));
    return modelText(await r.json());
  } });
  sources.push({ n: "kimi", run: async function () { return modelText(await env.AI.run(WRITE_FALLBACK_MODEL, { messages: msgs, max_tokens: maxTokens, reasoning_effort: "none", temperature: 0.3 })); } });
  sources.push({ n: "gpt-oss", run: async function () { return modelText(await env.AI.run(CHECK_MODEL, { messages: msgs, max_tokens: maxTokens + 1500, reasoning_effort: "low", temperature: 0.3 })); } });
  for (var i = 0; i < sources.length; i++) {
    try {
      var t = await sources[i].run();
      var j = jsonFromText(t);
      if (j && Array.isArray(j.beats)) return { json: j, source: sources[i].n };
      notes.push(sources[i].n + ": no beats array");
    } catch (e) { notes.push(sources[i].n + ": " + String(e && e.message || e).slice(0, 140)); }
  }
  throw new Error("director: " + notes.join(" | ").slice(0, 700));
}
function directorPrompt() {
  return "You turn a plain-language article into a 45-55 second vertical video script: 5 to 7 beats. Output JSON only: {\"title\":\"<=70 chars, plain\",\"beats\":[...]}.\n" +
    "Each beat: {\"kind\":K,\"narr\":\"1-2 short spoken sentences\", ...fields}. Kinds and fields:\n" +
    "hook {lines:[<=5 short lines shown big], hi:[indexes of lines to highlight]} (first beat, a question or surprising claim from the article)\n" +
    "points {items:[2-4 short statements, each <=40 chars]}\n" +
    "stat {value:\"a figure that is in the article\", label:\"what it counts\"}\n" +
    "versus {left:\"<=20 chars\", right:\"<=20 chars\"} (two things the article contrasts)\n" +
    "payoff {bars:[[x,value,\"#2EC4B6\",\"label\"],...]} x in -2.4,0,2.4; value -2..3 (only when the article gives outcomes)\n" +
    "meter {need:0-1, have:0-1, need_label, have_label, axis_label, verdict} (only when the article gives a threshold and an actual value)\n" +
    "dots {from:0-1, to:0-1, a:\"group\", b:\"group\"} (only when the article describes a share changing)\n" +
    "RULES: use ONLY facts, numbers and claims that are written in the article; no new numbers, no outside facts, no hype; plain words; do not write a closing beat (a link card is added after yours); narration reads naturally aloud.";
}
async function stageDirect(env, row) {
  var article = await loadArticle(env, row.slug);
  var text = article.title + "\nSummary: " + article.short + "\n\n" + article.sections.map(function (s) { return "## " + s.h + "\n" + s.paras.join("\n"); }).join("\n\n");
  var dj = await aiJson(env, directorPrompt(), text.slice(0, 9000), 2500);
  var spec = dj.json;
  await addSpend(env, row.id, "llm", 2, "director " + dj.source + " + checker");
  var pre = validateBeats(spec.beats, article, []);
  var unsupported = [];
  if (pre.kept.length) {
    var chk = await env.AI.run(CHECK_MODEL, {
      messages: [
        { role: "system", content: "You check video narration against its source article. For each numbered narration, decide if EVERY factual claim in it is stated in the article. Reply JSON only: {\"unsupported\":[numbers of narrations with any claim not in the article]}." },
        { role: "user", content: "ARTICLE:\n" + text.slice(0, 9000) + "\n\nNARRATIONS:\n" + (spec.beats || []).map(function (b, i) { return i + ". " + (b && b.narr); }).join("\n") }],
      max_tokens: 800, reasoning_effort: "low", temperature: 0
    });
    var ct = chk && (chk.response || (chk.choices && chk.choices[0] && chk.choices[0].message && chk.choices[0].message.content));
    var cj = jsonFromText(typeof ct === "string" ? ct : JSON.stringify(ct || {}));
    unsupported = (Array.isArray(cj.unsupported) ? cj.unsupported : []).map(Number);
  }
  var v = validateBeats(spec.beats, article, unsupported);
  await env.MEDIA.put("youtube/" + row.id + "/beats.json", JSON.stringify({ title: spec.title, kept: v.kept, dropped: v.dropped, checker_unsupported: unsupported }), { httpMetadata: { contentType: "application/json" } });
  if (v.kept.length < MIN_CONTENT_BEATS) {
    await setState(env, row.id, "rejected", { note: "director left " + v.kept.length + " supported beats; dropped " + JSON.stringify(v.dropped).slice(0, 600) });
    return null;
  }
  var cta = { kind: "cta", narr: "Read the full plain-language version at papers dot qnfo dot org.", title: "Read it free", url: "papers.qnfo.org", sub: "No jargon. No mathematics." };
  var beats = v.kept.concat([cta]);
  await setState(env, row.id, "directed", { title: String(spec.title || article.title).slice(0, 80), note: "beats " + beats.length + ", dropped " + v.dropped.length });
  return beats;
}
async function ttsSentence(env, text) {
  var r = await env.AI.run(TTS_MODEL, { prompt: text, lang: "en" });
  if (r && typeof r.audio === "string") return r.audio;
  if (r instanceof ArrayBuffer) return b64FromBytes(new Uint8Array(r));
  if (r && r.byteLength !== undefined) return b64FromBytes(new Uint8Array(r));
  throw new Error("TTS returned no audio: " + JSON.stringify(r).slice(0, 120));
}
async function stageAudio(env, row, beats) {
  var out = [];
  for (var i = 0; i < beats.length; i++) {
    var b = Object.assign({}, beats[i]), ss = [];
    var sents = splitSentences(b.narr);
    for (var j = 0; j < sents.length; j++) ss.push({ text: sents[j], audio_b64: await ttsSentence(env, sents[j]) });
    b.sentences = ss;
    out.push(b);
  }
  var chars = 0;
  out.forEach(function (b) { b.sentences.forEach(function (s) { chars += s.text.length; }); });
  await addSpend(env, row.id, "tts", chars, "melotts characters");
  await env.MEDIA.put("youtube/" + row.id + "/job.json", JSON.stringify({ id: String(row.id), slug: row.slug, title: row.title, beats: out }), { httpMetadata: { contentType: "application/json" } });
  await setState(env, row.id, "audio", { note: "tts " + out.length + " beats" });
}
function renderStub(env) { return env.RENDER.get(env.RENDER.idFromName("default")); }
async function stageSubmit(env, row) {
  var obj = await env.MEDIA.get("youtube/" + row.id + "/job.json");
  if (!obj) throw new Error("job.json missing in R2");
  var job = JSON.parse(await obj.text());
  var r = await renderStub(env).fetch("https://render.internal/submit", { method: "POST", body: JSON.stringify({ id: String(row.id), job: job }) });
  if (!r.ok) throw new Error("container submit " + r.status + ": " + (await r.text()).slice(0, 300));
  await setState(env, row.id, "rendering", { note: "submitted " + nowIso() });
}
async function stagePoll(env, row, deadline) {
  for (var i = 0; i < RENDER_POLLS; i++) {
    if (deadline && Date.now() > deadline) return false;
    var r = await renderStub(env).fetch("https://render.internal/poll?id=" + row.id);
    var j = await r.json().catch(function () { return {}; });
    if (j.state === "done") {
      var d = await renderStub(env).fetch("https://render.internal/download?id=" + row.id);
      if (!d.ok) throw new Error("container download " + d.status);
      var bytes = await d.arrayBuffer();
      var t0 = Date.parse(String(row.note || "").replace("submitted ", ""));
      if (t0) await addSpend(env, row.id, "container", Math.max(1, Math.round((Date.now() - t0) / 1000)), "wall seconds submit to done");
      await env.MEDIA.put("youtube/" + row.id + "/short.mp4", bytes, { httpMetadata: { contentType: "video/mp4" } });
      await setState(env, row.id, "rendered", { duration_s: Number(j.duration_s) || null, note: "rendered " + bytes.byteLength + " bytes" });
      return true;
    }
    if (j.state === "error") throw new Error("render error: " + String(j.error || "").slice(-600));
    if (j.state === "unknown") { await setState(env, row.id, "audio", { note: "container lost the job; resubmitting" }); return false; }
    await sleep(15000);
  }
  return false; // still rendering: the next tick resumes polling
}
async function accessToken(env) {
  var r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.YT_CLIENT_ID, client_secret: env.YT_CLIENT_SECRET, refresh_token: env.YT_REFRESH_TOKEN, grant_type: "refresh_token" }).toString() });
  var j = await r.json().catch(function () { return {}; });
  if (!r.ok || !j.access_token) throw new Error("oauth refresh " + r.status + ": " + JSON.stringify(j).slice(0, 300));
  return j.access_token;
}
async function stageUpload(env, row) {
  if (!env.YT_CLIENT_ID || !env.YT_CLIENT_SECRET || !env.YT_REFRESH_TOKEN) {
    await setState(env, row.id, "rendered", { note: "awaiting-youtube-credentials: video is in R2 youtube/" + row.id + "/short.mp4" });
    return false;
  }
  var article = await loadArticle(env, row.slug);
  var meta = buildMetadata(article, row.slug, row.title, row.duration_s);
  var obj = await env.MEDIA.get("youtube/" + row.id + "/short.mp4");
  if (!obj) throw new Error("short.mp4 missing in R2");
  var bytes = await obj.arrayBuffer();
  var tok = await accessToken(env);
  var init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { authorization: "Bearer " + tok, "content-type": "application/json; charset=UTF-8", "x-upload-content-type": "video/mp4", "x-upload-content-length": String(bytes.byteLength) },
    body: JSON.stringify({ snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: meta.categoryId }, status: { privacyStatus: PRIVACY, selfDeclaredMadeForKids: false, containsSyntheticMedia: true } })
  });
  var loc = init.headers.get("location");
  if (!init.ok || !loc) throw new Error("youtube init " + init.status + ": " + (await init.text()).slice(0, 400));
  var up = await fetch(loc, { method: "PUT", headers: { "content-type": "video/mp4", "content-length": String(bytes.byteLength) }, body: bytes });
  var uj = await up.json().catch(function () { return {}; });
  if (!up.ok || !uj.id) throw new Error("youtube upload " + up.status + ": " + JSON.stringify(uj).slice(0, 400));
  for (var w = 0; w < 3; w++) {
    try { await setState(env, row.id, "uploaded", { video_id: uj.id, privacy: (uj.status && uj.status.privacyStatus) || PRIVACY, uploaded_at: nowIso(), note: "https://youtube.com/shorts/" + uj.id }); break; }
    catch (e) { await logEvent(env, "youtube.ledger_retry", row.slug + " video " + uj.id, { error: String(e && e.message || e).slice(0, 200) }, "warn"); await sleep(1500); }
  }
  await logEvent(env, "youtube.uploaded", row.slug, { video_id: uj.id, privacy: uj.status && uj.status.privacyStatus, row: row.id }, "ok");
  return true;
}

async function advance(env, row, deadline) {
  for (var guard = 0; guard < 8 && Date.now() < deadline; guard++) {
    row = await env.QNFO_AUDIT.prepare("SELECT * FROM youtube_videos WHERE id = ?1").bind(row.id).first();
    try {
      if (row.state === "queued") { if (!(await stageDirect(env, row))) return row.id; }
      else if (row.state === "directed") {
        var bo = await env.MEDIA.get("youtube/" + row.id + "/beats.json");
        var beats = JSON.parse(await bo.text()).kept.concat([{ kind: "cta", narr: "Read the full plain-language version at papers dot qnfo dot org.", title: "Read it free", url: "papers.qnfo.org", sub: "No jargon. No mathematics." }]);
        await stageAudio(env, row, beats);
      }
      else if (row.state === "audio") await stageSubmit(env, row);
      else if (row.state === "rendering") { if (!(await stagePoll(env, row, deadline))) { if ((await env.QNFO_AUDIT.prepare("SELECT state FROM youtube_videos WHERE id = ?1").bind(row.id).first()).state === "rendering") return row.id; } }
      else if (row.state === "rendered") { if (!(await stageUpload(env, row))) return row.id; }
      else return row.id; // uploaded, rejected, failed
    } catch (e) {
      var msg = String(e && e.message || e);
      var attempts = (row.attempts || 0) + 1;
      var state = attempts >= MAX_ATTEMPTS ? "failed" : (row.state === "rendering" ? "audio" : row.state);
      // YT-FM-RENDER-1: the container failed twice on this job; the job stays in R2 for youtube-render-runner.yml (a GitHub-runner render), and this row stops blocking new papers.
      if (attempts >= 2 && attempts < MAX_ATTEMPTS && (row.state === "audio" || row.state === "rendering")) state = "runner_pending";
      await setState(env, row.id, state, { note: row.state + ": " + msg, bump: true });
      await logEvent(env, "youtube.stage_error", row.slug + " " + row.state, { error: msg.slice(0, 500), attempts: attempts }, "error");
      return row.id;
    }
  }
  return row.id;
}

async function refreshMetric(env) {
  var r = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM youtube_videos WHERE state = 'uploaded' AND uploaded_at >= ?1").bind(new Date(Date.now() - 30 * 86400000).toISOString()).first();
  await env.QNFO_AUDIT.prepare("UPDATE metric_registry SET last_value = ?1, last_refreshed = ?2, state = 'MEASURED' WHERE metric = 'youtube_videos_30d'").bind(String(r ? r.n : 0), nowIso()).run();
  var sp = await monthSpend(env);
  await env.QNFO_AUDIT.prepare("UPDATE metric_registry SET last_value = ?1, last_refreshed = ?2, state = 'MEASURED' WHERE metric = 'youtube_spend_usd_month'").bind(sp.toFixed(4), nowIso()).run();
  return r ? r.n : 0;
}
async function runTick(env, opts) {
  var deadline = Date.now() + ((opts && opts.budgetMs) || 13 * 60 * 1000);
  await ensureTable(env);
  var open = await env.QNFO_AUDIT.prepare("SELECT * FROM youtube_videos WHERE state IN ('queued','directed','audio','rendering','rendered') ORDER BY id LIMIT 1").first();
  var res = { resumed: null, started: null };
  var spent = await monthSpend(env);
  res.month_spend_usd = Math.round(spent * 1e4) / 1e4;
  if (!spendAllows(spent)) {
    res.skipped = "spend-cap: month spend " + spent.toFixed(2) + " >= " + SPEND_STOP_USD;
    await logEvent(env, "youtube.spend_cap", res.skipped, { month: monthKey(), usd: spent }, "warn");
    res.uploaded_30d = await refreshMetric(env);
    return res;
  }
  if (open) { res.resumed = await advance(env, open, deadline); }
  else {
    var started = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM youtube_videos WHERE state != 'rejected' AND created_at >= ?1").bind(new Date(Date.now() - 7 * 86400000).toISOString()).first();
    if (capAllows(started ? started.n : 0) || (opts && opts.ignoreCap)) {
      var cands = (await env.LIVING_PAPER.prepare("SELECT slug, rev FROM plain_article WHERE status = 'ok' AND body IS NOT NULL AND words >= 200 ORDER BY generated_at DESC LIMIT 40").all()).results || [];
      var taken = ((await env.QNFO_AUDIT.prepare("SELECT slug FROM youtube_videos").all()).results || []).map(function (x) { return x.slug; });
      var c = nextCandidate(cands, taken);
      if (c) {
        var ins = await env.QNFO_AUDIT.prepare("INSERT INTO youtube_videos (slug, rev, state, privacy, synthetic, created_at, updated_at) VALUES (?1, ?2, 'queued', ?3, 1, ?4, ?4)").bind(c.slug, c.rev, PRIVACY, nowIso()).run();
        res.started = await advance(env, { id: ins.meta.last_row_id }, deadline);
      }
    }
  }
  res.uploaded_30d = await refreshMetric(env);
  try { await env.QNFO_AUDIT.prepare("INSERT OR REPLACE INTO fleet_heartbeat (worker, version, ts, ok) VALUES (?1, ?2, ?3, 1)").bind(WORKER, VERSION, nowIso()).run(); } catch (e) { console.error(JSON.stringify({ worker: WORKER, where: "heartbeat", error: String(e && e.message || e) })); }
  return res;
}

// ---------- Container (Durable Object): starts the render image and proxies to its HTTP server on :8080 ----------
class RenderContainer {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this._starting = null; }
  async ensureStarted() {
    if (!this.ctx.container) throw new Error("CONTAINER-CONFIG-MISSING-1: ctx.container is undefined - the [[containers]] block is not attached to this deployment");
    if (!this.ctx.container.running) {
      if (!this._starting) this._starting = Promise.resolve(this.ctx.container.start({ enableInternet: false })).finally(() => { this._starting = null; });
      await this._starting;
    }
    var port = this.ctx.container.getTcpPort(8080), last = null;
    for (var i = 0; i < 30; i++) {
      try { var r = await port.fetch("http://container/health"); if (r.ok) return port; } catch (e) { last = e; }
      await sleep(2000);
    }
    throw new Error("container did not answer /health: " + String(last && last.message || last));
  }
  async fetch(request) {
    var u = new URL(request.url);
    try {
      if (u.pathname === "/state") return json({ configured: !!this.ctx.container, running: !!(this.ctx.container && this.ctx.container.running) });
      var port = await this.ensureStarted();
      if (u.pathname === "/submit") {
        var r = await port.fetch("http://container/render", { method: "POST", headers: { "content-type": "application/json" }, body: await request.text() });
        return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
      }
      if (u.pathname === "/poll") return port.fetch("http://container/result?id=" + encodeURIComponent(u.searchParams.get("id") || ""));
      if (u.pathname === "/download") return port.fetch("http://container/result?download=1&id=" + encodeURIComponent(u.searchParams.get("id") || ""));
      return json({ ok: false, error: "not found" }, 404);
    } catch (e) {
      return json({ ok: false, error: String(e && e.message || e) }, 500);
    }
  }
}

async function status(env) {
  var out = { ok: true, worker: WORKER, version: VERSION, privacy: PRIVACY, weekly_cap: WEEKLY_CAP, spend_stop_usd: SPEND_STOP_USD, month_spend_usd: await monthSpend(env).catch(function () { return null; }), credentials: !!(env.YT_CLIENT_ID && env.YT_CLIENT_SECRET && env.YT_REFRESH_TOKEN) };
  try {
    out.rows = ((await env.QNFO_AUDIT.prepare("SELECT id, slug, state, attempts, video_id, privacy, duration_s, substr(note,1,200) AS note, created_at, uploaded_at FROM youtube_videos ORDER BY id DESC LIMIT 10").all()).results) || [];
  } catch (e) { out.rows = []; out.rows_error = String(e && e.message || e); }
  try { out.container = await (await renderStub(env).fetch("https://render.internal/state")).json(); } catch (e) { out.container = { error: String(e && e.message || e) }; }
  return out;
}

var worker_default = {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, worker: WORKER, version: VERSION });
    if (url.pathname === "/status") return json(await status(env));
    if (url.pathname === "/run" && request.method === "POST") {
      var tok = request.headers.get("x-run-token") || "";
      if (!env.YT_RUN_TOKEN || !safeEqual(tok, env.YT_RUN_TOKEN)) return json({ ok: false, error: "unauthorized" }, 401);
      var budget = Math.min(85, Math.max(10, Number(url.searchParams.get("budget_s")) || 80));
      try {
        var rr = await runTick(env, { ignoreCap: url.searchParams.get("ignore_cap") === "1", budgetMs: budget * 1000 });
        await logEvent(env, "youtube.run", JSON.stringify(rr), rr, "ok");
        return json({ ok: true, result: rr, status: await status(env) });
      } catch (e) {
        await logEvent(env, "youtube.run", String(e && e.message || e), null, "error");
        return json({ ok: false, error: String(e && e.message || e) }, 500);
      }
    }
    return json({ ok: false, error: "not found" }, 404);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runTick(env, {}).then(function (r) { return logEvent(env, "youtube.tick", JSON.stringify(r), r, "ok"); }).catch(function (e) { console.error(JSON.stringify({ worker: WORKER, where: "scheduled", error: String(e && e.message || e) })); return logEvent(env, "youtube.tick", String(e && e.message || e), null, "error"); }));
  }
};
export { RenderContainer, spendUsd, spendAllows, splitSentences, numTokens, validateBeats, capAllows, nextCandidate, parseSections, jsonFromText, buildMetadata, shapeOk, CRON_TABLE, VERSION };
export default worker_default;
