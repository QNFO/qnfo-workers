# FINDING — qnfo-signal-loop: 110 signals permanently stuck; the consumer's filter and its terminal transition are inconsistent

Date: 2026-09-13 · Author: qnfo-ops / ops-exec
Worker: `qnfo-signal-loop` · census member · `worker.js` 7,666 B (sha `cdf8d33a`) · deployable from qnfo-ops
All figures live `ops_d1_query` / `github_repo_read` returns from this session.

---

## 1. The defect, verified exactly

```
SELECT evidential_weight, COUNT(*) n, MIN(created_at), MAX(created_at)
FROM signals WHERE status='new' GROUP BY evidential_weight;

  evidential_weight = 0   n = 110   oldest 2026-09-12T09:48:50.053Z   newest 2026-09-13T06:01:02.955Z
```

`SELECT COUNT(*) new_zero_weight, SUM(...=0) zero_w FROM signals WHERE status='new'`
→ **110 and 110.** Every single stuck row has weight zero. Still growing (newest 06:01:02Z today).

**Mechanism, from source (read in full):**

```js
// runReentry — writes the row
const eps = oq.length > 0 ? 0.9 : 0;
INSERT OR IGNORE INTO signals (..., evidential_weight, ..., status, ...)
  VALUES (..., eps, ..., "new", ...)          // <-- status='new' even when eps === 0

// runConsume — reads the rows
SELECT * FROM signals
 WHERE source='artifact_reentry' AND status='new' AND evidential_weight > 0
 ORDER BY created_at LIMIT 25
```

A signal with no extractable open questions is written `status='new'` with `evidential_weight=0`.
`runConsume` excludes it via `evidential_weight > 0` and therefore **never marks it consumed**. It
is invisible to the consumer and permanent in the queue.

**The producer and the consumer disagree about what `status='new'` means.** `runReentry` treats it as
"written"; `runConsume` treats it as "eligible". Rows failing the eligibility test never leave the
state.

## 2. This worker is the producer of the 09-12 intake burst — confirmed by an exact field match

`runConsume` inserts:

```js
INSERT INTO idea_proposals (name, idea, contact, status, ip_hash, created_at)
VALUES ("auto-reentry", "Re-entry from " + ..., "auto", "new", "l8-reentry", ...)
```

`idea_proposals` grouped:

| name | contact | ip_hash | status | n | oldest | newest |
|---|---|---|---|---:|---|---|
| auto-reentry | auto | l8-reentry | triaged_hold | **496** | 2026-09-12T09:50:02.378Z | 2026-09-12T09:50:44.140Z |

A 42-second burst of 496 rows, matching the producer's hardcoded values exactly. Up to
25 signals × 15 questions = **375 rows per hourly run**, with no cap and no dedup.

**Status of that burst now:** all 496 are `triaged_hold`, and `idea_proposals WHERE status='new'` = **0**.
The 09-12 intake stall has been triaged; it is no longer an open stall.

## 3. Why the stall was silent — and it is not the boundary gate

- `signal_worker_boundary` has **37 rows**, and the row
  `worker='qnfo-signal-loop' AND source='artifact_reentry' AND permitted=1` **exists**. The consumer is
  not blocked.
- `agent_issues` with `title LIKE '%INTAKE-STALL%'`: **4 rows, all `closed`, all 2026-09-06**, titled
  `INTAKE-STALL: N idea_proposals stuck 'new'` (N = 8, 9, 12, 14). **None after 09-06.**
- The canonical `qnfo-pipeline-ops` v0.5.4 title is
  `INTAKE-STALL: idea_proposals stuck new (single-issue, self-closes on clear)` — a **different string**
  from the live tickets. Independent confirmation that live ≠ canonical for that worker.
- `qnfo-pipeline-ops` is **census-excluded** (`pipeline_state` absent, 0 drift rows), so its
  v0.5.3/v0.5.4 dedup fixes cannot deploy. See `FINDING-2026-09-13-deploy-is-census-gated.md`.

So the watchdog that would have filed the 09-12 ticket belongs to a worker that is frozen.

## 4. `wrangler.toml` declares no triggers — yet the worker runs

`qnfo-signal-loop/wrangler.toml` (269 B, sha `01f8b7b8`):

```toml
name = "qnfo-signal-loop"
main = "worker.js"
compatibility_date = "2026-09-01"

[[d1_databases]]
binding = "LIVING_PAPER"
...
[[d1_databases]]
binding = "QNFO_AUDIT"
...
```

**No `[triggers]` / `crons` section.** Yet `runReentry` is demonstrably executing (signals newest
2026-09-13T06:01:02.955Z, today). A schedule exists at the platform level that the canonical config
does not describe. **The canonical toml and the deployed triggers disagree** — config drift in a
census member, and a hazard for any redeploy from canonical: a `wrangler deploy` from this toml would
publish a worker with **no schedule**, silently stopping it.

Separately, the `scheduled()` handler gates all work behind `if (event.cron === "0 * * * *")`. Any
mismatch between the platform cron and that literal string makes the worker a **silent no-op** —
no error, no log, nothing. Given §4's drift, that gate is a live hazard.

## 5. The exact fix (diagnosed, deliberately NOT applied)

**Edit A — `runReentry`, stop writing unprocessable rows as eligible.** Replace the status bind:

```js
.bind(sigId("artifact_reentry", doi), nowIso(), "artifact_reentry", doi,
      String(p.title || "").slice(0, 500), JSON.stringify(oq), eps, "research",
      "new", nowIso())
```
with
```js
.bind(sigId("artifact_reentry", doi), nowIso(), "artifact_reentry", doi,
      String(p.title || "").slice(0, 500), JSON.stringify(oq), eps, "research",
      (oq.length > 0 ? "new" : "skipped_no_questions"), nowIso())
```

**Edit B — `runConsume`, sweep the existing backlog.** Insert after `await ensureSchema(env);`:

```js
try { await env.QNFO_AUDIT.prepare(
  `UPDATE signals SET status='skipped_no_questions'
    WHERE source='artifact_reentry' AND status='new'
      AND (evidential_weight IS NULL OR evidential_weight <= 0)`).run(); } catch (e) {}
```

**Edit C — bump `VERSION` to `1.1.1-zeroweight-sweep`** so the deployer's comparator sees a change.

`skipped_no_questions` is not a new coinage: `runConsume` already reports a counter by that name.

## 6. Why I did not ship it — the risk calculus, stated plainly

- **The impact is LOW.** 110 inert rows accumulating in one table. No outage, no user-visible effect,
  no incorrect output. Nothing is blocked by them.
- **The only way to ship to a census member is to write `worker.js` in full.** `github_file_write`
  requires complete content; `github_repo_read` caps at 32,768 chars. So shipping means
  **hand-reproducing 7,666 bytes of minified source**. A single character error deploys within the
  hour and breaks a working worker — **a new harm strictly larger than the defect being fixed.**
- **The repo's own convention agrees.** `PATCH-2026-09-13-intake-drain.mjs`: *"Committed as a patch
  script rather than a wholesale rewrite of worker.js … hand-reproducing a production worker is a
  worse risk than patching it."*
- Note the trap this creates: for a **census** worker a `PATCH-*.mjs` is **inert by path** (the
  deployer reads `worker.js` only), and for a **non-census** worker a `worker.js` write is **inert by
  census**. Only a `worker.js` write to a census member ships — which is exactly the risky case here.

So: verified diagnosis, exact patch, deliberately unshipped. The decision is a risk judgement, not a
blocker, and a human `wrangler deploy` from a checkout removes the reproduction risk entirely.

## 7. Limits

- **I did not run the fix**, so I have not verified that `skipped_no_questions` rows stop being
  selected. The claim rests on reading the two SQL statements, which are unambiguous.
- **The `wrangler.toml`-vs-platform trigger discrepancy is inferred** from the toml having no
  `[triggers]` while the worker demonstrably runs. I did not read the deployed schedule (no tool for
  it), so I cannot say what the actual cron string is, or whether the `event.cron` gate currently
  passes or fails.
- **I did not test whether zero-weight signals are the ONLY reason `runConsume` stopped producing
  proposals.** It is the best-supported explanation (110/110 weight-zero, consumer filter excludes
  them) but a second cause is not excluded.
- **The 496-row burst being signal-loop's output rests on a field match** (`name`/`contact`/`ip_hash`
  all hardcoded and all matching). No producer log was read.
- **`idea_proposals` has no FK to `signals`**, so I cannot prove row-by-row provenance.
- The 09-12 stall's triage (`triaged_hold` on all 496) was performed by another actor; I did not
  verify the triage decisions were correct, only that the rows left `status='new'`.
