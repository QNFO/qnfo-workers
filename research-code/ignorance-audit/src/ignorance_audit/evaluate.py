"""Scoring for the paper's pre-registered claim [CHECK: 2028].

Claim: applied to AI-assisted research outputs, the audit catches at least one category of error
(scaffold, map-territory, or protected-ignorance) that standard verification misses.

Input: for each document, the set of error ids the audit found, the set a baseline verifier found
(peer review, a fact-check gate, a checklist) and, where available, adjudicated ground truth. The score
is what the audit adds: errors found by the audit and missed by the baseline, overall and per category.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Set

from .instrument import FINDING_CATEGORIES


@dataclass
class Case:
    doc_id: str
    audit_found: Set[str]
    baseline_found: Set[str]
    truth: Optional[Set[str]] = None              # adjudicated real errors; None = not adjudicated
    category: Dict[str, str] = field(default_factory=dict)   # error id -> finding category


def load_jsonl(lines: Iterable[str]) -> List[Case]:
    out = []
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        d = json.loads(ln)
        out.append(Case(d["doc_id"], set(d.get("audit_found", [])), set(d.get("baseline_found", [])),
                        set(d["truth"]) if d.get("truth") is not None else None, dict(d.get("category", {}))))
    return out


def score(cases: List[Case]) -> dict:
    added = 0
    added_true = 0
    adjudicated_added = 0
    per_cat = {c: 0 for c in FINDING_CATEGORIES}
    docs_with_added = 0
    for c in cases:
        extra = c.audit_found - c.baseline_found
        if c.truth is not None:
            adjudicated_added += len(extra)
            extra_true = extra & c.truth
            added_true += len(extra_true)
            counted = extra_true
        else:
            counted = extra
        added += len(extra)
        if counted:
            docs_with_added += 1
        for e in counted:
            cat = c.category.get(e)
            if cat in per_cat:
                per_cat[cat] += 1
    precision = (added_true / adjudicated_added) if adjudicated_added else None
    supported = any(v > 0 for v in per_cat.values()) and (precision is None or precision > 0)
    return {
        "documents": len(cases),
        "audit_only_findings": added,
        "audit_only_true_findings": added_true,
        "audit_only_precision": precision,
        "documents_with_audit_only_findings": docs_with_added,
        "per_category": per_cat,
        "claim_supported": supported,
        "note": "claim_supported needs at least one audit-only finding in a named category; where ground truth "
                "exists, only adjudicated true findings count.",
    }
