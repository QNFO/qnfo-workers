# Outlook.com mail in the twin (Microsoft Graph, read-only)

`personal-api` 4.5.0-msgraph-mail reads consumer Outlook.com mailboxes through Microsoft Graph and writes them into
`email_index` (personal-life D1), the table the daily brief, the `email_search` tool, chat retrieval and the MCP
endpoint already read. No new worker, no new cron, no model call.

## What was wrong

`email_index` was filled once, on 2026-08-29, by a client outside the fleet (three stores in about 30 seconds), through
`personal-life-search` `POST /ingest`. Nothing has written it since: the newest row is 2026-08-27. No worker held a
Microsoft credential (fleet audit `integration_state`, 2026-09-28: no `MS_`/`AZURE_` secret).

## One-time setup (owner only, about 10 minutes)

0. **A real Microsoft Entra directory is required first** (checked live 2026-10-04, agent_issues #1897). Both mailboxes
   are personal Microsoft accounts without a directory. entra.microsoft.com fails for them with AADSTS16000; the working
   entry point, portal.azure.com -> Microsoft Entra ID -> App registrations -> New registration, now says "The ability to
   create applications outside of a directory has been deprecated. You may get a new directory by joining the M365
   Developer Program or signing up for Azure." So the owner first gets a directory: the free Microsoft 365 Developer
   Program, or an Azure free account (phone and card identity check). Both need the owner's own identity; no session can
   do it. The older advice "create the free default directory" no longer works.
1. portal.azure.com -> Microsoft Entra ID -> App registrations -> New registration (inside that directory).
   - Supported account types: **Personal Microsoft accounts only** (or the "any organizational directory and personal
     Microsoft accounts" option; the worker uses the `/consumers` authority either way).
   - Redirect URI: platform **Web**, `https://<personal-api origin>/microsoft/callback` (both
     `https://personal-api.q08.workers.dev/microsoft/callback` and `https://personal.qnfo.org/microsoft/callback`).
2. API permissions -> Add -> Microsoft Graph -> **Delegated**: `Mail.Read`, `offline_access` (openid, email, profile and
   `User.Read` are already there). Do not add any `ReadWrite`, `Send` or `Delete` permission.
3. Certificates & secrets -> New client secret. Copy the **Value** now; it is shown once. Put a calendar reminder at its
   expiry (at most 24 months): when it expires every sync fails with `invalid_client` until it is replaced.
4. Set the Worker secrets (never in the repo):
   `wrangler secret put MS_CLIENT_ID --name personal-api` and `wrangler secret put MS_CLIENT_SECRET --name personal-api`.
5. Deploy is the canonical path (merge to main; canonical-deploy.yml -> qnfo-ops /ops/deploy), then open `https://<origin>/microsoft/connect`,
   enter the personal API key, and sign in as **rwnquni@outlook.com**. Repeat for **rowan.quni@outlook.com**. The
   account picker is forced, so the second mailbox is a normal second sign-in.
6. Backfill: `POST /microsoft/sync` (bearer key), repeat while a response shows `"more": true`. The first sync reaches
   back `MS_BACKFILL_DAYS` (default 120).

## Operating

| Thing | Where |
| --- | --- |
| Status, recent runs, last error per mailbox | `GET /microsoft/status` (bearer key), MCP tool `mail_accounts`, `/health` -> `microsoft_mail` |
| Sync now | `POST /microsoft/sync[?account=..&pages=..]`, MCP tool `email_sync` |
| Daily sync | existing 05:05 cron, before the brief is built; a failure never blocks the brief |
| Disconnect | `POST /microsoft/disconnect?account=..` (mail already indexed is kept; revoke the grant at account.live.com/consent/Manage) |
| Semantic search over new mail | off by default (`MSGRAPH_EMBED=1` turns it on; costs embedding calls, and the AI spend cap is breached) |
| Accounts accepted | `MS_ALLOWED_EMAILS` (comma list) else the first `MS_MAX_ACCOUNTS` (default 2) to finish the key-gated connect |

Any MCP client (DeepChat, Chatbox, Claude Code) gets `email_sync`, `mail_accounts` and an `email_search` that now
reports which mailbox (`store`) a message came from.

## Design notes and known limits

- Read-only: the only scope that reads mail is `Mail.Read`. Tokens are stored in D1 table `ms_oauth` (same trust level
  as the existing `google_oauth`); `mail_accounts` and `/microsoft/status` never return them.
- Sync is oldest-first from a per-mailbox watermark (minus one minute of overlap), so the page cap (8 pages of 50 per
  run) never skips messages; the backlog drains over successive runs. A message whose id the one-off import already
  holds is matched on store + subject + received second and not duplicated.
- Refresh tokens rotate and are stored on every refresh. Microsoft expires a consumer refresh token after 90 days
  without use; the daily cron keeps it alive, but a 90-day outage means reconnecting.
- One-time codes are never indexed (MSGRAPH-NO-CODES-1): mail whose subject is a verification/security/sign-in/one-time code, or that carries the fleet's own `Fleet code` mail, is skipped (counted as `skipped` in the sync response). The owner's emailed dashboard code would otherwise be readable by any tool that reads `email_index`, which would make that gate a formality. Rows loaded by the 2026-08-29 import are not filtered.
- Mail previews (first 280 characters of the body) are stored in `email_index.summary`, as the existing rows already do.
- Not covered: Outlook calendar, sending mail, Gmail. Gmail keeps only the 2026-08-29 snapshot: a Gmail writer would need
  the Google Cloud OAuth client the owner declined on 2026-10-04 (human_actions gcal-1-link-google-calendar, "too many
  manual steps"). Gmail and Outlook mail reach the fleet only when forwarded to rowan.quni@qnfo.org (human_actions
  personal-booking-forward-rule); qnfo-email 2.4.0+ copies qnfo.org mail into `email_index` as store `qnfo.org` on its
  07:00 cron (EMAIL-INDEX-WRITER-1).
- qnfo-email `RETIRED_STORES` (2.4.0) stops freshness alerts for the stores `gmail`, `rowan.quni@outlook.com` and
  `rwnquni@outlook.com`. When the Microsoft app exists and the sync runs, remove the two Outlook stores from that list so
  a stalled Graph sync is reported again.

## Build and test

```
# personal-api/worker.js in this repository is the source and the deployed bundle (canonical deploy, see ../README-deploy.md)
node --test personal-api/msgraph/msgraph.test.mjs    # 16 tests against the patched bundle
```

The tests load the patched bundle itself and drive `worker.fetch` / `worker.scheduled` over a real SQLite database with
a mocked Microsoft login and Graph. They do **not** prove behaviour against the real Microsoft service: the first live
connect of one mailbox is the real test.
