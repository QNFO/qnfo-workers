#!/usr/bin/env python3
"""Offline test for the canary's VERSION parse (CANARY-VERSION-REGEX-1, no network).

qnfo-gateway may have generated or explanatory comments before its VERSION declaration. This suite parses the real worker
files in the repo and asserts that the canary, version-bump-guard.py and canonical_deploy.py read the same VERSION, and that
no CANARY_WORKERS entry is unwatched.
"""
import glob
import importlib.util
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)


def load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


cr = load("canary_revert", "canary_revert.py")
vbg = load("version_bump_guard", "version-bump-guard.py")
cd = load("canonical_deploy", "canonical_deploy.py")


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8", errors="replace") as fh:
        return fh.read()


class T(unittest.TestCase):
    def test_gateway_version_is_watched(self):
        source = read("qnfo-gateway/worker.js")
        self.assertRegex(source, r'(?m)^var\s+VERSION\s*=\s*["\']', "qnfo-gateway has a line-start VERSION declaration")
        v = cr.read_version(source)
        self.assertTrue(v and re.match(r"^\d+\.\d+\.\d+", v), "canary reads a VERSION from qnfo-gateway/worker.js, got %r" % (v,))

    def test_forms_the_fleet_writes(self):
        for src, want in (
            ('var VERSION="3.26.1-gw-json-quiet";;\n', "3.26.1-gw-json-quiet"),
            ('var VERSION="1.0.1-x";const V=VERSION;\n', "1.0.1-x"),
            ('var VERSION = "0.7.0-a"; /* c */\n', "0.7.0-a"),
            ('x\nvar  VERSION  =  "2.0.0";\n', "2.0.0"),
        ):
            self.assertEqual(cr.read_version(src), want, src)

    def test_non_declarations_stay_unread(self):
        for src in ("nothing", "var VERSION = FLEET_EXEC_VERSION;", "  var VERSION = \"1.0.0\";", "const VERSION = \"1.0.0\";", "var VERSION = '1.0.0';"):
            self.assertIsNone(cr.read_version(src), src)

    def test_revert_bump_keeps_the_line_as_written(self):
        r = cr.bump_for_revert('var VERSION="3.26.1-gw";; /* c */\nb', "3.26.2-bad", "-revert-abc1234")
        self.assertEqual(r, ("3.26.3-revert-abc1234", 'var VERSION="3.26.3-revert-abc1234";; /* c */\nb'))
        r = cr.bump_for_revert('a\nvar VERSION = "0.6.1-base";\nb', "0.7.0-bad", "-r")
        self.assertEqual(r, ("0.7.1-r", 'a\nvar VERSION = "0.7.1-r";\nb'))
        self.assertIsNone(cr.bump_for_revert('var VERSION="1";;\nvar VERSION = "2";', "1.0.0", "-r"))

    def test_every_canary_worker_is_watched(self):
        missing = []
        for w in cr.CANARY_WORKERS:
            if not cr.read_version(read(w + "/worker.js")):
                missing.append(w)
        self.assertEqual(missing, [], "CANARY_WORKERS with no VERSION line the canary can read: %s" % missing)

    def test_canary_guard_and_deploy_read_the_same_version(self):
        # the three parsers must agree on every worker the canary watches, and on the gateway's mirror
        for w in cr.CANARY_WORKERS:
            for fname in ("worker.js", "deployed-current.worker.js"):
                path = os.path.join(w, fname)
                if not os.path.exists(os.path.join(ROOT, path)):
                    continue
                text = read(path)
                a, b, c = cr.read_version(text), vbg.version_of(text), cd.repo_version(os.path.join(ROOT, path))
                self.assertTrue(a, path)
                self.assertTrue(a == b == c, "%s: canary %r, version-bump-guard %r, canonical_deploy %r" % (path, a, b, c))

    def test_no_line_start_declaration_is_unread(self):
        # every worker.js that declares VERSION as a quoted literal at the start of a line is readable by the canary,
        # whatever its spacing; list (not fail) the workers that declare none in that form, they carry QNFO_VERSION or a comment header.
        decl = re.compile(r'^var\s+VERSION\s*=\s*"', re.M)
        unread, none = [], []
        for f in sorted(glob.glob(os.path.join(ROOT, "*", "worker.js"))):
            rel = os.path.relpath(f, ROOT)
            text = read(rel)
            if decl.search(text):
                if not cr.read_version(text):
                    unread.append(rel)
            else:
                none.append(rel)
        print("workers with no line-start `var VERSION = \"..\"` literal (not parsed by the canary, none is in CANARY_WORKERS): %d" % len(none))
        for rel in none:
            print("  " + rel)
        self.assertEqual(unread, [], "line-start VERSION literals the canary cannot read: %s" % unread)
        self.assertFalse([w for w in cr.CANARY_WORKERS if w + "/worker.js" in none], "a CANARY_WORKERS entry has no VERSION literal")


if __name__ == "__main__":
    unittest.main()
