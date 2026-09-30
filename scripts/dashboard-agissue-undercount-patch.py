#!/usr/bin/env python3
"""DASHBOARD-AGENT-ISSUES-UNDERCOUNT-1 (agent_issues #1663).

qnfo-fleet-dashboard panel 4 ("COMPLETE OPEN-ISSUE INVENTORY") rendered
`agOpen.length` as the open agent_issues TOTAL. agOpen is fetched with
`... ORDER BY priority DESC, id DESC LIMIT 60`, so the value shown was the
PAGE SIZE, clamped at 60, not the row count. With 89 open rows the panel
reported 60, and the panel's own arithmetic no longer closed against
"TOTAL open-issue inventory" (which read 91 from live registers).

Fix: count separately with COUNT(*), render that, and label the detail
listing as a capped page when the count exceeds the page size.

Fail-closed: every anchor must occur exactly once.
Idempotent: re-running is a no-op once the marker is present.
"""
import pathlib
import sys

MARKER = "DASHBOARD-AGENT-ISSUES-UNDERCOUNT-1"
ROOT = pathlib.Path.cwd()
TARGET = ROOT / "qnfo-fleet-dashboard" / "worker.js"


def die(msg):
    print("FAIL-CLOSED: " + msg)
    sys.exit(3)


if not TARGET.exists():
    die("target not found: %s" % TARGET)

src = TARGET.read_text(encoding="utf-8", errors="replace")

if MARKER in src:
    print("ALREADY APPLIED (%s present)" % MARKER)
    sys.exit(0)

A1_OLD = "  let agOpen = [], dodByOwner = [], gtdByOwner = null, dispatch = [], ilOpen = null;"
A1_NEW = "  let agOpen = [], agOpenCount = null, dodByOwner = [], gtdByOwner = null, dispatch = [], ilOpen = null;"

A2_OLD = (
    '    agOpen = await d1all(env.AUDIT, "SELECT id, title, category, priority FROM agent_issues '
    "WHERE status NOT IN ('closed','done','resolved','wontfix','cancelled') ORDER BY priority DESC, "
    'id DESC LIMIT 60") || [];'
)
A2_NEW = A2_OLD + (
    "\n"
    "    // " + MARKER + " (2026-09-30, agent_issues #1663): the panel below rendered\n"
    "    // agOpen.length, i.e. the LIMIT-60 PAGE SIZE, as the open-issue TOTAL. With 89 open\n"
    "    // rows it reported 60. Never derive a total from a truncated page: count separately.\n"
    '    const agCountRows = await d1all(env.AUDIT, "SELECT COUNT(*) AS n FROM agent_issues '
    "WHERE status NOT IN ('closed','done','resolved','wontfix','cancelled')\");\n"
    "    agOpenCount = agCountRows && agCountRows.length ? agCountRows[0].n : null;"
)

A3_OLD = (
    "  H.push('<tr><td>agent_issues (D1)</td><td class=\"' + (agOpen.length > 0 ? \"bad\" : \"ok\") + "
    "'\">' + agOpen.length + \"</td><td>not closed/resolved/wontfix</td></tr>\");"
)
A3_NEW = (
    "  const agOpenShown = agOpenCount != null ? agOpenCount : agOpen.length;\n"
    "  H.push('<tr><td>agent_issues (D1)</td><td class=\"' + (agOpenShown > 0 ? \"bad\" : \"ok\") + "
    "'\">' + agOpenShown + \"</td><td>not closed/resolved/wontfix\" + "
    "(agOpenCount != null && agOpenCount > agOpen.length ? \" (listing shows newest \" + "
    "agOpen.length + \")\" : \"\") + \"</td></tr>\");"
)

V_OLD = 'VERSION = "1.7.38-registry-refresh"'
V_NEW = 'VERSION = "1.7.39-agissue-count"'

edits = [("A1", A1_OLD, A1_NEW), ("A2", A2_OLD, A2_NEW), ("A3", A3_OLD, A3_NEW), ("VERSION", V_OLD, V_NEW)]

for name, old, new in edits:
    n = src.count(old)
    if n != 1:
        die("anchor %s occurs %d times (expected exactly 1) - nothing written" % (name, n))

out = src
for _name, old, new in edits:
    out = out.replace(old, new, 1)

TARGET.write_text(out, encoding="utf-8")
print("OK %s: %d -> %d bytes; VERSION -> 1.7.39-agissue-count" % (MARKER, len(src), len(out)))
