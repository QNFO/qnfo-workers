// SIGNAL-LEARNING-1 (owner directive 2026-11-13): every worker that chooses, ranks or produces something for a person
// improves itself from signals, dynamically, with no fixed keyword or rule list. Reference adopter: rwnq8/tv (index.html).
// Algorithm: (1) turn each outcome into a signed weight (strong signal = completion, reuse, reply, click-through-and-stay;
// weak = partial; negative = quick drop, explicit dislike, bounce); (2) credit the weight to the features of the item
// (terms, source, kind) in a store whose entries decay with a half-life, so old evidence fades and nothing is permanent;
// (3) rank new candidates by the summed feature score plus an exploration term so unseen things still get tried;
// (4) three strikes: repeated explicit negatives on one source switch it off, and a later strong positive removes a strike;
// (5) every change to the learner's own settings is a prediction that settle() keeps or reverts against the metric and its guards.
export const STOP = new Set("the and for with this that from your you are was were what why how who when into about over out not but all can will just more than then them they their its our has have had been being one two new get got make made like best top video official full".split(" "));
export const HALF_LIFE_MS = 30 * 864e5;

export function tokens(text) {
  const w = String(text || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((x) => x.length > 2 && !STOP.has(x));
  const out = w.slice();
  for (let i = 0; i < w.length - 1; i++) out.push(w[i] + " " + w[i + 1]);
  return out;
}

// Signed weight for one outcome. completion is 0..1 or null when the length is unknown; elapsedS is seconds engaged.
export function signalWeight({ completion = null, elapsedS = 0, liked = false, disliked = false } = {}) {
  if (liked) return 2;
  if (disliked) return -2;
  if (completion !== null) return completion >= 0.8 ? 1 : completion >= 0.4 ? 0.3 : (completion < 0.1 && elapsedS < 25 ? -0.8 : 0);
  return elapsedS > 600 ? 0.6 : elapsedS < 20 ? -0.8 : 0;
}

export class Learner {
  constructor(state = {}, now = () => Date.now()) {
    this.now = now;
    this.terms = state.terms || {}; this.src = state.src || {}; this.strikes = state.strikes || {}; this.banned = state.banned || [];
    this.maxTerms = state.maxTerms || 500;
  }
  decayed(e) { return e ? e[0] * Math.pow(0.5, (this.now() - e[1]) / HALF_LIFE_MS) : 0; }
  bump(map, k, w) { map[k] = [this.decayed(map[k]) + w, this.now()]; }
  observe(item, weight, { explicit = false } = {}) {
    if (!weight) return;
    for (const t of tokens(item.title)) this.bump(this.terms, t, weight);
    this.bump(this.src, item.source, weight * 1.5);
    if (explicit && weight < 0) {
      this.strikes[item.source] = (this.strikes[item.source] || 0) + 1;
      if (this.strikes[item.source] >= 3 && !this.banned.includes(item.source)) this.banned.push(item.source);
    } else if (weight >= 1 && this.strikes[item.source]) this.strikes[item.source]--;
    const ks = Object.keys(this.terms);
    if (ks.length > this.maxTerms + 100) {
      ks.sort((a, b) => Math.abs(this.decayed(this.terms[a])) - Math.abs(this.decayed(this.terms[b])));
      for (const k of ks.slice(0, ks.length - this.maxTerms)) delete this.terms[k];
    }
  }
  restore(source) { this.banned = this.banned.filter((b) => b !== source); this.strikes[source] = 0; }
  score(item) {
    const t = tokens(item.title); let n = 0;
    for (const x of t) n += this.decayed(this.terms[x]);
    return (t.length ? n / Math.sqrt(t.length) : 0) + this.decayed(this.src[item.source]);
  }
  // Highest score first with an exploration term; banned sources never appear.
  rank(items, { explore = 1.6, rand = Math.random } = {}) {
    return items.filter((i) => !this.banned.includes(i.source))
      .map((i) => ({ i, w: this.score(i) + rand() * explore })).sort((a, b) => b.w - a.w).map((x) => x.i);
  }
  top(sign, n = 6) {
    return Object.keys(this.terms).map((k) => [k, this.decayed(this.terms[k])]).filter((x) => (sign > 0 ? x[1] > 0.5 : x[1] < -0.5))
      .sort((a, b) => sign * (b[1] - a[1])).slice(0, n).map((x) => x[0]);
  }
  toJSON() { return { terms: this.terms, src: this.src, strikes: this.strikes, banned: this.banned, maxTerms: this.maxTerms }; }
}

// Self-change protocol: a change to the learner's own knob (explore share, half-life, threshold) is kept only when the target
// metric moved the right way and no guard metric got worse; otherwise it is reverted. Returns the verdict, never throws.
export function settle({ before, after, polarity = 1, guards = [] }) {
  if (![before, after].every(Number.isFinite)) return { keep: false, why: "metric unmeasured" };
  const moved = (after - before) * polarity > 0;
  const worse = guards.filter((g) => (g.after - g.before) * (g.polarity || 1) < 0).map((g) => g.name);
  return moved && !worse.length ? { keep: true, why: "target moved, guards held" } : { keep: false, why: moved ? "guard worsened: " + worse.join(",") : "target did not move" };
}
