# jobsearch: verified-claims job matcher (JOBSEARCH-POC-1)

Run: `python -I run.py --out out --cache out_cache.json` · Test: `python -I test_jobsearch.py`

## Pipeline
1. **Ingest** (`sources.py`): public ATS APIs (Greenhouse, Lever, Ashby) + Remotive + Arbeitnow. No LinkedIn/Indeed scraping (LinkedIn User Agreement s8.2).
2. **Gate + score** (`match.py`): deterministic and explainable. Hard gates (seniority, role family, location), then title fit (40) + evidence clusters (45, needs 2+ keyword hits each) + uncommon-intersection bonus (15). Auth, degree, and location doubts become `OWNER CHECK` flags, never silent assumptions.
3. **Tailor** (`tailor.py`): resume and note are assembled only from sentences in `facts.json` (the claim ledger, from the verified CV).
4. **Verify** (`tailor.verify`): every output line must carry a tag and equal its ledger sentence; numbers must exist in the ledger; unclaimed technologies/credentials are rejected; quoted posting terms must appear in the posting. A failure blocks the artifact.
5. **Outbox**: `out/<job>/{resume,note}.md` + `meta.json` with `status: pending_owner_approval`.

## Why not "100% user-free outreach"
- Auto-apply tools measured at 0.4-6% response; recruiters reject unpersonalized AI output (62% in one 925-person survey); tools are documented inventing skills. Reputation risk is asymmetric: one fabricated claim costs more than 100 missed applications.
- LinkedIn bans bot messaging/scraping (account restriction). Mass cold email to harvested recruiter addresses breaches GDPR/ePrivacy for an Amsterdam sender.
- So: discovery, matching, tailoring, verification run unattended; **sending** is gated by approval. Nothing here sends anything.

## Ledger gaps the owner must fill (`unverified_needs_owner` in facts.json)
Work authorization (NL/EU/US), salary floor, languages, relocation tolerance. Until filled, matching flags rather than assumes.

## Next steps (not built)
- Approved-send path through each ATS's own apply URL (human click) or Gmail draft creation.
- Owned-surface publishing: JSON-LD `Person` + CV page on qnfo.org generated from the same ledger.
- Optional LLM re-rank (reason about fit only; may not write claims; output run through `verify_freeform`).
- Scheduled run as a worker cron writing to D1 `agent_issues`/owner queue.
