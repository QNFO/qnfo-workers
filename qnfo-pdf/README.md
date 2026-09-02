# qnfo-pdf — cloud-native PDF renderer

Cloud-native PDF rendering for QNFO scientific papers. Replaces the local
\`render-pdf.cjs\` (puppeteer + local Chrome) with a Worker that renders paper
markdown to a polished A4 PDF via Cloudflare **Browser Run** (headless Chromium)
and **MathJax** (SVG) for math.

## Why

The prior PDF path was local-only and low quality:
- **Tables** rendered with a naive split-on-\`|\` parser (dropped empty cells,
  ignored alignment colons, broke on \`|\` inside math).
- **Math** was captured before MathJax finished (async race) or mangled by the
  emphasis pass (\`*\`/\`_\` inside \`$...$\`).
- **No polish**: no title block, no page numbers, no print typography.

## What it fixes

- \`renderer.js\`: robust markdown -> print-HTML renderer
  - GFM tables: alignment (\`:---:\`), escaped pipes \`\\|\`, preserved empty
    cells, math-in-cells.
  - Math: inline \`$...$\` / \`\\(...\\)\` and display \`$$...$$\` / \`\\[...\\]\`
    extracted to placeholders BEFORE emphasis/table-split.
  - YAML front matter -> title block (title/author/ORCID/date/version/DOI/abstract/keywords).
  - Pandoc citations \`[@key; @key2]\` -> bracketed markers.
- \`worker.js\`: Browser Run \`quickAction("pdf")\` with MathJax wait
  (\`data-mathjax-done\` marker) + A4 print options (header/footer page numbers,
  margins, tagged PDF).
- Print CSS: booktabs-style tables, serif typography, hyphenation, page-break
  control, centered display math.

## Endpoints

- \`GET /health\` — status + bindings present
- \`GET /pdf/:slug\` — render paper PDF (from D1 living-paper)
- \`GET /html/:slug\` — render paper HTML
- \`POST /pdf\` — render PDF from \`body_md\` (JSON \`{body_md, title, slug}\` or raw markdown)
- \`POST /html\` — render HTML from \`body_md\`

## Deploy

\`\`\`bash
cd qnfo-workers/qnfo-pdf
npx wrangler deploy
\`\`\`

## Bindings

- \`BROWSER\` (Browser Run), \`LIVING\` (D1 living-paper), \`RELEASES\` (R2 qnfo-releases).
