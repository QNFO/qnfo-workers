var VERSION = "1.0.0";

const TO = "rwnquni@outlook.com";
const FROM = { email: "qnfo@qnfo.org", name: "QNFO fleet" };
const COOKIE = "yield_sess";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (n) => Number(n || 0).toLocaleString("en-US");
async function sha(s) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s))); return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join(""); }
function rand(n) { const b = new Uint8Array(n); crypto.getRandomValues(b); return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join(""); }
function eq(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
function getCookie(req, name) { const m = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.indexOf(name + "=") === 0); return m ? m.slice(name.length + 1) : ""; }
async function hasSession(req, env) {
  const t = getCookie(req, COOKIE);
  if (!/^[0-9a-f]{64}$/.test(t)) return false;
  const r = await env.AUDIT.prepare("SELECT 1 AS ok FROM yield_sessions WHERE token_hash = ?1 AND expires_ms > ?2").bind(await sha(t), Date.now()).first();
  return !!r;
}
async function sendCode(env) {
  const now = Date.now();
  const last = await env.AUDIT.prepare("SELECT MAX(created_ms) AS m, SUM(created_ms > ?1) AS n FROM yield_codes").bind(now - 3600000).first();
  if (last && last.m && now - last.m < 60000) return { status: 200, body: { ok: true, note: "A code was sent less than a minute ago. Check your inbox." } };
  if (last && Number(last.n || 0) >= 6) return { status: 429, body: { ok: false, error: "Too many codes this hour." } };
  const a = new Uint32Array(1); crypto.getRandomValues(a);
  const code = String(a[0] % 1000000).padStart(6, "0");
  const ins = await env.AUDIT.prepare("INSERT INTO yield_codes (code_hash, created_ms, expires_ms) VALUES ('pending', ?1, ?2)").bind(now, now + 600000).run();
  const id = ins.meta.last_row_id;
  await env.AUDIT.prepare("UPDATE yield_codes SET code_hash = ?1 WHERE id = ?2").bind(await sha(code + "|" + id + "|" + env.SALT), id).run();
  try {
    await env.SEND_EMAIL.send({ to: TO, from: FROM, subject: "AI yield code " + code, text: "Your AI yield dashboard code is " + code + ". It is valid for 10 minutes." });
  } catch (e) {
    return { status: 502, body: { ok: false, error: "Could not send the code: " + String(e && e.message || e).slice(0, 140) } };
  }
  await env.AUDIT.prepare("UPDATE yield_codes SET sent_ok = 1 WHERE id = ?1").bind(id).run();
  return { status: 200, body: { ok: true, note: "Code sent to the owner address. Valid for 10 minutes." } };
}
async function verify(env, codeIn) {
  const code = String(codeIn || "").replace(/\D/g, "");
  if (code.length !== 6) return { status: 400, error: "The code has 6 digits." };
  const now = Date.now();
  const f = await env.AUDIT.prepare("SELECT COALESCE(SUM(tries), 0) AS t FROM yield_codes WHERE created_ms > ?1").bind(now - 3600000).first();
  if (Number(f.t) >= 10) return { status: 429, error: "Too many wrong codes this hour." };
  const rows = (await env.AUDIT.prepare("SELECT id, code_hash, tries FROM yield_codes WHERE used_ms IS NULL AND sent_ok = 1 AND expires_ms > ?1 ORDER BY id DESC LIMIT 3").bind(now).all()).results;
  for (const r of rows) {
    if (Number(r.tries) >= 5) continue;
    if (eq(r.code_hash, await sha(code + "|" + r.id + "|" + env.SALT))) {
      const u = await env.AUDIT.prepare("UPDATE yield_codes SET used_ms = ?1 WHERE id = ?2 AND used_ms IS NULL").bind(now, r.id).run();
      if (!(u.meta && u.meta.changes)) break;
      const token = rand(32);
      await env.AUDIT.prepare("INSERT INTO yield_sessions (token_hash, created_ms, expires_ms) VALUES (?1, ?2, ?3)").bind(await sha(token), now, now + 12 * 3600000).run();
      return { ok: true, token };
    }
  }
  if (rows.length) await env.AUDIT.prepare("UPDATE yield_codes SET tries = tries + 1 WHERE id = ?1").bind(rows[0].id).run();
  return { status: 401, error: rows.length ? "That code is not right." : "No code is waiting; ask for a new one." };
}
async function data(env) {
  const q = (sql, p) => env.AUDIT.prepare(sql).bind(...(p || [])).all().then((r) => r.results);
  const res = await Promise.all([
    q("SELECT worker, purpose, SUM(calls) AS calls, SUM(errors) AS errors, SUM(out_tok) AS out_tok, ROUND(SUM(neurons)) AS neurons FROM ai_call_counters WHERE day >= date('now','-7 day') GROUP BY worker, purpose ORDER BY neurons DESC, calls DESC LIMIT 60"),
    q("SELECT day, SUM(calls) AS calls, SUM(errors) AS errors, ROUND(SUM(neurons)) AS neurons FROM ai_call_counters WHERE day >= date('now','-7 day') GROUP BY day ORDER BY day"),
    q("SELECT COUNT(*) AS n FROM research_queue WHERE status = 'published' AND published_at >= date('now','-7 day')"),
    q("SELECT ROUND(SUM(usd), 2) AS usd, SUM(calls) AS calls FROM ai_spend_ledger WHERE day >= date('now','-7 day')"),
    q("SELECT error_class, status, model, SUM(count) AS n FROM ai_gateway_failures WHERE ts >= ?1 GROUP BY error_class, status, model ORDER BY n DESC LIMIT 8", [Date.now() - 7 * 86400000]),
    q("SELECT status, COUNT(*) AS n FROM research_queue GROUP BY status ORDER BY n DESC"),
    q("SELECT kind, COUNT(*) AS n FROM cloud_ops_events WHERE ts >= datetime('now','-7 day') AND kind IN ('rerun-route','lane-reenter','research-stalled','revise-noop') GROUP BY kind"),
    q("SELECT worker, purpose, SUM(errors) AS errors, ROUND(SUM(CASE WHEN calls > 0 THEN errors * 1.0 * neurons / calls ELSE 0 END)) AS wasted FROM ai_call_counters WHERE day >= date('now','-7 day') GROUP BY worker, purpose HAVING wasted > 0 ORDER BY wasted DESC LIMIT 15"),
  ]);
  const purposes = res[0];
  const neurons = purposes.reduce((a, r) => a + Number(r.neurons || 0), 0);
  const calls = purposes.reduce((a, r) => a + Number(r.calls || 0), 0);
  const published = Number(res[2][0].n || 0);
  const usd = Number(res[3][0].usd || 0);
  return {
    generated: new Date().toISOString(), purposes, daily: res[1], published, spend_usd_7d: usd, neurons_7d: neurons,
    est_workers_ai_usd_7d: Math.round(neurons / 1000 * 0.011 * 100) / 100, calls_7d: calls,
    usd_per_published: published ? Math.round(usd / published * 100) / 100 : null,
    calls_per_published: published ? Math.round(calls / published) : null,
    unmetered: purposes.filter((r) => Number(r.calls) >= 100 && !Number(r.out_tok) && !Number(r.neurons)),
    failures: res[4], queue: res[5], events: res[6], waste: res[7], wasted_usd_7d: Math.round(res[7].reduce(function (a, r) { return a + Number(r.wasted || 0); }, 0) / 1000 * 0.011 * 100) / 100,
  };
}
function table(head, rows) {
  return "<table><thead><tr>" + head.map((h) => "<th>" + esc(h) + "</th>").join("") + "</tr></thead><tbody>" + rows.map((r) => "<tr>" + r.map((c) => "<td>" + esc(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
}
const CSS = "body{font:15px system-ui,sans-serif;margin:0;padding:16px;max-width:980px;margin:auto;background:#fff;color:#111}@media(prefers-color-scheme:dark){body{background:#111;color:#eee}th{background:#222}td,th{border-color:#333}}h1{font-size:20px}h2{font-size:16px;margin-top:28px}.k{display:flex;flex-wrap:wrap;gap:10px}.c{border:1px solid #8884;border-radius:8px;padding:10px 14px;min-width:150px}.c b{display:block;font-size:22px}table{border-collapse:collapse;width:100%;font-size:13px;display:block;overflow-x:auto}td,th{border:1px solid #8884;padding:4px 8px;text-align:left;white-space:nowrap}th{background:#eee}.w{color:#c0392b;font-weight:600}small{color:#888}";
function dashboard(d) {
  const kpi = [["Published (7d)", d.published], ["AI calls (7d)", num(d.calls_7d)], ["Calls per published", d.calls_per_published == null ? "n/a" : num(d.calls_per_published)], ["Ledger spend (7d)", "$" + d.spend_usd_7d], ["USD per published", d.usd_per_published == null ? "n/a" : "$" + d.usd_per_published], ["Neurons est. (7d)", "$" + d.est_workers_ai_usd_7d], ["Spent on errored calls (7d)", "$" + d.wasted_usd_7d]];
  const pr = d.purposes.map((r) => [r.worker, r.purpose, num(r.calls), num(r.errors), Number(r.calls) ? (100 * Number(r.errors) / Number(r.calls)).toFixed(1) + "%" : "0%", num(r.out_tok), num(r.neurons), "$" + (Number(r.neurons || 0) / 1000 * 0.011).toFixed(2)]);
  return "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>AI call yield</title><style>" + CSS + "</style><h1>AI call yield <small>generated " + esc(d.generated) + "</small></h1><div class=k>" +
    kpi.map((k) => "<div class=c><small>" + esc(k[0]) + "</small><b>" + esc(k[1]) + "</b></div>").join("") + "</div>" +
    "<h2>Calls with no metered output (calls 100+, zero tokens and zero neurons): " + d.unmetered.length + "</h2>" + (d.unmetered.length ? table(["worker", "purpose", "calls", "errors"], d.unmetered.map((r) => [r.worker, r.purpose, num(r.calls), num(r.errors)])) : "<p>None.</p>") +
    "<h2>By purpose, last 7 days (most neurons first)</h2>" + table(["worker", "purpose", "calls", "errors", "err %", "out tokens", "neurons", "est. USD"], pr) +
    "<h2>Neurons spent on calls that errored, by purpose</h2>" + table(["worker", "purpose", "errors", "wasted neurons", "est. USD"], d.waste.map((r) => [r.worker, r.purpose, num(r.errors), num(r.wasted), "$" + (Number(r.wasted || 0) / 1000 * 0.011).toFixed(2)])) + "<h2>Daily</h2>" + table(["day", "calls", "errors", "neurons"], d.daily.map((r) => [r.day, num(r.calls), num(r.errors), num(r.neurons)])) +
    "<h2>Research queue</h2>" + table(["status", "rows"], d.queue.map((r) => [r.status, num(r.n)])) +
    "<h2>Re-entry events, 7 days</h2>" + table(["event", "count"], d.events.map((r) => [r.kind, num(r.n)])) +
    "<h2>Provider failures, 7 days</h2>" + table(["class", "status", "model", "count"], d.failures.map((r) => [r.error_class, r.status, r.model, num(r.n)])) +
    "<p><small>Neuron cost is an estimate at $0.011 per 1,000 neurons. Ledger spend comes from ai_spend_ledger and includes gateway providers. Calls per published paper counts every AI call, including work on papers still in progress. Tracked in issue AI-CALL-YIELD-1.</small></p>";
}
const LOGIN = "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>AI call yield</title><style>" + CSS + "input,button{font:inherit;padding:10px;margin:6px 0;width:100%;box-sizing:border-box}</style><h1>AI call yield</h1><p>Sign in with an emailed code.</p><button id=s>Email me a code</button><input id=c inputmode=numeric maxlength=6 placeholder='6-digit code'><button id=v>Sign in</button><p id=m></p><script>var m=document.getElementById('m');function post(p,b){return fetch(p,{method:'POST',headers:{'content-type':'application/json','x-yield':'1'},body:JSON.stringify(b||{})}).then(function(r){return r.json()})}document.getElementById('s').onclick=function(){post('/api/code').then(function(j){m.textContent=j.note||j.error})};document.getElementById('v').onclick=function(){post('/api/verify',{code:document.getElementById('c').value}).then(function(j){if(j.ok){location.reload()}else{m.textContent=j.error}})};</script>";
const H = { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "content-security-policy": "frame-ancestors 'none'" };
const html = (b, s) => new Response(b, { status: s || 200, headers: Object.assign({ "content-type": "text/html; charset=utf-8" }, H) });
const json = (o, s, extra) => new Response(JSON.stringify(o), { status: s || 200, headers: Object.assign({ "content-type": "application/json" }, H, extra || {}) });
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health") return json({ ok: true, version: VERSION });
      if (request.method === "POST") {
        if (request.headers.get("x-yield") !== "1") return json({ ok: false, error: "bad request" }, 400);
        if (url.pathname === "/api/code") { const r = await sendCode(env); return json(r.body, r.status); }
        if (url.pathname === "/api/verify") {
          let b = {}; try { b = await request.json(); } catch (e) { console.error(JSON.stringify({ worker: "qnfo-ai-yield", where: "verify-body", error: String(e && e.message || e).slice(0, 120) })); }
          const r = await verify(env, b.code);
          if (!r.ok) return json({ ok: false, error: r.error }, r.status);
          return json({ ok: true }, 200, { "set-cookie": COOKIE + "=" + r.token + "; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict" });
        }
        return json({ ok: false }, 404);
      }
      const authed = await hasSession(request, env);
      if (url.pathname === "/api/data") return authed ? json(await data(env)) : json({ ok: false, error: "sign in" }, 401);
      if (url.pathname === "/") return authed ? html(dashboard(await data(env))) : html(LOGIN, 401);
      return new Response("not found", { status: 404 });
    } catch (e) {
      return json({ ok: false, error: String(e && e.message || e).slice(0, 200) }, 500);
    }
  },
};
