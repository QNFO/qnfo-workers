# Jobs agent: how applications reach an ATS, Greenhouse in detail, and a system for interviews and offers (2026-11-06)

Charter pillar: personal. Owner goal: an interview, and ideally an offer, for every position applied for.
Honest finding first: an offer on every application is not achievable by any method (best-case benchmarks below are 3.6-8 percent application-to-interview).
What is achievable and measurable: raise interview rate per application by applying only where fit and channel are strong, and raise offer rate per interview by preparation. The agent is built around those two levers.

## 1. How an application travels
- Employers post a job in their ATS (Greenhouse, Lever, Ashby, Workday, SmartRecruiters). The ATS publishes a public board feed (Greenhouse: boards-api.greenhouse.io/v1/boards/{token}/jobs; Lever: api.lever.co/v0/postings/{company}) and can push the job to aggregators (Indeed, Glassdoor, LinkedIn).
- Third-party boards mostly copy the listing and send the candidate to the employer's own apply URL, or to an embedded form; the application lands in the same ATS record, tagged with a source (Greenhouse source tokens / `gh_src` on the tracking link).
- Consequence for the agent: the employer's own board is the primary record. Apply there (agent already prefers it), keep the source honest, never submit the same role twice, and avoid repeat applications to one company (Huntr Q1 2026: 8+ applications at one company 1.91 percent interview rate vs 6.07 percent for one).

## 2. Greenhouse ins and outs (from Greenhouse documentation and secondary guides)
- Every application enters the Application Review stage; a recruiter advances or rejects it. Greenhouse states it does not use AI to rate or auto-reject candidates.
- The only automatic rejection is employer-configured Application Rules (Auto-Tag, Auto-Advance, Auto-Reject) keyed to custom screening questions, available on Plus and Pro tiers only. So the "ATS robot" rejection is almost always a knockout answer (work authorization, location, license, minimum years), not resume wording.
- Greenhouse parses the resume into fields. Parsed fields drive recruiter Boolean search and filters, so a misparse makes the candidate unfindable. Formatting traps: columns, tables, text in images, headers/footers.
- Optional AI "Talent Matching" can order the queue by match category; it does not reject or advance (vendor statement; secondary sources conflict on details, label uncertain).
- Later stages: recruiter screen, hiring-manager review, assessment, onsite; each interview has an interview kit with a scorecard of focus attributes; every interviewer asks the same core questions and rates attributes; a roundup decides on behavior evidence, not gut feeling (Greenhouse structured hiring guide).
- Consequences: (a) read every knockout question before the click, answer truthfully; (b) text-based single-column PDF or DOCX with standard headings; (c) free-text answers are read by a person: specific evidence for the question asked; (d) in interviews, prepare behavior stories mapped to likely focus attributes from the posting.

## 3. Evidence on outcomes (2026, vendor datasets, directional)
- Application to interview 3.6-4.7 percent (Ashby 2026), up to 6.7 percent EMEA. Interview to offer about 20-39 percent depending on source and stage. Median 108 days to first offer (Huntr Q1 2026).
- Fewer, better-targeted applications convert better: 11-20 applications per quarter 8-9 percent per application vs 2.6-2.9 percent for 100+ (Huntr). Referrals and sourced candidates convert far above cold applications (first screen to onsite 52 percent for referrals, Ashby).
- Counter-evidence and caveats: user-reported or vendor-published numbers, selection bias, and Huntr users who send fewer applications may be more qualified. Treat as direction, not law.

## 4. The system (what the agent does for each application)
1. Target: only apply where the model judge says fit and the posting is on the employer's board; wide mode stays opt-in.
2. Knockouts: surface every protected or knockout question for the owner to answer himself; never auto-answer (PROTECTED_Q already does this).
3. Resume: ATS-safe text PDF built only from the verified claims bank (shipped in PR 8198).
4. Free-text answers: evidence-grounded drafts, fact-checked against the bank (shipped).
5. Referral step before cold apply: for each target, list people to ask (backlog: HANDOFF item).
6. Interview readiness: per-job brief mapping posting requirements to the owner's stories, likely scorecard attributes, questions to ask, quiz with feedback (shipped).
7. Funnel: record stage per application (applied, screen, interview, offer) and report conversion by channel and by judge fit band, so the claim "this is working" is measured (backlog).

## Sources
- https://support.greenhouse.io/hc/en-us/articles/203105595-Application-Rules-Overview
- https://my.greenhouse.com/blogs/how-does-greenhouse-use-ai-heres-everything-candidates-need-to-know
- https://my.greenhouse.com/blogs/what-really-happens-after-you-apply-for-a-job
- https://support.greenhouse.io/hc/en-us/articles/7458660561819-How-do-I-track-the-application-source-from-third-party-job-boards-
- https://support.greenhouse.io/hc/en-us/articles/360039539772-Structured-hiring-guide
- https://support.greenhouse.io/hc/en-us/articles/115002226826-Use-interview-kits-
- https://cavuno.com/blog/ats-platforms-public-job-posting-apis
- https://huntr.co/research/job-search-trends-q1-2026
- https://www.herohunt.ai/blog/recruiting-funnel-conversion-rates-2026-stage-benchmarks/
