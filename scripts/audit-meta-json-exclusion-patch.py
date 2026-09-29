#!/usr/bin/env python3
"""AUDIT-META-JSON-EXCLUSION-1 -- fail-closed, idempotent patcher for qnfo-ops/worker.js.

Closes three open agent_issues at their source:

  P1  AUDIT-META-JSON-TRUNCATION-1 (issue 1483)
      snippet(v, n) returned JSON.stringify(v).slice(0, n). A slice of a JSON document
      is malformed JSON, and every json_extract() consumer over cloud_ops_events.meta
      crashes on it. Worse, the 600-char call site serialises {args, resultOk, error, ms}
      in that order, so for any long-argument tool the `error` field was truncated away
      ENTIRELY -- which is also why tool_error_exclusions (instr() over meta) could never
      match, i.e. the same defect is the upstream cause of the exclusion-blind class.
      Fix: per-field truncation (top-level keys survive) plus a VALID JSON envelope when
      the payload still exceeds the limit.

  P2  ISSUE-LEDGER-EXCLUSION-BLIND-1 (issue 1484)
      The telemetry self-heal loop only visits tools present in the CURRENT window, so an
      open issue_ledger entry is never revisited once its tool goes quiet or its whole
      error class becomes excluded -- it stays open forever with no resolution path.
      Fix: sweep the remaining open telemetry-self-heal entries and resolve any whose tool
      is not being filed in this pass.

  P3  AFFIRM-GUARD-VETO-2 (issue 1482, residual arm)
      The destructive-write gate in d1Write() authorised on the bare tokens
      'please'/'send it'/'affirm' with no refusal polarity, making it effectively vacuous.
      Fix: intent-bearing tokens only, plus adjacency-scoped refusal veto, mirroring the
      drain gate in triggerBacklog().

Fail-closed contract: a missing or ambiguous anchor aborts before any write; source and
deployed-current mirror must be byte-identical first; re-running is a no-op.
"""
import pathlib
import sys

WORKER = "qnfo-ops/worker.js"
MIRROR = "qnfo-ops/deployed-current.worker.js"
OLD_VER = 'var VERSION = "2.37.28-affirm-veto";'
NEW_VER = 'var VERSION = "2.37.29-meta-json-exclusion";'
MARKERS = [
    "AUDIT-META-JSON-TRUNCATION-1",
    "ISSUE-LEDGER-EXCLUSION-BLIND-1",
    "AFFIRM-GUARD-VETO-2",
]


def die(msg):
    print("::error file=%s::%s" % (WORKER, msg))
    sys.exit(1)


ANCHOR_A = '''function snippet(v, n) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s ? s.slice(0, n || 2e3) : "";
}'''

REPL_A = '''function snippet(v, n) {
  const lim = n || 2e3;
  // AUDIT-META-JSON-TRUNCATION-1 (issue 1483): a raw slice() of a JSON.stringify()
  // result is malformed JSON and crashes every json_extract() consumer. Object
  // payloads are now truncated PER FIELD so top-level keys survive -- args-first
  // truncation used to eat `error` entirely at 600 chars, which is also why
  // tool_error_exclusions could never match. Output is always parseable.
  if (typeof v === "string") return v.slice(0, lim);
  if (v === null || v === void 0) return "";
  if (typeof v !== "object") return String(v).slice(0, lim);
  const out = {};
  for (const k of Object.keys(v)) {
    const raw = v[k];
    if (raw === void 0) continue;
    const rs = typeof raw === "string" ? raw : JSON.stringify(raw);
    if (rs === void 0) continue;
    out[k] = rs.length > 240 ? rs.slice(0, 240) + "...[truncated]" : raw;
  }
  const s = JSON.stringify(out);
  if (!s) return "";
  if (s.length <= lim) return s;
  return JSON.stringify({ _truncated: true, _len: s.length, head: s.slice(0, Math.max(0, lim - 160)) });
}'''

ANCHOR_B = '''  var affirmed = /(yes|please|confirm|go ahead|send it|do it|execute|proceed|approved|affirm)/i.test(String(userText || ""));'''

REPL_B = '''  // AFFIRM-GUARD-VETO-2 (issue 1482 residual): the previous predicate authorised on the
  // bare tokens 'please'/'send it'/'affirm', so the destructive-write gate was vacuous.
  // Intent-bearing tokens only, plus adjacency-scoped refusal polarity, mirroring the
  // drain gate in triggerBacklog().
  var _ut = String(userText || "");
  var _veto = /(?:do\\s+not|don'?t|never|no|stop|cancel|abort|hold\\s+off|not\\s+yet)\\s+(?:the\\s+|a\\s+|any\\s+)?(?:write|drop|delete|update|alter|truncate|execute|run|proceed|apply|migrate)\\b/i.test(_ut);
  var affirmed = !_veto && /\\b(?:yes|yep|yeah|confirm|confirmed|approve|approved|authorized|authorised|go\\s+ahead|do\\s+it|run\\s+it|proceed|execute)\\b/i.test(_ut);'''

ANCHOR_C = '''    }
  } catch (e) {
    out.error = String(e && e.message || e);
  }
  return out;'''

REPL_C = '''    }
    // ISSUE-LEDGER-EXCLUSION-BLIND-1 (issue 1484): the per-tool loop above only visits
    // tools present in the CURRENT window, so an open entry is never revisited once its
    // tool goes quiet or its whole error class becomes excluded -- it stays open forever.
    // Sweep the remaining open telemetry-self-heal entries and resolve any whose tool is
    // not being filed in this pass.
    try {
      const _openL = await env.QNFO_AUDIT.prepare("SELECT fingerprint, title FROM issue_ledger WHERE status = 'open' AND category = 'telemetry-self-heal'").all();
      const _rows = (_openL && _openL.results) || [];
      let _swept = 0;
      for (const _orow of _rows) {
        const _m = /^\\[self-heal\\] tool (\\S+) failing/.exec(String(_orow.title || ""));
        if (!_m) continue;
        if (out.rates && Object.prototype.hasOwnProperty.call(out.rates, _m[1])) continue;
        await env.QNFO_AUDIT.prepare("UPDATE issue_ledger SET status = 'resolved', resolved_at = ?1, updated_at = ?1, resolution_note = 'ISSUE-LEDGER-EXCLUSION-BLIND-1 sweep: tool absent from the current window or fully excluded' WHERE fingerprint = ?2").bind((/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace("T", " "), _orow.fingerprint).run();
        _swept++;
      }
      if (_swept) out.swept = _swept;
    } catch (eS) {
      out.sweepError = String(eS && eS.message || eS);
    }
  } catch (e) {
    out.error = String(e && e.message || e);
  }
  return out;'''


def apply(src, anchor, repl, label):
    n = src.count(anchor)
    if n != 1:
        die("%s: anchor count %d (expected 1); refusing to patch" % (label, n))
    return src.replace(anchor, repl, 1)


def main():
    p = pathlib.Path(WORKER)
    q = pathlib.Path(MIRROR)
    if not p.exists():
        die("missing %s" % WORKER)
    if not q.exists():
        die("missing %s" % MIRROR)
    src = p.read_text()
    mir = q.read_text()
    if src != mir:
        die("source (%d B) and deployed-current mirror (%d B) differ; refusing to patch"
            % (len(src), len(mir)))
    before = len(src)
    if all(m in src for m in MARKERS):
        print("already-patched: all %d markers present; no change" % len(MARKERS))
        print("bytes: %d -> %d" % (before, before))
        print("version: %s" % NEW_VER)
        return 0
    if NEW_VER in src:
        die("version %s already present but markers are not; refusing to patch" % NEW_VER)
    if OLD_VER not in src:
        die("expected version anchor %r not found; refusing to patch" % OLD_VER)

    src = apply(src, ANCHOR_A, REPL_A, "P1 AUDIT-META-JSON-TRUNCATION-1")
    src = apply(src, ANCHOR_B, REPL_B, "P3 AFFIRM-GUARD-VETO-2")
    src = apply(src, ANCHOR_C, REPL_C, "P2 ISSUE-LEDGER-EXCLUSION-BLIND-1")
    src = src.replace(OLD_VER, NEW_VER, 1)

    missing = [m for m in MARKERS if m not in src]
    if missing:
        die("post-patch marker check failed, missing: %s" % ",".join(missing))
    if "openInventory" in src and False:
        pass
    if src.count("function snippet(v, n)") != 1:
        die("snippet() multiplicity changed; refusing to write")

    p.write_text(src)
    q.write_text(src)
    after = len(src)
    if p.read_text() != q.read_text():
        die("post-write parity lost; refusing")
    print("bytes: %d -> %d" % (before, after))
    print("version: %s" % NEW_VER)
    for m in MARKERS:
        print("marker %s: %d" % (m, src.count(m)))
    print("snippet_json_safe: %d" % src.count("_truncated"))
    print("ledger_sweep: %d" % src.count("ISSUE-LEDGER-EXCLUSION-BLIND-1 sweep"))
    print("PATCH_APPLIED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
