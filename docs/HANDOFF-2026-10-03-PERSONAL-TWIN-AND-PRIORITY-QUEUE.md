# Handoff 2026-10-03: personal twin + priority queue (session_0166enPmfw7U4JuwhPciSCSG)

For the next agentic session. Every item below is also an open `qnfo-audit.agent_issues` row in `v_issue_queue`;
this file says exactly how to finish each one. Read `CLAUDE.md` first and follow it (claims, VERSION bump, mirror,
canonical deploy, rule 8 budget limits, no claude.ai links).

## Fixed IDs

| Thing | Value |
|---|---|
| Twin worker | `personal-api` (`personal-api.q08.workers.dev`, also `personal.qnfo.org`) |
| Personal D1 | `personal-life` `e8d6c61a-10b7-4086-b81e-9e6e85afa407` |
| Audit D1 | `qnfo-audit` `35e2e573-92f3-46ac-83c6-22f6429fc5e5` |
| Master queue | `SELECT * FROM v_issue_queue ORDER BY pos` (qnfo-audit) |
| Contracts (self-closing probes) | `remediation_contracts` classes `TWIN-VISION-TOOLLEAK-1`, `GCAL-CONNECTED-1`, `TWIN-MCP-OAUTH-1`, `PREDICT-WEEK-1` (transport `d1-query@personal-life`, run by scripts/remediation_consumer.py; observed NULL means "still waiting", never a fail) |
| Session record | `qnfo-audit.session_records` session_id `session_0166enPmfw7U4JuwhPciSCSG` |

## What this thread shipped (do not redo)

- personal-api 4.2.0 to 4.5.1: vision routing (glm-5.3-flash, kimi-k2.6), tool-syntax leak guard (`finalizeText`),
  Google Calendar read/write (`/google/*`, owner-locked OAuth), MCP endpoint `/mcp` (bearer key or OAuth 2.1 with PKCE and
  dynamic registration), playground script fix, static fleet link, predictWeek timeout (4.5.1). PRs 481, 486, 506, 519 and
  the closeout PR that adds this file.
- PRIORITY-QUEUE-1 (owner directive 2026-10-03): `v_issue_queue`, due-on-arrival triage, SLA views untriaged-only,
  qnfo-code-orchestrator 0.3.15, qnfo-backlog-exec 2.0.5, qnfo-autonomy-scorer 1.2.1 (PR 569), CLAUDE.md rule (PR 573),
  qnfo-fleet-control 0.4.111 (closeout PR). Issue 1917 closed with evidence.

## Remaining items, in queue order

### 1. Verify the closeout PR live, then close #1912 and #1913
- `curl -s https://qnfo-fleet-control.q08.workers.dev/health` must report `0.4.111-priority-queue` (or later);
  `curl -s https://personal-api.q08.workers.dev/health` must report `4.5.1-predict-timeout` (or later).
- Evidence for #1912: the deployed source (Cloudflare worker code for qnfo-fleet-control) contains
  `a.priority IN ('critical','high','medium','low')`. For #1913: it contains
  `ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, id LIMIT 12`.
- Close each: first `INSERT ... INTO issue_triage (... close_evidence) ... ON CONFLICT DO UPDATE` with that evidence and the
  live version, then `UPDATE agent_issues SET status='closed'`. A trigger refuses a close without evidence; write it first.
- The code-loop tasks for these issues (ct_yz7j0ejlbut6h0, ct_emew6ggpmot77d) were closed as superseded: their branches
  were cut before 0.4.110 and carried a VERSION that was not ahead. Do not reopen them.

### 2. #1908 PREDICT-WEEK-TIMEOUT-1 (closes by itself, check it did)
- After the next personal-api cron (05:05 UTC daily), contract `PREDICT-WEEK-1` should pass. Check in personal-life:
  `SELECT ts, predictions, predictions_reason, version FROM brief_cron_runs ORDER BY ts DESC LIMIT 2`.
- If `predictions > 0`: the remediation consumer closes #1908; confirm `agent_issues.status`.
- If still 0, read `predictions_reason`:
  - `timeout` again: the 90 s budget is not enough. Next lever: in `predictWeek`, pass `useBriefModels=false` so CHAT_MODELS
    (deepseek-v4-pro first, non-reasoning output) answer instead. One change, bump VERSION, re-measure next cron.
  - `no predictions object in N chars`: the model answered but not as JSON; log the first 300 chars to `brief_cron_runs`
    and tighten the system prompt. Do not raise max tokens above 4000.
- Rule 7: one change per day on this path, so each cron measures one lever.

### 3. #1805 TWIN-VISION-1 + TOOL-LEAK-1 (needs one real image; owner)
- Blocker: no chat traffic since 2026-09-30 and the probe needs at least one image turn after 2026-10-02T09:20Z. Only the owner
  (or a client holding the personal API key) can send it; secrets are not readable by sessions.
- Agent work: none until traffic exists. Then run the contract probe (in the remediation_contracts row). If it reports
  `regressed`, read the offending `chat` rows (`role='assistant'`, `ts >= '2026-10-02T09:20:00Z'`), fix in personal-api, and
  add the exact string as a test case. Do NOT add a scheduled self-test image call: rule 8 forbids a new paid model call
  while `fleet_budget` caps are breached.

### 4. #1816 GCAL-1 Google Calendar (owner step, then agent verification)
- Owner card: `human_actions` slug `gcal-1-link-google-calendar` (on fleet.qnfo.org). The owner creates a Google OAuth client
  (Web application; redirect URIs `https://personal-api.q08.workers.dev/google/callback` and
  `https://personal.qnfo.org/google/callback`; consent screen In production), sets secrets `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` on personal-api, opens `/google/connect` and approves.
- Agent verification afterwards: `/health` field `google_calendar` must read `connected`; personal-life
  `SELECT email, last_error FROM google_oauth WHERE id='owner'` must have no `last_error`. The contract then closes #1816.
- If `refresh-error`: the consent screen is probably still in Testing (7-day refresh tokens). Put that diagnosis on the owner
  card; do not rotate secrets without the #1701 secret lease.

### 5. #1817 TWIN-MCP-OAUTH-1 (closes on first real client)
- Live and probed (discovery, 401 with `resource_metadata`, DCR refuses non-https). Closes when personal-life
  `oauth_tokens` holds an access token, i.e. after the owner approves the first connector on the consent page.
- Do not register a test client in production: it writes rows into the owner's personal database.

### 6. #1818 TWIN-FRONTIER-MODEL-1 (code; one lever available now)
- Frontier-model routing stays blocked while `unified_cost_usd_30d` > 150 (rule 8). Do not add a paid route.
- Lever (b), allowed now: replace the twin's prompt-level JSON tool protocol with native function calling.
  - In `personal-api/worker.js`, `upstreamChat` accepts an optional `tools` array (built from `TOOLS` via the same mapping
    `mcpToolList()` already uses) and passes `tools` + `tool_choice: "auto"` to `env.AI.run` for models that support it
    (kimi-k2.6 and glm-5.3 list function calling in the Workers AI catalog; check each model page, including glm-5.3-flash
    and deepseek-v4-pro-0813, before enabling `tools` for it, and keep the JSON protocol for any model that does not).
  - In the chat tool loop (search `for (let round = 0; round < 4; round++)`), read `choices[0].message.tool_calls` first;
    keep `parseToolCall` as the fallback; keep `finalizeText` on every exit.
  - Tests: extend the harness pattern used for 4.3/4.4 (a fake `env.AI.run` returning `tool_calls`), plus the leaked
    strings from issue #1805's description, which must never reach the user.
  - Precondition (rule 7): wait until #1908 is measured, since both touch `upstreamChat`.

### 7. #1683 AI spend (owner card)
- Owner card `desktop-client-route-qnfo-ai`: the desktop client (user agent `node`, BYOK DeepSeek, 248 calls with p50 93k
  input tokens on 2026-10-01) must use `https://qnfo-ai.q08.workers.dev/v1`, model `qnfo`. A session must not type keys into a
  client. Agent check afterwards: `cf-ops-actions.yml` action `gateway-logs` with model `deepseek-v4-pro`; the untagged
  `node` bucket should fall toward 0.

### 8. Housekeeping (automatic, verify only)
- Four merged branches `claude/twin-*` remain on GitHub (this session's proxy refused deletes). qnfo-fleet-control
  BRANCH-HYGIENE-1 (0.4.110+) deletes merged branches hourly; verify `git ls-remote origin 'refs/heads/claude/twin-*'` is empty
  after a few hours. Do not delete them by hand if the loop has not run yet.
- Guard `remediation_latest_pass_pct_7d` carries two early fail rows from this thread (issues 1805, 1816, written before probes
  returned NULL while waiting). They age out on 2026-10-09. Never delete verification rows.
- qnfo-autonomy-scorer 1.2.1 changed the OODA decide stage to "open issues with a next action" (41/90 on 2026-10-03). The drop
  on its next run is the real backlog gap, not a regression.

## Done criteria for the whole handoff
All of #1805, #1816, #1817, #1818, #1908, #1912, #1913 closed with `issue_triage.close_evidence`; #1683 owned by the cost
loop. Append one line per closure to the session record's `handoff_notes` above, or write your own session record.
