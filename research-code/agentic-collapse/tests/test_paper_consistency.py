"""Checks of the published v1 trajectory against the published equations.

These tests document a finding, they do not hide it: with the stated alpha = 0.85 and gamma = 0.65,
the reported state at t = 10 (phi = 0.7812, psi = 0.1241) has a strongly negative phi drift, and the
stable phi for that psi is about 0.44. The reported trajectory therefore cannot come from the stated
phi equation and parameters alone. If a later paper version changes the equations or parameters,
update PAPER_V1_REPORTED's successor and these expectations together.
"""
import unittest

from agentic_collapse import PAPER_V1_REPORTED, Params, check_reported_states


class PaperConsistency(unittest.TestCase):
    def setUp(self):
        self.rows = {r["label"][:3]: r for r in check_reported_states(PAPER_V1_REPORTED, Params())}

    def test_t10_state_is_off_the_phi_nullcline(self):
        r = self.rows["4.1"]
        self.assertAlmostEqual(r["phi_stable_for_psi"], 0.447, places=3)
        self.assertLess(r["phi_drift"], -0.25)
        self.assertGreater(r["gap"], 0.3)

    def test_plateau_drift_is_negative(self):
        self.assertLess(self.rows["4.3"]["phi_drift"], -0.05)

    def test_drift_is_independent_of_unstated_parameters(self):
        # phi's drift uses only alpha and gamma, which the paper states; the finding does not
        # depend on any value in ASSUMED.
        a = check_reported_states(PAPER_V1_REPORTED, Params())
        b = check_reported_states(PAPER_V1_REPORTED, Params(beta=9, lam=9, kappa=9, mu=9))
        self.assertEqual([x["phi_drift"] for x in a], [x["phi_drift"] for x in b])


    def test_lag_effect_under_default_assumptions(self):
        # Finding, conditional on the assumed beta, lam, kappa, mu: at alpha = 0.6 a longer lag LOWERS
        # the collapse probability, because the coupling term pulls phi toward the verifier's psi and a
        # lagged psi stays near zero longer. The paper's narrative (lag drives collapse) is not
        # reproduced here; whether it holds depends on the parameters v1 does not state.
        from agentic_collapse import collapse_stats
        p = Params(alpha=0.6, t_end=30)
        no_lag = collapse_stats(p.with_(tau=0.0), runs=100).probability
        long_lag = collapse_stats(p.with_(tau=6.0), runs=100).probability
        self.assertGreater(no_lag - long_lag, 0.3)


if __name__ == "__main__":
    unittest.main()
