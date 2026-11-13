// _shared/improve-loop.js: SELF-IMPROVE-1 (Rowan, 2026-11-13). "How do you improve yourself? What signals can you use? What algorithm keeps
// improving you dynamically through feedback loops? This belongs in the doctrine of Ultrastable and of all the workers."
//
// The algorithm, one pass per component (worker, prompt, scorer, cron, rule), run by the component's own clock:
//   1 SENSE      read signals (SIGNALS below), each normalised to a gap in [0,1] against its target.
//   2 DIAGNOSE   rank gaps by gap x weight x controllability; the largest is the one being worked.
//   3 CHOOSE     pick one knob for that gap by UCB1 over the knob's recorded outcomes (explore untried knobs, exploit what moved the metric).
//   4 APPLY      one change per component, with a prediction, a baseline and a backup (rollback text), written to the adaptation ledger.
//   5 VERIFY     after a window of at least minSamples observations, compare after to before.
//   6 JUDGE      keep when the target moved beyond noise and no guard worsened; otherwise roll back. Two failed tries retire the knob for the gap.
//   7 WRITE-BACK the verdict updates the knob's record, which step 3 reads next pass. The loop closes without a person.
//
// Pure ESM, no imports, no I/O: workers inline it (scripts/inline-pipeline-modules.mjs) or import it in tests. The ledger is the caller's
// (D1 flow_adaptations for the fleet, loop-registry.json for Ultrastable).

export const IMPROVE_VERSION = "1.0.0";
export const DIRECTIVE_ID = "SELF-IMPROVE-1";

// Signal classes a component may read. `external` signals are outcomes in the world; the rest are proxies and never decide a keep alone.
export const SIGNALS = {
  outcome: { external: true, examples: "reader engaged sessions, replies, interviews, subscribers, task accepted by its consumer" },
  correction: { external: true, examples: "owner edit or undo, reopened issue, reverted deploy, a tap that said No" },
  failure: { external: false, examples: "exceptions, probe failures, retries, timeouts, empty or degenerate output" },
  guard: { external: false, examples: "cost, latency, wontfix share, suppression and opt-out rate, personal/research separation" },
  contrast: { external: false, examples: "an independent judge of a disjoint model family, a deterministic gate, an A/B against the previous version" },
  neglect: { external: true, examples: "outputs nobody read, opened or consumed: a flow with no returning signal" },
};

// gap in [0,1]: 0 at or beyond target, 1 at the worst plausible value. polarity "up" means higher is better.
export function normalizedGap({ value, target, worst, polarity = "up" }) {
  if (![value, target, worst].every(Number.isFinite)) return null;
  const span = polarity === "up" ? target - worst : worst - target;
  if (span <= 0) return null;
  const short = polarity === "up" ? target - value : value - target;
  return Math.max(0, Math.min(1, short / span));
}

// DIAGNOSE: signals = [{id, gap, weight=1, controllability=1, external=false}], largest priority first. A missing gap (null) is a blind
// spot and is returned in `blind` so a component that cannot measure itself treats that as its first gap (measure before tuning).
export function diagnose(signals) {
  const blind = signals.filter((s) => s.gap == null).map((s) => s.id);
  const ranked = signals.filter((s) => s.gap != null && s.gap > 0)
    .map((s) => ({ ...s, priority: s.gap * (s.weight ?? 1) * (s.controllability ?? 1) * (s.external ? 1.25 : 1) }))
    .sort((a, b) => b.priority - a.priority);
  return { target: ranked[0] || null, ranked, blind };
}

// CHOOSE: UCB1 over knob records [{knob, tries, keeps, retired}]. An untried knob goes first; a retired knob is skipped.
export function chooseKnob(records, c = 1.2) {
  const live = records.filter((r) => !r.retired);
  if (!live.length) return null;
  const fresh = live.find((r) => !r.tries);
  if (fresh) return { knob: fresh.knob, why: "untried" };
  const n = live.reduce((s, r) => s + r.tries, 0);
  let best = null;
  for (const r of live) {
    const score = r.keeps / r.tries + c * Math.sqrt(Math.log(n) / r.tries);
    if (!best || score > best.score) best = { knob: r.knob, score, why: "ucb1" };
  }
  return best;
}

// JUDGE: before/after = {mean, n, sd}; guards = [{id, before, after, polarity, tolerance}]. Keep only when the target moved in the predicted
// direction by more than two standard errors, enough samples arrived, and no guard worsened beyond its tolerance.
export function judge({ before, after, polarity = "up", minSamples = 30, guards = [] }) {
  if (!after || after.n < minSamples) return { verdict: "wait", reason: "samples " + (after ? after.n : 0) + " < " + minSamples };
  const se = Math.sqrt(((before.sd ?? 0) ** 2) / Math.max(1, before.n) + ((after.sd ?? 0) ** 2) / Math.max(1, after.n));
  const delta = (after.mean - before.mean) * (polarity === "up" ? 1 : -1);
  const worse = guards.filter((g) => ((g.after - g.before) * (g.polarity === "up" ? -1 : 1)) > (g.tolerance ?? 0)).map((g) => g.id);
  if (worse.length) return { verdict: "revert", reason: "guard worsened: " + worse.join(","), delta };
  if (delta > 2 * se && delta > 0) return { verdict: "keep", reason: "moved " + delta.toFixed(4) + " > 2se " + (2 * se).toFixed(4), delta };
  return { verdict: "revert", reason: "no move beyond noise (" + delta.toFixed(4) + " vs 2se " + (2 * se).toFixed(4) + ")", delta };
}

// WRITE-BACK: fold a verdict into the knob record. Two reverts in a row retire the knob for this gap (a remedy that did not move its metric
// is replaced, not repeated).
export function recordVerdict(rec, verdict) {
  const next = { ...rec, tries: (rec.tries || 0) + 1, keeps: (rec.keeps || 0) + (verdict === "keep" ? 1 : 0) };
  next.streak = verdict === "revert" ? (rec.streak || 0) + 1 : 0;
  next.retired = next.streak >= 2;
  return next;
}

// One pass. `state` = {signals, knobs:[records]}; returns the change to apply (or null) as a ledger row the caller writes before acting.
export function plan(state, { now = Date.now() } = {}) {
  const d = diagnose(state.signals);
  if (d.blind.length && !d.target) return { action: "instrument", signal: d.blind[0], why: "no measurable gap: build the measurement first" };
  if (!d.target) return { action: "hold", why: "every measured gap is zero" };
  const pick = chooseKnob(state.knobs.filter((k) => !k.for || k.for === d.target.id));
  if (!pick) return { action: "originate", signal: d.target.id, why: "every knob for this gap is retired: file a new lever" };
  return { action: "change", signal: d.target.id, knob: pick.knob, why: pick.why, prediction: { metric: d.target.id, direction: "better", baseline_gap: d.target.gap }, at: now };
}
