import math
import unittest

from agentic_collapse import Params, collapse_stats, phi_drift, phi_nullcline, simulate, speed_limit


class ModelTests(unittest.TestCase):
    def test_deterministic_for_seed(self):
        a, b = simulate(Params(), seed=7), simulate(Params(), seed=7)
        self.assertEqual(a.phi, b.phi)
        self.assertEqual(a.resets, b.resets)
        self.assertNotEqual(simulate(Params(), seed=8).phi, a.phi)

    def test_grid_length(self):
        tr = simulate(Params(t_end=10, dt=0.05))
        self.assertEqual(len(tr.t), 201)
        self.assertAlmostEqual(tr.t[-1], 10.0)

    def test_noise_free_without_guillotine_matches_nullcline(self):
        # sigma = 0 and a frozen verifier: phi must settle on the phi nullcline for psi = 0.
        p = Params(sigma_phi=0, sigma_u=0, beta=0, lam=0, t_end=200)
        tr = simulate(p, seed=None, guillotine=False)
        self.assertAlmostEqual(tr.phi[-1], phi_nullcline(0.0, p), places=4)
        self.assertAlmostEqual(tr.phi[-1], 1 - p.gamma / p.alpha, places=4)

    def test_zero_lag_equals_undelayed_dynamics(self):
        p = Params(tau=0.0, sigma_phi=0, sigma_u=0, t_end=5)
        tr = simulate(p, seed=None, guillotine=False)
        # One explicit Euler step from the initial state, computed by hand.
        phi1 = p.phi0 + phi_drift(p.phi0, p.psi0, p) * p.dt
        self.assertAlmostEqual(tr.phi[1], phi1, places=12)

    def test_delay_uses_history(self):
        # With a lag, the first steps see the initial psi, not the current one.
        p = Params(tau=1.0, sigma_phi=0, sigma_u=0, t_end=2, beta=5.0)
        tr = simulate(p, seed=None, guillotine=False)
        i = 10  # t = 0.5 < tau, so the delayed psi is psi0
        expected = tr.phi[i] + phi_drift(tr.phi[i], p.psi0, p) * p.dt
        self.assertAlmostEqual(tr.phi[i + 1], expected, places=12)

    def test_guillotine_resets_to_initial_state(self):
        p = Params(u_crit=0.12, sigma_u=0, sigma_phi=0)
        tr = simulate(p, seed=0)
        self.assertTrue(tr.resets)
        i = int(round(tr.resets[0] / p.dt))
        self.assertEqual((tr.phi[i], tr.psi[i], tr.u[i]), (p.phi0, p.psi0, p.u0))
        self.assertTrue(all(u <= p.u_crit for u in tr.u))

    def test_no_guillotine_lets_u_exceed_threshold(self):
        p = Params(u_crit=0.12, sigma_u=0, sigma_phi=0)
        self.assertGreater(max(simulate(p, seed=0, guillotine=False).u), p.u_crit)

    def test_clip_keeps_state_in_range(self):
        tr = simulate(Params(sigma_phi=1.0, sigma_u=1.0), seed=3)
        self.assertTrue(all(0 <= x <= 1 for x in tr.phi + tr.psi))
        self.assertTrue(all(u >= 0 for u in tr.u))

    def test_validation(self):
        with self.assertRaises(ValueError):
            Params(dt=0).validate()
        with self.assertRaises(ValueError):
            Params(tau=-1).validate()
        with self.assertRaises(ValueError):
            Params().with_(mu=-0.1)

    def test_first_passage_probability_grows_with_horizon(self):
        # The paper's claim that perfect stability is impossible, in its checkable form: with noise
        # on U the probability of at least one crossing is non-decreasing in the horizon.
        p = Params(mu=0.3, kappa=0.3)
        short = collapse_stats(p.with_(t_end=20), runs=60).probability
        long = collapse_stats(p.with_(t_end=200), runs=60).probability
        self.assertLessEqual(short, long)

    def test_wilson_interval_contains_estimate(self):
        st = collapse_stats(Params(t_end=30), runs=40)
        lo, hi = st.wilson_interval()
        self.assertTrue(lo <= st.probability <= hi)

    def test_speed_limit_shape(self):
        rows = speed_limit(Params(t_end=30), taus=(0.0, 3.0), alphas=(0.2, 0.85), runs=10)
        self.assertEqual([r["tau"] for r in rows], [0.0, 3.0])
        self.assertTrue(all(set(r["collapse_probability"]) == {0.2, 0.85} for r in rows))


if __name__ == "__main__":
    unittest.main()
