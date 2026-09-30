# RESTORE-1485 — deploy trigger + endpoint-side blocker record

Purpose of this commit: fire `deploy-containers-pilot.yml` (path filter `qnfo-containers-pilot/**`)
so its **latest** revision — which publishes the wrangler log tail and a real `verify_rc` —
runs and records the actual `wrangler deploy` failure text. The prior artifact
(`ci-status/deploy-containers-pilot.json`, head `139b2dce`, ts 2026-09-29T19:37:34Z) recorded
`wrangler_outcome=failure nomig_outcome=failure verify_outcome=success` with **no log text**, so the
failure reason was unrecoverable from outside the runner.

No skip token is present in this commit (CI-TRIGGER-SKIP-1).

## Endpoint-side blocker (measured, not inferred)

`qnfo-ops:cf_worker_deploy` **cannot** be used to restore this worker's container config. Read from
the deployed bundle (`qnfo-ops/worker.js` @ main, 375,567 bytes):

- It carries an explicit fail-closed guard:
  `const _CONTAINER_WORKERS = ["qnfo-containers-pilot"];` — any deploy of this worker is
  **rejected** unless `allow_container_config_drop:true` (deliberate teardown only).
- Its multipart `metadata` part is built as
  `{ main_module|body_part, bindings, compatibility_date, compatibility_flags, exports }`
  — there is **no `containers` field**, which is precisely why every `/content`-path deploy
  rebuilds script metadata without `[[containers]]`.

Therefore: restoring the container config requires a deploy path that transmits `[[containers]]`
(`wrangler deploy`), or an endpoint change that adds a `containers` field to the metadata part.

## Why this matters for #1456

`qnfo-containers-pilot/wrangler.toml` on main already declares
`instance_type = "basic"` (4 GB disk / 1 GiB RAM) inside the `[[containers]]` block. That fix is
inert until a wrangler-path deploy lands, so #1456 and #1485 close together in one successful run.
