// conference-radar Worker - QNFO.OPS.008
// v1.2.0 (2026-09-02): post-red-team fix (agent_issues 353/354) - window-filter (year >= 2026),
// text-clean (drop SVG/CSS/JSON garbage), structured date fields (year/month/day/url/start/end),
// curated layer + deadline-imminent flags stored canonically (curated_json + flags_json columns).
// Weekly cron scan (0 5 * * 1 UTC) of verified QNFO-relevant venue event pages.
const VERSION = "1.2.0";

const VENUES = [
  ["CWI", "https://www.cwi.nl/en/events/"],
  ["Perimeter", "https://perimeterinstitute.ca/conferences"],
  ["FQXi", "https://fqxi.org/events"],
  ["IQOQI", "https://iqoqi.at"],
  ["MPI-PKS", "https://www.pks.mpg.de/events/workshops-seminars/"],
  ["SFI", "https://www.santafe.edu/events"],
  ["QuSoft", "https://www.qusoft.org"],
  ["QuTech", "https://www.qutech.nl/events/"],
  ["CSH", "https://www.csh.ac.at/events/"],
  ["CSS", "https://cssociety.org/events"],
  ["CNA", "https://www.complexnetworks.org/"],
  ["QIP", "https://qipconference.org/"],
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// Canonical deadline-imminent flags (verified by red-team 2026-09-02; AoE = UTC-12).
const DEADLINE_FLAGS = [
  { label: "CNA submission", deadline: "2026-09-02T23:59:00-12:00", venue: "CNA", note: "Complex Networks & Applications submission deadline (AoE)" },
  { label: "QIP 2027 talk submission", deadline: "2026-10-05T23:59:00-12:00", venue: "QIP", note: "Quantum Information Processing 2027 talk submission (AoE)" },
];

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MONTH_RE = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";

function extractEvents(text, venue, venueUrl) {
  const events = [];
  let discarded = 0;
  const clean = (text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  // two date orders: [month day , year] and [day month year | month year]
  const re = new RegExp(
    "(" + MONTH_RE + ")[a-z]*\\.?\\s+(\\d{1,2})\\s*,?\\s*(20\\d{2})" +
    "|((?:\\d{1,2}\\s+)?" + MONTH_RE + ")[a-z]*\\.?\\s*,?\\s*(20\\d{2})",
    "gi"
  );
  const seen = new Set();
  for (const m of clean.matchAll(re)) {
    const monTok = m[1] || m[4] || "";
    const dayTok = m[2] || "";
    const yearTok = m[3] || m[5] || "";
    const year = yearTok ? parseInt(yearTok, 10) : 0;
    // window-filter: require explicit year >= 2026 (drops historical/garbage)
    if (!yearTok || year < 2026) { discarded += 1; continue; }
    const date = m[0].replace(/\s+/g, " ").trim();
    const key = venue + "|" + date.slice(0, 60);
    if (seen.has(key)) continue;
    const snippet = clean.slice(Math.max(0, m.index - 60), m.index + 160).slice(0, 220);
    // text-clean: drop SVG/CSS/JSON leakage
    if (/\.st\d+\s*\{|fill\s*:\s*none|"id"\s*:\s*\d+\s*,/i.test(snippet)) { discarded += 1; continue; }
    seen.add(key);
    const mon = (monTok || "").toLowerCase().slice(0, 3);
    events.push({
      venue,
      date,
      year,
      month: MONTHS[mon] ?? null,
      day: dayTok ? parseInt(dayTok, 10) : null,
      start: date,
      end: date,
      url: venueUrl,
      snippet,
    });
  }
  const kept = events.slice(0, 12);
  discarded += Math.max(0, events.length - kept.length);
  return { events: kept, discarded };
}

function curate(events) {
  // dedupe by venue + month + day, sort by year -> month -> day -> venue
  const uniq = new Map();
  for (const e of events) {
    const k = e.venue + "|" + (e.month ?? "?") + "|" + (e.day ?? "");
    if (!uniq.has(k)) uniq.set(k, e);
  }
  return Array.from(uniq.values()).sort((a, b) =>
    (a.year - b.year) || ((a.month ?? 0) - (b.month ?? 0)) || ((a.day ?? 0) - (b.day ?? 0)) || a.venue.localeCompare(b.venue)
  );
}

function flagStatus(deadlineIso, now) {
  const dl = new Date(deadlineIso).getTime();
  const diffMs = dl - now.getTime();
  const days = diffMs / 86400000;
  if (days < 0) return "PASSED";
  if (days <= 7) return "IMMINENT";
  if (days <= 30) return "UPCOMING";
  return "FUTURE";
}

async function scanVenue(venue, url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html" }, redirect: "follow", signal: ctrl.signal });
    const text = await r.text();
    if (r.ok) return { venue, ...extractEvents(text, venue, url) };
    return { venue, events: [], discarded: 0, error: "HTTP " + r.status };
  } catch (e) {
    return { venue, events: [], discarded: 0, error: e && e.name === "AbortError" ? "timeout" : String((e && e.message) || e).slice(0, 100) };
  } finally {
    clearTimeout(t);
  }
}

async function scan() {
  const results = await Promise.allSettled(VENUES.map(([v, u]) => scanVenue(v, u)));
  const events = [];
  const venueErrors = [];
  let discarded = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) {
      if (r.value.error) venueErrors.push({ venue: r.value.venue, error: r.value.error });
      else { events.push(...r.value.events); discarded += r.value.discarded; }
    } else {
      venueErrors.push({ venue: VENUES[i][0], error: String((r.reason || "?").slice(0, 100)) });
    }
  });
  return { events, venueErrors, discarded };
}

function renderReport(scannedAt, curated, flags, stats) {
  const lines = [];
  lines.push("# CONFERENCE-RADAR scan " + scannedAt.slice(0, 10));
  lines.push("");
  lines.push("Events in window (2026+): " + stats.inWindow + " | discarded (out-of-window/garbage): " + stats.discarded + " | venue errors: " + stats.venueErrors);
  lines.push("");
  lines.push("## Curated (deduplicated, chronological)");
  for (const e of curated) lines.push("- [" + e.venue + "] " + e.date + "  <" + e.url + ">");
  lines.push("");
  lines.push("## Deadline-imminent flags");
  for (const f of flags) lines.push("- [" + f.status + "] " + f.label + " - " + f.deadline + " (" + f.note + ")");
  return lines.join("\n");
}

async function ensureSchema(env) {
  await env.RADAR_DB.prepare(
    "CREATE TABLE IF NOT EXISTS conference_radar (slug TEXT PRIMARY KEY, report TEXT, events_json TEXT, scanned_at TEXT, updated_at TEXT, curated_json TEXT, flags_json TEXT)"
  ).run();
  for (const col of ["curated_json", "flags_json"]) {
    try { await env.RADAR_DB.prepare("ALTER TABLE conference_radar ADD COLUMN " + col + " TEXT").run(); } catch (e) { /* already exists */ }
  }
}

async function run(env) {
  await ensureSchema(env);
  const scannedAt = new Date().toISOString();
  const { events, venueErrors, discarded } = await scan();
  const curated = curate(events);
  const now = new Date();
  const flags = DEADLINE_FLAGS.map((f) => ({ ...f, status: flagStatus(f.deadline, now) }));
  const stats = { inWindow: events.length, discarded, venueErrors: venueErrors.length };
  const report = renderReport(scannedAt, curated, flags, stats);
  const slug = "conference-radar-" + scannedAt.slice(0, 10);

  let delivery = null;
  try {
    if (env.OBSIDIAN_WRITER) {
      const dr = await env.OBSIDIAN_WRITER.fetch("https://obsidian-writer/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: "conference-radar", section: "Conference Radar", content: report, date: scannedAt.slice(0, 10) }),
      });
      delivery = { status: dr.status, ok: dr.ok };
    }
  } catch (e) { delivery = { error: String((e && e.message) || e).slice(0, 120) }; }

  let email = null;
  try {
    if (env.EMAIL && env.EMAIL_API_KEY) {
      const er = await env.EMAIL.fetch("https://qnfo-email.internal/send", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": env.EMAIL_API_KEY },
        body: JSON.stringify({ to: "alerts@qnfo.org", subject: "Conference Radar scan " + scannedAt.slice(0, 10), body: report }),
      });
      email = { status: er.status, ok: er.ok };
    }
  } catch (e) { email = { error: String((e && e.message) || e).slice(0, 120) }; }

  await env.RADAR_DB.prepare(
    "INSERT OR REPLACE INTO conference_radar (slug, report, events_json, curated_json, flags_json, scanned_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(slug, report, JSON.stringify(events), JSON.stringify(curated), JSON.stringify(flags), scannedAt, scannedAt).run();

  return {
    slug,
    version: VERSION,
    events: events.length,
    curated: curated.length,
    discarded,
    venueErrors: venueErrors.length,
    flags: flags.map((f) => f.label + ":" + f.status),
    delivery,
    email,
  };
}

export default {
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
      const rows = await env.RADAR_DB.prepare("SELECT report FROM conference_radar ORDER BY scanned_at DESC LIMIT 1").all();
      const latest = rows.results && rows.results[0];
      return new Response(latest ? latest.report : "No scan yet. GET /?run=1", { headers: { "content-type": "text/markdown" } });
    }
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, worker: "conference-radar", version: VERSION }), { headers: { "content-type": "application/json" } });
    }
    return new Response("conference-radar worker: GET / (latest report) | GET /?run=1 (trigger scan) | GET /health", { status: 404 });
  },
};
