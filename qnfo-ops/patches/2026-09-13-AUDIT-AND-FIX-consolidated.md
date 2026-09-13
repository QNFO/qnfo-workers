# AUDIT AND FIX — qnfo-ops durable job path, consolidated

Date: 2026-09-13T13:55Z · Author: qnfo-ops / ops-exec
Target: `qnfo-ops` v2.15.2 (`service_registry`, updated_at 2026-09-13T13:30:58.171Z)
Worker script `modified_on`: **2026-09-13T13:50:43.734297Z** (external actor — see §7)
Status: **STAGED — NOT APPLIED.** No deploy route exists on this endpoint (§7).

All figures are live `ops_d1_query` returns from this session. Rows: `ops_jobs` = 108,
`agent_issues` = 686, `ops_ai_log` = 1764.

---

## 0 — Corrections to this session's own earlier claims

Three claims made earlier today are falsified by re-measurement. Recorded first.

| earlier claim | verdict | counter-evidence |
|---|---|---|
| "`tool_log` truncates at exactly 3,000 chars" | **FALSIFIED as universal** | 4 rows exceed it, max **21,757 B**, and all 4 are `json_valid=1`. 37 rows sit at exactly 3000. No universal cap. |
| "`issue_ledger` binding missing — 303 open rows invisible to every ops tool" | **FALSIFIED** | `agent_issues`: open **12**, closed 320, wontfix 258, resolved 96 = 686. `ops_issues_list` returns exactly the 12 open rows and agrees with `backlog_status` openBacklog=12. Nothing is invisible. |
| "4 `ops_ai_log` rows have the 401 body as their prompt" | **CONFIRMED** | Exactly 4, all `ok=1`. See §4. |

A 4th earlier claim — that `/v1/jobs/:id` returning 404 means the route is missing — was
already retracted in Addendum 2; §7 re-confirms the route is registered and bearer-gated.

**Methodological note.** The 3,000-byte claim came from `SUM(length(tool_log)=3000)` = 37 without
checking the upper tail. The 303-open claim came from counting a different status set. Both are
the same error class: reading an aggregate without a counter-query.

---

## 1 — D17 mechanism, now established: a reaper, not a terminal write

**Measured.** 35 rows were promoted to `succeeded` inside a **16.0-second** window:

```sql
SELECT COUNT(*) n, MIN(updated_at) min_upd, MAX(updated_at) max_upd
FROM ops_jobs
WHERE status='succeeded'
  AND updated_at > '2026-09-13T13:51:00Z' AND updated_at < '2026-09-13T13:52:00Z';
-- 35 | 2026-09-13T13:51:19.770Z | 2026-09-13T13:51:35.662Z
```

Bucketed by second, `oldest_created` climbs monotonically while `updated_at` increments
second-by-second — a serial sweep, not organic completion:

| updated_at | rows | oldest created_at |
|---|---|---|
| 13:51:28 | 3 | 06:29:04 |
| 13:51:29 | 3 | 06:55:46 |
| 13:51:30 | 2 | 06:49:59 |
| 13:51:31 | 1 | 06:45:25 |
| 13:51:32 | 2 | 06:43:24 |
| 13:51:33 | 2 | 06:39:08 |
| 13:51:34 | 3 | 06:33:19 |
| 13:51:35 | 3 | 06:32:21 |

**The lag is ~20 minutes.** `job-2fdebc20f4ac75` (created 13:28:41, documented frozen in
`2026-09-13-D18-duplicate-job-execution.md`) was promoted at **13:51:23.292Z** — 22 min after its
last write. The 8 rows still `continuing` are **1.5–17 min** stale:

```sql
SELECT id, ROUND((julianday('2026-09-13T13:55:00Z')-julianday(updated_at))*1440,1) mins_stale,
       length(response) resp_len
FROM ops_jobs WHERE status='continuing' ORDER BY updated_at DESC;
-- job-a6aa8dc5065a63  1.5 min  4858 B   <- response already written
-- job-e06897c0ff7013  6.8 min  6134 B
-- job-220de5e6fea9c4  7.0 min  1314 B
-- job-0de34b1c03d96d  8.1 min  8006 B
-- job-f9477b83fac350 14.5 min  5616 B
-- job-545b0bc0fdcf57 15.4 min  2533 B
-- job-128bcb93fd358e 16.3 min  3226 B
-- job-39afebd4f5ea86 17.0 min  2471 B
```

**Revised statement of D17.** Not "frozen forever" (the earlier 26/32 counts) and not "fixed".
The status converges on a **schedule, up to ~20 minutes late**, never on write. Any client polling
with a <20 min timeout reads a finished job as a failure; the reaper is load-bearing and undocumented.

**Fix.** Write the terminal status in the same statement as the response, and add `terminal_at`.

```sql
ALTER TABLE ops_jobs ADD COLUMN terminal_at TEXT;
```

```js
// replace the response-only write
await env.DB.prepare(
  `UPDATE ops_jobs
      SET response=?, tool_log=?, status='succeeded', terminal_at=?, updated_at=?
    WHERE id=? AND status NOT IN ('succeeded','failed')`   // idempotent: reaper + writer cannot fight
).bind(response, toolLogJson, now, now, id).run();
```

Keep the reaper as a safety net, and make its threshold explicit and < any client timeout:

```sql
UPDATE ops_jobs
   SET status='succeeded', terminal_at=COALESCE(terminal_at, updated_at), updated_at=?
 WHERE status IN ('running','continuing')
   AND response IS NOT NULL AND length(response) > 0
   AND updated_at < ?          -- now - 5 minutes (was ~20)
```

---

## 2 — D19 (NEW): the fast-failure path writes no error

6 of 8 `failed` rows carry `error IS NULL`, all from 2026-09-12, all with a **uniform 16–23 s**
lifetime — far too short for a model timeout (the two rows that *do* have error text took ~35 min).

```sql
SELECT id, created_at, updated_at, ROUND((julianday(updated_at)-julianday(created_at))*86400) dur_s
FROM ops_jobs WHERE status='failed' AND error IS NULL ORDER BY created_at DESC;
-- job-dab978f5cd5b24  20 s   job-4053ae899fc0cb  18 s   job-611757757c9daa  16 s
-- job-b35176b8c6e349  23 s   job-239189cb9f7f6a  16 s   job-772fe9ff73b854  17 s
```

The payloads are ordinary prompts (`"Report the fleet size."`, `"Step 1: call the fleet_status
tool…"`), so this is not a malformed-input path. A ~17 s uniform failure with no recorded reason is
the signature of a **throw before the model call returns** (binding/tool-dispatch exception).

**Latent, not active:** no such row exists for 2026-09-13. Do not treat as an outage; treat as
uninstrumented failure. Fix:

```js
} catch (e) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE ops_jobs SET status='failed', error=?, terminal_at=?, updated_at=? WHERE id=?`
  ).bind(
    `${e?.name || 'Error'}: ${e?.message || String(e)}\n${String(e?.stack || '').slice(0, 1500)}`,
    now, now, id
  ).run();
}
```

---

## 3 — D20 (NEW): intermittent 3,000-byte `tool_log` truncation, mechanism unresolved

Within a single strategy (`job-workflow`, all 87 of today's rows), the log length is bimodal:

```sql
SELECT COUNT(*) n, SUM(length(tool_log)=3000) at_3000, SUM(length(tool_log)>3000) over_3000,
       MAX(length(tool_log)) max_tl
FROM ops_jobs WHERE created_at LIKE '2026-09-13%';
-- 87 | 37 | 4 | 21757
```

37 rows (42.5%) land at exactly 3,000 B; 4 exceed it and are valid JSON. Two writers with
different truncation behaviour is the leading hypothesis, but **I did not establish it** — the
discriminator is not visible in any column I can read, and all 87 rows share `strategy`.

**Fix (applies regardless of which writer is at fault).** Truncate the array, then stringify —
never slice a stringified JSON at a byte offset, which is what produces invalid JSON:

```js
const MAX = 20000;
let calls = toolLog, dropped = 0;
while (JSON.stringify(calls).length > MAX && calls.length > 1) { calls = calls.slice(0, -1); dropped++; }
const toolLogJson = JSON.stringify({ calls, dropped_calls: dropped, total_calls: toolLog.length });
```

Recording `dropped_calls` makes any future truncation visible in-band instead of silent.

---

## 4 — D21 (CONFIRMED): the durable path re-executes an auth-error body as a prompt

Exactly 4 `ops_ai_log` rows have, as their entire prompt, the literal error body:

```sql
SELECT id, ts, strategy, source, ok, substr(prompt,1,100) prompt_head
FROM ops_ai_log WHERE prompt LIKE '%Unauthorized%' ORDER BY ts DESC;
```

| id | ts | strategy | source | ok |
|---|---|---|---|---|
| ops-394fe2e80684f3 | 13:48:10.867Z | job-workflow | job | 1 |
| ops-fcb2fafaff7554 | 13:40:28.116Z | job-workflow | job | 1 |
| ops-bec89444fac435 | 13:35:20.629Z | agent-tools | mobile | 1 |
| ops-6b7b6db8fa02f0 | 13:34:31.152Z | agent-tools | other | 1 |

All four are `ok=1`: compute was spent producing an answer **to an error message**. Note the
8 other `%Unauthorized%` matches are false positives — the token appears in ordinary context text.

**Fix — refuse at the door.** Guard the durable ingress before enqueueing:

```js
const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
if (/^\s*`?\s*\{\s*"error"\s*:\s*"(Unauthorized|Forbidden)\b/.test(lastUser)) {
  return json({ ok: false, error: 'refused: prompt is an auth-error body (D21 guard)' }, 400);
}
```

The upstream cause is a poller following the retracted "GET /v1/jobs/:id with no bearer"
instruction; the guard makes the endpoint idempotent to that mistake.

---

## 5 — D18: idempotency key (unchanged, still correct)

Add the key so a re-submitted identical prompt returns the stored answer:

```sql
ALTER TABLE ops_jobs ADD COLUMN idem_key TEXT;
CREATE INDEX IF NOT EXISTS idx_ops_jobs_idem ON ops_jobs(idem_key, status);
```

```js
const idemKey = await sha256Hex(JSON.stringify(messages));
const prior = await env.DB.prepare(
  `SELECT id, response FROM ops_jobs WHERE idem_key=? AND status='succeeded' LIMIT 1`
).bind(idemKey).first();
if (prior?.response) return json({ ok: true, id: prior.id, cached: true, response: prior.response });
```

## 5b — Chain columns (D4)

```sql
ALTER TABLE ops_jobs ADD COLUMN parent_id TEXT;
ALTER TABLE ops_jobs ADD COLUMN chain_depth INTEGER;
CREATE INDEX IF NOT EXISTS idx_ops_jobs_status_updated ON ops_jobs(status, updated_at);
```

Without these, "chain depth 1/6" is prose in `payload._chain` and is not queryable — every
per-depth table in the parent docs was produced by parsing JSON, and is self-reported by the runner.

---

## 6 — The open backlog is 100% gateway failures, and the drain is correctly a no-op

`ops_issue_run` executed this session (`openBacklogBefore: 12`, `version 1.2.7`):

```
processed: 12 · closed: 0 · rechecked: 12 · escalated: 0 · noiseClosed: 0
```

All 12 rechecked as **CURRENT, real defects** — none are the health-availability class the drain
auto-closes. The drain behaved correctly; the backlog is not drainable by design.

Current 24 h gateway failure counts (from the drain's own re-probe):

| model | failures/24h | issue |
|---|---|---|
| `@cf/baai/bge-base-en-v1.5` | **3635** | 684 |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | **1974** | 682 |
| `@cf/qwen/qwen3.8-27b` | **845** | 678 |
| `@cf/moonshotai/kimi-k2.6` | 282 | 679 |
| `@cf/moonshotai/kimi-k2.7-code` | 94 | 680 |
| `@cf/zai-org/glm-5.2` | 93 | 681 |
| `@cf/google/gemma-4-26b-a4b-it` | 46 | 683 |
| **total** | **6969** | |

The embedding tier (bge-base, 3635) plus one retired/misconfigured coder model (1974) are 80% of
all gateway failures. Both are routing-table entries, not platform faults — the highest-value fix
in the fleet and it is not in this patch surface.

---

## 7 — Why this is STAGED, and the deploy question

`service_registry` for `qnfo-ops` lists **no deploy route**:

```
/health / /fleet /cost /manifest /analytics /telemetry /telemetry/analyze
/registry /registry/:service /registry/refresh /registry/register
/v1/models /v1/models/:id /v1/chat/completions /chat/completions /v1/responses
/v1/jobs /v1/jobs/:id
```

`qnfo-ops/worker.js` is **161,339 B**; the read tool caps at 32,768 chars and `github_file_write`
needs full file content, so a full-file contents-API write of this worker cannot be performed from
this endpoint. No `exec`/`wrangler` tool exists here.

**However — the worker was modified at 2026-09-13T13:50:43.734297Z**, i.e. during this session,
by an actor outside this endpoint's toolset. The registry self-registered v2.15.2 at 13:30:58Z.
**I cannot attribute that deploy.** It may be an autonomous fleet worker (`qnfo-autopilot`,
`qnfo-fleet-control`, `fleet-exec` all hold `scheduled` handlers) or a human session. Flagging it
because it means "no deploy path exists" is true of *this endpoint*, not of the fleet — and any
future session should verify what shipped at 13:50:43Z before applying these patches.

Unblocking requires one session with `wrangler deploy` from `qnfo-ops/`.

---

## 8 — Limits and counter-evidence

- One D1 snapshot under concurrent writers. `ops_jobs` grew 107→108 *during* this audit; every count
  is stale on arrival, and the act of querying is not neutral (each ops call writes rows).
- The ~20 min reaper threshold is **inferred** from which rows were and were not promoted at
  13:51:19–13:51:35Z. A reaper with a different rule (e.g. "all rows whose successor exists") fits
  the same evidence. `terminal_at` would settle it.
- D20's mechanism is explicitly **unresolved** — 37 rows at exactly 3000 B is not explained by any
  column I can read.
- D19 is latent; the 16–23 s signature is consistent with a pre-model throw but no stack was captured
  (that is the defect), so the cause is inference.
- The 4 D21 rows prove the loop fired; they do not prove how often it fires now, and the 12-row
  `%Unauthorized%` match is 67% false-positive — a reminder that substring counts on prompt text
  are not evidence.
- Nothing in this document has been executed against the worker. All six patches are untested code.
