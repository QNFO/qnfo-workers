// personal-api 4.21.0 COMPANION-MCP-CONSENT-CODE-1 suite (agent_issues 100232, charter pillar: personal).
// Loads the real worker.js and drives /oauth/register, /oauth/authorize and /oauth/token over node:sqlite stand-ins. Proves: the consent page
// offers "E-mail me a code" and no longer requires the key; the e-mailed code approves (wrong code does not) and signs the device in; a live
// session approves without a key or a code, but only with the consent token bound to the client, redirect and challenge (a cookie-only forged
// POST is refused); the key still works as the fallback; deny returns access_denied; the code the flow issues redeems at /oauth/token with PKCE.
// Run: node personal-api/oauth-consent-code.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const W = mod.default;
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const raw = new DatabaseSync(":memory:");
const wrap = (d) => ({
  prepare(sql) {
    let args = [];
    const s = {
      bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
      async all() { return { results: d.prepare(sql).all(...args) }; },
      async first() { return d.prepare(sql).get(...args) || null; },
      async run() { const r = d.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
      _run() { return d.prepare(sql).run(...args); }
    };
    return s;
  },
  async batch(stmts) { const out = []; for (const st of stmts) out.push(await st.run()); return out; }
});
const sent = [];
const env = { PERSONAL: wrap(raw), API_KEY: "test-api-key-4210", SEND_EMAIL: { send: async (m) => { sent.push(m); } } };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const call = (path, init) => W.fetch(new Request("https://me.q08.org" + path, init), env, ctx);

const verifier = "v".repeat(60);
const challenge = createHash("sha256").update(verifier).digest("base64url");
const redirect = "https://client.example/cb";
const reg = await call("/oauth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "Test MCP", redirect_uris: [redirect], token_endpoint_auth_method: "none" }) });
const client = await reg.json();
ok(reg.status === 201 && /^twin-/.test(client.client_id), "client registered", client);

const base = { response_type: "code", client_id: client.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: "S256", state: "st1", scope: "twin" };
const qs = new URLSearchParams(base).toString();
const post = (fields, cookie) => call("/oauth/authorize", { method: "POST", redirect: "manual", headers: Object.assign({ "Content-Type": "application/x-www-form-urlencoded" }, cookie ? { Cookie: cookie } : {}), body: new URLSearchParams(Object.assign({}, base, fields)).toString() });
const cb = (r) => { const l = r.headers.get("Location"); return l ? new URL(l) : null; };

// 1. the page
let r = await call("/oauth/authorize?" + qs, { redirect: "manual" });
let html = await r.text();
ok(r.status === 200 && /E-mail me a code/.test(html), "the consent page offers E-mail me a code");
ok(!/name="key"[^>]*required/.test(html) && !/required[^>]*name="key"/.test(html), "the key field is not required");
ok(html.indexOf('name="code"') > -1 && html.indexOf('name="code"') < html.indexOf('name="key"') && /<details>/.test(html) && html.indexOf("<details>") < html.indexOf('name="key"'), "the code comes first and the key sits only inside the fallback details block");
ok(/rwnquni@outlook\.com/.test(html) === false && /…@outlook\.com/.test(html), "the address is masked on the page");

// 2. nothing approves without a proof
r = await post({ decision: "allow" });
ok(r.status === 401 && !r.headers.get("Location"), "allow with no proof is refused");
r = await post({ decision: "allow", key: "wrong" });
ok(r.status === 401 && !r.headers.get("Location"), "allow with a wrong key is refused");

// 3. e-mailed code
r = await post({ decision: "sendcode" });
html = await r.text();
ok(r.status === 200 && sent.length === 1 && /Sent to/.test(html), "sendcode e-mails one code and says where it went", { status: r.status, sent: sent.length });
const code = /Your code is (\d{6})/.exec(sent[0].text)[1];
ok(sent[0].to === "rwnquni@outlook.com", "the code goes to the owner only");
r = await post({ decision: "allow", code: code === "000000" ? "000001" : "000000" });
ok(r.status === 401 && !r.headers.get("Location"), "a wrong code does not approve");
r = await post({ decision: "allow", code });
let u = cb(r);
ok(r.status === 302 && u && u.origin + u.pathname === redirect && u.searchParams.get("state") === "st1" && u.searchParams.get("code"), "the right code approves and redirects to the client with a code", { status: r.status, loc: r.headers.get("Location") });
const cookie = (r.headers.get("Set-Cookie") || "").split(";")[0];
ok(/^cmp_s=[0-9a-f]{64}$/.test(cookie), "approving by code leaves the device signed in");
r = await post({ decision: "allow", code });
ok(r.status === 401, "the code is single use");

// 4. the issued code redeems with PKCE
const tok = await call("/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: u.searchParams.get("code"), client_id: client.client_id, redirect_uri: redirect, code_verifier: verifier }).toString() });
const tj = await tok.json();
ok(tok.status === 200 && tj.access_token && tj.refresh_token, "the authorization code redeems at /oauth/token", tj);

// 5. a live session approves without key or code, bound by the consent token
r = await call("/oauth/authorize?" + qs, { redirect: "manual", headers: { Cookie: cookie } });
html = await r.text();
ok(r.status === 200 && /You are signed in/.test(html) && html.indexOf('name="key"') < 0 && html.indexOf('name="code"') < 0, "with a session the page has no key and no code field");
const ct = /name="ct" value="([A-Za-z0-9_-]{43})"/.exec(html);
ok(!!ct, "the page carries a consent token");
r = await post({ decision: "allow", ct: ct[1] }, cookie);
u = cb(r);
ok(r.status === 302 && u && u.searchParams.get("code") && !r.headers.get("Set-Cookie"), "session plus consent token approves (no new cookie)", { status: r.status });
r = await post({ decision: "allow" }, cookie);
ok(r.status === 401 && !r.headers.get("Location"), "a cookie without the consent token is refused (forged form)");
r = await post({ decision: "allow", ct: "0".repeat(43) }, cookie);
ok(r.status === 401, "a wrong consent token is refused");
r = await post({ decision: "allow", ct: ct[1], code_challenge: createHash("sha256").update("other").digest("base64url") }, cookie);
ok(r.status === 401, "the token is bound to the PKCE challenge, so it does not carry to another request");
r = await post({ decision: "allow", ct: ct[1] });
ok(r.status === 401, "the token without the session cookie is refused");

// 6. key fallback and deny
r = await post({ decision: "allow", key: env.API_KEY });
u = cb(r);
ok(r.status === 302 && u && u.searchParams.get("code"), "the personal API key still approves as the fallback");
r = await post({ decision: "deny" });
u = cb(r);
ok(r.status === 302 && u && u.searchParams.get("error") === "access_denied" && u.searchParams.get("state") === "st1", "deny returns access_denied with the state");

// 7. unknown client stays refused
r = await call("/oauth/authorize?" + new URLSearchParams(Object.assign({}, base, { client_id: "twin-nope" })).toString(), { redirect: "manual" });
ok(r.status === 400, "an unknown client is refused before any consent");

ok(/COMPANION-MCP-CONSENT-CODE-1/.test(src) && /var VERSION = "4\.2[1-9]|var VERSION = "[5-9]\./.test(src), "worker.js carries the marker and a version at or above 4.21.0");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
