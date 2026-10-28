# Deterministic gate audit (RM-DETERMINISTIC-GATE-AUDIT-1)

Charter pillar: **autonomy** (with **research** and **reach** for the publishing rows). Doer: qnfo-fleet-control via qnfo-code-orchestrator.
Roadmap item: `RM-DETERMINISTIC-GATE-AUDIT-1` (docs/SCOUT-ROADMAP-2026-10.md, filed by `migrations/2026-10-28-scout-roadmap-items.sql`).
Audit date: 2026-10-28, read from `main` at commit 54eb9f1c. Read-only: no worker code was changed by this audit.
Follow-up issues: `migrations/2026-10-28-gate-audit-issues.sql` (one `GATE-AUDIT-1` row per MODEL-ONLY row).

## The rule being audited

Source: arXiv 2609.02246 (abstract-level; read the full text before relying on it, CITE-FULLTEXT-1). An LLM judge is an advisor. A check that is not a
model, and that the model cannot override or satisfy by assertion, must gate every change that promotes, publishes, deploys or rewrites something. This
is the same premise as docs/ENSEMBLE-POLICY.md (class A layers are never removed; LLM errors correlate, so a panel is worth about 2 votes) and
docs/OUTPUT-QUALITY-LEDGER.md (a gate pass is not quality; a rule the generator can satisfy is a `proxy`).

Verdict scale used below:

| Verdict | Meaning |
|---|---|
| GATED | a non-model check (CI, parser, schema, hash, allowlist, rate cap, probe, regex rule) decides, or the model can only block |
| PARTIAL | a deterministic check exists but does not cover what the model decides (it checks form, not substance; it runs at draft time but not at the moment of effect; or it covers only some paths) |
| MODEL-ONLY | a model's output, or a flag the model itself sets, is the only thing between the decision and its effect |

## Result: 4 MODEL-ONLY, 7 PARTIAL, 10 GATED (21 decision points)

Sorted MODEL-ONLY first, then PARTIAL, then GATED. Line numbers are in the worker.js on `main` at the audit commit.

| # | Verdict | Where (file:line) | What the model decides | Deterministic check that also gates it | Evidence (quoted) |
|---|---|---|---|---|---|
| 1 | **MODEL-ONLY** | qnfo-ops/worker.js:1351 (tool), :4561 `cfWorkerDeploy`, :5876 dispatch | The ops agent supplies a worker name and full JS source; it is deployed live through the CF API | None on this path. The `expected_version` and downgrade guards (:4591-4605) run only if the model passes `expected_version`. The ledger row (:4909) is written after the deploy. The only fixed refusal is a one-name container list (:4579) | Tool description: "ADVERSARIAL: does not validate JS syntax — test with run_code first." Charter: "main has no branch protection, so gates are enforced by policy in code". The canonical path (`:9052`) passes `expected_version`; the chat tool does not have to |
| 2 | **MODEL-ONLY** | qnfo-ops/worker.js:3045 `githubFileWrite`, :1329 (tool), :1330 `github_pr` | The ops agent writes any file at any path of any repo, to `main` when no branch is given | None seen: no path allowlist, no `.github/` refusal, no work claim, no CI (a commit to `main` runs no pre-merge check), no `CM_DENY` scope. Only retry on 409 and a branch-name hint | `docs/QUNIVERSE-CHARTER.md:186` "main has no branch protection". Read at :3045-3135: the function reads `ref=main` when `branch` is null and PUTs |
| 3 | **MODEL-ONLY** | qnfo-ops/worker.js:3467-3474 `d1Write` (tool :1344) | The ops agent writes any row in any bound D1, including qnfo-audit control tables (`ops_config`, `fleet_budget`, `metric_registry`, `control_registry`) | The "destructive" test is a regex, and the confirmation is satisfied by `args.confirm === true` (set by the model in the same call) or by a regex over the user text. A DELETE or UPDATE that has a WHERE clause is never "destructive". No protected-table list, no row-count cap, no backup | `var destructive = /\b(drop|truncate)\b/i.test(sql) \|\| /\b(delete\|update)\b/i.test(sql) && !/\bwhere\b/i.test(sql)`; `var affirmed = /(yes\|please\|confirm\|go ahead\|send it\|do it\|execute\|proceed\|approved\|affirm)/i` |
| 4 | **MODEL-ONLY** | qnfo-intent-orchestrator/worker.js:405 `scoreOf`, :474 (promote), :465 (noise reject) | A classifier's merit, impact, novelty and feasibility numbers promote an intent to a research candidate (which is then dispatched and spends a research run), and its `is_noise` flag rejects an intent | `isNoise` regex (:455) and embedding dedup (:459) come first. After the model there is only `score >= PROMOTE_THRESHOLD` (60). No per-day cap on promotions seen; a model-rejected intent leaves no check for a human or a probe | `const score = scoreOf(t); if (score >= PROMOTE_THRESHOLD) {` with `Math.round(0.35 * t.merit + 0.35 * t.impact + 0.15 * t.novelty + 0.15 * t.feasibility)` |
| 5 | PARTIAL | qnfo-research-exec/worker.js:9529-9546 `respondToItem`, :9347 `judgeCorrection`, :30812 `runPublish`, :30626 `publishAction` | The drafting model sets `risk`; if it says "low", a second model (glm-5.3) agrees; then a corrected paper body is published as a new version with no human step | At draft time: `enforceCorrectionGrounding` (:9431, figures, links, names must occur in the source) and a fail-closed judge. At publish time: `errata_publish_enabled` flag, version_from equality (:30635). Nothing re-checks the stored `corrected_md` against the original body, or re-runs the paper gates, when it is published | `if ((corr.risk \|\| "high") === "low" && corr.clarification && corr.anchor) { const j = await judgeCorrection(...); if (!j.pass) corr.risk = "high"; }` and the select `WHERE status='drafted' AND risk='low'` |
| 6 | PARTIAL | qnfo-research-exec/worker.js:31603 `claimAudit`, :31809 `ciProcessPaper`, :31744 `ciRetract` | Models (gpt-oss-120b extracts, glm-5.3-flash confirms, different families) decide a sentence is a "fabricated" empirical claim; five confirmed hits retract a live paper, fewer rewrite it | Regex candidates (`fabricatedClaimScan`) are deterministic, and a backup is taken first (`ciBackup`). The living-paper withdrawal trigger caps papers leaving published at 25 an hour. `claim_integrity_mode` can be set to `measure` | `var confirmed = cands.slice(0, 30).filter(function(h, i) { return byN[i + 1] === "FABRICATED"; })`. A candidate with `source: "model"` has no regex behind it. Output ledger: 131 of 145 q08 essays later retracted shows what model-confirmed claims cost when wrong in either direction |
| 7 | PARTIAL | qnfo-research-exec/worker.js:6946-6959 verify text fallback; :6332 `adjudicateVerification` | When the Python verification script cannot run, a model recomputes each numeric claim and the worker adopts its CLAIM lines as the verification (`basis=text`) | Primary path is executed code (deterministic). The fallback is labelled in the report and the event. Mismatch handling, `autoCorrectNumeric`, `finalGates`, `mathGate`, the citation gate and the degenerate-text scan all still run | `adj.basis = "text"` — "Weaker than executed code; the event, the report and the provenance section all say so" |
| 8 | PARTIAL | qnfo-paper-reviser/worker.js:486-571 (`processPaper`), :334 `REREAD_MODEL` | One model audits a published paper and writes edits; a second (gpt-oss-120b) re-reads them; a pass queues the revision for publication | `guardSeverity` (:247), `applyEdits` (:290, quote-anchored), structure checks (:541-555), the grounding scan of the added text (:240). The reread can only block (fail closed). Nothing re-runs the citation gate or `finalGates` on the revised body, and the revision is not hash-bound to the audited body | Header comment :331: "the result went to version_queue and publishV2 with only the structural gate in between, so a model-written change ..." |
| 9 | PARTIAL | qnfo-fleet-control/worker.js:3139-3157 `evPropose`, :3243-3262 `evAdvance`, :2879 `EVOLVE_REQUIRED` | A model writes a single-anchor edit to a worker, reports its own `confidence`, and a reviewer model answers `approve:true`; the PR then self-merges | Anchor occurs once, at least 40 characters, no VERSION edit, size caps, `evBalanced` brackets. After the PR opens only three checks decide (`guard`, `mirror-guard`, `comparator`); a failing suite check is not read by `evAdvance`. Post-merge deploy ledger and automatic revert (`evRevert`). `cmChecks` (the code loop's path) requires every other check to pass; `evAdvance` does not | `else if (!(Number(p.confidence) >= 0.6)) why = "confidence " + p.confidence;` and `if (!rv \|\| rv.approve !== true)` |
| 10 | PARTIAL | qnfo-ai-search/worker.js:1627-1664 `tuneGeneration`, :1670 `maybeRevert` | A challenger prompt/model config becomes the live champion when its LLM-judged "grounded share" is within 0.02 of the champion and its cost is 20 percent lower (or grounded share is 0.05 higher) | Error rate and cost per answer come from `ask_events` (not a model). Revert on a drop of 0.05 in judged grounded share or in human `ask_feedback` helpful share within 3 days. Arms need 30 judged answers each. The judge is a different family from the writers (ENSEMBLE-POLICY-1 finding 4) | `var adopt = gb >= ga - ADOPT_MARGIN && eb <= ea + 0.01 && (cb <= ca * 0.8 \|\| gb >= ga + 0.05);` where `ga`, `gb` come from `judged_supported / judged_total` |
| 11 | PARTIAL | q08-signal-engine/worker.js:1681 `gate`, :2850 `groundingProblems`, :1096 `panelRead`, :1197 `ledeProblems` | Whether an essay publishes: deterministic gate, lexical grounding, then a 2-judge panel that fails open when no judge answers | Deterministic gate, grounding (figures, links and names occur in the source) and lede rules run first and the panel runs after them. The panel failing open is the documented policy (ENSEMBLE-POLICY rule 5). Grounding is lexical: it does not prove a source supports the claim around a name or number | OUTPUT-QUALITY-LEDGER: "131 of 145 `published_pieces` have a `q08_retractions` row ... 124 of the 131 by the accuracy audit as claims the source does not support" |
| 12 | GATED | qnfo-code-orchestrator/worker.js:2151 `verify` (and :1481 companion verdicts, :2564-2581) | A model proposes a file edit | Dynamic-Workers JS parse, `json`/`sql`/`py` parsers, size-ratio bounds, NUL and empty checks, `mergeScopeWhy` allowlist (:788-799), `PLAN_TRUSTED` source list (:2998). No verifier means the task fails, or is deferred and "refuses to push it unparsed" | `if (v.verdict === "no-verifier") { ... return await fail(v.error, true)` |
| 13 | GATED | qnfo-fleet-control/worker.js:4111 `cmDecide`, :3469 `cmChecks`, :3433 `cmScope`, :4056 `cmReviewCombine` | Whether a code-loop PR merges | Required CI checks must end success and every other check success, neutral or skipped; scope allowlist and `CM_DENY`; trusted-source list; version-bump and mirror gates. The two reviewer models can only refuse, and a refusal stands only when two families agree. A reviewer cannot approve a change that CI refuses | `"one model's opinion does not refuse (GOAL-REVIEW-2), the required checks decide"` |
| 14 | GATED | qnfo-fleet-control stale-PR lane (`stale_pr_merge`, :5720 and nearby) | Whether an idle PR merges | Quiet period, green checks, no `HOLD:` comment, no draft/WIP, `.github/` rule, canary and automatic revert for the control plane. No model score is read | `cfg.mergeStale && ... (nowMs - updMs) >= cfg.idleMin * 6e4` |
| 15 | GATED | qnfo-social/worker.js:762 `threadGroundingIssues`, :826-855 checker, :1415 weekly cap, :1428 content gate, :1438 link probe | Whether a paper thread posts | Deterministic grounding and lede checks run before the checker model; the checker is fail closed ("holding as draft (fail-closed, NOT queued)"); weekly cap per channel, spacing, dead-DOI content gate, live-link probe, suppression | `const groundIssues = threadGroundingIssues(...).concat(threadLedeIssues(...)); if (groundIssues.length) return groundIssues;` |
| 16 | GATED | qnfo-cloud-ops/worker.js:3341 `pub-gate-v5-degenerate`, :3453, :3595 | Whether a published paper is withdrawn or flagged | Pure code: degenerate-text scan, structure, prompt residue, structural score. No model call; owner papers (`qnfo-2025-*`) are never withdrawn; per-run caps | `if (q.flag === "degenerate-text") return { decision: "withdraw", ..., deterministic: true }` |
| 17 | GATED | qnfo-research-exec/worker.js:7715 `publishStageV2`, :7434 `citationGateStepWithSupportCheck`, :1061 `releaseGateVerdict` | Whether a new paper is published | Citation existence gate (arXiv, DataCite, DOI), degenerate-text refusal, `finalGates`, `mathGate`, daily quota. Note: `release_gate_pass` is recorded at publish, not enforced there; enforcement is the upstream gates and the cloud-ops sweep (row 16) | `release_gate_pass=?2` written in the same UPDATE that sets `status='published'` |
| 18 | GATED | qnfo-ai-search/worker.js:1598 `tuneRetrieval` | Whether a retrieval parameter becomes the champion | Offline golden-set MRR and latency, no model in the score; adopt only at +0.03 MRR with at most +20 percent latency | `var win = res.mrr >= base.mrr + 0.03 && res.mean_ms <= base.mean_ms * 1.2 + 200;` |
| 19 | GATED | qnfo-model-eval/worker.js:234-280 `decide`, :516 | Whether a model is promoted in the catalog | Fixed battery score, floor and cost ratio; a promote writes the ladder row with `active=0`, a roadmap item and an issue, so routing never changes without a separate change | "a score is not an adoption ... the ladder row (active=0, so routing never changes by surprise)" |
| 20 | GATED | qnfo-ai/worker.js (whole file), qnfo-evolve/worker.js, qnfo-kaizen/RETIRED | Prompt, routing and self-update changes | qnfo-ai changes routing only by `fleet_budget` spend caps (:1517 steer switch) and never writes a prompt or config from model output. qnfo-evolve contains no model call and no GitHub write (0 matches for `env.AI`, `/merge`, `api.github.com`); it files issues. qnfo-kaizen is RETIRED | `qnfo-kaizen is RETIRED (2026-10-06 ...)` |
| 21 | GATED | qnfo-fleet-control/worker.js:236-262 advisor propose/review | An advisor model proposes an action and another reviews it | The result is a `suggestion` string; nothing is applied from it in this block | `suggestion = proposal;` |

## Method

1. Read docs/ENSEMBLE-POLICY.md and docs/OUTPUT-QUALITY-LEDGER.md for what the fleet already treats as class A (non-model) layers and as a proxy.
2. For each worker in scope (qnfo-research-exec, qnfo-paper-reviser, qnfo-cloud-ops, qnfo-code-orchestrator, qnfo-fleet-control, qnfo-ai, qnfo-ops,
   qnfo-social, qnfo-kaizen, qnfo-evolve) searched worker.js for `verdict`, `approve`, `judge`, `score`, `panel`, `promote`, `champion`, `auto-merge`,
   `confirm`, `UPDATE papers ... status`, `/merge`, `INSERT INTO ops_config`. Then followed each hit to the statement that has the effect (a merge, a
   publish, a deploy, a write, a post, a retraction) and listed what stands between the model output and that statement.
3. Widened to workers outside the named list where grep showed a model score driving a promotion: qnfo-ai-search (champion and challenger),
   qnfo-model-eval (catalog promotion), qnfo-intent-orchestrator (research candidates), q08-signal-engine (essay publishing, because the output ledger
   measures its retraction rate).
4. A row is MODEL-ONLY when removing the model's output (or the flag it sets) leaves no non-model check that could refuse the same action. It is PARTIAL
   when a non-model check exists but tests something other than what the model decided. It is GATED when the model can only block, or a non-model check
   decides.
5. Counted `grep -c` for each anchor quoted in the follow-up migration before using it as a `code-anchor`.

## Limits of this audit

- **Static and from one commit.** No live D1 state was read: `ops_config` values (`claim_integrity_mode`, `code_merge_runner_enabled`,
  `stale_pr_merge_*`, `errata_publish_enabled`), `control_registry` and live flag values can make a PARTIAL row better or worse than the code suggests.
- **File-level reading, not a data-flow proof.** Large files (qnfo-research-exec is 32,859 lines, with bundled third-party code) were read at the
  decision points found by search, not end to end. A call path that reaches a publish or write through a function whose name does not contain the
  search terms is missed.
- **Branch protection is a repository setting, not code.** The charter says main has none; rows 1 and 2 depend on that statement being still true. If
  protection with required checks has since been enabled, row 2 becomes PARTIAL and row 1 stays MODEL-ONLY (a deploy is not a merge).
- **Not read in depth:** qnfo-email-orchestrator and qnfo-cloud-ops email replies, qnfo-outreach sends, idea-hub scoring, personal-companion,
  qnfo-gateway, qnfo-github-steward issue closing, the `issue_triage` close path, PERFORMANCE-LOOP-1 levers (judged by metrics, not a model, but
  not verified here), and `ops_issue_run` / `shell_exec` / `exec_pipeline` in qnfo-ops (they run arbitrary code by design; the audit counts the
  write tools only).
- **Verdict is on the gate, not on the output.** A GATED row can still produce a bad output (row 11 is the evidence: a gate pass is not quality, OUTPUT-QUALITY-LEDGER rule 2).

## Failure mode of the audit itself

The audit is a grep with human judgement, so it fails in three ways. (1) **Indirect paths**: a model verdict stored in a D1 row and acted on by a
different worker later (for example `version_queue.corrected_md` written by qnfo-paper-reviser and published by research-exec) shows up as two
half-decisions, each looking gated; a missing intermediate hash check is only visible by reading both ends, which was done for rows 5 and 8 and not for
every queue in `v_stuck_summary`. (2) **Surface bias**: the search terms come from words this fleet already uses for gates, so a model decision named
in other words (a "pick", "route", "rank") is missed. (3) **Credit for existence**: marking a row GATED because a check exists does not prove the check
is reached on every path or fails closed; rows 12 to 14 should be confirmed by a probe that sends a failing change and sees it refused. The fix for all
three is the same as for any other detector: a recurring, code-read contract (`code-probe`) over the specific lines named here, so a change to a
row's gate shows up as a diff against this table.

## Recommended deterministic check for each MODEL-ONLY row

| # | Recommended check (non-model, not satisfiable by the model's own output) | Revert path |
|---|---|---|
| 1 | In `cfWorkerDeploy`, when the call does not come from the canonical deploy route (no deploy-route marker), require `sha256(content)` to equal the sha256 of `<worker>/worker.js` read from GitHub at a named ref on `main`, run the code-orchestrator JS parse check on it, and refuse a worker on the control-plane list unless the caller holds the `file:<worker>/worker.js` work claim. A deploy of bytes that are not on `main` is refused | Redeploy previous version from `deployment_history`; rule off by `ops_config cf_worker_deploy_main_only = off` |
| 2 | In `githubFileWrite` and `github_pr`: refuse a write whose target branch is the default branch (force a branch and PR), refuse `.github/`, `scripts/` gate files and control-plane worker paths (reuse `cmScope` and `CM_SCRIPT_DENY`), and cap bytes per call. The PR then meets CI and the stale-PR lane | `ops_config github_write_default_branch = allow` restores the old behaviour |
| 3 | In `d1Write`: a protected-table list (`ops_config`, `fleet_budget`, `metric_registry`, `control_registry`, `analytics_metric_triggers`, `sla_registry`, `spof_registry`) that refuses unless the call supplies a live work-claim token for `d1:<table>`; run the statement's WHERE as a `SELECT COUNT(*)` first and refuse more than N rows (default 50) without a `BACKUP` table name; stop counting `args.confirm` or user text as authority for a DELETE or UPDATE | The refusal returns the plan; `ops_config d1_write_guard = off` restores the old path |
| 4 | In `triageIntent`: a rate cap on promotions per day (`ops_config intent_promote_per_day`), a deterministic second condition for promotion (a dedup against `papers` by embedding distance, plus at least one resolvable citation or slug in the question), and write every model rejection to `issue_lifecycle`-style ledger with the model's reason so a probe can sample the rejects; a model `is_noise` is never terminal for an owner-sourced intent | Set `PROMOTE_THRESHOLD` back; `status='pending'` on the rejected rows |

## Recommended hardening for the PARTIAL rows (filed as a roadmap item, not as MODEL-ONLY issues)

- Row 5: at `publishAction`, re-run `ungroundedTerms` on the delta, require the new body to equal the original body plus the stored insertion (hash of
  `applyCorrection(original, stored corr)`), and run `finalGates`.
- Row 6: a candidate with `source: "model"` needs a regex or retrieval match before it can count toward `CI_RETRACT_MIN`.
- Row 7: a text-basis verification cannot clear a paper that has any quantitative claim; it routes to the floor (`routeVerifyToFloor`).
- Row 8: re-run the citation gate and `finalGates` on `revised`, and store `sha256(body)` of the audited body with the queue row.
- Row 9: make `evAdvance` read every check (as `cmChecks` does) and drop the self-reported `confidence` as a gate.
- Row 10: add `ask_citation_validity_7d` (deterministic) and golden-set MRR as non-regression conditions to `adopt`.
- Row 11: keep as is; the lever is the outcome measure (`q08_retraction_rate_30d`), not another judge.

## How this is checked again

`migrations/2026-10-28-gate-audit-issues.sql` files one `GATE-AUDIT-1` issue per MODEL-ONLY row. When a row's gate lands, that row moves to GATED here in
the same PR and the issue closes with the refusal observed in a live probe (a failing deploy, write or promotion sent on purpose and refused).
