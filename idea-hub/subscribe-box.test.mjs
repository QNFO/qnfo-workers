// REACH-IDEA-1 offline suite (idea-hub 1.5.7, agent_issues 2001): the ideas.qnfo.org home page carries an email input (the
// REACH-IDEATION-1 'subscribe-box' check: type="email"), and POST /api/subscribe forwards the address to the qnfo-subscribers
// double opt-in with source ideas.qnfo.org, keeping the honeypot; a bad address never leaves the worker.
// Run: node idea-hub/subscribe-box.test.mjs   -> prints "N passed, 0 failed"
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const stmt = { bind() { return stmt; }, async all() { return { results: [] }; }, async first() { return null; }, async run() { return {}; } };
const env = { QNFO_AUDIT: { prepare: () => stmt } };
const store = new Map();
globalThis.caches = { default: { async match(r) { const e = store.get(r.url); return e ? new Response(e.b, { headers: e.h }) : undefined; }, async put(r, res) { store.set(r.url, { b: await res.text(), h: new Headers(res.headers) }); } } };
const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => { sent.push({ url: String(url), init }); return new Response(JSON.stringify({ ok: true, pending: true }), { status: 200, headers: { "Content-Type": "application/json" } }); };
const w = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const ctx = { waitUntil() {} };

const home = await (await w.fetch(new Request("https://ideas.qnfo.org/"), env, ctx)).text();
ok(/type=["']email["']/i.test(home), "home page carries an email input (the REACH-IDEATION-1 subscribe-box check)");
ok(/id="ideas-sub-form"/.test(home) && /fetch\('\/api\/subscribe'/.test(home), "the form posts to /api/subscribe on the same origin");
ok(/name="website"[^>]*tabindex="-1"/.test(home) || /tabindex="-1"[^>]*name="website"/.test(home) || /id="ideas-sub-hp"/.test(home), "honeypot field present");

const post = (body, ip) => w.fetch(new Request("https://ideas.qnfo.org/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip || "1.2.3.4", "User-Agent": "Mozilla/5.0" }, body: JSON.stringify(body) }), env, ctx);
let r = await post({ email: "  Reader@Example.org ", hp: "" });
let j = await r.json();
ok(r.status === 200 && j.ok === true, "a valid address is forwarded and the opt-in answer is returned", j);
ok(sent.length === 1 && sent[0].url === "https://qnfo-subscribers.q08.workers.dev/subscribe" && sent[0].init.method === "POST", "forwarded to the qnfo-subscribers double opt-in", sent[0] && sent[0].url);
const fwd = JSON.parse(sent[0].init.body);
ok(fwd.email === "reader@example.org" && fwd.source === "ideas.qnfo.org" && fwd.hp === "", "email normalised, source ideas.qnfo.org, honeypot passed through", fwd);
ok(sent[0].init.headers["X-Forwarded-For"] === "1.2.3.4", "client IP forwarded for the subscriber rate limit");
r = await post({ email: "not-an-address" });
ok(r.status === 400 && sent.length === 1, "a bad address is refused locally and never forwarded");
await post({ email: "bot@example.org", website: "spam" });
ok(JSON.parse(sent[1].init.body).hp === "spam", "a filled honeypot is passed on so qnfo-subscribers drops it silently");
globalThis.fetch = async () => { throw new Error("down"); };
r = await post({ email: "x@example.org" });
ok(r.status === 502, "an unreachable subscriber service is a 502 with a plain message");
const get = await w.fetch(new Request("https://ideas.qnfo.org/api/subscribe"), env, ctx);
ok(get.status === 404, "GET /api/subscribe is not a route (POST only)");
globalThis.fetch = realFetch;
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
