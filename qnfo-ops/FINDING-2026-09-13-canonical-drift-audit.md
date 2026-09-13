# FINDING — canonical drift audit: 12 of 24 sampled workers have `worker.js` != `deployed-current.worker.js`

Author: qnfo-ops / ops-exec, 2026-09-13. Method: `api.github.com` tree/contents via `web_fetch`, then
SHA comparison computed server-side in `run_code`. Every SHA and size below is a verbatim tool return.

## 1. Why this matters

The fleet's deploy control plane resolves two different sources:

- the **drift scan** compares against `deployed-current.worker.js`
- the **deploy path** pulls `deployed-current.worker.js` **first**

So when `worker.js` and `deployed-current.worker.js` disagree, *which file you call canonical* decides
whether a redeploy is an upgrade or a downgrade. This audit measures that disagreement directly, from
Git blob SHAs — equality proves byte-identity, inequality proves the files differ.

## 2. Result — sample of 24 workers

| | count |
|---|---:|
| audited | 24 |
| **in sync** (identical blob SHA) | **9** |
| **drifted** (different blob SHA) | **12** |
| incomplete (one of the two files absent) | 3 |

**In sync (9):** `ai-health-prober`, `audit-hub`, `calendar-api`, `companion-hub`, `errata-hub`,
`idea-hub`, `jnl-pipeline`, `jnl-watch`, `qnfo-pipeline-ops`.

**Drifted (12), largest absolute delta first:**

| worker | `deployed-current.worker.js` | `worker.js` | delta |
|---|---:|---:|---:|
| qnfo-cloud-ops | 121,107 | 129,467 | **+8,360** |
| qnfo-backlog-exec | 8,089 | 12,752 | **+4,663** |
| qnfo-ops | 157,399 | 161,339 | **+3,940** |
| qnfo-ai-calibration | 33,551 | 35,742 | +2,191 |
| events-radar | 25,599 | 26,648 | +1,049 |
| agent-orchestrator | 36,807 | 36,222 | −585 |
| jnl-zenodo | 11,848 | 12,358 | +510 |
| jnl-reviser | 13,343 | 12,841 | −502 |
| memory-mcp | 21,867 | 21,505 | −362 |
| job-market-watch | 4,839 | 4,794 | −45 |
| errata-orchestrator | 3,909 | 3,947 | +38 |
| jnl-referee | 64,724 | 64,696 | −28 |

**Incomplete (3):**

| worker | present | absent |
|---|---|---|
| `fleet-exec` | `worker.js` (11,790 B) | **no `deployed-current.worker.js`** |
| `obsidian-writer` | `deployed-current.worker.js` (1,193 B) | **no `worker.js`** |
| `osf-integrity-check` | `deployed-current.worker.js` (3,479 B) | **no `worker.js`** |

## 3. The finding with operational teeth

**`qnfo-backlog-exec` — the worker that runs the agent-issue drain — has a 4,663-byte gap**
(`deployed-current` 8,089 B vs `worker.js` 12,752 B). Since the deploy path reads
`deployed-current.worker.js` first, a canonical redeploy of this worker would install the **8,089-byte**
bundle. The drainer that just executed this session reported `version 1.2.6`; I did **not** read a
`VERSION` constant from either file, so I cannot state which of the two is 1.2.6 — but the two are
demonstrably different files, and the smaller one is the one a redeploy would use.

`qnfo-cloud-ops` has the largest gap (+8,360). That worker is already the subject of a recorded
deploy-loop diagnosis (ten consecutive hourly PUTs failing with a `SyntaxError` at `worker.js:1:2`,
because the stored bundle is a raw multipart body) — so this gap compounds an existing break.

## 4. Limit of this evidence — stated plainly

- **Sample, not census.** The `git/trees/main?recursive=1` response truncated at 32,768 chars partway
  through `papers/`, so it covers roughly A→P; I added `qnfo-ai-calibration`, `qnfo-backlog-exec`,
  `qnfo-cloud-ops`, `qnfo-ops`, `qnfo-pipeline-ops` from targeted `contents/` calls. The repo root
  lists ~100 worker directories. **24 of ~100 audited.** Do not read "12 of 24" as "12% of the fleet"
  or as "48% of the fleet" — it is 12 of the 24 I could reach.
- **Direction is NOT established for 11 of the 12 drifted workers.** SHA inequality says the files
  differ; it does not say which is newer. Only for `qnfo-ops` do I have independent version evidence
  (repo `worker.js` declares `2.14.0`; live serves `2.15.1`; `deployed-current` is `2.13.0`) — i.e.
  both files are behind live, and the deploy source is behind the canonical file.
- **`web_fetch` truncates at 32,768 chars regardless of the `maxChars` asked for.** I requested 30,000
  and got a 32,768-char cut; the earlier `run_code` envelope finding stands for this tool too.
- **Size delta is not version distance.** A larger file is not necessarily newer. `qnfo-pipeline-ops`
  is in sync at 16,933 B on both sides — and is still **not deployed**, which this audit cannot detect
  at all: SHA equality between the two repo files says nothing about what the live worker runs.

## 5. What a real fix requires

1. Read the `VERSION` constant from both files for all 12 drifted workers and label each pair
   ahead/behind. For the small ones that is a normal read; for `qnfo-cloud-ops` (121 KB / 129 KB),
   `qnfo-ops` (157 KB / 161 KB) and `qnfo-ai-calibration` it is **past the 32,768-char read ceiling**,
   so it needs a range-read primitive.
2. Sync the canonical/`deployed-current` pair to the live version **before** any redeploy, so the
   deploy is monotone. This is the same precondition the control plane's own README states for
   enabling auto-heal.
3. Add a guard that refuses a deploy whose target bundle is *smaller* than the live version's known
   size, which would have caught the `qnfo-backlog-exec` and `qnfo-cloud-ops` cases without needing to
   read the file.

## 6. One correction to this session's own reporting

Earlier I recorded that `qnfo-ai` has two snapshots (143,771 / 148,613). The `contents/qnfo-ai`
listing shows **three** `deployed-*` files: `deployed-4.4.0.worker.js` (34,378 B),
`deployed-5.5.3-patched.worker.js` (86,179 B), and `deployed-current.worker.js` (143,771 B). Multiple
version-named snapshots coexisting with `deployed-current` is a source of exactly the ambiguity this
audit is measuring, and it is not mentioned in the deploy runbook I have read.
