// conference-radar Worker - QNFO.OPS.008 (2026-09-01, re-delivered after red-team REFUTAL)
// Weekly cron scan of verified QNFO-relevant venue event pages; compile radar report to D1.
// Phase 1: parallel venue scan -> extract dated events -> compile markdown -> store D1 + GET report.
// Phase 2 (recorded): obsidian-writer (R2 vault) delivery + qnfo-email + Workflows upgrade.
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

function extractEvents(text, venue) {
  const events = [];
  const clean = (text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const re = /(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:\s*,?\s*\d{4})?[^|\n]{0,80})/gi;
  const seen = new Set();
  for (const m of clean.matchAll(re)) {
    const d = m[0].replace(/\s+/g, " ").trim();
    const key = d.slice(0, 60);
    if (!seen.has(key)) {
      seen.add(key);
      events.push({ venue, date: d.slice(0, 120), snippet: clean.slice(Math.max(0, m.index - 60), m.index + 160).slice(0, 220) });
    }
  }
  return events.slice(0, 12);
}

async function scanVenue(venue, url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html" }, redirect: "follow", signal: ctrl.signal });
    const text = await r.text();
    if (r.ok) return extractEvents(text, venue);
    return [{ venue, error: "HTTP " + r.status }];
  } catch (e) {
    return [{ venue, error: e && e.name === "AbortError" ? "timeout" : String((e && e.message) || e).slice(0, 100) }];
  } finally {
    clearTimeout(t);
  }
}

async function scan() {
  const results = await Promise.allSettled(VENUES.map(([v, u]) => scanVenue(v, u)));
  return results.flatMap((r, i) => (r.status === "fulfilled" ? r.value : [{ venue: VENUES[i][0], error: String(r.reason || "?").slice(0, 100) }]));
}

function renderReport(scannedAt, events) {
  const lines = [];
  lines.push("# CONFERENCE-RADAR scan " + scannedAt.slice(0, 10));
  lines.push("");
  lines.push("Events detected: " + events.filter((e) => !e.error).length + " | venue errors: " + events.filter((e) => e.error).length);
  lines.push("");
  for (const e of events.filter((x) => !x.error)) lines.push("- [" + e.venue + "] " + e.date);
  return lines.join("\n");
}

async function run(env) {
  const scannedAt = new Date().toISOString();
  const events = await scan();
  const report = renderReport(scannedAt, events);
  const slug = "conference-radar-" + scannedAt.slice(0, 10);
  await env.RADAR_DB.prepare(
    "INSERT OR REPLACE INTO conference_radar (slug, report, events_json, scanned_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(slug, report, JSON.stringify(events), scannedAt, scannedAt).run();
  return { slug, events: events.filter((e) => !e.error).length, errors: events.filter((e) => e.error).length };
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
    return new Response("conference-radar worker: GET / (latest report) | GET /?run=1 (trigger scan)", { status: 404 });
  },
};
