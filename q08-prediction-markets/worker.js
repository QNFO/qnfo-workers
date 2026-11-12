// q08-prediction-markets: the paper-trading proving ground for q08's information edge (PM-CHARTER-1).
// Paper money only. No wallet, no exchange key, no order ever leaves this worker: the only executor in this file writes D1 rows.
var VERSION = "1.14.2-codeagent";

// ---------- charter (the machine-readable form; GET /api/charter serves it with the live evidence) ----------
export const CHARTER = {
  id: "PM-CHARTER-1",
  pillar: "personal",
  objective: "Find short-term, non-sports prediction-market questions where an independently researched probability beats the market price, and prove that on paper before any real money is considered.",
  thesis: "A model that only reads the price adds nothing. The edge has to come from information the crowd has not priced yet: fresh reporting and q08's own signal sources (Hacker News, GDELT and Wikipedia, the same sources as the research ledger behind q08 forecasts), read by several model families that never see the price. The literature says to expect no edge by default (a retrieval-augmented ensemble scored Brier 0.179 against 0.149 for the human crowd, Halawi et al. 2024), so every claim of an edge is measured here against the market price and against simply backing the market favourite.",
  mode: "paper",
  universe: { sports: "excluded", quant: "excluded: price brackets and post counts have no news signal", horizon_days: 14, min_volume24: 10000, price_band: [0.05, 0.95] },
  method: { evidence: ["gdelt", "hacker-news", "wikipedia-search", "wikipedia-current-events"], optional_evidence: "q08-forecasts: q08's own open forecasts on the same entity, one labelled line each, off unless Q08_EVIDENCE is on, never counted toward the three pieces of evidence", ensemble_min_members: 2, max_spread: 0.25, min_gap: 0.10, price_hidden_from_model: true, hold: "to resolution; early exit only on convergence to the estimate",
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
  KELLY: 0.25, ARB_MIN: 0.01, ARB_MAX_OPEN: 5, ARB_POS_PCT: 0.05, ARB_EVENTS: 40, ARB_EVERY_MIN: 15, PROBE_PCT: 20, PROBE_SUM_TOL: 0.15, PROBE_DATE_TOL: 0.2, PROBE_DAYS_BACK: 30, MAX_SPREAD_MKT: 0.05, TUNE_DAYS: 7, RECAL_MIN: 50, BLEND_MIN: 50, DOMAIN_MIN: 20, DOMAIN_OFF_DAYS: 14 };
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
    } else if (p.strategy === "momentum") reason = "retired"; // the price-following strategy was removed in 1.4.0 (a price chart is not information); its last open positions close at the mark
    else if (r <= -cfg.STOP) reason = "stop_loss"; // manual positions only
    else if (r >= cfg.TAKE) reason = "take_profit";
    if (reason) out.push({ id: p.id, exit: reason === "resolved" ? Math.round(cur) : reason === "closed" ? cur : cur * (1 - cfg.SLIP), reason });
  }
  return out;
}

// ---------- structural arbitrage (white paper R12, hypothesis H2; issue 9106) ----------
// In an event whose outcomes are mutually exclusive and complete (Polymarket negRisk, not the augmented kind that carries placeholder outcomes) exactly one outcome resolves YES, so buying every YES pays 1 and buying
// every NO pays n-1 whatever happens. If that costs less than it pays after the spread and slippage of every leg, the gap needs no forecast. It is tested apart from the forecasting program.
export function parseEvent(e) {
  const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const legs = (e.markets || []).map((m) => ({ slug: m.slug, ask: num(m.bestAsk), bid: num(m.bestBid), closed: !!m.closed || m.active === false }));
  return { slug: e.slug, title: String(e.title || e.slug || ""), exclusive: e.negRisk === true && !e.negRiskAugmented, closed: !!e.closed, legs };
}
// The guaranteed return of the best complete basket after every leg's spread and slippage, or null: an incomplete, closed, one-sided or non-exclusive set is never a signal.
export function eventGap(ev, cfg = CFG) {
  if (!ev || !ev.exclusive || ev.closed || ev.legs.length < 3) return null;
  if (ev.legs.some((l) => l.closed || l.ask == null || l.bid == null || !(l.ask > 0 && l.ask < 1) || !(l.bid > 0 && l.bid < 1) || l.bid > l.ask)) return null;
  const f = 1 + cfg.SLIP, n = ev.legs.length;
  const yes = ev.legs.reduce((a, l) => a + Math.min(0.99, l.ask * f), 0), no = ev.legs.reduce((a, l) => a + Math.min(0.99, (1 - l.bid) * f), 0);
  const best = [{ side: "yes", cost: yes, payoff: 1 }, { side: "no", cost: no, payoff: n - 1 }].map((c) => ({ ...c, n, gain: c.payoff - c.cost, ret: (c.payoff - c.cost) / c.cost })).filter((c) => c.ret >= cfg.ARB_MIN).sort((a, b) => b.ret - a.ret)[0];
  return best || null;
}
// The payoff of a basket once every leg has resolved: YES pays per winner, NO pays per loser; null while any leg is undecided.
export function basketPayoff(side, qty, yesPrices) {
  if (!yesPrices.length || yesPrices.some((p) => !(p >= 0.99 || p <= 0.01))) return null;
  const winners = yesPrices.filter((p) => p >= 0.99).length;
  return qty * (side === "yes" ? winners : yesPrices.length - winners);
}
async function fetchEvents() {
  const r = await fetch("https://gamma-api.polymarket.com/events?active=true&closed=false&limit=" + CFG.ARB_EVENTS + "&order=volume24hr&ascending=false", { headers: { "user-agent": WIKI_UA["user-agent"] } });
  if (!r.ok) throw new Error("events " + r.status);
  return r.json();
}
// One pass of the arbitrage ledger, separate from the paper account: settle baskets whose legs have all resolved, then scan (at most every ARB_EVERY_MIN minutes) and open new baskets. Never throws into the tick.
async function arbStep(db, nowMs, getEvents, bySlug) {
  const out = { scanned: 0, gaps: 0, opened: 0, settled: 0 }, iso = new Date(nowMs).toISOString();
  for (const b of (await db.prepare("SELECT * FROM pt_arb_basket WHERE status = 'open'").all()).results) {
    const legs = JSON.parse(b.legs), ms = await bySlug(legs);
    const px = legs.map((sl) => (ms.find((m) => m.slug === sl) || {}).yes);
    const pay = px.every((p) => p != null) ? basketPayoff(b.side, b.qty, px) : null;
    if (pay != null) { await db.prepare("UPDATE pt_arb_basket SET status='settled', payoff=?, pnl=?, closed_at=? WHERE id=? AND status='open'").bind(pay, pay - b.cost, iso, b.id).run(); out.settled++; }
  }
  if (!getEvents) return out;
  const last = (await db.prepare("SELECT value FROM pt_control WHERE key = 'arb_checked_at'").first())?.value;
  if (last && nowMs - Date.parse(last) < CFG.ARB_EVERY_MIN * 60000) return out;
  const events = (await getEvents()).map(parseEvent);
  out.scanned = events.length;
  const openN = (await db.prepare("SELECT COUNT(*) n FROM pt_arb_basket WHERE status = 'open'").first()).n;
  let open = openN;
  for (const ev of events) {
    const g = eventGap(ev); if (!g) continue;
    out.gaps++;
    const held = await db.prepare("SELECT 1 x FROM pt_arb_basket WHERE event_slug = ? AND status = 'open'").bind(ev.slug).first();
    const usd = CFG.START * CFG.ARB_POS_PCT, take = !held && open < CFG.ARB_MAX_OPEN, qty = usd / g.cost;
    const seen = await db.prepare("SELECT 1 x FROM pt_arb_gap WHERE event_slug = ? AND ts > ?").bind(ev.slug, new Date(nowMs - 6 * 3600000).toISOString()).first();
    const w = [];
    if (!seen) w.push(db.prepare("INSERT INTO pt_arb_gap (ts,event_slug,title,side,n,cost,payoff,gain,ret,opened) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(iso, ev.slug, ev.title, g.side, g.n, g.cost, g.payoff, g.gain, g.ret, take ? 1 : 0));
    if (take) { w.push(db.prepare("INSERT INTO pt_arb_basket (event_slug,title,side,legs,qty,cost,opened_at,status) VALUES (?,?,?,?,?,?,?,'open')").bind(ev.slug, ev.title, g.side, JSON.stringify(ev.legs.map((l) => l.slug)), qty, usd, iso)); open++; out.opened++; }
    if (w.length) try { await db.batch(w); } catch (e) { if (take) { open--; out.opened--; } if (!/UNIQUE/i.test(String(e.message || e))) throw e; }
  }
  await db.prepare("INSERT OR REPLACE INTO pt_control (key, value, updated_at) VALUES ('arb_checked_at', ?, ?)").bind(iso, iso).run();
  return out;
}
async function arbSummary(db) {
  const g = await db.prepare("SELECT COUNT(*) n, MAX(ret) best FROM pt_arb_gap").first();
  const b = await db.prepare("SELECT SUM(status='open') open_n, SUM(CASE WHEN status='open' THEN cost ELSE 0 END) open_cost, SUM(status='settled') settled_n, SUM(CASE WHEN status='settled' THEN cost ELSE 0 END) settled_cost, SUM(CASE WHEN status='settled' THEN pnl ELSE 0 END) pnl FROM pt_arb_basket").first();
  const last = (await db.prepare("SELECT value FROM pt_control WHERE key = 'arb_checked_at'").first())?.value ?? null;
  return { note: "separate from the forecasting evaluation: baskets that buy every outcome of a mutually exclusive event, kept in their own paper ledger", min_return: CFG.ARB_MIN, gaps_seen: g.n || 0, best_return: g.best ?? null, baskets_open: b.open_n || 0, open_cost: +(b.open_cost || 0).toFixed(2), baskets_settled: b.settled_n || 0, realised_pnl: +(b.pnl || 0).toFixed(2), realised_return: b.settled_cost ? +(b.pnl / b.settled_cost).toFixed(4) : null, last_scan_at: last };
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
export async function verifyChain(rows, start = "") {
  let prev = start;
  for (const r of rows) {
    if ((r.prev_hash || "") !== prev || (await chainHash(prev, r.core)) !== r.hash) return { ok: false, count: rows.length, head: prev, bad_id: r.id ?? null };
    prev = r.hash;
  }
  return { ok: true, count: rows.length, head: prev, bad_id: null };
}

// One model's answer. JSON or nothing: anything else is rejected rather than guessed at.
// ---------- consistency and look-ahead probes on the forecasting models (white paper R13, issue 9107) ----------
// A sample of markets (PROBE_PCT percent, chosen by a hash of the slug so a rerun picks the same ones) gets two extra checks on one member: the probability of the NO wording must sum with the YES answer to 1
// within PROBE_SUM_TOL, and the same evidence with "today" moved PROBE_DAYS_BACK days earlier must not move the answer by more than PROBE_DATE_TOL (a model that moves has used what it knew after that date).
const fnv = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
export const probeSampled = (slug, cfg = CFG) => fnv(slug) % 100 < cfg.PROBE_PCT;
export function probeVerdict(pYes, pNo, pFake, cfg = CFG) {
  const complement = pNo == null ? null : { p_no: pNo, sum: +(pYes + pNo).toFixed(3), ok: Math.abs(pYes + pNo - 1) <= cfg.PROBE_SUM_TOL };
  const fake = pFake == null ? null : { p: pFake, delta: +Math.abs(pFake - pYes).toFixed(3), ok: Math.abs(pFake - pYes) <= cfg.PROBE_DATE_TOL };
  return { complement, fake };
}
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
export function decide(agg, m, minEdge = CFG.MIN_EDGE, cfg = CFG, w = cfg.blendW == null ? 0.5 : cfg.blendW) {
  if (!agg || agg.confidence === "low" || agg.confidence === "inconsistent" || agg.spread > cfg.MAX_SPREAD) return null;
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
  const blendW = cfg.blendW == null ? 0.5 : cfg.blendW; // the weight the strategy trades on rides in cfg so this signature line stays the metric trigger's anchor
  const r = rows.filter((x) => x.fair != null && (x.outcome === 0 || x.outcome === 1));
  const bm = r.map((x) => (x.fair - x.outcome) ** 2), bk = r.map((x) => (x.market - x.outcome) ** 2), bb = r.map((x) => (blendW * x.fair + (1 - blendW) * x.market - x.outcome) ** 2);
  const gain = r.map((_, i) => bk[i] - bm[i]), blendGain = r.map((_, i) => bk[i] - bb[i]);
  const q = r.filter((x) => x.confidence !== "low" && x.confidence !== "inconsistent" && Math.abs(x.fair - x.market) >= minEdge);
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
// The same proof split by the ensemble's confidence level (issue 8840): does a "high" forecast earn more than a "medium" one? Reported once a level has 30 resolved forecasts.
export function byConfidence(rows, minN = 30) {
  const g = {};
  for (const x of rows) (g[x.confidence || "none"] ||= []).push(x);
  return Object.fromEntries(Object.entries(g).map(([c, rs]) => { const e = evaluate(rs); return [c, e.n >= minN ? { n: e.n, brier_gain: e.brier_gain, brier_gain_ci: e.brier_gain_ci, shadow_roi: e.shadow_roi } : { n: e.n, note: "fewer than " + minN + " resolved forecasts" }]; }));
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
  for (const [d, e0] of Object.entries(byDomain(r))) {
    // a lapsed pause is renewed only on forecasts made after it lapsed, so the domain has had a chance to recover (and a paused domain's old record cannot re-pause it for ever)
    const lapsed = off[d] && Date.parse(off[d]) <= nowMs;
    const e = lapsed ? byDomain(r.filter((x) => x.domain === d && Date.parse(x.ts) > Date.parse(off[d])))[d] || { n: 0 } : e0;
    if (e.n >= (lapsed ? Math.ceil(cfg.DOMAIN_MIN / 2) : cfg.DOMAIN_MIN) && e.brier_gain_ci && e.brier_gain_ci.hi < 0 && !(off[d] && Date.parse(off[d]) > nowMs))
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
  "CREATE TABLE IF NOT EXISTS pt_arb_gap (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, event_slug TEXT NOT NULL, title TEXT, side TEXT, n INTEGER, cost REAL, payoff REAL, gain REAL, ret REAL, opened INTEGER DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS pt_arb_basket (id INTEGER PRIMARY KEY AUTOINCREMENT, event_slug TEXT NOT NULL, title TEXT, side TEXT, legs TEXT, qty REAL, cost REAL, opened_at TEXT, status TEXT, payoff REAL, pnl REAL, closed_at TEXT)",
  "CREATE UNIQUE INDEX IF NOT EXISTS pt_arb_one_open ON pt_arb_basket(event_slug) WHERE status = 'open'",
  "CREATE TABLE IF NOT EXISTS pt_estimate_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, slug TEXT NOT NULL, core TEXT NOT NULL, fair_raw REAL, fair REAL, market REAL, confidence TEXT, domain TEXT, ends_at TEXT, params_version INTEGER, prev_hash TEXT NOT NULL, hash TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS pt_decision (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT NOT NULL, assumption TEXT, action TEXT NOT NULL, evidence TEXT, rollback TEXT)",
];
const COLUMNS = [["pt_position", "fair", "REAL"], ["pt_position", "edge", "REAL"], ["pt_position", "why", "TEXT"], ["pt_position", "ends_at", "TEXT"], ["pt_market", "ends_at", "TEXT"],
  ["pt_estimate", "outcome", "INTEGER"], ["pt_estimate", "resolved_at", "TEXT"], ["pt_estimate", "models", "TEXT"], ["pt_estimate", "spread", "REAL"], ["pt_estimate", "sources", "TEXT"], ["pt_estimate", "fair_raw", "REAL"], ["pt_estimate", "domain", "TEXT"], ["pt_estimate", "settle_checked_at", "TEXT"], ["pt_estimate", "probe", "TEXT"]];
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
    db.prepare("CREATE TRIGGER IF NOT EXISTS pt_arb_gap_no_update BEFORE UPDATE ON pt_arb_gap BEGIN SELECT RAISE(ABORT, 'pt_arb_gap is append-only'); END"),
    db.prepare("CREATE TRIGGER IF NOT EXISTS pt_arb_gap_no_delete BEFORE DELETE ON pt_arb_gap BEGIN SELECT RAISE(ABORT, 'pt_arb_gap is append-only'); END"),
    db.prepare("CREATE TRIGGER IF NOT EXISTS pt_estimate_log_no_update BEFORE UPDATE ON pt_estimate_log BEGIN SELECT RAISE(ABORT, 'pt_estimate_log is append-only'); END"),
    db.prepare("CREATE TRIGGER IF NOT EXISTS pt_estimate_log_no_delete BEFORE DELETE ON pt_estimate_log BEGIN SELECT RAISE(ABORT, 'pt_estimate_log is append-only'); END"),
  ]);
  await db.prepare("INSERT OR IGNORE INTO pt_account (id,cash,start_cash,created_at) VALUES (1,?,?,?)").bind(CFG.START, CFG.START, new Date().toISOString()).run();
}
async function fetchMarkets() {
  const lo = new Date().toISOString(), hi = new Date(Date.now() + CFG.HORIZON_D * 86400000).toISOString();
  const base = "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=200&order=volume24hr&ascending=false";
  // MARKETS-FEED-RETRY-1: gamma answers 5xx now and then; retry the dated query once, then the plain one (the horizon is re-applied below), before the synthetic feed.
  const urls = [base + "&end_date_min=" + encodeURIComponent(lo) + "&end_date_max=" + encodeURIComponent(hi), base + "&end_date_min=" + encodeURIComponent(lo), base];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { accept: "application/json" }, cf: { cacheTtl: 60 } });
      if (!r.ok) throw new Error("gamma " + r.status);
      const hiT = Date.parse(hi), ms = (await r.json()).map(parseMarket).filter(Boolean).filter((m) => !m.ends_at || Date.parse(m.ends_at) <= hiT);
      if (ms.length) return { markets: ms, source: "polymarket" };
    } catch (e) { console.warn("market feed attempt failed", String(e)); }
  }
  console.error("market feed failed, using the synthetic feed", "all gamma queries failed");
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
// q08's own published, still-open forecasts about the same entity (issue 8961, link 2), offered to the ensemble as one more evidence line. Off unless Q08_EVIDENCE is "on" and the Q08 service binding exists;
// a forecast is another forecaster's estimate rather than news, so it is labelled as such in the prompt, recorded under sources as q08, and never counts toward the three pieces of evidence a question needs.
export function q08Lines(items, nowMs = Date.now()) {
  const today = new Date(nowMs).toISOString().slice(0, 10).replace(/-/g, "");
  return (Array.isArray(items) ? items : []).filter((i) => i && i.claim && Number.isFinite(Number(i.probability))).slice(0, 3).map((i) => ({
    title: ("q08 forecast: " + String(i.claim).slice(0, 160) + " (" + Math.round(Number(i.probability) * 100) + "% by " + String(i.horizon || "?").slice(0, 10) + (i.resolution ? "; counts as true if: " + String(i.resolution).slice(0, 90) : "") + ")").slice(0, 330),
    domain: "q08.org", date: /^\d{4}-\d{2}-\d{2}/.test(String(i.created_at || "")) ? String(i.created_at).slice(0, 10).replace(/-/g, "") : today, src: "q08" })); // the forecast's own publication day, so an old opinion never reads as fresh
}
export async function q08Evidence(env, title, nowMs = Date.now()) {
  if (!env || env.Q08_EVIDENCE !== "on" || !env.Q08 || typeof env.Q08.fetch !== "function") return [];
  try {
    const r = await env.Q08.fetch("https://q08.internal/api/evidence?q=" + encodeURIComponent(String(title || "").slice(0, 200)));
    if (!r.ok) return [];
    return q08Lines((await r.json()).items, nowMs);
  } catch (e) { console.error("q08 evidence failed", String(e)); return []; }
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
  return askModelWith(env, m, news, model, {}); // this signature line is the anchor of the pm_breaker_active metric trigger; the probes call askModelWith
}
async function askModelWith(env, m, news, model, opts = {}) {
  const today = new Date(Date.now() - (opts.daysBack || 0) * 86400000).toISOString().slice(0, 10);
  const askNo = opts.ask === "no";
  const prompt = "Question: " + m.title + "\nIt resolves by " + String(m.ends_at).slice(0, 10) + ". Today is " + today + ".\nEvidence from the last three days (newest first):\n" + news.map((n) => "- " + n.title + " (" + n.domain + ", " + n.date + ")" + (n.src === "q08" ? " [another forecaster's estimate, not news: weigh it as one opinion]" : "")).join("\n")
    + "\n\nFirst think of the base rate for questions like this, then adjust for the evidence. Give the probability that this resolves " + (askNo ? "NO" : "YES") + ". If the evidence does not bear on the question, say confidence low. Answer with JSON only: {\"p\": 0-1, \"confidence\": \"low|medium|high\", \"why\": \"one or two sentences naming the evidence\"}";
  const r = await env.QNFO_AI.fetch("https://qnfo-ai.internal/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: "You are a careful, calibrated forecaster. You never invent facts beyond the evidence given." }, { role: "user", content: prompt }], max_tokens: 400, temperature: 0.2, stream: false }) });
  if (!r.ok) throw new Error("router " + r.status + " for " + model);
  return (await r.json()).choices?.[0]?.message?.content || "";
}
// Estimate up to MAX_EST candidate markets with no estimate younger than EST_TTL_H hours. Outside the account lease: this is slow I/O.
async function estimate(env, db, cands, now, deps) {
  const fresh = new Set((await db.prepare("SELECT slug FROM pt_estimate WHERE updated_at > ?").bind(new Date(now - CFG.EST_TTL_H * 3600000).toISOString()).all()).results.map((r) => r.slug));
  const todo = cands.filter((m) => !fresh.has(m.slug)).slice(0, CFG.MAX_EST);
  const news = deps.news || fetchNews, q08 = deps.q08 || ((t) => q08Evidence(env, t)), ask = deps.ask || ((m, n, model, opts) => askModelWith(env, m, n, model, opts));
  const models = deps.models || String(env.ENSEMBLE_MODELS || "").split(",").map((x) => x.trim()).filter(Boolean).concat(env.ENSEMBLE_MODELS ? [] : ENSEMBLE);
  const status = deps.ask || env.QNFO_AI ? "ok" : "no-ai";
  const rows = [];
  if (status === "no-ai") return { rows, status };
  const evidence = new Map();
  for (const m of todo) { try { evidence.set(m.slug, (await news(m.title)).concat(await q08(m.title).catch(() => []))); } catch (e) { console.error("evidence failed", m.slug, String(e)); evidence.set(m.slug, []); } } // one at a time: GDELT allows a request every 5 seconds
  await Promise.all(todo.map(async (m) => {
    try {
      const n = evidence.get(m.slug) || [];
      const sources = n.reduce((o, x) => ((o[x.src || "other"] = (o[x.src || "other"] || 0) + 1), o), {});
      const real = n.filter((x) => x.src !== "q08").length; // another forecaster's estimate is not evidence that something happened
      if (real < 3) { rows.push({ m, agg: null, headlines: real, members: [], sources }); return; }
      const got = await Promise.all(models.map(async (model) => { try { const e = parseEstimate(await ask(m, n, model)); return e && { ...e, model }; } catch (err) { console.error("member failed", model, String(err)); return null; } }));
      let members = got.filter(Boolean), probe = null;
      if (members.length && probeSampled(m.slug)) {
        const first = members[0];
        try {
          const [no, fake] = await Promise.all([ask(m, n, first.model, { ask: "no" }), ask(m, n, first.model, { daysBack: CFG.PROBE_DAYS_BACK })]);
          probe = { model: first.model, ...probeVerdict(first.p, parseEstimate(no)?.p ?? null, parseEstimate(fake)?.p ?? null) };
          if (probe.fake && !probe.fake.ok) members = members.filter((x) => x.model !== first.model); // look-ahead: this model is out of the ensemble for this market
        } catch (err) { console.error("probe failed", m.slug, String(err)); }
      }
      const agg = aggregate(members);
      if (agg && probe?.complement && !probe.complement.ok) agg.confidence = "inconsistent"; // the two wordings disagree: recorded, never traded
      rows.push({ m, agg, probe, headlines: real, sources, evidence: [...n.filter((x) => x.src !== "q08").slice(0, 9), ...n.filter((x) => x.src === "q08")].map((x) => ({ t: String(x.title).slice(0, 100), s: x.src || "other", d: x.date })), members: members.map((x) => ({ model: x.model, p: x.p, c: x.confidence })) });
    } catch (e) { console.error("estimate failed", m.slug, String(e)); }
  }));
  return { rows, status };
}

// Settle estimates whose market has resolved: the outcome is what the proof compares the model and the price against.
async function settleEstimates(db, nowMs, bySlug) {
  // least recently checked first, so twenty unresolved rows cannot hold every batch while later markets have resolved
  const due = (await db.prepare("SELECT slug, ends_at FROM pt_estimate WHERE outcome IS NULL AND ends_at IS NOT NULL AND ends_at < ? ORDER BY COALESCE(settle_checked_at, '') ASC, ends_at LIMIT 20").bind(new Date(nowMs).toISOString()).all()).results;
  if (!due.length) return 0;
  const ms = await bySlug(due.map((d) => d.slug));
  const done = new Set(), writes = [], iso = new Date(nowMs).toISOString();
  for (const m of ms) if (m.yes >= 0.99 || m.yes <= 0.01) { done.add(m.slug); writes.push(db.prepare("UPDATE pt_estimate SET outcome=?, resolved_at=? WHERE slug=? AND outcome IS NULL").bind(m.yes >= 0.99 ? 1 : 0, iso, m.slug)); }
  // a market 30 days past its end date that never reached a decisive price is void (-1) and excluded from scoring
  for (const d of due) if (!done.has(d.slug) && nowMs - Date.parse(d.ends_at) > 30 * 86400000) writes.push(db.prepare("UPDATE pt_estimate SET outcome=-1, resolved_at=? WHERE slug=? AND outcome IS NULL").bind(iso, d.slug));
  for (const d of due) if (!done.has(d.slug)) writes.push(db.prepare("UPDATE pt_estimate SET settle_checked_at=? WHERE slug=? AND outcome IS NULL").bind(iso, d.slug));
  if (writes.length) await db.batch(writes);
  return done.size;
}

// ---------- the review loop: score, self-tune within bounds, pause when wrong, publish ----------
// The scored sample: the FIRST forecast made on each market (never a later one made closer to the answer), joined with the outcome, with its lead time and the parameter version it was made under.
async function evidenceNow(db, ctl) {
  const rows = (await db.prepare("SELECT l.fair_raw raw, l.fair, l.market, l.confidence, l.domain, l.params_version v, l.ts, l.ends_at, e.outcome FROM pt_estimate_log l JOIN pt_estimate e ON e.slug = l.slug WHERE l.id = (SELECT MIN(x.id) FROM pt_estimate_log x WHERE x.slug = l.slug AND x.fair IS NOT NULL) AND e.outcome IN (0,1)").all()).results;
  const curve = (await db.prepare("SELECT ts, equity FROM pt_equity ORDER BY ts LIMIT 50000").all()).results;
  const ev = evaluate(rows, ctl.min_edge, { ...CFG, blendW: ctl.blend_w });
  const evFrozen = evaluate(rows.filter((x) => x.v === ctl.params_version), ctl.min_edge, { ...CFG, blendW: ctl.blend_w });
  const days = curve.length ? (Date.now() - Date.parse(curve[0].ts)) / 86400000 : 0;
  const frozenDays = ctl.version_started_at ? (Date.now() - Date.parse(ctl.version_started_at)) / 86400000 : 0;
  const ctx = { days, frozen_days: frozenDays, max_drawdown_pct: stats(curve, []).max_drawdown_pct, drawdown_pct: currentDrawdown(curve), min_edge: ctl.min_edge, last_equity: curve.length ? curve[curve.length - 1].equity : CFG.START };
  return { ev, evFrozen, rows, ctx };
}
// Verify the whole forecast chain at most once an hour; the result is kept in pt_control.
async function chainStatus(db, ctl, nowMs, force) {
  if (!force && ctl.chain_checked_at && nowMs - Date.parse(ctl.chain_checked_at) < 3600000 && ctl.chain_ok != null) return { ok: ctl.chain_ok, cached: true };
  // the whole chain, in bounded pages, carrying the last hash across pages
  let v = { ok: true, count: 0, head: "", bad_id: null }, after = 0;
  for (let page = 0; page < 200; page++) {
    const rows = (await db.prepare("SELECT id, core, prev_hash, hash FROM pt_estimate_log WHERE id > ? ORDER BY id LIMIT 5000").bind(after).all()).results;
    if (!rows.length) break;
    const p = await verifyChain(rows, v.head);
    v = { ok: p.ok, count: v.count + p.count, head: p.head, bad_id: p.bad_id };
    if (!p.ok) break;
    after = rows[rows.length - 1].id;
  }
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
  const evG = bump ? evaluate([], ctl.min_edge, { ...CFG, blendW: ctl.blend_w }) : evFrozen; // a fresh version has an empty sample
  const grad = graduation(evG, { ...ctx, days: bump ? 0 : ctx.frozen_days });
  const chain = await chainStatus(db, ctl, nowMs, false).catch((e) => { console.error("chain check failed", String(e)); return { ok: null }; });
  const enough = evG.shadow_n >= 30;
  const probes = await probeStats(db).catch(() => ({ inconsistent_share: 0, lookahead_share: 0 }));
  const arb = await arbSummary(db).catch(() => ({ gaps_seen: 0, realised_return: 0 }));
  const published = await publishMetrics(env, {
    pm_paper_return_pct: r4((ctx.last_equity / CFG.START - 1) * 100), pm_paper_drawdown_pct: r4(ctx.drawdown_pct), pm_resolved_estimates: ev.n,
    pm_brier_gain: ev.n >= 30 ? r4(ev.brier_gain) : 0, pm_shadow_roi: enough ? r4(evG.shadow_roi) : 0, pm_edge_over_control: enough ? r4(evG.edge_over_control) : 0,
    pm_graduation_ready: grad.ready ? 1 : 0, pm_breaker_active: isPaused(ctl, nowMs) ? 1 : 0, pm_chain_ok: chain.ok === false ? 0 : 1,
    pm_inconsistent_share: probes.inconsistent_share, pm_lookahead_share: probes.lookahead_share,
    pm_arb_gaps_seen: arb.gaps_seen, pm_arb_return: arb.realised_return ?? 0,
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
  // the arbitrage ledger is separate from the paper account and from the breaker; it scans only on the live feed or when a test supplies events, and never breaks the tick
  const arb = await arbStep(db, nowMs, deps.events || (feed ? null : fetchEvents), async (slugs) => (deps.bySlug ? deps.bySlug(slugs) : feed ? [] : fetchHeld(slugs))).catch((e) => { console.error("arbitrage step failed", String(e)); return { error: true }; });
  // held markets that left the active feed (closed, resolved, outside the top rows) are fetched by slug so they can still settle
  // VALUE-PIPELINE-1: open forecast-engine questions are refreshed the same way, so a market that closed settles its forecast and its simulated position
  const feOpen = (await db.prepare("SELECT DISTINCT slug FROM fe_forecast WHERE outcome IS NULL LIMIT 40").all().catch(() => ({ results: [] }))).results || [];
  const heldSlugs = [...new Set((await openPositions(db)).map((p) => p.slug).concat(feOpen.map((r) => r.slug)))].filter((sl) => !markets.find((m) => m.slug === sl));
  const refreshed = feed || source !== "polymarket" ? [] : await fetchHeld(heldSlugs);
  // evidence + ensemble estimates for the best short-term candidates, before the lease is taken (slow I/O). Estimating continues while entries are paused: the proof keeps accumulating.
  const heldNow = new Set((await openPositions(db)).map((p) => p.slug));
  const coolNow = new Set((await db.prepare("SELECT DISTINCT slug FROM pt_position WHERE closed_at IS NOT NULL AND closed_at > ?").bind(new Date(nowMs - 6 * 3600 * 1000).toISOString()).all()).results.map((r) => r.slug));
  let est = { rows: [], status: "off" };
  // CONSOLIDATE-1: the price-hidden estimator lost to the crowd on 30 resolved questions (Brier 0.218 vs 0.039) and is the pilot's only model spend; wrangler sets PM_ESTIMATE = "off". Settlement, the market feed and the frozen record keep running.
  if (source === "polymarket" && String(env.PM_ESTIMATE || "on").trim().toLowerCase() !== "off") est = await estimate(env, db, candidates(markets, heldNow, coolNow, CFG, nowMs, offDomains(ctl0, nowMs)), nowMs, deps);
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
      if (row.probe) writes.push(db.prepare("UPDATE pt_estimate SET probe=? WHERE slug=?").bind(JSON.stringify(row.probe), m.slug));
      // the append-only forecast log: one hash-chained row per estimate, with the evidence it was made from
      const core = JSON.stringify({ ts: now, slug: m.slug, title: m.title, fair_raw: cal ? cal.raw : null, fair: cal ? cal.p : null, market: m.yes, spread: m.spread ?? null, confidence: conf, why, ends_at: m.ends_at ?? null, domain, params_version: ctl0.params_version, recal: [ctl0.recal_a, ctl0.recal_b], blend_w: ctl0.blend_w, models: row.members, sources: row.sources || {}, evidence: row.evidence || [], probe: row.probe || null });
      const hash = await chainHash(prevHash, core);
      writes.push(db.prepare("INSERT INTO pt_estimate_log (ts,slug,core,fair_raw,fair,market,confidence,domain,ends_at,params_version,prev_hash,hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(now, m.slug, core, cal ? cal.raw : null, cal ? cal.p : null, m.yes, conf, domain, m.ends_at ?? null, ctl0.params_version, prevHash, hash));
      prevHash = hash;
    }
    const opened = signalEntries(decisions, pos, { cash: cash0 }, pxNow, CFG);
    // a decision the exposure or position cap rejected is not a trade: clear the flag the estimate row was written with
    const takenSlugs = new Set(opened.map((o) => o.slug));
    for (const d of decisions) if (!takenSlugs.has(d.slug)) writes.push(db.prepare("UPDATE pt_estimate SET traded=0 WHERE slug=?").bind(d.slug));
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
    result = { source, markets: markets.length, settled, estimated: est.rows.length, ai: est.status, paused, opened: opened.length, closed: closed.length, equity: eq, cash, arb };
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
// How often the probes fail, over every probed estimate (issue 9107): the shares are published as pm_inconsistent_share and pm_lookahead_share.
async function probeStats(db) {
  const r = await db.prepare("SELECT COUNT(*) n, SUM(json_extract(probe, '$.complement.ok') = 0) bad_c, SUM(json_extract(probe, '$.complement') IS NOT NULL) n_c, SUM(json_extract(probe, '$.fake.ok') = 0) bad_f, SUM(json_extract(probe, '$.fake') IS NOT NULL) n_f FROM pt_estimate WHERE probe IS NOT NULL").first();
  const share = (bad, n) => (n ? +(bad / n).toFixed(4) : 0);
  return { n: r.n || 0, sample_pct: CFG.PROBE_PCT, tolerance: { sum: CFG.PROBE_SUM_TOL, date: CFG.PROBE_DATE_TOL, days_back: CFG.PROBE_DAYS_BACK }, inconsistent: r.bad_c || 0, inconsistent_share: share(r.bad_c || 0, r.n_c || 0), lookahead: r.bad_f || 0, lookahead_share: share(r.bad_f || 0, r.n_f || 0) };
}
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
    evaluation: { ...ev, by_confidence: byConfidence(rows) }, evaluation_frozen: evFrozen, graduation: graduation(evFrozen, { ...ctx, days: ctx.frozen_days }), context: ctx, estimates_pending: pending,
    by_domain: byDomain(rows), probes: await probeStats(db), arbitrage: await arbSummary(db), log_loss: logLoss(rows), lead_hours: { n: lead.length, median: lead.length ? lead[Math.floor(lead.length / 2)] : null },
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
const WHITEPAPER_HTML = "<!doctype html><html lang=en><head><meta charset=utf-8><!--DS-HEAD--><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>Where Do LLM Forecasters Have an Edge Over Prediction Markets?</title><meta name=description content=\"Evidence on where language-model forecasters may beat prediction markets, a pre-registered test, and the Q08 proving ground.\"><style>:root{color-scheme:light dark;--bg:#fff;--fg:#1a1a1a;--mut:#555;--line:#8884;--acc:#0b57d0}@media(prefers-color-scheme:dark){:root{--bg:#14161a;--fg:#e8e8e8;--mut:#aaa;--acc:#8ab4f8}}body{background:var(--bg);color:var(--fg);font:17px/1.6 Georgia,'Times New Roman',serif;max-width:46rem;margin:0 auto;padding:16px}nav{font:14px system-ui;color:var(--mut);display:flex;gap:14px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:10px}a{color:var(--acc)}h1{font-size:1.7rem;line-height:1.25}h2{font-size:1.3rem;margin-top:2rem}h3{font-size:1.1rem}.t{overflow-x:auto}table{border-collapse:collapse;font:14px/1.45 system-ui;margin:1rem 0}td,th{border:1px solid var(--line);padding:6px 8px;vertical-align:top;text-align:left}th{background:#8881}code{font:0.9em ui-monospace,monospace;background:#8882;padding:0 3px;border-radius:3px}footer{font:14px system-ui;color:var(--mut);border-top:1px solid var(--line);margin-top:2rem;padding-top:10px}</style><!--/DS-HEAD--></head><body><nav><a href=\"/\">Dashboard</a><a href=\"/api/charter\">Live evidence</a><a href=\"/api/track-record\">Track record</a><a href=\"https://github.com/QNFO/qnfo-workers/tree/main/papers/pm-information-edge-2026-11-09\">Source</a></nav>\n<h1 id=\"where-do-llm-forecasters-have-an-edge-over-prediction-markets\">Where Do LLM Forecasters Have an Edge Over Prediction Markets?</h1>\n<p><strong>Evidence, a pre-registered test, and the Q08 proving ground</strong> · QNFO · 9 November 2026 · version 1.0 · charter PM-CHARTER-1</p>\n<h2 id=\"summary\">Summary</h2>\n<ol><li><strong>There is no demonstrated general edge.</strong> In the sources reviewed for this paper, language-model forecasters at best match the aggregate of a human forecasting crowd, and they trail the best human forecasters. None of the studies compares them with liquid market prices after trading costs, and I found no peer-reviewed evidence of a profit from doing so.</li><li><strong>An edge is plausible only in specific places.</strong> The evidence points to six hypotheses (section 3): combining a model with the crowd, structural mispricing between related contracts, systematic crowd biases such as the favourite-longshot bias, breadth across many low-attention markets, speed on thin or newly listed markets, and domains where the model's sources lead the crowd.</li><li><strong>Most published comparisons cannot tell us whether an edge is real.</strong> Leakage of future information, human forecasts in training data, metric choices and small samples all inflate or obscure results (section 4).</li><li><strong>So the Q08 program is built to prove or refute an edge on paper, not to assume one.</strong> Fourteen recommendations follow from the evidence (section 6). Thirteen are implemented in the open-source worker <code>q08-prediction-markets</code> (version 1.14), and one is recorded on the live-trading decision item. Real money stays out of reach of the code until a pre-registered gate passes (section 7).</li></ol>\n<p><em>What this paper does not claim:</em> that Q08 has an edge. It claims that the question is testable, describes the test, and publishes the result as it accrues at <code>/api/charter</code> and <code>/api/track-record</code>.</p>\n<h2 id=\"1-why-the-question-matters\">1. Why the question matters</h2>\n<p>A prediction market price is itself an aggregate forecast. A model that only restates the price adds nothing, and a model that is worse than the price loses money to the people who trade against it. A forecaster profits only where its probability is better than the price by more than the cost of trading. That makes the right yardstick the market price, not a coin flip and not a forecasting-tournament crowd.</p>\n<h2 id=\"2-what-the-literature-shows\">2. What the literature shows</h2>\n<div class=\"t\" tabindex=\"0\" role=\"region\" aria-label=\"Table (scrolls sideways)\"><table><thead><tr><th>Study</th><th>Comparison</th><th>Reported result</th><th>What it does not show</th></tr></thead><tbody><tr><td>Halawi et al. 2024, <em>Approaching Human-Level Forecasting with Language Models</em> [1]</td><td>Retrieval-augmented model system against the community forecast, on questions opened after the models' knowledge cutoffs</td><td>Brier score 0.179 for the system against 0.149 for the crowd. Where the crowd was uncertain (between 0.3 and 0.7) the system scored 0.238 against 0.240. Blending the system with the crowd improved on the crowd alone</td><td>The baseline is a forecasting platform's crowd, not market prices. The system did not beat the crowd overall</td></tr><tr><td>Schoenegger et al. 2024, <em>Wisdom of the Silicon Crowd</em>, Science Advances [2]</td><td>An ensemble of 12 language models against 925 human forecasters on 31 binary questions</td><td>The model ensemble was not statistically different from the human crowd. In a second study, showing models the median human forecast improved their accuracy by roughly 17 to 28 percent, and averaging human and machine forecasts was more accurate. Models showed an acquiescence bias, with mean predictions significantly above 50 percent</td><td>Thirty-one questions is a small sample, and the comparison is again with a tournament crowd</td></tr><tr><td>Karger et al. 2025, <em>ForecastBench</em>, ICLR [3]</td><td>A dynamic benchmark of about 1,000 questions whose answers are not yet known</td><td>In the launch evaluation on a 200-question subset: superforecasters 0.093, the general public 0.107, the best model (Claude 3.5 Sonnet) 0.111</td><td>A 2024 snapshot; current standings change as questions resolve</td></tr><tr><td>Metaculus AI benchmark, quarterly reports 2024 and 2025 [4]</td><td>Bots against teams of professional forecasters</td><td>Pros beat the best bots in every quarterly benchmark found. In the first 2024 round, pros beat all 34 bots. In Q2 2025 (348 questions; 96 forecast by pros) the lead was significant (p = 0.00001). A Gemini-based bot placed 37th of 551 in a 2025 open cup</td><td>These are Metaculus's own analyses and a secondary 2026 synthesis; the gap has narrowed but not closed</td></tr><tr><td>Saguillo et al. 2025, <em>Unravelling the Probabilistic Forest</em> [5]</td><td>Price consistency inside and across Polymarket contracts, April 2024 to April 2025</td><td>Across 8,659 single-condition and 1,578 multiple-condition markets the authors estimate about 40 million US dollars of realised arbitrage profit</td><td>Abstract-level reading only; it is structural arbitrage, not forecasting skill</td></tr><tr><td>Snowberg and Wolfers 2010, <em>Explaining the Favorite-Longshot Bias</em>, JPE [6]</td><td>Betting-market prices against outcomes</td><td>Misperception of probabilities explains the favourite-longshot bias better than risk-love</td><td>Racetrack data, not prediction markets</td></tr><tr><td>Bürgi, Deng and Whelan 2025, <em>Makers and Takers</em>, on Kalshi [7]</td><td>Kalshi contract prices against outcomes</td><td>Prices are informative and improve near expiry, with a favourite-longshot bias: contracts priced below 10 cents lose over 60 percent of the money staked; takers lose more than makers</td><td>Reported through a CEPR summary and several working-paper versions; the exact figures should be checked against the primary PDF</td></tr><tr><td>Baron et al. 2014, <em>Two Reasons to Make Aggregated Probability Forecasts More Extreme</em> [8]</td><td>Aggregated crowd probabilities against outcomes</td><td>Averaging pulls probabilities toward 0.5; transforming them toward 0 or 1 makes them correspond better to outcomes. The effect is smaller for the median or the mean of log-odds</td><td>Human tournaments, not model ensembles</td></tr><tr><td>Paleka et al. 2025, <em>Pitfalls in Evaluating Language Model Forecasters</em> [9]</td><td>Evaluation methods</td><td>Leakage of post-forecast information, unreliable date-restricted retrieval, human forecasts inside training data, and metrics that over-weight high-base-rate questions</td><td>A methodological critique, not a result about markets</td></tr></tbody></table></div>\n<p><strong>Reading across the table.</strong> The strongest, best-replicated result is that aggregation helps: ensembles of models approach a human crowd, and a blend of models and humans beats either. The weakest link is the absence of any test against market prices with realistic costs.</p>\n<h2 id=\"3-where-an-edge-is-plausible-six-hypotheses\">3. Where an edge is plausible: six hypotheses</h2>\n<p>Each hypothesis states a mechanism and what would refute it. None is established.</p>\n<p><strong>H1. Combining model and crowd.</strong> The best-supported claim: a blend of an independent model forecast and the market price beats the price alone [1][2]. <em>Refuted if</em> the blend's Brier score is not lower than the price's with a 95 percent interval clear of zero on a pre-registered sample.</p>\n<p><strong>H2. Structural mispricing.</strong> Related contracts that must sum to one often do not, and one study estimates about 40 million US dollars of realised arbitrage on Polymarket in a year [5]. This needs no forecasting skill, only consistent bookkeeping across contracts. <em>Refuted if</em> the gaps do not survive spreads and fees at the sizes we can trade. It is the only hypothesis in this list that does not depend on a model being better than the crowd.</p>\n<p><strong>H3. Systematic crowd bias.</strong> Low-priced contracts win less often than their prices imply [6][7] (the Kalshi figure is from a secondary summary). A model calibrated on outcomes can learn this correction. <em>Refuted if</em> the learned correction is indistinguishable from the identity on our own resolved sample.</p>\n<p><strong>H4. Breadth.</strong> A crowd attends to the headline markets. A program that reads evidence for every short-dated market in a category can cover the long tail. <em>Refuted if</em> edge appears only in markets with large volume, where the crowd is already attentive.</p>\n<p><strong>H5. Speed on thin markets.</strong> In newly listed or thinly traded markets, prices may lag fresh reporting. <em>Refuted if</em> the gap between our estimate and the price closes only after the evidence is already old.</p>\n<p><strong>H6. Domains where our sources lead.</strong> Q08's own signal sources are Hacker News, GDELT and Wikipedia (its search and its daily current-events portal), the same ones its research ledger reads. For technology, AI and software-release questions, reporting there may lead the crowd; for geopolitics and elections it plausibly does not. <em>Refuted if</em> the per-domain evaluation shows no positive interval in any domain after 30 resolved estimates per domain.</p>\n<p><strong>Where we expect no edge.</strong> Liquid headline markets, where public information is priced within minutes; sports, where the crowd and bookmakers already specialise (excluded from the Q08 universe); markets resolved by a price bracket or a count on a given day (price ranges, tweet counts), where news carries little beyond the live number and a structured price model is the right tool (excluded from the Q08 universe); and markets resolved by a subjective judgment of wording rather than by a checkable fact.</p>\n<h2 id=\"4-how-forecasting-evaluations-go-wrong\">4. How forecasting evaluations go wrong</h2>\n<p>The pitfalls below shape the design, because each one can create an apparent edge from nothing [9][10].</p>\n<ol><li><strong>Leakage.</strong> A model trained after the event, or a search engine that returns pages updated after the question date, can see the answer. Date-restricted retrieval has been found unreliable, and asking a model to feign ignorance of events before its cutoff does not stand in for a real cutoff [9][10]. <em>Control:</em> forward-only evaluation on questions whose answers do not yet exist, evidence limited to the previous three days, and the evidence stored with each forecast.</li><li><strong>Human forecasts in training data.</strong> A model that has seen the crowd's number is not independent [9]. <em>Control:</em> the market price is never shown to the model.</li><li><strong>Metric choice.</strong> Brier scores over-weight questions with a high base rate, and calibration alone can reward useless forecasts [9]. <em>Control:</em> report Brier score, log loss and the gain over the market price, on the same markets, with intervals.</li><li><strong>Forecast timing.</strong> Scoring a forecast made hours before resolution rewards the easy cases. <em>Control:</em> the first forecast on each market is the one scored, with its lead time recorded.</li><li><strong>Tuning on the test set.</strong> Adjusting thresholds while watching the score inflates the final result. <em>Control:</em> parameter changes start a new evaluation sample, and graduation counts only forecasts made under the current, frozen parameters.</li><li><strong>Selective memory.</strong> Overwritten forecasts hide misses. <em>Control:</em> an append-only log in which each row carries a hash of the row before it.</li></ol>\n<h2 id=\"5-costs-and-market-structure\">5. Costs and market structure</h2>\n<p>A forecast is not a profit. Takers pay the spread and sometimes a fee, and the Kalshi study reports that takers lose more than makers [7] (a figure reported through a secondary summary). Our shadow return therefore charges slippage on every simulated bet, markets with wide spreads are skipped, and position sizes are a fraction of a Kelly stake so that estimation error cannot dominate. Live trading, if it ever happens, should use resting limit orders where the terms allow, which is a design for a later phase.</p>\n<h2 id=\"6-recommendations-and-what-was-done\">6. Recommendations and what was done</h2>\n<div class=\"t\" tabindex=\"0\" role=\"region\" aria-label=\"Table (scrolls sideways)\"><table><thead><tr><th>#</th><th>Recommendation</th><th>Basis</th><th>Status in <code>q08-prediction-markets</code> 1.14</th></tr></thead><tbody><tr><td>R1</td><td>Hide the market price from the model</td><td>[2], [9]</td><td>Implemented; tested</td></tr><tr><td>R2</td><td>Use several model families and aggregate with the median</td><td>[2], [8]</td><td>Implemented: three families from the fleet's approved model table; agreement and spread rules</td></tr><tr><td>R3</td><td>Retrieve fresh evidence from several independent sources and keep a snapshot</td><td>[1], [9]</td><td>Implemented: Hacker News, GDELT, Wikipedia search and the Wikipedia current-events portal; per-source counts and an evidence digest in every log row. A fifth source, q08's own open forecasts on the same entity, is built behind a switch that is off: it is shown to the models as another forecaster's estimate, recorded under sources, and never counted toward the three pieces of evidence a question needs, because an earlier model's number is an anchor rather than news</td></tr><tr><td>R4</td><td>Learn a recalibration (stretch or shrink) from resolved outcomes</td><td>[6], [7], [8]</td><td>Implemented: logistic recalibration fitted on raw ensemble probabilities, bounded, applied only after 50 resolved estimates</td></tr><tr><td>R5</td><td>Blend the model with the market price and size by fractional Kelly</td><td>[1], [2]</td><td>Implemented: blend weight chosen by Brier score on resolved estimates; quarter-Kelly sizing capped at the position limit</td></tr><tr><td>R6</td><td>Score the first forecast on each market, with lead time</td><td>section 4</td><td>Implemented</td></tr><tr><td>R7</td><td>Append-only, tamper-evident forecast log, public</td><td>section 4</td><td>Implemented: hash chain, <code>GET /api/track-record</code> with verification</td></tr><tr><td>R8</td><td>Freeze parameters during evaluation</td><td>section 4</td><td>Implemented: parameter version; graduation counts the current version only; tuning at most weekly</td></tr><tr><td>R9</td><td>Evaluate by domain and switch off domains that lose</td><td>H6</td><td>Implemented: domain classifier, per-domain interval, automatic domain pause</td></tr><tr><td>R10</td><td>Report log loss as well as Brier score</td><td>section 4</td><td>Implemented</td></tr><tr><td>R11</td><td>Skip wide-spread markets</td><td>section 5</td><td>Implemented</td></tr><tr><td>R12</td><td>Test structural arbitrage separately from forecasting skill</td><td>H2, [5]</td><td>Implemented: every 15 minutes the worker reads the largest active events, keeps only complete mutually exclusive sets (negRisk, not the augmented kind with placeholder outcomes, every leg open and quoted on both sides), and prices a basket of every YES or every NO after each leg's spread and 1 percent slippage; a gap of at least 1 percent is logged (append-only) and opens a paper basket in its own ledger, separate from the account and from the forecasting proof (<code>arbitrage</code> in the charter). In a first read of the 60 largest active events on 9 November 2026, 8 were complete exclusive sets and none cost less than it paid after costs</td></tr><tr><td>R13</td><td>Run consistency and fake-date probes on the model</td><td>[9][10]</td><td>Implemented: on a hashed 20 percent sample of markets one member is also asked for the NO wording (the two answers must sum to 1 within 0.15 or the estimate is recorded as inconsistent and not traded) and re-run with today moved back 30 days (a move above 0.2 drops that model from the ensemble for the market); the failure rates are <code>probes</code> in the charter</td></tr><tr><td>R14</td><td>Maker-style execution for any live phase</td><td>section 5</td><td>Recorded on the live-trading decision item (issue 8960); not built</td></tr></tbody></table></div>\n<h2 id=\"7-pre-registered-test-and-stopping-rules\">7. Pre-registered test and stopping rules</h2>\n<p>Fixed before any result exists, and served live at <code>/api/charter</code>:</p>\n<ul><li><strong>Sample:</strong> at least 30 days of paper trading, 100 resolved forecasts and 30 qualifying trades under one frozen parameter version.</li><li><strong>Primary criteria, each with a 95 percent bootstrap interval clear of zero:</strong> the model (or the model and price blend) has a lower Brier score than the market price; the shadow return after slippage is positive; and the signal's bets beat backing whichever side the market already favours.</li><li><strong>Safety:</strong> drawdown under 20 percent.</li><li><strong>Automatic pauses:</strong> new entries pause for 24 hours at a 15 percent drawdown or when the model is significantly worse than the price after 30 resolved forecasts. A domain that is significantly worse than the price after 20 resolved forecasts is switched off.</li><li><strong>What happens on success:</strong> the gate only reports. It cannot switch anything on. A live account needs a wallet-signed key, an API key, funding and a jurisdiction and terms review, all of which belong to the owner, and none of which the worker holds.</li><li><strong>What would change our mind:</strong> a negative interval on the primary criteria after 100 resolved forecasts retires the signal strategy. The program would then keep only the structural-arbitrage work, if that survives costs.</li></ul>\n<h2 id=\"8-limitations\">8. Limitations</h2>\n<ul><li>The literature review was a targeted search, not a systematic review. Several figures come through secondary summaries and are marked as such.</li><li>The sample will take weeks. Early paper profit says little, and the dashboard will say \"not yet\" for a long time.</li><li>Wikipedia as an evidence source and the router's acceptance of every model identifier could not be verified before deployment; per-source counts and the list of models that answered are stored with every forecast so a failure is visible.</li><li>The three model families share much of the same internet text, so their errors are correlated; three models are worth fewer than three independent forecasters.</li><li>Resolution risk (disputed or ambiguous resolution) is not modelled.</li></ul>\n<h2 id=\"references\">References</h2>\n<ol><li>Halawi, D., Zhang, F., Yueh-Han, C., Steinhardt, J. (2024). <em>Approaching Human-Level Forecasting with Language Models.</em> <a href=\"https://arxiv.org/html/2402.18563v1\">arXiv:2402.18563</a></li><li>Schoenegger, P., Tuminauskaite, I., Park, P. S., Tetlock, P. E. (2024). <em>Wisdom of the Silicon Crowd: LLM Ensemble Prediction Capabilities Rival Human Crowd Accuracy.</em> Science Advances. <a href=\"https://arxiv.org/html/2402.19379v6\">arXiv:2402.19379</a></li><li>Karger, E., Bastani, H., et al. (2025). <em>ForecastBench: A Dynamic Benchmark of AI Forecasting Capabilities.</em> ICLR. <a href=\"https://arxiv.org/pdf/2409.19839\">arXiv:2409.19839</a></li><li>Metaculus (2024 to 2025). AI Forecasting Benchmark quarterly results. <a href=\"https://forum.nunosempere.com/posts/mwcWxwdsEMexm98GF/q1-ai-benchmarking-results-human-pros-crush-bots\">Q1 2025</a>, <a href=\"https://www.lesswrong.com/posts/Surnjh8A4WjgtQTkZ/q2-ai-benchmark-results-pros-maintain-clear-lead\">Q2 2025</a>, <a href=\"https://forum.nunosempere.com/posts/E3hiRG68wc6zLWr6m/can-ai-outpredict-humans-results-from-metaculus-s-q3-ai\">Q3 2024</a></li><li>Saguillo, O., Ghafouri, V., Kiffer, L., Suarez-Tangil, G. (2025). <em>Unravelling the Probabilistic Forest: Arbitrage in Prediction Markets.</em> <a href=\"https://arxiv.org/abs/2508.03474\">arXiv:2508.03474</a></li><li>Snowberg, E., Wolfers, J. (2010). <em>Explaining the Favorite-Long Shot Bias: Is it Risk-Love or Misperceptions?</em> Journal of Political Economy 118(4). <a href=\"https://www.nber.org/papers/w15923\">NBER w15923</a></li><li>Bürgi, C., Deng, W., Whelan, K. (2025). <em>Makers and Takers: The Economics of the Kalshi Prediction Market.</em> <a href=\"https://cepr.org/voxeu/columns/economics-kalshi-prediction-market\">CEPR summary</a>, <a href=\"https://www.karlwhelan.com/Papers/Kalshi.pdf\">working paper</a></li><li>Baron, J., Mellers, B. A., Tetlock, P. E., Stone, E., Ungar, L. H. (2014). <em>Two Reasons to Make Aggregated Probability Forecasts More Extreme.</em> Decision Analysis 11(2). <a href=\"https://econpapers.repec.org/RePEc:inm:ordeca:v:11:y:2014:i:2:p:133-145\">link</a></li><li>Paleka, D., Goel, S., Geiping, J., Tramèr, F. (2025). <em>Pitfalls in Evaluating Language Model Forecasters.</em> <a href=\"https://arxiv.org/html/2506.00723v1\">arXiv:2506.00723</a></li><li><em>Simulated Ignorance Fails: A Systematic Study of LLM Behaviors on Forecasting Problems Before Model Knowledge Cutoff</em> (2026). <a href=\"https://arxiv.org/html/2601.13717v1\">arXiv:2601.13717</a></li><li>Polymarket documentation, <em>Geoblock</em>. <a href=\"https://docs.polymarket.com/developers/CLOB/geoblock\">docs.polymarket.com</a></li></ol>\n<p><em>Live evidence:</em> <a href=\"https://markets.q08.org/api/charter\">markets.q08.org/api/charter</a> · <a href=\"https://markets.q08.org/api/track-record\">markets.q08.org/api/track-record</a> · charter PM-CHARTER-1 · decisions and open items: issues 8960, 8961, 8840, 9106 and 9107 in the QNFO/qnfo-workers repository.</p>\n<footer>Paper money only. Nothing here is investment advice, and no real order is placed by this program. Charter PM-CHARTER-1.</footer></body></html>\n";
// WHITEPAPER-END
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
// DESIGN-SYSTEM-1:BEGIN (sourced from _shared/design-system.js; applied by _shared/inline-design-system.mjs; do not edit inside a worker)
// ---- DESIGN-SYSTEM-1 (owner directive 2026-11-09). One design system for every page a person opens on q08.org, qnfo.org or qwav.org.
//
// WHAT. Design tokens (colour, type, spacing, radius, tap size) for a light and a dark theme, the CSS built from them, and the component
// classes every fleet page uses: top bar, page, card, button (primary, secondary, quiet), segmented control, Yes / No / Not sure choices,
// stat tiles, notes, badges, fields, disclosure, tables that scroll instead of crushing, empty states. Plus dsContrast(), so the contrast of
// every text and control colour pair is proven by '_shared/design-system.test.mjs' (WCAG 2.2 AA), and dsLint(), the check that fails a
// page with text under 13 px, a field under 16 px (iOS zooms) or a button under the 44 px tap size.
//
// WHY. Owner, 2026-11-09: "bad UI makes me sad ... the job site and even the markets ... are great examples of bad design ... implement
// design standards ... Don't give me shitty design anywhere." Before this file each worker carried its own inline palette (jobs: 13 px
// muted text and 12 px badges; markets: an unstyled 15 px system page with 8 px buttons and tables that broke words letter by letter on a
// phone). The standard below is written once here and inlined into each page's worker.
//
// THE STANDARD (what every page follows; the test enforces the parts a machine can check).
//  1. One primary action per screen. Exactly one .btn-primary is visible in a view; everything else is secondary or quiet.
//  2. Hierarchy before decoration. A page title, one sentence of status, then the content. Status lines are stat tiles, not run-on text.
//  3. Tap, do not type. Choices are buttons (Yes / No / Not sure, segmented views), never free text or tiny radio buttons. 44 px minimum.
//  4. Progressive disclosure. Secondary tools, links and explanations sit behind a "More" disclosure, not in the top bar.
//  5. Calm. Neutral surfaces, one accent colour, colour carries meaning only for good / warning / bad, generous spacing (8 px scale).
//  6. Readable. 16 px body, 14 px minimum for secondary text, line length under 75 characters for prose, tabular numbers in figures.
//  7. Accessible. WCAG 2.2 AA contrast in both themes, visible focus ring, labels on every field, reduced motion respected.
//  8. Every state designed. Loading, empty and error states say what happens next in one sentence.
//
// HOW TO ADOPT. 1) 'node _shared/inline-design-system.mjs <worker> --anchor "<line prefix>"' once (later runs replace the block in place,
// '--check' reports a stale copy). 2) Put '<style>${DS_CSS}</style>' (or dsHead(title)) in the page head and give <body> class="ds".
// 3) Build with the classes below; page-specific CSS uses the var(--ds-*) tokens, never raw hex. 4) Add the worker to ADOPTERS in
// '_shared/design-system.test.mjs', which renders the page and runs dsLint on it.
//
// RULES FOR EDITING. ES5 style (var and function), no import or export, every name starts with DS_ or ds, no '*' followed by '/' inside a
// comment, no backtick anywhere (the block is inlined into workers that hold their pages in template literals). Version every change in DS_VERSION.
var DS_VERSION = "1.0.0";

var DS_TOKENS = {
  light: {
    bg: "#f5f6f8", surface: "#ffffff", surface2: "#eef1f5", ink: "#15181e", ink2: "#4b5363", line: "#d5dae1", lineStrong: "#7b8494",
    accent: "#1d4ed8", accentHover: "#1e40af", onAccent: "#ffffff", accentSoft: "#e3eaff", accentSoftInk: "#1e3a8a",
    good: "#166534", goodSoft: "#dcfce7", warn: "#854d0e", warnSoft: "#fef3c7", bad: "#b42318", badSoft: "#fee4e2", focus: "#2563eb"
  },
  dark: {
    bg: "#0e1116", surface: "#161a21", surface2: "#1d222b", ink: "#e8ebf0", ink2: "#a4adbb", line: "#2b313c", lineStrong: "#6b7385",
    accent: "#8cb4ff", accentHover: "#a9c6ff", onAccent: "#0a1530", accentSoft: "#1b2a4a", accentSoftInk: "#c7d8ff",
    good: "#6ee7a0", goodSoft: "#12301f", warn: "#f6c453", warnSoft: "#33270d", bad: "#ff9a8f", badSoft: "#3a1715", focus: "#8cb4ff"
  },
  font: "system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif",
  mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
  size: { small: 14, body: 16, lead: 18, h3: 17, h2: 20, h1: 26, stat: 26 },
  space: [0, 4, 8, 12, 16, 24, 32, 48],
  radius: { s: 8, m: 12, l: 16, pill: 999 },
  tap: 44,
  maxWidth: 960
};

// The pairs whose contrast the test proves in both themes: [foreground token, background token, minimum ratio].
var DS_CONTRAST_PAIRS = [
  ["ink", "bg", 4.5], ["ink", "surface", 4.5], ["ink", "surface2", 4.5], ["ink2", "bg", 4.5], ["ink2", "surface", 4.5], ["ink2", "surface2", 4.5],
  ["accent", "surface", 4.5], ["accent", "bg", 4.5], ["onAccent", "accent", 4.5], ["onAccent", "accentHover", 4.5], ["accentSoftInk", "accentSoft", 4.5],
  ["good", "surface", 4.5], ["good", "goodSoft", 4.5], ["warn", "surface", 4.5], ["warn", "warnSoft", 4.5], ["bad", "surface", 4.5], ["bad", "badSoft", 4.5],
  ["ink", "warnSoft", 4.5], ["ink", "goodSoft", 4.5], ["ink", "badSoft", 4.5], ["ink", "accentSoft", 4.5],
  ["lineStrong", "surface", 3], ["focus", "surface", 3], ["focus", "bg", 3]
];

function dsLum(hex) {
  var h = String(hex).replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var c = [0, 2, 4].map(function (i) { var v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function dsContrast(a, b) { var x = dsLum(a), y = dsLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

function dsVars(t) {
  var map = { bg: "bg", surface: "surface", surface2: "surface-2", ink: "ink", ink2: "ink-2", line: "line", lineStrong: "line-strong", accent: "accent",
    accentHover: "accent-hover", onAccent: "on-accent", accentSoft: "accent-soft", accentSoftInk: "accent-soft-ink", good: "good", goodSoft: "good-soft",
    warn: "warn", warnSoft: "warn-soft", bad: "bad", badSoft: "bad-soft", focus: "focus" };
  return Object.keys(map).map(function (k) { return "--ds-" + map[k] + ":" + t[k]; }).join(";");
}

var DS_CSS = [
  "/* DESIGN-SYSTEM-1 v" + DS_VERSION + " (_shared/design-system.js) */",
  ":root{color-scheme:light dark;" + dsVars(DS_TOKENS.light) + ";--ds-font:" + DS_TOKENS.font + ";--ds-mono:" + DS_TOKENS.mono + ";--ds-tap:" + DS_TOKENS.tap + "px;--ds-r-s:8px;--ds-r-m:12px;--ds-r-l:16px;--ds-shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.08)}",
  "@media (prefers-color-scheme:dark){:root{" + dsVars(DS_TOKENS.dark) + ";--ds-shadow:none}}",
  "*,*::before,*::after{box-sizing:border-box}",
  "body.ds{margin:0;background:var(--ds-bg);color:var(--ds-ink);font:16px/1.55 var(--ds-font);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}",
  ".ds a{color:var(--ds-accent);text-underline-offset:2px}.ds a:hover{color:var(--ds-accent-hover)}",
  ".ds h1,.ds h2,.ds h3{line-height:1.25;margin:0 0 8px;letter-spacing:-.01em}.ds h1{font-size:26px;font-weight:700}.ds h2{font-size:20px;font-weight:650;margin-top:32px}.ds h3{font-size:17px;font-weight:650}",
  ".ds p{margin:0 0 12px}.ds small,.ds-muted{color:var(--ds-ink-2);font-size:14px}",
  ".ds :focus-visible{outline:3px solid var(--ds-focus);outline-offset:2px;border-radius:6px}",
  ".ds-skip{position:absolute;left:-9999px}.ds-skip:focus{left:16px;top:8px;z-index:20;background:var(--ds-surface);padding:8px 12px}",
  ".ds-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
  // top bar and page
  ".ds-top{position:sticky;top:0;z-index:10;background:var(--ds-surface);border-bottom:1px solid var(--ds-line)}",
  ".ds-top-in{max-width:960px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:12px;min-height:60px}",
  ".ds-brand{font-weight:700;font-size:17px;color:var(--ds-ink);text-decoration:none;margin-right:auto;display:flex;align-items:center;gap:8px}",
  ".ds-brand small{font-weight:500}",
  ".ds-main{max-width:960px;margin:0 auto;padding:20px 16px 64px}",
  ".ds-head{margin:4px 0 20px}.ds-head p{color:var(--ds-ink-2);margin:4px 0 0}",
  // buttons
  ".ds .btn,.ds button.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;min-width:44px;padding:10px 16px;border-radius:var(--ds-r-m);border:1px solid var(--ds-line-strong);background:var(--ds-surface);color:var(--ds-ink);font:600 15px/1.2 var(--ds-font);cursor:pointer;text-decoration:none;transition:background .15s,border-color .15s}",
  ".ds .btn:hover{background:var(--ds-surface-2)}.ds .btn:disabled,.ds .btn[aria-disabled=true]{opacity:.55;cursor:not-allowed}",
  ".ds .btn.btn-primary{background:var(--ds-accent);border-color:var(--ds-accent);color:var(--ds-on-accent)}.ds .btn.btn-primary:hover{background:var(--ds-accent-hover);border-color:var(--ds-accent-hover);color:var(--ds-on-accent)}",
  ".ds .btn.btn-quiet{background:transparent;border-color:transparent;color:var(--ds-accent)}.ds .btn.btn-quiet:hover{background:var(--ds-accent-soft)}",
  ".ds .btn.btn-block{width:100%}.ds .btn.btn-lg{min-height:52px;font-size:16px;padding:12px 20px}",
  ".ds-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}",
  // segmented control (views)
  ".ds-seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:4px;padding:4px;background:var(--ds-surface-2);border-radius:var(--ds-r-m)}",
  "@media (max-width:560px){.ds-seg{grid-auto-flow:row;grid-template-columns:1fr 1fr}}",
  ".ds-seg button{min-height:44px;padding:8px 10px;border:0;border-radius:9px;background:transparent;color:var(--ds-ink-2);font:600 15px var(--ds-font);cursor:pointer;line-height:1.2}",
  ".ds-seg button[aria-pressed=true],.ds-seg button[aria-selected=true]{background:var(--ds-surface);color:var(--ds-ink);box-shadow:var(--ds-shadow)}",
  // Yes / No / Not sure
  ".ds-choices{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}",
  ".ds-choices button{min-height:56px;border-radius:var(--ds-r-m);border:1px solid var(--ds-line-strong);background:var(--ds-surface);color:var(--ds-ink);font:600 16px var(--ds-font);cursor:pointer}",
  ".ds-choices button:hover{border-color:var(--ds-accent);background:var(--ds-accent-soft)}",
  ".ds-choices button[aria-pressed=true]{background:var(--ds-accent);border-color:var(--ds-accent);color:var(--ds-on-accent)}",
  ".ds-options{display:grid;gap:8px;margin-top:12px}.ds-options button{text-align:left;min-height:56px;padding:12px 16px;border-radius:var(--ds-r-m);border:1px solid var(--ds-line-strong);background:var(--ds-surface);color:var(--ds-ink);font:16px/1.4 var(--ds-font);cursor:pointer}",
  ".ds-options button:hover{border-color:var(--ds-accent);background:var(--ds-accent-soft)}.ds-options button b{display:block;font-weight:650}",
  ".ds-q{font-size:18px;font-weight:650;line-height:1.35;margin:6px 0}.ds-step{font-size:14px;color:var(--ds-ink-2);font-weight:600;letter-spacing:.02em}",
  ".ds-progress{height:6px;border-radius:99px;background:var(--ds-surface-2);overflow:hidden;margin:8px 0 4px}.ds-progress>i{display:block;height:100%;background:var(--ds-accent);border-radius:99px}",
  // cards, notes, badges
  ".ds-card{background:var(--ds-surface);border:1px solid var(--ds-line);border-radius:var(--ds-r-l);padding:16px;margin:0 0 12px;box-shadow:var(--ds-shadow)}",
  ".ds-card-title{font-size:17px;font-weight:650;line-height:1.35;margin:0}",
  ".ds-meta{color:var(--ds-ink-2);font-size:14px;margin-top:4px}",
  ".ds-note{border-radius:var(--ds-r-m);padding:12px 14px;margin:0 0 12px;background:var(--ds-accent-soft);color:var(--ds-ink);font-size:15px}",
  ".ds-note-warn{background:var(--ds-warn-soft)}.ds-note-good{background:var(--ds-good-soft)}.ds-note-bad{background:var(--ds-bad-soft)}",
  ".ds-badge{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:700;line-height:1;padding:5px 9px;border-radius:99px;background:var(--ds-surface-2);color:var(--ds-ink);white-space:nowrap}",
  ".ds-badge-accent{background:var(--ds-accent-soft);color:var(--ds-accent-soft-ink)}.ds-badge-good{background:var(--ds-good-soft);color:var(--ds-good)}.ds-badge-warn{background:var(--ds-warn-soft);color:var(--ds-warn)}.ds-badge-bad{background:var(--ds-bad-soft);color:var(--ds-bad)}",
  ".ds-good{color:var(--ds-good)}.ds-warn{color:var(--ds-warn)}.ds-bad{color:var(--ds-bad)}",
  // stats
  ".ds-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:0 0 16px}",
  ".ds-stat{background:var(--ds-surface);border:1px solid var(--ds-line);border-radius:var(--ds-r-m);padding:12px 14px}",
  ".ds-stat .k{font-size:14px;color:var(--ds-ink-2)}.ds-stat .v{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.2;margin-top:2px}",
  // fields
  ".ds input:not([type=radio]):not([type=checkbox]),.ds select,.ds textarea{font:16px/1.4 var(--ds-font);color:var(--ds-ink);background:var(--ds-surface);border:1px solid var(--ds-line-strong);border-radius:var(--ds-r-s);padding:10px 12px;min-height:44px;max-width:100%}",
  ".ds textarea{width:100%}.ds label{font-size:15px}",
  ".ds-field{display:grid;gap:4px;margin:0 0 12px}.ds-field>span{font-size:14px;font-weight:600;color:var(--ds-ink-2)}",
  // disclosure
  ".ds details.ds-more{background:var(--ds-surface);border:1px solid var(--ds-line);border-radius:var(--ds-r-l);margin:0 0 12px}",
  ".ds details.ds-more>summary{list-style:none;cursor:pointer;min-height:52px;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;font-weight:650}",
  ".ds details.ds-more>summary::-webkit-details-marker{display:none}.ds details.ds-more>summary::after{content:'+';font-size:22px;color:var(--ds-ink-2);font-weight:400}",
  ".ds details.ds-more[open]>summary::after{content:'\\2212'}.ds details.ds-more>.ds-more-body{padding:0 16px 16px}",
  // tables: scroll, never crush
  ".ds-table-wrap{overflow-x:auto;border:1px solid var(--ds-line);border-radius:var(--ds-r-m);background:var(--ds-surface)}",
  ".ds-table{width:100%;border-collapse:collapse;font-size:15px}.ds-table th{font-size:13px;font-weight:650;color:var(--ds-ink-2);text-transform:uppercase;letter-spacing:.04em;text-align:left;background:var(--ds-surface-2)}",
  ".ds-table th,.ds-table td{padding:10px 12px;border-bottom:1px solid var(--ds-line);vertical-align:top}.ds-table tr:last-child td{border-bottom:0}",
  ".ds-table .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.ds-table td.title{min-width:200px}",
  // lists of items as cards on phones
  ".ds-rows{display:grid;gap:8px}.ds-row{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;background:var(--ds-surface);border:1px solid var(--ds-line);border-radius:var(--ds-r-m);padding:12px 14px}",
  ".ds-row .main{min-width:0;flex:1}.ds-row .side{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}",
  // empty and loading
  ".ds-empty{text-align:center;padding:32px 16px;color:var(--ds-ink-2);border:1px dashed var(--ds-line-strong);border-radius:var(--ds-r-l)}",
  ".ds-empty b{display:block;color:var(--ds-ink);font-size:17px;margin-bottom:4px}",
  ".ds pre{white-space:pre-wrap;background:var(--ds-surface-2);border-radius:var(--ds-r-s);padding:12px;font:14px/1.5 var(--ds-mono);overflow-x:auto}",
  ".ds hr{border:0;border-top:1px solid var(--ds-line);margin:24px 0}",
  "@media (max-width:640px){.ds-hide-sm{display:none!important}.ds h1{font-size:23px}.ds-top-in{padding:8px 12px}}",
  "@media (prefers-reduced-motion:reduce){.ds *{transition:none!important;animation:none!important}}"
].join("\n");

function dsEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

// The head of a page: charset, viewport, title, description, theme colours and the design system CSS. extraCss uses var(--ds-*) only.
function dsHead(title, description, extraCss) {
  return "<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\"><title>" + dsEsc(title) + "</title>"
    + (description ? "<meta name=\"description\" content=\"" + dsEsc(description) + "\">" : "")
    + "<meta name=\"theme-color\" content=\"" + DS_TOKENS.light.surface + "\" media=\"(prefers-color-scheme: light)\"><meta name=\"theme-color\" content=\"" + DS_TOKENS.dark.surface + "\" media=\"(prefers-color-scheme: dark)\">"
    + "<style>" + DS_CSS + (extraCss ? "\n" + extraCss : "") + "</style>";
}

// Machine-checkable parts of the standard, run on a rendered page. Returns a list of problems (empty when the page passes).
function dsLint(html) {
  var out = [], m, re;
  if (String(html).indexOf("DESIGN-SYSTEM-1 v") < 0) out.push("page does not include DS_CSS");
  if (!/<body[^>]*class="[^"]*\bds\b/.test(html)) out.push("body is missing class=\"ds\"");
  if (!/name="?viewport"?/.test(html)) out.push("no viewport meta");
  re = /font(?:-size)?\s*:\s*(?:[0-9]+\s+)?([0-9.]+)px/g;
  while ((m = re.exec(html))) { if (+m[1] < 13) out.push("text under 13px: " + m[0]); }
  re = /min-height\s*:\s*([0-9.]+)px/g;
  var css = String(html).split("<style>").slice(1).map(function (s) { return s.split("</style>")[0]; }).join("\n");
  re = /(button|\.btn)[^{}]*\{[^}]*min-height\s*:\s*([0-9.]+)px/g;
  while ((m = re.exec(css))) { if (+m[2] < 40) out.push("button under the tap size: " + m[0].slice(0, 80)); }
  if (/style="[^"]*#[0-9a-fA-F]{3,6}/.test(html)) out.push("inline style with a raw hex colour (use var(--ds-*))");
  var prim = (html.match(/class="[^"]*\bbtn-primary\b/g) || []).length;
  if (prim > 1) out.push("more than one primary button in the static page (" + prim + ")");
  return out;
}
// DESIGN-SYSTEM-1:END
// WHITEPAPER-DESIGN-1 (DESIGN-SYSTEM-3, #9929): the white paper is served on the shared design system. The generated page keeps its own standalone head between the DS-HEAD markers (the .html copy
// in papers/ needs it); the route swaps that head for dsHead() and gives <body> class "ds". Reading face stays serif; colours, 16 px body and the 14 px floor come from the tokens.
const WHITEPAPER_DS_CSS = "body.ds{max-width:46rem;margin:0 auto;padding:16px;font:17px/1.6 Georgia,'Times New Roman',serif}.ds nav{font:14px var(--ds-font);display:flex;gap:4px 8px;flex-wrap:wrap;border-bottom:1px solid var(--ds-line);padding-bottom:8px}.ds nav a{display:inline-flex;align-items:center;min-height:44px;padding:0 6px}.ds h1{font-size:1.7rem;line-height:1.25}.ds h2{font-size:1.3rem;margin-top:2rem}.ds h3{font-size:1.1rem}.t{overflow-x:auto}.ds table{border-collapse:collapse;font:14px/1.45 var(--ds-font);margin:1rem 0}.ds td,.ds th{border:1px solid var(--ds-line);padding:6px 8px;vertical-align:top;text-align:left}.ds th{background:var(--ds-surface-2)}.ds code{font:.9em var(--ds-mono);background:var(--ds-surface-2);padding:0 3px;border-radius:3px}.ds footer{font:14px var(--ds-font);color:var(--ds-ink-2);border-top:1px solid var(--ds-line);margin-top:2rem;padding-top:10px}";
function whitepaperDs() {
  const a = WHITEPAPER_HTML.indexOf("<!--DS-HEAD-->"), b = WHITEPAPER_HTML.indexOf("<!--/DS-HEAD-->");
  if (a < 0 || b < a) return WHITEPAPER_HTML;
  const t = (WHITEPAPER_HTML.match(/<title>([^<]*)<\/title>/) || [, "White paper"])[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"");
  return WHITEPAPER_HTML.slice(0, a) + dsHead(t, "Evidence on where language-model forecasters may beat prediction markets, a pre-registered test, and the Q08 proving ground.", WHITEPAPER_DS_CSS) + WHITEPAPER_HTML.slice(b + 15).replace("<body>", "<body class=\"ds\">");
}
// MARKETS-DESIGN-1 (DESIGN-SYSTEM-1, owner 2026-11-09): the dashboard on the shared design system. One primary action (Run tick now), the
// account as stat tiles, the evidence as a verdict card, every list as phone-width rows instead of crushed tables. Also fixes the Predictions
// list, which never rendered: the old script reused the element id "pr" as a local name for the probes, so pr.innerHTML wrote to that object.
const PAGE = `<!doctype html><html lang="en"><head>${dsHead("Q08 Forecasts: paper pilot", "Paper-trading proving ground: does fresh reporting beat the prediction-market price? Simulated money only.", ".mk-row-acts{display:flex;gap:8px;margin-top:10px}.mk-row-acts .btn{flex:1}.mk-why{font-size:14px;color:var(--ds-ink-2);margin-top:6px}.mk-num{font-variant-numeric:tabular-nums}.mk-verdict{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}.mk-need{margin:8px 0 0;padding-left:20px;color:var(--ds-ink-2);font-size:15px}.mk-sec{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.mk-sec h2{margin-bottom:12px}.mk-foot{margin-top:40px;font-size:14px;color:var(--ds-ink-2);display:flex;gap:4px 16px;flex-wrap:wrap;align-items:center}.mk-foot a{display:inline-flex;align-items:center;min-height:44px;min-width:44px}")}</head>
<body class="ds"><a class="ds-skip" href="#main">Skip to content</a>
<header class="ds-top"><div class="ds-top-in"><a class="ds-brand" href="/">Q08 Forecasts <span class="ds-badge ds-badge-warn">Paper pilot</span></a><a class="btn btn-quiet ds-hide-sm" href="/whitepaper">White paper</a></div></header>
<main class="ds-main" id="main">
<div class="ds-head"><h1>Paper-trading proving ground</h1><p>Three models read the last 3 days of Hacker News, GDELT and Wikipedia and estimate each market without seeing its price. A paper trade opens only when they agree on a gap of 10 points or more.</p></div>
<div class="ds-note ds-note-warn" role="note"><b>Simulated money only.</b> No real orders are placed and no exchange key exists in this program.</div>
<section aria-labelledby="acct-h"><h2 id="acct-h" class="ds-sr">Account</h2>
<div class="ds-stats" id="s" aria-live="polite"><div class="ds-stat"><div class="k">Equity</div><div class="v">Loading</div></div></div>
<div class="ds-actions"><button class="btn btn-primary btn-lg" id="t">Run tick now</button><span id="x" class="ds-muted" role="status"></span></div></section>
<section aria-labelledby="ev-h"><h2 id="ev-h">Does the information beat the market?</h2><div class="ds-card" id="ev"><span class="ds-muted">Collecting evidence...</span></div></section>
<section aria-labelledby="pr-h"><h2 id="pr-h">Predictions</h2><div class="ds-rows" id="pred"></div></section>
<section aria-labelledby="o-h"><h2 id="o-h">Open positions</h2><div class="ds-rows" id="o"></div></section>
<section aria-labelledby="c-h"><h2 id="c-h">Closed</h2><div class="ds-rows" id="c"></div></section>
<section aria-labelledby="m-h"><h2 id="m-h">Markets</h2>
<details class="ds-more"><summary>Place a paper order by hand</summary><div class="ds-more-body"><label class="ds-field"><span>Order size in dollars</span><input id="amt" type="number" inputmode="decimal" value="100" min="1" step="1"></label><p class="ds-muted">Order size applies to the Buy YES and Buy NO buttons below. Paper money only.</p></div></details>
<p id="msg" role="status" class="ds-muted"></p><div class="ds-rows" id="m"></div></section>
<footer class="mk-foot"><a href="/whitepaper">White paper</a><a href="/api/charter">Charter and evidence</a><a href="/api/track-record">Track record</a><span>Not investment advice.</span></footer>
</main>
<script>
const $=id=>document.getElementById(id);const f=n=>(+n).toFixed(2);const usd=n=>(n<0?'-':'')+'$'+Math.abs(+n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const E=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const pc=v=>v==null?'n/a':(v>=0?'+':'')+(v*100).toFixed(1)+'%';const tone=v=>v>0?'ds-good':v<0?'ds-bad':'';
const tile=(k,v,cls)=>'<div class="ds-stat"><div class="k">'+E(k)+'</div><div class="v '+(cls||'')+'">'+v+'</div></div>';
const empty=(t,s)=>'<div class="ds-empty"><b>'+E(t)+'</b>'+E(s)+'</div>';
const cents=p=>Math.round(p*100)+'¢';
async function L(){
 let d;try{d=await (await fetch('/api/state')).json()}catch(e){$('s').innerHTML='<div class="ds-note ds-note-bad">The account could not load: '+E(e.message)+'. It retries every 30 seconds.</div>';return}
 $('s').innerHTML=tile('Equity',usd(d.equity))+tile('Return',pc(d.return_pct/100),tone(d.return_pct))+tile('Cash',usd(d.cash))+tile('Win rate',d.win_rate==null?'n/a':Math.round(d.win_rate*100)+'%')+tile('Closed trades',d.trades_closed)+tile('Max drawdown',f(d.stats.max_drawdown_pct)+'%');
 $('pred').innerHTML=(d.predictions||[]).map(p=>{const g=p.edge==null?null:p.edge*100;return '<div class="ds-row"><div class="main"><div class="ds-card-title">'+E(p.title)+'</div><div class="ds-meta">Models '+(p.fair==null?'n/a':cents(p.fair))+' · market '+cents(p.market)+(p.ends_at?' · resolves '+E(String(p.ends_at).slice(0,10)):'')+'</div><div class="mk-why">'+E(p.why)+'</div></div><div class="side">'+(g==null?'':'<span class="ds-badge '+(Math.abs(g)>=10?'ds-badge-accent':'')+'">'+(g>0?'+':'')+g.toFixed(0)+' pts</span>')+(p.traded?'<div style="margin-top:6px"><span class="ds-badge ds-badge-good">Traded</span></div>':'')+'</div></div>'}).join('')||empty('No predictions yet','The next tick reads new markets.');
 $('o').innerHTML=(d.open||[]).map(p=>'<div class="ds-row"><div class="main"><div class="ds-card-title">'+E(p.title)+'</div><div class="ds-meta"><span class="ds-badge">'+E(String(p.side).toUpperCase())+'</span> entry '+cents(p.entry)+' · now '+cents(p.mark)+(p.fair==null?'':' · models '+cents(p.side=='yes'?p.fair:1-p.fair))+'</div></div><div class="side mk-num '+tone(p.unrealized)+'"><b>'+usd(p.unrealized)+'</b></div></div>').join('')||empty('No open positions','Positions open when the models agree on a 10-point gap.');
 $('c').innerHTML=(d.closed||[]).map(p=>'<div class="ds-row"><div class="main"><div class="ds-card-title">'+E(p.title)+'</div><div class="ds-meta"><span class="ds-badge">'+E(String(p.side).toUpperCase())+'</span> '+E(p.reason)+'</div></div><div class="side mk-num '+tone(p.pnl)+'"><b>'+usd(p.pnl)+'</b></div></div>').join('')||empty('Nothing closed yet','Closed trades and their profit or loss appear here.');
 $('m').innerHTML=(d.markets||[]).map(p=>'<div class="ds-row" style="display:block"><div class="ds-card-title">'+E(p.title)+'</div><div class="ds-meta mk-num">YES '+cents(p.yes)+' · move <span class="'+tone(p.move)+'">'+(p.move>0?'+':'')+Math.round(p.move*100)+' pts</span></div><div class="mk-row-acts"><button class="btn" data-s="'+E(p.slug)+'" data-d="yes">Buy YES</button><button class="btn" data-s="'+E(p.slug)+'" data-d="no">Buy NO</button></div></div>').join('')||empty('No markets loaded','The next tick fetches the market list.');
 $('x').textContent=Object.entries(d.stats.by_strategy||{}).map(([k,v])=>k+': '+v.trades+' trades, '+usd(v.pnl)).join(' · ');
 try{const cs=await (await fetch('/api/charter')).json();const e=cs.evaluation,ar=cs.arbitrage,pb=cs.probes;const better=e.brier_model!=null&&e.brier_market!=null&&e.brier_model<e.brier_market;
  $('ev').innerHTML='<div class="mk-verdict">'+(cs.graduation.ready?'<span class="ds-badge ds-badge-good">All graduation criteria met</span>':'<span class="ds-badge ds-badge-warn">Not proven yet</span>')+(cs.control.paused?'<span class="ds-badge ds-badge-bad">Entries paused</span>':'')+'<span class="ds-muted">parameters v'+E(cs.params.version)+' · '+e.n+' resolved estimates · '+e.shadow_n+' qualifying trades</span></div>'
  +'<div class="ds-stats">'+tile('Brier: models',e.brier_model==null?'n/a':e.brier_model.toFixed(3),better?'ds-good':'')+tile('Brier: market',e.brier_market==null?'n/a':e.brier_market.toFixed(3))+tile('Shadow return',pc(e.shadow_roi),tone(e.shadow_roi))+tile('Back the favourite',pc(e.control_roi))+'</div>'
  +'<p class="ds-muted">Lower Brier is better. The models must beat the market price and backing the favourite, with intervals clear of zero, before anything changes.</p>'
  +(cs.control.paused?'<div class="ds-note ds-note-bad">Entries paused: '+E(cs.control.paused_reason)+'</div>':'')
  +(cs.graduation.ready?'':'<b>Still needed</b><ul class="mk-need">'+cs.graduation.reasons.map(r=>'<li>'+E(r)+'</li>').join('')+'</ul>')
  +'<hr><div class="ds-meta">Structural arbitrage (own ledger): '+ar.gaps_seen+' gaps seen, '+ar.baskets_open+' open, '+ar.baskets_settled+' settled'+(ar.realised_return==null?'':', return '+pc(ar.realised_return))+'. Model probes: '+pb.n+' run, '+pb.inconsistent+' inconsistent, '+pb.lookahead+' used later information.</div>'}
 catch(e){$('ev').innerHTML='<div class="ds-note ds-note-bad">The evidence could not load: '+E(e.message)+'.</div>'}}
$('m').onclick=async e=>{const b=e.target.closest('button');if(!b||!b.dataset.s)return;b.disabled=true;const q=await fetch('/api/order',{method:'POST',body:JSON.stringify({slug:b.dataset.s,side:b.dataset.d,usd:+$('amt').value})});const j=await q.json();b.disabled=false;$('msg').textContent=j.error?('Not placed: '+j.error):('Paper order filled at '+cents(j.fill)+' for '+f(j.qty)+' shares.');L()};
$('t').onclick=async()=>{const t=$('t');t.disabled=true;t.textContent='Running...';try{await fetch('/api/tick',{method:'POST'})}finally{t.disabled=false;t.textContent='Run tick now';L()}};L();setInterval(L,30000)
</script></body></html>`;

// FORECAST-ENGINE-1:BEGIN (sourced from forecast-engine.mjs by inline-forecast-engine.mjs; do not edit inside worker.js)
const FE = (() => {
// forecast-engine.mjs (inside q08-prediction-markets): consequential forecasts from the signal stream, at a few thousand tokens per update (FORECAST-ENGINE-1).
// Gates, self-halt and the spin-off criteria are code below (GATES, spinoffStatus); the audit that motivated it is in the header above.
//
// Why it exists (audit 2026-11-12, numbers read from D1 that day):
// - q08-signal-engine wrote essays first and forecasts as a by-product. In the 14 days to 2026-11-12 it ran 539 times, published 9
//   pieces and spent about 23 million Workers AI tokens (qnfo-audit ai_call_counters), about 2.6 million tokens per published piece.
//   131 of its 158 pieces carry a retraction, and it has produced 4 forecasts in total, none resolved.
// - q08-prediction-markets estimated short-horizon Polymarket questions with the price hidden from the models. On its 30 resolved
//   estimates the models scored Brier 0.218 against 0.039 for the market price: the crowd was 5.6 times more accurate. Most of its
//   universe was Bitcoin brackets, sports spreads and streamer stunts.
//
// What this engine does instead (forecast first, prose last):
//   1 select   keep only questions with a financial transmission (rates, leadership of listed firms, capital raises, energy and
//              geopolitics, officials and rules); drop sports, price brackets, entertainment. Deterministic, 0 tokens.
//   2 prior    start from the crowd: the market price, repaired for coherence across the dates of one question (a "by Dec 31"
//              leg can never be below a "by Nov 13" leg). Incoherent or stale legs are themselves a signal. 0 tokens.
//   3 match    link the signal stream (q08-signal.signal_log: news feeds, searches, HN, arXiv, Federal Register) to each question by
//              entity overlap. 0 tokens. A family with no matched evidence is fetched for by name (NEWS-LANE-1, issue 11057):
//              GDELT doc search on the question's own entities, Google News RSS as the second path, rows kept in fe_signal.
//   4 trigger  re-forecast only when new matched evidence arrived or the prior moved 5 points. Most hours cost nothing.
//   5 adjust   two models from different families each propose a bounded log-odds shift from the prior, citing evidence ids.
//              About 1.5k tokens in and a few hundred out per model.
//   6 gate     deterministic: an uncited or out-of-range shift is dropped; disagreeing directions cancel to the prior;
//              the mean shift is halved and capped at 1 logit. The engine can only move away from the crowd with evidence.
//   7 ledger   append-only, hash-chained rows in q08-trades fe_forecast; scored against the prior on resolution, so the only
//              headline number is value added over the crowd (Brier of the prior minus Brier of the engine).
//   8 card     the public page renders each forecast from its row: number, prior, what moved it, what it moves. No essay.
//
// Paper only. No order, wallet or exchange key exists here. Money stays an owner decision (IC-GATE-001).
const FE_VERSION = "1"; // ledger schema version, recorded on every row

// ---------- 1 select: what makes a question consequential ----------
// Each rule names the financial channel a question moves; the page shows it so a reader sees why it matters.
const CONSEQUENCE = [
  { key: "monetary", re: /\b(fed|fomc|interest rates?|rate (cut|hike)s?|ecb|bank of england|boj|basis points?)\b/i,
    moves: "Borrowing costs: mortgage rates, bond prices and equity valuations." },
  { key: "macro", re: /\b(cpi|inflation|unemployment|jobs report|payrolls|gdp|recession)\b/i,
    moves: "The data the Fed and bond markets act on." },
  { key: "leadership", re: /\b(ceo|chair(man)?|resign(ation)?|removal|ousted?|step(s)? down)\b/i,
    moves: "Leadership of a listed company: its share price, and its suppliers' and customers'." },
  { key: "capital", re: /\b(ipo|s-1|listing|go(es)? public|acquisition|acquire|merger|buyout)\b/i,
    moves: "The price and timing of a major capital raise or deal, and its read-across to peers." },
  { key: "energy-geopolitics", re: /\b(iran|blockade|ceasefire|opec|oil|strait|sanctions?|invade|nuclear deal|regime)\b/i,
    moves: "Oil and shipping prices, defence stocks and inflation expectations." },
  { key: "officials-rules", re: /\b(secretary of|impeach(ed|ment)?|shutdown|tariffs?|executive order|bill passes|supreme court|export (rule|control)s?)\b/i,
    moves: "The officials and rules that set contracts, tariffs and budgets." },
  // Q08-GROWTH-1 (owner 2026-11-12: "things that have some nexus with technology and current events ... really hard-hitting world event shit"):
  // a question about the firms and rules that set the AI and chip cycle is consequential on its own; listed last so leadership and capital keep their channel.
  { key: "tech", re: /\b(nvidia|openai|anthropic|tsmc|asml|semiconductors?|chips?|chipmakers?|ai|artificial intelligence|agi|gpus?|data cent(?:er|re)s?|antitrust|xai|deepmind|microsoft|alphabet|google|apple|amazon|meta|tesla)\b/i,
    moves: "AI and semiconductor equities: the largest weights in the Nasdaq-100 and their supply chains." },
];
// Q08-GROWTH-1: the technology nexus, read on every category (a CEO's exit at Nvidia or a chip export rule both carry it).
const TECH_NEXUS = CONSEQUENCE[CONSEQUENCE.length - 1].re;
// Trivial or unforecastable from news: sports, price brackets (no news signal decides them), entertainment, stunts.
const TRIVIAL = /\b(vs\.?|spread:|o\/u|win on \d|worlds \d{4}|champions league|nba|nfl|super bowl|grand prix|bitcoin|btc|ethereum|eth|solana|dip to \$|above \$|reach \$|gta|marathon|aliens?|divorce|album|box office|tweets?|posts?|mlb|nhl|ufc|fifa|world cup|wimbledon|formula 1|f1|oscars?|grammys?|emmys?|eurovision|mrbeast|streamer|youtuber|kardashians?|taylor swift|celebrity)\b/i;

// Q08-GROWTH-1: where the token budget goes. Tokens are spent on the questions with the widest financial transmission first: the channel's
// weight, a technology nexus, how contested the crowd is (a 50% question carries more information than a 3% one) and how much money trades it.
const CATEGORY_WEIGHT = { monetary: 1, "energy-geopolitics": 1, leadership: 0.9, tech: 0.9, capital: 0.85, macro: 0.85, "officials-rules": 0.75 };
function consequenceScore(q) {
  const c = q && q.category ? { key: q.category } : classify(q && q.title);
  if (!c) return 0;
  const p = Number.isFinite(+q.prior) ? +q.prior : 0.5;
  const contested = 4 * p * (1 - p), liq = Math.min(1, Math.log10(1 + Math.max(0, +q.vol24 || 0)) / 6);
  return +((CATEGORY_WEIGHT[c.key] ?? 0.7) + (TECH_NEXUS.test(String(q.title || "")) ? 0.35 : 0) + 0.5 * contested + 0.4 * liq + (q.incoherent ? 0.15 : 0)).toFixed(3);
}
function classify(title) {
  const t = String(title || "");
  if (!t || TRIVIAL.test(t) || /\(synthetic\)/i.test(t)) return null;
  const hit = CONSEQUENCE.find((c) => c.re.test(t));
  return hit ? { key: hit.key, moves: hit.moves } : null;
}

// ---------- 2 prior: one question, many dated legs ----------
const MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
// "by November 13, 2026?" / "through December 31?" / "before 2027?" -> ISO date of the deadline (year defaults to the reference year).
function deadlineOf(title, refYear) {
  const t = String(title || "");
  let m = t.match(/\b(?:by|through|before|after)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,?\s*(\d{4}))?/i);
  if (m) {
    const y = m[3] ? +m[3] : refYear;
    return new Date(Date.UTC(y, MONTHS[m[1].toLowerCase()], +m[2])).toISOString().slice(0, 10);
  }
  m = t.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i);
  if (m) return new Date(Date.UTC(+m[2], MONTHS[m[1].toLowerCase()] + 1, 0)).toISOString().slice(0, 10);
  m = t.match(/\bbefore\s+(\d{4})\b/i) || t.match(/\bby (?:the )?end of (\d{4})\b/i);
  if (m) return (/before/i.test(m[0]) ? +m[1] - 1 : +m[1]) + "-12-31";
  return null;
}
// The question with its date removed: legs of one question share this key.
function familyKey(title) {
  return String(title || "")
    .replace(/\b(by|through|before)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(,?\s*\d{4})?/ig, "$1 <date>")
    .replace(/\bbefore\s+\d{4}\b/ig, "before <date>")
    .replace(/[?]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}
// "Will X happen by D" grows with D; "X continues through D" shrinks with D.
const directionOf = (title) => (/\b(continues?|remain|stays?|still)\b/i.test(title) ? -1 : 1);

// Pool-adjacent-violators: the closest monotone sequence (weighted least squares). Fresher legs weigh more.
function isotonic(values, weights, dir = 1) {
  const v = values.map((x) => dir * x), blocks = [];
  for (let i = 0; i < v.length; i++) {
    blocks.push({ s: v[i] * weights[i], w: weights[i], n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].s / blocks[blocks.length - 2].w > blocks[blocks.length - 1].s / blocks[blocks.length - 1].w) {
      const b = blocks.pop(), a = blocks.pop();
      blocks.push({ s: a.s + b.s, w: a.w + b.w, n: a.n + b.n });
    }
  }
  const out = [];
  for (const b of blocks) for (let k = 0; k < b.n; k++) out.push(dir * (b.s / b.w));
  return out;
}

// Groups dated legs, repairs each family to a coherent curve and reports the legs whose quoted price broke coherence.
function termStructure(markets, nowMs) {
  const refYear = new Date(nowMs).getUTCFullYear(), fam = new Map();
  for (const m of markets) {
    const d = deadlineOf(m.title, refYear);
    if (!d) continue;
    const k = familyKey(m.title);
    if (!fam.has(k)) fam.set(k, []);
    fam.get(k).push({ ...m, deadline: d });
  }
  const out = [];
  for (const [key, legs] of fam) {
    legs.sort((a, b) => a.deadline.localeCompare(b.deadline));
    const dir = directionOf(legs[0].title);
    const w = legs.map((l) => {
      const ageH = Math.max(0, (nowMs - Date.parse(l.updated_at || 0)) / 3600000);
      return Math.max(0.01, Math.log10(10 + (+l.vol24 || 0)) / (1 + (ageH / 12) ** 2)); // a quote 3 days old weighs ~1/40 of a fresh one
    });
    const fit = isotonic(legs.map((l) => +l.yes), w, dir);
    legs.forEach((l, i) => {
      const ageH = Math.round(Math.max(0, (nowMs - Date.parse(l.updated_at || 0)) / 3600000));
      out.push({ ...l, family: key, prior: clampP(fit[i]), quoted: +l.yes, incoherent: Math.abs(fit[i] - l.yes) >= 0.05, age_h: ageH });
    });
  }
  return out;
}

// ---------- 3 match: signals to questions ----------
const STOP = new Set("will the a an of by to in on for and or be is are was at as with from before after through end next out than this that its it his her their into over under new say says said about us u.s".split(" "));
function entities(title) {
  const words = String(title || "").replace(/[^A-Za-z0-9$.\- ]/g, " ").split(/\s+/).filter(Boolean);
  const set = new Set();
  for (const w of words) {
    const l = w.toLowerCase().replace(/\.$/, "");
    if (l.length < 3 || STOP.has(l) || /^\d+$/.test(l) || MONTHS[l] !== undefined) continue;
    if (/^[A-Z]/.test(w) || l.length >= 6) set.add(l);
  }
  return [...set];
}
// Proper entities: capitalised words of the question that are not stop words or months ("Jensen", "Huang", "Anthropic", "Fed").
function properEntities(title) {
  const out = new Set();
  for (const w of String(title || "").replace(/[^A-Za-z0-9.\- ]/g, " ").split(/\s+/)) {
    const l = w.toLowerCase().replace(/\.$/, "");
    if (/^[A-Z]/.test(w) && l.length >= 3 && !STOP.has(l) && MONTHS[l] === undefined) out.add(l);
  }
  return [...out];
}
// Evidence for one question: signals naming at least one of its proper entities, best overlap then newest first.
function matchEvidence(question, signals, { max = 6, sinceMs = 0 } = {}) {
  const proper = properEntities(question.title), all = entities(question.title);
  if (!proper.length) return [];
  const has = (text, e) => new RegExp("\\b" + e.replace(/[.$-]/g, "\\$&") + "\\b", "i").test(text);
  const out = [];
  for (const s of signals) {
    const t = Date.parse(String(s.created_at || "").replace(" ", "T") + (/Z|\+/.test(String(s.created_at)) ? "" : "Z"));
    if (Number.isFinite(t) && t < sinceMs) continue;
    if (!proper.some((e) => has(s.title, e))) continue;
    out.push({ ...s, overlap: all.filter((e) => has(s.title, e)).length });
  }
  out.sort((a, b) => b.overlap - a.overlap || String(b.created_at).localeCompare(String(a.created_at)));
  return out.slice(0, max).map((s, i) => ({ id: "E" + (i + 1), title: s.title, url: s.url, source: s.source, date: String(s.created_at || "").slice(0, 10) }));
}

// ---------- 4 trigger ----------
function needsUpdate(last, prior, evidence) {
  if (!last) return { yes: true, why: "first forecast" };
  const seen = new Set(JSON.parse(last.evidence_json || "[]").map((e) => e.url));
  const fresh = evidence.filter((e) => !seen.has(e.url)).length;
  if (fresh) return { yes: true, why: fresh + " new signal" + (fresh > 1 ? "s" : "") };
  if (Math.abs(prior - last.prior) >= 0.05) return { yes: true, why: "crowd moved " + Math.round(100 * (prior - last.prior)) + " pts" };
  return { yes: false, why: "no new evidence" };
}

// ---------- 5 adjust: a compact prompt ----------
function buildPrompt(q, evidence, today) {
  const ev = evidence.map((e) => `${e.id} [${e.date}, ${e.source}] ${e.title}`).join("\n");
  return [
    `Today is ${today}. Question: "${q.title}" Resolves on: ${q.deadline}.`,
    `Crowd probability (prediction market, coherence-repaired): ${pct(q.prior)}.`,
    `New evidence (headlines only; nothing else is known to you):`,
    ev || "(none)",
    ``,
    `Task: decide whether this evidence justifies moving away from the crowd. The crowd is usually right; move only if a headline`,
    `carries information the price plausibly has not absorbed. Answer with ONE line of JSON and nothing else:`,
    `{"shift": <log-odds change from -2 to 2, 0 if no reason>, "cites": ["E1", ...], "mechanism": "<one sentence: how the cited`,
    `evidence changes the odds>", "watch": "<one observable event in the next week that would settle the direction>"}`,
  ].join("\n");
}

// ---------- 6 gate ----------
function parseShift(text, evidenceIds) {
  const s = String(text || "");
  const m = s.match(/\{[\s\S]*"shift"[\s\S]*?\}(?![\s\S]*"shift")/);
  if (!m) return { ok: false, why: "no JSON" };
  let j;
  try { j = JSON.parse(m[0]); } catch { return { ok: false, why: "bad JSON" }; }
  const shift = Number(j.shift);
  if (!Number.isFinite(shift) || Math.abs(shift) > 2) return { ok: false, why: "shift out of range" };
  const cites = (Array.isArray(j.cites) ? j.cites : []).map(String).filter((c) => evidenceIds.includes(c));
  if (shift !== 0 && !cites.length) return { ok: false, why: "uncited shift" };
  return { ok: true, shift, cites, mechanism: String(j.mechanism || "").slice(0, 300), watch: String(j.watch || "").slice(0, 200) };
}

const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const clampP = (p) => Math.min(0.995, Math.max(0.005, +p));
const pct = (p) => (Math.round(1000 * p) / 10) + "%";

// Shrink 0.5 and cap 1 logit: two cheap models move the crowd a little, with reasons, never a lot on their own.
function combine(prior, verdicts, { shrink = 0.5, cap = 1, scale = 1 } = {}) {
  const ok = verdicts.filter((v) => v && v.ok);
  if (ok.length < 2) return { p: prior, shift: 0, why: "fewer than two valid model verdicts: the crowd stands" };
  const signs = new Set(ok.map((v) => Math.sign(v.shift)));
  if (signs.size === 1 && signs.has(0)) return { p: prior, shift: 0, why: "no model found evidence the crowd has not priced: the crowd stands" };
  if (signs.size > 1) return { p: prior, shift: 0, why: signs.has(0) ? "only one model saw a reason to move: the crowd stands" : "models disagree on direction: the crowd stands" };
  const mean = ok.reduce((a, v) => a + v.shift, 0) / ok.length;
  const shift = Math.max(-cap, Math.min(cap, shrink * scale * mean));
  return { p: clampP(sigmoid(logit(clampP(prior)) + shift)), shift, why: shift === 0 ? "no evidence-backed reason to move" : "evidence-backed shift" };
}

// ---------- 7 ledger and scoring ----------
async function sha256Hex(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const brier = (p, o) => (p - o) * (p - o);
// Value added over the crowd on resolved forecasts: positive means the engine beat the price it started from.
function valueAdded(rows) {
  const r = rows.filter((x) => x.outcome === 0 || x.outcome === 1);
  if (!r.length) return { n: 0 };
  const bp = r.reduce((a, x) => a + brier(x.prior, x.outcome), 0) / r.length;
  const be = r.reduce((a, x) => a + brier(x.p, x.outcome), 0) / r.length;
  return { n: r.length, brier_prior: +bp.toFixed(4), brier_engine: +be.toFixed(4), value_added: +(bp - be).toFixed(4) };
}

// ---------- the spin-off as code: gates the ledger evaluates on itself ----------
// Each gate is computed from settled rows only; the tick consumes the verdict (it halts model spend when the engine is provably worse than the crowd),
// /api/forecasts publishes it and the page shows the next gate. Nothing waits for a reader or a decision.
function bootstrapCI(diffs, { reps = 2000, seed = 12345 } = {}) {
  if (!diffs.length) return null;
  let x = seed >>> 0;
  const rnd = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  const means = [];
  for (let r = 0; r < reps; r++) { let t = 0; for (let i = 0; i < diffs.length; i++) t += diffs[Math.floor(rnd() * diffs.length)]; means.push(t / diffs.length); }
  means.sort((a, b) => a - b);
  return { lo: means[Math.floor(0.025 * reps)], hi: means[Math.floor(0.975 * reps) - 1] };
}
const GATES = [
  { key: "prove", n: 60, need: "value added > 0 (point estimate)", test: (ci, va) => va > 0, next: "widen coverage and run on; the essay engine stays signals-only" },
  { key: "attention", n: 60, need: "95% bootstrap interval of value added above 0", test: (ci) => !!ci && ci.lo > 0, next: "publish alerts and a weekly scorecard from the ledger" },
  { key: "spin-out", n: 200, need: "95% bootstrap interval above 0 on 200+ settled", test: (ci) => !!ci && ci.lo > 0, next: "own repository, own account, data feed" },
];
// One score per question: its last forecast before it settled (re-forecasts of one question are not independent samples).
function lastPerSlug(rows) { const m = new Map(); for (const x of rows) m.set(x.slug, x); return [...m.values()]; }
function spinoffStatus(rows) {
  rows = lastPerSlug(rows);
  const r = rows.filter((x) => x.outcome === 0 || x.outcome === 1);
  const diffs = r.map((x) => brier(x.prior, x.outcome) - brier(x.p, x.outcome));
  const va = diffs.length ? diffs.reduce((a, d) => a + d, 0) / diffs.length : 0;
  const ci = bootstrapCI(diffs);
  const gates = GATES.map((g) => ({ key: g.key, n_needed: g.n, need: g.need, passed: r.length >= g.n && g.test(ci, va), next: g.next }));
  const nextGate = gates.find((g) => !g.passed) || null;
  // Provably worse than the crowd: stop paying for adjustments and publish the crowd until the evidence turns.
  const halted = r.length >= 60 && !!ci && ci.hi < 0;
  return { settled: r.length, value_added: diffs.length ? +va.toFixed(4) : null, ci95: ci ? { lo: +ci.lo.toFixed(4), hi: +ci.hi.toFixed(4) } : null, gates, next_gate: nextGate && nextGate.key, halted };
}

// ---------- the pipeline (I/O injected, so the same code runs in the cron, the tests and the demo) ----------
const MODELS = ["@cf/deepseek-ai/deepseek-v4-flash-0731", "@cf/moonshotai/kimi-k2.6"]; // two families (deepseek, moonshot)
// Thinking off: measured 2026-11-12 with this prompt, glm-5.3-flash (no switch) spent its whole 1200-token budget reasoning and
// returned no answer on 3 of 3 questions; deepseek with thinking on used ~850 output tokens for a 60-token JSON line.
// The switches are the ones q08-signal-engine measured for its fact-check (FACTCHECK-NOTHINK-1).
function noThinking(model) {
  const m = String(model).toLowerCase();
  if (m.includes("kimi") || m.includes("deepseek")) return { chat_template_kwargs: { thinking: false } };
  if (m.includes("gpt-oss")) return { reasoning: { effort: "low" } };
  return {};
}
const LIMITS = { maxUpdatesPerTick: 4, evidencePerQuestion: 6, maxTokens: 400, horizonDaysMax: 120, newsFetchPerTick: 6, newsRefetchMin: 180 };

// ---------- 3b news lane (NEWS-LANE-1, issue 11057) ----------
// On 2026-11-12 948 of 1,205 signals were Hacker News front-page stories, so Iran, Hegseth and macro questions matched nothing and were
// skipped. The question itself names what to look for: each starved family is searched by its proper entities, at most newsFetchPerTick
// families an hour, each family again only after newsRefetchMin minutes. GDELT is the first path, Google News RSS the second; either may fail alone.
const HINT = { tech: "AI chips", monetary: "interest rates", macro: "economy", "energy-geopolitics": "oil", leadership: "CEO", capital: "IPO", "officials-rules": "government" };
function newsQuery(title, category) {
  const ents = properEntities(title).filter((e) => /^[a-z0-9]/.test(e)).slice(0, 4);
  if (!ents.length) return "";
  const q = ents.join(" ");
  return q.length < 6 && HINT[category] ? q + " " + HINT[category] : q;
}
const decodeXml = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").trim();
const sqlTime = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
function parseGdelt(text) {
  let j; try { j = JSON.parse(text); } catch (e) { return null; } // GDELT answers its rate limit and query errors in plain text
  return (j.articles || []).map((a) => {
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(String(a.seendate || ""));
    return { title: String(a.title || "").trim(), url: String(a.url || ""), created_at: m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : null };
  }).filter((a) => a.title && /^https?:\/\//.test(a.url));
}
function parseNewsRss(xml) {
  const out = [];
  for (const it of String(xml || "").match(/<item>[\s\S]*?<\/item>/g) || []) {
    const tag = (n) => decodeXml((new RegExp("<" + n + "[^>]*>([\\s\\S]*?)<\\/" + n + ">").exec(it) || [])[1]);
    const t = Date.parse(tag("pubDate"));
    const title = tag("title").replace(/\s+-\s+[^-]{2,60}$/, ""); // "Headline - Publisher"
    if (title && /^https?:\/\//.test(tag("link"))) out.push({ title, url: tag("link"), created_at: Number.isFinite(t) ? sqlTime(t) : null });
  }
  return out;
}
// fetchText(url) -> { ok, status, text }. Returns { source, items, tried } with source "gdelt", "gnews" or "" when both paths came back empty.
async function fetchNews(query, fetchText) {
  const tried = [];
  try {
    const r = await fetchText("https://api.gdeltproject.org/api/v2/doc/doc?mode=artlist&format=json&maxrecords=10&sort=datedesc&timespan=7d&query=" + encodeURIComponent(query + " sourcelang:english"));
    const items = r.ok ? parseGdelt(r.text) : null;
    tried.push("gdelt:" + (items ? items.length : "error " + r.status));
    if (items && items.length) return { source: "gdelt", items, tried };
  } catch (e) { tried.push("gdelt:" + String(e && e.message || e).slice(0, 60)); }
  try {
    const r = await fetchText("https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=" + encodeURIComponent(query + " when:7d"));
    const items = r.ok ? parseNewsRss(r.text).slice(0, 10) : [];
    tried.push("gnews:" + (r.ok ? items.length : "error " + r.status));
    if (items.length) return { source: "gnews", items, tried };
  } catch (e) { tried.push("gnews:" + String(e && e.message || e).slice(0, 60)); }
  return { source: "", items: [], tried };
}
// Fetches for the starved families of one plan and stores what it found; returns the rows it added (for the re-plan) and a log.
async function newsLane(db, starved, fetchText, nowMs, { limits = LIMITS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const recent = new Set(((await db.prepare("SELECT family FROM fe_fetch WHERE fetched_at > ?").bind(new Date(nowMs - limits.newsRefetchMin * 60000).toISOString()).all()).results || []).map((r) => r.family));
  const todo = starved.filter((q) => !recent.has(q.family) && newsQuery(q.title, q.category)).slice(0, limits.newsFetchPerTick);
  const added = [], log = [];
  for (let i = 0; i < todo.length; i++) {
    const q = todo[i], query = newsQuery(q.title, q.category);
    if (i) await sleep(5500); // GDELT asks for one request every 5 seconds
    const res = await fetchNews(query, fetchText);
    let n = 0;
    for (const it of res.items) {
      const id = res.source + ":" + (await sha256Hex(it.url)).slice(0, 24);
      const row = { source: res.source, title: it.title.slice(0, 300), url: it.url.slice(0, 1000), created_at: it.created_at || sqlTime(nowMs) };
      const ins = await db.prepare("INSERT OR IGNORE INTO fe_signal (id, source, family, query, title, url, created_at) VALUES (?,?,?,?,?,?,?)").bind(id, row.source, q.family, query, row.title, row.url, row.created_at).run();
      if (ins?.meta?.changes !== 0) { added.push(row); n++; }
    }
    await db.prepare("INSERT OR REPLACE INTO fe_fetch (family, query, fetched_at, source, found) VALUES (?,?,?,?,?)").bind(q.family, query, new Date(nowMs).toISOString(), res.source || res.tried.join(","), n).run();
    log.push({ family: q.family, query, source: res.source, found: res.items.length, added: n, tried: res.tried });
  }
  return { added, log };
}

// Steps 1-4 for every candidate market: returns the questions to update this tick and why the rest were skipped.
function plan(markets, signals, lastByslug, nowMs, limits = LIMITS) {
  const kept = [], skipped = { trivial: 0, no_deadline: 0, past_or_far: 0, unchanged: 0, no_evidence: 0 };
  const starved = new Map(), coverage = {};
  const consequential = markets.filter((m) => { const c = classify(m.title); if (!c) skipped.trivial++; return !!c; });
  const legs = termStructure(consequential, nowMs);
  skipped.no_deadline = consequential.length - legs.length;
  for (const q of legs) {
    const days = (Date.parse(q.deadline) - nowMs) / 86400000;
    if (days < 1 || days > limits.horizonDaysMax) { skipped.past_or_far++; continue; }
    const c = classify(q.title);
    const evidence = matchEvidence(q, signals, { max: limits.evidencePerQuestion, sinceMs: nowMs - 21 * 86400000 });
    const cv = coverage[c.key] || (coverage[c.key] = { legs: 0, with_evidence: 0 });
    cv.legs++;
    if (!evidence.length) {
      skipped.no_evidence++;
      const s0 = starved.get(q.family);
      if (!s0 || Math.abs(days - 30) < Math.abs(s0.days - 30)) starved.set(q.family, { family: q.family, slug: q.slug, title: q.title, category: c.key, days });
      continue;
    }
    cv.with_evidence++;
    const t = needsUpdate(lastByslug[q.slug], q.prior, evidence);
    if (!t.yes) { skipped.unchanged++; continue; }
    kept.push({ ...q, category: c.key, moves: c.moves, evidence, trigger: t.why, days: Math.round(days), score: consequenceScore({ ...q, category: c.key }) });
  }
  // One leg per family per tick: the leg nearest 30 days out carries the most news signal per token.
  const best = new Map();
  for (const q of kept) { const b = best.get(q.family); if (!b || Math.abs(q.days - 30) < Math.abs(b.days - 30)) best.set(q.family, q); }
  // Q08-GROWTH-1: the update budget goes to the most consequential questions first (was: incoherent legs, then evidence count).
  const chosen = [...best.values()].sort((a, b) => (b.score - a.score) || (b.evidence.length - a.evidence.length)).slice(0, limits.maxUpdatesPerTick);
  return { chosen, skipped, candidates: markets.length, consequential: consequential.length, coverage, starved: [...starved.values()].sort((a, b) => a.days - b.days) };
}

// Steps 5-7 for one question. ask(model, prompt) -> { text, in_tok, out_tok }.
async function forecastOne(q, ask, today, opts = {}) {
  const prompt = buildPrompt(q, q.evidence, today), ids = q.evidence.map((e) => e.id);
  const answers = await Promise.all(MODELS.map(async (m) => { try { return { model: m, ...(await ask(m, prompt)) }; } catch (e) { return { model: m, text: "", error: String(e && e.message || e), in_tok: 0, out_tok: 0 }; } }));
  const verdicts = answers.map((a) => ({ model: a.model, ...parseShift(a.text, ids) }));
  const c = combine(q.prior, verdicts, opts);
  const tokens = answers.reduce((a, x) => a + (x.in_tok || 0) + (x.out_tok || 0), 0);
  return { slug: q.slug, title: q.title, deadline: q.deadline, category: q.category, moves: q.moves, quoted: q.quoted, prior: q.prior,
    incoherent: q.incoherent, age_h: q.age_h, p: c.p, shift: c.shift, why: c.why, trigger: q.trigger, evidence: q.evidence, verdicts, tokens, prompt_chars: prompt.length };
}

// ---------- D1 (q08-trades holds the ledger beside the paper-trading tables it replaces) ----------
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS fe_forecast (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, deadline TEXT, category TEXT, moves TEXT, quoted REAL, prior REAL NOT NULL, p REAL NOT NULL, shift REAL, why TEXT, trig TEXT, evidence_json TEXT, verdicts_json TEXT, tokens INTEGER, outcome INTEGER, resolved_at TEXT, prev_hash TEXT, hash TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS fe_forecast_slug ON fe_forecast(slug, id)",
  "CREATE TABLE IF NOT EXISTS fe_signal (id TEXT PRIMARY KEY, source TEXT NOT NULL, family TEXT, query TEXT, title TEXT NOT NULL, url TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS fe_signal_created ON fe_signal(created_at)",
  "CREATE TABLE IF NOT EXISTS fe_fetch (family TEXT PRIMARY KEY, query TEXT, fetched_at TEXT NOT NULL, source TEXT, found INTEGER)",
  "CREATE TABLE IF NOT EXISTS fe_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at TEXT NOT NULL, candidates INTEGER, consequential INTEGER, updated INTEGER, tokens INTEGER, skipped_json TEXT, error TEXT)",
  // VALUE-PIPELINE-1: daily closes of the financial instruments each question category moves (FRED, no key), so the page can show the market context.
  "CREATE TABLE IF NOT EXISTS fe_proxy (series TEXT NOT NULL, date TEXT NOT NULL, value REAL NOT NULL, fetched_at TEXT, PRIMARY KEY (series, date))",
  // Q08-GROWTH-1: the broadcast ledger (one post per call and per settlement), the product manager's knobs and its run log.
  "CREATE TABLE IF NOT EXISTS fe_broadcast (key TEXT PRIMARY KEY, slug TEXT NOT NULL, kind TEXT NOT NULL, thread_slug TEXT NOT NULL, queued_at TEXT NOT NULL, text TEXT, arm TEXT)",
  "CREATE TABLE IF NOT EXISTS fe_experiment (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, arm TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, start_json TEXT, end_json TEXT, score REAL)",
  "CREATE TABLE IF NOT EXISTS fe_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT, reason TEXT)",
  "CREATE TABLE IF NOT EXISTS fe_settle (slug TEXT PRIMARY KEY, checked_at TEXT NOT NULL, state TEXT)",
  "CREATE TABLE IF NOT EXISTS fe_research (id TEXT PRIMARY KEY, source TEXT, title TEXT, url TEXT, summary TEXT, seen_at TEXT, need TEXT, score REAL, status TEXT DEFAULT 'new', issue_id INTEGER, settled_at TEXT)",
  "CREATE TABLE IF NOT EXISTS fe_pm (id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at TEXT NOT NULL, metrics_json TEXT, decisions_json TEXT, filed_json TEXT)",
];
async function ensureSchema(db) { for (const s of SCHEMA) await db.prepare(s).run(); }

async function readInputs(env, nowMs) {
  if (!env.SIGNAL_DB) throw new Error("SIGNAL_DB (q08-signal) is not bound");
  const m = await env.TRADES_DB.prepare("SELECT slug, title, yes, vol24, updated_at, ends_at FROM pt_market WHERE closed = 0 AND yes > 0.01 AND yes < 0.99 AND updated_at > ?").bind(new Date(nowMs - 7 * 86400000).toISOString()).all();
  // SIGNALS-ENGINE-2 (q08-signal-engine 0.52.0): the stream now carries news feeds, GDELT and Google News searches and discovered publishers
  // beside Hacker News, arXiv and the Federal Register, so every source but repository listings is read (a repo name never matches a question).
  const s = await env.SIGNAL_DB.prepare("SELECT source, title, url, created_at FROM signal_log WHERE created_at > datetime('now','-21 days') AND source <> 'github' ORDER BY created_at DESC LIMIT 3000").all();
  const n = await env.TRADES_DB.prepare("SELECT source, title, url, created_at FROM fe_signal WHERE created_at > ? ORDER BY created_at DESC LIMIT 1500").bind(sqlTime(nowMs - 21 * 86400000)).all();
  const last = await env.TRADES_DB.prepare("SELECT f.* FROM fe_forecast f JOIN (SELECT slug, max(id) id FROM fe_forecast GROUP BY slug) l ON l.id = f.id").all();
  const lastBy = {};
  for (const r of last.results || []) lastBy[r.slug] = r;
  return { markets: m.results || [], signals: (n.results || []).concat(s.results || []), lastBy };
}

// Workers AI binding first (it takes the thinking switch); the fleet router is the second path if the binding is missing or fails.
async function workersAiAsk(env, model, prompt) {
  const body = { messages: [{ role: "user", content: prompt }], max_tokens: LIMITS.maxTokens, temperature: 0.2 };
  if (env.AI) {
    try {
      const r = await env.AI.run(model, { ...body, ...noThinking(model) });
      const msg = r?.choices?.[0]?.message || {};
      const text = r?.response ?? msg.content ?? "";
      if (String(text || "").trim()) return { text: String(text), in_tok: r?.usage?.prompt_tokens || 0, out_tok: r?.usage?.completion_tokens || 0, path: "binding" };
    } catch (e) { if (!env.QNFO_AI) throw e; }
  }
  if (!env.QNFO_AI) throw new Error("no AI path bound");
  const alias = { "@cf/deepseek-ai/deepseek-v4-flash-0731": "deepseek-v4-flash-wa", "@cf/moonshotai/kimi-k2.6": "kimi-k2.6" }[model] || model;
  const r = await env.QNFO_AI.fetch("https://qnfo-ai.internal/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: alias, ...body, max_tokens: 1500 }) });
  if (!r.ok) throw new Error("router " + r.status + " for " + alias);
  const j = await r.json();
  return { text: String(j.choices?.[0]?.message?.content || ""), in_tok: j.usage?.prompt_tokens || 0, out_tok: j.usage?.completion_tokens || 0, path: "router" };
}

async function defaultFetchText(url) {
  const r = await fetch(url, { headers: { "user-agent": "q08-forecasts/1 (+https://markets.q08.org/forecasts)", accept: "application/json, application/rss+xml, text/xml, text/csv;q=0.9, */*;q=0.5" }, signal: AbortSignal.timeout(10000) });
  return { ok: r.ok, status: r.status, text: await r.text() };
}
async function tick(env, nowMs = Date.now()) {
  await ensureSchema(env.TRADES_DB);
  const { markets, signals, lastBy } = await readInputs(env, nowMs);
  // Q08-GROWTH-1: the product manager's knobs (fe_config) override the defaults, each inside a fixed range.
  const cfg = await readConfig(env.TRADES_DB), limits = { ...LIMITS, maxUpdatesPerTick: cfg.max_updates };
  let pl = plan(markets, signals, lastBy, nowMs, limits), news = { added: [], log: [] };
  if (String(env.FE_NEWS || "on") !== "off" && pl.starved.length) {
    try {
      news = await newsLane(env.TRADES_DB, pl.starved, env.__fetchText || defaultFetchText, nowMs);
      if (news.added.length) pl = plan(markets, news.added.concat(signals), lastBy, nowMs, limits);
    } catch (e) { news.log.push({ error: String(e && e.message || e).slice(0, 200) }); }
  }
  const past = (await env.TRADES_DB.prepare("SELECT slug, prior, p, outcome FROM fe_forecast WHERE outcome IS NOT NULL ORDER BY id").all()).results || [];
  const spin = spinoffStatus(past);
  if (spin.halted) pl.chosen = []; // self-halt: the evidence says the adjustments hurt; the ledger keeps the crowd's number until it turns
  const today = new Date(nowMs).toISOString().slice(0, 10);
  let tokens = 0, updated = 0, error = null;
  for (const q of pl.chosen) {
    try {
      const f = await forecastOne(q, (m, p) => workersAiAsk(env, m, p), today, { scale: cfg.shift_scale });
      tokens += f.tokens;
      const prev = await env.TRADES_DB.prepare("SELECT hash FROM fe_forecast ORDER BY id DESC LIMIT 1").first();
      const created = new Date(nowMs).toISOString();
      const body = JSON.stringify([created, f.slug, f.prior, f.p, f.evidence.map((e) => e.url), prev?.hash || ""]);
      const hash = await sha256Hex(body);
      await env.TRADES_DB.prepare("INSERT INTO fe_forecast (created_at, slug, title, deadline, category, moves, quoted, prior, p, shift, why, trig, evidence_json, verdicts_json, tokens, prev_hash, hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(created, f.slug, f.title, f.deadline, f.category, f.moves, f.quoted, f.prior, f.p, f.shift, f.why, f.trigger, JSON.stringify(f.evidence), JSON.stringify(f.verdicts), f.tokens, prev?.hash || null, hash).run();
      updated++;
    } catch (e) { error = String(e && e.message || e).slice(0, 300); }
  }
  if (spin.halted) error = "self-halted: 95% interval of value added is below zero on " + spin.settled + " settled";
  // Q08-CLOCK-1: settlement by name first, so a market that closed and left the open feed still settles this hour.
  let settle = null;
  try { settle = await settleLane(env, env.__fetchText || defaultFetchText, nowMs); } catch (e) { settle = [{ error: String(e && e.message || e).slice(0, 160) }]; }
  // Resolution: a closed market whose YES price sits at 0 or 1 settles every forecast on it (the pilot's fetch keeps pt_market current).
  await env.TRADES_DB.prepare("UPDATE fe_forecast SET outcome = (SELECT CASE WHEN m.yes >= 0.99 THEN 1 ELSE 0 END FROM pt_market m WHERE m.slug = fe_forecast.slug), resolved_at = ? WHERE outcome IS NULL AND EXISTS (SELECT 1 FROM pt_market m WHERE m.slug = fe_forecast.slug AND m.closed = 1 AND (m.yes >= 0.99 OR m.yes <= 0.01))").bind(new Date(nowMs).toISOString()).run().catch(() => null);
  // VALUE-PIPELINE-1: score the pipeline's stages on every tick, so each stage's history is in fe_tick beside the run that produced it
  let stages = null;
  try { const sd = await storyData(env, nowMs); sd.coverage = pl.coverage; stages = stageScores(sd).map((g) => ({ key: g.key, value: g.value, n: g.n, met: g.met })); } catch (err) { stages = { error: String(err && err.message || err).slice(0, 160) }; }
  // VALUE-PIPELINE-1: refresh the financial-market proxies (at most every 6 hours per series; a failure never stops the tick).
  let proxies = null;
  if (String(env.FE_PROXY || "on") !== "off") { try { proxies = await proxyLane(env.TRADES_DB, env.__fetchText || defaultFetchText, nowMs); } catch (e) { proxies = { error: String(e && e.message || e).slice(0, 160) }; } }
  // Q08-GROWTH-1: the broadcast loop (new calls and every settlement, wins and losses, queued for the fleet's social drain) and the product
  // manager (daily: measure, adjust its knobs, file the next code change). Each fails soft and never stops the tick.
  let broadcast = null, pm = null;
  if (String(env.FE_BROADCAST || "on") !== "off") { try { broadcast = await broadcastLane(env, nowMs, cfg); } catch (e) { broadcast = { error: String(e && e.message || e).slice(0, 160) }; } }
  if (String(env.FE_PM || "on") !== "off") { try { pm = await productManager(env, nowMs); } catch (e) { pm = { error: String(e && e.message || e).slice(0, 160) }; } }
  // Q08-CLOCK-1: read the clock after this tick's writes and escalate any stage its own repair did not bring back.
  let clock = null;
  try { const c = await clockStatus(env, nowMs); clock = { on_time: c.on_time, stages: c.stages, late: c.list.filter((x) => !x.on_time).map((x) => x.key), escalated: await escalateClock(env, c, nowMs) }; } catch (e) { clock = { error: String(e && e.message || e).slice(0, 160) }; }
  await env.TRADES_DB.prepare("INSERT INTO fe_tick (ran_at, candidates, consequential, updated, tokens, skipped_json, error) VALUES (?,?,?,?,?,?,?)")
    .bind(new Date(nowMs).toISOString(), pl.candidates, pl.consequential, updated, tokens, JSON.stringify({ ...pl.skipped, coverage: pl.coverage, news: news.log, proxies, stages, broadcast, settle, clock, pm: pm && { ran: !!pm.ran, decisions: (pm.decisions || []).length, experiments: pm.experiments, filed: (pm.filed || []).length, error: pm.error } }), error).run();
  return { candidates: pl.candidates, consequential: pl.consequential, updated, tokens, skipped: pl.skipped, coverage: pl.coverage, news: news.log, chosen: pl.chosen.map((q) => ({ slug: q.slug, score: q.score })), broadcast, settle, clock, pm, error };
}

// ---------- 8 card: the page ----------
const COVER_LABEL = { tech: "Technology", monetary: "Interest rates", macro: "Economic data", leadership: "Company leadership", capital: "Deals and listings", "energy-geopolitics": "Energy and geopolitics", "officials-rules": "Officials and rules" };
function renderPage(rows, stats, head) {
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const cards = rows.map((r) => {
    const ev = JSON.parse(r.evidence_json || "[]"), vs = JSON.parse(r.verdicts_json || "[]");
    const moved = Math.round(100 * (r.p - r.prior));
    const badge = moved === 0 ? `<span class="ds-badge">With the crowd</span>` : `<span class="ds-badge ds-badge-accent">${moved > 0 ? "+" : ""}${moved} pts vs crowd</span>`;
    const mech = vs.find((v) => v.ok && v.mechanism && v.shift !== 0)?.mechanism || r.why;
    const watch = vs.find((v) => v.ok && v.watch)?.watch || "";
    return `<article class="ds-card"><div class="fe-top"><h2 class="ds-card-title">${esc(r.title)}</h2><div class="fe-p">${esc(pct(r.p))}</div></div>
<div class="ds-meta">${badge} Crowd ${esc(pct(r.prior))}${r.quoted != null && Math.abs(r.quoted - r.prior) >= 0.05 ? ` (quoted ${esc(pct(r.quoted))}, inconsistent with the other dates)` : ""} · settles ${esc(r.deadline)}</div>
<p class="fe-why">${esc(mech)}</p>
<p class="ds-muted"><b>What it moves:</b> ${esc(r.moves)}${watch ? `<br><b>Watch:</b> ${esc(watch)}` : ""}</p>
<details class="ds-more"><summary>Evidence (${ev.length}) and model verdicts</summary><div class="ds-more-body"><ul>${ev.map((e) => `<li>${esc(e.id)} <a href="${esc(e.url)}" rel="nofollow noopener">${esc(e.title)}</a> <small>${esc(e.source)}, ${esc(e.date)}</small></li>`).join("")}</ul>
<ul>${vs.map((v) => `<li><small>${esc(String(v.model).split("/").pop())}: ${v.ok ? "shift " + esc(v.shift) + " citing " + esc((v.cites || []).join(", ") || "none") : "set aside (" + esc(v.why) + ")"}</small></li>`).join("")}</ul>
<small>${esc(r.tokens)} tokens · ledger hash ${esc(String(r.hash).slice(0, 12))}</small></div></details></article>`;
  }).join("\n");
  const va = stats.value || {};
  return `<!doctype html><html lang="en"><head>${head("Q08 Forecasts", "Consequential forecasts derived from public signals, scored against the crowd.", FE_CSS + VP_CSS)}</head><body class="ds">
${siteTop("forecasts")}
<main class="ds-main"><div class="ds-head"><h1>Forecasts that move money</h1><p>Each number starts from the prediction-market crowd and moves only when fresh public signals justify it. Every forecast is scored against the crowd it started from.</p></div>
<section class="ds-stats"><div class="ds-stat"><div class="k">Open forecasts</div><div class="v">${rows.length}</div></div><div class="ds-stat"><div class="k">Tokens per forecast</div><div class="v">${stats.tokens_per ? esc(stats.tokens_per) : "–"}</div></div><div class="ds-stat"><div class="k">Value added vs crowd</div><div class="v">${va.n ? esc(va.value_added) : "–"}</div></div></section>
${va.n ? "" : `<p class="ds-note">No forecast has settled yet. Value added (crowd Brier minus engine Brier) appears here after the first settles.</p>`}
${stats.spinoff ? `<p class="ds-note">Next gate: <b>${esc(stats.spinoff.next_gate || "all passed")}</b>. ${esc((stats.spinoff.gates.find((g) => g.key === stats.spinoff.next_gate) || {}).need || "")} (${esc(stats.spinoff.settled)} settled).${stats.spinoff.halted ? " Adjustments are halted: the engine is publishing the crowd's number." : ""}</p>` : ""}
${stats.coverage ? `<details class="ds-more"><summary>Coverage: ${esc(Object.values(stats.coverage).reduce((a, c) => a + c.with_evidence, 0))} of ${esc(Object.values(stats.coverage).reduce((a, c) => a + c.legs, 0))} questions have fresh evidence</summary><div class="ds-more-body"><ul>${Object.entries(stats.coverage).map(([k, c]) => `<li>${esc(COVER_LABEL[k] || k)}: ${esc(c.with_evidence)} of ${esc(c.legs)}</li>`).join("")}</ul></div></details>` : ""}
${cards || `<div class="ds-empty"><b>No forecasts yet</b>The engine runs hourly and writes its first forecasts when a consequential question has fresh signals.</div>`}
<footer class="fe-foot"><a href="/paper">Paper-trading pilot</a><a href="/whitepaper">White paper</a><a href="/api/forecasts">Data (JSON)</a><span>Not investment advice. Paper money only.</span></footer>
</main></body></html>`;
}
const FE_CSS = ".fe-top{display:flex;gap:12px;justify-content:space-between;align-items:flex-start}.fe-p{font-size:28px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--ds-accent)}.fe-why{margin:10px 0 6px}.fe-foot{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:24px;font-size:14px;color:var(--ds-ink-2)}.fe-foot a{display:inline-flex;align-items:center;min-height:44px}";

async function latestRows(env) {
  await ensureSchema(env.TRADES_DB);
  const r = await env.TRADES_DB.prepare("SELECT f.* FROM fe_forecast f JOIN (SELECT slug, max(id) id FROM fe_forecast GROUP BY slug) l ON l.id = f.id WHERE f.outcome IS NULL AND f.deadline >= date('now') ORDER BY abs(f.p - f.prior) DESC, f.id DESC LIMIT 40").all();
  const all = await env.TRADES_DB.prepare("SELECT slug, prior, p, outcome, tokens FROM fe_forecast ORDER BY id").all();
  const rows = all.results || [];
  const tok = rows.length ? Math.round(rows.reduce((a, x) => a + (x.tokens || 0), 0) / rows.length) : 0;
  const lt = await env.TRADES_DB.prepare("SELECT skipped_json FROM fe_tick ORDER BY id DESC LIMIT 1").first().catch(() => null);
  let coverage = null; try { coverage = JSON.parse(lt?.skipped_json || "{}").coverage || null; } catch (e) { coverage = null; }
  const src = await env.TRADES_DB.prepare("SELECT source, count(*) n FROM fe_signal WHERE created_at > datetime('now','-21 days') GROUP BY source").all().catch(() => ({ results: [] }));
  return { rows: r.results || [], stats: { value: valueAdded(lastPerSlug(rows)), spinoff: spinoffStatus(rows), tokens_per: tok, total: rows.length, coverage, news_signals: Object.fromEntries((src.results || []).map((x) => [x.source, x.n])) } };
}


// ---------- 9 value: signal -> forecast -> edge -> value, in the open (VALUE-PIPELINE-1) ----------
// The owner's question (2026-11-12): how does a forecast become money, and where is that shown? The answer is computed here from the ledger,
// never written by hand: every forecast that disagrees with the crowd opens one simulated position at the crowd's price at that moment
// (the side the forecast favours, a fixed stake), held to resolution with no hindsight exit and marked to the live market until then.
// A forecast that agrees with the crowd holds no position: there is no edge to trade. Paper only: no order, wallet or account exists.
const STAKE = 100, MIN_EDGE = 0.02, QUOTE_TOL = 0.2;
const r2 = (x) => Math.round(x * 100) / 100;
function simulateBook(rows, yesBySlug = {}, { stake = STAKE, minEdge = MIN_EDGE } = {}) {
  const first = new Map(), last = new Map();
  for (const r of rows || []) { last.set(r.slug, r); if (!first.has(r.slug) && Math.abs(r.p - r.prior) >= minEdge) first.set(r.slug, r); }
  const positions = [];
  for (const [slug, e] of first) {
    const l = last.get(slug), side = e.p > e.prior ? "YES" : "NO";
    const entry = side === "YES" ? e.prior : 1 - e.prior, belief = side === "YES" ? e.p : 1 - e.p;
    const outcome = l.outcome === 0 || l.outcome === 1 ? Number(l.outcome) : null;
    // The entry is the crowd's coherent price (the term structure repaired across the question's dates). The live quote marks the position only while it agrees
    // with that structure: an illiquid leg can print 15 cents one hour and 99.95 the next (Jensen Huang, 2026-11-12), so a quote more than QUOTE_TOL from the
    // ledger's latest coherent price is set aside and the ledger price marks the position instead (mark_source says which).
    const rawLive = Number.isFinite(+yesBySlug[slug]) ? +yesBySlug[slug] : null;
    const live = rawLive != null && Math.abs(rawLive - l.prior) <= QUOTE_TOL ? rawLive : null;
    const yesNow = outcome != null ? outcome : live != null ? live : l.prior;
    const mark = side === "YES" ? yesNow : 1 - yesNow, shares = stake / entry, value = shares * mark;
    positions.push({ slug, title: e.title, category: e.category, side, opened_at: e.created_at, deadline: e.deadline, crowd_at_entry: +e.prior.toFixed(4), forecast_at_entry: +e.p.toFixed(4),
      forecast_now: +l.p.toFixed(4), entry: +entry.toFixed(4), mark: +mark.toFixed(4), marked_live: outcome == null && live != null, mark_source: outcome != null ? "outcome" : live != null ? "live quote" : rawLive != null ? "ledger (live quote " + Math.round(100 * rawLive) + "¢ incoherent)" : "ledger", settled: outcome != null, outcome, stake, shares: +shares.toFixed(2),
      value: r2(value), pnl: r2(value - stake), expected_pnl: r2(stake * (belief / entry - 1)) });
  }
  positions.sort((a, b) => Number(a.settled) - Number(b.settled) || Math.abs(b.pnl) - Math.abs(a.pnl));
  const sum = (f) => r2(positions.reduce((a, x) => a + f(x), 0)), settled = positions.filter((x) => x.settled);
  const staked = positions.length * stake, pnl = sum((x) => x.pnl);
  return { stake, min_edge: minEdge, positions, totals: { positions: positions.length, open: positions.length - settled.length, settled: settled.length,
    wins: settled.filter((x) => x.pnl > 0).length, losses: settled.filter((x) => x.pnl <= 0).length, staked, value: sum((x) => x.value), pnl,
    realized: r2(settled.reduce((a, x) => a + x.pnl, 0)), unrealized: r2(positions.filter((x) => !x.settled).reduce((a, x) => a + x.pnl, 0)),
    return_pct: staked ? r2((100 * pnl) / staked) : null, expected_pnl_at_entry: sum((x) => x.expected_pnl),
    with_crowd: new Set((rows || []).map((r) => r.slug)).size - positions.length } };
}

// Financial-market transmission: each question category moves an instrument; FRED's public CSV gives its daily close (no key).
// Shown as context beside the prediction-market position, never as a position of its own.
const PROXIES = {
  monetary: { id: "DGS2", name: "2-year Treasury yield", unit: "%" },
  macro: { id: "DGS10", name: "10-year Treasury yield", unit: "%" },
  "energy-geopolitics": { id: "DCOILBRENTEU", name: "Brent crude oil", unit: "$/bbl" },
  leadership: { id: "NASDAQ100", name: "Nasdaq-100 index", unit: "" },
  capital: { id: "SP500", name: "S&P 500 index", unit: "" },
  "officials-rules": { id: "DGS10", name: "10-year Treasury yield", unit: "%" },
  tech: { id: "NASDAQ100", name: "Nasdaq-100 index", unit: "" },
};
function parseFredCsv(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/).slice(1)) {
    const [d, v] = line.split(",");
    if (/^\d{4}-\d{2}-\d{2}$/.test(d || "") && v != null && v.trim() !== "." && Number.isFinite(+v)) out.push({ date: d, value: +v });
  }
  return out;
}
async function proxyLane(db, fetchText, nowMs, { maxAgeMin = 360, days = 120 } = {}) {
  const ids = [...new Set(Object.values(PROXIES).map((p) => p.id))], log = [];
  const since = new Date(nowMs - days * 86400000).toISOString().slice(0, 10), iso = new Date(nowMs).toISOString();
  for (const id of ids) {
    const last = await db.prepare("SELECT max(fetched_at) t FROM fe_proxy WHERE series = ?").bind(id).first().catch(() => null);
    if (last && last.t && nowMs - Date.parse(last.t) < maxAgeMin * 60000) { log.push({ id, skipped: "fresh" }); continue; }
    try {
      const r = await fetchText("https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + id + "&cosd=" + since);
      const pts = r && r.ok ? parseFredCsv(r.text) : [];
      for (const pt of pts) await db.prepare("INSERT OR REPLACE INTO fe_proxy (series, date, value, fetched_at) VALUES (?,?,?,?)").bind(id, pt.date, pt.value, iso).run();
      log.push({ id, status: r && r.status, points: pts.length });
    } catch (e) { log.push({ id, error: String(e && e.message || e).slice(0, 120) }); }
  }
  return log;
}
// The instrument's move from the last close on or before the forecast to the latest close.
function proxyMove(points, sinceIso) {
  if (!points || !points.length) return null;
  const d = String(sinceIso || "").slice(0, 10), sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const now = sorted[sorted.length - 1], start = [...sorted].reverse().find((x) => x.date <= d) || sorted[0];
  return { start_date: start.date, start: start.value, now_date: now.date, now: now.value, change: +(now.value - start.value).toFixed(3), change_pct: start.value ? +((100 * (now.value - start.value)) / start.value).toFixed(2) : null };
}
// The q08 reports about the same question: pieces whose title or concept names one of its proper entities.
function relatedPieces(title, pieces, max = 2) {
  const proper = properEntities(title).filter((e) => e.length >= 4 || /^[a-z]{3}$/.test(e));
  if (!proper.length) return [];
  const has = (t, e) => new RegExp("\\b" + e.replace(/[.$-]/g, "\\$&") + "\\b", "i").test(t);
  return (pieces || []).map((p) => ({ p, n: proper.filter((e) => has((p.title || "") + " " + (p.core_concept || ""), e)).length })).filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || String(b.p.published_at).localeCompare(String(a.p.published_at))).slice(0, max)
    .map((x) => ({ title: x.p.title, url: Q08_ORIGIN + "/p/" + x.p.slug, date: String(x.p.published_at || "").slice(0, 10) }));
}
const Q08_ORIGIN = "https://q08.org", MARKETS_ORIGIN = "https://markets.q08.org";
const safe = async (f, d) => { try { return await f(); } catch (e) { return d; } };
const all = (db, sql, ...b) => safe(async () => ((await db.prepare(sql).bind(...b).all()).results || []), []);
// Everything the pipeline pages and q08.org's front door show, read from D1 in one place; every read fails soft so a page always renders.
async function storyData(env, nowMs = Date.now()) {
  const db = env && env.TRADES_DB, sig = env && env.SIGNAL_DB, out = { generated_at: new Date(nowMs).toISOString(), stake: STAKE };
  if (!db) return { ...out, empty: true };
  await safe(() => ensureSchema(db));
  const rows = await all(db, "SELECT id, created_at, slug, title, deadline, category, moves, prior, p, outcome FROM fe_forecast ORDER BY id");
  const slugs = [...new Set(rows.map((r) => r.slug))];
  const px = slugs.length ? await all(db, `SELECT slug, yes, closed, updated_at FROM pt_market WHERE slug IN (${slugs.map(() => "?").join(",")})`, ...slugs) : []; // standards-ok: only "?" placeholders are interpolated
  const book = simulateBook(rows, Object.fromEntries(px.map((m) => [m.slug, m.yes])));
  const open = lastPerSlug(rows).filter((r) => r.outcome == null && r.deadline >= out.generated_at.slice(0, 10));
  const edges = open.map((r) => Math.abs(r.p - r.prior));
  // signals: the q08 stream (news feeds, searches, HN, arXiv, Federal Register) plus the engine's own news lane, last 7 days
  const s7 = sig ? await all(sig, "SELECT source, count(*) n FROM signal_log WHERE created_at > datetime('now','-7 days') GROUP BY source") : [];
  const n7 = await all(db, "SELECT source, count(*) n FROM fe_signal WHERE created_at > datetime('now','-7 days') GROUP BY source");
  const bySource = {}; for (const x of s7.concat(n7)) bySource[x.source] = (bySource[x.source] || 0) + x.n;
  const pieces = sig ? await all(sig, "SELECT slug, title, core_concept, published_at FROM published_pieces WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at DESC LIMIT 150") : [];
  const proxyRows = await all(db, "SELECT series, date, value FROM fe_proxy WHERE date > date('now','-150 days') ORDER BY series, date");
  const series = {}; for (const x of proxyRows) (series[x.series] = series[x.series] || []).push({ date: x.date, value: x.value });
  const firstAt = {}; for (const r of rows) if (!firstAt[r.slug]) firstAt[r.slug] = r.created_at;
  const posBy = Object.fromEntries(book.positions.map((p) => [p.slug, p]));
  // Q08-GROWTH-1: lead with the most consequential questions, then the widest gap from the market.
  const forecasts = open.map((r) => ({ r, score: consequenceScore(r) })).sort((a, b) => (b.score + 5 * Math.abs(b.r.p - b.r.prior)) - (a.score + 5 * Math.abs(a.r.p - a.r.prior))).map(({ r, score }) => {
    const pr = PROXIES[r.category], mv = pr ? proxyMove(series[pr.id], firstAt[r.slug]) : null;
    return { slug: r.slug, title: r.title, category: r.category, deadline: r.deadline, crowd: +r.prior.toFixed(4), forecast: +r.p.toFixed(4), edge_pts: Math.round(100 * (r.p - r.prior)), moves: r.moves, score, url: MARKETS_ORIGIN + "/f/" + r.slug, registered_at: firstAt[r.slug],
      market_url: "https://polymarket.com/market/" + r.slug, position: posBy[r.slug] || null, proxy: pr && mv ? { ...pr, ...mv } : pr ? { ...pr } : null, related: relatedPieces(r.title, pieces) };
  });
  // the paper-trading pilot (its own estimator, now off) and its scored record, losses included
  const acct = await safe(() => db.prepare("SELECT cash, start_cash FROM pt_account WHERE id = 1").first(), null);
  const openPos = await all(db, "SELECT p.qty, p.entry, p.side, m.yes FROM pt_position p LEFT JOIN pt_market m ON m.slug = p.slug WHERE p.closed_at IS NULL");
  const closed = await all(db, "SELECT slug, title, side, entry, exit, pnl, strategy, opened_at, closed_at, reason FROM pt_position WHERE closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 50");
  const curve = (await all(db, "SELECT ts, equity FROM pt_equity ORDER BY ts DESC LIMIT 2016")).reverse();
  const est = await all(db, "SELECT fair, market, outcome FROM pt_estimate WHERE outcome IN (0,1) AND fair IS NOT NULL AND market IS NOT NULL");
  let pilot = null;
  if (acct) {
    const markOpen = openPos.reduce((a, p) => a + p.qty * (p.yes == null ? p.entry : String(p.side).toLowerCase() === "yes" ? p.yes : 1 - p.yes), 0);
    const equity = acct.cash + markOpen, realized = closed.reduce((a, x) => a + (x.pnl || 0), 0);
    pilot = { start: acct.start_cash, equity: r2(equity), return_pct: r2((equity / acct.start_cash - 1) * 100), realized: r2(realized), open: openPos.length, closed: closed.length,
      wins: closed.filter((x) => x.pnl > 0).length, losses: closed.filter((x) => !(x.pnl > 0)).length, trades: closed, curve: curve.map((c) => ({ ts: c.ts, equity: r2(c.equity) })) };
  }
  const estimator = est.length ? { n: est.length, brier_model: +(est.reduce((a, x) => a + brier(x.fair, x.outcome), 0) / est.length).toFixed(4), brier_market: +(est.reduce((a, x) => a + brier(x.market, x.outcome), 0) / est.length).toFixed(4) } : { n: 0 };
  const lt = await safe(() => db.prepare("SELECT skipped_json FROM fe_tick ORDER BY id DESC LIMIT 1").first(), null);
  let coverage = null; try { coverage = JSON.parse((lt && lt.skipped_json) || "{}").coverage || null; } catch (err) { coverage = null; }
  const res = { ...out, coverage, signals: { last_7d: Object.values(bySource).reduce((a, n) => a + n, 0), by_source: bySource, reports: pieces.length, latest_reports: pieces.slice(0, 6).map((p) => ({ title: p.title, url: Q08_ORIGIN + "/p/" + p.slug, date: String(p.published_at || "").slice(0, 10) })) },
    forecasts: { open: open.length, disagree: open.filter((r) => Math.abs(r.p - r.prior) >= MIN_EDGE).length, mean_edge_pts: edges.length ? r2((100 * edges.reduce((a, x) => a + x, 0)) / edges.length) : null, list: forecasts },
    value_added: valueAdded(lastPerSlug(rows)), spinoff: spinoffStatus(rows), book, pilot, estimator };
  res.stages = stageScores(res);
  res.clock = await safe(() => clockStatus(env, nowMs), null);
  res.pm = await safe(() => pmStatus(env, nowMs), null);
  const settledRows = lastPerSlug(rows).filter((r) => r.outcome === 0 || r.outcome === 1);
  res.record = { settled: settledRows.length, right_side: settledRows.filter((r) => callOf(r).right_side).length, beat_market: settledRows.filter((r) => callOf(r).beat_crowd === true).length, ledger_url: MARKETS_ORIGIN + "/ledger" };
  return res;
}


// Each stage is an input -> output function with a scored target (owner 2026-11-12: "signal to value with forecasting in the middle").
// The scores are computed from the same rows as the pages, published in /api/story and recorded on every engine tick (fe_tick.skipped_json.stages).
const STAGE_TARGETS = [
  { key: "signal", name: "Signals in", input: "public news, searches, filings and research", output: "evidence matched to each market question", metric: "coverage", target: 0.8, unit: "share of questions with fresh evidence", loop: "a question without evidence triggers a targeted news fetch (news lane)" },
  { key: "forecast", name: "Forecasts out", input: "the crowd's price and the matched evidence", output: "one probability per question", metric: "value_added", target: 0, unit: "crowd Brier minus forecast Brier on settled questions", loop: "the engine halts its adjustments when the 95% interval is below zero" },
  { key: "edge", name: "Edge vs the market", input: "the forecast and the live price", output: "a side and a price gap", metric: "mean_edge_pts", target: 2, unit: "points of disagreement on open forecasts; a gap under the spread cannot be captured", loop: "positions open only at 2 points or more" },
  { key: "value", name: "Value captured", input: "simulated positions at the market price", output: "profit and loss", metric: "settled_return_pct", target: 0, unit: "return on settled positions, %", loop: "the track record recomputes every position from the ledger" },
];
function stageScores(d) {
  const cov = d.coverage ? Object.values(d.coverage) : [], legs = cov.reduce((a, c) => a + (c.legs || 0), 0);
  const t = ((d.book || {}).totals) || {}, va = d.value_added || {};
  const val = { signal: legs ? +(cov.reduce((a, c) => a + (c.with_evidence || 0), 0) / legs).toFixed(3) : null, forecast: va.n ? va.value_added : null,
    edge: (d.forecasts || {}).mean_edge_pts ?? null, value: t.settled ? r2((100 * t.realized) / (t.settled * ((d.book || {}).stake || STAKE))) : null };
  const n = { signal: legs, forecast: va.n || 0, edge: (d.forecasts || {}).open || 0, value: t.settled || 0 };
  return STAGE_TARGETS.map((g) => ({ ...g, value: val[g.key], n: n[g.key], met: val[g.key] == null ? null : g.key === "forecast" || g.key === "value" ? val[g.key] > g.target : val[g.key] >= g.target }));
}

// ---------- 10 the pages: one story, one navigation across q08.org and markets.q08.org ----------
const NAV = [["pipeline", Q08_ORIGIN + "/", "Pipeline"], ["forecasts", MARKETS_ORIGIN + "/", "Forecasts"], ["ledger", MARKETS_ORIGIN + "/ledger", "Ledger"], ["track", MARKETS_ORIGIN + "/track-record", "Track record"], ["reports", Q08_ORIGIN + "/#reports", "Signal reports"], ["paper", MARKETS_ORIGIN + "/paper", "Paper desk"]];
function siteTop(active) {
  return `<header class="ds-top"><div class="ds-top-in"><a class="ds-brand" href="${Q08_ORIGIN}/">q08 <span class="ds-muted vp-tag">signal to value</span></a><nav class="vp-nav" aria-label="q08">${NAV.map(([k, h, l]) => `<a href="${h}"${k === active ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav></div></header>`;
}
const VP_CSS = ".vp-tag{font-weight:400;font-size:14px}.vp-nav{display:flex;gap:2px 14px;flex-wrap:wrap;justify-content:flex-end}.vp-nav a{display:inline-flex;align-items:center;min-height:44px;font-size:15px;color:var(--ds-ink-2);text-decoration:none}.vp-nav a[aria-current=page]{color:var(--ds-ink);font-weight:650}"
  + ".vp-flow{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin:0 0 16px;counter-reset:st}.vp-step{background:var(--ds-surface);border:1px solid var(--ds-line);border-radius:var(--ds-r-m);padding:12px 14px;text-decoration:none;color:var(--ds-ink);display:block}.vp-step .k{font-size:14px;color:var(--ds-ink-2);font-weight:600}.vp-step .v{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums;margin:2px 0}.vp-step p{font-size:14px;color:var(--ds-ink-2);margin:0}.vp-step .vp-t{margin-top:8px;padding-top:8px;border-top:1px solid var(--ds-line)}"
  + ".vp-pos{margin:8px 0 4px;padding:10px 12px;border-radius:var(--ds-r-m);background:var(--ds-surface-2);font-size:15px}.vp-tbl{width:100%;border-collapse:collapse;font-size:15px}.vp-tbl th,.vp-tbl td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--ds-line);vertical-align:top}.vp-tbl td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.vp-wrap{overflow-x:auto}.vp-spark{width:100%;height:80px;color:var(--ds-accent)}"
  + "@media (max-width:640px){.vp-nav{display:none}}";
const e = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const usd = (x) => (x == null || !Number.isFinite(+x) ? "–" : (x < 0 ? "−$" : "$") + Math.abs(+x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const signed = (x) => (x == null ? "–" : (x > 0 ? "+" : "") + usd(x));
const tone = (x) => (x > 0 ? "ds-good" : x < 0 ? "ds-bad" : "");
// The four stages with their live numbers; shared by the markets page and, through /api/story, by q08.org's front door.
const fmtStage = (g) => g.value == null ? "–" : g.key === "signal" ? Math.round(100 * g.value) + "%" : g.key === "value" ? g.value + "%" : String(g.value);
function targetLine(d, key) {
  const g = (d.stages || stageScores(d)).find((x) => x.key === key);
  const want = key === "signal" ? Math.round(100 * g.target) + "% or more" : key === "edge" ? g.target + " points or more" : "above " + g.target;
  return `<p class="vp-t">Target ${e(want)} · now ${e(fmtStage(g))} · ${g.met == null ? "<span>awaiting data</span>" : g.met ? '<span class="ds-good">met</span>' : '<span class="ds-bad">missed</span>'}</p>`;
}
function flowHtml(d, base = "") {
  const s = d.signals || {}, f = d.forecasts || {}, b = (d.book || {}).totals || {}, pl = d.pilot;
  return `<div class="vp-flow">
<a class="vp-step" href="${Q08_ORIGIN}/#reports"><div class="k">1 · Signals in</div><div class="v">${e(s.last_7d != null ? s.last_7d.toLocaleString("en-US") : "–")}</div><p>public signals read in 7 days from ${e(Object.keys(s.by_source || {}).length)} source types: news, searches, filings, research</p>${targetLine(d, "signal")}</a>
<a class="vp-step" href="${MARKETS_ORIGIN}/#forecasts"><div class="k">2 · Forecasts out</div><div class="v">${e(f.open != null ? f.open : "–")}</div><p>live probabilities on real Polymarket questions that move money</p>${targetLine(d, "forecast")}</a>
<a class="vp-step" href="${MARKETS_ORIGIN}/#forecasts"><div class="k">3 · Edge vs the market</div><div class="v">${e(f.disagree != null ? f.disagree : "–")}</div><p>forecasts that disagree with the crowd${f.mean_edge_pts != null ? `, ${e(f.mean_edge_pts)} points on average` : ""}; the rest agree and hold no position</p>${targetLine(d, "edge")}</a>
<a class="vp-step" href="${MARKETS_ORIGIN}/track-record"><div class="k">4 · Value captured</div><div class="v ${tone(b.pnl)}">${b.positions ? e(signed(b.pnl)) : "–"}</div><p>${b.positions ? `simulated P&amp;L on ${e(b.positions)} position${b.positions === 1 ? "" : "s"} of ${e(usd(d.stake))}` : "no position yet: one opens when a forecast leaves the crowd"}${pl ? `; paper desk ${e(signed(pl.equity - pl.start))}` : ""}</p>${targetLine(d, "value")}</a>
</div>`;
}
function posLine(pos) {
  if (!pos) return `<div class="vp-pos">No position: the forecast agrees with the market, so there is no edge to trade.</div>`;
  return `<div class="vp-pos"><b>Simulated position:</b> buy ${e(pos.side)} at ${e(Math.round(pos.entry * 100))}¢ with ${e(usd(pos.stake))} on ${e(String(pos.opened_at).slice(0, 10))}. ${pos.settled ? "Settled" : pos.marked_live ? "Marked to the market now" : "Marked at the crowd's coherent price (the live quote is out of line with the question's other dates)"} at ${e(Math.round(pos.mark * 100))}¢: <b class="${tone(pos.pnl)}">${e(signed(pos.pnl))}</b>. If the forecast is right on average, expected ${e(signed(pos.expected_pnl))}.</div>`;
}
function proxyLine(px) {
  if (!px) return "";
  if (px.now == null) return `<p class="ds-muted"><b>Financial market:</b> ${e(px.name)} (data loading).</p>`;
  return `<p class="ds-muted"><b>Financial market:</b> ${e(px.name)} ${e(px.now)}${e(px.unit === "%" ? "%" : px.unit ? " " + px.unit : "")} on ${e(px.now_date)}, ${px.change >= 0 ? "+" : ""}${e(px.change)}${px.unit === "%" ? " points" : ""} since this forecast opened (${e(px.start_date)}). Context for where the same question is priced outside prediction markets, not a position.</p>`;
}
function storyBody(d) {
  const list = ((d.forecasts || {}).list || []);
  const cards = list.map((f) => `<article class="ds-card" id="${e(f.slug)}"><div class="fe-top"><h3 class="ds-card-title"><a href="/f/${e(f.slug)}">${e(f.title)}</a></h3><div class="fe-p">${e(pct(f.forecast))}</div></div>
<div class="ds-meta">${f.edge_pts ? `<span class="ds-badge ds-badge-accent">${f.edge_pts > 0 ? "+" : ""}${e(f.edge_pts)} pts vs crowd</span>` : `<span class="ds-badge">With the crowd</span>`} Crowd ${e(pct(f.crowd))} · settles ${e(f.deadline)} · <a href="${e(f.market_url)}" rel="nofollow noopener">market</a></div>
${posLine(f.position)}
<p class="ds-muted"><b>What it moves:</b> ${e(f.moves)}</p>${proxyLine(f.proxy)}
${f.related && f.related.length ? `<p class="ds-muted"><b>Signal reports on q08.org:</b> ${f.related.map((r) => `<a href="${e(r.url)}">${e(r.title)}</a>`).join(" · ")}</p>` : ""}</article>`).join("\n");
  return cards || `<div class="ds-empty"><b>No forecasts yet</b>The engine runs hourly and writes one when a consequential market question has fresh signals.</div>`;
}
function renderStory(d, head) {
  const b = (d.book || {}).totals || {};
  return `<!doctype html><html lang="en"><head>${head("q08: signal to value", "Public signals become forecasts on real prediction markets; every forecast's edge is priced and tracked as a simulated position, losses included.", FE_CSS + VP_CSS + GROWTH_CSS)}</head><body class="ds">
${siteTop("forecasts")}
<main class="ds-main"><div class="ds-head"><h1>Signals in. Forecasts out. Value measured.</h1><p>Funds and trading desks turn signals into forecasts and forecasts into positions behind closed doors. q08 runs that loop live and in the open: every signal, every forecast, every simulated position and every loss is on this page and in the <a href="/api/story">data</a>. Every forecast is <a href="/ledger">pre-registered</a> before its event.</p></div>
${heroHtml(d)}
${flowHtml(d)}
${clockHtml(d.clock)}
<p class="ds-note">How the value is captured: when a forecast leaves the market price, the side it favours is bought at that price. If the forecast is better calibrated than the crowd, those positions earn money on average; if not, they lose it, and the <a href="/track-record">track record</a> shows which. ${b.positions ? "" : "No forecast has left the crowd yet, so the book is empty."}</p>
<h2 id="forecasts">Forecasts that move money</h2>
${storyBody(d)}
${portfolioHtml()}
<footer class="fe-foot"><a href="/ledger">Ledger</a><a href="/track-record">Track record</a><a href="${Q08_ORIGIN}/#reports">Signal reports</a><a href="/paper">Paper desk</a><a href="/whitepaper">White paper</a><a href="/api/story">Data (JSON)</a><span>Simulated positions only. Not investment advice.</span></footer>
</main></body></html>`;
}
// The lead call: the most consequential open forecast that leaves the market, as a headline with its numbers, its hash and its settle date.
function heroHtml(d) {
  const list = ((d.forecasts || {}).list || []), f = list.find((x) => x.edge_pts) || list[0];
  if (!f) return "";
  const r = d.record || {};
  return `<section class="vp-hero" aria-label="Lead call"><div class="k">Lead call · pre-registered ${e(String(f.registered_at || "").slice(0, 10))}${r.settled ? ` · record so far: ${e(r.right_side)} of ${e(r.settled)} settled on the right side` : ""}</div>
<h2><a href="/f/${e(f.slug)}">${e(f.title)}</a></h2><div class="n"><div><b>${e(pct(f.forecast))}</b><span>q08</span></div><div><b>${e(pct(f.crowd))}</b><span>the market</span></div><div><b>${e(f.deadline)}</b><span>settles</span></div></div>
<p class="ds-muted">${e(f.moves)} <a href="/f/${e(f.slug)}">From signal to settlement</a>.</p></section>`;
}
function pmHtml(pm) {
  if (!pm || !pm.runs) return "";
  const last = pm.runs[0];
  const kd = last ? (last.decisions || []).filter((x) => x.from !== undefined) : [];
  return `<h2>Product loop</h2><p class="ds-muted">A product manager runs inside the pipeline once a day: it reads its own numbers (${e(pm.questions ?? "–")} questions, ${e(pm.settled ?? 0)} settled, signal coverage ${e(pm.coverage == null ? "–" : Math.round(100 * pm.coverage) + "%")}, ${e(pm.broadcasts_7d ?? 0)} broadcasts this week${pm.traffic ? `, ${e(pm.traffic.pageviews_7d)} page views` : ""}), turns its own knobs (updates an hour: ${e(pm.config && pm.config.max_updates)}, posts a day: ${e(pm.config && pm.config.broadcast_per_day)}) and files the next growth or repair change for the fleet's code loop. Growth targets: ${(pm.growth || []).map((g) => `${e(g.name)} ${g.value == null ? "–" : e(g.value)} against ${e(g.target)} ${g.met == null ? "(no data yet)" : g.met ? "(met)" : "(missed)"}`).join("; ")}. ${(pm.experiments || [])[0] ? `Experiment running: ${e(pm.experiments[0].key)}, arm ${e(pm.experiments[0].arm)}.` : ""} ${last ? `Last run ${e(String(last.ran_at).slice(0, 16).replace("T", " "))} UTC: ${e(kd.length)} knob change${kd.length === 1 ? "" : "s"}${kd.length ? " (" + e(kd.map((x) => x.key + " " + x.from + "→" + x.to).join(", ")) + ")" : ""}, ${e(last.filed.filter((x) => x.new).length)} change filed.` : "First run within the day."} <a href="/api/pm">Its data</a>.</p>`;
}
function spark(curve) {
  if (!curve || curve.length < 2) return "";
  const v = curve.map((c) => c.equity), lo = Math.min(...v), hi = Math.max(...v), w = 600, h = 80, k = (hi - lo) || 1;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - 4 - ((y - lo) / k) * (h - 8)).toFixed(1)}`).join(" ");
  return `<svg class="vp-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Paper desk equity from ${e(usd(v[0]))} to ${e(usd(v[v.length - 1]))}"><polyline fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" points="${pts}"/></svg>`;
}
function renderTrackRecord(d, head) {
  const bk = d.book || { positions: [], totals: {} }, t = bk.totals || {}, pl = d.pilot, es = d.estimator || {}, va = d.value_added || {};
  const prow = (p) => `<tr><td><a href="/f/${e(p.slug)}">${e(p.title)}</a><br><small>${e(String(p.opened_at).slice(0, 10))} · forecast ${e(pct(p.forecast_at_entry))} vs crowd ${e(pct(p.crowd_at_entry))}</small></td><td>${e(p.side)} @ ${e(Math.round(p.entry * 100))}¢</td><td class="n">${e(Math.round(p.mark * 100))}¢${p.settled ? " settled" : ""}</td><td class="n ${tone(p.pnl)}">${e(signed(p.pnl))}</td></tr>`;
  const trow = (x) => `<tr><td>${e(x.title || x.slug)}<br><small>${e(String(x.opened_at || "").slice(0, 10))} to ${e(String(x.closed_at || "").slice(0, 10))} · ${e(x.reason || x.strategy || "")}</small></td><td>${e(String(x.side || "").toUpperCase())} @ ${e(Math.round((x.entry || 0) * 100))}¢</td><td class="n">${x.exit == null ? "–" : e(Math.round(x.exit * 100)) + "¢"}</td><td class="n ${tone(x.pnl)}">${e(signed(x.pnl))}</td></tr>`;
  const table = (rows, f) => `<div class="vp-wrap"><table class="vp-tbl"><thead><tr><th>Question</th><th>Bought</th><th>Now</th><th>P&amp;L</th></tr></thead><tbody>${rows.map(f).join("")}</tbody></table></div>`;
  return `<!doctype html><html lang="en"><head>${head("q08 track record", "Every simulated position the q08 forecasts took against real prediction markets, marked live, losses included.", FE_CSS + VP_CSS + GROWTH_CSS)}</head><body class="ds">
${siteTop("track")}
<main class="ds-main"><div class="ds-head"><h1>Track record</h1><p>What the forecasts would have made or lost, recomputed from the hash-chained ledger on every visit. Wins and losses both stay on this page.</p></div>
<section class="ds-stats"><div class="ds-stat"><div class="k">Forecast book P&amp;L</div><div class="v ${tone(t.pnl)}">${t.positions ? e(signed(t.pnl)) : "–"}</div></div><div class="ds-stat"><div class="k">Positions (open / settled)</div><div class="v">${e(t.open || 0)} / ${e(t.settled || 0)}</div></div><div class="ds-stat"><div class="k">Settled wins / losses</div><div class="v">${e(t.wins || 0)} / ${e(t.losses || 0)}</div></div><div class="ds-stat"><div class="k">Value added vs crowd</div><div class="v">${va.n ? e(va.value_added) : "–"}</div></div></section>
<h2>The pipeline's targets</h2><div class="vp-wrap"><table class="vp-tbl"><thead><tr><th>Stage</th><th>Input → output</th><th>Target</th><th>Now</th></tr></thead><tbody>${(d.stages || []).map((g) => `<tr><td>${e(g.name)}</td><td>${e(g.input)} → ${e(g.output)}<br><small>${e(g.unit)}. Loop: ${e(g.loop)}.</small></td><td class="n">${e(g.key === "signal" ? Math.round(100 * g.target) + "%" : g.target)}</td><td class="n ${g.met == null ? "" : g.met ? "ds-good" : "ds-bad"}">${e(fmtStage(g))}${g.met == null ? " (no data yet)" : ""}</td></tr>`).join("")}</tbody></table></div>
<h2>Forecast book</h2><p class="ds-muted">One ${e(usd(bk.stake || STAKE))} position per forecast that moved at least ${e(Math.round(100 * (bk.min_edge || MIN_EDGE)))} points from the market, bought at the market price at that moment, held to resolution. ${e(t.with_crowd || 0)} forecast${t.with_crowd === 1 ? "" : "s"} agree with the crowd and hold nothing. Expected P&amp;L at entry, if the forecasts are right: ${e(signed(t.expected_pnl_at_entry))}.</p>
${bk.positions && bk.positions.length ? table(bk.positions, prow) : `<div class="ds-empty"><b>No position yet</b>The first one opens the hour a forecast moves away from the market price.</div>`}
<h2>Paper desk</h2>${pl ? `<p class="ds-muted">The earlier pilot: ${e(usd(pl.start))} of simulated money traded by a price-blind estimator. Equity now ${e(usd(pl.equity))} (${e(pl.return_pct)}%), realized ${e(signed(pl.realized))} on ${e(pl.closed)} closed trades (${e(pl.wins)} won, ${e(pl.losses)} lost), ${e(pl.open)} open.</p>${spark(pl.curve)}${pl.trades.length ? table(pl.trades.slice(0, 20), trow) : ""}` : `<div class="ds-empty"><b>No paper desk data</b>The pilot's account appears after its first tick.</div>`}
<h2>Accuracy against the crowd</h2><p class="ds-muted">${es.n ? `The pilot's estimator, scored on ${e(es.n)} resolved questions: Brier ${e(es.brier_model)} against ${e(es.brier_market)} for the market price (lower is better). ${es.brier_model > es.brier_market ? "The market was more accurate, so the estimator was switched off and the current engine starts from the market price and moves only on cited signals." : "The estimator beat the market price."}` : "No resolved estimates yet."} ${va.n ? `Current engine on ${e(va.n)} settled: Brier ${e(va.brier_engine)} vs crowd ${e(va.brier_prior)}.` : "The current engine has no settled forecast yet; its score appears here when the first market resolves."}</p>
${clockHtml(d.clock)}
${pmHtml(d.pm)}
${portfolioHtml()}
<footer class="fe-foot"><a href="/">Forecasts</a><a href="/ledger">Ledger</a><a href="/api/pm">Product loop (JSON)</a><a href="/api/story">Data (JSON)</a><span>Simulated positions only. Not investment advice.</span></footer>
</main></body></html>`;
}

// ---------- 11 growth: pre-registration you can check, the pipeline to the event, broadcast, a product manager (Q08-GROWTH-1) ----------
// Owner 2026-11-12: "pre-register things and admit when we get things wrong ... show how that pipeline completes itself through to the event",
// "promote the hell out of it", and "is there a Q08 markets product manager that's thinking about how to plus this?". All of it is code below.

// Portfolio doors on every q08 forecast page (the explore rail carries the same catalog on the QNFO side, so the links run both ways).
const PORTFOLIO = [
  ["Ultrastable", "https://ultrastable.io/", "the autonomous platform this whole pipeline runs on"],
  ["QNFO research", "https://qnfo.org/", "the open research imprint behind the method"],
  ["Paper library", "https://papers.qnfo.org/papers", "every paper open, versioned and citable"],
  ["Live fleet", "https://fleet.qnfo.org/", "watch the system that runs q08 work in real time"],
];
function portfolioHtml() {
  return `<section class="vp-port" aria-label="More from the same system"><h2>Built by the same system</h2><div class="vp-port-g">${PORTFOLIO.map(([t, u, d]) => `<a href="${u}?utm_source=markets.q08.org&amp;utm_medium=portfolio&amp;utm_campaign=q08-growth"><b>${e(t)}</b><span>${e(d)}</span></a>`).join("")}</div></section>`;
}
const GROWTH_CSS = ".vp-port{margin:32px 0 8px}.vp-port-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}.vp-port-g a{display:block;min-height:44px;padding:12px 14px;border:1px solid var(--ds-line);border-radius:var(--ds-r-m);text-decoration:none;color:var(--ds-ink)}.vp-port-g a span{display:block;font-size:14px;color:var(--ds-ink-2);margin-top:2px}"
  + ".vp-hero{margin:4px 0 20px;padding:18px;border:1px solid var(--ds-line);border-radius:var(--ds-r-l);background:var(--ds-surface)}.vp-hero .k{font-size:14px;color:var(--ds-ink-2);font-weight:600}.vp-hero h2{margin:6px 0 8px;font-size:24px;line-height:1.25}.vp-hero h2 a{color:var(--ds-ink);text-decoration:none}.vp-hero .n{display:flex;gap:20px;flex-wrap:wrap;font-variant-numeric:tabular-nums}.vp-hero .n b{display:block;font-size:30px}.vp-hero .n span{font-size:14px;color:var(--ds-ink-2)}"
  + ".vp-steps{list-style:none;padding:0;margin:8px 0 16px;border-left:2px solid var(--ds-line)}.vp-steps li{padding:6px 0 10px 16px;position:relative}.vp-steps li b{display:block}.vp-steps li span{font-size:15px;color:var(--ds-ink-2)}.vp-hash{font-family:ui-monospace,monospace;font-size:14px;word-break:break-all}";

// The engine's call on a settled question, both ways it can be scored: did it pick the right side, and did it beat the price it started from.
function callOf(r) {
  if (!r || !(r.outcome === 0 || r.outcome === 1)) return null;
  const o = Number(r.outcome), right = (r.p >= 0.5 ? 1 : 0) === o, be = brier(r.p, o), bc = brier(r.prior, o);
  return { outcome: o, right_side: right, beat_crowd: be < bc - 1e-9 ? true : be > bc + 1e-9 ? false : null, brier: +be.toFixed(4), brier_crowd: +bc.toFixed(4) };
}
function verdictText(c) {
  if (!c) return "open";
  const side = c.right_side ? "right side" : "wrong side";
  return c.beat_crowd === true ? side + ", beat the market" : c.beat_crowd === false ? side + ", the market did better" : side + ", same as the market";
}

// Pre-registration check: every ledger row's hash is recomputed from what it committed to, and each row must point at the row before it.
// The recipe is public: sha256 of JSON [created_at, slug, prior, p, evidence urls, prev_hash or ""].
async function verifyLedger(rows) {
  let prev = "", ok = 0;
  const broken = [];
  for (const r of rows || []) {
    let urls = [];
    try { urls = JSON.parse(r.evidence_json || "[]").map((x) => x.url); } catch (err) { urls = []; }
    const h = await sha256Hex(JSON.stringify([r.created_at, r.slug, r.prior, r.p, urls, r.prev_hash || ""]));
    const linked = (r.prev_hash || "") === prev, sealed = h === r.hash;
    if (linked && sealed) ok++; else broken.push({ id: r.id, sealed, linked });
    prev = r.hash || "";
  }
  return { rows: (rows || []).length, ok, intact: broken.length === 0, broken: broken.slice(0, 20), head: prev || null,
    recipe: "sha256(JSON.stringify([created_at, slug, prior, p, evidence urls in order, prev_hash or \"\"]))" };
}

// Financial sensitivity: how big the instrument's move since the forecast is against its own typical daily move.
// Yields move in points, indexes and oil in percent; z is the move over sqrt(trading days) typical moves.
function proxySensitivity(points, sinceIso, unit) {
  if (!points || points.length < 15) return null;
  const s = [...points].sort((a, b) => a.date.localeCompare(b.date)), ch = [];
  const step = (a, b) => (unit === "%" ? b - a : (100 * (b - a)) / a);
  for (let i = 1; i < s.length; i++) if (s[i - 1].value) ch.push(step(s[i - 1].value, s[i].value));
  const m = ch.reduce((a, x) => a + x, 0) / ch.length, sd = Math.sqrt(ch.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, ch.length - 1));
  const d = String(sinceIso || "").slice(0, 10), i0 = Math.max(0, s.findLastIndex((x) => x.date <= d)), days = Math.max(1, s.length - 1 - i0);
  const move = step(s[i0].value, s[s.length - 1].value);
  return { daily_sd: +sd.toFixed(3), move: +move.toFixed(3), days, z: sd ? +(move / (sd * Math.sqrt(days))).toFixed(2) : null, unit: unit === "%" ? "points" : "%" };
}
// Prediction-market sensitivity: the other live questions about the same names, so a reader sees what else reprices when this one moves.
function relatedMarkets(title, slug, markets, max = 5) {
  const proper = properEntities(title).filter((x) => x.length >= 4), fam = familyKey(title);
  if (!proper.length) return [];
  const has = (t, x) => new RegExp("\\b" + x.replace(/[.$-]/g, "\\$&") + "\\b", "i").test(t);
  return (markets || []).filter((m) => m.slug !== slug && familyKey(m.title) !== fam && !TRIVIAL.test(m.title) && proper.some((x) => has(m.title, x)))
    .sort((a, b) => (+b.vol24 || 0) - (+a.vol24 || 0)).slice(0, max)
    .map((m) => ({ slug: m.slug, title: m.title, yes: m.yes == null ? null : +(+m.yes).toFixed(3), vol24: Math.round(+m.vol24 || 0), url: "https://polymarket.com/market/" + m.slug }));
}

// One question, end to end: the signals, the pre-registered entries with their hashes, the markets it moves, and how it settles.
async function forecastData(env, slug, nowMs = Date.now()) {
  const db = env && env.TRADES_DB;
  if (!db || !slug) return null;
  await safe(() => ensureSchema(db));
  const rows = await all(db, "SELECT * FROM fe_forecast WHERE slug = ? ORDER BY id", slug);
  if (!rows.length) return null;
  const last = rows[rows.length - 1], first = rows[0];
  const mk = await safe(() => db.prepare("SELECT slug, title, yes, vol24, closed, ends_at, updated_at FROM pt_market WHERE slug = ?").bind(slug).first(), null);
  const open = await all(db, "SELECT slug, title, yes, vol24 FROM pt_market WHERE closed = 0 AND yes > 0.01 AND yes < 0.99 ORDER BY vol24 DESC LIMIT 400");
  const pr = PROXIES[last.category] || null;
  const pts = pr ? await all(db, "SELECT date, value FROM fe_proxy WHERE series = ? ORDER BY date", pr.id) : [];
  const pieces = env.SIGNAL_DB ? await all(env.SIGNAL_DB, "SELECT slug, title, core_concept, published_at FROM published_pieces WHERE slug NOT IN (SELECT slug FROM q08_retractions) ORDER BY published_at DESC LIMIT 150") : [];
  const book = simulateBook(rows, mk && mk.yes != null ? { [slug]: mk.yes } : {});
  let ev = [], vs = [];
  try { ev = JSON.parse(last.evidence_json || "[]"); vs = JSON.parse(last.verdicts_json || "[]"); } catch (err) { ev = []; vs = []; }
  const mv = pr ? proxyMove(pts, first.created_at) : null;
  return {
    slug, title: last.title, category: last.category, moves: last.moves, deadline: last.deadline, score: consequenceScore({ title: last.title, category: last.category, prior: last.prior, vol24: mk && mk.vol24 }),
    forecast: +last.p.toFixed(4), crowd: +last.prior.toFixed(4), live_quote: mk && mk.yes != null ? +(+mk.yes).toFixed(4) : null, market_closed: !!(mk && mk.closed), market_url: "https://polymarket.com/market/" + slug,
    call: callOf(last), position: book.positions[0] || null,
    entries: rows.map((r) => ({ id: r.id, at: r.created_at, crowd: +r.prior.toFixed(4), forecast: +r.p.toFixed(4), trigger: r.trig, hash: r.hash, prev_hash: r.prev_hash, tokens: r.tokens })),
    evidence: ev, verdicts: vs.map((v) => ({ model: String(v.model || "").split("/").pop(), ok: !!v.ok, shift: v.shift, cites: v.cites || [], mechanism: v.mechanism || "", watch: v.watch || "" })),
    related_markets: relatedMarkets(last.title, slug, open), related_reports: relatedPieces(last.title, pieces, 4),
    proxy: pr ? { ...pr, ...(mv || {}), sensitivity: proxySensitivity(pts, first.created_at, pr.unit) } : null,
    resolution: { source: "Polymarket market " + slug, rule: "settles when the market closes at 0 or 1; the engine reads the closed price and scores its last forecast against the crowd's price at that moment", by: last.deadline },
    generated_at: new Date(nowMs).toISOString(),
  };
}
function sensLine(px) {
  if (!px) return "";
  const s = px.sensitivity;
  const base = px.now == null ? `${e(px.name)} (data loading)` : `${e(px.name)} ${e(px.now)}${e(px.unit === "%" ? "%" : px.unit ? " " + px.unit : "")} on ${e(px.now_date)}`;
  return `<p><b>Financial market:</b> ${base}.${s ? ` Typical daily move ${e(s.daily_sd)} ${e(s.unit)}; since this forecast was pre-registered it moved ${s.move >= 0 ? "+" : ""}${e(s.move)} ${e(s.unit)} over ${e(s.days)} trading day${s.days === 1 ? "" : "s"}, ${e(s.z == null ? "–" : Math.abs(s.z))} typical moves ${s.z >= 0 ? "up" : "down"}.` : ""} Context for how the same question is priced outside prediction markets, not a position.</p>`;
}
function renderForecast(d, head) {
  const c = d.call, pos = d.position, last = d.entries[d.entries.length - 1], first = d.entries[0];
  const steps = [
    ["Signals matched", `${d.evidence.length} public signal${d.evidence.length === 1 ? "" : "s"} matched to the question by name${d.related_reports.length ? `, ${d.related_reports.length} q08 signal report${d.related_reports.length === 1 ? "" : "s"}` : ""}.`],
    ["Pre-registered", `${e(String(first.at).replace("T", " ").slice(0, 16))} UTC, ledger hash <span class="vp-hash">${e(String(first.hash).slice(0, 16))}</span>, before the event.`],
    ["Updated in the open", `${d.entries.length} entr${d.entries.length === 1 ? "y" : "ies"}, each chained to the one before; the latest at ${e(String(last.at).replace("T", " ").slice(0, 16))} UTC.`],
    ["Settles on the event", `${e(d.resolution.rule)}; due by ${e(d.deadline)}. <a href="${e(d.market_url)}" rel="nofollow noopener">The market</a>.`],
    ["Scored in public", c ? `Outcome ${c.outcome ? "YES" : "NO"}: ${e(verdictText(c))} (Brier ${e(c.brier)} vs ${e(c.brier_crowd)}). It stays on the <a href="/ledger">ledger</a> either way.` : "Open. When it settles, the result is posted and kept here and on the ledger, right or wrong."],
  ];
  const ev = d.evidence.map((x) => `<li>${e(x.id)} <a href="${e(x.url)}" rel="nofollow noopener">${e(x.title)}</a> <small>${e(x.source)}, ${e(x.date)}</small></li>`).join("");
  const why = (d.verdicts.find((v) => v.ok && v.mechanism && v.shift !== 0) || {}).mechanism || "";
  const watch = (d.verdicts.find((v) => v.ok && v.watch) || {}).watch || "";
  const edge = Math.round(100 * (d.forecast - d.crowd));
  return `<!doctype html><html lang="en"><head>${head(d.title + " · q08 forecast", "q08 " + pct(d.forecast) + " vs market " + pct(d.crowd) + ". Pre-registered, hash-chained and scored in public when it settles.", FE_CSS + VP_CSS + GROWTH_CSS)}</head><body class="ds">
${siteTop("forecasts")}
<main class="ds-main"><div class="ds-head"><h1>${e(d.title)}</h1><p>${c ? "Settled. " + e(verdictText(c)) + "." : `q08 says <b>${e(pct(d.forecast))}</b>; the market says ${e(pct(d.crowd))}${edge ? ` (${edge > 0 ? "+" : ""}${e(edge)} points)` : ", so q08 agrees with it"}. Settles by ${e(d.deadline)}.`}</p></div>
<section class="ds-stats"><div class="ds-stat"><div class="k">q08 forecast</div><div class="v">${e(pct(d.forecast))}</div></div><div class="ds-stat"><div class="k">Market (coherent)</div><div class="v">${e(pct(d.crowd))}</div></div><div class="ds-stat"><div class="k">Simulated P&amp;L</div><div class="v ${tone(pos && pos.pnl)}">${pos ? e(signed(pos.pnl)) : "no position"}</div></div></section>
${why ? `<p class="fe-why">${e(why)}</p>` : ""}<p class="ds-muted"><b>What it moves:</b> ${e(d.moves)}${watch ? `<br><b>Watch:</b> ${e(watch)}` : ""}</p>
${sensLine(d.proxy)}
<h2>From signal to settlement</h2><ol class="vp-steps">${steps.map(([k, v]) => `<li><b>${e(k)}</b><span>${v}</span></li>`).join("")}</ol>
${d.related_markets.length ? `<h2>Markets that reprice with it</h2><div class="vp-wrap"><table class="vp-tbl"><thead><tr><th>Question</th><th>Yes</th><th>24h volume</th></tr></thead><tbody>${d.related_markets.map((m) => `<tr><td><a href="${e(m.url)}" rel="nofollow noopener">${e(m.title)}</a></td><td class="n">${e(pct(m.yes))}</td><td class="n">${e(usd(m.vol24).replace(".00", ""))}</td></tr>`).join("")}</tbody></table></div>` : ""}
${d.related_reports.length ? `<h2>Signal reports on q08.org</h2><ul>${d.related_reports.map((r) => `<li><a href="${e(r.url)}">${e(r.title)}</a> <small>${e(r.date)}</small></li>`).join("")}</ul>` : ""}
<details class="ds-more"><summary>Evidence (${d.evidence.length}) and the models' verdicts</summary><div class="ds-more-body"><ul>${ev}</ul><ul>${d.verdicts.map((v) => `<li><small>${e(v.model)}: ${v.ok ? "shift " + e(v.shift) + " citing " + e(v.cites.join(", ") || "none") : "set aside"}</small></li>`).join("")}</ul></div></details>
<details class="ds-more"><summary>Every pre-registered entry (${d.entries.length})</summary><div class="ds-more-body"><div class="vp-wrap"><table class="vp-tbl"><thead><tr><th>When (UTC)</th><th>q08</th><th>Market</th><th>Hash</th></tr></thead><tbody>${[...d.entries].reverse().map((x) => `<tr><td>${e(String(x.at).replace("T", " ").slice(0, 16))}<br><small>${e(x.trigger || "")}</small></td><td class="n">${e(pct(x.forecast))}</td><td class="n">${e(pct(x.crowd))}</td><td class="vp-hash">${e(String(x.hash).slice(0, 12))}</td></tr>`).join("")}</tbody></table></div></div></details>
${portfolioHtml()}
<footer class="fe-foot"><a href="/">All forecasts</a><a href="/ledger">Ledger</a><a href="/track-record">Track record</a><a href="/api/f/${e(d.slug)}">Data (JSON)</a><span>Simulated positions only. Not investment advice.</span></footer>
</main></body></html>`;
}

// The ledger: every entry with its hash, the chain check, and every settled call with its verdict, misses first.
async function ledgerData(env, nowMs = Date.now(), limit = 200) {
  const db = env && env.TRADES_DB;
  if (!db) return { empty: true, generated_at: new Date(nowMs).toISOString() };
  await safe(() => ensureSchema(db));
  const rows = await all(db, "SELECT id, created_at, slug, title, deadline, category, prior, p, evidence_json, outcome, resolved_at, prev_hash, hash FROM fe_forecast ORDER BY id");
  const chain = await verifyLedger(rows);
  const settled = lastPerSlug(rows).filter((r) => r.outcome === 0 || r.outcome === 1).map((r) => ({ slug: r.slug, title: r.title, deadline: r.deadline, resolved_at: r.resolved_at, forecast: +r.p.toFixed(4), crowd: +r.prior.toFixed(4), ...callOf(r) }))
    .sort((a, b) => Number(a.right_side) - Number(b.right_side) || String(b.resolved_at).localeCompare(String(a.resolved_at)));
  const n = settled.length, right = settled.filter((x) => x.right_side).length, beat = settled.filter((x) => x.beat_crowd === true).length, worse = settled.filter((x) => x.beat_crowd === false).length;
  const today = new Date(nowMs).toISOString().slice(0, 10), due = lastPerSlug(rows).filter((r) => r.deadline && r.deadline < today);
  return { generated_at: new Date(nowMs).toISOString(), chain, questions: new Set(rows.map((r) => r.slug)).size, entries: rows.length,
    record: { settled: n, right_side: right, wrong_side: n - right, beat_market: beat, market_better: worse, due: due.length, awaiting_settlement: due.filter((r) => r.outcome == null).length, value_added: valueAdded(lastPerSlug(rows)) },
    settled, latest: rows.slice(-limit).reverse().map((r) => ({ id: r.id, at: r.created_at, slug: r.slug, title: r.title, forecast: +r.p.toFixed(4), crowd: +r.prior.toFixed(4), hash: r.hash, prev_hash: r.prev_hash })) };
}
function renderLedger(d, head) {
  const c = d.chain || { rows: 0, intact: true }, r = d.record || {};
  return `<!doctype html><html lang="en"><head>${head("q08 ledger", "Every q08 forecast, pre-registered and hash-chained before its event, and every settled call scored, misses included.", FE_CSS + VP_CSS + GROWTH_CSS)}</head><body class="ds">
${siteTop("ledger")}
<main class="ds-main"><div class="ds-head"><h1>The ledger</h1><p>Every forecast is written here before its event, chained by hash to the one before, and scored when the event settles. Wrong calls stay. The chain was ${c.rows ? (c.intact ? '<b class="ds-good">checked intact</b>' : '<b class="ds-bad">found broken</b>') : "empty"} on this visit${c.rows ? `: ${e(c.ok)} of ${e(c.rows)} entries recompute` : ""}.</p></div>
<section class="ds-stats"><div class="ds-stat"><div class="k">Pre-registered entries</div><div class="v">${e(d.entries || 0)}</div></div><div class="ds-stat"><div class="k">Settled: right / wrong side</div><div class="v">${e(r.right_side || 0)} / ${e(r.wrong_side || 0)}</div></div><div class="ds-stat"><div class="k">Beat the market / did worse</div><div class="v">${e(r.beat_market || 0)} / ${e(r.market_better || 0)}</div></div></section>
${r.awaiting_settlement ? `<p class="ds-note">${e(r.awaiting_settlement)} question${r.awaiting_settlement === 1 ? " is" : "s are"} past the deadline and waiting for the market to close; each is scored the hour it does.</p>` : ""}
<h2>Settled calls, misses first</h2>${d.settled && d.settled.length ? `<div class="vp-wrap"><table class="vp-tbl"><thead><tr><th>Question</th><th>Outcome</th><th>q08 / market</th><th>Verdict</th></tr></thead><tbody>${d.settled.map((x) => `<tr><td><a href="/f/${e(x.slug)}">${e(x.title)}</a><br><small>settled ${e(String(x.resolved_at || "").slice(0, 10))}</small></td><td>${x.outcome ? "YES" : "NO"}</td><td class="n">${e(pct(x.forecast))} / ${e(pct(x.crowd))}</td><td class="${x.right_side ? "ds-good" : "ds-bad"}">${e(verdictText(x))}</td></tr>`).join("")}</tbody></table></div>` : `<div class="ds-empty"><b>Nothing has settled yet</b>The first verdict appears here the hour its market closes, right or wrong.</div>`}
<h2>Latest entries</h2>${d.latest && d.latest.length ? `<div class="vp-wrap"><table class="vp-tbl"><thead><tr><th>When (UTC)</th><th>Question</th><th>q08 / market</th><th>Hash ← previous</th></tr></thead><tbody>${d.latest.slice(0, 60).map((x) => `<tr><td>${e(String(x.at).replace("T", " ").slice(0, 16))}</td><td><a href="/f/${e(x.slug)}">${e(x.title)}</a></td><td class="n">${e(pct(x.forecast))} / ${e(pct(x.crowd))}</td><td class="vp-hash">${e(String(x.hash).slice(0, 10))} ← ${e(String(x.prev_hash || "genesis").slice(0, 10))}</td></tr>`).join("")}</tbody></table></div>` : `<div class="ds-empty"><b>No entries yet</b>The engine writes its first entry the hour a consequential question has fresh signals.</div>`}
<h2>Check it yourself</h2><p class="ds-muted">Each hash is ${e(c.recipe || "")}. Download every entry from <a href="/api/ledger">/api/ledger</a>, recompute, and compare. Each broadcast post carries the first 12 characters of its entry's hash, so a third party holds a timestamped copy.</p>
${portfolioHtml()}
<footer class="fe-foot"><a href="/">Forecasts</a><a href="/track-record">Track record</a><a href="/api/ledger">Ledger (JSON)</a><span>Simulated positions only. Not investment advice.</span></footer>
</main></body></html>`;
}

// ---------- broadcast: calls and settlements become posts in the fleet's social drain ----------
// qnfo-social drains qnfo-audit.social_threads (status queued, flagged selected) to Bluesky, Mastodon, LinkedIn, X and Substack with the
// fleet's existing credentials, adds the AI marker, probes the link and records engagement. This lane only writes the rows.
const BROADCAST = { perDayDefault: 3, maxLen: 260 };
function fitTitle(title, room) {
  const t = String(title || "").trim();
  if (t.length <= room) return t;
  const c = t.slice(0, Math.max(10, room - 1)), sp = c.lastIndexOf(" ");
  return (sp > room * 0.5 ? c.slice(0, sp) : c).replace(/[\s,;:.\-]+$/, "") + "…";
}
const FORMATS = ["registered-first", "number-first"];
function broadcastText(kind, r, url, maxLen = BROADCAST.maxLen, format = FORMATS[0]) {
  const tail = (s) => s + " " + url;
  let f;
  if (kind === "settled") {
    const c = callOf(r);
    f = (t) => `Settled: ${t} ${c.outcome ? "YES" : "NO"}. q08 had ${pct(r.p)}, the market ${pct(r.prior)}: ${verdictText(c)}. Pre-registered, kept on the record either way.`;
  } else {
    const d = Math.round(100 * (r.p - r.prior));
    f = format === "number-first"
      ? (t) => `q08 ${pct(r.p)}, market ${pct(r.prior)}: ${t} q08 disagrees by ${Math.abs(d)} points, on the record before the event (ledger ${String(r.hash || "").slice(0, 12)}). Settles ${r.deadline}.`
      : (t) => `Pre-registered: ${t} q08 ${pct(r.p)} vs market ${pct(r.prior)} (${d > 0 ? "+" : ""}${d} pts). Settles ${r.deadline}; scored in public, misses included. Ledger ${String(r.hash || "").slice(0, 12)}`;
  }
  const fixed = tail(f("")).length;
  return tail(f(fitTitle(r.title, Math.max(20, maxLen - fixed))));
}
async function broadcastLane(env, nowMs, cfg = {}) {
  const db = env.TRADES_DB;
  if (!env.AUDIT) return { skipped: "no AUDIT binding" };
  const perDay = Math.max(0, Math.min(6, Number(cfg.broadcast_per_day ?? BROADCAST.perDayDefault)));
  const sent = await db.prepare("SELECT count(*) n FROM fe_broadcast WHERE queued_at > ?").bind(new Date(nowMs - 86400000).toISOString()).first();
  let room = perDay - ((sent && sent.n) || 0);
  if (room <= 0) return { skipped: "daily cap", per_day: perDay };
  const done = new Set(((await db.prepare("SELECT key FROM fe_broadcast").all()).results || []).map((x) => x.key));
  const rows = lastPerSlug((await db.prepare("SELECT id, created_at, slug, title, deadline, category, prior, p, outcome, hash FROM fe_forecast ORDER BY id").all()).results || []);
  const today = new Date(nowMs).toISOString().slice(0, 10);
  // Settlements first, wins and losses alike (accountability is the brand); then the most consequential open calls that leave the market.
  const cands = rows.filter((r) => (r.outcome === 0 || r.outcome === 1) && !done.has("settled:" + r.slug)).map((r) => ({ kind: "settled", r, score: 9 }))
    .concat(rows.filter((r) => r.outcome == null && r.deadline >= today && Math.abs(r.p - r.prior) >= MIN_EDGE && !done.has("call:" + r.slug))
      .map((r) => ({ kind: "call", r, score: consequenceScore(r) + Math.abs(r.p - r.prior) * 5 })))
    .sort((a, b) => b.score - a.score);
  const queued = [];
  for (const c of cands) {
    if (room <= 0) break;
    const tslug = "q08-mk-" + c.kind + "-" + (await sha256Hex(c.kind + ":" + c.r.slug)).slice(0, 10);
    const arm = FORMATS.includes(cfg.broadcast_format) ? cfg.broadcast_format : FORMATS[0];
    const text = broadcastText(c.kind, c.r, MARKETS_ORIGIN + "/f/" + c.r.slug, BROADCAST.maxLen, arm);
    const ins = await env.AUDIT.prepare("INSERT OR IGNORE INTO social_threads (slug, title, posts, status, flags, notes, created_at) VALUES (?,?,?,'queued','selected',?,datetime('now'))")
      .bind(tslug, String(c.r.title).slice(0, 200), JSON.stringify([text]), "selected: q08 markets broadcast (Q08-GROWTH-1, " + c.kind + ")").run();
    await db.prepare("INSERT OR IGNORE INTO fe_broadcast (key, slug, kind, thread_slug, queued_at, text, arm) VALUES (?,?,?,?,?,?,?)").bind(c.kind + ":" + c.r.slug, c.r.slug, c.kind, tslug, new Date(nowMs).toISOString(), text, arm).run();
    queued.push({ kind: c.kind, slug: c.r.slug, thread: tslug, inserted: ins?.meta?.changes !== 0 });
    room--;
  }
  return { per_day: perDay, candidates: cands.length, queued };
}

// ---------- the product manager: measure, adjust its own knobs, file the next code change, check last time's call ----------
const PM_KNOBS = {
  max_updates: { def: LIMITS.maxUpdatesPerTick, min: 2, max: 8 },
  broadcast_per_day: { def: BROADCAST.perDayDefault, min: 1, max: 6 },
};
async function readConfig(db) {
  const out = { broadcast_format: FORMATS[0], shift_scale: 1 };
  for (const [k, v] of Object.entries(PM_KNOBS)) out[k] = v.def;
  try {
    for (const r of ((await db.prepare("SELECT key, value FROM fe_config").all()).results || [])) {
      const k = PM_KNOBS[r.key], n = Number(r.value);
      if (k && Number.isFinite(n)) out[r.key] = Math.max(k.min, Math.min(k.max, Math.round(n)));
    }
    const ss = Number(((await db.prepare("SELECT value FROM fe_config WHERE key = 'shift_scale'").first()) || {}).value);
    if (Number.isFinite(ss)) out.shift_scale = Math.max(0, Math.min(2, ss));
    const f = ((await db.prepare("SELECT value FROM fe_config WHERE key = 'broadcast_format'").first()) || {}).value;
    out.broadcast_format = FORMATS.includes(f) ? f : FORMATS[0];
  } catch (err) { out.broadcast_format = FORMATS[0]; }
  return out;
}
async function pmMetrics(env, nowMs) {
  const db = env.TRADES_DB, iso = (ms) => new Date(ms).toISOString(), today = iso(nowMs).slice(0, 10);
  const rows = (await db.prepare("SELECT slug, title, created_at, deadline, category, prior, p, outcome, tokens FROM fe_forecast ORDER BY id").all()).results || [];
  const last = lastPerSlug(rows), wk = rows.filter((r) => r.created_at > iso(nowMs - 7 * 86400000));
  const due = last.filter((r) => r.deadline && r.deadline < today), settled = last.filter((r) => r.outcome === 0 || r.outcome === 1);
  const open = last.filter((r) => r.outcome == null && r.deadline >= today);
  const lt = await safe(() => db.prepare("SELECT skipped_json FROM fe_tick ORDER BY id DESC LIMIT 1").first(), null);
  let cov = null; try { const c = Object.values(JSON.parse((lt && lt.skipped_json) || "{}").coverage || {}); const legs = c.reduce((a, x) => a + x.legs, 0); cov = legs ? +(c.reduce((a, x) => a + x.with_evidence, 0) / legs).toFixed(3) : null; } catch (err) { cov = null; }
  const b7 = await safe(() => db.prepare("SELECT count(*) n FROM fe_broadcast WHERE queued_at > ?").bind(iso(nowMs - 7 * 86400000)).first(), { n: 0 });
  let posts = null, traffic = null, portfolio = null;
  if (env.AUDIT) {
    posts = await safe(async () => Object.fromEntries((((await env.AUDIT.prepare("SELECT status, count(*) n FROM social_threads WHERE slug LIKE 'q08-mk-%' AND created_at > datetime('now','-14 days') GROUP BY status").all()).results) || []).map((x) => [x.status, x.n])), null);
    traffic = await safe(async () => {
      const r = await env.AUDIT.prepare("SELECT sum(CASE WHEN date > date('now','-7 days') THEN value ELSE 0 END) w, sum(CASE WHEN date <= date('now','-7 days') THEN value ELSE 0 END) pw FROM reach_signals WHERE source = 'cf-rum-human' AND metric = 'pageviews' AND entity_type = 'host' AND entity_id = 'markets.q08.org' AND date > date('now','-14 days')").first();
      return r ? { pageviews_7d: r.w || 0, pageviews_prev_7d: r.pw || 0 } : null;
    }, null);
    // Cross-portfolio: clicks from q08 pages into QNFO and Ultrastable (the gateway's UTM ledger, utm_source=markets.q08.org or q08.org).
    portfolio = await safe(async () => { const r = await env.AUDIT.prepare("SELECT sum(value) v FROM reach_signals WHERE source = 'utm' AND metric = 'clicks_human' AND channel IN ('markets.q08.org','q08.org','q08') AND date > date('now','-7 days')").first(); return (r && r.v) || 0; }, null);
  }
  const sp = spinoffStatus(rows), va = valueAdded(last);
  return { at: iso(nowMs), forecasts_7d: wk.length, questions: last.length, open: open.length, disagree: open.filter((r) => Math.abs(r.p - r.prior) >= MIN_EDGE).length,
    due: due.length, settled: settled.length, unresolved_overdue: due.filter((r) => r.outcome == null).length, resolution_rate: due.length ? +(due.filter((r) => r.outcome != null).length / due.length).toFixed(3) : null,
    right_side: settled.filter((r) => callOf(r).right_side).length, value_added: va.n ? va.value_added : null, halted: !!sp.halted,
    coverage: cov, tokens_per_forecast_7d: wk.length ? Math.round(wk.reduce((a, r) => a + (r.tokens || 0), 0) / wk.length) : null,
    mean_consequence_open: open.length ? +(open.reduce((a, r) => a + consequenceScore(r), 0) / open.length).toFixed(3) : null,
    broadcasts_7d: (b7 && b7.n) || 0, posts, traffic, portfolio_clicks_7d: portfolio,
    calibration: reliabilityBins(last), shift_scale: shiftScaleFit(rows) };
}
// Code levers: when a metric says the product is short, the PM files one issue a run for the fleet's code loop, with the file, an anchor and a
// probe that closes it when the metric recovers. Knob levers are applied directly (bounded, logged, reverted by deleting the fe_config row).
const CT = "code-task: repo=qnfo-workers path=q08-prediction-markets/forecast-engine.mjs";
const PROBE = (contains) => `runtime-probe: {"url": "https://markets.q08.org/api/pm", "status": 200, "contains": "${contains}"}`;
const PM_LEVERS = [
  { key: "Q08-PM-RESOLVE-1", when: (m) => m.unresolved_overdue > 0, priority: "high",
    title: (m) => `Q08-PM-RESOLVE-1: ${m.unresolved_overdue} q08 forecast question(s) past the deadline are not settled`,
    body: (m) => `The q08 markets product manager measured ${m.due} questions past their deadline and ${m.settled} settled. A pre-registered call that never settles cannot be scored, so the track record stalls. Read the closed state for the deadline-passed slugs (pt_market is only refreshed for listed markets): fetch each overdue slug from the Gamma API by slug inside tick and settle it.\n${CT}\ncode-anchor: export async function tick(env, nowMs = Date.now()) {\nAfter editing run node q08-prediction-markets/inline-forecast-engine.mjs so worker.js carries the module.\n${PROBE('\\"unresolved_overdue\\":0')}` },
  { key: "Q08-PM-COVERAGE-1", when: (m) => m.coverage != null && m.coverage < 0.6, priority: "medium",
    title: (m) => `Q08-PM-COVERAGE-1: only ${Math.round(100 * m.coverage)}% of consequential q08 questions have fresh evidence`,
    body: (m) => `Signal coverage is ${m.coverage} against a target of 0.8. Widen the news lane: raise newsFetchPerTick and add a third search path for starved families.\n${CT}\ncode-anchor: export async function newsLane(db, starved, fetchText, nowMs, { limits = LIMITS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {\nAfter editing run node q08-prediction-markets/inline-forecast-engine.mjs.\n${PROBE('\\"coverage\\":0.8')}` },
  { key: "Q08-PM-REACH-1", when: (m) => m.posts && !m.posts.posted && m.broadcasts_7d >= 3, priority: "high",
    title: () => "Q08-PM-REACH-1: q08 broadcasts are queued but none has posted in 14 days",
    body: (m) => `fe_broadcast queued ${m.broadcasts_7d} posts in 7 days; social_threads q08-mk-* statuses: ${JSON.stringify(m.posts)}. Read why qnfo-social holds them (error column) and fix the row shape or the drain.\ncode-task: repo=qnfo-workers path=qnfo-social/worker.js\ncode-anchor: async function pickChannelRow(env, channel, epoch) {\n${PROBE('\\"posted\\"')}` },
  { key: "Q08-PM-EDGE-1", when: (m) => m.open >= 8 && m.disagree === 0, priority: "medium",
    title: (m) => `Q08-PM-EDGE-1: none of ${m.open} open q08 forecasts leaves the market price`,
    body: (m) => `With no disagreement there is nothing to trade, broadcast or score. Check the gate in combine (halving and the 1-logit cap) against the evidence count; if the models agree in direction on most questions, let a two-model agreement with three or more cited signals keep its full shift.\n${CT}\ncode-anchor: export function combine(prior, verdicts, { shrink = 0.5, cap = 1, scale = 1 } = {}) {\nAfter editing run node q08-prediction-markets/inline-forecast-engine.mjs.\n${PROBE('\\"disagree\\":')}` },
];
// Growth, not only repair (owner 2026-11-12: "That's what a product manager is about, growth"). Each target is read from pmMetrics; a missed one
// files a growth change below, and the experiment step tests one change to the product at a time and keeps the arm that grows.
const GROWTH_TARGETS = [
  { key: "pageviews_wow", name: "Reader growth", target: 1.1, read: (m) => (m.traffic && m.traffic.pageviews_prev_7d ? +(m.traffic.pageviews_7d / m.traffic.pageviews_prev_7d).toFixed(3) : null), unit: "page views this week over last week" },
  { key: "posted_14d", name: "Distribution", target: 10, read: (m) => (m.posts ? m.posts.posted || 0 : null), unit: "q08 call and settlement posts that went out in 14 days" },
  { key: "portfolio_clicks_7d", name: "Cross-promotion", target: 10, read: (m) => m.portfolio_clicks_7d, unit: "clicks from q08 into QNFO and Ultrastable in 7 days" },
  { key: "open", name: "Questions covered", target: 12, read: (m) => m.open, unit: "open consequential forecasts" },
  { key: "disagree", name: "Calls with an edge", target: 3, read: (m) => m.disagree, unit: "open forecasts that leave the market by 2 points or more" },
  { key: "coverage", name: "Signal coverage", target: 0.8, read: (m) => m.coverage, unit: "share of questions with fresh evidence" },
];
function growthScore(m) { return GROWTH_TARGETS.map((g) => { const v = g.read(m); return { key: g.key, name: g.name, target: g.target, value: v, met: v == null ? null : v >= g.target, unit: g.unit }; }); }
PM_LEVERS.push(
  { key: "Q08-PM-GROWTH-READERS-1", when: (m) => growthScore(m).find((x) => x.key === "pageviews_wow").met === false, priority: "medium",
    title: () => "Q08-PM-GROWTH-READERS-1: markets.q08.org readers did not grow 10% week over week",
    body: (m) => `Page views ${JSON.stringify(m.traffic)}. Growth lever: make each forecast page travel on its own. Add an Open Graph image route /og/<slug>.svg that draws the question, q08's number against the market and the settle date, and point the forecast page's og:image at it, so every shared link and every broadcast post shows the call.\n${CT}\ncode-anchor: export function renderForecast(d, head) {\nAfter editing run node q08-prediction-markets/inline-forecast-engine.mjs.` },
  { key: "Q08-PM-GROWTH-PORTFOLIO-1", when: (m) => m.portfolio_clicks_7d != null && m.portfolio_clicks_7d < 10, priority: "low",
    title: (m) => `Q08-PM-GROWTH-PORTFOLIO-1: ${m.portfolio_clicks_7d} clicks from q08 into QNFO and Ultrastable in 7 days`,
    body: () => `Cross-promotion is below 10 clicks a week. Growth lever: name the connection on each forecast page in one line ("the evidence matching and the ledger run on Ultrastable"), placed beside the pipeline steps instead of only in the footer block.\n${CT}\ncode-anchor: export function portfolioHtml() {\nAfter editing run node q08-prediction-markets/inline-forecast-engine.mjs.` });
// One experiment at a time, run in alternating 7-day periods (sequential, so confounded by the news cycle; two periods per arm before a verdict).
// Outcome: markets.q08.org page views per broadcast posted in the period. The winning arm becomes the fe_config value; the log is fe_experiment.
const EXPERIMENTS = [{ key: "broadcast_format", arms: FORMATS, periodDays: 7, minPeriods: 2 }];
async function experimentStep(env, m, nowMs) {
  const db = env.TRADES_DB, now = new Date(nowMs).toISOString(), out = [];
  for (const x of EXPERIMENTS) {
    const cur = await db.prepare("SELECT * FROM fe_experiment WHERE key = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1").bind(x.key).first().catch(() => null);
    const snap = { pageviews_7d: m.traffic ? m.traffic.pageviews_7d : null, posted: m.posts ? m.posts.posted || 0 : null, broadcasts_7d: m.broadcasts_7d };
    if (cur && nowMs - Date.parse(cur.started_at) < x.periodDays * 86400000) { out.push({ key: x.key, arm: cur.arm, running: true }); continue; }
    if (cur) {
      const s0 = JSON.parse(cur.start_json || "{}"), posted = Math.max(1, (snap.posted ?? 0) - (s0.posted ?? 0));
      const score = snap.pageviews_7d == null ? null : +(snap.pageviews_7d / posted).toFixed(3);
      await db.prepare("UPDATE fe_experiment SET ended_at = ?, end_json = ?, score = ? WHERE id = ?").bind(now, JSON.stringify(snap), score, cur.id).run();
    }
    const done = ((await db.prepare("SELECT arm, count(*) n, avg(score) s FROM fe_experiment WHERE key = ? AND ended_at IS NOT NULL AND score IS NOT NULL GROUP BY arm").bind(x.key).all()).results) || [];
    if (x.arms.every((a) => ((done.find((d) => d.arm === a) || {}).n || 0) >= x.minPeriods)) {
      const best = [...done].sort((a, b) => b.s - a.s)[0];
      await db.prepare("INSERT OR REPLACE INTO fe_config (key, value, updated_at, reason) VALUES (?,?,?,?)").bind(x.key, best.arm, now, "experiment verdict: " + done.map((d) => d.arm + " " + (+d.s).toFixed(2) + " views a post over " + d.n + " weeks").join(" vs ")).run();
      out.push({ key: x.key, verdict: best.arm, arms: done });
      continue;
    }
    const next = x.arms[done.reduce((a, d) => a + d.n, 0) % x.arms.length];
    await db.prepare("INSERT INTO fe_experiment (key, arm, started_at, start_json) VALUES (?,?,?,?)").bind(x.key, next, now, JSON.stringify(snap)).run();
    await db.prepare("INSERT OR REPLACE INTO fe_config (key, value, updated_at, reason) VALUES (?,?,?,?)").bind(x.key, next, now, "experiment period: arm " + next).run();
    out.push({ key: x.key, arm: next, started: true });
  }
  return out;
}
// ---------- research lane (Q08-RESEARCH-1): scan outside sources for better practice, score against q08's needs, file the change, learn from the outcome ----------
// Owner 2026-11-12: a product manager goes out, finds what the best players do now and builds it in. First pass (Metaculus "AI Forecasting in 2026",
// AIA Forecaster technical report arXiv 2511.07678): Platt-style recalibration after aggregation, 3-7 diverse runs, agentic search, caps, live (not
// backtested) evaluation. Each need names the file and anchor where the practice lands, so the code loop can build it.
const RESEARCH_NEEDS = [
  { key: "calibration", label: "recalibrate forecasts (Platt scaling, extremizing, probability caps, reliability checks)", terms: ["platt", "calibrat", "extremi", "reliability diagram", "overconfiden", "hedging", "brier", "log score", "proper scoring"], path: "q08-prediction-markets/forecast-engine.mjs", anchor: "export function " + "combine(prior, verdicts, { shrink = 0.5, cap = 1, scale = 1 } = {}) {" },
  { key: "aggregation", label: "aggregate more and more diverse model runs (ensembles, supervisor reconciliation)", terms: ["ensemble", "aggregat", "median", "trimmed mean", "wisdom of the crowd", "supervisor", "superforecaster"], path: "q08-prediction-markets/forecast-engine.mjs", anchor: "export async function " + "forecastOne(q, ask, today, opts = {}) {" },
  { key: "search", label: "gather evidence better (agentic search, more sources, base rates)", terms: ["agentic search", "retrieval", "search", "base rate", "reference class", "news"], path: "q08-prediction-markets/forecast-engine.mjs", anchor: "export async function " + "newsLane(db, starved, fetchText, nowMs, { limits = LIMITS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {" },
  { key: "leakage", label: "keep forecasts honest (look-ahead leakage, open questions treated as resolved, live evaluation)", terms: ["leak", "foreknowledge", "look-ahead", "backtest", "contamination", "knowledge cutoff"], path: "q08-prediction-markets/forecast-engine.mjs", anchor: "export function " + "buildPrompt(q, evidence, today) {" },
  { key: "track-record", label: "show the record the way the best platforms do (public scoring, peer scores, intervals)", terms: ["track record", "peer score", "leaderboard", "scorecard", "confidence interval", "resolved questions", "benchmark"], path: "q08-prediction-markets/forecast-engine.mjs", anchor: "export function " + "renderTrackRecord(d, head) {" },
  { key: "distribution", label: "distribute and grow (shareable cards, newsletters, alerts, embeds)", terms: ["newsletter", "share", "embed", "alert", "api", "launch", "subscribers", "growth"], path: "q08-prediction-markets/forecast-engine.mjs", anchor: "export function " + "renderForecast(d, head) {" },
];
const RESEARCH_SOURCES = [
  { key: "arxiv-llm-forecasting", kind: "feed", w: 1.2, url: "https://export.arxiv.org/api/query?search_query=all:%22LLM+forecasting%22+OR+all:%22judgmental+forecasting%22+OR+all:%22prediction+markets%22&sortBy=submittedDate&sortOrder=descending&max_results=20" },
  { key: "arxiv-calibration", kind: "feed", w: 1.1, url: "https://export.arxiv.org/api/query?search_query=all:%22probabilistic+forecasting%22+AND+all:calibration+AND+all:language&sortBy=submittedDate&sortOrder=descending&max_results=15" },
  { key: "news-ai-forecasting", kind: "feed", w: 0.8, url: "https://news.google.com/rss/search?q=%22AI+forecasting%22+OR+%22forecasting+bot%22+when:7d&hl=en-US&gl=US&ceid=US:en" },
  { key: "news-markets-platforms", kind: "feed", w: 0.8, url: "https://news.google.com/rss/search?q=Kalshi+OR+Polymarket+OR+Metaculus+OR+Manifold+feature+OR+launch+when:14d&hl=en-US&gl=US&ceid=US:en" },
  { key: "good-judgment", kind: "feed", w: 1.1, url: "https://goodjudgment.com/feed/" },
  { key: "forecasting-newsletter", kind: "feed", w: 1.0, url: "https://forecasting.substack.com/feed" },
];
const decodeFeedTextX = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
function parseFeed(text) {
  const out = [], blocks = String(text || "").split(/<(?:item|entry)[\s>]/i).slice(1);
  for (const b of blocks) {
    const tag = (n) => { const m = b.match(new RegExp("<" + n + "[^>]*>([\\s\\S]*?)</" + n + ">", "i")); return m ? decodeFeedTextX(m[1]) : ""; };
    const href = (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || tag("link") || tag("id");
    const title = tag("title");
    // Feed text is data, never a directive: no control characters, no line starting a code-task or code-anchor line, and a URL with no whitespace.
    const clean = (x) => String(x || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/code-(task|anchor|probe)\s*:/gi, "$1 -").replace(/\s+/g, " ").trim();
    const url = String(href || "").trim();
    if (title && /^https?:\/\/[^\s<>"']+$/.test(url)) out.push({ title: clean(title).slice(0, 240), url, summary: clean(tag("summary") || tag("description") || tag("content")).slice(0, 600) });
  }
  return out;
}
const hash8 = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16).padStart(8, "0"); };
const PRACTICE_CUES = ["we propose", "improves", "outperform", "introduces", "new method", "launch", "releases", "state-of-the-art", "beats"];
function scoreCandidate(item, src, weights = {}) {
  const t = (item.title + " " + item.summary).toLowerCase();
  let best = null;
  for (const n of RESEARCH_NEEDS) {
    const hits = n.terms.filter((x) => t.includes(x)).length;
    if (hits >= 2 && (!best || hits * (weights[n.key] || 1) > best.hits * (weights[best.need] || 1))) best = { need: n.key, hits };
  }
  if (!best) return null;
  const cue = PRACTICE_CUES.some((c) => t.includes(c)) ? 10 : 0;
  return { need: best.need, score: Math.round(Math.min(100, (100 * Math.min(1, best.hits / 3)) * (src.w || 1) * (weights[best.need] || 1) + cue)) };
}
const RESEARCH_MIN_SCORE = 55;
async function researchWeights(db) {
  const w = {};
  for (const r of (await all(db, "SELECT key, value FROM fe_config WHERE key LIKE 'rw:%'"))) { const n = Number(r.value); if (Number.isFinite(n)) w[r.key.slice(3)] = Math.max(0.5, Math.min(2, n)); }
  return w;
}
const setWeight = (db, need, v, now, why) => db.prepare("INSERT OR REPLACE INTO fe_config (key, value, updated_at, reason) VALUES (?,?,?,?)").bind("rw:" + need, String(Math.max(0.5, Math.min(2, +v.toFixed(2)))), now, why).run();
async function researchLane(env, fetchText, nowMs, { sources = RESEARCH_SOURCES, minScore = RESEARCH_MIN_SCORE, maxFiled = 1 } = {}) {
  const db = env.TRADES_DB, now = new Date(nowMs).toISOString(), res = { fetched: 0, new: 0, filed: [], adopted: 0, stale: 0, errors: [] };
  const weights = await researchWeights(db);
  const pulled = await Promise.all(sources.map(async (s) => { try { const r = await fetchText(s.url); if (!r.ok) throw new Error("status " + r.status); return { s, items: parseFeed(r.text) }; } catch (err) { res.errors.push(s.key + ": " + String(err && err.message || err).slice(0, 60)); return { s, items: [] }; } }));
  for (const { s, items } of pulled) for (const it of items) {
    res.fetched++;
    const sc = scoreCandidate(it, s, weights); if (!sc) continue;
    const r = await db.prepare("INSERT OR IGNORE INTO fe_research (id, source, title, url, summary, seen_at, need, score, status) VALUES (?,?,?,?,?,?,?,?, 'new')").bind(hash8(it.url), s.key, it.title, it.url, it.summary, now, sc.need, sc.score).run();
    if (r.meta && r.meta.changes) res.new++;
  }
  // File the best new candidate per need that has no open issue (one change a run per need, at most maxFiled).
  if (env.AUDIT) {
    const cands = await all(db, "SELECT * FROM fe_research WHERE status = 'new' AND score >= ? AND seen_at > ? ORDER BY score DESC, seen_at DESC LIMIT 20", minScore, new Date(nowMs - 14 * 86400000).toISOString());
    for (const c of cands) {
      if (res.filed.length >= maxFiled) break;
      const need = RESEARCH_NEEDS.find((n) => n.key === c.need), key = "Q08-RESEARCH-" + c.need.toUpperCase() + "-1";
      const open = await env.AUDIT.prepare("SELECT id FROM agent_issues WHERE status = 'open' AND substr(title, 1, ?) = ? LIMIT 1").bind(key.length + 1, key + ":").first().catch(() => ({ lookup_failed: true }));
      if (open) continue; // an open issue, or a failed lookup: never file blind
      const t = Date.now();
      const r = await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?,?,?,?,?,'open',?,?)")
        .bind(key + ": " + c.title.slice(0, 110), `Research lane (Q08-RESEARCH-1) found a practice from ${c.source} that matches the q08 need "${need.label}" (score ${c.score}): ${c.title}\n${c.url}\n${c.summary}\nBuild the smallest version of it that q08 can measure (a recorded metric or a fe_config knob the product manager can revert), covered by q08-prediction-markets/growth.test.mjs.\ncode-task: repo=qnfo-workers path=${need.path}\ncode-anchor: ${need.anchor}\nAfter editing run node q08-prediction-markets/inline-forecast-engine.mjs.\nFiled by the q08 markets product manager at ${now}.`, "q08-prediction-markets", "optimization", "medium", t, t).run().catch((err) => ({ error: String(err && err.message || err) }));
      if (r.error) { res.errors.push("file: " + r.error.slice(0, 60)); continue; }
      const id = r.meta && r.meta.last_row_id;
      await db.prepare("UPDATE fe_research SET status = 'filed', issue_id = ?, settled_at = ? WHERE id = ?").bind(id || null, now, c.id).run();
      res.filed.push({ key, id: c.id, need: c.need, score: c.score });
    }
    // Learn from outcomes: a closed issue is adopted (the need's weight rises and the item becomes a signal); one still open after 14 days is stale (weight falls).
    for (const f of await all(db, "SELECT id, need, title, url, issue_id, settled_at FROM fe_research WHERE status = 'filed' AND issue_id IS NOT NULL")) {
      const st = await env.AUDIT.prepare("SELECT status FROM agent_issues WHERE id = ?").bind(f.issue_id).first().catch(() => null);
      if (st && st.status === "closed") {
        await db.prepare("UPDATE fe_research SET status = 'adopted', settled_at = ? WHERE id = ?").bind(now, f.id).run();
        await setWeight(db, f.need, (weights[f.need] || 1) + 0.15, now, "research adopted: " + f.title.slice(0, 80));
        await db.prepare("INSERT OR IGNORE INTO fe_signal (id, source, family, query, title, url, created_at) VALUES (?,?,?,?,?,?,?)").bind("research:" + f.id, "research", "tech", f.need, f.title, f.url, now).run();
        res.adopted++;
      } else if (st && f.settled_at && nowMs - Date.parse(f.settled_at) > 14 * 86400000) {
        await db.prepare("UPDATE fe_research SET status = 'stale', settled_at = ? WHERE id = ?").bind(now, f.id).run();
        await setWeight(db, f.need, (weights[f.need] || 1) - 0.1, now, "research stale: " + f.title.slice(0, 80));
        res.stale++;
      }
    }
  }
  return res;
}
async function researchStatus(db) {
  const counts = Object.fromEntries((await all(db, "SELECT status, count(*) n FROM fe_research GROUP BY status")).map((x) => [x.status, x.n]));
  return { sources: RESEARCH_SOURCES.map((s) => s.key), needs: RESEARCH_NEEDS.map((n) => n.key), counts, weights: await researchWeights(db),
    top: await all(db, "SELECT source, need, score, status, title, url FROM fe_research ORDER BY seen_at DESC, score DESC LIMIT 8") };
}

// ---------- calibration (Q08-CALIB-1): the evidence shift is scaled by a factor fit on settled calls and kept only if cross-validation beats the unscaled forecast ----------
// Best practice from the AIA Forecaster and the Metaculus bot analyses: LLM forecasts hedge toward the prior; recalibrate after aggregation.
// Only the shift away from the crowd's price is scaled, so a question with no edge keeps the market price.
function reliabilityBins(rows, edges = [0, 0.2, 0.4, 0.6, 0.8, 1.0001]) {
  const r = rows.filter((x) => x.outcome === 0 || x.outcome === 1);
  return edges.slice(0, -1).map((lo, i) => { const b = r.filter((x) => x.p >= lo && x.p < edges[i + 1]); return { from: lo, to: Math.min(1, edges[i + 1]), n: b.length, mean_p: b.length ? +(b.reduce((a, x) => a + x.p, 0) / b.length).toFixed(3) : null, observed: b.length ? +(b.reduce((a, x) => a + x.outcome, 0) / b.length).toFixed(3) : null }; });
}
const scaled = (x, k) => clampP(sigmoid(logit(clampP(x.prior)) + k * (logit(clampP(x.p)) - logit(clampP(x.prior)))));
function shiftScaleFit(rows, { minN = 30, folds = 5 } = {}) {
  const r = lastPerSlug(rows).filter((x) => (x.outcome === 0 || x.outcome === 1) && Math.abs(x.p - x.prior) > 1e-6);
  if (r.length < minN) return { n: r.length, apply: false, k: 1, why: "needs " + minN + " settled calls that left the price" };
  const grid = []; for (let k = 0; k <= 2.0001; k += 0.05) grid.push(+k.toFixed(2));
  const best = (train) => grid.map((k) => [k, train.reduce((a, x) => a + brier(scaled(x, k), x.outcome), 0) / train.length]).sort((a, b) => a[1] - b[1])[0][0];
  let cv = 0, base = 0;
  for (let f = 0; f < folds; f++) { const te = r.filter((_, i) => i % folds === f), tr = r.filter((_, i) => i % folds !== f), k = best(tr); cv += te.reduce((a, x) => a + brier(scaled(x, k), x.outcome), 0); base += te.reduce((a, x) => a + brier(x.p, x.outcome), 0); }
  const k = best(r), gain = (base - cv) / r.length;
  return { n: r.length, k, cv_gain: +gain.toFixed(4), apply: gain > 0.001 && k !== 1, why: gain > 0.001 ? "cross-validated Brier improves by " + gain.toFixed(4) : "no cross-validated gain" };
}
// ---------- competitive analysis (Q08-COMPETE-1): benchmark q08 against the platforms readers compare it with; every gap becomes a filed change ----------
// Each competitor's public pages are fetched and read for features. A feature offered by at least two competitors that q08 lacks is a gap: it enters
// the research queue as a candidate (so the same filing, adoption and weight loop applies) and the table fe_competitor keeps the evidence.
const COMPETITORS = [
  { key: "metaculus", urls: ["https://www.metaculus.com/", "https://www.metaculus.com/questions/track-record/"] },
  { key: "polymarket", urls: ["https://polymarket.com/", "https://docs.polymarket.com/"] },
  { key: "kalshi", urls: ["https://kalshi.com/", "https://kalshi.com/research"] },
  { key: "manifold", urls: ["https://manifold.markets/"] },
  { key: "good-judgment-open", urls: ["https://www.gjopen.com/"] },
  { key: "forecastbench", urls: ["https://www.forecastbench.org/"] },
];
// have: what q08 ships today (kept here so a gap closes when the feature lands and this flag flips with the PR that builds it).
const FEATURES = [
  { key: "track-record", terms: ["track record", "calibration", "brier"], have: true, need: "track-record", what: "a public track record with calibration" },
  { key: "leaderboard", terms: ["leaderboard", "ranking", "top forecasters"], have: false, need: "track-record", what: "a leaderboard that ranks forecasters or models against each other and the crowd" },
  { key: "api", terms: ["api", "developers", "data export", "download data"], have: true, need: "distribution", what: "an open API" },
  { key: "alerts", terms: ["alerts", "notifications", "notify me", "subscribe"], have: false, need: "distribution", what: "alerts when a forecast moves or settles" },
  { key: "embed", terms: ["embed", "widget"], have: false, need: "distribution", what: "an embeddable forecast widget" },
  { key: "newsletter", terms: ["newsletter", "weekly digest"], have: false, need: "distribution", what: "a weekly digest of calls and settlements" },
  { key: "comments", terms: ["comments", "discussion", "rationale"], have: false, need: "search", what: "published reasoning beside each forecast" },
  { key: "mobile", terms: ["ios", "android", "app store"], have: false, need: "distribution", what: "a mobile app or installable page" },
];
async function competitorLane(env, fetchText, nowMs, { competitors = COMPETITORS, minCompetitors = 2 } = {}) {
  const db = env.TRADES_DB, now = new Date(nowMs).toISOString(), res = { read: 0, errors: [], gaps: [] };
  await db.prepare("CREATE TABLE IF NOT EXISTS fe_competitor (competitor TEXT NOT NULL, feature TEXT NOT NULL, offered INTEGER, checked_at TEXT, PRIMARY KEY (competitor, feature))").run();
  for (const c of competitors) {
    let text = "";
    for (const u of c.urls) { try { const r = await fetchText(u); if (r.ok) { text += " " + String(r.text).toLowerCase(); res.read++; } else res.errors.push(c.key + ": status " + r.status); } catch (err) { res.errors.push(c.key + ": " + String(err && err.message || err).slice(0, 50)); } }
    if (!text.trim()) continue;
    for (const f of FEATURES) await db.prepare("INSERT OR REPLACE INTO fe_competitor (competitor, feature, offered, checked_at) VALUES (?,?,?,?)").bind(c.key, f.key, f.terms.some((t) => text.includes(t)) ? 1 : 0, now).run();
  }
  for (const f of FEATURES.filter((x) => !x.have)) {
    const o = await all(db, "SELECT competitor FROM fe_competitor WHERE feature = ? AND offered = 1 AND checked_at > ?", f.key, new Date(nowMs - 3 * 86400000).toISOString());
    if (o.length < minCompetitors) continue;
    const url = (competitors.find((c) => c.key === o[0].competitor) || competitors[0]).urls[0];
    const r = await db.prepare("INSERT OR IGNORE INTO fe_research (id, source, title, url, summary, seen_at, need, score, status) VALUES (?,?,?,?,?,?,?,?, 'new')")
      .bind("gap-" + f.key, "competitors", o.length + " of " + competitors.length + " competitors offer " + f.what + "; q08 does not", url, "Offered by: " + o.map((x) => x.competitor).join(", "), now, f.need, 80).run();
    res.gaps.push({ feature: f.key, offered_by: o.length, new: !!(r.meta && r.meta.changes) });
  }
  return res;
}
async function productManager(env, nowMs, { force = false, everyH = 23 } = {}) {
  const db = env.TRADES_DB;
  await ensureSchema(db);
  const prev = await db.prepare("SELECT ran_at, metrics_json FROM fe_pm ORDER BY id DESC LIMIT 1").first().catch(() => null);
  if (!force && prev && nowMs - Date.parse(prev.ran_at) < everyH * 3600000) return { ran: false, next_at: new Date(Date.parse(prev.ran_at) + everyH * 3600000).toISOString() };
  const m = await pmMetrics(env, nowMs), cfg = await readConfig(db), now = new Date(nowMs).toISOString(), decisions = [], filed = [];
  let before = null; try { before = prev ? JSON.parse(prev.metrics_json || "null") : null; } catch (err) { before = null; }
  const set = async (key, value, reason) => {
    const k = PM_KNOBS[key], v = Math.max(k.min, Math.min(k.max, value));
    if (v === cfg[key]) return;
    await db.prepare("INSERT OR REPLACE INTO fe_config (key, value, updated_at, reason) VALUES (?,?,?,?)").bind(key, String(v), now, reason).run();
    decisions.push({ key, from: cfg[key], to: v, reason, revert: "DELETE FROM fe_config WHERE key = '" + key + "'" });
    cfg[key] = v;
  };
  // Token budget: spend more where evidence is plentiful and the adjustments are not losing; spend less when they are.
  if (m.halted || (m.value_added != null && m.value_added < 0 && m.settled >= 20)) await set("max_updates", cfg.max_updates - 1, "value added below zero on " + m.settled + " settled: fewer adjustments until it turns");
  else if (m.coverage != null && m.coverage >= 0.7 && (m.tokens_per_forecast_7d || 0) < 1500 && m.open >= 2 * cfg.max_updates) await set("max_updates", cfg.max_updates + 1, "coverage " + m.coverage + ", " + m.tokens_per_forecast_7d + " tokens a forecast and " + m.open + " open questions: one more update an hour");
  // Broadcast cadence: grow while posts go out and traffic holds, shrink when they pile up unposted.
  const posted = (m.posts && m.posts.posted) || 0, piled = m.posts ? Object.entries(m.posts).filter(([s]) => s !== "posted").reduce((a, [, n]) => a + n, 0) : 0;
  if (m.posts && piled >= 6 && posted === 0) await set("broadcast_per_day", cfg.broadcast_per_day - 1, piled + " broadcasts held or queued, none posted: slow down until the drain takes them");
  else if (posted >= 3 && m.traffic && m.traffic.pageviews_7d >= m.traffic.pageviews_prev_7d) await set("broadcast_per_day", cfg.broadcast_per_day + 1, posted + " posted and markets.q08.org pageviews " + m.traffic.pageviews_prev_7d + " -> " + m.traffic.pageviews_7d + ": one more a day");
  // One code change a run: the first lever whose metric is short and that has no open issue already.
  if (env.AUDIT) {
    for (const l of PM_LEVERS) {
      if (!l.when(m)) continue;
      const open = await env.AUDIT.prepare("SELECT id FROM agent_issues WHERE status = 'open' AND substr(title, 1, ?) = ? LIMIT 1").bind(l.key.length + 1, l.key + ":").first().catch(() => null);
      if (open) { filed.push({ key: l.key, open: open.id }); continue; }
      const t = Date.now();
      const r = await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?,?,?,?,?,'open',?,?)")
        .bind(l.title(m), l.body(m) + "\nFiled by the q08 markets product manager (Q08-GROWTH-1, q08-prediction-markets) from its metrics at " + now + ".", "q08-prediction-markets", "optimization", l.priority, t, t).run().catch((err) => ({ error: String(err && err.message || err) }));
      filed.push({ key: l.key, new: !r.error, error: r.error });
      break;
    }
  }
  // Q08-CALIB-1: keep the fitted shift scale only while cross-validation says it beats the unscaled forecast; otherwise delete the knob.
  const ss = m.shift_scale;
  if (ss && ss.apply && cfg.shift_scale !== ss.k) { await db.prepare("INSERT OR REPLACE INTO fe_config (key, value, updated_at, reason) VALUES ('shift_scale',?,?,?)").bind(String(ss.k), now, "cv gain " + ss.cv_gain + " on " + ss.n + " settled calls").run(); decisions.push({ key: "shift_scale", from: cfg.shift_scale, to: ss.k, reason: ss.why, revert: "DELETE FROM fe_config WHERE key = 'shift_scale'" }); cfg.shift_scale = ss.k; }
  else if (ss && !ss.apply && cfg.shift_scale !== 1) { await db.prepare("DELETE FROM fe_config WHERE key = 'shift_scale'").run(); decisions.push({ key: "shift_scale", from: cfg.shift_scale, to: 1, reason: ss.why }); cfg.shift_scale = 1; }
  let compete = null;
  try { compete = await competitorLane(env, env.__fetchText || defaultFetchText, nowMs); } catch (err) { compete = { error: String(err && err.message || err).slice(0, 120) }; }
  let research = null;
  try { research = await researchLane(env, env.__fetchText || defaultFetchText, nowMs); } catch (err) { research = { error: String(err && err.message || err).slice(0, 120) }; }
  let experiments = null;
  try { experiments = await experimentStep(env, m, nowMs); } catch (err) { experiments = [{ error: String(err && err.message || err).slice(0, 120) }]; }
  // Did last run's knob changes move what they were meant to move? Recorded beside this run, so a lever that does nothing is visible.
  const check = before ? { coverage: [before.coverage, m.coverage], broadcasts_7d: [before.broadcasts_7d, m.broadcasts_7d], pageviews_7d: [before.traffic && before.traffic.pageviews_7d, m.traffic && m.traffic.pageviews_7d], settled: [before.settled, m.settled] } : null;
  await db.prepare("INSERT INTO fe_pm (ran_at, metrics_json, decisions_json, filed_json) VALUES (?,?,?,?)").bind(now, JSON.stringify({ ...m, growth: growthScore(m), since_last: check, research, compete }), JSON.stringify(decisions.concat((experiments || []).map((x) => ({ experiment: x })))), JSON.stringify(filed)).run();
  return { ran: true, metrics: m, growth: growthScore(m), decisions, experiments, filed, research, compete, config: cfg };
}
async function pmStatus(env, nowMs = Date.now()) {
  const db = env && env.TRADES_DB;
  if (!db) return { empty: true };
  await safe(() => ensureSchema(db));
  const runs = await all(db, "SELECT ran_at, metrics_json, decisions_json, filed_json FROM fe_pm ORDER BY id DESC LIMIT 14");
  const parse = (s) => { try { return JSON.parse(s || "null"); } catch (err) { return null; } };
  const latest = runs[0] ? parse(runs[0].metrics_json) : await pmMetrics(env, nowMs).catch(() => null);
  const exps = await all(db, "SELECT key, arm, started_at, ended_at, score FROM fe_experiment ORDER BY id DESC LIMIT 20");
  return { product: "q08 markets", loop: "daily: measure growth and health, adjust knobs (fe_config), run one experiment at a time (fe_experiment), file the next growth or repair change (agent_issues), check the last change", config: await readConfig(db), levers: PM_LEVERS.map((l) => l.key), research: await researchStatus(db), competitors: { features: FEATURES.map((f) => ({ key: f.key, have: f.have })), matrix: await all(db, "SELECT competitor, feature, offered FROM fe_competitor") },
    ...(latest || {}), growth: latest ? growthScore(latest) : [], experiments: exps, runs: runs.map((r) => ({ ran_at: r.ran_at, decisions: parse(r.decisions_json) || [], filed: parse(r.filed_json) || [] })) };
}

// ---------- clockwork: every stage has a cadence, a late line, a self-repair and an escalation (Q08-CLOCK-1) ----------
// Owner 2026-11-12: "this all needs to keep ticking like clockwork ... a stopped clock or an inaccurate clock is not a working clock."
// Each stage below is read from the rows the stage itself writes, so the clock cannot report a tick that did not happen. Late is measured in minutes
// (QUEUE-SLA-1: none over 120 minutes past its due time). Self-repair: the cron re-runs a late forecast tick on the next 5-minute fire instead of waiting
// for the next hour, and settlement fetches every overdue question by name. A stage still late is filed for the code loop with a probe that closes it.
const CLOCK = [
  { key: "markets", name: "Market prices", every_min: 5, late_min: 20, repair: "the 5-minute cron refetches; the synthetic feed is never scored" },
  { key: "signals", name: "Signal stream", every_min: 60, late_min: 180, repair: "q08-signal-engine scrapes; the news lane fetches by question name when the stream is thin" },
  { key: "forecasts", name: "Forecast tick", every_min: 60, late_min: 90, repair: "a tick older than 80 minutes re-runs on the next 5-minute fire" },
  { key: "settlement", name: "Settlement checks", every_min: 60, late_min: 120, repair: "every question past its deadline is fetched by name each hour until it settles" },
  { key: "proxies", name: "Financial context", every_min: 360, late_min: 480, repair: "FRED is refetched every 6 hours per series" },
  { key: "pm", name: "Product manager", every_min: 1380, late_min: 1500, repair: "runs inside the forecast tick once a day" },
];
const ageMin = (t, nowMs) => { const ms = Date.parse(String(t || "").replace(" ", "T") + (/Z|\+/.test(String(t)) || !t ? "" : "Z")); return Number.isFinite(ms) ? Math.round((nowMs - ms) / 60000) : null; };
async function clockStatus(env, nowMs = Date.now()) {
  const db = env && env.TRADES_DB;
  if (!db) return { empty: true };
  await safe(() => ensureSchema(db));
  const one = (dbx, sql, ...b) => safe(async () => ((await dbx.prepare(sql).bind(...b).first()) || {}).t || null, null);
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const lastAt = {
    markets: await one(db, "SELECT max(updated_at) t FROM pt_market WHERE closed = 0"),
    signals: env.SIGNAL_DB ? await one(env.SIGNAL_DB, "SELECT max(created_at) t FROM signal_log") : null,
    forecasts: await one(db, "SELECT max(ran_at) t FROM fe_tick"),
    proxies: await one(db, "SELECT max(fetched_at) t FROM fe_proxy"),
    pm: await one(db, "SELECT max(ran_at) t FROM fe_pm"),
  };
  // Settlement is on time when every question past its deadline was checked within the window (the oldest check is the clock).
  const overdue = await all(db, "SELECT l.slug, c.checked_at FROM (SELECT slug, max(id) id FROM fe_forecast GROUP BY slug) x JOIN fe_forecast l ON l.id = x.id LEFT JOIN fe_settle c ON c.slug = l.slug WHERE l.outcome IS NULL AND l.deadline < ?", today);
  lastAt.settlement = overdue.length ? overdue.reduce((a, r) => (!r.checked_at ? "" : a === null ? r.checked_at : a < r.checked_at ? a : r.checked_at), null) : new Date(nowMs).toISOString();
  const ticks = await all(db, "SELECT ran_at FROM fe_tick WHERE ran_at > ?", new Date(nowMs - 7 * 86400000).toISOString());
  const hours = new Set(ticks.map((r) => String(r.ran_at).slice(0, 13))), firstT = ticks.length ? Math.min(...ticks.map((r) => Date.parse(r.ran_at))) : nowMs;
  const span = Math.max(1, Math.min(168, Math.floor((nowMs - firstT) / 3600000) + 1));
  const stages = CLOCK.map((c) => {
    const age = c.key === "settlement" && lastAt.settlement === "" ? null : ageMin(lastAt[c.key], nowMs);
    const onTime = age != null && age <= c.late_min;
    return { ...c, last_at: lastAt[c.key] || null, age_min: age, on_time: onTime, ...(c.key === "settlement" ? { overdue: overdue.length } : {}) };
  });
  const out = { generated_at: new Date(nowMs).toISOString(), on_time: stages.filter((s) => s.on_time).length, stages: stages.length, all_on_time: stages.every((s) => s.on_time),
    forecast_tick_hours_7d: hours.size, forecast_tick_on_time_rate_7d: +(Math.min(hours.size, span) / span).toFixed(3), list: stages };
  for (const s of stages) out[s.key + "_on_time"] = s.on_time; // flat keys, so a runtime probe can read one stage
  return out;
}
function clockHtml(c) {
  if (!c || !c.list) return "";
  const ago = (m) => (m == null ? "never" : m < 90 ? m + " min ago" : m < 2880 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago");
  return `<details class="ds-more vp-clock"><summary>Pipeline clock: ${e(c.on_time)} of ${e(c.stages)} stages on time · forecast tick on time ${e(Math.round(100 * c.forecast_tick_on_time_rate_7d))}% of hours this week</summary><div class="ds-more-body"><div class="vp-wrap"><table class="vp-tbl"><thead><tr><th>Stage</th><th>Every</th><th>Last</th><th>State</th></tr></thead><tbody>${c.list.map((s) => `<tr><td>${e(s.name)}<br><small>${e(s.repair)}</small></td><td class="n">${e(s.every_min >= 60 ? s.every_min / 60 + " h" : s.every_min + " min")}</td><td class="n">${e(ago(s.age_min))}${s.overdue ? `<br><small>${e(s.overdue)} awaiting settlement</small>` : ""}</td><td class="${s.on_time ? "ds-good" : "ds-bad"}">${s.on_time ? "on time" : "late"}</td></tr>`).join("")}</tbody></table></div><p class="ds-muted"><a href="/api/clock">Clock data (JSON)</a>. A late stage repairs itself on the next fire; one that stays late is filed for the code loop automatically.</p></div></details>`;
}

// Settlement by name: pt_market is refreshed only for markets still listed as open, so a closed market drops out of the feed and would never settle.
// Every question past its deadline, and every one whose quote went stale (resolved early), is fetched from Gamma by slug each hour.
function parseGammaClose(arr) {
  const m = Array.isArray(arr) ? arr[0] : arr;
  if (!m) return null;
  let p = m.outcomePrices;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch (err) { p = null; } }
  const yes = p ? parseFloat(p[0]) : NaN;
  return { closed: !!m.closed, yes: Number.isFinite(yes) ? yes : null, final: !!m.closed && Number.isFinite(yes) && (yes >= 0.99 || yes <= 0.01) };
}
async function settleLane(env, fetchText, nowMs, { max = 12 } = {}) {
  const db = env.TRADES_DB, now = new Date(nowMs).toISOString(), today = now.slice(0, 10), stale = new Date(nowMs - 3 * 3600000).toISOString();
  const due = await all(db, "SELECT l.slug, l.deadline FROM (SELECT slug, max(id) id FROM fe_forecast GROUP BY slug) x JOIN fe_forecast l ON l.id = x.id LEFT JOIN pt_market m ON m.slug = l.slug LEFT JOIN fe_settle c ON c.slug = l.slug WHERE l.outcome IS NULL AND (l.deadline < ? OR m.updated_at IS NULL OR m.updated_at < ?) ORDER BY c.checked_at IS NOT NULL, c.checked_at LIMIT ?", today, stale, max);
  const log = [];
  for (const d of due) {
    let state = "error";
    try {
      const r = await fetchText("https://gamma-api.polymarket.com/markets?slug=" + encodeURIComponent(d.slug));
      const g = r && r.ok ? parseGammaClose(JSON.parse(r.text)) : null;
      state = !g ? "not found" : g.final ? "settled" : g.closed ? "closed, awaiting final price" : "open";
      if (g && g.yes != null) await db.prepare("UPDATE pt_market SET yes = ?, closed = ?, updated_at = ? WHERE slug = ?").bind(g.yes, g.closed ? 1 : 0, now, d.slug).run();
    } catch (err) { state = "error: " + String(err && err.message || err).slice(0, 80); }
    await db.prepare("INSERT OR REPLACE INTO fe_settle (slug, checked_at, state) VALUES (?,?,?)").bind(d.slug, now, state).run();
    log.push({ slug: d.slug, state });
  }
  return log;
}
// Escalation: a stage that stays late after its own repair becomes one open issue for the fleet's code loop, closed by its probe when the stage is on time.
async function escalateClock(env, clock, nowMs) {
  if (!env.AUDIT || !clock || !clock.list) return [];
  const out = [];
  for (const s of clock.list.filter((x) => !x.on_time)) {
    const key = "Q08-CLOCK-" + s.key.toUpperCase() + "-1";
    const open = await env.AUDIT.prepare("SELECT id FROM agent_issues WHERE status = 'open' AND substr(title, 1, ?) = ? LIMIT 1").bind(key.length + 1, key + ":").first().catch(() => null);
    if (open) { out.push({ key, open: open.id }); continue; }
    const t = nowMs;
    const desc = `The q08 markets pipeline clock reads stage "${s.name}" late: last ${s.last_at || "never"}, ${s.age_min == null ? "no record" : s.age_min + " minutes ago"}, late after ${s.late_min} minutes. Its own repair (${s.repair}) has not brought it back. Read the stage's writer and its Workers Logs, fix the cause.\ncode-task: repo=qnfo-workers path=q08-prediction-markets/forecast-engine.mjs\ncode-anchor: export async function clockStatus(env, nowMs = Date.now()) {\nAfter editing run node q08-prediction-markets/inline-forecast-engine.mjs.\nruntime-probe: {"url": "https://markets.q08.org/api/clock", "status": 200, "contains": "\\"${s.key}_on_time\\":true"}\nFiled by q08-prediction-markets Q08-CLOCK-1 at ${new Date(nowMs).toISOString()}.`;
    const r = await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?,?,?,?,?,'open',?,?)")
      .bind(key + ": q08 pipeline stage '" + s.name + "' is late (" + (s.age_min == null ? "no record" : s.age_min + " min") + ")", desc, "q08-prediction-markets", "reliability", "high", t, t).run().catch((err) => ({ error: String(err && err.message || err) }));
    out.push({ key, new: !r.error, error: r.error });
  }
  return out;
}

// Growth surfaces a reader or a crawler can subscribe to: every call and every settlement as a feed, every question page in the sitemap.
const x = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function feedXml(d) {
  const seen = new Set(), items = [];
  for (const r of d.settled || []) items.push({ t: "Settled: " + r.title + " " + (r.outcome ? "YES" : "NO") + " (" + verdictText(r) + ")", slug: r.slug, at: r.resolved_at, body: "q08 " + pct(r.forecast) + ", market " + pct(r.crowd) + "." });
  for (const r of d.latest || []) { if (seen.has(r.slug)) continue; seen.add(r.slug); items.push({ t: "q08 " + pct(r.forecast) + " vs market " + pct(r.crowd) + ": " + r.title, slug: r.slug, at: r.at, body: "Pre-registered " + String(r.at).slice(0, 16).replace("T", " ") + " UTC, ledger hash " + String(r.hash).slice(0, 12) + "." }); }
  items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return `<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0"><channel><title>q08 forecasts</title><link>${MARKETS_ORIGIN}/</link><description>Pre-registered forecasts on market-moving events, and every settlement, right or wrong.</description>${items.slice(0, 50).map((i) => `<item><title>${x(i.t)}</title><link>${MARKETS_ORIGIN}/f/${x(i.slug)}</link><guid isPermaLink="false">${x(i.slug + "@" + i.at)}</guid><pubDate>${new Date(Date.parse(i.at) || 0).toUTCString()}</pubDate><description>${x(i.body)}</description></item>`).join("")}</channel></rss>`;
}
function sitemapXml(d) {
  const slugs = [...new Set((d.latest || []).map((r) => r.slug))];
  const urls = ["/", "/ledger", "/track-record"].map((p) => MARKETS_ORIGIN + p).concat(slugs.map((s) => MARKETS_ORIGIN + "/f/" + s));
  return `<?xml version="1.0" encoding="utf-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${x(u)}</loc></url>`).join("")}</urlset>`;
}
return { tick, plan, renderPage, latestRows, ensureSchema, MODELS, LIMITS, FE_VERSION, storyData, renderStory, renderTrackRecord, flowHtml, stageScores, siteTop, VP_CSS, NAV, forecastData, renderForecast, ledgerData, renderLedger, pmStatus, productManager, clockStatus, feedXml, sitemapXml };
})();
// FORECAST-ENGINE-1:END

// EXPLORE-RAIL-1 attaches to a named default export.
const Q08_MARKETS_DEFAULT = {
  async fetch(req, env) {
    const u = new URL(req.url), p = u.pathname;
    try {
      if (p === "/health") return json({ ok: true, worker: "q08-prediction-markets", version: VERSION, paper_trading: true, mode: CHARTER.mode, charter: CHARTER.id, features: ["paper-trading", "order-form", "signal-ensemble", "no-sports", "charter", "graduation-gate", "track-record", "whitepaper", "forecasts", "recalibration", "kelly-sizing", "value-pipeline", "track-record-page", "story-api", "forecast-pages", "ledger", "clock", "product-manager", "broadcast", "settle-by-name"] });
      if (p === "/api/state") return json(await d1Retry(() => state(env)));
      if (p === "/api/markets") return json((await d1Retry(() => state(env))).markets);
      if (p === "/api/charter") return json(await d1Retry(() => charterStatus(env)));
      // CONSOLIDATE-1: the sourceless q08-living-paper worker served an older copy of the white paper; its path now lands on the one in this worker.
      if (p === "/living-paper" || p.startsWith("/living-paper/")) return new Response(null, { status: 301, headers: { location: "/whitepaper", "cache-control": "public, max-age=86400" } });
      if (p === "/whitepaper") return new Response(whitepaperDs(), { headers: { "content-type": "text/html; charset=utf-8" } });
      if (p === "/api/track-record") return json(await d1Retry(() => trackRecord(env, Number(u.searchParams.get("limit")) || 100)));
      if (p === "/api/tick" && req.method === "POST") { const r = await tickWithRetry(env); return json(r, r.busy ? 409 : 200); }
      if (p === "/api/order" && req.method === "POST") { const r = await manualOrder(env, await req.json()); return json(r, r.error ? 400 : 200); }
      // FORECAST-ENGINE-1: consequential forecasts, started from the crowd and moved only by cited signals.
      // VALUE-PIPELINE-1: the front page is the whole pipeline (signals, forecasts, edge, simulated value); the track record recomputes every position from the ledger.
      if (p === "/" || p === "/forecasts") { const d = await d1Retry(() => FE.storyData(env)); return new Response(FE.renderStory(d, dsHead), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } }); }
      if (p === "/track-record") { const d = await d1Retry(() => FE.storyData(env)); return new Response(FE.renderTrackRecord(d, dsHead), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } }); }
      if (p === "/api/story") { const d = await d1Retry(() => FE.storyData(env)); const r = json({ engine: "VALUE-PIPELINE-1", ...d, flow_html: FE.flowHtml(d) }); r.headers.set("cache-control", "public, max-age=300"); return r; }
      if (p === "/api/forecasts") { const d = await d1Retry(() => FE.latestRows(env)); return json({ engine: "FORECAST-ENGINE-1", ledger_version: FE.FE_VERSION, models: FE.MODELS, limits: FE.LIMITS, ...d.stats, forecasts: d.rows }); }
      // Q08-GROWTH-1: one page per question (signal to settlement), the pre-registration ledger, the product loop and the pipeline clock.
      if (p.startsWith("/f/") || p.startsWith("/api/f/")) {
        const slug = decodeURIComponent(p.replace(/^\/(api\/)?f\//, "").replace(/\/$/, ""));
        const d = /^[a-z0-9-]{3,200}$/.test(slug) ? await d1Retry(() => FE.forecastData(env, slug)) : null;
        if (p.startsWith("/api/")) return d ? json(d) : json({ error: "no forecast for this question" }, 404);
        if (!d) return new Response(FE.renderLedger({ chain: null, record: {}, settled: [], latest: [] }, dsHead).replace("<h1>The ledger</h1>", "<h1>No forecast for this question</h1>"), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
        return new Response(FE.renderForecast(d, dsHead), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
      }
      if (p === "/ledger") { const d = await d1Retry(() => FE.ledgerData(env)); return new Response(FE.renderLedger(d, dsHead), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } }); }
      if (p === "/api/ledger") { const d = await d1Retry(() => FE.ledgerData(env, Date.now(), 100000)); return json(d); }
      if (p === "/feed.xml" || p === "/sitemap.xml") { const d = await d1Retry(() => FE.ledgerData(env, Date.now(), 2000)); return new Response(p === "/feed.xml" ? FE.feedXml(d) : FE.sitemapXml(d), { headers: { "content-type": p === "/feed.xml" ? "application/rss+xml; charset=utf-8" : "application/xml; charset=utf-8", "cache-control": "public, max-age=900" } }); }
      if (p === "/robots.txt") return new Response("User-agent: *\nAllow: /\nSitemap: https://markets.q08.org/sitemap.xml\n", { headers: { "content-type": "text/plain" } });
      if (p === "/api/clock") return json(await d1Retry(() => FE.clockStatus(env)));
      if (p === "/api/pm") return json(await d1Retry(() => FE.pmStatus(env)));
      if (p === "/api/forecast-ticks") { await FE.ensureSchema(env.TRADES_DB); const r = await env.TRADES_DB.prepare("SELECT * FROM fe_tick ORDER BY id DESC LIMIT 48").all(); return json({ ticks: r.results || [] }); }
      if (p === "/paper" || p === "/dashboard") return new Response(paperPage(), { headers: { "content-type": "text/html; charset=utf-8" } });
      return json({ error: "not found" }, 404);
    } catch (e) { return json({ error: String(e.message || e) }, 500); }
  },
  async scheduled(_e, env, ctx) {
    ctx.waitUntil(tickWithRetry(env).catch(err => { console.warn("tick failed:", err && (err.message || String(err)), err && err.stack || ""); }));
    // FORECAST-ENGINE-1: once an hour (the */5 tick at minute 15), after the market fetch above has refreshed pt_market.
    const mm = new Date(_e && _e.scheduledTime || Date.now()).getUTCMinutes();
    // Q08-CLOCK-1: a missed or failed hourly tick is not waited out until the next hour: any 5-minute fire that finds the last tick older than 80 minutes runs it (the clock calls it late at 90).
    if (String(env.FE_CRON || "on") !== "off")
      ctx.waitUntil((async () => {
        let due = mm >= 15 && mm < 20;
        if (!due) { const t = await env.TRADES_DB.prepare("SELECT max(ran_at) t FROM fe_tick").first().catch(() => null); due = !t || !t.t || Date.now() - Date.parse(t.t) > 80 * 60000; if (due) console.warn("Q08-CLOCK-1: forecast tick late (last " + (t && t.t) + "), catching up"); }
        if (due) await d1Retry(() => FE.tick(env));
      })().catch(err => { console.warn("forecast tick failed:", err && (err.message || String(err))); }));
  },
};

export { Q08_MARKETS_DEFAULT as default };
// VALUE-PIPELINE-1: the paper desk carries the same navigation as every q08 page (PAGE is built before FE exists, so the header is swapped here).
let paperPageCache = null;
function paperPage() {
  if (!paperPageCache) paperPageCache = PAGE.replace(/<header class="ds-top">[\s\S]*?<\/header>/, FE.siteTop("paper")).replace("</head>", "<style>" + FE.VP_CSS + "</style></head>");
  return paperPageCache;
}
// METRIC-TRIGGER-14350 (issue #1000416): 322 of the last 3h of exception rows are "D1 DB is overloaded.
// Requests queued for too long", i.e. a saturated platform, not a bad branch in this worker. Retrying the
// tick with exponential backoff (instead of failing the run on the first overloaded response) lets it land
// once the queue drains, which is what stops the error count tripling after each deploy.
async function d1Retry(fn, tries) {
  const n = tries || 4;
  for (let i = 0; i < n; i++) {
    try {
      return await fn();
    } catch (err) {
      const m = String(err && err.message || err);
      if (!/D1.*(overload|queued)/i.test(m) || i === n - 1) throw err;
      await new Promise(r => setTimeout(r, 1500 * Math.pow(2, i)));
    }
  }
}

async function tickWithRetry(env) {
  return d1Retry(() => tick(env));
}

// ---- EXPLORE-RAIL-1:BEGIN (sourced from _shared/explore-rail.js; applied by scripts/explore-rail-apply.mjs; do not edit inside a worker) ----
// EXPLORE-RAIL-1 (2026-11-10, pillar reach; owner directive: "whatever property a visitor lands on there is always something to do, click or see across the whole
// Qniverse portfolio, without feeling overwhelmed").
//
// WHAT. One "Keep exploring" block at the foot of every public HTML page of every public property: three next steps chosen for the page the visitor is on (a
// rotating window over a per-property ordered list, so the same page offers the same relevant doors but not the same three every day), and the full map of the
// public Qniverse behind one disclosure. Nothing is shown twice: a page that already carries the QDS "Keep exploring" section (class q-explore) gets a compact
// "Also in the Qniverse" row with only the properties that section lacks.
//
// WHY here and not per template. A per-template change misses the next template and the next worker (REACH-LAYER-1 learned that on the gateway). This block is
// generated from this one file into each public-facing worker, attached to the default export the way WEBMCP-FLEET-1 is, and gated by the request HOST, so a worker
// that also serves a private surface never decorates it.
//
// LIMITS. Public properties only: the personal plane (me, jobs, mind, watch, reading, travel on q08.org) is absent from the catalog on purpose, so a visitor to a
// public page is never pointed at the owner's private surfaces and a private page is never decorated (personal/research separation, DOMAIN-PLANE-1). Only
// 200 text/html GET answers are changed; JSON, feeds, PDFs, previews inside frames, API paths, unsubscribe and confirm pages pass through. Every link is tagged
// utm_medium=explore-rail so utm_clicks measures which doors people take (clicks are not readers: READER-YIELD-1).
var ER_VERSION = "1.2.0";
// ULTRASTABLE-FOOTER-1 (2026-11-10, owner directive: the whole autonomous system runs on Ultrastable, so say so in the footer of every page, with more cross-product links).
// One strip at the foot of every rail (full and compact): the platform line plus the doors that prove and show it. Public links only.
var ER_PLATFORM = [
  { t: "Ultrastable", u: "https://ultrastable.io/" },
  { t: "Proof", u: "https://ultrastable.io/proof" },
  { t: "How QNFO runs", u: "https://qnfo.org/platform" },
  { t: "Live fleet", u: "https://fleet.qnfo.org/" },
  { t: "Paper library", u: "https://papers.qnfo.org/papers" },
  { t: "Ask the corpus", u: "https://ask.qwav.org/" },
  { t: "Archive", u: "https://archive.qnfo.org/" },
  { t: "QWAV", u: "https://qwav.org/" }
];
// key, host, path, title, one line a visitor can act on, call to action. `next` is the ordered list of the most useful doors from that property.
var ER_PROPS = [
  { k: "qnfo", hosts: ["qnfo.org", "www.qnfo.org", "legal.qnfo.org"], url: "https://qnfo.org/", t: "QNFO", d: "The research imprint: open papers, an assistant that cites them, and an ideas feed.", cta: "Start here", next: ["papers", "ask", "ideas", "qwav", "ipatent"] },
  { k: "papers", hosts: ["papers.qnfo.org"], url: "https://papers.qnfo.org/papers", t: "Paper library", d: "Every paper is open, versioned and citable, with a Quick read and an Ask panel on each page.", cta: "Browse the papers", next: ["ask", "ideas", "archive", "qwav", "ipatent"] },
  { k: "ask", hosts: ["ask.qwav.org", "ask.qwav.tech"], url: "https://ask.qwav.org/", t: "Ask the corpus", d: "Ask a question and get an answer drawn only from the published papers, with a citation for every claim.", cta: "Ask a question", next: ["papers", "ideas", "qwav", "archive", "ipatent"] },
  { k: "ideas", hosts: ["ideas.qnfo.org"], url: "https://ideas.qnfo.org/", t: "Idea threads", d: "See what is being asked, what the papers cannot yet answer, and what gets studied next.", cta: "Follow the threads", next: ["papers", "ask", "qwav", "archive", "markets"] },
  { k: "qwav", hosts: ["qwav.org", "www.qwav.org", "qwav.tech", "www.qwav.tech"], url: "https://qwav.org/", t: "QWAV", d: "Quantum computing measured in joules per correct answer: the JPCUB benchmark and the p-adic architecture.", cta: "Explore quantum", next: ["papers", "ask", "ideas", "archive", "qnfo"] },
  { k: "archive", hosts: ["archive.qnfo.org"], url: "https://archive.qnfo.org/", t: "Archive", d: "The permanent record: every version of every paper, with what changed and when.", cta: "Open the archive", next: ["papers", "ask", "qwav", "ideas", "fleet"] },
  { k: "ipatent", hosts: ["ipatent.qnfo.org"], url: "https://ipatent.qnfo.org/", t: "iPatent", d: "Free provisional patent drafting with a claim-support check, built on the same research.", cta: "Draft a patent", next: ["papers", "ask", "qnfo", "ideas", "qwav"] },
  { k: "markets", hosts: ["markets.q08.org"], url: "https://markets.q08.org/", t: "q08 forecasts", d: "Pre-registered forecasts on the events that move markets, hash-chained before the event and scored when it settles, misses included.", cta: "See the live calls", next: ["q08", "qnfo", "fleet", "papers", "ideas"] },
  { k: "q08", hosts: ["q08.org", "www.q08.org"], url: "https://q08.org/", t: "q08 signal to value", d: "Public signals become forecasts on real prediction markets, priced as simulated positions, every result in the open.", cta: "Follow the pipeline", next: ["markets", "qnfo", "fleet", "papers", "ideas"] },
  { k: "fleet", hosts: ["fleet.qnfo.org"], url: "https://fleet.qnfo.org/", t: "Live fleet", d: "Watch the autonomous system run: what it is working on, shipping and measuring right now.", cta: "Watch it run", next: ["papers", "ideas", "qnfo", "archive", "ask"] }
];
// Paths that are never decorated: machine routes, one-time-link pages, and the rail's own host-independent exclusions.
var ER_SKIP_PATH = /^\/(api|health|\.well-known|\.webmcp|unsubscribe|confirm|subscribe|v1|mcp|stream|rss|sitemap|robots|og\.jpg|qds|work-with-me)(\/|\.|$)|\.(xml|json|txt|pdf|css|js|png|jpe?g|svg|ico)$/i;
function erProp(host) {
  var h = String(host || "").toLowerCase();
  for (var i = 0; i < ER_PROPS.length; i++) if (ER_PROPS[i].hosts.indexOf(h) >= 0) return ER_PROPS[i];
  return null;
}
function erByKey(k) { for (var i = 0; i < ER_PROPS.length; i++) if (ER_PROPS[i].k === k) return ER_PROPS[i]; return null; }
function erEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function erHash(s) { var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; }
function erLink(p, fromHost) { return p.url + (p.url.indexOf("?") >= 0 ? "&" : "?") + "utm_source=" + encodeURIComponent(fromHost) + "&utm_medium=explore-rail&utm_campaign=explore-rail"; }
// The three doors for this page: a window over the property's ordered `next` list, moved by the page path and the day.
function erPicks(cur, path, day, skipKeys) {
  var list = (cur.next || []).filter(function (k) { return k !== cur.k && !(skipKeys && skipKeys.indexOf(k) >= 0) && erByKey(k); });
  if (skipKeys && skipKeys.length) ER_PROPS.forEach(function (q) { if (list.length < 5 && q.k !== cur.k && list.indexOf(q.k) < 0 && skipKeys.indexOf(q.k) < 0) list.push(q.k); }); // compact: pad with doors the page lacks
  if (list.length <= 3) return list.map(erByKey);
  var off = (erHash(path) + (day | 0)) % list.length, out = [];
  for (var i = 0; i < 3; i++) out.push(erByKey(list[(off + i) % list.length]));
  return out;
}
var ER_CSS = ".er{box-sizing:border-box;max-width:960px;margin:32px auto 0;padding:20px 16px;border-top:1px solid #c9d0e6;font:16px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:#14182e;background:#f5f7fb}"
  + ".er *{box-sizing:border-box}.er h2{margin:0 0 4px;font-size:21px;line-height:1.25;color:#14182e}.er p{margin:0 0 14px;font-size:16px;color:#3a4160}"
  + ".er-row{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}"
  + ".er-card{display:flex;flex-direction:column;gap:4px;min-height:44px;padding:14px;border:1px solid #c9d0e6;border-radius:12px;background:#fff;color:#14182e;text-decoration:none}"
  + ".er-card:hover{border-color:#1b3fd1}.er-card:focus-visible,.er-all a:focus-visible,.er-all summary:focus-visible{outline:3px solid #1b3fd1;outline-offset:2px}"
  + ".er-card b{font-size:17px}.er-card span{font-size:15px;color:#3a4160}.er-card small{font-size:15px;font-weight:650;color:#1b3fd1}"
  + ".er-plat{margin:18px 0 0;padding-top:14px;border-top:1px solid #c9d0e6;font-size:15px;color:#3a4160}.er-plat b{color:#14182e}.er-plat ul{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:0 16px}.er-plat a{display:inline-flex;align-items:center;min-height:44px;color:#1b3fd1;font-weight:650}.er-plat a:focus-visible{outline:3px solid #1b3fd1;outline-offset:2px}.er-all{margin-top:12px}.er-all summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:650;color:#1b3fd1}"
  + ".er-all ul{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:2px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}"
  + ".er-all li a{display:flex;flex-direction:column;min-height:44px;justify-content:center;padding:6px 4px;color:#14182e;text-decoration:none;font-size:16px}"
  + ".er-all li a:hover b{text-decoration:underline}.er-all li span{font-size:14px;color:#3a4160}.er-all [aria-current]{opacity:.75}"
  + "@media (prefers-color-scheme:dark){.er{background:#141a33;border-color:#3a4270;color:#eef1fb}.er h2{color:#eef1fb}.er p,.er-card span,.er-all li span{color:#c5cbe6}"
  + ".er-plat{border-color:#3a4270;color:#c5cbe6}.er-plat b{color:#eef1fb}.er-plat a{color:#aebfff}.er-plat a:focus-visible{outline-color:#aebfff}.er-card{background:#1b2142;border-color:#3a4270;color:#eef1fb}.er-card small,.er-all summary{color:#aebfff}.er-card:hover{border-color:#aebfff}.er-all li a{color:#eef1fb}"
  + ".er-card:focus-visible,.er-all a:focus-visible,.er-all summary:focus-visible{outline-color:#aebfff}}"
  + "@media (prefers-reduced-motion:reduce){.er *{transition:none!important}}";
// compact: the page already has a Keep exploring section, so list only the doors it does not carry.
function erRailHtml(host, path, day, compact) {
  var cur = erProp(host);
  if (!cur) return "";
  var fromHost = String(host).toLowerCase();
  var have = compact ? ["qnfo", "papers", "ask", "ideas", "qwav", "q08"] : [];
  var picks = erPicks(cur, path, day, have);
  if (compact && !picks.length) return "";
  var cards = picks.map(function (p) {
    return '<a class="er-card" href="' + erEsc(erLink(p, fromHost)) + '"><b>' + erEsc(p.t) + "</b><span>" + erEsc(p.d) + "</span><small>" + erEsc(p.cta) + " &rarr;</small></a>";
  }).join("");
  var all = "";
  if (!compact) {
    all = '<details class="er-all"><summary>Everywhere in the Qniverse (' + ER_PROPS.length + ")</summary><ul>" + ER_PROPS.map(function (p) {
      var here = p.k === cur.k;
      return '<li><a href="' + erEsc(erLink(p, fromHost)) + '"' + (here ? ' aria-current="page"' : "") + "><b>" + erEsc(p.t) + (here ? " (you are here)" : "") + "</b><span>" + erEsc(p.d) + "</span></a></li>";
    }).join("") + "</ul></details>";
  }
  var h = compact ? "Also in the Qniverse" : "Keep exploring the Qniverse";
  var s = compact ? "More places that build on the same research." : "Pick one: each opens a different part of the same body of work.";
  var plat = '<div class="er-plat" data-ultrastable-footer><b>QNFO runs on Ultrastable,</b> the autonomous development platform behind every paper, page and answer here.<ul>' + ER_PLATFORM.map(function (l) {
    return '<li><a href="' + erEsc(l.u + (l.u.indexOf("?") >= 0 ? "&" : "?") + "utm_source=" + encodeURIComponent(fromHost) + "&utm_medium=explore-rail&utm_campaign=ultrastable-footer") + '">' + erEsc(l.t) + "</a></li>";
  }).join("") + "</ul></div>";
  return '<aside class="er" data-explore-rail="' + ER_VERSION + '" aria-labelledby="er-h"><style>' + ER_CSS + '</style><h2 id="er-h">' + h + "</h2><p>" + s + '</p><div class="er-row">' + cards + "</div>" + all + plat + "</aside>";
}
// Pure: (html, page URL, day) -> html with the rail added once. Returns the input unchanged when the page is not eligible.
function erInject(html, pageUrl, day) {
  var h = String(html || ""), u;
  try { u = new URL(pageUrl); } catch (e) { return h; }
  if (!erProp(u.hostname) || ER_SKIP_PATH.test(u.pathname) || h.indexOf("data-explore-rail") >= 0 || h.length > 2000000) return h;
  var bi = h.toLowerCase().lastIndexOf("</body>");
  if (bi < 0) return h;
  var rail = erRailHtml(u.hostname, u.pathname.replace(/\/+$/, "") || "/", day, /class="[^"]*\bq-explore\b/.test(h));
  if (!rail) return h;
  var at = bi, mi = h.toLowerCase().lastIndexOf("</main>");
  if (mi >= 0 && mi < bi) { var fi = h.toLowerCase().indexOf("<footer", mi); if (fi >= 0 && fi < bi) at = fi; }
  return h.slice(0, at) + rail + h.slice(at);
}
async function erWithRail(res, request) {
  try {
    var ct = res && res.headers && res.headers.get("Content-Type") || "";
    if (!res || res.status !== 200 || ct.indexOf("text/html") !== 0 || !request || request.method !== "GET") return res;
    var u = new URL(request.url);
    if (!erProp(u.hostname) || ER_SKIP_PATH.test(u.pathname)) return res;
    var dest = request.headers.get("Sec-Fetch-Dest");
    if (dest && dest !== "document") return res; // a frame, an embed or a prefetch is not a place to send people onward
    var html = await res.text();
    var out = erInject(html, request.url, Math.floor(Date.now() / 86400000));
    var hd = new Headers(res.headers);
    hd.delete("Content-Length");
    hd.set("X-Explore-Rail", out === html ? "none" : ER_VERSION);
    return new Response(out, { status: res.status, statusText: res.statusText, headers: hd });
  } catch (e) {
    return res;
  }
}
function erAttach(target) {
  try {
    if (!target || typeof target.fetch !== "function" || target.__er === ER_VERSION) return target;
    var orig = target.fetch;
    target.fetch = async function (request, env, ctx) { return erWithRail(await orig.call(this, request, env, ctx), request); };
    target.__er = ER_VERSION;
    return target;
  } catch (e) {
    return target;
  }
}
// ---- EXPLORE-RAIL-1:END ----
// ---- EXPLORE-RAIL-1:ATTACH q08-prediction-markets ----
erAttach(Q08_MARKETS_DEFAULT);
