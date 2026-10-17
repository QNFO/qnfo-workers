var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
import { WorkflowEntrypoint } from "cloudflare:workers";

// wellbeing.js
var LADDER = [
  { step: 1, kind: "micro", minutes: 2, slaMinutes: 90, minHour: 7 },
  { step: 2, kind: "body", minutes: 15, slaMinutes: 240, minHour: 8 },
  { step: 3, kind: "contact", minutes: 10, slaMinutes: 720, minHour: 10 },
  { step: 4, kind: "care", minutes: 30, slaMinutes: 1440, minHour: 10 }
];
var DEFAULT_CONFIG = {
  tz: "Europe/Amsterdam",
  // IANA zone; the UTC offset is resolved per instant, so DST is not a bug
  tz_offset_min: 120,
  // fallback only, if Intl is unavailable
  quiet_start: 22,
  // local hour
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
  // Names the contact rung may use. Empty means the generic "message one person" line; a name is
  // far more likely to be acted on than a category, so fill this the moment the owner names anyone.
  contact_candidates: [],
  presence_line: "I'm here. Nothing needed from you right now.",
  // Candidate asks per rung. Replace with the owner's own list; these are placeholders that pass tests.
  candidates: {
    1: ["Drink a glass of water.", "Stand up and open a window.", "Six slow breaths, out longer than in.", "Put one thing back where it lives."],
    2: ["Step outside for five minutes, no phone.", "Shower, even if that's the whole day.", "Eat something with protein in it.", "Walk to the end of the street and back."],
    3: ["Message one person. One line is enough.", "Reply to the message you've been avoiding.", "Say yes to the next small invitation."],
    4: ["Book the appointment. Just the booking.", "Write down what you'd tell a doctor, one paragraph.", "Send the message that asks for help."]
  }
};
var DDL = [
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
async function ensureWellbeingSchema(db) {
  for (const sql of DDL) await db.prepare(sql).run();
  const nowIso2 = (/* @__PURE__ */ new Date()).toISOString();
  for (const [key, value] of Object.entries(flatConfig(DEFAULT_CONFIG))) {
    await db.prepare(
      "INSERT INTO wellbeing_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING"
    ).bind(key, typeof value === "string" ? value : JSON.stringify(value), nowIso2).run();
  }
}
__name(ensureWellbeingSchema, "ensureWellbeingSchema");
function flatConfig(cfg2) {
  const out = {};
  for (const [k, v] of Object.entries(cfg2)) {
    if (k === "candidates") continue;
    out[k] = v;
  }
  return out;
}
__name(flatConfig, "flatConfig");
var str = /* @__PURE__ */ __name((v) => v === null || v === void 0 ? "" : String(v), "str");
async function recordCheckin(db, { mood, energy, sleep_hours, load, note, source = "reply", raw, ts } = {}) {
  const now = ts || (/* @__PURE__ */ new Date()).toISOString();
  const day = dayKey(now);
  const m = mood === void 0 || mood === null || mood === "" ? null : Number(mood);
  const e = energy === void 0 || energy === null || energy === "" ? null : Number(energy);
  const s = sleep_hours === void 0 || sleep_hours === null || sleep_hours === "" ? null : Number(sleep_hours);
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
__name(recordCheckin, "recordCheckin");
function tzOffsetMinutes(tz, atMs = Date.now()) {
  if (typeof tz === "number") return tz;
  if (!tz) return DEFAULT_CONFIG.tz_offset_min;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(new Date(atMs));
    const name = (parts.find((p) => p.type === "timeZoneName") || {}).value || "GMT+00:00";
    const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
    if (!m) return 0;
    return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
  } catch {
    return DEFAULT_CONFIG.tz_offset_min;
  }
}
__name(tzOffsetMinutes, "tzOffsetMinutes");
function dayKey(iso, tz = DEFAULT_CONFIG.tz) {
  const t = new Date(iso).getTime() + tzOffsetMinutes(tz, new Date(iso).getTime()) * 6e4;
  return new Date(t).toISOString().slice(0, 10);
}
__name(dayKey, "dayKey");
function localHourFloat(iso, tz = DEFAULT_CONFIG.tz) {
  const t = new Date(iso).getTime() + tzOffsetMinutes(tz, new Date(iso).getTime()) * 6e4;
  const d = new Date(t);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}
__name(localHourFloat, "localHourFloat");
function inQuiet(hourFloat, quietStart, quietEnd) {
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) return hourFloat >= quietStart && hourFloat < quietEnd;
  return hourFloat >= quietStart || hourFloat < quietEnd;
}
__name(inQuiet, "inQuiet");
function drift(ctx = {}) {
  const strong = [];
  const weak = [];
  const noteGap = ctx.days_since_daily_note !== void 0 && ctx.days_since_daily_note !== null ? ctx.days_since_daily_note : ctx.days_since_note;
  if ((noteGap ?? 0) > 3) weak.push({ k: "note", why: "no daily note for " + Math.round(noteGap) + "d" });
  if ((ctx.night_share ?? 0) > 0.25) weak.push({ k: "night", why: "night share " + Math.round(ctx.night_share * 100) + "%" });
  if (ctx.volume_ratio !== void 0 && ctx.volume_ratio !== null && ctx.volume_ratio < 0.5) {
    weak.push({ k: "volume", why: "volume " + Math.round(ctx.volume_ratio * 100) + "% of baseline" });
  }
  if ((ctx.days_since_activity ?? 0) > 10) weak.push({ k: "activity", why: "no logged activity for " + Math.round(ctx.days_since_activity) + "d" });
  const moodToday = ctx.mood_today;
  const moodAvg = ctx.mood_avg7;
  if (moodToday === 1) strong.push({ k: "mood", why: "mood 1 today" });
  else if (moodToday !== null && moodToday !== void 0 && moodToday <= 2 && moodAvg !== null && moodAvg !== void 0 && moodAvg <= 2.5) {
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
__name(drift, "drift");
function retiredKinds(loopRows2, cfg2 = DEFAULT_CONFIG) {
  const out = /* @__PURE__ */ new Set();
  for (const row of loopRows2) {
    const fired = Number(row.fired || 0);
    const rate = Number(row.done_rate || 0);
    if (fired >= (cfg2.retire_after_fired ?? 6) && rate <= (cfg2.retire_below_done_rate ?? 0.05)) out.add(row.kind);
  }
  return out;
}
__name(retiredKinds, "retiredKinds");
function planNext({ nowIso: nowIso2, ctx = {}, cfg: cfg2 = DEFAULT_CONFIG, recent = [], loopRows: loopRows2 = [] }) {
  const hour = localHourFloat(nowIso2);
  const today = dayKey(nowIso2);
  const nowMs = new Date(nowIso2).getTime();
  if (inQuiet(hour, cfg2.quiet_start, cfg2.quiet_end)) return { skip: "quiet-hours" };
  const retired = retiredKinds(loopRows2, cfg2);
  const shaky = ctx.drift_level === "shaky";
  if (shaky) {
    const checkedIn = ctx.checked_in === true || ctx.mood_today !== null && ctx.mood_today !== void 0 || ctx.energy_today !== null && ctx.energy_today !== void 0;
    if (!checkedIn) {
      if (recent.some((r) => r.day === today && r.kind === "checkin")) {
        if (recent.some((r) => r.day === today && r.kind === "presence")) return { skip: "shaky-already-touched" };
        return {
          kind: "presence",
          ladder_step: 0,
          minutes: 0,
          ask: cfg2.presence_line,
          expected: null,
          due_at: new Date(nowMs + 6 * 36e5).toISOString(),
          reason: "shaky-presence"
        };
      }
      return {
        kind: "checkin",
        ladder_step: 0,
        minutes: 0,
        ask: "How's it landing today?",
        expected: "log:checkin",
        due_at: new Date(nowMs + 6 * 36e5).toISOString(),
        reason: "shaky-no-checkin"
      };
    }
  }
  if (shaky) cfg2 = { ...cfg2, max_per_day: Math.min(cfg2.max_per_day ?? 3, 1) };
  if ((ctx.unanswered_streak ?? 0) >= (cfg2.max_unanswered ?? 3)) {
    const already = recent.some((r) => r.day === today && r.kind === "presence");
    if (already) return { skip: "presence-already-sent" };
    return {
      kind: "presence",
      ladder_step: 0,
      minutes: 0,
      ask: cfg2.presence_line,
      expected: null,
      due_at: new Date(nowMs + 6 * 36e5).toISOString(),
      reason: "unanswered-streak=" + ctx.unanswered_streak
    };
  }
  const todays = recent.filter((r) => r.day === today && r.state !== "superseded");
  if (todays.length >= (cfg2.max_per_day ?? 3)) return { skip: "daily-cap" };
  const lastSent = recent.filter((r) => r.sent_at || r.ts).map((r) => new Date(r.sent_at || r.ts).getTime()).sort((a, b) => b - a)[0];
  if (lastSent && nowMs - lastSent < (cfg2.min_gap_min ?? 150) * 6e4) return { skip: "min-gap" };
  const lowMood = ctx.mood_today !== null && ctx.mood_today !== void 0 && ctx.mood_today <= 2;
  const capStep = lowMood ? 2 : 4;
  let step = 1;
  const last = recent.filter((r) => r.state === "done" || r.state === "expired").sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];
  if (last) {
    const prev = Number(last.ladder_step || 1);
    step = last.state === "done" ? prev + 1 : Math.max(1, prev - 1);
  }
  if (!recent.some((r) => r.state === "done")) step = 1;
  step = Math.min(Math.max(1, step), capStep);
  while (step > 1) {
    const rung2 = LADDER[step - 1];
    if (hour >= (rung2.minHour ?? 0) && !retired.has(rung2.kind)) break;
    step -= 1;
  }
  let rung = LADDER[step - 1];
  if (retired.has(rung.kind)) {
    const alt = LADDER.filter((r) => !retired.has(r.kind) && hour >= (r.minHour ?? 0) && r.step <= capStep);
    if (!alt.length) return { skip: "all-kinds-retired" };
    rung = alt[0];
  }
  if (rung.kind === "contact") {
    const names = (cfg2.contact_candidates || []).filter((n) => n && String(n).trim());
    if (names.length) {
      const lastNamed = /* @__PURE__ */ __name((n) => {
        const hit = recent.filter((r) => String(r.ask || "").includes(String(n))).map((r) => String(r.ts)).sort().pop();
        return hit || "";
      }, "lastNamed");
      const pick = names.slice().sort((a, b) => lastNamed(a).localeCompare(lastNamed(b)) || String(a).localeCompare(String(b)))[0];
      return {
        kind: "contact",
        ladder_step: rung.step,
        minutes: rung.minutes,
        ask: "Message " + pick + ". One line is enough - even 'thinking of you'.",
        expected: "log:contact",
        due_at: new Date(nowMs + rung.slaMinutes * 6e4).toISOString(),
        reason: "step=3 named=" + pick
      };
    }
  }
  const usedKinds = new Set(
    recent.filter((r) => nowMs - new Date(r.ts).getTime() < 48 * 36e5).map((r) => r.kind)
  );
  let pool = (cfg2.candidates?.[rung.step] || []).filter(Boolean);
  if (!pool.length) return { skip: "no-candidate" };
  const recentAsks = new Set(recent.map((r) => str(r.ask)));
  let fresh = pool.filter((a) => !recentAsks.has(str(a)));
  if (!fresh.length) fresh = pool;
  const lastUse = /* @__PURE__ */ __name((a) => {
    const hit = recent.filter((r) => str(r.ask) === str(a)).map((r) => String(r.ts)).sort().pop();
    return hit || "";
  }, "lastUse");
  fresh.sort((a, b) => lastUse(a).localeCompare(lastUse(b)) || a.localeCompare(b));
  return {
    kind: rung.kind,
    ladder_step: rung.step,
    minutes: rung.minutes,
    ask: fresh[0],
    expected: "log:" + rung.kind,
    due_at: new Date(nowMs + rung.slaMinutes * 6e4).toISOString(),
    reason: "step=" + rung.step + (lowMood ? " low-mood-cap" : "") + (usedKinds.has(rung.kind) ? " repeat-within-48h" : "")
  };
}
__name(planNext, "planNext");
async function expireStale(db, nowIso2 = (/* @__PURE__ */ new Date()).toISOString()) {
  const r = await db.prepare(
    `UPDATE companion_nudges SET state = 'expired', closed_at = ?
      WHERE state IN ('sent','shown') AND due_at IS NOT NULL AND due_at < ?`
  ).bind(nowIso2, nowIso2).run();
  return r.meta?.changes ?? 0;
}
__name(expireStale, "expireStale");
async function closeNudge(db, id, { state, response, outcome, nowIso: nowIso2 } = {}) {
  const now = nowIso2 || (/* @__PURE__ */ new Date()).toISOString();
  if (!["done", "declined", "expired", "superseded"].includes(state)) throw new Error("NUDGE-STATE-1");
  await db.prepare(
    "UPDATE companion_nudges SET state = ?, closed_at = ?, response = ?, outcome = ? WHERE id = ?"
  ).bind(state, now, response ?? null, outcome ?? null, id).run();
}
__name(closeNudge, "closeNudge");
async function unansweredStreak(db) {
  const kinds = LADDER.map((r2) => "'" + r2.kind + "'").join(",");
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
__name(unansweredStreak, "unansweredStreak");
function crisisBlock(cfg2 = DEFAULT_CONFIG) {
  const lines = Array.isArray(cfg2.crisis_lines) ? cfg2.crisis_lines : [];
  const has = /* @__PURE__ */ __name((s) => s && String(s).trim().length > 0, "has");
  return {
    sla_seconds: 60,
    paths: ["chat", "email", "dashboard-card"],
    text: [
      "I'm not going to argue with you about this, and I'm not qualified to.",
      has(cfg2.backstop_name) || has(cfg2.backstop_contact) ? "Tell " + (cfg2.backstop_name || "your person") + " you're not okay. Right now, one line." : "Tell one real person you're not okay. Right now, one line. (No backstop is configured yet - add one.)",
      lines.length ? "If it gets worse, call: " + lines.map((l) => l && l.label ? l.label + " " + l.number : l.number || l).join(" \xB7 ") : "If it gets worse, use your local emergency number. (No crisis lines configured yet.)",
      "Nothing here needs to be solved tonight."
    ].join("\n")
  };
}
__name(crisisBlock, "crisisBlock");
var HARD = [
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
var SOFT = [
  "can't go on",
  "cant go on",
  "can not go on",
  "give up",
  "hopeless",
  "pointless",
  "nothing matters",
  "can't cope",
  "cant cope",
  "falling apart",
  "hate myself",
  "so tired of everything",
  "what's the point",
  "whats the point",
  "numb"
];
function crisisSignal(text) {
  const t = String(text || "").toLowerCase().replace(/\s+/g, " ");
  for (const re of HARD) {
    const m = t.match(re);
    if (m) return { level: 2, match: m[0] };
  }
  const s = SOFT.find((p) => t.includes(p));
  if (s) return { level: 1, match: s };
  return { level: 0, match: null };
}
__name(crisisSignal, "crisisSignal");

// wellbeing-wire.js
var OWNER = "rwnquni@outlook.com";
var BASE = "https://reading.q08.org";
var SEEDS = {
  crisis_lines: [
    { label: "112 - immediate danger", number: "112" },
    { label: "113 Zelfmoordpreventie", number: "113" },
    { label: "0800-0113 (free)", number: "0800-0113" },
    { label: "chat 24/7", number: "", url: "https://www.113.nl" }
  ]
};
var parseVal = /* @__PURE__ */ __name((v) => {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}, "parseVal");
var esc = /* @__PURE__ */ __name((s) => String(s === null || s === void 0 ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"), "esc");
var days = /* @__PURE__ */ __name((ms) => ms / 864e5, "days");
async function ensureWellbeing(db) {
  await ensureWellbeingSchema(db);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const [k, v] of Object.entries(SEEDS)) {
    await db.prepare(
      "INSERT INTO wellbeing_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING"
    ).bind(k, JSON.stringify(v), now).run();
    const cur = await db.prepare("SELECT value FROM wellbeing_config WHERE key = ?").bind(k).first();
    const parsed = cur ? parseVal(cur.value) : null;
    if (Array.isArray(parsed) && parsed.length === 0) {
      await db.prepare(
        "UPDATE wellbeing_config SET value = ?, updated_at = ? WHERE key = ? AND value = ?"
      ).bind(JSON.stringify(v), now, k, cur.value).run();
    }
  }
}
__name(ensureWellbeing, "ensureWellbeing");
async function cfg(env) {
  const r = await env.PERSONAL.prepare("SELECT key, value FROM wellbeing_config").all();
  const out = { ...DEFAULT_CONFIG };
  for (const row of r.results || []) out[row.key] = parseVal(row.value);
  return out;
}
__name(cfg, "cfg");
async function setCfg(env, key, value) {
  await env.PERSONAL.prepare(
    "INSERT INTO wellbeing_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  ).bind(key, typeof value === "string" ? value : JSON.stringify(value), (/* @__PURE__ */ new Date()).toISOString()).run();
}
__name(setCfg, "setCfg");
async function context(env, nowIso2, c) {
  const conf = c || await cfg(env);
  const now = nowIso2 || (/* @__PURE__ */ new Date()).toISOString();
  const nowMs = new Date(now).getTime();
  const tz = conf.tz;
  const day = dayKey(now, tz);
  const iso = /* @__PURE__ */ __name((d) => new Date(nowMs - d * 864e5).toISOString(), "iso");
  const one = /* @__PURE__ */ __name(async (sql, ...b) => {
    try {
      return await env.PERSONAL.prepare(sql).bind(...b).first() || {};
    } catch {
      return {};
    }
  }, "one");
  const many = /* @__PURE__ */ __name(async (sql, ...b) => {
    try {
      return (await env.PERSONAL.prepare(sql).bind(...b).all()).results || [];
    } catch {
      return [];
    }
  }, "many");
  const lastNote = await one("SELECT MAX(ts) AS t FROM notes WHERE kind NOT IN ('email')");
  const lastAct = await one("SELECT MAX(date) AS d FROM activity");
  const vol = await one(
    "SELECT SUM(CASE WHEN ts >= ? THEN 1 ELSE 0 END) AS w, COUNT(*) AS m FROM chat WHERE LOWER(role) = 'user' AND ts >= ?",
    iso(7),
    iso(28)
  );
  const nightRows = await many("SELECT ts FROM chat WHERE LOWER(role) = 'user' AND ts >= ? LIMIT 2000", iso(14));
  const vrows = await many(
    "SELECT path, size FROM files WHERE path LIKE 'obsidian/notes/v1/%' AND path GLOB '*/_[0-9][0-9].md' ORDER BY modified DESC LIMIT 400"
  );
  const vault = vaultNoteDays(vrows, day);
  const check = await one("SELECT mood, energy, sleep_hours FROM wellbeing_checkins WHERE day = ? ORDER BY ts DESC", day);
  const avg = await one(
    "SELECT ROUND(AVG(mood),2) a7 FROM wellbeing_checkins WHERE mood IS NOT NULL AND day >= ?",
    dayKey(iso(7), tz)
  );
  const recentMood = await one(
    "SELECT ROUND(AVG(CASE WHEN day >= ? THEN mood END),2) m2, ROUND(AVG(CASE WHEN day < ? THEN mood END),2) m5 FROM wellbeing_checkins WHERE mood IS NOT NULL AND day >= ?",
    dayKey(iso(2), tz),
    dayKey(iso(2), tz),
    dayKey(iso(7), tz)
  );
  let night = 0;
  for (const row of nightRows) {
    const h = localHourFloat(row.ts, tz);
    if (h < 5) night += 1;
  }
  const answers = await unansweredStreak(env.PERSONAL);
  const idx = {
    days_since_note: lastNote.t ? days(nowMs - Date.parse(lastNote.t)) : 999,
    days_since_daily_note: vault.latest ? days(nowMs - Date.parse(vault.latest + "T12:00:00Z")) : 999,
    daily_note_days_7d: vault.days7,
    daily_note_last_size: vault.latestSize,
    days_since_activity: lastAct.d ? days(nowMs - Date.parse(lastAct.d + "T12:00:00Z")) : 999,
    night_share: nightRows.length ? night / nightRows.length : 0,
    volume_ratio: vol.m ? Number(vol.w) / 1 / (Number(vol.m) / 4) : null,
    mood_today: check.mood === void 0 ? null : check.mood,
    energy_today: check.energy === void 0 ? null : check.energy,
    sleep_today: check.sleep_hours === void 0 ? null : check.sleep_hours,
    mood_avg7: avg.a7 === void 0 ? null : avg.a7,
    mood_drop_2d: recentMood.m2 !== null && recentMood.m5 !== null && recentMood.m2 !== void 0 && recentMood.m5 !== void 0 ? Number(recentMood.m5) - Number(recentMood.m2) >= 0.75 : false,
    unanswered_streak: answers
  };
  return {
    day,
    hour: localHourFloat(now, tz),
    ctx: idx,
    drift: drift(idx),
    checked_in: check.mood !== void 0 || check.energy !== void 0
  };
}
__name(context, "context");
async function recentNudges(env, limit = 40) {
  const r = await env.PERSONAL.prepare(
    "SELECT * FROM companion_nudges ORDER BY id DESC LIMIT ?"
  ).bind(limit).all();
  return r.results || [];
}
__name(recentNudges, "recentNudges");
async function loopRows(env) {
  try {
    const r = await env.PERSONAL.prepare("SELECT * FROM v_nudge_loop").all();
    return r.results || [];
  } catch {
    return [];
  }
}
__name(loopRows, "loopRows");
function vaultNoteDays(rows, today) {
  const days2 = /* @__PURE__ */ new Set();
  let latest = null, latestSize = 0;
  for (const r of rows || []) {
    const m = String(r.path || "").match(/\/(\d{4})\/(\d{2})\/(\d{2})\/_\d\d\.md$/);
    if (!m) continue;
    const d = m[1] + "-" + m[2] + "-" + m[3];
    days2.add(d);
    if (!latest || d > latest) {
      latest = d;
      latestSize = Number(r.size || 0);
    }
  }
  const ref = Date.parse(today + "T12:00:00Z");
  let days7 = 0;
  for (const d of days2) if (Date.parse(d + "T12:00:00Z") >= ref - 7 * 864e5) days7 += 1;
  return { days7, latest, latestSize, total: days2.size };
}
__name(vaultNoteDays, "vaultNoteDays");
function token(env, u) {
  const expected = env.WELLBEING_TOKEN;
  if (!expected) return true;
  return u.searchParams.get("t") === expected || u.searchParams.get("k") === expected;
}
__name(token, "token");
function nudgeMail(n, c, tok) {
  const q = tok ? "&t=" + encodeURIComponent(tok) : "";
  if (n.kind === "presence") {
    return {
      subject: "I'm here",
      body: [c.presence_line || "I'm here. Nothing needed from you right now.", "", "No reply needed.", "", BASE + "/wb/checkin" + (tok ? "?t=" + encodeURIComponent(tok) : "")].join("\n")
    };
  }
  if (n.kind === "checkin") {
    return {
      subject: "morning - two taps",
      body: ["How's it landing today?", "", "Mood, then energy. Two taps, nothing to type:", "", BASE + "/wb/checkin" + (tok ? "?t=" + encodeURIComponent(tok) : "")].join("\n")
    };
  }
  return {
    subject: "one small thing",
    body: [
      n.ask,
      "",
      "Did it:    " + BASE + "/wb/done?id=" + n.id + q,
      "Not today: " + BASE + "/wb/no?id=" + n.id + q,
      "",
      "Either answer is a good answer. If nothing happens this closes on its own and nothing else is asked today."
    ].join("\n")
  };
}
__name(nudgeMail, "nudgeMail");
async function briefCheckinLines(env, nowIso2) {
  const c = await cfg(env);
  const day = dayKey(nowIso2 || (/* @__PURE__ */ new Date()).toISOString(), c.tz);
  const seen = await env.PERSONAL.prepare(
    "SELECT 1 AS x FROM companion_nudges WHERE day = ? AND kind = 'checkin' LIMIT 1"
  ).bind(day).first();
  if (seen) return [];
  const t = env.WELLBEING_TOKEN ? "?t=" + encodeURIComponent(env.WELLBEING_TOKEN) : "";
  return ["", "How's it landing? Two taps, nothing to type:", BASE + "/wb/checkin" + t];
}
__name(briefCheckinLines, "briefCheckinLines");
async function noteCheckinInBrief(env, nowIso2) {
  const c = await cfg(env);
  const now = nowIso2 || (/* @__PURE__ */ new Date()).toISOString();
  const day = dayKey(now, c.tz);
  try {
    await env.PERSONAL.prepare(
      `INSERT INTO companion_nudges (ts, day, kind, ladder_step, ask, minutes, expected, due_at, state, sent_at, reason)
       VALUES (?, ?, 'checkin', 0, 'How''s it landing today?', 0, 'log:checkin', ?, 'sent', ?, 'morning-brief')`
    ).bind(now, day, new Date(Date.parse(now) + 6 * 36e5).toISOString(), now).run();
    return true;
  } catch (e) {
    if (String(e && e.message || e).includes("NUDGE-DUP-1")) return false;
    throw e;
  }
}
__name(noteCheckinInBrief, "noteCheckinInBrief");
async function wellbeingTick(env, deps = {}) {
  const send = deps.send;
  const now = deps.nowIso || (/* @__PURE__ */ new Date()).toISOString();
  await ensureWellbeing(env.PERSONAL);
  const c = await cfg(env);
  const out = { now, expired: await expireStale(env.PERSONAL, now) };
  const pack = await context(env, now, c);
  out.drift = pack.drift;
  if (pack.hour >= 7.75 && pack.hour < 12) {
    const already = (await recentNudges(env, 20)).some((r) => r.kind === "checkin" && r.day === pack.day);
    if (!already && send) {
      const row2 = await insertNudge(env, {
        day: pack.day,
        kind: "checkin",
        step: 0,
        ask: "How's it landing today?",
        minutes: 0,
        expected: "log:checkin",
        due_at: new Date(Date.parse(now) + 6 * 36e5).toISOString(),
        reason: "morning-checkin"
      });
      if (row2) {
        const mail2 = nudgeMail(row2, c, env.WELLBEING_TOKEN);
        const sent2 = await send(env, OWNER, mail2.subject, mail2.body);
        await markSent(env, row2.id, sent2, now);
        out.checkin = { id: row2.id, sent: !!(sent2 && sent2.ok !== false) };
      }
    }
  }
  const planCfg = deps.force ? { ...c, quiet_start: 0, quiet_end: 0, max_per_day: 99, min_gap_min: 0 } : c;
  const plan = planNext({
    nowIso: now,
    ctx: { ...pack.ctx, drift_level: pack.drift.level, checked_in: pack.checked_in },
    cfg: planCfg,
    recent: await recentNudges(env, 40),
    loopRows: await loopRows(env)
  });
  if (plan.skip) {
    out.skipped = plan.skip;
    return out;
  }
  if (!send) {
    out.planned = plan;
    return out;
  }
  const row = await insertNudge(env, {
    day: pack.day,
    kind: plan.kind,
    step: plan.ladder_step,
    ask: plan.ask,
    minutes: plan.minutes,
    expected: plan.expected,
    due_at: plan.due_at,
    reason: plan.reason
  });
  if (!row) {
    out.skipped = "insert-failed";
    return out;
  }
  const mail = nudgeMail(row, c, env.WELLBEING_TOKEN);
  const sent = await send(env, OWNER, mail.subject, mail.body);
  await markSent(env, row.id, sent, now);
  out.sent = { id: row.id, kind: plan.kind, step: plan.ladder_step, ok: !!(sent && sent.ok !== false) };
  return out;
}
__name(wellbeingTick, "wellbeingTick");
async function insertNudge(env, n) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const r = await env.PERSONAL.prepare(
      `INSERT INTO companion_nudges (ts, day, kind, ladder_step, ask, minutes, expected, due_at, state, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)`
    ).bind(now, n.day, n.kind, n.step, n.ask, n.minutes ?? null, n.expected ?? null, n.due_at ?? null, n.reason ?? null).run();
    const newId = r && r.meta ? r.meta.last_row_id : null;
    if (newId === null || newId === void 0) throw new Error("NUDGE-ID-1: insert returned no row id");
    return { id: newId, ...n };
  } catch (e) {
    if (!String(e && e.message || e).includes("NUDGE-DUP-1")) throw e;
    const r = await env.PERSONAL.prepare(
      "SELECT * FROM companion_nudges WHERE day = ? AND kind = ? AND state = 'queued' LIMIT 1"
    ).bind(n.day, n.kind).all();
    return (r.results || [])[0] || null;
  }
}
__name(insertNudge, "insertNudge");
async function markSent(env, id, sent, nowIso2) {
  if (sent && sent.disabled) {
    await env.PERSONAL.prepare(
      "UPDATE companion_nudges SET state = 'expired', closed_at = ?, outcome = ? WHERE id = ? AND state = 'queued'"
    ).bind(nowIso2, JSON.stringify({ owner_notices_disabled: true }), id).run();
    return;
  }
  if (sent && sent.ok !== false && !sent.suppressed) {
    await env.PERSONAL.prepare(
      "UPDATE companion_nudges SET state = 'sent', sent_at = ?, outcome = ? WHERE id = ? AND state = 'queued'"
    ).bind(nowIso2, JSON.stringify({ via: sent.via || "mail" }), id).run();
    return;
  }
  const why = JSON.stringify({ send_failed: sent ? sent.error || (sent.suppressed ? "suppressed" : "unknown") : "no-send" });
  await env.PERSONAL.prepare(
    "UPDATE companion_nudges SET state = 'queued', outcome = ? WHERE id = ?"
  ).bind(why, id).run();
}
__name(markSent, "markSent");
async function escalate(env, deps, { text, source }) {
  const c = await cfg(env);
  const block = crisisBlock(c);
  const sig = crisisSignal(text);
  if (sig.level < 2) return { level: sig.level, sent: false };
  const body = block.text + "\n\n" + BASE + "/wb/checkin" + (env.WELLBEING_TOKEN ? "?t=" + encodeURIComponent(env.WELLBEING_TOKEN) : "");
  let sent = null;
  try {
    sent = deps.send ? await deps.send(env, OWNER, "not alone", body) : null;
  } catch (e) {
    sent = { ok: false, error: String(e && e.message || e) };
  }
  try {
    await env.PERSONAL.prepare(
      "INSERT INTO companion_nudges (ts, day, kind, ladder_step, ask, minutes, expected, due_at, state, sent_at, reason) VALUES (?, ?, 'crisis', 0, ?, 0, NULL, ?, 'sent', ?, ?)"
    ).bind((/* @__PURE__ */ new Date()).toISOString(), dayKey((/* @__PURE__ */ new Date()).toISOString(), c.tz), "escalation", new Date(Date.now() + 864e5).toISOString(), (/* @__PURE__ */ new Date()).toISOString(), "signal:" + sig.match + " source:" + source).run();
  } catch {
  }
  return { level: 2, match: sig.match, sent: !!(sent && sent.ok !== false), block };
}
__name(escalate, "escalate");
function page(title, body) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font:17px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;max-width:34rem;margin:3rem auto;padding:0 1.2rem;color:#1b1b1b}a.b{display:inline-block;min-width:3.2rem;text-align:center;padding:.7rem 0;margin:.2rem;border:1px solid #bbb;border-radius:.6rem;text-decoration:none;color:#111}a.b.sel{background:#111;color:#fff;border-color:#111}a.q{color:#666}textarea{width:100%;min-height:6rem;font:inherit;padding:.6rem;border:1px solid #bbb;border-radius:.6rem}input{width:calc(100% - 1.4rem);font:inherit;padding:.6rem;border:1px solid #bbb;border-radius:.6rem;margin:.2rem 0}h1{font-size:1.15rem;font-weight:600}</style></head><body>` + String(body || "") + `</body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}
__name(page, "page");
var txt = /* @__PURE__ */ __name((body, status = 200) => new Response(String(body) + "\n", { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } }), "txt");
async function handleWellbeing(request, env, deps = {}) {
  const u = new URL(request.url);
  const p = u.pathname;
  if (!p.startsWith("/wb/") && p !== "/api/wellbeing") return null;
  await ensureWellbeing(env.PERSONAL);
  if (!token(env, u)) return txt("unauthorized: append ?t=TOKEN", 401);
  const c = await cfg(env);
  const t = env.WELLBEING_TOKEN || "";
  if (p === "/wb/checkin") {
    let note = u.searchParams.get("note");
    if (request.method === "POST") {
      try {
        const fd = await request.formData();
        note = fd.get("note") || note;
      } catch {
      }
    }
    const mood = u.searchParams.get("mood");
    const energy = u.searchParams.get("energy");
    if (mood !== null || energy !== null || note) {
      await recordCheckin(env.PERSONAL, {
        mood: mood || null,
        energy: energy || null,
        sleep_hours: u.searchParams.get("sleep"),
        load: u.searchParams.get("load"),
        note: note || null,
        source: "web",
        ts: (/* @__PURE__ */ new Date()).toISOString()
      });
      const esc2 = note ? await escalate(env, deps, { text: note, source: "checkin-note" }) : { level: 0 };
      if (esc2.level >= 2) {
        return page("not alone", "<h1>You said something that matters.</h1><p>I have sent you the numbers and the one thing to do. You do not have to hold this alone tonight.</p><p><a class='q' href='/wb/checkin?t=" + esc(t) + "'>back</a></p>");
      }
    }
    const st = await env.PERSONAL.prepare("SELECT mood, energy FROM wellbeing_checkins WHERE day = ? ORDER BY ts DESC LIMIT 1").bind(dayKey((/* @__PURE__ */ new Date()).toISOString(), c.tz)).all();
    const row = (st.results || [])[0] || {};
    const link = /* @__PURE__ */ __name((k, v) => "/wb/checkin?" + k + "=" + v + (t ? "&t=" + encodeURIComponent(t) : ""), "link");
    const btns = /* @__PURE__ */ __name((k, cur) => [1, 2, 3, 4, 5].map((v) => `<a class="b${cur === v ? " sel" : ""}" href="${link(k, v)}">${v}</a>`).join(""), "btns");
    const done = row.mood !== void 0 || row.energy !== void 0;
    return page(
      "check-in",
      `<h1>Today</h1><p class="q">mood</p><div>${btns("mood", row.mood)}</div><p class="q">energy</p><div>${btns("energy", row.energy)}</div>` + (done ? `<form method="post"><p class="q">anything you want to leave here</p><textarea name="note" autofocus></textarea><p><button class="b" type="submit">save</button></p></form>` : "")
    );
  }
  if (p === "/wb/done" || p === "/wb/no") {
    const id = Number(u.searchParams.get("id"));
    if (!id) return txt("missing id", 400);
    await closeNudge(env.PERSONAL, id, {
      state: p === "/wb/done" ? "done" : "declined",
      response: p === "/wb/done" ? "web" : "declined-web"
    });
    return page("logged", p === "/wb/done" ? "<h1>Logged.</h1><p>That counts. Nothing else needed.</p>" : "<h1>Noted.</h1><p>Nothing more today. It will not ask again.</p>");
  }
  if (p === "/wb/tick") {
    if (u.searchParams.get("kind") === "checkin") {
      const c0 = await cfg(env);
      const nowC = (/* @__PURE__ */ new Date()).toISOString();
      const dayC = dayKey(nowC, c0.tz);
      const rowC = await insertNudge(env, {
        day: dayC,
        kind: "checkin",
        step: 0,
        ask: "How's it landing today?",
        minutes: 0,
        expected: "log:checkin",
        due_at: new Date(Date.parse(nowC) + 6 * 36e5).toISOString(),
        reason: "ops-force"
      });
      if (!rowC) return new Response(JSON.stringify({ ok: false, skipped: "already-sent-today" }, null, 2), { headers: { "Content-Type": "application/json" } });
      const mailC = nudgeMail(rowC, c0, env.WELLBEING_TOKEN);
      const sentC = deps.send ? await deps.send(env, OWNER, mailC.subject, mailC.body) : null;
      await markSent(env, rowC.id, sentC, nowC);
      return new Response(JSON.stringify({ ok: !!(sentC && sentC.ok !== false), id: rowC.id, subject: mailC.subject }, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    const out = await wellbeingTick(env, { send: deps.send, force: u.searchParams.get("force") === "1" });
    return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  }
  if (p === "/wb/settings") {
    if (request.method === "POST") {
      let fd = null;
      try {
        fd = await request.formData();
      } catch {
      }
      if (fd) {
        const cand = fd.get("contact_candidates");
        if (cand !== null) {
          const list = String(cand).split(",").map((s) => s.trim()).filter(Boolean);
          await setCfg(env, "contact_candidates", list);
        }
        for (const k of ["backstop_name", "backstop_contact", "presence_line"]) {
          const v2 = fd.get(k);
          if (v2 !== null) await setCfg(env, k, String(v2).trim());
        }
        for (const k of ["quiet_start", "quiet_end"]) {
          const v2 = fd.get(k);
          if (v2 !== null && String(v2).trim() !== "" && !Number.isNaN(Number(v2))) await setCfg(env, k, Number(v2));
        }
      }
      return page("saved", "<h1>Saved.</h1><p>It will use this from the next tick.</p><p><a class='q' href='/wb/settings?t=" + esc(t) + "'>back</a></p>");
    }
    const v = /* @__PURE__ */ __name((x, d = "") => esc(x === void 0 || x === null ? d : x), "v");
    const cands = Array.isArray(c.crisis_lines) ? c.crisis_lines : [];
    return page(
      "settings",
      "<h1>What only you can tell it</h1><form method='post'><p class='q'>people it may name on the contact rung (comma separated)</p><input name='contact_candidates' value='" + v((c.contact_candidates || []).join(", ")) + "'><p class='q'>backstop name - the person it names if you say something that scares it</p><input name='backstop_name' value='" + v(c.backstop_name) + "'><p class='q'>how to reach them</p><input name='backstop_contact' value='" + v(c.backstop_contact) + "'><p class='q'>quiet from / until (local hour, 22 and 7.5 by default)</p><input name='quiet_start' value='" + v(c.quiet_start) + "' style='width:5rem'> <input name='quiet_end' value='" + v(c.quiet_end) + "' style='width:5rem'><p class='q'>what it says when it only wants to be present</p><input name='presence_line' value='" + v(c.presence_line) + "'><p><button class='b' type='submit'>save</button></p></form><p class='q' style='margin-top:2rem'>crisis lines on file: " + esc(cands.map((l) => l && l.label ? l.label + " " + (l.number || "") : l && l.number || "").join(" \xB7 ") || "none") + "</p>"
    );
  }
  if (p === "/api/wellbeing") {
    const pack = await context(env, null, c);
    const gaps = [];
    if (!c.backstop_contact && !c.backstop_name) gaps.push("backstop_contact");
    if (!Array.isArray(c.crisis_lines) || !c.crisis_lines.length) gaps.push("crisis_lines");
    if (!env.WELLBEING_TOKEN) gaps.push("WELLBEING_TOKEN secret");
    const trend = await env.PERSONAL.prepare("SELECT * FROM v_wellbeing_trend ORDER BY day DESC LIMIT 30").all();
    const cov = await env.PERSONAL.prepare("SELECT * FROM v_wellbeing_coverage").all();
    return new Response(JSON.stringify({
      ok: true,
      day: pack.day,
      hour: pack.hour,
      checked_in: pack.checked_in,
      context: pack.ctx,
      drift: pack.drift,
      config_gaps: gaps,
      coverage: (cov.results || [])[0] || null,
      loop: await loopRows(env),
      trend: trend.results || [],
      nudges: (await recentNudges(env, 12)).map((n) => ({ id: n.id, ts: n.ts, kind: n.kind, step: n.ladder_step, state: n.state, ask: n.ask, response: n.response }))
    }, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return null;
}
__name(handleWellbeing, "handleWellbeing");

// worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var __defProp22 = Object.defineProperty;
var __name22 = /* @__PURE__ */ __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
var __name222 = __name22;
var VERSION = "1.29.0-wellbeing-loop";
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
var QUOTA_PROPERTY = "reading.q08.org";
var QUOTAS_KEY = "publish_quotas";
async function readingQuota(env) {
  try {
    var r = await env.AUDIT.prepare("SELECT value FROM ops_config WHERE key = ?1").bind(QUOTAS_KEY).first();
    var raw = r && r.value ? JSON.parse(String(r.value)) : null;
    var v = raw && Object.prototype.hasOwnProperty.call(raw, QUOTA_PROPERTY) ? Number(raw[QUOTA_PROPERTY]) : NaN;
    if (Number.isFinite(v) && v >= 0 && v <= 500) return Math.floor(v);
  } catch (e) {
    console.error(JSON.stringify({ worker: "personal-companion", event: "publish-quota-read", error: String(e && e.message || e).slice(0, 160) }));
  }
  return MAX_PIECES_PER_DAY;
}
__name(readingQuota, "readingQuota");
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
__name2(modelAllowed, "modelAllowed");
__name22(modelAllowed, "modelAllowed");
__name222(modelAllowed, "modelAllowed");
var NL = String.fromCharCode(10);
function L() {
  return Array.prototype.slice.call(arguments).join(NL);
}
__name(L, "L");
__name2(L, "L");
__name22(L, "L");
__name222(L, "L");
var RHYTHM = ["notes", "essay", "notes", "essay", "notes", "essay", "serial"];
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
  "You are writing for one reader: the person described in the reader profile below.",
  "Never reproduce any heading, label, bullet, or phrasing from the briefing, or from these instructions, inside the piece. The briefing is addressed to you, not to the reader.",
  "Not for an audience, not for a journal, not for a metric.",
  "The reader profile and recent-life notes tell you what he cares about and how he reads. They shape emphasis and register only; never state anything from them as a fact, and never list them back to him.",
  "He reads for the pleasure of a true thing well put. He is not impressed by fluency, by volume, or by enthusiasm.",
  "",
  "Voice: plain scholarly prose. Concrete before abstract. Short declaratives, occasionally a long sentence that earns its length.",
  "LEDE (inverted pyramid, checked before anything else): the first paragraph, at most 110 words and before any heading, tells a reader who has never heard of the subject what it is, where it comes from (name the source in plain words: the Wikipedia article on it, or the arXiv paper and its title) and why it matters. Name the subject in the first sentence. Then the most important facts from the source, most important first, and only then the analysis. Never open on a generality, an aphorism, a question or an abstract noun ('the idea of', 'the pattern').",
  "CONTEXT AND SYSTEMS ANALYSIS (required; this is why the piece exists, and a piece that only retells its source is rejected): after the facts, place the subject in its bigger picture and explain the system behind it, from the source material. Name the parties or parts involved and what each is rewarded, punished or constrained by; the constraint, delay or information gap that shapes the outcome; the feedback loop that keeps it in place or changes it; who gains and who pays; and where the same arrangement operates beyond this case. Reason openly and say it is reasoning ('the incentive is ...', 'that means ...', 'if ... then ...'), introducing no name, date, number, event or quotation the source material does not contain. Every sentence of the analysis that the source does not state must read as reasoning from its first words; never state an inferred arrangement, funding, motive or behaviour as a reported fact. Build the analysis from this subject's own particulars in the source (its named parties, figures, dates and events): a paragraph that would read the same for any other subject is boilerplate and is rejected. Begin the analysis with a line of its own that contains exactly <!-- analysis --> (readers never see it): everything before that line is reporting from the source material, everything after it is your analysis.",
  "Quotations: quote only words that appear verbatim in the source material, attributed to the person the source attributes them to, and only from the source that concerns that person; never invent, paraphrase into quotation marks or move a quotation to another subject. Every quotation of five or more words is checked against the sources.",
  "Present tense where possible. Active voice. Name the actor.",
  "Figures, dates, names and quotations: use one only exactly as the source material states it. Never compute, round, convert, estimate, combine or recall a number from memory; if a point needs a figure the sources do not give, make the point without one.",
  "",
  "Forbidden, without exception:",
  "- emojis, arrows (\u2192) or other symbols written in place of words; exclamation marks for emphasis",
  "- the words: delve, tapestry, landscape of, realm, unlock, game-changer, ever-evolving, testament to, nestled",
  "- the phrases: dive into, let us explore, in today's world, it is worth noting, in conclusion, plays a crucial role, plays a vital role, shed light on, pave the way, stands as a, serves as a",
  "- rhetorical questions as an opener",
  "- triads of adjectives used as padding",
  "- meta-commentary about writing, essays, readers, publishing, or disclosure",
  "- any reference to QNFO, QWAV, DOIs, pipelines, or to this companion",
  "- self-reference as a model or assistant; no greeting, no sign-off, no signature, no footer",
  "",
  "Epistemic contract (every piece is fact-checked line by line against the source material before anyone sees it; one unsupported claim and it is discarded):",
  "- The SOURCE MATERIAL below is the only source of facts. Your own memory is not a source, even for things you are certain of.",
  "- Every name of a person, place, organisation, work or product, every date and year, every number and every quotation must appear in the source material. If it is not there, it is not in the piece.",
  "- Quote a number exactly as the source states it, with its own unit. Never compute, convert, round, average, scale or combine numbers, and never state a figure the source gives only as a range or in words; describe it without the digits instead.",
  "- Do not add examples, precedents, historical episodes or comparisons from outside the source material. A scenario you need must be an explicit hypothetical that names no real person, organisation, product, date or number.",
  "- Reasoning that follows from the source material is welcome. State it as reasoning (it follows that, if this holds then), never as a further reported fact.",
  "- State uncertainty about the claim at its true size. Never inflate confidence to make a piece land better. Where the evidence leaves a point open, say the point is open, in terms of the subject itself; never write about the source material (what it covers, omits or does not say).",
  "- The strongest objection to your central claim must appear in the piece, stated fairly in your own words as an objection a careful reader could raise, with an honest assessment of how bad it is. Never put it in quotation marks and never attribute it to critics, scholars, commentators or anyone the source material does not name making that objection. It may rest on the source material or be pure logic; it may not rest on facts from outside it. Where it sits is your choice; do not give it the same heading or the same position twice in a row.",
  "",
  "The source material is raw research notes, usually encyclopedic extracts in a register you must not copy. Never reproduce their sentences. Banned habits they carry: definitional lead sentences, hedged attributions ('commentators have linked', 'observers note', 'a study found', 'some argue'), and disambiguation-style enumeration. If you need a definition, state it in your own words.",
  "Do not open with 'In [year], ...' unless the date itself is doing the work. Never repeat the opening move of one of your recent pieces (listed below). Pieces listed below are not sources.",
  "Reader verdicts (worth your time? yes/flat/no) are listed below. flat and no mean the piece did not earn its reading time; note what those pieces shared and do not repeat it. A recent no outweighs an old yes."
);
var P_ESSAY = L(
  "FORM: essay, 2000 to 2800 words. This is long-form. One sustained line of thought, carried to the end; do not stop while the argument is still thin, and do not pad.",
  "The subject is one thing. Write about the subject itself, in depth. Do not survey. Argue.",
  "Your argument must be a specific, falsifiable claim with consequences - something a knowledgeable reader could disagree with. It must not be an analogy, a family resemblance, or a restatement of the obvious.",
  "You are given real source material below. Mine it. Use the names, dates, numbers, mechanisms and cases it contains, and only those; a piece that could have been written without reading the sources has failed, and a piece that states anything the sources do not contain is discarded.",
  "Required content, not required sections: (a) the strongest objection to your central claim, stated fairly in your own words (never as a quotation or an unnamed critic), weighed honestly; (b) what would have to be true for your claim to hold, and what observation would falsify it. Where these sit is your call - the objection can be a heading, two sentences mid-argument, or the whole last section. Do not end every piece with the same two moves.",
  "Vary the section plan. Your previous pieces are listed below; your structure must differ from each of their structures. A reader must not be able to predict your headings from the first page."
);
var P_NOTES = L(
  "FORM: connected field essay, 1800 to 2400 words, in 3 to 5 movements.",
  "Each movement is one concrete thing taken from the source material.",
  "Each movement is 350 to 550 words. Say precisely what the thing is, then develop what it connects to in his world - draw the connection out, do not merely state it. One through-line binds the movements into a single sustained piece, not a list.",
  "If only three of the supplied sources are worth his time, give three. Never pad to a count. Never include an item you would not defend.",
  "Give every item a short title.",
  "The set title names the subject, not the count. Banned pattern: a title that starts with a number followed by a plural noun."
);
var P_SERIAL = L(
  "FORM: serialized long-form, 1800 to 2400 words, continuing one ongoing work.",
  "You are given the RUNNING WORK: its thesis and the closing lines of the previous installment. They are part of the source material.",
  "Advance the argument. Do not recap beyond one sentence of orientation.",
  "This installment must add at least one claim that was not available before it, and it must close mid-motion on a question the next installment has to answer.",
  "Keep the running work's title. Put the installment number in the subtitle."
);
var P_CRITIQUE = L(
  "You are an adversarial reader. You dislike fluency. You are looking for reasons this piece is worthless.",
  "You are given the SOURCE MATERIAL the writer was allowed to use, and the piece.",
  "Score each dimension 0 to 10. Be harsh: a 7 means genuinely good.",
  "specificity: does it hang on concrete checkable particulars from the source material, or could it have been written about anything?",
  "argument: is there a claim that could be wrong, or only gestures?",
  "objection: is the stated objection the strongest available one, or a straw man?",
  "voice: plain scholarly prose free of filler, tells, and self-reference?",
  "grounding: does every concrete claim (name, date, number, event, quotation) trace to the source material? Score 0 if you find one that does not. A sentence that reports as fact something the source does not state (an event, an arrangement, a behaviour, a cause) counts as such a claim. Reasoning the writer frames as reasoning ('the incentive is ...', 'that means ...', 'if ... then ...', 'it follows that ...') and that adds no name, date, number, event or quotation is not a grounding failure: judge it under argument and systems. Text after a line <!-- analysis --> is the writer's marked analysis: there, count under grounding only a concrete invented fact (a name, date, number, event, rule, quotation or study the source material does not contain); claims about incentives, constraints, motives and consequences in that section are judged under argument and systems, never grounding. Text before that line is held to the full rule.",
  "systems: does the piece place its subject in a bigger picture and explain the system behind it (the parties and what each is rewarded or constrained by, the constraint or information gap, the feedback loop, who gains and who pays, where else it operates), or does it only retell the source? A retelling scores at most 3.",
  "invented: every concrete claim you found that the source material does not support, each as a short quotation copied exactly from the piece (at most 16; an empty list when there is none).",
  'Return JSON only: {"specificity":n,"argument":n,"objection":n,"voice":n,"grounding":n,"systems":n,"invented":["exact quotation", ...],"verdict":"accept" or "reject","why":"one sentence"}'
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
__name2(json, "json");
__name22(json, "json");
__name222(json, "json");
function html(body, status) {
  return new Response(body, {
    status: status || 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}
__name(html, "html");
__name2(html, "html");
__name22(html, "html");
__name222(html, "html");
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(safeEqual, "safeEqual");
__name2(safeEqual, "safeEqual");
__name22(safeEqual, "safeEqual");
__name222(safeEqual, "safeEqual");
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
__name2(authorized, "authorized");
__name22(authorized, "authorized");
__name222(authorized, "authorized");
async function sha16(s) {
  var data = new TextEncoder().encode(String(s));
  var digest = await crypto.subtle.digest("SHA-256", data);
  var bytes = new Uint8Array(digest).slice(0, 8);
  var out = "";
  for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}
__name(sha16, "sha16");
__name2(sha16, "sha16");
__name22(sha16, "sha16");
__name222(sha16, "sha16");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
__name2(nowIso, "nowIso");
__name22(nowIso, "nowIso");
__name222(nowIso, "nowIso");
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
__name2(amsParts, "amsParts");
__name22(amsParts, "amsParts");
__name222(amsParts, "amsParts");
function amsDayKey(d) {
  var p = amsParts(d);
  return p.year + "-" + p.month + "-" + p.day;
}
__name(amsDayKey, "amsDayKey");
__name2(amsDayKey, "amsDayKey");
__name22(amsDayKey, "amsDayKey");
__name222(amsDayKey, "amsDayKey");
function amsWeekday(d) {
  var names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var p = amsParts(d);
  var idx = names.indexOf(p.weekday);
  return idx < 0 ? d.getUTCDay() : idx;
}
__name(amsWeekday, "amsWeekday");
__name2(amsWeekday, "amsWeekday");
__name22(amsWeekday, "amsWeekday");
__name222(amsWeekday, "amsWeekday");
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
__name2(squish, "squish");
__name22(squish, "squish");
__name222(squish, "squish");
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
__name2(stripTags, "stripTags");
__name22(stripTags, "stripTags");
__name222(stripTags, "stripTags");
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
__name2(sections, "sections");
__name22(sections, "sections");
__name222(sections, "sections");
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
__name2(firstTag, "firstTag");
__name22(firstTag, "firstTag");
__name222(firstTag, "firstTag");
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
__name2(parseJsonLoose, "parseJsonLoose");
__name22(parseJsonLoose, "parseJsonLoose");
__name222(parseJsonLoose, "parseJsonLoose");
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
__name2(hasEmoji, "hasEmoji");
__name22(hasEmoji, "hasEmoji");
__name222(hasEmoji, "hasEmoji");
function bannedHits(text) {
  var low = text.toLowerCase();
  var hits = [];
  for (var i = 0; i < BANNED.length; i++) {
    if (low.indexOf(BANNED[i]) >= 0) hits.push(BANNED[i]);
  }
  return hits;
}
__name(bannedHits, "bannedHits");
__name2(bannedHits, "bannedHits");
__name22(bannedHits, "bannedHits");
__name222(bannedHits, "bannedHits");
function isCap(s, i) {
  var c = s.charAt(i);
  return c >= "A" && c <= "Z";
}
__name(isCap, "isCap");
__name2(isCap, "isCap");
__name22(isCap, "isCap");
__name222(isCap, "isCap");
function isLow(s, i) {
  var c = s.charAt(i);
  return c >= "a" && c <= "z";
}
__name(isLow, "isLow");
__name2(isLow, "isLow");
__name22(isLow, "isLow");
__name222(isLow, "isLow");
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
__name2(readWord, "readWord");
__name22(readWord, "readWord");
__name222(readWord, "readWord");
function sourceLabel(a) {
  var ref = String(a && a.ref || ""), kind = String(a && a.kind || "");
  if (/wikipedia\.org/i.test(ref)) return "Wikipedia article";
  if (kind === "paper" || /arxiv/i.test(ref)) return "arXiv paper";
  return kind || "source";
}
__name(sourceLabel, "sourceLabel");
function anchorsText(anchors) {
  var parts = [];
  for (var i = 0; i < anchors.length; i++) parts.push(sourceLabel(anchors[i]) + ": " + String(anchors[i].title || "") + " " + String(anchors[i].text || ""));
  return parts.join(" ");
}
__name(anchorsText, "anchorsText");
function logCaught(where, e) {
  console.error(JSON.stringify({ worker: "personal-companion", where, error: String(e && e.message || e).slice(0, 300) }));
}
__name(logCaught, "logCaught");
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
__name2(wordCount, "wordCount");
__name22(wordCount, "wordCount");
__name222(wordCount, "wordCount");
async function embed(env, texts) {
  var resp = await aiRunAttr(env, "personal-companion", "embed", EMBED_MODEL, { text: texts }, { signal: AbortSignal.timeout(EMBED_TIMEOUT_MS) });
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
__name2(embed, "embed");
__name22(embed, "embed");
__name222(embed, "embed");
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
  await ensureAccuracySchema(env);
}
__name(ensureSchema, "ensureSchema");
__name2(ensureSchema, "ensureSchema");
__name22(ensureSchema, "ensureSchema");
__name222(ensureSchema, "ensureSchema");
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
__name2(loadProfile, "loadProfile");
__name22(loadProfile, "loadProfile");
__name222(loadProfile, "loadProfile");
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
__name2(loadLife, "loadLife");
__name22(loadLife, "loadLife");
__name222(loadLife, "loadLife");
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
    "SELECT f.slug, f.signal, f.note, p.title FROM companion_feedback f LEFT JOIN companion_pieces p ON p.slug = f.slug WHERE f.created_at > datetime('now','-14 days') ORDER BY f.id DESC LIMIT 60"
  ).all();
  var fr = fb.results || [];
  if (fr.length) {
    var yes = 0, flat = 0, no = 0, neg = [], pos = [];
    for (var j = 0; j < fr.length; j++) {
      var sgn = String(fr[j].signal || "");
      if (sgn === "good") yes++;
      else if (sgn === "flat") flat++;
      else no++;
      var t = squish(fr[j].title || fr[j].slug);
      if (sgn === "good") pos.push(t);
      else neg.push(t + "(" + sgn + ")");
    }
    lines.push("");
    lines.push("HOW HE REACTED \u2014 reader verdicts, worth your time? (last 14 days: yes=" + yes + " flat=" + flat + " no=" + no + ")");
    if (neg.length) lines.push("flat/no pieces \u2014 these did not earn their reading time; do not repeat what they shared: " + neg.slice(0, 6).join(" | "));
    if (pos.length) lines.push("yes pieces \u2014 earned it: " + pos.slice(0, 6).join(" | "));
    var rn = [];
    for (var j2 = 0; j2 < Math.min(fr.length, 8); j2++) rn.push("[" + fr[j2].signal + "] " + squish(fr[j2].title || fr[j2].slug));
    lines.push("most recent votes: " + rn.join(" | "));
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
__name2(loadContinuity, "loadContinuity");
__name22(loadContinuity, "loadContinuity");
__name222(loadContinuity, "loadContinuity");
var WIKI_API = "https://en.wikipedia.org/w/api.php";
var fetchCfg = { backoff: [400, 1500], timeoutMs: 12e3 };
var srcDiag = [];
function fetchUA() {
  return "qnfo-personal-companion/" + String(VERSION).split("-")[0] + " (https://reading.q08.org; mailto:rowan@qnfo.org)";
}
__name(fetchUA, "fetchUA");
function diagNote(s) {
  if (srcDiag.length < 14) srcDiag.push(String(s).slice(0, 140));
}
__name(diagNote, "diagNote");
function sleepMs(ms) {
  return new Promise(function(r) {
    setTimeout(r, ms);
  });
}
__name(sleepMs, "sleepMs");
async function srcFetch(label, url) {
  var tries = fetchCfg.backoff.length + 1, last = "";
  for (var t = 0; t < tries; t++) {
    try {
      var resp = await fetch(url, { headers: { "User-Agent": fetchUA(), "Accept": "application/json, application/atom+xml, text/xml, */*", "Api-User-Agent": fetchUA() }, signal: AbortSignal.timeout(fetchCfg.timeoutMs) });
      if (resp.ok) return resp;
      last = "HTTP " + resp.status;
      if (resp.status !== 429 && resp.status < 500) break;
      var ra = Number(resp.headers && resp.headers.get && resp.headers.get("retry-after"));
      if (t < tries - 1 && ra > 0 && ra <= 5) await sleepMs(ra * 1e3);
    } catch (e) {
      last = "error " + String(e && e.message || e).slice(0, 60);
    }
    if (t < tries - 1) await sleepMs(fetchCfg.backoff[t]);
  }
  diagNote(label + ": " + last);
  return null;
}
__name(srcFetch, "srcFetch");
async function srcJson(label, url) {
  var resp = await srcFetch(label, url);
  if (!resp) return null;
  try {
    return await resp.json();
  } catch (e) {
    diagNote(label + ": not JSON");
    return null;
  }
}
__name(srcJson, "srcJson");
async function fetchRandomTitles(n) {
  var j = await srcJson("wikipedia random", WIKI_API + "?action=query&list=random&rnnamespace=0&rnlimit=" + n + "&format=json");
  return (j && j.query && j.query.random || []).map(function(r) {
    return squish(r.title || "");
  }).filter(Boolean);
}
__name(fetchRandomTitles, "fetchRandomTitles");
async function fetchLinkedTitles(title) {
  var j = await srcJson("wikipedia links", WIKI_API + "?action=query&prop=links&plnamespace=0&pllimit=" + LINK_POOL + "&redirects=1&format=json&titles=" + encodeURIComponent(title));
  var pages = j && j.query && j.query.pages || {};
  var pk = Object.keys(pages)[0];
  var links = pages[pk] && pages[pk].links || [];
  return links.map(function(l) {
    return squish(l.title || "");
  }).filter(function(t) {
    return t && !/^\d{1,4}$/.test(t) && !/^(List|Lists|Index|Outline|Timeline) of /i.test(t);
  });
}
__name(fetchLinkedTitles, "fetchLinkedTitles");
async function fetchWiki(title) {
  var j = await srcJson("wikipedia extract", WIKI_API + "?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=" + encodeURIComponent(title));
  var pages = j && j.query && j.query.pages || {};
  var pk = Object.keys(pages)[0];
  var p = pages[pk] || {};
  var text = squish(p.extract || "");
  if (!text) return null;
  return { kind: "concept", ref: "https://en.wikipedia.org/wiki/" + encodeURIComponent(p.title || title), title: squish(p.title || title), text: text.slice(0, 12e3) };
}
__name(fetchWiki, "fetchWiki");
__name2(fetchWiki, "fetchWiki");
async function fetchArxivQuery(label, query, sortBy) {
  var resp = await srcFetch(label, "https://export.arxiv.org/api/query?search_query=" + query + "&sortBy=" + (sortBy || "submittedDate") + "&sortOrder=descending&max_results=8");
  if (!resp) return [];
  var chunks = [];
  try {
    chunks = sections(await resp.text(), "entry");
  } catch (e) {
    diagNote(label + ": unreadable");
    return [];
  }
  var out = [];
  for (var i = 0; i < chunks.length; i++) {
    var title = firstTag(chunks[i], "title");
    var summary = firstTag(chunks[i], "summary");
    var id = firstTag(chunks[i], "id");
    if (title && summary && squish(summary).length > 300) out.push({ kind: "paper", ref: id, title: squish(title) });
  }
  if (!out.length) diagNote(label + ": no usable entries");
  return out;
}
__name(fetchArxivQuery, "fetchArxivQuery");
var PAPER_MIN_CHARS = 3e3;
var PAPER_FULLTEXT_TRIES = 5;
var PAPER_TEXT_MAX = 12e3;
function arxivIdOf(ref) {
  var m = String(ref || "").match(/arxiv\.org\/(?:abs|pdf|html)\/([^\s?#]+?)(?:\.pdf)?\/?(?:[?#].*)?$/i);
  return m ? m[1] : "";
}
__name(arxivIdOf, "arxivIdOf");
function paperFullTextUrls(ref) {
  var id = arxivIdOf(ref);
  return id ? ["https://arxiv.org/html/" + id, "https://ar5iv.labs.arxiv.org/html/" + id] : [];
}
__name(paperFullTextUrls, "paperFullTextUrls");
function decodeEntities(s) {
  return String(s || "").replace(/&#(\d+);/g, function(m, n) {
    var c = Number(n);
    return c > 0 && c < 1114112 ? String.fromCodePoint(c) : " ";
  }).replace(/&#x([0-9a-f]+);/gi, function(m, n) {
    var c = parseInt(n, 16);
    return c > 0 && c < 1114112 ? String.fromCodePoint(c) : " ";
  }).replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
}
__name(decodeEntities, "decodeEntities");
function paperHtmlText(html2) {
  var h = String(html2 || "").slice(0, 6e5);
  var a = h.search(/<article\b/i);
  if (a >= 0) h = h.slice(a);
  h = h.replace(/<(script|style|nav|header|footer|noscript|annotation|annotation-xml|svg)\b[\s\S]*?<\/\1>/gi, " ").replace(/<section[^>]*class="[^"]*ltx_bibliography[\s\S]*$/i, " ").replace(/<\/(p|div|h[1-6]|li|section|tr|figcaption)>/gi, " ");
  return squish(decodeEntities(stripTags(h)));
}
__name(paperHtmlText, "paperHtmlText");
async function fetchPaperFullText(ref) {
  var urls = paperFullTextUrls(ref);
  for (var i = 0; i < urls.length; i++) {
    try {
      var r = await fetch(urls[i], { headers: { "User-Agent": fetchUA(), "Accept": "text/html" }, signal: AbortSignal.timeout(15e3), redirect: "follow" });
      if (!r.ok) {
        diagNote("paper full text " + urls[i].split("/")[2] + ": HTTP " + r.status);
        continue;
      }
      var t = paperHtmlText(await r.text());
      if (t.length >= PAPER_MIN_CHARS && !/^\s*(?:No HTML for|Conversion to HTML had a Fatal error)/i.test(t)) return { text: t.slice(0, PAPER_TEXT_MAX), url: urls[i] };
      diagNote("paper full text " + urls[i].split("/")[2] + ": " + t.length + " chars");
    } catch (e) {
      diagNote("paper full text: " + String(e && e.message || e).slice(0, 60));
    }
  }
  return null;
}
__name(fetchPaperFullText, "fetchPaperFullText");
async function withFullText(papers, want) {
  var out = [];
  for (var i = 0; i < papers.length && i < PAPER_FULLTEXT_TRIES && out.length < want; i++) {
    var ft = await fetchPaperFullText(papers[i].ref);
    if (ft) out.push({ kind: "paper", ref: papers[i].ref, title: papers[i].title, text: ft.text, full: true });
  }
  return out;
}
__name(withFullText, "withFullText");
var ANCHOR_MIN_CHARS = 2500;
var LINK_MIN_CHARS = 1200;
var ARXIV_WINDOW_DAYS = 7;
function arxivWindow(nowMs) {
  function stamp(ms) {
    return new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 12);
  }
  __name(stamp, "stamp");
  return "submittedDate:[" + stamp(nowMs - ARXIV_WINDOW_DAYS * 864e5) + "+TO+" + stamp(nowMs) + "]";
}
__name(arxivWindow, "arxivWindow");
function pickSeeded(list, seed, k) {
  var arr = list.slice(), out = [], h = seed >>> 0;
  while (arr.length && out.length < k) {
    h = Math.imul(h, 1664525) + 1013904223 >>> 0;
    out.push(arr.splice(h % arr.length, 1)[0]);
  }
  return out;
}
__name(pickSeeded, "pickSeeded");
var GROUND_MAX = 36e3;
var SENTENCE_CUT_KEEP = 0.6;
function cutAtSentence(text, max) {
  var t = String(text || "");
  if (t.length <= max) return t;
  var head = t.slice(0, max), best = -1, re = /[.!?]["')\]\u201d\u2019]*(?=\s)/g, m;
  while (m = re.exec(head)) best = m.index + m[0].length;
  return best >= max * SENTENCE_CUT_KEEP ? head.slice(0, best) : head;
}
__name(cutAtSentence, "cutAtSentence");
var PRIMARY_SHARE = 0.7;
function fitAnchors(anchors) {
  var n = anchors.length || 1, per = Math.max(900, Math.floor(GROUND_MAX / n));
  var prim = n > 1 ? Math.max(per, Math.floor(GROUND_MAX * PRIMARY_SHARE)) : per;
  var rest = n > 1 ? Math.max(900, Math.floor((GROUND_MAX - prim) / (n - 1))) : per;
  return anchors.map(function(a, i) {
    var o = { kind: a.kind, ref: a.ref, title: a.title, text: cutAtSentence(a.text, i === 0 ? prim : rest) };
    if (a.full) o.full = true;
    return o;
  });
}
__name(fitAnchors, "fitAnchors");
var SYSTEMS_FIT_MIN = 4;
var SYSTEMS_FIT_CHARS = 6e3;
var CATALOGUE_RE = /\b(?:minor planet|main-belt asteroid|asteroid|is a species of|is a genus of|species of (?:plant|moth|beetle|fly|snail|fish|bird|spider|fungus)|is a (?:village|hamlet|town|commune|municipality|census-designated place|unincorporated community|railway station|metro station|bus station) |is an? (?:studio |live |compilation )?album|is a song|is an? (?:episode|single) |is a (?:river|mountain|lake|crater) in)\b/i;
var DECISION_TERMS = ["decided", "decision", "policy", "policies", "government", "council", "committee", "ministry", "parliament", "congress", "court", "ruled", "law", "regulation", "regulated", "banned", "funded", "funding", "budget", "invested", "investment", "market", "price", "company", "firm", "corporation", "founded", "established", "elected", "election", "campaign", "negotiated", "treaty", "agreement", "trade", "strike", "union", "reform", "proposed", "opposed", "adopted", "approved", "rejected", "competition", "competitors", "acquired", "merger", "contract", "license", "licence", "rights", "lawsuit", "standard", "protocol", "incentive", "subsidy", "tax", "tariff", "war", "army", "governor", "mayor", "president", "minister", "board", "shareholders", "employees", "workers"];
var CAUSAL_MIN = 6;
var CAUSAL_CHARS = 6e3;
var CAUSAL_RE = /\b(?:because|due to|owing to|as a result|resulted in|results in|led to|leading to|lead to|caused|causing|in order to|so that|in response to|in an effort to|aimed (?:to|at)|intended to|designed to|meant to|to (?:prevent|reduce|increase|protect|avoid|allow|enable|encourage|discourage|compete)|therefore|consequently|thus|prompted|forced|motivated|the reason|reasons for|effect of|effects of|impact of|criticis(?:m|ed)|opposed|opposition|controvers(?:y|ial)|argued|critics|supporters)\b/gi;
function causalScore(text) {
  return (String(text || "").slice(0, CAUSAL_CHARS).match(CAUSAL_RE) || []).length;
}
__name(causalScore, "causalScore");
function systemsFit(art) {
  var text = String(art && art.text || ""), head = text.slice(0, SYSTEMS_FIT_CHARS).toLowerCase();
  var lead = text.slice(0, 600);
  if (CATALOGUE_RE.test(lead)) return { ok: false, score: 0, why: "catalogue entry" };
  var seen = 0;
  for (var i = 0; i < DECISION_TERMS.length; i++) if (new RegExp("\\b" + DECISION_TERMS[i] + "\\b").test(head)) seen++;
  return { ok: seen >= SYSTEMS_FIT_MIN, score: seen, why: seen >= SYSTEMS_FIT_MIN ? "fit" : "few decision terms (" + seen + ")" };
}
__name(systemsFit, "systemsFit");
var LINK_POOL = 500;
var LINK_MENTION_MIN = 2;
function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
__name(escRe, "escRe");
function mentionCount(text, needle) {
  if (!needle || needle.length < 4) return 0;
  var solo = !/\s/.test(needle);
  var re = solo ? "(?<![A-Z][\\w'-]*\\s)(?<=^|[^A-Za-z0-9])" + escRe(needle) + "(?![A-Za-z0-9])(?!\\s+[A-Z])" : "(?<=^|[^A-Za-z0-9])" + escRe(needle) + "(?![A-Za-z0-9])";
  var m = String(text || "").match(new RegExp(re, "g"));
  return m ? m.length : 0;
}
__name(mentionCount, "mentionCount");
function linkBase(title) {
  return String(title || "").replace(/\s*\([^)]*\)\s*$/, "").split(",")[0].replace(/^The\s+/, "").trim();
}
__name(linkBase, "linkBase");
function linkMentionScore(title, text, selfTitle) {
  var base = linkBase(title), s = 2 * mentionCount(text, base);
  var selfWords = linkBase(selfTitle).toLowerCase().split(/\s+/);
  var words = base.split(/\s+/).filter(Boolean), last = words[words.length - 1] || "";
  if (words.length >= 2 && last.length >= 5 && selfWords.indexOf(last.toLowerCase()) < 0 && words.every(function(w) {
    return /^[A-Z\u00C0-\u024F]/.test(w);
  })) s += mentionCount(text, last);
  return s;
}
__name(linkMentionScore, "linkMentionScore");
function rankLinked(titles, text, selfTitle) {
  var self = linkBase(selfTitle).toLowerCase();
  return (titles || []).map(function(t, i) {
    return { t, s: linkBase(t).toLowerCase() === self ? 0 : linkMentionScore(t, text, selfTitle), i };
  }).filter(function(x) {
    return x.s >= LINK_MENTION_MIN;
  }).sort(function(a, b) {
    return b.s - a.s || (/\(/.test(a.t) ? 1 : 0) - (/\(/.test(b.t) ? 1 : 0) || a.i - b.i;
  }).filter(function(x, k, arr) {
    var bx = linkBase(x.t).toLowerCase();
    return !arr.slice(0, k).some(function(y) {
      return linkBase(y.t).toLowerCase() === bx;
    });
  }).map(function(x) {
    return x.t;
  });
}
__name(rankLinked, "rankLinked");
var TOPIC_POOL = 20;
async function fetchWikiIntros(titles) {
  var list = (titles || []).slice(0, 20), res = {};
  if (!list.length) return res;
  var j = await srcJson("wikipedia intros", WIKI_API + "?action=query&prop=extracts&exintro=1&explaintext=1&exlimit=" + list.length + "&redirects=1&format=json&titles=" + encodeURIComponent(list.join("|")));
  var q = j && j.query || {}, pages = q.pages || {}, byTitle = {}, alias = {};
  Object.keys(pages).forEach(function(k) {
    var pg = pages[k];
    if (pg && pg.title && pg.extract) byTitle[pg.title] = squish(pg.extract);
  });
  (q.normalized || []).concat(q.redirects || []).forEach(function(r) {
    if (r && r.from && r.to) alias[r.from] = r.to;
  });
  list.forEach(function(t) {
    var x = t;
    for (var h = 0; h < 3 && alias[x]; h++) x = alias[x];
    if (byTitle[x]) res[t] = byTitle[x];
  });
  return res;
}
__name(fetchWikiIntros, "fetchWikiIntros");
function introScore(intro) {
  var text = String(intro || "");
  if (!text) return 0;
  if (CATALOGUE_RE.test(text.slice(0, 600))) return -1;
  var low = text.toLowerCase(), seen = 0;
  for (var i = 0; i < DECISION_TERMS.length; i++) if (new RegExp("\\b" + DECISION_TERMS[i] + "\\b").test(low)) seen++;
  return seen;
}
__name(introScore, "introScore");
function screenTopics(titles, intros) {
  var have = intros && Object.keys(intros).length;
  var scored = (titles || []).map(function(t, i) {
    return { t, i, s: have && intros[t] !== void 0 ? introScore(intros[t]) : 0 };
  });
  if (have) scored.sort(function(a, b) {
    return b.s - a.s || a.i - b.i;
  });
  return scored;
}
__name(screenTopics, "screenTopics");
var EVENT_POOL = 10;
var WIKI_REST = "https://en.wikipedia.org/api/rest_v1";
var MONTH_DAY_RE = /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}$/i;
var EVENT_WORD_RE = /\b(war|wars|attack|bombing|shooting|massacre|siege|battle|invasion|uprising|rebellion|revolution|riot|protest|strike|boycott|embargo|sanctions?|coup|crisis|scandal|hoax|fraud|trial|deal|agreement|accord|treaty|pact|referendum|election|act|law|bill|decree|reform|ban|abolition|amendment|constitution|independence|secession|accident|crash|disaster|collapse|explosion|earthquake|flood|fire|famine|pandemic|epidemic|outbreak|recession|default|bankruptcy|merger|operation|campaign|expedition|mission|incident|affair|conference|summit|convention|ceremony|founding|dissolution|partition|occupation|evacuation|assassination)\b/i;
function eventDay(seed) {
  var d = new Date(Date.UTC(2024, 0, 1) + (seed >>> 0) % 366 * 864e5);
  return [String(d.getUTCMonth() + 1).padStart(2, "0"), String(d.getUTCDate()).padStart(2, "0")];
}
__name(eventDay, "eventDay");
function eventPage(p) {
  var t = squish(String(p && (p.normalizedtitle || p.title) || "").replace(/_/g, " ")), desc = squish(String(p && p.description || ""));
  if (!t || /^\d{1,4}( BC| AD| BCE| CE)?$/i.test(t) || MONTH_DAY_RE.test(t) || /^(List|Lists|Index|Outline|Timeline) of /i.test(t)) return "";
  return EVENT_WORD_RE.test(t) || EVENT_WORD_RE.test(desc) || /^\d{3,4}\b/.test(desc) ? t : "";
}
__name(eventPage, "eventPage");
function eventTitles(feed) {
  var out = [];
  (feed && feed.events || []).forEach(function(ev) {
    var pages = ev && ev.pages || [];
    for (var i = 0; i < pages.length; i++) {
      var t = eventPage(pages[i]);
      if (!t) continue;
      if (out.indexOf(t) < 0) out.push(t);
      break;
    }
  });
  return out;
}
__name(eventTitles, "eventTitles");
async function fetchEventTitles(seed, n) {
  var md = eventDay(seed);
  var j = await srcJson("wikipedia onthisday", WIKI_REST + "/feed/onthisday/events/" + md[0] + "/" + md[1]);
  return pickSeeded(eventTitles(j), seed, n);
}
__name(fetchEventTitles, "fetchEventTitles");
async function wikiAnchors(used, cooled, seed) {
  var events = [];
  try {
    events = await fetchEventTitles(seed, EVENT_POOL);
  } catch (eE) {
    diagNote("wikipedia onthisday: " + String(eE && eE.message || eE).slice(0, 60));
  }
  var random = await fetchRandomTitles(TOPIC_POOL - events.length);
  var pool = events.concat(random.filter(function(x) {
    return events.indexOf(x) < 0;
  }));
  if (events.length) diagNote("event pool: " + events.length + " from " + eventDay(seed).join("/"));
  var fresh = pool.filter(function(x) {
    return used.indexOf("wiki:" + x) < 0 && !cooled["wiki:" + x];
  });
  var intros = {};
  try {
    intros = await fetchWikiIntros(fresh);
  } catch (eI) {
    diagNote("wikipedia intros: " + String(eI && eI.message || eI).slice(0, 60));
  }
  var scored = screenTopics(fresh, intros);
  if (Object.keys(intros).length) diagNote("intro screen: " + scored.slice(0, 3).map(function(x) {
    return x.t.slice(0, 40) + " " + x.s;
  }).join(", "));
  var titles = scored.map(function(x) {
    return x.t;
  });
  var primary = null, fallback = null, skipped = [], fitted = null, fittedCausal = -1, causalSeen = [];
  for (var t = 0; t < titles.length && !primary && t < 10; t++) {
    var key = "wiki:" + titles[t];
    if (used.indexOf(key) >= 0 || cooled[key]) continue;
    var art = await fetchWiki(titles[t]);
    if (!art || art.text.length < ANCHOR_MIN_CHARS) continue;
    var fit = systemsFit(art);
    if (fit.ok) {
      var cs = causalScore(art.text);
      causalSeen.push(art.title.slice(0, 40) + " " + cs);
      if (cs >= CAUSAL_MIN) primary = art;
      else if (cs > fittedCausal) {
        fitted = art;
        fittedCausal = cs;
      }
    } else {
      if (!fallback) fallback = art;
      skipped.push(titles[t] + " (" + fit.why + ")");
    }
  }
  if (skipped.length) diagNote("systems-fit skipped: " + skipped.slice(0, 3).join(", "));
  if (causalSeen.length) diagNote("causal screen: " + causalSeen.slice(0, 5).join(", ") + (primary ? "" : fitted ? "; none stated " + CAUSAL_MIN + ", using " + fitted.title : ""));
  if (!primary && fitted) primary = fitted;
  if (!primary && fallback) {
    primary = fallback;
    diagNote("systems-fit: no candidate fit, using " + fallback.title);
  }
  if (!primary) return [];
  var anchors = [primary];
  var pool = await fetchLinkedTitles(primary.title);
  var named = rankLinked(pool, primary.text, primary.title);
  var linked = named.slice(0, 4).concat(pickSeeded(pool.filter(function(x) {
    return named.indexOf(x) < 0;
  }), seed, 6)).slice(0, 6);
  var got = 0, picked = [];
  for (var li = 0; li < linked.length && got < 2; li++) {
    var la = await fetchWiki(linked[li]);
    if (la && la.text.length >= LINK_MIN_CHARS) {
      anchors.push(la);
      got++;
      picked.push(la.title + (named.indexOf(linked[li]) >= 0 ? " (named)" : " (random)"));
    }
  }
  if (picked.length) diagNote("context links: " + picked.join(", "));
  return anchors;
}
__name(wikiAnchors, "wikiAnchors");
async function paperAnchors(subject, seed) {
  var papers = [];
  if (subject) papers = await fetchArxivQuery("arxiv subject", "all:%22" + encodeURIComponent(subject) + "%22", "relevance");
  if (!papers.length) papers = pickSeeded(await fetchArxivQuery("arxiv recent", arxivWindow(Date.now())), seed, 8);
  return withFullText(papers, 3);
}
__name(paperAnchors, "paperAnchors");
async function ensureAnchorCache(env) {
  try {
    await env.PERSONAL.prepare("CREATE TABLE IF NOT EXISTS companion_anchor_cache (id INTEGER PRIMARY KEY AUTOINCREMENT, topic_id TEXT, a TEXT, anchors_json TEXT NOT NULL, created_at TEXT NOT NULL, attempts INTEGER DEFAULT 0, done INTEGER DEFAULT 0)").run();
    return true;
  } catch (e) {
    return false;
  }
}
__name(ensureAnchorCache, "ensureAnchorCache");
async function pickTopic(env, form) {
  srcDiag = [];
  var used = [];
  try {
    var r = await env.PERSONAL.prepare(
      "SELECT DISTINCT key FROM companion_seeds WHERE used_at > datetime('now','-10 days') OR (form = ? AND used_at > datetime('now','-1 day'))"
    ).bind(form).all();
    var rr = r.results || [];
    for (var i = 0; i < rr.length; i++) used.push(rr[i].key);
  } catch (e) {
    used = [];
  }
  var cooled = {};
  try {
    var cr = await env.PERSONAL.prepare(
      // TOPIC-COOLDOWN-2: a rejected draft counts too (every attempt of a topic ended 'rejected' and the run 'failed' with no topic, so the
      // cooldown never saw a topic and one Wikipedia article was retried every hour: runs 5100-5135)
      "SELECT topic, SUM(CASE WHEN status IN ('failed','rejected') THEN 1 ELSE 0 END) f FROM companion_runs WHERE topic != '' AND topic != 'none' AND run_at > datetime('now','-14 days') GROUP BY topic"
    ).all();
    var crr = cr.results || [];
    for (var ci = 0; ci < crr.length; ci++) if (Number(crr[ci].f) >= 2) cooled[crr[ci].topic] = true;
  } catch (e) {
    cooled = {};
  }
  var seed = (Date.now() ^ Math.random() * 4294967296) >>> 0;
  var wiki = [], papers = [];
  try {
    wiki = await wikiAnchors(used, cooled, seed);
  } catch (eW) {
    wiki = [];
    diagNote("wikipedia: " + String(eW && eW.message || eW).slice(0, 60));
  }
  try {
    papers = await paperAnchors(wiki.length ? wiki[0].title : "", seed);
  } catch (eP) {
    papers = [];
    diagNote("arxiv: " + String(eP && eP.message || eP).slice(0, 60));
  }
  var anchors = [], id = "", subject = "";
  if (wiki.length >= 2) {
    anchors = wiki.concat(papers.slice(0, 2));
    id = "wiki:" + wiki[0].title;
    subject = wiki[0].title;
  } else if (papers.length >= 2) {
    var pp = papers.slice(0, 3);
    anchors = (wiki.length ? wiki : []).concat(pp);
    id = "arxiv:" + pp[0].title;
    subject = pp[0].title;
    if (used.indexOf(id) >= 0 || cooled[id]) {
      anchors = [];
    }
  }
  var cacheOk = await ensureAnchorCache(env);
  var cacheId = 0, fromCache = false;
  if (anchors.length < 2 && cacheOk) {
    try {
      var cr2 = await env.PERSONAL.prepare("SELECT id, topic_id, a, anchors_json FROM companion_anchor_cache WHERE done = 0 AND attempts < 3 AND created_at > ? ORDER BY id DESC LIMIT 1").bind(new Date(Date.now() - 3 * 864e5).toISOString()).first();
      var cached = cr2 && JSON.parse(cr2.anchors_json);
      if (cached) cached = cached.filter(function(a) {
        return a && (a.kind !== "paper" || a.full === true);
      });
      if (cached && String(cr2.topic_id || "").indexOf("arxiv:") === 0 && !cached.some(function(a) {
        return a.title === cr2.a;
      })) cached = null;
      if (cached && cached.length >= 2) {
        anchors = cached;
        id = cr2.topic_id;
        subject = cr2.a;
        cacheId = cr2.id;
        fromCache = true;
        await env.PERSONAL.prepare("UPDATE companion_anchor_cache SET attempts = attempts + 1 WHERE id = ?").bind(cr2.id).run();
        diagNote("reused cached material " + id);
      }
    } catch (eC) {
      logCaught("pickTopic", eC);
    }
  }
  if (anchors.length < 2) return { id: "none", a: "", b: "", anchors: [], diag: srcDiag.join("; ") || "no source returned usable text" };
  anchors = fitAnchors(anchors);
  var pick = { id, a: subject, b: anchors.length > 1 ? anchors[1].title : "", anchors, diag: srcDiag.join("; "), cacheId, fromCache };
  if (!fromCache && cacheOk) {
    try {
      var ins = await env.PERSONAL.prepare("INSERT INTO companion_anchor_cache (topic_id, a, anchors_json, created_at, attempts) VALUES (?,?,?,?,1)").bind(id, subject, JSON.stringify(anchors), nowIso()).run();
      pick.cacheId = ins && ins.meta && ins.meta.last_row_id || 0;
    } catch (eI) {
      logCaught("pickTopic", eI);
    }
  }
  try {
    await env.PERSONAL.prepare(
      "INSERT INTO companion_seeds(key, source, form, used_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET used_at=excluded.used_at, form=excluded.form"
    ).bind(pick.id, "live", form, nowIso()).run();
  } catch (e) {
    try {
      await env.PERSONAL.prepare("INSERT OR IGNORE INTO companion_seeds(key, source, form, used_at) VALUES(?,?,?,?)").bind(pick.id, "live", form, nowIso()).run();
    } catch (e2) {
      logCaught("pickTopic", e2);
    }
  }
  return pick;
}
__name(pickTopic, "pickTopic");
var DS_BREAKER_MS = 36e5;
var dsBreakerUntil = 0;
var lastCallFallback = false;
var WRITER_LEAD = "@cf/deepseek-ai/deepseek-v4-pro-0813";
var CF_FALLBACK = {
  essay: [WRITER_LEAD, "@cf/openai/gpt-oss-120b", "@cf/moonshotai/kimi-k2.6", "@cf/zai-org/glm-5.3"],
  writer: [WRITER_LEAD, "@cf/openai/gpt-oss-120b", "@cf/moonshotai/kimi-k2.6", "@cf/zai-org/glm-5.3"],
  // CRITIC-NOTHINK-1 (1.20.2): deepseek-v4-pro answers fact-checks in about 9 s with no errors (ai_call_counters 2026-10-13) and is a
  // family other than the gpt-oss writer, so it is second; glm-5.3 stays last.
  critic: ["@cf/moonshotai/kimi-k2.6", "@cf/deepseek-ai/deepseek-v4-pro-0813", "@cf/openai/gpt-oss-120b", "@cf/zai-org/glm-5.3"],
  // REFRAME-REPAIR-1 (1.23.0): the editor is the writer's family first and never the critic's first family (moonshot), so the critic's
  // re-read of an edited draft stays an independent reading; nemotron (nvidia) is the last family
  editor: [WRITER_LEAD, "@cf/openai/gpt-oss-120b", "@cf/nvidia/nemotron-3-120b-a12b"]
};
var CF_FALLBACK_GPT_OSS = { essay: CF_FALLBACK.essay.slice(1), writer: CF_FALLBACK.writer.slice(1), editor: CF_FALLBACK.editor.slice(1) };
var authorFamilies = {};
var writerOrder = "deepseek";
async function loadWriterOrder(env) {
  writerOrder = "deepseek";
  try {
    var db = env && (env.AUDIT || env.QNFO_AUDIT);
    var row = db ? await db.prepare("SELECT value FROM ops_config WHERE key = 'companion_writer'").first() : null;
    if (row && /gpt-oss/i.test(String(row.value || ""))) writerOrder = "gpt-oss";
  } catch (e) {
    logCaught("loadWriterOrder", e);
  }
  return writerOrder;
}
__name(loadWriterOrder, "loadWriterOrder");
var FB_MIN_TOKENS = 4e3;
var FB_MIN_TIMEOUT_MS = 9e4;
function fallbackChain(model, role) {
  var table = writerOrder === "gpt-oss" ? Object.assign({}, CF_FALLBACK, CF_FALLBACK_GPT_OSS) : CF_FALLBACK;
  if (role && table[role]) return table[role];
  return String(model || "").indexOf("reasoner") >= 0 ? table.essay : table.writer;
}
__name(fallbackChain, "fallbackChain");
function cfText(r) {
  if (!r) return { text: "", rlen: 0 };
  var c = "", rc = "";
  if (typeof r.response === "string") c = r.response;
  var m = r.choices && r.choices[0] && r.choices[0].message;
  if (m) {
    if (!c && typeof m.content === "string") c = m.content;
    rc = m.reasoning_content || m.reasoning || "";
  }
  return { text: c, rlen: String(rc || "").length };
}
__name(cfText, "cfText");
async function callWorkersAI(env, messages, maxTokens, timeoutMs, chain, prevErr, role) {
  var errs = prevErr ? [prevErr] : [];
  for (var i = 0; i < chain.length; i++) {
    var m = chain[i];
    if (!modelAllowed(m)) continue;
    if (role === "critic" && authorFamilies[familyOf(m)]) {
      errs.push(m + ": skipped (author family)");
      continue;
    }
    var quiet = role === "critic" || role === "editor" || /kimi|deepseek/i.test(m);
    try {
      var r = await aiRunAttr(
        env,
        "personal-companion",
        "compose-fallback",
        m,
        Object.assign({ messages, max_tokens: Math.min(Math.max(Number(maxTokens) || 0, FB_MIN_TOKENS), 14e3), temperature: role === "critic" || role === "editor" ? CRITIC_TEMPERATURE : WRITER_TEMPERATURE_FB }, quiet ? factCheckExtra(m) : {}),
        // COMPANION-PUBLISH-REPAIR-1: skipCache. The default AI Gateway caches identical requests, so a retry with the same prompt got the
        // same draft back in 0.1 s (runs 5242-5254 and 5264-5276 replayed the 01:00Z drafts verbatim); every writer and critic call is fresh.
        { gateway: { id: "default", skipCache: true }, signal: AbortSignal.timeout(Math.max(Number(timeoutMs) || 0, FB_MIN_TIMEOUT_MS)) }
      );
      var t = cfText(r);
      if (typeof t.text === "string" && t.text.trim().length > 80) {
        if (role !== "critic") authorFamilies[familyOf(m)] = 1;
        return { model: m, text: t.text };
      }
      errs.push(m + ": empty (clen=" + String(t.text || "").length + " rlen=" + t.rlen + ")");
    } catch (e) {
      errs.push(m + ": " + String(e && e.message || e).slice(0, 160));
    }
  }
  return { model: chain[0], text: null, error: errs.join(" | ").slice(0, 600) };
}
__name(callWorkersAI, "callWorkersAI");
async function callModel(env, messages, maxTokens, timeoutMs, model, role) {
  var useModel = model || WRITER_MODEL;
  var isReasoner = String(useModel).indexOf("reasoner") >= 0;
  var chain = fallbackChain(useModel, role);
  lastCallFallback = false;
  if (!env.DEEPSEEK_API_KEY || Date.now() < dsBreakerUntil) {
    lastCallFallback = true;
    return await callWorkersAI(env, messages, maxTokens, timeoutMs, chain, Date.now() < dsBreakerUntil ? "deepseek breaker open" : "no deepseek key", role);
  }
  var dsErr = "";
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
        logCaught("callModel", e2);
      }
      if (resp.status === 401 || resp.status === 402 || resp.status === 403) dsBreakerUntil = Date.now() + DS_BREAKER_MS;
      dsErr = useModel + ": HTTP " + resp.status + " " + errText.slice(0, 160);
    } else {
      var j = await resp.json();
      var msg = j && j.choices && j.choices[0] && j.choices[0].message;
      var text = msg && msg.content || "";
      if (typeof text === "string" && text.trim().length > 80) return { model: useModel, text };
      dsErr = useModel + ": " + (msg && msg.reasoning_content ? "reasoning only, rlen=" + String(msg.reasoning_content).length : "empty");
    }
  } catch (e) {
    dsErr = useModel + ": " + String(e && e.message || e).slice(0, 160);
  }
  lastCallFallback = true;
  return await callWorkersAI(env, messages, maxTokens, timeoutMs, chain, dsErr, role);
}
__name(callModel, "callModel");
__name2(callModel, "callModel");
__name22(callModel, "callModel");
__name222(callModel, "callModel");
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
__name2(renderInline, "renderInline");
__name22(renderInline, "renderInline");
__name222(renderInline, "renderInline");
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
__name2(escHtml, "escHtml");
__name22(escHtml, "escHtml");
__name222(escHtml, "escHtml");
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
  __name2(flushP, "flushP");
  __name22(flushP, "flushP");
  __name222(flushP, "flushP");
  function closeList() {
    if (listOpen) {
      out.push("</ul>");
      listOpen = false;
    }
  }
  __name(closeList, "closeList");
  __name2(closeList, "closeList");
  __name22(closeList, "closeList");
  __name222(closeList, "closeList");
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
__name2(renderBody, "renderBody");
__name22(renderBody, "renderBody");
__name222(renderBody, "renderBody");
function formLabel(f) {
  if (f === "essay") return "Essay";
  if (f === "notes") return "Field notes";
  if (f === "serial") return "Long-form";
  return f;
}
__name(formLabel, "formLabel");
__name2(formLabel, "formLabel");
__name22(formLabel, "formLabel");
__name222(formLabel, "formLabel");
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
function page2(title, inner, extraHead) {
  return "<!doctype html><html lang=en><head><meta charset=utf-8><meta name=robots content=noindex><meta name=viewport content=" + String.fromCharCode(34) + "width=device-width,initial-scale=1" + String.fromCharCode(34) + "><title>" + escHtml(title) + "</title><link rel=alternate type=application/rss+xml title=Reading href=/feed.xml><meta name=description content='A personal companion that writes one piece at a time - essays, field notes, and long-form serials.'><style>" + CSS + "</style>" + (extraHead || "") + "</head><body><div class=wrap>" + inner + "</div><script src='https://fleet.qnfo.org/ctl.js' defer><\/script></body></html>";
}
__name(page2, "page");
__name2(page2, "page");
__name22(page2, "page");
__name222(page2, "page");
function shell(inner) {
  return "<header class=mast><h1><a href=/>Reading</a></h1><p>Written for one reader. Private.</p><nav class=forms><a href=/subscribe>subscribe</a><a href=/feed.xml>rss</a></nav></header>" + inner;
}
__name(shell, "shell");
__name2(shell, "shell");
__name22(shell, "shell");
__name222(shell, "shell");
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
  return page2("Reading", shell(body));
}
__name(renderIndex, "renderIndex");
__name2(renderIndex, "renderIndex");
__name22(renderIndex, "renderIndex");
__name222(renderIndex, "renderIndex");
function renderPiece(p, keyQS) {
  var bodyMd = String(p.body_md || "");
  var startsHeading = /^\s*#/.test(bodyMd);
  var ledeHtml = !startsHeading && p.lede ? "<p class=lede>" + escHtml(p.lede) + "</p>" : "";
  var body = "<div class=meta>" + formLabel(p.form) + " &middot; " + p.day + " &middot; " + p.word_count + " words</div><h2>" + escHtml(p.title) + "</h2>" + (p.subtitle ? "<p class=meta>" + escHtml(p.subtitle) + "</p>" : "") + ledeHtml + renderBody(bodyMd);
  var fb = "<div class=fb>Was this worth your time? <a href=/api/f?slug=" + p.slug + "&s=good>yes</a><a href=/api/f?slug=" + p.slug + "&s=flat>flat</a><a href=/api/f?slug=" + p.slug + "&s=no>no</a></div>";
  var foot = "<footer><a href=/ " + keyQS + ">back to index</a></footer>";
  return page2(p.title, shell(body + fb + foot));
}
__name(renderPiece, "renderPiece");
__name2(renderPiece, "renderPiece");
__name22(renderPiece, "renderPiece");
__name222(renderPiece, "renderPiece");
function anchorsBlock(topic, anchors, life, profile) {
  var lines = [];
  lines.push("--- briefing. Never reproduce any wording from this briefing in the piece. ---");
  lines.push("subject: " + topic.a);
  if (anchors.length) lines.push("the subject comes from: the " + sourceLabel(anchors[0]) + ' "' + anchors[0].title + '" (name it in the lede)');
  lines.push("The other items are supporting source material: use those that bear on the subject, ignore the rest. Do not force a connection the sources do not make.");
  lines.push("");
  lines.push("SOURCE MATERIAL, concrete and checkable; the only things you may assert as fact (nothing outside it, not even what you are sure is true):");
  for (var i = 0; i < anchors.length; i++) {
    var a = anchors[i];
    lines.push("[" + (i + 1) + "] " + sourceLabel(a) + " :: " + a.title);
    lines.push("    ref: " + a.ref);
    lines.push("    " + a.text);
    lines.push("");
  }
  lines.push("who the reader is; shapes emphasis and register only, is not source material and supports no factual claim:");
  lines.push(profile);
  lines.push("");
  lines.push("his recent life; shapes emphasis only, is not source material, never list it back at him:");
  lines.push(life);
  return lines.join(NL).slice(0, 32e3);
}
__name(anchorsBlock, "anchorsBlock");
__name2(anchorsBlock, "anchorsBlock");
__name22(anchorsBlock, "anchorsBlock");
__name222(anchorsBlock, "anchorsBlock");
function countHeadings(md, level) {
  var mark = level === 3 ? "### " : "## ";
  var lines = String(md).split(NL);
  var n = 0;
  for (var i = 0; i < lines.length; i++) if (lines[i].trim().indexOf(mark) === 0) n++;
  return n;
}
__name(countHeadings, "countHeadings");
__name2(countHeadings, "countHeadings");
__name22(countHeadings, "countHeadings");
__name222(countHeadings, "countHeadings");
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
__name2(extractSection, "extractSection");
__name22(extractSection, "extractSection");
__name222(extractSection, "extractSection");
var OBJECTION_CUE_RE = /\b(objections?|object(?:s)? that|counter-?arguments?|case against|argument against|strongest (?:challenge|reply|doubt)|a careful reader|a sceptic|a skeptic)\b/i;
var OBJECTION_HEAD_RE = /\b(objections?|against|counter|critics?|sceptic|skeptic|doubts?|wrong|other side|caveats?|challenges?|reservations?|rebuttal|dissent|weakness(?:es)?)\b/i;
function findObjection(md) {
  var s = extractSection(md, "objection");
  if (s.length >= 40) return s;
  var paras = String(md || "").split(/\n\s*\n/).map(function(x) {
    return x.trim();
  }).filter(Boolean);
  for (var i = 0; i < paras.length; i++) {
    if (paras[i].indexOf("#") === 0 || !OBJECTION_CUE_RE.test(paras[i])) continue;
    var t = paras[i];
    if (t.length < 200 && i + 1 < paras.length && paras[i + 1].indexOf("#") !== 0) t += " " + paras[i + 1];
    t = t.replace(/\s+/g, " ").trim();
    if (t.length >= 40) return t;
  }
  var lines = String(md || "").split(NL), on = false, out = [];
  for (var j = 0; j < lines.length; j++) {
    var l = lines[j].trim();
    if (l.indexOf("#") === 0) {
      if (on && out.join(" ").trim().length >= 40) break;
      on = OBJECTION_HEAD_RE.test(l.replace(/^#+/, ""));
      out = [];
      continue;
    }
    if (on && l) out.push(l);
  }
  var h = out.join(" ").replace(/\s+/g, " ").trim();
  return on && h.length >= 40 ? h : s;
}
__name(findObjection, "findObjection");
__name2(findObjection, "findObjection");
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
  return { lede, rest, startsHeading };
}
__name(extractLede, "extractLede");
__name2(extractLede, "extractLede");
__name22(extractLede, "extractLede");
__name222(extractLede, "extractLede");
var NOTES_OBJECTION_PLACEHOLDER = "Each item stands or falls on its own.";
async function composePiece(env, form, topic, anchors, life, profile, continuity, feedback, revision) {
  var band = writerBand(form, writerIsFallback(env)), bandText = band[0] + " to " + band[1] + " words";
  var formContract = (form === "essay" ? P_ESSAY : form === "serial" ? P_SERIAL : P_NOTES).replace(/\d{4} to \d{4} words/, bandText);
  var outRule = form === "notes" ? "Output format: plain markdown only, no JSON, no code fences. First line: a single heading starting with # and a short title for the whole set. Then the lede paragraph, with no heading above it. Then each movement as its own ## heading followed by several developed paragraphs." : "Output format: plain markdown only, no JSON, no code fences. First line: a single heading starting with # and the title. Then the lede paragraph, with no heading above it. Use ## for sections after it. The strongest objection must appear in the piece, but never under the same heading or in the same position twice in a row; place it where the argument needs it";
  var P_ADV1 = L("ADVERSARIAL-REASONING-1 (binding): DISAGREE-WITH-EVIDENCE - state disagreement plainly with counter-evidence when evidence contradicts the user/source/corpus; SEEK-DISCONFIRMATION - name and test the strongest argument against the current answer; EXPOSE-FAILURE-MODES - state at least one concrete failure mode per substantive response; LABEL-UNCERTAINTY - tie confidence to evidence, never inflate it, and say I do not know with a reason when required.");
  var sys = [P_STYLE, P_ADV1, "", formContract, "", outRule].join(NL);
  var concreteRule = "Every claim must be tied to a named, checkable particular that appears in the source material, and you may name nothing that does not appear there. A sentence that could have been written without the source material is a failed sentence. Write the title and every heading in sentence case: capitalise only the first word and names that appear in the source material.";
  var lenRule = concreteRule + " Length: " + bandText + (form === "notes" ? ", in 3 to 5 movements" : "") + ". Reach it with what the source material says, never with particulars it does not hold: a shorter piece that adds nothing is better than a longer one that invents.";
  var user = [anchorsBlock(topic, anchors, life, profile), "", lenRule, "", continuity, feedback ? "A previous draft was rejected by an adversarial reader for this reason: " + feedback + " Write a better draft that fixes that." : "", revision ? NL + factRevisionPrompt(revision.problems) + NL + NL + "--- DRAFT TO REVISE ---" + NL + "# " + String(revision.title || "") + NL + NL + String(revision.body_md || "").slice(0, 24e3) : ""].join(NL);
  var writerModel = form === "notes" ? WRITER_MODEL : WRITER_MODEL_ESSAY;
  authorFamilies = {};
  var r = await callModel(env, [{ role: "system", content: sys }, { role: "user", content: user }], GEN_MAX_TOKENS, WRITER_TIMEOUT_MS, writerModel, form === "notes" ? "writer" : "essay");
  if (!r || !r.text) {
    var errMsg = r && r.error ? r.error : "callModel returned null";
    return { piece: null, model: r && r.model || writerModel, raw: "", error: errMsg };
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
  if (!title) title = topic.b ? topic.a + " and " + topic.b : topic.a;
  var objection = findObjection(md);
  var ledeObj = extractLede(md);
  return {
    piece: {
      title: title.slice(0, 300),
      subtitle: "",
      lede: ledeObj.lede,
      body_md: ledeObj.rest,
      objection: objection || (form === "notes" ? NOTES_OBJECTION_PLACEHOLDER : "")
    },
    model: r.model,
    raw: String(r.text || "")
  };
}
__name(composePiece, "composePiece");
__name2(composePiece, "composePiece");
__name22(composePiece, "composePiece");
__name222(composePiece, "composePiece");
async function critiquePiece(env, piece, form, ground, note) {
  var wb = writerBand(form, writerIsFallback(env)), band = wb[0] + " to " + wb[1] + " words" + (form === "notes" ? " in 3 to 5 movements" : "");
  var objText = String(piece.objection || "").trim();
  var objLine = !objText || objText === NOTES_OBJECTION_PLACEHOLDER ? "(no separate objection section; judge the objection the body raises, if any)" : objText;
  var user = todayLine() + NL + NL + "SOURCE MATERIAL:" + NL + String(ground || "").slice(0, GROUND_MAX + 2e3) + NL + NL + "FORM: " + form + " (" + band + ")" + NL + NL + "TITLE: " + piece.title + NL + "LEDE: " + stripAnalysisMark(piece.lede || "") + NL + "STATED OBJECTION: " + objLine + NL + NL + "BODY:" + NL + (analysisSplitOk(splitText(piece)) ? String(piece.body_md || "") : stripAnalysisMark(piece.body_md));
  if (note) user += NL + NL + String(note);
  var r = await callModel(env, [{ role: "system", content: P_CRITIQUE }, { role: "user", content: user }], 1600, CRITIQUE_TIMEOUT_MS, CRITIC_MODEL, "critic");
  return r && r.text ? parseJsonLoose(r.text) : null;
}
__name(critiquePiece, "critiquePiece");
__name2(critiquePiece, "critiquePiece");
__name22(critiquePiece, "critiquePiece");
__name222(critiquePiece, "critiquePiece");
var GEN_BUDGET_MS = 6e5;
var LENGTH_FLOOR = { essay: 2e3, serial: 1800, notes: 1700 };
var FALLBACK_FLOOR_RATIO = 0.5;
var WRITER_TEMPERATURE_FB = 0.35;
var CRITIC_TEMPERATURE = 0.2;
var FULL_BAND = { essay: [2e3, 2800], serial: [1800, 2400], notes: [1800, 2400] };
function writerBand(form, fallback) {
  var full = FULL_BAND[form] || FULL_BAND.notes;
  if (!fallback) return full;
  var lo = Math.round((LENGTH_FLOOR[form] || 1700) * FALLBACK_FLOOR_RATIO * 1.15 / 50) * 50;
  return [lo, lo + 500];
}
__name(writerBand, "writerBand");
function writerIsFallback(env) {
  return !(env && env.DEEPSEEK_API_KEY) || Date.now() < dsBreakerUntil;
}
__name(writerIsFallback, "writerIsFallback");
var REPAIR_FLOOR_SHARE = 0.85;
function floorFor(form, share) {
  var f = LENGTH_FLOOR[form];
  if (f && lastCallFallback) f = Math.round(f * FALLBACK_FLOOR_RATIO);
  return f && share ? Math.round(f * share) : f;
}
__name(floorFor, "floorFor");
function expandFeedback(problems, form, piece) {
  if (!problems || problems.length !== 1) return null;
  var m = /^(essay|serial|notes) length (\d+)$/.exec(String(problems[0]));
  if (!m || m[1] !== form) return null;
  var wc = Number(m[2]), floor = floorFor(form);
  if (!floor || wc >= floor) return null;
  var target = floor + 300;
  return "The previous draft was good but too short: " + wc + " words against a floor of " + floor + ". Do not start over. Return the same piece, same title and the same sections in the same order, extended to at least " + target + " words: deepen each section with more specific particulars from the source material (names, numbers, mechanisms, cases) and a fuller treatment of the strongest objection. Keep every sentence that is already there unless extending it. The draft follows." + NL + NL + "# " + String(piece && piece.title || "") + NL + NL + String(piece && piece.body_md || "").slice(0, 24e3);
}
__name(expandFeedback, "expandFeedback");
var LEDE_SUBJECT_PREFIX = "lede does not name the subject";
function pruneBlockFixable(problems, form) {
  var ps = problems || [], lenRe = new RegExp("^" + form + " length \\d+$");
  return ps.length > 0 && ps.every(function(p) {
    var x = String(p);
    return lenRe.test(x) || x.indexOf(LEDE_SUBJECT_PREFIX) === 0;
  });
}
__name(pruneBlockFixable, "pruneBlockFixable");
function pruneRepairFeedback(problems, form, piece, subject) {
  if (!pruneBlockFixable(problems, form)) return null;
  var len = (problems || []).filter(function(p) {
    return /^(essay|serial|notes) length \d+$/.test(String(p));
  })[0];
  var lede = (problems || []).some(function(p) {
    return String(p).indexOf(LEDE_SUBJECT_PREFIX) === 0;
  });
  var ledeLine = "Its first paragraph must say what " + String(subject || "the subject").slice(0, 120) + " is and where it comes from, from the source material only; open the piece with that.";
  var fb = len ? expandFeedback([len], form, piece) : null;
  if (len && !fb) return null;
  if (fb) return lede ? fb.replace("The draft follows.", ledeLine + " The draft follows.") : fb;
  return "The previous draft was good, but its first paragraph no longer names its subject. Do not start over. Return the same piece, same title and the same sections in the same order. " + ledeLine + " Keep every other sentence as it is. The draft follows." + NL + NL + "# " + String(piece && piece.title || "") + NL + NL + String(piece && piece.body_md || "").slice(0, 24e3);
}
__name(pruneRepairFeedback, "pruneRepairFeedback");
var LEDE_MAX_WORDS = 120;
var LEDE_ABSTRACT_RE = /^\s*(?:(?:the|this|that|these|such|our)\s+(?:very\s+)?(?:idea|notion|concept|question|problem|pattern|mechanism|story|history|tension|dynamics?|nature|essence|meaning|paradox)\s+of\b|in\s+(?:a|an|the|our|today's)\s+(?:world|age|era|time|times)\b|throughout\s+(?:history|time|the\s+ages)\b|since\s+the\s+dawn\b|(?:imagine|consider|picture)\b|what\s+(?:if|does|do|is|makes|happens)\b|(?:we|you)\s+(?:often|rarely|tend|all|like)\b|there\s+is\s+something\b|few\s+\w+\s+(?:are|have|capture)\b)/i;
var LEDE_STOP = /^(this|that|with|from|have|were|their|there|which|when|what|into|than|then|they|them|been|also|only|more|most|such|does|each|over|will|would|could|should|about|after|before|because|while|where|your|using|based|towards?|new|how|why|the|and|for)$/;
function ledeWords(t) {
  return String(t || "").toLowerCase().replace(/[‐-―−]/g, "-").split(/[^a-z0-9À-ɏ]+/).filter(function(w) {
    return w.length >= 4 && !LEDE_STOP.test(w);
  });
}
__name(ledeWords, "ledeWords");
function ledeOf(piece) {
  var l = String(piece && piece.lede || "").trim();
  if (l) return l;
  var paras = String(piece && piece.body_md || "").split(/\n\s*\n/);
  for (var i = 0; i < paras.length; i++) {
    var p = paras[i].trim();
    if (p && p.charAt(0) !== "#" && p.indexOf("- ") !== 0 && p.indexOf("> ") !== 0 && p.indexOf("<!--") !== 0) return p.replace(/\s+/g, " ");
  }
  return "";
}
__name(ledeOf, "ledeOf");
function ledeProblems(piece, subject) {
  var lede = ledeOf(piece), out = [];
  if (!lede) return ["lede missing: open with a paragraph that says what the subject is and where it comes from"];
  var n = lede.split(/\s+/).filter(Boolean).length;
  if (n > LEDE_MAX_WORDS) out.push("lede too long (" + n + " words; the first paragraph is at most " + LEDE_MAX_WORDS + ")");
  var first = (lede.match(/^[\s\S]*?[.!?](?=\s|$)/) || [lede])[0];
  if (LEDE_ABSTRACT_RE.test(lede.replace(/^[*_\s]+/, "")) || /\?\s*$/.test(first)) out.push("lede opens on abstract framing or a question ('" + lede.slice(0, 50) + "'): open by saying what the subject is and where it comes from");
  var want = ledeWords(subject);
  var have = ledeWords(lede).map(function(w) {
    return w.slice(0, 5);
  });
  if (want.length && !want.some(function(w) {
    return have.indexOf(w.slice(0, 5)) >= 0;
  })) out.push("lede does not name the subject: the first paragraph must say what " + String(subject).slice(0, 80) + " is and where it comes from");
  return out;
}
__name(ledeProblems, "ledeProblems");
var LEDE_SPLIT_WORDS = 100;
function splitLongLede(piece) {
  var lede = String(piece && piece.lede || "").trim();
  var count = /* @__PURE__ */ __name(function(s) {
    return String(s).split(/\s+/).filter(Boolean).length;
  }, "count");
  if (!lede || count(lede) <= LEDE_MAX_WORDS) return piece;
  var raw = lede.match(/[\s\S]*?[.!?]+["')\]’”]*(?=\s|$)\s*|[\s\S]+$/g) || [lede], sents = [];
  raw.forEach(function(x) {
    if (sents.length && SENT_ABBREV_RE.test(sents[sents.length - 1])) sents[sents.length - 1] += x;
    else sents.push(x);
  });
  var kept = [], n = 0, i = 0;
  for (; i < sents.length; i++) {
    var w = count(sents[i]);
    if (kept.length && n + w > LEDE_SPLIT_WORDS) break;
    kept.push(sents[i]);
    n += w;
  }
  if (i >= sents.length) return piece;
  var head = kept.join("").trim(), rest = sents.slice(i).join("").trim();
  var body = String(piece.body_md || "");
  if (body.indexOf(lede) !== -1) return Object.assign({}, piece, { lede: head });
  return Object.assign({}, piece, { lede: head, body_md: rest + "\n\n" + body });
}
__name(splitLongLede, "splitLongLede");
function pieceWords(piece) {
  var body = stripAnalysisMark(piece && piece.body_md), lede = stripAnalysisMark(piece && piece.lede);
  var wc = wordCount(body);
  return lede && body.indexOf(lede) === -1 ? wc + wordCount(lede) : wc;
}
__name(pieceWords, "pieceWords");
function validatePiece(piece, form, ground, opts) {
  var o = opts || {};
  var problems = [];
  if (!piece || !piece.body_md) return { ok: false, problems: ["no body"] };
  var md = String(piece.body_md);
  var wc = pieceWords(piece);
  if (form === "essay" && (wc < floorFor("essay", o.floorShare) || wc > 3200)) problems.push("essay length " + wc);
  if (form === "serial" && (wc < floorFor("serial", o.floorShare) || wc > 2800)) problems.push("serial length " + wc);
  if (form === "notes") {
    var items = countHeadings(md, 2);
    if (items < 3) problems.push("notes items " + items);
    if (wc < floorFor("notes", o.floorShare) || wc > 3200) problems.push("notes length " + wc);
  }
  if (o.subject && form !== "serial") ledeProblems(piece, o.subject).forEach(function(p) {
    problems.push(p);
  });
  var hits = bannedHits(md + " " + String(piece.title || "") + " " + String(piece.lede || ""));
  if (hits.length) problems.push("banned: " + hits.join(", "));
  if (hasEmoji(md)) problems.push("emoji present");
  if (!piece.title || String(piece.title).length < 4) problems.push("no title");
  if (form !== "notes" && wc >= 700 && (!piece.objection || String(piece.objection).length < 40)) problems.push("objection too thin");
  if (ground !== void 0 && ground !== null) {
    var gp = groundingProblems(pieceText(piece), ground, {});
    for (var gi = 0; gi < gp.length; gi++) problems.push("grounding: " + gp[gi]);
  }
  return { ok: problems.length === 0, problems, words: wc };
}
__name(validatePiece, "validatePiece");
__name2(validatePiece, "validatePiece");
__name22(validatePiece, "validatePiece");
__name222(validatePiece, "validatePiece");
var GROUNDING_PREFIX = "grounding:";
var SENT_ABBREV_RE = /(?:^|[\s(])(?:(?:[A-Z]\.)+[A-Z]|[A-Z]|Dr|Mr|Mrs|Ms|Prof|St|No|vs|v|cf|Fig|Eq|et al|e\.g|i\.e|pp?|Jr|Sr|Gen|Gov|Sen|Rep|Lt|Col|Capt|Sgt|Hon|Stat|Ct|Mt|Ft)\.\s*$/;
function deleteSentences(piece, cutFn) {
  var fields = { lede: String(piece && piece.lede || ""), body_md: String(piece && piece.body_md || "") }, units = [], layout = {};
  Object.keys(fields).forEach(function(f) {
    layout[f] = fields[f].split("\n").map(function(line) {
      if (!line.trim() || /^\s*#/.test(line)) return { fixed: line };
      var raw = line.match(/[\s\S]*?[.!?]+["')\]\u2019\u201d]*(?=\s|$)\s*|[\s\S]+$/g) || [line];
      var parts = [];
      raw.forEach(function(x) {
        if (parts.length && SENT_ABBREV_RE.test(parts[parts.length - 1])) parts[parts.length - 1] += x;
        else parts.push(x);
      });
      return { parts: parts.map(function(sn) {
        var u = { sn, field: f, cut: false, blank: !sn.trim() };
        if (!u.blank) units.push(u);
        return u;
      }) };
    });
  });
  cutFn(units);
  var removed = units.filter(function(u) {
    return u.cut;
  }).map(function(u) {
    return u.sn.replace(/\s+/g, " ").trim();
  });
  var rebuilt = {};
  Object.keys(layout).forEach(function(f) {
    rebuilt[f] = layout[f].map(function(l) {
      if (l.fixed !== void 0) return l.fixed;
      var out = l.parts.filter(function(u) {
        return !u.cut;
      }).map(function(u) {
        return u.sn;
      }).join("");
      return out.trim() ? out.replace(/\s+$/, "") : null;
    }).filter(function(l) {
      return l !== null;
    }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  });
  return { piece: Object.assign({}, piece, rebuilt), removed, total: units.length };
}
__name(deleteSentences, "deleteSentences");
function repairGroundingDraft(piece, problems, form, ground, opts) {
  var list = Array.isArray(problems) ? problems : [];
  if (!list.length || !piece) return null;
  var grounding = [], phrases = [], other = [], symbols = false;
  list.forEach(function(p) {
    var s = String(p).replace(/^[\s-]+/, ""), low = s.toLowerCase();
    if (low.indexOf(GROUNDING_PREFIX) === 0) grounding.push(s);
    else if (low === "emoji present") symbols = true;
    else if (low.indexOf("banned: ") === 0) low.slice(8).split(/,\s*/).forEach(function(b) {
      if (b.trim()) phrases.push(b.trim());
    });
    else if (/^(essay|serial|notes) length \d+$/.test(low)) {
    } else other.push(s);
  });
  if (other.length || !grounding.length && !phrases.length && !symbols) return null;
  var titleLow = String(piece.title || "").toLowerCase();
  if (phrases.some(function(b) {
    return titleLow.indexOf(b) !== -1;
  })) return null;
  var norm = /* @__PURE__ */ __name(function(s) {
    return String(s || "").toLowerCase().replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[\u2018\u2019]/g, "'");
  }, "norm");
  var gNeedles = groundingNeedles(grounding).map(norm).filter(function(n) {
    return n.trim().length > 0;
  });
  if (grounding.length && !gNeedles.length) return null;
  var needles = gNeedles.concat(phrases.map(norm));
  var d = deleteSentences(piece, function(units) {
    units.forEach(function(u) {
      var low = norm(u.sn);
      if (needles.some(function(n) {
        return low.indexOf(n) !== -1;
      }) || symbols && hasEmoji(String(u.sn))) u.cut = true;
    });
  });
  var removed = d.removed.length;
  if (removed === 0) return null;
  if (removed * 4 > d.total) return null;
  var v2 = validatePiece(d.piece, form, ground, Object.assign({}, opts || {}, { floorShare: REPAIR_FLOOR_SHARE }));
  if (!v2.ok) {
    var shortOnly = v2.problems.length === 1 && /^(essay|serial|notes) length \d+$/.test(v2.problems[0]) && v2.words < floorFor(form, REPAIR_FLOOR_SHARE);
    return shortOnly ? { ok: false, piece: d.piece, removed, total: d.total, v: v2 } : null;
  }
  return { ok: true, piece: d.piece, removed, total: d.total, v: v2 };
}
__name(repairGroundingDraft, "repairGroundingDraft");
var FUZZY_MIN_SHARED = 4;
var FUZZY_MIN_SHARE = 0.6;
function normForMatch(t) {
  return String(t || "").toLowerCase().replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d"*_]/g, "").replace(/[^a-z0-9' -]+/g, " ").replace(/\s+/g, " ").trim();
}
__name(normForMatch, "normForMatch");
function contentWords(t) {
  return normForMatch(t).split(" ").filter(function(w) {
    return w.length >= 4 && !/^(that|this|with|from|have|were|their|there|which|when|what|into|than|then|they|them|been|also|only|more|most|such|does|each|over|will|would|could|should|about|after|before|because|while|where)$/.test(w);
  });
}
__name(contentWords, "contentWords");
var CRITIC_PRUNE_ROUNDS = 3;
function critiqueWorst(q, form) {
  var dims = form === "notes" ? ["specificity", "argument", "voice", "systems"] : ["specificity", "argument", "objection", "voice", "systems"];
  var worst = 10, worstName = "", missing = false;
  for (var d = 0; d < dims.length; d++) {
    var val = Number(q && q[dims[d]]);
    if (!Number.isFinite(val)) {
      missing = true;
      val = 0;
    }
    if (val < worst) {
      worst = val;
      worstName = dims[d];
    }
  }
  var groundScore = Number(q && q.grounding);
  if (Number.isFinite(groundScore) && groundScore < ACCEPT_FLOOR_NOTES && worst >= ACCEPT_FLOOR_NOTES) {
    worst = groundScore;
    worstName = "grounding";
  }
  return { worst, worstName, missing };
}
__name(critiqueWorst, "critiqueWorst");
function criticQuotes(why, text, invented) {
  var out = [], t = normForMatch(text), re = /["\u201c\u2018']([^"\u201c\u201d\u2018\u2019\n]{8,240}?)["\u201d\u2019'](?![a-z])/g, m;
  var take = /* @__PURE__ */ __name(function(raw) {
    var qq = String(raw || "").replace(/^["\u201c\u2018'\s]+|["\u201d\u2019'\s.]+$/g, "").trim(), n = normForMatch(qq);
    if (n.split(" ").filter(Boolean).length >= 3 && t.indexOf(n) >= 0 && out.indexOf(qq) < 0) out.push(qq);
  }, "take");
  (Array.isArray(invented) ? invented : []).slice(0, CRITIC_INVENTED_MAX).forEach(function(x) {
    if (typeof x === "string") take(x.slice(0, 300));
  });
  while ((m = re.exec(String(why || ""))) && out.length < CRITIC_INVENTED_MAX) take(m[1]);
  return out.slice(0, CRITIC_INVENTED_MAX);
}
__name(criticQuotes, "criticQuotes");
var CRITIC_INVENTED_MAX = 16;
function quotesAllInAnalysis(piece, quotes) {
  var t = splitText(piece), m = ANALYSIS_MARK_RE.exec(t);
  if (!m || !quotes || !quotes.length) return false;
  var before = normForMatch(t.slice(0, m.index)), after = normForMatch(t.slice(m.index + m[0].length));
  return quotes.every(function(x) {
    var n = normForMatch(x);
    return n && after.indexOf(n) >= 0 && before.indexOf(n) < 0;
  });
}
__name(quotesAllInAnalysis, "quotesAllInAnalysis");
function qualityWorst(q, form) {
  var dims = form === "notes" ? ["specificity", "argument", "voice", "systems"] : ["specificity", "argument", "objection", "voice", "systems"];
  var worst = 10, worstName = "", missing = false;
  for (var d = 0; d < dims.length; d++) {
    var val = Number(q && q[dims[d]]);
    if (!Number.isFinite(val)) {
      missing = true;
      val = 0;
    }
    if (val < worst) {
      worst = val;
      worstName = dims[d];
    }
  }
  return { worst, worstName, missing };
}
__name(qualityWorst, "qualityWorst");
function gateWorst(q, form, groundingGates) {
  return groundingGates ? critiqueWorst(q, form) : qualityWorst(q, form);
}
__name(gateWorst, "gateWorst");
async function criticGroundingGates(env) {
  try {
    var r = await env.AUDIT.prepare("SELECT value FROM ops_config WHERE key = 'companion_critic_grounding_gate'").first();
    return /^(on|1|true|yes)$/i.test(String(r && r.value || "").trim());
  } catch (e) {
    logCaught("criticGroundingGates", e);
    return false;
  }
}
__name(criticGroundingGates, "criticGroundingGates");
var SOURCED_COVER = 0.8;
var NEGATION_RE = /\b(?:not|never|no|none|nor|without|neither|cannot)\b|n't\b/i;
function sourceSentences(ground) {
  return String(ground || "").replace(/\\n/g, " ").split(/(?<=[.!?]["')\]\u201d\u2019]*)\s+/).map(function(x) {
    return x.trim();
  }).filter(function(x) {
    return x.length >= 20;
  });
}
__name(sourceSentences, "sourceSentences");
function sourcedPassage(sents, quote) {
  var qw = contentWords(quote);
  if (qw.length < 3) return null;
  var nums = String(quote).match(/\d[\d,.]*\d|\d/g) || [], neg = NEGATION_RE.test(quote);
  var covered = /* @__PURE__ */ __name(function(win2) {
    var ws = contentWords(win2), hit = 0;
    qw.forEach(function(w) {
      if (ws.some(function(x) {
        return x === w || w.length >= 4 && x.length >= 4 && (x.indexOf(w) === 0 || w.indexOf(x) === 0);
      })) hit++;
    });
    return hit / qw.length;
  }, "covered");
  for (var span = 1; span <= 2; span++) {
    for (var i = 0; i + span <= sents.length; i++) {
      var win = sents.slice(i, i + span).join(" ");
      if (covered(win) < SOURCED_COVER) continue;
      if (!nums.every(function(n) {
        return win.indexOf(n) >= 0;
      })) continue;
      if (NEGATION_RE.test(win) !== neg) continue;
      return win.slice(0, 400);
    }
  }
  return null;
}
__name(sourcedPassage, "sourcedPassage");
function quotesAllSourced(ground, quotes) {
  if (!quotes || !quotes.length) return null;
  var sents = sourceSentences(ground), out = [];
  for (var i = 0; i < quotes.length; i++) {
    var src = sourcedPassage(sents, quotes[i]);
    if (!src) return null;
    out.push({ quote: quotes[i], source: src });
  }
  return out;
}
__name(quotesAllSourced, "quotesAllSourced");
function sourcedRereadNote(pairs) {
  return "RUBRIC CHECK: your previous reading scored grounding 0 and named these passages as invented, but the source material states each of them: " + pairs.map(function(p) {
    return '"' + String(p.quote).slice(0, 200) + '" (source: "' + String(p.source).slice(0, 300) + '")';
  }).join("; ") + ". A passage the source material states is grounded even when its wording differs; compare each with its source sentence, including names, figures and negation. Read the piece again and score every dimension; list under invented only claims the source material does not state.";
}
__name(sourcedRereadNote, "sourcedRereadNote");
function rubricNoQuoteNote() {
  return "RUBRIC CHECK: your previous reading scored grounding 0 but quoted no passage of the piece as invented. Grounding counts only a claim the piece makes that the source material does not support; a source detail the piece leaves out is not a grounding failure. Read the piece again: list under invented each claim you judge unsupported as an exact quotation copied from the piece, and score grounding 0 only if you can quote one.";
}
__name(rubricNoQuoteNote, "rubricNoQuoteNote");
function rubricRereadNote(quotes) {
  return "RUBRIC CHECK: your previous reading scored grounding 0 for these passages, and every one of them is after the <!-- analysis --> line: " + quotes.map(function(x) {
    return '"' + String(x).slice(0, 200) + '"';
  }).join("; ") + ". Your rubric for that section: count under grounding only a concrete invented fact (a name, date, number, event, rule, quotation or study the source material does not contain); claims about incentives, constraints, motives, mechanisms and consequences are judged under argument and systems, never grounding. Read the piece again and score every dimension under that rule; list under invented only concrete invented facts.";
}
__name(rubricRereadNote, "rubricRereadNote");
function todayLine(now) {
  return "TODAY: " + new Date(now || Date.now()).toISOString().slice(0, 10) + ". The source material can report events up to today; a date or result is not invented because it is recent or later than you know of. Judge it only against the source material.";
}
__name(todayLine, "todayLine");
var REFRAME_BAND = [0.85, 1.15];
var REFRAME_TIMEOUT_MS = 12e4;
var REFRAME_START_BEFORE_MS = 54e4;
var P_REFRAME = L(
  "You are a copy editor. A reader rejected the DRAFT below because some of its sentences present as fact what the SOURCE MATERIAL does not say. Return the whole draft, edited, as plain markdown in the same layout: the first line is # and the title, then the lede paragraph with no heading, then the body with its ## headings in the same order. If the draft has a line that contains exactly <!-- analysis -->, keep that line where it is; if it has none, add none.",
  "Edit sentence by sentence:",
  "1. Change only the sentences listed under FLAGGED and the claims the READER'S OBJECTION describes. Every other sentence stays word for word.",
  "2. A changed sentence that states as fact a motive, intention, incentive, cause, effect, mechanism, strategy, feedback loop, pattern or likely behaviour that the SOURCE MATERIAL does not state is rewritten in place as an argument from a reported fact: name the fact it starts from and say what follows from it as reasoning ('Because ..., ... has a reason to ...', 'If ..., then ...', 'That would leave ... paying for ...', 'This suggests ...'). Vary the wording: never open two sentences the same way, and never put more than one hedge in a paragraph. Keep the substance and the force of the argument; a string of hedges is worse than the original.",
  "3. A sentence that reports an event, action, statement, payment, meeting, document, rule or arrangement that the SOURCE MATERIAL does not contain is deleted.",
  "4. Every sentence listed under FLAGGED, and every claim the READER'S OBJECTION describes, is fixed by rule 2 or rule 3.",
  "5. Add nothing: no name, date, number, quotation, event, example or source that is not already in the DRAFT and the SOURCE MATERIAL. Keep the title, every heading and the first sentence of the lede. Keep the length within a tenth of the draft's.",
  "Output only the edited draft: no commentary, no list of changes, no code fences."
);
function parseDraftMd(text, fallbackTitle) {
  var md = String(text || "").trim();
  if (md.indexOf("```") === 0) {
    var f = md.indexOf(NL);
    if (f > 0) md = md.slice(f + 1);
    var close = md.lastIndexOf("```");
    if (close > 0) md = md.slice(0, close);
    md = md.trim();
  }
  var title = "", lines = md.split(NL);
  if (lines.length && lines[0].trim().indexOf("# ") === 0) {
    title = lines[0].trim().slice(2).trim();
    md = lines.slice(1).join(NL).trim();
  }
  var ledeObj = extractLede(md);
  return { title: String(title || fallbackTitle || "").slice(0, 300), lede: ledeObj.lede, body_md: ledeObj.rest, objection: findObjection(md) };
}
__name(parseDraftMd, "parseDraftMd");
async function reframePiece(env, piece, ground, why, invented) {
  var lede = String(piece && piece.lede || "").trim(), body = String(piece && piece.body_md || "");
  var draft = "# " + String(piece && piece.title || "") + NL + NL + (lede && body.indexOf(lede) < 0 ? lede + NL + NL : "") + body;
  var flagged = criticQuotes(why, pieceText(piece), invented);
  var user = "SOURCE MATERIAL:" + NL + String(ground || "").slice(0, GROUND_MAX + 2e3) + NL + NL + "READER'S OBJECTION: " + String(why || "").slice(0, 1200) + NL + NL + "FLAGGED:" + NL + (flagged.length ? flagged.map(function(x) {
    return "- " + x;
  }).join(NL) : "(none quoted; fix what the objection describes)") + NL + NL + "DRAFT:" + NL + draft.slice(0, 3e4);
  var r = await callModel(env, [{ role: "system", content: P_REFRAME }, { role: "user", content: user }], GEN_MAX_TOKENS, REFRAME_TIMEOUT_MS, WRITER_MODEL, "editor");
  if (!r || !r.text) return { piece: null, why: "editor unavailable" + (r && r.error ? ": " + String(r.error).slice(0, 120) : "") };
  var p = parseDraftMd(r.text, piece.title);
  var out = { title: p.title || piece.title, subtitle: piece.subtitle || "", lede: p.lede, body_md: p.body_md, objection: p.objection || piece.objection };
  var w0 = pieceWords(piece), w1 = pieceWords(out);
  if (!w0 || w1 < w0 * REFRAME_BAND[0] || w1 > w0 * REFRAME_BAND[1]) return { piece: null, why: "edit length " + w1 + " of " + w0 + " words" };
  if (countHeadings(out.body_md, 2) !== countHeadings(body, 2)) return { piece: null, why: "edit changed the headings (" + countHeadings(out.body_md, 2) + " of " + countHeadings(body, 2) + ")" };
  var note = "";
  if (ANALYSIS_MARK_RE.test(draft) && !ANALYSIS_MARK_RE.test(splitText(out))) {
    out = withAutoMark(out);
    if (!analysisSplitOk(splitText(out))) return { piece: null, why: "edit dropped the analysis line and no paragraph holds the rails" };
    note = ", analysis line placed again";
  }
  if (ANALYSIS_MARK_RE.test(draft) !== ANALYSIS_MARK_RE.test(splitText(out))) return { piece: null, why: ANALYSIS_MARK_RE.test(draft) ? "edit dropped the analysis line" : "edit added an analysis line" };
  return { piece: out, model: r.model, why: w0 + " -> " + w1 + " words, " + flagged.length + " flagged" + note };
}
__name(reframePiece, "reframePiece");
function pruneHeadings(piece, needles) {
  var removed = [];
  var body = String(piece && piece.body_md || "").split("\n").filter(function(line) {
    var h = line.match(/^\s*#{2,6}\s+(.+?)\s*#*\s*$/);
    if (!h) return true;
    var nh = normForMatch(h[1]).slice(0, 90);
    if (nh.length < 12) return true;
    var n = needles.filter(function(x) {
      return !x.hit && (x.nd === nh || nh.indexOf(x.nd) === 0 || x.nd.indexOf(nh) === 0);
    })[0];
    if (!n) return true;
    n.hit = true;
    removed.push(line.trim());
    return false;
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return removed.length ? { piece: Object.assign({}, piece, { body_md: body }), removed } : { piece, removed: [] };
}
__name(pruneHeadings, "pruneHeadings");
function pruneUnsupported(piece, problems, opts) {
  var needles = [];
  (problems || []).forEach(function(pr) {
    var m = String(pr).match(/^unsupported claim:\s*([\s\S]*?)(?:\s+--\s+[\s\S]*)?$/);
    if (!m) return;
    var raw = m[1].replace(/^\s*(?:FACT|INFERENCE)\s*:\s*/i, ""), q = normForMatch(raw);
    if (q.length >= 18) needles.push({ nd: q.slice(0, 90), raw, hit: false });
  });
  if (!needles.length) return { piece, removed: [], total: 0 };
  if (opts && opts.headings) {
    var ph = pruneHeadings(piece, needles);
    if (ph.removed.length) {
      var rest = needles.filter(function(n) {
        return !n.hit;
      });
      var rs = rest.length ? pruneUnsupported(ph.piece, rest.map(function(n) {
        return "unsupported claim: " + n.raw;
      })) : { piece: ph.piece, removed: [], total: 0 };
      return { piece: rs.piece, removed: ph.removed.concat(rs.removed), total: rs.total, headings: ph.removed.length };
    }
  }
  return deleteSentences(piece, function(units) {
    units.forEach(function(x) {
      var ns = normForMatch(x.sn);
      needles.forEach(function(n) {
        var hit = ns.indexOf(n.nd.slice(0, Math.min(n.nd.length, 60))) >= 0 || ns.length >= 30 && n.nd.indexOf(ns.slice(0, Math.min(ns.length, 60))) >= 0;
        if (hit) {
          x.cut = true;
          n.hit = true;
        }
      });
    });
    needles.forEach(function(n) {
      if (n.hit) return;
      var want = contentWords(n.raw);
      if (want.length < FUZZY_MIN_SHARED) return;
      var best = null, bestShared = 0;
      units.forEach(function(x) {
        if (x.cut) return;
        var have = contentWords(x.sn), shared = want.filter(function(w) {
          return have.indexOf(w) >= 0;
        }).length;
        if (shared > bestShared) {
          bestShared = shared;
          best = x;
        }
      });
      if (best && bestShared >= FUZZY_MIN_SHARED && bestShared / want.length >= FUZZY_MIN_SHARE) {
        best.cut = true;
        n.hit = true;
      }
    });
  });
}
__name(pruneUnsupported, "pruneUnsupported");
__name2(repairGroundingDraft, "repairGroundingDraft");
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
    logCaught("similarExists", e);
  }
  return null;
}
__name(similarExists, "similarExists");
__name2(similarExists, "similarExists");
__name22(similarExists, "similarExists");
__name222(similarExists, "similarExists");
async function emitReadingSignal(env, piece, form, slug) {
  try {
    if (!env.AUDIT) return;
    var body = String(piece.body_md || "");
    var paras = body.split("\n").map(function(l) {
      return l.trim();
    }).filter(function(l) {
      return l.length > 80;
    });
    var openQ = paras.length ? paras[paras.length - 1].slice(0, 400) : "";
    await env.AUDIT.prepare(
      "INSERT OR IGNORE INTO signals (id, ts, source, source_ref, content, open_questions, evidential_weight, domain, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
    ).bind(
      "reading:" + slug,
      nowIso(),
      "reading",
      "https://reading.q08.org/p/" + slug,
      String(piece.title || "").slice(0, 300),
      JSON.stringify([openQ]),
      0.55,
      "fleet",
      "open",
      nowIso()
    ).run();
  } catch (e) {
    logCaught("emitReadingSignal", e);
  }
}
__name(emitReadingSignal, "emitReadingSignal");
__name2(emitReadingSignal, "emitReadingSignal");
async function persistPiece(env, piece, form, topic, model, quality, words, ground) {
  piece = stripPieceMark(piece);
  var day = amsDayKey(/* @__PURE__ */ new Date());
  var salt = String(Date.now()) + topic.id + form;
  var slug = day + "-" + form + "-" + await sha16(salt);
  var anchorJson = JSON.stringify({ topic: topic.id, seam: [topic.a, topic.b].filter(Boolean), refs: (topic.anchors || []).map(function(a) {
    return a.ref;
  }) });
  await env.PERSONAL.prepare(
    "INSERT OR IGNORE INTO companion_pieces(slug, form, title, subtitle, lede, body_md, anchor_json, quality_json, word_count, day, created_at, ground_text) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(slug, form, String(piece.title).slice(0, 300), String(piece.subtitle || "").slice(0, 300), String(piece.lede || "").slice(0, 2e3), String(piece.body_md), anchorJson, JSON.stringify(quality || {}), words, day, nowIso(), String(ground || "")).run();
  emitReadingSignal(env, piece, form, slug).catch(function(eLog) {
    logCaught("persistPiece", eLog);
  });
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
    logCaught("persistPiece", e);
  }
  try {
    await env.MEDIA.put("companion/" + day + "/" + slug + ".md", String(piece.body_md), {
      httpMetadata: { contentType: "text/markdown; charset=utf-8" }
    });
  } catch (e) {
    logCaught("persistPiece", e);
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
__name2(persistPiece, "persistPiece");
__name22(persistPiece, "persistPiece");
__name222(persistPiece, "persistPiece");
async function logRun(env, form, model, topic, status, detail, ms) {
  try {
    await env.PERSONAL.prepare(
      "INSERT INTO companion_runs(run_at, form, model, topic, status, detail, ms) VALUES(?,?,?,?,?,?,?)"
    ).bind(nowIso(), form, String(model || ""), String(topic || ""), status, String(detail || "").slice(0, 1200), ms).run();
  } catch (e) {
    logCaught("logRun", e);
  }
}
__name(logRun, "logRun");
__name2(logRun, "logRun");
__name22(logRun, "logRun");
__name222(logRun, "logRun");
async function sendMail(env, piece, slug, day) {
  if (!await pieceVerified(env, slug)) return { ok: false, error: "piece not verified, nothing mailed (fail closed)" };
  var subject = piece.title + " (" + formLabel(piece.form || "essay") + ")";
  var body = (/^\s*#/.test(String(piece.body_md || "")) ? "" : piece.lede ? piece.lede + NL + NL : "") + String(piece.body_md).slice(0, 2e4) + NL + NL + "Read online: " + String(piece.link || "");
  return await sendOwnerNotice(env, subject, body);
}
__name(sendMail, "sendMail");
__name2(sendMail, "sendMail");
__name22(sendMail, "sendMail");
__name222(sendMail, "sendMail");
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
__name2(mailOut, "mailOut");
__name22(mailOut, "mailOut");
__name222(mailOut, "mailOut");
async function sendOne(env, to, subject, body, pre) {
  if (pre && pre.checked) {
    if (pre.set.has(String(to).toLowerCase())) return { ok: false, suppressed: true, to };
  } else try {
    if (env.AUDIT) {
      const _s = await env.AUDIT.prepare("SELECT 1 FROM email_suppression WHERE lower(email)=?1").bind(String(to).toLowerCase()).first();
      if (_s) return { ok: false, suppressed: true, to };
      const _l = await env.AUDIT.prepare("SELECT suppress FROM contact_ledger WHERE lower(email)=?1").bind(String(to).toLowerCase()).first();
      if (_l && _l.suppress) return { ok: false, suppressed: true, to };
    }
  } catch (e) {
    logCaught("sendOne", e);
  }
  if (env.SEND_EMAIL) {
    try {
      await env.SEND_EMAIL.send({ to, from: "rowan.quni@qnfo.org", subject, text: body });
      return { ok: true, via: "send_email" };
    } catch (e) {
      return { ok: false, error: "send_email: " + String(e && e.message || e) };
    }
  }
  if (!env.EMAIL) return { ok: false, error: "no email path" };
  try {
    var resp = await env.EMAIL.fetch("https://email.internal/send", {
      method: "POST",
      // EMAIL-CALLER-PROPS-1 (#1923): qnfo-email 2.5.1+ authenticates this binding by its props (wrangler.toml); no key copy.
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, from: "rowan.quni@qnfo.org", subject, body })
    });
    return { ok: resp.ok, status: resp.status };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(sendOne, "sendOne");
__name2(sendOne, "sendOne");
__name22(sendOne, "sendOne");
__name222(sendOne, "sendOne");
function subBase(env, origin) {
  return origin || "https://reading.q08.org";
}
__name(subBase, "subBase");
__name2(subBase, "subBase");
__name22(subBase, "subBase");
__name222(subBase, "subBase");
function escXml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(escXml, "escXml");
__name2(escXml, "escXml");
__name22(escXml, "escXml");
__name222(escXml, "escXml");
function toRfc822(d) {
  try {
    return new Date(d).toUTCString();
  } catch (e) {
    return (/* @__PURE__ */ new Date()).toUTCString();
  }
}
__name(toRfc822, "toRfc822");
__name2(toRfc822, "toRfc822");
__name22(toRfc822, "toRfc822");
__name222(toRfc822, "toRfc822");
function subscribePage(msg) {
  var Q = String.fromCharCode(34);
  return "<div class=sub>" + (msg ? "<p>" + escHtml(msg) + "</p>" : "") + "<form method=post action=/subscribe><input type=email name=email placeholder=" + Q + "you@example.com" + Q + " required><button type=submit>Subscribe</button></form><p class=mut>One email per new piece. Unsubscribe anytime.</p></div>";
}
__name(subscribePage, "subscribePage");
__name2(subscribePage, "subscribePage");
__name22(subscribePage, "subscribePage");
__name222(subscribePage, "subscribePage");
async function handleSubscribe(request, env, u, p) {
  try {
    await ensureSchema(env);
  } catch (e) {
    logCaught("handleSubscribe", e);
  }
  if (p === "/confirm") {
    var t0 = u.searchParams.get("t") || "";
    await env.PERSONAL.prepare("UPDATE companion_subscribers SET status = 'confirmed', confirmed_at = ? WHERE token = ? AND status != 'unsubscribed'").bind(nowIso(), t0).run();
    return html(page2("Confirmed", shell(subscribePage("You are subscribed. Thank you."))));
  }
  if (p === "/unsubscribe") {
    var t1 = u.searchParams.get("t") || "";
    await env.PERSONAL.prepare("UPDATE companion_subscribers SET status = 'unsubscribed' WHERE token = ?").bind(t1).run();
    return html(page2("Unsubscribed", shell(subscribePage("You have been unsubscribed."))));
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
    logCaught("handleSubscribe", e);
  }
  email = String(email || u.searchParams.get("email") || "").trim().toLowerCase();
  if (!email) {
    return html(page2("Subscribe", shell("<h2>Subscribe</h2>" + subscribePage(""))));
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return html(page2("Subscribe", shell("<h2>Subscribe</h2>" + subscribePage("Enter a valid email address."))), 400);
  }
  var token2 = await sha16(email + ":" + (env.COMPANION_KEY || "pc") + ":sub");
  await env.PERSONAL.prepare("INSERT INTO companion_subscribers(email, status, token, created_at) VALUES(?, 'pending', ?, ?) ON CONFLICT(email) DO UPDATE SET token = excluded.token, status = CASE WHEN status = 'confirmed' THEN 'confirmed' ELSE 'pending' END").bind(email, token2, nowIso()).run();
  var link = subBase(env, u.origin) + "/confirm?t=" + token2;
  await sendOne(env, email, "Confirm your subscription", "Tap to confirm: " + link);
  return html(page2("Subscribe", shell("<h2>Almost there</h2>" + subscribePage("Check your inbox for a confirmation link."))));
}
__name(handleSubscribe, "handleSubscribe");
__name2(handleSubscribe, "handleSubscribe");
__name22(handleSubscribe, "handleSubscribe");
__name222(handleSubscribe, "handleSubscribe");
async function feedXml(env, u) {
  try {
    await ensureSchema(env);
  } catch (e) {
    logCaught("feedXml", e);
  }
  var q = await env.PERSONAL.prepare("SELECT slug, title, lede, day, created_at FROM companion_pieces WHERE " + VISIBLE_SQL + " ORDER BY id DESC LIMIT 30").all();
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
__name2(feedXml, "feedXml");
__name22(feedXml, "feedXml");
__name222(feedXml, "feedXml");
var SEND_CAP_PER_RUN = 250;
var SUPP_CHUNK = 50;
async function suppressedSet(env, emails) {
  var set = /* @__PURE__ */ new Set();
  if (!env.AUDIT) return set;
  var list = emails.map(function(e) {
    return String(e).toLowerCase();
  });
  for (var i = 0; i < list.length; i += SUPP_CHUNK) {
    var chunk = list.slice(i, i + SUPP_CHUNK), ph = chunk.map(function() {
      return "?";
    }).join(",");
    var s1 = env.AUDIT.prepare("SELECT lower(email) AS e FROM email_suppression WHERE lower(email) IN (" + ph + ")");
    var r1 = await s1.bind.apply(s1, chunk).all();
    var s2 = env.AUDIT.prepare("SELECT lower(email) AS e FROM contact_ledger WHERE suppress AND lower(email) IN (" + ph + ")");
    var r2 = await s2.bind.apply(s2, chunk).all();
    (r1 && r1.results || []).concat(r2 && r2.results || []).forEach(function(r) {
      set.add(String(r.e));
    });
  }
  return set;
}
__name(suppressedSet, "suppressedSet");
async function ensureSendRuns(env) {
  await env.PERSONAL.prepare("CREATE TABLE IF NOT EXISTS companion_broadcasts (key TEXT PRIMARY KEY, last_id INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, suppressed INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0, origin TEXT, started_at TEXT, updated_at TEXT)").run();
}
__name(ensureSendRuns, "ensureSendRuns");
async function sendRunState(env, key, origin) {
  await ensureSendRuns(env);
  await env.PERSONAL.prepare("INSERT OR IGNORE INTO companion_broadcasts (key, origin, started_at, updated_at) VALUES (?1, ?2, ?3, ?3)").bind(key, origin || null, nowIso()).run();
  return await env.PERSONAL.prepare("SELECT * FROM companion_broadcasts WHERE key = ?1").bind(key).first();
}
__name(sendRunState, "sendRunState");
async function sendRun(env, key, origin, mailFor) {
  var st = await sendRunState(env, key, origin);
  if (st && st.done) return { ok: true, key, done: true, already: true, sent: 0, failed: 0, suppressed: 0 };
  var last = st ? Number(st.last_id) || 0 : 0;
  var q = await env.PERSONAL.prepare("SELECT id, email, token FROM companion_subscribers WHERE status = 'confirmed' AND id > ?1 ORDER BY id LIMIT " + SEND_CAP_PER_RUN).bind(last).all();
  var rows = q && q.results || [];
  var supp;
  try {
    supp = await suppressedSet(env, rows.map(function(r) {
      return r.email;
    }));
  } catch (e) {
    return { ok: false, key, error: "opt-out lists unreadable, nothing sent (fail closed): " + String(e && e.message || e).slice(0, 120), resume: true };
  }
  var sent = 0, failed = 0, suppressed = 0;
  for (var i = 0; i < rows.length; i++) {
    var m = mailFor(rows[i]);
    var rr = await sendOne(env, rows[i].email, m.subject, m.body, { checked: true, set: supp });
    if (rr && rr.ok) sent++;
    else if (rr && rr.suppressed) suppressed++;
    else failed++;
    last = rows[i].id;
  }
  var done = rows.length < SEND_CAP_PER_RUN ? 1 : 0;
  await env.PERSONAL.prepare("UPDATE companion_broadcasts SET last_id = ?1, sent = sent + ?2, failed = failed + ?3, suppressed = suppressed + ?4, done = ?5, updated_at = ?6 WHERE key = ?7").bind(last, sent, failed, suppressed, done, nowIso(), key).run();
  return { ok: true, key, sent, failed, suppressed, batch: rows.length, done: !!done, resume: !done };
}
__name(sendRun, "sendRun");
function digestMail(day, list, base) {
  return function(s) {
    return { subject: "Reading \u2014 daily digest", body: "Reading \u2014 daily digest (" + day + ")" + NL + NL + list + NL + NL + "Unsubscribe: " + base + "/unsubscribe?t=" + s.token };
  };
}
__name(digestMail, "digestMail");
async function digestList(env, day, base) {
  var pr = await env.PERSONAL.prepare("SELECT slug, title, form FROM companion_pieces WHERE day = ? AND " + VISIBLE_SQL + " ORDER BY id ASC").bind(day).all();
  var rows = pr.results || [];
  return { n: rows.length, list: rows.map(function(r) {
    return "- " + r.title + " \u2014 " + base + "/p/" + r.slug;
  }).join(NL) };
}
__name(digestList, "digestList");
function pieceMail(prow, base, link) {
  return function(s) {
    return { subject: prow.title, body: (/^\s*#/.test(String(prow.body_md || "")) ? "" : prow.lede ? prow.lede + NL + NL : "") + String(prow.body_md).slice(0, 2e4) + NL + NL + "Read online: " + link + NL + NL + "Unsubscribe: " + base + "/unsubscribe?t=" + s.token };
  };
}
__name(pieceMail, "pieceMail");
async function resumeSendRuns(env) {
  await ensureSendRuns(env);
  var t = await env.PERSONAL.prepare("SELECT key, origin FROM companion_broadcasts WHERE done = 0 ORDER BY started_at LIMIT 1").first();
  if (!t) return { ok: true, idle: true };
  var base = "https://reading.q08.org";
  if (String(t.key).indexOf("digest:") === 0) {
    var day = String(t.key).slice(7), dl = await digestList(env, day, base);
    return await sendRun(env, t.key, null, digestMail(day, dl.list, base));
  }
  var pr = await env.PERSONAL.prepare("SELECT * FROM companion_pieces WHERE slug = ?").bind(t.key).all();
  var prow = (pr.results || [])[0];
  if (!prow) {
    await env.PERSONAL.prepare("UPDATE companion_broadcasts SET done = 1, updated_at = ?1 WHERE key = ?2").bind(nowIso(), t.key).run();
    return { ok: false, key: t.key, error: "piece gone; run closed" };
  }
  if (!await pieceVerified(env, t.key)) {
    await env.PERSONAL.prepare("UPDATE companion_broadcasts SET done = 1, updated_at = ?1 WHERE key = ?2").bind(nowIso(), t.key).run();
    return { ok: false, key: t.key, error: "piece not verified or retracted; run closed (fail closed)" };
  }
  var b2 = subBase(env, t.origin);
  return await sendRun(env, t.key, t.origin, pieceMail(prow, b2, b2 + "/p/" + t.key));
}
__name(resumeSendRuns, "resumeSendRuns");
async function confirmedSubscribers(env) {
  var all = [], last = 0;
  for (var page3 = 0; page3 < 40; page3++) {
    var q = await env.PERSONAL.prepare("SELECT id, email, token FROM companion_subscribers WHERE status = 'confirmed' AND id > ?1 ORDER BY id LIMIT 500").bind(last).all();
    var rows = q && q.results || [];
    for (var i = 0; i < rows.length; i++) all.push(rows[i]);
    if (rows.length < 500) break;
    last = rows[rows.length - 1].id;
  }
  return all;
}
__name(confirmedSubscribers, "confirmedSubscribers");
async function broadcast(env, slug, origin) {
  if (!env.EMAIL) return { ok: false, error: "no email binding" };
  try {
    var pr = await env.PERSONAL.prepare("SELECT * FROM companion_pieces WHERE slug = ?").bind(slug).all();
    var prow = (pr.results || [])[0];
    if (!prow) return { ok: false, error: "no piece" };
    if (!await pieceVerified(env, slug)) return { ok: false, error: "piece not verified, nothing mailed (fail closed)" };
    var base = subBase(env, origin);
    return await sendRun(env, slug, base, pieceMail(prow, base, base + "/p/" + slug));
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(broadcast, "broadcast");
__name2(broadcast, "broadcast");
__name22(broadcast, "broadcast");
__name222(broadcast, "broadcast");
async function sendDigest(env) {
  if (!env.EMAIL) return { ok: false, error: "no email binding" };
  try {
    var day = amsDayKey(/* @__PURE__ */ new Date());
    var base = "https://reading.q08.org";
    var dl = await digestList(env, day, base);
    if (!dl.n) return { ok: true, skipped: "no pieces today", pieces: 0 };
    var out = await sendRun(env, "digest:" + day, null, digestMail(day, dl.list, base));
    out.pieces = dl.n;
    return out;
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(sendDigest, "sendDigest");
__name2(sendDigest, "sendDigest");
__name22(sendDigest, "sendDigest");
__name222(sendDigest, "sendDigest");
var REVIEW_MAX_TOKENS = 8e3;
var REVIEW_TIMEOUT_MS = 11e4;
var MODEL_FAMILY = {
  "@cf/nvidia/nemotron-3-120b-a12b": "nvidia",
  "@cf/openai/gpt-oss-120b": "openai",
  "@cf/moonshotai/kimi-k2.6": "moonshot",
  "@cf/deepseek-ai/deepseek-v4-pro-0813": "deepseek",
  "@cf/zai-org/glm-5.3": "zai",
  "deepseek-chat": "deepseek",
  "deepseek-reasoner": "deepseek"
};
var REVIEW_POOL = [
  "@cf/nvidia/nemotron-3-120b-a12b",
  "@cf/openai/gpt-oss-120b",
  "@cf/moonshotai/kimi-k2.6",
  "@cf/deepseek-ai/deepseek-v4-pro-0813",
  "@cf/zai-org/glm-5.3"
];
function familyOf(id) {
  return MODEL_FAMILY[id] || "unknown:" + String(id || "").split("/")[1];
}
__name(familyOf, "familyOf");
function seedOf(str2) {
  var h = 0, t = String(str2 || "");
  for (var i = 0; i < t.length; i++) h = h * 31 + t.charCodeAt(i) | 0;
  return Math.abs(h);
}
__name(seedOf, "seedOf");
function pickReviewers(exclude, k, seed) {
  var ex = {};
  (exclude || []).forEach(function(f2) {
    ex[f2] = 1;
  });
  var n = REVIEW_POOL.length, start = Math.abs(seed | 0) % n, out = [], seen = {};
  for (var i = 0; i < n && out.length < k; i++) {
    var id = REVIEW_POOL[(start + i) % n], f = familyOf(id);
    if (ex[f] || seen[f] || !modelAllowed(id)) continue;
    seen[f] = 1;
    out.push(id);
  }
  return out;
}
__name(pickReviewers, "pickReviewers");
var GROUND_LEAD = /* @__PURE__ */ new Set(["the", "a", "an", "in", "on", "at", "when", "if", "but", "and", "so", "as", "that", "this", "these", "those", "it", "its", "each", "every", "most", "some", "no", "for", "with", "without", "before", "after", "once", "while", "because", "since", "what", "where", "who", "why", "how", "then", "there", "here", "not", "only", "even", "still", "yet", "or", "nor", "by", "from", "to", "of", "their", "his", "her", "our", "your", "one", "two", "three", "such", "both", "many", "any", "all", "i", "we", "you", "he", "she", "they", "my", "whether", "although", "though", "until", "unless", "instead", "perhaps", "suppose", "imagine", "consider", "now", "today", "later", "earlier", "first", "second", "third", "finally", "meanwhile", "however", "which", "whose", "than", "also", "just", "every", "another", "other", "either", "neither", "same", "more", "less", "few", "several", "unlike", "like", "despite", "across", "through", "during", "under", "over", "between", "among", "within", "against", "beyond", "per", "via", "consequently", "therefore", "thus", "hence", "moreover", "furthermore", "similarly", "likewise", "otherwise", "accordingly", "additionally", "specifically", "ultimately", "eventually", "typically", "usually", "often", "sometimes", "rather", "indeed", "western", "eastern", "northern", "southern", "central"]);
var GROUND_OK = /* @__PURE__ */ new Set([
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "arxiv",
  "wikipedia",
  "markdown",
  "json",
  "html",
  "gpu",
  "cpu",
  "vpn",
  "api",
  "ai",
  "llm",
  "sdk",
  "ceo",
  "cto",
  "url",
  "dns",
  "pdf",
  "csv",
  "sql",
  "usb",
  "ram",
  "ssd",
  "gps",
  "ui",
  "ux",
  "os",
  // GROUND-DESCRIPTOR-1: title and street abbreviations are words, not names ("St.", "Mt.", "Dr." were rejected as names not in the source)
  "st",
  "mt",
  "dr",
  "mr",
  "mrs",
  "ms",
  "prof",
  "jr",
  "sr",
  "vol",
  "no",
  "ft",
  "ave",
  "rd",
  "blvd",
  "inc",
  "ltd",
  "co",
  "fig",
  "vs",
  "etc",
  "al"
]);
var GROUND_DESCRIPTOR_RE = /^(?:[a-z]{3,}(?:an|ian|ern|ese|ic|ist)|[a-z]{2,}ish|[a-z]{4,}al)$/;
function stemGrounded(w, words) {
  var stems = [], m = /^([a-z]{4,}?)(?:ians?|ans?|ern|ese|ish|ists?|ic|al|ed|ing|es|s)$/.exec(w);
  if (m) stems.push(m[1]);
  for (var i = 0; i < stems.length; i++) {
    var s = stems[i];
    if (words.has(s) || words.has(s + "e") || words.has(s + "a") || words.has(s + "y") || words.has(s + "ia") || words.has(s + "es")) return true;
  }
  return false;
}
__name(stemGrounded, "stemGrounded");
function groundWords(text) {
  var set = /* @__PURE__ */ new Set();
  String(text || "").normalize("NFC").toLowerCase().replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[‘’]/g, "'").replace(/[\p{L}\p{N}][\p{L}\p{N}'.-]*/gu, function(w) {
    w = w.replace(/[.'-]+$/, "");
    set.add(w);
    if (foldAccents(w) !== w) set.add(foldAccents(w));
    if (w.indexOf("-") > 0) w.split("-").forEach(function(part) {
      if (part) set.add(part);
    });
    set.add(w.replace(/'s$/, ""));
    if (w.length > 3 && w.charAt(w.length - 1) === "s") set.add(w.slice(0, -1));
    else set.add(w + "s");
    return "";
  });
  return set;
}
__name(groundWords, "groundWords");
function foldAccents(w) {
  return String(w || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
__name(foldAccents, "foldAccents");
function groundNumbers(text) {
  var set = /* @__PURE__ */ new Set();
  (String(text || "").match(/\d[\d,]*(?:\.\d+)?/g) || []).forEach(function(n) {
    set.add(n.replace(/,/g, "").replace(/\.0+$/, ""));
  });
  return set;
}
__name(groundNumbers, "groundNumbers");
function problemContext(text, problems) {
  var t = String(text || ""), out = [];
  (problems || []).slice(0, 6).forEach(function(p) {
    var q = String(p).replace(/^.*:\s*/, ""), i = q ? t.indexOf(q) : -1;
    if (i >= 0) out.push(q + " => \u2026" + t.slice(Math.max(0, i - 60), i + q.length + 60).replace(/\s+/g, " ") + "\u2026");
  });
  return out.join(" | ").slice(0, 900);
}
__name(problemContext, "problemContext");
function groundingProblems(text, ground, opts) {
  var o = opts || {}, nowYear = Number(String(o.today || nowIso().slice(0, 10)).slice(0, 4));
  var body = String(text || "").normalize("NFC").replace(/^#+[ \t]+(.*)$/gm, function(m2, h) {
    return h.toLowerCase();
  }).replace(/\(?(?:This|A|An) hypothetical[^)]*\)?/gi, " ");
  var words = groundWords(ground), nums = groundNumbers(ground), out = [], seen = {};
  function add(kind, v) {
    var k = kind + v.toLowerCase();
    if (seen[k]) return;
    seen[k] = 1;
    out.push(kind + ": " + v);
  }
  __name(add, "add");
  var nre = /\$?\d[\d,]*(?:\.\d+)?\s*(%|percent|days?|weeks?|months?|quarters?|years?|hours?)?/gi, m;
  while (m = nre.exec(body)) {
    var raw = m[0], digits = raw.replace(/[^\d.]/g, "").replace(/\.$/, "").replace(/\.0+$/, "");
    if (!digits || digits.indexOf(",") >= 0) continue;
    var plain = m[0].replace(/[$,\s]/g, "").replace(/(%|percent|days?|weeks?|months?|quarters?|years?|hours?)$/i, "");
    var num = plain.replace(/,/g, "");
    if (nums.has(num) || nums.has(num.replace(/\.0+$/, ""))) continue;
    var yr = /^\d\d$/.test(num) && !m[1] ? /(1[0-9]|20)(\d\d)\s*[-\u2010-\u2015\u2212]\s*$/.exec(body.slice(Math.max(0, m.index - 7), m.index)) : null;
    if (yr && Number(num) > Number(yr[2]) && nums.has(yr[1] + num)) continue;
    var unit = (m[1] || "").toLowerCase(), val = Number(num);
    var isYear = /^(1[0-9]|20)\d\d$/.test(num) && !unit;
    if (isYear && val >= nowYear && o.forecast) continue;
    if (o.forecast && (unit === "%" || unit === "percent")) continue;
    if (o.forecast && /^(days?|weeks?|months?|quarters?|years?)$/.test(unit)) continue;
    if (!isYear && !unit && /^\d{1,2}$/.test(num) && val <= 10 && raw.indexOf("$") < 0) continue;
    if (!unit && /^\d{1,2}$/.test(num) && /^(?:st|nd|rd|th)[\s\u2010-\u2015-]+centur/i.test(body.slice(m.index + m[0].length, m.index + m[0].length + 14))) continue;
    if (!isYear && !unit && /^\d$/.test(num)) continue;
    add(isYear ? "year not in the source" : "figure not in the source", raw.trim());
  }
  var sentences = body.split(/(?<=[.!?:;—][”’"')\]*_]*)\s+|\n+/);
  sentences.forEach(function(sent) {
    var toks = sent.match(/[\p{L}\p{N}][\p{L}\p{N}&'.’-]*|[,;]/gu) || [];
    var i = 0;
    while (i < toks.length) {
      var t = toks[i];
      if (!/^\p{Lu}/u.test(t) || /^\p{Lu}$/u.test(t) && toks[i + 1] && !/^\p{Lu}/u.test(toks[i + 1])) {
        i++;
        continue;
      }
      var j = i, phrase = [];
      while (j < toks.length && /^\p{Lu}[\p{L}\p{N}&'.’-]*$/u.test(toks[j])) {
        phrase.push(toks[j]);
        j++;
        if (toks[j] && /^(of|the|for|de|do|da|dos|das|von|van|del|la)$/i.test(toks[j]) && toks[j + 1] && /^\p{Lu}/u.test(toks[j + 1])) {
          phrase.push(toks[j]);
          j++;
        }
      }
      phrase = phrase.filter(function(w) {
        return !/^[A-Z]{2,5}s?[.,;:]?$/.test(w) && !/^[A-Z][.,;:]?$/.test(w) && !/^(?:[A-Z]\.){2,}[A-Z]?[.,;:]?$/.test(w);
      });
      var lead = 0;
      while (lead < phrase.length - 1 && GROUND_LEAD.has(phrase[lead].toLowerCase().replace(/[^a-z]/g, ""))) lead++;
      var core = phrase.slice(lead);
      var first = i === 0;
      var opener = first && lead === 0 && core.length > 1;
      if (opener) core = core.slice(1);
      if (core.length && !(core.length === 1 && first && lead === 0 && !opener) && !(core.length === 1 && GROUND_LEAD.has(core[0].toLowerCase()))) {
        var joined = core.join(" ").replace(/[’]/g, "'");
        var low = joined.toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, " ").replace(/\s+/g, " ").trim();
        if (low && !GROUND_OK.has(low)) {
          var miss = low.split(" ").filter(function(w) {
            return w && !GROUND_OK.has(w) && !GROUND_LEAD.has(w) && !words.has(w) && !words.has(foldAccents(w)) && !words.has(w.replace(/'s$/, "")) && !words.has(w.replace(/'$/, "")) && !/^\d+$/.test(w) && !stemGrounded(w, words);
          });
          if (miss.length === 1 && core.length === 1 && GROUND_DESCRIPTOR_RE.test(miss[0])) miss = [];
          if (miss.length) add("name not in the source", joined);
        }
      }
      i = Math.max(j, i + 1);
    }
  });
  var qre = /["\u201c]([^"\u201c\u201d\n]{8,400})["\u201d]/g, qm;
  var gnorm = " " + normForMatch(ground) + " ";
  while (qm = qre.exec(String(text || ""))) {
    var quote = qm[1].trim(), qn = normForMatch(quote);
    if (qn.split(" ").filter(Boolean).length < QUOTE_MIN_WORDS) continue;
    if (gnorm.indexOf(" " + qn + " ") >= 0 || gnorm.indexOf(qn) >= 0) continue;
    add("quotation not in the source", '"' + quote.slice(0, 120) + '"');
  }
  var blocks = [], cur = null;
  String(text || "").split("\n").forEach(function(l) {
    if (/^\s*>/.test(l)) {
      if (!cur) {
        cur = [];
        blocks.push(cur);
      }
      cur.push(l.replace(/^\s*>\s?/, ""));
    } else cur = null;
  });
  blocks.forEach(function(lines) {
    var bq = lines.join(" ").replace(/^[\s"\u201c]+|[\s"\u201d]+$/g, "").trim();
    var bn = normForMatch(bq);
    if (bn.split(" ").filter(Boolean).length < QUOTE_MIN_WORDS) return;
    if (gnorm.indexOf(" " + bn + " ") >= 0 || gnorm.indexOf(bn) >= 0) return;
    add("quotation not in the source", '"' + bq.slice(0, 120) + '"');
  });
  return out.slice(0, 14);
}
__name(groundingProblems, "groundingProblems");
var QUOTE_MIN_WORDS = 5;
var FACTCHECK_PROMPT = [
  "You are a strict fact-checker for a publication that must contain no unsupported claim. You are given SOURCE MATERIAL and a DRAFT.",
  "If the DRAFT contains a line <!-- analysis -->, the text after that line is the writer's marked analysis. There, list only concrete factual assertions the SOURCE MATERIAL does not contain: an event that happened, a named person, organisation, rule or place doing or saying something, a date, a number, a quotation, a study or precedent. Reasoning, conditionals, generalisations and claims about incentives, constraints or what parties are motivated to do are never violations in that section. The text before the line is checked by every rule below.",
  "List every sentence or clause in the DRAFT, headings and title included, that asserts something about the real world and is not stated in, or a direct paraphrase of, the SOURCE MATERIAL. That covers events, dates, people, organisations, places, works, products, laws, institutions, numbers, quotations, studies, historical episodes and precedents, claims about what the reader does or has done, and statements that a practice or fact is 'known' or 'common'.",
  "A heading or the title labels what follows it: list one only when it states a specific fact (a name, date, number, event or quotation) the SOURCE MATERIAL does not support. A heading that frames or interprets the sourced content of its section is not a violation.",
  "Your own knowledge does not count as support, even if you are sure the claim is true: if it is not in the SOURCE MATERIAL, it is unsupported. A claim that distorts what the SOURCE MATERIAL says (a changed number, a stronger or different relationship, a cause where the source gives only a sequence) is unsupported too. These are NOT violations: analysis and interpretation the writer frames as such ('the incentive is ...', 'this means ...', 'the system rewards ...') that introduces no new name, date, number, event or quotation; a synonym that keeps the source's meaning ('commonly called' where the source says 'frequently called'), reasoning that follows from the source's facts and is presented as reasoning, conditional statements that follow from them, mentions of the source itself (the Wikipedia article, the arXiv paper), definitions, and a clearly labelled hypothetical that names no real person, organisation, product, date or number.",
  'Example of the expected answer: {"unsupported": ["FACT: the road was finished in 1952 -- date not in source", "INFERENCE: so the builders worked under pressure -- reasoning from the source"], "verdict": "fail"}.',
  "Label each item you list. FACT: a specific real-world assertion: something happened, exists, was said, decided, built or measured; any name of a person, organisation, work, product or place; any date, number, count or quotation; any study, event or precedent. INFERENCE: reasoning, interpretation, generalisation or consequence the writer draws from the source's facts, with no specific name, date, number or quotation of its own. When unsure, label it FACT.",
  `Answer with exactly one JSON object and nothing else: {"unsupported": [up to 8 items, each starting with 'FACT: ' or 'INFERENCE: ', then a short quotation copied from the DRAFT, then ' -- ' and the reason in a few words], "verdict": "pass" or "fail"}. verdict is "fail" when any FACT item is listed, else "pass".`
].join("\n");
var INFERENCE_REASON_RE = /\b(analy\w*|evaluat\w*|fram(?:e|es|ed|ing)|judge?ments?|inferen\w*|interpret\w*|generali[sz]\w*|assum\w*|speculat\w*|paraphras\w*|reasoning|opinion|editoriali[sz]\w*|characteri[sz]\w*)\b/i;
var FACT_REASON_RE = /\b(dates?|years?|numbers?|figures?|statistics?|names?|quot\w*|percent\w*|prices?|counts?|amounts?|fabricat\w*|invent\w*|false|wrong|incorrect|contradict\w*)\b/i;
var SWAP_REASON_RE = /\b(?:source|it|the article|the text|the paper)\s+(?:says|uses|has|reads|states|writes|calls it)\s+['"\u2018\u201c]([^'"\u2019\u201d]{1,60})['"\u2019\u201d]\s*,?\s*(?:not|rather than|instead of)\s+['"\u2018\u201c]([^'"\u2019\u201d]{1,60})['"\u2019\u201d]/i;
function oneWordSwap(reason) {
  var m = SWAP_REASON_RE.exec(String(reason || ""));
  if (!m) return false;
  var a = m[1].toLowerCase().trim().split(/\s+/), b = m[2].toLowerCase().trim().split(/\s+/);
  if (a.length !== b.length || a.length < 2 || a.length > 4 || /\d/.test(m[1] + m[2])) return false;
  var diff = 0, wa = "", wb = "";
  for (var k = 0; k < a.length; k++) if (a[k] !== b[k]) {
    diff++;
    wa = a[k];
    wb = b[k];
  }
  return diff === 1 && sameSynonymGroup(wa, wb);
}
__name(oneWordSwap, "oneWordSwap");
var SYNONYM_GROUPS = [
  ["commonly", "frequently", "often", "usually", "typically", "generally", "widely", "regularly"],
  ["called", "named", "termed", "known", "referred", "described"],
  ["uses", "employs", "utilizes", "utilises", "applies"],
  ["use", "employ", "utilize", "utilise", "apply"],
  ["shows", "demonstrates", "indicates", "illustrates", "suggests"],
  ["show", "demonstrate", "indicate", "illustrate"],
  ["about", "around", "approximately", "roughly", "nearly", "almost"],
  ["large", "big", "major", "substantial"],
  ["small", "little", "minor"],
  ["begin", "start", "commence"],
  ["began", "started", "commenced"],
  ["build", "construct"],
  ["built", "constructed"],
  ["make", "create", "produce"],
  ["made", "created", "produced"],
  ["help", "assist", "aid"],
  ["important", "significant", "key", "central"]
];
function sameSynonymGroup(x, y) {
  x = String(x || "").replace(/[^a-z]/g, "");
  y = String(y || "").replace(/[^a-z]/g, "");
  return !!x && !!y && SYNONYM_GROUPS.some(function(g) {
    return g.indexOf(x) >= 0 && g.indexOf(y) >= 0;
  });
}
__name(sameSynonymGroup, "sameSynonymGroup");
function wordingOnly(reason) {
  reason = String(reason || "");
  if (oneWordSwap(reason)) return true;
  return /\b(?:as an? (?:direct|exact|verbatim) quot\w*|not (?:a )?(?:direct|exact|verbatim) quot\w*|verbatim|exact wording|different wording|worded differently|paraphras\w*)\b/i.test(reason) && !/\b(?:dates?|years?|numbers?|figures?|names?|percent\w*|prices?|fabricat\w*|invent\w*|false|wrong|incorrect|contradict\w*)\b/i.test(reason);
}
__name(wordingOnly, "wordingOnly");
function reasonIsInference(item) {
  var i = String(item).lastIndexOf(" -- ");
  if (i < 0) return false;
  var reason = String(item).slice(i + 4);
  var saysSupported = /\bin (?:the )?source\b/i.test(reason) && !/\bnot (?:[\w-]+ ){0,2}in (?:the )?source\b/i.test(reason) && !/\b(?:no|nothing|absent|missing|lacks?)\b/i.test(reason);
  if (wordingOnly(reason)) return true;
  return (INFERENCE_REASON_RE.test(reason) || saysSupported) && !FACT_REASON_RE.test(reason);
}
__name(reasonIsInference, "reasonIsInference");
var REASONING_MARK_RE = /\b(incentives?|pressures?|mechanisms?|structures?|repeats?|wherever|whenever|because|therefore|thus|hence|so that|cannot|can|could|may|might|would|should|tends?|likely|underscores?|suggests?|implies|means|translates?|prevent\w*|despite|based on|leads? to|result\w* in|unless|if|weak|stronger|weaker)\b/i;
var GENERAL_MARK_RE = /\b(wherever|whenever|any|every|mechanisms?|patterns?|incentives?|structures?|if|unless|therefore|thus|hence|would|could|might|tends?)\b/i;
function claimIsReasoning(item, labelledFact) {
  var s = String(item), i = s.lastIndexOf(" -- ");
  if (i < 0) return false;
  var claim = s.slice(0, i).trim(), reason = s.slice(i + 4);
  if (FACT_REASON_RE.test(reason) || /["“‘'][^"”’']{3,}["”’']/.test(reason)) return false;
  if (/[0-9"“”]/.test(claim)) return false;
  if (claim.split(/\s+/).slice(1).some(function(w) {
    return /^[^a-z]*[A-Z]/.test(w) && w !== "I";
  })) return false;
  return labelledFact ? GENERAL_MARK_RE.test(claim) || INFERENCE_REASON_RE.test(reason) : REASONING_MARK_RE.test(claim);
}
__name(claimIsReasoning, "claimIsReasoning");
function factItemText(x) {
  if (x == null) return "";
  if (typeof x !== "object") return String(x);
  var pick = /* @__PURE__ */ __name(function(keys) {
    for (var i = 0; i < keys.length; i++) {
      if (x[keys[i]] != null && String(x[keys[i]]).trim()) return String(x[keys[i]]).trim();
    }
    return "";
  }, "pick");
  var label = pick(["label", "type", "kind", "category"]).toUpperCase();
  var claim = pick(["claim", "quote", "quotation", "text", "sentence", "item", "excerpt"]);
  var reason = pick(["reason", "why", "explanation", "note", "issue"]);
  if (!claim) return JSON.stringify(x).slice(0, 260);
  return (label === "FACT" || label === "INFERENCE" ? label + ": " : "") + claim + (reason ? " -- " + reason : "");
}
__name(factItemText, "factItemText");
function splitFactItems(items) {
  var facts = [], inferences = [];
  (items || []).forEach(function(x) {
    var s = String(x).replace(/\s+/g, " ").trim();
    if (!s) return;
    var m = s.match(/^\**\s*(FACT|INFERENCE)\s*\**\s*[:\-]\s*/i);
    var rest = m ? s.slice(m[0].length) : s;
    var cut = rest.lastIndexOf(" -- ");
    if (m && (m[1].toUpperCase() === "INFERENCE" || claimIsReasoning(rest, true) || cut > 0 && wordingOnly(rest.slice(cut + 4)))) inferences.push(rest.slice(0, 260));
    else if (!m && (reasonIsInference(s) || claimIsReasoning(s))) inferences.push(s.slice(0, 260));
    else facts.push(rest.slice(0, 260));
  });
  return { facts: facts.filter(Boolean), inferences: inferences.filter(Boolean) };
}
__name(splitFactItems, "splitFactItems");
function parseFactVerdict(text) {
  var t = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "");
  var o = null, m = t.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      o = JSON.parse(m[0]);
    } catch (e) {
      o = null;
    }
  }
  if (!o) {
    var vm = t.match(/"verdict"\s*:\s*"(pass|fail)"/gi);
    if (!vm) return null;
    var last = vm[vm.length - 1].match(/(pass|fail)/i)[1];
    var um = t.match(/"unsupported"\s*:\s*\[([\s\S]*?)(?:\]|"verdict")/i), items = [];
    if (um) {
      var re = /"((?:[^"\\]|\\.)*)"/g, x;
      while (x = re.exec(um[1])) {
        if (x[1].trim()) items.push(x[1]);
      }
    }
    o = { verdict: last, unsupported: items };
  }
  var v = String(o && o.verdict || "").toLowerCase().trim();
  if (v !== "pass" && v !== "fail") return null;
  var listed = Array.isArray(o.unsupported) ? o.unsupported.map(factItemText).map(function(x2) {
    return x2.replace(/\s+/g, " ").trim();
  }).filter(Boolean).slice(0, 8) : [];
  var sp = splitFactItems(listed), u = sp.facts;
  if (u.length) v = "fail";
  else if (v === "fail" && !sp.inferences.length) u = ["the reviewer rejected the draft without naming a claim"];
  else v = "pass";
  return { verdict: v, unsupported: u, inferences: sp.inferences };
}
__name(parseFactVerdict, "parseFactVerdict");
function aiReplyText(resp) {
  if (!resp) return "";
  var r = resp.response;
  if (r !== void 0 && r !== null && r !== "") return typeof r === "string" ? r : JSON.stringify(r);
  var m = resp.choices && resp.choices[0] && resp.choices[0].message;
  var c = m && m.content;
  if (Array.isArray(c)) c = c.map(function(p) {
    return typeof p === "string" ? p : p && p.text || "";
  }).join("");
  if (c && typeof c !== "string") c = JSON.stringify(c);
  return c || "";
}
__name(aiReplyText, "aiReplyText");
function factCheckExtra(modelId) {
  var m = String(modelId || "").toLowerCase();
  if (m.indexOf("kimi") >= 0 || m.indexOf("deepseek") >= 0) return { chat_template_kwargs: { thinking: false } };
  if (m.indexOf("nemotron") >= 0) return { chat_template_kwargs: { enable_thinking: false } };
  if (m.indexOf("gpt-oss") >= 0) return { reasoning: { effort: "low" } };
  return {};
}
__name(factCheckExtra, "factCheckExtra");
async function factCheckOne(env, modelId, draft, ground) {
  try {
    var body = FACTCHECK_PROMPT + "\n\n" + todayLine() + "\n\n--- SOURCE MATERIAL ---\n" + String(ground).slice(0, GROUND_MAX + 2e3) + "\n\n--- DRAFT ---\n" + String(draft).trim().slice(0, 3e4);
    var resp = await aiRunAttr(env, "personal-companion", "factcheck", modelId, Object.assign({ messages: [{ role: "user", content: body }], max_tokens: REVIEW_MAX_TOKENS, temperature: 0.1 }, factCheckExtra(modelId)), { gateway: { id: "default" }, signal: AbortSignal.timeout(REVIEW_TIMEOUT_MS) });
    var out = aiReplyText(resp);
    var v = parseFactVerdict(out);
    if (v) {
      v.model = modelId;
      v.family = familyOf(modelId);
      return v;
    }
    return { failed: true, model: modelId, error: "no verdict in reply (" + String(out).length + " chars)" };
  } catch (e) {
    return { failed: true, model: modelId, error: String(e && e.message || e).slice(0, 140) };
  }
}
__name(factCheckOne, "factCheckOne");
var FACTCHECK_HEDGE_MS = 45e3;
var REVIEWER_SICK_MIN_CALLS = 3;
var __reviewerHealth = { at: 0, sick: {}, db: null };
async function sickReviewers(env) {
  var db = env && (env.AUDIT || env.AUDIT_DB);
  if (!db) return {};
  if (__reviewerHealth.db === db && Date.now() - __reviewerHealth.at < 6e5) return __reviewerHealth.sick;
  var sick = {};
  try {
    var day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    var r = await db.prepare("SELECT model, calls, errors FROM ai_call_counters WHERE day = ?1 AND worker = 'personal-companion' AND purpose = 'factcheck'").bind(day).all();
    (r && r.results || []).forEach(function(x) {
      if (Number(x.calls) >= REVIEWER_SICK_MIN_CALLS && Number(x.errors) * 2 >= Number(x.calls)) sick[x.model] = 1;
    });
  } catch (e) {
    console.error("REVIEWER-HEALTH-1 read failed: " + String(e && e.message || e).slice(0, 160));
    return {};
  }
  __reviewerHealth = { at: Date.now(), sick, db };
  return sick;
}
__name(sickReviewers, "sickReviewers");
function orderByHealth(ids, sick) {
  sick = sick || {};
  return ids.filter(function(id) {
    return !sick[id];
  }).concat(ids.filter(function(id) {
    return !!sick[id];
  }));
}
__name(orderByHealth, "orderByHealth");
function gatherVerdicts(env, ids, draft, ground, hedgeMs) {
  return new Promise(function(resolve) {
    var got = [], lastFail = {}, tried = {}, retried = {}, queue = ids.slice(), inflight = 0, done = false, timer = null;
    function finish() {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      resolve({ got, lastFail, tried });
    }
    __name(finish, "finish");
    function onResult(r) {
      inflight--;
      if (done) return;
      if (r && !r.failed && got.length < 2 && !got.some(function(g) {
        return g.family === r.family;
      })) {
        got.push(r);
        delete lastFail[r.model];
      } else if (r && r.failed) lastFail[r.model] = r;
      if (got.length >= 2) return finish();
      fill();
      if (inflight === 0) finish();
    }
    __name(onResult, "onResult");
    function launch(id) {
      tried[id] = 1;
      inflight++;
      factCheckOne(env, id, draft, ground).then(onResult, function(e) {
        onResult({ failed: true, model: id, error: String(e && e.message || e).slice(0, 140) });
      });
    }
    __name(launch, "launch");
    function next() {
      while (queue.length) {
        var id = queue.shift();
        if (!got.some(function(g) {
          return g.model === id;
        })) {
          launch(id);
          return true;
        }
      }
      var again = Object.keys(lastFail).filter(function(m) {
        return !retried[m];
      })[0];
      if (!again) return false;
      retried[again] = 1;
      launch(again);
      return true;
    }
    __name(next, "next");
    function fill() {
      while (!done && inflight < 2 - got.length && next()) {
      }
    }
    __name(fill, "fill");
    fill();
    if (inflight === 0) return finish();
    if (hedgeMs > 0) timer = setTimeout(function() {
      timer = null;
      if (!done) next();
    }, hedgeMs);
  });
}
__name(gatherVerdicts, "gatherVerdicts");
async function factCheck(env, draft, ground, writerModel, seedText) {
  var wf = writerModel ? familyOf(writerModel) : "";
  var ids = orderByHealth(pickReviewers(wf ? [wf] : [], 5, seedOf(seedText)), await sickReviewers(env)), failures = [];
  var gv = await gatherVerdicts(env, ids, draft, ground, FACTCHECK_HEDGE_MS), got = gv.got, lastFail = gv.lastFail;
  Object.keys(lastFail).forEach(function(m) {
    failures.push(lastFail[m]);
  });
  failures = failures.map(function(r) {
    return String(r.model).split("/").pop() + ": " + r.error;
  });
  if (got.length < 2) return { ok: false, unavailable: true, unsupported: [], judges: got, reason: "fewer than two fact-check verdicts from other model families (" + failures.join(" | ").slice(0, 400) + ")" };
  var uns = [], inf = [];
  got.forEach(function(g) {
    g.unsupported.forEach(function(u) {
      if (uns.indexOf(u) < 0) uns.push(u);
    });
    (g.inferences || []).forEach(function(u) {
      if (inf.indexOf(u) < 0) inf.push(u);
    });
  });
  return { ok: got.every(function(g) {
    return g.verdict === "pass";
  }), unavailable: false, unsupported: uns.slice(0, 10), inferences: inf.slice(0, 12), judges: got, reason: "" };
}
__name(factCheck, "factCheck");
var ANALYSIS_MARK = "<!-- analysis -->";
var ANALYSIS_MARK_RE = /^[ \t]*<!--\s*analysis\s*-->[ \t]*$/im;
var ANALYSIS_MAX_SHARE = 0.6;
var ANALYSIS_MIN_REPORT = 600;
function stripAnalysisMark(text) {
  return String(text || "").replace(/\n?[ \t]*<!--\s*analysis\s*-->[ \t]*\n?/gi, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
__name(stripAnalysisMark, "stripAnalysisMark");
function analysisSplitOk(text) {
  var t = String(text || ""), m = t.match(ANALYSIS_MARK_RE);
  if (!m) return false;
  var i = t.indexOf(m[0]);
  var bodyLen = /* @__PURE__ */ __name(function(x) {
    return String(x).replace(/^#.*$/mg, "").replace(/\s+/g, " ").trim().length;
  }, "bodyLen");
  var rep = bodyLen(t.slice(0, i)), ana = bodyLen(stripAnalysisMark(t.slice(i + m[0].length)));
  return ana > 0 && rep >= ANALYSIS_MIN_REPORT && ana / (rep + ana) <= ANALYSIS_MAX_SHARE && !ANALYSIS_MARK_RE.test(t.slice(i + m[0].length));
}
__name(analysisSplitOk, "analysisSplitOk");
function analysisSplitInfo(text) {
  var t = String(text || ""), m = t.match(ANALYSIS_MARK_RE);
  if (!m) return "analysis unmarked";
  var i = t.indexOf(m[0]);
  var bodyLen = /* @__PURE__ */ __name(function(x) {
    return String(x).replace(/^#.*$/mg, "").replace(/\s+/g, " ").trim().length;
  }, "bodyLen");
  var rep = bodyLen(t.slice(0, i)), ana = bodyLen(stripAnalysisMark(t.slice(i + m[0].length))), share = rep + ana ? Math.round(100 * ana / (rep + ana)) : 0;
  if (analysisSplitOk(t)) return "analysis marked " + share + "% after " + rep + " chars";
  var why = ana <= 0 ? "empty analysis" : rep < ANALYSIS_MIN_REPORT ? "report " + rep + " chars < " + ANALYSIS_MIN_REPORT : ana / (rep + ana) > ANALYSIS_MAX_SHARE ? "analysis " + share + "% > " + Math.round(100 * ANALYSIS_MAX_SHARE) + "%" : "more than one line";
  return "analysis dropped: " + why;
}
__name(analysisSplitInfo, "analysisSplitInfo");
var ANALYSIS_VOCAB_RE = /\b(incentives?|rewards?|punish\w*|pays?|gains?|loses?|costs?|because|therefore|that means|which means|so that|feedback|loop|the system|systems?|structur\w*|constrain\w*|trade-?offs?|leverage|motivat\w*|if\b[^.]{0,80}\bthen)\b/i;
function autoMarkAnalysis(body, prefix) {
  var t = String(body || ""), pre = String(prefix || "");
  if (ANALYSIS_MARK_RE.test(t)) return t;
  var parts = t.split(/\n{2,}/), idx = [];
  parts.forEach(function(p, i) {
    if (p.trim() && !/^\s*#/.test(p)) idx.push(i);
  });
  for (var k = 2; k < idx.length; k++) {
    if (!ANALYSIS_VOCAB_RE.test(parts[idx[k]])) continue;
    var cand = parts.slice(0, idx[k]).concat([ANALYSIS_MARK], parts.slice(idx[k])).join("\n\n");
    if (analysisSplitOk(pre + cand)) return cand;
  }
  return t;
}
__name(autoMarkAnalysis, "autoMarkAnalysis");
function splitText(piece) {
  return (piece && piece.lede ? String(piece.lede) + "\n\n" : "") + String(piece && piece.body_md || "");
}
__name(splitText, "splitText");
function withAutoMark(piece) {
  if (!piece || !piece.body_md) return piece;
  var pre = piece.lede ? String(piece.lede) + "\n\n" : "", body = String(piece.body_md);
  if (ANALYSIS_MARK_RE.test(body) && !analysisSplitOk(pre + body)) body = stripAnalysisMark(body);
  var am = autoMarkAnalysis(body, pre);
  return am === String(piece.body_md) ? piece : Object.assign({}, piece, { body_md: am });
}
__name(withAutoMark, "withAutoMark");
function reviewText(text) {
  var t = String(text || "");
  return !ANALYSIS_MARK_RE.test(t) || analysisSplitOk(t) ? t : stripAnalysisMark(t);
}
__name(reviewText, "reviewText");
function stripPieceMark(piece) {
  if (!piece) return piece;
  return Object.assign({}, piece, { lede: piece.lede ? stripAnalysisMark(piece.lede) : piece.lede, body_md: stripAnalysisMark(piece.body_md) });
}
__name(stripPieceMark, "stripPieceMark");
async function verifyPiece(env, text, ground, writerModel, seedText, opts) {
  var det = groundingProblems(stripAnalysisMark(text), ground, opts);
  if (det.length) return { ok: false, stage: "grounding", problems: det, judges: [], unavailable: false };
  var fc = await factCheck(env, reviewText(text), ground, writerModel, seedText);
  if (fc.unavailable) return { ok: false, stage: "factcheck", problems: ["fact-check unavailable: " + fc.reason], judges: fc.judges, unavailable: true };
  if (!fc.ok) return { ok: false, stage: "factcheck", problems: fc.unsupported.map(function(u) {
    return "unsupported claim: " + u;
  }), judges: fc.judges, unavailable: false };
  return { ok: true, stage: "pass", problems: [], judges: fc.judges, unavailable: false, inferences: fc.inferences || [] };
}
__name(verifyPiece, "verifyPiece");
function pieceText(piece) {
  return "# " + String(piece.title || "") + "\n\n" + (piece.subtitle ? String(piece.subtitle) + "\n\n" : "") + (piece.lede ? String(piece.lede) + "\n\n" : "") + String(piece.body_md || "");
}
__name(pieceText, "pieceText");
var __accSchemaDb = null;
async function ensureAccuracySchema(env) {
  if (__accSchemaDb && __accSchemaDb === env.PERSONAL) return true;
  try {
    await env.PERSONAL.prepare("CREATE TABLE IF NOT EXISTS companion_audits (slug TEXT PRIMARY KEY, verdict TEXT NOT NULL, stage TEXT, models TEXT, problems_json TEXT, checked_at TEXT NOT NULL)").run();
    await env.PERSONAL.prepare("CREATE TABLE IF NOT EXISTS companion_retractions (slug TEXT PRIMARY KEY, reason TEXT, claims_json TEXT, retracted_at TEXT NOT NULL)").run();
    await ensureColumns(env.PERSONAL, "companion_pieces", { ground_text: "TEXT" });
    __accSchemaDb = env.PERSONAL;
    return true;
  } catch (e) {
    console.error("companion accuracy schema failed: " + String(e && e.message || e).slice(0, 200));
    return false;
  }
}
__name(ensureAccuracySchema, "ensureAccuracySchema");
var VISIBLE_SQL = "slug IN (SELECT slug FROM companion_audits WHERE verdict = 'pass') AND slug NOT IN (SELECT slug FROM companion_retractions)";
async function pieceVerified(env, slug) {
  try {
    await ensureAccuracySchema(env);
    var r = await env.PERSONAL.prepare("SELECT 1 AS ok FROM companion_pieces WHERE slug = ?1 AND " + VISIBLE_SQL).bind(slug).first();
    return !!r;
  } catch (e) {
    return false;
  }
}
__name(pieceVerified, "pieceVerified");
async function recordAudit(env, slug, verdict, stage, vr) {
  await ensureAccuracySchema(env);
  await env.PERSONAL.prepare("INSERT OR REPLACE INTO companion_audits (slug, verdict, stage, models, problems_json, checked_at) VALUES (?,?,?,?,?,?)").bind(slug, verdict, stage, (vr && vr.judges || []).map(function(j) {
    return j.model;
  }).join(","), JSON.stringify((vr && vr.problems || []).slice(0, 10)), nowIso()).run();
}
__name(recordAudit, "recordAudit");
async function retractPiece(env, slug, reason, claims) {
  await ensureAccuracySchema(env);
  await env.PERSONAL.prepare("INSERT OR REPLACE INTO companion_retractions (slug, reason, claims_json, retracted_at) VALUES (?,?,?,?)").bind(slug, String(reason || "").slice(0, 400), JSON.stringify((claims || []).slice(0, 8)), nowIso()).run();
  try {
    if (env.AUDIT) await env.AUDIT.prepare("UPDATE signals SET status = 'retracted' WHERE id = ?1").bind("reading:" + slug).run();
  } catch (e) {
    logCaught("retractPiece", e);
  }
  return { ok: true, slug };
}
__name(retractPiece, "retractPiece");
async function auditPublished(env, limit) {
  if (!await ensureAccuracySchema(env)) return { ok: false, reason: "schema" };
  var rows = await env.PERSONAL.prepare(
    "SELECT slug, title, subtitle, lede, body_md, ground_text FROM companion_pieces WHERE slug NOT IN (SELECT slug FROM companion_retractions) AND slug NOT IN (SELECT slug FROM companion_audits) ORDER BY id DESC LIMIT ?1"
  ).bind(limit || 3).all();
  var res = { checked: 0, passed: 0, retracted: 0, withdrawn: 0, deferred: 0 };
  for (var p of rows.results || []) {
    if (!p.ground_text || String(p.ground_text).length < 500) {
      await recordAudit(env, p.slug, "unverifiable", "no-source-record", { judges: [], problems: ["no source material was recorded for this piece"] });
      await retractPiece(env, p.slug, "Withdrawn: no record of the source material this piece was written from exists, so its claims cannot be verified.", []);
      res.withdrawn++;
      continue;
    }
    var vr = await verifyPiece(env, pieceText(p), p.ground_text, "", "audit:" + p.slug, {});
    if (vr.unavailable) {
      res.deferred++;
      continue;
    }
    res.checked++;
    if (vr.ok) {
      await recordAudit(env, p.slug, "pass", vr.stage, vr);
      res.passed++;
      continue;
    }
    await recordAudit(env, p.slug, "fail", vr.stage, vr);
    await retractPiece(env, p.slug, "Retracted after an accuracy audit: the piece contained claims its source material does not support (" + vr.stage + " check).", vr.problems);
    res.retracted++;
  }
  return Object.assign({ ok: true }, res);
}
__name(auditPublished, "auditPublished");
function renderRetraction(r, p, keyQS) {
  var claims = [];
  try {
    claims = JSON.parse(r.claims_json || "[]");
  } catch (e) {
    claims = [];
  }
  var date = String(r.retracted_at || "").slice(0, 10);
  var list = claims.length ? "<p>Examples of what could not be verified:</p><ul>" + claims.slice(0, 5).map(function(c) {
    return "<li>" + escHtml(c) + "</li>";
  }).join("") + "</ul>" : "";
  var body = "<div class=meta>Retracted " + escHtml(date) + "</div><h2>Retracted: " + escHtml(p && p.title || "this piece") + "</h2><p>" + escHtml(r.reason || "") + " Every piece is now checked against its source material by two independent reviewers before it is shown or mailed; earlier pieces are audited, and any that fail are withdrawn and listed on the <a href=/retractions" + (keyQS || "") + ">retractions page</a>.</p>" + list + "<footer><a href=/" + (keyQS || "") + ">back to index</a></footer>";
  return page2("Retracted", shell(body), '<meta name="robots" content="noindex">');
}
__name(renderRetraction, "renderRetraction");
function renderRetractions(rows, keyQS) {
  var items = (rows || []).map(function(r) {
    return "<li>" + escHtml(r.title || r.slug) + " &mdash; retracted " + escHtml(String(r.retracted_at || "").slice(0, 10)) + ". " + escHtml(r.reason || "") + "</li>";
  }).join("");
  var body = "<h2>Corrections and retractions</h2><p>Pieces are shown only when their claims are supported by their source material. When one is found not to be, it is withdrawn and listed here.</p>" + (items ? "<ul>" + items + "</ul>" : "<p>No piece has been retracted.</p>") + "<footer><a href=/" + (keyQS || "") + ">back to index</a></footer>";
  return page2("Retractions", shell(body), '<meta name="robots" content="noindex">');
}
__name(renderRetractions, "renderRetractions");
function factRevisionPrompt(problems, ground) {
  return "FACT REVISION. Independent fact-checkers rejected the draft below. Every item in the list is a claim the source material does not support." + NL + "Return the SAME piece in the SAME output format (a single # heading with the title, then the prose), with each such name, date, figure or claim deleted, or replaced by reasoning that follows from the source material, or by a labelled hypothetical that names no real person, organisation, product, date or number. Add no new facts. Keep everything else, including the length." + NL + NL + "Problems:" + NL + "- " + problems.slice(0, 12).join(NL + "- ");
}
__name(factRevisionPrompt, "factRevisionPrompt");
var REVISE_BEFORE_MS = 42e4;
var PRUNE_ROUNDS = 5;
var PRUNE_START_BEFORE_MS = 66e4;
async function generate(env, form, opts) {
  var t0 = Date.now();
  opts = opts || {};
  var gg = await criticGroundingGates(env);
  var topic = null;
  var model = "";
  try {
    await ensureSchema(env);
    await logRun(env, form, "", "", "stage", "schema ok, writer order " + await loadWriterOrder(env), Date.now() - t0);
    topic = await pickTopic(env, form);
    await logRun(env, form, "", topic.id, "stage", "topic", Date.now() - t0);
    var profile = await loadProfile(env);
    var life = await loadLife(env);
    var continuity = await loadContinuity(env, form);
    await logRun(env, form, "", topic.id, "stage", "context " + profile.length + "/" + life.length + "/" + continuity.length, Date.now() - t0);
    var anchors = (topic.anchors || []).slice();
    if (form === "serial") {
      try {
        var sr = await env.PERSONAL.prepare("SELECT title, thesis, last_lines FROM companion_series ORDER BY id DESC LIMIT 1").first();
        if (sr) anchors.push({ kind: "previous installment", ref: "previous installment", title: squish(sr.title || ""), text: squish(String(sr.thesis || "") + " " + String(sr.last_lines || "")).slice(0, 1600) });
      } catch (eSr) {
        logCaught("generate", eSr);
      }
    }
    await logRun(env, form, "", topic.id, "stage", "anchorKinds " + anchors.map(function(x) {
      return x.kind;
    }).join(","), Date.now() - t0);
    await logRun(env, form, "", topic.id, "stage", "anchors " + anchors.length + (topic.diag ? " (" + topic.diag + ")" : ""), Date.now() - t0);
    if (anchors.length < 2) {
      await logRun(env, form, "", topic.id, "blocked", "insufficient anchors: " + (topic.diag || "no source returned usable text"), Date.now() - t0);
      return { ok: false, error: "insufficient anchors: " + (topic.diag || "") };
    }
    var ground = anchorsText(anchors);
    var vopts = { subject: topic.a };
    var repairOpts = { subject: topic.a, floorShare: REPAIR_FLOOR_SHARE };
    var attempt = 0;
    var best = null;
    var feedback = "";
    var failClosed = "";
    while (attempt < 5) {
      if (Date.now() - t0 > GEN_BUDGET_MS) {
        await logRun(env, form, model, topic.id, "stage", "time budget spent after " + attempt + " attempts", Date.now() - t0);
        break;
      }
      attempt++;
      await logRun(env, form, "", topic.id, "stage", "compose attempt " + attempt, Date.now() - t0);
      var comp = await composePiece(env, form, topic, anchors, life, profile, continuity, feedback);
      model = comp.model;
      await logRun(env, form, model, topic.id, "stage", "composed " + String(comp.piece && comp.piece.body_md || "").length + (comp.error ? " err: " + String(comp.error).slice(0, 400) : ""), Date.now() - t0);
      var piece = comp.piece;
      if (!piece) {
        continue;
      }
      var split = splitLongLede(piece);
      if (split !== piece) {
        await logRun(env, form, model, topic.id, "stage", "lede split: " + String(piece.lede || "").split(/\s+/).filter(Boolean).length + " -> " + String(split.lede || "").split(/\s+/).filter(Boolean).length + " words", Date.now() - t0);
        piece = split;
      }
      piece = withAutoMark(piece);
      var v = validatePiece(piece, form, ground, vopts);
      if (!v.ok) {
        var gr = repairGroundingDraft(piece, v.problems, form, ground, vopts);
        if (gr && gr.ok) {
          await logRun(env, form, model, topic.id, "stage", "grounding repair: removed " + gr.removed + " sentences", Date.now() - t0);
          piece = gr.piece;
          v = gr.v;
        } else if (gr && gr.piece) {
          await logRun(env, form, model, topic.id, "stage", "grounding repair: removed " + gr.removed + " sentences; still short (" + gr.v.problems.join("; ") + "), extending the cleaned draft", Date.now() - t0);
          piece = gr.piece;
          v = gr.v;
        }
      }
      if (!v.ok) {
        await logRun(env, form, model, topic.id, "rejected", "validate: " + v.problems.join("; ") + " || in context: " + problemContext(String(piece.title || "") + "\n" + String(piece.lede || "") + "\n" + String(piece.body_md || ""), v.problems) + " || raw: " + String(comp.raw || "").slice(0, 300), Date.now() - t0);
        feedback = "The previous draft failed validation for these reasons: " + v.problems.join("; ") + ". Fix them and try again. Remove every name, year and figure that is not in the source material.";
        var shortOnly = expandFeedback(v.problems, form, piece);
        if (shortOnly) feedback = shortOnly;
        continue;
      }
      var dup = await similarExists(env, String(piece.title) + NL + String(piece.body_md), null);
      if (dup) {
        await logRun(env, form, model, topic.id, "rejected", "too similar to " + dup.slug + " (" + dup.score.toFixed(3) + ")", Date.now() - t0);
        continue;
      }
      var openKey = String(piece.lede || String(piece.body_md || "").split(NL)[0] || "").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 48);
      if (openKey.length > 40) {
        try {
          var odCheck = await env.PERSONAL.prepare(
            "SELECT slug FROM companion_pieces WHERE replace(replace(replace(lower(substr(lede,1,120)),' ',''),'.',''),'-','') LIKE ? LIMIT 1"
          ).bind(openKey + "%").all();
          if ((odCheck.results || []).length > 0) {
            await logRun(env, form, model, topic.id, "rejected", "duplicate opening: same lede as existing piece", Date.now() - t0);
            feedback = "The previous draft opened with the same sentences as an existing piece. Open on a different particular.";
            continue;
          }
        } catch (e) {
          logCaught("generate", e);
        }
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
          logCaught("generate", e);
        }
      }
      await logRun(env, form, model, topic.id, "stage", "critique (" + analysisSplitInfo(splitText(piece)) + ")", Date.now() - t0);
      var crit = await critiquePiece(env, piece, form, ground);
      if (!crit) {
        failClosed = "critic unavailable";
        await logRun(env, form, model, topic.id, "rejected", "critic unavailable (fail closed)", Date.now() - t0);
        continue;
      }
      var q = crit;
      var sc = gateWorst(q, form, gg), worst = sc.worst, worstName = sc.worstName;
      if (sc.missing) failClosed = "critic returned no score";
      var floorForForm = form === "notes" ? ACCEPT_FLOOR_NOTES : ACCEPT_FLOOR_ESSAY;
      if (worst < floorForForm && (worstName === "grounding" || worstName === "argument" || worstName === "systems" || criticQuotes(q.why, pieceText(piece), q.invented).length > 0) && Date.now() - t0 < REFRAME_START_BEFORE_MS) {
        var rf = await reframePiece(env, piece, ground, q.why, q.invented);
        var rfv = rf.piece ? validatePiece(rf.piece, form, ground, repairOpts) : null;
        if (rf.piece && !rfv.ok) rf.why = "edit failed validation: " + rfv.problems.slice(0, 2).join("; ").slice(0, 160);
        if (rfv && rfv.ok) {
          await logRun(env, form, model, topic.id, "stage", "reframe: " + rf.why + ", re-reading (" + analysisSplitInfo(splitText(rf.piece)) + ")", Date.now() - t0);
          var critR = await critiquePiece(env, rf.piece, form, ground);
          var scR = critR ? gateWorst(critR, form, gg) : null;
          if (scR && !scR.missing && (scR.worst >= floorForForm || scR.worstName === "grounding" && scR.worst >= worst)) {
            piece = rf.piece;
            v = rfv;
            q = critR;
            sc = scR;
            worst = sc.worst;
            worstName = sc.worstName;
          } else await logRun(env, form, model, topic.id, "stage", "reframe kept the draft: " + (scR ? "the edit read " + scR.worstName + "=" + scR.worst : "critic unavailable"), Date.now() - t0);
        } else await logRun(env, form, model, topic.id, "stage", "reframe kept the draft: " + rf.why, Date.now() - t0);
      }
      if (worst < floorForForm && worstName === "grounding") {
        var rq = criticQuotes(q.why, pieceText(piece), q.invented);
        var rqSrc = rq.length ? quotesAllSourced(ground, rq) : null;
        var rrNote = !rq.length ? rubricNoQuoteNote() : analysisSplitOk(splitText(piece)) && quotesAllInAnalysis(piece, rq) ? rubricRereadNote(rq) : rqSrc ? sourcedRereadNote(rqSrc) : "";
        if (rrNote) {
          var critRR = await critiquePiece(env, piece, form, ground, rrNote);
          var scRR = critRR ? gateWorst(critRR, form, gg) : null;
          await logRun(env, form, model, topic.id, "stage", "rubric re-read: " + (rq.length ? rq.length + (rqSrc && rrNote.indexOf("the source material states each") >= 0 ? " quoted passages the source states" : " quoted passages all in the marked analysis") : "no quoted passage the piece contains") + "; " + (scRR ? scRR.missing ? "no score" : scRR.worstName + "=" + scRR.worst : "critic unavailable"), Date.now() - t0);
          if (scRR && !scRR.missing) {
            critRR.rubric_reread = { quotes: rq.length, first: worstName + "=" + worst };
            q = critRR;
            sc = scRR;
            worst = sc.worst;
            worstName = sc.worstName;
          }
        }
      }
      for (var cround = 1; cround <= CRITIC_PRUNE_ROUNDS && worst < floorForForm && worstName === "grounding"; cround++) {
        var cq = criticQuotes(q.why, pieceText(piece), q.invented);
        var cpr = cq.length ? pruneUnsupported(piece, cq.map(function(x) {
          return "unsupported claim: " + x;
        })) : null;
        var cpv = cpr && cpr.removed.length ? validatePiece(cpr.piece, form, ground, repairOpts) : null;
        if (!(cpv && cpv.ok)) break;
        await logRun(env, form, model, topic.id, "stage", "critic prune r" + cround + ": removed " + cpr.removed.length + " sentences, re-reading", Date.now() - t0);
        var crit2 = await critiquePiece(env, cpr.piece, form, ground);
        if (!crit2) break;
        piece = cpr.piece;
        v = cpv;
        q = crit2;
        sc = gateWorst(q, form, gg);
        worst = sc.worst;
        worstName = sc.worstName;
        if (sc.missing) failClosed = "critic returned no score";
      }
      if (worst < floorForForm) {
        await logRun(env, form, model, topic.id, "rejected", "critique " + worstName + "=" + worst + " :: " + String(q.why || ""), Date.now() - t0);
        feedback = "REVISE the previous draft: keep its strong parts, fix its weak ones. Previous scores: specificity=" + q.specificity + " argument=" + q.argument + " objection=" + q.objection + " voice=" + q.voice + (q.grounding !== void 0 ? " grounding=" + q.grounding : "") + (q.systems !== void 0 ? " systems=" + q.systems : "") + ". Weakest was " + worstName + ". Why: " + String(q.why || "") + ".";
        continue;
      }
      if (!gg && Number.isFinite(Number(q.grounding)) && Number(q.grounding) < ACCEPT_FLOOR_NOTES) {
        var gq = criticQuotes(q.why, pieceText(piece), q.invented);
        var gpr = gq.length ? pruneUnsupported(piece, gq.map(function(x) {
          return "unsupported claim: " + x;
        })) : null;
        var gpv = gpr && gpr.removed.length ? validatePiece(gpr.piece, form, ground, repairOpts) : null;
        if (gpv && gpv.ok) {
          piece = gpr.piece;
          v = gpv;
        }
        await logRun(env, form, model, topic.id, "stage", "critic grounding " + q.grounding + " (advisory): " + (gpv && gpv.ok ? "removed " + gpr.removed.length + " quoted sentences" : gq.length ? "kept the draft (" + (gpv ? gpv.problems.slice(0, 2).join("; ").slice(0, 120) : "nothing located") + ")" : "no quoted passage") + "; the fact-check judges accuracy", Date.now() - t0);
      }
      await logRun(env, form, model, topic.id, "stage", "fact-check", Date.now() - t0);
      var vr = await verifyPiece(env, pieceText(piece), ground, model, topic.id + ":" + attempt, {});
      var finalPiece = piece;
      var pruneTrail = [];
      var prunedShort = null;
      for (var pround = 1; pround <= PRUNE_ROUNDS && !vr.ok && !vr.unavailable && vr.stage === "factcheck" && Date.now() - t0 < PRUNE_START_BEFORE_MS; pround++) {
        var pr = pruneUnsupported(finalPiece, vr.problems, { headings: true });
        if (!pr.removed.length) {
          pruneTrail.push("r" + pround + " located nothing");
          break;
        }
        var pv = validatePiece(pr.piece, form, ground, repairOpts);
        if (!pv.ok) {
          pruneTrail.push("r" + pround + " -" + pr.removed.length + " blocked: " + pv.problems.slice(0, 2).join("; ").slice(0, 120));
          if (pruneBlockFixable(pv.problems, form)) prunedShort = { piece: pr.piece, words: pv.words, problems: pv.problems };
          break;
        }
        pruneTrail.push("r" + pround + " -" + pr.removed.length + " (" + pv.words + " words)");
        await logRun(env, form, model, topic.id, "stage", "fact prune r" + pround + ": removed " + pr.removed.length + " sentences, re-verifying", Date.now() - t0);
        finalPiece = pr.piece;
        v = pv;
        vr = await verifyPiece(env, pieceText(finalPiece), ground, model, topic.id + ":" + attempt + ":p" + pround, {});
      }
      if (pruneTrail.length) await logRun(env, form, model, topic.id, "stage", "fact prune trail: " + pruneTrail.join(", ") + (vr.ok ? " -> pass" : ""), Date.now() - t0);
      if (!vr.ok && !vr.unavailable && Date.now() - t0 < REVISE_BEFORE_MS) {
        var extendFb = prunedShort ? pruneRepairFeedback(prunedShort.problems, form, { title: prunedShort.piece.title, body_md: (prunedShort.piece.lede ? prunedShort.piece.lede + NL + NL : "") + prunedShort.piece.body_md }, topic.a) : null;
        await logRun(env, form, model, topic.id, "rejected", "fact-check " + vr.stage + ": " + vr.problems.slice(0, 4).join(" | ").slice(0, 600) + (prunedShort && extendFb ? " (extending the pruned draft, " + prunedShort.words + " words: " + prunedShort.problems.map(function(x) {
          return String(x).slice(0, 40);
        }).join("; ") + ")" : " (one corrective revision)"), Date.now() - t0);
        if (prunedShort && extendFb) finalPiece = prunedShort.piece;
        var rev = extendFb ? await composePiece(env, form, topic, anchors, life, profile, continuity, extendFb + NL + NL + "Add no name, date, figure or claim that the source material does not state.") : await composePiece(env, form, topic, anchors, life, profile, continuity, "", { title: finalPiece.title, body_md: (finalPiece.lede ? finalPiece.lede + NL + NL : "") + finalPiece.body_md, problems: vr.problems });
        var rp = rev && rev.piece ? withAutoMark(splitLongLede(rev.piece)) : null;
        if (rp && !/^\s*(?:```[^\n]*\n)?\s*# /.test(String(rev.raw || ""))) rp.title = finalPiece.title;
        var rv = rp ? validatePiece(rp, form, ground, repairOpts) : { ok: false, problems: ["fact revision produced no draft"] };
        if (rp && !rv.ok) {
          var rgr = repairGroundingDraft(rp, rv.problems, form, ground, repairOpts);
          if (rgr && rgr.ok) {
            await logRun(env, form, model, topic.id, "stage", "revision repair: removed " + rgr.removed + " sentences", Date.now() - t0);
            rp = rgr.piece;
            rv = rgr.v;
          }
        }
        if (rp && rv.ok) {
          vr = await verifyPiece(env, pieceText(rp), ground, rev.model, topic.id + ":" + attempt + ":rev", {});
          if (vr.ok) {
            finalPiece = rp;
            model = rev.model;
            v = rv;
          }
        } else {
          vr = { ok: false, stage: "revision", problems: (rv.problems || []).concat(vr.problems || []), judges: [], unavailable: false };
        }
      }
      if (vr.unavailable) {
        failClosed = "fact-check unavailable";
        await logRun(env, form, model, topic.id, "rejected", "fact-check unavailable (fail closed): " + vr.problems.join("; ").slice(0, 300), Date.now() - t0);
        break;
      }
      if (!vr.ok) {
        await logRun(env, form, model, topic.id, "rejected", "fact-check " + vr.stage + ": " + vr.problems.slice(0, 4).join(" | ").slice(0, 600), Date.now() - t0);
        feedback = "The previous draft was rejected by independent fact-checkers; every item is a claim the source material does not support. Write a new draft that makes none of them and adds no other fact from outside the source material: " + vr.problems.slice(0, 8).join(" | ");
        continue;
      }
      if ((vr.inferences || []).length) {
        var pi = pruneUnsupported(finalPiece, vr.inferences.map(function(u) {
          return "unsupported claim: " + u;
        }));
        var piv = pi.removed.length ? validatePiece(pi.piece, form, ground, repairOpts) : null;
        if (piv && piv.ok) {
          finalPiece = pi.piece;
          v = piv;
        }
        await logRun(env, form, model, topic.id, "stage", "inference prune: " + (piv && piv.ok ? "removed " + pi.removed.length + " sentences" : pi.removed.length ? "kept (" + piv.problems.slice(0, 2).join("; ").slice(0, 120) + ")" : "located nothing") + " of " + vr.inferences.length + " items", Date.now() - t0);
      }
      if (pieceText(finalPiece) !== pieceText(piece)) {
        await logRun(env, form, model, topic.id, "stage", "final read (" + analysisSplitInfo(splitText(finalPiece)) + ")", Date.now() - t0);
        var qf = await critiquePiece(env, finalPiece, form, ground);
        if (!qf) {
          failClosed = "critic unavailable";
          await logRun(env, form, model, topic.id, "rejected", "final read: critic unavailable (fail closed)", Date.now() - t0);
          continue;
        }
        var sfin = gateWorst(qf, form, gg);
        if (!sfin.missing && sfin.worst < floorForForm && sfin.worstName === "grounding") {
          var rqf = criticQuotes(qf.why, pieceText(finalPiece), qf.invented);
          var rqfSrc = rqf.length ? quotesAllSourced(ground, rqf) : null;
          var rrNoteF = !rqf.length ? rubricNoQuoteNote() : analysisSplitOk(splitText(finalPiece)) && quotesAllInAnalysis(finalPiece, rqf) ? rubricRereadNote(rqf) : rqfSrc ? sourcedRereadNote(rqfSrc) : "";
          if (rrNoteF) {
            var qfr = await critiquePiece(env, finalPiece, form, ground, rrNoteF);
            var sfr = qfr ? gateWorst(qfr, form, gg) : null;
            await logRun(env, form, model, topic.id, "stage", "final rubric re-read: " + (rqf.length ? rqf.length + (rqfSrc && rrNoteF.indexOf("the source material states each") >= 0 ? " quoted passages the source states" : " quoted passages all in the marked analysis") : "no quoted passage the piece contains") + "; " + (sfr ? sfr.missing ? "no score" : sfr.worstName + "=" + sfr.worst : "critic unavailable"), Date.now() - t0);
            if (sfr && !sfr.missing) {
              qfr.rubric_reread = { quotes: rqf.length, first: sfin.worstName + "=" + sfin.worst };
              qf = qfr;
              sfin = sfr;
            }
          }
        }
        if (sfin.missing || sfin.worst < floorForForm) {
          await logRun(env, form, model, topic.id, "rejected", "final read " + sfin.worstName + "=" + sfin.worst + " :: " + String(qf.why || ""), Date.now() - t0);
          feedback = "REVISE the previous draft: keep its strong parts, fix its weak ones. The final reading of the fact-checked text scored " + sfin.worstName + "=" + sfin.worst + ". Why: " + String(qf.why || "") + ".";
          continue;
        }
        q = qf;
      }
      q.gate = "passed";
      q.factcheck = { stage: vr.stage, models: (vr.judges || []).map(function(j) {
        return j.model;
      }), pruned: pruneTrail.join(", ") };
      best = { piece: finalPiece, quality: q, words: v.words, vr };
      break;
    }
    if (!best) {
      await logRun(env, form, model, topic.id, "failed", "no piece survived the gate" + (failClosed ? " (" + failClosed + ")" : ""), Date.now() - t0);
      return { ok: false, error: "no piece survived the gate" + (failClosed ? " (" + failClosed + ")" : "") };
    }
    var slug = await persistPiece(env, best.piece, form, topic, model, best.quality, best.words, ground);
    await recordAudit(env, slug, "pass", best.vr.stage, best.vr);
    if (topic.cacheId) {
      try {
        await env.PERSONAL.prepare("UPDATE companion_anchor_cache SET done = 1 WHERE id = ?").bind(topic.cacheId).run();
      } catch (eCd) {
        logCaught("top", eCd);
      }
    }
    await logRun(env, form, model, topic.id, "ok", slug, Date.now() - t0);
    return { ok: true, slug, form, title: best.piece.title, words: best.words, quality: best.quality, topic: topic.id, model };
  } catch (e) {
    await logRun(env, form, model, topic ? topic.id : "", "error", String(e && e.message || e), Date.now() - t0);
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(generate, "generate");
__name2(generate, "generate");
__name22(generate, "generate");
__name222(generate, "generate");
var TICK_CRON = "0 * * * *";
var CRON_TABLE = ["0 * * * *", "0 21 * * *"];
var TICK_PARALLEL = false;
function cronFieldMatch(spec, v) {
  return String(spec).split(",").some(function(part) {
    var st = /^(.+)\/(\d+)$/.exec(part), step = st ? Number(st[2]) : 1, base = st ? st[1] : part;
    var r = /^(\d+)-(\d+)$/.exec(base), lo, hi;
    if (base === "*") {
      lo = 0;
      hi = 1e9;
    } else if (r) {
      lo = Number(r[1]);
      hi = Number(r[2]);
    } else {
      lo = Number(base);
      hi = st ? 1e9 : lo;
    }
    return v >= lo && v <= hi && (v - (base === "*" ? 0 : lo)) % step === 0;
  });
}
__name(cronFieldMatch, "cronFieldMatch");
function cronMatchesAt(expr, ms) {
  var f = String(expr).trim().split(/\s+/), d = new Date(ms);
  return f.length === 5 && cronFieldMatch(f[0], d.getUTCMinutes()) && cronFieldMatch(f[1], d.getUTCHours()) && cronFieldMatch(f[2], d.getUTCDate()) && cronFieldMatch(f[3], d.getUTCMonth() + 1) && cronFieldMatch(f[4], d.getUTCDay() + 1);
}
__name(cronMatchesAt, "cronMatchesAt");
function cronDueAtTick(table, tickMs) {
  var t = Math.floor(tickMs / 6e4) * 6e4;
  return table.filter(function(expr) {
    for (var k = 0; k < 60; k++) if (cronMatchesAt(expr, t - k * 6e4)) return true;
    return false;
  });
}
__name(cronDueAtTick, "cronDueAtTick");
async function cronTickDispatch(event, one) {
  if (!event || event.cron !== TICK_CRON || event.tickEntry) return one(event);
  var at = Number(event.scheduledTime) || Date.now();
  var due = cronDueAtTick(CRON_TABLE, at);
  var run = /* @__PURE__ */ __name(function(expr) {
    return Promise.resolve().then(function() {
      return one({ cron: expr, scheduledTime: at, type: "scheduled", tickEntry: true });
    }).catch(function(e) {
      console.error("cron " + expr + ": " + String(e && e.message || e));
    });
  }, "run");
  if (TICK_PARALLEL) {
    await Promise.all(due.map(run));
    return;
  }
  for (var i = 0; i < due.length; i++) await run(due[i]);
}
__name(cronTickDispatch, "cronTickDispatch");
var STALL_MIN = 120;
var STALL_TITLE = "COMPANION-PUBLISH-STALL-AUTO-1";
function stallAttemptStage(detail) {
  var d = String(detail || "");
  if (/^time budget spent/.test(d)) return "time budget";
  if (/^critique |^critic /.test(d)) return "critique";
  if (/^fact-check/.test(d)) return "fact-check";
  if (/^validate:/.test(d)) {
    var head = d.split(" || ")[0];
    if (/banned:/.test(head)) return "validate-banned";
    if (/(?:essay|notes|serial) length \d+/.test(head)) return "validate-length";
    if (/grounding:/.test(head)) return "validate-grounding";
    if (/\blede\b/.test(head)) return "validate-lede";
    return "validate-other";
  }
  return "other";
}
__name(stallAttemptStage, "stallAttemptStage");
function companionStallDigest(rows) {
  var n = {}, order = [];
  (rows || []).forEach(function(r) {
    var k = stallAttemptStage(r && r.detail);
    if (!n[k]) {
      n[k] = 0;
      order.push(k);
    }
    n[k]++;
  });
  return order.sort(function(x, y) {
    return n[y] - n[x];
  }).map(function(k) {
    return k + " " + n[k];
  }).join(", ");
}
__name(companionStallDigest, "companionStallDigest");
function stallLog(at, e) {
  console.error(JSON.stringify({ at: "personal-companion." + at, error: String(e && e.message || e).slice(0, 300) }));
}
__name(stallLog, "stallLog");
async function companionStallDetector(env, nowMs) {
  if (!env.AUDIT || !env.PERSONAL) return { skipped: "no binding" };
  var now = nowMs || Date.now();
  var lastRow = await env.PERSONAL.prepare("SELECT slug, created_at FROM companion_pieces ORDER BY id DESC LIMIT 1").first();
  var lastMs = lastRow && lastRow.created_at ? Date.parse(String(lastRow.created_at)) : 0;
  var hours = lastMs ? Math.round((now - lastMs) / 36e5 * 10) / 10 : null;
  try {
    await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3, state = 'MEASURED' WHERE metric = ?1").bind("companion_hours_since_last_piece", hours == null ? null : String(hours), new Date(now).toISOString()).run();
  } catch (eM) {
    stallLog("stall.metric", eM);
  }
  var open = await env.AUDIT.prepare("SELECT id FROM agent_issues WHERE status='open' AND title LIKE ?1 ORDER BY id DESC").bind(STALL_TITLE + ":%").all();
  var openIds = (open && open.results || []).map(function(o) {
    return o.id;
  });
  if (hours != null && hours * 60 < STALL_MIN) {
    for (var i = 0; i < openIds.length; i++) {
      var ev = "personal-companion " + VERSION + " stall detector: piece " + lastRow.slug + " created " + lastRow.created_at + " (" + hours + "h ago) at " + new Date(now).toISOString();
      await env.AUDIT.prepare("UPDATE issue_triage SET close_evidence=?1 WHERE issue_id=?2").bind(ev, openIds[i]).run().catch(function(e) {
        stallLog("stall.close-evidence", e);
      });
      await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', close_channel='auto-recovery', updated_at=?1 WHERE id=?2").bind(now, openIds[i]).run();
    }
    return { hours, closed: openIds.length };
  }
  var fr = await env.PERSONAL.prepare("SELECT run_at, status, model, topic, detail FROM companion_runs WHERE status IN ('ok','failed','blocked') AND form <> 'steward' ORDER BY id DESC LIMIT 2").all();
  var runs = fr && fr.results || [];
  if (runs.length < 2 || runs.some(function(r) {
    return r.status === "ok";
  })) return { hours, stalled: false };
  var since = new Date(now - 864e5).toISOString();
  var dayQ = await env.PERSONAL.prepare("SELECT id, status, detail FROM companion_runs WHERE run_at >= ?1 AND form <> 'steward' AND (status = 'rejected' OR (status = 'stage' AND detail LIKE 'time budget spent%')) ORDER BY id DESC LIMIT 200").bind(since).all();
  var dayRows = dayQ && dayQ.results || [];
  var runsQ = await env.PERSONAL.prepare("SELECT COUNT(*) n FROM companion_runs WHERE run_at >= ?1 AND form <> 'steward' AND status IN ('failed','blocked')").bind(since).first();
  var newest = dayRows.filter(function(r) {
    return r.status === "rejected";
  }).slice(0, 3).map(function(r) {
    return "#" + r.id + " " + stallAttemptStage(r.detail) + ": " + String(r.detail || "").split(" || ")[0].slice(0, 200);
  }).join(" | ");
  var causes = runs.map(function(r) {
    return r.run_at + " " + (r.model || "-") + " " + (r.topic || "") + ": " + String(r.detail || "").slice(0, 120);
  }).join(" | ");
  var errs = await env.PERSONAL.prepare("SELECT detail FROM companion_runs WHERE status='stage' AND detail LIKE '%err:%' ORDER BY id DESC LIMIT 1").first();
  var title = STALL_TITLE + ": reading.q08.org published nothing for " + (hours == null ? "ever" : Math.round(hours) + "h") + "; last 2 generation runs failed";
  var desc = "Filed and refreshed automatically by personal-companion " + VERSION + " companionStallDetector (PUBLISH-STALL-DIGEST-1), " + new Date(now).toISOString() + ". Stage each rejected attempt ended at, last 24 h (" + dayRows.length + " rows, " + (runsQ && runsQ.n || 0) + " failed or blocked runs): " + (companionStallDigest(dayRows) || "none") + ". Newest rejections: " + (newest || "none") + ". Last 2 generation runs: " + causes + (errs && errs.detail ? ". Latest model-call error: " + String(errs.detail).slice(0, 300) : "") + ". Fix the stage with the most attempts first; the full rows are in companion_runs (personal-life D1). Closes itself with evidence when a piece is created.\ncode-task: repo=qnfo-workers path=personal-companion/worker.js";
  var prio = hours == null || hours >= 24 ? "critical" : "high";
  if (openIds.length) {
    await env.AUDIT.prepare("UPDATE agent_issues SET title=?1, description=?2, priority=?3, updated_at=?4 WHERE id=?5").bind(title, desc, prio, now, openIds[0]).run();
    return { hours, stalled: true, open: openIds[0], updated: true, priority: prio };
  }
  await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) SELECT ?1, ?2, 'personal-companion', 'reliability', ?5, 'open', ?3, ?3 WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE status='open' AND title LIKE ?4)").bind(title, desc, now, STALL_TITLE + ":%", prio).run();
  return { hours, stalled: true, filed: true, priority: prio };
}
__name(companionStallDetector, "companionStallDetector");
var worker_default = {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
    var u = new URL(request.url);
    var p = u.pathname;
    if (p === "/api/wellbeing" || p.startsWith("/wb/")) {
      var wbRes = null;
      try {
        wbRes = await handleWellbeing(request, env, { send: wellbeingSend });
      } catch (eWbH) {
        console.error("wellbeing-route:", String(eWbH && eWbH.stack || eWbH));
        return json({ ok: false, error: { message: String(eWbH && eWbH.message || eWbH) } }, 500);
      }
      if (wbRes) return wbRes;
    }
    if (request.method === "OPTIONS") return json({ ok: true });
    if (p === "/health") {
      var n = 0, last = null, acc = null;
      try {
        await ensureAccuracySchema(env);
        var r = await env.PERSONAL.prepare("SELECT COUNT(*) n FROM companion_pieces WHERE " + VISIBLE_SQL).all();
        n = ((r.results || [])[0] || {}).n || 0;
        var r2 = await env.PERSONAL.prepare("SELECT slug, title, form, day FROM companion_pieces WHERE " + VISIBLE_SQL + " ORDER BY id DESC LIMIT 1").all();
        last = (r2.results || [])[0] || null;
        var r3 = await env.PERSONAL.prepare("SELECT (SELECT COUNT(*) FROM companion_audits WHERE verdict = 'pass') passed, (SELECT COUNT(*) FROM companion_retractions) retracted, (SELECT COUNT(*) FROM companion_pieces WHERE slug NOT IN (SELECT slug FROM companion_audits) AND slug NOT IN (SELECT slug FROM companion_retractions)) unaudited").first();
        acc = r3 || null;
      } catch (e) {
        logCaught("fetch", e);
      }
      return json({ ok: true, version: VERSION, capabilities: ["companion-writing", "morning-brief", "subscriber-feed", "feedback", "owner-prompts", "accuracy-verify", "retractions"], limitations: ["every route except /health needs the companion key (?k=)", "writes at most 5 pieces a day, only at the generation hours (UTC) listed here", "the writer is DeepSeek via the personal plane's own key (BYOK), outside the qnfo AI router", "a piece is shown and mailed only after a deterministic grounding check and a two-family fact-check against its source material; if either is unavailable nothing is published (COMPANION-VERIFY-1)", "the morning brief goes only to the owner's address", "the morning brief and owner questions bypass email_suppression by design; the owner stops them with one row: UPDATE calendar_meta SET v='0' WHERE k='owner_notice_enabled' (qnfo-audit; INSERT it if absent; 0/off/false/no stops, anything else or no row means on)", "an unsent brief claim older than 90 minutes is retried hourly between 08:00 and 12:00 Amsterdam; an owner question whose worker died mid-send is retried after 6 hours, so a very rare duplicate is possible"], pieces: n, last, rhythm: RHYTHM, writer: WRITER_MODEL, writer_essay: WRITER_MODEL_ESSAY, topics: "live (Wikipedia, arXiv)", accuracy: acc, gen_hours_utc: GEN_HOURS_UTC, max_per_day: MAX_PIECES_PER_DAY, models: MODELS });
    }
    if (!authorized(request, env)) {
      return json({ error: { message: "unauthorized: append ?k=KEY" } }, 401);
    }
    if (p === "/api/ping") {
      var ping = {};
      for (var pi = 0; pi < MODELS.length; pi++) {
        var t0p = Date.now();
        try {
          var rp = await aiRunAttr(env, "personal-companion", "probe-ping", MODELS[pi], { messages: [{ role: "user", content: "Reply with the single word: ready" }], max_tokens: 16 }, { gateway: { id: "default" }, signal: AbortSignal.timeout(3e4) });
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
          var rq = await aiRunAttr(env, "personal-companion", "probe-gen", cand[ci], {
            messages: [
              { role: "system", content: "Write plain scholarly prose. No filler, no emojis, no meta-commentary." },
              { role: "user", content: "Write three short paragraphs, about 250 words total, summarising the text that follows in plain prose. Text: The probe checks only that the model returns prose within the token budget." }
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
    if (p === "/api/f" || p === "/api/feedback") {
      var slug = u.searchParams.get("slug") || "";
      var sig = u.searchParams.get("s") || u.searchParams.get("signal") || "";
      if (slug && sig) {
        try {
          await env.PERSONAL.prepare("INSERT INTO companion_feedback(slug, signal, note, created_at) VALUES(?,?,?,?)").bind(slug, sig.slice(0, 40), (u.searchParams.get("note") || "").slice(0, 500), nowIso()).run();
        } catch (e) {
          logCaught("fetch", e);
        }
      }
      return Response.redirect(new URL("/p/" + slug + (u.searchParams.get("k") ? "?k=" + u.searchParams.get("k") : ""), u.origin).toString(), 302);
    }
    if (p === "/api/pieces") {
      await ensureSchema(env);
      var lim = Number(u.searchParams.get("limit")) || 30;
      var f2 = u.searchParams.get("form") || "";
      var sql = f2 ? "SELECT slug, form, title, subtitle, lede, word_count, day, created_at, anchor_json, quality_json FROM companion_pieces WHERE form = ? AND " + VISIBLE_SQL + " ORDER BY id DESC LIMIT ?" : "SELECT slug, form, title, subtitle, lede, word_count, day, created_at, anchor_json, quality_json FROM companion_pieces WHERE " + VISIBLE_SQL + " ORDER BY id DESC LIMIT ?";
      var st = f2 ? env.PERSONAL.prepare(sql).bind(f2, lim) : env.PERSONAL.prepare(sql).bind(lim);
      var rr = await st.all();
      return json({ ok: true, count: (rr.results || []).length, pieces: rr.results || [] });
    }
    if (p.indexOf("/api/piece/") === 0) {
      await ensureSchema(env);
      var s3 = p.slice(11);
      var q3 = await env.PERSONAL.prepare("SELECT * FROM companion_pieces WHERE slug = ? AND " + VISIBLE_SQL).bind(s3).all();
      var row3 = (q3.results || [])[0];
      if (!row3) return json({ error: { message: "not found" } }, 404);
      return json({ ok: true, piece: row3 });
    }
    if (p === "/api/retractions" || p === "/retractions") {
      await ensureSchema(env);
      var rq = await env.PERSONAL.prepare("SELECT r.slug, r.reason, r.claims_json, r.retracted_at, p.title FROM companion_retractions r LEFT JOIN companion_pieces p ON p.slug = r.slug ORDER BY r.retracted_at DESC LIMIT 200").all();
      if (p === "/api/retractions") return json({ ok: true, count: (rq.results || []).length, retractions: rq.results || [] });
      return html(renderRetractions(rq.results || [], env.COMPANION_KEY && u.searchParams.get("k") ? "?k=" + u.searchParams.get("k") : ""));
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
              logCaught("fetch", e);
            }
          }
        })().catch(function(eLog) {
          logCaught("fetch", eLog);
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
      await ensureSchema(env);
      var filter = u.searchParams.get("form") || "";
      var sql2 = filter ? "SELECT slug, form, title, lede, word_count, day FROM companion_pieces WHERE form = ? AND " + VISIBLE_SQL + " ORDER BY id DESC LIMIT 200" : "SELECT slug, form, title, lede, word_count, day FROM companion_pieces WHERE " + VISIBLE_SQL + " ORDER BY id DESC LIMIT 200";
      var st2 = filter ? env.PERSONAL.prepare(sql2).bind(filter) : env.PERSONAL.prepare(sql2);
      var rows = await st2.all();
      var res = html(renderIndex(rows.results || [], keyQS, filter));
      if (cookie) res.headers.set("Set-Cookie", cookie);
      return res;
    }
    if (p.indexOf("/p/") === 0) {
      var s = p.slice(3);
      await ensureSchema(env);
      var rt = await env.PERSONAL.prepare("SELECT r.reason, r.claims_json, r.retracted_at, p.title FROM companion_retractions r LEFT JOIN companion_pieces p ON p.slug = r.slug WHERE r.slug = ?").bind(s).first();
      if (rt) return new Response(renderRetraction(rt, { title: rt.title }, keyQS), { status: 410, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      var q = await env.PERSONAL.prepare("SELECT * FROM companion_pieces WHERE slug = ? AND " + VISIBLE_SQL).bind(s).all();
      var row = (q.results || [])[0];
      if (!row) return html(page2("Not found", shell("<p>No such piece, or it has not passed the accuracy check.</p>")), 404);
      var res2 = html(renderPiece(row, keyQS));
      if (cookie) res2.headers.set("Set-Cookie", cookie);
      return res2;
    }
    return json({ error: { message: "not found", version: VERSION } }, 404);
  },
  async scheduled(event, env, ctx) {
    return cronTickDispatch(event, async function(event2) {
      if (event2.cron === "0 21 * * *") {
        ctx.waitUntil(sendDigest(env).catch(function(eLog) {
          logCaught("scheduled", eLog);
        }));
        return;
      }
      ctx.waitUntil((async function() {
        var hbOk = 1;
        try {
          await resumeSendRuns(env);
        } catch (eR) {
          console.log("resumeSendRuns: " + String(eR && eR.message || eR));
        }
        try {
          await ensureSchema(env);
          var _au = await auditPublished(env, 40);
          if (_au && (_au.retracted || _au.withdrawn || _au.deferred)) console.log("accuracy-audit: " + JSON.stringify(_au));
        } catch (eAu) {
          console.error("accuracy-audit:", String(eAu && eAu.message || eAu));
        }
        try {
          var nowUtc = /* @__PURE__ */ new Date();
          var utcHour = nowUtc.getUTCHours();
          var isGenHour = GEN_HOURS_UTC.indexOf(utcHour) >= 0;
          var retryBlocked = !isGenHour && (await blockedRetryDue(env) || await starvedRetryDue(env));
          var genHold = isGenHour || retryBlocked ? await generationHold(env) : null;
          if (genHold) await logRun(env, "steward", "", "steward", "held", "generation held: ops_config companion_generation = " + genHold.value + (genHold.note ? " (" + genHold.note + ")" : ""), 0);
          if ((isGenHour || retryBlocked) && !genHold) {
            var day = amsDayKey(nowUtc);
            var dayCount = await env.PERSONAL.prepare(
              "SELECT COUNT(*) n FROM companion_pieces WHERE day = ?"
            ).bind(day).all();
            var todayN = ((dayCount.results || [])[0] || {}).n || 0;
            if (todayN < await readingQuota(env)) {
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
                  logCaught("scheduled", e);
                }
              }
            }
          }
          await steward(env);
          await mirrorPipeline(env);
          try {
            await companionStallDetector(env);
          } catch (eSt) {
            console.error("stall-detector:", String(eSt && eSt.message || eSt));
          }
          if (utcHour >= 6) await sendMorningBrief(env);
          try {
            var _wb = await wellbeingTick(env, { send: wellbeingSend });
            if (_wb && (_wb.sent || _wb.skipped || _wb.drift)) console.log("wellbeing-tick: " + JSON.stringify(_wb));
          } catch (eWb) {
            console.error("wellbeing-tick:", String(eWb && eWb.message || eWb));
          }
          try {
            var _lf = await queueLedgerFollowUp(env);
            if (_lf.error) console.error("ledger-followup:", _lf.error);
          } catch (eLf) {
            console.error("ledger-followup:", String(eLf && eLf.message || eLf));
          }
          try {
            var _cm = await refreshConnectionMetrics(env);
            if (_cm.error) console.error("connection-metrics:", _cm.error);
          } catch (eCm) {
            console.error("connection-metrics:", String(eCm && eCm.message || eCm));
          }
          try {
            var _uq = await flagUndeliverableQuestions(env);
            if (_uq.error) console.error("owner-question-undeliverable:", _uq.error);
          } catch (eUq) {
            console.error("owner-question-undeliverable:", String(eUq && eUq.message || eUq));
          }
          try {
            var _op = await deliverOwnerPrompts(env);
            if (_op.error) console.error("owner-prompts:", _op.error);
          } catch (eOp) {
            console.error("owner-prompts:", String(eOp && eOp.message || eOp));
          }
        } catch (e) {
          hbOk = 0;
          logCaught("scheduled", e);
        }
        try {
          if (env.AUDIT) await env.AUDIT.prepare("INSERT INTO fleet_heartbeat (worker, version, ts, ok) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(worker) DO UPDATE SET version=excluded.version, ts=excluded.ts, ok=excluded.ok").bind("personal-companion", VERSION, (/* @__PURE__ */ new Date()).toISOString(), hbOk).run();
        } catch (eHb) {
          logCaught("scheduled:heartbeat", eHb);
        }
      })());
      if (env.VAULT) ctx.waitUntil(VaultIndexer.run(env).catch(function(e) {
        console.error("vault-indexer:", e && e.message || e);
      }));
    });
  }
};
var VaultIndexer = /* @__PURE__ */ (function() {
  var VERSION2 = "0.1.21-folded";
  var WORKER = "personal-companion:vault-indexer";
  var MAX_LIST_PAGES = 100;
  var MAX_DOCS = 250;
  var MAX_BYTES = 262144;
  var CHUNK_SIZE = 900;
  var CHUNK_OVERLAP = 120;
  var MAX_CHUNKS = 24;
  var GET_CONCURRENCY = 16;
  var EMBED_CONCURRENCY = 3;
  var RUN_DEADLINE_MS = 2e5;
  var PATH_PREFIX = "obsidian/";
  var SKIP_PREFIXES = [".obsidian/", "releases/", "Attachments/", "Archive/", ".git/"];
  var INGEST_ROOTS = ["notes/", "Inbox/", "Projects/", "Areas/", "Resources/"];
  var MD_RE = /\.(md|markdown|mdx|txt)$/i;
  function json2(o, s) {
    return new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json" } });
  }
  __name(json2, "json");
  function basename(k) {
    var p = k.split("/");
    return p[p.length - 1] || k;
  }
  __name(basename, "basename");
  function chunkArr(a, n) {
    var o = [];
    for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
    return o;
  }
  __name(chunkArr, "chunkArr");
  function extOf(key) {
    var i = key.lastIndexOf(".");
    return i >= 0 ? key.slice(i + 1).toLowerCase() : "";
  }
  __name(extOf, "extOf");
  function sanitize(s, max) {
    return String(s || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").replace(/[\uD800-\uDFFF]/g, "").trim().slice(0, max || 800);
  }
  __name(sanitize, "sanitize");
  function chunkText(text, size, overlap) {
    size = size || CHUNK_SIZE;
    overlap = overlap || CHUNK_OVERLAP;
    var out = [];
    var clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
    var n = clean.length;
    if (n < 60) return out;
    var i = 0;
    while (i < n) {
      var end = i + size;
      if (end > n) end = n;
      else {
        var lastNl = clean.lastIndexOf("\n", end);
        if (lastNl > i + size * 0.5) end = lastNl;
        else {
          var lastSp = clean.lastIndexOf(" ", end);
          if (lastSp > i + size * 0.5) end = lastSp;
        }
      }
      var c = clean.slice(i, end).trim();
      if (c.length >= 40) out.push(c);
      if (end >= n) break;
      if (end <= i) break;
      i = end - overlap;
      if (out.length >= MAX_CHUNKS) break;
    }
    return out;
  }
  __name(chunkText, "chunkText");
  var CATEGORY_KEYWORDS = [
    ["finance", ["bank", "statement", "tax", "invoice", "receipt", "mortgage", "rent", "insurance", "salary"]],
    ["health", ["medical", "doctor", "clinic", "prescription", "vaccin", "hospital", "therapy"]],
    ["legal", ["contract", "agreement", "will", "power of attorney", "court", "lawsuit", "notary"]],
    ["housing", ["apartment", "lease", "landlord", "property", "utilities", "electricity"]],
    ["identity", ["passport", "driving license", "residence permit", "visa", "birth certificate"]],
    ["work", ["resume", "cv", "interview", "offer letter", "employment", "reference"]],
    ["travel", ["flight", "boarding", "itinerary", "hotel", "booking", "ticket"]],
    ["education", ["diploma", "transcript", "degree", "course", "university", "certificate"]],
    ["personal", ["family", "photo", "journal", "diary", "letter"]]
  ];
  function categorize(text, key) {
    var hay = (text + " " + key).toLowerCase();
    var best = "general", bestScore = 0;
    for (var i = 0; i < CATEGORY_KEYWORDS.length; i++) {
      var cat = CATEGORY_KEYWORDS[i][0], kws = CATEGORY_KEYWORDS[i][1], score = 0;
      for (var j = 0; j < kws.length; j++) if (hay.indexOf(kws[j]) >= 0) score++;
      if (score > bestScore) {
        bestScore = score;
        best = cat;
      }
    }
    return bestScore > 0 ? best : "general";
  }
  __name(categorize, "categorize");
  async function sha256hex(s) {
    var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(d.slice(0, 16))).map(function(b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }
  __name(sha256hex, "sha256hex");
  function inScope(key) {
    if (SKIP_PREFIXES.some(function(p) {
      return key.indexOf(p) === 0;
    })) return false;
    if (!MD_RE.test(key)) return false;
    return INGEST_ROOTS.some(function(p) {
      return key.indexOf(p) === 0;
    });
  }
  __name(inScope, "inScope");
  async function getFull(env, key) {
    try {
      if (!MD_RE.test(key)) return null;
      var head = await env.VAULT.head(key);
      var big = head && head.size > MAX_BYTES;
      var o = big ? await env.VAULT.get(key, { range: { offset: 0, length: MAX_BYTES } }) : await env.VAULT.get(key);
      if (!o) return null;
      return await o.text();
    } catch (e) {
      return null;
    }
  }
  __name(getFull, "getFull");
  async function run(env, cap) {
    var t0 = Date.now();
    var s = { scanned: 0, changed: 0, indexed: 0, chunks: 0, vectors: 0, skipped: 0, reconciled: 0, locked: false, errors: 0, notes: [] };
    var nowIso2 = (/* @__PURE__ */ new Date()).toISOString();
    var haveLock = false;
    try {
      await env.PERSONAL.prepare("INSERT INTO vault_indexer_lock(id,started,owner) VALUES (1,?1,?2)").bind(nowIso2, WORKER).run();
      haveLock = true;
    } catch (e) {
      var lockRow = null;
      try {
        lockRow = await env.PERSONAL.prepare("SELECT started FROM vault_indexer_lock WHERE id=1").first();
      } catch (e2) {
        logCaught("run", e2);
      }
      var age = lockRow && lockRow.started ? Date.now() - Date.parse(lockRow.started) : 1e9;
      if (age < 24e4) {
        s.locked = true;
        s.notes.push("locked");
        s.elapsedMs = Date.now() - t0;
        return s;
      }
      try {
        await env.PERSONAL.prepare("UPDATE vault_indexer_lock SET started=?1, owner=?2 WHERE id=1").bind(nowIso2, WORKER).run();
        haveLock = true;
      } catch (e3) {
        logCaught("run", e3);
      }
    }
    var reg = /* @__PURE__ */ new Map();
    try {
      var r0 = await env.PERSONAL.prepare("SELECT path,size,modified FROM files WHERE path LIKE 'obsidian/%'").all();
      (r0.results || []).forEach(function(x2) {
        reg.set(x2.path, x2.size + "|" + x2.modified);
      });
    } catch (e) {
      s.errors++;
      s.notes.push("registry-read-fail");
    }
    var all = [], cursor = void 0, pages = 0;
    do {
      var listed;
      try {
        listed = await env.VAULT.list({ cursor, limit: 1e3 });
      } catch (e) {
        s.errors++;
        s.notes.push("list-fail");
        break;
      }
      cursor = listed.truncated ? listed.cursor : void 0;
      pages++;
      var objs = listed.objects || [];
      for (var i = 0; i < objs.length; i++) {
        all.push(objs[i]);
        s.scanned++;
      }
    } while (cursor && pages < MAX_LIST_PAGES);
    var completeList = !cursor;
    var changed = [];
    var seenPaths = /* @__PURE__ */ new Set();
    for (var a = 0; a < all.length; a++) {
      var o = all[a];
      if (!inScope(o.key)) continue;
      var path = PATH_PREFIX + o.key;
      seenPaths.add(path);
      var sig = o.size + "|" + (o.uploaded ? o.uploaded.toISOString() : "");
      if (reg.get(path) === sig) continue;
      changed.push({ key: o.key, obj: o, path });
    }
    s.changed = changed.length;
    if (completeList) {
      var stale = [];
      reg.forEach(function(_v, p2) {
        if (!seenPaths.has(p2)) stale.push(p2);
      });
      var staleGroups = chunkArr(stale, 50);
      for (var dg2 = 0; dg2 < staleGroups.length; dg2++) {
        try {
          var dstmts = [];
          for (var gi = 0; gi < staleGroups[dg2].length; gi++) {
            dstmts.push(env.PERSONAL.prepare("DELETE FROM chunks WHERE path=?1").bind(staleGroups[dg2][gi]));
            dstmts.push(env.PERSONAL.prepare("DELETE FROM files WHERE path=?1").bind(staleGroups[dg2][gi]));
          }
          await env.PERSONAL.batch(dstmts);
          s.reconciled += staleGroups[dg2].length;
        } catch (e) {
          s.errors++;
        }
      }
    }
    var work = changed.slice(0, cap || MAX_DOCS);
    var texts = new Array(work.length);
    for (var b = 0; b < work.length; b += GET_CONCURRENCY) {
      var slice = work.slice(b, b + GET_CONCURRENCY);
      var ts = await Promise.all(slice.map(function(w2) {
        return getFull(env, w2.key);
      }));
      for (var j = 0; j < slice.length; j++) texts[b + j] = ts[j];
    }
    var prepared = new Array(work.length);
    for (var eb = 0; eb < work.length; eb += EMBED_CONCURRENCY) {
      if (Date.now() - t0 > RUN_DEADLINE_MS * 0.65) {
        s.notes.push("deadline-embed@" + eb);
        break;
      }
      var eslice = work.slice(eb, eb + EMBED_CONCURRENCY);
      await Promise.all(eslice.map(async function(w2, k) {
        var idx = eb + k;
        var text = texts[idx];
        if (text === null) {
          s.notes.push("null:" + String(w2.key).slice(-34));
          prepared[idx] = null;
          return;
        }
        var chs = chunkText(text);
        if (chs.length === 0) {
          prepared[idx] = { skip: true, w: w2 };
          return;
        }
        var resp = null, lastErr = "";
        for (var attempt = 0; attempt < 3 && !resp; attempt++) {
          try {
            resp = await aiRunAttr(env, "personal-companion", "embed-index", "@cf/baai/bge-base-en-v1.5", { text: chs }, { gateway: { id: "default" } });
          } catch (e) {
            lastErr = String(e && e.message || e);
            var rt = /429|1010|rate.?limit|throttl|overload|503|502|504|busy|timeout/i.test(lastErr) && !/spend limit|2045|budget|quota/i.test(lastErr);
            if (!rt && attempt >= 1) break;
            var backoff = Math.min(3e3, 400 * Math.pow(2, attempt)) + Math.floor(Math.random() * 400);
            await new Promise(function(r) {
              setTimeout(r, backoff);
            });
          }
        }
        if (!resp) {
          prepared[idx] = { error: true, msg: "embed:" + lastErr.slice(0, 90), w: w2 };
          return;
        }
        var vectors = resp && resp.data || [];
        var valid = vectors.filter(function(v) {
          return Array.isArray(v) && v.length === 768;
        }).map(function(v) {
          return v.map(function(z) {
            return Number.isFinite(z) ? z : 0;
          });
        });
        if (valid.length === 0) {
          prepared[idx] = { error: true, w: w2 };
          return;
        }
        prepared[idx] = { w: w2, chs, valid, cat: categorize(chs.join(" "), w2.key) };
      }));
    }
    for (var x = 0; x < work.length; x++) {
      if (Date.now() - t0 > RUN_DEADLINE_MS) {
        s.notes.push("deadline-acct@" + x);
        break;
      }
      var p = prepared[x];
      if (p === null) {
        s.skipped++;
        continue;
      }
      if (p.skip) {
        s.skipped++;
        try {
          var sw = p.w;
          await env.PERSONAL.prepare("INSERT INTO files (path,type,size,modified,indexed_at,chunks,title,category,wbs,qnfo_link) VALUES (?1,?2,?3,?4,?5,0,?6,'general',NULL,NULL) ON CONFLICT(path) DO UPDATE SET type=?2,size=?3,modified=?4,indexed_at=?5,chunks=0,title=?6").bind(sw.path, extOf(sw.key), sw.obj.size, sw.obj.uploaded ? sw.obj.uploaded.toISOString() : (/* @__PURE__ */ new Date()).toISOString(), (/* @__PURE__ */ new Date()).toISOString(), basename(sw.key)).run();
        } catch (e) {
          logCaught("run", e);
        }
        continue;
      }
      if (p.error) {
        s.errors++;
        if (p.msg) s.notes.push(p.msg);
        if (p.w) {
          try {
            var ew = p.w;
            var fr = await env.PERSONAL.prepare("SELECT fails,last_at FROM embed_failures WHERE path=?1").bind(ew.path).first();
            var prevAt = fr && fr.last_at ? Date.parse(fr.last_at) : 0;
            var stale = Date.now() - prevAt > 36e5;
            var nf = (fr && fr.fails && !stale ? fr.fails : 0) + 1;
            if (nf >= 3) {
              await env.PERSONAL.prepare("INSERT INTO files (path,type,size,modified,indexed_at,chunks,title,category,wbs,qnfo_link) VALUES (?1,?2,?3,?4,?5,0,?6,'embed-failed',NULL,NULL) ON CONFLICT(path) DO UPDATE SET type=?2,size=?3,modified=?4,indexed_at=?5,chunks=0,title=?6").bind(ew.path, extOf(ew.key), ew.obj.size, ew.obj.uploaded ? ew.obj.uploaded.toISOString() : (/* @__PURE__ */ new Date()).toISOString(), (/* @__PURE__ */ new Date()).toISOString(), basename(ew.key)).run();
              await env.PERSONAL.prepare("DELETE FROM embed_failures WHERE path=?1").bind(ew.path).run();
            } else {
              await env.PERSONAL.prepare("INSERT INTO embed_failures (path,fails,last_at) VALUES (?1,?2,?3) ON CONFLICT(path) DO UPDATE SET fails=?2,last_at=?3").bind(ew.path, nf, (/* @__PURE__ */ new Date()).toISOString()).run();
            }
          } catch (e) {
            logCaught("run", e);
          }
        }
        continue;
      }
      var w = p.w;
      var dg = await sha256hex(w.path);
      var vecBatch = [], chunkStmts = [];
      for (var ci = 0; ci < p.valid.length; ci++) {
        var id = dg + ":" + ci;
        vecBatch.push({ id, values: p.valid[ci], metadata: { path: w.path, type: extOf(w.key), chunk: String(ci), category: String(p.cat), modified: String(w.obj.uploaded ? w.obj.uploaded.toISOString() : ""), text: sanitize(p.chs[ci], 800) } });
        chunkStmts.push(env.PERSONAL.prepare("INSERT INTO chunks (id,path,chunk_idx,text_len) VALUES (?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET path=?2,chunk_idx=?3,text_len=?4").bind(id, w.path, ci, p.chs[ci].length));
      }
      var vzOk = false;
      for (var va = 0; va < 3 && !vzOk; va++) {
        try {
          await env.VZ.upsert(vecBatch);
          vzOk = true;
        } catch (e) {
          if (va < 2) await new Promise(function(r) {
            setTimeout(r, 300 * (va + 1));
          });
          else s.notes.push("vz-upsert:" + String(e && e.message || e).slice(0, 90));
        }
      }
      if (!vzOk) {
        s.errors++;
        continue;
      }
      s.vectors += vecBatch.length;
      s.chunks += vecBatch.length;
      try {
        await env.PERSONAL.batch(chunkStmts);
      } catch (e) {
        logCaught("run", e);
      }
      try {
        var mod = w.obj.uploaded ? w.obj.uploaded.toISOString() : (/* @__PURE__ */ new Date()).toISOString();
        await env.PERSONAL.prepare("INSERT INTO files (path,type,size,modified,indexed_at,chunks,title,category,wbs,qnfo_link) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,NULL,NULL) ON CONFLICT(path) DO UPDATE SET type=?2,size=?3,modified=?4,indexed_at=?5,chunks=?6,title=?7,category=?8").bind(w.path, extOf(w.key), w.obj.size, mod, (/* @__PURE__ */ new Date()).toISOString(), p.valid.length, basename(w.key), p.cat).run();
        s.indexed++;
      } catch (e) {
        s.errors++;
      }
    }
    try {
      await env.PERSONAL.prepare("INSERT INTO vault_indexer_runs (started,finished,scanned,changed,indexed,chunks,skipped,reconciled,errors,notes) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)").bind(new Date(t0).toISOString(), (/* @__PURE__ */ new Date()).toISOString(), s.scanned, s.changed, s.indexed, s.chunks, s.skipped, s.reconciled, s.errors, JSON.stringify((s.notes || []).slice(0, 50))).run();
    } catch (e) {
      logCaught("run", e);
    }
    if (haveLock) {
      try {
        await env.PERSONAL.prepare("DELETE FROM vault_indexer_lock WHERE id=1").run();
      } catch (e) {
        logCaught("run", e);
      }
    }
    var selfreport = "folded:personal-companion";
    try {
      await env.VAULT.put("_meta/vault-indexer.status.json", JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), scanned: s.scanned, changed: s.changed, indexed: s.indexed, chunks: s.chunks, reconciled: s.reconciled, errors: s.errors, selfreport }), { httpMetadata: { contentType: "application/json" } });
    } catch (e) {
      logCaught("run", e);
    }
    s.elapsedMs = Date.now() - t0;
    return s;
  }
  __name(run, "run");
  return { run, VERSION: VERSION2 };
})();
var PROMPT_DAILY_CAP = 2;
var PROMPT_MAX_ATTEMPTS = 5;
var PROMPT_OWNER = "rwnquni@outlook.com";
function promptQuietHour(ms) {
  var h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", hour12: false }).format(new Date(ms)));
  return h >= 22 || h < 8;
}
__name(promptQuietHour, "promptQuietHour");
async function ownerNoticeEnabled(env) {
  try {
    if (!env.AUDIT) return true;
    var r = await env.AUDIT.prepare("SELECT v FROM calendar_meta WHERE k = 'owner_notice_enabled'").first();
    if (!r || r.v == null) return true;
    return ["0", "off", "false", "no", "disabled"].indexOf(String(r.v).trim().toLowerCase()) < 0;
  } catch (e) {
    return true;
  }
}
__name(ownerNoticeEnabled, "ownerNoticeEnabled");
async function ensureColumns(db, table, cols) {
  var info = await db.prepare("PRAGMA table_info(" + table + ")").all();
  var have = {};
  (info && info.results || []).forEach(function(c) {
    have[c.name] = 1;
  });
  for (var name in cols) {
    if (have[name]) continue;
    try {
      await db.prepare("ALTER TABLE " + table + " ADD COLUMN " + name + " " + cols[name]).run();
    } catch (e) {
      if (!/duplicate column/i.test(String(e && e.message || e))) throw e;
    }
  }
}
__name(ensureColumns, "ensureColumns");
function amsMidnightUtcMs(ms) {
  var day = amsDayKey(new Date(ms));
  var base = (/* @__PURE__ */ new Date(day + "T00:00:00Z")).getTime();
  for (var off = 2; off >= 1; off--) {
    var t = base - off * 36e5;
    if (amsDayKey(new Date(t)) === day && amsDayKey(new Date(t - 6e4)) !== day) return t;
  }
  return base - 2 * 36e5;
}
__name(amsMidnightUtcMs, "amsMidnightUtcMs");
function sqlStamp(ms) {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}
__name(sqlStamp, "sqlStamp");
var PROMPT_CLAIM_STALE_MS = 120 * 6e4;
var BRIEF_RETRY_AFTER_MS = 90 * 6e4;
async function sendOwnerNotice(env, subject, text) {
  if (!env.SEND_EMAIL && !env.EMAIL) return { ok: false, error: "no mail binding" };
  if (!await ownerNoticeEnabled(env)) return { ok: false, disabled: true, error: "owner notices disabled (calendar_meta owner_notice_enabled)" };
  subject = String(subject == null ? "" : subject).replace(/[\r\n]+/g, " ").slice(0, 200);
  text = String(text == null ? "" : text).slice(0, 2e4);
  try {
    if (env.SEND_EMAIL) {
      await env.SEND_EMAIL.send({ to: PROMPT_OWNER, from: "rowan.quni@qnfo.org", subject, text });
      return { ok: true, via: "send_email" };
    }
    var resp = await env.EMAIL.fetch("https://email.internal/send", {
      method: "POST",
      // EMAIL-CALLER-PROPS-1 (#1923): qnfo-email 2.5.1+ authenticates this binding by its props (wrangler.toml); no key copy.
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: PROMPT_OWNER, from: "rowan.quni@qnfo.org", subject, body: text, handoff: true })
    });
    if (!resp.ok) return { ok: false, error: "email " + resp.status + " " + String(await resp.text().catch(function() {
      return "";
    })).slice(0, 200) };
    return { ok: true, via: "email" };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e).slice(0, 240) };
  }
}
__name(sendOwnerNotice, "sendOwnerNotice");
function wellbeingSend(env, to, subject, body) {
  return sendOwnerNotice(env, subject, body);
}
__name(wellbeingSend, "wellbeingSend");
async function deliverOwnerPrompts(env, nowMs) {
  var out = { sent: 0, skipped: "", error: null };
  if (!env.AUDIT) {
    out.skipped = "no AUDIT binding";
    return out;
  }
  if (!env.SEND_EMAIL && !env.EMAIL) {
    out.skipped = "no mail binding";
    return out;
  }
  nowMs = nowMs || Date.now();
  try {
    if (!await ownerNoticeEnabled(env)) {
      out.skipped = "owner notices disabled";
      return out;
    }
    await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS owner_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref TEXT, subject TEXT NOT NULL, body TEXT NOT NULL, priority INTEGER DEFAULT 5, not_before TEXT, created_at TEXT DEFAULT (datetime('now')), sent_at TEXT, attempts INTEGER DEFAULT 0, last_error TEXT, UNIQUE(kind, ref))").run();
    await ensureColumns(env.AUDIT, "owner_questions", { claimed_at: "TEXT", flagged_at: "TEXT" });
    if (promptQuietHour(nowMs)) {
      out.skipped = "quiet hours";
      return out;
    }
    var nowStr = sqlStamp(nowMs);
    var cnt = await env.AUDIT.prepare("SELECT count(*) n FROM owner_questions WHERE sent_at >= ?1").bind(sqlStamp(amsMidnightUtcMs(nowMs))).first();
    if (cnt && cnt.n >= PROMPT_DAILY_CAP) {
      out.skipped = "daily cap";
      return out;
    }
    var staleStr = sqlStamp(nowMs - PROMPT_CLAIM_STALE_MS);
    var row = await env.AUDIT.prepare("SELECT id, subject, body FROM owner_questions WHERE sent_at IS NULL AND attempts < ?1 AND (not_before IS NULL OR not_before <= ?2) AND (claimed_at IS NULL OR claimed_at <= ?3) ORDER BY priority, id LIMIT 1").bind(PROMPT_MAX_ATTEMPTS, nowStr, staleStr).first();
    if (!row) {
      out.skipped = "queue empty";
      return out;
    }
    var claim = await env.AUDIT.prepare("UPDATE owner_questions SET claimed_at = ?2, attempts = attempts + 1 WHERE id = ?1 AND sent_at IS NULL AND (claimed_at IS NULL OR claimed_at <= ?3)").bind(row.id, nowStr, staleStr).run();
    if (!claim || !claim.meta || !claim.meta.changes) {
      out.skipped = "claimed elsewhere";
      return out;
    }
    var nr;
    try {
      nr = await sendOwnerNotice(env, row.subject, row.body);
    } catch (eSend) {
      nr = { ok: false, error: String(eSend && eSend.message || eSend).slice(0, 240) };
    }
    if (!nr || !nr.ok) {
      var err = nr && nr.error || "send failed";
      await env.AUDIT.prepare("UPDATE owner_questions SET claimed_at = NULL, last_error = ?2 WHERE id = ?1").bind(row.id, err).run();
      out.error = err;
    } else {
      out.sent = 1;
      var marked = false;
      for (var t = 0; t < 2 && !marked; t++) {
        try {
          await env.AUDIT.prepare("UPDATE owner_questions SET sent_at = ?2, last_error = NULL WHERE id = ?1").bind(row.id, nowStr).run();
          marked = true;
        } catch (eMark) {
          out.error = "sent but sent_at not recorded: " + String(eMark && eMark.message || eMark).slice(0, 160);
        }
      }
      if (marked) out.error = null;
    }
  } catch (e) {
    out.error = String(e && e.message || e).slice(0, 240);
  }
  return out;
}
__name(deliverOwnerPrompts, "deliverOwnerPrompts");
function isoWeekKey(ms) {
  var d = new Date(ms);
  d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  var dn = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dn);
  var y = d.getUTCFullYear();
  var wk = Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return y + "-W" + (wk < 10 ? "0" : "") + wk;
}
__name(isoWeekKey, "isoWeekKey");
function ledgerText(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
__name(ledgerText, "ledgerText");
var OWNER_QUESTIONS_DDL = "CREATE TABLE IF NOT EXISTS owner_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref TEXT, subject TEXT NOT NULL, body TEXT NOT NULL, priority INTEGER DEFAULT 5, not_before TEXT, created_at TEXT DEFAULT (datetime('now')), sent_at TEXT, attempts INTEGER DEFAULT 0, last_error TEXT, UNIQUE(kind, ref))";
async function queueLedgerFollowUp(env, nowMs) {
  var out = { queued: 0, skipped: "", error: null };
  if (!env.AUDIT || !env.PERSONAL) {
    out.skipped = "no binding";
    return out;
  }
  nowMs = nowMs || Date.now();
  try {
    await env.AUDIT.prepare(OWNER_QUESTIONS_DDL).run();
    var day = amsDayKey(new Date(nowMs));
    var startUtc = sqlStamp(amsMidnightUtcMs(nowMs));
    var cnt = await env.AUDIT.prepare("SELECT count(*) n FROM owner_questions WHERE kind = 'follow-up' AND created_at >= ?1").bind(startUtc).first();
    if (cnt && cnt.n >= 1) {
      out.skipped = "daily cap";
      return out;
    }
    var due = await env.PERSONAL.prepare("SELECT id, name, met_where, days_since FROM v_ledger_due LIMIT 10").all();
    var rows = due && due.results || [];
    if (!rows.length) {
      out.skipped = "nobody due";
      return out;
    }
    var wk = isoWeekKey(nowMs);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var name = ledgerText(r.name, 80);
      if (!name) continue;
      var where = ledgerText(r.met_where, 80);
      var draft = "Hi " + name + (where ? ", good to meet you at " + where + ". " : ", it was good to see you. ") + "Want to get a coffee sometime?";
      var body = "It has been " + (Number(r.days_since) || 0) + " days since you last had contact with " + name + ". A draft you can copy:" + NL + NL + draft + NL + NL + "Replying here is not needed.";
      var res = await env.AUDIT.prepare("INSERT OR IGNORE INTO owner_questions (kind, ref, subject, body, priority) VALUES ('follow-up', ?1, ?2, ?3, 4)").bind(String(r.id) + "-" + wk, "Message " + name + "?", body).run();
      if (res && res.meta && res.meta.changes > 0) {
        out.queued = 1;
        break;
      }
    }
    if (!out.queued) out.skipped = "already asked this week";
  } catch (e) {
    out.error = String(e && e.message || e).slice(0, 240);
  }
  return out;
}
__name(queueLedgerFollowUp, "queueLedgerFollowUp");
var ANSWER_RATE_SQL = "SELECT COUNT(*) sent, SUM(CASE WHEN EXISTS (SELECT 1 FROM calendar_feedback f WHERE f.cal_id = CAST(q.ref AS INTEGER) AND f.ts >= q.sent_at AND f.ts <= datetime(q.sent_at, '+48 hours')) THEN 1 ELSE 0 END) answered FROM owner_questions q WHERE q.kind = 'after-event' AND q.sent_at IS NOT NULL AND q.sent_at >= datetime('now', '-14 days')";
async function refreshConnectionMetrics(env) {
  var out = { seen_twice: null, answer_rate: null, error: null };
  if (!env.AUDIT) return out;
  var stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19) + "Z";
  try {
    if (env.PERSONAL) {
      var st = await env.PERSONAL.prepare("SELECT seen_twice FROM v_ledger_seen_twice").first();
      if (st && st.seen_twice != null) {
        out.seen_twice = Number(st.seen_twice);
        await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3 WHERE metric = ?1").bind("ledger_people_seen_twice", String(out.seen_twice), stamp).run();
      }
    }
    var ar = await env.AUDIT.prepare(ANSWER_RATE_SQL).first();
    var sent = ar ? Number(ar.sent) || 0 : 0;
    if (sent >= 6) out.answer_rate = Math.round(1e3 * (Number(ar.answered) || 0) / sent) / 1e3;
    await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3 WHERE metric = ?1").bind("owner_question_answer_rate_14d", out.answer_rate == null ? "n/a" : String(out.answer_rate), stamp).run();
  } catch (e) {
    out.error = String(e && e.message || e).slice(0, 240);
  }
  return out;
}
__name(refreshConnectionMetrics, "refreshConnectionMetrics");
async function flagUndeliverableQuestions(env) {
  var out = { filed: 0 };
  try {
    if (!env.AUDIT) return out;
    await ensureColumns(env.AUDIT, "owner_questions", { claimed_at: "TEXT", flagged_at: "TEXT" });
    var rows = await env.AUDIT.prepare("SELECT id, subject, attempts, last_error FROM owner_questions WHERE attempts >= ?1 AND sent_at IS NULL AND flagged_at IS NULL ORDER BY id LIMIT 10").bind(PROMPT_MAX_ATTEMPTS).all();
    var list = rows && rows.results || [];
    for (var i = 0; i < list.length; i++) {
      var q = list[i], title = "OWNER-QUESTION-UNDELIVERABLE-1: " + q.subject;
      var open = await env.AUDIT.prepare("SELECT id FROM agent_issues WHERE title = ?1 AND status = 'open' LIMIT 1").bind(title).first();
      var now = Date.now();
      if (open) {
        await env.AUDIT.prepare("UPDATE owner_questions SET flagged_at = ?2 WHERE id = ?1").bind(q.id, sqlStamp(now)).run();
        continue;
      }
      var desc = "owner_questions id " + q.id + " has " + q.attempts + " failed delivery attempts and was never sent. last_error: " + String(q.last_error || "none").slice(0, 200) + ". Charter pillar: personal. Fix the send path (sendOwnerNotice / SEND_EMAIL), then reset attempts to 0 so the hourly tick resends it.";
      await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1, ?2, 'personal-companion', 'personal', 'medium', 'open', ?3, ?3)").bind(title, desc, now).run();
      await env.AUDIT.prepare("UPDATE owner_questions SET flagged_at = ?2 WHERE id = ?1").bind(q.id, sqlStamp(now)).run();
      out.filed++;
    }
  } catch (e) {
    out.error = String(e && e.message || e).slice(0, 240);
  }
  return out;
}
__name(flagUndeliverableQuestions, "flagUndeliverableQuestions");
__name2(flagUndeliverableQuestions, "flagUndeliverableQuestions");
async function sendMorningBrief(env, nowMs) {
  try {
    nowMs = nowMs || Date.now();
    if (!await ownerNoticeEnabled(env)) return { ok: true, skipped: "owner notices disabled" };
    await env.PERSONAL.prepare("CREATE TABLE IF NOT EXISTS companion_morning_brief (date TEXT PRIMARY KEY, sent_at TEXT NOT NULL)").run();
    await ensureColumns(env.PERSONAL, "companion_morning_brief", { claimed_at: "TEXT", sent: "INTEGER DEFAULT 1" });
    var day = amsDayKey(new Date(nowMs));
    var already = await env.PERSONAL.prepare("SELECT date, sent, claimed_at, sent_at FROM companion_morning_brief WHERE date = ?").bind(day).first();
    var retryFrom = null;
    if (already) {
      if (already.sent !== 0) return { ok: true, skipped: "already sent" };
      var cl = Date.parse(already.claimed_at || already.sent_at);
      if (!(nowMs - cl >= BRIEF_RETRY_AFTER_MS)) return { ok: true, skipped: "claim in flight" };
      var hr = Number(amsParts(new Date(nowMs)).hour);
      if (!(hr >= 8 && hr < 12)) return { ok: true, skipped: "retry window closed" };
      retryFrom = already.claimed_at || already.sent_at;
    }
    var br = await env.PERSONAL.prepare("SELECT payload FROM daily_briefs WHERE date = ?").bind(day).first();
    if (!br || !br.payload) return { ok: true, skipped: "no brief yet" };
    var b = null;
    try {
      b = JSON.parse(br.payload);
    } catch (e2) {
      return { ok: false, error: "parse" };
    }
    if (!b) return { ok: true, skipped: "empty" };
    var L2 = [];
    L2.push("Morning - " + day);
    L2.push("");
    if (b.weather && b.weather.text) L2.push("Weather: " + b.weather.text);
    var today = b.calendar && b.calendar.today || [];
    L2.push("");
    if (today.length) {
      L2.push("Today:");
      for (var i = 0; i < today.length; i++) {
        var e = today[i];
        L2.push("- " + (e.title || "") + (e.location ? " @ " + e.location : "") + (e.dtstart ? " (" + String(e.dtstart).slice(0, 10) + ")" : ""));
      }
    } else {
      L2.push("Today: nothing scheduled.");
    }
    var tasks = b.open && b.open.tasks || [];
    if (tasks.length) {
      L2.push("");
      L2.push("Open tasks:");
      for (var j = 0; j < tasks.length; j++) L2.push("- " + (tasks[j].title || ""));
    }
    var up = b.calendar && b.calendar.upcoming7 || [];
    var ups = [];
    for (var k = 0; k < up.length && k < 6; k++) {
      var u = up[k];
      if (today.length && u && u.id && today[0].id === u.id) continue;
      ups.push("- " + (u.title || "") + (u.location ? " @ " + u.location : "") + (u.dtstart ? " (" + String(u.dtstart).slice(0, 10) + ")" : ""));
    }
    if (ups.length) {
      L2.push("");
      L2.push("Coming up:");
      for (var m = 0; m < ups.length; m++) L2.push(ups[m]);
    }
    L2.push("");
    try {
      var _ft = env.AUDIT ? await env.AUDIT.prepare("SELECT v FROM calendar_meta WHERE k='ics_token_personal'").first() : null;
      if (_ft && _ft.v) L2.push("Calendar feed: https://pub-7e5e6cd48f4b43ebb55a5ee25093cb71.r2.dev/calendar/personal-" + _ft.v + ".ics");
    } catch (eFeed) {
      logCaught("sendMorningBrief", eFeed);
    }
    try {
      if (env.AUDIT) {
        var qs;
        try {
          qs = await env.AUDIT.prepare("SELECT q.subject, q.sent_at FROM owner_questions q WHERE (q.sent_at IS NULL OR q.sent_at >= datetime('now','-2 days')) AND NOT (q.kind = 'after-event' AND EXISTS (SELECT 1 FROM calendar_feedback f WHERE f.cal_id = CAST(q.ref AS INTEGER))) ORDER BY q.sent_at IS NOT NULL, q.priority, q.id LIMIT 5").all();
        } catch (eFb) {
          qs = await env.AUDIT.prepare("SELECT subject, sent_at FROM owner_questions WHERE sent_at IS NULL OR sent_at >= datetime('now','-2 days') ORDER BY sent_at IS NOT NULL, priority, id LIMIT 5").all();
        }
        var qr = qs && qs.results || [];
        if (qr.length) {
          L2.push("");
          L2.push("Questions waiting:");
          for (var qi = 0; qi < qr.length; qi++) L2.push("- " + qr[qi].subject + (qr[qi].sent_at ? " (sent)" : " (queued)"));
        }
      }
    } catch (eQ) {
      logCaught("sendMorningBrief", eQ);
    }
    try {
      var _wbL = await briefCheckinLines(env);
      if (_wbL && _wbL.length) {
        for (var _wl = 0; _wl < _wbL.length; _wl++) L2.push(_wbL[_wl]);
      }
    } catch (eWbL) {
      logCaught("sendMorningBrief", eWbL);
    }
    var body = L2.join(NL);
    var stamp = new Date(nowMs).toISOString();
    var claim = retryFrom ? await env.PERSONAL.prepare("UPDATE companion_morning_brief SET claimed_at = ?2, sent_at = ?2 WHERE date = ?1 AND sent = 0 AND COALESCE(claimed_at, sent_at) = ?3").bind(day, stamp, retryFrom).run() : await env.PERSONAL.prepare("INSERT OR IGNORE INTO companion_morning_brief (date, sent_at, claimed_at, sent) VALUES (?, ?, ?, 0)").bind(day, stamp, stamp).run();
    if (!claim || !claim.meta || !claim.meta.changes) return { ok: true, skipped: "already sent" };
    var r;
    try {
      r = await sendOwnerNotice(env, "Morning - " + day, body);
    } catch (eSend) {
      r = { ok: false, error: String(eSend && eSend.message || eSend) };
    }
    if (!r || !r.ok) {
      try {
        await env.PERSONAL.prepare("DELETE FROM companion_morning_brief WHERE date = ? AND sent = 0").bind(day).run();
      } catch (eRel) {
        console.error("morning-brief claim release:", String(eRel && eRel.message || eRel));
      }
    } else {
      for (var mt = 0; mt < 2; mt++) {
        try {
          await env.PERSONAL.prepare("UPDATE companion_morning_brief SET sent = 1 WHERE date = ?").bind(day).run();
          break;
        } catch (eMk) {
          console.error("morning-brief sent mark:", String(eMk && eMk.message || eMk));
        }
      }
      try {
        await noteCheckinInBrief(env);
      } catch (eWbN) {
        logCaught("sendMorningBrief", eWbN);
      }
    }
    return r;
  } catch (e2) {
    return { ok: false, error: String(e2 && e2.message || e2) };
  }
}
__name(sendMorningBrief, "sendMorningBrief");
__name2(sendMorningBrief, "sendMorningBrief");
async function blockedRetryDue(env) {
  try {
    var r = await env.PERSONAL.prepare("SELECT status FROM companion_runs WHERE status IN ('ok','failed','blocked','error') AND form <> 'steward' ORDER BY id DESC LIMIT 1").first();
    return !!(r && r.status === "blocked");
  } catch (e) {
    return false;
  }
}
__name(blockedRetryDue, "blockedRetryDue");
var STARVED_RETRY_MIN_MS = 40 * 6e4;
var STARVED_RETRY_MAX_24H = 24;
var STARVED_RETRY_QUIET_MS = 10 * 6e4;
var GEN_HOLD_VALUES = ["hold", "held", "off", "paused", "pause", "0", "false", "no", "disabled"];
async function generationHold(env) {
  if (!env || !env.AUDIT) return null;
  try {
    var r = await env.AUDIT.prepare("SELECT value, note FROM ops_config WHERE key = 'companion_generation'").first();
    var v = String(r && r.value == null ? "" : r ? r.value : "").trim().toLowerCase();
    return v && GEN_HOLD_VALUES.indexOf(v) >= 0 ? { value: v, note: String(r.note || "").slice(0, 200) } : null;
  } catch (e) {
    console.error("COMPANION-GENERATION-HOLD-1 read failed: " + String(e && e.message || e).slice(0, 160));
    return null;
  }
}
__name(generationHold, "generationHold");
var PIPE_PROPERTY = "reading.q08.org";
var PIPE_ID_PREFIX = "cr-";
var PIPE_WORKER = "personal-companion";
function PIPE_DB(env) {
  return env.PERSONAL;
}
__name(PIPE_DB, "PIPE_DB");
function pipeSince(ms) {
  return new Date(ms).toISOString();
}
__name(pipeSince, "pipeSince");
var PIPE_SELECT = "SELECT id, run_at, form, topic, status, detail FROM companion_runs WHERE id > ?1 AND run_at >= ?2 AND status IN ('ok', 'rejected') AND form <> 'steward' ORDER BY id LIMIT ?3";
function pipeItem(r) {
  var ok = r.status === "ok";
  return {
    id: r.id,
    flow: String(r.form || "essay"),
    title: String(r.topic || "").replace(/^wiki:/, ""),
    raw: ok ? "published: " + String(r.detail || "").slice(0, 120) : "rejected: " + String(r.detail || "").slice(0, 140),
    stage: ok ? "published" : "rejected",
    state: ok ? "done" : "rejected",
    since: String(r.run_at || "")
  };
}
__name(pipeItem, "pipeItem");
var PIPE_DAYS = 7;
var PIPE_ROWS_PER_STMT = 10;
var PIPE_MAX_ROWS = 700;
async function mirrorPipeline(env) {
  if (!env.AUDIT || !PIPE_DB(env)) return { ok: false, skipped: "no binding" };
  try {
    var last = await env.AUDIT.prepare("SELECT MAX(CAST(substr(item_id, ?2) AS INTEGER)) AS m FROM content_external_items WHERE property = ?1").bind(PIPE_PROPERTY, PIPE_ID_PREFIX.length + 1).first();
    var after = Number(last && last.m) || 0;
    var rows = (await PIPE_DB(env).prepare(PIPE_SELECT).bind(after, pipeSince(Date.now() - PIPE_DAYS * 864e5), PIPE_MAX_ROWS).all()).results || [];
    var items = rows.map(pipeItem).filter(Boolean);
    var stmts = [];
    for (var i = 0; i < items.length; i += PIPE_ROWS_PER_STMT) {
      var chunk = items.slice(i, i + PIPE_ROWS_PER_STMT), vals = [], binds = [];
      chunk.forEach(function(it) {
        vals.push("(?, ?, ?, ?, ?, ?, ?, ?)");
        binds.push(PIPE_PROPERTY, it.flow, PIPE_ID_PREFIX + it.id, String(it.title || "").slice(0, 160), String(it.raw || "").slice(0, 160), it.stage, it.state, it.since);
      });
      var st = env.AUDIT.prepare("INSERT OR REPLACE INTO content_external_items (property, flow, item_id, title, raw_status, stage, state, since) VALUES " + vals.join(", "));
      stmts.push(st.bind.apply(st, binds));
    }
    stmts.push(env.AUDIT.prepare("DELETE FROM content_external_items WHERE property = ?1 AND since < ?2").bind(PIPE_PROPERTY, new Date(Date.now() - PIPE_DAYS * 864e5).toISOString()));
    await env.AUDIT.batch(stmts);
    return { ok: true, mirrored: items.length };
  } catch (e) {
    console.error(JSON.stringify({ worker: PIPE_WORKER, where: "mirrorPipeline", error: String(e && e.message || e).slice(0, 300) }));
    return { ok: false, error: String(e && e.message || e).slice(0, 200) };
  }
}
__name(mirrorPipeline, "mirrorPipeline");
async function starvedRetryDue(env) {
  try {
    var last = await env.PERSONAL.prepare("SELECT status, run_at FROM companion_runs WHERE status IN ('ok','failed','blocked','error') AND form <> 'steward' ORDER BY id DESC LIMIT 1").first();
    if (!last || last.status !== "failed" && last.status !== "error") return false;
    var busy = await env.PERSONAL.prepare("SELECT COUNT(*) n FROM companion_runs WHERE form <> 'steward' AND run_at > ?").bind(new Date(Date.now() - STARVED_RETRY_QUIET_MS).toISOString()).first();
    if (busy && Number(busy.n) > 0) return false;
    var ok = await env.PERSONAL.prepare("SELECT run_at FROM companion_runs WHERE status = 'ok' AND form <> 'steward' ORDER BY id DESC LIMIT 1").first();
    if (ok && Date.now() - new Date(ok.run_at).getTime() < 6 * 36e5) return false;
    return true;
  } catch (e) {
    return false;
  }
}
__name(starvedRetryDue, "starvedRetryDue");
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
    else if (ar !== null && a >= 8 && ar < 0.1) {
      var lt = await env.PERSONAL.prepare("SELECT status FROM companion_runs WHERE status IN ('ok','failed','rejected','blocked','error') AND form <> 'steward' ORDER BY id DESC LIMIT 1").first();
      if (!(lt && lt.status === "ok")) d = "collapse: accept rate " + Math.round(ar * 100) + "% over " + a + " attempts";
    }
    if (d) await env.PERSONAL.prepare("INSERT INTO companion_runs(run_at, form, model, topic, status, detail, ms) VALUES(?,?,?,?,?,?,?)").bind(nowIso(), "steward", "", "steward", "alert", d, 0).run();
    else {
      var la = await env.PERSONAL.prepare("SELECT status FROM companion_runs WHERE form = 'steward' ORDER BY id DESC LIMIT 1").first();
      if (la && la.status === "alert") await env.PERSONAL.prepare("INSERT INTO companion_runs(run_at, form, model, topic, status, detail, ms) VALUES(?,?,?,?,?,?,?)").bind(nowIso(), "steward", "", "steward", "resolved", "recovered: a piece was accepted" + (h === null ? "" : " " + h.toFixed(1) + "h ago"), 0).run();
    }
  } catch (e) {
    logCaught("steward", e);
  }
}
__name(steward, "steward");
__name2(steward, "steward");
__name22(steward, "steward");
__name222(steward, "steward");
var GenerationFlow = class extends WorkflowEntrypoint {
  static {
    __name(this, "GenerationFlow");
  }
  static {
    __name2(this, "GenerationFlow");
  }
  static {
    __name22(this, "GenerationFlow");
  }
  static {
    __name222(this, "GenerationFlow");
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
          logCaught("steward", e);
        }
      });
    }
    return out;
  }
};
var AI_ATTR_DB_BINDINGS = ["AUDIT_DB", "AUDIT", "DB_AUDIT", "QNFO_AUDIT"];
async function aiRunAttr(env, worker, purpose, model, input, opts) {
  var t0 = Date.now(), ok = 1;
  try {
    return await env.AI.run(model, input, opts);
  } catch (e) {
    ok = 0;
    throw e;
  } finally {
    try {
      var db = null;
      for (var bi = 0; bi < AI_ATTR_DB_BINDINGS.length && !db; bi++) db = env[AI_ATTR_DB_BINDINGS[bi]];
      if (db) {
        var ic = 0;
        try {
          ic = JSON.stringify(input && input.messages || input || "").length;
        } catch (e2) {
          console.error(JSON.stringify({ worker, where: "aiRunAttr", error: String(e2 && e2.message || e2).slice(0, 300) }));
        }
        var day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        var ms = Date.now() - t0;
        var wr = (async function() {
          await db.prepare("CREATE TABLE IF NOT EXISTS ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, PRIMARY KEY (day, worker, purpose, model))").run();
          await db.prepare("INSERT INTO ai_call_counters (day, worker, purpose, model, calls, errors, in_chars, ms) VALUES (?1,?2,?3,?4,1,?5,?6,?7) ON CONFLICT(day, worker, purpose, model) DO UPDATE SET calls=calls+1, errors=errors+?5, in_chars=in_chars+?6, ms=ms+?7").bind(day, worker, purpose, String(model), ok ? 0 : 1, ic, ms).run();
        })();
        wr.catch(function(eLog) {
          console.error(JSON.stringify({ worker, where: "aiRunAttr", error: String(eLog && eLog.message || eLog).slice(0, 300) }));
        });
      }
    } catch (e3) {
      console.error(JSON.stringify({ worker, where: "aiRunAttr", error: String(e3 && e3.message || e3).slice(0, 300) }));
    }
  }
}
__name(aiRunAttr, "aiRunAttr");
function groundingNeedles(problems) {
  var needles = [];
  (problems || []).forEach(function(p) {
    var rest = String(p).replace(/^grounding:\s*/i, "").trim();
    var q = rest.match(/"([^"]{2,})"/g);
    if (q) {
      q.forEach(function(m) {
        needles.push(m.slice(1, -1));
      });
    } else {
      var ns = rest.match(/not in the source:\s*(.+)$/);
      if (ns) needles.push(ns[1].trim());
      else {
        var sq = rest.match(/'([^']{2,})'/g);
        if (sq) sq.forEach(function(m) {
          needles.push(m.slice(1, -1));
        });
        else if (rest.length > 0 && rest.length < 120 && !/\bnot\b|\bfound\b|\bsource\b|\bunsupported\b/i.test(rest)) needles.push(rest);
      }
    }
  });
  return needles.filter(function(n, i, a) {
    return n.length > 0 && a.indexOf(n) === i;
  });
}
__name(groundingNeedles, "groundingNeedles");
var __verify = { pruneHeadings, mirrorPipeline, pipeItem, pipeSince, PIPE_SELECT, PIPE_PROPERTY, PIPE_ID_PREFIX, qualityWorst, gateWorst, criticGroundingGates, STARVED_RETRY_QUIET_MS, quotesAllSourced, sourcedPassage, sourceSentences, sourcedRereadNote, SOURCED_COVER, SENT_ABBREV_RE, GROUND_MAX, PRIMARY_SHARE, deleteSentences, rubricNoQuoteNote, quotesAllInAnalysis, rubricRereadNote, eventTitles, eventDay, fetchEventTitles, EVENT_POOL, WRITER_LEAD, CF_FALLBACK_GPT_OSS, loadWriterOrder, fallbackChain, cutAtSentence, causalScore, CAUSAL_MIN, CAUSAL_CHARS, fitAnchors, logCaught, foldAccents, todayLine, reframePiece, parseDraftMd, P_REFRAME, REFRAME_BAND, REFRAME_START_BEFORE_MS, CF_FALLBACK, pieceWords, splitText, autoMarkAnalysis, withAutoMark, analysisSplitInfo, CRITIC_INVENTED_MAX, writerBand, writerIsFallback, WRITER_TEMPERATURE_FB, CRITIC_TEMPERATURE, ANALYSIS_MARK, stripAnalysisMark, analysisSplitOk, reviewText, stripPieceMark, persistPiece, STARVED_RETRY_MAX_24H, fetchWikiIntros, introScore, screenTopics, wikiAnchors, TOPIC_POOL, pruneBlockFixable, pruneRepairFeedback, expandFeedback, rankLinked, linkMentionScore, CRITIC_PRUNE_ROUNDS, criticQuotes, critiqueWorst, QUOTE_MIN_WORDS, systemsFit, generationHold, gatherVerdicts, orderByHealth, sickReviewers, FACTCHECK_HEDGE_MS, starvedRetryDue, arxivWindow, fetchWiki, splitLongLede, stallAttemptStage, companionStallDigest, arxivIdOf, paperFullTextUrls, paperHtmlText, ledeProblems, ledeOf, pruneUnsupported, deleteSentences, splitFactItems, sourceLabel, anchorsText, floorFor, critiquePiece, REPAIR_FLOOR_SHARE, FALLBACK_FLOOR_RATIO, NOTES_OBJECTION_PLACEHOLDER, groundingNeedles, stemGrounded, repairGroundingDraft, GROUNDING_PREFIX, problemContext, factCheckExtra, blockedRetryDue, steward, fetchCfg, fetchUA, groundingProblems, parseFactVerdict, factCheck, verifyPiece, auditPublished, retractPiece, pieceVerified, recordAudit, generate, pickTopic, sendMail, pickReviewers, familyOf, anchorsBlock, prompts: { P_STYLE, P_ESSAY, P_NOTES, P_SERIAL, P_CRITIQUE, FACTCHECK_PROMPT }, VISIBLE_SQL, REVIEW_POOL };
export {
  GenerationFlow,
  __verify,
  broadcast,
  callModel,
  companionStallDetector,
  confirmedSubscribers,
  worker_default as default,
  deliverOwnerPrompts,
  expandFeedback,
  flagUndeliverableQuestions,
  isoWeekKey,
  queueLedgerFollowUp,
  refreshConnectionMetrics,
  resumeSendRuns,
  sendDigest,
  sendMorningBrief,
  sendOwnerNotice,
  suppressedSet,
  validatePiece
};
//# sourceMappingURL=worker.js.map
