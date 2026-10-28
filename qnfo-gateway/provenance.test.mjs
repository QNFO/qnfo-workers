// PROVENANCE-SIDECAR-1 offline suite (qnfo-gateway 3.47.0; BP26-AI-ACT-ART50-1, BP26-PROVENANCE-MARKING-1).
// Locks: the visible AI label and JSON-LD flags on every paper page (with or without the signing secret); the label can never say AI-assisted without a named
// reviewer; absent secret = no sidecar, no manifest link, 503 on the sidecar and key routes; with a key the sidecar verifies against the published public key, a
// tampered statement does not, the ledger row is written, and the hourly sweep signs unsigned papers; the footer and JSON-LD of qnfo.org say papers are written by AI.
// The label and flag checks use the same rules as scripts/bp26_web.py (LABEL_EXACT_RX, ai_flag). Run: node qnfo-gateway/provenance.test.mjs -> "N passed, 0 failed"
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 500) : "")); } };

const PAPERS = {
  "prov-1": { slug: "prov-1", title: "A Fleet Paper", abstract: "An abstract.", authors: "Rowan Brad Quni-Gudzinas", keywords: "", doi: "", created_at: "2026-10-01 00:00:00", first_published_at: "2026-10-01 00:00:00",
    last_revised_at: "2026-10-20 08:00:00", updated_at: "2026-10-20 08:00:00", version: "1.0.0", version_semver: "1.0.0", version_count: 1, status: "published", license: "cc-by-4.0", pdf_path: null,
    body_md: "# A Fleet Paper\n\n" + "Body text repeats here. ".repeat(30) },
  "prov-2": { slug: "prov-2", title: "A Reviewed Paper", abstract: "An abstract.", authors: "Rowan Brad Quni-Gudzinas", keywords: "", doi: "", created_at: "2026-10-02 00:00:00", first_published_at: "2026-10-02 00:00:00",
    last_revised_at: "2026-10-21 08:00:00", updated_at: "2026-10-21 08:00:00", version: "1.1.0", version_semver: "1.1.0", version_count: 1, status: "published", license: "cc-by-4.0", pdf_path: null,
    body_md: "# A Reviewed Paper\n\n" + "More body text. ".repeat(40) }
};
let PROV = { "prov-2": { provenance: "ai-assisted-human-reviewed", reviewed_by: "A. Reviewer", basis: "read in full" } };
const ledger = [];
const stmt = (sql) => {
  const st = { a: [], bind(...a) { st.a = a; return st; },
    async all() {
      if (/FROM asset_provenance/.test(sql)) return { results: ledger.map((r) => ({ asset_id: r.a[0] })) };
      if (/FROM papers/.test(sql)) return { results: Object.values(PAPERS).map((p) => Object.assign({ v: p.version_semver }, p)) };
      return { results: [] };
    },
    async first() {
      if (/FROM paper_provenance/.test(sql)) return PROV[st.a[0]] || null;
      if (/FROM papers/.test(sql)) return PAPERS[st.a[0]] || null;
      if (/COUNT/.test(sql)) return { n: 2 };
      return null;
    },
    async run() { if (/INSERT INTO asset_provenance/.test(sql)) ledger.push({ a: st.a }); return {}; } };
  return st;
};
const mk = (extra) => Object.assign({ LIVING_PAPER: { prepare: stmt }, DB: { prepare: stmt }, AUDIT: { prepare: stmt }, QNFO_BUCKET: { get: async () => null }, RELEASES: { head: async () => null, get: async () => null } }, extra || {});
globalThis.fetch = async () => new Response("", { status: 404 });
const gw = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const get = async (env, host, path, accept) => { const r = await gw.fetch(new Request("https://" + host + path, { headers: { Accept: accept || "text/html" } }), env, { waitUntil() {} }); return { s: r.status, t: await r.text(), h: r.headers }; };

// the collector's rules (scripts/bp26_web.py)
const LABEL_EXACT_RX = /^[^\w]{0,4}(?:an? )?(?:ai|a\.i\.|artificial[- ]intelligence|machine)[- ](?:generated|assisted|modified|written|authored)(?: (?:content|text|piece|article|summary|draft|image|post|page))?[.!]?$/i;
const LABEL_SENTENCE_RX = /\b(?:written|drafted|generated|produced|created|researched)(?: and (?:written|drafted|checked))? (?:entirely |fully |mostly )?by (?:an? )?(?:ai|artificial intelligence)\b/i;
function visible(page) {
  const t = page.replace(/<!--.*?-->/gs, " ").replace(/<(script|style|noscript|template)\b.*?<\/\1\s*>/gis, " ").replace(/<head\b.*?<\/head\s*>/gis, " ");
  return t.split(/<[^>]*>/).map((s) => s.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()).filter(Boolean);
}
const hasLabel = (page) => visible(page).find((s) => LABEL_EXACT_RX.test(s) || (s.length <= 300 && LABEL_SENTENCE_RX.test(s)));
function ldItems(page) {
  const out = [];
  for (const m of page.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) { const d = JSON.parse(m[1]); (d["@graph"] || [d]).forEach((x) => out.push(x)); }
  return out;
}
const aiFlag = (items) => items.some((it) => (typeof it.creditText === "string" && /\b(ai|artificial intelligence)\b/i.test(it.creditText)) || it.digitalSourceType);

// ---- without the secret
const noKey = mk();
let r = await get(noKey, "papers.qnfo.org", "/papers/prov-1");
ok(r.s === 200, "the paper page answers 200", r.s + r.t.slice(0, 150));
ok(!!hasLabel(r.t), "the paper page carries the visible AI label (collector rule)", visible(r.t).slice(0, 12));
const art = ldItems(r.t).find((x) => x["@type"] === "ScholarlyArticle");
ok(art && aiFlag([art]) && art.digitalSourceType === "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia", "the ScholarlyArticle carries creditText and the IPTC digitalSourceType", art && [art.creditText, art.digitalSourceType]);
ok(art && art.isAIGenerated === true && /no human review is recorded/.test(art.creditText), "an unreviewed paper says no human review is recorded", art && art.creditText);
ok(!/rel="c2pa-manifest"/.test(r.t), "no manifest link without the secret");
r = await get(noKey, "papers.qnfo.org", "/papers/prov-1/provenance.json", "application/json");
ok(r.s === 503, "the sidecar route answers 503 without the secret", r.s);
r = await get(noKey, "papers.qnfo.org", "/.well-known/provenance-key.json", "application/json");
ok(r.s === 503, "the key route answers 503 without the secret", r.s);

// ---- a paper with a named reviewer, and one without
r = await get(noKey, "papers.qnfo.org", "/papers/prov-2");
ok(/AI-assisted/.test(r.t) && /reviewed by a named person/.test(r.t), "a reviewed paper is labelled AI-assisted with a review", visible(r.t).filter((s) => /AI-/.test(s)).slice(0, 3));
const art2 = ldItems(r.t).find((x) => x["@type"] === "ScholarlyArticle");
ok(art2 && art2.isAIGenerated === false && /A\. Reviewer/.test(art2.creditText), "its JSON-LD names the reviewer and is not isAIGenerated", art2 && art2.creditText);
PROV["prov-2"] = { provenance: "ai-assisted-human-reviewed", reviewed_by: "  ", basis: "x" };
r = await get(noKey, "papers.qnfo.org", "/papers/prov-2");
ok(/written by an AI research pipeline; no human review is recorded/.test(r.t) && !/reviewed by a named person/.test(r.t), "a human-reviewed value without a reviewer falls back to fleet-generated");
PROV["prov-2"] = { provenance: "ai-assisted-human-reviewed", reviewed_by: "A. Reviewer", basis: "read in full" };

// ---- with a key
const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
const withKey = mk({ PROVENANCE_SIGNING_KEY: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, d: jwk.d }) });
r = await get(withKey, "papers.qnfo.org", "/papers/prov-1");
ok(/<link rel="c2pa-manifest" type="application\/json" href="https:\/\/papers\.qnfo\.org\/papers\/prov-1\/provenance\.json">/.test(r.t), "the page links its manifest");
const art3 = ldItems(r.t).find((x) => x["@type"] === "ScholarlyArticle");
ok(art3 && art3.subjectOf && art3.subjectOf.contentUrl.endsWith("/provenance.json"), "the JSON-LD points at the sidecar", art3 && art3.subjectOf);
const kr = await get(withKey, "papers.qnfo.org", "/.well-known/provenance-key.json", "application/json");
const kdoc = JSON.parse(kr.t);
ok(kr.s === 200 && kdoc.keys.length === 1 && kdoc.keys[0].x === jwk.x && !("d" in kdoc.keys[0]), "the key document publishes the public key and no private part", kdoc);
const sr = await get(withKey, "papers.qnfo.org", "/papers/prov-1/provenance.json", "application/json");
const sc = JSON.parse(sr.t);
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const canon = (v) => v === null || typeof v !== "object" ? JSON.stringify(v === undefined ? null : v) : Array.isArray(v) ? "[" + v.map(canon).join(",") + "]" : "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
const pub = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: kdoc.keys[0].x }, { name: "Ed25519" }, false, ["verify"]);
ok(sr.s === 200 && await crypto.subtle.verify({ name: "Ed25519" }, pub, b64u(sc.signature.value), new TextEncoder().encode(canon(sc.statement))), "an independent verifier (no worker code) verifies the sidecar with the published key");
ok(sc.signature.kid === kdoc.keys[0].kid && sc.statement.key_id === kdoc.keys[0].kid, "the key id matches");
const body = PAPERS["prov-1"].body_md;
const hex = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)))).map((x) => x.toString(16).padStart(2, "0")).join("");
ok(sc.statement.subject.content_sha256 === hex, "the statement binds the sha256 of the paper text");
ok(sc.statement.claims.provenance === "fleet-generated" && sc.statement.claims.human_review_recorded === false && sc.statement.claims.digital_source_type.endsWith("trainedAlgorithmicMedia"), "the claims say fleet-generated, no review recorded, trainedAlgorithmicMedia", sc.statement.claims);
ok(sc.statement.c2pa_shaped["c2pa.actions"].actions[0].action === "c2pa.created" && /not a C2PA credential/.test(sc.statement.c2pa_shaped.note), "the C2PA-shaped assertion is present and says it is not a C2PA credential");
const tampered = JSON.parse(sr.t); tampered.statement.claims.provenance = "ai-assisted-human-reviewed";
ok(!(await crypto.subtle.verify({ name: "Ed25519" }, pub, b64u(tampered.signature.value), new TextEncoder().encode(canon(tampered.statement)))), "a tampered statement fails verification");
ok(ledger.length === 1 && ledger[0].a[0] === "paper:prov-1@1.0.0" && ledger[0].a[10] === 1 && ledger[0].a[2] === "https://papers.qnfo.org/papers/prov-1", "the ledger row is written with the signer's self-check", ledger[0] && ledger[0].a);
const nr = await get(withKey, "papers.qnfo.org", "/papers/nope/provenance.json", "application/json");
ok(nr.s === 404, "an unknown paper answers 404", nr.s);

// ---- the hourly sweep signs what the ledger lacks
ledger.length = 0;
await gw.scheduled({ cron: "0 * * * *", scheduledTime: Date.now() }, withKey, { waitUntil() {} }).catch(() => {});
ok(ledger.some((l) => l.a[0] === "paper:prov-2@1.1.0") && ledger.some((l) => l.a[0] === "paper:prov-1@1.0.0"), "the sweep files both papers", ledger.map((l) => l.a[0]));

// ---- qnfo.org pages
r = await get(mk(), "qnfo.org", "/");
if (r.s === 200) {
  ok(!!hasLabel(r.t), "the qnfo.org page carries a visible AI label (collector rule)", visible(r.t).filter((s) => /AI|written/.test(s)).slice(-3));
  ok(aiFlag(ldItems(r.t)), "the qnfo.org JSON-LD carries the AI flag");
} else ok(false, "qnfo.org answers 200 in the harness", r.s);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
