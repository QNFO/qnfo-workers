# SPDX-License-Identifier: LicenseRef-QNFO-ULA-2.1
# Copyright (c) 2026 Rowan Brad Quni-Gudzinas
# Licensed under QNFO-ULA v2.1 (Software Terms, Section 12): https://qnfo.org/legal/license
# Non-commercial use only; commercial use requires a separate agreement.
"""Monte Carlo analysis: collapse probability and the Epistemic Speed Limit."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Optional, Sequence

from .model import Params, phi_drift, phi_nullcline, simulate


@dataclass
class CollapseStats:
    runs: int
    collapsed: int
    mean_resets: float
    median_first_collapse: Optional[float]

    @property
    def probability(self) -> float:
        return self.collapsed / self.runs if self.runs else 0.0

    def wilson_interval(self, z: float = 1.96) -> tuple:
        """95% Wilson score interval for the collapse probability."""
        n, p = self.runs, self.probability
        if n == 0:
            return (0.0, 1.0)
        denom = 1 + z * z / n
        centre = (p + z * z / (2 * n)) / denom
        half = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / denom
        return (max(0.0, centre - half), min(1.0, centre + half))


def collapse_stats(params: Params = Params(), runs: int = 200, seed0: int = 0) -> CollapseStats:
    firsts: List[float] = []
    resets = 0
    for s in range(seed0, seed0 + runs):
        tr = simulate(params, seed=s)
        resets += len(tr.resets)
        if tr.first_collapse is not None:
            firsts.append(tr.first_collapse)
    firsts.sort()
    med = firsts[len(firsts) // 2] if firsts else None
    return CollapseStats(runs=runs, collapsed=len(firsts), mean_resets=resets / runs if runs else 0.0,
                         median_first_collapse=med)


def speed_limit(params: Params = Params(), taus: Sequence[float] = (0.0, 1.0, 2.0, 3.0, 5.0),
                alphas: Sequence[float] = (0.2, 0.4, 0.6, 0.85, 1.2), target: float = 0.1,
                runs: int = 100) -> List[dict]:
    """For each lag tau, the largest generative drive alpha whose collapse probability stays <= target.

    This is the paper's "Epistemic Speed Limit" (Section 5) made measurable: throttle execution speed
    (alpha) to the cost of thought (tau). Returns one row per tau; alpha_max is None when even the
    smallest alpha tried exceeds the target.
    """
    rows = []
    for tau in taus:
        best = None
        probs = {}
        for a in sorted(alphas):
            st = collapse_stats(params.with_(tau=tau, alpha=a), runs=runs)
            probs[a] = st.probability
            if st.probability <= target:
                best = a
        rows.append({"tau": tau, "alpha_max": best, "collapse_probability": probs})
    return rows


def check_reported_states(reported: Iterable[dict], params: Params = Params()) -> List[dict]:
    """Compare states a paper reports against the deterministic phi dynamics.

    Each item is {"t": ..., "phi": ..., "psi": ...}; psi stands in for the delayed psi, which
    favours the paper whenever psi was rising. Returns the drift at the reported state and the
    stable phi for that psi. A large negative drift at a reported plateau means the state cannot
    persist under the stated equations without sustained noise.
    """
    out = []
    for r in reported:
        d = phi_drift(r["phi"], r["psi"], params)
        star = phi_nullcline(r["psi"], params)
        # Standard deviation of the noise accumulated over one time unit.
        sd_unit = params.sigma_phi
        out.append({**r, "phi_drift": round(d, 4), "phi_stable_for_psi": round(star, 4),
                    "gap": round(r["phi"] - star, 4),
                    "drift_in_noise_sd_per_unit_time": round(d / sd_unit, 2) if sd_unit else None})
    return out


# States reported in Section 4 of the paper (v1), for check_reported_states.
PAPER_V1_REPORTED = [
    {"t": 10.0, "phi": 0.7812, "psi": 0.1241, "label": "4.1 System 2 lag drag"},
    {"t": 45.0, "phi": 0.92, "psi": 0.71, "label": "4.3 System 2 stability plateau"},
    {"t": 60.0, "phi": 0.9612, "psi": 0.71, "label": "4.4 hallucination spike (psi assumed from 4.3)"},
    {"t": 100.0, "phi": 0.7812, "psi": 0.4102, "label": "4.6 terminal state"},
]
