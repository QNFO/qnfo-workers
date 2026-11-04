#!/usr/bin/env python3
"""Offline test for the canary's VERSION parse (CANARY-VERSION-REGEX-1, no network).

qnfo-gateway may have generated or explanatory comments before its VERSION declaration. This suite parses the real worker
files in the repo and asserts that the canary, version-bump-guard.py and canonical_deploy.py read the same VERSION, and that
no CANARY_WORKERS entry is unwatched.
"""
import glob
import importlib.util
import json
import os
import re
import sys
import tempfile
import types
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

    # CANARY-AHEAD-1 (agent_issues 1000171): the incident replayed through run(). Push 7a9d293 carried 3.31.2-seo-index-8, a commit 15 s later
    # deployed 3.31.3-seo-index-9, /health answered the later version, and the canary reverted the healthy worker (3595289a) after 25 polls.
    def _run_canary(self, pushed_version, live_health):
        calls = {"revert": [], "issue": [], "functional": [], "ahead": []}
        clock = {"t": 0.0}
        names = ["git", "git_show", "fetch_health", "revert_push", "file_issue", "functional", "record_functional", "record_ahead", "poll"]
        saved = {n: getattr(cr, n) for n in names}
        real_poll = cr.poll
        cr.git = lambda args, check=True: 'var VERSION = "%s";\n' % pushed_version
        # DEPLOY-PROBES-1: qnfo-gateway's real probes.json and wrangler.toml at the pushed commit, nothing at its parent
        cr.git_show = lambda ref, path: read(path) if ref == "7a9d2935424f8ce69eb5f7e774930ccf27a5163d" and path in ("qnfo-gateway/probes.json", "qnfo-gateway/wrangler.toml") else None
        cr.fetch_health = lambda worker, timeout=10: live_health
        cr.revert_push = lambda pushed, failed, dry, why=None, bystanders=None: calls["revert"].append(failed) or {"sha": "r" * 40, "redeploy": ["canonical-deploy.yml"]}
        cr.file_issue = lambda *a, **k: calls["issue"].append(a) or "filed"
        cr.functional = lambda workers, *a, **k: calls["functional"].append(list(workers)) or {}
        cr.record_functional = lambda *a, **k: None
        cr.record_ahead = lambda acct, token, pushed, results: calls["ahead"].append(sorted(w for w, r in results.items() if r["state"] == "ahead")) or "ok"
        cr.poll = lambda wanted, minutes, poll_sec, **k: real_poll(wanted, minutes, poll_sec, fetch=cr.fetch_health, clock=lambda: clock["t"], sleep=lambda sec: clock.__setitem__("t", clock["t"] + sec))
        old_env = {k: os.environ.get(k) for k in ("CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "CANARY_FUNCTIONAL")}
        os.environ["CLOUDFLARE_ACCOUNT_ID"], os.environ["CLOUDFLARE_API_TOKEN"] = "acct", "tok"
        os.environ.pop("CANARY_FUNCTIONAL", None)
        out = []
        real_emit = cr.emit
        cr.emit = out.append
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as fh:
            fh.write("qnfo-gateway qnfo-gateway/worker.js\n")
            targets = fh.name
        try:
            a = types.SimpleNamespace(targets=targets, pushed="7a9d2935424f8ce69eb5f7e774930ccf27a5163d", canary_min=8, poll_sec=20, dry_run=False,
                                      no_revert=False, functional=None, functional_tries=1, functional_wait=0)
            rc = cr.run(a)
        finally:
            cr.emit = real_emit
            for n, f in saved.items():
                setattr(cr, n, f)
            for k, v in old_env.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
            os.unlink(targets)
        return rc, calls, out, clock["t"]

    def test_a_later_push_deployed_is_not_a_failed_deploy(self):
        rc, calls, out, waited = self._run_canary("3.31.2-seo-index-8", {"status": "ok", "version": "3.31.3-seo-index-9"})
        self.assertEqual(rc, 0)
        self.assertEqual(calls["revert"], [], "a live VERSION ahead of the pushed one must not revert the push")
        self.assertEqual(calls["issue"], [], "and files no CONTROL-PLANE-REVERTED-1 issue")
        self.assertEqual(calls["functional"], [[]], "the functional step is the later push's: nothing is checked for an ahead worker")
        self.assertEqual(waited, 0.0, "it answers at the first poll instead of waiting out the window")
        self.assertEqual(calls["ahead"], [["qnfo-gateway"]], "the avoided revert is written once to the ledger (record_ahead), not only logged")
        text = "\n".join(out)
        self.assertIn("CANARY-AHEAD-1", text)
        self.assertIn("canary: ahead ledger ok", text)
        self.assertIn("qnfo-gateway ahead (wanted 3.31.2-seo-index-8, saw 3.31.3-seo-index-9, 1 polls)", text)

    def test_a_lower_or_unarrived_version_still_reverts(self):
        for live in ({"status": "ok", "version": "3.31.1-older"}, {"status": "ok", "version": "3.31.2-other-suffix"}, {"status": "ok"}, None):
            rc, calls, out, waited = self._run_canary("3.31.2-seo-index-8", live)
            self.assertEqual(rc, 0)
            self.assertEqual(len(calls["revert"]), 1, "live %r: a push whose VERSION never arrived is still reverted" % (live,))
            self.assertEqual(len(calls["issue"]), 1, "live %r: and the issue is still filed" % (live,))
            self.assertGreaterEqual(waited, 8 * 60, "live %r: after the whole window" % (live,))
            self.assertEqual(calls["ahead"], [], "live %r: nothing is recorded as ahead" % (live,))
            self.assertNotIn("CANARY-AHEAD-1", "\n".join(out))

    def test_the_exact_version_still_runs_the_functional_step(self):
        rc, calls, out, waited = self._run_canary("3.31.2-seo-index-8", {"status": "ok", "version": "3.31.2-seo-index-8"})
        self.assertEqual((rc, calls["revert"], calls["functional"], calls["ahead"]), (0, [], [["qnfo-gateway"]], []))
        self.assertNotIn("CANARY-AHEAD-1", "\n".join(out))

    def test_record_ahead_writes_one_ledger_row_per_run(self):
        import apply_migrations
        writes = []
        real_d1 = apply_migrations.d1
        apply_migrations.d1 = lambda acct, token, db_id, sql, params=None: writes.append((acct, db_id, sql, params)) or []
        try:
            results = {"qnfo-gateway": {"want": "3.31.2-seo-index-8", "state": "ahead", "seen": "3.31.3-seo-index-9", "polls": 1},
                       "qnfo-ops": {"want": "2.0.0", "state": "ok", "seen": "2.0.0", "polls": 2}}
            self.assertEqual(cr.record_ahead("acct", "tok", "7a9d2935424f8ce69eb5f7e774930ccf27a5163d", results), "ok")
            self.assertEqual(cr.record_ahead("acct", "tok", "7a9d293", {"qnfo-ops": results["qnfo-ops"]}), None, "an exact-version run records nothing")
            self.assertEqual(cr.record_ahead(None, None, "7a9d293", results), None, "and no credential records nothing")
        finally:
            apply_migrations.d1 = real_d1
        self.assertEqual(len(writes), 1)
        acct, db_id, sql_text, params = writes[0]
        self.assertEqual((acct, db_id), ("acct", cr.DB_ID))
        self.assertIn("INSERT OR REPLACE INTO cloud_ops_events", sql_text)
        self.assertIn("'canary-ahead'", sql_text)
        self.assertEqual(params[0], "canary-ahead-7a9d2935424f-qnfo-gateway")
        self.assertEqual(params[1], "CANARY-AHEAD-1 push 7a9d293: qnfo-gateway wanted 3.31.2-seo-index-8, live 3.31.3-seo-index-9 is ahead after 1 poll")
        meta = json.loads(params[2])
        self.assertEqual((meta["workers"], meta["want"], meta["seen"]), (["qnfo-gateway"], {"qnfo-gateway": "3.31.2-seo-index-8"}, {"qnfo-gateway": "3.31.3-seo-index-9"}))


# DEPLOY-PROBES-1: the generalised functional step, replayed through run() for a worker outside the control plane.
dp = cr.DP  # the module instance canary_revert uses, so patching dp.fetch_text reaches it
PUSHED = "c0ffee1c0ffee1c0ffee1c0ffee1c0ffee1c0ffe"
WORKER = "qnfo-evolve"
DECL = {"mode": "revert", "health": "https://qnfo-evolve.q08.workers.dev/health",
        "http": [{"url": "https://qnfo-evolve.q08.workers.dev/health", "contains": ["MARKER"]}]}


class ProbeFlow(unittest.TestCase):
    def _run(self, answer, decl=DECL, base_decl=DECL, baseline=None, created=False, later=None, no_revert=False, health_version="1.0.1"):
        calls = {"revert": [], "issue": [], "probe_issue": []}
        names = ["git", "git_show", "fetch_health", "revert_push", "file_issue", "file_probe_issue", "record_functional", "record_ahead", "later_commits", "emit", "poll"]
        saved = {n: getattr(cr, n) for n in names}
        saved_fetch = dp.fetch_text
        cr.git = lambda args, check=True: 'var VERSION = "1.0.1";\n'

        def show(ref, path):
            if path == WORKER + "/wrangler.toml":
                return 'name = "qnfo-evolve"\n'
            if path == WORKER + "/probes.json":
                d = decl if ref == PUSHED else base_decl
                return None if d is None else json.dumps(d)
            if path == WORKER + "/worker.js":
                return "x"
            return None
        cr.git_show = show
        cr.fetch_health = lambda worker, timeout=10: {"version": health_version}
        cr.revert_push = lambda pushed, failed, dry, why=None, bystanders=None: calls["revert"].append((failed, why, bystanders)) or {"sha": "r" * 40, "redeploy": ["canonical-deploy.yml"]}
        cr.file_issue = lambda *a, **k: calls["issue"].append(a) or "filed"
        cr.file_probe_issue = lambda acct, token, pushed, worker, probes, kind: calls["probe_issue"].append((worker, kind, [q["reason"] for q in probes])) or "filed"
        cr.record_functional = lambda *a, **k: None
        cr.record_ahead = lambda *a, **k: None
        cr.later_commits = lambda pushed, d: list(later or [])
        clock = {"t": 0.0}
        real_poll = cr.poll
        cr.poll = lambda wanted, minutes, poll_sec, **k: real_poll(wanted, minutes, poll_sec, fetch=cr.fetch_health, clock=lambda: clock["t"], sleep=lambda sec: clock.__setitem__("t", clock["t"] + sec))
        out = []
        cr.emit = out.append
        dp.fetch_text = lambda url, timeout=25: answer
        old_env = {k: os.environ.get(k) for k in ("CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "CANARY_FUNCTIONAL")}
        os.environ["CLOUDFLARE_ACCOUNT_ID"], os.environ["CLOUDFLARE_API_TOKEN"] = "acct", "tok"
        os.environ.pop("CANARY_FUNCTIONAL", None)
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as fh:
            fh.write(WORKER + " " + WORKER + "/worker.js" + (" create" if created else "") + "\nqnfo-other qnfo-other/worker.js\n")
            targets = fh.name
        bfile = None
        if baseline is not None:
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
                json.dump({WORKER: baseline}, fh)
                bfile = fh.name
        try:
            a = types.SimpleNamespace(targets=targets, pushed=PUSHED, canary_min=1, poll_sec=1, dry_run=False, no_revert=no_revert, functional=None,
                                      functional_tries=2, functional_wait=0, baseline_file=bfile, base=None)
            real_sleep = cr.time.sleep
            cr.time.sleep = lambda s_: None
            try:
                rc = cr.run(a)
            finally:
                cr.time.sleep = real_sleep
        finally:
            for n, f in saved.items():
                setattr(cr, n, f)
            dp.fetch_text = saved_fetch
            for k, v in old_env.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
            os.unlink(targets)
            if bfile:
                os.unlink(bfile)
        return rc, calls, out

    def key(self):
        return dp.probe_list(DECL)[0][0]

    def test_a_probe_that_passed_before_and_fails_after_reverts_the_push(self):
        rc, calls, out = self._run((200, "no marker here"), baseline=None)
        self.assertEqual(rc, 0)
        self.assertEqual(len(calls["revert"]), 1, "a regression reverts the push")
        failed, why, bystanders = calls["revert"][0]
        self.assertEqual(failed, [(WORKER, WORKER, "1.0.1")])
        self.assertIn("marker MARKER absent", why[WORKER])
        self.assertEqual(len(calls["issue"]), 1, "and the closed-loop issue is filed")
        title = cr.issue_text(PUSHED, {WORKER: {"want": "1.0.1", "state": "failed:functional", "seen": "1.0.1", "polls": 1, "functional": "x"}}, {"sha": "r" * 40, "redeploy": ["canonical-deploy.yml"]})[0]
        self.assertTrue(title.startswith("DEPLOY-PROBE-REVERTED-1"), title)

    def test_a_probe_that_passes_reverts_nothing(self):
        rc, calls, out = self._run((200, "all good MARKER"))
        self.assertEqual((rc, calls["revert"], calls["issue"], calls["probe_issue"]), (0, [], [], []))
        self.assertIn("passes its probes", "\n".join(out))

    def test_a_failure_that_was_declared_and_already_failing_is_filed_not_reverted(self):
        rc, calls, out = self._run((200, "nope"), baseline={self.key(): "fail"})
        self.assertEqual((calls["revert"], calls["issue"]), ([], []))
        self.assertEqual([(w, k) for w, k, _ in calls["probe_issue"]], [(WORKER, "pre-existing")])

    def test_a_probe_the_push_itself_declares_is_its_own_even_if_it_failed_before(self):
        rc, calls, out = self._run((200, "nope"), base_decl=None, baseline={self.key(): "fail"})
        self.assertEqual(len(calls["revert"]), 1)

    def test_a_worker_created_by_the_push_is_observed_never_reverted(self):
        rc, calls, out = self._run((200, "nope"), created=True)
        self.assertEqual(calls["revert"], [], "a revert would delete files of a worker that stays deployed")
        self.assertEqual([(w, k) for w, k, _ in calls["probe_issue"]], [(WORKER, "observed")])

    def test_observe_mode_and_verify_only_runs_never_revert(self):
        rc, calls, out = self._run((200, "nope"), decl=dict(DECL, mode="observe"))
        self.assertEqual((calls["revert"], [k for _, k, _ in calls["probe_issue"]]), ([], ["observed"]))
        rc, calls, out = self._run((200, "nope"), no_revert=True)
        self.assertEqual((calls["revert"], [k for _, k, _ in calls["probe_issue"]]), ([], ["observed"]))

    def test_an_inconclusive_answer_reverts_nothing(self):
        rc, calls, out = self._run((0, "name resolution failed"))
        self.assertEqual((calls["revert"], calls["issue"], calls["probe_issue"]), ([], [], []))
        self.assertIn("inconclusive", "\n".join(out))

    def test_a_later_push_that_changed_the_worker_owns_the_verdict(self):
        rc, calls, out = self._run((200, "nope"), later=["abc1234"])
        self.assertEqual((calls["revert"], calls["issue"]), ([], []))
        self.assertIn("owns the verdict", "\n".join(out))
        self.assertEqual([k for _, k, _ in calls["probe_issue"]], ["observed"])

    def test_the_version_poll_of_a_declared_health_url_still_gates_the_probes(self):
        rc, calls, out = self._run((200, "all good MARKER"), health_version="0.9.0")
        self.assertEqual(len(calls["revert"]), 1, "the VERSION never arrived: reverted exactly like a control-plane worker")

    def test_every_repository_declaration_is_valid_and_its_workers_are_deployable(self):
        self.assertEqual(dp.validate_repo(), [])
        control_plane = set(cr.CANARY_WORKERS)
        for d in dp.worker_dirs(ROOT):
            if not os.path.exists(os.path.join(ROOT, d, "probes.json")):
                continue
            decl = json.loads(read(d + "/probes.json"))
            self.assertTrue(dp.probe_list(decl), d + " declares no probe")
            if d not in control_plane and decl.get("health"):
                self.assertRegex(read(d + "/worker.js"), r'(?m)^var\s+VERSION\s*=\s*"', d + " declares health but has no line-start var VERSION: the canary could not read the pushed VERSION")


if __name__ == "__main__":
    unittest.main()
