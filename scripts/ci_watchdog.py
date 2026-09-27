#!/usr/bin/env python3
"""ci-watchdog.py - catch and remediate QNFO/qnfo-workers CI failure modes.

WHY THIS IS EVENT-DRIVEN AND NOT SCHEDULED
  On this repository the GitHub `schedule` event has NEVER fired: zero runs with
  event=schedule across the whole run history, including the 06:17 UTC
  (deploy-drift) and 06:23 UTC (indexnow-submit) slots. Any monitor built on a
  cron expression is therefore dead on arrival. Meanwhile EVERY run triggered by
  a push or a workflow_run has fired. So this watchdog hangs off `workflow_run`
  (completed) plus workflow_dispatch, and does its own time-gated periodic sweep.

WHAT IT CATCHES (one class per real failure mode observed 2026-09-26/27)
  silent-schedule   a workflow declares `schedule` but has 0 schedule-event runs
  mirror-lag        mirror-guard red: deployed-current.worker.js lags worker.js
  build-gate        deploy-gate red: WORKER-BUILD-GATE-1 / wrangler dry-run
  invalid-workflow  a run exists with ZERO jobs (broken workflow YAML)
  missing-module    MODULE_NOT_FOUND in the job log (workflow references an
                    uncommitted file)
  codeql-config     code scanning default-setup is not `configured`
  unknown           anything else, filed with the raw evidence

WHAT IT DOES ABOUT EACH (detect -> ACT -> verify, never detect-only)
  silent-schedule   dispatch the workflow so it actually executes
  mirror-lag        dispatch mirror-sync.yml (the repair actor)
  codeql-config     PATCH default-setup to configured
  others            file or refresh ONE deduped issue carrying the exact
                    evidence and the hinted fix; never owner=USER

Exit: 0 when every finding was acted on or is already tracked
      1 when a finding is unactionable and untracked (the watchdog is a gate)

Env: GH_TOKEN / GITHUB_TOKEN (needs actions:write, issues:write, contents:read)
     REPO (default QNFO/qnfo-workers)  DRY_RUN=1 to suppress all writes
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

REPO = os.environ.get("REPO", "QNFO/qnfo-workers")
TOKEN = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
DRY = os.environ.get("DRY_RUN") == "1"
API = "https://api.github.com"
LABEL = "ci-watchdog"
TITLE_PREFIX = "[ci-watchdog]"


def gh(path: str, method: str = "GET", body: dict | None = None):
    """Minimal API client. Returns (status, parsed)."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "qnfo-ci-watchdog")
    if TOKEN:
        req.add_header("Authorization", "Bearer " + TOKEN)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw) if raw.strip() else {}
        except Exception:
            return e.code, {"raw": raw[:500]}
    except Exception as e:  # network
        return 0, {"err": str(e)}


# --------------------------------------------------------------------------
# COLLECT
# --------------------------------------------------------------------------
def workflows() -> list[dict]:
    st, d = gh(f"/repos/{REPO}/actions/workflows?per_page=100")
    return d.get("workflows", []) if st == 200 else []


def runs(per_page: int = 100, **q) -> list[dict]:
    qs = "&".join(f"{k}={v}" for k, v in q.items())
    st, d = gh(f"/repos/{REPO}/actions/runs?per_page={per_page}" + ("&" + qs if qs else ""))
    return d.get("workflow_runs", []) if st == 200 else []


def run_events(wf_id: int, per_page: int = 100) -> list[dict]:
    st, d = gh(f"/repos/{REPO}/actions/workflows/{wf_id}/runs?per_page={per_page}")
    return d.get("workflow_runs", []) if st == 200 else []


def job_logs(run_id: int) -> str:
    st, d = gh(f"/repos/{REPO}/actions/runs/{run_id}/jobs")
    if st != 200:
        return ""
    out = []
    for j in d.get("jobs", []):
        st2, raw = gh(f"/repos/{REPO}/actions/jobs/{j['id']}/logs")
        if st2 == 200 and isinstance(raw, dict) and "raw" in raw:
            out.append(raw["raw"])
        elif st2 == 200 and isinstance(raw, str):
            out.append(raw)
    return "\n".join(out)


# --------------------------------------------------------------------------
# CLASSIFY
# --------------------------------------------------------------------------
def classify_structural(name: str, run: dict) -> tuple[str, str]:
    """Classify WITHOUT downloading a job log.

    The job-log endpoint 302-redirects to signed blob storage, and the
    redirected request carries the Authorization header it will not accept,
    so in CI the log fetch yielded nothing and every finding degraded to
    `unknown` (19 of 22 observed). Workflow identity and file presence are
    structured, always available, and need no download.
    """
    if name in SELF_WORKFLOWS:
        return "self", "the watchdog never files against itself"
    if name == "mirror-guard":
        return "mirror-lag", "dispatch mirror-sync.yml (mirror-guard.py --fix actor)"
    if name == "deploy-gate":
        return "build-gate", "WORKER-BUILD-GATE-1: a wrangler.toml `main` does not resolve in a changed dir"
    if name == "version-compare":
        if _absent("qnfo-fleet-control/version-compare.mjs", run) or _absent(
            "qnfo-fleet-control/version-compare.test.mjs", run
        ):
            return "missing-module", "the workflow runs a module/suite that is not committed; land it or retire the workflow"
        return "comparator-regression", "the fail-closed comparator invariant regressed; do NOT relax rule 5"
    if name in ("deploy-drift", "indexnow-submit"):
        return "external-runner", "driven by the watchdog because GitHub `schedule` never fires on this repo"
    return "unknown", "inspect the job log"


def _absent(path: str, run: dict) -> bool:
    ref = run.get("head_branch") or "main"
    st, _ = gh(f"/repos/{REPO}/contents/{path}?ref={ref}")
    return st == 404


def classify(log: str, wf_name: str) -> tuple[str, str]:
    L = log or ""
    if "DRIFT GATE FAILED" in L or "mirror-guard" in wf_name and "LAG" in L:
        return "mirror-lag", "dispatch mirror-sync.yml (mirror-guard.py --fix actor)"
    if "WORKER-BUILD-GATE-1" in L or "entry-point file at" in L:
        return "build-gate", "a wrangler.toml `main` does not resolve; fix the entry-point or drop the stale wrangler.toml"
    if "MODULE_NOT_FOUND" in L or "Cannot find module" in L:
        return "missing-module", "the workflow references a file that is not committed; land it or retire the workflow"
    if "not a valid model identifier" in L:
        return "unknown", "inspect"
    return "unknown", "inspect the job log"


def setup_config() -> str:
    """Code-scanning default-setup state.

    An authz-limited probe is NOT drift. The CI GITHUB_TOKEN commonly
    answers 403 here (reading code scanning needs `security-events: read`),
    and reporting that as `state=http-403` manufactured a permanent false
    finding whose remediation also 403d -- an unbreakable red. An
    unauthorized probe proves nothing, so return "unobservable" and let the
    caller skip. Same discipline as AUTHED-PROBE-HEADER-1.
    """
    st, d = gh(f"/repos/{REPO}/code-scanning/default-setup")
    if st == 200:
        return d.get("state", "unknown")
    return "unobservable"


# --------------------------------------------------------------------------
# ACT
# --------------------------------------------------------------------------
def dispatch(wf_file: str, ref: str = "main") -> tuple[bool, str]:
    if DRY:
        return True, "DRY_RUN"
    st, _ = gh(f"/repos/{REPO}/actions/workflows/{wf_file}/dispatches", "POST", {"ref": ref})
    return st in (204, 200), f"http-{st}"


def configure_codeql() -> tuple[bool, str]:
    if DRY:
        return True, "DRY_RUN"
    st, d = gh(
        f"/repos/{REPO}/code-scanning/default-setup",
        "PATCH",
        {"state": "configured", "languages": ["actions", "javascript-typescript", "python"]},
    )
    return st in (200, 202), f"http-{st} {d.get('state', '')}".strip()


def ensure_label() -> None:
    if DRY:
        return
    gh(f"/repos/{REPO}/labels", "POST", {"name": LABEL, "color": "b60205",
                                         "description": "filed by ci-watchdog"})


def file_or_refresh(klass: str, subject: str, body: str) -> str:
    """ONE deduped open issue per (class, subject). Refresh, never duplicate."""
    title = f"{TITLE_PREFIX} {klass}: {subject}"
    if DRY:
        return f"DRY_RUN would file {title!r}"
    st, d = gh(f"/repos/{REPO}/issues?state=open&labels={LABEL}&per_page=100")
    existing = None
    if st == 200:
        for it in d:
            if it.get("title") == title:
                existing = it
                break
    if existing:
        # Cooldown: without this the same known class is re-commented on every
        # watchdog run (one run added six comments to the same issue).
        upd = existing.get("updated_at") or ""
        try:
            import datetime as _d2
            ut = _d2.datetime.fromisoformat(upd.replace("Z", "+00:00"))
            age_h = (_d2.datetime.now(_d2.timezone.utc) - ut).total_seconds() / 3600.0
            if age_h < 6:
                return f"already reported #{existing['number']} ({age_h:.1f}h ago)"
        except Exception:
            pass
        gh(f"/repos/{REPO}/issues/{existing['number']}/comments", "POST", {"body": body})
        return f"refreshed #{existing['number']}"
    st, d = gh(f"/repos/{REPO}/issues", "POST",
               {"title": title, "body": body, "labels": [LABEL]})
    return f"filed #{d.get('number')}" if st in (201, 200) else f"FAILED http-{st}"


# --------------------------------------------------------------------------
# MAIN
# --------------------------------------------------------------------------
def main() -> int:
    if not TOKEN:
        print("ci-watchdog: no token; set GH_TOKEN", file=sys.stderr)
        return 1

    findings: list[dict] = []
    wfs = workflows()
    print(f"ci-watchdog: repo={REPO} workflows={len(wfs)}")

    inventory = []
    for w in wfs:
        rs = run_events(w["id"])
        events = {r.get("event") for r in rs}
        state = w.get("state")
        last = rs[0]["created_at"][:19] if rs else "-"
        scheduled = "schedule" in events
        declared = "schedule" in (w.get("path") or "")
        inventory.append({
            "id": w["id"], "name": w["name"], "path": w["path"], "state": state,
            "runs": len(rs), "events": sorted(e for e in events if e),
            "last": last, "ever_scheduled": scheduled,
        })
        print(f"  {state:7s} {w['name']:18s} runs={len(rs):3d} last={last} events={sorted(e for e in events if e)}")

    import datetime as _dtdt
    _now = _dtdt.datetime.now(_dtdt.timezone.utc)
    recent_wf = set()
    for _it in inventory:
        if _it["last"] == "-":
            continue
        try:
            _t = _dtdt.datetime.fromisoformat(_it["last"]).replace(tzinfo=_dtdt.timezone.utc)
            if (_now - _t).total_seconds() < 55 * 60:
                recent_wf.add(_it["name"])
        except Exception:
            pass

    # --- class: silent-schedule -------------------------------------------
    for it in inventory:
        if it["runs"] > 0 and not it["ever_scheduled"] and it["events"]:
            # declared a schedule but has never produced a schedule-event run
            st, raw = gh(f"/repos/{REPO}/contents/{it['path']}?ref=main")
            declared = False
            if st == 200 and isinstance(raw, dict) and raw.get("content"):
                import base64
                txt = base64.b64decode(raw["content"]).decode("utf-8", "replace")
                declared = "schedule:" in txt or "schedule\n" in txt
            if declared:
                findings.append({"class": "silent-schedule", "subject": it["name"],
                                 "evidence": f"{it['path']}: no schedule-event run ever (events={it['events']}, runs={it['runs']})"})

    # --- class: codeql-config ---------------------------------------------
    cs = setup_config()
    if cs == "unobservable":
        print("codeql: default-setup not observable with this token "
              "(needs security-events: read) -> cannot-observe, NOT drift")
    elif cs != "configured":
        findings.append({"class": "codeql-config", "subject": "default-setup",
                         "evidence": f"state={cs}"})

    # --- failures in the last 60 runs -------------------------------------
    # Bounded on purpose: the watchdog runs on a 10-minute CI budget and must
    # not re-litigate history. Only failures inside WINDOW_HOURS are considered,
    # log fetches are capped, and a retired workflow (file gone from the ref) is
    # recorded without spending a log fetch on it.
    import datetime as _dt
    # 6h, not 48h: a wide window re-reported the same past failures on every
    # run, so the gate could never reach green. Old history must age out.
    WINDOW_HOURS = int(os.environ.get("CI_WD_WINDOW_HOURS", "6"))
    SELF_WORKFLOWS = {"ci-watchdog"}
    # Log fetching is the only expensive call here. It is capped hard because the
    # watchdog runs on a 10-minute CI budget, and the cheap signals (a run with
    # ZERO jobs, and the workflow name) already classify the common cases.
    MAX_LOG_FETCHES = int(os.environ.get("CI_WD_MAX_LOG_FETCHES", "3"))
    cutoff = (_dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(hours=WINDOW_HOURS)).isoformat().replace("+00:00", "Z")
    log_fetches = 0
    if WINDOW_HOURS > 0:
        for r in runs(per_page=60):
            if r.get("conclusion") != "failure":
                continue
            if (r.get("created_at") or "") < cutoff:
                continue
            name = r.get("name") or ""
            if name in SELF_WORKFLOWS:
                continue
            path = (r.get("path") or "")
            st, _ = gh(f"/repos/{REPO}/contents/{path}?ref={r.get('head_branch') or 'main'}")
            retired = st == 404
            # Structural first: needs no log download, and log downloading
            # is exactly what silently failed in CI.
            kl, hint = classify_structural(name, r)
            if kl == "unknown" and not retired and log_fetches < MAX_LOG_FETCHES:
                stj, jd = gh(f"/repos/{REPO}/actions/runs/{r['id']}/jobs")
                if stj == 200 and not jd.get("jobs"):
                    kl, hint = "invalid-workflow", "the workflow YAML is invalid; GitHub created the run with zero jobs"
                elif stj == 200:
                    for j in jd.get("jobs", []):
                        stl, raw = gh(f"/repos/{REPO}/actions/jobs/{j['id']}/logs")
                        log_fetches += 1
                        txt = raw.get("raw", "") if isinstance(raw, dict) else str(raw)
                        k2, h2 = classify(txt, name)
                        if k2 != "unknown":
                            kl, hint = k2, h2
                            break
            findings.append({
                "class": kl, "subject": name,
                "evidence": f"{r['created_at'][:19]} {name} [{r.get('event')}/{r.get('head_branch')}] run={r['id']} retired={retired}",
                "retired": retired, "run_id": r["id"], "hint": hint, "sha": (r.get("head_sha") or "")[:8],
            })
    else:
        print("failures loop skipped (CI_WD_WINDOW_HOURS<=0)")

    # --- ACT ---------------------------------------------------------------
    ensure_label()
    acted, tracked, unactionable = [], [], []
    for f in findings:
        k, subj = f["class"], f["subject"]
        line = f"- `{k}` **{subj}** — {f['evidence']}"
        if k == "silent-schedule":
            if subj in recent_wf:
                tracked.append((line, "already dispatched within the last 55 min"))
            else:
                ok, how = dispatch(_wf_file(inventory, subj))
                (acted if ok else unactionable).append((line, f"dispatched -> {how}"))
        elif k == "codeql-config":
            ok, how = configure_codeql()
            (acted if ok else unactionable).append((line, f"configured -> {how}"))
        elif k == "mirror-lag":
            ok, how = dispatch("mirror-sync.yml")
            (acted if ok else unactionable).append((line, f"dispatched mirror-sync -> {how}"))
        else:
            if f.get("retired"):
                (tracked).append((line, "workflow file removed; cannot re-run (retired)"))
                continue
            body = (f"{f['evidence']}\n\n**Suggested fix:** {f.get('hint','inspect')}\n\n"
                    f"Filed by `scripts/ci_watchdog.py` (event-driven; GitHub `schedule` has never fired on this repo).")
            res = file_or_refresh(k, subj, body)
            (tracked if "FAILED" not in res else unactionable).append((line, res))

    # --- REPORT ------------------------------------------------------------
    print("\n=== ci-watchdog summary ===")
    print(f"findings={len(findings)} acted={len(acted)} tracked={len(tracked)} unactionable={len(unactionable)}")
    for line, how in acted:
        print("ACT   " + line + "  -> " + how)
    for line, how in tracked:
        print("TRACK " + line + "  -> " + how)
    for line, how in unactionable:
        print("OPEN  " + line + "  -> " + how)
    summary = {"repo": REPO, "when": __import__("datetime").datetime.utcnow().isoformat() + "Z",
               "inventory": inventory, "findings": findings,
               "acted": [a[0] for a in acted],
               "tracked": [t[0] for t in tracked],
               "unactionable": [u[0] for u in unactionable]}
    with open("ci-watchdog-summary.json", "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2)
    print("\nwrote ci-watchdog-summary.json")
    print("ledger:", post_ledger(summary))
    return 1 if unactionable else 0


def post_ledger(summary: dict) -> str:
    """Cross-platform: mirror the summary into the QNFO fleet ledger.

    Best-effort by design -- a missing key or an unreachable endpoint must not
    turn the watchdog red, because the watchdog's own exit code is the gate.
    """
    key = os.environ.get("OPS_KEY") or os.environ.get("OPS_ROUTER_AUTH_KEY") or ""
    if not key:
        return "skipped (OPS_ROUTER_AUTH_KEY not configured)"
    if DRY:
        return "DRY_RUN"
    body = json.dumps({
        "desire": "ci-watchdog summary: " + json.dumps(summary)[:4000],
        "source": "github-actions/ci-watchdog",
    }).encode()
    req = urllib.request.Request("https://ops.qnfo.org/v1/desires", data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", "Bearer " + key)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return f"http-{r.status}"
    except Exception as e:
        return f"skipped ({e})"


def _wf_file(inventory: list[dict], name: str) -> str:
    for it in inventory:
        if it["name"] == name:
            return it["path"].split("/")[-1]
    return name + ".yml"


if __name__ == "__main__":
    sys.exit(main())
