# ADDENDUM 4 — gw-fail burst root cause: a resolve→refile loop, and the live worker is not either committed artifact

2026-09-13, qnfo-ops. Supersedes the "unresolved" note in ADDENDUM 3 §1.

## The evidence chain

All timestamps from `agent_issues`. `updated_at` is integer epoch for these rows.

| id | title | status | created | resolved at |
|---|---|---|---|---|
| 489 | `[gw-fail] 400 @cf/qwen/qwen3.8-27b` | resolved | 1788703212598 | 1788865624000 = **2026-09-08T11:07:04Z** |
| 644 | `TERMINAL research failure 45` | resolved | - | 1789284307000 = **2026-09-13T07:25:07.000Z** |
| 651 | `TERMINAL research failure 51` | resolved | - | 1789284307000 = **2026-09-13T07:25:07.000Z** |
| 654-660 | 7 × `[gw-fail] …` | resolved | 1789133446488-1789133456460 | 1789284308000 = **2026-09-13T07:25:07.800Z** |
| 670 | `[gw-fail] 429 @cf/moonshotai/kimi-k2.7-code` | resolved | 1789214453581 | 1789284308000 = **2026-09-13T07:25:07.800Z** |
| 678-684 | 7 × `[gw-fail] …` | **open** | 1789284660954-1789284673255 | - |

**Eight tickets were resolved in the same instant, 2026-09-13T07:25:07Z. The 7-row burst was filed
5 m 53 s later, at 07:31:00.954Z.**

## Why that proves the guard is absent from the live worker

`deployed-current.worker.js` (33,551 B, sha `3624a4da`) contains, inside `gatewayFailureSweep()`:

```js
var dispo = await env.QNFO_AUDIT.prepare(
  "SELECT id FROM agent_issues WHERE title LIKE ?1 AND status IN ('wontfix','closed','resolved') LIMIT 1"
).bind("%" + b.model + "%").first();
if (dispo) continue;
```

At 07:31:00Z, row **489 was already `resolved`** (since 09-08) with the byte-identical title
`[gw-fail] 400 @cf/qwen/qwen3.8-27b`. `LIKE '%@cf/qwen/qwen3.8-27b%'` matches it. `dispo` is truthy.
`continue` fires. **Row 678 must not exist under this code — and it does.**

The same title was filed three separate times (489 → 654 → 678). The header comment in that same
file states the intent explicitly: *"GW-FAIL-DEDUP-1 (2026-09-06): respect prior dispositions - skip
re-filing gw-fail when a wontfix/closed/resolved ticket already exists for the model (stops the
5-ticket-per-sweep regeneration loop)."*

⇒ **The live worker is an `agent_issues`-variant build predating GW-FAIL-DEDUP-1 (2026-09-06).**
It retains `fileIssue()`'s open-only dedupe — which is why no two rows *within* a burst share a
title, and why `glm-5.2` appears twice (429 and 400 are different titles) — but it has no
disposition gate, so a resolved ticket is immediately re-filable.

## The mechanism, stated plainly

1. Something drains/resolves the gw-fail tickets (here: a single event at 07:25:07Z, inside the
   `ops_jobs` burst window 07:18:46Z-07:26:40Z; five of those jobs are still `continuing`).
2. The next 30-min sweep finds no disposition to respect, the class still fails every sweep
   (`count >= 2 || prevCount > 0`), and re-files all 7.
3. The loop period is therefore **the drain cadence, not a fixed interval** — which is why the
   bursts land at 09-06, 09-11T13:30Z, 09-12T12:00Z and 09-13T07:31Z with no regular spacing.

**The guard would have broken this loop.** It is already written. It is not deployed.

## Two committed artifacts both claim VERSION 1.1.4 and disagree

| | `worker.js` | `deployed-current.worker.js` |
|---|---|---|
| size / sha | 35,742 B / `7a37a8ab` | 33,551 B / `3624a4da` |
| `fileIssue`/`closeIssue` target | **`issue_ledger`** (fingerprint + occurrences) | **`agent_issues`** |
| `TIER0_WA` entries | 7 (⇒ 10 probed) | 15 (⇒ 18 probed) |
| bge alias | **present** (`CF_TO_INTERNAL["@cf/baai/bge-base-en-v1.5"]`) | **absent** |
| `DEFAULT_VISION` | 4 entries (no `llama-3.2-11b-vision`) | 5 entries (includes it) |
| `VERSION` | `"1.1.4"` | `"1.1.4"` |

Live data settles which family is running: `agent_issues` rows are still being created, and
`worker.js` cannot write `agent_issues` at all (its `fileIssue` targets `issue_ledger`). So the live
worker is a member of the `deployed-current` family — **but an older member than the file in the
deploy path.** Neither committed artifact reproduces the observed behaviour.

## A second, independent defect — the closer can never fire

`apply-gw-closer-fix.mjs` (revision 2, 2026-09-13, sha `9d942cc7`) documents and patches it: the
auto-close predicate requires **zero** failures in a 24 h window —

```js
COUNT(*) FROM ai_gateway_failures WHERE model = ?1 AND ts > t0 - 24h  ==  0
```

— while every affected model appears in 47-48 of the last 48 sweeps, so the count is ~48 and never
reaches 0. **The close branch never fires in either variant.** That is why the only thing that ever
closes these tickets is an external drain — which is precisely the event that triggers the refile.

## Operational consequence (this reverses earlier advice)

**Do not run `ops_issue_run` against `[gw-fail]` rows until the guard is deployed.** Draining them
resolves the tickets, which is the trigger for the next burst. The drain does not reduce this
backlog; it regenerates it. The earlier recommendation to "run the drain and it will clear a few"
was wrong for exactly this class.

## What actually fixes it

One deploy, not a code change. Ship a build containing:
1. the `dispo` disposition gate (GW-FAIL-DEDUP-1), and
2. the `lastTs`-bound closer from `apply-gw-closer-fix.mjs` rev 2,

then reconcile `worker.js` and `deployed-current.worker.js` and bump `VERSION` off the duplicated
`1.1.4`. Until then the loop continues on whatever cadence the drain runs.

## Limits

- The `ops_jobs` rows that resolved the tickets at 07:25:07Z are not identified — I inferred the
  drain from the timestamp coincidence with the job burst window, not from a logged action.
- The live worker's exact version is still unread (the bundle exceeds the 32,768-char read cap).
  "Predates GW-FAIL-DEDUP-1" is deduced from behaviour, not observed in source.
- The burst at 09-06 (ids 478-484, now `wontfix`) predates the dedup fix and is consistent with it.
- `worker.js`'s `issue_ledger` rows froze at 2026-09-11T09:04:00.430Z (`occurrences = 1`), so that
  variant is not running — but I did not establish who deploys what, or when.
