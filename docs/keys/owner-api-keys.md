# Owner API keys: which exist, where they live, how they are issued

Charter pillar: security. Owner task op-mut2f2b48ad5 (agent_issues 1933) and owner notes 1932, 1934.
Written 2026-10-05 from the code on main and live probes made that day. **No secret value appears here, and none may be
added**: this repository and its Actions logs are public.

## First rule: reading needs no key (OPEN-ACCESS-1)

Everything that only reads is open to everyone, with no token, key or login: https://fleet.qnfo.org and its JSON
(`/api/human`, `/api/decision`, `/api/state`, `/api/watchmaker`), https://ask.qwav.tech, https://ideas.qnfo.org,
https://papers.qnfo.org, and the public read-only mode of `ops.qnfo.org/v1/chat/completions` (a request with no key, or a
stale key, is answered in that mode with the response header `x-ops-access: public-read`). If a page or card asks you to
create or type a token to *read*, that is a defect: file it.

Keys exist only for what **changes the fleet or spends its money**. The table below lists every one an owner can hold.

## The owner's keys

| Key (secret name) | On worker | Endpoint it opens | Who issues it | Where the value is kept |
|---|---|---|---|---|
| `ROUTER_AUTH_KEY_2` | qnfo-ai | `https://ai.qnfo.org/v1` (model `qnfo`), full router | workflow `owner-client-keys` (mode `issue`) | private D1 `qnfo-identity.owner_client_keys`, host `ai` |
| `OPS_ROUTER_AUTH_KEY_2` | qnfo-ops | `https://ops.qnfo.org/v1` (model `ops`), full agent | workflow `owner-client-keys` (mode `issue`) | private D1 `qnfo-identity.owner_client_keys`, host `ops` |
| `API_KEY` | personal-api | `https://personal.qnfo.org/v1` (model `personal`) and `/microsoft/connect` | workflow `owner-client-keys` (mode `issue`) | private D1 `qnfo-identity.owner_client_keys`, host `personal` |
| `OWNER_TOKEN` | idea-hub | `POST https://ideas.qnfo.org/api/intake` (owner intake of an idea, issue or paper draft) | set 2026-10-04 09:16Z (IDEAS-PRIVATE-1) | private D1 `qnfo-identity.owner_client_keys`, host `ideas` |
| emailed code (no stored key) | qnfo-fleet-dashboard | owner actions on https://fleet.qnfo.org: ratify or reject objective revisions, mark queue items done, owner documents | type `login` in the command line; a 6-digit code is emailed to the owner's address (`OWNER_CODE_TO`); session 12 h, destructive steps need a code from the last 15 min | `qnfo-audit.owner_sessions` holds only a hash of the session token |

Separation (PERSONAL-QNFO-SEPARATION-1): each key opens exactly one host. The personal key never opens qnfo-ai or
qnfo-ops and the QNFO keys never open personal-api; each sits in its own secret slot, so issuing one changes no other
consumer. The router's primary keys (`ROUTER_AUTH_KEY`, `OPS_ROUTER_AUTH_KEY`) belong to fleet workers, which call qnfo-ai
by service-binding props instead of a copied key (#1703); an owner never needs them.

Live state (read 2026-10-05): `qnfo-identity.owner_client_keys` has one `active` row each for ai, ops, personal
(issued 2026-10-04 09:14-09:15Z, verified 200 the same minute) and ideas; the earlier rows are `superseded`.
Without a key, `ai.qnfo.org` and `personal.qnfo.org` answer 401 and `fleet.qnfo.org/api/owner/keys` answers 403.

### See your current keys

Sign in on https://fleet.qnfo.org (type `login` in the command line, enter the emailed code), then open
`https://fleet.qnfo.org/api/owner/keys`. It lists the active rows of `qnfo-identity.owner_client_keys` (host, worker,
secret name, value, issued and verified times) to the signed-in owner and to fleet loops holding `LOOP_TOKEN`, like every
`/api/owner/*` read, and to nobody else (OWNER-KEYS-VIEW-1, dashboard 1.21.4).
Paste a value once into the client that needs it:

- ChatBox or DeepChat, QNFO: provider OpenAI-compatible, base URL `https://ai.qnfo.org/v1`, model `qnfo`, key = host `ai`.
- ChatBox or DeepChat, fleet agent: base URL `https://ops.qnfo.org/v1`, model `ops`, key = host `ops`.
- ChatBox or DeepChat, personal: base URL `https://personal.qnfo.org/v1`, model `personal`, key = host `personal`.

### Issue new keys (rotation)

1. GitHub, QNFO/qnfo-workers, Actions, workflow **owner-client-keys**, Run workflow, mode `issue` (optionally a subset of
   `ai ops personal`). For each host it stores the new value in `qnfo-identity.owner_client_keys` first, writes the
   worker secret under the secrets lease (`qnfo-deploy-guard /secret-lock`), and verifies the new key answers 200. The log
   shows HTTP statuses only.
2. Read the new values at `/api/owner/keys` (above) and paste them into your clients.
3. Run the same workflow with mode `check`. It probes each host with the stored key, fails on a 401 or on public-read
   mode, and rewrites the probe ledger `qnfo-audit.owner_client_probes`. ai-health-prober reads that ledger every 20
   minutes and marks `freshness_guard` signal `owner_client_keys` stale after 26 h, so a broken owner key is seen
   server-side (OWNER-CLIENT-PROBE-1). A rotation is not finished until a `check` run passes.

## Credentials that are not owner keys

| Credential | Status | What to do |
|---|---|---|
| USPTO Open Data API key (iPatent benchmark, #1779) | not wired yet: no fleet worker reads one today (`grep -i uspto */worker.js` finds only patent-format text in qnfo-ipatent) | Request a free key at data.uspto.gov with a USPTO account (queue card `uspto-odp-api-key`). The change that builds the benchmark names the worker and the secret it is stored under; until then there is nothing to store. |
| Microsoft app id and client secret (Outlook mail in personal-api, `/microsoft/*`) | worker side deployed; `GET https://personal-api.q08.workers.dev/health` reads `microsoft_mail: no-client` | entra.microsoft.com, App registrations, New registration: Personal Microsoft accounts only; Web redirect URIs `https://personal-api.q08.workers.dev/microsoft/callback` and `https://personal.qnfo.org/microsoft/callback`; delegated Mail.Read + offline_access; create a client secret. Store the two values as worker secrets `MS_CLIENT_ID` and `MS_CLIENT_SECRET` on personal-api (queue card `outlook-graph-entra-app`; this needs your Microsoft sign-in, so it stays yours). Then connect each mailbox once at `/microsoft/connect` with the personal `API_KEY`. |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` in QNFO/personal-life-workers | not needed | Personal workers deploy through the canonical path in QNFO/qnfo-workers (merge to main). Read 2026-10-05: calendar-api 0.7.0-host, radar-hub 1.2.3 and personal-companion 1.10.1-answer-rate are live, deployed by `qnfo-ops/ops-deploy` (qnfo-audit.fleet_deploys). Queue card `personal-radar-home` was resolved as superseded on 2026-10-04. |
| `LOOP_TOKEN` (header `x-loop-token`) on qnfo-fleet-dashboard | fleet loops and agents only | Not an owner key. It files notes and tasks and may ratify constraint revisions under the owner's delegation, but never an objective weight change (OBJECTIVE-WEIGHT-OWNER-ONLY-1, dashboard 1.21.6). |
| `SYNC_TOKEN` (header `X-Sync-Token`) on qnfo-ai-search | fleet sync jobs only | Uploads documents to the AI Search corpus (`POST /ingest`). Not an owner key. |

## Rules

- Never paste a key value into an issue, a commit, a card, a chat transcript or a workflow log.
- Never re-accept a rotated-out key. Never create per-worker copies of `ROUTER_AUTH_KEY` (#1703).
- Before writing any worker secret, take the lease: `POST https://qnfo-deploy-guard.q08.workers.dev/secret-lock/acquire`
  (CLAUDE.md, #1701). The owner-client-keys workflow does this itself.
