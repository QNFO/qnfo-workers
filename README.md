# qnfo-workers

The source of the Quniverse: the Cloudflare Workers fleet that operates, heals, audits, publishes and promotes QNFO's research, together with the registers that govern it. One directory per worker (`worker.js`, `wrangler.toml`, a byte-identical `deployed-current.worker.js`); a merge to `main` deploys through the canonical path (`qnfo-ops /ops/deploy`) with a lock, a ledger and the declared bindings and crons.

- **Charter:** [docs/QUNIVERSE-CHARTER.md](docs/QUNIVERSE-CHARTER.md), what the system is, its objectives, SWOT, MVP, roadmap and decision rules; the live half is regenerated daily by `qnfo-fleet-control` and served at `GET https://qnfo-fleet-control.q08.workers.dev/charter`.
- **Product requirements:** [docs/QUNIVERSE-PRD.md](docs/QUNIVERSE-PRD.md), user outcomes, acceptance criteria, success metrics and a phased roadmap mapped to existing initiatives; subordinate to the charter and strategy.
- **Portfolio:** [docs/PORTFOLIO.md](docs/PORTFOLIO.md), every repository of the [QNFO organisation](https://github.com/QNFO) classified, linked and kept hygienic by the same loop (`GET /portfolio`).
- **Rules for agent sessions:** [CLAUDE.md](CLAUDE.md). Several sessions work the fleet concurrently; the rules exist because each one was broken at least once.
- **Live surfaces:** [fleet.qnfo.org](https://fleet.qnfo.org) (owner dashboard), [qnfo.org](https://qnfo.org) and [papers.qnfo.org](https://papers.qnfo.org) (home of record), `GET /loops` on the kernel (the fleet verifying its own loops).

## Repository layout

- Live worker directories contain deployable `worker.js` entrypoints and their `wrangler.toml` declarations. When present, `deployed-current.worker.js` is the deployment mirror and must match `worker.js`.
- `scripts/` contains deployment, CI, audit, and fleet-graph tooling; `_shared/` contains source copied into workers by build scripts; `migrations/` contains database changes; `.github/workflows/` owns CI and canonical deployment automation.
- `RETIRED` and `FOLDED` markers identify historical worker directories that are not deployable. The root `worker.js` and `wrangler.toml` are a separate Worker, not a substitute for the worker-directory layout.
- `docs/` holds the charter, doctrine, operating standards, runbooks, and project-specific records. Some dated closeouts and handoffs are historical snapshots; use the live code and linked current standards for present behavior.

## Tests and checks

There is no repository-wide package script. The CI suite runner discovers `*.test.mjs` files, syntax-checks the applicable Worker entrypoints, and selects tests by the changed paths; shared paths and control-plane Workers run the full suite. To run the full offline suite locally:

```sh
node scripts/run-suites.mjs --all
```

For a focused Node.js suite, use `node --test <path-to-suite.test.mjs>`. CI also runs repository guards and project-specific checks; see `.github/workflows/deploy-gate.yml` and the relevant workflow before relying on a local suite as the only validation. The suite runner is offline and does not require Cloudflare credentials.

Licence: the [QNFO Unified License Agreement v2.0](LICENSE) (SPDX `LicenseRef-QNFO-ULA-2.0`), which applies to every repository of the organisation.
