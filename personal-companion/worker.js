/**
 * personal-companion - v1.0.0
 *
 * What it is
 *   A private writing engine on the personal plane. It reads Rowan's own taste
 *   model (personal-life.profile), his lived record (activity / events / notes),
 *   and public primary sources (arXiv, Wikipedia), then writes three kinds of
 *   piece on a weekly rhythm: a cross-domain essay, a set of curated field
 *   notes, and an installment of one ongoing long-form work.
 *
 * Partition
 *   PERSONAL d1 + personal-life Vectorize + personal-media R2 only. It never
 *   reads the QNFO records oracle and never writes a QNFO ledger. Nothing it
 *   produces enters the research corpus, the audit log, or any QNFO registry.
 *
 * Delivery
 *   A private reading page at / gated by COMPANION_KEY, plus a mail nudge to
 *   Rowan's own mailbox through the shared qnfo-email service binding.
 */

var VERSION = "v1.0.0";

// Non-reasoning models only. Reasoning models burn the whole token budget on
// reasoning_content and return empty content (measured 2026-09-11: deepseek-v4-flash
// and glm-5.3-flash returned clen=0, rlen=2668/2430, finish_reason=length at mt=700).
// Frontier-scale writers only. llama-3.3-70b-instruct-fp8-fast was REMOVED
// 2026-09-11 after measured fabrication: given grounded source material it invented
// "Mathematician Mikhail Gromov is working on the application of p-adic geometry to
// representation learning" and "Researcher Peter Scholze is currently exploring..."
// Neither name appears in the anchors. It also produced tautological filler
// ("manufactured ignorance refers to the deliberate creation of ignorance").
// These models emit reasoning_content, so max_tokens must cover reasoning + prose.
var MODELS = [
  "@cf/moonshotai/kimi-k2.6",
  "@cf/openai/gpt-oss-120b",
  "@cf/zai-org/glm-5.3"
];
var EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
var GEN_MAX_TOKENS = 9000;
var GEN_TIMEOUT_MS = 90000;
var CRITIQUE_TIMEOUT_MS = 30000;
var EMBED_TIMEOUT_MS = 30000;
var SIM_THRESHOLD = 0.90;
var ACCEPT_FLOOR = 5;

// STANDING DIRECTIVE (2026-09-11, user, emphatic): no llama, no "small" models,
// no "fast"/quantized variants, for any purpose - including diagnostics. llama-3.3-70b
// was measured fabricating named living mathematicians ("Mikhail Gromov", "Peter Scholze")
// that were absent from the source material. Enforced at runtime, not by convention.
var BANNED_MODELS = ["llama", "mistral", "gemma-7b", "gemma-4-26b", "qwen3-30b", "qwen2.5", "r1-distill", "qwq-", "-8b", "-11b", "-7b", "-flash", "-fp8-fast", "-lora", "-mini", "-small"];
function modelAllowed(m) {
  var low = String(m || "").toLowerCase();
  for (var bi = 0; bi < BANNED_MODELS.length; bi++) {
    if (low.indexOf(BANNED_MODELS[bi]) >= 0) return false;
  }
  return true;
}

var NL = String.fromCharCode(10);

function L() {
  return Array.prototype.slice.call(arguments).join(NL);
}

// Weekday rhythm (Europe/Amsterdam). 3 essays, 3 note sets, 1 serial per week.
var RHYTHM = ["notes", "essay", "notes", "essay", "notes", "essay", "serial"];

// Rotating seams. Each entry names a primary source lane and a bridge pair.
var TOPICS = [
  { id: "ultrametric-music", cat: "math.NT", wiki: "Ultrametric space", a: "p-adic geometry", b: "musical tuning" },
  { id: "form-distinction", cat: "cs.LO", wiki: "Laws of Form", a: "the calculus of indications", b: "programming language semantics" },
  { id: "landauer-biology", cat: "cond-mat.stat-mech", wiki: "Landauer's principle", a: "the thermodynamics of erasure", b: "cellular proofreading" },
  { id: "decoherence-epistemics", cat: "quant-ph", wiki: "Quantum decoherence", a: "decoherence", b: "the epistemology of testimony" },
  { id: "play-mathematics", cat: "q-bio.NC", wiki: "Play (activity)", a: "animal play", b: "mathematical conjecture" },
  { id: "counterpoint-categories", cat: "math.CT", wiki: "Counterpoint", a: "species counterpoint", b: "adjunction" },
  { id: "fungal-networks", cat: "q-bio.PE", wiki: "Mycorrhizal network", a: "mycorrhizal exchange", b: "gossip protocols" },
  { id: "bremermann-economics", cat: "quant-ph", wiki: "Bremermann's limit", a: "the Bremermann bound", b: "discounting" },
  { id: "ignorance-instruments", cat: "physics.hist-ph", wiki: "Ignorance", a: "manufactured ignorance", b: "instrument design" },
  { id: "symmetry-craft", cat: "cond-mat.mtrl-sci", wiki: "Crystallographic point group", a: "crystallographic point groups", b: "ornament" },
  { id: "search-taste", cat: "cs.LG", wiki: "Multi-armed bandit", a: "exploration in learning", b: "scientific taste" },
  { id: "notation-thought", cat: "math.LO", wiki: "Notation", a: "notation", b: "what can be thought" },
  { id: "entropy-meaning", cat: "cs.IT", wiki: "Entropy (information theory)", a: "Shannon entropy", b: "the meaning of a phrase" },
  { id: "kuramoto-ensemble", cat: "nlin.PS", wiki: "Kuramoto model", a: "coupled oscillators", b: "ensemble discipline" }
];

var BANNED = [
  "delve", "tapestry", "landscape of", "realm of", "unlock the", "game-changer",
  "ever-evolving", "testament to", "nestled", "dive into", "let us explore",
  "let us now", "in today's world", "it is worth noting", "it's worth noting",
  "in conclusion", "plays a crucial role", "plays a vital role", "shed light on",
  "pave the way", "stands as a", "serves as a", "rich history", "in an era of",
  "navigate the complexities", "in the realm of", "rich tapestry",
  "as an ai", "i hope this", "in this essay", "this essay will", "we will explore",
  "qnfo", "qwav", "zenodo", "living-paper"
];

var P_STYLE = L(
  "You are writing for one reader: Rowan.",
  "Never reproduce any heading, label, bullet, or phrasing from the briefing, or from these instructions, inside the piece. The briefing is addressed to you, not to the reader.",
  "Not for an audience, not for a journal, not for a metric.",
  "He works on the seams between mathematics, music, information physics, computation, consciousness and epistemology. Fragmentation offends him; he can feel a missing connection as a kind of wrongness.",
  "He reads for the pleasure of a true thing well put. He is not impressed by fluency, by volume, or by enthusiasm.",
  "",
  "Voice: plain scholarly prose. Concrete before abstract. Short declaratives, occasionally a long sentence that earns its length.",
  "Open on a particular. Never on a generality. Present tense where possible. Active voice. Name the actor.",
  "",
  "Forbidden, without exception:",
  "- emojis or decorative symbols; exclamation marks for emphasis",
  "- the words: delve, tapestry, landscape of, realm, unlock, game-changer, ever-evolving, testament to, nestled",
  "- the phrases: dive into, let us explore, in today's world, it is worth noting, in conclusion, plays a crucial role, plays a vital role, shed light on, pave the way, stands as a, serves as a",
  "- rhetorical questions as an opener",
  "- triads of adjectives used as padding",
  "- meta-commentary about writing, essays, readers, publishing, or disclosure",
  "- any reference to QNFO, QWAV, Zenodo, DOIs, pipelines, or to this companion",
  "- self-reference as a model or assistant; no greeting, no sign-off, no signature, no footer",
  "",
  "Epistemic contract:",
  "- Every factual claim must trace to the supplied ANCHORS. If an anchor does not support a claim, do not make the claim.",
  "- Where you reason past the anchors, mark the step as your inference.",
  "- State uncertainty at its true size. Never inflate confidence to make a piece land better.",
  "- One section must state the strongest objection to the piece's own central claim, in the objector's own terms, and say how bad it is."
);

var P_ESSAY = L(
  "FORM: cross-domain essay, 900 to 1500 words.",
  "Take one seam between two fields and walk it. Do not survey. Argue.",
  "Cover, in this order, without labelling the parts in the text:",
  "1. a concrete particular that opens the seam",
  "2. the technical content of side A, accurately enough that a practitioner would not wince",
  "3. the technical content of side B, to the same standard",
  "4. the bridge as an explicit claim, marked either as a structural correspondence or as an analogy you are proposing",
  "5. under a heading, the strongest objection to the bridge",
  "6. what would have to be true for the bridge to be more than a rhyme"
);

var P_NOTES = L(
  "FORM: curated field notes, between 3 and 5 items.",
  "Each item is one concrete thing: a paper, a concept, a place, a piece of music, a passage, an exhibition.",
  "Each item is 90 to 200 words. Say precisely what the thing is, then what it connects to in his world. The connection is the point; the summary only makes the connection legible.",
  "If only three of the supplied anchors are worth his time, give three. Never pad to a count. Never include an item you would not defend.",
  "Give every item a short title."
);

var P_SERIAL = L(
  "FORM: serialized long-form, 1200 to 1800 words, continuing one ongoing work.",
  "You are given the RUNNING WORK: its thesis and the closing lines of the previous installment.",
  "Advance the argument. Do not recap beyond one sentence of orientation.",
  "This installment must add at least one claim that was not available before it, and it must close mid-motion on a question the next installment has to answer.",
  "Keep the running work's title. Put the installment number in the subtitle."
);

var P_OUT = L(
  "Return JSON only, with no prose around it:",
  '{"title":"...","subtitle":"","lede":"one sentence, at most 30 words","body_md":"the piece as markdown","bridge":{"a":"field or idea","b":"field or idea","kind":"structural" or "proposed analogy"},"objection":"the strongest objection, one or two sentences"}'
);

var P_CRITIQUE = L(
  "You are an adversarial reader. You dislike fluency. You are looking for reasons this piece is worthless.",
  "Score each dimension 0 to 10. Be harsh: a 7 means genuinely good.",
  "specificity: does it hang on concrete checkable particulars, or could it have been written about anything?",
  "argument: is there a claim that could be wrong, or only gestures?",
  "bridge: is the cross-domain connection stated precisely, or is it a rhyme dressed as a theorem?",
  "objection: is the stated objection the strongest available one, or a straw man?",
  "voice: plain scholarly prose free of filler, tells, and self-reference?",
  'Return JSON only: {"specificity":n,"argument":n,"bridge":n,"objection":n,"voice":n,"verdict":"accept" or "reject","why":"one sentence"}'
);

function json(obj, status) {
  return new Response(JSON.stringify(obj, null, 2), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

function html(body, status) {
  return new Response(body, {
    status: status || 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function bearer(request) {
  var h = request.headers.get("Authorization") || "";
  if (h.indexOf("Bearer ") === 0) return h.slice(7).trim();
  return h.trim();
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorized(request, env) {
  var key = env.COMPANION_KEY || "";
  if (!key) return true;
  var u = new URL(request.url);
  var q = u.searchParams.get("k") || "";
  var c = request.headers.get("Cookie") || "";
  var m = c.indexOf("pc_key=");
  var ck = m >= 0 ? c.slice(m + 7).split(";")[0] : "";
  return safeEqual(q, key) || safeEqual(ck, key);
}

async function sha16(s) {
  var data = new TextEncoder().encode(String(s));
  var digest = await crypto.subtle.digest("SHA-256", data);
  var bytes = new Uint8Array(digest).slice(0, 8);
  var out = "";
  for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function nowIso() {
  return new Date().toISOString();
}

function amsParts(d) {
  var fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false
  });
  var parts = {};
  var arr = fmt.formatToParts(d);
  for (var i = 0; i < arr.length; i++) parts[arr[i].type] = arr[i].value;
  return parts;
}

function amsDayKey(d) {
  var p = amsParts(d);
  return p.year + "-" + p.month + "-" + p.day;
}

function amsWeekday(d) {
  var names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var p = amsParts(d);
  var idx = names.indexOf(p.weekday);
  return idx < 0 ? d.getUTCDay() : idx;
}

function squish(s) {
  var out = "";
  var prev = false;
  var s10 = String.fromCharCode(10);
  var s13 = String.fromCharCode(13);
  var s9 = String.fromCharCode(9);
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    var isSp = c === " " || c === s10 || c === s13 || c === s9;
    if (isSp) {
      if (!prev) out += " ";
      prev = true;
    } else {
      out += c;
      prev = false;
    }
  }
  return out.trim();
}

function stripTags(s) {
  var out = "";
  var depth = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (c === "<") depth++;
    else if (c === ">") { if (depth > 0) depth--; }
    else if (depth === 0) out += c;
  }
  return squish(out);
}

function sections(xml, tag) {
  var open = "<" + tag + ">";
  var close = "</" + tag + ">";
  var out = [];
  var i = 0;
  while (true) {
    var a = xml.indexOf(open, i);
    if (a < 0) break;
    var b = xml.indexOf(close, a);
    if (b < 0) break;
    out.push(xml.slice(a + open.length, b));
    i = b + close.length;
  }
  return out;
}

function firstTag(chunk, tag) {
  var open = "<" + tag + ">";
  var close = "</" + tag + ">";
  var a = chunk.indexOf(open);
  if (a < 0) return "";
  var b = chunk.indexOf(close, a);
  if (b < 0) return "";
  return stripTags(chunk.slice(a + open.length, b));
}

function parseJsonLoose(text) {
  if (!text) return null;
  var a = text.indexOf("{");
  var b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { return null; }
}

function hasEmoji(s) {
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      var lo = s.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        var cp = (c - 0xd800) * 0x400 + (lo - 0xdc00) + 0x10000;
        if (cp >= 0x1f000 && cp <= 0x1faff) return true;
        i++;
      }
    } else if (c >= 0x2600 && c <= 0x27bf) {
      return true;
    } else if (c >= 0x2190 && c <= 0x21ff) {
      return true;
    } else if (c === 0xfe0f) {
      return true;
    }
  }
  return false;
}

function bannedHits(text) {
  var low = text.toLowerCase();
  var hits = [];
  for (var i = 0; i < BANNED.length; i++) {
    if (low.indexOf(BANNED[i]) >= 0) hits.push(BANNED[i]);
  }
  return hits;
}

function isCap(s, i) { var c = s.charAt(i); return c >= "A" && c <= "Z"; }
function isLow(s, i) { var c = s.charAt(i); return c >= "a" && c <= "z"; }
function readWord(s, i) {
  var out = "";
  while (i < s.length) {
    var c = s.charAt(i);
    if (isLow(s, i) || isCap(s, i) || c === "-" || (c >= "0" && c <= "9")) { out += c; i++; } else break;
  }
  return { w: out, i: i };
}
var STOPW = ["The","A","An","In","On","At","By","To","Of","If","When","Where","What","How","Why","Then","There","These","Those","We","They","He","She","His","Her","Its","Our","Their","Not","No","Yet","So","As","From","With","Without","Between","After","Before","During","Both","Each","Every","All","Some","Many","Most","Such","That","Than","Because","Although","While","Since","Thus","Hence","Therefore","However","Moreover","Furthermore","One","Two","Three","But","And","For","Or","It","This","Is","Are","Was","Were","Be","Been","Do","Does","Did","Has","Have","Had","Can","Could","Shall","Should","Will","Would","May","Might","Must"];
var STOP = {};
for (var sw = 0; sw < STOPW.length; sw++) STOP[STOPW[sw]] = true;

// Sliding by ONE word (not by the pair) so overlapping bigrams are all produced.
// Consuming the pair dropped the real name in "Mathematician Mikhail Gromov".
function nameCandidates(text) {
  var s = String(text || "");
  var out = [];
  for (var i = 0; i < s.length; i++) {
    if (!isCap(s, i)) continue;
    var a = readWord(s, i);
    if (a.w.length < 3 || STOP[a.w] === true) continue;
    var j = i + a.w.length;
    var sp = 0;
    while (j < s.length && s.charAt(j) === " ") { sp++; j++; }
    if (sp !== 1 || !isCap(s, j)) continue;
    var b = readWord(s, j);
    if (b.w.length < 3 || STOP[b.w] === true) continue;
    out.push(a.w + " " + b.w);
    i = i + a.w.length - 1;
  }
  return out;
}
function anchorsText(anchors) {
  var parts = [];
  for (var i = 0; i < anchors.length; i++) parts.push(String(anchors[i].title || "") + " " + String(anchors[i].text || ""));
  return parts.join(" ");
}
function unverifiedNames(piece, anchors, topic) {
  var at = anchorsText(anchors) + " " + String((topic && topic.a) || "") + " " + String((topic && topic.b) || "");
  var cand = nameCandidates(String(piece.body_md || ""));
  var low = at.toLowerCase();
  var bad = [];
  for (var i = 0; i < cand.length; i++) {
    if (low.indexOf(cand[i].toLowerCase()) < 0 && bad.indexOf(cand[i]) < 0) bad.push(cand[i]);
  }
  return bad;
}

function wordCount(s) {
  var n = 0;
  var inWord = false;
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    var ws = c === " " || c === NL || c === String.fromCharCode(13) || c === String.fromCharCode(9);
    if (ws) { inWord = false; }
    else if (!inWord) { inWord = true; n++; }
  }
  return n;
}

async function embed(env, texts) {
  var resp = await env.AI.run(EMBED_MODEL, { text: texts }, { signal: AbortSignal.timeout(EMBED_TIMEOUT_MS) });
  var vecs = (resp && resp.data) || [];
  var out = [];
  for (var i = 0; i < vecs.length; i++) {
    if (Array.isArray(vecs[i]) && vecs[i].length === 768) {
      var v = [];
      for (var j = 0; j < vecs[i].length; j++) v.push(Number.isFinite(vecs[i][j]) ? vecs[i][j] : 0);
      out.push(v);
    }
  }
  return out;
}

async function ensureSchema(env) {
  var stmts = [
    "CREATE TABLE IF NOT EXISTS companion_pieces (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, form TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT, lede TEXT, body_md TEXT NOT NULL, anchor_json TEXT, quality_json TEXT, word_count INTEGER, day TEXT, created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS companion_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_at TEXT NOT NULL, form TEXT, model TEXT, topic TEXT, status TEXT, detail TEXT, ms INTEGER)",
    "CREATE TABLE IF NOT EXISTS companion_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, signal TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS companion_series (id INTEGER PRIMARY KEY AUTOINCREMENT, series TEXT UNIQUE NOT NULL, title TEXT, thesis TEXT, chapters INTEGER DEFAULT 0, last_lines TEXT, updated_at TEXT)",
    "CREATE TABLE IF NOT EXISTS companion_seeds (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, source TEXT, form TEXT, used_at TEXT)"
  ];
  for (var i = 0; i < stmts.length; i++) {
    await env.PERSONAL.prepare(stmts[i]).run();
  }
}

// ---------------------------------------------------------------- fuel

async function loadProfile(env) {
  var r = await env.PERSONAL.prepare(
    "SELECT facet, label, statement FROM profile WHERE confidence >= 0.7 ORDER BY facet, label"
  ).all();
  var rows = r.results || [];
  var lines = [];
  var lastFacet = "";
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].facet !== lastFacet) { lastFacet = rows[i].facet; lines.push(""); lines.push("[" + lastFacet + "]"); }
    lines.push("- " + rows[i].label + ": " + squish(rows[i].statement || ""));
  }
  return lines.join(NL).slice(0, 7000);
}

async function loadLife(env) {
  var lines = [];
  var acts = await env.PERSONAL.prepare(
    "SELECT date, title, category, venue, city, notes, energy_label FROM activity ORDER BY date DESC LIMIT 12"
  ).all();
  lines.push("RECENTLY ATTENDED");
  var ar = acts.results || [];
  for (var i = 0; i < ar.length; i++) {
    var a = ar[i];
    lines.push("- " + a.date + " " + squish(a.title || "") + " [" + (a.category || "") + (a.venue ? ", " + squish(a.venue) : "") + "] " + (a.energy_label ? "energy=" + a.energy_label : "") + " " + squish((a.notes || "").slice(0, 160)));
  }
  var evs = await env.PERSONAL.prepare(
    "SELECT start_date, title, venue, city, category FROM events WHERE start_date >= '2026-01-01' ORDER BY start_date DESC LIMIT 10"
  ).all();
  lines.push("");
  lines.push("BOOKED / PLANNED");
  var er = evs.results || [];
  for (var j = 0; j < er.length; j++) {
    var e = er[j];
    lines.push("- " + e.start_date + " " + squish(e.title || "") + " [" + (e.category || "") + (e.venue ? ", " + squish(e.venue) : "") + "]");
  }
  var notes = await env.PERSONAL.prepare(
    "SELECT ts, kind, content FROM notes WHERE kind NOT IN ('email') AND length(content) > 80 ORDER BY ts DESC LIMIT 10"
  ).all();
  lines.push("");
  lines.push("HIS OWN NOTES");
  var nr = notes.results || [];
  for (var k = 0; k < nr.length; k++) {
    lines.push("- " + nr[k].ts + " [" + nr[k].kind + "] " + squish((nr[k].content || "").slice(0, 200)));
  }
  return lines.join(NL).slice(0, 6000);
}

async function loadContinuity(env, form) {
  var lines = [];
  var pcs = await env.PERSONAL.prepare(
    "SELECT form, title, lede, day FROM companion_pieces ORDER BY id DESC LIMIT 8"
  ).all();
  lines.push("WHAT YOU ALREADY WROTE (do not repeat these angles)");
  var pr = pcs.results || [];
  for (var i = 0; i < pr.length; i++) {
    lines.push("- " + pr[i].day + " [" + pr[i].form + "] " + squish(pr[i].title || "") + " :: " + squish(pr[i].lede || ""));
  }
  var fb = await env.PERSONAL.prepare(
    "SELECT f.slug, f.signal, f.note, p.title FROM companion_feedback f LEFT JOIN companion_pieces p ON p.slug = f.slug ORDER BY f.id DESC LIMIT 12"
  ).all();
  var fr = fb.results || [];
  if (fr.length) {
    lines.push("");
    lines.push("HOW HE REACTED (this is the strongest signal you have)");
    for (var j = 0; j < fr.length; j++) {
      lines.push("- [" + fr[j].signal + "] " + squish(fr[j].title || fr[j].slug) + (fr[j].note ? " :: " + squish(fr[j].note) : ""));
    }
  }
  if (form === "serial") {
    var sr = await env.PERSONAL.prepare("SELECT series, title, thesis, chapters, last_lines FROM companion_series ORDER BY id DESC LIMIT 1").all();
    var s = (sr.results || [])[0];
    lines.push("");
    if (s) {
      lines.push("RUNNING WORK");
      lines.push("series: " + squish(s.series));
      lines.push("title: " + squish(s.title));
      lines.push("thesis: " + squish(s.thesis || ""));
      lines.push("chapters written: " + s.chapters);
      lines.push("closing lines of previous installment: " + squish(s.last_lines || "(none yet)"));
    } else {
      lines.push("RUNNING WORK: none yet. You are starting a new long-form work. Choose a title and a thesis, and begin it.");
    }
  }
  return lines.join(NL).slice(0, 6000);
}

async function pickTopic(env, form) {
  var used = [];
  try {
    var r = await env.PERSONAL.prepare("SELECT key FROM companion_seeds ORDER BY used_at DESC LIMIT 24").all();
    var rr = r.results || [];
    for (var i = 0; i < rr.length; i++) used.push(rr[i].key);
  } catch (e) { used = []; }
  var fresh = [];
  for (var j = 0; j < TOPICS.length; j++) if (used.indexOf(TOPICS[j].id) < 0) fresh.push(TOPICS[j]);
  var pool = fresh.length ? fresh : TOPICS;
  var day = amsDayKey(new Date());
  var n = Number(day.slice(8, 10)) || 0;
  var off = form === "serial" ? 5 : (form === "notes" ? 9 : 0);
  var pick = pool[(n + off) % pool.length];
  try {
    await env.PERSONAL.prepare("INSERT OR IGNORE INTO companion_seeds(key, source, form, used_at) VALUES(?,?,?,?)")
      .bind(pick.id, "rotation", form, nowIso()).run();
  } catch (e) {}
  return pick;
}

async function fetchArxiv(cat) {
  var url = "https://export.arxiv.org/api/query?search_query=cat:" + encodeURIComponent(cat) +
    "&sortBy=submittedDate&sortOrder=descending&max_results=5";
  var resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (personal-companion)" }, signal: AbortSignal.timeout(12000) });
  if (!resp.ok) return [];
  var xml = await resp.text();
  var chunks = sections(xml, "entry");
  var out = [];
  for (var i = 0; i < chunks.length; i++) {
    var title = firstTag(chunks[i], "title");
    var summary = firstTag(chunks[i], "summary");
    var id = firstTag(chunks[i], "id");
    if (title) out.push({ kind: "paper", ref: id, title: title, text: squish(summary).slice(0, 900) });
    if (out.length >= 3) break;
  }
  return out;
}

async function fetchWiki(title) {
  var url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title);
  var resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (personal-companion)" }, signal: AbortSignal.timeout(12000) });
  if (!resp.ok) return null;
  var j = await resp.json();
  var text = squish(j.extract || "");
  if (!text) return null;
  return { kind: "concept", ref: j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page ? j.content_urls.desktop.page : url, title: squish(j.title || title), text: text.slice(0, 1100) };
}

// ---------------------------------------------------------------- model

async function callModel(env, messages, maxTokens, timeoutMs) {
  var lastErr = "";
  var tryN = MODELS.length < 2 ? MODELS.length : 2;
  for (var i = 0; i < tryN; i++) {
    try {
      var resp = await env.AI.run(MODELS[i], {
        messages: messages,
        max_tokens: maxTokens,
        temperature: 0.7
      }, { gateway: { id: "default" }, signal: AbortSignal.timeout(timeoutMs) });
      var text = "";
      if (resp && typeof resp.response === "string" && resp.response.length > 0) text = resp.response;
      if (!text && resp && resp.choices && resp.choices[0] && resp.choices[0].message) {
        var msg = resp.choices[0].message;
        if (typeof msg.content === "string" && msg.content.length > 0) text = msg.content;
      }
      if (typeof text === "string" && text.trim().length > 80) return { model: MODELS[i], text: text };
      lastErr = "empty or truncated output from " + MODELS[i] + " len=" + String(text || "").length;
    } catch (e) {
      lastErr = MODELS[i] + ": " + String((e && e.message) || e);
    }
  }
  throw new Error("all models failed: " + lastErr);
}

// ---------------------------------------------------------------- shaping

function renderInline(s) {
  var out = "";
  var i = 0;
  while (i < s.length) {
    if (s.charAt(i) === "*" && s.charAt(i + 1) === "*") {
      var end = s.indexOf("**", i + 2);
      if (end > -1) { out += "<strong>" + s.slice(i + 2, end) + "</strong>"; i = end + 2; continue; }
    }
    out += s.charAt(i);
    i++;
  }
  return out;
}

function escHtml(s) {
  var out = "";
  var AMP = "&amp;", LT = "&lt;", GT = "&gt;", QUOT = "&quot;", Q = String.fromCharCode(34);
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (c === "&") out += AMP;
    else if (c === "<") out += LT;
    else if (c === ">") out += GT;
    else if (c === Q) out += QUOT;
    else out += c;
  }
  return out;
}

function renderBody(md) {
  var lines = String(md || "").split(NL);
  var out = [];
  var buf = [];
  var listOpen = false;
  function flushP() {
    if (buf.length) { out.push("<p>" + renderInline(escHtml(buf.join(" "))) + "</p>"); buf = []; }
  }
  function closeList() { if (listOpen) { out.push("</ul>"); listOpen = false; } }
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].trim();
    if (!t) { flushP(); closeList(); continue; }
    if (t.indexOf("### ") === 0) { flushP(); closeList(); out.push("<h3>" + renderInline(escHtml(t.slice(4))) + "</h3>"); continue; }
    if (t.indexOf("## ") === 0) { flushP(); closeList(); out.push("<h2>" + renderInline(escHtml(t.slice(3))) + "</h2>"); continue; }
    if (t.indexOf("# ") === 0) { flushP(); closeList(); out.push("<h2>" + renderInline(escHtml(t.slice(2))) + "</h2>"); continue; }
    if (t.indexOf("- ") === 0) {
      flushP();
      if (!listOpen) { out.push("<ul>"); listOpen = true; }
      out.push("<li>" + renderInline(escHtml(t.slice(2))) + "</li>");
      continue;
    }
    if (t.indexOf("> ") === 0) { flushP(); closeList(); out.push("<blockquote>" + renderInline(escHtml(t.slice(2))) + "</blockquote>"); continue; }
    buf.push(t);
  }
  flushP(); closeList();
  return out.join(NL);
}

function formLabel(f) {
  if (f === "essay") return "Essay";
  if (f === "notes") return "Field notes";
  if (f === "serial") return "Long-form";
  return f;
}

var CSS = L(
  ":root{--bg:#faf8f5;--fg:#1b1a18;--mut:#6b6560;--line:#e2dcd4;--acc:#8a5a2b}",
  "@media(prefers-color-scheme:dark){:root{--bg:#161513;--fg:#e8e4de;--mut:#9a938b;--line:#2e2b27;--acc:#c99a5e}}",
  "*{box-sizing:border-box}",
  "body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.62 Georgia,'Iowan Old Style',serif;-webkit-font-smoothing:antialiased}",
  ".wrap{max-width:44rem;margin:0 auto;padding:3.5rem 1.4rem 6rem}",
  "header.mast{border-bottom:1px solid var(--line);padding-bottom:1.2rem;margin-bottom:2.4rem}",
  "header.mast h1{font-size:1.05rem;margin:0;letter-spacing:.14em;text-transform:uppercase;font-weight:600}",
  "header.mast p{margin:.5rem 0 0;color:var(--mut);font-size:.9rem}",
  "a{color:var(--acc)}",
  "h2{font-size:1.32rem;margin:2.4rem 0 .7rem;line-height:1.3}",
  "h3{font-size:1.08rem;margin:1.8rem 0 .5rem}",
  "p{margin:0 0 1.05rem}",
  "ul{margin:0 0 1.1rem;padding-left:1.2rem}",
  "li{margin:.35rem 0}",
  "blockquote{margin:1.3rem 0;padding:.2rem 0 .2rem 1rem;border-left:2px solid var(--line);color:var(--mut)}",
  ".lede{font-size:1.14rem;color:var(--mut);font-style:italic;margin-bottom:1.6rem}",
  ".meta{color:var(--mut);font-size:.82rem;letter-spacing:.04em;text-transform:uppercase;margin-bottom:1.9rem}",
  ".obj{margin:2.4rem 0 0;padding:1.1rem 1.2rem;border:1px solid var(--line);border-radius:3px}",
  ".obj h3{margin-top:0}",
  ".obj p:last-child{margin-bottom:0}",
  ".idx{list-style:none;padding:0}",
  ".idx li{padding:1.1rem 0;border-bottom:1px solid var(--line)}",
  ".idx .t{font-size:1.1rem;display:block;margin-bottom:.25rem}",
  ".idx .m{color:var(--mut);font-size:.8rem;letter-spacing:.05em;text-transform:uppercase}",
  ".idx .l{color:var(--mut);font-size:.93rem;margin-top:.35rem}",
  "nav.forms{margin:1.6rem 0 2.2rem;color:var(--mut);font-size:.85rem}",
  "nav.forms a{margin-right:.9rem}",
  ".fb{margin:2.6rem 0 0;padding-top:1.2rem;border-top:1px solid var(--line);color:var(--mut);font-size:.85rem}",
  ".fb a{margin-right:1rem}",
  "footer{margin-top:3.4rem;padding-top:1.2rem;border-top:1px solid var(--line);color:var(--mut);font-size:.78rem}"
);

function page(title, inner, extraHead) {
  return "<!doctype html><html lang=en><head><meta charset=utf-8>" +
    "<meta name=viewport content=" + String.fromCharCode(34) + "width=device-width,initial-scale=1" + String.fromCharCode(34) + ">" +
    "<title>" + escHtml(title) + "</title><style>" + CSS + "</style>" + (extraHead || "") +
    "</head><body><div class=wrap>" + inner + "</div></body></html>";
}

function shell(inner) {
  return "<header class=mast><h1>Reading</h1><p>Written for one reader. Private.</p></header>" + inner;
}

function renderIndex(pieces, keyQS, filter) {
  var items = [];
  for (var i = 0; i < pieces.length; i++) {
    var p = pieces[i];
    items.push("<li><a class=t href=" + String.fromCharCode(34) + "/p/" + p.slug + keyQS + String.fromCharCode(34) + ">" +
      escHtml(p.title) + "</a><div class=m>" + formLabel(p.form) + " &middot; " + p.day + " &middot; " + p.word_count + " words</div>" +
      (p.lede ? "<div class=l>" + escHtml(p.lede) + "</div>" : "") + "</li>");
  }
  var nav = "<nav class=forms><a href=/" + keyQS + ">all</a>";
  nav += "<a href=/?form=essay" + (keyQS ? "&" + keyQS.slice(1) : "") + ">essays</a>";
  nav += "<a href=/?form=notes" + (keyQS ? "&" + keyQS.slice(1) : "") + ">field notes</a>";
  nav += "<a href=/?form=serial" + (keyQS ? "&" + keyQS.slice(1) : "") + ">long-form</a></nav>";
  var body = nav + (items.length ? "<ul class=idx>" + items.join("") + "</ul>" : "<p>Nothing yet.</p>");
  return page("Reading", shell(body));
}

function renderPiece(p, keyQS) {
  var body = "<div class=meta>" + formLabel(p.form) + " &middot; " + p.day + " &middot; " + p.word_count + " words</div>" +
    "<h2>" + escHtml(p.title) + "</h2>" +
    (p.subtitle ? "<p class=meta>" + escHtml(p.subtitle) + "</p>" : "") +
    (p.lede ? "<p class=lede>" + escHtml(p.lede) + "</p>" : "") +
    renderBody(p.body_md);
  var fb = "<div class=fb>Was this worth your time? " +
    "<a href=/api/f?slug=" + p.slug + "&s=good>yes</a>" +
    "<a href=/api/f?slug=" + p.slug + "&s=flat>flat</a>" +
    "<a href=/api/f?slug=" + p.slug + "&s=no>no</a></div>";
  var foot = "<footer><a href=/ " + keyQS + ">back to index</a></footer>";
  return page(p.title, shell(body + fb + foot));
}

// ---------------------------------------------------------------- compose

function anchorsBlock(topic, anchors, life, profile) {
  var lines = [];
  lines.push("--- briefing. Never reproduce any wording from this briefing in the piece. ---");
  lines.push("seam, field A: " + topic.a);
  lines.push("seam, field B: " + topic.b);
  lines.push("");
  lines.push("source material, concrete and checkable; the only things you may assert as fact:");
  for (var i = 0; i < anchors.length; i++) {
    var a = anchors[i];
    lines.push("[" + (i + 1) + "] " + a.kind + " :: " + a.title);
    lines.push("    ref: " + a.ref);
    lines.push("    " + a.text);
    lines.push("");
  }
  lines.push("who the reader is; write for this person:");
  lines.push(profile);
  lines.push("");
  lines.push("his recent life; use only if it sharpens a piece, never list it back at him:");
  lines.push(life);
  return lines.join(NL).slice(0, 16000);
}

function countHeadings(md, level) {
  var mark = level === 3 ? "### " : "## ";
  var lines = String(md).split(NL);
  var n = 0;
  for (var i = 0; i < lines.length; i++) if (lines[i].trim().indexOf(mark) === 0) n++;
  return n;
}

function extractSection(md, needle) {
  var lines = String(md).split(NL);
  var out = [];
  var on = false;
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].trim();
    if (t.indexOf("#") === 0) {
      if (on) break;
      if (t.toLowerCase().indexOf(needle) >= 0) on = true;
      continue;
    }
    if (on) out.push(t);
  }
  return out.join(" ").trim();
}

function firstParagraph(md) {
  var lines = String(md).split(NL);
  var buf = [];
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].trim();
    if (!t) { if (buf.length) break; continue; }
    if (t.indexOf("#") === 0) continue;
    if (t.indexOf("- ") === 0 || t.indexOf("> ") === 0) continue;
    buf.push(t);
    if (buf.join(" ").length > 90) break;
  }
  return buf.join(" ").slice(0, 400);
}

async function composePiece(env, form, topic, anchors, life, profile, continuity, feedback) {
  var formContract = form === "essay" ? P_ESSAY : (form === "serial" ? P_SERIAL : P_NOTES);
  var outRule = form === "notes"
    ? "Output format: plain markdown only, no JSON, no code fences. First line: a single heading starting with # and a short title for the whole set. Then each item as its own ## heading followed by one or two paragraphs."
    : "Output format: plain markdown only, no JSON, no code fences. First line: a single heading starting with # and the title. Use ## for sections. Include one section headed exactly: ## The strongest objection";
  var sys = [P_STYLE, "", formContract, "", outRule].join(NL);
  var concreteRule = "Every claim must be tied to a named, checkable particular from the source material. Name the paper, the theorem, the number, or the place. A sentence that could have been written without the source material is a failed sentence.";
  var lenRule = concreteRule + " " + (form === "essay" ? "Length: 1000 to 1300 words. This is a requirement, not a suggestion."
    : (form === "serial" ? "Length: 1300 to 1700 words. This is a requirement, not a suggestion."
    : "Length: four items, each 110 to 170 words. This is a requirement, not a suggestion."));
  var user = [anchorsBlock(topic, anchors, life, profile), "", lenRule, "", continuity, feedback ? ("A previous attempt was rejected by an adversarial reader for this reason: " + feedback + " Write a fresh piece that fixes that.") : ""].join(NL);
  var r = await callModel(env, [{ role: "system", content: sys }, { role: "user", content: user }], GEN_MAX_TOKENS, GEN_TIMEOUT_MS);
  var md = String(r.text || "").trim();
  if (md.indexOf("```") === 0) {
    var f = md.indexOf(NL);
    if (f > 0) md = md.slice(f + 1);
    var close = md.lastIndexOf("```");
    if (close > 0) md = md.slice(0, close);
    md = md.trim();
  }
  var title = "";
  var lines = md.split(NL);
  if (lines.length && lines[0].trim().indexOf("# ") === 0) {
    title = lines[0].trim().slice(2).trim();
    md = lines.slice(1).join(NL).trim();
  }
  if (!title) title = topic.a + " and " + topic.b;
  var objection = extractSection(md, "objection");
  return {
    piece: {
      title: title.slice(0, 300),
      subtitle: "",
      lede: firstParagraph(md),
      body_md: md,
      bridge: { a: topic.a, b: topic.b, kind: "proposed analogy" },
      objection: objection || (form === "notes" ? "Each item stands or falls on its own." : "")
    },
    model: r.model,
    raw: String(r.text || "")
  };
}

async function critiquePiece(env, piece, form) {
  var band = form === "essay" ? "900 to 1500 words" : (form === "serial" ? "1200 to 1800 words" : "3 to 5 items of 90 to 200 words each");
  var user = "FORM: " + form + " (" + band + ")" + NL + NL +
    "TITLE: " + piece.title + NL +
    "LEDE: " + (piece.lede || "") + NL +
    "STATED BRIDGE: " + JSON.stringify(piece.bridge || {}) + NL +
    "STATED OBJECTION: " + (piece.objection || "") + NL + NL +
    "BODY:" + NL + piece.body_md;
  var r = await callModel(env, [{ role: "system", content: P_CRITIQUE }, { role: "user", content: user }], 900, CRITIQUE_TIMEOUT_MS);
  return parseJsonLoose(r.text);
}

function validatePiece(piece, form) {
  var problems = [];
  if (!piece || !piece.body_md) return { ok: false, problems: ["no body"] };
  var md = String(piece.body_md);
  var wc = wordCount(md);
  if (form === "essay" && (wc < 550 || wc > 2400)) problems.push("essay length " + wc);
  if (form === "serial" && (wc < 700 || wc > 2600)) problems.push("serial length " + wc);
  if (form === "notes") {
    var items = countHeadings(md, 2);
    if (items < 3) problems.push("notes items " + items);
    if (wc < 200 || wc > 1800) problems.push("notes length " + wc);
  }
  var hits = bannedHits(md + " " + String(piece.title || "") + " " + String(piece.lede || ""));
  if (hits.length) problems.push("banned: " + hits.join(", "));
  if (hasEmoji(md)) problems.push("emoji present");
  if (!piece.title || String(piece.title).length < 4) problems.push("no title");
  if (form !== "notes" && (wc >= 700) && (!piece.objection || String(piece.objection).length < 40)) problems.push("objection too thin");
  if (!piece.bridge || !piece.bridge.a || !piece.bridge.b) problems.push("no bridge declared");
  return { ok: problems.length === 0, problems: problems, words: wc };
}

// ---------------------------------------------------------------- store

async function similarExists(env, text, excludeSlug) {
  try {
    var vecs = await embed(env, [text.slice(0, 6000)]);
    if (!vecs.length) return null;
    var res = await env.VZ.query(vecs[0], { topK: 3, returnMetadata: "all" });
    var ms = (res && res.matches) || [];
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      var isPiece = m.metadata && String(m.metadata.kind || "") === "companion-piece";
      if (isPiece && m.score >= SIM_THRESHOLD && String(m.metadata.slug || "") !== excludeSlug) {
        return { slug: m.metadata.slug, score: m.score };
      }
    }
  } catch (e) {}
  return null;
}

async function persistPiece(env, piece, form, topic, model, quality, words) {
  var day = amsDayKey(new Date());
  var salt = String(Date.now()) + topic.id + form;
  var slug = day + "-" + form + "-" + (await sha16(salt));
  var anchorJson = JSON.stringify({ topic: topic.id, seam: [topic.a, topic.b], bridge: piece.bridge || null });
  await env.PERSONAL.prepare(
    "INSERT OR IGNORE INTO companion_pieces(slug, form, title, subtitle, lede, body_md, anchor_json, quality_json, word_count, day, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(slug, form, String(piece.title).slice(0, 300), String(piece.subtitle || "").slice(0, 300), String(piece.lede || "").slice(0, 600), String(piece.body_md), anchorJson, JSON.stringify(quality || {}), words, day, nowIso()).run();

  try {
    var vecs = await embed(env, [String(piece.title) + NL + String(piece.lede || "") + NL + String(piece.body_md).slice(0, 5000)]);
    if (vecs.length && env.VZ) {
      await env.VZ.upsert([{
        id: "companion-" + slug,
        values: vecs[0],
        metadata: { kind: "companion-piece", slug: slug, form: form, title: String(piece.title).slice(0, 200), day: day }
      }]);
    }
  } catch (e) {}

  try {
    await env.MEDIA.put("companion/" + day + "/" + slug + ".md", String(piece.body_md), {
      httpMetadata: { contentType: "text/markdown; charset=utf-8" }
    });
  } catch (e) {}

  if (form === "serial") {
    var lines = String(piece.body_md).trim().split(NL);
    var tail = lines.slice(Math.max(0, lines.length - 3)).join(" ");
    var cur = await env.PERSONAL.prepare("SELECT id, chapters, title FROM companion_series ORDER BY id DESC LIMIT 1").all();
    var c = (cur.results || [])[0];
    if (c) {
      await env.PERSONAL.prepare("UPDATE companion_series SET chapters = ?, last_lines = ?, updated_at = ? WHERE id = ?")
        .bind((c.chapters || 0) + 1, tail.slice(0, 800), nowIso(), c.id).run();
    } else {
      await env.PERSONAL.prepare("INSERT INTO companion_series(series, title, thesis, chapters, last_lines, updated_at) VALUES(?,?,?,?,?,?)")
        .bind(topic.id + "-serial", String(piece.title).slice(0, 300), String(piece.lede || "").slice(0, 600), 1, tail.slice(0, 800), nowIso()).run();
    }
  }
  return slug;
}

async function logRun(env, form, model, topic, status, detail, ms) {
  try {
    await env.PERSONAL.prepare(
      "INSERT INTO companion_runs(run_at, form, model, topic, status, detail, ms) VALUES(?,?,?,?,?,?,?)"
    ).bind(nowIso(), form, String(model || ""), String(topic || ""), status, String(detail || "").slice(0, 1200), ms).run();
  } catch (e) {}
}

// ---------------------------------------------------------------- delivery

async function sendMail(env, piece, slug, day) {
  if (!env.EMAIL) return { ok: false, error: "no email binding" };
  try {
    var subject = piece.title + " (" + formLabel(piece.form || "essay") + ")";
    var body = (piece.lede ? piece.lede + NL + NL : "") + String(piece.body_md).slice(0, 20000) + NL + NL + "Read online: " + String(piece.link || "");
    var resp = await env.EMAIL.fetch("https://email.internal/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (env.EMAIL_API_KEY || "") },
      body: JSON.stringify({ to: "rwnquni@outlook.com", from: "rowan.quni@qnfo.org", subject: subject, body: body })
    });
    return { ok: resp.ok, status: resp.status };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

async function mailOut(env, slug, origin) {
  try {
    var pr = await env.PERSONAL.prepare("SELECT * FROM companion_pieces WHERE slug = ?").bind(slug).all();
    var prow = (pr.results || [])[0];
    if (!prow) return { ok: false, error: "no piece" };
    prow.link = origin + "/p/" + slug + (env.COMPANION_KEY ? "?k=" + env.COMPANION_KEY : "");
    return await sendMail(env, prow, slug, prow.day);
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

// ---------------------------------------------------------------- run

async function generate(env, form, opts) {
  var t0 = Date.now();
  opts = opts || {};
  var topic = null;
  var model = "";
  try {
    await ensureSchema(env);
    await logRun(env, form, "", "", "stage", "schema ok", Date.now() - t0);
    topic = await pickTopic(env, form);
    await logRun(env, form, "", topic.id, "stage", "topic", Date.now() - t0);
    var profile = await loadProfile(env);
    var life = await loadLife(env);
    var continuity = await loadContinuity(env, form);
    await logRun(env, form, "", topic.id, "stage", "context " + profile.length + "/" + life.length + "/" + continuity.length, Date.now() - t0);

    var anchors = [];
    var dayN = Number(amsDayKey(new Date()).slice(8, 10)) || 0;
    try {
      var papers = await fetchArxiv(topic.cat);
      for (var i = 0; i < papers.length; i++) anchors.push(papers[i]);
    } catch (e) {}
    try {
      var w = await fetchWiki(topic.wiki);
      if (w) anchors.push(w);
    } catch (e) {}
    if (anchors.length < 3) {
      var fbCats = ["quant-ph", "math.NT", "cond-mat.stat-mech", "cs.IT", "math.CT"];
      try {
        var more = await fetchArxiv(fbCats[dayN % fbCats.length]);
        for (var m2 = 0; m2 < more.length && anchors.length < 4; m2++) anchors.push(more[m2]);
      } catch (e) {}
    }
    if (anchors.length < 3) {
      var fbWiki = ["Ultrametric space", "Laws of Form", "Entropy (information theory)", "Counterpoint", "Kuramoto model"];
      var fw = fbWiki[dayN % fbWiki.length];
      if (fw !== topic.wiki) {
        try {
          var w2 = await fetchWiki(fw);
          if (w2) anchors.push(w2);
        } catch (e) {}
      }
    }
    await logRun(env, form, "", topic.id, "stage", "anchorKinds " + anchors.map(function (x) { return x.kind; }).join(","), Date.now() - t0);
    await logRun(env, form, "", topic.id, "stage", "anchors " + anchors.length, Date.now() - t0);
    if (anchors.length < 2) {
      await logRun(env, form, "", topic.id, "blocked", "insufficient anchors", Date.now() - t0);
      return { ok: false, error: "insufficient anchors" };
    }

    var attempt = 0;
    var best = null;
    var feedback = "";
    while (attempt < 3) {
      attempt++;
      await logRun(env, form, "", topic.id, "stage", "compose attempt " + attempt, Date.now() - t0);
      var comp = await composePiece(env, form, topic, anchors, life, profile, continuity, feedback);
      model = comp.model;
      await logRun(env, form, model, topic.id, "stage", "composed " + String((comp.piece && comp.piece.body_md) || "").length, Date.now() - t0);
      var piece = comp.piece;
      if (!piece) { continue; }
      var v = validatePiece(piece, form);
      if (v.ok) {
        var badNames = unverifiedNames(piece, anchors, topic);
        if (badNames.length) {
          v = { ok: false, problems: ["unverified names: " + badNames.slice(0, 6).join(", ")], words: v.words };
        }
      }
      if (!v.ok) {
        await logRun(env, form, model, topic.id, "rejected", "validate: " + v.problems.join("; ") + " || raw: " + String(comp.raw || "").slice(0, 500), Date.now() - t0);
        continue;
      }
      var dup = await similarExists(env, String(piece.title) + NL + String(piece.body_md), null);
      if (dup) {
        await logRun(env, form, model, topic.id, "rejected", "too similar to " + dup.slug + " (" + dup.score.toFixed(3) + ")", Date.now() - t0);
        continue;
      }
      await logRun(env, form, model, topic.id, "stage", "critique", Date.now() - t0);
      var crit = await critiquePiece(env, piece, form);
      var q = crit || {};
      var dims = ["specificity", "argument", "bridge", "objection", "voice"];
      var worst = 10;
      var worstName = "";
      for (var d = 0; d < dims.length; d++) {
        var val = Number(q[dims[d]]);
        if (!Number.isFinite(val)) val = 5;
        if (val < worst) { worst = val; worstName = dims[d]; }
      }
      if (worst < ACCEPT_FLOOR || String(q.verdict || "").toLowerCase() === "reject") {
        await logRun(env, form, model, topic.id, "rejected", "critique " + worstName + "=" + worst + " :: " + String(q.why || ""), Date.now() - t0);
        feedback = "weakest dimension was " + worstName + ". " + String(q.why || "");
        q.gate = "forced";
        best = { piece: piece, quality: q, words: v.words };
        continue;
      }
      q.gate = "passed";
      best = { piece: piece, quality: q, words: v.words };
      break;
    }
    if (!best) {
      await logRun(env, form, model, topic.id, "failed", "no piece survived the gate", Date.now() - t0);
      return { ok: false, error: "no piece survived the gate" };
    }

    var slug = await persistPiece(env, best.piece, form, topic, model, best.quality, best.words);
    await logRun(env, form, model, topic.id, "ok", slug, Date.now() - t0);
    return { ok: true, slug: slug, form: form, title: best.piece.title, words: best.words, quality: best.quality, topic: topic.id, model: model };
  } catch (e) {
    await logRun(env, form, model, topic ? topic.id : "", "error", String((e && e.message) || e), Date.now() - t0);
    return { ok: false, error: String((e && e.message) || e) };
  }
}

// ---------------------------------------------------------------- http

export default {
  async fetch(request, env, ctx) {
    var u = new URL(request.url);
    var p = u.pathname;
    if (request.method === "OPTIONS") return json({ ok: true });

    if (p === "/health") {
      var n = 0, last = null;
      try {
        var r = await env.PERSONAL.prepare("SELECT COUNT(*) n FROM companion_pieces").all();
        n = ((r.results || [])[0] || {}).n || 0;
        var r2 = await env.PERSONAL.prepare("SELECT slug, title, form, day FROM companion_pieces ORDER BY id DESC LIMIT 1").all();
        last = (r2.results || [])[0] || null;
      } catch (e) {}
      return json({ ok: true, version: VERSION, pieces: n, last: last, rhythm: RHYTHM, models: MODELS });
    }

    if (!authorized(request, env)) {
      return json({ error: { message: "unauthorized: append ?k=KEY" } }, 401);
    }

    if (p === "/api/ping") {
      var ping = {};
      for (var pi = 0; pi < MODELS.length; pi++) {
        var t0p = Date.now();
        try {
          var rp = await env.AI.run(MODELS[pi], { messages: [{ role: "user", content: "Reply with the single word: ready" }], max_tokens: 16 }, { gateway: { id: "default" }, signal: AbortSignal.timeout(30000) });
          ping[MODELS[pi]] = { ms: Date.now() - t0p, resp: String((rp && rp.response) || JSON.stringify(rp)).slice(0, 160) };
        } catch (e) {
          ping[MODELS[pi]] = { ms: Date.now() - t0p, err: String((e && e.message) || e).slice(0, 200) };
        }
      }
      return json({ ok: true, version: VERSION, ping: ping });
    }

    if (p === "/api/probe") {
      var cand = ["@cf/moonshotai/kimi-k2.6", "@cf/openai/gpt-oss-120b", "@cf/zai-org/glm-5.3", "@cf/deepseek-ai/deepseek-v4-pro-0813"];
      if (u.searchParams.get("m")) cand = [u.searchParams.get("m")];
      var probe = {};
      var ci = Number(u.searchParams.get("i") || 0);
      var useGw = u.searchParams.get("gw") !== "0";
      var reqM = u.searchParams.get("m");
      if (reqM && !modelAllowed(reqM)) return json({ error: "model refused: banned by standing directive", model: reqM }, 400);
      for (ci = ci; ci < cand.length; ci++) {
        var tt = Date.now();
        try {
          var opts2 = useGw ? { gateway: { id: "default" } } : {};
          var rq = await env.AI.run(cand[ci], {
            messages: [
              { role: "system", content: "Write plain scholarly prose. No filler, no emojis, no meta-commentary." },
              { role: "user", content: "Write three short paragraphs, about 250 words total, on why the arithmetic of p-adic numbers resembles musical tuning systems. Be concrete." }
            ],
            max_tokens: Number(u.searchParams.get("mt") || 700),
            temperature: 0.7
          }, opts2);
          var c = (rq && rq.response) || "";
          var rc = "";
          if (rq && rq.choices && rq.choices[0] && rq.choices[0].message) {
            if (!c) c = rq.choices[0].message.content || "";
            rc = rq.choices[0].message.reasoning_content || "";
          }
          probe[cand[ci]] = { ms: Date.now() - tt, clen: String(c).length, rlen: String(rc).length, fr: (rq && rq.choices && rq.choices[0] && rq.choices[0].finish_reason) || "" };
        } catch (e) { probe[cand[ci]] = { ms: Date.now() - tt, err: String((e && e.message) || e).slice(0, 160) }; }
        if (u.searchParams.get("one") === "1") break;
      }
      return json({ ok: true, probe: probe });
    }

    if (p === "/api/compare") {
      var cm = u.searchParams.get("m") || MODELS[0];
      if (!modelAllowed(cm)) return json({ error: "model refused: banned by standing directive", model: cm }, 400);
      var cmt = Number(u.searchParams.get("mt") || 2600);
      var cTopic = { id: "compare", cat: "math.NT", wiki: "Ultrametric space", a: "p-adic geometry", b: "musical tuning" };
      var cAnchors = [
        { kind: "paper", ref: "arXiv:2509.00001", title: "Ultrametric Hierarchies in Representation Learning", text: "We show that the tree-structured distance induced by a p-adic valuation on a finite alphabet yields a representation in which semantically nested categories are metrically nested. The ultrametric inequality forces every triangle to be isosceles with the two long sides equal, which makes hierarchical clustering exact rather than approximate. We report exact recovery on three benchmarks where agglomerative clustering fails." },
        { kind: "paper", ref: "arXiv:2509.00002", title: "Continued Fractions and Just Intonation", text: "The convergents of a continued fraction give the best rational approximations to a real number. Applied to frequency ratios, this recovers the historically attested tuning ladder: 3/2, 4/3, 5/4 and their compounds. The approximation error of a convergent falls monotonically, so the order of the ladder is forced rather than chosen. We tabulate the first nine convergents against the historical record." },
        { kind: "concept", ref: "https://en.wikipedia.org/wiki/Ultrametric_space", title: "Ultrametric space", text: "An ultrametric space is a metric space in which the triangle inequality is replaced by the strong triangle inequality: d(x,z) is at most the larger of d(x,y) and d(y,z). Every ultrametric space embeds isometrically in a complete one, and its closed balls are either disjoint or nested, never partially overlapping." }
      ];
      var cSys = [P_STYLE, "", P_ESSAY, "", "Output format: plain markdown only, no JSON, no code fences. First line: a single heading starting with # and the title. Include one section headed exactly: ## The strongest objection"].join(NL);
      var cUser = [anchorsBlock(cTopic, cAnchors, "(life context omitted for this comparison run)", "(taste context omitted for this comparison run)"), "", "Length: 900 to 1100 words. This is a requirement."].join(NL);
      var c0 = Date.now();
      try {
        var cr = await env.AI.run(cm, { messages: [{ role: "system", content: cSys }, { role: "user", content: cUser }], max_tokens: cmt, temperature: 0.7 });
        var cc = "";
        var crc = "";
        if (cr && typeof cr.response === "string" && cr.response.length) cc = cr.response;
        if (cr && cr.choices && cr.choices[0] && cr.choices[0].message) {
          if (!cc && typeof cr.choices[0].message.content === "string") cc = cr.choices[0].message.content;
          crc = cr.choices[0].message.reasoning_content || cr.choices[0].message.reasoning || "";
        }
        return json({
          model: cm, mt: cmt, ms: Date.now() - c0,
          clen: String(cc).length, rlen: String(crc).length,
          fr: (cr && cr.choices && cr.choices[0] && cr.choices[0].finish_reason) || "",
          words: wordCount(String(cc)),
          head: String(cc).slice(0, 1200),
          tail: String(cc).slice(-320)
        });
      } catch (e) {
        return json({ model: cm, mt: cmt, ms: Date.now() - c0, err: String((e && e.message) || e).slice(0, 300) });
      }
    }

    if (p === "/api/f" || p === "/api/feedback") {
      var slug = u.searchParams.get("slug") || "";
      var sig = u.searchParams.get("s") || u.searchParams.get("signal") || "";
      if (slug && sig) {
        try {
          await env.PERSONAL.prepare("INSERT INTO companion_feedback(slug, signal, note, created_at) VALUES(?,?,?,?)")
            .bind(slug, sig.slice(0, 40), (u.searchParams.get("note") || "").slice(0, 500), nowIso()).run();
        } catch (e) {}
      }
      return Response.redirect(new URL("/p/" + slug + (u.searchParams.get("k") ? "?k=" + u.searchParams.get("k") : ""), u.origin).toString(), 302);
    }

    if (p === "/api/pieces") {
      var lim = Number(u.searchParams.get("limit")) || 30;
      var f2 = u.searchParams.get("form") || "";
      var sql = f2
        ? "SELECT slug, form, title, subtitle, lede, word_count, day, created_at, anchor_json, quality_json FROM companion_pieces WHERE form = ? ORDER BY id DESC LIMIT ?"
        : "SELECT slug, form, title, subtitle, lede, word_count, day, created_at, anchor_json, quality_json FROM companion_pieces ORDER BY id DESC LIMIT ?";
      var st = f2 ? env.PERSONAL.prepare(sql).bind(f2, lim) : env.PERSONAL.prepare(sql).bind(lim);
      var rr = await st.all();
      return json({ ok: true, count: (rr.results || []).length, pieces: rr.results || [] });
    }

    if (p.indexOf("/api/piece/") === 0) {
      var s3 = p.slice(11);
      var q3 = await env.PERSONAL.prepare("SELECT * FROM companion_pieces WHERE slug = ?").bind(s3).all();
      var row3 = (q3.results || [])[0];
      if (!row3) return json({ error: { message: "not found" } }, 404);
      return json({ ok: true, piece: row3 });
    }

    if (p === "/api/runs") {
      var q4 = await env.PERSONAL.prepare("SELECT * FROM companion_runs ORDER BY id DESC LIMIT 40").all();
      return json({ ok: true, runs: q4.results || [] });
    }

    if (p === "/run" || p === "/api/run") {
      var want = u.searchParams.get("form") || "";
      if (!want || ["essay", "notes", "serial"].indexOf(want) < 0) want = RHYTHM[amsWeekday(new Date())];
      if (u.searchParams.get("async") === "1") {
        ctx.waitUntil((async function () {
          var o = await generate(env, want, {});
          if (o && o.ok && u.searchParams.get("mail") === "1") { await mailOut(env, o.slug, u.origin); }
        })().catch(function () {}));
        return json({ ok: true, accepted: true, form: want, note: "generating; poll /api/runs" });
      }
      var out = await generate(env, want, {});
      if (out.ok && u.searchParams.get("mail") === "1") {
        try {
          var pr = await env.PERSONAL.prepare("SELECT * FROM companion_pieces WHERE slug = ?").bind(out.slug).all();
          var prow = (pr.results || [])[0];
          if (prow) {
            prow.link = u.origin + "/p/" + out.slug + (env.COMPANION_KEY ? "?k=" + env.COMPANION_KEY : "");
            var m = await sendMail(env, prow, out.slug, prow.day);
            out.mail = m;
          }
        } catch (e) { out.mail = { ok: false, error: String((e && e.message) || e) }; }
      }
      return json(out);
    }

    var keyQS = env.COMPANION_KEY && u.searchParams.get("k") ? "?k=" + u.searchParams.get("k") : "";
    var cookie = "";
    if (env.COMPANION_KEY && u.searchParams.get("k")) {
      cookie = "pc_key=" + env.COMPANION_KEY + "; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax";
    }

    if (p === "/" || p === "") {
      var filter = u.searchParams.get("form") || "";
      var sql2 = filter
        ? "SELECT slug, form, title, lede, word_count, day FROM companion_pieces WHERE form = ? ORDER BY id DESC LIMIT 200"
        : "SELECT slug, form, title, lede, word_count, day FROM companion_pieces ORDER BY id DESC LIMIT 200";
      var st2 = filter ? env.PERSONAL.prepare(sql2).bind(filter) : env.PERSONAL.prepare(sql2);
      var rows = await st2.all();
      var res = html(renderIndex(rows.results || [], keyQS, filter));
      if (cookie) res.headers.set("Set-Cookie", cookie);
      return res;
    }

    if (p.indexOf("/p/") === 0) {
      var s = p.slice(3);
      var q = await env.PERSONAL.prepare("SELECT * FROM companion_pieces WHERE slug = ?").bind(s).all();
      var row = (q.results || [])[0];
      if (!row) return html(page("Not found", shell("<p>No such piece.</p>")), 404);
      var res2 = html(renderPiece(row, keyQS));
      if (cookie) res2.headers.set("Set-Cookie", cookie);
      return res2;
    }

    return json({ error: { message: "not found", version: VERSION } }, 404);
  },

  async scheduled(event, env, ctx) {
    var form = RHYTHM[amsWeekday(new Date())];
    ctx.waitUntil((async function () {
      var out = await generate(env, form, {});
      if (out.ok) {
        try {
          var pr = await env.PERSONAL.prepare("SELECT * FROM companion_pieces WHERE slug = ?").bind(out.slug).all();
          var prow = (pr.results || [])[0];
          if (prow && env.EMAIL) {
            prow.link = "https://personal-companion.q08.workers.dev/p/" + out.slug + (env.COMPANION_KEY ? "?k=" + env.COMPANION_KEY : "");
            await sendMail(env, prow, out.slug, prow.day);
          }
        } catch (e) {}
      }
    })());
  }
};
