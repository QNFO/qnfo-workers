# qnfo-workers: rules for agent sessions

Several agent sessions work this fleet concurrently with shared credentials. These rules exist
because each one was broken at least once; the linked issue holds the evidence.

## Shared secrets (#1701)
- Before you PUT, rotate or delete any worker secret, take the lease:
  `POST https://qnfo-deploy-guard.q08.workers.dev/secret-lock/acquire {"worker":"<script>","owner":"<session>","ttl_sec":300}`.
  If `acquired` is false, another session owns that secret right now: observe and verify, do not write.
- Release it with `POST /secret-lock/release {"worker":"<script>","token":"<token>"}`. Treat a write as durable only after
  a later re-probe confirms it.
- Never re-accept a rotated-out key, and never commit a secret value.

## Internal calls to qnfo-ai (#1703)
- Internal workers authenticate to qnfo-ai by service-binding props, not by a copy of the router key. Add
  `props = { caller = "<worker name>" }` under the worker's qnfo-ai `[[services]]` binding in wrangler.toml; the canonical
  deploy installs it (qnfo-ops BINDING-PROPS-APPLY-1). Do not create or rotate per-worker copies of ROUTER_AUTH_KEY.

## Deploys
- Deploy through the canonical path (merge to main; canonical-deploy.yml calls qnfo-ops /ops/deploy). It takes the
  deploy lock, writes the ledger, installs declared bindings and applies crons.
- The canonical path never creates a worker that is absent from the account (#1704, WORKER-RESURRECTION-GUARD-1). A
  brand-new worker deploys from the push that adds its worker.js, or by workflow_dispatch with `workers=<name>`.
- A retired or folded worker directory carries a `RETIRED` or `FOLDED` file; do not remove it to get a deploy through.
- Bump `var VERSION` in every changed worker.js and keep `deployed-current.worker.js` identical to `worker.js`
  (version-bump-guard and mirror-guard are required checks).

## Cloudflare actions without a token
- `cf-ops-actions.yml` (workflow_dispatch) runs allowlisted Cloudflare API actions with the repository's token:
  report, delete-worker (marker-guarded), gateway-logs, gateway-cost, ai-neurons, access-probe, r2-get. Extend
  `scripts/cf_ops_actions.py` rather than parking an issue as "needs the credential holder".

## The charter (QUNIVERSE-CHARTER-1)
- `docs/QUNIVERSE-CHARTER.md` is the system's charter: what the Quniverse is, what it should be, objectives, SWOT, MVP,
  blue-sky footprint, roadmap order and decision rules. Read it, and `GET https://qnfo-fleet-control.q08.workers.dev/charter`,
  before any change that adds, retires or redirects a worker, cron, binding, table family or spend.
- Every PR, issue and roadmap item names the charter pillar it serves (`core`, `autonomy`, `research`, `reach`, `cost`,
  `security`, `personal`). A new worker directory declares `# charter-pillar: <key>` in its wrangler.toml and names the
  same-class retirement it funds (net-zero rule); `charter-guard` fails CI otherwise. Work that serves no pillar is parked.
- The section between the `CHARTER-LIVE` markers is generated daily by qnfo-fleet-control (CHARTER-LOOP-1) and committed
  to main; never edit it by hand. Hand-written sections change by PR with a version bump. `CHARTER_PILLARS` and
  `CHARTER_MVP` in the kernel and the tables in the charter change together (the guard enforces parity).

## No Claude dependency at runtime (NO-CLAUDE-RUNTIME-DEPENDENCY-1)
- Owner directive 2026-10-01: the fleet and its dashboard must not depend on continued Claude usage, and all data is hosted
  on Cloudflare (D1, R2, KV, Workers), never on claude.ai (Claude Docs, artifacts, Routines). A session builds the fleet; it
  is never part of it.
- Do not make claude.ai a system of record, a link target in a worker or doc, or a recurring runner. Recurring work is a
  worker cron (using qnfo-ai and D1). A decision the owner must make is made in https://fleet.qnfo.org (queue cards,
  objective decisions, the prompt panel), never by "telling a session". The dashboard refuses claude.ai and anthropic.com
  links in queue items.
- Sensitive personal data does not go into the shared `qnfo-audit` D1 that many workers and sessions can read; it needs a
  dedicated private store bound only to the worker that serves it (open decision: agent_issues NO-CLAUDE-RUNTIME-DEPENDENCY-1).
- Known violations being retired: the Identity doc on Claude Docs and the two claude.ai Routines
  (NO-CLAUDE-RUNTIME-DEPENDENCY-1, ROUTINES-ON-CLAUDE-1, OBJECTIVE-REVISION-APPLY-1).

## Issues and evidence
- Open work lives in D1 `qnfo-audit.agent_issues`. Close an issue only with evidence in `issue_triage.close_evidence`
  (a live measurement, not "deployed").
- GitHub `schedule` triggers never fire on this repository; periodic work belongs in worker crons.
