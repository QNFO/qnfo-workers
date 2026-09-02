// personal-events-radar Worker - QNFO.OPS.010 Stage B
// v1.1.0 (2026-09-02): PERSONAL-QNFO-SEPARATION-1 rebuild.
//   v1.0.x VIOLATED the separation gate: it scored WORK programs (Laws of Form, ultrametric/
//   adelic, JPCUB energy, quantum) from research venue pages into the PERSONAL plane calendar.
//   v1.1.0 removes the entire work/research interest taxonomy and scans PERSONAL-LIFE venues
//   only: museums, concert halls, open-air theatre, and Amsterdam city culture listings.
//   Personal plane = personal life (arts, music, museums, queer arts, performance, festivals).
//   Work venues/conferences live exclusively in the work plane (events-radar) and the
//   personal-life attendance ledger (trips), never here.
// PURPOSE: weekly scan of personal-life venue pages scored against the PERSONAL plane
//   preferences in personal-life D1 (profile facets). Gates every recommendation through the
//   standing personal filters:
//   - energy budget: max 2 in-person TRAVEL events per half-year (local Amsterdam events are
//     commutable and do not consume travel budget); H2 2026 travel budget SPENT
//   - Schengen exit deadline 2026-10-17: onsite Schengen-venue events on/after that date blocked
//   - standing filter: no QPL/CWI topics in personal recommendations
//   - room-question gate: venue affinity (energizing venues rank up)
//   - tasting-menu protocol: 3-5 cheap local experiments over the next 90 days
// Cleared events are POSTed to calendar-api /events?plane=personal (source=personal-radar,
// status=tentative) with relevance+friction; report persisted to D1 qnfo-audit.personal_radar
// and delivered to obsidian-writer (section "Personal Events Radar").
// CAPABILITIES: parallel venue scan (8s AbortController), date-range extraction, personal-life
//   relevance, friction scoring, hard gate engine, calendar-api dedupe before POST.
// DEPLOY: cd qnfo-workers/personal-events-radar && wrangler deploy
// CANONICAL SOURCE (remote): github.com/QNFO/qnfo-workers -> personal-events-radar/worker.js
// NOTE: all regexes are built backslash-free (char classes + fromCharCode) for transport safety.
const VERSION = "1.1.0";
const WORKER = "personal-events-radar";

const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const WSC = "[" + " " + TAB + CR + LF + "]";
const WS = WSC + "+";

// ---- Personal-life interest taxonomy (from personal-life profile facets ONLY) ----
// Evidence: facets likes "museums", "classical concerts", "queer arts and culture",
// "play and performance", "conversation formats", "audiobooks and literature".
// NO work/research keywords live here (PERSONAL-QNFO-SEPARATION-1).
const INTERESTS = [
  { code: "MUS", name: "Museums", kw: ["museum", "exhibition", "expositie", "gallery", "collection", "masterpiece", "old master", "tentoonstelling"] },
  { code: "CLA", name: "Classical music", kw: ["concert", "classical", "symphony", "orchestra", "orchestral", "chamber music", "recital", "concerto", "sonata", "opera", "baroque", "renaissance music"] },
  { code: "PER", name: "Play and performance", kw: ["performance", "theatre", "theater", "dance", "ballet", "puppet", "circus", "comedy", "open air", "openluchttheater", "storytelling"] },
  { code: "QUR", name: "Queer arts and culture", kw: ["queer", "pride", "lgbt", "drag", "ballroom"] },
  { code: "JAZ", name: "Jazz and contemporary", kw: ["jazz", "contemporary music", "electronic", "dj", "live music", "indie", "folk"] },
  { code: "LIT", name: "Literature and ideas", kw: ["literature", "poetry", "book", "author", "reading", "philosophy cafe", "debate", "talk"] },
  { code: "FIL", name: "Film and screen", kw: ["film", "cinema", "screening", "documentary", "movie"] },
  { code: "FES", name: "Festivals and city life", kw: ["festival", "open day", "night of", "museumnacht", "free entry", "gratis", "market", "parade", "city walk"] }
];

// ---- Personal-life venue sources (Amsterdam local; evidence = profile facets) ----
// Concertgebouw (classical concerts), Rijksmuseum + Van Gogh + Stedelijk (museums),
// Vondelpark Openluchttheater (he volunteers there), I amsterdam (city culture incl. queer arts).
const SOURCES = [
  { name: "Concertgebouw", url: "https://www.concertgebouw.nl/en", kind: "concert", delivery: "onsite", cost: 2 },
  { name: "Rijksmuseum", url: "https://www.rijksmuseum.nl/en/whats-on", kind: "exhibition", delivery: "onsite", cost: 1 },
  { name: "VanGoghMuseum", url: "https://www.vangoghmuseum.nl/en/visit/whats-on", kind: "exhibition", delivery: "onsite", cost: 1 },
  { name: "Stedelijk", url: "https://www.stedelijk.nl/en/visit/agenda", kind: "exhibition", delivery: "onsite", cost: 1 },
  { name: "Openluchttheater", url: "https://www.openluchttheater.nl/agenda", kind: "performance", delivery: "onsite", cost: 0 },
  { name: "Iamsterdam", url: "https://www.iamsterdam.com/en/whats-on", kind: "event", delivery: "onsite", cost: 1 }
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// ---- Personal gate configuration (evidence = personal-life profile facets, 2026-09-02) ----
// facet logistics "energy budget H2 2026 spent" (conf 0.95): H2 2026 in-person TRAVEL budget
//   SPENT (LoF26 + QPL26). Next in-person travel eligibility: H1 2027 (QIP27 Singapore = slot 1).
// facet logistics "Schengen visa exit deadline" (conf 0.9): must exit Schengen before 2026-10-17.
// facet standing-filters "No QPL/CWI topics in personal recommendations" (conf 0.95).
const ENERGY = { maxInPersonPerHalfYear: 2, h2_2026_spent: true, nextEligibility: "2027-01-01" };
const SCHENGEN_EXIT = "2026-10-17";
const STANDING_DROP = /qpl|cwi/i;
// All scanned venues are Amsterdam-local (commutable); travel-energy gate does not apply to them.
// Room-question gate: energizing local venues rank up.
const VENUE_AFFINITY = { Concertgebouw: 1, Rijksmuseum: 1, VanGoghMuseum: 1, Stedelijk: 1, Openluchttheater: 1 };
const LOCAL_VENUES = ["Concertgebouw", "Rijksmuseum", "VanGoghMuseum", "Stedelijk", "Openluchttheater", "Iamsterdam"];
const SCHENGEN_VENUES = ["Concertgebouw", "Rijksmuseum", "VanGoghMuseum", "Stedelijk", "Openluchttheater", "Iamsterdam"];
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

function kwEvidence(g) { return (g.e.interestDetail || []).some((h) => h.n >= 1); }

function kindFriction(kind) {
  const m = { festival: 0, performance: 1, talk: 1, film: 1, event: 2, exhibition: 2, concert: 2 };
  return m[kind] !== undefined ? m[kind] : 2;
}
function deliveryFriction(d) { return d === "onsite" ? 1 : d === "hybrid" ? 0 : 2; }
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

function gateEvent(e) {
  const reasons = [];
  const text = ((e.snippet || "") + " " + e.venue).toLowerCase();
  if (STANDING_DROP.test(text)) reasons.push("standing-filter:QPL/CWI");
  if (e.delivery === "onsite" && SCHENGEN_VENUES.includes(e.venue) && e.startIso >= SCHENGEN_EXIT) {
    reasons.push("schengen-exit:" + SCHENGEN_EXIT);
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

function normTitle(t) { return String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 60); }

async function fetchExistingCalendar(env) {
  try {
    const r = await env.CAL_API.fetch("https://calendar-api/events?plane=personal");
    const j = await r.json();
    return (j.events || []).filter((e) => e.source === "personal-radar");
  } catch (e) { return []; }
}

function renderReport(scannedAt, horizon, gated, stats, posted) {
  const L = [];
  L.push("PERSONAL-EVENTS-RADAR SCAN — generated " + scannedAt.slice(0, 10) + " (window: " + scannedAt.slice(0, 10) + " .. " + horizon + ")");
  L.push("[PERSONAL-RADAR: " + gated.length + " in-window events | " + stats.okVenues + "/" + stats.totalVenues + " venues ok | " + gated.filter((g) => g.cleared && g.e.relevance >= 3 && kwEvidence(g)).length + " cleared | " + posted.posted + " posted to calendar]");
  L.push("");
  L.push("Scope: PERSONAL LIFE only (museums, concerts, performance, queer arts, festivals,");
  L.push("local Amsterdam culture). Work/research venues live in events-radar, not here.");
  L.push("Ranking rule: priority = 10 x relevance / (1 + friction). Friction = kind + delivery + cost.");
  L.push("Gates: standing filter (QPL/CWI) -> Schengen exit 2026-10-17 (onsite Amsterdam events).");
  L.push("Local Amsterdam events do NOT consume the in-person TRAVEL budget.");
  L.push("Calendar POST rule: cleared gates AND relevance >= 3 AND at least one keyword hit.");
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
  L.push("## Tasting menu - 3-5 cheap local experiments over the next 90 days");
  if (tasting.length === 0) L.push("_No cheap low-friction experiments surfaced this scan._");
  for (const g of tasting) {
    const e = g.e;
    L.push("- " + e.startIso + " [" + e.kind + "|" + e.delivery + "|" + (e.cost === 0 ? "free" : "fee?") + "] " + e.venue + ": " + e.snippet.slice(0, 110) + "  <" + e.url + ">");
  }
  L.push("");
  L.push("## Budget and gates");
  L.push("- in-person TRAVEL budget: H2 2026 SPENT (LoF26 + QPL26). Local Amsterdam events are exempt.");
  L.push("- Schengen exit deadline: 2026-10-17. Onsite Amsterdam events on/after that date are blocked.");
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
  const gated = uniq.map((e) => ({ e, ...gateEvent(e) }));

  const existing = await fetchExistingCalendar(env);
  const existingKeys = new Set(existing.map((x) => String(x.location || "").toLowerCase() + "|" + String(x.dtstart || "").slice(0, 10)));
  let ledgerRows = [];
  try {
    const lr = await env.PERSONAL_DB.prepare("SELECT venue, start_date FROM events WHERE start_date>=?").bind(nowIso).all();
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
  const report = renderReport(scannedAt, horizon, gated, stats, { posted, skipped });
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
    posted: postedList, delivery,
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
