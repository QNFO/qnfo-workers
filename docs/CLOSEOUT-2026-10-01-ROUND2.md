# Closeout, 2026-10-01 round 2: drain without waiting on the owner

Companion to `docs/CLOSEOUT-2026-10-01.md` (maintained by a parallel session). Directive for this round: resolve every
open item without waiting on the owner, find workarounds for credential gaps, and close only on evidence.

## Workarounds that removed the "needs the credential holder" class

| Mechanism | PR | What it unblocked |
|---|---|---|
| `cf-ops-actions.yml` plus `scripts/cf_ops_actions.py`: allowlisted Cloudflare API actions run with the repository's own token (delete-worker guarded by RETIRED/FOLDED markers, gateway-logs/cost, ai-neurons, access-probe, r2-get, ops-intake-probe) | 267, 270, 276, 293 | #1704 deletion, #1684 attribution, #1683/#1681/#1682 measurements, #1277 Access facts, #1163 draft, #1189 live probe |
| INTERNAL-CALLER-PROPS-1: qnfo-ai authenticates internal callers by service-binding `ctx.props` (deploy-time, unspoofable) | 246, 253 | #1703/#1702: key rotation no longer strands callers; no secret writes needed |
| REMEDIATION-TICK-1: fleet-control runs `remediation_contracts` hourly | 291 | issues whose proof is a future scheduled run close themselves with evidence |
| WORKER-RESURRECTION-GUARD-1: the canonical deploy never creates an absent worker implicitly | 260 | the failure mode that recreated qnfo-agent-ws |
| CLAUDE.md: session rules (secret lease, props auth, deploy guards, cf-ops-actions) | 270 | #1701 adoption |

## Closed with evidence this round

#1163 (Q08 article live: 200, feed, pieces 83), #1189-envelope (truthful ok:false observed live; persistence fixed in 1.3.7, see
below), #1277 (Zero Trust org and Access apps measured; scoped decision), #1279 (not adopted, reasoned), #1621 (versions per
flagship = 2), #1682 (probe neurons 0.32%), #1684 (DeepChat desktop client via BYOK `default`), #1685 (paper v1.4.1,
10.5281/zenodo.23079905), #1688 (usage snapshot, 44 scripts), #1700, #1701 (lease mutual exclusion proven live),
#1702/#1703 (calibration 10/10 with a stale key), #1704 (agent-ws deleted; RM-AGENT-WS-DECISION-1 = archive), #1708/#1709
(verified fix by a peer), #1717 (duplicate of #1189).

## Fixes shipped this round

- qnfo-ops 2.38.31: ops-frontier aliases moved off gpt-5.5 onto deepseek-v4-pro (business plan Phase A; #1683).
- fleet-control BYOK-BILLING-SPLIT-1: unified vs BYOK billing classified by stored-key provider (#1699).
- WORKERS-AI-ATTRIBUTION-1: per-worker neurons from usage tokens in research-exec, qnfo-ai, qnfo-ops, q08 (#1681).
- OPS-AGENT-WATCH-1: the #1680/#1696 7-day windows are standing hourly metrics with refile triggers.
- USAGE-SNAPSHOT-HOURLY-1: the per-script usage snapshot no longer waits for 03:00Z (#1688).
- intent-orchestrator 1.3.7 INTAKE-PERSIST-BUDGET-1: AI classification bounded at 8 s, so intents persist inside the
  caller's 20 s budget (#1189 root cause, reproduced by the live probe).
- Registry: the folded qnfo-fleet-calibrator row set to `folded` (dashboard 404 probe); live registry = 44 = account.

## Self-closing on evidence (remediation_contracts, hourly)

EVID-1647 engagement (2026-10-02 05:15Z), EVID-1642 venue radar (06:45Z), EVID-1653 radar-hub (personal daily; events
Monday), EVID-1641 mentions (07:30Z), EVID-1620 research publish, EVID-1504 revise, EVID-1699 unified metric, EVID-1683
30d unified spend at most $150, EVID-1681 attribution coverage at least 50%, EVID-1680/EVID-1696 watch metrics in band.
#1649 (personal-life DB, not readable from the audit plane by design) is covered by the 2026-10-02 07:50Z check-in.

## Left to the owning session

#1710 to #1716 were filed at 10:22Z by the STRATEGY-1 session and are implemented in its open PR 292 (outreach consent,
paper-page SEO, review gate). This session did not edit them, to avoid concurrent changes to the same items.
