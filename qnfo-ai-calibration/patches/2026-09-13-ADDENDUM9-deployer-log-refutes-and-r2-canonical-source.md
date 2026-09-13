# ADDENDUM 9 — the deployer's own log: refutes ADDENDUM 8 §1, names the real source, and shows two stuck workers

2026-09-13, qnfo-ops. Source: `fleet_deploys` and `fleet_deploy_state` — the deployer's own records.

## 1. REFUTED — the deployer did NOT fail for `qnfo-ai-calibration`

ADDENDUM 8 §1 inferred that "the hourly deployer is failing or skipping `qnfo-ai-calibration`". The
deployer's log contradicts it:

| id | worker | actor | from_sha | to_sha | source_path | ok | ts |
|---|---|---|---|---|---|---|---|
| 9 | `qnfo-ai-calibration` | deploy | `1.1.1` | **`1.1.4`** | **`r2:qnfo-canonical/qnfo-ai-calibration.js`** | **1** | 2026-09-11 14:01:47 |

It deployed, it succeeded, and it reported `redeployed 1.1.1 -> 1.1.4`. There is also **no
`scanerr:qnfo-ai-calibration`** key in `fleet_deploy_state`, so the scan does not error on it either.
My inference was wrong.

## 2. The real source is an R2 object, not the repo file — which resolves the contradiction

`source_path = "r2:qnfo-canonical/qnfo-ai-calibration.js"`.

**The repo's `deployed-current.worker.js` — the 33,551-byte bundle I read in full, the one that
contains the GW-FAIL-DEDUP-1 gate — is not what gets deployed for this worker.** The deployed 1.1.4
came from an R2 canonical object.

That object is **not readable from this endpoint**: `r2_list(backups, prefix='qnfo-canonical/')`
returns **0 objects**, and `r2_get('qnfo-canonical/qnfo-ai-calibration.js')` returns
`object not found`. The `qnfo-canonical` namespace is not among the bound buckets.

So the apparent contradiction dissolves. There are **at least three artifacts all labelled 1.1.4**:

| artifact | size | issue store | gate |
|---|---|---|---|
| repo `worker.js` | 35,742 B | `issue_ledger` | — |
| repo `deployed-current.worker.js` | 33,551 B | `agent_issues` | **present** |
| **`r2:qnfo-canonical/qnfo-ai-calibration.js`** | **unknown, unreadable** | **unknown** | **unknown** |

The version string `1.1.4` is shared by all three, so a version-based deployer decision cannot
distinguish them, and the one that is actually deployed is the one I cannot read. **The
three-artifact version collision is now the central defect**, and it is a better explanation of the
continuing refiling than "the deployer is broken".

I cannot confirm the gate's presence or absence in the deployed artifact. The behavioural test
(watch whether a `[gw-fail]` title can be refiled after a prior row with that title is resolved)
remains the only available check, and it has already fired once: 489 → 654 → 678.

## 3. NEW — the hourly deployer is stuck in two permanent failure loops

From `fleet_deploys`, grouped by worker:

| worker | attempts | ok | failed | window |
|---|---|---|---|---|
| **`personal-companion`** | **30** | 4 | **26** | 2026-09-12T08:01 → 2026-09-13T13:01 |
| **`qnfo-cloud-ops`** | **25** | **0** | **25** | 2026-09-12T10:01 → 2026-09-13T07:02 |

Both fail hourly, and `qnfo-cloud-ops` has **never once succeeded** in 25 attempts. Verbatim errors:

- `personal-companion` — `HTTP 400 {"errors":[{"code":10021,"message":"Workflow GenerationFlow must be
  exported or a script_name must be specified"}]}`
- `qnfo-cloud-ops` — `HTTP 400 {"errors":[{"code":10021,"message":"Uncaught SyntaxError: Invalid or
  unexpected token\n  at worker.js:1:2"}]}`

That is **~2 wasted PUTs every hour, indefinitely**, from the fleet's own deploy control plane. The
`qnfo-cloud-ops` case matches the "stored bundle is a raw multipart body" diagnosis already recorded
in the canonical-drift audit. This is the deployer defect worth fixing — not a calibration one.

## 4. NEW — deployer state and recent successes

`fleet_deploy_state` (46 rows): `enabled = 1`, `auto_heal = 1`, plus 43 `scanerr:<worker>` keys.
Values are `""` (clean, 33 workers), **`stale-canon`** (7: `obsidian-writer`,
`osf-integrity-check`, `personal-life-maintain`, `qnfo-arxiv-radar`, `qnfo-research-radar`,
`qnfo-twin-maintain`, `research-daily-brief`) and **`nocanon`** (3: `qnfo-container-executor`,
`qnfo-scorecard`, `qnfo-wrangler-test`).

Successful deploys on 2026-09-13: `ai-health-prober` 2.3.1 → 2.3.3 (07:00:53), `qnfo-social`
0.5.2-checker-heal → 0.5.3-failclosed (07:04:34), **`qnfo-backlog-exec` 1.2.6 → 1.2.7 (08:01:43)**.
On 2026-09-11T14:01-14:03Z: `personal-api`, `qnfo-ai`, `qnfo-ai-calibration`,
`qnfo-email-orchestrator`, `qnfo-paper-reviser`.

**Relevant to ADDENDUM 4:** the drainer was upgraded 1.2.6 → 1.2.7 at **08:01:43Z**, which is *after*
the 07:25:07Z resolve event. So the resolves were performed by 1.2.6 or by something else — not by
the version I observed. ADDENDUM 8 correction 18 stands.

## 5. Corroboration — `qwen3.8-27b` has been probe-side since 09-06

The `agent_issues` description for row **489** (created 2026-09-06) already reads:

    gateway failures in sweep window: 2x status=400 class=upstream sample={"name":"AiError",
    "internalCode":8007,"httpCode":400,"message":"AiError: ... \"System message must be ...

Row 654 (09-11) is `14x`; row 678 (09-13) is `18x`. So the class is the probe's own malformed message
ordering, present since the first filing and growing — confirming correction 17 from the row text
itself, not from the sibling finding. Row 684 (bge) reads `79x status=429 class=rate-capacity
sample=Rate limited`, matching the ~90/sweep load-driven figure.

## 6. Where the gw-fail root cause now stands

**Unresolved, but narrowed.** The deployed artifact is an unreadable R2 object labelled 1.1.4; at
least three different builds share that label; and the version-collision defect is the most
parsimonious explanation for a guarded and an unguarded build being indistinguishable to the
deployer. I am not offering a seventh theory beyond that.

What is settled: the refiling is real (489 → 654 → 678), the burst timing is real (8 tickets resolved
at 07:25:07Z, 7 refiled 5 m 53 s later), and the deployed source is not the file I read.

## Limits

- The R2 canonical object is unreadable here; `qnfo-canonical` is not a bound bucket. Its contents,
  size and gate status are unknown.
- `fleet_deploys` records only deploys the deployer chose to make; a deploy at
  `qnfo-ai-calibration modified_on = 2026-09-12T09:09:46Z` appears in **neither** `fleet_deploys` nor
  `deployment_history`, so the table is not a complete deploy record.
- The two failure loops are characterised from `note` text truncated at the first 200 chars.
- Whether `personal-companion`'s 4 successes are the same artifact as its 26 failures is not
  established.
