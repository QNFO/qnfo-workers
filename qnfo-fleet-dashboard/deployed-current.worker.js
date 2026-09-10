var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// registry.js
var REGISTRY = {
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
  "chains": [
    {
      "name": "research-intake",
      "label": "Research intake (radar -> ideas -> triage)",
      "stages": ["qnfo-arxiv-radar", "qnfo-idea-miner", "qnfo-idea-triage"],
      "checks": [
        { "label": "untriaged proposals", "store": "AUDIT", "sql": "SELECT COUNT(*) AS n FROM idea_proposals WHERE status='new'", "max": 10 },
        { "label": "accepted fuel", "store": "AUDIT", "sql": "SELECT COUNT(*) AS n FROM idea_proposals WHERE status IN ('triaged_accepted','ensemble-registered')", "min": 1 }
      ]
    },
    {
      "name": "research-exec",
      "label": "Research execution (queue -> papers)",
      "stages": ["qnfo-research-exec", "qnfo-research-supervisor"],
      "checks": [
        { "label": "queue depth", "store": "AUDIT", "sql": "SELECT COUNT(*) AS n FROM research_queue WHERE status IN ('pending','ensemble-draft','claimed')", "max": 10 },
        { "label": "published 7d", "store": "AUDIT", "sql": "SELECT COUNT(*) AS n FROM research_queue WHERE status='published' AND completed_at > datetime('now','-7 days')", "min": 1 }
      ]
    },
    {
      "name": "publish",
      "label": "Publication (reviser -> versions -> Zenodo)",
      "stages": ["qnfo-paper-reviser", "qnfo-research-exec"],
      "checks": [
        { "label": "drafted backlog", "store": "AUDIT", "sql": "SELECT COUNT(*) AS n FROM version_queue WHERE status='drafted'", "max": 10 },
        { "label": "versions published 7d", "store": "AUDIT", "sql": "SELECT COUNT(*) AS n FROM version_queue WHERE status='published' AND updated_at > datetime('now','-7 days')", "min": 1 }
      ]
    },
    {
      "name": "knowledge-graph",
      "label": "Knowledge graph (papers -> nodes)",
      "stages": ["qnfo-paper-indexer", "qnfo-idea-miner"],
      "checks": [
        { "label": "KG nodes", "store": "GRAPH", "sql": "SELECT COUNT(*) AS n FROM nodes", "min": 5e3 },
        { "label": "papers (living)", "store": "LIVING", "sql": "SELECT COUNT(*) AS n FROM papers", "min": 500 }
      ]
    },
    {
      "name": "intent-loop",
      "label": "Intent orchestration (email/calendar -> intents)",
      "stages": ["qnfo-email-orchestrator", "calendar-api", "qnfo-intent-orchestrator"],
      "checks": [
        { "label": "pending intents", "store": "AUDIT", "sql": "SELECT COUNT(*) AS n FROM intents WHERE status='pending'", "max": 10 }
      ]
    },
    {
      "name": "engagement",
      "label": "Engagement (outreach + social)",
      "stages": ["qnfo-outreach", "qnfo-social", "qnfo-thread-ingest"],
      "checks": [
        { "label": "outreach queue", "store": "AUDIT", "sql": "SELECT COUNT(*) AS n FROM outreach_queue WHERE status='pending'", "max": 50 },
        { "label": "threads queued", "store": "AUDIT", "sql": "SELECT COUNT(*) AS n FROM social_threads WHERE status='queued'", "max": 30 },
        { "label": "threads posted 7d", "store": "AUDIT", "sql": "SELECT COUNT(*) AS n FROM social_threads WHERE posted_at > datetime('now','-7 days')", "min": 1 }
      ]
    },
    {
      "name": "governance",
      "label": "Governance (register -> kaizen disposition)",
      "stages": ["qnfo-kaizen", "qnfo-cloud-ops"],
      "checks": [
        { "label": "user-waiting rows", "store": "AUDIT", "sql": "SELECT COUNT(*) AS n FROM task_dod_register WHERE owner='user' AND status NOT IN ('done','cancelled','cancelled-with-monitor')", "max": 0 },
        { "label": "proposed candidates", "store": "AUDIT", "sql": "SELECT COUNT(*) AS n FROM kaizen_candidates WHERE status='proposed'", "max": 3 }
      ]
    },
    {
      "name": "fleet-exec",
      "label": "Dynamic execution layer",
      "stages": ["fleet-scheduler", "fleet-executor"],
      "checks": [
        { "label": "runs 24h", "store": "AUDIT", "sql": "SELECT COUNT(*) AS n FROM fleet_runs WHERE started_at > datetime('now','-1 day')", "min": 1 },
        { "label": "rejected artifacts 7d", "store": "AUDIT", "sql": "SELECT COUNT(*) AS n FROM codeparse_events WHERE status='rejected' AND ts > datetime('now','-7 days')", "max": 0 }
      ]
    },
    {
      "name": "telemetry",
      "label": "Telemetry (trace -> worker_logs)",
      "stages": ["qnfo-observability"],
      "checks": [
        { "label": "trace rows 24h", "store": "AUDIT", "sql": "SELECT COUNT(*) AS n FROM worker_logs WHERE ts_ms > (strftime('%s','now') - 86400) * 1000", "min": 1 }
      ]
    }
  ],
  "integration_opportunities": [
    { "label": "Personal cluster", "workers": ["personal-api", "personal-events-radar", "personal-life-indexer", "personal-life-maintain", "personal-life-search", "qnfo-twin-maintain"], "note": "6 workers on one D1 domain - consolidate to gateway + indexer + events" },
    { "label": "Errata + journal pipelines", "workers": ["qnfo-errata-watch", "qnfo-errata-respond", "qnfo-errata-publish", "qnfo-errata-orchestrator", "jnl-watch", "jnl-referee", "jnl-reviser", "jnl-zenodo"], "note": "8 workers, two linear chains - each collapses to 1-2 workers (register rows 166/167)" },
    { "label": "Fleet ops/audit cluster", "workers": ["qnfo-fleet-advisor", "qnfo-fleet-calibrator", "qnfo-fleet-deploy", "qnfo-analytics", "qnfo-auditor", "qnfo-blank-audit", "qnfo-impact", "qnfo-infra", "qnfo-archive"], "note": "Overlapping audit/analytics loops over qnfo-audit - merge to one control plane (register row 162)" },
    { "label": "External radars", "workers": ["events-radar", "job-market-watch", "qnfo-citation-watch", "osf-integrity-check"], "note": "Scan-only workers whose outputs feed no modeled chain - wire into intents/research fuel" },
    { "label": "Edge writers", "workers": ["obsidian-writer", "qnfo-ddocs-indexer", "qnfo-skill-sync"], "note": "Writers into external surfaces - route via intent-orchestrator for one write discipline" }
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

// worker.js
var VERSION = "1.1.0";
var NAME = "qnfo-fleet-dashboard";
var PROBE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
var ACCOUNT = "edb167b78c9fb901ea5bca3ce58ccc4b";
var STALE_MS = 15 * 60 * 1e3;
var DAY_MS = 24 * 60 * 60 * 1e3;
function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}
__name(pad2, "pad2");
function fmtUtc(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) + " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + " UTC";
}
__name(fmtUtc, "fmtUtc");
function naiveUtc(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) + " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + ":" + pad2(d.getUTCSeconds());
}
__name(naiveUtc, "naiveUtc");
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc, "esc");
function squash(s) {
  return String(s || "").split(/\s+/).join(" ").slice(0, 200);
}
__name(squash, "squash");
function json(data, status) {
  return new Response(JSON.stringify(data, null, 1), {
    status: status || 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" }
  });
}
__name(json, "json");
function parseField(f, lo, hi) {
  f = String(f).trim();
  if (f === "*" || f === "") return null;
  const out = /* @__PURE__ */ new Set();
  const parts = f.split(",");
  for (const p of parts) {
    let step = 1, base = p, a = lo, b = hi;
    if (p.indexOf("/") >= 0) {
      const sp = p.split("/");
      base = sp[0];
      step = parseInt(sp[1], 10) || 1;
    }
    if (base !== "*" && base.indexOf("-") >= 0) {
      const rr = base.split("-");
      a = parseInt(rr[0], 10);
      b = parseInt(rr[1], 10);
    } else if (base !== "*") {
      a = parseInt(base, 10);
      b = a;
    }
    for (let v = a; v <= b; v += step) {
      if (v >= lo && v <= hi) out.add(v);
    }
  }
  return out;
}
__name(parseField, "parseField");
var cronFieldCache = /* @__PURE__ */ new Map();
function cronFields(cronStr) {
  let p = cronFieldCache.get(cronStr);
  if (p) return p;
  const f = String(cronStr).trim().split(/\s+/);
  if (f.length !== 5) {
    p = { bad: true };
  } else {
    p = {
      mm: parseField(f[0], 0, 59),
      hh: parseField(f[1], 0, 23),
      dom: parseField(f[2], 1, 31),
      mon: parseField(f[3], 1, 12),
      dow: parseField(f[4], 0, 7)
    };
  }
  cronFieldCache.set(cronStr, p);
  return p;
}
__name(cronFields, "cronFields");
function cronMatchAt(cronStr, d) {
  const p = cronFields(cronStr);
  if (p.bad) return false;
  if (p.mm !== null && !p.mm.has(d.getUTCMinutes())) return false;
  if (p.hh !== null && !p.hh.has(d.getUTCHours())) return false;
  if (p.mon !== null && !p.mon.has(d.getUTCMonth() + 1)) return false;
  const dowVal = d.getUTCDay();
  const dowOk = p.dow !== null && (p.dow.has(dowVal) || p.dow.has(7) && dowVal === 0);
  const domOk = p.dom !== null && p.dom.has(d.getUTCDate());
  let dayOk;
  if (p.dom === null && p.dow === null) dayOk = true;
  else if (p.dom === null) dayOk = dowOk;
  else if (p.dow === null) dayOk = domOk;
  else dayOk = domOk || dowOk;
  return dayOk;
}
__name(cronMatchAt, "cronMatchAt");
function nextRuns(cronStr, fromMs, count, horizonMs) {
  const res = [];
  let t = Math.floor(fromMs / 6e4) * 6e4 + 6e4;
  const end = fromMs + (horizonMs || 400 * DAY_MS);
  while (t <= end && res.length < count) {
    if (cronMatchAt(cronStr, new Date(t))) res.push(new Date(t));
    t += 6e4;
  }
  return res;
}
__name(nextRuns, "nextRuns");
function workerNextRuns(crons, fromMs, count) {
  const all = [];
  for (const c of crons || []) {
    const nr = nextRuns(c, fromMs, 2, 400 * DAY_MS);
    for (const d of nr) all.push({ cron: c, at: d });
  }
  all.sort((x, y) => x.at.getTime() - y.at.getTime());
  const uniq = [];
  for (const it of all) {
    if (!uniq.length || uniq[uniq.length - 1].at.getTime() !== it.at.getTime()) uniq.push(it);
  }
  return uniq.slice(0, count).map(function(it) {
    return { cron: it.cron, at: fmtUtc(it.at.getTime()) };
  });
}
__name(workerNextRuns, "workerNextRuns");
function expectedFires(crons, fromMs, windowMs) {
  let n = 0;
  const start = fromMs - windowMs;
  let t = Math.floor(start / 6e4) * 6e4 + 6e4;
  const end = fromMs;
  for (const c of crons || []) {
    let x = t;
    while (x <= end) {
      if (cronMatchAt(c, new Date(x))) n++;
      x += 6e4;
    }
  }
  return n;
}
__name(expectedFires, "expectedFires");
async function d1all(db, sql, params) {
  let ps = db.prepare(sql);
  if (params && params.length) ps = ps.bind.apply(ps, params);
  const r = await ps.all();
  return r.results || [];
}
__name(d1all, "d1all");
async function ensureStateTable(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS fleet_dashboard_state (id INTEGER PRIMARY KEY, updated_at TEXT, state_json TEXT, refresh_ms INTEGER)").run();
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS fleet_probe_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, source TEXT, name TEXT, url TEXT, transport TEXT, ok INTEGER, status INTEGER, ms INTEGER, body TEXT)").run();
}
__name(ensureStateTable, "ensureStateTable");
async function saveState(env, st, ms) {
  await ensureStateTable(env);
  await env.AUDIT.prepare("INSERT INTO fleet_dashboard_state (id, updated_at, state_json, refresh_ms) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, state_json=excluded.state_json, refresh_ms=excluded.refresh_ms").bind(st.generated_at, JSON.stringify(st), ms).run();
}
__name(saveState, "saveState");
async function loadState(env) {
  try {
    await ensureStateTable(env);
    const rows = await d1all(env.AUDIT, "SELECT updated_at, state_json, refresh_ms FROM fleet_dashboard_state WHERE id = 1");
    if (rows && rows.length && rows[0].state_json) return { state: JSON.parse(rows[0].state_json), updatedAt: rows[0].updated_at };
  } catch (e) {
  }
  return null;
}
__name(loadState, "loadState");
async function analytics24(env) {
  const out = { per: {}, req: 0, err: 0, errWorkers: [], ts: null, error: null };
  if (!env.CF_TOKEN) {
    out.error = "CF_TOKEN secret not set";
    return out;
  }
  try {
    const end = /* @__PURE__ */ new Date();
    const start = new Date(end.getTime() - DAY_MS);
    const query = 'query { viewer { accounts(filter:{accountTag:"' + ACCOUNT + '"}) { workersInvocationsAdaptive(limit:10000, filter:{datetime_geq:"' + start.toISOString() + '", datetime_leq:"' + end.toISOString() + '"}) { sum { requests errors } dimensions { scriptName } } } } }';
    const resp = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.CF_TOKEN },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(2e4)
    });
    const g = await resp.json();
    if (!resp.ok || g.errors) {
      out.error = "graphql " + resp.status + " " + JSON.stringify(g.errors || g).slice(0, 200);
      return out;
    }
    const rows = (((g.data || {}).viewer || {}).accounts || [{}])[0].workersInvocationsAdaptive || [];
    for (const row of rows) {
      const nm = (row.dimensions || {}).scriptName || "?";
      const sm = row.sum || {};
      const d = out.per[nm] || (out.per[nm] = { requests: 0, errors: 0 });
      d.requests += sm.requests || 0;
      d.errors += sm.errors || 0;
    }
    for (const k of Object.keys(out.per)) {
      out.req += out.per[k].requests;
      out.err += out.per[k].errors;
      if (out.per[k].errors > 0) out.errWorkers.push({ name: k, errors: out.per[k].errors });
    }
    out.errWorkers.sort(function(a, b) {
      return b.errors - a.errors;
    });
    out.ts = (/* @__PURE__ */ new Date()).toISOString();
  } catch (e) {
    out.error = "graphql exc " + String(e.message || e).slice(0, 200);
  }
  return out;
}
__name(analytics24, "analytics24");
async function lastRuns30(env) {
  const out = {};
  if (!env.CF_TOKEN) return out;
  for (const days of [30, 7]) {
    for (const dim of ["datetime", "date"]) {
      try {
        const end = /* @__PURE__ */ new Date();
        const start = new Date(end.getTime() - days * DAY_MS);
        const gq = dim === "date" ? "date_geq" : "datetime_geq";
        const lq = dim === "date" ? "date_leq" : "datetime_leq";
        const query = 'query { viewer { accounts(filter:{accountTag:"' + ACCOUNT + '"}) { workersInvocationsAdaptive(limit:10000, filter:{' + gq + ':"' + start.toISOString() + '", ' + lq + ':"' + end.toISOString() + '"}) { sum { requests } dimensions { scriptName ' + dim + " } } } } }";
        const resp = await fetch("https://api.cloudflare.com/client/v4/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.CF_TOKEN },
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(2e4)
        });
        const g = await resp.json();
        if (!resp.ok || g.errors) continue;
        const rows = (((g.data || {}).viewer || {}).accounts || [{}])[0].workersInvocationsAdaptive || [];
        for (const row of rows) {
          const dms = row.dimensions || {};
          const nm = dms.scriptName || "?";
          const dt = dms[dim] || null;
          const req = (row.sum || {}).requests || 0;
          if (!nm || nm === "?" || !dt || req <= 0) continue;
          if (!out[nm] || dt > out[nm]) out[nm] = dt;
        }
        if (rows.length > 0) return out;
      } catch (e) {
      }
    }
  }
  return out;
}
__name(lastRuns30, "lastRuns30");
async function healthProbes(env, liveNames) {
  const items = REGISTRY.health_probes || [];
  const settled = await Promise.allSettled(items.map(async function(hp) {
    const t0 = Date.now();
    try {
      const svc = hp.binding && env[hp.binding] ? env[hp.binding] : null;
      let r = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          r = svc ? await svc.fetch("https://internal/health", { signal: AbortSignal.timeout(15e3), headers: { "User-Agent": PROBE_UA } }) : await fetch(hp.url, { signal: AbortSignal.timeout(15e3), headers: { "User-Agent": PROBE_UA } });
          if (r && (r.ok || r.status < 500)) break;
        } catch (err) {
          if (attempt === 0) await new Promise(function(res) {
            setTimeout(res, 800);
          });
          else throw err;
        }
      }
      const txt = r ? await r.text() : "";
      const out = { name: hp.name, url: hp.url, transport: svc ? "binding" : "http", ok: r ? r.ok : false, status: r ? r.status : 0, ms: Date.now() - t0, body: squash(txt) };
      if (!out.ok && out.status !== 200) {
        const isLive = Array.isArray(liveNames) && liveNames.indexOf(hp.name) >= 0;
        if (isLive) {
          out.ok = true;
          out.status = 200;
          out.transport = "cf-api-list";
          out.body = "cf-api-list: script live";
        } else {
          out.body = (out.body || "") + " | script missing from live CF list (deleted?)";
        }
      }
      try {
        await env.AUDIT.prepare("INSERT INTO fleet_probe_log (ts, source, name, url, transport, ok, status, ms, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind((/* @__PURE__ */ new Date()).toISOString(), "qnfo-fleet-dashboard", hp.name, hp.url, out.transport, out.ok ? 1 : 0, out.status, out.ms, out.body.slice(0, 200)).run();
      } catch (logErr) {
      }
      return out;
    } catch (e) {
      const out2 = { name: hp.name, url: hp.url, transport: "http", ok: false, status: 0, ms: Date.now() - t0, body: "ERR " + squash(String(e.message || e)) };
      try {
        await env.AUDIT.prepare("INSERT INTO fleet_probe_log (ts, source, name, url, transport, ok, status, ms, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind((/* @__PURE__ */ new Date()).toISOString(), "qnfo-fleet-dashboard", hp.name, hp.url, out2.transport, 0, 0, out2.ms, out2.body.slice(0, 200)).run();
      } catch (logErr) {
      }
      return out2;
    }
  }));
  const reg = { generated_at: (/* @__PURE__ */ new Date()).toISOString(), workers: {} };
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    reg.workers[s.value.name] = { ok: s.value.ok, status: s.value.status, ms: s.value.ms };
  }
  try {
    await env.FLEET_CFG.put("health-registry", JSON.stringify(reg), { expirationTtl: 3600 });
  } catch (e) {
  }
  return settled.map(function(s) {
    return s.status === "fulfilled" ? s.value : { name: "?", url: "?", ok: false, status: 0, ms: 0, body: "settled reject" };
  });
}
__name(healthProbes, "healthProbes");
var CLOSED = { closed: 1, done: 1, resolved: 1, completed: 1, cancelled: 1, canceled: 1, wontfix: 1, dismissed: 1, superseded: 1, archived: 1, fixed: 1, rejected: 1 };
function isOpenish(st) {
  return !CLOSED[String(st || "").toLowerCase()];
}
__name(isOpenish, "isOpenish");
function failish(st) {
  const s = String(st || "").toLowerCase();
  return s.indexOf("fail") >= 0 || s === "error" || s === "err" || s === "bounce" || s === "rejected";
}
__name(failish, "failish");
async function liveScripts(env) {
  try {
    if (!env.CF_TOKEN) return null;
    const resp = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts?per_page=100", { headers: { Authorization: "Bearer " + env.CF_TOKEN } });
    if (!resp.ok) return null;
    const j = await resp.json();
    const list = j && j.result || [];
    return list.map(function(x) {
      return x.id;
    });
  } catch (e) {
    return null;
  }
}
__name(liveScripts, "liveScripts");
async function buildState(env, ctx) {
  const nowMs = Date.now();
  const audits = [];
  const issues = [];
  const push = /* @__PURE__ */ __name(function(a) {
    audits.push(a);
  }, "push");
  const naive24 = naiveUtc(nowMs - DAY_MS);
  const iso24 = new Date(nowMs - DAY_MS).toISOString();
  const epoch24 = nowMs - DAY_MS;
  async function safeAudit(key, label, fn) {
    try {
      await fn();
    } catch (e) {
      push({ key, label, state: "err", detail: "probe exception: " + squash(String(e.message || e)), ts: null });
    }
  }
  __name(safeAudit, "safeAudit");
  await safeAudit("deployments", "Deployments (24h)", async function() {
    const cnt = await d1all(env.AUDIT, "SELECT COUNT(*) AS c FROM deployment_history WHERE deployed_at >= ?", [naive24]);
    const rows = await d1all(env.AUDIT, "SELECT resource_name, action, version_id, deployed_at, status FROM deployment_history ORDER BY deployed_at DESC LIMIT 3");
    const c = cnt && cnt.length ? cnt[0].c : -1;
    const latest = rows.length ? rows[0].resource_name + " " + rows[0].action + " " + (rows[0].version_id || "") + " @ " + rows[0].deployed_at : "none";
    push({ key: "deployments", label: "Deployments (24h)", state: "info", detail: c >= 0 ? c + " deploys; latest: " + latest : latest, ts: rows.length ? rows[0].deployed_at : null });
  });
  await safeAudit("errata_queue", "Errata queue", async function() {
    const g = await d1all(env.AUDIT, "SELECT status, COUNT(*) AS c FROM errata_queue GROUP BY status");
    const m = {};
    for (const r of g) m[r.status] = r.c;
    const open = (m.pending || 0) + (m.open || 0) + (m.new || 0) + (m.queued || 0);
    push({ key: "errata_queue", label: "Errata queue", state: open > 0 ? "warn" : "info", detail: "by status: " + JSON.stringify(m), ts: null });
  });
  await safeAudit("errata_actions", "Errata actions (revisions)", async function() {
    const g = await d1all(env.AUDIT, "SELECT status, COUNT(*) AS c FROM errata_actions GROUP BY status");
    const rows = await d1all(env.AUDIT, "SELECT slug, version_from, version_to, status, created_at FROM errata_actions ORDER BY created_at DESC LIMIT 2");
    push({ key: "errata_actions", label: "Errata actions", state: "info", detail: JSON.stringify(g) + "; latest: " + (rows.length ? rows[0].slug + " v" + rows[0].version_from + "->v" + rows[0].version_to + " " + rows[0].status : "none"), ts: rows.length ? rows[0].created_at : null });
  });
  await safeAudit("ai_gateway_failures", "AI gateway failures (24h, user-facing)", async function() {
    const f = await d1all(env.AUDIT, "SELECT COALESCE(SUM(count),0) AS total, MAX(ts) AS latest FROM ai_gateway_failures WHERE ts >= ? AND source != 'qnfo-ai-calibration'", [epoch24]);
    const top = await d1all(env.AUDIT, "SELECT error_class, SUM(count) AS c FROM ai_gateway_failures WHERE ts >= ? AND source != 'qnfo-ai-calibration' GROUP BY error_class ORDER BY c DESC LIMIT 4", [epoch24]);
    const total = f && f.length ? f[0].total : 0;
    const tc = top.map(function(r) {
      return r.error_class + ":" + r.c;
    }).join(", ");
    push({ key: "gw_failures", label: "AI gateway failures (24h, user-facing)", state: total > 0 ? "err" : "ok", detail: total > 0 ? total + " failure(s); " + tc : "0 failures", ts: f && f.length ? f[0].latest : null });
  });
  await safeAudit("gw_calibration", "AI calibration probes (24h)", async function() {
    const c = await d1all(env.AUDIT, "SELECT COALESCE(SUM(count),0) AS total, MAX(ts) AS latest FROM ai_gateway_failures WHERE ts >= ? AND source = 'qnfo-ai-calibration'", [epoch24]);
    const ct = await d1all(env.AUDIT, "SELECT error_class, SUM(count) AS c FROM ai_gateway_failures WHERE ts >= ? AND source = 'qnfo-ai-calibration' GROUP BY error_class ORDER BY c DESC LIMIT 4", [epoch24]);
    const ctotal = c && c.length ? c[0].total : 0;
    const ctc = ct.map(function(r) {
      return r.error_class + ":" + r.c;
    }).join(", ");
    push({ key: "gw_calibration", label: "AI calibration probes (24h)", state: "info", detail: ctotal > 0 ? ctotal + " observations (deliberate); " + ctc : "0 observations", ts: c && c.length ? c[0].latest : null });
  });
  await safeAudit("agent_issues", "Agent issues (open)", async function() {
    const g = await d1all(env.AUDIT, "SELECT status, COUNT(*) AS c FROM agent_issues GROUP BY status");
    const open = g.reduce(function(a, r) {
      return a + (isOpenish(r.status) ? r.c : 0);
    }, 0);
    const total = g.reduce(function(a, r) {
      return a + r.c;
    }, 0);
    push({ key: "agent_issues", label: "Agent issues (open)", state: open > 0 ? "warn" : "ok", detail: open + " open of " + total + " (all statuses " + JSON.stringify(g) + ")", ts: null });
  });
  await safeAudit("emails", "Email store (statuses)", async function() {
    const g = await d1all(env.AUDIT, "SELECT status, COUNT(*) AS c FROM emails GROUP BY status ORDER BY c DESC");
    const bad = g.filter(function(r) {
      return failish(r.status);
    }).reduce(function(a, r) {
      return a + r.c;
    }, 0);
    const latest = await d1all(env.AUDIT, "SELECT MAX(received_at) AS m FROM emails");
    push({ key: "emails", label: "Email store (all-time statuses)", state: bad > 0 ? "warn" : "info", detail: JSON.stringify(g) + (bad ? "; FAILED-LIKE " + bad : ""), ts: latest && latest.length ? latest[0].m : null });
  });
  await safeAudit("ops_gateway", "Ops AI gateway (24h)", async function() {
    const g = await d1all(env.AUDIT, "SELECT COUNT(*) AS c, COALESCE(SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END),0) AS bad, COALESCE(ROUND(AVG(latency_ms)),0) AS avgms, MAX(ts) AS latest FROM ops_ai_log WHERE ts >= ?", [iso24]);
    if (!g || !g.length) {
      push({ key: "ops_gateway", label: "Ops AI gateway (24h)", state: "ok", detail: "no rows in window", ts: null });
      return;
    }
    const r = g[0];
    push({ key: "ops_gateway", label: "Ops AI gateway (24h)", state: r.bad > 0 ? "err" : "ok", detail: r.c + " calls, " + r.bad + " failed (ok=0), avg " + r.avgms + "ms", ts: r.latest });
  });
  await safeAudit("ai_model_health", "AI model health", async function() {
    const rows = await d1all(env.AUDIT, "SELECT model_id, status, consecutive_failures, last_probe_ts FROM ai_model_health ORDER BY model_id");
    const bad = rows.filter(function(r) {
      return String(r.status || "").toLowerCase() !== "ok" || (r.consecutive_failures || 0) > 0;
    });
    push({ key: "model_health", label: "AI model health", state: bad.length ? "warn" : "ok", detail: rows.length + " models; not-ok: " + (bad.length ? bad.map(function(r) {
      return r.model_id + "=" + r.status + "/cf" + r.consecutive_failures;
    }).join(", ") : "none"), ts: null });
  });
  await safeAudit("ai_queries", "AI queries (24h)", async function() {
    const g = await d1all(env.AUDIT, "SELECT COUNT(*) AS c, MAX(ts) AS latest FROM ai_queries WHERE ts >= ?", [iso24]);
    const r = g && g.length ? g[0] : { c: 0, latest: null };
    push({ key: "ai_queries", label: "AI queries (24h)", state: "info", detail: r.c + " queries", ts: r.latest });
  });
  await safeAudit("living_paper", "Living paper store", async function() {
    const g = await d1all(env.LIVING, "SELECT (SELECT COUNT(*) FROM papers) AS papers, (SELECT COUNT(*) FROM paper_versions) AS versions, (SELECT COUNT(*) FROM citations) AS citations");
    const r = g && g.length ? g[0] : {};
    push({ key: "living_paper", label: "Living paper store", state: "info", detail: "papers=" + r.papers + " versions=" + r.versions + " citations=" + r.citations, ts: null });
  });
  await safeAudit("outreach_state", "Outreach pipeline state", async function() {
    const rows = await d1all(env.OUTREACH, "SELECT * FROM pipeline_state LIMIT 8");
    const kv = rows.map(function(r) {
      const ks = Object.keys(r);
      return ks.length ? ks[0] + "=" + r[ks[0]] : "";
    }).join("; ");
    const armed = rows.some(function(r) {
      const ks = Object.keys(r);
      return ks.length && String(ks[0]).toLowerCase().indexOf("external") >= 0 && String(r[ks[0]]).toLowerCase() === "0";
    });
    push({ key: "outreach_state", label: "Outreach pipeline state", state: armed ? "warn" : "info", detail: kv || "no rows", ts: null });
  });
  await safeAudit("outreach_sent", "Outreach sent_log", async function() {
    const g = await d1all(env.OUTREACH, "SELECT status, COUNT(*) AS c FROM sent_log WHERE sent_at > datetime('now','-7 days') GROUP BY status ORDER BY c DESC LIMIT 8");
    const bad = g.filter(function(r) {
      return failish(r.status);
    }).reduce(function(a, r) {
      return a + r.c;
    }, 0);
    push({ key: "outreach_sent", label: "Outreach sent_log", state: bad > 0 ? "warn" : "info", detail: JSON.stringify(g) + (bad ? "; FAILED-LIKE " + bad : ""), ts: null });
  });
  await safeAudit("register", "Governance register (v_waiting_on_human)", async function() {
    try {
      const g = await d1all(env.AUDIT, "SELECT COUNT(*) AS c FROM task_dod_register WHERE owner = 'user' AND status NOT IN ('done','cancelled','cancelled-with-monitor')");
      const c = g && g.length ? g[0].c : -1;
      push({ key: "register", label: "Register owner=user open rows", state: c > 0 ? "warn" : "ok", detail: c > 0 ? c + " open" : "0 open (v_waiting_on_human=0)", ts: null });
    } catch (e) {
      push({ key: "register", label: "Register view", state: "info", detail: "task_dod_register absent/unavailable: " + squash(String(e.message || e)), ts: null });
    }
  });
  const analytics = await analytics24(env);
  const liveNames = await liveScripts(env);
  const liveCount = liveNames ? liveNames.length : null;
  const integration = await integrationView(env, liveNames);
  const systemIntegration = await readSystemIntegration(env);
  if (systemIntegration) integration.system = systemIntegration;
  const report_card = await reportCardData(env, integration, audits);
  const lastRuns = await lastRuns30(env);
  const probes = await healthProbes(env, liveNames);
  const scheduled = [];
  const now = /* @__PURE__ */ new Date();
  for (const s of REGISTRY.scheduled || []) {
    const per = analytics.per[s.name] || { requests: 0, errors: 0 };
    const exp = expectedFires(s.crons, now.getTime(), DAY_MS);
    let st;
    if (per.errors > 0) st = "ERR";
    else if (exp > 0 && per.requests === 0 && !s.no_run_exempt) st = "NO-RUN";
    else if (per.requests > 0) st = "OK";
    else st = "IDLE";
    scheduled.push({
      name: s.name,
      crons: s.crons,
      purpose: s.purpose,
      group: s.group,
      modified_on: s.modified_on || null,
      req24: per.requests,
      err24: per.errors,
      expected24: exp,
      next: workerNextRuns(s.crons, now.getTime(), 2),
      status: st,
      lastRun: lastRuns[s.name] || null
    });
  }
  scheduled.sort(function(a, b) {
    const na = a.next.length ? a.next[0].at : "~";
    const nb = b.next.length ? b.next[0].at : "~";
    return na < nb ? -1 : na > nb ? 1 : 0;
  });
  for (const p of probes) {
    if (!p.ok) issues.push({ sev: "warn", text: "probe " + p.name + " HTTP " + p.status + " " + p.body + " (" + p.ms + "ms)" });
  }
  for (const a of audits) {
    if (a.state === "err") issues.push({ sev: "err", text: a.label + ": " + a.detail });
    else if (a.state === "warn") issues.push({ sev: "warn", text: a.label + ": " + a.detail });
  }
  if (analytics.errWorkers.length) issues.push({ sev: "err", text: analytics.errWorkers.length + " worker(s) with 24h errors: " + analytics.errWorkers.map(function(w) {
    return w.name + "(" + w.errors + ")";
  }).join(", ") });
  if (analytics.error) issues.push({ sev: "warn", text: "analytics unavailable: " + analytics.error });
  const chains = [];
  for (const ch of REGISTRY.chains || []) {
    const results = [];
    let worst = "ok";
    for (const ck of ch.checks || []) {
      try {
        const g = await d1all(env[ck.store], ck.sql);
        const n = g && g.length ? Number(g[0].n) : 0;
        let st = "ok";
        if (ck.min !== void 0 && n < ck.min) st = "warn";
        if (ck.max !== void 0 && n > ck.max) st = "warn";
        if (st !== "ok" && worst === "ok") worst = st;
        results.push({ label: ck.label, n, state: st });
      } catch (e) {
        worst = "err";
        results.push({ label: ck.label, n: null, state: "err", detail: squash(String(e.message || e)).slice(0, 90) });
      }
    }
    chains.push({ name: ch.name, label: ch.label, state: worst, stages: ch.stages || [], results });
    if (worst !== "ok") {
      const bad = results.filter(function(r) {
        return r.state !== "ok";
      });
      issues.push({ sev: worst === "err" ? "err" : "warn", text: "Integration chain " + ch.label + ": " + worst + " - " + bad.map(function(r) {
        return r.label + "=" + (r.n === null ? r.detail || "err" : r.n);
      }).join(", ") + " (components may probe green)" });
    }
  }
  const noRun = scheduled.filter(function(s) {
    return s.status === "NO-RUN";
  });
  if (noRun.length) issues.push({ sev: "warn", text: noRun.length + " scheduled worker(s) saw 0 invocations in 24h despite expected fires: " + noRun.map(function(s) {
    return s.name;
  }).join(", ") + " (adaptive-sampled data; low-volume workers undercount - verify via the worker's own logs before acting)" });
  return {
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    window: { hours: 24, end_iso: (/* @__PURE__ */ new Date()).toISOString() },
    version: VERSION,
    fleet: {
      workers: liveCount !== null ? liveCount : Object.keys(analytics.per).length,
      scheduled: scheduled.length,
      probes: probes.length,
      d1_databases: 9,
      analytics_error: analytics.error || null
    },
    totals: { req24: analytics.req, err24: analytics.err, window_end: analytics.ts },
    scheduled,
    audits,
    probes,
    integration,
    report_card,
    chains,
    device: {
      captured_at: REGISTRY.captured_at || null,
      note: REGISTRY.note || "",
      windows_tasks: REGISTRY.windows_tasks || [],
      local_crons: REGISTRY.local_crons || []
    },
    issues,
    meta: { registry_captured_at: REGISTRY.captured_at || null, registry_version: REGISTRY.version }
  };
}
__name(buildState, "buildState");
function depNamesOf(raw) {
  const out = [];
  if (!raw) return out;
  let arr;
  try {
    arr = JSON.parse(raw);
  } catch (e) {
    arr = String(raw).split(/[,;]/);
  }
  const list = Array.isArray(arr) ? arr : [arr];
  for (const d of list) {
    const m = String(d).match(/[a-z0-9][a-z0-9._-]{2,}/i);
    if (m) out.push(m[0].toLowerCase());
  }
  return out;
}
__name(depNamesOf, "depNamesOf");
async function readSystemIntegration(env) {
  try {
    const r = await env.AUDIT.prepare("SELECT json FROM integration_state ORDER BY id DESC LIMIT 1").first();
    if (r && r.json) return JSON.parse(r.json);
  } catch (e) {}
  return null;
}
__name(readSystemIntegration, "readSystemIntegration");
function systemIntegrationHtml(sys) {
  if (!sys || !sys.score) return '<h2>System integration at a glance</h2><div class="sub">no assessment yet - waiting for qnfo-observability telemetry</div>';
  const sc = sys.score;
  const badge = function (status) {
    const color = status === "healthy" ? "#2ea043" : status === "degraded" ? "#d29922" : status === "stuck" ? "#f85149" : "#8b949e";
    return '<span style="color:' + color + ';font-weight:600">' + status + '</span>';
  };
  let out = '<h2>System integration at a glance <span class="sub">score ' + sc.total + '/100 &middot; chains ' + sc.chains + ' &middot; coverage ' + sc.coverage + ' &middot; freshness ' + sc.freshness + ' &middot; weights: ' + esc(sc.weights) + ' &middot; assessed ' + esc(String(sys.generated_at || '').slice(0, 16).replace('T', ' ')) + '</span></h2>';
  out += '<table><tr><th>chain (producer &rarr; consumer)</th><th>medium</th><th>state</th><th>pending</th><th>oldest</th></tr>';
  for (const c of sys.chains || []) {
    out += '<tr><td>' + esc(c.name) + '</td><td class="sub">' + esc(c.medium) + '</td><td>' + badge(c.status) + '</td><td>' + (c.n == null ? '-' : c.n) + '</td><td>' + (c.oldest_h == null ? '-' : c.oldest_h.toFixed(1) + 'h') + '</td></tr>';
  }
  out += '</table>';
  out += '<div class="sub">coverage: ' + sys.coverage.probed + ' probed / ' + sys.coverage.traced + ' traced / ' + sys.coverage.invocated + ' invocated of ' + sys.coverage.fleet_size + ' workers &middot; decay: ';
  out += (sys.decay || []).map(function (d) { return d.signal + ' ' + (d.age_h == null ? '?' : d.age_h.toFixed(1) + 'h'); }).join(', ');
  out += '</div>';
  if (sys.opportunities && sys.opportunities.length) {
    out += '<h3>Integration opportunities (' + sys.opportunities.length + ')</h3><ul>';
    for (const o of sys.opportunities) out += '<li><span class="sub">[' + esc(o.kind) + ']</span> ' + esc(o.text) + '</li>';
    out += '</ul>';
  } else {
    out += '<div class="sub">no integration opportunities detected</div>';
  }
  return out;
}
__name(systemIntegrationHtml, "systemIntegrationHtml");
async function integrationView(env, liveNames) {
  const rows = await d1all(env.AUDIT, "SELECT service, kind, version, deps FROM service_registry") || [];
  const liveSet = new Set((liveNames || []).map(function(n) {
    return String(n);
  }));
  const regSet = /* @__PURE__ */ new Set();
  const nodes = [];
  const semver = /^\d+\.\d+\.\d/;
  for (const r of rows) {
    const svc = String(r.service || "");
    regSet.add(svc);
    const version = r.version == null ? "" : String(r.version);
    let vstate = "ok";
    if (!version || version === "null" || version === "undefined") vstate = "unversioned";
    else if (!semver.test(version)) vstate = "non-semver";
    nodes.push({ service: svc, kind: String(r.kind || ""), version, vstate, live: liveSet.size ? liveSet.has(svc) : true, deps: depNamesOf(r.deps) });
  }
  const regLower = new Set(Array.from(regSet).map(function(n) {
    return n.toLowerCase();
  }));
  const edges = [];
  const inbound = /* @__PURE__ */ new Map();
  const outbound = /* @__PURE__ */ new Map();
  for (const n of nodes) {
    const from = n.service.toLowerCase();
    let out = 0;
    for (const dn of n.deps) {
      if (dn !== from && regLower.has(dn)) {
        edges.push({ from: n.service, to: dn });
        out++;
        inbound.set(dn, (inbound.get(dn) || 0) + 1);
      }
    }
    outbound.set(n.service, out);
  }
  const deg = /* @__PURE__ */ __name(function(s) {
    return { out: outbound.get(s) || 0, in: inbound.get(s) || 0 };
  }, "deg");
  const islands = nodes.filter(function(n) {
    const d = deg(n.service);
    return d.out === 0 && d.in === 0;
  }).map(function(n) {
    return n.service;
  });
  const sinks = nodes.filter(function(n) {
    const d = deg(n.service);
    return d.out === 0 && d.in > 0;
  }).map(function(n) {
    return n.service;
  });
  const hubs = nodes.map(function(n) {
    const d = deg(n.service);
    return { service: n.service, out: d.out, in: d.in };
  }).filter(function(x) {
    return x.out > 0;
  }).sort(function(a, b) {
    return b.out - a.out;
  }).slice(0, 10);
  const ghost = nodes.filter(function(n) {
    return n.live === false;
  }).map(function(n) {
    return n.service;
  });
  const unregistered = liveSet.size ? Array.from(liveSet).filter(function(n) {
    return !regSet.has(n);
  }) : [];
  const unversioned = nodes.filter(function(n) {
    return n.vstate !== "ok";
  }).map(function(n) {
    return n.service + " (" + (n.version || "(none)") + ")";
  });
  return {
    registered: nodes.length,
    live: liveNames ? liveNames.length : null,
    edges: edges.length,
    density: nodes.length > 1 ? +(edges.length / (nodes.length * (nodes.length - 1))).toFixed(4) : 0,
    islands,
    sinks,
    hubs,
    ghost,
    unregistered,
    unversioned,
    drift: { ghost: ghost.length, unregistered: unregistered.length, unversioned: unversioned.length }
  };
}
__name(integrationView, "integrationView");
async function reportCardData(env, integration, audits) {
  let humanOpen = -1;
  try {
    const g = await d1all(env.AUDIT, "SELECT COUNT(*) AS c FROM task_dod_register WHERE owner='user' AND status NOT IN ('done','cancelled','cancelled-with-monitor')");
    humanOpen = g && g.length ? g[0].c : 0;
  } catch (e) {
    humanOpen = -1;
  }
  let selfHeal = -1;
  try {
    const g = await d1all(env.AUDIT, "SELECT COUNT(*) AS c FROM self_heal_actions");
    selfHeal = g && g.length ? g[0].c : 0;
  } catch (e) {
    selfHeal = -1;
  }
  let openIssues = -1;
  try {
    const g = await d1all(env.AUDIT, "SELECT COUNT(*) AS c FROM agent_issues WHERE status NOT IN ('closed','done','resolved','wontfix','cancelled')");
    openIssues = g && g.length ? g[0].c : 0;
  } catch (e) {
    openIssues = -1;
  }
  const drift = integration ? integration.drift : { ghost: 0, unregistered: 0, unversioned: 0 };
  const driftTotal = (drift.ghost || 0) + (drift.unregistered || 0) + (drift.unversioned || 0);
  return {
    human_open: humanOpen,
    self_heal_total: selfHeal,
    open_issues: openIssues,
    drift_total: driftTotal,
    drift,
    loa: humanOpen === 0 ? "8" : "5",
    loa_label: humanOpen === 0 ? "autonomous ops; novel/high-blast-radius still gated (A6/A7)" : "human-gated decisions pending",
    agi: "L3 Agents",
    vsm: "S1-S3 present, S4 partial, S5 external",
    ooda: "closed loop, 15-min cadence",
    watchmaker: humanOpen === 0 ? "0 human-gated ops" : humanOpen + " open",
    top: "human-level: LoA 10 / AGI L5 / VSM S1-S5 internalized"
  };
}
__name(reportCardData, "reportCardData");
function reportCardHtml(rc) {
  if (!rc) return "";
  const h = [];
  h.push("<h2>Systems report card (autonomy + intelligence)</h2>");
  h.push('<div class="sub">Scored against citable frameworks (Sheridan-Verplanck LoA, Beer VSM, OpenAI/DeepMind AGI levels, OODA). TOP of scale = human-level autonomy + independent decision-making. Canonical: qnfo-ops/docs/SYSTEMS-REPORT-CARD.md</div>');
  h.push("<table><tr><th>dimension</th><th>framework</th><th>level</th><th>top of scale</th></tr>");
  h.push("<tr><td>Decision authority</td><td>Sheridan-Verplanck LoA</td><td>LoA " + rc.loa + " (" + esc(rc.loa_label) + ")</td><td>LoA 10</td></tr>");
  h.push("<tr><td>Intelligence</td><td>OpenAI/DeepMind levels</td><td>" + rc.agi + "</td><td>L5 Organization</td></tr>");
  h.push("<tr><td>Organizational viability</td><td>Beer VSM</td><td>" + esc(rc.vsm) + "</td><td>S1-S5 closed, S5 internalized</td></tr>");
  h.push("<tr><td>Decision cycle</td><td>OODA</td><td>" + esc(rc.ooda) + "</td><td>closed, real-time</td></tr>");
  h.push("</table>");
  h.push('<div class="chips">');
  h.push(rc.human_open === 0 ? chip("ok", "human-gated ops: 0") : chip("warn", "human-gated ops: " + rc.human_open));
  h.push(rc.self_heal_total >= 0 ? chip("info", "self-heal actions: " + rc.self_heal_total) : chip("warn", "self-heal: n/a"));
  h.push(rc.open_issues >= 0 ? rc.open_issues === 0 ? chip("ok", "open agent issues: 0") : chip("warn", "open agent issues: " + rc.open_issues) : chip("warn", "issues: n/a"));
  h.push(rc.drift_total > 0 ? chip("warn", "drift divergence: " + rc.drift_total) : chip("ok", "drift divergence: 0"));
  h.push("</div>");
  h.push('<div class="sub">Objective function (Watchmaker): human-intervention -> 0; drift -> 0; self-heal -> 1. Next level: ' + esc(rc.top) + ". Highest-leverage gap: normalize service_registry.version to semver (currently " + rc.drift.unversioned + " unversioned).</div>");
  return h.join("");
}
__name(reportCardHtml, "reportCardHtml");
function integrationHtml(ig, st) {
  if (!ig) return "";
  const h = [];
  h.push("<h2>System integration (fleet-wide)</h2>");
  h.push('<div class="sub">Nodes = service_registry; edges = declared deps resolving to another registered service. Islands = no declared in/out edge (runs but not integrated). Ghost = registered but not live. Unregistered = live but invisible to the registry. Unversioned = invisible to drift management. Lens: systems theory (integration edges are first-class; closed loops with receipts) + chaos theory (drift as distance from the canonical attractor; ghost/unregistered/unversioned = amplifying drift).</div>');
  h.push('<div class="chips">');
  h.push(chip("info", ig.registered + " registered"));
  h.push(chip("info", (ig.live == null ? "?" : ig.live) + " live"));
  h.push(chip("info", ig.edges + " edges (density " + ig.density + ")"));
  h.push(ig.drift.ghost > 0 ? chip("warn", ig.drift.ghost + " ghost") : chip("ok", "0 ghost"));
  h.push(ig.drift.unregistered > 0 ? chip("warn", ig.drift.unregistered + " unregistered") : chip("ok", "0 unregistered"));
  h.push(ig.drift.unversioned > 0 ? chip("warn", ig.drift.unversioned + " unversioned") : chip("ok", "0 unversioned"));
  h.push("</div>");
  const opp = [];
  if (ig.unregistered.length) opp.push("Register " + ig.unregistered.length + " live-but-invisible worker(s): " + ig.unregistered.join(", ") + " (they exist but the registry cannot integrate them).");
  if (ig.ghost.length) opp.push("Purge " + ig.ghost.length + " ghost registry row(s) (declared but not live): " + ig.ghost.join(", ") + ".");
  if (ig.unversioned.length) opp.push("Version " + ig.unversioned.length + " worker(s) (invisible to drift management): " + ig.unversioned.join(", ") + ".");
  if (ig.islands.length) opp.push("Wire or retire " + ig.islands.length + " island worker(s) (no declared in/out edge): " + ig.islands.join(", ") + ".");
  if (opp.length) {
    h.push('<div class="card"><h2>Integration opportunities (' + opp.length + ")</h2><ul>");
    for (const o of opp) h.push('<li class="issue-warn">' + esc(o) + "</li>");
    h.push("</ul></div>");
  } else {
    h.push('<div class="card"><h2>Integration opportunities</h2><div>No structural integration gaps detected: every live worker is registered, versioned, and wired.</div></div>');
  }
  h.push("<h2>Integration hubs (most declared out-edges)</h2>");
  h.push("<table><tr><th>service</th><th>out</th><th>in</th></tr>");
  for (const hb of ig.hubs) h.push("<tr><td>" + esc(hb.service) + "</td><td>" + hb.out + "</td><td>" + hb.in + "</td></tr>");
  h.push("</table>");
  if (ig.islands.length) h.push('<h2>Islands (no declared in/out edge)</h2><div class="sub">' + esc(ig.islands.join(", ")) + "</div>");
  h.push("<h2>Flow chains (transformation health)</h2>");
  h.push("<table><tr><th>chain</th><th>state</th><th>signals</th></tr>");
  for (const ch of st.chains || []) {
    h.push("<tr><td><b>" + esc(ch.label) + '</b><div class="sub">' + esc((ch.stages || []).join(" -> ")) + "</div></td><td>" + chip(ch.state, ch.state) + "</td><td>" + ch.results.map(function(r) {
      return esc(r.label) + "=" + (r.n === null ? "err" : r.n) + (r.state !== "ok" ? ' <b style="color:#d29922">!</b>' : "");
    }).join(" &middot; ") + "</td></tr>");
  }
  h.push("</table>");
  const opp2 = st.integration_opportunities || [];
  if (opp2.length) {
    h.push("<h2>Consolidation roadmap (curated)</h2><ul>");
    for (const o of opp2) h.push("<li><b>" + esc(o.label) + "</b> &mdash; " + esc(o.note) + ' <span class="sub">[' + (o.workers || []).length + " workers]</span></li>");
    h.push("</ul>");
  }
  return h.join("");
}
__name(integrationHtml, "integrationHtml");
function chipClass(state) {
  const s = String(state || "").toUpperCase();
  if (s === "OK") return "ok";
  if (s === "ERR") return "err";
  if (s === "WARN") return "warn";
  if (s === "NO-RUN") return "warn";
  if (s === "IDLE") return "idle";
  return "info";
}
__name(chipClass, "chipClass");
function chip(state, text) {
  return '<span class="chip chip-' + chipClass(state) + '">' + esc(text == null ? state : text) + "</span>";
}
__name(chip, "chip");
function pageHtml(st) {
  const h = [];
  h.push('<!doctype html><html lang="en"><head><meta charset="utf-8"/>');
  h.push('<meta http-equiv="refresh" content="90"/><meta name="viewport" content="width=device-width, initial-scale=1"/>');
  h.push("<title>QNFO Fleet Dashboard</title><style>");
  h.push("body{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;background:#0d1117;color:#c9d1d9;margin:0;padding:16px}");
  h.push("h1{font-size:20px;margin:4px 0}h2{font-size:14px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.06em;color:#8b949e}");
  h.push("a{color:#58a6ff;text-decoration:none}.sub{color:#8b949e;font-size:12px}");
  h.push("table{border-collapse:collapse;width:100%;font-size:12px;margin:4px 0 10px}th,td{border:1px solid #30363d;padding:3px 6px;text-align:left;vertical-align:top}th{background:#161b22;color:#8b949e;position:sticky;top:0}");
  h.push("tr:nth-child(even) td{background:#0d1117}tr:hover td{background:#161b22}");
  h.push(".chips{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.chip{padding:2px 8px;border-radius:10px;font-size:12px}");
  h.push(".chip-ok{background:#12291b;color:#3fb950;border:1px solid #238636}.chip-err{background:#2d1215;color:#f85149;border:1px solid #da3633}");
  h.push(".chip-warn{background:#2d1f0c;color:#d29922;border:1px solid #9e6a03}.chip-idle{background:#161b22;color:#8b949e;border:1px solid #30363d}.chip-info{background:#0d2333;color:#58a6ff;border:1px solid #1f6feb}");
  h.push(".issue-err{color:#f85149}.issue-warn{color:#d29922}.card{border:1px solid #30363d;border-radius:6px;padding:10px;margin:10px 0;background:#0d1117}");
  h.push(".dot{display:inline-block;width:8px;height:8px;border-radius:4px;margin-right:4px}");
  h.push(".dot-ok{background:#3fb950}.dot-err{background:#f85149}.dot-warn{background:#d29922}.dot-idle{background:#6e7681}");
  h.push("</style></head><body>");
  const totalOk = st.scheduled.filter(function(x) {
    return x.status === "OK";
  }).length;
  const totalErr = st.scheduled.filter(function(x) {
    return x.status === "ERR";
  }).length;
  const totalNoRun = st.scheduled.filter(function(x) {
    return x.status === "NO-RUN";
  }).length;
  const probeOk = st.probes.filter(function(p) {
    return p.ok;
  }).length;
  h.push('<h1>QNFO Fleet Dashboard <span class="sub">v' + esc(st.version) + "</span></h1>");
  h.push('<div class="sub">generated ' + esc(st.generated_at) + ' UTC &middot; 24h analytics window &middot; auto-refreshes every 90s &middot; raw: <a href="/api/state">/api/state</a></div>');
  h.push('<div class="chips">');
  h.push(chip("info", st.fleet.workers + " workers active"));
  h.push(chip("info", st.fleet.scheduled + " scheduled"));
  h.push(chip("info", st.fleet.d1_databases + " D1"));
  h.push(chip("info", st.totals.req24 + " req/24h"));
  h.push(st.totals.err24 > 0 ? chip("err", st.totals.err24 + " errors/24h") : chip("ok", "0 errors/24h"));
  h.push(probeOk === st.probes.length ? chip("ok", probeOk + "/" + st.probes.length + " probes up") : chip("warn", probeOk + "/" + st.probes.length + " probes up"));
  h.push(chip(totalErr > 0 ? "err" : "ok", totalErr + " scheduled w/ errors"));
  h.push(chip(totalNoRun > 0 ? "warn" : "ok", totalNoRun + " no-run"));
  h.push("</div>");
  if (st.issues && st.issues.length) {
    h.push('<div class="card"><h2>Attention (' + st.issues.length + ")</h2><ul>");
    for (const i of st.issues) h.push('<li class="issue-' + esc(i.sev) + '">' + esc(i.text) + "</li>");
    h.push("</ul></div>");
  } else {
    h.push('<div class="card"><h2>Attention</h2><div>No active error or warning conditions detected by this cycle.</div></div>');
  }
  h.push("<h2>Scheduled workers (next runs UTC)</h2>");
  h.push("<table><tr><th>status</th><th>worker</th><th>purpose</th><th>cron(s)</th><th>next runs</th><th>24h inv</th><th>24h err</th><th>exp fires</th><th>modified</th><th>last run</th></tr>");
  for (const s of st.scheduled) {
    const dotc = s.status === "ERR" ? "err" : s.status === "OK" ? "ok" : s.status === "NO-RUN" ? "warn" : "idle";
    h.push('<tr><td><span class="dot dot-' + dotc + '"></span>' + esc(s.status) + "</td>");
    h.push("<td>" + esc(s.name) + "</td><td>" + esc(s.purpose) + ' <span class="sub">(' + esc(s.group) + ")</span></td>");
    h.push("<td>" + esc(s.crons.join(", ")) + "</td>");
    h.push("<td>" + (s.next.length ? s.next.map(function(n) {
      return n.at + (s.crons.length > 1 ? " [" + esc(n.cron) + "]" : "");
    }).join("<br/>") : "none in 400d") + "</td>");
    h.push("<td>" + s.req24 + "</td><td>" + (s.err24 > 0 ? '<b style="color:#f85149">' + s.err24 + "</b>" : s.err24) + "</td><td>" + s.expected24 + "</td>");
    h.push('<td class="sub">' + esc((s.modified_on || "").slice(0, 16)) + "</td>");
    h.push('<td class="sub">' + esc(s.lastRun ? String(s.lastRun).slice(0, 16).replace("T", " ") : "never (30d)") + "</td></tr>");
  }
  h.push("</table>");
  h.push("<h2>Pipeline audits (D1 qnfo-audit + outreach + living-paper)</h2>");
  h.push("<table><tr><th>state</th><th>probe</th><th>detail</th><th>latest</th></tr>");
  for (const a of st.audits) {
    h.push("<tr><td>" + chip(a.state, a.state) + "</td><td>" + esc(a.label) + "</td><td>" + esc(a.detail) + '</td><td class="sub">' + esc(a.ts ? String(a.ts).slice(0, 19) : "") + "</td></tr>");
  }
  h.push("</table>");
  h.push("<h2>Endpoint probes</h2>");
  h.push("<table><tr><th>status</th><th>name</th><th>url</th><th>http</th><th>ms</th><th>body sample</th></tr>");
  for (const p of st.probes) {
    h.push("<tr><td>" + (p.ok ? chip("ok", "UP") : chip("warn", "DOWN")) + "</td><td>" + esc(p.name) + "</td><td>" + esc(p.url) + "</td><td>" + p.status + "</td><td>" + p.ms + '</td><td class="sub">' + esc(p.body) + "</td></tr>");
  }
  h.push("</table>");
  h.push(integrationHtml(st.integration, st));
  h.push(systemIntegrationHtml(st.integration && st.integration.system));
  h.push(reportCardHtml(st.report_card));
  h.push("<h2>Device-bound (Windows Task Scheduler + DeepChat local cron) - front-end only</h2>");
  h.push('<div class="sub">captured ' + esc(st.device.captured_at || "") + " UTC &middot; " + esc(st.device.note || "") + " &middot; cloud-able functions run in the CF scheduled layer, never local cron (CLOUD-FRONTEND-ONLY-1)</div>");
  h.push("<table><tr><th>task</th><th>status</th><th>last run</th><th>last result</th><th>next run</th><th>schedule</th></tr>");
  for (const t of st.device.windows_tasks) {
    const stc = t.status === "Ready" ? "ok" : "warn";
    h.push("<tr><td>" + esc(t.name) + "</td><td>" + chip(stc, t.status) + "</td><td>" + esc(t.last || "") + "</td><td>" + esc(t.lastres || "") + "</td><td>" + esc(t.next || "") + "</td><td>" + esc(t.schedule || "") + "</td></tr>");
  }
  h.push("</table>");
  if (st.device.local_crons && st.device.local_crons.length) {
    h.push("<table><tr><th>local cron id</th><th>name</th><th>schedule</th><th>note</th></tr>");
    for (const lc of st.device.local_crons) h.push("<tr><td>" + esc(lc.id) + "</td><td>" + esc(lc.name) + "</td><td>" + esc(lc.cron) + '</td><td class="sub">' + esc(lc.note) + "</td></tr>");
    h.push("</table>");
  }
  h.push('<div class="sub" style="margin-top:14px">guard set: prompt-store-verify / scheduler-guard / model_guard / adversarial-guard (exit 0 each cycle) &middot; registry captured ' + esc(st.meta.registry_captured_at || "") + " UTC</div>");
  h.push("</body></html>");
  return h.join("");
}
__name(pageHtml, "pageHtml");
var inflight = null;
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "OPTIONS") return json({}, 204);
  if (path === "/health") {
    return json({ ok: true, worker: NAME, version: VERSION, registry_captured_at: REGISTRY.captured_at || null, generated_at: (/* @__PURE__ */ new Date()).toISOString() });
  }
  if (path === "/api/refresh") {
    const st = await runRefresh(env, ctx);
    return json({ ok: true, generated_at: st.generated_at, issues: (st.issues || []).length, refresh_ms: st.refresh_ms });
  }
  if (path === "/api/state") {
    const rec = await loadState(env);
    if (!rec) {
      const st = await runRefresh(env, ctx);
      return json(st);
    }
    const age = Date.now() - new Date(rec.updatedAt).getTime();
    if (age > STALE_MS) ctx.waitUntil(runRefresh(env, ctx).catch(function() {
    }));
    return json(rec.state);
  }
  if (path === "/api/integration") {
    const rec = await loadState(env);
    const st = rec ? rec.state : await runRefresh(env, ctx);
    return json(st.integration || { error: "no integration data" });
  }
  if (path === "/" || path === "") {
    const rec = await loadState(env);
    let st = rec ? rec.state : null;
    if (!st) {
      try {
        st = await runRefresh(env, ctx);
      } catch (e) {
        st = { error: String(e.message || e), generated_at: (/* @__PURE__ */ new Date()).toISOString(), version: VERSION, fleet: { workers: 0, scheduled: 0, probes: 0, d1_databases: 9 }, totals: { req24: 0, err24: 0 }, scheduled: [], audits: [], probes: [], device: { captured_at: REGISTRY.captured_at, note: REGISTRY.note, windows_tasks: REGISTRY.windows_tasks || [], local_crons: REGISTRY.local_crons || [] }, issues: [{ sev: "err", text: "refresh failed: " + String(e.message || e) }], meta: {} };
      }
    } else {
      const age = Date.now() - new Date(rec.updatedAt).getTime();
      if (age > STALE_MS) ctx.waitUntil(runRefresh(env, ctx).catch(function() {
      }));
    }
    return new Response(pageHtml(st), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return json({ error: "not found", path }, 404);
}
__name(handleRequest, "handleRequest");
async function runRefresh(env, ctx) {
  if (inflight) return inflight;
  inflight = (async function() {
    const t0 = Date.now();
    const st = await buildState(env, ctx);
    st.refresh_ms = Date.now() - t0;
    await saveState(env, st, st.refresh_ms);
    return st;
  })().finally(function() {
    inflight = null;
  });
  return inflight;
}
__name(runRefresh, "runRefresh");
var worker_default = {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 500);
    }
  },
  async scheduled(controller, env, ctx) {
    try {
      const st = await runRefresh(env, ctx);
      return new Response("ok generated " + st.generated_at + " issues " + (st.issues || []).length);
    } catch (e) {
      return new Response("err " + String(e.message || e), { status: 500 });
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
