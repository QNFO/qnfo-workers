// IPATENT-ERROR-JSON-1 (qnfo-ipatent 3.9.1): a failed draft (edge 502 with a text/plain body) shows the friendly message,
// keeps the form filled and offers Retry, instead of 'Network error: Unexpected token u'. The landing page's own script
// runs against a minimal fake DOM and a stubbed fetch. Run: node qnfo-ipatent/error-json.test.mjs
const W = (await import("./worker.js")).default;
const stmt = () => { const s = { bind() { return s; }, async run() { return {}; }, async first() { return null; }, async all() { return { results: [] }; } }; return s; };
const html = await (await W.fetch(new Request("https://ipatent.qnfo.org/", { headers: { "User-Agent": "t" } }), { IPATENT_DB: { prepare: stmt } }, { waitUntil() {} })).text();
// Not an HTML filter: the test only locates the page's own inline script by its marker text.
const parts = html.split(/<\/script\s*>/i).map((x) => x.slice(x.search(/<script\b[^>]*>/i)).replace(/^<script\b[^>]*>/i, ""));
const script = parts.find((s) => s.includes("draftForm") && s.includes("API_BASE"));
let passed = 0, failed = 0;
const ok = (c, l) => { if (c) passed++; else { failed++; console.error("FAIL " + l); } };
ok(!!script, "landing page carries the draft script");
const els = {};
function el(id) {
  const e = { id, value: "", textContent: "", className: "", innerHTML: "", style: {}, disabled: false, checked: false, children: [], listeners: {},
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    appendChild(c) { this.children.push(c); }, scrollIntoView() {}, querySelectorAll() { return []; }, querySelector() { return null; }, setAttribute() {},
    dispatchEvent(ev) { (this.listeners[ev.type] || []).forEach((f) => f(ev)); return true; } };
  e.requestSubmit = () => e.dispatchEvent({ type: "submit", preventDefault() {} });
  return e;
}
const document = { getElementById: (id) => (els[id] = els[id] || el(id)), createElement: () => el(""), querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, body: el("body") };
const calls = [];
let mode = "502";
const fetch = async (url, opts) => {
  calls.push({ url, body: opts && opts.body });
  if (String(url).endsWith("/draft") && mode === "502") return new Response("upstream request failed", { status: 502, headers: { "content-type": "text/plain" } });
  if (String(url).endsWith("/draft") && mode === "throw") throw new TypeError("Failed to fetch");
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
};
const g = { document, fetch, location: { pathname: "/", search: "", hash: "" }, window: {}, setTimeout, clearTimeout, Event: class { constructor(t) { this.type = t; } preventDefault() {} }, navigator: {}, localStorage: { getItem() { return null; }, setItem() {} }, console, URLSearchParams, AbortSignal };
g.window = g;
try { new Function(...Object.keys(g), script)(...Object.values(g)); } catch (e) { ok(false, "script runs: " + e.message); }
document.getElementById("title").value = "Thermal valve";
document.getElementById("description").value = "A valve that opens with heat.";
const submit = async () => { for (const f of document.getElementById("draftForm").listeners.submit || []) await f({ preventDefault() {} }); };
await submit();
const st = document.getElementById("status");
ok(/did not answer in time/.test(st.textContent), "502 text/plain shows the friendly message (got: " + st.textContent + ")");
ok(!/Unexpected token|Network error/.test(st.textContent), "no JSON parse error text");
ok(document.getElementById("title").value === "Thermal valve" && /heat/.test(document.getElementById("description").value), "form stays filled");
const retry = st.children.find((c) => c.id === "retryBtn");
ok(!!retry, "a Retry button is shown");
const n = calls.filter((c) => String(c.url).endsWith("/draft")).length;
st.children = [];
for (const f of (retry && retry.listeners.click) || []) f();
await new Promise((r) => setTimeout(r, 10));
const drafts = calls.filter((c) => String(c.url).endsWith("/draft"));
ok(drafts.length === n + 1 && drafts[drafts.length - 1].body === drafts[0].body, "Retry resubmits the same input");
mode = "throw"; st.children = []; await submit();
ok(/did not answer in time/.test(st.textContent), "a thrown fetch shows the friendly message too");
console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
