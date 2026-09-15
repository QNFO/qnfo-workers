// qnfo-goal-author v0.2.0 — SELF-AUTHORED GOALS: the fleet authors its own INSTRUMENTAL goals.
// PURPOSE: close the single deepest autonomy gap. The report card (2026-09-10) scores
//   independent_decision = 2.5/5 with gap "self-authored goals absent BY DESIGN" and
//   s5_policy = 3.0/5 with gap "policy authored externally; no proposal rights". This worker
//   makes the fleet PROPOSE -> CLASSIFY -> SCORE -> ADOPT its own goals on a daily cadence,
//   moving decision authority from Sheridan-Verplanck LoA 5 (suggests -> human approves) to
//   LoA 6-7 (authors and adopts -> informs human).
//
// INVARIANT (the honesty anchor — NOT optional):
//   The terminal objective (mission + value function) is READ-ONLY to this worker. The fleet
//   self-authors INSTRUMENTAL goals UNDER the ratified objective. Any candidate that would
//   change the terminal objective is classified `goal_type='objective-revision'` and is NEVER
//   auto-adopted — it is routed to the propose->ratify path (residual-consent #3: "objective-
//   function changes require human ratification"). This is what makes self-authored goals
//   honest (anchored) rather than silent objective drift. See docs/SELF-AUTHORED-GOALS.md.
//
// Loop (daily cron 0 2 * * *):
//   1. load active objectives (ratified terminal objectives)
//   2. gather candidate signals (idea_proposals, self_questions, autonomy_scores gaps,
//      self_heal_actions, signals)
//   3. synthesize falsifiable goal statements (Workers AI)
//   4. classify instrumental vs objective-revision
//   5. score (falsifiability, alignment, leverage, novelty) 0..1
//   6. auto-adopt top-N instrumental goals -> goals + gtd_register + task_dod_register
//      (task_dod_register is the DRAINABLE ledger: autopilot/fleet-control/dashboard read it)
//   7. route objective-revision to proposed (ratification queue, never adopted) + surface
//   8. re-prioritize / retire stale goals
//   9. write receipts (cloud_ops_events + signals); alert on model-empty
//
// v0.2.0 fixes (audit 2026-09-15): R1 goals now drainable (task_dod_register); R2/F3 thematic
//   near-dup filter (Jaccard vs last-30d adopted) stops reworded re-adoption; R3 objective-
//   revision surfaced as its own event; F2 token guard on mutating endpoints; F7 program link;
//   F8 model-empty alert.
//
// CANONICAL: QNFO/qnfo-workers/qnfo-goal-author/worker.js. DEPLOY: wrangler (D1 AUDIT + cron).
const VERSION = '0.4.0';
const NAME = 'qnfo-goal-author';
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const ADOPT_CAP = 3;          // max instrumental goals auto-adopted per cycle
const SCORE_THRESHOLD = 0.5;  // min score to adopt
const MAX_SIGNAL_CHARS = 6000; // bound on the signal text fed to the model
const DUP_JACCARD = 0.45;     // skip candidate if >= this token-overlap with a recent goal
const DUP_CONTAINMENT = 0.6;  // OR >= this containment (catches rewordings on long statements)
const DUP_WINDOW_DAYS = 30;   // window for near-dup comparison
const GOAL_DUE_DAYS = 90;     // task_dod_register due horizon (so autopilot can census it)

function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
function nowIso() { return new Date().toISOString(); }
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return 'g' + (h >>> 0).toString(36) + s.length.toString(36);
}
// token set for near-dup detection (words > 3 chars, lowercased, alphanumeric)
function tokens(s) {
  const out = new Set();
  for (const w of String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)) {
    if (w.length > 3) out.add(w);
  }
  return out;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
// containment is more sensitive than Jaccard to rewordings of the same idea (near-subset).
function containment(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / Math.min(a.size, b.size);
}
function isNearDup(a, b) {
  return jaccard(a, b) >= DUP_JACCARD || containment(a, b) >= DUP_CONTAINMENT;
}
// F7: link a goal to the portfolio program layer. Uses stems (no trailing \b) so
// "topological"/"derived"/"simulation" match; a trailing \b silently failed on inflections.
function inferProgram(statement) {
  const s = String(statement || '').toLowerCase();
  if (/(quantum|anyon|topolog|thermodynamic|neuromorph|holograph|research|theorem|deriv|physical|simul|entropy|landauer|superconduct|verlinde|braid|majorana)/.test(s)) return 'QNFO.RSCH';
  if (/(worker|deploy|cloudflare| d1| r2| kv|cron|infra|registry|dns|pipeline)/.test(s)) return 'QNFO.INFRA';
  return 'QNFO.OPS';
}
// F2: token guard for mutating endpoints. Cron path calls authorLoop() directly (unaffected).
function authorized(request, env) {
  const t = env.GOAL_AUTHOR_TOKEN;
  if (!t) return true; // graceful before secret is set
  return (request.headers.get('x-goal-token') || '') === t;
}

// PRECONDITION: env.AUDIT bound. POSTCONDITION: objectives + goals tables exist; ratified
// objectives seeded exactly once (INSERT OR IGNORE). INVARIANT: this is the ONLY writer of
// the canonical objective rows; it never mutates them after seed.
async function ensureSchema(env) {
  await env.AUDIT.prepare(
    `CREATE TABLE IF NOT EXISTS objectives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      objective_key TEXT UNIQUE NOT NULL,
      statement TEXT NOT NULL,
      source TEXT,
      ratified_by TEXT,
      ratified_on TEXT,
      version INTEGER DEFAULT 1,
      status TEXT DEFAULT 'ACTIVE'
    )`
  ).run();
  await env.AUDIT.prepare(
    `CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_key TEXT UNIQUE NOT NULL,
      statement TEXT NOT NULL,
      goal_type TEXT NOT NULL DEFAULT 'instrumental',
      parent_objective TEXT,
      alignment TEXT,
      source TEXT,
      score REAL,
      priority INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'proposed',
      dod TEXT,
      owner TEXT,
      program_code TEXT,
      adopted_at TEXT, completed_at TEXT, retired_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`
  ).run();
  await env.AUDIT.prepare('CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status)').run();
  await env.AUDIT.prepare('CREATE INDEX IF NOT EXISTS idx_goals_type ON goals(goal_type)').run();
  // migration for pre-v0.2.0 rows (defensive; no-op if column exists)
  try { await env.AUDIT.prepare('ALTER TABLE goals ADD COLUMN program_code TEXT').run(); } catch (e) {}
  // Canonical ratified terminal objectives (source of truth; read-only thereafter).
  const seeds = [
    {
      key: 'mission',
      statement: 'Every recurring function runs in the cloud. The fleet operates, heals, audits, improves, publishes, and promotes itself. The human role narrows to policy-setting and exception handling.',
      source: 'docs/AUTONOMOUS-FLEET-ARCHITECTURE.md §1.1 Mission'
    },
    {
      key: 'objective-function',
      statement: 'Maximize SAI = 0.30*autonomy + 0.15*thinking + 0.15*decision + 0.15*self_improv + 0.10*reliability + 0.10*integration + 0.05*governance, subject to the autonomy-ladder cap, cost ceilings (A9), and the residual-consent boundary.',
      source: 'docs/FLEET-REPORT-CARD.md objective function + A9'
    }
  ];
  for (const s of seeds) {
    await env.AUDIT.prepare(
      `INSERT OR IGNORE INTO objectives (objective_key, statement, source, ratified_by, ratified_on) VALUES (?,?,?,?,?)`
    ).bind(s.key, s.statement, s.source, 'human (standing directive)', '2026-09-14').run();
  }
}

// PRECONDITION: schema exists. POSTCONDITION: active objective rows returned.
async function loadObjectives(env) {
  const r = await env.AUDIT.prepare("SELECT * FROM objectives WHERE status='ACTIVE' ORDER BY id").all();
  return r.results || [];
}

// PRECONDITION: none. POSTCONDITION: bounded array of signal strings, defensively read (a
// missing table/column is tolerated, never fatal).
async function gatherSignals(env) {
  const signals = [];
  const push = (label, text) => { const t = String(text || '').trim(); if (t.length >= 8) signals.push(label + ': ' + t.slice(0, 400)); };
  const tryRows = async (sql, label, field) => {
    try {
      const r = await env.AUDIT.prepare(sql).all();
      for (const row of (r.results || [])) push(label, row[field]);
    } catch (e) { /* tolerate missing table/column */ }
  };
  await tryRows("SELECT idea, score FROM idea_proposals WHERE status IN ('approved','triaged_hold') AND score >= 0.5 ORDER BY score DESC LIMIT 10", 'idea', 'idea');
  await tryRows("SELECT question FROM self_questions WHERE status='open' ORDER BY id DESC LIMIT 8", 'research-question', 'question');
  await tryRows("SELECT dimension || ' gap: ' || gap AS g FROM autonomy_scores WHERE score < 3.0 ORDER BY score ASC LIMIT 6", 'autonomy-gap', 'g');
  await tryRows("SELECT summary FROM self_heal_actions WHERE status IN ('open','pending') ORDER BY id DESC LIMIT 5", 'heal-action', 'summary');
  await tryRows("SELECT content FROM signals ORDER BY id DESC LIMIT 5", 'signal', 'content');
  let total = 0;
  const out = [];
  for (const s of signals) { total += s.length; if (total > MAX_SIGNAL_CHARS) break; out.push(s); }
  return out;
}

// PRECONDITION: recent adopted goals available. POSTCONDITION: token-set array for dup checks.
async function recentGoalTokens(env) {
  const cutoff = new Date(Date.now() - DUP_WINDOW_DAYS * 864e5).toISOString();
  try {
    const r = await env.AUDIT.prepare(
      "SELECT statement FROM goals WHERE status IN ('adopted','active') AND adopted_at IS NOT NULL AND adopted_at >= ?1"
    ).bind(cutoff).all();
    return (r.results || []).map(x => tokens(x.statement));
  } catch (e) { return []; }
}

// PRECONDITION: model reachable. POSTCONDITION: text or '' (never throws). Handles Workers AI
// chat shape {choices[0].message.content} and text shape {response}. NOTE: reasoning models
// (deepseek-v4, glm-5.x) put the CoT in `reasoning_content` and the ANSWER in `content`; we
// deliberately read ONLY `content` — reasoning_content is internal thinking, never the output.
function extractText(r) {
  if (!r) return '';
  const m = r.choices && r.choices[0] && r.choices[0].message;
  if (m && typeof m.content === 'string' && m.content.trim()) return m.content.trim();
  if (typeof r.response === 'string') return r.response.trim();
  if (r.result && typeof r.result === 'object') return extractText(r.result);
  return '';
}
async function runModel(env, prompt) {
  try {
    const r = await env.AI.run(MODEL, { messages: [{ role: 'user', content: prompt }], max_tokens: 2000, temperature: 0.3 });
    return extractText(r);
  } catch (e) { return ''; }
}

// PRECONDITION: objectives + signals gathered. POSTCONDITION: { goals, rawHead, rawLen }.
async function synthesizeGoals(env, objectives, signals) {
  const objText = objectives.map(o => o.objective_key + ': ' + o.statement).join('\n');
  const prompt = [
    'You are the goal-authorship module of an autonomous research/ops fleet.',
    'Below are the RATIFIED TERMINAL OBJECTIVES (do not change these) and candidate SIGNALS.',
    'TERMINAL OBJECTIVES:\n' + objText,
    'SIGNALS:\n' + signals.join('\n'),
    'Propose up to 6 INSTRUMENTAL goals (specific, falsifiable subgoals/projects/priorities that SERVE the terminal objectives).',
    'Each goal must have: a one-sentence falsifiable statement, a one-line alignment rationale (why it serves which objective), a score 0..1 (falsifiability + leverage + novelty), a falsifiable definition-of-done, and a priority (1=highest..5=lowest).',
    'IMPORTANT: if a signal instead implies CHANGING the terminal objectives/values themselves, mark that item goal_type="objective-revision" (it will be routed to human ratification, NOT auto-adopted). Otherwise goal_type="instrumental".',
    'Return JSON ONLY: {"goals":[{"statement":"...","goal_type":"instrumental|objective-revision","alignment":"...","score":0.0,"dod":"...","priority":1}]}'
  ].join('\n');
  const text = await runModel(env, prompt);
  if (!text) return { goals: [], rawHead: '', rawLen: 0 };
  const rawLen = text.length;
  const rawHead = text.slice(0, 400);
  let jsonText = text.replace(/```(?:json)?/gi, '').trim();
  const firstBrace = jsonText.indexOf('{');
  if (firstBrace > 0) jsonText = jsonText.slice(firstBrace);
  let parsed = null;
  try { parsed = JSON.parse(jsonText); } catch (e) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch (e2) {} }
  }
  const goals = (parsed && Array.isArray(parsed.goals)) ? parsed.goals : [];
  return { goals, rawHead, rawLen };
}

// PRECONDITION: goals table exists. POSTCONDITION: candidate adopted/rejected/queued per type,
// score, and near-dup. INVARIANT: goal_type='objective-revision' NEVER gets status adopted.
async function adoptGoals(env, objectives, candidates) {
  const objKeys = objectives.map(o => o.objective_key);
  const recent = await recentGoalTokens(env);
  let adopted = 0, queuedRevision = 0, rejected = 0, seen = 0, nearDup = 0, dispatched = 0;
  const adoptedList = [];
  for (const c of candidates) {
    const statement = String(c.statement || '').trim();
    if (statement.length < 12) continue;
    seen++;
    const gk = hash(statement.toLowerCase().replace(/\s+/g, ' '));
    const goalType = (c.goal_type === 'objective-revision') ? 'objective-revision' : 'instrumental';
    const score = Math.max(0, Math.min(1, Number(c.score) || 0));
    const dod = String(c.dod || '').trim().slice(0, 500);
    const alignment = String(c.alignment || '').trim().slice(0, 500);
    const priority = Math.max(1, Math.min(5, Number(c.priority) || 3));
    const parent = (c.parent_objective && objKeys.indexOf(c.parent_objective) >= 0) ? c.parent_objective : objKeys[0] || 'mission';
    const program = inferProgram(statement);

    if (goalType === 'objective-revision') {
      // Residual-consent #3: objective revision -> propose->ratify, NEVER auto-adopt.
      await env.AUDIT.prepare(
        `INSERT INTO goals (goal_key, statement, goal_type, parent_objective, alignment, source, score, priority, status, dod, owner, program_code, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(goal_key) DO UPDATE SET status='proposed', updated_at=excluded.updated_at`
      ).bind(gk, statement, 'objective-revision', parent, alignment, 'goal-author', score, priority, 'proposed', dod, 'human-ratify', program, nowIso(), nowIso()).run();
      queuedRevision++;
      continue;
    }

    // R2/F3: skip exact-dup AND thematic near-dup of recently adopted goals.
    const dup = await env.AUDIT.prepare("SELECT id FROM goals WHERE goal_key=?1").bind(gk).first();
    if (dup) { rejected++; continue; }
    const cand = tokens(statement);
    if (recent.some(t => isNearDup(cand, t))) { nearDup++; continue; }
    if (score < SCORE_THRESHOLD || adopted >= ADOPT_CAP) { rejected++; continue; }

    await env.AUDIT.prepare(
      `INSERT INTO goals (goal_key, statement, goal_type, parent_objective, alignment, source, score, priority, status, dod, owner, program_code, adopted_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(goal_key) DO UPDATE SET updated_at=excluded.updated_at`
    ).bind(gk, statement, 'instrumental', parent, alignment, 'goal-author', score, priority, 'adopted', dod, NAME, program, nowIso(), nowIso(), nowIso()).run();

    // Human-readable GTD surface.
    try {
      await env.AUDIT.prepare(
        `INSERT INTO gtd_register (section, line, done, line_date, source, owner, dod, gtd_context)
         VALUES (?,?,?,?,?,?,?,?)`
      ).bind('SELF-AUTHORED GOALS', statement.slice(0, 400), 0, nowIso().slice(0, 10), 'goal-author', NAME, dod, 'self_authored_goal').run();
    } catch (e) { /* best-effort */ }

    // R1: the DRAINABLE ledger. task_dod_register is censused by qnfo-autopilot (overdue),
    // read by fleet-control + fleet-dashboard. This is what makes an adopted goal executable.
    const due = new Date(Date.now() + GOAL_DUE_DAYS * 864e5).toISOString().slice(0, 10);
    try {
      await env.AUDIT.prepare(
        `INSERT INTO task_dod_register (source_table, source_row_id, title, owner, gtd_context, dod, status, evidence_pointer, due)
         VALUES ('self_authored_goal', ?, ?, ?, 'next_action', ?, 'open', ?, ?)
         ON CONFLICT(source_table, source_row_id) DO UPDATE SET title=excluded.title, dod=excluded.dod, due=excluded.due, updated_at=datetime('now')`
      ).bind(gk, statement.slice(0, 400), NAME, dod || statement.slice(0, 200), 'goal:' + gk, due).run();
    } catch (e) { /* best-effort */ }

    // R1b: AUTO-DISPATCH into the execution pipeline (2026-09-15). Research goals go straight
    // into research_queue (status='queued'), which qnfo-idea-triage claims by score DESC and
    // executes to a publication. This closes "drainable but not dispatched". Ops/infra goals
    // route to fleet_improvements (read by fleet-control + the kaizen loop).
    if (program === 'QNFO.RSCH') {
      try {
        await env.AUDIT.prepare(
          `INSERT OR IGNORE INTO research_queue (id, source, source_id, idea, summary, score, decision, status, created_at)
           VALUES (?, 'goal-author', ?, ?, ?, ?, 'ACCEPT', 'queued', ?)`
        ).bind(crypto.randomUUID(), gk, statement.slice(0, 3000), alignment.slice(0, 200), score, nowIso()).run();
        dispatched++;
      } catch (e) { /* best-effort */ }
    } else {
      try {
        await env.AUDIT.prepare(
          `INSERT OR IGNORE INTO fleet_improvements (source, target, kind, title, detail, priority, status)
           VALUES ('goal-author', 'fleet', 'self-authored-goal', ?, ?, 'P2', 'proposed')`
        ).bind(statement.slice(0, 240), (dod || alignment).slice(0, 500)).run();
        dispatched++;
      } catch (e) { /* best-effort */ }
    }

    adopted++;
    recent.push(cand);
    adoptedList.push({ statement: statement.slice(0, 160), score, program, dod: dod.slice(0, 120), parent });
  }
  return { seen, adopted, queuedRevision, rejected, nearDup, dispatched, adoptedList };
}

// PRECONDITION: goals table populated. POSTCONDITION: stale adopted goals retired.
async function rePrioritize(env) {
  let retired = 0;
  const r = await env.AUDIT.prepare("SELECT id, adopted_at FROM goals WHERE status IN ('adopted','active') ORDER BY adopted_at").all();
  for (const g of (r.results || [])) {
    const ageMs = g.adopted_at ? (Date.now() - new Date(g.adopted_at).getTime()) : 0;
    if (ageMs / 864e5 > 60) {
      await env.AUDIT.prepare("UPDATE goals SET status='retired', retired_at=?1, updated_at=?1 WHERE id=?2").bind(nowIso(), g.id).run();
      retired++;
    }
  }
  return { retired };
}

// PRECONDITION: loop ran. POSTCONDITION: receipts + alerts written to cloud_ops_events.
async function receipts(env, summary) {
  try {
    await env.AUDIT.prepare(
      `INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?,?,?,?,?,?,?)`
    ).bind('goal-author-' + Date.now(), nowIso(), 'goal-author-cycle', JSON.stringify(summary).slice(0, 2000), null, NAME, 'done').run();
  } catch (e) { /* best-effort */ }
  // R3: surface objective-revision proposals to the ratification channel.
  if (summary.queuedRevision > 0) {
    try {
      await env.AUDIT.prepare(
        `INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?,?,?,?,?,?,?)`
      ).bind('goal-rev-' + Date.now(), nowIso(), 'objective-revision-proposed',
        summary.queuedRevision + ' objective-revision candidate(s) queued for human ratification (residual-consent #3); never auto-adopted.',
        null, NAME, 'pending-ratification').run();
    } catch (e) { /* best-effort */ }
  }
  // F8: model-empty is otherwise silent; make it a receipted warning.
  if (summary.candidates === 0 && summary.signals > 0) {
    try {
      await env.AUDIT.prepare(
        `INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?,?,?,?,?,?,?)`
      ).bind('goal-warn-' + Date.now(), nowIso(), 'goal-author-model-empty',
        'synthesizeGoals returned 0 candidates from ' + summary.signals + ' signals; model_text_len=' + (summary.model_text_len || 0),
        null, NAME, 'warn').run();
    } catch (e) { /* best-effort */ }
  }
}

// VALUE-PROPOSAL (2026-09-15): the honest "self-authored values" rung. The fleet periodically
// reviews the RATIFIED objective function against recent fleet evidence and PROPOSES revisions
// with falsifiable rationale. Proposals are NEVER auto-adopted — they route to propose->ratify
// (residual-consent #3). "Self-authored values" under an honesty anchor means the fleet authors
// value PROPOSALS; the human ratifies value CHANGES. This is the boundary that keeps independent
// thinking anchored rather than silent objective drift.
async function reviewValues(env) {
  await ensureSchema(env);
  const objectives = await loadObjectives(env);
  const evidence = await gatherSignals(env);
  const prompt = [
    'You are the value-review module of an autonomous fleet. The terminal objective (value function) is HUMAN-RATIFIED; propose revisions only, never change it yourself.',
    'RATIFIED OBJECTIVES:\n' + objectives.map(o => o.objective_key + ': ' + o.statement).join('\n'),
    'FLEET EVIDENCE (recent):\n' + evidence.join('\n'),
    'Propose up to 3 SPECIFIC, FALSIFIABLE revisions to the objective function or its weights/constraints. Each needs: the change, a one-line falsifiable rationale, and the evidence that would justify it.',
    'If no revision is warranted, return an empty array.',
    'Return JSON ONLY: {"revisions":[{"change":"...","rationale":"...","evidence":"..."}]}'
  ].join('\n');
  const text = await runModel(env, prompt);
  if (!text) return { ok: false, why: 'model empty' };
  let jsonText = text.replace(/```(?:json)?/gi, '').trim();
  const fb = jsonText.indexOf('{');
  if (fb > 0) jsonText = jsonText.slice(fb);
  let parsed = null;
  try { parsed = JSON.parse(jsonText); } catch (e) { const m = text.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch (e2) {} } }
  const revs = (parsed && Array.isArray(parsed.revisions)) ? parsed.revisions : [];
  let proposed = 0;
  for (const r of revs) {
    const change = String(r.change || '').trim();
    if (change.length < 12) continue;
    const gk = 'vrev-' + hash(change.toLowerCase().replace(/\s+/g, ' '));
    await env.AUDIT.prepare(
      `INSERT INTO goals (goal_key, statement, goal_type, parent_objective, alignment, source, score, priority, status, dod, owner, program_code, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(goal_key) DO UPDATE SET updated_at=excluded.updated_at`
    ).bind(gk, change, 'objective-revision', objectives[0] ? objectives[0].objective_key : 'objective-function',
           'rationale: ' + String(r.rationale || '').slice(0, 300) + ' | evidence: ' + String(r.evidence || '').slice(0, 300),
           'value-review', 0, 3, 'proposed', 'human ratification of proposed objective revision', 'human-ratify', 'QNFO.OPS', nowIso(), nowIso()).run();
    proposed++;
  }
  try {
    await env.AUDIT.prepare(
      `INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?,?,?,?,?,?,?)`
    ).bind('vrev-' + Date.now(), nowIso(), proposed > 0 ? 'value-revision-proposed' : 'value-review-clean',
           proposed > 0 ? proposed + ' objective-function revision(s) proposed for human ratification (residual-consent #3).' : 'value review ran; no revision warranted against current evidence.',
           null, NAME, proposed > 0 ? 'pending-ratification' : 'done').run();
  } catch (e) { /* best-effort */ }
  return { ok: true, proposed, revisions: revs.map(r => String(r.change || '').slice(0, 120)) };
}

// PRECONDITION: schema + objectives ready. POSTCONDITION: one full authorship cycle with receipt.
async function authorLoop(env) {
  await ensureSchema(env);
  const objectives = await loadObjectives(env);
  const signals = await gatherSignals(env);
  const synth = await synthesizeGoals(env, objectives, signals);
  const candidates = synth.goals || [];
  const adoption = await adoptGoals(env, objectives, candidates);
  const reprio = await rePrioritize(env);
  const summary = {
    ok: true,
    version: VERSION,
    objectives: objectives.length,
    signals: signals.length,
    candidates: candidates.length,
    model_text_len: synth.rawLen || 0,
    ...adoption,
    ...reprio,
    at: nowIso()
  };
  await receipts(env, summary);
  return summary;
}

export default {
  async scheduled(event, env, ctx) {
    const cron = event.cron;
    if (cron === '0 3 * * 1') {
      ctx.waitUntil(reviewValues(env).catch(e => console.error('goal-author value-review error:', e && e.message || e)));
      return;
    }
    ctx.waitUntil(authorLoop(env).catch(e => console.error('goal-author cron error:', e && e.message || e)));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const mutate = (path === '/author' || path === '/reprioritize' || path === '/review-values');
    try {
      if (mutate && !authorized(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
      if (path === '/health') {
        await ensureSchema(env);
        const g = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM goals").first();
        const o = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM objectives").first();
        const a = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM goals WHERE status IN ('adopted','active')").first();
        let drained = { n: 0 };
        try { drained = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM task_dod_register WHERE source_table='self_authored_goal' AND status='open'").first(); } catch (e) {}
        let queued = { n: 0 };
        try { queued = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM research_queue WHERE source='goal-author' AND status='queued'").first(); } catch (e) {}
        return json({ ok: true, name: NAME, version: VERSION, objectives: o.n || 0, goals_total: g.n || 0, goals_active: a.n || 0, goals_drainable_open: drained.n || 0, goals_queued_for_exec: queued.n || 0 });
      }
      if (path === '/author' && request.method === 'POST') return json(await authorLoop(env));
      if (path === '/reprioritize' && request.method === 'POST') return json({ ok: true, ...(await rePrioritize(env)) });
      if (path === '/review-values' && request.method === 'POST') return json(await reviewValues(env));
      if (path === '/objectives') {
        const r = await env.AUDIT.prepare("SELECT * FROM objectives ORDER BY id").all();
        return json({ ok: true, count: r.results.length, objectives: r.results });
      }
      if (path === '/goals') {
        const r = await env.AUDIT.prepare("SELECT * FROM goals ORDER BY priority, score DESC LIMIT 100").all();
        return json({ ok: true, count: r.results.length, goals: r.results });
      }
      return json({ ok: true, name: NAME, version: VERSION, endpoints: ['/health', '/author', '/reprioritize', '/review-values', '/objectives', '/goals'] });
    } catch (err) {
      return json({ ok: false, error: String(err && err.stack || err.message || err) }, 500);
    }
  }
};
