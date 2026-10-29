# MODEL STANDARDS GATE — 32K OUTPUT / 128K CONTEXT

Canonical gate for ALL model settings across the QNFO fleet and its clients.
Established 2026-09-08 per user directive: "ops-exec MUST BE >64K MODEL (>64K
context window). ALL MODELS MUST SUPPORT MINIMUM 32K OUTPUT AND 128K CONTEXT WINDOW."

## 1. Standards (hard floors)

1.1 Every model advertised to or configured by any client (DeepChat, ChatBox, any
    API consumer) MUST carry maxOutput/maxTokens >= 32768 AND contextWindow/ctx >= 128000
    (the 128K floor), EXCEPT ops-exec (context > 64K per directive; actual 1048576).
    PROOF: user directive 2026-09-08; compliance verified 2026-09-08 (see 3).
    SCOPE: catalog entries, client provider models, worker model constants, /v1/models.

1.2 Any model that cannot meet the floors MUST be either (a) retired from the catalog,
    or (b) registered in the exemption registry (section 4) with per-model evidence of
    the platform-native cap. Silent non-compliance is a HARD finding.

1.3 Truncation lived on BOTH layers: the servers capped answers at 16384 (and 8192 in
    the OPS-LATENCY-1 era) while the oldest ChatBox ops-exec snapshot reads 16384 - not
    2-4K (the user's 2-4K observation predates the backup chain; it most plausibly
    matches the old 8192 server answer cap). After every model change, verify all of:
    ChatBox per-model maxOutput, DeepChat DB model_configs.config_json, Roaming
    app-settings.json provider model entries, and the live bundle caps (section 5).

## 2. Enforcement in production

2.1 qnfo-ops v2.6.1 (OUT-32K-1): DEFAULT_MAX_OUT 65536, OPS_ANSWER_CAP 65536,
    TOOL_ROUND_MAX 32768, TOOL_RESULT_CAP 32768, relay clamp 32768, MODEL_CTX 1048576.
    PROOF: live bundle sha probe 2026-09-08, /health v2.6.1.
2.2 personal-api v3.2.2-maxout200k: MAX_OUT_CAP 200000 (non-reason path), REASON_OUT_CAP
    32768, DEFAULT_MAX_TOKENS 32768 (reason path gpt-oss-120b ctx 128000). Reconcile
    round 2: a concurrent deploy restored MAX_OUT_CAP 2e5; both caps remain >= 32K floor,
    adopted as canonical per DEPLOY-LAST-WINS-RECONCILE-1.
2.3 qnfo-ai v5.21.3: DEFAULT_MAX_OUT 32768; Workers AI ceilings raised where the
    platform accepts them; cap-halving retry + contextAwareTarget keep 400s self-healing
    when a raised ceiling is refused upstream. /v1/models advertises honest values only.
2.4 DeepChat (DB + JSON) and ChatBox: QNFO-OPS/ops-exec = 131072 maxOutput / 1048576 ctx;
    router auto/ensemble 131072 / 1048576; personal-twin-reason 32768 / 128000.

## 3. Audit outcome 2026-09-08 (claim sheet)

- claim: ops-exec context > 64K - evidence: MODEL_CTX 1048576, live 384k max_tokens
  accepted upstream - confidence: high (live probe) - status: PASS
- claim: every server path supports >= 32K output - evidence: agent answer cap 65536,
  relay clamp 32768, personal caps 32768, qnfo-ai default 32768 - confidence: high -
  status: PASS
- claim: every client config meets the floors - evidence: DB model_configs +
  app-settings.json + ChatBox config-backup 2026-09-08 read-back - confidence: high -
  status: PASS
- claim: catalog models with sub-floor ctx/output are platform-capped, not misconfigured
  - evidence: qnfo-ai calibration history; upstream 400 on raised caps - confidence: high -
  status: PASS (exempted, section 4)

## 4. Exemption registry (platform-native caps - do NOT raise)

| Model | ctx | maxOut | Reason (platform cap) |
|---|---|---|---|
| qwq-32b | 24000 | 16384 | Workers AI native ctx/output |
| qwen3-30b | 32768 | 16384 | Workers AI native; cap-halving settles 16K |
| qwen2.5-coder-32b | 32768 | 16384 | Workers AI native; cap-halving settles 16K |
| deepseek-r1-qwen-32b | 80000 | 32768 | Workers AI ctx 80K (output compliant) |
| llama-3.2-11b-vision | 128000 | 4096 | vision/OCR utility; WA output cap |
| llama-3.3-70b-instruct-fp8-fast | 24000 | 8192 | fleet-advisor ADVISOR_MODEL; WA catalog ctx 24000, output 8192 (fp8-fast tier, not catalog-advertised); internal short-form use (max_tokens <= 350) |
| bge-base-en-v1.5 (embedding) | n/a | n/a | embedding - no generative output |

Retirement of any exempted model is a supported alternative; exemption keeps honest
advertisement. Any NEW catalog addition must meet 1.1 or enter this registry with evidence.

## 5. Verification recipe

- Server: GET /health (version) + fetch deployed bundle and grep DEFAULT_MAX_OUT /
  MAX_OUT_CAP / REASON_OUT_CAP / MODEL_CTX (live-bundle probe, not repo-only).
- Clients: sqlite read model_configs (cache_key QNFO-OPS-_-ops-exec) + parse
  app-settings.json providers + latest ChatBox config-backup-*.json qnfo-ops.models.
- Catalog: run scripts/model-standards-guard.py (exit 0) - checks MODELS entries vs
  section 4 registry with floors ctx >= 128000 and maxOut >= 32768.

## 6. Changelog

- 2026-09-08: created; audit PASS; exemptions registered; deploy-state commits
  qnfo-workers 3e0511a (model-standards, post-rebase) + 7046ce0 (fleet sync).
- 2026-09-08 red-team round 2 (5-adversary, parent-direct per CHILD-FROZEN-VIEW):
  PASS-WITH-NOTES remediated same-cycle - registry gap llama-3.3-70b-instruct-fp8-fast
  (WA ctx 24000), 1.3 attribution corrected (oldest ChatBox snapshot 16384, not 2-4K),
  changelog hashes corrected, guard INTERNAL_MODELS completeness check added.
- 2026-09-08 CMD CONTINUE reconcile: concurrent deploy personal-api v3.2.2-maxout200k
  (MAX_OUT_CAP 2e5 restored; >= floor, canonical per DEPLOY-LAST-WINS-RECONCILE-1); doc
  2.2 re-anchored; guard extended to enforce personal-api MAX_OUT_CAP/REASON_OUT_CAP;
  client stores re-verified (DB ops-exec 131072/1048576, personal-twin 32768/128K+,
  default keys QNFO-OPS/ops-exec).
