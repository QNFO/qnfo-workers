// ACTIVITYPUB-WEBFINGER-1 offline suite (qnfo-gateway 3.16.0): WebFinger, actor, outbox, followers, inbox, key gating.
// Run: node qnfo-gateway/activitypub.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 300) : "")); } };
const rows = [];
for (let i = 0; i < 30; i++) rows.push({ slug: "p" + String(i).padStart(3, "0"), title: "Paper " + i, authors: '["Rowan Brad Quni-Gudzinas"]', abstract: "Abstract " + i, created_at: "2026-09-" + String(1 + (i % 28)).padStart(2, "0") + " 10:00:00", updated_at: "", status: "published", version: "1" });
const stmt = (sql) => { const st = { a: [], bind(...a) { st.a = a; return st; },
  async all() { return { results: rows.slice(0, st.a[0] || 20) }; },
  async first() { return /COUNT/.test(sql) ? { n: rows.length } : null; }, async run() { return {}; } }; return st; };
const KEY = "-----BEGIN PUBLIC KEY-----\nTESTKEY\n-----END PUBLIC KEY-----\n";
const envOn = { AP_PUBLIC_KEY: KEY, LIVING_PAPER: { prepare: stmt }, DB: { prepare: stmt }, QNFO_BUCKET: { get: async () => null } };
const envOff = { LIVING_PAPER: { prepare: stmt }, DB: { prepare: stmt }, QNFO_BUCKET: { get: async () => null } };
globalThis.fetch = async () => new Response("", { status: 404 });
const gw = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const req = async (env, path, init = {}) => { const r = await gw.fetch(new Request("https://papers.qnfo.org" + path, init), env, { waitUntil() {} }); return { s: r.status, t: await r.text(), h: r.headers }; };
const AS = { headers: { Accept: "application/activity+json" } };

let r = await req(envOff, "/.well-known/webfinger?resource=acct:papers@papers.qnfo.org");
ok(r.s === 404, "webfinger is 404 until the key secret exists", r.s);
r = await req(envOff, "/ap/actor", AS);
ok(r.s === 503, "actor is 503 until the key secret exists", r.s);

r = await req(envOn, "/.well-known/webfinger?resource=acct:papers@papers.qnfo.org");
const j = r.s === 200 ? JSON.parse(r.t) : {};
ok(r.s === 200 && /application\/jrd\+json/.test(r.h.get("Content-Type")), "webfinger 200 as jrd+json", r.h.get("Content-Type"));
ok(j.subject === "acct:papers@papers.qnfo.org" && j.links.some((l) => l.rel === "self" && l.type === "application/activity+json" && l.href === "https://papers.qnfo.org/ap/actor"), "self link to the actor", j);
ok(j.links.some((l) => l.rel === "http://webfinger.net/rel/profile-page" && l.type === "text/html"), "profile-page link");
ok(r.h.get("Access-Control-Allow-Origin") === "*", "webfinger CORS");
ok((await req(envOn, "/.well-known/webfinger?resource=acct:PAPERS@Papers.qnfo.org")).s === 200, "resource match is case-insensitive");
ok((await req(envOn, "/.well-known/webfinger?resource=https://papers.qnfo.org/ap/actor")).s === 200, "actor URL is a valid resource");
ok((await req(envOn, "/.well-known/webfinger?resource=acct:other@papers.qnfo.org")).s === 404, "unknown account is 404");
ok((await req(envOn, "/.well-known/webfinger")).s === 404, "missing resource is 404");

r = await req(envOn, "/ap/actor", AS);
const a = JSON.parse(r.t);
ok(r.s === 200 && /activity\+json/.test(r.h.get("Content-Type")) && /Accept/.test(r.h.get("Vary")), "actor is activity+json with Vary: Accept", r.h.get("Vary"));
ok(a.type === "Service" && a.preferredUsername === "papers" && a.id === "https://papers.qnfo.org/ap/actor", "actor identity", a);
ok(a.publicKey.owner === a.id && a.publicKey.id === a.id + "#main-key" && a.publicKey.publicKeyPem === KEY, "publicKey block", a.publicKey);
ok(a.inbox.endsWith("/ap/inbox") && a.outbox.endsWith("/ap/outbox") && a.manuallyApprovesFollowers === true, "inbox/outbox/followers declared");
ok(!/PRIVATE/.test(r.t) && !JSON.stringify(a).includes("AP_PRIVATE"), "no private key in the actor");
r = await req(envOn, "/ap/actor", { headers: { Accept: "text/html" } });
ok(r.s === 303 && r.h.get("Location") === "https://papers.qnfo.org/papers" && /Accept/.test(r.h.get("Vary")), "browsers are sent to the papers page", r.s);

r = await req(envOn, "/ap/outbox", AS);
let o = JSON.parse(r.t);
ok(o.type === "OrderedCollection" && o.totalItems === 30 && /page=1/.test(o.first), "outbox collection", o);
r = await req(envOn, "/ap/outbox?page=1", AS);
o = JSON.parse(r.t);
ok(o.type === "OrderedCollectionPage" && o.orderedItems.length === 20 && o.orderedItems[0].type === "Create" && o.orderedItems[0].object.type === "Article", "outbox page of 20 Create/Article", o.orderedItems && o.orderedItems.length);
ok(o.orderedItems.every((i) => i.object.url.startsWith("https://papers.qnfo.org/papers/") && i.actor === "https://papers.qnfo.org/ap/actor"), "items link to papers and name the actor");
r = await req(envOn, "/ap/followers", AS);
ok(JSON.parse(r.t).totalItems === 0, "followers collection is honestly empty");

r = await req(envOn, "/ap/inbox", { method: "POST", body: "{}", headers: { "Content-Type": "application/activity+json" } });
ok(r.s === 501 && /inbox_not_implemented/.test(r.t), "inbox POST is 501, not a silent accept", r.s);
ok((await req(envOn, "/ap/inbox")).s === 405, "inbox GET is 405");
ok((await req(envOn, "/ap/actor", { method: "OPTIONS" })).s === 204, "OPTIONS preflight");
ok((await req(envOn, "/papers")).s !== 503, "papers pages are unaffected");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
