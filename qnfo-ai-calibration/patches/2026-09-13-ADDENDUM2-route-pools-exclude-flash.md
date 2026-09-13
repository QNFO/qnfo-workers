# ADDENDUM 2 — `ROUTE_POOLS.code` excludes `deepseek-v4-flash`; the router cannot pick it for code

Date: 2026-09-13 (qnfo-ops / ops-exec)
Supersedes the downgrade in `patches/2026-09-13-ADDENDUM-strategy-semantics-unresolved.md`.
Partially reinstates `patches/2026-09-13-CORRECTION2-callers-not-router.md` — on better evidence.

The earlier addendum parked the P0-1 question because `ai_queries.strategy` could not be
interpreted. **It does not need to be interpreted.** The routing tables are readable in source.

## 1. The source

`qnfo-ai/worker-5.13.2.js`, sha `166b022a4e71b0b0ee4d420b98470b8cfb6dc997`, 112,847 bytes,
read in full (it fits under the 32,768-character read cap where the live 143,771-byte bundle does
not).

```js
var ROUTE_POOLS = {
  code:     ["kimi-k2.7-code", "glm-5.3", "qwen2.5-coder-32b", "deepseek-v4-pro-wa", "gpt-oss-120b"],
  science:  ["glm-5.3", "kimi-k2.6", "gpt-oss-120b", "deepseek-v4-pro-wa", "glm-5.2"],
  legal:    ["deepseek-v4-pro", "glm-5.3", "kimi-k2.6"],
  creative: ["glm-5.3", "gemma-4-26b", "glm-4.7-flash", "qwen3-30b"],
  general:  ["glm-4.7-flash", "gemma-4-26b", "qwen3-30b", "deepseek-v4-flash", "glm-5.3-flash"]
};
function autoRoute(cls, prompt) {
  if (cls.complexity === "high" && cls.domain !== "code") {
    return seededPick(["glm-5.3", "deepseek-v4-pro-wa", "gpt-oss-120b", "deepseek-v4-pro"], prompt || "");
  }
  const pool = ROUTE_POOLS[cls.domain] || ROUTE_POOLS.general;
  return seededPick(pool, prompt || "");
}
```

## 2. What follows

- **`deepseek-v4-flash` appears in exactly one pool: `general`.** It is in **no** other pool.
- `classify()` sets `domain="code"` for code prompts, and `autoRoute`'s high-complexity branch
  explicitly **excludes** code (`cls.domain !== "code"`), so a code request falls through to
  `ROUTE_POOLS.code`.
- Therefore the router's `auto` path **structurally cannot select `deepseek-v4-flash` for code**.
  Its code pool is depth-only: `kimi-k2.7-code`, `glm-5.3`, `qwen2.5-coder-32b`,
  `deepseek-v4-pro-wa`, `gpt-oss-120b`.

This is the conclusion CORRECTION2 reached by inference, now supported by the routing tables
themselves — **without** depending on what `strategy` means. The 180 code-domain queries that
resolved to `deepseek-v4-flash` cannot have come from `autoRoute` with `domain="code"`.

The `general` pool containing `deepseek-v4-flash` also explains the high flash volume overall:
`general` is 833 `single` + 403 `auto`, by far the largest domain.

## 3. The caveat, stated plainly

**`ROUTE_POOLS` and `autoRoute` were read from v5.13.2, not from the live v5.21.3.** In the live
143,771-byte bundle those functions sit just past the 32,768-character read cap — my live read
ended mid-`classify`, at `return { complexity, domain, uncertainty, divergence, verifiability`.
So the live code pool is **inferred from an older version, not read**.

What I *did* verify live, and what makes the inference credible:

| | v5.13.2 | live v5.21.3 |
|---|---|---|
| `classify()` regexes and assignments | — | byte-identical to 5.13.2 |
| `ENSEMBLE_POOL.code` | `["@cf/moonshotai/kimi-k2.7-code"]` | `["@cf/moonshotai/kimi-k2.7-code"]` |
| `ENSEMBLE.primary` | `@cf/moonshotai/kimi-k2.7-code` | same |
| `deepseek-v4-flash` in `MODELS` | yes (tier 1) | yes (tier 1) |

The code-path intent is unchanged across the two versions. But a later commit could have added
`deepseek-v4-flash` to `ROUTE_POOLS.code`, and I cannot exclude that. **Treat §2 as
high-confidence-but-unread for the live artifact.**

## 4. What this changes

| Item | Status |
|---|---|
| P0-1 "add a router code rule" | **still unnecessary.** The router already has a depth-only code pool. |
| CORRECTION2 "callers, not the router" | **reinstated** on source evidence, no longer resting on `strategy` |
| The `strategy` question | **no longer load-bearing** for this conclusion (it stays unresolved, and no longer matters here) |
| The 180 flash-for-code rows | explained as non-`auto` traffic — but *which* caller sends them is still unanswerable, because `ai_queries.source`/`.ua` are NULL for 251 of 253 rows |

## 5. Net position for the mandate

The router side of "route code to depth models" is **already implemented**: a depth-only code
pool, and a frontier coder as the ensemble primary. The residual gaps are:

1. **`contextAwareTarget` overflow bug** — `return "qwq-32b"` while the guard tests
   `glm-5.3-flash`; 24k ctx, no tools. Verified live, still unapplied after a redeploy.
   Patcher: `qnfo-ai/apply-router-ctx-fix.mjs` (`5540bff9`).
2. **Caller-side routing** — 180 of 253 code queries resolve to flash via a non-`auto` path.
3. **The instrument** — no code-correctness probe; `latency_max_ms`=8000 records a
   passing-but-slow model as `status:"fail"`.

Note the same `contextAwareTarget` is present in v5.13.2 with `const big = MODELS["qwq-32b"]` —
i.e. the guard and the return were **consistent** there, and the live version changed only the
guard (`glm-5.3-flash`) while leaving the return at `qwq-32b`. That is the regression, and it
dates the defect to somewhere between 5.13.2 and 5.21.3.
