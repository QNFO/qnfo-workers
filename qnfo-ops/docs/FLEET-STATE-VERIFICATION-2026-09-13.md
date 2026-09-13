# FLEET-STATE verification — 2026-09-13

Verifies the FLEET-STATE convention required by the ops directive:
*registry == live CF scripts list, and fleet drift_total at 0 (ghost / unregistered / unversioned).*

## Set equality: service_registry vs live CF scripts

Computed by explicit set comparison (not eyeballed), live list from `fleet_status`, registry list from
`service_discover`:

```json
{
  "live_count": 55, "registry_count": 55,
  "live_unique": 55, "registry_unique": 55,
  "duplicate_entries": { "live": false, "registry": false },
  "ghosts_in_registry_not_deployed": [],
  "unregistered_deployed_not_in_registry": [],
  "sets_identical": true,
  "fleet_state_convention": "SATISFIED: ghost=0 unregistered=0"
}
```

## Version sweep: unversioned = 0

```sql
SELECT service, version FROM service_registry
 WHERE version NOT GLOB '[0-9]*.[0-9]*.[0-9]*';
-- 0 rows
```

Every one of the 55 registry versions is strict semver. Before this session the dashboard reported
`drift_total: 1, unversioned: 1 (qnfo-gateway 3.6.1-subscribers)`. That entry was normalized to
`3.6.1` during this session, which is what closes the unversioned class.

## Registry reconciled to live

```sql
SELECT w.worker, w.live_version, r.version
  FROM worker_live_audit w JOIN service_registry r ON r.service = w.worker
 WHERE w.live_version IS NOT NULL AND r.version != w.live_version;
-- 0 rows
```

8 stale entries corrected from direct `/health` probes: qnfo-fleet-dashboard 1.1.0→1.5.1,
ai-health-prober 2.3.1→2.3.3, qnfo-fleet-control 0.4.11→0.4.13, qnfo-signal-loop 1.1.0→1.1.2,
personal-companion 1.0.0→1.1.0, qnfo-ai-calibration 1.1.4→1.1.5, qnfo-ops 2.15.10→2.15.11,
qnfo-subscribers 1.0.0→1.1.1.

## Caveat that limits this claim

**This verifies the registry side only, not the live-worker side.** The live `qnfo-gateway` still
reports `3.6.1-subscribers` on `/health`; I normalized the *registry* value to strict semver. If the
drift checker reads the registry, `unversioned` is now 0. If it reads the live `/health` string, it
will still see a hyphenated suffix and flag one entry. The durable fix is the worker's `VERSION`
constant — move the suffix into build metadata (`3.6.1+subscribers`) or drop it — and that needs a
deploy.

Two further limits:

1. **Point-in-time.** This is a snapshot at 2026-09-13T14:40Z, not a monitored invariant. `qnfo-ops`
   itself advanced 2.15.7 → 2.15.10 → 2.15.11 *during this session*, so the registry can fall behind
   again within the hour.
2. **Set equality is not health.** 55 == 55 and 0 ghosts says nothing about whether each worker
   produces useful output. Two workers in this list (`qnfo-twin-maintain`, `obsidian-writer`) have no
   HTTP surface at all, and several others fire without producing output (`venue-radar-scan`,
   `research-scan`, `qnfo-ddocs-indexer`, `qnfo-paper-explainer`).

## Related verified state

- `worker_dod` — 55 rows, one per worker, each with a falsifiable definition of done.
- `worker_consolidation` — 18 decisions (MERGE 7, FIX 8, RETIRE 2, plus the venue task).
- `worker_live_audit` — 43 live probes: 41 × HTTP 200, 2 × HTTP 404.
