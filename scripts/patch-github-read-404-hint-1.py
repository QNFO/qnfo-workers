#!/usr/bin/env python3
"""GITHUB-READ-404-HINT-1 -- issue #1391.

github_repo_read() returns a bare `path not found: <path>` on HTTP 404, so an
agent that guesses a directory name (e.g. "qnfo-ideas") gets no signal about
what actually exists in the repo. cf_worker_read() was fixed the same way
(#1382 / CF-WORKER-READ-404-HINT-LIST-1): enumerate real names in the error.

This applier rewrites the 404 branch to list the parent directory's entries
plus a nearest-match shortlist, mirroring the #1382 pattern.

Fail-closed: any anchor that does not match exactly once aborts with rc=3 and
writes nothing. Idempotent: a second run prints ALREADY APPLIED and exits 0.

Usage: python3 scripts/patch-github-read-404-hint-1.py [repo_root]
"""
import os
import re
import sys

MARKER = "GITHUB-READ-404-HINT-1"
NEW_VERSION = "2.37.25-github-read-404-hint"

ANCHOR_404 = '  if (res.status === 404) return { ok: false, error: "path not found: " + path };'

REPLACEMENT_404 = """  if (res.status === 404) {
    /* GITHUB-READ-404-HINT-1: on a miss, enumerate what actually exists so an
       agent that guessed a path gets the real names back (issue #1391). */
    var _p = String(path || "").split("/").filter(Boolean);
    var _base = _p.length ? _p[_p.length - 1] : "";
    var _parent = _p.slice(0, -1).join("/");
    var _hint = "";
    try {
      var _pr = await githubApi(env, "GET", "/repos/" + encPath(repo) + "/contents/" + encPath(_parent) + qp);
      if (_pr && _pr.status === 200 && Array.isArray(_pr.json)) {
        var _names = _pr.json.map(function (e) {
          return e.name;
        }).slice(0, 40);
        var _lb = _base.toLowerCase();
        var _near = _names.filter(function (n) {
          var _ln = String(n).toLowerCase();
          return _lb && (_ln.indexOf(_lb) >= 0 || _lb.indexOf(_ln) >= 0);
        }).slice(0, 8);
        _hint = " - " + (_parent ? "dir '" + _parent + "' contains: " : "repo root contains: ") + _names.join(", ");
        if (_near.length) _hint += " (nearest match: " + _near.join(", ") + ")";
      } else if (_pr && _pr.status === 404) {
        _hint = " - parent dir '" + _parent + "' also not found; repo root may be the right starting point";
      }
    } catch (_e) {}
    return { ok: false, error: "path not found: " + path + _hint };
  }"""

TARGETS = ["qnfo-ops/worker.js", "qnfo-ops/deployed-current.worker.js"]


def die(code, msg):
    print("ABORT: " + msg)
    sys.exit(code)


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    changed = 0
    for rel in TARGETS:
        fp = os.path.join(root, rel)
        if not os.path.isfile(fp):
            die(4, "missing target file: " + rel)
        src = open(fp, encoding="utf-8").read()

        if MARKER in src:
            print("ALREADY APPLIED: " + rel)
            continue

        n = src.count(ANCHOR_404)
        if n != 1:
            die(3, "%s: ANCHOR_404 matched %d times (expected exactly 1)" % (rel, n))

        out = src.replace(ANCHOR_404, REPLACEMENT_404)

        vm = re.search(r'var VERSION = "([^"]+)";', out)
        if not vm:
            die(3, rel + ": VERSION anchor not found")
        out = out.replace('var VERSION = "%s";' % vm.group(1), 'var VERSION = "%s";' % NEW_VERSION)

        if MARKER not in out:
            die(3, rel + ": marker missing after rewrite")

        open(fp, "w", encoding="utf-8").write(out)
        changed += 1
        print("PATCHED: %s  (VERSION %s -> %s)" % (rel, vm.group(1), NEW_VERSION))

    print("DONE: %d file(s) patched, marker=%s" % (changed, MARKER))
    return 0


if __name__ == "__main__":
    sys.exit(main())
