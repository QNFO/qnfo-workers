#!/usr/bin/env python3
"""r2_inventory_catalog_test.py - unit checks for R2-BASIN-CATALOG-COVERAGE-1 (2026-10-19).

Three things in scripts/r2_inventory_catalog.py can be wrong in a way that still returns HTTP 200 and still writes
rows: the listing parser (a two-object fixture that parses to zero objects reported success), the SigV4 canonical
query (a signature mismatch reads as a credential problem, not a bug), and the kind classifier (a file that cannot be
filtered by type is a file nobody finds). Each is tested here without touching the network.

Run: python3 scripts/r2_inventory_catalog_test.py
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("r2inv", os.path.join(HERE, "r2_inventory_catalog.py"))
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)

passed = 0


def ok(cond, label, extra=None):
    global passed
    if not cond:
        print("FAIL:", label, extra if extra is not None else "")
        sys.exit(1)
    passed += 1


LISTING = b"""<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>qnfo-skills</Name>
  <IsTruncated>true</IsTruncated>
  <NextContinuationToken>tok/en+2=</NextContinuationToken>
  <Contents>
    <Key>a/first.md</Key><LastModified>2026-10-18T13:30:00.000Z</LastModified>
    <ETag>&quot;abc123&quot;</ETag><Size>42</Size><StorageClass>STANDARD</StorageClass>
  </Contents>
  <Contents>
    <Key>b/second.json</Key><LastModified>2026-10-18T13:31:00.000Z</LastModified>
    <ETag>&quot;def456&quot;</ETag><Size>2048</Size><StorageClass>STANDARD</StorageClass>
  </Contents>
</ListBucketResult>"""

pages, truncated, token = M.parse_listing(LISTING)
ok(len(pages) == 2, "both <Contents> siblings parse (one is not the other's children)", pages)
ok([p["key"] for p in pages] == ["a/first.md", "b/second.json"], "keys are the object keys", pages)
ok([p["size"] for p in pages] == [42, 2048], "sizes are the object sizes, not zero", pages)
ok([p["etag"] for p in pages] == ["abc123", "def456"], "the ETag quotes are stripped", pages)
ok(pages[0]["uploaded"].startswith("2026-10-18T13:30"), "LastModified is carried per object", pages[0])
ok(truncated is True, "IsTruncated is read")
ok(token == "tok/en+2=", "the continuation token is read verbatim", token)

empty, empty_trunc, _ = M.parse_listing(
    b'<?xml version="1.0"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>b</Name>'
    b'<IsTruncated>false</IsTruncated></ListBucketResult>')
ok(empty == [] and empty_trunc is False, "an empty bucket parses to no objects and no truncation", empty)

# the canonical query signs what it sends: sorted keys, RFC3986 encoding. A space must be %20, never '+', because the
# signature is computed over the encoded string and R2 compares it byte for byte.
q = M.canon_query({"list-type": "2", "max-keys": "1000", "continuation-token": "a b+c/d="})
ok(q == "continuation-token=a%20b%2Bc%2Fd%3D&list-type=2&max-keys=1000", "canonical query is sorted and RFC3986", q)
ok(M.canon_query({"b": "2", "a": "1"}) == "a=1&b=2", "canonical query sorts by key", M.canon_query({"b": "2", "a": "1"}))

# kind is the extension lowercased; it is what makes `WHERE kind='md'` a useful question
ok(M.kind_of("papers/slug.md") == "md", "kind of a nested md file")
ok(M.kind_of("DIR/FILE.JSON") == "json", "kind is case-insensitive")
ok(M.kind_of("no-extension") == "", "no dot means no kind")
ok(M.kind_of("weird.name.with.dots.tar.gz") == "gz", "the last dot wins")

# credentials: the primary pair wins when present, and a half pair is skipped rather than half-used
env = dict(os.environ)
try:
    for k in ("CLOUDFLARE_R2_PRIMARY_ACCESS_KEY_ID", "CLOUDFLARE_R2_PRIMARY_SECRET_ACCESS_KEY",
              "CLOUDFLARE_R2_ACCESS_KEY_ID", "CLOUDFLARE_R2_SECRET_ACCESS_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"):
        os.environ.pop(k, None)
    os.environ["R2_ACCESS_KEY_ID"] = "fallback-ak"
    os.environ["R2_SECRET_ACCESS_KEY"] = "fallback-sk"
    ok(M.credentials()[:3] == ("R2", "fallback-ak", "fallback-sk"), "the plain R2 pair is used when primary is absent")
    os.environ["CLOUDFLARE_R2_PRIMARY_ACCESS_KEY_ID"] = "primary-ak"
    ok(M.credentials()[0] == "R2", "a primary access key without its secret is skipped, not half-used")
    os.environ["CLOUDFLARE_R2_PRIMARY_SECRET_ACCESS_KEY"] = "primary-sk"
    ok(M.credentials()[:3] == ("CLOUDFLARE_R2_PRIMARY", "primary-ak", "primary-sk"), "the primary pair wins when complete")
finally:
    os.environ.clear()
    os.environ.update(env)

print("r2_inventory_catalog_test: %d assertions passed" % passed)
