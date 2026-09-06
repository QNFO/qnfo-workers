# jnl-referee

AI referee + decision engine for the AI-reviewed journal overlay (isolated jnl-* stack).
Reviews Zenodo records from the `aiscience` community (or any recid), writes structured adversarial referee reports and deterministic decisions to D1 `jnl-audit` (`jnl_reviews`, `jnl_decisions`, `jnl_review_log`).

- Version: 0.1.0
- Cron: `23 */2 * * *` (seeds new records + runs up to 2 reviews per fire, daily cap 60)
- Endpoints: GET /health /queue /reviews /decisions; POST /enqueue /seed /run /run-next (Bearer via `x-jnl-token` header)
- Models: Workers AI llama-3.3-70b-instruct-fp8-fast + llama-4-scout-17b-16e-instruct (env JNL_MODELS override)
- Isolation: D1 jnl-audit + KV jnl-state + Workers AI binding; no QNFO-research mix
- Honesty: overlay-only (never stores paper bodies, never writes to Zenodo); metadata-only reviews never get PUBLISH; every report discloses basis + reviewer limitations

Deploy: `wrangler deploy` then set secret JNL_TOKEN. Requires existing D1 jnl-audit + KV jnl-state (see jnl-watch).
