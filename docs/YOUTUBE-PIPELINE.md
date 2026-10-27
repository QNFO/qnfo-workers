# YouTube pipeline from plain-language papers (YT-POC-1)

Charter pillar: `reach`. Status: proof of concept, run locally on one paper (2026-10-27). Nothing is uploaded.

## What exists
`scripts/youtube_poc/make_video.py <slug>` turns a paper's plain-language article (`papers.qnfo.org/papers/<slug>/quickread`, PLAIN-ARTICLE-1) into
`video.mp4` (1920x1080, narrated), `captions.srt`, `metadata.json` (title, description with chapters and source links, `containsSyntheticMedia: true`,
`privacyStatus: private`). Stages: fetch, scene script (hook = the short version, one scene per plain section, outro with link), edge-tts per sentence
(exact timing without alignment), Pillow frames, ffmpeg (imageio-ffmpeg binary) concat. Cost: $0, no API key.

Measured on `institutionalized-unfalsifiability-...`: 7 scenes, 3 min 38 s, 3.9 MB, h264 + aac, about 1 minute to build.

## Tool research (searched 2026-10-27)
| Option | License | Verdict |
|---|---|---|
| ffmpeg + Pillow (used) | LGPL/HPND | Fewest moving parts; enough for text cards. Chosen for the POC. |
| Remotion | source-available, paid for companies of 4+ | Best motion graphics, but licence cost and a Node/Chromium render step |
| Motion Canvas / Revideo | MIT | Good for animated diagrams; Revideo now follows a commercial product |
| MoviePy 2.x | MIT | Fine, slower, breaking changes between 1.x and 2.x |
| HyperFrames (HTML/GSAP + Kokoro) | open | Strong second step: animate the same scenes from HTML |
| MoneyPrinterTurbo / ShortGPT | MIT | Stock-footage "faceless" generators; the very format YouTube's inauthentic-content policy targets. Not used |
| TTS: edge-tts (used), Kokoro-82M, Piper | free / Apache | edge-tts is cloud and unofficial; Kokoro or Piper run offline and remove that dependency |

## Best practices that shaped it
- Source is the paper's own plain text; no new claims are generated, so nothing needs a second fact check beyond PLAIN-ARTICLE-1's verifier.
- Hook in the first sentence (the short version), chapters, captions file, link to the full article in the description.
- YouTube's "inauthentic content" policy (renamed July 2025) targets templated, mass-produced, low-effort video; channel-level detection is reported,
  and 16 mass-AI channels were reported terminated in January 2026 (third-party reports, not YouTube's own pages: verify before launch). Synthetic
  narration should be disclosed; the pipeline sets the flag.

## Update 2026-10-27: vertical Shorts with generated diagrams (YT-POC-2)
Owner feedback: text over slides is not engaging; start with TikTok-style Shorts and prove upload end to end.

GitHub survey (stars and push date read from the API today): MoneyPrinterTurbo (135k, MIT, active) and short-video-maker (1.4k, MIT, idle since 2025-06)
both put TTS and captions over *stock footage*: the look YouTube's inauthentic-content policy targets, and unrelated to a paper's argument.
ShortGPT (8k, idle) the same. For explainers the better fit is **Manim** (41.9k, MIT, active): it animates the paper's own idea (bars, meters, populations
changing). Remotion (68k) and Motion Canvas (19.5k, MIT) are the alternatives; HyperFrames/Kokoro for later. Word-timed captions come free from
edge-tts `WordBoundary` (no Whisper pass needed; whisper.cpp/WhisperX only if a non-edge voice is used).

Built: `directors/<name>.json` (7 beats: narration + one diagram template each) -> `make_short.py` (TTS with word times, Manim render of
`short_scene.py` at 1080x1920/30 fps, ASS karaoke captions with the spoken word highlighted, ffmpeg mux, `metadata.json` with #Shorts and the AI
disclosure) -> `upload_youtube.py` (YouTube Data API v3 resumable upload, private by default). Result: a 48 s short, 2.9 MB.
Visible "AI-GENERATED NARRATION" tag on every frame (BP26-AI-ACT-ART50-1).

Gaps: the director spec is hand-written for this paper; production needs an LLM director (qnfo-ai, a kimi-k2.6 writer plus a checker that every
number and claim in the narration appears in the plain article) choosing among the six templates. Six templates fit a game-theory paper; other
papers need more (timeline, flow, comparison). Upload needs a Google OAuth client (`client_secret.json`) and one browser consent by the channel
owner; an unaudited API project may upload private videos only until it passes the YouTube API compliance audit.

## Known weaknesses (honest)
1. The video is a text slideshow. This is the template look that policy and viewers punish. Next step: one generated diagram or illustrated scene per
   section, animated captions (word-level via edge-tts WordBoundary), a varied title card, a human-written opener.
2. Plain-article coverage is 25.9 % (184 of 710 papers, `_audit/quick-read` on 2026-10-27), so only covered papers can be made.
3. The fetch parses HTML class names (`qa-short`, `qa-sec`); a gateway markup change breaks it. Fix: expose `/api/plain/<slug>` JSON in qnfo-gateway.
4. No retention data exists. Measure before scaling: 5 videos, then average view duration and click-through per video.

## Path to automation (not built)
1. Gateway JSON endpoint for the article (removes weakness 3).
2. A runner outside Workers (GitHub Actions or a container; Workers cannot run ffmpeg) triggered by new `plain_article` rows, one video per paper, capped at a
   human-plausible cadence (2 a week) to stay clear of the inauthentic-content policy.
3. Upload by the YouTube Data API `videos.insert` as `private`, with `captions.insert`. The OAuth consent for the channel is owner-only (identity-bound):
   one card with an `IDENTITY-BOUND:` line. Publishing public stays a human click until retention data justifies otherwise.
4. Add `youtube_videos_30d` and average view duration to `metric_registry` with a trigger, in the PR that ships the runner.

## Server-side design (owner directive 2026-10-27: "all of this needs to run 100% server-side on Cloudflare Quniverse")
Proven locally: fetch, TTS, Manim render, captions, mux, upload (private Short `D6JC7fWWXns`, 2026-10-27, OAuth client `qnfo-youtube-uploader` in the QWAV project,
`rwnquni@gmail.com` as its test user). Nothing below is built yet. Workers cannot run ffmpeg or Manim, so the render step is a Cloudflare Container.

| Step | Local POC | Cloudflare replacement |
|---|---|---|
| Trigger | manual | worker cron (CRON-SINGLE-TRIGGER-1): newest `plain_article` row (status ok) with no `youtube_videos` row; cap 2 a week |
| Director (beats JSON) | hand-written | qnfo-ai writer (kimi-k2.6) + checker from another family; every number in a beat must occur in the article body, else the beat is dropped |
| TTS + word times | edge-tts (Microsoft cloud) | Workers AI TTS (`@cf/myshell-ai/melotts` or Deepgram Aura). Word times are not returned: align in the container (whisper.cpp tiny) or split by sentence |
| Render | Manim + ffmpeg on a laptop | Cloudflare Container (python 3.12, manim, pango/cairo, ffmpeg), driven by the worker through a Durable Object; output to R2 |
| Upload | `upload_youtube.py` | the worker calls `videos.insert` (resumable) from R2 with an access token refreshed from a Worker secret |
| Ledger | none | D1 `youtube_videos` (slug, rev, video id, privacy, created_at, views later) and a `metric_registry` row with trigger |

Constraints found, not assumed:
- **Refresh token lifetime:** an OAuth app in "Testing" mode issues refresh tokens that expire after 7 days. The app must be set to "In production" (unverified is allowed for
  the owner's own channel, with the warning screen) before a token is stored, or the automation stops weekly. Not yet done.
- **Secrets:** the refresh token and client secret go in as Worker secrets under the secret-lock lease (`/secret-lock/acquire`), never in git or D1. The local copies are
  `~/yt-client.json` and `~/yt-token.json`; delete them after the move.
- **Containers fragility:** qnfo-containers-pilot lost its bindings once (CONTAINER-CONFIG-RESTORE-*). The new worker needs its own `[[containers]]` block, a
  `deploy-*.yml` that verifies `/status`, and a second path (render in a GitHub runner) per ANTIFRAGILE-1.
- **Charter:** new worker directory needs `# charter-pillar: reach` and a named same-class retirement (net-zero rule); AI-label and provenance (BP26-AI-ACT-ART50-1,
  BP26-PROVENANCE-MARKING-1) are part of the render, not an addition.
- **Channel:** the target is the owner's existing personal channel (2 subscribers, one 2025 community post). Aligning its name, banner and description with the
  content is a visible account change and needs the owner's wording; Shorts stay private until the owner reviews the first batch.
