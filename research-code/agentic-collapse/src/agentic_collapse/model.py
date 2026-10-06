"""The Agentic Collapse model: a time-delayed stochastic system (phi, psi, U).

Equations are those of Sections 2.2 to 2.6 of the paper (DOI 10.5281/zenodo.18133065):

    d phi = ( alpha*phi*(1-phi) - gamma*(phi(t) - psi(t - tau)) ) dt + sigma_phi dW
    beta_eff = beta / (1 + k*phi)
    d psi = ( beta_eff*(phi(t - tau) - psi) - lam*U*psi ) dt
    d U   = ( -kappa*U + mu*|phi(t) - psi(t)| ) dt + sigma_U dW
    IF U > U_crit THEN reset to the initial state  (the "Popperian Guillotine")

Integrated with Euler-Maruyama and a rolling history buffer for the delay (Section 3.1).
"""
from __future__ import annotations

import math
import random
from dataclasses import asdict, dataclass, field, replace
from typing import Dict, List, Optional

# Parameters the paper does not state. They are needed to run the model at all, so they are
# exposed, defaulted and listed here; any result that depends on them must say so.
ASSUMED = ("beta", "lam", "kappa", "mu", "clip")


@dataclass(frozen=True)
class Params:
    # Stated in the paper (Section 3.2 and 3.3).
    alpha: float = 0.85        # generative drive
    gamma: float = 0.65        # coupling strength
    k: float = 2.5             # orchestration penalty
    tau: float = 3.0           # System 2 lag
    u_crit: float = 0.88       # guillotine threshold
    sigma_phi: float = 0.06
    sigma_u: float = 0.03
    dt: float = 0.05
    t_end: float = 100.0
    phi0: float = 0.15
    psi0: float = 0.0
    u0: float = 0.1
    # Not stated in the paper (see ASSUMED).
    beta: float = 1.0          # base verification rate
    lam: float = 0.5           # potential-driven verification decay
    kappa: float = 0.1         # potential relaxation rate
    mu: float = 0.5            # dissonance-to-potential gain
    clip: bool = True          # keep phi, psi in [0, 1] and U >= 0

    def validate(self) -> "Params":
        if self.dt <= 0 or self.t_end <= 0:
            raise ValueError("dt and t_end must be positive")
        if self.tau < 0:
            raise ValueError("tau must be non-negative")
        for name in ("sigma_phi", "sigma_u", "k", "beta", "kappa", "lam", "mu"):
            if getattr(self, name) < 0:
                raise ValueError(f"{name} must be non-negative")
        return self

    def with_(self, **kw) -> "Params":
        return replace(self, **kw).validate()


@dataclass
class Trajectory:
    params: Params
    seed: Optional[int]
    t: List[float] = field(default_factory=list)
    phi: List[float] = field(default_factory=list)
    psi: List[float] = field(default_factory=list)
    u: List[float] = field(default_factory=list)
    resets: List[float] = field(default_factory=list)   # times at which the guillotine fired

    @property
    def collapsed(self) -> bool:
        return bool(self.resets)

    @property
    def first_collapse(self) -> Optional[float]:
        return self.resets[0] if self.resets else None

    def at(self, time: float) -> Dict[str, float]:
        i = min(len(self.t) - 1, max(0, int(round(time / self.params.dt))))
        return {"t": self.t[i], "phi": self.phi[i], "psi": self.psi[i], "u": self.u[i]}

    def to_dict(self) -> dict:
        return {"params": asdict(self.params), "seed": self.seed, "t": self.t, "phi": self.phi,
                "psi": self.psi, "u": self.u, "resets": self.resets}


def simulate(params: Params = Params(), seed: Optional[int] = 0, guillotine: bool = True) -> Trajectory:
    """Run one trajectory. Same params and seed give the same trajectory on every platform."""
    p = params.validate()
    rnd = random.Random(seed)
    n = int(round(p.t_end / p.dt))
    lag = int(round(p.tau / p.dt))
    sq = math.sqrt(p.dt)
    tr = Trajectory(params=p, seed=seed, t=[0.0], phi=[p.phi0], psi=[p.psi0], u=[p.u0])
    # Index from which the delay buffer is valid: a reset discards the pre-reset history
    # ("discard its unverified context"), so delayed values never reach back across a reset.
    epoch = 0
    for i in range(n):
        phi, psi, u = tr.phi[-1], tr.psi[-1], tr.u[-1]
        j = max(epoch, i - lag)
        phi_d, psi_d = tr.phi[j], tr.psi[j]
        beta_eff = p.beta / (1.0 + p.k * phi)
        dw1, dw2 = rnd.gauss(0.0, sq), rnd.gauss(0.0, sq)
        phi_n = phi + (p.alpha * phi * (1 - phi) - p.gamma * (phi - psi_d)) * p.dt + p.sigma_phi * dw1
        psi_n = psi + (beta_eff * (phi_d - psi) - p.lam * u * psi) * p.dt
        u_n = u + (-p.kappa * u + p.mu * abs(phi - psi)) * p.dt + p.sigma_u * dw2
        if p.clip:
            phi_n, psi_n, u_n = min(1.0, max(0.0, phi_n)), min(1.0, max(0.0, psi_n)), max(0.0, u_n)
        t_n = round((i + 1) * p.dt, 10)
        if guillotine and u_n > p.u_crit:
            tr.resets.append(t_n)
            phi_n, psi_n, u_n = p.phi0, p.psi0, p.u0
            epoch = i + 1
        tr.t.append(t_n)
        tr.phi.append(phi_n)
        tr.psi.append(psi_n)
        tr.u.append(u_n)
    return tr


def phi_drift(phi: float, psi_delayed: float, params: Params = Params()) -> float:
    """Deterministic part of d phi / dt at a given state."""
    return params.alpha * phi * (1 - phi) - params.gamma * (phi - psi_delayed)


def phi_nullcline(psi_delayed: float, params: Params = Params()) -> float:
    """The stable root of phi_drift = 0 in [0, 1] for a fixed delayed psi.

    alpha*phi*(1-phi) = gamma*(phi - psi)  =>  alpha*phi^2 + (gamma - alpha)*phi - gamma*psi = 0
    """
    a, b, c = params.alpha, params.gamma - params.alpha, -params.gamma * psi_delayed
    if a == 0:
        return psi_delayed
    disc = b * b - 4 * a * c
    return (-b + math.sqrt(disc)) / (2 * a)
