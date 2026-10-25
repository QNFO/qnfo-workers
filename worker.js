// RETIRED-DUPLICATE-STUB - DO NOT DEPLOY. See ./wrangler.toml.
//
// SECRET-IN-PUBLIC-REPO-1 (agent_issues 1450) + DUP-WORKER-NAME-GATE-1 (#1384),
// remediated 2026-09-29. Built and deployed by the Cloudflare Workers Builds git
// integration on every push to main (target name "qnfo-workers"); it serves 410 and
// carries no bindings, no crons and no routes.
//
// This file was the pre-move qnfo-paper-indexer (v2.1-gateway-routed, 2026-08-12).
// The canonical worker now lives in qnfo-paper-indexer/ and, since 2026-10-06
// (INDEXER-FOLD-1, agent_issues 1756), that worker is FOLDED into qnfo-infra as the
// member indexerMod - read routes at https://qnfo-infra.q08.workers.dev/indexer/health,
// /indexer/count, /indexer/stats. qnfo-paper-indexer itself is no longer live.
//
// Two defects were removed here on 2026-09-29:
//
//   1. PLAINTEXT CREDENTIAL. Line 9 held a hardcoded token literal. Worse, the auth
//      gate accepted it as a valid credential:
//          if (token !== env.INDEX_TOKEN && token !== INDEX_TOKEN) return 401;
//      so the committed literal was not merely documented, it was an accepted
//      authentication secret for the /webhook and /index routes of any worker
//      deployed from this directory. A credential that appears in a public git
//      repository must be treated as compromised and rotated at the provider; this
//      file can only stop re-publishing it.
//
//   2. DUPLICATE WORKER NAME. It declared name = "qnfo-paper-indexer", colliding with
//      the canonical directory, so a deploy from the repository root would clobber the
//      live worker. scripts/dup-worker-name-gate.py now fails CI on that condition.
//
// The body is deliberately inert: it holds no credential, no binding, and no
// indexing logic, so a deploy from this path cannot leak a secret or silently
// replace the canonical worker with a two-month-stale implementation.
//
// MARKER CONTRACT: `reason` below is matched verbatim as the tombstone marker by
// qnfo-deploy-guard (DEPLOY-GUARD-WORKERS-BUILDS-1, agent_issues 1000142) so its
// Workers Builds deploys are recorded instead of alerted as UNLOGGED-MUTATION.
// Do not reword it; add fields instead.

const RETIRED = Object.freeze({
  status: "retired",
  reason: "stale duplicate of qnfo-paper-indexer; see qnfo-paper-indexer/wrangler.toml",
  issue: "SECRET-IN-PUBLIC-REPO-1 / #1384",
  retired_at: "2026-09-29",
  successor: "https://qnfo-infra.q08.workers.dev/indexer/health",
  successor_note: "qnfo-paper-indexer is FOLDED into qnfo-infra (INDEXER-FOLD-1, 2026-10-06); no separate indexer worker is live",
});

export default {
  async fetch() {
    return new Response(JSON.stringify(RETIRED), {
      status: 410,
      headers: { "Content-Type": "application/json" },
    });
  },
};
