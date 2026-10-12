#!/usr/bin/env python3
"""FLEET-BEST-PRACTICES-AUDIT-2 (charter pillar: autonomy). Whole-tree scan of every live worker directory against the Cloudflare Workers
best-practice checklist (2026-10 research: Workers Best Practices guide 2026-02-15/2026-09-24, compatibility flags page, D1 and Queues
limits, Email Service send bindings, Rules of Durable Objects) and, with --d1, the measured half of the closed loop that CI's diff-only
guard (scripts/workers_standards_guard.py) cannot give: the whole tree's standing debt written to qnfo-audit so that a probe can close
the issues about it and a metric can file them when they come back.

Checks. Severity `fail` is a pattern the guard also refuses in a change; `advisory` is a review item the guard does not block.
  code (per line of <worker>/worker.js, comment lines and lines carrying `standards-ok:` skipped, scripts/workers-standards-allowlist.txt honoured)
    math-random-token (fail)            Math.random building an id or token (toString(36)/slice, or assigned to an id/token/nonce/key name)
    pass-through-on-exception (fail)    a call of passThroughOnException (the no-op member of a stub ctx is not a call)
    destructured-ctx (fail)             waitUntil/passThroughOnException destructured from ctx
    secret-compare (fail)               ==, ===, != or !== against env.<NAME with TOKEN|SECRET|KEY|PASSWORD|SIGNATURE|HMAC|AUTH> (a presence test passes)
    interpolated-sql (fail)             a template literal with ${} inside prepare(`...`): bind parameters instead (D1 limits: 100 bound parameters)
    rest-api-for-binding (advisory)     api.cloudflare.com call for a D1/KV/R2/Queues/Workflows resource a binding reaches
    ai-response-string-assumption (adv) `.response.trim()` and friends: Workers AI returns a parsed object in JSON mode
    unbounded-body-buffer (advisory)    await request.text()/arrayBuffer()/blob() with no size guard (128 MB per isolate)
    swallowed-catch (advisory)          an empty catch block or .catch(function () {}): the failure never reaches Workers Logs (WORKERS-BP-LOGGING-1)
    ai-run-no-token-budget (advisory)   env.AI.run with an inline input object and no max_tokens / max_completion_tokens in view
    message-raw-double-read (advisory)  an email handler reads message.raw more than once (a ReadableStream reads once)
  config (<worker>/wrangler.toml)
    observability-missing (fail)        no [observability] block: logs are off
    traces-not-declared (fail)          observability.enabled alone enables logs only; traces need [observability.traces] enabled = true
    sampling-not-explicit (advisory)    no explicit head_sampling_rate (stored traces and logs bill from 2026-12-01)
    compat-date-missing (fail)          no compatibility_date (the API then uses the oldest date)
    compat-date-old (advisory)          compatibility_date older than 180 days (advance through COMPAT-DATE-DECLARED-APPLY-1, reviewed)
    node-imports-without-flag (fail)    worker.js imports node:* with a date before 2026-08-04 and no nodejs_compat flag
    redundant-nodejs-compat (advisory)  nodejs_compat listed with a date of 2026-08-04 or later, where it is the default (remove on the date bump;
                                        measured 2026-10-12: the canonical API deploy and wrangler --dry-run both accept it, so not a failure)
    queue-consumer-no-dlq (fail)        a [[queues.consumers]] block without dead_letter_queue (a message that fails max_retries times is discarded)
    legacy-do-storage (advisory)        new_classes (KV-backed Durable Object storage) in a migration; new classes use new_sqlite_classes
    send-email-unrestricted (advisory)  a [[send_email]] binding with no destination_address / allowed_destination_addresses / allowed_sender_addresses
    limits-not-declared (advisory)      no [limits] cpu_ms (a runaway guard; inert until the canonical deploy carries limits, LIMITS-DECLARED-APPLY-1)
  fleet
    cron-budget                         total cron triggers across live workers against the 250-per-account limit (reported, fails above 200)

Usage:
  python3 scripts/fleet_best_practices_audit.py [--json] [--check <name>] [--worker <dir>]   report; exit 0 always
  python3 scripts/fleet_best_practices_audit.py --d1                                          write qnfo-audit (WORKERS-BP-AUDIT-D1-1):
      replaces workers_bp_findings with this run, appends one workers_bp_runs row, writes metric_registry workers_bp_findings_open, and files one
      deduped WORKERS-BP-DEBT-1: <worker> issue per worker with fail-class findings, carrying code-task / code-anchor lines for the code loop and a
      d1-query probe that passes when that worker has no fail-class row. Runs as part of the remediation-consumer step (loop_breaker_runner.py);
      needs CLOUDFLARE_API_TOKEN and CF_ACCOUNT_ID like the other runners. Never raises past main().
  python3 scripts/fleet_best_practices_audit.py --selftest                                    offline suite against an in-memory sqlite shim
"""
import datetime
import json
import os
import pathlib
import re
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
TODAY = datetime.date.today()
NODE_DEFAULT_DATE = datetime.date(2026, 8, 4)  # nodejs_compat and nodejs_compat_v2 on by default from this compatibility date
CRON_ACCOUNT_LIMIT = 250
SECRET_NAME = r"(?:TOKEN|SECRET|KEY|PASSWORD|SIGNATURE|HMAC|AUTH)"
ENV_SECRET = r"(?:env|this\.env)\.[A-Z0-9_]*" + SECRET_NAME + r"[A-Z0-9_]*\b"
EQ = r"(?:===|!==|==|!=)"
ID_NAME = r"(?:[A-Za-z0-9_$]*(?:Id|ID|_id|Token|_token|TOKEN|Nonce|_nonce|Secret|_secret|Salt|_salt|Otp|_otp|Key|_key|Uuid|UUID|_uuid)|id|token|nonce|secret|salt|otp|key|uuid)"
PRESENCE = re.compile(ENV_SECRET + r"\s*" + EQ + r"\s*(?:undefined|null|\"\"|''|void 0)|(?:undefined|null|\"\"|''|void 0|typeof\s+" + ENV_SECRET + r")\s*" + EQ + r"\s*(?:" + ENV_SECRET + r"|[\"']undefined[\"'])")

# name: (regex, severity, why)
CHECKS = {
    "math-random-token": (re.compile(r"Math\.random\(\)[^;\n]{0,80}(?:toString\(36\)|toString\(16\)|slice|substr)|(?<![A-Za-z0-9_$.])" + ID_NAME + r"\s*[:=](?!=)[^;\n=]{0,80}Math\.random\("), "fail", "Math.random builds an id or token: use crypto.randomUUID()/getRandomValues"),
    "pass-through-on-exception": (re.compile(r"\.passThroughOnException\s*\("), "fail", "passThroughOnException hides failures: use try/catch and an explicit error response"),
    "destructured-ctx": (re.compile(r"(?:const|let|var)\s*\{[^}]*\b(?:waitUntil|passThroughOnException)\b[^}]*\}\s*=\s*(?:ctx|context|this\.ctx)\b"), "fail", "destructuring ctx loses the receiver (Illegal invocation)"),
    "secret-compare": (re.compile(EQ + r"\s*" + ENV_SECRET + "|" + ENV_SECRET + r"\s*" + EQ), "fail", "string comparison of a secret: use a constant-time compare over SHA-256 digests"),
    "interpolated-sql": (re.compile(r"prepare\s*\(\s*`[^`]*\$\{"), "fail", "SQL built by interpolation: bind the value (prepare(...).bind(...)) so it is neither injected nor miscounted against the 100-parameter limit"),
    "rest-api-for-binding": (re.compile(r"api\.cloudflare\.com/client/v4/accounts/[^`'\"]{0,60}/(?:d1|kv|r2|queues|workflows)\b"), "advisory", "REST API call for a resource a binding reaches"),
    "ai-response-string-assumption": (re.compile(r"\b(?:res|resp|result|out|output|ai\w*|r)\.response\.(?:trim|match|replace|split|toLowerCase|slice)\("), "advisory", "Workers AI `response` can be a parsed object: normalise before string methods"),
    "unbounded-body-buffer": (re.compile(r"await\s+(?:request|req)\.(?:text|arrayBuffer|blob)\(\)"), "advisory", "request body buffered without a size guard"),
    "swallowed-catch": (re.compile(r"\.catch\s*\(\s*(?:function\s*\([^)]*\)\s*\{\s*\}|\([^)]*\)\s*=>\s*\{\s*\}|[A-Za-z_$][\w$]*\s*=>\s*\{\s*\})\s*\)|\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}"), "advisory", "a swallowed error never reaches Workers Logs: log console.error(JSON.stringify({...})) or record the failure"),
}
AI_RUN = re.compile(r"\bAI\.run\(\s*[^,()]+,\s*\{")  # only a call whose input is an inline object: a pass-through wrapper takes its caller's limits
NODE_IMPORT = re.compile(r"(?:^|\n)\s*import\s[^\n]*\sfrom\s*[\"']node:|require\(\s*[\"']node:")
STANDARDS_OK = "standards-ok:"

SEVERITY = {"observability-missing": "fail", "traces-not-declared": "fail", "sampling-not-explicit": "advisory", "compat-date-missing": "fail",
            "compat-date-old": "advisory", "node-imports-without-flag": "fail", "redundant-nodejs-compat": "advisory", "queue-consumer-no-dlq": "fail",
            "legacy-do-storage": "advisory", "send-email-unrestricted": "advisory", "limits-not-declared": "advisory", "ai-run-no-token-budget": "advisory",
            "message-raw-double-read": "advisory"}
for _n, (_rx, _sev, _why) in CHECKS.items(): SEVERITY[_n] = _sev

DOCS = {"math-random-token": "https://developers.cloudflare.com/workers/best-practices/workers-best-practices/",
        "secret-compare": "https://developers.cloudflare.com/workers/best-practices/workers-best-practices/",
        "interpolated-sql": "https://developers.cloudflare.com/d1/platform/limits/",
        "traces-not-declared": "https://developers.cloudflare.com/workers/observability/traces/",
        "observability-missing": "https://developers.cloudflare.com/workers/observability/logs/workers-logs/",
        "queue-consumer-no-dlq": "https://developers.cloudflare.com/queues/configuration/dead-letter-queues/",
        "node-imports-without-flag": "https://developers.cloudflare.com/workers/runtime-apis/nodejs/",
        "compat-date-missing": "https://developers.cloudflare.com/workers/configuration/compatibility-dates/"}


def _allowlist():
    """scripts/workers-standards-allowlist.txt through the guard's own loader, so a reviewed exception is one record for both tools."""
    try:
        sys.path.insert(0, str(ROOT / "scripts"))
        import workers_standards_guard as W  # noqa: E402
        return W.load_allowlist(), W.allowed
    except Exception:  # noqa: BLE001  (the audit is a report; a missing guard never stops it)
        return [], (lambda allow, path, rule, text: False)


def strip_comments(cfg): return "\n".join(l for l in cfg.split("\n") if not l.strip().startswith("#"))


def toml_val(text, key):
    m = re.search(r"^\s*" + re.escape(key) + r"\s*=\s*(.+?)\s*(?:#.*)?$", strip_comments(text), re.M)
    return m.group(1).strip().strip('"') if m else None


def toml_flags(text):
    m = re.search(r"^\s*compatibility_flags\s*=\s*\[([^\]]*)\]", strip_comments(text), re.M)
    return re.findall(r"[\"']([^\"']+)[\"']", m.group(1)) if m else []


def blocks(cfg, header):
    """Bodies of every `[[header]]` block of a wrangler.toml (comments stripped)."""
    text, out = strip_comments(cfg), []
    for m in re.finditer(r"^[ \t]*\[\[" + re.escape(header) + r"\]\][ \t]*$", text, re.M):
        rest = text[m.end():]
        n = re.search(r"^[ \t]*\[", rest, re.M)
        out.append(rest[:n.start()] if n else rest)
    return out


def crons(cfg):
    m = re.search(r"^\s*crons\s*=\s*\[([^\]]*)\]", strip_comments(cfg), re.M)
    return re.findall(r"[\"']([^\"']+)[\"']", m.group(1)) if m else []


def config_findings(cfg, src):
    """[(check, line, why)] for one wrangler.toml, given the worker source for the node-import cross-check."""
    out, text = [], strip_comments(cfg)
    if not re.search(r"^\s*\[observability\]", text, re.M) and '"observability"' not in cfg:
        out.append(("observability-missing", 1, "no [observability] block: logs are off"))
    else:
        if not re.search(r"\[observability\.traces\]|\"traces\"\s*:", text):
            out.append(("traces-not-declared", 1, "observability.traces.enabled is not declared (the top-level switch enables logs only)"))
        if "head_sampling_rate" not in text:
            out.append(("sampling-not-explicit", 1, "no explicit head_sampling_rate (stored traces and logs bill from 2026-12-01)"))
    cd = toml_val(cfg, "compatibility_date")
    flags = toml_flags(cfg)
    has_node_flag = "nodejs_compat" in flags or "nodejs_compat_v2" in flags
    date = None
    if cd:
        try: date = datetime.date.fromisoformat(cd)
        except ValueError: out.append(("compat-date-missing", 1, "compatibility_date %r is not a date" % cd))
    else:
        out.append(("compat-date-missing", 1, "no compatibility_date: the API applies the oldest one"))
    if date:
        age = (TODAY - date).days
        if age > 180: out.append(("compat-date-old", 1, "compatibility_date %s is %d days old" % (cd, age)))
        if has_node_flag and date >= NODE_DEFAULT_DATE:
            out.append(("redundant-nodejs-compat", 1, "nodejs_compat is the default from 2026-08-04; the flag is redundant at %s" % cd))
        if NODE_IMPORT.search(src or "") and date < NODE_DEFAULT_DATE and not has_node_flag:
            out.append(("node-imports-without-flag", 1, "worker.js imports node:* but the date %s is before 2026-08-04 and nodejs_compat is not set" % cd))
    for i, body in enumerate(blocks(cfg, "queues.consumers"), 1):
        q = re.search(r"^[ \t]*queue[ \t]*=[ \t]*[\"']([^\"']+)[\"']", body, re.M)
        if not re.search(r"^[ \t]*dead_letter_queue[ \t]*=", body, re.M):
            out.append(("queue-consumer-no-dlq", 1, "queue consumer %s has no dead_letter_queue" % (q.group(1) if q else "#%d" % i)))
    if re.search(r"^\s*new_classes\s*=", text, re.M):
        out.append(("legacy-do-storage", 1, "new_classes declares KV-backed Durable Object storage; new classes use new_sqlite_classes"))
    for i, body in enumerate(blocks(cfg, "send_email"), 1):
        if not re.search(r"^[ \t]*(?:destination_address|allowed_destination_addresses|allowed_sender_addresses)[ \t]*=", body, re.M):
            out.append(("send-email-unrestricted", 1, "send_email binding #%d sets no destination or sender restriction" % i))
    if not re.search(r"^\s*\[limits\]", text, re.M):
        out.append(("limits-not-declared", 1, "no [limits] cpu_ms runaway guard (inert until the canonical deploy carries limits: LIMITS-DECLARED-APPLY-1)"))
    return out


def code_findings(lines, path=None, allow=None, allowed=None):
    """[(check, line, why, text)] for the lines of a worker.js."""
    out = []
    for i, ln in enumerate(lines, 1):
        s = ln.strip()
        if s.startswith("//") or s.startswith("*") or STANDARDS_OK in ln: continue
        for name, (rx, _sev, why) in CHECKS.items():
            if name == "ai-response-string-assumption" and "typeof" in ln: continue  # guarded on the same line
            probe = PRESENCE.sub(" ", ln) if name == "secret-compare" else ln
            if rx.search(probe) and not (allowed and allowed(allow, path, name, ln)):
                out.append((name, i, why, ln.strip()[:200]))
    src = "\n".join(lines)
    for m in AI_RUN.finditer(src):
        seg = src[m.end(): m.end() + 600]
        close = re.search(r"\)\s*;", seg)  # the call's own statement end: a budget on the next statement does not count for this call
        if close: seg = seg[:close.end()]
        head = src[m.start(): m.end()]
        if re.search(r"bge|embed|EMBED", head) or re.match(r"\s*(text|image|audio|prompt)\s*:", seg): continue  # embedding or media model: no token budget applies
        if "max_tokens" not in seg and "max_completion_tokens" not in seg:
            ln = src.count("\n", 0, m.start()) + 1
            out.append(("ai-run-no-token-budget", ln, "env.AI.run call without an explicit token budget in view", lines[ln - 1].strip()[:200]))
    if re.search(r"\basync\s+email\s*\(|\bemail\s*\(\s*message\b", src):
        reads = [i for i, ln in enumerate(lines, 1) if "message.raw" in ln and not ln.strip().startswith("//")]
        if len(reads) > 1:
            out.append(("message-raw-double-read", reads[1], "message.raw is a ReadableStream and reads once; buffer it once and reuse (%d reads)" % len(reads), lines[reads[1] - 1].strip()[:200]))
    return out


def live_dirs(root=ROOT):
    skip = {"scripts", "docs", "migrations", "node_modules", "audits", "papers", "funding", "research-code", "machine-readability"}
    for d in sorted(root.iterdir()):
        if not d.is_dir() or d.name.startswith((".", "_")) or d.name in skip: continue
        if (d / "RETIRED").exists() or (d / "FOLDED").exists(): continue
        if not ((d / "wrangler.toml").exists() or (d / "wrangler.jsonc").exists()): continue
        yield d


def scan_worker(d, allow=None, allowed=None):
    out = {"worker": d.name, "config": [], "code": [], "crons": 0}
    wt, wj, wjs = d / "wrangler.toml", d / "wrangler.jsonc", d / "worker.js"
    cfg = wt.read_text(errors="replace") if wt.exists() else (wj.read_text(errors="replace") if wj.exists() else "")
    src = wjs.read_text(errors="replace") if wjs.exists() else ""
    if cfg:
        out["config"] = config_findings(cfg, src)
        out["crons"] = len(crons(cfg))
    if src:
        out["code"] = code_findings(src.split("\n"), d.name + "/worker.js", allow, allowed)
    return out


def scan_all(root=ROOT):
    allow, allowed = _allowlist()
    res = [scan_worker(d, allow, allowed) for d in live_dirs(root)]
    total_crons = sum(r["crons"] for r in res)
    fleet = [("cron-budget", 0, "%d cron triggers across %d live workers (account limit %d)" % (total_crons, len(res), CRON_ACCOUNT_LIMIT))]
    return res, fleet, total_crons


def rows(res):
    """Flat finding rows: (worker, check, severity, file, line, line_text, why)."""
    out = []
    for r in res:
        for name, ln, why in r["config"]:
            out.append((r["worker"], name, SEVERITY.get(name, "advisory"), r["worker"] + "/wrangler.toml", ln, "", why))
        for name, ln, why, text in r["code"]:
            out.append((r["worker"], name, SEVERITY.get(name, "advisory"), r["worker"] + "/worker.js", ln, text, why))
    return out


# ---------------------------------------------------------------- D1 half (WORKERS-BP-AUDIT-D1-1)
METRIC = "workers_bp_findings_open"
ISSUE_TITLE = "WORKERS-BP-DEBT-1: %s"


def q(s): return "'" + str(s).replace("'", "''") + "'"


def now_ms(): return int(time.time() * 1000)


def git_sha(root=ROOT):
    try: return subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=root).stdout.strip() or None
    except OSError: return None


def anchor_for(root, path, text):
    """The finding's own line text when it occurs exactly once in the file (the code loop's code-anchor contract), else None."""
    if not text: return None
    try: src = (root / path).read_text(errors="replace")
    except OSError: return None
    return text if src.count(text) == 1 else None


def issue_text(worker, frows, root=ROOT, sha=None):
    fails = [r for r in frows if r[2] == "fail"]
    advs = [r for r in frows if r[2] != "fail"]
    lines = ["Charter pillar: security/core. Measured by scripts/fleet_best_practices_audit.py --d1 (WORKERS-BP-AUDIT-D1-1) on main%s, "
             "%s. Fail-class findings are patterns the CI guard refuses in any new change (scripts/workers_standards_guard.py); this issue "
             "is the standing debt in %s. Each line below is check, file:line and the offending text." % (" " + sha if sha else "", TODAY.isoformat(), worker), ""]
    for r in fails: lines.append("- [%s] %s:%d %s%s" % (r[1], r[3], r[4], ("`" + r[5][:160] + "` ") if r[5] else "", r[6]))
    if advs:
        lines.append("")
        lines.append("Advisory (review, not blocked): " + "; ".join(sorted({"%s x%d" % (c, sum(1 for a in advs if a[1] == c)) for c in {a[1] for a in advs}})))
    lines.append("")
    lines.append("Fix: " + "; ".join(sorted({CHECKS[r[1]][2] if r[1] in CHECKS else r[6] for r in fails})) + ". Bump VERSION (patch), keep deployed-current.worker.js identical, add a near-miss test where a token check changes. Docs: " + "; ".join(sorted({DOCS[r[1]] for r in fails if r[1] in DOCS})))
    files = sorted({r[3] for r in fails}, key=lambda p: (not p.endswith("worker.js"), p))
    if files:
        path = files[0]
        lines.append("")
        lines.append("code-task: repo=qnfo-workers path=%s" % path)
        anchor = next((anchor_for(root, r[3], r[5]) for r in fails if r[3] == path and anchor_for(root, r[3], r[5])), None)
        if anchor: lines.append("code-anchor: %s" % anchor)
    lines.append("")
    lines.append("Closes itself when the next audit run finds no fail-class row for this worker (d1-query probe on workers_bp_findings).")
    return "\n".join(lines)


def probe_for(worker):
    """Passes when the latest run (at most 26 h old, else 'no-run': an empty table before the first run must not pass) has no fail row for the worker."""
    return ("SELECT '0' AS expected, CASE WHEN (SELECT MAX(run_at) FROM workers_bp_runs) > strftime('%%Y-%%m-%%dT%%H:%%M:%%SZ', 'now', '-26 hours') "
            "THEN CAST((SELECT COUNT(*) FROM workers_bp_findings WHERE worker = %s AND severity = 'fail') AS TEXT) ELSE 'no-run' END AS observed" % q(worker))


def publish(d1, res, total_crons, root=ROOT, sha=None):
    """Write one run to qnfo-audit: replace workers_bp_findings, append workers_bp_runs, refresh the metric, file per-worker debt issues."""
    frows = rows(res)
    fails = [r for r in frows if r[2] == "fail"]
    run_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    d1("DELETE FROM workers_bp_findings")
    for i in range(0, len(frows), 12):
        chunk = frows[i:i + 12]
        sql = "INSERT INTO workers_bp_findings (worker, check_name, severity, file, line, line_text, why, run_at) VALUES " + ", ".join(["(?,?,?,?,?,?,?,?)"] * len(chunk))
        params = []
        for r in chunk: params += [r[0], r[1], r[2], r[3], int(r[4]), r[5], r[6], run_at]
        d1(sql, params)
    d1("INSERT INTO workers_bp_runs (run_at, sha, workers, fail_count, advisory_count, cron_triggers) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
       [run_at, sha or "", len(res), len(fails), len(frows) - len(fails), total_crons])
    d1("UPDATE metric_registry SET last_value = ?1, last_refreshed = ?2, state = 'MEASURED' WHERE metric = ?3", [str(len(fails)), run_at, METRIC])
    d1("UPDATE metric_registry SET last_value = ?1, last_refreshed = ?2, state = 'MEASURED' WHERE metric = 'fleet_cron_triggers'", [str(total_crons), run_at])
    filed = []
    for w in sorted({r[0] for r in fails}):
        title = ISSUE_TITLE % w
        wrows = [r for r in frows if r[0] == w]
        if d1("SELECT id FROM agent_issues WHERE title = ?1 AND status = 'open' LIMIT 1", [title]): continue
        d1("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1, ?2, 'workers-bp-audit', 'security', 'medium', 'open', ?3, ?3)",
           [title, issue_text(w, wrows, root, sha), now_ms()])
        row = d1("SELECT id FROM agent_issues WHERE title = ?1 AND status = 'open' ORDER BY id DESC LIMIT 1", [title])
        if not row: continue
        iid = int(row[0]["id"])
        d1("UPDATE remediation_contracts SET verify_probe = ?1, verify_transport = 'd1-query', status = 'active', issue_id = ?3 WHERE class = ?2", [probe_for(w), "issue-%d" % iid, iid])
        filed.append({"issue": iid, "worker": w, "fails": sum(1 for r in wrows if r[2] == "fail")})
    return {"run_at": run_at, "workers": len(res), "findings": len(frows), "fail": len(fails), "advisory": len(frows) - len(fails), "cron_triggers": total_crons, "filed": filed}


def run_d1(d1=None, root=ROOT):
    """Entry point for the consumer runner: never raises."""
    try:
        if d1 is None:
            sys.path.insert(0, str(root / "scripts"))
            import remediation_consumer as RC  # noqa: E402
            d1 = RC.d1
        res, _fleet, total = scan_all(root)
        out = publish(d1, res, total, root, git_sha(root))
        out["workers_bp_audit"] = "ok"
    except Exception as e:  # noqa: BLE001
        out = {"workers_bp_audit": "failed: " + str(e)[:200]}
    return out


# ---------------------------------------------------------------- report and selftest
def report(res, fleet, total_crons, as_json=False, only=None):
    tally = {}
    for r in res:
        for n, *_ in r.get("config", []) + r.get("code", []):
            if only and n != only: continue
            tally.setdefault(n, set()).add(r["worker"])
    if as_json:
        print(json.dumps({"date": str(TODAY), "workers": len(res), "cron_triggers": total_crons, "findings": res, "fleet": fleet}, indent=1)); return
    frows = rows(res)
    print("workers scanned: %d   findings: %d (fail %d, advisory %d)   cron triggers: %d/%d" % (len(res), len(frows), sum(1 for r in frows if r[2] == "fail"), sum(1 for r in frows if r[2] != "fail"), total_crons, CRON_ACCOUNT_LIMIT))
    for n in sorted(tally, key=lambda k: (SEVERITY.get(k, "advisory") != "fail", -len(tally[k]))):
        print("%-9s %-30s %3d workers  e.g. %s" % (SEVERITY.get(n, "advisory"), n, len(tally[n]), ", ".join(sorted(tally[n])[:4])))


def selftest():
    import sqlite3
    import tempfile
    fails = 0

    def ok(c, m):
        nonlocal fails
        if not c: fails += 1; print("FAIL " + m)
    ok(config_findings('name="w"\ncompatibility_date = "2026-08-01"\n', "") and {n for n, *_ in config_findings('name="w"\ncompatibility_date = "2026-08-01"\n', "")} >= {"observability-missing", "limits-not-declared"}, "a bare config lacks observability and limits")
    f = {n for n, *_ in config_findings('compatibility_date = "2026-09-08"\ncompatibility_flags = ["nodejs_compat"]\n[observability]\nenabled = true\n[observability.traces]\nenabled = true\nhead_sampling_rate = 0.1\n[limits]\ncpu_ms = 1000\n', "")}
    ok("redundant-nodejs-compat" in f and "traces-not-declared" not in f and "limits-not-declared" not in f, "a flag that is the default at the date is redundant; complete observability and limits pass: " + repr(f))
    f = {n for n, *_ in config_findings('compatibility_date = "2026-08-01"\n[observability]\nenabled = true\n', 'import { Buffer } from "node:buffer";\n')}
    ok({"node-imports-without-flag", "traces-not-declared", "sampling-not-explicit"} <= f, "node imports before 2026-08-04 without the flag, traces missing, sampling missing: " + repr(f))
    f = {n for n, *_ in config_findings('compatibility_date = "2026-08-01"\n[[queues.consumers]]\nqueue = "a"\n[[send_email]]\nname = "M"\n[[migrations]]\ntag = "v1"\nnew_classes = ["X"]\n', "")}
    ok({"queue-consumer-no-dlq", "send-email-unrestricted", "legacy-do-storage"} <= f, "consumer without DLQ, unrestricted send_email, legacy DO storage: " + repr(f))
    f = {n for n, *_ in config_findings('compatibility_date = "2026-08-01"\n[[queues.consumers]]\nqueue = "a"\ndead_letter_queue = "a-dlq"\n[[send_email]]\nname = "M"\nallowed_destination_addresses = ["a@b.c"]\n', "")}
    ok(not ({"queue-consumer-no-dlq", "send-email-unrestricted"} & f), "a DLQ and a destination restriction pass: " + repr(f))
    code = ['const id = Math.random().toString(36).slice(2);', 'if (tok === env.LOOP_TOKEN) go();', 'if (env.LOOP_TOKEN === undefined) off();',
            'const r = await env.DB.prepare(`SELECT * FROM t WHERE id = ${id}`).all();', 'await env.DB.prepare("SELECT * FROM t WHERE id = ?1").bind(id).all();',
            'p.catch(function () {});', 'try { x(); } catch (e) {}', 'try { x(); } catch (e) { console.error(JSON.stringify({ evt: "x", error: String(e) })); }',
            'const out = res.response.trim();', 'const o2 = typeof res.response === "string" ? res.response.trim() : "";', 'const body = await request.text();',
            '// const id2 = Math.random().toString(36);', 'const salt2 = Math.random().toString(36).slice(2); // standards-ok: not a secret, display only',
            'const ai = await env.AI.run(M, { messages: m });', 'const ai2 = await env.AI.run(M, { messages: m, max_tokens: 400 });',
            'async email(message, env, ctx) {', '  const a = await new Response(message.raw).arrayBuffer();', '  const b = await new Response(message.raw).text();']
    found = code_findings(code)
    names = sorted((n, ln) for n, ln, *_ in found)
    exp = [("ai-run-no-token-budget", 14), ("interpolated-sql", 4), ("math-random-token", 1), ("message-raw-double-read", 18), ("secret-compare", 2),
           ("swallowed-catch", 6), ("swallowed-catch", 7), ("unbounded-body-buffer", 11), ("ai-response-string-assumption", 9)]
    ok(names == sorted(exp), "code checks hit exactly the planted lines: " + repr(names))
    ok(all(len(x) == 4 and x[3] for x in found if x[0] != "message-raw-double-read"), "each code finding carries its line text (the code-anchor)")
    # D1 half against sqlite
    c = sqlite3.connect(":memory:")
    c.executescript("""
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT, verify_transport TEXT, status TEXT);
CREATE TRIGGER birth AFTER INSERT ON agent_issues BEGIN INSERT INTO remediation_contracts VALUES ('issue-' || NEW.id, NEW.id, 'needs', 'd1-query', 'needs-machine-probe'); END;
CREATE TABLE workers_bp_findings (worker TEXT, check_name TEXT, severity TEXT, file TEXT, line INTEGER, line_text TEXT, why TEXT, run_at TEXT);
CREATE TABLE workers_bp_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_at TEXT, sha TEXT, workers INTEGER, fail_count INTEGER, advisory_count INTEGER, cron_triggers INTEGER);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);
INSERT INTO metric_registry VALUES ('workers_bp_findings_open', NULL, NULL, 'NEW'), ('fleet_cron_triggers', NULL, NULL, 'NEW');
""")

    def d1(sql, params=None):
        cur = c.execute(sql, params or [])
        cols = [d[0] for d in cur.description] if cur.description else []
        return [dict(zip(cols, r)) for r in cur.fetchall()]
    with tempfile.TemporaryDirectory() as t:
        root = pathlib.Path(t)
        (root / "w").mkdir(); (root / "w/wrangler.toml").write_text('name = "w"\ncompatibility_date = "2026-08-01"\n[observability]\nenabled = true\n')
        (root / "w/worker.js").write_text('export default {};\nconst id = Math.random().toString(36).slice(2);\nif (t === env.LOOP_TOKEN) go();\n')
        (root / "clean").mkdir(); (root / "clean/wrangler.toml").write_text('name = "clean"\ncompatibility_date = "2026-08-01"\n[observability]\nenabled = true\nhead_sampling_rate = 1\n[observability.traces]\nenabled = true\nhead_sampling_rate = 0.05\n[triggers]\ncrons = ["0 * * * *", "30 3 * * *"]\n[limits]\ncpu_ms = 1000\n')
        (root / "clean/worker.js").write_text("export default {};\n")
        (root / "dead").mkdir(); (root / "dead/wrangler.toml").write_text("name='dead'\n"); (root / "dead/RETIRED").write_text("x")
        res, fleet, total = scan_all(root)
        ok([r["worker"] for r in res] == ["clean", "w"] and total == 2, "live dirs only, crons counted: " + repr([r["worker"] for r in res]))
        out = publish(d1, res, total, root, "abc1234")
        ok(out["fail"] == 3 and out["filed"] and out["filed"][0]["worker"] == "w", "three fail-class findings on w, one issue filed: " + json.dumps(out))
        desc = d1("SELECT description FROM agent_issues WHERE title = 'WORKERS-BP-DEBT-1: w'")[0]["description"]
        ok("code-task: repo=qnfo-workers path=w/worker.js" in desc and "code-anchor: const id = Math.random().toString(36).slice(2);" in desc, "the issue carries code-task and a unique code-anchor: " + desc[-300:])
        ok("[traces-not-declared] w/wrangler.toml:1" in desc and "[secret-compare] w/worker.js:3" in desc, "the issue lists each fail finding with file:line")
        probe = d1("SELECT verify_probe, status FROM remediation_contracts WHERE class = 'issue-1'")[0]
        ok("workers_bp_findings WHERE worker = 'w' AND severity = 'fail'" in probe["verify_probe"] and probe["status"] == "active", "the probe watches this worker's fail rows: " + repr(probe))
        ok(d1("SELECT last_value FROM metric_registry WHERE metric = 'workers_bp_findings_open'")[0]["last_value"] == "3", "metric written")
        ok(d1("SELECT last_value FROM metric_registry WHERE metric = 'fleet_cron_triggers'")[0]["last_value"] == "2", "cron metric written")
        ok(len(d1("SELECT * FROM workers_bp_findings")) == out["findings"] and len(d1("SELECT * FROM workers_bp_runs")) == 1, "findings replaced and one run row")
        out2 = publish(d1, res, total, root, "abc1234")
        ok(out2["filed"] == [] and len(d1("SELECT * FROM agent_issues")) == 1, "a second run with the same debt files nothing new (dedupe on the open title)")
        obs = d1(probe["verify_probe"])[0]
        ok(obs["expected"] == "0" and obs["observed"] == "3", "the probe reads 3 while the debt stands: " + repr(obs))
        (root / "w/worker.js").write_text("export default {};\n"); (root / "w/wrangler.toml").write_text((root / "clean/wrangler.toml").read_text())
        res, fleet, total = scan_all(root); publish(d1, res, total, root, "abc1235")
        obs = d1(probe["verify_probe"])[0]
        ok(obs["observed"] == "0", "the probe passes once the worker is clean: " + repr(obs))
        ok(run_d1(d1, root).get("workers_bp_audit") == "ok", "run_d1 reports ok")
    print("fleet_best_practices_audit: %s" % ("FAILED %d" % fails if fails else "all passed"))
    return 1 if fails else 0


def main():
    if "--selftest" in sys.argv: sys.exit(selftest())
    if "--d1" in sys.argv:
        print(json.dumps(run_d1())); return
    only = sys.argv[sys.argv.index("--check") + 1] if "--check" in sys.argv else None
    res, fleet, total = scan_all()
    if "--worker" in sys.argv:
        w = sys.argv[sys.argv.index("--worker") + 1]
        res = [r for r in res if r["worker"] == w]
    report(res, fleet, total, as_json="--json" in sys.argv, only=only)


if __name__ == "__main__":
    main()
