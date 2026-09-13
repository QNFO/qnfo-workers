# W1 comparator replay — the documented root cause is falsified, and the documented fix is unsafe as written

Date: 2026-09-13 · Author: qnfo-ops / ops-exec
Status: **falsifies** the W1(a) root cause in `docs/INTEGRATION-PLAN-2026-09-13.md`; proposes a
narrower and strictly safer fix.
Method: `run_code` (pure compute, no bindings, no network) replaying both comparators over the 18
per-worker rows written by the 13:03:53Z scan in `fleet_drift_report`.

## 1. What the plan claims

W1(a): *"7 blocked by a non-semver live `VERSION` — the comparator cannot order them"*, with the
action: *"treat `canonical !== deployed` as heal-worthy when the canonical parses as semver,
regardless of the deployed string's format, behind a per-worker allowlist"*.

## 2. What the replay shows

Current comparator `newer(canonical, deployed)` (`parseInt`, no `v`-strip):

| result | n | workers |
|---|---|---|
| `true` → `canonical-ahead`, i.e. heal-worthy | **7** | qnfo-lifecycle, qnfo-paper-indexer, qnfo-qwav, qnfo-email, qnfo-ddocs-indexer, qnfo-archive, personal-companion |
| `false` → skip | **11** | qnfo-agent-orchestrator + the 10 `deployed-ahead` |

`num("qnfo-lifecycle/fabric-20260910")` = `[0]`; `num("1.6.1-memory-maintain-fixed")` = `[1,6,1]`
→ `newer` = **true**.

So the comparator **does** order the 7 fabric rows, and the scanner **already** writes them as
`canonical-ahead` — the heal-worthy classification. That is exactly the label those rows carry in
the live table. **The comparator is therefore not the binding constraint for those 7.**

The plan's own headline — *"the detector runs hourly and classifies correctly; the actuator closes
nothing"* — is what the replay supports. W1(a)'s stated mechanism is falsified: the constraint is
downstream in the deploy/upload path (or the `usedHealth` skip), not in `newer()`.

## 3. The proposed rule is unsafe as literally written

Applying *"heal-worthy iff canonical parses as semver AND canonical !== deployed"* to the same 18
rows gives **heal = 18 / skip = 0**, and **9 of the 18 are downgrades**:

| worker | deployed → canonical |
|---|---|
| personal-companion | v1.1.0 → 1.0.0 |
| qnfo-ops | 2.15.1 → 2.13.0 |
| qnfo-research-exec | 0.8.1 → 0.5.17-research-restored |
| qnfo-signal-loop | 1.1.2 → 1.1.0 |
| qnfo-fleet-dashboard | 1.5.1 → 1.1.0 |
| qnfo-fleet-control | 0.3.4 → 0.3.3 |
| qnfo-ai-calibration | 1.1.5 → 1.1.4 |
| qnfo-ai | 5.25.1 → 5.21.3 |
| personal-api | 3.5.0 → v3.2.2-maxout200k |

Two victims are the AI router and **this endpoint**. The per-worker allowlist in W1(a) is therefore
load-bearing, not a safety nicety. A further **7** rows have a non-semver *deployed* version, so
their direction is not knowable from version strings at all.

## 4. The narrower fix that is actually safe

**Rule 1 — adopt: strip a leading `v` before parsing in `newer()`.**

`cmp("1.0.0", "v1.1.0")` = −1 → deployed is newer → `personal-companion` is correctly skipped and
the hourly downgrade loop (26 consecutive `HTTP 400` failures) stops. Zero downgrade risk: the rule
can only ever convert a false `canonical-ahead` into `deployed-ahead`.

**Rule 2 — do NOT adopt as written: `canonical !== deployed ⇒ heal`.** Even with a correct semver
compare it does not unblock the 7 fabric rows, because
`cmp("1.6.1-memory-maintain-fixed", "qnfo-lifecycle/fabric-20260910")` is `null` (deployed
unparseable). All it adds is the 9 downgrades of §3.

## 5. Where to look instead for the 7 fabric rows

The detector already emits `canonical-ahead` for them hourly while `healed=0`. The constraint is in
the actuator. The next read is the upload/redeploy path and the canonical-body resolver — all 7
carry `source_path = …/deployed-current.worker.js`, and a prior session found that same path
replaced by a `404: TOMBSTONE` sentinel for `qnfo-cloud-ops`.

Blocked from qnfo-ops: `qnfo-fleet-control/worker.js` is 75,875 B against a 32,768-char
`github_repo_read` ceiling with no offset parameter (re-confirmed this session — the read returns
truncated at exactly 32,768 chars), and there is no deploy tool on this endpoint.

## 6. Limits

- The replay is over version **strings**, not bytes: it proves what the comparator returns, not what
  the scanner does with the return value.
- 18 rows = the 13:03:53Z scan only. The same workers repeat in the 12:02 and 11:02 scans
  worker-for-worker, which is a consistency check, not an independent sample.
- `note` values are the scanner's own labels; the replay reproducing them is the cross-check that
  the comparator model is the right one.
- `deployed_version` for wrangler-deployed workers is inferred from `/health` text, not from bytes.
