"""Job ingestion from public, ToS-clean feeds only (ATS public posting APIs + open boards).

No LinkedIn / Indeed scraping: LinkedIn User Agreement s8.2 bans scraping and bots.
Each fetcher returns normalized dicts and never raises: failures are returned as (jobs, error).
"""
import html
import json
import re
import urllib.request

UA = {"User-Agent": "qnfo-jobsearch/0.1 (+https://qnfo.org)"}


def _get(url, timeout=40):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def strip_html(s):
    s = html.unescape(s or "")
    s = re.sub(r"<(br|/p|/li|/h\d)[^>]*>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n", s)).strip()


def greenhouse(slug):
    d = _get(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true")
    out = []
    for j in d.get("jobs", []):
        out.append({"id": f"gh:{slug}:{j['id']}", "source": "greenhouse", "company": slug,
                    "title": j.get("title", ""), "location": (j.get("location") or {}).get("name", ""),
                    "url": j.get("absolute_url", ""), "desc": strip_html(j.get("content", ""))})
    return out


def lever(slug):
    d = _get(f"https://api.lever.co/v0/postings/{slug}?mode=json")
    out = []
    for j in d:
        cat = j.get("categories") or {}
        out.append({"id": f"lv:{slug}:{j['id']}", "source": "lever", "company": slug,
                    "title": j.get("text", ""), "location": cat.get("location", "") or "",
                    "url": j.get("hostedUrl", ""), "desc": (j.get("descriptionPlain") or "") + "\n" + (j.get("additionalPlain") or "")})
    return out


def ashby(slug):
    d = _get(f"https://api.ashbyhq.com/posting-api/job-board/{slug}")
    out = []
    for j in d.get("jobs", []):
        if j.get("isListed") is False:
            continue
        loc = j.get("location") or ""
        if j.get("isRemote"):
            loc += " (Remote)"
        out.append({"id": f"ab:{slug}:{j['id']}", "source": "ashby", "company": slug,
                    "title": j.get("title", ""), "location": loc,
                    "url": j.get("jobUrl", ""), "desc": j.get("descriptionPlain") or strip_html(j.get("descriptionHtml", ""))})
    return out


def remotive(category):
    d = _get(f"https://remotive.com/api/remote-jobs?category={category}")
    return [{"id": f"rm:{j['id']}", "source": "remotive", "company": j.get("company_name", ""),
             "title": j.get("title", ""), "location": "Remote - " + (j.get("candidate_required_location") or ""),
             "url": j.get("url", ""), "desc": strip_html(j.get("description", ""))} for j in d.get("jobs", [])]


def arbeitnow(pages=3):
    out = []
    for p in range(1, pages + 1):
        d = _get(f"https://www.arbeitnow.com/api/job-board-api?page={p}")
        for j in d.get("data", []):
            loc = j.get("location", "") + (" (Remote)" if j.get("remote") else "")
            out.append({"id": f"an:{j['slug']}", "source": "arbeitnow", "company": j.get("company_name", ""),
                        "title": j.get("title", ""), "location": loc, "url": j.get("url", ""),
                        "desc": strip_html(j.get("description", ""))})
    return out


FETCHERS = {"greenhouse": greenhouse, "lever": lever, "ashby": ashby, "remotive": remotive}


def collect(cfg):
    """cfg: {"greenhouse": [slugs], "lever": [...], "ashby": [...], "remotive": [cats], "arbeitnow": true}"""
    jobs, errors = [], []
    for kind, fn in FETCHERS.items():
        for arg in cfg.get(kind, []):
            try:
                jobs += fn(arg)
            except Exception as e:  # report, never hide
                errors.append(f"{kind}:{arg}: {type(e).__name__}: {e}")
    if cfg.get("arbeitnow"):
        try:
            jobs += arbeitnow()
        except Exception as e:
            errors.append(f"arbeitnow: {type(e).__name__}: {e}")
    return jobs, errors
