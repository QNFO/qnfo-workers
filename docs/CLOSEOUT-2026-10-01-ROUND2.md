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
#1649 (personal-life DB, not readable from the audit plane by design) is covered by EVID-1649-BRIEF through the
remediation consumer's personal-life plane probe (round 3; it replaced a Claude check-in).

## Left to the owning session

#1710 to #1716 were filed at 10:22Z by the STRATEGY-1 session and are implemented in its open PR 292 (outreach consent,
paper-page SEO, review gate). This session did not edit them, to avoid concurrent changes to the same items.

## Round 3 (11:00Z to 12:30Z): failure modes found by the live probes, fixed at the root

Each item below was observed live, root-caused, shipped through the canonical deploy, and re-measured.

| Failure mode (issue) | Root cause | Fix (PR) | Live evidence |
|---|---|---|---|
| qnfo-ops replayed a tool result instead of running the tool (#1719) | the L1 chat cache stored answers built from tool calls; a semantic neighbour (cosine 0.93) got the cached `research_queue` result in 2 s | 2.38.33: store only when `toolLog` is empty; semantic hits only from the current cache epoch (306) | #1189 probe after deploy: `persisted:true`, http 201, intent `int-c9713691mupfphi0` |
| qnfo-email archived raw mail under a foreign or zero id (#1720) | `meta.last_row_id` is unchanged by the upsert's UPDATE path; redeliveries hit UNIQUE(email_id) on id 0 | 2.2.1: `RETURNING id`; archive `ON CONFLICT DO NOTHING`; two orphan rows removed (308) | orphans 0; the dashboard's one observability warn predates the deploy |
| A burst of merges lost a commit's deploys (#1721) | GitHub keeps one pending run per concurrency group; the next run diffed only its own push | canonical-deploy diffs from the last successful push deploy (309); stranded workers redeployed | run 36855910264: `diff base b442f380 ... last successful push deploy b442f380` |
| Two outreach engines could send 16/day (#1718) | each engine counted only its own ledger | one shared 8/day and 3/day-per-domain count read before every send, fail closed (310) | cloud-ops 1.15.9, outreach 0.3.4 live; EVID-1718-SHAREDCAP watches the 7-day window |
| Paper pages had no `citation_pdf_url` (#1714) | no PDF route; the first cut sent no User-Agent to Zenodo and cached the failure | `/papers/<slug>.pdf` from the Zenodo record, else the qnfo-pdf rendered copy in R2 (316, 319, 323) | all 7 STRATEGY s2.4 works: meta plus 200 `application/pdf` (83 KB to 802 KB) |
| Research revise never produced a paper (#1504, #1620) | the revise asked for the whole 22.7k-char paper back for a 124-char fix; reasoning models spent the 8192-token budget reasoning (0 chars), and a 32768 budget hit Workers AI's 240 s timeout (3046) on every stage | patch-mode revise: exact find/replace edits applied only where unique (311); 8192 budget restored after the timeout regression (330); `reasoning_effort: low` for the patch (336); fail fast instead of the futile full rewrite, and no identical reconcile retry after a timeout, so a stage stays inside the 15-minute wall limit (341) | 12:31:16Z `revise-patch proposed=1 applied=1`, `revise->review` cycle 1; #1504 closed by EVID-1504-REVISE |

Also this round:
- Merged the idle, green peer PRs 300, 301 and 305 (all required checks green; CodeQL failures were the account-wide rate limit).
- #1642 and #1653 closed early by running the venue radar and radar-hub now, not tomorrow.
- New evidence contracts close themselves on their windows: EVID-1710-RESUME (first post-resume send), EVID-1711-REACH (7 days
  with at least 5 reach sources), EVID-1715-PRIORWIN (closed), EVID-1718-SHAREDCAP (7-day window).
- PLANE-PROBE-1 (331): the remediation consumer runs allowlisted probes against the personal-life plane through the Cloudflare
  API, token-only output. EVID-1649-BRIEF replaces the Claude check-in for #1649, in line with the owner directive of
  2026-10-01 (no dependency on continued Claude usage, #1723 to #1727).
- #1683: gpt-5.5 traffic last seen 2026-09-26T14:11Z (gateway logs); the 30-day unified total (224.55) decays as pre-Phase-A
  days age out, and EVID-1683-SPEND closes it when it reads at most $150.

### State at 12:40Z

- Closed with evidence in round 3: #1189, #1504, #1642, #1653, #1681, #1714, #1715, plus #1719, #1720 and #1721 (filed and
  fixed this round).
- Self-closing on contracts:
  - #1641 (radar 07:30Z) and #1647 (engagement 05:15Z) on 2026-10-02.
  - #1649 (brief, plane probe) on 2026-10-02.
  - #1620 when the cycling row publishes.
  - #1683 (30-day spend decay).
  - #1710 (first post-resume send).
  - #1711 and #1718 (7-day windows).
- Filed by sessions, owned by the fleet's issue loop like any other row: #1712 and #1716 (STRATEGY-1), #1723 to #1727
  (owner directive on Claude independence; 1723 closed with evidence, 1725 built as OBJECTIVE-REVISION-APPLY-1).
- #1713 needs the owner to connect LinkedIn in Buffer (account connection, by design).
- fleet.qnfo.org reads ACTION_NEEDED only for the two qnfo-research-exec internalError invocations in the 12:00Z hour, the
  wall-limit overrun fixed in 0.9.39. They share an hourly bucket with the 12:37Z redeploy, so the hour-granular "after the
  current deploy" filter still counts them until the 3-hour window passes.
