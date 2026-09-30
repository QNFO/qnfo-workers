#!/usr/bin/env python3
"""TOOL-BUDGET-PENDING-1 applier (fail-closed).

Root cause measured 2026-09-30 on qnfo-ops/worker.js (repo 2.37.31-continuation-inherit,
live 2.37.31-continuation-inherit).

The tool loop has two ceilings: the iteration cap (MAX_TOOL_ITERS / env
OPS_MAX_TOOL_ITERS) and the soft wall-clock deadline (loopDeadline). Both collapse
into one budget predicate:

  chat path : withTools = iter < maxIters && !deadlineHit      (worker.js 4474)
  job path  : withTools = turn < maxTurns                      (worker.js 5373)

When either ceiling trips the loop pushes BUDGET_EXHAUSTED_DIRECTIVE and calls the
model WITHOUT tools. But the branch that consumes the model's tool_calls is guarded
by a DIFFERENT predicate:

  chat : if (toolCalls && iter < maxIters)     <- asymmetric with withTools (4516)
  job  : if (toolCalls && withTools) { ... }   <- correct guard, but NO else (5391)

Two measured, client-visible defects follow:

  1. deadlineHit true while iter < maxIters -> withTools is FALSE (tools withheld,
     directive pushed) yet the tool_calls are still EXECUTED and the loop continues.
     The budget directive is violated and the deadline is overrun.
  2. iter >= maxIters and the model still emits tool_calls -> the guard is false,
     execution falls through to `content = msg0.content`, and the calls are DROPPED
     with no tool_log row, no escalation and no client-visible field. The client gets
     a final answer that silently omits requested work - the observed dead end
     "tool budget exhausted before these could run".

This applier makes the consumption guard IDENTICAL to the budget predicate and adds
an explicit else-branch that RECORDS the unexecuted calls instead of dropping them:
a tool_log row, an escalation, a note appended to the answer, and a machine-readable
pending_tool_calls field on the response.

FAIL-CLOSED: every required anchor must occur EXACTLY once, else exit 3 with no write.
IDEMPOTENT: exits 0 with no change once MARKER is present in the target.
"""
import pathlib
import sys

TARGET = pathlib.Path("qnfo-ops/worker.js")
MARKER = "TOOL-BUDGET-PENDING-1"

# ---------------------------------------------------------------- anchors (old) --
A1 = "var MAX_TOOL_ITERS = 12;"

A2 = (
    '  let finalized = false;\n'
    '  const finalize = /* @__PURE__ */ __name222222(async function() {'
)

A3 = "        if (toolCalls && iter < maxIters) {"

A4 = (
    '        content = String(msg0 && msg0.content || "");\n'
    '        if (!String(content || "").trim() && !toolCalls && withTools && !cacheHit) {'
)

A5 = (
    '    return json({ id: respId, object: "chat.completion", created, model: wanted, '
    'choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: '
    'finishReason || "stop" }], usage: { prompt_tokens: promptTokens, completion_tokens: '
    'completionTokens, total_tokens: promptTokens + completionTokens } });\n'
    '  }, "finalize");'
)

A6 = (
    '        if (!streamedTokens) emitChunk({ role: "assistant", content }, null);\n'
    '        emitChunk({}, finishReason || "stop");'
)

A7 = (
    '      if (toolCalls && withTools) {\n'
    '        const serverCalls = toolCalls.filter(function(tc) {'
)

A8 = (
    '      content = String(msg0 && msg0.content || "");\n'
    '      finishReason = choice && choice.finish_reason || "stop";\n'
    '      if (withTools && finishReason === "length") {'
)

A9 = (
    '      final = { status: "succeeded", response: content, finishReason };\n'
    '      break;'
)

# optional (0 or 1): version bump. A concurrent agent may already have advanced it.
A10 = 'var VERSION = "2.37.31-continuation-inherit";'

# ---------------------------------------------------------------- replacements --
R1 = A1 + r'''
// TOOL-BUDGET-PENDING-1 (2026-09-30): final-round tool calls are RECORDED, never dropped.
var PENDING_TOOLCALLS_NOTE = "\n\n[tool-budget-exhausted] {n} tool call(s) were NOT executed this turn because the tool budget (iteration cap or wall-clock deadline) was exhausted. They are listed in the pending_tool_calls field of this response and can be replayed on the next turn.";
function summarizePendingToolCalls(toolCalls) {
  try {
    return (toolCalls || []).map(function(tc) {
      const fn = tc && tc.function || {};
      let args = fn.arguments;
      if (typeof args !== "string") {
        try { args = JSON.stringify(args); } catch (e) { args = String(args); }
      }
      return { name: String(fn.name || ""), arguments: String(args == null ? "" : args).slice(0, 4e3) };
    }).filter(function(x) { return x.name; });
  } catch (e) {
    return [];
  }
}'''

R2 = (
    '  let finalized = false;\n'
    '  var pendingToolCalls = [];\n'
    '  const finalize = /* @__PURE__ */ __name222222(async function() {'
)

R3 = (
    '        if (toolCalls && !withTools) {\n'
    '          // TOOL-BUDGET-PENDING-1: budget spent, model still emitted tool calls. Do NOT execute\n'
    '          // them (the budget is spent) and do NOT drop them silently (the old defect).\n'
    '          pendingToolCalls = summarizePendingToolCalls(toolCalls);\n'
    '          escalations += pendingToolCalls.length;\n'
    '          toolLog.push({ name: "(budget-exhausted)", ok: 0, summary: "not executed: " + pendingToolCalls.map(function(p) { return p.name; }).join(",") });\n'
    '          ctx.waitUntil(logEscalation(env, strategy, servedBy || UPSTREAM_MODEL, UPSTREAM_MODEL_FB, "tool-budget-exhausted", pendingToolCalls.length + " tool call(s) not executed (budget spent): " + pendingToolCalls.map(function(p) { return p.name; }).join(",")));\n'
    '        } else if (toolCalls && withTools) {'
)

R4 = (
    '        content = String(msg0 && msg0.content || "");\n'
    '        if (pendingToolCalls.length) content = (String(content || "").trim() + PENDING_TOOLCALLS_NOTE.replace("{n}", String(pendingToolCalls.length))).trim();\n'
    '        if (!String(content || "").trim() && !toolCalls && withTools && !cacheHit) {'
)

R5 = (
    '    return json({ id: respId, object: "chat.completion", created, model: wanted, '
    'choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: '
    'finishReason || "stop" }], pending_tool_calls: pendingToolCalls && pendingToolCalls.length ? pendingToolCalls : void 0, '
    'usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: '
    'promptTokens + completionTokens } });\n'
    '  }, "finalize");'
)

R6 = (
    '        if (!streamedTokens) emitChunk({ role: "assistant", content }, null);\n'
    '        if (pendingToolCalls && pendingToolCalls.length) emitChunk({ role: "assistant", content: "", pending_tool_calls: pendingToolCalls }, null);\n'
    '        emitChunk({}, finishReason || "stop");'
)

R7 = (
    '      if (toolCalls && !withTools) {\n'
    '        // TOOL-BUDGET-PENDING-1: record the unexecuted final-round calls, never drop them.\n'
    '        var jobPendingToolCalls = summarizePendingToolCalls(toolCalls);\n'
    '        toolLog.push({ name: "(budget-exhausted)", ok: 0, summary: "not executed: " + jobPendingToolCalls.map(function(p) { return p.name; }).join(",") });\n'
    '      } else if (toolCalls && withTools) {\n'
    '        const serverCalls = toolCalls.filter(function(tc) {'
)

R8 = (
    '      content = String(msg0 && msg0.content || "");\n'
    '      finishReason = choice && choice.finish_reason || "stop";\n'
    '      if (typeof jobPendingToolCalls !== "undefined" && jobPendingToolCalls.length) content = (String(content || "").trim() + PENDING_TOOLCALLS_NOTE.replace("{n}", String(jobPendingToolCalls.length))).trim();\n'
    '      if (withTools && finishReason === "length") {'
)

R9 = (
    '      final = { status: "succeeded", response: content, finishReason, pending_tool_calls: typeof jobPendingToolCalls !== "undefined" && jobPendingToolCalls.length ? jobPendingToolCalls : void 0 };\n'
    '      break;'
)

R10 = 'var VERSION = "2.37.32-tool-budget-pending";'

REQUIRED = [(A1, R1), (A2, R2), (A3, R3), (A4, R4), (A5, R5), (A6, R6), (A7, R7), (A8, R8), (A9, R9)]
OPTIONAL = [(A10, R10)]


def main() -> int:
    if not TARGET.is_file():
        print(f"{MARKER}: target missing: {TARGET}")
        return 3
    text = TARGET.read_text(encoding="utf-8")

    if MARKER in text:
        print(f"{MARKER}: already applied to {TARGET} (no change)")
        return 0

    # validate FIRST (fail-closed, atomic: no write until every required anchor is unique)
    for old, _ in REQUIRED:
        n = text.count(old)
        if n != 1:
            print(f"{MARKER}: FAIL-CLOSED anchor occurrence != 1 (found {n}) for: {old[:80]!r}")
            return 3

    new = text
    for old, rep in REQUIRED:
        new = new.replace(old, rep, 1)
    for old, rep in OPTIONAL:
        if new.count(old) == 1:
            new = new.replace(old, rep, 1)

    if MARKER not in new:
        print(f"{MARKER}: FAIL-CLOSED post-condition missing marker")
        return 3

    TARGET.write_text(new, encoding="utf-8")
    print(f"{MARKER}: patched {TARGET} ({len(text)} -> {len(new)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
