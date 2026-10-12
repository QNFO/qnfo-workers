// GA4-READ-1 offline suite (qnfo-fleet-dashboard 1.30.0): the reach ingest reads Google Analytics 4 with the service
// account in GA4_SA_KEY, writes reach_signals source ga4, never writes an invented zero, never echoes the key.
// Run: node qnfo-fleet-dashboard/ga4-read.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" });
const KEY = JSON.stringify({ type: "service_account", client_email: "ga4-reader@test.iam.gserviceaccount.com", private_key: PEM, token_uri: "https://evil.example/token" });
const LOOP = "loop-secret-123";
let seen = [];
let mode = "ok";
globalThis.fetch = async (u, o) => {
  u = String(u); seen.push({ u, o });
  const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
  if (u === "https://oauth2.googleapis.com/token") return mode === "tokfail" ? J({ error: "invalid_grant", error_description: "bad" }, 400) : J({ access_token: "tok-abc" });
  if (u.startsWith("https://analyticsadmin.googleapis.com/")) return mode === "noprop" ? J({ accountSummaries: [] }) : J({ accountSummaries: [{ propertySummaries: [{ property: "properties/4242" }] }] });
  if (u.startsWith("https://analyticsdata.googleapis.com/v1beta/properties/4242:runReport")) {
    const b = JSON.parse(o.body); const dim = b.dimensions[0].name;
    if (dim === "pagePath") return J({ rows: [{ dimensionValues: [{ value: "/" }], metricValues: [{ value: "31" }, { value: "12" }] }, { dimensionValues: [{ value: "/work-with-me" }], metricValues: [{ value: "4" }, { value: "3" }] }] });
    return J({ rows: [{ dimensionValues: [{ value: "bluesky" }], metricValues: [{ value: "9" }, { value: "5" }] }] });
  }
  return J({}, 404);
};
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
function mk(extra = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, quality TEXT, collected_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (date, source, channel, entity_type, entity_id, metric))");
  const prep = (sql) => { let a = []; const q = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return q; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async first() { return db.prepare(sql).get(...a) || null; }, async run() { db.prepare(sql).run(...a); return { success: true }; } }; return q; };
  const env = Object.assign({ AUDIT: { prepare: prep, async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; } }, LOOP_TOKEN: LOOP, GA4_SA_KEY: KEY }, extra);
  return { env, db };
}
const ctx = { waitUntil() {}, passThroughOnException() {} };
const run = (env, q, tok = LOOP) => worker.fetch(new Request("https://fleet.qnfo.org/api/ga4/ingest" + q, { method: "POST", headers: tok === null ? {} : { "x-loop-token": tok } }), env, ctx);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

{
  const { env, db } = mk(); seen = []; mode = "ok";
  const r = await run(env, "?day=2026-10-11"); const j = await r.json();
  ok(r.status === 200 && j.written === 6 && j.properties === 1, "A1 a good run writes 6 rows (2 pages x 2 metrics + 1 source x 2 metrics), got " + JSON.stringify(j));
  const rows = db.prepare("SELECT * FROM reach_signals WHERE source='ga4' ORDER BY entity_type, entity_id, metric").all();
  ok(rows.length === 6, "A2 rows landed: " + rows.length);
  ok(rows.some((x) => x.entity_type === "page" && x.entity_id === "/work-with-me" && x.metric === "screenPageViews" && x.value === 4 && x.quality === "unknown" && x.channel === "web"), "A3 a page row has the right shape");
  ok(rows.some((x) => x.entity_type === "source" && x.entity_id === "bluesky" && x.metric === "sessions" && x.value === 9), "A4 a source row has the right shape");
  const tokReq = seen.find((s) => s.u === "https://oauth2.googleapis.com/token");
  ok(!!tokReq, "A5 the token request goes to Google, not to the token_uri inside the key file");
  const form = new URLSearchParams(tokReq.o.body); const [h, c, sg] = form.get("assertion").split(".");
  const v = createVerify("RSA-SHA256"); v.update(h + "." + c);
  const b64 = (x) => Buffer.from(x.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  ok(v.verify(publicKey, b64(sg)), "A6 the JWT assertion carries a valid RS256 signature");
  const claim = JSON.parse(b64(c).toString());
  ok(claim.scope === "https://www.googleapis.com/auth/analytics.readonly" && claim.iss === "ga4-reader@test.iam.gserviceaccount.com", "A7 read-only scope and the service account as issuer");
  ok(!JSON.stringify(j).includes("PRIVATE KEY"), "A8 the response never carries key material");
  const again = await (await run(env, "?day=2026-10-11")).json();
  ok(again.skipped === "already ingested", "A9 a day already ingested is skipped");
  const forced = await (await run(env, "?day=2026-10-11&force=1")).json();
  ok(forced.written > 0 && db.prepare("SELECT COUNT(*) n FROM reach_signals").get().n === rows.length, "A10 force re-reads and replaces, no duplicate rows");
}
{
  const { env, db } = mk({ GA4_SA_KEY: undefined });
  const j = await (await run(env, "?day=2026-10-11")).json();
  ok(/not connected/.test(j.skipped || "") && db.prepare("SELECT COUNT(*) n FROM reach_signals").get().n === 0, "B1 without the secret nothing is read or written");
}
{
  const { env, db } = mk(); mode = "tokfail";
  const j = await (await run(env, "?day=2026-10-11")).json();
  ok(/token request 400/.test(j.error || "") && db.prepare("SELECT COUNT(*) n FROM reach_signals").get().n === 0, "C1 Google refusing the token writes nothing and says why");
}
{
  const { env } = mk(); mode = "noprop";
  const j = await (await run(env, "?day=2026-10-11")).json();
  ok(/no GA4 property/.test(j.error || ""), "D1 a service account with no property access says to add it as Viewer");
}
{
  const { env } = mk({ GA4_SA_KEY: "not json" }); mode = "ok";
  const j = await (await run(env, "?day=2026-10-11")).json();
  ok(/not JSON/.test(j.error || ""), "E1 a malformed secret is reported, not thrown");
  const { env: e2 } = mk();
  ok((await run(e2, "?day=2026-10-11", "wrong")).status === 401 && (await run(e2, "?day=2026-10-11", null)).status === 401, "E2 the route needs the loop token");
  const j3 = await (await run(e2, "?day=garbage")).json();
  ok(j3.error === "bad day", "E3 a malformed day is refused");
}
{
  const { env } = mk({ GA4_PROPERTY_ID: "4242" }); mode = "ok"; seen = [];
  await run(env, "?day=2026-10-12");
  ok(!seen.some((s) => s.u.includes("analyticsadmin")), "F1 GA4_PROPERTY_ID skips the Admin API lookup");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
