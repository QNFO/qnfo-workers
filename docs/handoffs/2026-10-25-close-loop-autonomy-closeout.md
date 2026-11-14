# Close-loop autonomy — round closeout (2026-10-25)

Status: round budget spent, no behavioural code shipped this round. This file is the
round's only durable artifact. It exists so the next round does not have to re-derive
what was already executed and what was only inferred.

## What was actually executed and observed

- Workspace/stage path works: a file written to the R2 ops-workspace is visible inside
the container as `/workspace/<path>` via the WORKSPACE-STAGE-1 staging step (the tool
answer reported `staged: [{"how":"named","root":"ops-workspace (R2) -> /workspace/..."}]`).
- `exec_attempts` moved by +72 over the observation window.
- Steward code path around line 523 can increment `exec_attempts` without a
corresponding execution.

## What is inferred, not proven

1. The +72 delta is attributed to execution. It is **not** proven to be execution:
   `exec_attempts` is a cumulative counter, so an increment-without-execute writer
   produces the same observable as a real execution.
2. Loop closure (predict -> act -> verify -> record) is intact end to end. Only the
   record step was observed this round; act and verify were not exercised.

## Falsifiable prediction (deadline: 24 h from 2026-10-25)

If the non-executing writer at steward:523 is real and still deployed, then within 24 h
`exec_attempts` will rise by a non-zero amount while the count of execution-completed
events stays flat. That pair of readings is the refutation signal.

If both rise together, or `exec_attempts` does not rise at all, the prediction fails and
the steward:523 suspicion should be dropped rather than re-investigated.

## Next round, in priority order

1. Add the execution-completed counter next to `exec_attempts` so the two are read from
   one row instead of being correlated across queries by hand.
2. Only after (1): gate the steward:523 increment on an execution result, so the counter
   cannot move without one.
3. Do not spend another round on inference about the +72. Either the paired counter in (1)
   reproduces the divergence, or the suspicion is retired.

## Known limitations of this artifact

- Markdown only. It changes no runtime behaviour and cannot make the invariant hold.
- The numbers above are copied from this round's tool output and were not recomputed here;
  they are a snapshot, not a live reading.
- No test asserts anything in this file. Nothing here is machine-checked.
