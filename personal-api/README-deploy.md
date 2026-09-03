# personal-api deploy (canonical-state, created 2026-09-03)
worker.js is canonical source AND deployed bundle (no build step). Previously only
deployed (no local source) - recreated from the live v3.0.4 bundle + wrangler.toml
from live settings.

Flow:
1. Edit worker.js (keep VERSION + header current)
2. wrangler deploy (secrets preserved: API_KEY, CAL_TOKEN, CF_TOKEN, INFRA_TOKEN)
3. Verify /health version
4. cp worker.js deployed-current.worker.js + commit

Endpoints: /v1/chat/completions (Bearer API_KEY), /v1/media (list), /v1/media/:id (bytes), /v1/media/:id (POST reprocess OCR).
