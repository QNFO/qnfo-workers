# ADDENDUM — 1.1.4 is probably NOT deployable by the control plane (sibling import)

2026-09-13, qnfo-ops / ops-exec. Amends `FINDING-2026-09-13-jobs-status-public.md`.

## 1. The finding

`qnfo-observability/worker.js` at **1.1.4** (blob `3a5db9f761837b466357a29849b5912736fe7a48`)
carries `import { FLEET } from './fleet.js';`. But `qnfo-fleet-deploy`'s `redeploy()`
(worker.js sha `ed539ec3`, VERSION 0.4.11) builds its upload as:

```js
var fd = new FormData();
fd.append("metadata", new Blob([JSON.stringify({ main_module: "worker.js" })]));
fd.append("worker.js", new Blob([c.code]), "worker.js");
```

**Only `worker.js`.** If `PUT /content` replaces the module graph, `./fleet.js` is
unresolvable, Cloudflare rejects the upload, and `scan()` retries it **hourly forever** —
the `qnfo-cloud-ops` (24 attempts / 0 successes) and `personal-companion`
(23 attempts / 4 successes) pathology. §4 of the parent doc lists this as one of the two
defects making the deploy loop fail; this change would have added a third worker to it.

## 2. My first inference was CONFOUNDED, and I corrected it

I initially claimed the correlation "sibling-module workers never deploy" as proof.
**It was confounded.** `scan()` only heals `canonical-ahead`:

```js
if (newer(depV, canV)) { out.ahead++; await report(env,n,depV,canV,c.path,"deployed-ahead"); continue; }
out.drifted++;
await report(env, n, depV, canV, c.path, "canonical-ahead");
if (heal && !usedHealth) { var res = await redeploy(env, n); if (res.ok) out.healed++; }
```

Both sibling-module workers were overwhelmingly `deployed-ahead` — `qnfo-observability`
17 rows, **all** `deployed-ahead` (never `canonical-ahead`); `qnfo-fleet-dashboard` 36
`deployed-ahead` vs **1** `canonical-ahead`. So their absence from `fleet_deploys` was
fully explained by the branch gate, **not** by the import. Claim refuted as stated.

## 3. Then the refutation was itself partly undone

`qnfo-fleet-dashboard` **does** have an `ok=1` row: `1.0.18 -> 1.1.0`, note
`"redeployed 1.0.18 -> 1.1.0"`, 2026-09-12 07:01:39. That note is emitted only on the
success path (`ok = putOk && depV2 === canV`); a no-op carries `"no-op version match"`
(as `qnfo-chat-canary` does). So a real upload happened — of a sibling-module worker.

But its canonical was **pre-bundled**. `qnfo-fleet-dashboard/deployed-current.worker.js`
(88,036 B) contains `// registry.js` followed by `var REGISTRY = { ... }` inlined, and
**no import statement**. Candidate #1 in `canonical()` is
`<w>/deployed-current.worker.js`, so that is what was uploaded — self-contained.

**Net: the sibling-import case is UNPROVEN on the control-plane path, not disproven.**
P(failure) is high enough (module-graph validation is real — error 10021 is observed for
both `personal-companion` and `qnfo-cloud-ops`) that shipping it as-is would be a bet
against a known failure mode with a permanent-loop downside.

## 4. State as of this writing

| item | value |
|---|---|
| canonical `worker.js` | **1.1.4** — `/jobs` route present, `import` still present |
| live `qnfo-observability` | **1.1.3** (drift last read 2026-09-13 13:03:53) |
| next healer scan | ~14:01Z (hourly, last run 13:01:23) |
| `fleet_deploys` for this worker | **0 rows, ever** |

**The 14:01Z scan is a decisive experiment.** It will produce one of:
- a `fleet_deploys` row `ok=1, note "redeployed 1.1.3 -> 1.1.4"` → sibling imports **are**
  fine on `/content`, and `/jobs` is live; or
- `ok=0` with an import-resolution error → sibling imports **are not** supported, and the
  loop has started.

Either way the error text is recorded in `fleet_deploys.note`.

## 5. Remediation (committed, fail-closed)

`qnfo-observability/scripts/hotfix-self-contained-1.mjs` (commit `79e968a6…`) inlines the
FLEET list, removes the import, and bumps to **1.1.5**. It asserts exactly one occurrence
of each anchor, cross-checks the inline list against `fleet.js` and refuses on any
difference, and re-reads the result to confirm no `import` survives — aborting **without
writing** on every failure.

The inlined list is verified: **80 names, identical to `fleet.js`, identical order,
round-trips through the `split(" ")` form** (computed, not eyeballed).

```bash
cd qnfo-workers/qnfo-observability
node scripts/hotfix-self-contained-1.mjs
node --input-type=module --check < worker.js && echo SYNTAX-OK
npx wrangler deploy
```

## 6. Why this addendum exists instead of a fixed `worker.js`

I attempted the self-contained rewrite three times. Two attempts were malformed at the
tool-call level (nested `arguments` JSON rather than top-level `repo`/`path`), and in all
three the `content` parameter **truncated mid-file**. A truncated write to a live worker
is a worse defect than the one being fixed, so I stopped rather than gamble it. The
patcher is the safe carrier for the same change: it performs the edit at the call site
where the full source is available, with no re-emission of 27 KB.

**Rollback:** blob `f22ca729f7faf2ef1633a7deead7bc426bc35ce4` = 1.1.3;
`3a5db9f761837b466357a29849b5912736fe7a48` = 1.1.4. The control plane only moves
*forward*, so a rollback must be published as a higher version, not a lower one.
