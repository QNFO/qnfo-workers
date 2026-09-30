#!/usr/bin/env python3
"""UNAUTH-TRIGGER-1 (agent_issues 1672) -- fleet-exec /tick and /run were callable
by any external client.

Verified live 2026-09-30: the deployed bundle (fleet-exec, 12247 B, VERSION
fleet-executor/0.3.2) routes POST /tick straight into runTick(env) and POST /run
straight into executeTask() with no credential check. /tick forces every due
fleet_crons row to fire and rewrites last_fired/next_fire; /run executes any
enabled fleet_tasks row (ai | sql | http step types).

FIX: admit a request only when it carries EITHER
  (a) the per-isolate sentinel header x-fleet-internal, whose value is a
      crypto.getRandomValues token generated in module scope and never emitted
      in any response, or
  (b) a constant-time match on the x-fleet-key header against the
      FLEET_TRIGGER_KEY secret.
The per-minute scheduler dispatches into execMod.fetch() in-process, so it
carries the sentinel; that path keeps working with no secret configured, which
is what makes this fix fail-safe rather than fail-closed-on-deploy.

ADVERSARIAL: if FLEET_TRIGGER_KEY is absent AND the sentinel does not match,
the guard DENIES. An external caller cannot obtain the sentinel, so the guard
does not fail open. Residual risk: Math.random-free token uses
crypto.getRandomValues (CSPRNG); no timing leak because comparison is
constant-time over the key length.

Idempotent + fail-closed: exits non-zero and writes nothing if any anchor is
missing or appears more than once.
"""
import re
import sys

TARGET = "fleet-exec/worker.js"
MARKER = "UNAUTH-TRIGGER-1"

HELPERS = '''// UNAUTH-TRIGGER-1 (agent_issues 1672): /tick and /run were reachable by any
// external client. The per-minute scheduler dispatches into execMod.fetch() in
// process, so it carries a per-isolate sentinel that no HTTP caller can obtain;
// external callers must present FLEET_TRIGGER_KEY via the x-fleet-key header.
// Deny by default: a missing secret plus a non-matching sentinel is a rejection.
var _fleetInternalToken = null;
function fleetInternalToken() {
  if (!_fleetInternalToken) {
    var a = new Uint8Array(24);
    crypto.getRandomValues(a);
    var h = "";
    for (var i = 0; i < a.length; i++) h += a[i].toString(16).padStart(2, "0");
    _fleetInternalToken = "itk-" + h;
  }
  return _fleetInternalToken;
}
function fleetAuthorized(request, env) {
  var sent = request.headers.get("x-fleet-internal");
  if (sent && sent === fleetInternalToken()) return true;
  var key = env && env.FLEET_TRIGGER_KEY;
  if (!key) return false;
  var given = request.headers.get("x-fleet-key") || "";
  if (given.length !== key.length) return false;
  var diff = 0;
  for (var i = 0; i < key.length; i++) diff |= given.charCodeAt(i) ^ key.charCodeAt(i);
  return diff === 0;
}
'''

ANCHORS = [
    # (label, find, replace, expected_occurrences)
    (
        "insert helpers before execMod",
        "var execMod = (function(){",
        HELPERS + "var execMod = (function(){",
        1,
    ),
    (
        "guard /run",
        '    if (url.pathname === "/run" && request.method === "POST") {\n      let body = {};',
        '    if (url.pathname === "/run" && request.method === "POST") {\n'
        '      if (!fleetAuthorized(request, env)) return json({ ok: false, error: "unauthorized" }, 403);\n'
        "      let body = {};",
        1,
    ),
    (
        "guard /tick",
        '    if (url.pathname === "/tick" && request.method === "POST") {\n      const fired = await runTick(env);',
        '    if (url.pathname === "/tick" && request.method === "POST") {\n'
        '      if (!fleetAuthorized(request, env)) return json({ ok: false, error: "unauthorized" }, 403);\n'
        "      const fired = await runTick(env);",
        1,
    ),
    (
        "sentinel on internal dispatch",
        '        headers: { "content-type": "application/json" },\n'
        "        body: JSON.stringify({ task_id: row.task_id, cron_name: row.name })",
        '        headers: { "content-type": "application/json", "x-fleet-internal": fleetInternalToken() },\n'
        "        body: JSON.stringify({ task_id: row.task_id, cron_name: row.name })",
        1,
    ),
]


def main() -> int:
    try:
        src = open(TARGET, "r", encoding="utf-8").read()
    except OSError as exc:
        print("FAIL: cannot read %s: %s" % (TARGET, exc))
        return 1

    if MARKER in src:
        print("ALREADY-APPLIED: %s present in %s" % (MARKER, TARGET))
        return 0

    out = src
    for label, find, repl, want in ANCHORS:
        got = out.count(find)
        if got != want:
            print("STALE-ANCHOR: %s matched %d times (want %d); nothing written" % (label, got, want))
            return 1
        out = out.replace(find, repl, want)
        print("ok: %s" % label)

    # structural assertions
    checks = [
        ("guard count == 2", out.count("!fleetAuthorized(request, env)") == 2),
        ("sentinel header count == 1", out.count('"x-fleet-internal": fleetInternalToken()') == 1),
        ("deny default present", "if (!key) return false;" in out),
        ("marker present", MARKER in out),
        ("execMod intact", "var execMod = (function(){" in out),
        ("export intact", "export default schedDefault;" in out),
    ]
    bad = [n for n, ok in checks if not ok]
    if bad:
        print("FAIL: structural check(s) failed: %s; nothing written" % ", ".join(bad))
        return 1

    # no stray unbalanced braces introduced
    if out.count("{") != src.count("{") + HELPERS.count("{"):
        print("FAIL: brace delta unexpected; nothing written")
        return 1

    open(TARGET, "w", encoding="utf-8").write(out)
    print("APPLIED %s: %s -> %s bytes; version=%s" % (
        MARKER, len(src), len(out),
        (re.search(r'VERSION\s*=\s*"([^"]+)"', out).group(1) if re.search(r'VERSION\s*=\s*"([^"]+)"', out) else "?"),
    ))
    return 0


if __name__ == "__main__":
    sys.exit(main())
