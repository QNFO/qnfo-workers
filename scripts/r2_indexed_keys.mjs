// DOC-IS-CODE-1: keys the ddocs indexer has indexed without error count as used (searchable chunks in the audit D1).
//   node scripts/r2_indexed_keys.mjs > indexed.json   (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, AUDIT_D1_ID in env)
// A missing credential or a failed query exits 1: crediting nothing would file indexed documents as false orphans.
const tok = process.env.CLOUDFLARE_API_TOKEN, acct = process.env.CLOUDFLARE_ACCOUNT_ID;
const db = process.env.AUDIT_D1_ID || "35e2e573-92f3-46ac-83c6-22f6429fc5e5";
if (!tok || !acct) { console.error("r2_indexed_keys: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID required"); process.exit(1); }
const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/d1/database/${db}/query`, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ sql: "SELECT rkey FROM ddocs_index_state WHERE error = 0" }) });
const j = await r.json().catch(() => ({}));
if (!r.ok || !j.success) { console.error("r2_indexed_keys: query failed " + r.status); process.exit(1); }
const keys = (j.result?.[0]?.results || []).map((x) => x.rkey);
console.error(JSON.stringify({ indexed: keys.length }));
console.log(JSON.stringify(keys));
