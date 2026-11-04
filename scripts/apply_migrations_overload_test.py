import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import apply_migrations as m  # noqa: E402

BUSY = (429, {"success": False, "errors": [{"code": 7429, "message": "D1 DB is overloaded"}]})
OK = (200, {"success": True, "result": [{"results": [{"n": 1}]}]})


class Retry(unittest.TestCase):
    def run_d1(self, answers):
        it = iter(answers)
        waits = []
        out = m.d1("a", "t", "db", "SELECT 1", sleep=waits.append, call=lambda *a, **k: next(it))
        return out, waits

    def test_overload_then_ok(self):
        out, waits = self.run_d1([BUSY, BUSY, OK])
        self.assertEqual(out, [{"n": 1}])
        self.assertEqual(waits, [3, 8])

    def test_gives_up_with_the_error(self):
        with self.assertRaises(RuntimeError) as c:
            self.run_d1([BUSY] * 5)
        self.assertIn("7429", str(c.exception))

    def test_other_error_not_retried(self):
        bad = (400, {"success": False, "errors": [{"code": 7400, "message": "syntax"}]})
        with self.assertRaises(RuntimeError):
            self.run_d1([bad, OK])


if __name__ == "__main__":
    unittest.main()
