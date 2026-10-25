#!/usr/bin/env python3
"""Offline tests for the shared Cloudflare HTTP helper and its existing clients."""

import io
import os
import sys
import unittest
import urllib.error
from unittest.mock import patch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from artifacts_git_mirror import http as artifacts_http
from cloudflare_http import request_json
from repo_content_index import http as index_http


class CloudflareHttpTests(unittest.TestCase):
    def test_json_request_encodes_body_and_preserves_response(self):
        response = io.BytesIO(b'{"ok":true}')
        response.status = 201
        response.__enter__ = lambda: response
        response.__exit__ = lambda *args: None
        with patch("urllib.request.urlopen", return_value=response) as urlopen:
            result = request_json(
                "https://api.example.test/resource",
                "test-token",
                "POST",
                {"value": 1},
                timeout=12,
                user_agent="test-agent/1.0",
            )

        self.assertEqual((201, {"ok": True}), result)
        request, = urlopen.call_args.args
        self.assertEqual(b'{"value": 1}', request.data)
        self.assertEqual("Bearer test-token", request.get_header("Authorization"))
        self.assertEqual("application/json", request.get_header("Content-type"))
        self.assertEqual("test-agent/1.0", request.get_header("User-agent"))
        self.assertEqual(12, urlopen.call_args.kwargs["timeout"])

    def test_empty_json_response_returns_empty_object(self):
        response = io.BytesIO(b"")
        response.status = 204
        response.__enter__ = lambda: response
        response.__exit__ = lambda *args: None
        with patch("urllib.request.urlopen", return_value=response):
            self.assertEqual((204, {}), request_json("https://api.example.test/empty", "test-token"))

    def test_raw_response_returns_bytes(self):
        response = io.BytesIO(b"\x00\xff")
        response.status = 200
        response.__enter__ = lambda: response
        response.__exit__ = lambda *args: None
        with patch("urllib.request.urlopen", return_value=response):
            self.assertEqual((200, b"\x00\xff"), request_json("https://api.example.test/blob", "test-token", raw=True))

    def test_http_errors_decode_json_and_truncate_non_json(self):
        error = urllib.error.HTTPError(
            "https://api.example.test/error", 403, "Forbidden", {}, io.BytesIO(b'{"error":"denied"}')
        )
        with patch("urllib.request.urlopen", side_effect=error):
            self.assertEqual((403, {"error": "denied"}), request_json("https://api.example.test/error", "test-token"))

        error = urllib.error.HTTPError(
            "https://api.example.test/error", 502, "Bad Gateway", {}, io.BytesIO(b"x" * 400)
        )
        with patch("urllib.request.urlopen", side_effect=error):
            status, body = request_json("https://api.example.test/error", "test-token")
        self.assertEqual(502, status)
        self.assertEqual({"raw": "x" * 300}, body)

    def test_transport_errors_return_status_zero(self):
        with patch("urllib.request.urlopen", side_effect=OSError("offline")):
            self.assertEqual((0, {"error": "offline"}), request_json("https://api.example.test", "test-token"))

    def test_existing_clients_keep_timeout_and_user_agent(self):
        response = io.BytesIO(b"{}")
        response.status = 200
        response.__enter__ = lambda: response
        response.__exit__ = lambda *args: None
        with patch("urllib.request.urlopen", return_value=response) as urlopen:
            artifacts_http("https://api.example.test/a", "test-token")
            index_http("https://api.example.test/b", "test-token")

        self.assertEqual([60, 90], [call.kwargs["timeout"] for call in urlopen.call_args_list])
        self.assertEqual(
            ["qnfo-artifacts-git-mirror/1.0", "qnfo-repo-content-index/1.0"],
            [call.args[0].get_header("User-agent") for call in urlopen.call_args_list],
        )


if __name__ == "__main__":
    unittest.main()
