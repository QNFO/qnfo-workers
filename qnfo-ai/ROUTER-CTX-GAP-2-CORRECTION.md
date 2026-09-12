# ROUTER-CTX-GAP-2 — CORRECTION (2026-09-12)

Supersedes two claims in `ROUTER-CTX-GAP-2.md`. Both are falsified by direct file read-back
against the repo on 2026-09-12.

## 1. "byte-identical twins, both `VERSION = "5.21.3"`" — FALSE

| file | size (B) | VERSION | sha |
|---|---|---|---|
| `qnfo-ai/worker.js` | 148,613 | **5.21.5** | `b8d053229afb92c982641841d680228418a2206a` |
| `qnfo-ai/deployed-current.worker.js` | 143,771 | **5.21.3** | `9b536969240684bea3acc017b5877c6d05d7488c` |

Not byte-identical (4,842 B apart), not the same version. The worker.js sha cited in the parent
doc (`32380028b9c0f26e95bcfbb49a14c58905b487e5`) no longer matches; it is now `b8d05322…`.

## 2. `return "qwq-32b"` "present in both files" — FALSE for `worker.js`

`worker.js` (5.21.5), `contextAwareTarget`, verbatim:

```js
  const big = MODELS["glm-5.3-flash"];
  if (big && spec.wa !== big.wa && estInput + out <= modelCtx(big) - CTX_SAFETY_MARGIN) {
    return "glm-5.3";
  }
```

The misroute is **already fixed in canonical source**. The defect survives only in the
`deployed-current.worker.js` (5.21.3) copy.

## 3. The pre-apply anchor check in the parent doc is now WRONG

`ROUTER-CTX-GAP-2.md` states: `grep -c 'return "qwq-32b"' qnfo-ai/worker.js` → expect exactly 1.
Against `worker.js` the correct expectation is **0**. A deployer following the old instruction
would read a correct state as "not yet patched".

## 4. The live version is not in the repo at all

Live `qnfo-ai` = `5.25.1-anomaly-dedup` (fleet_status service-binding probe, 2026-09-12T08:14:51Z).
Repo numbered snapshots stop at `worker-5.13.2.js`; the newest sources present are 5.21.5 and
5.21.3. **No 5.22–5.25 source exists in the repo.**

Whether 5.25.1 still contains the fix is **unverifiable from this endpoint**. Version
monotonicity does not imply fix monotonicity in this fleet: GW-FAIL-DEDUP-1 was present in source
and was then reverted by a later deploy wave (see `audits/2026-09-12-redteam-remediation.md` §D3).

## 5. Residual defects that survive in 5.21.5

1. **Science overflow fallback loses tools.** The final line returns
   `cls.domain === "science" ? "deepseek-v4-flash-thinking" : "deepseek-v4-flash"`.
   `deepseek-v4-flash-thinking` is `tools: false` in the registry, so a science-domain request
   that overflows even 1.31M is routed to a model that cannot call tools.
2. **Comment/code mismatch with a capability consequence.** The comment says the upgrade target
   is `glm-5.3-flash` (`vision: true`); the code returns `glm-5.3` (`vision: false`). Both are
   `ctx: 1310720`, so capacity is unaffected — but a vision request that overflows its tier-0
   target may lose image handling. Interaction with `VISION_FALLBACK`
   (`MODEL-PER-TASK-1 2026-09-11`, set to `glm-5.3-flash`) was **not traced**.

## 6. Status

Downgrade `ROUTER-CTX-GAP-2` from "P0 open defect" to **"fixed in 5.21.5; verify in 5.25.1"**.

Blocking prerequisite for any further router work: **recover the live 5.25.1 source into the
repo.** Until that exists, no patch spec can be validated against the code that actually runs,
and no post-deploy verification can be anchored.
