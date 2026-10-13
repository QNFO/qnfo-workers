#!/usr/bin/env python3
"""workers_standards_guard.py -- WORKERS-STANDARDS-GUARD-1 (charter pillar: autonomy). Standing, diff-only enforcement of the Cloudflare Workers
best practices that can be detected statically (see scripts/fleet_best_practices_audit.py for the whole-tree report).

It fails a change only for what the change ADDS, so existing debt that other sessions are fixing never blocks unrelated work:
  * a worker.js line that adds one of the high-confidence anti-patterns:
      math-random-token          Math.random() building an id or token (toString(36)/slice, or assigned to an id/token/nonce/key name)
      pass-through-on-exception  a call of passThroughOnException (the no-op member of a stub ctx handed to a folded module,
                                 `passThroughOnException: function () {}`, is not a call and passes)
      destructured-ctx           waitUntil/passThroughOnException destructured from ctx, in a declaration or a handler signature
      secret-compare             ==, ===, != or !== against env.<NAME with TOKEN|SECRET|KEY|PASSWORD|SIGNATURE|HMAC|AUTH>
                                 (a presence test against undefined, null or "" passes)
      floating-promise           a whole statement that starts a promise and drops it: fetch(...), env.<BINDING>.<io call>(...),
                                 caches.default.put/delete(...), with no await, return, assignment, void or ctx.waitUntil (WORKERS-STANDARDS-GUARD-2)
      interpolated-sql           a template literal with ${} inside prepare(`...`): bind the value instead (WORKERS-STANDARDS-GUARD-3)
      swallowed-catch            an empty catch block or .catch(function () {}) / .catch(() => {}): the failure never reaches Workers Logs
                                 (WORKERS-BP-LOGGING-1); log it or record it, or mark the line standards-ok with the reason
      ai-response-string-assumption  `.response.trim()` and friends on a Workers AI result: in JSON mode `response` is a parsed object
  * (WRITE-SUCCESS-CODES-1) a worker.js or scripts/*.py line that accepts only HTTP 200 (`== 200`, `!= 200`, `=== 200`, `!== 200`)
    within 8 lines after a POST/PUT/PATCH: a write's success is any 2xx (Cloudflare answers 201 when a Worker secret is created, and
    run 38258885817 reported a completed secret write as a failure, filed as ci-watchdog #1033). Use `200 <= (st or 0) < 300` / `r.ok`;
  * a wrangler.toml change that removes an [observability] block or its traces, switches logs or traces off, edits the block and leaves it
    without logs and traces, or a brand-new worker (new wrangler.toml) without logs and traces enabled;
  * a wrangler.toml change that adds a [[queues.consumers]] block without dead_letter_queue (a failed message is otherwise discarded);
  * (GUARD-3) a wrangler.toml change that adds a [[send_email]] block with no destination_address / allowed_destination_addresses /
    allowed_sender_addresses, adds `new_classes` (KV-backed Durable Object storage; new classes use new_sqlite_classes), or moves
    compatibility_date to 2026-08-04 or later while worker.js imports node:* under a `no_nodejs_compat` opt-out (the import then fails).
A line can carry `// standards-ok: <reason>` when a hit is a false positive (the reason is the record). A reviewed exception that cannot carry
a comment (toml, generated code) is a line in scripts/workers-standards-allowlist.txt: `<path> <rule> <text that occurs in the line> # reason`.
The same run asks SPOF-REVIEW-GATE-1 (scripts/spof_review.py) whether the change adds a cron, D1 trigger, external host or credential
without naming its second path.
Usage: python3 scripts/workers_standards_guard.py [BASE]     BASE defaults to $GUARD_BASE, then origin/main; on a push to main use HEAD~1.
Exit 0 clean, 1 a violation, 2 usage/IO error (fail closed)."""
import os, re, subprocess, sys

SECRET = r"(?:TOKEN|SECRET|KEY|PASSWORD|SIGNATURE|HMAC|AUTH)"
ENV_SECRET = r"(?:env|this\.env)\.[A-Z0-9_]*" + SECRET + r"[A-Z0-9_]*\b"
EQ = r"(?:===|!==|==|!=)"
ID_NAME = r"(?:[A-Za-z0-9_$]*(?:Id|ID|_id|Token|_token|TOKEN|Nonce|_nonce|Secret|_secret|Salt|_salt|Otp|_otp|Key|_key|Uuid|UUID|_uuid)|id|token|nonce|secret|salt|otp|key|uuid)"
RULES = {
    "math-random-token": (re.compile(r"Math\.random\(\)[^;\n]{0,80}(?:toString\(36\)|toString\(16\)|slice|substr)|(?<![A-Za-z0-9_$.])" + ID_NAME + r"\s*[:=](?!=)[^;\n=]{0,80}Math\.random\("), "Math.random builds an id or token: use crypto.randomUUID()/getRandomValues"),
    "pass-through-on-exception": (re.compile(r"\.passThroughOnException\s*\("), "passThroughOnException hides failures: use try/catch and an explicit error response"),
    "destructured-ctx": (re.compile(r"(?:const|let|var)\s*\{[^}]*\b(?:waitUntil|passThroughOnException)\b[^}]*\}\s*=\s*(?:ctx|context|this\.ctx)\b|\b(?:fetch|scheduled|queue|email|tail)\s*\([^)]*\{[^}]*\b(?:waitUntil|passThroughOnException)\b[^}:]*\}\s*\)\s*\{"), "destructuring ctx loses the receiver (Illegal invocation)"),
    "secret-compare": (re.compile(EQ + r"\s*" + ENV_SECRET + "|" + ENV_SECRET + r"\s*" + EQ), "string comparison of a secret: use a constant-time compare"),
    # WORKERS-STANDARDS-GUARD-3 (2026-10-12): D1 limits page (100 bound parameters, prepared statements), WORKERS-BP-LOGGING-1 (agent_issues 2342),
    # Workers AI JSON mode (`response` is an object).
    "interpolated-sql": (re.compile(r"prepare\s*\(\s*`[^`]*\$\{"), "SQL built by interpolation: bind the value with prepare(...).bind(...)"),
    "swallowed-catch": (re.compile(r"\.catch\s*\(\s*(?:function\s*\([^)]*\)\s*\{\s*\}|\([^)]*\)\s*=>\s*\{\s*\}|[A-Za-z_$][\w$]*\s*=>\s*\{\s*\})\s*\)|\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}"), "a swallowed error never reaches Workers Logs: log console.error(JSON.stringify({...})) or record the failure"),
    "ai-response-string-assumption": (re.compile(r"\b(?:res|resp|result|out|output|ai\w*|r)\.response\.(?:trim|match|replace|split|toLowerCase|slice)\("), "Workers AI `response` is a parsed object in JSON mode: normalise (typeof check) before string methods"),
}
NODE_IMPORT = re.compile(r"(?:^|\n)\s*import\s[^\n]*\sfrom\s*[\"']node:|require\(\s*[\"']node:")
NODE_DEFAULT_DATE = "2026-08-04"
# A presence test is not a comparison of the secret's value.
PRESENCE = re.compile(ENV_SECRET + r"\s*" + EQ + r"\s*(?:undefined|null|\"\"|''|void 0)|(?:undefined|null|\"\"|''|void 0|typeof\s+" + ENV_SECRET + r")\s*" + EQ + r"\s*(?:" + ENV_SECRET + r"|[\"']undefined[\"'])")
# floating-promise: the statement, from its first character, is a call that returns a promise, and it ends the line with `;`.
IO_CALL = r"(?:prepare\s*\(.*\)\s*\.\s*(?:bind\s*\(.*\)\s*\.\s*)?(?:run|all|first|raw)|batch|exec|put|delete|send|sendBatch|fetch|writeDataPoint_async|upsert|insert|create|createBatch)"
FLOATING = re.compile(r"^\s*(?:(?:globalThis\.)?fetch\s*\(|(?:env|this\.env)\.[A-Za-z_]\w*\s*\.\s*" + IO_CALL + r"\s*\(|caches\.default\.(?:put|delete)\s*\().*\)\s*;\s*(?://.*)?$")
# The previous line leaves an expression open (an await, a waitUntil( argument, an assignment, an arrow body...): the call is consumed there.
OPEN_PREV = re.compile(r"(?:[(\[,=?:&|+]|=>|\bawait|\breturn|\bvoid|\byield)\s*$")
# WRITE-SUCCESS-CODES-1: a status check that accepts only 200, and the write call it judges (looked for in the 8 lines above).
ONLY_200 = re.compile(r"\b[\w.]+\s*(?:===|!==|==|!=)\s*200\b|\b200\s*(?:===|!==|==|!=)\s*[\w.]+")
WRITE_CALL = re.compile(r"[\"'](?:PUT|POST|PATCH)[\"']")
def write_200_only(lines, full):
    """(rule, line, why, text) for each added line that accepts only HTTP 200 shortly after a write call."""
    bad = []
    for ln, text in lines:
        s = text.strip()
        if s.startswith(("//", "#", "*")) or "standards-ok:" in text or not ONLY_200.search(text): continue
        above = "\n".join(full[max(0, ln - 9):ln]) if full else text
        if WRITE_CALL.search(above):
            bad.append(("write-200-only", ln, "a write succeeded with any 2xx (201 Created, 204 No Content): accept 200 <= status < 300 or r.ok, not only 200", text))
    return bad

ALLOWLIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "workers-standards-allowlist.txt")

def git(*a):
    r = subprocess.run(["git", *a], capture_output=True, text=True)
    if r.returncode not in (0, 1): raise RuntimeError("git %s: %s" % (" ".join(a), r.stderr.strip()[:200]))
    return r.stdout

def load_allowlist(path=ALLOWLIST):
    """[(path, rule, needle)] from `<path> <rule> <needle> # reason`; a line without a reason is ignored (the reason is the record)."""
    out = []
    try: rows = open(path, encoding="utf-8", errors="replace").read().split("\n")
    except OSError: return out
    for row in rows:
        row = row.strip()
        if not row or row.startswith("#") or " # " not in row: continue
        body, reason = row.rsplit(" # ", 1)
        parts = body.strip().split(None, 2)
        if len(parts) == 3 and reason.strip(): out.append((parts[0], parts[1], parts[2].strip()))
    return out

def allowed(allow, path, rule, text):
    return any(p == path and r in (rule, "*") and needle in text for p, r, needle in allow)

def added_lines(base, path):
    """(lineno, text) of lines the change adds to path."""
    out, ln = [], 0
    for row in git("diff", "-U0", base, "--", path).split("\n"):
        m = re.match(r"@@ -\d+(?:,\d+)? \+(\d+)", row)
        if m: ln = int(m.group(1)); continue
        if row.startswith("+") and not row.startswith("+++"):
            out.append((ln, row[1:])); ln += 1
    return out

def check_code(lines, full=None):
    """lines: [(lineno, text)] added by the change; full: the whole file's lines (for the line before a floating-promise candidate)."""
    bad = []
    for ln, text in lines:
        s = text.strip()
        if s.startswith("//") or s.startswith("*") or "standards-ok:" in text: continue
        for name, (rx, why) in RULES.items():
            if name == "ai-response-string-assumption" and "typeof" in text: continue  # guarded on the same line
            probe = PRESENCE.sub(" ", text) if name == "secret-compare" else text
            if rx.search(probe): bad.append((name, ln, why, text))
        if FLOATING.match(text):
            prev = ""
            if full:
                i = ln - 2
                while i >= 0 and not full[i].strip(): i -= 1
                prev = full[i] if i >= 0 else ""
            if not OPEN_PREV.search(re.sub(r"\s//(?!/).*$", "", prev).rstrip()):
                bad.append(("floating-promise", ln, "a promise is started and dropped: await it, return it or pass it to ctx.waitUntil()", text))
    return bad

def strip_comments(cfg): return "\n".join(l for l in cfg.split("\n") if not l.strip().startswith("#"))

def table(cfg, name):
    """The body of a toml table `[name]` (to the next table header), or None when absent. Comment lines are ignored."""
    m = re.search(r"^[ \t]*\[" + re.escape(name) + r"\][ \t]*(?:#.*)?$", strip_comments(cfg), re.M)
    if not m: return None
    rest = strip_comments(cfg)[m.end():]
    n = re.search(r"^[ \t]*\[", rest, re.M)
    return rest[:n.start()] if n else rest

def flag(body, key):
    """True/False for `key = true|false` in a table body, None when the key is absent."""
    m = re.search(r"^[ \t]*" + re.escape(key) + r"[ \t]*=[ \t]*(true|false)\b", body or "", re.M)
    return None if not m else m.group(1) == "true"

def has_obs(cfg): return table(cfg, "observability") is not None or '"observability"' in cfg
def has_traces(cfg): return table(cfg, "observability.traces") is not None or bool(re.search(r'"traces"\s*:', cfg))

def obs_state(cfg):
    """(logs_on, traces_on) of a wrangler.toml. Logs are on when [observability] or [observability.logs] says enabled = true and
    [observability.logs] does not say false; traces need [observability.traces] enabled = true (the top-level switch alone does not
    enable traces). A jsonc config is read by key presence only."""
    if cfg.lstrip().startswith("{"):
        return ('"observability"' in cfg, bool(re.search(r'"traces"\s*:', cfg)))
    top, logs, traces = table(cfg, "observability"), table(cfg, "observability.logs"), table(cfg, "observability.traces")
    logs_on = (flag(top, "enabled") is True or flag(logs, "enabled") is True) and flag(logs, "enabled") is not False
    return logs_on, flag(traces, "enabled") is True

def consumers(cfg):
    """{queue name: has dead_letter_queue} for every [[queues.consumers]] block of a wrangler.toml."""
    out = {}
    text = strip_comments(cfg)
    for m in re.finditer(r"^[ \t]*\[\[queues\.consumers\]\][ \t]*$", text, re.M):
        rest = text[m.end():]
        n = re.search(r"^[ \t]*\[", rest, re.M)
        body = rest[:n.start()] if n else rest
        q = re.search(r"^[ \t]*queue[ \t]*=[ \t]*[\"']([^\"']+)[\"']", body, re.M)
        out[q.group(1) if q else "?"] = bool(re.search(r"^[ \t]*dead_letter_queue[ \t]*=[ \t]*[\"'][^\"']+[\"']", body, re.M))
    return out

def check_config(base, path, added=None):
    bad = []
    new = open(path, errors="replace").read() if os.path.exists(path) else ""
    try: old = git("show", base + ":" + path)
    except RuntimeError: old = ""
    if not new: return bad
    if old and has_obs(old) and not has_obs(new): bad.append(("observability-removed", 1, "the change removes the [observability] block", "[observability]"))
    if old and has_traces(old) and not has_traces(new): bad.append(("traces-removed", 1, "the change removes observability.traces", "[observability.traces]"))
    logs_on, traces_on = obs_state(new)
    if not old and not (has_obs(new) and has_traces(new)): bad.append(("new-worker-observability", 1, "a new worker declares [observability] with traces and an explicit head_sampling_rate", "[observability]"))
    elif not old and not (logs_on and traces_on):
        bad.append(("new-worker-observability", 1, "a new worker enables logs ([observability] enabled = true) and traces ([observability.traces] enabled = true)", "[observability]"))
    elif old:
        was_logs, was_traces = obs_state(old)
        if (was_logs and not logs_on) or (was_traces and not traces_on):
            bad.append(("observability-disabled", 1, "the change switches %s off" % ("logs" if was_logs and not logs_on else "traces"), "[observability]"))
        elif not (logs_on and traces_on) and added is not None and has_obs(new):
            # changed-lines mode: only a change that edits the observability tables has to leave them complete
            spans, cur, raw = set(), None, new.split("\n")
            for i, l in enumerate(raw, 1):
                h = re.match(r"^[ \t]*\[+([^\]]+)\]+", l)
                if h: cur = h.group(1).strip()
                if cur and cur.startswith("observability"): spans.add(i)
            if any(ln in spans for ln, _ in added):
                bad.append(("observability-incomplete", 1, "the change edits [observability] and leaves it without %s" % ("logs" if not logs_on else "traces ([observability.traces] enabled = true)"), "[observability]"))
    was = consumers(old) if old else {}
    for q, dlq in sorted(consumers(new).items()):
        if not dlq and was.get(q) is not False:
            bad.append(("queue-consumer-no-dlq", 1, "queue consumer `%s` has no dead_letter_queue: a message that fails max_retries times is discarded" % q, 'queue = "%s"' % q))
    # WORKERS-STANDARDS-GUARD-3: config shapes judged on what the change adds.
    if len(unrestricted_send_email(new)) > len(unrestricted_send_email(old)):
        bad.append(("send-email-unrestricted", 1, "a new [[send_email]] binding names no destination_address, allowed_destination_addresses or allowed_sender_addresses", "[[send_email]]"))
    if re.search(r"^\s*new_classes\s*=", strip_comments(new), re.M) and not re.search(r"^\s*new_classes\s*=", strip_comments(old or ""), re.M):
        bad.append(("legacy-do-storage", 1, "new_classes declares KV-backed Durable Object storage: new classes use new_sqlite_classes", "new_classes"))
    nd = toml_value(new, "compatibility_date"); od = toml_value(old or "", "compatibility_date")
    if nd and nd >= NODE_DEFAULT_DATE and (not od or od < NODE_DEFAULT_DATE):
        flags = toml_flags(new)
        src_path = os.path.join(os.path.dirname(path), "worker.js")
        src = open(src_path, errors="replace").read() if os.path.exists(src_path) else ""
        if "no_nodejs_compat" in flags and NODE_IMPORT.search(src):
            bad.append(("node-opt-out-with-imports", 1, "compatibility_date %s with no_nodejs_compat while worker.js imports node:* (the import fails at that date)" % nd, "compatibility_date"))
    return bad

def toml_value(cfg, key):
    m = re.search(r"^\s*" + re.escape(key) + r"\s*=\s*\"([^\"]*)\"", strip_comments(cfg or ""), re.M)
    return m.group(1) if m else None

def toml_flags(cfg):
    m = re.search(r"^\s*compatibility_flags\s*=\s*\[([^\]]*)\]", strip_comments(cfg or ""), re.M)
    return re.findall(r"[\"']([^\"']+)[\"']", m.group(1)) if m else []

def unrestricted_send_email(cfg):
    """Bodies of the [[send_email]] blocks of a wrangler.toml that set no destination or sender restriction."""
    text, out = strip_comments(cfg or ""), []
    for m in re.finditer(r"^[ \t]*\[\[send_email\]\][ \t]*$", text, re.M):
        rest = text[m.end():]
        n = re.search(r"^[ \t]*\[", rest, re.M)
        body = rest[:n.start()] if n else rest
        if not re.search(r"^[ \t]*(?:destination_address|allowed_destination_addresses|allowed_sender_addresses)[ \t]*=", body, re.M): out.append(body)
    return out

def spof_gate(base):
    """SPOF-REVIEW-GATE-1 rides this step so it runs on every pull request without a workflow change (scripts/spof_review.py).
    It returns 1 only for an unanswered finding on a pull request opened after the gate landed; a fault inside it never fails the change."""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import spof_review
        return 1 if spof_review.review_change(base) == 1 else 0
    except Exception as e:  # noqa: BLE001  (a second gate must not become a single point of failure for the first)
        print("SPOF-REVIEW-GATE-1: not run (%s: %s)" % (type(e).__name__, str(e)[:160])); return 0

def main():
    base = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("GUARD_BASE", "origin/main")
    try:
        # MERGE-BASE-1: diff against the point the change branched from, not the moving tip of the base branch. After main advances,
        # `git diff origin/main` shows main's newer commits in reverse and blames this change for them (PR 980: nine false violations).
        mb = git("merge-base", base, "HEAD").strip()
        if mb: base = mb
        else: print("WORKERS-STANDARDS-GUARD-1: note: no merge base with %s (shallow history); diffing against its tip, which is exact only when HEAD is the merge of the change into it" % base)
        names = [n for n in git("diff", "--name-only", base).split("\n") if n]
        allow = load_allowlist()
        viol = []
        for n in names:
            d = n.split("/")[0]
            if os.path.exists(os.path.join(d, "RETIRED")) or os.path.exists(os.path.join(d, "FOLDED")): continue
            if re.fullmatch(r"[^/]+/worker\.js", n) and os.path.exists(n):
                full = open(n, encoding="utf-8", errors="replace").read().split("\n")
                added = added_lines(base, n)
                viol += [(n, *v) for v in check_code(added, full)]
                viol += [(n, *v) for v in write_200_only(added, full)]
            elif re.fullmatch(r"scripts/[^/]+\.py", n) and os.path.exists(n) and not re.search(r"(_test|\.test)\.py$", n):
                full = open(n, encoding="utf-8", errors="replace").read().split("\n")
                viol += [(n, *v) for v in write_200_only(added_lines(base, n), full)]
            elif re.fullmatch(r"[^/]+/wrangler\.(toml|jsonc)", n):
                viol += [(n, *v) for v in check_config(base, n, added_lines(base, n))]
        viol = [v for v in viol if not allowed(allow, v[0], v[1], v[4])]
    except (RuntimeError, OSError) as e:
        print("WORKERS-STANDARDS-GUARD-1: cannot read the diff (%s); failing closed" % e); return 2
    spof = spof_gate(base)
    if not viol:
        print("WORKERS-STANDARDS-GUARD-1: ok (%d changed files checked against %s)" % (len(names), base)); return spof
    print("WORKERS-STANDARDS-GUARD-1: %d violation(s) added by this change:" % len(viol))
    for f, name, ln, why, _ in viol: print("  %s:%d [%s] %s" % (f, ln, name, why))
    print("Fix it, mark a false positive with `// standards-ok: <reason>` (`# standards-ok: <reason>` in Python) on the line, or record a reviewed exception in scripts/workers-standards-allowlist.txt.")
    return 1

if __name__ == "__main__":
    sys.exit(main())
