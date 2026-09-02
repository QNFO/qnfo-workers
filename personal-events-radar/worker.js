// personal-events-radar Worker - QNFO.OPS.010 Stage B
// v1.0.1 (2026-09-02): personal-plane events radar.
// v1.0.1 fixes (red-team, 2026-09-02):
//   - boundary-aware event snippets: snippet ends at the NEXT month-name token so adjacent
//     events cannot leak text into each other (fixes FNC2026-Austin classified "online"
//     because the next event's "Virtual event" leaked in -> energy gate bypass)
//   - calendar POSTs now require at least one keyword hit (n>=1); venue-affinity-only events
//     stay report-only (fixes every IHES/ESI seminar flooding the personal calendar)
//   - snippet titles trimmed at word boundaries (no mid-word starts)
// v1.0.0: initial Stage B worker (scan 24 venues, personal gates, calendar-api POSTs).
// PURPOSE: weekly scan of the SAME 24 venue sources as events-radar (QNFO.OPS.009), scored
//   against the PERSONAL plane preferences in personal-life D1 (profile facets + attendance
//   ledger). Gates every recommendation through the standing personal filters:
//   - standing filter: no QPL/CWI topics in personal recommendations (profile facet, conf 0.95)
//   - energy budget: max 2 in-person events per half-year; H2 2026 budget SPENT (LoF26+QPL26),
//     next in-person eligibility H1 2027; H1 2027 slots computed from the attendance ledger
//   - Schengen exit deadline 2026-10-17: onsite events at Schengen venues on/after that date
//     are blocked (profile facet logistics "Schengen visa exit deadline")
//   - room-question gate: venue affinity (epistemically open, small conversation venues rank up)
//   - tasting-menu protocol: 3-5 cheap online/hybrid experiments over the next 90 days
// Cleared events are POSTed to calendar-api /events?plane=personal (source=personal-radar,
// status=tentative) with relevance+friction; report persisted to D1 qnfo-audit.personal_radar
// and delivered to obsidian-writer (R2 vault -> D:/Obsidian, section "Personal Events Radar").
// CAPABILITIES: parallel venue scan (8s AbortController per venue), date-range extraction,
//   personal-interest relevance, friction scoring, hard gate engine (standing/energy/schengen),
//   calendar-api dedupe before POST, tasting-menu construction.
// DEPLOY: cd qnfo-workers/personal-events-radar && wrangler deploy
// CANONICAL SOURCE: github.com/QNFO/qnfo-workers -> qnfo-workers/personal-events-radar/worker.js
// NOTE: all regexes are built backslash-free (char classes + fromCharCode) for transport safety.
const VERSION = "1.0.1";
const WORKER = "personal-events-radar";

const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const WSC = "[" + " " + TAB + CR + LF + "]";
const WS = WSC + "+";

// ---- Personal interest taxonomy (from personal-life profile facets) ----
const INTERESTS = [
  { code: "LOF", name: "Laws of Form", kw: ["laws of form", "spencer-brown", "spencer brown", "calculus of indications", "distinction", "re-entry", "reentry", "brownian"] },
  { code: "ULT", name: "Ultrametric / p-adic", kw: ["ultrametric", "p-adic", "adelic", "non-archimedean", "idempotent", "hierarchical"] },
  { code: "INF", name: "Information physics", kw: ["infomatics", "information physics", "szilard", "maxwell", "semantic information", "kolmogorov", "mutual information"] },
  { code: "EPI", name: "Epistemics / ignorance audit", kw: ["ignorance", "epistemolog", "knowledge", "scaffold", "unknown", "method"] },
  { code: "ENE", name: "Energy benchmark (JPCUB)", kw: ["energy", "thermodynamic", "landauer", "joules", "carbon", "low-power", "low power", "green computing", "sustainable"] },
  { code: "CMP", name: "Computation models", kw: ["automata", "turing", "lambda calculus", "reversible", "cellular automata", "computation", "hypercomputation"] },
  { code: "CNX", name: "Complexity / consilience", kw: ["complexity", "complex systems", "consilience", "interdisciplinary", "network science", "emergence"] },
  { code: "QFD", name: "Quantum foundations", kw: ["quantum foundations", "foundations of physics", "philosophy of physics", "qubit", "quantum information", "qip", "decoherence", "entanglement"] },
  { code: "CRY", name: "Cryptography", kw: ["cryptograph", "post-quantum", "lattice", "encryption", "privacy"] },
  { code: "PBO", name: "Pattern ontology", kw: ["ontology", "pattern", "taxonomy", "knowledge representation"] }
];

// ---- Source catalog: SAME venues as events-radar (QNFO.OPS.009) ----
const SOURCES = [
  { name: "CWI", url: "https://www.cwi.nl/en/events/", kind: "workshop", delivery: "hybrid", cost: 1 },
  { name: "Perimeter", url: "https://perimeterinstitute.ca/conferences", kind: "conference", delivery: "hybrid", cost: 1 },
  { name: "FQXi", url: "https://fqxi.org/events", kind: "other", delivery: "online", cost: 0 },
  { name: "IQOQI", url: "https://iqoqi.at", kind: "colloquium", delivery: "hybrid", cost: 0 },
  { name: "MPI-PKS", url: "https://www.pks.mpg.de/events/workshops-seminars/", kind: "workshop", delivery: "onsite", cost: 1 },
  { name: "SFI", url: "https://www.santafe.edu/events", kind: "seminar", delivery: "hybrid", cost: 0 },
  { name: "QuSoft", url: "https://www.qusoft.org", kind: "workshop", delivery: "hybrid", cost: 0 },
  { name: "QuTech", url: "https://www.qutech.nl/events/", kind: "event", delivery: "hybrid", cost: 0 },
  { name: "CSH", url: "https://www.csh.ac.at/events/", kind: "webinar", delivery: "hybrid", cost: 0 },
  { name: "CSS", url: "https://cssociety.org/events", kind: "conference", delivery: "onsite", cost: 2 },
  { name: "CNA", url: "https://www.complexnetworks.org/", kind: "conference", delivery: "onsite", cost: 2 },
  { name: "QIP", url: "https://qipconference.org/", kind: "conference", delivery: "onsite", cost: 2 },
  { name: "HotCarbon", url: "https://hotcarbon.org/", kind: "workshop", delivery: "onsite", cost: 1 },
  { name: "ACM-eEnergy", url: "https://energy.acm.org/", kind: "conference", delivery: "onsite", cost: 2 },
  { name: "QWorld", url: "https://qworld.net/", kind: "webinar", delivery: "online", cost: 0 },
  { name: "QCrypt", url: "https://qcrypt.net/", kind: "conference", delivery: "onsite", cost: 2 },
  { name: "IACR", url: "https://www.iacr.org/events/", kind: "conference", delivery: "onsite", cost: 2 },
  { name: "RealWorldCrypto", url: "https://rwc.iacr.org/", kind: "conference", delivery: "onsite", cost: 2 },
  { name: "ASL", url: "https://aslonline.org/meetings/", kind: "meeting", delivery: "hybrid", cost: 1 },
  { name: "IAOA", url: "https://iaoa.org/", kind: "other", delivery: "online", cost: 0 },
  { name: "ICTP", url: "https://www.ictp.it/events", kind: "school", delivery: "hybrid", cost: 1 },
  { name: "IHES", url: "https://www.ihes.fr/en/events/", kind: "lecture", delivery: "hybrid", cost: 0 },
  { name: "ESI", url: "https://www.esi.ac.at/events", kind: "workshop", delivery: "hybrid", cost: 1 },
  { name: "NetSci", url: "https://netscisociety.net/events", kind: "conference", delivery: "hybrid", cost: 2 }
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// ---- Personal gate configuration (evidence = personal-life profile facets, 2026-09-02) ----
// facet logistics "energy budget H2 2026 spent" (conf 0.95): H2 2026 in-person budget SPENT
//   (LoF26 + QPL26). Next in-person eligibility: H1 2027 (QIP27 Singapore = slot 1).
// facet logistics "Schengen visa exit deadline" (conf 0.9): must exit Schengen before 2026-10-17.
// facet standing-filters "No QPL/CWI topics in personal recommendations" (conf 0.95).
const ENERGY = { maxInPersonPerHalfYear: 2, h2_2026_spent: true, nextEligibility: "2027-01-01" };
const SCHENGEN_EXIT = "2026-10-17";
const STANDING_DROP = /qpl|cwi/i;
const VENUE_AFFINITY = { SFI: 1, FQXi: 1, CSH: 1, ASL: 1, IAOA: 1, ICTP: 1, IHES: 1, ESI: 1, QuSoft: 1, QuTech: 1, QWorld: 1, QIP: 1, IQOQI: 1, HotCarbon: 1, "ACM-eEnergy": 1 };
const LOCAL_VENUES = ["CWI", "QuSoft", "QuTech"];
const SCHENGEN_VENUES = ["CWI", "QuSoft", "QuTech", "MPI-PKS", "CSH", "ESI", "ICTP", "IHES", "IQOQI"];
const TRAVEL_KINDS = ["conference", "workshop", "school"];

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MONTH_RE = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
const ENTITY_MAP = { amp: "&", lt: "<", gt: ">", quot: String.fromCharCode(34), apos: String.fromCharCode(39), nbsp: " ", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", times: "×", middot: "·", sdot: "⋅", minus: "−", deg: "°", micro: "µ" };

function decodeEntities(x) {
  return String(x || "").replace(/&#x([0-9a-fA-F]+);|&#([0-9]+);|&([a-zA-Z][a-zA-Z0-9]*);/g, function(m, hx, dec, name) {
    if (hx) { try { return String.fromCodePoint(parseInt(hx, 16)); } catch (e) { return m; } }
    if (dec) { try { return String.fromCodePoint(parseInt(dec, 10)); } catch (e) { return m; } }
    return Object.prototype.hasOwnProperty.call(ENTITY_MAP, name) ? ENTITY_MAP[name] : m;
  });
}
function cleanHtml(text) {
  const s = String(text || "")
    .replace(new RegExp("<script[^]*?</script>", "gi"), " ")
    .replace(new RegExp("<style[^]*?</style>", "gi"), " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(s).replace(new RegExp(WSC + "+", "g"), " ").trim();
}
function pad2(n) { return String(n).padStart(2, "0"); }
function toISO(y, m, d) { return y + "-" + pad2(m) + "-" + pad2(d); }

function extractEvents(text, src) {
  const events = [];
  let discarded = 0;
  const clean = cleanHtml(text);
  const cutYear = new Date().getFullYear();
  const dropGarbage = (s) => {
    if (new RegExp("[.]st[0-9]+" + WSC + "*[{]").test(s)) return true;
    if (new RegExp("fill" + WSC + "*:" + WSC + "*none").test(s)) return true;
    if (new RegExp('"id"' + WSC + "*:" + WSC + "*[0-9]+" + WSC + "*,").test(s)) return true;
    if (/window[.]/.test(s)) return true;
    if (new RegExp("function" + WS + "[(]").test(s)) return true;
    return false;
  };
  const seen = new Set();
  const rangeRe = new RegExp("(" + MONTH_RE + ")[a-z]*[.]?" + WS + "([0-9]{1,2})" + WSC + "*[-–—]" + WSC + "*([0-9]{1,2})" + WSC + "*,?" + WSC + "*(20[0-9]{2})", "gi");
  const rangeRe2 = new RegExp("([0-9]{1,2})" + WSC + "*[-–—]" + WSC + "*([0-9]{1,2})" + WS + "(" + MONTH_RE + ")[a-z]*[.]?" + WSC + "*,?" + WSC + "*(20[0-9]{2})", "gi");
  const singleRe = new RegExp("(" + MONTH_RE + ")[a-z]*[.]?" + WS + "([0-9]{1,2})" + WSC + "*,?" + WSC + "*(20[0-9]{2})", "gi");
  const singleRe2 = new RegExp("([0-9]{1,2})" + WS + "(" + MONTH_RE + ")[a-z]*[.]?" + WSC + "*,?" + WSC + "*(20[0-9]{2})", "gi");
  const push = (mo, d1, d2, yr, idx) => {
    const mon = (mo || "").toLowerCase().slice(0, 3);
    const month = MONTHS[mon];
    if (!month) { discarded += 1; return; }
    const year = yr ? parseInt(yr, 10) : 0;
    if (year < cutYear || year > cutYear + 2) { discarded += 1; return; }
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
    if (dropGarbage(snippet)) { discarded += 1; return; }
    seen.add(key);
    const wideSnippet = clean.slice(Math.max(0, idx - 120), Math.min(clean.length, idx + 40)).slice(0, 240);
    const dateText = (d2 ? mo + " " + d1 + "-" + d2 + ", " + year : mo + " " + d1 + ", " + year);
    events.push({ venue: src.name, dateText, startIso, endIso, year, month, day: d1 || null, url: src.url, snippet, wideSnippet, srcKind: src.kind, srcDelivery: src.delivery, srcCost: src.cost });
  };
  for (const m of clean.matchAll(rangeRe)) push(m[1], parseInt(m[2], 10), parseInt(m[3], 10), m[4], m.index);
  for (const m of clean.matchAll(rangeRe2)) push(m[3], parseInt(m[1], 10), parseInt(m[2], 10), m[4], m.index);
  for (const m of clean.matchAll(singleRe)) push(m[1], parseInt(m[2], 10), null, m[3], m.index);
  for (const m of clean.matchAll(singleRe2)) push(m[2], parseInt(m[1], 10), null, m[3], m.index);
  const kept = events.slice(0, 16);
  discarded += Math.max(0, events.length - kept.length);
  return { events: kept, discarded };
}

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
  else if (/registration fee|ticket|registration required|paypal|checkout/i.test(s)) cost = 1;
  else if (new RegExp("(^|[^a-z])fee([^a-z]|$)").test(s)) cost = 1;
  return { kind, delivery, cost };
}

function interestHits(ev) {
  // keyword window uses the WIDE snippet (title precedes the date on dense listing pages);
  // classification and gates use the tight boundary snippet so adjacent events cannot leak
  const text = ((ev.wideSnippet || ev.snippet || "") + " " + ev.venue).toLowerCase();
  const hits = [];
  for (const d of INTERESTS) {
    let n = 0;
    for (const kw of d.kw) if (text.indexOf(kw) !== -1) n += 1;
    if (n > 0) hits.push({ code: d.code, name: d.name, n });
  }
  if (hits.length === 0 && VENUE_AFFINITY[ev.venue]) hits.push({ code: "VEN", name: "venue-affinity:" + ev.venue, n: 0, affinity: true });
  hits.sort((a, b) => b.n - a.n);
  return hits;
}

function kwEvidence(g) { return (g.e.interestDetail || []).some((h) => h.n >= 1); }

function kindFriction(kind) {
  const m = { webinar: 0, meetup: 1, lecture: 1, seminar: 1, meeting: 1, colloquium: 2, event: 2, other: 2, workshop: 3, school: 4, conference: 5 };
  return m[kind] !== undefined ? m[kind] : 2;
}
function deliveryFriction(d) { return d === "online" ? 0 : d === "hybrid" ? 1 : d === "onsite" ? 3 : 2; }
function costFriction(c) { return c === 0 ? 0 : c === 1 ? 1 : 2; }

function scoreEvent(ev) {
  const c = classify(ev);
  const hits = interestHits(ev);
  const affinity = VENUE_AFFINITY[ev.venue] || 0;
  const strong = hits.filter((h) => h.n >= 2).length;
  let relevance = hits.length === 0 ? 0 : Math.min(10, 2 + hits.length + strong + affinity);
  if (STANDING_DROP.test(((ev.snippet || "") + " " + ev.venue).toLowerCase())) relevance = 0;
  const friction = Math.min(10, kindFriction(c.kind) + deliveryFriction(c.delivery) + costFriction(c.cost));
  const priority = Math.round((relevance * 10) / (1 + friction) * 10) / 10;
  return {
    ...ev, kind: c.kind, delivery: c.delivery, cost: c.cost,
    interests: hits.slice(0, 4).map((h) => h.code),
    interestDetail: hits.slice(0, 4),
    relevance, friction, priority,
    frictionClass: friction <= 2 ? "LOW" : friction <= 5 ? "MED" : "HIGH"
  };
}

function gateEvent(e, budget) {
  const reasons = [];
  const text = ((e.snippet || "") + " " + e.venue).toLowerCase();
  if (STANDING_DROP.test(text)) reasons.push("standing-filter:QPL/CWI");
  if (e.delivery === "onsite") {
    if (SCHENGEN_VENUES.includes(e.venue) && e.startIso >= SCHENGEN_EXIT) reasons.push("schengen-exit:" + SCHENGEN_EXIT);
    if (TRAVEL_KINDS.includes(e.kind) && !LOCAL_VENUES.includes(e.venue)) {
      if (ENERGY.h2_2026_spent && e.startIso < ENERGY.nextEligibility) reasons.push("energy-budget:H2-2026-spent");
      else if (e.startIso >= "2027-01-01" && e.startIso < "2027-07-01" && budget.h1SlotsLeft <= 0) reasons.push("energy-budget:H1-2027-full");
    }
  }
  return { cleared: reasons.length === 0, reasons };
}

async function scanVenue(src) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(src.url, { headers: { "User-Agent": UA, "Accept": "text/html" }, redirect: "follow", signal: ctrl.signal });
    const text = await r.text();
    if (r.ok) return { name: src.name, ...extractEvents(text, src) };
    return { name: src.name, events: [], discarded: 0, error: "HTTP " + r.status };
  } catch (e) {
    return { name: src.name, events: [], discarded: 0, error: e && e.name === "AbortError" ? "timeout" : String((e && e.message) || e).slice(0, 100) };
  } finally { clearTimeout(t); }
}

async function computeBudget(env) {
  const r = await env.PERSONAL_DB.prepare(
    "SELECT venue, start_date FROM events WHERE start_date>=? AND start_date<? AND category IN ('conference','workshop','school','program')"
  ).bind("2027-01-01", "2027-07-01").all();
  const seen = new Set();
  let booked = 0;
  for (const row of (r.results || [])) {
    const k = (row.venue || "") + "|" + String(row.start_date || "").slice(0, 10);
    if (!seen.has(k)) { seen.add(k); booked += 1; }
  }
  return { h1InPersonBooked: booked, h1SlotsLeft: Math.max(0, ENERGY.maxInPersonPerHalfYear - booked) };
}

async function fetchExistingCalendar(env) {
  try {
    const r = await env.CAL_API.fetch("https://calendar-api/events?plane=personal");
    const j = await r.json();
    return (j.events || []).filter((e) => e.source === "personal-radar");
  } catch (e) { return []; }
}

function renderReport(scannedAt, horizon, gated, budget, stats, posted) {
  const L = [];
  L.push("PERSONAL-EVENTS-RADAR SCAN — generated " + scannedAt.slice(0, 10) + " (window: " + scannedAt.slice(0, 10) + " .. " + horizon + ")");
  L.push("[PERSONAL-RADAR: " + gated.length + " in-window events | " + stats.okVenues + "/" + stats.totalVenues + " venues ok | " + gated.filter((g) => g.cleared && g.e.relevance >= 3 && kwEvidence(g)).length + " cleared | " + posted.posted + " posted to calendar]");
  L.push("");
  L.push("Ranking rule: priority = 10 x relevance / (1 + friction). Friction = kind + delivery + cost.");
  L.push("Hard gates applied in order: standing filter (QPL/CWI) -> Schengen exit (2026-10-17, onsite");
  L.push("Schengen venues) -> energy budget (max 2 in-person travel events per half-year;");
  L.push("H2 2026 SPENT via LoF26+QPL26; next in-person eligibility H1 2027).");
  L.push("Calendar POST rule: cleared gates AND relevance >= 3 AND at least one keyword hit");
  L.push("(venue-affinity-only events stay report-only, never posted to the calendar).");
  L.push("");
  const cleared = gated.filter((g) => g.cleared && g.e.relevance >= 3);
  const top = cleared.filter((g) => g.e.priority >= 4 && g.e.frictionClass !== "HIGH").sort((a, b) => b.e.priority - a.e.priority || a.e.startIso.localeCompare(b.e.startIso)).slice(0, 10);
  L.push("## Top picks - personal relevance / friction");
  if (top.length === 0) L.push("_No events cleared the top-pick threshold this scan._");
  for (const g of top) {
    const e = g.e;
    L.push("- [P " + e.priority + " | " + e.frictionClass + " friction] " + e.startIso + " [" + e.kind + "|" + e.delivery + "|" + (e.cost === 0 ? "free" : e.cost === 1 ? "fee?" : "paid") + "] " + e.venue + ": " + e.snippet.slice(0, 110) + "  -> " + (e.interests.join("/") || "-") + "  <" + e.url + ">");
  }
  const t90 = scannedAt.slice(0, 10);
  const t90end = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const tasting = gated.filter((g) => g.cleared && g.e.relevance >= 2 && g.e.friction <= 2 && g.e.startIso >= t90 && g.e.startIso <= t90end)
    .sort((a, b) => a.e.friction - b.e.friction || b.e.relevance - a.e.relevance).slice(0, 5);
  L.push("");
  L.push("## Tasting menu - 3-5 cheap experiments over the next 90 days");
  if (tasting.length === 0) L.push("_No cheap low-friction experiments surfaced this scan._");
  for (const g of tasting) {
    const e = g.e;
    L.push("- " + e.startIso + " [" + e.kind + "|" + e.delivery + "|" + (e.cost === 0 ? "free" : "fee?") + "] " + e.venue + ": " + e.snippet.slice(0, 110) + "  <" + e.url + ">");
  }
  L.push("");
  L.push("## Budget and gates");
  L.push("- energy budget: H2 2026 in-person budget SPENT (LoF26 + QPL26). Next in-person eligibility H1 2027.");
  L.push("- H1 2027 in-person slots: " + budget.h1SlotsLeft + " left of " + ENERGY.maxInPersonPerHalfYear + " (ledger shows " + budget.h1InPersonBooked + " booked).");
  L.push("- Schengen exit deadline: 2026-10-17. Onsite Schengen-venue events on/after that date are blocked.");
  L.push("- standing filter: QPL / CWI topics excluded from personal recommendations.");
  L.push("- posted to calendar-api plane=personal: " + posted.posted + " new (dedupe skipped " + posted.skipped + ").");
  L.push("");
  L.push("## All in-window events (gate tags)");
  const chrono = gated.slice().sort((a, b) => a.e.startIso.localeCompare(b.e.startIso) || a.e.venue.localeCompare(b.e.venue));
  for (const g of chrono) {
    const e = g.e;
    const tag = g.cleared ? (e.relevance >= 3 ? "CLEARED" : "LOW-RELEVANCE") : g.reasons.join("; ");
    L.push("- " + e.startIso + (e.endIso && e.endIso !== e.startIso ? ".." + e.endIso : "") + " [" + e.kind + "|" + e.delivery + "|" + (e.cost === 0 ? "free" : e.cost === 1 ? "fee?" : "paid") + "] " + e.venue + ": " + e.snippet.slice(0, 100) + "  [" + tag + "]");
  }
  L.push("");
  L.push("## Source health");
  L.push("- venues ok: " + stats.okVenues + "/" + stats.totalVenues + " | discarded: " + stats.discarded + " | venue errors: " + stats.venueErrors.length);
  for (const v of stats.venueErrors) L.push("- ERR " + v.venue + ": " + v.error);
  return L.join(LF);
}

async function ensureSchema(env) {
  await env.AUDIT_DB.prepare(
    "CREATE TABLE IF NOT EXISTS personal_radar (slug TEXT PRIMARY KEY, report TEXT, events_json TEXT, posted_json TEXT, scanned_at TEXT, updated_at TEXT)"
  ).run();
}

async function run(env) {
  await ensureSchema(env);
  const scannedAt = new Date().toISOString();
  const nowIso = scannedAt.slice(0, 10);
  const horizon = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  const budget = await computeBudget(env);

  const results = await Promise.allSettled(SOURCES.map((s) => scanVenue(s)));
  const rawEvents = [];
  const venueErrors = [];
  let discarded = 0;
  results.forEach((res, i) => {
    if (res.status === "fulfilled" && res.value) {
      if (res.value.error) venueErrors.push({ venue: SOURCES[i].name, error: res.value.error });
      else { rawEvents.push(...res.value.events); discarded += res.value.discarded; }
    } else venueErrors.push({ venue: SOURCES[i].name, error: String((res.reason || "?").slice(0, 100)) });
  });

  const inWindow = rawEvents.filter((e) => e.startIso >= nowIso && e.startIso <= horizon);
  const scored = inWindow.map(scoreEvent);
  const seen = new Set();
  const uniq = scored.filter((e) => { const k = e.venue + "|" + e.startIso; if (seen.has(k)) return false; seen.add(k); return true; });
  const gated = uniq.map((e) => ({ e, ...gateEvent(e, budget) }));

  const existing = await fetchExistingCalendar(env);
  // dedupe key = venue + dtstart (stable across snippet-window changes; titles drift)
  const existingKeys = new Set(existing.map((x) => String(x.location || "").toLowerCase() + "|" + String(x.dtstart || "").slice(0, 10)));
  let ledgerRows = [];
  try {
    const lr = await env.PERSONAL_DB.prepare("SELECT title, start_date FROM events WHERE start_date>=?").bind(nowIso).all();
    ledgerRows = lr.results || [];
  } catch (e) { /* ledger read best-effort */ }
  const ledgerKeys = new Set(ledgerRows.map((x) => String(x.venue || "").toLowerCase() + "|" + String(x.start_date || "").slice(0, 10)));

  let posted = 0, skipped = 0;
  const postedList = [];
  for (const g of gated) {
    if (!g.cleared || g.e.relevance < 3 || !kwEvidence(g)) continue;
    const title = g.e.venue + ": " + g.e.snippet.slice(0, 90);
    const key = g.e.venue.toLowerCase() + "|" + g.e.startIso;
    if (existingKeys.has(key) || ledgerKeys.has(key)) { skipped += 1; continue; }
    if (posted >= 8) { skipped += 1; continue; }
    const body = {
      title, dtstart: g.e.startIso, dtend: g.e.endIso, all_day: false,
      location: g.e.venue, url: g.e.url, source: "personal-radar",
      domain: g.e.interests[0] || null, relevance: g.e.relevance, friction: g.e.friction,
      status: "tentative", description: g.e.snippet.slice(0, 300)
    };
    try {
      const pr = await env.CAL_API.fetch("https://calendar-api/events?plane=personal", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
      });
      if (pr.ok) {
        posted += 1;
        postedList.push({ title, dtstart: g.e.startIso, id: (await pr.json()).id || null });
        existingKeys.add(key);
      } else skipped += 1;
    } catch (e) { skipped += 1; }
  }

  const stats = { inWindow: uniq.length, discarded, okVenues: SOURCES.length - venueErrors.length, totalVenues: SOURCES.length, venueErrors, horizonISO: horizon };
  const report = renderReport(scannedAt, horizon, gated, budget, stats, { posted, skipped });
  const slug = "personal-events-radar-" + scannedAt.slice(0, 10);

  let delivery = null;
  try {
    if (env.OBSIDIAN_WRITER) {
      const dr = await env.OBSIDIAN_WRITER.fetch("https://obsidian-writer/", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: "personal-events-radar", section: "Personal Events Radar", content: report, date: scannedAt.slice(0, 10) })
      });
      delivery = { status: dr.status, ok: dr.ok };
    }
  } catch (e) { delivery = { error: String((e && e.message) || e).slice(0, 120) }; }

  await env.AUDIT_DB.prepare(
    "INSERT OR REPLACE INTO personal_radar (slug, report, events_json, posted_json, scanned_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(slug, report, JSON.stringify(gated), JSON.stringify(postedList), scannedAt, scannedAt).run();

  return {
    slug, version: VERSION, events: uniq.length, discarded, venueErrors: venueErrors.length,
    budget, posted: postedList, delivery,
    topPicks: gated.filter((g) => g.cleared && g.e.relevance >= 3).sort((a, b) => b.e.priority - a.e.priority).slice(0, 5)
      .map((g) => "P" + g.e.priority + " " + g.e.startIso + " " + g.e.venue + " " + g.e.interests.join("/") + " [" + g.e.delivery + "]")
  };
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(run(env)); },
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
