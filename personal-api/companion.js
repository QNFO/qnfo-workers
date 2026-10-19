// personal-api/companion.js
// COMPANION-1 (owner request 2026-10-15/16, Personal Companion project): the twin becomes an active companion.
//
// WHY: personal-api already answered questions and personal-companion already ran a small e-mail ask ladder
// (WELLBEING-LOOP-1). Neither captured what was on Rowan's mind, turned it into a next step, kept what he wanted to
// learn, or reached his phone. This module is that layer, built on what exists rather than beside it:
//   * one brain: the PersonalTwinAgent Durable Object instance "companion" ticks every 15 minutes on its own alarm;
//   * one record: the personal-life D1 (tasks, journal, notes, wellbeing_checkins, companion_nudges are reused;
//     cmp_* tables are new), R2 personal-media for audio and photos, Vectorize personal-life for long-term memory;
//   * one budget of attention: every nudge, from this module or the e-mail ladder, is a companion_nudges row, so the
//     daily cap, the minimum gap and the quiet hours in wellbeing_config bind both senders together;
//   * one front door: /companion (a phone page with Web Push), the OpenAI-compatible chat and the MCP tool list.
//
// Design rules (each one is a test in companion.test.mjs):
//   1. Nothing nudges inside quiet hours, above the shared daily cap, or inside the shared minimum gap.
//   2. A low day (mood <= 2, or a two-day drop of 0.75 against the week) gets care, never a task.
//   3. One thing at a time: a nudge names one action, the smallest that fits today's energy.
//   4. Three unanswered asks in a row switch to presence: one line, no ask, then silence for the day.
//   5. A kind that keeps firing without ever landing is retired, using the same v_nudge_loop as the ladder.
//   6. Risk language is answered with the fixed crisis lines from wellbeing_config, never with model text alone.
//   7. Everything stored is listed, exportable and deletable from /companion (privacy view).

export const COMPANION_VERSION = "1.0.0";
export const TZ = "Europe/Amsterdam";
export const CONTEXTS = [
  { name: "@home", hint: "chores, cooking, things in the flat" },
  { name: "@computer", hint: "writing, email, research, admin online" },
  { name: "@phone", hint: "calls and messages" },
  { name: "@errands", hint: "shops, post, pick-ups" },
  { name: "@outside", hint: "walks, movement, fresh air" },
  { name: "@anywhere", hint: "thinking, reading, small things" }
];
export const ENERGY = ["low", "medium", "high"];
export const NUDGE_KINDS = ["cmp-checkin", "cmp-care", "cmp-reflect", "cmp-next", "cmp-review", "cmp-anchor", "cmp-presence"];
// The e-mail ladder's asks are pushed to the phone too, so the two senders read as one companion.
export const LADDER_KINDS = ["checkin", "micro", "body", "contact", "care", "presence"];

// ---------------------------------------------------------------- schema (personal-life D1, idempotent)

export const DDL = [
  `CREATE TABLE IF NOT EXISTS cmp_inbox (
     id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'text', raw_text TEXT,
     media_key TEXT, mime TEXT, status TEXT NOT NULL DEFAULT 'unprocessed', processed_at TEXT,
     result_json TEXT, source TEXT DEFAULT 'companion', attempts INTEGER DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS cmp_inbox_status ON cmp_inbox(status, ts)`,
  `CREATE TABLE IF NOT EXISTS cmp_projects (
     id TEXT PRIMARY KEY, ts TEXT NOT NULL, name TEXT NOT NULL, outcome TEXT,
     status TEXT NOT NULL DEFAULT 'active', updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS cmp_contexts (name TEXT PRIMARY KEY, hint TEXT)`,
  `CREATE TABLE IF NOT EXISTS cmp_mood (
     id TEXT PRIMARY KEY, ts TEXT NOT NULL, day TEXT NOT NULL, score INTEGER NOT NULL,
     energy INTEGER, tags TEXT, note TEXT, context_json TEXT, source TEXT DEFAULT 'companion')`,
  `CREATE INDEX IF NOT EXISTS cmp_mood_day ON cmp_mood(day)`,
  `CREATE TABLE IF NOT EXISTS cmp_cards (
     id TEXT PRIMARY KEY, ts TEXT NOT NULL, front TEXT NOT NULL, back TEXT NOT NULL, source_id TEXT,
     due TEXT NOT NULL, stability REAL DEFAULT 0, difficulty REAL DEFAULT 0, reps INTEGER DEFAULT 0,
     lapses INTEGER DEFAULT 0, state TEXT DEFAULT 'new', last_review TEXT, suspended INTEGER DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS cmp_cards_due ON cmp_cards(suspended, due)`,
  `CREATE TABLE IF NOT EXISTS cmp_reviews (
     id TEXT PRIMARY KEY, card_id TEXT NOT NULL, ts TEXT NOT NULL, rating INTEGER NOT NULL,
     elapsed_days REAL, scheduled_days REAL, stability REAL, difficulty REAL)`,
  `CREATE TABLE IF NOT EXISTS cmp_push_subs (
     endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, ua TEXT,
     created_at TEXT NOT NULL, last_ok TEXT, last_error TEXT, failures INTEGER DEFAULT 0)`,
  // The shared nudge ledger. personal-companion creates it with its triggers; this copy only exists so a fresh
  // database (and the offline tests) work. CREATE IF NOT EXISTS never touches the live table.
  `CREATE TABLE IF NOT EXISTS companion_nudges (
     id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL,
     ladder_step INTEGER NOT NULL DEFAULT 1, ask TEXT NOT NULL, minutes INTEGER, expected TEXT, due_at TEXT,
     state TEXT NOT NULL DEFAULT 'queued', sent_at TEXT, shown_at TEXT, closed_at TEXT, response TEXT,
     outcome TEXT, superseded_by INTEGER, reason TEXT, context_json TEXT)`,
  `CREATE TABLE IF NOT EXISTS wellbeing_checkins (
     id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, day TEXT NOT NULL, mood INTEGER, energy INTEGER,
     sleep_hours REAL, load TEXT, note TEXT, source TEXT NOT NULL DEFAULT 'reply', raw_json TEXT, UNIQUE(day, source))`,
  `CREATE TABLE IF NOT EXISTS wellbeing_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS journal (id TEXT PRIMARY KEY, ts TEXT NOT NULL, date TEXT NOT NULL, content TEXT NOT NULL,
     mood TEXT, tags TEXT, source TEXT DEFAULT 'twin')`,
  `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'task',
     title TEXT NOT NULL, due TEXT, priority TEXT DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'open',
     source TEXT DEFAULT 'twin', done_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, content TEXT, source TEXT)`,
  `CREATE TABLE IF NOT EXISTS chat (id TEXT PRIMARY KEY, thread TEXT, ts TEXT, role TEXT, content TEXT, model TEXT,
     source TEXT, ua TEXT)`
];
// GTD fields ride on the twin's existing tasks table, so a task the twin adds in chat is a next action here.
export const TASK_COLUMNS = [
  ["context", "TEXT"], ["project_id", "TEXT"], ["energy", "TEXT"], ["minutes", "INTEGER"],
  ["gtd", "TEXT"], ["inbox_id", "TEXT"], ["notes", "TEXT"]
];

let _schemaReady = false;
export async function ensureSchema(db, force) {
  if (_schemaReady && !force) return;
  for (const sql of DDL) await db.prepare(sql).run();
  const cols = await db.prepare("PRAGMA table_info(tasks)").all();
  const have = new Set((cols.results || []).map((c) => c.name));
  for (const [name, type] of TASK_COLUMNS) {
    if (!have.has(name)) {
      try { await db.prepare("ALTER TABLE tasks ADD COLUMN " + name + " " + type).run(); } catch (e) { if (!/duplicate column/i.test(String(e && e.message || e))) throw e; }
    }
  }
  for (const c of CONTEXTS) await db.prepare("INSERT INTO cmp_contexts (name, hint) VALUES (?, ?) ON CONFLICT(name) DO NOTHING").bind(c.name, c.hint).run();
  _schemaReady = true;
}

// ---------------------------------------------------------------- small helpers

export const nowIso = () => new Date().toISOString();
export function rid(prefix) {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return prefix + "-" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("") + Date.now().toString(36);
}
const clampInt = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
const s = (v, n) => String(v === null || v === undefined ? "" : v).trim().slice(0, n || 2000);
export const esc = (v) => String(v === null || v === undefined ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function tzOffsetMinutes(tz, atMs) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz || TZ, timeZoneName: "longOffset" }).formatToParts(new Date(atMs === undefined ? Date.now() : atMs));
    const name = (parts.find((p) => p.type === "timeZoneName") || {}).value || "GMT+00:00";
    const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
    if (!m) return 0;
    return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
  } catch (e) { return 60; }
}
export function localParts(iso, tz) {
  const ms = new Date(iso).getTime();
  const d = new Date(ms + tzOffsetMinutes(tz || TZ, ms) * 60000);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() + d.getUTCMinutes() / 60, dow: d.getUTCDay() };
}
export const dayKey = (iso, tz) => localParts(iso, tz).day;
export function inQuiet(h, qs, qe) {
  if (qs === qe) return false;
  if (qs < qe) return h >= qs && h < qe;
  return h >= qs || h < qe;
}
function parseVal(v) { try { return JSON.parse(v); } catch (e) { return v; } }

// ---------------------------------------------------------------- FSRS-5 spaced repetition (ts-fsrs defaults)

// The ts-fsrs v4 default weights. Implemented here because the canonical deploy uploads one module with no bundler.
export const FSRS_W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
  1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const DECAY = -0.5, FACTOR = 19 / 81;
export const RETENTION = 0.9;
export const MAX_INTERVAL_DAYS = 365;
const clampD = (d) => Math.min(10, Math.max(1, d));
export function retrievability(elapsedDays, stability) {
  if (!(stability > 0)) return 0;
  return Math.pow(1 + FACTOR * Math.max(0, elapsedDays) / stability, DECAY);
}
export function intervalDays(stability, retention) {
  const r = retention || RETENTION;
  const i = stability / FACTOR * (Math.pow(r, 1 / DECAY) - 1);
  return Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(i)));
}
const initD = (g) => clampD(FSRS_W[4] - Math.exp(FSRS_W[5] * (g - 1)) + 1);
// rating: 1 again, 2 hard, 3 good, 4 easy. card: {state, stability, difficulty, last_review, reps, lapses}.
export function fsrsSchedule(card, rating, atIso) {
  const g = clampInt(rating, 1, 4);
  if (!g) throw new Error("rating must be 1-4");
  const now = new Date(atIso || nowIso()).getTime();
  const c = Object.assign({ state: "new", stability: 0, difficulty: 0, reps: 0, lapses: 0, last_review: null }, card || {});
  let S, D, state = "review", lapses = Number(c.lapses) || 0;
  const elapsed = c.last_review ? Math.max(0, (now - new Date(c.last_review).getTime()) / 864e5) : 0;
  if (c.state === "new" || !(c.stability > 0)) {
    S = FSRS_W[g - 1];
    D = initD(g);
  } else {
    D = Number(c.difficulty) || initD(3);
    S = Number(c.stability);
    const R = retrievability(elapsed, S);
    // Difficulty: linear damping toward 10, then mean reversion to the "good" initial difficulty (FSRS-5).
    const dPrime = D + (-FSRS_W[6] * (g - 3)) * (10 - D) / 9;
    const dNext = clampD(FSRS_W[7] * initD(4) + (1 - FSRS_W[7]) * dPrime);
    if (elapsed < 1) {
      // Same-day review: short-term stability (FSRS-5).
      S = S * Math.exp(FSRS_W[17] * (g - 3 + FSRS_W[18]));
    } else if (g === 1) {
      const sf = FSRS_W[11] * Math.pow(D, -FSRS_W[12]) * (Math.pow(S + 1, FSRS_W[13]) - 1) * Math.exp(FSRS_W[14] * (1 - R));
      S = Math.min(sf, S / Math.exp(FSRS_W[17] * FSRS_W[18]));
    } else {
      const hard = g === 2 ? FSRS_W[15] : 1, easy = g === 4 ? FSRS_W[16] : 1;
      S = S * (Math.exp(FSRS_W[8]) * (11 - D) * Math.pow(S, -FSRS_W[9]) * (Math.exp(FSRS_W[10] * (1 - R)) - 1) * hard * easy + 1);
    }
    D = dNext;
  }
  S = Math.max(0.1, S);
  let dueMs;
  if (g === 1) {
    // A lapse (or a first "again") comes back in ten minutes, the way a learning step does.
    state = c.state === "new" ? "learning" : "relearning";
    if (c.state !== "new") lapses += 1;
    dueMs = now + 10 * 60000;
  } else {
    dueMs = now + intervalDays(S) * 864e5;
  }
  return {
    state, stability: Math.round(S * 1e4) / 1e4, difficulty: Math.round(D * 1e4) / 1e4,
    reps: (Number(c.reps) || 0) + 1, lapses, last_review: new Date(now).toISOString(),
    due: new Date(dueMs).toISOString(), elapsed_days: Math.round(elapsed * 100) / 100,
    scheduled_days: Math.round((dueMs - now) / 864e5 * 100) / 100
  };
}

// ---------------------------------------------------------------- GTD clarify

export const CLARIFY_SYSTEM = [
  "You sort one captured item for a personal Getting Things Done system. Reply with ONE JSON object and nothing else.",
  'Shape: {"type":"action|project|someday|reference|journal|card|trash","title":"...","context":"@home|@computer|@phone|@errands|@outside|@anywhere","energy":"low|medium|high","minutes":5,"project":"name or empty","due":"YYYY-MM-DD or empty","front":"","back":"","why":"one short clause"}',
  "action: one physical, visible next step; title starts with a verb and is small enough to start now.",
  "project: an outcome that needs more than one step; title is the outcome; also give the first next action in front.",
  "someday: an idea with no commitment now. reference: information to keep. journal: feelings, reflections, how the day went.",
  "card: something he wants to remember or learn; front is a question, back the answer, both short.",
  "trash: noise. Never invent facts that are not in the item. Keep his own words where possible."
].join("\n");

const VERB_START = /^(buy|call|text|message|email|e-mail|write|send|book|pay|fix|clean|wash|cook|read|reply|ask|check|order|pick|return|schedule|plan|draft|finish|start|make|go|take|bring|print|sign|cancel|renew|update|review|learn|practice|practise|walk|run|tidy|sort|file|research|find|look|contact|visit|post|submit|prepare|clear|empty|water|charge|backup|back up)\b/i;
export function contextFor(text) {
  const t = String(text || "").toLowerCase();
  if (/\b(buy|pick up|shop|groceries|supermarket|pharmacy|post office|return .* to|albert heijn|jumbo|hema)\b/.test(t)) return "@errands";
  if (/\b(email|e-mail|write|draft|code|research|online|website|form|invoice|upload|download|book .* online|laptop|computer)\b/.test(t)) return "@computer";
  if (/\b(call|phone|ring|text|whatsapp|message|sms)\b/.test(t)) return "@phone";
  if (/\b(clean|tidy|laundry|wash|cook|dishes|vacuum|fridge|kitchen|bed|flat|water the)\b/.test(t)) return "@home";
  if (/\b(walk|run|gym|swim|bike|cycle|park|outside|fresh air)\b/.test(t)) return "@outside";
  return "@anywhere";
}
export function heuristicClarify(text) {
  const t = s(text, 4000);
  if (!t) return { type: "trash", title: "", why: "empty" };
  const first = t.split(/[\n.!?]/)[0].trim();
  if (/^(q:|card:|remember:)/i.test(t)) {
    const body = t.replace(/^(q:|card:|remember:)\s*/i, "");
    const parts = body.split(/\s*(?:\n|=>|->|\|| a: )\s*/i);
    return { type: "card", title: s(parts[0], 200), front: s(parts[0], 300), back: s(parts.slice(1).join(" ") || body, 600), why: "marked as a card" };
  }
  if (/\b(i feel|i felt|feeling|today was|i'm so|im so|i am so|tired|anxious|sad|lonely|overwhelmed|grateful|happy)\b/i.test(t) && !VERB_START.test(first)) {
    return { type: "journal", title: s(first, 120), why: "reads as how he is" };
  }
  if (/^(someday|maybe|idea:)/i.test(t)) return { type: "someday", title: s(t.replace(/^(someday|maybe|idea:)\s*/i, ""), 200), context: contextFor(t), energy: "medium", minutes: 30, why: "marked someday" };
  if (VERB_START.test(first) || /^(todo|to do|need to|i need to|i have to|i should|remember to|don't forget to|dont forget to)\b/i.test(first)) {
    const title = first.replace(/^(todo:?|to do:?|need to|i need to|i have to|i should|remember to|don't forget to|dont forget to)\s*/i, "");
    const cleaned = title.charAt(0).toUpperCase() + title.slice(1);
    return { type: "action", title: s(cleaned, 200), context: contextFor(t), energy: /\b(call|write|research|plan|finish)\b/i.test(t) ? "medium" : "low", minutes: /\b(research|plan|write|finish)\b/i.test(t) ? 30 : 10, why: "starts with a verb" };
  }
  if (t.length > 280) return { type: "journal", title: s(first, 120), why: "long free text" };
  return { type: "reference", title: s(first, 200), why: "kept as information" };
}
export function parseClarify(text, raw) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  let o = null;
  if (m) { try { o = JSON.parse(m[0]); } catch (e) { o = null; } }
  if (!o || typeof o !== "object") return heuristicClarify(raw);
  const types = ["action", "project", "someday", "reference", "journal", "card", "trash"];
  const type = types.includes(String(o.type)) ? String(o.type) : heuristicClarify(raw).type;
  const ctx = CONTEXTS.some((c) => c.name === o.context) ? o.context : contextFor(raw);
  return {
    type, title: s(o.title || heuristicClarify(raw).title, 200), context: ctx,
    energy: ENERGY.includes(o.energy) ? o.energy : "medium", minutes: clampInt(o.minutes, 1, 600) || 15,
    project: s(o.project, 120), due: /^\d{4}-\d{2}-\d{2}$/.test(String(o.due || "")) ? o.due : "",
    front: s(o.front, 300), back: s(o.back, 600), why: s(o.why, 160)
  };
}

// ---------------------------------------------------------------- crisis (fixed text, no model)

const HARD = [
  /\b(kill|killing|kills)\s+my\s?self\b/, /\b(end|ending)\s+(it\s+all|my\s+life)\b/, /\b(take|taking)\s+my\s+own\s+life\b/,
  /\b(want|wanna|wish)\s+(to\s+)?(die|be\s+dead)\b/, /\bbetter\s+off\s+dead\b/,
  /\bno\s+(reason|point)\s+(to|in)\s+(live|living|go\s+on|going\s+on)\b/, /\bsuicid\w*\b/, /\bself[-\s]?harm\w*\b/, /\b(overdos\w*)\b/,
  /\b(hurt|harm|cut|burn|starve|poison|stab|choke)\w*\s+my\s?self\b(?!\s+(some|a)\s+(slack|break))/,
  /\b(don'?t|do\s+not)\s+want\s+to\s+(be\s+here|exist|wake\s+up)\b/
];
const SOFT = ["can't go on", "cant go on", "give up on everything", "hopeless", "pointless", "nothing matters", "can't cope", "cant cope",
  "falling apart", "hate myself", "so tired of everything", "what's the point", "whats the point", "numb", "i'm a mess", "im a mess"];
export function crisisSignal(text) {
  const t = String(text || "").toLowerCase().replace(/\s+/g, " ");
  for (const re of HARD) { const m = t.match(re); if (m) return { level: 2, match: m[0] }; }
  const hit = SOFT.find((p) => t.includes(p));
  return hit ? { level: 1, match: hit } : { level: 0, match: null };
}
export const FALLBACK_CRISIS_LINES = [
  { label: "112 - immediate danger", number: "112" },
  { label: "113 Zelfmoordpreventie", number: "113" },
  { label: "0800-0113 (free)", number: "0800-0113" },
  { label: "chat 24/7", number: "", url: "https://www.113.nl" }
];
export function crisisText(cfg) {
  const lines = Array.isArray(cfg && cfg.crisis_lines) && cfg.crisis_lines.length ? cfg.crisis_lines : FALLBACK_CRISIS_LINES;
  const who = cfg && (cfg.backstop_name || cfg.backstop_contact) ? (cfg.backstop_name || "your person") + (cfg.backstop_contact ? " (" + cfg.backstop_contact + ")" : "") : "";
  const out = ["I'm really glad you told me. I'm staying right here with you."];
  out.push(who ? "Please tell " + who + " that you're not okay, right now. One line is enough." : "Please tell one real person that you're not okay, right now. One line is enough.");
  out.push("You can talk to someone at any hour: " + lines.map((l) => (l.label || "") + (l.number && !String(l.label || "").includes(l.number) ? " " + l.number : "") + (l.url ? " " + l.url : "")).join(" · "));
  out.push("Nothing has to be solved tonight. If you can, tell me where you are and whether you're safe right now.");
  return out.join("\n\n");
}

// ---------------------------------------------------------------- what to say (fixed, his own words reused)

export const TEXTS = {
  checkin: ["How's it landing today? Two taps: mood, then energy.", "Morning. How are you, 1 to 5? Nothing else needed.", "Quick one: how's today feeling so far?"],
  care: [
    "Today looks heavy. You don't have to do anything with it. What would make the next hour 5% easier?",
    "I noticed things have been lower. What's one thing that drained you, and one thing that didn't?",
    "No task today. If you want: a glass of water, a window open, and two minutes of nothing.",
    "You're allowed to have a slow day. Is there one person you'd like to hear from?",
    "What would you say to a friend who felt the way you feel right now?"
  ],
  reflect: [
    "Before the day closes: one line about it. What went okay?",
    "One line for today's journal: what took energy, what gave some back?",
    "What's one small thing you'd like tomorrow-you to find already done?",
    "Anything on your mind you'd like to put down before sleep? I'll hold it."
  ],
  anchor: [
    "If the day feels shapeless, here's a shape for the next hour: ",
    "Not sure what to do with yourself? Pick just this, for twenty minutes: ",
    "One anchor for the afternoon: "
  ],
  presence: ["I'm here. Nothing needed from you right now."]
};
export function pickLru(pool, recentAsks) {
  const used = recentAsks || [];
  const last = (a) => { let i = used.lastIndexOf(a); return i; };
  return pool.slice().sort((a, b) => last(a) - last(b) || a.localeCompare(b))[0];
}
export function energyFor(mood) {
  const m = mood && (mood.energy_today || mood.today);
  if (!m) return "low";
  if (m >= 4) return "high";
  if (m === 3) return "medium";
  return "low";
}
export function chooseAction(actions, energy) {
  const order = { low: 0, medium: 1, high: 2 };
  const cap = order[energy] === undefined ? 0 : order[energy];
  const fits = (actions || []).filter((a) => (order[a.energy] === undefined ? 1 : order[a.energy]) <= cap);
  const pool = fits.length ? fits : (actions || []).filter((a) => !a.energy || a.energy === "low");
  return pool.slice().sort((a, b) => (Number(a.minutes) || 15) - (Number(b.minutes) || 15) || String(a.ts || "").localeCompare(String(b.ts || "")))[0] || null;
}
// Hours (local, integer) at which he has answered a nudge or written to the companion before. Null until there is
// enough history to say anything (five answers); before that every waking hour counts as receptive.
export function receptiveHours(hours) {
  const list = (hours || []).filter((h) => Number.isFinite(h));
  if (list.length < 5) return null;
  const c = {};
  for (const h of list) c[h] = (c[h] || 0) + 1;
  return new Set(Object.keys(c).sort((a, b) => c[b] - c[a]).slice(0, 6).map(Number));
}

// ---------------------------------------------------------------- the planner (pure)

// st: { nowIso, hour, cfg, todays[], recent[], unansweredStreak, retired:Set, mood:{today,energy_today,avg7,avg2},
//       checkinSentToday, journalToday, lastUserIso, actionsDoneToday, nextActions[], dueCards, crisisLevel24h,
//       receptive:Set|null, pushReady }
export function planNudge(st) {
  const cfg = Object.assign({ quiet_start: 22, quiet_end: 7.5, max_per_day: 3, min_gap_min: 150, max_unanswered: 3 }, st.cfg || {});
  const h = st.hour;
  const nowMs = new Date(st.nowIso).getTime();
  const todays = (st.todays || []).filter((r) => r.state !== "superseded");
  const kindsToday = new Set(todays.map((r) => r.kind));
  const recentAsks = (st.recent || []).map((r) => String(r.ask || ""));
  const retired = st.retired || new Set();
  if (!st.pushReady) return { skip: "no-push-subscription" };
  if (inQuiet(h, Number(cfg.quiet_start), Number(cfg.quiet_end))) return { skip: "quiet-hours" };
  const mood = st.mood || {};
  const low = (mood.today !== null && mood.today !== undefined && mood.today <= 2) ||
    (mood.avg2 !== null && mood.avg2 !== undefined && mood.avg7 !== null && mood.avg7 !== undefined && mood.avg7 - mood.avg2 >= 0.75) ||
    (st.crisisLevel24h || 0) >= 1;
  const mk = (kind, text, minutes, dueMin, reason, extra) => Object.assign({ kind, ask: text, minutes, due_at: new Date(nowMs + dueMin * 60000).toISOString(), reason }, extra || {});

  // Risk words in the last day get one quiet, caring touch even above the cap (never inside quiet hours).
  if ((st.crisisLevel24h || 0) >= 1 && !kindsToday.has("cmp-care") && !retired.has("cmp-care")) {
    return mk("cmp-care", pickLru(TEXTS.care, recentAsks), 0, 360, "risk-words-24h");
  }
  if (todays.length >= Number(cfg.max_per_day)) return { skip: "daily-cap" };
  const lastSent = (st.recent || []).map((r) => new Date(r.sent_at || r.ts).getTime()).filter(Number.isFinite).sort((a, b) => b - a)[0];
  if (lastSent && nowMs - lastSent < Number(cfg.min_gap_min) * 60000) return { skip: "min-gap" };
  if ((st.unansweredStreak || 0) >= Number(cfg.max_unanswered)) {
    if (kindsToday.has("presence") || kindsToday.has("cmp-presence")) return { skip: "presence-already-sent" };
    return mk("cmp-presence", TEXTS.presence[0], 0, 360, "unanswered-streak=" + st.unansweredStreak);
  }
  const noMood = mood.today === null || mood.today === undefined;
  // Morning: make the check-in reach the phone (the e-mail ladder may already have asked; this is the same ask).
  if (h >= 8.5 && h < 12 && noMood && !kindsToday.has("cmp-checkin") && !retired.has("cmp-checkin")) {
    return mk("cmp-checkin", pickLru(TEXTS.checkin, recentAsks), 1, 240, st.checkinSentToday ? "checkin-unanswered" : "morning-checkin");
  }
  if (low) {
    if (kindsToday.has("cmp-care") || retired.has("cmp-care")) return { skip: "low-day-already-touched" };
    return mk("cmp-care", pickLru(TEXTS.care, recentAsks), 2, 360, "low-day mood=" + mood.today + " avg2=" + mood.avg2 + " avg7=" + mood.avg7);
  }
  if (h >= 19.5 && h < 21.75 && !st.journalToday && !kindsToday.has("cmp-reflect") && !retired.has("cmp-reflect")) {
    return mk("cmp-reflect", pickLru(TEXTS.reflect, recentAsks), 3, 240, "evening-no-journal");
  }
  if (h < 10 || h >= 18.5) return { skip: "outside-daytime" };
  const idleMin = st.lastUserIso ? (nowMs - new Date(st.lastUserIso).getTime()) / 60000 : Infinity;
  if (idleMin < 120) return { skip: "recently-active" };
  if (st.receptive && st.receptive.size && ![Math.floor(h) - 1, Math.floor(h), Math.floor(h) + 1].some((x) => st.receptive.has(x))) return { skip: "not-a-receptive-hour" };
  const action = chooseAction(st.nextActions, energyFor(mood));
  if (h >= 11 && h < 16.5 && !(st.actionsDoneToday > 0) && !kindsToday.has("cmp-anchor") && !retired.has("cmp-anchor")) {
    const what = action ? action.title + " (" + (action.minutes || 15) + " min)" : "a ten-minute walk outside, no phone";
    return mk("cmp-anchor", pickLru(TEXTS.anchor, recentAsks) + what + ". That's all.", action ? (action.minutes || 15) : 10, 180, "shapeless-day", action ? { action_id: action.id } : {});
  }
  if (action && !kindsToday.has("cmp-next") && !retired.has("cmp-next")) {
    return mk("cmp-next", "One small thing, if you have it in you: " + action.title + " (" + (action.minutes || 15) + " min, " + (action.context || "@anywhere") + ").", action.minutes || 15, 240, "idle " + Math.round(Math.min(idleMin, 9999)) + "m energy=" + energyFor(mood), { action_id: action.id });
  }
  if ((st.dueCards || 0) >= 3 && !kindsToday.has("cmp-review") && !retired.has("cmp-review")) {
    return mk("cmp-review", st.dueCards + " cards are ready. Five minutes of review while you have a moment?", 5, 240, "cards-due=" + st.dueCards);
  }
  return { skip: "nothing-useful" };
}

// ---------------------------------------------------------------- Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID)

export function b64u(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < b.length; i++) str += String.fromCharCode(b[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function unb64u(t) {
  const p = String(t).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(p + "===".slice((p.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const concat = (...arrs) => { const n = arrs.reduce((a, x) => a + x.length, 0); const o = new Uint8Array(n); let i = 0; for (const x of arrs) { o.set(x, i); i += x.length; } return o; };
const utf8 = (t) => new TextEncoder().encode(t);
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}
// A VAPID key pair belongs to this application, not to a person: generated once and kept in the companion
// Durable Object's own storage (never in D1, never in git).
export async function makeVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  return { private_jwk: jwk, public_b64u: b64u(pub) };
}
export async function vapidAuthHeader(endpoint, keys, subject, atMs) {
  const aud = new URL(endpoint).origin;
  const exp = Math.floor((atMs || Date.now()) / 1000) + 12 * 3600;
  const head = b64u(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(utf8(JSON.stringify({ aud, exp, sub: subject || "https://personal-api.q08.workers.dev/companion" })));
  const key = await crypto.subtle.importKey("jwk", keys.private_jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(head + "." + body)));
  return "vapid t=" + head + "." + body + "." + b64u(sig) + ", k=" + keys.public_b64u;
}
// Encrypts one payload for one subscription. Returns the request body (header block + ciphertext).
export async function encryptPayload(sub, payload, opts) {
  const o = opts || {};
  const uaPub = unb64u(sub.p256dh), authSecret = unb64u(sub.auth);
  const eph = o.ephemeral || await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(utf8("WebPush: info\0"), uaPub, asPub), 32);
  const salt = o.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);
  const plain = concat(typeof payload === "string" ? utf8(payload) : payload, new Uint8Array([2]));
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, plain));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}
export async function sendPush(sub, payloadObj, keys, fetchImpl) {
  const f = fetchImpl || fetch;
  const body = await encryptPayload(sub, JSON.stringify(payloadObj));
  const res = await f(sub.endpoint, {
    method: "POST",
    headers: { Authorization: await vapidAuthHeader(sub.endpoint, keys), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "21600", Urgency: payloadObj && payloadObj.urgent ? "high" : "normal" },
    body
  });
  return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410, text: res.ok ? "" : String(await res.text().catch(() => "")).slice(0, 200) };
}
export async function pushAll(env, payload, keys, fetchImpl) {
  const subs = (await env.PERSONAL.prepare("SELECT * FROM cmp_push_subs WHERE failures < 20").all()).results || [];
  const out = { subs: subs.length, ok: 0, gone: 0, failed: 0 };
  for (const sub of subs) {
    let r;
    try { r = await sendPush(sub, payload, keys, fetchImpl); } catch (e) { r = { ok: false, status: 0, text: String(e && e.message || e).slice(0, 200) }; }
    if (r.ok) { out.ok++; await env.PERSONAL.prepare("UPDATE cmp_push_subs SET last_ok = ?, failures = 0, last_error = NULL WHERE endpoint = ?").bind(nowIso(), sub.endpoint).run(); }
    else if (r.gone) { out.gone++; await env.PERSONAL.prepare("DELETE FROM cmp_push_subs WHERE endpoint = ?").bind(sub.endpoint).run(); }
    else { out.failed++; await env.PERSONAL.prepare("UPDATE cmp_push_subs SET failures = failures + 1, last_error = ? WHERE endpoint = ?").bind(r.status + " " + r.text, sub.endpoint).run(); }
  }
  return out;
}

// ---------------------------------------------------------------- reading the record

const all = async (db, sql, ...b) => ((await db.prepare(sql).bind(...b).all()).results || []);
const one = async (db, sql, ...b) => (await db.prepare(sql).bind(...b).first()) || null;

export async function loadCfg(env) {
  const out = { quiet_start: 22, quiet_end: 7.5, max_per_day: 3, min_gap_min: 150, max_unanswered: 3, retire_after_fired: 6, retire_below_done_rate: 0.05, crisis_lines: [], backstop_name: "", backstop_contact: "", tz: TZ };
  try { for (const r of await all(env.PERSONAL, "SELECT key, value FROM wellbeing_config")) out[r.key] = parseVal(r.value); } catch (e) { /* defaults */ }
  for (const k of ["quiet_start", "quiet_end", "max_per_day", "min_gap_min", "max_unanswered", "retire_after_fired", "retire_below_done_rate"]) out[k] = Number(out[k]);
  return out;
}
// Local midnight of `day` as a UTC instant, for comparing against ISO timestamps.
export function dayStartIso(day, tz) {
  const guess = new Date(day + "T00:00:00Z").getTime();
  return new Date(guess - tzOffsetMinutes(tz || TZ, guess) * 60000).toISOString();
}
// The longest quiet stretch overnight, read from when he wrote anything. A proxy, labelled as one.
export function sleepFromTimestamps(isos, day, tz) {
  const start = new Date(dayStartIso(day, tz)).getTime() - 6 * 3600e3;   // 18:00 the evening before
  const end = new Date(dayStartIso(day, tz)).getTime() + 14 * 3600e3;    // 14:00 today
  const t = (isos || []).map((x) => new Date(x).getTime()).filter((x) => x >= start && x <= end).sort((a, b) => a - b);
  if (t.length < 2) return null;
  let best = null;
  for (let i = 1; i < t.length; i++) {
    const gap = t[i] - t[i - 1];
    const midLocal = localParts(new Date(t[i - 1] + gap / 2).toISOString(), tz).hour;
    if (gap >= 3 * 3600e3 && (midLocal >= 0 && midLocal <= 9 || midLocal >= 23) && (!best || gap > best.gap)) best = { from: t[i - 1], to: t[i], gap };
  }
  if (!best) return null;
  const hm = (ms) => { const p = localParts(new Date(ms).toISOString(), tz); const hh = Math.floor(p.hour), mm = Math.round((p.hour - hh) * 60); return String(hh).padStart(2, "0") + ":" + String(mm % 60).padStart(2, "0"); };
  return { from: hm(best.from), to: hm(best.to), hours: Math.round(best.gap / 36e5 * 10) / 10, basis: "message times (a proxy, not measured sleep)" };
}
async function activityStamps(env, sinceIso) {
  const rows = [];
  const q = async (sql) => { try { for (const r of await all(env.PERSONAL, sql, sinceIso)) rows.push(r.ts); } catch (e) { /* table may be absent */ } };
  await q("SELECT ts FROM chat WHERE role = 'user' AND ts >= ? ORDER BY ts LIMIT 400");
  await q("SELECT ts FROM cmp_inbox WHERE ts >= ? LIMIT 200");
  await q("SELECT ts FROM cmp_mood WHERE ts >= ? LIMIT 100");
  await q("SELECT ts FROM journal WHERE ts >= ? LIMIT 100");
  return rows.filter(Boolean);
}
export async function sleepWindow(env, day, tz) {
  const since = new Date(new Date(dayStartIso(day, tz)).getTime() - 8 * 3600e3).toISOString();
  return sleepFromTimestamps(await activityStamps(env, since), day, tz);
}
export async function moodStats(env, day) {
  const today = await one(env.PERSONAL, "SELECT score, energy, ts FROM cmp_mood WHERE day = ? ORDER BY ts DESC LIMIT 1", day).catch(() => null);
  let t = today ? Number(today.score) : null, e = today && today.energy !== null ? Number(today.energy) : null;
  if (t === null) {
    const w = await one(env.PERSONAL, "SELECT mood, energy FROM wellbeing_checkins WHERE day = ? AND mood IS NOT NULL ORDER BY ts DESC LIMIT 1", day).catch(() => null);
    if (w) { t = Number(w.mood); e = w.energy === null ? null : Number(w.energy); }
  }
  const days = await all(env.PERSONAL, "SELECT day, AVG(mood) AS m FROM wellbeing_checkins WHERE mood IS NOT NULL AND day > date(?, '-7 days') AND day <= ? GROUP BY day ORDER BY day DESC", day, day).catch(() => []);
  const avg = (xs) => xs.length ? Math.round(xs.reduce((a, b) => a + Number(b.m), 0) / xs.length * 100) / 100 : null;
  return { today: t, energy_today: e, avg7: days.length >= 3 ? avg(days) : null, avg2: days.length >= 3 ? avg(days.slice(0, 2)) : null, days7: days.length };
}
export async function retiredKinds(env, cfg) {
  const rows = await all(env.PERSONAL, "SELECT kind, COUNT(*) AS fired, SUM(CASE WHEN state = 'done' THEN 1 ELSE 0 END) AS done FROM companion_nudges WHERE ts >= datetime('now', '-28 days') GROUP BY kind").catch(() => []);
  const out = new Set();
  for (const r of rows) if (Number(r.fired) >= cfg.retire_after_fired && Number(r.done) / Number(r.fired) < cfg.retire_below_done_rate) out.add(r.kind);
  return out;
}
const ASK_KINDS = ["micro", "body", "contact", "care", "cmp-next", "cmp-anchor", "cmp-review", "cmp-reflect", "cmp-checkin", "cmp-care"];
export async function unansweredStreak(env) {
  const rows = await all(env.PERSONAL, "SELECT state FROM companion_nudges WHERE kind IN (" + ASK_KINDS.map(() => "?").join(",") + ") AND state IN ('sent','shown','done','declined','expired') ORDER BY ts DESC LIMIT 10", ...ASK_KINDS).catch(() => []);
  let n = 0;
  for (const r of rows) { if (r.state === "done" || r.state === "declined") break; n++; }
  return n;
}
export async function gatherState(env, at) {
  const now = at || nowIso();
  const cfg = await loadCfg(env);
  const lp = localParts(now, cfg.tz);
  const start = dayStartIso(lp.day, cfg.tz);
  const db = env.PERSONAL;
  const [todays, recent, streak, retired, mood, journal, lastUser, done, next, due, subs, recentTexts, answerRows] = await Promise.all([
    all(db, "SELECT * FROM companion_nudges WHERE day = ? ORDER BY id", lp.day).catch(() => []),
    all(db, "SELECT * FROM companion_nudges ORDER BY id DESC LIMIT 40").catch(() => []),
    unansweredStreak(env), retiredKinds(env, cfg), moodStats(env, lp.day),
    one(db, "SELECT COUNT(*) AS n FROM journal WHERE date = ?", lp.day).catch(() => null),
    activityStamps(env, new Date(Date.parse(now) - 2 * 864e5).toISOString()),
    one(db, "SELECT COUNT(*) AS n FROM tasks WHERE status = 'done' AND done_at >= ?", start).catch(() => null),
    all(db, "SELECT id, ts, title, context, energy, minutes, due FROM tasks WHERE status = 'open' AND COALESCE(gtd, 'next') = 'next' ORDER BY COALESCE(due, '9999'), ts LIMIT 30").catch(() => []),
    one(db, "SELECT COUNT(*) AS n FROM cmp_cards WHERE suspended = 0 AND due <= ?", now).catch(() => null),
    one(db, "SELECT COUNT(*) AS n FROM cmp_push_subs WHERE failures < 20").catch(() => null),
    recentUserTexts(env, new Date(Date.parse(now) - 864e5).toISOString()),
    all(db, "SELECT closed_at AS ts FROM companion_nudges WHERE state = 'done' AND closed_at >= datetime('now', '-60 days') UNION ALL SELECT ts FROM cmp_mood WHERE ts >= datetime('now', '-60 days')").catch(() => [])
  ]);
  let crisisLevel24h = 0;
  for (const t of recentTexts) crisisLevel24h = Math.max(crisisLevel24h, crisisSignal(t).level);
  return {
    nowIso: now, day: lp.day, hour: lp.hour, cfg, todays, recent, unansweredStreak: streak, retired, mood,
    checkinSentToday: todays.some((r) => r.kind === "checkin"), journalToday: !!(journal && journal.n > 0),
    lastUserIso: lastUser.sort().pop() || null, actionsDoneToday: done ? Number(done.n) : 0, nextActions: next,
    dueCards: due ? Number(due.n) : 0, pushReady: !!(subs && subs.n > 0), crisisLevel24h,
    receptive: receptiveHours(answerRows.map((r) => r.ts ? Math.floor(localParts(r.ts, cfg.tz).hour) : NaN))
  };
}
async function recentUserTexts(env, sinceIso) {
  const out = [];
  const q = async (sql) => { try { for (const r of await all(env.PERSONAL, sql, sinceIso)) out.push(r.t); } catch (e) { /* absent */ } };
  await q("SELECT content AS t FROM chat WHERE role = 'user' AND ts >= ? ORDER BY ts DESC LIMIT 60");
  await q("SELECT content AS t FROM journal WHERE ts >= ? LIMIT 30");
  await q("SELECT raw_text AS t FROM cmp_inbox WHERE ts >= ? LIMIT 30");
  await q("SELECT note AS t FROM cmp_mood WHERE ts >= ? AND note IS NOT NULL LIMIT 30");
  return out.filter(Boolean);
}

// ---------------------------------------------------------------- memory (Vectorize personal-life)

export async function remember(env, deps, id, kind, text) {
  if (!env.VZ || !deps || !deps.embed || !text) return false;
  try {
    const [vec] = await deps.embed(env, [String(text).slice(0, 1000)]);
    if (!vec) return false;
    await env.VZ.upsert([{ id: "cmp:" + id, values: vec, metadata: { doc: "companion", kind, id, text: String(text).slice(0, 600), ts: nowIso() } }]);
    return true;
  } catch (e) { console.error(JSON.stringify({ evt: "companion:remember", error: String(e && e.message || e).slice(0, 200) })); return false; }
}
export async function recall(env, deps, q, k) {
  if (!env.VZ || !deps || !deps.embed || !q) return [];
  try {
    const [vec] = await deps.embed(env, [String(q).slice(0, 1000)]);
    if (!vec) return [];
    const r = await env.VZ.query(vec, { topK: k || 6, returnValues: false, returnMetadata: "all" });
    return (r.matches || []).filter((m) => m.score >= 0.55 && m.metadata && m.metadata.text).map((m) => ({ doc: m.metadata.doc, kind: m.metadata.kind || "", ts: m.metadata.ts || m.metadata.date || "", text: String(m.metadata.text).slice(0, 400), score: Math.round(m.score * 100) / 100 }));
  } catch (e) { return []; }
}

// ---------------------------------------------------------------- writes

async function closeOpen(env, kinds, state, response) {
  const day = dayKey(nowIso());
  await env.PERSONAL.prepare("UPDATE companion_nudges SET state = ?, closed_at = ?, response = COALESCE(?, response) WHERE day = ? AND state IN ('sent','shown') AND kind IN (" + kinds.map(() => "?").join(",") + ")")
    .bind(state, nowIso(), response || null, day, ...kinds).run();
}
export async function contextSnapshot(env, deps, at) {
  const now = at || nowIso();
  const lp = localParts(now);
  const snap = { local_time: String(Math.floor(lp.hour)).padStart(2, "0") + ":" + String(Math.round((lp.hour % 1) * 60) % 60).padStart(2, "0"), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][lp.dow] };
  try { snap.sleep = await sleepWindow(env, lp.day); } catch (e) { snap.sleep = null; }
  try { const d = await one(env.PERSONAL, "SELECT COUNT(*) AS n FROM tasks WHERE status = 'done' AND done_at >= ?", dayStartIso(lp.day)); snap.actions_done_today = d ? Number(d.n) : 0; } catch (e) { /* absent */ }
  try { const r = await all(env.PERSONAL, "SELECT title FROM tasks WHERE status = 'done' AND done_at >= ? ORDER BY done_at DESC LIMIT 3", new Date(Date.parse(now) - 864e5).toISOString()); snap.recent_done = r.map((x) => x.title); } catch (e) { /* absent */ }
  if (deps && deps.weather) {
    try { const w = await deps.weather(env); if (w && w.ok) snap.weather = { where: w.location, now: typeof w.weather === "string" ? w.weather.slice(0, 160) : w.weather && (w.weather.summary || w.weather.current || JSON.stringify(w.weather).slice(0, 160)) }; } catch (e) { /* offline */ }
  }
  return snap;
}
export async function recordMood(env, deps, a) {
  const score = Number(a && a.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) return { ok: false, error: "score must be a whole number from 1 to 5" };
  const energy = a.energy === undefined || a.energy === null || a.energy === "" ? null : clampInt(a.energy, 1, 5);
  const tags = Array.isArray(a.tags) ? a.tags.map((x) => s(x, 30)).filter(Boolean).join(",") : s(a.tags, 200);
  const note = s(a.note, 2000) || null;
  const now = nowIso();
  const day = dayKey(now);
  const ctx = await contextSnapshot(env, deps, now);
  const id = rid("mood");
  await env.PERSONAL.prepare("INSERT INTO cmp_mood (id, ts, day, score, energy, tags, note, context_json, source) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(id, now, day, score, energy, tags || null, note, JSON.stringify(ctx), s(a.source, 40) || "companion").run();
  // The e-mail ladder reads wellbeing_checkins, so a tap here is the check-in there too (one row per day per source).
  await env.PERSONAL.prepare(`INSERT INTO wellbeing_checkins (ts, day, mood, energy, note, source, raw_json) VALUES (?, ?, ?, ?, ?, 'companion', ?)
     ON CONFLICT(day, source) DO UPDATE SET ts = excluded.ts, mood = excluded.mood, energy = COALESCE(excluded.energy, energy), note = COALESCE(excluded.note, note), raw_json = excluded.raw_json`)
    .bind(now, day, score, energy, note, JSON.stringify({ tags, cmp_mood_id: id })).run();
  await closeOpen(env, ["checkin", "cmp-checkin"], "done", "mood " + score);
  if (note) await remember(env, deps, id, "mood", "Mood " + score + "/5" + (tags ? " (" + tags + ")" : "") + ": " + note);
  const sig = crisisSignal(note);
  return { ok: true, id, day, score, energy, tags, context: ctx, crisis: sig.level >= 2 ? crisisText(await loadCfg(env)) : null, reply: moodReply(score, sig.level) };
}
export function moodReply(score, level) {
  if (level >= 2) return "Thank you for telling me. Please read the lines below, they matter more than anything else here.";
  if (score <= 1) return "That sounds really hard. Thank you for telling me. No tasks today; I'll keep things quiet and gentle.";
  if (score === 2) return "Low day, noted. I'll only suggest small, kind things today.";
  if (score === 3) return "Okay is okay. Want one small thing to give the day a shape?";
  if (score === 4) return "Good to hear. Let's use a bit of it, gently.";
  return "Lovely. Worth remembering what made today good; want to jot it down?";
}
export async function addAction(env, a) {
  const title = s(a && a.title, 200);
  if (!title) return { ok: false, error: "title required" };
  let projectId = s(a.project_id, 80) || null;
  if (!projectId && a.project) projectId = (await upsertProject(env, a.project)).id;
  const id = rid("task");
  await env.PERSONAL.prepare("INSERT INTO tasks (id, ts, kind, title, due, priority, status, source, context, project_id, energy, minutes, gtd, inbox_id, notes) VALUES (?,?, 'task', ?, ?, 'normal', 'open', ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, nowIso(), title, s(a.due, 25) || null, s(a.source, 40) || "companion", CONTEXTS.some((c) => c.name === a.context) ? a.context : contextFor(title), projectId,
      ENERGY.includes(a.energy) ? a.energy : "low", clampInt(a.minutes, 1, 600) || 15, ["next", "waiting", "someday"].includes(a.gtd) ? a.gtd : "next", s(a.inbox_id, 80) || null, s(a.notes, 1000) || null).run();
  return { ok: true, id, title };
}
export async function upsertProject(env, name) {
  const n = s(name, 120);
  const ex = await one(env.PERSONAL, "SELECT id, name FROM cmp_projects WHERE lower(name) = lower(?) LIMIT 1", n);
  if (ex) return ex;
  const id = rid("prj");
  await env.PERSONAL.prepare("INSERT INTO cmp_projects (id, ts, name, status, updated_at) VALUES (?, ?, ?, 'active', ?)").bind(id, nowIso(), n, nowIso()).run();
  return { id, name: n };
}
export async function actionDone(env, id) {
  const r = await env.PERSONAL.prepare("UPDATE tasks SET status = 'done', done_at = ? WHERE id = ? AND status = 'open'").bind(nowIso(), s(id, 80)).run();
  if (!(r.meta && r.meta.changes)) return { ok: false, error: "no open action with that id" };
  await closeOpen(env, ["cmp-next", "cmp-anchor", "micro", "body"], "done", "action " + id);
  return { ok: true, id, reply: "Done. That counts." };
}
export async function addJournal(env, deps, a) {
  const content = s(a && a.content, 5000);
  if (content.length < 2) return { ok: false, error: "content required" };
  const now = nowIso(), id = rid("jrn");
  await env.PERSONAL.prepare("INSERT INTO journal (id, ts, date, content, mood, tags, source) VALUES (?,?,?,?,?,?, 'companion')").bind(id, now, dayKey(now), content, s(a.mood, 20), s(a.tags, 200)).run();
  await closeOpen(env, ["cmp-reflect"], "done", "journal");
  await remember(env, deps, id, "journal", content);
  const sig = crisisSignal(content);
  return { ok: true, id, crisis: sig.level >= 2 ? crisisText(await loadCfg(env)) : null };
}
export async function addCard(env, a) {
  const front = s(a && a.front, 300), back = s(a && a.back, 600);
  if (!front || !back) return { ok: false, error: "front and back required" };
  const id = rid("card");
  await env.PERSONAL.prepare("INSERT INTO cmp_cards (id, ts, front, back, source_id, due, state) VALUES (?,?,?,?,?,?, 'new')").bind(id, nowIso(), front, back, s(a.source_id, 80) || null, nowIso()).run();
  return { ok: true, id };
}
export async function reviewCard(env, id, rating) {
  const c = await one(env.PERSONAL, "SELECT * FROM cmp_cards WHERE id = ?", s(id, 80));
  if (!c) return { ok: false, error: "no such card" };
  const n = fsrsSchedule(c, rating);
  await env.PERSONAL.prepare("UPDATE cmp_cards SET due = ?, stability = ?, difficulty = ?, reps = ?, lapses = ?, state = ?, last_review = ? WHERE id = ?")
    .bind(n.due, n.stability, n.difficulty, n.reps, n.lapses, n.state, n.last_review, c.id).run();
  await env.PERSONAL.prepare("INSERT INTO cmp_reviews (id, card_id, ts, rating, elapsed_days, scheduled_days, stability, difficulty) VALUES (?,?,?,?,?,?,?,?)")
    .bind(rid("rev"), c.id, n.last_review, Number(rating), n.elapsed_days, n.scheduled_days, n.stability, n.difficulty).run();
  await closeOpen(env, ["cmp-review"], "done", "reviewed");
  return { ok: true, id: c.id, due: n.due, scheduled_days: n.scheduled_days, state: n.state };
}
export async function answerNudge(env, id, state) {
  if (!["done", "declined"].includes(state)) return { ok: false, error: "state must be done or declined" };
  const r = await env.PERSONAL.prepare("UPDATE companion_nudges SET state = ?, closed_at = ? WHERE id = ? AND state IN ('sent','shown','queued')").bind(state, nowIso(), Number(id)).run();
  return { ok: !!(r.meta && r.meta.changes), id: Number(id), state, reply: state === "done" ? "Noted, and well done." : "That's fine. Not today is a real answer." };
}

// ---------------------------------------------------------------- capture + processing

const AUDIO_EXT = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/wav": "wav", "audio/x-wav": "wav", "audio/aac": "aac" };
const IMG_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic" };
export const MAX_CAPTURE_BYTES = 20 * 1024 * 1024;
function toB64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}
export async function transcribe(env, bytes) {
  const errors = [];
  const runOpts = { gateway: { id: "default" } };
  try {
    const r = await env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: toB64(bytes) }, runOpts);
    const t = r && (r.text || (r.transcription_info && r.text));
    if (t && String(t).trim()) return { ok: true, text: String(t).trim(), model: "whisper-large-v3-turbo" };
    errors.push("turbo:empty");
  } catch (e) { errors.push("turbo:" + String(e && e.message || e).slice(0, 120)); }
  try {
    const r = await env.AI.run("@cf/openai/whisper", { audio: Array.from(bytes) }, runOpts);
    if (r && r.text && String(r.text).trim()) return { ok: true, text: String(r.text).trim(), model: "whisper" };
    errors.push("whisper:empty");
  } catch (e) { errors.push("whisper:" + String(e && e.message || e).slice(0, 120)); }
  return { ok: false, error: errors.join(" | ") };
}
export async function capture(env, deps, input) {
  const now = nowIso(), id = rid("inb"), day = dayKey(now);
  let kind = "text", text = s(input && input.text, 8000), mediaKey = null, mime = null, note = null;
  if (input && input.audio && input.audio.length) {
    if (input.audio.length > MAX_CAPTURE_BYTES) return { ok: false, error: "audio over 20 MB" };
    kind = "voice"; mime = s(input.mime, 60) || "audio/webm";
    mediaKey = "companion/audio/" + day + "/" + id + "." + (AUDIO_EXT[mime.split(";")[0]] || "bin");
    if (env.MEDIA) await env.MEDIA.put(mediaKey, input.audio, { httpMetadata: { contentType: mime } });
    const tr = await transcribe(env, input.audio);
    if (tr.ok) text = (text ? text + "\n" : "") + tr.text; else note = "transcription failed: " + tr.error;
  } else if (input && input.image && input.image.length) {
    if (input.image.length > MAX_CAPTURE_BYTES) return { ok: false, error: "image over 20 MB" };
    kind = "image"; mime = s(input.mime, 60) || "image/jpeg";
    mediaKey = "companion/img/" + day + "/" + id + "." + (IMG_EXT[mime] || "bin");
    if (env.MEDIA) await env.MEDIA.put(mediaKey, input.image, { httpMetadata: { contentType: mime } });
    if (deps && deps.vision) {
      const v = await deps.vision(env, [
        { type: "text", text: "This photo was captured into a personal notes inbox. First copy any visible text verbatim. Then, on a line starting 'What it is:', say in one sentence what it shows (receipt, whiteboard, handwritten note, poster, screen, place, food...). Do not guess beyond what is visible." },
        { type: "image_url", image_url: { url: "data:" + mime + ";base64," + toB64(input.image) } }
      ]);
      if (v && v.ok) text = (text ? text + "\n\n" : "") + v.text; else note = "image description failed: " + (v && v.error || "no vision");
    }
  }
  if (!text && !mediaKey) return { ok: false, error: "nothing to capture: send text, audio or an image" };
  await env.PERSONAL.prepare("INSERT INTO cmp_inbox (id, ts, kind, raw_text, media_key, mime, status, source, result_json) VALUES (?,?,?,?,?,?, 'unprocessed', ?, ?)")
    .bind(id, now, kind, text || null, mediaKey, mime, s(input && input.source, 40) || "companion", note ? JSON.stringify({ note }) : null).run();
  let processed = null;
  if (text && !(input && input.defer)) {
    try { processed = await processItem(env, deps, { id, raw_text: text, kind, media_key: mediaKey }); } catch (e) { processed = { ok: false, error: String(e && e.message || e).slice(0, 200) }; }
  }
  return { ok: true, id, kind, text, media_key: mediaKey, note, processed };
}
export async function clarify(env, deps, text) {
  if (deps && deps.llm) {
    try { const out = await deps.llm(env, CLARIFY_SYSTEM, "Captured item:\n" + String(text).slice(0, 3000), 400); if (out) return Object.assign(parseClarify(out, text), { by: "model" }); } catch (e) { /* fall through */ }
  }
  return Object.assign(heuristicClarify(text), { by: "rules" });
}
export async function processItem(env, deps, row) {
  const text = s(row.raw_text, 8000);
  await env.PERSONAL.prepare("UPDATE cmp_inbox SET attempts = COALESCE(attempts, 0) + 1 WHERE id = ?").bind(row.id).run();
  const sig = crisisSignal(text);
  const c = await clarify(env, deps, text);
  const res = { type: c.type, title: c.title, by: c.by, why: c.why };
  if (c.type === "action" || c.type === "someday") {
    const a = await addAction(env, { title: c.title, context: c.context, energy: c.energy, minutes: c.minutes, due: c.due, project: c.project, gtd: c.type === "someday" ? "someday" : "next", inbox_id: row.id, notes: text.length > c.title.length + 20 ? text.slice(0, 1000) : null });
    res.action_id = a.id; res.context = c.context;
  } else if (c.type === "project") {
    const p = await upsertProject(env, c.title);
    res.project_id = p.id;
    if (c.front) { const a = await addAction(env, { title: c.front, project_id: p.id, inbox_id: row.id }); res.action_id = a.id; }
  } else if (c.type === "reference") {
    await env.PERSONAL.prepare("INSERT INTO notes (id, ts, kind, content, source) VALUES (?, ?, 'reference', ?, 'companion')").bind("ref-" + row.id, nowIso(), text).run();
  } else if (c.type === "journal") {
    await env.PERSONAL.prepare("INSERT INTO journal (id, ts, date, content, mood, tags, source) VALUES (?,?,?,?, '', 'inbox', 'companion')").bind("jrn-" + row.id, nowIso(), dayKey(nowIso()), text).run();
    await closeOpen(env, ["cmp-reflect"], "done", "journal via inbox");
  } else if (c.type === "card") {
    const k = await addCard(env, { front: c.front || c.title, back: c.back || text, source_id: row.id });
    res.card_id = k.id;
  }
  await remember(env, deps, row.id, row.kind || "text", text);
  if (sig.level >= 1) res.crisis_level = sig.level;
  await env.PERSONAL.prepare("UPDATE cmp_inbox SET status = 'processed', processed_at = ?, result_json = ? WHERE id = ?").bind(nowIso(), JSON.stringify(res), row.id).run();
  if (sig.level >= 2) res.crisis = crisisText(await loadCfg(env));
  return Object.assign({ ok: true }, res);
}
export async function processInbox(env, deps, limit) {
  const rows = await all(env.PERSONAL, "SELECT * FROM cmp_inbox WHERE status = 'unprocessed' AND raw_text IS NOT NULL AND COALESCE(attempts, 0) < 3 ORDER BY ts LIMIT ?", limit || 5);
  const out = [];
  for (const r of rows) { try { out.push(await processItem(env, deps, r)); } catch (e) { out.push({ ok: false, id: r.id, error: String(e && e.message || e).slice(0, 160) }); } }
  return out;
}

// ---------------------------------------------------------------- the tick (runs in the companion Durable Object)

export function pushPayloadFor(row) {
  const ask = ["micro", "body", "contact", "care", "cmp-next", "cmp-anchor", "cmp-review"].includes(row.kind);
  return {
    title: row.kind === "cmp-care" || row.kind === "presence" || row.kind === "cmp-presence" ? "Here with you" : row.kind === "checkin" || row.kind === "cmp-checkin" ? "How's it landing?" : row.kind === "cmp-reflect" ? "Before the day closes" : "One small thing",
    body: String(row.ask || "").slice(0, 300), tag: "cmp-" + row.id, id: row.id, kind: row.kind,
    url: "/companion#n=" + row.id, ask
  };
}
// deps.pushed: { has(id), add(id) } so a ladder row is pushed once. deps.keys: VAPID keys. deps.fetch: optional.
export async function companionTick(env, deps, opts) {
  const o = opts || {};
  const now = o.nowIso || nowIso();
  await ensureSchema(env.PERSONAL);
  const out = { now };
  out.processed = (await processInbox(env, deps, 5)).length;
  const exp = await env.PERSONAL.prepare("UPDATE companion_nudges SET state = 'expired', closed_at = ? WHERE kind LIKE 'cmp-%' AND state IN ('sent','shown') AND due_at IS NOT NULL AND due_at < ?").bind(now, now).run();
  out.expired = exp.meta ? exp.meta.changes : 0;
  // 1. The e-mail ladder's fresh asks also reach the phone, once each.
  if (deps.keys && deps.pushed) {
    const fresh = await all(env.PERSONAL, "SELECT * FROM companion_nudges WHERE kind IN (" + LADDER_KINDS.map(() => "?").join(",") + ") AND state = 'sent' AND sent_at >= ? ORDER BY id LIMIT 3", ...LADDER_KINDS, new Date(Date.parse(now) - 45 * 60000).toISOString()).catch(() => []);
    out.mirrored = 0;
    for (const r of fresh) {
      if (await deps.pushed.has(r.id)) continue;
      const res = await pushAll(env, pushPayloadFor(r), deps.keys, deps.fetch);
      await deps.pushed.add(r.id);
      if (res.ok) out.mirrored++;
    }
  }
  // 2. At most one companion nudge per tick, under the shared rules.
  const st = await gatherState(env, now);
  if (o.force) Object.assign(st.cfg, { quiet_start: 0, quiet_end: 0, max_per_day: 99, min_gap_min: 0 });
  const plan = planNudge(st);
  out.plan = plan.skip ? { skip: plan.skip } : { kind: plan.kind, reason: plan.reason };
  if (plan.skip || o.dryRun || !deps.keys) return out;
  let id;
  try {
    const r = await env.PERSONAL.prepare("INSERT INTO companion_nudges (ts, day, kind, ladder_step, ask, minutes, expected, due_at, state, reason, context_json) VALUES (?,?,?,0,?,?,?,?, 'queued', ?, ?)")
      .bind(now, st.day, plan.kind, plan.ask, plan.minutes || 0, "log:" + plan.kind, plan.due_at, plan.reason, JSON.stringify({ action_id: plan.action_id || null, mood: st.mood, hour: Math.round(st.hour * 10) / 10 })).run();
    id = r.meta && r.meta.last_row_id;
  } catch (e) {
    if (String(e && e.message || e).includes("NUDGE-DUP-1")) { out.plan.skip = "duplicate-kind-today"; return out; }
    throw e;
  }
  const res = await pushAll(env, pushPayloadFor({ id, kind: plan.kind, ask: plan.ask }), deps.keys, deps.fetch);
  if (res.ok > 0) await env.PERSONAL.prepare("UPDATE companion_nudges SET state = 'sent', sent_at = ?, outcome = ? WHERE id = ?").bind(now, JSON.stringify({ via: "push", subs: res.subs, ok: res.ok }), id).run();
  else await env.PERSONAL.prepare("UPDATE companion_nudges SET state = 'expired', closed_at = ?, outcome = ? WHERE id = ?").bind(now, JSON.stringify({ via: "push", send_failed: res }), id).run();
  out.sent = { id, kind: plan.kind, push: res };
  return out;
}

// ---------------------------------------------------------------- read models

export async function today(env, deps) {
  await ensureSchema(env.PERSONAL);
  const st = await gatherState(env);
  const db = env.PERSONAL;
  const greet = st.hour < 5 ? "Still up" : st.hour < 12 ? "Morning" : st.hour < 18 ? "Afternoon" : "Evening";
  const [open, sleep, inbox, lastJournal, projects] = await Promise.all([
    all(db, "SELECT id, kind, ask, sent_at, due_at FROM companion_nudges WHERE day = ? AND state IN ('sent','shown') ORDER BY id DESC", st.day),
    sleepWindow(env, st.day).catch(() => null),
    one(db, "SELECT COUNT(*) AS n FROM cmp_inbox WHERE status = 'unprocessed'"),
    one(db, "SELECT date, substr(content, 1, 140) AS line FROM journal ORDER BY ts DESC LIMIT 1").catch(() => null),
    all(db, "SELECT id, name FROM cmp_projects WHERE status = 'active' ORDER BY ts DESC LIMIT 8")
  ]);
  let weather = null;
  if (deps && deps.weather) { try { const w = await deps.weather(env); if (w && w.ok) weather = w; } catch (e) { /* offline */ } }
  const suggestion = st.mood.today !== null && st.mood.today <= 2 ? null : chooseAction(st.nextActions, energyFor(st.mood));
  return {
    day: st.day, greeting: greet, hour: Math.round(st.hour * 100) / 100, mood: st.mood, sleep, weather,
    low_day: (st.mood.today !== null && st.mood.today <= 2) || st.crisisLevel24h >= 1,
    one_thing: suggestion, next_actions: st.nextActions.slice(0, 12), actions_done_today: st.actionsDoneToday,
    due_cards: st.dueCards, open_nudges: open, inbox_unprocessed: inbox ? Number(inbox.n) : 0, last_journal: lastJournal,
    projects, push_ready: st.pushReady, nudges_today: st.todays.length, cap: st.cfg.max_per_day,
    plan_preview: (() => { const p = planNudge(Object.assign({}, st, { pushReady: true })); return p.skip ? { skip: p.skip } : { kind: p.kind, reason: p.reason }; })()
  };
}
export async function dashboard(env) {
  await ensureSchema(env.PERSONAL);
  const db = env.PERSONAL;
  const [weeks, days, byCtx, due, loop, done7, tags] = await Promise.all([
    all(db, "SELECT strftime('%Y-W%W', day) AS week, ROUND(AVG(mood), 2) AS mood, ROUND(AVG(energy), 2) AS energy, COUNT(DISTINCT day) AS days FROM wellbeing_checkins WHERE mood IS NOT NULL AND day >= date('now', '-84 days') GROUP BY week ORDER BY week"),
    all(db, "SELECT day, ROUND(AVG(mood), 2) AS mood, ROUND(AVG(energy), 2) AS energy FROM wellbeing_checkins WHERE mood IS NOT NULL AND day >= date('now', '-30 days') GROUP BY day ORDER BY day"),
    all(db, "SELECT COALESCE(context, '@anywhere') AS context, COUNT(*) AS n FROM tasks WHERE status = 'open' AND COALESCE(gtd, 'next') = 'next' GROUP BY 1 ORDER BY 2 DESC"),
    one(db, "SELECT COUNT(*) AS n, SUM(CASE WHEN state = 'new' THEN 1 ELSE 0 END) AS fresh FROM cmp_cards WHERE suspended = 0 AND due <= ?", nowIso()),
    all(db, "SELECT kind, COUNT(*) AS fired, SUM(CASE WHEN state = 'done' THEN 1 ELSE 0 END) AS done, SUM(CASE WHEN state = 'declined' THEN 1 ELSE 0 END) AS declined, SUM(CASE WHEN state = 'expired' THEN 1 ELSE 0 END) AS expired FROM companion_nudges WHERE ts >= datetime('now', '-28 days') GROUP BY kind ORDER BY fired DESC"),
    one(db, "SELECT COUNT(*) AS n FROM tasks WHERE status = 'done' AND done_at >= datetime('now', '-7 days')"),
    all(db, "SELECT tags, ROUND(AVG(score), 2) AS mood, COUNT(*) AS n FROM cmp_mood WHERE tags IS NOT NULL AND tags != '' AND ts >= datetime('now', '-60 days') GROUP BY tags ORDER BY n DESC LIMIT 12")
  ]);
  return { mood_weekly: weeks, mood_daily_30d: days, actions_by_context: byCtx, actions_done_7d: done7 ? Number(done7.n) : 0, cards_due: due ? Number(due.n) : 0, cards_new_due: due ? Number(due.fresh || 0) : 0, nudge_loop_28d: loop, mood_by_tags_60d: tags };
}

// ---------------------------------------------------------------- privacy: what is stored, export, delete

export const PRIVACY_TABLES = [
  { table: "cmp_inbox", what: "everything you captured (text, voice transcripts, photo descriptions)", where: "1=1" },
  { table: "cmp_mood", what: "mood taps with tags, note and context snapshot (time, weather, sleep proxy)", where: "1=1" },
  { table: "wellbeing_checkins", what: "daily check-ins (shared with the e-mail check-in)", where: "1=1" },
  { table: "tasks", what: "next actions and someday items", where: "1=1" },
  { table: "cmp_projects", what: "projects", where: "1=1" },
  { table: "journal", what: "journal entries", where: "1=1" },
  { table: "notes", what: "reference notes from the inbox", where: "kind = 'reference'" },
  { table: "cmp_cards", what: "flashcards", where: "1=1" },
  { table: "cmp_reviews", what: "flashcard review history", where: "1=1" },
  { table: "companion_nudges", what: "every nudge sent and how it ended", where: "1=1" },
  { table: "cmp_push_subs", what: "phone/browser push subscriptions", where: "1=1" }
];
const DELETABLE = { cmp_inbox: "id", cmp_mood: "id", tasks: "id", cmp_projects: "id", journal: "id", cmp_cards: "id", cmp_push_subs: "endpoint", companion_nudges: "id" };
export async function privacy(env) {
  await ensureSchema(env.PERSONAL);
  const rows = [];
  for (const t of PRIVACY_TABLES) {
    const tsCol = t.table === "wellbeing_checkins" || t.table === "companion_nudges" ? "ts" : t.table === "cmp_push_subs" ? "created_at" : "ts";
    const r = await one(env.PERSONAL, "SELECT COUNT(*) AS n, MIN(" + tsCol + ") AS oldest, MAX(" + tsCol + ") AS newest FROM " + t.table + " WHERE " + t.where).catch(() => null);
    rows.push({ table: t.table, what: t.what, rows: r ? Number(r.n) : 0, oldest: r && r.oldest, newest: r && r.newest });
  }
  let files = { objects: 0, bytes: 0 };
  if (env.MEDIA) {
    try { let cursor; do { const l = await env.MEDIA.list({ prefix: "companion/", cursor, limit: 1000 }); for (const ob of l.objects) { files.objects++; files.bytes += ob.size; } cursor = l.truncated ? l.cursor : undefined; } while (cursor); } catch (e) { files.error = String(e && e.message || e).slice(0, 120); }
  }
  return {
    where: "Everything lives in your own Cloudflare account: D1 database personal-life, R2 bucket personal-media (prefix companion/), Vectorize index personal-life (ids cmp:<item id>), and the companion Durable Object (push signing key only). Nothing is sent to a third-party store; model calls run on Workers AI through your AI Gateway.",
    tables: rows, files, encryption: "R2 and D1 encrypt at rest; every request uses TLS.",
    "export": "/companion/api/export", "delete": "/companion/api/delete"
  };
}
export async function exportAll(env) {
  await ensureSchema(env.PERSONAL);
  const out = { exported_at: nowIso(), version: COMPANION_VERSION, tables: {} };
  for (const t of PRIVACY_TABLES) out.tables[t.table] = await all(env.PERSONAL, "SELECT * FROM " + t.table + " WHERE " + t.where + " LIMIT 20000").catch(() => []);
  if (out.tables.cmp_push_subs) out.tables.cmp_push_subs = out.tables.cmp_push_subs.map((r) => Object.assign({}, r, { auth: "(withheld)", p256dh: "(withheld)" }));
  out.files = [];
  if (env.MEDIA) { try { let cursor; do { const l = await env.MEDIA.list({ prefix: "companion/", cursor, limit: 1000 }); for (const ob of l.objects) out.files.push({ key: ob.key, bytes: ob.size, url: "/companion/api/media/" + ob.key }); cursor = l.truncated ? l.cursor : undefined; } while (cursor); } catch (e) { /* listed as empty */ } }
  return out;
}
export async function deleteData(env, a) {
  const scope = s(a && a.scope, 20);
  if (scope === "item") {
    const col = DELETABLE[a.table];
    if (!col) return { ok: false, error: "table not deletable here" };
    const row = await one(env.PERSONAL, "SELECT * FROM " + a.table + " WHERE " + col + " = ?", s(a.id, 400));
    if (!row) return { ok: false, error: "no such row" };
    await env.PERSONAL.prepare("DELETE FROM " + a.table + " WHERE " + col + " = ?").bind(s(a.id, 400)).run();
    if (row.media_key && env.MEDIA) await env.MEDIA.delete(row.media_key);
    if (env.VZ && a.table !== "cmp_push_subs") { try { await env.VZ.deleteByIds(["cmp:" + a.id]); } catch (e) { /* no vector */ } }
    return { ok: true, deleted: { table: a.table, id: a.id } };
  }
  if (scope === "all") {
    if (s(a.confirm, 40).toLowerCase() !== "delete everything") return { ok: false, error: "type the words 'delete everything' to confirm" };
    const ids = (await all(env.PERSONAL, "SELECT id FROM cmp_inbox UNION ALL SELECT id FROM cmp_mood UNION ALL SELECT id FROM journal WHERE source = 'companion'")).map((r) => "cmp:" + r.id);
    const counts = {};
    for (const [t, where] of [["cmp_inbox", "1=1"], ["cmp_mood", "1=1"], ["cmp_cards", "1=1"], ["cmp_reviews", "1=1"], ["cmp_projects", "1=1"], ["cmp_push_subs", "1=1"], ["tasks", "source = 'companion'"], ["journal", "source = 'companion'"], ["notes", "source = 'companion'"], ["wellbeing_checkins", "source = 'companion'"], ["companion_nudges", "kind LIKE 'cmp-%'"]]) {
      const r = await env.PERSONAL.prepare("DELETE FROM " + t + " WHERE " + where).run();
      counts[t] = r.meta ? r.meta.changes : 0;
    }
    let files = 0;
    if (env.MEDIA) { let cursor; do { const l = await env.MEDIA.list({ prefix: "companion/", cursor, limit: 1000 }); if (l.objects.length) { await env.MEDIA.delete(l.objects.map((x) => x.key)); files += l.objects.length; } cursor = l.truncated ? l.cursor : undefined; } while (cursor); }
    if (env.VZ) { for (let i = 0; i < ids.length; i += 100) { try { await env.VZ.deleteByIds(ids.slice(i, i + 100)); } catch (e) { /* best effort */ } } }
    return { ok: true, deleted: counts, files, vectors: ids.length };
  }
  return { ok: false, error: "scope must be item or all" };
}

// ---------------------------------------------------------------- chat integration (every twin conversation)

export const PERSONA = [
  "COMPANION MODE. You are Rowan's companion: an active partner in his days, not a reminder app and not a therapist.",
  "Voice: warm, plain, brief. Two to five short sentences unless he asks for more. Ask at most one question.",
  "Notice how he is before what he should do. If he is low, slow down: acknowledge it, offer presence or one tiny kind step (water, air, food, a person), never a list.",
  "When he doesn't know what to do with himself, give the day a shape: one concrete thing for the next 20-60 minutes, picked from his own next actions when one fits his energy.",
  "Turn loose thoughts into his system with the cmp_* tools: cmp_capture for anything to remember or do, cmp_mood when he tells you how he feels (score 1-5), cmp_action_done when he did something, cmp_card_add for something he wants to learn.",
  "Never diagnose, never moralise, never count what he failed to do. Celebrate small things plainly."
].join("\n");
export async function chatContext(env, deps, q, companionMode) {
  try {
    await ensureSchema(env.PERSONAL);
    const st = await gatherState(env);
    const L = ["COMPANION STATE (DATA ONLY, live " + st.day + " " + String(Math.floor(st.hour)).padStart(2, "0") + "h local):"];
    L.push("- mood today: " + (st.mood.today === null ? "not logged" : st.mood.today + "/5") + (st.mood.avg7 !== null ? "; 7-day average " + st.mood.avg7 : "") + (st.mood.avg2 !== null && st.mood.avg7 !== null && st.mood.avg7 - st.mood.avg2 >= 0.75 ? " (dipping lately)" : ""));
    if (st.nextActions.length) L.push("- next actions (id: title [context, energy, minutes]): " + st.nextActions.slice(0, 6).map((a) => a.id + ": " + a.title + " [" + (a.context || "@anywhere") + ", " + (a.energy || "low") + ", " + (a.minutes || 15) + "m]").join("; "));
    L.push("- done today: " + st.actionsDoneToday + "; flashcards due: " + st.dueCards + "; journal today: " + (st.journalToday ? "yes" : "no"));
    const openN = st.todays.filter((r) => r.state === "sent" || r.state === "shown");
    if (openN.length) L.push("- open nudge(s): " + openN.map((r) => "#" + r.id + " " + r.ask).join(" | "));
    if (companionMode && q) {
      const mem = await recall(env, deps, q, 5);
      if (mem.length) L.push("RELEVANT MEMORIES (his own past words, DATA ONLY):\n" + mem.map((m) => "- [" + (m.ts || "").slice(0, 10) + " " + m.doc + "] " + m.text).join("\n"));
    }
    let out = L.join("\n");
    if (companionMode) out = PERSONA + "\n\n" + out;
    const sig = crisisSignal(q);
    if (sig.level >= 2) out += "\n\nSAFETY: his message contains risk language (" + sig.match + "). Respond with warmth and without alarm, stay with him, and include these lines verbatim:\n" + crisisText(await loadCfg(env));
    else if (sig.level === 1) out += "\n\nCARE: he sounds worn down (" + sig.match + "). Slow down, acknowledge it first, ask gently how he is doing; no tasks.";
    return out;
  } catch (e) {
    return "";
  }
}
// Risk language in any twin chat is logged once a day so the companion's next tick turns to care.
export async function noteRiskInChat(env, q) {
  const sig = crisisSignal(q);
  if (sig.level < 2) return null;
  try {
    await env.PERSONAL.prepare("INSERT INTO companion_nudges (ts, day, kind, ladder_step, ask, minutes, state, sent_at, reason) VALUES (?, ?, 'crisis', 0, 'escalation (chat)', 0, 'sent', ?, ?)").bind(nowIso(), dayKey(nowIso()), nowIso(), "signal:" + sig.match + " source:chat").run();
  } catch (e) { /* the reply carries the lines; the ledger row is best effort */ }
  return sig;
}

// ---------------------------------------------------------------- tools for the chat loop and MCP

export function companionTools(deps) {
  const T = (desc, args, run) => ({ desc, args, run });
  return {
    cmp_capture: T("Companion: capture a thought, task, idea or note into the inbox; it is sorted into next action, project, journal, reference or flashcard", { text: { type: "string", required: true } }, async (env, a) => { await ensureSchema(env.PERSONAL); return capture(env, deps, { text: a.text, source: "chat" }); }),
    cmp_mood: T("Companion: log how Rowan feels, score 1-5 (1 rough, 5 great), optional energy 1-5, tags (social, health, work, sleep...) and a note", { score: { type: "number", required: true }, energy: { type: "number", required: false }, tags: { type: "string", required: false }, note: { type: "string", required: false } }, async (env, a) => { await ensureSchema(env.PERSONAL); return recordMood(env, deps, Object.assign({ source: "chat" }, a)); }),
    cmp_next: T("Companion: the one next action that fits his energy now, plus the open next-action list", { energy: { type: "string", required: false, desc: "low|medium|high" } }, async (env, a) => { await ensureSchema(env.PERSONAL); const st = await gatherState(env); return { ok: true, one_thing: chooseAction(st.nextActions, ENERGY.includes(a.energy) ? a.energy : energyFor(st.mood)), actions: st.nextActions.slice(0, 15) }; }),
    cmp_action_add: T("Companion: add a next action with GTD context", { title: { type: "string", required: true }, context: { type: "string", required: false, desc: "@home|@computer|@phone|@errands|@outside|@anywhere" }, energy: { type: "string", required: false }, minutes: { type: "number", required: false }, project: { type: "string", required: false }, due: { type: "string", required: false } }, async (env, a) => { await ensureSchema(env.PERSONAL); return addAction(env, Object.assign({ source: "chat" }, a)); }),
    cmp_action_done: T("Companion: mark a next action done (id from cmp_next or the companion state)", { id: { type: "string", required: true } }, async (env, a) => { await ensureSchema(env.PERSONAL); return actionDone(env, a.id); }),
    cmp_card_add: T("Companion: create a spaced-repetition flashcard", { front: { type: "string", required: true }, back: { type: "string", required: true } }, async (env, a) => { await ensureSchema(env.PERSONAL); return addCard(env, a); }),
    cmp_cards_due: T("Companion: flashcards due for review now", {}, async (env) => { await ensureSchema(env.PERSONAL); return { ok: true, cards: await all(env.PERSONAL, "SELECT id, front, back, state, reps FROM cmp_cards WHERE suspended = 0 AND due <= ? ORDER BY due LIMIT 20", nowIso()) }; }),
    cmp_card_review: T("Companion: record a flashcard review, rating 1 again, 2 hard, 3 good, 4 easy", { id: { type: "string", required: true }, rating: { type: "number", required: true } }, async (env, a) => { await ensureSchema(env.PERSONAL); return reviewCard(env, a.id, a.rating); }),
    cmp_today: T("Companion: today's picture (mood, sleep proxy, one thing, next actions, due cards, open nudges)", {}, async (env) => Object.assign({ ok: true }, await today(env, deps))),
    cmp_dashboard: T("Companion: weekly mood averages, actions by context, cards due, how nudges landed", {}, async (env) => Object.assign({ ok: true }, await dashboard(env)))
  };
}
export const TOOL_APPENDIX_LINE = " cmp_capture {text}; cmp_mood {score,energy?,tags?,note?}; cmp_next {energy?}; cmp_action_add {title,context?,energy?,minutes?,project?,due?}; cmp_action_done {id}; cmp_card_add {front,back}; cmp_cards_due {}; cmp_card_review {id,rating}; cmp_today {}; cmp_dashboard {}.";

// ---------------------------------------------------------------- Durable Object hooks (PersonalTwinAgent instance "companion")

export const TICK_MS = 15 * 60000;
export async function doKeys(agent) {
  let k = await agent.storage.get("cmp_vapid");
  if (!k) { k = await makeVapidKeys(); await agent.storage.put("cmp_vapid", k); }
  return k;
}
function pushedStore(agent) {
  return {
    has: async (id) => ((await agent.storage.get("cmp_pushed")) || []).includes(id),
    add: async (id) => { const l = (await agent.storage.get("cmp_pushed")) || []; l.push(id); await agent.storage.put("cmp_pushed", l.slice(-300)); }
  };
}
export async function doEnsure(agent) {
  await agent.storage.put("cmp_role", true);
  const at = await agent.storage.getAlarm();
  if (!at || at > Date.now() + TICK_MS) await agent.storage.setAlarm(Date.now() + 5000);
}
export async function doTick(agent, deps, opts) {
  const keys = await doKeys(agent);
  const res = await companionTick(agent.env, Object.assign({}, deps, { keys, pushed: pushedStore(agent) }), opts);
  await agent.storage.put("cmp_last_tick", { at: nowIso(), plan: res.plan, sent: res.sent ? res.sent.kind : null });
  return res;
}
// Called from PersonalTwinAgent.alarm(); returns the next alarm time for the companion role, or null.
export async function doAlarm(agent, deps) {
  if (!(await agent.storage.get("cmp_role"))) return null;
  try { await doTick(agent, deps); } catch (e) { console.error(JSON.stringify({ evt: "companion:tick", error: String(e && e.message || e).slice(0, 300) })); }
  return Date.now() + TICK_MS;
}
export async function doFetch(agent, request, deps) {
  const url = new URL(request.url);
  const op = url.pathname.replace(/^.*\/companion-do\//, "");
  if (op === "ensure") { await doEnsure(agent); return Response.json({ ok: true, alarm: await agent.storage.getAlarm(), last_tick: await agent.storage.get("cmp_last_tick") }); }
  if (op === "key") { const k = await doKeys(agent); await doEnsure(agent); return Response.json({ ok: true, public_key: k.public_b64u }); }
  if (op === "tick") { await doEnsure(agent); return Response.json(await doTick(agent, deps, { force: url.searchParams.get("force") === "1", dryRun: url.searchParams.get("dry") === "1" })); }
  if (op === "test-push") {
    const k = await doKeys(agent);
    return Response.json(await pushAll(agent.env, { title: "Companion", body: "Notifications work. I'll keep them few and gentle.", tag: "cmp-test", url: "/companion" }, k));
  }
  return Response.json({ ok: false, error: "unknown op" }, { status: 404 });
}

// ---------------------------------------------------------------- HTTP (/companion, /companion/api/*)

const J = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
async function readCapture(request) {
  const ct = request.headers.get("Content-Type") || "";
  if (ct.includes("multipart/form-data")) {
    const f = await request.formData();
    const out = { text: f.get("text") || "", source: f.get("source") || "companion" };
    const file = f.get("file") || f.get("audio") || f.get("image");
    if (file && typeof file === "object" && file.arrayBuffer) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = file.type || "";
      if (mime.startsWith("image/")) { out.image = bytes; out.mime = mime; } else { out.audio = bytes; out.mime = mime || "audio/webm"; }
    }
    return out;
  }
  if (ct.startsWith("audio/") || ct.startsWith("video/webm")) return { audio: new Uint8Array(await request.arrayBuffer()), mime: ct.split(";")[0].replace("video/", "audio/") };
  if (ct.startsWith("image/")) return { image: new Uint8Array(await request.arrayBuffer()), mime: ct };
  const b = await request.json().catch(() => ({}));
  const out = { text: b.text || b.content || "", source: b.source || "api" };
  if (b.audio_b64) { out.audio = unb64(b.audio_b64); out.mime = b.mime || "audio/webm"; }
  if (b.image_b64) { out.image = unb64(b.image_b64); out.mime = b.mime || "image/jpeg"; }
  return out;
}
function unb64(t) { const bin = atob(String(t).replace(/^data:[^,]+,/, "")); const o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; }

// OpenAI-compatible speech-to-text (POST /v1/audio/transcriptions, multipart "file"), so any client that speaks the
// OpenAI audio API can talk to the companion. ?capture=1 (or form field capture=1) also files the words in the inbox.
export async function handleTranscription(request, env, ctx, deps) {
  if (!(await deps.auth(request, env))) return J({ error: { message: "unauthorized", type: "invalid_request_error" } }, 401);
  const input = await readCapture(request);
  if (!input.audio) return J({ error: { message: "multipart field 'file' with audio required", type: "invalid_request_error" } }, 400);
  const tr = await transcribe(env, input.audio);
  if (!tr.ok) return J({ error: { message: tr.error, type: "upstream_error" } }, 502);
  const u = new URL(request.url);
  if (u.searchParams.get("capture") === "1") { await ensureSchema(env.PERSONAL); ctx.waitUntil(capture(env, deps, { text: tr.text, source: "transcriptions-api" })); }
  return J({ text: tr.text });
}

export async function handleCompanion(request, env, ctx, deps) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, "") || "/";
  if (p === "/companion") return new Response(PAGE_HTML.replace("__VERSION__", esc(deps.version || COMPANION_VERSION)), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
  if (p === "/companion/sw.js") return new Response(SW_JS, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache", "Service-Worker-Allowed": "/companion" } });
  if (p === "/companion/manifest.webmanifest") return new Response(JSON.stringify(MANIFEST), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
  if (p === "/companion/icon.svg") return new Response(ICON_SVG, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });
  if (!p.startsWith("/companion/api/")) return J({ ok: false, error: "not found" }, 404);
  if (!(await deps.auth(request, env))) return J({ ok: false, error: "unauthorized: send Authorization: Bearer <personal API key>" }, 401);
  await ensureSchema(env.PERSONAL);
  const r = p.slice("/companion/api/".length);
  const m = request.method;
  const body = async () => (m === "POST" ? await request.json().catch(() => ({})) : {});
  const stub = () => deps.doStub(env);
  const ensure = () => { try { ctx.waitUntil(stub().fetch("https://do/companion-do/ensure").catch(() => null)); } catch (e) { /* DO absent in tests */ } };
  try {
    if (r === "today" && m === "GET") { ensure(); return J(await today(env, deps)); }
    if (r === "dashboard" && m === "GET") return J(await dashboard(env));
    if (r === "capture" && m === "POST") { const out = await capture(env, deps, await readCapture(request)); return J(out, out.ok ? 200 : 400); }
    if (r === "inbox" && m === "GET") return J({ ok: true, items: await all(env.PERSONAL, "SELECT id, ts, kind, raw_text, media_key, status, result_json FROM cmp_inbox ORDER BY ts DESC LIMIT 50") });
    if (r === "inbox/process" && m === "POST") return J({ ok: true, processed: await processInbox(env, deps, 10) });
    if (r === "mood" && m === "POST") { const out = await recordMood(env, deps, await body()); return J(out, out.ok ? 200 : 400); }
    if (r === "mood" && m === "GET") return J({ ok: true, entries: await all(env.PERSONAL, "SELECT id, ts, day, score, energy, tags, note, context_json FROM cmp_mood ORDER BY ts DESC LIMIT 60") });
    if (r === "actions" && m === "GET") return J({ ok: true, actions: await all(env.PERSONAL, "SELECT id, ts, title, context, energy, minutes, due, COALESCE(gtd, 'next') AS gtd, project_id, source FROM tasks WHERE status = 'open' ORDER BY COALESCE(gtd, 'next'), COALESCE(due, '9999'), ts LIMIT 200"), projects: await all(env.PERSONAL, "SELECT * FROM cmp_projects WHERE status = 'active' ORDER BY ts DESC"), contexts: CONTEXTS });
    if (r === "actions" && m === "POST") { const out = await addAction(env, await body()); return J(out, out.ok ? 200 : 400); }
    if (r === "actions/done" && m === "POST") { const b = await body(); return J(await actionDone(env, b.id)); }
    if (r === "actions/move" && m === "POST") { const b = await body(); if (!["next", "waiting", "someday"].includes(b.gtd)) return J({ ok: false, error: "gtd must be next, waiting or someday" }, 400); await env.PERSONAL.prepare("UPDATE tasks SET gtd = ? WHERE id = ?").bind(b.gtd, s(b.id, 80)).run(); return J({ ok: true }); }
    if (r === "journal" && m === "POST") { const out = await addJournal(env, deps, await body()); return J(out, out.ok ? 200 : 400); }
    if (r === "journal" && m === "GET") return J({ ok: true, entries: await all(env.PERSONAL, "SELECT id, ts, date, content, mood, source FROM journal ORDER BY ts DESC LIMIT 30") });
    if (r === "cards/due" && m === "GET") return J({ ok: true, cards: await all(env.PERSONAL, "SELECT id, front, back, state, reps, due FROM cmp_cards WHERE suspended = 0 AND due <= ? ORDER BY due LIMIT 50", nowIso()) });
    if (r === "cards" && m === "POST") { const out = await addCard(env, await body()); return J(out, out.ok ? 200 : 400); }
    if (r === "cards/review" && m === "POST") { const b = await body(); return J(await reviewCard(env, b.id, b.rating)); }
    if (r === "nudge" && m === "POST") { const b = await body(); return J(await answerNudge(env, b.id, b.state)); }
    if (r === "push/key" && m === "GET") return stub().fetch("https://do/companion-do/key");
    if (r === "push/subscribe" && m === "POST") {
      const b = await body();
      const sub = b.subscription || b;
      if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth || !/^https:\/\//.test(sub.endpoint)) return J({ ok: false, error: "subscription with endpoint and keys required" }, 400);
      await env.PERSONAL.prepare("INSERT INTO cmp_push_subs (endpoint, p256dh, auth, ua, created_at) VALUES (?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, failures = 0, last_error = NULL")
        .bind(sub.endpoint, sub.keys.p256dh, sub.keys.auth, s(request.headers.get("User-Agent"), 200), nowIso()).run();
      ensure();
      return J({ ok: true });
    }
    if (r === "push/unsubscribe" && m === "POST") { const b = await body(); await env.PERSONAL.prepare("DELETE FROM cmp_push_subs WHERE endpoint = ?").bind(s(b.endpoint, 1000)).run(); return J({ ok: true }); }
    if (r === "push/test" && m === "POST") return stub().fetch("https://do/companion-do/test-push");
    if (r === "tick" && m === "POST") return stub().fetch("https://do/companion-do/tick" + (url.searchParams.get("force") === "1" ? "?force=1" : url.searchParams.get("dry") === "1" ? "?dry=1" : ""));
    if (r === "privacy" && m === "GET") return J(await privacy(env));
    if (r === "export" && m === "GET") return new Response(JSON.stringify(await exportAll(env), null, 1), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": "attachment; filename=\"companion-export-" + dayKey(nowIso()) + ".json\"", "Cache-Control": "no-store" } });
    if (r === "delete" && m === "POST") { const out = await deleteData(env, await body()); return J(out, out.ok ? 200 : 400); }
    if (r.startsWith("media/companion/") && m === "GET" && env.MEDIA) {
      const ob = await env.MEDIA.get(decodeURIComponent(r.slice("media/".length)));
      if (!ob) return J({ ok: false, error: "not found" }, 404);
      return new Response(ob.body, { headers: { "Content-Type": (ob.httpMetadata && ob.httpMetadata.contentType) || "application/octet-stream", "Cache-Control": "private, max-age=3600" } });
    }
    if (r === "chat" && m === "POST") {
      // The page talks to the same twin brain as every other client (tools, calendar, memory), in companion mode.
      // Risk language always gets the fixed crisis lines back, whatever the model wrote (rule 6).
      const b = await body();
      const msgs = (Array.isArray(b.messages) ? b.messages : []).filter((x) => x && (x.role === "user" || x.role === "assistant")).slice(-16).map((x) => ({ role: x.role, content: s(x.content, 6000) }));
      const last = msgs.slice().reverse().find((x) => x.role === "user");
      if (!last) return J({ ok: false, error: "messages required" }, 400);
      const req2 = new Request(new URL("/v1/chat/completions", url).toString(), { method: "POST", headers: { "Content-Type": "application/json", Authorization: request.headers.get("Authorization") || "", "User-Agent": "companion-page" }, body: JSON.stringify({ model: "personal", companion: true, thread_id: s(b.thread_id, 80) || "companion-" + dayKey(nowIso()), messages: msgs }) });
      const res = await deps.chat(req2, env, ctx);
      const j = await res.json().catch(() => null);
      const text = j && j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : null;
      const sig = crisisSignal(last.content);
      return J({ ok: !!text, reply: text || (j && j.error && j.error.message) || "I couldn't answer just now.", crisis: sig.level >= 2 ? crisisText(await loadCfg(env)) : null });
    }
    if (r === "context" && m === "GET") return J({ ok: true, context: await chatContext(env, deps, url.searchParams.get("q") || "", true) });
  } catch (e) {
    console.error(JSON.stringify({ evt: "companion:api", route: r, error: String(e && e.message || e).slice(0, 300) }));
    return J({ ok: false, error: String(e && e.message || e).slice(0, 300) }, 500);
  }
  return J({ ok: false, error: "not found" }, 404);
}

export const MANIFEST = {
  name: "Companion", short_name: "Companion", start_url: "/companion", scope: "/companion", display: "standalone",
  background_color: "#f6f4ef", theme_color: "#2f5d50", description: "Rowan's personal companion",
  icons: [{ src: "/companion/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]
};
export const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="#2f5d50"/><circle cx="48" cy="44" r="20" fill="none" stroke="#f6f4ef" stroke-width="7"/><path d="M30 74c5-6 11-9 18-9s13 3 18 9" fill="none" stroke="#f6f4ef" stroke-width="7" stroke-linecap="round"/></svg>';
export const SW_JS = `self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  const opts = { body: d.body || '', tag: d.tag || 'companion', icon: '/companion/icon.svg', badge: '/companion/icon.svg', data: { url: d.url || '/companion', id: d.id || null }, renotify: false };
  if (d.ask && d.id) opts.actions = [{ action: 'done', title: 'Did it' }, { action: 'no', title: 'Not today' }];
  e.waitUntil(self.registration.showNotification(d.title || 'Companion', opts));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  let url = d.url || '/companion';
  if (d.id && (e.action === 'done' || e.action === 'no')) url = '/companion#n=' + d.id + '&a=' + e.action;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if (c.url.includes('/companion')) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});`;

// The phone page. Plain HTML, no external script: it holds the personal API key in localStorage, so nothing else loads.
export const PAGE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Companion</title><link rel="manifest" href="/companion/manifest.webmanifest"><link rel="icon" href="/companion/icon.svg">
<meta name="theme-color" content="#2f5d50"><meta name="robots" content="noindex">
<style>
:root{--bg:#f6f4ef;--card:#fff;--ink:#1f2622;--mute:#69716c;--line:#e3dfd6;--acc:#2f5d50;--acc2:#e6efe9;--warn:#8a3b2e;--warn2:#f7e8e4}
@media (prefers-color-scheme:dark){:root{--bg:#141816;--card:#1d2320;--ink:#e9ece9;--mute:#9aa49e;--line:#2c3430;--acc:#7fbfa8;--acc2:#22322c;--warn:#f0a593;--warn2:#3a2420}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:640px;margin:0 auto;padding:16px 16px 96px}
h1{font-size:1.35rem;margin:.2rem 0 .8rem}h2{font-size:1rem;margin:0 0 .5rem;color:var(--mute);font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin:0 0 12px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.grow{flex:1}
button,.btn{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:9px 13px;cursor:pointer}
button.p{background:var(--acc);color:var(--bg);border-color:var(--acc)}button.sel{background:var(--acc2);border-color:var(--acc)}
button:disabled{opacity:.5}
input,textarea,select{font:inherit;width:100%;border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--card);color:var(--ink)}
textarea{min-height:90px;resize:vertical}
.scale button{flex:1;min-width:0;padding:10px 0}.scale small{display:block;font-size:.7rem;color:var(--mute)}
.chip{font-size:.85rem;padding:5px 10px;border-radius:999px}
.mute{color:var(--mute);font-size:.9rem}.say{background:var(--acc2);border-radius:12px;padding:10px 12px;margin-top:10px}
.warn{background:var(--warn2);color:var(--warn);border-radius:12px;padding:12px;white-space:pre-wrap;margin-top:10px}
nav{position:fixed;bottom:0;left:0;right:0;background:var(--card);border-top:1px solid var(--line);display:flex;justify-content:space-around;padding:6px 4px calc(6px + env(safe-area-inset-bottom))}
nav button{border:0;background:none;font-size:.78rem;padding:6px 4px;color:var(--mute);flex:1}nav button.on{color:var(--acc);font-weight:700}
.item{border-top:1px solid var(--line);padding:10px 0;display:flex;gap:10px;align-items:flex-start}.item:first-child{border-top:0}
.msg{margin:8px 0;padding:10px 12px;border-radius:12px;white-space:pre-wrap;max-width:88%}.me{background:var(--acc2);margin-left:auto}.it{background:var(--card);border:1px solid var(--line)}
.flash{font-size:1.15rem;padding:18px 6px;text-align:center}
table{width:100%;border-collapse:collapse;font-size:.9rem}td,th{text-align:left;padding:6px 4px;border-top:1px solid var(--line)}
.bar{height:8px;background:var(--acc);border-radius:4px}
.hide{display:none}
</style></head><body><main>
<div id="login" class="card hide"><h1>Companion</h1><p class="mute">Enter your personal API key once. It stays on this device.</p><div class="row"><input id="key" type="password" autocomplete="off" class="grow"><button class="p" onclick="saveKey()">Open</button></div></div>
<section id="v-today" class="v"></section>
<section id="v-capture" class="v hide"><h1>Capture</h1>
 <div class="card"><textarea id="cap-text" placeholder="Anything on your mind. A task, an idea, a worry, something to remember."></textarea>
 <div class="row" style="margin-top:8px"><button class="p" onclick="capText()">Save</button><button id="rec" onclick="toggleRec()">Voice note</button><label class="btn">Photo<input id="cap-img" type="file" accept="image/*" capture="environment" class="hide" onchange="capImg(this)"></label></div>
 <div id="cap-out"></div></div>
 <div class="card"><h2>Recently captured</h2><div id="inbox"></div></div></section>
<section id="v-talk" class="v hide"><h1>Talk</h1><div id="msgs"></div>
 <div class="card"><textarea id="chat-in" placeholder="Say anything. How you are, what's on your mind, what to do next."></textarea><div class="row" style="margin-top:8px"><button class="p" id="chat-send" onclick="sendChat()">Send</button><button onclick="clearChat()">New conversation</button></div></div></section>
<section id="v-do" class="v hide"><h1>Next actions</h1><div id="do"></div>
 <div class="card"><h2>Add</h2><input id="a-title" placeholder="Next action, starting with a verb"><div class="row" style="margin-top:8px"><select id="a-ctx" class="grow"></select><select id="a-en" class="grow"><option value="low">low energy</option><option value="medium">medium</option><option value="high">high</option></select><input id="a-min" type="number" min="1" value="15" style="width:90px"></div><div class="row" style="margin-top:8px"><button class="p" onclick="addAction()">Add</button></div></div></section>
<section id="v-learn" class="v hide"><h1>Review</h1><div id="learn"></div>
 <div class="card"><h2>New card</h2><input id="c-front" placeholder="Question"><textarea id="c-back" placeholder="Answer" style="margin-top:8px;min-height:60px"></textarea><div class="row" style="margin-top:8px"><button class="p" onclick="addCard()">Add card</button></div></div></section>
<section id="v-journal" class="v hide"><h1>Journal</h1><div class="card"><textarea id="j-text" placeholder="One line is enough."></textarea><div class="row" style="margin-top:8px"><button class="p" onclick="addJournal()">Keep it</button></div><div id="j-out"></div></div><div class="card"><h2>Recent</h2><div id="journal"></div></div></section>
<section id="v-data" class="v hide"><h1>Patterns and privacy</h1><div id="dash"></div><div id="priv"></div></section>
</main>
<nav><button data-v="today" class="on">Today</button><button data-v="capture">Capture</button><button data-v="talk">Talk</button><button data-v="do">Do</button><button data-v="learn">Learn</button><button data-v="journal">Journal</button><button data-v="data">Data</button></nav>
<script>
var VERSION='__VERSION__';
function $(i){return document.getElementById(i)}
function el(t,a,kids){var e=document.createElement(t);if(a)for(var k in a){if(k==='text')e.textContent=a[k];else if(k==='cls')e.className=a[k];else if(k.slice(0,2)==='on')e[k]=a[k];else e.setAttribute(k,a[k])}(kids||[]).forEach(function(c){if(c)e.appendChild(typeof c==='string'?document.createTextNode(c):c)});return e}
function getKey(){try{var k=localStorage.getItem('cmp-key');if(k)return k;var o=JSON.parse(localStorage.getItem('qnfo-chat')||'{}');return o.key||''}catch(e){return ''}}
function saveKey(){try{localStorage.setItem('cmp-key',$('key').value.trim())}catch(e){}$('login').classList.add('hide');go('today')}
function api(path,opt){opt=opt||{};opt.headers=Object.assign({'Authorization':'Bearer '+getKey()},opt.headers||{});if(opt.json!==undefined){opt.method=opt.method||'POST';opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(opt.json);delete opt.json}
 return fetch(path,opt).then(function(r){if(r.status===401){$('login').classList.remove('hide');throw new Error('key needed')}return r.json()})}
function say(box,text,warn){if(!text)return;box.appendChild(el('div',{cls:warn?'warn':'say',text:text}))}
var MOOD=['rough','low','okay','good','great'],EN=['empty','thin','steady','strong','full'],TAGS=['sleep','body','social','alone','work','outside','money','family','creative'];
var pick={mood:null,energy:null,tags:{}};
function scale(name,words){var r=el('div',{cls:'row scale'});words.forEach(function(w,i){var b=el('button',{onclick:function(){pick[name]=i+1;Array.prototype.forEach.call(r.children,function(c,j){c.classList.toggle('sel',j===i)})}},[String(i+1),el('small',{text:w})]);r.appendChild(b)});return r}
function renderToday(t){var v=$('v-today');v.innerHTML='';v.appendChild(el('h1',{text:t.greeting+', Rowan.'}));
 if(t.low_day)v.appendChild(el('div',{cls:'card'},[el('div',{text:'Today looks heavy. Nothing on this page is required. If you want, start with water and a window.'})]));
 (t.open_nudges||[]).forEach(function(n){var c=el('div',{cls:'card'},[el('div',{text:n.ask})]);if(['checkin','cmp-checkin','presence','cmp-presence'].indexOf(n.kind)<0){c.appendChild(el('div',{cls:'row',style:'margin-top:8px'},[el('button',{cls:'p',text:'Did it',onclick:function(){answer(n.id,'done',c)}}),el('button',{text:'Not today',onclick:function(){answer(n.id,'declined',c)}})]))}v.appendChild(c)});
 var m=el('div',{cls:'card'});m.appendChild(el('h2',{text:t.mood&&t.mood.today?'Mood today: '+t.mood.today+'/5 (log again any time)':'How are you?'}));
 pick={mood:null,energy:null,tags:{}};m.appendChild(scale('mood',MOOD));m.appendChild(el('div',{cls:'mute',text:'energy',style:'margin:8px 0 4px'}));m.appendChild(scale('energy',EN));
 var tg=el('div',{cls:'row',style:'margin-top:8px'});TAGS.forEach(function(x){var b=el('button',{cls:'chip',text:x,onclick:function(){pick.tags[x]=!pick.tags[x];b.classList.toggle('sel',!!pick.tags[x])}});tg.appendChild(b)});m.appendChild(tg);
 var note=el('input',{placeholder:'a word or a line (optional)',style:'margin-top:8px'});m.appendChild(note);var out=el('div');
 m.appendChild(el('div',{cls:'row',style:'margin-top:8px'},[el('button',{cls:'p',text:'Log',onclick:function(){if(!pick.mood){say(out,'Pick a number first.');return}api('/companion/api/mood',{json:{score:pick.mood,energy:pick.energy,tags:Object.keys(pick.tags).filter(function(k){return pick.tags[k]}),note:note.value}}).then(function(r){out.innerHTML='';say(out,r.reply||r.error);if(r.crisis)say(out,r.crisis,true);setTimeout(load,1800)})}})]));m.appendChild(out);v.appendChild(m);
 if(!t.push_ready)v.appendChild(el('div',{cls:'card'},[el('div',{text:'Let me reach you here: a few gentle notifications a day at most, never at night.'}),el('div',{cls:'row',style:'margin-top:8px'},[el('button',{cls:'p',text:'Turn on notifications',onclick:enablePush})])]));
 if(t.one_thing){var o=el('div',{cls:'card'},[el('h2',{text:'One thing, if you want it'}),el('div',{text:t.one_thing.title+' ('+(t.one_thing.minutes||15)+' min, '+(t.one_thing.context||'@anywhere')+')'})]);o.appendChild(el('div',{cls:'row',style:'margin-top:8px'},[el('button',{cls:'p',text:'Done',onclick:function(){api('/companion/api/actions/done',{json:{id:t.one_thing.id}}).then(function(r){o.innerHTML='';say(o,r.reply||r.error);setTimeout(load,1500)})}})]));v.appendChild(o)}
 var info=[];if(t.sleep)info.push('Quiet overnight '+t.sleep.from+' to '+t.sleep.to+' (about '+t.sleep.hours+' h, from message times).');if(t.weather&&t.weather.weather)info.push('Weather: '+(typeof t.weather.weather==='string'?t.weather.weather:(t.weather.weather.summary||JSON.stringify(t.weather.weather))).slice(0,140));
 if(t.mood&&t.mood.avg7)info.push('Mood this week: '+t.mood.avg7+' on average.');function pl(n,w){return n+' '+w+(n===1?'':'s')}info.push(t.actions_done_today+' done today. '+pl(t.due_cards,'card')+' ready. '+pl(t.next_actions.length,'next action')+'.');
 v.appendChild(el('div',{cls:'card'},[el('h2',{text:'Today'})].concat(info.map(function(x){return el('div',{cls:'mute',text:x})}))));
 v.appendChild(el('div',{cls:'mute',text:'Companion '+VERSION+'. Nudges today: '+t.nudges_today+' of '+t.cap+'.'}))}
function answer(id,state,box){api('/companion/api/nudge',{json:{id:id,state:state}}).then(function(r){box.innerHTML='';say(box,r.reply||r.error)})}
function load(){api('/companion/api/today').then(renderToday).catch(function(e){})}
function capText(){var t=$('cap-text').value.trim();if(!t)return;$('cap-out').innerHTML='';say($('cap-out'),'Saving...');api('/companion/api/capture',{json:{text:t}}).then(function(r){$('cap-text').value='';showCap(r)})}
function showCap(r){var o=$('cap-out');o.innerHTML='';if(!r.ok){say(o,r.error||'failed');return}var p=r.processed||{};var w={action:'Next action',project:'Project',someday:'Someday',reference:'Kept as reference',journal:'Journal',card:'Flashcard',trash:'Nothing to keep'}[p.type]||'In the inbox';
 say(o,w+(p.title?': '+p.title:'')+(p.context?' ('+p.context+')':'')+(r.kind!=='text'&&r.text?'\\n\\nI heard/saw: '+r.text.slice(0,400):''));if(p.crisis)say(o,p.crisis,true);inbox()}
var rec=null,chunks=[];function toggleRec(){if(rec){rec.stop();return}navigator.mediaDevices.getUserMedia({audio:true}).then(function(st){chunks=[];rec=new MediaRecorder(st);rec.ondataavailable=function(e){chunks.push(e.data)};rec.onstop=function(){st.getTracks().forEach(function(t){t.stop()});var b=new Blob(chunks,{type:rec.mimeType||'audio/webm'});rec=null;$('rec').textContent='Voice note';$('rec').classList.remove('sel');upload(b,'voice.'+(b.type.indexOf('mp4')>=0?'m4a':'webm'))};rec.start();$('rec').textContent='Stop';$('rec').classList.add('sel')}).catch(function(e){say($('cap-out'),'Microphone not available: '+e.message)})}
function capImg(inp){if(inp.files&&inp.files[0])upload(inp.files[0],inp.files[0].name);inp.value=''}
function upload(blob,name){var f=new FormData();f.append('file',blob,name);f.append('text',$('cap-text').value.trim());$('cap-out').innerHTML='';say($('cap-out'),'Listening/looking...');api('/companion/api/capture',{method:'POST',body:f}).then(function(r){$('cap-text').value='';showCap(r)}).catch(function(e){say($('cap-out'),e.message)})}
function inbox(){api('/companion/api/inbox').then(function(r){var b=$('inbox');b.innerHTML='';(r.items||[]).slice(0,15).forEach(function(i){var res={};try{res=JSON.parse(i.result_json||'{}')}catch(e){}b.appendChild(el('div',{cls:'item'},[el('div',{cls:'grow'},[el('div',{text:(i.raw_text||'(no text)').slice(0,160)}),el('div',{cls:'mute',text:i.ts.slice(0,16).replace('T',' ')+' · '+i.kind+' · '+(res.type||i.status)})])]))})})}
var hist=[];try{hist=JSON.parse(sessionStorage.getItem('cmp-hist')||'[]')}catch(e){}
function drawChat(){var b=$('msgs');b.innerHTML='';hist.forEach(function(m){b.appendChild(el('div',{cls:'msg '+(m.role==='user'?'me':'it'),text:m.content}))});window.scrollTo(0,document.body.scrollHeight)}
function sendChat(){var t=$('chat-in').value.trim();if(!t)return;hist.push({role:'user',content:t});$('chat-in').value='';drawChat();$('chat-send').disabled=true;
 api('/companion/api/chat',{json:{thread_id:'companion-'+new Date().toISOString().slice(0,10),messages:hist.slice(-16)}}).then(function(r){var c=r.reply||r.error||'(no answer)';if(r.crisis)c=c+'\\n\\n'+r.crisis;hist.push({role:'assistant',content:c});try{sessionStorage.setItem('cmp-hist',JSON.stringify(hist.slice(-30)))}catch(e){}drawChat()}).catch(function(e){hist.push({role:'assistant',content:'I could not answer just now: '+e.message});drawChat()}).then(function(){$('chat-send').disabled=false})}
function clearChat(){hist=[];try{sessionStorage.removeItem('cmp-hist')}catch(e){}drawChat()}
var CTX=[];function loadDo(){api('/companion/api/actions').then(function(r){CTX=r.contexts||[];var s=$('a-ctx');if(!s.options.length)CTX.forEach(function(c){s.appendChild(el('option',{value:c.name,text:c.name}))});var b=$('do');b.innerHTML='';var groups={};(r.actions||[]).forEach(function(a){var g=a.gtd==='next'?(a.context||'@anywhere'):a.gtd;(groups[g]=groups[g]||[]).push(a)});
 Object.keys(groups).sort(function(x,y){return (x[0]==='@'?0:1)-(y[0]==='@'?0:1)||x.localeCompare(y)}).forEach(function(g){var c=el('div',{cls:'card'},[el('h2',{text:g})]);groups[g].forEach(function(a){var it=el('div',{cls:'item'},[el('div',{cls:'grow'},[el('div',{text:a.title}),el('div',{cls:'mute',text:(a.minutes||15)+' min · '+(a.energy||'low')+' energy'+(a.due?' · due '+a.due:'')})]),el('button',{text:'Done',onclick:function(){api('/companion/api/actions/done',{json:{id:a.id}}).then(function(){it.remove()})}}),a.gtd!=='next'?el('button',{text:'Now',onclick:function(){api('/companion/api/actions/move',{json:{id:a.id,gtd:'next'}}).then(loadDo)}}):el('button',{text:'Later',onclick:function(){api('/companion/api/actions/move',{json:{id:a.id,gtd:'someday'}}).then(loadDo)}})]);c.appendChild(it)});b.appendChild(c)});
 if(!(r.actions||[]).length)b.appendChild(el('div',{cls:'card mute',text:'Nothing here yet. Anything you capture that is a task lands here, sorted by where you can do it.'}))})}
function addAction(){var t=$('a-title').value.trim();if(!t)return;api('/companion/api/actions',{json:{title:t,context:$('a-ctx').value,energy:$('a-en').value,minutes:Number($('a-min').value)||15}}).then(function(){$('a-title').value='';loadDo()})}
var due=[],show=false;function loadLearn(){api('/companion/api/cards/due').then(function(r){due=r.cards||[];show=false;drawCard()})}
function drawCard(){var b=$('learn');b.innerHTML='';if(!due.length){b.appendChild(el('div',{cls:'card mute',text:'Nothing due. Cards come back just before you would forget them.'}));return}var c=due[0];var k=el('div',{cls:'card'},[el('div',{cls:'mute',text:due.length+' due'}),el('div',{cls:'flash',text:c.front})]);
 if(show){k.appendChild(el('div',{cls:'flash',text:c.back,style:'border-top:1px solid var(--line)'}));var r=el('div',{cls:'row'});[['Again',1],['Hard',2],['Good',3],['Easy',4]].forEach(function(x){r.appendChild(el('button',{cls:x[1]===3?'p grow':'grow',text:x[0],onclick:function(){api('/companion/api/cards/review',{json:{id:c.id,rating:x[1]}}).then(function(){due.shift();show=false;drawCard()})}}))});k.appendChild(r)}
 else k.appendChild(el('div',{cls:'row'},[el('button',{cls:'p grow',text:'Show answer',onclick:function(){show=true;drawCard()}})]));b.appendChild(k)}
function addCard(){var f=$('c-front').value.trim(),bk=$('c-back').value.trim();if(!f||!bk)return;api('/companion/api/cards',{json:{front:f,back:bk}}).then(function(){$('c-front').value='';$('c-back').value='';loadLearn()})}
function addJournal(){var t=$('j-text').value.trim();if(!t)return;api('/companion/api/journal',{json:{content:t}}).then(function(r){$('j-text').value='';$('j-out').innerHTML='';say($('j-out'),r.ok?'Kept. Thank you for writing it down.':r.error);if(r.crisis)say($('j-out'),r.crisis,true);loadJournal()})}
function loadJournal(){api('/companion/api/journal').then(function(r){var b=$('journal');b.innerHTML='';(r.entries||[]).forEach(function(j){b.appendChild(el('div',{cls:'item'},[el('div',{cls:'grow'},[el('div',{text:j.content.slice(0,600)}),el('div',{cls:'mute',text:j.date+(j.mood?' · '+j.mood:'')})])]))})})}
function loadData(){api('/companion/api/dashboard').then(function(d){var b=$('dash');b.innerHTML='';var c=el('div',{cls:'card'},[el('h2',{text:'Mood by week'})]);if(!(d.mood_weekly||[]).length)c.appendChild(el('div',{cls:'mute',text:'A few days of check-ins and the pattern shows up here.'}));
 (d.mood_weekly||[]).forEach(function(w){c.appendChild(el('div',{cls:'row'},[el('div',{text:w.week,style:'width:86px',cls:'mute'}),el('div',{cls:'grow'},[el('div',{cls:'bar',style:'width:'+Math.round((w.mood||0)/5*100)+'%'})]),el('div',{text:String(w.mood),style:'width:40px'})]))});b.appendChild(c);
 var t=el('table');t.appendChild(el('tr',{},[el('th',{text:'Nudge'}),el('th',{text:'sent'}),el('th',{text:'did it'}),el('th',{text:'not today'})]));(d.nudge_loop_28d||[]).forEach(function(n){t.appendChild(el('tr',{},[el('td',{text:n.kind}),el('td',{text:String(n.fired)}),el('td',{text:String(n.done)}),el('td',{text:String(n.declined)})]))});
 b.appendChild(el('div',{cls:'card'},[el('h2',{text:'How nudges landed (28 days)'}),t,el('div',{cls:'mute',text:'A kind of nudge that never lands is retired automatically.'})]));
 if((d.mood_by_tags_60d||[]).length){var tt=el('div',{cls:'card'},[el('h2',{text:'Mood by tags (60 days)'})]);d.mood_by_tags_60d.forEach(function(x){tt.appendChild(el('div',{cls:'mute',text:x.tags+': '+x.mood+' ('+x.n+')'}))});b.appendChild(tt)}});
 api('/companion/api/privacy').then(function(p){var b=$('priv');b.innerHTML='';var t=el('table');t.appendChild(el('tr',{},[el('th',{text:'What'}),el('th',{text:'rows'}),el('th',{text:'since'})]));p.tables.forEach(function(x){t.appendChild(el('tr',{},[el('td',{text:x.what}),el('td',{text:String(x.rows)}),el('td',{text:(x.oldest||'').slice(0,10)})]))});
 var conf=el('input',{placeholder:"type: delete everything"});var out=el('div');
 b.appendChild(el('div',{cls:'card'},[el('h2',{text:'Your data'}),el('div',{cls:'mute',text:p.where}),t,el('div',{cls:'mute',text:'Files: '+p.files.objects+' ('+Math.round(p.files.bytes/1024)+' KB). '+p.encryption,style:'margin-top:8px'}),
  el('div',{cls:'row',style:'margin-top:10px'},[el('button',{text:'Download everything',onclick:function(){fetch('/companion/api/export',{headers:{Authorization:'Bearer '+getKey()}}).then(function(r){return r.blob()}).then(function(bl){var a=el('a',{href:URL.createObjectURL(bl),download:'companion-export.json'});document.body.appendChild(a);a.click();a.remove()})}})]),
  el('div',{style:'margin-top:10px'},[el('div',{cls:'mute',text:'Delete everything the companion stored (captures, moods, cards, files, its nudges). Your older twin data stays.'}),conf,el('div',{cls:'row',style:'margin-top:6px'},[el('button',{text:'Delete',onclick:function(){api('/companion/api/delete',{json:{scope:'all',confirm:conf.value}}).then(function(r){out.innerHTML='';say(out,r.ok?'Deleted.':r.error)})}})]),out])]))})}
function b64ToU8(s){var p=s.replace(/-/g,'+').replace(/_/g,'/');var b=atob(p+'==='.slice((p.length+3)%4));var o=new Uint8Array(b.length);for(var i=0;i<b.length;i++)o[i]=b.charCodeAt(i);return o}
function enablePush(){if(!('serviceWorker' in navigator)||!('PushManager' in window)){alert('This browser cannot receive notifications. On iPhone, add this page to the home screen first.');return}
 Notification.requestPermission().then(function(perm){if(perm!=='granted')throw new Error('notifications were not allowed');return navigator.serviceWorker.register('/companion/sw.js',{scope:'/companion'})}).then(function(reg){return navigator.serviceWorker.ready.then(function(){return api('/companion/api/push/key')}).then(function(k){return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToU8(k.public_key)})})})
 .then(function(sub){return api('/companion/api/push/subscribe',{json:{subscription:sub.toJSON()}})}).then(function(){return api('/companion/api/push/test',{json:{}})}).then(load).catch(function(e){alert(e.message)})}
var views={today:load,capture:inbox,talk:drawChat,do:loadDo,learn:loadLearn,journal:loadJournal,data:loadData};
function go(v){Array.prototype.forEach.call(document.querySelectorAll('.v'),function(s){s.classList.add('hide')});$('v-'+v).classList.remove('hide');Array.prototype.forEach.call(document.querySelectorAll('nav button'),function(b){b.classList.toggle('on',b.getAttribute('data-v')===v)});if(getKey())views[v]()}
Array.prototype.forEach.call(document.querySelectorAll('nav button'),function(b){b.onclick=function(){go(b.getAttribute('data-v'))}});
function fromHash(){var h=location.hash.slice(1);if(!h)return;var q={};h.split('&').forEach(function(x){var p=x.split('=');q[p[0]]=decodeURIComponent(p[1]||'')});history.replaceState(null,'','/companion');if(q.n&&(q.a==='done'||q.a==='no'))api('/companion/api/nudge',{json:{id:Number(q.n),state:q.a==='done'?'done':'declined'}}).then(load)}
if('serviceWorker' in navigator)navigator.serviceWorker.register('/companion/sw.js',{scope:'/companion'}).catch(function(){});
if(!getKey())$('login').classList.remove('hide');else{fromHash();go('today')}
window.addEventListener('hashchange',fromHash);
</script></body></html>`;
