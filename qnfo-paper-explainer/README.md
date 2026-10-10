# qnfo-paper-explainer — plain-English arXiv explainer (POC/pilot)

Turns recent arXiv papers into plain-English explanations **anyone can understand**,
with an statement of the application the abstract itself gives (or that it gives none), and posts a
short thread to Bluesky daily, then cross-posts a one-line summary to Mastodon, LinkedIn
and X via Buffer. 100% cloud, fully autonomous, user-free.

## Why this exists

QNFO already publishes its *own* papers (qnfo-social → Bluesky, 1/day) and scans arXiv
for *QNFO-specific* research topics (qnfo-cloud-ops research-scan, qnfo-arxiv-radar).
This worker closes the missing surface: **general, recent arXiv papers**, translated for
a non-expert audience, posted under the QNFO account to grow reach and position QNFO as
the account that explains science to everyone.

## Pipeline (daily, cron `0 14 * * *` UTC)

1. **Fetch** — arXiv API, most-recent 30 across accessible categories
   (cs.AI, cs.LG, cs.CL, cs.CV, cs.CY, cs.HC, physics.pop-ph, q-bio.NC, econ.GN, stat.ML).
2. **Select + explain** - Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) picks the
   ONE paper whose abstract is easiest to explain in plain words, then produces (only from the
   title and abstract; its own knowledge is not a source):
   - `headline` - plain-English rephrase of the title
   - `what_it_is` - 2-3 sentences paraphrasing what the abstract says was done and found
   - `stated_application` - the application the abstract itself states, or exactly
     "The abstract does not state a practical application."
   - `relevance_label` - STATED_APPLICATION | NONE_STATED (no invented NOW/SOON/YEARS timelines)
   - `buffer_post` - ONE self-contained <=280-char summary (claim + arXiv link)
   - `posts` - a 4-post Bluesky thread
3. **Verify (PAPER-VERIFY-1, owner directive 2026-10-10)** - ALL reader-facing text, hedged
   framing included, must pass, in this order:
   1. deterministic grounding: every capitalised name, year and figure must occur in the paper's
      title, authors or abstract, and every arxiv.org/abs link must be the paper's own id;
   2. two reviewers from model families other than the writer's (`REVIEWERS`) each find no claim
      the source does not state (hedged claims count; their own knowledge is not support);
   3. one corrective revision by the writer, then the whole check runs again.
   Flagged -> status `draft` (NOT posted). **Fail closed:** if fewer than two reviewer verdicts
   arrive (outage, unparseable reply) or the abstract is missing, nothing is posted, no log row is
   written (the paper stays eligible, the next run retries) and a
   `PAPER-EXPLAIN-CHECKER-UNAVAILABLE` issue is filed. There is no degraded / fail-open path.
4. **Post** - own AT Protocol session -> Bluesky (qnfo.bsky.social), then Buffer GraphQL
   API (`https://api.buffer.com`, `Bearer` key) -> Mastodon + LinkedIn + X (best-effort;
   a Buffer failure never blocks the Bluesky post).
5. **Log** — `paper_explain_log` (full explanation artifact) + `cloud_ops_events`
   (surfaces in the weekly visibility digest).

## Design gates (self-imposed)

| Gate | Rule |
|---|---|
| HONEST-OR-NOT-1 | Every explanation states the application the abstract states, or plainly that it states none (STATED_APPLICATION / NONE_STATED). No invented products, timelines or examples. |
| FACT-CHECK-1 | Posts checked against the abstract before posting; flagged → draft. |
| DEDUPE-1 | One explanation per arXiv id (`UNIQUE(arxiv_id)`). |
| DAILY-CAP-1 | Max `DAILY_CAP` (1) thread/day. |
| KILL-SWITCH-1 | `paper_explain_state.enabled=0` halts posting (dry runs still log). |
| BUFFER-BEST-EFFORT-1 | Buffer cross-post is additive and try/catch-wrapped; a Buffer/API failure never fails the run or blocks Bluesky. |
| RETRY-1 | Selection retries once on invalid JSON; failed Bluesky posts are marked `failed` (not orphaned) and are re-eligible for selection. |
| CHECKER-FAIL-CLOSED-1 | A reviewer outage posts nothing, files `PAPER-EXPLAIN-CHECKER-UNAVAILABLE`, and the paper is retried next run (replaces CHECKER-FAILOPEN-ESCALATE-1). |

## Endpoints (Bearer `EXPLAIN_TOKEN` except /health)

- `GET /health` — version + binding presence
- `GET /run` — **dry run** (compose + verify + log as `dry`; does NOT post)
- `GET /run?post=1` — full run (compose + fact-check + **post to Bluesky + Buffer** + log)
- `GET /run?post=1&force=1` — same, bypassing the daily cap (manual verification only)
- `GET /log` — recent `paper_explain_log` rows
- `GET /state` — kill-switch + daily cap state
- `POST /enable` — `{"enabled":0|1}` toggle

## Verification (same-turn evidence)

```bash
# dry run (safe — no post)
curl -s "https://qnfo-paper-explainer.q08.workers.dev/run" -H "Authorization: Bearer $EXPLAIN_TOKEN"

# one live post (proof the pipeline works end-to-end)
curl -s "https://qnfo-paper-explainer.q08.workers.dev/run?post=1" -H "Authorization: Bearer $EXPLAIN_TOKEN"

# check the log
curl -s "https://qnfo-paper-explainer.q08.workers.dev/log" -H "Authorization: Bearer $EXPLAIN_TOKEN"
```

## Next steps (documented, not yet built)

- **Web rendering** of `what_it_is` + `everyday_relevance` as a public "explained papers"
  page (seeded from `paper_explain_log`).
- **A/B format experiments** (EXP program) on hook style + posting time for reach.
- **Multi-paper/day** once daily engagement is proven.

## Canonical source

QNFO/qnfo-workers/qnfo-paper-explainer/worker.js (this repo). Deployed via `wrangler deploy`.

## Status

The directory carries a `RETIRED` marker (2026-10-01, RADAR-HUB-REDEPLOY-1): the canonical deploy skips it, and this source is
kept for reference. The accuracy layer above is in the source so that a future redeploy cannot reintroduce unchecked posts.
Offline test: `node qnfo-paper-explainer/verify.test.mjs`.
