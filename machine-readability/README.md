# Machine-Readability Expansion (QNFO x Cloudflare self-knowledge)

Scope extension of the Cloudflare capability/self-knowledge integration (see
`docs/CLOUDFLARE-CAPABILITY-INTEGRATION.md` and `docs/CLOUDFLARE-INTEGRATION-VERIFICATION-2026-09-07.md`).

Goal: make every QNFO service/worker **self-describing and self-documenting in machine-readable form**
so agents, ops-exec, kaizen and Cloudflare advisors can (a) discover what exists, (b) know what a
component is for and how to drive it, (c) map issues to products, and (d) improve configurations -
without reading human prose or guessing.

## Layers

1. **Self-description** - every service publishes a JSON document matching
   `service-self-description.schema.json` (purpose, capabilities, routes, bindings,
   Cloudflare products used, health, docs pointers). Served at `/.well-known/self.json` (or `/self`),
   crawled into `service_registry` / `service_self_descriptions` by the registry refresh.
2. **Self-documentation** - every service exposes machine doc pointers: `llms.txt`,
   `/.well-known/agent-skills`, SKILL.md, changelog, OpenAPI where applicable. Prompts and code
   reference these URLs instead of duplicating knowledge.
3. **Machine-optimized code + LLM instructions** - each worker carries a machine-readable
   header block (`@self`, `@capability`, `@route`, `@bindings`, `@product`) plus a canonical
   self-documenting prompt (see `self-documentation.prompt.md`) so any future agent/model that
   reads the file can drive it correctly.
4. **Feedback** - advisory decisions (`cf_advisory_decisions` in D1) record proposal -> approval ->
   application -> before/after outcome; kaizen re-evaluates and reverts if benefit did not materialize.

## Files

| Path | Purpose |
|------|---------|
| `service-self-description.schema.json` | JSON Schema (2020-12) for `self.json` documents |
| `self-documentation.prompt.md` | Canonical self-documenting prompt template + embedding rules |
| `examples/qnfo-ops.self.json` | Filled example (qnfo-ops 2.5.1) |
| `qnfo-cloud-ops/migrations/2026-09-07b-machine-self-description.sql` | Additive D1 migration: registry columns, self-description store, advisory decisions |

## Consumption contract

- Registry refresh (`qnfo-ops /registry/refresh`) SHOULD publish `/self` for each managed service and
  backfill `purpose`/`capabilities` from it (additive; preserve REGISTRY-PRESERVE-1 self-registered rows).
- The Cloudflare advisor reads `service_self_descriptions.cloudflare_products` + `service_registry`
  to know what products each service already uses before recommending new ones.
- Every worker's prompt SHOULD embed the self-documentation template (section 3) so agents that load
  the file know: who they are, what they can do (from capabilities only), their output contract, and
  where to report improvement signals.
