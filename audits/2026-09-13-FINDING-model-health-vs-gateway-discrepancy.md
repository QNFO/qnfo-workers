# FINDING — model health reports all-ok while the gateway shows sustained failures

Date: 2026-09-13. Author: qnfo-ops. Every value below is a tool return from this session.

## The discrepancy

| source | reading |
|---|---|
| `ai_model_health` (aggregate) | total **20**, `degraded=0`, `never_probed=0`, every row `status='ok'` |
| `ai_gateway_failures` (last 24h) | 9 (model, error_class) pairs at **45–47 each**, ~418 total |

The failing pairs, verbatim:

| model | error_class | n |
|---|---|---|
| `@cf/moonshotai/kimi-k2.6` | rate-capacity | 47 |
| `@cf/moonshotai/kimi-k2.7-code` | rate-capacity | 47 |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | content-shape | 47 |
| `@cf/zai-org/glm-5.2` | rate-capacity | 47 |
| `@cf/baai/bge-base-en-v1.5` | rate-capacity | 46 |
| `@cf/google/gemma-4-26b-a4b-it` | image-input | 46 |
| `@cf/zai-org/glm-5.2` | tool-args-json | 46 |
| `@cf/qwen/qwen3.8-27b` | upstream | 45 |
| `@cf/qwen/qwen3.8-27b` | other | 2 |

## A resolved issue names exactly the failing models

`agent_issues` **689**:

```
MODEL-DEGRADED @cf/qwen/qwen3.8-27b,@cf/zai-org/glm-5.2,
@cf/qwen/qwen2.5-coder-32b-instruct,@cf/google/gemma-4-26b-a4b-it
category=model-health  priority=medium  status=resolved
created 2026-09-13T13:40:57Z
```

Those are exactly the four models carrying 45–47 failures each. The issue is marked **`resolved`**
while the failures continue in the same 24h window.

This is the same defect class as the `ok=1` finding in `FINDING-2026-09-13-deploy-loop-downgrade.md`
§2: a status flag (`ok`, `degraded=0`, `resolved`) is **not evidence** that the underlying condition
changed. Three independent status surfaces — `ai_model_health.status`, the issue's `status`, and the
aggregate `degraded=0` — all agree the models are fine, and the failure table disagrees with all three.

## Why the fleet's own advisor cannot see it

`qnfo-fleet-control` `runAudit()` files a gateway finding only under these tests:

```js
if (cls.indexOf("5") === 0 && n >= 200)          -> high
else if ((cls.indexOf("4") === 0 || cls.indexOf("429") >= 0
          || cls.indexOf("timeout") >= 0) && n >= 400) -> medium/high
```

The classes present here are `rate-capacity`, `content-shape`, `image-input`, `tool-args-json`,
`upstream`, `other`. `"rate-capacity".indexOf("4")` is `-1`, `"content-shape".indexOf("4")` is `-1`,
and none contains `429` or `timeout`. **Every one of these classes fails every test**, so no finding is
filed and no alert fires — regardless of volume. The named-class taxonomy and the numeric-class matcher
are mutually blind.

Corroborates concurrent issue **698** (AI-GATEWAY request-shape defects: 20402 HTTP 400s across three
models).

## What I did not establish

- I did not read `ai_gateway_failures`' writer, so I cannot say whether these 45–47 counts are HTTP
  responses or locally-generated pre-flight rejections. `content-shape`, `image-input` and
  `tool-args-json` read like **request**-shape rejections (bad input from the caller), which would make
  them a caller defect rather than model degradation — the opposite conclusion from issue 689's framing.
  I am not asserting either; the class names are the only evidence I have and they are ambiguous.
- I did not verify whether `ai_model_health` probes the same path the gateway uses. If the probe bypasses
  the gateway, `status='ok'` and 47 gateway failures are both true and not contradictory — in which case
  the defect is a monitoring-coverage gap, not a false status. **This distinction is the whole question
  and I could not resolve it from the tables available.**
- `rate-capacity` at ~47 for four different models is suspiciously uniform, which is consistent with a
  shared quota/binding limit rather than four independent model problems. Unexamined.

## Not fixable from this endpoint

The finding needs either a probe-path change or a matcher fix in `qnfo-fleet-control/worker.js`, both of
which require a deploy route this endpoint does not have. Recorded only.
