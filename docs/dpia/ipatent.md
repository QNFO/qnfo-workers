# DPIA — iPatent (qnfo-ipatent, ipatent.qnfo.org) — DRAFT for owner review

Status: **DRAFT, 2026-10-26** (BP26-DPIA-1, agent_issues 1000343). Written by an automated fleet session from the code, the public pages and read-only counts of ipatent-db. **Not legal advice**; no conclusion below is a statement that the processing complies with the GDPR. The owner decides. Review every year (next: 2027-10-26) and whenever the tool changes what it keeps or which models it calls. Related: docs/ROPA.md row R10, issue BP26-NO-TRACKING-1 (1000345), the Article 50(1) disclosure shipped in qnfo-ipatent 3.19.0.

## 1. The processing

What it is. iPatent is a public web tool: a person describes an invention and the tool drafts a provisional patent application with a language model. The landing page states, before first use, that iPatent is an AI system and that an AI language model writes the draft (qnfo-ipatent 3.19.0, measured on the live page 2026-10-26), and that open-weights models on Cloudflare Workers AI write every section. The database ipatent-db holds: `submissions` (inventor name and e-mail where given, the **invention disclosure text**, the generated document, claims, abstract, an R2 key, status, **raw IP address**, user agent, country, session id), `analytics` (event type, page, referrer, raw IP address, user agent, country, session id), `sessions` (raw IP address, user agent, country, first and last seen) and two counters (`page_views`, `usage_counts`). The worker sets one cookie, `ipatent_ab` (the arm number 1 or 2, 30 days, Secure, SameSite=Lax) for a page A/B test.

Scale on 2026-10-26. 68 submissions since 2026-07-12 (5 with an e-mail address), 41 analytics rows, 11 sessions. 41 submissions, all 41 analytics rows and all 11 sessions are older than 90 days and still carry raw IP addresses (the longest stored value is 36 characters).

Data subjects. Anyone who uses the tool (inventors, possibly employees describing an employer's invention) and anyone named in a disclosure.

Purposes. Produce the draft the user asked for; count usage; choose between two page variants.

## 2. Screening

| EDPB criterion | Applies | Why |
|---|---|---|
| 1 Evaluation or scoring | No | |
| 2 Automated decision with legal or similar effect | No | The draft is advice for the user, not a decision about them |
| 3 Systematic monitoring | Light | Per-event analytics keyed by session and IP address |
| 4 Sensitive or highly personal data | Possibly | A disclosure can contain trade secrets and, incidentally, personal data; confidentiality matters because a public disclosure can destroy novelty |
| 5 Large scale | No | 68 submissions |
| 6 Matching or combining datasets | No | |
| 7 Vulnerable data subjects | No | |
| 8 Innovative technology | Yes | A language model drafts from the user's text |
| 9 Prevents exercising a right | No | There is no access or erasure route today (risk 5) |

One criterion clearly applies and one partly. The DPIA is done because the risk to confidentiality is the whole product, not because a list requires it; the AP list does not cover it at this scale.

## 3. Necessity and proportionality

The disclosure text is the data the user supplies for the draft; keeping it after delivery, with the submitter's network address and browser, is not needed for the purpose. Raw IP addresses are not needed for the counters at all; a coarse country and a day count would do. The A/B cookie is not strictly necessary and carries no consent; a hash bucket of the request or no test would remove it. The proposed periods are in docs/RETENTION.md (IP address and user agent 90 days, sessions and analytics 90 days, submissions 730 days).

## 4. Risks and measures

| # | Risk | Existing measures (found in code or on the page) | Proposed measures | Residual |
|---|---|---|---|---|
| 1 | A confidential disclosure reaches a third party (a model provider, a log, another user) | The page says open-weights models on Cloudflare Workers AI write every section, and the code agrees: every model call in qnfo-ipatent/worker.js is `env.AI.run` with a `@cf/` model (`glm-5.3-flash`, `gpt-oss-120b`, `deepseek-v4-flash-0731`, and `bge-base-en-v1.5` for embeddings); no provider API host appears in the worker and no call names an AI Gateway, so the gateway's payload log and response cache do not hold disclosures (read 2026-10-26); `Cache-Control: no-store` on the page | Re-verify on every model change; payload logging off; state on the page what is kept and for how long | Low while that holds |
| 2 | Raw IP addresses and user agents are kept without limit | None | Truncate or drop at write; delete after 90 days (card bp26-retention-enforce covers the decision) | Medium |
| 3 | A non-essential cookie is set without consent | The cookie holds only the arm number | Replace with a hash bucket or consent (BP26-NO-TRACKING-1, code task on qnfo-ipatent/worker.js) | Low once changed |
| 4 | Users are not told they are talking to an AI | Disclosure on the first screen (3.19.0); the limits list says so too | None needed beyond keeping it | Low |
| 5 | A user cannot ask for access or deletion of their disclosure | Submissions have an id and a status | A contact route and a delete-by-id on the page | Medium |
| 6 | The draft is wrong or misleading and the user relies on it | The page states the limits | Keep the limits text; no claim of legal advice | Low |
| 7 | Inventor e-mail and name stored for 730 days or more | Only 5 of 68 submissions carry an address | Periods in docs/RETENTION.md; the owner decides | Low |

## 5. Open questions

1. Confirm that no ipatent model call may ever reach a provider API outside Cloudflare (today every call is a Workers AI binding call; a check on each model change keeps it so).
2. Should raw IP addresses be dropped at write, or truncated?
3. Which retention periods the owner adopts, and whether a user may ask to keep a draft longer.
4. Whether the tool needs a privacy notice of its own beyond the one the gateway serves.

## 6. Decision and review

Decision: pending the owner. Risks 2, 3 and 5 have proposed fixes that need code changes in qnfo-ipatent (a code task) and the owner's retention decision. Next review 2027-10-26.
