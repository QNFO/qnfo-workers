# CF-ACCESS-ROLLOUT-1277: putting Cloudflare Access in front of the admin surface

Tracks agent_issue **1277** (CF-ONE-ACCESS-NOT-DEPLOYED-1). This document is a plan plus a way to
verify it. It does **not** deploy Access: that needs an Access-scoped Cloudflare credential and an
owner decision on which hostnames are admin, and the ops endpoint holds neither (the issue says so).

## State measured 2026-10-01 (scripts/access_probe.py, unauthenticated GET /, redirects not followed)

| host | verdict |
|---|---|
| ops.qnfo.org, ai.qnfo.org, papers.qnfo.org, ideas.qnfo.org, hub.qnfo.org, archive.qnfo.org, qnfo.org, q08.org | NO_ACCESS (HTTP 200, no Access redirect or marker) |

Whether a Zero Trust organisation exists is still unverified.

## Decision the owner must make first: which hostnames are admin?

The issue lists eight hostnames, but papers, ideas, archive, qnfo.org and q08.org serve public
content. Putting Access in front of a public site takes it offline for readers. Suggested split
(owner to confirm):

- **Protect (machine/admin APIs):** ops.qnfo.org, ai.qnfo.org, hub.qnfo.org (hub only if it is not a public page).
- **Leave public:** papers.qnfo.org, ideas.qnfo.org, archive.qnfo.org, qnfo.org, q08.org. For their admin
  routes, protect the path (for example `/admin/*`, `/run*`) with a path-scoped Access application, not the host.

## Rollout order (lockout-safe)

1. Enable Zero Trust for the account and pick an identity provider (owner, dashboard).
2. Create one **service token** per caller: ops, ai, tools-mcp, fleet-control. Callers send the token as the
   `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers. Store the secrets as Worker or repo secrets; never in the repo.
3. Create the Access application for one low-risk admin hostname first, with two policies:
   - **Service Auth** for the service tokens;
   - **Allow** for the owner's identity.
   Do not add a catch-all Block before both are in place.
4. Add the service-token headers to that host's callers **before** enabling enforcement, then verify each
   caller still gets 200 (fleet-control, qnfo-ops, the deploy workflows).
5. Repeat per host. Keep the old bearer tokens working in parallel until every caller has moved, then rotate
   them (see the ROTATE-EXPOSED-CREDENTIALS-1 runbook, #1676; the window is 2026-10-03).
6. Rollback for any host: delete or disable its Access application. The bearer-token path is unchanged until step 5.

Callers that cannot send custom headers (browsers on public pages, third-party webhooks) need a bypass policy
scoped to their exact path, decided case by case.

## How to verify (and the close condition)

```
python3 scripts/access_probe.py --require ops.qnfo.org ai.qnfo.org --
```

exits 1 while any required host is not ACCESS. Run it after each host. 1277 can be closed when every host
the owner designated as admin reports ACCESS **and** every service caller still authenticates (step 4). A
probe result alone is not enough: an Access app that blocks the callers is a regression.

Related owner-gated items: #1279 (CASB), #1676 (credential rotation), RM-CF-ONE-EMAIL-DLP-1.
