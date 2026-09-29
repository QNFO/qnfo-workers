# CONTAINER-RESTORE-1 — qnfo-containers-pilot [[containers]] restore (issue #1485)

Status: **OPEN** at 2026-09-29T19:45Z. Ground truth from live probes (no inference):

| Probe | Result |
|---|---|
| `container_status` (health) | `ok:true`, version `1.0.3-clone-egress-timeout-fallback` |
| `container_status` (status) | `ok:false`, error `Cannot read properties of undefined (reading 'running')` |
| `cf_worker_bindings(qnfo-containers-pilot)` | 3 bindings only: `d1 AUDIT`, `secret_text PILOT_TOKEN`, `durable_object_namespace SHELL_CONTAINER` — **no containers binding** (containers is not a binding, so this is expected and is not itself the defect) |

## Mechanism (confirmed)

1. `deployment_history` id 172: `qnfo-containers-pilot` deployed 2026-09-29T19:30:35.100Z by
   `qnfo-ops:cf_worker_deploy`, note `bindings_preserved=2`.
2. First `cloud_ops_events` row `kind=container.error` with text
   `Cannot read properties of undefined (reading 'running')` at **19:30:43.591Z** — 8 s later.
3. Cause: the API script PUT rebuilds metadata from bindings only. `[[containers]]`
   (`class_name` / `image` / `instance_type` / `max_instances`) is **not** a binding and
   **not** a `/content` field, so it is dropped and `ctx.container` becomes `undefined`.

## Source confirmation (fetched this turn, verbatim)

`qnfo-containers-pilot/worker.js` sha `e0f9e043a9f5a879a01914c982f708af471815b2` contains
**15 unguarded** container call sites — the TypeError is structural, not incidental:

- L82 `if (this.ctx.container.running) return;` (ensureStarted)
- L90 `if (this.ctx.container.running) return;` (_doStart)
- L102 `if (this.ctx.container.running) {` (retry check)
- L94 `await this.ctx.container.start({...})`
- L118 `const proc = await this.ctx.container.exec(cmd);` (run)
- L313 `return json({ ok: true, containerRunning: this.ctx.container.running, initialized: this._initialized });` (`/status`)

Blast radius: `shell_exec`, `exec_python`, `exec_node`, `container_install`, `git_clone_exec`,
`container_workspace_exec`, `shell_pipeline`.

## Two required fixes

**F1 (restore, load-bearing):** transmit `[[containers]]` on deploy. `wrangler deploy` is the
canonical path (`deploy-containers-pilot.yml`); the API PUT path must additionally carry the
container config, otherwise the fleet's *default* deploy path can never deploy a
container-bearing worker at all.

**F2 (defense in depth, non-load-bearing):** replace the 6 raw `this.ctx.container.*` reads
with a typed accessor so a missing config yields
`container_not_configured` + HTTP 503 instead of an opaque `TypeError`, and so `/status`
stops reporting `ok:true` for a worker that cannot execute anything.

This file is a deliberate, non-skip-token touch under `qnfo-containers-pilot/**` to fire the
push trigger of `deploy-containers-pilot.yml` (CI-TRIGGER-SKIP-1: a deploy trigger must never
carry `[skip ci]`).
