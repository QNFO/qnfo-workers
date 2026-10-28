# BP26 security cluster

One section per item. Each section states what was measured, what was changed, what is verified live and what remains with its exact blocker.

## BP26-AI-ACT-ART50-1 (agent_issues 1000341, GitHub 4417): visible AI labels and AI disclosure at first interaction

Status 2026-10-28. Detector: `scripts/bp26_web.py` collectors `ai_label_coverage` (0.4 before this change) and `ai_interaction_disclosure` (0.333 before).

Source: Regulation (EU) 2024/1689 Article 50 (50(1): a person interacting with an AI system is told so, unless obvious; 50(2): synthetic output marked in a machine-readable way; 50(4): AI-generated text published to inform the public is disclosed unless a human reviews it and holds editorial responsibility). The fleet has no manual approval step before publication, so the 50(4) exemption is not claimed (docs/AI-USE-POLICY.md section 2, rule 1).

| Surface | Before | Change | Owner of the file |
|---|---|---|---|
| Social post text (qnfo-social 0.21.0) | 0 of 42 posts of 14 days carried a marker. 0.20.0 appended " [automated]", which names no AI, is not read as an AI marker by the collector, and was skipped for any post that had no room | The marker is " [AI-generated]" and is never skipped: a post with no room is fitted to the limit minus the marker (URLs kept, prose shortened) at the three choke points (Bluesky `postText`, `mastodonCreate`, `bufferCreate` for LinkedIn, X and Substack). `qnfo-social/automation-marker.test.mjs` | this session |
| Twin first screen (personal-api 4.26.0, companion 1.13.0) | me.q08.org/companion carried no disclosure | Visible text node on the first screen, in the guide and in the Talk view: "Your companion is an AI system: an AI language model writes every reply, not a person." `personal-api/ai-disclosure.test.mjs` runs the collector's own regex over the page templates | this session |
| Paper page, qnfo.org pages (qnfo-gateway) | no visible label, no JSON-LD flag | see the PROVENANCE section below (gateway edit) | qnfo-gateway (claimed by another session at the time of writing) |
| E-mail agent signature | Style guide forbids "As an AI" in replies | Not changed. It writes in the owner's name: IDENTITY-BOUND, owner card `bp26-email-agent-ai-disclosure`. The collector reads `qnfo-email/worker.js` for the disclosure; nothing is added there, so `ai_interaction_disclosure` cannot reach 1.0 until the owner decides | owner |

Expected values after deploy and the next consumer run: `ai_interaction_disclosure` 0.667 (ipatent and the twin of three surfaces), then 1.0 only with the owner's decision. `ai_label_coverage`: the social template needs the marker in every post of the last 14 days (`SOCIAL_DAYS` in the collector), so it can pass only once the 14-day window holds no pre-marker post: the first full pass is 14 days after the deploy. That is a property of the measure, not a gap in the code; a shorter window would need a change to the collector with a recorded reason.

Failure mode that remains: a post fitted to make room loses prose; a paper-link post keeps its URL because `fitKeepUrls` shortens prose only. Rollback: revert the PR; no data is changed by this part.

## Per-paper provenance (finding of 2026-10-26, part of 1000341)

Measured on living-paper 2026-10-28: 710 papers published, distributed or external_preprint; 38 bodies carry a "Use of Artificial Intelligence" declaration; 1 states "reviewed and validated by the human author"; `papers.change_actor` is NULL for 645 published papers, so the actor cannot say who produced a paper. The change is a separate table (no row of `papers` is rewritten, PAPER-LEDGER-1 untouched): `paper_provenance(slug, provenance, basis, set_by, set_at, reviewed_by, declaration_conflict)`.

- `provenance` is `fleet-generated` (default; written by the fleet's pipelines, no person reviewed it) or `ai-assisted-human-reviewed`. A CHECK refuses the second value without a named `reviewed_by`: the label cannot claim a review nobody recorded.
- Backfill: every paper with a slug is `fleet-generated` ("no human review is recorded for this paper"), because the repository holds no review record for any paper. `declaration_conflict = 1` flags a body that claims a human review; those bodies are corrected through the paper-revision path (a body change needs `change_actor` and `change_reason`), not by this migration.
- A trigger gives each new paper its row at insert, with the writer's `change_actor` in `set_by`; the page treats a missing row as `fleet-generated` (fail-safe).
- Files: `migrations/2026-10-28-art50-paper-provenance.sql` (living-paper), `migrations/art50-provenance.test.mjs`.

## BP26-PROVENANCE-MARKING-1 (agent_issues 1000335, GitHub 4411): machine-readable provenance, deadline 2026-12-02

### Specification findings (C2PA 2.2, read 2026-10-28)

Source: https://spec.c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html (guidance: .../guidance/Guidance.html).

- Unembeddable assets use an external manifest (section 11.4) with a reference to the remote manifest embedded in or associated with the asset (section 11.5). The 2.2 text read does not define a `<link rel="c2pa-manifest">` or an HTTP Link header for HTML; that link relation is therefore this fleet's convention (and the issue's), not a conformance claim.
- Signing credential: X.509 only; the certificate carries the `c2pa-kp-claimSigning` extended key usage; validators trust signers through the C2PA Trust List. A self-signed certificate is not trusted by a conforming validator. A raw Ed25519 key with no certificate is not a C2PA signature.
- The generative-AI statement is an action in the `c2pa.actions` assertion (section 18.14), `c2pa.created`, with `digitalSourceType` = the IPTC value `http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia`.
- Not read: the remaining ~480 000 characters of the page (certificate profile details, trust list enrolment). Treat the statements above as the checked minimum.

### What is built (the smallest correct form)

See the gateway section appended below when its PR lands. Until then the ledger exists: `migrations/2026-10-28-art50-asset-provenance.sql` creates `asset_provenance` in qnfo-audit (one row per signed asset: asset_id, kind, url, sha256, manifest_url, key_id, signed_at, the signer's self-check `verified_ok`, and the independent probe's `probe_ok`). The producer of `provenance_marking_coverage` (`scripts/bp26_provenance_marking_coverage.py`, another session) looks for a table named like `asset_provenance`; it and the signer meet at this table, and the producer is the independent verifier.

### True C2PA signing is identity-bound

A real C2PA manifest needs an X.509 signing certificate chained to a CA on the C2PA Trust List. Obtaining one means a purchase and an identity verification of the signer (the owner, a natural person, or the QNFO imprint): money and an identity act. That is an IDENTITY-BOUND step; the fleet does not buy certificates or verify identity in the owner's name. Until the owner acts, the fleet ships a signed JSON sidecar with its own Ed25519 key (a detectable, machine-readable mark under Art. 50(2); it is not a C2PA credential and says so in its `profile` field). PDF and image manifests in C2PA form are described in the sidecar's `c2pa_shaped` block (same assertions, unsigned by a CA) so that the upgrade is a signing-step change only.
