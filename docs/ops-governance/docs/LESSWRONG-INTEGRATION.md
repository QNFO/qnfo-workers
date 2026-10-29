# QNFO LessWrong Integration - Strategy and Options (Spec for Review)

> Version 1.0 (2026-09-03) - Owner: QNFO - Status: EXPLORED / SPEC FOR REVIEW (no code deployed)
> Claim: LessWrong runs an official agent-first Markdown API (v2.0.0, self-describing at
> https://www.lesswrong.com/api) whose read surface is fully open and whose write surface is
> deliberately DRAFT-COLLABORATION ONLY (link-sharing edit key, no authenticated publish/comment API),
> under a 2026-03-14 disclosure-based LLM content policy that requires all LLM output to live in
> visible LLM Content Blocks and retains the rule that the primary author of any post/comment must be
> an existing human account. Ongoing automated collaboration for QNFO is therefore architecture
> (not a gap): an automated read/listen radar into QNFO research stores, plus a human-vouched
> collaborative authoring loop with machine-performed drafting, editing, suggestion and review work.
> Evidence: live probes 2026-09-03 (full /api doc fetched; /api/latest, /api/search, /api/post/[id]
> returns 200 Markdown; PaQit/QNFO presence searches; policy posts fetched: KXujJjnmP85u8eM6B (2025
> policy, karma 343) and nQWavk9mnwcv6ScMR (2026 editor + policy update, karma 127)); secondary
> corroboration: Agent Wars 2026-03-15 launch/policy summary. No write endpoint was executed (no
> draft link key exists yet).
> Confidence: high on API surface, read paths, policy pillars and audience fit; unverified on live
> write behavior and on the canonical text of the newest policy section.
> Status: exploration complete; implementation gated on review of this spec and open decisions in
> section 11.

---

## 1. Objective

Give QNFO a governed presence on LessWrong - the rationalist community most actively discussing the
physical limits and energy economics of computation - as (a) a research-signal intake and (b) a
high-trust publishing surface for QNFO living-paper results, without violating LessWrong's LLM
content policy or QNFO's standing honesty/no-spam/no-fabrication mandates.

This document inventories what LessWrong exposes (verified 2026-09-03), states precisely what
"ongoing automated collaboration" can and cannot mean on this platform, and specifies a three-phase
architecture (read-side radar, human-vouched pilot publish, ongoing loop) consistent with QNFO
cloud-native recurring-function design (RESEARCH-PIPELINE-CLOUD-1), the no-email-to-inbox rule
(NO-FLEET-DIGESTS), the outreach governance pattern (docs/OUTREACH-AUTOMATION-STRATEGY.md) and the
honest-measurement program (docs/EXPERIMENTATION-PROGRAM.md).

## 2. Platform and API surface (verified 2026-09-03)

### 2.1 Identity and auth model

- Reading content requires NO authentication. Every page has a Markdown twin; routes under /api/
  return Markdown (or JSON). AI-agent-friendly output is the documented design goal.
- Writing is possible ONLY on post drafts the human author explicitly shares. The author sets
  "Anyone with the link can" to Edit or Comment in sharing settings, then pastes an editPost URL of
  the form `https://www.lesswrong.com/editPost?postId=XYZ&key=XYZ`. The `key` is the link-sharing
  key - a per-draft capability, not an account credential. No OAuth, no session API, no API keys.
- There is NO authenticated endpoint for publishing a post or commenting on a published post on the
  documented surface (full-doc scan: publish/login/OAuth/commentOnPost absent). Draft collaboration
  is the entire write surface.

### 2.2 Read endpoint inventory (all live-verified except where noted)

| Endpoint | Purpose | Notes |
|---|---|---|
| /api/home, /api/latest, /api/recent, /api/curated | feeds | ?limit=n, max 100 |
| /api/search?search=... | search posts/comments/wikitags/users/sequences | live probe returned per-type counts + Markdown results |
| /api/post/[id] | one post (Markdown) | ?compact=1 omits heavy media/math; HTML twin under /posts/... |
| /api/post/[id]/comments | comments | ?sort=top|new|old, ?limit, ?includeReactionUsers |
| /api/post/[id]/comments/[commentId] | one comment | |
| /api/tag/[slug], /api/user/[slug], /api/sequence/[id] | tags/users/sequences | |
| /api/rationality, /api/codex, /api/hpmor | curated collections | |
| /api/community, /api/events | in-person events | ?lat/&lng |
| /api/agent/ping | network-access self-test | any HTTP method; returns 403 x-deny-reason if host not allowed |

### 2.3 Agent write endpoint inventory (draft collaboration; NOT executed - no draft key yet)

| Endpoint | Purpose | Notes |
|---|---|---|
| GET /editPost?postId&key | read a shared draft | returns body + Comment Threads section |
| POST /api/agent/commentOnDraft | Google-Docs-style comment | optional `quote` anchor (visible rendered text, not markdown source) |
| POST /api/agent/replyToComment | reply in an existing thread | threadId from editPost response |
| POST /api/agent/replaceText | replace text | `quote` + `replacement`; mode edit|suggest (default suggest) |
| POST /api/agent/insertBlock | insert markdown block | location start|end|{before}|{after}; paragraphs, lists, math, code, spoilers, collapsibles |
| POST /api/agent/deleteBlock | delete a block/list item/table/equation | prefix must match exactly one top-level block |
| POST /api/agent/insertLLMBlock | insert visibly-attributed AI block | modelName shown in header (default "AI Agent"); always direct, no suggest mode |
| POST /api/agent/insertWidget | insert sandboxed HTML/JS iframe widget | responsive 100%-column layout; height auto-measured 50-5000px |
| POST /api/agent/replaceWidget | replace widget contents | widgetId from insert |
| POST /api/agent/feedback | report API bugs/gaps to dev Slack | not for content |

### 2.4 Behavior notes

- Quote anchors must be quoted VERBATIM from the latest editPost read (typographic punctuation and
  emphasis markers are folded server-side; link targets and the title are not anchorable). On a
  "no match" error, re-read the draft - drafts are a live collaboration surface and may have changed.
- AI-drafted prose is inserted as LLM content blocks (markdown representation `%%% llm-output
  model="..." ... %%% /llm-output`); blocks are always attributed, always direct (no suggest mode).
- The feature is officially "in development, the API should not be assumed stable", and users using
  it are reminded of LessWrong's LLM-writing policy.
- /api/agent/ping POST returning 403 with x-deny-reason: host_not_allowed means the harness's domain
  allowlist must add www.lesswrong.com (relevant only to harnesses with allowlists; DeepChat's
  fetch path is not allowlisted in this manner).

## 3. LLM content policy (the operative constraint)

### 3.1 Current policy (2026-03-14, disclosure-based)

The announcement post "New LessWrong Editor! (Also, an update to our LLM policy.)" (RobertM, karma
127) introduces the editor and policy in one release. Per the Agent Wars 2026-03-15 summary and the
moderation practice visible in comments, the new rules are:

- All "LLM output" must be wrapped in LLM Content Blocks (the visually distinct attributed block).
- Code is excluded from the "LLM output" definition.
- Lightly-edited human text needs no attribution; substantially AI-revised content requires a block.
- Auto-moderation thresholds lowered; enforcement consistent across new and established users
  (replacing the old unevenly-enforced one-minute-per-50-words + no-stereotypical-AI-style rules).
- Rationale stated: LLM-generated text is epistemically different from human testimony; readers
  should know the provenance of what they read.

### 3.2 Retained rule: Posts by AI Agents (2025 policy, explicitly unchanged)

From "Policy for LLM Writing on LessWrong" (jimrandomh + Ruby, 2025-03-24, karma 343; update note
points to the 2026 policy and states: "The 'Posts by AI Agents' section below remains unchanged"):

- In nearly all cases, posts by autonomous AI agents fall under the human-assistant rules: an agent
  may type text and click Submit and may coauthor, but must be working with a human who invests
  substantial thought/effort/time and vouches for the result.
- The primary author of posts/comments must be an existing human account.
- A narrow special exception exists for a frontier AI with non-public world-improving information
  (not applicable to QNFO).

### 3.3 Verification gap

The 2026 announcement post's compact Markdown does not itself contain a literal "Policy on LLM Use"
section (the fetched body is the editor demo with an LLM block and widget), and the non-compact /
HTML fetch of the same post returned empty. The 2025 policy page also still states "first-time
writers are not permitted to use any AI text output" - a clause the 2026 uniform-enforcement change
may supersede but which is not directly confirmable from fetched text. RESOLVE before first publish
(section 11, decision 4).

## 4. Audience and fit (verified 2026-09-03)

- QNFO/PaQit have ZERO presence: /api/search?search=PaQit returns 0 posts, 0 comments, 0 wikitags.
- Topical resonance is strong and current:
  - energy efficiency computing: 12,750 hits / 5,852 posts, incl. hippke "The next AI winter will be
    due to energy costs" (karma 71).
  - QNFO energy efficiency metric terms: 1,004 hits / 328 posts; top results are the exact
    conversation QNFO research speaks to - jacob_cannell "Brain Efficiency: Much More than You
    Wanted to Know" (karma 218), DaemonicSigil "The Brain is Not Close to Thermodynamic Limits on
    Computation" (karma 167), jacob_cannell "Contra Yudkowsky on AI Doom" (karma 91).
  - joules per compute benchmark: 1,926 hits / 937 posts, incl. Matthew Barnett's concrete bet
    offer, Vladimir_Nesov "Slowdown After 2028: Compute, RLVR Uncertainty, MoE Data Wall".
  - Reversible computation / energy-efficiency-of-computation comment threads are active.
- Live /api/latest (2026-09-03) confirms an active, AI-governance-heavy front page (Sanders/Casar
  ASI bill, Zvi AI #184, audit-realism research post).
- Fit conclusion: QNFO's joules-per-compute benchmark, PaQit system-level energy metric and
  Landauer/Margolus-Levitin quantum-floor work map directly onto existing high-karma discussion;
  a first post would enter a live conversation, not a vacuum.

## 5. What "ongoing automated collaboration" can and cannot be on LessWrong

- CAN be: (1) fully automated READING - radar scans, relevance ranking, storage, RAG ingestion,
  mention/citation watching; (2) fully automated DRAFT WORK on posts the human author shares -
  drafting, suggested edits, inline review comments, LLM content blocks, interactive widgets,
  iterative revision until the human accepts; (3) automated reply-text preparation for published
  thread comments (human performs the final posting action).
- CANNOT be: an agent account publishing autonomously, an agent commenting on published posts
  through an API, or unattributed AI text anywhere. This is a platform-policy boundary, not an
  engineering gap. It does not conflict with the QNFO automated-outreach mandate (2026-08-07) any
  more than any other human-required action does: everything except the final human "publish" click
  (and, for comments, the final human posting click) is automated. Per the standing inbound-routing
  rule, the user is engaged only for those human-required actions and for the open decisions below.

## 6. Architecture

### Phase 1 - Read-side radar (autonomous; deployable on approval)

New scheduled Worker `qnfo-lesswrong-radar` in QNFO/qnfo-workers (canonical repo dir per
FLEET-MANIFEST), mirroring the events-radar/arxiv-radar pattern:

- Trigger: daily `45 6 * * *` UTC (after research-daily-brief window).
- Queries (bounded, polite): one /api/search per keyword set plus one /api/recent?limit=100 sweep:
  1. "energy efficiency computing" / "joules per compute"
  2. "Landauer limit" / "reversible computation" / "thermodynamic limits of computation"
  3. "brain efficiency" / "neuromorphic energy"
  4. "AI energy costs" / "data center power" / "efficiency benchmark"
  5. "Margolus-Levitin" / "quantum speed limit" / "quantum energy bound"
  6. self-watch: "PaQit" / "QNFO" / "joules-per-compute" (citation/mention watch; zero today)
- Politeness: >=1s between requests; cap ~12 requests/run; honor non-200/429 with backoff and audit.
- Processing: dedupe on (external_id, query); relevance score 0-3 (title/keyword density + karma
  floor); keep score>=2 or topic match; store rows in qnfo-audit D1 (schema in section 7); optionally
  embed kept rows to Vectorize for research RAG (binding decision deferred - section 11, decision 6).
- Kill switch: pipeline_state row `lesswrong_radar_enabled` (flip 0 to halt), same pattern as the
  outreach engine. Audit rows to qnfo-audit on every run. NO email anywhere (NO-FLEET-DIGESTS).

### Phase 2 - Pilot publish (human-vouched collaborative authoring loop)

1. Select one flagship living paper with LW-applicable scope (recommendation in section 11).
2. Agent prepares an LW-specific draft from the PUBLISHED paper (prose gates: no internal gate
   jargon or branded register per PUBLICATION-BRAND-LANGUAGE-1, no AI stylistic tells in
   human-voiced text per ANTI-TELEGRAPH-1, DOI/Zenodo provenance, why-an-LW-reader-cares framing).
3. Human (Rowan's EXISTING human account - required as primary author) creates the draft and shares
   the editPost link with Comment permission (recommended) or Edit; the link key is handled as a
   per-draft secret - never committed, revocable by changing sharing settings.
4. Agent runs the loop against the live draft: GET /editPost -> apply the API's default review
   structure (premises, local validity, missed considerations, source accuracy, existing-argument
   coverage, clarity) -> insert substantive AI-written sections via insertLLMBlock (modelName
   explicit), make smaller changes as suggest-mode edits or commentOnDraft threads, and embed one
   interactive widget where a metric/demo adds value (e.g. a joules-per-compute comparison chart).
5. HARD GATE: every AI-written paragraph of the final draft sits inside an LLM content block.
   Auto-check before asking the human to publish: parse the draft markdown; any substantive prose
   paragraph outside %%% llm-output fences fails the gate.
6. Human reviews, accepts suggestions, adjusts, publishes. Nothing is published by the agent.
7. Post-publish: agent stores postId + URL in qnfo-audit and starts the Phase 3 monitor for that
   thread.

### Phase 3 - Ongoing loop (institutionalized cadence + response watch)

- Cadence gate: at most one LW post per published paper version and at most 1/month in the pilot
  year; each post must add LW-specific value (no duplicate crossposts of identical text used on
  other venues).
- Thread monitor: poll /api/post/[id]/comments?sort=new for QNFO threads daily; classify new
  comments (question / objection / agreement / correction); prepare reply text with evidence
  pointers for the human to post (no comment API exists). Log all prepared replies to qnfo-audit.
- Mention watch: continue the Phase 1 self-watch query set; when QNFO work is discussed, prepare a
  response and route to the human (public response requires the human account).
- Governance: caps + spam-token blocklist + audit rows, mirroring the outreach engine pattern;
  any detected policy drift (e.g. unattributed AI text) halts the loop and raises a review flag in
  qnfo-audit (no email).

## 7. Data model and worker config (Phase 1)

D1 (qnfo-audit database), table `lesswrong_signal`:

```sql
CREATE TABLE IF NOT EXISTS lesswrong_signal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT NOT NULL,          -- post:<postId> | comment:<commentId>
  kind TEXT NOT NULL,                 -- post | comment | wikitag
  title TEXT,
  author TEXT,
  url TEXT,
  karma INTEGER,
  date TEXT,                          -- ISO 8601
  query TEXT NOT NULL,                -- keyword set that surfaced it
  topic TEXT,                         -- matched QNFO topic bucket
  snippet TEXT,
  relevance INTEGER DEFAULT 0,        -- 0-3
  raw_hash TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(external_id, query)
);
CREATE INDEX IF NOT EXISTS idx_lw_signal_created ON lesswrong_signal(created_at);
CREATE INDEX IF NOT EXISTS idx_lw_signal_topic ON lesswrong_signal(topic);
```

Pipeline state (same table family as the outreach kill switch):

```sql
-- pipeline_state row: key='lesswrong_radar_enabled', value='1' (flip 0 to halt)
```

Worker env: LESSWRONG_BASE_URL=https://www.lesswrong.com (no secrets needed for Phase 1). Cron in
wrangler.toml triggers. Bundle in qnfo-workers with deployed-current.worker.js mirror + FLEET-MANIFEST
entry on approval (FLEET-SELF-DOC-1).

## 8. Gates and guardrails

| QNFO standing gate | Mechanism in this spec |
|---|---|
| HONEST-ONLY / NO-FABRICATION-1 | Radar stores only real fetched content; drafts derive from published, computationally-verified living papers (COMPUTATIONAL-VERIFICATION-1) |
| NO-SPAM / burst discipline | Cadence gate (1 post per version, <=1/month pilot); no duplicate crossposts; polite radar pacing |
| AI disclosure / ANTI-TELEGRAPH-1 / PERSONA-STRIP-1 | Mandatory LLM Content Blocks for all AI prose; human primary author; agent never presents as human |
| PUBLICATION-BRAND-LANGUAGE-1 | No internal gate jargon/branded register in post prose |
| NO-FLEET-DIGESTS (user directive 2026-09-02) | Radar + monitors write to qnfo-audit D1; never email |
| CLOUD-FRONTEND-ONLY-1 / RESEARCH-PIPELINE-CLOUD-1 | Radar is a scheduled CF Worker; kill-switch rows; audit rows every run |
| DEPLOY-LAST-WINS-RECONCILE-1 / DEPLOY-VERIFY-VERSION-1 | If deployed, verify /health VERSION after deploy; adopt superseded bundles as canonical |
| Third-party-loss guardrail (Fatebook spec precedent) | LessWrong is a mirror surface; evidence stays canonical in QNFO Zenodo/D1/KG stores |

## 9. Rollout plan and acceptance criteria

- Step 1 (on approval): Phase 1 worker + D1 migration + audit wiring; run 30 days; report relevance
  yield (kept rows / scanned hits, topic distribution) to qnfo-audit.
- Step 2 (after decision 4 resolves policy text): Phase 2 pilot post for the chosen flagship with
  the LLM-block hard gate; measure thread activity and comment quality over 30 days.
- Step 3: formalize Phase 3 cadence, mention-watch responses, and caps; register a QNFO.LW audit
  row set mirroring the outreach engine.
- Acceptance: pilot year yields >=1 substantive discussion thread that cites or engages the paper;
  zero policy/moderation incidents; zero unattributed AI text; all agent actions logged.

## 10. Claims and evidence

| Claim | Evidence | Confidence | Status |
|---|---|---|---|
| LessWrong /api is a self-describing Markdown agent API v2.0.0 | /api fetched 2026-09-03 (full doc, name/version header) | high | verified |
| Read routes open without auth | Live 200 Markdown on /api/latest, /api/search, /api/post/[id] (3 posts + 2 policy posts) 2026-09-03 | high | verified |
| Write surface = draft collaboration only (link-sharing key) | Full doc: editPost + /api/agent/* endpoints; no publish/comment-on-post endpoint in doc scan | high | verified (not executed) |
| LLM content policy 2026-03-14 is disclosure-based (content blocks, code excluded, consistent enforcement) | Announcement post nQWavk9mnwcv6ScMR + Agent Wars 2026-03-15 summary | high | verified (secondary corroboration) |
| "Posts by AI Agents" rule retained: primary author must be existing human account | 2025 policy post KXujJjnmP85u8eM6B (karma 343) update note + body | high | verified |
| PaQit/QNFO have zero LessWrong presence | /api/search?search=PaQit 2026-09-03 (0/0/0) | high | verified |
| Strong topical audience fit | /api/search hits + karma (Brain Efficiency 218, Thermodynamic Limits 167, energy-AI-winter threads) | high | verified |
| Canonical text of newest "Policy on LLM Use" section + first-time-writer clause status | NOT directly fetchable from announcement compact Markdown or HTML route (empty); old policy page still carries the clause | n/a | unverified - resolve before publish |
| Live write behavior (insertLLMBlock/widget/etc.) | Not executed - requires a human-shared draft key | n/a | unverified |

## 11. Open decisions for the user

1. LessWrong account: confirm an existing human account exists for Rowan (primary-author requirement)
   and who will do the publish click for the pilot.
2. Pilot flagship: recommended candidate - the joules-per-compute benchmark living paper (JPCUB) or
   the PaQit metric paper; LW framing = "energy per computation as a first-class benchmark".
3. Pilot permission level: Comment (agent suggests, human accepts - safest) vs Edit (agent edits
   directly, human publishes).
4. Resolve the canonical 2026 policy text + first-time-writer AI clause before any publish
   (fetch full HTML policy page, wiki, or ask a moderator via /api/contact).
5. Radar keyword set and daily cadence (defaults proposed in section 6; adjust after 30-day yield).
6. Whether Phase 1b (Vectorize RAG ingestion of kept rows) is bound now or after the pilot.
7. New worker (qnfo-lesswrong-radar) vs folding into an existing radar-family worker
   (recommended: new worker for isolation + independent kill switch).

---

*Canonical repo: QNFO/qnfo-ops (docs/LESSWRONG-INTEGRATION.md). Exploration basis (2026-09-03):
www.lesswrong.com/api (self-describing doc), live probes of /api/latest, /api/search, /api/post/[id],
/api/post/[id]/comments; policy posts KXujJjnmP85u8eM6B and nQWavk9mnwcv6ScMR;
agent-wars.com/news/2026-03-15-lesswrong-agent-integration-api-overhauled-llm-content-policy.
Aligned with docs/EXPERIMENTATION-PROGRAM.md (honest measurement), docs/OUTREACH-AUTOMATION-STRATEGY.md
(no-spam, kill-switch governance) and docs/FATEBOOK-INTEGRATION.md (third-party integration spec
precedent). QNFO.LW.001.*