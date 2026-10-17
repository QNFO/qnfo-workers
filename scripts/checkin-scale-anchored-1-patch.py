#!/usr/bin/env python3
"""CHECKIN-SCALE-ANCHORED-1 - owner 2026-10-17: "what is mood and energy? what is high/low score? not helpful".

MEASURED DEFECT (personal-companion 1.29.0-wellbeing-loop, live bundle 318,487 B):
  /wb/checkin rendered `<p class="q">mood</p>` over five bare buttons 1..5 and the same for energy.
  Nothing said what mood measures, what energy measures, which end is good, or what the number is
  used for; /api/wellbeing published mood_today / mood_avg7 / mood_drop_2d with no scale either.

WHAT THIS LANDS
  * every rung carries the word it means (mood 1 rough..5 great, energy 1 empty..5 full)
  * the page states the direction (5 is best), the bands (1-2 low, 3 neutral, 4-5 high) and that the
    number is not a grade and has no target
  * the check-in mail and the brief line carry the scale, so the link is not a mystery
  * /api/wellbeing exposes the same instrument as `scale` plus the thresholds drift() already uses
  * VERSION bumps so fleet-autoaudit --apply and deploy-drift see the change

ADVERSARIAL: this fixes the wording, not the sampling. Two taps a day is still a 5-point ordinal
self-report; it cannot separate "mood" from "how the morning went". No threshold is changed here.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIRE = os.path.join(ROOT, "personal-companion", "wellbeing-wire.js")
WORKER = os.path.join(ROOT, "personal-companion", "worker.js")
TEST = os.path.join(ROOT, "personal-companion", "wellbeing.test.mjs")
MARK = "SCALE-ANCHORED-1"
OLD_VER = 'var VERSION = "1.29.0-wellbeing-loop";'
NEW_VER = 'var VERSION = "1.30.0-checkin-anchored";'

BTNS_OLD = 'const btns = (k, cur) => [1, 2, 3, 4, 5].map((v) => `<a class="b${cur === v ? " sel" : ""}" href="${link(k, v)}">${v}</a>`).join("");'
BTNS_NEW = [
    "// SCALE-ANCHORED-1: a bare 1-5 row is not an instrument. Every rung carries the word it means,",
    "// the page states the direction and the bands, and it says the number is not a grade.",
    'const MOOD_WORDS = ["rough", "low", "okay", "good", "great"];',
    'const ENERGY_WORDS = ["empty", "thin", "steady", "strong", "full"];',
    'const btns = (k, cur, words) => [1, 2, 3, 4, 5].map((v) => `<a class="b${cur === v ? " sel" : ""}" href="${link(k, v)}">${v}<small>${words[v - 1]}</small></a>`).join("");',
]
MOOD_OLD = '`<h1>Today</h1><p class="q">mood</p><div>${btns("mood", row.mood)}</div>` +'
MOOD_NEW = [
    "`<h1>Today</h1>` +",
    '`<p><b>Mood</b> is how you feel right now. <b>Energy</b> is how much you have in the tank. Both 1 to 5, where 5 is best.</p>` +',
    '`<p class="q">mood - how you feel right now</p><div>${btns("mood", row.mood, MOOD_WORDS)}</div>` +',
]
ENERGY_OLD = '`<p class="q">energy</p><div>${btns("energy", row.energy)}</div>` +'
ENERGY_NEW = [
    '`<p class="q">energy - what you have in the tank</p><div>${btns("energy", row.energy, ENERGY_WORDS)}</div>` +',
    '`<p class="q">1-2 is low, 3 is neutral, 4-5 is high. It is not a grade and there is no target: a low day means fewer asks and more presence, nothing else.</p>` +',
]
CSS_OLD = '`a.b{display:inline-block;min-width:3.2rem;text-align:center;padding:.7rem 0;margin:.2rem;border:1px solid #bbb;border-radius:.6rem;text-decoration:none;color:#111}` +'
CSS_NEW = [
    '`a.b{display:inline-block;min-width:3.9rem;text-align:center;padding:.6rem 0;margin:.2rem;border:1px solid #bbb;border-radius:.6rem;text-decoration:none;color:#111}` +',
    '`a.b small{display:block;font-size:.68rem;line-height:1.1;opacity:.75}` +',
]
MAIL_OLD = '"Mood, then energy. Two taps, nothing to type:"'
MAIL_NEW = '"Mood (how you feel) then energy (what you have in the tank). Two taps, 1 low to 5 high, nothing to type:"'
BRIEF_OLD = '"How\'s it landing? Two taps, nothing to type:"'
BRIEF_NEW = '"How\'s it landing? Two taps: mood and energy, 1 low to 5 high, nothing to type:"'
API_OLD = "    checked_in: check.mood !== undefined || check.energy !== undefined\n  };"
API_NEW = '''    checked_in: check.mood !== undefined || check.energy !== undefined,
    // SCALE-ANCHORED-1: the same instrument the check-in page shows, machine-readable, so no reader
    // has to guess what 1 and 5 mean or which direction is good. Thresholds are drift()'s own.
    scale: {
      mood: { question: "how you feel right now", 1: "rough", 2: "low", 3: "okay", 4: "good", 5: "great" },
      energy: { question: "how much you have in the tank", 1: "empty", 2: "thin", 3: "steady", 4: "strong", 5: "full" },
      direction: "5 is best; 1-2 low, 3 neutral, 4-5 high",
      not_a_grade: true,
      used_for: "low values drop the ask ladder to presence; nothing is scored and there is no target",
      thresholds: { mood_today_strong_low: 1, mood_avg7_strong_low: 2.5, mood_drop_2d_points: 0.75 }
    }
  };'''
TEST_OLD = 'body.includes(">mood<") && body.includes(">energy<")'
TEST_NEW = 'body.includes(">mood - how you feel right now<") && body.includes(">energy - what you have in the tank<")'


def die(msg):
    print("FAIL-CLOSED: " + msg)
    sys.exit(1)


def read(path):
    with open(path, encoding="utf-8", errors="surrogateescape") as fh:
        return fh.read()


def write(path, src):
    with open(path, "w", encoding="utf-8", errors="surrogateescape") as fh:
        fh.write(src)


def replace_line(lines, needle, new_lines, path):
    hits = [i for i, ln in enumerate(lines) if needle in ln]
    if len(hits) != 1:
        die("%s: anchor %r matched %d lines (expected 1)" % (path, needle[:60], len(hits)))
    lines[hits[0]:hits[0] + 1] = [("      " if ln.strip().startswith("`") else "    ") + ln.strip() for ln in new_lines]


def main():
    for p in (WIRE, WORKER, TEST):
        if not os.path.exists(p):
            die("missing %s" % p)

    src = read(WIRE)
    if MARK in src:
        print("already applied %s" % WIRE)
    else:
        lines = src.split("\n")
        replace_line(lines, BTNS_OLD, BTNS_NEW, WIRE)
        replace_line(lines, MOOD_OLD, MOOD_NEW, WIRE)
        replace_line(lines, ENERGY_OLD, ENERGY_NEW, WIRE)
        replace_line(lines, CSS_OLD, CSS_NEW, WIRE)
        out = "\n".join(lines)
        for a_old, a_new in ((MAIL_OLD, MAIL_NEW), (BRIEF_OLD, BRIEF_NEW)):
            if out.count(a_old) != 1:
                die("%s: anchor %r matched %d times (expected 1)" % (WIRE, a_old[:50], out.count(a_old)))
            out = out.replace(a_old, a_new, 1)
        if out.count(API_OLD) != 1:
            die("%s: api anchor matched %d times (expected 1)" % (WIRE, out.count(API_OLD)))
        out = out.replace(API_OLD, API_NEW, 1)
        if MARK not in out or "MOOD_WORDS" not in out:
            die("%s: replacement did not land" % WIRE)
        write(WIRE, out)
        print("patched %s" % WIRE)

    tsrc = read(TEST)
    if TEST_OLD in tsrc:
        write(TEST, tsrc.replace(TEST_OLD, TEST_NEW, 1))
        print("updated %s guard to the anchored labels" % TEST)
    elif TEST_NEW not in tsrc:
        die("%s: guard anchor not found" % TEST)

    wsrc = read(WORKER)
    if NEW_VER in wsrc:
        print("already bumped %s" % WORKER)
    elif OLD_VER in wsrc:
        write(WORKER, wsrc.replace(OLD_VER, NEW_VER, 1))
        print("bumped %s -> %s" % (WORKER, NEW_VER))
    else:
        die("%s: VERSION anchor not found" % WORKER)
    return 0


if __name__ == "__main__":
    sys.exit(main())
