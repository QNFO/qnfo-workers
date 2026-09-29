# ARCHIVE-PAGES-UNDEPLOYABLE-1

Filed: 2026-09-29 (agent_issues id 1393) · priority high · category deploy
Owner: qnfo-ops (deploy path) · related: #1111 (PUBLIC-COUNTS-COVERAGE-DRIFT-1), #1371 (VERSION-BUMP-GUARD-MISSING-1), #1396 (GITHUB-409-VARIANT-RETRY-GAP-1)

## Symptom

`https://archive.qnfo.org/` serves malformed HTML and stale counts, while the
repo source has been repaired.

## Evidence (all captured 2026-09-29 ~16:09Z)

Production (`curl -s https://archive.qnfo.org/`, 12,790 bytes) vs repo
(`qnfo-web-unified/archive-qnfo.html`, 12,587 bytes) — 36-line unified diff:

| # | Production | Repo (post-f6601128) |
|---|---|---|
| 14 | `<style` (unclosed) then `@import …;>` | `<style>` |
| 61 | `.archive-grid{grid-template-column` (truncated mid-property) | `.archive-grid{grid-template-columns:1fr}` |
| 74-79 | orphaned `s:1fr}` + displaced media queries | correctly placed in the `@media` block |
| 121 | `658+ QNFO papers` | `446 QNFO papers` |
| 161 | `2,500+ nodes, 1,400+ edges` | `8,349 nodes, 8,525 edges` |

The `<style` defect is functional, not cosmetic: the unclosed tag swallows the
`@import`, so the Fraunces/Public Sans web fonts never load.

Repo-side repair is present: `git log` for the file shows `f6601128`
"fix(archive): repair 3 CSS corruptions + STALE-COUNTS-1 with verified
2026-09-29 values" (16:04:57Z).

## Root cause

`archive.qnfo.org` is served by the **Cloudflare Pages project `qnfo-publications`**
(`qnfo-web-unified/README.md` line 23). The repository contains **36 workflows and
none of them deploys a Pages project** — every deploy workflow targets Workers
(`raw_put.py`, `cf_worker_deploy`, `POST /ops/deploy`). `deploy-targets.txt` lists
only `fleet-exec` and `qnfo-social`.

Therefore a commit to `qnfo-web-unified/archive-qnfo.html` **cannot reach
production by any existing path**. `f6601128` is inert.

This is the same class as #1371 (a fix that is structurally undeployable), applied
to Pages assets instead of Worker bundles.

## Remediation shipped

`.github/workflows/deploy-pages-qnfo-publications.yml` — a fail-closed deploy path:

1. `workflow_dispatch` only, requiring `confirm == DEPLOY` (no push trigger);
2. content gate on the staged asset (repaired markers present, corruption markers absent);
3. post-deploy live verification against `https://archive.qnfo.org/`.

## Pre-deploy inventory path (shipped 2026-09-29 ~16:2xZ)

The open blocker below is "list the project before you replace it". That listing
is now executable server-side without Actions log access:

- `scripts/pages_project_audit.py` — strictly **read-only** against Pages. GETs
  `/accounts/{acct}/pages/projects/qnfo-publications`, its `deployments`, and the
  newest deployment's file map, then persists the inventory to qnfo-audit D1
  table `pages_project_audit`. Never creates, deletes or deploys anything.
  Exit 0 = inventory captured; exit 3 = API failure (fail-closed, so the gate
  cannot be silently skipped).
- `.github/workflows/pages-project-audit.yml` — runs the above on push to its own
  two paths or on `workflow_dispatch`. Contains no deploy step.

Consequence: the "what else does this project hold?" question now has a
machine-readable answer (deployment count, newest deployment id/branch/env, and
the file keys of the newest deployment), readable from ops tooling via
`ops_d1_query` on `pages_project_audit`.

## Open blocker (partially closed)

`wrangler pages deploy` **replaces the project's file set**. The repo cannot prove
what else `qnfo-publications` currently holds, so a first run could delete
co-hosted assets.

Status as of this writing: the **listing mechanism** is shipped (above); the
**listing itself** must be read from `pages_project_audit` and judged before the
first deploy. The deploy workflow remains manual and deliberately gated on
`confirm == DEPLOY`. This issue stays open until an inventory row exists and is
consistent with a single-asset project.

## Adversarial note

Two hypotheses remain undistinguished by available tooling:

- **H1 (favoured):** no deploy path exists — nothing has ever published this file.
- **H2:** `qnfo-publications` is git-connected to this repo with a build step, and
  the build has been failing silently, so the last good deployment is frozen.

Both are consistent with the evidence. H2 would additionally require fixing the
Pages build configuration; the workflow above is correct under H1 and harmless
under H2 (a manual run republishes the same content). **The inventory row is the
discriminator**: under H2 the project will show many deployments with recent
`created_on` values and no matching repo commits; under H1 it will show few or
none.

## Correction to an earlier in-session claim

An earlier pass reported the corruption as "`s:1fr}` ×2" using a bare substring
grep. That count is a **false positive**: `s:1fr}` is the tail of the legitimate
`grid-template-columns:1fr}`. The real defect is the *truncation* of that rule at
line 61 plus the displaced block at line 74, not the string `s:1fr}` itself.

## Secondary finding (deploy tooling) — now filed

`github_file_write` returned a 409 of the form
`GitHub 409: is at <head> but expected <sha>` with `attempts:1, sha_retried:false`
while writing this file — i.e. the GITHUB-409-RETRY-1 path (#1372) did **not**
engage for this error shape. The retry is proven to engage for GitHub's native
stale-blob 409 (`attempts:2`, verified 2026-09-29) but not for this variant.

**Filed as #1396 GITHUB-409-VARIANT-RETRY-GAP-1** (agent_issues, 2026-09-29).

Second reproduction, same session: writing
`.github/workflows/pages-project-audit.yml` failed with
`GitHub 409: is at b1c84ea5… but expected 671971b9…`, `attempts:1`,
`sha_retried:false` — immediately after a sibling write in the same batch
advanced the branch head to `b1c84ea5`. Two independent reproductions establish
the variant is not a one-off; the retry predicate must treat any 409/422 whose
body indicates a head/sha mismatch as retryable.
