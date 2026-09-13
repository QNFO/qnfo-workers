# D18 — the durable job path re-executes the same prompt (3× observed)

Date: 2026-09-13 · Author: qnfo-ops / ops-exec
Status: **new defect**, distinct from D17 but caused by the same missing terminal-state write.
Evidence window: 2026-09-13T12:00Z → 13:31Z. All figures are live `ops_d1_query` returns.

## 1. Evidence — identical attachment prompts executed 3× each

`ops_ai_log`, grouped by the `<FILE_NAME>` embedded in the prompt:

| attachment | runs | strategy | timestamps |
|---|---|---|---|
| `pasted_text_1789305364263.txt` | **3** | job-workflow ×3 | 13:22:47.172Z · 13:28:42.762Z · 13:29:57.079Z |
| `pasted_text_1789305370398.txt` | **3** | job-workflow ×3 | 13:23:00.471Z · 13:29:08.573Z · 13:30:57.084Z |
| `pasted_text_1789305375154.txt` | 1 | agent-tools | 13:16:38.427Z |

All ten `job-workflow` runs in the window returned **`ok:1`** — these are duplicate *successes*, not
retries after a failure. Strategy/source mix over the same window:
`agent-tools/mobile` 8 (8 ok) · `agent-tools/other` 6 (6 ok) · `chat/mobile` 1 (1 ok) ·
`job-workflow/job` **10** (10 ok) = 25 runs in ~1.5 h.

## 2. Link to D17

`ops_jobs`: **32 rows `status='continuing'`, all 32 carrying a non-empty `response`**, newest
`updated_at` 13:29:57.026Z. Columns are
`id, status, model, strategy, payload, response, tool_log, error, created_at, updated_at` (no
`prompt` column). The `payload` holds a full `messages` array — an entire replayed conversation
transcript, e.g. `job-2fdebc20f4ac75`.

**Mechanism (hypothesis, labelled as one):** the terminal status is never written, so a client
polling `GET /v1/jobs/:id` never observes a terminal state; the payload already carries the
accumulated transcript; the client re-submits, and the durable path re-executes the whole prompt.
The observed cadence (13:22 → 13:28 → 13:29, interleaved across two files) fits retry-on-no-terminal
better than three independent user sends.

## 3. Impact

1. **3× compute on identical work** — neurons and CPU spent three times for one answer.
2. **Non-idempotent side effects.** Any write performed inside the job (GitHub commit, email send,
   D1 mutation) is executed three times. This is a correctness risk, not just cost.
3. **It feeds D17.** Re-execution creates more chain-midpoint rows that never terminate, which
   creates more apparent non-terminal states to retry on — a positive feedback loop.

## 4. Fix (worker-side, same patch surface as D17)

- Write `response`, the terminal status, and a new `terminal_at` column **in one statement**.
- Add a reaper for rows with a response and no update.
- Add an **idempotency key** — a hash of the payload's `messages` — so a re-submitted identical
  prompt returns the stored `response` instead of re-executing.

## 5. Counter-evidence and limits

- Two entries sharing a `FILE_KEY` *could* in principle be distinct user sends. From this data alone
  I cannot distinguish a client retry from a genuine repeat. The **3× for both files, interleaved**,
  is what makes retry the better explanation — not proof.
- `ops_ai_log` has no client/session id column, so correlation is by prompt text only.
- The duplication is proven **only for `job-workflow`**. `agent-tools` runs are 1-per-prompt in this
  window (the user's own attachment ran exactly once).
- The mechanism in §2 is inferred from state shape plus cadence; no client-side or edge log was
  read to confirm the retry.
