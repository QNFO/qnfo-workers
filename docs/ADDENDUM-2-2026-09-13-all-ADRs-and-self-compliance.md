# ADDENDUM 2 — all nine ADRs read; the FK mandate is in an ACCEPTED ADR, and this session violates two of them

Author: qnfo-ops (ops-exec), 2026-09-13 ~14:05Z. Completes the ADR sweep begun in
`docs/ARCHITECTURE-GROUNDING-2026-09-13-ADRs-and-the-integration-gap.md`, which read only the 6
most recent of 9. Every figure is a live tool return.

---

## 1. The foreign-key mandate is already ACCEPTED — it is not merely "proposed"

The grounding doc placed the FK mechanism in `ADR-2026-012` (`proposed`). That understated it.
**ADR-2026-008 — `accepted` — already mandates it**, dated 2026-07-13, one entry earlier:

> **ADR-2026-008 — `accepted` — "D1-Canonical: Dynamic Records Policy — D1 as Single Source of Truth"**
> *Decision:* "ALL dynamic/accumulating records SHALL use D1 as the single source of truth. R2 is
> for static/versioned files only (papers, PDFs, images, bootstrap tools, skill backup copies).
> **Sessions SHALL NOT write audit/handoff/state/decision records to R2 objects.** D1 tables SHALL
> enforce foreign key constraints with WBS codes."

So the requirement to enforce FKs is an **accepted decision from July**, and ADR-2026-012 is only
its implementation detail. The violation is against accepted doctrine, not a proposal.

The other three previously unread:

> **ADR-2026-007 — `accepted`:** "All LLM execution SHALL be tracked using hierarchical WBS codes in
> D1 normalized tables. … All D1 records and R2 project files MUST reference WBS codes as primary
> identifiers."
>
> **ADR-2026-009 — `accepted` — "Structured Execution Evidence: No Free-Text Audit Records":**
> "Every tool invocation that produces mutable output SHALL insert a structured record into D1
> `audit_trail` with: session_id, wbs_code, subtask_code, action (tool name), evidence (JSON with
> exit_code/output_hash/timestamp). **Free-text audit summaries are replaced by D1 `session_records`
> with structured fields** (execution_ratio, total_tasks, completed_tasks, files_changed JSON,
> commits JSON)."
>
> **ADR-2026-010 — `accepted`:** "Every `tasks_wbs` row SHALL have a corresponding GitHub Issue in
> QNFO/QWAV with the WBS code in the title."

Status tally: **8 `accepted`/`active`, 1 `proposed`** (ADR-2026-012).

## 2. ADR-2026-009 is comprehensively violated

| ADR-2026-009 requires | live state |
|---|---|
| a structured `audit_trail` row per mutable tool invocation | **`audit_trail` = 16 rows**, newest **2026-09-04 12:13:48** — 9 days stale |
| `session_records` with structured fields | **`session_records` = 10 rows** |
| `evidence` as "JSON with exit_code/output_hash/timestamp" | the stored `evidence` values are **free-text prose** — e.g. *"KG cleanup 590 draft zenodo-shells + multi-DOI node collapse deferred: requires authoritative DOI resolution…"* |

`audit_trail` by action: `deployed` 8 (last 2026-08-20), `completed` 4 (last 2026-09-04),
`blocked` 3 (last 2026-09-04), `archived` 1 (2026-07-13).

Meanwhile the fleet is **not** short of logging — `cloud_ops_events` holds **15,316** `ops_ai_tool`
events, newest 2026-09-13T13:31:03Z. It logs into ad-hoc tables and never into the ADR-mandated
structured trail. The requirement has been dead for nine days while 15,000+ events accumulated
elsewhere.

## 3. This session violates ADR-2026-008 and ADR-2026-009

Stated plainly, because the doctrine applies to me:

- **ADR-2026-009 — "No Free-Text Audit Records."** This session produced **8 free-text markdown
  documents** in `docs/` plus **3 free-text workspace records** — and **zero** structured
  `audit_trail` rows and **zero** `session_records` rows. By the letter of an accepted ADR, my
  entire deliverable form is non-compliant. The audit value is real; the *form* is the violation,
  and it is the same form every prior session used.
- **ADR-2026-008 — "Sessions SHALL NOT write audit/handoff/state/decision records to R2 objects."**
  My workspace records were written to `ops-workspace`, which is described by this endpoint as an
  **"R2-backed virtual filesystem"**. Three of them (`audits/2026-09-13-FULLSTACK-INTEGRATION-EXECUTED.md`,
  `-CENSUS-AND-REPLAY-RESOLVED.md`, `-PUBLISH-PIPELINE-AND-SILENT-SUBSYSTEMS.md`) are audit records
  in R2.

So the count of violated accepted ADRs is **three**: 008 (FK constraints + no audit records in R2),
009 (structured evidence), 011 (universal registry). ADR-2026-012 — which would enforce 008 and
011 — remains `proposed`.

This is the session's own finding turned on itself: **the fleet's problem is not that it lacks
doctrine, or that it lacks detectors. It is that accepted doctrine is not mechanically enforced,
and every actor — including this endpoint — keeps producing the non-compliant artefact because
nothing rejects it.** ADR-026 is the only ADR that closed this loop, and it did so with a
default-deny `.gitignore`, not with a document.

## 4. Scale note

`tasks_wbs` holds **149 rows**. ADR-2026-010 requires each to have a GitHub Issue in QNFO/QWAV with
the WBS code in the title. I cannot verify the GitHub side from this endpoint, so I make **no**
claim about compliance — only that the obligation covers 149 rows.

## 5. Limits

- Compliance verdicts in §2/§3 rest on **row counts and recency**, not on reading the writers. A
  writer may exist that simply has not run; I did not find one.
- `audit_trail` may be one of several structured trails. `ops_ai_log` is this endpoint's own and is
  populated — so "the fleet does not log" would be false; the claim is narrower: the
  ADR-2026-009-named tables are effectively empty and stale.
- `evidence` prose may be a deliberate departure from the ADR's JSON requirement, but no superseding
  ADR or amendment was found among the nine.
- ADR-2026-010's GitHub-issue obligation is **untested** here.
- `fleet_cal_*`, `fleet_audit_runs`, `decisions`, `experiments`, `evolve_*`, `autonomy_scores`,
  `adr_affected_resources`, `adr_tags` remain unexamined.
- Still blocked, unchanged: no D1 write, no mail-config tool, no deploy tool, no branch-create
  (no PR), `qnfo-canonical` R2 unbound.
