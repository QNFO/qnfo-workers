#!/usr/bin/env python3
"""PRODUCT-ANSWER-1 offline test: the hourly step files one issue per v_product_answers_unfiled row, and is idempotent.
Run: python3 scripts/product_answers_sweep_test.py"""
import os
import re
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("CLOUDFLARE_ACCOUNT_ID", "acct")
os.environ.setdefault("CLOUDFLARE_API_TOKEN", "tok")
import remediation_consumer as rc  # noqa: E402

db = sqlite3.connect(":memory:")
db.row_factory = sqlite3.Row
db.executescript("""
CREATE TABLE owner_asks (id INTEGER PRIMARY KEY, kind, question, answer, answer_label, answered_at);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title, description, source, category, priority, status, created_at, updated_at);
INSERT INTO owner_asks VALUES (1,'product-pilots','Which pilot?','yes','Yes, paying users','t'),
 (2,'product-name','Name?','unsure',NULL,'t'), (3,'other-kind','x','y',NULL,'t'), (4,'product-open','q',NULL,NULL,NULL);
""")
# the view exactly as in migrations/2026-11-10-ultrastable-product.sql
sql = open(os.path.join(rc.REPO_ROOT, "migrations", "2026-11-10-ultrastable-product.sql"), encoding="utf8").read()
view = re.search(r"CREATE VIEW IF NOT EXISTS v_product_answers_unfiled AS.*?;", sql, re.S).group(0)
db.execute(view)


def q(sql, params=None):
    cur = db.execute(re.sub(r"\?(\d)", r"?\1", sql), params or [])
    return [dict(r) for r in cur.fetchall()]


out = {}
r = rc.product_answers_sweep(out, q)
assert r == {"unfiled": 1, "filed": 1}, r
rows = q("SELECT title, description FROM agent_issues")
assert len(rows) == 1 and rows[0]["title"].startswith("PRODUCT-ANSWER-1: product-pilots answered"), rows
assert "code-task: repo=qnfo-workers path=docs/PRODUCT-ULTRASTABLE.md" in rows[0]["description"]
r2 = rc.product_answers_sweep(out, q)
assert r2["unfiled"] == 0 and len(q("SELECT * FROM agent_issues")) == 1, r2
bad = rc.product_answers_sweep({}, lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
assert "boom" in bad["error"]
print("ok   product answers sweep files once per row, idempotent, never raises")
