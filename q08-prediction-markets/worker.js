// q08-prediction-markets: the paper-trading proving ground for q08's information edge (PM-CHARTER-1).
// Paper money only. No wallet, no exchange key, no order ever leaves this worker: the only executor in this file writes D1 rows.
var VERSION = "1.5.0";

// ---------- charter (the machine-readable form; GET /api/charter serves it with the live evidence) ----------
export const CHARTER = {
  id: "PM-CHARTER-1",
  pillar: "personal",
  objective: "Find short-term, non-sports prediction-market questions where an independently researched probability beats the market price, and prove that on paper before any real money is considered.",
  thesis: "A model that only reads the price adds nothing. The edge has to come from information the crowd has not priced yet: fresh primary reporting and q08's own signal sources (Hacker News, GDELT, and the research ledger behind q08 forecasts), read by several model families that never see the price. The literature says to expect no edge by default (a retrieval-augmented ensemble scored Brier 0.179 against 0.149 for the human crowd, Halawi et al. 2024), so every claim of an edge is measured here against the market price and against simply backing the market favourite.",
  mode: "paper",
  universe: { sports: "excluded", horizon_days: 14, min_volume24: 10000, price_band: [0.05, 0.95] },
  method: { evidence: ["gdelt", "hacker-news"], ensemble_min_members: 2, max_spread: 0.25, min_gap: 0.10, price_hidden_from_model: true, hold: "to resolution; early exit only on convergence to the estimate" },
  risk: { start_cash: 10000, position_pct: 0.05, exposure_pct: 0.30, max_open: 8, slippage: 0.01, breaker_drawdown_pct: 15 },
  graduation: { min_days: 30, min_resolved_estimates: 100, min_resolved_trades: 30, max_drawdown_pct: 20, confidence: 0.95, rule: "model (or model+market blend) beats the market price on Brier, shadow ROI after costs is above zero, and signal trades beat backing the market favourite, each with the 95% bootstrap interval clear of zero" },
  live: { enabled: false, why: "Real orders need a wallet-signed key, an API key, funding and a jurisdiction and terms-of-service review: the owner's identity, accounts and money. This worker contains no live executor. When the graduation gate passes, the owner decision is requested as an IDENTITY-BOUND item whose default is to stay on paper." },
  loops: [
    "tick every 5 minutes: fetch, filter sports, settle estimates that resolved, estimate up to 3 new markets, trade clear gaps, exit on resolution or convergence",
    "review on every tick: score resolved estimates, apply bounded self-tuning (minimum gap 8-20 points) and the drawdown/accuracy circuit breaker with an expiry, log each change in pt_decision",
    "publish: metric_registry values and the worker heartbeat in qnfo-audit, where the fleet's metric triggers file breaches as issues",
    "graduation: evaluated continuously; never flips live by itself",
  ],
};
const CFG = { START: 10000, POS_PCT: 0.10, EXPO_PCT: 0.30, STOP: 0.15, TAKE: 0.30, SLIP: 0.01, MAX_OPEN: 8,
  HORIZON_D: 14, SIG_MIN_VOL: 10000, MIN_EDGE: 0.10, SIG_POS_PCT: 0.05, MAX_EST: 3, EST_TTL_H: 6, CONVERGE: 0.03, MAX_SPREAD: 0.25, MIN_MEMBERS: 2,
  EDGE_MIN: 0.08, EDGE_MAX: 0.20, BREAKER_DD: 15, PAUSE_H: 24 };
const ENSEMBLE = ["glm-5.3-flash", "deepseek-v4-flash", "qwen3-30b-a3b"]; // three model families, none of which sees the market price

// ---------- pure engine (tested in engine.test.mjs) ----------
export function parseMarket(m) {
  let p = m.outcomePrices;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch { p = null; } }
  const yes = p ? parseFloat(p[0]) : NaN;
  if (!m.slug || !(yes >= 0 && yes <= 1)) return null;
  const t = Date.parse(m.endDate || "");
  const out = { slug: m.slug, title: m.question || m.slug, yes, vol24: +m.volume24hr || 0, move: +m.oneDayPriceChange || 0, closed: m.closed ? 1 : 0, ends_at: Number.isFinite(t) ? new Date(t).toISOString() : null };
  out.sports = isSports({ title: out.title, slug: m.slug, category: m.category || m.groupItemTitle || "" }) ? 1 : 0;
  return out;
}
const SPORTS_RE = /\b(nba|nfl|mlb|nhl|wnba|ufc|mma|ncaa|fifa|uefa|epl|premier league|la liga|serie a|bundesliga|ligue 1|champions league|europa league|world cup|super bowl|stanley cup|world series|playoffs?|grand slam|wimbledon|us open|french open|australian open|atp|wta|formula 1|f1|grand prix|nascar|pga|the masters|ryder cup|olympics?|boxing|cricket|ipl|rugby|touchdown|moneyline|over\/under|o\/u|mvp|heisman|ballon d'or|vs|win on 20\d\d-\d\d-\d\d)\b|\bspread\s*[:(]/i;
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
export function candidates(markets, heldSlugs, cool, cfg = CFG, now = Date.now()) {
  return markets.filter((m) => {
    const d = daysUntil(m.ends_at, now);
    return !m.sports && !m.closed && d != null && d > 0.04 && d <= cfg.HORIZON_D && m.vol24 >= cfg.SIG_MIN_VOL
      && m.yes >= 0.05 && m.yes <= 0.95 && !heldSlugs.has(m.slug) && !cool.has(m.slug);
  }).sort((a, b) => b.vol24 - a.vol24);
}
const STOP = new Set("will the a an of in on by to for be is are at as and or with from this that than before after into over under".split(" "));
export function newsQuery(title) {
  const w = String(title).replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter((x) => x.length > 2 && !STOP.has(x.toLowerCase()) && !/^\d{4}$/.test(x));
  return w.slice(0, 7).join(" ");
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
export function decide(agg, m, minEdge = CFG.MIN_EDGE, cfg = CFG) {
  if (!agg || agg.confidence === "low" || agg.spread > cfg.MAX_SPREAD) return null;
  const edge = agg.p - m.yes;
  if (Math.abs(edge) < minEdge) return null;
  const side = edge > 0 ? "yes" : "no";
  if (!agg.ps.every((p) => (side === "yes" ? p > m.yes : p < m.yes))) return null;
  const price = priceOf(side, m.yes);
  if (price < 0.04 || price > 0.94) return null;
  return { slug: m.slug, title: m.title, side, fair: agg.p, edge, why: agg.why, ends_at: m.ends_at };
}
export function signalEntries(decisions, positions, acct, px, cfg = CFG) {
  const open = new Set(positions.map((p) => p.slug));
  const eq = equity(acct, positions, px);
  let exposure = positions.reduce((s, p) => s + p.qty * p.entry, 0), cash = acct.cash, n = positions.length;
  const out = [];
  for (const d of decisions.slice().sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))) {
    if (open.has(d.slug) || n >= cfg.MAX_OPEN) continue;
    const usd = Math.min(eq * cfg.SIG_POS_PCT, cash);
    if (usd < 1 || exposure + usd > eq * cfg.EXPO_PCT) break;
    const fill = Math.min(0.99, priceOf(d.side, px[d.slug]) * (1 + cfg.SLIP));
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
  "CREATE TABLE IF NOT EXISTS pt_decision (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT NOT NULL, assumption TEXT, action TEXT NOT NULL, evidence TEXT, rollback TEXT)",
];
const COLUMNS = [["pt_position", "fair", "REAL"], ["pt_position", "edge", "REAL"], ["pt_position", "why", "TEXT"], ["pt_position", "ends_at", "TEXT"], ["pt_market", "ends_at", "TEXT"],
  ["pt_estimate", "outcome", "INTEGER"], ["pt_estimate", "resolved_at", "TEXT"], ["pt_estimate", "models", "TEXT"], ["pt_estimate", "spread", "REAL"]];
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
  return { min_edge: Number(m.min_edge) || CFG.MIN_EDGE, paused_until: m.paused_until || null, paused_reason: m.paused_reason || null };
}
const setControl = (db, key, value, now) => db.prepare("INSERT OR REPLACE INTO pt_control (key,value,updated_at) VALUES (?,?,?)").bind(key, String(value), now);
const logDecision = (db, now, action, assumption, evidence, rollback) => db.prepare("INSERT INTO pt_decision (ts,actor,assumption,action,evidence,rollback) VALUES (?,?,?,?,?,?)").bind(now, "review-loop", assumption, action, JSON.stringify(evidence), rollback);
const isPaused = (ctl, nowMs) => !!ctl.paused_until && Date.parse(ctl.paused_until) > nowMs;

// ---------- evidence and the ensemble (q08's signal sources: Hacker News and GDELT) ----------
async function getJson(url) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
  try { const r = await fetch(url, { signal: ctl.signal }); return r.ok ? await r.json() : null; } catch (e) { return null; } finally { clearTimeout(tm); }
}
async function fetchNews(title) {
  const q = newsQuery(title);
  if (!q) return [];
  const since = Math.floor(Date.now() / 1000 - 3 * 86400);
  const [g, h] = await Promise.all([
    getJson("https://api.gdeltproject.org/api/v2/doc/doc?query=" + encodeURIComponent(q + " sourcelang:english") + "&mode=artlist&maxrecords=10&format=json&timespan=3d&sort=datedesc"),
    getJson("https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=6&query=" + encodeURIComponent(q) + "&numericFilters=" + encodeURIComponent("created_at_i>" + since)),
  ]);
  const a = ((g && g.articles) || []).map((x) => ({ title: String(x.title || "").slice(0, 160), domain: x.domain, date: String(x.seendate || "").slice(0, 8) }));
  const b = ((h && h.hits) || []).map((x) => ({ title: String(x.title || "").slice(0, 160), domain: "news.ycombinator.com", date: String(x.created_at || "").slice(0, 10).replace(/-/g, "") }));
  const seen = new Set();
  return a.concat(b).filter((x) => x.title && !seen.has(x.title) && seen.add(x.title));
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
  await Promise.all(todo.map(async (m) => {
    try {
      const n = await news(m.title);
      if (n.length < 3) { rows.push({ m, agg: null, headlines: n.length, members: [] }); return; }
      const got = await Promise.all(models.map(async (model) => { try { const e = parseEstimate(await ask(m, n, model)); return e && { ...e, model }; } catch (err) { console.error("member failed", model, String(err)); return null; } }));
      rows.push({ m, agg: aggregate(got), headlines: n.length, members: got.filter(Boolean).map((x) => ({ model: x.model, p: x.p, c: x.confidence })) });
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
async function evidenceNow(db, ctl) {
  const rows = (await db.prepare("SELECT fair, market, confidence, outcome FROM pt_estimate WHERE outcome IN (0,1) AND fair IS NOT NULL").all()).results;
  const curve = (await db.prepare("SELECT ts, equity FROM pt_equity ORDER BY ts LIMIT 50000").all()).results;
  const ev = evaluate(rows, ctl.min_edge);
  const days = curve.length ? (Date.now() - Date.parse(curve[0].ts)) / 86400000 : 0;
  const ctx = { days, max_drawdown_pct: stats(curve, []).max_drawdown_pct, drawdown_pct: currentDrawdown(curve), min_edge: ctl.min_edge, last_equity: curve.length ? curve[curve.length - 1].equity : CFG.START };
  return { ev, ctx };
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
  const { ev, ctx } = await evidenceNow(db, ctl);
  const writes = [];
  for (const a of reviewActions(ev, ctx)) {
    if (a.kind === "pause" && !isPaused(ctl, nowMs)) {
      const until = new Date(nowMs + CFG.PAUSE_H * 3600000).toISOString();
      writes.push(setControl(db, "paused_until", until, now), setControl(db, "paused_reason", a.reason, now),
        logDecision(db, now, "pause new signal entries until " + until, a.reason, { n: ev.n, brier_gain: ev.brier_gain, drawdown_pct: ctx.drawdown_pct }, "DELETE FROM pt_control WHERE key IN ('paused_until','paused_reason')"));
      ctl = { ...ctl, paused_until: until, paused_reason: a.reason };
    } else if (a.kind === "min_edge" && a.value !== ctl.min_edge) {
      writes.push(setControl(db, "min_edge", a.value, now), logDecision(db, now, "minimum gap " + ctl.min_edge + " -> " + a.value, a.reason, { n: ev.n, shadow_n: ev.shadow_n, shadow_roi: ev.shadow_roi }, "DELETE FROM pt_control WHERE key='min_edge'"));
      ctl = { ...ctl, min_edge: a.value };
    }
  }
  if (writes.length) await db.batch(writes);
  const grad = graduation(ev, ctx);
  const enough = ev.shadow_n >= 30;
  const published = await publishMetrics(env, {
    pm_paper_return_pct: r4((ctx.last_equity / CFG.START - 1) * 100), pm_paper_drawdown_pct: r4(ctx.drawdown_pct), pm_resolved_estimates: ev.n,
    pm_brier_gain: ev.n >= 30 ? r4(ev.brier_gain) : 0, pm_shadow_roi: enough ? r4(ev.shadow_roi) : 0, pm_edge_over_control: enough ? r4(ev.edge_over_control) : 0,
    pm_graduation_ready: grad.ready ? 1 : 0, pm_breaker_active: isPaused(ctl, nowMs) ? 1 : 0,
  }, now);
  return { ev, ctx, grad, ctl, actions: writes.length, published };
}

export async function tick(env, feed, deps = {}) {
  await init(env);
  const db = env.TRADES_DB, nowMs = Date.now(), now = new Date(nowMs).toISOString();
  const fetched = feed || (await fetchMarkets());
  const source = fetched.source;
  const markets = fetched.markets.filter((m) => !m.sports);
  const ctl0 = await readControl(db);
  const bySlug = deps.bySlug || (feed ? async () => [] : fetchHeld);
  const settled = await settleEstimates(db, nowMs, bySlug).catch((e) => { console.error("settle failed", String(e)); return 0; });
  // held markets that left the active feed (closed, resolved, outside the top rows) are fetched by slug so they can still settle
  const heldSlugs = (await openPositions(db)).map((p) => p.slug).filter((sl) => !markets.find((m) => m.slug === sl));
  const refreshed = feed || source !== "polymarket" ? [] : await fetchHeld(heldSlugs);
  // evidence + ensemble estimates for the best short-term candidates, before the lease is taken (slow I/O). Estimating continues while entries are paused: the proof keeps accumulating.
  const heldNow = new Set((await openPositions(db)).map((p) => p.slug));
  const coolNow = new Set((await db.prepare("SELECT DISTINCT slug FROM pt_position WHERE closed_at IS NOT NULL AND closed_at > ?").bind(new Date(nowMs - 6 * 3600 * 1000).toISOString()).all()).results.map((r) => r.slug));
  let est = { rows: [], status: "off" };
  if (source === "polymarket") est = await estimate(env, db, candidates(markets, heldNow, coolNow, CFG, nowMs), nowMs, deps);
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
    for (const row of est.rows) {
      const m = markets.find((x) => x.slug === row.m.slug) || row.m;
      const d = row.agg ? decide(row.agg, m, ctl0.min_edge) : null;
      if (d && !paused && !coolNow.has(d.slug) && !closedSlugs.has(d.slug)) decisions.push(d);
      const conf = row.agg ? row.agg.confidence : row.headlines < 3 ? "no-evidence" : "no-ensemble";
      writes.push(db.prepare("INSERT OR REPLACE INTO pt_estimate (slug,title,fair,market,edge,confidence,why,ends_at,headlines,traded,updated_at,models,spread,outcome,resolved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)")
        .bind(m.slug, m.title, row.agg ? row.agg.p : null, m.yes, row.agg ? row.agg.p - m.yes : null, conf, row.agg ? row.agg.why : row.headlines < 3 ? "fewer than 3 pieces of recent evidence" : "fewer than " + CFG.MIN_MEMBERS + " model answers", m.ends_at ?? null, row.headlines, d ? 1 : 0, now, JSON.stringify(row.members), row.agg ? row.agg.spread : null));
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
  const { ev, ctx } = await evidenceNow(db, ctl);
  const decisions = (await db.prepare("SELECT * FROM pt_decision ORDER BY id DESC LIMIT 20").all()).results;
  const pending = (await db.prepare("SELECT COUNT(*) n FROM pt_estimate WHERE outcome IS NULL AND fair IS NOT NULL").first()).n;
  const buckets = (await db.prepare("SELECT CAST(fair*10 AS INTEGER) b, COUNT(*) n, AVG(fair) p, AVG(outcome) f FROM pt_estimate WHERE outcome IN (0,1) AND fair IS NOT NULL GROUP BY b ORDER BY b").all()).results;
  return { charter: CHARTER, mode: CHARTER.mode, control: { ...ctl, paused: isPaused(ctl, Date.now()) }, evaluation: ev, graduation: graduation(ev, ctx), context: ctx, estimates_pending: pending,
    calibration: { n: ev.n, brier_model: ev.brier_model, brier_market: ev.brier_market, buckets }, decisions };
}

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
const PAGE = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Q08 Markets (paper)</title>
<style>:root{color-scheme:light dark}body{font:15px system-ui;max-width:860px;margin:0 auto;padding:16px}h1{font-size:20px}table{width:100%;border-collapse:collapse}td,th{padding:6px;border-bottom:1px solid #8884;text-align:left;overflow-wrap:anywhere}button{padding:8px 10px}.n{text-align:right}button{font:inherit}.b{background:#fc03;padding:8px;border-radius:6px}</style>
<h1>Q08 Markets <small>paper trading</small></h1><div class=b>Simulated money only. No real orders.</div><p id=s>Loading...</p>
<button id=t>Run tick now</button><p id=x></p><h2>Does the information beat the market?</h2><p id=ev>Collecting evidence...</p><h2>Predictions</h2><p><small>Three models read the last 3 days of Hacker News and GDELT reporting on short-term non-sports markets and give their own probabilities without seeing the price. A paper trade opens only when they agree on a gap of 10 points or more.</small></p><table id=pr></table><p><label>Order size $ <input id=amt type=number value=100 min=1 step=1></label> <span id=msg role=status></span></p><h2>Open positions</h2><table id=o></table><h2>Closed</h2><table id=c></table><h2>Markets</h2><table id=m></table>
<script>const f=n=>(+n).toFixed(2);async function L(){const d=await (await fetch('/api/state')).json();
s.textContent='Equity $'+f(d.equity)+' ('+f(d.return_pct)+'%) | cash $'+f(d.cash)+' | closed '+d.trades_closed+' | win rate '+(d.win_rate==null?'n/a':f(d.win_rate*100)+'%');
x.textContent='Max drawdown '+f(d.stats.max_drawdown_pct)+'% | '+Object.entries(d.stats.by_strategy).map(([k,v])=>k+': '+v.trades+' trades, P&L $'+f(v.pnl)).join(' | ');
const cs=await (await fetch('/api/charter')).json();const e=cs.evaluation;const pc=v=>v==null?'n/a':(v>=0?'+':'')+(v*100).toFixed(1)+'%';ev.textContent=(cs.graduation.ready?'All graduation criteria met. ':'Paper only. ')+e.n+' resolved estimates, '+e.shadow_n+' qualifying trades. Brier: model '+(e.brier_model==null?'n/a':e.brier_model.toFixed(3))+' vs market '+(e.brier_market==null?'n/a':e.brier_market.toFixed(3))+'. Shadow ROI '+pc(e.shadow_roi)+' vs backing the favourite '+pc(e.control_roi)+'. '+(cs.control.paused?'Entries paused: '+cs.control.paused_reason+'. ':'')+(cs.graduation.ready?'':'Not yet: '+cs.graduation.reasons.join('; ')+'.');
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
      if (p === "/health") return json({ ok: true, worker: "q08-prediction-markets", version: VERSION, paper_trading: true, mode: CHARTER.mode, charter: CHARTER.id, features: ["paper-trading", "order-form", "signal-ensemble", "no-sports", "charter", "graduation-gate"] });
      if (p === "/api/state") return json(await state(env));
      if (p === "/api/markets") return json((await state(env)).markets);
      if (p === "/api/charter") return json(await charterStatus(env));
      if (p === "/api/tick" && req.method === "POST") { const r = await tick(env); return json(r, r.busy ? 409 : 200); }
      if (p === "/api/order" && req.method === "POST") { const r = await manualOrder(env, await req.json()); return json(r, r.error ? 400 : 200); }
      if (p === "/" || p === "/dashboard") return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
      return json({ error: "not found" }, 404);
    } catch (e) { return json({ error: String(e.message || e) }, 500); }
  },
  async scheduled(_e, env, ctx) { ctx.waitUntil(tick(env)); },
};
