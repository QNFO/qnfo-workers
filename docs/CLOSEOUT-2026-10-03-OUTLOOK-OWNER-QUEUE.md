# Closeout 2026-10-03: Outlook.com mail via Microsoft Graph, and the owner queue from MCP clients

Charter pillars: `personal` (mail), `autonomy` (owner queue). Session record: `qnfo-audit.session_records`
`cc-session_01HHgSsYx9ydu62gcwXoTxEx`. Issues: `agent_issues` 1896-1899. Owner card: `human_actions` slug `outlook-graph-entra-app`.

## What is live (verified on /health after the canonical deploy)
- `personal-api` 4.5.0-msgraph-mail (PR 563): reads consumer Outlook.com mailboxes (Graph, `/consumers`, PKCE, `Mail.Read` +
  `offline_access` only) into `personal-life.email_index` from the existing 05:05 cron. Inert until `MS_CLIENT_ID` and
  `MS_CLIENT_SECRET` exist (`/health` -> `microsoft_mail: no-client`). Source and tests: `personal-api/msgraph/`.
- `qnfo-tools-mcp` 1.2.0-owner-queue (PR 560): MCP tools `owner_queue` (read), `owner_code`, `owner_act` (write scope). They call
  the dashboard's public `/api/human`, `/api/cmd/code`, `/api/cmd/verify`, `/api/cmd/run`; the emailed code stays the only
  gate; the code is redacted from `mcp_log`.
- Gate-bypass closed: mail that is a one-time code (including the dashboard's own `Fleet code NNNNNN`) is never indexed
  (MSGRAPH-NO-CODES-1), otherwise any agent able to read `email_index` could read the emailed code.

## Not done, and why
- The Microsoft app registration and the two Worker secrets. They need the owner's Microsoft sign-in (the secret value is
  shown once). No browser or device was connected to the session.
- Nothing was tested against real Microsoft; the owner tools were never called live (no MCP token in the session).

## Runbook for the next agent (do these in order; each has a probe)
1. Owner step (human, only if still open): `human_actions` slug `outlook-graph-entra-app`.
   Probe: `GET https://personal-api.q08.workers.dev/health` shows `microsoft_mail` other than `no-client`.
   An agent with a connected, signed-in browser may do the Entra registration for the owner: entra.microsoft.com ->
   App registrations -> New registration -> "Personal Microsoft accounts only" -> Web redirect
   `https://personal-api.q08.workers.dev/microsoft/callback` -> API permissions: Microsoft Graph, Delegated, `Mail.Read` and
   `offline_access` only -> Certificates & secrets -> New client secret. Never type a password; the owner signs in.
2. Set secrets (take the lease first, CLAUDE.md "Shared secrets"): `POST https://qnfo-deploy-guard.q08.workers.dev/secret-lock/acquire
   {"worker":"personal-api","owner":"<session>","ttl_sec":300}`, then `wrangler secret put MS_CLIENT_ID --name personal-api` and
   `... MS_CLIENT_SECRET ...`, release the lease, then re-probe `/health` (secret writes count only after a re-probe).
3. Connect: open `https://personal-api.q08.workers.dev/microsoft/connect`, enter the personal API key, sign in as
   `rwnquni@outlook.com`, then `rowan.quni@outlook.com`. Connect ONE mailbox first (Microsoft may restrict consumer apps).
4. Backfill: `POST /microsoft/sync` (bearer personal API key) until the response shows `"more": false`.
5. Verify (the definition of done for agent_issues 1897): `/health` `microsoft_mail` = connected; D1 `personal-life`:
   `SELECT store, COUNT(*), MAX(received_at) FROM email_index WHERE message_id LIKE 'msgraph:%' GROUP BY store` shows both
   stores with rows newer than 2026-08-28; `SELECT error FROM ms_sync_runs ORDER BY id DESC LIMIT 2` is NULL; no row with a
   one-time code subject exists. Then close 1897 with that output in `issue_triage.close_evidence`, resolve the card.
6. First live use of the owner tools (agent_issues 1899): an MCP client with the write token calls `owner_queue`, `owner_code`,
   (owner reads the code in rwnquni@outlook.com), `owner_act`. Check `qnfo-audit.mcp_log` for `tool='owner_act'` with
   `[redacted]` in args and no 6-digit code in args or result.

## Open issues for the improvement loops
- 1896 dashboard renders `sev='high'` as normal (code-task on `qnfo-fleet-dashboard/worker.js`; claimed by another session when
  this was written, so left to the code loop).
- 1898 Gmail is only the August snapshot: add a Gmail read-only scope to the Google flow in `personal-api`
  (`handleGoogle`) and a second writer to `email_index` using the `msUpsertStmt` / watermark / no-codes pattern. Needs owner
  re-consent for the new scope (file a `human_actions` card with that PR; no claude.ai text in the card).
- 1899 verification gaps (this PR adds the msgraph suite to deploy-gate; remaining: live owner-tool use, 8 expired 2025
  verification-code rows in `email_index`, `personal-life-workers` README pointing at `qnfo-workers/personal-api`).

## Failure modes to keep in mind
- Client secret expiry (24 months at most) fails every sync with `invalid_client`; a 90-day gap in use expires the refresh token.
- The owner must type the code to the client each time; there is no stored dashboard session by design.
- `personal-life-workers` deploy secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) are still empty; do not deploy from
  there. The canonical path is merge to `qnfo-workers` main.
