// ACTIVITYPUB-KEY-1 offline suite (qnfo-gateway 3.18.0, agent_issues 2249 2413): the actor publishes publicKey/publicKeyPem
// when the AP_PUBLIC_KEY secret (cf-ops-actions gen-activitypub-key) is set and carries no publicKey field otherwise.
// WebFinger, outbox, paper objects, followers and the 501 inbox are covered by reach-funnel-ap.test.mjs (ACTIVITYPUB-READ-1).
// Run: node qnfo-gateway/activitypub.test.mjs   -> prints "N passed, 0 failed". No network: fetch is a stub.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 300) : "")); } };
const rows = [];
for (let i = 0; i < 3; i++) rows.push({ slug: "p" + i, title: "Paper " + i, abstract: "Abstract " + i, created_at: "2026-09-0" + (1 + i) + " 10:00:00", status: "published", version: "1" });
const stmt = (sql) => { const st = { a: [], bind(...a) { st.a = a; return st; },
  async all() { return { results: rows }; },
  async first() { return /COUNT/.test(sql) ? { n: rows.length } : null; }, async run() { return {}; } }; return st; };
const KEY = "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtest\n-----END PUBLIC KEY-----\n";
const base = () => ({ LIVING_PAPER: { prepare: stmt, batch: async () => [] }, DB: { prepare: stmt }, QNFO_BUCKET: { get: async () => null } });
const envOn = Object.assign(base(), { AP_PUBLIC_KEY: KEY });
const envOff = base();
const envBad = Object.assign(base(), { AP_PUBLIC_KEY: "not a pem" });
const envPriv = Object.assign(base(), { AP_PUBLIC_KEY: KEY, AP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nSECRETSECRET\n-----END PRIVATE KEY-----\n" });
globalThis.fetch = async () => new Response("", { status: 404 });
const gw = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const req = async (env, path, init = {}) => { const r = await gw.fetch(new Request("https://papers.qnfo.org" + path, init), env, { waitUntil() {} }); return { s: r.status, t: await r.text(), h: r.headers }; };
const AS = { headers: { Accept: "application/activity+json" } };

// version: a minimum, never an exact value
const v = (/var VERSION="(\d+)\.(\d+)\.(\d+)/.exec(src) || []).slice(1).map(Number);
ok(v[0] > 3 || (v[0] === 3 && v[1] >= 18), "VERSION is at least 3.18.0", v);
ok(src.split("async function handleActivityPub(").length === 2 && src.split("function apActor(").length === 2, "one ActivityPub handler and one actor builder (no duplicate route handlers after the merge)");
ok(!/AP_PRIVATE_KEY/.test(src.replace(/\/\/[^\n]*/g, "")), "the worker code never reads AP_PRIVATE_KEY");

// without the key: the read-only actor, no publicKey field at all
let r = await req(envOff, "/ap/actor", AS);
let a = JSON.parse(r.t);
ok(r.s === 200 && /activity\+json/.test(r.h.get("Content-Type")), "actor is served without the key (read-only surface stays up)", r.s);
ok(a.type === "Service" && a.id === "https://papers.qnfo.org/ap/actor" && !("publicKey" in a), "no publicKey field without AP_PUBLIC_KEY", Object.keys(a));
ok(a["@context"] === "https://www.w3.org/ns/activitystreams", "plain activitystreams context without the key", a["@context"]);
ok((await req(envOff, "/.well-known/webfinger?resource=acct:papers@papers.qnfo.org")).s === 200, "webfinger resolves without the key");

// with the key: publicKey block under the security/v1 context
r = await req(envOn, "/ap/actor", AS);
a = JSON.parse(r.t);
ok(r.s === 200 && a.type === "Service" && a.preferredUsername === "papers", "actor identity with the key", a);
ok(a.publicKey && a.publicKey.id === a.id + "#main-key" && a.publicKey.owner === a.id, "publicKey id is <actor>#main-key and owner is the actor", a.publicKey);
ok(typeof a.publicKey.publicKeyPem === "string" && a.publicKey.publicKeyPem === KEY, "publicKeyPem is the AP_PUBLIC_KEY secret verbatim (one trailing newline)", a.publicKey && a.publicKey.publicKeyPem);
ok(/publicKeyPem/.test(r.t), "the actor body contains publicKeyPem (issue 2249 runtime probe)");
ok(Array.isArray(a["@context"]) && a["@context"].indexOf("https://w3id.org/security/v1") >= 0 && a["@context"].indexOf("https://www.w3.org/ns/activitystreams") >= 0, "context adds security/v1 beside activitystreams", a["@context"]);
ok(a.inbox === "https://papers.qnfo.org/ap/inbox" && a.outbox === "https://papers.qnfo.org/ap/outbox" && a.followers === "https://papers.qnfo.org/ap/followers", "inbox, outbox and followers are unchanged by the key");
ok((await req(envOn, "/ap/actor", { method: "HEAD", ...AS })).s === 200, "HEAD on the actor is 200");

// a secret that is not a PEM public key is not published
r = await req(envBad, "/ap/actor", AS);
a = JSON.parse(r.t);
ok(r.s === 200 && !("publicKey" in a), "a non-PEM AP_PUBLIC_KEY value is not advertised", a.publicKey);

// the private key never leaves the worker
r = await req(envPriv, "/ap/actor", AS);
ok(r.s === 200 && !/PRIVATE|SECRETSECRET/.test(r.t), "no private key material in the actor", r.t.slice(0, 200));
r = await req(envPriv, "/ap/outbox?page=1", AS);
ok(r.s === 200 && !/PRIVATE|SECRETSECRET|publicKeyPem/.test(r.t), "outbox carries neither key", r.s);
r = await req(envPriv, "/.well-known/webfinger?resource=acct:papers@papers.qnfo.org");
ok(r.s === 200 && !/PRIVATE|SECRETSECRET/.test(r.t), "webfinger carries no key material", r.s);

// the rest of the read-only surface is unchanged with the key present
ok((await req(envOn, "/ap/inbox", { method: "POST", body: "{}", headers: { "Content-Type": "application/activity+json" } })).s === 501, "inbox POST is still 501 (a key is not an inbox)");
ok(JSON.parse((await req(envOn, "/ap/followers", AS)).t).totalItems === 0, "followers collection is still empty");
ok((await req(envOn, "/papers")).s !== 503, "papers pages are unaffected");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
