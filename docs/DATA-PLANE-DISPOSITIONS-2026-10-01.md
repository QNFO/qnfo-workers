# Data plane dispositions (2026-10-01)

DATA-PLANE-REGISTER-1. The audits on 2026-09-30 filed several "dead table" issues. Each one was checked against the
repository: does any worker write the table, and does any live worker read it? The outcome is recorded in
`qnfo-audit.data_plane_register` (migration `2026-10-01-data-plane-register.sql`).

Before filing an issue about an empty table, check this register.

| Issue | Plane | Disposition | Where the function lives now |
|---|---|---|---|
| #1638 | qnfo-graph `qacp_*` | UNBUILT-DESIGN | Inter-worker calls use service bindings and HTTP routes. |
| #1645 | qnfo-audit `experiments` | UNBUILT-DESIGN | Changes are measured by metric triggers (METRIC-TRIGGER-LOOP-1), the daily worker census and the deploy gates. |
| #1650 | portfolio-state `pipeline_runs` | UNBUILT-DESIGN | `program_registry` is read live by qnfo-cloud-ops and qnfo-infra. No portfolio pipeline runs. |
| #1651 | living-paper `citations`, `citation_edges`, `paper_versions` | SUPERSEDED | `citation_stats` (OpenAlex/Crossref/Zenodo, daily) and `paper_revision_log.new_doi`. Zenodo version counts are recorded by qnfo-paper-indexer 3.0.6. The dashboard was re-pointed in 1.7.44. |
| #1656 | qnfo-audit `prompt_provenance` | SUPERSEDED | `ops_ai_log` (per-call model and tokens) plus AI Gateway caller metadata. `meta_claims` and `meta_changes` stay live (qnfo-kaizen). |
| #1657 | qnfo-cms `content`, `publish_queue` | UNBUILT / RETIRED-LANE | `content_entries` (145 rows) is the canonical table, read only ad hoc through qnfo-ops. The publish lane last ran 2026-06-25. |

Not dead:

- **#1659 `governance_kernel`** has 2 ratified versions (2026-09-01 and 2026-09-26). The active kernel carries
  `last_known_good_id = 2`, so a rollback target exists. `gov_gate_log` is actively written (95 decisions, last
  2026-09-30). New versions are expected only when the gate set changes.
- **#1675 capability loop**: `capability_catalog` is now re-synced daily from `service_registry` (cf-catalog-sync, new
  steps). A daily `cf-capability-discovery` event lists the Cloudflare products still `not_considered` (13) and
  `proposed` (1). Moving a product from `not_considered` to `proposed` to `in_use` is a scoped, judgement-led step. The
  `proposed` status is the hand-off.
