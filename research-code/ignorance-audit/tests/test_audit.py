# SPDX-License-Identifier: LicenseRef-QNFO-ULA-2.1
# Copyright (c) 2026 Rowan Brad Quni-Gudzinas
# Licensed under QNFO-ULA v2.1 (Software Terms, Section 12): https://qnfo.org/legal/license
# Non-commercial use only; commercial use requires a separate agreement.
import io
import json
import unittest
from contextlib import redirect_stdout

from ignorance_audit import PHASES, QUESTIONS, Audit, administer
from ignorance_audit.cli import main


def full(target="the JPCUB metric"):
    a = Audit(target=target)
    for q in QUESTIONS:
        a.answer(q.number, f"answer {q.number}")
    return a


class InstrumentTests(unittest.TestCase):
    def test_shape(self):
        self.assertEqual(len(QUESTIONS), 15)
        self.assertEqual([q.number for q in QUESTIONS], list(range(1, 16)))
        self.assertEqual(sorted({q.phase for q in QUESTIONS}), sorted(PHASES))
        # depth ordering: phases never go backwards
        phases = [q.phase for q in QUESTIONS]
        self.assertEqual(phases, sorted(phases))
        self.assertEqual(len({q.key for q in QUESTIONS}), 15)


class ProtocolTests(unittest.TestCase):
    def test_complete_audit(self):
        self.assertEqual(full().problems(), [])

    def test_target_required(self):
        a = full("  ")
        self.assertTrue(any(p.startswith("rule 1") for p in a.problems()))

    def test_skipping_is_forbidden(self):
        a = full()
        del a.answers[10]
        self.assertIn("question 10", " ".join(a.problems()))

    def test_inapplicable_needs_stretch(self):
        a = full()
        a.answer(11, "not relevant to a metric", inapplicable=True)
        self.assertIn("without a stretch", " ".join(a.problems()))
        a.answer(11, "not relevant to a metric", inapplicable=True, stretch="the unease is about who measures")
        self.assertTrue(a.complete)

    def test_unknown_question(self):
        with self.assertRaises(KeyError):
            Audit("x").answer(16, "no")

    def test_meta_question_seeds_next_pass(self):
        a = full()
        a.answer(15, "Why do we trust wall-plug power?")
        nxt = a.next_pass()
        self.assertEqual(nxt.pass_number, 2)
        self.assertEqual(nxt.parent_seed, "Why do we trust wall-plug power?")
        with self.assertRaises(ValueError):
            Audit("x").next_pass()

    def test_finding_categories(self):
        a = full()
        a.add_finding("scaffold", "assumes the baseline is classical", 1)
        with self.assertRaises(ValueError):
            a.add_finding("vibes", "no")


class SerialisationTests(unittest.TestCase):
    def test_json_round_trip(self):
        a = full()
        a.add_finding("map_territory", "metric taken for the thing", 2)
        b = Audit.from_json(a.to_json())
        self.assertEqual(a.to_dict(), b.to_dict())

    def test_markdown_lists_problems(self):
        md = Audit(target="X").to_markdown()
        self.assertIn("## Phase 5: Act", md)
        self.assertIn("rule 2: question 1", md)
        self.assertIn("Complete:", full().to_markdown())


class AdministerTests(unittest.TestCase):
    def test_depth_order_and_scaffolding(self):
        prompts = []

        def model(p):
            prompts.append(p)
            return f"reply {len(prompts)}"

        a = administer("the agentic collapse model", model)
        self.assertTrue(a.complete)
        self.assertEqual(len(prompts), 15)
        self.assertIn("Question 1 ", prompts[0])
        self.assertNotIn("Earlier answers", prompts[0])
        self.assertIn("Q14 Relational ignorance: reply 14", prompts[14])
        self.assertIn("about the agentic collapse model", prompts[7])

    def test_empty_target_refused(self):
        with self.assertRaises(ValueError):
            administer("", lambda p: "x")

    def test_empty_replies_fail_the_protocol(self):
        a = administer("x", lambda p: "")
        self.assertEqual(len(a.problems()), 15)


class CliTests(unittest.TestCase):
    def run_cli(self, *args):
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = main(list(args))
        return code, buf.getvalue()

    def test_questions(self):
        code, out = self.run_cli("questions")
        self.assertEqual(code, 0)
        self.assertIn("15. Recursive meta-question", out)

    def test_new_check_render(self):
        import os
        import tempfile
        _, out = self.run_cli("new", "my claim")
        self.assertEqual(json.loads(out)["target"], "my claim")
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.json")
            with open(p, "w") as fh:
                fh.write(out)
            code, msg = self.run_cli("check", p)
            self.assertEqual(code, 1)
            self.assertIn("15 protocol problem(s)", msg)
            with open(p, "w") as fh:
                fh.write(full().to_json())
            self.assertEqual(self.run_cli("check", p)[0], 0)
            self.assertIn("# Ignorance audit", self.run_cli("render", p)[1])


if __name__ == "__main__":
    unittest.main()
