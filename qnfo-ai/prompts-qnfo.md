# QNFO Prompts for Chatbox

Copy-paste prompts for the Chatbox prompt library. Replace {placeholders} with your own text.

## NOTE
> Jot this down and keep it brief: {topic}

## CMD RESEARCH
> Run a full QNFO research cycle on {topic}:
> 1) Phase 0: full-corpus due diligence (>=3 query formulations, >=2 adjacent domains, KG stats
>    first, resolve_paper_id on every hit; save evidence files).
> 2) Hypothesis cards: claim + prediction + falsifiers + surprisal, before writing.
> 3) Draft with premise-depth disclosure (where the premises end) and a why-reader-cares statement.
> 4) Computational verification: every numerically-checkable claim verified in code, seeded
>    Monte Carlo for statistical claims, verification scripts deposited.
> 5) Plain scholarly prose for external readers - no pipeline vocabulary, no brand labels.
> Use the MCP tools (papers_search, web_search, web_fetch, history_recall) and cite sources.

## CMD PUBLISH
> Publish the {artifact} per the QNFO publication checklist:
> - all original source files in the deposit (md/html/pdf + references.bib + citation-audit +
>   PROJECT-PLAN + docs + artifacts/external-search + verification scripts)
> - every bibliography entry verified live (Crossref/OpenAlex), no fabricated authors
> - versioned DOI correct in frontmatter, concept DOI in How-to-Cite, related_identifiers set
> - R2 mirror to qnfo-releases, KG + D1 re-pointed, Vectorize re-indexed
> - run scripts/verify-runtime.py after the deploy and report the result.

## CMD RED TEAM
> Adversarial audit of {artifact} (read-only):
> - Accuracy: every claim, number, DOI, version verified against the live record.
> - Completeness: missing edge cases, missing provenance, missing verification steps.
> - Dependency: every cross-reference resolves; imported tools/skills still valid.
> Aggregate findings; every HARD finding becomes a fix item in the next cycle.

## CMD SKILLS UPDATE
> Kaizen cycle for the last {change}:
> - root-cause every error to the MECHANISM, never symptom-patch
> - add a permanent gate (verify script / anti-pattern row / schema check) and verify it exits 0
> - keep the 7 prompt stores byte-identical (raw-sha) and the mirror rows in sync
> - document the canonical case; commit + push; run the runtime verifier.

## CMD CLOSEOUT
> Close out {task}: verify every plan step with tool evidence (exit codes, hashes, read-backs),
> log the outcome to durable memory, list deferred items with reasons and follow-up triggers.

## SYNTHESIS
> Given my past notes and the corpus (use history_recall + papers_search), synthesize what I have
> on {topic}: key claims, verified results, open questions, and the strongest next step. Cite
> which notes/papers each point comes from.
