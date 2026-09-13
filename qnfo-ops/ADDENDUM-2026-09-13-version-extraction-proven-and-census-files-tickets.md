# ADDENDUM — merged-bundle version extraction PROVEN, and the frozen census files the gateway tickets

Date: 2026-09-13T14:20Z · Author: qnfo-ops / ops-exec
Source: `qnfo-fleet-control/worker.js` (sha `d9d438f0`, 75,875 B — first 32,768 readable)

## 1. `versionOf()` reads the FIRST `var VERSION` — now proven, not inferred

The readable prefix shows the bundle's module order explicitly:

```js
var advisorMod = (function(){
  ...
  // src/server.js
  var VERSION = "0.3.3";
  var WORKER = "qnfo-fleet-advisor";
  ...
  return { FleetAdvisor: FleetAdvisor, default: server_default };
})();
var calibratorMod = (function(){
  ...
  // worker.js
  var VERSION = "1.0.0";
  var WORKER = "qnfo-fleet-calibrator";
  ...
```

And the live drift row for this worker reads:

```
worker: qnfo-fleet-control   deployed_version: 0.3.4   canonical_version: 0.3.3
note: deployed-ahead
```

**The canonical version `0.3.3` is the advisor's `VERSION`, not fleet-control's.** The
version-extraction defect previously described as "RC-11, mechanism undetermined" is now
established: `versionOf()` takes the first `var VERSION = "..."` in a merged bundle, which belongs
to whichever module was concatenated first.

Consequence: `qnfo-fleet-control` is in its own downgrade set. Any heal that acted on its canonical
would push a bundle whose recorded version is another module's.

## 2. The scanner's classification logic is NOT readable — confirmed blocked

The error-kind strings the scan reports (`version-format`, `stale-canon`, `health-ver`) do **not**
appear anywhere in the readable 32,768 chars. The truncation lands mid-`detectAnomalies` in
`calibratorMod`, so the third module — the deploy scan/heal/redeploy logic — is entirely past the
cap.

This means the central open question stays open: **whether a build-tag version mismatch is
classified `version-format` and excluded from healing** (which would explain `ahead=9, healed=1`
and would mean the `obsidian-writer` fix relabels rather than resolves) cannot be settled from this
endpoint. It needs either the third module's source or one more scan cycle.

## 3. NEW causal chain: the frozen gateway census is what files the gateway tickets

`advisorMod.runAudit` (readable, quoted verbatim):

```js
const rows = await d1All(env, "SELECT model, error_class, SUM(count) AS n FROM ai_gateway_failures
   WHERE ts >= ((strftime('%s','now') - 86400) * 1000) GROUP BY model, error_class ORDER BY n DESC LIMIT 8");
for (const row of rows) {
  const n = row.n || 0;
  const cls = String(row.error_class || "fail").toLowerCase();
  if (cls.indexOf("5") === 0 && n >= 200) findings.push({ kind: "ai-gateway", severity: "high", title: "GW 5xx " + row.model + " x" + n + "/24h", ... });
  else if ((cls.indexOf("4") === 0 || cls.indexOf("429") >= 0 || cls.indexOf("timeout") >= 0) && n >= 400)
    findings.push({ kind: "ai-gateway", severity: n >= 2e3 ? "high" : "medium", title: "GW " + (row.error_class || "4xx") + " " + row.model + " x" + n + "/24h", ... });
}
```

Note the thresholds: **`n >= 200` (5xx) and `n >= 400` (4xx/429), where `n = SUM(count)` over 24 h.**

But `count` is a **frozen census**, not a failure volume — proven in
`FINDING-2026-09-13-gw-fail-sweep-saturation-150.md`: all 8 buckets hold `min_c == max_c` across
46-47 sweeps and **sum to exactly 150** (`per_page=50 x limit=3`).

So the advisor's `SUM(count)` over 24 h is roughly `150 x (sweeps per 24 h)` — about **7,200** —
against thresholds of 200/400. **Every bucket clears every threshold every day, by a factor of
~18x.** The gateway findings the advisor files are therefore an artifact of the page cap, not
evidence of gateway failure.

This closes the loop between two previously separate findings:

```
sweep capped at 150 rows  ->  identical census re-inserted every sweep
   ->  advisor SUM(count)/24h ≈ 7,200  ->  clears the 200/400 thresholds
   ->  spurious "GW 400 <model> xN/24h" agent_issues filed
```

The `[gw-fail]` tickets (678, 679, 680, 681, 682, 683, 684) are consistent with this path. Their
current state — resolved 21, wontfix 15, closed 2, **open 0** — means they were disposed of, not
that the condition cleared; the sweep still saturates.

## 4. Other facts read from the same prefix

- `advisorMod` probes only
  `qnfo-ai,qnfo-ops,qnfo-kaizen,qnfo-cloud-ops,qnfo-infra,qnfo-auditor` (`env.PROBE_WORKERS`), cron
  `*/20 * * * *` — a far narrower probe set than `fleet_status`'s 55.
- It files issues via `INSERT INTO agent_issues (... source=WORKER ...)` with `WORKER =
  "qnfo-fleet-advisor"`, and **updates rather than re-files** when an open issue with the same title
  exists — a working dedupe, unlike the gw-fail path.
- `OPEN-ISSUES-BACKLOG` fires only when open issues (excluding `OPEN-ISSUES%`) exceed **8**.
  Currently 3, so it is correctly silent.
- `MODEL-DEGRADED` fires on any `ai_model_health.status='degraded'` row — which is why stale
  `degraded` flags produce persistent findings.
- It also audits gateway config (`collect_logs`, `authentication`, `retry_max_attempts < 2`) and the
  AI Gateway spend limit.

## 5. Limits

- The third module is unread; §2's exclusion hypothesis is still an inference.
- §3's arithmetic (`~150 x sweeps`) assumes one sweep per 30 min. `ai_gateway_failures` rows are
  ~46-47 per model over ~23 h, implying a **~30 min** cadence — consistent, but I did not measure
  the cron interval directly.
- The advisor's thresholds are read from source; the *filing* of tickets 678-684 is attributed to
  this path by consistency, not by tracing a specific ticket to a specific run.
- `versionOf()`'s exact regex is still unread; §1 rests on the canonical value matching the first
  module's `VERSION` exactly, which is strong but circumstantial.
