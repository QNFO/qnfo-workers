// q08-prediction-markets: the paper-trading proving ground for q08's information edge (PM-CHARTER-1).
// Paper money only. No wallet, no exchange key, no order ever leaves this worker: the only executor in this file writes D1 rows.
var VERSION = "1.6.2";

// ---------- charter (the machine-readable form; GET /api/charter serves it with the live evidence) ----------
export const CHARTER = {
  id: "PM-CHARTER-1",
  pillar: "personal",
  objective: "Find short-term, non-sports prediction-market questions where an independently researched probability beats the market price, and prove that on paper before any real money is considered.",
  thesis: "A model that only reads the price adds nothing. The edge has to come from information the crowd has not priced yet: fresh reporting and q08's own signal sources (Hacker News, GDELT and Wikipedia, the same sources as the research ledger behind q08 forecasts), read by several model families that never see the price. The literature says to expect no edge by default (a retrieval-augmented ensemble scored Brier 0.179 against 0.149 for the human crowd, Halawi et al. 2024), so every claim of an edge is measured here against the market price and against simply backing the market favourite.",
  mode: "paper",
  universe: { sports: "excluded", quant: "excluded: price brackets and post counts have no news signal", horizon_days: 14, min_volume24: 10000, price_band: [0.05, 0.95] },
  method: { evidence: ["gdelt", "hacker-news", "wikipedia-search", "wikipedia-current-events"], ensemble_min_members: 2, max_spread: 0.25, min_gap: 0.10, price_hidden_from_model: true, hold: "to resolution; early exit only on convergence to the estimate",
    recalibration: "logistic slope and shift learned from resolved first forecasts, ridge-pulled to the identity, bounded, applied after 50 resolved", blend: "weight on the model chosen by Brier score on resolved forecasts, default 0.5", sizing: "quarter Kelly on the blended probability, capped at the position limit",
    scoring: "the first forecast on each market, with lead time; log loss reported beside Brier", log: "append-only and hash-chained, public at /api/track-record", domains: "proof split by domain; a domain significantly worse than the price after 20 resolved forecasts is switched off for 14 days", max_market_spread: 0.05, paper: "/whitepaper" },
  risk: { start_cash: 10000, position_pct: 0.05, exposure_pct: 0.30, max_open: 8, slippage: 0.01, breaker_drawdown_pct: 15 },
  graduation: { min_days: 30, min_resolved_estimates: 100, min_resolved_trades: 30, max_drawdown_pct: 20, confidence: 0.95, frozen_sample: true, rule: "on forecasts made under the current, frozen parameters only: the model (or model+market blend) beats the market price on Brier, shadow ROI after costs is above zero, and signal trades beat backing the market favourite, each with the 95% bootstrap interval clear of zero" },
  live: { enabled: false, why: "Real orders need a wallet-signed key, an API key, funding and a jurisdiction and terms-of-service review: the owner's identity, accounts and money. This worker contains no live executor. When the graduation gate passes, the owner decision is requested as an IDENTITY-BOUND item whose default is to stay on paper." },
  loops: [
    "tick every 5 minutes: fetch, filter sports, settle estimates that resolved, estimate up to 2 new markets, trade clear gaps, exit on resolution or convergence",
    "review on every tick: score resolved first forecasts, apply the drawdown/accuracy circuit breaker with an expiry, and tune within bounds (minimum gap 8-20 points, recalibration, blend weight, switching off a losing domain) at most weekly; every parameter change starts a new frozen evaluation sample and is logged in pt_decision with a rollback",
    "publish: metric_registry values (including pm_chain_ok, the forecast-log integrity check) and the worker heartbeat in qnfo-audit, where the fleet's metric triggers file breaches as issues",
    "graduation: evaluated continuously; never flips live by itself",
  ],
};
const CFG = { START: 10000, POS_PCT: 0.10, EXPO_PCT: 0.30, STOP: 0.15, TAKE: 0.30, SLIP: 0.01, MAX_OPEN: 8,
  HORIZON_D: 14, SIG_MIN_VOL: 10000, MIN_EDGE: 0.10, SIG_POS_PCT: 0.05, MAX_EST: 2, EST_TTL_H: 6, CONVERGE: 0.03, MAX_SPREAD: 0.25, MIN_MEMBERS: 2,
  EDGE_MIN: 0.08, EDGE_MAX: 0.20, BREAKER_DD: 15, PAUSE_H: 24,
  KELLY: 0.25, MAX_SPREAD_MKT: 0.05, TUNE_DAYS: 7, RECAL_MIN: 50, BLEND_MIN: 50, DOMAIN_MIN: 20, DOMAIN_OFF_DAYS: 14 };
const ENSEMBLE = ["glm-5.3-flash", "kimi-k2.6", "gpt-oss-120b"]; // three model families (zai, moonshot, openai) from the MODEL-FLOOR-1 allowed table, none of which sees the market price

// ---------- pure engine (tested in engine.test.mjs) ----------
export function parseMarket(m) {
  let p = m.outcomePrices;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch { p = null; } }
  const yes = p ? parseFloat(p[0]) : NaN;
  if (!m.slug || !(yes >= 0 && yes <= 1)) return null;
  const t = Date.parse(m.endDate || "");
  const out = { slug: m.slug, title: m.question || m.slug, yes, vol24: +m.volume24hr || 0, move: +m.oneDayPriceChange || 0, closed: m.closed ? 1 : 0, ends_at: Number.isFinite(t) ? new Date(t).toISOString() : null, spread: Number.isFinite(+m.spread) && m.spread !== null && m.spread !== "" ? +m.spread : null };
  // Polymarket marks sports structurally (market sportsMarketType and gameStartTime, event gameId); keywords catch what it does not mark
  const marked = !!(m.sportsMarketType || m.gameStartTime || (Array.isArray(m.events) && m.events.some((e) => e && e.gameId)));
  out.sports = marked || isSports({ title: out.title, slug: m.slug, category: m.category || m.groupItemTitle || "" }) ? 1 : 0;
  return out;
}
const SPORTS_RE = /\b(nba|nfl|mlb|nhl|wnba|ufc|mma|ncaa|fifa|uefa|epl|premier league|la liga|serie a|bundesliga|ligue 1|champions league|europa league|world cup|super bowl|stanley cup|world series|playoffs?|grand slam|wimbledon|us open|french open|australian open|atp|wta|formula 1|f1|grand prix|nascar|pga|the masters|ryder cup|olympics?|boxing|cricket|ipl|rugby|touchdown|moneyline|over\/under|o\/u|mvp|heisman|ballon d'or|vs|win on 20\d\d-\d\d-\d\d|exact score|any other score|correct score|total goals|both teams to score|esports?|league of legends|dota 2?|valorant|counter-strike|cs2|worlds 20\d\d)\b|\bspread\s*[:(]|\bpost\s+\d[\d-]*\s+tweets\b/i;
export const isSports = (m) => /sport/i.test(m.category || "") || SPORTS_RE.test((m.title || "") + " " + (m.slug || "").replace(/-/g, " "));
export const daysUntil = (iso, now = Date.now()) => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? (t - now) / 86400000 : null; };
export function syntheticMarkets(now = Date.now()) {
  const names = ["Rates cut next meeting", "BTC above 100k by Dec", "Bill passes Senate", "Storm landfall this week", "Chip export rule lifted"];
  const b = Math.floor(now / 300000);
  return names.map((n, i) => {
    const w = (k) => (Math.sin((b + k) * 1.7 + i * 2.3) + 1) / 2;
    const yes = Math.min(0.97, Math.max(0.03, 0.2 + 0.6 * w(0)));
    return { slug: "synthetic-" + i, title: n + " (synthetic)", yes: +yes.toFixed(3), vol24: 20000 + i * 1000, move: 0, closed: 0, ends_at: null, sports: 0 };
  });
}
export const priceOf = (side, yes) => (side === "yes" ? yes : 1 - yes);
// the mark of a position in its own side's price; with no current YES price the entry (already side-priced) is the mark
export const markOf = (p, px) => (px[p.slug] == null ? p.entry : priceOf(p.side, px[p.slug]));
export function equity(acct, positions, px) {
  return acct.cash + positions.reduce((s, p) => s + p.qty * markOf(p, px), 0);
}
export function exits(positions, markets, cfg = CFG) {
  const byslug = Object.fromEntries(markets.map((m) => [m.slug, m]));
  const out = [];
  for (const p of positions) {
    const m = byslug[p.slug];
    if (!m) continue;
    const cur = priceOf(p.side, m.yes);
    const r = cur / p.entry - 1;
    let reason = null;
    if (m.yes >= 0.99 || m.yes <= 0.01) reason = "resolved";
    else if (m.closed) reason = "closed"; // closed without a resolved price: exit at the last mark, never a made-up win or loss
    else if (p.strategy === "signal") {
      // a signal trade is a bet on a probability, held to resolution; it leaves early only when the market has moved to the estimate
      const fairSide = p.side === "yes" ? p.fair : 1 - p.fair;
      if (p.fair != null && cur >= fairSide - cfg.CONVERGE) reason = "converged";
    } else if (r <= -cfg.STOP) reason = "stop_loss"; // manual positions only
    else if (r >= cfg.TAKE) reason = "take_profit";
    if (reason) out.push({ id: p.id, exit: reason === "resolved" ? Math.round(cur) : reason === "closed" ? cur : cur * (1 - cfg.SLIP), reason });
  }
  return out;
}

// ---------- the information strategy ----------
// Markets worth a probability estimate: not sports, resolving within HORIZON_D days, enough volume to trust the price, not near 0 or 1.
export function candidates(markets, heldSlugs, cool, cfg = CFG, now = Date.now(), domainsOff = new Set()) {
  return markets.filter((m) => {
    const d = daysUntil(m.ends_at, now);
    return !m.sports && !m.closed && d != null && d > 0.04 && d <= cfg.HORIZON_D && m.vol24 >= cfg.SIG_MIN_VOL
      && !isQuant(m.title) && (m.spread == null || m.spread <= cfg.MAX_SPREAD_MKT) && !domainsOff.has(domainOf(m.title))
      && m.yes >= 0.05 && m.yes <= 0.95 && !heldSlugs.has(m.slug) && !cool.has(m.slug);
  }).sort((a, b) => b.vol24 - a.vol24);
}
const STOP = new Set("will the a an of in on by to for be is are at as and or with from this that than before after into over under".split(" "));
export function newsQuery(title) {
  const w = String(title).replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter((x) => x.length > 2 && !STOP.has(x.toLowerCase()) && !/^\d{4}$/.test(x));
  return w.slice(0, 7).join(" ");
}
// Wikipedia search hits as evidence: only articles edited in the last 14 days count, because a recently edited article is a sign of fresh reporting.
export function wikiItems(json, nowMs = Date.now()) {
  const hits = (json && json.query && json.query.search) || [];
  return hits.map((h) => ({ ts: Date.parse(h.timestamp || ""), h })).filter((x) => Number.isFinite(x.ts) && nowMs - x.ts <= 14 * 86400000)
    .map(({ ts, h }) => ({ title: (String(h.title) + ": " + String(h.snippet || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&")).slice(0, 200) + " [last edited " + new Date(ts).toISOString().slice(0, 10) + "]", domain: "en.wikipedia.org", date: new Date(ts).toISOString().slice(0, 10).replace(/-/g, ""), src: "wiki" }));
}
const MONTHS = new Set("january february march april may june july august september october november december".split(" "));
// Markets resolved by a price bracket or a count on a given day carry no news signal beyond the live number; a model call on them is wasted (a structured price model is the right tool).
const QUANT_RE = /\b(price of [\w ]+ (be|close|hit|reach)|be (above|below|between|over|under) \$|up or down on|post\s+\d[\d-]*\s+(tweets|times)|exact score)\b/i;
export const isQuant = (title) => QUANT_RE.test(String(title || ""));
// Wikipedia's current-events portal lists each day's notable events with their sources: a general, reliable news evidence source for questions the other sources do not cover.
export function ceLines(html, dateIso) {
  const day = String(dateIso).slice(0, 10);
  return [...String(html || "").matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/&#\d+;|&[a-z]+;/g, " ").replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 30 && t.length <= 600).map((t) => ({ title: t.slice(0, 200) + " [Wikipedia current events " + day + "]", domain: "en.wikipedia.org", date: day.replace(/-/g, ""), src: "events", text: t.toLowerCase() }));
}
export function ceMatch(lines, title, max = 4) {
  const words = newsQuery(title).split(" ").map((w) => w.toLowerCase()).filter((w) => w.length >= 4 && !MONTHS.has(w));
  if (!words.length) return [];
  const need = words.length >= 3 ? 2 : 1;
  return lines.map((l) => ({ l, n: words.filter((w) => l.text.includes(w)).length })).filter((x) => x.n >= need).sort((a, b) => b.n - a.n).slice(0, max).map((x) => ({ title: x.l.title, domain: x.l.domain, date: x.l.date, src: x.l.src }));
}
export function hnQuery(title) { return newsQuery(title).split(" ").filter((w) => !MONTHS.has(w.toLowerCase())).slice(0, 3).join(" "); }
// GDELT allows one request every 5 seconds; this is how long to wait before the next one.
export const gdeltDelay = (nowMs, lastMs, gapMs = 5600) => Math.max(0, gapMs - (nowMs - lastMs));
// Domain of a question, for the per-domain proof (hypothesis H6: our sources may lead the crowd in some domains and not in others).
const DOMAIN_RES = [
  ["tech", /\b(ai|a\.i\.|openai|anthropic|claude|chatgpt|gpt-?\d*|gemini|llm|software|github|open[- ]source|apple|google|microsoft|nvidia|tesla|spacex|iphone|android|semiconductor|chip|cyber|hack(ed|ers?)?|linux|app store|model release)\b/i],
  ["crypto", /\b(bitcoin|btc|ethereum|eth|solana|crypto|token|stablecoin|coinbase|binance|doge(coin)?|etf)\b/i],
  ["macro", /\b(fed|fomc|rate cuts?|interest rates?|inflation|cpi|gdp|unemployment|jobs report|recession|treasury|tariffs?|oil|s&p|nasdaq|dow|stock|earnings)\b/i],
  ["geopolitics", /\b(iran|israel|ukraine|russia|china|taiwan|gaza|ceasefire|nato|war|invade|invasion|sanctions?|north korea|syria|venezuela|hezbollah|hamas)\b/i],
  ["politics", /\b(trump|biden|harris|congress|senate|house|election|vote|president|governor|impeach(ed|ment)?|supreme court|bill|shutdown|mayor|primary|poll|democrat|republican|speaker)\b/i],
  ["science", /\b(nasa|climate|earthquake|hurricane|storm|vaccine|fda|virus|covid|measles|temperature|weather|asteroid|outbreak)\b/i],
  ["entertainment", /\b(movie|film|box office|album|song|oscar|grammy|emmy|netflix|tv show|celebrity|youtube|streamer|tiktok|elon musk|tweet|podcast)\b/i],
];
export function domainOf(title) { const t = String(title || ""); for (const [d, re] of DOMAIN_RES) if (re.test(t)) return d; return "other"; }

// ---------- calibration, blend and sizing (recommendations R4 and R5) ----------
const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const clampP = (p, lo = 0.02) => Math.min(1 - lo, Math.max(lo, p));
// Logistic recalibration: a stretches (above 1) or shrinks (below 1) the log-odds, b shifts them. a=1, b=0 is the identity.
export const applyRecal = (p, a = 1, b = 0) => clampP(sigmoid(a * logit(clampP(p)) + b));
// Fit a and b by logistic regression of the outcome on the raw log-odds, with a ridge pull toward the identity so a small sample cannot move it far.
export function fitRecal(rows, lambda = 5) {
  const r = rows.filter((x) => x.raw != null && (x.outcome === 0 || x.outcome === 1));
  if (r.length < 2) return { a: 1, b: 0 };
  let a = 1, b = 0;
  for (let it = 0; it < 30; it++) {
    let ga = lambda * (a - 1), gb = lambda * b, haa = lambda, hab = 0, hbb = lambda;
    for (const x of r) { const z = logit(clampP(x.raw)), p = sigmoid(a * z + b), e = p - x.outcome, w = p * (1 - p); ga += e * z; gb += e; haa += w * z * z; hab += w * z; hbb += w; }
    const det = haa * hbb - hab * hab;
    if (!(det > 1e-9)) break;
    const da = (hbb * ga - hab * gb) / det, db = (haa * gb - hab * ga) / det;
    a -= da; b -= db;
    if (Math.abs(da) + Math.abs(db) < 1e-7) break;
  }
  return { a: Math.min(2, Math.max(0.5, a)), b: Math.min(1, Math.max(-1, b)) };
}
// The weight on the model in a model/market blend, chosen by Brier score on resolved forecasts (0 = trust the price, 1 = trust the model).
export function fitBlend(rows) {
  const r = rows.filter((x) => x.fair != null && (x.outcome === 0 || x.outcome === 1));
  if (r.length < 2) return 0.5;
  let best = 0.5, bs = Infinity;
  for (let i = 0; i <= 10; i++) { const w = i / 10, s = r.reduce((t, x) => t + (w * x.fair + (1 - w) * x.market - x.outcome) ** 2, 0); if (s < bs - 1e-12) { bs = s; best = w; } }
  return best;
}
// Fractional Kelly stake: the share of equity that maximises long-run growth is (p - price) / (1 - price); take a quarter of it, never more than the position cap.
export function kellyStake(pWin, price, eq, cfg = CFG) {
  const f = (pWin - price) / (1 - price);
  return f > 0 ? Math.min(eq * cfg.SIG_POS_PCT, eq * cfg.KELLY * f) : 0;
}

// ---------- the forecast log: append-only and tamper-evident (recommendation R7) ----------
export async function sha256Hex(s) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
export const chainHash = (prev, core) => sha256Hex(String(prev || "") + "|" + core);
// rows in id order: {core, prev_hash, hash}. The first row's prev_hash is "". Returns {ok, count, head, bad_id}.
export async function verifyChain(rows) {
  let prev = "";
  for (const r of rows) {
    if ((r.prev_hash || "") !== prev || (await chainHash(prev, r.core)) !== r.hash) return { ok: false, count: rows.length, head: prev, bad_id: r.id ?? null };
    prev = r.hash;
  }
  return { ok: true, count: rows.length, head: prev, bad_id: null };
}

// One model's answer. JSON or nothing: anything else is rejected rather than guessed at.
export function parseEstimate(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j; try { j = JSON.parse(m[0]); } catch { return null; }
  const p = Number(j.p);
  if (!(p >= 0 && p <= 1)) return null;
  const conf = ["low", "medium", "high"].includes(String(j.confidence).toLowerCase()) ? String(j.confidence).toLowerCase() : "low";
  return { p: Math.min(0.97, Math.max(0.03, p)), confidence: conf, why: String(j.why || "").slice(0, 280) };
}
// The ensemble: median of the members, their spread, the weakest confidence. Fewer than MIN_MEMBERS answers is no estimate at all.
export function aggregate(members, cfg = CFG) {
  const ms = members.filter(Boolean);
  if (ms.length < cfg.MIN_MEMBERS) return null;
  const ps = ms.map((x) => x.p).sort((a, b) => a - b);
  const mid = ps.length % 2 ? ps[(ps.length - 1) / 2] : (ps[ps.length / 2 - 1] + ps[ps.length / 2]) / 2;
  const rank = { low: 0, medium: 1, high: 2 };
  const conf = ms.reduce((c, x) => (rank[x.confidence] < rank[c] ? x.confidence : c), "high");
  return { p: mid, spread: ps[ps.length - 1] - ps[0], confidence: conf, ps, n: ms.length, why: (ms.slice().sort((a, b) => b.why.length - a.why.length)[0] || {}).why || "" };
}
// Trade only a clear, agreed gap: every member on the same side of the price, a gap of minEdge or more, a spread that is not a disagreement, not low confidence.
export function decide(agg, m, minEdge = CFG.MIN_EDGE, cfg = CFG, w = 1) {
  if (!agg || agg.confidence === "low" || agg.spread > cfg.MAX_SPREAD) return null;
  const edge = agg.p - m.yes;
  if (Math.abs(edge) < minEdge) return null;
  const side = edge > 0 ? "yes" : "no";
  if (!agg.ps.every((p) => (side === "yes" ? p > m.yes : p < m.yes))) return null;
  const price = priceOf(side, m.yes);
  if (price < 0.04 || price > 0.94) return null;
  const pb = w * agg.p + (1 - w) * m.yes; // the model shrunk toward the price by the learned blend weight
  return { slug: m.slug, title: m.title, side, fair: agg.p, edge, pWin: side === "yes" ? pb : 1 - pb, why: agg.why, ends_at: m.ends_at };
}
export function signalEntries(decisions, positions, acct, px, cfg = CFG) {
  const open = new Set(positions.map((p) => p.slug));
  const eq = equity(acct, positions, px);
  let exposure = positions.reduce((s, p) => s + p.qty * p.entry, 0), cash = acct.cash, n = positions.length;
  const out = [];
  for (const d of decisions.slice().sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))) {
    if (open.has(d.slug) || n >= cfg.MAX_OPEN) continue;
    const price = priceOf(d.side, px[d.slug]);
    const usd = Math.min(d.pWin == null ? eq * cfg.SIG_POS_PCT : kellyStake(d.pWin, price, eq, cfg), cash);
    if (usd < Math.max(1, eq * 0.005)) continue; // too small an edge to be worth the slippage
    if (exposure + usd > eq * cfg.EXPO_PCT) break;
    const fill = Math.min(0.99, price * (1 + cfg.SLIP));
    out.push({ ...d, usd, entry: fill, qty: usd / fill, strategy: "signal" });
    cash -= usd; exposure += usd; n++;
  }
  return out;
}

// ---------- the proof: does the information beat the market? ----------
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
// Percentile bootstrap of the mean with a fixed seed, so the same data always gives the same interval.
export function bootstrapCI(xs, reps = 1000, seed = 12345) {
  if (xs.length < 2) return null;
  let st = seed; const rnd = () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; };
  const means = [];
  for (let r = 0; r < reps; r++) { let t = 0; for (let i = 0; i < xs.length; i++) t += xs[Math.floor(rnd() * xs.length)]; means.push(t / xs.length); }
  means.sort((a, b) => a - b);
  return { lo: means[Math.floor(0.025 * reps)], hi: means[Math.ceil(0.975 * reps) - 1] };
}
// rows: resolved estimates {fair, market, confidence, outcome 0|1}. Three comparisons on the same markets:
//  1. Brier score of the model against the market price (the price is the baseline the information has to beat), and against a 50/50 blend of the two;
//  2. shadow ROI: a flat bet on every qualifying estimate at the price seen then, with slippage, whether or not the account had room for it;
//  3. the control: the same bets backing whichever side the market already favours. Following the chart must lose to the information, or there is no information.
export function evaluate(rows, minEdge = CFG.MIN_EDGE, cfg = CFG) {
  const r = rows.filter((x) => x.fair != null && (x.outcome === 0 || x.outcome === 1));
  const bm = r.map((x) => (x.fair - x.outcome) ** 2), bk = r.map((x) => (x.market - x.outcome) ** 2), bb = r.map((x) => ((x.fair + x.market) / 2 - x.outcome) ** 2);
  const gain = r.map((_, i) => bk[i] - bm[i]), blendGain = r.map((_, i) => bk[i] - bb[i]);
  const q = r.filter((x) => x.confidence !== "low" && Math.abs(x.fair - x.market) >= minEdge);
  const ret = (x, side) => { const price = side === "yes" ? x.market : 1 - x.market; const cost = price * (1 + cfg.SLIP); const win = side === "yes" ? x.outcome === 1 : x.outcome === 0; return ((win ? 1 : 0) - cost) / cost; };
  const sig = q.map((x) => ret(x, x.fair > x.market ? "yes" : "no")), fav = q.map((x) => ret(x, x.market >= 0.5 ? "yes" : "no"));
  const over = sig.map((v, i) => v - fav[i]);
  return { n: r.length, brier_model: mean(bm), brier_market: mean(bk), brier_blend: mean(bb), brier_gain: mean(gain), brier_gain_ci: bootstrapCI(gain), blend_gain: mean(blendGain), blend_gain_ci: bootstrapCI(blendGain),
    shadow_n: q.length, shadow_roi: mean(sig), shadow_roi_ci: bootstrapCI(sig), control_roi: mean(fav), edge_over_control: mean(over), edge_over_control_ci: bootstrapCI(over) };
}
const LL = (p, o) => { const q = Math.min(0.99, Math.max(0.01, p)); return -(o * Math.log(q) + (1 - o) * Math.log(1 - q)); };
// Log loss is reported beside Brier because Brier over-weights high-base-rate questions (recommendation R10).
export function logLoss(rows) {
  const r = rows.filter((x) => x.fair != null && (x.outcome === 0 || x.outcome === 1));
  return { n: r.length, model: mean(r.map((x) => LL(x.fair, x.outcome))), market: mean(r.map((x) => LL(x.market, x.outcome))) };
}
// The proof split by domain (hypothesis H6): where, if anywhere, does the information beat the price?
export function byDomain(rows) {
  const g = {};
  for (const x of rows) (g[x.domain || "other"] ||= []).push(x);
  return Object.fromEntries(Object.entries(g).map(([d, rs]) => { const e = evaluate(rs); return [d, { n: e.n, brier_gain: e.brier_gain, brier_gain_ci: e.brier_gain_ci }]; }));
}
const pos = (ci) => !!ci && ci.lo > 0;
// The graduation gate. It only ever reports; it has no power to switch anything on.
export function graduation(ev, ctx, ch = CHARTER) {
  const g = ch.graduation, why = [];
  if (ctx.days < g.min_days) why.push("only " + ctx.days.toFixed(1) + " of " + g.min_days + " days of paper trading");
  if (ev.n < g.min_resolved_estimates) why.push(ev.n + " of " + g.min_resolved_estimates + " resolved estimates");
  if (ev.shadow_n < g.min_resolved_trades) why.push(ev.shadow_n + " of " + g.min_resolved_trades + " resolved qualifying trades");
  if (!pos(ev.brier_gain_ci) && !pos(ev.blend_gain_ci)) why.push("neither the model nor the model+market blend beats the market price on Brier with 95% confidence");
  if (!pos(ev.shadow_roi_ci)) why.push("shadow ROI after slippage is not above zero with 95% confidence");
  if (!pos(ev.edge_over_control_ci)) why.push("signal trades do not beat backing the market favourite with 95% confidence");
  if (ctx.max_drawdown_pct > g.max_drawdown_pct) why.push("drawdown " + ctx.max_drawdown_pct.toFixed(1) + "% is above " + g.max_drawdown_pct + "%");
  return { ready: why.length === 0, reasons: why, mode: ch.mode, live_enabled: ch.live.enabled };
}
// Bounded self-management: what the review loop may change on its own. Everything else is a PR.
export function reviewActions(ev, ctx, cfg = CFG) {
  const acts = [];
  if (ctx.drawdown_pct >= cfg.BREAKER_DD) acts.push({ kind: "pause", reason: "drawdown " + ctx.drawdown_pct.toFixed(1) + "% reached the " + cfg.BREAKER_DD + "% breaker" });
  if (ev.n >= 30 && ev.brier_gain_ci && ev.brier_gain_ci.hi < 0) {
    acts.push({ kind: "pause", reason: "after " + ev.n + " resolved estimates the model is significantly worse than the market price on Brier" });
    if (ctx.min_edge < cfg.EDGE_MAX) acts.push({ kind: "min_edge", value: +Math.min(cfg.EDGE_MAX, ctx.min_edge + 0.02).toFixed(2), reason: "model worse than the price: demand a larger gap" });
  } else if (ev.shadow_n >= 30 && ev.shadow_roi_ci && ev.shadow_roi_ci.hi < 0 && ctx.min_edge < cfg.EDGE_MAX) {
    acts.push({ kind: "min_edge", value: +Math.min(cfg.EDGE_MAX, ctx.min_edge + 0.02).toFixed(2), reason: "shadow ROI is significantly negative: demand a larger gap" });
  } else if (ev.shadow_n >= 50 && pos(ev.shadow_roi_ci) && pos(ev.edge_over_control_ci) && ctx.min_edge > cfg.EDGE_MIN) {
    acts.push({ kind: "min_edge", value: +Math.max(cfg.EDGE_MIN, ctx.min_edge - 0.01).toFixed(2), reason: "the information beats the market and the favourite: accept a slightly smaller gap" });
  }
  return acts;
}

// What the review loop may change in the pipeline's parameters on its own: recalibration, the blend weight and switching off a domain that loses. Recalibration and blend
// changes wait TUNE_DAYS between changes; every change starts a new evaluation sample (graduation counts forecasts made under the current parameters only).
export function tuneActions(rows, params, nowMs, cfg = CFG) {
  const acts = [];
  const r = rows.filter((x) => x.fair != null && (x.outcome === 0 || x.outcome === 1));
  const locked = params.last_tune_at && nowMs - Date.parse(params.last_tune_at) < cfg.TUNE_DAYS * 86400000;
  if (!locked && r.length >= cfg.RECAL_MIN) {
    const f = fitRecal(r);
    if (Math.abs(f.a - params.recal_a) >= 0.1 || Math.abs(f.b - params.recal_b) >= 0.1) acts.push({ kind: "recal", a: +f.a.toFixed(2), b: +f.b.toFixed(2), reason: "fit on " + r.length + " resolved forecasts: slope " + params.recal_a + " -> " + f.a.toFixed(2) + ", shift " + params.recal_b + " -> " + f.b.toFixed(2) });
  }
  if (!locked && r.length >= cfg.BLEND_MIN) {
    const w = fitBlend(r);
    if (Math.abs(w - params.blend_w) >= 0.1) acts.push({ kind: "blend", w, reason: "Brier-optimal weight on the model over " + r.length + " resolved forecasts: " + params.blend_w + " -> " + w });
  }
  const off = params.domains_off || {};
  for (const [d, e] of Object.entries(byDomain(r))) {
    if (e.n >= cfg.DOMAIN_MIN && e.brier_gain_ci && e.brier_gain_ci.hi < 0 && !(off[d] && Date.parse(off[d]) > nowMs))
      acts.push({ kind: "domain_off", domain: d, until: new Date(nowMs + cfg.DOMAIN_OFF_DAYS * 86400000).toISOString(), reason: "in the " + d + " domain the model is significantly worse than the price over " + e.n + " resolved forecasts" });
  }
  return acts;
}

export function stats(curve, closed) {
  let peak = -Infinity, mdd = 0;
  for (const c of curve) { peak = Math.max(peak, c.equity); mdd = Math.max(mdd, peak ? (peak - c.equity) / peak : 0); }
  const by = {};
  for (const t of closed) { const b = (by[t.strategy] ||= { trades: 0, wins: 0, pnl: 0 }); b.trades++; b.wins += t.pnl > 0 ? 1 : 0; b.pnl += t.pnl; }
  return { max_drawdown_pct: mdd * 100, by_strategy: by };
}
export function currentDrawdown(curve) {
  let peak = -Infinity, last = null;
  for (const c of curve) { peak = Math.max(peak, c.equity); last = c.equity; }
  return last == null || !peak ? 0 : Math.max(0, ((peak - last) / peak) * 100);
}

// ---------- storage ----------
const DDL = [
  "CREATE TABLE IF NOT EXISTS pt_account (id INTEGER PRIMARY KEY, cash REAL NOT NULL, start_cash REAL NOT NULL, created_at TEXT, lock_until INTEGER DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS pt_position (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, title TEXT, side TEXT, qty REAL, entry REAL, strategy TEXT, opened_at TEXT, closed_at TEXT, exit REAL, pnl REAL, reason TEXT)",
  "CREATE TABLE IF NOT EXISTS pt_market (slug TEXT PRIMARY KEY, title TEXT, yes REAL, vol24 REAL, move REAL, closed INTEGER, source TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS pt_equity (ts TEXT PRIMARY KEY, equity REAL, cash REAL, open_n INTEGER, source TEXT)",
  "CREATE TABLE IF NOT EXISTS pt_estimate (slug TEXT PRIMARY KEY, title TEXT, fair REAL, market REAL, edge REAL, confidence TEXT, why TEXT, ends_at TEXT, headlines INTEGER, traded INTEGER DEFAULT 0, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS pt_control (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS pt_estimate_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, slug TEXT NOT NULL, core TEXT NOT NULL, fair_raw REAL, fair REAL, market REAL, confidence TEXT, domain TEXT, ends_at TEXT, params_version INTEGER, prev_hash TEXT NOT NULL, hash TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS pt_decision (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT NOT NULL, assumption TEXT, action TEXT NOT NULL, evidence TEXT, rollback TEXT)",
];
const COLUMNS = [["pt_position", "fair", "REAL"], ["pt_position", "edge", "REAL"], ["pt_position", "why", "TEXT"], ["pt_position", "ends_at", "TEXT"], ["pt_market", "ends_at", "TEXT"],
  ["pt_estimate", "outcome", "INTEGER"], ["pt_estimate", "resolved_at", "TEXT"], ["pt_estimate", "models", "TEXT"], ["pt_estimate", "spread", "REAL"], ["pt_estimate", "sources", "TEXT"], ["pt_estimate", "fair_raw", "REAL"], ["pt_estimate", "domain", "TEXT"]];
async function init(env) {
  const db = env.TRADES_DB;
  await db.batch(DDL.map((s) => db.prepare(s)));
  for (const [t, c, ty] of COLUMNS) {
    const have = (await db.prepare(`PRAGMA table_info(${t})`).all()).results.some((r) => r.name === c); // standards-ok: table and column names are constants from COLUMNS above
    if (!have) {
      // two writers can both see the column missing; the loser's "duplicate column" is the column already being there
      try { await db.prepare(`ALTER TABLE ${t} ADD COLUMN ${c} ${ty}`).run(); } catch (e) { if (!/duplicate column/i.test(String(e.message || e))) throw e; } // standards-ok: constants from COLUMNS
    }
  }
  // the log is append-only in the database too: an UPDATE or DELETE on it is refused (the hash chain then proves nothing was changed from outside)
  await db.batch([
    db.prepare("CREATE TRIGGER IF NOT EXISTS pt_estimate_log_no_update BEFORE UPDATE ON pt_estimate_log BEGIN SELECT RAISE(ABORT, 'pt_estimate_log is append-only'); END"),
    db.prepare("CREATE TRIGGER IF NOT EXISTS pt_estimate_log_no_delete BEFORE DELETE ON pt_estimate_log BEGIN SELECT RAISE(ABORT, 'pt_estimate_log is append-only'); END"),
  ]);
  await db.prepare("INSERT OR IGNORE INTO pt_account (id,cash,start_cash,created_at) VALUES (1,?,?,?)").bind(CFG.START, CFG.START, new Date().toISOString()).run();
}
async function fetchMarkets() {
  try {
    const lo = new Date().toISOString(), hi = new Date(Date.now() + CFG.HORIZON_D * 86400000).toISOString();
    const r = await fetch("https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=200&order=volume24hr&ascending=false&end_date_min=" + encodeURIComponent(lo) + "&end_date_max=" + encodeURIComponent(hi), { headers: { accept: "application/json" }, cf: { cacheTtl: 60 } });
    if (!r.ok) throw new Error("gamma " + r.status);
    const ms = (await r.json()).map(parseMarket).filter(Boolean);
    if (ms.length) return { markets: ms, source: "polymarket" };
  } catch (e) { console.error("market feed failed, using the synthetic feed", String(e)); }
  return { markets: syntheticMarkets(), source: "synthetic" };
}
const openPositions = async (db) => (await db.prepare("SELECT * FROM pt_position WHERE closed_at IS NULL").all()).results;
const account = async (db) => await db.prepare("SELECT * FROM pt_account WHERE id=1").first();

// One writer at a time (a scheduled tick, a dashboard tick and a manual order can overlap): a 30 s lease on the account row.
// Cash changes are relative deltas applied under the lease, so a stale read can never overwrite another writer's change.
async function lock(db) {
  const now = Date.now();
  const r = await db.prepare("UPDATE pt_account SET lock_until=? WHERE id=1 AND COALESCE(lock_until,0) < ?").bind(now + 30000, now).run();
  return (r.meta?.changes ?? r.changes ?? 0) > 0;
}
const unlock = (db) => db.prepare("UPDATE pt_account SET lock_until=0 WHERE id=1").run();
async function fetchHeld(slugs) {
  if (!slugs.length) return [];
  try {
    const r = await fetch("https://gamma-api.polymarket.com/markets?" + slugs.map((s) => "slug=" + encodeURIComponent(s)).join("&"), { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("gamma " + r.status);
    return (await r.json()).map(parseMarket).filter(Boolean);
  } catch (e) { console.error("slug refresh failed", String(e)); return []; }
}

// ---------- self-management state: control values and the decision log ----------
async function readControl(db) {
  const m = Object.fromEntries((await db.prepare("SELECT key,value FROM pt_control").all()).results.map((r) => [r.key, r.value]));
  let off = {}; try { off = JSON.parse(m.domains_off || "{}"); } catch (e) { off = {}; }
  return { min_edge: Number(m.min_edge) || CFG.MIN_EDGE, paused_until: m.paused_until || null, paused_reason: m.paused_reason || null,
    recal_a: m.recal_a == null ? 1 : Number(m.recal_a), recal_b: m.recal_b == null ? 0 : Number(m.recal_b), blend_w: m.blend_w == null ? 0.5 : Number(m.blend_w),
    params_version: Number(m.params_version) || 1, version_started_at: m.version_started_at || null, last_tune_at: m.last_tune_at || null, domains_off: off,
    chain_ok: m.chain_ok == null ? null : m.chain_ok === "1", chain_checked_at: m.chain_checked_at || null };
}
const setControl = (db, key, value, now) => db.prepare("INSERT OR REPLACE INTO pt_control (key,value,updated_at) VALUES (?,?,?)").bind(key, String(value), now);
const logDecision = (db, now, action, assumption, evidence, rollback) => db.prepare("INSERT INTO pt_decision (ts,actor,assumption,action,evidence,rollback) VALUES (?,?,?,?,?,?)").bind(now, "review-loop", assumption, action, JSON.stringify(evidence), rollback);
const offDomains = (ctl, nowMs) => new Set(Object.entries(ctl.domains_off || {}).filter(([, u]) => Date.parse(u) > nowMs).map(([d]) => d));
const isPaused = (ctl, nowMs) => !!ctl.paused_until && Date.parse(ctl.paused_until) > nowMs;

// ---------- evidence and the ensemble (q08's signal sources: Hacker News and GDELT) ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastGdelt = 0;
async function getJson(url, spaced, headers) {
  for (let attempt = 0; attempt < (spaced ? 2 : 1); attempt++) {
    if (spaced) { await sleep(gdeltDelay(Date.now(), lastGdelt)); lastGdelt = Date.now(); }
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), spaced ? 25000 : 9000); // GDELT answers in 10-20 s when it answers
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: headers || {} });
      if (!r.ok) { if (spaced && r.status >= 500 && attempt === 0) { console.error("gdelt " + r.status + ", retrying once"); continue; } return null; }
      const t = await r.text();
      if (spaced && /^Please limit requests/i.test(t)) { console.error("gdelt rate limit, retrying once"); continue; } // GDELT answers its limit in plain text
      try { return JSON.parse(t); } catch (e) { console.error("evidence source returned non-JSON", t.slice(0, 80)); return null; }
    } catch (e) { return null; } finally { clearTimeout(tm); }
  }
  return null;
}
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WIKI_UA = { "user-agent": "q08-prediction-markets/1.6 (paper-trading research; https://q08.org)" };
let ceCache = { at: 0, lines: [] };
async function currentEventLines(nowMs = Date.now()) {
  if (ceCache.lines.length && nowMs - ceCache.at < 30 * 60000) return ceCache.lines;
  const days = [0, 1, 2].map((i) => new Date(nowMs - i * 86400000));
  const got = await Promise.all(days.map((d) => getJson("https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=text&disablelimitreport=1&redirects=1&page=" + encodeURIComponent("Portal:Current_events/" + d.getUTCFullYear() + "_" + MONTH_NAMES[d.getUTCMonth()] + "_" + d.getUTCDate()), false, WIKI_UA)));
  const lines = got.flatMap((j, i) => (j && j.parse && j.parse.text && j.parse.text["*"] ? ceLines(j.parse.text["*"], days[i].toISOString()) : []));
  if (lines.length) ceCache = { at: nowMs, lines };
  return lines;
}
export async function fetchNews(title) {
  const q = newsQuery(title);
  if (!q) return [];
  const since = Math.floor(Date.now() / 1000 - 3 * 86400);
  const hq = hnQuery(title);
  const [g, h, w, ce] = await Promise.all([
    getJson("https://api.gdeltproject.org/api/v2/doc/doc?query=" + encodeURIComponent(q + " sourcelang:english") + "&mode=artlist&maxrecords=10&format=json&timespan=3d&sort=datedesc", true),
    hq ? getJson("https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=6&query=" + encodeURIComponent(hq) + "&numericFilters=" + encodeURIComponent("created_at_i>" + since)) : null,
    getJson("https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=4&format=json&srprop=snippet%7Ctimestamp&srsearch=" + encodeURIComponent(hq || q), false, WIKI_UA),
    currentEventLines().catch((e) => { console.error("current events failed", String(e)); return []; }),
  ]);
  const a = ((g && g.articles) || []).map((x) => ({ title: String(x.title || "").slice(0, 160), domain: x.domain, date: String(x.seendate || "").slice(0, 8), src: "gdelt" }));
  const b = ((h && h.hits) || []).map((x) => ({ title: String(x.title || "").slice(0, 160), domain: "news.ycombinator.com", date: String(x.created_at || "").slice(0, 10).replace(/-/g, ""), src: "hn" }));
  const seen = new Set();
  return a.concat(b, wikiItems(w), ceMatch(ce, title)).filter((x) => x.title && !seen.has(x.title) && seen.add(x.title));
}
// The model sees the question, the dates and the evidence, never the market price, so it cannot simply echo the crowd.
async function askModel(env, m, news, model) {
  const today = new Date().toISOString().slice(0, 10);
  const prompt = "Question: " + m.title + "\nIt resolves by " + String(m.ends_at).slice(0, 10) + ". Today is " + today + ".\nEvidence from the last three days (newest first):\n" + news.map((n) => "- " + n.title + " (" + n.domain + ", " + n.date + ")").join("\n")
    + "\n\nFirst think of the base rate for questions like this, then adjust for the evidence. Give the probability that this resolves YES. If the evidence does not bear on the question, say confidence low. Answer with JSON only: {\"p\": 0-1, \"confidence\": \"low|medium|high\", \"why\": \"one or two sentences naming the evidence\"}";
  const r = await env.QNFO_AI.fetch("https://qnfo-ai.internal/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: "You are a careful, calibrated forecaster. You never invent facts beyond the evidence given." }, { role: "user", content: prompt }], max_tokens: 400, temperature: 0.2, stream: false }) });
  if (!r.ok) throw new Error("router " + r.status + " for " + model);
  return (await r.json()).choices?.[0]?.message?.content || "";
}
// Estimate up to MAX_EST candidate markets with no estimate younger than EST_TTL_H hours. Outside the account lease: this is slow I/O.
async function estimate(env, db, cands, now, deps) {
  const fresh = new Set((await db.prepare("SELECT slug FROM pt_estimate WHERE updated_at > ?").bind(new Date(now - CFG.EST_TTL_H * 3600000).toISOString()).all()).results.map((r) => r.slug));
  const todo = cands.filter((m) => !fresh.has(m.slug)).slice(0, CFG.MAX_EST);
  const news = deps.news || fetchNews, ask = deps.ask || ((m, n, model) => askModel(env, m, n, model));
  const models = deps.models || String(env.ENSEMBLE_MODELS || "").split(",").map((x) => x.trim()).filter(Boolean).concat(env.ENSEMBLE_MODELS ? [] : ENSEMBLE);
  const status = deps.ask || env.QNFO_AI ? "ok" : "no-ai";
  const rows = [];
  if (status === "no-ai") return { rows, status };
  const evidence = new Map();
  for (const m of todo) { try { evidence.set(m.slug, await news(m.title)); } catch (e) { console.error("evidence failed", m.slug, String(e)); evidence.set(m.slug, []); } } // one at a time: GDELT allows a request every 5 seconds
  await Promise.all(todo.map(async (m) => {
    try {
      const n = evidence.get(m.slug) || [];
      const sources = n.reduce((o, x) => ((o[x.src || "other"] = (o[x.src || "other"] || 0) + 1), o), {});
      if (n.length < 3) { rows.push({ m, agg: null, headlines: n.length, members: [], sources }); return; }
      const got = await Promise.all(models.map(async (model) => { try { const e = parseEstimate(await ask(m, n, model)); return e && { ...e, model }; } catch (err) { console.error("member failed", model, String(err)); return null; } }));
      rows.push({ m, agg: aggregate(got), headlines: n.length, sources, evidence: n.slice(0, 12).map((x) => ({ t: String(x.title).slice(0, 100), s: x.src || "other", d: x.date })), members: got.filter(Boolean).map((x) => ({ model: x.model, p: x.p, c: x.confidence })) });
    } catch (e) { console.error("estimate failed", m.slug, String(e)); }
  }));
  return { rows, status };
}

// Settle estimates whose market has resolved: the outcome is what the proof compares the model and the price against.
async function settleEstimates(db, nowMs, bySlug) {
  const due = (await db.prepare("SELECT slug, ends_at FROM pt_estimate WHERE outcome IS NULL AND ends_at IS NOT NULL AND ends_at < ? ORDER BY ends_at LIMIT 20").bind(new Date(nowMs).toISOString()).all()).results;
  if (!due.length) return 0;
  const ms = await bySlug(due.map((d) => d.slug));
  const done = new Set(), writes = [], iso = new Date(nowMs).toISOString();
  for (const m of ms) if (m.yes >= 0.99 || m.yes <= 0.01) { done.add(m.slug); writes.push(db.prepare("UPDATE pt_estimate SET outcome=?, resolved_at=? WHERE slug=? AND outcome IS NULL").bind(m.yes >= 0.99 ? 1 : 0, iso, m.slug)); }
  // a market 30 days past its end date that never reached a decisive price is void (-1) and excluded from scoring
  for (const d of due) if (!done.has(d.slug) && nowMs - Date.parse(d.ends_at) > 30 * 86400000) writes.push(db.prepare("UPDATE pt_estimate SET outcome=-1, resolved_at=? WHERE slug=? AND outcome IS NULL").bind(iso, d.slug));
  if (writes.length) await db.batch(writes);
  return done.size;
}

// ---------- the review loop: score, self-tune within bounds, pause when wrong, publish ----------
// The scored sample: the FIRST forecast made on each market (never a later one made closer to the answer), joined with the outcome, with its lead time and the parameter version it was made under.
async function evidenceNow(db, ctl) {
  const rows = (await db.prepare("SELECT l.fair_raw raw, l.fair, l.market, l.confidence, l.domain, l.params_version v, l.ts, l.ends_at, e.outcome FROM pt_estimate_log l JOIN pt_estimate e ON e.slug = l.slug WHERE l.id = (SELECT MIN(x.id) FROM pt_estimate_log x WHERE x.slug = l.slug AND x.fair IS NOT NULL) AND e.outcome IN (0,1)").all()).results;
  const curve = (await db.prepare("SELECT ts, equity FROM pt_equity ORDER BY ts LIMIT 50000").all()).results;
  const ev = evaluate(rows, ctl.min_edge);
  const evFrozen = evaluate(rows.filter((x) => x.v === ctl.params_version), ctl.min_edge);
  const days = curve.length ? (Date.now() - Date.parse(curve[0].ts)) / 86400000 : 0;
  const frozenDays = ctl.version_started_at ? (Date.now() - Date.parse(ctl.version_started_at)) / 86400000 : 0;
  const ctx = { days, frozen_days: frozenDays, max_drawdown_pct: stats(curve, []).max_drawdown_pct, drawdown_pct: currentDrawdown(curve), min_edge: ctl.min_edge, last_equity: curve.length ? curve[curve.length - 1].equity : CFG.START };
  return { ev, evFrozen, rows, ctx };
}
// Verify the whole forecast chain at most once an hour; the result is kept in pt_control.
async function chainStatus(db, ctl, nowMs, force) {
  if (!force && ctl.chain_checked_at && nowMs - Date.parse(ctl.chain_checked_at) < 3600000 && ctl.chain_ok != null) return { ok: ctl.chain_ok, cached: true };
  const rows = (await db.prepare("SELECT id, core, prev_hash, hash FROM pt_estimate_log ORDER BY id LIMIT 50000").all()).results;
  const v = await verifyChain(rows);
  const now = new Date(nowMs).toISOString();
  await db.batch([setControl(db, "chain_ok", v.ok ? "1" : "0", now), setControl(db, "chain_checked_at", now, now)]);
  return { ok: v.ok, cached: false, count: v.count, head: v.head, bad_id: v.bad_id };
}
async function publishMetrics(env, vals, now) {
  if (!env.AUDIT) return "no-audit";
  try {
    await env.AUDIT.batch([
      ...Object.entries(vals).map(([k, v]) => env.AUDIT.prepare("UPDATE metric_registry SET last_value=?, last_refreshed=?, state='MEASURED' WHERE metric=?").bind(String(v), now, k)),
      env.AUDIT.prepare("INSERT OR REPLACE INTO fleet_heartbeat (worker, version, ts, ok) VALUES (?,?,?,1)").bind("q08-prediction-markets", VERSION, now),
    ]);
    return "ok";
  } catch (e) { console.error("metric publish failed", String(e)); return "error"; }
}
const r4 = (x) => (x == null || !Number.isFinite(x) ? 0 : Math.round(x * 10000) / 10000);
async function review(env, db, nowMs) {
  const now = new Date(nowMs).toISOString();
  let ctl = await readControl(db);
  const { ev, evFrozen, rows, ctx } = await evidenceNow(db, ctl);
  const writes = [];
  const locked = ctl.last_tune_at && nowMs - Date.parse(ctl.last_tune_at) < CFG.TUNE_DAYS * 86400000;
  let bump = null; // any change to the pipeline's parameters starts a new evaluation sample
  for (const a of reviewActions(ev, ctx)) {
    if (a.kind === "pause" && !isPaused(ctl, nowMs)) {
      const until = new Date(nowMs + CFG.PAUSE_H * 3600000).toISOString();
      writes.push(setControl(db, "paused_until", until, now), setControl(db, "paused_reason", a.reason, now),
        logDecision(db, now, "pause new signal entries until " + until, a.reason, { n: ev.n, brier_gain: ev.brier_gain, drawdown_pct: ctx.drawdown_pct }, "DELETE FROM pt_control WHERE key IN ('paused_until','paused_reason')"));
      ctl = { ...ctl, paused_until: until, paused_reason: a.reason };
    } else if (a.kind === "min_edge" && a.value !== ctl.min_edge && !locked) {
      writes.push(setControl(db, "min_edge", a.value, now), logDecision(db, now, "minimum gap " + ctl.min_edge + " -> " + a.value, a.reason, { n: ev.n, shadow_n: ev.shadow_n, shadow_roi: ev.shadow_roi }, "DELETE FROM pt_control WHERE key='min_edge'"));
      ctl = { ...ctl, min_edge: a.value }; bump = bump || "min_edge";
    }
  }
  for (const a of tuneActions(rows, ctl, nowMs)) {
    if (a.kind === "recal") { writes.push(setControl(db, "recal_a", a.a, now), setControl(db, "recal_b", a.b, now), logDecision(db, now, "recalibration slope " + ctl.recal_a + " -> " + a.a + ", shift " + ctl.recal_b + " -> " + a.b, a.reason, { n: ev.n }, "DELETE FROM pt_control WHERE key IN ('recal_a','recal_b')")); ctl = { ...ctl, recal_a: a.a, recal_b: a.b }; bump = "recal"; }
    else if (a.kind === "blend") { writes.push(setControl(db, "blend_w", a.w, now), logDecision(db, now, "blend weight on the model " + ctl.blend_w + " -> " + a.w, a.reason, { n: ev.n }, "DELETE FROM pt_control WHERE key='blend_w'")); ctl = { ...ctl, blend_w: a.w }; bump = "blend"; }
    else if (a.kind === "domain_off") { const off = { ...ctl.domains_off, [a.domain]: a.until }; writes.push(setControl(db, "domains_off", JSON.stringify(off), now), logDecision(db, now, "switch off the " + a.domain + " domain until " + a.until, a.reason, { n: ev.n }, "DELETE FROM pt_control WHERE key='domains_off'")); ctl = { ...ctl, domains_off: off }; bump = bump || "domain"; }
  }
  if (bump) {
    const v = ctl.params_version + 1;
    writes.push(setControl(db, "params_version", v, now), setControl(db, "version_started_at", now, now), setControl(db, "last_tune_at", now, now),
      logDecision(db, now, "start parameter version " + v, "a parameter changed (" + bump + "); graduation counts only forecasts made under the current parameters", { previous: ctl.params_version }, "none: versions are append-only labels"));
    ctl = { ...ctl, params_version: v, version_started_at: now, last_tune_at: now };
  }
  if (writes.length) await db.batch(writes);
  const evG = bump ? evaluate([], ctl.min_edge) : evFrozen; // a fresh version has an empty sample
  const grad = graduation(evG, { ...ctx, days: bump ? 0 : ctx.frozen_days });
  const chain = await chainStatus(db, ctl, nowMs, false).catch((e) => { console.error("chain check failed", String(e)); return { ok: null }; });
  const enough = evG.shadow_n >= 30;
  const published = await publishMetrics(env, {
    pm_paper_return_pct: r4((ctx.last_equity / CFG.START - 1) * 100), pm_paper_drawdown_pct: r4(ctx.drawdown_pct), pm_resolved_estimates: ev.n,
    pm_brier_gain: ev.n >= 30 ? r4(ev.brier_gain) : 0, pm_shadow_roi: enough ? r4(evG.shadow_roi) : 0, pm_edge_over_control: enough ? r4(evG.edge_over_control) : 0,
    pm_graduation_ready: grad.ready ? 1 : 0, pm_breaker_active: isPaused(ctl, nowMs) ? 1 : 0, pm_chain_ok: chain.ok === false ? 0 : 1,
  }, now);
  return { ev, evFrozen: evG, ctx, grad, ctl, chain, actions: writes.length, published };
}

export async function tick(env, feed, deps = {}) {
  await init(env);
  const db = env.TRADES_DB, nowMs = Date.now(), now = new Date(nowMs).toISOString();
  const fetched = feed || (await fetchMarkets());
  const source = fetched.source;
  const ctl0 = await readControl(db);
  const markets = fetched.markets.filter((m) => !m.sports).map((m) => ({ ...m, domain: domainOf(m.title) }));
  const bySlug = deps.bySlug || (feed ? async () => [] : fetchHeld);
  const settled = await settleEstimates(db, nowMs, bySlug).catch((e) => { console.error("settle failed", String(e)); return 0; });
  // held markets that left the active feed (closed, resolved, outside the top rows) are fetched by slug so they can still settle
  const heldSlugs = (await openPositions(db)).map((p) => p.slug).filter((sl) => !markets.find((m) => m.slug === sl));
  const refreshed = feed || source !== "polymarket" ? [] : await fetchHeld(heldSlugs);
  // evidence + ensemble estimates for the best short-term candidates, before the lease is taken (slow I/O). Estimating continues while entries are paused: the proof keeps accumulating.
  const heldNow = new Set((await openPositions(db)).map((p) => p.slug));
  const coolNow = new Set((await db.prepare("SELECT DISTINCT slug FROM pt_position WHERE closed_at IS NOT NULL AND closed_at > ?").bind(new Date(nowMs - 6 * 3600 * 1000).toISOString()).all()).results.map((r) => r.slug));
  let est = { rows: [], status: "off" };
  if (source === "polymarket") est = await estimate(env, db, candidates(markets, heldNow, coolNow, CFG, nowMs, offDomains(ctl0, nowMs)), nowMs, deps);
  if (!(await lock(db))) return { busy: true };
  let result;
  try {
    const stamp = markets.concat(refreshed);
    await db.batch(stamp.map((m) => db.prepare("INSERT OR REPLACE INTO pt_market (slug,title,yes,vol24,move,closed,source,updated_at,ends_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(m.slug, m.title, m.yes, m.vol24, m.move, m.closed, source, now, m.ends_at ?? null)));
    let pos = await openPositions(db);
    const held = pos.filter((p) => !stamp.find((m) => m.slug === p.slug));
    const stored = held.length ? (await db.prepare(`SELECT slug,title,yes,vol24,move,closed,ends_at FROM pt_market WHERE slug IN (${held.map(() => "?").join(",")})`).bind(...held.map((p) => p.slug)).all()).results : []; // standards-ok: only "?" placeholders are interpolated, every value goes through .bind()
    const all = stamp.concat(stored);
    // exits settle only on quotes taken this tick; a held market whose refresh failed keeps its position and its stored mark
    const closed = exits(pos, stamp);
    let delta = 0;
    const writes = [];
    for (const x of closed) {
      const p = pos.find((q) => q.id === x.id), pnl = p.qty * (x.exit - p.entry);
      delta += p.qty * x.exit;
      writes.push(db.prepare("UPDATE pt_position SET closed_at=?, exit=?, pnl=?, reason=? WHERE id=?").bind(now, x.exit, pnl, x.reason, x.id));
    }
    const closedSlugs = new Set(closed.map((x) => pos.find((q) => q.id === x.id).slug));
    pos = pos.filter((p) => !closed.find((x) => x.id === p.id));
    const cash0 = (await account(db)).cash + delta;
    const pxNow = Object.fromEntries(all.map((m) => [m.slug, m.yes]));
    const paused = isPaused(ctl0, nowMs);
    const decisions = [];
    const last = await db.prepare("SELECT hash FROM pt_estimate_log ORDER BY id DESC LIMIT 1").first();
    let prevHash = last ? last.hash : "";
    if (est.rows.length && !ctl0.version_started_at) writes.push(setControl(db, "version_started_at", now, now));
    for (const row of est.rows) {
      const m = markets.find((x) => x.slug === row.m.slug) || row.m;
      const domain = m.domain || domainOf(m.title);
      // recalibrate the raw ensemble probability with the learned slope and shift; side agreement is judged on the raw member answers
      const cal = row.agg ? { ...row.agg, raw: row.agg.p, p: applyRecal(row.agg.p, ctl0.recal_a, ctl0.recal_b) } : null;
      const d = cal ? decide(cal, m, ctl0.min_edge, CFG, ctl0.blend_w) : null;
      if (d && !paused && !coolNow.has(d.slug) && !closedSlugs.has(d.slug)) decisions.push(d);
      const conf = cal ? cal.confidence : row.headlines < 3 ? "no-evidence" : "no-ensemble";
      const why = cal ? cal.why : row.headlines < 3 ? "fewer than 3 pieces of recent evidence" : "fewer than " + CFG.MIN_MEMBERS + " model answers";
      writes.push(db.prepare("INSERT OR REPLACE INTO pt_estimate (slug,title,fair,fair_raw,market,edge,confidence,why,ends_at,headlines,traded,updated_at,models,spread,sources,domain,outcome,resolved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)")
        .bind(m.slug, m.title, cal ? cal.p : null, cal ? cal.raw : null, m.yes, cal ? cal.p - m.yes : null, conf, why, m.ends_at ?? null, row.headlines, d ? 1 : 0, now, JSON.stringify(row.members), cal ? cal.spread : null, JSON.stringify(row.sources || {}), domain));
      // the append-only forecast log: one hash-chained row per estimate, with the evidence it was made from
      const core = JSON.stringify({ ts: now, slug: m.slug, title: m.title, fair_raw: cal ? cal.raw : null, fair: cal ? cal.p : null, market: m.yes, spread: m.spread ?? null, confidence: conf, why, ends_at: m.ends_at ?? null, domain, params_version: ctl0.params_version, recal: [ctl0.recal_a, ctl0.recal_b], blend_w: ctl0.blend_w, models: row.members, sources: row.sources || {}, evidence: row.evidence || [] });
      const hash = await chainHash(prevHash, core);
      writes.push(db.prepare("INSERT INTO pt_estimate_log (ts,slug,core,fair_raw,fair,market,confidence,domain,ends_at,params_version,prev_hash,hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(now, m.slug, core, cal ? cal.raw : null, cal ? cal.p : null, m.yes, conf, domain, m.ends_at ?? null, ctl0.params_version, prevHash, hash));
      prevHash = hash;
    }
    const opened = signalEntries(decisions, pos, { cash: cash0 }, pxNow, CFG);
    for (const o of opened) {
      delta -= o.usd;
      writes.push(db.prepare("INSERT INTO pt_position (slug,title,side,qty,entry,strategy,opened_at,fair,edge,why,ends_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(o.slug, o.title, o.side, o.qty, o.entry, o.strategy, now, o.fair, o.edge, o.why, o.ends_at ?? null));
    }
    // closes, opens, estimates and the cash change commit together: a failure leaves the book as it was
    writes.push(db.prepare("UPDATE pt_account SET cash=cash+? WHERE id=1").bind(delta));
    await db.batch(writes);
    const cash = (await account(db)).cash;
    pos = await openPositions(db);
    const eq = equity({ cash }, pos, Object.fromEntries(all.map((m) => [m.slug, m.yes])));
    await db.prepare("INSERT OR REPLACE INTO pt_equity VALUES (?,?,?,?,?)").bind(now, eq, cash, pos.length, source).run();
    result = { source, markets: markets.length, settled, estimated: est.rows.length, ai: est.status, paused, opened: opened.length, closed: closed.length, equity: eq, cash };
  } finally { await unlock(db); }
  const rv = await review(env, db, nowMs).catch((e) => { console.error("review failed", String(e)); return null; });
  return { ...result, review: rv && { resolved: rv.ev.n, brier_gain: rv.ev.brier_gain, graduation_ready: rv.grad.ready, min_edge: rv.ctl.min_edge, actions: rv.actions, published: rv.published } };
}

export async function manualOrder(env, { slug, side, usd }) {
  await init(env);
  const db = env.TRADES_DB;
  if (!["yes", "no"].includes(side) || !(usd > 0)) return { error: "side yes|no and usd > 0 required" };
  if (!(await lock(db))) return { error: "another update is running, retry in a moment" };
  try {
    const m = await db.prepare("SELECT * FROM pt_market WHERE slug=?").bind(slug).first();
    if (!m || m.closed) return { error: "unknown or closed market" };
    // a fill is priced from the last tick's quote, so a quote older than 15 minutes is not tradable (PM-STALE-FILL-1)
    if (!m.updated_at || Date.now() - Date.parse(m.updated_at) > 15 * 60 * 1000) return { error: "market price is stale, wait for the next tick" };
    const acct = await account(db), pos = await openPositions(db);
    const px = Object.fromEntries((await db.prepare("SELECT slug,yes FROM pt_market").all()).results.map((r) => [r.slug, r.yes]));
    const eq = equity(acct, pos, px);
    if (usd > acct.cash) return { error: "insufficient paper cash" };
    if (usd > eq * CFG.POS_PCT) return { error: `position limit ${(CFG.POS_PCT * 100)}% of equity` };
    const exposure = pos.reduce((t, q) => t + q.qty * q.entry, 0);
    if (pos.find((q) => q.slug === slug)) return { error: "a position in this market is already open" };
    if (pos.length >= CFG.MAX_OPEN) return { error: `at most ${CFG.MAX_OPEN} open positions` };
    if (exposure + usd > eq * CFG.EXPO_PCT) return { error: `portfolio exposure limit ${(CFG.EXPO_PCT * 100)}% of equity` };
    if (priceOf(side, m.yes) < 0.01 || priceOf(side, m.yes) > 0.99) return { error: "price too close to 0 or 1 to trade" };
    const fill = Math.min(0.99, priceOf(side, m.yes) * (1 + CFG.SLIP));
    await db.batch([
      db.prepare("INSERT INTO pt_position (slug,title,side,qty,entry,strategy,opened_at) VALUES (?,?,?,?,?,?,?)").bind(slug, m.title, side, usd / fill, fill, "manual", new Date().toISOString()),
      db.prepare("UPDATE pt_account SET cash=cash-? WHERE id=1").bind(usd),
    ]);
    return { ok: true, fill, qty: usd / fill };
  } finally { await unlock(db); }
}
async function state(env) {
  await init(env);
  const db = env.TRADES_DB;
  const acct = await account(db), pos = await openPositions(db);
  // only markets refreshed lately: rows stamped before sports were filtered out expire from the list instead of lingering
  const top = (await db.prepare("SELECT * FROM pt_market WHERE updated_at > ? ORDER BY vol24 DESC LIMIT 100").bind(new Date(Date.now() - 30 * 60000).toISOString()).all()).results;
  // held markets outside the top rows by volume still need their current price for the mark and the equity
  const missing = pos.filter((p) => !top.find((m) => m.slug === p.slug));
  const extra = missing.length ? (await db.prepare(`SELECT * FROM pt_market WHERE slug IN (${missing.map(() => "?").join(",")})`).bind(...missing.map((p) => p.slug)).all()).results : []; // standards-ok: only "?" placeholders are interpolated, every value goes through .bind()
  const mk = top.concat(extra);
  const px = Object.fromEntries(mk.map((m) => [m.slug, m.yes]));
  const history = (await db.prepare("SELECT * FROM pt_position WHERE closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 50").all()).results;
  const curve = (await db.prepare("SELECT ts,equity FROM pt_equity ORDER BY ts DESC LIMIT 288").all()).results.reverse();
  const realized = (await db.prepare("SELECT COALESCE(SUM(pnl),0) s, COUNT(*) n, SUM(pnl>0) w FROM pt_position WHERE closed_at IS NOT NULL").first());
  const predictions = (await db.prepare("SELECT * FROM pt_estimate ORDER BY updated_at DESC LIMIT 25").all()).results;
  const eq = equity(acct, pos, px);
  return { paper: true, predictions, start: acct.start_cash, cash: acct.cash, equity: eq, return_pct: (eq / acct.start_cash - 1) * 100,
    open: pos.map((p) => ({ ...p, mark: markOf(p, px), unrealized: p.qty * (markOf(p, px) - p.entry) })),
    closed: history, stats: stats(curve, (await db.prepare("SELECT strategy,pnl FROM pt_position WHERE closed_at IS NOT NULL").all()).results),
    realized: realized.s, trades_closed: realized.n, win_rate: realized.n ? realized.w / realized.n : null, curve, markets: mk.slice(0, 30) };
}
// The charter with the evidence behind it: does the information beat the market, and may anything graduate? Read-only.
async function charterStatus(env) {
  await init(env);
  const db = env.TRADES_DB, ctl = await readControl(db);
  const { ev, evFrozen, rows, ctx } = await evidenceNow(db, ctl);
  const decisions = (await db.prepare("SELECT * FROM pt_decision ORDER BY id DESC LIMIT 20").all()).results;
  const pending = (await db.prepare("SELECT COUNT(*) n FROM pt_estimate WHERE outcome IS NULL AND fair IS NOT NULL").first()).n;
  const buckets = (await db.prepare("SELECT CAST(l.fair*10 AS INTEGER) b, COUNT(*) n, AVG(l.fair) p, AVG(e.outcome) f FROM pt_estimate_log l JOIN pt_estimate e ON e.slug = l.slug WHERE l.id = (SELECT MIN(x.id) FROM pt_estimate_log x WHERE x.slug = l.slug AND x.fair IS NOT NULL) AND e.outcome IN (0,1) GROUP BY b ORDER BY b").all()).results;
  const logged = await db.prepare("SELECT COUNT(*) n, MAX(id) last FROM pt_estimate_log").first();
  const head = logged.last ? (await db.prepare("SELECT hash FROM pt_estimate_log WHERE id = ?").bind(logged.last).first()).hash : "";
  const lead = rows.map((x) => (Date.parse(x.ends_at) - Date.parse(x.ts)) / 3600000).filter(Number.isFinite).sort((a, b) => a - b);
  return { charter: CHARTER, mode: CHARTER.mode, control: { ...ctl, paused: isPaused(ctl, Date.now()) },
    evaluation: ev, evaluation_frozen: evFrozen, graduation: graduation(evFrozen, { ...ctx, days: ctx.frozen_days }), context: ctx, estimates_pending: pending,
    by_domain: byDomain(rows), log_loss: logLoss(rows), lead_hours: { n: lead.length, median: lead.length ? lead[Math.floor(lead.length / 2)] : null },
    params: { version: ctl.params_version, started_at: ctl.version_started_at, recal: { a: ctl.recal_a, b: ctl.recal_b }, blend_w: ctl.blend_w, min_edge: ctl.min_edge, domains_off: ctl.domains_off, last_tune_at: ctl.last_tune_at },
    track_record: { count: logged.n, head_hash: head, chain_ok: ctl.chain_ok, chain_checked_at: ctl.chain_checked_at },
    calibration: { n: ev.n, brier_model: ev.brier_model, brier_market: ev.brier_market, buckets }, decisions };
}
// The public forecast log: every estimate the program ever made, in order, each hash-chained to the one before, with the evidence it used.
// Anyone can recompute the chain (sha256 of previous hash + "|" + core) and see that nothing was edited, removed or reordered.
async function trackRecord(env, limit = 100) {
  await init(env);
  const db = env.TRADES_DB;
  const chain = await chainStatus(db, await readControl(db), Date.now(), true);
  const rows = (await db.prepare("SELECT id, ts, slug, fair_raw, fair, market, confidence, domain, params_version, prev_hash, hash, core FROM pt_estimate_log ORDER BY id DESC LIMIT ?").bind(Math.min(500, Math.max(1, limit))).all()).results;
  return { how_to_verify: "for each row in id order: hash = sha256(prev_hash + '|' + core); the first prev_hash is empty", chain, rows };
}

// WHITEPAPER-BEGIN (generated by q08-prediction-markets/whitepaper-build.mjs; do not edit by hand)
const WHITEPAPER_HTML = "<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>Where Do LLM Forecasters Have an Edge Over Prediction Markets?</title><meta name=description content=\"Evidence on where language-model forecasters may beat prediction markets, a pre-registered test, and the Q08 proving ground.\"><style>:root{color-scheme:light dark;--bg:#fff;--fg:#1a1a1a;--mut:#555;--line:#8884;--acc:#0b57d0}@media(prefers-color-scheme:dark){:root{--bg:#14161a;--fg:#e8e8e8;--mut:#aaa;--acc:#8ab4f8}}body{background:var(--bg);color:var(--fg);font:17px/1.6 Georgia,'Times New Roman',serif;max-width:46rem;margin:0 auto;padding:16px}nav{font:14px system-ui;color:var(--mut);display:flex;gap:14px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:10px}a{color:var(--acc)}h1{font-size:1.7rem;line-height:1.25}h2{font-size:1.3rem;margin-top:2rem}h3{font-size:1.1rem}.t{overflow-x:auto}table{border-collapse:collapse;font:14px/1.45 system-ui;margin:1rem 0}td,th{border:1px solid var(--line);padding:6px 8px;vertical-align:top;text-align:left}th{background:#8881}code{font:0.9em ui-monospace,monospace;background:#8882;padding:0 3px;border-radius:3px}footer{font:13px system-ui;color:var(--mut);border-top:1px solid var(--line);margin-top:2rem;padding-top:10px}</style></head><body><nav><a href=\"/\">Dashboard</a><a href=\"/api/charter\">Live evidence</a><a href=\"/api/track-record\">Track record</a><a href=\"https://github.com/QNFO/qnfo-workers/tree/main/papers/pm-information-edge-2026-11-09\">Source</a></nav>\n<h1 id=\"where-do-llm-forecasters-have-an-edge-over-prediction-markets\">Where Do LLM Forecasters Have an Edge Over Prediction Markets?</h1>\n<p><strong>Evidence, a pre-registered test, and the Q08 proving ground</strong> · QNFO · 9 November 2026 · version 1.0 · charter PM-CHARTER-1</p>\n<h2 id=\"summary\">Summary</h2>\n<ol><li><strong>There is no demonstrated general edge.</strong> In the sources reviewed for this paper, language-model forecasters at best match the aggregate of a human forecasting crowd, and they trail the best human forecasters. None of the studies compares them with liquid market prices after trading costs, and I found no peer-reviewed evidence of a profit from doing so.</li><li><strong>An edge is plausible only in specific places.</strong> The evidence points to six hypotheses (section 3): combining a model with the crowd, structural mispricing between related contracts, systematic crowd biases such as the favourite-longshot bias, breadth across many low-attention markets, speed on thin or newly listed markets, and domains where the model's sources lead the crowd.</li><li><strong>Most published comparisons cannot tell us whether an edge is real.</strong> Leakage of future information, human forecasts in training data, metric choices and small samples all inflate or obscure results (section 4).</li><li><strong>So the Q08 program is built to prove or refute an edge on paper, not to assume one.</strong> Fourteen recommendations follow from the evidence (section 6). Eleven are implemented in the open-source worker <code>q08-prediction-markets</code> (version 1.6), and three are filed as tracked issues or recorded on the live-trading decision item. Real money stays out of reach of the code until a pre-registered gate passes (section 7).</li></ol>\n<p><em>What this paper does not claim:</em> that Q08 has an edge. It claims that the question is testable, describes the test, and publishes the result as it accrues at <code>/api/charter</code> and <code>/api/track-record</code>.</p>\n<h2 id=\"1-why-the-question-matters\">1. Why the question matters</h2>\n<p>A prediction market price is itself an aggregate forecast. A model that only restates the price adds nothing, and a model that is worse than the price loses money to the people who trade against it. A forecaster profits only where its probability is better than the price by more than the cost of trading. That makes the right yardstick the market price, not a coin flip and not a forecasting-tournament crowd.</p>\n<h2 id=\"2-what-the-literature-shows\">2. What the literature shows</h2>\n<div class=\"t\"><table><thead><tr><th>Study</th><th>Comparison</th><th>Reported result</th><th>What it does not show</th></tr></thead><tbody><tr><td>Halawi et al. 2024, <em>Approaching Human-Level Forecasting with Language Models</em> [1]</td><td>Retrieval-augmented model system against the community forecast, on questions opened after the models' knowledge cutoffs</td><td>Brier score 0.179 for the system against 0.149 for the crowd. Where the crowd was uncertain (between 0.3 and 0.7) the system scored 0.238 against 0.240. Blending the system with the crowd improved on the crowd alone</td><td>The baseline is a forecasting platform's crowd, not market prices. The system did not beat the crowd overall</td></tr><tr><td>Schoenegger et al. 2024, <em>Wisdom of the Silicon Crowd</em>, Science Advances [2]</td><td>An ensemble of 12 language models against 925 human forecasters on 31 binary questions</td><td>The model ensemble was not statistically different from the human crowd. In a second study, showing models the median human forecast improved their accuracy by roughly 17 to 28 percent, and averaging human and machine forecasts was more accurate. Models showed an acquiescence bias, with mean predictions significantly above 50 percent</td><td>Thirty-one questions is a small sample, and the comparison is again with a tournament crowd</td></tr><tr><td>Karger et al. 2025, <em>ForecastBench</em>, ICLR [3]</td><td>A dynamic benchmark of about 1,000 questions whose answers are not yet known</td><td>In the launch evaluation on a 200-question subset: superforecasters 0.093, the general public 0.107, the best model (Claude 3.5 Sonnet) 0.111</td><td>A 2024 snapshot; current standings change as questions resolve</td></tr><tr><td>Metaculus AI benchmark, quarterly reports 2024 and 2025 [4]</td><td>Bots against teams of professional forecasters</td><td>Pros beat the best bots in every quarterly benchmark found. In the first 2024 round, pros beat all 34 bots. In Q2 2025 (348 questions; 96 forecast by pros) the lead was significant (p = 0.00001). A Gemini-based bot placed 37th of 551 in a 2025 open cup</td><td>These are Metaculus's own analyses and a secondary 2026 synthesis; the gap has narrowed but not closed</td></tr><tr><td>Saguillo et al. 2025, <em>Unravelling the Probabilistic Forest</em> [5]</td><td>Price consistency inside and across Polymarket contracts, April 2024 to April 2025</td><td>Across 8,659 single-condition and 1,578 multiple-condition markets the authors estimate about 40 million US dollars of realised arbitrage profit</td><td>Abstract-level reading only; it is structural arbitrage, not forecasting skill</td></tr><tr><td>Snowberg and Wolfers 2010, <em>Explaining the Favorite-Longshot Bias</em>, JPE [6]</td><td>Betting-market prices against outcomes</td><td>Misperception of probabilities explains the favourite-longshot bias better than risk-love</td><td>Racetrack data, not prediction markets</td></tr><tr><td>Bürgi, Deng and Whelan 2025, <em>Makers and Takers</em>, on Kalshi [7]</td><td>Kalshi contract prices against outcomes</td><td>Prices are informative and improve near expiry, with a favourite-longshot bias: contracts priced below 10 cents lose over 60 percent of the money staked; takers lose more than makers</td><td>Reported through a CEPR summary and several working-paper versions; the exact figures should be checked against the primary PDF</td></tr><tr><td>Baron et al. 2014, <em>Two Reasons to Make Aggregated Probability Forecasts More Extreme</em> [8]</td><td>Aggregated crowd probabilities against outcomes</td><td>Averaging pulls probabilities toward 0.5; transforming them toward 0 or 1 makes them correspond better to outcomes. The effect is smaller for the median or the mean of log-odds</td><td>Human tournaments, not model ensembles</td></tr><tr><td>Paleka et al. 2025, <em>Pitfalls in Evaluating Language Model Forecasters</em> [9]</td><td>Evaluation methods</td><td>Leakage of post-forecast information, unreliable date-restricted retrieval, human forecasts inside training data, and metrics that over-weight high-base-rate questions</td><td>A methodological critique, not a result about markets</td></tr></tbody></table></div>\n<p><strong>Reading across the table.</strong> The strongest, best-replicated result is that aggregation helps: ensembles of models approach a human crowd, and a blend of models and humans beats either. The weakest link is the absence of any test against market prices with realistic costs.</p>\n<h2 id=\"3-where-an-edge-is-plausible-six-hypotheses\">3. Where an edge is plausible: six hypotheses</h2>\n<p>Each hypothesis states a mechanism and what would refute it. None is established.</p>\n<p><strong>H1. Combining model and crowd.</strong> The best-supported claim: a blend of an independent model forecast and the market price beats the price alone [1][2]. <em>Refuted if</em> the blend's Brier score is not lower than the price's with a 95 percent interval clear of zero on a pre-registered sample.</p>\n<p><strong>H2. Structural mispricing.</strong> Related contracts that must sum to one often do not, and one study estimates about 40 million US dollars of realised arbitrage on Polymarket in a year [5]. This needs no forecasting skill, only consistent bookkeeping across contracts. <em>Refuted if</em> the gaps do not survive spreads and fees at the sizes we can trade. It is the only hypothesis in this list that does not depend on a model being better than the crowd.</p>\n<p><strong>H3. Systematic crowd bias.</strong> Low-priced contracts win less often than their prices imply [6][7]. A model calibrated on outcomes can learn this correction. <em>Refuted if</em> the learned correction is indistinguishable from the identity on our own resolved sample.</p>\n<p><strong>H4. Breadth.</strong> A crowd attends to the headline markets. A program that reads evidence for every short-dated market in a category can cover the long tail. <em>Refuted if</em> edge appears only in markets with large volume, where the crowd is already attentive.</p>\n<p><strong>H5. Speed on thin markets.</strong> In newly listed or thinly traded markets, prices may lag fresh reporting. <em>Refuted if</em> the gap between our estimate and the price closes only after the evidence is already old.</p>\n<p><strong>H6. Domains where our sources lead.</strong> Q08's own signal sources are Hacker News, GDELT and Wikipedia (its search and its daily current-events portal), the same ones its research ledger reads. For technology, AI and software-release questions, reporting there may lead the crowd; for geopolitics and elections it plausibly does not. <em>Refuted if</em> the per-domain evaluation shows no positive interval in any domain after 30 resolved estimates per domain.</p>\n<p><strong>Where we expect no edge.</strong> Liquid headline markets, where public information is priced within minutes; sports, where the crowd and bookmakers already specialise (excluded from the Q08 universe); markets resolved by a price bracket or a count on a given day (price ranges, tweet counts), where news carries little beyond the live number and a structured price model is the right tool (excluded from the Q08 universe); and markets resolved by a subjective judgment of wording rather than by a checkable fact.</p>\n<h2 id=\"4-how-forecasting-evaluations-go-wrong\">4. How forecasting evaluations go wrong</h2>\n<p>The pitfalls below shape the design, because each one can create an apparent edge from nothing [9][10].</p>\n<ol><li><strong>Leakage.</strong> A model trained after the event, or a search engine that returns pages updated after the question date, can see the answer. Date-restricted retrieval has been found unreliable, and asking a model to feign ignorance of events before its cutoff does not stand in for a real cutoff [9][10]. <em>Control:</em> forward-only evaluation on questions whose answers do not yet exist, evidence limited to the previous three days, and the evidence stored with each forecast.</li><li><strong>Human forecasts in training data.</strong> A model that has seen the crowd's number is not independent [9]. <em>Control:</em> the market price is never shown to the model.</li><li><strong>Metric choice.</strong> Brier scores over-weight questions with a high base rate, and calibration alone can reward useless forecasts [9]. <em>Control:</em> report Brier score, log loss and the gain over the market price, on the same markets, with intervals.</li><li><strong>Forecast timing.</strong> Scoring a forecast made hours before resolution rewards the easy cases. <em>Control:</em> the first forecast on each market is the one scored, with its lead time recorded.</li><li><strong>Tuning on the test set.</strong> Adjusting thresholds while watching the score inflates the final result. <em>Control:</em> parameter changes start a new evaluation sample, and graduation counts only forecasts made under the current, frozen parameters.</li><li><strong>Selective memory.</strong> Overwritten forecasts hide misses. <em>Control:</em> an append-only log in which each row carries a hash of the row before it.</li></ol>\n<h2 id=\"5-costs-and-market-structure\">5. Costs and market structure</h2>\n<p>A forecast is not a profit. Takers pay the spread and sometimes a fee, and the Kalshi study reports that takers lose more than makers [7]. Our shadow return therefore charges slippage on every simulated bet, markets with wide spreads are skipped, and position sizes are a fraction of a Kelly stake so that estimation error cannot dominate. Live trading, if it ever happens, should use resting limit orders where the terms allow, which is a design for a later phase.</p>\n<h2 id=\"6-recommendations-and-what-was-done\">6. Recommendations and what was done</h2>\n<div class=\"t\"><table><thead><tr><th>#</th><th>Recommendation</th><th>Basis</th><th>Status in <code>q08-prediction-markets</code> 1.6</th></tr></thead><tbody><tr><td>R1</td><td>Hide the market price from the model</td><td>[2], [9]</td><td>Implemented; tested</td></tr><tr><td>R2</td><td>Use several model families and aggregate with the median</td><td>[2], [8]</td><td>Implemented: three families from the fleet's approved model table; agreement and spread rules</td></tr><tr><td>R3</td><td>Retrieve fresh evidence from several independent sources and keep a snapshot</td><td>[1], [9]</td><td>Implemented: Hacker News, GDELT, Wikipedia search and the Wikipedia current-events portal; per-source counts and an evidence digest in every log row</td></tr><tr><td>R4</td><td>Learn a recalibration (stretch or shrink) from resolved outcomes</td><td>[6], [7], [8]</td><td>Implemented: logistic recalibration fitted on raw ensemble probabilities, bounded, applied only after 50 resolved estimates</td></tr><tr><td>R5</td><td>Blend the model with the market price and size by fractional Kelly</td><td>[1], [2]</td><td>Implemented: blend weight chosen by Brier score on resolved estimates; quarter-Kelly sizing capped at the position limit</td></tr><tr><td>R6</td><td>Score the first forecast on each market, with lead time</td><td>section 4</td><td>Implemented</td></tr><tr><td>R7</td><td>Append-only, tamper-evident forecast log, public</td><td>section 4</td><td>Implemented: hash chain, <code>GET /api/track-record</code> with verification</td></tr><tr><td>R8</td><td>Freeze parameters during evaluation</td><td>section 4</td><td>Implemented: parameter version; graduation counts the current version only; tuning at most weekly</td></tr><tr><td>R9</td><td>Evaluate by domain and switch off domains that lose</td><td>H6</td><td>Implemented: domain classifier, per-domain interval, automatic domain pause</td></tr><tr><td>R10</td><td>Report log loss as well as Brier score</td><td>section 4</td><td>Implemented</td></tr><tr><td>R11</td><td>Skip wide-spread markets</td><td>section 5</td><td>Implemented</td></tr><tr><td>R12</td><td>Test structural arbitrage separately from forecasting skill</td><td>H2, [5]</td><td>Filed as issue 9106: it needs each event's full outcome list</td></tr><tr><td>R13</td><td>Run consistency and fake-date probes on the model</td><td>[9][10]</td><td>Filed as issue 9107</td></tr><tr><td>R14</td><td>Maker-style execution for any live phase</td><td>section 5</td><td>Recorded on the live-trading decision item (issue 8960); not built</td></tr></tbody></table></div>\n<h2 id=\"7-pre-registered-test-and-stopping-rules\">7. Pre-registered test and stopping rules</h2>\n<p>Fixed before any result exists, and served live at <code>/api/charter</code>:</p>\n<ul><li><strong>Sample:</strong> at least 30 days of paper trading, 100 resolved forecasts and 30 qualifying trades under one frozen parameter version.</li><li><strong>Primary criteria, each with a 95 percent bootstrap interval clear of zero:</strong> the model (or the model and price blend) has a lower Brier score than the market price; the shadow return after slippage is positive; and the signal's bets beat backing whichever side the market already favours.</li><li><strong>Safety:</strong> drawdown under 20 percent.</li><li><strong>Automatic pauses:</strong> new entries pause for 24 hours at a 15 percent drawdown or when the model is significantly worse than the price after 30 resolved forecasts. A domain that is significantly worse than the price after 20 resolved forecasts is switched off.</li><li><strong>What happens on success:</strong> the gate only reports. It cannot switch anything on. A live account needs a wallet-signed key, an API key, funding and a jurisdiction and terms review, all of which belong to the owner, and none of which the worker holds.</li><li><strong>What would change our mind:</strong> a negative interval on the primary criteria after 100 resolved forecasts retires the signal strategy. The program would then keep only the structural-arbitrage work, if that survives costs.</li></ul>\n<h2 id=\"8-limitations\">8. Limitations</h2>\n<ul><li>The literature review was a targeted search, not a systematic review. Several figures come through secondary summaries and are marked as such.</li><li>The sample will take weeks. Early paper profit says little, and the dashboard will say \"not yet\" for a long time.</li><li>Wikipedia as an evidence source and the router's acceptance of every model identifier could not be verified before deployment; per-source counts and the list of models that answered are stored with every forecast so a failure is visible.</li><li>The three model families share much of the same internet text, so their errors are correlated; three models are worth fewer than three independent forecasters.</li><li>Resolution risk (disputed or ambiguous resolution) is not modelled.</li></ul>\n<h2 id=\"references\">References</h2>\n<ol><li>Halawi, D., Zhang, F., Yueh-Han, C., Steinhardt, J. (2024). <em>Approaching Human-Level Forecasting with Language Models.</em> <a href=\"https://arxiv.org/html/2402.18563v1\">arXiv:2402.18563</a></li><li>Schoenegger, P., Tuminauskaite, I., Park, P. S., Tetlock, P. E. (2024). <em>Wisdom of the Silicon Crowd: LLM Ensemble Prediction Capabilities Rival Human Crowd Accuracy.</em> Science Advances. <a href=\"https://arxiv.org/html/2402.19379v6\">arXiv:2402.19379</a></li><li>Karger, E., Bastani, H., et al. (2025). <em>ForecastBench: A Dynamic Benchmark of AI Forecasting Capabilities.</em> ICLR. <a href=\"https://arxiv.org/pdf/2409.19839\">arXiv:2409.19839</a></li><li>Metaculus (2024 to 2025). AI Forecasting Benchmark quarterly results. <a href=\"https://forum.nunosempere.com/posts/mwcWxwdsEMexm98GF/q1-ai-benchmarking-results-human-pros-crush-bots\">Q1 2025</a>, <a href=\"https://www.lesswrong.com/posts/Surnjh8A4WjgtQTkZ/q2-ai-benchmark-results-pros-maintain-clear-lead\">Q2 2025</a>, <a href=\"https://forum.nunosempere.com/posts/E3hiRG68wc6zLWr6m/can-ai-outpredict-humans-results-from-metaculus-s-q3-ai\">Q3 2024</a></li><li>Saguillo, O., Ghafouri, V., Kiffer, L., Suarez-Tangil, G. (2025). <em>Unravelling the Probabilistic Forest: Arbitrage in Prediction Markets.</em> <a href=\"https://arxiv.org/abs/2508.03474\">arXiv:2508.03474</a></li><li>Snowberg, E., Wolfers, J. (2010). <em>Explaining the Favorite-Long Shot Bias: Is it Risk-Love or Misperceptions?</em> Journal of Political Economy 118(4). <a href=\"https://www.nber.org/papers/w15923\">NBER w15923</a></li><li>Bürgi, C., Deng, W., Whelan, K. (2025). <em>Makers and Takers: The Economics of the Kalshi Prediction Market.</em> <a href=\"https://cepr.org/voxeu/columns/economics-kalshi-prediction-market\">CEPR summary</a>, <a href=\"https://www.karlwhelan.com/Papers/Kalshi.pdf\">working paper</a></li><li>Baron, J., Mellers, B. A., Tetlock, P. E., Stone, E., Ungar, L. H. (2014). <em>Two Reasons to Make Aggregated Probability Forecasts More Extreme.</em> Decision Analysis 11(2). <a href=\"https://econpapers.repec.org/RePEc:inm:ordeca:v:11:y:2014:i:2:p:133-145\">link</a></li><li>Paleka, D., Goel, S., Geiping, J., Tramèr, F. (2025). <em>Pitfalls in Evaluating Language Model Forecasters.</em> <a href=\"https://arxiv.org/html/2506.00723v1\">arXiv:2506.00723</a></li><li><em>Simulated Ignorance Fails: A Systematic Study of LLM Behaviors on Forecasting Problems Before Model Knowledge Cutoff</em> (2026). <a href=\"https://arxiv.org/html/2601.13717v1\">arXiv:2601.13717</a></li><li>Polymarket documentation, <em>Geoblock</em>. <a href=\"https://docs.polymarket.com/developers/CLOB/geoblock\">docs.polymarket.com</a></li></ol>\n<p><em>Live evidence:</em> <a href=\"https://markets.q08.org/api/charter\">markets.q08.org/api/charter</a> · <a href=\"https://markets.q08.org/api/track-record\">markets.q08.org/api/track-record</a> · charter PM-CHARTER-1 · decisions and open items: issues 8960, 8961, 8840, 9106 and 9107 in the QNFO/qnfo-workers repository.</p>\n<footer>Paper money only. Nothing here is investment advice, and no real order is placed by this program. Charter PM-CHARTER-1.</footer></body></html>\n";
// WHITEPAPER-END
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
const PAGE = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Q08 Markets (paper)</title>
<style>:root{color-scheme:light dark}body{font:15px system-ui;max-width:860px;margin:0 auto;padding:16px}h1{font-size:20px}table{width:100%;border-collapse:collapse}td,th{padding:6px;border-bottom:1px solid #8884;text-align:left;overflow-wrap:anywhere}button{padding:8px 10px}.n{text-align:right}button{font:inherit}.b{background:#fc03;padding:8px;border-radius:6px}</style>
<h1>Q08 Markets <small>paper trading</small></h1><p><small><a href=/whitepaper>White paper</a> &middot; <a href=/api/charter>Charter and evidence</a> &middot; <a href=/api/track-record>Track record</a></small></p><div class=b>Simulated money only. No real orders.</div><p id=s>Loading...</p>
<button id=t>Run tick now</button><p id=x></p><h2>Does the information beat the market?</h2><p id=ev>Collecting evidence...</p><h2>Predictions</h2><p><small>Three models read the last 3 days of Hacker News, GDELT and Wikipedia reporting on short-term non-sports markets and give their own probabilities without seeing the price. A paper trade opens only when they agree on a gap of 10 points or more.</small></p><table id=pr></table><p><label>Order size $ <input id=amt type=number value=100 min=1 step=1></label> <span id=msg role=status></span></p><h2>Open positions</h2><table id=o></table><h2>Closed</h2><table id=c></table><h2>Markets</h2><table id=m></table>
<script>const f=n=>(+n).toFixed(2);async function L(){const d=await (await fetch('/api/state')).json();
s.textContent='Equity $'+f(d.equity)+' ('+f(d.return_pct)+'%) | cash $'+f(d.cash)+' | closed '+d.trades_closed+' | win rate '+(d.win_rate==null?'n/a':f(d.win_rate*100)+'%');
x.textContent='Max drawdown '+f(d.stats.max_drawdown_pct)+'% | '+Object.entries(d.stats.by_strategy).map(([k,v])=>k+': '+v.trades+' trades, P&L $'+f(v.pnl)).join(' | ');
const cs=await (await fetch('/api/charter')).json();const e=cs.evaluation;const pc=v=>v==null?'n/a':(v>=0?'+':'')+(v*100).toFixed(1)+'%';ev.textContent=(cs.graduation.ready?'All graduation criteria met. ':'Paper only. ')+e.n+' resolved estimates, '+e.shadow_n+' qualifying trades. Brier: model '+(e.brier_model==null?'n/a':e.brier_model.toFixed(3))+' vs market '+(e.brier_market==null?'n/a':e.brier_market.toFixed(3))+'. Frozen sample (parameters v'+cs.params.version+'): '+cs.evaluation_frozen.n+' resolved. Shadow ROI '+pc(e.shadow_roi)+' vs backing the favourite '+pc(e.control_roi)+'. '+(cs.control.paused?'Entries paused: '+cs.control.paused_reason+'. ':'')+(cs.graduation.ready?'':'Not yet: '+cs.graduation.reasons.join('; ')+'.');
const E=v=>String(v).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');const r=(a,k)=>'<tr>'+k.map(x=>'<td>'+E(x)+'</td>').join('')+'</tr>';
o.innerHTML='<tr><th>Market<th>Side<th class=n>Entry<th class=n>Mark<th class=n>Fair<th class=n>P&L</tr>'+d.open.map(p=>r(0,[p.title,p.side,f(p.entry),f(p.mark),p.fair==null?'-':f(p.side=='yes'?p.fair:1-p.fair),f(p.unrealized)])).join('');
pr.innerHTML='<tr><th>Market<th class=n>Signal<th class=n>Market<th class=n>Gap<th>Resolves<th>Why</tr>'+d.predictions.map(p=>r(0,[p.title,p.fair==null?'-':f(p.fair),f(p.market),p.edge==null?'-':(p.edge>0?'+':'')+f(p.edge*100)+' pts',p.ends_at?String(p.ends_at).slice(0,10):'-',(p.traded?'TRADED: ':'')+p.why])).join('');
c.innerHTML='<tr><th>Market<th>Side<th>Reason<th class=n>P&L</tr>'+d.closed.map(p=>r(0,[p.title,p.side,p.reason,f(p.pnl)])).join('');
m.innerHTML='<tr><th>Market<th class=n>Yes<th class=n>Move<th>Paper order</tr>'+d.markets.map(p=>'<tr><td>'+E(p.title)+'<td>'+f(p.yes)+'<td>'+f(p.move)+'<td><button data-s="'+E(p.slug)+'" data-d=yes>Buy YES</button> <button data-s="'+E(p.slug)+'" data-d=no>Buy NO</button></tr>').join('')}
m.onclick=async e=>{const b=e.target.closest('button');if(!b||!b.dataset.s)return;const q=await fetch('/api/order',{method:'POST',body:JSON.stringify({slug:b.dataset.s,side:b.dataset.d,usd:+amt.value})});const j=await q.json();msg.textContent=j.error?('Not placed: '+j.error):('Filled at '+f(j.fill)+' for '+f(j.qty)+' shares');L()};
t.onclick=async()=>{t.disabled=1;await fetch('/api/tick',{method:'POST'});t.disabled=0;L()};L();setInterval(L,30000)</script>`;

export default {
  async fetch(req, env) {
    const u = new URL(req.url), p = u.pathname;
    try {
      if (p === "/health") return json({ ok: true, worker: "q08-prediction-markets", version: VERSION, paper_trading: true, mode: CHARTER.mode, charter: CHARTER.id, features: ["paper-trading", "order-form", "signal-ensemble", "no-sports", "charter", "graduation-gate", "track-record", "whitepaper", "recalibration", "kelly-sizing"] });
      if (p === "/api/state") return json(await state(env));
      if (p === "/api/markets") return json((await state(env)).markets);
      if (p === "/api/charter") return json(await charterStatus(env));
      if (p === "/whitepaper") return new Response(WHITEPAPER_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
      if (p === "/api/track-record") return json(await trackRecord(env, Number(u.searchParams.get("limit")) || 100));
      if (p === "/api/tick" && req.method === "POST") { const r = await tick(env); return json(r, r.busy ? 409 : 200); }
      if (p === "/api/order" && req.method === "POST") { const r = await manualOrder(env, await req.json()); return json(r, r.error ? 400 : 200); }
      if (p === "/" || p === "/dashboard") return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
      return json({ error: "not found" }, 404);
    } catch (e) { return json({ error: String(e.message || e) }, 500); }
  },
  async scheduled(_e, env, ctx) { ctx.waitUntil(tick(env)); },
};
