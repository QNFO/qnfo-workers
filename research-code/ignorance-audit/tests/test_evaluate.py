import unittest

from ignorance_audit import Case, load_jsonl, score


class ScoreTests(unittest.TestCase):
    def test_audit_adds_nothing(self):
        r = score([Case("d1", {"e1"}, {"e1", "e2"})])
        self.assertEqual(r["audit_only_findings"], 0)
        self.assertFalse(r["claim_supported"])

    def test_audit_only_finding_in_category(self):
        r = score([Case("d1", {"e1", "e3"}, {"e1"}, category={"e3": "scaffold"})])
        self.assertEqual(r["per_category"]["scaffold"], 1)
        self.assertTrue(r["claim_supported"])
        self.assertIsNone(r["audit_only_precision"])

    def test_ground_truth_filters_false_positives(self):
        cases = [Case("d1", {"e3", "e4"}, set(), truth={"e3"}, category={"e3": "map_territory", "e4": "scaffold"})]
        r = score(cases)
        self.assertEqual(r["audit_only_true_findings"], 1)
        self.assertEqual(r["audit_only_precision"], 0.5)
        self.assertEqual(r["per_category"], {"scaffold": 0, "map_territory": 1, "protected_ignorance": 0})

    def test_uncategorised_findings_do_not_support_the_claim(self):
        r = score([Case("d1", {"e9"}, set())])
        self.assertEqual(r["audit_only_findings"], 1)
        self.assertFalse(r["claim_supported"])

    def test_jsonl(self):
        cases = load_jsonl(['{"doc_id":"a","audit_found":["x"],"baseline_found":[],"category":{"x":"scaffold"}}', ""])
        self.assertEqual(len(cases), 1)
        self.assertTrue(score(cases)["claim_supported"])


if __name__ == "__main__":
    unittest.main()
