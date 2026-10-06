"""The Universal Ignorance Audit as a library (DOI 10.5281/zenodo.21901984)."""
__version__ = "0.1.0"

from .instrument import (FINDING_CATEGORIES, INSTRUMENT_VERSION, PHASES, PROTOCOL, QUESTIONS,  # noqa: E402
                         Question)
from .audit import Answer, Audit, Finding, administer  # noqa: E402
from .evaluate import Case, load_jsonl, score  # noqa: E402

__all__ = ["QUESTIONS", "PHASES", "PROTOCOL", "FINDING_CATEGORIES", "INSTRUMENT_VERSION", "Question", "Answer",
           "Audit", "Finding", "administer", "Case", "load_jsonl", "score", "__version__"]
