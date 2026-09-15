# PATCH — preserve declared deps in service_registry (2026-09-15, qnfo-ops)

Ticket: 922 REGISTRY-DEPS-CLOBBER. Status: runtime mitigated (D1 trigger), source fix NOT deployed.

## Problem

`registryRefresh()` (worker.js, ~line 2799-2845) iterates `FLEET` and, for every
successful `/health` probe, upserts with `deps: []` **hardcoded** (line 2840). The
upsert SQL uses `ON CONFLICT(service) DO UPDATE SET ... deps=excluded.deps`, so every
declared dependency edge is erased. Triggers: `[triggers] crons = "*/30 * * * *"`
(wrangler.toml line 225) and the `GET /registry/refresh` route (worker.js ~line 3267).

`registryRegister()` (~line 2717) has the same failure via `JSON.stringify(body.deps || [])`:
any self-registration that omits `deps` nulls the column.

Evidence: a single batch at `2026-09-15T14:30:36.176Z` stamped `deps="[]"` on 8 FLEET
rows (qnfo-ai, qnfo-ai-search, qnfo-archive, qnfo-email, qnfo-gateway, qnfo-kaizen,
qnfo-lifecycle, qnfo-paper-indexer) all sharing one timestamp — the signature of one
loop with `now = iso()` computed once.

## Runtime mitigation already installed (D1, no deploy needed)

```sql
CREATE TRIGGER IF NOT EXISTS service_registry_deps_guard
AFTER UPDATE OF deps ON service_registry
FOR EACH ROW
WHEN (NEW.deps IS NULL OR NEW.deps = '' OR NEW.deps = '[]')
  AND OLD.deps IS NOT NULL AND OLD.deps <> '' AND OLD.deps <> '[]'
BEGIN
  UPDATE service_registry SET deps = OLD.deps WHERE service = NEW.service;
END;
```

Falsification-tested: `UPDATE service_registry SET deps='[]', version='9.9.9-test'
WHERE service='qnfo-kaizen'` returned `changes:2`, the row kept its deps, and the
version change still applied (so the guard does not block legitimate updates).

## Source patch — 3 hunks

### Hunk 1 — upsert SQL: keep existing deps when the incoming value is empty
Appears twice (registryRefresh `upsert`, and the same statement shape in registryRegister).

Find:
`... models=excluded.models, deps=excluded.deps, updated_at=excluded.updated_at`

Replace:
`... models=excluded.models, deps=CASE WHEN excluded.deps IS NULL OR excluded.deps IN ('','[]') THEN COALESCE(service_registry.deps, excluded.deps) ELSE excluded.deps END, updated_at=excluded.updated_at`

### Hunk 2 — FLEET loop: stop hardcoding empty deps
Find (line 2840):
`deps: [] });`

Replace:
`deps: (h.body && Array.isArray(h.body.deps) && h.body.deps.length) ? h.body.deps : null });`

`null` lets Hunk 1 retain the stored value; a worker that self-describes `deps` in its
`/health` payload can now set them properly.

### Hunk 3 — registryRegister: null-not-empty rule
Find:
`JSON.stringify(body.deps || [])`

Replace:
`body.deps && body.deps.length ? JSON.stringify(body.deps) : null`

## Verification after deploy

1. `SELECT service FROM service_registry WHERE kind='worker' AND (deps IS NULL OR deps='[]')`
   → must return only `cloudflare-quniverse` (kind=`account`, legitimately empty).
2. Re-run the empty-write test on one FLEET row and confirm deps survive **with the
   trigger dropped**, to prove the code fix (not the trigger) is doing the work.
3. Watch one `*/30` cycle: all 12 FLEET rows must keep their deps.

## Why this was not deployed from qnfo-ops

- `cf_worker_deploy` is scoped to workers **without** a wrangler.toml; qnfo-ops has one
  carrying `[limits] cpu_ms = 300000`, which must not be lost.
- `POST /redeploy` on qnfo-fleet-deploy requires `DEPLOY_ADMIN_TOKEN`, not held here.
- `github_file_write` cannot carry the 233,907-byte `worker.js`.
- Apply through the normal wrangler pipeline.
