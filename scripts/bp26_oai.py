#!/usr/bin/env python3
"""BP26-PAPER-PIDS-1 collector (2026-10-28, charter pillar research; agent_issues 1000338).

oai_pmh_validates: 1 when papers.qnfo.org/oai answers an OAI-PMH 2.0 structural check, else 0. The check fetches Identify and
ListRecords&metadataPrefix=oai_dc and tests: well-formed XML in the OAI namespace; Identify carries the seven required elements with
protocolVersion 2.0, a valid earliestDatestamp and granularity; ListRecords carries at least one record whose header has an identifier
and a UTC datestamp and whose metadata has a dc:title; and a bad verb answers an error element, not a record. Limits: this is OUR
structural check, not the official OAI validator (that needs a third-party service and a schema run); it proves the shape a harvester needs,
not full XSD conformance. An unreachable host is 0 with the reason, never unknown: a down endpoint is a failed validation.

Offline suite: python3 scripts/bp26_oai.py --selftest
"""
import os
import re
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bp26_producers import Collector, Result, Resp  # noqa: E402

BASE = "https://papers.qnfo.org/oai"
NS = "{http://www.openarchives.org/OAI/2.0/}"
DC = "{http://purl.org/dc/elements/1.1/}"
REQUIRED = ("repositoryName", "baseURL", "protocolVersion", "adminEmail", "earliestDatestamp", "deletedRecord", "granularity")
STAMP = re.compile(r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}Z)?$")


def parse(resp):
    if resp is None or getattr(resp, "status", 0) != 200:
        return None, "HTTP %s %s" % (getattr(resp, "status", "none"), getattr(resp, "error", "") or "")
    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError as e:
        return None, "not well-formed XML: %s" % str(e)[:60]
    if root.tag != NS + "OAI-PMH":
        return None, "root element is %s, not OAI-PMH in the OAI namespace" % root.tag[:60]
    return root, None


def problems(ctx):
    out = []
    root, err = parse(ctx.http(BASE + "?verb=Identify", timeout=20, max_bytes=262144))
    if err:
        return ["Identify: " + err]
    ident = root.find(NS + "Identify")
    if ident is None:
        out.append("Identify: no Identify element")
    else:
        for k in REQUIRED:
            if ident.find(NS + k) is None or not (ident.find(NS + k).text or "").strip():
                out.append("Identify: missing or empty " + k)
        pv = ident.find(NS + "protocolVersion")
        if pv is not None and (pv.text or "").strip() != "2.0":
            out.append("Identify: protocolVersion is not 2.0")
        ed = ident.find(NS + "earliestDatestamp")
        if ed is not None and not STAMP.match((ed.text or "").strip()):
            out.append("Identify: earliestDatestamp is not a valid datestamp")
    root, err = parse(ctx.http(BASE + "?verb=ListRecords&metadataPrefix=oai_dc", timeout=30, max_bytes=2 * 1024 * 1024))
    if err:
        out.append("ListRecords: " + err)
    else:
        recs = root.findall(NS + "ListRecords/" + NS + "record")
        if not recs:
            out.append("ListRecords: no record")
        else:
            h = recs[0].find(NS + "header")
            ident_ = h.find(NS + "identifier") if h is not None else None
            stamp = h.find(NS + "datestamp") if h is not None else None
            if ident_ is None or not (ident_.text or "").startswith("oai:"):
                out.append("ListRecords: first record has no oai: identifier")
            if stamp is None or not STAMP.match((stamp.text or "").strip()):
                out.append("ListRecords: first record has no valid datestamp")
            if recs[0].find(".//" + DC + "title") is None:
                out.append("ListRecords: first record has no dc:title")
    root, err = parse(ctx.http(BASE + "?verb=NotAVerb", timeout=20, max_bytes=65536))
    if err and not err.startswith("HTTP"):
        out.append("bad verb: " + err)
    elif root is not None and (root.find(NS + "error") is None or root.find(NS + "error").get("code") != "badVerb"):
        out.append("bad verb: no badVerb error element")
    return out


def collect_oai(ctx):
    p = problems(ctx)
    if p:
        return [Result("oai_pmh_validates", 0, "OAI-PMH structural check failed: " + "; ".join(p[:4]), [("check", 0, x) for x in p[:20]])]
    return [Result("oai_pmh_validates", 1, "Identify, ListRecords oai_dc and the badVerb error all well-formed (our structural check, not the official OAI validator)", [("check", 1, "passed")])]


COLLECTORS = [Collector("oai_pmh_validates", collect_oai, ["oai_pmh_validates"], 55)]


def selftest():
    H = '<?xml version="1.0"?><OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">'
    ident = H + "<Identify>" + "".join("<%s>%s</%s>" % (k, v, k) for k, v in [("repositoryName", "P"), ("baseURL", BASE), ("protocolVersion", "2.0"), ("adminEmail", "a@b.c"), ("earliestDatestamp", "2025-09-18T00:00:00Z"), ("deletedRecord", "no"), ("granularity", "YYYY-MM-DDThh:mm:ssZ")]) + "</Identify></OAI-PMH>"
    recs = H + '<ListRecords><record><header><identifier>oai:x:a</identifier><datestamp>2026-07-11T00:00:00Z</datestamp></header><metadata><dc xmlns="http://purl.org/dc/elements/1.1/"><title xmlns="http://purl.org/dc/elements/1.1/">T</title></dc></metadata></record></ListRecords></OAI-PMH>'
    bad = H + '<error code="badVerb">x</error></OAI-PMH>'
    pages = {"Identify": ident, "ListRecords": recs, "NotAVerb": bad}

    class Ctx:
        def __init__(self, pg):
            self.pg = pg

        def http(self, url, **k):
            v = url.split("verb=")[1].split("&")[0]
            t = self.pg.get(v)
            return Resp(200 if t is not None else 503, {}, [], t or "", url, 1, [], None if t is not None else "down")
    fails = []

    def ok(c, m):
        if not c:
            fails.append(m)
            print("FAIL " + m)
    ok(collect_oai(Ctx(pages))[0].value == 1, "a conforming repository passes")
    ok(collect_oai(Ctx(dict(pages, Identify=ident.replace("<adminEmail>a@b.c</adminEmail>", ""))))[0].value == 0, "a missing required element fails")
    ok(collect_oai(Ctx(dict(pages, ListRecords=recs.replace("<title", "<x").replace("</title", "</x"))))[0].value == 0, "a record with no dc:title fails")
    ok(collect_oai(Ctx(dict(pages, NotAVerb=recs)))[0].value == 0, "a bad verb that answers records fails")
    ok(collect_oai(Ctx({}))[0].value == 0 and "HTTP 503" in collect_oai(Ctx({}))[0].note, "a down endpoint is 0 with the reason")
    ok(collect_oai(Ctx(dict(pages, Identify="<nope")))[0].value == 0, "malformed XML fails")
    print("bp26_oai selftest %s" % ("ok" if not fails else "FAILED %d" % len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else 0)
