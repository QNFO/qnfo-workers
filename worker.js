// RETIRED-DUPLICATE-STUB - DO NOT DEPLOY. See ./wrangler.toml.
//
// SECRET-IN-PUBLIC-REPO-1 + DUP-WORKER-NAME-GATE-1 (#1384), remediated 2026-09-29.
//
// This file was the pre-move qnfo-paper-indexer (v2.1-gateway-routed, 2026-08-12).
// The canonical worker now lives in qnfo-paper-indexer/ and is deployed from
// qnfo-paper-indexer/wrangler.toml (main = "deployed-current.worker.js", live
// version 3.0.5-purge-orphan-sweep at the time of retirement).
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

const RETIRED = Object.freeze({
  status: "retired",
  reason: "stale duplicate of qnfo-paper-indexer; see qnfo-paper-indexer/wrangler.toml",
  issue: "SECRET-IN-PUBLIC-REPO-1 / #1384",
  retired_at: "2026-09-29",
});

export default {
  async fetch() {
    return new Response(JSON.stringify(RETIRED), {
      status: 410,
      headers: { "Content-Type": "application/json" },
    });
  },
};
