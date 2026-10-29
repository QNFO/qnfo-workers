# AUDT — Autonomous Cloud Research Pipeline Audit & Architecture Assessment (2026-09-01)

- **WBS:** QNFO.OPS.003 · **Phase:** 1/1 · **Auditor:** DeepChat (deepseek-v4-pro), session of 2026-09-01 07:40Z
- **Scope:** User directive — cloud-based autonomous research: idea intake → merit gate → research → publication → dissemination; self-improvement from meta-knowledge; all settings centrally synced via GitHub.
- **Method:** Read-only audit of live Workers, D1 (qnfo-audit), CF schedules API, local git clones, live endpoint probes. One additive fix executed (INDEXNOW_KEY secret) — no collision with the concurrent idea-triage dev session (GIT-OWNERSHIP-1 respected: uncommitted working-tree files left untouched).

## 1. Directive → Architecture mapping

| Vision requirement | Implemented by | Verified state |
|---|---|---|
| User submits ideas to QNFO API | qnfo-ai v5.6.6 (/v1/chat/completions, ensemble, glm-5.2 intent classifier, auto-express) → qnfo-intent-orchestrator v1.0.0 | ✅ LIVE — intents rows created minutes before audit (07:20–07:39Z) |
| Merit gate (technical merit + exposure/impact) | qnfo-idea-triage v1.1.0: noise/question filters, 3-model scorecard (glm-5.2 + deepseek-v4-flash; qwen3-30b tiebreak at std>0.25); ACCEPT = composite≥0.7 ∧ feasibility≥0.5 ∧ risk≤0.4; composite = .3·novelty+.3·technical_merit+.2·impact+.2·exposure | ✅ DEPLOYED; cron 0 * * * * (triage) + */10 * * * * (stages) registered |
| Autonomous research execution | qnfo-agent-orchestrator v1.0.0 (Durable Object loop; 11 tools: search_papers, get_paper_context, query_graph, arxiv_search, web_search, web_fetch, store_note, publish_paper, zenodo_publish, social_promote, github_publish) | ✅ DEPLOYED; stage briefs NOTE→DRAFT→REVIEW→REVISE→PUBLISH with anti-fabrication citation rules |
| Quality gate pre-publication | REVIEW stage = adversarial reviewer (Accuracy/Completeness/Dependency/Novelty, HARD/SOFT/DESIGN); ≤2 revise rounds; fail-closed on persistent HARD; PUBLISH verifies living-paper row exists before marking complete | ✅ IN CODE |
| Publication | publish_paper → living-paper D1; zenodo_publish → DOI; github_publish → QNFO/qnfo-research | ✅ wired (end-to-end untested — see CRITICAL-1) |
| Dissemination | social_promote (5-post thread ≤290 chars, faithful-to-abstract); outreach matching (contact_ledger ∩ cited-work tokens, cap 12); IndexNow ping for papers.qnfo.org | ✅ wired; IndexNow unblocked this session (FIXED-1) |
| Self-improvement from meta-knowledge | — | ❌ GAP — no meta/kaizen route in intent classifier (see DESIGN-1) |
| Central settings sync (GitHub) | QNFO/qnfo-workers, QNFO/qnfo-skills, QNFO/deepchat, QNFO/qnfo-ops, QNFO/qnfo-config-backup | ⚠ PARTIAL (see §5 matrix) |

## 2. Stage machine (as read from live qnfo-idea-triage v1.1.0)

queued → claim (max 1 active, highest score first) → note (lit review, ≤6 steps) → draft (2–4k words, derivation steps required) → review (adversarial JSON gate) → revise (≤2 rounds) → publish (paper+Zenodo+social+GitHub) → finalize (outreach_queue + IndexNow). Watchdogs: 40-min stage timeout, 3 attempts/stage, AUTO_PAUSE kill-switch env var. Evidence: workers_get_worker_code read-back, /health probe.

## 3. Findings

| # | Severity | Finding | Evidence | Status |
|---|---|---|---|---|
| CRITICAL-1 | CRITICAL | DISPATCH_TOKEN secret unset on qnfo-idea-triage → claimNext/dispatchStage fails ("DISPATCH_TOKEN not configured") → research stages cannot execute; pipeline halts after 3 attempts/idea | /health probe: dispatch_token:false; wrangler.toml documents secret as required | OPEN — owner: secret holder (SYNC_TOKEN of qnfo-agent-orchestrator); blocked for this session (token value not available to auditor) |
| HIGH-1 | HIGH | qnfo-intent-orchestrator has scheduled handler (0 6 * * * daily digest) but ZERO registered cron triggers (schedules: []) → daily digest never fires | CF API GET /workers/scripts/qnfo-intent-orchestrator/schedules | OPEN |
| DESIGN-1 | MEDIUM | No meta-knowledge route: intent classifier categories are note/task/event/email/reminder/research only; system/protocol improvement intents have no autonomous path (today: DeepChat kaizen skill sessions only) | live orchestrator code grep: 0 kaizen/meta matches; triage noise-filter even excludes tool-instruction text | OPEN — spec below |
| MEDIUM-2 | MEDIUM | Deployment-outside-git: live qnfo-idea-triage v1.1.0 is untracked (qnfo-idea-triage/ dir not committed); qnfo-workers working tree holds concurrent uncommitted agent-orchestrator/orchestrator/qnfo-ai edits | git status on local clone; HEAD dfe7f64 == origin/main | OPEN — concurrent-session owned (GIT-OWNERSHIP-1: not touched) |
| LOW-1 | LOW | Outreach personalization is name-token ∩ cited-work matching only (reason field: "cited/related work match"); no per-recipient tie-in text | finalize() code read-back | OPEN — recommendation: extend publish brief to emit per-contact sentence citing their specific work |
| LOW-2 | LOW | 37 intents pending triage incl. probe/test intents (e.g. "Red-team verification intent: tool gateway express_intent path live test"); noise filter covers common patterns but queue hygiene depends on it | D1 intents SELECT | OPEN — hourly triage cron will process; monitor |
| FIXED-1 | — | INDEXNOW_KEY secret was unset → IndexNow dissemination silently skipped. FIXED this session: key recovered from qnfo-indexnow-key worker (public), set via wrangler secret put, verified /health indexnow_key:true; key file verified at papers.qnfo.org/fea6716….txt (HTTP 200) | wrangler "Success! Uploaded secret"; /health re-probe; curl 200 | CLOSED (2026-09-01 ~07:58Z) |
| PASS-1 | — | Prompt-store parity verified: SYSTEM-PROMPT-PARITY PASS (7 stores identical), SKILL-ANCHOR-PARITY PASS (17 versioned skills), MCP-AUTOAPPROVE-PARITY PASS (file intact) | prompt-store-verify.py exit 0 (run this session) | PASS |
| PASS-2 | — | qnfo-workers local HEAD == origin/main (dfe7f64); QNFO/deepchat settings repo local e5ea7aa == remote master | git rev-parse vs ls-remote | PASS |

## 4. Meta-knowledge self-improvement route — DESIGN SPEC (for pipeline owner)

Add a 'meta' intent category to qnfo-intent-orchestrator classifier + a kaizen_queue table (or reuse idea_proposals with kind='meta'); triage routes meta intents to a kaizen-gate (same 2-model scorecard but gated on protocol_merit) → qnfo-kaizen worker applies skill/prompt updates via the same dual-write + PROMPT-PARITY-1 verification pipeline used by the kaizen skill. Human-approval-free by user directive, but every applied meta-update must (a) append an ADR-style record in qnfo-audit, (b) run prompt-store-verify.py, (c) push to GitHub within the same cycle. Deferred to pipeline-owner session to avoid colliding with in-flight orchestrator edits.

## 5. Central-sync matrix (GitHub)

| Repo | Local clone | Remote | Sync state |
|---|---|---|---|
| QNFO/deepchat (settings+db) | DeepChatData/repo | e5ea7aa == remote master | ✅ synced; 1 dirty log file (fs-audit-ledger.json) |
| QNFO/qnfo-workers | Documents/GitHub/qnfo-workers | dfe7f64 == origin/main | ✅ synced; working tree = concurrent in-flight work (uncommitted) |
| QNFO/qnfo-skills | 2 clones: Documents/GitHub (cf56f51) + DeepChatData/dotdeepchat (ee7a602) | both behind working tree | ⚠ concurrent v3.3/v2.118 uncommitted; clones at different commits |
| QNFO/qnfo-ops | Documents/GitHub/qnfo-ops | pulled to 4a7ed40 this session | ✅ synced |
| QNFO/qnfo-config-backup | Documents/GitHub/qnfo-config-backup | last commit 2026-08-11 | ⚠ stale snapshot — refresh recommended |

## 6. Operations quick-reference (runbook pointers)

- Kill-switch: set AUTO_PAUSE=1 (var or secret) on qnfo-idea-triage → claimNext refuses new work.
- Health: /health on qnfo-ai, qnfo-idea-triage (secrets+policy visibility), qnfo-idea-factory, qnfo-agent-orchestrator, qnfo-intent-orchestrator.
- Manual ops: /run/pending?commit=1, /run/queue?commit=1, /run/sync?commit=1 (Bearer TRIAGE_TOKEN).
- Policy knobs (source): ACCEPT_MIN 0.7, FEAS_MIN 0.5, RISK_MAX 0.4, STD_TIE 0.25, MAX_ACTIVE 1, MAX_REVISE 2, OUTREACH_CAP 12.
- Prompts: 7-store parity gate (prompt-store-verify.py) must exit 0 after any dual-write (PROMPT-PARITY-1).

## 7. Claims & Evidence (FRAMEWORK-DOGFOOD-1)

| claim | evidence | confidence | status |
|---|---|---|---|
| Intake pipeline LIVE (ChatBox→ensemble→classifier→intents) | intents rows created 07:20–07:39Z during audit; ENSEMBLE-AUTO-EXPRESS-LIVE-1 gate | high | verified |
| Merit gate deployed with cron | /health v1.1.0 + schedules API: 2 crons | high | verified |
| Stage machine cannot dispatch end-to-end | /health dispatch_token:false + dispatchStage code path | high | open |
| IndexNow secret now set | /health indexnow_key:true after wrangler secret put | high | closed |
| Prompt-store parity intact | prompt-store-verify.py exit 0 | high | verified |
| Daily digest cron not registered | schedules API: [] on orchestrator | high | open |

## 8. Red-team disposition

(Post-audit gate per CMD RED TEAM — see session closeout.)

## 9. Handoff

- Resume-from-here for next session: CRITICAL-1 (set DISPATCH_TOKEN on qnfo-idea-triage when SYNC_TOKEN value is provided), HIGH-1 (register 0 6 * * * cron on qnfo-intent-orchestrator after concurrent orchestrator edits land), DESIGN-1 spec §4.
- Deferred to concurrent session: commit qnfo-idea-triage + agent-orchestrator/orchestrator working-tree edits; finish v3.3/v2.118 skills dual-write.
