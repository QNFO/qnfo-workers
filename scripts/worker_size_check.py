#!/usr/bin/env python3
"""worker_size_check.py -- WORKER-SIZE-CHECK-1 (2026-10-12, charter pillar: core; fix 19 of the owner's Workers reliability list).

WHAT  Reports the size of every live worker's worker.js against the Workers script size limit and fails only when one is above
      FAIL_SHARE (90%) of it. The limit is 64 MiB uncompressed on every plan; there is no compressed limit any more
      (developers.cloudflare.com/workers/platform/limits/#worker-size, changelog 2026-09-04, read 2026-10-12). The fleet's
      workers are single-file plain JS uploaded as they are (no bundler), so the file size IS the uploaded size.
      The second number is startup: a Worker must parse and run its global scope within 1 second (same page), and a larger
      script parses slower. That cannot be measured offline, so the report flags a script above WARN_BYTES (2 MiB) as a
      startup-time review item and never fails on it.
      A retired or folded directory (RETIRED / FOLDED marker) is skipped; deployed-current.worker.js is the mirror and equal.
USAGE python3 scripts/worker_size_check.py [--json] [--root DIR] [WORKER_DIR ...]     python3 scripts/worker_size_check.py --selftest
      Exit 0 when every script is at or below 90% of the limit, 1 when one is above, 2 on a usage or IO error.
"""
import gzip, json, os, sys

LIMIT_BYTES = 64 * 1024 * 1024
FAIL_SHARE = 0.90
WARN_BYTES = 2 * 1024 * 1024


def live_workers(root):
    out = []
    for d in sorted(os.listdir(root)):
        p = os.path.join(root, d)
        if d.startswith(".") or not os.path.isdir(p) or not os.path.isfile(os.path.join(p, "worker.js")):
            continue
        if os.path.exists(os.path.join(p, "RETIRED")) or os.path.exists(os.path.join(p, "FOLDED")):
            continue
        out.append(d)
    return out


def measure(root, worker, limit=LIMIT_BYTES):
    path = os.path.join(root, worker, "worker.js")
    with open(path, "rb") as fh:
        data = fh.read()
    share = len(data) / float(limit)
    return {"worker": worker, "bytes": len(data), "gzip_bytes": len(gzip.compress(data, 6)), "share": round(share, 6),
            "state": "fail" if share > FAIL_SHARE else ("review-startup" if len(data) > WARN_BYTES else "ok")}


def check(root, workers=None, limit=LIMIT_BYTES):
    rows = [measure(root, w, limit) for w in (workers if workers else live_workers(root))]
    rows.sort(key=lambda r: -r["bytes"])
    return rows


def render(rows, limit=LIMIT_BYTES):
    lines = ["WORKER-SIZE-CHECK-1: %d live worker scripts against the %d MiB uncompressed limit (fail above %d%%)" % (len(rows), limit // (1024 * 1024), int(FAIL_SHARE * 100))]
    for r in rows:
        lines.append("  %-28s %10d bytes  %7.3f%% of the limit  gzip %9d  %s" % (r["worker"], r["bytes"], r["share"] * 100, r["gzip_bytes"], r["state"]))
    bad = [r["worker"] for r in rows if r["state"] == "fail"]
    review = [r["worker"] for r in rows if r["state"] == "review-startup"]
    if review:
        lines.append("  startup review (above %d MiB; the 1 s global-scope limit is measured only at upload): %s" % (WARN_BYTES // (1024 * 1024), ", ".join(review)))
    lines.append("WORKER-SIZE-CHECK-1: " + ("FAILED: above 90%% of the limit: %s (split the worker, or move data to KV, R2 or D1)" % ", ".join(bad) if bad else "ok"))
    return "\n".join(lines)


def selftest():
    import tempfile
    fails = []

    def ok(c, name, detail=None):
        print(("PASS " if c else "FAIL ") + name + ("" if c or detail is None else " -- " + repr(detail)[:300]))
        if not c:
            fails.append(name)
    ok(LIMIT_BYTES == 67108864 and FAIL_SHARE == 0.9, "the limit is 64 MiB and the failure line 90%")
    with tempfile.TemporaryDirectory() as t:
        for name, size, marker in [("small", 1000, None), ("big", 950, None), ("edge", 900, None), ("gone", 5000, "RETIRED"), ("folded", 5000, "FOLDED")]:
            os.mkdir(os.path.join(t, name))
            with open(os.path.join(t, name, "worker.js"), "wb") as fh:
                fh.write(b"x" * size)
            if marker:
                open(os.path.join(t, name, marker), "w").close()
        os.mkdir(os.path.join(t, "docs"))
        os.mkdir(os.path.join(t, ".github"))
        ok(live_workers(t) == ["big", "edge", "small"], "retired, folded and non-worker directories are skipped", live_workers(t))
        rows = check(t, limit=1000)
        st = {r["worker"]: r["state"] for r in rows}
        ok(st == {"small": "fail", "big": "fail", "edge": "ok"} and rows[0]["worker"] == "small", "above 90% fails, exactly 90% passes, largest first", rows)
        ok(main(["--root", t]) == 0 and all(r["state"] == "ok" for r in check(t)), "against the real limit a small tree passes")
        ok("FAILED: above 90% of the limit: small, big" in render(rows, 1000), "the report names the failing workers", render(rows, 1000))
        ok(check(t, ["edge"], 1000)[0]["bytes"] == 900 and check(t, ["edge"], 1000)[0]["gzip_bytes"] > 0, "a named worker is measured alone, with its gzip size")
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    real = check(here)
    ok(len(real) >= 1 and all(r["state"] != "fail" for r in real), "every live worker in this repository is at or below 90% of the limit", [r for r in real if r["state"] == "fail"])
    print("worker_size_check selftest: " + ("ok" if not fails else "%d FAILED" % len(fails)))
    return 1 if fails else 0


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if "--selftest" in argv:
        return selftest()
    root = os.getcwd()
    if "--root" in argv:
        i = argv.index("--root")
        if i + 1 >= len(argv):
            print("usage: worker_size_check.py [--json] [--root DIR] [WORKER_DIR ...]")
            return 2
        root = argv[i + 1]
        del argv[i:i + 2]
    as_json = "--json" in argv
    workers = [a.rstrip("/") for a in argv if not a.startswith("--")]
    try:
        rows = check(root, workers)
    except OSError as e:
        print("WORKER-SIZE-CHECK-1: cannot read a worker script (%s)" % e)
        return 2
    print(json.dumps({"limit_bytes": LIMIT_BYTES, "fail_share": FAIL_SHARE, "workers": rows}) if as_json else render(rows))
    return 1 if any(r["state"] == "fail" for r in rows) else 0


if __name__ == "__main__":
    sys.exit(main())
