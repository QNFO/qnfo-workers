# qnfo-code-orchestrator v0.3.0

## Self-doc (FLEET-SELF-DOC-1)
- **Purpose**: orchestrates the QNFO 100%-cloud autonomous code agent. v0.1.1 is the
  integration slice - reads repos via qnfo-code-agent (GitHub tool server) and executes
  Python in its OWN Cloudflare Container. v0.2.0 adds the LLM plan loop + edit/PR.
- **v0.1.1 (red-team remediation 2026-09-06)**: /task propagates read errors (never a
  silent ok:true on a failed read; HTTP 502 + read.error on failure); honest capability
  label integration-slice (not autonomous-ready - no LLM yet); /exec output caps (64 KiB,
  stdoutTruncated/stderrTruncated); AUDIT_DB cloud_ops_events logging.
- **Capabilities**: github-read (via code-agent), container-exec (own containers binding).
- **Deploy**: see the Deploy section below.
- **Canonical source**: QNFO/qnfo-workers/qnfo-code-orchestrator
- **Secrets** (fail-closed): ORCH_TOKEN (auth), CODE_AGENT_KEY (call code-agent).
- **Bindings**: AUDIT_DB (qnfo-audit cloud_ops_events).

## v0.2.0: durable code-task loop (NOT DEPLOYED; see "Status" below)
The server-side counterpart of a Claude Code cloud session: **compute is disposable, state is durable.**
One task = one file edit, verified deterministically, delivered as a **PR (never to main)**.

```
queued --read--> propose --> verify --(fail, attempts<3)--> propose  (NEXT model on the ladder, error fed back)
                                |--(ok)--> commit --> pr_open
                                |--(3 failed attempts | no verifier | no-op proposal | file too large)--> needs_human
```
- **State**: D1 `code_tasks` (migration `migrations/2026-10-01-code-tasks.sql`; the worker also creates it lazily). Every step is
  bounded and idempotent; a crashed isolate's 90 s lease expires and the next tick resumes the task. FIFO claim.
- **Continuation without a human**: cron `*/10 * * * *` (the CRON-RATE-CEILING-1 floor) runs up to 8 steps / 20 s per tick.
- **Model independence + cost**: the ladder is data (`MODEL_LADDER`, comma-separated, cheapest first; default: qwen2.5-coder-32b, then the frontier coders kimi-k2.7-code and glm-5.3 on a failed attempt; LADDER-FRONTIER-1).
  A failed verify escalates one rung and feeds the verifier error back. Queue cap 20, 3 attempts, size caps.
- **Verifiers** (deterministic; a task with no verifier ends `needs_human`, never an unverified PR):
  `.py` compile in the Cloudflare Container; `.json` parse; `.md`/`.txt` size-sanity (0.5x-2x, stops truncated rewrites);
  `.js`/`.mjs` syntax via **Dynamic Workers** (`env.LOADER`, `globalOutbound:null`) **only when `JS_VERIFY=dynamic`** (default `off`).
- **Policy**: refuses `.github/`, `wrangler.toml`, `deploy-targets.txt`, `.env*`, path traversal; never commits to `main`/`master`;
  repo file content is passed as delimited UNTRUSTED DATA.

| Route | Method | Auth | Effect |
|---|---|---|---|
| /v1/tasks | POST | ORCH_TOKEN | enqueue `{repo, path, goal}` -> 202 `{id}` (400 policy, 429 queue full) |
| /v1/tasks, /v1/tasks/:id | GET | ORCH_TOKEN | list / read a task (no file contents) |
| /v1/tick | POST | ORCH_TOKEN | run steps now `{maxSteps, budgetMs}` |
| /v1/probe/dynamic-cpu | POST | ORCH_TOKEN | measure whether the platform enforces `limits.cpuMs` (gate for `JS_VERIFY=dynamic`) |

### v0.2.1: pull-based PR publishing (no PR-write credential needed)
Neither this worker nor a session holds a GitHub PR-write credential, and a session cannot mint one. With `PR_PUBLISH_MODE=pull`
(set in `wrangler.toml`) the `commit` step does not call code-agent: it stores a unified diff in `ctx.patch` and sets
`status='ready_to_publish'` (new status; `step='done'`). `.github/workflows/code-task-publish.yml` then PULLS those rows from D1
(same `CLOUDFLARE_*` secrets as `fleet-autodeploy`), applies each patch on a fresh `codeagent-*` branch off `main` with the built-in
`GITHUB_TOKEN`, opens a PR, and records `status='published'` + `pr_url`. It runs on `workflow_run` of `mirror-sync` /
`fleet-autodeploy` plus `workflow_dispatch` (GitHub `schedule` never fires on this repo). It never merges. A patch that no longer
applies (main moved) becomes `publish_failed` with `last_error` and the run goes red. Re-runs are idempotent (compare-and-set claim,
existing PR for the branch is adopted). Offline selftest (no network, real git + sqlite3, also a workflow step):
`python3 scripts/code-task-publish.py --selftest` covers no tasks, patch applies, patch fails, duplicate publish. Without
`PR_PUBLISH_MODE=pull` the original code-agent path (`pr_open`) is unchanged. Statuses: `queued | ready_to_publish | publishing | published | publish_failed | pr_open | needs_human | failed`.
Only a real run verifies: D1 REST access from Actions, `gh pr create` with `GITHUB_TOKEN` (repo setting "Allow GitHub Actions to create pull requests" must be on), and that PRs from `GITHUB_TOKEN` do not auto-start CI.

### v0.3.0: patch mode for large files (PATCH-MODE-1) and self-gated JS verification (JS-VERIFY-AUTO-1)
Every deployed `worker.js` is larger than the 60,000-char whole-file cap, so until 0.3.0 the loop could not edit any worker.
- **Patch mode.** The model sees a window of the file and answers with exact `<<<<<<< SEARCH / ======= / >>>>>>> REPLACE` blocks;
  the worker applies them to the full file. Each SEARCH must occur exactly once in the window, edits may not overlap, at most 8.
  A wrong SEARCH is a failed attempt whose error is fed back to the next rung of the ladder.
- **Which mode.** With an `anchor` (a verbatim string near the edit, at most 300 chars, exactly one occurrence): patch mode, window =
  about 24,000 chars of whole lines around the anchor, files up to 900,000 chars. Without one: up to 12,000 chars whole-file,
  12,000 to 24,000 patch mode over the whole file, 24,000 to 60,000 whole-file as before, above 60,000 refused (`needs an anchor`).
- **Anchor intake.** `POST /v1/tasks {repo, path, goal, anchor}`, or a second opt-in line in the issue: `code-anchor: <text>`.
- **Worker hygiene done by the loop.** For `.js`/`.mjs` the single `VERSION = "x.y.z..."` declaration is bumped to
  `x.y.(z+1)-codeagent` when the edit left it alone; when `<dir>/deployed-current.worker.js` equals `<dir>/worker.js`, the same
  hunks are emitted for the mirror. `scripts/code-task-publish.py` accepts exactly the task path plus that mirror, nothing else.
- **Patch shape.** A minimal unified diff (Myers over lines, 3 context lines), so it still applies after unrelated lines of the file
  moved on main; a file without a final newline or a change over 600 lines falls back to the whole-file patch.
- **`JS_VERIFY=auto`** (the shipped setting). Once a day the cron runs the CPU-limit probe and stores the result in
  `ops_config.code_orchestrator_dynamic_cpu`. The JS syntax verifier is on only while that row says `enforced: true` and is younger
  than 8 days; otherwise `.js` tasks end `needs_human` as before. `/health` reports `js_verify: auto-on | auto-off`.
  It proves SYNTAX only; CI on the pull request is the behaviour gate, and nothing here merges.
- **Limits that remain.** One file (plus its mirror) per task; no verifier that runs tests; the window must contain everything the
  model needs; no self-merge.

### Status (what is and is not true)
- **Verified offline** (`node --no-warnings qnfo-code-orchestrator/test-loop.mjs`, 35 assertions, also run in CI as `code-loop-test`):
  the whole state machine against real SQL and real `python3`, model escalation with error feedback, lease resume + FIFO, policy
  refusals, cron path, prompt-injection delimiting, `wrangler deploy --dry-run` accepts the config and bindings.
- **Dynamic Workers behaviour** was measured on the real `workerd` (wrangler 4.145): JS syntax errors fail the start as
  `Uncaught SyntaxError ... at m.js:L:C` even with unresolvable imports; valid syntax + missing import fails later (`No such module`);
  `globalOutbound:null` blocks fetch. **Local workerd did NOT enforce `limits.cpuMs`** (a top-level `while(true){}` hung), so the
  verifier races a 4 s wall clock and ships OFF. The test's fake `LOADER` replays those real error strings; it is not workerd.
- **Verified live (2026-10-01)**: this worker is deployed (`GET /health` reports version 0.2.4 with the AI, AUDIT_DB and container bindings) and one task, `ct_smoke20261001a`, ran read -> propose -> verify -> ready_to_publish -> published on live Cloudflare and was delivered as pull request 297 through `code-task-publish.yml`.
- **Verified live (2026-10-01)**: this worker is deployed (`GET /health`) and tasks `ct_smoke20261001a` and `ct_ge5mddlm9z6915` ran
  read -> propose -> verify -> ready_to_publish -> published on live Cloudflare and were delivered as pull requests 297 and 368
  through `code-task-publish.yml`. `ct_readme20261001b` failed live and exposed FENCE-IN-FILE-1 (fixed in 0.2.6).
- **NOT verified live**: patch mode and `JS_VERIFY=auto` (0.3.0, offline tests only), real LLM output quality beyond one-line edits,
  and CPU-limit enforcement on the real platform (the worker now measures it itself; see below).
- **Not built**: GitHub webhook wake-up (CI/review events resuming a task), multi-file edits, a verifier that RUNS tests, the
  `qnfo-code-agent` deploy. Deploy must use a wrangler workflow (this worker has `[[containers]]` + a Durable Object; the canonical `/content` PUT destroys those bindings, see `qnfo-containers-pilot/RETRIGGER-4-DO-BINDING-LOST.md`), and `qnfo-code-agent` needs a GitHub credential with PR-write.

## Routes (v0.1.1, unchanged)
| Route | Method | Auth | Effect |
|---|---|---|---|
| /health | GET | none | liveness + version |
| /task | POST | ORCH_TOKEN | code-agent repo/read + own-container python verify; 502 + read.error on read failure |
| /exec | POST | ORCH_TOKEN | own-container python -c (output-capped) |

## Claim-sheet
- claim: own-container python exec works; evidence: /task exec exitCode 0 + stdout
  'orchestrator-container-ok'; confidence: High (verified same-turn at deploy).
- claim: github-read integration works + errors propagate; evidence: /task read.ok true on
  real file; 502 + read.error on missing file; confidence: High (verified same-turn).
- claim: capabilities label honest; evidence: /health integration-slice, no autonomous-ready;
  confidence: High.

## Roadmap
- v0.2.0: LLM plan loop (DeepSeek via AI Gateway for plan/verdict, kimi for cheap rounds),
  code-agent /v1/repo/edit + create_pr, bounded iterate until container verify passes.

## Deploy
First and subsequent deploys use `.github/workflows/deploy-code-orchestrator.yml` (wrangler 4, this worker only), on push to main touching `qnfo-code-orchestrator/**` or via workflow_dispatch. The canonical `/content` route cannot create bindings, containers or DO classes. The job runs `node --check`, `test-loop.mjs` and `scripts/mirror-guard.py`, deploys, polls `/health` until VERSION equals worker.js, and writes a `deploy.wrangler` row to `cloud_ops_events` through the D1 REST API. It uses the existing `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets and sets none. `ORCH_TOKEN` stays unset (fail-closed). The cron runs every 10 minutes (144 per day).

## Keyless read (0.2.2, KEYLESS-READ-1)

The loop's read step used to call `qnfo-code-agent` with `CODE_AGENT_KEY`, which is deliberately unset, so every task failed before
reaching a model. `readRepoFile` now uses the code-agent only when that key exists and otherwise reads the file from GitHub's public
raw endpoint (`raw.githubusercontent.com/QNFO/<repo>/main/<path>`). The owner is pinned to `QNFO`, the repo name and path are
validated (no traversal, no absolute paths, no query strings) before any request, and the size cap is unchanged. With the pull-based
publisher, the loop now needs no GitHub credential at all, in either direction.

## Issue intake (0.2.4)

The Cloudflare equivalent of the Stop-hook re-prompt. Each cron tick scans open `agent_issues` rows whose description carries an explicit opt-in line:

    code-task: repo=qnfo-workers path=docs/some-file.md

Each such issue becomes one queued code task (goal = `[issue #N] <title>` plus the description). It is deduped by the `[issue #N]` prefix, at most two are created per tick, and a refused marker (protected path, bad repo) is logged once per isolate. Nothing is inferred from prose, and the PR is still opened by `code-task-publish` and never merged by this worker.
