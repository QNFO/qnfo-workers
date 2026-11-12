// _shared/pipeline-defs.js: PIPELINE-ENGINE-1 peers. The research and job pipelines registered on the shared engine
// (_shared/pipeline-engine.js) as observed pipelines: their stages keep running in their own workers (qnfo-research-exec,
// qnfo-jobsearch), and `project(status)` maps each worker's own status column onto the engine's stage model, so the status
// view (personal-companion /pipelines) reads research, jobs and personal the same way. Moving their execution onto the
// engine's Workflow executor is tracked by the PIPELINE-ENGINE-PORT loop issue; until then nothing here writes to their tables.
//
// The engine is passed in, so this file has no imports (it is inlined next to the engine).

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
  return E.definePipeline({
    name: "research", label: "Research: idea to publication", plane: "research", version: "1.0.0", mode: "observed",
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
  return E.definePipeline({
    name: "jobs", label: "Jobs: posting to offer", plane: "jobs", version: "1.0.0", mode: "observed",
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
