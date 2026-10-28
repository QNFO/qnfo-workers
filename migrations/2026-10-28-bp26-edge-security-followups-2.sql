-- BP26-EDGE-SECURITY-1 follow-up 2 (2026-10-28, charter pillar security; OWNER-NO-LOOSE-ENDS-1): TURNSTILE_SECRET is bound on idea-hub, qnfo-ipatent and personal-companion
-- (verified live: a POST without a token is refused), and deliberately NOT on qnfo-fleet-dashboard: the qnfo-tools-mcp owner_code tool posts to /api/cmd/code from a Worker with no
-- browser and no Turnstile token, so binding the secret would break it. The dashboard keeps the widget and the per-address Durable Object limit; this issue closes the gap.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'BP26-EDGE-TURNSTILE-OWNERCODE-1:%';

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'BP26-EDGE-TURNSTILE-OWNERCODE-1: let the qnfo-tools-mcp owner_code call past the Turnstile gate on /api/cmd/code, then bind TURNSTILE_SECRET on qnfo-fleet-dashboard',
 'Charter pillar: security. Doer: qnfo-fleet-dashboard via qnfo-code-orchestrator. /api/cmd/code (e-mail the owner a sign-in code) verifies a Turnstile token with action fleet_cmd (qnfo-fleet-dashboard 1.73.0) but is fail-open because TURNSTILE_SECRET is unbound: qnfo-tools-mcp owner_code (qnfo-tools-mcp/worker.js fleetJson) posts {} from a Worker with no widget. Lever: the dashboard skips the Turnstile check when the request carries a valid x-loop-token (owner.loop is already computed for the route) and qnfo-tools-mcp sends its loop token on that one call (a sibling credential is used by calling the sibling route, never by copying the secret); then bind TURNSTILE_SECRET on qnfo-fleet-dashboard under the secret lock (docs/BP26-EDGE-SECURITY-1.md, Secrets) from the widget qnfo-edge-forms-1 (sitekey 0x4AAAAAAFpf2WdSG4-h5mu_). The per-address OtpRateLimiter stays in front of it. Bump the minor VERSION, keep deployed-current.worker.js identical. Closing probe: an unauthenticated POST https://fleet.qnfo.org/api/cmd/code with body {} answers 403 and the owner_code tool still returns sent or a rate-limit note.
runtime-probe: {"url": "https://fleet.qnfo.org/health", "status": 200, "min_version": "1.74.0"}
code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js
code-anchor: const ts = await turnstileVerify(env, b && b.cf_turnstile, request.headers.get("CF-Connecting-IP") || "", "fleet_cmd");',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'BP26-EDGE-TURNSTILE-OWNERCODE-1:%' AND status = 'open');
