# Workers standards (WORKERS-STANDARDS-DOC-1)

> Version 1.0 (2026-10-12). Charter pillars: security, core, autonomy, research. Owner directive 2026-10-12: implement all fixes, best
> practices and suggestions of the five October 2026 research reports (Cloudflare Workers production practice, 2026 platform changes,
> fleet upgrade guide, hardening list, research-paper pipeline) system-wide, permanently and automatically.
>
> This file is the standing standard. It names each item, its disposition in this fleet (applied, enforced, measured, issue, or not
> applicable with the reason), and the mechanism that keeps it true. It changes by pull request. The measurements it cites are read
> from `origin/main` and qnfo-audit on the date given.

## 1. How the standard is kept (the loop)

| Layer | Mechanism | What it does |
|---|---|---|
| Refuse regressions | `scripts/workers_standards_guard.py` (deploy-gate step WORKERS-STANDARDS-GUARD-1, rev 3) | Diff-only: fails a change that **adds** an anti-pattern (section 3) or weakens observability. Existing debt never blocks unrelated work. A false positive carries `// standards-ok: <reason>` or a line in `scripts/workers-standards-allowlist.txt`. |
| Measure the debt | `scripts/fleet_best_practices_audit.py --d1` (WORKERS-BP-AUDIT-D1-1), run by `scripts/loop_breaker_runner.py` in the remediation-consumer step | Whole-tree scan of every live worker. Writes `workers_bp_findings` (replaced each run), `workers_bp_runs`, `v_workers_bp_debt`, metrics `workers_bp_findings_open` (target 0) and `fleet_cron_triggers` (limit 250). |
| Hand it to a doer | the same runner | One `WORKERS-BP-DEBT-1: <worker>` issue per worker with fail-class findings, deduped on the open title, listing each finding as `[check] file:line text` with `code-task:` and `code-anchor:` lines for the code loop (ACT-BRIDGE-1). |
| Close on evidence | d1-query probes on `workers_bp_findings` | Each debt issue and issues 2340, 2341, 2342, 2347, 2348, 2399 close when the latest run (at most 26 h old, else `no-run`) shows zero rows for their check. |
| Refile on recurrence | `analytics_metric_triggers` on `workers_bp_findings_open` and `fleet_cron_triggers` | A breach files its METRIC-TRIGGER issue; `fm-workers-standards-debt-unmeasured` detects a runner that stopped. |
| Apply declared config | qnfo-ops canonical deploy (`/ops/deploy`) | Sends `compatibility_date`, `compatibility_flags`, bindings, containers, `observability` (2.41.0, OBSERVABILITY-DECLARED-APPLY-1) and a reviewed compatibility date (2.42.0, PR 1016). `limits` is not carried yet (section 5). |

The report form is `python3 scripts/fleet_best_practices_audit.py [--json] [--check <name>] [--worker <dir>]`; the suites are
`scripts/fleet_best_practices_audit.py --selftest`, `scripts/workers_standards_guard.test.py`, `scripts/loop_breaker_runner.py --selftest`.

## 2. Configuration standard (`wrangler.toml`)

Every live worker declares:

```toml
compatibility_date = "<reviewed date; see section 4>"

[observability]
enabled = true
head_sampling_rate = 1

[observability.logs]
enabled = true
invocation_logs = true
head_sampling_rate = 1          # lower only on a high-traffic public worker

[observability.traces]
enabled = true
head_sampling_rate = 0.05       # 0.01 gateway/dashboard/qnfo-ai, 0.1-1 for cron-only workers; stored traces bill from 2026-12-01

[[queues.consumers]]            # when present
dead_letter_queue = "<queue>-dlq"
```

| Item (report) | Disposition 2026-10-12 | Kept by |
|---|---|---|
| Logs and traces declared, sampling explicit (R1 §2, R2 §2, R3 #1, R4 §2) | Applied: 27 of 28 live tomls on main; qnfo-cloud-ops in this PR; qnfo-code-orchestrator in PR 960; qnfo-intent-orchestrator in PR 1016. Live settings applied by qnfo-ops 2.41.0; drift watch is issue 2394. | guard rules `new-worker-observability`, `observability-removed`, `traces-removed`, `observability-disabled`, `observability-incomplete`; audit checks `observability-missing` (fail), `traces-not-declared` (fail), `sampling-not-explicit`. |
| Trace sampling before 2026-12-01 billing (R1 §2, R4 §2) | Applied: every traces block carries a rate (TRACES-SAMPLING-BEFORE-BILLING-1, PRs 994/1008); issue 2348 now has a probe. | audit `sampling-not-explicit`. |
| Dead-letter queue on every consumer (R3 #6, R4 §4) | Applied: the one live consumer (qnfo-ops jobs) has `qnfo-ops-jobs-dlq`. | guard `queue-consumer-no-dlq`; audit same (fail). |
| `send_email` restricted (R1 §11) | qnfo-fleet-dashboard restricts destinations. qnfo-cloud-ops sends outreach to arbitrary recipients, so only a sender restriction applies; recorded as advisory `send-email-unrestricted` until the canonical deploy's binding installer carries `allowed_sender_addresses` (issue filed with this PR). | guard `send-email-unrestricted` (new blocks); audit advisory. |
| Durable Objects on SQLite storage (R1 §12, R2 §4) | Applied: every DO namespace in the account is `use_sqlite:true`; configs use `exports`/`new_sqlite_classes`. | guard `legacy-do-storage`; audit advisory. |
| Secrets never in `[vars]` (R1 §4, R3 #5) | Applied: zero secret-like keys in any live `[vars]` (measured 2026-10-12); the root stub was scrubbed 2026-09-29. | SECRET-IN-PUBLIC-REPO-1 history; audit scan of `[vars]` names is a follow-up (section 6). |
| Cron triggers against the 250-per-account limit (R1 §9, R3 #13) | Measured: 32 across 28 live workers. | metric `fleet_cron_triggers`, trigger at 200; CRON-RATE-CEILING-1 keeps each schedule at or under 144 fires a day. |
| `[limits] cpu_ms` runaway guard (R1 §13, R2 #25, R3 #4) | Not yet carried by the canonical deploy (only qnfo-ops declares it, and the raw content PUT ignores the key). Declaring it fleet-wide now would be inert config, the class of defect behind #1337. Disposition: LIMITS-DECLARED-APPLY-1 issue (qnfo-ops code task), then values from invocation-log P99 per worker. | audit advisory `limits-not-declared`. |
| `upload_source_maps` (R3 #2) | Not applicable: workers are single-file `worker.js` uploaded as content, no bundler, no map to upload. | documented here. |
| `wrangler.jsonc`, `$schema`, `wrangler types` (R1 §3, R2 §8, R3 #20) | Not applicable now: the fleet is plain JavaScript deployed by API; the toml is the spec the deploy reads (`parseDeclaredObservability`, compat parsing). A format move is a no-op change deferred until a JSON-only Wrangler feature is needed. | documented here. |
| Smart Placement, gradual deploys, Workflows for crons, D1 batching (R2 §7, R3 #16-18, R4 §4) | Issue 2398 (FLEET-HARDENING-3), per component with canary and revert. Workers Cache is not enabled anywhere: every public page is personalised or authenticated at the edge. | issue 2398. |
| Observability drift (declared vs live) | Issue 2394 (loopWatch tick in qnfo-fleet-control). | issue 2394. |

## 3. Code standard (`worker.js`)

| Pattern | Rule | Disposition 2026-10-12 | Kept by |
|---|---|---|---|
| Secrets compared with `===`/`!==` (R1 §4, R4 §3) | SHA-256 both sides, then `crypto.subtle.timingSafeEqual` or an XOR loop over equal-length digests; fail closed when the secret is unset. | Fixed in q08 (PR 957), gateway (961), dashboard (963), infra (`indexTokenOk`, `auth`), ai-search (`secretEq`), subscribers (`safeEqual`), deploy-guard, radar-hub, qnfo-ai, qnfo-ops. Remaining on main: qnfo-cloud-ops (PR 1010), qnfo-research-exec (5 sites, file claimed by the code loop), qnfo-fleet-control (issue 2395). | guard `secret-compare` (fail); audit same; probe on issues 2340/2347. |
| `Math.random()` for ids or tokens (R1 §4, R4 §3) | `crypto.randomUUID()` or `getRandomValues` with rejection sampling; jitter and sampling may keep `Math.random`. | Fixed in personal-api (4.8.6), q08, ai-calibration (1.3.4), deploy-guard (1.3.24), radar-hub (1.3.5), qnfo-ops randId (2.41.0). Remaining: cloud-ops, code-orchestrator, fleet-control, fleet-dashboard, intent-orchestrator, qnfo-ops (1 suffix): each gets its WORKERS-BP-DEBT-1 issue from the first runner pass. | guard `math-random-token` (fail); audit same; probe on issue 2341. |
| Interpolated SQL in `prepare(\`...${}\`)` (R1 §7) | Bind parameters; chunk inserts to at most 100 bound parameters. | Zero sites on main. | guard `interpolated-sql` (fail, new in rev 3); audit same. |
| Floating promises, destructured `ctx`, `passThroughOnException` (R1 §5, R2 §3) | Await, return or `ctx.waitUntil`; never `const { waitUntil } = ctx`; try/catch with a structured 500. | Zero sites on main (the `passThroughOnException: function () {}` members of folded-module stub contexts are not calls). | guard `floating-promise`, `destructured-ctx`, `pass-through-on-exception`; audit. |
| Swallowed errors (R3 #10, issue 2342) | A caught error is logged as structured JSON (`console.error(JSON.stringify({evt, error}))`) or recorded; never `catch (e) {}`. | 545 advisory sites across 22 workers (measured by the audit). Per worker, highest traffic first; the guard stops new ones. | guard `swallowed-catch` (new); audit advisory; probe on issue 2342. |
| Workers AI response shape (R2 §5) | Normalise: `response` may be an object in JSON mode; OpenAI-compatible models answer in `choices[]`. | qnfo-ai `aiText` and the per-worker wrappers normalise; zero bare `.response.trim()` sites. | guard `ai-response-string-assumption` (new); audit. |
| Workers AI token budget and gateway (R2 §5, R3 #7) | Explicit `max_tokens`/`max_completion_tokens` per call; calls routed through the qnfo-ai router or the default AI Gateway. | 1 call without a budget (qnfo-research-exec, issue 2399 with probe). Direct `env.AI.run` without a gateway: 17 workers, by design behind the router's budget (BUDGET-SOFT-ROUTE-1); the gateway item stays in issue 2346. | audit `ai-run-no-token-budget`. |
| Unbounded body buffering (R1 §6) | Stream through; check `Content-Length` before `request.text()`. | 3 advisory sites (dashboard, lifecycle, pdf), all behind a token or a route with a small body. | audit `unbounded-body-buffer`. |
| REST API where a binding exists (R2 §3) | Use the binding. | Zero D1/KV/R2/Queues REST sites; the Cloudflare API is used only for things no binding reaches (deploys, settings, telemetry). | audit `rest-api-for-binding`. |
| `message.raw` read twice (R1 §11) | Buffer once, reuse. | Zero sites. | audit `message-raw-double-read`. |
| Worker-to-worker calls over public URLs (R1 §8) | Service bindings with `props = { caller }` (INTERNAL-CALLER-PROPS-1). | Bindings carry the authenticated paths; `global_fetch_strictly_public` is set where a same-zone fetch is unavoidable (FLEET-PROBE-1042-1). | CLAUDE.md #1703; COMPAT-VERIFY-RUNNER-1 (issue 2411) for the remaining health reads. |

## 4. Compatibility date

- The canonical deploy applies a **reviewed** date: a toml carries `# compat-advance: reviewed <date>` and `scripts/compat-risk-scan.mjs`
  reports the code patterns that change meaning across 2026-08-04 (`process.env` populated with secrets, Node `Timeout` objects from
  timers, `nodejs_compat_v2` bundle size) and 2026-10-01 (Durable Object I/O prevents eviction). PR 1016, COMPAT-DATE-DECLARED-APPLY-1;
  canary cohort qnfo-intent-orchestrator and qnfo-memory-mcp (issue 2401); the health-read gap for 18 workers is issue 2411.
- Fleet state 2026-10-12: 24 workers at 2026-08-01, qnfo-ai-search 2026-07-09, qnfo-pdf 2026-03-24, qnfo-fleet-control 2026-09-08,
  qnfo-lifecycle and qnfo-memory-mcp 2026-08-10. Only qnfo-research-exec imports `node:*` and it carries `nodejs_compat`.
- **Tested belief**: the reports say a redundant `nodejs_compat` flag at a date of 2026-08-04 or later is a hard error. Measured here:
  qnfo-fleet-control deploys at 2026-09-08 with `nodejs_compat` through the API and passes `wrangler deploy --dry-run` in deploy-gate.
  So the flag is redundant, not fatal: the audit reports `redundant-nodejs-compat` as advisory and the date bump removes it. The one
  real failure shape is an opt-out (`no_nodejs_compat`) on a worker that imports `node:*`; the guard refuses that (`node-opt-out-with-imports`).

## 5. Follow-ups filed from this standard

| Issue | Item | Doer |
|---|---|---|
| LIMITS-DECLARED-APPLY-1 (filed with this PR) | the canonical deploy carries `[limits]` (`cpu_ms`, `subrequests`) in the upload metadata as it carries `observability`; then per-worker values from invocation-log P99 | qnfo-ops code task |
| SEND-EMAIL-SENDER-RESTRICT-1 (filed with this PR) | the deploy's binding installer carries `allowed_sender_addresses` for `send_email`; qnfo-cloud-ops then declares its sender | qnfo-ops code task, then qnfo-cloud-ops toml |
| 2346 WORKERS-STANDARDS-FOLLOWUP-1 | D1 telemetry helper (`rows_read`/`rows_written` per worker), polling crons to Queues/Workflows, direct `env.AI.run` through the gateway | sessions and the code loop, per worker |
| 2394, 2388 | observability drift watch; redeploy gateway and containers-pilot so declared traces reach live | qnfo-fleet-control loopWatch; next canonical deploy |
| 2396, 2397, 2398 | API retry with jittered backoff; heartbeat-absence and 5xx alerts; Smart Placement, gradual deploys, Workflows, D1 batching | code loop (2396), sessions |
| 2371 | weekly export of every fleet database beyond the 30-day Time Travel window | scripts/continuity_snapshot.py |

## 6. Research-paper pipeline (report 5)

The pipeline is qnfo-research-exec (ground, ensemble, reconcile, complete, review, revise, verify, publish). Dispositions:

| Report item | Disposition |
|---|---|
| Papers never published cut off; no length cap; practical-implications section (§4, §S.1) | PR 1009 (0.14.0 PAPER-COMPLETE-1): `complete` stage, completeness sweep of published papers. |
| Provenance and AI-involvement disclosure; retrieved-text sanitizer; chatbot-residue hard fail; TRL-scaled §7; contributions, falsification, limitations (§9.1, §1.2, §6.4, §S.1, §S.2) | PR 1015 (0.15.0 PAPER-QUALITY-2). |
| Verify at stated precision; second grounding source; no unresolved HARD finding or unconfirmed citation published (§7.3, §8.1) | PR 990 (0.13.0), merged. |
| Paper contract and section-wise drafting (§2.1, §2.2) | issue 2402 PAPER-CONTRACT-1 |
| Cross-family writers and reviewer panel (§2.3, §5.1) | issue 2403 CROSS-FAMILY-1; docs/ENSEMBLE-POLICY.md |
| Per-citation support (entailment) check and metadata match (§8.1, §8.2) | issue 2404 CITE-SUPPORT-1 |
| Step-level SymPy derivations, units, sanity bounds, text-to-script numbers (§7.1-7.3) | issue 2405 VERIFY-DERIV-1 |
| Claim-level reconcile and deterministic consistency pass (§3.1, §3.2) | issue 2406 CLAIM-LEDGER-1 |
| Slop-marker scan as SOFT findings (§6.4) | issue 2407 SLOP-SCAN-1 |
| Golden set, seeded defects, quality dashboard with audit sampling (§10.1, §10.2) | issue 2408 PAPER-GOLDEN-1 |
| Literature-grounded novelty screen (§0.1) | issue 2409 IDEA-NOVELTY-1 |
| Google Scholar tags with a linked PDF; JSON-LD; immutable versions and errata (§9.2-9.4) | qnfo-gateway emits `citation_*`, `citation_pdf_url` when a PDF exists and ScholarlyArticle JSON-LD; every paper gets a PDF under issue 2410 SCHOLAR-PDF-ALL-1; versions and errata are the errata module of qnfo-research-exec. |

These issues are open in `v_issue_queue` with doers; qnfo-research-exec/worker.js is claimed by the code loop and the stacked PRs
990 -> 1009 -> 1015 while this standard is written, so a session takes them when the claim lapses (WORK-CLAIM-1).

## 7. Sources

The five research reports of 2026-10-12 (owner upload); Cloudflare Workers Best Practices (updated 2026-09-24); Compatibility flags;
Workers Logs and Traces; Workers and D1 limits (2026-10-08, 2026-04-21); Queues dead-letter queues; Email Service send bindings;
Rules of Durable Objects (2026-08-20); Rules of Workflows (2026-10-08). CLAUDE.md sections Deploys, Migrations, Anti-fragile by
default, Measuring and improving effectiveness.
