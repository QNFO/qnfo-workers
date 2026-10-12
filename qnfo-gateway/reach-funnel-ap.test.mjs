// REACH-RENDER-1 offline suite (qnfo-gateway 3.15.0): the subscribe page and its fallback, the honeypot field name, the
// subscribe-box view beacon, ask links that carry no question in their href, the work-with-me link in the QWAV footer and
// the read-only ActivityPub surface (WebFinger RFC 7033, ActivityPub actor and outbox, ActivityStreams 2.0 vocabulary).
// Run: node qnfo-gateway/reach-funnel-ap.test.mjs   -> prints "N passed, 0 failed". No network: fetch is a stub.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 500) : "")); } };

const rows = [];
for (let i = 0; i < 45; i++) rows.push({ slug: "paper-" + String(i).padStart(2, "0"), title: "Paper *" + i + "* on $x_" + i + "$", abstract: "Abstract <b>" + i + "</b> & more " + "word ".repeat(i === 0 ? 200 : 3), created_at: "2026-07-04 16:12:" + String(i).padStart(2, "0"), status: "published", version: "1.0" });
const stmt = (sql) => { const st = { a: [], bind(...a) { st.a = a; return st; },
  async all() { if (/LIMIT \?1 OFFSET \?2/.test(sql)) return { results: rows.slice(st.a[1], st.a[1] + st.a[0]) }; return { results: rows.slice(0, 24) }; },
  async first() { if (/COUNT/.test(sql)) return { n: rows.length, cnt: rows.length, count: rows.length }; const slug = st.a[st.a.length - 1]; return rows.find((r) => r.slug === slug) || null; },
  async run() { return {}; } }; return st; };
const env = { LIVING_PAPER: { prepare: stmt, batch: async () => [] }, DB: { prepare: stmt }, QNFO_BUCKET: { get: async () => null } };
const calls = [];
let upstream = () => new Response("Not found", { status: 404 });
globalThis.fetch = async (url, init) => { calls.push({ url: String(url && url.url || url), init: init || {} }); return upstream(String(url && url.url || url), init || {}); };
const gw = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const waits = [];
const ctx = { waitUntil(p) { waits.push(p); } };
const req = async (host, path, init) => { const r = await gw.fetch(new Request("https://" + host + path, init), env, ctx); return { s: r.status, t: await r.text(), h: r.headers }; };
const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0", Accept: "text/html" };

// version: a minimum, never an exact value
const v = (/var VERSION="(\d+)\.(\d+)\.(\d+)/.exec(src) || []).slice(1).map(Number);
ok(v[0] > 3 || (v[0] === 3 && v[1] >= 15), "VERSION is at least 3.15.0", v);

// ---- /subscribe ----
let r = await req("qnfo.org", "/subscribe", { headers: UA });
ok(r.s === 200 && /text\/html/.test(r.h.get("Content-Type")) && /id="ld-sub-form"/.test(r.t) && /type="email"/.test(r.t) && /work-with-me/.test(r.t), "GET qnfo.org/subscribe serves the gateway page with the subscribe box while qnfo-subscribers has no page", r.t.slice(0, 300));
ok(r.h.get("X-Subscribe-Page") === "gateway-fallback" && /rel="canonical" href="https:\/\/qnfo\.org\/subscribe"/.test(r.t), "the fallback names itself and its canonical address");
ok(calls.some((c) => /qnfo-subscribers\.q08\.workers\.dev\/subscribe\?source=qnfo\.org$/.test(c.url) && (c.init.method || "GET") === "GET"), "the subscribers page is asked first", calls.map((c) => c.url));
upstream = (url, init) => /\/subscribe\?/.test(url) ? new Response("<!doctype html><html><head><title>S</title></head><body><form method=\"post\" action=\"/subscribe\"><input type=\"email\" name=\"email\"></form></body></html>", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }) : new Response(null, { status: 204 });
r = await req("qnfo.org", "/subscribe?utm_source=linkedin", { headers: UA });
ok(r.s === 200 && r.h.get("X-Subscribe-Page") === "qnfo-subscribers" && /action="\/subscribe"/.test(r.t), "when qnfo-subscribers answers 200 HTML its page is served", r.t.slice(0, 200));
ok(calls.some((c) => /\/subscribe\?source=linkedin$/.test(c.url)), "the utm_source is passed on as the source");
upstream = () => { throw new Error("connect failed"); };
r = await req("qnfo.org", "/subscribe", { headers: UA });
ok(r.s === 200 && r.h.get("X-Subscribe-Page") === "gateway-fallback", "an upstream failure degrades to the gateway page, not an error", r.s);
upstream = (url, init) => new Response("<p>Check your inbox</p>", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
calls.length = 0;
r = await req("qnfo.org", "/subscribe", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "CF-Connecting-IP": "203.0.113.9", ...UA }, body: "email=a%40example.org&source=subscribe-page" });
const post = calls.find((c) => /\/subscribe$/.test(c.url));
ok(r.s === 200 && /Check your inbox/.test(r.t) && post && post.init.method === "POST" && post.init.body === "email=a%40example.org&source=subscribe-page" && post.init.headers["X-Forwarded-For"] === "203.0.113.9", "the page's form post is forwarded with its body and the visitor address", post && post.init);
r = await req("qnfo.org", "/subscribe", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": "9000" }, body: "x".repeat(9000) });
ok(r.s === 413, "an oversized form post is refused", r.s);
r = await gw.fetch(new Request("https://papers.qnfo.org/subscribe?utm_source=rss"), env, ctx);
ok(r.status === 301 && r.headers.get("Location") === "https://qnfo.org/subscribe?utm_source=rss", "papers.qnfo.org/subscribe redirects to the one subscribe page", r.headers.get("Location"));
r = await req("qnfo.org", "/sitemap.xml");
ok(/<loc>https:\/\/qnfo\.org\/subscribe<\/loc>/.test(r.t), "the sitemap lists the subscribe page");

// ---- honeypot ----
ok(!/name="website"/.test(src), "no form field is named website (autofill fills it)");
const hpNames = [...src.matchAll(/id="ld-hp"[^>]*name="([^"]+)"|name="([^"]+)"[^>]*id="ld-hp"/g)].map((m) => m[1] || m[2]);
ok(hpNames.length === 2 && hpNames.every((n) => !/web|url|site|name|mail|phone|tel|addr|city|zip|post|org|company|user|search/i.test(n)), "both honeypot fields carry a name no autofill heuristic matches", hpNames);
ok((src.match(/id="ld-hp"[^>]*autocomplete="off"/g) || []).length === 2, "both honeypot fields keep autocomplete off");

// ---- funnel view ----
upstream = () => new Response(null, { status: 204 });
for (const [host, path, source] of [["qnfo.org", "/", "qnfo.org"], ["papers.qnfo.org", "/papers", null]]) {
  r = await req(host, path, { headers: UA });
  ok(r.s === 200 && /\/api\/funnel\/view\?source=/.test(r.t) && /sendBeacon/.test(r.t), host + path + " carries the box-view beacon next to its subscribe box", r.s);
  if (source) ok(r.t.indexOf("/api/funnel/view?source=" + encodeURIComponent(source) + "'") > 0, "the beacon names its surface");
}
calls.length = 0; waits.length = 0;
let slow;
upstream = () => new Promise((res) => { slow = () => res(new Response(null, { status: 204 })); });
r = await req("qnfo.org", "/api/funnel/view?source=qnfo.org%7C%2Fabout", { method: "POST", headers: UA });
ok(r.s === 204 && waits.length === 1 && calls.length === 1, "the view answers 204 at once and forwards in waitUntil (the upstream had not answered yet)", { s: r.s, waits: waits.length });
ok(/qnfo-subscribers\.q08\.workers\.dev\/funnel\/view\?source=qnfo\.org%7C%2Fabout$/.test(calls[0].url) && calls[0].init.method === "POST" && /Firefox/.test(calls[0].init.headers["User-Agent"]), "it is forwarded as POST /funnel/view?source=<surface> with the visitor's User-Agent", calls[0]);
slow(); await Promise.all(waits);
upstream = () => { throw new Error("down"); };
waits.length = 0;
r = await req("papers.qnfo.org", "/api/funnel/view?source=papers", { method: "POST" });
let threw = false; try { await Promise.all(waits); } catch (e) { threw = true; }
ok(r.s === 204 && !threw, "a failed forward is caught: the page never sees it");
calls.length = 0;
r = await req("qnfo.org", "/api/funnel/view?source=%3Cscript%3E", { method: "POST" });
ok(r.s === 204 && calls.every((c) => !/[<>]|%3C/i.test(c.url)), "a source is reduced to plain characters before it is forwarded", calls.map((c) => c.url));
const bound = [];
r = await gw.fetch(new Request("https://qnfo.org/api/funnel/view?source=about", { method: "POST" }), { ...env, SUBSCRIBERS: { fetch: async (q) => { bound.push(q.url); return new Response(null, { status: 204 }); } } }, ctx);
ok(r.status === 204 && bound.length === 1 && /\/funnel\/view\?source=about$/.test(bound[0]), "a SUBSCRIBERS service binding is used when one is bound", bound);

// ---- ask links ----
upstream = () => new Response("Not found", { status: 404 });
r = await req("papers.qnfo.org", "/papers", { headers: UA });
const hrefs = [...r.t.matchAll(/<a\b[^>]*href="([^"]*ask\.qwav\.tech[^"]*)"[^>]*>/g)];
ok(hrefs.length > 5 && hrefs.every((m) => m[1].indexOf("?q=") < 0), "no link on the library page carries an ask question in its href", hrefs.filter((m) => m[1].indexOf("?q=") >= 0).slice(0, 2).map((m) => m[0]));
const askLinks = [...r.t.matchAll(/<a\b[^>]*data-ask-q="[^"]+"[^>]*>/g)].map((m) => m[0]);
ok(askLinks.length >= 20 && askLinks.every((a) => /rel="nofollow"/.test(a) && /href="https:\/\/ask\.qwav\.tech\/"/.test(a)), "each Ask-about-it link is rel=nofollow, points at the ask page alone and keeps its question in data-ask-q", askLinks[0]);
ok(/a\[data-ask-q\]/.test(r.t) && /pointerdown/.test(r.t) && /focusin/.test(r.t), "the page script adds the question on pointer, touch, key or focus");
r = await req("papers.qnfo.org", "/papers?search=zzzznomatch", { headers: UA });
ok(!/href="[^"]*ask\.qwav\.tech\/\?q=/.test(r.t), "an empty search result does not link to an answered question");
r = await req("qnfo.org", "/no-such-page-here", { headers: UA });
ok(r.s === 404 && !/ask\.qwav\.tech\/\?q=/.test(r.t) && /work-with-me/.test(r.t), "the 404 page links the ask page without a question, and the work-with-me page", r.s);
ok(!/ask\.qwav\.tech\/\?q=|LP_ASK \+ "\/\?q="/.test(src), "the worker builds no ask link with ?q= in its href");

// ---- work-with-me on the QWAV hosts ----
for (const host of ["qwav.org", "qwav.tech"]) {
  r = await req(host, "/", { headers: UA });
  ok(r.s === 200 && /<a href="https:\/\/qnfo\.org\/work-with-me">Work with me<\/a>/.test(r.t), host + " links the work-with-me page in its footer", r.s);
}

// ---- ActivityPub, read-only ----
const J = (x) => JSON.parse(x.t);
r = await req("papers.qnfo.org", "/.well-known/webfinger?resource=acct:papers@papers.qnfo.org");
let j = J(r);
ok(r.s === 200 && /^application\/jrd\+json/.test(r.h.get("Content-Type")) && r.h.get("Access-Control-Allow-Origin") === "*", "WebFinger answers application/jrd+json with CORS (RFC 7033 sections 4.4 and 5)", r.h.get("Content-Type"));
const self = (j.links || []).find((l) => l.rel === "self");
ok(j.subject === "acct:papers@papers.qnfo.org" && self && self.type === "application/activity+json" && self.href === "https://papers.qnfo.org/ap/actor" && j.aliases.includes(self.href), "the JRD names the subject and a self link of type application/activity+json to the actor", j);
ok((await req("papers.qnfo.org", "/.well-known/webfinger")).s === 400, "no resource parameter -> 400 (RFC 7033 4.2)");
ok((await req("papers.qnfo.org", "/.well-known/webfinger?resource=acct:nobody@papers.qnfo.org")).s === 404 && (await req("papers.qnfo.org", "/.well-known/webfinger?resource=acct:papers@example.org")).s === 404, "an unknown resource -> 404");
ok((await req("papers.qnfo.org", "/.well-known/webfinger?resource=ACCT:Papers@Papers.QNFO.org")).s === 200 && (await req("papers.qnfo.org", "/.well-known/webfinger?resource=https://papers.qnfo.org/ap/actor")).s === 200, "the account is matched case-insensitively and the actor URL resolves too");
j = J(await req("papers.qnfo.org", "/.well-known/webfinger?resource=acct:papers@papers.qnfo.org&rel=self"));
ok(j.links.length === 1 && j.links[0].rel === "self", "the rel parameter filters the links (RFC 7033 4.3)", j.links);

r = await req("papers.qnfo.org", "/ap/actor", { headers: { Accept: "application/activity+json" } });
const actor = J(r);
ok(r.s === 200 && /^application\/activity\+json/.test(r.h.get("Content-Type")), "the actor is served as application/activity+json", r.h.get("Content-Type"));
ok([].concat(actor["@context"]).includes("https://www.w3.org/ns/activitystreams") && actor.id === "https://papers.qnfo.org/ap/actor" && actor.id === self.href && ["Person", "Service", "Application", "Group", "Organization"].includes(actor.type), "the actor has the ActivityStreams context, the id WebFinger points at and an actor type", actor);
ok(/^https:\/\/papers\.qnfo\.org\/ap\/inbox$/.test(actor.inbox) && /^https:\/\/papers\.qnfo\.org\/ap\/outbox$/.test(actor.outbox) && actor.followers && actor.following && actor.preferredUsername === "papers", "the actor has inbox and outbox (ActivityPub 4.1 MUST) plus followers, following and preferredUsername");
ok(actor.publicKey === undefined && /read-only/.test(actor.summary), "no key is published and the summary says the account is read-only");

r = await req("papers.qnfo.org", "/ap/outbox");
const box = J(r);
ok(r.s === 200 && box.type === "OrderedCollection" && box.id === actor.outbox && box.totalItems === 45 && box.first === actor.outbox + "?page=1" && box.last === actor.outbox + "?page=3" && box.orderedItems === undefined, "the outbox is an OrderedCollection with totalItems, first and last (ActivityPub 5.1)", box);
r = await req("papers.qnfo.org", "/ap/outbox?page=1");
const pg = J(r);
ok(pg.type === "OrderedCollectionPage" && pg.partOf === box.id && pg.id === box.first && pg.orderedItems.length === 20 && pg.next === box.id + "?page=2" && pg.prev === undefined, "page 1 is an OrderedCollectionPage of 20 with next and no prev", { n: pg.orderedItems.length, next: pg.next });
const last = J(await req("papers.qnfo.org", "/ap/outbox?page=3"));
ok(last.orderedItems.length === 5 && last.next === undefined && last.prev === box.id + "?page=2", "the last page has prev and no next");
ok((await req("papers.qnfo.org", "/ap/outbox?page=4")).s === 404 && (await req("papers.qnfo.org", "/ap/outbox?page=0")).s === 404 && (await req("papers.qnfo.org", "/ap/outbox?page=x")).s === 404, "pages outside the collection -> 404");
const act = pg.orderedItems[0], obj = act.object;
ok(act.type === "Create" && act.actor === actor.id && obj.type === "Article" && obj.attributedTo === actor.id && act.to.includes("https://www.w3.org/ns/activitystreams#Public") && obj.to.includes("https://www.w3.org/ns/activitystreams#Public") && act.cc.includes(actor.followers), "each item is a Create of an Article by the actor, addressed to Public", act);
ok(obj.url === "https://papers.qnfo.org/papers/paper-00" && obj.id === "https://papers.qnfo.org/ap/papers/paper-00" && act.id === obj.id + "/activity" && act.id !== obj.id, "object and activity have distinct ids on this host; url is the paper page");
ok(obj.published === "2026-07-04T16:12:00Z" && act.published === obj.published, "published is an xsd:dateTime in UTC", obj.published);
ok(obj.name === "Paper 0 on x_0" || (!/[*$]/.test(obj.name) && /Paper/.test(obj.name)), "the name is the plain-text title", obj.name);
ok(!/<b>/.test(obj.content) && /&lt;b&gt;|Abstract 0/.test(obj.content) && /<a href="https:\/\/papers\.qnfo\.org\/papers\/paper-00">/.test(obj.content) && obj.content.length < 900 && obj.summary === undefined, "content is escaped HTML with the link and a cut abstract; no summary (it would read as a content warning)", obj.content);
r = await req("papers.qnfo.org", "/ap/papers/paper-07");
j = J(r);
ok(r.s === 200 && j.type === "Article" && j.id === "https://papers.qnfo.org/ap/papers/paper-07" && j["@context"], "an Article id dereferences to the Article");
j = J(await req("papers.qnfo.org", "/ap/papers/paper-07/activity"));
ok(j.type === "Create" && j.object.id === "https://papers.qnfo.org/ap/papers/paper-07" && j["@context"], "a Create id dereferences to the Create");
ok((await req("papers.qnfo.org", "/ap/papers/none")).s === 404, "an unknown paper -> 404");
j = J(await req("papers.qnfo.org", "/ap/followers"));
ok(j.type === "OrderedCollection" && j.totalItems === 0 && j.id === actor.followers, "followers is an empty OrderedCollection (nothing is recorded)");
r = await req("papers.qnfo.org", "/ap/inbox", { method: "POST", headers: { "Content-Type": "application/activity+json" }, body: JSON.stringify({ type: "Follow" }) });
ok(r.s === 501 && /read-only/.test(r.t), "POST to the inbox answers 501: no Follow is accepted or stored", r.s);
ok((await req("papers.qnfo.org", "/ap/inbox")).s === 405 && (await req("papers.qnfo.org", "/ap/actor", { method: "POST" })).s === 405, "wrong methods -> 405");
ok((await req("qnfo.org", "/.well-known/webfinger?resource=acct:papers@papers.qnfo.org", { headers: { Accept: "application/json" } })).s === 404, "the actor lives on papers.qnfo.org only");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
