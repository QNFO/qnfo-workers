#!/usr/bin/env python3
"""Offline suite for workers_standards_guard.py: builds a throwaway git repo and checks that added anti-patterns fail, existing ones and
marked false positives pass, and observability removal / bare new workers fail."""
import os, subprocess, sys, tempfile, pathlib
G = str(pathlib.Path(__file__).resolve().parent / "workers_standards_guard.py")
fails = 0
def sh(cwd, *a): subprocess.run(a, cwd=cwd, check=True, capture_output=True)
def guard(cwd): return subprocess.run([sys.executable, G, "HEAD"], cwd=cwd, capture_output=True, text=True)
def ok(c, m):
    global fails
    if not c: fails += 1; print("FAIL " + m)
with tempfile.TemporaryDirectory() as t:
    p = pathlib.Path(t); sh(t, "git", "init", "-q"); sh(t, "git", "config", "user.email", "a@b.c"); sh(t, "git", "config", "user.name", "t")
    (p / "w").mkdir()
    (p / "w/worker.js").write_text('const id = Math.random().toString(36).slice(2);\nexport default {};\n')
    (p / "w/wrangler.toml").write_text('name="w"\n[observability]\nenabled=true\n[observability.traces]\nenabled=true\n')
    sh(t, "git", "add", "-A"); sh(t, "git", "commit", "-qm", "base")
    r = guard(t); ok(r.returncode == 0, "no change passes (existing debt is not blocked): " + r.stdout)
    (p / "w/worker.js").write_text('const id = Math.random().toString(36).slice(2);\nexport default {};\nconst t2 = Math.random().toString(16).slice(2);\n')
    r = guard(t); ok(r.returncode == 1 and "math-random-token" in r.stdout and "w/worker.js:3" in r.stdout, "an added Math.random id fails with its line: " + r.stdout)
    (p / "w/worker.js").write_text('export default {};\nconst t2 = Math.random().toString(16).slice(2); // standards-ok: jitter label, not a secret\n')
    r = guard(t); ok(r.returncode == 0, "a marked false positive passes: " + r.stdout)
    (p / "w/worker.js").write_text('export default {};\nif (req.headers.get("x") !== env.LOOP_TOKEN) return new Response("no");\nctx.passThroughOnException();\n')
    r = guard(t); ok(r.returncode == 1 and "secret-compare" in r.stdout and "pass-through-on-exception" in r.stdout, "secret compare and passThroughOnException fail: " + r.stdout)
    sh(t, "git", "checkout", "--", "w/worker.js")
    (p / "w/wrangler.toml").write_text('name="w"\n')
    r = guard(t); ok(r.returncode == 1 and "observability-removed" in r.stdout, "removing observability fails: " + r.stdout)
    sh(t, "git", "checkout", "--", "w/wrangler.toml")
    (p / "n").mkdir(); (p / "n/wrangler.toml").write_text('name="n"\n'); (p / "n/worker.js").write_text("export default {};\n")
    sh(t, "git", "add", "-A"); r = guard(t); ok(r.returncode == 1 and "new-worker-observability" in r.stdout, "a new worker without observability fails: " + r.stdout)
    (p / "n/wrangler.toml").write_text('name="n"\n[observability]\nenabled=true\nhead_sampling_rate=1\n[observability.traces]\nenabled=true\n')
    sh(t, "git", "add", "-A"); r = guard(t); ok(r.returncode == 0, "a new worker with observability and traces passes: " + r.stdout)
    (p / "n/RETIRED").write_text("x"); (p / "n/worker.js").write_text("ctx.passThroughOnException();\n")
    r = guard(t); ok(r.returncode == 0, "retired workers are skipped: " + r.stdout)
print("workers_standards_guard: %s" % ("FAILED %d" % fails if fails else "all passed")); sys.exit(1 if fails else 0)
