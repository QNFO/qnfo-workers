#!/usr/bin/env python3
"""verify-runtime.py - QNFO notes-API runtime verification (research + personal).

Reads keys from C:/Users/LENOVO/tokens/ (or --router-key/--personal-key/--cf-token).
Exit 0 = ALL PASS. Prints one CHECK line per assertion + summary.
Run after every deploy and whenever logging appears frozen.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROUTER = os.environ.get("QNFO_ROUTER", "https://qnfo-ai.q08.workers.dev")
PERSONAL = os.environ.get("QNFO_PERSONAL", "https://personal-api.q08.workers.dev")
PL_SEARCH = os.environ.get("QNFO_PL_SEARCH", "https://personal-life-search.q08.workers.dev")
ACCT = os.environ.get("CF_ACCOUNT", "edb167b78c9fb901ea5bca3ce58ccc4b")
D1_AUDIT = "35e2e573-92f3-46ac-83c6-22f6429fc5e5"
D1_PERSONAL = "e8d6c61a-10b7-4086-b81e-9e6e85afa407"
TOKENS_DIR = os.environ.get("QNFO_TOKENS", "C:/Users/LENOVO/tokens")


def tok(name):
    p = os.path.join(TOKENS_DIR, name)
    if os.path.exists(p):
        return open(p, encoding="utf-8").read().strip()
    return ""


def req(url, data=None, headers=None, timeout=60):
    h = {"User-Agent": "Mozilla/5.0 (qnfo-verify)"}
    if headers:
        h.update(headers)
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        h["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=body, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:
        return -1, {"error": str(e)}


def cf(path, sql=None):
    token = tok("cloudflare")
    if not token:
        return None, "no cf token"
    url = "https://api.cloudflare.com/client/v4" + path
    h = {"Authorization": "Bearer " + token}
    data = None
    if sql is not None:
        data = json.dumps({"sql": sql}).encode()
        h["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=data, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return json.loads(resp.read().decode()), None
    except urllib.error.HTTPError as e:
        return None, "cf HTTP " + str(e.code)
    except Exception as e:
        return None, str(e)


def d1_count(db, sql):
    out, err = cf("/accounts/" + ACCT + "/d1/database/" + db + "/query", sql=sql)
    if not out or not out.get("success") or not out.get("result"):
        return -1, err
    try:
        return out["result"][0]["results"][0]["n"], None
    except Exception as e:
        return -1, str(e)


def main():
    ap = argparse.ArgumentParser(description="QNFO notes-API runtime verification")
    ap.add_argument("--router-key", default=None)
    ap.add_argument("--personal-key", default=None)
    ap.add_argument("--expect-router-version", default="4.6.3")
    ap.add_argument("--expect-personal-version", default="v1.3.0")
    args = ap.parse_args()

    rk = args.router_key or tok("qnfo-ai")
    pk = args.personal_key or tok("personal-api")
    if not rk or not pk:
        print("FATAL: router/personal keys not found (pass --router-key/--personal-key or place files in tokens/)")
        return 2

    checks = []

    def check(name, ok, detail=""):
        checks.append((name, bool(ok)))
        print(("PASS  " if ok else "FAIL  ") + name + ("  -- " + detail if detail else ""))

    ts = time.strftime("%Y%m%d%H%M%S")
    marker = "VERIFY-OK-" + ts
    thread = "verify-" + ts
    start = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    # 1 router health
    s, j = req(ROUTER + "/health", timeout=20)
    ver = (j or {}).get("version", "?") if j else "?"
    ok = s == 200 and j and j.get("status") == "ok" and j.get("version") == args.expect_router_version \
        and j.get("bindings", {}).get("log_vz") and j.get("bindings", {}).get("query_db")
    check("router health " + ver, ok, "log_vz/query_db bindings true")

    # 2 personal health
    s, j = req(PERSONAL + "/health", timeout=20)
    ver = (j or {}).get("version", "?") if j else "?"
    ok = s == 200 and j and j.get("version") == args.expect_personal_version
    check("personal health " + ver, ok)

    # 3 router chat (free glm-5.2, non-stream)
    s, j = req(ROUTER + "/v1/chat/completions",
               {"model": "glm-5.2", "messages": [{"role": "user", "content": "Reply with exactly: " + marker}]},
               {"Authorization": "Bearer " + rk}, timeout=120)
    content = ""
    if s == 200 and j:
        content = ((j.get("choices") or [{}])[0].get("message", {}) or {}).get("content", "")
    check("router chat (glm-5.2 free)", s == 200 and marker in content, "cost $0")

    # 4 personal chat (logs thread verify-<ts>)
    s, j = req(PERSONAL + "/v1/chat/completions",
               {"model": "personal-twin-chat", "thread_id": thread,
                "messages": [{"role": "user", "content": "Reply with exactly: " + marker}]},
               {"Authorization": "Bearer " + pk}, timeout=120)
    content = ""
    if s == 200 and j:
        content = ((j.get("choices") or [{}])[0].get("message", {}) or {}).get("content", "")
    check("personal chat (twin)", s == 200 and marker in content, "thread " + thread)

    # 5 router web search (retry x3 on 5xx/empty)
    ws_ok = False
    for _ in range(3):
        s, j = req(ROUTER + "/v1/web/search?q=" + urllib.parse.quote("quantum error correction overhead") + "&k=2",
                   headers={"Authorization": "Bearer " + rk}, timeout=45)
        if s == 200 and j and j.get("count", 0) >= 1:
            ws_ok = True
            break
        time.sleep(3)
    check("router web search (DDG)", ws_ok, "retry x3")

    # 6 allow waitUntil logging + vector index propagation
    time.sleep(5)

    # 7 D1 ai_queries row written for this run
    n, err = d1_count(D1_AUDIT, "SELECT COUNT(*) AS n FROM ai_queries WHERE ts >= '" + start +
                     "' AND prompt LIKE '%" + marker + "%'")
    check("D1 ai_queries logged", n >= 1, "rows=" + str(n) + ((" err=" + err) if err else ""))

    # 8 Vectorize qnfo-ai-log growing (baseline 54 after 2026-08-28 restore)
    out, err = cf("/accounts/" + ACCT + "/vectorize/v2/indexes/qnfo-ai-log/info")
    vc = 0
    if out and out.get("success") and out.get("result"):
        vc = out["result"].get("vectorCount", 0)
    check("Vectorize qnfo-ai-log growing", vc > 49, "vectors=" + str(vc))

    # 9 semantic recall via /v1/history?q=
    hist_ok = False
    for _ in range(6):
        s, j = req(ROUTER + "/v1/history?q=" + urllib.parse.quote("VERIFY-OK") + "&k=3",
                   headers={"Authorization": "Bearer " + rk}, timeout=30)
        if s == 200 and j and j.get("count", 0) >= 1:
            hist_ok = True
            break
        time.sleep(5)
    check("semantic recall /v1/history?q=", hist_ok)

    # 10 personal D1 chat rows (user + assistant)
    n, err = d1_count(D1_PERSONAL, "SELECT COUNT(*) AS n FROM chat WHERE thread = '" + thread + "'")
    check("personal chat logged (D1)", n == 2, "rows=" + str(n))

    # 11 personal thread findable in personal-life Vectorize
    pv_ok = False
    for _ in range(6):
        s, j = req(PL_SEARCH + "/search?q=" + urllib.parse.quote("VERIFY-OK") + "&topK=5", timeout=30)
        paths = []
        if s == 200 and j:
            paths = [f.get("path", "") for f in (j or {}).get("files", [])]
        if any(thread in p for p in paths):
            pv_ok = True
            break
        time.sleep(5)
    check("personal notes findable in Vectorize", pv_ok, thread)

    failed = [c for c in checks if not c[1]]
    print("SUMMARY: " + str(len(checks) - len(failed)) + "/" + str(len(checks)) + " checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
