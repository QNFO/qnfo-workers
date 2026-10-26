# AI use policy, AI-literacy evidence and AI Act classification record — DRAFT for owner review

Status: **DRAFT, 2026-10-26** (BP26-AI-ACT-ARTICLE4-1, agent_issues 1000346; also feeds BP26-AI-ACT-ART50-1, 1000341). Written by an automated fleet session from the code, the public pages and the BP26 catalogue (docs/BEST-PRACTICES-2026.md, items 1.3, 1.4 and 4.5). **Not legal advice.** The classifications below are the fleet's own working assessment for the owner to confirm with an adviser; they are not statements that any duty is met or not owed. Review every year (next: 2027-10-26) and before any new AI system or new use of an existing one goes live.

## 1. What the catalogue asks of the operator

Article 4 of the AI Act (AI literacy), as the catalogue records it after the 2026-07-27 amendment, asks the operator to take measures to support AI literacy of the people who operate and use its AI systems; Article 50 transparency duties have applied since 2026-08-02; the Annex III high-risk duties are deferred to 2027-12-02 and are not relevant to the current uses (catalogue item 4.5). The operator is one natural person (the owner). The fleet's own agents do most of the operating; the human readers and users are the public.

## 2. The rules this fleet follows when it uses AI

1. **Label what AI makes.** Every AI-generated or AI-assisted public artifact carries a visible label and a machine-readable flag. The fleet has no manual approval step before publication (owner directive), so the human-review exemption of Article 50(4) is not used: every piece is labelled instead (decision_log 2026-10-26).
2. **Say so at the start of an interaction.** An interactive AI surface tells the person they are dealing with an AI system before or at their first use.
3. **Never claim a review that did not happen.** A declaration of human review is written only where a person reviewed.
4. **Untrusted input is data, not instructions.** Inbound mail, fetched pages and social replies never decide what an agent does (BP26-PROMPT-INJECTION-1).
5. **Keep the planes apart.** Personal-plane content does not enter research prompts or logs; mail and disclosure text go only to Workers AI models unless the owner decides otherwise (docs/ROPA.md, open question 5).
6. **No high-risk uses.** The fleet does not use AI for employment, credit, essential services, law enforcement, migration, justice, education assessment or biometric identification. A proposal for one is recorded here first.
7. **Irreversible and identity-bound acts are the owner's.** Money, legal and signing acts, the owner's accounts and personal data, and deletion of data with no backup stop for the owner (CLAUDE.md, the interrupt gate); everything else reversible proceeds and is logged in `decision_log` with its revert path.
8. **Measure, do not assert.** A claim that a duty is met is backed by a metric or a page read (BP26 metrics `ai_label_coverage`, `ai_interaction_disclosure`, `provenance_marking_coverage`).

## 3. Classification record (working assessment)

| System | What it does | Role (proposed) | Risk class (own assessment) | Article 50 duty that applies | Model provider duties |
|---|---|---|---|---|---|
| iPatent (qnfo-ipatent) | Drafts a provisional patent application from a user's description | Provider of a self-built generative AI system offered to third parties | Limited risk (transparency); not Annex III | 50(1) tell the user it is an AI system; 50(2) mark synthetic text output in a machine-readable way | Models are Cloudflare Workers AI open-weights models: GPAI duties sit with their providers |
| q08.org, reading.q08.org, papers.qnfo.org and the research pipelines | Generate and publish essays, forecasts, notes and papers | Deployer of generative systems that publish text to the public | Limited risk; not Annex III | 50(4) disclose AI-generated text published to inform the public unless human review or editorial responsibility applies (not claimed); 50(2) marking applies to output of systems placed on the market before 2026-08-02 by 2026-12-02 | As above |
| E-mail agent (qnfo-email, qnfo-email-orchestrator) | Classifies the owner's mail and drafts replies in the owner's voice | Deployer, acting in the owner's name | Limited risk; not Annex III | 50(1) disclosure to people who are answered: open decision, owner card bp26-email-agent-ai-disclosure | As above |
| Twin and companion (personal-api) | The owner's personal assistant and wellbeing companion | The owner's personal, non-professional use: Article 2(10) excludes deployers who are natural persons in a purely personal non-professional activity (an adviser should confirm); if it were offered to others the provider duties of 50(1) would apply | Limited risk. A wellbeing companion is not a medical device here (never a diagnosis); not Annex III | 50(1) disclosure at first reply: not yet shown (code task) | As above |
| qnfo-social | Posts AI-written text and images to Bluesky, Mastodon, X and LinkedIn | Deployer | Limited risk | 50(4) and the platforms' automation rules; an in-text automation marker is queued in qnfo-social (BP26-SOCIAL-AUTOMATION-1) | As above |
| Internal agents (code loop, research loops, deploy and audit loops) | Write and review code, fill queues, verify | Deployer; no person is a subject of their decisions | Minimal | None | As above |

Annex III: none of the uses above falls under an Annex III category in the fleet's own reading. GPAI duties fall on the providers of the models (Cloudflare-hosted open-weights models; DeepSeek and OpenAI models reachable through AI Gateway, docs/AI-GATEWAY-UNIFIED-BILLING.md).

## 4. Article 50 status per surface, measured 2026-10-26

Page reads were made with `curl` and a one-line search of the returned HTML. The continuing measure is the pair of BP26 metrics `ai_label_coverage` and `ai_interaction_disclosure`; their runner probes are built under BP26-AI-ACT-ART50-1 (1000341), and until they land this table is a one-day reading, not a measurement.

| Surface | What is live | Gap |
|---|---|---|
| q08.org | The AI-generated badge and JSON-LD `creditText` on every piece (q08-signal-engine 0.37.0, PR 4394); the home page says every piece is written by AI and checked by a separate AI fact-checker | None known |
| reading.q08.org | Each piece page carries a visible "AI-generated" label with the sentence that it was written by AI and checked against its source material (personal-companion 1.43.0, PR 4396); the listing page carries none | Listing page |
| ipatent.qnfo.org | First screen: "iPatent is an AI system: an AI language model writes the draft" (qnfo-ipatent 3.19.0, PR 4397) | None known |
| papers.qnfo.org | No per-paper label. Finding in agent_issues 1000341: 704 published papers under the owner's byline, 38 with an AI declaration, one stating that all claims were reviewed and validated by the human author; no column records whether a paper was written by the pipeline without review | A provenance field per paper, a label and an accurate declaration (code task on qnfo-gateway, claimed by another session on 2026-10-26) |
| qnfo.org pages | The pages mention AI assistance in text (nine occurrences on the home page); that is wording, not a per-artifact label | Per-template label |
| Social posts | Not labelled; an in-text automation marker is queued | qnfo-social/worker.js (live claim of another session on 2026-10-26) |
| Twin API | No first-reply disclosure | Code task |
| E-mail agent | Style guide forbids "As an AI" in replies | Owner decision (card bp26-email-agent-ai-disclosure) |

## 5. AI-literacy measures in place (evidence)

| Measure | Where | What it gives |
|---|---|---|
| Agent handbook read by every agent session | AGENTS.md, CLAUDE.md | Rules every operating agent follows: evidence before assertion, claims and leases, the secret lock, the canonical deploy path, the interrupt gate |
| Operating doctrine and its kernel | docs/AUTONOMOUS-OPERATION-DOCTRINE.md, docs/DOCTRINE-KERNEL.md, docs/AUTONOMY-DECISION-POLICY.md | What agents may decide alone, what stops for the owner, and the recognitions an agent watches for in its own output |
| How model errors are handled | docs/ENSEMBLE-POLICY.md (errors of language models are correlated; panels of judges are worth fewer votes than they seem), docs/OUTPUT-QUALITY-LEDGER.md | Why the fleet uses disjoint model families and outcome measures instead of pass rates |
| Model routing and cost control | docs/COST-OPTIMIZED-MODEL-CALLS.md, docs/AI-GATEWAY-UNIFIED-BILLING.md | Which models run where, with canaries and fallbacks |
| Best-practice catalogue | docs/BEST-PRACTICES-2026.md | The 2026 practices the fleet programmes and measures |
| Public method note | q08.org/p/2026-10-26-how-q08-researches-writes-and-scores-its-forecasts-m3th0d | How AI writes, checks and scores the published forecasts |
| Append-only record of autonomous decisions | `decision_log`, `issue_lifecycle` in qnfo-audit | What was decided, on what evidence, and how to revert it |

What the repository cannot show: any training the owner took. That evidence is the owner's to add below.

Owner's own AI-literacy evidence: _to be added by the owner (courses, reading, dates)._

## 6. Open decisions with owners

| Decision | Owner | Where |
|---|---|---|
| Whether replies sent in the owner's name carry an AI notice | The owner | Card bp26-email-agent-ai-disclosure |
| Account labels for automated posts | The owner | Card bp26-social-bot-labels |
| Retention periods and a sweep of mail-derived data | The owner | Card bp26-retention-enforce, docs/RETENTION.md |
| Per-paper provenance, label and declaration; twin API disclosure; social marker | The code loop | Issues 1000341 and 1000340 |
| Whether this classification is right | The owner and an adviser | This file |

## 7. Review log

| Date | Change | By |
|---|---|---|
| 2026-10-26 | First draft | fleet session rem-a8-privacy (BP26-AI-ACT-ARTICLE4-1) |
