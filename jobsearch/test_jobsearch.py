"""python -I test_jobsearch.py  -- verifier must reject every tampering; matcher gates must hold."""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import match, tailor

JOB = {"id": "t:1", "company": "Acme", "title": "Research Program Manager", "location": "Amsterdam, Netherlands", "url": "u",
       "desc": "Lead our research program and research operations. LLM evaluation, responsible AI, public sector work, government agencies. Audit and reproducibility."}


class T(unittest.TestCase):
    def setUp(self):
        self.m = match.evaluate(JOB)
        self.res = tailor.build_resume(JOB, self.m)
        self.note = tailor.build_note(JOB, self.m)

    def test_clean_passes(self):
        self.assertEqual(self.m["status"], "ok")
        self.assertEqual(tailor.verify(self.res, JOB), [])
        self.assertEqual(tailor.verify(self.note, JOB), [])

    def test_inflated_number_rejected(self):
        self.assertTrue(tailor.verify(self.res.replace("$1.5M+", "$15M+"), JOB) or "$1.5M" not in self.res)
        bad = self.res.replace("44+", "400+").replace("50+ data", "500+ data").replace("20+ academic", "200+ academic")
        self.assertNotEqual(bad, self.res)
        self.assertTrue(tailor.verify(bad, JOB))

    def test_invented_skill_rejected(self):
        bad = self.res + "- Expert in Kubernetes and PyTorch. <!--F:F06-->\n"
        v = tailor.verify(bad, JOB)
        self.assertTrue(any("kubernetes" in x or "ledger fact" in x for x in v))

    def test_untagged_line_rejected(self):
        self.assertTrue(tailor.verify(self.note + "I also hold a PhD.\n", JOB))

    def test_edited_fact_rejected(self):
        bad = self.res.replace("Managed a", "Directed a", 1)
        if bad != self.res:
            self.assertTrue(tailor.verify(bad, JOB))

    def test_quoted_term_must_be_in_posting(self):
        bad = self.note.replace('"research program"', '"quantum cryptography"')
        if bad != self.note:
            self.assertTrue(tailor.verify(bad, JOB))

    def test_freeform_checker(self):
        self.assertEqual(tailor.verify_freeform("I managed a $1.5M+ portfolio at the Federal Highway Administration.", ["F01"]), [])
        self.assertTrue(tailor.verify_freeform("I managed a $15M portfolio at Google.", ["F01"]))

    def test_gates(self):
        for title, loc in [("Sales Lead, Research", "Amsterdam"), ("Research Scientist", "Amsterdam"), ("Intern, Research Program", "Amsterdam"),
                           ("Research Program Manager", "Remote - US only")]:
            self.assertEqual(match.evaluate({**JOB, "title": title, "location": loc})["status"], "excluded", (title, loc))

    def test_anywhere_is_flagged_not_dropped(self):
        r = match.evaluate({**JOB, "location": "Tokyo, Japan"})
        self.assertEqual(r["status"], "ok")
        self.assertTrue(any("visa" in f for f in r["flags"]))

    def test_us_is_flagged_not_hidden(self):
        r = match.evaluate({**JOB, "location": "San Francisco, CA"})
        self.assertEqual(r["status"], "ok")
        self.assertTrue(any(f.startswith("LOCATION") for f in r["flags"]))

    def test_phd_flag(self):
        r = match.evaluate({**JOB, "desc": JOB["desc"] + " A PhD is required."})
        self.assertTrue(any(f.startswith("DEGREE") for f in r["flags"]))

    def test_ledger_texts_unique_numbers_match_cv(self):
        import json
        cv = open(os.path.expanduser("~/Documents/Rowan Brad Quni-Gudzinas - CV (verified, corrected).md"), encoding="utf-8").read() if os.path.exists(os.path.expanduser("~/Documents/Rowan Brad Quni-Gudzinas - CV (verified, corrected).md")) else None
        if cv:
            for n in ["$1.5M+", "44+", "50+", "20+", "17 quantum"]:
                self.assertIn(n, cv)


if __name__ == "__main__":
    unittest.main(verbosity=2)
