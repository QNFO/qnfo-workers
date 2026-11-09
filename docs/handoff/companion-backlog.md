---
status: open
slug: companion-backlog
updated: 2026-11-09
---
# Companion backlog handoff (code agents: finish from this file and the issues)

State: personal-api 4.38.3 live. Source of truth is personal-api/companion.js; run `node personal-api/inline-companion.mjs`, then `python3 scripts/worker_release.py bump personal-api --note "..."`, then push. Never PUT the Worker directly (a CI deploy reverted the UI on 2026-11-07). personal-api/probes.json asserts the companion page markers.

Open items, each an agent_issues row with a code-task and code-probe (closing probe = marker comment in companion.js):
COMPANION-SOURCES-1 1002299, FORYOU-5 1002300, E2E-1 1002296, BACKUP-1 1002305, NUDGE-2 1002302, OPS-SEC-1 1002294 (confirm step), DRIFT-1 1002304, LOOPS-2 1002306, DOCTOR-PREP-1 1002241, HEALTH-IMPORT-1 1002242, LOVED-PLACES-1 1002243, ASK-TOOLS-1 1002245, TRAVEL-OFFLINE-1 1002246, DWELL-1 1002247, PRIVACY-1 1002248, STANDING-INSTRUCTIONS-2 1002308, TESTS-1 1002535, BRANCHES-1 1002536, PR-1 1002537, LOCAL-CLEAN-1 1002538.

Verify: GET https://personal-api.q08.workers.dev/health version; GET https://personal.qnfo.org/companion contains "Check in where you are".
Blocker: sessions had no valid GitHub token, so no PR could be opened (COMPANION-PR-1).
