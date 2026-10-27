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
