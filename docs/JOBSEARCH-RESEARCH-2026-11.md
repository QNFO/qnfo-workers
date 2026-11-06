# Jobs agent: research basis and design (JOBSEARCH-JUDGE-1, 2026-11-06)

Charter pillar: personal. Owner brief 2026-11-06: matches he is qualified for scored "weak"; no free-response help, no PDF, no interview prep, no link to the companion.

## Findings (read from code and qnfo-audit on 2026-11-06)
- The fit score is a hand-written rubric: title-family lists (`FAMILIES`), keyword clusters (`CLUSTER_KW`), and a cap of 49 for any title outside the lists. "Applied Researcher - Scientific AI" (Prime Intellect) scored 31 because the title is in no list. The CORE clusters (federal, policy, transport) carry the most weight and match the FHWA/AARP record, not the current AI, physics and research-integrity direction.
- A pasted page with a logo heading parsed as company "the employer", title "Anthropic Logo" (fit 30).
- 233 matches stored, 43 rejected by the owner (most with no reason), 4 applied, 0 replies, 0 interviews.
- `GET /api/matches` already orders tier A, B, C, so stretch roles list last; the first impression of foreign roles at the top came from a score-ordered query, not from the app.

## Research (sources in the PR description)
- Semantic or LLM-based matching reads meaning and can explain fit; keyword matching misses transferable evidence.
- ATS file format advice conflicts (DOCX safest vs text PDF fine); single column, real text and standard headings are the constant. Design-tool PDFs and column layouts are the risk. Hence `resume.pdf` is a one-column text PDF; the DOCX stays.
- Application answers: evidence not assertion, answer the question asked, write to what the employer says matters, never "see resume".
- Interview prep: a core bank of 5 to 6 versatile STAR stories, role brief, practise out loud, 3 to 6 hours for a role that matters.
- Channels: referrals and careers pages convert far above job boards (vendor data; direction, not exact multipliers).

## Built in 1.9.0
Model fit reading beside the rubric (`analyze` returns `judge` and `second_opinion`); owner calibration (`POST /api/calibrate`, `GET /api/calibration` with agreement rates); `GET /api/matches/:id/resume.pdf` and `resume_pdf_b64` in the kit; `POST /api/answers` (protected questions come back `owner_only`; numbers and tools are re-checked against the record); `POST /api/prep` and `POST /api/prep/quiz`. Every model call fails soft.

## Not built yet (each has an owner in HANDOFF.md)
Judge-driven ranking of the hourly run (needs calibration data first), designed second PDF variant, referral step, companion link and calendar-triggered prep, front-end screens for answers, prep and quiz.
