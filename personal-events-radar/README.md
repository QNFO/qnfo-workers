# personal-events-radar worker (QNFO.OPS.010 Stage B, 2026-09-02)

Weekly cron scan (Tue 05:30 UTC) of the SAME 24 venue sources as events-radar (QNFO.OPS.009),
scored against the PERSONAL plane preferences in personal-life D1 (profile facets + attendance
ledger). Hard gates applied in order:

1. standing filter - QPL / CWI topics excluded (profile facet, conf 0.95)
2. Schengen exit deadline 2026-10-17 - onsite Schengen-venue events blocked on/after that date
3. energy budget - max 2 in-person travel events per half-year; H2 2026 SPENT (LoF26+QPL26),
   next eligibility H1 2027; H1 2027 slots computed live from the attendance ledger
4. room-question gate - venue affinity ranks epistemically open venues up
5. tasting-menu protocol - 3-5 cheap online/hybrid experiments over the next 90 days

Cleared events (relevance >= 3) are POSTed to calendar-api /events?plane=personal
(source=personal-radar, status=tentative) with relevance+friction; dedupe against existing
calendar rows + the ledger before POST. Report persisted to D1 qnfo-audit.personal_radar and
delivered to obsidian-writer (R2 vault -> D:/Obsidian, section "Personal Events Radar").

Endpoints:
- GET /           -> latest report (markdown)
- GET /?run=1     -> trigger scan now (JSON result)
- GET /health     -> { ok, worker, version }
- scheduled()     -> weekly cron trigger

Deploy (canonical source = this repo dir):
cd qnfo-workers/personal-events-radar && wrangler deploy
