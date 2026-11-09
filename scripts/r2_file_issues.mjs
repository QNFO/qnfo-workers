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

const GROUP_TITLE = /^DOC-IS-CODE-1: implement or retire R2 documents under (.+)$/;

/** R2-AUDIT-CLOSE-1: open group issues whose title is not in this run's emitted set have no orphan left. */
export function resolvedGroups(openIssues, items) {
  const live = new Set(items.map((i) => i.title));
  return openIssues.filter((i) => GROUP_TITLE.test(i.title) && !live.has(i.title)).map((i) => ({ number: i.number, title: i.title, group: i.title.match(GROUP_TITLE)[1] }));
}

export function retireStatement(group, evidence) {
  const [bucket, folder] = group.split("/");
  const base = `r2://${bucket}/`;
  const root = folder === "(root)";
  return {
    sql: "UPDATE roadmap_implementation SET status = 'retired', evidence = ?1 WHERE source = 'doc-orphan' AND status = 'open' AND artifact_ref LIKE ?2" + (root ? " AND artifact_ref NOT LIKE ?3" : ""),
    params: root ? [evidence, base + "%", base + "%/%"] : [evidence, base + folder + "/%"],
  };
}

export async function retireRoadmap(groups, evidence, { fetchImpl = fetch, tok = process.env.CLOUDFLARE_API_TOKEN, acct = process.env.CLOUDFLARE_ACCOUNT_ID } = {}) {
  if (!groups.length) return { retired: 0 };
  if (!tok || !acct) return { skipped: "no Cloudflare credentials", groups: groups.length };
  const r = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${acct}/d1/database/${AUDIT_DB}/query`, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ batch: groups.map((g) => retireStatement(g.group, evidence)) }) });
  const j = await r.json().catch(() => ({}));
  if (!j.success) return { failed: groups.length };
  return { retired: (j.result || []).reduce((n, x) => n + (x?.meta?.changes || 0), 0) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, cap = "25", roadmapFile] = process.argv.slice(2);
  const items = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const openIssues = JSON.parse(execFileSync("gh", ["issue", "list", "--state", "open", "--label", "doc-orphan", "--limit", "1000", "--json", "title,number"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  const open = new Map(openIssues.map((i) => [i.title, i]));
  let made = 0, skipped = 0, updated = 0;
  for (const it of items) {
    const ex = open.get(it.title);
    if (ex) {
      // a group issue's checklist shrinks as documents are implemented or retired: keep the body current
      const cur = JSON.parse(execFileSync("gh", ["issue", "view", String(ex.number), "--json", "body"], { encoding: "utf8" })).body || "";
      if (cur.trim() !== it.body.trim()) { execFileSync("gh", ["issue", "edit", String(ex.number), "--body", it.body], { stdio: "inherit" }); updated++; }
      else skipped++;
      continue;
    }
    if (made >= Number(cap)) break;
    execFileSync("gh", ["issue", "create", "--title", it.title, "--body", it.body, ...it.labels.flatMap((l) => ["--label", l])], { stdio: "inherit" });
    made++;
  }
  const out = { orphans: items.length, filed: made, updated, already_open: skipped, deferred: Math.max(0, items.length - made - skipped), closed: 0 };
  // R2-AUDIT-CLOSE-1: a group with no orphan left closes its issue (run id as evidence) and retires its roadmap rows
  const evidence = `r2-doc-audit run ${process.env.GITHUB_RUN_ID || "local"}: no orphan documents remain under this group`;
  const done = resolvedGroups(openIssues, items);
  for (const g of done) { execFileSync("gh", ["issue", "close", String(g.number), "--reason", "completed", "--comment", evidence], { stdio: "inherit" }); out.closed++; }
  out.retired = await retireRoadmap(done, evidence);
  if (roadmapFile && existsSync(roadmapFile)) {
    const rows = readFileSync(roadmapFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    out.roadmap = await insertRoadmap(rows);
  }
  console.log(JSON.stringify(out));
  if (out.roadmap?.failed) process.exit(1);
}
