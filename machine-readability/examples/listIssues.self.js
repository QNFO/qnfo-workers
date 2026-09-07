// ============================================================================
// @self machine-readable header (convention: machine-readability/README.md + schema)
//   id:        qnfo-ops:listIssues
//   kind:      server-tool-handler (function, ES module)
//   version:   2.5.1-fix1
//   file:      qnfo-ops/worker.js
//   purpose:   List agent issues from qnfo-audit.agent_issues (ops backlog).
//   capabilities: [issues.list, backlog.read]
//   routes:    none (server tool dispatch: execTool -> listIssues)
//   bindings:  { d1: QNFO_AUDIT }
//   cloudflareProducts: [Workers, D1]
//   selfDoc:   docs/FIX-2026-09-07-ops_issues_list-await.md
//   promptContract: machine-readability/self-documentation.prompt.md
//   fixedAt:   2026-09-07  rootCause: missing await on D1 .all() (issue 506 family)
// ============================================================================

// FIX-2026-09-07 (issue 506): listIssues returned {ok:true,count:0,issues:[]} for EVERY
// status (incl 'all') because D1PreparedStatement.all() is async and was not awaited:
//   res = ... .all();              // Promise
//   (res.results || []).length     // undefined -> 0
// Live repro at audit: tool 0 rows vs direct D1 agent_issues GROUP BY = 504 rows (11 open).
// Corrected: await both .all() calls (single-line diff).
async function listIssues(env, args) {
  const status = args && args.status ? String(args.status) : "open";
  const priority = args && args.priority ? String(args.priority) : null;
  const limit = Math.min(parseInt((args && args.limit) || 20, 10) || 20, 50);
  if (!env.QNFO_AUDIT) return { ok: false, error: "audit db not bound" };
  let sql = "SELECT id, title, category, priority, status, created_at, updated_at FROM agent_issues";
  const conds = []; const params = [];
  if (status !== "all") { conds.push("status = ?" + (conds.length + 1)); params.push(status); }
  if (priority) { conds.push("priority = ?" + (conds.length + 1)); params.push(priority); }
  if (conds.length) sql += " WHERE " + conds.join(" AND ");
  sql += " ORDER BY updated_at DESC LIMIT " + limit;
  try {
    const stmt = env.QNFO_AUDIT.prepare(sql);
    const res = params.length ? await stmt.bind.apply(stmt, params).all() : await stmt.all();
    return { ok: true, status: status, count: (res.results || []).length, issues: (res.results || []).slice(0, 50) };
  } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; }
}

// Acceptance (post-deploy): open=11, closed=211, resolved=30, wontfix=252, all=504.
