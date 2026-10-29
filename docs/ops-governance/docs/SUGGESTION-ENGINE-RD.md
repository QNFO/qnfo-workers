# Adaptive Suggestion Engine — Ideas/ASK + iPATENT (R&D wave 2026-09-03)

## Directive (user, 2026-09-03)
Both public idea-facing interfaces should have **smarter, better, more adaptive
suggestions**, and they are **related but separate domains**:

- **Ideas / QNFO ASK** (ideas.qnfo.org) — research ideas and information.
- **iPATENT** (ipatent.qnfo.org) — IP/legal ideas and semantics.

**Never** suggest "check my email" or any personal-assistant action on these interfaces;
that is inappropriate for a research/IP surface. Both need continued R&D.

## What shipped this wave

### ideas.qnfo.org — qnfo-idea-factory v2.7.0 (commit d42294b, deploy e7511909)
- New `GET /api/suggest`:
  - Welcome mode → two chip groups: **Recent research questions** (live human research
    threads, ranked message-count/recency, junk+domain filtered, deduped) and
    **Frontier questions** (day-rotating curated research starters).
  - Prefix mode (`?q=`) → live suggestions matched to the typed prefix (thread titles +
    content matches + frontier), then recent + frontier fallback.
  - **SUGGESTION-DOMAIN-1 gate**: deny-list + deny-word regex + command-shape regex
    (email/inbox/outlook/calendar/task/remind/bluesky/tweet/whatsapp/contact/infra/ops)
    applied server-side to every candidate; ops-word prefixes (`q=email`) return only
    domain-safe defaults, never personal/ops items.
- ASK page chips now render those groups and **adapt as the user types** (debounced 320 ms).
- Junk filter extended ("this sucks", "what time", guard-probe, productivity-personal).
- Verified live: `/health` 2.7.0; `/api/suggest` returns research-only items, banned-token
  scan clean; `q=email` returns defaults only; SYNC_TOKEN secret preserved.

### ipatent.qnfo.org — qnfo-ipatent v3.4 (commit c790862, deploy 8fc4369c)
- Canonical repo source restored (was FLEET GAP "no repo dir") from the deployed v3.3 bundle
  into `qnfo-workers/qnfo-ipatent` + README + wrangler.toml (FLEET-SELF-DOC-1).
- New `GET /api/suggest` (IP-domain only):
  - `field` param → technical-field completions.
  - empty `q` → 4 rotating corpus examples (light metadata, no giant bodies).
  - `q` ≥ 3 chars → top-5 similar corpus filings (embed + Vectorize) for style grounding.
- `GET /api/idea?i=N` → deterministic example load (was random-only).
- Landing UI: **STARTERS** chips (load a corpus example into the form for editing) +
  **WHILE YOU TYPE** corpus-guidance strip (debounced) + Technical Field datalist.
- Personal/ops actions never suggested on this surface.
- Verified live: `/health` + `/api/status` 3.4 with all bindings; `/api/suggest`
  examples/fields/similar (0.83 score hits); raw HTML carries starterZone/fieldOptions/JS.

## Design principles (both surfaces)
1. **Domain-scoped suggestion sources.** ASK reads only the research chat log + curated
   frontier set. iPATENT reads only IDEA_BANK metadata + ipatent-corpus Vectorize. No
   cross-domain leakage, no email/ops source.
2. **Never email/ops chips.** Server-side enforcement (deny list + deny words + command
   shapes), not client-side cosmetics.
3. **Adaptive, not just recent.** Welcome = best-of live + curated rotation; typing =
   prefix matching; iPATENT = input-grounded corpus similarity.
4. **Lightweight payloads.** Suggestions carry titles/ids/scores only; bodies load lazily
   on click (`/api/idea?i=N`).

## R&D backlog (next waves)
### Ideas / ASK
- [ ] Deeper user-adaptive ranking (per-visitor interest: recent asks → related frontier).
- [ ] Corpus-hot-topic suggestions from living-paper traffic/KG hubs (needs a data binding;
      today the worker binds only qnfo-audit D1).
- [ ] Suggestion click analytics (which chips lead to successful asks) → bandit rotation.
- [ ] Refine quality gate with LLM title classification for the live threads (test corpus of
      the last ~100 titles) and re-tune junk/domain lists.
- [ ] Propose page example prompts (research-proposal starters) mirroring the ASK work.
### iPATENT
- [ ] Clean corpus metadata: technical_field currently leaks internal folder names
      ("99_Brutal_Cleanup", "Early_Drafts_202507") into the public suggestions; map them to
      clean USPTO-style fields.
- [ ] Example chips grouped by field + "surprise me" vs "guided" modes.
- [ ] Draft-quality feedback loop: after drafting, ask the user which reference filings were
      most useful; use that signal to re-rank `similar`.
- [ ] Section-aware suggestions while writing (e.g., when the user types background, show
      background-style corpus excerpts) — retrieve per section instead of whole-document.
- [ ] Prior-art watch: flag corpus filings close to the user's description BEFORE drafting
      ("you are close to X — refine to distinguish").
### Shared
- [ ] EXP-style controlled evaluation (QNFO Experimentation Program, aggregate-over-N) of
      suggestion click-through and ask success before/after this wave.
- [ ] Per-surface suggestion logs in qnfo-audit D1 to power the bandits.

## Gate notes
- SUGGESTION-DOMAIN-1 (HARD GATE, 2026-09-03): research/IP suggestion surfaces never
  suggest personal/ops actions; enforced server-side in both workers.
- TEST-PROTOCOLS-INTEGRATED-1: this wave closed with live probes (/health versions, endpoint
  JSON shapes, banned-token scan, raw HTML markers) in the same cycle.

## Wave 2 (2026-09-03) — audit SOFT-note closure
- **qnfo-ipatent v3.4.1** (commit pending, deploy 996deb87): cleanField() taxonomy on the
  public suggestion surface — internal folder labels are mapped to USPTO-style fields on
  /api/suggest + /api/idea (SOFT-N3 closed). Verified live: /api/idea?i=0 technical_field =
  "Quantum Computing & Information" (was "99_Brutal_Cleanup"); banned-token scan clean.
- **qnfo-idea-factory v2.7.1** (commit pending, deploy c09a8c97): suggestion deny-tune —
  meta/filler first-messages ("what's the tl;dr", "this would be good for a research paper")
  excluded from ASK chips (SOFT-N1 subset). Verified live: absent from /api/suggest payload.


## Wave 2.2 (2026-09-03) - autonomous deferred resolution
- qnfo-idea-factory v2.7.2 (deploy 41475adb): junk-marker tuning from live /api/sessions sample - naming prompts, reply-with-exactly, guard-probe, qnfo-calendar ops noise excluded from feed+chips.
- qnfo-ipatent v3.4.2 (deploy 981b4801): PRIOR-ART CLOSENESS WARNING - /api/draft returns prior_art when top corpus similarity >=0.80; amber banner in result UI (style/prior-art reference, not clearance).
- backup now runs via detached one-shot runner (schtasks queue unreliable); poll backup_task.log to completion.