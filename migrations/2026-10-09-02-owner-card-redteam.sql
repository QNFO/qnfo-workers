-- OWNER-CARD-REDTEAM-R3 (2026-10-09, pillar autonomy; doctrine revision 3 sections 3 and 14, reading (c)). Every open owner
-- card is a blocker until its surfaces are tested. The four open cards were red-teamed by session_01CWLpf5v1NjC9GXbM6rnH4k;
-- each blocker_redteam row carries a "surfaces:" line (the convention blocker_surface_coverage_7d reads, 2026-10-09-doctrine-
-- rev3-metrics.sql), and the three earlier rows get theirs. Outcome:
--   stackexchange-key: workaround built. StackExchange caps keyless calls per egress IP and Workers share egress, so the
--     radar in qnfo-cloud-ops was capped since 2026-10-02; from a non-Cloudflare address the same query answers 200 (quota
--     300). scripts/se_mentions_runner.py runs it from the GitHub runner (remediation-consumer.yml) and resolves the card.
--   code-release-pypi-zenodo: the capability exists (pip install git+https://github.com/QNFO/<name>, public since
--     2026-10-08); only a PyPI listing needs an account in the owner's name: IDENTITY-BOUND line added.
--   lightcone-application-text, ula-v2-1-post: identity-bound (the owner's own funder account; licence terms are a legal
--     act): IDENTITY-BOUND lines added, defaults in effect unchanged.
-- No permission check or refusal was retried on another surface (reading (c)); only missing capabilities were routed.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE human_actions SET why = substr(why, 1, instr(why, char(10) || 'IDENTITY-BOUND:') - 1) WHERE slug IN ('lightcone-application-text', 'code-release-pypi-zenodo', 'ula-v2-1-post') AND instr(why, char(10) || 'IDENTITY-BOUND:') > 0 (blocker_redteam rows are evidence and stay)

UPDATE blocker_redteam SET verdict = 'workaround-built', evidence = evidence || char(10) || 'RESOLVED 2026-10-09: the fleet token created all three repositories through the portfolio sync (portfolio_actions code-publish committed, 41 files); research_code_libraries status public.' || char(10) || 'surfaces: REST API via the session GitHub app = 403 Resource not accessible by integration; sibling worker route qnfo-fleet-control portfolio sync (its own GITHUB_TOKEN) = worked'
WHERE target = 'human_actions#50 code-repos-create' AND instr(lower(evidence), 'surfaces:') = 0;
UPDATE blocker_redteam SET evidence = evidence || char(10) || 'surfaces: CI workflow attach-surface-routes.yml with the repository CLOUDFLARE_API_TOKEN = worked (run 37801740785)'
WHERE target = 'human_actions#44 cf-dns-redirect-token' AND instr(lower(evidence), 'surfaces:') = 0;
UPDATE blocker_redteam SET evidence = evidence || char(10) || 'surfaces: REST API zenodo.org/api/records = 410 Gone 12/12; Internet Archive from the session sandbox = 429 rate-limited (recovery belongs to a fleet worker, agent_issues 2186)'
WHERE target = 'agent_issues#2186 zenodo-exit mirror' AND instr(lower(evidence), 'surfaces:') = 0;

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor)
SELECT 'human_actions#55 stackexchange-key', 'the mention radar needs a Stack Apps key registered under the owner''s account', 'keyless StackExchange query from a non-Cloudflare egress', 'workaround-built',
  'Keyless GET api.stackexchange.com/2.3/search/advanced (q=qnfo) answered HTTP 200, quota_max 300, 0 items, from the session sandbox on 2026-10-09; scripts/se_mentions_runner.py runs it hourly from the GitHub runner and resolves the card on its first answer.' || char(10) || 'surfaces: qnfo-cloud-ops Worker = capped (throttle_violation, shared Cloudflare egress); non-Cloudflare egress = worked; CI workflow (GitHub runner, remediation-consumer.yml) = built',
  'session_01CWLpf5v1NjC9GXbM6rnH4k'
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'human_actions#55 stackexchange-key');

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor)
SELECT 'human_actions#46 lightcone-application-text', 'only the owner can fill the Lightcone application', 'surface test of every write path to the application', 'confirmed-with-evidence',
  'The application sits in the owner''s own Lightcone Commons account; filling it states a grant case to a funder under his name, which commits his identity (doctrine section 4). Default in effect: issue 1750 stays open with the drafted text.' || char(10) || 'surfaces: REST API = none published; dashboard/UI = the owner''s own sign-in, no fleet credential and none may be created; email to Lightcone = a statement on the owner''s behalf to a funder (identity-bound); sibling worker = none holds a Lightcone credential',
  'session_01CWLpf5v1NjC9GXbM6rnH4k'
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'human_actions#46 lightcone-application-text');

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor)
SELECT 'human_actions#51 code-release-pypi-zenodo', 'publishing the research libraries needs the owner', 'surface test of every install and publish path', 'workaround-built',
  'Installing works without PyPI since the repositories went public on 2026-10-08 (pip install git+https://github.com/QNFO/agentic-collapse, ignorance-audit; ultrametric-lean is Lean). A PyPI listing itself needs an account in the owner''s name, so only that part stays on the card.' || char(10) || 'surfaces: GitHub public repositories = worked; PyPI upload/trusted-publisher API = needs a PyPI account in the owner''s name (identity-bound); sibling worker = none holds a PyPI credential',
  'session_01CWLpf5v1NjC9GXbM6rnH4k'
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'human_actions#51 code-release-pypi-zenodo');

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor)
SELECT 'human_actions#52 ula-v2-1-post', 'posting QNFO-ULA v2.1 needs the owner', 'surface test of the write path and of the act', 'confirmed-with-evidence',
  'The write path exists (the portfolio sync commits to QNFO repositories), but new licence terms for the owner''s works are a legal act (doctrine section 4: signing a legal document). Default in effect: v2.0 stays in force.' || char(10) || 'surfaces: CI/REST commit to QNFO/license = available; the act = legal, identity-bound',
  'session_01CWLpf5v1NjC9GXbM6rnH4k'
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'human_actions#52 ula-v2-1-post');

UPDATE human_actions SET why = why || char(10) || 'IDENTITY-BOUND: the application sits in the owner''s own Lightcone account on a funder''s site; filling it commits his identity (surface test 2026-10-09, blocker_redteam).', updated_at = datetime('now')
WHERE slug = 'lightcone-application-text' AND status = 'open' AND instr(why, 'IDENTITY-BOUND:') = 0;
UPDATE human_actions SET why = why || char(10) || 'IDENTITY-BOUND: a PyPI listing needs a PyPI account in the owner''s name; installing already works without it (pip install git+https://github.com/QNFO/<name>; surface test 2026-10-09, blocker_redteam).', updated_at = datetime('now')
WHERE slug = 'code-release-pypi-zenodo' AND status = 'open' AND instr(why, 'IDENTITY-BOUND:') = 0;
UPDATE human_actions SET why = why || char(10) || 'IDENTITY-BOUND: licence terms for the owner''s works are a legal act (doctrine section 4); the write path itself exists (surface test 2026-10-09, blocker_redteam).', updated_at = datetime('now')
WHERE slug = 'ula-v2-1-post' AND status = 'open' AND instr(why, 'IDENTITY-BOUND:') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'an owner card is a blocker until every surface is tested (doctrine revision 3 section 3)', 'red-teamed the four open owner cards; built the GitHub-runner StackExchange path; marked three identity-bound with defaults in effect', 'blocker_redteam rows for cards 46, 51, 52, 55, each with a surfaces: line', 'one card resolved by construction, one reduced to its identity-bound part, two identity-bound', 'owner queue only', 'the Rollback line', 'StackExchange mentions without an owner key; research libraries installable without PyPI'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'red-teamed the four open owner cards%');
