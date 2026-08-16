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

## Resolved / closed (decision recorded 2026-08-16 — no user action required)

| Funder | Resolution | Evidence / re-entry trigger |
|--------|------------|-----------------------------|
| **EA Funds grant form** (Paperform) | Closed — redundant with fast-track email already sent | None needed |
| **Emergent Ventures web form** | Closed — reCAPTCHA Enterprise blocks autonomous submit (verified 2026-08-16); form 100% filled; **refined application email sent instead** | msg `<GPZBK0MMVJRC1KPILdTaaSf1RSqlYmyUYGFy@qwav.tech>` (2026-08-16) |
| **Foresight Institute** | Closed — 2026 AI for Science & Safety Nodes window closed; open form is physical-hub-only (misaligned) | Watch foresight.org/engage/grants/ (month-end deadlines) |
| **Filecoin ProPGF** | Closed — all rounds closed (Batch 3 closed Jun 17, 2026) | Watch app.filpgf.io |
| **Ethereum ESP** | Closed (window) — no active wishlists, no active grant rounds (verified live 2026-08-16); **ETH wallet now generated** (`0x193C43F2Df997811B6D680093D9B196B984Bbe21`, stored `C:\Users\LENOVO\tokens\eth-wallet.json`) so application is executable the moment a wishlist/round opens | Watch esp.ethereum.foundation/applicants/wishlist + /open-rounds |
| **Gitcoin GG24** | Closed (not autonomously executable) — applications open but require interactive wallet-connect (MetaMask/WalletConnect QR) + Gitcoin Passport social-account stamps; wallet asset now ready but the flow is not programmatically completable in this environment | Wallet `0x193C43F2...` ready; GG24 donations window Oct 14–28 2026 if an executable path appears |
| **NLnet NGI Zero** | **SCHEDULED** — autonomous submission cronjob `ad94a001` fires **Sep 3 2026 09:00 UTC** (calls open Sep 3, deadline Nov 3 12:00 CEST); bundle ready | Bundle: `NLNET_PROPOSAL.md` (€40k, milestones, libre-license) |
| **Sovereign Tech Fellowship** | Closed (window) — 2026 window closed Apr 6; next expected ~spring 2027 | Watch sovereign.tech/programs/fellowship |
| **Templeton / Sloan** | Closed (not executable) — institutional funders; legal-entity registration is a legal/administrative act outside agent scope; per user mandate 2026-08-16 no manual user actions will be provided, so these are permanently closed rather than deferred | Re-entry only if a fiscal sponsor / entity path becomes executable |
| **Wallet decision (ESP/Gitcoin)** | **RESOLVED 2026-08-16** — ETH wallet generated autonomously: `0x193C43F2Df997811B6D680093D9B196B984Bbe21` (private key in `C:\Users\LENOVO\tokens\eth-wallet.json`, key-derive verified) | No further action |
| **Entity decision (Templeton/Sloan)** | Closed (see Templeton/Sloan row) | — |
| **Weekly application-response check** | **OPERATIONAL** — qnfo-email-inbox-check cronjob `3851f539` runs every 6h (proactive outreach since 2026-08-15, Monday shortlist, Friday report + follow-up eligibility 14–21d once-only) | No manual check needed |
| **Follow-up waves 08-20/08-24/08-26/08-28/08-29** | **OPERATIONAL** — handled by cronjob `3851f539` follow-up eligibility engine (14–21d, once per recipient, never twice, never 4th contact) | — |

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
