# qnfo-errata-respond - deployed-current.worker.js (byte-exact snapshot of the API-deployed bundle)

Step-executor behind errata-workflow (qnfo-errata-orchestrator, 2026-09-02); own cron disabled.
Version is reported inline in /health (no VERSION const); fleet sweep fallback parses it.
Do NOT wrangler-deploy from this dir: the worker is API-managed with a full bundle (publish = 711KB w/ puppeteer).
