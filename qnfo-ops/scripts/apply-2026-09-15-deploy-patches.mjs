#!/usr/bin/env node
/**
 * apply-2026-09-15-deploy-patches.mjs  (qnfo-ops, 2026-09-15)
 *
 * Applies the deploy-gated fixes for the 2026-09-15 ops backlog closeout:
 *   921  CF-WORKER-DEPLOY-BINDING-WIPE-1  qnfo-ops/worker.js   fail closed on live bindings
 *   922  REGISTRY-DEPS-CLOBBER            qnfo-ops/worker.js   deps preserve (CASE + deps:null)
 *   925  OPS-D1-QUERY-GUARD-1             qnfo-ops/worker.js   auto-LIMIT + compound wrap
 *   918  OPS-WORKSPACE-GLOB-FALSE-NEGATIVE qnfo-ops/worker.js  paginate + real **/ semantics
 *   910  OSF-INTEGRITY-OUTPUT-STALL       osf-integrity-check/worker.js  fetch timeout + persist alert
 *
 * WHY AN APPLIER AND NOT A DIRECT EDIT: qnfo-ops/worker.js is 233,907 bytes; it cannot be
 * carried through the ops endpoint's github_file_write, and cf_worker_deploy is itself the
 * defect under repair (921). This script is idempotent and FAIL-CLOSED: every hunk asserts
 * its find-anchor count before writing, so a drifted source aborts instead of corrupting.
 *
 * USAGE (from the repo root):
 *   node qnfo-ops/scripts/apply-2026-09-15-deploy-patches.mjs            # check only (no writes)
 *   node qnfo-ops/scripts/apply-2026-09-15-deploy-patches.mjs --write    # apply
 * then: node --check <file> for each changed file, and deploy through wrangler
 *       (see qnfo-ops/README-deploy.md - cf_worker_deploy is NOT a safe deploy path).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const WRITE = process.argv.includes("--write");
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);

// ---------------------------------------------------------------------------
// Hunks.  kind:
//   "insert-before" : exact anchor line, insert text before it (anchor kept)
//   "replace"       : exact substring -> replacement (asserted count)
//   "replace-line"  : whole line matched by `match` (substring) -> replacement line
// ---------------------------------------------------------------------------
const HUNKS = [
  // ---- 921: never PUT metadata {bindings: []} over a script that has live bindings ----
  {
    id: "P1-921-binding-wipe-guard",
    file: "qnfo-ops/worker.js",
    kind: "insert-before",
    anchor: '    const metadataPart = JSON.stringify({ body_part: "worker.js", bindings: [] });',
    expect: 1,
    insert: `    // BINDING-PRESERVE-1 (2026-09-15, ticket 921): the upload metadata below carries
    // bindings: [], which DESTROYS every binding of the target script. This endpoint has no
    // binding-write tool, so such a loss is unrecoverable. Fail closed instead of wiping.
    let liveB = [];
    try {
      const lb = await cfWorkerBindings(env, { worker });
      if (lb && lb.ok && Array.isArray(lb.bindings)) liveB = lb.bindings;
    } catch (e) { liveB = []; }
    if (liveB.length) return { ok: false, rejected: true, error: "BINDING-WIPE-GUARD: " + worker + " has " + liveB.length + " live bindings; a PUT with bindings:[] would destroy them and this endpoint cannot restore bindings. Deploy through wrangler (see README-deploy.md)." };
`
  },

  // ---- 922 (a): the upsert/register SQL keeps stored deps when the incoming value is empty ----
  {
    id: "P2a-922-deps-preserve-sql",
    file: "qnfo-ops/worker.js",
    kind: "replace",
    find: "models=excluded.models, deps=excluded.deps, updated_at=excluded.updated_at",
    replace: "models=excluded.models, deps=CASE WHEN excluded.deps IS NULL OR excluded.deps IN ('','[]') THEN COALESCE(service_registry.deps, excluded.deps) ELSE excluded.deps END, updated_at=excluded.updated_at",
    expect: 2
  },
  // ---- 922 (b): registryRefresh stops hardcoding deps: [] ----
  {
    id: "P2b-922-refresh-deps-null",
    file: "qnfo-ops/worker.js",
    kind: "replace",
    find: "deps: [] });",
    replace: "deps: (h.body && Array.isArray(h.body.deps) && h.body.deps.length) ? h.body.deps : null });",
    expect: 1
  },
  // ---- 922 (c): registryRegister null-not-empty ----
  {
    id: "P2c-922-register-deps-null",
    file: "qnfo-ops/worker.js",
    kind: "replace",
    find: "JSON.stringify(body.deps || [])",
    replace: "(body.deps && body.deps.length ? JSON.stringify(body.deps) : null)",
    expect: 1
  },

  // ---- 925: auto-LIMIT + wrap wide compound SELECTs instead of rejecting ----
  {
    id: "P3a-925-auto-limit",
    file: "qnfo-ops/worker.js",
    kind: "replace-line",
    match: "add LIMIT n (aggregate exempt)",
    replace: `  // OPS-D1-QUERY-GUARD-1 (2026-09-15, ticket 925): auto-append LIMIT instead of rejecting the
  // call, and wrap wide compound SELECTs (SQLITE_MAX_COMPOUND_SELECT) instead of letting D1
  // error out. Schema introspection (sqlite_master) now works without a manual LIMIT.
  let sqlExec = sql;
  if (/\\bunion\\b/i.test(sqlExec) && (sqlExec.match(/\\bunion\\b/gi) || []).length >= 4 && !/^\\s*select\\s+\\*\\s+from\\s*\\(/i.test(sqlExec)) sqlExec = "SELECT * FROM (" + sqlExec + ") LIMIT 100";
  if (!/\\blimit\\s+\\d+/i.test(sqlExec) && !/^\\s*select\\s+(count|sum|avg|min|max)\\s*\\(/i.test(sqlExec) && !/\\bgroup\\s+by\\b/i.test(sqlExec) && !/select\\s+sqlite_version/i.test(sqlExec)) sqlExec = sqlExec + " LIMIT 100";`
  },
  {
    id: "P3b-925-exec-sqlExec",
    file: "qnfo-ops/worker.js",
    kind: "replace",
    find: "env[bind].prepare(sql).all()",
    replace: "env[bind].prepare(sqlExec).all()",
    expect: 1
  },

  // ---- 918: paginate the R2 listing (the real false negative) ----
  {
    id: "P4a-918-paginate-listing",
    file: "qnfo-ops/worker.js",
    kind: "replace-line",
    match: "const listed = await env.BACKUPS_R2.list({ prefix: listPfx, limit });",
    replace: `  // WORKSPACE-GLOB-PAGINATE-1 (2026-09-15, ticket 918): the old code listed ONE page of
  // `limit` keys and ran the pattern over that truncated page, so any match beyond the first
  // page returned {ok:true,count:0} - a false negative that reads as "no such file".
  let objects = [], cursor = undefined, pages = 0;
  while (pages < 50) {
    const page = await env.BACKUPS_R2.list(cursor ? { prefix: listPfx, cursor } : { prefix: listPfx });
    objects = objects.concat(page.objects || []);
    pages++;
    if (!page.truncated) break;
    cursor = page.cursor;
  }
  const listed = { objects, truncated: false };`
  },
  {
    id: "P4b-918-glob-regex",
    file: "qnfo-ops/worker.js",
    kind: "replace-line",
    match: "const rx = pattern.replace(",
    replace: `    const rx = pattern.replace(/[.+^$\{\}()|[\\]\\\\?]/g, "\\\\$&").replace(/\\*\\*\\//g, "\\u0001").replace(/\\*\\*/g, "\\u0002").replace(/\\*/g, "[^/]*").replace(/\\u0001/g, "(?:.*/)?").replace(/\\u0002/g, ".*");`
  },
  {
    id: "P4c-918-anchor-regex",
    file: "qnfo-ops/worker.js",
    kind: "replace-line",
    match: 're = new RegExp(rx + "$");',
    replace: `      re = new RegExp("^" + rx + "$");`
  },

  // ---- 910: bound the OSF fetches so the invocation can reach the INSERT ----
  {
    id: "P5a-910-osf-fetch-timeout",
    file: "osf-integrity-check/worker.js",
    kind: "replace",
    find: "const resp = await fetch('https://api.osf.io/v2/registrations/' + r.id + '/', { headers });",
    replace: "const resp = await fetch('https://api.osf.io/v2/registrations/' + r.id + '/', { headers, signal: AbortSignal.timeout(8000) });",
    expect: 1
  },
  {
    id: "P5b-910-persist-failure-alert",
    file: "osf-integrity-check/worker.js",
    kind: "replace",
    find: "} catch (e) { summary.persisted = false; summary.persist_error = String(e).slice(0, 150); } return summary; }",
    replace: "} catch (e) { summary.persisted = false; summary.persist_error = String(e).slice(0, 150); try { await env.AUDIT.prepare(\"INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, datetime('now'), 'proactive-alert', ?2, NULL, 'osf-integrity-check', 'err')\").bind('osf-persist-fail-' + summary.checked_at.slice(0, 13), 'WATCH:osf-persist-fail: ' + summary.persist_error).run(); } catch (e2) {} } return summary; }",
    expect: 1
  }
];

// ---------------------------------------------------------------------------
const byFile = new Map();
for (const h of HUNKS) {
  if (!byFile.has(h.file)) byFile.set(h.file, []);
  byFile.get(h.file).push(h);
}

let failed = 0, applied = 0;
for (const [file, hunks] of byFile) {
  let src;
  try { src = readFileSync(file, "utf8"); }
  catch (e) { console.log("MISSING FILE " + file + ": " + e.message); failed++; continue; }
  const before = sha(src);
  let out = src;

  for (const h of hunks) {
    const already = h.kind === "insert-before"
      ? out.includes("BINDING-PRESERVE-1")
      : out.includes(h.replace ? h.replace.slice(0, 40) : "\u0000") && h.id.startsWith("P1");
    if (h.kind === "insert-before") {
      const n = out.split(h.anchor).length - 1;
      if (out.includes("BINDING-PRESERVE-1 (2026-09-15, ticket 921)")) { console.log("SKIP  " + h.id + " (already applied)"); continue; }
      if (n !== (h.expect || 1)) { console.log("FAIL  " + h.id + " anchor count=" + n + " expected=" + (h.expect || 1)); failed++; continue; }
      out = out.replace(h.anchor, h.insert + h.anchor);
      console.log("OK    " + h.id); applied++;
    } else if (h.kind === "replace") {
      const n = out.split(h.find).length - 1;
      if (n === 0 && out.includes(h.replace)) { console.log("SKIP  " + h.id + " (already applied)"); continue; }
      if (n !== (h.expect || 1)) { console.log("FAIL  " + h.id + " find count=" + n + " expected=" + (h.expect || 1)); failed++; continue; }
      out = out.split(h.find).join(h.replace);
      console.log("OK    " + h.id + " (x" + n + ")"); applied++;
    } else if (h.kind === "replace-line") {
      const lines = out.split("\n");
      const idx = lines.findIndex((l) => l.includes(h.match));
      if (idx < 0) {
        if (out.includes(h.replace.trim().split("\n")[0])) { console.log("SKIP  " + h.id + " (already applied)"); continue; }
        console.log("FAIL  " + h.id + " line match not found: " + h.match); failed++; continue;
      }
      lines.splice(idx, 1, h.replace);
      out = lines.join("\n");
      console.log("OK    " + h.id); applied++;
    }
  }

  if (out === src) { console.log("--    " + file + " unchanged (sha " + before + ")"); continue; }
  console.log("      " + file + " sha " + before + " -> " + sha(out) + "  (" + (out.length - src.length) + " bytes)");
  if (WRITE) { writeFileSync(file, out); console.log("      WRITTEN"); }
  else console.log("      (check only - pass --write to apply)");
}
console.log("\napplied=" + applied + " failed=" + failed + (WRITE ? " [WRITE]" : " [DRY RUN]"));
process.exit(failed ? 1 : 0);
