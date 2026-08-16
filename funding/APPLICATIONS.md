# QNFO × QWAV — Funding Applications Tracker (2026-08-13)

**Campaign:** Wide-net autonomous application run. Policy: programmatic/email channels only (no manual web forms); alignment-first (skip funders whose window is closed or whose requirements the project does not meet); every submission carries same-turn evidence.

**Pitch v2 (2026-08-16):** Rapid research iteration — research is bottlenecked by process, not intelligence; LLMs with research-designed protocols/guardrails compress the cycle; the API-accessible QNFO knowledge graph (RAG + database + graph in one queryable layer) is the key asset; anyone can tap the corpus or run the pipeline. Explicitly NOT a business — knowledge as public infrastructure. Location: Amsterdam, Netherlands.

## Submitted — live

| # | Funder | Program | Channel | Evidence | Amount | Status |
|---|--------|---------|---------|----------|--------|--------|
| 1 | **Manifund** | Open research infrastructure + quantum energy standard | Email → austin@manifund.org (address verified on manifund.org) | HTTP 200, message `<dgvySzWBphszXwqm5GQIvh8WsbnE5CNR6kBF@qwav.tech>` (2026-08-13) | $25,000 | Sent — awaiting response |
| 2 | **EA Funds LTFF** | Epistemic infrastructure + quantum energy standard (longtermist framing) | Fast-track email → funds@effectivealtruism.com (documented LTFF fast-track channel) | HTTP 200, message `<CBot6ZVGO7ZtDQKKn0tZYytiCMhVEfpd3sV1@qwav.tech>` (2026-08-13) | $25,000–50,000 | Sent — fast-track requested |
| 3 | **Filecoin Foundation Open Grants** | Decentralized Scholarly Archive on Filecoin (QDC) — Research & protocols | GitHub issue `filecoin-project/devgrants#2170` via gh api | Issue open, body 8,652 B, proposer rwnq8, DOIs cited, budget table $8k/$10k/$7k | $25,000 | Submitted — review 2–4 wks |
| 4 | **Emergent Ventures** (Mercatus) | Zero-to-one open research infrastructure + JPCUB standard; refined pitch v2 (rapid research iteration + open knowledge graph) | **Refined application email** → emergentventures@mercatus.gmu.edu (documented channel; web form has reCAPTCHA Enterprise — hard wall, form filled 2026-08-16 with all fields + consents but CAPTCHA blocks autonomous submit) | HTTP 200, message `<GPZBK0MMVJRC1KPILdTaaSf1RSqlYmyUYGFy@qwav.tech>` (2026-08-16), following intro `<qwuZr8OrHNpATPtrb3HFfYMHWvGHwYEcrAEF@qwav.tech>` (2026-08-13) | $25,000 | Sent — awaiting response |

## Deferred / blocked (documented reason)

| Funder | Reason | Re-entry trigger |
|--------|--------|------------------|
| **EA Funds grant form** (Paperform) | Form validation wall (Draft.js rich text + masked date inputs reject programmatic setters); redundant with fast-track email already sent | None needed — email is the effective application |
| **Emergent Ventures web form** | reCAPTCHA Enterprise — cannot be completed programmatically (verified 2026-08-16); form 100% filled (name/email/phone/location/proposal/budget/consents) but submit button disabled until CAPTCHA; **refined application email sent instead** | None — email is the documented alternative |
| **Foresight Institute** | 2026 AI for Science & Safety Nodes window **closed** (Airtable "not accepting responses"); open form is physical-hub-only (misaligned) | Next application window (watch foresight.org/engage/grants/) |
| **Filecoin ProPGF** | All rounds closed (Batch 3 closed Jun 17, 2026) | Next batch (watch app.filpgf.io) |
| **Ethereum ESP** | Wishlist/RFP structure; **payments require ETH wallet** — no wallet exists on this machine; wallet custody is a user decision | After wallet decision |
| **Gitcoin GG24** | Requires giveth.io + crypto wallet for checkout | After wallet decision |
| **NLnet NGI Zero** | Calls open **Sep 3, 2026**, deadline Nov 3, 2026 12:00 CEST | **BUNDLE PREP — see `NLNET_PROPOSAL.md`** |
| **Sovereign Tech Fellowship** | 2026 window closed Apr 6, 2026 | 2027 cycle (watch sovereign.tech/programs/fellowship) |
| **Templeton / Sloan** | Institutional — no legal entity | After entity decision |

## Evidence chain (all verified live 2026-08-13)

- DOIs resolve 200: 10.5281/zenodo.21901984, 21901983, 21922589, 21905166, 21637028, 21821767, 21880104
- GitHub org QNFO exists; provenance path `QNFO/qnfo-workers/papers/funding-strategy-2026-08-13` has 4 files
- ORCID 0009-0002-4317-5604 → "Rowan Brad Quni-Gudzinas"
- Dossier committed: `QNFO/qnfo-workers` `6b22fa5` (`funding/DOSSIER.md`)
- Email-sending domains onboarded (11 zones incl. qwav.tech, qnfo.org)

## Next actions

1. **NLnet bundle** (`NLNET_PROPOSAL.md`) — submission-ready before Sep 3 (see file)
2. **Wallet decision** (user) — unlocks ESP + Gitcoin
3. **Entity decision** (user) — unlocks Templeton/Sloan; strengthens SFF
4. **Follow-up cadence** — check emails/issue comments weekly; add JPCUB-DOI comment already posted on #2170
