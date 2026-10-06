# SPDX-License-Identifier: LicenseRef-QNFO-ULA-2.1
# Copyright (c) 2026 Rowan Brad Quni-Gudzinas
# Licensed under QNFO-ULA v2.1 (Software Terms, Section 12): https://qnfo.org/legal/license
# Non-commercial use only; commercial use requires a separate agreement.
"""Command line: ignorance-audit {questions,new,check,render,score}."""
from __future__ import annotations

import argparse
import json
import sys

from . import __version__
from .audit import Audit, protocol_text
from .evaluate import load_jsonl, score
from .instrument import INSTRUMENT_VERSION, PHASES, QUESTIONS


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="ignorance-audit")
    ap.add_argument("--version", action="version", version=f"{__version__} ({INSTRUMENT_VERSION})")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("questions", help="print the instrument and protocol")
    n = sub.add_parser("new", help="write an empty audit as JSON")
    n.add_argument("target")
    for name in ("check", "render"):
        sp = sub.add_parser(name)
        sp.add_argument("file")
    s = sub.add_parser("score", help="score audit-vs-baseline cases (JSONL) for the CHECK 2028 claim")
    s.add_argument("file")
    ns = ap.parse_args(argv)
    if ns.cmd == "questions":
        for ph, name in PHASES.items():
            print(f"Phase {ph}: {name}")
            for q in (q for q in QUESTIONS if q.phase == ph):
                print(f"  {q.number:>2}. {q.name}: {q.text}")
        print("\nProtocol:\n" + protocol_text())
        return 0
    if ns.cmd == "new":
        print(Audit(target=ns.target).to_json())
        return 0
    if ns.cmd == "score":
        with open(ns.file, encoding="utf-8") as fh:
            print(json.dumps(score(load_jsonl(fh)), indent=2))
        return 0
    with open(ns.file, encoding="utf-8") as fh:
        audit = Audit.from_json(fh.read())
    if ns.cmd == "render":
        sys.stdout.write(audit.to_markdown())
        return 0
    probs = audit.problems()
    for p in probs:
        print(p)
    print("complete" if not probs else f"{len(probs)} protocol problem(s)")
    return 0 if not probs else 1
