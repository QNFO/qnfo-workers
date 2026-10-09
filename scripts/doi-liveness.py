#!/usr/bin/env python3
"""DOI-LIVENESS-1 (pillar reach): list the DOIs papers.qnfo.org advertises that no longer resolve.

A DOI is dead when Zenodo's record API answers 410 Gone for it (the record was deleted) and DataCite
has no record for it. Usage: python3 scripts/doi-liveness.py > dead.txt, then paste the lines into
DEAD_DOIS in qnfo-gateway/worker.js. Exit 0 always; prints one DOI per line on stdout.
"""
import json, re, sys, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "qnfo-doi-liveness"}), timeout=25) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception:
        return 0, b""

def page_dois():
    _, xml = get("https://papers.qnfo.org/sitemap.xml")
    urls = [u for u in re.findall(r"<loc>([^<]+)", xml.decode()) if "/papers/" in u]
    def one(u):
        _, h = get(u)
        m = re.search(r'name="citation_doi" content="([^"]+)', h.decode("utf8", "ignore"))
        return m.group(1) if m else None
    with ThreadPoolExecutor(16) as ex:
        return sorted({d for d in ex.map(one, urls) if d})

def dead(doi):
    if not doi.startswith("10.5281/zenodo."):
        return False
    z, _ = get("https://zenodo.org/api/records/" + doi.rsplit(".", 1)[1])
    if z != 410:
        return False
    d, _ = get("https://api.datacite.org/dois/" + doi)
    return d == 404

if __name__ == "__main__":
    ds = page_dois()
    with ThreadPoolExecutor(16) as ex:
        res = list(ex.map(dead, ds))
    print("\n".join(d for d, x in zip(ds, res) if x))
    print(f"{sum(res)} dead of {len(ds)} advertised", file=sys.stderr)
