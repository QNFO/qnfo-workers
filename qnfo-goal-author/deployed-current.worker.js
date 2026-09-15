var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "0.4.0";
var NAME = "qnfo-goal-author";
var MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
var ADOPT_CAP = 3;
var SCORE_THRESHOLD = 0.5;
var MAX_SIGNAL_CHARS = 6e3;
var DUP_JACCARD = 0.45;
var DUP_CONTAINMENT = 0.6;
var DUP_WINDOW_DAYS = 30;
var GOAL_DUE_DAYS = 90;
function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
__name(json, "json");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = h * 31 + s.charCodeAt(i) | 0;
  }
  return "g" + (h >>> 0).toString(36) + s.length.toString(36);
}
__name(hash, "hash");
function tokens(s) {
  const out = /* @__PURE__ */ new Set();
  for (const w of String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)) {
    if (w.length > 3) out.add(w);
  }
  return out;
}
__name(tokens, "tokens");
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
__name(jaccard, "jaccard");
function containment(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / Math.min(a.size, b.size);
}
__name(containment, "containment");
function isNearDup(a, b) {
  return jaccard(a, b) >= DUP_JACCARD || containment(a, b) >= DUP_CONTAINMENT;
}
__name(isNearDup, "isNearDup");
function inferProgram(statement) {
  const s = String(statement || "").toLowerCase();
  if (/(quantum|anyon|topolog|thermodynamic|neuromorph|holograph|research|theorem|deriv|physical|simul|entropy|landauer|superconduct|verlinde|braid|majorana)/.test(s)) return "QNFO.RSCH";
  if (/(worker|deploy|cloudflare| d1| r2| kv|cron|infra|registry|dns|pipeline)/.test(s)) return "QNFO.INFRA";
  return "QNFO.OPS";
}
__name(inferProgram, "inferProgram");
function authorized(request, env) {
  const t = env.GOAL_AUTHOR_TOKEN;
  if (!t) return true;
  return (request.headers.get("x-goal-token") || "") === t;
}
__name(authorized, "authorized");
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
  await env.AUDIT.prepare("CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status)").run();
  await env.AUDIT.prepare("CREATE INDEX IF NOT EXISTS idx_goals_type ON goals(goal_type)").run();
  try {
    await env.AUDIT.prepare("ALTER TABLE goals ADD COLUMN program_code TEXT").run();
  } catch (e) {
  }
  const seeds = [
    {
      key: "mission",
      statement: "Every recurring function runs in the cloud. The fleet operates, heals, audits, improves, publishes, and promotes itself. The human role narrows to policy-setting and exception handling.",
      source: "docs/AUTONOMOUS-FLEET-ARCHITECTURE.md \xA71.1 Mission"
    },
    {
      key: "objective-function",
      statement: "Maximize SAI = 0.30*autonomy + 0.15*thinking + 0.15*decision + 0.15*self_improv + 0.10*reliability + 0.10*integration + 0.05*governance, subject to the autonomy-ladder cap, cost ceilings (A9), and the residual-consent boundary.",
      source: "docs/FLEET-REPORT-CARD.md objective function + A9"
    }
  ];
  for (const s of seeds) {
    await env.AUDIT.prepare(
      `INSERT OR IGNORE INTO objectives (objective_key, statement, source, ratified_by, ratified_on) VALUES (?,?,?,?,?)`
    ).bind(s.key, s.statement, s.source, "human (standing directive)", "2026-09-14").run();
  }
}
__name(ensureSchema, "ensureSchema");
async function loadObjectives(env) {
  const r = await env.AUDIT.prepare("SELECT * FROM objectives WHERE status='ACTIVE' ORDER BY id").all();
  return r.results || [];
}
__name(loadObjectives, "loadObjectives");
async function gatherSignals(env) {
  const signals = [];
  const push = /* @__PURE__ */ __name((label, text) => {
    const t = String(text || "").trim();
    if (t.length >= 8) signals.push(label + ": " + t.slice(0, 400));
  }, "push");
  const tryRows = /* @__PURE__ */ __name(async (sql, label, field) => {
    try {
      const r = await env.AUDIT.prepare(sql).all();
      for (const row of r.results || []) push(label, row[field]);
    } catch (e) {
    }
  }, "tryRows");
  await tryRows("SELECT idea, score FROM idea_proposals WHERE status IN ('approved','triaged_hold') AND score >= 0.5 ORDER BY score DESC LIMIT 10", "idea", "idea");
  await tryRows("SELECT question FROM self_questions WHERE status='open' ORDER BY id DESC LIMIT 8", "research-question", "question");
  await tryRows("SELECT dimension || ' gap: ' || gap AS g FROM autonomy_scores WHERE score < 3.0 ORDER BY score ASC LIMIT 6", "autonomy-gap", "g");
  await tryRows("SELECT summary FROM self_heal_actions WHERE status IN ('open','pending') ORDER BY id DESC LIMIT 5", "heal-action", "summary");
  await tryRows("SELECT content FROM signals ORDER BY id DESC LIMIT 5", "signal", "content");
  let total = 0;
  const out = [];
  for (const s of signals) {
    total += s.length;
    if (total > MAX_SIGNAL_CHARS) break;
    out.push(s);
  }
  return out;
}
__name(gatherSignals, "gatherSignals");
async function recentGoalTokens(env) {
  const cutoff = new Date(Date.now() - DUP_WINDOW_DAYS * 864e5).toISOString();
  try {
    const r = await env.AUDIT.prepare(
      "SELECT statement FROM goals WHERE status IN ('adopted','active') AND adopted_at IS NOT NULL AND adopted_at >= ?1"
    ).bind(cutoff).all();
    return (r.results || []).map((x) => tokens(x.statement));
  } catch (e) {
    return [];
  }
}
__name(recentGoalTokens, "recentGoalTokens");
function extractText(r) {
  if (!r) return "";
  const m = r.choices && r.choices[0] && r.choices[0].message;
  if (m && typeof m.content === "string" && m.content.trim()) return m.content.trim();
  if (typeof r.response === "string") return r.response.trim();
  if (r.result && typeof r.result === "object") return extractText(r.result);
  return "";
}
__name(extractText, "extractText");
async function runModel(env, prompt) {
  try {
    const r = await env.AI.run(MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: 2e3, temperature: 0.3 });
    return extractText(r);
  } catch (e) {
    return "";
  }
}
__name(runModel, "runModel");
async function synthesizeGoals(env, objectives, signals) {
  const objText = objectives.map((o) => o.objective_key + ": " + o.statement).join("\n");
  const prompt = [
    "You are the goal-authorship module of an autonomous research/ops fleet.",
    "Below are the RATIFIED TERMINAL OBJECTIVES (do not change these) and candidate SIGNALS.",
    "TERMINAL OBJECTIVES:\n" + objText,
    "SIGNALS:\n" + signals.join("\n"),
    "Propose up to 6 INSTRUMENTAL goals (specific, falsifiable subgoals/projects/priorities that SERVE the terminal objectives).",
    "Each goal must have: a one-sentence falsifiable statement, a one-line alignment rationale (why it serves which objective), a score 0..1 (falsifiability + leverage + novelty), a falsifiable definition-of-done, and a priority (1=highest..5=lowest).",
    'IMPORTANT: if a signal instead implies CHANGING the terminal objectives/values themselves, mark that item goal_type="objective-revision" (it will be routed to human ratification, NOT auto-adopted). Otherwise goal_type="instrumental".',
    'Return JSON ONLY: {"goals":[{"statement":"...","goal_type":"instrumental|objective-revision","alignment":"...","score":0.0,"dod":"...","priority":1}]}'
  ].join("\n");
  const text = await runModel(env, prompt);
  if (!text) return { goals: [], rawHead: "", rawLen: 0 };
  const rawLen = text.length;
  const rawHead = text.slice(0, 400);
  let jsonText = text.replace(/```(?:json)?/gi, "").trim();
  const firstBrace = jsonText.indexOf("{");
  if (firstBrace > 0) jsonText = jsonText.slice(firstBrace);
  let parsed = null;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        parsed = JSON.parse(m[0]);
      } catch (e2) {
      }
    }
  }
  const goals = parsed && Array.isArray(parsed.goals) ? parsed.goals : [];
  return { goals, rawHead, rawLen };
}
__name(synthesizeGoals, "synthesizeGoals");
async function adoptGoals(env, objectives, candidates) {
  const objKeys = objectives.map((o) => o.objective_key);
  const recent = await recentGoalTokens(env);
  let adopted = 0, queuedRevision = 0, rejected = 0, seen = 0, nearDup = 0, dispatched = 0;
  const adoptedList = [];
  for (const c of candidates) {
    const statement = String(c.statement || "").trim();
    if (statement.length < 12) continue;
    seen++;
    const gk = hash(statement.toLowerCase().replace(/\s+/g, " "));
    const goalType = c.goal_type === "objective-revision" ? "objective-revision" : "instrumental";
    const score = Math.max(0, Math.min(1, Number(c.score) || 0));
    const dod = String(c.dod || "").trim().slice(0, 500);
    const alignment = String(c.alignment || "").trim().slice(0, 500);
    const priority = Math.max(1, Math.min(5, Number(c.priority) || 3));
    const parent = c.parent_objective && objKeys.indexOf(c.parent_objective) >= 0 ? c.parent_objective : objKeys[0] || "mission";
    const program = inferProgram(statement);
    if (goalType === "objective-revision") {
      await env.AUDIT.prepare(
        `INSERT INTO goals (goal_key, statement, goal_type, parent_objective, alignment, source, score, priority, status, dod, owner, program_code, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(goal_key) DO UPDATE SET status='proposed', updated_at=excluded.updated_at`
      ).bind(gk, statement, "objective-revision", parent, alignment, "goal-author", score, priority, "proposed", dod, "human-ratify", program, nowIso(), nowIso()).run();
      queuedRevision++;
      continue;
    }
    const dup = await env.AUDIT.prepare("SELECT id FROM goals WHERE goal_key=?1").bind(gk).first();
    if (dup) {
      rejected++;
      continue;
    }
    const cand = tokens(statement);
    if (recent.some((t) => isNearDup(cand, t))) {
      nearDup++;
      continue;
    }
    if (score < SCORE_THRESHOLD || adopted >= ADOPT_CAP) {
      rejected++;
      continue;
    }
    await env.AUDIT.prepare(
      `INSERT INTO goals (goal_key, statement, goal_type, parent_objective, alignment, source, score, priority, status, dod, owner, program_code, adopted_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(goal_key) DO UPDATE SET updated_at=excluded.updated_at`
    ).bind(gk, statement, "instrumental", parent, alignment, "goal-author", score, priority, "adopted", dod, NAME, program, nowIso(), nowIso(), nowIso()).run();
    try {
      await env.AUDIT.prepare(
        `INSERT INTO gtd_register (section, line, done, line_date, source, owner, dod, gtd_context)
         VALUES (?,?,?,?,?,?,?,?)`
      ).bind("SELF-AUTHORED GOALS", statement.slice(0, 400), 0, nowIso().slice(0, 10), "goal-author", NAME, dod, "self_authored_goal").run();
    } catch (e) {
    }
    const due = new Date(Date.now() + GOAL_DUE_DAYS * 864e5).toISOString().slice(0, 10);
    try {
      await env.AUDIT.prepare(
        `INSERT INTO task_dod_register (source_table, source_row_id, title, owner, gtd_context, dod, status, evidence_pointer, due)
         VALUES ('self_authored_goal', ?, ?, ?, 'next_action', ?, 'open', ?, ?)
         ON CONFLICT(source_table, source_row_id) DO UPDATE SET title=excluded.title, dod=excluded.dod, due=excluded.due, updated_at=datetime('now')`
      ).bind(gk, statement.slice(0, 400), NAME, dod || statement.slice(0, 200), "goal:" + gk, due).run();
    } catch (e) {
    }
    if (program === "QNFO.RSCH") {
      try {
        await env.AUDIT.prepare(
          `INSERT OR IGNORE INTO research_queue (id, source, source_id, idea, summary, score, decision, status, created_at)
           VALUES (?, 'goal-author', ?, ?, ?, ?, 'ACCEPT', 'queued', ?)`
        ).bind(crypto.randomUUID(), gk, statement.slice(0, 3e3), alignment.slice(0, 200), score, nowIso()).run();
        dispatched++;
      } catch (e) {
      }
    } else {
      try {
        await env.AUDIT.prepare(
          `INSERT OR IGNORE INTO fleet_improvements (source, target, kind, title, detail, priority, status)
           VALUES ('goal-author', 'fleet', 'self-authored-goal', ?, ?, 'P2', 'proposed')`
        ).bind(statement.slice(0, 240), (dod || alignment).slice(0, 500)).run();
        dispatched++;
      } catch (e) {
      }
    }
    adopted++;
    recent.push(cand);
    adoptedList.push({ statement: statement.slice(0, 160), score, program, dod: dod.slice(0, 120), parent });
  }
  return { seen, adopted, queuedRevision, rejected, nearDup, dispatched, adoptedList };
}
__name(adoptGoals, "adoptGoals");
async function rePrioritize(env) {
  let retired = 0;
  const r = await env.AUDIT.prepare("SELECT id, adopted_at FROM goals WHERE status IN ('adopted','active') ORDER BY adopted_at").all();
  for (const g of r.results || []) {
    const ageMs = g.adopted_at ? Date.now() - new Date(g.adopted_at).getTime() : 0;
    if (ageMs / 864e5 > 60) {
      await env.AUDIT.prepare("UPDATE goals SET status='retired', retired_at=?1, updated_at=?1 WHERE id=?2").bind(nowIso(), g.id).run();
      retired++;
    }
  }
  return { retired };
}
__name(rePrioritize, "rePrioritize");
async function receipts(env, summary) {
  try {
    await env.AUDIT.prepare(
      `INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?,?,?,?,?,?,?)`
    ).bind("goal-author-" + Date.now(), nowIso(), "goal-author-cycle", JSON.stringify(summary).slice(0, 2e3), null, NAME, "done").run();
  } catch (e) {
  }
  if (summary.queuedRevision > 0) {
    try {
      await env.AUDIT.prepare(
        `INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?,?,?,?,?,?,?)`
      ).bind(
        "goal-rev-" + Date.now(),
        nowIso(),
        "objective-revision-proposed",
        summary.queuedRevision + " objective-revision candidate(s) queued for human ratification (residual-consent #3); never auto-adopted.",
        null,
        NAME,
        "pending-ratification"
      ).run();
    } catch (e) {
    }
  }
  if (summary.candidates === 0 && summary.signals > 0) {
    try {
      await env.AUDIT.prepare(
        `INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?,?,?,?,?,?,?)`
      ).bind(
        "goal-warn-" + Date.now(),
        nowIso(),
        "goal-author-model-empty",
        "synthesizeGoals returned 0 candidates from " + summary.signals + " signals; model_text_len=" + (summary.model_text_len || 0),
        null,
        NAME,
        "warn"
      ).run();
    } catch (e) {
    }
  }
}
__name(receipts, "receipts");
async function reviewValues(env) {
  await ensureSchema(env);
  const objectives = await loadObjectives(env);
  const evidence = await gatherSignals(env);
  const prompt = [
    "You are the value-review module of an autonomous fleet. The terminal objective (value function) is HUMAN-RATIFIED; propose revisions only, never change it yourself.",
    "RATIFIED OBJECTIVES:\n" + objectives.map((o) => o.objective_key + ": " + o.statement).join("\n"),
    "FLEET EVIDENCE (recent):\n" + evidence.join("\n"),
    "Propose up to 3 SPECIFIC, FALSIFIABLE revisions to the objective function or its weights/constraints. Each needs: the change, a one-line falsifiable rationale, and the evidence that would justify it.",
    "If no revision is warranted, return an empty array.",
    'Return JSON ONLY: {"revisions":[{"change":"...","rationale":"...","evidence":"..."}]}'
  ].join("\n");
  const text = await runModel(env, prompt);
  if (!text) return { ok: false, why: "model empty" };
  let jsonText = text.replace(/```(?:json)?/gi, "").trim();
  const fb = jsonText.indexOf("{");
  if (fb > 0) jsonText = jsonText.slice(fb);
  let parsed = null;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        parsed = JSON.parse(m[0]);
      } catch (e2) {
      }
    }
  }
  const revs = parsed && Array.isArray(parsed.revisions) ? parsed.revisions : [];
  let proposed = 0;
  for (const r of revs) {
    const change = String(r.change || "").trim();
    if (change.length < 12) continue;
    const gk = "vrev-" + hash(change.toLowerCase().replace(/\s+/g, " "));
    await env.AUDIT.prepare(
      `INSERT INTO goals (goal_key, statement, goal_type, parent_objective, alignment, source, score, priority, status, dod, owner, program_code, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(goal_key) DO UPDATE SET updated_at=excluded.updated_at`
    ).bind(
      gk,
      change,
      "objective-revision",
      objectives[0] ? objectives[0].objective_key : "objective-function",
      "rationale: " + String(r.rationale || "").slice(0, 300) + " | evidence: " + String(r.evidence || "").slice(0, 300),
      "value-review",
      0,
      3,
      "proposed",
      "human ratification of proposed objective revision",
      "human-ratify",
      "QNFO.OPS",
      nowIso(),
      nowIso()
    ).run();
    proposed++;
  }
  try {
    await env.AUDIT.prepare(
      `INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?,?,?,?,?,?,?)`
    ).bind(
      "vrev-" + Date.now(),
      nowIso(),
      proposed > 0 ? "value-revision-proposed" : "value-review-clean",
      proposed > 0 ? proposed + " objective-function revision(s) proposed for human ratification (residual-consent #3)." : "value review ran; no revision warranted against current evidence.",
      null,
      NAME,
      proposed > 0 ? "pending-ratification" : "done"
    ).run();
  } catch (e) {
  }
  return { ok: true, proposed, revisions: revs.map((r) => String(r.change || "").slice(0, 120)) };
}
__name(reviewValues, "reviewValues");
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
__name(authorLoop, "authorLoop");
var worker_default = {
  async scheduled(event, env, ctx) {
    const cron = event.cron;
    if (cron === "0 3 * * 1") {
      ctx.waitUntil(reviewValues(env).catch((e) => console.error("goal-author value-review error:", e && e.message || e)));
      return;
    }
    ctx.waitUntil(authorLoop(env).catch((e) => console.error("goal-author cron error:", e && e.message || e)));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const mutate = path === "/author" || path === "/reprioritize" || path === "/review-values";
    try {
      if (mutate && !authorized(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
      if (path === "/health") {
        await ensureSchema(env);
        const g = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM goals").first();
        const o = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM objectives").first();
        const a = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM goals WHERE status IN ('adopted','active')").first();
        let drained = { n: 0 };
        try {
          drained = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM task_dod_register WHERE source_table='self_authored_goal' AND status='open'").first();
        } catch (e) {
        }
        let queued = { n: 0 };
        try {
          queued = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM research_queue WHERE source='goal-author' AND status='queued'").first();
        } catch (e) {
        }
        return json({ ok: true, name: NAME, version: VERSION, objectives: o.n || 0, goals_total: g.n || 0, goals_active: a.n || 0, goals_drainable_open: drained.n || 0, goals_queued_for_exec: queued.n || 0 });
      }
      if (path === "/author" && request.method === "POST") return json(await authorLoop(env));
      if (path === "/reprioritize" && request.method === "POST") return json({ ok: true, ...await rePrioritize(env) });
      if (path === "/review-values" && request.method === "POST") return json(await reviewValues(env));
      if (path === "/objectives") {
        const r = await env.AUDIT.prepare("SELECT * FROM objectives ORDER BY id").all();
        return json({ ok: true, count: r.results.length, objectives: r.results });
      }
      if (path === "/goals") {
        const r = await env.AUDIT.prepare("SELECT * FROM goals ORDER BY priority, score DESC LIMIT 100").all();
        return json({ ok: true, count: r.results.length, goals: r.results });
      }
      return json({ ok: true, name: NAME, version: VERSION, endpoints: ["/health", "/author", "/reprioritize", "/review-values", "/objectives", "/goals"] });
    } catch (err) {
      return json({ ok: false, error: String(err && err.stack || err.message || err) }, 500);
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
