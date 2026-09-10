// qnfo-fleet-dashboard registry - regenerated 2026-09-10 from live CF scripts list (fleet remediation cycle)
// Schedules: CF Workers API; purposes curated; device-bound: schtasks live capture
export const REGISTRY = {
 "version": 3,
 "captured_at": "2026-09-10T08:07:26Z",
 "note": "Regenerated 2026-09-10 (fleet remediation): dropped deleted workers, added fleet-executor/fleet-scheduler probes, live-list fallback probes v1.0.13",
 "scheduled": [
  {
   "name": "calendar-api",
   "crons": [
    "17 * * * *"
   ],
   "purpose": "Calendar/email intent sync",
   "group": "intent-email",
   "modified_on": "2026-09-03T04:46:55.755286Z"
  },
  {
   "name": "events-radar",
   "crons": [
    "0 5 * * 1"
   ],
   "purpose": "Weekly research events radar",
   "group": "engagement",
   "modified_on": "2026-09-02T11:14:48.653431Z"
  },
  {
   "name": "jnl-referee",
   "crons": [
    "23 */2 * * *"
   ],
   "purpose": "Journal referee queue (intake/submissions)",
   "group": "research-publish",
   "modified_on": "2026-09-08T12:32:53.94401Z"
  },
  {
   "name": "jnl-watch",
   "crons": [
    "*/10 * * * *"
   ],
   "purpose": "Journal listings watch",
   "group": "research-publish",
   "modified_on": "2026-09-08T09:33:10.93916Z"
  },
  {
   "name": "job-market-watch",
   "crons": [
    "0 7 * * 2"
   ],
   "purpose": "Academic job market radar",
   "group": "engagement",
   "modified_on": "2026-09-08T09:33:48.774356Z"
  },
  {
   "name": "osf-integrity-check",
   "crons": [
    "0 9 1 * *"
   ],
   "purpose": "OSF integrity sweep",
   "group": "research-publish",
   "modified_on": "2026-09-01T11:56:24.297281Z"
  },
  {
   "name": "personal-api",
   "crons": [
    "5 5 * * *"
   ],
   "purpose": "Personal twin daily maintenance",
   "group": "personal",
   "modified_on": "2026-09-08T15:21:42.726887Z"
  },
  {
   "name": "personal-events-radar",
   "crons": [
    "30 5 * * 2"
   ],
   "purpose": "Personal events radar",
   "group": "personal",
   "modified_on": "2026-09-03T04:46:37.651045Z"
  },
  {
   "name": "personal-life-indexer",
   "crons": [
    "0 */12 * * *"
   ],
   "purpose": "Personal life index refresh",
   "group": "personal",
   "modified_on": "2026-08-20T17:19:11.088746Z"
  },
  {
   "name": "personal-life-maintain",
   "crons": [
    "0 2 * * *"
   ],
   "purpose": "Personal knowledge maintenance",
   "group": "personal",
   "modified_on": "2026-09-01T07:27:59.931823Z"
  },
  {
   "name": "qnfo-ai-calibration",
   "crons": [
    "*/30 * * * *"
   ],
   "purpose": "AI model calibration probes",
   "group": "fleet-ai",
   "modified_on": "2026-09-08T10:24:30.073334Z"
  },
  {
   "name": "qnfo-analytics",
   "crons": [
    "15 6 * * *"
   ],
   "purpose": "Fleet analytics daily snapshot",
   "group": "fleet-ops",
   "modified_on": "2026-09-05T20:19:58.04525Z"
  },
  {
   "name": "qnfo-archive",
   "crons": [
    "0 4 * * *"
   ],
   "purpose": "Archive sweep",
   "group": "fleet-ops",
   "modified_on": "2026-07-30T12:05:58.320447Z"
  },
  {
   "name": "qnfo-arxiv-radar",
   "crons": [
    "30 8 * * *"
   ],
   "purpose": "arXiv radar daily",
   "group": "research-publish",
   "modified_on": "2026-09-01T18:02:45.962281Z"
  },
  {
   "name": "qnfo-auditor",
   "crons": [
    "45 1,13 * * *",
    "45 6 * * 1"
   ],
   "purpose": "Fleet auditor (2x daily + weekly)",
   "group": "fleet-ops",
   "modified_on": "2026-09-04T02:07:58.107269Z"
  },
  {
   "name": "qnfo-backlog-exec",
   "crons": [
    "10 1 * * *"
   ],
   "purpose": "Deferred backlog executor",
   "group": "fleet-ops",
   "modified_on": "2026-09-08T09:58:13.652469Z"
  },
  {
   "name": "qnfo-blank-audit",
   "crons": [
    "40 4 * * *"
   ],
   "purpose": "Blank/empty audit sweep",
   "group": "fleet-ops",
   "modified_on": "2026-09-02T20:34:47.549905Z"
  },
  {
   "name": "qnfo-chat-canary",
   "crons": [
    "15 */3 * * *",
    "30 6 * * *"
   ],
   "purpose": "Chat canary probes",
   "group": "fleet-ai",
   "modified_on": "2026-09-03T04:57:33.036401Z"
  },
  {
   "name": "qnfo-citation-watch",
   "crons": [
    "0 11 1,15 * *"
   ],
   "purpose": "Citation watch (2x monthly)",
   "group": "engagement",
   "modified_on": "2026-09-03T05:51:42.890352Z"
  },
  {
   "name": "qnfo-cloud-ops",
   "crons": [
    "0 15 * * 5",
    "0 4 1 * *",
    "0 4 * * 7",
    "0 5 * * 1",
    "0 6 * * 1",
    "0 6,12 * * 1-5",
    "0 6 * * 6",
    "0 7,13 * * 1-5",
    "0 7 * * 7",
    "0 8 * * 1-5",
    "0 9 * * 1-5",
    "0 9 3 9 *",
    "10 3 * * *",
    "15 4 * * *",
    "15 5 * * 1",
    "20 4 * * *",
    "30 3 * * 1",
    "30 5 * * 1",
    "30 6 * * 1-5",
    "30 7 * * 1-5",
    "5 3,15 * * *"
   ],
   "purpose": "Cloud ops weekly digests + lifecycle",
   "group": "fleet-ops",
   "modified_on": "2026-09-09T13:53:56.176994Z"
  },
  {
   "name": "qnfo-ddocs-indexer",
   "crons": [
    "37 */2 * * *"
   ],
   "purpose": "Deep-docs indexer",
   "group": "research-publish",
   "modified_on": "2026-09-04T09:55:53.595087Z"
  },
  {
   "name": "qnfo-email-orchestrator",
   "crons": [
    "0 */3 * * *"
   ],
   "purpose": "Email intent orchestration",
   "group": "intent-email",
   "modified_on": "2026-09-08T12:32:37.440974Z"
  },
  {
   "name": "qnfo-errata-publish",
   "crons": [
    "30 * * * *"
   ],
   "purpose": "Errata autopublish",
   "group": "research-publish",
   "modified_on": "2026-09-04T14:40:11.345189Z"
  },
  {
   "name": "qnfo-errata-respond",
   "crons": [
    "15 * * * *"
   ],
   "purpose": "Errata response",
   "group": "research-publish",
   "modified_on": "2026-09-08T12:28:19.796173Z"
  },
  {
   "name": "qnfo-errata-watch",
   "crons": [
    "0 * * * *"
   ],
   "purpose": "Errata watch",
   "group": "research-publish",
   "modified_on": "2026-09-08T12:27:54.638827Z"
  },
  {
   "name": "qnfo-error-selfheal",
   "crons": [
    "17 * * * *"
   ],
   "purpose": "Error self-heal loop",
   "group": "fleet-ops",
   "modified_on": "2026-09-06T20:50:21.971742Z"
  },
  {
   "name": "qnfo-events",
   "crons": [
    "15 */6 * * *"
   ],
   "purpose": "Events processing",
   "group": "engagement",
   "modified_on": "2026-09-04T02:04:15.974811Z"
  },
  {
   "name": "qnfo-fleet-advisor",
   "crons": [
    "*/20 * * * *"
   ],
   "purpose": "",
   "group": "fleet-ops",
   "modified_on": "2026-09-09T19:39:55.631442Z"
  },
  {
   "name": "qnfo-fleet-calibrator",
   "crons": [
    "0 3 * * *",
    "0 4 1 * *",
    "30 3 * * 1"
   ],
   "purpose": "Fleet calibration",
   "group": "fleet-ops",
   "modified_on": "2026-09-04T05:10:58.967275Z"
  },
  {
   "name": "qnfo-fleet-dashboard",
   "crons": [
    "*/15 * * * *"
   ],
   "purpose": "",
   "group": "fleet-ops",
   "modified_on": "2026-09-09T08:46:19.690839Z"
  },
  {
   "name": "qnfo-fleet-deploy",
   "crons": [
    "0 * * * *"
   ],
   "purpose": "",
   "group": "fleet-ops",
   "modified_on": "2026-09-09T19:46:37.469575Z"
  },
  {
   "name": "qnfo-idea-miner",
   "crons": [
    "0 * * * *"
   ],
   "purpose": "Idea mining",
   "group": "engagement",
   "modified_on": "2026-09-08T13:56:50.208807Z"
  },
  {
   "name": "qnfo-idea-triage",
   "crons": [
    "0 * * * *",
    "*/10 * * * *"
   ],
   "purpose": "Idea triage",
   "group": "engagement",
   "modified_on": "2026-09-06T21:00:11.897514Z"
  },
  {
   "name": "qnfo-impact",
   "crons": [
    "0 4 * * *"
   ],
   "purpose": "Impact metrics",
   "group": "engagement",
   "modified_on": "2026-09-01T09:56:57.809672Z"
  },
  {
   "name": "qnfo-infra",
   "crons": [
    "0 18 * * *",
    "30 6 * * *"
   ],
   "purpose": "Infra state snapshots",
   "group": "fleet-ops",
   "modified_on": "2026-09-05T20:44:04.55895Z"
  },
  {
   "name": "qnfo-intent-orchestrator",
   "crons": [
    "0 6 * * *",
    "30 6 * * *"
   ],
   "purpose": "Intent digest/routing",
   "group": "intent-email",
   "modified_on": "2026-09-05T20:47:40.888348Z"
  },
  {
   "name": "qnfo-kaizen",
   "crons": [
    "0 10 * * 1",
    "0 2 * * *"
   ],
   "purpose": "Kaizen watchtower + meta loop",
   "group": "fleet-ops",
   "modified_on": "2026-09-08T13:56:25.25014Z"
  },
  {
   "name": "qnfo-lifecycle",
   "crons": [
    "0 * * * *",
    "0 0 1 * *",
    "0 3 * * *",
    "0 4 * * *",
    "0 5 * * *",
    "0 6 * * *",
    "0 7 * * *",
    "0 8 * * 1",
    "*/30 * * * *"
   ],
   "purpose": "Lifecycle scheduled ops",
   "group": "fleet-ops",
   "modified_on": "2026-09-01T07:12:40.986974Z"
  },
  {
   "name": "qnfo-ops",
   "crons": [
    "*/30 * * * *"
   ],
   "purpose": "Ops AI gateway health loop",
   "group": "fleet-ai",
   "modified_on": "2026-09-09T15:45:22.800385Z"
  },
  {
   "name": "qnfo-outreach",
   "crons": [
    "0 11 * * 1-5"
   ],
   "purpose": "Outreach campaign engine",
   "group": "engagement",
   "modified_on": "2026-09-02T22:32:56.771754Z"
  },
  {
   "name": "qnfo-paper-explainer",
   "crons": [
    "0 14 * * *"
   ],
   "purpose": "",
   "group": "fleet-ops",
   "modified_on": "2026-09-09T09:18:46.234969Z"
  },
  {
   "name": "qnfo-paper-indexer",
   "crons": [
    "0 6 * * *"
   ],
   "purpose": "Paper indexer",
   "group": "research-publish",
   "modified_on": "2026-08-12T13:07:52.596336Z"
  },
  {
   "name": "qnfo-paper-reviser",
   "crons": [
    "37 */4 * * *"
   ],
   "purpose": "Publication reviser loop",
   "group": "research-publish",
   "modified_on": "2026-09-09T07:53:16.479808Z"
  },
  {
   "name": "qnfo-pipeline-ops",
   "crons": [
    "*/15 * * * *"
   ],
   "purpose": "Pipeline ops watchdog",
   "group": "fleet-ops",
   "modified_on": "2026-09-08T09:30:57.480789Z"
  },
  {
   "name": "qnfo-register-guard",
   "crons": [
    "30 4 * * *"
   ],
   "purpose": "task_dod_register honesty guard",
   "group": "fleet-ops",
   "modified_on": "2026-09-09T14:42:35.985201Z"
  },
  {
   "name": "qnfo-research-exec",
   "crons": [
    "*/10 * * * *"
   ],
   "purpose": "Research version_queue drain",
   "group": "research-publish",
   "modified_on": "2026-09-09T07:59:38.174179Z"
  },
  {
   "name": "qnfo-research-radar",
   "crons": [
    "0 6 1 * *",
    "0 8 * * 7",
    "0 9 * * 7"
   ],
   "purpose": "Research radar",
   "group": "research-publish",
   "modified_on": "2026-09-01T17:45:42.480341Z"
  },
  {
   "name": "qnfo-skill-sync",
   "crons": [
    "0 3 * * *"
   ],
   "purpose": "Skill sync",
   "group": "fleet-ops",
   "modified_on": "2026-09-03T13:39:39.932797Z"
  },
  {
   "name": "qnfo-social",
   "crons": [
    "0 6 * * *",
    "30 14 * * *"
   ],
   "purpose": "Social amplifier queue",
   "group": "engagement",
   "modified_on": "2026-09-08T15:10:11.229635Z"
  },
  {
   "name": "qnfo-twin-maintain",
   "crons": [
    "0 4 * * *"
   ],
   "purpose": "Personal twin maintain",
   "group": "personal",
   "modified_on": "2026-09-01T07:50:03.966557Z"
  },
  {
   "name": "research-daily-brief",
   "crons": [
    "0 6 * * *"
   ],
   "purpose": "Daily research brief send",
   "group": "research-publish",
   "modified_on": "2026-09-02T08:32:20.47738Z"
  },
  {
   "name": "fleet-scheduler",
   "crons": [
    "* * * * *"
   ],
   "purpose": "Dynamic cron dispatcher (D1 fleet_crons)",
   "group": "fleet",
   "modified_on": "2026-09-10T07:00:00.000000Z",
   "no_run_exempt": true,
   "note": "cron-only worker; activity ledger = qnfo-audit.fleet_runs (adaptive GraphQL sampling undercounts)"
  }
 ],
 "windows_tasks": [
  {
   "name": "QNFO-ModelKey-Guard",
   "status": "Ready",
   "last": "9/7/2026 7:25:01 PM",
   "lastres": "0",
   "next": "9/7/2026 7:55:00 PM",
   "schedule": "Minute (every 30)"
  },
  {
   "name": "QNFO-DeepChat-Backup",
   "status": "Ready",
   "last": "9/7/2026 9:19:54 AM",
   "lastres": "-2147020576",
   "next": "9/8/2026 6:45:00 AM",
   "schedule": "Daily"
  },
  {
   "name": "QNFO-AgentDB-Daily-Backup",
   "status": "Ready",
   "last": "9/6/2026 9:30:01 PM",
   "lastres": "0",
   "next": "9/7/2026 9:30:00 PM",
   "schedule": "Daily"
  },
  {
   "name": "QNFO_DeepChat_Backup_Daily",
   "status": "Ready",
   "last": "9/7/2026 3:54:46 PM",
   "lastres": "-2147020576",
   "next": "9/8/2026 9:30:00 AM",
   "schedule": "Daily"
  },
  {
   "name": "QNFO_Snapshot_Purge",
   "status": "Ready",
   "last": "9/7/2026 4:34:52 AM",
   "lastres": "-2147020576",
   "next": "9/8/2026 3:00:00 AM",
   "schedule": "Daily"
  },
  {
   "name": "QNFO_Skill_Pull_Daily",
   "status": "Ready",
   "last": "9/7/2026 9:19:54 AM",
   "lastres": "-2147020576",
   "next": "9/8/2026 6:30:00 AM",
   "schedule": "Daily"
  },
  {
   "name": "QNFO_Chat_Log_Push",
   "status": "Ready",
   "last": "9/7/2026 9:19:54 AM",
   "lastres": "-2147020576",
   "next": "9/8/2026 5:25:00 AM",
   "schedule": "Daily"
  },
  {
   "name": "QNFO_Tape_Prune_Daily",
   "status": "Ready",
   "last": "9/7/2026 9:19:54 AM",
   "lastres": "-2147020576",
   "next": "9/8/2026 5:35:00 AM",
   "schedule": "Daily"
  },
  {
   "name": "QNFO_FS_Maintenance_Daily",
   "status": "Ready",
   "last": "9/7/2026 3:54:46 PM",
   "lastres": "1",
   "next": "9/8/2026 9:40:00 AM",
   "schedule": "Daily"
  },
  {
   "name": "QNFO_DeepChat_Reload",
   "status": "Ready",
   "last": "9/7/2026 7:36:01 PM",
   "lastres": "0",
   "next": "9/7/2026 7:46:00 PM",
   "schedule": "Minute (every 10)"
  },
  {
   "name": "QNFO_Obsidian_Sync",
   "status": "Ready",
   "last": "9/7/2026 7:38:01 PM",
   "lastres": "3",
   "next": "9/7/2026 7:53:00 PM",
   "schedule": "Minute (every 15)"
  },
  {
   "name": "QNFO_Obsidian_Cloud_Bridge",
   "status": "Disabled",
   "last": "11/30/1999",
   "lastres": "267011",
   "next": "N/A",
   "schedule": "Daily"
  }
 ],
 "local_crons": [
  {
   "id": "aa67d355",
   "name": "QNFO Data Freshness Sync (calendar/email to orchestrator)",
   "cron": "12 5 * * *",
   "note": "canonical row 1"
  },
  {
   "id": "42b1988c",
   "name": "Fleet Drift and Self-Improvement Audit",
   "cron": "30 5 * * 1",
   "note": "canonical row 2"
  },
  {
   "id": "c7f96688",
   "name": "Local config/credential guard",
   "cron": "device-triggered",
   "note": "canonical row 3"
  },
  {
   "id": "2055e49c",
   "name": "Device-bound maintenance one-shot",
   "cron": "one-shot",
   "note": "canonical row 4"
  },
  {
   "id": "6e91c844",
   "name": "Front-end local cron mirror guard",
   "cron": "device-triggered",
   "note": "canonical row 5"
  }
 ],
 "health_probes": [
  {
   "name": "calendar-api",
   "url": "https://calendar-api.q08.workers.dev/health"
  },
  {
   "name": "events-radar",
   "url": "https://events-radar.q08.workers.dev/health"
  },
  {
   "name": "jnl-referee",
   "url": "https://jnl-referee.q08.workers.dev/health"
  },
  {
   "name": "jnl-reviser",
   "url": "https://jnl-reviser.q08.workers.dev/health"
  },
  {
   "name": "jnl-watch",
   "url": "https://jnl-watch.q08.workers.dev/health"
  },
  {
   "name": "jnl-zenodo",
   "url": "https://jnl-zenodo.q08.workers.dev/health"
  },
  {
   "name": "job-market-watch",
   "url": "https://job-market-watch.q08.workers.dev/health"
  },
  {
   "name": "obsidian-writer",
   "url": "https://obsidian-writer.q08.workers.dev/health"
  },
  {
   "name": "osf-integrity-check",
   "url": "https://osf-integrity-check.q08.workers.dev/health"
  },
  {
   "name": "personal-api",
   "url": "https://personal-api.q08.workers.dev/health"
  },
  {
   "name": "personal-events-radar",
   "url": "https://personal-events-radar.q08.workers.dev/health"
  },
  {
   "name": "personal-life-indexer",
   "url": "https://personal-life-indexer.q08.workers.dev/health"
  },
  {
   "name": "personal-life-maintain",
   "url": "https://personal-life-maintain.q08.workers.dev/health"
  },
  {
   "name": "personal-life-search",
   "url": "https://personal-life-search.q08.workers.dev/health"
  },
  {
   "name": "qnfo-agent-orchestrator",
   "url": "https://qnfo-agent-orchestrator.q08.workers.dev/health"
  },
  {
   "name": "qnfo-agent-ws",
   "url": "https://qnfo-agent-ws.q08.workers.dev/health"
  },
  {
   "name": "qnfo-ai",
   "url": "https://qnfo-ai.q08.workers.dev/health"
  },
  {
   "name": "qnfo-ai-calibration",
   "url": "https://qnfo-ai-calibration.q08.workers.dev/health"
  },
  {
   "name": "qnfo-ai-search",
   "url": "https://qnfo-ai-search.q08.workers.dev/health"
  },
  {
   "name": "qnfo-analytics",
   "url": "https://qnfo-analytics.q08.workers.dev/health"
  },
  {
   "name": "qnfo-archive",
   "url": "https://qnfo-archive.q08.workers.dev/health"
  },
  {
   "name": "qnfo-arxiv-radar",
   "url": "https://qnfo-arxiv-radar.q08.workers.dev/health"
  },
  {
   "name": "qnfo-auditor",
   "url": "https://qnfo-auditor.q08.workers.dev/health"
  },
  {
   "name": "qnfo-backlog-exec",
   "url": "https://qnfo-backlog-exec.q08.workers.dev/health"
  },
  {
   "name": "qnfo-blank-audit",
   "url": "https://qnfo-blank-audit.q08.workers.dev/health"
  },
  {
   "name": "qnfo-chat-canary",
   "url": "https://qnfo-chat-canary.q08.workers.dev/health"
  },
  {
   "name": "qnfo-citation-watch",
   "url": "https://qnfo-citation-watch.q08.workers.dev/health"
  },
  {
   "name": "qnfo-cloud-ops",
   "url": "https://qnfo-cloud-ops.q08.workers.dev/health"
  },
  {
   "name": "qnfo-code-agent",
   "url": "https://qnfo-code-agent.q08.workers.dev/health"
  },
  {
   "name": "qnfo-code-orchestrator",
   "url": "https://qnfo-code-orchestrator.q08.workers.dev/health"
  },
  {
   "name": "qnfo-container-executor",
   "url": "https://qnfo-container-executor.q08.workers.dev/health"
  },
  {
   "name": "qnfo-containers-pilot",
   "url": "https://qnfo-containers-pilot.q08.workers.dev/health"
  },
  {
   "name": "qnfo-ddocs-indexer",
   "url": "https://qnfo-ddocs-indexer.q08.workers.dev/health"
  },
  {
   "name": "qnfo-email",
   "url": "https://qnfo-email.q08.workers.dev/health"
  },
  {
   "name": "qnfo-email-orchestrator",
   "url": "https://qnfo-email-orchestrator.q08.workers.dev/health"
  },
  {
   "name": "qnfo-errata-orchestrator",
   "url": "https://qnfo-errata-orchestrator.q08.workers.dev/health"
  },
  {
   "name": "qnfo-errata-publish",
   "url": "https://qnfo-errata-publish.q08.workers.dev/health"
  },
  {
   "name": "qnfo-errata-respond",
   "url": "https://qnfo-errata-respond.q08.workers.dev/health"
  },
  {
   "name": "qnfo-errata-watch",
   "url": "https://qnfo-errata-watch.q08.workers.dev/health"
  },
  {
   "name": "qnfo-error-selfheal",
   "url": "https://qnfo-error-selfheal.q08.workers.dev/health"
  },
  {
   "name": "qnfo-events",
   "url": "https://qnfo-events.q08.workers.dev/health"
  },
  {
   "name": "qnfo-fleet-advisor",
   "url": "https://qnfo-fleet-advisor.q08.workers.dev/health"
  },
  {
   "name": "qnfo-fleet-calibrator",
   "url": "https://qnfo-fleet-calibrator.q08.workers.dev/health"
  },
  {
   "name": "qnfo-fleet-dashboard",
   "url": "https://qnfo-fleet-dashboard.q08.workers.dev/health"
  },
  {
   "name": "qnfo-fleet-deploy",
   "url": "https://qnfo-fleet-deploy.q08.workers.dev/health"
  },
  {
   "name": "qnfo-gateway",
   "url": "https://qnfo-gateway.q08.workers.dev/health"
  },
  {
   "name": "qnfo-idea-factory",
   "url": "https://qnfo-idea-factory.q08.workers.dev/health"
  },
  {
   "name": "qnfo-idea-miner",
   "url": "https://qnfo-idea-miner.q08.workers.dev/health"
  },
  {
   "name": "qnfo-idea-triage",
   "url": "https://qnfo-idea-triage.q08.workers.dev/health"
  },
  {
   "name": "qnfo-impact",
   "url": "https://qnfo-impact.q08.workers.dev/health"
  },
  {
   "name": "qnfo-infra",
   "url": "https://qnfo-infra.q08.workers.dev/health"
  },
  {
   "name": "qnfo-intent-orchestrator",
   "url": "https://qnfo-intent-orchestrator.q08.workers.dev/health"
  },
  {
   "name": "qnfo-ipatent",
   "url": "https://qnfo-ipatent.q08.workers.dev/health"
  },
  {
   "name": "qnfo-kaizen",
   "url": "https://qnfo-kaizen.q08.workers.dev/health"
  },
  {
   "name": "qnfo-lifecycle",
   "url": "https://qnfo-lifecycle.q08.workers.dev/health"
  },
  {
   "name": "qnfo-memory-mcp",
   "url": "https://qnfo-memory-mcp.q08.workers.dev/health"
  },
  {
   "name": "qnfo-observability",
   "url": "https://qnfo-observability.q08.workers.dev/health"
  },
  {
   "name": "qnfo-ops",
   "url": "https://qnfo-ops.q08.workers.dev/health"
  },
  {
   "name": "qnfo-outreach",
   "url": "https://qnfo-outreach.q08.workers.dev/health"
  },
  {
   "name": "qnfo-paper-explainer",
   "url": "https://qnfo-paper-explainer.q08.workers.dev/health"
  },
  {
   "name": "qnfo-paper-indexer",
   "url": "https://qnfo-paper-indexer.q08.workers.dev/health"
  },
  {
   "name": "qnfo-paper-reviser",
   "url": "https://qnfo-paper-reviser.q08.workers.dev/health"
  },
  {
   "name": "qnfo-pdf",
   "url": "https://qnfo-pdf.q08.workers.dev/health"
  },
  {
   "name": "qnfo-pipeline-ops",
   "url": "https://qnfo-pipeline-ops.q08.workers.dev/health"
  },
  {
   "name": "qnfo-proof",
   "url": "https://qnfo-proof.q08.workers.dev/health"
  },
  {
   "name": "qnfo-qwav",
   "url": "https://qnfo-qwav.q08.workers.dev/health"
  },
  {
   "name": "qnfo-register-guard",
   "url": "https://qnfo-register-guard.q08.workers.dev/health"
  },
  {
   "name": "qnfo-research-exec",
   "url": "https://qnfo-research-exec.q08.workers.dev/health"
  },
  {
   "name": "qnfo-research-radar",
   "url": "https://qnfo-research-radar.q08.workers.dev/health"
  },
  {
   "name": "qnfo-research-supervisor",
   "url": "https://qnfo-research-supervisor.q08.workers.dev/health"
  },
  {
   "name": "qnfo-skill-sync",
   "url": "https://qnfo-skill-sync.q08.workers.dev/health"
  },
  {
   "name": "qnfo-skills-discovery",
   "url": "https://qnfo-skills-discovery.q08.workers.dev/health"
  },
  {
   "name": "qnfo-social",
   "url": "https://qnfo-social.q08.workers.dev/health"
  },
  {
   "name": "qnfo-thread-ingest",
   "url": "https://qnfo-thread-ingest.q08.workers.dev/health"
  },
  {
   "name": "qnfo-tools-mcp",
   "url": "https://qnfo-tools-mcp.q08.workers.dev/health"
  },
  {
   "name": "qnfo-twin-maintain",
   "url": "https://qnfo-twin-maintain.q08.workers.dev/health"
  },
  {
   "name": "research-daily-brief",
   "url": "https://research-daily-brief.q08.workers.dev/health"
  },
  {
   "name": "papers.qnfo.org",
   "url": "https://papers.qnfo.org/health"
  },
  {
   "name": "qnfo.org",
   "url": "https://qnfo.org/health",
   "binding": "SVC_QNFO_GATEWAY"
  },
  {
   "name": "fleet-executor",
   "url": "https://fleet-executor.q08.workers.dev/health"
  },
  {
   "name": "fleet-scheduler",
   "url": "https://fleet-scheduler.q08.workers.dev/health"
  }
 ]
};
