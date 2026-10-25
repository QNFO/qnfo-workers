"""Shared bearer-authenticated HTTP transport for Cloudflare API scripts."""

import json
import urllib.error
import urllib.request


def request_json(url, token, method="GET", body=None, timeout=60, raw=False, user_agent="qnfo-cloudflare-script/1.0"):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", user_agent)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            payload = response.read()
            if raw:
                return response.status, payload
            return response.status, (json.loads(payload.decode("utf-8", "replace")) if payload else {})
    except urllib.error.HTTPError as error:
        response_body = error.read().decode("utf-8", "replace")
        try:
            return error.code, json.loads(response_body)
        except Exception:
            return error.code, {"raw": response_body[:300]}
    except Exception as error:
        return 0, {"error": str(error)}
