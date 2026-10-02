#!/usr/bin/env python3
"""ci_watchdog_gate.py - CI-WATCHDOG-RATE-GATE-1 (2026-10-02): decide whether this ci-watchdog run sweeps.

WHY
  ci-watchdog hangs off workflow_run for eight workflows, and every run of scripts/ci_watchdog.py sweeps the whole
  repository: one runs call per workflow (about 80 of them), the CodeQL setup probe, recent failures and log fetches,
  roughly 80 GitHub API calls whatever triggered it. Measured 2026-10-02 08:28-09:07Z: 175 ci-watchdog runs in 40
  minutes (about 120 of them for pull-request runs of mirror-guard, version-compare, deploy-gate,
  adversarial-workers-guard and code-loop-test), about 14,000 API calls against the 1,000 per hour the Actions token
  gets per repository. Every other API user then failed with "API rate limit exceeded for installation", among them
  CodeQL's SARIF upload, which failed 36 times on main that morning.

WHAT
  A sweep already covers everything, so a sweep shortly after another adds nothing. This gate makes NO GitHub API call:
  the time of the last sweep comes from the Actions cache (restored by the workflow into .ci-watchdog-last-sweep).
    sweep when the run is not a workflow_run (dispatch, repository_dispatch)
    sweep when the triggering run did not succeed (failure, timed_out, startup_failure, action_required)
    sweep when no previous sweep time is known, or it is unreadable
    sweep when the last sweep is at least CI_WD_MIN_INTERVAL_MIN minutes old (default 10)
    otherwise skip: a sweep finished minutes ago and the trigger brought no failure
  Writes sweep=true|false to $GITHUB_OUTPUT and prints the reason.
"""
import datetime as dt
import os
import sys

MARKER = os.environ.get("CI_WD_MARKER", ".ci-watchdog-last-sweep")
NEEDS_SWEEP = {"failure", "timed_out", "startup_failure", "action_required"}


def decide(event, conclusion, marker_text, now, min_interval_min):
    if event != "workflow_run":
        return True, f"event {event or 'unknown'} always sweeps"
    if (conclusion or "") in NEEDS_SWEEP:
        return True, f"triggering run concluded {conclusion}"
    try:
        last = dt.datetime.fromisoformat(marker_text.strip().replace("Z", "+00:00"))
        if last.tzinfo is None:
            last = last.replace(tzinfo=dt.timezone.utc)
    except Exception:
        return True, "no readable previous sweep time"
    age_min = (now - last).total_seconds() / 60
    if age_min >= min_interval_min:
        return True, f"last sweep {age_min:.1f} min ago (>= {min_interval_min:g})"
    return False, f"last sweep {age_min:.1f} min ago (< {min_interval_min:g}) and the trigger concluded {conclusion or 'unknown'}"


def main() -> int:
    try:
        text = open(MARKER, encoding="utf-8").read()
    except Exception:
        text = ""
    try:
        interval = float(os.environ.get("CI_WD_MIN_INTERVAL_MIN", "10"))
    except ValueError:
        interval = 10.0
    sweep, why = decide(os.environ.get("TRIGGER_EVENT", ""), os.environ.get("TRIGGER_CONCLUSION", ""), text,
                        dt.datetime.now(dt.timezone.utc), interval)
    print(f"ci-watchdog gate: sweep={'true' if sweep else 'false'} ({why})")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            fh.write(f"sweep={'true' if sweep else 'false'}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
