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
   )`,
  // TRAVEL-CHAT-1: the conversation, and a signing secret kept out of travel_config (which /api/travel returns).
  `CREATE TABLE IF NOT EXISTS travel_chat (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     role TEXT NOT NULL CHECK (role IN ('user','assistant')),
     content TEXT NOT NULL,
     meta TEXT,
     ts TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS travel_logins (
     id TEXT PRIMARY KEY,
     code_mac TEXT NOT NULL,
     exp INTEGER NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0,
     used INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS travel_secrets (
     k TEXT PRIMARY KEY,
     v TEXT NOT NULL
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
  tz: "Europe/Amsterdam",
  // TRAVEL-CHAT-1: chat models in order of preference (any Workers AI text model; first one that answers wins). The page's
  // model menu rewrites this row; a row edited in D1 wins too.
  chat_models: "@cf/openai/gpt-oss-120b,@cf/zai-org/glm-5.3,@cf/moonshotai/kimi-k2.6",
  // Cloudflare Access: when both are set, a valid Cf-Access-Jwt-Assertion for this team and audience signs the owner in.
  access_team: "",
  access_aud: ""
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

// One hourly step. deps: { now (ms), ai(model, input) -> result (required for proposals), send(subject, body) -> {ok}, key }
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
  // the caller passes its attributed model runner (aiRunAttr in worker.js); this module never calls the AI binding itself
  if (typeof deps.ai !== "function") { out.skipped = "no model caller"; return out; }
  for (const m of MODELS) {
    try {
      const r = await deps.ai(m, { messages, max_tokens: 900, temperature: 0.6 });
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

// Record a pick or a not-for-me on one option (shared by the mailed option page and the chat page).
export async function applyReaction(db, o, action, nowIso) {
  const open = o.status === "proposed" || o.status === "picked";
  if (!open) return false;
  if (action === "pick") {
    await db.prepare("UPDATE travel_options SET status = CASE WHEN id = ? THEN 'picked' ELSE 'proposed' END, decided_at = CASE WHEN id = ? THEN ? ELSE decided_at END WHERE trip_key = ? AND status IN ('proposed','picked')").bind(o.id, o.id, nowIso, o.trip_key).run();
  } else {
    await db.prepare("UPDATE travel_options SET status = 'rejected', decided_at = ? WHERE id = ?").bind(nowIso, o.id).run();
  }
  await db.prepare("INSERT INTO travel_reactions (option_id, trip_key, reaction, city, kind, ts) VALUES (?, ?, ?, ?, ?, ?)").bind(o.id, o.trip_key, action, o.city, o.kind || null, nowIso).run();
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// TRAVEL-CHAT-1 (2026-10-19, owner request: "something that really is interactive and personalized", "not locked in to
// Claude"). A chat page at /travel on the companion's own host. Each turn the model sees what the fleet knows (stays and
// flights in personal-life.events, profile facets travel/likes/dislikes/logistics, past picks and rejections, the last
// turns of the conversation) and answers with JSON: a short reply, 0-3 concrete options with one pick, at most one
// question with tap answers, and what it learned. Learned preferences are written to personal-life.profile (facet travel,
// ids travel:chat-*), so the hourly planner and every later turn use them. Models are Workers AI ids in travel_config
// chat_models (swappable from the page). Sign-in: Cloudflare Access when access_team/access_aud are set, the companion's
// own key cookie, or a 6-digit code (and one-tap link) mailed to the owner; no key for the owner to keep. A signed-in
// device stays signed in (120 days, renewed on use). Nothing is booked or paid.

export const SESSION_DAYS = 120;          // a signed-in device stays signed in; each visit in the last 60 days renews it
export const CODE_TRIES = 5;               // wrong guesses allowed per mailed code
export const LOGIN_TTL_MIN = 20;
export const LOGIN_MAILS_PER_HOUR = 4;
export const CHAT_MODEL_MENU = ["@cf/openai/gpt-oss-120b", "@cf/zai-org/glm-5.3", "@cf/moonshotai/kimi-k2.6"];

// The signing secret: a worker secret when one is set, else a random one generated once and kept in D1.
export async function authKey(env, db) {
  const k = signingKey(env);
  if (k) return k;
  const r = await db.prepare("SELECT v FROM travel_secrets WHERE k = 'session'").first();
  if (r && r.v) return r.v;
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  await db.prepare("INSERT OR IGNORE INTO travel_secrets (k, v) VALUES ('session', ?)").bind(b64u(b)).run();
  const again = await db.prepare("SELECT v FROM travel_secrets WHERE k = 'session'").first();
  return again && again.v || "";
}

export async function makeToken(key, kind, expSec) { return expSec + "." + await sign(key, kind + ":" + expSec); }
export async function tokenOk(key, kind, tok, nowMs) {
  const m = /^(\d{9,11})\.([A-Za-z0-9_-]{20,})$/.exec(String(tok || ""));
  if (!m || Number(m[1]) * 1000 < nowMs) return false;
  return verify(key, kind + ":" + m[1], m[2]);
}

function cookie(request, name) {
  for (const part of String(request.headers.get("Cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

function sameString(a, b) {
  const x = new TextEncoder().encode(String(a || "")), y = new TextEncoder().encode(String(b || ""));
  if (!x.length || x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

const b64json = (s) => JSON.parse(new TextDecoder().decode(unb64u(s)));

// Cloudflare Access: verify the RS256 JWT Access puts in Cf-Access-Jwt-Assertion against the team's published keys.
// deps.accessCerts(team) returns the JSON of https://<team>.cloudflareaccess.com/cdn-cgi/access/certs (the worker fetches it).
export async function accessOk(request, c, deps, nowMs) {
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion") || "";
  if (!jwt || !c.access_team || !c.access_aud || typeof deps.accessCerts !== "function") return false;
  try {
    const [h, p, s] = jwt.split(".");
    if (!s) return false;
    const header = b64json(h), payload = b64json(p);
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (header.alg !== "RS256" || !aud.includes(c.access_aud) || !(Number(payload.exp) * 1000 > nowMs)) return false;
    if (payload.iss !== "https://" + c.access_team + ".cloudflareaccess.com") return false;
    const certs = await deps.accessCerts(c.access_team);
    const jwk = (certs && certs.keys || []).find((k) => k.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, unb64u(s), new TextEncoder().encode(h + "." + p));
  } catch (e) { return false; }
}

export async function chatAuthed(request, env, db, c, deps, nowMs) {
  if (bearerOk(request, env)) return "bearer";
  if (env.COMPANION_KEY && sameString(cookie(request, "pc_key"), env.COMPANION_KEY)) return "companion-key";
  const key = deps.key !== undefined ? deps.key : await authKey(env, db);
  if (key && await tokenOk(key, "sess", cookie(request, "trv"), nowMs)) return "session";
  if (await accessOk(request, c, deps, nowMs)) return "access";
  return "";
}

// First JSON object or array in a model reply (bare, fenced, or inside prose).
export function firstJson(text) {
  const s = String(text || "");
  const tries = [s, (s.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1], (s.match(/\{[\s\S]*\}/) || [])[0]];
  for (const t of tries) { if (!t) continue; try { return JSON.parse(t); } catch (e) { /* next shape */ } }
  return null;
}

const clean = (v, n) => String(v == null ? "" : v).replace(/[\r\n<>]+/g, " ").trim().slice(0, n);

export function parseChat(text, today) {
  const j = firstJson(text);
  if (!j || typeof j !== "object" || Array.isArray(j)) {
    // a model that ignored the format still gets its words shown, as long as it is not raw JSON
    const t = String(text || "").trim();
    return { reply: /^[[{]/.test(t) ? "" : t.slice(0, 4000), options: [], question: null, learned: [] };
  }
  const reply = String(j.reply || "").replace(/<[^>]*>/g, "").trim().slice(0, 4000);
  const options = parseOptions(JSON.stringify({ options: Array.isArray(j.options) ? j.options : [] }));
  const done = new Set();
  (Array.isArray(j.options) ? j.options : []).forEach((o) => {
    const hit = options.find((x) => norm(x.city) === norm(o && o.city));
    if (!hit || done.has(hit)) return;
    done.add(hit);
    hit.pick = o.pick === true || o.pick === 1 ? 1 : 0;
    const ci = String(o.checkin || "");
    hit.checkin = /^\d{4}-\d{2}-\d{2}$/.test(ci) && (!today || ci >= today) ? ci : "";
  });
  if (options.length && !options.some((o) => o.pick)) options[0].pick = 1;
  if (options.filter((o) => o.pick).length > 1) options.forEach((o, i) => { o.pick = i === options.findIndex((x) => x.pick) ? 1 : 0; });
  let question = null;
  if (j.question && typeof j.question === "object" && clean(j.question.text, 200)) {
    const choices = (Array.isArray(j.question.choices) ? j.question.choices : []).map((x) => clean(x, 60)).filter(Boolean).slice(0, 4);
    question = { text: clean(j.question.text, 200), choices };
  }
  const learned = (Array.isArray(j.learned) ? j.learned : []).map((l) => ({ label: clean(l && l.label, 50), statement: clean(l && l.statement, 240) }))
    .filter((l) => l.label && l.statement).slice(0, 3);
  return { reply, options, question, learned };
}

export const CHAT_SYSTEM = [
  "You are a personal travel planner for one solo traveller who loves the stimulation of travel and hates planning it. You talk with them in a chat.",
  "How you work:",
  "- Lead with something concrete. When the next destination or step is open, propose 2 or 3 specific places and mark one as your pick. Never send a list of questions or a questionnaire.",
  "- Use what you know (their profile, past picks and rejections, where they are now, what is booked) and say in one sentence why each option fits them in particular.",
  "- Ask at most one short question per reply, and only when the answer would change the plan (dates, a hard limit). Give it 2 to 4 short answers they can tap.",
  "- When they react (like this, not that, too far, too pricey, more of X), adjust at once and record what you learned as a short preference.",
  "- When they choose a place, plan it: how to get there from where they are, which area to stay in, a short outline for the nights, and what to book first.",
  "- You never book or pay. The app attaches stay-search and transit links to every option.",
  "- Plain, warm, brief English. No emojis. No filler. Short paragraphs or lines starting with '- '.",
  "Reply with JSON only, exactly this shape:",
  "{\"reply\":\"text shown in the chat\",\"options\":[{\"city\":\"\",\"country\":\"\",\"kind\":\"old town|coast|second city|nature|capital|island|mountains\",\"checkin\":\"YYYY-MM-DD or empty\",\"nights\":2,\"est_per_night\":0,\"why\":\"one sentence\",\"pick\":true}],\"question\":{\"text\":\"\",\"choices\":[\"\",\"\"]},\"learned\":[{\"label\":\"two to four words\",\"statement\":\"one sentence about the traveller's preference\"}]}",
  "Use [] when there are no options or nothing was learned, and null when there is no question. Respect every logistics fact (residence, visa rules) in the context."
].join("\n");

export function chatContext(x) {
  const c = x.c;
  const where = x.state.mode === "road"
    ? "On the road: staying in " + x.state.city + (x.state.country ? ", " + x.state.country : "") + ", checks out " + x.state.checkin + " with nothing booked after that."
    : "No open gap detected; home base is " + c.home_city + (c.home_country ? ", " + c.home_country : "") + ".";
  const booked = (x.booked || []).map((b) => "- " + (b.city || b.title) + (b.country ? ", " + b.country : "") + ": " + b.start_date + " to " + b.end_date).join("\n");
  const facts = (x.profile || []).map((r) => "- " + String(r.label || "") + ": " + String(r.statement || "")).join("\n").slice(0, 4000);
  const picked = (x.reactions || []).filter((r) => r.reaction === "pick" || r.reaction === "booked").slice(0, 12).map((r) => r.city + (r.kind ? " (" + r.kind + ")" : "")).join(", ");
  const rejected = (x.reactions || []).filter((r) => r.reaction === "no").slice(0, 20).map((r) => r.city).join(", ");
  return [
    "Context (from their bookings and stored profile; use it, do not recite it):",
    "Today: " + x.today + ".",
    where,
    "Booked ahead:\n" + (booked || "- nothing"),
    "Default lodging budget: up to " + c.max_per_night + " " + c.currency + " per night; default stay " + c.nights + " nights per stop.",
    "Profile:\n" + (facts || "- (nothing stored yet)"),
    "Stayed in recently: " + ((x.state.recent || []).join(", ") || "none"),
    "Picked or booked before: " + (picked || "none"),
    "Turned down before: " + (rejected || "none")
  ].join("\n\n");
}

export function historyText(row) {
  let t = String(row.content || "");
  if (row.role !== "assistant" || !row.meta) return t;
  try {
    const m = JSON.parse(row.meta);
    if (m.options && m.options.length) t += "\n[Options shown: " + m.options.map((o) => o.city + (o.pick ? " (my pick)" : "") + (o.status && o.status !== "proposed" ? " - " + o.status : "")).join(", ") + "]";
    if (m.question && m.question.text) t += "\n[Asked: " + m.question.text + "]";
  } catch (e) { /* plain text */ }
  return t;
}

export const OPEN_TURN = "(The traveller just opened the planner. Greet them in one short line, then lead with your best proposal for what comes next, given where they are and what is booked.)";

export function chatPrompt(x) {
  const msgs = [{ role: "system", content: CHAT_SYSTEM + "\n\n" + chatContext(x) }];
  for (const h of x.history || []) msgs.push({ role: h.role, content: historyText(h).slice(0, 3000) });
  msgs.push({ role: "user", content: x.text || OPEN_TURN });
  return msgs;
}

export function chatModels(c, allow) {
  const list = String(c.chat_models || DEFAULTS.chat_models).split(",").map((s) => s.trim()).filter((m) => /^@cf\/[\w.\-/]+$/.test(m));
  const ok = typeof allow === "function" ? list.filter((m) => allow(m)) : list;
  return ok.length ? ok : CHAT_MODEL_MENU.slice();
}

const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

async function chatContextRows(db, today) {
  const rows = await many(db, "SELECT id, category, title, city, country, start_date, end_date, booking_ref FROM events WHERE category IN ('lodging','travel') AND (end_date >= ? OR start_date >= ?)", addDays(today, -60), addDays(today, -60));
  let profile = [];
  try { profile = await many(db, "SELECT id, facet, label, statement FROM profile WHERE facet IN ('travel','likes','dislikes','logistics') AND (domain IS NULL OR domain IN ('personal','straddle')) AND (status IS NULL OR status IN ('accepted','active')) ORDER BY CASE facet WHEN 'travel' THEN 0 ELSE 1 END, confidence DESC LIMIT 60"); }
  catch (e) { console.error(JSON.stringify({ evt: "travel-chat:profile-read", error: String(e && e.message || e).slice(0, 200) })); }
  const reactions = await many(db, "SELECT reaction, city, kind FROM travel_reactions WHERE ts >= ? ORDER BY ts DESC LIMIT 60", addDays(today, -365));
  return { rows, profile, reactions };
}

// One chat turn. input: { text } or { open: true }. deps: { ai(model, input), now, modelAllowed(model) }.
export async function chatTurn(env, deps, input) {
  const db = env.PERSONAL;
  const nowMs = deps.now || Date.now();
  const nowIso = new Date(nowMs).toISOString();
  await ensureTravel(db, nowIso);
  const c = await cfg(db);
  const today = localParts(nowMs, c.tz).day;
  const text = String(input && input.text || "").trim().slice(0, 2000);
  if (!text && !(input && input.open)) return { ok: false, error: "Say something first." };
  if (typeof deps.ai !== "function") return { ok: false, error: "no model caller" };
  const { rows, profile, reactions } = await chatContextRows(db, today);
  const state = tripState(rows, today, c);
  const booked = rows.filter((r) => r.category === "lodging" && r.end_date >= today).sort((a, b) => (a.start_date < b.start_date ? -1 : 1)).slice(0, 8);
  const history = (await many(db, "SELECT role, content, meta FROM travel_chat ORDER BY id DESC LIMIT 16")).reverse();
  const messages = chatPrompt({ c, today, state, booked, profile, reactions, history, text });
  let parsed = null, model = null, lastErr = "";
  for (const m of chatModels(c, deps.modelAllowed)) {
    try {
      const r = await deps.ai(m, { messages, max_tokens: 2000, temperature: 0.7 });
      const pc = parseChat(modelText(r), today);
      if (pc.reply || pc.options.length) { parsed = pc; model = m; break; }
      lastErr = m + " gave an empty answer";
    } catch (e) {
      lastErr = m + ": " + String(e && e.message || e).slice(0, 160);
      console.error(JSON.stringify({ evt: "travel-chat:model-failed", model: m, error: lastErr }));
    }
  }
  if (!parsed) return { ok: false, error: "No model answered (" + lastErr + "). Send it again, or pick another model under Settings." };

  if (text) await db.prepare("INSERT INTO travel_chat (role, content, ts) VALUES ('user', ?, ?)").bind(text, nowIso).run();
  const from = state.mode === "road" ? [state.city, state.country].filter(Boolean).join(", ") : [c.home_city, c.home_country].filter(Boolean).join(", ");
  const tripKey = "chat:" + nowIso;
  const options = [];
  for (const [i, o] of parsed.options.entries()) {
    const checkin = o.checkin || (state.mode === "road" ? state.checkin : addDays(today, 7));
    const nights = o.nights || Number(c.nights) || 2;
    const opt = { id: optionId(), city: o.city, country: o.country, kind: o.kind, checkin, nights, est_per_night: o.est_per_night, why: o.why, pick: o.pick, status: "proposed",
      link: bookingLink({ city: o.city, country: o.country, checkin, nights, maxPerNight: c.max_per_night, currency: c.currency }),
      transit: transitLink(from, [o.city, o.country].filter(Boolean).join(", ")) };
    await db.prepare("INSERT INTO travel_options (id, trip_key, rank, pick, mode, city, country, kind, checkin, nights, est_per_night, currency, why, link, model, status, created_at) VALUES (?, ?, ?, ?, 'chat', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?) ON CONFLICT(trip_key, rank) DO NOTHING")
      .bind(opt.id, tripKey, i + 1, opt.pick, opt.city, opt.country || null, opt.kind || null, checkin, nights, opt.est_per_night, c.currency, opt.why || null, opt.link, model, nowIso).run();
    options.push(opt);
  }
  const learned = [];
  for (const l of parsed.learned) {
    const id = "travel:chat-" + (slug(l.label) || "note");
    try {
      await db.prepare("INSERT INTO profile (id, facet, label, statement, evidence, confidence, updated_at, domain, status) VALUES (?, 'travel', ?, ?, ?, 0.7, ?, 'personal', 'active') ON CONFLICT(id) DO UPDATE SET statement = excluded.statement, evidence = excluded.evidence, updated_at = excluded.updated_at, status = 'active', confidence = MIN(0.95, profile.confidence + 0.05)")
        .bind(id, l.label, l.statement, "travel chat " + today + (text ? ": \"" + text.slice(0, 160) + "\"" : ""), nowIso).run();
      learned.push({ id, label: l.label, statement: l.statement });
    } catch (e) { console.error(JSON.stringify({ evt: "travel-chat:learn-failed", error: String(e && e.message || e).slice(0, 200) })); }
  }
  const meta = { options, question: parsed.question, learned, model };
  const ins = await db.prepare("INSERT INTO travel_chat (role, content, meta, ts) VALUES ('assistant', ?, ?, ?)").bind(parsed.reply, JSON.stringify(meta), nowIso).run();
  return { ok: true, message: { id: ins && ins.meta && ins.meta.last_row_id || null, role: "assistant", content: parsed.reply, meta, ts: nowIso } };
}

// Chat history for the page, with each option's live status (picked, rejected, booked) folded back in.
export async function chatState(db, c, nowMs) {
  const today = localParts(nowMs, c.tz).day;
  const hist = (await many(db, "SELECT id, role, content, meta, ts FROM travel_chat ORDER BY id DESC LIMIT 60")).reverse();
  const ids = [];
  for (const h of hist) { try { h.meta = h.meta ? JSON.parse(h.meta) : null; } catch (e) { h.meta = null; } for (const o of (h.meta && h.meta.options) || []) ids.push(o.id); }
  if (ids.length) {
    const st = {};
    for (let i = 0; i < ids.length; i += 50) {
      const part = ids.slice(i, i + 50);
      for (const r of await many(db, "SELECT id, status FROM travel_options WHERE id IN (" + part.map(() => "?").join(",") + ")", ...part)) st[r.id] = r.status;
    }
    for (const h of hist) for (const o of (h.meta && h.meta.options) || []) o.status = st[o.id] || o.status;
  }
  const { rows, profile } = await chatContextRows(db, today);
  const state = tripState(rows, today, c);
  const where = state.mode === "road" ? "In " + state.city + ", checking out " + state.checkin + ", nothing booked after" : (rows.some((r) => r.category === "lodging" && r.end_date >= today) ? "Trip booked ahead" : "Nothing booked");
  return { history: hist, where, models: { current: chatModels(c)[0], menu: CHAT_MODEL_MENU }, known: profile.map((p) => ({ id: p.id, facet: p.facet, label: p.label, statement: p.statement, removable: p.facet === "travel" })) };
}

function chatPage(nonce) {
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\"><meta name=\"robots\" content=\"noindex\"><title>Travel planner</title><style nonce=\"" + nonce + "\">" + CHAT_CSS + "</style></head><body>" + CHAT_BODY + "<script nonce=\"" + nonce + "\">" + CHAT_JS + "</script></body></html>";
}

const CHAT_CSS = ":root{--bg:#f7f6f3;--card:#fff;--ink:#1b1b1b;--muted:#5d5d5d;--line:#dedbd4;--accent:#0b57d0;--accent-ink:#fff;--me:#e6eefc;--warn:#9a3412}" +
  "@media(prefers-color-scheme:dark){:root{--bg:#141414;--card:#1e1e1e;--ink:#ececec;--muted:#a3a3a3;--line:#333;--accent:#8ab4f8;--accent-ink:#0b0b0b;--me:#23314d;--warn:#fdba74}}" +
  "*{box-sizing:border-box}html,body{margin:0;height:100%}body{font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--ink);display:flex;flex-direction:column}" +
  "header{padding:.75rem 1rem;border-bottom:1px solid var(--line);display:flex;gap:.75rem;align-items:baseline;flex-wrap:wrap}header h1{font-size:1.1rem;margin:0}#where{color:var(--muted);font-size:.9rem}" +
  "main{flex:1;overflow-y:auto;padding:1rem;max-width:44rem;width:100%;margin:0 auto}" +
  ".msg{margin:0 0 1rem;max-width:100%}.msg.user{margin-left:auto;background:var(--me);padding:.55rem .85rem;border-radius:1rem 1rem .25rem 1rem;width:fit-content;max-width:85%}" +
  ".msg.assistant .text p{margin:.3rem 0}.msg.assistant .text ul{margin:.3rem 0;padding-left:1.2rem}.err{color:var(--warn)}" +
  ".opts{display:grid;gap:.6rem;margin:.6rem 0}.opt{background:var(--card);border:1px solid var(--line);border-radius:.8rem;padding:.75rem .9rem}.opt.pick{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}" +
  ".opt h3{margin:0;font-size:1.02rem}.opt .meta{color:var(--muted);font-size:.88rem}.opt .why{margin:.35rem 0}.opt .tag{font-size:.75rem;color:var(--accent);font-weight:600;margin-left:.4rem}" +
  ".opt.rejected{opacity:.55}.opt.picked{border-color:var(--accent)}.row{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.45rem;align-items:center}" +
  "button,.btn{font:inherit;font-size:.92rem;padding:.42rem .8rem;border-radius:.6rem;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer;text-decoration:none;display:inline-block}" +
  "button.primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}button:disabled{opacity:.5;cursor:default}a{color:var(--accent)}" +
  ".chips{display:flex;flex-wrap:wrap;gap:.4rem;margin:.4rem 0}.q{margin:.5rem 0 .2rem;font-weight:600}" +
  ".learned{font-size:.85rem;color:var(--muted);margin:.3rem 0}" +
  "footer{border-top:1px solid var(--line);padding:.6rem .75rem calc(.6rem + env(safe-area-inset-bottom));background:var(--bg)}" +
  "form#f{display:flex;gap:.5rem;max-width:44rem;margin:0 auto}textarea{flex:1;font:inherit;padding:.55rem .7rem;border-radius:.7rem;border:1px solid var(--line);background:var(--card);color:var(--ink);resize:none;min-height:2.6rem;max-height:9rem}" +
  "details{max-width:44rem;margin:.4rem auto 0;font-size:.9rem;color:var(--muted)}details li{margin:.2rem 0}select{font:inherit;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:.4rem;padding:.2rem}" +
  ".typing{color:var(--muted);font-style:italic}";

const CHAT_BODY = "<header><h1>Travel planner</h1><span id=\"where\"></span></header><main id=\"log\" aria-live=\"polite\"></main>" +
  "<footer><form id=\"f\"><textarea id=\"t\" rows=\"1\" placeholder=\"Where to, or react to an idea...\" aria-label=\"Message\"></textarea><button class=\"primary\" id=\"send\">Send</button></form>" +
  "<details id=\"settings\"><summary>Settings and what I know</summary><p>Model: <select id=\"model\"></select> <span id=\"modelnote\"></span></p><p>What I use to plan (remove anything wrong):</p><ul id=\"known\"></ul>" +
  "<p><button id=\"fresh\" type=\"button\">Start a fresh conversation</button> <button id=\"out\" type=\"button\">Sign out</button></p></details></footer>";

const CHAT_JS = String.raw`
const $ = (s) => document.querySelector(s);
const log = $("#log"), ta = $("#t"), sendBtn = $("#send");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function md(t) {
  const out = []; let list = false;
  for (const raw of String(t || "").split(/\n/)) {
    const line = esc(raw).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    if (/^\s*[-*] /.test(raw)) { if (!list) { out.push("<ul>"); list = true; } out.push("<li>" + line.replace(/^\s*[-*] /, "") + "</li>"); continue; }
    if (list) { out.push("</ul>"); list = false; }
    if (line.trim()) out.push("<p>" + line + "</p>");
  }
  if (list) out.push("</ul>");
  return out.join("");
}
async function api(path, body) {
  const r = await fetch(path, body === undefined ? { credentials: "same-origin" } : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.status === 401) { location.reload(); throw new Error("signed out"); }
  return r.json();
}
function scrollEnd() { log.scrollTop = log.scrollHeight; }
function chips(list, onPick) {
  const d = document.createElement("div"); d.className = "chips";
  for (const c of list) { const b = document.createElement("button"); b.type = "button"; b.textContent = c; b.onclick = () => { d.querySelectorAll("button").forEach((x) => x.disabled = true); onPick(c); }; d.appendChild(b); }
  return d;
}
function optCard(o) {
  const d = document.createElement("div");
  d.className = "opt" + (o.pick ? " pick" : "") + (o.status ? " " + o.status : "");
  const nights = o.nights ? o.nights + " night" + (o.nights == 1 ? "" : "s") : "";
  d.innerHTML = "<h3>" + esc(o.city) + (o.country ? ", " + esc(o.country) : "") + (o.pick ? "<span class=tag>MY PICK</span>" : "") + "</h3>" +
    "<div class=meta>" + [nights, o.checkin ? "from " + esc(o.checkin) : "", esc(o.kind || ""), o.est_per_night ? "about " + esc(o.est_per_night) + "/night" : ""].filter(Boolean).join(" · ") + "</div>" +
    (o.why ? "<div class=why>" + esc(o.why) + "</div>" : "");
  const row = document.createElement("div"); row.className = "row";
  const open = !o.status || o.status === "proposed";
  if (open) {
    const yes = document.createElement("button"); yes.className = "primary"; yes.type = "button"; yes.textContent = "This one";
    const no = document.createElement("button"); no.type = "button"; no.textContent = "Not for me";
    yes.onclick = async () => { yes.disabled = no.disabled = true; await api("/travel/api/react", { id: o.id, action: "pick" }); d.classList.add("picked"); send("I'll take " + o.city + ". Plan it."); };
    no.onclick = async () => {
      yes.disabled = no.disabled = true; await api("/travel/api/react", { id: o.id, action: "no" }); d.classList.add("rejected");
      d.appendChild(chips(["Too far", "Too pricey", "Been there", "Not my vibe", "Show me something else"], (c) => send(c === "Show me something else" ? "Not " + o.city + ". Show me something else." : "Not " + o.city + ": " + c.toLowerCase() + ".")));
      scrollEnd();
    };
    row.append(yes, no);
  } else {
    const s = document.createElement("span"); s.className = "meta"; s.textContent = o.status === "picked" ? "Chosen" : o.status === "rejected" ? "Skipped" : o.status; row.append(s);
  }
  const stays = document.createElement("a"); stays.className = "btn"; stays.href = o.link; stays.target = "_blank"; stays.rel = "noopener noreferrer"; stays.textContent = "Stays";
  row.append(stays);
  if (o.transit) { const tr = document.createElement("a"); tr.className = "btn"; tr.href = o.transit; tr.target = "_blank"; tr.rel = "noopener noreferrer"; tr.textContent = "Getting there"; row.append(tr); }
  d.appendChild(row);
  return d;
}
function render(m, last) {
  const d = document.createElement("div"); d.className = "msg " + m.role;
  if (m.role === "user") { d.textContent = m.content; log.appendChild(d); return; }
  const tx = document.createElement("div"); tx.className = "text"; tx.innerHTML = md(m.content); d.appendChild(tx);
  const meta = m.meta || {};
  if (meta.options && meta.options.length) { const g = document.createElement("div"); g.className = "opts"; meta.options.forEach((o) => g.appendChild(optCard(o))); d.appendChild(g); }
  if (meta.learned && meta.learned.length) { const l = document.createElement("div"); l.className = "learned"; l.textContent = "Noted for next time: " + meta.learned.map((x) => x.statement).join(" "); d.appendChild(l); }
  if (meta.question && meta.question.text && last) {
    const q = document.createElement("div"); q.className = "q"; q.textContent = meta.question.text; d.appendChild(q);
    if (meta.question.choices && meta.question.choices.length) d.appendChild(chips(meta.question.choices, (c) => send(c)));
  }
  log.appendChild(d);
}
let busy = false;
async function send(text, open) {
  if (busy) return; busy = true; sendBtn.disabled = true;
  if (text) render({ role: "user", content: text });
  const t = document.createElement("div"); t.className = "msg typing"; t.textContent = "Thinking..."; log.appendChild(t); scrollEnd();
  try {
    const r = await api("/travel/api/chat", open ? { open: true } : { text });
    t.remove();
    if (r.ok) { render(r.message, true); loadKnown(); }
    else { const e = document.createElement("div"); e.className = "msg err"; e.textContent = r.error || "Something went wrong."; log.appendChild(e); }
  } catch (e) { t.remove(); const er = document.createElement("div"); er.className = "msg err"; er.textContent = "Could not reach the planner: " + e.message; log.appendChild(er); }
  busy = false; sendBtn.disabled = false; scrollEnd();
}
function showKnown(k) {
  const ul = $("#known"); ul.innerHTML = "";
  for (const p of k) {
    const li = document.createElement("li"); li.innerHTML = "<strong>" + esc(p.label) + "</strong>: " + esc(p.statement) + " ";
    if (p.removable) { const b = document.createElement("button"); b.type = "button"; b.textContent = "Forget"; b.onclick = async () => { await api("/travel/api/forget", { id: p.id }); li.remove(); }; li.appendChild(b); }
    ul.appendChild(li);
  }
}
async function loadKnown() { try { const s = await api("/travel/api/state?known=1"); showKnown(s.known || []); } catch (e) { console.warn("known list", e); } }
async function boot() {
  const s = await api("/travel/api/state");
  $("#where").textContent = s.where || "";
  const sel = $("#model");
  for (const m of s.models.menu.concat(s.models.menu.includes(s.models.current) ? [] : [s.models.current])) { const o = document.createElement("option"); o.value = m; o.textContent = m.replace(/^@cf\//, ""); if (m === s.models.current) o.selected = true; sel.appendChild(o); }
  sel.onchange = async () => { const r = await api("/travel/api/model", { model: sel.value }); $("#modelnote").textContent = r.ok ? "saved" : (r.error || "not saved"); };
  showKnown(s.known || []);
  const h = s.history || [];
  h.forEach((m, i) => render(m, i === h.length - 1));
  scrollEnd();
  const last = h[h.length - 1];
  if (!last || Date.now() - Date.parse(last.ts) > 12 * 3600e3) send("", true);
}
$("#f").onsubmit = (e) => { e.preventDefault(); const v = ta.value.trim(); if (!v) return; ta.value = ""; send(v); };
ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#f").requestSubmit(); } });
$("#fresh").onclick = async () => { await api("/travel/api/reset", {}); log.innerHTML = ""; send("", true); };
$("#out").onclick = async () => { await api("/travel/api/logout", {}); location.reload(); };
boot().catch((e) => { log.textContent = "Could not load: " + e.message; });
`;

function htmlRes(body, status, extra) {
  const h = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY", ...(extra || {}) };
  return new Response(body, { status: status || 200, headers: h });
}

function signInPage(msg) {
  return page("Travel planner", "<h1>Travel planner</h1>" + (msg ? "<p>" + msg + "</p>" : "") +
    "<form method=\"post\" action=\"/travel/login\"><button class=\"pick\">Email me a code</button></form>" +
    "<p class=\"muted\">A 6-digit code goes to your own inbox. Type it in once and this device stays signed in.</p>", 401);
}

function codePage(msg, status) {
  return page("Enter your code", "<h1>Check your inbox</h1>" + (msg ? "<p>" + msg + "</p>" : "<p>Type the 6-digit code from the email, or tap the link in it.</p>") +
    "<form method=\"post\" action=\"/travel/code\"><input name=\"code\" inputmode=\"numeric\" autocomplete=\"one-time-code\" pattern=\"[0-9 ]{6,7}\" maxlength=\"7\" required autofocus style=\"font:inherit;font-size:1.6rem;letter-spacing:.3rem;width:9rem;padding:.3rem .5rem\"> <button class=\"pick\">Sign in</button></form>" +
    "<form method=\"post\" action=\"/travel/login\"><button>Send a new code</button></form>", status || 200);
}

const codeMac = (key, id, code) => sign(key, "code:" + id + ":" + code);

function signedIn(origin, key, nowMs) {
  return makeToken(key, "sess", Math.floor(nowMs / 1000) + SESSION_DAYS * 86400).then((sess) =>
    new Response(null, { status: 303, headers: { Location: origin + "/travel", "Set-Cookie": sessionCookie(sess, SESSION_DAYS * 86400), "Cache-Control": "no-store" } }));
}

const sessionCookie = (v, maxAge) => "trv=" + v + "; Path=/travel; Max-Age=" + maxAge + "; HttpOnly; Secure; SameSite=Lax";

// Routes: GET /travel (chat page or sign-in), POST /travel/login (mails a code), POST /travel/code, GET+POST /travel/auth?i=&t=, POST /travel/api/{chat,react,
// forget,model,reset,logout}, GET /travel/api/state; GET+POST /travel/o/:id?s= (mailed option pages);
// GET /api/travel and POST /api/travel/run (COMPANION_KEY bearer).
export async function handleTravel(request, env, deps = {}) {
  const u = new URL(request.url);
  const p = u.pathname;
  if (p !== "/travel" && !p.startsWith("/travel/") && p !== "/api/travel" && p !== "/api/travel/run") return null;
  const db = env.PERSONAL;
  if (!db) return jsonRes({ ok: false, error: "no PERSONAL binding" }, 503);
  await ensureTravel(db);
  const nowMs = deps.now || Date.now();
  const nowIso = new Date(nowMs).toISOString();

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

  const om = /^\/travel\/o\/(tr_[0-9a-f]{18})$/.exec(p);
  if (om) return optionPage(request, env, deps, db, u, om[1], nowIso);

  const c = await cfg(db);
  // Sign-in by mailed link. Asking for a link only ever mails the owner; it is capped per hour.
  if (p === "/travel/login") {
    if (request.method !== "POST") return Response.redirect(u.origin + "/travel", 303);
    const recent = await db.prepare("SELECT COUNT(*) n FROM travel_logins WHERE created_at >= ?").bind(new Date(nowMs - 3600e3).toISOString()).first();
    if (recent && recent.n >= LOGIN_MAILS_PER_HOUR) return codePage("A few codes went out in the last hour already; use the newest one in your inbox.", 429);
    const key = deps.key !== undefined ? deps.key : await authKey(env, db);
    if (!key) return signInPage("Sign-in is not available right now (no signing key).");
    const id = optionId().replace(/^tr_/, "lg_");
    const rnd = new Uint32Array(1);
    crypto.getRandomValues(rnd);
    const code = String(rnd[0] % 1000000).padStart(6, "0");
    const exp = Math.floor(nowMs / 1000) + LOGIN_TTL_MIN * 60;
    await db.prepare("INSERT INTO travel_logins (id, code_mac, exp, created_at) VALUES (?, ?, ?, ?)").bind(id, await codeMac(key, id, code), exp, nowIso).run();
    const tok = await makeToken(key, "login:" + id, exp);
    const send = deps.send || (async () => ({ ok: false, error: "no sender" }));
    const r = await send("Travel planner code: " + code, "Your sign-in code: " + code + "\n\nOr tap: " + u.origin + "/travel/auth?i=" + id + "&t=" + encodeURIComponent(tok) + "\n\nIt works once, for " + LOGIN_TTL_MIN + " minutes. If you did not ask for it, ignore this mail.");
    if (!r || !r.ok) {
      await db.prepare("DELETE FROM travel_logins WHERE id = ?").bind(id).run();
      return signInPage("The email could not be sent (" + esc(String(r && r.error || "unknown").slice(0, 120)) + ").");
    }
    return codePage("");
  }
  if (p === "/travel/code") {
    if (request.method !== "POST") return codePage("");
    const key = deps.key !== undefined ? deps.key : await authKey(env, db);
    let code = "";
    try { code = String((await request.formData()).get("code") || "").replace(/\D/g, ""); } catch (e) { code = ""; }
    const live = await many(db, "SELECT id, code_mac FROM travel_logins WHERE used = 0 AND attempts < ? AND exp > ? ORDER BY created_at DESC LIMIT 5", CODE_TRIES, Math.floor(nowMs / 1000));
    if (!live.length) return signInPage("That code has expired. Get a new one.");
    for (const l of live) {
      if (code.length === 6 && await verify(key, "code:" + l.id + ":" + code, l.code_mac)) {
        const r = await db.prepare("UPDATE travel_logins SET used = 1 WHERE id = ? AND used = 0").bind(l.id).run();
        if (r && r.meta && r.meta.changes) return signedIn(u.origin, key, nowMs);
      }
    }
    await db.prepare("UPDATE travel_logins SET attempts = attempts + 1 WHERE used = 0 AND exp > ?").bind(Math.floor(nowMs / 1000)).run();
    return codePage("That code did not match. Try again, or send a new one.", 401);
  }
  if (p === "/travel/auth") {
    const id = u.searchParams.get("i") || "";
    const tok = u.searchParams.get("t") || "";
    const key = deps.key !== undefined ? deps.key : await authKey(env, db);
    const valid = /^lg_[0-9a-f]{18}$/.test(id) && await tokenOk(key, "login:" + id, tok, nowMs);
    if (!valid) return signInPage("That link has expired. Get a new code.");
    // GET only shows a button: mail scanners follow GET links, so the one-time link is spent only by the POST.
    if (request.method !== "POST") return page("Sign in", "<h1>Travel planner</h1><form method=\"post\"><button class=\"pick\">Sign in on this device</button></form>");
    const r = await db.prepare("UPDATE travel_logins SET used = 1 WHERE id = ? AND used = 0").bind(id).run();
    if (!r || !r.meta || !r.meta.changes) return signInPage("That link was already used. Get a new code.");
    return signedIn(u.origin, key, nowMs);
  }

  const who = await chatAuthed(request, env, db, c, deps, nowMs);
  if (p === "/travel" || p === "/travel/") {
    if (!who) return signInPage("");
    const nb = new Uint8Array(12);
    crypto.getRandomValues(nb);
    const nonce = b64u(nb);
    const extra = {};
    if (who === "session") {
      const m = /^(\d+)\./.exec(cookie(request, "trv"));
      if (m && Number(m[1]) * 1000 - nowMs < 60 * 86400e3) {
        const key = deps.key !== undefined ? deps.key : await authKey(env, db);
        extra["Set-Cookie"] = sessionCookie(await makeToken(key, "sess", Math.floor(nowMs / 1000) + SESSION_DAYS * 86400), SESSION_DAYS * 86400);
      }
    }
    return htmlRes(chatPage(nonce), 200, { ...extra, "Content-Security-Policy": "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'nonce-" + nonce + "'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" });
  }
  if (!p.startsWith("/travel/api/")) return page("Not found", "<p>Not found.</p>", 404);
  if (!who) return jsonRes({ ok: false, error: "unauthorized" }, 401);

  if (p === "/travel/api/state" && request.method === "GET") return jsonRes({ ok: true, ...(await chatState(db, c, nowMs)) });
  if (request.method !== "POST") return jsonRes({ ok: false, error: "POST only" }, 405);
  // Cross-site requests: JSON bodies need a CORS preflight this route never grants, and a foreign Origin is refused outright.
  const origin = request.headers.get("Origin");
  if (origin && origin !== u.origin) return jsonRes({ ok: false, error: "cross-origin request refused" }, 403);
  if (!String(request.headers.get("Content-Type") || "").includes("application/json")) return jsonRes({ ok: false, error: "JSON body required" }, 415);
  let body = {};
  try { body = await request.json(); } catch (e) { return jsonRes({ ok: false, error: "bad JSON" }, 400); }

  if (p === "/travel/api/chat") return jsonRes(await chatTurn(env, deps, { text: body.text, open: body.open === true }));
  if (p === "/travel/api/react") {
    const action = body.action;
    if (action !== "pick" && action !== "no") return jsonRes({ ok: false, error: "action must be pick or no" }, 400);
    const o = await db.prepare("SELECT * FROM travel_options WHERE id = ?").bind(String(body.id || "")).first();
    if (!o) return jsonRes({ ok: false, error: "no such option" }, 404);
    return jsonRes({ ok: true, changed: await applyReaction(db, o, action, nowIso) });
  }
  if (p === "/travel/api/forget") {
    const id = String(body.id || "");
    const r = await db.prepare("UPDATE profile SET status = 'retracted', updated_at = ? WHERE id = ? AND facet = 'travel'").bind(nowIso, id).run();
    return jsonRes({ ok: true, changed: !!(r && r.meta && r.meta.changes) });
  }
  if (p === "/travel/api/model") {
    const m = String(body.model || "");
    const allowed = /^@cf\/[\w.\-/]+$/.test(m) && (typeof deps.modelAllowed !== "function" || deps.modelAllowed(m));
    if (!allowed) return jsonRes({ ok: false, error: "model not allowed here" }, 400);
    const rest = chatModels(c).filter((x) => x !== m);
    await db.prepare("INSERT INTO travel_config (key, value, updated_at) VALUES ('chat_models', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind([m].concat(rest).join(","), nowIso).run();
    return jsonRes({ ok: true, models: [m].concat(rest) });
  }
  if (p === "/travel/api/reset") {
    // a fresh conversation keeps everything learned; the old turns stay in D1 under a marker row so nothing is lost
    await db.prepare("CREATE TABLE IF NOT EXISTS travel_chat_archive AS SELECT * FROM travel_chat WHERE 0").run();
    await db.prepare("INSERT INTO travel_chat_archive SELECT * FROM travel_chat").run();
    await db.prepare("DELETE FROM travel_chat").run();
    return jsonRes({ ok: true });
  }
  if (p === "/travel/api/logout") {
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Set-Cookie": sessionCookie("", 0) } });
  }
  return jsonRes({ ok: false, error: "not found" }, 404);
}

async function optionPage(request, env, deps, db, u, id, nowIso) {
  const key = deps.key !== undefined ? deps.key : signingKey(env);
  if (!(await verify(key, id, u.searchParams.get("s")))) return page("Link not valid", "<p>This link is not valid.</p>", 403);
  const o = await db.prepare("SELECT * FROM travel_options WHERE id = ?").bind(id).first();
  if (!o) return page("Not found", "<p>That suggestion is gone.</p>", 404);

  if (request.method === "POST") {
    let action = u.searchParams.get("action") || "";
    const ct = request.headers.get("Content-Type") || "";
    if (!action && ct.includes("application/x-www-form-urlencoded")) action = String((await request.formData()).get("action") || "");
    if (action !== "pick" && action !== "no") return page("Unknown action", "<p>Unknown action.</p>", 400);
    const open = await applyReaction(db, o, action, nowIso);
    const body = action === "pick"
      ? "<h1>" + esc(o.city) + " it is</h1><p>Nothing has been booked. When you're ready:</p><p><a href=\"" + esc(o.link) + "\">Stays in " + esc(o.city) + " from " + esc(o.checkin) + "</a></p><p class=\"muted\">Once the booking confirmation reaches your inbox I'll see it and stop suggesting other places for those nights. <a href=\"/travel\">Plan it in the chat</a>.</p>"
      : "<h1>Noted</h1><p>I won't suggest " + esc(o.city) + " again. <a href=\"/travel\">See other ideas in the chat</a>.</p>";
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
