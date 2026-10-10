# qnfo-ai

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: AI router/gateway (model routing, ensemble, RAG, vision, query logging)
> Canonical source: this directory (QNFO/qnfo-workers)
> Version: worker.js VERSION + /health (see fleet-drift scan)

Deployed-current discipline: deployed-current.worker.js mirrors the live bundle;
regenerate via: wrangler deploy --dry-run --outdir dist && cp dist/worker.js deployed-current.worker.js

## Accuracy layer (ACCURACY-GROUND-1, 5.33.0)

Owner directive 2026-10-10: an answer is verifiable against text the request supplied. The system prompt names four sources only
(RETRIEVED CONTEXT, WEB CONTEXT, the supplied fleet context, the user's messages) and says memory is not a source. `handleChat`
wraps `handleChatCore`: a non-tool, non-code, non-probe answer (streams are buffered first) loses every sentence that carries a
DOI, link, arXiv id, author citation or figure the supplied text does not contain, states the removal at its foot, and opens with
a no-source notice when a question had no retrieved context. The ensemble validator fails unsupported statements and the review
pass can only remove. If the check cannot run, the answer is withheld (HTTP 502), never passed raw. Offline suite:
`node qnfo-ai/accuracy-ground.test.mjs`. `system-prompt-qnfo.md` and `prompts-qnfo.md` are client-side paste text, not read by the worker.
