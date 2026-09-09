# qnfo-paper-explainer — plain-English arXiv explainer (POC/pilot)

Turns recent arXiv papers into plain-English explanations **anyone can understand**,
with an honest verdict on **why it matters (or not) for everyday life**, and posts a
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
2. **Select + explain** — Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) picks the
   ONE paper most worth explaining to a general audience, then produces:
   - `headline` — plain-English rephrase of the title
   - `what_it_is` — 2–3 sentences, everyday analogy, no jargon/math
   - `everyday_relevance` — honest verdict
   - `relevance_label` — NOW | SOON | YEARS | NOT_YET
   - `why_not` — one honest sentence when it does *not* yet touch daily life
   - `buffer_post` — ONE self-contained ≤280-char summary (claim + verdict + arXiv link)
   - `posts` — a 4-post Bluesky thread (hook / what it is / why it matters-or-not / link)
3. **Fact-check** — posts are checked against the abstract (invented numbers, overclaiming,
   misattribution). Flagged → status `draft` (NOT posted).
4. **Post** — own AT Protocol session → Bluesky (qnfo.bsky.social), then Buffer GraphQL
   API (`https://api.buffer.com`, `Bearer` key) → Mastodon + LinkedIn + X (best-effort;
   a Buffer failure never blocks the Bluesky post).
5. **Log** — `paper_explain_log` (full explanation artifact) + `cloud_ops_events`
   (surfaces in the weekly visibility digest).

## Design gates (self-imposed)

| Gate | Rule |
|---|---|
| HONEST-OR-NOT-1 | Every explanation states NOW/SOON/YEARS/NOT_YET; says plainly when a paper does NOT touch daily life. No hype. |
| FACT-CHECK-1 | Posts checked against the abstract before posting; flagged → draft. |
| DEDUPE-1 | One explanation per arXiv id (`UNIQUE(arxiv_id)`). |
| DAILY-CAP-1 | Max `DAILY_CAP` (1) thread/day. |
| KILL-SWITCH-1 | `paper_explain_state.enabled=0` halts posting (dry runs still log). |
| BUFFER-BEST-EFFORT-1 | Buffer cross-post is additive and try/catch-wrapped; a Buffer/API failure never fails the run or blocks Bluesky. |
| RETRY-1 | Selection retries once on invalid JSON; failed Bluesky posts are marked `failed` (not orphaned) and are re-eligible for selection. |
| CHECKER-FAILOPEN-ESCALATE-1 | A degraded fact-check raises an `agent_issues` ticket (parity with qnfo-social) before posting fail-open. |

## Endpoints (Bearer `EXPLAIN_TOKEN` except /health)

- `GET /health` — version + binding presence
- `GET /run` — **dry run** (compose + fact-check + log as `dry`; does NOT post)
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
