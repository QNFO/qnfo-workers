#!/usr/bin/env python3
"""BUDGET-AUTO-CONTINUE-1 (2026-09-30) -- qnfo-ops

ROOT CAUSE (measured this session, qnfo-audit.ops_ai_log):
  A turn that exhausts the tool-loop soft budget (300s, canonical per
  OPS-SETTINGS-IMMUTABLE-1) injects BUDGET_EXHAUSTED_DIRECTIVE, the model emits an
  "INCOMPLETE: ..." line, and the turn ENDS.  The remaining work was DROPPED and the
  client had to re-prompt.  707/773 turns in the last 2 days were streamed, averaging
  198s against the 300s budget -> exhaustion is routine, not exceptional.

FIX:
  On an INCOMPLETE ending, enqueue a durable ops_jobs continuation (the async path the
  settings spec itself prescribes: "long or CPU-heavy work goes through the durable
  async path (x-ops-async:1 / POST /v1/jobs), never by reducing these ceilings"),
  carrying the accumulated tool findings so the work resumes server-side with a fresh
  budget.  Chain depth capped at 3 to bound self-continuation.
"""
import sys, pathlib

MARK = "BUDGET-AUTO-CONTINUE-1"
TARGETS = ["qnfo-ops/worker.js", "qnfo-ops/deployed-current.worker.js"]

ANCHOR = "    ctx.waitUntil(logOps(env, logRec));\n    if (isStream) {\n"

INSERT = '''    // BUDGET-AUTO-CONTINUE-1 (2026-09-30): a turn that exhausts the 300s tool-loop soft
    // budget (OPS-SETTINGS-IMMUTABLE-1) ends with an "INCOMPLETE:" line and the remaining
    // work was DROPPED -- the client had to re-prompt. MEASURED 2026-09-30: 707/773 turns
    // streamed, avg 198s against the 300s budget, so exhaustion is routine. Remediation
    // uses the async path the settings spec itself prescribes: enqueue a durable ops_jobs
    // continuation carrying the accumulated tool findings so the work resumes server-side
    // with a fresh budget. Chain depth capped at 3.
    try {
      const _incM = String(content || "").match(/\\bINCOMPLETE:\\s*([^\\n]{0,400})/i);
      if (_incM && !codeMode && !clientHandoff && !(body && (body._autoContinue === true || body.x_ops_async === true))) {
        const _depth = Number(body && body._continueDepth || 0);
        if (_depth < 3) {
          const _summ = toolLog.slice(-12).map(function(t) {
            return "- " + t.name + " " + (t.ok ? "OK" : "FAIL") + ": " + String(t.summary || "").slice(0, 140);
          }).join(String.fromCharCode(10));
          const _resume = "AUTONOMOUS CONTINUATION (depth " + (_depth + 1) + "/3) - the previous interactive run exhausted its 300s tool-loop budget and reported:" + String.fromCharCode(10) + String(_incM[1] || "").trim() + String.fromCharCode(10, 10) + "ORIGINAL INSTRUCTION:" + String.fromCharCode(10) + String(prompt || "").slice(0, 4e3) + String.fromCharCode(10, 10) + "TOOL CALLS ALREADY MADE (oldest first):" + String.fromCharCode(10) + (_summ || "(none recorded)") + String.fromCharCode(10, 10) + "Resume the work NOW from exactly where it stopped. Do not repeat completed steps. Do not narrate. Finish the task and report the completed result with evidence.";
          const _cjob = await createJobFromBody(env, { model: "ops-exec", _autoContinue: true, _continueDepth: _depth + 1, messages: [{ role: "system", content: OPS_SYSTEM_PROMPT + "\\n\\nToday is " + (new Date()).toISOString().slice(0, 10) + " (UTC)." }, { role: "user", content: _resume }] });
          if (_cjob && _cjob.id) {
            content = String(content || "") + String.fromCharCode(10, 10) + "AUTO-CONTINUE: durable job " + _cjob.id + " queued - the remaining work resumes server-side with a fresh budget (poll GET /v1/jobs/" + _cjob.id + ").";
            ctx.waitUntil(logEscalation(env, strategy, UPSTREAM_MODEL, UPSTREAM_MODEL, "budget-auto-continue", "INCOMPLETE turn auto-continued as job " + _cjob.id + " depth " + (_depth + 1)));
          } else if (_cjob && _cjob.error) {
            ctx.waitUntil(logEscalation(env, strategy, UPSTREAM_MODEL, UPSTREAM_MODEL, "budget-auto-continue-failed", String(_cjob.error).slice(0, 300)));
          }
        }
      }
    } catch (eAC) { console.log("auto-continue failed:", eAC && eAC.message || eAC); }
'''

def patch(p: pathlib.Path) -> str:
    src = p.read_text()
    if MARK in src:
        return "already applied"
    n = src.count(ANCHOR)
    if n != 1:
        return "STALE-ANCHOR(anchor count=%d)" % n
    p.write_text(src.replace(ANCHOR, INSERT + ANCHOR, 1))
    return "PATCHED"

def main():
    bad = []
    for t in TARGETS:
        p = pathlib.Path(t)
        if not p.exists():
            bad.append(t + ": MISSING")
            continue
        r = patch(p)
        print("%-14s %s" % (r, t))
        if r.startswith("STALE"):
            bad.append(t + ": " + r)
    if bad:
        print("FAIL-CLOSED: " + "; ".join(bad))
        return 1
    # post-conditions
    for t in TARGETS:
        s = pathlib.Path(t).read_text()
        assert MARK in s, t
        assert "createJobFromBody(env, { model: \"ops-exec\", _autoContinue: true" in s, t
        assert "_continueDepth" in s, t
    print("POST-CONDITIONS OK (%d targets)" % len(TARGETS))
    return 0

if __name__ == "__main__":
    sys.exit(main())
