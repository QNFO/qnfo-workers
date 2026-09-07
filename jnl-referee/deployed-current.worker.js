// jnl-referee v0.1.0 - AI referee + decision engine for the AI-reviewed journal overlay (isolated jnl-* stack).
// Reviews Zenodo community records (aiscience), writes referee reports + deterministic decisions to D1 jnl-audit.
// Overlay-only: never stores paper bodies; never writes back to Zenodo (P6 needs curator token).
// PRECONDITION: env.AI (Workers AI), env.AUDIT (D1 jnl-audit), env.STATE (KV jnl-state), env.JNL_TOKEN secret.
// POSTCONDITION: jnl_reviews/jnl_decisions/jnl_review_log rows reflect the review outcome.

var VERSION = "0.5.0";
var MODELS_DEFAULT = "@cf/meta/llama-3.3-70b-instruct-fp8-fast,@cf/meta/llama-4-scout-17b-16e-instruct";
var UA = "jnl-referee/0.1.0 (QNFO AI-referee overlay; open-science)";
var FETCH_TIMEOUT_MS = 20000;
var TEXT_CAP = 18000;
var MAX_TOKENS = 2400;

var DDL = [
  "CREATE TABLE IF NOT EXISTS jnl_reviews (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, recid INTEGER NOT NULL UNIQUE, " +
    "status TEXT NOT NULL DEFAULT 'queued', decision TEXT, model TEXT, " +
    "score_soundness INTEGER, score_novelty INTEGER, score_clarity INTEGER, score_reproducibility INTEGER, " +
    "avg_score REAL, basis TEXT, text_chars INTEGER, fatal_flaws INTEGER DEFAULT 0, disagreement INTEGER DEFAULT 0, " +
    "report_md TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')), " +
    "updated_at TEXT DEFAULT (datetime('now')), ran_at TEXT)",
  "CREATE TABLE IF NOT EXISTS jnl_decisions (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, recid INTEGER NOT NULL UNIQUE, decision TEXT NOT NULL, " +
    "rationale TEXT, avg_score REAL, basis TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS jnl_review_log (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT DEFAULT (datetime('now')), recid INTEGER, kind TEXT, detail TEXT)",
  "CREATE TABLE IF NOT EXISTS jnl_submissions (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, recid INTEGER NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'queued', " +
    "note TEXT, source TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS jnl_links (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, a INTEGER NOT NULL, b INTEGER NOT NULL, " +
    "shared INTEGER DEFAULT 1, concepts TEXT, created_at TEXT DEFAULT (datetime('now')), UNIQUE(a, b))"
];

function json(data, status) {
  return new Response(JSON.stringify(data, null, 1), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" }
  });
}

async function ensureSchema(env) {
  var out = [];
  for (var i = 0; i < DDL.length; i++) {
    try { await env.AUDIT.prepare(DDL[i]).run(); out.push("ok"); }
    catch (e) { out.push(String(e && e.message || e)); }
  }
  return out;
}

function log(env, recid, kind, detail) {
  try {
    return env.AUDIT.prepare("INSERT INTO jnl_review_log (recid, kind, detail) VALUES (?, ?, ?)")
      .bind(recid || null, kind, String(detail || "").slice(0, 1000)).run();
  } catch (e) { return null; }
}

// Submission-intake helpers (P9 anti-abuse, v0.4.0)
function normalizeId(input) {
  var s = String(input || "").trim();
  var m = s.match(/[0-9]{5,9}/);
  return m ? Number(m[0]) : 0;
}
async function whoHash(header) {
  try {
    var h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(header || "anon"));
    var arr = new Uint8Array(h);
    return Array.prototype.slice.call(arr, 0, 8).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  } catch (e) { return "anon"; }
}
async function submitRateOk(env, who) {
  var cap = Number(env.JNL_SUBMIT_DAILY_CAP || 10);
  var key = "submit:" + dateKey(new Date()) + ":" + who;
  var cur = Number(await env.STATE.get(key) || 0);
  return { ok: cur < cap, cur: cur, cap: cap, key: key };
}
async function submitBump(env, who) {
  var key = "submit:" + dateKey(new Date()) + ":" + who;
  var cur = Number(await env.STATE.get(key) || 0) + 1;
  await env.STATE.put(key, String(cur), { expirationTtl: 90000 });
  return cur;
}
async function submitNew(env, recid, note, who) {
  await ensureSchema(env);
  var rec = await zenodoGet("https://zenodo.org/api/records/" + recid);
  var meta = rec.metadata || {};
  var dup = await env.AUDIT.prepare("SELECT recid FROM jnl_submissions WHERE recid = ?").bind(recid).first();
  var dupR = await env.AUDIT.prepare("SELECT recid FROM jnl_reviews WHERE recid = ?").bind(recid).first();
  if (dup || dupR) return { dup: true };
  await env.AUDIT.prepare("INSERT INTO jnl_records (recid, conceptrecid, doi, conceptdoi, version, title, modified, first_seen, last_checked) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now')) ON CONFLICT(recid) DO UPDATE SET title=excluded.title, doi=excluded.doi").bind(rec.id, rec.conceptrecid || null, rec.doi || null, rec.conceptdoi || null, meta.version || null, meta.title || null).run();
  await env.AUDIT.prepare("INSERT OR IGNORE INTO jnl_reviews (recid, status) VALUES (?, 'queued')").bind(recid).run();
  await env.AUDIT.prepare("INSERT INTO jnl_submissions (recid, note, source, status) VALUES (?, ?, ?, 'queued')").bind(recid, String(note || "").slice(0, 300), String(who).slice(0, 40)).run();
  await log(env, recid, "submitted", "author submission queued via intake (P9)");
  return { dup: false, doi: rec.doi || null, title: meta.title || null };
}

function stopSet() {
  return { the:1, of:1, and:1, a:1, an:1, for:1, in:1, on:1, to:1, from:1, by:1, with:1, at:1, or:1, as:1, into:1, its:1, their:1, this:1, that:1, is:1, are:1, be:1, was:1, were:1, not:1, no:1, how:1, what:1, why:1, when:1, which:1, via:1, per:1, under:1, over:1, between:1, across:1, new:1, one:1, two:1, three:1, model:1, models:1, study:1, studies:1, paper:1, using:1, use:1, used:1, first:1, second:1, case:1, cases:1, concept:1, concepts:1, towards:1, toward:1, framework:1, frameworks:1 };
}
function conceptsOf(title) {
  var s = String(title || "").toLowerCase();
  s = s.replace(/[^a-z0-9 ]/g, " ");
  var toks = s.split(/ +/);
  var stop = stopSet();
  var acc = {};
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i];
    if (t.length < 3) continue;
    if (stop[t]) continue;
    acc[t] = 1;
  }
  return Object.keys(acc).sort();
}
function sharedConcepts(a, b) {
  var i = 0; var j = 0; var shared = [];
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { shared.push(a[i]); i++; j++; }
    else if (a[i] < b[j]) i++;
    else j++;
  }
  return shared;
}
async function buildGraph(env) {
  await ensureSchema(env);
  var rows = await env.AUDIT.prepare("SELECT recid, title FROM jnl_records ORDER BY recid").all();
  var recs = rows.results || [];
  var concepts = {};
  for (var r = 0; r < recs.length; r++) { concepts[recs[r].recid] = conceptsOf(recs[r].title); }
  var added = 0;
  for (var i = 0; i < recs.length; i++) {
    for (var j = i + 1; j < recs.length; j++) {
      var shared = sharedConcepts(concepts[recs[i].recid], concepts[recs[j].recid]);
      if (!shared.length) continue;
      await env.AUDIT.prepare("INSERT OR IGNORE INTO jnl_links (a, b, shared, concepts) VALUES (?, ?, ?, ?)")
        .bind(recs[i].recid, recs[j].recid, shared.length, shared.join(",")).run();
      added++;
    }
  }
  return { nodes: recs.length, edges: added };
}

async function zenodoGet(url) {
  var res = await fetch(url, { headers: { accept: "application/json", "user-agent": UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  var txt = await res.text();
  if (!res.ok) throw new Error("zenodo HTTP " + res.status + " :: " + txt.slice(0, 180));
  return JSON.parse(txt);
}

function stripHtml(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

async function fetchRecord(recid) {
  var rec = await zenodoGet("https://zenodo.org/api/records/" + recid);
  var meta = rec.metadata || {};
  var desc = stripHtml(meta.description);
  var creators = (meta.creators || []).map(function (c) { return (c.name || "") + (c.affiliations && c.affiliations.length ? " (" + c.affiliations[0].name + ")" : ""); }).join("; ");
  var files = rec.files || [];
  var text = "";
  var fetchedKey = null;
  var textFiles = files.filter(function (f) { return /\.(md|markdown|txt|rst|tex|html?|json)$/i.test(f.key || ""); })
    .sort(function (a, b) { return (b.size || 0) - (a.size || 0); });
  if (textFiles.length) {
    var f = textFiles[0];
    try {
      var fres = await fetch(f.links && f.links.content ? f.links.content : f.links.self, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (fres.ok) { text = (await fres.text()).slice(0, TEXT_CAP); fetchedKey = f.key; }
    } catch (e) { text = ""; }
  }
  var hasPdf = files.some(function (f) { return /\.pdf$/i.test(f.key || ""); });
  return {
    recid: rec.id, doi: rec.doi || null, conceptdoi: rec.conceptdoi || null,
    version: meta.version || rec.metadata.version || null, title: meta.title || null,
    publication_date: meta.publication_date || null, license: (meta.license && meta.license.id) || null,
    creators: creators, description: desc, keywords: (meta.keywords || []).join(", "),
    file_keys: files.map(function (f) { return f.key; }),
    text: text, fetched_key: fetchedKey, text_chars: text.length, has_pdf: !!hasPdf, raw_size_chars: JSON.stringify(rec).length
  };
}

function extractText(out) {
  if (!out) return "";
  if (typeof out === "string") return out;
  if (out.choices && out.choices[0] && out.choices[0].message) return out.choices[0].message.content || "";
  if (out.response) return out.response;
  if (out.result && typeof out.result === "object") {
    if (out.result.response) return out.result.response;
    if (out.result.choices && out.result.choices[0] && out.result.choices[0].message) return out.result.choices[0].message.content || "";
  }
  if (Array.isArray(out) && out[0] && out[0].response) return out[0].response;
  return "";
}

function parseJsonObject(s) {
  var txt = String(s || "").trim();
  var a = txt.indexOf("{");
  var b = txt.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  var cand = txt.slice(a, b + 1);
  try { return JSON.parse(cand); } catch (e) {
    // last-resort brace repair attempt (unbalanced quotes rarely salvageable); return null to signal failure
    return null;
  }
}

function num(v, dflt) {
  var n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}
function clampScore(v) { return Math.max(1, Math.min(10, Math.round(num(v, 5)))); }
function arrOf(v) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === "string" && x.trim(); }).map(function (x) { return x.trim(); }) : []; }

async function aiRun(env, model, sys, usr) {
  var r = await env.AI.run(model, { messages: [{ role: "system", content: sys }, { role: "user", content: usr }], max_tokens: MAX_TOKENS });
  return extractText(r);
}

function reviewerSystem(role) {
  return "You are " + role + " for an open AI-reviewed journal that overlays Zenodo (no gatekeeping; content judged on merit). " +
    "You review ONLY the provided record content. Never fabricate quotes, citations, or external facts; quote only text present in the input and mark recalled items as uncertain. " +
    "Be fair to non-traditional and interdisciplinary work: judge internal consistency, clarity, evidence quality, novelty of framing, reproducibility, and honesty, not conformity to one field. " +
    "Return ONLY one JSON object (no markdown fences, no commentary) with exactly these keys: " +
    "score_soundness (integer 1-10), score_novelty (integer 1-10), score_clarity (integer 1-10), score_reproducibility (integer 1-10), " +
    "strengths (array of strings), weaknesses (array of strings), fatal_flaws (array of strings; empty array if none), " +
    "disconfirming_evidence (array of strings; empty if none found), limitations_of_review (array of strings), " +
    "confidence (\"high\"|\"medium\"|\"low\" with reason inside rationale), verdict (\"PUBLISH\"|\"REVISE\"|\"REJECT\"), rationale (string).";
}

function userPrompt(rec, withText) {
  var head = "RECORD METADATA\n" +
    "title: " + (rec.title || "(none)") + "\n" +
    "doi: " + (rec.doi || "(none)") + "\n" +
    "version: " + (rec.version || "(none)") + "\n" +
    "publication_date: " + (rec.publication_date || "(none)") + "\n" +
    "license: " + (rec.license || "(none)") + "\n" +
    "creators: " + (rec.creators || "(none)") + "\n" +
    "keywords: " + (rec.keywords || "(none)") + "\n\n" +
    "ABSTRACT/DESCRIPTION:\n" + (rec.description || "(none)").slice(0, 6000) + "\n\n";
  if (withText && rec.text) {
    head = head + "FULL TEXT (file: " + (rec.fetched_key || "unknown") + ", first " + rec.text.length + " chars):\n" + rec.text + "\n\n";
  } else {
    head = head + "NOTE: full-text file was not machine-readable in this pass (PDF or absent). Review on metadata/abstract only and say so in limitations_of_review.\n";
  }
  head = head + "Now produce the review JSON.";
  return head;
}

function decisionFrom(parsedList, basis) {
  var avgs = [];
  var fatal = false;
  var anyLowConfidence = false;
  for (var i = 0; i < parsedList.length; i++) {
    var p = parsedList[i];
    if (!p) continue;
    var sc = (clampScore(p.score_soundness) + clampScore(p.score_novelty) + clampScore(p.score_clarity) + clampScore(p.score_reproducibility)) / 4;
    avgs.push(sc);
    if (arrOf(p.fatal_flaws).length) fatal = true;
    if (String(p.confidence || "") === "low") anyLowConfidence = true;
  }
  if (!avgs.length) return { decision: "ERROR", avg: 0, fatal: false, disagreement: false, reason: "no model output parsed" };
  var avg = avgs.reduce(function (a, b) { return a + b; }, 0) / avgs.length;
  var disagreement = avgs.length > 1 && Math.abs(avgs[0] - avgs[1]) >= 2.5;
  var decision;
  var minAvg = Math.min.apply(null, avgs);
  var maxAvg = Math.max.apply(null, avgs);
  // Speculative-content guard (P3-CAL row 104, v0.2.0): a claim-heavy record that reviewers
  // themselves flag as speculative / lacking empirical evidence must not PUBLISH, regardless of scores.
  var speculative = parsedList.some(function (p) {
    if (!p) return false;
    var txt = arrOf(p.weaknesses).concat(arrOf(p.limitations_of_review), arrOf(p.fatal_flaws)).join(" ").toLowerCase();
    return /speculative|no (empirical|experimental|direct) (evidence|validation|test|support)|lacks (empirical|experimental) evidence|lack[s]? .{0,24}empirical (evidence|validation)|unfalsifiable|not (empirically|experimentally) (tested|validated|verified)|no (data|measurements?) (supporting|to support)/.test(txt);
  });
  if (fatal || avg < 4) decision = "REJECT";
  else if (basis !== "text") decision = "REVISE"; // metadata-only can never PUBLISH (anti rubber-stamp)
  else if (avg >= 7.5 && minAvg >= 6 && !anyLowConfidence && !speculative) decision = "PUBLISH";
  else decision = "REVISE";
  return { decision: decision, avg: Math.round(avg * 100) / 100, fatal: fatal, disagreement: disagreement, speculative: speculative, reason: "avg=" + Math.round(avg * 100) / 100 + " min=" + minAvg + " max=" + maxAvg + " fatal=" + fatal + " speculative=" + speculative + " basis=" + basis + " lowconf=" + anyLowConfidence };
}

function buildReport(rec, parsedList, dec, modelsUsed, basis) {
  var lines = [];
  lines.push("# AI Referee Report");
  lines.push("");
  lines.push("- Record: " + (rec.title || "(untitled)") + " (Zenodo recid " + rec.recid + ", doi " + (rec.doi || "n/a") + ", version " + (rec.version || "n/a") + ")");
  lines.push("- Review basis: " + (basis === "text" ? "metadata + full text (" + rec.text_chars + " chars, file " + rec.fetched_key + ")" : "metadata/abstract only (PDF or no textual file)"));
  lines.push("- Models: " + modelsUsed.join(", "));
  lines.push("- Decision (deterministic thresholds): **" + dec.decision + "** (mean score " + dec.avg + "/10)");
  if (dec.disagreement) lines.push("- Flag: reviewers disagreed by >= 2.5 points; decision follows pooled thresholds.");
  lines.push("");
  for (var i = 0; i < parsedList.length; i++) {
    var p = parsedList[i];
    if (!p) continue;
    lines.push("## Reviewer " + (i + 1) + " (" + (modelsUsed[i] || "model") + ")");
    lines.push("- Soundness " + clampScore(p.score_soundness) + " | Novelty " + clampScore(p.score_novelty) + " | Clarity " + clampScore(p.score_clarity) + " | Reproducibility " + clampScore(p.score_reproducibility) + " | Confidence " + (p.confidence || "n/a"));
    lines.push("- Verdict requested: " + (p.verdict || "n/a"));
    if (arrOf(p.strengths).length) { lines.push("- Strengths:"); arrOf(p.strengths).forEach(function (x) { lines.push("  - " + x.slice(0, 400)); }); }
    if (arrOf(p.weaknesses).length) { lines.push("- Weaknesses:"); arrOf(p.weaknesses).forEach(function (x) { lines.push("  - " + x.slice(0, 400)); }); }
    if (arrOf(p.fatal_flaws).length) { lines.push("- Fatal flaws:"); arrOf(p.fatal_flaws).forEach(function (x) { lines.push("  - " + x.slice(0, 400)); }); }
    if (arrOf(p.disconfirming_evidence).length) { lines.push("- Disconfirming evidence sought/found:"); arrOf(p.disconfirming_evidence).forEach(function (x) { lines.push("  - " + x.slice(0, 300)); }); }
    if (arrOf(p.limitations_of_review).length) { lines.push("- Limitations of this review:"); arrOf(p.limitations_of_review).forEach(function (x) { lines.push("  - " + x.slice(0, 300)); }); }
    lines.push("- Rationale: " + String(p.rationale || "").slice(0, 1200));
    lines.push("");
  }
  lines.push("## Decision rationale");
  lines.push(dec.reason);
  lines.push("");
  lines.push("## Honesty notes");
  lines.push("- These AI referee reports are advisory. They are not endorsements, certifications of correctness, or statements that a record is \"proven\". They are structured adversarial critiques produced by language models, with the failure modes each reviewer listed above.");
  lines.push("- Review basis is disclosed: metadata-only reviews never receive PUBLISH.");
  lines.push("- The overlay does not store paper bodies and does not write to Zenodo (curator write-back requires separate authorization).");
  return lines.join("\n");
}

async function runReview(env, recid, manual) {
  var schema = await ensureSchema(env);
  var models = String((env.JNL_MODELS || MODELS_DEFAULT)).split(",").map(function (x) { return x.trim(); }).filter(Boolean);
  var nowIso = new Date().toISOString();
  var rec;
  try { rec = await fetchRecord(recid); }
  catch (e) {
    await env.AUDIT.prepare("INSERT INTO jnl_reviews (recid, status, error, ran_at) VALUES (?, 'error', ?, ?) ON CONFLICT(recid) DO UPDATE SET status='error', error=excluded.error, ran_at=excluded.ran_at").bind(recid, "record fetch failed: " + String(e && e.message || e).slice(0, 500), nowIso).run();
    await log(env, recid, "run", "record fetch failed");
    return { ok: false, recid: recid, error: String(e && e.message || e).slice(0, 300) };
  }
  var basis = rec.text && rec.text.length >= 200 ? "text" : "metadata";
  var parsedList = [];
  var modelsUsed = [];
  var sys = reviewerSystem("an adversarial-but-fair referee");
  var usr = userPrompt(rec, basis === "text");
  for (var i = 0; i < models.length; i++) {
    try {
      var outTxt = await aiRun(env, models[i], sys, usr);
      var p = parseJsonObject(outTxt);
      if (p) { parsedList.push(p); modelsUsed.push(models[i]); }
      else { await log(env, recid, "parse", "model " + models[i] + " returned non-JSON len=" + outTxt.length); }
    } catch (e) {
      await log(env, recid, "model_error", "model " + models[i] + " :: " + String(e && e.message || e).slice(0, 300));
    }
  }
  if (!parsedList.length) {
    await env.AUDIT.prepare("INSERT INTO jnl_reviews (recid, status, basis, text_chars, error, ran_at) VALUES (?, 'error', ?, ?, ?, ?) ON CONFLICT(recid) DO UPDATE SET status='error', basis=excluded.basis, text_chars=excluded.text_chars, error=excluded.error, ran_at=excluded.ran_at").bind(recid, basis, rec.text_chars, "no model produced parseable JSON", nowIso).run();
    return { ok: false, recid: recid, error: "no model produced parseable JSON" };
  }
  var dec = decisionFrom(parsedList, basis);
  var report = buildReport(rec, parsedList, dec, modelsUsed, basis);
  var p0 = parsedList[0] || {};
  var sound = Math.round(parsedList.map(function (p) { return clampScore(p.score_soundness); }).reduce(function (a, b) { return a + b; }, 0) / parsedList.length);
  var novel = Math.round(parsedList.map(function (p) { return clampScore(p.score_novelty); }).reduce(function (a, b) { return a + b; }, 0) / parsedList.length);
  var clar = Math.round(parsedList.map(function (p) { return clampScore(p.score_clarity); }).reduce(function (a, b) { return a + b; }, 0) / parsedList.length);
  var repro = Math.round(parsedList.map(function (p) { return clampScore(p.score_reproducibility); }).reduce(function (a, b) { return a + b; }, 0) / parsedList.length);
  var fatalCount = parsedList.map(function (p) { return arrOf(p.fatal_flaws).length; }).reduce(function (a, b) { return a + b; }, 0);
  await env.AUDIT.prepare(
    "INSERT INTO jnl_reviews (recid, status, decision, model, score_soundness, score_novelty, score_clarity, score_reproducibility, avg_score, basis, text_chars, fatal_flaws, disagreement, report_md, ran_at) " +
    "VALUES (?, 'done', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
    "ON CONFLICT(recid) DO UPDATE SET status='done', decision=excluded.decision, model=excluded.model, score_soundness=excluded.score_soundness, score_novelty=excluded.score_novelty, score_clarity=excluded.score_clarity, score_reproducibility=excluded.score_reproducibility, avg_score=excluded.avg_score, basis=excluded.basis, text_chars=excluded.text_chars, fatal_flaws=excluded.fatal_flaws, disagreement=excluded.disagreement, report_md=excluded.report_md, ran_at=excluded.ran_at, error=NULL"
  ).bind(recid, dec.decision, modelsUsed.join(","), sound, novel, clar, repro, dec.avg, basis, rec.text_chars, fatalCount, dec.disagreement ? 1 : 0, report, nowIso).run();
  await env.AUDIT.prepare(
    "INSERT INTO jnl_decisions (recid, decision, rationale, avg_score, basis) VALUES (?, ?, ?, ?, ?) ON CONFLICT(recid) DO UPDATE SET decision=excluded.decision, rationale=excluded.rationale, avg_score=excluded.avg_score, basis=excluded.basis"
  ).bind(recid, dec.decision, (dec.reason + " | " + (p0.rationale || "")).slice(0, 1500), dec.avg, basis).run();
  await log(env, recid, "done", dec.decision + " avg=" + dec.avg + " basis=" + basis);
  return { ok: true, recid: recid, decision: dec.decision, avg_score: dec.avg, basis: basis, text_chars: rec.text_chars, models: modelsUsed, fatal_flaws: fatalCount, disagreement: dec.disagreement };
}

async function enqueueNew(env, limit) {
  var schema = await ensureSchema(env);
  var rows = await env.AUDIT.prepare(
    "SELECT r.recid FROM jnl_records r LEFT JOIN jnl_reviews v ON v.recid = r.recid WHERE v.recid IS NULL ORDER BY r.modified DESC LIMIT ?"
  ).bind(limit).all();
  var added = 0;
  for (var i = 0; i < rows.results.length; i++) {
    try {
      await env.AUDIT.prepare("INSERT OR IGNORE INTO jnl_reviews (recid, status) VALUES (?, 'queued')").bind(rows.results[i].recid).run();
      added++;
    } catch (e) { /* row exists */ }
  }
  return { scanned: rows.results.length, added: added };
}

async function pickQueued(env) {
  var row = await env.AUDIT.prepare("SELECT recid FROM jnl_reviews WHERE status='queued' OR (status='error' AND ran_at IS NOT NULL AND ran_at < datetime('now','-30 minutes')) ORDER BY id ASC LIMIT 1").first();
  return row ? row.recid : null;
}

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

async function dailyBudgetOk(env) {
  var key = "referee:daily:" + dateKey(new Date());
  var cap = Number(env.JNL_DAILY_CAP || 60);
  var cur = Number(await env.STATE.get(key) || 0);
  return { ok: cur < cap, cur: cur, cap: cap, key: key };
}
async function bumpDaily(env) {
  var key = "referee:daily:" + dateKey(new Date());
  var cur = Number(await env.STATE.get(key) || 0) + 1;
  await env.STATE.put(key, String(cur), { expirationTtl: 172800 });
  return cur;
}

async function authOk(request, env) {
  var secret = env.JNL_TOKEN || "";
  if (!secret) return false;
  var header = request.headers.get("x-jnl-token") || "";
  if (!header) return false;
  try {
    var enc = new TextEncoder();
    var a = await crypto.subtle.digest("SHA-256", enc.encode(secret));
    var b = await crypto.subtle.digest("SHA-256", enc.encode(header));
    var ab = new Uint8Array(a), bb = new Uint8Array(b);
    if (ab.length !== bb.length) return false;
    var diff = 0;
    for (var i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
    return diff === 0;
  } catch (e) { return false; }
}

async function handleScheduled(env) {
  try {
    var schema = await ensureSchema(env);
    var seeded = await enqueueNew(env, 50);
    var budget = await dailyBudgetOk(env);
    var ran = [];
    var processed = 0;
    while (processed < 2) {
      var again = await dailyBudgetOk(env);
      if (!again.ok) break;
      var recid = await pickQueued(env);
      if (!recid) break;
      var res = await runReview(env, recid, false);
      await bumpDaily(env);
      ran.push({ recid: recid, ok: !!res.ok, decision: res.decision || null });
      processed++;
    }
    return { ok: true, seeded: seeded, ran: ran, budget: budget };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e).slice(0, 300) };
  }
}

var index_default = {
  async scheduled(event, env, ctx) {
    var r = await handleScheduled(env);
    console.log("jnl-referee scheduled", JSON.stringify(r).slice(0, 800));
  },
  async fetch(request, env) {
    var url = new URL(request.url);
    var path = url.pathname;
    var method = request.method;
    try {
      if (path === "/health") {
        var schema = await ensureSchema(env);
        var counts = await env.AUDIT.prepare("SELECT (SELECT COUNT(*) FROM jnl_records) AS records, (SELECT COUNT(*) FROM jnl_reviews) AS reviews, (SELECT COUNT(*) FROM jnl_reviews WHERE status='queued') AS queued, (SELECT COUNT(*) FROM jnl_decisions) AS decisions, (SELECT MAX(ran_at) FROM jnl_reviews) AS last_run").first();
        return json({ ok: true, service: "jnl-referee", version: VERSION, schema: schema, counts: counts, models: String(env.JNL_MODELS || MODELS_DEFAULT) });
      }
      if (path === "/queue") {
        var limitQ = Math.min(Number(url.searchParams.get("limit") || 20), 100);
        var qrows = await env.AUDIT.prepare("SELECT recid, status, decision, created_at FROM jnl_reviews ORDER BY id DESC LIMIT ?").bind(limitQ).all();
        return json({ ok: true, count: qrows.results.length, rows: qrows.results });
      }
      if (path === "/reviews") {
        var rid = Number(url.searchParams.get("recid") || 0);
        var rowsR;
        if (rid) rowsR = await env.AUDIT.prepare("SELECT * FROM jnl_reviews WHERE recid = ?").bind(rid).all();
        else { var limR = Math.min(Number(url.searchParams.get("limit") || 20), 100); rowsR = await env.AUDIT.prepare("SELECT recid, status, decision, avg_score, basis, model, created_at, ran_at FROM jnl_reviews ORDER BY id DESC LIMIT ?").bind(limR).all(); }
        return json({ ok: true, count: rowsR.results.length, rows: rowsR.results });
      }
      if (path === "/decisions") {
        var ridD = Number(url.searchParams.get("recid") || 0);
        var limD = Math.min(Number(url.searchParams.get("limit") || 20), 100);
        var rowsD = ridD
          ? await env.AUDIT.prepare("SELECT recid, decision, avg_score, basis, rationale, created_at FROM jnl_decisions WHERE recid = ?").bind(ridD).all()
          : await env.AUDIT.prepare("SELECT recid, decision, avg_score, basis, rationale, created_at FROM jnl_decisions ORDER BY id DESC LIMIT ?").bind(limD).all();
        return json({ ok: true, count: rowsD.results.length, rows: rowsD.results });
      }
      if (path === "/graph") {
        var gNodes = await env.AUDIT.prepare("SELECT recid, title FROM jnl_records ORDER BY recid").all();
        var gEdges = await env.AUDIT.prepare("SELECT a, b, shared, concepts FROM jnl_links ORDER BY shared DESC LIMIT 300").all();
        return json({ ok: true, node_count: gNodes.results.length, edge_count: gEdges.results.length, nodes: gNodes.results, edges: gEdges.results });
      }
      if (path === "/submissions") {
        var limS = Math.min(Number(url.searchParams.get("limit") || 30), 100);
        var subR = await env.AUDIT.prepare("SELECT recid, status, note, created_at FROM jnl_submissions ORDER BY id DESC LIMIT ?").bind(limS).all();
        return json({ ok: true, count: subR.results.length, rows: subR.results });
      }
      if (path === "/" || path === "/index.html") {
        var escH = function (s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
        var recParam = Number(url.searchParams.get("recid") || 0);
        if (recParam) {
          var repR = await env.AUDIT.prepare("SELECT decision, avg_score, basis, report_md, created_at FROM jnl_reviews WHERE recid = ?").bind(recParam).first();
          if (!repR) return new Response("No review found for recid " + recParam, { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
          var repHtml = "<!doctype html><html><head><meta charset='utf-8'><title>AI Referee Report " + recParam + "</title></head><body style='font-family:system-ui;max-width:900px;margin:2rem auto;padding:0 1rem;line-height:1.5'><p><a href='/'>← index</a></p><h1>AI Referee Report — Zenodo recid " + recParam + "</h1><p>Decision: <strong>" + escH(repR.decision) + "</strong> · avg " + escH(String(repR.avg_score)) + " · basis " + escH(repR.basis) + " · " + escH(repR.created_at) + "</p><p><a href='https://zenodo.org/records/" + recParam + "'>Zenodo record</a></p><pre style='white-space:pre-wrap;background:#f7f7f7;padding:1rem;border-radius:6px'>" + escH(repR.report_md) + "</pre><footer style='opacity:.6;margin-top:2rem;border-top:1px solid #ddd;padding-top:.6rem'>Advisory AI referee report — not an endorsement or proof. Overlay stores no content.</footer></body></html>";
          return new Response(repHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
        }
        var idxRows = await env.AUDIT.prepare("SELECT d.recid, d.decision, d.avg_score, d.basis, d.created_at, r.title, r.doi FROM jnl_decisions d LEFT JOIN jnl_records r ON r.recid = d.recid ORDER BY d.id DESC LIMIT 100").all();
        var cards = "";
        for (var xi = 0; xi < idxRows.results.length; xi++) {
          var xr = idxRows.results[xi];
          cards = cards + "<li><a href='/?recid=" + xr.recid + "'>" + escH(xr.title || ("recid " + xr.recid)) + "</a> — <strong>" + escH(xr.decision) + "</strong> (avg " + escH(String(xr.avg_score)) + ", " + escH(xr.basis) + ", " + escH(xr.created_at) + ")" + (xr.doi ? " · <a href='https://doi.org/" + escH(xr.doi) + "'>DOI</a>" : "") + "</li>";
        }
        var idxHtml = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>QNFO AI-Reviewed Journal — open overlay on Zenodo aiscience</title></head><body style='font-family:system-ui;max-width:900px;margin:2rem auto;padding:0 1rem;line-height:1.5'><h1>QNFO AI-Reviewed Journal</h1><p>An open, AI-refereed overlay on the Zenodo <code>aiscience</code> community. Referee reports and decisions below are <strong>advisory</strong> — structured adversarial critiques by language models, not endorsements or proof. Paper bodies stay on Zenodo; this overlay stores no content.</p><p>Queue: " + (idxRows.results.length ? "" : "no decisions yet") + "</p><ul>" + cards + "</ul><footer style='opacity:.6;margin-top:2rem;border-top:1px solid #ddd;padding-top:.6rem'>Deterministic decision thresholds · metadata-only reviews never PUBLISH · overlay-only (no Zenodo write-back).</footer></body></html>";
        return new Response(idxHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      if (method === "POST" && (path === "/enqueue" || path === "/seed" || path === "/run" || path === "/run-next" || path === "/cal" || path === "/submit" || path === "/rebuild-graph")) {
        var authed = await authOk(request, env);
        if (!authed) return json({ ok: false, error: "unauthorized" }, 401);
        if (path === "/rebuild-graph") {
          var gRes = await buildGraph(env);
          return json({ ok: true, graph: gRes });
        }
        if (path === "/submit") {
          var bodyS = {};
          try { bodyS = await request.json(); } catch (e) {}
          var recidS = normalizeId(bodyS.id || url.searchParams.get("id") || "");
          if (!recidS) return json({ ok: false, error: "id required (recid, zenodo DOI, or zenodo URL)" }, 400);
          var whoS = await whoHash(request.headers.get("x-jnl-token") || "");
          var rlS = await submitRateOk(env, whoS);
          if (!rlS.ok) return json({ ok: false, error: "submission rate limit reached", limit: rlS }, 429);
          var resS;
          try { resS = await submitNew(env, recidS, bodyS.note, whoS); }
          catch (e2) { return json({ ok: false, error: "zenodo lookup failed: " + String(e2 && e2.message || e2).slice(0, 200) }, 502); }
          if (resS.dup) return json({ ok: true, duplicate: true, recid: recidS, note: "already queued or reviewed" });
          await submitBump(env, whoS);
          return json({ ok: true, accepted: true, recid: recidS, doi: resS.doi, title: resS.title, note: "queued for AI referee; runs on the cron cycle (review is advisory)" });
        }
        if (path === "/enqueue" || path === "/seed") {
          var body = {};
          try { body = await request.json(); } catch (e) {}
          var lim = path === "/seed" ? 200 : Math.min(Number(body.limit || 20), 200);
          var seedRes = await enqueueNew(env, lim);
          return json({ ok: true, seeded: seedRes });
        }
        if (path === "/run") {
          var bodyR = {};
          try { bodyR = await request.json(); } catch (e) {}
          var recidR = Number(bodyR.recid || url.searchParams.get("recid") || 0);
          if (!recidR) return json({ ok: false, error: "recid required" }, 400);
          var budgetRun = await dailyBudgetOk(env);
          if (!budgetRun.ok) return json({ ok: false, error: "daily budget reached", budget: budgetRun }, 429);
          var resRun = await runReview(env, recidR, true);
          if (resRun.ok) await bumpDaily(env);
          return json(resRun, resRun.ok ? 200 : 500);
        }
        if (path === "/run-next") {
          var bodyN = {};
          try { bodyN = await request.json(); } catch (e) {}
          var n = Math.min(Math.max(Number(bodyN.n || 1), 1), 3);
          var outN = [];
          for (var k = 0; k < n; k++) {
            var b2 = await dailyBudgetOk(env);
            if (!b2.ok) { outN.push({ skipped: "daily budget reached" }); break; }
            var rec = await pickQueued(env);
            if (!rec) break;
            var rr = await runReview(env, rec, true);
            if (rr.ok) await bumpDaily(env);
            outN.push({ recid: rec, ok: !!rr.ok, decision: rr.decision || null, error: rr.error || null });
          }
          return json({ ok: true, ran: outN });
        }
        if (path === "/cal") {
          var bodyC = {};
          try { bodyC = await request.json(); } catch (e) {}
          var calTitle = String(bodyC.title || "calibration control").slice(0, 200);
          var calText = String(bodyC.text || "").slice(0, 16000);
          if (!calText) return json({ ok: false, error: "text required" }, 400);
          var bCal = await dailyBudgetOk(env);
          if (!bCal.ok) return json({ ok: false, error: "daily budget reached", budget: bCal }, 429);
          var modelsC = String((env.JNL_MODELS || MODELS_DEFAULT)).split(",").map(function (x) { return x.trim(); }).filter(Boolean);
          var sysC = reviewerSystem("an adversarial calibration referee");
          var usrC = "CALIBRATION CONTROL TITLE: " + calTitle + "\n\nFULL TEXT:\n" + calText + "\n\nDecide whether this submission would pass peer review. Produce the review JSON.";
          var parsedC = [];
          var usedC = [];
          for (var ci = 0; ci < modelsC.length; ci++) {
            try {
              var outCTxt = await aiRun(env, modelsC[ci], sysC, usrC);
              var pC = parseJsonObject(outCTxt);
              if (pC) { parsedC.push(pC); usedC.push(modelsC[ci]); }
            } catch (e) { await log(env, null, "cal_model_error", String(e && e.message || e).slice(0, 300)); }
          }
          if (!parsedC.length) return json({ ok: false, error: "no model produced parseable JSON" }, 500);
          var decC = decisionFrom(parsedC, "text");
          await log(env, null, "cal", decC.decision + " avg=" + decC.avg + " title=" + calTitle.slice(0, 80));
          await bumpDaily(env);
          return json({ ok: true, title: calTitle, decision: decC.decision, avg_score: decC.avg, models: usedC, reason: decC.reason });
        }
      }
      return json({ ok: true, service: "jnl-referee", version: VERSION, path: path, method: method, endpoints: ["GET /health", "GET /queue", "GET /reviews?recid=", "GET /decisions?recid=", "POST /enqueue (x-jnl-token)", "POST /seed (x-jnl-token)", "POST /run {recid} (x-jnl-token)", "POST /run-next {n} (x-jnl-token)"], note: "AI referee overlay for Zenodo community aiscience; isolated jnl-* stack; overlay-only (no Zenodo write-back)" });
    } catch (err) {
      return json({ ok: false, path: path, error: String(err && err.message || err) }, 500);
    }
  }
};

export { index_default as default };

