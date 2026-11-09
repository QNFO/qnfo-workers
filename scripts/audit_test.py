import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from audit import extract_claims, claim_findings, loop_findings, pr_findings, tag
assert extract_claims("run `scripts/audit.py` and `.github/workflows/fleet-audit.yml`, not `scripts/<name>.py`") == [".github/workflows/fleet-audit.yml", "scripts/audit.py"]
f = claim_findings({"AGENTS.md": "see `scripts/ghost.py` and `scripts/real.py`"}, lambda c: c == "scripts/real.py")
assert [x["key"] for x in f] == ["AGENTS.md:scripts/ghost.py"] and "test -e" in f[0]["probe"]
assert len(loop_findings([{"number": 1, "labels": [{"name": "loop"}], "body": "no probe"}, {"number": 2, "labels": [{"name": "loop"}], "body": "## Closing probe\nx"}, {"number": 3, "labels": [], "body": ""}])) == 1
assert [x["key"] for x in pr_findings([{"number": 5, "body": "x"}, {"number": 6, "body": "## Self-audit\nok"}, {"number": 7, "body": "", "draft": True}, {"number": 8, "body": "", "user": {"type": "Bot"}}])] == ["PR#5"]
g = tag(loop_findings([{"number": 9, "labels": [{"name": "loop"}], "body": ""}]), "QNFO/other", "QNFO/hub")[0]
assert g["repo"] == "QNFO/other" and "[QNFO/other]" in g["title"] and "--repo QNFO/other" in g["probe"]
h = tag(loop_findings([{"number": 9, "labels": [{"name": "loop"}], "body": ""}]), "QNFO/hub", "QNFO/hub")[0]
assert "[" not in h["title"] and h["repo"] == "QNFO/hub"
import audit
audit.UNREACHABLE.clear()
assert audit.gh_json(["repos/QNFO/this-repo-does-not-exist-8885/issues"]) == [] and audit.UNREACHABLE == ["repos/QNFO/this-repo-does-not-exist-8885/issues"]
print("audit_test ok")


def test_branch_findings():
    import datetime
    now = datetime.datetime(2026, 11, 9, tzinfo=datetime.timezone.utc)
    bs = [{"name": "ccr-old", "date": "2026-10-20T00:00:00Z"}, {"name": "ccr-new", "date": "2026-11-08T00:00:00Z"},
          {"name": "ccr-live", "date": "2026-10-01T00:00:00Z"}, {"name": "feature-x", "date": "2026-01-01T00:00:00Z"}]
    f = audit.branch_findings(bs, {"ccr-live"}, now)
    assert [x["key"] for x in f] == ["branch:ccr-old"], f


def test_repo_findings_reads_every_candidate_branch():
    """Review finding on #9333: only the first 30 candidate branches were dated, so a stale 31st was never reported."""
    branches = [{"name": f"ccr-{i}", "commit": {"sha": f"s{i}"}} for i in range(31)]
    def fake(args):
        a = args[0]
        if "/branches" in a: return branches
        if "/commits/" in a:
            sha = a.rsplit("/", 1)[1]
            return {"commit": {"committer": {"date": "2026-10-01T00:00:00Z" if sha == "s30" else "2099-01-01T00:00:00Z"}}}
        return []
    real = audit.gh_json
    audit.gh_json = fake
    try:
        keys = [f["key"] for f in audit.repo_findings("QNFO/x", "QNFO/x")]
    finally:
        audit.gh_json = real
    assert keys == ["branch:ccr-30"], keys


test_branch_findings()
test_repo_findings_reads_every_candidate_branch()
print("branch_findings ok")
