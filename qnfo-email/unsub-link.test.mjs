// qnfo-email 2.5.4 offline fixtures: UNSUB-LINK-1. No network, synthetic addresses.
// Proves: qnfo-outreach's footer link (https://qnfo.org/email/unsubscribe?e=<email>&t=<16 hex>) is answered by this worker
// without a key; a verified link (GET, or the RFC 8058 one-click POST) adds one email_suppression row and never overwrites
// an existing one; a wrong or missing token, a malformed address, or a missing database changes nothing; the address is
// HTML-escaped on the page; every other route still needs a key.
// Run: node qnfo-email/unsub-link.test.mjs   -> prints "N passed, 0 failed"
import fs from "node:fs";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const api = new Function(src.replace(/export default\{/, "const __handler={") + "\nreturn {handler:__handler,VERSION};")();
const out = fs.readFileSync(new URL("../qnfo-outreach/worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (extra !== undefined ? " :: " + JSON.stringify(extra) : "")); } };

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE email_suppression (email TEXT PRIMARY KEY, reason TEXT, source TEXT, created_at TEXT DEFAULT (datetime('now')))");
const D1 = { prepare(sql) { let a = []; const s = { bind(...x) { a = x; return s; }, async run() { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, async first() { return db.prepare(sql).get(...a) || null; }, async all() { return { results: db.prepare(sql).all(...a) }; } }; return s; } };
const env = { AUDIT_DB: D1, GATEWAY_EMAIL_KEY: "gw-key" };
const tok = (e) => createHash("sha256").update(e.toLowerCase() + ":qnfo-unsub-2026").digest("hex").slice(0, 16);
const call = (q, method, envv) => api.handler.fetch(new Request("https://qnfo.org/email/unsubscribe" + q, { method: method || "GET" }), envv || env, {});
const rows = () => db.prepare("SELECT email, reason, source FROM email_suppression ORDER BY email").all();

ok(/sha16\(e \+ ":qnfo-unsub-2026"\)/.test(out) && /qnfo\.org\/email\/unsubscribe\?e=/.test(out), "the link format matches the one qnfo-outreach sends");
ok(/^2\.5\.\d/.test(api.VERSION), "VERSION is 2.5.x", api.VERSION);

{
  const r = await call("?e=" + encodeURIComponent("Reader@Example.org") + "&t=" + tok("reader@example.org"));
  const t = await r.text();
  ok(r.status === 200 && /Unsubscribed/.test(t) && r.headers.get("content-type").startsWith("text/html"), "a verified link answers 200 without a key", r.status);
  ok(JSON.stringify(rows()) === JSON.stringify([{ email: "reader@example.org", reason: "unsubscribe", source: "qnfo-email /email/unsubscribe" }]), "it adds one lower-cased suppression row", rows());
  ok(r.headers.get("cache-control") === "no-store" && r.headers.get("x-robots-tag") === "noindex", "the page is not cached or indexed");
}
{
  const r = await call("?e=reader%40example.org&t=" + tok("reader@example.org"), "POST");
  ok(r.status === 200 && rows().length === 1, "the one-click POST works and a repeat is idempotent", rows().length);
}
{
  db.prepare("INSERT INTO email_suppression (email, reason, source) VALUES ('stop@example.org','reply-stop','reply-scan')").run();
  const r = await call("?e=stop%40example.org&t=" + tok("stop@example.org"));
  const row = db.prepare("SELECT reason, source FROM email_suppression WHERE email='stop@example.org'").get();
  ok(r.status === 200 && row.reason === "reply-stop" && row.source === "reply-scan", "an existing suppression row is never overwritten", row);
}
{
  const before = rows().length;
  const bad = await call("?e=other%40example.org&t=0123456789abcdef");
  const none = await call("?e=other%40example.org");
  const mal = await call("?e=not-an-address&t=" + tok("not-an-address"));
  const tb = await bad.text();
  ok(bad.status === 400 && none.status === 400 && mal.status === 400 && /STOP/.test(tb), "a wrong or missing token, or a malformed address, is refused and points to reply STOP", [bad.status, none.status, mal.status]);
  ok(rows().length === before, "a refused link writes nothing");
}
{
  const evil = '"><script>x</script>@example.org';
  const r = await call("?e=" + encodeURIComponent(evil) + "&t=" + tok(evil));
  const t = await r.text();
  ok(!t.includes("<script>x</script>") && (r.status !== 200 || t.includes("&lt;script&gt;")), "the address is HTML-escaped on the page", r.status);
}
{
  const r = await call("?e=x%40example.org&t=" + tok("x@example.org"), "GET", { GATEWAY_EMAIL_KEY: "gw-key" });
  ok(r.status === 503, "no database: 503 and nothing claimed", r.status);
}
{
  const q = await api.handler.fetch(new Request("https://qnfo.org/email/queue"), env, {});
  const del = await call("?e=reader%40example.org&t=" + tok("reader@example.org"), "DELETE");
  ok(q.status === 401 && del.status === 401, "every other route and method still needs a key", [q.status, del.status]);
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
