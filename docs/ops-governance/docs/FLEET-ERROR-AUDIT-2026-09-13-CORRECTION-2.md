# CORRECTION 2 — my deploy claims were wrong; the prior session's fixes verified

Date: 2026-09-13. Corrects `DEPLOY-SUBSYSTEM-AUDIT-2026-09-13.md` §§3 and 7 and
`FLEET-ERROR-AUDIT-2026-09-13.md` §3 H2.

## 0. What this session actually was

Most of what I "found" was already in the workspace, in some cases more precisely. The
artifacts that already covered it:

| my finding | already documented in |
|---|---|
| NL ReferenceError, masked as `status='ok'` | `audits/2026-09-13-AMENDMENT16-NL-referenceerror-revision-blocked.md`, `AMENDMENT17-NL-fix-shippable-path.md` |
| canonical-store divergence | `audits/2026-09-13-ADDENDUM5-canonical-store-divergence.md` |
| deploy path shadowing | `audits/2026-09-13-ADDENDUM-deploy-path-shadow.md` |
| qnfo-canonical/cloud-ops invalid JS (ticket 691) | `ADDENDUM5` §3 — a **MIME multipart body**, boundary at byte 1 |
| observability `No such module fleet.js` (ticket 694) | the header of `qnfo-observability/worker.js` itself, citing `fleet_deploys` id 76 |
| 43/55 workers unprobed | filed independently as ticket 701 at 14:15Z |
| 543 `triaged_hold` / watchdog 404 | filed independently as ticket 699 at 14:15Z |

A concurrent ops session was committing tombstones and patchers (`45a8e360`, `0838b1e6`,
`927ccb8d`) while I was re-deriving the same mechanisms from D1.

## 1. CORRECTED — "no deploy route exists" is wrong

I wrote that the deploy blocker was *"no reachable route to the tool that has one"*. **Wrong.**
`ADDENDUM-deploy-path-shadow.md` read `qnfo-fleet-deploy/worker.js` **in full** (24,761 B, sha
`ed539ec3`) and documented the resolver:

```
1. R2 qnfo-canonical/<worker>.js        — only if fresh (ts < 30 min)
2. GitHub raw, first 200 not starting with "404:":
     a. qnfo-workers/main/<n>/deployed-current.worker.js
     b. qnfo-ops/main/cloud/<n>/deployed-current.worker.js
     c. qnfo-workers/main/<n>/worker.js
     d. qnfo-ops/main/cloud/<n>/worker.js
3. stale R2 as last resort
```

**A deploy route exists and works: commit to GitHub, and the hourly scan heals it.** The reason
fixes did not land is that candidate **(a) shadows (c)** — a stale `deployed-current.worker.js`
wins, the drift comparator sees `deployed-ahead`, and `scan()` `continue`s forever.

I also asserted the deployer was *"unreadable from this endpoint"*. It is readable: it lives at
`QNFO/qnfo-workers/qnfo-fleet-deploy/`. It is merely absent from `service_registry`, which is what
I had queried. **I mistook an unregistered service for an unreadable one.**

## 2. CORRECTED — H2's count was 19, not 40

My audit reported *"`cloud_ops_events kind='v2-drain'`: 40 rows, all `status='ok'`"* and attached
the masking claim to all 40. `AMENDMENT17` §2 separates them:

| metric | value |
|---|---|
| v2-drain rows with the **NL payload** | **19** (2026-09-11T12:41:26Z → 2026-09-13T05:21:30Z) |
| v2-drain rows, **all kinds** | 40 (2026-09-03T14:11:10Z → 2026-09-13T09:55:46Z) |

The masking claim survives intact — it is 19 for 19, not 40 for 40 — but the number I published
was the wrong population. `AMENDMENT17` also found something I did not: the throw happens
**after** `UPDATE version_queue SET status='published'`, so the row leaves the drain's selection
set and is never retried. The GitHub deposit for that version is silently lost.

## 3. VERIFIED — which of the prior session's fixes actually landed

I can now confirm outcomes the prior session could only predict.

**(a) `qnfo-backlog-exec` — WORKED.** The shadow was broken by updating *both* paths
(`aac2a041`, `fe2ac26b`):

```
fleet_deploys id 75 | qnfo-backlog-exec | 1.2.7 -> 1.2.8 | ok=1 | 2026-09-13 14:02:44
```

Drift id 1696 (`14:02:39`) shows `canonical-ahead` from `.../deployed-current.worker.js`. The
remedy converged.

**(b) `qnfo-cloud-ops` — WORKED (inferred from silence).** Its tombstone (`927ccb8d`) replaced the
corrupt MIME body at `deployed-current.worker.js`:

| | |
|---|---|
| failures | 25, first `2026-09-12 10:01:33`, **last `2026-09-13 07:02:38`** |
| failures after 07:02:38 | **0** |

The hourly failure loop stopped. This also closes ticket 691's mechanism: the target was never
valid JS, so no retry could ever have succeeded — and after the tombstone the resolver falls
through to the clean `worker.js`.

**(c) `qnfo-research-exec` — PENDING, not yet testable.** `AMENDMENT17` §6 predicted the next scan
(~15:02Z) would show `source_path = .../worker.js`. As of the last scan the tombstone had not been
reachable:

```
fleet_drift_report, total 1708 rows, newest 2026-09-13 14:05:46 (id 1708)

id 1706 | qnfo-research-exec | deployed 0.8.1 | canonical 0.5.17-research-restored
        | source_path qnfo-workers/main/qnfo-research-exec/deployed-current.worker.js
        | note deployed-ahead | 2026-09-13 14:04:41
```

Identical rows at 07:04:14, 08:02:32, 09:02:25, 10:02:29, 11:02:27, 12:02:27, 13:03:25 — hourly,
unchanged. The tombstone was committed at ~14:2x, **after** that scan. The deciding check is the
next one:

```sql
SELECT id, source_path, canonical_version, note FROM fleet_drift_report
 WHERE worker='qnfo-research-exec' ORDER BY id DESC LIMIT 1;
-- PASS if source_path ends in worker.js; FAIL if it still names deployed-current.worker.js
```

## 4. NEW — a version-marker mismatch that may block the observability fix

`qnfo-observability/worker.js` declares:

```js
const VERSION = '1.1.6-single-module';   // const, single quotes
```

Yet drift id 1702 (`14:03:55`) records `canonical_version = 1.1.4` from
`source_path qnfo-workers/main/qnfo-observability/worker.js` — **the very file that says 1.1.6**.
Two candidate explanations, neither established:

1. **R2 is serving 1.1.4** (mechanism 5 — the store the resolver trusts is stale), or
2. **`versionOf()` cannot parse this declaration** — `const` + single quotes, where the other
   workers' markers are `var VERSION = "..."` (drift logs `version-format non-semver VERSION: …`
   for four workers, so the parser is already known to be fragile), and the `1.1.4` came from a
   fallback path.

Falsifier: if the next scan still reports `canonical_version 1.1.4` while `worker.js` is unchanged
at 1.1.6, explanation 2 is live and the deploy will never converge on this fix — the VERSION
literal itself must be written in the form the resolver reads.

## 5. NEW — the cloud-ops source changed mid-session

`ADDENDUM-deploy-path-shadow` describes the clean fallback as `qnfo-cloud-ops/worker.js`
(sha `ca488a2c`, 129,467 B, VERSION `1.14.1-gtd-guard`). Live now:

```
qnfo-cloud-ops/worker.js — 129,457 B, sha 59dd468d, VERSION "1.14.1"
```

Different size, different sha, and the VERSION no longer carries the `-gtd-guard` suffix that the
deploy target `to_sha` still names. The file moved between the two readings. Whether that helps or
hurts convergence depends on `newer()`: `newer("1.14.1","1.14.1-gtd-guard")` → dotted parts equal
→ string compare → `"1.14.1" < "1.14.1-gtd-guard"` → false → not ahead → heal. So the prediction
still holds directionally, but it now rests on a VERSION string that is no longer the one the
prior analysis recorded.

## 6. NEW — a second unbounded-retry cluster

`self_heal_actions`, hourly, **33 occurrences each**:

| kind | workers |
|---|---|
| `drift` | `qnfo-agent-orchestrator`, `qnfo-archive`, `qnfo-ddocs-indexer`, `qnfo-email`, `qnfo-lifecycle`, `qnfo-paper-indexer` |
| `health-ver` | `qnfo-agent-orchestrator`, `qnfo-archive`, `qnfo-ddocs-indexer`, `qnfo-email`, `qnfo-gateway` |
| `version-format` | `companion-hub`, `errata-hub`, `fleet-exec`, `idea-hub` |

~33 rows = ~33 hours of hourly attempts that never converge. Ticket 692 covers the `fleet_deploys`
cluster; **this is a distinct one in `self_heal_actions`** and is not in any open ticket.

## 7. Standing, corrected

H1 (fix not live — `pipeline_state` absent; but the reason is path shadowing, not an absent route),
H2 (now: **19** NL rows, all `status='ok'`), H3, H4, H6, H9, H10, the P0 credential exposure, the
falsified "496 stuck `new`". Tickets 691–701 are open; 691, 692, 693, 694, 697, 699 and 701
substantially restate this session's and the prior session's findings.

**The backlog is 9 and rising, and this session closed 3 of the least severe items while
rediscovering what the fleet's own detectors had already filed.**
