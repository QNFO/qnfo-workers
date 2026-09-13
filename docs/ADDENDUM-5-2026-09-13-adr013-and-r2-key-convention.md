# ADDENDUM 5 — ADR-013's WBS key format is not in use; the R2 convention is a third thing

Author: qnfo-ops (ops-exec), 2026-09-13 ~14:20Z. Live tool returns.
Closes the open question left in
`docs/ARCHITECTURE-GROUNDING-2026-09-13-ADRs-and-the-integration-gap.md` §1 ("no such exception
appears in the ADR, so it is an open question").

---

## 1. The mandated format appears nowhere in `qnfo-releases`

**ADR-013 — `accepted` — "WBS-Keyed R2 — No WBS, No Go":**

> "EVERY R2 object key MUST follow: `projects/<PORTFOLIO.PROGRAM.PROJECT.PX.TY>/<filename>`. No flat
> directories. No un-keyed objects."

Observed keys, verbatim from `r2_list`:

| period | observed key shape | example |
|---|---|---|
| 2025/12 | `YYYY/MM/<slug>/<file>` | `2025/12/thermodynamic-and-informational-bottlenecks-.../....md` |
| 2026/08 | `YYYY/MM/<slug>/<file>` | `2026/08/adelic-cross-domain-program/adelic-cross-domain-program.md` |
| 2026/09 | **`YYYY/MM/<slug>.md` — flat, no directory** | `2026/09/1-introduction.md` |

**No key begins with `projects/`.** The mandated `projects/<WBS>/` prefix does not appear in any of
the objects returned.

## 2. ADR-008 and ADR-013 conflict, and practice follows neither

The reason is structural, not an oversight:

- **ADR-008 — `accepted`:** "R2 is for static/versioned files only (**papers**, PDFs, images,
  bootstrap tools, skill backup copies)." Papers in R2 are explicitly sanctioned.
- **ADR-013 — `accepted`:** "EVERY R2 object key MUST follow `projects/<WBS>/…`."

A publication deposit is not a WBS task, so keying it by WBS code is not meaningful; and ADR-008
sanctions its presence. Two accepted ADRs give incompatible instructions for the same bucket, and
the pipeline has resolved the conflict by inventing a third convention — `YYYY/MM/<slug>/` — that
satisfies neither. **This is a documentation defect, not an implementation defect**, and it is the
only place in this session where the ADRs contradict each other rather than contradict reality.

## 3. The September convention is flat and thinner — and it is where the stubs are

| convention | files per paper | `.md` body |
|---|---|---|
| 2026/08 (`<slug>/`) | ~10–30 (`citation-audit.md`, `due-diligence-*.md`, `red-team-*.md`, `verification-output.json`, `references.bib`, `resolve-paper-id-evidence-*.json`, `.zenodo_versions.json`, …) | substantive (57 KB, 54 KB, 26 KB observed) |
| 2026/09 (flat `<slug>.md`) | 3 (`.html`, `.md`, `.pdf`) | mixed — 15,177 B for one paper, **97 B** for the two stubs |

The two 97-byte stubs (`1-introduction.md`, `operationalizing-infomatics.md`, identical etag
`5951e425…`) sit inside the **flat September set**, whose per-paper artifact count is a fraction of
August's. So the stubs are not an isolated corruption: they are the extreme case of a deposit
convention that changed in September and ships markedly fewer files per paper.

I do **not** claim the convention change caused the stubs. The correlation is that both appear in
the same period and the same key shape.

## 4. Two monitors `freshness_guard` calls "fresh" — one is genuinely healthy

- **`fleet_cal_state`** (freshness said 9.8h): `last_cron` = `30 3 * * 1`, `type: daily`, **status
  `complete`**, `metrics: 22, anomalies: 1, actions: 4, tuned: 3, audit: 1`, rollback check
  `{checked: 4, reverted: 0}`, at **2026-09-13T03:31:12Z**. This loop is running and completing. The
  `fresh` verdict is **correct**.
- **`kaizen_candidates`** (freshness said 35.5h): 3 rows, updated **2026-09-13T06:23:57Z** —
  `b8f6a1f4` `recurring-finding` "check C1 fired 10/12 runs" status **`proposed`**;
  `1c040fcb` `event-cluster` **"worker-health/alert x7"** status **`proposed`**;
  `38ba2a60` `event-cluster` "blank-audit/alert x8" status **`scheduled`**, untouched since
  **2026-09-10 15:41:37Z**.

The third row has been `scheduled` for ~3 days — the same stall shape as `fleet_improvements`
(consumer ran once, stopped). And the second candidate is **"worker-health/alert x7"**, i.e. the
kaizen miner independently detected the `worker-health` failure cluster documented in
`docs/CORRECTION-2026-09-13-fleet-improvements-consumer-exists.md` §2. Two independent subsystems
observed the same defect and neither acted on it.

## 5. Limits

- The `r2_list` was truncated at 40 of many objects, and I listed only two prefixes (`2026/09`
  earlier, root now). A `projects/`-keyed object could exist in a prefix I did not enumerate — so
  the claim is "no such key among the objects returned", not "no such key in the bucket".
- The ADR-008/ADR-013 conflict is my reading of two ADR texts; neither ADR acknowledges the other,
  and there may be an amendment outside the 9 rows I read (the `adr` table holds exactly 9).
- The convention-change correlation in §3 is temporal and key-shape-based; I did not read the
  writer that chooses the key.
- `fleet_cal_state` "healthy" is judged from `status: complete` and its counters, not from verifying
  the 22 metrics.
- `kaizen_candidates` shows only 3 rows — I did not establish whether that is the full table.
- Still blocked, unchanged: no D1 write, no mail-config tool, no deploy tool, no branch-create
  (no PR), `qnfo-canonical` R2 unbound.
