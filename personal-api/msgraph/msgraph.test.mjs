// Run: node --test personal-api/msgraph/msgraph.test.mjs
// Loads the PATCHED bundle (personal-api/deployed-current.worker.js) and drives it through its public surface
// (worker.fetch / worker.scheduled) against a real SQLite database (node:sqlite behind a D1-shaped shim) and a mocked
// Microsoft login + Graph. Nothing here touches the network.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(HERE, "..", "deployed-current.worker.js");
const tmp = mkdtempSync(join(tmpdir(), "msgraph-"));
writeFileSync(join(tmp, "bundle.mjs"), readFileSync(BUNDLE, "utf8"));
const worker = (await import(pathToFileURL(join(tmp, "bundle.mjs")).href)).default;

// ---------- D1 shim over node:sqlite ----------
function makeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE email_index (message_id TEXT PRIMARY KEY, store TEXT, folder TEXT, sender TEXT, subject TEXT, received_at TEXT, category TEXT, event_id TEXT, summary TEXT, ingested_at TEXT NOT NULL)");
  class Stmt {
    constructor(sql) { this.sql = sql; this.params = []; }
    bind(...p) { this.params = p; return this; }
    async run() { const r = db.prepare(this.sql).run(...this.params); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
    async first() { return db.prepare(this.sql).get(...this.params) ?? null; }
    async all() { return { results: db.prepare(this.sql).all(...this.params).map((r) => ({ ...r })) }; }
  }
  return {
    db,
    prepare: (sql) => new Stmt(sql),
    async batch(stmts) { const out = []; db.exec("BEGIN"); try { for (const s of stmts) out.push(await s.run()); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } return out; }
  };
}

// ---------- mocked Microsoft login + Graph ----------
const ACCOUNTS = { AT_A: "rwnquni@outlook.com", AT_B: "rowan.quni@outlook.com", AT_C: "stranger@outlook.com" };
function mockWorld() {
  const w = { calls: [], refreshFail: false, messages: {}, nextLinkHost: "https://graph.microsoft.com", refreshCount: 0 };
  const accountOf = (auth) => ACCOUNTS[String(auth || "").replace("Bearer ", "").replace(/[0-9]+$/, "")];
  globalThis.fetch = async (input, init = {}) => {
    const u = String(typeof input === "string" ? input : input.url);
    w.calls.push({ url: u, auth: init.headers && init.headers.Authorization });
    const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
    if (u.startsWith("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")) {
      const f = new URLSearchParams(init.body);
      assert.equal(f.get("client_id"), "cid");
      if (f.get("grant_type") === "authorization_code") {
        assert.ok(f.get("code_verifier"), "PKCE verifier sent");
        const m = { GOOD_A: ["AT_A", "RT_A1"], GOOD_B: ["AT_B", "RT_B1"], GOOD_C: ["AT_C", "RT_C1"] }[f.get("code")];
        return m ? j({ access_token: m[0], refresh_token: m[1], expires_in: 3600, scope: "Mail.Read" }) : j({ error: "invalid_grant" }, 400);
      }
      if (f.get("grant_type") === "refresh_token") {
        if (w.refreshFail) return j({ error: "invalid_grant", error_description: "AADSTS70000: expired\nTrace ID: x" }, 400);
        w.refreshCount++;
        const who = f.get("refresh_token").startsWith("RT_A") ? "AT_A" : "AT_B";
        return j({ access_token: who + w.refreshCount, refresh_token: "RT_" + who.slice(3) + (w.refreshCount + 1), expires_in: 3600 });
      }
    }
    if (u.startsWith("https://graph.microsoft.com/v1.0/me?")) return j({ mail: accountOf(init.headers.Authorization) });
    if (u.startsWith("https://graph.microsoft.com/v1.0/me/mailFolders/")) return j({ displayName: { F_INBOX: "Inbox", F_ARCH: "Archive" }[decodeURIComponent(u.split("/mailFolders/")[1].split("?")[0])] || "Weird" });
    if (u.includes("/me/messages")) {
      const acct = accountOf(init.headers.Authorization);
      const pages = w.messages[acct] || [[]];
      const idx = u.includes("skiptoken=") ? Number(u.split("skiptoken=")[1]) : 0;
      const value = pages[idx] || [];
      const body = { value };
      if (idx + 1 < pages.length) body["@odata.nextLink"] = w.nextLinkHost + "/v1.0/me/messages?$skiptoken=" + (idx + 1);
      return j(body);
    }
    throw new Error("unexpected fetch: " + u);
  };
  return w;
}
const msg = (id, subject, at, extra = {}) => ({ id, internetMessageId: "<" + id + "@x>", subject, receivedDateTime: at, bodyPreview: "preview of " + subject, parentFolderId: "F_INBOX", isDraft: false, from: { emailAddress: { name: "Sender", address: "s@example.com" } }, ...extra });

const ctx = { waitUntil() {}, passThroughOnException() {} };
const mkEnv = (over = {}) => ({ PERSONAL: makeD1(), API_KEY: "k", MS_CLIENT_ID: "cid", MS_CLIENT_SECRET: "sec", ...over });
const call = (env, path, init) => worker.fetch(new Request("https://twin.example" + path, init), env, ctx);
const authed = { headers: { Authorization: "Bearer k" } };
const rows = (env, sql = "SELECT * FROM email_index ORDER BY received_at") => env.PERSONAL.db.prepare(sql).all().map((r) => ({ ...r }));

async function connect(env, code) {
  const r1 = await call(env, "/microsoft/connect", { method: "POST", body: new URLSearchParams({ key: "k" }), redirect: "manual" });
  assert.equal(r1.status, 302);
  const state = new URL(r1.headers.get("location")).searchParams.get("state");
  return call(env, "/microsoft/callback?code=" + code + "&state=" + state);
}

// VERSION-UNPIN-1 (2026-10-03, ci-watchdog #577): the suite pinned "4.5.0-msgraph-mail" exactly, so every later
// personal-api release (4.5.1) failed deploy-gate. It now requires a release that carries Microsoft mail: 4.5.0 or later.
test("bundle is 4.5.0 or later and /health reports the Microsoft state", async () => {
  mockWorld();
  const env = mkEnv();
  const h = await (await call(env, "/health")).json();
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(h.version || ""));
  assert.ok(m, "health.version must start with major.minor.patch, got " + h.version);
  const v = [Number(m[1]), Number(m[2]), Number(m[3])];
  assert.ok(v[0] > 4 || (v[0] === 4 && (v[1] > 5 || (v[1] === 5 && v[2] >= 0))), "expected >= 4.5.0, got " + h.version);
  assert.equal(h.microsoft_mail, "not-connected");
});

test("status needs the API key; without client secrets connect says what is missing", async () => {
  mockWorld();
  const env = mkEnv();
  assert.equal((await call(env, "/microsoft/status")).status, 401);
  const st = await (await call(env, "/microsoft/status", authed)).json();
  assert.equal(st.configured, true);
  assert.equal(st.redirect_uri, "https://twin.example/microsoft/callback");
  const bare = mkEnv({ MS_CLIENT_ID: undefined, MS_CLIENT_SECRET: undefined });
  const r = await call(bare, "/microsoft/connect");
  assert.equal(r.status, 503);
  assert.match(await r.text(), /MS_CLIENT_ID/);
});

test("connect: wrong key refused; right key redirects with PKCE, forced account picker, read-only scope", async () => {
  mockWorld();
  const env = mkEnv();
  const bad = await call(env, "/microsoft/connect", { method: "POST", body: new URLSearchParams({ key: "nope" }) });
  assert.equal(bad.status, 401);
  const ok = await call(env, "/microsoft/connect", { method: "POST", body: new URLSearchParams({ key: "k" }), redirect: "manual" });
  assert.equal(ok.status, 302);
  const loc = new URL(ok.headers.get("location"));
  assert.equal(loc.origin + loc.pathname, "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize");
  assert.equal(loc.searchParams.get("code_challenge_method"), "S256");
  assert.ok(loc.searchParams.get("code_challenge").length >= 43);
  assert.equal(loc.searchParams.get("prompt"), "select_account");
  assert.equal(loc.searchParams.get("redirect_uri"), "https://twin.example/microsoft/callback");
  const scope = loc.searchParams.get("scope").split(" ");
  assert.ok(scope.includes("Mail.Read") && scope.includes("offline_access"));
  assert.ok(!scope.some((s) => /ReadWrite|Send|Delete/i.test(s)), "no write scopes requested");
});

test("callback: unknown state, provider error and replayed state are all refused", async () => {
  mockWorld();
  const env = mkEnv();
  assert.equal((await call(env, "/microsoft/callback?code=GOOD_A&state=forged")).status, 400);
  assert.equal((await call(env, "/microsoft/callback?error=access_denied")).status, 400);
  const r1 = await call(env, "/microsoft/connect", { method: "POST", body: new URLSearchParams({ key: "k" }), redirect: "manual" });
  const state = new URL(r1.headers.get("location")).searchParams.get("state");
  assert.equal((await call(env, "/microsoft/callback?code=GOOD_A&state=" + state)).status, 200);
  assert.equal((await call(env, "/microsoft/callback?code=GOOD_A&state=" + state)).status, 400, "state is single-use");
});

test("two mailboxes connect; a third is refused; reconnecting a known one is fine", async () => {
  const w = mockWorld();
  const env = mkEnv();
  assert.equal((await connect(env, "GOOD_A")).status, 200);
  assert.equal((await connect(env, "GOOD_B")).status, 200);
  const third = await connect(env, "GOOD_C");
  assert.equal(third.status, 403);
  assert.match(await third.text(), /does not accept stranger@outlook.com/);
  assert.equal((await connect(env, "GOOD_A")).status, 200);
  const accts = rows(env, "SELECT email FROM ms_oauth ORDER BY email").map((r) => r.email);
  assert.deepEqual(accts, ["rowan.quni@outlook.com", "rwnquni@outlook.com"]);
  const h = await (await call(env, "/health")).json();
  assert.equal(h.microsoft_mail, "connected");
  assert.ok(w.calls.every((c) => /^https:\/\/(login\.microsoftonline\.com|graph\.microsoft\.com)\//.test(c.url)), "only Microsoft hosts contacted");
});

test("MS_ALLOWED_EMAILS overrides the first-come rule", async () => {
  mockWorld();
  const env = mkEnv({ MS_ALLOWED_EMAILS: "rowan.quni@outlook.com" });
  assert.equal((await connect(env, "GOOD_A")).status, 403);
  assert.equal((await connect(env, "GOOD_B")).status, 200);
});

test("sync: pages oldest-first, folder names, categories, drafts skipped, idempotent, no model call", async () => {
  const w = mockWorld();
  w.messages["rwnquni@outlook.com"] = [
    [msg("m1", "Invoice 123 from Acme", "2026-10-01T08:00:00Z"), msg("m2", "Draft thing", "2026-10-01T09:00:00Z", { isDraft: true })],
    [msg("m3", "Your hotel booking in Krakow", "2026-10-02T10:00:00Z", { parentFolderId: "F_ARCH" })]
  ];
  const ai = { runs: 0, run: async () => { ai.runs++; return { data: [] }; } };
  const vz = { ups: 0, upsert: async () => { vz.ups++; } };
  const env = mkEnv({ AI: ai, VZ: vz });
  assert.equal((await connect(env, "GOOD_A")).status, 200); // callback does a 1-page first sync
  const run = await call(env, "/microsoft/sync?account=rwnquni@outlook.com", { method: "POST", ...authed });
  const body = await run.json();
  assert.equal(body.ok, true, JSON.stringify(body));
  const got = rows(env);
  assert.equal(got.length, 2, "draft not indexed");
  assert.deepEqual(got.map((r) => [r.subject, r.folder, r.category, r.store]), [
    ["Invoice 123 from Acme", "Inbox", "invoice", "rwnquni@outlook.com"],
    ["Your hotel booking in Krakow", "Archive", "travel", "rwnquni@outlook.com"]
  ]);
  assert.match(got[0].message_id, /^msgraph:[0-9a-f]{32}$/);
  const wm = rows(env, "SELECT watermark, last_error FROM ms_oauth")[0];
  assert.equal(wm.watermark, "2026-10-02T10:00:00Z");
  assert.equal(wm.last_error, null);
  await call(env, "/microsoft/sync?account=rwnquni@outlook.com", { method: "POST", ...authed });
  assert.equal(rows(env).length, 2, "re-sync does not duplicate");
  assert.equal(ai.runs + vz.ups, 0, "no embedding or model call unless MSGRAPH_EMBED=1");
  const flt = w.calls.filter((c) => c.url.includes("/me/messages"))[0].url;
  assert.match(decodeURIComponent(flt), /\$orderby=receivedDateTime asc/);
});

test("MSGRAPH-NO-CODES-1: the fleet's emailed code and other one-time codes are never indexed (subject nor preview), ordinary mail still is", async () => {
  const w = mockWorld();
  w.messages["rwnquni@outlook.com"] = [[
    msg("c1", "Fleet code 482913", "2026-10-03T08:00:00Z", { bodyPreview: "Your fleet.qnfo.org code is 482913. It is valid for 10 minutes." }),
    msg("c2", "Your verification code", "2026-10-03T08:01:00Z"),
    msg("c3", "Microsoft account security code", "2026-10-03T08:02:00Z"),
    msg("c4", "Welcome", "2026-10-03T08:03:00Z", { bodyPreview: "Your fleet.qnfo.org code is 111222." }),
    msg("c5", "Invoice 77 from Acme", "2026-10-03T08:04:00Z"),
    msg("c6", "Security update for your bank", "2026-10-03T08:05:00Z")
  ]];
  const env = mkEnv({});
  assert.equal((await connect(env, "GOOD_A")).status, 200);
  const run = await (await call(env, "/microsoft/sync?account=rwnquni@outlook.com", { method: "POST", ...authed })).json();
  assert.equal(run.ok, true, JSON.stringify(run));
  const subjects = rows(env).map((r) => r.subject).sort();
  assert.deepEqual(subjects, ["Invoice 77 from Acme", "Security update for your bank"]);
  assert.ok(!JSON.stringify(rows(env)).match(/482913|111222/), "no code digits stored anywhere in email_index");
  assert.equal(rows(env, "SELECT watermark FROM ms_oauth")[0].watermark, "2026-10-03T08:05:00Z", "watermark still advances past skipped mail");
});

test("sync: a row already loaded by the one-off 2026-08-29 import (opaque id) is not duplicated", async () => {
  const w = mockWorld();
  w.messages["rwnquni@outlook.com"] = [[msg("m9", "Receipt for your order", "2026-08-14T09:48:03Z")]];
  const env = mkEnv();
  env.PERSONAL.db.prepare("INSERT INTO email_index VALUES ('outlook-legacyid','rwnquni@outlook.com','Archive','x','Receipt for your order','2026-08-14T09:48:03.169000Z','invoice','','old','2026-08-29T04:34:23Z')").run();
  await connect(env, "GOOD_A");
  const r = rows(env);
  assert.equal(r.length, 1);
  assert.equal(r[0].message_id, "outlook-legacyid");
});

test("sync with MSGRAPH_EMBED=1 writes vectors in the shape retrieve() expects", async () => {
  const w = mockWorld();
  w.messages["rwnquni@outlook.com"] = [[msg("m1", "Concert tickets", "2026-10-01T08:00:00Z")]];
  const upserts = [];
  const env = mkEnv({ MSGRAPH_EMBED: "1", AI: { run: async (_m, i) => ({ data: i.text.map(() => new Array(768).fill(0.1)) }) }, VZ: { upsert: async (v) => upserts.push(...v) } });
  await connect(env, "GOOD_A");
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].metadata.doc, "email");
  assert.equal(upserts[0].metadata.message_id, rows(env)[0].message_id);
});

test("sync never follows a nextLink to another host, and records the error", async () => {
  const w = mockWorld();
  w.nextLinkHost = "https://evil.example";
  w.messages["rwnquni@outlook.com"] = [[msg("m1", "One", "2026-10-01T08:00:00Z")], [msg("m2", "Two", "2026-10-02T08:00:00Z")]];
  const env = mkEnv();
  await connect(env, "GOOD_A");
  const body = await (await call(env, "/microsoft/sync?account=rwnquni@outlook.com&pages=5", { method: "POST", ...authed })).json();
  assert.equal(body.ok, false);
  assert.match(body.accounts[0].error, /refusing non-Graph URL/);
  assert.ok(w.calls.every((c) => !c.url.includes("evil.example")), "token never sent off-Graph");
  assert.equal(rows(env, "SELECT last_error FROM ms_oauth")[0].last_error.includes("non-Graph"), true);
});

test("a page cap leaves no gap: backfill drains across runs from the watermark", async () => {
  const w = mockWorld();
  w.messages["rwnquni@outlook.com"] = [[msg("a", "A", "2026-10-01T01:00:00Z")], [msg("b", "B", "2026-10-01T02:00:00Z")], [msg("c", "C", "2026-10-01T03:00:00Z")]];
  const env = mkEnv();
  await connect(env, "GOOD_A"); // first sync, 1 page
  assert.deepEqual(rows(env).map((r) => r.subject), ["A"]);
  const r = await (await call(env, "/microsoft/sync?account=rwnquni@outlook.com&pages=1", { method: "POST", ...authed })).json();
  assert.equal(r.accounts[0].more, true);
  // the mock returns pages by skiptoken, so a later run re-reading from the watermark still converges on all three
  await call(env, "/microsoft/sync?account=rwnquni@outlook.com&pages=10", { method: "POST", ...authed });
  assert.deepEqual(rows(env).map((r) => r.subject).sort(), ["A", "B", "C"]);
});

test("refresh tokens rotate and are stored; a failed refresh is recorded, not thrown", async () => {
  const w = mockWorld();
  w.messages["rwnquni@outlook.com"] = [[msg("m1", "One", "2026-10-01T08:00:00Z")]];
  const env = mkEnv();
  await connect(env, "GOOD_A");
  env.PERSONAL.db.exec("UPDATE ms_oauth SET access_expires = 0");
  await call(env, "/microsoft/sync", { method: "POST", ...authed });
  assert.equal(rows(env, "SELECT refresh_token FROM ms_oauth")[0].refresh_token, "RT_A2", "rotated token stored");
  env.PERSONAL.db.exec("UPDATE ms_oauth SET access_expires = 0");
  w.refreshFail = true;
  const res = await (await call(env, "/microsoft/sync", { method: "POST", ...authed })).json();
  assert.equal(res.ok, false);
  assert.match(res.accounts[0].error, /microsoft-token: refresh failed HTTP 400 invalid_grant/);
  assert.ok(!res.accounts[0].error.includes("Trace ID"), "multi-line provider detail trimmed");
  const h = await (await call(env, "/health")).json();
  assert.equal(h.microsoft_mail, "error");
});

test("the daily cron syncs all connected mailboxes before building the brief, and survives a Graph failure", async () => {
  const w = mockWorld();
  w.messages["rwnquni@outlook.com"] = [[msg("m1", "Cron mail", "2026-10-03T03:00:00Z")]];
  w.messages["rowan.quni@outlook.com"] = [[msg("m2", "Other box", "2026-10-03T03:30:00Z")]];
  const env = mkEnv();
  await connect(env, "GOOD_A");
  await connect(env, "GOOD_B");
  env.PERSONAL.db.exec("DELETE FROM email_index; UPDATE ms_oauth SET watermark = NULL, access_expires = 0");
  const log = console.log; console.log = () => {};
  try { await worker.scheduled({}, env, ctx); } finally { console.log = log; }
  assert.deepEqual(rows(env).map((r) => r.store).sort(), ["rowan.quni@outlook.com", "rwnquni@outlook.com"]);
  w.refreshFail = true;
  env.PERSONAL.db.exec("UPDATE ms_oauth SET access_expires = 0");
  console.log = () => {};
  try { await worker.scheduled({}, env, ctx); } finally { console.log = log; }
});

test("MCP clients (DeepChat, Chatbox, Claude Code) see the new tools; email_search covers every mailbox and names the store", async () => {
  const w = mockWorld();
  w.messages["rwnquni@outlook.com"] = [[msg("m1", "Invoice for hotel", new Date().toISOString())]];
  w.messages["rowan.quni@outlook.com"] = [[msg("m2", "Hotel confirmation", new Date().toISOString())]];
  const env = mkEnv();
  await connect(env, "GOOD_A");
  await connect(env, "GOOD_B");
  const rpc = async (method, params) => (await (await call(env, "/mcp", { method: "POST", headers: { Authorization: "Bearer k", "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json()).result;
  const names = (await rpc("tools/list", {})).tools.map((t) => t.name);
  assert.ok(names.includes("email_sync") && names.includes("mail_accounts") && names.includes("email_search"));
  const accts = (await rpc("tools/call", { name: "mail_accounts", arguments: {} })).structuredContent;
  assert.deepEqual(accts.accounts.map((a) => a.email), ["rowan.quni@outlook.com", "rwnquni@outlook.com"]);
  assert.ok(!JSON.stringify(accts).includes("RT_"), "status never exposes tokens");
  const sync = (await rpc("tools/call", { name: "email_sync", arguments: { pages: 2 } })).structuredContent;
  assert.equal(sync.ok, true, JSON.stringify(sync));
  const found = (await rpc("tools/call", { name: "email_search", arguments: { q: "hotel", days: 5 } })).structuredContent;
  assert.equal(found.emails.length, 2);
  assert.deepEqual(found.emails.map((e) => e.store).sort(), ["rowan.quni@outlook.com", "rwnquni@outlook.com"]);
});

test("disconnect removes the token but keeps the indexed mail", async () => {
  const w = mockWorld();
  w.messages["rwnquni@outlook.com"] = [[msg("m1", "Keep me", "2026-10-01T08:00:00Z")]];
  const env = mkEnv();
  await connect(env, "GOOD_A");
  assert.equal((await call(env, "/microsoft/disconnect?account=rwnquni@outlook.com", { method: "POST" })).status, 401);
  const r = await (await call(env, "/microsoft/disconnect?account=rwnquni@outlook.com", { method: "POST", ...authed })).json();
  assert.equal(r.ok, true);
  assert.equal(rows(env, "SELECT * FROM ms_oauth").length, 0);
  assert.equal(rows(env).length, 1);
});
