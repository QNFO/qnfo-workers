# ADDENDUM 6 — the 2026-09-11 stop window is now four signals wide, and the evolve loop returns empty proposals

Author: qnfo-ops (ops-exec), 2026-09-13 ~14:25Z. Live tool returns.
Upgrades `docs/ADDENDUM-3-2026-09-13-integration-contract-and-self-correction.md` §3 from **three**
signals to **four**.

---

## 1. A fourth subsystem stops, and it stops first

| # | time (2026-09-11) | signal | source |
|---|---|---|---|
| 1 | **14:07:35.954Z** | last `evolve_candidates` row (**id 43**) | `evolve_candidates` |
| 2 | 14:17:37.615Z | last `integration_state` snapshot | `integration_state` |
| 3 | 14:30:12.906Z | last `pipeline-supervisor` event (517 total) | `cloud_ops_events` |
| 4 | 14:44:33.502Z | `qnfo-research-supervisor` deployed (`modified_on`) | `fleet_status` |

Four independent subsystems stop inside **37 minutes**. The evolve loop stops first, then the
integration contract's own monitor, then the supervisor's event stream, then a deploy lands.

This is now the strongest causal evidence the session produced. It remains **correlation**: I did
not read the deployed code, and the 14:44 deploy post-dates the first three stops, so it cannot be
the cause of them. But four unrelated writers going quiet in a 37-minute window is not plausibly
four coincidences, and the direction of the evidence points at an event between 14:07 and 14:44.

`evolve_candidates` holds **43 rows**; id 43 is `status: "proposed"` and has not advanced since.

## 2. NEW — the evolve loop's proposals are unusable, and the reason is visible in the row

`evolve_candidates` id 43 (`worker: jnl-referee`, model `@cf/moonshotai/kimi-k2.6`):

- The loop's instruction, verbatim from the stored proposal: *"improve a Cloudflare Worker by adding
  or fixing a small non-functional detail while keeping behavior identical. … Return ONLY the
  complete modified source."*
- The model's returned message has **`"content": ""`** — empty — with `"finish_reason": "length"`.
- The entire 4,096-token completion budget was consumed by **`reasoning_content`**, which is stored
  in full (a long deliberation about whether the source was truncated, ending mid-sentence).

So the evolve loop asked for a complete modified source and received **an empty string**, because a
reasoning model spent the whole budget thinking and never emitted the answer. `usage:
{prompt_tokens: 4839, completion_tokens: 4096}` — exactly at the cap.

The prior candidate, id 42 (`jnl-watch`), is `rejected-parse` — yet its stored proposal **is** valid
JavaScript (a complete `jnl-watch` module with `export { index_default as default }`). So the
rejection was not a parse failure of the content shown.

Two consecutive failures, two different mechanisms: empty content (id 43) and a spurious
`rejected-parse` (id 42).

## 3. The evolve loop targets workers the registry does not contain

Both candidate targets — **`jnl-referee`** and **`jnl-watch`** — are in the probe-only set of 38
names absent from the 55-worker listing, and neither has a `service_registry` row.

So the self-evolution loop is proposing modifications to workers that, under ADR-2026-011 ("if it is
not in D1, it does not exist"), **do not exist** — and it does so using `@cf/moonshotai/kimi-k2.6`,
one of the seven models carrying live gateway failures (282 hits/24h per the drainer's own count).

## 4. Limits

- The four timestamps are last-write times from four different tables; they are **not** evidence that
  one process caused the others, only that the writers went quiet together. No log correlates them.
- id 43's emptiness is read from the stored `proposal` JSON; whether the caller treated it as a valid
  candidate is not determined — its `status` is `proposed`, which suggests it was stored regardless.
- I did not read the evolve loop's code, so "spent the budget on reasoning" is inferred from
  `finish_reason: "length"` + non-empty `reasoning_content` + empty `content` + `completion_tokens:
  4096`, not observed.
- id 42's `rejected-parse` may refer to a different field or a post-processing step I did not see.
- `fleet_runs` has no `ts` column, so I could not add it as a fifth signal.
- Still blocked, unchanged: no D1 write, no mail-config tool, no deploy tool, no branch-create
  (no PR), `qnfo-canonical` R2 unbound.
