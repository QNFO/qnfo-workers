"""ULTRASTABLE-CLAIMS-1: every product claim probe, as stored after the migrations, passes the remediation consumer's own read-only guard.

Live defect 2026-11-10: four probes carried "; " in a detail string and every runner refused them as multi-statement.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import remediation_consumer as rc  # noqa: E402

GUARD = rc.is_literal_select

sql = (ROOT / "migrations/2026-11-10-ultrastable-claims.sql").read_text()
rows = re.findall(r"INSERT OR REPLACE INTO product_claims \(id, product, sort, claim, probe_sql, evidence_note\) VALUES \('([^']+)', 'ultrastable', \d+, '(?:[^']|'')*', '((?:[^']|'')*)'", sql)
assert len(rows) == 7, len(rows)
fix = (ROOT / "migrations/2026-11-10-ultrastable-claims-semicolon.sql").read_text()
assert "replace(probe_sql, '; ', ', ')" in fix
bad = []
for cid, probe in rows:
    stored = probe.replace("''", "'").replace("; ", ", ")
    ok, why = GUARD(stored)
    if not ok:
        bad.append((cid, why))
assert not bad, bad
print("product claim probes pass the consumer guard:", len(rows))
