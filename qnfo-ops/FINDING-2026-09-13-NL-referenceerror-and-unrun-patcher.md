# FINDING — `NL is not defined` diagnosed; the fix exists in-repo and has never been run

Date: 2026-09-13 (~14:50Z). Resolves the `NL` item in
`qnfo-ops/REMEDIATION-2026-09-13-root-causes.md`.

## 1. Root cause

`depositToGithub()` in `qnfo-research-exec/worker.js` builds the deposit README with a bare `NL`
that is **never declared** in the bundle:

```js
var readme = '# ' + (title || slug) + NL + NL + 'DOI: ' + doi + NL + NL +
  'Author: Rowan Brad Quni-Gudzinas (ORCID 0009-0002-4317-5604)' + NL + ...
```

The sibling `qualityGate()` declares its own `var NLc = String.fromCharCode(10)` — the newline
constant was renamed at one call site and this one was missed.

**Source caveat:** `worker.js` is **80,916 B**, past the 32,768-char read cap, so I could not
independently re-verify this line. It is read from source by the author of
`qnfo-research-exec/apply-research-exec-fix.mjs` (15,705 B, added 2026-09-13).

**The error text proves no declaration exists:** `var NL` at module scope hoists to `undefined`
(the README would contain the literal `undefined`, not throw); `let`/`const` would throw
*"Cannot access 'NL' before initialization"*. `"NL is not defined"` is ReferenceError for an
identifier with no binding in any enclosing scope — so a declaration cannot collide.

## 2. Masking — VERIFIED

```sql
SELECT kind, status, COUNT(*) n FROM cloud_ops_events WHERE kind='v2-drain' GROUP BY kind, status;
```
→ **one row: `status='ok', n=40`.**

All 40 v2-drain rows are `status='ok'`, including the **19** carrying `NL is not defined` and the
2 carrying `newversion failed: {"_status":504}`. **Not one was ever labelled an error.**
Cause: `logEvent()` writes `status || "ok"`, so failure payloads logged without a status are
recorded as successes. This is why the ReferenceError survived two days unticketed.

## 3. Ordering consequence

Both `depositToGithub()` call sites sit **after**
`UPDATE version_queue SET status='published', new_doi=?`. The throw fires after Zenodo published
and after the row left the drain's selection set → no retry → **the GitHub artifact deposit for
those versions is permanently lost.**

Window: last successful publish = `version_queue` id=17 (2026-09-11 10:16:31); first NL failure
= 2026-09-11T12:41:26Z. The two newest rows carry a 504 instead — those fail earlier and never
reach the ReferenceError.

## 4. The blocker — VERIFIED

`fleet_drift_report` id 1706 (2026-09-13 14:04:41):

| worker | deployed | canonical | note |
|---|---|---|---|
| **qnfo-research-exec** | **0.8.1** | **0.5.17-research-restored** | `deployed-ahead` |
| qnfo-signal-loop | 1.1.2 | 1.1.0 | `deployed-ahead` |
| qnfo-ops | 2.15.7 | 2.15.6 | `deployed-ahead` |
| qnfo-qwav | qnfo-qwav/fabric-20260910 | 2.1.0 | `canonical-ahead` |
| qnfo-paper-indexer | qnfo-paper-indexer/fabric-20260910 | 2.2.0+scheduled-daily | `canonical-ahead` |

The repo canonical for `qnfo-research-exec` is **older** than live, so a repo-based patch is a
**downgrade**. Fleet-wide drift scan (id 1708, 14:05:46): `scanned=55 clean=33 drifted=9 ahead=9
healed=1 errors=0 staleCanon=4 healthVer=10`, `regOpen=99 regOverdue=26`.
**Nine workers are ahead of their canonical** — the canonical path is stale for nine workers.

## 5. The fix exists and is unrun

`qnfo-research-exec/apply-research-exec-fix.mjs` — idempotent, fails closed (writes nothing and
exits non-zero if a REQUIRED anchor doesn't match its expected count):

```
node apply-research-exec-fix.mjs --check
node apply-research-exec-fix.mjs --apply
node apply-research-exec-fix.mjs --apply --with-deposit-log
```

- **FIX A** (high): declare `NL` at module scope.
- **FIX B** (medium): classify error payloads in `logEvent()` — the defect that hid FIX A.
- **FIX C**: the canonical/deployed inversion above.

Needs a runner with filesystem + wrangler access. The qnfo-ops endpoint cannot execute it.

## 6. Resolution attribution for 14:11

`issue_ledger` holds six `alert:*` rows from `qnfo-pipeline-ops` resolved at
**2026-09-13 14:11:49** with the resolver's own note:

> `pipeline-ops sweep noise; root=ensemble down (re-armed) + sweep lacks state-change dedup`

The actor that closed the three `agent_issues` at 14:11:53Z was therefore the pipeline-ops
AUTO-SWEEP resolver — and **its own note records that the root was only re-armed, not fixed**,
and that the sweep fires on unchanged state. Independent corroboration of "cleared, not repaired".

## 7. Reporting inconsistency in qnfo-ops itself

`telemetry_report` (24h) reports `open_self_heal_issues: 0`, but `issue_ledger` holds an **open**
row: `selfheal:18c74ac3`, `[self-heal] tool workspace_write failing x12 (168h no recovery)`,
occurrences 2, first_seen 13:45:22, last_seen 14:15:05, `resolved_at` 13:46:07 — i.e. resolved
then re-opened. `telemetry_report`'s counter does not reflect `issue_ledger`.
