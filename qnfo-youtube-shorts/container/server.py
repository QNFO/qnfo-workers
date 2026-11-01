"""YT-SERVER-1 container entrypoint. POST /render {id, job} -> 202; GET /result?id=[&download=1] -> state or the mp4; GET /health."""
import json
import re
import shutil
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import render

JOBS = {}          # id -> {"state": running|done|error, ...}
LOCK = threading.Lock()
JOBS_ROOT = Path("/tmp/jobs")
JOB_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}")


def job_dir(jid):
    """YT-SERVER-2: the working directory of a job, or None when the id is not a plain name. The id comes from the request body and used to reach
    shutil.rmtree(Path("/tmp/jobs") / jid) unchecked, so "../../etc" deleted (and rendered into) a directory outside /tmp/jobs, and an absolute id
    ("/etc") replaced the base path altogether, because pathlib drops the left side when the right side is absolute. The Worker sends the integer row id."""
    if not isinstance(jid, str) or not JOB_ID.fullmatch(jid) or ".." in jid:
        return None
    root = JOBS_ROOT.resolve()
    d = (root / jid).resolve()
    return d if d.parent == root else None


def work(jid, job):
    try:
        r = render.render(job, JOBS_ROOT / jid)
        with LOCK:
            JOBS[jid] = {"state": "done", **r}
    except Exception as e:          # reported to the caller verbatim
        with LOCK:
            JOBS[jid] = {"state": "error", "error": (repr(e) + "\n" + traceback.format_exc())[-1500:]}


class H(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json", extra=None):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(data)))
        for k, v in (extra or {}).items():
            self.send_header(k, str(v))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/health":
            return self._send(200, {"ok": True, "jobs": {k: v["state"] for k, v in JOBS.items()}})
        if u.path == "/result":
            j = JOBS.get((q.get("id") or [""])[0])
            if not j:
                return self._send(404, {"state": "unknown"})
            if j["state"] == "done" and (q.get("download") or [""])[0] == "1":
                return self._send(200, Path(j["path"]).read_bytes(), "video/mp4", {"x-duration-s": j["duration_s"]})
            return self._send(200, {k: v for k, v in j.items() if k != "path"})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        u = urlparse(self.path)
        if u.path != "/render":
            return self._send(404, {"error": "not found"})
        body = json.loads(self.rfile.read(int(self.headers.get("content-length") or 0)))
        jid = str(body.get("id") or "job")
        jdir = job_dir(jid)
        if jdir is None:
            return self._send(400, {"error": "bad id"})
        with LOCK:
            if JOBS.get(jid, {}).get("state") == "running":
                return self._send(202, {"state": "running", "id": jid})
            shutil.rmtree(jdir, ignore_errors=True)
            JOBS[jid] = {"state": "running"}
        threading.Thread(target=work, args=(jid, body["job"]), daemon=True).start()
        self._send(202, {"state": "running", "id": jid})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), H).serve_forever()
