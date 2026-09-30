#!/usr/bin/env python3
"""TITLE-PROMOTE-1 -- q08-signal-engine: stop discarding gate-clean essays.

MEASURED (q08.org/api/runs, 2026-09-30): engine_runs 190-204 = 15 consecutive
cron cycles, 0 pieces published, every run `gate_failed`; 11 of 15 report
"no H1 title". Last publish: run 189, 2026-09-29 12:02Z.

DEFECTS
  D1 instruction conflict. gate() requires a line matching /^#\\s+/m and
     Q08_DIRECTIVE says "Output: valid Markdown, H1 title first" -- but the
     corrective-retry prompt (the path that decides the FINAL draft whenever the
     first attempt fails any check) says "continuous prose, NO section headers".
     The writer obeys literally and drops the H1 together with the H2s.
  D2 fallback is error-driven, not compliance-driven. COMPOSE_MODELS lists
     nemotron-3-120b first and compose() returns its first draft longer than 200
     chars with the gate unchecked, so gpt-oss-120b -- which does emit a valid
     H1 (run 202 failed only the framing gate) -- is consulted only when
     nemotron THROWS. The one publish in the window (run 189) is exactly such a
     throw-and-fallback run.

FIX (deterministic; invents no content)
  C1 normalizeDraft(): promote an unambiguous leading title line to "# ...".
  C2 compose(): normalise every draft, prefer the first draft that passes
     gate(), fall back to the longest draft. Compliance-driven fallback.
  C3 corrective retry: scope the header ban to '##' and restate the H1.
  C4 divergence priming: label the injected skeletons as H2/H3 shapes.
  C5 VERSION 0.7.31-urlsafe -> 0.7.32-titlepromote (deploy verification marker).

Idempotent: a re-run prints "already applied" and exits 0. Any missing anchor
exits non-zero so the applier's PARTIAL-APPLY-1 revert fires instead of a
half-written patch.
"""
import sys
from pathlib import Path

MARKER = "TITLE-PROMOTE-1"
ROOT = Path(__file__).resolve().parent.parent
TARGETS = ["q08-signal-engine/worker.js", "q08-signal-engine/deployed-current.worker.js"]

NORMALIZE_JS = r'''
// TITLE-PROMOTE-1 (v0.7.32). 11 of the 15 gate_failed cycles (engine_runs 190-204)
// failed on "no H1 title": gate() requires /^#\s+/m while the corrective-retry
// prompt asked for "NO section headers", which the writer applied to the H1 too.
// Promote an unambiguous leading title line instead of discarding a complete essay.
// Deterministic: invents nothing, rewrites at most one line, idempotent.
function normalizeDraft(text) {
  if (!text) return text;
  var t = String(text).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (/^#\s+\S/m.test(t)) return t;
  var lines = t.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    if (/^#{2,6}\s/.test(line)) break;
    if (/^(worth your time:|[-*_]{3,}\s*$)/i.test(line)) break;
    if (line.length <= 100 && !/[.!?]$/.test(line) && line.split(/\s+/).length <= 14) {
      lines[i] = "# " + line;
      return lines.join("\n");
    }
    break;
  }
  return t;
}
'''

EDITS = [
    # C5 -- version marker, verified after deploy via GET /health
    ("var VERSION = \"0.7.31-urlsafe\";",
     "var VERSION = \"0.7.32-titlepromote\";", 1),

    # C1 -- insert the normaliser immediately before the gate
    ("function gate(text) {\n  // Enforce LONG-FORM PROSE with a hook, not lists:",
     NORMALIZE_JS + "\nfunction gate(text) {\n  // Enforce LONG-FORM PROSE with a hook, not lists:", 1),

    # C2a -- collect the best draft instead of returning the first long one
    ("async function compose(env, prompt) {\n  var lastErr;\n  for (var modelId of COMPOSE_MODELS) {",
     "async function compose(env, prompt) {\n  var lastErr;\n"
     "  // TITLE-PROMOTE-1: compliance-driven fallback -- keep the best draft across\n"
     "  // models rather than returning the first long-enough one gate-unchecked.\n"
     "  var best = null;\n"
     "  for (var modelId of COMPOSE_MODELS) {", 1),

    # C2b -- normalise + gate each draft, prefer a passing one
    ("      if (text && text.length > 200) return { text, model: modelId };\n    } catch (e) {\n      lastErr = e;\n    }\n  }\n  throw new Error(\"all compose models failed: \"",
     "      if (!text || text.length <= 200) continue;\n"
     "      var norm = normalizeDraft(text);\n"
     "      var g = gate(norm);\n"
     "      if (g.ok) return { text: norm, model: modelId };\n"
     "      if (!best || norm.length > best.text.length) best = { text: norm, model: modelId, problems: g.problems };\n"
     "    } catch (e) {\n      lastErr = e;\n    }\n  }\n  if (best) return best;\n  throw new Error(\"all compose models failed: \"", 1),

    # C3 -- the retry must not ban the H1 (2 sites: generate() and POST /regen)
    ("continuous prose, NO section headers",
     "continuous prose, no '##' section headers, but KEEP exactly one '# ' H1 title line as the FIRST line of the essay", 2),

    # C4 -- divergence priming is a heading-shape hint, never a title shape
    ("RECENT STRUCTURES ON THIS SITE (BANNED PATTERNS",
     "RECENT SECTION SKELETONS ON THIS SITE (BANNED PATTERNS", 1),
    ("diverge from every one) ---",
     "diverge from every one; these are H2/H3 heading shapes, never title shapes) ---", 1),
]


def apply_file(rel):
    p = ROOT / rel
    if not p.exists():
        print("TITLE-PROMOTE-1 %s: MISSING" % rel)
        return "missing", None
    src = p.read_text(encoding="utf-8")
    if MARKER in src:
        print("TITLE-PROMOTE-1 %s: already" % rel)
        return "already", None
    out = src
    for old, new, expect in EDITS:
        n = out.count(old)
        if n != expect:
            raise SystemExit(
                "ANCHOR-MISMATCH %s: expected %d occurrence(s) of %r, found %d"
                % (rel, expect, old[:70], n))
        out = out.replace(old, new)
    p.write_text(out, encoding="utf-8")
    print("TITLE-PROMOTE-1 %s: applied (%+d bytes)" % (rel, len(out) - len(src)))
    return "applied", len(out) - len(src)


def main():
    res = {}
    for t in TARGETS:
        state, _ = apply_file(t)
        res[t] = state
    if any(v == "missing" for v in res.values()):
        return 1
    if all(v == "already" for v in res.values()):
        print("TITLE-PROMOTE-1: already applied")
        return 0
    print("TITLE-PROMOTE-1: patched %d file(s)" % sum(1 for v in res.values() if v == "applied"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
