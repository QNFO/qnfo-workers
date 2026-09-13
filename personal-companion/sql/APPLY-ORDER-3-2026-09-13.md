# Apply order, revision 3 — QRI-3 must NOT be run after QRI-1 (2026-09-13)

Author: qnfo-ops. **Supersedes `sql/APPLY-ORDER-2-2026-09-13.md` §1 only.** It changes no SQL.
Written after reading the actual content of `QRI-1`, `QRI-3` and `QRI-4` — the previous revisions
were written from file names and headers.

## 1. The order is QRI-1 → QRI-4. QRI-3 is not run.

`APPLY-ORDER-2` §1 mandates a three-step sequence: **QRI-1 → QRI-4 → QRI-3**. Step 3 is wrong.

| file | §0 / §3 DDL | provenance UPDATEs |
|---|---|---|
| `QRI-1-corrections-2026-09-13.sql` (rev 2) | `ALTER TABLE companion_feedback ADD COLUMN source TEXT DEFAULT 'unknown';` | `source='probe' WHERE id BETWEEN 1 AND 42`; `source='human' WHERE id BETWEEN 43 AND 48` |
| `QRI-3-feedback-provenance-2026-09-13.sql` | `ALTER TABLE companion_feedback ADD COLUMN source TEXT DEFAULT 'unknown';` | `source='probe' WHERE id BETWEEN 1 AND 42`; `source='human' WHERE id BETWEEN 43 AND 48` |

Same DDL, same column, same default, same two UPDATEs, same id ranges. Both files state the
`ALTER TABLE` is non-idempotent — QRI-1: *"re-running it raises 'duplicate column name: source'"*;
QRI-3 §0: *"Run ONCE … re-running this statement errors."*

So the mandated order runs QRI-1 (which adds the column and partitions provenance), then QRI-3, whose
§0 raises `duplicate column name: source`. QRI-3's inline warning — *"If `source` already exists, skip
to step 1"* — is the only thing preventing that, and an operator who follows it finds QRI-3 §1's UPDATEs
are duplicates of QRI-1's that already ran. QRI-3 contributes nothing in this order and can only error.

**Both files claim to supersede the other's §3.** QRI-3's header: *"supersedes QRI-1 section 3"*.
QRI-1 rev 2's own revision note already incorporated QRI-3's correction (ids 43–48 rather than 43–45,
the NOT NULL failure). The mutual-supersession was never reconciled against the revised QRI-1.

## 2. Decision rule

- **Fresh apply:** `QRI-1 → QRI-4`. **Skip QRI-3.**
- **If QRI-1 §3 was not applied** (test: `companion_feedback.source` does not exist): run QRI-3 §0–1
  *instead of* QRI-1 §3, then QRI-4.
- **Never both.** The one guaranteed outcome of running both is an error at QRI-3 §0.

## 3. Verified: nothing in this directory has been applied (2026-09-13, live)

Two independent probes, not one:

| probe | live result | what it rules out |
|---|---|---|
| `SELECT source, COUNT(*) FROM companion_feedback GROUP BY source` | **`D1_ERROR: no such column: source`** | QRI-1 §3 and QRI-3 §0 have not run |
| `companion_pieces` id=8 | `len 15517`, `word_count 2539`, `five 332`, `gate 'passed'`, `qri4_at null` | QRI-1 §1 and QRI-4 have not run |

The reader-visible text is unchanged: `reading.q08.org/p/2026-09-12-essay-3bf32c8a197d2196` → HTTP 200,
defective sentences served verbatim.

## 4. Minor, not blocking — a provenance ambiguity after both run

QRI-4 step 4 sets `$.gate`, `$.gate_reason` and `$.errata`, overwriting the values QRI-1 §1 wrote, but it
does **not** touch `$.errata_at`. After QRI-1 then QRI-4, `errata_at = '2026-09-13'` sits beside QRI-4's
errata text rather than QRI-1's — the timestamp no longer identifies which text is present. Both are
same-day, so the impact is small; QRI-4 should set `errata_at` explicitly if the distinction matters.

## 5. Unchanged

Applying any of this corrects **one row**. It does not wire the gate, and v1.1.0 has no gate call at all
(`QRI-1`: *"this tags quality_json only … v1.1.0 has no gate call at all"*). See `APPLY-ORDER-2` §6.

Also unchanged, and deliberately not treated as a defect: 6 of 7 published pieces carry
`verdict='reject'` while remaining reader-visible. `QRI-1` states the discipline — *"withdrawal is
decided by the VERIFIED gate result, not by the critic's verdict … P_CRITIQUE [is] 'look for reasons this
piece is worthless'"* — so verdict-does-not-gate-publication is design, not oversight. The defect is that
`gate` reads `'passed'` on all seven rows because no gate call exists to write anything else.
