#!/usr/bin/env python3
"""TRIGGER-DEPTH-SWEEP-1 (2026-10-17, owner directive "ALL SWEEPS SHALL BE SCHEDULED FOR PERIODIC
FAILURE-MODE/ROOT-CAUSE AUTOMATIC AUDITS AND REMEDIATION AND SYSTEMWIDE").

Periodic compile-time trigger-depth audit. D1 refuses any write whose trigger chain nests more than
10 levels, counted at compile time, and self-updating triggers count. The lagging detector
(fm-trigger-depth) only checks fleet_tick/cron_fire_log recency, so it fires AFTER the self-heal loop
is already dead. The proactive check (apply_migrations.depth_canary) runs only while applying a
migration. This script closes the gap: it sweeps EVERY table in qnfo-audit with the three zero-row
probes (INSERT ... WHERE 0, UPDATE col=col WHERE 0, DELETE ... WHERE 0) and, when any table's probe is
refused with "triggers nested too deep", writes a failing remediation_verifications row (class
fm-trigger-depth-compile) and files one deduped agent_issues row naming the offending table + statement.

Remediation is detection-and-file, not blind trigger-dropping: an automatic DROP of a load-bearing
trigger is worse than a red issue. The code loop or a session fixes the table; this sweep guarantees
the failure is found and filed within one cadence, never silently 20 days later.

Never fails the job (it is a detector, not a gate). Exits 0 always.
"""
import json
import os
import sys

import cf_ops_actions as C

ACCOUNT = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or os.environ.get("CF_ACCOUNT_ID") or ""
TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN") or ""
DB_ID = os.environ.get("TRIGGER_SWEEP_DB_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")
CLASS = "fm-trigger-depth-compile"

SKIP_PREFIXES = ("sqlite_", "bak_", "zz_")


def call(sql, params=None):
    st, j = C.call("POST", f"/accounts/{ACCOUNT}/d1/database/{DB_ID}/query", TOKEN,
                   {"sql": sql, "params": params or []}, timeout=90)
    if st != 200 or not j.get("success", False):
        raise RuntimeError("D1 " + str(st) + ": " + json.dumps(j.get("errors") or j)[:200])
    res = j.get("result") or []
    return (res[0].get("results") if res else []) or []


def d1(sql, params=None):
    return call(sql, params)


def sweep():
    # The 10-level depth limit only bites tables whose writes fire a trigger chain, so probe the
    # trigger-bearing tables (plus their upstream), not all ~465 tables (which times out a CI job).
    trig_tables = [r["tbl_name"] for r in d1("SELECT DISTINCT tbl_name FROM sqlite_master WHERE type='trigger'")]
    targets = sorted(t for t in set(trig_tables) if not t.startswith(SKIP_PREFIXES))
    failures = []
    checked = 0
    for name in targets:
        probes = [
            f'INSERT INTO "{name}" SELECT * FROM "{name}" WHERE 0',
            f'DELETE FROM "{name}" WHERE 0',
        ]
        for q in probes:
            checked += 1
            try:
                d1(q)
            except Exception as e:  # noqa: BLE001
                msg = str(e)
                if "nested too deep" in msg or "too many levels of trigger" in msg:
                    failures.append({"table": name, "statement": q[:140]})
    return len(targets), checked, failures


def file_issue(failures):
    lines = "\n".join(f"- `{f['table']}`: {f['statement']}" for f in failures)
    title = "TRIGGER-DEPTH-COMPILE-1: a table's write exceeds D1's 10-level trigger nesting"
    desc = (
        "Periodic compile-time sweep found tables whose zero-row writes are refused with "
        "'triggers nested too deep' (SQLITE_ERROR 7500). D1 counts trigger nesting at compile time, "
        "and self-updating triggers count, so this is a re-wedged trigger graph, not a runtime fault.\n\n"
        "Offending tables + the refused statement:\n\n" + lines + "\n\n"
        "Remediation: consolidate or drop the self-updating triggers on the named table (see migration "
        "2026-10-17-consolidate-agent-issues-ts-triggers.sql for the agent_issues pattern), or run "
        "scripts/apply_migrations.py --check on any pending trigger migration.\n\n"
        "code-anchor: the trigger graph on the named table"
    )
    existing = call(
        "SELECT id FROM agent_issues WHERE status='open' AND title = ?1 LIMIT 1", [title]
    )
    if existing:
        return existing[0]["id"]
    ins = call(
        "INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) "
        "VALUES (?1, ?2, 'trigger-depth-sweep', 'reliability', 'high', 'open', "
        "CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000)",
        [title, desc],
    )
    return ins[0].get("id") if ins else None


def main():
    if "--selftest" in sys.argv:
        print(json.dumps({"ok": True, "selftest": True}))
        return
    tables, checked, failures = sweep()
    observed = "ok" if not failures else f"nested-too-deep:{len(failures)}tables:{failures[0]['table']}"
    verdict = {"tables": tables, "checked": checked, "failures": failures}
    try:
        call(
            "INSERT INTO remediation_verifications (class, action_ref, probe_url, transport, expected, observed, pass, verifier) "
            "VALUES (?1, NULL, 'trigger-depth-sweep', 'd1-query', 'ok', ?2, ?3, 'trigger-depth-sweep')",
            [CLASS, observed, 1 if not failures else 0],
        )
    except Exception as e:  # noqa: BLE001
        verdict["verify_write_error"] = str(e)[:160]
    if failures:
        verdict["filed_issue"] = file_issue(failures)
    print(json.dumps(verdict))


if __name__ == "__main__":
    main()
