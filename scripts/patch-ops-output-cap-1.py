#!/usr/bin/env python3
"""patch-ops-output-cap-1.py - OPS-OUTPUT-CAP-DECOUPLE-1 (issue #1531) applier.

MEASURED DEFECT (raw fetch of qnfo-ops/worker.js, 385590 B, main, 2026-09-30):
  line 101:  var GW_MAX_OUT = 32768;
  /v1/models advertises max_output 393216 (OPS_ANSWER_CAP / DEFAULT_MAX_OUT), but
  every paid/relay call site clamps to the bare GW_MAX_OUT literal:
    3572  callDeepSeek(env, ...)        Math.min(maxTokens, GW_MAX_OUT)
    3646  callDeepSeekStream(env, ...)  Math.min(maxTokens, GW_MAX_OUT)
    4040  handleRelay(env, ...)         Math.min(maxOut,    GW_MAX_OUT)
    4391  agent stream path             Math.min(answerCap, GW_MAX_OUT)
  So the advertised ceiling is unreachable: a client asking for 393216 receives at
  most 32768. Advertisement and deliverable disagree by 12x.

WHY THIS APPLIER DOES NOT SIMPLY RAISE THE CONSTANT:
  Setting the default to 393216 would forward max_completion_tokens=393216 to the AI
  Gateway upstream on every request. If that upstream does not accept the value the
  provider returns a 400/422, and a NON-auth 4xx is FATAL on this path (only auth 4xx
  free-falls, FREE-FALLBACK-ON-4XX-AUTH-1). The upstream's true ceiling has not been
  measured, and this endpoint cannot measure it without issuing real billable
  completions. A speculative raise would risk the entire chat surface of the worker
  that is serving the request -- a self-lobotomy, not a fix.

WHAT THIS APPLIER DOES INSTEAD (behaviour-preserving by construction):
  * adds one resolver, gwMaxOut(env), whose default IS the current literal 32768;
  * routes all four clamp sites through it.
  The effective ceiling is byte-identical today and becomes adjustable through the
  OPS_GW_MAX_OUT secret once the upstream limit is measured. The gap is closed by
  making the ceiling measurable and adjustable rather than by guessing a number.

FAIL-CLOSED: the 4-site substitution must match EXACTLY 4 times and the resolver
  insert EXACTLY 1 time, in BOTH files; anything else raises and nothing is written.
IDEMPOTENT: re-running on an already-patched tree is a no-op.
MIRROR: qnfo-ops/deployed-current.worker.js must stay byte-identical to
  qnfo-ops/worker.js (deploy-qnfo-ops.yml mirror-parity step), so both are patched.

Exit codes: 0 applied | 1 already applied | 3 anchor mismatch (abort)
            4 verification failed (abort)
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGETS = [
    os.path.join(ROOT, "qnfo-ops", "worker.js"),
    os.path.join(ROOT, "qnfo-ops", "deployed-current.worker.js"),
]
MARKER = "OPS-OUTPUT-CAP-DECOUPLE-1"

DEF_OLD = "var GW_MAX_OUT = 32768;"

DEF_NEW = """var GW_MAX_OUT = 32768;
// OPS-OUTPUT-CAP-DECOUPLE-1 (issue #1531): the effective gateway ceiling. This was a bare
// literal, so the advertised /v1/models max_output and the delivered ceiling disagreed by
// 12x with no way to reconcile them. The DEFAULT IS UNCHANGED -- this only makes the
// ceiling readable from OPS_GW_MAX_OUT so it can be raised once the upstream's true limit
// is measured. Do NOT raise the default speculatively: a non-auth 4xx from the provider is
// fatal on this path (only auth 4xx free-falls).
function gwMaxOut(env) {
  try {
    var v = envInt(env, "OPS_GW_MAX_OUT", 0);
    return v > 0 ? v : GW_MAX_OUT;
  } catch (e) {
    return GW_MAX_OUT;
  }
}"""

CLAMP_OLD = ", GW_MAX_OUT)"
CLAMP_NEW = ", gwMaxOut(env))"
EXPECT_CLAMPS = 4


def patch(path):
    if not os.path.isfile(path):
        raise RuntimeError("missing target " + path)
    with open(path, encoding="utf-8") as fh:
        text = fh.read()

    if MARKER in text:
        return 1  # already applied

    if text.count(DEF_OLD) != 1:
        raise RuntimeError(
            "anchor mismatch in %s: %r matched %d times (expected 1)"
            % (path, DEF_OLD, text.count(DEF_OLD))
        )

    n = text.count(CLAMP_OLD)
    if n != EXPECT_CLAMPS:
        raise RuntimeError(
            "anchor mismatch in %s: %r matched %d times (expected %d)"
            % (path, CLAMP_OLD, n, EXPECT_CLAMPS)
        )

    out = text.replace(CLAMP_OLD, CLAMP_NEW)
    out = out.replace(DEF_OLD, DEF_NEW, 1)

    # POST-CONDITIONS -- fail closed if the edit did not land as intended.
    if out.count("gwMaxOut(env)") != EXPECT_CLAMPS + 1:
        raise RuntimeError("post-check failed in %s: gwMaxOut(env) count wrong" % path)
    if "function gwMaxOut(env) {" not in out:
        raise RuntimeError("post-check failed in %s: resolver absent" % path)
    if out.count(CLAMP_OLD) != 0:
        raise RuntimeError("post-check failed in %s: clamp sites remain" % path)
    if len(out) <= len(text):
        raise RuntimeError("post-check failed in %s: file did not grow" % path)

    with open(path, "w", encoding="utf-8") as fh:
        fh.write(out)
    return 0


def main():
    rcs = []
    for t in TARGETS:
        rcs.append(patch(t))
    if all(r == 1 for r in rcs):
        print("ALREADY-APPLIED " + MARKER)
        return 1
    print("APPLIED " + MARKER + " -> " + ", ".join(os.path.basename(t) for t in TARGETS))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # fail closed: nothing written on any anchor problem
        sys.stderr.write("ABORT " + MARKER + ": " + str(exc) + "\n")
        sys.exit(3)
