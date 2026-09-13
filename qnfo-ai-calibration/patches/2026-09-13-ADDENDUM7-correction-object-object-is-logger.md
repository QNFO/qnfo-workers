# ADDENDUM 7 — CORRECTION: the `[object Object]` prompts are a logger defect, not a client defect

2026-09-13, qnfo-ops. **Withdraws ADDENDUM 6 §4 in full.**

## What ADDENDUM 6 §4 claimed, and why it was wrong

It said: *"the mobile client path is sending malformed prompts, and is still doing it"* — and called
it *"the single most concrete reliability problem found in this session."*

That is wrong on both halves. The client sent fine input. **The logger destroyed the prompt on the
way to D1.** The `response` column on those very rows holds real assistant output.

## Evidence 1 — the responses are real

Rows whose `prompt` is `[object Object],[object Object]`, and what their `response` contains:

| id | ts | response (head) |
|---|---|---|
| `ops-1f73d73fee64af` | 2026-09-13T13:21:49.743Z | "Confirmed: the 22.5% figure is a metric artifact, and the real error class is different. Committing the consolidated finding." |
| `ops-00d58e5aee4cc6` | 2026-09-13T13:21:43.622Z | "## Deliverable — Fleet audit & remediation, 2026-09-13 13:16Z…" |
| `ops-b1235ae1a4a2c8` | 2026-09-13T07:21:38.760Z | "## Deliverable: no PR (structurally impossible), 4 artifacts committed…" |
| `ops-c71635b3a49c84` | 2026-09-13T07:21:37.156Z | "The producer is stamped `source='qnfo-ai-calibration'`…" |
| `ops-803033b6a200ed` | 2026-09-13T07:18:46.253Z | "Definitive. Writing the consolidated record. — SERVER-SIDE CONTINUATION STARTED…" |

These are **this session's own turns**. The conversation worked end to end; only the logged prompt is
garbage. A prompt that was genuinely `[object Object]` could not have produced these responses.

## Evidence 2 — the token count equals the message count

| logged prompt | n |
|---|---|
| `[object Object],[object Object]` | 115 |
| `[object Object]` × 4 | 3 |
| `[object Object]` × 6 | 2 |
| `[object Object]` × 3 | 2 |

One `[object Object]` per message. That is the signature of string-coercing an array of objects —
`String(messages)` or a join — rather than `JSON.stringify`.

## Evidence 3 — it tracks request shape, not user agent

| user agent | rows | `[object Object]` | rate |
|---|---|---|---|
| `chatboxapp/1.23.1` | 542 | 39 | 7.2% |
| `node` | 450 | 0 | **0%** |
| Android `ICL-LX9` | 153 | 34 | 22.2% |
| `okhttp/4.9.2` | 144 | 0 | **0%** |
| `ai-sdk/openai-compatible/2.0.62` | 137 | 37 | 27.0% |
| `qnfo-ops-workflow` | 75 | 0 | **0%** |
| `curl/8.12.1` | 67 | 0 | **0%** |
| Android `ICL-LX9` (2nd) | 41 | 10 | 24.4% |
| `Mozilla/5.0` | 22 | 0 | **0%** |

Every caller that sends a **plain string prompt** logs correctly (`node`, `okhttp`, `curl`,
`qnfo-ops-workflow`, `Mozilla/5.0` — all 0%). Callers that send the **OpenAI-style `messages`
array** lose the prompt. The user agent correlates only because different clients use different
request shapes.

**Same client, both outcomes:** the Android `ICL-LX9` UA appears with 34/153 and 10/41 bad — and a
`mobile` row with that identical UA logged a clean prompt at `2026-09-13T13:19:54.403Z`
("WHAT IS THE MISSION/OBJECTIVE/STRATEGY OF QUNIVERSE? …"). The client sends both a string prompt
and a messages array depending on the call.

## The defect, stated precisely

The request logger coerces the `messages` array with string conversion instead of
`JSON.stringify`, emitting one `[object Object]` per message. Single-shot string prompts are logged
intact; multi-message requests lose the entire prompt content.

## Impact

- `ops_ai_log.prompt` and `ai_queries.prompt` are **unreconstructable for 122 rows**.
- **Any prompt-based analysis is silently biased toward string-prompt clients.** This includes the
  routing analysis in row 1 and the "`ai_queries.source`/`.ua` NULL for 251 of 253 rows — no caller
  identity recorded" note in the verified table. A logger that mangles one field can null another.
- It is the **same class as ADDENDUM 5**: an instrument that loses data without raising an error, so
  the loss is invisible unless you cross-check the field against an independent signal. Here the
  independent signal was the `response` column.

## What is NOT retracted

ADDENDUM 6 §5-6 stand. Mobile `agent-tools` averaging 150,956 ms (n=182) is measured from
`latency_ms`, which does not depend on the prompt column, and the ten >300 s calls are unaffected.
The fleet census (§1) and the two retirements (§2) are independent of this.

## Limits

- **The coercion site is not confirmed.** I have not read the logger — the ops bundle exceeds the
  32,768-character read cap. "String coercion of the messages array" is inferred from the token
  count and the shape correlation, not observed in source.
- 122 is a substring count; a prompt legitimately containing that literal text would be miscounted.
- I did not verify that the `response` column is complete for all affected rows — only that it is
  substantive for six.
- `latency_ms` on those rows (up to 341,613 ms) is the full turn duration including tool rounds, so
  it is not comparable to the 300 s tool-loop budget.
