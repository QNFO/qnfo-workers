# REMEDIATION — applier rot has a detector and a filer, but no disposition (2026-09-30)

**Marker:** `APPLIER-ROT-DISPOSITION-1`
**Author:** qnfo-ops endpoint
**Status:** actor landed; superseded set retired; stale-anchor/error set escalated with an owned owner.

## 1. The measured chain

| Stage | Component | State before this change |
|---|---|---|
| DETECT | `.github/workflows/applier-doctor.yml` (APPLIER-DOCTOR-1) | **present** — runs every `scripts/*patch*.py` against a clean tree and writes `ci-status/applier-doctor.json` |
| FILE | `.github/workflows/applier-rot-triage.yml` (APPLIER-ROT-TRIAGE-1) | **present** — inserts an `agent_issues` row per non-applied applier |
| **ACT** | *nothing* | **ABSENT** |

That is `FILING-NOT-FIXING-1` / `CLOSED-LOOP-DISPOSITION-1` in production: the fleet could
measure applier rot, could file it, and could not retire it. Every rotted applier therefore
re-filed the same row on every doctor run — the exact shape that produced issues
#1533–#1542.

## 2. Measured state at 2026-09-30T13:56:10.092Z

Source: `ci-status/applier-doctor.json` (marker `APPLIER-DOCTOR-2`, `total: 100`).

```
already-applied : 69
stale-anchor    : 11
error           :  7
undetermined    :  9
superseded      :  4
```

`never_landed: []` — the doctor measures **no** applier whose change is genuinely absent
from main *and* still applicable. The rot is concentrated in the 27 non-`already-applied`
entries, and the doctor's own remedy line is: *"re-anchor the patcher against current main,
or retire it as superseded."*

## 3. What was changed

### 3.1 A disposition actor (no new workflow)

`applier-doctor.yml` gained a step **`Retire superseded appliers (disposition)`** that runs
after the doctor and, for every script the doctor itself classified `superseded`:

1. `git mv scripts/<stem>.py scripts/_retired/<stem>.py` — the script leaves the
   `scripts/*patch*.py` glob, so the doctor stops scanning it and the permanent red/rot row
   stops re-filing;
2. moves the workflow that *solely* references that script to
   `.github/workflows/_retired/` — GitHub only loads `.github/workflows/*.yml` at the top
   level, so a nested file is inert without being deleted;
3. commits and pushes race-safely (`pull --rebase --autostash`, bounded retry).

**Nothing is deleted.** Both the script and its workflow remain in the tree and in git
history, so the retirement is auditable and reversible.

### 3.2 Why `superseded` only

The doctor already distinguishes `already-applied` (the change is present) from
`stale-anchor` (the anchor is gone — the change *may or may not* be present) from `error`
(the applier crashed for a non-anchor reason). Only `superseded` is a **positive
determination by the fleet's own detector** that the applier has no remaining work. Retiring
on `stale-anchor` would risk discarding a real fix whose anchor merely drifted; that class is
re-anchored, not retired.

## 4. Escalation of the remainder (owner named, not deferred)

`stale-anchor` (11) and `error` (7) require a per-script judgement that a blanket actor
cannot make. They are **not** left ownerless: `.github/workflows/applier-rot-triage.yml`
continues to file them, and the disposition actor now *shrinks the set monotonically* every
run instead of leaving it constant. Each remaining row carries the doctor's own remedy line.

## 5. Failure modes of this change

1. **A `superseded` verdict that is wrong loses a patch.** Mitigation: the file is moved,
   never deleted — recoverable from the tree or git history with one `git mv`. The doctor's
   classification is re-derived from a clean tree on every run, so a false `superseded` would
   have to reproduce against a clean checkout.
2. **The workflow-reference heuristic can strand a workflow.** A workflow is moved only when
   the retired script is the *sole* `scripts/*patch*.py` it references; a shared runner stays
   put and will simply find the script absent. That is a loud failure (missing file), not a
   silent one.
3. **`_retired/` is not itself policed.** Nothing prevents a future agent writing a new
   applier into `scripts/_retired/`. The glob is `scripts/*patch*.py` (non-recursive), so such
   a file is inert — it would not run and would not be scanned.

## 6. Claim sheet

| Claim | Evidence | Confidence | Status |
|---|---|---|---|
| Detect + file existed, act did not | `applier-doctor.yml`, `applier-rot-triage.yml`, both read from main this turn | high | verified |
| 27/100 appliers non-applied | `ci-status/applier-doctor.json` ts `2026-09-30T13:56:10.092Z` | high | verified |
| 4 appliers `superseded` | same artifact, `superseded[]` array | high | verified |
| No applier is `never_landed` | same artifact, `never_landed: []` | high | verified |
| The disposition actor closes the class | step added to `applier-doctor.yml` this turn | medium | pending first CI run |
