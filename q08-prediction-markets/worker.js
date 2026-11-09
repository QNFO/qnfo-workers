// q08-prediction-markets: the one paper-trading prediction-market worker (PM-CONSOLIDATE-1).
// Paper money only. No wallet, no exchange key, no order ever leaves this worker.
var VERSION = "1.2.4";
const CFG = { START: 10000, POS_PCT: 0.10, EXPO_PCT: 0.30, STOP: 0.15, TAKE: 0.30, SLIP: 0.01, MIN_MOVE: 0.05, MIN_VOL: 5000, MAX_OPEN: 8 };

// ---------- pure engine (tested in engine.test.mjs) ----------
export function parseMarket(m) {
  let p = m.outcomePrices;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch { p = null; } }
  const yes = p ? parseFloat(p[0]) : NaN;
  if (!m.slug || !(yes >= 0 && yes <= 1)) return null;
  return { slug: m.slug, title: m.question || m.slug, yes, vol24: +m.volume24hr || 0, move: +m.oneDayPriceChange || 0, closed: m.closed ? 1 : 0 };
}
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
export function entries(markets, positions, acct, cfg = CFG) {
  const open = new Set(positions.map((p) => p.slug));
  const px = Object.fromEntries(markets.map((m) => [m.slug, m.yes]));
  const eq = equity(acct, positions, px);
  let exposure = positions.reduce((s, p) => s + p.qty * p.entry, 0), cash = acct.cash, n = positions.length;
  const out = [];
  const cands = markets.filter((m) => !m.closed && !isFade(m, cfg) && !open.has(m.slug) && m.yes > 0.1 && m.yes < 0.9 && Math.abs(m.move) >= cfg.MIN_MOVE && m.vol24 >= cfg.MIN_VOL)
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
  const fade = markets.filter((m) => !m.closed && !open.has(m.slug) && isFade(m, cfg));
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
    else if (r <= -cfg.STOP) reason = "stop_loss";
    else if (r >= cfg.TAKE) reason = "take_profit";
    if (reason) out.push({ id: p.id, exit: reason === "resolved" ? Math.round(cur) : reason === "closed" ? cur : cur * (1 - cfg.SLIP), reason });
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
];
async function init(env) {
  const db = env.TRADES_DB;
  await db.batch(DDL.map((s) => db.prepare(s)));
  await db.prepare("INSERT OR IGNORE INTO pt_account (id,cash,start_cash,created_at) VALUES (1,?,?,?)").bind(CFG.START, CFG.START, new Date().toISOString()).run();
}
async function fetchMarkets() {
  try {
    const r = await fetch("https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&order=volume24hr&ascending=false", { headers: { accept: "application/json" }, cf: { cacheTtl: 60 } });
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

export async function tick(env, feed) {
  await init(env);
  const db = env.TRADES_DB, now = new Date().toISOString();
  const { markets, source } = feed || (await fetchMarkets());
  // held markets that left the active feed (closed, resolved, outside the top 100) are fetched by slug so they can still settle
  const heldSlugs = (await openPositions(db)).map((p) => p.slug).filter((sl) => !markets.find((m) => m.slug === sl));
  const refreshed = feed || source !== "polymarket" ? [] : await fetchHeld(heldSlugs);
  if (!(await lock(db))) return { busy: true };
  try {
    const stamp = markets.concat(refreshed);
    await db.batch(stamp.map((m) => db.prepare("INSERT OR REPLACE INTO pt_market VALUES (?,?,?,?,?,?,?,?)").bind(m.slug, m.title, m.yes, m.vol24, m.move, m.closed, source, now)));
    let pos = await openPositions(db);
    const pos0 = pos;
    const held = pos.filter((p) => !stamp.find((m) => m.slug === p.slug));
    const stored = held.length ? (await db.prepare(`SELECT slug,title,yes,vol24,move,closed FROM pt_market WHERE slug IN (${held.map(() => "?").join(",")})`).bind(...held.map((p) => p.slug)).all()).results : []; // standards-ok: only "?" placeholders are interpolated, every value goes through .bind()
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
    const opened = entries(markets.filter((m) => !cool.has(m.slug)), pos, { cash: cash0 }, CFG);
    for (const o of opened) {
      delta -= o.usd;
      writes.push(db.prepare("INSERT INTO pt_position (slug,title,side,qty,entry,strategy,opened_at) VALUES (?,?,?,?,?,?,?)").bind(o.slug, o.title, o.side, o.qty, o.entry, o.strategy, now));
    }
    // closes, opens and the cash change commit together: a failure leaves the book as it was
    writes.push(db.prepare("UPDATE pt_account SET cash=cash+? WHERE id=1").bind(delta));
    await db.batch(writes);
    const cash = (await account(db)).cash;
    pos = await openPositions(db);
    const px = Object.fromEntries(all.map((m) => [m.slug, m.yes]));
    const eq = equity({ cash }, pos, px);
    await db.prepare("INSERT OR REPLACE INTO pt_equity VALUES (?,?,?,?,?)").bind(now, eq, cash, pos.length, source).run();
    return { source, markets: markets.length, opened: opened.length, closed: closed.length, equity: eq, cash };
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
  const top = (await db.prepare("SELECT * FROM pt_market ORDER BY vol24 DESC LIMIT 100").all()).results;
  // held markets outside the top 100 by volume still need their current price for the mark and the equity
  const missing = pos.filter((p) => !top.find((m) => m.slug === p.slug));
  const extra = missing.length ? (await db.prepare(`SELECT * FROM pt_market WHERE slug IN (${missing.map(() => "?").join(",")})`).bind(...missing.map((p) => p.slug)).all()).results : []; // standards-ok: only "?" placeholders are interpolated, every value goes through .bind()
  const mk = top.concat(extra);
  const px = Object.fromEntries(mk.map((m) => [m.slug, m.yes]));
  const history = (await db.prepare("SELECT * FROM pt_position WHERE closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 50").all()).results;
  const curve = (await db.prepare("SELECT ts,equity FROM pt_equity ORDER BY ts DESC LIMIT 288").all()).results.reverse();
  const realized = (await db.prepare("SELECT COALESCE(SUM(pnl),0) s, COUNT(*) n, SUM(pnl>0) w FROM pt_position WHERE closed_at IS NOT NULL").first());
  const eq = equity(acct, pos, px);
  return { paper: true, start: acct.start_cash, cash: acct.cash, equity: eq, return_pct: (eq / acct.start_cash - 1) * 100,
    open: pos.map((p) => ({ ...p, mark: markOf(p, px), unrealized: p.qty * (markOf(p, px) - p.entry) })),
    closed: history, stats: stats(curve, (await db.prepare("SELECT strategy,pnl FROM pt_position WHERE closed_at IS NOT NULL").all()).results), realized: realized.s, trades_closed: realized.n, win_rate: realized.n ? realized.w / realized.n : null, curve, markets: mk.slice(0, 30) };
}

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
const PAGE = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Q08 Markets (paper)</title>
<style>:root{color-scheme:light dark}body{font:15px system-ui;max-width:860px;margin:0 auto;padding:16px}h1{font-size:20px}table{width:100%;border-collapse:collapse}td,th{padding:6px;border-bottom:1px solid #8884;text-align:left}.n{text-align:right}button{padding:8px 12px;font:inherit}.b{background:#fc03;padding:8px;border-radius:6px}</style>
<h1>Q08 Markets <small>paper trading</small></h1><div class=b>Simulated money only. No real orders.</div><p id=s>Loading...</p>
<button id=t>Run tick now</button><p id=x></p><h2>Open positions</h2><table id=o></table><h2>Closed</h2><table id=c></table><h2>Markets</h2><table id=m></table>
<script>const f=n=>(+n).toFixed(2);async function L(){const d=await (await fetch('/api/state')).json();
s.textContent='Equity $'+f(d.equity)+' ('+f(d.return_pct)+'%) | cash $'+f(d.cash)+' | closed '+d.trades_closed+' | win rate '+(d.win_rate==null?'n/a':f(d.win_rate*100)+'%');
x.textContent='Max drawdown '+f(d.stats.max_drawdown_pct)+'% | '+Object.entries(d.stats.by_strategy).map(([k,v])=>k+': '+v.trades+' trades, P&L $'+f(v.pnl)).join(' | ');
const E=v=>String(v).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');const r=(a,k)=>'<tr>'+k.map(x=>'<td>'+E(x)+'</td>').join('')+'</tr>';
o.innerHTML='<tr><th>Market<th>Side<th class=n>Entry<th class=n>Mark<th class=n>P&L</tr>'+d.open.map(p=>r(0,[p.title,p.side,f(p.entry),f(p.mark),f(p.unrealized)])).join('');
c.innerHTML='<tr><th>Market<th>Side<th>Reason<th class=n>P&L</tr>'+d.closed.map(p=>r(0,[p.title,p.side,p.reason,f(p.pnl)])).join('');
m.innerHTML='<tr><th>Market<th class=n>Yes<th class=n>Move<th>Feed</tr>'+d.markets.map(p=>r(0,[p.title,f(p.yes),f(p.move),p.source])).join('')}
t.onclick=async()=>{t.disabled=1;await fetch('/api/tick',{method:'POST'});t.disabled=0;L()};L();setInterval(L,30000)</script>`;

export default {
  async fetch(req, env) {
    const u = new URL(req.url), p = u.pathname;
    try {
      if (p === "/health") return json({ ok: true, worker: "q08-prediction-markets", version: VERSION, paper_trading: true, features: ["paper-trading", "momentum", "fade", "stats"] });
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
