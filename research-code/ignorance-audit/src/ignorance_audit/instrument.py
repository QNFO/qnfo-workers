# SPDX-License-Identifier: LicenseRef-QNFO-ULA-2.1
# Copyright (c) 2026 Rowan Brad Quni-Gudzinas
# Licensed under QNFO-ULA v2.1 (Software Terms, Section 12): https://qnfo.org/legal/license
# Non-commercial use only; commercial use requires a separate agreement.
"""The instrument: five phases, fifteen questions and the administration protocol.

Question text is verbatim from The Universal Ignorance Audit v0.3, section 3 (`targets` is abridged) (Rowan Brad Quni-Gudzinas,
DOI 10.5281/zenodo.21901984). INSTRUMENT_VERSION names the paper version the text comes from.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

INSTRUMENT_VERSION = "UIA v0.3 (10.5281/zenodo.21901984)"


@dataclass(frozen=True)
class Question:
    number: int
    phase: int
    key: str
    name: str
    text: str
    targets: str


PHASES = {
    1: "Surface the Structure",
    2: "Stress-Test the Frame",
    3: "Multiply Perspectives",
    4: "Uncover the Hidden Forces",
    5: "Act",
}

QUESTIONS: Tuple[Question, ...] = (
    Question(1, 1, "scaffold", "Scaffold detection",
             "What are the hidden assumptions and scaffolds holding this situation or belief up?",
             "the load-bearing premises so successful they have become invisible"),
    Question(2, 1, "map_territory", "Map-territory hygiene",
             "Where might the map be mistaken for the territory?",
             "the model, metric, or symbol mistaken for the thing itself"),
    Question(3, 1, "wobble", "Wobble probe",
             "What is the wobble? Where is the tension, anomaly, or thing that does not fit?",
             "the felt place where the model does not balance"),
    Question(4, 2, "inversion", "Inversion",
             "What if the opposite were true?",
             "hidden dependence on the current polarity"),
    Question(5, 2, "falsifiability", "Falsifiability test",
             "What would a world look like in which this was false?",
             "a concrete alternative world, preventing cheap escape clauses"),
    Question(6, 2, "invariant", "Invariant extraction",
             "If I changed the base, origin, center, or frame, what would remain the same?",
             "what might be real versus what is a projection of a given frame"),
    Question(7, 3, "perspective", "Radical perspectival shift",
             "How would this look to a radically different observer?",
             "non-human, future, or theoretical observers"),
    Question(8, 3, "externalized", "Externalized ignorance",
             "Who knows something about X that I do not, and what would they say is my biggest blind spot?",
             "converting ignorance from private to relational"),
    Question(9, 4, "power", "Power analysis",
             "Who benefits from the current framing? Who or what is silenced, excluded, or harmed?",
             "political epistemology"),
    Question(10, 4, "protected", "Protected ignorance probe",
             "What is the most dangerous question I could ask about this -- the one that threatens my identity, "
             "safety, or certainties?",
             "the taboo; no audit is complete without it"),
    Question(11, 4, "somatic", "Somatic and tacit dimension",
             "What does this confusion or ignorance feel like? Where does it live in the body? "
             "What does the feeling itself know?",
             "the embodied channel that conceptual auditing misses"),
    Question(12, 5, "willful", "Willful ignorance",
             "What do I already know but am pretending not to know?",
             "self-deception as a form of maintained ignorance"),
    Question(13, 5, "actionable", "Actionable ignorance",
             "What can I do with this uncertainty right now, without needing to resolve it?",
             "the audit's praxis requirement"),
    Question(14, 5, "relational", "Relational ignorance",
             "What does the unknown want from me?",
             "an instrumental-to-relational shift in orientation toward not-knowing"),
    Question(15, 5, "meta", "Recursive meta-question",
             "What question am I not asking that I should be asking, given all of the above?",
             "the fractal operator; its answer seeds the next pass"),
)

BY_KEY = {q.key: q for q in QUESTIONS}
BY_NUMBER = {q.number: q for q in QUESTIONS}

PROTOCOL = (
    "State the target explicitly. X must be named before questioning begins.",
    "Answer every question. If a question seems inapplicable, explain why and then stretch to find its relevance. "
    "Skipping is forbidden; stretching is mandatory.",
    "Write answers down.",
    "Do not resolve during Phase 1-4. The audit is not a problem-solving session.",
    "Allow silence after Question 14.",
    "Run the meta-question. The fifteenth question's answer becomes the seed of the next audit pass.",
)

# Error categories the paper's pre-registered claim [CHECK: 2028] names for AI-assisted research outputs.
FINDING_CATEGORIES = ("scaffold", "map_territory", "protected_ignorance")


def render_question(q: Question, target: str) -> str:
    return q.text.replace("about X", f"about {target}")
