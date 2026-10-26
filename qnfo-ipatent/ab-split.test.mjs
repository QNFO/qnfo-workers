// AB-SPLIT-V2-1 offline suite (IPATENT-UI-OVERHAUL-1 step 2, agent_issues 2049) as changed by BP26-NO-TRACKING-1 (agent_issues 1000345): a human GET / without v is drawn onto arm 1
// (default page, counted "/") or arm 2 (302 to ?v=2, counted "/?v=2") at random for EACH page load, with no cookie; a browser that still holds the retired ipatent_ab cookie gets one
// deletion header that sets nothing; crawlers, HEAD, explicit ?v= and share 0 keep the old behaviour; other query parameters survive the redirect.
// Run: node qnfo-ipatent/ab-split.test.mjs   (prints "N passed, 0 failed")
import { versionAtLeast } from "../scripts/version-at-least.mjs";
const mod = await import("./worker.js");
const W = mod.default, { abArm, abShare } = mod;
let passed = 0, failed = 0;
const ok = (c, l, x) => { if (c) passed++; else { failed++; console.error("FAIL " + l + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
const HUMAN = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
const req = (u, h = {}, method = "GET") => new Request(u, { method, headers: { "User-Agent": HUMAN, ...h } });
const U = "https://ipatent.qnfo.org/";

// abShare: env override, then ops_config through AUDIT (cached), else 0
ok(await abShare({}) === 0 && await abShare({ IPATENT_V2_SHARE: "" }) === 0, "no override and no AUDIT: split off");
ok(await abShare({ IPATENT_V2_SHARE: "0" }) === 0 && await abShare({ IPATENT_V2_SHARE: "2" }) === 1 && await abShare({ IPATENT_V2_SHARE: "0.5" }) === 0.5, "the env override clamps");
let reads = 0;
const audit = (v) => ({ prepare(sql) { return { async first() { reads++; if (v instanceof Error) throw v; return /ipatent_v2_share/.test(sql) && v !== null ? { value: v } : null; } }; } });
ok(await abShare({ AUDIT: audit(new Error("d1 down")) }, 1e12) === 0, "a failed ops_config read is 0");
ok(await abShare({ AUDIT: audit("0.5") }, 1e12 + 1) === 0, "the 5-minute cache holds the last value");
ok(await abShare({ AUDIT: audit("0.5") }, 1e12 + 4e5) === 0.5 && reads === 2, "after 5 minutes ops_config is read again");
ok(await abShare({ AUDIT: audit("0") }, 1e12 + 8e5) === 0, "ops_config 0 turns the split off");
const ON = { IPATENT_V2_SHARE: "0.5" };

// abArm
let a = await abArm(req(U), new URL(U), ON, () => 0.1);
ok(a && a.arm === "2" && a.redirect === "/?v=2" && a.cookie === null, "a low draw goes to arm 2 and sets no cookie", a);
a = await abArm(req(U), new URL(U), ON, () => 0.9);
ok(a && a.arm === "1" && a.redirect === null && a.cookie === null, "a high draw stays on the default page and sets no cookie", a);
a = await abArm(req(U, { Cookie: "x=1; ipatent_ab=2" }), new URL(U), ON, () => 0.9);
ok(a && a.arm === "1" && a.redirect === null, "a retired cookie no longer decides the arm: the draw does", a);
ok(a && /^ipatent_ab=; Path=\/; Max-Age=0; SameSite=Lax; Secure$/.test(a.cookie), "a browser holding the retired cookie gets one deletion header", a);
a = await abArm(req(U, { Cookie: "ipatent_ab=1" }), new URL(U), ON, () => 0.0);
ok(a && a.arm === "2" && a.redirect === "/?v=2" && /Max-Age=0/.test(a.cookie), "the draw wins over a stale arm-1 cookie", a);
a = await abArm(req(U + "?utm_source=bsky"), new URL(U + "?utm_source=bsky"), ON, () => 0.1);
ok(a && a.redirect === "/?utm_source=bsky&v=2", "other query parameters survive the redirect", a);
ok(await abArm(req(U + "?v=1"), new URL(U + "?v=1"), ON, () => 0.1) === null && await abArm(req(U + "?v=2"), new URL(U + "?v=2"), ON, () => 0.1) === null, "an explicit v is never reassigned");
ok(await abArm(req(U, { "User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" }), new URL(U), ON, () => 0.1) === null, "crawlers are never split");
ok(await abArm(req(U, {}, "HEAD"), new URL(U), ON, () => 0.1) === null, "HEAD is never split");
ok(await abArm(req(U), new URL(U), { IPATENT_V2_SHARE: "0" }, () => 0.0) === null, "share 0 turns the split off");

// through the fetch handler
const views = [];
const stmt = (sql) => { const s = { bind(...a) { if (/INSERT INTO page_views/.test(sql)) views.push(a[0]); return s; }, async run() { return {}; }, async first() { return null; }, async all() { return { results: [] }; } }; return s; };
const env = { IPATENT_DB: { prepare: stmt }, IPATENT_V2_SHARE: "0.5" };
const waits = [];
const ctx = { waitUntil(p) { waits.push(p); } };
const draws = [0.1, 0.9, 0.9];
const realRandom = Math.random;
Math.random = () => draws.shift();
let r = await W.fetch(req(U), env, ctx);
ok(r.status === 302 && r.headers.get("Location") === "/?v=2" && r.headers.get("Cache-Control") === "no-store" && !r.headers.get("Set-Cookie") && !r.headers.get("Vary"), "arm 2 is redirected to ?v=2 with no cookie", [r.status, r.headers.get("Location")]);
r = await W.fetch(req(U + "?v=2"), env, ctx);
ok(r.status === 200 && /text\/html/.test(r.headers.get("Content-Type") || ""), "?v=2 is served");
r = await W.fetch(req(U), env, ctx);
ok(r.status === 200 && !r.headers.get("Set-Cookie") && r.headers.get("Cache-Control") === "no-store", "arm 1 gets the default page with no cookie, not cached across arms");
r = await W.fetch(req(U, { Cookie: "ipatent_ab=2" }), env, ctx);
ok(r.status === 200 && /^ipatent_ab=; .*Max-Age=0/.test(r.headers.get("Set-Cookie") || ""), "a stale cookie is dropped by one deletion header on the page it still reaches");
Math.random = realRandom;
r = await W.fetch(req(U, { "User-Agent": "Googlebot/2.1" }), env, ctx);
ok(r.status === 200 && !r.headers.get("Set-Cookie"), "a crawler gets the default page and no cookie");
await Promise.all(waits);
ok(views.join(",") === "/?v=2,/,/,/", "views are counted per arm: " + views.join(","), views);
r = await W.fetch(req(U + "health"), env, ctx);
const h = await r.json();
ok(h.capabilities.includes("ab-split-v2") && versionAtLeast(h.version, "3.15.0"), "health names ab-split-v2", h.version);

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
