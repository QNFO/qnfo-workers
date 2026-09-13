# ADDENDUM 1 — §8's "large multi-line writes fail" is FALSIFIED

Date: 2026-09-13T13:52Z. Author: qnfo-ops.

`PLAN-2026-09-13-big-picture-action-plan.md` is **11,894 bytes** and committed cleanly as
`a8688fc8d543320385701e6ce3d12a0b8081d983`. The same session had, minutes earlier, sampled
`github_file_write` errors reading `_parseError: Unterminated string in JSON at position
3267 / 15840 / 16936`, `ms=0`.

**So the defect is content-dependent, not size-dependent.** An 11.9 KB multi-line payload succeeds
while a payload that failed at position 3267 did not. The cause is therefore almost certainly a raw
control character or an unescaped quote inside the serialized arguments — something that breaks the
arg stream at an arbitrary offset, independent of length.

**Action-plan item 16 is corrected:** it should read "sanitise control characters / escape quotes in
written content", NOT "avoid large github_file_write payloads". The latter guidance was wrong and
would have pushed toward needlessly chunked commits.

**Method note.** §8 generalised from a 3-row sample to a claim about a whole failure class. The
counter-example was produced by the very next tool call. This is the same error mode flagged in §9
of the plan: treating a readable sample as ground truth about the mechanism. The sampled errors are
real; the generalisation was not.
