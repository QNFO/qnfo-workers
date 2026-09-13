# FINDING — the fleet's health probe is fail-open: it never checks health

Date: 2026-09-13. Author: qnfo-ops endpoint (Chatbox client session).
Source read: `qnfo-fleet-control/worker.js`, sha `d9d438f042c8f39a0fe27661b977fdb8c437197e`
(bundled advisor module — `VERSION = "0.3.3"`, `WORKER = "qnfo-fleet-advisor"`).
Filed as agent_issues **748**.

## 1. The defect, verbatim from source

```js
async function probeHealth(name, names) {
  if (names && names.size) {
    if (names.has(name)) return { ok: true, via: "cf-api-list", version: null };
    return { ok: false, detail: "not-in-cf-worker-list" };
  }
  const hosts = [name + ".q08.workers.dev", name + ".qnfo.org"];
  ...
}
```

`names` is built by `workerNameSet()` from
`GET https://api.cloudflare.com/client/v4/accounts/<acct>/workers/scripts?per_page=100`.

**So whenever that API call succeeds — the normal case — `probeHealth` never contacts a worker.**
It returns `ok: true` on the worker's **existence** in the account list, with `version: null`.
The `/health` endpoint is only consulted if the Cloudflare API call *fails*.

## 2. The fallback branch is also dead

The fallback targets `<name>.q08.workers.dev/health` then `<name>.qnfo.org/health`.
Nine such URLs were fetched from outside this session and **every one returned HTTP 404**:

`qnfo-ai` · `qnfo-ops` · `qnfo-memory-mcp` · `qnfo-proof` · `qnfo-paper-explainer` ·
`errata-hub` · `radar-hub` · `fleet-exec` · `idea-hub`

The decisive case: **`qnfo-ops.q08.workers.dev/health` 404s while this audit is running on
qnfo-ops.** And `qnfo-ai` is independently proven healthy (`fleet_status` → `healthy: true`,
HTTP 200, v5.25.1 via service binding) yet its registered URL 404s. Custom domains work in the
same session (`reading.q08.org/health` → 200, v1.1.0, pieces 8).

**Both branches are blind: the primary never checks, the fallback cannot resolve.**

## 3. The probe set is six workers, not fifty-five

```js
const PROBES = (env.PROBE_WORKERS ||
  "qnfo-ai,qnfo-ops,qnfo-kaizen,qnfo-cloud-ops,qnfo-infra,qnfo-auditor")
  .split(",")...
```

Six names. `qnfo-auditor` is **not in the 55-worker deployed roster** — it is a merged
tombstone. So the advisor's health verdict covers at most five live workers out of 55.

## 4. Why this matters — the observed consequences

| observation | explanation |
|---|---|
| `fleet_status` shows **43 of 55** workers with `healthy: null`, `version: ""` | This is the `version: null` of the `cf-api-list` branch surfacing. The empty string is the tell. |
| `qnfo-cloud-ops` failed **25 consecutive hourly deploys** (`Invalid or unexpected token` at `worker.js:1:2`) | Existence-based probing reports it `ok`. A worker that cannot even be uploaded is "up". |
| `qnfo-observability` shipped a canonical **missing `fleet.js`** (deploy rejected) | Same — `ok` by existence. |
| `integration_state` reports `invocated: 5` of 80 | The fleet records that workers *exist*; it does not record that they *work*. |

The fleet has **no probe that can fail**. Every failure mode that matters — a worker deployed but
throwing, a canonical that will not compile, a binding that was never wired — is invisible to it.

## 5. Fix

1. `probeHealth` must **call the health endpoint** and **fail loudly** on a non-200 or an
   unparseable body. Never infer health from existence.
2. The probe set must cover the **full roster**, not a hardcoded six.
3. A **null version from a reachable worker should itself be a finding** — a worker that answers
   `/health` without reporting a version is not verified.

## 6. Adversarial notes

- **Strongest case against this finding:** the existence check may be a deliberate liveness
  fallback for environments where the health endpoints are not publicly routable — which is
  exactly the situation observed. If so, the *intent* is defensible and the *defect* is that the
  fallback is treated as a positive health verdict rather than as "unverified". The
  recommendation stands either way: `ok: true, version: null` should not be reported as healthy.
- **Not verified:** whether `fleet_status` (the ops endpoint's own tool) uses this same
  `probeHealth`. It reports `probe: "api"` for the 43, which is consistent with an API-list path,
  but its implementation was not read this session. The **behaviour** is identical; the shared
  code is inferred.
- **Also not verified:** what consumes the ~38 stale `scanerr:*` keys in `fleet_deploy_state`.
  The deploy module sits past the 32,768-char read ceiling in the same 75,875-byte file, so the
  `scanerr` writer was not read. The dead-worker cleanup remains **not done** for that reason.
