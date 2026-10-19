-- COMPANION-DOMAIN-1 / DOMAIN-PLANE-1 follow-ups (2026-10-19, pillar personal): owner directive "for personal shit, use q08.org. For
-- research shit, use qnfo.org ... quantum computing, use qwave.org" (docs/DOMAINS.md). PR claude/companion-access-email-9b0cd3 moves
-- the companion to me.q08.org; this file files the surfaces it found on the wrong domain, and a live check of the companion sign-in, as
-- agent_issues so a doer owns each (OWNER-NO-LOOSE-ENDS-1). A session could not write D1 directly (refused), so the canonical path
-- carries them. Each insert is skipped when an open issue with the same title prefix exists. No worker, cron or trigger is added.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM agent_issues WHERE status = 'open' AND (title LIKE 'DOMAIN-PLANE-1:personal.qnfo.org%' OR title LIKE 'DOMAIN-PLANE-1:personal-mail-sender%' OR title LIKE 'DOMAIN-PLANE-AUDIT-1:%' OR title LIKE 'COMPANION-SIGNIN-LIVE-1:%' OR title LIKE 'COMPANION-MCP-CONSENT-CODE-1:%')

INSERT INTO agent_issues (title, description, source, category, priority, status)
SELECT 'DOMAIN-PLANE-1:personal.qnfo.org personal twin host sits on the research domain',
 'Charter pillar: personal. docs/DOMAINS.md (owner directive 2026-10-19): personal surfaces live on q08.org. The personal twin (personal-api) is still documented and used at https://personal.qnfo.org (qnfo-ops/CHATBOX-SETUP.md, audits/2026-10-01-credential-rotation-runbook.md, personal-api/msgraph/README.md as an OAuth callback). personal-api now also answers on https://me.q08.org (COMPANION-DOMAIN-1).' || char(10) ||
 'Doer: the code loop (personal-api). Lever: point the documented client settings (ChatBox, DeepChat) at https://me.q08.org/v1, add https://me.q08.org/microsoft/callback and /google/callback beside the old callbacks, and keep personal.qnfo.org answering as a 301 to me.q08.org so configured clients keep working.' || char(10) ||
 'Definition of done: no tracked document gives personal.qnfo.org as the address to use, and https://me.q08.org/health names personal-api.' || char(10) ||
 'code-probe: {"paths": ["qnfo-ops/CHATBOX-SETUP.md"], "absent": "https://personal.qnfo.org/v1"}',
 'session', 'personal', 'medium', 'open'
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE status = 'open' AND title LIKE 'DOMAIN-PLANE-1:personal.qnfo.org%');

INSERT INTO agent_issues (title, description, source, category, priority, status)
SELECT 'DOMAIN-PLANE-1:personal-mail-sender personal-companion mails the owner from a qnfo.org address',
 'Charter pillar: personal. personal-companion sendOwnerNotice and sendOne send as rowan.quni@qnfo.org, the research domain, for personal mail (morning brief, check-ins). personal-api 4.14.0 sends its sign-in code from companion@q08.org with rowan.quni@qnfo.org as the fallback (COMPANION-LOGIN-1), the pattern to copy.' || char(10) ||
 'Doer: the code loop (personal-companion). Lever: send owner notices from companion@q08.org first and fall back to rowan.quni@qnfo.org only when the binding refuses the q08.org sender, with a test for the fallback; subscriber broadcasts keep their sender.' || char(10) ||
 'Definition of done: personal-companion/worker.js names companion@q08.org as the first owner-notice sender.' || char(10) ||
 'code-probe: {"paths": ["personal-companion/worker.js"], "contains": "companion@q08.org"}',
 'session', 'personal', 'low', 'open'
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE status = 'open' AND title LIKE 'DOMAIN-PLANE-1:personal-mail-sender%');

INSERT INTO agent_issues (title, description, source, category, priority, status)
SELECT 'DOMAIN-PLANE-AUDIT-1: inventory every owner-facing host against the q08.org / qnfo.org / qwav.org rule',
 'Charter pillar: core. docs/DOMAINS.md records the owner directive of 2026-10-19. Nobody has listed every host the fleet gives a person (pages, e-mail links, app addresses) with its plane, so a surface on a workers.dev host or on the wrong domain is found only when the owner trips over it.' || char(10) ||
 'Doer: qnfo-fleet-control (charter loop) or the code loop. Lever: read zone routes and custom domains (fleet graph routes plus the Cloudflare API through cf-ops-actions report), add an "## Inventory" section to docs/DOMAINS.md listing each owner-facing host with its plane and worker, and file one DOMAIN-PLANE-1:<host> issue per host on the wrong domain or reached only by workers.dev.' || char(10) ||
 'Definition of done: docs/DOMAINS.md carries the inventory and every misplaced host has its own issue.' || char(10) ||
 'code-probe: {"paths": ["docs/DOMAINS.md"], "contains": "## Inventory"}',
 'session', 'core', 'medium', 'open'
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE status = 'open' AND title LIKE 'DOMAIN-PLANE-AUDIT-1:%');

INSERT INTO agent_issues (title, description, source, category, priority, status)
SELECT 'COMPANION-SIGNIN-LIVE-1: the companion opens at me.q08.org with an e-mailed code',
 'Charter pillar: personal. personal-api 4.14.0 (COMPANION-LOGIN-1, COMPANION-DOMAIN-1) adds the e-mailed-code sign-in and .github/workflows/attach-me-q08-route.yml attaches me.q08.org. This issue closes on its own when the page answers on the owner''s address with the sign-in card; it stays open if the route attach failed (see ci-status/attach-me-q08-route.json).' || char(10) ||
 'Doer: the session that opened the PR, then the code loop. Lever: if the route run failed, read its report, fix the cause (zone access, an existing record) and re-dispatch attach-me-q08-route.yml.' || char(10) ||
 'Definition of done: https://me.q08.org/companion answers 200 with the sign-in card.' || char(10) ||
 'runtime-probe: {"url": "https://me.q08.org/companion", "status": 200, "contains": "E-mail me a code"}',
 'session', 'personal', 'high', 'open'
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE status = 'open' AND title LIKE 'COMPANION-SIGNIN-LIVE-1:%');

INSERT INTO agent_issues (title, description, source, category, priority, status)
SELECT 'COMPANION-MCP-CONSENT-CODE-1: the personal twin MCP consent page asks the owner for the API key',
 'Charter pillar: personal. Owner 2026-10-19: "stop asking me for keys ... one-time email passwords are fine." Connecting the personal twin to an MCP client (OAuth 2.1 at personal-api /mcp) shows a consent page that takes the personal API key (consentPage, safeEqual(P.key, env.API_KEY)). personal-api 4.14.0 has an e-mailed-code session (COMPANION-LOGIN-1: sendLoginCode, verifyLoginCode, sessionFor).' || char(10) ||
 'Doer: the code loop (personal-api). Lever: on the OAuth consent page, accept a live cmp_s session cookie as consent, or offer "E-mail me a code" and verify it with verifyLoginCode, keeping the key field only as a fallback; add a test that consent succeeds with a session and no key.' || char(10) ||
 'Definition of done: the consent page offers the e-mailed code and no longer requires the key.' || char(10) ||
 'code-probe: {"paths": ["personal-api/worker.js"], "contains": "COMPANION-MCP-CONSENT-CODE-1"}',
 'session', 'personal', 'medium', 'open'
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE status = 'open' AND title LIKE 'COMPANION-MCP-CONSENT-CODE-1:%');
