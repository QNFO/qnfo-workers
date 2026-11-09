// DOC-IS-CODE-1: read document text from R2 (GET only) so r2_doc_audit.mjs can count rule ids a document names.
//   node scripts/r2_fetch_texts.mjs keys.jsonl [max_docs=400] > texts.json   (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID in env)
// Only md and txt keys under 300 KB are read; a failed read is counted on stderr and never aborts the run.
import { readFileSync } from "node:fs";
const [file, max = "400"] = process.argv.slice(2);
const tok = process.env.CLOUDFLARE_API_TOKEN, acct = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!file || !tok || !acct) { console.error("r2_fetch_texts: keys file, CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID required"); process.exit(2); }
const keys = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
  .filter((k) => /\.(md|txt)$/i.test(k.key) && (k.size ?? 0) < 300_000).slice(0, Number(max));
const texts = {}; let failed = 0;
// bounded concurrency: 400 sequential GETs took 4.5 minutes (issue 8958)
const CONC = Number(process.env.FETCH_CONCURRENCY || 12);
let next = 0;
async function worker() {
  while (next < keys.length) {
    const k = keys[next++];
    try {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/r2/buckets/${k.bucket}/objects/${encodeURIComponent(k.key)}`, { headers: { authorization: `Bearer ${tok}` } });
      if (!r.ok) { failed++; continue; }
      texts[k.key] = await r.text();
    } catch { failed++; }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
// owner_docs rows in the audit D1 (key, body_md) count as document text too (issue 8765)
let ownerDocs = 0;
try {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/d1/database/${process.env.AUDIT_D1_ID || "35e2e573-92f3-46ac-83c6-22f6429fc5e5"}/query`, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ sql: "SELECT key, body_md FROM owner_docs WHERE body_md IS NOT NULL LIMIT 500" }) });
  const j = await r.json();
  for (const row of j.result?.[0]?.results || []) { texts[row.key] = row.body_md; ownerDocs++; }
} catch { /* owner_docs is optional: a failure is visible as owner_docs 0 below */ }
console.error(JSON.stringify({ texts: { requested: keys.length, read: Object.keys(texts).length - ownerDocs, owner_docs: ownerDocs, failed } }));
console.log(JSON.stringify(texts));
