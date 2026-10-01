# q08-signal-engine

> Aligned to docs/STRATEGY.md (STRATEGY-1, 2026-10-01). Where they differ, STRATEGY.md wins.

Autonomous signal engine serving https://q08.org — systems-level critiques of technical-industry friction, generated from HN/GitHub/arXiv signals and published as timeless long-form essays.

## Distribution (Q08-PERSONAL-CHANNEL-HOLD-1, 2026-10-01)
- q08 is a separate publication (docs/STRATEGY.md section 2.1). It is **not** distributed through the owner's personal
  accounts; it reaches readers through its own RSS feed and subscriber digest only.
- The social queue (`social_threads`, drained by qnfo-social onto the owner's personal Bluesky account) is held by the
  plain var `Q08_SOCIAL_QUEUE`: off unless set to `"1"`. It is the q08 kill switch in the owner-voice gates (STRATEGY
  section 5) and stays off until q08 has its own channel.
- Review 2026-10-31 on bot-filtered human reads; q08 is retired if it is under 50 human reads/week (STRATEGY section 7).

## Runtime
- Worker: `q08-signal-engine` (Cloudflare Workers ES module, entry `worker.js`)
- Route: `q08.org/*` and `www.q08.org/*` → this worker (Workers routes; www.q08.org was previously a qnfo-hub Pages custom domain — removed 2026-09-14)

## Bindings
| binding | type | target |
|---|---|---|
| AI | Workers AI | catalog (`@cf/openai/gpt-oss-120b` et al.) |
| DB | D1 | q08-signal (10fd74b7-c4b3-43c7-9ca5-855213f44a69) |
| AUDIT | D1 | qnfo-audit (35e2e573-92f3-46ac-83c6-22f6429fc5e5) |
| EMAIL | Service | qnfo-email (production) |

## Cron triggers
- `0 */2 * * *` — generate (scrape → score → compose → gate → publish)
- `0 17 * * *` — daily subscriber digest

## Math rendering (MATH-RENDER-FLEET-1)
Every HTML page (piece + index) loads MathJax 3 `tex-svg` with a jsDelivr→unpkg fallback and an explicit load-time typeset. Delimiters: inline `\(...\)`, display `\[...\]` / `$$...$$`.

**Single-dollar `$...$` is deliberately DISABLED.** q08 prose is LLM-generated and can contain currency (`$5 million`), which MathJax would typeset as garbage under `$...$`. The canonical head snippet lives here as `q08-signal-engine/math_head.html` and is shared across fleet surfaces.

`mdEmph()` protects math spans so the `_…_ → <em>` pass cannot corrupt subscripts.

## Sources & further reading
Each piece renders a footer from `published_pieces.sources_json` (`[{label,url}]`). `persistPiece()` writes it from the originating signal: GitHub repo / arXiv / article host + Hacker News discussion link.

## Version history
- **v0.6.2** (2026-09-14) — RSS `renderFeed` strips raw LaTeX delimiters from descriptions.
- **v0.6.1** (2026-09-14) — safe math delimiters (dropped single-`$`); Q08_DIRECTIVE locks `\(...\)`/`\[...\]`; currency-corruption adversarial test passes.
- **v0.6.0** (2026-09-14) — MathJax rendering + Sources footer + math-aware `mdEmph()` + `sources_json` persistence.
- v0.5.0 and earlier — pre-math-render baseline.

## Deploy note
ES-module workers reject `curl -F` multipart uploads (error 10021 "No such module"). Use a spec-correct multipart PUT (metadata part without filename; module part named exactly = `metadata.main_module`).
