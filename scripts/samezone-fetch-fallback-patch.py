#!/usr/bin/env python3
"""SAME-ZONE-FETCH-FALLBACK-1 applier (2026-09-29).

WHY THIS EXISTS
---------------
qnfo-ops `web_fetch` performed a bare `fetch(url)`. When the target hostname is a
SAME-ZONE custom domain fronted by another Worker (ideas.qnfo.org, ops.qnfo.org,
ai.qnfo.org, fleet.qnfo.org, papers.qnfo.org, q08.org), the subrequest re-enters the
zone and terminates at a Worker that has no origin server behind it, so Cloudflare
returns HTTP 522. The identical URL returns 200 from outside Cloudflare, which is why
the fault is invisible to browsers and only breaks intra-fleet tooling.

MEASURED (2026-09-29)
---------------------
- qnfo-audit tool telemetry: web_fetch 19 failures / 29 calls in one hour = 66%,
  every single one `HTTP 522`.
- Reproduced live from the ops endpoint: web_fetch(https://ideas.qnfo.org/rss.xml)
  -> HTTP 522.
- Reproduced from Worker context this session, all three at once:
      https://ideas.qnfo.org/rss.xml -> 522
      https://ops.qnfo.org/health    -> 522
      https://ai.qnfo.org/health     -> 522
      https://www.qnfo.org/          -> 200   (control: not a Worker custom domain)
- Control from Worker context: fetch(https://qnfo-ai.q08.workers.dev/health) -> 200.

MASKING DEFECT (filed separately)
---------------------------------
`tool_error_exclusions` maps the pattern `HTTP 5` to class `upstream-availability`, so
a same-zone 522 is indistinguishable from a genuine external upstream outage and is
excluded from genuine-failure counts. That is why this defect never produced a ticket.

THE FIX
-------
Resolve a fleet custom domain back to its *.q08.workers.dev origin using CANON_BASE
(worker -> custom domain, already present in the worker) and, on a 5xx from the custom
domain ONLY, retry the identical request against that origin.

- 4xx responses are never retried: a 401/404 from the custom domain is a genuine
  answer and must not be masked.
- Non-fleet hosts are untouched, so external fetching behaviour is unchanged.
- On success via the fallback the response is annotated (`served_via`).
- On total failure the ORIGINAL primary error is reported, so diagnostics never
  regress to a less informative message.

VERSION-ANCHOR-DRIFT-1 (fixed in this revision, 2026-09-29)
----------------------------------------------------------
The previous revision anchored on the exact literal
    var VERSION = "2.37.24-404hint-list";
while qnfo-ops/worker.js had already moved to 2.37.25-github-read-404-hint, so the
occurrence count was 0, the script exited 1 fail-closed, apply-pending-patches
classified it `stale-anchor` and STILL RETURNED 0 -- CI green, patch orphaned, defect
live. Measured: 8 scripts in scripts/ shared this class.

This revision never anchors on an exact version. The VERSION line is matched by regex
(`var VERSION = "2.37.<N>-<slug>";`, exactly one match required) and rewritten to
<N>+1 carrying this patch's own slug. The anchor therefore cannot go stale.

FAIL-CLOSED / IDEMPOTENT
------------------------
- Marker present -> exit 0, no write.
- Any anchor whose occurrence count != 1 -> exit 1, no write (never half-applies).
- Exactly one VERSION literal required; 0 or >1 -> exit 1, no write.
- Post-write assertion on marker + new version + helper + annotation in every target.
"""
import os
import re
import sys

MARKER = "SAME-ZONE-FETCH-FALLBACK-1"
TARGETS = ("qnfo-ops/worker.js", "qnfo-ops/deployed-current.worker.js")

# VERSION-ANCHOR-DRIFT-1: match, never pin. The fleet bumps VERSION several times an
# hour; an exact literal here is orphaned within minutes.
VERSION_RE = re.compile(r'var VERSION = "2\.37\.(\d+)-[^"]*";')
NEW_SLUG = "samezone-fetch-fallback"

ANCHOR_FN = "async function webFetchTool(env, args) {"

ANCHOR_BODY = '''  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; QNFO-ops/2.4)" }, redirect: "follow" });
    const ct = String(r.headers.get("Content-Type") || "");
    if (!r.ok) return { ok: false, error: "HTTP " + r.status };
    const text = await r.text();
    const isHtml = ct.indexOf("html") >= 0 || text.slice(0, 200).toLowerCase().indexOf("<html") >= 0 || text.indexOf("<") >= 0 && text.indexOf(">") >= 0;
    const out = isHtml ? stripHtml(text) : text;
    return { ok: true, url, status: r.status, text: out.slice(0, max) };
  } catch (e) {
    return { ok: false, error: "fetch failed: " + (e && e.message || String(e)) };
  }
}
'''

HELPERS = '''// SAME-ZONE-FETCH-FALLBACK-1 (2026-09-29): a Worker fetching a same-zone custom
// domain that is fronted by another Worker gets HTTP 522 (there is no origin server
// to reach). Resolve the fleet hostname back to its *.q08.workers.dev origin, which
// IS reachable from Worker context, and retry there.
function fleetWorkerNamesForHost(host) {
  const out = [];
  const h = String(host || "").toLowerCase();
  if (!h) return out;
  try {
    for (const k in CANON_BASE) {
      const raw = String(CANON_BASE[k] || "");
      let hh = raw;
      const i = hh.indexOf("://");
      if (i >= 0) hh = hh.slice(i + 3);
      const j = hh.indexOf("/");
      if (j >= 0) hh = hh.slice(0, j);
      hh = hh.toLowerCase();
      if (hh === h && out.indexOf(k) < 0) out.push(k);
    }
  } catch (e) {}
  return out;
}

function fleetWorkersDevFallback(u) {
  try {
    const host = String(u && u.hostname || "").toLowerCase();
    if (!host || host.endsWith(".workers.dev")) return null;
    const names = fleetWorkerNamesForHost(host);
    if (!names.length) return null;
    const alt = new URL(String(u && u.href || ""));
    alt.protocol = "https:";
    alt.hostname = names[0] + ".q08.workers.dev";
    alt.port = "";
    return alt.href;
  } catch (e) {
    return null;
  }
}

'''

NEW_BODY = '''  // SAME-ZONE-FETCH-FALLBACK-1: a same-zone custom domain fronted by another Worker
  // returns 522 from Worker context. Retry the identical request against the target's
  // *.q08.workers.dev origin, which is reachable from Worker context.
  const _fb = fleetWorkersDevFallback(u);
  const _attempts = _fb && _fb !== url ? [url, _fb] : [url];
  let _primaryErr = null;
  let _lastErr = null;
  for (let _i = 0; _i < _attempts.length; _i++) {
    try {
      const r = await fetch(_attempts[_i], { headers: { "User-Agent": "Mozilla/5.0 (compatible; QNFO-ops/2.4)" }, redirect: "follow" });
      const ct = String(r.headers.get("Content-Type") || "");
      if (!r.ok) {
        _lastErr = "HTTP " + r.status;
        if (_i === 0) _primaryErr = _lastErr;
        if (_i + 1 < _attempts.length && r.status >= 500) continue;
        return { ok: false, error: _primaryErr || _lastErr, url, tried: _attempts };
      }
      const text = await r.text();
      const isHtml = ct.indexOf("html") >= 0 || text.slice(0, 200).toLowerCase().indexOf("<html") >= 0 || text.indexOf("<") >= 0 && text.indexOf(">") >= 0;
      const out = isHtml ? stripHtml(text) : text;
      const res = { ok: true, url, status: r.status, text: out.slice(0, max) };
      if (_i > 0) {
        res.served_via = "workers.dev-fallback";
        res.primary_error = _primaryErr;
      }
      return res;
    } catch (e) {
      _lastErr = "fetch failed: " + (e && e.message || String(e));
      if (_i === 0) _primaryErr = _lastErr;
      if (_i + 1 < _attempts.length) continue;
      return { ok: false, error: _primaryErr || _lastErr, url, tried: _attempts };
    }
  }
  return { ok: false, error: _primaryErr || _lastErr || "fetch failed", url, tried: _attempts };
}
'''


def main():
    root = os.getcwd()
    touched = []
    for rel in TARGETS:
        path = os.path.join(root, rel)
        if not os.path.exists(path):
            print("SKIP (missing): " + rel)
            continue
        src = open(path, encoding="utf-8").read()
        if MARKER in src:
            print("OK (already patched): " + rel)
            continue
        counts = {n: src.count(n) for n in (ANCHOR_FN, ANCHOR_BODY)}
        bad = {n: c for n, c in counts.items() if c != 1}
        if bad:
            print("FAIL (fail-closed): anchor occurrence != 1 in " + rel)
            for n, c in bad.items():
                print("  count=%d  %s" % (c, n.splitlines()[0][:90]))
            return 1
        vms = list(VERSION_RE.finditer(src))
        if len(vms) != 1:
            print("FAIL (fail-closed): VERSION literal occurrences = %d in %s" % (len(vms), rel))
            return 1
        vm = vms[0]
        old_version = vm.group(0)
        new_version = 'var VERSION = "2.37.%d-%s";' % (int(vm.group(1)) + 1, NEW_SLUG)
        out = src.replace(ANCHOR_FN, HELPERS + ANCHOR_FN, 1)
        out = out.replace(ANCHOR_BODY, NEW_BODY, 1)
        out = out.replace(old_version, new_version, 1)
        for probe in (MARKER, new_version, "fleetWorkersDevFallback", "fleetWorkerNamesForHost", "workers.dev-fallback"):
            if probe not in out:
                print("FAIL (post-write assertion): missing %r in %s" % (probe, rel))
                return 1
        open(path, "w", encoding="utf-8").write(out)
        print("PATCHED %s  (%d -> %d bytes)  %s -> %s" % (rel, len(src), len(out), old_version, new_version))
        touched.append(rel)
    if not touched:
        print("nothing to do")
    return 0


if __name__ == "__main__":
    sys.exit(main())
