# qnfo-ai-search (ask.qwav.tech)

## Accuracy (ASK-GROUND-2, 2.4.0)

Owner directive 2026-10-10: an answer is verifiable against supplied text, and generative instructions carry process and style only.

- The system prompt names no topic. Its only source is the numbered EXCERPTS; general-knowledge content is forbidden (the earlier
  "label it outside the corpus" allowance is gone).
- The model's tokens are held back. The finished answer is checked by `groundBody`: a sentence is deleted when it cites an excerpt
  number that does not exist, carries a DOI, link, arXiv id, author citation or figure that no excerpt (or the question) contains,
  or is labelled general knowledge. Only the checked text is sent, cached and sampled for the judge. Follow-up questions that name
  an unsupported item are dropped.
- No excerpt means no model call: the visitor gets a fixed no-answer text. If nothing survives the check, a fixed not-covered text.
- The grounding judge (ASK-LOOP-1) still measures the published text. `cites` and `cites_invalid` in `ask_events` still record what
  the model wrote before the check, so prompt quality stays measurable.
- The page lede, the input placeholder and the fallback question seeds name no topic; the seeds come from `/api/recent`.
- `ASK_GLOSSARY` is a retrieval alias map (term to defining paper slug), not prompt text; it is extensible in `pipeline_flags`.

Suite: `node qnfo-ai-search/ask-ground.test.mjs`.
