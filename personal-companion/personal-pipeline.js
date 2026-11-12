// personal-companion/personal-pipeline.js: PERSONAL-PIPELINE-1 (Rowan 2026-11-12).
//
// Rowan: "How do we take ideas and possibilities and events and thoughts and feelings and moods and things and translate those into
// outcomes? ... Input, output, start to finish, end to end." The research pipeline turns an idea into a publication; this one turns
// what happens to Rowan into outcomes, on the same engine (_shared/pipeline-engine.js).
//
//   input    an event: an evening tap ("went out", "got into flow", "reached out", "something was hard"), a mood or moment tapped on
//            me.q08.org, a logged activity, or a job milestone from the job pipeline (applied, replied, interview, offer).
//   capture  one personal_events row per input, in personal-life D1 only (PERSONAL-QNFO-SEPARATION-1).
//   feel     how it landed, 1-5. Known already for a mood tap; otherwise one tap on the Today card (cmp_asks kind pp-feel), and the
//            run waits for it (Workflows step.sleep, up to 36 hours).
//   meaning  what it gave: energy, connection, ideas or calm (one more tap, only for something that went well).
//   patterns what tends to come before a better next day (personal_events joined to wellbeing_checkins, 90 days).
//   outcomes a win to count, an insight once a pattern holds 3+ times, a next step on a hard day (personal_outcomes).
//   follow   for reaching out, three days later: did it lead anywhere?
//
// Consumers (nothing here is a document): personal_outcomes -> the morning brief (briefLines) and the Today card questions;
// pipeline_runs -> /pipelines status and the hourly tick. Every question has 2-4 options plus "Not sure" (PROMPTED-RECALL-1); nothing
// asks for typing. Nothing in this file writes event content outside personal-life D1, and the status view shows counts only. GROWTH-PM-1: growthCounters
// writes three weekly counts (no label, text or answer) to qnfo-audit product_growth_counters, where the growth product manager reads them.

import * as PE from "../_shared/pipeline-engine.js";
import * as PD from "../_shared/pipeline-defs.js";

export const PP_VERSION = "1.0.0";
export const TZ = "Europe/Amsterdam";

export const KINDS = {
  outing: { label: "Went out (show, concert, event)", domain: "culture" },
  flow: { label: "Got into flow", domain: "creative" },
  reached_out: { label: "Reached out to someone", domain: "social" },
  hard_day: { label: "Something was hard", domain: "day" },
  good_day: { label: "A good day", domain: "day" },
  idea: { label: "Had an idea", domain: "creative" },
  moment: { label: "A moment", domain: "place" },
  day: { label: "How the day went", domain: "day" },
  mood: { label: "Mood", domain: "day" },
  activity: { label: "Did something", domain: "body" },
  job_applied: { label: "Applied for a job", domain: "work" },
  job_replied: { label: "An employer replied", domain: "work" },
  job_screening: { label: "A screening call", domain: "work" },
  job_interview: { label: "A job interview", domain: "work" },
  job_offer: { label: "A job offer", domain: "work" },
  job_no_reply: { label: "No reply to an application", domain: "work" }
};
export const DOMAIN = {
  culture: { label: "going out", helps: "going out to a show or an event" },
  creative: { label: "flow and ideas", helps: "time on your own ideas" },
  social: { label: "reaching out", helps: "reaching out to one person" },
  body: { label: "activity", helps: "moving your body for a bit" },
  place: { label: "getting out", helps: "getting out somewhere you like" },
  work: { label: "job search", helps: "one small step on the job search" },
  day: { label: "the day", helps: "" }
};
const ASK_MEANING = new Set(["outing", "flow", "reached_out", "good_day", "idea", "moment", "activity", "job_interview", "job_offer"]);
const NO_FEEL_ASK = new Set(["mood", "day"]); // the tap was the feeling

export const INPUT = {
  type: "object", required: ["kind", "ts", "label", "source"],
  props: {
    kind: { type: "string", enum: Object.keys(KINDS) }, ts: { type: "string", maxLength: 40 }, label: { type: "string", maxLength: 160 },
    valence: { type: "integer", min: 1, max: 5, nullable: true }, energy: { type: "integer", min: 0, max: 5, nullable: true },
    feelings: { type: "array", items: { type: "string", maxLength: 30 }, nullable: true }, source: { type: "string", maxLength: 40 }
  }
};

export const PP_DDL = [
  `CREATE TABLE IF NOT EXISTS personal_events (
     id TEXT PRIMARY KEY, ts TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, domain TEXT NOT NULL, label TEXT NOT NULL,
     valence INTEGER, energy INTEGER, feelings TEXT, gave TEXT, source TEXT NOT NULL, created_at TEXT NOT NULL)`,
  "CREATE INDEX IF NOT EXISTS personal_events_day ON personal_events(day)",
  `CREATE TABLE IF NOT EXISTS personal_outcomes (
     id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, kind TEXT NOT NULL, ref TEXT NOT NULL, text TEXT NOT NULL,
     ts TEXT NOT NULL, surfaced_at TEXT, UNIQUE(kind, ref))`,
  // same text as personal-api's DDL (the Today card reads it); IF NOT EXISTS never touches the live table
  "CREATE TABLE IF NOT EXISTS cmp_asks (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref TEXT NOT NULL, question TEXT NOT NULL, cue TEXT, options_json TEXT NOT NULL, priority INTEGER DEFAULT 5, created_at TEXT NOT NULL, answered_at TEXT, answer TEXT, answer_label TEXT, applied TEXT, UNIQUE(kind, ref))"
];

const nowIso = () => new Date().toISOString();
const clip = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
export function localDay(iso, tz = TZ) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)); }
  catch (e) { return String(iso).slice(0, 10); }
}
export function localHour(iso, tz = TZ) {
  try { return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date(iso))); }
  catch (e) { return new Date(iso).getUTCHours(); }
}
function isoWeek(day) {
  const d = new Date(String(day).slice(0, 10) + "T12:00:00Z"), dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3);
  const y = d.getUTCFullYear(), jan4 = new Date(Date.UTC(y, 0, 4));
  const wk = 1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return y + "-W" + String(wk).padStart(2, "0");
}

// 2 to 4 options, then "Not sure" (PROMPTED-RECALL-1, same rule as personal-api recallOptions).
export function askOptions(opts) {
  const o = (opts || []).filter((x) => x && x.key && x.label && x.key !== "unsure");
  if (o.length < 2 || o.length > 4) throw new Error("ask: 2 to 4 options, got " + o.length);
  return o.concat([{ key: "unsure", label: "Not sure" }]);
}
export async function putAsk(db, a, now) {
  await db.prepare("INSERT OR IGNORE INTO cmp_asks (kind, ref, question, cue, options_json, priority, created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(a.kind, a.ref, clip(a.question, 200), a.cue ? clip(a.cue, 240) : null, JSON.stringify(askOptions(a.options)), a.priority || 3, now || nowIso()).run();
}
async function askAnswer(db, kind, ref) {
  const r = await db.prepare("SELECT answer, answered_at FROM cmp_asks WHERE kind = ? AND ref = ?").bind(kind, ref).first();
  return r && r.answered_at ? r.answer : null;
}
async function expireAsk(db, kind, ref, now) {
  await db.prepare("UPDATE cmp_asks SET answered_at = ?, answer = 'expired', answer_label = 'Expired', applied = 'pipeline: no answer in time' WHERE kind = ? AND ref = ? AND answered_at IS NULL")
    .bind(now, kind, ref).run();
}

export const FEEL_OPTIONS = [{ key: "5", label: "Great" }, { key: "4", label: "Good" }, { key: "3", label: "Mixed" }, { key: "2", label: "Hard" }];
export const GAVE_OPTIONS = [{ key: "energy", label: "More energy" }, { key: "connection", label: "Connection" }, { key: "ideas", label: "Ideas" }, { key: "calm", label: "Calm" }];
export const DAY_OPTIONS = [{ key: "outing", label: "Went out (show, concert, event)" }, { key: "flow", label: "Got into flow" }, { key: "reached_out", label: "Reached out to someone" }, { key: "hard_day", label: "Something was hard" }];
export const FOLLOW_OPTIONS = [{ key: "replied", label: "Yes, they replied" }, { key: "plan", label: "We made a plan" }, { key: "not_yet", label: "Not yet" }];
const FOLLOW_AFTER_MS = 3 * 864e5;

function feelQuestion(st) {
  if (st.kind === "job_applied") return "You applied: " + clip(st.label, 120) + ". How did sending it feel?";
  if (st.kind.indexOf("job_") === 0) return clip(KINDS[st.kind].label, 60) + ": " + clip(st.label, 100) + ". How did it land?";
  return "How did it land: " + clip(st.label, 140) + "?";
}

// ------------------------------------------------------------------ stages
export function personalPipeline(E = PE) {
  return E.definePipeline({
    name: "personal", label: "Personal: what happens to how it helps", plane: "personal", version: PP_VERSION, input: INPUT,
    stages: [
      {
        key: "capture", label: "Capture", out: { type: "object", required: ["event_id", "domain"] },
        async run(st, ctx) {
          const db = ctx.env.PERSONAL, k = KINDS[st.kind], now = ctx.now();
          await db.prepare("INSERT OR IGNORE INTO personal_events (id, ts, day, kind, domain, label, valence, energy, feelings, source, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
            .bind(ctx.runId, st.ts, localDay(st.ts), st.kind, k.domain, clip(st.label, 160), st.valence == null ? null : st.valence, st.energy == null ? null : st.energy,
              st.feelings && st.feelings.length ? JSON.stringify(st.feelings) : null, st.source, now).run();
          return { out: { event_id: ctx.runId, domain: k.domain }, state: { event_id: ctx.runId, domain: k.domain } };
        }
      },
      {
        key: "feel", label: "How it felt", out: { type: "object", props: { valence: { type: "integer", min: 1, max: 5, nullable: true } } },
        async run(st, ctx) {
          if (st.valence != null) return { out: { valence: st.valence, asked: false } };
          if (NO_FEEL_ASK.has(st.kind)) return { out: { valence: null, asked: false } };
          await putAsk(ctx.env.PERSONAL, { kind: "pp-feel", ref: ctx.runId, priority: 2, question: feelQuestion(st), cue: "One tap. It shapes what the companion suggests on harder days.", options: FEEL_OPTIONS }, ctx.now());
          return { wait: true, detail: "pp-feel asked" };
        },
        wait: {
          every: "1 hour", max: 36,
          poll: (st, ctx) => askAnswer(ctx.env.PERSONAL, "pp-feel", ctx.runId),
          async resume(st, got, ctx, info) {
            if (info.timedOut) await expireAsk(ctx.env.PERSONAL, "pp-feel", ctx.runId, ctx.now());
            const v = /^[1-5]$/.test(String(got)) ? Number(got) : null;
            if (v != null) await ctx.env.PERSONAL.prepare("UPDATE personal_events SET valence = ? WHERE id = ?").bind(v, ctx.runId).run();
            return { out: { valence: v, asked: true, answer: got }, state: { valence: v } };
          }
        }
      },
      {
        key: "meaning", label: "What it gave",
        async run(st, ctx) {
          if (!(ASK_MEANING.has(st.kind) && st.valence != null && st.valence >= 4)) return { out: { gave: null, asked: false } };
          await putAsk(ctx.env.PERSONAL, { kind: "pp-gave", ref: ctx.runId, priority: 3, question: "What did it give you: " + clip(st.label, 120) + "?", cue: "Pick the one that fits best.", options: GAVE_OPTIONS }, ctx.now());
          return { wait: true, detail: "pp-gave asked" };
        },
        wait: {
          every: "1 hour", max: 36,
          poll: (st, ctx) => askAnswer(ctx.env.PERSONAL, "pp-gave", ctx.runId),
          async resume(st, got, ctx, info) {
            if (info.timedOut) await expireAsk(ctx.env.PERSONAL, "pp-gave", ctx.runId, ctx.now());
            const gave = GAVE_OPTIONS.some((o) => o.key === got) ? got : null;
            if (gave) await ctx.env.PERSONAL.prepare("UPDATE personal_events SET gave = ? WHERE id = ?").bind(gave, ctx.runId).run();
            return { out: { gave, asked: true }, state: { gave } };
          }
        }
      },
      {
        key: "patterns", label: "Patterns",
        async run(st, ctx) { const p = await patterns(ctx.env.PERSONAL, ctx.now()); return { out: p, state: { patterns: p } }; }
      },
      {
        key: "outcomes", label: "Outcomes",
        async run(st, ctx) { const made = await writeOutcomes(ctx.env.PERSONAL, ctx.runId, st, ctx.now()); return { out: { made }, state: { outcomes: made } }; }
      },
      {
        key: "follow", label: "Follow-through",
        async run(st, ctx) {
          if (st.kind !== "reached_out") return { out: { follow: null } };
          return { wait: true, detail: "follow-up in 3 days" };
        },
        wait: {
          every: "6 hours", max: 28,
          async poll(st, ctx) {
            const now = ctx.now();
            if (Date.parse(now) - Date.parse(st.ts) < FOLLOW_AFTER_MS) return null;
            await putAsk(ctx.env.PERSONAL, { kind: "pp-follow", ref: ctx.runId, priority: 3, question: "You reached out to someone on " + localDay(st.ts) + ". Did it lead anywhere?", cue: clip(st.label, 120), options: FOLLOW_OPTIONS }, now);
            return askAnswer(ctx.env.PERSONAL, "pp-follow", ctx.runId);
          },
          async resume(st, got, ctx, info) {
            if (info.timedOut) await expireAsk(ctx.env.PERSONAL, "pp-follow", ctx.runId, ctx.now());
            if (got === "replied" || got === "plan") {
              await ctx.env.PERSONAL.prepare("INSERT OR IGNORE INTO personal_outcomes (run_id, kind, ref, text, ts) VALUES (?, 'win', ?, ?, ?)")
                .bind(ctx.runId, "follow:" + ctx.runId, got === "plan" ? "Reaching out turned into a plan." : "Someone you reached out to wrote back.", ctx.now()).run();
            }
            return { out: { follow: got } };
          }
        }
      }
    ],
    output: (st) => ({ event_id: st.event_id, domain: st.domain, valence: st.valence == null ? null : st.valence, gave: st.gave || null, outcomes: st.outcomes || [] })
  });
}

// What comes before a better next day: next-day mood after each domain against the 90-day mean, and what good things gave.
export async function patterns(db, now) {
  const from = localDay(new Date(Date.parse(now) - 90 * 864e5).toISOString());
  const base = await db.prepare("SELECT AVG(mood) AS m, COUNT(*) AS n FROM wellbeing_checkins WHERE mood IS NOT NULL AND day >= ?").bind(from).first().catch(() => null);
  const rows = (await db.prepare("SELECT e.domain AS domain, AVG(c.mood) AS m, COUNT(DISTINCT e.day) AS n FROM personal_events e JOIN wellbeing_checkins c ON c.day = date(e.day, '+1 day') WHERE e.day >= ? AND c.mood IS NOT NULL AND e.domain != 'day' GROUP BY e.domain")
    .bind(from).all().catch(() => ({ results: [] }))).results || [];
  const gave = (await db.prepare("SELECT gave, COUNT(*) AS n FROM personal_events WHERE gave IS NOT NULL AND day >= ? GROUP BY gave ORDER BY n DESC").bind(from).all()).results || [];
  const b = base && base.m != null ? Math.round(Number(base.m) * 100) / 100 : null;
  const helped = b == null ? [] : rows.map((r) => ({ domain: r.domain, n: Number(r.n), lift: Math.round((Number(r.m) - b) * 100) / 100 }))
    .filter((r) => r.n >= 3).sort((x, y) => y.lift - x.lift);
  return { base: b, base_n: base ? Number(base.n) || 0 : 0, helped, gave: gave.map((g) => ({ gave: g.gave, n: Number(g.n) })) };
}

export function winText(st) {
  switch (st.kind) {
    case "job_applied": return "You sent an application: " + clip(st.label, 120) + ". That counts.";
    case "job_replied": case "job_screening": return "An employer answered: " + clip(st.label, 120) + ".";
    case "job_interview": return "You got to interview: " + clip(st.label, 120) + ".";
    case "job_offer": return "An offer: " + clip(st.label, 120) + ".";
    case "reached_out": return "You reached out to someone.";
    case "flow": return "You found flow.";
    case "outing": return st.valence != null && st.valence >= 4 ? "You went out and it was good" + (st.label && st.label !== KINDS.outing.label ? ": " + clip(st.label, 100) : "") + "." : null;
    default: return st.valence != null && st.valence >= 4 && !NO_FEEL_ASK.has(st.kind) ? "A good one: " + clip(st.label, 120) + "." : null;
  }
}

export async function writeOutcomes(db, runId, st, now) {
  const made = [];
  const put = async (kind, ref, text) => {
    if (!text) return;
    const r = await db.prepare("INSERT OR IGNORE INTO personal_outcomes (run_id, kind, ref, text, ts) VALUES (?,?,?,?,?)").bind(runId, kind, ref, text, now).run();
    if (r && r.meta && Number(r.meta.changes) > 0) made.push(kind);
  };
  await put("win", runId, winText(st));
  const p = st.patterns || { helped: [] };
  const top = (p.helped || []).find((h) => h.lift >= 0.3 && DOMAIN[h.domain] && DOMAIN[h.domain].helps);
  if (top && st.domain === top.domain) {
    await put("insight", "insight:" + top.domain + ":" + isoWeek(localDay(now)),
      "After " + DOMAIN[top.domain].label + ", your next-day mood runs " + top.lift.toFixed(1) + " points above your usual (" + top.n + " times in 90 days).");
  }
  if (st.valence != null && st.valence <= 2 && top) {
    await put("next_step", runId, "On days like this, " + DOMAIN[top.domain].helps + " has helped you before.");
  }
  return made;
}

// ------------------------------------------------------------------ intake (the hourly tick)
export async function ensurePersonalPipeline(db) {
  await PE.ensureEngine(db);
  for (const sql of PP_DDL) await db.prepare(sql).run();
}

// Inputs not yet in the pipeline, newest first, from every place Rowan already taps. lookbackDays keeps the first run from asking
// about months-old events.
export async function harvest(env, now, { lookbackDays = 7, limit = 25 } = {}) {
  const db = env.PERSONAL, since = new Date(Date.parse(now) - lookbackDays * 864e5).toISOString(), out = [];
  const have = async (ref) => !!(await db.prepare("SELECT 1 AS x FROM pipeline_runs WHERE pipeline = 'personal' AND subject_ref = ?").bind(ref).first());
  const push = async (ref, input) => { if (out.length < limit && !(await have(ref))) out.push({ ref, input }); };
  const q = async (sql, ...a) => ((await db.prepare(sql).bind(...a).all().catch(() => ({ results: [] }))).results || []);
  for (const r of await q("SELECT id, answer, answer_label, answered_at FROM cmp_asks WHERE kind = 'pp-day' AND answered_at >= ? AND answer IN ('outing','flow','reached_out','hard_day')", since))
    await push("ask:" + r.id, { kind: r.answer, ts: r.answered_at, label: r.answer_label || KINDS[r.answer].label, source: "today-card" });
  for (const r of await q("SELECT id, ts, score, energy, tags FROM cmp_mood WHERE ts >= ?", since))
    await push("mood:" + r.id, { kind: "mood", ts: r.ts, label: "Mood " + r.score + " of 5", valence: Number(r.score), energy: r.energy == null ? null : Number(r.energy), feelings: r.tags ? String(r.tags).split(",").map((x) => clip(x, 30)).filter(Boolean).slice(0, 8) : null, source: "companion" });
  for (const r of await q("SELECT id, ts, kind, place, place_kind, valence, energy, feelings FROM cmp_moments WHERE ts >= ? AND kind != 'checkin'", since)) {
    let f = null; try { f = JSON.parse(r.feelings || "null"); } catch (e) { f = null; }
    await push("moment:" + r.id, { kind: r.kind === "day" ? "day" : "moment", ts: r.ts, label: clip(r.place || r.place_kind || (r.kind === "day" ? "The day" : "A moment"), 160), valence: r.valence == null ? null : Number(r.valence), energy: r.energy == null ? null : Number(r.energy), feelings: Array.isArray(f) ? f.map((x) => clip(x, 30)).slice(0, 8) : null, source: "moments" });
  }
  for (const r of await q("SELECT id, ts, title, pleasure FROM cmp_activity_log WHERE ts >= ?", since))
    await push("activity:" + r.id, { kind: "activity", ts: r.ts, label: clip(r.title, 160), valence: r.pleasure == null ? null : Math.max(1, Math.min(5, Number(r.pleasure))), source: "activity" });
  // The job pipeline's milestones (qnfo-audit, read-only; nothing personal is written there).
  if (env.AUDIT) {
    const ph = PD.JOB_MILESTONES.map(() => "?").join(",");
    const rows = (await env.AUDIT.prepare("SELECT e.id AS id, e.event AS event, e.ts AS ts, m.title AS title, m.company AS company FROM jobsearch_events e LEFT JOIN jobsearch_matches m ON m.id = e.match_id WHERE e.event IN (" + ph + ") AND e.ts >= ? ORDER BY e.ts DESC LIMIT 40")
      .bind(...PD.JOB_MILESTONES, since).all().catch(() => ({ results: [] }))).results || [];
    for (const r of rows) await push("job:" + r.id, { kind: "job_" + r.event, ts: r.ts, label: clip((r.title || "a role") + (r.company ? " at " + r.company : ""), 160), source: "jobs" });
  }
  return out;
}

// The evening tap that turns a day into an input: once a day from 18:00, yesterday's unanswered one expires first.
export async function dailyAsk(db, now) {
  if (localHour(now) < 18) return 0;
  const day = localDay(now);
  await db.prepare("UPDATE cmp_asks SET answered_at = ?, answer = 'expired', answer_label = 'Expired', applied = 'pipeline: next day' WHERE kind = 'pp-day' AND answered_at IS NULL AND ref < ?").bind(now, day).run();
  const r = await db.prepare("INSERT OR IGNORE INTO cmp_asks (kind, ref, question, cue, options_json, priority, created_at) VALUES ('pp-day', ?, ?, ?, ?, 2, ?)")
    .bind(day, "Did anything stand out today?", "One tap. The companion follows it up and learns what helps.", JSON.stringify(askOptions(DAY_OPTIONS)), now).run();
  return r && r.meta ? Number(r.meta.changes) || 0 : 0;
}

// One tick: ask the evening question, open a run per new input, start it on Workflows (or inline when the binding is absent or
// create() fails), adopt Workflow runs that went quiet, and resume inline runs that are due.
export async function tick(env, opts = {}) {
  const db = env.PERSONAL, now = (opts.now || nowIso)(), def = personalPipeline();
  await ensurePersonalPipeline(db);
  const res = { asked: await dailyAsk(db, now), opened: 0, workflow: 0, inline: 0, adopted: 0 };
  for (const h of await harvest(env, now, opts)) {
    const o = await PE.openRun(db, def, h.input, { subjectRef: h.ref, now });
    if (!o.created) continue;
    res.opened++;
    let started = false;
    if (env.PERSONAL_FLOW && typeof env.PERSONAL_FLOW.create === "function") {
      try { await env.PERSONAL_FLOW.create({ id: o.id, params: { runId: o.id } }); await PE.setMode(db, o.id, "workflow", now); started = true; res.workflow++; }
      catch (e) { await PE.evidence(db, o.id, def.name, "start", false, { workflow_create: String(e && e.message || e).slice(0, 200), fallback: "inline" }, now); }
    }
    if (!started) res.inline++;
  }
  // Second path: a Workflow run that has not moved for 3 hours (a poll writes updated_at every hour) continues inline.
  const stale = new Date(Date.parse(now) - 3 * 36e5).toISOString();
  const ad = await db.prepare("UPDATE pipeline_runs SET mode = 'inline', next_check_at = ?, updated_at = ? WHERE pipeline = 'personal' AND mode = 'workflow' AND status IN ('queued','running','waiting') AND updated_at < ?").bind(now, now, stale).run();
  res.adopted = ad && ad.meta ? Number(ad.meta.changes) || 0 : 0;
  res.resume = await PE.resumeDue(db, def, ctxFor(env, opts), 20);
  try { res.growth = await growthCounters(env, now); } catch (e) { res.growth = { error: String(e && e.message || e).slice(0, 160) }; }
  return res;
}

// GROWTH-PM-1 (2026-11-12): weekly counts for the growth product manager. Counts only: inputs captured, outcomes produced and taps answered,
// this week and the week before. Written to qnfo-audit product_growth_counters (product companion-today); nothing else leaves the plane.
export const GROWTH_COUNTERS = [
  ["personal_inputs_7d", "SELECT SUM(created_at >= ?1) AS v, SUM(created_at >= ?2 AND created_at < ?1) AS p FROM personal_events WHERE created_at >= ?2"],
  ["personal_outcomes_7d", "SELECT SUM(ts >= ?1) AS v, SUM(ts >= ?2 AND ts < ?1) AS p FROM personal_outcomes WHERE ts >= ?2"],
  ["personal_taps_answered_7d", "SELECT SUM(answered_at >= ?1) AS v, SUM(answered_at >= ?2 AND answered_at < ?1) AS p FROM cmp_asks WHERE kind LIKE 'pp-%' AND answered_at >= ?2"]
];
export async function growthCounters(env, now = nowIso()) {
  if (!env.PERSONAL || !env.AUDIT) return { skipped: "binding" };
  const t = Date.parse(now), w1 = new Date(t - 7 * 864e5).toISOString(), w2 = new Date(t - 14 * 864e5).toISOString();
  const out = {};
  for (const [metric, sql] of GROWTH_COUNTERS) {
    const r = await env.PERSONAL.prepare(sql).bind(w1, w2).first();
    const v = Number(r && r.v) || 0, p = Number(r && r.p) || 0;
    await env.AUDIT.prepare("INSERT INTO product_growth_counters (product, metric, value, prev, read_at, source) VALUES ('companion-today', ?1, ?2, ?3, ?4, 'personal-companion') ON CONFLICT(product, metric) DO UPDATE SET value = ?2, prev = ?3, read_at = ?4, source = 'personal-companion'")
      .bind(metric, v, p, now).run();
    out[metric] = v;
  }
  return out;
}

export function ctxFor(env, opts = {}) {
  const c = { env, now: opts.now || nowIso };
  return c;
}

// The Workflow body: the same runPipeline the inline path uses, with the Workflow's own step.
export async function runWorkflow(env, payload, step) {
  const db = env.PERSONAL, def = personalPipeline();
  await ensurePersonalPipeline(db);
  const id = payload && payload.runId;
  const ctx = Object.assign(ctxFor(env), { runId: id });
  return PE.runPipeline(db, def, id, step, ctx);
}

// ------------------------------------------------------------------ consumers
// Morning brief lines: the newest wins, insights and next steps not shown yet (at most four), then marked surfaced.
export async function briefLines(env, now = nowIso()) {
  const db = env.PERSONAL;
  await ensurePersonalPipeline(db);
  const since = new Date(Date.parse(now) - 7 * 864e5).toISOString();
  const rows = (await db.prepare("SELECT id, kind, text FROM personal_outcomes WHERE surfaced_at IS NULL AND ts >= ? ORDER BY CASE kind WHEN 'next_step' THEN 0 WHEN 'insight' THEN 1 ELSE 2 END, id DESC LIMIT 4").bind(since).all()).results || [];
  if (!rows.length) return [];
  for (const r of rows) await db.prepare("UPDATE personal_outcomes SET surfaced_at = ? WHERE id = ?").bind(now, r.id).run();
  const wins = await db.prepare("SELECT COUNT(*) AS n FROM personal_outcomes WHERE kind = 'win' AND ts >= ?").bind(since).first();
  const L = ["", "From your week:"];
  for (const r of rows) L.push("- " + r.text);
  if (wins && Number(wins.n) >= 3) L.push("- " + wins.n + " wins in seven days.");
  return L;
}

// Status for /pipelines: counts by stage and state, the same shape for all three pipelines. No event, label or answer leaves the plane.
export async function statusAll(env, nowMs = Date.now()) {
  const out = { ok: true, engine: "pipeline-engine " + PE.ENGINE_VERSION, personal_pipeline: PP_VERSION, at: new Date(nowMs).toISOString(), pipelines: [] };
  try { await ensurePersonalPipeline(env.PERSONAL); out.pipelines.push(await PE.statusOf(env.PERSONAL, personalPipeline(), nowMs)); }
  catch (e) { out.pipelines.push({ pipeline: "personal", error: String(e && e.message || e).slice(0, 200) }); }
  for (const def of [PD.researchPipeline(PE), PD.jobsPipeline(PE)]) {
    try {
      if (!env.AUDIT) throw new Error("no AUDIT binding");
      const s = def.source;
      const rows = (await env.AUDIT.prepare("SELECT " + s.status + " AS status, COUNT(*) AS n, MIN(" + s.ts + ") AS oldest FROM " + s.table + " GROUP BY " + s.status).all()).results || [];
      out.pipelines.push(PE.projectStatus(def, rows, nowMs));
    } catch (e) { out.pipelines.push({ pipeline: def.name, error: String(e && e.message || e).slice(0, 200) }); }
  }
  const p = out.pipelines[0] || {};
  out.healthy = !p.error && (p.failed_24h || 0) === 0 && (p.stuck || 0) === 0;
  return out;
}

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export function statusPage(st, head) {
  const card = (p) => {
    if (p.error) return '<section class="ds-card"><h2>' + esc(p.pipeline) + '</h2><p class="pp-bad">Could not read this pipeline: ' + esc(p.error) + "</p></section>";
    const stages = p.stages.map((s) => '<li><span>' + esc(s.label) + '</span><b>' + s.active + "</b></li>").join("");
    const states = Object.keys(p.by_state).sort().map((k) => esc(k) + " " + p.by_state[k]).join(" · ");
    const extra = p.plane === "personal" ? '<p class="pp-mute">Last 24 hours: ' + (p.done_24h || 0) + " finished, " + (p.failed_24h || 0) + " failed, " + (p.stuck || 0) + " stuck.</p>" : "";
    return '<section class="ds-card"><h2>' + esc(p.label) + '</h2><p class="pp-mute">' + (p.mode === "observed" ? "Runs in its own worker; stages read from its status." : "Runs on Cloudflare Workflows, inline when needed.") + "</p>"
      + '<ol class="pp-stages">' + stages + "</ol><p class=\"pp-mute\">" + p.total + " in total: " + states + "</p>" + extra + "</section>";
  };
  const css = ".pp-stages{list-style:none;padding:0;margin:var(--ds-s2,8px) 0;display:grid;gap:4px}.pp-stages li{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--ds-line,#ddd)}.pp-mute{color:var(--ds-mute,#666);font-size:14px}.pp-bad{color:var(--ds-bad,#b00020)}";
  const status = st.healthy ? "Every pipeline is reading, and the personal one has no failed or stuck run." : "The personal pipeline has a failed or stuck run, or a pipeline could not be read.";
  return "<!doctype html><html lang=\"en\"><head>" + (head ? head("Pipelines", css) : "<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Pipelines</title><style>body{font:16px/1.5 system-ui;max-width:640px;margin:auto;padding:16px}" + css + "</style>")
    + '</head><body class="ds"><main class="ds-main"><h1>Pipelines</h1><p>' + esc(status) + "</p>" + st.pipelines.map(card).join("")
    + '<p class="pp-mute">Counts only. Personal events stay in the private personal store. ' + esc(st.engine) + ".</p></main></body></html>";
}
