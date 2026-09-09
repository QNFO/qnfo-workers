var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// registry.js
var REGISTRY = {
  "version": 1,
  "captured_at": "2026-09-07T17:42:00Z",
  "note": "Schedules from CF Workers API 2026-09-07; purposes curated; device-bound captured live from this host",
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
      "modified_on": "2026-09-07T17:30:00.440211Z"
    },
    {
      "name": "jnl-watch",
      "crons": [
        "*/10 * * * *"
      ],
      "purpose": "Journal listings watch",
      "group": "research-publish",
      "modified_on": "2026-09-06T11:58:02.718732Z"
    },
    {
      "name": "job-market-watch",
      "crons": [
        "0 7 * * 2"
      ],
      "purpose": "Academic job market radar",
      "group": "engagement",
      "modified_on": "2026-09-01T11:28:57.540759Z"
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
      "modified_on": "2026-09-05T20:47:36.261572Z"
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
      "modified_on": "2026-09-06T08:14:43.613421Z"
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
      "modified_on": "2026-09-02T18:31:50.7745Z"
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
        "0 4 * * 7",
        "0 6 * * 1",
        "0 6 * * 6",
        "0 6,12 * * 1-5",
        "0 7 * * 7",
        "0 7,13 * * 1-5",
        "0 8 * * 1-5",
        "0 9 * * 1-5",
        "0 9 3 9 *",
        "15 4 * * *",
        "15 5 * * 1",
        "30 5 * * 1",
        "30 6 * * 1-5",
        "35 3 * * *",
        "5 3 * * *"
      ],
      "purpose": "Cloud ops weekly digests + lifecycle",
      "group": "fleet-ops",
      "modified_on": "2026-09-06T07:50:13.758635Z"
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
      "modified_on": "2026-09-03T13:38:46.239983Z"
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
      "modified_on": "2026-09-03T13:38:10.933637Z"
    },
    {
      "name": "qnfo-errata-watch",
      "crons": [
        "0 * * * *"
      ],
      "purpose": "Errata watch",
      "group": "research-publish",
      "modified_on": "2026-09-03T13:38:14.718097Z"
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
      "name": "qnfo-idea-miner",
      "crons": [
        "0 * * * *"
      ],
      "purpose": "Idea mining",
      "group": "engagement",
      "modified_on": "2026-09-03T13:37:06.422634Z"
    },
    {
      "name": "qnfo-idea-triage",
      "crons": [
        "*/10 * * * *",
        "0 * * * *"
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
      "modified_on": "2026-09-04T13:48:43.3678Z"
    },
    {
      "name": "qnfo-lifecycle",
      "crons": [
        "*/30 * * * *",
        "0 * * * *",
        "0 0 1 * *",
        "0 3 * * *",
        "0 4 * * *",
        "0 5 * * *",
        "0 6 * * *",
        "0 7 * * *",
        "0 8 * * 1"
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
      "modified_on": "2026-09-06T11:51:07.143291Z"
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
      "modified_on": "2026-09-06T20:49:21.524837Z"
    },
    {
      "name": "qnfo-pipeline-ops",
      "crons": [
        "*/15 * * * *"
      ],
      "purpose": "Pipeline ops watchdog",
      "group": "fleet-ops",
      "modified_on": "2026-09-06T20:49:21.36612Z"
    },
    {
      "name": "qnfo-research-exec",
      "crons": [
        "*/10 * * * *"
      ],
      "purpose": "Research version_queue drain",
      "group": "research-publish",
      "modified_on": "2026-09-06T21:00:11.723528Z"
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
        "0 16 * * *",
        "0 6 * * *",
        "0 7 * * *",
        "0 9 * * *",
        "30 14 * * *"
      ],
      "purpose": "Social amplifier queue",
      "group": "engagement",
      "modified_on": "2026-09-04T12:14:53.555691Z"
    },
    {
      "name": "qnfo-system-health",
      "crons": [
        "0 5 * * *"
      ],
      "purpose": "System health daily",
      "group": "fleet-ops",
      "modified_on": "2026-09-06T20:38:41.736509Z"
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
      "name": "qnfo-venue-radar",
      "crons": [
        "45 6 * * *"
      ],
      "purpose": "Venue radar",
      "group": "research-publish",
      "modified_on": "2026-09-03T17:59:03.476834Z"
    },
    {
      "name": "research-daily-brief",
      "crons": [
        "0 6 * * *"
      ],
      "purpose": "Daily research brief send",
      "group": "research-publish",
      "modified_on": "2026-09-02T08:32:20.47738Z"
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
      "name": "qnfo-ai",
      "url": "https://qnfo-ai.q08.workers.dev/health",
      "binding": "SVC_QNFO_AI"
    },
    {
      "name": "personal-api",
      "url": "https://personal-api.q08.workers.dev/health",
      "binding": "SVC_PERSONAL_API"
    },
    {
      "name": "qnfo-ops",
      "url": "https://qnfo-ops.q08.workers.dev/health",
      "binding": "SVC_QNFO_OPS"
    },
    {
      "name": "qnfo-kaizen",
      "url": "https://qnfo-kaizen.q08.workers.dev/health",
      "binding": "SVC_QNFO_KAIZEN"
    },
    {
      "name": "qnfo-paper-reviser",
      "url": "https://qnfo-paper-reviser.q08.workers.dev/health",
      "binding": "SVC_QNFO_PAPER_REVISER"
    },
    {
      "name": "papers.qnfo.org",
      "url": "https://papers.qnfo.org/"
    },
    {
      "name": "qnfo.org",
      "url": "https://qnfo.org/health",
      "binding": "SVC_QNFO_GATEWAY"
    },
    {
      "name": "qnfo-social",
      "url": "https://qnfo-social.q08.workers.dev/health",
      "binding": "SVC_QNFO_SOCIAL"
    },
    {
      "name": "qnfo-outreach",
      "url": "https://qnfo-outreach.q08.workers.dev/health",
      "binding": "SVC_QNFO_OUTREACH"
    },
    {
      "name": "personal-events-radar",
      "url": "https://personal-events-radar.q08.workers.dev/health",
      "binding": "SVC_PERSONAL_EVENTS_RADAR"
    }
  ]
};

// worker.js
var VERSION = "1.0.10";
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
async function healthProbes(env) {
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
    return list.length;
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
    const g = await d1all(env.OUTREACH, "SELECT status, COUNT(*) AS c FROM sent_log GROUP BY status ORDER BY c DESC LIMIT 8");
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
  const liveCount = await liveScripts(env);
  const lastRuns = await lastRuns30(env);
  const probes = await healthProbes(env);
  const scheduled = [];
  const now = /* @__PURE__ */ new Date();
  for (const s of REGISTRY.scheduled || []) {
    const per = analytics.per[s.name] || { requests: 0, errors: 0 };
    const exp = expectedFires(s.crons, now.getTime(), DAY_MS);
    let st;
    if (per.errors > 0) st = "ERR";
    else if (exp > 0 && per.requests === 0) st = "NO-RUN";
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
