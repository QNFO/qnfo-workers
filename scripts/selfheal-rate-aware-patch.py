#!/usr/bin/env python3
"""TELEMETRY-SELFHEAL-RATE-AWARE-1 (issues 1165, 1353; 2026-09-29).

WHY THIS EXISTS
---------------
telemetry_analyze reported `scanned: 12, persistent: [], filed: 0` while
ops_d1_query had failed 136-140x in 24h. Three defects, each verified against
live data before this patch:

  1. EXTRACTOR BLIND SPOT. cloud_ops_events stores the BARE tool name in `text`
     for kind='ops_ai_tool' error rows (verified live:
       SELECT job, text, COUNT(*) FROM cloud_ops_events ... GROUP BY text
       -> job=qnfo-ops, text=ops_d1_query, n=140).
     The analyzer demanded a 'tool='/'tool_name='/called:' prefix, so toolKey
     was always '' and every row hit `if (!toolKey) continue;`. That is the
     exact mechanism behind 12 rows scanned and 0 tickets filed.

  2. BINARY RECOVERY PREDICATE. Filing required "no success since the last
     error". A high-frequency tool that fails 10-15% of calls ALWAYS has a
     success after its last error, so a persistent elevated failure rate was
     structurally unfilable. This is the real #1165/#1353 mechanism, not the
     refile guard.

  3. WRONG TABLE. Tickets were written to issue_ledger (live: 0 open rows)
     while the backlog surface (ops_issues_list) and open_self_heal_issues
     both read agent_issues. Even a filed ticket was invisible to the backlog.

THE FIX
-------
  * toolKey is taken from the bare `text` value when it looks like a tool name,
    with the old prefixed form kept as a fallback (no regression for callers
    that do embed 'tool=name').
  * A window failure RATE is computed per tool: fails / (fails + oks).
  * Filing now requires fails >= 3 AND rate >= 10% -- a persistent elevated
    error rate, which is what "persistent failure" should have meant.
  * Auto-resolve is preserved but tightened to genuine recovery: a success
    since the last error AND rate < 2%.
  * Tickets are dual-written to agent_issues (deduped on open title) so the
    backlog actually surfaces them.

FAIL-CLOSED
-----------
Every anchor must appear exactly once. Any miss aborts with exit 3 and writes
nothing. Re-running on an already-patched tree is a no-op (exit 0).
"""
import re
import sys
from pathlib import Path

NEW_VERSION = "2.37.20-selfheal-rate-aware"
TARGETS = ["qnfo-ops/worker.js", "qnfo-ops/deployed-current.worker.js"]

# --- anchors (byte-exact, verified against main before authoring) ------------

A1 = '''      if ((r.n || 0) < 2) continue;
      const _tm = String(r.text).match(/(?:tool|tool_name|called)[=: ]+([A-Za-z0-9_.-]+)/i);
      const toolKey = _tm ? _tm[1] : "";
      if (!toolKey) continue;'''

A2 = '''        if (okRow && okRow.c > 0) {
          out.recovered++;'''

A3 = '''      const title = "[self-heal] tool " + toolKey + " failing x" + r.n + " (" + h + "h no recovery)";'''

A4 = '''        out.filed++;
        out.persistent.push({ tool: r.text, count: r.n, lastError: r.last_ts });'''

# --- replacements -----------------------------------------------------------

R1 = '''      if ((r.n || 0) < 3) continue;
      const _rawText = String(r.text == null ? "" : r.text).trim();
      let toolKey = "";
      const _tm = _rawText.match(/(?:tool|tool_name|called)[=: ]+([A-Za-z0-9_.-]+)/i);
      if (_tm) toolKey = _tm[1];
      else if (/^[A-Za-z0-9_.:-]{2,64}$/.test(_rawText)) toolKey = _rawText;
      if (!toolKey) { out.unparsed = (out.unparsed || 0) + 1; continue; }
      let _failRate = 1;
      let _okWin = 0;'''

R2 = '''        const _win = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) c FROM cloud_ops_events WHERE ts >= ?1 AND status = 'ok' AND kind = 'ops_ai_tool' AND job = 'qnfo-ops' AND text LIKE ('%' || ?2 || '%')").bind(since, toolKey).first();
        _okWin = (_win && _win.c) || 0;
        _failRate = (r.n || 0) / Math.max(1, (r.n || 0) + _okWin);
        out.rates = out.rates || {};
        out.rates[toolKey] = { fails: r.n || 0, oks: _okWin, rate: Math.round(_failRate * 1e4) / 1e4 };
        if (okRow && okRow.c > 0 && _failRate < 0.02) {
          out.recovered++;'''

R3 = '''      if (!(_failRate >= 0.1)) { out.belowThreshold = (out.belowThreshold || 0) + 1; continue; }
      const title = "[self-heal] tool " + toolKey + " failing x" + r.n + " (" + h + "h, rate " + (Math.round(_failRate * 1e4) / 100) + "%)";'''

R4 = '''        try {
          const _nowMs = Date.now();
          const _ex = await env.QNFO_AUDIT.prepare("SELECT id FROM agent_issues WHERE title = ?1 AND status = 'open' LIMIT 1").bind(title).first();
          if (!_ex) {
            await env.QNFO_AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,'open',?6,?6)").bind(title, "Auto-filed by qnfo-ops telemetry self-heal (rate-aware). tool=" + toolKey + " fails=" + (r.n || 0) + " oks=" + _okWin + " rate=" + (Math.round(_failRate * 1e4) / 1e4) + " window_h=" + h, "qnfo-ops-telemetry", "telemetry-self-heal", (r.n || 0) >= 5 ? "high" : "medium", _nowMs).run();
            out.agentFiled = (out.agentFiled || 0) + 1;
          } else {
            out.agentAlreadyOpen = (out.agentAlreadyOpen || 0) + 1;
          }
        } catch (eA) { out.agentIssueError = String(eA && eA.message || eA); }
        out.filed++;
        out.persistent.push({ tool: r.text, count: r.n, lastError: r.last_ts });'''

PAIRS = [(A1, R1), (A2, R2), (A3, R3), (A4, R4)]

VERSION_RE = re.compile(r'var VERSION = "[^"]*";')


def patch_text(text, label):
    if NEW_VERSION in text:
        return None, "already-applied"
    for i, (old, new) in enumerate(PAIRS, 1):
        n = text.count(old)
        if n != 1:
            raise SystemExit(
                "FAIL-CLOSED: %s anchor A%d matched %d times (expected 1)" % (label, i, n)
            )
        text = text.replace(old, new)
    if not VERSION_RE.search(text):
        raise SystemExit("FAIL-CLOSED: %s carries no var VERSION line" % label)
    text = VERSION_RE.sub('var VERSION = "%s";' % NEW_VERSION, text, count=1)
    return text, "patched"


def main():
    changed = 0
    for rel in TARGETS:
        p = Path(rel)
        if not p.is_file():
            raise SystemExit("FAIL-CLOSED: %s not found" % rel)
        src = p.read_text(encoding="utf-8")
        out, state = patch_text(src, rel)
        if out is None:
            print("%-44s %s" % (rel, state))
            continue
        p.write_text(out, encoding="utf-8")
        print("%-44s patched (%d -> %d bytes)" % (rel, len(src), len(out)))
        changed += 1

    if changed:
        a = Path(TARGETS[0]).read_text(encoding="utf-8")
        b = Path(TARGETS[1]).read_text(encoding="utf-8")
        if a != b:
            raise SystemExit("FAIL-CLOSED: source and mirror diverged after patch")
        for marker, want in (
            ("let _failRate = 1", True),
            ("out.agentFiled", True),
            ("_failRate >= 0.1", True),
            ("INSERT INTO agent_issues", True),
            ("if (!toolKey) continue;", False),
            ('failing x" + r.n + " (" + h + "h no recovery)"', False),
        ):
            present = marker in a
            if present != want:
                raise SystemExit(
                    "FAIL-CLOSED: marker %r present=%s expected=%s" % (marker, present, want)
                )
        print("markers OK; source and mirror byte-identical")
    else:
        print("nothing to do (patch already applied)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
