# ARCHIVE-PAGES-UNDEPLOYABLE-1

Filed: 2026-09-29 (agent_issues id 1393) · priority high · category deploy
Owner: qnfo-ops (deploy path) · related: #1111 (PUBLIC-COUNTS-COVERAGE-DRIFT-1), #1371 (VERSION-BUMP-GUARD-MISSING-1)

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

## Open blocker (not closed)

`wrangler pages deploy` **replaces the project's file set**. The repo cannot prove
what else `qnfo-publications` currently holds, so a first run could delete
co-hosted assets. The workflow is therefore manual and deliberately gated. Closing
this issue requires listing the project's current deployment (CF API
`/accounts/{id}/pages/projects/{name}/deployments`) before the first run.

## Adversarial note

Two hypotheses remain undistinguished by available tooling:

- **H1 (favoured):** no deploy path exists — nothing has ever published this file.
- **H2:** `qnfo-publications` is git-connected to this repo with a build step, and
  the build has been failing silently, so the last good deployment is frozen.

Both are consistent with the evidence. H2 would additionally require fixing the
Pages build configuration; the workflow above is correct under H1 and harmless
under H2 (a manual run republishes the same content).

## Correction to an earlier in-session claim

An earlier pass reported the corruption as "`s:1fr}` ×2" using a bare substring
grep. That count is a **false positive**: `s:1fr}` is the tail of the legitimate
`grid-template-columns:1fr}`. The real defect is the *truncation* of that rule at
line 61 plus the displaced block at line 74, not the string `s:1fr}` itself.

## Secondary finding (deploy tooling)

`github_file_write` returned a 409 of the form
`GitHub 409: is at <head> but expected <sha>` with `attempts:1, sha_retried:false`
while writing this file — i.e. the GITHUB-409-RETRY-1 path (#1372) did **not**
engage for this error shape. The retry is proven to engage for GitHub's native
stale-blob 409 (`attempts:2`, verified 2026-09-29) but not for this variant.
Filed as a follow-up: the retry matcher must cover both 409 payload shapes.
