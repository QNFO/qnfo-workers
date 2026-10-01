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

## Round 4 (13:00Z to 16:00Z): charter and portfolio findings, implemented system-wide

Owner directive for this round: plan and implement the full scope of the charter and portfolio findings (SWOT weaknesses,
H0/H1 roadmap, violated and broken gates, footprint caps, portfolio hygiene) across the fleet. Each row below was measured
live, fixed at the root, deployed through the canonical path (or wrangler for the container worker), and re-measured.

### Research pipeline (#1620, pillar research)

| Failure mode | Root cause | Fix (PR) | Live evidence |
|---|---|---|---|
| Grounding produced an empty bibliography (bibCount 0) | the arXiv query used one exact phrase; corpus hits were read from the wrong schema | GROUNDING-BIB-1: phrase ladder plus the parent title, corpus citations from PAPER_VZ slugs (347) | row 5099abb8 14:32Z `ground->ensemble bibCount 14` |
| verify and revise looped forever on one row | verifyPass was dropped by review/revise and the qualitative branch had no bound | VERIFY-LOOP-BOUND-1 (347) | a second failing verify is terminal |
| Re-grounded rows reused stale cached drafts | the draft cache had no grounding fingerprint | ENSEMBLE-FRESH-DRAFTS-1 (355) | 14:49Z three legs `via workers-ai` (21k, 19k, 29k chars) |
| The gateway was silently unused (0-char reconcile, every review "unparseable") | gwCall returned "" when ROUTER_TOKEN was absent, before any call and without an event; qnfo-ai authenticates the binding by props | GW-PROPS-AUTH-1 (369) | after 15:17Z the review returned real findings (`review->verify hardLeft 6`) |
| Verification scripts never ran | the public pilot hostname answers 403 since PILOT-PUBLIC-EXEC-CLOSED-1, and the result was read from the wrong field | PILOT-PROPS-CALLER-1: a CONTAINERS_PILOT binding with props; the pilot injects its bearer for props callers (372) | pilot 1.0.10 and research-exec 0.9.46 live 15:29Z |
| Reference gates failed papers that had references | the heading regex allowed only "7."; the split returned a capture group, so the count was always 0 | REFS-RENDER-1 renders References from the bibliography; REFCOUNT-SPLIT-1, bib-aware floor, 20000-char publish floor and REVISE-NOOP-ADVANCE-1 folded in from the wave-4 session's PR 358 (372) | unit cases: 9 cited entries pass, 2 fail, appendices kept, idempotent |
| A verified new paper could never publish | the 0.8 pipeline never created the living-paper row nor set research_queue.paper_slug, so publish read slug NULL and markError re-grounded the verified paper | PAPER-ROW-PREP-1 ported from PR 358 with credit (research-exec 0.9.49): the draft row and slug are built from reconciled.md before any Zenodo call, with the 20000-char floor checked first | row 5099abb8 passed verify at 15:51Z (8 claims executed in the container through the new binding, 13 references rendered); it was parked as held until 0.9.49 was live, then resumed. **Published 16:01:19Z: 10.5281/zenodo.23086421**, the first publication since 2026-09-08. #1620 closed by EVID-1620-PUBLISH (verification #334, 16:03:29Z) |

### Charter gates (roadmap_implementation, re-measured)

- C5 (declared and live schedules converge): 39 undeployed directories carried no marker and 21 still declared crons. PR 359 marked all 39 RETIRED/FOLDED (charter rule 2). Measured: 44 deployable = 44 live; 80 declared crons = 80 live. Status: violated-remediated.
- C6 (version and capability list from the live endpoint): the snapshot's only writer was a desktop script, so it was 11 days stale. qnfo-deploy-guard 1.3.20 CAPABILITY-SNAPSHOT-1 (361) refreshes it from its cron every 6 hours. Forced run 15:11Z: 44 live, 41 stored, 11 retired rows removed. Conformance is now measured, at 5 of 44, and tracked as #1735 with contract EVID-C6-CONFORMANCE. Status: enforced-partial.
- A2 (canonical link and related identifiers): publishV2 deleted related_identifiers, dropped keywords and repeated the funnel link. PUBLISH-V2-METADATA-1 (369) fixes all three and asserts them after every publish. Contract EVID-GATE-A2-PUBLISHV2 proves it on the first post-fix publish.
- A3 (DB and deposit converge on one version string): all 218 published Zenodo-DOI papers were measured against the Zenodo API. 55 rows converged (zenodo_doi = doi, zenodo_url = the DOI's record, version = that record's Zenodo version). D1 triggers `trg_papers_doi_converge_ins/_upd` keep them converged. After: 0 url/doi mismatches and 0 doi/zenodo_doi mismatches.
- F2, C7, G2, G4, I7: re-measured live, with evidence in each row (usage snapshot 44/44 scripts; guard_registry 68/68 verified; metric_registry 30/30 with a disposition actor; #1480 replay).

### Security H0, roadmap and portfolio

- qnfo-containers-pilot 1.0.9 PILOT-RATE-LIMIT-1 (360): 60/min, 600/h and 8 in flight. The defaults sit above the 30-day peaks (38/min, 548/h). Overflow returns 429.
- qnfo-memory-mcp authentication verified live: `/health auth:true`; unauthenticated `tools/list` returns 401 on `/mcp` and `/`.
- qnfo-ai-calibration 1.2.7 AUTH-FAIL-CLOSED-1 (370): no configured key now means no access.
- qnfo-archive 1.2.1 ARCHIVE-INTERNAL-1 (375): anonymous `/handoff/search` returned memory-fact summaries from the qnfo-handoffs index, a public read path around memory-mcp's bearer, and a plain `GET /seed-kg` rewrote 809 knowledge-graph nodes per call. No worker consumed either route. Search now requires a props-authenticated internal caller (public: 403), and a public `/seed-kg` is a dry run; the 04:00 cron still seeds.
- qnfo-kaizen 0.3.3 KAIZEN-SCAN-INTERNAL-1 (377): an anonymous `POST /run/scan` on the public hostname inserted a `kaizen_reports` row on every call (live: 200). The dashboard's binding call (`https://SVC_QNFO_KAIZEN/run/scan`) stays internal; public-host callers now need the token (live after deploy: 401). Checked and found sound: paper-reviser `/run/*` and `/debug/*` are token-gated; ipatent `/api/draft` is rate-limited per IP; fleet-exec's live `/run` is not exposed.
- Capability contract (#1735): `capabilities[]` and `limitations[]` added to 12 workers (375, 377). The live snapshot after the deploys counts 13 of 44 conforming and rising as the 377 deploys land (5 before). The rest are hand edits in other sessions' lanes, tracked by EVID-C6-CONFORMANCE.
- RM-VISION-QWAV-SCAN-1 (370): radar-hub classifies arXiv hits (ultrametric, zbw, qec, energy; core/adjacent), groups the digest by class and ledgers every run. Live run 15:20Z: 20 hits, 15 candidates, 2 core, 8 queued. Whether the 08:30 cron fires is tracked by #1734 / EVID-QWAV-SCAN-CRON.
- RM-SELF-KNOWLEDGE-VIEWS-1: verified built. integration_state is fresh (42 rows in 24h); unified_open_issues is consumed; the four views are empty because nothing qualifies (18 of 18 open issues triaged).
- Portfolio registry: QWAV and QNFO.QEC.001 linked; QNFO.INM.002, QNFO.SLB.003, QWAV.GDE and QNFO.QEC.002 registered.
- Cost audit (RM-COST-FREE-FIRST-PARITY-1, partial):
  - 7-day gateway spend is $159.76. Largest lines: gpt-5.5 $67 (decaying, last call 09-26); the owner's DeepChat BYOK deepseek-flash $45 (#1684); qnfo-ops Phase A deepseek-v4-pro $44.
  - Only qnfo-ai-calibration (by design) and personal-companion (the personal-plane BYOK writer) call a provider directly.

### Coordination

The wave-4 session's PR 358 overlapped research-exec and radar-hub. Its research-exec findings were folded into PR 372 with
credit, and the overlap was noted on PR 358 and in handoff 29844. Issues owned by other sessions were left to them: #1710 to
#1716 (STRATEGY-1), #1724 to #1727 (owner directive; PRs 345 and 353), #1731 (code-task loop smoke, PR 368), #1732 (Zenodo
identity) and #1733 (PR 371).

### State at 16:05Z

- #1620 (research publish stall, 22 days) closed on evidence. Record 23086421 carries the canonical related identifier, one
  funnel link and keywords. Its D1 row converged through the new trigger, and https://papers.qnfo.org/papers/<slug>/ answers 200.
  The pipeline immediately claimed the next row (566) and grounded it with 14 bibliography entries.
- Merged from this lane in round 4: PRs 359, 360, 361, 369, 370, 372, 375, 377, 378.
- Gates re-measured: C5, C7, G2, G4, A2, A3, F2 and I7 remediated; C6 partial. Conformance rose from 5 to at least 17 of 44 and is
  tracked by #1735 / EVID-C6-CONFORMANCE.
- Self-closing contracts: EVID-QWAV-SCAN-CRON (#1734, 2026-10-02 08:30Z), EVID-GATE-A2-PUBLISHV2 (first new version),
  EVID-C6-CONFORMANCE (#1735), plus those listed in round 3.
