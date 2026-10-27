"""Pipeline: fetch -> gate+score -> tailor -> verify -> outbox (pending human approval) -> report.

usage: python -I run.py [--out DIR] [--cache FILE] [--top N]
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import match
import sources
import tailor

BOARDS = {
    "greenhouse": ["anthropic", "scaleai", "mongodb", "elastic", "gitlab", "databricks", "huggingface", "stripe"],
    "lever": ["palantir", "mistral"],
    "ashby": ["openai", "cohere", "notion", "elevenlabs"],
    "remotive": ["data", "product", "all-others"],
    "arbeitnow": True,
}


DISPLAY = {"openai": "OpenAI", "scaleai": "Scale AI", "gitlab": "GitLab", "mongodb": "MongoDB", "anthropic": "Anthropic", "databricks": "Databricks",
           "elastic": "Elastic", "stripe": "Stripe", "palantir": "Palantir", "mistral": "Mistral", "cohere": "Cohere", "notion": "Notion", "elevenlabs": "ElevenLabs"}
TAG = __import__("re").compile(r" <!--.*?-->$", __import__("re").M)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="out")
    ap.add_argument("--cache", default="")
    ap.add_argument("--top", type=int, default=12)
    a = ap.parse_args()
    t0 = time.time()
    if a.cache and os.path.exists(a.cache):
        jobs, errs = json.load(open(a.cache, encoding="utf-8")), []
    else:
        jobs, errs = sources.collect(BOARDS)
        if a.cache:
            json.dump(jobs, open(a.cache, "w", encoding="utf-8"))
    for j in jobs:
        j["company"] = DISPLAY.get(j["company"], j["company"])
    ranked, excl = match.rank(jobs)
    os.makedirs(a.out, exist_ok=True)
    rows, blocked = [], 0
    per, picked = {}, []
    for j in ranked:  # at most 3 per company so one board cannot flood the list
        if per.get(j["company"], 0) < 3:
            per[j["company"]] = per.get(j["company"], 0) + 1
            picked.append(j)
    for j in picked[: a.top]:
        res, note = tailor.build_resume(j, j["match"]), tailor.build_note(j, j["match"])
        v = tailor.verify(res, j) + tailor.verify(note, j)
        d = os.path.join(a.out, j["id"].replace(":", "_"))
        if v:
            blocked += 1
        else:
            os.makedirs(d, exist_ok=True)
            for name, body in (("resume", res), ("note", note)):  # keep the tagged proof, ship the clean text
                open(os.path.join(d, name + ".verified.md"), "w", encoding="utf-8").write(body)
                open(os.path.join(d, name + ".md"), "w", encoding="utf-8").write(TAG.sub("", body))
            json.dump({"status": "pending_owner_approval", "apply_url": j["url"], "flags": j["match"]["flags"]}, open(os.path.join(d, "meta.json"), "w"), indent=1)
        rows.append((j, v))
    lines = [f"# Job matches for {tailor.P['name']}",
             f"Fetched {len(jobs)} postings in {time.time() - t0:.0f}s from {sum(len(v) if isinstance(v, list) else 1 for v in BOARDS.values())} feeds; {len(ranked)} passed all gates; showing top {len(rows)}; {blocked} blocked by the verifier.",
             "", "Excluded (count by reason): " + ", ".join(f"{k}={v}" for k, v in sorted(excl.items(), key=lambda x: -x[1])[:8]), ""]
    if errs:
        lines += ["Feed errors: " + "; ".join(errs), ""]
    for j, v in rows:
        m = j["match"]
        lines += [f"## [{m['tier']} {m['score']}] {j['title']} - {j['company']} ({j['location'] or 'n/a'})", j["url"],
                  "- why: " + " | ".join(m["why"])]
        if m["flags"]:
            lines.append("- OWNER CHECK: " + " | ".join(m["flags"]))
        lines.append("- verifier: " + ("PASS (artifacts in outbox, awaiting your approval)" if not v else "BLOCKED: " + "; ".join(v)))
        lines.append("")
    open(os.path.join(a.out, "REPORT.md"), "w", encoding="utf-8").write("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
