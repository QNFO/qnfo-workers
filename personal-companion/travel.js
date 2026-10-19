// personal-companion/travel.js
// TRAVEL-PLANNER-1 (2026-10-19, charter pillar: personal). The owner likes travelling and dislikes planning it. This module
// does the planning server-side, on the companion's hourly tick, from data the fleet already holds:
//   * personal-life.events (category lodging/travel), written by qnfo-email ITINERARY-INGEST-1 from booking confirmations;
//   * personal-life.profile rows with facet travel/likes/dislikes/logistics (the owner's preferences; never in this repo);
//   * travel_reactions, the append-only ledger of what the owner picked, rejected or booked.
// Design rules (each is a test in travel.test.mjs):
//   1. No questionnaire. The module never asks a preference question; it proposes 2-3 concrete options with one pick
//      marked and learns from the reaction (pick, not for me, or a later booking that lands in events).
//   2. Nothing is booked or paid. A pick records the choice and hands back a booking search link; the owner books.
//   3. Links that change state are signed (HMAC-SHA256 of the option id) and change state only on POST, so a mail
//      scanner that follows a GET link cannot pick or reject anything. No signing key set means no state-changing links.
//   4. One proposal per trip key (city + check-in date), ever; a tick is idempotent and safe to run every hour.
//   5. A model failure proposes nothing (two models, then nothing, retried next tick); options are never invented
//      without a model, and every option carries a real search link rather than a made-up listing.
//   6. No personal data in this file: home city and limits are travel_config rows with neutral defaults.

export const DDL = [
  `CREATE TABLE IF NOT EXISTS travel_options (
     id TEXT PRIMARY KEY,
     trip_key TEXT NOT NULL,
     rank INTEGER NOT NULL,
     pick INTEGER NOT NULL DEFAULT 0,
     mode TEXT NOT NULL,
     city TEXT NOT NULL,
     country TEXT,
     kind TEXT,
     checkin TEXT NOT NULL,
     nights INTEGER NOT NULL,
     est_per_night REAL,
     currency TEXT,
     why TEXT,
     link TEXT NOT NULL,
     model TEXT,
     status TEXT NOT NULL DEFAULT 'proposed',
     created_at TEXT NOT NULL,
     decided_at TEXT,
     UNIQUE (trip_key, rank)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_travel_options_status ON travel_options(status, checkin)`,
  `CREATE TABLE IF NOT EXISTS travel_reactions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     option_id TEXT,
     trip_key TEXT,
     reaction TEXT NOT NULL CHECK (reaction IN ('pick','no','booked','expired')),
     city TEXT,
     kind TEXT,
     ts TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS travel_notices (
     kind TEXT NOT NULL,
     ref TEXT NOT NULL,
     sent_at TEXT NOT NULL,
     PRIMARY KEY (kind, ref)
   )`,
  `CREATE TABLE IF NOT EXISTS travel_config (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`
];

// Seeded once with INSERT OR IGNORE; a row the owner edits always wins.
export const DEFAULTS = {
  enabled: "on",            // off stops proposals and notices, not the routes
  home_city: "Amsterdam",
  home_country: "NL",
  home_airports: "AMS,EIN,RTM", // a travel row titled "... to <one of these>" right after a stay means the trip ends
  lead_days: "3",           // propose when the next unbooked night is this close (the owner books late)
  nights: "2",              // default stay length per stop
  max_per_night: "100",     // search filter ceiling
  currency: "EUR",
  ideas_weekday: "0",       // 0 = Sunday: weekly "where next" ideas while nothing is booked; "-1" turns them off
  mail_from_hour: "7",      // local hours (tz below) in which mail may go out
  mail_to_hour: "21",
  tz: "Europe/Amsterdam"
};

export const MODELS = ["@cf/zai-org/glm-5.3-flash", "@cf/openai/gpt-oss-20b"];
export const BASE = "https://reading.q08.org";

export async function ensureTravel(db, nowIso) {
  for (const s of DDL) await db.prepare(s).run();
  const ts = nowIso || new Date().toISOString();
  for (const [k, v] of Object.entries(DEFAULTS)) {
    await db.prepare("INSERT INTO travel_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING").bind(k, v, ts).run();
  }
}

export async function cfg(db) {
  const out = { ...DEFAULTS };
  const r = await db.prepare("SELECT key, value FROM travel_config").all();
  for (const row of r.results || []) out[row.key] = row.value;
  return out;
}

export function addDays(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function localParts(nowMs, tz) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" });
  const p = {};
  for (const x of f.formatToParts(new Date(nowMs))) p[x.type] = x.value;
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { day: p.year + "-" + p.month + "-" + p.day, hour: Number(p.hour), weekday: wd };
}

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// Where the owner is in a trip, from lodging and travel rows (ISO dates; lodging end_date is the check-out day).
// road: the latest lodging ends within lead_days of today (or is current), no later lodging covers that night, and no
//       travel row on or after it returns home. checkin = that check-out day.
// home: anything else. future_booked says whether any lodging starts after today.
export function tripState(rows, today, c) {
  const home = norm(c.home_city);
  const lead = Number(c.lead_days) || 3;
  const lodging = (rows || []).filter((r) => r.category === "lodging" && /^\d{4}-\d{2}-\d{2}$/.test(String(r.start_date || "")) && /^\d{4}-\d{2}-\d{2}$/.test(String(r.end_date || "")))
    .sort((a, b) => (a.end_date < b.end_date ? -1 : a.end_date > b.end_date ? 1 : 0));
  const travel = (rows || []).filter((r) => r.category === "travel" && /^\d{4}-\d{2}-\d{2}$/.test(String(r.start_date || "")));
  const recent = lodging.filter((r) => r.end_date >= addDays(today, -60)).map((r) => r.city).filter(Boolean);
  const futureBooked = lodging.some((r) => r.start_date > today);
  const current = lodging.filter((r) => r.end_date >= today);
  // the earliest check-out on or after today that no other lodging continues from
  let gap = null;
  for (const r of current) {
    const continued = lodging.some((o) => o !== r && o.start_date <= r.end_date && o.end_date > r.end_date);
    if (!continued) { gap = r; break; }
  }
  if (gap && gap.start_date <= addDays(today, lead) && gap.end_date <= addDays(today, lead)) {
    // A flight row's city is sometimes the origin (eSky) and sometimes the destination, so the title's "to <X>" decides too.
    const dests = [home].concat(String(c.home_airports || "").split(",").map(norm)).filter(Boolean).map((s) => s.replace(/[^a-z0-9 ]/g, ""));
    const toHome = new RegExp("\\bto\\s+(" + dests.join("|") + ")\\b", "i");
    const goesHome = travel.some((t) => t.start_date >= gap.end_date && t.start_date <= addDays(gap.end_date, 1) &&
      ((norm(t.city) === home && norm(t.city) !== norm(gap.city)) || toHome.test(norm(t.title))));
    const awayFromHome = norm(gap.city) !== home;
    if (!goesHome && awayFromHome) {
      return { mode: "road", city: gap.city, country: gap.country || "", checkin: gap.end_date, recent, futureBooked };
    }
  }
  return { mode: "home", city: c.home_city, country: c.home_country, checkin: null, recent, futureBooked };
}

export function bookingLink({ city, country, checkin, nights, maxPerNight, currency }) {
  const q = new URLSearchParams({
    ss: [city, country].filter(Boolean).join(", "),
    checkin: checkin,
    checkout: addDays(checkin, Math.max(1, Number(nights) || 1)),
    group_adults: "1",
    no_rooms: "1",
    group_children: "0",
    selected_currency: currency || "EUR",
    order: "review_score_and_price"
  });
  const max = Number(maxPerNight);
  if (max > 0) q.set("nflt", "price=" + (currency || "EUR") + "-min-" + Math.round(max) + "-1");
  return "https://www.booking.com/searchresults.html?" + q.toString();
}

export function transitLink(from, to) {
  const q = new URLSearchParams({ api: "1", origin: from, destination: to, travelmode: "transit" });
  return "https://www.google.com/maps/dir/?" + q.toString();
}

// Model output -> at most 3 clean options. Accepts a bare JSON array, {options:[...]}, or JSON inside prose/fences.
export function parseOptions(text) {
  const s = String(text || "");
  let j = null;
  const tries = [s, (s.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1], (s.match(/\{[\s\S]*\}/) || [])[0], (s.match(/\[[\s\S]*\]/) || [])[0]];
  for (const t of tries) { if (!t) continue; try { j = JSON.parse(t); break; } catch (e) { /* next shape */ } }
  const arr = Array.isArray(j) ? j : (j && Array.isArray(j.options) ? j.options : []);
  const out = [];
  const seen = new Set();
  for (const o of arr) {
    if (!o || typeof o !== "object") continue;
    const city = String(o.city || "").replace(/[\r\n<>]/g, " ").trim().slice(0, 60);
    if (!city || seen.has(norm(city))) continue;
    seen.add(norm(city));
    const nights = Math.min(7, Math.max(1, Math.round(Number(o.nights) || 0) || 0));
    const est = Number(o.est_per_night);
    out.push({
      city,
      country: String(o.country || "").replace(/[\r\n<>]/g, " ").trim().slice(0, 40),
      kind: String(o.kind || "").replace(/[\r\n<>]/g, " ").trim().slice(0, 40).toLowerCase(),
      nights: nights || null,
      est_per_night: Number.isFinite(est) && est > 0 && est < 5000 ? Math.round(est) : null,
      why: String(o.why || "").replace(/[\r\n<>]+/g, " ").trim().slice(0, 240)
    });
  }
  return out.slice(0, 3);
}

// Drop what the owner rejected or just stayed in, keep at most 3, and mark one pick: the first option whose kind the owner
// picked or booked most often, else the model's first.
export function rankAndMark(opts, reactions, state) {
  const no = new Set((reactions || []).filter((r) => r.reaction === "no").map((r) => norm(r.city)));
  const recent = new Set((state && state.recent || []).map(norm));
  const here = norm(state && state.city);
  const kept = (opts || []).filter((o) => !no.has(norm(o.city)) && !recent.has(norm(o.city)) && norm(o.city) !== here).slice(0, 3);
  const score = {};
  for (const r of reactions || []) if (r.kind && (r.reaction === "pick" || r.reaction === "booked")) score[r.kind] = (score[r.kind] || 0) + (r.reaction === "booked" ? 2 : 1);
  let best = 0, bestScore = 0;
  kept.forEach((o, i) => { const sc = score[o.kind] || 0; if (sc > bestScore) { best = i; bestScore = sc; } });
  return kept.map((o, i) => ({ ...o, pick: i === best ? 1 : 0 }));
}

export function promptFor(state, c, profileRows, reactions, monthName) {
  const facts = (profileRows || []).map((r) => "- " + String(r.label || "") + ": " + String(r.statement || "")).join("\n").slice(0, 3000);
  const picked = (reactions || []).filter((r) => r.reaction === "pick" || r.reaction === "booked").slice(0, 10).map((r) => r.city + (r.kind ? " (" + r.kind + ")" : "")).join(", ");
  const rejected = (reactions || []).filter((r) => r.reaction === "no").slice(0, 15).map((r) => r.city).join(", ");
  const task = state.mode === "road"
    ? "The traveller checks out of " + state.city + (state.country ? ", " + state.country : "") + " on " + state.checkin + " and has nothing booked after that. Propose exactly 3 next stops reachable by train, bus or a short flight, each for " + c.nights + " nights or a length you justify."
    : "The traveller is home in " + c.home_city + " with nothing booked. Propose exactly 3 trips that could start within the next three weeks, each a first stop of " + c.nights + "-3 nights.";
  return [
    { role: "system", content: "You plan travel for one solo traveller who loves travel and hates planning. You never ask questions. Reply with JSON only: {\"options\":[{\"city\":\"\",\"country\":\"\",\"kind\":\"old town|coast|second city|nature|capital\",\"nights\":2,\"est_per_night\":0,\"why\":\"one sentence in plain English\"}]}. Respect every logistics fact (visas, residence rules) in the profile." },
    { role: "user", content: [
      task,
      "Month: " + monthName + ". Typical lodging budget: up to " + c.max_per_night + " " + c.currency + " per night.",
      "Profile:\n" + (facts || "- (no stored preferences yet)"),
      "Stayed recently (do not repeat): " + ((state.recent || []).join(", ") || "none"),
      "Picked or booked before: " + (picked || "none"),
      "Rejected (never propose): " + (rejected || "none")
    ].join("\n\n") }
  ];
}

export function modelText(r) {
  if (r == null) return "";
  if (typeof r === "string") return r;
  if (typeof r.response === "string") return r.response;
  if (r.response && typeof r.response === "object") return JSON.stringify(r.response);
  const ch = r.choices && r.choices[0];
  if (ch && ch.message && typeof ch.message.content === "string") return ch.message.content;
  return "";
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => { const t = String(s || "").replace(/-/g, "+").replace(/_/g, "/"); const b = atob(t + "===".slice((t.length + 3) % 4)); return Uint8Array.from(b, (ch) => ch.charCodeAt(0)); };

export async function sign(secret, id) {
  return b64u(await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode("travel:" + id)));
}
// crypto.subtle.verify compares in constant time.
export async function verify(secret, id, sig) {
  if (!secret || !sig) return false;
  try { return await crypto.subtle.verify("HMAC", await hmacKey(secret), unb64u(sig), new TextEncoder().encode("travel:" + id)); }
  catch (e) { return false; }
}

export function signingKey(env) { return env.TRAVEL_KEY || env.WELLBEING_TOKEN || env.COMPANION_KEY || ""; }

export function optionId() {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  return "tr_" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function mailFor(state, opts, links, c) {
  const head = state.mode === "road"
    ? "You check out of " + state.city + " on " + state.checkin + " and nothing is booked after that. Three next stops; my pick is marked."
    : "Nothing is booked yet. Three ideas for a next trip; my pick is marked.";
  const lines = [head, ""];
  opts.forEach((o, i) => {
    const l = links[i];
    lines.push((o.pick ? "★ " : "  ") + (i + 1) + ". " + o.city + (o.country ? ", " + o.country : "") + " · " + o.nights + " night" + (o.nights === 1 ? "" : "s") + (o.kind ? " · " + o.kind : "") + (o.est_per_night ? " · about " + o.est_per_night + " " + c.currency + "/night" : ""));
    if (o.why) lines.push("   " + o.why);
    lines.push("   Stays: " + o.link);
    if (state.mode === "road") lines.push("   Getting there: " + transitLink(state.city, o.city + (o.country ? ", " + o.country : "")));
    if (l) lines.push("   Choose or skip: " + l);
    lines.push("");
  });
  lines.push("Nothing is booked for you. Choosing one records it and keeps the search link ready; skipping one means I won't suggest that place again.");
  const pick = opts.find((o) => o.pick) || opts[0];
  return { subject: (state.mode === "road" ? "Next stop after " + state.city + ": " : "Where next: ") + pick.city + " is my pick", body: lines.join("\n") };
}

export function checkinDraft(ev) {
  return [
    "Hello,",
    "",
    "I have a booking from " + ev.start_date + (ev.booking_ref ? " (reference " + ev.booking_ref + ")" : "") + " and expect to arrive around midday.",
    "Would an early check-in be possible? If not, could I leave my bag with you until the room is ready?",
    "",
    "Thank you!"
  ].join("\n");
}

async function many(db, sql, ...a) { const r = await db.prepare(sql).bind(...a).all(); return r.results || []; }

// Record bookings that match an open proposal (strongest signal) and close proposals whose night is now covered or past.
export async function reconcile(db, rows, today, nowIso) {
  const open = await many(db, "SELECT id, trip_key, city, kind, checkin FROM travel_options WHERE status IN ('proposed','picked')");
  const lodging = (rows || []).filter((r) => r.category === "lodging");
  let booked = 0, expired = 0;
  const done = new Set();
  for (const o of open) {
    if (done.has(o.trip_key)) continue;
    const covering = lodging.filter((r) => r.start_date <= o.checkin && r.end_date > o.checkin);
    if (covering.length) {
      const won = open.find((x) => x.trip_key === o.trip_key && covering.some((r) => norm(r.city) === norm(x.city)));
      await db.prepare("UPDATE travel_options SET status = CASE WHEN id = ? THEN 'booked' ELSE 'superseded' END, decided_at = ? WHERE trip_key = ? AND status IN ('proposed','picked')").bind(won ? won.id : "", nowIso, o.trip_key).run();
      if (won) {
        await db.prepare("INSERT INTO travel_reactions (option_id, trip_key, reaction, city, kind, ts) VALUES (?, ?, 'booked', ?, ?, ?)").bind(won.id, o.trip_key, won.city, won.kind || null, nowIso).run();
        booked++;
      }
      done.add(o.trip_key);
    } else if (o.checkin < today) {
      await db.prepare("UPDATE travel_options SET status = 'expired', decided_at = ? WHERE trip_key = ? AND status IN ('proposed','picked')").bind(nowIso, o.trip_key).run();
      done.add(o.trip_key);
      expired++;
    }
  }
  return { booked, expired };
}

// One hourly step. deps: { now (ms), ai(model, input) -> result, send(subject, body) -> {ok}, key }
export async function travelTick(env, deps = {}) {
  const db = env.PERSONAL;
  if (!db) return { skipped: "no PERSONAL binding" };
  const nowMs = deps.now || Date.now();
  const nowIso = new Date(nowMs).toISOString();
  await ensureTravel(db, nowIso);
  const c = await cfg(db);
  const lp = localParts(nowMs, c.tz);
  const today = lp.day;
  const rows = await many(db, "SELECT id, category, title, city, country, start_date, end_date, booking_ref FROM events WHERE category IN ('lodging','travel') AND (end_date >= ? OR start_date >= ?)", addDays(today, -60), addDays(today, -60));
  const rec = await reconcile(db, rows, today, nowIso);
  const out = { mode: null, proposed: 0, notices: 0, ...rec };
  if (c.enabled !== "on" && !deps.force) { out.skipped = "travel_config enabled = " + c.enabled; return out; }
  const inHours = lp.hour >= Number(c.mail_from_hour) && lp.hour < Number(c.mail_to_hour);
  if (!inHours && !deps.force) { out.skipped = "outside mail hours"; return out; }
  const send = deps.send || (async () => ({ ok: false, error: "no sender" }));

  // Day-before note for a stay starting tomorrow: an early check-in request ready to paste to the host.
  for (const ev of rows.filter((r) => r.category === "lodging" && r.start_date === addDays(today, 1))) {
    const seen = await db.prepare("SELECT 1 FROM travel_notices WHERE kind = 'checkin' AND ref = ?").bind(ev.id).first();
    if (seen) continue;
    const r = deps.dry ? { ok: true } : await send("Tomorrow: " + (ev.title || ev.city) + " - early check-in note", "Your stay starts tomorrow. A message for the host, ready to paste in the booking app:\n\n" + checkinDraft(ev));
    if (r && r.ok && !deps.dry) await db.prepare("INSERT OR IGNORE INTO travel_notices (kind, ref, sent_at) VALUES ('checkin', ?, ?)").bind(ev.id, nowIso).run();
    if (r && r.ok) out.notices++;
  }

  const state = tripState(rows, today, c);
  out.mode = state.mode;
  let tripKey, checkin;
  if (state.mode === "road") { checkin = state.checkin; tripKey = "road:" + norm(state.city) + ":" + checkin; }
  else {
    const wd = Number(c.ideas_weekday);
    if (state.futureBooked || wd < 0 || (lp.weekday !== wd && !deps.force)) { out.skipped = state.futureBooked ? "trip already booked" : "not the ideas day"; return out; }
    checkin = addDays(today, 7);
    tripKey = "ideas:" + today;
  }
  const exists = await db.prepare("SELECT 1 FROM travel_options WHERE trip_key = ? LIMIT 1").bind(tripKey).first();
  if (exists) { out.skipped = "already proposed " + tripKey; return out; }

  const profile = await many(db, "SELECT label, statement FROM profile WHERE facet IN ('travel','likes','dislikes','logistics') AND (domain IS NULL OR domain IN ('personal','straddle')) AND (status IS NULL OR status IN ('accepted','active')) ORDER BY confidence DESC LIMIT 40");
  const reactions = await many(db, "SELECT reaction, city, kind FROM travel_reactions WHERE ts >= ? ORDER BY ts DESC LIMIT 60", addDays(today, -365));
  const month = new Date(checkin + "T12:00:00Z").toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  const messages = promptFor(state, c, profile, reactions, month);
  let opts = [], model = null;
  for (const m of MODELS) {
    try {
      const r = deps.ai ? await deps.ai(m, { messages, max_tokens: 900, temperature: 0.6 }) : await env.AI.run(m, { messages, max_tokens: 900, temperature: 0.6 });
      opts = rankAndMark(parseOptions(modelText(r)), reactions, state);
      if (opts.length >= 2) { model = m; break; }
    } catch (e) { console.error(JSON.stringify({ evt: "travel:model-failed", model: m, error: String(e && e.message || e).slice(0, 200) })); }
  }
  if (opts.length < 2) { out.skipped = "no usable options from models"; return out; }
  if (!opts.some((o) => o.pick)) opts[0].pick = 1;

  const key = deps.key !== undefined ? deps.key : signingKey(env);
  const links = [];
  for (const [i, o] of opts.entries()) {
    o.id = optionId();
    o.nights = o.nights || Number(c.nights) || 2;
    o.link = bookingLink({ city: o.city, country: o.country, checkin, nights: o.nights, maxPerNight: c.max_per_night, currency: c.currency });
    links[i] = key ? BASE + "/travel/o/" + o.id + "?s=" + encodeURIComponent(await sign(key, o.id)) : null;
  }
  const mail = mailFor(state, opts, links, c);
  if (deps.dry) { out.preview = { trip_key: tripKey, model, subject: mail.subject, body: mail.body }; return out; }
  for (const [i, o] of opts.entries()) {
    await db.prepare("INSERT INTO travel_options (id, trip_key, rank, pick, mode, city, country, kind, checkin, nights, est_per_night, currency, why, link, model, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?) ON CONFLICT(trip_key, rank) DO NOTHING")
      .bind(o.id, tripKey, i + 1, o.pick, state.mode, o.city, o.country || null, o.kind || null, checkin, o.nights, o.est_per_night, c.currency, o.why || null, o.link, model, nowIso).run();
  }
  const sent = await send(mail.subject, mail.body);
  if (!sent || !sent.ok) {
    // undelivered: remove the rows so the next tick proposes again instead of holding a proposal nobody saw
    await db.prepare("DELETE FROM travel_options WHERE trip_key = ? AND status = 'proposed'").bind(tripKey).run();
    out.error = "send failed: " + String(sent && sent.error || "unknown").slice(0, 200);
    return out;
  }
  out.proposed = opts.length;
  out.trip_key = tripKey;
  return out;
}

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

function page(title, inner, status) {
  const html = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex\"><title>" + esc(title) + "</title>" +
    "<style>body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a;background:#fff}a{color:#0b57d0}button{font:inherit;padding:.6rem 1rem;margin:.25rem .5rem .25rem 0;border-radius:.5rem;border:1px solid #888;background:#f4f4f4;cursor:pointer}.pick{background:#0b57d0;color:#fff;border-color:#0b57d0}.muted{color:#555}@media(prefers-color-scheme:dark){body{background:#121212;color:#eee}a{color:#8ab4f8}button{background:#222;color:#eee}.muted{color:#aaa}}</style></head><body>" + inner + "</body></html>";
  return new Response(html, { status: status || 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" } });
}

function bearerOk(request, env) {
  const key = env.COMPANION_KEY || "";
  if (!key) return false;
  const u = new URL(request.url);
  const h = request.headers.get("Authorization") || "";
  const got = h.startsWith("Bearer ") ? h.slice(7) : (u.searchParams.get("k") || "");
  const a = new TextEncoder().encode(got), b = new TextEncoder().encode(key);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

const jsonRes = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// Routes: GET /travel/o/:id?s= (show), POST /travel/o/:id?s= with action=pick|no (change);
// GET /api/travel (COMPANION_KEY bearer): config, open options, recent reactions; POST /api/travel/run[?dry=1&force=1].
export async function handleTravel(request, env, deps = {}) {
  const u = new URL(request.url);
  const p = u.pathname;
  if (!p.startsWith("/travel/") && p !== "/api/travel" && p !== "/api/travel/run") return null;
  const db = env.PERSONAL;
  if (!db) return jsonRes({ ok: false, error: "no PERSONAL binding" }, 503);
  await ensureTravel(db);

  if (p === "/api/travel" || p === "/api/travel/run") {
    if (!bearerOk(request, env)) return jsonRes({ ok: false, error: "unauthorized" }, 401);
    if (p === "/api/travel/run") {
      if (request.method !== "POST") return jsonRes({ ok: false, error: "POST only" }, 405);
      const r = await travelTick(env, { ...deps, dry: u.searchParams.get("dry") === "1", force: u.searchParams.get("force") === "1" });
      return jsonRes({ ok: true, result: r });
    }
    const options = await many(db, "SELECT id, trip_key, rank, pick, mode, city, country, kind, checkin, nights, est_per_night, currency, why, link, status, created_at, decided_at FROM travel_options ORDER BY created_at DESC, rank LIMIT 30");
    const reactions = await many(db, "SELECT option_id, trip_key, reaction, city, kind, ts FROM travel_reactions ORDER BY id DESC LIMIT 30");
    return jsonRes({ ok: true, config: await cfg(db), options, reactions });
  }

  const m = /^\/travel\/o\/(tr_[0-9a-f]{18})$/.exec(p);
  if (!m) return page("Not found", "<p>Not found.</p>", 404);
  const id = m[1];
  const key = deps.key !== undefined ? deps.key : signingKey(env);
  if (!(await verify(key, id, u.searchParams.get("s")))) return page("Link not valid", "<p>This link is not valid.</p>", 403);
  const o = await db.prepare("SELECT * FROM travel_options WHERE id = ?").bind(id).first();
  if (!o) return page("Not found", "<p>That suggestion is gone.</p>", 404);
  const nowIso = new Date(deps.now || Date.now()).toISOString();

  if (request.method === "POST") {
    let action = u.searchParams.get("action") || "";
    const ct = request.headers.get("Content-Type") || "";
    if (!action && ct.includes("application/x-www-form-urlencoded")) action = String((await request.formData()).get("action") || "");
    if (action !== "pick" && action !== "no") return page("Unknown action", "<p>Unknown action.</p>", 400);
    const open = o.status === "proposed" || o.status === "picked";
    if (open) {
      if (action === "pick") {
        await db.prepare("UPDATE travel_options SET status = CASE WHEN id = ? THEN 'picked' ELSE 'proposed' END, decided_at = CASE WHEN id = ? THEN ? ELSE decided_at END WHERE trip_key = ? AND status IN ('proposed','picked')").bind(id, id, nowIso, o.trip_key).run();
      } else {
        await db.prepare("UPDATE travel_options SET status = 'rejected', decided_at = ? WHERE id = ?").bind(nowIso, id).run();
      }
      await db.prepare("INSERT INTO travel_reactions (option_id, trip_key, reaction, city, kind, ts) VALUES (?, ?, ?, ?, ?, ?)").bind(id, o.trip_key, action, o.city, o.kind || null, nowIso).run();
    }
    const body = action === "pick"
      ? "<h1>" + esc(o.city) + " it is</h1><p>Nothing has been booked. When you're ready:</p><p><a href=\"" + esc(o.link) + "\">Stays in " + esc(o.city) + " from " + esc(o.checkin) + "</a></p><p class=\"muted\">Once the booking confirmation reaches your inbox I'll see it and stop suggesting other places for those nights.</p>"
      : "<h1>Noted</h1><p>I won't suggest " + esc(o.city) + " again.</p>";
    return page(o.city, (open ? "" : "<p class=\"muted\">This suggestion was already closed (" + esc(o.status) + "); nothing changed.</p>") + body);
  }

  const action = (a, label, cls) => "<form method=\"post\" style=\"display:inline\"><input type=\"hidden\" name=\"action\" value=\"" + a + "\"><button class=\"" + cls + "\">" + label + "</button></form>";
  return page(o.city,
    "<h1>" + esc(o.city) + (o.country ? ", " + esc(o.country) : "") + (o.pick ? " ★" : "") + "</h1>" +
    "<p>" + esc(o.nights) + " night" + (o.nights == 1 ? "" : "s") + " from " + esc(o.checkin) + (o.kind ? " · " + esc(o.kind) : "") + (o.est_per_night ? " · about " + esc(o.est_per_night) + " " + esc(o.currency || "") + "/night" : "") + "</p>" +
    (o.why ? "<p>" + esc(o.why) + "</p>" : "") +
    "<p><a href=\"" + esc(o.link) + "\">See stays</a></p>" +
    (o.status === "proposed" || o.status === "picked" ? action("pick", "This one", "pick") + action("no", "Not for me", "") : "<p class=\"muted\">Closed: " + esc(o.status) + "</p>"));
}
