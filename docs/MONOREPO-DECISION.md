# MONOREPO-DECISION-1: keep qnfo-workers as one repository

Decision record, measured against `main` on 2026-10-31. Charter pillar:
**autonomy**. This answers issue [#5458](https://github.com/QNFO/qnfo-workers/issues/5458).

## Decision

Keep `QNFO/qnfo-workers` as a monorepo. Do not split it based on repository
shape or preference alone. The decision is reversible: extract an individual
worker when it meets the evidence bar below and its extraction rewires every
affected check in the same change.

The premise that the repository was accidental is not supported: the
[2026-09-07 deploy runbook](DEPLOY-RUNBOOK-2026-09-07.md) explicitly records
`QNFO/qnfo-workers` as a “single monorepo.” The fleet subsequently built its
deployment, verification, code-task and self-model conventions around that
single tree.

## Evidence at decision time

| Coupling | Measurement on 2026-10-31 | Cost of splitting |
|---|---|---|
| Cross-worker source tests | 97 of approximately 1,374 suite files read another worker's source | Replace direct source verification with pinned cross-repository fetches or fixtures that can drift. |
| Shared modules | 12 live workers import `_shared/` | Establish a versioned package or subtree, then coordinate consumer releases and preserve bindings. |
| Fleet-wide gates | 76 workflows, including approximately 15 control-plane workflows | Rebuild cross-repository orchestration or duplicate gates that can drift. |
| Shared schema history | 869 migration files for shared D1 state, including `qnfo-audit` | Preserve one total schema order across repositories and prevent concurrent shared-schema collisions. |
| Autonomous code loop | `code-task: repo=qnfo-workers path=<file>` is the code-merge runner's trust token; code-read contracts target repository paths | Add repository identity to the planner, orchestrator, merge runner and detector contracts, reopening their trust and routing surfaces. |
| Fleet self-model | `ARCH-SELF-MODEL-1`, fleet graph, `deploy-targets.txt` and watchmaker read the worker directory tree, including `FOLDED` and `RETIRED` markers | Keep a second source of truth for what exists and how it is deployed. |

These are dated measurements, not claims about current live topology. The
runtime and data coupling is decisive: workers share `qnfo-audit`, service
bindings and fleet doctrine. Moving files to separate repositories removes
none of those dependencies, while hiding them from checks that currently see
the whole fleet.

The usual benefits of splitting were not measured here:

- Workers are independently deployable single-file bundles; there is no
  workspace-wide build to isolate.
- `PRS-SCOPE-1` limits pull-request validation to changed directories, while
  `GATE-NIGHTLY-FULL-1` runs the full set nightly.
- Worker ownership is already modular by directory, with per-directory
  READMEs, suites, mirrors and version lines.
- The dashboard's 1.39 MB bundle is a per-worker concern and remains the same
  size wherever its source is stored.

Accordingly, the measured runtime benefit of a repository split was zero, while
the gate and autonomy-loop rewiring would be substantial.

## Evidence bar for extraction

Extract one worker, strangler-style, only when all of the following hold for
that worker:

1. It writes no shared table and reads no table owned by another writer.
2. It imports nothing from `_shared/`.
3. No other suite reads its source, and it reads no other worker's source.
4. It has an independently evidenced release cadence or a distinct security
   boundary.
5. Its extraction change rewires the affected gates, mirrors,
   detector-contract paths and fleet self-model, and all checks pass.

At the 2026-10-31 measurement, no live worker passed criterion 1: every live
worker touched the shared `qnfo-audit` database. Re-evaluate that criterion
with current evidence before any extraction; do not treat this dated result as
a permanent block.

## Keep monorepo hygiene

- Preserve one worker per directory and the `FOLDED`/`RETIRED` marker
  convention.
- Keep suites directory-scoped so pull-request CI remains proportional.
- Improve navigation within large workers (the dashboard already uses
  `AREA-MAP` banners); treat bundle size as a worker-level issue if startup
  measurements show a problem.
- Evaluate future split proposals against the extraction evidence bar, not
  repository-shape preference.

## Reproduce the reported counts

Run these commands from the repository root; the results above are the
2026-10-31 snapshot:

```sh
grep -rl '\.\./qnfo-' --include='*.test.mjs' . | wc -l
grep -rl '_shared' --include='worker.js' . | grep -v deployed-current | wc -l
ls .github/workflows | wc -l
ls migrations/*.sql | wc -l
```
