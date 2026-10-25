# Papers version archive + plain-language closeout audit (2026-10-25)

Status: **FAIL**. The user-facing directive is not live. This directory preserves the applied D1 migration, the uncommitted candidate diff, and the audit ledger SQL so the next cycle can resume without reconstructing them.

## Live evidence

- `GET https://papers.qnfo.org/api/paper-context/chapter-1` returned no `version_history`; the `versions` array held only `1.2.0`.
- `GET https://papers.qnfo.org/papers/chapter-1/v/1.1.0` returned HTTP 200 with the **current** page: title current, `v1.2.0`, zero occurrences of `v1.1.0`, zero occurrences of `Archived version`.
- `/api/plain/coverage`, `/api/plain/rebuild`, `/api/version` returned 404.
- Live chapter-1 HTML still contained `Provenance and AI Involvement` twice, `Restated for a non-expert reader` once, `C(A) = (1` four times, `NDCG` six times, `0.635` seven times.
- `paper_version_history`: 160 rows / 88 papers; 140 multi-version papers need 218 prior versions; 61 papers still lack at least one prior body.
- `plain_summary`: 703 rows; 606 contain a digit; 298 contain NDCG/quantum/algorithm; average grade 9.6; maximum 24.5.
- Live gateway source sampled at 11:28Z was `3.34.0-agent-discovery-2`; main was `3.37.0-link-header-anchor-1` at audit time (69 insertions / 21 deletions since 3.34.0). By closeout main had advanced to `3.39.0`, so the candidate is further behind.

## What is applied

- `schema.sql`: unique index on `(slug, version)` plus two D1 triggers that archive the old body on a body or version update.
- `backfill-version-queue.sql`: 19 prior-version rows recovered from `qnfo-audit.version_queue` (applied; 160 history rows total).
- `audit-ledger.sql`: the FAIL handoff and wbs_state rows (handoff id 30018; project `qnfo-papers-version-archive-2026-10-25`).

## What is not applied

- Gateway code: no archive route, no `version_history` API field, no Versions-tab history, no metadata cleanup, no plain-summary prompt/quality change.
- The committed branch artifact `8a599211` is based on 3.32.0. The temp candidate is 3.35.0 based on 3.34.0. Neither is safe to deploy against main 3.37.0.
- No corpus-wide summary regeneration. `plainBatch` selects the same newest window each call and accepts 29 `qr2` rows as fresh; `plainQuality` is advisory.
- No reviser gate for reference formatting, detailed appendices, jargon definitions or a glossary.

## Next actions

1. Rebase the candidate onto main 3.37.0; discard 8a599211 and 3.35.0 for deployment.
2. Fix `plainBatch` pagination and make the quality gate enforcing; reject `qr2`.
3. Regenerate all 703 summaries and verify zero digits / grade <= 10 on a live sample.
4. Recover or tombstone the 61 missing prior versions.
5. Add the reviser standards gate and a raw verbatim archive view.
6. Deploy only through `POST /ops/deploy`, then re-probe the API, `/v/<version>`, plain coverage and the live page.

## Claim sheet

The full claim/evidence/confidence/status sheet is in `audit-ledger.sql` and in `qnfo-audit.handoffs` id 30018. The verdict recorded there is **FAIL**.
