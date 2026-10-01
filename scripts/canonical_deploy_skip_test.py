#!/usr/bin/env python3
"""Offline test for canonical_deploy.is_resurrection_refusal (no network)."""
import importlib.util, os, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("cd", os.path.join(HERE, "canonical_deploy.py"))
cd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cd)


class T(unittest.TestCase):
    def test_guard_refusal_is_a_skip(self):
        self.assertTrue(cd.is_resurrection_refusal({"ok": False, "error": "WORKER-RESURRECTION-GUARD-1: refusing to create absent worker x"}))
        self.assertTrue(cd.is_resurrection_refusal({"ok": False, "status": 409, "log": [{"step": "guard", "error": "WORKER-RESURRECTION-GUARD-1"}]}))

    def test_other_failures_stay_failures(self):
        for r in ({"ok": False, "error": "CF API 400: bad binding"}, {"ok": False, "error": "lock not acquired (fail-closed)"}, {"ok": False}):
            self.assertFalse(cd.is_resurrection_refusal(r))

    def test_success_is_never_a_skip(self):
        self.assertFalse(cd.is_resurrection_refusal({"ok": True, "note": "WORKER-RESURRECTION-GUARD-1 mentioned in a log"}))


if __name__ == "__main__":
    unittest.main()
