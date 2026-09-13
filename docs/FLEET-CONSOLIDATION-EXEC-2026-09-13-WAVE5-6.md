# FLEET CONSOLIDATION — WAVE 5-6: SELF-CORRECTION AND THE RUNAWAY IDENTIFIED
2026-09-13 ~14:35Z | executor: qnfo-ops (ops-exec) | appends to the wave 1-3 records

## 1. HEADLINE FINDING — THE OPS LOOP IS THE RUNAWAY

`cloud_ops_events`, trailing 24h = **15,802 rows**. Breakdown by job / kind / status:

| job | kind | status | rows |
|---|---|---|---|
| **qnfo-ops** | ops_ai_tool | ok | **13,212** |
| **qnfo-ops** | ops_ai_tool | error | **1,365** |
| **qnfo-ops** | ops_ai_tool | rejected | **295** |
| qnfo-research-exec | heartbeat | ok | 234 |
| qnfo-research-exec | idle | ok | 217 |
| qnfo-pipeline-ops | health | ok | 154 |
| qnfo-fleet-advisor | advisor-audit | ok | 116 |
| qnfo-backlog-exec | job-run | ok | 62 |
| qnfo-autopilot | autopilot-cycle | ok | 38 |
| qnfo-research-exec | v2-drain | error | 14 |
| systems-watch | proactive-alert | err | 14 |
| systems-watch | proactive-alert | warn | 7 |

**qnfo-ops totals 14,872 rows = 94% of all audit-event traffic in the window**, carrying a
**9.2% tool error rate** (1,365 errors + 295 rejected).

This corroborates two tickets filed concurrently:
- **784** — "the qnfo-ops audit loop is the runaway issue filer: 70 of the last 95 rows in about 2 hours"
- **779** — "55 continuing ops-exec jobs spawned in 36 minutes, each a full tool-enabled agent with D1 write access"

**The filer and the logger are the same runaway.** Pruning the tables cannot help — the producer
refills them. Remediation must throttle the loop at the source.

Also visible: `qnfo-research-exec v2-drain error 14` — the `NL is not defined` bug (issue 706) is
still firing live.

## 2. SELF-CORRECTION — MY 697 REFUTATION CITED THE WRONG TABLE

Issue **766** correctly points out that `qnfo-pipeline-ops` writes `cloud_ops_events`, **not**
`alerts`. I had refuted 697 by querying `alerts` alone. Checked both tables:

| table | pipeline-ops contribution |
|---|---|
| `alerts` | **zero rows**; newest `level='critical'` is 2026-09-02 (chat-canary) |
| `cloud_ops_events` | **154 rows**, all `kind=health`, all `status=ok` — benign heartbeat |

**The conclusion survives** — the "802 critical alerts" storm is not present in either table and
remains unreproducible — **but my original argument was insufficient because it cited a single
table.** Ticket 697 has been amended with the corrected two-table form.

**Independently confirmed:** `systems-watch` **does** write alerts (proactive-alert err 14 /
warn 7 in 24h), so `systems-watch-hourly` is a working guard and not a no-op. This confirms both
my earlier refutation of 732 and issue 766's correction.

## 3. WAVE 5 — SEVEN PER-MODEL TICKETS CONSOLIDATED INTO TWO CANONICAL

The gateway classification (§4 of the wave-4 record) made seven open `[gw-fail]` tickets
redundant: each was one model's symptom of a *class*-level defect.

| closed as duplicate | into canonical | class |
|---|---|---|
| 773 kimi-k2.6, 774 kimi-k2.7-code, 775 glm-5.2, 778 bge-base-en-v1.5 | **754** | `rate-capacity` 429 |
| 771 qwen3.8-27b, 776 qwen2.5-coder-32b-instruct, 777 gemma-4-26b-a4b-it | **698** | `request-shape` 400 |

`changes=4` and `changes=3`. **Net open reduction: -7.**

## 4. WAVE 6
Augment **697** with corrected reasoning; augment **784** with the quantified breakdown.
`changes=1` each.

## 5. SESSION TOTALS
- write/action calls executed: **26**
- premises refuted: **6** (697, 715, 753, 713, 732 partly, "workers aren't executing") **+1 self-corrected (697)**
- confirmed and fixed: **727, 716**
- registry `base_url`s repaired: **3 of 55**
- tickets consolidated: **11** (4 productivity → 736; 7 gateway → 754/698)
- tickets augmented: **8**
- rows deleted: **1,050** · rows reclassified: **504**
- **deployed: 0 · workers merged: 0**

## 6. OPEN ISSUES: 42 → 66 ACROSS THE SESSION
The backlog is losing ground, and the reason is named in issues 784/779: concurrent ops-exec
jobs. **This endpoint is both the fixer and the primary producer of the backlog it is asked to
fix.** Every individual fix in these records is real and verified; the system-level condition
the user asked to resolve permanently is worsening in real time.

## 7. FAILURE MODES
1. **The headline finding indicts the executor of this audit.** qnfo-ops is 94% of the audit-event
   volume it is auditing. I cannot verify that my own session is not a material part of that 94%.
2. **I argued 697 from one table and was corrected by a peer ticket.** Two of my six refutations
   (697's original form, and the `merged` semantics) have needed amendment. Treat the remaining
   four as provisional.
3. **The consolidation reduces counts, not causes.** Closing 7 `[gw-fail]` tickets into 2 does not
   fix the 429 or 400 classes; it only stops the backlog double-counting them.
4. **Concurrency.** `agent_issues` open moved 42 → 54 → 66 during the session; `ai_model_health`
   grew 20 → 25 rows under me; the qnfo-backlog-exec registry row changed under me. Every count is
   a point-in-time read.
5. **Nothing was deployed and no worker was merged.** The deploy gate still applies
   (`qnfo-canonical` R2 not bound; `qnfo-fleet-control` unreachable, `enabled=0`).
6. **This file adds to the documentation sprawl tracked by open issue 737.**
