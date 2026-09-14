// qnfo-goal-author v0.1.0 — SELF-AUTHORED GOALS: the fleet authors its own INSTRUMENTAL goals.
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
//   6. auto-adopt top-N instrumental goals (dod + owner + gtd_register DoD row)
//   7. route objective-revision to proposed (ratification queue, never adopted)
//   8. re-prioritize / retire stale goals
//   9. write receipts (signals + cloud_ops_events)
//
// CANONICAL: QNFO/qnfo-workers/qnfo-goal-author/worker.js. DEPLOY: wrangler (D1 AUDIT + cron).
const VERSION = '0.1.0';
const NAME = 'qnfo-goal-author';
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const ADOPT_CAP = 3;          // max instrumental goals auto-adopted per cycle
const SCORE_THRESHOLD = 0.5;  // min score to adopt
const MAX_SIGNAL_CHARS = 6000; // bound on the signal text fed to the model

function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
function nowIso() { return new Date().toISOString(); }
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return 'g' + (h >>> 0).toString(36) + s.length.toString(36);
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
      adopted_at TEXT, completed_at TEXT, retired_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`
  ).run();
  await env.AUDIT.prepare('CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status)').run();
  await env.AUDIT.prepare('CREATE INDEX IF NOT EXISTS idx_goals_type ON goals(goal_type)').run();
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
  // bound total
  let total = 0;
  const out = [];
  for (const s of signals) { total += s.length; if (total > MAX_SIGNAL_CHARS) break; out.push(s); }
  return out;
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

// PRECONDITION: objectives + signals gathered. POSTCONDITION: parsed candidate-goal array
// (statement, goal_type, alignment, score, dod, priority). Objective-revision candidates are
// emitted with goal_type='objective-revision' and are never auto-adopted downstream.
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
  // Strip markdown code fences + any leading prose before the first '{'.
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

// PRECONDITION: goals table exists. POSTCONDITION: candidate adopted/rejected/queued per type
// and score; returns a receipt summary. INVARIANT: goal_type='objective-revision' NEVER gets
// status 'adopted'/'active' — it is written 'proposed' only.
async function adoptGoals(env, objectives, candidates) {
  const objKeys = objectives.map(o => o.objective_key);
  let adopted = 0, queuedRevision = 0, rejected = 0, seen = 0;
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

    if (goalType === 'objective-revision') {
      // Residual-consent #3: objective revision -> propose->ratify, never auto-adopt.
      await env.AUDIT.prepare(
        `INSERT INTO goals (goal_key, statement, goal_type, parent_objective, alignment, source, score, priority, status, dod, owner, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(goal_key) DO UPDATE SET status='proposed', updated_at=excluded.updated_at`
      ).bind(gk, statement, 'objective-revision', parent, alignment, 'goal-author', score, priority, 'proposed', dod, 'human-ratify', nowIso(), nowIso()).run();
      queuedRevision++;
      continue;
    }

    // Instrumental: dedupe + threshold gate.
    const dup = await env.AUDIT.prepare("SELECT id FROM goals WHERE goal_key=?1").bind(gk).first();
    if (dup) { rejected++; continue; }
    if (score < SCORE_THRESHOLD || adopted >= ADOPT_CAP) { rejected++; continue; }

    await env.AUDIT.prepare(
      `INSERT INTO goals (goal_key, statement, goal_type, parent_objective, alignment, source, score, priority, status, dod, owner, adopted_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(goal_key) DO UPDATE SET updated_at=excluded.updated_at`
    ).bind(gk, statement, 'instrumental', parent, alignment, 'goal-author', score, priority, 'adopted', dod, NAME, nowIso(), nowIso(), nowIso()).run();

    // Falsifiable DoD into the GTD register (owner = fleet; drains like any other open work).
    try {
      await env.AUDIT.prepare(
        `INSERT INTO gtd_register (section, line, done, line_date, source, owner, dod, gtd_context)
         VALUES (?,?,?,?,?,?,?,?)`
      ).bind('SELF-AUTHORED GOALS', statement.slice(0, 400), 0, nowIso().slice(0, 10), 'goal-author', NAME, dod, 'self_authored_goal').run();
    } catch (e) { /* gtd_register write is best-effort */ }

    adopted++;
    adoptedList.push({ statement: statement.slice(0, 160), score, dod: dod.slice(0, 120), parent });
  }
  return { seen, adopted, queuedRevision, rejected, adoptedList };
}

// PRECONDITION: goals table populated. POSTCONDITION: stale adopted goals demoted/retired,
// done goals closed. Returns counts. Read-only w.r.t. objectives.
async function rePrioritize(env) {
  let retired = 0, demoted = 0;
  const r = await env.AUDIT.prepare("SELECT id, statement, status, adopted_at FROM goals WHERE status IN ('adopted','active') ORDER BY adopted_at").all();
  const rows = r.results || [];
  const cutoff = nowIso();
  for (const g of rows) {
    const ageMs = g.adopted_at ? (Date.now() - new Date(g.adopted_at).getTime()) : 0;
    const days = ageMs / 864e5;
    // retire goals older than 14 days with no completion (stale) — keeps the set live.
    if (days > 14) {
      await env.AUDIT.prepare("UPDATE goals SET status='retired', retired_at=?1, updated_at=?1 WHERE id=?2").bind(cutoff, g.id).run();
      retired++;
    }
  }
  return { retired, demoted };
}

// PRECONDITION: loop ran. POSTCONDITION: receipts written to cloud_ops_events + signals.
async function receipts(env, summary) {
  try {
    await env.AUDIT.prepare(
      `INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?,?,?,?,?,?,?)`
    ).bind('goal-author-' + Date.now(), nowIso(), 'goal-author-cycle', JSON.stringify(summary).slice(0, 2000), null, NAME, 'done').run();
  } catch (e) { /* best-effort */ }
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
    model_head: synth.rawHead || '',
    ...adoption,
    ...reprio,
    at: nowIso()
  };
  await receipts(env, summary);
  return summary;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(authorLoop(env).catch(e => console.error('goal-author cron error:', e && e.message || e)));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === '/health') {
        await ensureSchema(env);
        const g = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM goals").first();
        const o = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM objectives").first();
        const a = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM goals WHERE status IN ('adopted','active')").first();
        return json({ ok: true, name: NAME, version: VERSION, objectives: o.n || 0, goals_total: g.n || 0, goals_active: a.n || 0 });
      }
      if (path === '/author' && request.method === 'POST') return json(await authorLoop(env));
      if (path === '/reprioritize' && request.method === 'POST') return json({ ok: true, ...(await rePrioritize(env)) });
      if (path === '/objectives') {
        const r = await env.AUDIT.prepare("SELECT * FROM objectives ORDER BY id").all();
        return json({ ok: true, count: r.results.length, objectives: r.results });
      }
      if (path === '/goals') {
        const r = await env.AUDIT.prepare("SELECT * FROM goals ORDER BY priority, score DESC LIMIT 100").all();
        return json({ ok: true, count: r.results.length, goals: r.results });
      }
      return json({ ok: true, name: NAME, version: VERSION, endpoints: ['/health', '/author', '/reprioritize', '/objectives', '/goals'] });
    } catch (err) {
      return json({ ok: false, error: String(err && err.stack || err.message || err) }, 500);
    }
  }
};
