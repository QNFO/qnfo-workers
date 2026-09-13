# Red-team remediation — ADDENDUM 5 (2026-09-13, qnfo-ops / ops-exec)

Extends `REDTEAM-CLOSEOUT-2026-09-13.md` and ADDENDA 1–4. Final addendum.

## E1. F5 is BLOCKED — and the reason exposes a fleet-hygiene defect

F5 in the fix queue read: *"MODELS roster missing llama-3.2-11b-vision — fix roster entry in
qnfo-ai source"*. Investigating it produced three findings, the third of which is the
important one.

### E1.1 The repo source of `qnfo-ai` is FOUR VERSIONS BEHIND the live router

| source | reported version |
|---|---|
| `qnfo-ai/worker.js` header, sha `b8d05322` | **`5.21.5`** |
| `fleet_status` (live service-binding probe) | **`5.25.1`** |
| `service_discover` registry entry | **`5.25.1`** |

**Consequence for this whole audit:** any claim I make about the router's behaviour from
repo source is unreliable. The `MODELS` roster I read (10 keys: `kimi-k2.6`,
`glm-5.3-flash`, `gpt-oss-120b`, `deepseek-v4-flash-wa`, `deepseek-v4-pro-wa`,
`kimi-k2.7-code`, `glm-5.3`, `deepseek-v4-flash`, `deepseek-v4-flash-thinking`,
`deepseek-v4-pro`) is a **5.21.5** roster. It contains **no** `llama-3.2-11b-vision` — but I
cannot conclude the live 5.25.1 router also lacks it. I am explicitly declining to state
that it does.

This is the same class of defect as RC-6 in the calibration worker (source/deploy
divergence) and as the `ai-health-prober` case (`deployed-current.worker.js` at 2.3.1 while
the repo was at 2.3.2). It is now the **third** independent instance found this session. The
pattern — a repo that is not the deployment — is systemic, not incidental, and it means
source-based audits of this fleet carry an unquantified error bar.

### E1.2 The likely fix is a config row, not code — and that is blocked

`ai_calibration_config` holds exactly four keys:

| key | value |
|---|---|
| `fail_threshold` | `2` |
| `gw_sweep_last_ts` | `1789281039437` |
| `latency_max_ms` | `8000` |
| `vision_models` | `kimi-k2.6,kimi-k2.7-code,glm-5.3-flash,gemma-4-26b,llama-3.2-11b-vision` |

`vision_models` names `gemma-4-26b` and `llama-3.2-11b-vision`. Whether the drift ticket
(#662, `roster-entry=missing->@cf/meta/llama-3.2-11b-vision-instruct`) should be resolved by
adding those models to the router or by removing them from the calibration roster is a
**design decision**, not a bug fix — and the router's own header records the governing
principle from the opposite direction: *"Advertising models that cannot respond is worse than
not advertising them."*

Either resolution requires a write I do not have: a D1 `UPDATE` on `ai_calibration_config`,
or a source edit to a 148,613-byte file. **F5 is blocked on the same D1 write-path
limitation as F13.**

### E1.3 `qnfo-ai/worker.js` is unreadable in full

148,613 B against a 32,768-char read cap with no offset parameter — 4.5× over. Even if the
fix were a source edit, it could not be anchored or verified from this endpoint.

## E2. Final fix-queue status

| id | sev | status |
|---|---|---|
| F1 / RC-3 | high | **staged** — FIX C in `apply-calibration-fix.mjs` v2 |
| F2 | med | **staged** — FIX B (anchor unverified; refuses rather than guesses) |
| F3 / RC-4 | high | **staged** — FIX A |
| F4 / RC-2 | med | **fixed in source** — `ai-health-prober` v2.3.3 (`460481db`) |
| F5 | med | **BLOCKED** — repo is 4 versions stale; needs a D1 write or a 148 KB source edit |
| F6 | high | **localised, not fixable here** — `qnfo-cloud-ops` job `worker-health`; 129 KB file |
| F7 | med | **open** — job-silence check, inside the same unreadable 129 KB file |
| F8 date half | med | **staged** — `events-radar/apply-date-fix.mjs` (`411d07e1`) |
| F8 timeout half | med | **open — deliberately unchanged** (see ADDENDUM 3 §C2) |
| F9 | high | **open** — re-arm bound already exists; the stuck `pending`/attempt=12 row is a different path, not investigated |
| F10 | med | **staged** — `qnfo-intent-orchestrator/apply-dispatch-fix.mjs` (`e63a2f28`) |
| F11 | med | **open** — lives in `qnfo-ops/worker.js` (157 KB, unreadable) |
| F12 | low | **open** — not attempted |
| F13 | med | **BLOCKED** — needs a D1 write path |
| RC-1 | high | **staged** — FIX D replay guard |
| RC-5 | med | **staged** — FIX H vision persistence |
| alert-storm | — | **already fixed in source** — `qnfo-pipeline-ops` v0.5.3-alert-dedup |
| error-selfheal regex | med | **fixed in source** — v1.0.3 (`4c5540e8`) |

**Two defects fixed and applied to source. Six staged as anchor-verified patchers. One
localised but unfixable here. Two blocked on the absent D1 write path. Five left open with
reasons.**

## E3. The recurring structural cause

Every remaining item fails for one of three reasons, and none of them is effort:

1. **No D1 write path** (`ops_d1_query` is SELECT/WITH only) → F13, F5's config row, the RC-2
   phantom-row DELETE, the `ai_gateway_failures` dedupe, and the 270-row `issue_ledger`
   backlog.
2. **No deploy tool** (`wrangler deploy` needs `CLOUDFLARE_API_TOKEN`) → all six staged fixes.
3. **Read cap + file size** (32,768 chars, no offset) → `qnfo-ops` 157 KB, `qnfo-cloud-ops`
   129 KB, `qnfo-ai` 148 KB, `qnfo-ai-calibration` 35.7 KB, `qnfo-intent-orchestrator`
   36.4 KB. This is why five of the six fixes are patchers rather than applied edits.

And the systemic finding underneath all of them: **at least three workers have a repo source
that is not the deployed artefact.** For `ai-health-prober` I could measure the gap (2.3.2
source vs 2.3.1 deployed, registry confirming 2.3.1). For `qnfo-ai` the gap is 4 versions.
For `qnfo-ai-calibration` the deployed `TIER0_WA` has 15 entries against the repo's 7. A
fleet whose canonical source is not its deployment cannot be audited from source alone, and
every source-based claim in this session's predecessor records inherits that error bar.

## E4. Commit ledger (complete, 12 commits)

| commit | artifact |
|---|---|
| `1cca0e95` | `qnfo-ops/docs/REDTEAM-REMEDIATION-2026-09-13.md` |
| `460481db` | `ai-health-prober/worker.js` v2.3.3 |
| `de86d3f4` | `qnfo-ai-calibration/apply-calibration-fix.mjs` v2 |
| `ada30500` | `qnfo-ops/docs/REDTEAM-CLOSEOUT-2026-09-13.md` |
| `4c5540e8` | `qnfo-error-selfheal/worker.js` v1.0.3 |
| `bdbec390` | `qnfo-ops/docs/REDTEAM-ADDENDUM-2026-09-13.md` |
| `9492003c` | `qnfo-ops/docs/REDTEAM-ADDENDUM2-2026-09-13.md` |
| `411d07e1` | `events-radar/apply-date-fix.mjs` |
| `9bde3d4d` | `qnfo-ops/docs/REDTEAM-ADDENDUM3-2026-09-13.md` |
| `e63a2f28` | `qnfo-intent-orchestrator/apply-dispatch-fix.mjs` |
| `fe9db60f` | `qnfo-ops/docs/REDTEAM-ADDENDUM4-2026-09-13.md` |
| this file | addendum 5 |

## E5. Uncertainty

- **The strongest caveat on this entire session:** the read cap forced every source-level
  conclusion to come from partial reads or patchers. Four of the six fixes are anchored on
  verbatim text I could read; the other two are anchored on fragments of files whose
  remaining 75–80% I never saw. An anchor that matches exactly once proves the *target text*
  is as quoted — it does not prove the surrounding file is what I think it is.
- No patcher has been executed by node. No staged fix has been deployed. Nothing here has
  been validated against a running system.
- The repo-staleness finding (E1.1) cuts against my own earlier work: where I inferred router
  behaviour from `qnfo-ai` source, that inference is weaker than I presented it.
- Fix-queue counts move. `MODEL-DEGRADED` tickets are created on a ~2 h scheduler, so the
  24-row `agent_issues` figure is point-in-time.
