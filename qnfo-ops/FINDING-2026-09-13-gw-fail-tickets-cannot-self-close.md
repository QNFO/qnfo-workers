# FINDING — the `[gw-fail]` / `MODEL-DEGRADED` tickets cannot self-close

Date: 2026-09-13
Author: qnfo-ops (ops-exec session, 07:16–08:05Z)
Status: **one defect confirmed; one defect RETRACTED. Read the banner.**

---

## BANNER 2026-09-13 (rev 2) — RETRACTION: there is no table mismatch

Revision 1 of this file claimed **two** defects in the closer. **Only one survives.**

The retracted claim came from reading `qnfo-ai-calibration/worker.js` — **which is a stale file.**
The deployed implementation is `qnfo-ai-calibration/deployed-current.worker.js` (bundle, VERSION
1.1.4, sha `3624a4dab743b22625fcf568ee4426835c9fb2f5`, 33,551 B), whose `closeIssue()` is:

```js
async function closeIssue(env, title, reason) {
  var r = await env.QNFO_AUDIT.prepare("SELECT id, description FROM agent_issues WHERE title = ?1 AND status = 'open' LIMIT 1").bind(title).first();
  if (!r) return false;
  var desc = (r.description || "") + " | auto-closed: " + reason;
  await env.QNFO_AUDIT.prepare("UPDATE agent_issues SET status = 'closed', description = ?2, updated_at = ?3 WHERE id = ?1").bind(r.id, desc, now()).run();
  return true;
}
```

It enumerates `agent_issues` **and closes `agent_issues`**. There is **no table mismatch**. The
deployed `fileIssue` likewise inserts into `agent_issues` (with `source='qnfo-ai-calibration'`,
`category='ai-calibration'`) and its dedupe is `WHERE title = ?1 AND status = 'open'` — it
**returns false rather than re-opening** a closed row. So there is **no re-open path for
`agent_issues`** either.

Live data corroborates the agent_issues variant as the running one: ids 654–660 carry
`source='qnfo-ai-calibration'` with the deployed bundle's exact description string and were created
2026-09-11T13:30:46–56Z, while `issue_ledger`'s `gwfail:*` rows froze at 2026-09-11T09:04:00.430Z
(`first_seen == last_seen`, `occurrences = 1`).

**Also retracted:** "the `agent_issues` producer is unidentified." It is `qnfo-ai-calibration`
(`source` column), and the mechanism is now read, not inferred.

**What survives: the unsatisfiable predicate.** Verified present in BOTH files.

**Separate provenance defect (new):** `worker.js` (35,742 B, `issue_ledger`-based) and
`deployed-current.worker.js` (33,551 B, `agent_issues`-based) are materially different
implementations that both claim **VERSION 1.1.4**. Reconcile them and bump the version.

---

## 1. THE CONFIRMED DEFECT — the close predicate is unsatisfiable

Deployed source, verbatim:

```js
var recent = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM ai_gateway_failures WHERE model = ?1 AND ts > ?2").bind(modelPart, t0 - 24 * 3600 * 1e3).first();
if (!recent || Number(recent.c || 0) === 0) await closeIssue(env, ttl, "no failures for 24h");
```

The close requires `COUNT(*) == 0` over a 24 h window. Live `ai_gateway_failures`:

| metric | value |
|---|---|
| total rows | 2515 |
| distinct `ts` (sweeps) | 385 |
| span | 2026-09-05T07:30:52.537Z → 2026-09-13T07:00:44.934Z (7.979 d) |
| sweeps/day | **48.25** |
| cadence | 29.8 min |
| rows/sweep | 6.53 |
| rows in any 24 h window | **≈ 315** |

Per-model presence over the last 48 sweeps: **glm-5.2 48, qwen3.8-27b 48, qwen2.5-coder-32b 48,
kimi-k2.6 48**, gemma-4-26b 47, bge-base-en-v1.5 47, kimi-k2.7-code 38.

So the count is ~48 for every affected model and **can never reach 0**. **The close branch never
fires** — a permanent ratchet that will accumulate phantom debt the moment a model recovers.

## 2. THE TICKETS ARE CURRENTLY CORRECTLY OPEN (not phantoms)

Every model holding an open `[gw-fail]` ticket also appears in the **latest** sweep
(ts `1789282844934` = 2026-09-13T07:00:44.934Z). Under the **fixed** predicate they **still would
not close** — the failures are continuous and real.

**Therefore the fix does not reduce the backlog.** It removes the ratchet; it does not manufacture
recovery. The current backlog is a genuine failure signal.

## 3. Why `ai_model_health` reports everything `ok` while tickets say degraded

`ai_model_health` live: **all 25 rows `ok`, `consecutive_failures = 0`**, `updated_at`
2026-09-13T07:15:57.857Z. Yet 18 open tickets claim degradation.

**Mechanism (source-verified).** In the sweep's per-class loop:

```js
var dispo = await env.QNFO_AUDIT.prepare("SELECT id FROM agent_issues WHERE title LIKE ?1 AND status IN ('wontfix','closed','resolved') LIMIT 1").bind("%" + b.model + "%").first();
if (dispo) continue;
```

The `continue` skips **the rest of the loop body — including the `ai_model_health SET
status='degraded'` block.** With 258 `wontfix` + 318 `closed` rows in `agent_issues`, the
substring match `'%' || model || '%'` finds a disposition for most models, so the degrade marking is
short-circuited. The probe path then writes `ok`. **The two signals are decoupled by an
early-`continue` that was intended only to suppress ticket filing.**

## 4. Per-model failure volume (latest sweep, `count` = failures in that sweep)

| model | status | error_class | count |
|---|---|---|---|
| `@cf/baai/bge-base-en-v1.5` | 429 | rate-capacity | **89** |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | 400 | content-shape | **42** |
| `@cf/qwen/qwen3.8-27b` | 400 | upstream | **18** |
| `@cf/moonshotai/kimi-k2.6` | 429 | rate-capacity | 6 |
| `@cf/moonshotai/kimi-k2.7-code` | 429 | rate-capacity | 2 |
| `@cf/google/gemma-4-26b-a4b-it` | 400 | image-input | 1 |
| `@cf/zai-org/glm-5.2` | 429 / 400 | rate-capacity / tool-args-json | 1 / 1 |

**Highest-value remediation is not the closer.** It is `bge-base-en-v1.5` 429 rate-capacity at
89/sweep (~4,300/24h) — the embedding tier.

## 5. Two failure signals that are not model defects

- **`gemma-4-26b-a4b-it` "image dimensions must be at least 10px"** — the probe's own fixture,
  decoded this session, is a valid PNG with **IHDR 10×10**. It sits exactly on the rejection
  boundary. Fix the fixture (16×16). Live routing impact: none (§3).
- **`qwen3.8-27b` "System message must be at the beginning."** — the model correctly rejects a
  malformed request. The defect is in the request builder. 14 failures/sweep are attributed to the
  model.

## 6. Second, larger, invisible backlog

`issue_ledger` aggregate: **open 290, total occurrences 2374, max 443.** No `ops_*` tool surfaces
this table. Top rows:

| title | status | occurrences | first_seen | last_seen |
|---|---|---|---|---|
| `AUTO-SWEEP: ops_d1_query` | open | **443** | 2026-09-04T06:16:48 | 2026-09-13T06:20:42 |
| `AUTO-SWEEP: web_fetch` | open | 351 | 2026-09-07T00:17:13 | 2026-09-12T18:22:31 |
| `AUTO-SWEEP: terminal research failure 45 -> agent_issues dup` | open | 115 | 2026-09-10T12:16:25 | 2026-09-13T06:17:33 |
| `AUTO-SWEEP: research pipeline: failed=1 stalled=0 published=` | open | 103 | 2026-09-09T12:15:48 | 2026-09-11T00:16:28 |

`AUTO-SWEEP: ops_d1_query` has been open 9 days at 443 occurrences. The stale `worker.js`
implementation's `fileIssue` **does** re-open resolved rows (`UPDATE issue_ledger SET …
status = 'open', resolved_at = NULL …`), and this was observed behaviourally: `issue_ledger` moved
open **288 → 290** and resolved **21 → 19** within ~25 minutes. That re-open defect is real — but it
belongs to the `issue_ledger` family, **not** to the deployed `agent_issues` path.

## 7. The patch

`qnfo-ai-calibration/apply-gw-closer-fix.mjs` — **revision 2**, commit
`d1d62a09b60627a23091c8c37da3d5ada398738c` (rev 1 was `f69201e7`, now superseded).

Single edit: bind the sweep's own window `lastTs` instead of 24 h. Rows are inserted with `ts = t0`
for every model that failed this sweep, so `ts > lastTs` is 0 exactly when this model produced no
failure this sweep. The close then **sticks**: the disposition gate finds the just-closed row and
`continue`s, suppressing re-filing.

Rev 2 also adds variant detection — it identifies whether `closeIssue` targets `agent_issues` (the
deployed variant) or `issue_ledger` (the stale one) and **refuses `--apply` on the stale variant**,
because deploying that file would regress the agent_issues behaviour. It handles both textual forms
of the predicate (`1e3` in the bundle, `1000` in the source) and refuses on ambiguity.

**Rev 1's edit B was wrong and has been removed.**

## 8. Residual uncertainty

1. **Which file is the build source of truth** is unresolved. `worker.js` and
   `deployed-current.worker.js` disagree materially at the same VERSION 1.1.4. Patching the wrong
   one is a regression risk — hence the refusal gate in §7.
2. **The fix cannot be validated until a model stops failing for a sweep.** All affected models
   currently fail every sweep, so closure is unobservable today.
3. **`gw_sweep_last_ts` was not read**, though the closer's window derivation depends on it.
4. **The last ~800 bytes of the deployed bundle** (33,551 B vs the 32,768 read cap) were not read —
   the tail of `calibration()` and the fetch handler.
5. **`issue_ledger`'s writer is unidentified.** The deployed `qnfo-ai-calibration` does not touch
   that table, yet it holds `AUTO-SWEEP:*` rows with a live `last_seen` of 2026-09-13T06:20:42.

## 9. Related

- `FINDING-2026-09-13-gw-fail-tickets-cannot-self-close-ADDENDUM.md` — verbatim errors per ticket
- `docs/FIX-telemetry-hours-2026-09-12.md` — separate live defect (B1), different worker
- `docs/FIX-listIssues-await-2026-09-08.md` — defect NOT reproducible as of 2026-09-13
- Workspace ledgers: `ops-workspace/audits/2026-09-13-PHASE{1..4}-*.md`
