// PAGE-POLICY-1 offline suite (qnfo-gateway 3.18.2, agent_issues 2343 WEB-PERF-EDGE-1, pillar reach). Every HTML response
// the gateway serves carries Referrer-Policy and Permissions-Policy from the worker; an HTML response without Cache-Control
// gets a public one only when it is a GET 200 with no token in its query, no Set-Cookie and a public path, and no-store
// otherwise; a handler's own headers are kept; JSON passes through untouched. Covers the pure helper (extracted from the
// worker source between its markers, so no copy can drift) and the real fetch handler end to end with stubbed D1 and a
// stubbed qnfo-subscribers upstream for the token-bearing confirm and unsubscribe pages.
// Run: node qnfo-gateway/page-policy.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };

const REF = "strict-origin-when-cross-origin";
const PERM = "camera=(), microphone=(), geolocation=()";
const PUBLIC = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

// ---- the pure helper ----
const b = src.indexOf("// ---- PAGE-POLICY-1:BEGIN"), e = src.indexOf("// ---- PAGE-POLICY-1:END");
ok(b > 0 && e > b, "PAGE-POLICY-1 block markers present");
const ctx = { URL, Headers, Response, String };
vm.createContext(ctx);
vm.runInContext(src.slice(b, e) + "\nthis.withPagePolicy = withPagePolicy;", ctx);
const P = ctx.withPagePolicy;
const html = (status, extra) => new Response("<!DOCTYPE html><html><head></head><body>x</body></html>", { status: status || 200, headers: Object.assign({ "Content-Type": "text/html; charset=utf-8" }, extra || {}) });
const req = (url, method) => new Request(url, { method: method || "GET" });

let r = P(html(200, { "Cache-Control": "public, max-age=3600" }), req("https://papers.qnfo.org/papers/a-paper"));
ok(r.headers.get("Referrer-Policy") === REF, "paper page: Referrer-Policy " + REF, r.headers.get("Referrer-Policy"));
ok(r.headers.get("Permissions-Policy") === PERM, "paper page: Permissions-Policy " + PERM, r.headers.get("Permissions-Policy"));
ok(r.headers.get("Cache-Control") === "public, max-age=3600", "paper page: the handler's own Cache-Control is kept", r.headers.get("Cache-Control"));
ok(r.status === 200 && /<body>x<\/body>/.test(await r.text()), "status and body pass through unchanged");

r = P(html(200), req("https://qnfo.org/some-new-page"));
ok(r.headers.get("Cache-Control") === PUBLIC, "public GET 200 HTML without Cache-Control gets the public default", r.headers.get("Cache-Control"));
ok(/s-maxage=\d+/.test(r.headers.get("Cache-Control")) && /stale-while-revalidate=\d+/.test(r.headers.get("Cache-Control")), "public default has s-maxage and stale-while-revalidate");
r = P(html(200), req("https://qnfo.org/some-new-page?utm_source=x&utm_term=y"));
ok(r.headers.get("Cache-Control") === PUBLIC, "utm tags are not tokens: still the public default", r.headers.get("Cache-Control"));
r = P(html(200), req("https://qnfo.org/some-new-page", "HEAD"));
ok(r.headers.get("Cache-Control") === PUBLIC, "HEAD is treated like GET", r.headers.get("Cache-Control"));

// token, write, API, personalised and error responses never get a public Cache-Control
for (const [label, url, method, extra, status] of [
  ["confirm page with ?token=", "https://qnfo.org/api/confirm?token=abc123", "GET"],
  ["any page with ?t=", "https://qnfo.org/some-new-page?t=abc123", "GET"],
  ["any page with &token=", "https://qnfo.org/some-new-page?utm_source=x&token=abc123", "GET"],
  ["unsubscribe path, no query", "https://qnfo.org/unsubscribe", "GET"],
  ["confirm path, no query", "https://q.example/confirm", "GET"],
  ["subscribe page", "https://qnfo.org/subscribe", "GET"],
  ["API route", "https://papers.qnfo.org/api/papers", "GET"],
  ["audit route", "https://papers.qnfo.org/_audit/blank-papers", "GET"],
  ["POST", "https://qnfo.org/some-new-page", "POST"],
  ["POST /sync", "https://qnfo.org/sync", "POST"],
  ["Set-Cookie response", "https://qnfo.org/some-new-page", "GET", { "Set-Cookie": "a=b" }],
  ["404", "https://qnfo.org/missing", "GET", null, 404],
  ["500", "https://qnfo.org/some-new-page", "GET", null, 500]
]) {
  const out = P(html(status || 200, extra), req(url, method));
  ok(out.headers.get("Cache-Control") === "no-store", label + ": Cache-Control no-store, never public", out.headers.get("Cache-Control"));
  ok(out.headers.get("Permissions-Policy") === PERM, label + ": still carries Permissions-Policy");
}
r = P(html(200), req("https://qnfo.org/api/confirm?token=abc123"));
ok(r.headers.get("Referrer-Policy") === "no-referrer", "a page whose query carries a token sends no Referer", r.headers.get("Referrer-Policy"));
r = P(html(200, { "Cache-Control": "no-store" }), req("https://qnfo.org/api/confirm?token=abc123"));
ok(r.headers.get("Cache-Control") === "no-store", "a handler's no-store is kept");

r = P(html(200, { "Referrer-Policy": "no-referrer", "Permissions-Policy": "camera=()" }), req("https://qnfo.org/x"));
ok(r.headers.get("Referrer-Policy") === "no-referrer" && r.headers.get("Permissions-Policy") === "camera=()", "headers the handler set are never overwritten");

const j = new Response('{"ok":true}', { headers: { "Content-Type": "application/json; charset=utf-8" } });
ok(P(j, req("https://qnfo.org/stats")) === j, "JSON response is returned as the same object, untouched");
const t = new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
ok(P(t, req("https://papers.qnfo.org/nope")) === t, "plain-text response is untouched");
ok(P(null, req("https://qnfo.org/")) === null, "a missing response passes through");

// ---- the real fetch handler, end to end ----
const realFetch = globalThis.fetch;
const upstream = [];
globalThis.fetch = async (url, init) => {
  const s = String(url);
  if (s.indexOf("https://qnfo-subscribers.q08.workers.dev/") === 0) {
    upstream.push(s);
    return new Response("<!DOCTYPE html><html><head><title>Confirmed</title></head><body>You are subscribed.</body></html>", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  return realFetch(url, init);
};
const paper = { slug: "a-paper", title: "A paper", body_md: "## Introduction\n\nSome text.", abstract: "An abstract.", authors: "Rowan Brad Quni-Gudzinas", doi: null, created_at: "2026-10-01", status: "published", version: "1", pdf_path: null, license: null };
const stmt = (sql) => {
  const s = { bind() { return s; }, async all() { return { results: [] }; }, async first() { return /FROM papers WHERE slug = \?/.test(sql) ? Object.assign({}, paper) : null; }, async run() { return {}; } };
  return s;
};
const env = { LIVING_PAPER: { prepare: stmt }, DB: { prepare: stmt } };
const gw = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const get = async (url, method) => gw.fetch(new Request(url, { method: method || "GET", redirect: "manual" }), env, { waitUntil() {} });

for (const url of ["https://qnfo.org/", "https://qnfo.org/work-with-me", "https://papers.qnfo.org/", "https://papers.qnfo.org/papers", "https://papers.qnfo.org/papers/a-paper", "https://legal.qnfo.org/privacy", "https://archive.qnfo.org/"]) {
  const res = await get(url);
  ok(res.status === 200 && /text\/html/.test(res.headers.get("Content-Type") || ""), url + " -> 200 HTML", res.status);
  ok(res.headers.get("Referrer-Policy") === REF, url + " carries Referrer-Policy", res.headers.get("Referrer-Policy"));
  ok(res.headers.get("Permissions-Policy") === PERM, url + " carries Permissions-Policy", res.headers.get("Permissions-Policy"));
  ok(/^public, max-age=\d+/.test(res.headers.get("Cache-Control") || ""), url + " keeps a public Cache-Control", res.headers.get("Cache-Control"));
}
const pp = await get("https://papers.qnfo.org/papers/a-paper");
ok(pp.headers.get("Cache-Control") === "public, max-age=3600", "paper page keeps its own max-age=3600", pp.headers.get("Cache-Control"));

for (const url of ["https://qnfo.org/api/confirm?token=abc123", "https://qnfo.org/api/unsubscribe?token=abc123", "https://papers.qnfo.org/api/confirm?token=abc123"]) {
  const res = await get(url);
  const cc = res.headers.get("Cache-Control") || "";
  ok(res.status === 200 && /text\/html/.test(res.headers.get("Content-Type") || ""), url + " -> 200 HTML from the stubbed upstream", res.status);
  ok(cc === "no-store" && !/public|s-maxage|stale-while-revalidate/.test(cc), url + ": no-store, never cached", cc);
  ok(res.headers.get("Referrer-Policy") === "no-referrer", url + ": token page sends no Referer", res.headers.get("Referrer-Policy"));
  ok(res.headers.get("Permissions-Policy") === PERM, url + " carries Permissions-Policy");
}
ok(upstream.length === 3 && upstream.every((s) => /token=abc123/.test(s)), "confirm and unsubscribe reached the stubbed upstream", upstream);

const health = await get("https://qnfo.org/health");
ok(/json/.test(health.headers.get("Content-Type") || "") && !health.headers.get("Permissions-Policy") && !health.headers.get("Referrer-Policy"), "/health (JSON) carries no page policy headers", [...health.headers]);
const stats = await get("https://graph-api.qnfo.org/");
ok(/json/.test(stats.headers.get("Content-Type") || "") && !stats.headers.get("Permissions-Policy"), "graph-api JSON is untouched");
const post = await get("https://qnfo.org/api/confirm", "POST");
ok(!/public/.test(post.headers.get("Cache-Control") || ""), "POST to a write route is never given a public Cache-Control", post.headers.get("Cache-Control"));

globalThis.fetch = realFetch;
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
