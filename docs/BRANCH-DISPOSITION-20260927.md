# Branch disposition — qnfo-workers (2026-09-27)

`main` is the DEPLOY SOURCE (REPO-IS-DEPLOY-SOURCE-1): merging a stale branch into it can
regress a live worker, because the fleet-control redeploy path reads `main`. Branches are
therefore closed only when their content is provably contained in `main`; everything else is
recorded here with a disposition rather than force-merged.

## Deleted (content provably in `main`; nothing lost)
- 6 merged branches deleted (`restore/companion-lib-2026-09-14`, `ops/q08-publication-recovery-20260926-v2`,
  `ops/fix-cron-summary-1070`, `ops/cost-waste-gating-2026-09-19`, `merge-wave-A`,
  `chatbox/email-first-touch-closeout-20260922`) — all `ahead=0` vs `main`.
- `chatbox/qnfo-ops-attachguard-xml-form-20260927` — `ahead=0`.

## Kept — ACTIVE (a concurrent session is committing these today)
| branch | unmerged | last |
|---|---|---|
| `fix/q08-route-and-archive-numbers` | 5 | 2026-09-27 10:56 |
| `chatbox/ops-attachment-xml-form-apply` | 3 | 2026-09-27 10:55 |
| `chatbox/qnfo-ops-attachment-guard-xml-form` | 2 | 2026-09-27 10:56 |
| `chatbox/attachguard-xml-form-20260927` | 3 | 2026-09-27 10:01 |

## Kept — PRE-CONSOLIDATION (do NOT merge; content predates the 57->30 worker consolidation)
| branch | unmerged | last | why not merged |
|---|---|---|---|
| `redeploy-binding-fix` | 27 | 2026-09-12 | superseded by the live binding-truth sweep (BINDING-TRUTH-EDGE-SWEEP-1) |
| `fleet-selfheal-2026-09-12` | 20 | 2026-09-12 | superseded by qnfo-fleet-control's optimizer |
| `quniverse-refactor-20260912` | 14 | 2026-09-12 | 24 files vs main; merging would resurrect retired workers |
| `model-purge-2026-09-11` | 10 | 2026-09-11 | 22 files vs main; model-floor work already in main |
| `consolidation-2` | 2 | 2026-09-11 | pre-consolidation |

## Kept — pending owner review
| branch | unmerged | why |
|---|---|---|
| `poster/statements-to-questions-ai-epistemic-repair-20260926` | 2 | content/poster asset; 2 files, 19 insertions — merge-or-close by its owner |
| `ops/q08-publication-recovery-20260926` | 2 | publication recovery; 2 files, 96 insertions — pending review |

## Kept — RESCUED local stashes (durable, replaces 4 unowned `git stash` entries)
`rescue/dev-stash-{0,1,2,3}-20260927` — the four `Dev/qnfo-workers` stashes were converted to
pushed branches so the work is no longer local-only and losable:
- `stash@{2}` personal-companion +926/-241, `wrangler.toml`
- `stash@{3}` 22 files +167/-588
- `stash@{1}` q08-signal-engine +118/-13
- `stash@{0}` qnfo-ops +11/-4
Each needs a merge-or-drop decision by the surface owner.
