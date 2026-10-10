# qnfo-social

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: Bluesky amplifier + Buffer cross-post
> Canonical source: this directory (QNFO/qnfo-workers)
> Version: worker.js VERSION + /health (see fleet-drift scan)

Deployed-current discipline: deployed-current.worker.js mirrors the live bundle;
regenerate via: wrangler deploy --dry-run --outdir dist && cp dist/worker.js deployed-current.worker.js

## Accuracy layer (SOCIAL-GROUND-1, 0.11.0, owner directive 2026-10-10)

A composed thread is queued only when it passes two checks, in this order (`checkThread`):

1. **Mechanical grounding** (`threadGroundingIssues`, ported from q08-signal-engine Q08-VERIFY-1): every capitalised name, year and
   figure in each post must occur in the title, the author or the abstract the thread was written from (links and hashtags are
   removed first). An invented one becomes a `{post, issue}` finding, goes to the repair pass like any checker finding, and no
   model verdict can override it. It costs no model call.
2. **LLM fact-checker** (unchanged contract): the model's own knowledge does not count as support and hedged wording does not
   excuse an unsupported claim. An unparseable or missing verdict returns `null` (unavailable) and every caller holds the thread as
   a draft; nothing is queued unchecked.

`composePrompt` and the checker prompt specify process and style only (ground every claim in the supplied abstract, no outside
knowledge, no examples of their own). Posting caps and holds are unchanged. Offline test: `node qnfo-social/grounding.test.mjs`.
