# Closeout — publication pipeline audit + efficiency fixes (2026-10-17)

## Deployed this thread

| worker | version | change | PR |
|---|---|---|---|
| qnfo-research-exec | 0.18.30-ai-backoff-sweep-dup-1 | `aiText` backoff on 3021/3046; `completenessSweep` `INSERT OR IGNORE` | #1395 |
| qnfo-code-orchestrator | 0.18.8-propose-timeout-1 | propose `REASONING_OUT` 32768→16384 | #1397 |

Both `worker.js` and `deployed-current.worker.js` kept byte-identical (drift-gate).

## Root cause of zero publication yield (proven, not assumed)

Papers fail verify with **real numeric mismatches** — arithmetic errors in the LLM
generation (reconcile/ensemble), not false positives and not a `script_no` gate.

Evidence: research row `87c80d14`'s `verification.md` (R2 `qnfo-releases`,
`pipeline/{rowId}/verification.md`) shows the paper states `omega_C = 1.5513e21 s^-1`
but its own inputs (`m_e=9.109e-31, c=2.998e8, ħ=1.055e-34`) compute `1.55207e21`.

The verify gate is correct and must stay closed on these. `script_no` and `undecided`
are log-only — the publish verdict is exactly `adj.mismatches > 0 || !finalGates.ok`
(`worker.js:4298-4358`).

The revise step cannot fix numeric errors (`revise-noop`, `applied=0`, second-model
retry), so papers oscillate `review ↔ revise` (95% return, systemic across dozens of
rows, 8–19 oscillations/row/day) until terminal/parked.

## Remaining tasks (handed to server-side: mem:task_outcome:1792269144949:3a1ddf0b)

1. **Verify-time numeric auto-correction (HIGH — the actual unblock).** Verify already
   computes the correct value; apply it to the paper's stated value and re-verify,
   instead of delegating to a revise step that cannot do arithmetic. Needs a focused
   test (parse a mismatched claim → rewrite the stated value → re-verify) and careful
   number-format matching.
2. **OverflowError checker → text-fallback (LOW).** A throwing claim-script currently
   counts as a failed claim; treat it as unverified (text-level recomputation).
3. **Invalid-regex crash from LaTeX in section headings (LOW).** Heading text with
   `\lceil`/`$q` built into a regex throws "Invalid regular expression" (~2/6h).

## Rejected — do not re-attempt

- **`complete → publish`**: `complete` means "finished writing" (`PAPER-COMPLETE-1`),
  not "done"; the correct forward path is `complete → review → verify → publish`.
  Publishing from `complete` skips review+verify.
- **`research_review_gate: enforce → measure`**: review `block=N` findings are real and
  persist across cycles (e.g. `block=6 → 6 → 3`), not spurious.

## Key facts for the next session

- `script_no` / `undecided` never gate; the "0 mismatches / script_no=5" reading in
  earlier audits was a stale `substr(MAX(text))` artifact — live adjudications show
  `mismatches=9`, `mismatches=2`.
- D1: `research_queue` + `cloud_ops_events` in `qnfo-audit`; papers in `living-paper`.
- Deploy: research-exec via `scripts/direct_content_deploy.py` (PUT `/content`,
  preserves bindings/schedules); code-orchestrator is a **container worker** — deployed
  only via `deploy-code-orchestrator.yml` (merge-triggered), the second path skips it.
- Concurrent actor consolidated `agent_issues` D1 timestamp triggers 10→2
  (`9f3fa39b`) to clear the trigger-depth deadlock.
