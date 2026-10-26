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
