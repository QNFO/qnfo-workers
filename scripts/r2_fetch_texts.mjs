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
for (const k of keys) {
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/r2/buckets/${k.bucket}/objects/${encodeURIComponent(k.key)}`, { headers: { authorization: `Bearer ${tok}` } });
    if (!r.ok) { failed++; continue; }
    texts[k.key] = await r.text();
  } catch { failed++; }
}
console.error(JSON.stringify({ texts: { requested: keys.length, read: Object.keys(texts).length, failed } }));
console.log(JSON.stringify(texts));
