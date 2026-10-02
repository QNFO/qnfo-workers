# iPatent audit and redesign plan (2026-10-02)

**Scope:** ipatent.qnfo.org and qnfo.org/ipatent: value as a QNFO flagship and conversation piece, current traffic,
usefulness for US provisional applications, and search visibility. **Charter pillars:** reach, security, research.
**Shipped with this audit:** PR #407 (qnfo-ipatent 3.5.0, qnfo-gateway 3.7.26).

## 1. Verdict

As it stood, iPatent could not be a flagship. It had **no outside users, no search presence, and a confidentiality
flaw that disqualifies a patent tool**: every inventor's submission was listed on a public endpoint. Its copy claimed
things the record does not support. The idea underneath is sound and fits QNFO's research line ("what an
AI-assisted claim is worth"), but only if iPatent stops being a "type an idea, get a patent" toy and becomes an
instrument that measures and closes the one gap that decides whether a provisional is worth anything: **written
support for what you will later claim**.

## 2. Traffic (measured)

| Signal | Value | Source |
|---|---|---|
| Drafts ever | 59 since 2026-07-12 | `ipatent-db.submissions` |
| Of those: red-team / malformed tests | about 30 (launch day) | user agents `Red-Team-Audit/1.0`, `RedTeam/1.0`, PowerShell |
| Of those: owner testing (NL) | about 25 | NL desktop, corpus titles loaded via "Invent Something" |
| Plausible outside humans | 2 or 3 (GB, 2026-07-12 and 2026-09-04) | country, UA |
| Last draft | 2026-09-11 (none in 21 days) | `submissions` |
| Pageviews | **unmeasured**: no analytics beacon on the page; the D1 `analytics` table stopped on 2026-07-12 (41 events) | page source, D1 |
| Search | no indexed page; "iPatent qnfo" returns only GitHub PRs; the name "iPatent" is taken by an Israeli IP firm (ipatent.co.il) and a US patent-agent business | web search |
| Links from qnfo.org | none (hub, nav, footer, sitemap) | qnfo.org |

## 3. Findings

**Critical: confidentiality.** `/api/disclosures` listed submissions and `/api/submission/:id` returned the full text,
publicly. Publishing an unfiled invention is a disclosure: fatal to novelty in Europe (EPC Art. 54) and most countries,
and it starts the US one-year clock (35 U.S.C. 102(b)(1)). Raw IPs, user agents and emails were stored. The USPTO's
April 2024 guidance on AI tools names exactly this confidentiality risk. *Fixed in #407.*

**Search: invisible by construction.** No robots.txt or sitemap (both returned 404 JSON), no canonical, no Open
Graph or structured data, one JavaScript page with no indexable content, `HEAD /` returned 404, and qnfo.org/ipatent
served a 200 duplicate (the gateway's 301 is shadowed by the ipatent route). Not linked from anywhere QNFO controls.
*Fixed in #407*, except the name collision, which is an owner decision (s6).

**Copy vs the record (STRATEGY-1 s2).** "Grounded in real filings" / "proven disclosure structure" (the corpus is the
author's own draft disclosures, several from folders named `Early_Drafts` and `99_Brutal_Cleanup`); "defensible";
"Free AI, zero-cost at scale" (fleet AI spend is over its cap); "deepseek-r1 (free)" (live model is deepseek-v4-pro);
`ipatent.me` in every generated document (STRATEGY says never cite it). *Fixed in #407.*

**Usefulness: optimises the wrong part.** A provisional needs no claims; its only job is to describe the invention
well enough that later claims inherit its date (35 U.S.C. 112(a)). The tool spent its effort on 8-15 claims and a
"declaration", capped the detailed description at 5-12 sentences, had no drawings support, and its "prior-art
closeness" warning compares only against the author's own drafts. The output read like a patent and secured almost
nothing. *Partly addressed in #407* (support-gaps section, guide, honest prior-art label); the rest is the redesign.

**Strategy conflict.** STRATEGY-1 s2.1 and s7 say iPatent is "maintain, not promoted". Making it a flagship is an
owner change to those rows.

**Cost risk.** Each draft is one long reasoning-model call (up to 9k tokens). Promotion without a global daily cap
adds unattributed Workers AI spend to a budget already over its cap.

## 4. The redesign: from toy to "Provisional Workbench"

The organising idea: **a provisional is only worth what it supports.** Every feature serves completeness and
makes the gap visible.

1. **Guided interview, not a single textbox.** Problem → components → how it works → one fully worked embodiment
   (numbers, materials, steps) → alternatives → figures → data. A live completeness meter per element.
2. **Support map (the centrepiece).** Every draft claim element linked to the paragraphs that support it; red where
   nothing does. Inventors fix the red before filing. Paid inventor tools sell this as "support QC"; iPatent does it
   free, openly, with the method published.
3. **Drawings builder.** Figure list with reference numerals; generates the brief description of drawings and keeps
   numerals consistent; optional SVG block diagram from the component list.
4. **Real prior-art starting search.** Query public patent data (e.g. USPTO PatentsView) and label it plainly as a
   starting point, not a clearance or novelty opinion. Retire the corpus-closeness warning or rename it.
5. **Filing-ready export.** Word/PDF with paragraph numbering [0001], single column and page numbers (the corpus
   itself contains Patent Center warnings for missing exactly these), plus an SB/16 cover-sheet checklist.
6. **Privacy you can audit.** Stateless by default (shipped); optional saved drafts encrypted in the browser with the
   key in the URL fragment, so the server cannot read them; a short published data statement.
7. **Cost guard.** Global daily draft cap and per-draft cost attribution in the fleet ledger.

## 5. The conversation piece

Make iPatent the public instrument of QNFO's epistemics line: **"What does an AI-drafted provisional actually
secure?"** An open benchmark: take issued US patents, give each tool only an inventor-level description, and measure
the share of the issued claims' elements that the AI draft supports in writing, plus the rate of statements the
inventor never made. Publish the method and data with a DOI, run iPatent and any tool that agrees to be measured, and
keep a live results page at ipatent.qnfo.org/benchmark. It is honest, falsifiable, useful to inventors and
practitioners, and it is the kind of claim QNFO already says it audits.

## 6. Search plan

- **Shipped (#407):** robots.txt, sitemap.xml, canonical, OG, JSON-LD (WebApplication, Article, ORCID author),
  indexable `/guide`, 301 from qnfo.org/ipatent, hub card, footer link and sitemap entries on qnfo.org.
- **Target descriptive queries, not the brand:** "provisional patent application template", "what to include in a
  provisional patent", "provisional patent drawings", "provisional patent written description". One strong page per
  query, not volume.
- **Owner decisions:** rename or add a descriptive product name ("iPatent" cannot rank against existing firms);
  re-verify Search Console for the subdomain (STRATEGY retired it as a fleet source, but indexing needs it);
  enable Cloudflare Web Analytics on ipatent.qnfo.org.
- **Earned links come from the benchmark,** not from posting the tool.

## 7. Roadmap

| Phase | Work | Size |
|---|---|---|
| 0 (done) | #407: privacy, findability, honest copy, support gaps, guide, hub link | shipped as PR |
| 1 | Analytics on; purge or hash legacy rows; global daily cap; STRATEGY-1 rows updated | small, owner + 1 PR |
| 2 | Guided interview, support map, figures builder, Word/PDF export | 1-2 weeks |
| 3 | Public prior-art starting search; encrypted saved drafts | 1 week |
| 4 | Benchmark paper + live results page | 2-3 weeks |

## 8. Decisions for the owner

1. Promote iPatent (change STRATEGY-1 s2.1 and s7 from "maintain, not promoted")?
2. Purge the 59 legacy rows, or hash their IPs and keep the texts?
3. Keep the name "iPatent", or add a descriptive name?
4. Approve the benchmark as the next epistemics work?
