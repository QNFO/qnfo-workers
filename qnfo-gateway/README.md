# qnfo-gateway — QNFO site router (papers.qnfo.org, ideas, archive, ipatent, graph-api, legal)

**Recovery state:** canonical source was never committed as a full source tree; this dir carries the
deployed bundle recovered from qnfo-web-unified/qnfo-gateway.deployed.worker.js (2026-09-10 re-home).
Treat deployed-current.worker.js as the ONLY source of truth until the bundle is de-compiled into
readable source (tracked: F4 re-home worklist).

**Purpose:** dynamic D1-driven site rendering (papers.qnfo.org serves living-paper columns at request
time). CORE worker — do NOT deprecate. No /health route yet (F3 probe worklist).

**Deploy method:** wrangler deploy from a reconstructed wrangler.toml; bindings LIVING (living-paper D1)
+ GRAPH (qnfo-graph D1). See taxonomy F6.
