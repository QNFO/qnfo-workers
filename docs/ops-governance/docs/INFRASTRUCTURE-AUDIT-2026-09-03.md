# QNFO INFRASTRUCTURE AUDIT 2026-09-03 — Gaps, Weaknesses, Blind Spots

**Audit session:** self-initiated infrastructure audit (DeepChat parent session, 2026-09-03 ~09:20-09:50 UTC)
**Method:** live probes (Cloudflare API, D1 SQL, workers.dev /health, schtasks, local cron registry) — every claim carries same-turn tool-call evidence. No static claims.
**Canonical:** QNFO/qnfo-ops docs/INFRASTRUCTURE-AUDIT-2026-09-03.md
**Relationship to autonomy plan:** extends Layer 0-3 of docs/CLOUD-NATIVE-AUTONOMY-PLAN.md; never duplicates existing mechanisms.

## 1. Positive controls (verified working — not gaps)

| Control | Evidence (this session) |
|---|---|
| Cloud execution layer fires unattended | cloud_ops_events fresh through 2026-09-03 09:25Z (briefing/gmail-triage/email-triage/nlnet/research-scan/outreach-gated/qnfo-ops) |
| Local cron registry canonical | cronjob list = exactly the 5-row scheduler-guard set (6e91c844/aa67d355/c7f96688/42b1988c/2055e49c), all enabled, all <=1x/day |
| Windows backup tasks live | QNFO-AgentDB-Daily-Backup Ready (next 21:30), QNFO-DeepChat-Backup Ready (23:59), QNFO-ModelKey-Guard present |
| AI Gateway spend limit | $90/30d sliding window enabled, collect_logs on; 24h sample 20 requests / $0.09 |
| Email pipeline healthy | email_stats 447 total / 57 last-24h |
| Alert store digesting | alerts: 4 HIGH (all digested), 9 warning (digested) |
| Records fleet healthy | papers 1026, KG 8341 nodes / 8493 edges, queries 1876, intents 147 |
| qnfo-ops AI endpoint live | /health 1.2.4, capabilities incl. code + tool-execution; repo HEAD matches live |
| Outreach engine | qnfo-outreach 0.1.0 live, ACTIVATION_AT 2026-09-15, gated event row present |
| Errata workflow | qnfo-errata-orchestrator 1.0.0 live; legacy step-executors retained behind it |

## 2. Evidence table (this session's probes)

| # | Probe | Result | Finding ref |
|---|---|---|---|
| E1 | workers_list (CF API) | 58 live workers (57 at first probe, +1 concurrent deploy mid-audit) | G1 |
| E2 | FLEET-MANIFEST.md pre-audit | 57 table rows / header "56" / summary "54" — internal inconsistency + hand-patched cycle notes | G1 |
| E3 | /health probes (correct subdomain q08, browser UA) | research-daily-brief 200, qnfo-archive 200, qnfo-social 200 (no VERSION), qnfo-email 401, obsidian-writer/job-market-watch/qnfo-arxiv-radar/qnfo-system-health 404 | G2 |
| E4 | fleet-manifest-sweep.py v1 source | reads Temp fleet_rows.json; enumeration + health-probe stage NOT in script (cron prompt assumes it is) | G2 |
| E5 | OPS-SELF-DOC.md | says "48 workers", qnfo-ai 5.11.0 (live 5.20.1), qnfo-cloud-ops 1.6.0 (live 1.13.0), personal-api v1.6.1 (live v3.1.0) | G3 |
| E6 | workers_list modified_on | 6 workers untouched >15d (qnfo-archive 07-30, qnfo-ai-search 08-12, qnfo-paper-indexer 08-12, qnfo-agent-ws 08-14, qnfo-indexnow-key 08-14, qnfo-memory-mcp 08-17) | G4 |
| E7 | sweep v2.0 run (live) | 3 DRIFT rows: qnfo-infra live 1.5.1 vs repo 1.2.1; qnfo-lifecycle live 1.6.1 vs repo 1.0.0; qnfo-memory-mcp live 2.0.2 vs repo (compat-date artifact) | G5 |
| E8 | qnfo-workers repo dirs | ~29 live workers have no canonical repo dir (incl. qnfo-gateway, qnfo-email, qnfo-lifecycle, research-daily-brief, qnfo-arxiv-radar, qnfo-system-health, qnfo-kaizen) | G6 |
| E9 | cloud_ops_events | 26 qnfo-ops error rows today (fleet_status tool failures 09:19-09:23Z) — fixed by 1.2.4 CROSS-APP-1 deploy; no error-budget alerting exists | G7 |
| E10 | issue_ledger | 23 open / 26 total — no drain loop (backlog-exec covers agent_issues only) | G8 |
| E11 | agent_issues | 297 open; qnfo-backlog-exec drains MAX_ROW=40/day → >=7 days to touch all; growth vs drain unmonitored | G9 |
| E12 | living-paper D1 | 1026 rows; r2_path mirrored 608 (59%); body_md 514 (50%) | G10 |
| E13 | R2 buckets | 15 buckets incl. DEPRECATED 'qnfo' and anti-pattern 'releases' (WRONG-BUCKET-SELECTION-1) — no retirement policy | G11 |
| E14 | D1 databases | portfolio-state (legacy handoffs/pipeline_runs) + qnfo-cms (legacy content_entries/publish_queue) still live | G11 |
| E15 | schtasks | residue one-shots: dc_backup_tok2, dc_full_backup_0902b (Next Run N/A) | G12 |
| E16 | infra_status MCP | returns only first 30 of 58 worker names (truncation) | G13 |
| E17 | infra_status MCP | no Pages projects coverage (12 Web Analytics sites; audit_pages tables exist in D1) | G14 |
| E18 | local cron 42b1988c prompt vs sweep v1 | prompt: "sweep enumerates workers"; script: reads Temp JSON — stage mismatch produced NO-HEALTH false negatives | G2 |

## 3. Gap matrix (severity x layer)

### Layer 0/1 — Execution & monitoring blind spots
- **G1 (HIGH, S0): manifest counts inconsistent + hand-patched.** FIXED this session: sweep v2.0 is self-contained (enumeration + /health + derived counts, "do NOT hand-edit" header). Verified live: rows=58 OK=28 drift=3 gap=27. Closed as pattern; residual = cron prompt wording already matches.
- **G2 (HIGH, S0): /health false negatives.** Root cause: missing probe stage (E4/E18). FIXED with v2.0 (browser UA, q08 subdomain, 401→AUTH-GATED, 404→root fallback, NO-VERSION class). Verified: research-daily-brief now versioned, qnfo-social ROOT-OK-classified, qnfo-email AUTH-GATED. REMAINING: qnfo-email auth-gated health is invisible to unauthenticated probes — worker-health monitor needs the bearer OR /health must be auth-exempt (S1).
- **G3 (HIGH, S1): OPS-SELF-DOC.md master index rotted** (48 vs 58 workers, 5+ stale versions). Decision: replace its hardcoded fleet section with a pointer to the auto-generated manifest + current counts (S1, 15-min fix); long-term = generate from sweep.
- **G4 (MEDIUM, S1): no stale-worker lifecycle.** 6 workers >15d untouched; no keep/decommission decision record. Add a sweep-derived "stale" column + quarterly disposition log.
- **G5 (HIGH, S1): 3 DRIFT workers repo-vs-live.** qnfo-infra repo 1.2.1 vs live 1.5.1 (re-base per WORKER-EDIT-BASE-VERIFY-1); qnfo-lifecycle repo 1.0.0 vs live 1.6.1 (capture live to repo); qnfo-memory-mcp repo version constant missing.
- **G6 (HIGH, S1-S2): 29 workers without canonical repo source.** Recovery risk: live bundle exists only in CF. Convert incrementally (capture deployed bundle → qnfo-workers/<name>/deployed-current.worker.js + wrangler.toml), starting with auth/business-critical: qnfo-gateway, qnfo-email, qnfo-lifecycle, qnfo-arxiv-radar, research-daily-brief, qnfo-kaizen.
- **G7 (HIGH, S1): no error-budget alerting.** 26 qnfo-ops errors today were only visible by manual D1 query. Add: qnfo-auditor F-loop or cloud-ops weekly digest — "cloud_ops_events status=error count per job per day > threshold → HIGH alert" (extend existing auditor C-checks, not a new worker).
- **G13 (MEDIUM, S1): infra_status MCP caps at 30 names.** Either paginate in the tool or add a 'count-only' summary. Affects every drift audit that relies on it.
- **G14 (MEDIUM, S2): Pages layer absent from infra snapshot.** Add Pages projects to infra_status or weekly sweep.

### Layer 2/3 — Backlog & continuous improvement
- **G8 (MEDIUM, S1): issue_ledger has no drain loop** (23 open, 3 closed ever). Extend qnfo-backlog-exec to include issue_ledger rows with resolution predicates, or fold issue_ledger into agent_issues feed.
- **G9 (MEDIUM, S2): backlog capacity unmonitored.** 297 open vs 40/day drain. Add drain-rate telemetry (drained/day vs opened/day) to the weekly visibility digest.
- **G12 (LOW, S0): residue Windows one-shots** dc_backup_tok2 + dc_full_backup_0902b — delete (SILENT-ROLLOVER-1). [Executed this session - see section 5.]

### Data & residue
- **G10 (MEDIUM, S2): living-paper R2 mirror coverage 59%** (608/1026 r2_path; 514 body_md). Backfill r2_path for published records missing mirrors (R2-MIRROR-AFTER-PUBLISH-1); body_md backfill from R2/PDF where recoverable.
- **G11 (MEDIUM, S2): store retirement policy missing.** DEPRECATED 'qnfo' bucket, anti-pattern 'releases' bucket, portfolio-state + qnfo-cms D1s still live. Action: verify 'releases' empty + delete; snapshot+freeze portfolio-state and qnfo-cms (keep DB, mark read-only, document).

## 4. Sprint plan (backlog → execution)

**Sprint S0 — correctness & recoverability (this week)**
1. [DONE this session] fleet-manifest-sweep v2.0: self-contained enumeration + health probes + derived counts (G1/G2). Evidence: live run rows=58 OK=28 drift=3 gap=27; manifest header/summary consistent; 59 '| ' lines = 58 rows + header.
2. [DONE this session] Delete residue Windows one-shots (G12) — schtasks /delete, verified via schtasks /query.
3. Re-base qnfo-infra repo to live 1.5.1 (G5) — capture deployed bundle, commit, verify drift clears next sweep.
4. Capture qnfo-lifecycle live → repo (G5).
5. OPS-SELF-DOC fleet section → pointer to manifest + current counts (G3).

**Sprint S1 — monitoring & alerting (next week)**
6. Error-budget alert: cloud_ops_events per-job error threshold in qnfo-auditor (G7).
7. worker-health + sweep: auth-gated /health handling decision for qnfo-email (G2 residual).
8. Stale-worker lifecycle column + disposition log (G4).
9. issue_ledger drain loop (G8).
10. infra_status MCP: worker-name pagination/count fix (G13).

**Sprint S2 — data hygiene & coverage (week 3-4)**
11. living-paper r2_path backfill (G10).
12. Store retirement: 'releases'/'qnfo' buckets + portfolio-state/qnfo-cms freeze (G11).
13. Backlog drain-rate telemetry (G9).
14. Pages snapshot coverage (G14).
15. Incremental repo capture for unrepo'd workers, priority: qnfo-gateway, qnfo-email (G6).

**Sprint S3 — ongoing hardening (continuous)**
16. Recovery drill: restore one worker from R2 git-repos + wrangler deploy to prove recoverability.
17. Sweep v2.0 → add 'stale' + 'modified' delta columns and DRIFT auto-repair (repo-newer-only, already specced in cron prompt).
18. Post-deploy manifest sync hook: after any session deploys a worker, re-run sweep (fixes same-day staleness).

## 5. Immediate executions this session (NO-DEFERRED-ZERO-1)

1. fleet-manifest-sweep.py v2.0 authored, live-tested, manifest regenerated (evidence above).
2. Residue one-shots deleted (G12).
3. New backlog items inserted into agent_issues (see ids in section 6).
4. Audit doc committed + pushed to QNFO/qnfo-ops.

## 6. Backlog items inserted into agent_issues (extending, never duplicating)

See agent_issues ids added this session: 390-405, n=16 (query by source='infra-audit-2026-09-03'). [Corrected by red-team pass: MIN(id)=390, MAX(id)=405.]

## 7. Claim sheet (FRAMEWORK-DOGFOOD-1)

| claim | evidence | confidence | status |
|---|---|---|---|
| Manifest generation is now deterministic + self-contained | sweep v2.0 live run rows=58 OK=28 drift=3 gap=27; header/summary == rows | high | verified |
| NO-HEALTH false negatives were a probe-stage gap, not real gaps | E3: 200/401 on workers marked NO-HEALTH; v2.0 reclassified | high | verified |
| 3 repo-vs-live DRIFT rows remain after v2.0 | E7 + post-run grep | high | verified |
| Backlog capacity risk is real | agent_issues 297 open vs 40/day drain | high | verified |
| Fleet is actively churning (concurrent sessions) | live count 57→58 mid-audit; qnfo-ai 5.16.9→5.20.1 in <1h | high | verified |

## 8. Red-team pass 2026-09-03 (adversarial re-audit of this document)

Verdict: PASS-WITH-NOTES. Notes remediated this turn; new backlog items G15-G18 inserted (source 'infra-audit-2026-09-03-rt').

| # | Finding | Sev | Evidence | Disposition |
|---|---|---|---|---|
| F1 | Device schtasks inventory incomplete: 7 QNFO_ underscore tasks (6 active, 1 disabled) undocumented; closeout claim "only the 3 canonical QNFO tasks remain" false (enumeration grepped "QNFO-" only) | HARD | schtasks /query: QNFO_Chat_Log_Push, QNFO_DB_Maintenance_Daily(disabled), QNFO_DeepChat_Backup_Daily, QNFO_DeepChat_Reload, QNFO_FS_Maintenance_Daily, QNFO_Skill_Pull_Daily, QNFO_Tape_Prune_Daily | Inventory added to CLOUD-NATIVE-AUTONOMY-PLAN device section; disabled residue QNFO_DB_Maintenance_Daily deleted (verified); standing check = G17 |
| F2 | Durable Objects invisible to governance: 2 namespaces (qnfo-agent-orchestrator_AgentTask, qnfo-agent-ws_QnfoAgent) absent from manifest/plan/OPS-SELF-DOC/infra_status MCP | HARD | CF API GET /workers/durable_objects/namespaces | G15 |
| F3 | §6 id pointer "381+" wrong; actual range 390-405 | SOFT | SELECT MIN(id),MAX(id) WHERE source='infra-audit-2026-09-03' -> 390,405 n=16 | Fixed in this doc |
| F4 | "resolution predicates" overclaim: backlog-exec auto-closes ONLY health-availability rows (workerTarget+isHealthAvailability+probeHealth); 15/16 new rows are recheck-only. Exception: G2r carries a working escalation predicate (daily warning alert until qnfo-email /health un-gated) | SOFT | qnfo-backlog-exec worker.js run() source | G16 (predicate-type extension) |
| F5 | G10 body_md backfill conflicts directionally with existing #369 (body_md blobs -> R2, slim D1) | SOFT | agent_issues id 369 title/description | G10 scoped to r2_path only; #369 remains body_md authority |
| F6 | FLEET-MANIFEST (framework record) locked counts lack claim-sheet fields (FRAMEWORK-DOGFOOD-1) | DESIGN | manifest has no claim/evidence/confidence/status block | G18 (sweep v2.1 claims footer) |
| F7 | S3a overlaps existing #383 (self-audit-2026-09-03, "fleet drift instant: manifest stale after every deploy") - largely resolved by the v2.0 generator shipped this session | SOFT | agent_issues id 383 | 383 description annotated with v2.0 evidence pointer; S3a remains as the residual same-day-staleness hook |

Positive controls re-verified this pass: HEAD ccdb324 clean + working tree == committed (committed sweep contains lstrip v-prefix fix line 138 + self-locating _here lines 17-18); manifest 58/28/3/27 internally consistent; all 3 DRIFT rows re-probed live (infra 1.5.1 / lifecycle 1.6.1-memory-maintain-fixed / memory-mcp 2.0.2); living-paper 1026/608 + issue_ledger 23 unchanged; deployment_history resolves (16 rows); queues verified absent (CF API []); zones 12 == analytics sites; cloud-ops 16 schedules enumerated incl. 30 5 * * 1 visibility + 15 5 * * 1 engagement; open-backlog math consistent (297-5 closed+16 = 308).

Red-team method corrections (recorded for future passes): grep "\\|" BRE alternation silently matched nothing in this shell - re-probe with -F/-E before concluding absence; SQL "source != X" excludes NULL-source rows - always add "source IS NULL OR" branch.
