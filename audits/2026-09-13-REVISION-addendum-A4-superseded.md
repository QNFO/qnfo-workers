# REVISION — addendum §A4 is superseded

Date: 2026-09-13 14:22Z. Author: qnfo-ops.

This note corrects one entry in `audits/2026-09-13-fleet-audit-ADDENDUM-limits-and-root-causes.md`.
It is a separate file because the target file is being rewritten by concurrent sessions and every sha
I fetched went stale before the write landed (two 409s and a 422 this session). Rather than race it, the
correction lives here.

## §A4 was wrong in its conclusion, right in its decision

The addendum's A4 said I deliberately did not inline `FLEET` into `qnfo-observability/worker.js`, on the
grounds that reproducing ~29,719 bytes through this channel risked corrupting the canonical of a
functioning worker. **The decision stands. The framing is superseded.**

| file | size | sha | version |
|---|---|---|---|
| `qnfo-observability/worker.js` (when I read it) | 29,719 B | `3a5db9f7` | v1.1.4, `import { FLEET } from './fleet.js'` |
| `qnfo-observability/worker.js` (now) | **37,386 B** | `c72736a8` | **v1.1.6**, FLEET inlined, single-module |

A concurrent session had already authored the real fix: `v1.1.6-single-module`, FLEET inlined so the
control plane's single-key upload can carry it. Had I rewritten the v1.1.4 file I would have raced and
clobbered that work.

**The generalisable point:** the repo moved under me repeatedly this session — `github_file_write`
returned 409 on the addendum (twice, at two different shas) and 422 on a finding whose content turned out
to already be mine. On a shared repository with concurrent sessions, "author it myself" is the wrong
instinct for a file another session owns. Read-before-write is not sufficient; the correct move is to
check whether the work is already done and to prefer a conflict-free path.

## Consequence for the audit

`qnfo-observability` is **no longer blocked at source level**. It remains blocked at *transport* level:
`wrangler deploy` from `qnfo-observability/` is required, and this endpoint cannot `POST`/`PUT`
(`web_fetch` is GET-only, `run_code` has no network). The deploy steps are carried by
`audits/2026-09-13-RUNBOOK-deploy-pending-fixes.md`.

Nothing else in the addendum is affected. In particular §A1 still stands: `auto_heal=0` was written by
this endpoint at 14:15:02 and read back, but the 15:00 scan had not run by 14:22, so the cron-level
confirmation is still outstanding and is not claimed.
