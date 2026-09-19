# CAPABILITY-ADVERTISING-CONTRACT-1 (v1.0, 2026-09-19)

**Status:** normative — binding on every QNFO fleet worker, endpoint and model.
**Enforcement:** qnfo-ops `GET /capability-audit` (paginated conformance report) and the
fleet scan. A worker that violates this contract is non-conforming and must be remediated.

## 0. Why this contract exists

The fleet is consumed by autonomous agents and by thin clients (DeepChat / ChatBox /
SannaBot). Those consumers route work by reading advertised capabilities. If an endpoint
advertises a capability it does not have, or silently omits a restriction it does have,
callers make wrong routing decisions with no way to detect it. This was observed in
production: **8 of 11 models on `qnfo-ops` advertised identical, incorrect
"DeepSeek V4 Flash relay" metadata**, `ops-frontier-mini` and `ops-frontier-reason` were
advertised as distinct models while executing the identical loop and upstream, and
`ops-exec` was advertised as DeepSeek while routing through the AI Gateway.

Fleet baseline measured 2026-09-19 (51 registered services): **0 of 49 healthy workers
advertised a `limitations` field; 45 of 49 advertised empty/zero capabilities.**

## 1. Scope

Applies to every service in `service_registry` (kind = worker or endpoint) and every
model advertised by an inferer (e.g. `qnfo-ops`, `qnfo-ai`, `personal-api`).

## 2. Required fields

### 2.1 `GET /health` (and registry row mirrors)

| Field | Type | Rule |
|---|---|---|
| `worker` / `service` | string | stable identity |
| `version` | string | the deployed version; must equal the deployed artifact's `VERSION` |
| `capabilities` | string[] | **non-empty.** One entry per capability actually implemented. No aspirational entries. |
| `limitations` | string[] | **non-empty.** One entry per material restriction, failure mode or unsupported operation. |
| `routes` | string[] | the routes actually served |

### 2.2 Model advertisement (`GET /v1/models`)

Each model object MUST carry:

| Field | Type | Rule |
|---|---|---|
| `id` | string | the id accepted by the chat endpoint |
| `execution` | string | one of `server-side-agent-loop`, `pass-through-relay`, `workers-ai-relay`, `inference-only`. MUST match the real routing. |
| `capabilities` | string[] | non-empty; include `tool_use` **only if the model can actually call tools** |
| `limitations` | string[] | non-empty |
| `_router.upstream` | string | the ACTUAL upstream model id. MUST NOT be the display id when they differ. |
| `_router.family` | string | the real upstream vendor family |

### 2.3 Truthfulness rules

1. **R1 — No phantom capability.** A capability listed in `capabilities` must be reachable
   in production. If a feature is pilot/binding-gated, it must appear in `limitations`, not
   only in `capabilities`.
2. **R2 — No hidden limitation.** Any known restriction (auth required, no client tool
   handoff, execution confined to the Workers runtime, no vision, alias-not-distinct,
   daily caps) MUST appear in `limitations`.
3. **R3 — Alias honesty.** If two ids route to the same loop and the same upstream, they
   MUST either be advertised as aliases (`limitations` says so) or be given distinct
   upstreams. Advertising them as distinct while they are identical is a violation.
4. **R4 — Upstream honesty.** `_router.upstream`/`family` reflect the real backend. A model
   named `gpt-*` must not advertise `family: deepseek`.
5. **R5 — Weak-agent declaration (agent/code execution).** Every model that CANNOT execute
   code/tools server-side MUST declare it in `limitations`, e.g.
   `"pass-through relay only: does NOT execute code or tools server-side"`.
   Every model that CAN execute MUST declare the execution scope, e.g.
   `"execution scope is the Cloudflare Workers runtime only (no real subprocess/VM)"`.
6. **R6 — Single source of truth.** Advertised metadata is derived from the routing
   constants, never hand-duplicated. Duplicated literal model arrays are prohibited
   (they drift).

## 3. Conformance check (machine)

`qnfo-ops` implements `GET /capability-audit?offset=&limit=` (auth: `OPS_ROUTER_AUTH_KEY`
or `REGISTRY_TOKEN`). For each registered service it fetches `/health` and marks the
service conforming iff:

- `res.ok` is true, AND
- `Array.isArray(health.limitations) && health.limitations.length > 0`, AND
- advertised capabilities count > 0.

Response shape:

```json
{ "ok": true, "total": 51, "checked": 25, "conforming": 0,
  "non_conforming": [ { "service": "...", "reason": "missing-limitations" } ],
  "contract": "CAPABILITY-ADVERTISING-CONTRACT-1", "generatedAt": "..." }
```

Reasons: `unhealthy:<status>`, `no-json`, `missing-limitations`, `empty-capabilities`,
`unreachable`.

## 4. Remediation obligations

A non-conforming worker is remediated by editing its canonical source (repo `main` for
repo-mirrored workers) to add `limitations` and a true `capabilities` list, then
redeploying through the deploy guard. Detection without remediation is not compliance
(FILING-NOT-FIXING-1).

## 5. Reference implementation

`qnfo-ops` v2.36.24: `manifest()` carries `limitations`; `/health` exposes it;
`/v1/models` derives all 19 model entries from `OPS_EXEC_MODELS` / `PASSTHROUGH_MODELS` /
`WAI_PASSTHROUGH` via a single `opsModelCatalog()`, each with an `execution` mode and a
`limitations` array.
