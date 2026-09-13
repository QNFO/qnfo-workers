# FINDING — the four issues filed at 14:24Z are the 5th instance of a predicate-less class

Date: 2026-09-13T15:1xZ · Author: qnfo-ops / ops-exec
Method: title-matching each filed issue against the **deployed** predicate set in
`qnfo-backlog-exec` v1.3.0 (committed this session, `038e6088`), plus `agent_issues` timestamps.
The prediction in §5 is falsifiable and timestamped.

## 1. The predicates that exist in v1.3.0

`run()` closes a row only if one of these matches:

| predicate | trigger |
|---|---|
| `isHealthAvailability` | `/health\|heartbeat\|availability\|endpoint down\|is down\|reachable/` **and** a second health-ish match, plus a resolvable `workerTarget()` |
| `isExceptionClass` | `/alert-storm\|exception\|error-burst\|worker-exception\|recurring fail/` + worker target |
| `isModelHealth` | `/^MODEL-DEGRADED\b/` |
| `[ai-cal]` probe-failing | `/^\[ai-cal\]\s+model probe failing:\s*(\S+)/` |
| `[gw-fail]` | `/^\[gw-fail\]\s+(\d+)\s+(\S+)/` |
| zenodo | `/version_queue\s+id=(\d+)/` |
| research | `/^TERMINAL research failure\b/` |

Everything else falls through to a `recheck` that can never close anything:

```js
await env.AUDIT.prepare("UPDATE agent_issues SET updated_at=?1 WHERE id=?2 AND status='open'")...
rechecked++;
detail.push({ ..., note: name ? ("probe target " + name) : "no probe target" });
```

## 2. Applying that to the four issues filed 14:24Z

| issue | matches a predicate? | outcome |
|---|---|---|
| **#693** `WORKER-HEALTH-FALSE-530` | **yes** — "HEALTH" satisfies both health regexes; `workerTarget()` resolves `qnfo-ai` | will be **closed** on re-probe (see §4) |
| **#694** `OBSERVABILITY-MULTIMODULE-CANONICAL` | **no** | permanent `recheck` |
| **#691** `DEPLOY-CANONICAL-CORRUPT` | **no** | permanent `recheck` |
| **#692** `DEPLOY-HEALER-NO-BACKOFF` | **no** | permanent `recheck` |

**Three of the four have no resolution predicate.** They will be selected, marked `rechecked`, and
never close — consuming three of the 40-row budget on every pass, indefinitely.

## 3. Fifth instance of a documented pattern

The worker's own version history is a list of this defect being found and patched:

| version | class that had no predicate |
|---|---|
| v1.2.5 / v1.2.6 | `OPEN-ISSUES%` advisor-noise snapshots |
| v1.2.7 | `MODEL-DEGRADED` / `[gw-fail]` / `[ai-cal]` |
| v1.2.9 | zenodo `version_queue` / `TERMINAL research failure` |
| **v1.3.0 (this session)** | D17/D19 reaper — addressed no title class |
| **next** | **`DEPLOY-*` / `OBSERVABILITY-*` (this finding)** |

The pattern is structural: a new issue *prefix* is introduced by whichever worker files it, and the
drain silently treats it as unclosable. Nothing warns when a new title class appears — it is
discovered only by noticing `closed:0, rechecked:N` recurring.

## 4. #693 will be closed on re-probe — arguably the wrong outcome

`#693` matches `isHealthAvailability`, `workerTarget()` resolves `qnfo-ai`, and
`probeHealthyViaLog(env,'qnfo-ai')` reads `fleet_probe_log` — measured this session at **81/81 ok,
last 200 @ 14:16:30.415Z**. So the drain will close #693 noting *"health availability re-probe
PASS"*.

That inverts the ticket's own complaint: **#693 says the health check is wrong**, and the drain
closes it because a *different, correct* probe says the worker is healthy. The ticket retires; the
prober defect stays. This is why closing on a proxy predicate is hazardous in general.

## 5. Falsifiable prediction

The drain cron is **daily at 01:10 UTC** (`cron = "10 1 * * *"`), and `agent_issues.created_at ==
updated_at` for all four rows (epoch `1789308851-852` = `14:24Z`) — **none has been rechecked yet**.
Therefore at approximately **2026-09-14T01:10Z**:

1. the drain processes all four;
2. **#693 closes** (probe PASS), with the prober defect unfixed;
3. **#691, #694, #692 do NOT close** — each `rechecked`; the first two with
   `note:"probe target qnfo-cloud-ops"` / `"probe target qnfo-observability"`, #692 with
   `note:"no probe target"`;
4. the group summary reads `{closed: 1, rechecked: 3, escalated: 0}`.

If any of #691/#692/#694 closes then, **this finding is wrong**. Check with:

```sql
SELECT id, title, status, updated_at FROM agent_issues WHERE id IN (691,692,693,694) ORDER BY id;
```

## 6. The fix exists and I deliberately did not apply it

A `DEPLOY-*` predicate is straightforward and evidence-based: close when `fleet_deploys` shows
`ok=1` for the `workerTarget()` in the title, keep open with an informative note otherwise. That
would resolve #691 and #694 the moment their transports are fixed — the same condition-scoped shape
as v1.2.7/v1.2.9.

**I did not implement it**, for a specific reason: these are **high-priority tickets describing
unfixed production defects**, and a predicate that closes them on a *proxy* signal (a deploy
succeeding, a probe passing) can retire the ticket while the defect survives — precisely what §4
shows happening to #693. What the backlog is *for* is a policy decision, and the agent that would
benefit from a shorter backlog should not make it unilaterally.

## 7. Limits

- Matching is by regex against **title + description**, so a differently-worded future ticket in
  the same class may match or miss unpredictably. This analysis holds for these four exact rows.
- §5 assumes the v1.3.0 `run()` executes at 01:10Z. Production is still **1.2.8** (promotion
  pending) — but the predicate set relevant here is **unchanged between 1.2.9 and 1.3.0**, so the
  prediction holds either way.
- I did not read `agent_issues.description` for these rows; matching used the titles returned by
  `ops_issues_list`, which is what the drain selects on first.
