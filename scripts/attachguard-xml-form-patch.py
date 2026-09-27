#!/usr/bin/env python3
"""ATTACHGUARD-XML-FORM applier (fail-closed).

WHY: qnfo-ops/worker.js attachmentGuard() probes the LEGACY `FILE_CONTENT=` key=value
form. The Chatbox client sends the XML wrapper form instead:

    <ATTACHMENT_FILE>
    <FILE_SIZE>10.0KB</FILE_SIZE>
    <FILE_CONTENT>
    </FILE_CONTENT>
    </ATTACHMENT_FILE>

so `m.indexOf("FILE_CONTENT=")` returns -1, the guard returns "" and the missing-bytes
warning never reaches the model. Evidence (ops_ai_log): 34/34 attachment-bearing prompts
carry the XML form; the guard has never fired.

Also fixes telemetry_report passing the whole `args` object as `hours`
(parseInt({hours:6},10) -> NaN -> || 24): the window was always 24h.

FAIL-CLOSED: aborts (exit 3) unless the pre-patch VERSION matches, every anchor occurs
exactly once, and `node --check` passes on the result.
IDEMPOTENT: exits 0 with no change if the post-patch VERSION is already present.
"""
import pathlib
import subprocess
import sys

SRC = pathlib.Path("qnfo-ops/worker.js")
MIRROR = pathlib.Path("qnfo-ops/deployed-current.worker.js")

PRE = 'var VERSION = "2.37.12-fm-stream-reasoning";'
POST = 'var VERSION = "2.37.13-attachguard-xml-form";'

TEL_ANCHOR = "res = await telemetryReport(env, args);"
TEL_FIXED = "res = await telemetryReport(env, args && args.hours);"

LEGACY_ANCHOR = 'var ki = m.indexOf("FILE_CONTENT=");\n  if (ki < 0) return "";'
LEGACY_FIXED = 'var ki = m.indexOf("FILE_CONTENT=");\n  if (ki < 0) return attachmentGuardXml(m);'

GUARD_ANCHOR = "function attachmentGuard(text) {"

XML_FN = '''function attachmentGuardXml(text) {
  var m = String(text || "");
  var maxSize = 0, sp = 0;
  while ((sp = m.indexOf("<FILE_SIZE>", sp)) >= 0) {
    sp += 11;
    var sj = sp;
    while (sj < m.length && m.charAt(sj) !== "<") sj++;
    var sn = parseFloat(m.slice(sp, sj));
    if (sn > maxSize) maxSize = sn;
  }
  if (maxSize <= 0) return "";
  var ws = String.fromCharCode(32, 9, 13, 10);
  var openTag = "<FILE_CONTENT>", closeTag = "</FILE_CONTENT>";
  var idx = 0;
  while ((idx = m.indexOf(openTag, idx)) >= 0) {
    var cs = idx + openTag.length;
    var ce = m.indexOf(closeTag, cs);
    if (ce < 0) break;
    var inner = m.slice(cs, ce);
    var onlyWs = true;
    for (var w = 0; w < inner.length; w++) {
      if (ws.indexOf(inner.charAt(w)) < 0) { onlyWs = false; break; }
    }
    if (onlyWs) return "OPS-ATTACHMENT-GUARD: one or more attachments arrived with a nonzero FILE_SIZE but EMPTY FILE_CONTENT. The file bytes are missing and CANNOT be read. Do NOT invent, guess, or reconstruct file contents. Tell the user the attachment could not be read and ask them to re-send it.";
    idx = ce + closeTag.length;
  }
  return "";
}
'''


def die(msg):
    print("FAIL-CLOSED: " + msg)
    sys.exit(3)


def apply_once(text, anchor, repl, label):
    n = text.count(anchor)
    if n == 1:
        return text.replace(anchor, repl, 1)
    crlf = anchor.replace("\n", "\r\n")
    n2 = text.count(crlf)
    if n2 == 1:
        return text.replace(crlf, repl.replace("\n", "\r\n"), 1)
    die("anchor %s occurs %d times (lf) / %d times (crlf); expected exactly 1" % (label, n, n2))


def main():
    text = SRC.read_text(encoding="utf-8")
    if POST in text:
        print("already applied: %s present; no change" % POST)
        return 0
    if PRE not in text:
        die("pre-patch VERSION %r not found in %s" % (PRE, SRC))
    if "attachmentGuardXml" in text:
        die("attachmentGuardXml already present without the post VERSION; refusing")
    if GUARD_ANCHOR not in text:
        die("attachmentGuard anchor missing")

    text = apply_once(text, LEGACY_ANCHOR, LEGACY_FIXED, "legacy-form-return")
    text = apply_once(text, GUARD_ANCHOR, XML_FN + GUARD_ANCHOR, "insert-xml-detector")
    text = apply_once(text, TEL_ANCHOR, TEL_FIXED, "telemetry-hours")
    text = apply_once(text, PRE, POST, "version-bump")

    if text.count("attachmentGuardXml") != 2:
        die("attachmentGuardXml count %d != 2 after patch" % text.count("attachmentGuardXml"))
    if TEL_FIXED not in text:
        die("telemetry fix not present after patch")
    if text.count(POST) != 1:
        die("post VERSION count != 1")

    SRC.write_text(text, encoding="utf-8")
    MIRROR.write_text(text, encoding="utf-8")

    r = subprocess.run(["node", "--check", str(SRC)], capture_output=True, text=True)
    if r.returncode != 0:
        die("node --check failed: %s" % (r.stderr.strip() or r.stdout.strip()))

    print("applied: %s" % POST)
    print("worker.js bytes: %d" % len(text.encode("utf-8")))
    print("mirror written: %s" % MIRROR)
    print("node --check: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
