# FINDING — `deployed-current.worker.js` mirrors shadow the canonical `worker.js` for 18 workers

Date: 2026-09-13. Author: qnfo-ops. Resolution order read from source; counts measured from
`fleet_drift_report` this session.

## 1. The mechanism, read from source

`qnfo-fleet-deploy/deployed-current.worker.js` @ ref `db9d2fdb~1` (blob `ed539ec3`, 24,761 B, read in
full) — the deploy control plane that runs inside `qnfo-fleet-control`:

```js
async function canonical(env, worker) {
  var r2 = await r2Read(env, worker);
  if (r2 && r2.fresh) return r2;                    // (1) R2, if <30 min old
  var names = [worker];
  if (worker.indexOf("qnfo-") === 0) names.push(worker.slice(5));
  var cs = [];
  for (var a = 0; a < names.length; a++) {
    cs.push("qnfo-workers/main/" + names[a] + "/deployed-current.worker.js");   // (2) MIRROR
    cs.push("qnfo-ops/main/cloud/" + names[a] + "/deployed-current.worker.js"); // (3) MIRROR
    cs.push("qnfo-workers/main/" + names[a] + "/worker.js");                    // (4) canonical
    cs.push("qnfo-ops/main/cloud/" + names[a] + "/worker.js");                  // (5) canonical
  }
  for (var i = 0; i < cs.length; i++) {
    var r = await timedFetch(GH + cs[i], ...);
    if (r.ok) {
      var c = await r.text();
      if (c && c.length > 0 && c.slice(0, 4) !== "404:") { ... return { path: cs[i], code: c }; }
    }
  }
  if (r2) return r2;
  return null;
}
```

The loop **returns on the first candidate that fetches successfully**. `deployed-current.worker.js`
is tried **before** `worker.js`, so whenever a mirror exists it wins and `worker.js` is never read.

The only escape hatch is the `404:` prefix: a candidate whose first four bytes are literally `404:` is
skipped. That is why the established remediation is a **tombstone**, not a deletion — a stub or a
stale-but-valid body would still be uploaded and would replace the live worker.

## 2. Measured extent

`fleet_drift_report`, `ts > now-2h`, grouped by resolved `source_path`:

| resolved canonical | workers | names |
|---|---|---|
| `deployed-current.worker.js` (MIRROR) | **18** | personal-api, personal-companion, qnfo-agent-orchestrator, qnfo-ai, qnfo-ai-calibration, qnfo-archive, qnfo-ddocs-indexer, qnfo-email, qnfo-email-orchestrator, qnfo-fleet-dashboard, qnfo-lifecycle, qnfo-ops, qnfo-paper-indexer, qnfo-qwav, qnfo-research-exec, qnfo-signal-loop, qnfo-social, qnfo-backlog-exec |
| `worker.js` (canonical) | 2 | qnfo-fleet-control, qnfo-observability |

**18 of the 20 drift-reporting workers take their canonical from a snapshot mirror.** Only two read the
authoritative source — and the reason is instructive: `qnfo-observability/` has **no**
`deployed-current.worker.js` in its directory listing, so the resolver falls through to `worker.js`;
`qnfo-fleet-control/` likewise. Absence of the mirror is the only thing making a `worker.js` canonical
reachable.

Note that **`qnfo-ops` — this endpoint — is itself mirror-resolved.** Its canonical is a snapshot, not
its `worker.js`.

## 3. This is the unifying root cause, not a separate defect

Three previously-separate findings are one finding:

1. **`personal-companion`'s stale canonical.** Its drift row resolves to
   `qnfo-workers/main/personal-companion/deployed-current.worker.js`, `canonical_version = 1.0.0`, while
   production runs `v1.1.0`. The mirror is byte-identical to the repo's `worker.js`
   (both blob `c06edffb`, 62,666 B, both `VERSION = "1.0.0"`). **The mirror is the stale artifact the
   hourly loop tries to install.** The downgrade is not a comparator-only bug; the comparator is being
   handed a genuinely stale file.
2. **Why `worker.js` patches never ship.** Any edit to a shadowed `worker.js` is unreachable by
   construction. This is the blocker `AMENDMENT16` mis-attributed to "no deploy route" — the route
   exists; the path was shadowed (`AMENDMENT17` §4 reached the same conclusion for
   `qnfo-research-exec`, whose mirror held a valid 46,180 B `0.5.17-research-restored` bundle).
3. **`fleet_deploys` is nearly empty for these workers.** `qnfo-research-exec` has **zero** `fleet_deploys`
   rows, ever — the scanner classified it `deployed-ahead` from the mirror and `continue`d before
   reaching `redeploy()`.

## 4. Do NOT mass-tombstone the 18 mirrors

Tombstoning a mirror makes `worker.js` the canonical. Where `worker.js` is **older** than what is
deployed, that manufactures a stale canonical and arms a downgrade — exactly the `personal-companion`
failure mode, replicated 18 times. `personal-companion` is the proof: its `worker.js` is v1.0.0 and
production is v1.1.0, so tombstoning its mirror would *create* the downgrade canonical rather than
remove it.

`auto_heal=0` (set by this endpoint, 2026-09-13 14:15:02) means nothing would deploy immediately. That
makes the change inert today and **actively dangerous the moment `auto_heal` is restored** — which the
concurrent runbook intends to do. So this must not be done blind.

Safe sequence, per worker, requires a deploy route:

1. Determine the true newest artifact for the worker (live `deployedContent()` via CF API, not the mirror).
2. Refresh the mirror *or* the `worker.js` to that artifact, so both agree and neither is stale.
3. Only then tombstone the mirror if `worker.js` is the intended single source.
4. Verify from `/health` after the first deploy.

## 5. What I did and did not do

- I **verified the resolution order from source** and **measured the 18/2 split** — both new.
- I did **not** tombstone, delete, or edit any mirror. Per §4 that is a per-worker decision requiring
  artifact provenance this endpoint cannot read, and the downside is a production downgrade.
- I did **not** re-file this: the concurrent `AMENDMENT17` already fixed `qnfo-research-exec` (tombstone
  commit `45a8e360`). This finding generalises the mechanism to the other 17 and quantifies it.
- Not fixable from here: `github_file_write` needs a full file body in one call and the mirrors are
  large; more importantly, the *decision* per worker needs the live artifact, which needs
  `CF_DEPLOY_TOKEN`.
