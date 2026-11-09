// q08-prediction-markets: the one paper-trading prediction-market worker (PM-CONSOLIDATE-1).
// Paper money only. No wallet, no exchange key, no order ever leaves this worker.
var VERSION = "1.4.0";
const CFG = { START: 10000, POS_PCT: 0.10, EXPO_PCT: 0.30, STOP: 0.15, TAKE: 0.30, SLIP: 0.01, MIN_MOVE: 0.05, MIN_VOL: 5000, MAX_OPEN: 8,
  // short-term signal strategy (PM-SIGNALS-1): news evidence -> model probability -> trade only a clear gap to the market price
  HORIZON_D: 14, SIG_MIN_VOL: 10000, MIN_EDGE: 0.10, SIG_POS_PCT: 0.05, MAX_EST: 3, EST_TTL_H: 6, CONVERGE: 0.03 };

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
// Sports are excluded from the book: the owner's intent is short-term mispricings from news signals, not game results.
const SPORTS_RE = /\b(nba|nfl|mlb|nhl|wnba|ufc|mma|ncaa|fifa|uefa|epl|premier league|la liga|serie a|bundesliga|ligue 1|champions league|europa league|world cup|super bowl|stanley cup|world series|playoffs?|grand slam|wimbledon|us open|french open|australian open|atp|wta|formula 1|f1|grand prix|nascar|pga|the masters|ryder cup|olympics?|boxing|cricket|ipl|rugby|touchdown|moneyline|over\/under|o\/u|mvp|heisman|ballon d'or|vs|win on 20\d\d-\d\d-\d\d)\b|\bspread\s*[:(]/i;
export const isSports = (m) => /sport/i.test(m.category || "") || SPORTS_RE.test((m.title || "") + " " + (m.slug || "").replace(/-/g, " "));
export const daysUntil = (iso, now = Date.now()) => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? (t - now) / 86400000 : null; };
export function syntheticMarkets(now = Date.now()) {
  const names = ["Rates cut next meeting", "BTC above 100k by Dec", "Team A wins final", "Bill passes Senate", "Storm landfall this week", "Chip export rule lifted"];
  const b = Math.floor(now / 300000);
  return names.map((n, i) => {
    const w = (k) => (Math.sin((b + k) * 1.7 + i * 2.3) + 1) / 2;
    const yes = Math.min(0.97, Math.max(0.03, 0.2 + 0.6 * w(0)));
    return { slug: "synthetic-" + i, title: n + " (synthetic)", yes: +yes.toFixed(3), vol24: 20000 + i * 1000, move: +(yes - (0.2 + 0.6 * w(-288))).toFixed(3), closed: 0 };
  });
}
export const priceOf = (side, yes) => (side === "yes" ? yes : 1 - yes);
// the mark of a position in its own side's price; with no current YES price the entry (already side-priced) is the mark
export const markOf = (p, px) => (px[p.slug] == null ? p.entry : priceOf(p.side, px[p.slug]));
export function equity(acct, positions, px) {
  return acct.cash + positions.reduce((s, p) => s + p.qty * markOf(p, px), 0);
}
const isFade = (m, cfg) => m.vol24 >= cfg.MIN_VOL && Math.abs(m.move) >= 0.15 && ((m.yes >= 0.8 && m.yes < 0.9) || (m.yes > 0.1 && m.yes <= 0.2)) && Math.sign(m.move) === (m.yes > 0.5 ? 1 : -1);
export function entries(markets, positions, acct, cfg = CFG, strategies = ['momentum', 'fade']) {
  const open = new Set(positions.map((p) => p.slug));
  const px = Object.fromEntries(markets.map((m) => [m.slug, m.yes]));
  const eq = equity(acct, positions, px);
  let exposure = positions.reduce((s, p) => s + p.qty * p.entry, 0), cash = acct.cash, n = positions.length;
  const out = [];
  const cands = (strategies.includes('momentum') ? markets : []).filter((m) => !m.closed && !isFade(m, cfg) && !open.has(m.slug) && m.yes > 0.1 && m.yes < 0.9 && Math.abs(m.move) >= cfg.MIN_MOVE && m.vol24 >= cfg.MIN_VOL)
    .sort((a, b) => Math.abs(b.move) - Math.abs(a.move));
  for (const m of cands) {
    if (n >= cfg.MAX_OPEN) break;
    const usd = Math.min(eq * cfg.POS_PCT, cash);
    if (usd < 1 || exposure + usd > eq * cfg.EXPO_PCT) break;
    const side = m.move > 0 ? "yes" : "no";
    const fill = Math.min(0.99, priceOf(side, m.yes) * (1 + cfg.SLIP));
    out.push({ slug: m.slug, title: m.title, side, usd, entry: fill, qty: usd / fill, strategy: "momentum" });
    cash -= usd; exposure += usd; n++;
  }
  // fade: small contrarian bet against a one-day spike into the 0.8-0.9 / 0.1-0.2 band (mean reversion)
  const fade = (strategies.includes('fade') ? markets : []).filter((m) => !m.closed && !open.has(m.slug) && isFade(m, cfg));
  for (const m of fade) {
    if (n >= cfg.MAX_OPEN) break;
    const usd = Math.min(eq * cfg.POS_PCT / 2, cash);
    if (usd < 1 || exposure + usd > eq * cfg.EXPO_PCT) break;
    const side = m.yes > 0.5 ? "no" : "yes";
    const fill = Math.min(0.99, priceOf(side, m.yes) * (1 + cfg.SLIP));
    out.push({ slug: m.slug, title: m.title, side, usd, entry: fill, qty: usd / fill, strategy: "fade" });
    cash -= usd; exposure += usd; n++;
  }
  return out;
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
      // a signal trade is a bet on a probability, held to resolution; it leaves early only when the market has moved to the signal's fair value
      const fairSide = p.side === "yes" ? p.fair : 1 - p.fair;
      if (p.fair != null && cur >= fairSide - cfg.CONVERGE) reason = "converged";
    }
    else if (r <= -cfg.STOP) reason = "stop_loss";
    else if (r >= cfg.TAKE) reason = "take_profit";
    if (reason) out.push({ id: p.id, exit: reason === "resolved" ? Math.round(cur) : reason === "closed" ? cur : cur * (1 - cfg.SLIP), reason });
  }
  return out;
}

// ---------- short-term signal strategy (PM-SIGNALS-1) ----------
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
// The model answers in JSON; anything else is rejected rather than guessed at.
export function parseEstimate(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j; try { j = JSON.parse(m[0]); } catch { return null; }
  const p = Number(j.p);
  if (!(p >= 0 && p <= 1)) return null;
  const conf = ["low", "medium", "high"].includes(String(j.confidence).toLowerCase()) ? String(j.confidence).toLowerCase() : "low";
  return { p: Math.min(0.97, Math.max(0.03, p)), confidence: conf, why: String(j.why || "").slice(0, 280) };
}
// Trade only a clear gap: the estimate must beat the market price by MIN_EDGE with at least medium confidence, and the side must stay tradable.
export function decide(est, m, cfg = CFG) {
  if (!est || est.confidence === "low") return null;
  const edge = est.p - m.yes;
  if (Math.abs(edge) < cfg.MIN_EDGE) return null;
  const side = edge > 0 ? "yes" : "no";
  const price = priceOf(side, m.yes);
  if (price < 0.04 || price > 0.94) return null;
  return { slug: m.slug, title: m.title, side, fair: est.p, edge, why: est.why, ends_at: m.ends_at };
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

export function stats(curve, closed) {
  let peak = -Infinity, mdd = 0;
  for (const c of curve) { peak = Math.max(peak, c.equity); mdd = Math.max(mdd, peak ? (peak - c.equity) / peak : 0); }
  const by = {};
  for (const t of closed) { const b = (by[t.strategy] ||= { trades: 0, wins: 0, pnl: 0 }); b.trades++; b.wins += t.pnl > 0 ? 1 : 0; b.pnl += t.pnl; }
  return { max_drawdown_pct: mdd * 100, by_strategy: by };
}

// ---------- storage ----------
const DDL = [
  "CREATE TABLE IF NOT EXISTS pt_account (id INTEGER PRIMARY KEY, cash REAL NOT NULL, start_cash REAL NOT NULL, created_at TEXT, lock_until INTEGER DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS pt_position (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, title TEXT, side TEXT, qty REAL, entry REAL, strategy TEXT, opened_at TEXT, closed_at TEXT, exit REAL, pnl REAL, reason TEXT)",
  "CREATE TABLE IF NOT EXISTS pt_market (slug TEXT PRIMARY KEY, title TEXT, yes REAL, vol24 REAL, move REAL, closed INTEGER, source TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS pt_equity (ts TEXT PRIMARY KEY, equity REAL, cash REAL, open_n INTEGER, source TEXT)",
  "CREATE TABLE IF NOT EXISTS pt_estimate (slug TEXT PRIMARY KEY, title TEXT, fair REAL, market REAL, edge REAL, confidence TEXT, why TEXT, ends_at TEXT, headlines INTEGER, traded INTEGER DEFAULT 0, updated_at TEXT)",
];
const COLUMNS = [["pt_position", "fair", "REAL"], ["pt_position", "edge", "REAL"], ["pt_position", "why", "TEXT"], ["pt_position", "ends_at", "TEXT"], ["pt_market", "ends_at", "TEXT"]];
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
  } catch (e) { /* fall through to the synthetic feed so the paper book keeps running */ }
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
  } catch (e) { console.error("held refresh failed", String(e)); return []; }
}

// Evidence: recent headlines from GDELT (free, no key). A market with fewer than 3 headlines is not estimated: no evidence, no prediction.
async function fetchNews(title) {
  const q = newsQuery(title);
  if (!q) return [];
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch("https://api.gdeltproject.org/api/v2/doc/doc?query=" + encodeURIComponent(q + " sourcelang:english") + "&mode=artlist&maxrecords=10&format=json&timespan=3d&sort=datedesc", { signal: ctl.signal });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.articles || []).map((a) => ({ title: String(a.title || "").slice(0, 160), domain: a.domain, date: String(a.seendate || "").slice(0, 8) })).filter((a) => a.title);
  } catch (e) { return []; } finally { clearTimeout(tm); }
}
// The model sees the question, the dates and the headlines, never the market price, so it cannot simply echo the crowd.
async function askModel(env, m, news) {
  const today = new Date().toISOString().slice(0, 10);
  const prompt = "Question: " + m.title + "\nIt resolves by " + String(m.ends_at).slice(0, 10) + ". Today is " + today + ".\nRecent headlines (newest first):\n" + news.map((n) => "- " + n.title + " (" + n.domain + ", " + n.date + ")").join("\n")
    + "\n\nGive the probability that this resolves YES. Use base rates and the evidence above; if the headlines do not bear on the question, say confidence low. Answer with JSON only: {\"p\": 0-1, \"confidence\": \"low|medium|high\", \"why\": \"one or two sentences naming the evidence\"}";
  const r = await env.QNFO_AI.fetch("https://qnfo-ai.internal/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "glm-5.3-flash", messages: [{ role: "system", content: "You are a careful, calibrated forecaster. You never invent facts beyond the headlines given." }, { role: "user", content: prompt }], max_tokens: 400, temperature: 0.2, stream: false }) });
  if (!r.ok) throw new Error("router " + r.status);
  return (await r.json()).choices?.[0]?.message?.content || "";
}
// Estimate up to MAX_EST candidate markets that have no estimate younger than EST_TTL_H hours. Outside the account lease: this is slow I/O.
async function estimate(env, db, cands, now, deps) {
  const fresh = new Set((await db.prepare("SELECT slug FROM pt_estimate WHERE updated_at > ?").bind(new Date(now - CFG.EST_TTL_H * 3600000).toISOString()).all()).results.map((r) => r.slug));
  const todo = cands.filter((m) => !fresh.has(m.slug)).slice(0, CFG.MAX_EST);
  const news = deps.news || fetchNews, ask = deps.ask || ((m, n) => askModel(env, m, n));
  const out = [];
  const status = deps.ask || env.QNFO_AI ? "ok" : "no-ai";
  if (status === "no-ai") return { rows: out, status };
  await Promise.all(todo.map(async (m) => {
    try {
      const n = await news(m.title);
      if (n.length < 3) { out.push({ m, est: null, headlines: n.length }); return; }
      out.push({ m, est: parseEstimate(await ask(m, n)), headlines: n.length });
    } catch (e) { console.error("estimate failed", m.slug, String(e)); }
  }));
  return { rows: out, status };
}

export async function tick(env, feed, deps = {}) {
  await init(env);
  const db = env.TRADES_DB, now = new Date().toISOString();
  const fetched = feed || (await fetchMarkets());
  const source = fetched.source;
  const markets = fetched.markets.filter((m) => !m.sports);
  // held markets that left the active feed (closed, resolved, outside the top 100) are fetched by slug so they can still settle
  const heldSlugs = (await openPositions(db)).map((p) => p.slug).filter((sl) => !markets.find((m) => m.slug === sl));
  const refreshed = feed || source !== "polymarket" ? [] : await fetchHeld(heldSlugs);
  // news + model estimates for the best short-term candidates, before the lease is taken (slow I/O)
  const heldNow = new Set((await openPositions(db)).map((p) => p.slug));
  const coolNow = new Set((await db.prepare("SELECT DISTINCT slug FROM pt_position WHERE closed_at IS NOT NULL AND closed_at > ?").bind(new Date(Date.now() - 6 * 3600 * 1000).toISOString()).all()).results.map((r) => r.slug));
  const strategies = String(env.STRATEGIES || "signal").split(",").map((x) => x.trim());
  let est = { rows: [], status: "off" };
  if (strategies.includes("signal") && source === "polymarket") est = await estimate(env, db, candidates(markets, heldNow, coolNow, CFG), Date.now(), deps);
  if (!(await lock(db))) return { busy: true };
  try {
    const stamp = markets.concat(refreshed);
    await db.batch(stamp.map((m) => db.prepare("INSERT OR REPLACE INTO pt_market (slug,title,yes,vol24,move,closed,source,updated_at,ends_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(m.slug, m.title, m.yes, m.vol24, m.move, m.closed, source, now, m.ends_at ?? null)));
    let pos = await openPositions(db);
    const pos0 = pos;
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
    pos = pos.filter((p) => !closed.find((x) => x.id === p.id));
    const cash0 = (await account(db)).cash + delta;
    const cool = new Set((await db.prepare("SELECT DISTINCT slug FROM pt_position WHERE closed_at IS NOT NULL AND closed_at > ?").bind(new Date(Date.now() - 6 * 3600 * 1000).toISOString()).all()).results.map((r) => r.slug));
    for (const x of closed) cool.add(pos0.find((q) => q.id === x.id).slug);
    const tradable = markets.filter((m) => !cool.has(m.slug));
    const pxNow = Object.fromEntries(all.map((m) => [m.slug, m.yes]));
    const decisions = [];
    for (const row of est.rows) {
      const m = markets.find((x) => x.slug === row.m.slug) || row.m;
      const d = row.est ? decide(row.est, m, CFG) : null;
      if (d) decisions.push(d);
      writes.push(db.prepare("INSERT OR REPLACE INTO pt_estimate (slug,title,fair,market,edge,confidence,why,ends_at,headlines,traded,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(m.slug, m.title, row.est ? row.est.p : null, m.yes, row.est ? row.est.p - m.yes : null, row.est ? row.est.confidence : "no-evidence", row.est ? row.est.why : "fewer than 3 recent headlines", m.ends_at ?? null, row.headlines, d ? 1 : 0, now));
    }
    const sig = strategies.includes("signal") ? signalEntries(decisions.filter((d) => !cool.has(d.slug)), pos, { cash: cash0 }, pxNow, CFG) : [];
    const spent = sig.reduce((t, o) => t + o.usd, 0);
    const opened = sig.concat(entries(tradable, pos.concat(sig.map((o) => ({ slug: o.slug, qty: o.qty, entry: o.entry, side: o.side }))), { cash: cash0 - spent }, CFG, strategies));
    for (const o of opened) {
      delta -= o.usd;
      writes.push(db.prepare("INSERT INTO pt_position (slug,title,side,qty,entry,strategy,opened_at,fair,edge,why,ends_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(o.slug, o.title, o.side, o.qty, o.entry, o.strategy, now, o.fair ?? null, o.edge ?? null, o.why ?? null, o.ends_at ?? null));
    }
    // closes, opens and the cash change commit together: a failure leaves the book as it was
    writes.push(db.prepare("UPDATE pt_account SET cash=cash+? WHERE id=1").bind(delta));
    await db.batch(writes);
    const cash = (await account(db)).cash;
    pos = await openPositions(db);
    const px = Object.fromEntries(all.map((m) => [m.slug, m.yes]));
    const eq = equity({ cash }, pos, px);
    await db.prepare("INSERT OR REPLACE INTO pt_equity VALUES (?,?,?,?,?)").bind(now, eq, cash, pos.length, source).run();
    return { source, markets: markets.length, estimated: est.rows.length, ai: est.status, opened: opened.length, closed: closed.length, equity: eq, cash };
  } finally { await unlock(db); }
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
  // held markets outside the top 100 by volume still need their current price for the mark and the equity
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
    closed: history, stats: stats(curve, (await db.prepare("SELECT strategy,pnl FROM pt_position WHERE closed_at IS NOT NULL").all()).results), realized: realized.s, trades_closed: realized.n, win_rate: realized.n ? realized.w / realized.n : null, curve, markets: mk.slice(0, 30) };
}

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
const PAGE = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Q08 Markets (paper)</title>
<style>:root{color-scheme:light dark}body{font:15px system-ui;max-width:860px;margin:0 auto;padding:16px}h1{font-size:20px}table{width:100%;border-collapse:collapse}td,th{padding:6px;border-bottom:1px solid #8884;text-align:left;overflow-wrap:anywhere}button{padding:8px 10px}.n{text-align:right}button{font:inherit}.b{background:#fc03;padding:8px;border-radius:6px}</style>
<h1>Q08 Markets <small>paper trading</small></h1><div class=b>Simulated money only. No real orders.</div><p id=s>Loading...</p>
<button id=t>Run tick now</button><p id=x></p><h2>Predictions</h2><p><small>A model reads the last 3 days of headlines for short-term non-sports markets and gives its own probability without seeing the price. Paper trades only open on a gap of 10 points or more with medium or high confidence.</small></p><table id=pr></table><p><label>Order size $ <input id=amt type=number value=100 min=1 step=1></label> <span id=msg role=status></span></p><h2>Open positions</h2><table id=o></table><h2>Closed</h2><table id=c></table><h2>Markets</h2><table id=m></table>
<script>const f=n=>(+n).toFixed(2);async function L(){const d=await (await fetch('/api/state')).json();
s.textContent='Equity $'+f(d.equity)+' ('+f(d.return_pct)+'%) | cash $'+f(d.cash)+' | closed '+d.trades_closed+' | win rate '+(d.win_rate==null?'n/a':f(d.win_rate*100)+'%');
x.textContent='Max drawdown '+f(d.stats.max_drawdown_pct)+'% | '+Object.entries(d.stats.by_strategy).map(([k,v])=>k+': '+v.trades+' trades, P&L $'+f(v.pnl)).join(' | ');
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
      if (p === "/health") return json({ ok: true, worker: "q08-prediction-markets", version: VERSION, paper_trading: true, features: ["paper-trading", "momentum", "fade", "stats", "order-form", "signal", "no-sports"] });
      if (p === "/api/state") return json(await state(env));
      if (p === "/api/markets") return json((await state(env)).markets);
      if (p === "/api/tick" && req.method === "POST") { const r = await tick(env); return json(r, r.busy ? 409 : 200); }
      if (p === "/api/order" && req.method === "POST") { const r = await manualOrder(env, await req.json()); return json(r, r.error ? 400 : 200); }
      if (p === "/" || p === "/dashboard") return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
      return json({ error: "not found" }, 404);
    } catch (e) { return json({ error: String(e.message || e) }, 500); }
  },
  async scheduled(_e, env, ctx) { ctx.waitUntil(tick(env)); },
};
