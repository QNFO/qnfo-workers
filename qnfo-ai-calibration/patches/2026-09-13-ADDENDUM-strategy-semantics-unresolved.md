# ADDENDUM — `strategy` semantics are UNRESOLVED; the P0-1 inversion is a hypothesis, not a finding

Date: 2026-09-13 (qnfo-ops / ops-exec)
Amends: `patches/2026-09-13-CORRECTION2-callers-not-router.md` (commit `78f56de0`)

CORRECTION2 asserted that the router does not send code traffic to `deepseek-v4-flash` and that
callers do. That claim rests entirely on reading `ai_queries.strategy = "single"` as
"the caller named the model". **I ran the test that was supposed to confirm it. It did not.**

## What the test returned

`SELECT domain, strategy, COUNT(*) FROM ai_queries GROUP BY domain, strategy`:

| domain | strategy | n |
|---|---|---|
| code | single | 211 |
| code | auto | 42 |
| creative | single | 211 |
| creative | auto | 3 |
| general | single | 833 |
| general | auto | 403 |
| general | verify | 12 |
| general | ensemble | 1 |
| infrastructure | ensemble | 3 |
| legal | single | 6 |
| legal | auto | 1 |
| science | single | 367 |
| science | auto | 154 |
| web | web | 76 |

**`strategy` has five distinct values** — `single`, `auto`, `verify`, `ensemble`, `web` — not the
two I assumed. `web` appears only in the web domain, `verify` only in general, `ensemble` in
general and infrastructure.

## Why this does not settle it

Two readings remain live, and the crosstab is consistent with either:

1. **`strategy` = what the caller requested.** Caller pins a model → `single`; asks for `auto` →
   `auto`; asks for `ensemble` → `ensemble`; web search → `web`. Under this reading CORRECTION2
   stands: the 180 flash-for-code rows are caller-directed.
2. **`strategy` = how the router resolved the request.** Routed to one model → `single`; automatic
   path → `auto`; multi-model → `ensemble`. Under this reading `single` includes router-chosen
   single-model routes, and **CORRECTION2's inversion collapses** — the router could be sending
   code to flash via the `single` route.

## The datum that refutes both

`strategy = "single"` **with** `model = "ensemble"`: **19 rows** in the code domain, 1 in general.

- Under reading 1, a caller who requested `single` cannot have `ensemble` recorded as the model.
- Under reading 2, a request resolved to `ensemble` should carry `strategy = "ensemble"`.

Neither reading explains it. So `strategy` is probably a third thing — a mode flag orthogonal to
model selection (e.g. single-pass vs multi-pass, or streaming vs not) — in which case **neither**
of my inferences about caller-versus-router is supported.

## Corrected status of the P0-1 conclusion

| Claim | Status |
|---|---|
| 180 of 253 code-domain queries resolved to `deepseek-v4-flash` | **verified** (aggregate) |
| All 180 are `strategy="single"` | **verified** |
| Therefore callers, not the router, chose flash | **UNVERIFIED — hypothesis** |
| A router rule would change nothing for 71.2% of code traffic | **UNVERIFIED** |
| The router's `auto` path sends zero code traffic to flash | **UNVERIFIED** |

The router-source facts in CORRECTION2 §3 still stand on their own: `classify()` sets
`domain="code"` ⇒ `complexity="high"`; `shouldEnsemble()` returns true for high complexity;
`ENSEMBLE_POOL.code = ["@cf/moonshotai/kimi-k2.7-code"]`. What does **not** stand is the claim
that this path is what the 180 flash queries bypassed.

## What would resolve it

Read the code that INSERTs into `ai_queries` and see what populates `strategy`. That code was not
reached: the live router bundle is 143,771 bytes and the read tool caps at 32,768 characters, so
roughly three quarters of the file — including the request-handling and telemetry path — was
never read. This is the same read-cap limit that left `contextAwareTarget`'s call site unread.

**Do not act on CORRECTION2's P0-1 recommendation until `strategy` is resolved.** The safe
statement is the verified aggregate: most code-domain queries resolve to a flash-tier model, and
the mechanism is undetermined.

## Unaffected by this

- The `qwq-32b` / `glm-5.3-flash` one-token defect is verified from source and re-verified live;
  the patcher `qnfo-ai/apply-router-ctx-fix.mjs` (commit `5540bff9`) implements it. Independent of
  the `strategy` question.
- The `source`/`ua` NULL finding is verified and independent.
- The gw-fail guard-absence proof is verified and independent.
