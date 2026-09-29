# RETRIGGER-3 (qnfo-ops) — issue #1485

Fires `.github/workflows/deploy-containers-pilot.yml` via its push trigger path
`qnfo-containers-pilot/**`. Deliberately carries no skip token (CI-TRIGGER-SKIP-1:
a fix commit must never suppress the workflow that applies the fix).

## Why, with evidence

`ci-status/deploy-containers-pilot.json` exists (sha 3bdcb033, ts
2026-09-29T19:37:34Z, head 139b2dce) and records:

    wrangler_outcome : failure
    nomig_outcome    : failure
    verify_outcome   : success
    health_http      : 200

This falsifies the RETRIGGER-2 note in `wrangler.toml` claiming the workflow
never ran. The CI layer is not the root cause: the trigger fires and
`PILOT_TOKEN` is available (the authenticated verify step succeeded). The
failing component is `wrangler deploy` itself, both with and without the
`[[migrations]]` block.

The old artifact carried no wrangler log, so the failure was not
self-explaining. The rewritten workflow tees wrangler output to
`/tmp/wrangler.log` and publishes `wrangler_tail`. This retrigger produces a
fresh artifact carrying the real error, which is the only way to distinguish a
rejected creating migration (DO-MIGRATION-NOTE-1) from a container-image /
instance_type rejection from an account containers-entitlement failure.

## Live state at retrigger time

* `container_status` -> `{"ok":false,"error":"Cannot read properties of
  undefined (reading 'running')"}`; `/health` returns 200 (false green).
* Live version `1.0.3-clone-egress-timeout-fallback`.
* `GET /bindings` -> `{d1 AUDIT, secret PILOT_TOKEN, durable_object_namespace
  SHELL_CONTAINER}` — no container config.
* Blast radius: shell_exec, exec_python, exec_node, container_install,
  git_clone_exec, container_workspace_exec, shell_pipeline.
