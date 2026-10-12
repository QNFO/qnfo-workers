#!/usr/bin/env python3
"""workers_standards_guard.py -- WORKERS-STANDARDS-GUARD-1 (charter pillar: autonomy). Standing, diff-only enforcement of the Cloudflare Workers
best practices that can be detected statically (see scripts/fleet_best_practices_audit.py for the whole-tree report).

It fails a change only for what the change ADDS, so existing debt that other sessions are fixing never blocks unrelated work:
  * a worker.js line that adds one of the high-confidence anti-patterns (Math.random-built ids/tokens, passThroughOnException,
    destructured ctx, string comparison of a secret);
  * a wrangler.toml change that removes an [observability] block, or a brand-new worker (new wrangler.toml) without [observability] and
    explicit traces.
A line can carry `// standards-ok: <reason>` when a hit is a false positive (the reason is the record).
Usage: python3 scripts/workers_standards_guard.py [BASE]     BASE defaults to $GUARD_BASE, then origin/main; on a push to main use HEAD~1.
Exit 0 clean, 1 a violation, 2 usage/IO error (fail closed)."""
import os, re, subprocess, sys

SECRET = r"(?:TOKEN|SECRET|KEY|PASSWORD|SIGNATURE|HMAC|AUTH)"
RULES = {
    "math-random-token": (re.compile(r"Math\.random\(\)[^;\n]{0,80}(?:toString\(36\)|toString\(16\)|slice|substr)"), "Math.random builds an id or token: use crypto.randomUUID()/getRandomValues"),
    "pass-through-on-exception": (re.compile(r"passThroughOnException"), "passThroughOnException hides failures: use try/catch and an explicit error response"),
    "destructured-ctx": (re.compile(r"(?:const|let|var)\s*\{[^}]*\b(?:waitUntil|passThroughOnException)\b[^}]*\}\s*=\s*(?:ctx|context)\b"), "destructuring ctx loses the receiver (Illegal invocation)"),
    "secret-compare": (re.compile(r"(?:===|!==)\s*(?:env|this\.env)\.[A-Z_]*" + SECRET + r"[A-Z_]*\b|\benv\.[A-Z_]*" + SECRET + r"[A-Z_]*\s*(?:===|!==)"), "string comparison of a secret: use a constant-time compare"),
}

def git(*a):
    r = subprocess.run(["git", *a], capture_output=True, text=True)
    if r.returncode not in (0, 1): raise RuntimeError("git %s: %s" % (" ".join(a), r.stderr.strip()[:200]))
    return r.stdout

def added_lines(base, path):
    """(lineno, text) of lines the change adds to path."""
    out, ln = [], 0
    for row in git("diff", "-U0", base, "--", path).split("\n"):
        m = re.match(r"@@ -\d+(?:,\d+)? \+(\d+)", row)
        if m: ln = int(m.group(1)); continue
        if row.startswith("+") and not row.startswith("+++"):
            out.append((ln, row[1:])); ln += 1
    return out

def check_code(lines):
    bad = []
    for ln, text in lines:
        s = text.strip()
        if s.startswith("//") or "standards-ok:" in text: continue
        for name, (rx, why) in RULES.items():
            if rx.search(text): bad.append((name, ln, why))
    return bad

def has_obs(cfg): return bool(re.search(r"^\s*\[observability\]", cfg, re.M)) or '"observability"' in cfg
def has_traces(cfg): return bool(re.search(r"\[observability\.traces\]|observability\.traces", cfg)) or bool(re.search(r'"traces"\s*:', cfg))

def check_config(base, path):
    bad = []
    new = open(path, errors="replace").read() if os.path.exists(path) else ""
    try: old = git("show", base + ":" + path)
    except RuntimeError: old = ""
    if not new: return bad
    if old and has_obs(old) and not has_obs(new): bad.append(("observability-removed", 1, "the change removes the [observability] block"))
    if old and has_traces(old) and not has_traces(new): bad.append(("traces-removed", 1, "the change removes observability.traces"))
    if not old and not (has_obs(new) and has_traces(new)): bad.append(("new-worker-observability", 1, "a new worker declares [observability] with traces and an explicit head_sampling_rate"))
    return bad

def main():
    base = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("GUARD_BASE", "origin/main")
    try:
        names = [n for n in git("diff", "--name-only", base).split("\n") if n]
        viol = []
        for n in names:
            d = n.split("/")[0]
            if os.path.exists(os.path.join(d, "RETIRED")) or os.path.exists(os.path.join(d, "FOLDED")): continue
            if re.fullmatch(r"[^/]+/worker\.js", n) and os.path.exists(n):
                viol += [(n, *v) for v in check_code(added_lines(base, n))]
            elif re.fullmatch(r"[^/]+/wrangler\.(toml|jsonc)", n):
                viol += [(n, *v) for v in check_config(base, n)]
    except (RuntimeError, OSError) as e:
        print("WORKERS-STANDARDS-GUARD-1: cannot read the diff (%s); failing closed" % e); return 2
    if not viol:
        print("WORKERS-STANDARDS-GUARD-1: ok (%d changed files checked against %s)" % (len(names), base)); return 0
    print("WORKERS-STANDARDS-GUARD-1: %d violation(s) added by this change:" % len(viol))
    for f, name, ln, why in viol: print("  %s:%d [%s] %s" % (f, ln, name, why))
    print("Fix it, or mark a false positive with `// standards-ok: <reason>` on the line.")
    return 1

if __name__ == "__main__":
    sys.exit(main())
