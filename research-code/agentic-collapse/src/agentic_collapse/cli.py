# SPDX-License-Identifier: LicenseRef-QNFO-ULA-2.1
# Copyright (c) 2026 Rowan Brad Quni-Gudzinas
# Licensed under QNFO-ULA v2.1 (Software Terms, Section 12): https://qnfo.org/legal/license
# Non-commercial use only; commercial use requires a separate agreement.
"""Command line: python -m agentic_collapse {run,stats,speed-limit,check-paper}."""
from __future__ import annotations

import argparse
import json
import sys

from . import __version__
from .analysis import PAPER_V1_REPORTED, check_reported_states, collapse_stats, speed_limit
from .model import ASSUMED, Params, simulate


def _params(ns) -> Params:
    kw = {k: getattr(ns, k) for k in ("alpha", "gamma", "k", "tau", "u_crit", "beta", "lam", "kappa", "mu", "t_end")
          if getattr(ns, k, None) is not None}
    return Params().with_(**kw)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="agentic-collapse", description=__doc__)
    ap.add_argument("--version", action="version", version=__version__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("run", "stats", "speed-limit", "check-paper"):
        sp = sub.add_parser(name)
        for k in ("alpha", "gamma", "k", "tau", "u_crit", "beta", "lam", "kappa", "mu", "t_end"):
            sp.add_argument(f"--{k.replace('_', '-')}", dest=k, type=float)
        if name == "run":
            sp.add_argument("--seed", type=int, default=0)
            sp.add_argument("--every", type=float, default=10.0, help="print one row per this many time units")
            sp.add_argument("--json", action="store_true")
        if name in ("stats", "speed-limit"):
            sp.add_argument("--runs", type=int, default=200)
    ns = ap.parse_args(argv)
    p = _params(ns)
    if ns.cmd == "run":
        tr = simulate(p, seed=ns.seed)
        if ns.json:
            json.dump(tr.to_dict(), sys.stdout)
            return 0
        step = max(1, int(round(ns.every / p.dt)))
        print("t\tphi\tpsi\tU")
        for i in range(0, len(tr.t), step):
            print(f"{tr.t[i]:.2f}\t{tr.phi[i]:.4f}\t{tr.psi[i]:.4f}\t{tr.u[i]:.4f}")
        print(f"guillotine resets: {tr.resets}")
    elif ns.cmd == "stats":
        st = collapse_stats(p, runs=ns.runs)
        lo, hi = st.wilson_interval()
        print(json.dumps({"runs": st.runs, "collapse_probability": st.probability, "ci95": [round(lo, 3), round(hi, 3)],
                          "mean_resets": st.mean_resets, "median_first_collapse": st.median_first_collapse,
                          "assumed_parameters": {a: getattr(p, a) for a in ASSUMED}}, indent=2))
    elif ns.cmd == "speed-limit":
        print(json.dumps(speed_limit(p, runs=ns.runs), indent=2))
    else:
        print(json.dumps(check_reported_states(PAPER_V1_REPORTED, p), indent=2))
    return 0
