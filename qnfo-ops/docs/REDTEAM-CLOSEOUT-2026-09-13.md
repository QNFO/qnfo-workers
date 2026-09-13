# Red-team remediation + test — CLOSEOUT (2026-09-13, qnfo-ops / ops-exec)

Trigger: user instruction "execute red team remediation and test".
Predecessors: `audits/2026-09-12-redteam-remediation.md`,
`audits/2026-09-13-redteam-test-closeout.md`, `audits/2026-09-13-fix-queue.json` (F1–F13),
`qnfo-ops/docs/REDTEAM-REMEDIATION-2026-09-13.md` (opening record, same session).

Everything below carries a live tool return from this session. Three commits landed.

---

## 1. Capability test — the central blocker was FALSE

The 2026-09-13 closeout asserted `github_file_write` was in "persistent failure
(31x / 168h no recovery)" and concluded that **no** repo-side remediation was possible.

| Test | Result |
|---|---|
| `github_file_write` new file | **OK** — commit `1cca0e95` |
| `github_file_write` update existing (sha supplied) | **OK** — commits `460481db`, `de86d3f4` |

**Verdict: the blocker is WITHDRAWN.** Three writes succeeded, two of them updates with
`sha`. Source remediation *is* shippable from this endpoint; only *deployment* is not.

---

## 2. Remediation executed

### 2.1 `ai-health-prober` v2.3.3 — commit `460481db`

**Defect found this session (not in any prior report).** The v2.3.2 header claims
ID-NAMESPACE-1 is fixed, but `MODELS[0]` still carried a **qualified** internal key:

```js
{ "internal": "@cf/qwen/qwen3.8-27b", "id": "@cf/qwen/qwen3.8-27b", "kind": "text" }
```

So the prober itself kept writing one row in the `@cf/` namespace it was supposed to
abandon. The v2.3.2 reconcile guard required `last_probe_ts IS NULL`, which exempted
exactly the raced row.

Live D1 `ai_model_health`, 24 rows, 2026-09-13T06:31Z — 5 qualified rows, all degraded,
all `consecutive_failures=0`:

| model_id | last_probe_ts |
|---|---|
| `@cf/baai/bge-base-en-v1.5` | NULL |
| `@cf/google/gemma-4-26b-a4b-it` | NULL |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | NULL |
| `@cf/zai-org/glm-5.2` | NULL |
| `@cf/qwen/qwen3.8-27b` | **1789280141458 (fresh, 06:15:41Z)** |

Two writers race on the fifth row: the prober writes `ok`, `qnfo-ai-calibration`
GW-DEGRADE-1/2 rewrites `degraded`.

Fix: `canonicalId()` choke point, `MODELS[0].internal` -> `qwen3.8-27b`, and the reconcile
extended to clear `@cf/`-prefixed rows with zero failure evidence.

**Tests (run_code, all pass):**

| # | Assertion | Result |
|---|---|---|
| 1 | qualified-id writes after fix | **0** (pre-fix: 1) |
| 2 | v2.3.2 predicate clears | 4 rows |
| 2 | v2.3.3 predicate clears | **5 rows** |
| 2 | rows the old guard missed | exactly `@cf/qwen/qwen3.8-27b` |
| 2 | non-`@cf/` rows wrongly cleared | **0** |
| 3 | written-key coverage | 10 keys, 15 uncovered rows |
| 3 | rows frozen at `1789145063740` (2026-09-11T16:44Z) | 6 |

Read-back confirms `VERSION = "2.3.3"`, sha `e0d50def`.

### 2.2 `qnfo-ai-calibration/apply-calibration-fix.mjs` v2 — commit `de86d3f4`

**Defect found this session: the v1 patcher was a NO-OP for FIX C.** v1's anchor was
reconstructed from a lossy read. Tested against verbatim source:

| v1 anchor | hits on real source | consequence |
|---|---|---|
| FIX A regex | 1 | applies |
| FIX C regex | **0** | skip-guard also absent -> `problems.push` -> **exit 2, nothing written** |
| FIX B literal `failing_models: Object.keys(failing),` | unverifiable | live digest key is `failing`, not `failing_models` |

So the v1 artifact, which the fix queue treated as the shipped F1/F2/F3 remediation,
would have applied **nothing** and exited non-zero. v1's stated cause (web_fetch HTML
stripping) was wrong; the real cause is that the anchor assumed
`r.status === 200 && echo`, while the source is
`r.status === 200 && !!content && String(content).trim().length > 0 && echo`.

v2 adds, all anchored on verbatim source:

- **FIX A** — DeepSeek catalogue-alias assertion (unchanged, verified 1 hit)
- **FIX B** — two candidate anchors; refuses to write if neither matches
- **FIX C** — repaired anchor (verified 1 hit); `echo` retained in the detail string
- **FIX D (new)** — RC-1 gateway-sweep replay signature guard + `gw_sweep_last_sig` persistence
- **FIX E (new)** — RC-2: `internalId()` can no longer return a qualified `@cf/` key
- **FIX H (new)** — RC-5: vision results persisted under a distinct `<model>:vision` key

**Tests (run_code, all pass):** 7/7 anchors match **exactly once** -> patcher will not
refuse. Replay guard: identical sweep -> SUPPRESSED; changed sweep -> INSERTED;
signature order-independent (confirmed).

---

## 3. RC-1 quantified — stronger than previously reported

`ai_gateway_failures` grouped by model+status+class (D1, 2026-09-13):

| model | status | class | rows | first_ts | last_ts |
|---|---|---|---|---|---|
| `@cf/google/gemma-4-26b-a4b-it` | 400 | image-input | 380 | 1788595252513 | 1789281039437 |
| `@cf/moonshotai/kimi-k2.6` | 429 | rate-capacity | 380 | 1788595252513 | 1789281039437 |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | 400 | content-shape | 379 | 1788595252513 | 1789281039437 |
| `@cf/baai/bge-base-en-v1.5` | 429 | rate-capacity | 377 | 1788595252513 | 1789281039437 |
| `@cf/zai-org/glm-5.2` | 400 | tool-args-json | 377 | 1788595252513 | 1789281039437 |
| `@cf/qwen/qwen3.8-27b` | 400 | upstream | 315 | 1788703207460 | 1789281039437 |

**Six classes share ONE `first_ts` and ONE `last_ts`.** Interval
1789281039437 - 1788595252513 = 685,786,924 ms = **7.94 days**; at a `*/30` cron that is
**~381 sweeps**; the row counts are **~381**. i.e. exactly one re-inserted row per class
per sweep — `start_time` is not honoured. The 24h auto-close is defeated, which is why
`[gw-fail]` #654–#660 and #670 are structurally unclosable.

---

## 4. New findings from this session's live reads

**N-A — the two-store backlog is 294 open, not 24.**
`agent_issues` open 24 (D1 = `backlog_status` = `ops_issues_list` — the 2026-09-11 split
stays resolved). `issue_ledger` open **270** / resolved 21 / acknowledged 1. Every backlog
figure this endpoint reports from `ops_issues_list` alone is an undercount by 270.
By source: `qnfo-pipeline-ops` 90, `qnfo-error-selfheal` 60, `qnfo-ops` 35,
`worker-health` 32, `blank-audit` 11, `digest` 7, `qnfo-ai-calibration` 6,
`qnfo-research-exec` 5, `scan` 5, others 19.

**N-B — F10 is broader than reported, and it holds the user's own question.**
All four triage candidates have `agent_task_id = null`, including three in a
promoted state:

| candidate | status | agent_task_id |
|---|---|---|
| `cand-5f97b11cmtl1g7ve` (surface-code energy floor) | promoted | **null** |
| `cand-b922aa1fmtl0mj9j` (decoherence / speed limits) | promoted | **null** |
| `cand-bfabe346mtmu0sje` (**ultrametric/discrete geometry vs smooth manifolds**) | promoted-queued | **null** |

`cand-bfabe346mtmu0sje` is the ultrametric / discrete-geometry unification question —
the same line as the RT-on-trees work. It has been promoted since 2026-09-06 and was
never dispatched. This is the single highest-value item in the queue and it is stalled
by a null foreign key.

**N-C — F9 confirmed live.** `research_queue`: 2 rows `failed` at `attempt=12` with
`terminal_rearms=3`; 1 row `pending` at `attempt=12` with `terminal_rearms=0` and
`claimed_at=null` (unbounded, never claimed). 13 rows published at `attempt=1`.

**N-D — F6 re-confirmed.** `web_fetch https://qnfo-ai.q08.workers.dev/health` -> `HTTP 404`
from outside. Note the calibration worker is *already* correct here: it probes via service
bindings (`QNFO_AI`), per its SVC-BINDING-1 note. The defect is in whichever external
checker targets `*.q08.workers.dev`; **that target was not located this session**
(`qnfo-infra` / `qnfo-observability` are the candidates).

---

## 5. Blockers that remain real

- **No deploy tool.** `wrangler deploy` needs `CLOUDFLARE_API_TOKEN`; no shell, no deploy
  binding. `run_code` is isolated compute (no network, no filesystem). F1–F12 therefore
  ship as source + a tested patcher, not as deployed code.
- **No D1 write path.** `ops_d1_query` is SELECT/WITH only. F13 (close/annotate the 24)
  cannot execute here; nor can the RC-2 phantom-row DELETE, the `ai_gateway_failures`
  dedupe, or the `issue_ledger` drain.
- **32,768-char read cap.** Confirmed: `github_repo_read` with `maxChars=100000` still
  truncated `worker.js` (35,742 B) at 32,768 with no offset parameter. This is why a
  full-file rewrite of `qnfo-ai-calibration/worker.js` is not attempted — it would ship
  guessed code. The patcher is the correct instrument.
- **`issue_ledger` has no ops tool.** 270 open rows are invisible to `ops_issues_list`,
  `ops_issue_run`, and `backlog_status` (N-A).
- **`ops_issue_run` was deliberately NOT run this session.** Every row in the 24 is a
  code/pipeline defect with `note="no probe target"`; the prior run closed 0/24 and
  merely rewrote `updated_at`. Re-running it would mutate the audit trail without
  remediating anything.

---

## 6. Uncertainty and counter-arguments

- **One successful write does not prove reliability.** The 31 prior `github_file_write`
  failures may be transient or input-specific. Treat writes as verified only on read-back;
  the three commits above were each read back.
- **FIX B is not verified.** The digest-construction region sits in the unreadable tail.
  The live digest emits `failing`, which is *inconsistent* with v1's `failing_models`
  anchor, but inconsistency is not proof. v2 tries both and refuses rather than guesses.
- **The v2 patcher has never been executed by node.** Its anchors and its guard logic were
  verified in `run_code` against verbatim source, and the guard's replay semantics were
  tested with synthetic sweeps. The patcher itself has not run end-to-end, because there
  is no shell here. That is a real gap between "tested" and "proven".
- **RC-1's mechanism is still inferred.** Identical UUIDs and a 1-row-per-sweep growth rate
  are strong evidence that `start_time` is ignored, but Cloudflare's gateway-logs API
  contract was not read. The signature guard fixes the symptom either way.
- **`ai-health-prober` v2.3.3 is source-only.** The live prober is v2.3.1
  (`deployed-current.worker.js`), which still has 15 `MODELS` entries for 10 models and
  maps `kimi-k2.6`'s probe to `@cf/zai-org/glm-5.3`. Until it is deployed, the phantom
  rows persist and `MODEL-DEGRADED` keeps being refiled every `*/20` cron.
- **Counts move.** `MODEL-DEGRADED` tickets are created on a ~2h scheduler; every figure
  here is point-in-time.
- **Not re-verified:** the gemma fixture dimensions, commit `66e17b9c`, the four non-glm
  gateway UUIDs, F7 (radar job-silence), F8 (21/24 venue timeouts), F11 (self-heal
  classifier counting policy refusals), F12 (non-semver VERSION strings).

---

## 7. Handoff — exact commands for a deploy-capable runner

```
cd qnfo-workers/qnfo-ai-calibration
node apply-calibration-fix.mjs --check      # must print "7 change(s) pending, 0 problem(s)"
node apply-calibration-fix.mjs --apply      # guarded, idempotent
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=edb167b78c9fb901ea5bca3ce58ccc4b wrangler deploy

cd ../ai-health-prober
CLOUDFLARE_API_TOKEN=... wrangler deploy     # ships v2.3.3
```

Post-deploy acceptance:

1. `qnfo-ai-calibration` `/health` -> version `1.1.5`.
2. Two consecutive sweeps: the second reports `identical to previous sweep ... suppressed`.
3. `SELECT COUNT(*) FROM ai_gateway_failures` **stops growing** (~6 rows/sweep -> 0).
4. `SELECT model_id FROM ai_model_health WHERE model_id LIKE '@cf/%'` -> **0 rows**.
5. `target=deepseek-direct/models` stops reporting `fail` on `http=200`.
6. `ai-health-prober` `/health` -> version `2.3.3`; `probe.namespaceCleared` > 0 on first run.
7. Then, and only then: close the 24 `agent_issues` rows — 10 of which are the RC-2 artifact.
8. Set `agent_task_id` on `cand-bfabe346mtmu0sje` (N-B) to dispatch the ultrametric thread.
