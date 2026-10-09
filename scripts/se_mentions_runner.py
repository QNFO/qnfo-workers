#!/usr/bin/env python3
"""SE-RUNNER-SURFACE-1 (2026-10-09, pillar reach; doctrine revision 3 section 3, owner card stackexchange-key).

WHAT  Reads StackExchange mentions of QNFO without an application key, from the GitHub runner, and writes them to
      qnfo-audit.external_mentions (source stackexchange) with a heartbeat row in cloud_ops_events. On the first answered
      run it resolves the owner card stackexchange-key with the evidence.
WHY   The mention radar in qnfo-cloud-ops reads StackExchange from Cloudflare, where the keyless quota is per egress IP and
      Workers share egress IPs, so every run since 2026-10-02 was capped (RADAR-CAP-GRADING-1) and the card asked the owner
      to register a Stack Apps key under his own account. Surface test 2026-10-09 from a non-Cloudflare address: the same
      keyless query answered 200 with quota_max 300. The runner is that surface; no key and no owner account are needed.
RUNS  As a step of remediation-consumer.yml (hourly, dispatched by qnfo-cloud-ops when the consumer is idle 60 min). Reads
      only the public API; never fails the job (exit 0 with a printed reason).
"""
import gzip
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import remediation_consumer as RC  # noqa: E402  (its d1() client and Cloudflare credentials)

SE_URL = ("https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=activity&q=qnfo&site=stackoverflow"
          "&pagesize=20&filter=default")
CARD_SLUG = "stackexchange-key"


def fetch(url=SE_URL, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "qnfo-se-runner/1.0", "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip" or raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        return r.status, json.loads(raw.decode("utf-8", "replace"))


def rows_from(payload):
    out = []
    for it in payload.get("items") or []:
        out.append({"title": str(it.get("title") or "")[:180], "url": str(it.get("link") or ""),
                    "author": str((it.get("owner") or {}).get("display_name") or "")[:80],
                    "score": int(it.get("score") or 0),
                    "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(it.get("creation_date") or 0)))})
    return [r for r in out if r["url"]]


def main(d1=None, fetcher=fetch):
    d1 = d1 or RC.d1
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        status, payload = fetcher()
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"se_runner": "fetch-failed", "error": str(e)[:200]}))
        return 0
    if status != 200 or "items" not in payload:
        print(json.dumps({"se_runner": "unanswered", "http": status, "error": payload.get("error_name")}))
        return 0
    rows = rows_from(payload)
    added = 0
    for r in rows:
        try:
            d1("INSERT OR IGNORE INTO external_mentions (ts, source, title, url, author, score, created, first_seen) "
               "VALUES (?1, 'stackexchange', ?2, ?3, ?4, ?5, ?6, ?1)", [now, r["title"], r["url"], r["author"], r["score"], r["created"]])
            added += 1
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"se_runner": "insert-failed", "url": r["url"], "error": str(e)[:120]}))
    note = "ok:%d (keyless from the GitHub runner, quota_remaining %s)" % (len(rows), payload.get("quota_remaining"))
    try:
        d1("INSERT INTO cloud_ops_events (id, ts, kind, status, text, job) VALUES (?1, ?2, 'se-radar-runner', 'ok', ?3, 'se-mentions-runner') "
           "ON CONFLICT(id) DO UPDATE SET ts = excluded.ts, text = excluded.text", ["se-runner-" + now[:13], now, note])
        d1("UPDATE human_actions SET status = 'resolved', resolved_at = datetime('now'), updated_at = datetime('now'), resolution = ?1 "
           "WHERE slug = ?2 AND status = 'open'",
           ["SE-RUNNER-SURFACE-1: StackExchange is read without a key from the GitHub runner (scripts/se_mentions_runner.py, "
            "hourly with remediation-consumer.yml); first answered run " + now + ", " + note + ". No owner account is needed.", CARD_SLUG])
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"se_runner": "ledger-failed", "error": str(e)[:200]}))
    print(json.dumps({"se_runner": "ok", "items": len(rows), "written": added}))
    return 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        calls = []
        fake = lambda sql, params=None: calls.append((sql.split()[0], params)) or []  # noqa: E731
        assert rows_from({"items": [{"title": "t", "link": "https://x/1", "owner": {"display_name": "a"}, "score": 2, "creation_date": 0}, {"title": "no link"}]})[0]["url"] == "https://x/1"
        assert main(fake, lambda: (200, {"items": [{"title": "t", "link": "https://x/1", "creation_date": 0}], "quota_remaining": 9})) == 0
        assert [c[0] for c in calls] == ["INSERT", "INSERT", "UPDATE"], calls
        calls.clear()
        assert main(fake, lambda: (400, {"error_name": "throttle_violation"})) == 0 and not calls
        print("se_mentions_runner selftest ok")
        sys.exit(0)
    sys.exit(main())
