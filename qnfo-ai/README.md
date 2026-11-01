# qnfo-ai

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: AI router/gateway (model routing, ensemble, RAG, vision, query logging)
> Canonical source: this directory (QNFO/qnfo-workers)
> Version: worker.js VERSION + /health (see fleet-drift scan)
> models routed via AI Gateway dynamic routes -- see qnfo-ops issue #7.

Chat inference uses the existing `default` gateway: `dynamic/standard` for
default/general requests, `dynamic/value` for cheap/background tasks, and
`dynamic/premium` for agentic coding and complex reasoning. Explicit dynamic
IDs pass through unchanged; legacy chat IDs select a route, not a pinned
serving model. Embedding and other non-chat model IDs remain unchanged.
Provider URLs, credentials, dependencies, spend limits and gateway route
configuration are not changed. Gateway exhaustion returns an explicit error;
there is no consumer-side provider ladder or hedge. The original free-fallback
helper retains its shared 120-second deadline, now for one value route call.

The existing multi-stage ensemble remains a writer, value validator and
premium review pass, within its 120-second budget. Dynamic routes do **not**
guarantee independent model families: runtime diversity is reported as unknown,
not inferred from the old model catalog. Catalog and health entries continue
to describe serving models, not routes. Native Anthropic Messages input/output
conversion stays intact; only the translated OpenAI-shaped inference uses
`dynamic/premium`, never the Anthropic request shape.

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
