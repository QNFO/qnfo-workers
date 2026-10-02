# qnfo-web-unified — the QNFO design system (QDS-1, 2026-10-02)

One design system across every public surface: QNFO, QWAV and q08. It supersedes the 2026-08-31 paper-and-ink
system (Fraunces + Public Sans, accent #24315e) and the 2026-08-31 decision to leave QWAV on its own design: on
2026-10-02 the owner asked for the whole front end ("Everything should be designed for impressions, impact, and
readability") and chose to build from the ask.qwav.tech redesign.

## Where it lives
- **Stylesheet and script:** `https://qnfo.org/qds.css` and `https://qnfo.org/qds.js` (versioned `?v=1.0.0`), served by
  `qnfo-gateway` from the `QDS-1` block in `qnfo-gateway/worker.js` (`QDS_CSS`, `QDS_JS`). CORS `*`, cached one day.
- **Page shell:** `qdsHead`, `qdsHeader`, `qdsFooter`, `qdsPage` in the same block. Workers other than the gateway carry a
  copy between `// ---- QDS-SHELL:BEGIN` and `// ---- QDS-SHELL:END` markers (idea-hub today); regenerate it from the
  gateway block rather than editing it by hand.
- **Living papers and the fleet dashboard** (`LP_DS` in qnfo-gateway, `FLEET_DS` in qnfo-fleet-dashboard) inline the same
  tokens and type; they do not load qds.css because their class names predate it. Keep the tokens identical.

## Design language
- **Tokens:** paper `#F5F7FB`, surface `#FFFFFF`, ink `#182042`, muted `#58618A`, rule `#D9DEEC`; dark theme paper
  `#121731`-`#141A33`, ink `#E6E8F3`. Light/dark follows the OS until the visitor picks one (toggle, stored as `qnfo-theme`).
- **Accent by brand** (`<html data-brand>`): QNFO teal `#0E7C70`, QWAV indigo `#3B4CCA`, q08 rust `#B4472A`.
- **Type:** Newsreader for reading and display, Familjen Grotesk for interface. Reading measure about 68 characters;
  serif body gets the longer line height.
- **Components:** sticky header with a mobile menu, hero, sections, lists (`q-list`/`q-item`), link cards, panels,
  notes, tables, long-form prose with a contents sidebar (`q-article`, `q-toc`), subscribe block, footer, print styles.
- **Rules:** sentence-case labels, no all-caps eyebrows, no emoji marks; every public page keeps the STRATEGY 2.5
  metadata (title, description, canonical, OG/Twitter, JSON-LD, GA4, subscribe CTA, AI disclosure).

## Surfaces on QDS (2026-10-02)
| Surface | Host | Worker |
|---|---|---|
| Home, about, work with me | qnfo.org | qnfo-gateway 3.9.0 |
| Library and living papers | papers.qnfo.org | qnfo-gateway (LIVING-PAPERS-1 on the same tokens) |
| License | legal.qnfo.org | qnfo-gateway |
| Research archive | archive.qnfo.org | qnfo-gateway via zone route (SURFACE-ROUTES-1); Pages project qnfo-publications left intact behind it |
| QWAV platform | qwav.org, qwav.tech | qnfo-gateway via zone routes (SURFACE-ROUTES-1); Pages projects left intact |
| Ask the corpus | ask.qwav.tech | qnfo-ai-search 2.2.0 (tokens inline; family navigation) |
| Ideas | ideas.qnfo.org | idea-hub 1.4.0 |
| q08 | q08.org | q08-signal-engine 0.8.0 (own wordmark, no QNFO navigation: separate publication) |
| Fleet dashboard | fleet.qnfo.org | qnfo-fleet-dashboard 1.20.0 (FLEET_DS tokens) |

## Ideas content rules (2026-08-31 owner mandate, still in force)
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

## History
The 2026-08-31 paper-and-ink system, its Pages conversion recipe and the QWAV exemption are superseded by QDS-1.

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
