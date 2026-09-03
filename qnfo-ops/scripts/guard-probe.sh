#!/usr/bin/env bash
# qnfo-ai ops-feed guard probe (QNFO.OPS.015) - repeatable verification
# Expect: ops thread -> NO intent_express_log row; research idea thread -> row http:201
# Threads use probe-* prefix so qnfo-ai _internalProbe (^(canary-|probe-|verification-))
# excludes them from chatbox_conversations (audit HARD-2 fix 2026-09-03).
# Usage: ROUTER_AUTH_KEY=<key> bash guard-probe.sh
set -u
BASE="https://qnfo-ai.q08.workers.dev/v1/chat/completions"
KEY="${ROUTER_AUTH_KEY:-}"
if [ -z "$KEY" ]; then echo "ROUTER_AUTH_KEY required"; exit 2; fi
TID_OPS="probe-ops-$(date +%s%N | head -c 12)"
TID_IDEA="probe-idea-$(date +%s%N | head -c 12)"
echo "ops thread:   $TID_OPS"
echo "idea thread:  $TID_IDEA"
curl -s -m 120 "$BASE" -H "Content-Type: application/json" -H "Authorization: Bearer $KEY" -H "User-Agent: ChatBox/1.4.0 (dart:io)" -d "{\"model\":\"deepseek-v4-flash\",\"thread_id\":\"$TID_OPS\",\"stream\":false,\"max_tokens\":40,\"messages\":[{\"role\":\"user\",\"content\":\"check my email and list what came in\"}]}" > /dev/null
curl -s -m 120 "$BASE" -H "Content-Type: application/json" -H "Authorization: Bearer $KEY" -H "User-Agent: ChatBox/1.4.0 (dart:io)" -d "{\"model\":\"deepseek-v4-flash\",\"thread_id\":\"$TID_IDEA\",\"stream\":false,\"max_tokens\":40,\"messages\":[{\"role\":\"user\",\"content\":\"new research idea: probe whether decoherence times set a fundamental limit on spin-chain quantum speed limits\"}]}" > /dev/null
sleep 8
echo "Now query qnfo-audit D1:"
echo "  SELECT thread_id, ts, status FROM intent_express_log WHERE thread_id LIKE \"probe-%\";"
echo "Expected: only the idea thread row, status http:201. chatbox_conversations stays clean (probe- prefix)."