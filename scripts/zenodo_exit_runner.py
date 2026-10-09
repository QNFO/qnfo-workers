#!/usr/bin/env python3
"""ZENODO-EXIT-RUNNER-1 (2026-10-09, pillar research; agent_issues 2186, doctrine revision 3 section 3).

WHAT  Keeps one zenodo_exit_ledger row per DataCite DOI under the owner's ORCID and recovers what exists of each record
      after zenodo.org stopped serving them (HTTP 410 on 12 of 12 sampled records, 2026-10-08). Per run, inside a time
      budget:
        1. DataCite list (paged) -> ledger rows (doi, recid, title, type, abstract length);
        2. in-house body from living-paper.papers (zenodo_doi or doi, body over 2,000 chars) -> status inhouse;
        3. DataCite metadata (title, creators, abstract, subjects, related identifiers) -> R2 qnfo-canonical
           zenodo-exit/<recid>/datacite.json for every DOI, so metadata and abstract survive for all of them;
        4. for a DOI with no in-house body, the Internet Archive availability API for zenodo.org/records/<recid> and
           zenodo.org/record/<recid>; a snapshot is fetched raw (id_) into zenodo-exit/<recid>/record.html with the
           archived file links it lists, each file up to 25 MB into zenodo-exit/<recid>/files/<name>.
      Status: pending -> inhouse | ia-recovered | metadata-only. Nothing is ever deleted.
WHY   The session sandbox is rate-limited by archive.org (HTTP 429) and Workers share egress; the GitHub runner reads it
      from its own address, and the repository token writes R2 (the D1 backups already do).
RUNS  A step of remediation-consumer.yml (hourly, dispatched by qnfo-cloud-ops when the consumer is idle 60 min). Never
      fails the job: exit 0 with a printed reason.
"""
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import remediation_consumer as RC  # noqa: E402  (its d1(), d1_plane() and Cloudflare credentials)

ORCID = "0009-0002-4317-5604"
DATACITE = ("https://api.datacite.org/dois?query=creators.nameIdentifiers.nameIdentifier:*" + ORCID + "*"
            "&page[size]=500&page[number]=%d")
BUCKET = "qnfo-canonical"
PREFIX = "zenodo-exit/"
BUDGET_S = int(os.environ.get("ZX_BUDGET_S", "300"))
META_PER_RUN = int(os.environ.get("ZX_META_PER_RUN", "150"))
IA_PER_RUN = int(os.environ.get("ZX_IA_PER_RUN", "40"))
FILE_CAP = 25 * 1024 * 1024
UA = {"User-Agent": "qnfo-zenodo-exit/1.0 (+https://qnfo.org)"}
DOI_RE = re.compile(r"^10\.\d{4,9}/[A-Za-z0-9._;()/:-]+$")
FILE_RE = re.compile(r'href="[^"]*?/records?/(\d+)/files/([^"?#/]+)[^"]*"')
INHOUSE_MIN = 2000


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def recid_of(doi):
    m = re.search(r"zenodo\.(\d+)$", doi or "")
    return m.group(1) if m else ""


def http_get(url, timeout=30, cap=None):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read(cap + 1) if cap else r.read()
        return r.status, data


def r2_put(key, body, ctype):
    url = "%s/accounts/%s/r2/buckets/%s/objects/%s" % (RC.CF_API, RC.ACCOUNT, BUCKET, urllib.parse.quote(key, safe="/"))
    req = urllib.request.Request(url, data=body, method="PUT",
                                 headers={"Authorization": "Bearer " + RC.TOKEN, "Content-Type": ctype})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status


def datacite_all(get=http_get):
    out, page = [], 1
    while page <= 20:
        st, raw = get(DATACITE % page, timeout=60)
        j = json.loads(raw.decode("utf-8", "replace"))
        data = j.get("data") or []
        out.extend(data)
        if len(data) < 500:
            break
        page += 1
    return out


def ledger_rows(items):
    rows = []
    for it in items:
        a = it.get("attributes") or {}
        doi = str(a.get("doi") or "").lower()
        if not DOI_RE.match(doi):
            continue
        title = ((a.get("titles") or [{}])[0] or {}).get("title") or ""
        abstract = max([len(d.get("description") or "") for d in (a.get("descriptions") or [])] or [0])
        rows.append({"doi": doi, "recid": recid_of(doi), "title": title[:300],
                     "rtype": ((a.get("types") or {}).get("resourceTypeGeneral") or "")[:40], "abstract_chars": abstract,
                     "meta": {k: a.get(k) for k in ("doi", "titles", "creators", "descriptions", "subjects", "dates",
                                                     "publicationYear", "types", "relatedIdentifiers", "rightsList",
                                                     "version", "url", "publisher")}})
    return rows


def upsert_sql(chunk):
    vals = ",".join("(%s,%s,%s,%s,%d,'pending',strftime('%%Y-%%m-%%dT%%H:%%M:%%SZ','now'))" % (
        q(r["doi"]), q(r["recid"]), q(r["title"]), q(r["rtype"]), int(r["abstract_chars"])) for r in chunk)
    return ("INSERT INTO zenodo_exit_ledger (doi, recid, title, rtype, abstract_chars, status, ts) VALUES " + vals +
            " ON CONFLICT(doi) DO UPDATE SET title = excluded.title, rtype = excluded.rtype, abstract_chars = excluded.abstract_chars")


def inhouse_map(plane):
    rows = plane("d1-query@living-paper", "SELECT lower(COALESCE(zenodo_doi, doi)) AS d, slug, length(COALESCE(body_md, '')) AS n "
                                          "FROM papers WHERE COALESCE(zenodo_doi, doi) LIKE '10.%'")
    best = {}
    for r in rows:
        d, n = str(r.get("d") or ""), int(r.get("n") or 0)
        if DOI_RE.match(d) and n > best.get(d, ("", 0))[1]:
            best[d] = (str(r.get("slug") or ""), n)
    return best


def ia_snapshot(recid, get=http_get):
    for form in ("zenodo.org/records/", "zenodo.org/record/"):
        st, raw = get("https://archive.org/wayback/available?url=" + form + recid, timeout=30)
        snap = ((json.loads(raw.decode("utf-8", "replace")).get("archived_snapshots") or {}).get("closest") or {})
        if snap.get("available") and str(snap.get("status")) == "200":
            return snap.get("timestamp"), form + recid
        time.sleep(1)
    return None, None


def recover(recid, ts, original, get=http_get, put=r2_put):
    st, html = get("https://web.archive.org/web/%sid_/https://%s" % (ts, original), timeout=60, cap=8 * 1024 * 1024)
    put(PREFIX + recid + "/record.html", html, "text/html; charset=utf-8")
    names = sorted({urllib.parse.unquote(m.group(2)) for m in FILE_RE.finditer(html.decode("utf-8", "replace")) if m.group(1) == recid})
    files, total, digest = 0, 0, hashlib.sha256(html)
    for name in names[:20]:
        if not re.match(r"^[A-Za-z0-9._ ()+-]{1,180}$", name):
            continue
        src = "https://web.archive.org/web/%sid_/https://zenodo.org/records/%s/files/%s" % (ts, recid, urllib.parse.quote(name))
        try:
            fst, body = get(src, timeout=90, cap=FILE_CAP)
        except Exception:  # noqa: BLE001
            continue
        if fst != 200 or len(body) > FILE_CAP or not body:
            continue
        put(PREFIX + recid + "/files/" + name, body, "application/octet-stream")
        files += 1
        total += len(body)
        digest.update(body)
        time.sleep(1)
    return files, total, digest.hexdigest()


def main(d1=None, plane=None, get=http_get, put=r2_put, now=time.time):
    d1 = d1 or RC.d1
    plane = plane or RC.d1_plane
    t0 = now()
    left = lambda: BUDGET_S - (now() - t0)  # noqa: E731
    stats = {"datacite": 0, "inhouse": 0, "meta_put": 0, "ia_checked": 0, "ia_recovered": 0, "errors": 0}
    try:
        rows = ledger_rows(datacite_all(get))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"zenodo_exit": "datacite-failed", "error": str(e)[:200]}))
        return 0
    stats["datacite"] = len(rows)
    for i in range(0, len(rows), 40):
        d1(upsert_sql(rows[i:i + 40]))
    try:
        best = inhouse_map(plane)
    except Exception as e:  # noqa: BLE001
        best = {}
        stats["errors"] += 1
        print(json.dumps({"zenodo_exit": "living-paper-read-failed", "error": str(e)[:200]}))
    hits = [(d, s, n) for d, (s, n) in best.items() if n >= INHOUSE_MIN]
    for i in range(0, len(hits), 40):
        chunk = hits[i:i + 40]
        d1("UPDATE zenodo_exit_ledger SET status = 'inhouse', inhouse_slug = CASE doi " +
           " ".join("WHEN %s THEN %s" % (q(d), q(s)) for d, s, n in chunk) + " END, inhouse_chars = CASE doi " +
           " ".join("WHEN %s THEN %d" % (q(d), n) for d, s, n in chunk) + " END, ts = strftime('%Y-%m-%dT%H:%M:%SZ','now') "
           "WHERE doi IN (" + ",".join(q(d) for d, s, n in chunk) + ") AND status IN ('pending', 'metadata-only')")
    stats["inhouse"] = len(hits)
    meta = {r["doi"]: r["meta"] for r in rows}
    todo = d1("SELECT doi, recid FROM zenodo_exit_ledger WHERE meta_key IS NULL AND recid <> '' ORDER BY doi LIMIT ?1", [META_PER_RUN])
    for r in todo:
        if left() < 60:
            break
        doi, recid = r.get("doi"), r.get("recid")
        if doi not in meta:
            continue
        try:
            put(PREFIX + recid + "/datacite.json", json.dumps(meta[doi], ensure_ascii=False, indent=1).encode("utf-8"), "application/json")
            d1("UPDATE zenodo_exit_ledger SET meta_key = ?1 WHERE doi = ?2", [PREFIX + recid + "/datacite.json", doi])
            stats["meta_put"] += 1
        except Exception as e:  # noqa: BLE001
            stats["errors"] += 1
            print(json.dumps({"zenodo_exit": "meta-put-failed", "doi": doi, "error": str(e)[:160]}))
    todo = d1("SELECT doi, recid FROM zenodo_exit_ledger WHERE status = 'pending' AND recid <> '' AND ia_checked_at IS NULL "
              "ORDER BY doi LIMIT ?1", [IA_PER_RUN])
    for r in todo:
        if left() < 90:
            break
        doi, recid = r.get("doi"), r.get("recid")
        try:
            ts, original = ia_snapshot(recid, get)
            stats["ia_checked"] += 1
            if not ts:
                d1("UPDATE zenodo_exit_ledger SET status = 'metadata-only', ia_checked_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), "
                   "ia_snapshot = 'none', ts = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE doi = ?1 AND status = 'pending'", [doi])
                continue
            files, total, sha = recover(recid, ts, original, get, put)
            d1("UPDATE zenodo_exit_ledger SET status = 'ia-recovered', ia_checked_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), ia_snapshot = ?1, "
               "files = ?2, bytes = ?3, sha256 = ?4, ts = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE doi = ?5",
               ["https://web.archive.org/web/%s/https://%s" % (ts, original), files, total, sha, doi])
            stats["ia_recovered"] += 1
        except urllib.error.HTTPError as e:
            stats["errors"] += 1
            print(json.dumps({"zenodo_exit": "ia-http", "doi": doi, "http": e.code}))
            if e.code == 429:
                break
        except Exception as e:  # noqa: BLE001
            stats["errors"] += 1
            print(json.dumps({"zenodo_exit": "ia-failed", "doi": doi, "error": str(e)[:160]}))
        time.sleep(1)
    stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        d1("INSERT INTO cloud_ops_events (id, ts, kind, status, text, job) VALUES (?1, ?2, 'zenodo-exit', ?3, ?4, 'zenodo-exit-runner') "
           "ON CONFLICT(id) DO UPDATE SET ts = excluded.ts, text = excluded.text, status = excluded.status",
           ["zenodo-exit-" + stamp[:13], stamp, "ok" if not stats["errors"] else "warn", json.dumps(stats)])
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"zenodo_exit": "ledger-event-failed", "error": str(e)[:160]}))
    print(json.dumps({"zenodo_exit": "ok", **stats}))
    return 0


def selftest():
    items = [{"attributes": {"doi": "10.5281/zenodo.111", "titles": [{"title": "A 'quoted' paper"}], "descriptions": [{"description": "x" * 300}],
                             "types": {"resourceTypeGeneral": "Preprint"}}},
             {"attributes": {"doi": "10.5281/zenodo.222", "titles": [{"title": "B"}]}},
             {"attributes": {"doi": "bad doi'; drop", "titles": []}}]
    rows = ledger_rows(items)
    assert [r["doi"] for r in rows] == ["10.5281/zenodo.111", "10.5281/zenodo.222"] and rows[0]["abstract_chars"] == 300
    assert "'A ''quoted'' paper'" in upsert_sql(rows)
    calls, puts, state = [], [], {"10.5281/zenodo.111": None, "10.5281/zenodo.222": None}

    def d1(sql, params=None):
        calls.append(sql.split()[0])
        if sql.startswith("SELECT doi, recid FROM zenodo_exit_ledger WHERE meta_key"):
            return [{"doi": d, "recid": recid_of(d)} for d in state]
        if sql.startswith("SELECT doi, recid FROM zenodo_exit_ledger WHERE status = 'pending'"):
            return [{"doi": "10.5281/zenodo.222", "recid": "222"}]
        return []

    plane = lambda t, s: [{"d": "10.5281/zenodo.111", "slug": "a", "n": 5000}]  # noqa: E731
    html = b'<a href="/records/222/files/paper.pdf?download=1">pdf</a><a href="https://zenodo.org/records/222/files/paper.pdf?preview=1">p</a><a href="/records/999/files/other.pdf">x</a>'

    def get(url, timeout=30, cap=None):
        host = urllib.parse.urlparse(url).hostname or ""
        if host == "api.datacite.org":
            return 200, json.dumps({"data": items}).encode()
        if host == "archive.org" and urllib.parse.urlparse(url).path == "/wayback/available":
            return 200, json.dumps({"archived_snapshots": {"closest": {"available": True, "status": "200", "timestamp": "20260422035742"}}}).encode()
        if url.endswith("/files/paper.pdf"):
            return 200, b"%PDF-1.4"
        return 200, html

    real_sleep, time.sleep = time.sleep, (lambda s: None)
    try:
        assert main(d1, plane, get, lambda k, b, c: puts.append(k) or 200) == 0
    finally:
        time.sleep = real_sleep
    assert "zenodo-exit/111/datacite.json" in puts and "zenodo-exit/222/record.html" in puts, puts
    assert "zenodo-exit/222/files/paper.pdf" in puts and not any("999" in p or "other" in p for p in puts), puts
    print("zenodo_exit_runner selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    sys.exit(main())
