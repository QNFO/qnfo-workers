# QNFO Autonomous Research Pipeline — Architecture & Operating Policy

> Version 1.0 (2026-09-01) · Owner: QNFO · Status: ACTIVE
> Claim: QNFO converts user-submitted ideas into citable publications fully autonomously (cloud-only, no human in the loop), with amplified dissemination and self-improvement.
> Evidence: live worker fleet + D1 audit DB census 2026-09-01 (this document's audit) · Confidence: 0.9 · Status: verified-at-audit, evolving

## 1. Purpose

The user submits thoughts/ideas to the QNFO API endpoint (ChatBox/Android → qnfo-ai, or ideas.qnfo.org). Ideas with high technical merit AND high exposure/impact potential are automatically processed through the research, publication, and dissemination pipelines. Outputs must match or exceed current QNFO papers in quality and receive MORE impressions/citations than current papers. The system also updates its own instructions from received meta-knowledge, autonomously.

## 2. Layer architecture

| Layer | Worker | State | Function |
|---|---|---|---|
| L0 INTAKE | qnfo-ai (edge) → qnfo-intent-orchestrator | LIVE | ensemble answer + expressIdea → intents(type=research, pending); ideas.qnfo.org → idea_proposals |
| L1 TRIAGE | qnfo-idea-triage v1.1.0 | LIVE (v1.0.0; v1.1.0 = this program) | dual-model scorecard (glm-5.2 + deepseek-v4-flash, qwen3-30b tiebreak) → ACCEPT (composite≥0.70 ∧ feas≥0.50 ∧ risk≤0.40) → research_queue |
| L2 RESEARCH | qnfo-agent-orchestrator (/task DO) + triage stage machine | /task LIVE; stage machine = THIS PROGRAM | staged agent-loop briefs: note → draft → review → revise → publish |
| L3 DISSEMINATION | qnfo-social (Bluesky) + Buffer + qnfo-outreach + IndexNow | social LIVE; outreach/indexnow = THIS PROGRAM | auto threads (fact-checked), multi-channel posts, personalized researcher email, search-index pings |
| L4 IMPACT | qnfo-impact | THIS PROGRAM | Crossref/OpenAlex/Zenodo citation+download stats, Bluesky mentions → citation_stats + impact_scores |
| L5 SELF-IMPROVEMENT | qnfo-intent-orchestrator (meta type) + qnfo-kaizen v0.2 | THIS PROGRAM | meta-knowledge intake → claim-sheet validation → additive skill/prompt updates (R2 + git) → parity verify |
| L6 OBSERVABILITY | qnfo-audit D1 + alerts + digest | LIVE (wire) | pipeline_status/pipeline_tasks at every transition; digest → alerts@qnfo.org ONLY (DIGEST-TO-PERSONAL-1) |

## 3. Stage machine (L2) — the core loop

research_queue columns (v1.1.0 adds): stage, agent_task_id, attempt, published_at, doi, paper_url.

Stages (one active idea at a time; cron every 10 min):
1. **note** (max_steps 6): literature review — ≥3 distinct query formulations each for arxiv_search + web_search; query_graph + get_paper_context for QNFO prior art; store_note. Deliverable: state of knowledge, quantitative estimates w/ assumptions, 2-5 open questions, top-5 citations (arXiv id/slug/DOI).
2. **draft** (max_steps 8): full paper from note — title, abstract, sections, derivations, citation list (only real, tool-verified sources). store_note.
3. **review** (max_steps 6): adversarial reviewer (research-skill red-team gates: novelty vs prior art, claim support, math correctness, citation faithfulness, COMPUTATIONAL-VERIFICATION-1). Output: findings JSON (HARD/SOFT/DESIGN).
4. **revise** (max_steps 8): address HARD findings. Max 2 revise rounds. If findings persist → status=failed (reason logged), never published.
5. **publish** (max_steps 6): explicit tool sequence — publish_paper (living-paper D1) + zenodo_publish (DOI; authors keep 'Quni-Gudzinas' for social autoScan) + social_promote (Bluesky queue) + github_publish (QNFO/qnfo-research).
6. **finalize** (triage worker): research_queue.status=completed + paper_slug/doi/paper_url; pipeline_tasks rows; outreach trigger (contact_ledger topic-affinity match → outreach_queue); IndexNow ping for the new papers.qnfo.org URL.

Safety rails: max 1 active research task; DO 30-min watchdog (exists); revise ≤2; publish only after review-clean; every transition logged in pipeline_tasks + audit trail.

## 4. Dissemination policy (L3)

- Bluesky: qnfo-social /compose (AI draft, fact-checker validates claims vs title+abstract) → /approve → cron 14:30 posts. social_promote from publish stage queues directly.
- Multi-channel (LinkedIn/X/Mastodon via Buffer GraphQL): P2 — BUFFER_TOKEN must be provisioned as a worker secret; until then Bluesky is the live channel.
- Outreach: qnfo-outreach claims outreach_queue; personalization REQUIRED (cite-their-work / same-subfield / recent-paper signal from contact_ledger + KG); cap 15/day; honor opt-out; test target alerts@qnfo.org (TEST-SEND-TARGET-1); never a personal inbox (DIGEST-TO-PERSONAL-1).
- Search indexing: papers.qnfo.org sitemap.xml already live; IndexNow ping on every new publication (key fea6716717dc42059213070adcdf0e53; key file must be served at a QNFO host path); Schema.org ScholarlyArticle JSON-LD on paper pages (T6).

## 5. Impact loop (L4)

Daily: for every QNFO DOI in living-paper.zenodo_doi — Crossref /works/{doi} (is-referenced-by-count), OpenAlex /works/doi:{doi} (cited_by_count), Zenodo record stats (views/downloads); Bluesky search for slug/DOI mentions → citation_stats + impact_scores; update dissemination_tracker post_url where resolved. Feedback: impact distribution calibrates triage exposure_potential priors (P3).

## 6. Self-improvement loop (L5)

Intake: orchestrator classifier gains type 'meta' (rules: protocol/procedure/instruction/meta-knowledge/improve-the-system patterns). meta intents → status=pending.
Apply (qnfo-kaizen v0.2, daily): claim pending meta intents → AI validation of claim-sheet shape {skill_target, gate_name, claim, evidence, confidence, scope} (FRAMEWORK-DOGFOOD-1) → reject invalid; for valid: additive-only edit to target skill in R2 qnfo-skills bucket + GitHub QNFO/qnfo-skills → re-read-back verify → kaizen_reports + meta_changes(status=applied).
Boundaries: NO new skills (NO-MORE-SKILLS-1); updates are additive gate-sections with version bump + mirror rows; destructive/contradictory edits auto-rejected; git history = rollback path. DeepChat-side prompt stores sync on next skill_sync session (dual-write + prompt-store-verify, PROMPT-PARITY-1).

## 7. Cost & budget guardrails

AI Gateway $90/30d spend limit (sliding) is the backstop; per-paper cost = sum of stage model calls, recorded in pipeline_tasks; if 30-day spend > $70, pause auto-dispatch until window rolls (env guard in triage v1.1.0).

## 8. Testing protocol (Phase 3)

1. /triage POST unit (auth) — scorecard JSON shape.
2. Intake E2E: express_desire → intents(row research/pending).
3. /run/queue → claim + /task dispatch → poll → note stage.
4. Full E2E: seed research_queue with a REAL JPCUB-program idea → all stages → living-paper row + Zenodo DOI + social_threads queued (draft/queued mode for the test) + outreach_queue + pipeline_status rows.
5. Negative: noise idea rejected; question-type held; review-HARD → revise → re-review; persistent HARD → failed (never published).
6. Meta loop: POST /intent meta-improvement → validate → applied to R2 + git → kaizen_reports row.
7. Impact: one manual impact run → citation_stats populated from live QNFO DOIs.

## 9. Anti-patterns absorbed (operating memory)

- BLAME-EXTERNAL-1 / CHANGE-AUDIT-FIRST-1: when a stage fails, first audit recent changes to the queue/workers/prompt, not the platform.
- TEST-SEND-EXTERNAL-1 / EMAIL-SUBJECT-SPAM-TOKENS-1 / NO BURST TESTS: outreach tests to alerts@qnfo.org, human-sounding subjects, no bursts.
- INTENT-TOKEN-ROTATION-1: verify orchestrator accepts a rotated token before relying on harvest.
- WORKERS-DEV-PROBE-1 (new, 2026-09-01): web_fetch returns 404 for *.workers.dev URLs even when the worker is healthy — probe workers.dev via curl/exec, not web_fetch.
- DELEGATION-FROZEN-VIEW-1 (3rd occurrence 2026-09-01): child subagents lose all subtools to a frozen View ceiling; parent executes directly (FROZEN-VIEW-FALLBACK-1).

## 10. Change log

- 2026-09-01: v1.0 initial — audit complete, design locked, implementation begins (T1..T6).
