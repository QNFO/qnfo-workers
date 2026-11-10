# Ultrastable: the self-governing development platform QNFO runs on

Status: proposed 2026-11-10 (owner question: "what is this actual product called that we might be able to sell ... and how do we spin that off so QNFO and the Quniverse are powered by this product?"). Code that holds this design: `product/boundary.json` and `scripts/product_boundary.mjs` (ULTRASTABLE-BOUNDARY-1); owner questions and owner-only steps: `migrations/2026-11-10-ultrastable-product.sql`; live claim probes: `migrations/2026-11-10-ultrastable-claims.sql`. Personal-brand wording: `rwnq8/resume` `docs/BRAND.md` section 9.

Directed by Rowan Brad Quni-Gudzinas, systems researcher studying autonomous AI systems ([rwnq8.github.io](https://rwnq8.github.io/)). The credit, the name and the home page live in `qnfo-audit.product_profile` (ULTRASTABLE-CREATOR-LINK-1, `migrations/2026-11-10-ultrastable-profile.sql`): [qnfo.org/platform](https://qnfo.org/platform) renders them with a schema.org `SoftwareApplication` whose creator is Rowan, and answers on fleet.qnfo.org/focus (`product-name`, `product-design-credit`, `product-home`, `product-github`, `product-credit-public`) update the rows at once. Rowan's site, GitHub profile and CV link back to qnfo.org/platform.

## 1. What the product is

Ultrastable is the control loop that sits around coding agents and runs a software system as a self-governing whole. It finds its own work in the system's metrics and failures, hands each task to whichever agent fits (an open model on its own code loop, GitHub Copilot, a Claude Code session), proves every change live with declared probes and an automatic revert, and keeps ledgers a person can audit: every issue accounted for, every decision with a prediction that is later scored, every failure mode with a detector, and a trust score per kind of action that widens or narrows what the loop may do on its own.

One line: **Vibe coding writes the code you ask for. Ultrastable decides what to build next, ships it, proves it live, and keeps score of how often it was right.**

Category: **self-governing development platform** (a kind of autonomous development platform). The name comes from W. Ross Ashby's ultrastable system (Design for a Brain, 1952): a machine that changes its own settings when an essential variable leaves its limits, so it stays viable without an operator. That is what the doctrine amendment, trust ledger and probe-and-revert loops do.

## 2. Where it sits in the market (read 2026-11-10)

| Approach | Who chooses the work | Who checks it | Examples |
|:--|:--|:--|:--|
| Vibe coding | a person, prompt by prompt | the person, if at all | chat-to-app builders (term from Karpathy, 2025) |
| Agentic engineering | a person; the agent multiplies effort | the person reviews | Cursor, Windsurf, Claude Code, Codex CLI |
| Cloud coding agents | a person assigns a task | CI and a reviewer | Devin, Codex cloud, GitHub Copilot coding agent |
| SDLC orchestration | events and workflows | CI and a reviewer | Overcut, Factory |
| Self-driving production | incidents | the agent, for remediation | Traversal |
| **Self-governing development (Ultrastable)** | **the system, from its own metrics, failures and roadmap** | **declared live probes, canary revert, a two-family review gate, and scored predictions** | QNFO fleet (customer zero) |

Context: Anthropic reported in November 2026 that its models author more than 80% of the code merged into its own codebase, that full autonomous self-improvement has not been reached, and that human control gets harder as it approaches (AI Lounge, 2026-11-03, citing the Anthropic Institute). The open question across the field is oversight of software that steers itself. Ultrastable is a working answer that can be inspected: its decisions, predictions, failures and trust are tables, not claims. Surveys of self-evolving coding agents (Zhou et al., arXiv 2608.03392) list reversibility, feedback reliability and evaluation beyond short benchmarks as open problems; those are the three things the platform records.

## 3. Differentiators, with evidence (measured 2026-11-10)

The system must work the way this page says it does (owner, 2026-11-10). Every claim below that can be read from the fleet's records has a probe in `qnfo-audit.product_claims` (ULTRASTABLE-CLAIMS-1). [qnfo.org/platform](https://qnfo.org/platform) runs the probes live; the `claim-ultrastable-*` remediation contracts run them hourly and escalate a failure like any failure mode. `scripts/product-boundary.test.mjs` fails if the claim ids in `product/boundary.json` and the probe rows drift apart. A claim that stops passing is fixed or removed from this page.

1. **It originates its own work.** Metrics breach, a trigger files an issue with a `code-task:` line, the code loop opens and merges the pull request. 6,604 issues have passed through the ledger (`qnfo-audit.agent_issues`); 624 merged pull requests in QNFO/qnfo-workers were opened by the code loop (titles `code-task:`).
2. **It uses any coding agent as an executor.** The code loop runs on open models through Cloudflare Workers AI; GitHub Copilot merged 416 pull requests; interactive sessions the rest, all coordinated through one work-claim ledger (`qnfo-deploy-guard`). 3,880 merged pull requests since the repository opened on 2026-08-10, 1,245 of them in the last seven days.
3. **Every deploy proves itself.** Workers declare probes (`<worker>/probes.json`); a probe that passed before and fails after reverts the push (`scripts/canary_revert.py`); risky diffs are read by two model families (`scripts/review_gate.py`).
4. **It measures its own judgment.** 1,056 decision outcomes scored against the prediction logged before the decision; 771 matched (73%) (`decision_outcomes`).
5. **It governs itself in code, not in a prompt.** The written doctrine is enforced by D1 triggers and CI guards. 634 failure modes with detectors (`failure_modes`), 388 recorded red-teams of claimed blockers (`blocker_redteam`), 2,176 logged decisions (`decision_log`), 7,590 recorded tick steps (`tick_runs`), trust scored per surface and action class (`trust_ledger`), doctrine amendments proposed from its own output (`doctrine_proposals`).
6. **It runs without a laptop or a chat.** 39 live Cloudflare Workers; state in D1, R2 and KV; a session builds it and is never part of it.

## 4. Honest gaps

- One installation and one customer. Nothing is packaged; there is no installer and no second tenant.
- The core is entangled with QNFO's applications: one D1 database, and the kernel (`qnfo-fleet-control`, 1.4 MB) carries research-specific steps.
- 563 issues are open against a target of 0; the 120-minute SLA is not met.
- The 73% prediction match rate is scored by the system itself; there is no external benchmark or audit yet.
- The policy text is long and written as owner directives; a buyer needs a short default policy.
- Development used interactive AI sessions heavily; the runtime does not depend on them, but the build did.

## 5. Who buys it

First buyers: small engineering teams that run many services and want agents to keep them healthy without a person choosing every task; and teams that must show auditors what their coding agents did and why (the ledgers are the evidence). Research groups running autonomous pipelines are a third segment. The owner's answer to the buyer question on fleet.qnfo.org/focus sets the first segment.

## 6. Spin-off plan (QNFO is customer zero)

Phases live in `product/boundary.json` (`phases`) and as ROADMAP-1 issues filed by the migration above.

- **P0 (done in this change):** every live worker is classified core, app or personal; the check fails when one is not.
- **P1:** a short default policy pack, extracted from CLAUDE.md and the doctrine; QNFO's owner directives become an overlay.
- **P2:** core tables move to their own D1 database; QNFO tables stay in qnfo-audit.
- **P3:** tenant settings (account, repository, hosts, model ladder, owner contact) come from configuration.
- **P4:** a second installation on a repository outside qnfo-workers proves the core runs without QNFO's applications.

Owner-only steps (domain, trademark clearance, GitHub organisation, incorporation) are owner cards with an IDENTITY-BOUND line; until they are done the product stays inside QNFO under its working name.

## 7. Name check (2026-11-10, partial)

Ultrastable: no software trademark found in a web search; the .ai and .dev hosts answer (likely registered); the GitHub name was not checkable from the session. Homeostat (the alternative): a GitHub user of that name exists. A formal USPTO knockout search and the domain purchase are the owner's card.
