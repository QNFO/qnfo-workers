#!/usr/bin/env python3
"""PUBLISH-CLAIM-TRIGGER-COUNT-1: atomic publisher ownership despite D1 trigger-inclusive meta.changes.

Run: python3 scripts/code_task_publish_claim_test.py
Uses real SQLite updates/triggers, including two connections racing on the same task.
"""
import concurrent.futures
import importlib.util
import json
import os
import sqlite3
import tempfile
import threading
import unittest
from unittest.mock import patch

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("code_task_publish", os.path.join(HERE, "code-task-publish.py"))
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)

TRIGGER = """
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);
INSERT INTO metric_registry (metric) VALUES ('owner_queue_live_open');
CREATE VIEW v_owner_queue_live AS SELECT id FROM code_tasks WHERE status='publishing';
CREATE TRIGGER owner_queue_live_metric_ct_upd AFTER UPDATE OF status ON code_tasks
WHEN COALESCE(OLD.status,'') <> COALESCE(NEW.status,'')
BEGIN
  UPDATE metric_registry SET last_value=CAST((SELECT COUNT(*) FROM v_owner_queue_live) AS TEXT),
    last_refreshed=strftime('%Y-%m-%dT%H:%M:%SZ','now'), state='MEASURED'
    WHERE metric='owner_queue_live_open';
END;
"""


def fixture(path=":memory:"):
    db = sqlite3.connect(path)
    db.execute(P.DDL)
    db.executescript(TRIGGER)
    return P.SqliteD1Store(db)


def add_task(store, tid="ct_claim0000001", status="ready_to_publish", updated=None):
    store.changes(
        "INSERT INTO code_tasks (id,repo,path,goal,status,ctx,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
        [tid, P.REPO_NAME, "scripts/x.py", "claim fixture", status, "{}", P.now(), updated or P.now()])
    return store.rows("SELECT * FROM code_tasks WHERE id=?", [tid])[0]


class ClaimTests(unittest.TestCase):
    def setUp(self):
        self.store = fixture()
        self.addCleanup(self.store.db.close)

    def test_original_false_loser_reproduced(self):
        task = add_task(self.store)
        n = self.store.changes(
            "UPDATE code_tasks SET status='publishing', updated_at=? WHERE id=? AND status='ready_to_publish'",
            [P.now(), task["id"]])
        self.assertEqual(n, 2)
        self.assertNotEqual(n, 1, "the old claim returned False after actually taking ownership")
        self.assertEqual(self.store.rows("SELECT status FROM code_tasks")[0]["status"], "publishing")

    def test_ready_winner_and_same_second_loser(self):
        task = add_task(self.store)
        before = self.store.db.total_changes
        with patch.object(P, "now", return_value="2026-10-25T20:00:00.000Z"), \
                patch.object(P, "ago", return_value="2026-10-25T19:30:00.000Z"):
            self.assertTrue(P.claim(self.store, task))
            self.assertFalse(P.claim(self.store, task))
        self.assertEqual(self.store.db.total_changes - before, 2)
        self.assertEqual(self.store.rows("SELECT last_value FROM metric_registry")[0]["last_value"], "1")

    def test_stale_retry_wins_once(self):
        task = add_task(self.store, status="publishing", updated=P.ago(P.STALE_PUBLISHING_MIN + 1))
        self.assertIn(task["id"], [t["id"] for t in P.list_ready(self.store)])
        self.assertTrue(P.claim(self.store, task))
        self.assertFalse(P.claim(self.store, task))

    def test_fresh_boundary_missing_and_ineligible_lose(self):
        cutoff = P.ago(P.STALE_PUBLISHING_MIN)
        with patch.object(P, "ago", return_value=cutoff):
            for i, status in enumerate(("publishing", "queued", "published", "merged", "closed", "publish_failed")):
                task = add_task(self.store, tid=f"ct_ineligible{i}", status=status, updated=cutoff)
                self.assertFalse(P.claim(self.store, task), status)
            self.assertFalse(P.claim(self.store, {"id": "missing"}))
        self.assertIsNone(self.store.rows("SELECT last_value FROM metric_registry")[0]["last_value"])

    def test_without_triggers(self):
        self.store.db.execute("DROP TRIGGER owner_queue_live_metric_ct_upd")
        task = add_task(self.store)
        self.assertTrue(P.claim(self.store, task))
        self.assertFalse(P.claim(self.store, task))

    def test_publisher_continues_after_claim_and_normal_stale_retry(self):
        for status in ("ready_to_publish", "publishing"):
            task = add_task(self.store, tid=f"ct_{status}", status=status,
                            updated=P.ago(P.STALE_PUBLISHING_MIN + 1))
            logs = []
            with patch.object(P, "publish_one", return_value=("branch_pushed", "https://example.test/compare", None, None)) as publish:
                result = P.publish_all(self.store, ".", "main", None, log=logs.append, delegate=True)
                self.assertEqual(result, {"published": 1, "failed": 0, "skipped": 0})
                self.assertEqual(publish.call_args.args[0]["id"], task["id"])
                self.assertEqual(publish.call_count, 1)
            self.assertFalse(any("claimed by another run" in line for line in logs), logs)
            self.assertEqual(self.store.rows("SELECT status FROM code_tasks WHERE id=?", [task["id"]])[0]["status"],
                             "branch_pushed")
            # PUBLISH-LANE-SERIAL-1: both iterations use one path, so the first change must merge before the second may publish
            self.store.changes("UPDATE code_tasks SET status='merged' WHERE id=?", [task["id"]])

    def test_two_connections_one_winner(self):
        with tempfile.TemporaryDirectory(prefix="ctp-claim-") as root:
            path = os.path.join(root, "claims.sqlite")
            store = fixture(path)
            task = add_task(store)
            store.db.close()
            barrier = threading.Barrier(2)

            def contender():
                db = sqlite3.connect(path, timeout=10)
                try:
                    contender_store = P.SqliteD1Store(db)
                    barrier.wait(timeout=10)
                    return P.claim(contender_store, task)
                finally:
                    db.close()

            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: contender(), range(2)))
            self.assertEqual(sorted(results), [False, True])
            db = sqlite3.connect(path)
            try:
                self.assertEqual(db.execute("SELECT last_value FROM metric_registry").fetchone()[0], "1")
                self.assertEqual(db.execute("SELECT status FROM code_tasks").fetchone()[0], "publishing")
            finally:
                db.close()

    def test_d1_returns_direct_row_not_trigger_change_count(self):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return json.dumps({"success": True, "result": [
                    {"results": [{"id": "ct_d1"}], "meta": {"changes": 2}}]}).encode()

        with patch.dict(os.environ, {"CF_ACCOUNT_ID": "fixture", "CLOUDFLARE_API_TOKEN": "fixture"}), \
                patch.object(P.urllib.request, "urlopen", return_value=Response()) as request:
            self.assertTrue(P.claim(P.D1Store(), {"id": "ct_d1"}))
            sql = json.loads(request.call_args.args[0].data)["sql"]
            self.assertTrue(sql.endswith("RETURNING id"))
            self.assertEqual(request.call_count, 1)

    def test_uncertain_write_is_not_retried_or_assumed_owned(self):
        with patch.dict(os.environ, {"CF_ACCOUNT_ID": "fixture", "CLOUDFLARE_API_TOKEN": "fixture"}), \
                patch.object(P.urllib.request, "urlopen", side_effect=TimeoutError("uncertain claim")) as request:
            with self.assertRaises(TimeoutError):
                P.claim(P.D1Store(), {"id": "ct_uncertain"})
            self.assertEqual(request.call_count, 1)


if __name__ == "__main__":
    unittest.main()
