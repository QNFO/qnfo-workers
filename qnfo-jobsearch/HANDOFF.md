# qnfo-jobsearch handoff (fail-safe for a session that stops mid-work)

State on 2026-11-06: 1.9.0 is in a draft PR (branch `claude/jobsearch-judge-pdf-prep`). Tests: `node qnfo-jobsearch/jobs-judge-pdf.test.mjs` plus the four existing suites. Research and design: `docs/JOBSEARCH-RESEARCH-2026-11.md`.

Order of work still open (each is a code change, not a report):
1. Phone UI: screens for Answers (`POST /api/answers`), Prep and Quiz (`/api/prep`, `/api/prep/quiz`), and a Calibrate row (qualified / stretch / not qualified) on every match and on pasted checks. Add a journey in `scripts/ux-journeys/apps/` (UX-JOURNEYS-1).
2. Judge in the hourly run: score the top N rubric matches and N random rejects with `judgeJob`, store `judge_fit`, and rank by a blend once `GET /api/calibration` shows the judge agrees with the owner more often than the rubric (judge_agreement_pct > rubric_agreement_pct over 30 or more verdicts).
3. Rubric: stop capping titles outside `FAMILIES` at 49 when the judge reads 60 or more; add the AI, physics and research-integrity families the record now supports.
4. Designed PDF variant for e-mailing people (the current `resume.pdf` is the single-column ATS one; keep it).
5. Referral step: for each applied or approved match, list the owner's contacts at that employer and draft the message (the owner sends it).
6. Companion link: when a match reaches `interview`, create the prep brief and put a calendar event with the brief link into personal-companion (look up its calendar route with `GET /fleet-graph/worker?worker=personal-companion` first).
7. Paste parsing: take the title from the page's `<h1>` or JSON-LD, not the first line.

Rules: bump with `python scripts/worker_release.py bump qnfo-jobsearch`, keep the mirror identical, run `python scripts/narrative-prompt-guard.py`, never merge a draft the owner has not released.

## JOBSEARCH-AUTONOMY-1 (1.13.0, 2026-11-09)
The owner now targets autonomous and AI systems research; quantum is no longer a target. Positioning and wording come from `docs/BRAND.md` in rwnq8/resume. What changed: `fam_autonomy` (on by default), `fam_quantum` off by default, clusters `autonomous_systems` and `systems_modeling`, quantum feeds dropped, research headline H2 for AI postings, and the one-time live-bank migration `ensureAutonomyBrand` (meta key `autonomy_brand_v1`). Verify: `node qnfo-jobsearch/autonomy.test.mjs`; live, `GET /api/ledger` shows the new H2 and `GET /api/prefs` lists `fam_autonomy`.
## JOBSEARCH-FIT-1 and JOBSEARCH-LINKEDIN-1 (1.16.2, 2026-11-09)
Owner: rejected after applying to roles the search showed; does not know what to search on LinkedIn. Live audit that day: 5 of 7 roles applied to or approved were hands-on coding or big-lab engineering roles; 36 of 63 pending matches were engineer, data-engineer or plain data-science titles, or in places the owner said No to (US, other EU countries) shown as "stretch".
What changed: hands-on coding roles are opt-in (`fam_tech` default No); `codingLoad` reads the posting and drops a role with 4+ distinct coding asks, penalises 2-3; places the owner said No to are dropped even in wide mode; AI governance, risk, assurance and evaluation lane terms added (a title stays a small bonus, JOBSEARCH-CONTENT-FIRST-1); new `fam_sysmodel`; "Too much coding" feedback chip (reason `coding`, weighs like `field`); Workable fetcher and `CANDIDATE_BOARDS` (55 employer boards probed by the worker, failures silent, live ones listed in `/api/ops` `candidates_live`); `GET /api/linkedin` and the "What to search on LinkedIn" panel; `RANK_RULES` in prefs_hash retires pending matches the new rules no longer list on the first run.
Verify: `node qnfo-jobsearch/fit.test.mjs`; live, `GET /api/linkedin` lists 8 searches, `GET /api/ops` shows `candidates_live`, and no pending match has an engineer title.
Next (code-task): move every slug in `candidates_live` into `BOARDS` and delete the rest from `CANDIDATE_BOARDS`.
