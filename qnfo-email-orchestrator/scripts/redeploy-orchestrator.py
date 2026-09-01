#!/usr/bin/env python3
"""redeploy-orchestrator.py — restore qnfo-email-orchestrator from repo source.

OPS.003 recovery path. Reads worker.js from THIS repo dir, creates a new version
with the full documented binding set (keep_bindings ["secret_text"] preserves
EMAIL_API_KEY), deploys 100% to production.

Usage:
    python redeploy-orchestrator.py            # deploy worker.js from repo dir
    python redeploy-orchestrator.py /path/to/worker.js   # deploy explicit file

Env: CF_TOKEN (Cloudflare API token) or default account token embedded by operator.
"""
import urllib.request, json, os, io, time, sys

TOKEN = os.environ.get("CF_TOKEN", "")
ACCOUNT = os.environ.get("CF_ACCOUNT", "edb167b78c9fb901ea5bca3ce58ccc4b")
SCRIPT = "qnfo-email-orchestrator"

BINDINGS = [
    {"type": "ai", "name": "AI", "project": "<catalog>"},
    {"type": "d1", "name": "AUDIT_DB", "id": "35e2e573-92f3-46ac-83c6-22f6429fc5e5"},
    {"type": "plain_text", "name": "DRY_RUN", "text": os.environ.get("DRY_RUN", "false")},
    {"type": "service", "name": "EMAIL", "service": "qnfo-email", "environment": "production"},
    {"type": "d1", "name": "OUTREACH_DB", "id": "d5077252-8187-41b2-a44e-f84f8724ee36"},
]
KEEP_BINDINGS = ["secret_text"]  # EMAIL_API_KEY preserved from previous version

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "worker.js")
    with open(src, "r", encoding="utf-8") as f:
        worker = f.read()
    metadata = {
        "main_module": "worker.js",
        "bindings": BINDINGS,
        "keep_bindings": KEEP_BINDINGS,
        "compatibility_date": "2026-08-10",
        "annotations": {"workers/message": "recover-orchestrator.py redeploy v0.3.1"},
    }
    boundary = "----QNFO" + str(int(time.time() * 1000))
    buf = io.BytesIO()
    def part(name, filename, content_type, data):
        buf.write(("--" + boundary + "\r\n").encode())
        disp = 'Content-Disposition: form-data; name="%s"' % name
        if filename:
            disp += '; filename="%s"' % filename
        buf.write((disp + "\r\n").encode())
        buf.write(("Content-Type: %s\r\n\r\n" % content_type).encode())
        buf.write(data.encode("utf-8") if isinstance(data, str) else data)
        buf.write(b"\r\n")
    part("metadata", None, "application/json", json.dumps(metadata))
    part("files", "worker.js", "application/javascript+module", worker)
    buf.write(("--" + boundary + "--\r\n").encode())

    if not TOKEN:
        sys.exit("CF_TOKEN not set — cannot deploy")
    base = "https://api.cloudflare.com/client/v4/accounts/%s/workers/scripts/%s" % (ACCOUNT, SCRIPT)
    req = urllib.request.Request(base + "/versions", data=buf.getvalue(), method="POST")
    req.add_header("Authorization", "Bearer " + TOKEN)
    req.add_header("Content-Type", "multipart/form-data; boundary=" + boundary)
    req.add_header("User-Agent", "Mozilla/5.0 (QNFO recover)")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        sys.exit("version create failed: " + e.read().decode("utf-8", "replace")[:800])
    if not body.get("success"):
        sys.exit("version create error: " + json.dumps(body)[:800])
    vid = body["result"]["id"]
    print("VERSION", vid)

    dep = {"strategy": "percentage", "versions": [{"version_id": vid, "percentage": 100}],
           "annotations": {"workers/message": "recover-orchestrator.py deploy"}}
    req2 = urllib.request.Request(base + "/deployments", data=json.dumps(dep).encode(), method="POST")
    req2.add_header("Authorization", "Bearer " + TOKEN)
    req2.add_header("Content-Type", "application/json")
    req2.add_header("User-Agent", "Mozilla/5.0 (QNFO recover)")
    try:
        with urllib.request.urlopen(req2, timeout=60) as resp2:
            body2 = json.loads(resp2.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        sys.exit("deploy failed: " + e.read().decode("utf-8", "replace")[:800])
    print("DEPLOY", body2.get("result", {}).get("id"))
    print("OK — verify GET /health + /audit, then confirm cron via GET /schedules")

if __name__ == "__main__":
    main()
