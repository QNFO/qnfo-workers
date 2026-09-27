# qnfo-web-unified — QNFO unified design system (2026-08-31)

One professional, minimalist, functional look across every **QNFO-branded** public surface.
**QWAV-branded surfaces intentionally remain on their existing design** (user decision,
2026-08-31: "I like QWAV look and feel as it is. Stick to QNFO changes for now").
Reference implementation: https://ideas.qnfo.org

## Design language
- **Palette (warm paper/ink):** --paper #faf7f2, --surface #f2eee6, --ink #1b1915,
  --muted #8a8376, --border #e2dcd0, --accent #24315e, --accent-soft #eceef6
- **Type:** Fraunces (display serif) + Public Sans (UI). No Inter, no generic system fonts.
- **Mark:** rounded-square "Q" tile (accent bg, serif Q) as the shared brand glyph.
- **Components:** sticky top-nav, centered hero with overline tag, stat rows, card grids,
  paper-list rows, pill buttons, minimal footer. Generous whitespace, editorial restraint.

## QNFO surfaces converted (live, verified 2026-08-31)
| Surface | Host | Where it runs | File |
|---|---|---|---|
| QNFO Research Foundation | qnfo.org | qnfo-gateway Worker (COMMON_CSS replaced) | qnfo-gateway.deployed.worker.js |
| QNFO About page (gateway v3.5.0) | qnfo.org/about | qnfo-gateway Worker (live D1 counts) | qnfo-gateway.deployed.worker.js |
| QNFO Papers (+ Load More, no 50-cap) | papers.qnfo.org | qnfo-gateway Worker | qnfo-gateway.deployed.worker.js |
| QNFO Hub + subdomains | hub.qnfo.org, q08.org, design/quantum/measure/hensel/unity.qnfo.org | qnfo-hub Pages (index.html + host-aware _worker.js) | hub-index.html, hub-worker.js |
| QNFO Research Archive | archive.qnfo.org | qnfo-publications Pages | archive-qnfo.html |
| Research profile | qnfo-landing.pages.dev | qnfo-landing Pages | landing-profile.html |
| QNFO Ideas (v2.1.0) | ideas.qnfo.org | qnfo-idea-factory Worker | ../qnfo-idea-factory/worker.js |

## QNFO Ideas v2.1.0 content rules (2026-08-31 user mandate)
- **Only threads submitted through the QNFO AI endpoint** (the `chat` table written by
  qnfo-ai on /v1/chat/completions). The DeepChat-sync archive (`chat_sessions`) is NOT shown.
- **Capped at the last 20 threads.**
- **Junk filter (isJunkThread):** titles < 12 chars, or matching JUNK_MARKERS (say ok, hello,
  test/probe stubs, "first/second turn", "capital of", "who is", jokes, "explain simply",
  "continue", etc.) are hidden from lists AND return 404 on /api/session/:id.
- INTERNAL_MARKERS blocklist (INTENT_TOKEN, rotation verification, memory-processing prompts)
  still excludes internal-ops threads.

## QNFO Papers Load More (2026-08-31 user mandate)
- /papers now renders the total count and a "Load more" button (50 per page, no hard cap).
- /papers?format=json&limit=&offset=&category=&search= returns JSON (with pre-rendered rows)
  for client-side appending. Category + search totals are computed over the full corpus.

## QWAV surfaces (unchanged by design)
qwav.org + mirrors, ask.qwav.tech, qwav-demo-bt-qec — reverted to their original designs.

## Conversion recipe (for future QNFO surfaces)
1. Map the existing page's CSS variables onto the unified tokens (keep var names so inline
   styles survive; add --blue: var(--accent) legacy alias).
2. Swap the font source (Google Fonts link or @import) to Fraunces + Public Sans.
3. Replace the favicon blue (#1a56db) with the accent (#24315e).
4. Replace brand emoji with the Q mark span.
5. Append unified overrides (headings serif, pill buttons, card grids, muted meta).
Pages deploys: upload-token -> check-missing -> upload (base64 JSON) -> upsert-hashes ->
create deployment (manifest = MD5 hashes, keys "/index.html" for files, "_worker.js" without
slash for Functions). Worker deploys: script-only PUT /content (preserves bindings).

---

## Deploy model (do not re-add a wrangler.toml here)

This directory is an **asset / Pages staging** directory, not a worker deploy unit.

- The runnable worker is `../qnfo-gateway/` (`name = "qnfo-gateway"`, `main = "worker.js"`).
  That directory owns the worker name and the `0 6 * * *` cron.
- `qnfo-gateway.deployed.worker.js`, referenced in the table above, is produced by the
  worker deploy pipeline (script-only `PUT /content`, bindings preserved). It is **not**
  a repo file, so a `wrangler.toml` here whose `main` points at it can never build.
- Pages surfaces deploy via upload-token -> check-missing -> upload -> upsert-hashes ->
  create deployment (see "Conversion recipe" above). No wrangler step.

A `wrangler.toml` was removed from this directory on 2026-09-27. It was a stale duplicate:
it declared `name = "qnfo-gateway"` (colliding with `../qnfo-gateway/`) while its
`main = "qnfo-gateway.deployed.worker.js"` did not exist. That made `WORKER-BUILD-GATE-1`
(`npx wrangler deploy --dry-run`) fail for every change under this directory -- and, had a
deploy ever run from here, it would have overwritten the live `qnfo-gateway` worker.
