# SPDX-License-Identifier: LicenseRef-QNFO-ULA-2.1
# Copyright (c) 2026 Rowan Brad Quni-Gudzinas
# Licensed under QNFO-ULA v2.1 (Software Terms, Section 12): https://qnfo.org/legal/license
# Non-commercial use only; commercial use requires a separate agreement.
"""An audit record, its protocol checks, and how to run one with any text model."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Callable, Dict, List, Optional

from .instrument import (FINDING_CATEGORIES, INSTRUMENT_VERSION, PHASES, PROTOCOL, QUESTIONS, BY_NUMBER,
                         render_question)


@dataclass
class Answer:
    number: int
    text: str = ""
    inapplicable: bool = False   # the administrator judged the question not to apply...
    stretch: str = ""            # ...and must then say how it applies anyway (protocol rule 2)


@dataclass
class Finding:
    category: str                # one of FINDING_CATEGORIES
    statement: str
    question: Optional[int] = None


@dataclass
class Audit:
    target: str
    answers: Dict[int, Answer] = field(default_factory=dict)
    findings: List[Finding] = field(default_factory=list)
    auditor: str = ""
    pass_number: int = 1
    parent_seed: str = ""        # the previous pass's Question 15 answer, if any
    instrument: str = INSTRUMENT_VERSION
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))

    def answer(self, number: int, text: str, inapplicable: bool = False, stretch: str = "") -> "Audit":
        if number not in BY_NUMBER:
            raise KeyError(f"no question {number}; the instrument has 1 to {len(QUESTIONS)}")
        self.answers[number] = Answer(number, text, inapplicable, stretch)
        return self

    def add_finding(self, category: str, statement: str, question: Optional[int] = None) -> "Audit":
        if category not in FINDING_CATEGORIES:
            raise ValueError(f"category must be one of {FINDING_CATEGORIES}")
        self.findings.append(Finding(category, statement, question))
        return self

    def problems(self) -> List[str]:
        """Protocol violations. An empty list means the audit is complete under the protocol."""
        out = []
        if not self.target.strip():
            out.append("rule 1: the target is not stated")
        for q in QUESTIONS:
            a = self.answers.get(q.number)
            if a is None or not (a.text.strip() or a.stretch.strip()):
                out.append(f"rule 2: question {q.number} ({q.name}) is not answered; skipping is forbidden")
            elif a.inapplicable and not a.stretch.strip():
                out.append(f"rule 2: question {q.number} ({q.name}) is marked inapplicable without a stretch")
        return out

    @property
    def complete(self) -> bool:
        return not self.problems()

    def next_seed(self) -> str:
        """Protocol rule 6: the Question 15 answer seeds the next pass."""
        a = self.answers.get(15)
        return (a.text or a.stretch).strip() if a else ""

    def next_pass(self) -> "Audit":
        seed = self.next_seed()
        if not seed:
            raise ValueError("question 15 is unanswered, so there is no seed for the next pass")
        return Audit(target=self.target, auditor=self.auditor, pass_number=self.pass_number + 1, parent_seed=seed)

    # Serialisation -----------------------------------------------------------------------------
    def to_dict(self) -> dict:
        d = asdict(self)
        d["answers"] = {str(k): v for k, v in d["answers"].items()}
        return d

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2, ensure_ascii=False)

    @classmethod
    def from_dict(cls, d: dict) -> "Audit":
        a = cls(target=d.get("target", ""), auditor=d.get("auditor", ""), pass_number=d.get("pass_number", 1),
                parent_seed=d.get("parent_seed", ""), instrument=d.get("instrument", INSTRUMENT_VERSION),
                created_at=d.get("created_at", ""))
        for k, v in (d.get("answers") or {}).items():
            a.answers[int(k)] = Answer(int(k), v.get("text", ""), bool(v.get("inapplicable")), v.get("stretch", ""))
        for f in d.get("findings") or []:
            a.add_finding(f["category"], f["statement"], f.get("question"))
        return a

    @classmethod
    def from_json(cls, s: str) -> "Audit":
        return cls.from_dict(json.loads(s))

    def to_markdown(self) -> str:
        lines = [f"# Ignorance audit: {self.target}", "",
                 f"Instrument: {self.instrument}. Pass {self.pass_number}."
                 + (f" Auditor: {self.auditor}." if self.auditor else ""), ""]
        if self.parent_seed:
            lines += [f"Seed from the previous pass: {self.parent_seed}", ""]
        for ph, name in PHASES.items():
            lines += [f"## Phase {ph}: {name}", ""]
            for q in (q for q in QUESTIONS if q.phase == ph):
                a = self.answers.get(q.number)
                lines.append(f"**{q.number}. {q.name}.** *{render_question(q, self.target)}*")
                lines.append("")
                if a is None:
                    lines.append("_(unanswered)_")
                else:
                    if a.text:
                        lines.append(a.text)
                    if a.inapplicable:
                        lines.append(f"\n_Judged inapplicable; stretch:_ {a.stretch or '(missing)'}")
                lines.append("")
        if self.findings:
            lines += ["## Findings", ""]
            lines += [f"- [{f.category}] {f.statement}" + (f" (Q{f.question})" if f.question else "")
                      for f in self.findings]
            lines.append("")
        probs = self.problems()
        lines += ["## Protocol check", ""]
        lines += [f"- {p}" for p in probs] if probs else ["Complete: every question answered, target stated."]
        return "\n".join(lines) + "\n"


TextModel = Callable[[str], str]

_PREAMBLE = ("You are administering the Universal Ignorance Audit to the target below. Answer only the current "
             "question, in writing, without resolving the problem (protocol rule 4). If the question seems not to "
             "apply, say why and then stretch to find how it does apply (rule 2).")


def administer(target: str, model: TextModel, auditor: str = "", parent_seed: str = "",
               pass_number: int = 1) -> Audit:
    """Run the audit with any text model: a function from a prompt string to an answer string.

    Questions are asked in depth order and each prompt carries the earlier answers, so earlier
    answers scaffold later ones (design principle 2). No provider is built in; pass a closure over
    whatever client you use.
    """
    if not target.strip():
        raise ValueError("rule 1: state the target before questioning begins")
    audit = Audit(target=target, auditor=auditor, parent_seed=parent_seed, pass_number=pass_number)
    transcript: List[str] = []
    for q in QUESTIONS:
        prompt = "\n\n".join(filter(None, [
            _PREAMBLE, f"Target: {target}",
            f"Seed from the previous pass: {parent_seed}" if parent_seed and q.number == 1 else "",
            "Earlier answers:\n" + "\n".join(transcript) if transcript else "",
            f"Question {q.number} ({q.name}; phase {q.phase}, {PHASES[q.phase]}): {render_question(q, target)}",
        ]))
        reply = (model(prompt) or "").strip()
        audit.answer(q.number, reply)
        transcript.append(f"Q{q.number} {q.name}: {reply}")
    return audit


def protocol_text() -> str:
    return "\n".join(f"{i}. {r}" for i, r in enumerate(PROTOCOL, 1))
