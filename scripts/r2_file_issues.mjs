// Files issues from out/issues.jsonl with gh (skipping titles that already have an open issue; cap per run is argv[3]) and
// inserts out/roadmap.jsonl rows into roadmap_implementation in the qnfo-audit D1 (argv[4], skipped when no Cloudflare credentials),
// so every orphan document is a roadmap row with a doer and a probe, not only an issue.
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const AUDIT_DB = process.env.AUDIT_D1_ID || "35e2e573-92f3-46ac-83c6-22f6429fc5e5";

export function roadmapStatements(rows) {
  return rows.map((r) => ({
    sql: "INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence, created_at) SELECT ?1, 'doc-orphan', ?2, 'document', ?3, 'open', ?4, datetime('now') WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = ?1)",
    params: [r.id, ("Implement or retire " + r.source).slice(0, 200), r.source, `doer ${r.doer}; probe ${r.probe}`],
  }));
}

export async function insertRoadmap(rows, { fetchImpl = fetch, tok = process.env.CLOUDFLARE_API_TOKEN, acct = process.env.CLOUDFLARE_ACCOUNT_ID, size = 50 } = {}) {
  if (!tok || !acct) return { skipped: "no Cloudflare credentials", rows: rows.length };
  const sts = roadmapStatements(rows);
  let inserted = 0, failed = 0;
  for (let i = 0; i < sts.length; i += size) {
    const chunk = sts.slice(i, i + size);
    const r = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${acct}/d1/database/${AUDIT_DB}/query`, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ batch: chunk }) });
    const j = await r.json().catch(() => ({}));
    if (!j.success) { failed += chunk.length; continue; }
    inserted += (j.result || []).reduce((n, x) => n + (x?.meta?.changes || 0), 0);
  }
  return { rows: rows.length, inserted, already_present: rows.length - inserted - failed, failed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, cap = "25", roadmapFile] = process.argv.slice(2);
  const items = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const open = new Set(JSON.parse(execFileSync("gh", ["issue", "list", "--state", "open", "--limit", "1000", "--json", "title"], { encoding: "utf8" })).map((i) => i.title));
  let made = 0, skipped = 0;
  for (const it of items) {
    if (open.has(it.title)) { skipped++; continue; }
    if (made >= Number(cap)) break;
    execFileSync("gh", ["issue", "create", "--title", it.title, "--body", it.body, ...it.labels.flatMap((l) => ["--label", l])], { stdio: "inherit" });
    made++;
  }
  const out = { orphans: items.length, filed: made, already_open: skipped, deferred: Math.max(0, items.length - made - skipped) };
  if (roadmapFile && existsSync(roadmapFile)) {
    const rows = readFileSync(roadmapFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    out.roadmap = await insertRoadmap(rows);
  }
  console.log(JSON.stringify(out));
  if (out.roadmap?.failed) process.exit(1);
}
