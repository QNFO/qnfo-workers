# Ultrastable: inventory of everything produced (2026-11-10)

This is the full record of the work that defined Ultrastable, gave it a live claims page, linked it to Rowan's personal brand and put it on its own domain. Everything below is committed and merged. Nothing exists only in a chat.

Copy target: `C:\Users\LENOVO\Dev\ultrastable` (the owner's local Ultrastable folder), then private repositories in https://github.com/ultrastable (owner, 2026-11-10). To build it, copy the files listed here from `QNFO/qnfo-workers` main.

## Pull requests (all merged)

| PR | What it did |
|---|---|
| QNFO/qnfo-workers#10156 | ULTRASTABLE-PRODUCT-1: defined the product, the repo boundary, owner questions, ROADMAP issues P1 to P4 |
| QNFO/qnfo-workers#10172 | ULTRASTABLE-CLAIMS-1: every product claim has a live probe; page at qnfo.org/platform |
| QNFO/qnfo-workers#10182 | made all 7 claim probes runnable (semicolons in probe strings) |
| QNFO/qnfo-workers#10190 | ULTRASTABLE-CREATOR-LINK-1: the page credits Rowan, author schema, config-driven profile |
| QNFO/qnfo-workers#10200 | ULTRASTABLE-DOMAIN-1: ultrastable.io serves the page; .app and .net redirect to it |
| rwnq8/rwnq8.github.io#10, #11 | personal site names the platform and links to it (nav, highlight, JSON-LD, llms.txt) |
| rwnq8/rwnq8#7, #8 | GitHub profile README names the platform, "Directs Ultrastable" badge |
| rwnq8/resume#11, #12 | CV line, BRAND.md section 9 (platform wording, linking the two brands), rebuilt PDF |

## Files in QNFO/qnfo-workers

**Product definition**
- `docs/PRODUCT-ULTRASTABLE.md`: the product page (category, pitch, evidence, gaps, credit, domain).
- `product/boundary.json`: which files are the core and which are QNFO-specific; claim ids; the creator block.
- `product/INVENTORY.md`: this file.
- `scripts/product_boundary.mjs`, `scripts/product-boundary.test.mjs`: check the boundary and the claim ids.
- `scripts/product_claims_probe_guard_test.py`: checks that every stored probe passes the runner's single-SELECT rule.

**Migrations (D1 qnfo-audit, applied by CI)**
- `migrations/2026-11-10-ultrastable-product.sql`: owner_asks product questions, owner cards ultrastable-domain-1, -trademark-1, -github-org-1 and -entity-1.
- `migrations/2026-11-10-ultrastable-claims.sql`: the `product_claims` table (7 claims) and the `claim-ultrastable-*` remediation contracts.
- `migrations/2026-11-10-ultrastable-claims-semicolon.sql`: the probe fix.
- `migrations/2026-11-10-ultrastable-owner-answers.sql`: records the owner's answers given by action: the name Ultrastable, its own domain, and the GitHub organisation ultrastable (`product_profile.org_url`). repo_url stays public until those repositories are public.
- `migrations/2026-11-10-ultrastable-profile.sql`: the `product_profile` table (name, home, repo, creator and credit), three owner_asks rows, and the trigger `owner_asks_product_profile_au`.

**Web page code (qnfo-gateway worker)**
- `qnfo-gateway/worker.js` and `qnfo-gateway/deployed-current.worker.js`: `platformClaims`, `platformProfile`, `platformJsonLd`, `handlePlatform`, `ultrastableRoute`.
- `qnfo-gateway/platform-claims.test.mjs`: 26 tests.
- `qnfo-gateway/probes.json`: deploy probe for /platform.
- `qnfo-gateway/releases/3.63.7`, `3.64.0`, `3.64.1`, `3.65.0` and `3.66.0-codeagent.md`: release notes.

**Domain routing**
- `scripts/attach-surface-routes.py`: `ULTRASTABLE_HOSTS` covers ultrastable.io, .app, .net and the www names. It routes them to qnfo-gateway, creates originless DNS records and verifies from outside. The result is in `ci-status/attach-surface-routes.json`.

## Live surfaces
- https://ultrastable.io: the product home, live once attach-surface-routes verifies the routes.
- https://qnfo.org/platform: the same page. https://qnfo.org/api/platform-claims serves the JSON (7 of 7 claims passing, credit "Directed by Rowan Brad Quni-Gudzinas").
- https://fleet.qnfo.org/focus has tap questions with kinds product-name, product-design-credit, product-home, product-github and product-credit-public.

## Runtime state (Cloudflare)
- D1 qnfo-audit holds `product_claims`, `product_profile`, `owner_asks` (product-*), `human_actions` (ultrastable-*), `remediation_contracts` (claim-ultrastable-*) and the trigger `owner_asks_product_profile_au`.
- Zones ultrastable.io, ultrastable.app and ultrastable.net (owner-registered 2026-11-10). Their routes go to qnfo-gateway.

## Open items (each has an owner and a record)
- ROADMAP issues QNFO/qnfo-workers #10174 to #10177 (P1 to P4: policy pack, own D1, tenant settings, second installation).
- Owner cards ultrastable-domain-1, -trademark-1, -github-org-1 and -entity-1 are IDENTITY-BOUND (money, legal, accounts).
- The personal site, GitHub profile and CV still link to qnfo.org/platform. They move to ultrastable.io once the routes verify. Until then, qnfo.org/platform keeps serving the page, so no link is broken.
