# QNFO Fleet Stock Prompts — reusable autonomous-execution commands

Version 2026-09-29 · owner `qnfo-ops` · canonical store `R2 qnfo-skills/prompt-stores/`
Machine-readable sibling: `prompt-stores/stock-prompts-fleet-2026-09-29.json`
Schema: DeepChat `PromptSchema` (see `prompt-stores/README.md`). Int timestamps mandatory.

---

## 0. The loop grammar

Every stock prompt below is a different entry point into ONE loop:

```
MEASURE -> TRIAGE -> FIX -> VERIFY -> CLOSE -> RE-MEASURE
```

| Step | Non-negotiable |
|---|---|
| MEASURE | numbers come from a tool call, never memory |
| TRIAGE | rank by blast radius x evidence strength, not recency |
| FIX | remove the root cause, not the symptom |
| VERIFY | same-turn tool output; a claim without one is not done |
| CLOSE | close predicate must be **monotone** (issue 1297) — re-check after close |
| RE-MEASURE | re-read the same metric that opened the item |

A turn that ends by announcing the next step is a failed turn. End with the deliverable, or one `INCOMPLETE: <what remains and why>` line.

---

## 1. Existing CMDs — reuse as-is

Verified present in `prompt-stores/customPrompts-canonical.json` (9 entries, 2026-08-20 merge):

| CMD | Use when |
|---|---|
| `CMD CONTINUE` | session resume; recover plan state and execute |
| `CMD EXECUTE` | override hesitation; PLAN/EXECUTE/RED-TEAM/VERIFY/ITERATE with WBS codes |
| `CMD RED TEAM` | read-only 5-adversary audit; do NOT modify |
| `CMD RED TEAM SUB` | parallel subagent red-team (3-5 reviewers) |
| `CMD RESEARCH` | research Phase 0/1 due diligence (gate: Phase 1 after Phase 0 commit) |
| `CMD SKILLS UPDATE` | kaizen cycle over skills |
| `CMD PUBLISH` | research Phase 5: publish + D1 + deploy |
| `CMD CLOSEOUT` | git verify, handoffs row, wbs_state, continuation prompt |
| `CMD DEPLOY` | Cloudflare deploy + live verification |

**Gap:** all nine are *session*-scoped. None is *fleet*-scoped. The five below close that gap.

---

## 2. New fleet-grade CMDs

### `CMD DRAIN` — close the backlog with evidence, not with optimism
```
CMD DRAIN: MEASURE (backlog_status + ops_issues_list all) -> GROUP by category/priority ->
for each row: fetch its own evidence -> classify {already-fixed, real, stale, duplicate} ->
close ONLY with a same-turn verifying probe; annotate the rest -> ops_issue_run(confirm:true) ->
RE-MEASURE backlog_status and report delta. Never close on inference.
```
Tools: `backlog_status` `ops_issues_list` `ops_d1_query` `ops_issue_run` `fleet_status`
Done-when: open count re-read and stated, every closure carries its verifying probe, remainder has an owner.

**Known trap (measured 2026-09-29):** `backlog_status` reports `agent_issues` only (46). The real surface is **87 open items across 14 registers** (`task_dod_register` 15, `outreach_queue` 26, ...). Always read the full register inventory, not the single headline count.

### `CMD SELFHEAL` — turn failures into tickets, tickets into fixes
```
CMD SELFHEAL: telemetry_report(24) -> telemetry_analyze(hours) -> for each filed issue:
reproduce the failure, read the real error text, fix root cause, re-run the failing call,
close with evidence. Report tools whose failure count did NOT drop.
```
Tools: `telemetry_report` `telemetry_analyze` `ops_issues_list` `ops_d1_query` `ops_d1_write`
Done-when: failure-rate delta per tool stated; persistent failures escalated with a named blocker.

### `CMD FLEET` — systemwide sweep across every bound resource
```
CMD FLEET: fleet_status -> service_discover (registry) -> per bound surface:
D1 (8 dbs: table + row counts), R2 (4 buckets: object counts), Vectorize (5 indexes: vector counts),
KV (equation-cache), crons (fleet_crons last_fired vs expr) ->
report a table of surface | state | evidence -> file issues for every divergence.
```
Tools: `fleet_status` `service_discover` `ops_d1_query` `r2_list` `cf_analytics`
Done-when: every bound surface has a state + evidence row; divergences filed.

### `CMD IMPROVE` — kill the single largest failure class
```
CMD IMPROVE: pull top failing tool by count over 24h -> read 10 real error strings ->
name the root cause in one sentence -> apply the SMALLEST fix that removes the class ->
verify the same call now succeeds -> record before/after counts. One class per run.
```
Tools: `telemetry_report` `ops_d1_query` `cf_worker_read` `cf_worker_deploy` `run_code`
Done-when: before/after counts for the same tool, same query shape.

### `CMD GUARD` — prove the guards still fire
```
CMD GUARD: for each guard (trigger/constraint/policy) in guard_registry:
inject a synthetic failing case -> assert the guard fired -> assert no ticket was filed for
a class that must be suppressed -> record pass/fail per guard.
```
Tools: `ops_d1_query` `ops_d1_write` `dr_validate_schema`
Done-when: per-guard pass/fail with the synthetic row id as evidence.

---

## 3. Invocation contract

- A bare `CONTINUE` / `EXECUTE` / `RESUME` is **licensed autonomy** on `qnfo-ops`: no per-step confirmation for read-only/compute; `confirm:true` only for the gated verbs (`ops_issue_run`, `email_respond`, `email_mark`, `r2_delete`, `kv_delete`).
- Never emit a tool payload for the client to run. All execution is server-side.
- Every done-claim carries a same-turn tool result. No result, no claim.
- Settings are immutable (OPS-SETTINGS-IMMUTABLE-1): ctx 1048576 / out 393216 / loop 300s. Long work goes async via `/v1/jobs` — never by lowering a ceiling.

## 4. Known self-inflicted failure class (drive it to zero)

`ops_d1_query` is the top failing tool (**137 failures / 24h**, 2026-09-29) and the errors are almost entirely **agent schema-guessing** — `no such column: errs | job | schedule | status | severity | name`. The fix is to consult `d1_schema_index` (repaired 2026-09-29: the `col` column was back-filled from `cols`, 444 rows) **before** writing a query — not to guess and retry.
