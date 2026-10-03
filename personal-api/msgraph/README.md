# Outlook.com mail in the twin (Microsoft Graph, read-only)

`personal-api` 4.5.0-msgraph-mail reads consumer Outlook.com mailboxes through Microsoft Graph and writes them into
`email_index` (personal-life D1), the table the daily brief, the `email_search` tool, chat retrieval and the MCP
endpoint already read. No new worker, no new cron, no model call.

## What was wrong

`email_index` was filled once, on 2026-08-29, by a client outside the fleet (three stores in about 30 seconds), through
`personal-life-search` `POST /ingest`. Nothing has written it since: the newest row is 2026-08-27. No worker held a
Microsoft credential (fleet audit `integration_state`, 2026-09-28: no `MS_`/`AZURE_` secret).

## One-time setup (owner only, about 10 minutes)

1. Microsoft Entra admin center (entra.microsoft.com) -> App registrations -> New registration.
   - Supported account types: **Personal Microsoft accounts only** (or the "any organizational directory and personal
     Microsoft accounts" option; the worker uses the `/consumers` authority either way).
   - Redirect URI: platform **Web**, `https://<personal-api origin>/microsoft/callback`.
   - If the portal says your account has no directory, create the free default one; no Azure subscription is needed.
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
- Not covered: Outlook calendar, sending mail, Gmail (Gmail still has only the 2026-08-29 snapshot; adding Gmail means
  adding a Gmail scope to the Google flow and a second writer into the same `email_index`, using the helper pattern here).

## Build and test

```
# source of the patch (apply_patch.py, live 4.4.0 backup) lives in QNFO/personal-life-workers PR 3
node --test personal-api/msgraph/msgraph.test.mjs    # 16 tests against the patched bundle
```

The tests load the patched bundle itself and drive `worker.fetch` / `worker.scheduled` over a real SQLite database with
a mocked Microsoft login and Graph. They do **not** prove behaviour against the real Microsoft service: the first live
connect of one mailbox is the real test.
