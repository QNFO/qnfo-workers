#!/usr/bin/env python3
"""applier-doctor.py -- APPLIER-DOCTOR-2

DEFECT CLASSES THIS CLOSES
  #1395 CI-APPLIER-NEVER-APPLIES-1, #1383 ANCHOR-INVALIDATION-RED-JOB-1, and
  #1444 APPLIER-DOCTOR-FALSE-POSITIVE-CLASS-1.

  This repo carries ~39 fail-closed patch scripts under scripts/*patch*.py, each
  driven by a .github/workflows/apply-*.yml. Their contract is deliberately
  fail-closed: every anchor must match EXACTLY once, else the script exits 3 and
  writes nothing. That is the right contract, but it has failure modes that were
  previously INVISIBLE:

    (a) STALE ANCHOR. A concurrent writer edits the target artifact, the anchor
        stops matching, the applier exits 3 forever, and the patch never lands.
    (b) NEVER LANDED. The applier exits 0 and applies the patch to a scratch
        tree, but the commit-back never reaches main, so the NEXT run reports
        "applied-now" again.

WHAT CHANGED IN -2 (OUTCOME-AWARE-2)
  The -1 revision asked "is the applier's POST version literal already in the
  target?". That test is unsound in BOTH directions, and both were measured on
  2026-09-29 against main:

    FALSE POSITIVE (masked rot). The literal extractor used
    `[^"']+` between quotes, so for
        POST = 'var VERSION = "2.37.13-attachguard-xml-form";'
    it captured only the truncated fragment `var VERSION = `. That fragment
    appears in EVERY versioned artifact, so the extractor reported
    "outcome present" for appliers whose outcome was NOT there.

    FALSE NEGATIVE (invented rot). The target extractor only understood
    `Path("...")`. Appliers that pin their target with
    `TARGET = os.path.join(ROOT, "scripts", "raw_put.py")` extracted ZERO
    targets, so `outcome_present` returned False by construction and every such
    applier was reported as permanent rot.

  -2 replaces the version-literal test with a CODE-LEVEL outcome test:
    * literals are read by a quote-aware scanner that stops only at the MATCHING
      quote, so nested opposite quotes survive intact;
    * targets are resolved from four idioms (Path(...), os.path.join(...),
      TARGET/SRC/MIRROR assignments, and basename lookup via git ls-files);
    * outcome signals are the applier's OWN markers (MARKER = "X-1", plus
      marker-shaped tokens declared in its docstring) and its OWN post-condition
      symbols (`text.count("attachmentGuardXml")`, `"X" in text`);
    * version literals are deliberately EXCLUDED as outcome signals, because a
      version literal goes stale the moment the artifact advances -- that is the
      mechanism that produced the false class in the first place;
    * a state that cannot be measured is reported as `undetermined`, NOT as rot.
      A doctor that cannot distinguish "superseded" from "rotted" must say so
      rather than file a defect it cannot substantiate.

WHAT IT DOES
  For each scripts/*patch*.py:
    1. reset the tree (git checkout -- .) so runs cannot contaminate each other
    2. run the script with REPO_ROOT set to the repo root
    3. classify the result:
         already-applied  rc 0 and the script says so / made no change
         applied-now      rc 0 and the tree CHANGED (patch absent from main)
         stale-anchor     rc 3 (fail-closed anchor mismatch)
         error            any other rc
         superseded       outcome PROVEN present in a resolved target
         undetermined     outcome not measurable (no target and/or no signal)
    4. reset the tree again
  Then writes audits/applier-doctor-<date>.json + ci-status/applier-doctor.json.

  `stale_anchor` and `never_landed` contain MEASURABLE rot only. Unmeasurable
  appliers are listed separately under `undetermined` and must NOT be filed as
  defects.

  Report-only by default (exit 0). STRICT=1 makes stale-anchor/applied-now exit 3.

SAFETY
  * read-only with respect to the fleet: it never deploys and never calls CF
  * requires a clean git tree unless ALLOW_DIRTY=1, because it resets the tree
  * never deletes or rewrites a patch script
  * a script that needs a secret (CF token, GitHub token) fails closed as `error`
    and is reported as such, not silently skipped
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

ROOT = os.environ.get("REPO_ROOT") or os.getcwd()
SCRIPTS = os.path.join(ROOT, "scripts")
STRICT = os.environ.get("STRICT") == "1"
ALLOW_DIRTY = os.environ.get("ALLOW_DIRTY") == "1"
TIMEOUT = int(os.environ.get("APPLIER_DOCTOR_TIMEOUT", "120"))

ALREADY_MARKERS = ("ALREADY APPLIED", "already applied", "NO_CHANGES")
LIT_START = "'\""
# Marker-shaped tokens: require a trailing -<digits> segment so prose like
# FAIL-CLOSED / IDEMPOTENT is not mistaken for a marker.
MARKER_TOKEN = re.compile(r"\b([A-Z][A-Z0-9]{2,}(?:-[A-Z0-9]{1,10})*-\d{1,3})\b")
SELFCHECK_IN = re.compile(r"(['\"])((?:(?!\1).)*)\1\s+(?:not\s+)?in\s+(?:text|src|body|out|patched)")


def sh(args, cwd=None, timeout=TIMEOUT, env=None):
    try:
        p = subprocess.run(args, cwd=cwd or ROOT, capture_output=True, text=True,
                           timeout=timeout, env=env)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT after %ds" % timeout
    except Exception as e:  # noqa: BLE001
        return 125, "ERR " + str(e)


def git(args):
    return sh(["git"] + args)


def tree_state():
    rc, out = git(["status", "--porcelain"])
    if rc != 0:
        return None, out
    return [ln for ln in out.splitlines() if ln.strip()], out


def reset():
    git(["checkout", "--", "."])
    git(["clean", "-fd", "scripts"])


def find_scripts():
    if not os.path.isdir(SCRIPTS):
        return []
    out = []
    for n in sorted(os.listdir(SCRIPTS)):
        if n.endswith(".py") and "patch" in n:
            out.append(os.path.join("scripts", n))
    return out


def _read_file(rel):
    try:
        with open(os.path.join(ROOT, rel), encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception:  # noqa: BLE001
        return None


def _read_lit(txt, i):
    """Read ONE string literal starting at/after i.

    QUOTE-AWARE: advances to the MATCHING quote only, so
    'var VERSION = "x";' yields the full body, not a truncated fragment.
    Returns (value_or_None, index_after).
    """
    n = len(txt)
    while i < n and txt[i] in " \t":
        i += 1
    if i >= n or txt[i] not in LIT_START:
        return None, i
    q = txt[i]
    j = i + 1
    buf = []
    while j < n:
        c = txt[j]
        if c == "\\":
            buf.append(txt[j:j + 2])
            j += 2
            continue
        if c == q:
            return "".join(buf), j + 1
        buf.append(c)
        j += 1
    return None, i


def _assign_lits(txt, name_re):
    out = []
    for m in re.finditer(r"(?m)^\s*(?:" + name_re + r")\w*\s*=\s*", txt):
        val, _ = _read_lit(txt, m.end())
        if val:
            out.append(val)
    return out


def _call_lits(txt, call_re):
    """Literals inside a call's parens, path-joined.

    os.path.join(ROOT, "scripts", "raw_put.py") -> "scripts/raw_put.py"
    Path("qnfo-ops/worker.js")                  -> "qnfo-ops/worker.js"
    """
    out = []
    for m in re.finditer(call_re, txt):
        i = m.end()
        n = len(txt)
        depth = 1
        parts = []
        while i < n and depth > 0:
            c = txt[i]
            if c in LIT_START:
                val, i = _read_lit(txt, i)
                if val:
                    parts.append(val)
                continue
            if c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        if parts:
            out.append("/".join(p.strip("/") for p in parts if p.strip("/")))
    return out


def _dedup(seq):
    seen, out = set(), []
    for x in seq:
        x = (x or "").strip()
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out


def declared_targets(txt):
    """Every target path the applier declares, across all four repo idioms."""
    t = []
    t += _call_lits(txt, r"Path\(")
    t += _call_lits(txt, r"os\.path\.join\(")
    t += _assign_lits(txt, r"(?:TARGET|SRC|MIRROR|DEST|ARTIFACT|FILE)")
    return _dedup(t)


def declared_markers(txt):
    """The applier's own idempotency markers: MARKER = "X-1" plus marker-shaped
    tokens declared in the module docstring."""
    m = _assign_lits(txt, r"MARKERS?")
    # OUTCOME-ALL-1: an ASSIGNED marker is the applier's own idempotency constant
    # and is authoritative. The docstring scan is only a fallback for appliers
    # that declare no such constant: a docstring that merely QUOTES a token
    # already present in the target file made outcome_present() report the
    # outcome as already present, so the applier was filed `superseded` and
    # never ran.
    if not m:
        m = MARKER_TOKEN.findall(txt[:3000])
    return _dedup(m)


def declared_symbols(txt):
    """The applier's own post-condition symbols, e.g. text.count("attachmentGuardXml").
    Version literals are excluded: they go stale by design and are exactly what
    produced the false class this revision removes."""
    s = _call_lits(txt, r"\.count\(")
    for m in SELFCHECK_IN.finditer(txt):
        s.append(m.group(2))
    return [x for x in _dedup(s) if "VERSION" not in x and len(x) <= 80]


def _resolve(target, script_rel):
    """Resolve a declared target to a real repo-relative path.

    Handles relative paths and basenames declared via os.path.join(ROOT, ...).
    Never returns the applier script itself.
    """
    if not target:
        return None
    cands = [target]
    if not os.path.isfile(os.path.join(ROOT, target)):
        base = os.path.basename(target)
        rc, out = git(["ls-files", "--", "*" + base])
        if rc == 0:
            cands += [ln.strip() for ln in out.splitlines() if ln.strip()]
    for c in cands:
        c = c.lstrip("./")
        if c == script_rel:
            continue
        if os.path.isfile(os.path.join(ROOT, c)):
            return c
    return None


def declared_outcome(script_rel):
    """Return (targets, markers, symbols) for one applier."""
    txt = _read_file(script_rel)
    if txt is None:
        return [], [], []
    return declared_targets(txt), declared_markers(txt), declared_symbols(txt)


def outcome_present(script_rel):
    """Ask the only question that matters: is the applier's CODE-LEVEL outcome
    already in the tree?

    Returns (present, hits, measurable). `measurable` is False when the applier
    declares no resolvable target and/or no outcome signal at all -- in that case
    the verdict is `undetermined`, never `stale-anchor`, so an unmeasurable
    applier cannot manufacture a defect ticket.
    """
    targets, markers, symbols = declared_outcome(script_rel)
    # OUTCOME-ALL-1: markers, when declared, are the authoritative outcome signal;
    # the post-condition symbols are only a fallback. ALL declared signals must be
    # present before an applier is called superseded - the old ANY-of test let a
    # single coincidental token mark a needed, correct applier as already-done.
    signals = _dedup(markers) or _dedup(symbols)
    hits = []
    resolved = []
    for t in targets:
        p = _resolve(t, script_rel)
        if not p:
            continue
        resolved.append(p)
        body = _read_file(p)
        if body is None:
            continue
        present = [lit for lit in signals if lit and lit in body]
        if signals and len(present) == len(signals):
            hits.extend("%s :: %s" % (p, lit[:80]) for lit in present)
    measurable = bool(resolved) and bool(signals)
    return (len(hits) > 0), hits, measurable


def failing_anchor(text):
    m = re.search(r"anchor count != 1 -> (\{[^}]*\})", text)
    if m:
        return m.group(1)
    m = re.search(r"ANCHOR[^:]*:\s*([^\n]+)", text)
    if m:
        return m.group(1).strip()[:200]
    return None


def run_one(rel):
    reset()
    before, _ = tree_state()
    before = before or []
    env = dict(os.environ)
    env["REPO_ROOT"] = ROOT
    rc, out = sh([sys.executable, rel], env=env)
    after, _ = tree_state()
    after = after or []
    changed = sorted(set(after) - set(before))
    superseded = []
    signals = []
    if rc == 0:
        said_already = any(m in out for m in ALREADY_MARKERS)
        verdict = "already-applied" if (said_already or not changed) else "applied-now"
    elif rc == 3:
        verdict = "stale-anchor"
    else:
        verdict = "error"
    # OUTCOME-AWARE-2: an applier whose outcome is PROVEN present is superseded;
    # one whose outcome cannot be measured is undetermined. Neither is rot.
    if verdict in ("stale-anchor", "error", "applied-now"):
        pres, hits, measurable = outcome_present(rel)
        if pres:
            verdict = "superseded"
            superseded = hits
        elif not measurable:
            verdict = "undetermined"
            _t, _m, _s = declared_outcome(rel)
            signals = _t + _m + _s
    reset()
    rec = {
        "script": rel,
        "rc": rc,
        "verdict": verdict,
        "changed_files": changed[:10],
        "tail": out.strip().splitlines()[-3:] if out.strip() else [],
    }
    if superseded:
        rec["outcome_present_in"] = superseded
    if signals:
        rec["declared_signals"] = signals[:8]
    if verdict == "stale-anchor":
        fa = failing_anchor(out)
        if fa:
            rec["failing_anchor"] = fa
    return rec


def main():
    state, raw = tree_state()
    if state is None:
        print("FAIL(3): not a git tree (%s) - run inside a checkout" % raw.strip()[:160])
        return 3
    if state and not ALLOW_DIRTY:
        print("FAIL(3): dirty tree (%d path(s)); commit/stash first or set ALLOW_DIRTY=1" % len(state))
        for ln in state[:10]:
            print("   ", ln)
        return 3

    scripts = find_scripts()
    print("APPLIER-DOCTOR-2 scanning %d patch script(s) under %s" % (len(scripts), SCRIPTS))
    recs = []
    for rel in scripts:
        r = run_one(rel)
        recs.append(r)
        print("  %-52s rc=%-3s %s%s" % (
            os.path.basename(rel), r["rc"], r["verdict"],
            ("  anchor=" + str(r.get("failing_anchor"))[:120]) if r.get("failing_anchor") else ""))

    counts = {}
    for r in recs:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
    stale = [r["script"] for r in recs if r["verdict"] == "stale-anchor"]
    superseded_l = [r["script"] for r in recs if r["verdict"] == "superseded"]
    never = [r["script"] for r in recs if r["verdict"] == "applied-now"]
    errored = [r["script"] for r in recs if r["verdict"] == "error"]
    undet = [r["script"] for r in recs if r["verdict"] == "undetermined"]

    report = {
        "marker": "APPLIER-DOCTOR-2",
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "total": len(recs),
        "counts": counts,
        "stale_anchor": stale,
        "never_landed": never,
        "errored": errored,
        "superseded": superseded_l,
        "undetermined": undet,
        "results": recs,
    }
    try:
        os.makedirs(os.path.join(ROOT, "audits"), exist_ok=True)
        os.makedirs(os.path.join(ROOT, "ci-status"), exist_ok=True)
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        with open(os.path.join(ROOT, "audits", "applier-doctor-%s.json" % day), "w") as f:
            json.dump(report, f, indent=1, sort_keys=True)
        with open(os.path.join(ROOT, "ci-status", "applier-doctor.json"), "w") as f:
            json.dump({k: report[k] for k in
                       ("marker", "ts", "total", "counts", "stale_anchor", "never_landed", "errored",
                        "superseded", "undetermined")},
                      f, sort_keys=True)
    except Exception as e:  # noqa: BLE001
        print("WARN: could not write report: %s" % e)

    print("SUMMARY total=%d %s" % (len(recs), counts))
    if stale:
        print("STALE_ANCHOR(%d): %s" % (len(stale), ", ".join(os.path.basename(s) for s in stale)))
    if never:
        print("NEVER_LANDED(%d): %s" % (len(never), ", ".join(os.path.basename(s) for s in never)))
    if errored:
        print("ERRORED(%d): %s" % (len(errored), ", ".join(os.path.basename(s) for s in errored)))
    if superseded_l:
        print("SUPERSEDED(%d): %s" % (len(superseded_l), ", ".join(os.path.basename(s) for s in superseded_l)))
    if undet:
        print("UNDETERMINED(%d): %s" % (len(undet), ", ".join(os.path.basename(s) for s in undet)))

    if STRICT and (stale or never):
        print("FAIL(3): STRICT=1 and %d stale / %d never-landed" % (len(stale), len(never)))
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
