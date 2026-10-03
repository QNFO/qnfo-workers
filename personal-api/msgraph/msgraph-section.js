// ============================================================================================================
// MSGRAPH-MAIL-1 (2026-10-03): the twin reads Rowan's consumer Outlook.com mail through Microsoft Graph, server-side.
// Why: email_index was loaded once, on 2026-08-29, by a client outside the fleet, and nothing has written it since
// (newest row 2026-08-27). No worker held a Microsoft credential. This section gives personal-api that credential flow
// and a sync, reusing the tables every reader already uses (email_index -> brief, email_search, chat retrieval, MCP).
//
// Shape (mirrors the GCAL-1 Google flow above, one token PER MAILBOX):
//   * One-time setup, by the owner: register an app in the Microsoft Entra portal with the audience "Personal
//     Microsoft accounts only" (authority /consumers), delegated Mail.Read + offline_access, a Web redirect URI of
//     <origin>/microsoft/callback, and a client secret. Put them in the Worker secrets MS_CLIENT_ID, MS_CLIENT_SECRET.
//   * Connect each mailbox once at <origin>/microsoft/connect (personal API key required; the account picker is forced,
//     so two mailboxes are two clicks). Refresh tokens live in the personal-life D1 (ms_oauth), personal plane only.
//   * The existing 05:05 cron calls msSyncAll() BEFORE building the brief: no new worker and no new cron (the fleet is
//     over its worker cap). POST /microsoft/sync and the email_sync tool run it on demand and drain a backfill.
//   * Read-only: the only scope that can read mail is Mail.Read. Nothing here sends, moves or deletes mail.
//   * Cost: no model call. Embeddings (semantic search over new mail) are OFF unless MSGRAPH_EMBED=1, because the
//     fleet's AI spend cap is breached; email_search and the brief use the SQL index and do not need vectors.
// Accounts: MS_ALLOWED_EMAILS (comma list) if set; otherwise the first MS_MAX_ACCOUNTS (default 2) mailboxes to finish
// the key-gated connect flow. Sync is oldest-first from a per-account watermark, so a page cap never leaves a gap.
// ============================================================================================================
var MS_SCOPES = "openid email profile offline_access Mail.Read";
var MS_GRAPH = "https://graph.microsoft.com/v1.0";
var MS_PAGE_SIZE = 50;
var MS_MAX_PAGES = 8;
var MS_SELECT = "id,internetMessageId,subject,from,receivedDateTime,bodyPreview,parentFolderId,isDraft";

function msTenant(env) {
  const t = String(env.MS_TENANT || "consumers");
  return /^[A-Za-z0-9.-]+$/.test(t) ? t : "consumers";
}
function msConfigured(env) { return !!(env.MS_CLIENT_ID && env.MS_CLIENT_SECRET); }
async function msEnsure(env) {
  await env.PERSONAL.batch([
    env.PERSONAL.prepare("CREATE TABLE IF NOT EXISTS ms_oauth (email TEXT PRIMARY KEY, refresh_token TEXT, access_token TEXT, access_expires INTEGER, scope TEXT, connected_at TEXT, updated_at TEXT, last_error TEXT, watermark TEXT, last_sync TEXT, last_synced_count INTEGER DEFAULT 0)"),
    env.PERSONAL.prepare("CREATE TABLE IF NOT EXISTS ms_oauth_state (state TEXT PRIMARY KEY, verifier TEXT, created INTEGER)"),
    env.PERSONAL.prepare("CREATE TABLE IF NOT EXISTS ms_sync_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, account TEXT, fetched INTEGER, written INTEGER, more INTEGER, error TEXT)")
  ]);
}
function msB64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function msPkce() {
  const verifier = msB64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: msB64url(new Uint8Array(digest)) };
}
async function msToken(env, form) {
  const r = await fetch("https://login.microsoftonline.com/" + msTenant(env) + "/oauth2/v2.0/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString(), signal: AbortSignal.timeout(1e4) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && !!j.access_token, status: r.status, j };
}
// Refresh tokens ROTATE on Microsoft's endpoint; the new one must be stored, or the next refresh fails.
async function msAccess(env, email) {
  if (!msConfigured(env)) return { ok: false, error: "microsoft-not-configured" };
  const row = await env.PERSONAL.prepare("SELECT * FROM ms_oauth WHERE email = ?1").bind(email).first();
  if (!row || !row.refresh_token) return { ok: false, error: "microsoft-not-connected: " + email };
  if (row.access_token && Number(row.access_expires || 0) > Date.now() + 6e4) return { ok: true, token: row.access_token };
  const t = await msToken(env, { client_id: env.MS_CLIENT_ID, client_secret: env.MS_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: row.refresh_token, scope: MS_SCOPES });
  if (!t.ok) {
    const err = "refresh failed HTTP " + t.status + " " + String(t.j.error || "") + " " + String(t.j.error_description || "").split("\n")[0];
    await env.PERSONAL.prepare("UPDATE ms_oauth SET last_error = ?1, updated_at = ?2 WHERE email = ?3").bind(err.slice(0, 300), new Date().toISOString(), email).run().catch(() => {});
    return { ok: false, error: "microsoft-token: " + err.slice(0, 200) };
  }
  await env.PERSONAL.prepare("UPDATE ms_oauth SET access_token = ?1, access_expires = ?2, refresh_token = COALESCE(?3, refresh_token), last_error = NULL, updated_at = ?4 WHERE email = ?5").bind(t.j.access_token, Date.now() + Number(t.j.expires_in || 3600) * 1e3, t.j.refresh_token || null, new Date().toISOString(), email).run();
  return { ok: true, token: t.j.access_token };
}
// Only ever talks to graph.microsoft.com: an @odata.nextLink is DATA from a remote service, so a link to any other host
// is refused instead of followed (the bearer token would otherwise be sent to it).
async function msGraphGet(token, urlOrPath) {
  const u = String(urlOrPath).indexOf("https://") === 0 ? String(urlOrPath) : MS_GRAPH + urlOrPath;
  if (u.indexOf("https://graph.microsoft.com/") !== 0) return { ok: false, error: "refusing non-Graph URL" };
  const r = await fetch(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" }, signal: AbortSignal.timeout(15e3) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, error: "graph HTTP " + r.status + ": " + String(j && j.error && j.error.message || "").slice(0, 200) };
  return { ok: true, j };
}
async function msFolderName(token, id, cache) {
  if (!id) return "";
  if (cache.has(id)) return cache.get(id);
  if (cache.size >= 40) return "other";
  const r = await msGraphGet(token, "/me/mailFolders/" + encodeURIComponent(id) + "?$select=displayName");
  const n = r.ok && r.j && r.j.displayName ? String(r.j.displayName) : "other";
  cache.set(id, n);
  return n;
}
// Same label set the existing rows use (invoice, travel, museum, concert, course, other). Plain rules, no model call.
// MSGRAPH-NO-CODES-1: one-time codes never enter the index. The fleet emails its owner a 6-digit code that opens the
// dashboard's controls (and every other service mails sign-in codes); anything that can read email_index (the MCP
// tools, the brief) must not be able to read them, or the emailed-code gate would be a formality.
function msIsSecretMail(subject, preview) {
  const s = String(subject || ""), p = String(preview || "");
  if (/fleet code\b/i.test(s) || /fleet\.qnfo\.org code is/i.test(p)) return true;
  return /(verification|verificatie|security|beveiligings|sign[- ]?in|log[- ]?in|login|confirmation|authentication|one[- ]time|single[- ]use|eenmalige|passcode|access|reset)\s*(code|pin|token)\b|\b(2fa|two[- ]factor)\b|\byour (code|pin) is\b|wachtwoord.{0,20}(reset|herstel)|\bpassword reset\b/i.test(s);
}
function msClassify(subject, sender) {
  const t = (String(subject || "") + " " + String(sender || "")).toLowerCase();
  if (/invoice|receipt|factuur|payment|betaling|order confirmation|bestelling/.test(t)) return "invoice";
  if (/flight|boarding|itinerary|hotel|booking|reservation|check-in|train ticket|airbnb/.test(t)) return "travel";
  if (/museum|exhibition|tentoonstelling/.test(t)) return "museum";
  if (/concert|festival|tickets?\b|ticketmaster|eventbrite/.test(t)) return "concert";
  if (/course|workshop|webinar|lecture|seminar/.test(t)) return "course";
  return "other";
}
async function msMapMessage(m, account, folder) {
  const from = m.from && m.from.emailAddress || {};
  const sender = sanitize(from.name && from.address ? from.name + " <" + from.address + ">" : (from.address || from.name || ""), 200);
  const subject = sanitize(m.subject || "(no subject)", 400);
  return {
    message_id: "msgraph:" + await sha16(account + "|" + (m.internetMessageId || m.id)),
    store: account,
    folder: sanitize(folder || "", 100),
    sender,
    subject,
    received_at: sanitize(m.receivedDateTime || "", 40),
    category: msClassify(subject, sender),
    summary: sanitize(String(m.bodyPreview || "").replace(/\s+/g, " ").trim(), 280)
  };
}
// Rows that the one-off 2026-08-29 load already holds (different, opaque message_id) are matched on
// store + subject + received second and skipped, so connecting Graph does not double the index.
function msUpsertStmt(env, r, now) {
  return env.PERSONAL.prepare("INSERT INTO email_index (message_id, store, folder, sender, subject, received_at, category, event_id, summary, ingested_at) SELECT ?1,?2,?3,?4,?5,?6,?7,'',?8,?9 WHERE NOT EXISTS (SELECT 1 FROM email_index WHERE store = ?2 AND subject = ?5 AND substr(received_at,1,19) = substr(?6,1,19) AND message_id != ?1) ON CONFLICT(message_id) DO UPDATE SET store=?2, folder=?3, sender=?4, subject=?5, received_at=?6, category=?7, summary=?8, ingested_at=?9").bind(r.message_id, r.store, r.folder, r.sender, r.subject, r.received_at, r.category, r.summary, now);
}
async function msEmbedRows(env, rows) {
  if (String(env.MSGRAPH_EMBED || "") !== "1" || !env.VZ) return 0;
  let n = 0;
  for (let i = 0; i < rows.length; i += 32) {
    const part = rows.slice(i, i + 32);
    try {
      const texts = part.map((r) => (r.subject + " | " + r.sender + " | " + r.summary).slice(0, 900));
      const vecs = await embed(env, texts);
      const ups = [];
      for (let k = 0; k < part.length; k++) if (vecs[k]) ups.push({ id: "em:" + await sha16(part[k].message_id), values: vecs[k], metadata: { doc: "email", message_id: part[k].message_id, subject: part[k].subject.slice(0, 300), sender: part[k].sender.slice(0, 150), received_at: part[k].received_at, category: part[k].category, text: texts[k].slice(0, 800) } });
      if (ups.length) { await env.VZ.upsert(ups); n += ups.length; }
    } catch (e) {}
  }
  return n;
}
async function msRecordRun(env, out) {
  try {
    await env.PERSONAL.prepare("INSERT INTO ms_sync_runs (ts, account, fetched, written, more, error) VALUES (?1,?2,?3,?4,?5,?6)").bind(new Date().toISOString(), out.account, out.fetched, out.written, out.more ? 1 : 0, out.error ? String(out.error).slice(0, 300) : null).run();
    await env.PERSONAL.prepare("DELETE FROM ms_sync_runs WHERE ts < ?1").bind(new Date(Date.now() - 30 * 864e5).toISOString()).run();
  } catch (e) {}
}
async function msSyncAccount(env, email, opts) {
  opts = opts || {};
  email = String(email || "").trim().toLowerCase();
  const out = { account: email, fetched: 0, written: 0, pages: 0, more: false, error: null };
  try {
    await msEnsure(env);
    const a = await msAccess(env, email);
    if (!a.ok) { out.error = a.error; await msRecordRun(env, out); return out; }
    const row = await env.PERSONAL.prepare("SELECT watermark FROM ms_oauth WHERE email = ?1").bind(email).first();
    const backfill = Math.min(Math.max(Number(env.MS_BACKFILL_DAYS || 120), 1), 730);
    const baseMs = row && row.watermark ? Date.parse(row.watermark) - 6e4 : Date.now() - backfill * 864e5;
    const since = new Date(baseMs).toISOString().replace(/\.\d{3}Z$/, "Z");
    let url = "/me/messages?$filter=" + encodeURIComponent("receivedDateTime ge " + since) + "&$orderby=" + encodeURIComponent("receivedDateTime asc") + "&$select=" + MS_SELECT + "&$top=" + MS_PAGE_SIZE;
    const maxPages = Math.min(Math.max(Number(opts.maxPages || MS_MAX_PAGES), 1), 40);
    const folders = new Map();
    let watermark = row && row.watermark || null;
    while (url && out.pages < maxPages) {
      const g = await msGraphGet(a.token, url);
      if (!g.ok) { out.error = g.error; break; }
      out.pages++;
      const items = g.j && g.j.value || [];
      const rows = [], stmts = [], now = new Date().toISOString();
      for (const m of items) {
        if (m.receivedDateTime && (!watermark || m.receivedDateTime > watermark)) watermark = m.receivedDateTime;
        if (m.isDraft) continue;
        if (msIsSecretMail(m.subject, m.bodyPreview)) { out.skipped = (out.skipped || 0) + 1; continue; }
        const folder = await msFolderName(a.token, m.parentFolderId, folders);
        const r = await msMapMessage(m, email, folder);
        rows.push(r);
        stmts.push(msUpsertStmt(env, r, now));
      }
      if (stmts.length) {
        const res = await env.PERSONAL.batch(stmts);
        for (const x of res || []) out.written += Number(x && x.meta && x.meta.changes || 0);
        out.fetched += rows.length;
        await msEmbedRows(env, rows);
      }
      url = g.j && g.j["@odata.nextLink"] || null;
    }
    out.more = !!url && !out.error;
    await env.PERSONAL.prepare("UPDATE ms_oauth SET watermark = ?1, last_sync = ?2, last_synced_count = ?3, last_error = ?4 WHERE email = ?5").bind(watermark, new Date().toISOString(), out.written, out.error ? String(out.error).slice(0, 300) : null, email).run();
  } catch (e) {
    out.error = "threw: " + String(e && e.message || e).slice(0, 200);
  }
  await msRecordRun(env, out);
  return out;
}
async function msSyncAll(env, opts) {
  if (!msConfigured(env)) return [];
  await msEnsure(env);
  const rows = (await env.PERSONAL.prepare("SELECT email FROM ms_oauth ORDER BY email").all()).results || [];
  const res = [];
  for (const r of rows) res.push(await msSyncAccount(env, r.email, opts));
  return res;
}
async function msStatus(env) {
  await msEnsure(env);
  const accounts = (await env.PERSONAL.prepare("SELECT email, connected_at, last_sync, watermark, last_synced_count, last_error FROM ms_oauth ORDER BY email").all()).results || [];
  const runs = (await env.PERSONAL.prepare("SELECT ts, account, fetched, written, more, error FROM ms_sync_runs ORDER BY id DESC LIMIT 6").all()).results || [];
  return { ok: true, configured: msConfigured(env), accounts, recent_runs: runs, note: "read-only Mail.Read; refresh tokens in D1; embeddings " + (String(env.MSGRAPH_EMBED || "") === "1" ? "on" : "off") };
}
async function msState(env) {
  if (!msConfigured(env)) return { state: "no-client", accounts: 0 };
  await msEnsure(env);
  const r = await env.PERSONAL.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN last_error IS NOT NULL THEN 1 ELSE 0 END) AS e FROM ms_oauth").first();
  const n = Number(r && r.n || 0), e = Number(r && r.e || 0);
  return { state: n === 0 ? "not-connected" : e > 0 ? "error" : "connected", accounts: n };
}
async function msAccountAllowed(env, email) {
  const list = String(env.MS_ALLOWED_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length) return list.indexOf(email) >= 0;
  const have = (await env.PERSONAL.prepare("SELECT email FROM ms_oauth").all()).results || [];
  if (have.some((r) => r.email === email)) return true;
  return have.length < Math.max(1, Math.min(Number(env.MS_MAX_ACCOUNTS || 2), 5));
}
var MS_CONNECT_HTML = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Outlook mail</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem}input,button{font:inherit;padding:.5rem;width:100%;box-sizing:border-box;margin:.4rem 0}</style></head><body><h1>Connect Outlook mail</h1><p>__MSG__</p>__FORM__</body></html>';
function msConnectPage(msg, form, status) {
  const f = form ? '<form method="post" action="/microsoft/connect"><label>Personal API key<input type="password" name="key" autocomplete="current-password" required></label><button type="submit">Continue to Microsoft</button></form>' : "";
  return new Response(MS_CONNECT_HTML.replace("__MSG__", escHtmlText(msg)).replace("__FORM__", f), { status: status || 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://login.microsoftonline.com; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff" } });
}
async function handleMicrosoft(request, env, url) {
  const path = url.pathname;
  const redirectUri = url.origin + "/microsoft/callback";
  if (path === "/microsoft/status") {
    if (!await auth(request, env)) return json({ error: { message: "unauthorized" } }, 401);
    return json(Object.assign({ redirect_uri: redirectUri, scopes: MS_SCOPES }, await msStatus(env)));
  }
  if (path === "/microsoft/sync" && request.method === "POST") {
    if (!await auth(request, env)) return json({ error: { message: "unauthorized" } }, 401);
    if (!msConfigured(env)) return json({ ok: false, error: "microsoft-not-configured" }, 503);
    const acct = String(url.searchParams.get("account") || "").trim().toLowerCase();
    const opts = { maxPages: Number(url.searchParams.get("pages") || 0) || undefined };
    const res = acct ? [await msSyncAccount(env, acct, opts)] : await msSyncAll(env, opts);
    return json({ ok: res.length > 0 && res.every((x) => !x.error), accounts: res });
  }
  if (path === "/microsoft/disconnect" && request.method === "POST") {
    if (!await auth(request, env)) return json({ error: { message: "unauthorized" } }, 401);
    const acct = String(url.searchParams.get("account") || "").trim().toLowerCase();
    if (!acct) return json({ ok: false, error: "account is required" }, 400);
    await msEnsure(env);
    await env.PERSONAL.prepare("DELETE FROM ms_oauth WHERE email = ?1").bind(acct).run();
    return json({ ok: true, disconnected: acct, note: "mail already in email_index is kept; revoke the app at account.live.com/consent/Manage to cancel the grant itself" });
  }
  if (path === "/microsoft/connect") {
    if (!msConfigured(env)) return msConnectPage("Not set up yet: the worker needs the secrets MS_CLIENT_ID and MS_CLIENT_SECRET from a Microsoft Entra app registration whose audience is 'Personal Microsoft accounts' and whose Web redirect URI is " + redirectUri + ".", false, 503);
    if (request.method !== "POST") return msConnectPage("Enter the personal API key to link this twin to an Outlook.com mailbox (read-only). Repeat for each mailbox.", true);
    const fd = await request.formData().catch(() => null);
    const key = fd ? String(fd.get("key") || "") : "";
    if (!safeEqual(key, String(env.API_KEY || ""))) return msConnectPage("That key is not correct.", true, 401);
    await msEnsure(env);
    const state = crypto.randomUUID().replace(/-/g, "");
    const pk = await msPkce();
    await env.PERSONAL.prepare("DELETE FROM ms_oauth_state WHERE created < ?1").bind(Date.now() - 9e5).run();
    await env.PERSONAL.prepare("INSERT INTO ms_oauth_state (state, verifier, created) VALUES (?1, ?2, ?3)").bind(state, pk.verifier, Date.now()).run();
    const q = new URLSearchParams({ client_id: env.MS_CLIENT_ID, response_type: "code", redirect_uri: redirectUri, response_mode: "query", scope: MS_SCOPES, state, code_challenge: pk.challenge, code_challenge_method: "S256", prompt: "select_account" });
    return Response.redirect("https://login.microsoftonline.com/" + msTenant(env) + "/oauth2/v2.0/authorize?" + q.toString(), 302);
  }
  if (path === "/microsoft/callback") {
    if (!msConfigured(env)) return msConnectPage("Microsoft client secrets are missing.", false, 503);
    if (url.searchParams.get("error")) return msConnectPage("Microsoft returned: " + String(url.searchParams.get("error")).slice(0, 100), false, 400);
    const state = url.searchParams.get("state") || "", code = url.searchParams.get("code") || "";
    await msEnsure(env);
    const st = await env.PERSONAL.prepare("SELECT verifier, created FROM ms_oauth_state WHERE state = ?1").bind(state).first();
    await env.PERSONAL.prepare("DELETE FROM ms_oauth_state WHERE state = ?1").bind(state).run();
    if (!st || Date.now() - Number(st.created) > 9e5 || !code) return msConnectPage("This link expired or was not started here. Start again at /microsoft/connect.", false, 400);
    const t = await msToken(env, { client_id: env.MS_CLIENT_ID, client_secret: env.MS_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: st.verifier, scope: MS_SCOPES });
    if (!t.ok) return msConnectPage("Token exchange failed (HTTP " + t.status + " " + String(t.j.error || "") + ").", false, 502);
    if (!t.j.refresh_token) return msConnectPage("Microsoft did not issue a refresh token (the offline_access permission is missing on the app registration).", false, 400);
    const me = await msGraphGet(t.j.access_token, "/me?$select=mail,userPrincipalName");
    const email = me.ok ? String(me.j.mail || me.j.userPrincipalName || "").toLowerCase() : "";
    if (!email) return msConnectPage("Could not read the mailbox address from Microsoft Graph" + (me.ok ? "." : " (" + me.error + ")."), false, 502);
    if (!await msAccountAllowed(env, email)) return msConnectPage("This twin does not accept " + email + ". Allowed mailboxes are set by MS_ALLOWED_EMAILS, or the first MS_MAX_ACCOUNTS to connect. Nothing was changed.", false, 403);
    const now = new Date().toISOString();
    await env.PERSONAL.prepare("INSERT INTO ms_oauth (email, refresh_token, access_token, access_expires, scope, connected_at, updated_at, last_error) VALUES (?1,?2,?3,?4,?5,?6,?6,NULL) ON CONFLICT(email) DO UPDATE SET refresh_token = ?2, access_token = ?3, access_expires = ?4, scope = ?5, updated_at = ?6, last_error = NULL").bind(email, t.j.refresh_token, t.j.access_token, Date.now() + Number(t.j.expires_in || 3600) * 1e3, String(t.j.scope || MS_SCOPES), now).run();
    const probe = await msSyncAccount(env, email, { maxPages: 1 });
    return msConnectPage("Connected " + email + " (read-only)." + (probe.error ? " First read failed: " + probe.error : " First sync wrote " + probe.written + " message(s); the daily cron keeps it current, and POST /microsoft/sync backfills the rest."), false);
  }
  return json({ error: { message: "not found" } }, 404);
}
TOOLS.email_sync = { desc: "Pull new mail from the connected Outlook.com accounts (Microsoft Graph, read-only) into the email index; optional account and pages", args: { account: { type: "string", required: false, desc: "one mailbox address (default: all connected)" }, pages: { type: "number", required: false, desc: "pages of 50 per account (default 8, max 40)" } }, run: (env, a) => {
  const o = { maxPages: a && a.pages ? Number(a.pages) : undefined };
  if (a && a.account) return msSyncAccount(env, a.account, o).then((r) => Object.assign({ ok: !r.error }, r));
  return msSyncAll(env, o).then((r) => ({ ok: r.length > 0 && r.every((x) => !x.error), accounts: r }));
} };
TOOLS.mail_accounts = { desc: "Which Outlook.com accounts are connected to the twin, last sync time and any error", args: {}, run: (env) => msStatus(env) };
