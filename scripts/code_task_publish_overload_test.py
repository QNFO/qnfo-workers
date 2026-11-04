#!/usr/bin/env python3
"""D1-OVERLOAD-RETRY-1: D1Store._q retries an HTTP 429 overload (statement rejected unrun), reads and writes alike.

Run: python3 scripts/code_task_publish_overload_test.py
"""
import importlib.util
import io
import json
import os
import unittest
import urllib.error
from unittest.mock import patch

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("code_task_publish", os.path.join(HERE, "code-task-publish.py"))
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)


class Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def ok():
    return Resp(json.dumps({"success": True, "result": [{"results": [{"n": 1}], "meta": {"changes": 1}}]}).encode())


def busy(code=429):
    body = io.BytesIO(json.dumps({"errors": [{"message": "D1 DB is overloaded"}]}).encode())
    return urllib.error.HTTPError("u", code, "x", {}, body)


class Overload(unittest.TestCase):
    def run_q(self, sql, answers):
        seq = iter(answers)

        def fake(req, timeout=0):
            a = next(seq)
            if isinstance(a, Exception):
                raise a
            return a

        waits = []
        env = {"CF_ACCOUNT_ID": "a", "CLOUDFLARE_API_TOKEN": "t"}
        with patch.dict(os.environ, env), patch.object(P.urllib.request, "urlopen", fake), \
                patch.object(P.time, "sleep", waits.append):
            return P.D1Store()._q(sql, []), waits

    def test_write_retried_on_429(self):
        out, waits = self.run_q("UPDATE t SET a=1", [busy(), busy(), ok()])
        self.assertEqual(out["meta"]["changes"], 1)
        self.assertEqual(waits, [3, 8])

    def test_read_retried_on_429(self):
        out, waits = self.run_q("SELECT 1", [busy(), ok()])
        self.assertEqual(out["results"], [{"n": 1}])
        self.assertEqual(waits, [3])

    def test_gives_up_with_the_error(self):
        with self.assertRaises(RuntimeError) as c:
            self.run_q("SELECT 1", [busy()] * 6)
        self.assertIn("D1 HTTP 429", str(c.exception))

    def test_other_http_error_not_retried(self):
        with self.assertRaises(RuntimeError) as c:
            self.run_q("SELECT 1", [busy(500), ok()])
        self.assertIn("D1 HTTP 500", str(c.exception))


if __name__ == "__main__":
    unittest.main()
