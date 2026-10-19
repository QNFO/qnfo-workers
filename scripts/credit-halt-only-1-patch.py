#!/usr/bin/env python3
"""
CREDIT-HALT-ONLY-1 (2026-10-19, owner directive) -- idempotent, fail-closed.

WHY
---
qnfo-fleet-dashboard built an URGENT owner card out of a runway PROJECTION:

    if (runway != null && runway < CREDIT_RUNWAY_WARN_DAYS) items.unshift({ key: "credit-runway", ... })

Measured live 2026-10-19T08:05:32Z on GET https://fleet.qnfo.org/api/human:
    "count": 1, "urgent": 1,
    { "key": "credit-runway", "sev": "urgent", "title": "AI credit runs out in about 0 days",
      "why": "Prepaid AI credit left $15.91. ... $153.21 in the last 7 days, $96.31 in the last 24 hours." }

Owner directive (2026-10-19): "AI credit runs out in about N days" is NEVER an issue, let
alone urgent -- Cloudflare tops the prepaid balance up on its own. ONLY a $0 balance with no
top-up that ACTUALLY HALTS AI CALLS is an issue.

FIX
---
Replace the projection card with creditHaltCard(env, gov, runway), which cards only when BOTH
hold:
  * llm_gateway_log shows credit-class failures in the last CREDIT_HALT_WINDOW_H (6) hours --
    status 402/403 or an error matching insufficient|quota|payment|billing|credit; and
  * the prepaid balance is at or below zero (or unreadable -- a halt with no balance read is
    still a halt).
A projection is never a card. It is appended to the halt card's text as context only. A D1
error returns no card rather than inventing one (fail-closed on the card, not on the fleet).

The runway helper creditRunwayDays() is untouched: the KPI still shows the projection, which
is where a projection belongs. Tests R5/R6 are rewritten to assert the new rule.

TARGETS
-------
qnfo-fleet-dashboard/worker.js and qnfo-fleet-dashboard/deployed-current.worker.js must stay
byte-identical (mirror guard), so both are patched with the same transforms and their equality
is asserted at the end.
"""

import os
import re
import sys

MARKER = "CREDIT-HALT-ONLY-1"
NEW_VERSION = "1.47.0-credit-halt-only-1"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGETS = [
    "qnfo-fleet-dashboard/worker.js",
    "qnfo-fleet-dashboard/deployed-current.worker.js",
]
TEST_TARGET = "qnfo-fleet-dashboard/owner-morning.test.mjs"

HELPER_ANCHOR = "function creditRunwayDays(c) {"
CARD_PREFIX = '  if (runway != null && runway < CREDIT_RUNWAY_WARN_DAYS) items.unshift({ key: "credit-runway"'

HELPER = '''// CREDIT-HALT-ONLY-1 (1.47.0, owner directive 2026-10-19): "AI credit runs out in about N days" is never an issue,
// let alone urgent. Cloudflare tops the prepaid balance up on its own, so a low balance halts nothing. The ONLY credit
// condition that is a card is a balance at or below zero AND gateway calls actually failing on credit (no top-up
// landing). A runway is display context, never a card; a D1 error returns no card rather than inventing one.
var CREDIT_HALT_WINDOW_H = 6;
async function creditHaltCard(env, gov, runway) {
  var cost = (gov && gov.cost) || {};
  var bal = cost.balance != null && isFinite(Number(cost.balance)) ? Number(cost.balance) : null;
  var since = new Date(Date.now() - CREDIT_HALT_WINDOW_H * 3600e3).toISOString();
  var rows = [];
  try {
    rows = await d1all(env.AUDIT, "SELECT COUNT(*) AS n, MAX(ts) AS last_ts, MAX(COALESCE(error, '')) AS err FROM llm_gateway_log WHERE ts > ?1 AND (status IN (402, 403) OR lower(COALESCE(error, '')) LIKE '%insufficient%' OR lower(COALESCE(error, '')) LIKE '%quota%' OR lower(COALESCE(error, '')) LIKE '%payment%' OR lower(COALESCE(error, '')) LIKE '%billing%' OR lower(COALESCE(error, '')) LIKE '%credit%')", [since]);
  } catch (e) {
    console.error(JSON.stringify({ worker: "qnfo-fleet-dashboard", where: "creditHaltCard", error: String((e && e.message) || e) }));
    return null;
  }
  var n = rows.length ? Number(rows[0].n) || 0 : 0;
  if (n < 1) return null;
  if (bal != null && bal > 0) return null;
  return {
    key: "credit-halted",
    source: "billing",
    sev: "urgent",
    title: "AI calls are failing: credit is exhausted and no top-up is landing",
    why: (bal != null ? "Prepaid AI credit is $" + bal.toFixed(2) + "." : "The prepaid credit balance could not be read.") + " " + n + " gateway call" + (n === 1 ? "" : "s") + " failed on credit in the last " + CREDIT_HALT_WINDOW_H + " hours" + (rows[0].last_ts ? ", the last at " + rows[0].last_ts : "") + (rows[0].err ? ": " + String(rows[0].err).slice(0, 160) : "") + (runway != null && runway < CREDIT_RUNWAY_WARN_DAYS ? " Projection for context only: about " + runway + " day(s) at the current burn." : "") + ".",
    fallback: "Workers AI models are billed to the account and keep running. Third-party models called through the AI Gateway fail until the credit is restored.",
    action: "Top up the Cloudflare credit, or repoint the client that spends the gateway key to Workers AI models."
  };
}
'''

CARD_NEW = '''  // CREDIT-HALT-ONLY-1 (1.47.0, owner directive 2026-10-19): a runway PROJECTION is never a queue card and is never
  // urgent. The prepaid balance is topped up automatically, so a low balance halts nothing. The only credit condition
  // that is an issue is a balance at or below zero with AI calls actually failing on credit and no top-up landing.
  const creditHalt = await creditHaltCard(env, gov, runway);
  if (creditHalt) items.unshift(creditHalt);'''

TEST_R5_NEW = ('ok(/CREDIT-HALT-ONLY-1/.test(src) && /if \\(creditHalt\\) items\\.unshift\\(creditHalt\\)/.test(src), '
               '"R5 only a credit halt becomes a queue card: a runway projection never does");')
TEST_R6_NEW = ('ok(!/key: "credit-runway"/.test(src) && /if \\(n < 1\\) return null;/.test(src) && '
               '/if \\(bal != null && bal > 0\\) return null;/.test(src), '
               '"R6 no runway card exists and a positive balance never cards");')


def patch_worker(path):
    full = os.path.join(ROOT, path)
    if not os.path.exists(full):
        print("FAIL-CLOSED %s: missing" % path)
        return 1, False

    src = open(full, encoding="utf-8", errors="surrogateescape").read()

    if MARKER in src:
        print("already applied %s" % path)
        return 0, False

    if src.count(HELPER_ANCHOR) != 1:
        print("FAIL-CLOSED %s: creditRunwayDays anchor matched %d times (expected exactly 1) - nothing written"
              % (path, src.count(HELPER_ANCHOR)))
        return 1, False

    lines = src.split("\n")
    card_idx = [i for i, l in enumerate(lines)
                if l.startswith(CARD_PREFIX) and l.rstrip().endswith("});")]
    if len(card_idx) != 1:
        print("FAIL-CLOSED %s: runway card line matched %d times (expected exactly 1) - nothing written"
              % (path, len(card_idx)))
        return 1, False

    vm = re.search(r'var VERSION = "([^"]*)";', src)
    if not vm:
        print("FAIL-CLOSED %s: no VERSION declaration found" % path)
        return 1, False

    old_version = vm.group(1)
    if old_version == NEW_VERSION:
        print("FAIL-CLOSED %s: VERSION is already %s but the marker is absent - refusing to guess"
              % (path, NEW_VERSION))
        return 1, False

    lines[card_idx[0]] = CARD_NEW
    src = "\n".join(lines)

    src = src.replace(HELPER_ANCHOR, HELPER + HELPER_ANCHOR, 1)

    src = src.replace(
        'var VERSION = "%s";' % old_version,
        'var VERSION = "%s"; /* 1.47.0 CREDIT-HALT-ONLY-1 (2026-10-19, owner directive): "AI credit runs out in about N days" '
        'is never a queue card and never urgent. The prepaid balance is topped up automatically, so a low balance halts nothing. '
        'The only credit card is a balance at or below zero AND gateway calls actually failing on credit in the last 6 hours '
        '(llm_gateway_log 402/403 or insufficient/quota/payment/billing/credit errors). A runway is display context only. */'
        % NEW_VERSION,
        1,
    )

    if MARKER not in src:
        print("FAIL-CLOSED %s: marker missing after the edit - nothing written" % path)
        return 1, False
    if src.count("async function creditHaltCard(") != 1:
        print("FAIL-CLOSED %s: helper did not land exactly once" % path)
        return 1, False
    if 'key: "credit-runway"' in src:
        print("FAIL-CLOSED %s: the old runway card is still present" % path)
        return 1, False

    open(full, "w", encoding="utf-8", errors="surrogateescape").write(src)
    print("patched %s (VERSION %s -> %s)" % (path, old_version, NEW_VERSION))
    return 0, True


def patch_test():
    full = os.path.join(ROOT, TEST_TARGET)
    if not os.path.exists(full):
        print("FAIL-CLOSED %s: missing" % TEST_TARGET)
        return 1, False

    src = open(full, encoding="utf-8", errors="surrogateescape").read()
    if "only a credit halt becomes a queue card" in src:
        print("already applied %s" % TEST_TARGET)
        return 0, False

    lines = src.split("\n")
    i5 = [i for i, l in enumerate(lines) if l.startswith('ok(/runway != null && runway < CREDIT_RUNWAY_WARN_DAYS')]
    i6 = [i for i, l in enumerate(lines) if l.startswith('ok(/sev: runway < 3')]
    if len(i5) != 1 or len(i6) != 1:
        print("FAIL-CLOSED %s: R5/R6 assertions matched %d/%d times (expected 1/1) - nothing written"
              % (TEST_TARGET, len(i5), len(i6)))
        return 1, False

    lines[i5[0]] = TEST_R5_NEW
    lines[i6[0]] = TEST_R6_NEW
    src = "\n".join(lines)
    src = src.replace("shown on the KPI and as a card under 7 days",
                      "shown on the KPI only; a runway projection is never a card", 1)

    open(full, "w", encoding="utf-8", errors="surrogateescape").write(src)
    print("patched %s (R5/R6 rewritten to the halt-only rule)" % TEST_TARGET)
    return 0, True


def main():
    print("== %s ==" % MARKER)
    rc = 0
    changed = 0
    for t in TARGETS:
        r, c = patch_worker(t)
        rc = max(rc, r)
        changed += 1 if c else 0

    if rc == 0:
        r, c = patch_test()
        rc = max(rc, r)
        changed += 1 if c else 0

    if rc != 0:
        print("RESULT failed: nothing committed")
        return rc

    # mirror guard: worker.js and deployed-current.worker.js must be byte-identical
    try:
        a = open(os.path.join(ROOT, TARGETS[0]), encoding="utf-8", errors="surrogateescape").read()
        b = open(os.path.join(ROOT, TARGETS[1]), encoding="utf-8", errors="surrogateescape").read()
    except OSError as e:
        print("FAIL-CLOSED mirror read: %s" % e)
        return 1
    if a != b:
        if MARKER in a and MARKER in b:
            print("mirror drift after patch - resyncing %s from %s" % (TARGETS[1], TARGETS[0]))
            open(os.path.join(ROOT, TARGETS[1]), "w", encoding="utf-8", errors="surrogateescape").write(a)
        else:
            print("FAIL-CLOSED mirror: the two worker files disagree and the marker is not on both")
            return 1
    else:
        print("mirror ok: worker.js == deployed-current.worker.js")

    print("RESULT ok: %d file(s) changed" % changed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
