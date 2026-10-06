# SPDX-License-Identifier: LicenseRef-QNFO-ULA-2.1
# Copyright (c) 2026 Rowan Brad Quni-Gudzinas
# Licensed under QNFO-ULA v2.1 (Software Terms, Section 12): https://qnfo.org/legal/license
# Non-commercial use only; commercial use requires a separate agreement.
"""The Universal Ignorance Audit as a library (DOI 10.5281/zenodo.21901984)."""
__version__ = "0.1.0"

from .instrument import (FINDING_CATEGORIES, INSTRUMENT_VERSION, PHASES, PROTOCOL, QUESTIONS,  # noqa: E402
                         Question)
from .audit import Answer, Audit, Finding, administer  # noqa: E402
from .evaluate import Case, load_jsonl, score  # noqa: E402

__all__ = ["QUESTIONS", "PHASES", "PROTOCOL", "FINDING_CATEGORIES", "INSTRUMENT_VERSION", "Question", "Answer",
           "Audit", "Finding", "administer", "Case", "load_jsonl", "score", "__version__"]
