# CLOSEOUT — 2026-10-17 — GitHub failure modes + MODEL-FLOOR-1 (session chatbox-closeout-20261017)

Owner directive for this thread, verbatim: *"resolve all github error notifications fleetwide"*, then
*"AUDIT AND REMEDIATE ALL FAILURE MODES AND THEIR ROOT CAUSES. IMPLEMENT AND DEPLOY"*, then
*"CLOSEOUT AND HANDOFF TO SERVER-SIDE"*.

Everything below is deployed, and where it could not be finished the exact blocker, the measurement
that would prove it and the server-side owner are named. Nothing here needs this thread again.

---

## 1. What was broken, and what shipped

### 1.1 Instruments that were reporting the wrong thing (root causes, not symptoms)

| Instrument | Defect | Fix | Receipt |
|---|---|---|---|
| `scripts/model-floor-guard.mjs` | tested the whole raw line, so a model named in a trailing/inline comment or in a price/attribution/cap row counted as a *selection*. 8 of 65 findings were `var VERSION = "..."; // ... probes llama` notes; 11 were rate rows | quote-aware comment stripper + declaration-row detection; lists of ids to call (`PANEL_POOL`, `models: [...]`, `HEDGE_ORDER`) still must be frontier-only | `067a3cc5` |
| `scripts/model-floor-guard.mjs` | entry guard compared `import.meta.url` to `"file://" + argv[1]` (POSIX only) | `pathToFileURL`; module now exports `scan`/`BANNED` so audits reuse the rules instead of a copy | `067a3cc5` |
| `scripts/run-suites.mjs` | same POSIX-only entry guard: on Windows it printed nothing and **exited 0** — a "pass" with zero suites run | `pathToFileURL`; prints `429 of 429 suites` on the owner box now | `067a3cc5` |
| `scripts/workflow-lint.py` | R1 required YAML to parse, and PyYAML silently accepts duplicate top-level keys, so a workflow GitHub rejects passed the lint | new fail-closed `WORKFLOW-HEADER-1`: unknown top-level key, duplicate top-level key, or an unindented non-key line | `37583122` |

The third row is why `model-floor-guard` had been dark: `.github/workflows/model-floor-guard.yml` was
committed with two shell path-header lines above `name:`. PyYAML accepted it, GitHub rejected it, so
the workflow was never registered and every trigger produced a zero-job failure with no log. Restored
in `37583122`; the new lint rule makes the class impossible to commit.

### 1.2 MODEL-FLOOR-1 backlog (the red the restored guard immediately found)

20 workers selected a sub-frontier model at code level. Migration `a4e91793`, role-preserving:

| Role | Replaced | With | Why |
|---|---|---|---|
| panels, judges, pools, ladders | `llama-3.3-70b-instruct-fp8-fast`, `gemma-4-26b`, `qwen3-30b`, `qwen2.5-coder-32b`, `glm-5.2` | `glm-5.3-flash`, `glm-5.3`, `qwen3.8-27b`, `deepseek-v4-flash-0731` | output budgets already cover reasoning |
| **short-budget / strict-JSON sites** (gateway ask 1200 tok, cloud-ops and email-orchestrator 200, calendar-intake 350, social checker, paper-explainer writer) | `llama-3.3-70b` used *because it does not reason* | **`kimi-k2.6` + `reasoning_effort:"none"`** | `glm-5.3-flash` cannot turn reasoning off: qnfo-ai measured it spending a 700-token budget on thought and returning empty |
| qnfo-ai router catalog | the llama `MODELS` row, max-out row, vendor row, `HEDGE_ORDER`, `SECOND_PATH.models`, free-fallback list | removed / repointed | the alias `llama-3.3-70b` still resolves, to `glm-5.3-flash` |

Verified: guard **0 findings / 0 workers** on repo sources, and **0** on live bundles.

### 1.3 What the migration itself broke, found by the gate and fixed

Eight suites had the old ids pinned; fixing them surfaced a genuine conflict — only four
non-writer model families remain in the frontier set (google/meta/alibaba left with their models), so
q08's "one judge per family, no writer family" pool is four models, and the fact-check pool is eight
models over **six** families. Both now say so, with the reason. `CM_REVIEW_MODELS` gained nvidia (the
only family left that shares nothing with the orchestrator's ladder) so the second-reviewer path
survives. `qnfo-calendar-intake` turned out to keep its version in a minified `const V=` alias that
`version-bump-guard` cannot see — a worker that could never auto-deploy; it now declares
`var VERSION` (`7273495c`).

### 1.4 Behaviour, not just policy (`9214442f`)

`ai_call_counters` for 2026-10-16/17 showed **`kimi-k2.6` answering empty as a router leg: 11/11 then
9/18 calls, errors with neurons > 0** — reasoning spent the budget. `ai_model_health` said `ok`
throughout (its probe is a trivial prompt and cannot see a budget-shaped failure). I had promoted that
model to the hedge on family diversity alone. `HEDGE_ORDER` and `SECOND_PATH.models` now name
`deepseek-v4-flash-wa` (42 router calls, 0 errors, 1M ctx, different family). A hedge that cannot
answer is worse than no hedge.

### 1.5 Failures on main that nothing was looking at

- **`personal-companion` was fully red** (30 suites) — another session's `WELLBEING-LOOP-1` added
  `import * as WBW from "./wellbeing-wire.js"`, and the suites load the worker through a base64 **data
  URL**, which cannot resolve a relative specifier. Production was fine (the deploy bundles it:
  verified live `1.29.0-wellbeing-loop`, 912 KB, no relative import in the served bundle). Fixed once
  with `personal-companion/_harness-import-worker.mjs`, which materialises the suite's transformed
  source plus every transitively imported sibling into a temp dir (`51160b75`).
- It had been invisible because PRS-SCOPE-1 validates a PR only on its changed directories and the
  full sweep ran only on a push to main. **`GATE-NIGHTLY-FULL-1`** now runs the full set nightly
  (04:43 UTC).
- **`FLOOR-WATCH-1`**: `model-floor-guard` now scans on every `*/worker.js` push (cheap, no network),
  with the live-bundle sweep daily + weekly + manual. It fired on the very next push and passed.

### 1.6 Verified state at closeout

- `deploy-gate`: success on `dda98a8e`, `30c8136a`; last 8 main runs, **0 failures**
- `model-floor-guard`: success on every push since `FLOOR-WATCH-1`; a manual `--live` dispatch after
  the deploy was **success** (repo + live clean)
- live bundles: 12 standalone hosts inspected individually, **0 model choices** for banned ids; 5 folded
  members ride inside `qnfo-ai-calibration` / `qnfo-research-exec` / `qnfo-cloud-ops` (inspected, clean);
  3 are RETIRED and were never deployed
- notifications: 165 unread → 0 error threads resolved; 1 real failure thread kept open until its run
  went green, then cleared
- QWAV `build-pdfs` red on branch `v2.4`: the branch no longer exists — unrepeatable history, nothing
  to fix

---

## 2. Corrections to my own earlier reporting

- I reported "20 workers deployed". In fact **3 of the 20 are RETIRED directories** (`jnl-referee`,
  `qnfo-calendar-intake`, `qnfo-paper-explainer`) and were never deployed; those edits were dead code.
- I reported "green proves policy compliance, not behaviour parity" and then acted as though the
  measured error rate closed that gap. It does not: it caught a leg that returns *nothing*, and cannot
  catch a substitution that answers fluently and worse. That is item **2828**.
- Two live versions are already past mine (`qnfo-fleet-control 0.33.6-evidence-fallback`,
  `qnfo-research-exec 0.18.26-corpus-leverage`) from the sessions that merged after me; both are
  descendants of my change, which is why they still scan clean.

---

## 3. Handed to server-side (agent_issues, source `chatbox-closeout-20261017`)

| id | item | DoD (falsifiable) |
|---|---|---|
| 2828 | **MODEL-QUALITY-PARITY-1** — nothing measures answer quality after a model change | a judged A/B harness with stored fixtures, reporting a paired win rate against a named threshold, repeatable offline |
| 2829 | **EMPTY-REPLY-RATE-ALERT-1** — health says ok for a model that answers empty under a real budget | fires within one tick when a model exceeds a named empty-reply rate; health probe exercises a reasoning model under a small budget |
| 2830 | **MERGE-BOUNDARY-GATE-1** — a breakage lands on main before any full run | replaying `6c60b59a` must be rejected without a recorded override |
| 2831 | **FOLDED-AND-RETIRED-MODEL-COVERAGE-1** — 8 of the 20 are not standalone scripts | the floor scan reports per deployed artifact and names the folded members in each host; RETIRED dirs cannot be edited unnoticed |
| 2832 | **WINDOWS-SUITE-PARITY-1** — 124 suites red locally, 0 in CI | `run-suites.mjs --all` on Windows yields 0, so a local red means red |
| 2833 | **MODEL-POLICY-SINGLE-SOURCE-1** — the allowed set is copied into workers, pools and 8 suites | one model table consumed by workers and guard; suites assert properties, not ids |

Each carries 2–3 independent paths, per `docs/SLA-AND-PATHS-1.md`.

## 4. Local box change

`git config core.autocrlf false` on `QNFO-WIN/qnfo-workers`. The repo's `.gitattributes` already
mandates `* text=auto eol=lf`; `autocrlf=true` was overriding it for checkouts. This is a workstation
setting, not a repo change.
