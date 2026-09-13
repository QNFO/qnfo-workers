# ADDENDUM 3 — the self-heal loop's blind spot, demonstrated; and two more corrections

Author: qnfo-ops, 2026-09-13. Third and final addendum to
`FINDING-2026-09-13-d1-guard-false-positive.md`. Read with ADDENDUM 1 and ADDENDUM 2.

I checked for prior documentation **before** restating novelty this time. That changed two conclusions.

---

## D1. NEW EVIDENCE — the self-heal blind spot, now demonstrated rather than asserted

ADDENDUM 1 §5 argued that `telemetry_analyze` "cannot see this class by construction" because it
requires ≥2 errors with **no success since the last error**, while a guard false positive is
intermittent. That was an inference from the tool's own description.

Live ledger, `issue_ledger`:

| title | level | status | occurrences | last_seen |
|---|---|---|---|---|
| `[self-heal] tool ops_d1_query failing x130 (24h no recovery)` | **high** | **resolved** | 2 | **2026-09-13 06:48:18** |

So the ticket **was** filed — at high severity, for 130 failures in 24 h — and then **auto-resolved at
06:48:18Z, during this session**, because my own successful `ops_d1_query` calls supplied the
"recovery" the predicate looks for. My `telemetry_analyze(6h)` run returned `autoResolved: 1`, which is
that closure.

The defect is untouched. The loop files it, then the next successful call closes it. That is the
mechanism, now shown rather than argued: **for an intermittent false positive, the self-heal loop
functions as a laundering step** — it converts a standing high-severity ticket into a resolved one
without any change to the underlying behaviour.

This also means the earlier framing in ADDENDUM 1 §5 ("filed: 0") was **incomplete**: it filed nothing
*that run*, but a ticket from a prior run existed and was closed by it. I reported the run's return
values correctly and drew too broad a conclusion from them.

## D2. WEAKENED — a better-documented competitor explains the 443 rows

ADDENDUM 1 §3 cited 443 occurrences of `AUTO-SWEEP: ops_d1_query` as this guard's blast radius. Two
things now cut against that:

1. **The ledger cannot distinguish the classes.** `last_detail` for that row is the literal string
   `ops_d1_query` — the tool name and nothing else (re-verified). The row carries no error text, so the
   linkage is not "unproven", it is **unfalsifiable from this data**. Any future session asserting it
   would be guessing.
2. **A documented competitor with a higher base rate exists.** `qnfo-ops/docs/RUN-CODE-HARDENING.md`
   Defect 3 (2026-09-10) records a *different* `ops_d1_query` rejection class with a verbatim example:

   ```
   {"ok":false,"rejected":true,"error":"add LIMIT n (aggregate exempt)"}
   ```

   That guard fires on a trivially common mistake — forgetting `LIMIT` — and I hit it myself this
   session before any mutation-keyword rejection. It is the more plausible dominant cause of a
   443-occurrence row.

**What survives:** the mutation-keyword guard's existence and behaviour, proven by two probes
(`replace()` rejected; a keyword inside a string literal rejected). **What does not survive:** using
the 443 figure as its blast radius. Corrected.

## D3. The repo-staleness pattern is systemic, documented, and qnfo-ops is instance #4

ADDENDUM 2 §C1 withdrew my version-divergence novelty on the strength of
`qnfo-ops/patches/2026-09-13-DEPLOY-PATH-and-version-regression.md` §3. That withdrawal stands, and the
scope is wider than that one document implied.

`qnfo-ops/docs/REDTEAM-ADDENDUM5-2026-09-13.md` §E1.1 and §E3 establish it as a **fleet-wide pattern**:

| worker | repo source | deployed |
|---|---|---|
| `qnfo-ai` | `5.21.5` | **`5.25.1`** (4 versions behind) |
| `qnfo-ai-calibration` | `TIER0_WA` 7 entries | **15 entries** |
| `ai-health-prober` | `2.3.2` | **`2.3.1`** |
| `qnfo-ops` | `worker.js` `2.14.0`, `deployed-current.worker.js` `2.13.0` | **`2.15.1`** |

ADDENDUM 5 §E3 states the consequence directly: *"A fleet whose canonical source is not its deployment
cannot be audited from source alone, and every source-based claim in this session's predecessor records
inherits that error bar."* That is the correct generalisation, and it applies to my guard finding too —
which is exactly why ADDENDUM 1 §1 could not confirm the guard from source.

## D4. Two of the fleet's own documents contradict each other on the deploy path

- `qnfo-ops/patches/2026-09-13-DEPLOY-PATH-and-version-regression.md` §1, **rev 2**, explicitly corrects
  the earlier claim: *"The earlier claim 'no deploy path exists' is wrong — one does, and it runs
  hourly. Corrected."* It documents `qnfo-fleet-deploy`, `POST /redeploy`, token-gated, plus the
  kill-switch and auto-heal flags.
- `qnfo-ops/docs/REDTEAM-ADDENDUM5-2026-09-13.md` §E3 still asserts: *"**No deploy tool** (`wrangler
  deploy` needs `CLOUDFLARE_API_TOKEN`)."*

Both live in `qnfo-ops/`. An operator reading ADDENDUM 5 would conclude no deploy path exists and would
never look for `qnfo-fleet-deploy`. The rev-2 document is the corrected one; the other is not marked
superseded on this point. Recommend a cross-reference, since this is precisely the class of stale-claim
propagation this whole audit has been correcting.

## D5. Rule-12 drift — reported, not changed

Rule 12 fixes the canonical **tool-loop soft budget at 300s** and states it must never be lowered.

`qnfo-ops/wrangler.toml` (sha `8680c4ac`) declares `[limits] cpu_ms = 300000` — matching the canonical
**CPU ceiling** exactly. But the same file's comment describes a *different* budget:

> *"so the 180s soft wall budget (OPS_LOOP_DEADLINE_MS, OPS-TIME-BUDGET-1) is the binding constraint"*

**180s against a canonical 300s.** `RUN-CODE-HARDENING.md` Defect 2 already reported this (deployed
`180000` vs canonical `300000`) and correctly refused to change it, since rule 12 forbids agents
altering settings. It is still unresolved.

Precision on what I verified: I read the *comment* in the repo copy of `wrangler.toml`. The file is
6,529 B and my read truncated at 6,000, so if `OPS_LOOP_DEADLINE_MS` is assigned in a `[vars]` block it
was in the unread tail. **I did not verify the deployed value.** Reported as drift to investigate, per
rule 12's "report drift; do not change settings".

## D6. A live landmine for this endpoint, which I did not hit

`RUN-CODE-HARDENING.md` Defect 1 (confirmed 2026-09-10): **the `run_code` sandbox clock is frozen** —
`Date.now()` and `performance.now()` are pinned to isolate creation and never advance. A time-bounded
loop therefore never exits, burns to the 300s CPU ceiling, and dies with CF Error 1102 **returning no
results at all**. The tool description says "provide finite code" but never warns about this.

Checked against my own work: **no `run_code` payload I sent this session used `Date`, `performance`, or
any time function** — all three were pure string/arithmetic transforms. So no result reported in this
session is affected by the frozen clock. Recording it because the next agent to write
`while (Date.now() - t < N)` here gets a silent hang, and that is worth knowing before it happens.

## D7. Other live self-heal tickets seen while checking (not this session's scope)

| ticket | level | occurrences |
|---|---|---|
| `tool github_file_write failing x49 (168h no recovery)` | high | 6 |
| `tool email_respond failing x15 (168h no recovery)` | high | 7 |
| `tool parse_link failing x4 (168h no recovery)` | medium | 13 |
| `tool save_memory failing x3 (168h no recovery)` | medium | 9 |
| `tool run_command failing x2` | medium | 6 |

Two notes. `github_file_write failing x49` coexists with my **seven successful writes this session**,
which corroborates `REDTEAM-CLOSEOUT-2026-09-13.md` §1's withdrawal of that "persistent failure"
blocker: it is intermittent, not dead. And `save_memory failing x3` confirms `save_memory` is a real
fleet tool elsewhere — while still being **unbound on this endpoint**, which is why the staged memory
corrections in `audits/2026-09-13-memory-corrections.md` remain unapplied.

---

## Status of the finding after three addenda

**Stands:** the read guard rejects the `replace()` scalar and mutation keywords inside string literals
(two executed probes); it is a raw-text scan behaviourally; the deployed source is unreadable from here;
the self-heal loop closes this class on the next success (now demonstrated, D1).

**Withdrawn or corrected across the addenda:** the version divergence as novel (C1); "no deploy tool" as
phrased (C2); the read-ceiling blocker as novel (C3); the 443-row blast radius (D2); "filed: 0" as a
complete account of the self-heal behaviour (D1).

**Unchanged and still the point:** `reading.q08.org/p/2026-09-12-essay-3bf32c8a197d2196` serves the
defective text verbatim. `QRI-4` is staged, verified, **not applied**.
