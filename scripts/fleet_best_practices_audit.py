#!/usr/bin/env python3
"""FLEET-BEST-PRACTICES-AUDIT-1 (charter pillar: autonomy). Read-only scan of every worker directory against the Cloudflare Workers
best-practice checklist (2026-10 research): observability and traces declared, compatibility-date age, and the code anti-patterns that can be
detected statically. Heuristic by design: each finding names the check, the file and line so a doer can fix or dismiss it with evidence.
Usage: python3 scripts/fleet_best_practices_audit.py [--json] [--check <name>]   (exit 0 always; a report, never a gate)."""
import json, re, sys, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
TODAY = datetime.date.today()
SECRET_NAME = r"(?:TOKEN|SECRET|KEY|PASSWORD|SIGNATURE|HMAC|AUTH)"
CHECKS = {
    "math-random-token": (re.compile(r"Math\.random\(\)[^;\n]{0,80}(?:toString\(36\)|toString\(16\)|slice|substr)"), "Math.random used to build an identifier or token: use crypto.randomUUID()/getRandomValues"),
    "pass-through-on-exception": (re.compile(r"\.passThroughOnException\s*\("), "passThroughOnException hides failures: explicit try/catch and an error response"),
    "destructured-ctx": (re.compile(r"(?:const|let|var)\s*\{[^}]*\b(?:waitUntil|passThroughOnException)\b[^}]*\}\s*=\s*(?:ctx|context)\b"), "destructuring ctx loses the receiver (Illegal invocation)"),
    "rest-api-for-binding": (re.compile(r"api\.cloudflare\.com/client/v4/accounts/[^`'\"]{0,60}/(?:d1|kv|r2|queues|workflows)\b"), "REST API call for a resource a binding reaches"),
    "secret-compare": (re.compile(r"(?:===|!==)\s*(?:env|this\.env)\.[A-Z_]*" + SECRET_NAME + r"[A-Z_]*\b|\benv\.[A-Z_]*" + SECRET_NAME + r"[A-Z_]*\s*(?:===|!==)"), "string comparison of a secret: use a constant-time compare"),
    "ai-response-string-assumption": (re.compile(r"\b(?:res|resp|result|out|output|ai\w*|r)\.response\.(?:trim|match|replace|split|toLowerCase|slice)\("), "Workers AI `response` can be a parsed object: normalise before string methods"),
    "unbounded-body-buffer": (re.compile(r"await\s+(?:request|req)\.(?:text|arrayBuffer|blob)\(\)"), "request body buffered without a size guard"),
}
AI_RUN = re.compile(r"\bAI\.run\(\s*[^,()]+,\s*\{")  # only a call whose input is an inline object: a pass-through wrapper takes its caller's limits

def toml_val(text, key):
    m = re.search(r"^\s*" + re.escape(key) + r"\s*=\s*(.+?)\s*(?:#.*)?$", text, re.M)
    return m.group(1).strip().strip('"') if m else None

def scan_worker(d):
    out = {"worker": d.name, "config": [], "code": []}
    wt = d / "wrangler.toml"; wj = d / "wrangler.jsonc"; wjs = d / "worker.js"
    if (d / "RETIRED").exists() or (d / "FOLDED").exists():
        out["skipped"] = "retired or folded"; return out
    cfg = wt.read_text(errors="replace") if wt.exists() else (wj.read_text(errors="replace") if wj.exists() else "")
    if not cfg:
        out["skipped"] = "no wrangler config"; return out
    if not re.search(r"^\s*\[observability\]", cfg, re.M) and '"observability"' not in cfg:
        out["config"].append(("observability-missing", "no [observability] block: logs are off"))
    else:
        if not re.search(r"observability\.traces|\[observability\.traces\]", cfg):
            out["config"].append(("traces-not-declared", "observability.traces.enabled is not declared"))
        if not re.search(r"head_sampling_rate", cfg):
            out["config"].append(("sampling-not-explicit", "no explicit head_sampling_rate"))
    cd = toml_val(cfg, "compatibility_date")
    if cd:
        try:
            age = (TODAY - datetime.date.fromisoformat(cd)).days
            if age > 180: out["config"].append(("compat-date-old", "compatibility_date %s is %d days old" % (cd, age)))
        except ValueError: pass
    else:
        out["config"].append(("compat-date-missing", "no compatibility_date"))
    if wjs.exists():
        lines = wjs.read_text(errors="replace").split("\n")
        for i, ln in enumerate(lines, 1):
            if ln.lstrip().startswith("//"): continue
            for name, (rx, why) in CHECKS.items():
                if name == "ai-response-string-assumption" and "typeof" in ln: continue  # guarded on the same line
                if rx.search(ln): out["code"].append((name, i, why))
        src = "\n".join(lines)
        for m in AI_RUN.finditer(src):
            seg = src[m.end(): m.end() + 600]
            head = src[m.start(): m.end()]
            if re.search(r"bge|embed|EMBED", head) or re.match(r"\s*(text|image|audio|prompt)\s*:", seg): continue  # embedding or media model: no token budget applies
            if "max_tokens" not in seg and "max_completion_tokens" not in seg:
                out["code"].append(("ai-run-no-token-budget", src.count("\n", 0, m.start()) + 1, "env.AI.run call without an explicit token budget in view"))
    return out

def main():
    as_json = "--json" in sys.argv
    only = sys.argv[sys.argv.index("--check") + 1] if "--check" in sys.argv else None
    res = [scan_worker(d) for d in sorted(ROOT.iterdir()) if d.is_dir() and not d.name.startswith((".", "_")) and d.name not in ("scripts", "docs", "migrations", "node_modules")]
    res = [r for r in res if "skipped" not in r or r.get("config") or r.get("code")]
    tally = {}
    for r in res:
        for n, *_ in r.get("config", []) + r.get("code", []):
            if only and n != only: continue
            tally.setdefault(n, set()).add(r["worker"])
    if as_json:
        print(json.dumps({"date": str(TODAY), "workers": len(res), "findings": res}, indent=1)); return
    print("workers scanned: %d" % len(res))
    for n in sorted(tally, key=lambda k: -len(tally[k])):
        print("%-30s %3d workers  e.g. %s" % (n, len(tally[n]), ", ".join(sorted(tally[n])[:4])))

if __name__ == "__main__":
    main()
