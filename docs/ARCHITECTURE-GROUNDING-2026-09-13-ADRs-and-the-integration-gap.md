# Architecture grounding — the fleet already decided this, and is violating its own decision

Author: qnfo-ops (ops-exec), 2026-09-13 ~14:00Z. Every ADR below is a verbatim live return from
`qnfo-audit.adr`. This replaces the *inferred* architecture in
`docs/FULLSTACK-INTEGRATION-PLAN-2026-09-13.md` §2 with the fleet's own accepted doctrine.

The earlier plan derived a target architecture from observed failures. That was unnecessary: the
fleet keeps **9 architecture decision records**, and the governing ones are **already `accepted`**.
The integration gap is therefore **not a design gap. It is an enforcement gap.**

---

## 1. The governing doctrine, in the fleet's own words

### ADR-2026-011 — `accepted` — "D1 Universal Registry - If It Is Not In D1, It Does Not Exist"

> **Context:** Red-team audit found: 6 unregistered D1 databases, 11 stale Workers, 23 stale Pages,
> 380 stale R2 records, 0 registry tables for KG/Vectorize/Queues, 7 empty tables, 12 untracked
> domains. **Only 56% of ecosystem had D1 registry coverage.**
>
> **Decision:** Every ecosystem object (R2 file, Worker, Pages project, KG node, Vectorize index,
> Queue, skill, publication, session, domain, repo) MUST have a corresponding D1 record in a typed
> registry table. **D1 is the single source of truth for existence.** Cross-system integrity checks
> must verify D1 vs live state at every session start.
>
> **Consequences:** 3 new registry tables created: `kg_nodes`, `vec_indexes`, `cf_dos`. 6 D1
> databases registered. 11 stale Workers archived. 23 stale Pages archived. 10 repos seeded.
> `repo_inventory` now at 34 rows. `social_media_posts` table exists but 0 rows. `project_state`,
> `pipeline_tasks`, `pipeline_status`, `subtasks`, `dead_links` tables exist but 0 rows.

This is precisely the "one writer per fact" rule the earlier plan inferred — stated as accepted
policy four months earlier, with the coverage number (56%) already measured at the time.

### ADR-2026-012 — **`proposed`** — "Infrastructure Foreign Key Constraints - D1 as Active Infrastructure Enforcer"

> **Context:** D1 `qnfo-audit` schema has **NO foreign keys** between infrastructure tables:
> `dns_redirects`, `audit_pages`, `audit_workers`, `cf_pages_domain_mappings`,
> `cf_dynamic_redirect_rules`, `r2_files`, `cf_queues`. **This means D1 is a passive registry** — it
> cannot prevent infrastructure anomalies…
>
> **Decision:** All infrastructure registry tables SHALL have foreign key constraints…
> **The D1 schema IS the architecture model; FK constraints are the formal verification that
> infrastructure operations are valid.**
>
> **Consequences:** `cf_pages_domain_mappings`: FK added. `r2_files`: **FK pending table
> migration**. `dns_redirects`: **conditional FK design … requires CHECK constraint or split
> columns**. `cf_dynamic_redirect_rules`: **FK pending**. `cf_queues`: **table pending creation**.

**Status: `proposed`, never `accepted`.** The mechanism that would make ADR-2026-011 enforceable —
referential integrity at INSERT time — was designed and left unbuilt. This is the missing piece.

### ADR-013 — `accepted` — "WBS-Keyed R2 — No WBS, No Go"

> **Decision:** EVERY R2 object key MUST follow:
> `projects/<PORTFOLIO.PROGRAM.PROJECT.PX.TY>/<filename>`. No flat directories. No un-keyed objects.
>
> **Consequences:** 1. All non-WBS-keyed R2 objects deleted. 3. Registry-sync enforces WBS gate on
> uploads. 4. New R2 objects get WBS prefix or rejected.

Relevant to this session's R2 finding: `releases/2026/09/1-introduction.md` and
`releases/2026/09/operationalizing-infomatics.md` (the 97-byte stubs) are **date-keyed, not
WBS-keyed**. I do **not** claim this is an ADR-013 violation — `qnfo-releases` may be a documented
publication exception — but no such exception appears in the ADR, so it is an open question.

### ADR-026 / ADR-027 — `active` — repository scope separation

> **ADR-026:** "qnfo-skills repository is strictly and exclusively for skill files … Enforced via
> root-anchored default-deny allowlist `.gitignore`, **not just written policy**."
> Rationale: *"Documentation-only policy proved insufficient — non-skill commits slipped through
> 3 times before being caught."*
>
> **ADR-027:** "Non-negotiable invariant: research and skills never share a repository, branch, or
> commit."

ADR-026's rationale is the session's own lesson stated in advance: **written policy without
structural enforcement fails.** ADR-2026-011 is written policy. ADR-2026-012 is the structural
enforcement. It is `proposed`.

---

## 2. The fleet is violating ADR-2026-011 right now

ADR-2026-011 requires every Worker to have a D1 registry row, D1 to be the single source of truth
for existence, and D1-vs-live verification at every session start. Measured this session:

| ADR-2026-011 requirement | live state |
|---|---|
| every Worker has a registry row | **38 probed worker names have no row** — `service_registry` holds exactly the 55 the listing returns (`deployed_not_in_registry = []`, `registry_not_deployed = []`) |
| D1 is the single source of truth | **7 stores disagree**: 10 / 37 / 43 / 55 / 80 / 92 / 97 |
| integrity check vs live at session start | no such check fires; the drift scan reads an unstable census (`scanned=52, 55, 75, 77, 80`) |
| registry coverage grows | **it shrank**: the 2026-09-07 design doc records 76 rows; live is 55 |

Concrete violations:

- `qnfo-pipeline-ops` is **live** (wrote 910 `alerts` rows at 2026-09-13T12:16:00Z) and has **no
  registry row**.
- `qnfo-ai-chat`, `personal-api-chat` exist only as strings inside a `worker-health` payload — no
  registry row, no probe row, no repo dir.
- `audit_workers` (37 rows, all legacy, `in_discovery_index=0` for every row) is a registry table
  that was abandoned rather than retired.
- `deployment_history` and `fleet_deploys` are two deploy ledgers with different last-write times
  (2026-09-11T10:34:07Z vs 2026-09-13T13:01:23Z) — two writers for one fact, which is what FKs
  (ADR-2026-012) would have prevented.

**ADR-2026-011's own context paragraph already measured this in July: "Only 56% of ecosystem had D1
registry coverage."** The number today is not better.

---

## 3. `self_heal_actions` — handoff figures confirmed exactly

| status | n |
|---|---|
| `healed` | 528 |
| `deferred` | **445** |
| `detected` | 170 |
| `resolved` | 130 |
| `failed` | 50 |
| `dispatched` | 35 |
| **`executed`** | **10** |
| `no-action` | 4 |

Total 1,372. The handoff's figures — detected 170, deferred 445, healed 528, resolved 130,
failed 50, dispatched 35, executed 10 — are **confirmed without correction**.

The skew is the finding: **`deferred` (445) is 44× `executed` (10)**, and `detected` (170) is 17×
`executed`. The decision plane detects and defers, and almost never executes. This is the same
shape as every other plane in this session — the detector works, the actor does not.

---

## 4. What this changes in the plan

The earlier remediation queue (§6 of the plan doc) targeted symptoms: disarm auto-heal, repair
alert delivery, enrich 48 registry rows. Those remain correct and urgent. But the root item is now
identifiable and it is a **governance** item, not a code item:

| # | fix | target | why |
|---|---|---|---|
| 0 | **Accept and implement ADR-2026-012** | FK constraints on the infrastructure registry tables | it is the enforcement mechanism for ADR-2026-011; without it D1 is "a passive registry" by the ADR's own words |
| 0b | Reconcile the seven stores to one | declare `service_registry` authoritative; retire `audit_workers`; merge `deployment_history` into `fleet_deploys` | ADR-2026-011 requires exactly one source of truth |
| 0c | Make the integrity check real | a session-start check comparing D1 against the live census | ADR-2026-011 mandates it; it does not exist |

ADR-026 already proves the fleet knows written policy alone fails — it adopted a default-deny
`.gitignore` allowlist precisely because documentation "slipped through 3 times". ADR-2026-011 is
in exactly that position, and has been for four months.

---

## 5. Limits

- The ADR table holds **9 rows**; I read the 6 most recent by rowid. Older ADRs (000–009) were not
  read and may contain further binding doctrine — including a possible exception covering
  `qnfo-releases` key format.
- "38 workers have no registry row" follows from `registry == fleet listing` plus the probe-log
  difference; it assumes the registry is complete for the 55, which is the claim under test.
- The 76→55 registry shrinkage comes from a **document** (`docs/CLOUDFLARE-CAPABILITY-INTEGRATION.md`,
  2026-09-07), not a live measurement — I cannot verify the 76 today.
- `self_heal_actions` has no timestamp column in the queried shape, so the distribution is
  lifetime, not current; I cannot say when the 10 `executed` occurred.
- `fleet_cal_*`, `fleet_audit_runs`, `adr_affected_resources`, `adr_tags`, `decisions`,
  `experiments`, `evolve_*`, `autonomy_scores` were not examined.
- Still blocked: no D1 write, no mail-config tool, no deploy tool, no branch-create (no PR),
  `qnfo-canonical` R2 unbound.
