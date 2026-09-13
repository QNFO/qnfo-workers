# HUB CONFIG PROVENANCE — the deployed hub cannot be rebuilt from the repo

Date: 2026-09-13. Companion to `docs/FLEET-PRODUCTIVITY-AUDIT-2026-09-13.md` and its addendum.
Every value is a tool return from the qnfo-ops session.

---

## 1. Finding

`audit-hub` is deployed and reports on `/health`:

    {"ok":true,"worker":"audit-hub","version":"1.0.0","members":4}

The repo, however, contains only **one member module** at `audit-hub/worker.js`, and that module
self-identifies differently. From its own source:

    var VERSION = "1.1.7";
    var SELF = { purpose: "fleet event/log audit + act + feedback loops (automated, user-free)",
                 checks: ["C1".."C10","F1".."F4"] };
    ...
    if (path === "/health" && m === "GET")
      return json({ ok: true, worker: "qnfo-auditor", version: VERSION, self: SELF, ... });

So:

| | value |
|---|---|
| deployed `audit-hub` `/health` | `worker: "audit-hub"`, `version: "1.0.0"`, `members: 4` |
| repo `audit-hub/worker.js` `/health` | `worker: "qnfo-auditor"`, `version: "1.1.7"` |
| repo `audit-hub/deployed-current.worker.js` | **byte-identical** to `worker.js` — same sha `9a056e60439eee4fdfd371d5405a79ea449cd92e`, same size 56702 |

**Deploying the repo file would produce a worker that answers `/health` with
`worker: "qnfo-auditor" v1.1.7` — not the deployed hub.** The 4-member wrapper that makes it
`audit-hub` exists **only in production** and is present in no artifact in this repo.

## 2. Consequences

1. **The hub is not reproducible from version control.** The member set, the wrapper, and the
   hub's own version string (1.0.0) are unversioned. `members: 4` cannot be expanded to names
   from any available surface: `/health` returns a count, `/members` and `/status` return only
   the hub's own name, `wrangler.toml` lists no members, and the Vectorize indexes (`notes`,
   `handoffs`, `tasks`) contain no record — their newest hits predate the 2026-09-10/12
   consolidation.
2. **`deployed-current.worker.js` is not reliably an upload artifact.** In this directory it is
   byte-identical to `worker.js`. The multipart-body corruption documented for
   `qnfo-cloud-ops` (closed issue 691) was a **specific fault**, not a property of the file
   type. The main audit's §5 should be read that way.
3. **The member names in the main audit's §12 remain inferred from counts.** That inference
   cannot be upgraded from the live surface or from the repo.

## 3. `audit-hub` is confirmed NOT a merge candidate — from source

The member module carries its own cron declaration in source:

    schedule: "45 1,13 * * * (standard) + 45 6 * * 1 (deep)"

`mode` is derived as `cron.split(/\s+/)[4] === "1" ? "deep" : "standard"`. So the auditor runs
**twice daily plus a weekly deep pass**, by design. Its low `req24` (5 at 14:06Z) is the
expected signature of a cron-driven worker, not idleness. This **upgrades** the main audit's
§12 note from inference to source-confirmed.

## 4. Corroboration of the reachability correction (audit §11)

The auditor's own `F4` check fetches:

    const KNOWN = ["qnfo-ai", "personal-api"];
    fetch("https://" + nm + ".q08.workers.dev/health", ...)

**The fleet's own code probes `q08.workers.dev/health` and treats a 200 with `ok===true` and a
`version` field as "healthy".** This independently corroborates the correction in §11 of the
main audit and refutes the earlier claim that `q08.workers.dev` returns 404 fleet-wide.

## 5. Auditor surface, for the record

Checks declared and exercised in source: `C1` stale open high, `C2` auto-close stale low
(≥14d, occ ≤3), `C3` reopen-on-recurrence, `C4` job silent >48h, `C5` events-sweep lag, `C6`
bridge stale open `agent_issues` >30d into the ledger, `C7` errata-queue stuck handling
(including auto-terminal flips and re-drafts), `C8` event clustering, `C9` digest email with a
personal-domain blocklist, `C10` resolve-on-recovery, `F1` feed-silence (events + kaizen),
`F2` improvement effectiveness, `F3` recurring-finding trend, `F4` live health probes.

Auth: `AUDITOR_TOKEN` as `Authorization: Bearer …`, required on every route except `/health`.
Tables touched: `fleet_audit_runs`, `kaizen_candidates`, `feedback_probes`, `issue_ledger`,
`issue_events`, `errata_queue`, `errata_actions`, `kaizen_reports`, `cloud_ops_events`,
`alerts`, `agent_issues`, `deployment_history`.

**Note for the backlog investigation:** `C6` deliberately creates ledger entries for every open
`agent_issues` row older than 30 days, and `upsertCandidate` promotes matured kaizen candidates
into the ledger. Both are **growth sources for the issue ledger** that run unattended twice a
day, with no corresponding automatic retirement except `C2` (low severity, ≥14d, occ ≤3). This
is a candidate mechanism for the backlog's measured rise (open `agent_issues` 21 → 54 during the
2026-09-13 session). **Not verified as the cause** — it is a plausible contributor identified
from source, and the rise was also driven by concurrent sessions.
