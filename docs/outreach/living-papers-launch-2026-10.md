# Living Papers launch, October 2026 (LIVING-PAPERS-LAUNCH-1)

Charter pillar: **reach**. Owner direction 2026-10-02 10:56Z: "Latest papers front-end looks amazing. This could be a new
standard for reading and understanding scientific research (e.g. arXiv), which is dense and indecipherable. Develop and
implement marketing/outreach/communications plan using all available channels."

This plan works inside STRATEGY-1 (docs/STRATEGY.md sections 4 and 5): the same gates, caps and never-list. It raises no cap,
buys no attention, and adds no worker. Measured facts carry the date they were read.

## 1. What we are offering

**One line:** research papers you can actually read. Every paper on papers.qnfo.org opens as a living paper. The text is
unchanged, but the page around it does the work a PDF leaves to the reader.

What a reader gets on every paper page (all live on gateway 3.9.1, 2026-10-02):

| Feature | What it does for the reader |
|---|---|
| Contents rail with scroll-spy and reading progress | see the paper's shape at once and know where you are in it |
| Rendered maths, tables and code | formulas typeset by MathJax; tables that were pipes in the source become tables |
| Reference previews | hover or focus a `[12]` to read the reference without losing your place |
| Ask this paper | ask a question in plain language; the answer comes from the paper, pinned as source [1], and cites what it used |
| Select a passage | ask about exactly that passage, or copy it as a quote with its citation |
| Context, versions, related | the knowledge-graph concepts the paper touches, every version of the work, and its nearest neighbours |
| Cite and share | APA, BibTeX or plain text in one click; the DOI where one exists (399 of 450 papers) |
| Open | free, no login, no paywall, licence stated on every paper; RSS, sitemap and llms.txt for machines |

**Claim, test, status** (STRATEGY 2.5: every post carries all three):
- Claim: a research paper can be easy to read without changing a word of it.
- Test: 450 open papers rendered this way. A full-corpus render sweep checks every page; pages with render defects fell from
  446 to 33 on 2026-10-02 and are re-measured by RENDER-FIX-3.
- Status: open beta, free, preprints (not peer reviewed), prepared with an AI-assisted research pipeline.

**What we do not claim.** "A new standard for arXiv" is the ambition, not a claim. Nothing here says the format is
better than arXiv's HTML, alphaXiv or Semantic Reader; we have no reader study. The papers are one author's preprints. Lead
with the format, never with a paper's physics headline (STRATEGY 2.2, "claims we never make").

## 2. Where we start (measured)

| Signal | Value | Read |
|---|---|---|
| Papers | 450 public, 399 with a resolving DOI | living-paper D1, 2026-10-02 |
| Pageviews | about 3,000 / 30 days run rate | STRATEGY 1 |
| Confirmed subscribers | 1 | `subscribers` |
| Bluesky | 42 followers | STRATEGY 1 |
| Social queue | 5 selected-work posts queued; cap 2 Bluesky posts / 7 days | `social_threads`, 2026-10-02 |

What follows from this: the audience is tiny, so the asset is the format, not the reach. People who would never read an
adelic-physics paper may still care how papers are read. Leading with the format reaches them.

## 3. Audiences and the one thing we ask of each

| Audience | Where they are | Ask | Lead |
|---|---|---|---|
| Builders of research-reading tools and open-science infrastructure (arXiv HTML, ar5iv, alphaXiv, Semantic Reader, scholarly-HTML projects) | GitHub, Hacker News, Bluesky, Mastodon | critique the reading experience | papers.qnfo.org/reading |
| Researchers who read many papers (quantum, physics, maths, ML) | Bluesky, Mastodon, LinkedIn | read one paper this way, subscribe | /reading, then a selected work |
| Engineering leaders | LinkedIn | follow, subscribe | /reading |
| Science journalists | email | none yet; only after there is evidence of use | later |

## 4. Channel plan

"Automatic" means the fleet does it inside the STRATEGY-1 gates. "Owner" means it waits for the owner, either because
platform norms forbid automation (STRATEGY 4) or because the session was refused the action (marked *refused*).

| Channel | Action | Who | When | Status |
|---|---|---|---|---|
| papers.qnfo.org | `/reading`: the format explained on one page, with a sample paper and subscribe; linked from the library | automatic (LIVING-PAPERS-PAGE-1) | at deploy | built |
| papers.qnfo.org | every paper re-rendered with RENDER-FIX-3 and FLAT-TABLE-1 (tables, code, maths) before any traffic is sent | automatic | deployed before launch | done (PR 514) |
| Search engines | resubmit the sitemap's pages through IndexNow after the re-render | automatic | at deploy | see 6 |
| Bluesky, then Mastodon, X and LinkedIn via Buffer | launch post `living-papers` (appendix A), UTM campaign `living-papers` | **owner approves the draft** (queue card `living-papers-launch`), then the drain posts it inside the cap | first free cap slot after approval | drafted |
| Email digest | not used for the launch: 1 confirmed subscriber | none | none | n/a |
| Cold email to tool builders | appendix C, at most 15 people with a public repository in the field, under the consent rules | **owner (*refused*)**: the session's attempt to have qnfo-outreach mine and mail this audience was refused as a real-world transaction | owner decides | not started |
| Hacker News | "Show HN" (appendix B) | **owner** (HN is manual by policy) | Tue to Thu, 14:00 to 16:00 UTC | drafted |
| Reddit, LessWrong | not used: self-promotion rules and fit | none | none | skipped |
| ORCID, LinkedIn profile, Google Scholar, ResearchGate, SSRN | add papers.qnfo.org as the website | owner (sign-in only; standing decision: not re-asked) | optional | n/a |
| arXiv | not pursued (endorsement policy; STRATEGY 5) | none | none | n/a |
| AI assistants | llms.txt already lists every paper | automatic | live | done |

## 5. Phase 2: the "for arXiv" part (owner decision)

The ambition, a better way to read any paper, needs papers that are not QNFO's. There are three options:
1. **Bring your own paper (recommended first).** An author asks for their own preprint (Markdown, LaTeX or an arXiv ID they
   wrote) to be rendered as a living paper. Rights are clean because the author grants them. Start as a demand test, an
   offer on qnfo.org/work-with-me counted like the others, before anything is built. This commits the owner's time, so it
   is the owner's call (STRATEGY 5, "never automatic").
2. **CC BY arXiv papers only.** The licence permits re-rendering with attribution. arXiv's default licence does not permit
   redistribution, so most papers are excluded. This needs a renderer for LaTeX, which is a new build, not a route.
3. **None.** Stay a reader for QNFO's own work.

Cost and the net-zero rule: options 1 and 2 are routes in qnfo-gateway (no new worker). Ask cost stays inside qnfo-ai-search's
per-visitor and global caps.

## 6. Measurement

- **Campaign code** `living-papers` (social UTM is added by qnfo-social from the row slug; `entity_map` row).
- **Scorecard, existing metrics:** `engaged_human_sessions_28d`, `subscribers_growth_monthly`,
  `social_engagement_rate_30d`, `warm_conversations_30d`, `credibility_events_90d`.
- **New, so the launch can be judged:**
  - `subscribers.source`: the page and UTM campaign a subscription came from (SUBSCRIBE-SOURCE-1). Without it no
    subscription can be tied to a post.
  - `paper_render_defect_pages`: pages whose rendered text still shows raw Markdown, raw table pipes or an odd number of `$`
    (RENDER-HEALTH-1). This is a guard metric: traffic must not rise while quality falls.
- **Success at 30 days** (falsifiable; read on 2026-11-03):
  - 3 or more substantive replies from tool builders or researchers about the format;
  - 5 or more new confirmed subscribers with a `living-papers` source;
  - `/reading` plus paper-page engaged sessions up 30% on the prior 28 days.

  If none moves, the lever is replaced, not repeated (METRIC-CLOSED-LOOP-1).

## 7. Risks and failure modes

- **The content can sink the format.** A tool builder who clicks into a paper titled "There are no quanta" may dismiss the
  whole site. Launch links go to `/reading` and the selected works, never the raw index.
- **Rendering is heuristic.** About 10 papers came through docx and pandoc with code flattened into table cells; they still
  read badly. RENDER-HEALTH-1 keeps the count visible.
- **A Hacker News spike can exhaust the Ask cap** (300 questions a day in total). Visitors then see a capacity message.
  That is acceptable, but it is the most likely visible failure on launch day.
- **The cadence cap makes social slow.** 2 Bluesky posts a week, and 5 selected works are already queued. The learner chooses
  the order, so the launch post can wait a week or more after approval. That is by design (volume is never a target).
- **Cold email to open-source maintainers can read as spam.** That is why it is capped at 15, gives a reason tied to each
  person's repository, and was refused for automatic sending; it is the owner's call.

## Appendix A. Launch post (Bluesky, 296 characters with the UTM tag)

> Claim: research papers can be easy to read without changing a word: contents, rendered maths, reference previews, and an Ask panel that cites the paper.
> Test: 450 open papers.
> Status: open beta, free.
> https://papers.qnfo.org/reading

## Appendix B. Show HN (owner posts)

Title: `Show HN: Living papers – research papers with a contents rail, reference previews and cited Q&A`

URL: `https://papers.qnfo.org/reading`

Text:
> I publish my research as preprints (450 so far) and found that nobody, including me, reads a PDF
> on a screen comfortably. So every paper on papers.qnfo.org now opens as a "living paper": the text is unchanged, but the page
> gives you a contents rail with reading progress, typeset maths, hover previews for references, the paper's versions and
> related work, and an Ask panel that answers from the paper and cites what it used.
>
> It runs on Cloudflare Workers; papers are Markdown rendered server-side, maths by MathJax, and Ask uses an open model with
> the paper pinned as source [1]. Limits: these are my preprints, not peer reviewed, prepared with an AI-assisted pipeline;
> some older papers came through docx and pandoc and still have formatting defects; Ask is rate-limited.
>
> I'd value critique of the reading experience from people who read a lot of papers. What would make you read a paper this
> way instead of the PDF?

## Appendix C. Email to a tool builder (owner sends; at most 15; consent rules apply)

Subject: `A reading format for research papers: would value your critique`

> Hi {name}, I came across {repository}, and since you build tools for reading research, I'd value your eye on something.
>
> I've rebuilt how my papers are presented: every paper on papers.qnfo.org opens with a contents rail, typeset maths,
> reference previews, its versions, and an Ask panel that answers from the paper and cites it. One example:
> https://papers.qnfo.org/reading
>
> One question: what would stop you from reading a paper this way instead of the PDF? Any reply helps, and I won't follow up.
>
> Rowan Brad Quni-Gudzinas, QNFO (independent research)
> (opt-out line added by the sender, per OUTREACH-CONSENT-1)
