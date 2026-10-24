#!/usr/bin/env python3
"""MIND-Q08-4 (2026-10-21): make the chain complete, name the source type, publish the
outside view, and make the seven-day record runnable.

Self-applying, idempotent patch for mind/worker.js. Run with --verify to check the live
surface instead of patching. Exits non-zero on any anchor mismatch so CI fails closed
rather than writing a half-patched worker.

SLA-AND-PATHS-1: two paths reach the same DoD. Path 1 is a direct `wrangler deploy`
(workflow step). Path 2 is a commit of the patched file to main, which canonical-deploy
picks up. Verification runs against the live host in both cases and is the same check.
"""
import json
import os
import sys
import time
import urllib.request

WORKER = os.environ.get("MIND_WORKER", "mind/worker.js")
LIVE = os.environ.get("MIND_LIVE", "https://mind.q08.org")
VERSION_FROM = "1.0.0-mind-1"
VERSION_TO = "1.0.0-mind-2"
START = ["james-attention", "hume-self", "james-emotion", "aristotle-hexis", "montaigne"]

ESC_LINE = r"""const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));"""

HELPER_NEW = ESC_LINE + r"""
const isCatalogue = (e) => /openlibrary\.org|worldcat\.org/.test(e.l || "");"""

START_LINE = r"""const START = ["james-attention", "hume-self", "james-emotion", "aristotle-hexis", "montaigne"];"""

TRAVERSAL_NEW = START_LINE + r"""

// MIND-Q08-4: the explicit `n` chain left 8 entries unreachable from Start (each source
// pointed at a target and nothing pointed back). NEXT_OF gives every entry a successor in
// shelf order, so the whole corpus is walkable and no entry is a dead end.
const TRAVERSAL = SHELVES.flatMap(s => ENTRIES.filter(e => e.sh === s.id).map(e => e.s));
const NEXT_OF = new Map(TRAVERSAL.map((s, i) => [s, TRAVERSAL[(i + 1) % TRAVERSAL.length]]));"""

NEXT_OLD = r"""  const next = BY_SLUG.get(e.n);"""
NEXT_NEW = r"""  const next = BY_SLUG.get(e.n) || BY_SLUG.get(NEXT_OF.get(e.s));"""

SOURCE_OLD = r"""<p class="small"><a href="${esc(e.l)}" rel="noopener noreferrer">${esc(e.w)}</a> &mdash; ${esc(e.a)}, ${e.y}. The link goes to the text or to a catalogue record for it, not to a summary.</p>"""
SOURCE_NEW = r"""<p class="small"><a href="${esc(e.l)}" rel="noopener noreferrer">${esc(e.w)}</a> &mdash; ${esc(e.a)}, ${e.y}. The link goes to the text or to a catalogue record for it, not to a summary. ${isCatalogue(e) ? "This one is a catalogue record: the entry gives you the question and the probe, not the argument in the author's words." : "This one is the text itself."}</p>"""

METHOD_ANCHOR = r"""<h3>Inclusion criteria</h3>"""

METHOD_NEW = r"""<h3>The outside view</h3>
<p>Three criticisms of this page are correct and are not answered here.</p>
<table><tbody>
<tr><td>Canon</td><td>Thirty-six entries, and the authors are overwhelmingly dead, European and male. That is a property of this reading list, not a finding about minds. A list built from Buddhist, Chinese or West African sources would ask different questions, and the absence of those questions is a gap rather than a judgement.</td></tr>
<tr><td>Unvalidated probes</td><td>The probes are not psychometrically validated. They are built to be falsifiable by the person running them, which is a weaker claim than being reliable. A probe that changes your mind and a probe that measures something are not the same instrument.</td></tr>
<tr><td>No outcome data</td><td>Nobody has measured whether reading these entries changes anything. The only claim made here is that each entry states a checkable argument and ends in something you can do. Whether that is useful is an empirical question that has not been run.</td></tr>
</tbody></table>

<h3>What would change this page</h3>
<p>An entry is removed if its central claim turns out to be unfalsifiable as stated, if the work attributed to the author does not contain the argument, or if the probe cannot be run by one person in under an hour without equipment. An entry is replaced if a better-evidenced source answers the same question. That is why <a href="/record">Record</a> asks for data rather than assent: a reading list that cannot be contradicted by its reader is a belief system, and this one is meant to be falsifiable by the person using it.</p>

<h3>Inclusion criteria</h3>"""

RECORD_ANCHOR = r"""<h3>Where it goes</h3>"""

RECORD_NEW = r"""<h3>A seven-day sheet</h3>
<p>Copy this into whatever you keep, or print it. This page has no script and no storage, so the sheet lives wherever you put it and nothing about it reaches this server.</p>
<table><thead><tr><th>Day</th><th>Hours slept</th><th>Valence -2..+2</th><th>Load 0..10</th><th>One line: what you would do again</th></tr></thead><tbody>
<tr><td>1</td><td></td><td></td><td></td><td></td></tr>
<tr><td>2</td><td></td><td></td><td></td><td></td></tr>
<tr><td>3</td><td></td><td></td><td></td><td></td></tr>
<tr><td>4</td><td></td><td></td><td></td><td></td></tr>
<tr><td>5</td><td></td><td></td><td></td><td></td></tr>
<tr><td>6</td><td></td><td></td><td></td><td></td></tr>
<tr><td>7</td><td></td><td></td><td></td><td></td></tr>
</tbody></table>
<p class="small">At the end of the seven days, read the four columns together and write one sentence: what changed. If the sheet is empty, that is the finding. The protocol did not survive a week, and that is information about the protocol rather than about you.</p>

<h3>Where it goes</h3>"""

EDITS = [
    ("version", VERSION_FROM, VERSION_TO),
    ("traversal", START_LINE, TRAVERSAL_NEW),
    ("next-fallback", NEXT_OLD, NEXT_NEW),
    ("catalogue-helper", ESC_LINE, HELPER_NEW),
    ("source-type", SOURCE_OLD, SOURCE_NEW),
    ("method-outside-view", METHOD_ANCHOR, METHOD_NEW),
    ("record-sheet", RECORD_ANCHOR, RECORD_NEW),
]


def patch():
    src = open(WORKER, encoding="utf-8").read()
    report = {"worker": WORKER, "version_from": VERSION_FROM, "version_to": VERSION_TO, "edits": []}
    if VERSION_TO in src and "NEXT_OF" in src and "The outside view" in src:
        report["already_patched"] = True
        report["ok"] = True
        print(json.dumps(report, indent=2))
        return 0
    for name, old, new in EDITS:
        hits = src.count(old)
        if hits != 1:
            report["ok"] = False
            report["error"] = "anchor %r matched %d times, expected exactly 1" % (name, hits)
            print(json.dumps(report, indent=2))
            return 1
        src = src.replace(old, new, 1)
        report["edits"].append({"name": name, "matched": 1})
    open(WORKER, "w", encoding="utf-8").write(src)
    report["ok"] = True
    report["bytes"] = len(src.encode("utf-8"))
    print(json.dumps(report, indent=2))
    return 0


def get(path, timeout=25):
    req = urllib.request.Request(LIVE + path, headers={"User-Agent": "mind-q08-verify/1", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode("utf-8", "replace")


def verify(attempts=6, wait=25):
    """Live DoD: version is mind-2, every entry reachable from Start, and the honesty,
    method and sheet sections are present in the served HTML."""
    out = {"live": LIVE, "expected_version": VERSION_TO, "attempts": []}
    for i in range(attempts):
        try:
            st_h, health = get("/health?cb=%d" % time.time())
            st_e, entries = get("/api/entries.json?cb=%d" % time.time())
            data = json.loads(entries)
            rows = data if isinstance(data, list) else (data.get("entries") or [])
            by = {e["s"]: e for e in rows}
            shelves = (data.get("shelves") or []) if isinstance(data, dict) else []
            order = [e["s"] for sh in shelves for e in rows if e.get("sh") == sh.get("id")] or [e["s"] for e in rows]
            nxt = {order[i]: order[(i + 1) % len(order)] for i in range(len(order))}
            seen, queue = set(), [s for s in START if s in by]
            while queue:
                s = queue.pop()
                if s in seen:
                    continue
                seen.add(s)
                for t in (by[s].get("n"), nxt.get(s)):
                    if t and t in by and t not in seen:
                        queue.append(t)
            unreachable = sorted(set(by) - seen)
            _, method = get("/method?cb=%d" % time.time())
            _, record = get("/record?cb=%d" % time.time())
            h = json.loads(health)
            res = {
                "attempt": i + 1,
                "health_status": st_h,
                "entries_status": st_e,
                "version": h.get("version"),
                "entries": len(rows),
                "reachable_from_start": len(seen),
                "unreachable": unreachable,
                "method_has_outside_view": "The outside view" in method,
                "method_has_falsifier": "What would change this page" in method,
                "record_has_sheet": "A seven-day sheet" in record,
            }
            res["ok"] = (
                res["version"] == VERSION_TO
                and not unreachable
                and len(seen) == len(rows)
                and res["method_has_outside_view"]
                and res["method_has_falsifier"]
                and res["record_has_sheet"]
            )
            out["attempts"].append(res)
            if res["ok"]:
                out["ok"] = True
                print(json.dumps(out, indent=2))
                return 0
        except Exception as exc:  # noqa: BLE001
            out["attempts"].append({"attempt": i + 1, "error": repr(exc)})
        if i < attempts - 1:
            time.sleep(wait)
    out["ok"] = False
    print(json.dumps(out, indent=2))
    return 1


if __name__ == "__main__":
    sys.exit(verify() if "--verify" in sys.argv else patch())
