#!/usr/bin/env python3
"""render_backlog.py -- render docs/QUNIVERSE-BACKLOG.md from docs/backlog/*.json.

The backlog's system of record is qnfo-audit (agent_issues for defects,
roadmap_implementation for build-outs and the fleet-lessons gate audit). The JSON
file is the reviewed snapshot that was filed there; this script renders it into a
readable document so the repo carries the same picture as the registers.

usage: python3 scripts/render_backlog.py [docs/backlog/quniverse-backlog-2026-09-30.json]
"""
from __future__ import annotations

import collections
import json
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else "docs/backlog/quniverse-backlog-2026-09-30.json"
OUT = "docs/QUNIVERSE-BACKLOG.md"

AREA_TITLES = {
    "autonomy": "Autonomy gaps (mission, VSM, OODA)",
    "cost": "Cost and efficiency (paper 6.3)",
    "core": "Smaller verified core (paper 6.1)",
    "impact": "Funnel, distribution and external impact (paper 6.5, business plan)",
    "research-product": "Research products and the original program visions",
    "web": "Sites, archive and repositories",
    "security": "Security",
    "observability": "Observability and platform adoption",
    "personal": "Owner surfaces",
    "governance": "Governance and closure",
}


def cell(s: str) -> str:
    return str(s).replace("|", "\\|").replace("\n", " ")


def main() -> int:
    d = json.load(open(SRC))
    ids = d.get("filed_issue_ids", {})
    L: list[str] = []
    L.append("# Quniverse fleet backlog")
    L.append("")
    L.append(f"Compiled {d['generated']}. Generated from `{SRC}` by `scripts/render_backlog.py`; do not edit by hand.")
    L.append("")
    L.append(f"**Mission.** {d['mission']}")
    L.append("")
    L.append("**Where it lives.** Defects are open rows in `qnfo-audit.agent_issues` "
             "(source `backlog-mining-2026-09-30`, each with an owner, SLA and definition of done in `issue_triage`). "
             "Build-outs and the fleet-lessons gate audit are rows in `qnfo-audit.roadmap_implementation`. "
             "Pre-existing open issues were not re-filed; they are mapped in section 5.")
    L.append("")
    rm = d["roadmap"]
    st = collections.Counter(r["status"] for r in rm)
    gst = collections.Counter(g[2] for g in d["paper_gate_audit"])
    L.append("## Summary")
    L.append("")
    L.append(f"- New open issues filed: **{len(d['issues'])}** (agent_issues {min(ids.values(), default=0)}-{max(ids.values(), default=0)}).")
    L.append(f"- Roadmap build-outs: **{len(rm)}** (" + ", ".join(f"{k} {v}" for k, v in sorted(st.items())) + ").")
    L.append(f"- Fleet-lessons failure ledger audited: **{len(d['paper_gate_audit'])}** entries (" + ", ".join(f"{k} {v}" for k, v in sorted(gst.items())) + ").")
    L.append(f"- Pre-existing open issues mapped: **{len(d.get('existing_open_snapshot', []))}**.")
    L.append("")
    vsm = collections.Counter(r["vsm"] for r in rm)
    ooda = collections.Counter(r["ooda"] for r in rm)
    L.append("Roadmap coverage by VSM system: " + ", ".join(f"{k} {v}" for k, v in sorted(vsm.items())) +
             ". By OODA stage: " + ", ".join(f"{k} {v}" for k, v in sorted(ooda.items())) + ".")
    L.append("")

    L.append("## 1. New open issues (not built, not working, or not autonomous)")
    L.append("")
    L.append("| # | Issue | Priority | Owner | VSM | Definition of done |")
    L.append("|---|---|---|---|---|---|")
    for i in d["issues"]:
        L.append(f"| {ids.get(i['key'], '')} | **{i['key']}**: {cell(i['evidence'])} | {i['priority']} | {i['owner']} | {i['vsm']} | {cell(i['dod'])} |")
    L.append("")

    L.append("## 2. Roadmap build-outs")
    L.append("")
    by_area: dict[str, list] = collections.defaultdict(list)
    for r in rm:
        by_area[r["area"]].append(r)
    n = 2
    for area in AREA_TITLES:
        rows = by_area.get(area)
        if not rows:
            continue
        L.append(f"### {n}.{list(AREA_TITLES).index(area) + 1} {AREA_TITLES[area]}")
        L.append("")
        L.append("| Item | Status | VSM / OODA | Owner | Build-out | Source |")
        L.append("|---|---|---|---|---|---|")
        for r in rows:
            L.append(f"| {r['item']} | {r['status']} | {r['vsm']} / {r['ooda']} | {r['owner']} | {cell(r['title'])} | {cell(r['source'])} |")
        L.append("")

    L.append("## 3. Fleet-lessons failure ledger: gate status")
    L.append("")
    L.append("Each ledger entry in the paper names a remedy that became a standing gate. Status as audited on "
             f"{d['generated']}: `enforced-verified` (observed holding), `enforced-partial`, `enforced-unverified` "
             "(exists, never proven), `violated` (currently breached), `violated-remediated` (breached and fixed this cycle), "
             "`local-only` (runs only on the local machine, so not yet a cloud gate), `open`.")
    L.append("")
    L.append("| Entry | Remedy / gate | Status | Evidence |")
    L.append("|---|---|---|---|")
    for g in d["paper_gate_audit"]:
        L.append(f"| {g[0]} | {cell(g[1])} | {g[2]} | {cell(g[3])} |")
    L.append("")

    L.append("## 4. Decisions only the owner can make")
    L.append("")
    for r in rm:
        if r["status"] == "owner-decision":
            L.append(f"- **{r['item']}**: {r['title']}")
    for i in d["issues"]:
        if "identity-bound" in i["evidence"]:
            L.append(f"- **{i['key']}** (#{ids.get(i['key'], '')}): coordinated credential rotation; the Cloudflare token rotation is identity-bound.")
    L.append("- Pre-existing owner-gated issues: #1277 (Cloudflare Access), #1279 (CASB), #1468 (qnfo-cloud-ops secrets), "
             "#1477 (alerts mailbox), #1517 (lifecycle.qnfo.org DNS), #1616 (payment rail).")
    L.append("")

    L.append("## 5. Pre-existing open issues (not re-filed)")
    L.append("")
    grp: dict[str, list] = collections.defaultdict(list)
    for e in d.get("existing_open_snapshot", []):
        grp[e["category"]].append(e)
    for cat in sorted(grp):
        L.append(f"- **{cat}**: " + "; ".join(f"#{e['id']} {e['key']}" for e in grp[cat]))
    L.append("")

    cc = d.get("concurrent_compilation")
    if cc:
        L.append("## 6. Reconciliation with the concurrent compilation")
        L.append("")
        L.append(f"`{cc['path']}`: {cc['note']}")
        L.append("")
    L.append("## 7. Sources mined")
    L.append("")
    for s in d["sources_mined"]:
        L.append(f"- {s}")
    L.append("")
    open(OUT, "w").write("\n".join(L))
    print(f"wrote {OUT}: {len(L)} lines")
    return 0


if __name__ == "__main__":
    sys.exit(main())
