# DPIA — the server-side e-mail agent (qnfo-email, qnfo-email-orchestrator) — DRAFT for owner review

Status: **DRAFT, 2026-10-26** (BP26-DPIA-1, agent_issues 1000343). Written by an automated fleet session from the code and the databases. **Not legal advice**; no conclusion below is a statement that the processing complies with the GDPR. The owner, as controller, decides whether to continue, to change the processing, or to ask an adviser or the Autoriteit Persoonsgegevens (AP). Review every year (next: 2027-10-26) and whenever the agent gains a new capability. Related: docs/ROPA.md rows R4 to R8, issue BP26-PROMPT-INJECTION-1 (1000359), BP26-RETENTION-1 (1000344).

## 1. The processing

What it is. Mail to any QNFO or owner address reaches the worker qnfo-email (Cloudflare Email Routing). It stores the parsed message (`emails`: sender, recipient, subject, text up to 10,000 characters, HTML up to 20,000, headers) and the raw message up to 200,000 characters (`email_raw_archive`), classifies it, and for a message from a person it queues a reply decision (`email_reply_queue`). The orchestrator and the voice drafter write a reply in the owner's voice with Workers AI models (`@cf/zai-org/glm-5.3-flash` writes, `@cf/openai/gpt-oss-120b` edits, `@cf/moonshotai/kimi-k2.6` in the orchestrator) and send it from the owner's address through the Cloudflare e-mail binding. Three tiers decide what happens: tier 1 no reply (machine-written mass mail and anything uncertain), tier 2 auto-send (a known or plainly human correspondent asking a factual or logistical question the thread answers), tier 3 the owner sends (signed statements, references, contracts, money, legal and press matters). Mail from the owner can carry commands that the fleet runs (`email_commands`; action commands need a token in the text). Correspondent records are kept in `contact_ledger` (242 rows on 2026-10-26).

Scale. 944 messages from 2026-08-03 to 2026-10-26 (about 11 a day), 242 correspondents. Data subjects: people who write to the owner (researchers, journal and conference senders, vendors, some private persons) and the people their messages name.

Purposes. Triage the owner's mail, answer simple questions without the owner, raise a notice when a person is waiting, keep an audit trail.

## 2. Screening

AP list of processing that always needs a DPIA and the nine EDPB (WP248) criteria. A processing that meets two criteria generally needs one; this meets three, so the DPIA is done.

| EDPB criterion | Applies | Why |
|---|---|---|
| 1 Evaluation or scoring | Yes, partly | A human score and a tier decide whether a sender gets an answer; a machine-written detector classifies senders |
| 2 Automated decision with legal or similar effect | No | Tier 2 answers only factual or logistical questions; commitments go to the owner (tier 3) |
| 3 Systematic monitoring | No | |
| 4 Sensitive or highly personal data | Incidental | Senders may write about health, immigration, grants or courts; tier 3 exists for these |
| 5 Large scale | No | About 11 messages a day, 242 correspondents |
| 6 Matching or combining datasets | Yes | Mail is matched with the contact ledger, calendar invites, and booking mail is written into the personal plane (ITINERARY-INGEST-1) |
| 7 Vulnerable data subjects | Not known | |
| 8 Innovative technology | Yes | Language models classify mail and write replies in the owner's voice; inbound text is untrusted input to a model |
| 9 Prevents exercising a right | No, but see risk 6 | |

The AP list (2019) has no item that clearly covers a single person's mailbox at this size; the owner or an adviser should confirm that reading.

## 3. Necessity and proportionality

The aim (answer mail the owner would answer in one line, and never miss a person who is waiting) can be met with less: bodies kept 30 days instead of indefinitely, replies only to the sender, no copy of the raw message once parsed. The proposals below move the design that way. The processing of third parties' messages rests on the owner's legitimate interest in handling their own correspondence (proposed, not yet written as a balancing test) and, for a purely personal mailbox, possibly on the household exemption; both are the owner's call (docs/ROPA.md, open questions 3 and 4).

## 4. Risks to data subjects

| # | Risk | Existing measures (found in code) | Proposed measures | Residual |
|---|---|---|---|---|
| 1 | Third parties' messages are kept without limit: 683 bodies, 5 raw messages and 105 quarantine bodies are older than the proposed 30 days; no sweep exists | Retention registry and counting (`retention_policy`, `records_past_retention`) | Owner decides the periods and the sweep (card bp26-retention-enforce); raw message dropped after parsing unless needed | High until decided |
| 2 | **Prompt injection**: anyone can mail the agent instructions; a message can try to make the model leak other correspondents' data, forward mail, or send as the owner | Commands only from owner addresses and with a token for actions; tier 3 for commitments; the sender-reputation and approval gate; tier 1 for anything uncertain | Reader/actor split (a tool-less model extracts fields, a separate actor receives only those); replies only to the original sender; egress allow-list; block markdown and image exfiltration; red-team suite on every prompt or model change (BP26-PROMPT-INJECTION-1) | Medium until the suite exists and passes |
| 3 | Replies read as written by the owner; the style guide forbids "As an AI"; people may not know a model wrote to them (Art. 50(1) and honesty) | Tier 3 for anything weighty | Owner decision on a one-line notice (card bp26-email-agent-ai-disclosure); privacy notice linked from the signature | Medium until decided |
| 4 | A reply states something untrue | The style guide forbids any date, number, person, paper or claim the mail or the guide does not contain | Eval set with seeded false claims (BP26-EVALS-1) | Low to medium |
| 5 | Mail text reaches a third-party model provider, or is stored by AI Gateway | The reply path calls Workers AI models (Cloudflare) through the `env.AI.run` binding and names no gateway in qnfo-email or qnfo-email-orchestrator (read 2026-10-26), so AI Gateway, whose `default` gateway logs payloads and caches responses for about 30 days, does not store those prompts. The owner-command path uses the qnfo-ops model job (`ops-exec`), whose upstream providers are listed in docs/AI-GATEWAY-UNIFIED-BILLING.md | Verify and record that no third-party provider API receives third-party mail text through the owner-command path; keep the reply path off the gateway or set `collectLog: false` if it is ever routed through it | Low for replies; unknown for owner commands until verified |
| 6 | A correspondent cannot learn what is held or ask for erasure | None found | A privacy notice and a contact route linked from every reply; a documented process for access and erasure requests | Medium |
| 7 | Mail content or addresses leak through logs and tool logs | Logs record counts and ids in most places | Hash addresses in logs; the `pii_in_logs` measure (57 to 68 matches in the 2026-10-26 samples, all crawler `From` headers); 90-day period for `mcp_log` | Low to medium |
| 8 | Booking mail from the owner's inbox is written into the personal plane | A parser reads only booking-company domains and owner addresses whose DMARC verdict passes | Keep the rule; record it as a plane crossing in the ROPA | Low |

## 5. Open questions

1. Is the owner's mailbox processing "purely personal" at all, given that the agent answers people in the owner's name for research work?
2. Which of the proposed periods the owner adopts (docs/RETENTION.md), and whether raw messages are kept.
3. Whether replies carry an AI notice, and the wording.
4. Whether the AP should be consulted (Art. 36) if risks 1 and 2 stay high after the measures; the fleet cannot judge this.

## 6. Decision and review

Decision: pending the owner. Until then the processing continues as it is, and risks 1, 2 and 3 are open with owners: retention (card bp26-retention-enforce), prompt injection (issue 1000359, the code loop and the email owner loop), disclosure (card bp26-email-agent-ai-disclosure). Next review 2027-10-26, or on any new capability of the agent.
