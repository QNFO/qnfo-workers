# SPDX-License-Identifier: LicenseRef-QNFO-ULA-2.1
# Copyright (c) 2026 Rowan Brad Quni-Gudzinas
# Licensed under QNFO-ULA v2.1 (Software Terms, Section 12): https://qnfo.org/legal/license
# Non-commercial use only; commercial use requires a separate agreement.
"""Reference implementation of the Agentic Collapse model (DOI 10.5281/zenodo.18133065)."""
__version__ = "0.1.0"

from .model import ASSUMED, Params, Trajectory, phi_drift, phi_nullcline, simulate  # noqa: E402
from .analysis import (PAPER_V1_REPORTED, CollapseStats, check_reported_states,  # noqa: E402
                       collapse_stats, speed_limit)

__all__ = ["ASSUMED", "Params", "Trajectory", "simulate", "phi_drift", "phi_nullcline", "CollapseStats",
           "collapse_stats", "speed_limit", "check_reported_states", "PAPER_V1_REPORTED", "__version__"]
