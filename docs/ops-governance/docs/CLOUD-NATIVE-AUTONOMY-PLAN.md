# Cloud-Native Autonomous Operations Plan — Entire Ecosystem

**Status:** active (P0) · **Authority:** 100%-cloud-native user directive (2026-09-02) + NO-DEFERRED-ZERO-1
· **Last updated:** 2026-09-02 · Canonical repo: QNFO/qnfo-ops

Design goal: continuous execution, auditing/monitoring, continuous improvement (kaizen), and
upgrades/optimizations run AUTOMATICALLY across the fleet with zero manual user intervention.
Cloudflare is canonical; local Windows state is an ephemeral, device-bound mirror only.

## Layer 0 — Continuous execution (unattended, scheduled)

| Mechanism | Schedule (UTC) | What it runs |
|---|---|---|
| qnfo-cloud-ops v1.8.1 (cloud scheduler) | see crons | email-triage/gmail-triage/briefing/research-scan/outreach/weekly/weekly-ops/portfolio-sync/zenodo-stats/board-sync/release-check/nlnet/worker-health/sitemap-ping/loose-threads-sweep |
| errata subprocess (qnfo-errata-watch/respond/publish) | :00 / :15 / :30 hourly | inbound-email triage -> errata_queue -> errata_actions -> automated new-version publish |
| qnfo-arxiv-radar | 30 8 * * * | arxiv new-paper radar |
| qnfo-citation-watch | 0 11 1,15 * * | citation change watch |
| qnfo-research-radar | 0 6 1 * * + 0 8 * * 7 | research/monthly radar |
| qnfo-twin-maintain | 0 4 * * * | twin maintenance |
| qnfo-skill-sync | 0 3 * * * | skills repo -> R2 mirror |
| qnfo-lifecycle | hourly + monthly | lifecycle ops |
| qnfo-blank-audit | 40 4 * * * (verified) | blank/fallback gateway audit |
| edge idea intake | event | ChatBox/Android -> qnfo-ai -> glm intent classifier -> orchestrator |

### Publish pipeline invariants

- **SLUG-CAP-80-1:** living-paper `papers.slug` is capped at 80 chars BY DESIGN
  (qnfo-research-exec slugify: lowercase, non-alphanumeric -> `-`, trim, `slice(0,80)`).
  Truncation is silent in the pipeline but consistent across D1 `papers.slug`, gateway
  routes, R2 mirror keys and Vectorize ids, so there is no functional break. Lengthening
  slugs requires Vectorize re-id per SLUG-RENAME-VECTORIZE-ORPHAN-1 — keep the cap unless
  that migration is planned. (Documented 2026-09-07; register row 52.)

## Layer 1 — Auditing / monitoring

| Mechanism | Cadence | Scope |
|---|---|---|
| worker-health (in qnfo-cloud-ops) | 2x/day 12h apart (03:05/15:05) | fleet endpoint + /health checks; digest on failure |
| loose-threads-sweep | Mon 05:00 | unfinished WBS states / open handoffs / open tasks >7d; digest cap 40 |
| Fleet Drift & Self-Improvement Audit (42b1988c, device) | Mon 06:00 | regenerates FLEET-MANIFEST.md, flags self-doc drift, repairs via wrangler |
| scheduler-guard.py (device) | every ops cycle | local cron registry == canonical set, <=1x/day, no residue |
| disk-guard.py (device) | daily 07:30 | C: free-space WARN/CRIT out-of-band alert |
| qnfo-system-health | 0 5 * * * | blank-response analytics |
| QNFO Data Freshness Sync (aa67d355, device) | daily 05:12 | Outlook COM calendar + received email -> orchestrator/Vectorize |
| infra_status / infra_records / infra_analytics MCP | on-demand | Cloudflare API snapshot (workers/D1/Vectorize/R2/KV/AI Gateway) |
| cost control | continuous | AI Gateway spend_limit; $90/30d budget audit (neurons) |
| Fleet Audit & Act loop (qnfo-auditor v1.1.0) | 2x/day + Mon deep (01:45/13:45 UTC; Mon 06:45) | reviews/audits/acts on ALL event/log stores (issue_ledger, cloud_ops_events, alerts, agent_issues, audit_trail, deployment_history, errata); checks C1-C10 + feedback subloops F1-F4 (subloop supervision heartbeats, improvement-effectiveness verification, self-trend recurring-finding candidates, remediation watchdog live re-probe); digest on new HIGH; runbook AUDT/FLEET-AUDIT-AND-ACT-PROCEDURE.md |

## Layer 2 — Continuous improvement (kaizen)

| Mechanism | Cadence | Notes |
|---|---|---|
| qnfo-kaizen worker | 0 2 * * * + 0 10 * * 1 | scheduled kaizen processing |
| CMD SKILLS UPDATE cycles (in-app) | session | dual-write + 7-store parity + prompt-store-verify exit 0 |
| fleet-manifest-sweep + prompt-store-verify + dr_validate_schema | inside backup/drift | gates before every closeout |
| loose-threads-sweep feed | weekly | surfaces loose threads for next ops cycle disposition |

## Layer 3 — Upgrades / optimization

| Mechanism | Cadence | Notes |
|---|---|---|
| release-check | 04:15 daily | DeepChat stable release alert (DEEPCHAT-RELEASE-TRACK-1) |
| Fleet drift repair | weekly | redeploy canonical bundle where repo != live |
| portfolio-sync / board-sync | Mon/Sat | GitHub mirror self-heal (direct-main, no PR churn) |
| sitemap-ping | monthly 1st | sitemap health ping |
| MODEL-KEY / param alignment | session | DEEPCHAT-DEFAULT-MODEL-1 + MODEL-PARAM-STORE-ALIGN-1 guards (app-device writes need app) |

## Device-bound residue (sanctioned; NOT cloud-able)

DeepChat local cron canonical set (scheduler-guard PASS): 42b1988c (fleet drift, repo+wrangler),
aa67d355 (Outlook COM freshness), c7f96688 (MCP token refresh), 2055e49c (one-shot 2026-11-06),
6e91c844 (disk guard). Windows Tasks (run WITHOUT DeepChat open): QNFO-AgentDB-Daily-Backup
(daily 21:30; agent.db + config -> R2 qnfo-backups; wrapper embeds CLOUDFLARE_API_TOKEN copy - see
SECRETS-INVENTORY rotation note) and QNFO-ModelKey-Guard (daily 07:00; model_guard.py aligns
preferredModel/defaultModel across agent.db app_settings + app-settings.json to deepseek-v4-flash,
read-back verified; recurrence-zero remedy for MODEL-KEY-FILE-DRIFT-1, fixed a live v4-pro drift
2026-09-02, commit 5374149).

Additional QNFO_ device tasks (inventoried 2026-09-03 red-team pass - previously undocumented):
QNFO_Chat_Log_Push (daily 05:25, log_chat_task.vbs), QNFO_DeepChat_Backup_Daily (daily 09:30,
DeepChatData\repo\scripts\backup_deepchat.py), QNFO_DeepChat_Reload (minute watchdog,
deepchat_relaunch_watchdog.vbs), QNFO_FS_Maintenance_Daily (daily 09:40, fs_audit_cleanup.py --clean),
QNFO_Skill_Pull_Daily (daily 06:30, skill_pull_task.vbs), QNFO_Tape_Prune_Daily (daily 05:35,
prune_tape_task.vbs). QNFO_DB_Maintenance_Daily (disabled since 2026-08-25) deleted 2026-09-03.
Standing inventory = INFRA-AUDIT-G17; backup-task overlap review (DeepChat_Backup_Daily 09:30 vs
QNFO-DeepChat-Backup 23:59) pending.

## Residual manual / user-side (owned, triggered, never silent) - resolved 2026-09-02

| Item | Resolution | Evidence |
|---|---|---|
| GitHub org runners billing | MOOT - sole workflow deploy-worker.yml deleted (4ce2f21); 0 workflows remain, no runner needed | qnfo-workers .github/workflows empty |
| workers.dev routing 10405 | NOT NEEDED - obsidian-writer consumed only via service bindings (conference-radar/events-radar/personal-events-radar wrangler.toml); per-worker subdomain disabled is correct posture | subdomain API enabled:false + binding consumers |
| personal .ics custom domain | SERVED - hourly R2 publish + public r2.dev bearer URLs verified 200 text/calendar; custom domain = optional enhancement (needs combined R2+Zone token) | calendar-api /health ics_publish + HTTP 200 probe |
| email-key rotation coordination | VERIFIED WORKING - email_stats 197 sent/71 24h; briefing ok 06:30; outreach cap-guard acting as designed; errata auto-publish live | D1 job-run log + email_stats |
| DeepChat app installs | device by design; release-check alerts (DEEPCHAT-RELEASE-TRACK-1) | release-check cron 15 4 * * * |

Additionally closed same pass: worker-health .internal checks were broken by binding-stripping API
PUTs - QNFO_AI + PERSONAL_API service bindings restored + keep_bindings guard added to deploy
metadata (2fd4bef; active deployment a215d711 has 21 bindings). All items surfaced by
loose-threads-sweep / worker-health / weekly drift until closed; none rests with only an owner label.

## Fleet self-doc status (2026-09-02 manifest, 52 workers)

~25 workers are GAP (no canonical repo dir or NO-HEALTH) - tracked by the weekly Fleet Drift audit
(42b1988c) for incremental conversion; the fleet-manifest-sweep re-generates FLEET-MANIFEST.md each
week. qnfo-cloud-ops mirror in qnfo-workers synced to v1.8.1 (b7e2065) so the next regeneration shows
repo==live. Concurrent-session dirt (qnfo-ai/worker.js, qnfo-pdf/) left untouched per GIT-OWNERSHIP-1.

## Claims & Evidence (FRAMEWORK-DOGFOOD-1)

| claim | evidence | confidence | status |
|---|---|---|---|
| Cloud execution layer fires unattended | D1 cloud_ops_events: 10 job/status groups across 7 jobs in 48h (briefing/email-triage/gmail-triage/outreach/release-check/research-scan/worker-health) (2026-09-02 probe) | high | verified |
| Worker cron map live | CF schedules API: errata :00/:15/:30, arxiv-radar 30 8, citation-watch 0 11 1,15, kaizen 0 2+0 10 Mon, twin-maintain 0 4, skill-sync 0 3, system-health 0 5, research-radar monthly+Sun, lifecycle hourly (2026-09-02 probe) | high | verified |
| Fleet self-doc + drift audit automatic | FLEET-MANIFEST.md auto-generated 2026-09-02 06:17Z; weekly cron 42b1988c | high | verified |
| Loose threads under standing audit | loose-threads-sweep cron 0 5 * * 1 on qnfo-cloud-ops v1.8.1 (/health 2026-09-02) | high | verified |
| Backup automatic without app open | schtasks QNFO-AgentDB-Daily-Backup Ready, next 21:30 2026-09-02 | high | verified |
| Model-key drift guarded permanently | QNFO-ModelKey-Guard task (daily 07:00) + model_guard.py fixed live v4-pro re-drift 2026-09-02, read-back flash==flash | high | verified |
| Worker-health .internal checks healthy | active deployment a215d711 21 bindings incl QNFO_AI->qnfo-ai + PERSONAL_API->personal-api; /health 1.8.1 16 jobs | high | verified |
| GitHub-runner dependency eliminated | workflows=0 (deploy-worker.yml removed 4ce2f21); runner billing residue moot | high | verified |
| Cost control active | infra_status AI Gateway spend_limit + gateway_logs cost_usd present | high | verified |
| Residual manual items owned + triggered | loose-threads-sweep weekly digest + worker-health + drift audit (2026-09-02 doc) | medium | tracked |
