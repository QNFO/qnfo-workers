// GA4-DATA-API-1 offline suite. Replays the GA4 block of worker.js (ga4B64url through ga4Ingest) with the reach helpers
// against an in-memory SQLite D1 and a mocked fetch: a real RS256 JWT is signed with a generated key and verified, rows
// land in reach_signals source ga4, the day is throttled once ok, a missing key or a 403 writes its reason and no number.
// Run: node qnfo-fleet-dashboard/ga4-ingest.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto, createVerify } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < i) throw new Error("block not found: " + a); return src.slice(i, j); };
const helpers = cut("function reachErr(e) {", "// /papers/<slug> or /papers/<slug>/ on any host");
const ga4 = cut("var GA4_SCOPE =", "async function reachIngestTick(env, opts) {");
if (src.indexOf("ga4 = await ga4Ingest(env") < 0) throw new Error("reachIngestTick does not call ga4Ingest");
if (/fetchGa4Reports|parseGa4Report|upsertReachSignals/.test(src)) throw new Error("the empty GA4 stubs are still in worker.js");

let fail = 0, pass = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.error("FAIL", m, d === undefined ? "" : JSON.stringify(d)); } };

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT); CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT); CREATE TABLE reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, quality TEXT, collected_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (date, source, channel, entity_type, entity_id, metric));");
const d1 = { prepare(sql) { const st = db.prepare(sql); let args = []; return { bind(...a) { args = a; return this; }, async all() { return { results: st.all(...args) }; }, async run() { st.run(...args); return { success: true }; }, async first() { return st.get(...args) || null; } }; } };

const { publicKey, privateKey } = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pkcs8 = Buffer.from(await webcrypto.subtle.exportKey("pkcs8", privateKey)).toString("base64").match(/.{1,64}/g).join("\n");
const spki = Buffer.from(await webcrypto.subtle.exportKey("spki", publicKey)).toString("base64").match(/.{1,64}/g).join("\n");
const pem = "-----BEGIN PRIVATE KEY-----\n" + pkcs8 + "\n-----END PRIVATE KEY-----\n";
const pubPem = "-----BEGIN PUBLIC KEY-----\n" + spki + "\n-----END PUBLIC KEY-----\n";
const SA = JSON.stringify({ type: "service_account", client_email: "fleet@qnfo.iam.gserviceaccount.com", private_key: pem, token_uri: "https://oauth2.googleapis.com/token" });

let mode = "ok"; const calls = [];
const fetchMock = async (url, init) => {
  calls.push({ url: String(url), body: init && init.body });
  if (String(url).includes("oauth2.googleapis.com")) {
    const assertion = decodeURIComponent(String(init.body).split("assertion=")[1]);
    const [h, c, s] = assertion.split(".");
    const v = createVerify("RSA-SHA256"); v.update(h + "." + c);
    const good = v.verify(pubPem, Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
    const claim = JSON.parse(Buffer.from(c.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    ok(good, "the JWT signature verifies with the service account's public key");
    ok(claim.scope === "https://www.googleapis.com/auth/analytics.readonly" && claim.iss === "fleet@qnfo.iam.gserviceaccount.com" && claim.exp - claim.iat === 3600, "the JWT claims read-only scope, issuer and a 1h lifetime", claim);
    return new Response(JSON.stringify({ access_token: "ya29.test" }), { status: 200 });
  }
  if (String(url).includes("analyticsdata.googleapis.com")) {
    if (mode === "403") return new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED" } }), { status: 403 });
    const b = JSON.parse(init.body);
    if (b.dimensions[0].name === "hostName") return new Response(JSON.stringify({ rows: [ { dimensionValues: [{ value: "qnfo.org" }], metricValues: [{ value: "120" }, { value: "40" }, { value: "55" }, { value: "30" }] }, { dimensionValues: [{ value: "(not set)" }], metricValues: [{ value: "9" }, { value: "1" }, { value: "1" }, { value: "0" }] } ] }), { status: 200 });
    return new Response(JSON.stringify({ rows: [ { dimensionValues: [{ value: "bsky.app" }], metricValues: [{ value: "12" }, { value: "7" }] } ] }), { status: 200 });
  }
  throw new Error("unexpected fetch " + url);
};

const factory = new Function("fetch", "crypto", "console", "AbortSignal", "TextEncoder", "btoa", "atob",
  "var NAME='qnfo-fleet-dashboard'; var VERSION='t'; var DAY_MS=" + 864e5 + "; var GA4_PROPERTY_ID_DEFAULT='486253526';" +
  "async function d1all(db, sql, params) { let ps = db.prepare(sql); if (params && params.length) ps = ps.bind.apply(ps, params); const r = await ps.all(); return r.results || []; }" +
  helpers + ga4 + "; return { ga4Ingest, ga4Rows, ga4ParseKey };");
const quiet = { log() {}, error() {} };
const G = factory(fetchMock, webcrypto, quiet, AbortSignal, TextEncoder, btoa, atob);
const now = Date.parse("2026-10-18T03:00:00Z");

let r = await G.ga4Ingest({ AUDIT: d1 }, { nowMs: now });
ok(r.error === "GA4_SA_KEY not set" && r.written === 0, "no key: the reason is recorded, nothing is written", r);
ok(db.prepare("SELECT COUNT(*) n FROM reach_signals").get().n === 0, "no key writes no number");
ok(db.prepare("SELECT status FROM cloud_ops_events WHERE id='ga4-ingest-2026-10-17'").get().status === "error", "no key leaves an error ledger row");

db.exec("DELETE FROM cloud_ops_events");
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now });
ok(!r.error && r.written === 6 && r.property === "486253526", "a granted key writes 4 host rows and 2 source rows", r);
const rows = db.prepare("SELECT entity_type, entity_id, metric, value, quality FROM reach_signals WHERE source='ga4' ORDER BY entity_type, metric").all();
ok(rows.some((x) => x.entity_id === "qnfo.org" && x.metric === "screenPageViews" && x.value === 120 && x.quality === "human"), "page views per host", rows);
ok(!rows.some((x) => x.entity_id === "(not set)"), "a (not set) dimension is skipped");
ok(rows.some((x) => x.entity_type === "source" && x.entity_id === "bsky.app" && x.metric === "engagedSessions" && x.value === 7), "engaged sessions per source");
ok(calls.filter((c) => c.url.includes(":runReport")).every((c) => JSON.parse(c.body).dateRanges[0].startDate === "2026-10-17"), "the report reads the complete UTC day before now");

const n0 = calls.length;
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now });
ok(r.throttled === "2026-10-17" && calls.length === n0, "an ok day is not read twice", r);

db.exec("INSERT INTO ops_config (key, value) VALUES ('ga4_property_id', '999')");
mode = "403";
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now + 864e5 });
ok(/runReport 403 PERMISSION_DENIED/.test(r.error || "") && r.property === "999" && r.written === 0, "a refused grant records 403 and the configured property, no rows", r);
ok(db.prepare("SELECT COUNT(*) n FROM reach_signals WHERE date='2026-10-18'").get().n === 0, "a refused grant writes no number");
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now + 864e5 });
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now + 864e5 });
ok(r.attempts === 3 && r.error, "the third attempt still runs", r);
r = await G.ga4Ingest({ AUDIT: d1, GA4_SA_KEY: SA }, { nowMs: now + 864e5 });
ok(r.gave_up === "2026-10-18", "after 3 failed attempts the day is given up", r);
ok(G.ga4ParseKey("not json") === null && G.ga4ParseKey(SA).email === "fleet@qnfo.iam.gserviceaccount.com", "the key parser accepts only a service-account JSON key");

console.log((fail ? "FAIL" : "PASS") + "  " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
