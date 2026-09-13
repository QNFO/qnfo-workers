# REV9 — Re-audit of my unsorted samples, and a volatile table

Date: 2026-09-13. Closes the gap REV8 §6 flagged: the main audit's sections built
on `LIMIT` without `ORDER BY`. Three surfaces re-read in recency order.

---

## 1. `ai_gateway_failures` — citation was the oldest slice; substance holds

The main audit §3/§4 read `SELECT * FROM ai_gateway_failures LIMIT 5` and got
ids **1–5** — the *earliest* rows, timestamped 2026-09-05. I quoted them as the
live failure classes.

Re-read in recency order (`ORDER BY id DESC`), the newest rows are ids
**2618–2627**:

| model | status | count | error_class |
|---|---|---|---|
| `@cf/baai/bge-base-en-v1.5` | 429 | 79 | rate-capacity |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | 400 | 42 | content-shape |
| `@cf/qwen/qwen3.8-27b` | 400 | 18 | upstream |
| `@cf/moonshotai/kimi-k2.6` | 429 | 6 | rate-capacity |
| `@cf/moonshotai/kimi-k2.7-code` | 429 | 2 | rate-capacity |
| `@cf/zai-org/glm-5.2` | 400 | 1 | tool-args-json |
| `@cf/zai-org/glm-5.2` | 429 | 1 | rate-capacity |
| `@cf/google/gemma-4-26b-a4b-it` | 400 | 1 | image-input |

**Same classes, same models** — and these counts match the calibration
`gateway-sweep` detail verbatim (REV4 §3: `x42 content-shape`, `x18 upstream`,
`x6 rate-capacity`, `x2`, `x1 tool-args-json`, `x1 image-input`). So the main
audit's conclusion survives; only the citation slice was stale. The table is
large (2,627+ rows) and the newest are current.

---

## 2. `ai_model_health` — confirmed, and refined to an exact set

Re-read by `gateway_failures DESC`:

| model_id | status | gateway_failures | consecutive | last_probe_ts |
|---|---|---|---|---|
| qwen2.5-coder-32b | ok | **10,836** | 0 | 1789145063740 |
| kimi-k2.6 | ok | 516 | 0 | 1789308978958 |
| glm-5.2 | ok | 362 | 0 | 1789145063740 |
| gemma-4-26b | ok | **258** | 0 | 1789144284117 |
| deepseek-r1-qwen-32b | ok | 0 | 0 | 1789145063740 |
| glm-4.7-flash | ok | 0 | 0 | 1789145063740 |
| gpt-oss-120b | ok | 0 | 0 | 1789308978958 |
| deepseek-v4-flash-wa | ok | 0 | 0 | 1789308978958 |
| deepseek-v4-pro-wa | ok | 0 | 0 | 1789308978958 |
| kimi-k2.7-code | ok | 0 | 0 | 1789308978958 |

**The probe is frozen for exactly five models.** `1789145063740` =
2026-09-11T16:44:23Z; `1789308978958` = **2026-09-13T14:16:18Z** (fresh).

Frozen (09-11T16:44, ~2 days): `qwen2.5-coder-32b`, `glm-5.2`,
`deepseek-r1-qwen-32b`, `glm-4.7-flash`, and `gemma-4-26b` (its own stamp,
`1789144284117` = 2026-09-11T16:31:24Z, ~13 min earlier).

Fresh (09-13T14:16): `kimi-k2.6`, `gpt-oss-120b`, `deepseek-v4-flash-wa`,
`deepseek-v4-pro-wa`, `kimi-k2.7-code`.

So the calibration probe stopped touching **a specific subset** on 2026-09-11
and has run normally for the rest since. That is more precise than the main
audit's "several rows are stale": it is a fixed set of five, all frozen within
13 minutes of each other, and the split is not random — the frozen set includes
every model carrying a non-zero `gateway_failures` count except `kimi-k2.6`.

**New fact:** `gemma-4-26b` has **258** gateway failures, which the main audit
did not list.

---

## 3. `fleet_error_state` — 8 rows at 14:08Z, **0 rows now**

The main audit §7 cited "`fleet_error_state` (8 rows, most recent seen_at):
`personal-api` 2, `qnfo-container-executor` 3, `calendar-api` 1,
`job-market-watch` **9**, ...".

Re-read minutes later:

```sql
SELECT COUNT(*) FROM fleet_error_state;   -- n = 0
SELECT * FROM fleet_error_state ORDER BY rowid DESC LIMIT 10;  -- rowCount: 0
```

**The table is empty.** It held 8 rows at ~14:08Z and 0 rows by ~14:25Z, inside
one session.

This is a finding, not a glitch to note and move past: **an error-state table
that empties itself cannot track persistent errors.** Anything read from it is a
point-in-time snapshot with no history, which is why the durable records —
`fleet_issue_log` (occurrence counts) and `fleet_audit_runs` (per-run history) —
are the only surfaces where a recurring defect is visible as recurring.

It also means the main audit §7's list of 8 workers with errors **does not
reproduce**, and I cannot tell from here whether those 8 errors were resolved,
rotated out, or simply dropped by a rewrite.

---

## 4. Net effect on the main audit

| section | verdict |
|---|---|
| §3 gateway-sweep pass-through | **holds** — newest rows match the probe detail verbatim |
| §4 model health / stale counters | **holds, refined** — exactly 5 of 10 probes frozen at 09-11T16:44 |
| §7 `fleet_error_state` 8 workers | **does not reproduce** — table now empty; volatile |
| §8 tool failures | unaffected (aggregates, not samples) |
| §9 alerts | unaffected (`GROUP BY` aggregates) |
| §11 deploy record | unaffected (`ORDER BY ts DESC` was used) |

One substantive addition: the frozen-probe set in §2 above.

---

## 5. Limits

- **I still have not re-read every main-audit section.** §1 (deploys),
  §5 (research queue), §6 (queues), §10 and §12 were read with `ORDER BY` or as
  aggregates, so they are lower risk, but I did not verify each.
- **`fleet_error_state`'s 0 rows may be a rewrite window**, not a permanent
  state. I caught it empty once. I cannot distinguish "cleared" from "rebuilt
  between cycles" from a single observation.
- **The frozen-probe set's cause is unknown.** I observe that five models share
  a probe timestamp within 13 minutes and five others are fresh; I did not read
  the probe code, so "the probe stopped touching them" is a description of the
  data, not a mechanism.
- **`gemma-4-26b`'s 258 failures were absent from the main audit** — a genuine
  omission, not a stale read.
