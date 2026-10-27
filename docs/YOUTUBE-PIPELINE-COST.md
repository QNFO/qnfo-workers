# YouTube Shorts pipeline: cost model and tool choices (YT-SERVER-1, 2026-10-27)

Owner cap: at most USD 50 a month added expense, all-in. Enforced in code: `youtube_spend` (D1 qnfo-audit) is written per stage with measured units, the hourly tick stops new
work when the month's sum reaches USD 45 (`SPEND_STOP_USD`), `fleet_budget cost:youtube_shorts_month` records the cap, and metric `youtube_spend_usd_month` (guard, trigger above 45) grades it.
Code: qnfo-youtube-shorts/worker.js (`PRICES`, `addSpend`, `monthSpend`).

## Estimate before the first real run (list prices; replaced by measured rows once a video has been made)
| Item | Unit per video | Rate | USD per video |
|---|---|---|---|
| Director + checker (qnfo-ai, Workers AI gpt-oss) | 2 calls, about 3,000 neurons each | 0.011 USD per 1,000 neurons | 0.07 |
| TTS melotts | about 700 characters | assumed 1 neuron per character | 0.01 |
| Container standard-2 (1 vCPU, 6 GiB) | 600 s wall (cold start, Manim 1080x1920 at 30 fps, mux) | 0.000020 per vCPU-s + 0.0000025 per GiB-s | 0.021 |
| R2 (qnfo-media) | 4 MB stored, 2 reads | free tier covers it | 0 |
| YouTube Data API v3 | 1,600 quota units per insert | free, 10,000 units a day (6 uploads a day at most) | 0 |

Estimate: about USD 0.10 per video. At 2 a week (about 9 a month): about USD 0.9. At 7 a week (about 30 a month): about USD 3. Both are far under USD 50 even if the
estimate is wrong by 10 times; the ledger corrects the rates from measured units, not the other way round. The measured figure is filed in the closeout after the first run.

## Candidates evaluated
| Option | Cost | Verdict |
|---|---|---|
| Workers AI melotts (chosen) | neurons, no card | Same account and billing; returns audio only, so word times are proportional inside a sentence whose length is measured with ffprobe |
| Gemini TTS / Google Cloud TTS | free monthly character allowance, needs the QWAV project with an API key or billing | Does not return word timings either (Cloud TTS can, with SSML marks); a card-needed item would be an owner card. Not needed at this volume |
| Gemini Flash for the director | free tier exists | Would need a Google API key as a Worker secret; qnfo-ai already routes to cheaper models and the director is about USD 0.07 a video. Revisit only if the ledger shows the director dominating |
| Imagen / Veo | per image / per second of video | Veo costs dollars per clip; one Short would eat the month. Not used. Manim draws diagrams from the paper's own numbers, which is also what the number check can verify |
| YouTube Data API v3 videos.insert | free within quota | Chosen |
| YouTube Create, Shorts remix, Studio AI tools | no public API | Not automatable; listed, not assumed |

## Second render path
A render that the Container cannot finish leaves `youtube/<id>/job.json` in R2; `.github/workflows/youtube-render-runner.yml` renders it on a GitHub runner with the same
`container/render.py`, writes `short.mp4` back and sets the row to `rendered`; the next hourly tick uploads it. GitHub minutes are not Cloudflare spend and are not in the ledger.
