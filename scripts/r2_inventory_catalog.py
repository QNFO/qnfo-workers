#!/usr/bin/env python3
"""r2_inventory_catalog.py - R2-BASIN-CATALOG-COVERAGE-1 (2026-10-19, owner directive).

WHAT THIS IS FOR
  "All R2 files must be queryable via Basin Catalog." A Basin Catalog is an Apache Iceberg catalog inside an R2
  bucket: it makes *Iceberg tables* queryable with Basin SQL. It does not, by itself, say anything about the
  ordinary objects a bucket holds, so a bucket can be catalog-enabled and still hold millions of files that no SQL
  engine can see, list or filter. This script closes that gap: it lists every object in every bucket and lands one
  row per object in a catalog table, so the whole R2 estate answers to SQL.

  Measured before this existed (2026-10-18 15:20Z): 19 buckets, **2** catalog-enabled, **0** namespaces, **0**
  tables. The estate was opaque to Basin SQL.

HOW THE DATA GETS IN
  A list of objects is an event, and Basin Pipelines is the supported path from events to an Iceberg table:

    this script --HTTP--> r2_inventory_stream --SQL--> r2_inventory_catalog (sink) --> ops.r2_object_inventory

  The sink is type `r2_data_catalog`, so Cloudflare writes the Iceberg metadata and Parquet data files; nothing
  here hand-writes table metadata. The stream, sink and pipeline are named in the constants below and are created
  by `--ensure-infrastructure` (idempotent: a 409/duplicate means it already exists).

WHY LISTING COMES FROM THE S3 API, NOT THE CLOUDFLARE API
  The Cloudflare REST API can read a single object by key but cannot enumerate a bucket. R2's S3 endpoint can, so
  this uses ListObjectsV2 with SigV4 and stdlib only (no boto3 on these runners). Credentials come from the
  environment and are never written to disk or into a row.

THE HONEST LIMITS (read before quoting a number)
  * APPEND-ONLY. A pipeline is `INSERT INTO sink SELECT ... FROM stream`; there is no upsert and no delete. A scan
    adds a new observation version of every object rather than updating one row. Every object therefore appears as
    many times as it has been scanned - query it as `... row_number() OVER (PARTITION BY bucket, key ORDER BY
    scanned_at DESC) = 1` for the current estate, or keep `scanned_at` to see history. Do not report a raw
    COUNT(*) as "number of files"; that counts observations.
  * The row says an object EXISTS with this size, etag and upload time. It does not index the bytes. A text file is
    findable and filterable by bucket/key/kind/size; its contents are not searchable from SQL by this design.
  * Deleted objects are not removed from earlier observations. A key that disappears still has its last row.
  * This is a snapshot of listing at scan time, not a change feed, and R2 listings are eventually consistent for
    overwrites in the same second.
  * Cost is governed by Class A (list) operations: one request per 1000 objects per bucket.

USAGE
  python3 scripts/r2_inventory_catalog.py --ensure-infrastructure       # stream + sink + pipeline if missing
  python3 scripts/r2_inventory_catalog.py --dry-run --buckets qnfo-audit
  python3 scripts/r2_inventory_catalog.py --buckets qnfo-audit,qnfo-releases --max-objects 5000
  python3 scripts/r2_inventory_catalog.py                               # every bucket, every object
  python3 scripts/r2_inventory_catalog.py --check                        # report pipeline + table state, send nothing

ENVIRONMENT
  S3_ENDPOINT                     https://<account>.r2.cloudflarestorage.com
  CLOUDFLARE_R2_PRIMARY_ACCESS_KEY_ID / CLOUDFLARE_R2_PRIMARY_SECRET_ACCESS_KEY
                                  the pair to use when present (checked first)
  R2_ACCESS_KEY_ID                R2 S3 access key id      (fallback)
  R2_SECRET_ACCESS_KEY            R2 S3 secret access key  (fallback)
  R2_INVENTORY_STREAM_URL         https://<stream-id>.ingest.cloudflare.com
  CLOUDFLARE_API_TOKEN            Bearer token for the stream (Basin Pipelines Send) and, with
                                  --ensure-infrastructure, for the Cloudflare API

  Measured 2026-10-18: the runner's R2_ACCESS_KEY_ID pair signs to SignatureDoesNotMatch (403) against every
  bucket while CLOUDFLARE_R2_PRIMARY_* lists them, so the access key and its secret are not from the same key.
  The resolution order above exists for that reason; the script names the pair it used in its output.
EXIT
  0  every listed object was accepted by the stream
  1  a bucket could not be listed, or the stream refused a batch (fail loud: a silent gap is the defect this
     script exists to remove)
  2  missing configuration
"""
import argparse
import datetime as dt
import hashlib
import hmac
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

API = "https://api.cloudflare.com/client/v4"
USER_AGENT = "qnfo-r2-inventory/1.0 (+https://qnfo.org)"
ACCOUNT = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "edb167b78c9fb901ea5bca3ce58ccc4b")
STREAM_NAME = "r2_inventory_stream"
SINK_NAME = "r2_inventory_catalog"
PIPELINE_NAME = "r2_inventory"
CATALOG_BUCKET = "qnfo-audit"
CATALOG_NAMESPACE = "ops"
CATALOG_TABLE = "r2_object_inventory"
BATCH = 1000
FIELDS = [
    {"name": "bucket", "type": "string", "required": True},
    {"name": "key", "type": "string", "required": True},
    {"name": "size", "type": "int64", "required": False},
    {"name": "etag", "type": "string", "required": False},
    {"name": "uploaded", "type": "string", "required": False},
    {"name": "kind", "type": "string", "required": False},
    {"name": "scanned_at", "type": "string", "required": False},
]
PIPELINE_SQL = ("insert into %s select bucket, key, size, etag, uploaded, kind, scanned_at from %s"
                % (SINK_NAME, STREAM_NAME))


# ----------------------------------------------------------------------------------------------------------- S3
def _sign(key, msg):
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def canon_query(query):
    """RFC3986-encoded, sorted query string. The SAME string signs and is sent, so the signature cannot drift from
    the request (urlencode() would percent-encode differently and produce a 403 that looks like a bad key)."""
    return "&".join("%s=%s" % (urllib.parse.quote(k, safe="-_.~"), urllib.parse.quote(v, safe="-_.~"))
                    for k, v in sorted(query.items()))


def _sigv4_headers(method, path, canon_q, akid, secret):
    """Headers for one SigV4 request; `canon_q` is the exact query string the request sends."""
    host = urllib.parse.urlparse(os.environ["S3_ENDPOINT"]).netloc
    now = dt.datetime.now(dt.timezone.utc)
    amzdate = now.strftime("%Y%m%dT%H%M%SZ")
    datestamp = now.strftime("%Y%m%d")
    region, service = "auto", "s3"
    payload_hash = hashlib.sha256(b"").hexdigest()
    canon_headers = "host:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n" % (host, payload_hash, amzdate)
    signed = "host;x-amz-content-sha256;x-amz-date"
    canon_req = "\n".join([method, path, canon_q, canon_headers, signed, payload_hash])
    scope = "%s/%s/%s/aws4_request" % (datestamp, region, service)
    sts = "\n".join(["AWS4-HMAC-SHA256", amzdate, scope,
                     hashlib.sha256(canon_req.encode()).hexdigest()])
    k = _sign(("AWS4" + secret).encode(), datestamp)
    k = _sign(k, region)
    k = _sign(k, service)
    k = _sign(k, "aws4_request")
    sig = hmac.new(k, sts.encode(), hashlib.sha256).hexdigest()
    return {
        "Authorization": "AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s" % (akid, scope, signed, sig),
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amzdate,
    }


def parse_listing(body):
    """(objects, is_truncated, next_token) from a ListObjectsV2 response.

    findall, not find: ListObjectsV2 returns many <Contents> siblings, and an ElementTree element's truth value is
    its child count, so `find(...) or []` once walked the children of the FIRST object (Key, Size, LastModified...)
    and reported every key as None with size 0. Caught by scripts/r2_inventory_catalog_test.py against a two-object
    fixture before it was trusted with 127k rows.
    """
    root = ET.fromstring(body)
    ns = {"s3": root.tag.split("}")[0].strip("{")} if "}" in root.tag else {}

    def find(el, name):
        if ns:
            return el.findall("s3:" + name, ns)
        return el.findall(name)

    out = []
    for c in find(root, "Contents"):
        def get(n, _c=c):
            el = _c.find("s3:" + n, ns) if ns else _c.find(n)
            return el.text if el is not None else None
        out.append({"key": get("Key"), "size": int(get("Size") or 0), "etag": (get("ETag") or "").strip('"'),
                    "uploaded": get("LastModified")})
    tr = find(root, "IsTruncated")
    nct = find(root, "NextContinuationToken")
    return out, ((tr[0].text or "").lower() == "true" if tr else False), (nct[0].text if nct else None)


def list_objects(bucket, akid, secret, max_objects=None):
    """Yield {'key','size','etag','uploaded'} for every object in `bucket`. Raises on a refused page."""
    endpoint = os.environ["S3_ENDPOINT"].rstrip("/")
    token, seen = None, 0
    while True:
        q = {"list-type": "2", "max-keys": "1000"}
        if token:
            q["continuation-token"] = token
        cq = canon_query(q)
        url = "%s/%s?%s" % (endpoint, urllib.parse.quote(bucket, safe=""), cq)
        req = urllib.request.Request(url, method="GET", headers=_sigv4_headers("GET", "/" + bucket, cq, akid, secret))
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read()
        page, truncated, token = parse_listing(body)
        for o in page:
            yield o
            seen += 1
            if max_objects and seen >= max_objects:
                return
        if not truncated or not token:
            return


# ------------------------------------------------------------------------------------------------- stream/API
def send(rows, url, token):
    if not rows:
        return
    data = json.dumps(rows).encode()
    # USER-AGENT is required, not cosmetic: Cloudflare's ingest edge answers `Python-urllib/3.x` with
    # HTTP 403 `error code: 1010` (browser-blocked) before the token is even read. Measured 2026-10-18:
    # the same body and token commit through Invoke-RestMethod and through this header, and 403 without it.
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "Authorization": "Bearer " + token, "Content-Type": "application/json",
        "User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        j = json.loads(r.read() or b"{}")
    got = (j.get("result") or {}).get("committed")
    if got is not None and int(got) != len(rows):
        raise RuntimeError("stream committed %s of %s rows: %s" % (got, len(rows), json.dumps(j)[:200]))


def api(method, path, token, body=None):
    req = urllib.request.Request(API + path, data=(json.dumps(body).encode() if body is not None else None),
                                 method=method, headers={"Authorization": "Bearer " + token,
                                                         "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def kind_of(key):
    name = key.rsplit("/", 1)[-1]
    return name.rsplit(".", 1)[-1].lower()[:16] if "." in name else ""


def ensure_infrastructure(token):
    """Create stream, sink and pipeline when absent. Every step is idempotent and reports what it found."""
    out = []
    st, j = api("GET", "/accounts/%s/pipelines/v1/streams" % ACCOUNT, token)
    if st != 200:
        raise RuntimeError("list streams: %s %s" % (st, j))
    stream = next((s for s in (j.get("result") or []) if s.get("name") == STREAM_NAME), None)
    if not stream:
        st, j = api("POST", "/accounts/%s/pipelines/v1/streams" % ACCOUNT, token, {
            "name": STREAM_NAME,
            "format": {"type": "json", "unstructured": False},
            "schema": {"fields": FIELDS},
            "http": {"enabled": True, "authentication": True},
        })
        if st not in (200, 201):
            raise RuntimeError("create stream: %s %s" % (st, j))
        stream = j["result"]
        out.append({"created": STREAM_NAME, "id": stream["id"]})
    else:
        out.append({"exists": STREAM_NAME, "id": stream["id"], "endpoint": stream.get("endpoint")})
    st, j = api("GET", "/accounts/%s/pipelines/v1/sinks" % ACCOUNT, token)
    if st != 200:
        raise RuntimeError("list sinks: %s %s" % (st, j))
    sink = next((s for s in (j.get("result") or []) if s.get("name") == SINK_NAME), None)
    if not sink:
        st, j = api("POST", "/accounts/%s/pipelines/v1/sinks" % ACCOUNT, token, {
            "name": SINK_NAME, "type": "r2_data_catalog",
            "config": {"account_id": ACCOUNT, "bucket": CATALOG_BUCKET, "namespace": CATALOG_NAMESPACE,
                       "table_name": CATALOG_TABLE, "token": token,
                       "rolling_policy": {"interval_seconds": 60}},
            "format": {"type": "parquet"},
            "schema": {"fields": FIELDS},
        })
        if st not in (200, 201):
            raise RuntimeError("create sink: %s %s" % (st, j))
        out.append({"created": SINK_NAME, "id": j["result"]["id"]})
    else:
        out.append({"exists": SINK_NAME, "id": sink["id"]})
    st, j = api("GET", "/accounts/%s/pipelines/v1/pipelines" % ACCOUNT, token)
    if st != 200:
        raise RuntimeError("list pipelines: %s %s" % (st, j))
    pipe = next((p for p in (j.get("result") or []) if p.get("name") == PIPELINE_NAME), None)
    if not pipe:
        st, j = api("POST", "/accounts/%s/pipelines/v1/pipelines" % ACCOUNT, token,
                    {"name": PIPELINE_NAME, "sql": PIPELINE_SQL})
        if st not in (200, 201):
            raise RuntimeError("create pipeline: %s %s" % (st, j))
        out.append({"created": PIPELINE_NAME, "id": j["result"]["id"]})
    else:
        out.append({"exists": PIPELINE_NAME, "id": pipe["id"], "status": pipe.get("status")})
    return out


def check(token):
    """What the catalog and pipeline actually are, read from the API rather than assumed."""
    report = {"account": ACCOUNT, "catalogs": None, "namespaces": {}, "stream": None, "pipeline": None}
    st, j = api("GET", "/accounts/%s/basin-catalog" % ACCOUNT, token)
    if st == 200:
        wh = (j.get("result") or {}).get("warehouses") or []
        report["catalogs"] = {"enabled": len(wh), "buckets": [w.get("bucket") for w in wh]}
    st, j = api("GET", "/accounts/%s/basin-catalog/%s/namespaces" % (ACCOUNT, CATALOG_BUCKET), token)
    if st == 200:
        namespaces = (j.get("result") or {}).get("namespaces") or []
        for n in namespaces:
            # Iceberg REST returns a namespace as its level array (["ops"]); the API also accepts a plain string.
            name = ".".join(n) if isinstance(n, list) else (n if isinstance(n, str) else (n.get("namespace") or n.get("name")))
            st2, j2 = api("GET", "/accounts/%s/basin-catalog/%s/namespaces/%s/tables" % (ACCOUNT, CATALOG_BUCKET, name), token)
            report["namespaces"][str(name)] = (j2.get("result") or {}) if st2 == 200 else {"error": st2}
    st, j = api("GET", "/accounts/%s/pipelines/v1/pipelines" % ACCOUNT, token)
    if st == 200:
        p = [x for x in (j.get("result") or []) if x.get("name") == PIPELINE_NAME]
        report["pipeline"] = p[0] if p else None
    return report


def credentials():
    """(label, akid, secret) for the first complete pair in the environment, or None.

    CLOUDFLARE_R2_PRIMARY_* comes first because it is the pair measured to list every bucket; the plain R2_* pair
    on this runner signs to 403 SignatureDoesNotMatch (access key and secret belong to different keys).
    """
    for label, ak, sk in (
        ("CLOUDFLARE_R2_PRIMARY", os.environ.get("CLOUDFLARE_R2_PRIMARY_ACCESS_KEY_ID"),
         os.environ.get("CLOUDFLARE_R2_PRIMARY_SECRET_ACCESS_KEY")),
        ("CLOUDFLARE_R2", os.environ.get("CLOUDFLARE_R2_ACCESS_KEY_ID"), os.environ.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY")),
        ("R2", os.environ.get("R2_ACCESS_KEY_ID"), os.environ.get("R2_SECRET_ACCESS_KEY")),
    ):
        if ak and sk:
            return label, ak, sk
    return None


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--buckets", help="comma-separated bucket names (default: every bucket in the account)")
    ap.add_argument("--max-objects", type=int, help="stop after N objects per bucket (probe runs)")
    ap.add_argument("--dry-run", action="store_true", help="list and count, send nothing")
    ap.add_argument("--ensure-infrastructure", action="store_true", help="create stream/sink/pipeline when absent")
    ap.add_argument("--check", action="store_true", help="report catalog and pipeline state, send nothing")
    a = ap.parse_args(argv)
    api_token = os.environ.get("CLOUDFLARE_API_TOKEN") or ""
    if a.check:
        print(json.dumps(check(api_token), indent=2, sort_keys=True))
        return 0
    if a.ensure_infrastructure:
        print(json.dumps(ensure_infrastructure(api_token), indent=2))
        if not os.environ.get("R2_INVENTORY_STREAM_URL"):
            return 0
    stream_url = os.environ.get("R2_INVENTORY_STREAM_URL")
    cred = credentials()
    if not a.dry_run and not stream_url:
        print("R2_INVENTORY_STREAM_URL is not set (or use --dry-run / --check)", file=sys.stderr)
        return 2
    if not cred:
        print("no complete R2 S3 credential pair in the environment (CLOUDFLARE_R2_PRIMARY_* / R2_*)", file=sys.stderr)
        return 2
    cred_label, akid, secret = cred
    if a.buckets:
        buckets = [b.strip() for b in a.buckets.split(",") if b.strip()]
    else:
        st, j = api("GET", "/accounts/%s/r2/buckets" % ACCOUNT, api_token)
        if st != 200:
            print("cannot list buckets: %s %s" % (st, j), file=sys.stderr)
            return 2
        buckets = [b["name"] for b in (j.get("result") or {}).get("buckets", [])]
    started = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    totals, batch, failed = {}, [], []
    try:
        for b in buckets:
            n = size_sum = 0
            try:
                for o in list_objects(b, akid, secret, a.max_objects):
                    n += 1
                    size_sum += o["size"]
                    if not a.dry_run:
                        batch.append({"bucket": b, "key": o["key"], "size": o["size"], "etag": o["etag"],
                                      "uploaded": o["uploaded"] or "", "kind": kind_of(o["key"]),
                                      "scanned_at": started})
                        if len(batch) >= BATCH:
                            send(batch, stream_url, api_token)
                            batch = []
            except Exception as e:  # noqa: BLE001
                failed.append({"bucket": b, "error": str(e)[:300]})
            totals[b] = {"objects": n, "bytes": size_sum}
            print(json.dumps({"bucket": b, "objects": n, "bytes": size_sum}), flush=True)
        if not a.dry_run and batch:
            send(batch, stream_url, api_token)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(e)[:400], "sent_before_failure": totals}), file=sys.stderr)
        return 1
    out = {"ok": not failed, "scanned_at": started, "dry_run": a.dry_run, "credentials": cred_label,
           "buckets": len(totals), "objects": sum(t["objects"] for t in totals.values()),
           "bytes": sum(t["bytes"] for t in totals.values()), "per_bucket": totals, "failed": failed}
    print(json.dumps(out, sort_keys=True))
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
