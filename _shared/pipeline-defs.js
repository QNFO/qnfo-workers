// _shared/pipeline-defs.js: PIPELINE-ENGINE-1 peers. The research and job pipelines registered on the shared engine
// (_shared/pipeline-engine.js) as observed pipelines: their stages keep running in their own workers (qnfo-research-exec,
// qnfo-jobsearch), and `project(status)` maps each worker's own status column onto the engine's stage model, so the status
// view (personal-companion /pipelines) reads research, jobs and personal the same way. Moving their execution onto the
// engine's Workflow executor is tracked by the PIPELINE-ENGINE-PORT loop issue; until then nothing here writes to their tables.
//
// The engine is passed in, so this file has no imports (it is inlined next to the engine).
//
// PIPELINE-ENGINE-PORT-1 (2026-11-12): the job pipeline is executed. jobApplicationPipeline is one run per application, opened
// when jobsearch_matches.status reaches `applied` (or later), and its waits are Workflow sleeps that read the status once a day
// instead of the hourly status scan. It reads jobsearch_matches and writes only pipeline_runs and pipeline_evidence in qnfo-audit:
// match ids and job statuses, nothing from the personal plane. Owner rule (2026-11-12, FOLLOWUP-ONLY-INTERVIEW-1): no reply is
// not a rejection, so the run never writes a status; a quiet application ends as "quiet" and the status stays applied.

export function researchPipeline(E) {
  // qnfo-audit.research_queue.status, measured 2026-11-12: owner_paused 956, published 546, deferred 499, merged 154, queued 152,
  // wontfix 96, researching 2.
  const MAP = {
    queued: { stage: "idea", state: "active" },
    researching: { stage: "research", state: "active" },
    drafting: { stage: "draft", state: "active" },
    revising: { stage: "revise", state: "active" },
    review: { stage: "review", state: "active" },
    published: { stage: "publication", state: "done" },
    deferred: { stage: "idea", state: "parked" },
    owner_paused: { stage: "idea", state: "parked" },
    merged: { stage: "idea", state: "superseded" },
    wontfix: { stage: "idea", state: "dropped" }
  };
  // PIPELINE-ENGINE-PORT-1 (2026-11-12): executed. Every idea from the moment qnfo-research-exec claims it is a run of
  // researchRunPipeline below (Workflow `research-run`); ideas still waiting in the queue are read from research_queue.status.
  return E.definePipeline({
    name: "research", label: "Research: idea to publication", plane: "research", version: "1.0.0", mode: "executed", runs: "research-run",
    executor: "Cloudflare Workflow research-run, one run per claimed idea",
    source: { db: "qnfo-audit", table: "research_queue", status: "status", ts: "created_at" },
    stages: [
      { key: "idea", label: "Idea" }, { key: "research", label: "Research" }, { key: "draft", label: "Draft" },
      { key: "review", label: "Review and correct" }, { key: "revise", label: "Revise" }, { key: "publication", label: "Publication" }
    ],
    project: (status) => MAP[status] || { stage: "research", state: "active" }
  });
}

export function jobsPipeline(E) {
  // qnfo-audit.jobsearch_matches.status (qnfo-jobsearch DECIDED and OUTCOME_STATUSES).
  const MAP = {
    new: { stage: "found", state: "active" },
    pending_owner_approval: { stage: "found", state: "active" },
    saved: { stage: "shortlist", state: "active" },
    approved: { stage: "shortlist", state: "active" },
    applied: { stage: "applied", state: "active" },
    screening: { stage: "conversation", state: "active" },
    replied: { stage: "conversation", state: "active" },
    interview: { stage: "conversation", state: "active" },
    offer: { stage: "offer", state: "done" },
    no_reply: { stage: "applied", state: "parked" },
    rejected: { stage: "found", state: "dropped" },
    hidden: { stage: "found", state: "dropped" },
    expired: { stage: "found", state: "dropped" },
    withdrawn: { stage: "applied", state: "dropped" }
  };
  // PIPELINE-ENGINE-PORT-1 (2026-11-12): executed. Every application from `applied` onward is a run of jobApplicationPipeline below
  // (Cloudflare Workflow `job-application`, class JobApplicationFlow in personal-companion, state in qnfo-audit pipeline_runs); the
  // funnel before it (found, shortlisted) is still read from jobsearch_matches.status.
  return E.definePipeline({
    name: "jobs", label: "Jobs: posting to offer", plane: "jobs", version: "1.0.0", mode: "executed", runs: "job-application",
    executor: "Cloudflare Workflow job-application, one run per application",
    source: { db: "qnfo-audit", table: "jobsearch_matches", status: "status", ts: "first_seen" },
    stages: [
      { key: "found", label: "Found" }, { key: "shortlist", label: "Shortlisted" }, { key: "applied", label: "Applied" },
      { key: "conversation", label: "In conversation" }, { key: "offer", label: "Offer" }
    ],
    project: (status) => MAP[status] || { stage: "found", state: "active" }
  });
}

// The milestones of the job pipeline that become events in the personal pipeline (how it landed, a win to count).
export const JOB_MILESTONES = ["applied", "replied", "screening", "interview", "offer", "no_reply"];

// ------------------------------------------------------------------ PIPELINE-ENGINE-PORT-1: the executed job pipeline
export const JOB_CONVERSATION = ["replied", "screening", "interview"];
export const JOB_TERMINAL = ["offer", "rejected", "withdrawn", "no_reply"];
export const JOB_OPEN = ["applied"].concat(JOB_CONVERSATION);
export const JOB_FOLLOWUP_DAYS = 45;      // a reply can come weeks later; the status is never flipped (owner 2026-11-12)
export const JOB_CONVERSATION_DAYS = 60;

async function jobStatus(ctx, id) {
  const r = await ctx.jobsDb.prepare("SELECT status FROM jobsearch_matches WHERE id = ?").bind(id).first();
  return r ? String(r.status || "") : "gone";
}

export function jobApplicationPipeline(E) {
  return E.definePipeline({
    name: "job-application", label: "Job application: applied to outcome", plane: "jobs", version: "1.0.0",
    input: { type: "object", required: ["match_id"], props: { match_id: { type: "string" } } },
    stages: [
      { key: "applied", label: "Applied", out: { type: "object", required: ["status"] },
        async run(s, ctx) { const st = await jobStatus(ctx, s.match_id); return { out: { status: st }, state: { status: st } }; } },
      { key: "followup", label: "Waiting for a reply",
        async run(s, ctx) {
          const st = await jobStatus(ctx, s.match_id);
          if (st === "applied") return { wait: true, detail: { days: JOB_FOLLOWUP_DAYS } };
          return { out: { moved: st }, state: { moved: st } };
        },
        wait: { every: "1 day", max: JOB_FOLLOWUP_DAYS,
          poll: async (s, ctx) => { const st = await jobStatus(ctx, s.match_id); return st === "applied" ? null : st; },
          resume: async (s, got, ctx, info) => ({ out: { moved: got, quiet: !!info.timedOut }, state: { moved: got } }) } },
      { key: "conversation", label: "In conversation",
        async run(s, ctx) {
          if (!JOB_CONVERSATION.includes(s.moved)) return { out: { skipped: true }, state: { final: s.moved || null } };
          const st = await jobStatus(ctx, s.match_id);
          if (JOB_TERMINAL.includes(st) || st === "gone") return { out: { final: st }, state: { final: st } };
          return { wait: true, detail: { days: JOB_CONVERSATION_DAYS } };
        },
        wait: { every: "1 day", max: JOB_CONVERSATION_DAYS,
          poll: async (s, ctx) => { const st = await jobStatus(ctx, s.match_id); return JOB_TERMINAL.includes(st) || st === "gone" ? st : null; },
          resume: async (s, got, ctx, info) => ({ out: { final: got, quiet: !!info.timedOut }, state: { final: got || s.moved } }) } },
      { key: "outcome", label: "Outcome", out: { type: "object", required: ["outcome"] },
        async run(s) {
          const f = s.final || s.moved || null;
          const outcome = f === "offer" ? "offer" : f === "rejected" ? "rejected" : f === "withdrawn" ? "withdrawn" : f === "no_reply" ? "no_reply"
            : JOB_CONVERSATION.includes(f) ? "conversation_quiet" : f === "gone" ? "gone" : "quiet";
          return { out: { outcome }, state: { outcome } };
        } }
    ],
    output: (s) => ({ outcome: s.outcome, match_id: s.match_id })
  });
}

// One tick (personal-companion hourly cron): open a run per application that reached `applied` and has none, start it on the
// Workflow (inline when the binding is absent or create() throws), adopt Workflow runs that went quiet for 3 days (a poll writes
// updated_at once a day), and resume inline runs that are due. db is qnfo-audit.
export async function jobsTick(E, env, opts = {}) {
  const db = env.AUDIT, def = jobApplicationPipeline(E), now = (opts.now || (() => new Date().toISOString()))();
  if (!db) return { skipped: "no AUDIT binding" };
  await E.ensureEngine(db);
  const res = { opened: 0, workflow: 0, inline: 0, adopted: 0 };
  // An open application always counts; a closed status counts only when the role was applied for (a rejected posting the owner
  // turned down never was an application).
  const q = (a) => a.map(() => "?").join(",");
  const rows = (await db.prepare("SELECT m.id FROM jobsearch_matches m WHERE (m.status IN (" + q(JOB_OPEN) + ") OR (m.status IN (" + q(JOB_TERMINAL) + ") AND EXISTS (SELECT 1 FROM jobsearch_events e WHERE e.match_id = m.id AND e.event = 'applied'))) AND NOT EXISTS (SELECT 1 FROM pipeline_runs r WHERE r.pipeline = 'job-application' AND r.subject_ref = m.id) ORDER BY m.id LIMIT ?")
    .bind(...JOB_OPEN, ...JOB_TERMINAL, opts.limit || 25).all()).results || [];
  return startRuns(E, db, def, env.JOB_FLOW, rows.map((r) => ({ ref: String(r.id), input: { match_id: String(r.id) } })), now, 3 * 864e5, { jobsDb: db, now: opts.now }, res);
}

// Shared by the executed peers: open a run per subject, start it on its Workflow (inline when the binding is absent or create()
// throws, with evidence), adopt Workflow runs quiet for longer than staleMs (a poll writes updated_at each period), resume inline
// runs that are due.
export async function startRuns(E, db, def, flow, subjects, now, staleMs, ctx, res) {
  res = res || { opened: 0, workflow: 0, inline: 0, adopted: 0 };
  for (const sj of subjects) {
    const o = await E.openRun(db, def, sj.input, { subjectRef: sj.ref, now });
    if (!o.created) continue;
    res.opened++;
    let started = false;
    if (flow && typeof flow.create === "function") {
      try { await flow.create({ id: o.id, params: { runId: o.id } }); await E.setMode(db, o.id, "workflow", now); started = true; res.workflow++; }
      catch (e) { await E.evidence(db, o.id, def.name, "start", false, { workflow_create: String(e && e.message || e).slice(0, 200), fallback: "inline" }, now); }
    }
    if (!started) res.inline++;
  }
  const stale = new Date(Date.parse(now) - staleMs).toISOString();
  const ad = await db.prepare("UPDATE pipeline_runs SET mode = 'inline', next_check_at = ?, updated_at = ? WHERE pipeline = ? AND mode = 'workflow' AND status IN ('queued','running','waiting') AND updated_at < ?").bind(now, now, def.name, stale).run();
  res.adopted = ad && ad.meta ? Number(ad.meta.changes) || 0 : 0;
  res.resume = await E.resumeDue(db, def, ctx, 20);
  return res;
}

// The Workflow body: the same runPipeline the inline path uses, with the Workflow's own step.
export async function runJobWorkflow(E, env, payload, step) {
  const id = payload && payload.runId;
  return E.runPipeline(env.AUDIT, jobApplicationPipeline(E), id, step, { jobsDb: env.AUDIT });
}

// ------------------------------------------------------------------ PIPELINE-ENGINE-PORT-1: the executed research pipeline
// qnfo-research-exec keeps doing the work (grounding, drafting, review, revision, publication) and writes research_queue.status and
// .stage; a research-run follows one claimed idea through those stages with Workflow sleeps, records evidence for each, and ends on
// its outcome. It writes only pipeline_runs and pipeline_evidence; research_queue is never written here.
export const RESEARCH_TERMINAL = ["published", "wontfix", "merged", "deferred", "owner_paused"];
const RESEARCH_RANK = { ground: 1, ensemble: 1, reconcile: 1, research: 1, draft: 1, review: 2, revise: 3, complete: 4, done: 4 };
export const RESEARCH_STAGE_DAYS = 7;

async function researchState(ctx, id) {
  const r = await ctx.auditDb.prepare("SELECT status, stage FROM research_queue WHERE id = ?").bind(id).first();
  if (!r) return { status: "gone", rank: 9, terminal: true };
  const status = String(r.status || ""), stage = String(r.stage || "");
  return { status, stage, rank: status === "published" ? 5 : (RESEARCH_RANK[stage] || 1), terminal: RESEARCH_TERMINAL.includes(status) };
}

// A stage that passes once the idea is beyond `rank` (or finished), polling every 6 hours for up to a week.
function progressStage(key, label, rank) {
  const past = (c) => c.terminal || c.rank > rank;
  return { key, label,
    async run(s, ctx) { const c = await researchState(ctx, s.research_id); if (past(c)) return { out: { passed: c.status + "/" + c.stage }, state: { last: c } }; return { wait: true }; },
    wait: { every: "6 hours", max: RESEARCH_STAGE_DAYS * 4,
      poll: async (s, ctx) => { const c = await researchState(ctx, s.research_id); return past(c) ? c : null; },
      resume: async (s, got, ctx, info) => ({ out: { passed: got ? got.status + "/" + got.stage : null, quiet: !!info.timedOut }, state: { last: got || s.last || null } }) } };
}

export function researchRunPipeline(E) {
  return E.definePipeline({
    name: "research-run", label: "Research run: claimed idea to publication", plane: "research", version: "1.0.0",
    input: { type: "object", required: ["research_id"], props: { research_id: { type: "string" } } },
    stages: [
      progressStage("research", "Research and draft", 1),
      progressStage("review", "Review and correct", 2),
      progressStage("revise", "Revise", 3),
      { key: "publication", label: "Publication",
        async run(s, ctx) { const c = await researchState(ctx, s.research_id); if (c.terminal) return { out: { status: c.status }, state: { last: c } }; return { wait: true }; },
        wait: { every: "6 hours", max: RESEARCH_STAGE_DAYS * 4,
          poll: async (s, ctx) => { const c = await researchState(ctx, s.research_id); return c.terminal ? c : null; },
          resume: async (s, got, ctx, info) => ({ out: { status: got ? got.status : null, quiet: !!info.timedOut }, state: { last: got || s.last || null } }) } },
      { key: "outcome", label: "Outcome", out: { type: "object", required: ["outcome"] },
        async run(s) {
          const st = s.last && s.last.status;
          const outcome = st === "published" ? "published" : st === "merged" ? "merged" : st === "wontfix" ? "dropped" : (st === "deferred" || st === "owner_paused") ? "parked" : st === "gone" ? "gone" : "quiet";
          return { out: { outcome }, state: { outcome } };
        } }
    ],
    output: (s) => ({ outcome: s.outcome, research_id: s.research_id })
  });
}

// One tick: a run for each idea qnfo-research-exec is working on or claimed or published in the last 3 days.
export async function researchTick(E, env, opts = {}) {
  const db = env.AUDIT, def = researchRunPipeline(E), now = (opts.now || (() => new Date().toISOString()))();
  if (!db) return { skipped: "no AUDIT binding" };
  await E.ensureEngine(db);
  const since = new Date(Date.parse(now) - 3 * 864e5).toISOString();
  const rows = (await db.prepare("SELECT q.id FROM research_queue q WHERE (q.status = 'researching' OR q.claimed_at >= ? OR q.published_at >= ?) AND NOT EXISTS (SELECT 1 FROM pipeline_runs r WHERE r.pipeline = 'research-run' AND r.subject_ref = q.id) ORDER BY q.id LIMIT ?")
    .bind(since, since, opts.limit || 25).all()).results || [];
  return startRuns(E, db, def, env.RESEARCH_FLOW, rows.map((r) => ({ ref: String(r.id), input: { research_id: String(r.id) } })), now, 864e5, { auditDb: db, now: opts.now });
}

export async function runResearchWorkflow(E, env, payload, step) {
  return E.runPipeline(env.AUDIT, researchRunPipeline(E), payload && payload.runId, step, { auditDb: env.AUDIT });
}

// The run pipeline behind an executed funnel, by its def.runs name.
export function runsDef(E, name) {
  return name === "job-application" ? jobApplicationPipeline(E) : name === "research-run" ? researchRunPipeline(E) : null;
}
