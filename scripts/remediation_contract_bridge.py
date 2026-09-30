#!/usr/bin/env python3
# REMEDIATION-CONTRACT-BRIDGE-1 (2026-10-01)
"""Bridge the issue backlog to the remediation contract registry.

MEASURED STATE BEFORE THIS FILE (2026-10-01)
  `agent_issues` held 88 open rows. Only 2 of them carried a row in
  `remediation_contracts`. `scripts/remediation-consumer.py` can verify a
  contract, but nothing created one from an issue, so 86 of 88 open issues had
  no verification path at all and the armed auto-close triggers
  (`remediation_verification_autoclose_ins` / `_upd`) could never fire for them.
  Separately 16 of the 21 pre-existing contracts carried prose probes
  ("0 stranded outreach rows"), which the consumer's literal-SELECT guard skips
  by design, so those contracts were inert as well.

WHAT THIS DOES
  1. For every open issue with no contract row, insert a contract. The probe is
     NEVER invented. A machine-executable probe is taken from
     scripts/remediation_probe_map.json when the issue id is mapped; otherwise
     the contract is registered with status='needs-machine-probe' and the probe
     sentinel 'needs-machine-probe'. That status is not 'active', so the consumer
     will not execute it and no pass can be fabricated for it.
  2. Lint active contracts: report every one whose probe is not a literal
     SELECT/WITH. It neither rewrites nor deactivates them. It reports, so a
     later patch can supply a real probe.
  3. Never writes `remediation_verifications`. Verification belongs to the
     consumer; the bridge only makes the gap visible and bounded.

CONTRACT (do not weaken)
  - No probe is ever generated from issue prose. Prose in, sentinel out.
  - At most one contract per issue id; re-running is a no-op (idempotent).
  - Fail-closed: a contract this script cannot equip with a machine-executable
    probe is registered inactive, never active.
  - A mapped probe MUST be a literal SELECT/WITH or it is rejected to sentinel.
"""

import json
import os
import pathlib
import sys
import urllib.request

CF_API = "https://api.cloudflare.com/client/v4"
ACCOUNT = os.environ.get("CF_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID") or ""
TOKEN = (os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN") or "")
DB_NAME = os.environ.get("REMEDIATION_DB", "qnfo-audit")
DB_ID = os.environ.get("D1_DATABASE_ID", "")
MAP_PATH = os.environ.get("REMEDIATION_PROBE_MAP", "scripts/remediation_probe_map.json")
SENTINEL = "needs-machine-probe"
WRITE_KW = (
    "insert into", "update ", "delete from", "drop table", "drop index",
    "alter table", "create table", "create index", "create trigger",
    "attach ", "detach ", "pragma ", "replace into", "vacuum",
)


def log(m):
    sys.stderr.write("[bridge] %s\n" % m)
    sys.stderr.flush()


def _req(method, url, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "qnfo-remediation-bridge/1")
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read().decode("utf-8"))


def resolve_db_id():
    global DB_ID
    if DB_ID:
        return DB_ID
    r = _req("GET", "%s/accounts/%s/d1/database?per_page=100" % (CF_API, ACCOUNT))
    for d in (r.get("result") or []):
        if d.get("name") == DB_NAME:
            DB_ID = d.get("uuid") or d.get("id")
            return DB_ID
    raise RuntimeError("D1 database %r not found" % DB_NAME)


def d1(sql, params=None):
    url = "%s/accounts/%s/d1/database/%s/query" % (CF_API, ACCOUNT, resolve_db_id())
    r = _req("POST", url, {"sql": sql, "params": params or []})
    if not r.get("success"):
        raise RuntimeError("d1 error: %s" % json.dumps(r.get("errors")))
    res = r.get("result") or []
    return (res[0].get("results") or []) if res else []


def is_literal_select(sql):
    """A probe may only be a single literal read-only SELECT/WITH statement."""
    s = (sql or "").strip()
    if not s:
        return False, "empty-probe"
    low = s.lower()
    if not (low.startswith("select") or low.startswith("with")):
        return False, "not-a-select"
    for kw in WRITE_KW:
        if kw in low:
            return False, "write-keyword:%s" % kw.strip()
    body = s.rstrip()
    if body.endswith(";"):
        body = body[:-1]
    if ";" in body:
        return False, "multi-statement"
    return True, "ok"


def load_map():
    p = pathlib.Path(MAP_PATH)
    if not p.exists():
        log("no probe map at %s; every unmapped issue is registered inactive" % MAP_PATH)
        return {}
    try:
        raw = json.loads(p.read_text())
    except Exception as e:  # noqa: BLE001
        log("probe map unparseable (%s); refusing to use it" % e)
        return {}
    out = {}
    for k, v in (raw.get("probes") or {}).items():
        try:
            iid = int(k)
        except Exception:  # noqa: BLE001
            log("probe map key %r is not an issue id; skipped" % k)
            continue
        probe = (v or {}).get("probe") if isinstance(v, dict) else v
        transport = (v or {}).get("transport", "d1-query") if isinstance(v, dict) else "d1-query"
        ok, why = is_literal_select(probe)
        if not ok:
            log("probe map entry %s rejected (%s); registered inactive" % (k, why))
            continue
        out[iid] = {"probe": probe, "transport": transport}
    return out


def main():
    out = {"ok": True, "marker": "REMEDIATION-CONTRACT-BRIDGE-1"}
    if not TOKEN or not ACCOUNT:
        out["ok"] = False
        out["error"] = "CLOUDFLARE_API_TOKEN / CF_ACCOUNT_ID not set"
        print(json.dumps(out))
        return 1

    probe_map = load_map()
    out["probe_map_entries"] = len(probe_map)
    open_rows = d1("SELECT id, title, priority FROM agent_issues WHERE status = 'open'")
    have = {r["issue_id"] for r in d1(
        "SELECT DISTINCT issue_id FROM remediation_contracts WHERE issue_id IS NOT NULL")}
    out["open_issues"] = len(open_rows)
    out["with_contract_before"] = len([r for r in open_rows if r["id"] in have])

    inserted_active = 0
    inserted_sentinel = 0
    for r in open_rows:
        iid = r["id"]
        if iid in have:
            continue
        entry = probe_map.get(iid)
        if entry:
            probe, transport, status = entry["probe"], entry["transport"], "active"
            inserted_active += 1
        else:
            probe, transport, status = SENTINEL, "d1-query", SENTINEL
            inserted_sentinel += 1
        d1(
            "INSERT INTO remediation_contracts "
            "(class, issue_id, precondition, action, verify_probe, verify_transport, "
            " max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, "
            " next_due_at, max_items, attempts) "
            "VALUES (?, ?, ?, ?, ?, ?, 3, 'qnfo-ops', 6, ?, 'issue-contract-bridge', 30000, "
            " datetime('now'), 1, 0)",
            ["issue-%d" % iid, iid, "issue open: %s" % str(r.get("title"))[:120],
             "remediate then verify with a machine-executable probe",
             probe, transport, status],
        )
    out["inserted_active"] = inserted_active
    out["inserted_needs_machine_probe"] = inserted_sentinel

    active = d1("SELECT class, issue_id, verify_probe FROM remediation_contracts WHERE status = 'active'")
    prose = []
    for c in active:
        ok, why = is_literal_select(c.get("verify_probe"))
        if not ok:
            prose.append({"class": c.get("class"), "issue_id": c.get("issue_id"), "reason": why})
    out["active_contracts"] = len(active)
    out["active_with_executable_probe"] = len(active) - len(prose)
    out["active_with_prose_probe"] = len(prose)
    out["prose_probe_contracts"] = prose[:40]

    sent = d1("SELECT COUNT(*) AS n FROM remediation_contracts WHERE status = ?", [SENTINEL])
    out["contracts_needs_machine_probe"] = (sent[0]["n"] if sent else None)
    # The residual gap: open issues that still cannot be machine-verified.
    gap = d1(
        "SELECT i.id, i.priority FROM agent_issues i "
        "LEFT JOIN remediation_contracts c ON c.issue_id = i.id AND c.status = 'active' "
        "WHERE i.status = 'open' AND c.issue_id IS NULL")
    out["open_issues_without_active_contract"] = len(gap)
    out["residual_gap_ids"] = [g["id"] for g in gap][:60]
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "marker": "REMEDIATION-CONTRACT-BRIDGE-1",
                          "error": str(exc)[:500]}))
        sys.exit(0)
