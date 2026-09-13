# ADDENDUM 3 — the integration contract exists (and stopped at 14:17 on 09-11); plus a self-correction

Author: qnfo-ops (ops-exec), 2026-09-13 ~14:10Z. Every figure is a live tool return.

Two things: **my ADDENDUM-2 criticism was partly wrong**, and the fleet's integration architecture is
not merely declared in ADRs — it is **computed, scored, and stored** in `integration_state`, where it
**stopped 47 hours ago**.

---

## 1. SELF-CORRECTION — `ops_ai_log` refutes ADDENDUM-2 §3

ADDENDUM-2 claimed: *"the fleet is not short of logging … It logs into ad-hoc tables and never into
the ADR-mandated structured trail."* That is **partly false**, and the check was one table away.

`ops_ai_log` — schema: `id, ts, model, strategy, complexity, domain, prompt, response,
prompt_tokens, completion_tokens, cost_usd, latency_ms, tool_calls, source, ua, streamed, ok`

| probe | live |
|---|---|
| rows | **1,737** |
| newest `ts` | **2026-09-13T13:35:20.629Z** (current) |
| per-invocation structure | **`tool_calls` is a JSON array** — `[{"name":"ops_d1_query","ok":false,"summary":"…"}, {"name":"fleet_status","ok":true,…}, …]` |
| cost/latency captured | `cost_usd`, `latency_ms`, `prompt_tokens`, `completion_tokens` |

So there **is** a structured, per-tool-invocation, machine-readable execution trail, and it is live —
including rows for this session, with `ok` flags per call.

**Corrected position:** ADR-2026-009's *substance* (structured execution evidence per tool
invocation) is met. The defect is narrower and different in kind: **the ADR names `audit_trail` and
`session_records`, and those two are effectively dead** (16 and 10 rows, `audit_trail` last written
2026-09-04). The live equivalent is named `ops_ai_log`. That is **spec drift** — an ADR that names
tables nobody writes, while the real trail accumulates under another name — not an absence of
structured evidence.

This is the same "two writers, one fact" pattern the session found repeatedly, now turned on my own
conclusion. My ADDENDUM-2 §3 self-criticism about *form* was correct as to `audit_trail` and
`session_records`; it was wrong as to the fleet's logging generally.

## 2. The integration architecture is a computed contract — `integration_state`

Not an ADR, not a document: **32 snapshots** of a generated JSON contract.

| field | value |
|---|---|
| snapshots | **32** |
| first | 2026-09-10T11:42:38.151Z |
| **last** | **2026-09-11T14:17:37.615Z** |

Each snapshot declares **11 producer→consumer chains** with a medium and a numeric ceiling, plus a
coverage block, a decay block, opportunities, and a weighted score. Representative chains:

| chain | producer → consumer | medium | ceiling |
|---|---|---|---|
| fleet-pulse | fleet-scheduler → fleet-executor | `fleet_runs` | ≥3 runs / 15 min |
| errata | errata-watch → errata-respond/publish | `errata_queue` | pending ≤ 10 |
| ideas | edge/idea-miner → idea-triage | `idea_proposals` | new ≤ 30 |
| intents | calendar-api → intent-orchestrator | `intents` | pending ≤ 20 |
| version-drain | paper-reviser → research-exec | `version_queue` | drafted ≤ 5 |
| outreach | register/ops → outreach | `outreach_queue` | pending ≤ 20 |
| issues | ops gateway → kaizen | `agent_issues` | open ≤ 10 |
| alerts | observability → ops digest | `alerts` | undigested ≤ 5 |
| email | SMTP gateway → email workers | `emails` | unprocessed ≤ 10 |
| research | supervisor/radars → research-exec | `research_queue` | queued/active ≤ 10 |
| revisions | paper-reviser → research-exec | `paper_revision_log` | queued ≤ 8 |

Scoring (verbatim, id=1): `{"total":93,"chains":100,"coverage":92,"freshness":77,"weights":"chains
50% / coverage 30% / freshness 20%"}`. Coverage block: `{"fleet_size":79,"probed":82,"invocated":5,
"traced":58,"probe_gap":0,"trace_gap":21}`.

Two notes. First, **the architecture the earlier plan inferred is already formalised here** — 11
named chains with ceilings is a stronger statement than my "one writer per fact" rule. Second,
`integration_state` carries **yet another fleet size: 79, later 80** — against 55 listed, 80 probed,
92 repo dirs. The census has a sixth number.

## 3. NEW — `integration_state` stopped in the same 27-minute window as two other failures

| time (2026-09-11) | event | source |
|---|---|---|
| **14:17:37** | **last `integration_state` snapshot** | `integration_state` |
| **14:30:12** | **last `pipeline-supervisor` event** (517 total) | `cloud_ops_events` |
| **14:44:33** | `qnfo-research-supervisor` deployed (`modified_on`) | `fleet_status` |

Three independent signals stop inside a **27-minute window**. The monitor of the integration contract
itself died first. This is the sharpest correlation the session produced, and it points at a single
event around 2026-09-11T14:17–14:44Z rather than three unrelated faults.

It remains **correlation, not proof** — I did not read the deployed code, and the research-supervisor
deploy at 14:44 post-dates the 14:17 stop.

## 4. NEW — `governance_kernel`: 13 gates, ACTIVE, with an unarmed rollback

| field | value |
|---|---|
| `kernel_version` | `2026-09-01.1` |
| `status` | **ACTIVE** |
| `fingerprint` | `a6419b9a575f5d2c5287c7fd24d76c18e5a3b8f869788d6f9186529432af01d6` |
| `ratified_by` | `agent-autonomous (user directive 2026-09-01: 'not a user decision'; QUESTION-AUTONOMY-1 + MANUAL-INTERVENTION-1)` |
| `ratified_on` | 2026-09-01 08:39:03 |
| **`last_known_good_id`** | **`null`** |

Gates (13): `ENGLISH-ONLY`, `BLAME-EXTERNAL-1`, `CHANGE-AUDIT-FIRST-1`, `THIN-CLIENT-MANDATE`,
`TEST-SEND-EXTERNAL-1`, `EMAIL-SUBJECT-SPAM-TOKENS-1`, `MANDATE-1-EXECUTION`, `MANDATE-2-PLAN`,
`MANDATE-3-REDTEAM`, `MANDATE-4-SKILL`, `MANDATE-5-PHASES`, `PERSONAL-QNFO-SEPARATION-1`,
`GOVERNANCE-KERNEL-SELF`.

`autonomy_boundary` states the loop commits via *"versioned write + **rollback to
last_known_good**"*. **`last_known_good_id` is `null`** — the declared rollback target does not
exist, so the rollback half of the kernel's own contract is unarmed. One row, ratified 12 days ago,
never amended.

## 5. NEW — `freshness_guard` is live, and its thresholds mask the outage

16 signals, **all checked at 2026-09-13T13:16:13Z** (live). Verdicts: **12 `fresh`, 2 `idle`,
1 `stale`, 1 `unknown`.**

| signal | table | age_h | threshold | status |
|---|---|---|---|---|
| `agent_issues` | `agent_issues` | 0.3 | 96 | `fresh` |
| `research_queue` | `research_queue` | **64.1** | **72** | **`fresh`** |
| `version_queue` | `version_queue` | 50.9 | 72 | `fresh` |
| `outreach` | `outreach_log` | **268.3** | 72 | `idle` |
| `pipeline_status` | `pipeline_status` | **160.5** | 24 | `idle` |
| `amh_coverage` | `ai_model_health` | null | 26 | **`stale`** |
| `handoffs` | `handoffs` | null | 72 | **`unknown`** (checked 2026-09-11T16:46:11Z) |

**The monitor masks the very outage the session found.** `research_queue` sits at 64.1h against a
72h threshold, so it reads **`fresh`** — while the research pipeline has been dead since
2026-09-11 and `version_queue` id=18 has been failing on retry. A 72h threshold cannot detect a 47h
break. Likewise `agent_issues` reads `fresh` (age 0.3h) while the `integration_state` contract
measures the same table by **count** (open ≤ 10) — two monitors, same table, different verdicts.

## 6. Limits

- **`integration_state` is 47h stale, so §2 describes the contract as of 2026-09-11T14:17:37Z**, not
  today. Chain counts (`issues` n=4) have since changed (open is now 10).
- The §3 correlation is temporal only; the deploy at 14:44 post-dates the 14:17 stop, so the stop is
  not attributable to that deploy without reading code I cannot reach.
- The `integration_state` JSON was read truncated at 32,768 chars for later rows; chains, coverage
  and score are from id=1 and the first ~9 snapshots.
- `governance_kernel` holds **1 row**; whether `last_known_good_id = null` is a defect or an
  intentional "no rollback yet" state is not determinable from the row.
- `freshness_guard` thresholds are read, not evaluated — I did not verify each `age_hours` against
  its source table independently.
- Still blocked, unchanged: no D1 write, no mail-config tool, no deploy tool, no branch-create
  (no PR), `qnfo-canonical` R2 unbound.
