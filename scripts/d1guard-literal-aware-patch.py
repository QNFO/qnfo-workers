#!/usr/bin/env python3
"""D1-GUARD-LITERAL-AWARE-1 applier (fail-closed).

WHY: d1Query()'s read-only guard scanned the RAW statement for mutation keywords
anywhere in the text, so a keyword inside a STRING LITERAL produced a false
rejection. Measured live on 2026-09-29 against qnfo-ops 2.37.17-d1-schema-hint:

    ops_d1_query  SELECT COUNT(*) AS n FROM agent_issues WHERE title LIKE '%delete%'
    -> {"ok":false,"rejected":true,
        "error":"read-only SELECT/WITH only - mutation keywords are rejected anywhere in the statement"}

That single line made ops_d1_query the highest-volume failing tool on the endpoint
and pushed agents into schema guessing. The guard also rejected bare `PRAGMA`
outright ("read-only SELECT/WITH only") while the equivalent table-valued function
`SELECT * FROM pragma_table_info('agent_issues')` worked -- an undocumented trap.

WHAT: the keyword scan now runs on a literal/comment-STRIPPED copy of the statement,
while the ORIGINAL text is still what gets prepared. A keyword inside a literal is
allowed; a keyword as real SQL is still rejected. The guard is STRICTLY STRONGER in
the place that matters: any interior ';' surviving literal-stripping is rejected, so
"SELECT 1; SELECT 2" -- which the pre-patch guard ACCEPTED -- is now refused. Read-only
PRAGMAs are rewritten to their pragma_* table-valued form; mutation-capable PRAGMAs
are refused with an allowlist hint. Every rejection now names the offending token and
carries a `hint`, so the next agent does not have to guess.

FAIL-CLOSED: aborts (exit 3) unless the pre-patch VERSION matches, every anchor occurs
exactly once, and `node --check` passes on the result.
IDEMPOTENT: exits 0 with no change if the post-patch VERSION is already present.
"""
import pathlib
import subprocess
import sys

SRC = pathlib.Path("qnfo-ops/worker.js")
MIRROR = pathlib.Path("qnfo-ops/deployed-current.worker.js")

PRE = 'var VERSION = "2.37.17-d1-schema-hint";'
POST = 'var VERSION = "2.37.18-d1-guard-literal-aware";'

GUARD_ANCHOR = '''  const sql = raw.replace(/;\\s*$/, "");
  if (!/^(select|with)\\b/i.test(sql)) return { ok: false, rejected: true, error: "read-only SELECT/WITH only" };
  if (/;\\s*(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|reindex|replace)/i.test(sql)) return { ok: false, rejected: true, error: "single read statement only" };
  if (/\\b(insert|update|delete|drop|alter|create|attach|detach|vacuum|reindex|replace|truncate)\\b/i.test(sql)) return { ok: false, rejected: true, error: "read-only SELECT/WITH only - mutation keywords are rejected anywhere in the statement" };
'''

GUARD_FIXED = '''  let sql = raw.replace(/;\\s*$/, "");
  const _g = d1ReadOnlyGuard(sql);
  if (!_g.ok) return _g;
  sql = _g.sql;
'''

HELPERS = r'''// D1-GUARD-LITERAL-AWARE-1 (2026-09-29). See scripts/d1guard-literal-aware-patch.py.
// The pre-2.37.18 guard scanned the RAW statement, so a mutation keyword inside a
// string literal was refused (e.g. WHERE title LIKE '%delete%'). The scan now runs on
// a literal/comment-STRIPPED copy; the original text is what gets prepared. Rejections
// name the offending token and carry a hint.
var D1_READONLY_PRAGMAS = { table_info: 1, table_xinfo: 1, table_list: 1, index_list: 1, index_info: 1, index_xinfo: 1, foreign_key_list: 1, foreign_key_check: 1, database_list: 1, collation_list: 1, function_list: 1, module_list: 1, pragma_list: 1, compile_options: 1, freelist_count: 1, page_count: 1, page_size: 1, encoding: 1, user_version: 1, application_id: 1, integrity_check: 1, quick_check: 1, stats: 1 };

function d1StripLiterals(s) {
  var out = "";
  var i = 0;
  var n = s.length;
  while (i < n) {
    var c = s.charAt(i);
    var d = s.charAt(i + 1);
    if (c === "'" || c === '"' || c === "`") {
      i++;
      while (i < n) {
        if (s.charAt(i) === c) {
          if (s.charAt(i + 1) === c) { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      out += " ";
      continue;
    }
    if (c === "-" && d === "-") { while (i < n && s.charAt(i) !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < n && !(s.charAt(i) === "*" && s.charAt(i + 1) === "/")) i++; i += 2; continue; }
    out += c;
    i++;
  }
  return out;
}

function d1ReadOnlyGuard(sql) {
  var stripped = d1StripLiterals(sql);
  if (!/^\s*(select|with)\b/i.test(stripped)) {
    var pm = /^\s*pragma\s+([A-Za-z0-9_]+)/i.exec(sql);
    if (pm) {
      var pn = pm[1].toLowerCase();
      if (D1_READONLY_PRAGMAS[pn]) {
        var argm = /^\s*pragma\s+[A-Za-z0-9_]+\s*\(\s*['"]?([A-Za-z0-9_]+)['"]?\s*\)/i.exec(sql);
        return { ok: true, sql: "SELECT * FROM pragma_" + pn + (argm ? "('" + argm[1] + "')" : "") + " LIMIT 100" };
      }
      return { ok: false, rejected: true, error: "PRAGMA " + pn + " is not on the read-only allowlist (it can change connection state). Use SELECT * FROM pragma_<name>(...) instead.", hint: "read-only PRAGMAs: " + Object.keys(D1_READONLY_PRAGMAS).join(", ") };
    }
    return { ok: false, rejected: true, error: "read-only SELECT/WITH only - this tool can never write. First token seen: " + (stripped.trim().split(/\s+/)[0] || "(empty)").slice(0, 24), hint: "start the statement with SELECT or WITH; use ops_d1_write for mutations" };
  }
  if (stripped.indexOf(";") >= 0) return { ok: false, rejected: true, error: "single read statement only - an interior ';' was found outside string literals", hint: "send exactly one SELECT/WITH statement" };
  var mm = /\b(insert|update|delete|drop|alter|create|attach|detach|vacuum|reindex|replace|truncate)\b/i.exec(stripped);
  if (mm) return { ok: false, rejected: true, error: "read-only SELECT/WITH only - mutation keyword '" + mm[1].toLowerCase() + "' appears as SQL, not inside a string literal", hint: "a keyword inside a quoted literal is now allowed; this rejection means it was real SQL" };
  return { ok: true, sql: sql };
}

'''


def die(msg):
    print("FAIL-CLOSED: " + msg)
    sys.exit(3)


def main():
    text = SRC.read_text(encoding="utf-8")
    if POST in text:
        print("already applied: %s present; no change" % POST)
        return 0
    if PRE not in text:
        die("pre-patch VERSION %r not found in %s" % (PRE, SRC))
    if "d1ReadOnlyGuard" in text:
        die("d1ReadOnlyGuard already present without the post VERSION; refusing")
    if text.count(GUARD_ANCHOR) != 1:
        die("guard anchor occurs %d times (expected 1)" % text.count(GUARD_ANCHOR))
    if "async function d1Query(env, args) {" not in text:
        die("d1Query anchor missing")

    text = text.replace(GUARD_ANCHOR, GUARD_FIXED, 1)
    text = text.replace("async function d1Query(env, args) {", HELPERS + "async function d1Query(env, args) {", 1)
    if text.count(PRE) != 1:
        die("pre VERSION count %d != 1" % text.count(PRE))
    text = text.replace(PRE, POST, 1)

    if text.count("d1ReadOnlyGuard") != 2:
        die("d1ReadOnlyGuard count %d != 2" % text.count("d1ReadOnlyGuard"))
    if text.count(POST) != 1:
        die("post VERSION count != 1")
    if text.count("d1StripLiterals") != 2:
        die("d1StripLiterals count %d != 2" % text.count("d1StripLiterals"))
    if 'mutation keywords are rejected anywhere' in text:
        die("legacy guard message still present")

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
