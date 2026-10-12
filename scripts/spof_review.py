#!/usr/bin/env python3
"""spof_review.py -- SPOF-REVIEW-GATE-1 (agent_issues 2184, charter pillar: autonomy; doctrine section 12: a new design passes a
single-point-of-failure review before it merges).

WHAT  Reads what a change ADDS and asks one question of each new dependency: what is the second path when this one fails?
      A change raises the question when it adds
        cron        a cron expression to a worker's wrangler.toml `crons = [...]`
        d1-trigger  a CREATE TRIGGER in a migration (one table, one producer: the 2026-10-08 heartbeat mistake, where two
                    cron rows written by one producer were counted as two paths)
        host        a fetch() to a literal https host the worker did not call before (fleet hosts and Cloudflare's API excluded)
        credential  an env.<NAME> secret (TOKEN, SECRET, KEY, PASSWORD, SIGNATURE, HMAC, AUTH) the worker did not read before
      and it answers the question in one of three places:
        1. a migration in the same change that writes a `spof_registry` or `control_registry` row;
        2. a line `spof-review: <the second path, or why none is needed>` in the pull request text ($GITHUB_EVENT_PATH);
        3. the same line in a commit message of the change, or in a changed migration's header.
      An answer shorter than 12 characters, or one that is only "none", "n/a" or "todo", is not an answer.
WHEN  workers_standards_guard.py calls review_change() on every pull request (deploy-gate step WORKERS-STANDARDS-GUARD-1), so the
      gate needs no workflow change. It fails pull requests opened on or after ENFORCE_FROM; an older open pull request, a push
      to main and a run with no event get the same findings as an advisory (a gate may not fail work that was green when it landed).
      `SPOF_REVIEW=off` in the environment skips it; `SPOF_REVIEW=enforce` fails regardless of the date.
USAGE python3 scripts/spof_review.py [BASE] [--enforce]      python3 scripts/spof_review.py --selftest
      Exit 0 clean or advisory, 1 an unanswered finding under enforcement, 2 usage/IO error.
"""
import json, os, re, subprocess, sys

ENFORCE_FROM = "2026-10-13T00:00:00Z"
SECRET = r"(?:TOKEN|SECRET|KEY|PASSWORD|SIGNATURE|HMAC|AUTH)"
ENV_SECRET = re.compile(r"\b(?:env|this\.env)\.([A-Z][A-Z0-9_]*" + SECRET + r"[A-Z0-9_]*)\b")
FETCH_HOST = re.compile(r"\bfetch\s*\(\s*[\"'`]https://([a-z0-9.-]+\.[a-z]{2,})", re.I)
# Hosts that are the fleet itself or Cloudflare's control plane: a second path to those is the platform's, not a design choice.
OWN_HOSTS = re.compile(r"(?:^|\.)(?:qnfo\.org|qwav\.org|q08\.org|q08\.workers\.dev|workers\.dev|cloudflare\.com|cloudflare-dns\.com|example\.(?:com|org)|example)$", re.I)
CRON = re.compile(r"[\"']((?:[\d*/,\-A-Za-z?#]+[ \t]+){4}[\d*/,\-A-Za-z?#]+)[\"']")
TRIGGER = re.compile(r"\bCREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"`]?([A-Za-z_][\w]*)[\"`]?[\s\S]{0,200}?\bON\s+[\"`]?([A-Za-z_][\w]*)", re.I)
TRIGGER_LINE = re.compile(r"\bCREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"`]?([A-Za-z_][\w]*)", re.I)
REGISTRY_WRITE = re.compile(r"\b(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|REPLACE\s+INTO)\s+[\"`]?(spof_registry|control_registry)\b", re.I)
ANSWER = re.compile(r"^[ \t>*-]*(?:--[ \t]*)?spof-review[ \t]*:[ \t]*(.+?)[ \t]*$", re.I | re.M)
EMPTY_ANSWER = re.compile(r"^(?:none|n/?a|todo|tbd|no|-+|\.+)\.?$", re.I)


def answers(text):
    """The usable `spof-review:` answers in a text."""
    return [a for a in ANSWER.findall(str(text or "")) if len(a.strip()) >= 12 and not EMPTY_ANSWER.match(a.strip())]


def review(files, texts=()):
    """files: [{"path", "added": [str], "base": str}] (base = the file's text before the change, "" when new).
    texts: the pull request body and commit messages. Returns {"findings": [(kind, path, what)], "answered_by": str or None}."""
    findings, answered = [], None
    for f in files:
        path, added, base = f["path"], f.get("added") or [], f.get("base") or ""
        blob = "\n".join(added)
        if re.fullmatch(r"[^/]+/wrangler\.(?:toml|jsonc)", path):
            old = set(CRON.findall(base))
            for line in added:
                if line.strip().startswith("#") or not re.search(r"\bcrons\b|^\s*[\"']", line):
                    continue
                for c in CRON.findall(line):
                    if c not in old and ("cron", path, c) not in findings:
                        findings.append(("cron", path, c))
        elif re.fullmatch(r"migrations/[^/]+\.sql", path):
            if REGISTRY_WRITE.search(blob):
                answered = answered or ("a %s row in %s" % (REGISTRY_WRITE.search(blob).group(1), path))
            if answers("\n".join(l for l in added if l.lstrip().startswith("--"))):
                answered = answered or ("the spof-review line in " + path)
            code = "\n".join(l for l in added if not l.lstrip().startswith("--"))
            on = {m.group(1): m.group(2) for m in TRIGGER.finditer(code)}
            for name in TRIGGER_LINE.findall(code):
                if not re.search(r"\bCREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"`]?" + re.escape(name) + r"\b", base, re.I):
                    what = name + (" on " + on[name] if name in on else "")
                    if ("d1-trigger", path, what) not in findings:
                        findings.append(("d1-trigger", path, what))
        elif re.fullmatch(r"[^/]+/worker\.js", path):
            old_hosts = set(h.lower() for h in re.findall(r"https://([a-z0-9.-]+\.[a-z]{2,})", base, re.I))
            old_env = set(ENV_SECRET.findall(base))
            for line in added:
                if line.strip().startswith("//"):
                    continue
                for h in FETCH_HOST.findall(line):
                    h = h.lower()
                    if h not in old_hosts and not OWN_HOSTS.search(h) and ("host", path, h) not in findings:
                        findings.append(("host", path, h))
                for name in ENV_SECRET.findall(line):
                    if base and name not in old_env and ("credential", path, name) not in findings:
                        findings.append(("credential", path, name))
    if not answered:
        for label, t in texts:
            if answers(t):
                answered = "the spof-review line in " + label
                break
    return {"findings": findings, "answered_by": answered}


def git(*a):
    r = subprocess.run(["git", *a], capture_output=True, text=True)
    if r.returncode not in (0, 1):
        raise RuntimeError("git %s: %s" % (" ".join(a), r.stderr.strip()[:200]))
    return r.stdout


def collect(base):
    """The change between base and the working tree as review() input."""
    files = []
    for n in [x for x in git("diff", "--name-only", base).split("\n") if x]:
        if not re.fullmatch(r"[^/]+/(?:worker\.js|wrangler\.(?:toml|jsonc))|migrations/[^/]+\.sql", n) or not os.path.exists(n):
            continue
        d = n.split("/")[0]
        if os.path.exists(os.path.join(d, "RETIRED")) or os.path.exists(os.path.join(d, "FOLDED")):
            continue
        added = [row[1:] for row in git("diff", "-U0", base, "--", n).split("\n") if row.startswith("+") and not row.startswith("+++")]
        try:
            old = git("show", base + ":" + n)
        except RuntimeError:
            old = ""
        files.append({"path": n, "added": added, "base": old})
    return files


def event():
    """(pull request body, created_at) from the Actions event, or ("", None)."""
    try:
        with open(os.environ.get("GITHUB_EVENT_PATH") or "", encoding="utf-8") as fh:
            pr = (json.load(fh) or {}).get("pull_request") or {}
        return str(pr.get("body") or ""), pr.get("created_at")
    except (OSError, ValueError):
        return "", None


def review_change(base, enforce=None, out=print):
    """Runs the review on the change against base. Returns 0 (clean, answered or advisory) or 1 (unanswered under enforcement)."""
    mode = (os.environ.get("SPOF_REVIEW") or "").lower()
    if mode == "off":
        out("SPOF-REVIEW-GATE-1: skipped (SPOF_REVIEW=off)")
        return 0
    body, created = event()
    try:
        commits = git("log", "--format=%B", base + "..HEAD")
    except RuntimeError:
        commits = ""
    res = review(collect(base), [("the pull request text", body), ("a commit message", commits)])
    if not res["findings"]:
        out("SPOF-REVIEW-GATE-1: ok (the change adds no cron, D1 trigger, external host or credential)")
        return 0
    lines = ["  [%s] %s: %s" % f for f in res["findings"]]
    if res["answered_by"]:
        out("SPOF-REVIEW-GATE-1: ok, %d new dependenc%s reviewed by %s:" % (len(lines), "y" if len(lines) == 1 else "ies", res["answered_by"]))
        for l in lines:
            out(l)
        return 0
    if enforce is None:
        enforce = mode == "enforce" or bool(created and str(created) >= ENFORCE_FROM)
    out("SPOF-REVIEW-GATE-1: %d new dependenc%s with no single-point-of-failure review%s:" % (len(lines), "y" if len(lines) == 1 else "ies", "" if enforce else " (advisory: this change predates the gate or is not a pull request)"))
    for l in lines:
        out(l)
    out("Name the second path: add a spof_registry or control_registry row in a migration of this change, or a line "
        "`spof-review: <second path, or why none is needed>` to the pull request text.")
    return 1 if enforce else 0


def selftest():
    fails = []

    def ok(c, name, detail=None):
        print(("PASS " if c else "FAIL ") + name + ("" if c or detail is None else " -- " + repr(detail)[:400]))
        if not c:
            fails.append(name)
    # The 2026-10-08 heartbeat mistake: a second cron and a trigger on the one heartbeat table, written by one producer, counted as two paths.
    heartbeat = [
        {"path": "qnfo-fleet-control/wrangler.toml", "base": 'crons = ["*/20 * * * *", "0 * * * *"]\n', "added": ['crons = ["*/20 * * * *", "0 * * * *", "*/10 * * * *"]']},
        {"path": "migrations/2026-10-08-heartbeat.sql", "base": "", "added": ["-- APPLY-BY: ci", "CREATE TRIGGER IF NOT EXISTS queue_sla_tick_10m AFTER INSERT ON fleet_tick", "BEGIN", "  INSERT INTO queue_sla_actions (kind) VALUES ('tick');", "END;"]},
    ]
    r = review(heartbeat)
    ok(("cron", "qnfo-fleet-control/wrangler.toml", "*/10 * * * *") in r["findings"] and ("d1-trigger", "migrations/2026-10-08-heartbeat.sql", "queue_sla_tick_10m on fleet_tick") in r["findings"] and len(r["findings"]) == 2 and r["answered_by"] is None,
       "the heartbeat case: a new cron and a trigger on one table are flagged, unanswered", r)
    r2 = review(heartbeat, [("the pull request text", "Pillar: autonomy.\nspof-review: the GitHub runner dispatches the same tick when fleet_tick is silent for 30 minutes (PROBE-CADENCE-1)\n")])
    ok(r2["answered_by"] == "the spof-review line in the pull request text", "a spof-review line in the pull request text answers it", r2)
    for weak in ["spof-review: none", "spof-review: n/a", "spof-review: todo", "spof-review:", "we did a spof-review: yes"]:
        ok(review(heartbeat, [("the pull request text", weak)])["answered_by"] is None, "not an answer: " + weak)
    withrow = heartbeat + [{"path": "migrations/2026-10-08-spof.sql", "base": "", "added": ["INSERT OR REPLACE INTO spof_registry (component, critical_path, alternate_path, evidence) VALUES ('fleet heartbeat', 'cron', 'runner dispatch', 'x');"]}]
    ok(review(withrow)["answered_by"] == "a spof_registry row in migrations/2026-10-08-spof.sql", "a spof_registry row in the same change answers it")
    ctl = heartbeat + [{"path": "migrations/x.sql", "base": "", "added": ["UPDATE control_registry SET alternate_path = 'y' WHERE control = 'z';"]}]
    ok("control_registry" in str(review(ctl)["answered_by"]), "a control_registry write answers it")
    ok(review(heartbeat + [{"path": "migrations/y.sql", "base": "", "added": ["-- spof-review: one producer by design; LOOP-WATCH-1 files the stale tick within the hour", "SELECT 1;"]}])["answered_by"] == "the spof-review line in migrations/y.sql", "a spof-review header line in a migration answers it")
    w = review([{"path": "w/worker.js", "base": 'await fetch("https://api.old.example.net/x", { headers: { a: env.OLD_TOKEN } });\n',
                 "added": ['  const r = await fetch("https://api.newvendor.io/v1/send", { headers: { authorization: "Bearer " + env.NEWVENDOR_API_KEY } });',
                           '  await fetch("https://api.old.example.net/y");', '  if (!env.OLD_TOKEN) return;', '  // fetch("https://commented.example.io/")',
                           '  await fetch("https://qnfo-ai.q08.workers.dev/health");', '  await fetch("https://api.cloudflare.com/client/v4/x");', '  const mode = env.MODE;']}])
    ok(w["findings"] == [("host", "w/worker.js", "api.newvendor.io"), ("credential", "w/worker.js", "NEWVENDOR_API_KEY")], "a new external host and a new credential are flagged; known hosts, fleet hosts, comments and plain vars are not", w)
    ok(review([{"path": "n/worker.js", "base": "", "added": ["const k = env.FIRST_KEY;"]}])["findings"] == [], "a brand-new worker's first credentials are its design, reviewed with the worker (charter-guard), not flagged one by one")
    ok(review([{"path": "w/wrangler.toml", "base": 'crons = ["0 * * * *"]\n', "added": ['crons = ["0 * * * *"]', 'name = "w"', '# crons = ["*/5 * * * *"]']}])["findings"] == [], "an unchanged cron and a commented cron are not findings")
    ok(review([{"path": "migrations/z.sql", "base": "", "added": ["-- CREATE TRIGGER old_one AFTER INSERT ON t", "DROP TRIGGER IF EXISTS old_one;"]}])["findings"] == [], "a trigger named only in a comment or dropped is not a finding")
    ok(review([{"path": "docs/x.md", "base": "", "added": ['fetch("https://api.newvendor.io")']}, {"path": "scripts/a.py", "base": "", "added": ["CREATE TRIGGER t ON x"]}])["findings"] == [], "only workers, their configs and migrations are read")
    ok(answers("- spof-review: second executor is the code loop\n> spof-review: tbd\n") == ["second executor is the code loop"], "answers(): list and quote prefixes accepted, placeholders dropped")
    print("spof_review selftest: " + ("ok" if not fails else "%d FAILED" % len(fails)))
    return 1 if fails else 0


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if "--selftest" in argv:
        return selftest()
    enforce = True if "--enforce" in argv else None
    pos = [a for a in argv if not a.startswith("--")]
    base = pos[0] if pos else os.environ.get("GUARD_BASE", "origin/main")
    try:
        mb = git("merge-base", base, "HEAD").strip()
        return review_change(mb or base, enforce)
    except (RuntimeError, OSError) as e:
        print("SPOF-REVIEW-GATE-1: cannot read the diff (%s)" % e)
        return 2


if __name__ == "__main__":
    sys.exit(main())
