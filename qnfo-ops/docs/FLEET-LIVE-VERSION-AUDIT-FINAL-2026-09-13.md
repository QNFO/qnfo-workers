# Fleet live-version audit — FINAL, 2026-09-13

Method: direct `GET https://<worker>.q08.workers.dev/health` via web_fetch from the qnfo-ops
endpoint, plus 12 service-binding probes from `fleet_status`. **55 of 55 workers covered.**
Recorded in `qnfo-audit.worker_live_audit` (43 rows).

## Headline

```
audited 43 | HTTP 200 41 | HTTP 404 2 | matched 33 | corrected 8
registry-vs-live mismatches remaining: 0
```

## The method unlock

`web_fetch` reaches the `.workers.dev` `/health` endpoints from the ops endpoint. All 43 probes
returned a parseable body or an explicit 404 on the first attempt. This is the first capability in
this session that verifies live worker versions **directly** rather than inferring them from the
registry, the drift scanner, or an activity ledger. It makes registry-as-truth (FLEET-STATE)
checkable without a deploy.

## 8 registry entries were stale — all corrected with live-probe evidence

| worker | registry was | live |
|---|---|---|
| qnfo-fleet-dashboard | 1.1.0 | **1.5.1** |
| ai-health-prober | 2.3.1 | **2.3.3** |
| qnfo-fleet-control | 0.4.11 | **0.4.13** |
| qnfo-signal-loop | 1.1.0 | **1.1.2** |
| personal-companion | 1.0.0 | **1.1.0** |
| qnfo-ai-calibration | 1.1.4 | **1.1.5** |
| qnfo-ops | 2.15.10 | **2.15.11** |
| qnfo-subscribers | 1.0.0 | **1.1.1** |

Verification query, returns 0 rows:

```sql
SELECT w.worker, w.live_version, r.version
  FROM worker_live_audit w JOIN service_registry r ON r.service = w.worker
 WHERE w.live_version IS NOT NULL AND r.version != w.live_version;
```

## The drift scanner is falsified by direct probe

`fleet_drift_report` reports `qnfo-observability` `deployed_version 1.1.3`. Live:

```json
{"ok":true,"worker":"qnfo-observability","version":"1.2.0","merged":["qnfo-observability","qnfo-analytics"]}
```

Its `deployed_version` is neither the live version nor the registry version. Issue 758 now rests on
a probe rather than an inference.

## Two workers have no reachable `/health`

`qnfo-twin-maintain` and `obsidian-writer` both return HTTP 404 while every peer on the same domain
pattern answers. Neither can be version-verified, availability-verified, or drift-checked — which
is why both sat in the fleet with no live measurement at all.

## Three of my own earlier claims falsified by these probes

1. **"The `1.0.0` hub versions are placeholders from the 09-12 roster rebuild."** False. All seven
   hubs (audit-hub, companion-hub, errata-hub, fleet-exec, idea-hub, jnl-pipeline, radar-hub)
   report `1.0.0` as their **real live version**.
2. **"qnfo-subscribers has 0 rows ever."** False. Live reports `subscribers: 1, pending: 0`, at
   version 1.1.1 with `send_email`, `audit_db`, `living_db` all true. It is a working worker with one
   subscriber whose weekly cron has not fired yet — not a dead one.
3. **"qnfo-qwav should be retired on 0 measured requests."** Weakened. It is live at 2.1.0 with
   routes `/ask`, `/ai/ask`, `/ai/search` and d1/vz/ai bindings true. Absence of measurement is not
   absence of use.

## New findings from this pass

- **`qnfo-agent-ws` reports `deepseek_key: false`** while every other declared binding is true and
  sibling workers expose their secrets as true. A declared secret is absent; any code path calling
  DeepSeek directly will fail at runtime rather than at deploy.
- **`qnfo-tools-mcp` reports `sessions: 0`** — 15 tools exposed, no client connected.
- **`qnfo-fleet-control` `/health` self-identifies as worker `qnfo-fleet-deploy`** and reports
  `enabled:false, auto_heal:false`.
- **`qnfo-ops` advanced 2.15.7 → 2.15.10 → 2.15.11 during this session** despite `auto_heal=false`.
- **`qnfo-research-supervisor`** is live at 1.1.1 with `workflowClass: ResearchSupervisor` and
  `bindings.workflow: true` — deployed and reachable. Its "STALLED 48h" verdict is about emitting
  nothing, not being down. Sharper cause: it has **no scheduled handler**, so nothing invokes it.
- **`research-daily-brief`** is alive at 14:36:57Z, so its 06:07 send failure is a runtime fault, not
  an availability fault.
- **`osf-integrity-check`** returns live OSF registration data with `checked_at` 14:36:12Z —
  demonstrably working; its 1 req24 is a daily cadence, not idleness.
- **`qnfo-ddocs-indexer`** live reports `1.0.0` while the repo canonical is `1.0.1` — direct
  confirmation that the v1.0.1 fix (commits `141b48ae` mirror, `61eba889` source) is staged, not
  deployed.

## What this does NOT establish

- A version read once proves what was deployed at that instant, not stability. `qnfo-ops` moved
  twice while I watched.
- The registry now states the **live** version, not the **canonical** one. For workers whose canonical
  is behind live (personal-companion canonical 1.0.0 vs live 1.1.0) the registry is truthful about
  now, but a redeploy would still downgrade.
- `/health` presence is not productivity. Two of the 41 healthy workers (`qnfo-paper-explainer`,
  `qnfo-ddocs-indexer`) are alive and emitting nothing useful.
