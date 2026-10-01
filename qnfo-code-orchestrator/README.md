# qnfo-code-orchestrator v0.2.0

## Self-doc (FLEET-SELF-DOC-1)
- **Purpose**: orchestrates the QNFO 100%-cloud autonomous code agent. v0.1.1 is the
  integration slice - reads repos via qnfo-code-agent (GitHub tool server) and executes
  Python in its OWN Cloudflare Container. v0.2.0 adds the LLM plan loop + edit/PR.
- **v0.1.1 (red-team remediation 2026-09-06)**: /task propagates read errors (never a
  silent ok:true on a failed read; HTTP 502 + read.error on failure); honest capability
  label integration-slice (not autonomous-ready - no LLM yet); /exec output caps (64 KiB,
  stdoutTruncated/stderrTruncated); AUDIT_DB cloud_ops_events logging.
- **Capabilities**: github-read (via code-agent), container-exec (own containers binding).
- **Deploy**: cd qnfo-workers/qnfo-code-orchestrator && wrangler deploy
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
- **Model independence + cost**: the ladder is data (`MODEL_LADDER`, comma-separated, cheapest first; default two Workers AI models).
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

### Status (what is and is not true)
- **Verified offline** (`node --no-warnings qnfo-code-orchestrator/test-loop.mjs`, 41 assertions, also run in CI as `code-loop-test`):
  the whole state machine against real SQL and real `python3`, model escalation with error feedback, lease resume + FIFO, policy
  refusals, cron path, prompt-injection delimiting, `wrangler deploy --dry-run` accepts the config and bindings.
- **Dynamic Workers behaviour** was measured on the real `workerd` (wrangler 4.145): JS syntax errors fail the start as
  `Uncaught SyntaxError ... at m.js:L:C` even with unresolvable imports; valid syntax + missing import fails later (`No such module`);
  `globalOutbound:null` blocks fetch. **Local workerd did NOT enforce `limits.cpuMs`** (a top-level `while(true){}` hung), so the
  verifier races a 4 s wall clock and ships OFF. The test's fake `LOADER` replays those real error strings; it is not workerd.
- **NOT verified**: anything against live Cloudflare (this worker, `qnfo-code-agent` and Workers AI model output are not deployed /
  not exercised), real LLM output quality, and CPU-limit enforcement on the real platform.
- **Not built**: GitHub webhook wake-up (CI/review events resuming a task), multi-file edits, a verifier that RUNS tests, the
  `qnfo-code-agent` deploy. Deploy also needs the `OPS_ROUTER_AUTH_KEY` repo secret fixed (issue 212).

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
