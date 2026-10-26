# Paper authoring guidelines: the plain-language standard (PLAIN-STANDARD-1)

Charter pillar: **reach** (a paper that only its own field can read reaches nobody else), constrained by **cost** and by the rule that
nothing is published that the paper does not say. Owner request 2026-10-25 (`owner_prompts` op-mvnq2nswe765, `agent_issues` 1000181).
Read this with `docs/ENSEMBLE-POLICY.md` before adding or changing anything that writes a paper or a summary of one.

Every published paper has two texts for two readers. The **paper** is exact enough for a domain expert to understand and implement.
Its **summary** ("In plain language", shown on the paper page and in the quick read) is written for everyone else. The rules below
bind both generators; the second part of this file says where each is enforced and how far today's output is from it.

## The four rules (the owner's words, made checkable)

| # | Rule | What is checked |
|---|---|---|
| R1 | The summary avoids jargon and detailed numerical analysis. | Everyday words and active voice. At most two figures, rounded or in words ("about a thousand-fold"), never a list or a table of results. No DOI, arXiv identifier, link, citation marker or "et al". Check: at most 6 digit characters and none of those tokens. |
| R2 | The summary is written at an average adult reading level. | Flesch-Kincaid grade of the summary: target 8 (the average adult), gate 9, never stored above 12. At most 6 sentences, each under 20 words. |
| R3 | Every domain-specific term is defined and explained inline, in plain-language metaphors. | The first time a technical term appears, one clause in everyday words says what it is; a short comparison to everyday life is allowed when it adds no fact (no new number, name, date or causal claim). A term is never defined by another term the reader has not met. |
| R4 | The main paper stays specific enough for a domain expert to understand and implement, and stays interpretable enough for a non-expert to see its general, cross-disciplinary relevance. | Derivations, parameters and procedure stay exact (Sections 3 to 5). The Introduction opens with the real-world problem and closes with one or two plain sentences naming other fields or problems the result could matter to; Section 7 names who would use it. The summary carries the generalisation, not the equations. |

Constraint above all four (existing rule, unchanged): a summary adds nothing the paper does not say. Every number, name, date and
link in it appears in the paper text, and a metaphor is a definition aid only. A summary that cannot meet R2 without losing the
paper's claim is shortened, not embellished.

## Where each is enforced today

| Piece | Where | State |
|---|---|---|
| Paper writer prompt | `qnfo-research-exec/worker.js`, the writer requirements list: Section 1 opens with the real-world problem; "Write for an adjacent-field expert; define jargon once"; Section 7 names users and readiness; review item 6 marks unexplained jargon SOFT | R4 half-met: nothing asks for other fields |
| Summary prompt | `qnfo-gateway/worker.js` `plainPrompt` (model `@cf/openai/gpt-oss-120b`): everyday words, a term in one short clause or left out, claim plus "its key numbers", at most `PLAIN_MAX_SENT` = 6 sentences; a strict retry (sentences under 16 words, no technical terms) when the first try is above `PLAIN_TARGET_GRADE` = 9 | R1 not met (asks for key numbers), R3 partly (no comparison), R2 gate soft |
| Summary gates | `plainBuild` keeps the lower-grade of at most two tries even when it is above 9; `plainGround` and `plainUngrounded` drop statements and capitalised names not in the paper; `plainHasPromptResidue` rejects instructions and formatting | grounding and residue gates meet the constraint |
| Storage | living-paper `plain_summary` (`slug`, `rev`, `text`, `dropped`, `grade`, `method`, `generated_at`), filled `PLAIN_FILL_MAX` = 12 a run, keyed on the paper text | measurable per paper |

## Audit of the published corpus (2026-10-26, living-paper D1, SELECT only)

704 papers are published and 704 have a summary (100 percent). Against the rules:

| Measure | Papers | Share |
|---|---|---|
| Grade 8 or below (R2 target) | 296 | 42 % |
| Grade 9 or below (R2 gate) | 356 | 51 % |
| Above grade 9 | 348 | 49 % |
| Above grade 12 (too domain-specific; revise first) | 224 | 32 % |
| Six or more digit characters (R1) | 495 | 70 % |
| DOI, arXiv identifier or "et al" in the text (R1) | 5 | 1 % |
| A sentence dropped by the grounding gate at build | 169 | 24 % |

Mean grade 9.57, worst 24.5. The long cases are single sentences that stack a technical term and its definition, for example a
summary of a paper on Majorana zero modes at grade 24.5.

```sql
-- the audit and the closing probe of PLAIN-STANDARD-1 (read only, living-paper)
SELECT COUNT(*) AS summaries, SUM(s.grade > 12) AS over_grade_12, SUM(s.grade <= 9) AS at_grade_9_or_below,
       SUM(instr(' ' || lower(s.text) || ' ', ' doi ') > 0 OR instr(lower(s.text), 'doi:') > 0 OR instr(lower(s.text), 'doi.org') > 0
           OR instr(lower(s.text), 'arxiv') > 0 OR instr(' ' || lower(s.text), ' et al') > 0) AS reference_tokens
FROM plain_summary s JOIN papers p ON p.slug = s.slug WHERE p.status = 'published';
```

## Gaps and who closes them

1. **Summary generator** (R1, R2, R3): `plainPrompt` asks for at most two rounded figures, a one-clause definition (a comparison when
   it adds no fact) for each technical term, short sentences for an average adult, and no references; `plainBuild` adds a last pass
   that shortens the best candidate when it is still above grade 12 and never stores one above 12; the build records the rule
   version in `plain_summary.method` so summaries made under the old prompt refill, 12 a run, worst grade first. Issue
   PLAIN-STANDARD-1 carries it (code-task on `qnfo-gateway/worker.js`) with the probe above: no summary above grade 12, no
   reference token, at least 75 percent at grade 9 or below. The same file carries the Ask feature's plain mode (ASK-PLAIN-1 and 2,
   another session): a summary is a restatement written once, an Ask answer is grounded in the question; the two keep separate prompts.
2. **Paper writer** (R4): one line in the Introduction requirement of the writer prompt (issue PAPER-AUDIENCES-1, code-task on
   `qnfo-research-exec/worker.js`). Nothing else in the writer or reviewer prompts changes.
3. **Revision of existing summaries** needs no per-paper edit: the refill in item 1 replaces them. A paper's own text is never
   rewritten to fix its summary.

A change to a number in this file (a grade, a count, a sentence limit) lands by pull request with the audit re-run in the description.

## The plain-language article (PLAIN-ARTICLE-1, 2026-10-26)

Owner directive 2026-10-26: for each and every paper, the Quick Read rewrites the paper entirely in plain, simple language, without jargon,
complex numeric or mathematical expressions, or domain-specific terminology; a brief plain-language summary links to it and encourages readers to
click through to a deeper non-technical version (like Simple English Wikipedia), with links to external resources in plain language.

What a reader gets, in order: the paper page's "In plain language" box (the short version, two or three sentences) with a link "Read the
plain-language version (about N min, no jargon, no mathematics)"; `/papers/<slug>/quickread`, which opens with the plain article (plain title,
the short version, four to seven plain sections in the paper's order, the words used, "Learn more in plain language" links, a pointer on to the
paper) and keeps the extractive digest below it, folded, for specialists. A paper without an article shows the digest and says that the
plain-language version is not ready yet.

| Rule | Checked by |
|---|---|
| R5 No mathematics: no formulas, symbols, Greek-letter names, equals signs, percentages or letter-and-number labels; at most a handful of numbers, rounded or in words | `articleProblems`: hard for a symbol, a label, a Greek-letter name in a paper that has mathematics; soft for more than four numbers or the word "equals" more than once |
| R6 Everyday words, short sentences, every unavoidable specialist term explained in the sentence that uses it | grade 9 or below (never stored above 12), at most three sentences over 28 words; the verifier (gpt-oss-120b, another family than the writer) lists unexplained words and any math-like text, and the writer repairs once |
| R7 The whole paper, in its order, with its limits stated; nothing the paper does not say | the writer reads up to 36000 characters (reference list and appendices cut); a capitalised name the paper never uses is dropped with its sentence; no link, DOI, citation marker or "et al" |
| R8 Links are real: Simple English Wikipedia first, English Wikipedia (labelled more technical) when no simple page exists | each link is confirmed against the Wikipedia API at build time and is not a disambiguation page; title and a label only, no text of the page is copied |

Pipeline: writer kimi-k2.6 (reasoning off), deterministic gate, verifier gpt-oss-120b, one repair, store; a text that still breaks a hard rule is not
stored (status failed, retried three times six hours apart). Built by the gateway's hourly cron, 15 papers a run, three at a time, newest first, never
on a reader's GET. Measured 2026-10-26 on a paper about anyon condensation, the hardest kind: llama-3.3-70b wrote 323 vague words, gpt-oss-120b came out
at grade 11.5 with 14 symbols, kimi-k2.6 at grade 7 to 8 with the content intact (388 neurons; verifier 55; repair 195).

Measured by (qnfo-audit, published hourly by the gateway into `analytics_dash_meta`): `plain_article_coverage_pct` (target 95, trigger 90, empty for the
first 72 hours of the backfill), `plain_article_hard_violations` (target 0), `plain_article_failed_final` (at most 35). Read-only counts and the grade
distribution: `GET https://papers.qnfo.org/_audit/quick-read`, key `plain_articles`.

```sql
-- living-paper, read only
SELECT status, COUNT(*) AS papers, ROUND(AVG(grade), 1) AS mean_grade, SUM(grade > 9) AS above_9, SUM(grade > 12) AS above_12 FROM plain_article GROUP BY status;
SELECT slug, attempts, note FROM plain_article WHERE status = 'failed' ORDER BY attempts DESC LIMIT 20;
```

Gap, stated rather than hidden (OUTPUT-QUALITY-LEDGER-1): coverage and grade are proxies. The reader outcome (readers who open the box and go on to the
article, and how many then stay) is not measured: the fleet has path-level data for crawlers only. The measure to add when human page views by path
exist is the share of paper-page views followed by a Quick Read view within the session. Until then a faulty article is found by a reader's report
(select the passage on the paper page, choose Report) or by the verifier's counts in `plain_article.verdict`.
