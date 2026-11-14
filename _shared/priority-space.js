// _shared/priority-space.js: PRIORITY-SPACE-1 (owner directive 2026-11-14). "All of these breaches and issues represent vectors in a
// high dimensional space. How are you going to navigate that most effectively, considering cost and the constraints each impose?"
//
// Measured 2026-11-14 (qnfo-audit): 732 open issues, 529 labelled critical. The one-dimensional label is saturated, so v_issue_queue
// ordered by id in practice. This module ranks issues as vectors:
//   value axes  severity, breach (live metric hit), age (minutes past the 120-minute SLA), leverage (open siblings in the same family:
//               one root-cause fix closes many), reach (touches an outside-facing surface)
//   cost axes   effort (no code-task line = a planner pass first), contention (claimed by another session), retries (code loop exhausted)
// Navigation: (1) collapse each family to one representative carrying the family's leverage, (2) keep the Pareto front of value vs cost,
// (3) order by expected value per unit cost (a knapsack greedy ratio), (4) fill a budget. Weights are a knob: learnWeights() nudges them toward
// the axes whose picks actually closed (closed-with-evidence per cost), the SELF-IMPROVE-1 write-back. Pure ESM, no I/O.

export const PRIORITY_SPACE_VERSION = "1.0.0";

export const DEFAULT_WEIGHTS = { severity: 1.0, breach: 1.5, age: 0.6, leverage: 1.2, reach: 0.8 };
const SEV = { critical: 1, high: 0.7, medium: 0.4, low: 0.2 };

// Family key: the rule id before the first colon (CF-OBS-ISSUE-1, METRIC-TRIGGER-3061-..., ROADMAP-1).
export function familyOf(title = "") {
  const t = String(title).trim();
  const head = (t.includes(":") ? t.slice(0, t.indexOf(":")) : t.split(/\s+/)[0] || t).slice(0, 40);
  return head.replace(/\[retry \d+\]\s*/i, "");
}

export function vectorize(issue, familySize = 1, nowMs = Date.now()) {
  const ca = issue.created_at;
  const created = typeof ca === "number" ? ca : Date.parse(ca ? String(ca).replace(" ", "T") + (String(ca).endsWith("Z") ? "" : "Z") : "");
  const ageMin = Number.isFinite(created) ? Math.max(0, (nowMs - created) / 60000) : 0;
  const desc = String(issue.description || "");
  const fam = familyOf(issue.title);
  return {
    id: issue.id,
    family: fam,
    value: {
      severity: SEV[issue.priority] ?? 0.3,
      breach: issue.metric_hit ? 1 : /^METRIC-TRIGGER-/.test(issue.title || "") ? 0.6 : 0,
      age: Math.min(1, Math.max(0, ageMin - 120) / (7 * 1440)),
      leverage: Math.min(1, Math.log2(1 + familySize) / 6),
      reach: /reader|qnfo\.org|q08\.org|qwav|public|paper|publish/i.test(`${issue.title} ${issue.category || ""}`) ? 1 : 0,
    },
    cost: 1 + (desc.includes("code-task:") ? 0 : 1) + (issue.linked_session ? 2 : 0) + (/EXHAUSTED|retry \d+/i.test(issue.title || "") ? 1.5 : 0),
  };
}

export function score(vec, weights = DEFAULT_WEIGHTS) {
  let v = 0;
  for (const k of Object.keys(weights)) v += (weights[k] || 0) * (vec.value[k] || 0);
  return { value: v, ratio: v / vec.cost };
}

// a dominates b when it is no worse on value and cost and strictly better on one.
function dominates(a, b) {
  return a.s.value >= b.s.value && a.cost <= b.cost && (a.s.value > b.s.value || a.cost < b.cost);
}

export function paretoFront(items) {
  return items.filter((b) => !items.some((a) => a !== b && dominates(a, b)));
}

// rank(issues, {budget, weights}) -> {picks, front, families}. picks fill `budget` cost units, one representative per family first.
export function rank(issues, { budget = Infinity, weights = DEFAULT_WEIGHTS, nowMs = Date.now() } = {}) {
  const famCount = new Map();
  for (const i of issues) { const f = familyOf(i.title); famCount.set(f, (famCount.get(f) || 0) + 1); }
  const vecs = issues.map((i) => { const v = vectorize(i, famCount.get(familyOf(i.title)), nowMs); return { ...v, s: score(v, weights) }; });
  const rep = new Map();
  for (const v of vecs) { const r = rep.get(v.family); if (!r || v.s.ratio > r.s.ratio) rep.set(v.family, v); }
  const reps = [...rep.values()];
  const frontIds = new Set(paretoFront(reps).map((v) => v.id));
  const ordered = reps.sort((a, b) => (frontIds.has(b.id) - frontIds.has(a.id)) || b.s.ratio - a.s.ratio || a.id - b.id);
  const picks = []; let spent = 0;
  for (const v of ordered) { if (spent + v.cost > budget) continue; picks.push(v); spent += v.cost; }
  return { picks, front: [...frontIds], families: famCount.size, spent };
}

// learnWeights(weights, outcomes): outcomes = [{vec, closed:boolean}]. Multiplicative update toward axes whose picks closed per unit cost;
// bounded to [0.1, 3] so no axis dies or dominates. Caller keeps or reverts the new weights by its closed-per-cost metric (settle).
export function learnWeights(weights, outcomes, rate = 0.2) {
  const next = { ...weights };
  for (const k of Object.keys(next)) {
    let num = 0, den = 0;
    for (const o of outcomes) { const x = o.vec.value[k] || 0; den += x; num += x * ((o.closed ? 1 : 0) / o.vec.cost); }
    if (den === 0) continue;
    const base = outcomes.reduce((a, o) => a + (o.closed ? 1 : 0) / o.vec.cost, 0) / outcomes.length;
    const lift = base > 0 ? num / den / base : 1;
    next[k] = Math.min(3, Math.max(0.1, next[k] * Math.pow(lift, rate)));
  }
  return next;
}
