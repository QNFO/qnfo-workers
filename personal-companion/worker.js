var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
import { WorkflowEntrypoint } from "cloudflare:workers";
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var __name22 = __name2;
var VERSION = "1.14.1-verify"; // 1.14.0 COMPANION-VERIFY-1 (pillar: personal; owner directive 2026-10-10: published content is 100% accurate, independently fact-checked, process-and-style-only prompts, fail closed): every piece must pass a deterministic grounding check (each capitalised name, year and figure occurs in its source material) and a two-family LLM fact-check before it is stored, shown or mailed; critic or reviewer outage publishes nothing; the forced publish of critic-rejected drafts (1.13.3) is removed; topics come from live Wikipedia and arXiv, the hard-coded topic table and example nouns in the prompts are gone; companion_audits / companion_retractions give an audit and public-retraction path (410 notice, /retractions, /api/retractions); pieces without a recorded source are withdrawn. 1.13.3 COMPANION-FORCED-FALLBACK-1 (#2106, #2126): the strongest critic-rejected draft that passed validation is published as gate forced once the companion has been silent for STALL_HOURS (12h); the forced branch was unreachable and nothing published for 81h. 1.13.1 COMPANION-FALLBACK-TUNE-1: gpt-oss-120b writes first (kimi-k2.6 spent the 300 s timeout per attempt), a short-only draft is extended instead of rewritten, and a run stops starting attempts after 10 min (#2126). 1.13.0 COMPANION-PUBLISH-STALL-AUTO-1: hourly companion_hours_since_last_piece metric, a self-filed and self-closed stall issue (12h + 2 failed runs). COMPANION-DEEPSEEK-402-FALLBACK-1: DeepSeek 401/402/403 opens a 60-min breaker and writer/critic fall through to Workers AI (kimi-k2.6 / glm-5.3 / gpt-oss-120b, role-ordered); the compose stage logs the call error. 1.12.3: the hourly tick creates companion_broadcasts, so the resume read never meets a missing table and the table shows the release runs live. 1.12.2 BROADCAST-BATCH-1 (agent_issues 2042, 2026-10-06, pillar personal): a piece broadcast and the daily digest no longer spend two suppression lookups plus a send per subscriber in one invocation (about 3 subrequests each, so a list above about 330 would hit the subrequest limit mid-send): opt-outs are read in batches of 50 (two queries per batch), at most SEND_CAP_PER_RUN sends go out per run, and a cursor in companion_broadcasts lets the hourly tick resume the rest. Suppression fails closed: if the opt-out lists cannot be read, nobody is mailed in that run and the cursor stays. // 1.12.0 PERSONAL-RESILIENCE-1 (#1953): a stale unsent brief claim is retried inside 08:00-12:00 Amsterdam; owner questions are claimed before the mail leaves (rolled back on a failed send, not re-sent when only the sent_at mark failed); an undeliverable question is flagged once per row; calendar_meta owner_notice_enabled is the owner kill switch for the brief and owner questions; the daily cap starts at the real Amsterdam midnight; notice size is bounded; subscriber sends page past 500 rows. // 1.11.0-brief-claim: 1.11.0 MORNING-BRIEF-CLAIM-1 + OWNER-QUESTION-UNDELIVERABLE-1: the brief claims its day before sending (failed send releases it), answered after-event questions drop out of "Questions waiting", and a question stuck at the attempt cap files one agent_issues row. // 1.10.2 EMAIL-CALLER-PROPS-1 (#1923): the EMAIL binding authenticates by service-binding props (caller personal-companion) instead of an EMAIL_API_KEY the worker never held (its only secret is DEEPSEEK_API_KEY), which is why every EMAIL-path send got 401. // 1.10.1 ANSWER-RATE-KIND-1: the answer-rate metric counts after-event questions only (triage refs are ISO weeks and could never match, which would have fired a false breach). // 1.10.0 CONNECTION-LEDGER-1 step 2 + CONNECTION-ENGAGEMENT-1: each hourly tick queues at most one follow-up question a day for a due Ledger person (template text, no model call) and refreshes metrics ledger_people_seen_twice and owner_question_answer_rate_14d in qnfo-audit.metric_registry. // 1.9.3 MORNING-BRIEF-OWNER-NOTICE-1: the morning brief goes out as an owner notice (sendOwnerNotice, same path as owner questions) so it is no longer silenced by the owner digest opt-out, which stays untouched so essay mail stays off; the brief lists waiting owner questions. // 1.9.2 OWNER-QUESTIONS-DIRECT-1: live probe got "email 401 unauthorized" from qnfo-email (EMAIL_API_KEY not valid), so owner questions send through the native SEND_EMAIL binding the morning brief already uses; the EMAIL path stays as fallback. // 1.9.1 OWNER-QUESTIONS-RENAME-1: qnfo-audit.owner_prompts already belongs to the fleet dashboard (different schema) // 1.8.0 CRON-SINGLE-TRIGGER-1 (#1785): one hourly trigger, CRON_TABLE in code
var MODELS = [
  "@cf/moonshotai/kimi-k2.6",
  "@cf/openai/gpt-oss-120b",
  "@cf/zai-org/glm-5.3"
];
var EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
var GEN_MAX_TOKENS = 14e3;
var CRITIQUE_TIMEOUT_MS = 3e4;
var EMBED_TIMEOUT_MS = 3e4;
var SIM_THRESHOLD = 0.9;
var WRITER_MODEL = "deepseek-chat";
var WRITER_MODEL_ESSAY = "deepseek-reasoner";
var CRITIC_MODEL = "deepseek-chat";
var WRITER_TIMEOUT_MS = 3e5;
var WRITER_URL = "https://api.deepseek.com/chat/completions";
var ACCEPT_FLOOR_NOTES = 4;
var ACCEPT_FLOOR_ESSAY = 5;
var MAX_PIECES_PER_DAY = 5;
var GEN_HOURS_UTC = [4, 8, 12, 16, 20];
var BANNED_MODELS = ["llama", "mistral", "gemma-7b", "gemma-4-26b", "qwen3-30b", "qwen2.5", "r1-distill", "qwq-", "-8b", "-11b", "-7b", "-flash", "-fp8-fast", "-lora", "-mini", "-small"];
function modelAllowed(m) {
  var low = String(m || "").toLowerCase();
  for (var bi = 0; bi < BANNED_MODELS.length; bi++) {
    if (low.indexOf(BANNED_MODELS[bi]) >= 0) return false;
  }
  return true;
}
__name(modelAllowed, "modelAllowed");
__name2(modelAllowed, "modelAllowed");
__name22(modelAllowed, "modelAllowed");
var NL = String.fromCharCode(10);
function L() {
  return Array.prototype.slice.call(arguments).join(NL);
}
__name(L, "L");
__name2(L, "L");
__name22(L, "L");
var RHYTHM = ["notes", "essay", "notes", "essay", "notes", "essay", "serial"];
// COMPANION-VERIFY-1 (1.14.0): there is no hard-coded topic list. pickTopic() draws the subject from live Wikipedia and arXiv.
var BANNED = [
  "delve",
  "tapestry",
  "landscape of",
  "realm of",
  "unlock the",
  "game-changer",
  "ever-evolving",
  "testament to",
  "nestled",
  "dive into",
  "let us explore",
  "let us now",
  "in today's world",
  "it is worth noting",
  "it's worth noting",
  "in conclusion",
  "plays a crucial role",
  "plays a vital role",
  "shed light on",
  "pave the way",
  "stands as a",
  "serves as a",
  "rich history",
  "in an era of",
  "navigate the complexities",
  "in the realm of",
  "rich tapestry",
  "as an ai",
  "i hope this",
  "in this essay",
  "this essay will",
  "we will explore",
  "qnfo",
  "qwav",
  "zenodo",
  "living-paper"
];
var P_STYLE = L(
  "You are writing for one reader: the person described in the reader profile below.",
  "Never reproduce any heading, label, bullet, or phrasing from the briefing, or from these instructions, inside the piece. The briefing is addressed to you, not to the reader.",
  "Not for an audience, not for a journal, not for a metric.",
  "The reader profile and recent-life notes tell you what he cares about and how he reads. They shape emphasis and register only; never state anything from them as a fact, and never list them back to him.",
  "He reads for the pleasure of a true thing well put. He is not impressed by fluency, by volume, or by enthusiasm.",
  "",
  "Voice: plain scholarly prose. Concrete before abstract. Short declaratives, occasionally a long sentence that earns its length.",
  "Open on a particular taken from the source material. Never on a generality. Present tense where possible. Active voice. Name the actor.",
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
  "Epistemic contract (every piece is fact-checked line by line against the source material before anyone sees it; one unsupported claim and it is discarded):",
  "- The SOURCE MATERIAL below is the only source of facts. Your own memory is not a source, even for things you are certain of.",
  "- Every name of a person, place, organisation, work or product, every date and year, every number and every quotation must appear in the source material. If it is not there, it is not in the piece.",
  "- Do not add examples, precedents, historical episodes or comparisons from outside the source material. A scenario you need must be an explicit hypothetical that names no real person, organisation, product, date or number.",
  "- Reasoning that follows from the source material is welcome. State it as reasoning (it follows that, if this holds then), never as a further reported fact.",
  "- State uncertainty at its true size. Never inflate confidence to make a piece land better. If the source material does not settle a point, say it does not.",
  "- The strongest objection to your central claim must appear in the piece, in the objector's own terms, with an honest assessment of how bad it is. It may rest on the source material or be pure logic; it may not rest on facts from outside it. Where it sits is your choice; do not give it the same heading or the same position twice in a row.",
  "",
  "The source material is raw research notes, usually encyclopedic extracts in a register you must not copy. Never reproduce their sentences. Banned habits they carry: definitional lead sentences, hedged attributions ('commentators have linked', 'observers note', 'a study found', 'some argue'), and disambiguation-style enumeration. If you need a definition, state it in your own words.",
  "Do not open with 'In [year], ...' unless the date itself is doing the work. Never repeat the opening move of one of your recent pieces (listed below). Pieces listed below are not sources.",
  "Reader verdicts (worth your time? yes/flat/no) are listed below. flat and no mean the piece did not earn its reading time; note what those pieces shared and do not repeat it. A recent no outweighs an old yes."
);
var P_ESSAY = L(
  "FORM: essay, 2000 to 2800 words. This is long-form. One sustained line of thought, carried to the end; do not stop while the argument is still thin, and do not pad.",
  "The subject is one thing. Write about the subject itself, in depth. Do not survey. Argue.",
  "Your argument must be a specific, falsifiable claim with consequences - something a knowledgeable reader could disagree with. It must not be an analogy, a family resemblance, or a restatement of the obvious.",
  "You are given real source material below. Mine it. Use the names, dates, numbers, mechanisms and cases it contains, and only those; a piece that could have been written without reading the sources has failed, and a piece that states anything the sources do not contain is discarded.",
  "Required content, not required sections: (a) the strongest objection to your central claim, in the objector's terms, weighed honestly; (b) what would have to be true for your claim to hold, and what observation would falsify it. Where these sit is your call - the objection can be a heading, two sentences mid-argument, or the whole last section. Do not end every piece with the same two moves.",
  "Vary the section plan. Your previous pieces are listed below; your structure must differ from each of their structures. A reader must not be able to predict your headings from the first page."
);
var P_NOTES = L(
  "FORM: connected field essay, 1800 to 2400 words, in 3 to 5 movements.",
  "Each movement is one concrete thing taken from the source material.",
  "Each movement is 350 to 550 words. Say precisely what the thing is, then develop what it connects to in his world - draw the connection out, do not merely state it. One through-line binds the movements into a single sustained piece, not a list.",
  "If only three of the supplied sources are worth his time, give three. Never pad to a count. Never include an item you would not defend.",
  "Give every item a short title.",
  "The set title names the subject, not the count. Banned pattern: a title that starts with a number followed by a plural noun."
);
var P_SERIAL = L(
  "FORM: serialized long-form, 1800 to 2400 words, continuing one ongoing work.",
  "You are given the RUNNING WORK: its thesis and the closing lines of the previous installment. They are part of the source material.",
  "Advance the argument. Do not recap beyond one sentence of orientation.",
  "This installment must add at least one claim that was not available before it, and it must close mid-motion on a question the next installment has to answer.",
  "Keep the running work's title. Put the installment number in the subtitle."
);
var P_CRITIQUE = L(
  "You are an adversarial reader. You dislike fluency. You are looking for reasons this piece is worthless.",
  "You are given the SOURCE MATERIAL the writer was allowed to use, and the piece.",
  "Score each dimension 0 to 10. Be harsh: a 7 means genuinely good.",
  "specificity: does it hang on concrete checkable particulars from the source material, or could it have been written about anything?",
  "argument: is there a claim that could be wrong, or only gestures?",
  "objection: is the stated objection the strongest available one, or a straw man?",
  "voice: plain scholarly prose free of filler, tells, and self-reference?",
  "grounding: does every concrete claim (name, date, number, event, quotation) trace to the source material? Score 0 if you find one that does not.",
  'Return JSON only: {"specificity":n,"argument":n,"objection":n,"voice":n,"grounding":n,"verdict":"accept" or "reject","why":"one sentence"}'
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
__name(json, "json");
__name2(json, "json");
__name22(json, "json");
function html(body, status) {
  return new Response(body, {
    status: status || 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}
__name(html, "html");
__name2(html, "html");
__name22(html, "html");
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(safeEqual, "safeEqual");
__name2(safeEqual, "safeEqual");
__name22(safeEqual, "safeEqual");
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
__name(authorized, "authorized");
__name2(authorized, "authorized");
__name22(authorized, "authorized");
async function sha16(s) {
  var data = new TextEncoder().encode(String(s));
  var digest = await crypto.subtle.digest("SHA-256", data);
  var bytes = new Uint8Array(digest).slice(0, 8);
  var out = "";
  for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}
__name(sha16, "sha16");
__name2(sha16, "sha16");
__name22(sha16, "sha16");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
__name2(nowIso, "nowIso");
__name22(nowIso, "nowIso");
function amsParts(d) {
  var fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false
  });
  var parts = {};
  var arr = fmt.formatToParts(d);
  for (var i = 0; i < arr.length; i++) parts[arr[i].type] = arr[i].value;
  return parts;
}
__name(amsParts, "amsParts");
__name2(amsParts, "amsParts");
__name22(amsParts, "amsParts");
function amsDayKey(d) {
  var p = amsParts(d);
  return p.year + "-" + p.month + "-" + p.day;
}
__name(amsDayKey, "amsDayKey");
__name2(amsDayKey, "amsDayKey");
__name22(amsDayKey, "amsDayKey");
function amsWeekday(d) {
  var names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var p = amsParts(d);
  var idx = names.indexOf(p.weekday);
  return idx < 0 ? d.getUTCDay() : idx;
}
__name(amsWeekday, "amsWeekday");
__name2(amsWeekday, "amsWeekday");
__name22(amsWeekday, "amsWeekday");
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
__name(squish, "squish");
__name2(squish, "squish");
__name22(squish, "squish");
function stripTags(s) {
  var out = "";
  var depth = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (c === "<") depth++;
    else if (c === ">") {
      if (depth > 0) depth--;
    } else if (depth === 0) out += c;
  }
  return squish(out);
}
__name(stripTags, "stripTags");
__name2(stripTags, "stripTags");
__name22(stripTags, "stripTags");
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
__name(sections, "sections");
__name2(sections, "sections");
__name22(sections, "sections");
function firstTag(chunk, tag) {
  var open = "<" + tag + ">";
  var close = "</" + tag + ">";
  var a = chunk.indexOf(open);
  if (a < 0) return "";
  var b = chunk.indexOf(close, a);
  if (b < 0) return "";
  return stripTags(chunk.slice(a + open.length, b));
}
__name(firstTag, "firstTag");
__name2(firstTag, "firstTag");
__name22(firstTag, "firstTag");
function parseJsonLoose(text) {
  if (!text) return null;
  var a = text.indexOf("{");
  var b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch (e) {
    return null;
  }
}
__name(parseJsonLoose, "parseJsonLoose");
__name2(parseJsonLoose, "parseJsonLoose");
__name22(parseJsonLoose, "parseJsonLoose");
function hasEmoji(s) {
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c >= 55296 && c <= 56319) {
      var lo = s.charCodeAt(i + 1);
      if (lo >= 56320 && lo <= 57343) {
        var cp = (c - 55296) * 1024 + (lo - 56320) + 65536;
        if (cp >= 126976 && cp <= 129791) return true;
        i++;
      }
    } else if (c >= 9728 && c <= 10175) {
      return true;
    } else if (c >= 8592 && c <= 8703) {
      return true;
    } else if (c === 65039) {
      return true;
    }
  }
  return false;
}
__name(hasEmoji, "hasEmoji");
__name2(hasEmoji, "hasEmoji");
__name22(hasEmoji, "hasEmoji");
function bannedHits(text) {
  var low = text.toLowerCase();
  var hits = [];
  for (var i = 0; i < BANNED.length; i++) {
    if (low.indexOf(BANNED[i]) >= 0) hits.push(BANNED[i]);
  }
  return hits;
}
__name(bannedHits, "bannedHits");
__name2(bannedHits, "bannedHits");
__name22(bannedHits, "bannedHits");
function isCap(s, i) {
  var c = s.charAt(i);
  return c >= "A" && c <= "Z";
}
__name(isCap, "isCap");
__name2(isCap, "isCap");
__name22(isCap, "isCap");
function isLow(s, i) {
  var c = s.charAt(i);
  return c >= "a" && c <= "z";
}
__name(isLow, "isLow");
__name2(isLow, "isLow");
__name22(isLow, "isLow");
function readWord(s, i) {
  var out = "";
  while (i < s.length) {
    var c = s.charAt(i);
    if (isLow(s, i) || isCap(s, i) || c === "-" || c >= "0" && c <= "9") {
      out += c;
      i++;
    } else break;
  }
  return { w: out, i };
}
__name(readWord, "readWord");
__name2(readWord, "readWord");
__name22(readWord, "readWord");
function anchorsText(anchors) {
  var parts = [];
  for (var i = 0; i < anchors.length; i++) parts.push(String(anchors[i].title || "") + " " + String(anchors[i].text || ""));
  return parts.join(" ");
}
function wordCount(s) {
  var n = 0;
  var inWord = false;
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    var ws = c === " " || c === NL || c === String.fromCharCode(13) || c === String.fromCharCode(9);
    if (ws) {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      n++;
    }
  }
  return n;
}
__name(wordCount, "wordCount");
__name2(wordCount, "wordCount");
__name22(wordCount, "wordCount");
async function embed(env, texts) {
  var resp = await aiRunAttr(env, "personal-companion", "embed", EMBED_MODEL, { text: texts }, { signal: AbortSignal.timeout(EMBED_TIMEOUT_MS) });
  var vecs = resp && resp.data || [];
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
__name(embed, "embed");
__name2(embed, "embed");
__name22(embed, "embed");
async function ensureSchema(env) {
  var stmts = [
    "CREATE TABLE IF NOT EXISTS companion_pieces (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, form TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT, lede TEXT, body_md TEXT NOT NULL, anchor_json TEXT, quality_json TEXT, word_count INTEGER, day TEXT, created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS companion_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_at TEXT NOT NULL, form TEXT, model TEXT, topic TEXT, status TEXT, detail TEXT, ms INTEGER)",
    "CREATE TABLE IF NOT EXISTS companion_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, signal TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS companion_series (id INTEGER PRIMARY KEY AUTOINCREMENT, series TEXT UNIQUE NOT NULL, title TEXT, thesis TEXT, chapters INTEGER DEFAULT 0, last_lines TEXT, updated_at TEXT)",
    "CREATE TABLE IF NOT EXISTS companion_seeds (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, source TEXT, form TEXT, used_at TEXT)",
    "CREATE TABLE IF NOT EXISTS companion_subscribers (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, status TEXT NOT NULL DEFAULT 'pending', token TEXT NOT NULL, created_at TEXT NOT NULL, confirmed_at TEXT)"
  ];
  for (var i = 0; i < stmts.length; i++) {
    await env.PERSONAL.prepare(stmts[i]).run();
  }
  await ensureAccuracySchema(env);
}
__name(ensureSchema, "ensureSchema");
__name2(ensureSchema, "ensureSchema");
__name22(ensureSchema, "ensureSchema");
async function loadProfile(env) {
  var r = await env.PERSONAL.prepare(
    "SELECT facet, label, statement FROM profile WHERE confidence >= 0.7 ORDER BY facet, label"
  ).all();
  var rows = r.results || [];
  var lines = [];
  var lastFacet = "";
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].facet !== lastFacet) {
      lastFacet = rows[i].facet;
      lines.push("");
      lines.push("[" + lastFacet + "]");
    }
    lines.push("- " + rows[i].label + ": " + squish(rows[i].statement || ""));
  }
  return lines.join(NL).slice(0, 7e3);
}
__name(loadProfile, "loadProfile");
__name2(loadProfile, "loadProfile");
__name22(loadProfile, "loadProfile");
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
  return lines.join(NL).slice(0, 6e3);
}
__name(loadLife, "loadLife");
__name2(loadLife, "loadLife");
__name22(loadLife, "loadLife");
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
    "SELECT f.slug, f.signal, f.note, p.title FROM companion_feedback f LEFT JOIN companion_pieces p ON p.slug = f.slug WHERE f.created_at > datetime('now','-14 days') ORDER BY f.id DESC LIMIT 60"
  ).all();
  var fr = fb.results || [];
  if (fr.length) {
    var yes = 0, flat = 0, no = 0, neg = [], pos = [];
    for (var j = 0; j < fr.length; j++) {
      var sgn = String(fr[j].signal || "");
      if (sgn === "good") yes++;
      else if (sgn === "flat") flat++;
      else no++;
      var t = squish(fr[j].title || fr[j].slug);
      if (sgn === "good") pos.push(t);
      else neg.push(t + "(" + sgn + ")");
    }
    lines.push("");
    lines.push("HOW HE REACTED \u2014 reader verdicts, worth your time? (last 14 days: yes=" + yes + " flat=" + flat + " no=" + no + ")");
    if (neg.length) lines.push("flat/no pieces \u2014 these did not earn their reading time; do not repeat what they shared: " + neg.slice(0, 6).join(" | "));
    if (pos.length) lines.push("yes pieces \u2014 earned it: " + pos.slice(0, 6).join(" | "));
    var rn = [];
    for (var j2 = 0; j2 < Math.min(fr.length, 8); j2++) rn.push("[" + fr[j2].signal + "] " + squish(fr[j2].title || fr[j2].slug));
    lines.push("most recent votes: " + rn.join(" | "));
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
  return lines.join(NL).slice(0, 6e3);
}
__name(loadContinuity, "loadContinuity");
__name2(loadContinuity, "loadContinuity");
__name22(loadContinuity, "loadContinuity");
// COMPANION-VERIFY-1 (1.14.0, owner directive 2026-10-10: generative instructions specify process and style only, no hard-coded
// topics). The subject is drawn live: a random encyclopedia article that has enough text to argue from, two articles it links
// to, and recent arXiv submissions (matching the subject when any exist, otherwise the newest submissions of any field). Nothing
// here names a field, a category or a subject. Nothing fetched is trusted beyond being the source material the piece is checked
// against; if too little can be fetched the run is blocked and publishes nothing.
var WIKI_API = "https://en.wikipedia.org/w/api.php";
var UA_FETCH = { "User-Agent": "Mozilla/5.0 (personal-companion)" };
var ANCHOR_MIN_CHARS = 2500;
var LINK_MIN_CHARS = 1200;
async function fetchRandomTitles(n) {
  var resp = await fetch(WIKI_API + "?action=query&list=random&rnnamespace=0&rnlimit=" + n + "&format=json", { headers: UA_FETCH, signal: AbortSignal.timeout(12e3) });
  if (!resp.ok) return [];
  var j = await resp.json();
  return ((j && j.query && j.query.random) || []).map(function (r) { return squish(r.title || ""); }).filter(Boolean);
}
async function fetchLinkedTitles(title) {
  var resp = await fetch(WIKI_API + "?action=query&prop=links&plnamespace=0&pllimit=60&redirects=1&format=json&titles=" + encodeURIComponent(title), { headers: UA_FETCH, signal: AbortSignal.timeout(12e3) });
  if (!resp.ok) return [];
  var j = await resp.json();
  var pages = j && j.query && j.query.pages || {};
  var pk = Object.keys(pages)[0];
  var links = (pages[pk] && pages[pk].links) || [];
  return links.map(function (l) { return squish(l.title || ""); }).filter(function (t) { return t && !/^\d{1,4}$/.test(t) && !/^(List|Lists|Index|Outline|Timeline) of /i.test(t); });
}
async function fetchArxivQuery(query, sortBy) {
  var url = "https://export.arxiv.org/api/query?search_query=" + query + "&sortBy=" + (sortBy || "submittedDate") + "&sortOrder=descending&max_results=8";
  var resp = await fetch(url, { headers: UA_FETCH, signal: AbortSignal.timeout(12e3) });
  if (!resp.ok) return [];
  var chunks = sections(await resp.text(), "entry");
  var out = [];
  for (var i = 0; i < chunks.length; i++) {
    var title = firstTag(chunks[i], "title");
    var summary = firstTag(chunks[i], "summary");
    var id = firstTag(chunks[i], "id");
    if (title && summary && squish(summary).length > 300) out.push({ kind: "paper", ref: id, title: squish(title), text: squish(summary).slice(0, 1200) });
  }
  return out;
}
function arxivWindow(nowMs) {
  function stamp(ms) { return new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 12); }
  return "submittedDate:[" + stamp(nowMs - 3 * 864e5) + "+TO+" + stamp(nowMs) + "]";
}
function pickSeeded(list, seed, k) {
  var arr = list.slice(), out = [], h = seed >>> 0;
  while (arr.length && out.length < k) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    out.push(arr.splice(h % arr.length, 1)[0]);
  }
  return out;
}
// Fits the anchors to the budget the writer, the grounding check and the reviewers all share.
var GROUND_MAX = 18000;
function fitAnchors(anchors) {
  var n = anchors.length || 1, per = Math.max(900, Math.floor(GROUND_MAX / n));
  return anchors.map(function (a) { return { kind: a.kind, ref: a.ref, title: a.title, text: String(a.text || "").slice(0, per) }; });
}
async function pickTopic(env, form) {
  var used = [];
  try {
    var r = await env.PERSONAL.prepare(
      "SELECT DISTINCT key FROM companion_seeds WHERE used_at > datetime('now','-10 days') OR (form = ? AND used_at > datetime('now','-1 day'))"
    ).bind(form).all();
    var rr = r.results || [];
    for (var i = 0; i < rr.length; i++) used.push(rr[i].key);
  } catch (e) {
    used = [];
  }
  var cooled = {};
  try {
    var cr = await env.PERSONAL.prepare(
      "SELECT topic, SUM(CASE WHEN status IN ('failed','blocked') THEN 1 ELSE 0 END) f FROM companion_runs WHERE topic != '' AND run_at > datetime('now','-14 days') GROUP BY topic"
    ).all();
    var crr = cr.results || [];
    for (var ci = 0; ci < crr.length; ci++) if (Number(crr[ci].f) >= 2) cooled[crr[ci].topic] = true;
  } catch (e) {
    cooled = {};
  }
  var seed = (Date.now() ^ (Math.random() * 4294967296)) >>> 0;
  var titles = [];
  try { titles = await fetchRandomTitles(14); } catch (eT) { titles = []; }
  var anchors = [], primary = null;
  for (var t = 0; t < titles.length && !primary && t < 8; t++) {
    var key = "wiki:" + titles[t];
    if (used.indexOf(key) >= 0 || cooled[key]) continue;
    var art = null;
    try { art = await fetchWiki(titles[t]); } catch (eA) { art = null; }
    if (art && art.text.length >= ANCHOR_MIN_CHARS) primary = art;
  }
  if (!primary) return { id: "none", a: "", b: "", anchors: [] };
  anchors.push(primary);
  var linked = [];
  try { linked = pickSeeded(await fetchLinkedTitles(primary.title), seed, 6); } catch (eL) { linked = []; }
  var gotLinks = 0;
  for (var li = 0; li < linked.length && gotLinks < 2; li++) {
    try {
      var la = await fetchWiki(linked[li]);
      if (la && la.text.length >= LINK_MIN_CHARS) { anchors.push(la); gotLinks++; }
    } catch (eW) {}
  }
  var papers = [];
  try { papers = await fetchArxivQuery("all:%22" + encodeURIComponent(primary.title) + "%22", "relevance"); } catch (eP) { papers = []; }
  if (!papers.length) { try { papers = pickSeeded(await fetchArxivQuery(arxivWindow(Date.now())), seed, 8); } catch (eP2) { papers = []; } }
  for (var pi = 0; pi < papers.length && pi < 2; pi++) anchors.push(papers[pi]);
  var pick = { id: "wiki:" + primary.title, a: primary.title, b: anchors.length > 1 ? anchors[1].title : "", anchors: fitAnchors(anchors) };
  try {
    await env.PERSONAL.prepare(
      "INSERT INTO companion_seeds(key, source, form, used_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET used_at=excluded.used_at, form=excluded.form"
    ).bind(pick.id, "live", form, nowIso()).run();
  } catch (e) {
    try {
      await env.PERSONAL.prepare("INSERT OR IGNORE INTO companion_seeds(key, source, form, used_at) VALUES(?,?,?,?)").bind(pick.id, "live", form, nowIso()).run();
    } catch (e2) {
    }
  }
  return pick;
}
async function fetchWiki(title) {
  var url = "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exintro=0&redirects=1&format=json&titles=" + encodeURIComponent(title);
  var resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (personal-companion)" }, signal: AbortSignal.timeout(12e3) });
  if (!resp.ok) return null;
  var j = await resp.json();
  var pages = j && j.query && j.query.pages || {};
  var pk = Object.keys(pages)[0];
  var p = pages[pk] || {};
  var text = squish(p.extract || "");
  if (!text) return null;
  return { kind: "concept", ref: "https://en.wikipedia.org/wiki/" + encodeURIComponent(p.title || title), title: squish(p.title || title), text: text.slice(0, 12e3) };
}
__name(fetchWiki, "fetchWiki");
__name2(fetchWiki, "fetchWiki");
__name22(fetchWiki, "fetchWiki");
// COMPANION-DEEPSEEK-402-FALLBACK-1 (1.13.0, 2026-10-07, pillar core): the owner left the DeepSeek balance empty
// (decision 2026-10-05, #1986), every writer and critic call got HTTP 402 in under a second, and reading.q08.org
// published nothing after 2026-10-05 08:06Z (companion_runs: "composed 0" x5 per run, steward "collapse" every hour).
// Now a DeepSeek failure falls through to Workers AI; a 401/402/403 opens a 60-minute breaker so later calls skip the
// paid round trip. The fallback order differs by role so writer and critic stay on different models.
var DS_BREAKER_MS = 36e5;
var dsBreakerUntil = 0;
var lastCallFallback = false; // COMPANION-FALLBACK-FLOOR-1: true when the latest model call was answered by Workers AI
// Measured 2026-10-07 (400-word probe, max_tokens 6000): kimi-k2.6 402 words in 60s, gpt-oss-120b 400 words in 26s,
// glm-5.3 spent all 6000 tokens reasoning and returned no prose, so it is last everywhere. Reasoning models need room
// beyond the prose, so a fallback call gets at least FB_MIN_TOKENS and FB_MIN_TIMEOUT_MS.
var CF_FALLBACK = {
  // COMPANION-FALLBACK-TUNE-1 (1.13.1): gpt-oss-120b first for writing. Live run 2026-10-07 12:00Z: kimi-k2.6 used the full
  // 300 s writer timeout on every essay attempt before gpt-oss answered (attempts at 333 s and 667 s), so the run was
  // killed by the cron wall after three attempts with no piece.
  essay: ["@cf/openai/gpt-oss-120b", "@cf/moonshotai/kimi-k2.6", "@cf/zai-org/glm-5.3"],
  writer: ["@cf/openai/gpt-oss-120b", "@cf/moonshotai/kimi-k2.6", "@cf/zai-org/glm-5.3"],
  critic: ["@cf/moonshotai/kimi-k2.6", "@cf/openai/gpt-oss-120b", "@cf/zai-org/glm-5.3"]
};
var FB_MIN_TOKENS = 4e3;
var FB_MIN_TIMEOUT_MS = 9e4;
function fallbackChain(model, role) {
  if (role && CF_FALLBACK[role]) return CF_FALLBACK[role];
  return String(model || "").indexOf("reasoner") >= 0 ? CF_FALLBACK.essay : CF_FALLBACK.writer;
}
function cfText(r) {
  if (!r) return { text: "", rlen: 0 };
  var c = "", rc = "";
  if (typeof r.response === "string") c = r.response;
  var m = r.choices && r.choices[0] && r.choices[0].message;
  if (m) {
    if (!c && typeof m.content === "string") c = m.content;
    rc = m.reasoning_content || m.reasoning || "";
  }
  return { text: c, rlen: String(rc || "").length };
}
async function callWorkersAI(env, messages, maxTokens, timeoutMs, chain, prevErr) {
  var errs = prevErr ? [prevErr] : [];
  for (var i = 0; i < chain.length; i++) {
    var m = chain[i];
    if (!modelAllowed(m)) continue;
    try {
      var r = await aiRunAttr(env, "personal-companion", "compose-fallback", m,
        { messages: messages, max_tokens: Math.min(Math.max(Number(maxTokens) || 0, FB_MIN_TOKENS), 14e3), temperature: 0.7 },
        { gateway: { id: "default" }, signal: AbortSignal.timeout(Math.max(Number(timeoutMs) || 0, FB_MIN_TIMEOUT_MS)) });
      var t = cfText(r);
      if (typeof t.text === "string" && t.text.trim().length > 80) return { model: m, text: t.text };
      errs.push(m + ": empty (clen=" + String(t.text || "").length + " rlen=" + t.rlen + ")");
    } catch (e) {
      errs.push(m + ": " + String(e && e.message || e).slice(0, 160));
    }
  }
  return { model: chain[0], text: null, error: errs.join(" | ").slice(0, 600) };
}
async function callModel(env, messages, maxTokens, timeoutMs, model, role) {
  var useModel = model || WRITER_MODEL;
  var isReasoner = String(useModel).indexOf("reasoner") >= 0;
  var chain = fallbackChain(useModel, role);
  lastCallFallback = false;
  if (!env.DEEPSEEK_API_KEY || Date.now() < dsBreakerUntil) {
    lastCallFallback = true;
    return await callWorkersAI(env, messages, maxTokens, timeoutMs, chain, Date.now() < dsBreakerUntil ? "deepseek breaker open" : "no deepseek key");
  }
  var dsErr = "";
  try {
    var mt = isReasoner ? Math.min(Number(maxTokens) || 16e3, 16e3) : Math.min(Number(maxTokens) || 4e3, 14e3);
    var body = { model: useModel, messages, max_tokens: mt, stream: false };
    body.temperature = isReasoner ? 1 : 0.7;
    var resp = await fetch(WRITER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.DEEPSEEK_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs || 9e4)
    });
    if (!resp.ok) {
      var errText = "";
      try {
        errText = await resp.text();
      } catch (e2) {
      }
      if (resp.status === 401 || resp.status === 402 || resp.status === 403) dsBreakerUntil = Date.now() + DS_BREAKER_MS;
      dsErr = useModel + ": HTTP " + resp.status + " " + errText.slice(0, 160);
    } else {
      var j = await resp.json();
      var msg = j && j.choices && j.choices[0] && j.choices[0].message;
      var text = msg && msg.content || "";
      if (typeof text === "string" && text.trim().length > 80) return { model: useModel, text };
      dsErr = useModel + ": " + (msg && msg.reasoning_content ? "reasoning only, rlen=" + String(msg.reasoning_content).length : "empty");
    }
  } catch (e) {
    dsErr = useModel + ": " + String(e && e.message || e).slice(0, 160);
  }
  lastCallFallback = true;
  return await callWorkersAI(env, messages, maxTokens, timeoutMs, chain, dsErr);
}
__name(callModel, "callModel");
__name2(callModel, "callModel");
__name22(callModel, "callModel");
function renderInline(s) {
  var out = "";
  var i = 0;
  while (i < s.length) {
    if (s.charAt(i) === "*" && s.charAt(i + 1) === "*") {
      var end = s.indexOf("**", i + 2);
      if (end > -1) {
        out += "<strong>" + s.slice(i + 2, end) + "</strong>";
        i = end + 2;
        continue;
      }
    }
    out += s.charAt(i);
    i++;
  }
  return out;
}
__name(renderInline, "renderInline");
__name2(renderInline, "renderInline");
__name22(renderInline, "renderInline");
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
__name(escHtml, "escHtml");
__name2(escHtml, "escHtml");
__name22(escHtml, "escHtml");
function renderBody(md) {
  var lines = String(md || "").split(NL);
  var out = [];
  var buf = [];
  var listOpen = false;
  function flushP() {
    if (buf.length) {
      out.push("<p>" + renderInline(escHtml(buf.join(" "))) + "</p>");
      buf = [];
    }
  }
  __name(flushP, "flushP");
  __name2(flushP, "flushP");
  __name22(flushP, "flushP");
  function closeList() {
    if (listOpen) {
      out.push("</ul>");
      listOpen = false;
    }
  }
  __name(closeList, "closeList");
  __name2(closeList, "closeList");
  __name22(closeList, "closeList");
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].trim();
    if (!t) {
      flushP();
      closeList();
      continue;
    }
    if (t.indexOf("### ") === 0) {
      flushP();
      closeList();
      out.push("<h3>" + renderInline(escHtml(t.slice(4))) + "</h3>");
      continue;
    }
    if (t.indexOf("## ") === 0) {
      flushP();
      closeList();
      out.push("<h2>" + renderInline(escHtml(t.slice(3))) + "</h2>");
      continue;
    }
    if (t.indexOf("# ") === 0) {
      flushP();
      closeList();
      out.push("<h2>" + renderInline(escHtml(t.slice(2))) + "</h2>");
      continue;
    }
    if (t.indexOf("- ") === 0) {
      flushP();
      if (!listOpen) {
        out.push("<ul>");
        listOpen = true;
      }
      out.push("<li>" + renderInline(escHtml(t.slice(2))) + "</li>");
      continue;
    }
    if (t.indexOf("> ") === 0) {
      flushP();
      closeList();
      out.push("<blockquote>" + renderInline(escHtml(t.slice(2))) + "</blockquote>");
      continue;
    }
    buf.push(t);
  }
  flushP();
  closeList();
  return out.join(NL);
}
__name(renderBody, "renderBody");
__name2(renderBody, "renderBody");
__name22(renderBody, "renderBody");
function formLabel(f) {
  if (f === "essay") return "Essay";
  if (f === "notes") return "Field notes";
  if (f === "serial") return "Long-form";
  return f;
}
__name(formLabel, "formLabel");
__name2(formLabel, "formLabel");
__name22(formLabel, "formLabel");
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
  return "<!doctype html><html lang=en><head><meta charset=utf-8><meta name=robots content=noindex><meta name=viewport content=" + String.fromCharCode(34) + "width=device-width,initial-scale=1" + String.fromCharCode(34) + "><title>" + escHtml(title) + "</title><link rel=alternate type=application/rss+xml title=Reading href=/feed.xml><meta name=description content='A personal companion that writes one piece at a time - essays, field notes, and long-form serials.'><style>" + CSS + "</style>" + (extraHead || "") + "</head><body><div class=wrap>" + inner + "</div><script src='https://fleet.qnfo.org/ctl.js' defer></script></body></html>";
}
__name(page, "page");
__name2(page, "page");
__name22(page, "page");
function shell(inner) {
  return "<header class=mast><h1><a href=/>Reading</a></h1><p>Written for one reader. Private.</p><nav class=forms><a href=/subscribe>subscribe</a><a href=/feed.xml>rss</a></nav></header>" + inner;
}
__name(shell, "shell");
__name2(shell, "shell");
__name22(shell, "shell");
function renderIndex(pieces, keyQS, filter) {
  var items = [];
  for (var i = 0; i < pieces.length; i++) {
    var p = pieces[i];
    items.push("<li><a class=t href=" + String.fromCharCode(34) + "/p/" + p.slug + keyQS + String.fromCharCode(34) + ">" + escHtml(p.title) + "</a><div class=m>" + formLabel(p.form) + " &middot; " + p.day + " &middot; " + p.word_count + " words</div>" + (p.lede ? "<div class=l>" + escHtml(p.lede) + "</div>" : "") + "</li>");
  }
  var nav = "<nav class=forms><a href=/" + keyQS + ">all</a>";
  nav += "<a href=/?form=essay" + (keyQS ? "&" + keyQS.slice(1) : "") + ">essays</a>";
  nav += "<a href=/?form=notes" + (keyQS ? "&" + keyQS.slice(1) : "") + ">field notes</a>";
  nav += "<a href=/?form=serial" + (keyQS ? "&" + keyQS.slice(1) : "") + ">long-form</a></nav>";
  var body = nav + (items.length ? "<ul class=idx>" + items.join("") + "</ul>" : "<p>Nothing yet.</p>");
  return page("Reading", shell(body));
}
__name(renderIndex, "renderIndex");
__name2(renderIndex, "renderIndex");
__name22(renderIndex, "renderIndex");
function renderPiece(p, keyQS) {
  var bodyMd = String(p.body_md || "");
  var startsHeading = /^\s*#/.test(bodyMd);
  var ledeHtml = !startsHeading && p.lede ? "<p class=lede>" + escHtml(p.lede) + "</p>" : "";
  var body = "<div class=meta>" + formLabel(p.form) + " &middot; " + p.day + " &middot; " + p.word_count + " words</div><h2>" + escHtml(p.title) + "</h2>" + (p.subtitle ? "<p class=meta>" + escHtml(p.subtitle) + "</p>" : "") + ledeHtml + renderBody(bodyMd);
  var fb = "<div class=fb>Was this worth your time? <a href=/api/f?slug=" + p.slug + "&s=good>yes</a><a href=/api/f?slug=" + p.slug + "&s=flat>flat</a><a href=/api/f?slug=" + p.slug + "&s=no>no</a></div>";
  var foot = "<footer><a href=/ " + keyQS + ">back to index</a></footer>";
  return page(p.title, shell(body + fb + foot));
}
__name(renderPiece, "renderPiece");
__name2(renderPiece, "renderPiece");
__name22(renderPiece, "renderPiece");
function anchorsBlock(topic, anchors, life, profile) {
  var lines = [];
  lines.push("--- briefing. Never reproduce any wording from this briefing in the piece. ---");
  lines.push("subject: " + topic.a);
  lines.push("The other items are supporting source material: use those that bear on the subject, ignore the rest. Do not force a connection the sources do not make.");
  lines.push("");
  lines.push("SOURCE MATERIAL, concrete and checkable; the only things you may assert as fact (nothing outside it, not even what you are sure is true):");
  for (var i = 0; i < anchors.length; i++) {
    var a = anchors[i];
    lines.push("[" + (i + 1) + "] " + a.kind + " :: " + a.title);
    lines.push("    ref: " + a.ref);
    lines.push("    " + a.text);
    lines.push("");
  }
  lines.push("who the reader is; shapes emphasis and register only, is not source material and supports no factual claim:");
  lines.push(profile);
  lines.push("");
  lines.push("his recent life; shapes emphasis only, is not source material, never list it back at him:");
  lines.push(life);
  return lines.join(NL).slice(0, 32e3);
}
__name(anchorsBlock, "anchorsBlock");
__name2(anchorsBlock, "anchorsBlock");
__name22(anchorsBlock, "anchorsBlock");
function countHeadings(md, level) {
  var mark = level === 3 ? "### " : "## ";
  var lines = String(md).split(NL);
  var n = 0;
  for (var i = 0; i < lines.length; i++) if (lines[i].trim().indexOf(mark) === 0) n++;
  return n;
}
__name(countHeadings, "countHeadings");
__name2(countHeadings, "countHeadings");
__name22(countHeadings, "countHeadings");
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
__name(extractSection, "extractSection");
__name2(extractSection, "extractSection");
__name22(extractSection, "extractSection");
function extractLede(md) {
  var lines = String(md).split(NL);
  var i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  var startsHeading = i < lines.length && lines[i].trim().indexOf("#") === 0;
  while (i < lines.length && lines[i].trim().indexOf("#") === 0) {
    i++;
    while (i < lines.length && !lines[i].trim()) i++;
  }
  var buf = [];
  while (i < lines.length) {
    var t = lines[i].trim();
    if (!t) break;
    if (t.indexOf("#") === 0) break;
    if (t.indexOf("- ") === 0 || t.indexOf("> ") === 0) break;
    buf.push(t);
    i++;
  }
  var lede = buf.join(" ").trim();
  var rest = startsHeading ? String(md).trim() : lines.slice(i).join(NL).trim();
  return { lede, rest, startsHeading };
}
__name(extractLede, "extractLede");
__name2(extractLede, "extractLede");
__name22(extractLede, "extractLede");
async function composePiece(env, form, topic, anchors, life, profile, continuity, feedback, revision) {
  var formContract = form === "essay" ? P_ESSAY : form === "serial" ? P_SERIAL : P_NOTES;
  var outRule = form === "notes" ? "Output format: plain markdown only, no JSON, no code fences. First line: a single heading starting with # and a short title for the whole set. Then each movement as its own ## heading followed by several developed paragraphs." : "Output format: plain markdown only, no JSON, no code fences. First line: a single heading starting with # and the title. Use ## for sections. The strongest objection must appear in the piece, but never under the same heading or in the same position twice in a row; place it where the argument needs it";
  var P_ADV1 = L("ADVERSARIAL-REASONING-1 (binding): DISAGREE-WITH-EVIDENCE - state disagreement plainly with counter-evidence when evidence contradicts the user/source/corpus; SEEK-DISCONFIRMATION - name and test the strongest argument against the current answer; EXPOSE-FAILURE-MODES - state at least one concrete failure mode per substantive response; LABEL-UNCERTAINTY - tie confidence to evidence, never inflate it, and say I do not know with a reason when required.");
  var sys = [P_STYLE, P_ADV1, "", formContract, "", outRule].join(NL);
  var concreteRule = "Every claim must be tied to a named, checkable particular that appears in the source material, and you may name nothing that does not appear there. A sentence that could have been written without the source material is a failed sentence. Write the title and every heading in sentence case: capitalise only the first word and names that appear in the source material.";
  var lenRule = concreteRule + " " + (form === "essay" ? "Length: 2000 to 2800 words. This is a requirement, not a suggestion." : form === "serial" ? "Length: 1800 to 2400 words. This is a requirement, not a suggestion." : "Length: 1800 to 2400 words, in 3 to 5 movements. This is a requirement, not a suggestion.");
  var user = [anchorsBlock(topic, anchors, life, profile), "", lenRule, "", continuity, feedback ? "A previous draft was rejected by an adversarial reader for this reason: " + feedback + " Write a better draft that fixes that." : "", revision ? NL + factRevisionPrompt(revision.problems) + NL + NL + "--- DRAFT TO REVISE ---" + NL + "# " + String(revision.title || "") + NL + NL + String(revision.body_md || "").slice(0, 24e3) : ""].join(NL);
  var writerModel = form === "notes" ? WRITER_MODEL : WRITER_MODEL_ESSAY;
  var r = await callModel(env, [{ role: "system", content: sys }, { role: "user", content: user }], GEN_MAX_TOKENS, WRITER_TIMEOUT_MS, writerModel, form === "notes" ? "writer" : "essay");
  if (!r || !r.text) {
    var errMsg = r && r.error ? r.error : "callModel returned null";
    return { piece: null, model: r && r.model || writerModel, raw: "", error: errMsg };
  }
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
  if (!title) title = topic.b ? topic.a + " and " + topic.b : topic.a;
  var objection = extractSection(md, "objection");
  var ledeObj = extractLede(md);
  return {
    piece: {
      title: title.slice(0, 300),
      subtitle: "",
      lede: ledeObj.lede,
      body_md: ledeObj.rest,
      objection: objection || (form === "notes" ? "Each item stands or falls on its own." : "")
    },
    model: r.model,
    raw: String(r.text || "")
  };
}
__name(composePiece, "composePiece");
__name2(composePiece, "composePiece");
__name22(composePiece, "composePiece");
async function critiquePiece(env, piece, form, ground) {
  var band = form === "essay" ? "2000 to 2800 words" : form === "serial" ? "1800 to 2400 words" : "1800 to 2400 words in 3 to 5 movements";
  var user = "SOURCE MATERIAL:" + NL + String(ground || "").slice(0, GROUND_MAX + 2000) + NL + NL + "FORM: " + form + " (" + band + ")" + NL + NL + "TITLE: " + piece.title + NL + "LEDE: " + (piece.lede || "") + NL + "STATED OBJECTION: " + (piece.objection || "") + NL + NL + "BODY:" + NL + piece.body_md;
  var r = await callModel(env, [{ role: "system", content: P_CRITIQUE }, { role: "user", content: user }], 900, CRITIQUE_TIMEOUT_MS, CRITIC_MODEL, "critic");
  return r && r.text ? parseJsonLoose(r.text) : null;
}
__name(critiquePiece, "critiquePiece");
__name2(critiquePiece, "critiquePiece");
__name22(critiquePiece, "critiquePiece");
var GEN_BUDGET_MS = 600e3;
var LENGTH_FLOOR = { essay: 2000, serial: 1800, notes: 1700 };
// COMPANION-FALLBACK-FLOOR-1: measured 2026-10-07/08, 40+ gpt-oss-120b drafts all landed at 1100-1750 words and none passed the
// 1700-2000 floor, so nothing published for 78h. A draft written by the Workers AI fallback is held to 70% of the floor
// (the critic, banned-phrase and citation gates are unchanged); DeepSeek drafts keep the full floor.
var FALLBACK_FLOOR_RATIO = 0.7;
function floorFor(form) {
  var f = LENGTH_FLOOR[form];
  return f && lastCallFallback ? Math.round(f * FALLBACK_FLOOR_RATIO) : f;
}
// COMPANION-FALLBACK-TUNE-1: when the only validation problem is a length below the form's floor, the next attempt gets the
// draft itself and is asked to extend it (keep every claim, title and section; deepen the argument from the anchors) to the
// floor plus a margin. Any other problem, or a draft that is too long, returns null and the normal retry feedback stands.
function expandFeedback(problems, form, piece) {
  if (!problems || problems.length !== 1) return null;
  var m = /^(essay|serial|notes) length (\d+)$/.exec(String(problems[0]));
  if (!m || m[1] !== form) return null;
  var wc = Number(m[2]), floor = floorFor(form);
  if (!floor || wc >= floor) return null;
  var target = floor + 300;
  return "The previous draft was good but too short: " + wc + " words against a floor of " + floor + ". Do not start over. " +
    "Return the same piece, same title and the same sections in the same order, extended to at least " + target + " words: " +
    "deepen each section with more specific particulars from the source material (names, numbers, mechanisms, cases) and a fuller " +
    "treatment of the strongest objection. Keep every sentence that is already there unless extending it. The draft follows." + NL + NL +
    "# " + String(piece && piece.title || "") + NL + NL + String(piece && piece.body_md || "").slice(0, 24e3);
}
function validatePiece(piece, form, ground) {
  var problems = [];
  if (!piece || !piece.body_md) return { ok: false, problems: ["no body"] };
  var md = String(piece.body_md);
  var wc = wordCount(md);
  if (form === "essay" && (wc < floorFor("essay") || wc > 3200)) problems.push("essay length " + wc);
  if (form === "serial" && (wc < floorFor("serial") || wc > 2800)) problems.push("serial length " + wc);
  if (form === "notes") {
    var items = countHeadings(md, 2);
    if (items < 3) problems.push("notes items " + items);
    if (wc < floorFor("notes") || wc > 3200) problems.push("notes length " + wc);
  }
  var hits = bannedHits(md + " " + String(piece.title || "") + " " + String(piece.lede || ""));
  if (hits.length) problems.push("banned: " + hits.join(", "));
  if (hasEmoji(md)) problems.push("emoji present");
  if (!piece.title || String(piece.title).length < 4) problems.push("no title");
  if (form !== "notes" && wc >= 700 && (!piece.objection || String(piece.objection).length < 40)) problems.push("objection too thin");
  // COMPANION-VERIFY-1: when the source material is given, every name, year and figure must occur in it.
  if (ground !== undefined && ground !== null) {
    var gp = groundingProblems(pieceText(piece), ground, {});
    for (var gi = 0; gi < gp.length; gi++) problems.push("grounding: " + gp[gi]);
  }
  return { ok: problems.length === 0, problems, words: wc };
}
__name(validatePiece, "validatePiece");
__name2(validatePiece, "validatePiece");
__name22(validatePiece, "validatePiece");
async function similarExists(env, text, excludeSlug) {
  try {
    var vecs = await embed(env, [text.slice(0, 6e3)]);
    if (!vecs.length) return null;
    var res = await env.VZ.query(vecs[0], { topK: 3, returnMetadata: "all" });
    var ms = res && res.matches || [];
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      var isPiece = m.metadata && String(m.metadata.kind || "") === "companion-piece";
      if (isPiece && m.score >= SIM_THRESHOLD && String(m.metadata.slug || "") !== excludeSlug) {
        return { slug: m.metadata.slug, score: m.score };
      }
    }
  } catch (e) {
  }
  return null;
}
__name(similarExists, "similarExists");
__name2(similarExists, "similarExists");
__name22(similarExists, "similarExists");
async function emitReadingSignal(env, piece, form, slug) {
  try {
    if (!env.AUDIT) return;
    var body = String(piece.body_md || "");
    var paras = body.split("\n").map(function(l) {
      return l.trim();
    }).filter(function(l) {
      return l.length > 80;
    });
    var openQ = paras.length ? paras[paras.length - 1].slice(0, 400) : "";
    await env.AUDIT.prepare(
      "INSERT OR IGNORE INTO signals (id, ts, source, source_ref, content, open_questions, evidential_weight, domain, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
    ).bind(
      "reading:" + slug,
      nowIso(),
      "reading",
      "https://reading.q08.org/p/" + slug,
      String(piece.title || "").slice(0, 300),
      JSON.stringify([openQ]),
      0.55,
      "fleet",
      "open",
      nowIso()
    ).run();
  } catch (e) {
  }
}
__name(emitReadingSignal, "emitReadingSignal");
async function persistPiece(env, piece, form, topic, model, quality, words, ground) {
  var day = amsDayKey(/* @__PURE__ */ new Date());
  var salt = String(Date.now()) + topic.id + form;
  var slug = day + "-" + form + "-" + await sha16(salt);
  var anchorJson = JSON.stringify({ topic: topic.id, seam: [topic.a, topic.b].filter(Boolean), refs: (topic.anchors || []).map(function (a) { return a.ref; }) });
  await env.PERSONAL.prepare(
    "INSERT OR IGNORE INTO companion_pieces(slug, form, title, subtitle, lede, body_md, anchor_json, quality_json, word_count, day, created_at, ground_text) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(slug, form, String(piece.title).slice(0, 300), String(piece.subtitle || "").slice(0, 300), String(piece.lede || "").slice(0, 2e3), String(piece.body_md), anchorJson, JSON.stringify(quality || {}), words, day, nowIso(), String(ground || "")).run();
  emitReadingSignal(env, piece, form, slug).catch(function() {
  });
  try {
    var vecs = await embed(env, [String(piece.title) + NL + String(piece.lede || "") + NL + String(piece.body_md).slice(0, 5e3)]);
    if (vecs.length && env.VZ) {
      await env.VZ.upsert([{
        id: "companion-" + slug,
        values: vecs[0],
        metadata: { kind: "companion-piece", slug, form, title: String(piece.title).slice(0, 200), day }
      }]);
    }
  } catch (e) {
  }
  try {
    await env.MEDIA.put("companion/" + day + "/" + slug + ".md", String(piece.body_md), {
      httpMetadata: { contentType: "text/markdown; charset=utf-8" }
    });
  } catch (e) {
  }
  if (form === "serial") {
    var lines = String(piece.body_md).trim().split(NL);
    var tail = lines.slice(Math.max(0, lines.length - 3)).join(" ");
    var cur = await env.PERSONAL.prepare("SELECT id, chapters, title FROM companion_series ORDER BY id DESC LIMIT 1").all();
    var c = (cur.results || [])[0];
    if (c) {
      await env.PERSONAL.prepare("UPDATE companion_series SET chapters = ?, last_lines = ?, updated_at = ? WHERE id = ?").bind((c.chapters || 0) + 1, tail.slice(0, 800), nowIso(), c.id).run();
    } else {
      await env.PERSONAL.prepare("INSERT INTO companion_series(series, title, thesis, chapters, last_lines, updated_at) VALUES(?,?,?,?,?,?)").bind(topic.id + "-serial", String(piece.title).slice(0, 300), String(piece.lede || "").slice(0, 600), 1, tail.slice(0, 800), nowIso()).run();
    }
  }
  return slug;
}
__name(persistPiece, "persistPiece");
__name2(persistPiece, "persistPiece");
__name22(persistPiece, "persistPiece");
async function logRun(env, form, model, topic, status, detail, ms) {
  try {
    await env.PERSONAL.prepare(
      "INSERT INTO companion_runs(run_at, form, model, topic, status, detail, ms) VALUES(?,?,?,?,?,?,?)"
    ).bind(nowIso(), form, String(model || ""), String(topic || ""), status, String(detail || "").slice(0, 1200), ms).run();
  } catch (e) {
  }
}
__name(logRun, "logRun");
__name2(logRun, "logRun");
__name22(logRun, "logRun");
async function sendMail(env, piece, slug, day) {
  // COMPANION-VERIFY-1: nothing is mailed, to the owner or to subscribers, unless the piece passed the accuracy audit (fail closed).
  if (!(await pieceVerified(env, slug))) return { ok: false, error: "piece not verified, nothing mailed (fail closed)" };
  var subject = piece.title + " (" + formLabel(piece.form || "essay") + ")";
  var body = (/^\s*#/.test(String(piece.body_md || "")) ? "" : piece.lede ? piece.lede + NL + NL : "") + String(piece.body_md).slice(0, 2e4) + NL + NL + "Read online: " + String(piece.link || "");
  return await sendOne(env, "rwnquni@outlook.com", subject, body);
}
__name(sendMail, "sendMail");
__name2(sendMail, "sendMail");
__name22(sendMail, "sendMail");
async function mailOut(env, slug, origin) {
  try {
    var pr = await env.PERSONAL.prepare("SELECT * FROM companion_pieces WHERE slug = ?").bind(slug).all();
    var prow = (pr.results || [])[0];
    if (!prow) return { ok: false, error: "no piece" };
    prow.link = origin + "/p/" + slug + (env.COMPANION_KEY ? "?k=" + env.COMPANION_KEY : "");
    return await sendMail(env, prow, slug, prow.day);
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(mailOut, "mailOut");
__name2(mailOut, "mailOut");
__name22(mailOut, "mailOut");
async function sendOne(env, to, subject, body, pre) {
  // BROADCAST-BATCH-1 (1.12.2): a caller that already read the opt-out lists for a batch passes them (pre.checked, pre.set),
  // so a broadcast spends no per-recipient lookups.
  if (pre && pre.checked) { if (pre.set.has(String(to).toLowerCase())) return { ok: false, suppressed: true, to: to }; }
  // SUPPRESSION-1 (2026-09-22): honour opt-out stored in qnfo-audit before any direct send.
  else try { if (env.AUDIT) { const _s = await env.AUDIT.prepare("SELECT 1 FROM email_suppression WHERE lower(email)=?1").bind(String(to).toLowerCase()).first(); if (_s) return { ok: false, suppressed: true, to: to }; const _l = await env.AUDIT.prepare("SELECT suppress FROM contact_ledger WHERE lower(email)=?1").bind(String(to).toLowerCase()).first(); if (_l && _l.suppress) return { ok: false, suppressed: true, to: to }; } } catch (e) {}
  if (env.SEND_EMAIL) {
    try {
      await env.SEND_EMAIL.send({ to, from: "rowan.quni@qnfo.org", subject, text: body });
      return { ok: true, via: "send_email" };
    } catch (e) {
      return { ok: false, error: "send_email: " + String(e && e.message || e) };
    }
  }
  if (!env.EMAIL) return { ok: false, error: "no email path" };
  try {
    var resp = await env.EMAIL.fetch("https://email.internal/send", {
      method: "POST",
      // EMAIL-CALLER-PROPS-1 (#1923): qnfo-email 2.5.1+ authenticates this binding by its props (wrangler.toml); no key copy.
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, from: "rowan.quni@qnfo.org", subject, body })
    });
    return { ok: resp.ok, status: resp.status };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(sendOne, "sendOne");
__name2(sendOne, "sendOne");
__name22(sendOne, "sendOne");
function subBase(env, origin) {
  return origin || "https://reading.q08.org";
}
__name(subBase, "subBase");
__name2(subBase, "subBase");
__name22(subBase, "subBase");
function escXml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(escXml, "escXml");
__name2(escXml, "escXml");
__name22(escXml, "escXml");
function toRfc822(d) {
  try {
    return new Date(d).toUTCString();
  } catch (e) {
    return (/* @__PURE__ */ new Date()).toUTCString();
  }
}
__name(toRfc822, "toRfc822");
__name2(toRfc822, "toRfc822");
__name22(toRfc822, "toRfc822");
function subscribePage(msg) {
  var Q = String.fromCharCode(34);
  return "<div class=sub>" + (msg ? "<p>" + escHtml(msg) + "</p>" : "") + "<form method=post action=/subscribe><input type=email name=email placeholder=" + Q + "you@example.com" + Q + " required><button type=submit>Subscribe</button></form><p class=mut>One email per new piece. Unsubscribe anytime.</p></div>";
}
__name(subscribePage, "subscribePage");
__name2(subscribePage, "subscribePage");
__name22(subscribePage, "subscribePage");
async function handleSubscribe(request, env, u, p) {
  try {
    await ensureSchema(env);
  } catch (e) {
  }
  if (p === "/confirm") {
    var t0 = u.searchParams.get("t") || "";
    await env.PERSONAL.prepare("UPDATE companion_subscribers SET status = 'confirmed', confirmed_at = ? WHERE token = ? AND status != 'unsubscribed'").bind(nowIso(), t0).run();
    return html(page("Confirmed", shell(subscribePage("You are subscribed. Thank you."))));
  }
  if (p === "/unsubscribe") {
    var t1 = u.searchParams.get("t") || "";
    await env.PERSONAL.prepare("UPDATE companion_subscribers SET status = 'unsubscribed' WHERE token = ?").bind(t1).run();
    return html(page("Unsubscribed", shell(subscribePage("You have been unsubscribed."))));
  }
  var email = "";
  try {
    var ct = request.headers.get("Content-Type") || "";
    if (ct.indexOf("application/json") >= 0) {
      var b = await request.json();
      email = b && b.email || "";
    } else if (ct.indexOf("form") >= 0) {
      var fd = await request.formData();
      email = fd.get("email") || "";
    }
  } catch (e) {
  }
  email = String(email || u.searchParams.get("email") || "").trim().toLowerCase();
  if (!email) {
    return html(page("Subscribe", shell("<h2>Subscribe</h2>" + subscribePage(""))));
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return html(page("Subscribe", shell("<h2>Subscribe</h2>" + subscribePage("Enter a valid email address."))), 400);
  }
  var token = await sha16(email + ":" + (env.COMPANION_KEY || "pc") + ":sub");
  await env.PERSONAL.prepare("INSERT INTO companion_subscribers(email, status, token, created_at) VALUES(?, 'pending', ?, ?) ON CONFLICT(email) DO UPDATE SET token = excluded.token, status = CASE WHEN status = 'confirmed' THEN 'confirmed' ELSE 'pending' END").bind(email, token, nowIso()).run();
  var link = subBase(env, u.origin) + "/confirm?t=" + token;
  await sendOne(env, email, "Confirm your subscription", "Tap to confirm: " + link);
  return html(page("Subscribe", shell("<h2>Almost there</h2>" + subscribePage("Check your inbox for a confirmation link."))));
}
__name(handleSubscribe, "handleSubscribe");
__name2(handleSubscribe, "handleSubscribe");
__name22(handleSubscribe, "handleSubscribe");
async function feedXml(env, u) {
  try {
    await ensureSchema(env);
  } catch (e) {
  }
  var q = await env.PERSONAL.prepare("SELECT slug, title, lede, day, created_at FROM companion_pieces WHERE " + VISIBLE_SQL + " ORDER BY id DESC LIMIT 30").all();
  var rows = q.results || [];
  var base = subBase(env, u.origin);
  var items = "";
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var link = base + "/p/" + r.slug;
    items += "<item><title>" + escXml(r.title) + "</title><link>" + link + "</link><guid>" + link + "</guid><pubDate>" + toRfc822(r.created_at || r.day) + "</pubDate><description>" + escXml(String(r.lede || "").slice(0, 400)) + "</description></item>";
  }
  var Q = String.fromCharCode(34);
  var xml = "<?xml version=" + Q + "1.0" + Q + " encoding=" + Q + "UTF-8" + Q + "?><rss version=" + Q + "2.0" + Q + "><channel><title>Reading</title><link>" + base + "</link><description>Written for one reader. Shared with anyone who wants to follow along.</description>" + items + "</channel></rss>";
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
__name(feedXml, "feedXml");
__name2(feedXml, "feedXml");
__name22(feedXml, "feedXml");
// ---- BROADCAST-BATCH-1 (1.12.2, agent_issues 2042) ----
// A send run reads at most SEND_CAP_PER_RUN confirmed subscribers after the run's cursor, reads their opt-outs in batches of
// SUPP_CHUNK (email_suppression and contact_ledger.suppress, two queries per batch), sends, and stores the cursor in
// companion_broadcasts (key = piece slug, or "digest:<day>"). The hourly tick resumes an unfinished run. If the opt-out read
// fails the run stops before any send (fail closed) and the cursor stays, so the next tick retries.
var SEND_CAP_PER_RUN = 250;
var SUPP_CHUNK = 50;
async function suppressedSet(env, emails) {
  var set = new Set();
  if (!env.AUDIT) return set;
  var list = emails.map(function (e) { return String(e).toLowerCase(); });
  for (var i = 0; i < list.length; i += SUPP_CHUNK) {
    var chunk = list.slice(i, i + SUPP_CHUNK), ph = chunk.map(function () { return "?"; }).join(",");
    var s1 = env.AUDIT.prepare("SELECT lower(email) AS e FROM email_suppression WHERE lower(email) IN (" + ph + ")");
    var r1 = await s1.bind.apply(s1, chunk).all();
    var s2 = env.AUDIT.prepare("SELECT lower(email) AS e FROM contact_ledger WHERE suppress AND lower(email) IN (" + ph + ")");
    var r2 = await s2.bind.apply(s2, chunk).all();
    ((r1 && r1.results) || []).concat((r2 && r2.results) || []).forEach(function (r) { set.add(String(r.e)); });
  }
  return set;
}
async function ensureSendRuns(env) {
  await env.PERSONAL.prepare("CREATE TABLE IF NOT EXISTS companion_broadcasts (key TEXT PRIMARY KEY, last_id INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, suppressed INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0, origin TEXT, started_at TEXT, updated_at TEXT)").run();
}
async function sendRunState(env, key, origin) {
  await ensureSendRuns(env);
  await env.PERSONAL.prepare("INSERT OR IGNORE INTO companion_broadcasts (key, origin, started_at, updated_at) VALUES (?1, ?2, ?3, ?3)").bind(key, origin || null, nowIso()).run();
  return await env.PERSONAL.prepare("SELECT * FROM companion_broadcasts WHERE key = ?1").bind(key).first();
}
async function sendRun(env, key, origin, mailFor) {
  var st = await sendRunState(env, key, origin);
  if (st && st.done) return { ok: true, key: key, done: true, already: true, sent: 0, failed: 0, suppressed: 0 };
  var last = st ? Number(st.last_id) || 0 : 0;
  var q = await env.PERSONAL.prepare("SELECT id, email, token FROM companion_subscribers WHERE status = 'confirmed' AND id > ?1 ORDER BY id LIMIT " + SEND_CAP_PER_RUN).bind(last).all();
  var rows = (q && q.results) || [];
  var supp;
  try { supp = await suppressedSet(env, rows.map(function (r) { return r.email; })); }
  catch (e) { return { ok: false, key: key, error: "opt-out lists unreadable, nothing sent (fail closed): " + String(e && e.message || e).slice(0, 120), resume: true }; }
  var sent = 0, failed = 0, suppressed = 0;
  for (var i = 0; i < rows.length; i++) {
    var m = mailFor(rows[i]);
    var rr = await sendOne(env, rows[i].email, m.subject, m.body, { checked: true, set: supp });
    if (rr && rr.ok) sent++;
    else if (rr && rr.suppressed) suppressed++;
    else failed++;
    last = rows[i].id;
  }
  var done = rows.length < SEND_CAP_PER_RUN ? 1 : 0;
  await env.PERSONAL.prepare("UPDATE companion_broadcasts SET last_id = ?1, sent = sent + ?2, failed = failed + ?3, suppressed = suppressed + ?4, done = ?5, updated_at = ?6 WHERE key = ?7").bind(last, sent, failed, suppressed, done, nowIso(), key).run();
  return { ok: true, key: key, sent: sent, failed: failed, suppressed: suppressed, batch: rows.length, done: !!done, resume: !done };
}
function digestMail(day, list, base) {
  return function (s) {
    return { subject: "Reading \u2014 daily digest", body: "Reading \u2014 daily digest (" + day + ")" + NL + NL + list + NL + NL + "Unsubscribe: " + base + "/unsubscribe?t=" + s.token };
  };
}
async function digestList(env, day, base) {
  var pr = await env.PERSONAL.prepare("SELECT slug, title, form FROM companion_pieces WHERE day = ? AND " + VISIBLE_SQL + " ORDER BY id ASC").bind(day).all();
  var rows = pr.results || [];
  return { n: rows.length, list: rows.map(function (r) { return "- " + r.title + " \u2014 " + base + "/p/" + r.slug; }).join(NL) };
}
function pieceMail(prow, base, link) {
  return function (s) {
    return { subject: prow.title, body: (/^\s*#/.test(String(prow.body_md || "")) ? "" : prow.lede ? prow.lede + NL + NL : "") + String(prow.body_md).slice(0, 2e4) + NL + NL + "Read online: " + link + NL + NL + "Unsubscribe: " + base + "/unsubscribe?t=" + s.token };
  };
}
// The hourly tick continues the oldest unfinished run (one per tick, so a tick never sends more than SEND_CAP_PER_RUN).
async function resumeSendRuns(env) {
  // the tick creates the cursor table, so the resume read never meets a missing table and the table's presence shows 1.12.2 runs
  await ensureSendRuns(env);
  var t = await env.PERSONAL.prepare("SELECT key, origin FROM companion_broadcasts WHERE done = 0 ORDER BY started_at LIMIT 1").first();
  if (!t) return { ok: true, idle: true };
  var base = "https://reading.q08.org";
  if (String(t.key).indexOf("digest:") === 0) {
    var day = String(t.key).slice(7), dl = await digestList(env, day, base);
    return await sendRun(env, t.key, null, digestMail(day, dl.list, base));
  }
  var pr = await env.PERSONAL.prepare("SELECT * FROM companion_pieces WHERE slug = ?").bind(t.key).all();
  var prow = (pr.results || [])[0];
  if (!prow) { await env.PERSONAL.prepare("UPDATE companion_broadcasts SET done = 1, updated_at = ?1 WHERE key = ?2").bind(nowIso(), t.key).run(); return { ok: false, key: t.key, error: "piece gone; run closed" }; }
  if (!(await pieceVerified(env, t.key))) { await env.PERSONAL.prepare("UPDATE companion_broadcasts SET done = 1, updated_at = ?1 WHERE key = ?2").bind(nowIso(), t.key).run(); return { ok: false, key: t.key, error: "piece not verified or retracted; run closed (fail closed)" }; }
  var b2 = subBase(env, t.origin);
  return await sendRun(env, t.key, t.origin, pieceMail(prow, b2, b2 + "/p/" + t.key));
}
// ---- BROADCAST-BATCH-1 end ----
// PERSONAL-RESILIENCE-1: confirmed subscribers, paged by id (the old single LIMIT 500 silently dropped everyone after the 500th).
async function confirmedSubscribers(env) {
  var all = [], last = 0;
  for (var page = 0; page < 40; page++) {
    var q = await env.PERSONAL.prepare("SELECT id, email, token FROM companion_subscribers WHERE status = 'confirmed' AND id > ?1 ORDER BY id LIMIT 500").bind(last).all();
    var rows = (q && q.results) || [];
    for (var i = 0; i < rows.length; i++) all.push(rows[i]);
    if (rows.length < 500) break;
    last = rows[rows.length - 1].id;
  }
  return all;
}
async function broadcast(env, slug, origin) {
  if (!env.EMAIL) return { ok: false, error: "no email binding" };
  try {
    var pr = await env.PERSONAL.prepare("SELECT * FROM companion_pieces WHERE slug = ?").bind(slug).all();
    var prow = (pr.results || [])[0];
    if (!prow) return { ok: false, error: "no piece" };
    if (!(await pieceVerified(env, slug))) return { ok: false, error: "piece not verified, nothing mailed (fail closed)" };
    // BROADCAST-BATCH-1: one capped, resumable run per piece; the hourly tick sends the rest.
    var base = subBase(env, origin);
    return await sendRun(env, slug, base, pieceMail(prow, base, base + "/p/" + slug));
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(broadcast, "broadcast");
__name2(broadcast, "broadcast");
__name22(broadcast, "broadcast");
async function sendDigest(env) {
  if (!env.EMAIL) return { ok: false, error: "no email binding" };
  try {
    var day = amsDayKey(/* @__PURE__ */ new Date());
    var base = "https://reading.q08.org";
    var dl = await digestList(env, day, base);
    if (!dl.n) return { ok: true, skipped: "no pieces today", pieces: 0 };
    // BROADCAST-BATCH-1: one capped, resumable run per day ("digest:<day>"); the hourly tick sends the rest.
    var out = await sendRun(env, "digest:" + day, null, digestMail(day, dl.list, base));
    out.pieces = dl.n;
    return out;
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(sendDigest, "sendDigest");
__name2(sendDigest, "sendDigest");
__name22(sendDigest, "sendDigest");
// ---- Accuracy layer (COMPANION-VERIFY-1, 1.14.0; pattern ported from q08-signal-engine Q08-VERIFY-1) -------------------------
// Owner directive 2026-10-10: published content is 100% accurate and independently fact-checked, every claim verifiable against
// the supplied source text; if a check or reviewer is unavailable nothing is published. A piece becomes visible (site, feed,
// API) and mailable (owner, subscribers, digest) only when companion_audits holds a 'pass' row for it, and that row is written
// only after (1) the deterministic grounding check (every capitalised name, year and figure occurs in the source material) and
// (2) two reviewers from model families other than the writer's found no unsupported claim. A piece that later fails the same
// test is retracted in public (companion_retractions: 410 notice, gone from index, feed, API and mail). Reversible by deleting
// the companion_retractions row.
var REVIEW_MAX_TOKENS = 4000;
var REVIEW_TIMEOUT_MS = 11e4;
var MODEL_FAMILY = {
  "@cf/nvidia/nemotron-3-120b-a12b": "nvidia",
  "@cf/openai/gpt-oss-120b": "openai",
  "@cf/moonshotai/kimi-k2.6": "moonshot",
  "@cf/deepseek-ai/deepseek-v4-pro-0813": "deepseek",
  "@cf/zai-org/glm-5.3": "zai",
  "deepseek-chat": "deepseek",
  "deepseek-reasoner": "deepseek"
};
// Reviewers, non-reasoning first so that a verdict does not spend its whole budget thinking. Banned models stay banned.
var REVIEW_POOL = [
  "@cf/nvidia/nemotron-3-120b-a12b",
  "@cf/openai/gpt-oss-120b",
  "@cf/moonshotai/kimi-k2.6",
  "@cf/deepseek-ai/deepseek-v4-pro-0813",
  "@cf/zai-org/glm-5.3"
];
function familyOf(id) { return MODEL_FAMILY[id] || "unknown:" + String(id || "").split("/")[1]; }
function seedOf(str) { var h = 0, t = String(str || ""); for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return Math.abs(h); }
// Up to k reviewers, one per family, none from the family in `exclude`; the start rotates with `seed`.
function pickReviewers(exclude, k, seed) {
  var ex = {}; (exclude || []).forEach(function (f) { ex[f] = 1; });
  var n = REVIEW_POOL.length, start = Math.abs(seed | 0) % n, out = [], seen = {};
  for (var i = 0; i < n && out.length < k; i++) {
    var id = REVIEW_POOL[(start + i) % n], f = familyOf(id);
    if (ex[f] || seen[f] || !modelAllowed(id)) continue;
    seen[f] = 1; out.push(id);
  }
  return out;
}
var GROUND_LEAD = new Set(["the","a","an","in","on","at","when","if","but","and","so","as","that","this","these","those","it","its","each","every","most","some","no","for","with","without","before","after","once","while","because","since","what","where","who","why","how","then","there","here","not","only","even","still","yet","or","nor","by","from","to","of","their","his","her","our","your","one","two","three","such","both","many","any","all","i","we","you","he","she","they","my","whether","although","though","until","unless","instead","perhaps","suppose","imagine","consider","now","today","later","earlier","first","second","third","finally","meanwhile","however","which","whose","than","also","just","every","another","other","either","neither","same","more","less","few","several"]);
var GROUND_OK = new Set(["january","february","march","april","may","june","july","august","september","october","november","december","monday","tuesday","wednesday","thursday","friday","saturday","sunday","arxiv","markdown","json","html"]);
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
  var o = opts || {}, nowYear = Number(String(o.today || nowIso().slice(0, 10)).slice(0, 4));
  var body = String(text || "").replace(/^#+[ \t]+(.*)$/gm, function (m, h) { return h.toLowerCase(); }).replace(/\(?(?:This|A|An) hypothetical[^)]*\)?/gi, " ");
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
  "List every sentence or clause in the DRAFT, headings and title included, that asserts something about the real world and is not stated in, or a direct paraphrase of, the SOURCE MATERIAL. That covers events, dates, people, organisations, places, works, products, laws, institutions, numbers, quotations, studies, historical episodes and precedents, claims about what the reader does or has done, and statements that a practice or fact is 'known' or 'common'.",
  "Your own knowledge does not count as support, even if you are sure the claim is true: if it is not in the SOURCE MATERIAL, it is unsupported. A claim that distorts what the SOURCE MATERIAL says (a changed number, a stronger or different relationship, a cause where the source gives only a sequence) is unsupported too. These are NOT violations: reasoning that follows from the source's facts and is presented as reasoning, definitions, and a clearly labelled hypothetical that names no real person, organisation, product, date or number.",
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
async function factCheckOne(env, modelId, draft, ground) {
  try {
    var body = FACTCHECK_PROMPT + "\n\n--- SOURCE MATERIAL ---\n" + String(ground).slice(0, GROUND_MAX + 2000) + "\n\n--- DRAFT ---\n" + String(draft).trim().slice(0, 30000);
    var resp = await aiRunAttr(env, "personal-companion", "factcheck", modelId, { messages: [{ role: "user", content: body }], max_tokens: REVIEW_MAX_TOKENS, temperature: 0.1 }, { gateway: { id: "default" }, signal: AbortSignal.timeout(REVIEW_TIMEOUT_MS) });
    var out = resp && (resp.response || (resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content)) || "";
    var v = parseFactVerdict(out);
    if (v) { v.model = modelId; v.family = familyOf(modelId); }
    return v;
  } catch (e) { return null; }
}
// Two valid verdicts from two different families, neither the writer's. Fewer than two valid verdicts is "unavailable": fail closed.
async function factCheck(env, draft, ground, writerModel, seedText) {
  var wf = writerModel ? familyOf(writerModel) : "";
  var ids = pickReviewers(wf ? [wf] : [], 5, seedOf(seedText));
  var got = [];
  for (var k = 0; k < ids.length && got.length < 2; k += 2) {
    var batch = ids.slice(k, k + (2 - got.length));
    var rs = await Promise.all(batch.map(function (id) { return factCheckOne(env, id, draft, ground); }));
    rs.forEach(function (r) { if (r) got.push(r); });
  }
  if (got.length < 2) return { ok: false, unavailable: true, unsupported: [], judges: got, reason: "fewer than two fact-check verdicts from other model families" };
  var uns = []; got.forEach(function (g) { g.unsupported.forEach(function (u) { if (uns.indexOf(u) < 0) uns.push(u); }); });
  return { ok: got.every(function (g) { return g.verdict === "pass"; }), unavailable: false, unsupported: uns.slice(0, 10), judges: got, reason: "" };
}
// Full verification of one draft: deterministic grounding first (free), then the two-family review. `text` includes the title.
async function verifyPiece(env, text, ground, writerModel, seedText, opts) {
  var det = groundingProblems(text, ground, opts);
  if (det.length) return { ok: false, stage: "grounding", problems: det, judges: [], unavailable: false };
  var fc = await factCheck(env, text, ground, writerModel, seedText);
  if (fc.unavailable) return { ok: false, stage: "factcheck", problems: ["fact-check unavailable: " + fc.reason], judges: fc.judges, unavailable: true };
  if (!fc.ok) return { ok: false, stage: "factcheck", problems: fc.unsupported.map(function (u) { return "unsupported claim: " + u; }), judges: fc.judges, unavailable: false };
  return { ok: true, stage: "pass", problems: [], judges: fc.judges, unavailable: false };
}
// Everything a reader is shown: title, subtitle, lede (stored apart from the body when the piece does not open with a heading) and body.
function pieceText(piece) { return "# " + String(piece.title || "") + "\n\n" + (piece.subtitle ? String(piece.subtitle) + "\n\n" : "") + (piece.lede ? String(piece.lede) + "\n\n" : "") + String(piece.body_md || ""); }
var __accSchemaDb = null;
async function ensureAccuracySchema(env) {
  if (__accSchemaDb && __accSchemaDb === env.PERSONAL) return true;
  try {
    await env.PERSONAL.prepare("CREATE TABLE IF NOT EXISTS companion_audits (slug TEXT PRIMARY KEY, verdict TEXT NOT NULL, stage TEXT, models TEXT, problems_json TEXT, checked_at TEXT NOT NULL)").run();
    await env.PERSONAL.prepare("CREATE TABLE IF NOT EXISTS companion_retractions (slug TEXT PRIMARY KEY, reason TEXT, claims_json TEXT, retracted_at TEXT NOT NULL)").run();
    await ensureColumns(env.PERSONAL, "companion_pieces", { ground_text: "TEXT" });
    __accSchemaDb = env.PERSONAL;
    return true;
  } catch (e) {
    console.error("companion accuracy schema failed: " + String(e && e.message || e).slice(0, 200));
    return false;
  }
}
// A piece is visible and mailable only with a passing audit row and no retraction. Used as a WHERE fragment on companion_pieces.
var VISIBLE_SQL = "slug IN (SELECT slug FROM companion_audits WHERE verdict = 'pass') AND slug NOT IN (SELECT slug FROM companion_retractions)";
async function pieceVerified(env, slug) {
  try {
    await ensureAccuracySchema(env);
    var r = await env.PERSONAL.prepare("SELECT 1 AS ok FROM companion_pieces WHERE slug = ?1 AND " + VISIBLE_SQL).bind(slug).first();
    return !!r;
  } catch (e) { return false; }
}
async function recordAudit(env, slug, verdict, stage, vr) {
  await ensureAccuracySchema(env);
  await env.PERSONAL.prepare("INSERT OR REPLACE INTO companion_audits (slug, verdict, stage, models, problems_json, checked_at) VALUES (?,?,?,?,?,?)")
    .bind(slug, verdict, stage, ((vr && vr.judges) || []).map(function (j) { return j.model; }).join(","), JSON.stringify(((vr && vr.problems) || []).slice(0, 10)), nowIso()).run();
}
// Retracts a piece in public: its URL keeps answering with a notice, it leaves the index, feed, API and every mail run.
async function retractPiece(env, slug, reason, claims) {
  await ensureAccuracySchema(env);
  await env.PERSONAL.prepare("INSERT OR REPLACE INTO companion_retractions (slug, reason, claims_json, retracted_at) VALUES (?,?,?,?)")
    .bind(slug, String(reason || "").slice(0, 400), JSON.stringify((claims || []).slice(0, 8)), nowIso()).run();
  try {
    if (env.AUDIT) await env.AUDIT.prepare("UPDATE signals SET status = 'retracted' WHERE id = ?1").bind("reading:" + slug).run();
  } catch (e) {}
  return { ok: true, slug: slug };
}
// Cron step. Pieces with no audit row: one with no recorded source material cannot be verified and is withdrawn (no model call);
// one with stored source material is verified now. A reviewer outage writes nothing (retried next tick); a failure retracts.
async function auditPublished(env, limit) {
  if (!(await ensureAccuracySchema(env))) return { ok: false, reason: "schema" };
  var rows = await env.PERSONAL.prepare(
    "SELECT slug, title, subtitle, lede, body_md, ground_text FROM companion_pieces WHERE slug NOT IN (SELECT slug FROM companion_retractions) AND slug NOT IN (SELECT slug FROM companion_audits) ORDER BY id DESC LIMIT ?1"
  ).bind(limit || 3).all();
  var res = { checked: 0, passed: 0, retracted: 0, withdrawn: 0, deferred: 0 };
  for (var p of (rows.results || [])) {
    if (!p.ground_text || String(p.ground_text).length < 500) {
      await recordAudit(env, p.slug, "unverifiable", "no-source-record", { judges: [], problems: ["no source material was recorded for this piece"] });
      await retractPiece(env, p.slug, "Withdrawn: no record of the source material this piece was written from exists, so its claims cannot be verified.", []);
      res.withdrawn++;
      continue;
    }
    var vr = await verifyPiece(env, pieceText(p), p.ground_text, "", "audit:" + p.slug, {});
    if (vr.unavailable) { res.deferred++; continue; }
    res.checked++;
    if (vr.ok) { await recordAudit(env, p.slug, "pass", vr.stage, vr); res.passed++; continue; }
    await recordAudit(env, p.slug, "fail", vr.stage, vr);
    await retractPiece(env, p.slug, "Retracted after an accuracy audit: the piece contained claims its source material does not support (" + vr.stage + " check).", vr.problems);
    res.retracted++;
  }
  return Object.assign({ ok: true }, res);
}
function renderRetraction(r, p, keyQS) {
  var claims = []; try { claims = JSON.parse(r.claims_json || "[]"); } catch (e) { claims = []; }
  var date = String(r.retracted_at || "").slice(0, 10);
  var list = claims.length ? "<p>Examples of what could not be verified:</p><ul>" + claims.slice(0, 5).map(function (c) { return "<li>" + escHtml(c) + "</li>"; }).join("") + "</ul>" : "";
  var body = "<div class=meta>Retracted " + escHtml(date) + "</div><h2>Retracted: " + escHtml(p && p.title || "this piece") + "</h2><p>" + escHtml(r.reason || "") +
    " Every piece is now checked against its source material by two independent reviewers before it is shown or mailed; earlier pieces are audited, and any that fail are withdrawn and listed on the <a href=/retractions" + (keyQS || "") + ">retractions page</a>.</p>" + list +
    "<footer><a href=/" + (keyQS || "") + ">back to index</a></footer>";
  return page("Retracted", shell(body), '<meta name="robots" content="noindex">');
}
function renderRetractions(rows, keyQS) {
  var items = (rows || []).map(function (r) { return "<li>" + escHtml(r.title || r.slug) + " &mdash; retracted " + escHtml(String(r.retracted_at || "").slice(0, 10)) + ". " + escHtml(r.reason || "") + "</li>"; }).join("");
  var body = "<h2>Corrections and retractions</h2><p>Pieces are shown only when their claims are supported by their source material. When one is found not to be, it is withdrawn and listed here.</p>" + (items ? "<ul>" + items + "</ul>" : "<p>No piece has been retracted.</p>") + "<footer><a href=/" + (keyQS || "") + ">back to index</a></footer>";
  return page("Retractions", shell(body), '<meta name="robots" content="noindex">');
}
function factRevisionPrompt(problems, ground) {
  return "FACT REVISION. Independent fact-checkers rejected the draft below. Every item in the list is a claim the source material does not support." + NL +
    "Return the SAME piece in the SAME output format (a single # heading with the title, then the prose), with each such name, date, figure or claim deleted, or replaced by reasoning that follows from the source material, or by a labelled hypothetical that names no real person, organisation, product, date or number. Add no new facts. Keep everything else, including the length." + NL + NL +
    "Problems:" + NL + "- " + problems.slice(0, 12).join(NL + "- ");
}

// COMPANION-VERIFY-1 (1.14.0): the publish path. Nothing is persisted before it passes (1) the editorial validation with the
// deterministic grounding check, (2) the adversarial reader, whose outage fails closed, and (3) the two-family fact-check, whose
// outage fails closed. There is no forced publish: when every draft fails, nothing is published and the stall detector says so.
var REVISE_BEFORE_MS = 42e4;
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
    var anchors = (topic.anchors || []).slice();
    if (form === "serial") {
      try {
        var sr = await env.PERSONAL.prepare("SELECT title, thesis, last_lines FROM companion_series ORDER BY id DESC LIMIT 1").first();
        if (sr) anchors.push({ kind: "previous installment", ref: "previous installment", title: squish(sr.title || ""), text: squish(String(sr.thesis || "") + " " + String(sr.last_lines || "")).slice(0, 1600) });
      } catch (eSr) {}
    }
    await logRun(env, form, "", topic.id, "stage", "anchorKinds " + anchors.map(function(x) {
      return x.kind;
    }).join(","), Date.now() - t0);
    await logRun(env, form, "", topic.id, "stage", "anchors " + anchors.length, Date.now() - t0);
    if (anchors.length < 2) {
      await logRun(env, form, "", topic.id, "blocked", "insufficient anchors", Date.now() - t0);
      return { ok: false, error: "insufficient anchors" };
    }
    var ground = anchorsText(anchors);
    var attempt = 0;
    var best = null;
    var feedback = "";
    var failClosed = "";
    while (attempt < 5) {
      // COMPANION-FALLBACK-TUNE-1: no new attempt once GEN_BUDGET_MS is spent, so the run ends with a logged failure
      // instead of being killed by the 15-minute cron wall mid-attempt (2026-10-07 12:00Z run: killed in attempt 3).
      if (Date.now() - t0 > GEN_BUDGET_MS) {
        await logRun(env, form, model, topic.id, "stage", "time budget spent after " + attempt + " attempts", Date.now() - t0);
        break;
      }
      attempt++;
      await logRun(env, form, "", topic.id, "stage", "compose attempt " + attempt, Date.now() - t0);
      var comp = await composePiece(env, form, topic, anchors, life, profile, continuity, feedback);
      model = comp.model;
      await logRun(env, form, model, topic.id, "stage", "composed " + String(comp.piece && comp.piece.body_md || "").length + (comp.error ? " err: " + String(comp.error).slice(0, 400) : ""), Date.now() - t0);
      var piece = comp.piece;
      if (!piece) {
        continue;
      }
      var v = validatePiece(piece, form, ground);
      if (!v.ok) {
        await logRun(env, form, model, topic.id, "rejected", "validate: " + v.problems.join("; ") + " || raw: " + String(comp.raw || "").slice(0, 500), Date.now() - t0);
        feedback = "The previous draft failed validation for these reasons: " + v.problems.join("; ") + ". Fix them and try again. Remove every name, year and figure that is not in the source material.";
        // COMPANION-FALLBACK-TUNE-1: a draft whose only problem is being short is extended, not rewritten from scratch
        // (12:00Z run: gpt-oss drafts of 1591 and 1764 words against the 2000-word essay floor were thrown away).
        var shortOnly = expandFeedback(v.problems, form, piece);
        if (shortOnly) feedback = shortOnly;
        continue;
      }
      var dup = await similarExists(env, String(piece.title) + NL + String(piece.body_md), null);
      if (dup) {
        await logRun(env, form, model, topic.id, "rejected", "too similar to " + dup.slug + " (" + dup.score.toFixed(3) + ")", Date.now() - t0);
        continue;
      }
      var openKey = String(piece.lede || String(piece.body_md || "").split(NL)[0] || "").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 60);
      if (openKey.length > 40) {
        try {
          var odCheck = await env.PERSONAL.prepare(
            "SELECT slug FROM companion_pieces WHERE replace(replace(replace(lower(substr(lede,1,120)),' ',''),'.',''),'-','') LIKE ? LIMIT 1"
          ).bind(openKey + "%").all();
          if ((odCheck.results || []).length > 0) {
            await logRun(env, form, model, topic.id, "rejected", "duplicate opening: same lede as existing piece", Date.now() - t0);
            feedback = "The previous draft opened with the same sentences as an existing piece. Open on a different particular.";
            continue;
          }
        } catch (e) {
        }
      }
      var titleLow = String(piece.title || "").toLowerCase().trim();
      if (titleLow.length > 4) {
        try {
          var dtCheck = await env.PERSONAL.prepare(
            "SELECT slug FROM companion_pieces WHERE lower(title) = ? LIMIT 1"
          ).bind(titleLow).all();
          if ((dtCheck.results || []).length > 0) {
            await logRun(env, form, model, topic.id, "rejected", "duplicate title: " + piece.title, Date.now() - t0);
            feedback = "The previous draft had a title that already exists. Choose a completely different angle and title.";
            continue;
          }
        } catch (e) {
        }
      }
      await logRun(env, form, model, topic.id, "stage", "critique", Date.now() - t0);
      var crit = await critiquePiece(env, piece, form, ground);
      if (!crit) {
        // fail closed: an unavailable reader is not a pass (before 1.14.0 a missing critique scored a neutral 5 and passed)
        failClosed = "critic unavailable";
        await logRun(env, form, model, topic.id, "rejected", "critic unavailable (fail closed)", Date.now() - t0);
        continue;
      }
      var q = crit;
      var dims = ["specificity", "argument", "objection", "voice"];
      var worst = 10;
      var worstName = "";
      var missing = false;
      for (var d = 0; d < dims.length; d++) {
        var val = Number(q[dims[d]]);
        if (!Number.isFinite(val)) { missing = true; val = 0; }
        if (val < worst) {
          worst = val;
          worstName = dims[d];
        }
      }
      if (missing) failClosed = "critic returned no score";
      var groundScore = Number(q.grounding);
      if (Number.isFinite(groundScore) && groundScore < ACCEPT_FLOOR_NOTES && worst >= ACCEPT_FLOOR_NOTES) { worst = groundScore; worstName = "grounding"; }
      var floorForForm = form === "notes" ? ACCEPT_FLOOR_NOTES : ACCEPT_FLOOR_ESSAY;
      if (worst < floorForForm) {
        await logRun(env, form, model, topic.id, "rejected", "critique " + worstName + "=" + worst + " :: " + String(q.why || ""), Date.now() - t0);
        feedback = "REVISE the previous draft: keep its strong parts, fix its weak ones. Previous scores: specificity=" + q.specificity + " argument=" + q.argument + " objection=" + q.objection + " voice=" + q.voice + (q.grounding !== undefined ? " grounding=" + q.grounding : "") + ". Weakest was " + worstName + ". Why: " + String(q.why || "") + ".";
        continue;
      }
      // the fact-check: two reviewers from other model families; one corrective revision when time allows
      await logRun(env, form, model, topic.id, "stage", "fact-check", Date.now() - t0);
      var vr = await verifyPiece(env, pieceText(piece), ground, model, topic.id + ":" + attempt, {});
      var finalPiece = piece;
      if (!vr.ok && !vr.unavailable && Date.now() - t0 < REVISE_BEFORE_MS) {
        await logRun(env, form, model, topic.id, "rejected", "fact-check " + vr.stage + ": " + vr.problems.slice(0, 4).join(" | ").slice(0, 600) + " (one corrective revision)", Date.now() - t0);
        var rev = await composePiece(env, form, topic, anchors, life, profile, continuity, "", { title: piece.title, body_md: piece.body_md, problems: vr.problems });
        var rp = rev && rev.piece;
        var rv = rp ? validatePiece(rp, form, ground) : { ok: false, problems: ["fact revision produced no draft"] };
        if (rp && rv.ok) {
          vr = await verifyPiece(env, pieceText(rp), ground, rev.model, topic.id + ":" + attempt + ":rev", {});
          if (vr.ok) { finalPiece = rp; model = rev.model; v = rv; }
        } else {
          vr = { ok: false, stage: "revision", problems: (vr.problems || []).concat(rv.problems || []), judges: [], unavailable: false };
        }
      }
      if (vr.unavailable) {
        failClosed = "fact-check unavailable";
        await logRun(env, form, model, topic.id, "rejected", "fact-check unavailable (fail closed): " + vr.problems.join("; ").slice(0, 300), Date.now() - t0);
        break;
      }
      if (!vr.ok) {
        await logRun(env, form, model, topic.id, "rejected", "fact-check " + vr.stage + ": " + vr.problems.slice(0, 4).join(" | ").slice(0, 600), Date.now() - t0);
        feedback = "The previous draft was rejected by independent fact-checkers; every item is a claim the source material does not support. Write a new draft that makes none of them and adds no other fact from outside the source material: " + vr.problems.slice(0, 8).join(" | ");
        continue;
      }
      q.gate = "passed";
      q.factcheck = { stage: vr.stage, models: (vr.judges || []).map(function (j) { return j.model; }) };
      best = { piece: finalPiece, quality: q, words: v.words, vr: vr };
      break;
    }
    if (!best) {
      await logRun(env, form, model, topic.id, "failed", "no piece survived the gate" + (failClosed ? " (" + failClosed + ")" : ""), Date.now() - t0);
      return { ok: false, error: "no piece survived the gate" + (failClosed ? " (" + failClosed + ")" : "") };
    }
    var slug = await persistPiece(env, best.piece, form, topic, model, best.quality, best.words, ground);
    await recordAudit(env, slug, "pass", best.vr.stage, best.vr);
    await logRun(env, form, model, topic.id, "ok", slug, Date.now() - t0);
    return { ok: true, slug, form, title: best.piece.title, words: best.words, quality: best.quality, topic: topic.id, model };
  } catch (e) {
    await logRun(env, form, model, topic ? topic.id : "", "error", String(e && e.message || e), Date.now() - t0);
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(generate, "generate");
__name2(generate, "generate");
__name22(generate, "generate");
// ---- CRON-SINGLE-TRIGGER-1:BEGIN (pure; replayed by scripts/cron-single-trigger.test.mjs)
// CRON-SINGLE-TRIGGER-1 (2026-10-02, #1785, pillar: core). The account held 84 cron expressions against the fleet budget
// of 50. This worker now registers ONE hourly trigger; each tick runs every entry of CRON_TABLE (the former trigger list,
// unchanged) that fired in the hour ending at the tick, through the same dispatcher as before. An entry on the hour runs
// at its minute; one at :15 or :30 runs at the next full hour. Hourly keeps the 15-minute CPU limit of a cron trigger.
var TICK_CRON = "0 * * * *";
var CRON_TABLE = ["0 * * * *", "0 21 * * *"];
var TICK_PARALLEL = false;
function cronFieldMatch(spec, v) {
  return String(spec).split(",").some(function (part) {
    var st = /^(.+)\/(\d+)$/.exec(part), step = st ? Number(st[2]) : 1, base = st ? st[1] : part;
    var r = /^(\d+)-(\d+)$/.exec(base), lo, hi;
    if (base === "*") { lo = 0; hi = 1e9; } else if (r) { lo = Number(r[1]); hi = Number(r[2]); } else { lo = Number(base); hi = st ? 1e9 : lo; }
    return v >= lo && v <= hi && (v - (base === "*" ? 0 : lo)) % step === 0;
  });
}
// Cloudflare cron fields in UTC; day of week 1 = Sunday .. 7 = Saturday.
function cronMatchesAt(expr, ms) {
  var f = String(expr).trim().split(/\s+/), d = new Date(ms);
  return f.length === 5 && cronFieldMatch(f[0], d.getUTCMinutes()) && cronFieldMatch(f[1], d.getUTCHours()) && cronFieldMatch(f[2], d.getUTCDate()) && cronFieldMatch(f[3], d.getUTCMonth() + 1) && cronFieldMatch(f[4], d.getUTCDay() + 1);
}
// The table entries that fired in the 60 minutes ending at the tick (tick minute included), in table order.
function cronDueAtTick(table, tickMs) {
  var t = Math.floor(tickMs / 60000) * 60000;
  return table.filter(function (expr) {
    for (var k = 0; k < 60; k++) if (cronMatchesAt(expr, t - k * 60000)) return true;
    return false;
  });
}
// ---- CRON-SINGLE-TRIGGER-1:END
// `one` is the dispatcher this worker always had (one cron expression in, its job run). A trigger other than the tick
// (a former per-job trigger still registered) goes straight to it, and so does an event marked tickEntry: that is how
// the tick hands each table entry on, and how a test runs one entry whose expression equals the tick's.
async function cronTickDispatch(event, one) {
  if (!event || event.cron !== TICK_CRON || event.tickEntry) return one(event);
  var at = Number(event.scheduledTime) || Date.now();
  var due = cronDueAtTick(CRON_TABLE, at);
  var run = function (expr) {
    return Promise.resolve().then(function () { return one({ cron: expr, scheduledTime: at, type: "scheduled", tickEntry: true }); }).catch(function (e) { console.error("cron " + expr + ": " + String(e && e.message || e)); });
  };
  if (TICK_PARALLEL) { await Promise.all(due.map(run)); return; }
  for (var i = 0; i < due.length; i++) await run(due[i]);
}
// COMPANION-PUBLISH-STALL-AUTO-1 (1.13.0, 2026-10-07, pillar core): reading.q08.org went silent for 48h (2026-10-05 08:06Z
// onward) while the steward wrote "collapse" to companion_runs every hour and nothing outside this worker read it. The
// q08 stallDetector pattern, ported: every hourly tick writes companion_hours_since_last_piece into
// qnfo-audit.metric_registry, files one agent_issue when no piece landed for STALL_HOURS and the last two generation
// runs failed (with their causes), and closes it with evidence when a piece lands. No model call.
var STALL_HOURS = 12;
var STALL_TITLE = "COMPANION-PUBLISH-STALL-AUTO-1";
async function companionStallDetector(env, nowMs) {
  if (!env.AUDIT || !env.PERSONAL) return { skipped: "no binding" };
  var now = nowMs || Date.now();
  var lastRow = await env.PERSONAL.prepare("SELECT slug, created_at FROM companion_pieces ORDER BY id DESC LIMIT 1").first();
  var lastMs = lastRow && lastRow.created_at ? Date.parse(String(lastRow.created_at)) : 0;
  var hours = lastMs ? Math.round((now - lastMs) / 36e5 * 10) / 10 : null;
  try {
    await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3, state = 'MEASURED' WHERE metric = ?1").bind("companion_hours_since_last_piece", hours == null ? null : String(hours), new Date(now).toISOString()).run();
  } catch (eM) {}
  var open = await env.AUDIT.prepare("SELECT id FROM agent_issues WHERE status='open' AND title LIKE ?1").bind(STALL_TITLE + ":%").all();
  var openIds = ((open && open.results) || []).map(function (o) { return o.id; });
  if (hours != null && hours < STALL_HOURS) {
    for (var i = 0; i < openIds.length; i++) {
      var ev = "personal-companion " + VERSION + " stall detector: piece " + lastRow.slug + " created " + lastRow.created_at + " (" + hours + "h ago) at " + new Date(now).toISOString();
      await env.AUDIT.prepare("UPDATE issue_triage SET close_evidence=?1 WHERE issue_id=?2").bind(ev, openIds[i]).run().catch(function () {});
      await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', close_channel='auto-recovery', updated_at=?1 WHERE id=?2").bind(now, openIds[i]).run();
    }
    return { hours: hours, closed: openIds.length };
  }
  var fr = await env.PERSONAL.prepare("SELECT run_at, status, model, topic, detail FROM companion_runs WHERE status IN ('ok','failed','blocked') AND form <> 'steward' ORDER BY id DESC LIMIT 2").all();
  var runs = (fr && fr.results) || [];
  if (runs.length < 2 || runs.some(function (r) { return r.status === "ok"; })) return { hours: hours, stalled: false };
  if (openIds.length) return { hours: hours, stalled: true, open: openIds[0] };
  var causes = runs.map(function (r) { return r.run_at + " " + (r.model || "-") + " " + (r.topic || "") + ": " + String(r.detail || "").slice(0, 120); }).join(" | ");
  var errs = await env.PERSONAL.prepare("SELECT detail FROM companion_runs WHERE status='stage' AND detail LIKE '%err:%' ORDER BY id DESC LIMIT 1").first();
  var title = STALL_TITLE + ": reading.q08.org published nothing for " + (hours == null ? "ever" : Math.round(hours) + "h") + "; last 2 generation runs failed";
  var desc = "Filed automatically by personal-companion " + VERSION + " companionStallDetector. Last 2 generation runs: " + causes + (errs && errs.detail ? ". Latest model-call error: " + String(errs.detail).slice(0, 400) : "") + ". Check companion_runs in personal-life D1 (stage rows carry the call error since 1.13.0). Closes itself when a piece is created.\ncode-task: repo=qnfo-workers path=personal-companion/worker.js";
  await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) SELECT ?1, ?2, 'personal-companion', 'reliability', 'high', 'open', ?3, ?3 WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE status='open' AND title LIKE ?4)").bind(title, desc, now, STALL_TITLE + ":%").run();
  return { hours: hours, stalled: true, filed: true };
}
var worker_default = {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } }); // SEO-HYGIENE-1: a private tool / private reading surface, kept out of search engines
    var u = new URL(request.url);
    var p = u.pathname;
    if (request.method === "OPTIONS") return json({ ok: true });
    if (p === "/health") {
      var n = 0, last = null, acc = null;
      try {
        await ensureAccuracySchema(env);
        var r = await env.PERSONAL.prepare("SELECT COUNT(*) n FROM companion_pieces WHERE " + VISIBLE_SQL).all();
        n = ((r.results || [])[0] || {}).n || 0;
        var r2 = await env.PERSONAL.prepare("SELECT slug, title, form, day FROM companion_pieces WHERE " + VISIBLE_SQL + " ORDER BY id DESC LIMIT 1").all();
        last = (r2.results || [])[0] || null;
        var r3 = await env.PERSONAL.prepare("SELECT (SELECT COUNT(*) FROM companion_audits WHERE verdict = 'pass') passed, (SELECT COUNT(*) FROM companion_retractions) retracted, (SELECT COUNT(*) FROM companion_pieces WHERE slug NOT IN (SELECT slug FROM companion_audits) AND slug NOT IN (SELECT slug FROM companion_retractions)) unaudited").first();
        acc = r3 || null;
      } catch (e) {
      }
      return json({ ok: true, version: VERSION, capabilities: ["companion-writing", "morning-brief", "subscriber-feed", "feedback", "owner-prompts", "accuracy-verify", "retractions"], limitations: ["every route except /health needs the companion key (?k=)", "writes at most 5 pieces a day, only at the generation hours (UTC) listed here", "the writer is DeepSeek via the personal plane's own key (BYOK), outside the qnfo AI router", "a piece is shown and mailed only after a deterministic grounding check and a two-family fact-check against its source material; if either is unavailable nothing is published (COMPANION-VERIFY-1)", "the morning brief goes only to the owner's address", "the morning brief and owner questions bypass email_suppression by design; the owner stops them with one row: UPDATE calendar_meta SET v='0' WHERE k='owner_notice_enabled' (qnfo-audit; INSERT it if absent; 0/off/false/no stops, anything else or no row means on)", "an unsent brief claim older than 90 minutes is retried hourly between 08:00 and 12:00 Amsterdam; an owner question whose worker died mid-send is retried after 6 hours, so a very rare duplicate is possible"], pieces: n, last, rhythm: RHYTHM, writer: WRITER_MODEL, writer_essay: WRITER_MODEL_ESSAY, topics: "live (Wikipedia, arXiv)", accuracy: acc, gen_hours_utc: GEN_HOURS_UTC, max_per_day: MAX_PIECES_PER_DAY, models: MODELS });
    }
    if (!authorized(request, env)) {
      return json({ error: { message: "unauthorized: append ?k=KEY" } }, 401);
    }
    if (p === "/api/ping") {
      var ping = {};
      for (var pi = 0; pi < MODELS.length; pi++) {
        var t0p = Date.now();
        try {
          var rp = await aiRunAttr(env, "personal-companion", "probe-ping", MODELS[pi], { messages: [{ role: "user", content: "Reply with the single word: ready" }], max_tokens: 16 }, { gateway: { id: "default" }, signal: AbortSignal.timeout(3e4) });
          ping[MODELS[pi]] = { ms: Date.now() - t0p, resp: String(rp && rp.response || JSON.stringify(rp)).slice(0, 160) };
        } catch (e) {
          ping[MODELS[pi]] = { ms: Date.now() - t0p, err: String(e && e.message || e).slice(0, 200) };
        }
      }
      return json({ ok: true, version: VERSION, ping });
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
          var rq = await aiRunAttr(env, "personal-companion", "probe-gen", cand[ci], {
            messages: [
              { role: "system", content: "Write plain scholarly prose. No filler, no emojis, no meta-commentary." },
              { role: "user", content: "Write three short paragraphs, about 250 words total, summarising the text that follows in plain prose. Text: The probe checks only that the model returns prose within the token budget." }
            ],
            max_tokens: Number(u.searchParams.get("mt") || 700),
            temperature: 0.7
          }, opts2);
          var c = rq && rq.response || "";
          var rc = "";
          if (rq && rq.choices && rq.choices[0] && rq.choices[0].message) {
            if (!c) c = rq.choices[0].message.content || "";
            rc = rq.choices[0].message.reasoning_content || "";
          }
          probe[cand[ci]] = { ms: Date.now() - tt, clen: String(c).length, rlen: String(rc).length, fr: rq && rq.choices && rq.choices[0] && rq.choices[0].finish_reason || "" };
        } catch (e) {
          probe[cand[ci]] = { ms: Date.now() - tt, err: String(e && e.message || e).slice(0, 160) };
        }
        if (u.searchParams.get("one") === "1") break;
      }
      return json({ ok: true, probe });
    }
    if (p === "/api/f" || p === "/api/feedback") {
      var slug = u.searchParams.get("slug") || "";
      var sig = u.searchParams.get("s") || u.searchParams.get("signal") || "";
      if (slug && sig) {
        try {
          await env.PERSONAL.prepare("INSERT INTO companion_feedback(slug, signal, note, created_at) VALUES(?,?,?,?)").bind(slug, sig.slice(0, 40), (u.searchParams.get("note") || "").slice(0, 500), nowIso()).run();
        } catch (e) {
        }
      }
      return Response.redirect(new URL("/p/" + slug + (u.searchParams.get("k") ? "?k=" + u.searchParams.get("k") : ""), u.origin).toString(), 302);
    }
    if (p === "/api/pieces") {
      await ensureSchema(env);
      var lim = Number(u.searchParams.get("limit")) || 30;
      var f2 = u.searchParams.get("form") || "";
      var sql = f2 ? "SELECT slug, form, title, subtitle, lede, word_count, day, created_at, anchor_json, quality_json FROM companion_pieces WHERE form = ? AND " + VISIBLE_SQL + " ORDER BY id DESC LIMIT ?" : "SELECT slug, form, title, subtitle, lede, word_count, day, created_at, anchor_json, quality_json FROM companion_pieces WHERE " + VISIBLE_SQL + " ORDER BY id DESC LIMIT ?";
      var st = f2 ? env.PERSONAL.prepare(sql).bind(f2, lim) : env.PERSONAL.prepare(sql).bind(lim);
      var rr = await st.all();
      return json({ ok: true, count: (rr.results || []).length, pieces: rr.results || [] });
    }
    if (p.indexOf("/api/piece/") === 0) {
      await ensureSchema(env);
      var s3 = p.slice(11);
      var q3 = await env.PERSONAL.prepare("SELECT * FROM companion_pieces WHERE slug = ? AND " + VISIBLE_SQL).bind(s3).all();
      var row3 = (q3.results || [])[0];
      if (!row3) return json({ error: { message: "not found" } }, 404);
      return json({ ok: true, piece: row3 });
    }
    if (p === "/api/retractions" || p === "/retractions") {
      await ensureSchema(env);
      var rq = await env.PERSONAL.prepare("SELECT r.slug, r.reason, r.claims_json, r.retracted_at, p.title FROM companion_retractions r LEFT JOIN companion_pieces p ON p.slug = r.slug ORDER BY r.retracted_at DESC LIMIT 200").all();
      if (p === "/api/retractions") return json({ ok: true, count: (rq.results || []).length, retractions: rq.results || [] });
      return html(renderRetractions(rq.results || [], env.COMPANION_KEY && u.searchParams.get("k") ? "?k=" + u.searchParams.get("k") : ""));
    }
    if (p === "/api/runs") {
      var q4 = await env.PERSONAL.prepare("SELECT * FROM companion_runs ORDER BY id DESC LIMIT 40").all();
      return json({ ok: true, runs: q4.results || [] });
    }
    if (p === "/run" || p === "/api/run") {
      var want = u.searchParams.get("form") || "";
      if (!want || ["essay", "notes", "serial"].indexOf(want) < 0) want = RHYTHM[amsWeekday(/* @__PURE__ */ new Date())];
      if (u.searchParams.get("async") === "1") {
        ctx.waitUntil((async function() {
          var o = await generate(env, want, {});
          if (o && o.ok && u.searchParams.get("mail") === "1") {
            await mailOut(env, o.slug, u.origin);
            try {
              await broadcast(env, o.slug, "https://reading.q08.org");
            } catch (e) {
            }
          }
        })().catch(function() {
        }));
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
        } catch (e) {
          out.mail = { ok: false, error: String(e && e.message || e) };
        }
      }
      return json(out);
    }
    var keyQS = env.COMPANION_KEY && u.searchParams.get("k") ? "?k=" + u.searchParams.get("k") : "";
    var cookie = "";
    if (env.COMPANION_KEY && u.searchParams.get("k")) {
      cookie = "pc_key=" + env.COMPANION_KEY + "; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax";
    }
    if (p === "/subscribe" || p === "/confirm" || p === "/unsubscribe") {
      return handleSubscribe(request, env, u, p);
    }
    if (p === "/feed.xml" || p === "/feed" || p === "/rss") {
      return feedXml(env, u);
    }
    if (p === "/" || p === "") {
      await ensureSchema(env);
      var filter = u.searchParams.get("form") || "";
      var sql2 = filter ? "SELECT slug, form, title, lede, word_count, day FROM companion_pieces WHERE form = ? AND " + VISIBLE_SQL + " ORDER BY id DESC LIMIT 200" : "SELECT slug, form, title, lede, word_count, day FROM companion_pieces WHERE " + VISIBLE_SQL + " ORDER BY id DESC LIMIT 200";
      var st2 = filter ? env.PERSONAL.prepare(sql2).bind(filter) : env.PERSONAL.prepare(sql2);
      var rows = await st2.all();
      var res = html(renderIndex(rows.results || [], keyQS, filter));
      if (cookie) res.headers.set("Set-Cookie", cookie);
      return res;
    }
    if (p.indexOf("/p/") === 0) {
      var s = p.slice(3);
      await ensureSchema(env);
      var rt = await env.PERSONAL.prepare("SELECT r.reason, r.claims_json, r.retracted_at, p.title FROM companion_retractions r LEFT JOIN companion_pieces p ON p.slug = r.slug WHERE r.slug = ?").bind(s).first();
      if (rt) return new Response(renderRetraction(rt, { title: rt.title }, keyQS), { status: 410, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      var q = await env.PERSONAL.prepare("SELECT * FROM companion_pieces WHERE slug = ? AND " + VISIBLE_SQL).bind(s).all();
      var row = (q.results || [])[0];
      if (!row) return html(page("Not found", shell("<p>No such piece, or it has not passed the accuracy check.</p>")), 404);
      var res2 = html(renderPiece(row, keyQS));
      if (cookie) res2.headers.set("Set-Cookie", cookie);
      return res2;
    }
    return json({ error: { message: "not found", version: VERSION } }, 404);
  },
  async scheduled(event, env, ctx) {
    return cronTickDispatch(event, async function (event) {
    if (event.cron === "0 21 * * *") {
      ctx.waitUntil(sendDigest(env).catch(function() {
      }));
      return;
    }
    ctx.waitUntil((async function() {
      // BROADCAST-BATCH-1: continue an unfinished broadcast or digest before anything else on the hourly tick.
      try { await resumeSendRuns(env); } catch (eR) { console.log("resumeSendRuns: " + String(eR && eR.message || eR)); }
      try { await ensureSchema(env); var _au = await auditPublished(env, 40); if (_au && (_au.retracted || _au.withdrawn || _au.deferred)) console.log("accuracy-audit: " + JSON.stringify(_au)); } catch (eAu) { console.error("accuracy-audit:", String(eAu && eAu.message || eAu)); }
      try {
        var nowUtc = /* @__PURE__ */ new Date();
        var utcHour = nowUtc.getUTCHours();
        var isGenHour = GEN_HOURS_UTC.indexOf(utcHour) >= 0;
        if (isGenHour) {
          var day = amsDayKey(nowUtc);
          var dayCount = await env.PERSONAL.prepare(
            "SELECT COUNT(*) n FROM companion_pieces WHERE day = ?"
          ).bind(day).all();
          var todayN = ((dayCount.results || [])[0] || {}).n || 0;
          if (todayN < MAX_PIECES_PER_DAY) {
            var form = RHYTHM[amsWeekday(nowUtc)];
            var out = await generate(env, form, {});
            if (out && out.ok) {
              try {
                var pr = await env.PERSONAL.prepare("SELECT * FROM companion_pieces WHERE slug = ?").bind(out.slug).all();
                var prow = (pr.results || [])[0];
                if (prow) {
                  prow.link = "https://reading.q08.org/p/" + out.slug;
                  await sendMail(env, prow, out.slug, prow.day);
                }
              } catch (e) {
              }
            }
          }
        }
        await steward(env);
        try { await companionStallDetector(env); } catch (eSt) { console.error("stall-detector:", String(eSt && eSt.message || eSt)); }
        if (utcHour >= 6) await sendMorningBrief(env);
        try { var _lf = await queueLedgerFollowUp(env); if (_lf.error) console.error("ledger-followup:", _lf.error); } catch (eLf) { console.error("ledger-followup:", String(eLf && eLf.message || eLf)); }
        try { var _cm = await refreshConnectionMetrics(env); if (_cm.error) console.error("connection-metrics:", _cm.error); } catch (eCm) { console.error("connection-metrics:", String(eCm && eCm.message || eCm)); }
        try { var _uq = await flagUndeliverableQuestions(env); if (_uq.error) console.error("owner-question-undeliverable:", _uq.error); } catch (eUq) { console.error("owner-question-undeliverable:", String(eUq && eUq.message || eUq)); }
        try { var _op = await deliverOwnerPrompts(env); if (_op.error) console.error("owner-prompts:", _op.error); } catch (eOp) { console.error("owner-prompts:", String(eOp && eOp.message || eOp)); }
      } catch (e) {
      }
    })());
    if (env.VAULT) ctx.waitUntil(VaultIndexer.run(env).catch(function(e) { console.error("vault-indexer:", e && e.message || e); }));
    });
  }
};
// ---- vault-indexer (folded from the standalone vault-indexer 0.1.20 script, VAULT-INDEXER-FOLD-1, 2026-10-01) ----
// The standalone worker disappeared unrecorded around 2026-09-25 (worker_live_audit 404, no worker_removals row),
// so the Obsidian vault (obsidian-vault R2, ~7.7k notes) stopped being indexed into the personal-life Vectorize
// index the personal twin retrieves from. It now runs here on the hourly cron, namespaced so its helpers cannot
// collide with this worker's own. Its unauthenticated /run and /drain routes were not carried over.
var VaultIndexer = (function() {
  var VERSION = "0.1.21-folded";
  var WORKER = "personal-companion:vault-indexer";
  var MAX_LIST_PAGES = 100;
  var MAX_DOCS = 250;
  var MAX_BYTES = 262144;
  var CHUNK_SIZE = 900;
  var CHUNK_OVERLAP = 120;
  var MAX_CHUNKS = 24;
  var GET_CONCURRENCY = 16;
  var EMBED_CONCURRENCY = 3;
  var RUN_DEADLINE_MS = 200000;
  var PATH_PREFIX = "obsidian/";
  var SKIP_PREFIXES = [".obsidian/", "releases/", "Attachments/", "Archive/", ".git/"];
  var INGEST_ROOTS = ["notes/", "Inbox/", "Projects/", "Areas/", "Resources/"];
  var MD_RE = /\.(md|markdown|mdx|txt)$/i;

  function json(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json" } }); }
  function basename(k) { var p = k.split("/"); return p[p.length - 1] || k; }
  function chunkArr(a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
  function extOf(key) { var i = key.lastIndexOf("."); return i >= 0 ? key.slice(i + 1).toLowerCase() : ""; }
  function sanitize(s, max) { return String(s || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").replace(/[\uD800-\uDFFF]/g, "").trim().slice(0, max || 800); }

  function chunkText(text, size, overlap) {
    size = size || CHUNK_SIZE; overlap = overlap || CHUNK_OVERLAP;
    var out = [];
    var clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
    var n = clean.length;
    if (n < 60) return out;
    var i = 0;
    while (i < n) {
      var end = i + size;
      if (end > n) end = n;
      else {
        var lastNl = clean.lastIndexOf("\n", end);
        if (lastNl > i + size * 0.5) end = lastNl;
        else { var lastSp = clean.lastIndexOf(" ", end); if (lastSp > i + size * 0.5) end = lastSp; }
      }
      var c = clean.slice(i, end).trim();
      if (c.length >= 40) out.push(c);
      if (end >= n) break;
      if (end <= i) break;
      i = end - overlap;
      if (out.length >= MAX_CHUNKS) break;
    }
    return out;
  }

  var CATEGORY_KEYWORDS = [
    ["finance", ["bank", "statement", "tax", "invoice", "receipt", "mortgage", "rent", "insurance", "salary"]],
    ["health", ["medical", "doctor", "clinic", "prescription", "vaccin", "hospital", "therapy"]],
    ["legal", ["contract", "agreement", "will", "power of attorney", "court", "lawsuit", "notary"]],
    ["housing", ["apartment", "lease", "landlord", "property", "utilities", "electricity"]],
    ["identity", ["passport", "driving license", "residence permit", "visa", "birth certificate"]],
    ["work", ["resume", "cv", "interview", "offer letter", "employment", "reference"]],
    ["travel", ["flight", "boarding", "itinerary", "hotel", "booking", "ticket"]],
    ["education", ["diploma", "transcript", "degree", "course", "university", "certificate"]],
    ["personal", ["family", "photo", "journal", "diary", "letter"]]
  ];
  function categorize(text, key) {
    var hay = (text + " " + key).toLowerCase();
    var best = "general", bestScore = 0;
    for (var i = 0; i < CATEGORY_KEYWORDS.length; i++) {
      var cat = CATEGORY_KEYWORDS[i][0], kws = CATEGORY_KEYWORDS[i][1], score = 0;
      for (var j = 0; j < kws.length; j++) if (hay.indexOf(kws[j]) >= 0) score++;
      if (score > bestScore) { bestScore = score; best = cat; }
    }
    return bestScore > 0 ? best : "general";
  }

  async function sha256hex(s) {
    var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(d.slice(0, 16))).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  function inScope(key) {
    if (SKIP_PREFIXES.some(function (p) { return key.indexOf(p) === 0; })) return false;
    if (!MD_RE.test(key)) return false;
    return INGEST_ROOTS.some(function (p) { return key.indexOf(p) === 0; });
  }

  async function getFull(env, key) {
    try {
      if (!MD_RE.test(key)) return null;
      var head = await env.VAULT.head(key);
      var big = head && head.size > MAX_BYTES;
      var o = big ? await env.VAULT.get(key, { range: { offset: 0, length: MAX_BYTES } }) : await env.VAULT.get(key);
      if (!o) return null;
      return await o.text();
    } catch (e) { return null; }
  }

  async function run(env, cap) {
    var t0 = Date.now();
    var s = { scanned: 0, changed: 0, indexed: 0, chunks: 0, vectors: 0, skipped: 0, reconciled: 0, locked: false, errors: 0, notes: [] };

    // Overlap lock: one run at a time. TTL takeover (4 min) if a prior run died without releasing.
    var nowIso = new Date().toISOString();
    var haveLock = false;
    try {
      await env.PERSONAL.prepare("INSERT INTO vault_indexer_lock(id,started,owner) VALUES (1,?1,?2)").bind(nowIso, WORKER).run();
      haveLock = true;
    } catch (e) {
      var lockRow = null;
      try { lockRow = await env.PERSONAL.prepare("SELECT started FROM vault_indexer_lock WHERE id=1").first(); } catch (e2) { }
      var age = lockRow && lockRow.started ? (Date.now() - Date.parse(lockRow.started)) : 1e9;
      if (age < 240000) { s.locked = true; s.notes.push("locked"); s.elapsedMs = Date.now() - t0; return s; }
      try { await env.PERSONAL.prepare("UPDATE vault_indexer_lock SET started=?1, owner=?2 WHERE id=1").bind(nowIso, WORKER).run(); haveLock = true; } catch (e3) { }
    }

    var reg = new Map();
    try {
      var r0 = await env.PERSONAL.prepare("SELECT path,size,modified FROM files WHERE path LIKE 'obsidian/%'").all();
      (r0.results || []).forEach(function (x) { reg.set(x.path, x.size + "|" + x.modified); });
    } catch (e) { s.errors++; s.notes.push("registry-read-fail"); }

    var all = [], cursor = undefined, pages = 0;
    do {
      var listed;
      try { listed = await env.VAULT.list({ cursor: cursor, limit: 1000 }); }
      catch (e) { s.errors++; s.notes.push("list-fail"); break; }
      cursor = listed.truncated ? listed.cursor : undefined;
      pages++;
      var objs = listed.objects || [];
      for (var i = 0; i < objs.length; i++) { all.push(objs[i]); s.scanned++; }
    } while (cursor && pages < MAX_LIST_PAGES);

    var completeList = !cursor;
    var changed = [];
    var seenPaths = new Set();
    for (var a = 0; a < all.length; a++) {
      var o = all[a];
      if (!inScope(o.key)) continue;
      var path = PATH_PREFIX + o.key;
      seenPaths.add(path);
      var sig = o.size + "|" + (o.uploaded ? o.uploaded.toISOString() : "");
      if (reg.get(path) === sig) continue;
      changed.push({ key: o.key, obj: o, path: path });
    }
    s.changed = changed.length;

    if (completeList) {
      var stale = [];
      reg.forEach(function (_v, p) { if (!seenPaths.has(p)) stale.push(p); });
      var staleGroups = chunkArr(stale, 50);
      for (var dg2 = 0; dg2 < staleGroups.length; dg2++) {
        try {
          var dstmts = [];
          for (var gi = 0; gi < staleGroups[dg2].length; gi++) {
            dstmts.push(env.PERSONAL.prepare("DELETE FROM chunks WHERE path=?1").bind(staleGroups[dg2][gi]));
            dstmts.push(env.PERSONAL.prepare("DELETE FROM files WHERE path=?1").bind(staleGroups[dg2][gi]));
          }
          await env.PERSONAL.batch(dstmts);
          s.reconciled += staleGroups[dg2].length;
        } catch (e) { s.errors++; }
      }
    }

    var work = changed.slice(0, cap || MAX_DOCS);
    var texts = new Array(work.length);
    for (var b = 0; b < work.length; b += GET_CONCURRENCY) {
      var slice = work.slice(b, b + GET_CONCURRENCY);
      var ts = await Promise.all(slice.map(function (w) { return getFull(env, w.key); }));
      for (var j = 0; j < slice.length; j++) texts[b + j] = ts[j];
    }

    var prepared = new Array(work.length);
    for (var eb = 0; eb < work.length; eb += EMBED_CONCURRENCY) {
      if (Date.now() - t0 > RUN_DEADLINE_MS * 0.65) { s.notes.push("deadline-embed@" + eb); break; }
      var eslice = work.slice(eb, eb + EMBED_CONCURRENCY);
      await Promise.all(eslice.map(async function (w, k) {
        var idx = eb + k;
        var text = texts[idx];
        if (text === null) { s.notes.push("null:" + String(w.key).slice(-34)); prepared[idx] = null; return; }
        var chs = chunkText(text);
        if (chs.length === 0) { prepared[idx] = { skip: true, w: w }; return; }
        var resp = null, lastErr = "";
        for (var attempt = 0; attempt < 3 && !resp; attempt++) {
          try { resp = await aiRunAttr(env, "personal-companion", "embed-index", "@cf/baai/bge-base-en-v1.5", { text: chs }, { gateway: { id: "default" } }); }
          catch (e) {
            lastErr = String((e && e.message) || e);
            var rt = /429|1010|rate.?limit|throttl|overload|503|502|504|busy|timeout/i.test(lastErr) && !/spend limit|2045|budget|quota/i.test(lastErr);
            if (!rt && attempt >= 1) break;
            var backoff = Math.min(3000, 400 * Math.pow(2, attempt)) + Math.floor(Math.random() * 400);
            await new Promise(function (r) { setTimeout(r, backoff); });
          }
        }
        if (!resp) { prepared[idx] = { error: true, msg: "embed:" + lastErr.slice(0, 90), w: w }; return; }
        var vectors = (resp && resp.data) || [];
        var valid = vectors.filter(function (v) { return Array.isArray(v) && v.length === 768; }).map(function (v) { return v.map(function (z) { return Number.isFinite(z) ? z : 0; }); });
        if (valid.length === 0) { prepared[idx] = { error: true, w: w }; return; }
        prepared[idx] = { w: w, chs: chs, valid: valid, cat: categorize(chs.join(" "), w.key) };
      }));
    }

    for (var x = 0; x < work.length; x++) {
      if (Date.now() - t0 > RUN_DEADLINE_MS) { s.notes.push("deadline-acct@" + x); break; }
      var p = prepared[x];
      if (p === null) { s.skipped++; continue; }
      if (p.skip) { s.skipped++; try { var sw = p.w; await env.PERSONAL.prepare("INSERT INTO files (path,type,size,modified,indexed_at,chunks,title,category,wbs,qnfo_link) VALUES (?1,?2,?3,?4,?5,0,?6,'general',NULL,NULL) ON CONFLICT(path) DO UPDATE SET type=?2,size=?3,modified=?4,indexed_at=?5,chunks=0,title=?6").bind(sw.path, extOf(sw.key), sw.obj.size, (sw.obj.uploaded ? sw.obj.uploaded.toISOString() : new Date().toISOString()), new Date().toISOString(), basename(sw.key)).run(); } catch (e) {} continue; }
      if (p.error) { s.errors++; if (p.msg) s.notes.push(p.msg); if (p.w) { try { var ew = p.w; var fr = await env.PERSONAL.prepare("SELECT fails,last_at FROM embed_failures WHERE path=?1").bind(ew.path).first(); var prevAt = (fr && fr.last_at) ? Date.parse(fr.last_at) : 0; var stale = (Date.now() - prevAt) > 3600000; var nf = ((fr && fr.fails && !stale) ? fr.fails : 0) + 1; if (nf >= 3) { await env.PERSONAL.prepare("INSERT INTO files (path,type,size,modified,indexed_at,chunks,title,category,wbs,qnfo_link) VALUES (?1,?2,?3,?4,?5,0,?6,'embed-failed',NULL,NULL) ON CONFLICT(path) DO UPDATE SET type=?2,size=?3,modified=?4,indexed_at=?5,chunks=0,title=?6").bind(ew.path, extOf(ew.key), ew.obj.size, (ew.obj.uploaded ? ew.obj.uploaded.toISOString() : new Date().toISOString()), new Date().toISOString(), basename(ew.key)).run(); await env.PERSONAL.prepare("DELETE FROM embed_failures WHERE path=?1").bind(ew.path).run(); } else { await env.PERSONAL.prepare("INSERT INTO embed_failures (path,fails,last_at) VALUES (?1,?2,?3) ON CONFLICT(path) DO UPDATE SET fails=?2,last_at=?3").bind(ew.path, nf, new Date().toISOString()).run(); } } catch (e) {} } continue; }
      var w = p.w;
      var dg = await sha256hex(w.path);
      var vecBatch = [], chunkStmts = [];
      for (var ci = 0; ci < p.valid.length; ci++) {
        var id = dg + ":" + ci;
        vecBatch.push({ id: id, values: p.valid[ci], metadata: { path: w.path, type: extOf(w.key), chunk: String(ci), category: String(p.cat), modified: String(w.obj.uploaded ? w.obj.uploaded.toISOString() : ""), text: sanitize(p.chs[ci], 800) } });
        chunkStmts.push(env.PERSONAL.prepare("INSERT INTO chunks (id,path,chunk_idx,text_len) VALUES (?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET path=?2,chunk_idx=?3,text_len=?4").bind(id, w.path, ci, p.chs[ci].length));
      }
      var vzOk = false;
      for (var va = 0; va < 3 && !vzOk; va++) {
        try { await env.VZ.upsert(vecBatch); vzOk = true; }
        catch (e) { if (va < 2) await new Promise(function (r) { setTimeout(r, 300 * (va + 1)); }); else s.notes.push("vz-upsert:" + String((e && e.message) || e).slice(0, 90)); }
      }
      if (!vzOk) { s.errors++; continue; }
      s.vectors += vecBatch.length; s.chunks += vecBatch.length;
      try { await env.PERSONAL.batch(chunkStmts); } catch (e) { }
      try {
        var mod = w.obj.uploaded ? w.obj.uploaded.toISOString() : new Date().toISOString();
        await env.PERSONAL.prepare("INSERT INTO files (path,type,size,modified,indexed_at,chunks,title,category,wbs,qnfo_link) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,NULL,NULL) ON CONFLICT(path) DO UPDATE SET type=?2,size=?3,modified=?4,indexed_at=?5,chunks=?6,title=?7,category=?8").bind(w.path, extOf(w.key), w.obj.size, mod, new Date().toISOString(), p.valid.length, basename(w.key), p.cat).run();
        s.indexed++;
      } catch (e) { s.errors++; }
    }

    try {
      await env.PERSONAL.prepare("INSERT INTO vault_indexer_runs (started,finished,scanned,changed,indexed,chunks,skipped,reconciled,errors,notes) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)").bind(new Date(t0).toISOString(), new Date().toISOString(), s.scanned, s.changed, s.indexed, s.chunks, s.skipped, s.reconciled, s.errors, JSON.stringify((s.notes || []).slice(0, 50))).run();
    } catch (e) { }

    if (haveLock) { try { await env.PERSONAL.prepare("DELETE FROM vault_indexer_lock WHERE id=1").run(); } catch (e) { } }
    // VAULT-INDEXER-FOLD-1: the standalone script self-reported its VERSION to the deploy-guard ledger.
    // As a member of personal-companion it is versioned by its host, so that report is dropped.
    var selfreport = "folded:personal-companion";

    try {
      await env.VAULT.put("_meta/vault-indexer.status.json", JSON.stringify({ ts: new Date().toISOString(), scanned: s.scanned, changed: s.changed, indexed: s.indexed, chunks: s.chunks, reconciled: s.reconciled, errors: s.errors, selfreport: selfreport }), { httpMetadata: { contentType: "application/json" } });
    } catch (e) { }

    s.elapsedMs = Date.now() - t0;
    return s;
  }
  return { run: run, VERSION: VERSION };
})();

// OWNER-PROMPTS-1 (2026-10-03, pillar: personal): the personal system asks Rowan questions instead of waiting to be asked.
// Producers (calendar-api) write rows into qnfo-audit.owner_questions with the message and its one-tap links already composed;
// this worker only DELIVERS, from its existing hourly tick (no new cron, no model call). Owner notices go through
// the native SEND_EMAIL binding (fallback: qnfo-email /send with handoff:true, the owner-notice path HANDOFF-ALLOWLIST-1); the
// digest opt-out list (email_suppression) is left untouched. Caps: PROMPT_DAILY_CAP per Amsterdam day, one mail per tick,
// PROMPT_MAX_ATTEMPTS tries per row, quiet hours 22:00-08:00 Amsterdam. Failures are written to the row, never swallowed.
var PROMPT_DAILY_CAP = 2;
var PROMPT_MAX_ATTEMPTS = 5;
var PROMPT_OWNER = "rwnquni@outlook.com";
function promptQuietHour(ms) {
  var h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", hour12: false }).format(new Date(ms)));
  return h >= 22 || h < 8;
}
// MORNING-BRIEF-OWNER-NOTICE-1: one shared owner-notice sender. Goes to the owner's own address only (the recipient is a
// constant, never a parameter), never reads or writes email_suppression, so the 2026-09-22 digest opt-out keeps silencing
// essay mail while the owner's own transactional mail (morning brief, owner questions) arrives.
// PERSONAL-RESILIENCE-1: shared helpers.
// Owner kill switch: qnfo-audit.calendar_meta (k, v) row owner_notice_enabled. 0/off/false/no/disabled stops the morning brief and
// owner questions; a missing row, any other value or an unreadable table means on (default on).
async function ownerNoticeEnabled(env) {
  try {
    if (!env.AUDIT) return true;
    var r = await env.AUDIT.prepare("SELECT v FROM calendar_meta WHERE k = 'owner_notice_enabled'").first();
    if (!r || r.v == null) return true;
    return ["0", "off", "false", "no", "disabled"].indexOf(String(r.v).trim().toLowerCase()) < 0;
  } catch (e) { return true; }
}
// Guarded ALTER: add a column only when PRAGMA table_info does not list it; a concurrent duplicate-column error is not a failure.
async function ensureColumns(db, table, cols) {
  var info = await db.prepare("PRAGMA table_info(" + table + ")").all();
  var have = {}; ((info && info.results) || []).forEach(function (c) { have[c.name] = 1; });
  for (var name in cols) {
    if (have[name]) continue;
    try { await db.prepare("ALTER TABLE " + table + " ADD COLUMN " + name + " " + cols[name]).run(); }
    catch (e) { if (!/duplicate column/i.test(String(e && e.message || e))) throw e; }
  }
}
// The UTC instant of 00:00 Europe/Amsterdam on the Amsterdam day of ms (winter UTC+1, summer UTC+2).
function amsMidnightUtcMs(ms) {
  var day = amsDayKey(new Date(ms));
  var base = new Date(day + "T00:00:00Z").getTime();
  for (var off = 2; off >= 1; off--) {
    var t = base - off * 36e5;
    if (amsDayKey(new Date(t)) === day && amsDayKey(new Date(t - 6e4)) !== day) return t;
  }
  return base - 2 * 36e5;
}
function sqlStamp(ms) { return new Date(ms).toISOString().replace("T", " ").slice(0, 19); }
var PROMPT_CLAIM_STALE_MS = 6 * 36e5;
var BRIEF_RETRY_AFTER_MS = 90 * 6e4;
async function sendOwnerNotice(env, subject, text) {
  if (!env.SEND_EMAIL && !env.EMAIL) return { ok: false, error: "no mail binding" };
  if (!(await ownerNoticeEnabled(env))) return { ok: false, disabled: true, error: "owner notices disabled (calendar_meta owner_notice_enabled)" };
  subject = String(subject == null ? "" : subject).replace(/[\r\n]+/g, " ").slice(0, 200);
  text = String(text == null ? "" : text).slice(0, 20000);
  try {
    if (env.SEND_EMAIL) {
      await env.SEND_EMAIL.send({ to: PROMPT_OWNER, from: "rowan.quni@qnfo.org", subject: subject, text: text });
      return { ok: true, via: "send_email" };
    }
    var resp = await env.EMAIL.fetch("https://email.internal/send", {
      method: "POST",
      // EMAIL-CALLER-PROPS-1 (#1923): qnfo-email 2.5.1+ authenticates this binding by its props (wrangler.toml); no key copy.
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: PROMPT_OWNER, from: "rowan.quni@qnfo.org", subject: subject, body: text, handoff: true })
    });
    if (!resp.ok) return { ok: false, error: "email " + resp.status + " " + String(await resp.text().catch(function () { return ""; })).slice(0, 200) };
    return { ok: true, via: "email" };
  } catch (e) { return { ok: false, error: String(e && e.message || e).slice(0, 240) }; }
}
async function deliverOwnerPrompts(env, nowMs) {
  var out = { sent: 0, skipped: "", error: null };
  if (!env.AUDIT) { out.skipped = "no AUDIT binding"; return out; }
  if (!env.SEND_EMAIL && !env.EMAIL) { out.skipped = "no mail binding"; return out; }
  nowMs = nowMs || Date.now();
  try {
    if (!(await ownerNoticeEnabled(env))) { out.skipped = "owner notices disabled"; return out; }
    await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS owner_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref TEXT, subject TEXT NOT NULL, body TEXT NOT NULL, priority INTEGER DEFAULT 5, not_before TEXT, created_at TEXT DEFAULT (datetime('now')), sent_at TEXT, attempts INTEGER DEFAULT 0, last_error TEXT, UNIQUE(kind, ref))").run();
    await ensureColumns(env.AUDIT, "owner_questions", { claimed_at: "TEXT", flagged_at: "TEXT" });
    if (promptQuietHour(nowMs)) { out.skipped = "quiet hours"; return out; }
    var nowStr = sqlStamp(nowMs);
    var cnt = await env.AUDIT.prepare("SELECT count(*) n FROM owner_questions WHERE sent_at >= ?1").bind(sqlStamp(amsMidnightUtcMs(nowMs))).first();
    if (cnt && cnt.n >= PROMPT_DAILY_CAP) { out.skipped = "daily cap"; return out; }
    var staleStr = sqlStamp(nowMs - PROMPT_CLAIM_STALE_MS);
    var row = await env.AUDIT.prepare("SELECT id, subject, body FROM owner_questions WHERE sent_at IS NULL AND attempts < ?1 AND (not_before IS NULL OR not_before <= ?2) AND (claimed_at IS NULL OR claimed_at <= ?3) ORDER BY priority, id LIMIT 1").bind(PROMPT_MAX_ATTEMPTS, nowStr, staleStr).first();
    if (!row) { out.skipped = "queue empty"; return out; }
    // PERSONAL-RESILIENCE-1: claim the row (attempt counted) BEFORE the mail leaves, so a worker death or a failed sent_at write
    // cannot make the next tick mail the same question again. A failed send releases the claim; a claim whose worker died is
    // retried only after PROMPT_CLAIM_STALE_MS.
    var claim = await env.AUDIT.prepare("UPDATE owner_questions SET claimed_at = ?2, attempts = attempts + 1 WHERE id = ?1 AND sent_at IS NULL AND (claimed_at IS NULL OR claimed_at <= ?3)").bind(row.id, nowStr, staleStr).run();
    if (!claim || !claim.meta || !claim.meta.changes) { out.skipped = "claimed elsewhere"; return out; }
    var nr;
    try { nr = await sendOwnerNotice(env, row.subject, row.body); } catch (eSend) { nr = { ok: false, error: String(eSend && eSend.message || eSend).slice(0, 240) }; }
    if (!nr || !nr.ok) {
      var err = (nr && nr.error) || "send failed";
      await env.AUDIT.prepare("UPDATE owner_questions SET claimed_at = NULL, last_error = ?2 WHERE id = ?1").bind(row.id, err).run();
      out.error = err;
    } else {
      out.sent = 1;
      var marked = false;
      for (var t = 0; t < 2 && !marked; t++) {
        try { await env.AUDIT.prepare("UPDATE owner_questions SET sent_at = ?2, last_error = NULL WHERE id = ?1").bind(row.id, nowStr).run(); marked = true; } catch (eMark) { out.error = "sent but sent_at not recorded: " + String(eMark && eMark.message || eMark).slice(0, 160); }
      }
      if (marked) out.error = null;
    }
  } catch (e) { out.error = String(e && e.message || e).slice(0, 240); }
  return out;
}
// CONNECTION-LEDGER-1 step 2 (2026-10-04, pillar: personal): a person who is due in the Ledger (personal-life v_ledger_due)
// becomes ONE owner question, kind follow-up, ref <person id>-<ISO week>, so the same person is asked at most once a week and the
// whole system at most once a day. Template text only, no model call. Ledger rows are read, never copied: the question carries
// the name and the place, nothing else. The reply-not-needed line keeps the mail from reading as a chore.
function isoWeekKey(ms) {
  var d = new Date(ms); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  var dn = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - dn);
  var y = d.getUTCFullYear(); var wk = Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return y + "-W" + (wk < 10 ? "0" : "") + wk;
}
function ledgerText(v, max) { return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
var OWNER_QUESTIONS_DDL = "CREATE TABLE IF NOT EXISTS owner_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref TEXT, subject TEXT NOT NULL, body TEXT NOT NULL, priority INTEGER DEFAULT 5, not_before TEXT, created_at TEXT DEFAULT (datetime('now')), sent_at TEXT, attempts INTEGER DEFAULT 0, last_error TEXT, UNIQUE(kind, ref))";
async function queueLedgerFollowUp(env, nowMs) {
  var out = { queued: 0, skipped: "", error: null };
  if (!env.AUDIT || !env.PERSONAL) { out.skipped = "no binding"; return out; }
  nowMs = nowMs || Date.now();
  try {
    await env.AUDIT.prepare(OWNER_QUESTIONS_DDL).run();
    var day = amsDayKey(new Date(nowMs));
    var startUtc = sqlStamp(amsMidnightUtcMs(nowMs));
    var cnt = await env.AUDIT.prepare("SELECT count(*) n FROM owner_questions WHERE kind = 'follow-up' AND created_at >= ?1").bind(startUtc).first();
    if (cnt && cnt.n >= 1) { out.skipped = "daily cap"; return out; }
    var due = await env.PERSONAL.prepare("SELECT id, name, met_where, days_since FROM v_ledger_due LIMIT 10").all();
    var rows = (due && due.results) || [];
    if (!rows.length) { out.skipped = "nobody due"; return out; }
    var wk = isoWeekKey(nowMs);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i]; var name = ledgerText(r.name, 80); if (!name) continue;
      var where = ledgerText(r.met_where, 80);
      var draft = "Hi " + name + (where ? ", good to meet you at " + where + ". " : ", it was good to see you. ") + "Want to get a coffee sometime?";
      var body = "It has been " + (Number(r.days_since) || 0) + " days since you last had contact with " + name + ". A draft you can copy:" + NL + NL + draft + NL + NL + "Replying here is not needed.";
      var res = await env.AUDIT.prepare("INSERT OR IGNORE INTO owner_questions (kind, ref, subject, body, priority) VALUES ('follow-up', ?1, ?2, ?3, 4)").bind(String(r.id) + "-" + wk, "Message " + name + "?", body).run();
      if (res && res.meta && res.meta.changes > 0) { out.queued = 1; break; }
    }
    if (!out.queued) out.skipped = "already asked this week";
  } catch (e) { out.error = String(e && e.message || e).slice(0, 240); }
  return out;
}
// CONNECTION-LEDGER-1 step 3 + CONNECTION-ENGAGEMENT-1: the two connection metrics live in two databases, so no registry
// refresh query can compute both; this worker (the metrics' owner) writes their values into qnfo-audit.metric_registry each tick.
// ledger_people_seen_twice: personal-life v_ledger_seen_twice.seen_twice. owner_question_answer_rate_14d: answered / sent over
// kind after-event only (a triage ref is an ISO week, not a calendar id, so it can never match a feedback row) in 14 days, answered = a calendar_feedback row for the same calendar id (the question's ref)
// within 48h of the send; NULL (unreadable, never 0) under 6 sent so a quiet fortnight cannot breach.
var ANSWER_RATE_SQL = "SELECT COUNT(*) sent, SUM(CASE WHEN EXISTS (SELECT 1 FROM calendar_feedback f WHERE f.cal_id = CAST(q.ref AS INTEGER) AND f.ts >= q.sent_at AND f.ts <= datetime(q.sent_at, '+48 hours')) THEN 1 ELSE 0 END) answered FROM owner_questions q WHERE q.kind = 'after-event' AND q.sent_at IS NOT NULL AND q.sent_at >= datetime('now', '-14 days')";
async function refreshConnectionMetrics(env) {
  var out = { seen_twice: null, answer_rate: null, error: null };
  if (!env.AUDIT) return out;
  var stamp = new Date().toISOString().slice(0, 19) + "Z";
  try {
    if (env.PERSONAL) {
      var st = await env.PERSONAL.prepare("SELECT seen_twice FROM v_ledger_seen_twice").first();
      if (st && st.seen_twice != null) {
        out.seen_twice = Number(st.seen_twice);
        await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3 WHERE metric = ?1").bind("ledger_people_seen_twice", String(out.seen_twice), stamp).run();
      }
    }
    var ar = await env.AUDIT.prepare(ANSWER_RATE_SQL).first();
    var sent = ar ? Number(ar.sent) || 0 : 0;
    if (sent >= 6) out.answer_rate = Math.round(1000 * (Number(ar.answered) || 0) / sent) / 1000;
    await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3 WHERE metric = ?1").bind("owner_question_answer_rate_14d", out.answer_rate == null ? "n/a" : String(out.answer_rate), stamp).run();
  } catch (e) { out.error = String(e && e.message || e).slice(0, 240); }
  return out;
}
// OWNER-QUESTION-UNDELIVERABLE-1: a question that hit the attempt cap without ever being sent would otherwise sit silently;
// file one medium agent_issues row per subject (deduped on an open row with the same title).
async function flagUndeliverableQuestions(env) {
  var out = { filed: 0 };
  try {
    if (!env.AUDIT) return out;
    await ensureColumns(env.AUDIT, "owner_questions", { claimed_at: "TEXT", flagged_at: "TEXT" });
    var rows = await env.AUDIT.prepare("SELECT id, subject, attempts, last_error FROM owner_questions WHERE attempts >= ?1 AND sent_at IS NULL AND flagged_at IS NULL ORDER BY id LIMIT 10").bind(PROMPT_MAX_ATTEMPTS).all();
    var list = (rows && rows.results) || [];
    for (var i = 0; i < list.length; i++) {
      var q = list[i], title = "OWNER-QUESTION-UNDELIVERABLE-1: " + q.subject;
      var open = await env.AUDIT.prepare("SELECT id FROM agent_issues WHERE title = ?1 AND status = 'open' LIMIT 1").bind(title).first();
      var now = Date.now();
      // flagged once per row (flagged_at), so closing the issue while the row is still stuck does not refile it
      if (open) { await env.AUDIT.prepare("UPDATE owner_questions SET flagged_at = ?2 WHERE id = ?1").bind(q.id, sqlStamp(now)).run(); continue; }
      var desc = "owner_questions id " + q.id + " has " + q.attempts + " failed delivery attempts and was never sent. last_error: " + String(q.last_error || "none").slice(0, 200) + ". Charter pillar: personal. Fix the send path (sendOwnerNotice / SEND_EMAIL), then reset attempts to 0 so the hourly tick resends it.";
      await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1, ?2, 'personal-companion', 'personal', 'medium', 'open', ?3, ?3)").bind(title, desc, now).run();
      await env.AUDIT.prepare("UPDATE owner_questions SET flagged_at = ?2 WHERE id = ?1").bind(q.id, sqlStamp(now)).run();
      out.filed++;
    }
  } catch (e) { out.error = String(e && e.message || e).slice(0, 240); }
  return out;
}
__name(flagUndeliverableQuestions, "flagUndeliverableQuestions");
async function sendMorningBrief(env, nowMs) {
  try {
    nowMs = nowMs || Date.now();
    if (!(await ownerNoticeEnabled(env))) return { ok: true, skipped: "owner notices disabled" };
    await env.PERSONAL.prepare("CREATE TABLE IF NOT EXISTS companion_morning_brief (date TEXT PRIMARY KEY, sent_at TEXT NOT NULL)").run();
    // PERSONAL-RESILIENCE-1: claimed_at + sent. A row from before this column exists reads sent=1 (the column default).
    await ensureColumns(env.PERSONAL, "companion_morning_brief", { claimed_at: "TEXT", sent: "INTEGER DEFAULT 1" });
    var day = amsDayKey(new Date(nowMs));
    var already = await env.PERSONAL.prepare("SELECT date, sent, claimed_at, sent_at FROM companion_morning_brief WHERE date = ?").bind(day).first();
    var retryFrom = null;
    if (already) {
      if (already.sent !== 0) return { ok: true, skipped: "already sent" };
      // an unsent claim: the worker died (or the release failed) between claim and send; retry once it is 90 min old,
      // only inside 08:00-12:00 Amsterdam
      var cl = Date.parse(already.claimed_at || already.sent_at);
      if (!(nowMs - cl >= BRIEF_RETRY_AFTER_MS)) return { ok: true, skipped: "claim in flight" };
      var hr = Number(amsParts(new Date(nowMs)).hour);
      if (!(hr >= 8 && hr < 12)) return { ok: true, skipped: "retry window closed" };
      retryFrom = already.claimed_at || already.sent_at;
    }
    var br = await env.PERSONAL.prepare("SELECT payload FROM daily_briefs WHERE date = ?").bind(day).first();
    if (!br || !br.payload) return { ok: true, skipped: "no brief yet" };
    var b = null;
    try { b = JSON.parse(br.payload); } catch (e) { return { ok: false, error: "parse" }; }
    if (!b) return { ok: true, skipped: "empty" };
    var L = [];
    L.push("Morning - " + day);
    L.push("");
    if (b.weather && b.weather.text) L.push("Weather: " + b.weather.text);
    var today = (b.calendar && b.calendar.today) || [];
    L.push("");
    if (today.length) {
      L.push("Today:");
      for (var i = 0; i < today.length; i++) {
        var e = today[i];
        L.push("- " + (e.title || "") + (e.location ? " @ " + e.location : "") + (e.dtstart ? " (" + String(e.dtstart).slice(0, 10) + ")" : ""));
      }
    } else {
      L.push("Today: nothing scheduled.");
    }
    var tasks = (b.open && b.open.tasks) || [];
    if (tasks.length) {
      L.push("");
      L.push("Open tasks:");
      for (var j = 0; j < tasks.length; j++) L.push("- " + (tasks[j].title || ""));
    }
    var up = (b.calendar && b.calendar.upcoming7) || [];
    var ups = [];
    for (var k = 0; k < up.length && k < 6; k++) {
      var u = up[k];
      if (today.length && u && u.id && today[0].id === u.id) continue;
      ups.push("- " + (u.title || "") + (u.location ? " @ " + u.location : "") + (u.dtstart ? " (" + String(u.dtstart).slice(0, 10) + ")" : ""));
    }
    if (ups.length) {
      L.push("");
      L.push("Coming up:");
      for (var m = 0; m < ups.length; m++) L.push(ups[m]);
    }
    L.push("");
    // CAL-FEED-ROTATE-1 (2026-10-01): the personal feed URL was hard-coded here, in a public repository, so anyone could
    // subscribe to the owner's personal calendar. Read the current token at send time (calendar_meta in qnfo-audit, written
    // by calendar-api); after a rotation the brief carries the new URL with no code change.
    try {
      var _ft = env.AUDIT ? await env.AUDIT.prepare("SELECT v FROM calendar_meta WHERE k='ics_token_personal'").first() : null;
      if (_ft && _ft.v) L.push("Calendar feed: https://pub-7e5e6cd48f4b43ebb55a5ee25093cb71.r2.dev/calendar/personal-" + _ft.v + ".ics");
    } catch (eFeed) {
    }
    try {
      if (env.AUDIT) {
        var qs;
        try { qs = await env.AUDIT.prepare("SELECT q.subject, q.sent_at FROM owner_questions q WHERE (q.sent_at IS NULL OR q.sent_at >= datetime('now','-2 days')) AND NOT (q.kind = 'after-event' AND EXISTS (SELECT 1 FROM calendar_feedback f WHERE f.cal_id = CAST(q.ref AS INTEGER))) ORDER BY q.sent_at IS NOT NULL, q.priority, q.id LIMIT 5").all(); } catch (eFb) { qs = await env.AUDIT.prepare("SELECT subject, sent_at FROM owner_questions WHERE sent_at IS NULL OR sent_at >= datetime('now','-2 days') ORDER BY sent_at IS NOT NULL, priority, id LIMIT 5").all(); }
        var qr = (qs && qs.results) || [];
        if (qr.length) {
          L.push("");
          L.push("Questions waiting:");
          for (var qi = 0; qi < qr.length; qi++) L.push("- " + qr[qi].subject + (qr[qi].sent_at ? " (sent)" : " (queued)"));
        }
      }
    } catch (eQ) {
    }
    var body = L.join(NL);
    // MORNING-BRIEF-CLAIM-1: claim the day before sending so two overlapping ticks cannot both mail it; a failed send
    // releases the claim so the next hourly tick retries.
    var stamp = new Date(nowMs).toISOString();
    var claim = retryFrom
      ? await env.PERSONAL.prepare("UPDATE companion_morning_brief SET claimed_at = ?2, sent_at = ?2 WHERE date = ?1 AND sent = 0 AND COALESCE(claimed_at, sent_at) = ?3").bind(day, stamp, retryFrom).run()
      : await env.PERSONAL.prepare("INSERT OR IGNORE INTO companion_morning_brief (date, sent_at, claimed_at, sent) VALUES (?, ?, ?, 0)").bind(day, stamp, stamp).run();
    if (!claim || !claim.meta || !claim.meta.changes) return { ok: true, skipped: "already sent" };
    var r;
    try { r = await sendOwnerNotice(env, "Morning - " + day, body); } catch (eSend) { r = { ok: false, error: String(eSend && eSend.message || eSend) }; }
    if (!r || !r.ok) {
      try { await env.PERSONAL.prepare("DELETE FROM companion_morning_brief WHERE date = ? AND sent = 0").bind(day).run(); } catch (eRel) { console.error("morning-brief claim release:", String(eRel && eRel.message || eRel)); }
    } else {
      for (var mt = 0; mt < 2; mt++) {
        try { await env.PERSONAL.prepare("UPDATE companion_morning_brief SET sent = 1 WHERE date = ?").bind(day).run(); break; } catch (eMk) { console.error("morning-brief sent mark:", String(eMk && eMk.message || eMk)); }
      }
    }
    return r;
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(sendMorningBrief, "sendMorningBrief");

async function steward(env) {
  try {
    await ensureSchema(env);
    var n = Date.now();
    var okr = await env.PERSONAL.prepare("SELECT run_at FROM companion_runs WHERE status = 'ok' ORDER BY id DESC LIMIT 1").all();
    var lastOk = (okr.results || [])[0];
    var h = lastOk ? (n - new Date(lastOk.run_at).getTime()) / 36e5 : null;
    var r = await env.PERSONAL.prepare("SELECT status FROM companion_runs WHERE run_at > datetime('now','-24 hours') AND status IN ('ok','failed','rejected') ORDER BY id DESC LIMIT 200").all();
    var rows = r.results || [];
    var a = 0, o = 0;
    for (var i = 0; i < rows.length; i++) {
      a++;
      if (rows[i].status === "ok") o++;
    }
    var ar = a ? o / a : null;
    var d = "";
    if (h === null || h > 48) d = "stall: no successful piece in " + (h === null ? "ever" : h.toFixed(1) + "h");
    else if (ar !== null && a >= 8 && ar < 0.1) d = "collapse: accept rate " + Math.round(ar * 100) + "% over " + a + " attempts";
    if (d) await env.PERSONAL.prepare("INSERT INTO companion_runs(run_at, form, model, topic, status, detail, ms) VALUES(?,?,?,?,?,?,?)").bind(nowIso(), "steward", "", "steward", "alert", d, 0).run();
  } catch (e) {
  }
}
__name(steward, "steward");
__name2(steward, "steward");
__name22(steward, "steward");
var GenerationFlow = class extends WorkflowEntrypoint {
  static {
    __name(this, "GenerationFlow");
  }
  static {
    __name2(this, "GenerationFlow");
  }
  static {
    __name22(this, "GenerationFlow");
  }
  async run(event, step) {
    var form = event && event.payload && event.payload.form || RHYTHM[amsWeekday(/* @__PURE__ */ new Date())];
    var out = await step.do("generate", { timeout: "300 seconds" }, async () => {
      return await generate(this.env, form, {});
    });
    if (out && out.ok) {
      await step.do("publish", { timeout: "120 seconds" }, async () => {
        try {
          var pr = await this.env.PERSONAL.prepare("SELECT * FROM companion_pieces WHERE slug = ?").bind(out.slug).all();
          var prow = (pr.results || [])[0];
          if (prow && this.env.EMAIL) {
            prow.link = "https://reading.q08.org/p/" + out.slug;
            await sendMail(this.env, prow, out.slug, prow.day);
          }
        } catch (e) {
        }
      });
    }
    return out;
  }
};
// WORKERS-AI-SPEND-UNATTRIBUTED-RISING-1 (#1681): every env.AI.run in this worker goes through aiRunAttr, which adds a
// per-worker/purpose call counter to D1 ai_call_counters (one UPSERT per call, fail-soft, never blocks or alters the AI call).
// Copied from qnfo-fleet-control (workers cannot import across directories); same table/columns. No new paid service.
// Unlike fleet-control the counter write is NOT awaited (fire-and-forget, errors swallowed) so it can never add latency.
var AI_ATTR_DB_BINDINGS = ["AUDIT_DB","AUDIT","DB_AUDIT","QNFO_AUDIT"];
async function aiRunAttr(env, worker, purpose, model, input, opts) {
  var t0 = Date.now(), ok = 1;
  try { return await env.AI.run(model, input, opts); } catch (e) { ok = 0; throw e; }
  finally {
    try {
      var db = null;
      for (var bi = 0; bi < AI_ATTR_DB_BINDINGS.length && !db; bi++) db = env[AI_ATTR_DB_BINDINGS[bi]];
      if (db) {
        var ic = 0; try { ic = JSON.stringify(input && input.messages || input || "").length; } catch (e2) {}
        var day = new Date().toISOString().slice(0, 10);
        var ms = Date.now() - t0;
        var wr = (async function() {
          await db.prepare("CREATE TABLE IF NOT EXISTS ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, PRIMARY KEY (day, worker, purpose, model))").run();
          await db.prepare("INSERT INTO ai_call_counters (day, worker, purpose, model, calls, errors, in_chars, ms) VALUES (?1,?2,?3,?4,1,?5,?6,?7) ON CONFLICT(day, worker, purpose, model) DO UPDATE SET calls=calls+1, errors=errors+?5, in_chars=in_chars+?6, ms=ms+?7").bind(day, worker, purpose, String(model), ok ? 0 : 1, ic, ms).run();
        })();
        wr.catch(function() {});
      }
    } catch (e3) {}
  }
}
// end aiRunAttr
var __verify = { groundingProblems: groundingProblems, parseFactVerdict: parseFactVerdict, factCheck: factCheck, verifyPiece: verifyPiece, auditPublished: auditPublished, retractPiece: retractPiece, pieceVerified: pieceVerified, recordAudit: recordAudit, generate: generate, pickTopic: pickTopic, sendMail: sendMail, pickReviewers: pickReviewers, familyOf: familyOf, anchorsBlock: anchorsBlock, prompts: { P_STYLE: P_STYLE, P_ESSAY: P_ESSAY, P_NOTES: P_NOTES, P_SERIAL: P_SERIAL, P_CRITIQUE: P_CRITIQUE, FACTCHECK_PROMPT: FACTCHECK_PROMPT }, VISIBLE_SQL: VISIBLE_SQL, REVIEW_POOL: REVIEW_POOL };
export {
  __verify,
  GenerationFlow,
  deliverOwnerPrompts,
  broadcast,
  confirmedSubscribers,
  sendDigest,
  resumeSendRuns,
  suppressedSet,
  sendOwnerNotice,
  sendMorningBrief,
  flagUndeliverableQuestions,
  queueLedgerFollowUp,
  refreshConnectionMetrics,
  isoWeekKey,
  callModel,
  companionStallDetector,
  expandFeedback,
  validatePiece,
  worker_default as default
};
//# sourceMappingURL=worker.js.map