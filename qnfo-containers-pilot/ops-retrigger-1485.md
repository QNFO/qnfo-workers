# CONTAINER-CONFIG-RESTORE-1 retrigger (issue #1485)

This file exists only to fire `.github/workflows/deploy-containers-pilot.yml`.

## Why a retrigger file and not a code change

`[[containers]]` is neither a worker binding nor a `/content` field, so neither
`scripts/raw_put.py` nor the qnfo-ops `cf_worker_deploy` path can transmit it.
`wrangler deploy` is the only path that carries the block. The workflow's own
trigger list is:

```
on:
  push:
    branches: [main]
    paths:
      - 'qnfo-containers-pilot/**'
      - '.github/workflows/deploy-containers-pilot.yml'
```

So any commit under `qnfo-containers-pilot/**` on `main` is the retrigger
mechanism. This file is that commit. It deliberately carries **no** `[skip ci]`
token: CI-TRIGGER-SKIP-1 is the class where the fix commit suppresses the very
workflow that applies the fix (the first attempt, commit 129f0a2b, was lost that
way and `ci-status/deploy-containers-pilot.json` was never produced - 404 as of
2026-09-29T20:5xZ).

## Blast radius being repaired

`deployment_history` id 172: `qnfo-containers-pilot` redeployed
2026-09-29T19:30:35.100Z by `qnfo-ops:cf_worker_deploy` with
`bindings_preserved=2`. `GET /bindings` returned only
`{d1 AUDIT, secret PILOT_TOKEN, durable_object_namespace SHELL_CONTAINER}` - the
container config is not a binding, so it was rebuilt without it. First
`cloud_ops_events` row of `kind=container.error`, text
`Cannot read properties of undefined (reading 'running')`, landed at
19:30:43.591Z - 8 seconds later.

Tools disabled by that: `shell_exec`, `exec_python`, `exec_node`,
`container_install`, `git_clone_exec`, `container_workspace_exec`,
`shell_pipeline`.

## Fail-closed behaviour

The workflow asserts the required keys are present in `wrangler.toml` before
deploying, and fails closed with `verdict=UNVERIFIED_NO_TOKEN` if `PILOT_TOKEN`
is unavailable to it. A red run therefore wipes nothing and is self-explaining.
