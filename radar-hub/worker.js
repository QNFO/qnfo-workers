import { WorkflowEntrypoint } from "cloudflare:workers";
var eventsMod = (function(){
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "1.0.1";
var WORKER = "events-radar";
var DOMAINS = [
  { code: "ADL", name: "Adelic Physics / p-adic info", kw: ["adelic", "p-adic", "idelic", "non-archimedean", "shannon", "rate-distortion", "rate distortion", "entropy", "number theory", "adele", "adelic shannon"] },
  { code: "UMP", name: "Ultrametric foundations / physics foundations", kw: ["ultrametric", "non-archimedean", "hierarchical", "quantum foundations", "foundations of physics", "philosophy of physics", "spacetime", "space-time", "emergence", "renormalization", "foundations"] },
  { code: "SLB", name: "Laws of Form / distinction primitives", kw: ["laws of form", "spencer-brown", "spencer brown", "calculus of indications", "distinction", "re-entry", "reentry", "idempotent", "paradox", "loaf", "brownian"] },
  { code: "INM", name: "Infomatics / information theory", kw: ["information theory", "infomatics", "maxwell", "szilard", "semantic information", "algorithmic information", "kolmogorov", "mutual information", "channel", "coding theory"] },
  { code: "QD", name: "Quantum info / foundations / qubit", kw: ["qubit", "quantum", "qip", "quantum error correction", "quantum algorithm", "quantum information", "decoherence", "entanglement", "quantum computing", "quantum cryptography"] },
  { code: "CMP", name: "Computing machines / models of computation", kw: ["automata", "cellular automata", "lambda calculus", "computability", "turing", "computation", "reversible computation", "formal languages", "hypercomputation", "memcomputing"] },
  { code: "JPC", name: "Energy-efficient / thermodynamic computing", kw: ["energy-efficient", "energy efficient", "green computing", "sustainable computing", "carbon", "landauer", "joules", "energy benchmark", "low-power", "thermodynamic computing", "power consumption", "frugal"] },
  { code: "SR", name: "Cryptography", kw: ["cryptograph", "post-quantum", "side-channel", "side channel", "lattice", "encryption", "privacy", "crypto"] },
  { code: "CON", name: "Complexity science / networks / consilience", kw: ["complex", "network", "consilience", "interdisciplinary", "systems", "agent-based"] },
  { code: "CGS", name: "Gap synthesis / research programs", kw: ["gap synthesis", "portfolio", "research program", "research agenda"] },
  { code: "ODR", name: "Discrete physics (Compton count)", kw: ["compton", "discrete", "counting", "causal", "geometry", "primitive"] },
  { code: "PBO", name: "Pattern-based ontology", kw: ["ontology", "autaxys", "pattern", "taxonomy", "knowledge representation", "categories"] },
  { code: "CFE", name: "Cascading foresight", kw: ["foresight", "anticipation", "forecasting", "futures"] },
  { code: "LOG", name: "Foundations of math / logic", kw: ["logic", "foundations of mathematics", "proof", "type theory", "category theory", "topos", "univalent", "homotopy", "set theory", "symbolic logic"] }
];
var SOURCES = [
  { name: "CWI", url: "https://www.cwi.nl/en/events/", kind: "workshop", domains: ["ADL", "INM", "CMP", "QD"], delivery: "hybrid", cost: 1 },
  { name: "Perimeter", url: "https://perimeterinstitute.ca/conferences", kind: "conference", domains: ["UMP", "QD", "ADL", "INM"], delivery: "hybrid", cost: 1 },
  { name: "FQXi", url: "https://fqxi.org/events", kind: "other", domains: ["UMP", "QD", "SLB", "INM", "ADL"], delivery: "online", cost: 0 },
  { name: "IQOQI", url: "https://iqoqi.at", kind: "colloquium", domains: ["QD", "UMP"], delivery: "hybrid", cost: 0 },
  { name: "MPI-PKS", url: "https://www.pks.mpg.de/events/workshops-seminars/", kind: "workshop", domains: ["UMP", "INM", "CMP"], delivery: "onsite", cost: 1 },
  { name: "SFI", url: "https://www.santafe.edu/events", kind: "seminar", domains: ["CON", "INM", "CFE"], delivery: "hybrid", cost: 0 },
  { name: "QuSoft", url: "https://www.qusoft.org", kind: "workshop", domains: ["QD", "CMP"], delivery: "hybrid", cost: 0 },
  { name: "QuTech", url: "https://www.qutech.nl/events/", kind: "event", domains: ["QD", "JPC"], delivery: "hybrid", cost: 0 },
  { name: "CSH", url: "https://www.csh.ac.at/events/", kind: "webinar", domains: ["CON", "INM", "CFE", "JPC"], delivery: "hybrid", cost: 0 },
  { name: "CSS", url: "https://cssociety.org/events", kind: "conference", domains: ["CON", "INM", "CFE"], delivery: "onsite", cost: 2 },
  { name: "CNA", url: "https://www.complexnetworks.org/", kind: "conference", domains: ["CON", "INM"], delivery: "onsite", cost: 2 },
  { name: "QIP", url: "https://qipconference.org/", kind: "conference", domains: ["QD", "CMP", "SR"], delivery: "onsite", cost: 2 },
  // --- expanded domain scope (2026-09-02, QNFO.OPS.009) ---
  { name: "HotCarbon", url: "https://hotcarbon.org/", kind: "workshop", domains: ["JPC", "CMP"], delivery: "onsite", cost: 1 },
  { name: "ACM-eEnergy", url: "https://energy.acm.org/", kind: "conference", domains: ["JPC", "CMP"], delivery: "onsite", cost: 2 },
  { name: "QWorld", url: "https://qworld.net/", kind: "webinar", domains: ["QD", "CMP"], delivery: "online", cost: 0 },
  { name: "QCrypt", url: "https://qcrypt.net/", kind: "conference", domains: ["SR", "QD"], delivery: "onsite", cost: 2 },
  { name: "IACR", url: "https://www.iacr.org/events/", kind: "conference", domains: ["SR"], delivery: "onsite", cost: 2 },
  { name: "RealWorldCrypto", url: "https://rwc.iacr.org/", kind: "conference", domains: ["SR"], delivery: "onsite", cost: 2 },
  { name: "ASL", url: "https://aslonline.org/meetings/", kind: "meeting", domains: ["LOG", "SLB"], delivery: "hybrid", cost: 1 },
  { name: "IAOA", url: "https://iaoa.org/", kind: "other", domains: ["PBO", "LOG"], delivery: "online", cost: 0 },
  { name: "ICTP", url: "https://www.ictp.it/events", kind: "school", domains: ["UMP", "ADL", "INM", "LOG"], delivery: "hybrid", cost: 1 },
  { name: "IHES", url: "https://www.ihes.fr/en/events/", kind: "lecture", domains: ["UMP", "ADL", "LOG"], delivery: "hybrid", cost: 0 },
  { name: "ESI", url: "https://www.esi.ac.at/events", kind: "workshop", domains: ["UMP", "ADL", "LOG"], delivery: "hybrid", cost: 1 },
  { name: "NetSci", url: "https://netscisociety.net/events", kind: "conference", domains: ["CON", "INM"], delivery: "hybrid", cost: 2 }
];
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
var DEADLINE_FLAGS = [
  { label: "QIP 2027 talk submission", deadline: "2026-10-05T23:59:00-12:00", venue: "QIP", note: "Quantum Information Processing 2027 talk submission (AoE)" }
];
var CATALOG = [
  { title: "QIP 2027 - 30th Conference on Quantum Information Processing", start: "2027-02-20", end: "2027-02-26", kind: "conference", delivery: "onsite", cost: 2, domains: ["QD", "CMP", "SR"], url: "https://qipconference.org/", note: "NUS Singapore. Talk submission 2026-10-05 (AoE).", deadline: "2026-10-05T23:59:00-12:00", verify: { url: "https://qipconference.org/", token: "2027" } },
  { title: "IEEE Quantum Week QCE26 (incl. Q-SET)", start: "2026-09-13", end: "2026-09-18", kind: "conference", delivery: "onsite", cost: 2, domains: ["QD", "CMP"], url: "https://qce.quantum.ieee.org/", note: "Toronto, Canada.", verify: { url: "https://qce.quantum.ieee.org/", token: "QCE26" } },
  { title: "HotCarbon - Hot Topics in Carbon Computing workshop", start: null, end: null, kind: "workshop", delivery: "onsite", cost: 1, domains: ["JPC", "CMP"], url: "https://hotcarbon.org/", note: "Energy/carbon-efficient systems workshop (co-located with systems conf).", verify: { url: "https://hotcarbon.org/", token: "carbon" } },
  { title: "QCrypt - International Conf. on Quantum Cryptography", start: null, end: null, kind: "conference", delivery: "onsite", cost: 2, domains: ["SR", "QD"], url: "https://qcrypt.net/", note: "Annual quantum cryptography conference.", verify: { url: "https://qcrypt.net/", token: "qcrypt" } },
  { title: "Delft Quantum Showcase (QuTech)", start: null, end: null, kind: "event", delivery: "onsite", cost: 0, domains: ["QD"], url: "https://www.qutech.nl/events/", note: "Public showcase at QuTech Delft.", verify: { url: "https://www.qutech.nl/events/", token: "showcase" } }
];
var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
var MONTH_RE = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
var ENTITY_MAP = { amp: "&", lt: "<", gt: ">", quot: String.fromCharCode(34), apos: String.fromCharCode(39), nbsp: " ", ndash: "\u2013", mdash: "\u2014", lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201C", rdquo: "\u201D", hellip: "\u2026", times: "\xD7", middot: "\xB7", sdot: "\u22C5", minus: "\u2212", deg: "\xB0", micro: "\xB5" };
function decodeEntities(x) {
  return String(x || "").replace(/&#x([0-9a-fA-F]+);|&#([0-9]+);|&([a-zA-Z][a-zA-Z0-9]*);/g, function(m, hx, dec, name) {
    if (hx) {
      try {
        return String.fromCodePoint(parseInt(hx, 16));
      } catch (e) {
        return m;
      }
    }
    if (dec) {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch (e) {
        return m;
      }
    }
    return Object.prototype.hasOwnProperty.call(ENTITY_MAP, name) ? ENTITY_MAP[name] : m;
  });
}
__name(decodeEntities, "decodeEntities");
function cleanHtml(text) {
  const s = String(text || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}
__name(cleanHtml, "cleanHtml");
function pad2(n) {
  return String(n).padStart(2, "0");
}
__name(pad2, "pad2");
function extractEvents(text, src) {
  const events = [];
  let discarded = 0;
  const clean = cleanHtml(text);
  const cutYear = (/* @__PURE__ */ new Date()).getFullYear();
  const dropGarbage = /* @__PURE__ */ __name((s) => /\.st\d+\s*\{|fill\s*:\s*none|"id"\s*:\s*\d+\s*,|window\.|function\s+\(/i.test(s), "dropGarbage");
  const seen = /* @__PURE__ */ new Set();
  const rangeRe = new RegExp("(" + MONTH_RE + ")[a-z]*\\.?\\s+(\\d{1,2})\\s*[-\u2013\u2014]\\s*(\\d{1,2})\\s*,?\\s*(20\\d{2})", "gi");
  const rangeRe2 = new RegExp("(\\d{1,2})\\s*[-\u2013\u2014]\\s*(\\d{1,2})\\s+(" + MONTH_RE + ")[a-z]*\\.?\\s*,?\\s*(20\\d{2})", "gi");
  const singleRe = new RegExp("(" + MONTH_RE + ")[a-z]*\\.?\\s+(\\d{1,2})\\s*,?\\s*(20\\d{2})", "gi");
  const singleRe2 = new RegExp("(\\d{1,2})\\s+(" + MONTH_RE + ")[a-z]*\\.?\\s*,?\\s*(20\\d{2})", "gi");
  const push = /* @__PURE__ */ __name((mo, d1, d2, yr, idx) => {
    const mon = (mo || "").toLowerCase().slice(0, 3);
    const month = MONTHS[mon];
    if (!month) {
      discarded += 1;
      return;
    }
    const year = yr ? parseInt(yr, 10) : 0;
    if (year < cutYear || year > cutYear + 2) {
      discarded += 1;
      return;
    }
    const startIso = toISO(year, month, Math.min(d1 || 1, 28));
    const endIso = d2 ? toISO(year, month, Math.min(d2, 28)) : startIso;
    const key = src.name + "|" + startIso;
    if (seen.has(key)) return;
    const snippet = clean.slice(Math.max(0, idx - 80), idx + 200).slice(0, 240);
    if (dropGarbage(snippet)) {
      discarded += 1;
      return;
    }
    seen.add(key);
    const dateText = d2 ? mo + " " + d1 + "-" + d2 + ", " + year : mo + " " + d1 + ", " + year;
    events.push({ venue: src.name, dateText, startIso, endIso, year, month, day: d1 || null, url: src.url, snippet, srcKind: src.kind, srcDelivery: src.delivery, srcCost: src.cost, srcDomains: (src.domains || []).slice() });
  }, "push");
  function toISO(y, m, d) {
    return y + "-" + pad2(m) + "-" + pad2(d);
  }
  __name(toISO, "toISO");
  for (const m of clean.matchAll(rangeRe)) push(m[1], parseInt(m[2], 10), parseInt(m[3], 10), m[4], m.index);
  for (const m of clean.matchAll(rangeRe2)) push(m[3], parseInt(m[1], 10), parseInt(m[2], 10), m[4], m.index);
  for (const m of clean.matchAll(singleRe)) push(m[1], parseInt(m[2], 10), null, m[3], m.index);
  for (const m of clean.matchAll(singleRe2)) push(m[2], parseInt(m[1], 10), null, m[3], m.index);
  const kept = events.slice(0, 16);
  discarded += Math.max(0, events.length - kept.length);
  return { events: kept, discarded };
}
__name(extractEvents, "extractEvents");
function classify(ev) {
  const s = (ev.snippet || "").toLowerCase();
  let kind = ev.srcKind;
  if (/webinar|online seminar|zoom|livestream|live stream|youtube|virtual talk/i.test(s)) kind = "webinar";
  else if (/meetup|community|networking|hackathon/i.test(s)) kind = "meetup";
  else if (/summer school|winter school|school on|doctoral school/i.test(s)) kind = "school";
  else if (/workshop/i.test(s)) kind = "workshop";
  else if (/colloquium/i.test(s)) kind = "colloquium";
  else if (/seminar/i.test(s)) kind = "seminar";
  else if (/lecture|public talk|talk:/i.test(s)) kind = "lecture";
  else if (/conference|symposium/i.test(s)) kind = "conference";
  const hasInPerson = /in person|in-person|onsite|on-site|venue|location:|conference centre|university|hotel/i.test(s);
  let delivery = ev.srcDelivery;
  if (/online|virtual|webinar|zoom|remote|livestream|live stream|youtube|hybrid/i.test(s)) delivery = hasInPerson ? "hybrid" : "online";
  else if (hasInPerson) delivery = "onsite";
  let cost = ev.srcCost;
  if (/free|no fee|complimentary|donation|open to all|no registration fee/i.test(s)) cost = 0;
  else if (/registration fee|\bfee\b|ticket|registration required|paypal|checkout/i.test(s)) cost = 1;
  return { kind, delivery, cost };
}
__name(classify, "classify");
function domainHits(ev) {
  const text = ((ev.snippet || "") + " " + ev.venue).toLowerCase();
  const hits = [];
  for (const d of DOMAINS) {
    let n = 0;
    for (const kw of d.kw) if (text.indexOf(kw) !== -1) n += 1;
    if (n > 0) hits.push({ code: d.code, name: d.name, n });
  }
  if (hits.length === 0 && Array.isArray(ev.srcDomains)) {
    for (const code of ev.srcDomains.slice(0, 4)) {
      const d = DOMAINS.find((x) => x.code === code);
      if (d && !hits.some((h) => h.code === code)) hits.push({ code: d.code, name: d.name, n: 0, affinity: true });
    }
  }
  hits.sort((a, b) => b.n - a.n);
  return hits;
}
__name(domainHits, "domainHits");
function kindFriction(kind) {
  const m = { webinar: 0, meetup: 1, lecture: 1, seminar: 1, meeting: 1, colloquium: 2, event: 2, other: 2, workshop: 3, school: 4, conference: 5 };
  return m[kind] !== void 0 ? m[kind] : 2;
}
__name(kindFriction, "kindFriction");
function deliveryFriction(d) {
  return d === "online" ? 0 : d === "hybrid" ? 1 : d === "onsite" ? 3 : 2;
}
__name(deliveryFriction, "deliveryFriction");
function costFriction(c) {
  return c === 0 ? 0 : c === 1 ? 1 : 2;
}
__name(costFriction, "costFriction");
function scoreEvent(ev) {
  const c = classify(ev);
  const hits = domainHits(ev);
  const domainCount = hits.length;
  const strong = hits.filter((h) => h.n >= 2).length;
  const relevance = domainCount === 0 ? 0 : Math.min(10, 2 + domainCount + strong);
  const friction = Math.min(10, kindFriction(c.kind) + deliveryFriction(c.delivery) + costFriction(c.cost));
  const priority = Math.round(relevance * 10 / (1 + friction) * 10) / 10;
  return {
    ...ev,
    kind: c.kind,
    delivery: c.delivery,
    cost: c.cost,
    domains: hits.slice(0, 4).map((h) => h.code),
    domainDetail: hits.slice(0, 4),
    relevance,
    friction,
    priority,
    frictionClass: friction <= 2 ? "LOW" : friction <= 5 ? "MED" : "HIGH"
  };
}
__name(scoreEvent, "scoreEvent");
async function scanVenue(src) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8e3);
  try {
    const r = await fetch(src.url, { headers: { "User-Agent": UA, "Accept": "text/html" }, redirect: "follow", signal: ctrl.signal });
    const text = await r.text();
    if (r.ok) return { name: src.name, ...extractEvents(text, src) };
    return { name: src.name, events: [], discarded: 0, error: "HTTP " + r.status };
  } catch (e) {
    return { name: src.name, events: [], discarded: 0, error: e && e.name === "AbortError" ? "timeout" : String(e && e.message || e).slice(0, 100) };
  } finally {
    clearTimeout(t);
  }
}
__name(scanVenue, "scanVenue");
function flagStatus(deadlineIso, now) {
  const dl = new Date(deadlineIso).getTime();
  const days = (dl - now.getTime()) / 864e5;
  if (days < 0) return "PASSED";
  if (days <= 7) return "IMMINENT";
  if (days <= 30) return "UPCOMING";
  return "FUTURE";
}
__name(flagStatus, "flagStatus");
async function verifyCatalog(env) {
  const out = [];
  for (const c of CATALOG) {
    let verified = false;
    let err = null;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8e3);
      const r = await fetch(c.verify.url, { headers: { "User-Agent": UA }, redirect: "follow", signal: ctrl.signal });
      clearTimeout(t);
      const text = await r.text();
      verified = r.ok && text.toLowerCase().indexOf(c.verify.token.toLowerCase()) !== -1;
    } catch (e) {
      err = String(e && e.message || e).slice(0, 80);
    }
    out.push({ ...c, verified, verifyError: err });
  }
  return out;
}
__name(verifyCatalog, "verifyCatalog");
function fmtDate(iso) {
  return iso ? iso : "TBA";
}
__name(fmtDate, "fmtDate");
function costLabel(c) {
  return c === 0 ? "free" : c === 1 ? "fee?" : "paid";
}
__name(costLabel, "costLabel");
function renderReport(scannedAt, nowIso, scored, flags, catalogs, stats) {
  const L = [];
  const horizon = stats.horizonISO;
  L.push("EVENTS-RADAR SCAN \u2014 generated " + scannedAt.slice(0, 10) + " (window: " + scannedAt.slice(0, 10) + " .. " + horizon + ")");
  L.push("[EVENTS-RADAR: " + stats.inWindow + " events | " + stats.okVenues + " venues ok | " + stats.catalogVerified + "/" + catalogs.length + " catalog verified | " + flags.length + " deadline " + (flags.length === 1 ? "flag" : "flags") + "]");
  L.push("");
  L.push("Ranking rule: priority = 10 \xD7 relevance \xF7 (1 + friction). Friction = kind + delivery + cost");
  L.push("(0 = free online webinar \u2026 10 = paid multi-day conference abroad). Free low-friction");
  L.push("relevant events are ranked above costly travel conferences by design.");
  L.push("");
  const top = scored.filter((e) => e.relevance >= 4 && e.priority >= 4 && e.frictionClass !== "HIGH").sort((a, b) => b.priority - a.priority || a.startIso.localeCompare(b.startIso)).slice(0, 10);
  L.push("## Top picks \u2014 relevance \xF7 friction");
  if (top.length === 0) L.push("_No events cleared the top-pick threshold this scan._");
  for (const e of top) {
    L.push("- [P " + e.priority + " | " + e.frictionClass + " friction] " + fmtDate(e.startIso) + " [" + e.kind + "|" + e.delivery + "|" + costLabel(e.cost) + "] " + e.venue + ": " + e.snippet.slice(0, 120) + "  \u2192 " + e.domains.join("/") + "  <" + e.url + ">");
  }
  const upcoming = scored.slice().sort((a, b) => a.startIso.localeCompare(b.startIso) || a.venue.localeCompare(b.venue));
  L.push("");
  L.push("## Upcoming events (chronological, window \u2264 " + horizon + ")");
  if (upcoming.length === 0) L.push("_None in window._");
  for (const e of upcoming) {
    L.push("- " + fmtDate(e.startIso) + (e.endIso && e.endIso !== e.startIso ? "\u2026" + e.endIso : "") + " [" + e.kind + "|" + e.delivery + "|" + costLabel(e.cost) + "] " + e.venue + ": " + e.snippet.slice(0, 130) + "  \u2192 " + (e.domains.join("/") || "\u2014") + "  <" + e.url + ">");
  }
  L.push("");
  L.push("## Deadline flags");
  for (const f of flags) L.push("- [" + f.status + "] " + f.label + " \u2014 " + f.deadline + " (" + f.note + ")");
  L.push("");
  L.push("## Canonical catalog (re-verified against source page each scan)");
  for (const c of catalogs) {
    const tag = c.verified ? "VERIFIED" : c.verifyError ? "UNREACHABLE" : "CANDIDATE-UNVERIFIED";
    L.push("- [" + tag + "] " + c.title + (c.start ? "  " + c.start + (c.end && c.end !== c.start ? ".." + c.end : "") : "") + " [" + c.kind + "|" + c.delivery + "|" + costLabel(c.cost) + "|" + c.domains.join("/") + "]  " + c.note + "  <" + c.url + ">" + (c.deadline ? "  deadline " + c.deadline : ""));
  }
  L.push("");
  L.push("## Source health");
  L.push("- venues ok: " + stats.okVenues + "/" + stats.totalVenues + " | discarded: " + stats.discarded + " | venue errors: " + stats.venueErrors.length);
  for (const v of stats.venueErrors) L.push("- ERR " + v.venue + ": " + v.error);
  return L.join("\n");
}
__name(renderReport, "renderReport");
async function ensureSchema(env) {
  await env.RADAR_DB.prepare("CREATE TABLE IF NOT EXISTS events_radar (slug TEXT PRIMARY KEY, report TEXT, events_json TEXT, scanned_at TEXT, updated_at TEXT, curated_json TEXT, flags_json TEXT)").run();
  for (const col of ["curated_json", "flags_json"]) {
    try {
      await env.RADAR_DB.prepare("ALTER TABLE events_radar ADD COLUMN " + col + " TEXT").run();
    } catch (e) {
    }
  }
}
__name(ensureSchema, "ensureSchema");
async function run(env) {
  await ensureSchema(env);
  const scannedAt = (/* @__PURE__ */ new Date()).toISOString();
  const now = /* @__PURE__ */ new Date();
  const nowIso = scannedAt.slice(0, 10);
  const horizon = new Date(now.getTime() + 365 * 864e5).toISOString().slice(0, 10);
  const results = await Promise.allSettled(SOURCES.map((s) => scanVenue(s)));
  const rawEvents = [];
  const venueErrors = [];
  let discarded = 0;
  results.forEach((res, i) => {
    if (res.status === "fulfilled" && res.value) {
      if (res.value.error) venueErrors.push({ venue: SOURCES[i].name, error: res.value.error });
      else {
        rawEvents.push(...res.value.events);
        discarded += res.value.discarded;
      }
    } else venueErrors.push({ venue: SOURCES[i].name, error: String((res.reason || "?").slice(0, 100)) });
  });
  const inWindow = rawEvents.filter((e) => e.startIso >= nowIso && e.startIso <= horizon);
  const scored = inWindow.map(scoreEvent);
  const seen = /* @__PURE__ */ new Set();
  const uniq = scored.filter((e) => {
    const k = e.venue + "|" + e.startIso;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const flags = DEADLINE_FLAGS.map((f) => ({ ...f, status: flagStatus(f.deadline, now) })).filter((f) => f.status !== "PASSED");
  const catalogs = await verifyCatalog(env);
  const stats = {
    inWindow: uniq.length,
    discarded,
    okVenues: SOURCES.length - venueErrors.length,
    totalVenues: SOURCES.length,
    venueErrors,
    catalogVerified: catalogs.filter((c) => c.verified).length,
    horizonISO: horizon
  };
  const report = renderReport(scannedAt, nowIso, uniq, flags, catalogs, stats);
  const slug = "events-radar-" + scannedAt.slice(0, 10);
  let delivery = null;
  try {
    if (env.OBSIDIAN_WRITER) {
      const dr = await env.OBSIDIAN_WRITER.fetch("https://obsidian-writer/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: "events-radar", section: "Events Radar", content: report, date: scannedAt.slice(0, 10) })
      });
      delivery = { status: dr.status, ok: dr.ok };
    }
  } catch (e) {
    delivery = { error: String(e && e.message || e).slice(0, 120) };
  }
  let email = null;
  try {
    if (env.EMAIL && env.EMAIL_API_KEY) {
      const er = await env.EMAIL.fetch("https://qnfo-email.internal/send", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": env.EMAIL_API_KEY },
        body: JSON.stringify({ to: "alerts@qnfo.org", subject: "Events Radar scan " + scannedAt.slice(0, 10), body: report })
      });
      email = { status: er.status, ok: er.ok };
    }
  } catch (e) {
    email = { error: String(e && e.message || e).slice(0, 120) };
  }
  await env.RADAR_DB.prepare(
    "INSERT OR REPLACE INTO events_radar (slug, report, events_json, curated_json, flags_json, scanned_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(slug, report, JSON.stringify(uniq), JSON.stringify(catalogs), JSON.stringify(flags), scannedAt, scannedAt).run();
  return {
    slug,
    version: VERSION,
    events: uniq.length,
    discarded,
    venueErrors: venueErrors.length,
    catalogVerified: stats.catalogVerified + "/" + catalogs.length,
    flags: flags.map((f) => f.label + ":" + f.status),
    topPicks: uniq.slice().sort((a, b) => b.priority - a.priority).slice(0, 5).map((e) => "P" + e.priority + " " + e.startIso + " " + e.venue + " " + e.domains.join("/")),
    delivery,
    email
  };
}
__name(run, "run");
var worker_default = {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/" && url.searchParams.get("run") === "1") {
      const out = await run(env);
      return new Response(JSON.stringify({ ok: true, ...out }), { headers: { "content-type": "application/json" } });
    }
    if (url.pathname === "/") {
      const rows = await env.RADAR_DB.prepare("SELECT report FROM events_radar ORDER BY scanned_at DESC LIMIT 1").all();
      const latest = rows.results && rows.results[0];
      return new Response(latest ? latest.report : "No scan yet. GET /?run=1", { headers: { "content-type": "text/markdown" } });
    }
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, worker: WORKER, version: VERSION }), { headers: { "content-type": "application/json" } });
    }
    return new Response("events-radar worker: GET / (latest report) | GET /?run=1 (trigger scan) | GET /health", { status: 404 });
  }
};
return { default: worker_default };
})();
//# sourceMappingURL=worker.js.map

var arxivMod = (function(){
const QNFO_VERSION = "qnfo-arxiv-radar/fabric-20260910";
const VERSION = "1.0.1+fabric.20260910";
var arxivModDefault = {
  async scheduled(event, env, ctx) {
    try {
      const out = await run(env);
      console.log("arxiv-radar", JSON.stringify(out));
    } catch (e) {
      console.error("arxiv-radar", String((e && e.message) || e));
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, worker: "qnfo-arxiv-radar", version: VERSION }), { headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/run") {
      const out = await run(env);
      return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  }
};
const WIDE_QUERY = '(all:"ultrametric" OR all:"p-adic" OR all:"Bruhat-Tits" OR all:"quantum energy" OR all:"joules per solution" OR all:"quantum error correction" OR all:"ZBW" OR all:"quantum thermodynamics" OR all:"Landauer" OR all:"energy per logical qubit" OR all:"Margolus-Levitin" OR all:"cryogenic controller" OR all:"primon" OR all:"Gentile statistics" OR all:"adelic" OR all:"arithmetic quantum") AND (cat:quant-ph OR cat:math-ph OR cat:hep-th OR cat:cs.ET)';
const STRONG = ["ultrametric","p-adic","bruhat","primon","adelic","gentile","joules","landauer","margolus","quantum energy","error correction","thermodynamics","logical qubit","zbw","arithmetic","energy overhead","energy efficiency","cryogenic"];
const UA = "Mozilla/5.0 (QNFO arxiv-radar)";
function pad(n) { return String(n).padStart(2, "0"); }
async function run(env) {
  const out = { hits: 0, candidates: 0, enqueued: 0, dupes: 0, noteKey: null, error: null, sample: [] };
  let hits = [];
  try {
    const q = encodeURIComponent(WIDE_QUERY);
    const r = await fetch("https://export.arxiv.org/api/query?search_query=" + q + "&start=0&max_results=20&sortBy=submittedDate&sortOrder=descending", { headers: { "User-Agent": UA } });
    const txt = await r.text();
    const entries = txt.split("<entry>").slice(1);
    for (const en of entries) {
      const t = (en.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
      const id = (en.match(/<id>[\s\S]*?arxiv\.org\/abs\/([^<]+)<\/id>/) || [])[1] || "";
      const pub = (en.match(/<published>([^<]+)<\/published>/) || [])[1] || "";
      const sum = (en.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1] || "";
      const authors = [];
      const am = en.match(/<name>([\s\S]*?)<\/name>/g) || [];
      for (const a of am) authors.push(a.replace(/<\/?name>/g, "").trim());
      if (t) hits.push({ id: id.trim(), title: t.replace(/\s+/g, " ").trim().slice(0, 220), published: pub.slice(0, 10), authors: authors.slice(0, 6), text: (t + " " + sum).replace(/\s+/g, " ").toLowerCase() });
    }
  } catch (e) { out.error = String((e && e.message) || e); }
  out.hits = hits.length;
  const candidates = [];
  for (const h of hits) {
    let score = 0;
    for (const kw of STRONG) if (h.text.includes(kw)) score++;
    if (score >= 1) candidates.push(h);
  }
  out.candidates = candidates.length;
  out.sample = candidates.slice(0, 5).map(function(c){ return c.id + " " + c.title.slice(0, 60); });
  const lines = [];
  for (const c of candidates.slice(0, 15)) {
    lines.push("- [" + c.id + "] " + c.title + " (" + c.published + ") " + c.authors.slice(0, 3).join(", "));
  }
  const d = new Date();
  const ymd = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const key = "notes/v1/" + d.getFullYear() + "/" + pad(d.getMonth() + 1) + "/" + ymd + "/_arxiv-radar-" + ymd + ".md";
  const body = "# arXiv Radar " + ymd + "\n\nWidened scan: " + hits.length + " hits, " + candidates.length + " strong candidates\n\n" + lines.join("\n") + "\n";
  try {
    if (env.VAULT) { await env.VAULT.put(key, body, { httpMetadata: { contentType: "text/markdown" } }); out.noteKey = key; }
  } catch (e) {}
  if (env.AUDIT) {
    for (const c of candidates.slice(0, 8)) {
      try {
        const dup = await env.AUDIT.prepare("SELECT 1 AS x FROM outreach_queue WHERE paper_id=?1 LIMIT 1").bind(c.id.slice(0, 40)).first();
        if (dup) { out.dupes++; continue; }
        await env.AUDIT.prepare("INSERT INTO outreach_queue (id, paper_id, author, email, reason, status, created_at) VALUES (?1,?2,?3,NULL,?4,'pending', datetime('now'))").bind("aq-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), c.id.slice(0, 40), "", "arxiv-radar widened: " + c.title.slice(0, 120)).run();
        out.enqueued++;
      } catch (e) {}
    }
  }
  return out;
}

return arxivModDefault;
})();
var researchMod = (function(){
const QNFO_VERSION = "qnfo-research-radar/fabric-20260910";
const VERSION = "1.0.1+fabric.20260910";
var researchModDefault = {
  async scheduled(event, env, ctx) {
    const cron = event.cron;
    let out;
    try {
      if (cron === "0 8 * * 7") out = await jobZenodo(env);
      else if (cron === "0 6 1 * *") out = await jobPhilpapers(env);
      else if (cron === "0 9 * * 7") out = await jobSeo(env);
      else out = { status: "skipped", cron: cron };
      console.log("research-radar", JSON.stringify(out));
    } catch (e) {
      console.error("research-radar", String((e && e.message) || e));
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, worker: "qnfo-research-radar", version: VERSION }), { headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/run") {
      const mode = url.searchParams.get("job") || "all";
      const results = {};
      if (mode === "zenodo" || mode === "all") results.zenodo = await jobZenodo(env);
      if (mode === "philpapers" || mode === "all") results.philpapers = await jobPhilpapers(env);
      if (mode === "seo" || mode === "all") results.seo = await jobSeo(env);
      return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  }
};
const ZENODO_DOIS = ["10.5281/zenodo.21803159","10.5281/zenodo.21786473","10.5281/zenodo.21784489","10.5281/zenodo.21784490","10.5281/zenodo.21786603"];
const SITEMAPS = ["https://rwnq8.github.io/sitemap.xml","https://qnfo-landing.pages.dev/sitemap.xml"];
function pad(n) { return String(n).padStart(2, "0"); }
function todayKey() {
  const d = new Date();
  const ymd = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  return { ymd: ymd, dir: "notes/v1/" + d.getFullYear() + "/" + pad(d.getMonth() + 1) + "/" + ymd };
}
async function writeNote(env, name, body) {
  const t = todayKey();
  const key = t.dir + "/_" + name + "-" + t.ymd + ".md";
  try {
    if (env.VAULT) { await env.VAULT.put(key, body, { httpMetadata: { contentType: "text/markdown" } }); return key; }
  } catch (e) {}
  return null;
}
async function jobZenodo(env) {
  const lines = [];
  let ok = 0;
  for (const doi of ZENODO_DOIS) {
    try {
      const r = await fetch("https://doi.org/api/handles/" + doi, { headers: { "User-Agent": "QNFO zenodo attribution audit (mailto:rwnquni@outlook.com)" } });
      if (r.ok) { ok++; lines.push("- " + doi + " | resolve: OK (HTTP " + r.status + ")"); }
      else lines.push("- " + doi + " | resolve: FAIL (HTTP " + r.status + ")");
    } catch (e) { lines.push("- " + doi + " | resolve: ERROR " + String((e && e.message) || e)); }
  }
  const body = "# Zenodo Attribution Audit " + todayKey().ymd + "\n\nDOIs checked: " + ZENODO_DOIS.length + " | resolving: " + ok + "\n\n" + lines.join("\n") + "\n";
  const noteKey = await writeNote(env, "zenodo-attribution", body);
  return { status: "ok", resolving: ok, total: ZENODO_DOIS.length, noteKey: noteKey };
}
async function jobPhilpapers(env) {
  let status = 0, len = 0, line = "no check";
  try {
    const r = await fetch("https://philpapers.org/s/Quni-Gudzinas", { headers: { "User-Agent": "Mozilla/5.0 (QNFO philpapers monitor)" } });
    status = r.status;
    const t = await r.text();
    len = t.length;
    line = "philpapers.org search page HTTP " + status + " | bytes " + len;
  } catch (e) { line = "ERROR " + String((e && e.message) || e); }
  const body = "# PhilPapers Index Monitor " + todayKey().ymd + "\n\n" + line + "\n";
  const noteKey = await writeNote(env, "philpapers", body);
  return { status: "ok", httpStatus: status, bytes: len, noteKey: noteKey };
}
async function jobSeo(env) {
  const lines = [];
  for (const u of SITEMAPS) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (QNFO SEO health)" } });
      const t = await r.text();
      const lastmod = (t.match(/<lastmod>([^<]+)<\/lastmod>/i) || [])[1] || "none";
      lines.push("- " + u + " | HTTP " + r.status + " | bytes " + t.length + " | lastmod " + lastmod);
    } catch (e) { lines.push("- " + u + " | ERROR " + String((e && e.message) || e)); }
  }
  const body = "# SEO Health Check " + todayKey().ymd + "\n\n" + lines.join("\n") + "\n";
  const noteKey = await writeNote(env, "seo-health", body);
  return { status: "ok", noteKey: noteKey, checks: lines.length };
}

return researchModDefault;
})();
var citationMod = (function(){
const QNFO_VERSION = "qnfo-citation-watch/fabric-20260910";
var citationModDefault = {
  async scheduled(event, env, ctx) {
    try {
      const out = await run(env);
      console.log("citation-watch", JSON.stringify(out));
    } catch (e) {
      console.error("citation-watch", String((e && e.message) || e));
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, worker: "qnfo-citation-watch", version: "1.0.0" }), { headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/run") {
      const out = await run(env);
      return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  }
};
const KNOWN_DOIS = [
  "10.5281/zenodo.21803159",
  "10.5281/zenodo.21786473",
  "10.5281/zenodo.21784489",
  "10.5281/zenodo.21784490",
  "10.5281/zenodo.21786603"
];
async function run(env) {
  const lines = [];
  let total = 0;
  for (const doi of KNOWN_DOIS) {
    try {
      const r = await fetch("https://api.openalex.org/works/doi:" + doi, { headers: { "User-Agent": "QNFO citation watch (mailto:rwnquni@outlook.com)" } });
      if (!r.ok) continue;
      const w = await r.json();
      const cited = (w && w.cited_by_count) || 0;
      total += cited;
      lines.push("- " + ((w && w.title) || doi) + " | cited_by: " + cited);
      const cr = await fetch("https://api.openalex.org/works?filter=cites:" + doi + "&per-page=5", { headers: { "User-Agent": "QNFO citation watch (mailto:rwnquni@outlook.com)" } });
      if (cr.ok) {
        const c = await cr.json();
        for (const cit of (c.results || []).slice(0, 3)) {
          lines.push("    - " + ((cit && cit.title) || "untitled") + " | " + ((cit && cit.publication_date) || ""));
        }
      }
    } catch (e) {}
  }
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const key = "notes/v1/" + d.getFullYear() + "/" + pad(d.getMonth() + 1) + "/" + ymd + "/_citation-watch-" + ymd + ".md";
  const body = "# Citation Watch " + ymd + "\n\nTotal known-DOI citations: " + total + "\n\n" + lines.join("\n") + "\n";
  let wrote = false;
  try {
    if (env.VAULT) { await env.VAULT.put(key, body, { httpMetadata: { contentType: "text/markdown" } }); wrote = true; }
  } catch (e) {}
  return { status: "ok", total, noteKey: key, lines: lines.length, wrote };
}

return citationModDefault;
})();
var jmwMod = (function(){
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js

var worker_default = {
  async scheduled(event, env, ctx) {
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    await env.JOB_MARKET_WATCH.create({ id: "cron-" + stamp, params: { trigger: "cron" } });
  },
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, worker: "job-market-watch", version: "1.1.0" }), { headers: { "content-type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  }
};
var JobMarketWatchWorkflow = class extends WorkflowEntrypoint {
  static {
    __name(this, "JobMarketWatchWorkflow");
  }
  async run(event, step) {
    const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const boards = await step.do("scan-sources", {
      retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
      timeout: "90 seconds"
    }, async () => {
      const out = [];
      try {
        const r = await fetch("https://api.lever.co/v0/postings/epoch-ai?mode=json");
        if (r.ok) {
          const j = await r.json();
          out.push({ source: "epoch", channel: "RED", roles: (Array.isArray(j) ? j : []).map((x) => x.text || "").filter(Boolean).slice(0, 12) });
        } else out.push({ source: "epoch", channel: "RED", error: "HTTP " + r.status });
      } catch (e) {
        out.push({ source: "epoch", channel: "RED", error: e.message });
      }
      try {
        const r = await fetch("https://api.ashbyhq.com/posting-api/job-board/quantware");
        if (r.ok) {
          const j = await r.json();
          out.push({ source: "quantware", channel: "RED", roles: (j.jobs || []).map((x) => x.title).slice(0, 12) });
        } else out.push({ source: "quantware", channel: "RED", error: "HTTP " + r.status });
      } catch (e) {
        out.push({ source: "quantware", channel: "RED", error: e.message });
      }
      try {
        const r = await fetch("https://forecastingresearch.org/careers");
        if (r.ok) {
          const html = await r.text();
          const titles = [];
          for (const m of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]{8,80})/g)) {
            const t = m[2].trim();
            if (/Senior|Research|Analyst|Fellow|Researcher|Data/.test(t) && titles.length < 12) titles.push(t);
          }
          out.push({ source: "fri", channel: "GREEN", roles: titles, email: html.includes("info@forecastingresearch.org") });
        } else out.push({ source: "fri", channel: "GREEN", error: "HTTP " + r.status });
      } catch (e) {
        out.push({ source: "fri", channel: "GREEN", error: e.message });
      }
      return out;
    });
    const report = await step.do("build-report", {}, async () => {
      const lines = ["# JOB MARKET WATCH (CLOUD WORKFLOW)", "", "> Generated " + (/* @__PURE__ */ new Date()).toISOString(), "", "## Scan results", ""];
      for (const b of boards) {
        lines.push("### " + b.source + " [" + b.channel + "]");
        if (b.roles && b.roles.length) lines.push(b.roles.map(function(x) {
          return "- " + x;
        }).join(String.fromCharCode(10)));
        if (b.error) lines.push("- ERROR: " + b.error);
        if (b.email !== void 0) lines.push("- email channel: " + (b.email ? "yes (GREEN - automated application possible)" : "no"));
      }
      lines.push("", "## CHANNEL-1 POLICY", "GREEN = direct email application (automatable). RED = form-ATS (track only, recruit-at-large).");
      return lines.join(String.fromCharCode(10));
    });
    const key = "notes/v1/" + date.slice(0, 4) + "/" + date.slice(5, 7) + "/" + date + "/_job-market-watch-workflow-" + date + ".md";
    const delivered = await step.do("deliver-r2", { retries: { limit: 2, delay: "3 seconds" } }, async () => {
      await this.env.VAULT.put(key, report, { httpMetadata: { contentType: "text/markdown" } });
      return key;
    });
    const handoff_id = await step.do("record-d1", {}, async () => {
      const res = await this.env.AUDIT.prepare("INSERT INTO handoffs (session_id, project_id, phase_completed, summary, pending_work, next_action, r2_handoff_path, timestamp, wbs_code) VALUES (?,?,?,?,?,?,?,?,?)").bind("cloud-workflow", "job-market-watch-workflow-" + date, "1", "Cloud workflow scan: " + boards.length + " boards (" + boards.filter((b) => b.channel === "GREEN").length + " GREEN / " + boards.filter((b) => b.channel === "RED").length + " RED)", "none - autonomous", "next: weekly Tuesday fire (0 7 * * 2)", key, (/* @__PURE__ */ new Date()).toISOString(), "CLOUD-WORKFLOW-2026-09-08").run();
      return res.meta.last_row_id;
    });
    return { boards: boards.length, green: boards.filter((b) => b.channel === "GREEN").length, red: boards.filter((b) => b.channel === "RED").length, key: delivered, handoff_id };
  }
};
return { JobMarketWatchWorkflow: JobMarketWatchWorkflow, default: worker_default };
})();
//# sourceMappingURL=worker.js.map

var perMod = (function(){
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "1.2.4";
var WORKER = "personal-events-radar";
var TAB = String.fromCharCode(9);
var LF = String.fromCharCode(10);
var CR = String.fromCharCode(13);
var WSC = "[ " + TAB + CR + LF + "]";
var WS = WSC + "+";
var INTERESTS = [
  { code: "MUS", name: "Museums", kw: ["museum", "exhibition", "expositie", "gallery", "collection", "masterpiece", "old master", "tentoonstelling"] },
  { code: "CLA", name: "Classical music", kw: ["concert", "classical", "symphony", "orchestra", "orchestral", "chamber music", "recital", "concerto", "sonata", "opera", "baroque", "renaissance music"] },
  { code: "PER", name: "Play and performance", kw: ["performance", "theatre", "theater", "dance", "ballet", "puppet", "circus", "comedy", "open air", "openluchttheater", "storytelling"] },
  { code: "QUR", name: "Queer arts and culture", kw: ["queer", "pride", "lgbt", "lgbtq", "drag", "ballroom"] },
  { code: "JAZ", name: "Jazz and contemporary", kw: ["jazz", "contemporary music", "electronic", "dj", "live music", "indie", "folk"] },
  { code: "LIT", name: "Literature and ideas", kw: ["literature", "poetry", "book", "author", "reading", "philosophy cafe", "debate", "talk"] },
  { code: "FIL", name: "Film and screen", kw: ["film", "cinema", "screening", "documentary", "movie"] },
  { code: "FES", name: "Festivals and city life", kw: ["festival", "open day", "night of", "museumnacht", "free entry", "gratis", "market", "parade", "city walk"] }
];
var SOURCES = [
  { name: "Concertgebouw", url: "https://www.concertgebouw.nl/en", kind: "concert", delivery: "onsite", cost: 2 },
  { name: "Rijksmuseum", url: "https://www.rijksmuseum.nl/en/whats-on", kind: "exhibition", delivery: "onsite", cost: 1 },
  { name: "VanGoghMuseum", url: "https://www.vangoghmuseum.nl/en/visit/whats-on", kind: "exhibition", delivery: "onsite", cost: 1 },
  { name: "Stedelijk", url: "https://www.stedelijk.nl/en/whats-on", kind: "exhibition", delivery: "onsite", cost: 1 },
  { name: "Openluchttheater", url: "https://www.openluchttheater.nl/agenda", kind: "performance", delivery: "onsite", cost: 0 },
  { name: "Iamsterdam", url: "https://www.iamsterdam.com/en/whats-on", kind: "event", delivery: "onsite", cost: 1 },
  { name: "EventbriteLGBTQ", url: "https://www.eventbrite.nl/d/netherlands--amsterdam/events/lgbtq/", kind: "event", delivery: "onsite", cost: 1 }
];
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
var ENERGY = { maxInPersonPerHalfYear: 2, h2_2026_spent: true, nextEligibility: "2027-01-01" };
var SCHENGEN_EXIT = "2026-10-17";
var STANDING_DROP = /qpl|cwi/i;
var VENUE_AFFINITY = { Concertgebouw: 1, Rijksmuseum: 1, VanGoghMuseum: 1, Stedelijk: 1, Openluchttheater: 1, EventbriteLGBTQ: 1 };
var LOCAL_VENUES = ["Concertgebouw", "Rijksmuseum", "VanGoghMuseum", "Stedelijk", "Openluchttheater", "Iamsterdam", "EventbriteLGBTQ"];
var SCHENGEN_VENUES = ["Concertgebouw", "Rijksmuseum", "VanGoghMuseum", "Stedelijk", "Openluchttheater", "Iamsterdam", "EventbriteLGBTQ"];
var TRAVEL_KINDS = ["conference", "workshop", "school"];
var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, maa: 3, mei: 5, okt: 10 };
var MONTH_RE = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Januari|Februari|Maart|April|Mei|Juni|Juli|Augustus|September|Oktober|November|December)";
var ENTITY_MAP = { amp: "&", lt: "<", gt: ">", quot: String.fromCharCode(34), apos: String.fromCharCode(39), nbsp: " ", ndash: "\u2013", mdash: "\u2014", lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201C", rdquo: "\u201D", hellip: "\u2026", times: "\xD7", middot: "\xB7", sdot: "\u22C5", minus: "\u2212", deg: "\xB0", micro: "\xB5" };
function decodeEntities(x) {
  return String(x || "").replace(/&#x([0-9a-fA-F]+);|&#([0-9]+);|&([a-zA-Z][a-zA-Z0-9]*);/g, function(m, hx, dec, name) {
    if (hx) {
      try {
        return String.fromCodePoint(parseInt(hx, 16));
      } catch (e) {
        return m;
      }
    }
    if (dec) {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch (e) {
        return m;
      }
    }
    return Object.prototype.hasOwnProperty.call(ENTITY_MAP, name) ? ENTITY_MAP[name] : m;
  });
}
__name(decodeEntities, "decodeEntities");
function cleanHtml(text) {
  const s = String(text || "").replace(new RegExp("<script[^]*?<\/script>", "gi"), " ").replace(new RegExp("<style[^]*?</style>", "gi"), " ").replace(/<[^>]+>/g, " ");
  return decodeEntities(s).replace(new RegExp(WSC + "+", "g"), " ").trim();
}
__name(cleanHtml, "cleanHtml");
function pad2(n) {
  return String(n).padStart(2, "0");
}
__name(pad2, "pad2");
function toISO(y, m, d) {
  return y + "-" + pad2(m) + "-" + pad2(d);
}
__name(toISO, "toISO");
function extractEvents(text, src) {
  const events = [];
  let discarded = 0;
  const clean = cleanHtml(text);
  const cutYear = (/* @__PURE__ */ new Date()).getFullYear();
  const dropGarbage = /* @__PURE__ */ __name((s) => {
    if (new RegExp("[.]st[0-9]+" + WSC + "*[{]").test(s)) return true;
    if (new RegExp("fill" + WSC + "*:" + WSC + "*none").test(s)) return true;
    if (new RegExp('"id"' + WSC + "*:" + WSC + "*[0-9]+" + WSC + "*,").test(s)) return true;
    if (/window[.]/.test(s)) return true;
    if (new RegExp("function" + WS + "[(]").test(s)) return true;
    if (/matchmaker|recommended concerts|you choose/i.test(s)) return true;
    if (/editorial tips|weekend guide/i.test(s)) return true;
    return false;
  }, "dropGarbage");
  const seen = /* @__PURE__ */ new Set();
  const rangeRe = new RegExp("(" + MONTH_RE + ")[a-z]*[.]?" + WS + "([0-9]{1,2})" + WSC + "*[-\u2013\u2014]" + WSC + "*([0-9]{1,2})" + WSC + "*,?" + WSC + "*(20[0-9]{2})", "gi");
  const rangeRe2 = new RegExp("([0-9]{1,2})" + WSC + "*[-\u2013\u2014]" + WSC + "*([0-9]{1,2})" + WS + "(" + MONTH_RE + ")[a-z]*[.]?" + WSC + "*,?" + WSC + "*(20[0-9]{2})", "gi");
  const singleRe = new RegExp("(" + MONTH_RE + ")[a-z]*[.]?" + WS + "([0-9]{1,2})" + WSC + "*,?" + WSC + "*(20[0-9]{2})", "gi");
  const singleRe2 = new RegExp("([0-9]{1,2})" + WS + "(" + MONTH_RE + ")[a-z]*[.]?" + WSC + "*,?" + WSC + "*(20[0-9]{2})", "gi");
  const now = /* @__PURE__ */ new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  const push = /* @__PURE__ */ __name((mo, d1, d2, yr, idx, inferYear) => {
    const mon = (mo || "").toLowerCase().slice(0, 3);
    const month = MONTHS[mon];
    if (!month) {
      discarded += 1;
      return;
    }
    let year = yr ? parseInt(yr, 10) : 0;
    if (!year && inferYear) year = month >= nowMonth ? nowYear : nowYear + 1;
    if (year < cutYear || year > cutYear + 2) {
      discarded += 1;
      return;
    }
    const startIso = toISO(year, month, Math.min(d1 || 1, 28));
    const endIso = d2 ? toISO(year, month, Math.min(d2, 28)) : startIso;
    const key = src.name + "|" + startIso;
    if (seen.has(key)) return;
    let end = idx + 200;
    const after = clean.slice(idx + 10, idx + 420);
    const nxt = after.search(new RegExp(MONTH_RE + "[a-z]*[.]?"));
    if (nxt !== -1 && nxt < 200) end = idx + 10 + nxt;
    let snippet = clean.slice(Math.max(0, idx - 80), end).slice(0, 240);
    const spIdx = snippet.indexOf(" ");
    if (spIdx !== -1 && spIdx < 40) snippet = snippet.slice(spIdx + 1);
    if (dropGarbage(snippet)) {
      discarded += 1;
      return;
    }
    seen.add(key);
    const pre = clean.slice(Math.max(0, idx - 40), idx).toLowerCase();
    const runningUntil = new RegExp("until|till|t/m|tot(?=" + WSC + "*[0-9])", "i").test(pre);
    const wideSnippet = clean.slice(Math.max(0, idx - 120), Math.min(clean.length, idx + 40)).slice(0, 240);
    const dateText = d2 ? mo + " " + d1 + "-" + d2 + ", " + year : mo + " " + d1 + ", " + year;
    events.push({ venue: src.name, dateText, startIso, endIso, year, month, day: d1 || null, url: src.url, snippet, wideSnippet, runningUntil, srcKind: src.kind, srcDelivery: src.delivery, srcCost: src.cost });
  }, "push");
  for (const m of clean.matchAll(rangeRe)) push(m[1], parseInt(m[2], 10), parseInt(m[3], 10), m[4], m.index);
  for (const m of clean.matchAll(rangeRe2)) push(m[3], parseInt(m[1], 10), parseInt(m[2], 10), m[4], m.index);
  for (const m of clean.matchAll(singleRe)) push(m[1], parseInt(m[2], 10), null, m[3], m.index);
  for (const m of clean.matchAll(singleRe2)) push(m[2], parseInt(m[1], 10), null, m[3], m.index);
  const rangeReNY = new RegExp("(" + MONTH_RE + ")[a-z]*[.]?" + WS + "([0-9]{1,2})(?![0-9:])" + WSC + "*[-\u2013\u2014]" + WSC + "*([0-9]{1,2})(?![0-9:])", "gi");
  const singleReNY = new RegExp("(" + MONTH_RE + ")[a-z]*[.]?" + WS + "([0-9]{1,2})(?![0-9:])", "gi");
  const singleRe2NY = new RegExp("([0-9]{1,2})(?![0-9])" + WS + "(" + MONTH_RE + ")[a-z]*[.]?", "gi");
  const nearYear = /* @__PURE__ */ __name((i) => /20[0-9]{2}/.test(clean.slice(i, i + 20)), "nearYear");
  for (const m of clean.matchAll(rangeReNY)) {
    if (!nearYear(m.index)) push(m[1], parseInt(m[2], 10), parseInt(m[3], 10), null, m.index, true);
  }
  for (const m of clean.matchAll(singleReNY)) {
    if (!nearYear(m.index)) push(m[1], parseInt(m[2], 10), null, null, m.index, true);
  }
  for (const m of clean.matchAll(singleRe2NY)) {
    if (!nearYear(m.index)) push(m[2], parseInt(m[1], 10), null, null, m.index, true);
  }
  const untilMonthRe = new RegExp("(?:until|till|t/m)" + WS + "(" + MONTH_RE + ")[a-z]*" + WSC + "*[.]?" + WSC + "*(20[0-9]{2})", "gi");
  for (const m of clean.matchAll(untilMonthRe)) {
    const mon = (m[1] || "").toLowerCase().slice(0, 3);
    const month = MONTHS[mon];
    const year = parseInt(m[2], 10);
    if (!month || year < cutYear || year > cutYear + 2) continue;
    const endIso = toISO(year, month, 28);
    const key = src.name + "|rm|" + endIso;
    if (seen.has(key)) continue;
    const snippet = clean.slice(Math.max(0, m.index - 60), m.index + 120).slice(0, 200);
    if (dropGarbage(snippet)) continue;
    seen.add(key);
    events.push({ venue: src.name, dateText: "until " + m[1] + " " + year, startIso: endIso, endIso, year, month, day: null, url: src.url, snippet, wideSnippet: snippet, runningUntil: true, runningUntilMonth: true, srcKind: src.kind, srcDelivery: src.delivery, srcCost: src.cost });
  }
  const kept = events.slice(0, 20);
  discarded += Math.max(0, events.length - kept.length);
  return { events: kept, discarded };
}
__name(extractEvents, "extractEvents");
function classify(ev) {
  const s = (ev.snippet || "").toLowerCase();
  let kind = ev.srcKind;
  if (/concert|recital|symphony|orchestra|opera/i.test(s)) kind = "concert";
  else if (/exhibition|expositie|tentoonstelling/i.test(s)) kind = "exhibition";
  else if (/performance|theatre|theater|dance|ballet|open air|openluchttheater/i.test(s)) kind = "performance";
  else if (/festival|parade|night of|museumnacht/i.test(s)) kind = "festival";
  else if (/film|cinema|screening|documentary/i.test(s)) kind = "film";
  else if (/talk|lecture|reading|debate/i.test(s)) kind = "talk";
  let delivery = ev.srcDelivery;
  if (/online|virtual|stream|livestream|live stream|hybrid/i.test(s)) delivery = "hybrid";
  let cost = ev.srcCost;
  if (/free|gratis|no charge|open to all|free entry/i.test(s)) cost = 0;
  return { kind, delivery, cost };
}
__name(classify, "classify");
function interestHits(ev) {
  const text = ((ev.wideSnippet || ev.snippet || "") + " " + ev.venue).toLowerCase();
  const hits = [];
  for (const d of INTERESTS) {
    let n = 0;
    for (const kw of d.kw) if (text.indexOf(kw) !== -1) n += 1;
    if (n > 0) hits.push({ code: d.code, name: d.name, n });
  }
  if (hits.length === 0) {
    const a = VENUE_AFFINITY[ev.venue];
    if (a) hits.push({ code: "VEN", name: "venue-affinity:" + ev.venue, n: 0, affinity: true });
  }
  hits.sort((a, b) => b.n - a.n);
  return hits;
}
__name(interestHits, "interestHits");
function kwEvidence(g) {
  return (g.e.interestDetail || []).some((h) => h.n >= 1);
}
__name(kwEvidence, "kwEvidence");
function kindFriction(kind) {
  const m = { festival: 0, performance: 1, talk: 1, film: 1, event: 2, exhibition: 2, concert: 2 };
  return m[kind] !== void 0 ? m[kind] : 2;
}
__name(kindFriction, "kindFriction");
function deliveryFriction(d) {
  return d === "onsite" ? 1 : d === "hybrid" ? 0 : 2;
}
__name(deliveryFriction, "deliveryFriction");
function costFriction(c) {
  return c === 0 ? 0 : c === 1 ? 1 : 2;
}
__name(costFriction, "costFriction");
function scoreEvent(ev) {
  const c = classify(ev);
  const hits = interestHits(ev);
  const affinity = VENUE_AFFINITY[ev.venue] || 0;
  const strong = hits.filter((h) => h.n >= 2).length;
  let relevance = hits.length === 0 ? 0 : Math.min(10, 2 + hits.length + strong + affinity);
  if (STANDING_DROP.test(((ev.snippet || "") + " " + ev.venue).toLowerCase())) relevance = 0;
  const friction = Math.min(10, kindFriction(c.kind) + deliveryFriction(c.delivery) + costFriction(c.cost));
  const priority = Math.round(relevance * 10 / (1 + friction) * 10) / 10;
  return {
    ...ev,
    kind: c.kind,
    delivery: c.delivery,
    cost: c.cost,
    interests: hits.slice(0, 4).map((h) => h.code),
    interestDetail: hits.slice(0, 4),
    relevance,
    friction,
    priority,
    frictionClass: friction <= 2 ? "LOW" : friction <= 5 ? "MED" : "HIGH"
  };
}
__name(scoreEvent, "scoreEvent");
async function computeBudget(env) {
  const r = await env.PERSONAL_DB.prepare(
    "SELECT venue, start_date FROM events WHERE start_date>=? AND start_date<? AND category IN ('conference','workshop','school','program')"
  ).bind("2027-01-01", "2027-07-01").all();
  const seen = /* @__PURE__ */ new Set();
  let booked = 0;
  for (const row of r.results || []) {
    const k = (row.venue || "") + "|" + String(row.start_date || "").slice(0, 10);
    if (!seen.has(k)) {
      seen.add(k);
      booked += 1;
    }
  }
  return { h1InPersonBooked: booked, h1SlotsLeft: Math.max(0, ENERGY.maxInPersonPerHalfYear - booked) };
}
__name(computeBudget, "computeBudget");
function gateEvent(e, budget) {
  const reasons = [];
  const text = ((e.snippet || "") + " " + e.venue).toLowerCase();
  if (STANDING_DROP.test(text)) reasons.push("standing-filter:QPL/CWI");
  if (e.delivery === "onsite" && SCHENGEN_VENUES.includes(e.venue) && e.startIso >= SCHENGEN_EXIT) {
    reasons.push("schengen-exit:" + SCHENGEN_EXIT);
  }
  if (e.delivery === "onsite" && TRAVEL_KINDS.includes(e.kind) && !LOCAL_VENUES.includes(e.venue)) {
    if (ENERGY.h2_2026_spent && e.startIso < ENERGY.nextEligibility) reasons.push("energy-budget:H2-2026-spent");
    else if (e.startIso >= "2027-01-01" && e.startIso < "2027-07-01" && budget.h1SlotsLeft <= 0) reasons.push("energy-budget:H1-2027-full");
  }
  return { cleared: reasons.length === 0, reasons };
}
__name(gateEvent, "gateEvent");
async function scanVenue(src) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8e3);
  try {
    const r = await fetch(src.url, { headers: { "User-Agent": UA, "Accept": "text/html" }, redirect: "follow", signal: ctrl.signal });
    const text = await r.text();
    if (r.ok) return { name: src.name, ...extractEvents(text, src) };
    return { name: src.name, events: [], discarded: 0, error: "HTTP " + r.status };
  } catch (e) {
    return { name: src.name, events: [], discarded: 0, error: e && e.name === "AbortError" ? "timeout" : String(e && e.message || e).slice(0, 100) };
  } finally {
    clearTimeout(t);
  }
}
__name(scanVenue, "scanVenue");
var slug = /* @__PURE__ */ __name((s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""), "slug");
function calAuthH(env) {
  return env.CAL_TOKEN ? { Authorization: "Bearer " + env.CAL_TOKEN } : {};
}
__name(calAuthH, "calAuthH");
async function fetchExistingCalendar(env) {
  try {
    const r = await env.CAL_API.fetch("https://calendar-api/events?plane=personal", { headers: calAuthH(env) });
    const j = await r.json();
    return (j.events || []).filter((e) => e.source === "personal-radar");
  } catch (e) {
    return [];
  }
}
__name(fetchExistingCalendar, "fetchExistingCalendar");
function renderReport(scannedAt, horizon, gated, budget, stats, posted) {
  const L = [];
  L.push("PERSONAL-EVENTS-RADAR SCAN \u2014 generated " + scannedAt.slice(0, 10) + " (window: " + scannedAt.slice(0, 10) + " .. " + horizon + ")");
  L.push("[PERSONAL-RADAR: " + gated.length + " in-window events | " + stats.okVenues + "/" + stats.totalVenues + " venues ok | " + gated.filter((g) => g.cleared && g.e.relevance >= 3 && kwEvidence(g) && !g.e.runningUntil && !g.e.runningUntilMonth).length + " cleared | " + posted.posted + " posted this run]");
  L.push("");
  L.push("Scope: PERSONAL LIFE only (museums, concerts, performance, queer arts, festivals,");
  L.push("local Amsterdam culture). Work/research venues live in events-radar, not here.");
  L.push("Ranking rule: priority = 10 x relevance / (1 + friction). Friction = kind + delivery + cost.");
  L.push("Gates: standing filter (QPL/CWI) -> Schengen exit 2026-10-17 (onsite Amsterdam events)");
  L.push("-> in-person TRAVEL budget (applies only to non-local travel events; all current");
  L.push("sources are Amsterdam-local, so the travel gate is inert but enforced).");
  L.push("Calendar POST rule: cleared gates AND relevance >= 3 AND at least one keyword hit.");
  L.push("RUNNING-UNTIL exhibitions are report-only: the date shown is the CLOSING date, never");
  L.push("posted to the calendar as an event on that day.");
  L.push("");
  const cleared = gated.filter((g) => g.cleared && g.e.relevance >= 3);
  const top = cleared.filter((g) => !g.e.runningUntil && !g.e.runningUntilMonth && g.e.priority >= 4 && g.e.frictionClass !== "HIGH").sort((a, b) => b.e.priority - a.e.priority || a.e.startIso.localeCompare(b.e.startIso)).slice(0, 10);
  L.push("## Top picks - personal relevance / friction");
  if (top.length === 0) L.push("_No events cleared the top-pick threshold this scan._");
  for (const g of top) {
    const e = g.e;
    L.push("- [P " + e.priority + " | " + e.frictionClass + " friction] " + e.startIso + " [" + e.kind + "|" + e.delivery + "|" + (e.cost === 0 ? "free" : e.cost === 1 ? "fee?" : "paid") + "] " + e.venue + ": " + e.snippet.slice(0, 110) + "  -> " + (e.interests.join("/") || "-") + "  <" + e.url + ">");
  }
  const t90 = scannedAt.slice(0, 10);
  const t90end = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  const tasting = gated.filter((g) => g.cleared && !g.e.runningUntil && !g.e.runningUntilMonth && g.e.relevance >= 2 && g.e.friction <= 2 && g.e.startIso >= t90 && g.e.startIso <= t90end).sort((a, b) => a.e.friction - b.e.friction || b.e.relevance - a.e.relevance).slice(0, 5);
  L.push("");
  L.push("## Tasting menu - 3-5 cheap local experiments over the next 90 days");
  if (tasting.length === 0) L.push("_No cheap low-friction experiments surfaced this scan._");
  for (const g of tasting) {
    const e = g.e;
    L.push("- " + e.startIso + " [" + e.kind + "|" + e.delivery + "|" + (e.cost === 0 ? "free" : "fee?") + "] " + e.venue + ": " + e.snippet.slice(0, 110) + "  <" + e.url + ">");
  }
  L.push("");
  L.push("## Budget and gates");
  L.push("- in-person TRAVEL budget: H2 2026 SPENT (LoF26 + QPL26); H1 2027 ledger shows " + budget.h1InPersonBooked + " booked, " + budget.h1SlotsLeft + " slot(s) left.");
  L.push("- local Amsterdam events do NOT consume the travel budget; the gate enforces only non-local travel kinds.");
  L.push("- Schengen exit deadline: 2026-10-17. Onsite Amsterdam events on/after that date are blocked.");
  L.push("- standing filter: QPL / CWI topics excluded from personal recommendations.");
  L.push("- posted to calendar-api plane=personal: " + posted.posted + " new (dedupe skipped " + posted.skipped + ").");
  L.push("");
  L.push("## All in-window events (gate tags)");
  const chrono = gated.slice().sort((a, b) => a.e.startIso.localeCompare(b.e.startIso) || a.e.venue.localeCompare(b.e.venue));
  for (const g of chrono) {
    const e = g.e;
    let tag;
    if (e.runningUntil || e.runningUntilMonth) tag = "RUNNING-UNTIL (closes " + e.startIso + ", report-only)";
    else if (g.cleared) tag = e.relevance >= 3 ? "CLEARED" : "LOW-RELEVANCE";
    else tag = g.reasons.join("; ");
    L.push("- " + e.startIso + (e.endIso && e.endIso !== e.startIso ? ".." + e.endIso : "") + " [" + e.kind + "|" + e.delivery + "|" + (e.cost === 0 ? "free" : e.cost === 1 ? "fee?" : "paid") + "] " + e.venue + ": " + e.snippet.slice(0, 100) + "  [" + tag + "]");
  }
  L.push("");
  L.push("## Source health");
  L.push("- venues ok: " + stats.okVenues + "/" + stats.totalVenues + " | discarded: " + stats.discarded + " | venue errors: " + stats.venueErrors.length);
  for (const v of stats.venueErrors) L.push("- ERR " + v.venue + ": " + v.error);
  return L.join(LF);
}
__name(renderReport, "renderReport");
async function ensureSchema(env) {
  await env.AUDIT_DB.prepare(
    "CREATE TABLE IF NOT EXISTS personal_radar (slug TEXT PRIMARY KEY, report TEXT, events_json TEXT, posted_json TEXT, scanned_at TEXT, updated_at TEXT)"
  ).run();
}
__name(ensureSchema, "ensureSchema");
async function run(env) {
  await ensureSchema(env);
  const scannedAt = (/* @__PURE__ */ new Date()).toISOString();
  const nowIso = scannedAt.slice(0, 10);
  const horizon = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  const budget = await computeBudget(env);
  const results = await Promise.allSettled(SOURCES.map((s) => scanVenue(s)));
  const rawEvents = [];
  const venueErrors = [];
  let discarded = 0;
  results.forEach((res, i) => {
    if (res.status === "fulfilled" && res.value) {
      if (res.value.error) venueErrors.push({ venue: SOURCES[i].name, error: res.value.error });
      else {
        rawEvents.push(...res.value.events);
        discarded += res.value.discarded;
      }
    } else venueErrors.push({ venue: SOURCES[i].name, error: String((res.reason || "?").slice(0, 100)) });
  });
  const inWindow = rawEvents.filter((e) => e.startIso >= nowIso && e.startIso <= horizon);
  const scored = inWindow.map(scoreEvent);
  const seen = /* @__PURE__ */ new Set();
  const uniq = scored.filter((e) => {
    const k = e.venue + "|" + e.startIso;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const gated = uniq.map((e) => ({ e, ...gateEvent(e, budget) }));
  const existing = await fetchExistingCalendar(env);
  const existingKeys = new Set(existing.map((x) => String(x.location || "").toLowerCase() + "|" + String(x.dtstart || "").slice(0, 10)));
  let ledgerRows = [];
  try {
    const lr = await env.PERSONAL_DB.prepare("SELECT venue, start_date FROM events WHERE start_date>=?").bind(nowIso).all();
    ledgerRows = lr.results || [];
  } catch (e) {
  }
  const ledgerSlugs = ledgerRows.map((x) => ({ v: slug(x.venue), d: String(x.start_date || "").slice(0, 10) }));
  let posted = 0, skipped = 0;
  const postedList = [];
  for (const g of gated) {
    if (g.e.runningUntil || g.e.runningUntilMonth) {
      skipped += 1;
      continue;
    }
    if (!g.cleared || g.e.relevance < 3 || !kwEvidence(g)) continue;
    let title = g.e.venue + ": " + g.e.snippet.slice(0, 90);
    const cut = title.lastIndexOf(" ");
    if (cut > 30) title = title.slice(0, cut);
    const key = g.e.venue.toLowerCase() + "|" + g.e.startIso;
    const kSlug = slug(g.e.venue);
    const ledgerDup = ledgerSlugs.some((r) => r.d === g.e.startIso && (r.v.indexOf(kSlug) !== -1 || kSlug.indexOf(r.v) !== -1));
    if (existingKeys.has(key) || ledgerDup) {
      skipped += 1;
      continue;
    }
    if (posted >= 8) {
      skipped += 1;
      continue;
    }
    const body = {
      title,
      dtstart: g.e.startIso,
      dtend: g.e.endIso,
      all_day: false,
      location: g.e.venue,
      url: g.e.url,
      source: "personal-radar",
      domain: g.e.interests[0] || null,
      relevance: g.e.relevance,
      friction: g.e.friction,
      status: "tentative",
      description: g.e.snippet.slice(0, 300)
    };
    try {
      const pr = await env.CAL_API.fetch("https://calendar-api/events?plane=personal", {
        method: "POST",
        headers: Object.assign({ "content-type": "application/json" }, calAuthH(env)),
        body: JSON.stringify(body)
      });
      if (pr.ok) {
        posted += 1;
        postedList.push({ title, dtstart: g.e.startIso, id: (await pr.json()).id || null });
        existingKeys.add(key);
      } else skipped += 1;
    } catch (e) {
      skipped += 1;
    }
  }
  const stats = { inWindow: uniq.length, discarded, okVenues: SOURCES.length - venueErrors.length, totalVenues: SOURCES.length, venueErrors, horizonISO: horizon };
  const report = renderReport(scannedAt, horizon, gated, budget, stats, { posted, skipped });
  const slugN = "personal-events-radar-" + scannedAt.slice(0, 10);
  let delivery = null;
  try {
    if (env.OBSIDIAN_WRITER) {
      const dr = await env.OBSIDIAN_WRITER.fetch("https://obsidian-writer/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: "personal-events-radar", section: "Personal Events Radar", content: report, date: scannedAt.slice(0, 10) })
      });
      delivery = { status: dr.status, ok: dr.ok };
    }
  } catch (e) {
    delivery = { error: String(e && e.message || e).slice(0, 120) };
  }
  await env.AUDIT_DB.prepare(
    "INSERT OR REPLACE INTO personal_radar (slug, report, events_json, posted_json, scanned_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(slugN, report, JSON.stringify(gated), JSON.stringify(postedList), scannedAt, scannedAt).run();
  return {
    slug: slugN,
    version: VERSION,
    events: uniq.length,
    discarded,
    venueErrors: venueErrors.length,
    budget,
    posted: postedList,
    delivery,
    topPicks: gated.filter((g) => g.cleared && !g.e.runningUntil && !g.e.runningUntilMonth && g.e.relevance >= 3).sort((a, b) => b.e.priority - a.e.priority).slice(0, 5).map((g) => "P" + g.e.priority + " " + g.e.startIso + " " + g.e.venue + " " + g.e.interests.join("/") + " [" + g.e.delivery + "]")
  };
}
__name(run, "run");
var worker_default = {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/" && url.searchParams.get("run") === "1") {
      const out = await run(env);
      return new Response(JSON.stringify({ ok: true, ...out }), { headers: { "content-type": "application/json" } });
    }
    if (url.pathname === "/") {
      const rows = await env.AUDIT_DB.prepare("SELECT report FROM personal_radar ORDER BY scanned_at DESC LIMIT 1").all();
      const latest = rows.results && rows.results[0];
      return new Response(latest ? latest.report : "No scan yet. GET /?run=1", { headers: { "content-type": "text/markdown" } });
    }
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, worker: WORKER, version: VERSION }), { headers: { "content-type": "application/json" } });
    }
    return new Response("personal-events-radar worker: GET / (latest report) | GET /?run=1 (trigger scan) | GET /health", { status: 404 });
  }
};
return { default: worker_default };
})();
//# sourceMappingURL=worker.js.map


const JobMarketWatchWorkflow = jmwMod.JobMarketWatchWorkflow;
export { JobMarketWatchWorkflow };

// ===== MERGED RADAR HUB v2 (2026-09-11: + job-market-watch + personal-events-radar) =====
export default {
  async fetch(request, env, ctx) {
    const p = new URL(request.url).pathname;
    if (p === "/health") return new Response(JSON.stringify({ ok: true, worker: "radar-hub", version: "merged-2026-09-11b", radars: 6 }), { headers: { "content-type": "application/json" } });
    function sub(prefix) { const u = new URL(request.url); u.pathname = p.slice(prefix.length) || "/"; return new Request(u.toString(), request); }
    if (p === "/events" || p.startsWith("/events/")) return eventsMod.default.fetch(sub("/events"), env, ctx);
    if (p === "/citation" || p.startsWith("/citation/")) return citationMod.fetch(sub("/citation"), env, ctx);
    if (p === "/jobs" || p.startsWith("/jobs/")) return jmwMod.default.fetch(sub("/jobs"), env, ctx);
    if (p === "/personal" || p.startsWith("/personal/")) return perMod.default.fetch(sub("/personal"), env, ctx);
    return new Response("radar-hub", { status: 200 });
  },
  async scheduled(event, env, ctx) {
    const c = event.cron;
    if (c === "0 5 * * 1") return eventsMod.default.scheduled(event, env, ctx);
    if (c === "30 8 * * *") return arxivMod.scheduled(event, env, ctx);
    if (c === "0 6 1 * *" || c === "0 8 * * 7" || c === "0 9 * * 7") return researchMod.scheduled(event, env, ctx);
    if (c === "0 11 1,15 * *") return citationMod.scheduled(event, env, ctx);
    if (c === "0 7 * * 2") return jmwMod.default.scheduled(event, env, ctx);
    if (c === "30 5 * * 2") return perMod.default.scheduled(event, env, ctx);
  },
};
