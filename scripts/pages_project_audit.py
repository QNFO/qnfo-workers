#!/usr/bin/env python3
"""pages_project_audit.py - READ-ONLY inventory of a Cloudflare Pages project.

WHY THIS EXISTS (root cause, 2026-09-29, issue 1393 ARCHIVE-PAGES-UNDEPLOYABLE-1)
---------------------------------------------------------------------------------
`wrangler pages deploy` REPLACES a Pages project's entire file set. The repo has
no deploy path to qnfo-publications, so archive.qnfo.org still serves the
pre-fix corrupted HTML (commit f6601128 is inert in production). The blocker on
adding that path is stated plainly in .github/workflows/deploy-pages-qnfo-publications.yml:
the repo cannot prove what else the qnfo-publications project holds, so a blind
full-replace could delete co-hosted assets.

This script closes that gap. It answers, from the CF API:
  * does the project exist, and what are its domains / subdomain?
  * how many deployments are there, and what is the newest one?
  * how many FILES does the newest deployment contain, and what are their keys?

It then persists the inventory to qnfo-audit D1 (table `pages_project_audit`) so
the pre-deploy gate can be evaluated from ops tooling, without needing GitHub
Actions log access.

SAFETY: this script is strictly READ-ONLY against Pages. It performs GET on
/accounts/<acct>/pages/projects/<project> and its deployments, plus an idempotent
CREATE TABLE IF NOT EXISTS + INSERT in D1. It never creates, deletes or deploys
anything on Pages.

USAGE
-----
    CF_API_TOKEN=... CF_ACCOUNT_ID=... python3 scripts/pages_project_audit.py [project]

EXIT CODES
----------
    0  inventory captured and persisted
    2  configuration error (missing token)
    3  API failure (surfaced verbatim) -- fail-closed, the gate cannot be
       evaluated, so the deploy must not proceed
"""

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

ACCT = os.environ.get("CF_ACCOUNT_ID", "").strip() or "edb167b78c9fb901ea5bca3ce58ccc4b"
AUDIT_DB = os.environ.get("CF_AUDIT_D1_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")
PROJECT = "qnfo-publications"
CF_API = "https://api.cloudflare.com/client/v4"


def token():
    t = os.environ.get("CF_API_TOKEN") or os.environ.get("CLOUDFLARE_API_TOKEN")
    if not t:
        print("FAIL: no CF token (set CF_API_TOKEN or CLOUDFLARE_API_TOKEN)")
        sys.exit(2)
    return t.strip()


def cf_get(path, tok):
    req = urllib.request.Request(
        CF_API + path,
        method="GET",
        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:800]
        try:
            return e.code, json.loads(body)
        except ValueError:
            return e.code, {"success": False, "errors": [{"code": e.code, "message": body}]}
    except Exception as e:
        return 0, {"success": False, "errors": [{"code": 0, "message": str(e)}]}


def d1_query(tok, sql, params):
    url = f"{CF_API}/accounts/{ACCT}/d1/database/{AUDIT_DB}/query"
    data = json.dumps({"sql": sql, "params": params}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode("utf-8", "replace")[:400]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:400]
    except Exception as e:
        return 0, "ERR " + str(e)


DDL = (
    "CREATE TABLE IF NOT EXISTS pages_project_audit ("
    "id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, project TEXT, ok INTEGER, "
    "domains TEXT, subdomain TEXT, deployment_count INTEGER, latest_id TEXT, "
    "latest_created TEXT, latest_branch TEXT, latest_env TEXT, file_count INTEGER, "
    "files_json TEXT, error TEXT)"
)


def main(argv):
    global PROJECT
    if len(argv) > 1 and argv[1].strip():
        PROJECT = argv[1].strip()
    tok = token()
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    st, proj = cf_get(f"/accounts/{ACCT}/pages/projects/{PROJECT}", tok)
    ok = bool(st == 200 and isinstance(proj, dict) and proj.get("success"))
    err = None
    domains, subdomain = "", ""
    dep_count, latest_id, latest_created, latest_branch, latest_env = 0, "", "", "", ""
    file_count, files_json = 0, "[]"

    if not ok:
        errs = (proj.get("errors") or []) if isinstance(proj, dict) else []
        err = "HTTP %s: %s" % (st, (errs[0].get("message") if errs else str(proj))[:400])
        print("FAIL: cannot read Pages project %r -> %s" % (PROJECT, err))
        print("This is fail-closed: without the project listing the deploy gate cannot be evaluated.")
    else:
        result = proj.get("result") or {}
        domains = ",".join(result.get("domains") or [])
        subdomain = result.get("subdomain") or ""
        print("project: %s" % PROJECT)
        print("  domains:   %s" % (domains or "-"))
        print("  subdomain: %s" % (subdomain or "-"))
        print("  created:   %s" % (result.get("created_on") or "-"))

        st2, deps = cf_get(
            f"/accounts/{ACCT}/pages/projects/{PROJECT}/deployments?per_page=25", tok
        )
        if st2 != 200 or not isinstance(deps, dict) or not deps.get("success"):
            errs = (deps.get("errors") or []) if isinstance(deps, dict) else []
            err = "deployments HTTP %s: %s" % (
                st2,
                (errs[0].get("message") if errs else str(deps))[:400],
            )
            print("FAIL: cannot list deployments -> %s" % err)
        else:
            rows = deps.get("result") or []
            dep_count = len(rows)
            print("  deployments: %d" % dep_count)
            for d in rows[:10]:
                print(
                    "    - %s  env=%s branch=%s created=%s"
                    % (
                        d.get("id"),
                        d.get("environment"),
                        d.get("deployment_trigger", {}).get("metadata", {}).get("branch"),
                        d.get("created_on"),
                    )
                )
            if rows:
                newest = rows[0]
                latest_id = newest.get("id") or ""
                latest_created = newest.get("created_on") or ""
                latest_env = newest.get("environment") or ""
                latest_branch = (
                    newest.get("deployment_trigger", {}).get("metadata", {}).get("branch") or ""
                )
                st3, det = cf_get(
                    f"/accounts/{ACCT}/pages/projects/{PROJECT}/deployments/{latest_id}", tok
                )
                if st3 == 200 and isinstance(det, dict) and det.get("success"):
                    files = (det.get("result") or {}).get("files") or {}
                    if isinstance(files, dict):
                        keys = sorted(files.keys())
                        file_count = len(keys)
                        files_json = json.dumps(keys)
                    else:
                        file_count = len(files)
                        files_json = json.dumps(files)
                    print("  newest deployment files: %d" % file_count)
                    print("    keys: %s" % (", ".join(json.loads(files_json)[:25]) or "-"))
                else:
                    errs = (det.get("errors") or []) if isinstance(det, dict) else []
                    print(
                        "  WARN: cannot read newest deployment detail (HTTP %s: %s)"
                        % (st3, (errs[0].get("message") if errs else str(det))[:200])
                    )

    st4, out = d1_query(tok, DDL, [])
    print("D1 DDL: HTTP %s %s" % (st4, out[:120]))
    st5, out5 = d1_query(
        tok,
        "INSERT INTO pages_project_audit (ts, project, ok, domains, subdomain, "
        "deployment_count, latest_id, latest_created, latest_branch, latest_env, "
        "file_count, files_json, error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
            ts,
            PROJECT,
            1 if (ok and not err) else 0,
            domains,
            subdomain,
            dep_count,
            latest_id,
            latest_created,
            latest_branch,
            latest_env,
            file_count,
            files_json,
            err,
        ],
    )
    print("D1 INSERT: HTTP %s %s" % (st5, out5[:200]))

    if not ok or err:
        print("RESULT: INCOMPLETE - %s" % (err or "project unreadable"))
        return 3
    print("RESULT: INVENTORY_CAPTURED project=%s deployments=%d files=%d" % (PROJECT, dep_count, file_count))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
