var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
import { WorkflowEntrypoint } from "cloudflare:workers";
var VERSION = "1.3.3";
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
var NL = String.fromCharCode(10);
function L() {
  return Array.prototype.slice.call(arguments).join(NL);
}
__name(L, "L");
var RHYTHM = ["notes", "essay", "notes", "essay", "notes", "essay", "serial"];
var TOPICS = [
  { id: "coffeehouse-public", cat: "cs.CY", wiki: "Coffeehouse", rel: ["Public sphere", "Coffee", "Third place"], a: "the history of coffeehouses", b: "the birth of public space" },
  { id: "walking-thinking", cat: "q-bio.NC", wiki: "Walking", rel: ["Psychogeography", "Fl\xE2neur", "Peripatetic school"], a: "walking", b: "the practice of thinking" },
  { id: "ruins-memory", cat: "q-bio.NC", wiki: "Ruin", rel: ["Romanticism", "Palimpsest", "Ozymandias"], a: "ruins", b: "how memory works" },
  { id: "fermentation-time", cat: "q-bio.PE", wiki: "Fermentation", rel: ["Fermentation in food processing", "Sourdough", "Yeast"], a: "fermentation", b: "the patience of slow transformation" },
  { id: "translation-loss", cat: "cs.CL", wiki: "Untranslatability", rel: ["Translation", "Linguistic relativity", "Sapir-Whorf hypothesis"], a: "translation", b: "what refuses translation" },
  { id: "boredom-creativity", cat: "q-bio.NC", wiki: "Boredom", rel: ["Attention", "Flow (psychology)", "Default mode network"], a: "boredom", b: "the conditions for creativity" },
  { id: "maps-territory", cat: "cs.CY", wiki: "Map", rel: ["Map-territory relation", "Terra nullius", "Cartography"], a: "maps", b: "the territory they claim to describe" },
  { id: "craft-quality", cat: "econ.GN", wiki: "Craft", rel: ["Craftsmanship", "Arts and Crafts movement", "Virtuoso"], a: "craft", b: "what quality means" },
  { id: "garden-wildness", cat: "q-bio.PE", wiki: "Garden", rel: ["Wilderness", "Landscape architecture", "Botanical garden"], a: "gardens", b: "the idea of wildness" },
  { id: "collecting-order", cat: "cs.SI", wiki: "Collecting", rel: ["Museum", "Cabinets of curiosities", "Hoarding"], a: "collecting", b: "the desire for order" },
  { id: "silence-music", cat: "cs.SD", wiki: "Silence", rel: ["John Cage", "Rest (music)", "Soundscape"], a: "silence", b: "music" },
  { id: "handwriting-identity", cat: "cs.HC", wiki: "Handwriting", rel: ["Graphology", "Signature", "Calligraphy"], a: "handwriting", b: "identity" },
  { id: "season-ritual", cat: "cs.CY", wiki: "Season", rel: ["Solstice", "Harvest festival", "Liturgical year"], a: "the seasons", b: "ritual time" },
  { id: "domestication-coevolution", cat: "q-bio.PE", wiki: "Domestication", rel: ["Co-evolution", "Neoteny", "Selective breeding"], a: "domestication", b: "coevolution" },
  { id: "play-rules", cat: "cs.GT", wiki: "Play (activity)", rel: ["Homo Ludens", "Game", "Ludus"], a: "play", b: "rules" },
  { id: "attention-time", cat: "econ.GN", wiki: "Attention economy", rel: ["Information overload", "Continuous partial attention", "Digital detox"], a: "attention", b: "how time is spent" },
  { id: "notation-thought", cat: "cs.CL", wiki: "Musical notation", rel: ["Tablature", "Figured bass", "Laban notation"], a: "notation systems", b: "how they shape what can be thought" },
  { id: "threshold-architecture", cat: "cs.CY", wiki: "Threshold", rel: ["Liminal space", "Vestibule", "Portal"], a: "thresholds in architecture", b: "the psychology of crossing" },
  { id: "debt-memory", cat: "econ.GN", wiki: "Debt", rel: ["Jubilee (biblical)", "Odious debt", "Gift economy"], a: "debt", b: "social memory" },
  { id: "color-perception", cat: "q-bio.NC", wiki: "Color", rel: ["Color theory", "Opponent process", "Munsell color system"], a: "colour perception", b: "the physics of light" },
  { id: "archive-forgetting", cat: "cs.DL", wiki: "Archive", rel: ["Memory institution", "Apophenia", "Deaccessioning"], a: "archives", b: "the logic of forgetting" },
  { id: "rhythm-time", cat: "cs.SD", wiki: "Rhythm", rel: ["Metre (music)", "Polyrhythm", "Entrainment (chronobiology)"], a: "musical rhythm", b: "how bodies keep time" },
  { id: "market-price", cat: "econ.GN", wiki: "Price", rel: ["Price signal", "Auction theory", "Just price"], a: "prices", b: "what they actually measure" },
  { id: "street-city", cat: "cs.CY", wiki: "Street", rel: ["Jane Jacobs", "Haussmann's renovation of Paris", "Shared space"], a: "streets", b: "what cities are for" },
  { id: "tool-hand", cat: "cs.HC", wiki: "Tool", rel: ["Extended mind", "Affordance", "Heidegger's hammer"], a: "tools", b: "the hand that uses them" },
  { id: "dialect-belonging", cat: "cs.CL", wiki: "Dialect", rel: ["Code-switching", "Diglossia", "Language death"], a: "dialects", b: "where belonging lives in speech" },
  { id: "canal-infrastructure", cat: "cs.CY", wiki: "Canal", rel: ["Erie Canal", "Amsterdam canals", "Lock (water transport)"], a: "canals", b: "how infrastructure shapes a city" },
  { id: "portrait-likeness", cat: "cs.CY", wiki: "Portrait", rel: ["Self-portrait", "Physiognomy", "Likeness"], a: "portrait painting", b: "what likeness means" },
  { id: "index-knowledge", cat: "cs.IR", wiki: "Index (publishing)", rel: ["Back-of-book index", "Commonplace book", "Concordance"], a: "indexes", b: "the structure of knowledge" },
  { id: "repair-object", cat: "econ.GN", wiki: "Repair", rel: ["Kintsugi", "Right to repair", "Planned obsolescence"], a: "repair", b: "what an object's life means" },
  { id: "tide-prediction", cat: "physics.ao-ph", wiki: "Tide", rel: ["Tidal force", "Harmonic analysis", "Kelvin's tide predictor"], a: "tide prediction", b: "the history of mechanical computing" },
  { id: "font-reading", cat: "cs.HC", wiki: "Typography", rel: ["Readability", "Legibility", "Type design"], a: "typefaces", b: "how they shape reading" },
  { id: "smell-place", cat: "q-bio.NC", wiki: "Olfaction", rel: ["Odor", "Proust phenomenon", "Smell map"], a: "smell", b: "the memory of places" },
  { id: "border-sovereignty", cat: "cs.CY", wiki: "Border", rel: ["Schengen Area", "Checkpoint Charlie", "Demilitarized zone"], a: "borders", b: "what sovereignty costs" },
  { id: "library-public", cat: "cs.DL", wiki: "Public library", rel: ["Carnegie library", "Free library movement", "Library science"], a: "public libraries", b: "the idea of free access" },
  { id: "bread-culture", cat: "q-bio.PE", wiki: "Bread", rel: ["Sourdough", "Baguette", "Wonder Bread"], a: "bread", b: "what industrial food did to culture" },
  { id: "measurement-standard", cat: "physics.gen-ph", wiki: "Measurement", rel: ["Metre", "International System of Units", "Calibration"], a: "measurement standards", b: "how they become invisible" },
  { id: "clock-time", cat: "cs.CY", wiki: "Clock", rel: ["Mechanical watch", "Atomic clock", "Time zone"], a: "clocks", b: "the social construction of time" },
  { id: "staircase-movement", cat: "cs.CY", wiki: "Staircase", rel: ["Escalator", "Grand staircase", "Accessibility"], a: "staircases", b: "how buildings direct movement" },
  { id: "footnote-scholarship", cat: "cs.DL", wiki: "Footnote", rel: ["Annotation", "Marginalia", "Citation"], a: "footnotes", b: "the hidden argument of scholarship" }
];
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
  "You are writing for one reader: Rowan.",
  "Never reproduce any heading, label, bullet, or phrasing from the briefing, or from these instructions, inside the piece. The briefing is addressed to you, not to the reader.",
  "Not for an audience, not for a journal, not for a metric.",
  "He works at the seams between fields \u2014 history, music, design, language, craft, economics, biology, cities, computation \u2014 wherever two ways of knowing touch. Fragmentation offends him; he can feel a missing connection as a kind of wrongness.",
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
  "FORM: essay, 2000 to 2800 words. This is long-form. One sustained line of thought, carried to the end; do not stop while the argument is still thin, and do not pad.",
  "The subject is one thing. Write about the subject itself, in depth. Do not survey. Argue.",
  "Your argument must be a specific, falsifiable claim with consequences - something a knowledgeable reader could disagree with. It must not be an analogy, a family resemblance, or a restatement of the obvious.",
  "You are given real source material below. Mine it. Use the specific names, dates, numbers, mechanisms and cases it contains; a piece that could have been written without reading the sources has failed.",
  "Cover, in this order, without labelling the parts in the text:",
  "1. open on a concrete particular that puts the reader inside the subject",
  "2. develop what is actually going on, in specific detail drawn from the material, so a reader who knows the subject does not wince",
  "3. build your argument step by step, giving the evidence and reasoning for each step and anticipating a sceptical reader at every turn",
  "4. under a heading, the strongest objection to your argument, in the objector's own terms, answered or honestly conceded",
  "5. what would have to be true for your argument to hold, and what observation would falsify it"
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
  "objection: is the stated objection the strongest available one, or a straw man?",
  "voice: plain scholarly prose free of filler, tells, and self-reference?",
  'Return JSON only: {"specificity":n,"argument":n,"objection":n,"voice":n,"verdict":"accept" or "reject","why":"one sentence"}'
);
var P_BRIDGE = L(
  "You tighten a cross-domain bridge until it is precise and falsifiable.",
  "Given a piece and its stated bridge, rewrite the bridge so that it names the SPECIFIC mechanism or idea on each side, states the EXACT relationship (isomorphism, shared invariant, limiting case, or an analogy honestly labelled), and is falsifiable: say what observation would break it.",
  'If the bridge is currently a vague rhyme dressed as a theorem, replace it with the precise correspondence you can defend. If you cannot defend a structural correspondence, downgrade it to "proposed analogy" and say so.',
  'Return JSON only: {"bridge":{"a":"...","b":"...","kind":"structural" or "proposed analogy"},"bridge_claim":"one precise sentence","objection":"strongest objection to the bridge"}'
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
function html(body, status) {
  return new Response(body, {
    status: status || 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}
__name(html, "html");
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(safeEqual, "safeEqual");
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
async function sha16(s) {
  var data = new TextEncoder().encode(String(s));
  var digest = await crypto.subtle.digest("SHA-256", data);
  var bytes = new Uint8Array(digest).slice(0, 8);
  var out = "";
  for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}
__name(sha16, "sha16");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
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
function amsDayKey(d) {
  var p = amsParts(d);
  return p.year + "-" + p.month + "-" + p.day;
}
__name(amsDayKey, "amsDayKey");
function amsWeekday(d) {
  var names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var p = amsParts(d);
  var idx = names.indexOf(p.weekday);
  return idx < 0 ? d.getUTCDay() : idx;
}
__name(amsWeekday, "amsWeekday");
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
function bannedHits(text) {
  var low = text.toLowerCase();
  var hits = [];
  for (var i = 0; i < BANNED.length; i++) {
    if (low.indexOf(BANNED[i]) >= 0) hits.push(BANNED[i]);
  }
  return hits;
}
__name(bannedHits, "bannedHits");
function isCap(s, i) {
  var c = s.charAt(i);
  return c >= "A" && c <= "Z";
}
__name(isCap, "isCap");
function isLow(s, i) {
  var c = s.charAt(i);
  return c >= "a" && c <= "z";
}
__name(isLow, "isLow");
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
var STOPW = ["The", "A", "An", "In", "On", "At", "By", "To", "Of", "If", "When", "Where", "What", "How", "Why", "Then", "There", "These", "Those", "We", "They", "He", "She", "His", "Her", "Its", "Our", "Their", "Not", "No", "Yet", "So", "As", "From", "With", "Without", "Between", "After", "Before", "During", "Both", "Each", "Every", "All", "Some", "Many", "Most", "Such", "That", "Than", "Because", "Although", "While", "Since", "Thus", "Hence", "Therefore", "However", "Moreover", "Furthermore", "One", "Two", "Three", "But", "And", "For", "Or", "It", "This", "Is", "Are", "Was", "Were", "Be", "Been", "Do", "Does", "Did", "Has", "Have", "Had", "Can", "Could", "Shall", "Should", "Will", "Would", "May", "Might", "Must"];
var STOP = {};
for (sw = 0; sw < STOPW.length; sw++) STOP[STOPW[sw]] = true;
var sw;
function nameCandidates(text) {
  var s = String(text || "");
  var out = [];
  for (var i = 0; i < s.length; i++) {
    if (!isCap(s, i)) continue;
    var a = readWord(s, i);
    if (a.w.length < 3 || STOP[a.w] === true) continue;
    var j = i + a.w.length;
    var sp = 0;
    while (j < s.length && s.charAt(j) === " ") {
      sp++;
      j++;
    }
    if (sp !== 1 || !isCap(s, j)) continue;
    var b = readWord(s, j);
    if (b.w.length < 3 || STOP[b.w] === true) continue;
    out.push(a.w + " " + b.w);
    i = i + a.w.length - 1;
  }
  return out;
}
__name(nameCandidates, "nameCandidates");
function anchorsText(anchors) {
  var parts = [];
  for (var i = 0; i < anchors.length; i++) parts.push(String(anchors[i].title || "") + " " + String(anchors[i].text || ""));
  return parts.join(" ");
}
__name(anchorsText, "anchorsText");
function unverifiedNames(piece, anchors, topic) {
  var at = anchorsText(anchors) + " " + String(topic && topic.a || "") + " " + String(topic && topic.b || "");
  var cand = nameCandidates(String(piece.body_md || ""));
  var low = at.toLowerCase();
  var bad = [];
  for (var i = 0; i < cand.length; i++) {
    if (low.indexOf(cand[i].toLowerCase()) < 0 && bad.indexOf(cand[i]) < 0) bad.push(cand[i]);
  }
  return bad;
}
__name(unverifiedNames, "unverifiedNames");
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
async function embed(env, texts) {
  var resp = await env.AI.run(EMBED_MODEL, { text: texts }, { signal: AbortSignal.timeout(EMBED_TIMEOUT_MS) });
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
}
__name(ensureSchema, "ensureSchema");
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
  return lines.join(NL).slice(0, 6e3);
}
__name(loadContinuity, "loadContinuity");
async function pickTopic(env, form) {
  var used = [];
  try {
    var r = await env.PERSONAL.prepare(
      "SELECT DISTINCT key FROM companion_seeds WHERE used_at > datetime('now','-7 days')"
    ).all();
    var rr = r.results || [];
    for (var i = 0; i < rr.length; i++) used.push(rr[i].key);
  } catch (e) {
    used = [];
  }
  var cooled = {};
  try {
    var cr = await env.PERSONAL.prepare(
      "SELECT topic, SUM(CASE WHEN status IN ('failed','forced') THEN 1 ELSE 0 END) f FROM companion_runs WHERE topic != '' AND run_at > datetime('now','-14 days') GROUP BY topic"
    ).all();
    var crr = cr.results || [];
    for (var ci = 0; ci < crr.length; ci++) if (Number(crr[ci].f) >= 2) cooled[crr[ci].topic] = true;
  } catch (e) {
    cooled = {};
  }
  var fresh = [];
  for (var j = 0; j < TOPICS.length; j++) {
    if (used.indexOf(TOPICS[j].id) < 0 && !cooled[TOPICS[j].id]) fresh.push(TOPICS[j]);
  }
  if (!fresh.length) {
    for (var k = 0; k < TOPICS.length; k++) {
      if (!cooled[TOPICS[k].id]) fresh.push(TOPICS[k]);
    }
  }
  var pool = fresh.length ? fresh : TOPICS.slice();
  var entropy = String(Date.now()) + String(Math.random()) + form;
  var hashBuf = new TextEncoder().encode(entropy);
  var digest = await crypto.subtle.digest("SHA-256", hashBuf);
  var bytes = new Uint8Array(digest);
  var idx = (bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3]) >>> 0;
  idx = idx % pool.length;
  var pick = pool[idx];
  try {
    await env.PERSONAL.prepare(
      "INSERT INTO companion_seeds(key, source, form, used_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET used_at=excluded.used_at, form=excluded.form"
    ).bind(pick.id, "rotation", form, nowIso()).run();
  } catch (e) {
    try {
      await env.PERSONAL.prepare("INSERT OR IGNORE INTO companion_seeds(key, source, form, used_at) VALUES(?,?,?,?)").bind(pick.id, "rotation", form, nowIso()).run();
    } catch (e2) {
    }
  }
  return pick;
}
__name(pickTopic, "pickTopic");
async function fetchArxiv(cat) {
  var url = "https://export.arxiv.org/api/query?search_query=cat:" + encodeURIComponent(cat) + "&sortBy=submittedDate&sortOrder=descending&max_results=5";
  var resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (personal-companion)" }, signal: AbortSignal.timeout(12e3) });
  if (!resp.ok) return [];
  var xml = await resp.text();
  var chunks = sections(xml, "entry");
  var out = [];
  for (var i = 0; i < chunks.length; i++) {
    var title = firstTag(chunks[i], "title");
    var summary = firstTag(chunks[i], "summary");
    var id = firstTag(chunks[i], "id");
    if (title) out.push({ kind: "paper", ref: id, title, text: squish(summary).slice(0, 900) });
    if (out.length >= 3) break;
  }
  return out;
}
__name(fetchArxiv, "fetchArxiv");
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
async function fetchWikiSearch(query) {
  var url = "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" + encodeURIComponent(query) + "&format=json&srlimit=1&redirects=1";
  var resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (personal-companion)" }, signal: AbortSignal.timeout(12e3) });
  if (!resp.ok) return null;
  var j = await resp.json();
  var hits = j && j.query && j.query.search || [];
  if (!hits.length) return null;
  return await fetchWiki(hits[0].title);
}
__name(fetchWikiSearch, "fetchWikiSearch");
async function callModel(env, messages, maxTokens, timeoutMs, model) {
  var useModel = model || WRITER_MODEL;
  var isReasoner = String(useModel).indexOf("reasoner") >= 0;
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
      return { model: useModel, text: null, error: "HTTP " + resp.status + " " + errText.slice(0, 200) };
    }
    var j = await resp.json();
    var msg = j && j.choices && j.choices[0] && j.choices[0].message;
    if (!msg) return null;
    var text = msg.content || "";
    if (typeof text === "string" && text.trim().length > 80) return { model: useModel, text };
    if (msg.reasoning_content && String(msg.reasoning_content).length > 100) {
      return { model: useModel, text: null, error: "reasoner emitted reasoning only (no prose); rlen=" + String(msg.reasoning_content).length };
    }
    return null;
  } catch (e) {
    return { model: useModel, text: null, error: String(e && e.message || e) };
  }
}
__name(callModel, "callModel");
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
  function closeList() {
    if (listOpen) {
      out.push("</ul>");
      listOpen = false;
    }
  }
  __name(closeList, "closeList");
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
function formLabel(f) {
  if (f === "essay") return "Essay";
  if (f === "notes") return "Field notes";
  if (f === "serial") return "Long-form";
  return f;
}
__name(formLabel, "formLabel");
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
  return "<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content=" + String.fromCharCode(34) + "width=device-width,initial-scale=1" + String.fromCharCode(34) + "><title>" + escHtml(title) + "</title><link rel=alternate type=application/rss+xml title=Reading href=/feed.xml><meta name=description content='A personal companion that writes one piece at a time - essays, field notes, and long-form serials.'><style>" + CSS + "</style>" + (extraHead || "") + "</head><body><div class=wrap>" + inner + "</div></body></html>";
}
__name(page, "page");
function shell(inner) {
  return "<header class=mast><h1><a href=/>Reading</a></h1><p>Written for one reader. Private.</p><nav class=forms><a href=/subscribe>subscribe</a><a href=/feed.xml>rss</a></nav></header>" + inner;
}
__name(shell, "shell");
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
function anchorsBlock(topic, anchors, life, profile) {
  var lines = [];
  lines.push("--- briefing. Never reproduce any wording from this briefing in the piece. ---");
  lines.push("subject: " + topic.a);
  lines.push("lens: " + topic.b);
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
  return lines.join(NL).slice(0, 16e3);
}
__name(anchorsBlock, "anchorsBlock");
function countHeadings(md, level) {
  var mark = level === 3 ? "### " : "## ";
  var lines = String(md).split(NL);
  var n = 0;
  for (var i = 0; i < lines.length; i++) if (lines[i].trim().indexOf(mark) === 0) n++;
  return n;
}
__name(countHeadings, "countHeadings");
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
  return { lede: lede, rest: rest, startsHeading: startsHeading };
}
__name(extractLede, "extractLede");
async function composePiece(env, form, topic, anchors, life, profile, continuity, feedback) {
  var formContract = form === "essay" ? P_ESSAY : form === "serial" ? P_SERIAL : P_NOTES;
  var outRule = form === "notes" ? "Output format: plain markdown only, no JSON, no code fences. First line: a single heading starting with # and a short title for the whole set. Then each item as its own ## heading followed by one or two paragraphs." : "Output format: plain markdown only, no JSON, no code fences. First line: a single heading starting with # and the title. Use ## for sections. Include one section headed exactly: ## The strongest objection";
  var sys = [P_STYLE, "", formContract, "", outRule].join(NL);
  var concreteRule = "Every claim must be tied to a named, checkable particular from the source material. Name the paper, the theorem, the number, or the place. A sentence that could have been written without the source material is a failed sentence.";
  var lenRule = concreteRule + " " + (form === "essay" ? "Length: 2000 to 2800 words. This is a requirement, not a suggestion." : form === "serial" ? "Length: 1500 to 2200 words. This is a requirement, not a suggestion." : "Length: four items, each 110 to 170 words. This is a requirement, not a suggestion.");
  var user = [anchorsBlock(topic, anchors, life, profile), "", lenRule, "", continuity, feedback ? "A previous draft was rejected by an adversarial reader for this reason: " + feedback + " Write a better draft that fixes that." : ""].join(NL);
  var writerModel = form === "notes" ? WRITER_MODEL : WRITER_MODEL_ESSAY;
  var r = await callModel(env, [{ role: "system", content: sys }, { role: "user", content: user }], GEN_MAX_TOKENS, WRITER_TIMEOUT_MS, writerModel);
  if (!r || !r.text) {
    var errMsg = r && r.error ? r.error : "callModel returned null";
    return { piece: null, model: writerModel, raw: "", error: errMsg };
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
  if (!title) title = topic.a + " and " + topic.b;
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
async function critiquePiece(env, piece, form) {
  var band = form === "essay" ? "2000 to 2800 words" : form === "serial" ? "1500 to 2200 words" : "3 to 5 items of 90 to 200 words each";
  var user = "FORM: " + form + " (" + band + ")" + NL + NL + "TITLE: " + piece.title + NL + "LEDE: " + (piece.lede || "") + NL + "STATED OBJECTION: " + (piece.objection || "") + NL + NL + "BODY:" + NL + piece.body_md;
  var r = await callModel(env, [{ role: "system", content: P_CRITIQUE }, { role: "user", content: user }], 900, CRITIQUE_TIMEOUT_MS, CRITIC_MODEL);
  return parseJsonLoose(r.text);
}
__name(critiquePiece, "critiquePiece");
async function sharpenBridge(env, piece, form) {
  try {
    var user = "STATED BRIDGE: " + JSON.stringify(piece.bridge || {}) + NL + NL + "PIECE:" + NL + String(piece.body_md).slice(0, 6e3);
    var r = await callModel(env, [{ role: "system", content: P_BRIDGE }, { role: "user", content: user }], 1400, CRITIQUE_TIMEOUT_MS, CRITIC_MODEL);
    var j = parseJsonLoose(r && r.text);
    if (j && j.bridge && j.bridge.a && j.bridge.b) {
      piece.bridge = j.bridge;
      if (j.bridge_claim) piece.bridge.claim = j.bridge_claim;
      if (j.objection) piece.objection = j.objection;
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}
__name(sharpenBridge, "sharpenBridge");
function validatePiece(piece, form) {
  var problems = [];
  if (!piece || !piece.body_md) return { ok: false, problems: ["no body"] };
  var md = String(piece.body_md);
  var wc = wordCount(md);
  if (form === "essay" && (wc < 1700 || wc > 3200)) problems.push("essay length " + wc);
  if (form === "serial" && (wc < 1200 || wc > 2800)) problems.push("serial length " + wc);
  if (form === "notes") {
    var items = countHeadings(md, 2);
    if (items < 3) problems.push("notes items " + items);
    if (wc < 200 || wc > 1800) problems.push("notes length " + wc);
  }
  var hits = bannedHits(md + " " + String(piece.title || "") + " " + String(piece.lede || ""));
  if (hits.length) problems.push("banned: " + hits.join(", "));
  if (hasEmoji(md)) problems.push("emoji present");
  if (!piece.title || String(piece.title).length < 4) problems.push("no title");
  if (form !== "notes" && wc >= 700 && (!piece.objection || String(piece.objection).length < 40)) problems.push("objection too thin");
  return { ok: problems.length === 0, problems, words: wc };
}
__name(validatePiece, "validatePiece");
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
async function persistPiece(env, piece, form, topic, model, quality, words) {
  var day = amsDayKey(/* @__PURE__ */ new Date());
  var salt = String(Date.now()) + topic.id + form;
  var slug = day + "-" + form + "-" + await sha16(salt);
  var anchorJson = JSON.stringify({ topic: topic.id, seam: [topic.a, topic.b], bridge: piece.bridge || null });
  await env.PERSONAL.prepare(
    "INSERT OR IGNORE INTO companion_pieces(slug, form, title, subtitle, lede, body_md, anchor_json, quality_json, word_count, day, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(slug, form, String(piece.title).slice(0, 300), String(piece.subtitle || "").slice(0, 300), String(piece.lede || "").slice(0, 2000), String(piece.body_md), anchorJson, JSON.stringify(quality || {}), words, day, nowIso()).run();
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
async function logRun(env, form, model, topic, status, detail, ms) {
  try {
    await env.PERSONAL.prepare(
      "INSERT INTO companion_runs(run_at, form, model, topic, status, detail, ms) VALUES(?,?,?,?,?,?,?)"
    ).bind(nowIso(), form, String(model || ""), String(topic || ""), status, String(detail || "").slice(0, 1200), ms).run();
  } catch (e) {
  }
}
__name(logRun, "logRun");
async function sendMail(env, piece, slug, day) {
  if (!env.EMAIL) return { ok: false, error: "no email binding" };
  try {
    var subject = piece.title + " (" + formLabel(piece.form || "essay") + ")";
    var body = (/^\s*#/.test(String(piece.body_md || "")) ? "" : (piece.lede ? piece.lede + NL + NL : "")) + String(piece.body_md).slice(0, 2e4) + NL + NL + "Read online: " + String(piece.link || "");
    var resp = await env.EMAIL.fetch("https://email.internal/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (env.EMAIL_API_KEY || "") },
      body: JSON.stringify({ to: "rwnquni@outlook.com", from: "rowan.quni@qnfo.org", subject, body })
    });
    return { ok: resp.ok, status: resp.status };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(sendMail, "sendMail");
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
async function sendOne(env, to, subject, body) {
  if (!env.EMAIL) return { ok: false, error: "no email binding" };
  try {
    var resp = await env.EMAIL.fetch("https://email.internal/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (env.EMAIL_API_KEY || "") },
      body: JSON.stringify({ to, from: "rowan.quni@qnfo.org", subject, body })
    });
    return { ok: resp.ok, status: resp.status };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(sendOne, "sendOne");
function subBase(env, origin) {
  return origin || "https://reading.q08.org";
}
__name(subBase, "subBase");
function escXml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(escXml, "escXml");
function toRfc822(d) {
  try {
    return new Date(d).toUTCString();
  } catch (e) {
    return (/* @__PURE__ */ new Date()).toUTCString();
  }
}
__name(toRfc822, "toRfc822");
function subscribePage(msg) {
  var Q = String.fromCharCode(34);
  return "<div class=sub>" + (msg ? "<p>" + escHtml(msg) + "</p>" : "") + "<form method=post action=/subscribe><input type=email name=email placeholder=" + Q + "you@example.com" + Q + " required><button type=submit>Subscribe</button></form><p class=mut>One email per new piece. Unsubscribe anytime.</p></div>";
}
__name(subscribePage, "subscribePage");
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
async function feedXml(env, u) {
  try {
    await ensureSchema(env);
  } catch (e) {
  }
  var q = await env.PERSONAL.prepare("SELECT slug, title, lede, day, created_at FROM companion_pieces ORDER BY id DESC LIMIT 30").all();
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
async function broadcast(env, slug, origin) {
  if (!env.EMAIL) return { ok: false, error: "no email binding" };
  try {
    var pr = await env.PERSONAL.prepare("SELECT * FROM companion_pieces WHERE slug = ?").bind(slug).all();
    var prow = (pr.results || [])[0];
    if (!prow) return { ok: false, error: "no piece" };
    var q = await env.PERSONAL.prepare("SELECT email, token FROM companion_subscribers WHERE status = 'confirmed' LIMIT 500").all();
    var subs = q.results || [];
    var base = subBase(env, origin);
    var link = base + "/p/" + slug;
    var sent = 0, failed = 0;
    for (var i = 0; i < subs.length; i++) {
      var s = subs[i];
      var body = (/^\s*#/.test(String(prow.body_md || "")) ? "" : (prow.lede ? prow.lede + NL + NL : "")) + String(prow.body_md).slice(0, 2e4) + NL + NL + "Read online: " + link + NL + NL + "Unsubscribe: " + base + "/unsubscribe?t=" + s.token;
      var rr = await sendOne(env, s.email, prow.title, body);
      if (rr && rr.ok) sent++;
      else failed++;
    }
    return { ok: true, sent, failed, total: subs.length };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(broadcast, "broadcast");
async function sendDigest(env) {
  if (!env.EMAIL) return { ok: false, error: "no email binding" };
  try {
    var day = amsDayKey(new Date());
    var pr = await env.PERSONAL.prepare("SELECT slug, title, form FROM companion_pieces WHERE day = ? ORDER BY id ASC").bind(day).all();
    var rows = pr.results || [];
    if (!rows.length) return { ok: true, skipped: "no pieces today", pieces: 0 };
    var q = await env.PERSONAL.prepare("SELECT email, token FROM companion_subscribers WHERE status = 'confirmed' LIMIT 500").all();
    var subs = q.results || [];
    var base = "https://reading.q08.org";
    var list = rows.map(function(r){ return "- " + r.title + " — " + base + "/p/" + r.slug; }).join(NL);
    var sent = 0, failed = 0;
    for (var i = 0; i < subs.length; i++) {
      var s = subs[i];
      var body = "Reading — daily digest (" + day + ")" + NL + NL + list + NL + NL + "Unsubscribe: " + base + "/unsubscribe?t=" + s.token;
      var rr = await sendOne(env, s.email, "Reading — daily digest", body);
      if (rr && rr.ok) sent++; else failed++;
    }
    return { ok: true, pieces: rows.length, sent: sent, failed: failed, total: subs.length };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(sendDigest, "sendDigest");
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
    var seen = {};
    var dayN = Number(amsDayKey(/* @__PURE__ */ new Date()).slice(8, 10)) || 0;
    var addAnchor = /* @__PURE__ */ __name(function(a) {
      if (a && a.title && !seen[a.title]) {
        seen[a.title] = true;
        anchors.push(a);
      }
    }, "addAnchor");
    try {
      addAnchor(await fetchWiki(topic.wiki));
    } catch (e) {
    }
    try {
      addAnchor(await fetchWikiSearch(String(topic.a || "")));
    } catch (e) {
    }
    try {
      addAnchor(await fetchWikiSearch(String(topic.b || "")));
    } catch (e) {
    }
    try {
      for (var ri = 0; ri < (topic.rel || []).length; ri++) addAnchor(await fetchWiki(topic.rel[ri]));
    } catch (e) {
    }
    if (anchors.length < 3) {
      try {
        var papers = await fetchArxiv(topic.cat);
        for (var i = 0; i < papers.length && anchors.length < 4; i++) addAnchor(papers[i]);
      } catch (e) {
      }
    }
    if (anchors.length < 3) {
      var fbWiki = ["Coffeehouse", "Walking", "Ruin", "Craft", "Silence"];
      var fw = fbWiki[dayN % fbWiki.length];
      if (fw !== topic.wiki) {
        try {
          addAnchor(await fetchWiki(fw));
        } catch (e) {
        }
      }
    }
    await logRun(env, form, "", topic.id, "stage", "anchorKinds " + anchors.map(function(x) {
      return x.kind;
    }).join(","), Date.now() - t0);
    await logRun(env, form, "", topic.id, "stage", "anchors " + anchors.length, Date.now() - t0);
    if (anchors.length < 2) {
      await logRun(env, form, "", topic.id, "blocked", "insufficient anchors", Date.now() - t0);
      return { ok: false, error: "insufficient anchors" };
    }
    var attempt = 0;
    var best = null;
    var feedback = "";
    while (attempt < 5) {
      attempt++;
      await logRun(env, form, "", topic.id, "stage", "compose attempt " + attempt, Date.now() - t0);
      var comp = await composePiece(env, form, topic, anchors, life, profile, continuity, feedback);
      model = comp.model;
      await logRun(env, form, model, topic.id, "stage", "composed " + String(comp.piece && comp.piece.body_md || "").length, Date.now() - t0);
      var piece = comp.piece;
      if (!piece) {
        continue;
      }
      var v = validatePiece(piece, form);
      if (v.ok) {
        var badNames = unverifiedNames(piece, anchors, topic);
        var citeBad = [];
        for (var bi = 0; bi < badNames.length; bi++) {
          var nm = badNames[bi];
          if (/[0-9]{4}/.test(nm) || /et al/i.test(nm) || /, ?[A-Z]/.test(nm)) citeBad.push(nm);
        }
        if (citeBad.length) {
          v = { ok: false, problems: ["unverified citations: " + citeBad.slice(0, 6).join(", ")], words: v.words };
        }
      }
      if (!v.ok) {
        await logRun(env, form, model, topic.id, "rejected", "validate: " + v.problems.join("; ") + " || raw: " + String(comp.raw || "").slice(0, 500), Date.now() - t0);
        feedback = "The previous draft failed validation for these reasons: " + v.problems.join("; ") + ". Fix them and try again.";
        continue;
      }
      var dup = await similarExists(env, String(piece.title) + NL + String(piece.body_md), null);
      if (dup) {
        await logRun(env, form, model, topic.id, "rejected", "too similar to " + dup.slug + " (" + dup.score.toFixed(3) + ")", Date.now() - t0);
        continue;
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
      await sharpenBridge(env, piece, form);
      await logRun(env, form, model, topic.id, "stage", "critique", Date.now() - t0);
      var crit = await critiquePiece(env, piece, form);
      var q = crit || {};
      var dims = ["specificity", "argument", "objection", "voice"];
      var worst = 10;
      var worstName = "";
      for (var d = 0; d < dims.length; d++) {
        var val = Number(q[dims[d]]);
        if (!Number.isFinite(val)) val = 5;
        if (val < worst) {
          worst = val;
          worstName = dims[d];
        }
      }
      var floorForForm = form === "notes" ? ACCEPT_FLOOR_NOTES : ACCEPT_FLOOR_ESSAY;
      if (worst < floorForForm) {
        await logRun(env, form, model, topic.id, "rejected", "critique " + worstName + "=" + worst + " :: " + String(q.why || ""), Date.now() - t0);
        feedback = "REVISE the previous draft: keep its strong parts, fix its weak ones. Previous scores: specificity=" + q.specificity + " argument=" + q.argument + " bridge=" + q.bridge + " objection=" + q.objection + " voice=" + q.voice + ". Weakest was " + worstName + ". Why: " + String(q.why || "") + ".";
        q.gate = "forced";
        continue;
      }
      q.gate = "passed";
      best = { piece, quality: q, words: v.words };
      break;
    }
    if (!best) {
      await logRun(env, form, model, topic.id, "failed", "no piece survived the gate", Date.now() - t0);
      return { ok: false, error: "no piece survived the gate" };
    }
    if (best.quality && best.quality.gate === "forced") {
      await logRun(env, form, model, topic.id, "forced", "gate not passed (forced fallback)", Date.now() - t0);
    }
    var slug = await persistPiece(env, best.piece, form, topic, model, best.quality, best.words);
    await logRun(env, form, model, topic.id, "ok", slug, Date.now() - t0);
    return { ok: true, slug, form, title: best.piece.title, words: best.words, quality: best.quality, topic: topic.id, model };
  } catch (e) {
    await logRun(env, form, model, topic ? topic.id : "", "error", String(e && e.message || e), Date.now() - t0);
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(generate, "generate");
var worker_default = {
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
      } catch (e) {
      }
      return json({ ok: true, version: VERSION, pieces: n, last, rhythm: RHYTHM, writer: WRITER_MODEL, writer_essay: WRITER_MODEL_ESSAY, topics: TOPICS.length, gen_hours_utc: GEN_HOURS_UTC, max_per_day: MAX_PIECES_PER_DAY, models: MODELS });
    }
    if (!authorized(request, env)) {
      return json({ error: { message: "unauthorized: append ?k=KEY" } }, 401);
    }
    if (p === "/api/ping") {
      var ping = {};
      for (var pi = 0; pi < MODELS.length; pi++) {
        var t0p = Date.now();
        try {
          var rp = await env.AI.run(MODELS[pi], { messages: [{ role: "user", content: "Reply with the single word: ready" }], max_tokens: 16 }, { gateway: { id: "default" }, signal: AbortSignal.timeout(3e4) });
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
          var rq = await env.AI.run(cand[ci], {
            messages: [
              { role: "system", content: "Write plain scholarly prose. No filler, no emojis, no meta-commentary." },
              { role: "user", content: "Write three short paragraphs, about 250 words total, on why the arithmetic of p-adic numbers resembles musical tuning systems. Be concrete." }
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
          model: cm,
          mt: cmt,
          ms: Date.now() - c0,
          clen: String(cc).length,
          rlen: String(crc).length,
          fr: cr && cr.choices && cr.choices[0] && cr.choices[0].finish_reason || "",
          words: wordCount(String(cc)),
          head: String(cc).slice(0, 1200),
          tail: String(cc).slice(-320)
        });
      } catch (e) {
        return json({ model: cm, mt: cmt, ms: Date.now() - c0, err: String(e && e.message || e).slice(0, 300) });
      }
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
      var lim = Number(u.searchParams.get("limit")) || 30;
      var f2 = u.searchParams.get("form") || "";
      var sql = f2 ? "SELECT slug, form, title, subtitle, lede, word_count, day, created_at, anchor_json, quality_json FROM companion_pieces WHERE form = ? ORDER BY id DESC LIMIT ?" : "SELECT slug, form, title, subtitle, lede, word_count, day, created_at, anchor_json, quality_json FROM companion_pieces ORDER BY id DESC LIMIT ?";
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
      var filter = u.searchParams.get("form") || "";
      var sql2 = filter ? "SELECT slug, form, title, lede, word_count, day FROM companion_pieces WHERE form = ? ORDER BY id DESC LIMIT 200" : "SELECT slug, form, title, lede, word_count, day FROM companion_pieces ORDER BY id DESC LIMIT 200";
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
    if (event.cron === "0 21 * * *") {
      ctx.waitUntil(sendDigest(env).catch(function() {}));
      return;
    }
    ctx.waitUntil((async function() {
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
      } catch (e) {
      }
    })());
  }
};
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
var GenerationFlow = class extends WorkflowEntrypoint {
  static {
    __name(this, "GenerationFlow");
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
export {
  GenerationFlow,
  worker_default as default
};
//# sourceMappingURL=worker.js.map
