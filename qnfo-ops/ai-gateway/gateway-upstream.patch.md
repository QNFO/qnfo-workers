# ops-exec upstream rewire: api.deepseek.com -> AI Gateway

Target file: `qnfo-ops/worker.js`. Deploy only after gateway credits + BYOK are in place
(see `docs/AI-GATEWAY-SINGLE-ENDPOINT-2026-09-16.md` §9).

## 1. Constants (line ~37)

```diff
-var DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
+// SINGLE-ENDPOINT-1 (2026-09-16): all model traffic leaves through one AI Gateway URL.
+// Auth is the Cloudflare AI Gateway token (cf-aig-authorization), not a provider key.
+// Direct DeepSeek is retained ONLY as a last-resort fallback if the gateway fails
+// non-2xx after its own retries (see docs §8.4: the gateway must not be a single
+// point of failure for the ops loop).
+var GW_COMPAT = "https://gateway.ai.cloudflare.com/v1/edb167b78c9fb901ea5bca3ce58ccc4b/default/compat/chat/completions";
+var DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
 var UPSTREAM_MODEL = "deepseek-v4-flash";
+var UPSTREAM_ROUTE = "dynamic/qnfo-agentic";
```

`UPSTREAM_MODEL` stays as the model name sent to the gateway for the relay path;
agentic rounds send `UPSTREAM_ROUTE` so the ladder (not this worker) picks the model.

## 2. Request headers

Every upstream call gains the gateway auth header and routing metadata.

```diff
-  const upBody = { model: UPSTREAM_MODEL, messages: truncateToContext(work, MODEL_CTX - answerCap - 8192), max_tokens: answerCap, temperature, top_p: topP, stream: true, stream_options: { include_usage: true } };
-  const up = await fetch(DEEPSEEK_URL, {
-    method: "POST",
-    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.DEEPSEEK_API_KEY },
-    body: JSON.stringify(upBody)
-  });
+  const upBody = { model: UPSTREAM_ROUTE, messages: truncateToContext(work, MODEL_CTX - answerCap - 8192), max_tokens: answerCap, temperature, top_p: topP, stream: true, stream_options: { include_usage: true } };
+  const up = await fetch(GW_COMPAT, {
+    method: "POST",
+    headers: {
+      "Content-Type": "application/json",
+      "cf-aig-authorization": "Bearer " + (env.CF_AIG_TOKEN || ""),
+      // Drives both dynamic-route conditions and the log dimensions that
+      // ai_gateway_usage aggregates: cost per task class, cost per caller.
+      "cf-aig-metadata": JSON.stringify({
+        task_class: codeMode ? "code_gen" : "ops_exec",
+        caller: "qnfo-ops",
+        tier: codeMode ? "2" : "2"
+      })
+    },
+    body: JSON.stringify(upBody)
+  });
```

Apply the same header block to the relay path (`handleRelay`, ~line 2229) and to the
tool-loop round (~line 2500).

## 3. Fallback ladder

```diff
-  if (!resp || !resp.ok) throw new Error(_dsLastErr || "deepseek upstream unavailable after 3 attempts");
+  if (!resp || !resp.ok) {
+    // Gateway unreachable/rejecting: fall back to the direct provider path once,
+    // so a gateway misconfiguration cannot take the ops loop down.
+    if (env.DEEPSEEK_API_KEY) {
+      console.log("OPS_GATEWAY_FALLBACK_DIRECT " + String(_dsLastErr || "").slice(0, 200));
+      resp = await fetch(DEEPSEEK_URL, {
+        method: "POST",
+        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.DEEPSEEK_API_KEY },
+        body: JSON.stringify(upBody)
+      });
+    }
+    if (!resp || !resp.ok) throw new Error(_dsLastErr || "gateway+direct upstream unavailable");
+  }
```

## 4. Secrets

| Secret | Action |
|---|---|
| `CF_AIG_TOKEN` | **add** — AI Gateway token (`AI Gateway Run` scope) |
| `DEEPSEEK_API_KEY` | **keep** — now only the fallback path |
| `OPS_ROUTER_AUTH_KEY` | unchanged (inbound client auth) |

## 5. Manifest / registry

```diff
-    deps: ["api.deepseek.com (DEEPSEEK_API_KEY)", ...],
+    deps: ["AI Gateway default/compat (CF_AIG_TOKEN, dynamic/qnfo-agentic)", "api.deepseek.com (fallback only)", ...],
```

Also update `models: ["ops-exec", "deepseek-v4-flash"]` to advertise `dynamic/qnfo-agentic`
so `/v1/models` reflects the real routing surface.

## 6. Verification (must pass before the old path is removed)

```bash
# 1. gateway reachable + authenticated
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://gateway.ai.cloudflare.com/v1/edb167b78c9fb901ea5bca3ce58ccc4b/default/compat/chat/completions \
  -H "cf-aig-authorization: Bearer $CF_AIG_TOKEN" -H 'content-type: application/json' \
  -d '{"model":"openai/gpt-5.2","messages":[{"role":"user","content":"ping"}],"max_tokens":5}'
# expect 200 (proves Unified Billing: no provider key was sent)

# 2. ladder route resolves
# same call with "model":"dynamic/qnfo-agentic" and
# -H 'cf-aig-metadata: {"task_class":"code_gen","caller":"probe"}'  -> expect 200

# 3. ops loop end to end
curl -s https://ops.qnfo.org/health   # record VERSION before and after deploy
# then one agentic turn and confirm ai_gateway_usage gains a row with cost_usd > 0
```

## 7. Rollback

Revert the two constants + header blocks and redeploy. The direct DeepSeek path is
untouched by this patch, so rollback is a single-file revert with no data migration.
