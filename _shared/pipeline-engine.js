// _shared/pipeline-engine.js: PIPELINE-ENGINE-1 (Rowan 2026-11-12: "These are all about inputs and outputs. They're all basically functions.").
//
// One engine for every domain pipeline. A pipeline is a function: a typed input, an ordered list of stages, each stage a typed step,
// and an output. Every run keeps its state and an append-only evidence log in the D1 of its own plane (personal runs in personal-life,
// never in qnfo-audit: PERSONAL-QNFO-SEPARATION-1).
//
// Two executors share one code path:
//   - Cloudflare Workflows: a WorkflowEntrypoint passes its `step`; every stage is a step.do (retried, cached on replay) and a wait is
//     step.sleep, so a run can wait a day for a tap without holding anything.
//   - inline: inlineStep() runs step.do directly and turns step.sleep into a PAUSE; the run is saved as `waiting` with next_check_at and
//     the hourly tick resumes it (resumeDue). This is the second path when the Workflow binding is missing or create() fails.
//
// A pipeline whose stages already run in another worker (research, jobs) is registered as an observed pipeline: `project(row)` maps
// that worker's own status to an engine stage, so one status view reads all of them the same way (projectStatus).
//
// Pure ESM, no imports: personal-companion inlines it (scripts/inline-pipeline-modules.mjs); tests load it directly.

export const ENGINE_VERSION = "1.1.0";

export const ENGINE_DDL = [
  `CREATE TABLE IF NOT EXISTS pipeline_runs (
     id TEXT PRIMARY KEY, pipeline TEXT NOT NULL, version TEXT NOT NULL, subject_ref TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'queued', stage TEXT, stage_idx INTEGER NOT NULL DEFAULT 0,
     input_json TEXT NOT NULL, state_json TEXT, output_json TEXT, mode TEXT NOT NULL DEFAULT 'inline',
     wait_n INTEGER NOT NULL DEFAULT 0, next_check_at TEXT, error TEXT,
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT, UNIQUE(pipeline, subject_ref))`,
  "CREATE INDEX IF NOT EXISTS pipeline_runs_status ON pipeline_runs(pipeline, status, next_check_at)",
  `CREATE TABLE IF NOT EXISTS pipeline_evidence (
     id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, pipeline TEXT NOT NULL, stage TEXT NOT NULL,
     ts TEXT NOT NULL, ok INTEGER NOT NULL, detail_json TEXT)`,
  "CREATE INDEX IF NOT EXISTS pipeline_evidence_run ON pipeline_evidence(run_id, id)"
];

export const STATUSES = ["queued", "running", "waiting", "done", "failed"];
const STEP_OPTS = { retries: { limit: 3, delay: "10 seconds", backoff: "exponential" }, timeout: "2 minutes" };
const DUR = { second: 1e3, minute: 6e4, hour: 36e5, day: 864e5 };

export function durationMs(d) {
  if (typeof d === "number") return d;
  const m = /^(\d+)\s*(second|minute|hour|day)s?$/.exec(String(d || "").trim());
  if (!m) throw new Error("pipeline: bad duration " + d);
  return Number(m[1]) * DUR[m[2]];
}

// ------------------------------------------------------------------ typed schemas
// A small schema language, enough to make every stage's input and output a contract:
// { type: "object", required: [...], props: { k: { type, enum, min, max, maxLength, items } } }
export function validate(schema, v, path = "$") {
  const errs = [];
  if (!schema) return { ok: true, errors: errs };
  const t = schema.type;
  if (v === null || v === undefined) {
    if (!schema.nullable && t) errs.push(path + ": required");
    return { ok: errs.length === 0, errors: errs };
  }
  const actual = Array.isArray(v) ? "array" : Number.isInteger(v) && t === "integer" ? "integer" : typeof v;
  if (t && actual !== t && !(t === "number" && typeof v === "number")) errs.push(path + ": expected " + t + ", got " + actual);
  else {
    if (schema.enum && !schema.enum.includes(v)) errs.push(path + ": " + JSON.stringify(v) + " not in " + schema.enum.join("|"));
    if (typeof v === "number" && schema.min !== undefined && v < schema.min) errs.push(path + ": below " + schema.min);
    if (typeof v === "number" && schema.max !== undefined && v > schema.max) errs.push(path + ": above " + schema.max);
    if (typeof v === "string" && schema.maxLength && v.length > schema.maxLength) errs.push(path + ": longer than " + schema.maxLength);
    if (t === "array" && schema.items) v.forEach((x, i) => errs.push(...validate(schema.items, x, path + "[" + i + "]").errors));
    if (t === "object") {
      for (const k of schema.required || []) if (v[k] === undefined || v[k] === null) errs.push(path + "." + k + ": required");
      for (const [k, s] of Object.entries(schema.props || {})) if (v[k] !== undefined && v[k] !== null) errs.push(...validate(s, v[k], path + "." + k).errors);
    }
  }
  return { ok: errs.length === 0, errors: errs };
}

// ------------------------------------------------------------------ definitions
export function definePipeline(def) {
  if (!def || !/^[a-z][a-z0-9-]{1,40}$/.test(def.name || "")) throw new Error("pipeline: name");
  if (!def.version) throw new Error("pipeline " + def.name + ": version");
  if (!["personal", "research", "jobs"].includes(def.plane)) throw new Error("pipeline " + def.name + ": plane");
  const stages = def.stages || [];
  if (!stages.length) throw new Error("pipeline " + def.name + ": no stages");
  const seen = new Set();
  for (const s of stages) {
    if (!s.key || seen.has(s.key)) throw new Error("pipeline " + def.name + ": stage key " + s.key);
    seen.add(s.key);
    // a funnel view (observed, or executed by a sibling pipeline named in def.runs) projects stages and needs no run()
    if (def.mode === "observed" || typeof def.project === "function" ? false : typeof s.run !== "function") throw new Error("pipeline " + def.name + ": stage " + s.key + " has no run()");
    if (s.wait && (typeof s.wait.poll !== "function" || typeof s.wait.resume !== "function")) throw new Error("pipeline " + def.name + ": stage " + s.key + " wait needs poll and resume");
  }
  if (def.mode === "observed" && typeof def.project !== "function") throw new Error("pipeline " + def.name + ": observed needs project()");
  return Object.freeze(Object.assign({ mode: "executed" }, def, { stages: Object.freeze(stages.slice()) }));
}

// ------------------------------------------------------------------ storage
let _ready = new WeakSet();
export async function ensureEngine(db) {
  if (_ready.has(db)) return;
  for (const sql of ENGINE_DDL) await db.prepare(sql).run();
  _ready.add(db);
}
const nowIso = () => new Date().toISOString();
function j(v, d) { try { const x = JSON.parse(v); return x == null ? d : x; } catch (e) { return d; } }

export async function evidence(db, runId, pipeline, stage, ok, detail, ts) {
  await db.prepare("INSERT INTO pipeline_evidence (run_id, pipeline, stage, ts, ok, detail_json) VALUES (?,?,?,?,?,?)")
    .bind(runId, pipeline, stage, ts || nowIso(), ok ? 1 : 0, detail === undefined ? null : JSON.stringify(detail).slice(0, 4000)).run();
}

export function runId(pipeline, subjectRef) {
  // deterministic, so the same subject never makes two runs and the Workflow instance id equals the run id
  let h = 2166136261;
  const s = pipeline + "|" + subjectRef;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return pipeline.slice(0, 12) + "-" + h.toString(36) + "-" + s.length.toString(36);
}

// Opens a run for one input. Returns { id, created } (created=false when the subject already has a run). Throws on a schema violation.
export async function openRun(db, def, input, { subjectRef, mode = "inline", now } = {}) {
  await ensureEngine(db);
  const v = validate(def.input, input);
  if (!v.ok) throw new Error("pipeline " + def.name + " input: " + v.errors.join("; "));
  const ref = String(subjectRef || "");
  if (!ref) throw new Error("pipeline " + def.name + ": subjectRef");
  const id = runId(def.name, ref), ts = now || nowIso();
  const r = await db.prepare("INSERT OR IGNORE INTO pipeline_runs (id, pipeline, version, subject_ref, status, stage, stage_idx, input_json, state_json, mode, created_at, updated_at) VALUES (?,?,?,?, 'queued', ?, 0, ?, ?, ?, ?, ?)")
    .bind(id, def.name, def.version, ref, def.stages[0].key, JSON.stringify(input), JSON.stringify(input), mode, ts, ts).run();
  const created = !!(r && r.meta && Number(r.meta.changes) > 0);
  if (created) await evidence(db, id, def.name, "open", true, { mode, subject_ref: ref }, ts);
  return { id, created };
}

export async function setMode(db, id, mode, now) {
  await db.prepare("UPDATE pipeline_runs SET mode = ?, updated_at = ? WHERE id = ?").bind(mode, now || nowIso(), id).run();
}

// ------------------------------------------------------------------ executor
export class Pause extends Error { constructor(name, ms) { super("pause " + name); this.pause = true; this.ms = ms; } }

// The inline step: step.do runs the function now (one retry), step.sleep pauses the run until the tick resumes it.
export function inlineStep() {
  return {
    async do(name, opts, fn) { if (typeof opts === "function") fn = opts; try { return await fn(); } catch (e) { return await fn(); } },
    async sleep(name, dur) { throw new Pause(name, durationMs(dur)); }
  };
}

const wrap = async (fn) => { const v = await fn(); return v === undefined ? null : v; };

// Runs (or continues) one run to its end, a pause, or a failure. ctx is whatever the stages need (env, clock, deps).
export async function runPipeline(db, def, id, step, ctx = {}) {
  await ensureEngine(db);
  ctx = Object.assign({}, ctx, { runId: id });
  const clock = ctx.now || nowIso;
  const row = await step.do("load", STEP_OPTS, () => wrap(() => db.prepare("SELECT * FROM pipeline_runs WHERE id = ?").bind(id).first()));
  if (!row) return { ok: false, error: "no run " + id };
  if (row.status === "done" || row.status === "failed") return { ok: true, status: row.status, skipped: true };
  let state = j(row.state_json, j(row.input_json, {}));
  let i = Number(row.stage_idx) || 0;
  let waitStart = Number(row.wait_n) || 0;
  try {
    for (; i < def.stages.length; i++) {
      const st = def.stages[i];
      let res = await step.do(st.key, STEP_OPTS, () => wrap(async () => {
        const r = (await st.run(state, ctx)) || {};
        if (!r.wait) await finishStage(db, def, id, i, st, state, r, clock());
        else if (waitStart === 0) {
          await db.prepare("UPDATE pipeline_runs SET status = 'waiting', stage = ?, stage_idx = ?, updated_at = ? WHERE id = ?").bind(st.key, i, clock(), id).run();
          await evidence(db, id, def.name, st.key, true, { waiting: true, detail: r.detail || null }, clock());
        }
        return r;
      }));
      if (res && res.wait) {
        const w = st.wait, max = w.max || 24, every = w.every || "1 hour";
        let got = null, k = waitStart;
        for (; k < max; k++) {
          const kk = k;
          got = await step.do(st.key + ":poll:" + kk, STEP_OPTS, () => wrap(async () => {
            const g = await w.poll(state, ctx);
            await db.prepare("UPDATE pipeline_runs SET wait_n = ?, updated_at = ? WHERE id = ?").bind(kk + 1, clock(), id).run();
            return g === undefined ? null : g;
          }));
          if (got !== null) break;
          if (k + 1 < max) await step.sleep(st.key + ":wait:" + kk, every);
        }
        const timedOut = got === null;
        res = await step.do(st.key + ":resume", STEP_OPTS, () => wrap(async () => {
          const r = (await w.resume(state, got, ctx, { timedOut })) || {};
          await finishStage(db, def, id, i, st, state, r, clock(), { timedOut });
          return r;
        }));
        waitStart = 0;
      }
      state = Object.assign({}, state, (res && res.state) || {});
      if (res && res.stop) { i = def.stages.length; break; }
    }
    const out = await step.do("finish", STEP_OPTS, () => wrap(async () => {
      const output = typeof def.output === "function" ? def.output(state) : state;
      await db.prepare("UPDATE pipeline_runs SET status = 'done', output_json = ?, state_json = ?, stage = 'done', next_check_at = NULL, updated_at = ?, finished_at = ? WHERE id = ?")
        .bind(JSON.stringify(output).slice(0, 8000), JSON.stringify(state).slice(0, 8000), clock(), clock(), id).run();
      await evidence(db, id, def.name, "finish", true, { output_keys: Object.keys(output || {}) }, clock());
      return output;
    }));
    return { ok: true, status: "done", output: out };
  } catch (e) {
    if (e && e.pause) {
      const due = new Date(Date.parse(clock()) + e.ms).toISOString();
      await db.prepare("UPDATE pipeline_runs SET status = 'waiting', next_check_at = ?, updated_at = ? WHERE id = ?").bind(due, clock(), id).run();
      return { ok: true, status: "waiting", next_check_at: due };
    }
    const msg = String(e && e.message || e).slice(0, 500);
    await db.prepare("UPDATE pipeline_runs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").bind(msg, clock(), id).run();
    await evidence(db, id, def.name, def.stages[Math.min(i, def.stages.length - 1)].key, false, { error: msg }, clock());
    return { ok: false, status: "failed", error: msg };
  }
}

async function finishStage(db, def, id, i, st, state, r, ts, extra) {
  const out = r.out === undefined ? null : r.out;
  if (st.out) {
    const v = validate(st.out, out);
    if (!v.ok) throw new Error("stage " + st.key + " output: " + v.errors.join("; "));
  }
  const next = Object.assign({}, state, r.state || {});
  const nextIdx = r.stop ? def.stages.length : i + 1;
  await db.prepare("UPDATE pipeline_runs SET status = 'running', stage = ?, stage_idx = ?, state_json = ?, wait_n = 0, next_check_at = NULL, updated_at = ? WHERE id = ?")
    .bind(nextIdx < def.stages.length ? def.stages[nextIdx].key : "done", nextIdx, JSON.stringify(next).slice(0, 8000), ts, id).run();
  await evidence(db, id, def.name, st.key, true, Object.assign({ out }, extra || {}), ts);
}

// Inline runs that are waiting and due, plus queued inline runs the tick has not started yet.
export async function resumeDue(db, def, ctx = {}, limit = 20) {
  await ensureEngine(db);
  const now = (ctx.now || nowIso)();
  const rows = (await db.prepare("SELECT id FROM pipeline_runs WHERE pipeline = ? AND mode = 'inline' AND ((status = 'waiting' AND next_check_at <= ?) OR status IN ('queued','running')) ORDER BY created_at LIMIT ?")
    .bind(def.name, now, limit).all()).results || [];
  const out = { resumed: 0, done: 0, waiting: 0, failed: 0 };
  for (const r of rows) {
    const x = await runPipeline(db, def, r.id, inlineStep(), ctx);
    out.resumed++;
    if (x.status === "done") out.done++; else if (x.status === "waiting") out.waiting++; else if (x.status === "failed") out.failed++;
  }
  return out;
}

// ------------------------------------------------------------------ status
// Counts only: no input, state or output leaves the plane through this view.
// opts.ensure=false reads a plane this worker does not own: no DDL, and a missing table reads as an error the caller catches.
export async function statusOf(db, def, nowMs = Date.now(), opts = {}) {
  if (opts.ensure !== false) await ensureEngine(db);
  const rows = (await db.prepare("SELECT status, stage, COUNT(*) AS n, MIN(updated_at) AS oldest FROM pipeline_runs WHERE pipeline = ? GROUP BY status, stage").bind(def.name).all()).results || [];
  const since = new Date(nowMs - 864e5).toISOString();
  const f = await db.prepare("SELECT COUNT(*) AS n FROM pipeline_runs WHERE pipeline = ? AND status = 'failed' AND updated_at >= ?").bind(def.name, since).first();
  const d = await db.prepare("SELECT COUNT(*) AS n FROM pipeline_runs WHERE pipeline = ? AND status = 'done' AND finished_at >= ?").bind(def.name, since).first();
  const stuck = await db.prepare("SELECT COUNT(*) AS n FROM pipeline_runs WHERE pipeline = ? AND ((status = 'waiting' AND next_check_at IS NOT NULL AND next_check_at < ?) OR (status IN ('queued','running') AND updated_at < ?))")
    .bind(def.name, new Date(nowMs - 2 * 36e5).toISOString(), new Date(nowMs - 2 * 36e5).toISOString()).first();
  return summarise(def, rows.map((r) => ({ stage: r.stage, state: r.status, n: Number(r.n), oldest: r.oldest })), nowMs, {
    failed_24h: Number(f && f.n) || 0, done_24h: Number(d && d.n) || 0, stuck: Number(stuck && stuck.n) || 0
  });
}

// For an observed pipeline: rows are { status, n, oldest } from that worker's own table; def.project(status) -> { stage, state }.
export function projectStatus(def, rows, nowMs = Date.now()) {
  const mapped = [];
  for (const r of rows || []) {
    const p = def.project(r.status) || { stage: "unknown", state: "unknown" };
    mapped.push({ stage: p.stage, state: p.state, n: Number(r.n) || 0, oldest: r.oldest || null });
  }
  return summarise(def, mapped, nowMs, {});
}

function summarise(def, rows, nowMs, extra) {
  const by_stage = {}, by_state = {};
  for (const s of def.stages) by_stage[s.key] = 0;
  let total = 0, oldestActive = null;
  for (const r of rows) {
    total += r.n;
    by_state[r.state] = (by_state[r.state] || 0) + r.n;
    if (r.state !== "done" && r.state !== "failed" && r.stage in by_stage) by_stage[r.stage] += r.n;
    if (["queued", "running", "waiting", "active"].includes(r.state) && r.oldest && (!oldestActive || r.oldest < oldestActive)) oldestActive = r.oldest;
  }
  return Object.assign({
    pipeline: def.name, label: def.label || def.name, plane: def.plane, version: def.version, mode: def.mode, executor: def.executor || null,
    stages: def.stages.map((s) => ({ key: s.key, label: s.label || s.key, active: by_stage[s.key] || 0 })),
    total, by_state, oldest_active_min: oldestActive ? Math.round((nowMs - Date.parse(oldestActive)) / 6e4) : null
  }, extra);
}
