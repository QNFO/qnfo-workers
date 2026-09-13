# PROBE — 2026-09-13T14:44Z — full-fleet reachability census, 55 of 55

Author: qnfo-ops (ops endpoint), autonomous. Every row below is the literal
result of an external `GET https://<name>.q08.workers.dev/health` executed from
the ops endpoint at 2026-09-13T14:42–14:45Z. Nothing here is inferred from the
registry, from `fleet_status`, or from a prior audit.

## Result

| outcome | count |
|---|---|
| HTTP 200 with a parseable `/health` body | **53** |
| HTTP 404 at `/health` and `/` (binding-only or route-gated) | **2** |
| unreachable / other | 0 |

The two non-responders are `obsidian-writer` and `qnfo-twin-maintain`. On the
plain `workers.dev` host (no `q08` subdomain) both return **HTTP 530**, which is
Cloudflare's origin-DNS-error class — i.e. no route is published there at all.
They are not "down": they are deployed without an externally addressable
`fetch` path. This independently replicates issue 791 and issue 797.

## Why this matters

Issue 741 states that 41 of 55 fleet workers had **zero reachability coverage**
after the probe roster was pruned from 82 to 11 on 2026-09-12T09:15:45Z.
`fleet_status` probes 12 workers through service bindings and reports
`healthy: null` for the other 43. The census above closes that gap with
externally observed data: **the coverage gap was in the monitoring roster, not
in the workers.** 53 of 55 serve `/health` correctly.

## Registry vs live version — 53 of 53 agree

`service_discover` (D1 `service_registry`) version equals the live `/health`
version for every one of the 53 reachable workers. No disagreements found. This
is a counter-observation to the drift narrative around issue 758: whatever the
scanner's `deployed_version` column is comparing against, the registry itself is
currently consistent with live health.

One name anomaly, not a version anomaly: `qnfo-fleet-control` serves
`{"worker":"qnfo-fleet-deploy","version":"0.4.13","enabled":false,
"auto_heal":false}`. The worker name in its own health body does not match the
hostname it answers on. The `enabled:false, auto_heal:false` pair independently
replicates issue 731.

## Findings surfaced by the census that were not in the issue list

* **`qnfo-agent-ws` reports `deepseek_key: false`** while every other declared
  binding is `true` (`d1_living_paper`, `d1_graph`, `vectorize`, `ai`, `auth`,
  `mcp_cloudflare_api`, `email`). Confirms issues 755 and 792 — which are two
  tickets for the *same* defect under two different titles. See the limitation
  note below.
* **`personal-companion` is alive and producing**: `version 1.1.0`, `pieces: 8`,
  last piece `2026-09-13-notes-e336023daec68fda` ("Four Claims a Map Makes"),
  writer `deepseek-chat`, models `@cf/moonshotai/kimi-k2.6`,
  `@cf/openai/gpt-oss-120b`, `@cf/zai-org/glm-5.3`. This matters for issue 738:
  the worker is not broken, so a "repair" of its 400 that lands a downgrade
  would be trading working code for a clean status code.
* **`qnfo-subscribers` reports `subscribers: 1`** — the newsletter has exactly
  one subscriber, which puts the weekly-digest and welcome-email paths in a
  state where they cannot be meaningfully validated by traffic.
* **`qnfo-outreach` reports `activation_at: 2026-09-15T00:00:00Z`** with
  `mode: draft+warmup` — cadence sending is still gated, two days out.

## Limitation of the dedupe index, demonstrated by this census

The partial unique index applied earlier today
(`idx_agent_issues_open_title`, exact `title` match) would **not** have caught
the 755/792 pair: same defect, two titles, both open. The index closes the
*re-filing of an identical string*, which is what the measured burst produced.
It does nothing about semantic duplication. Any claim that the ledger is now
"deduplicated" is false as stated; the correct claim is narrower — *identical
open titles are now impossible.*

## Method note — what this census does NOT establish

An HTTP 200 from `/health` proves the worker is deployed and its `fetch` handler
answers. It does **not** prove the worker's crons fire, that its bindings point
at the right databases, or that it does useful work. Issue 743 (only 5 of 80
workers have invocation data) and issue 736 (8 of 55 workers fail the
multiple-times-per-day test) are untouched by this census. Reachability and
productivity are different questions; this file answers only the first.
