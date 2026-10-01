#!/usr/bin/env python3
"""Offline tests for secret-mutation-guard.py and secret_lock.py (no network)."""
import importlib.util
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def load(name, fn):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fn))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


G = load("smg", "secret-mutation-guard.py")
L = load("sl", "secret_lock.py")


def tree(files, allow=None):
    d = tempfile.mkdtemp()
    os.makedirs(os.path.join(d, "scripts"))
    os.makedirs(os.path.join(d, ".github", "workflows"))
    for p, t in files.items():
        with open(os.path.join(d, p), "w") as f:
            f.write(t)
    if allow is not None:
        with open(os.path.join(d, "scripts", "secret-mutation-allowlist.txt"), "w") as f:
            f.write(allow)
    return d


class GuardTests(unittest.TestCase):
    def test_wrangler_secret_put_flagged(self):
        d = tree({".github/workflows/a.yml": "run: wrangler secret put FOO\n"})
        v, e = G.scan(d)
        self.assertEqual([x[0] for x in v], [".github/workflows/a.yml"])

    def test_settings_patch_flagged_and_lock_ref_passes(self):
        bad = 'curl -X PATCH https://api.cloudflare.com/x/workers/scripts/w/settings\n'
        d = tree({"scripts/a.py": bad, "scripts/b.py": bad + "# secret-lock held\n"})
        v, _ = G.scan(d)
        self.assertEqual([x[0] for x in v], ["scripts/a.py"])

    def test_secrets_put_and_script_put_flagged(self):
        d = tree({"scripts/a.py": 'urlopen(Request(".../workers/scripts/w/secrets", method="PUT"))',
                  "scripts/b.py": 'x = ".../workers/scripts/w"; method="PUT"'})
        v, _ = G.scan(d)
        self.assertEqual(len(v), 2)

    def test_read_only_and_comments_not_flagged(self):
        d = tree({"scripts/a.py": '# pre-PATCH snapshot\nurlopen(".../workers/scripts/w/settings")\n'})
        self.assertEqual(G.scan(d)[0], [])

    def test_allowlist_requires_justification_and_existing_file(self):
        bad = 'wrangler secret put X\n'
        d = tree({"scripts/a.py": bad}, allow="scripts/a.py\nscripts/missing.py  # why\n")
        v, e = G.scan(d)
        self.assertEqual(v, [])
        self.assertEqual(len(e), 2)
        d = tree({"scripts/a.py": bad}, allow="scripts/a.py  # patcher only\n")
        self.assertEqual(G.scan(d), ([], []))

    def test_repo_is_clean(self):
        v, e = G.scan(os.path.dirname(HERE))
        self.assertEqual((v, e), ([], []))


class LockTests(unittest.TestCase):
    def test_acquire_fail_closed(self):
        for resp in [(409, {"acquired": False}), (0, {"error": "x"}), (200, {"acquired": True}), (500, None)]:
            with self.assertRaises(L.SecretLockError):
                L.acquire("w", call=lambda p, b, r=resp: r)

    def test_context_releases_on_exception(self):
        calls = []

        def call(path, body):
            calls.append((path, body))
            return (200, {"acquired": True, "token": "t1"}) if path.endswith("acquire") else (200, {"released": True})
        with self.assertRaises(ValueError):
            with L.secret_lock("w", ttl_sec=120, call=call):
                raise ValueError("boom")
        self.assertEqual([c[0] for c in calls], ["/secret-lock/acquire", "/secret-lock/release"])
        self.assertEqual(calls[0][1]["ttl_sec"], 120)
        self.assertEqual(calls[1][1]["token"], "t1")

    def test_body_not_run_when_lock_denied(self):
        ran = []
        with self.assertRaises(L.SecretLockError):
            with L.secret_lock("w", call=lambda p, b: (409, {"acquired": False})):
                ran.append(1)
        self.assertEqual(ran, [])


if __name__ == "__main__":
    unittest.main()
