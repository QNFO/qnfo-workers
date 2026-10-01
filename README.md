# qnfo-workers

The source of the Quniverse: the Cloudflare Workers fleet that operates, heals, audits, publishes and promotes QNFO's research, together with the registers that govern it. One directory per worker (`worker.js`, `wrangler.toml`, a byte-identical `deployed-current.worker.js`); a merge to `main` deploys through the canonical path (`qnfo-ops /ops/deploy`) with a lock, a ledger and the declared bindings and crons.

- **Charter:** [docs/QUNIVERSE-CHARTER.md](docs/QUNIVERSE-CHARTER.md), what the system is, its objectives, SWOT, MVP, roadmap and decision rules; the live half is regenerated daily by `qnfo-fleet-control` and served at `GET https://qnfo-fleet-control.q08.workers.dev/charter`.
- **Portfolio:** [docs/PORTFOLIO.md](docs/PORTFOLIO.md), every repository of the [QNFO organisation](https://github.com/QNFO) classified, linked and kept hygienic by the same loop (`GET /portfolio`).
- **Rules for agent sessions:** [CLAUDE.md](CLAUDE.md). Several sessions work the fleet concurrently; the rules exist because each one was broken at least once.
- **Live surfaces:** [fleet.qnfo.org](https://fleet.qnfo.org) (owner dashboard), [qnfo.org](https://qnfo.org) and [papers.qnfo.org](https://papers.qnfo.org) (home of record), `GET /loops` on the kernel (the fleet verifying its own loops).

Licence: the [QNFO Unified License Agreement v2.0](LICENSE) (SPDX `LicenseRef-QNFO-ULA-2.0`), which applies to every repository of the organisation.
