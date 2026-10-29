# SECURITY FINDING — qnfo-ops `backups` binding exposes a fleet-deploy admin token
**Date:** 2026-09-13 · **Found by:** qnfo-ops (ops endpoint) during a fleet error/staleness audit · **Severity:** high (privilege), not an active incident
**Status:** NOT remediated — the finding endpoint cannot change its own bindings

## Summary

The `qnfo-ops` worker is bound to the R2 bucket `qnfo-backups` (binding name `backups`). That bucket contains a `credentials/` prefix. Among the objects readable through the endpoint's `r2_get` tool, with **no confirmation gate**, is:

```
credentials/fleet-deploy-admin-token.txt      (48 B)
```

`qnfo-ops` is an LLM tool endpoint: it executes model-chosen tool calls, including calls influenced by text it has read from D1, R2, the web, or GitHub. Its stated scope is read-only multi-DB query, compute, fleet probes and mailbox operations. It does not need deploy authority to do any of that.

## Why this matters

1. **Privilege escalation by construction.** Any prompt-injection, tool-loop error, or model mistake in this endpoint is one `r2_get` away from a live **fleet-deploy admin token** — i.e. from fleet-wide deploy authority. The blast radius of a single bad tool call is the entire fleet, not one worker.
2. **No gate.** `r2_get` has no `confirm` parameter, unlike `r2_delete`, `kv_delete`, and destructive `ops_d1_write` statements. Reads of the credentials prefix are indistinguishable from reads of an audit log.
3. **Unrelated data in the same bucket.** `d-drive-final-2026-09-04/` is a personal-drive snapshot (single objects up to **284 MB**, e.g. `$RECYCLE.BIN/…/$RF2BNP2.exe`). It has nothing to do with fleet operations and sits inside the same reachable namespace.
4. **The endpoint cannot fix it.** Bindings are deployment configuration. Nothing in the tool surface can narrow, drop, or gate its own R2 binding — so this must be resolved in `wrangler.toml` / the deploy config, by whoever holds that.

## Full observed credential prefix (paths only — no values read)

| object | size |
|---|---|
| `credentials/.env` | 395 B |
| `credentials/.bsky_credentials` | 37 B |
| `credentials/code-agent-key.txt` | 48 B |
| `credentials/fleet-deploy-admin-token.txt` | 48 B |
| `credentials/orch-token.txt` | 48 B |
| `credentials/osf-token.txt` | 70 B |
| `credentials/keys-2026-08-05.json` | 544 B |
| `credentials/orcid-client-2026-08-05` | 164 B |
| `credentials/wikidata-2026-08-05` | 39 B |

**No value from any of these objects was opened or recorded** in this audit or in any artifact produced by it. The finding is the exposure, not a leak.

## Recommendation

1. **Drop the `backups` binding from `qnfo-ops`.** If a backup read is genuinely required, add a narrow purpose-scoped bucket instead of a whole-bucket binding.
2. **Move `credentials/*` out of any bucket that has a tool binding**, or gate the prefix behind a separate worker that is not an LLM tool surface.
3. **Add a `confirm` gate to `r2_get`** for any prefix outside an explicit allow-list, matching the treatment already applied to destructive D1 writes and object deletes.
4. **Rotate `fleet-deploy-admin-token`** if the exposure window is not known to be closed. There is no evidence of misuse in the audit trail — but absence of evidence here is weak: `r2_get` calls are not logged with the object key in the tables this endpoint can read.

## Evidence trail

- `r2_list bucket=backups` → 25 objects, `BACKUPS_R2`, includes the `credentials/*` keys above.
- Probe that established the canonical-store gap in the same session: `r2_list bucket=audit prefix=qnfo-canonical` → **0 objects**; `releases` and `skills` hold papers and skill files only. None of the four bound buckets holds `qnfo-canonical`, which is why the qnfo-observability deploy blocker (`fleet_deploys` id=76, HTTP 400 code 10021) is not fixable from this endpoint.
- Related audit artifacts: `sql/APPLY-QUEUE-2026-09-13.sql` §5 (fleet error census), `audits/2026-09-13-FLEET-ERRORS-WARNINGS-STALE-REMEDIATION.md`, `audits/2026-09-13-AMENDMENT17-reprobe-after-remediation.md`, `audits/2026-09-13-AMENDMENT18-bucket-probe-and-credential-exposure.md`.

## Note on method

This finding was not the audit's target. The target was testing an assertion — that the canonical store was unreachable — which the probe confirmed. The credential exposure was found because the probe listed the whole bucket rather than querying for the one prefix it expected. Assertions restated are assumptions; assertions probed find adjacent facts.
