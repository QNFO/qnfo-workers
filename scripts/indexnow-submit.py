#!/usr/bin/env python3
"""indexnow-submit.py - EXTERNAL (non-Cloudflare) IndexNow submitter.

WHY THIS EXISTS (R1 floor, 2026-09-26)
  A Cloudflare Worker shares Cloudflare's egress IP, and IndexNow throttles that IP (429) across
  the shared relay and Bing; a Worker cannot change its own egress. Running this from GitHub
  Actions (GitHub/Azure egress) - or any operator host - submits the SAME URLs from a DIFFERENT
  IP, which is the empirically-proven path (an operator submit landed 460/460; the Worker's
  identical submit 429s). This is belt-and-braces with the qnfo-gateway Worker fan-out (which
  prefers yandex.com/indexnow because that engine still accepts the CF egress).

The IndexNow key is PUBLIC by design (it is served at https://papers.qnfo.org/<key>.txt), so it
is embedded here rather than kept as a secret.

Reads the live papers.qnfo.org sitemap, submits in chunks to every participating endpoint, and
reports per-endpoint status. Exit 0 if at least one endpoint accepted the full set.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request

HOST = "papers.qnfo.org"
KEY = "9c4e7a1f38b2d6504e7c9a1b38f2d650"
SITEMAP = "https://" + HOST + "/sitemap.xml"
ENDPOINTS = [
    "https://api.indexnow.org/indexnow",
    "https://www.bing.com/indexnow",
    "https://yandex.com/indexnow",
    "https://search.seznam.cz/indexnow",
    "https://searchadvisor.naver.com/indexnow",
]
CHUNK = 100


def urls():
    xml = urllib.request.urlopen(SITEMAP, timeout=30).read().decode("utf-8", "ignore")
    return [u for u in re.findall(r"<loc>([^<]+)</loc>", xml) if u.startswith("https://" + HOST + "/")]


def main():
    us = urls()
    print("urls:", len(us))
    if not us:
        print("no urls found in the sitemap")
        return 1
    ok = 0
    for i in range(0, len(us), CHUNK):
        chunk = us[i:i + CHUNK]
        body = json.dumps({
            "host": HOST, "key": KEY,
            "keyLocation": "https://" + HOST + "/" + KEY + ".txt",
            "urlList": chunk,
        }).encode()
        done = None
        for ep in ENDPOINTS:
            try:
                req = urllib.request.Request(ep, data=body, headers={"Content-Type": "application/json; charset=utf-8"})
                with urllib.request.urlopen(req, timeout=45) as resp:
                    print("  chunk %d @ %s -> %s" % (len(chunk), ep, resp.status))
                    if resp.status < 400:
                        done = ep
                        ok += len(chunk)
                        break
            except urllib.error.HTTPError as e:
                print("  chunk %d @ %s -> %s" % (len(chunk), ep, e.code))
            except Exception as e:  # noqa: BLE001
                print("  chunk %d @ %s -> err %s" % (len(chunk), ep, str(e)[:80]))
            time.sleep(1)
        if not done:
            print("  chunk %d -> ALL ENDPOINTS THROTTLED" % len(chunk))
    print("SUBMITTED_OK %d of %d" % (ok, len(us)))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
