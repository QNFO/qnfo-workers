#!/usr/bin/env node
/**
 * apply-2026-09-26-ops-attachment-xml-form.mjs   (qnfo-ops)
 *
 * WHY AN APPLIER AND NOT A DIRECT EDIT
 *   qnfo-ops/worker.js is 348,295 bytes: too large for the ops endpoint's github_file_write,
 *   and cf_worker_deploy is NOT a safe path for a worker that owns a wrangler.toml
 *   ([limits] cpu_ms = 300000 must survive). See qnfo-ops/README-deploy.md and
 *   qnfo-ops/PATCH-2026-09-15-registry-deps-preserve.md ("Why this was not deployed").
 *   This script is idempotent and FAIL-CLOSED: every hunk asserts its find-anchor count
 *   BEFORE any byte is written, so a drifted source aborts instead of being corrupted.
 *
 * DEFECTS REPAIRED (both source-verified 2026-09-26 against v2.37.8-authoritative-registry)
 *
 *   D1  ATTACHMENT-GUARD-XML-FORM-1
 *       attachmentGuard() probes only the KEY=VALUE form:  m.indexOf("FILE_CONTENT=")
 *       and derives the declared size from "FILE_SIZE=" followed by digits. The Chatbox
 *       client emits the XML form instead:
 *           <FILE_SIZE>11.3KB</FILE_SIZE> ... <FILE_CONTENT>\n</FILE_CONTENT>
 *       Both probes miss: ki < 0 returns "" early, and even past that the size scan finds
 *       no digits (the tag is followed by ">"), so maxSize stays 0.
 *       Net effect: the guard NEVER fires for this client, so the model is handed a wrapper
 *       declaring a nonzero FILE_SIZE while carrying no bytes, and may invent content.
 *       Evidence: ops_ai_log - 34 rows contain "<FILE_CONTENT>", 0 rows contain "FILE_CONTENT=".
 *
 *   D2  TELEMETRY-REPORT-HOURS-1
 *       Tool dispatch passes the whole args OBJECT where a number is expected:
 *           else if (name === "telemetry_report") res = await telemetryReport(env, args);
 *       telemetryReport does `parseInt(hours,10) || 24`; parseInt({hours:N}) is NaN, so the
 *       window is pinned at 24h for every request.
 *       Evidence: telemetry_report(hours=1) and telemetry_report(hours=168) returned
 *       byte-identical payloads with windowHours:24 on 2026-09-26.
 *
 * USAGE (from the repo root):
 *   node qnfo-ops/scripts/apply-2026-09-26-ops-attachment-xml-form.mjs           # dry run
 *   node qnfo-ops/scripts/apply-2026-09-26-ops-attachment-xml-form.mjs --write   # apply
 * Exit 0 = all hunks verified (and written when --write). Exit 1 = anchor mismatch, no writes.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const FILE = "qnfo-ops/worker.js";
const WRITE = process.argv.includes("--write");
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);

const GUARD_MSG =
  "OPS-ATTACHMENT-GUARD: one or more attachments arrived with a nonzero FILE_SIZE but EMPTY FILE_CONTENT. The file bytes are missing and CANNOT be read. Do NOT invent, guess, or reconstruct file contents. Tell the user the attachment could not be read and ask them to re-send it.";

// Inserted verbatim before attachmentGuard(). Whitespace is tested with String.fromCharCode
// (not a regex) so this file needs no escape doubling and mirrors the existing guard style.
const XML_FN = `function attachmentGuardXml(text) {
  // ATTACHMENT-GUARD-XML-FORM-1 (2026-09-26): the Chatbox client wraps attachments in XML
  // tags, which the KEY=VALUE probes in attachmentGuard() below cannot see. Detect that form.
  var s = String(text || "");
  var OPEN = "<FILE_CONTENT>", CLOSE = "</FILE_CONTENT>";
  var oi = s.indexOf(OPEN);
  if (oi < 0) return "";
  var ci = s.indexOf(CLOSE, oi + OPEN.length);
  if (ci < 0) return "";
  var inner = s.slice(oi + OPEN.length, ci);
  var ws = String.fromCharCode(32, 9, 13, 10);
  var onlyWs = true;
  for (var i = 0; i < inner.length; i++) {
    if (ws.indexOf(inner.charAt(i)) < 0) { onlyWs = false; break; }
  }
  if (!onlyWs) return "";
  // Mirror the KEY=VALUE branch: fire only when a NONZERO size is declared, so a
  // legitimately empty 0-byte attachment is not misreported as missing bytes.
  var fi = s.indexOf("<FILE_SIZE>");
  if (fi < 0) return "";
  var fj = s.indexOf("</FILE_SIZE>", fi);
  if (fj < 0) return "";
  var num = parseFloat(String(s.slice(fi + 11, fj)).replace(/[^0-9.]/g, ""));
  if (!(num > 0)) return "";
  return ${JSON.stringify(GUARD_MSG)};
}
__name(attachmentGuardXml, "attachmentGuardXml");
__name2(attachmentGuardXml, "attachmentGuardXml");
`;

const HUNKS = [
  {
    id: "D1a-xml-detector-insert",
    kind: "insert-before",
    anchor: "function attachmentGuard(text) {",
    expect: 1,
    insert: XML_FN,
  },
  {
    id: "D1b-xml-detector-call",
    kind: "replace",
    find: '  var ki = m.indexOf("FILE_CONTENT=");\n  if (ki < 0) return "";',
    expect: 1,
    replace:
      '  var _xg = attachmentGuardXml(m);\n  if (_xg) return _xg;\n  var ki = m.indexOf("FILE_CONTENT=");\n  if (ki < 0) return "";',
  },
  {
    id: "D2-telemetry-hours-passthrough",
    kind: "replace",
    find: '    else if (name === "telemetry_report") res = await telemetryReport(env, args);',
    expect: 1,
    replace:
      '    else if (name === "telemetry_report") res = await telemetryReport(env, args && args.hours);',
  },
  {
    id: "VERSION-bump",
    kind: "replace",
    find: 'var VERSION = "2.37.8-authoritative-registry";',
    expect: 1,
    replace: 'var VERSION = "2.37.9-attachguard-xml-telemetry-hours";',
  },
];

function countOf(hay, needle) {
  let n = 0,
    i = 0;
  for (;;) {
    const j = hay.indexOf(needle, i);
    if (j < 0) return n;
    n++;
    i = j + needle.length;
  }
}

let src = readFileSync(FILE, "utf8");
const before = src;
console.log("file          : " + FILE);
console.log("bytes before  : " + src.length);
console.log("sha256(12)    : " + sha(src));
console.log("mode          : " + (WRITE ? "WRITE" : "DRY-RUN"));
console.log("");

const failures = [];
const applied = [];

for (const h of HUNKS) {
  if (h.kind === "insert-before") {
    const n = countOf(src, h.anchor);
    if (n !== h.expect) {
      failures.push(h.id + ": anchor count " + n + " != expected " + h.expect);
      continue;
    }
    src = src.split(h.anchor).join(h.insert + h.anchor);
    applied.push(h.id + " (insert-before, " + h.insert.length + " bytes)");
  } else if (h.kind === "replace") {
    const n = countOf(src, h.find);
    if (n !== h.expect) {
      failures.push(h.id + ": find count " + n + " != expected " + h.expect);
      continue;
    }
    src = src.split(h.find).join(h.replace);
    applied.push(h.id + " (replace)");
  } else {
    failures.push(h.id + ": unknown kind " + h.kind);
  }
}

// Post-conditions: both defects gone, nothing duplicated.
const post = [
  ["attachmentGuardXml defined exactly once", countOf(src, "function attachmentGuardXml("), 1],
  ["attachmentGuardXml called exactly once", countOf(src, "attachmentGuardXml(m);"), 1],
  ["hours passed through exactly once", countOf(src, "telemetryReport(env, args && args.hours)"), 1],
  ["old dispatch form gone", countOf(src, "telemetryReport(env, args);"), 0],
  ["version bumped exactly once", countOf(src, 'var VERSION = "2.37.9-attachguard-xml-telemetry-hours";'), 1],
  ["old version gone", countOf(src, 'var VERSION = "2.37.8-authoritative-registry";'), 0],
  ["KEY=VALUE branch intact", countOf(src, 'm.indexOf("FILE_CONTENT=")'), 1],
];
for (const [label, got, want] of post) {
  if (got !== want) {
    failures.push("post-condition FAILED: " + label + " (got " + got + ", want " + want + ")");
  }
}

console.log("hunks applied : " + applied.length + "/" + HUNKS.length);
for (const a of applied) console.log("  OK   " + a);
for (const f of failures) console.log("  FAIL " + f);
console.log("");

if (failures.length) {
  console.log("RESULT: FAIL-CLOSED - " + failures.length + " problem(s); NOTHING WRITTEN.");
  process.exit(1);
}

console.log("bytes after   : " + src.length);
console.log("sha256(12)    : " + sha(src));

if (!WRITE) {
  console.log("RESULT: dry run OK. Re-run with --write to apply.");
  process.exit(0);
}
if (src === before) {
  console.log("RESULT: already applied (no change).");
  process.exit(0);
}
writeFileSync(FILE, src);
console.log("RESULT: WRITTEN " + FILE);
