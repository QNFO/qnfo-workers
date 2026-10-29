C:/Users/LENOVO/Documents/GitHub/qnfo-ops/PLCY/ARP-OPERATIONS-POLICY.md [chars 0-4500 of 5142] (auto-truncated, use offset/limit to read more):
# PLCY — ARP Operations Policy (Autonomous Research Program)

> Version 1.0 (2026-09-01) · Owner: QNFO · Status: ACTIVE · Supersedes: none · Amends: AUTONOMOUS-RESEARCH-PIPELINE.md §6 (meta loop)
> Claim: the QNFO autonomous research program is operable by any QNFO session using this policy alone.
> Evidence: QNFO.OPS.004 verification session (AUDT/autonomous-pipeline-verify-2026-09-01.md) · Confidence: high · Status: verified

## 1. Layer responsibilities (L0-L6)

| Layer | Worker | Cadence | Policy |
|---|---|---|---|
| L0 INTAKE | qnfo-ai → qnfo-intent-orchestrator | realtime | research intents → intents(type=research, pending) |
| L1 TRIAGE | qnfo-idea-triage | hourly 0 * * * * | scorecard ACCEPT: composite≥0.7 ∧ feas≥0.5 ∧ risk≤0.4 → research_queue |
| L2 RESEARCH | triage stage machine + qnfo-agent-orchestrator | */10 * * * * | one active idea; note→draft→review→revise(≤2)→publish→finalize; 40-min watchdog; 3 attempts/stage; fail-closed on persistent HARD |
| L3 DISSEMINATION | qnfo-social + outreach_queue + IndexNow | daily 06:00/07:00, 14:30 | Bluesky live; outreach sender P2; IndexNow per publication |
| L4 IMPACT | qnfo-impact | P2 (unbuilt) | Crossref/OpenAlex/Zenodo stats |
| L5 SELF-IMPROVEMENT | qnfo-kaizen v0.2 | daily 02:00Z + weekly scan Mon 10:00 | see §3 |
| L6 OBSERVABILITY | qnfo-audit D1 | realtime | pipeline_status/pipeline_tasks/meta_claims/meta_changes/kaizen_reports |

## 2. Secrets & tokens (locations + rotation)

| Secret | Workers | Local copy | Rotation trigger |
|---|---|---|---|
| DISPATCH_TOKEN | qnfo-idea-triage + qnfo-agent-orchestrator (SAME value on both — 401 class requires re-sync) | C:/Users/LENOVO/.qnfo/dispatch-token | pipeline_tasks shows no dispatch row after claim; /task returns 401 |
| TRIAGE_TOKEN | qnfo-idea-triage | (session owner only) | manual ops auth |
| KAIZEN_TOKEN | qnfo-kaizen | C:/Users/LENOVO/.qnfo/kaizen-token | meta endpoints auth |
| INDEXNOW_KEY | qnfo-idea-triage | public key file on papers.qnfo.org | never rotate without re-serving key file |
| GITHUB_TOKEN | (unset — worker push deferred) | — | provision to enable worker-side skill pushes |

Re-sync procedure (DISPATCH_TOKEN): generate via node crypto; `cat file | wrangler secret put DISPATCH_TOKEN` in the worker dir, and `wrangler secret put DISPATCH_TOKEN --name qnfo-agent-orchestrator` (name flag REQUIRED when no toml) — WRANGLER-SECRET-PUT-NAME-FLAG-1.

## 3. L5 meta-loop policy (qnfo-kaizen v0.2)

- Claim: meta intents (type='meta' or explicit meta marker) → glm-5.2 claim-sheet validation → additive-only append.
- Boundaries: NO new skills; NO destructive edits; NO version bump (curated versions only — parity-safe); append carries gate name + change id + evidence/confidence/scope + source.
- Every apply MUST persist meta_changes before reporting applied (META-TEST-CLAIM-2, now standing policy).
- Caps: ≤20 claims/run, ≤5 applies/run; re-read-back verification required before status=applied.
- GitHub push: GITHUB_TOKEN absent → git_push=deferred-no-token → local skill_sync sessions push (PROMPT-PARITY-1: 7 prompt stores byte-identical + prompt-store-verify.py exit 0 after any dual-write).

## 4. Schema governance (qnfo-audit D1)

- Worker-owned tables: pipeline_tasks (queue_id/stage/action/status/detail), pipeline_status (project_name pk), research_queue, meta_claims, meta_changes.
- DROP policy: only when row count = 0 AND the table shadows worker DDL (name collision); document in AUDT before dropping — PIPELINE-TABLE-COLLISION-1.
- ensureSchema must be idempotent (ALTER … ADD COLUMN in try/catch) — new columns add via ALTER list, never by DROP on live data.

## 5. Model & AI-binding facts (account-wide)

- env.AI.run returns OpenAI-shape {choices:[{message:{content,reasoning_content}}]} — ALWAYS extract dual-shape (content || reasoning_content || response || result).
- glm-5.2 reasons verbosely: parse JSON with last-block iteration, max_tokens ≥ 2500 for JSON-after-trace.
- Direct-JSON models (no trace): glm-4.7-flash, deepseek-v4-flash-0731, qwen3-30b-a3b-fp8.

## 6. Kill-switches & guardrails

- AUTO_PAUSE=1 on qnfo-idea-triage → claimNext refuses new work (stages in flight still complete).
- AI Gateway $90/30d limit; pause auto-dispatch if 30-day spend > $70 (triage env guard).
- Outreach: cap 15/day, honor opt-out, tests ONLY to alerts@qnfo.org (TEST-SEND-TARGET-1 / DIGEST-TO-PERSONAL-1); never test-send to real externals (TEST-SEND-EXTERNAL-1).
- OUTREACH-REVIEW-1 (user directive 2026-09-01): initial outreach emails are FULLY AUTONOMOUS — never route them for review (send receipt = notification, not a request). Inbound replies route to the user ONLY when a human must be on the other end: meeting requests, events, collaboration proposals, decisions. All other replies (most communication) are drafted and sent confidently on the user's behalf. Applied to the email-composer skill via the L5 meta loop (change f595172f, gate OUTREACH-REVIEW-1).

## 7. Anti-pattern registry (new this session)
