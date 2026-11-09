// DOC-IS-CODE-1: keys the ddocs indexer has indexed without error count as used (they are searchable chunks in the audit D1).
//   node scripts/r2_indexed_keys.mjs > indexed.json   (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID in env; prints [] when unreachable)
const tok = process.env.CLOUDFLARE_API_TOKEN, acct = process.env.CLOUDFLARE_ACCOUNT_ID;
let keys = [];
try {
  if (tok && acct) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/d1/database/${process.env.AUDIT_D1_ID || "35e2e573-92f3-46ac-83c6-22f6429fc5e5"}/query`, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ sql: "SELECT rkey FROM ddocs_index_state WHERE error = 0" }) });
    const j = await r.json();
    keys = (j.result?.[0]?.results || []).map((x) => x.rkey);
  }
} catch { /* an unreachable index means no key is credited, never an exception */ }
console.error(JSON.stringify({ indexed: keys.length }));
console.log(JSON.stringify(keys));
