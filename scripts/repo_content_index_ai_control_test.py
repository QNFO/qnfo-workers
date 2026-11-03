import unittest
from unittest.mock import patch

import repo_content_index as index


class EmergencyControlTest(unittest.TestCase):
    def test_check_precedes_each_embedding_and_resume_has_no_replay(self):
        calls = []
        state = {"paused": 0, "revision": 1}

        def http(url, *_args, **_kwargs):
            calls.append(url)
            if "/d1/database/" in url:
                return 200, {"success": True, "result": [{"results": [dict(state)]}]}
            return 200, {"result": {"data": [[0.1]]}}

        with patch.object(index, "http", http):
            self.assertEqual(index.embed("account", "token", ["text"])[0], [[0.1]])
            state.update(paused=1, revision=2)
            self.assertEqual(index.embed("account", "token", ["text"])[1], "ai_paused: embeddings refused")
            self.assertEqual(sum("/ai/run/" in url for url in calls), 1)
            state.update(paused=0, revision=3)
            self.assertEqual(index.embed("account", "token", ["text"])[0], [[0.1]])
            self.assertEqual(sum("/ai/run/" in url for url in calls), 2)
            self.assertEqual(sum("/d1/database/" in url for url in calls), 3)

    def test_unavailable_or_uninitialized_state_never_dispatches(self):
        for result in [(0, {"error": "offline"}), (200, {"success": False}),
                       (200, {"success": True, "result": [{"results": []}]})]:
            with self.subTest(result=result), patch.object(index, "http", return_value=result) as http:
                self.assertIn("ai_control_unavailable", index.embed("account", "token", ["text"])[1])
                self.assertEqual(http.call_count, 1)


if __name__ == "__main__":
    unittest.main()
