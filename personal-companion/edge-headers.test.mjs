// BP26-EDGE-SECURITY-1 (personal-companion 1.43.5): every response of reading.q08.org and travel.q08.org carries Referrer-Policy, X-Frame-Options and X-Content-Type-Options.
// The worker cannot be imported under node (it imports cloudflare: modules), so the wrapper's function is cut out of the source and run on real Response objects, and the wrapping of the
// final fetch handler is checked in the source. Run: node personal-companion/edge-headers.test.mjs   (prints "N passed, 0 failed")
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let passed = 0, failed = 0;
const ok = (c, l, x) => { if (c) passed++; else { failed++; console.error("FAIL " + l + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 200) : "")); } };

const a = src.indexOf("function edgeSecure(res) {"), b = src.indexOf("(function edgeAttach(target) {");
ok(a > 0 && b > a, "the edge wrapper is present");
const edgeSecure = new Function(src.slice(a, b) + "\nreturn edgeSecure;")();

let r = edgeSecure(new Response("<p>x</p>", { headers: { "Content-Type": "text/html" } }));
ok(r.headers.get("Referrer-Policy") === "strict-origin-when-cross-origin" && r.headers.get("X-Frame-Options") === "DENY" && r.headers.get("X-Content-Type-Options") === "nosniff", "a bare page gets all three headers");
ok(await r.text() === "<p>x</p>" && r.status === 200 && r.headers.get("Content-Type") === "text/html", "body, status and the route's own headers are kept");

r = edgeSecure(new Response("x", { headers: { "Referrer-Policy": "no-referrer", "X-Frame-Options": "SAMEORIGIN" } }));
ok(r.headers.get("Referrer-Policy") === "no-referrer" && r.headers.get("X-Frame-Options") === "SAMEORIGIN" && r.headers.get("X-Content-Type-Options") === "nosniff", "a header the route set itself is never replaced");

const full = new Response("x", { headers: { "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff" } });
ok(edgeSecure(full) === full, "a response that already has all three is returned as it is (no copy)");

r = edgeSecure(Response.redirect("https://travel.q08.org/travel", 302));
ok(r.status === 302 && r.headers.get("Location") === "https://travel.q08.org/travel" && r.headers.get("X-Frame-Options") === "DENY", "a redirect (immutable headers) is copied and secured");

const ws = { status: 101, headers: new Headers(), webSocket: {} };
ok(edgeSecure(ws) === ws, "a WebSocket upgrade is returned untouched");
ok(edgeSecure(null) === null, "a null response does not throw");

r = edgeSecure(new Response(null, { status: 204 }));
ok(r.status === 204 && r.headers.get("X-Frame-Options") === "DENY", "a 204 without a body is secured");

ok(/\(function edgeAttach\(target\) \{[\s\S]{0,200}edgeSecure\(await inner\.call\(this, request, env, ctx\)\)[\s\S]{0,80}\}\)\(worker_default\);/.test(src), "the final fetch handler is wrapped");
ok(src.indexOf("wmAttach(worker_default, \"personal-companion\");") < src.indexOf("(function edgeAttach(target) {"), "the wrapper is installed after the WebMCP wrapper, so it sees every response");
ok(/var VERSION = "1\.43\.(?:[5-9]|\d{2,})-/.test(src), "VERSION is at least 1.43.5");

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
