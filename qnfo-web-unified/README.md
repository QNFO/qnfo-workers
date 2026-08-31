# qnfo-web-unified — QNFO/QWAV unified design system (2026-08-31)

One professional, minimalist, functional look across every QNFO and QWAV public surface.
Reference implementation: https://ideas.qnfo.org (first surface converted, 2026-08-31).

## Design language
- **Palette (warm paper/ink):** --paper #faf7f2, --surface #f2eee6, --ink #1b1915,
  --muted #8a8376, --border #e2dcd0, --accent #24315e, --accent-soft #eceef6
- **Type:** Fraunces (display serif) + Public Sans (UI). No Inter, no generic system fonts.
- **Mark:** rounded-square "Q" tile (accent bg, serif Q) as the shared brand glyph.
- **Components:** sticky top-nav, centered hero with overline tag, stat rows, card grids,
  paper-list rows, pill buttons, minimal footer. Generous whitespace, editorial restraint.

## Surfaces converted (2026-08-31)
| Surface | Host | Where it runs | File |
|---|---|---|---|
| QNFO Research Foundation | qnfo.org | qnfo-gateway Worker (COMMON_CSS replaced) | gateway worker |
| QNFO Papers | papers.qnfo.org | qnfo-gateway Worker | gateway worker |
| QNFO Hub + subdomains | hub.qnfo.org, q08.org, design/quantum/measure/hensel/unity.qnfo.org | qnfo-hub Pages (index.html + host-aware _worker.js) | hub-index.html, hub-worker.js |
| QWAV Platform | qwav.org + mirrors | qwav Pages | qwav-platform.html |
| Ask QWAV | ask.qwav.tech | ask-qwav Pages | ask-qwav.html |
| QNFO Research Archive | archive.qnfo.org | qnfo-publications Pages | archive-qnfo.html |
| Research profile | qnfo-landing.pages.dev | qnfo-landing Pages | landing-profile.html |
| QNFO Ideas | ideas.qnfo.org | qnfo-idea-factory Worker | (v2.0.0, live source) |
| Bruhat–Tits QEC demo | qwav-demo-bt-qec.pages.dev | GitHub Pages auto-deploy | repo qwav-demo-bt-qec |

## Conversion recipe (for future surfaces)
1. Map the existing page's CSS variables onto the unified tokens (keep var names so inline
   styles survive; add --blue: var(--accent) legacy alias).
2. Swap the font source (Google Fonts link or @import) to Fraunces + Public Sans.
3. Replace the favicon blue (#1a56db) with the accent (#24315e).
4. Replace brand emoji with the Q mark span.
5. Append unified overrides (headings serif, pill buttons, card grids, muted meta).
Pages deploys: POST /accounts/{acct}/pages/projects/{project}/deployments with
manifest (sha256) + file parts. Worker deploys: script-only PUT /content (preserves bindings).
