// personal-companion/wellbeing.js
// WELLBEING-LOOP-1 — the inbound side of the companion.
//
// WHY THIS FILE EXISTS (measured 2026-10-17 against personal-life D1 e8d6c61a):
//   chat 9206 · notes 780 · events 151   <- rich input
//   journal 0 · habits 0 · habit_log 0   <- no affect signal at all, ever
//   activity 3, last row 2026-08-28      <- 50 days stale; "what I actually did" is unknown
//   proactive_signals 30, shown 9, acted 0  <- 31 days of suggestions, none ever came back
//
// So the companion could write TO the owner and list his bookings. It could not tell how he was,
// and nothing it suggested ever closed. That is an outbound publisher plus an event lister.
// This module is the loop: capture -> decide -> ask -> observe -> adapt, and a FIXED escalation
// path when things are bad. Nothing here is model-generated: the owner's words are his own.
//
// Design rules this file enforces (each is a test in wellbeing.test.mjs):
//   1. One ask at a time. A nudge that is not answered expires; it is never re-sent.
//   2. Escalate only after a done. An expired ask drops one rung, never climbs.
//   3. Low mood caps the ladder at body (step 2). No task-shaped asks when mood <= 2.
//   4. Three unanswered in a row -> presence only, one message, no ask, for the rest of the day.
//   5. A kind that fires 6+ times with 0 done is retired automatically. (This is the observed defect.)
//   6. The crisis block is a static template filled from config. It can never hallucinate a number.

export const WELLBEING_VERSION = "1.0.0";

// A fixed ladder. Step size is deliberately tiny at the bottom: on a bad day the win is water.
export const LADDER = [
  { step: 1, kind: "micro",   minutes: 2,  slaMinutes: 90,   minHour: 7   },
  { step: 2, kind: "body",    minutes: 15, slaMinutes: 240,  minHour: 8   },
  { step: 3, kind: "contact", minutes: 10, slaMinutes: 720,  minHour: 10  },
  { step: 4, kind: "care",    minutes: 30, slaMinutes: 1440, minHour: 10  }
];

export const DEFAULT_CONFIG = {
  tz: "Europe/Amsterdam",      // IANA zone; the UTC offset is resolved per instant, so DST is not a bug
  tz_offset_min: 120,          // fallback only, if Intl is unavailable
  quiet_start: 22,             // local hour
  quiet_end: 7.5,
  max_per_day: 3,
  min_gap_min: 150,
  max_unanswered: 3,
  retire_after_fired: 6,
  retire_below_done_rate: 0.05,
  // Owner-specific. Empty by default ON PURPOSE: the escalation block must never invent a phone number.
  backstop_name: "",
  backstop_contact: "",
  crisis_lines: [],
  presence_line: "I'm here. Nothing needed from you right now.",
  // Candidate asks per rung. Replace with the owner's own list; these are placeholders that pass tests.
  candidates: {
    1: ["Drink a glass of water.", "Stand up and open a window.", "Six slow breaths, out longer than in.", "Put one thing back where it lives."],
    2: ["Step outside for five minutes, no phone.", "Shower, even if that's the whole day.", "Eat something with protein in it.", "Walk to the end of the street and back."],
    3: ["Message one person. One line is enough.", "Reply to the message you've been avoiding.", "Say yes to the next small invitation."],
    4: ["Book the appointment. Just the booking.", "Write down what you'd tell a doctor, one paragraph.", "Send the message that asks for help."]
  }
};

// ---------------------------------------------------------------- schema

export const DDL = [
  `CREATE TABLE IF NOT EXISTS wellbeing_checkins (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts TEXT NOT NULL,
     day TEXT NOT NULL,
     mood INTEGER,
     energy INTEGER,
     sleep_hours REAL,
     load TEXT,
     note TEXT,
     source TEXT NOT NULL DEFAULT 'reply',
     raw_json TEXT,
     UNIQUE(day, source)
   )`,

  `CREATE TRIGGER IF NOT EXISTS wellbeing_checkin_range_ins
   BEFORE INSERT ON wellbeing_checkins
   WHEN (NEW.mood IS NOT NULL AND (NEW.mood < 1 OR NEW.mood > 5))
     OR (NEW.energy IS NOT NULL AND (NEW.energy < 1 OR NEW.energy > 5))
     OR (NEW.sleep_hours IS NOT NULL AND (NEW.sleep_hours < 0 OR NEW.sleep_hours > 24))
   BEGIN SELECT RAISE(ABORT, 'WELLBEING-RANGE-1'); END`,

  // A check-in with no mood, no energy and no words is not a check-in.
  `CREATE TRIGGER IF NOT EXISTS wellbeing_checkin_empty_ins
   BEFORE INSERT ON wellbeing_checkins
   WHEN NEW.mood IS NULL AND NEW.energy IS NULL AND (NEW.note IS NULL OR length(trim(NEW.note)) = 0)
   BEGIN SELECT RAISE(ABORT, 'WELLBEING-EMPTY-1'); END`,

  `CREATE TABLE IF NOT EXISTS companion_nudges (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts TEXT NOT NULL,
     day TEXT NOT NULL,
     kind TEXT NOT NULL,
     ladder_step INTEGER NOT NULL DEFAULT 1,
     ask TEXT NOT NULL,
     minutes INTEGER,
     expected TEXT,
     due_at TEXT,
     state TEXT NOT NULL DEFAULT 'queued',
     sent_at TEXT,
     shown_at TEXT,
     closed_at TEXT,
     response TEXT,
     outcome TEXT,
     superseded_by INTEGER,
     reason TEXT,
     context_json TEXT
   )`,

  `CREATE TRIGGER IF NOT EXISTS nudge_state_ins
   BEFORE INSERT ON companion_nudges
   WHEN NEW.state NOT IN ('queued','sent','shown','done','declined','expired','superseded')
   BEGIN SELECT RAISE(ABORT, 'NUDGE-STATE-1'); END`,

  // done is a claim about the world; it must carry the moment it closed.
  `CREATE TRIGGER IF NOT EXISTS nudge_close_ins
   BEFORE INSERT ON companion_nudges
   WHEN NEW.state = 'done' AND NEW.closed_at IS NULL
   BEGIN SELECT RAISE(ABORT, 'NUDGE-CLOSE-1'); END`,

  // One open ask of a given kind per day. Expired/declined/superseded do not block a retry tomorrow.
  `CREATE TRIGGER IF NOT EXISTS nudge_dup_ins
   BEFORE INSERT ON companion_nudges
   WHEN EXISTS (
     SELECT 1 FROM companion_nudges
      WHERE day = NEW.day AND kind = NEW.kind
        AND state NOT IN ('expired','declined','superseded')
   )
   BEGIN SELECT RAISE(ABORT, 'NUDGE-DUP-1'); END`,

  `CREATE TABLE IF NOT EXISTS wellbeing_config (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,

  // The feedback loop, per kind. This is the table the old proactive_signals never had a reader for.
  `CREATE VIEW IF NOT EXISTS v_nudge_loop AS
   SELECT kind,
          COUNT(*) AS fired,
          SUM(CASE WHEN shown_at IS NOT NULL THEN 1 ELSE 0 END) AS shown,
          SUM(CASE WHEN state = 'done' THEN 1 ELSE 0 END) AS done,
          SUM(CASE WHEN state = 'expired' THEN 1 ELSE 0 END) AS expired,
          SUM(CASE WHEN state = 'declined' THEN 1 ELSE 0 END) AS declined,
          ROUND(1.0 * SUM(CASE WHEN state = 'done' THEN 1 ELSE 0 END) / COUNT(*), 3) AS done_rate,
          MAX(ts) AS last_ts
     FROM companion_nudges
    WHERE ts >= datetime('now', '-28 days')
    GROUP BY kind`,

  // Mood against its own recent baseline, not against a population norm.
  `CREATE VIEW IF NOT EXISTS v_wellbeing_trend AS
   SELECT day, mood, energy, sleep_hours,
          (SELECT ROUND(AVG(mood), 2) FROM wellbeing_checkins b
            WHERE b.day <= a.day AND b.day > date(a.day, '-7 days')) AS avg7,
          (SELECT ROUND(AVG(mood), 2) FROM wellbeing_checkins c
            WHERE c.day <= a.day AND c.day > date(a.day, '-28 days')) AS avg28
     FROM wellbeing_checkins a
    ORDER BY day`,

  // COVERAGE-SINGLE-ROW-1: one row, so a single read answers "is the loop actually being fed?".
  `CREATE VIEW IF NOT EXISTS v_wellbeing_coverage AS
   SELECT
     (SELECT MAX(day) FROM wellbeing_checkins) AS checkin_last,
     (SELECT COUNT(*) FROM wellbeing_checkins WHERE day >= date('now','-7 days')) AS checkins_7d,
     (SELECT MAX(ts) FROM companion_nudges) AS nudge_last,
     (SELECT COUNT(*) FROM companion_nudges WHERE ts >= datetime('now','-7 days')) AS nudges_7d,
     (SELECT COUNT(*) FROM companion_nudges WHERE closed_at IS NOT NULL AND closed_at >= datetime('now','-7 days')) AS answered_7d,
     (SELECT MAX(ts) FROM journal) AS journal_last,
     (SELECT COUNT(*) FROM journal WHERE ts >= datetime('now','-7 days')) AS journal_7d,
     (SELECT MAX(date) FROM activity) AS activity_last`
];

export async function ensureWellbeingSchema(db) {
  for (const sql of DDL) await db.prepare(sql).run();
  // Seed config keys that are absent. Never overwrite: the owner's words win.
  const nowIso = new Date().toISOString();
  for (const [key, value] of Object.entries(flatConfig(DEFAULT_CONFIG))) {
    await db.prepare(
      "INSERT INTO wellbeing_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING"
    ).bind(key, typeof value === "string" ? value : JSON.stringify(value), nowIso).run();
  }
}

function flatConfig(cfg) {
  const out = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (k === "candidates") continue;         // per-rung lists are code defaults, not config rows
    out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------- capture

const str = (v) => (v === null || v === undefined ? "" : String(v));

export async function recordCheckin(db, { mood, energy, sleep_hours, load, note, source = "reply", raw, ts } = {}) {
  const now = ts || new Date().toISOString();
  const day = dayKey(now);
  const m = mood === undefined || mood === null || mood === "" ? null : Number(mood);
  const e = energy === undefined || energy === null || energy === "" ? null : Number(energy);
  const s = sleep_hours === undefined || sleep_hours === null || sleep_hours === "" ? null : Number(sleep_hours);
  await db.prepare(
    `INSERT INTO wellbeing_checkins (ts, day, mood, energy, sleep_hours, load, note, source, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(day, source) DO UPDATE SET
       ts = excluded.ts, mood = COALESCE(excluded.mood, mood), energy = COALESCE(excluded.energy, energy),
       sleep_hours = COALESCE(excluded.sleep_hours, sleep_hours), load = COALESCE(excluded.load, load),
       note = COALESCE(excluded.note, note), raw_json = COALESCE(excluded.raw_json, raw_json)`
  ).bind(now, day, m, e, s, load ?? null, note ?? null, source, raw ? JSON.stringify(raw) : null).run();
  return { day, mood: m, energy: e, sleep_hours: s };
}

// A fixed +120 offset is wrong for half the year: Europe/Amsterdam is +0200 until 2026-10-25
// and +0100 after, which would shift quiet hours by an hour and file a 23:30 message under the
// next day. Resolve the offset from the IANA zone instead, per instant.
export function tzOffsetMinutes(tz, atMs = Date.now()) {
  if (typeof tz === "number") return tz;
  if (!tz) return DEFAULT_CONFIG.tz_offset_min;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
      .formatToParts(new Date(atMs));
    const name = (parts.find((p) => p.type === "timeZoneName") || {}).value || "GMT+00:00";
    const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
    if (!m) return 0;
    return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
  } catch {
    return DEFAULT_CONFIG.tz_offset_min;
  }
}

export function dayKey(iso, tz = DEFAULT_CONFIG.tz) {
  const t = new Date(iso).getTime() + tzOffsetMinutes(tz, new Date(iso).getTime()) * 60000;
  return new Date(t).toISOString().slice(0, 10);
}

export function localHourFloat(iso, tz = DEFAULT_CONFIG.tz) {
  const t = new Date(iso).getTime() + tzOffsetMinutes(tz, new Date(iso).getTime()) * 60000;
  const d = new Date(t);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

// ---------------------------------------------------------------- judgement

export function inQuiet(hourFloat, quietStart, quietEnd) {
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) return hourFloat >= quietStart && hourFloat < quietEnd;
  return hourFloat >= quietStart || hourFloat < quietEnd;   // wraps midnight
}

// Drift is measured against the owner's own baseline and against the observable record,
// not against a questionnaire.
//
// Weak vs strong (fixed 2026-10-17 after the first live read): `activity` is 50 days stale by
// design and `chat` volume moves when he changes client, so those two can never declare drift on
// their own - a false "you are withdrawing" is worse than a missed week. Text signals (a note gap,
// a night shift) and self-report are what carry the judgement.
export function drift(ctx = {}) {
  const strong = [];
  const weak = [];
  if ((ctx.days_since_note ?? 0) > 3) weak.push({ k: "note", why: "no note for " + Math.round(ctx.days_since_note) + "d" });
  if ((ctx.night_share ?? 0) > 0.25) weak.push({ k: "night", why: "night share " + Math.round(ctx.night_share * 100) + "%" });
  if (ctx.volume_ratio !== undefined && ctx.volume_ratio !== null && ctx.volume_ratio < 0.5) {
    weak.push({ k: "volume", why: "volume " + Math.round(ctx.volume_ratio * 100) + "% of baseline" });
  }
  if ((ctx.days_since_activity ?? 0) > 10) weak.push({ k: "activity", why: "no logged activity for " + Math.round(ctx.days_since_activity) + "d" });

  const moodToday = ctx.mood_today;
  const moodAvg = ctx.mood_avg7;
  if (moodToday === 1) strong.push({ k: "mood", why: "mood 1 today" });
  else if (moodToday !== null && moodToday !== undefined && moodToday <= 2 &&
           moodAvg !== null && moodAvg !== undefined && moodAvg <= 2.5) {
    strong.push({ k: "mood", why: "mood " + moodToday + " on a " + moodAvg + " week" });
  }
  if ((ctx.unanswered_streak ?? 0) >= 3) strong.push({ k: "unanswered", why: ctx.unanswered_streak + " unanswered asks" });
  if (ctx.mood_drop_2d) strong.push({ k: "mood-drop", why: "mood fell sharply in 2 days" });

  const reasons = strong.concat(weak).map((r) => r.why);
  const textSignal = weak.some((w) => w.k === "note" || w.k === "night");

  let level = "ok";
  if (strong.length) level = "shaky";
  else if (weak.length >= 2 && textSignal) level = "drift";
  else if (weak.length) level = "watch";

  return { level, reasons, strong: strong.map((s) => s.k), weak: weak.map((w) => w.k) };
}

function lastDone(recent, kind) {
  let best = null;
  for (const r of recent) {
    if (r.kind !== kind || r.state !== "done") continue;
    if (!best || String(r.ts) > String(best.ts)) best = r;
  }
  return best;
}

// retire: fired >= N and done_rate < floor. This is what makes the loop self-correcting.
// Without it the companion repeats what has never once worked, which is exactly the 0/30 defect.
export function retiredKinds(loopRows, cfg = DEFAULT_CONFIG) {
  const out = new Set();
  for (const row of loopRows) {
    const fired = Number(row.fired || 0);
    const rate = Number(row.done_rate || 0);
    if (fired >= (cfg.retire_after_fired ?? 6) && rate <= (cfg.retire_below_done_rate ?? 0.05)) out.add(row.kind);
  }
  return out;
}

// ---------------------------------------------------------------- the decision

// Pure. Everything it needs is passed in, so every rule is testable without a database.
// Returns null (stay quiet) or one ask.
export function planNext({ nowIso, ctx = {}, cfg = DEFAULT_CONFIG, recent = [], loopRows = [] }) {
  const hour = localHourFloat(nowIso);
  const today = dayKey(nowIso);
  const nowMs = new Date(nowIso).getTime();

  if (inQuiet(hour, cfg.quiet_start, cfg.quiet_end)) return { skip: "quiet-hours" };

  const retired = retiredKinds(loopRows, cfg);

  // Rule 4: three unanswered -> presence only, once, then silence.
  if ((ctx.unanswered_streak ?? 0) >= (cfg.max_unanswered ?? 3)) {
    const already = recent.some((r) => r.day === today && r.kind === "presence");
    if (already) return { skip: "presence-already-sent" };
    return {
      kind: "presence", ladder_step: 0, minutes: 0,
      ask: cfg.presence_line, expected: null,
      due_at: new Date(nowMs + 6 * 3600e3).toISOString(),
      reason: "unanswered-streak=" + ctx.unanswered_streak
    };
  }

  const todays = recent.filter((r) => r.day === today && r.state !== "superseded");
  if (todays.length >= (cfg.max_per_day ?? 3)) return { skip: "daily-cap" };

  const lastSent = recent
    .filter((r) => r.sent_at || r.ts)
    .map((r) => new Date(r.sent_at || r.ts).getTime())
    .sort((a, b) => b - a)[0];
  if (lastSent && nowMs - lastSent < (cfg.min_gap_min ?? 150) * 60000) return { skip: "min-gap" };

  // Rule 3: on a bad day the ladder is capped at body, and body is preferred over any task shape.
  const lowMood = ctx.mood_today !== null && ctx.mood_today !== undefined && ctx.mood_today <= 2;
  const capStep = lowMood ? 2 : 4;

  // Rule 2: escalate only after a done; an expired ask drops one rung.
  let step = 1;
  const last = recent
    .filter((r) => r.state === "done" || r.state === "expired")
    .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];
  if (last) {
    const prev = Number(last.ladder_step || 1);
    step = last.state === "done" ? prev + 1 : Math.max(1, prev - 1);
  }
  if (!recent.some((r) => r.state === "done")) step = 1;   // nothing has landed yet: start at the floor
  step = Math.min(Math.max(1, step), capStep);

  // A rung that is not allowed at this hour is not a rung today.
  while (step > 1) {
    const rung = LADDER[step - 1];
    if (hour >= (rung.minHour ?? 0) && !retired.has(rung.kind)) break;
    step -= 1;
  }
  let rung = LADDER[step - 1];
  if (retired.has(rung.kind)) {
    const alt = LADDER.filter((r) => !retired.has(r.kind) && hour >= (r.minHour ?? 0) && r.step <= capStep);
    if (!alt.length) return { skip: "all-kinds-retired" };
    rung = alt[0];
  }

  // Do not repeat the same kind inside 48h unless there is nothing else.
  const usedKinds = new Set(
    recent.filter((r) => nowMs - new Date(r.ts).getTime() < 48 * 3600e3).map((r) => r.kind)
  );
  let pool = (cfg.candidates?.[rung.step] || []).filter(Boolean);
  if (!pool.length) return { skip: "no-candidate" };

  const recentAsks = new Set(recent.map((r) => str(r.ask)));
  let fresh = pool.filter((a) => !recentAsks.has(str(a)));
  if (!fresh.length) fresh = pool;

  // Deterministic pick: least recently used, so the same line never loops.
  const lastUse = (a) => {
    const hit = recent.filter((r) => str(r.ask) === str(a)).map((r) => String(r.ts)).sort().pop();
    return hit || "";
  };
  fresh.sort((a, b) => lastUse(a).localeCompare(lastUse(b)) || a.localeCompare(b));

  return {
    kind: rung.kind,
    ladder_step: rung.step,
    minutes: rung.minutes,
    ask: fresh[0],
    expected: "log:" + rung.kind,
    due_at: new Date(nowMs + rung.slaMinutes * 60000).toISOString(),
    reason: "step=" + rung.step + (lowMood ? " low-mood-cap" : "") + (usedKinds.has(rung.kind) ? " repeat-within-48h" : "")
  };
}

// ---------------------------------------------------------------- the closed loop

export async function expireStale(db, nowIso = new Date().toISOString()) {
  const r = await db.prepare(
    `UPDATE companion_nudges SET state = 'expired', closed_at = ?
      WHERE state IN ('sent','shown') AND due_at IS NOT NULL AND due_at < ?`
  ).bind(nowIso, nowIso).run();
  return r.meta?.changes ?? 0;
}

export async function closeNudge(db, id, { state, response, outcome, nowIso } = {}) {
  const now = nowIso || new Date().toISOString();
  if (!["done", "declined", "expired", "superseded"].includes(state)) throw new Error("NUDGE-STATE-1");
  await db.prepare(
    "UPDATE companion_nudges SET state = ?, closed_at = ?, response = ?, outcome = ? WHERE id = ?"
  ).bind(state, now, response ?? null, outcome ?? null, id).run();
}

export async function unansweredStreak(db) {
  // Only asks count. A morning check-in or a presence line sitting in 'sent' is not an ignored ask,
  // and counting it would push the companion into presence mode after three ordinary mornings.
  const kinds = LADDER.map((r) => "'" + r.kind + "'").join(",");
  const r = await db.prepare(
    "SELECT state FROM companion_nudges WHERE kind IN (" + kinds + ") AND state IN ('sent','shown','done','declined','expired') ORDER BY ts DESC LIMIT 10"
  ).all();
  let n = 0;
  for (const row of r.results || []) {
    if (row.state === "done" || row.state === "declined") break;
    n += 1;
  }
  return n;
}

// What actually helped, per person, measured on the next day's numbers.
export async function whatHelped(db, days = 60) {
  const r = await db.prepare(
    `SELECT n.kind,
            COUNT(*) AS done_n,
            ROUND(AVG(c.mood), 2) AS mood_next_day,
            ROUND(AVG(c.energy), 2) AS energy_next_day
       FROM companion_nudges n
       JOIN wellbeing_checkins c ON c.day = date(n.day, '+1 day')
      WHERE n.state = 'done' AND n.ts >= datetime('now', ?)
      GROUP BY n.kind
      ORDER BY done_n DESC`
  ).bind("-" + Number(days) + " days").all();
  return r.results || [];
}

// ---------------------------------------------------------------- escalation (fixed text only)

// SLA: 60 seconds, three independent paths. No model call anywhere in this path.
export function crisisBlock(cfg = DEFAULT_CONFIG) {
  const lines = Array.isArray(cfg.crisis_lines) ? cfg.crisis_lines : [];
  const has = (s) => s && String(s).trim().length > 0;
  return {
    sla_seconds: 60,
    paths: ["chat", "email", "dashboard-card"],
    text: [
      "I'm not going to argue with you about this, and I'm not qualified to.",
      has(cfg.backstop_name) || has(cfg.backstop_contact)
        ? "Tell " + (cfg.backstop_name || "your person") + " you're not okay. Right now, one line."
        : "Tell one real person you're not okay. Right now, one line. (No backstop is configured yet - add one.)",
      lines.length
        ? "If it gets worse, call: " + lines.map((l) => (l && l.label ? l.label + " " + l.number : l.number || l)).join(" · ")
        : "If it gets worse, use your local emergency number. (No crisis lines configured yet.)",
      "Nothing here needs to be solved tonight."
    ].join("\n")
  };
}

// Stems, not phrases. A phrase list misses every inflection ("hurt myself" does not match
// "hurting myself" - that gap was caught by this file's own test on 2026-10-17), and a missed
// inflection is the one failure this detector cannot afford.
const HARD = [
  /\b(kill|killing|kills)\s+my\s?self\b/,
  /\b(end|ending)\s+(it\s+all|my\s+life)\b/,
  /\b(take|taking)\s+my\s+own\s+life\b/,
  /\b(want|wanna|wish)\s+(to\s+)?(die|be\s+dead)\b/,
  /\bbetter\s+off\s+dead\b/,
  /\bno\s+(reason|point)\s+(to|in)\s+(live|living|go\s+on|going\s+on)\b/,
  /\bsuicid\w*\b/,
  /\bself[-\s]?harm\w*\b/,
  /\b(overdos\w*)\b/,
  // "cut myself some slack" is not a crisis. The lookahead keeps ordinary English out.
  /\b(hurt|harm|cut|burn|starve|poison|stab|choke)\w*\s+my\s?self\b(?!\s+(some|a)\s+(slack|break))/,
  /\b(don'?t|do\s+not)\s+want\s+to\s+(be\s+here|exist|wake\s+up)\b/
];

const SOFT = [
  "can't go on", "cant go on", "can not go on", "give up", "hopeless", "pointless",
  "nothing matters", "can't cope", "cant cope", "falling apart", "hate myself",
  "so tired of everything", "what's the point", "whats the point", "numb"
];

export function crisisSignal(text) {
  const t = String(text || "").toLowerCase().replace(/\s+/g, " ");
  for (const re of HARD) {
    const m = t.match(re);
    if (m) return { level: 2, match: m[0] };
  }
  const s = SOFT.find((p) => t.includes(p));
  if (s) return { level: 1, match: s };
  return { level: 0, match: null };
}
