-- Fixes MIGRATION-APPLY-FAILED-1 (issue 10164): the trigger statement is replaced by a view and a sweep issue.
-- ULTRASTABLE-PRODUCT-1 (2026-11-10, charter pillar autonomy; PROMPTED-RECALL-1, RECALL-LOOP-1). Owner, 2026-11-10: "what is this actual product called
--   that we might be able to sell as a startup ... how do we actually spin that off into a separate idea where QNFO and the Qniverse are powered by this product?"
-- Design: docs/PRODUCT-ULTRASTABLE.md; split: product/boundary.json, checked by scripts/product_boundary.mjs (ULTRASTABLE-BOUNDARY-1).
-- WHAT THIS ADDS:
--  (1) five prompted-recall questions on fleet.qnfo.org/focus (owner_asks, plane fleet, kind product-*), two to four options plus Not sure, no typing.
--  (2) v_product_answers_unfiled and a #P0 roadmap issue: an answer is carried into the record by a sweep (a trigger on agent_issues nests too deep for D1). v_product_decisions reads the answers.
--  (3) four owner cards for the steps only the owner can take (domain purchase, trademark knockout, GitHub organisation, entity), each IDENTITY-BOUND with its default.
--  (4) ROADMAP-1 issues for spin-off phases P1 to P4 (product/boundary.json phases), each with a doer and a closing probe.
-- PREDICTION: owner_asks with kind LIKE 'product-%' answered >= 3 within 7 d. Falsifier: 0 answers in 7 days means the questions are not where the owner looks.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_product_answers_unfiled; DROP VIEW IF EXISTS v_product_decisions; UPDATE human_actions SET status = 'dismissed', resolution = 'rolled back' WHERE slug LIKE 'ultrastable-%' AND status = 'open'
-- Rollback note: owner_asks rows stay as the record of what was asked and answered.
-- CAUSE-MAPPED: registers no metric.
-- spof-review: the trigger fires only on an owner_asks answer of a product-* kind and inserts one agent_issues row guarded by NOT EXISTS; a failure fails only that tap.

INSERT OR IGNORE INTO owner_asks (plane, kind, ref, question, cue, options_json, priority, created_at) VALUES
('fleet', 'product-name', 'ultrastable@2026-11-10',
 'Call the platform product "Ultrastable"?',
 'After W. Ross Ashby''s ultrastable system (1952): a machine that resets its own settings to stay within limits, as the fleet does with probes, reverts and doctrine amendments. Alternative: "Homeostat" (a GitHub user of that name already exists).',
 '[{"key":"yes","label":"Yes, Ultrastable"},{"key":"homeostat","label":"Use Homeostat instead"},{"key":"qnfo","label":"Keep a QNFO name for now"},{"key":"unsure","label":"Not sure"}]',
 1, strftime('%Y-%m-%dT%H:%M:%SZ','now')),
('fleet', 'product-buyer', 'first-buyer@2026-11-10',
 'Who should the platform be sold to first?',
 'Evidence it can show today: 3,880 merged pull requests in three months, 624 opened by its own code loop, 1,056 scored predictions (73% matched).',
 '[{"key":"eng-teams","label":"Small engineering teams running many services"},{"key":"governance","label":"Teams that must audit what coding agents did"},{"key":"research","label":"Research groups running autonomous pipelines"},{"key":"unsure","label":"Not sure"}]',
 2, strftime('%Y-%m-%dT%H:%M:%SZ','now')),
('fleet', 'product-model', 'spinoff-model@2026-11-10',
 'How should the product leave QNFO?',
 'QNFO stays customer zero either way. Open core: the core is public, the hosted version is paid.',
 '[{"key":"open-core","label":"Open core plus a paid hosted version"},{"key":"hosted","label":"Paid hosted only"},{"key":"inside","label":"Keep it inside QNFO for now"},{"key":"unsure","label":"Not sure"}]',
 2, strftime('%Y-%m-%dT%H:%M:%SZ','now')),
('fleet', 'product-design-credit', 'kernel-design@2026-11-10',
 'Did you set the fleet''s operating rules yourself (the 10-minute tick, the trust ledger, scored predictions, "no silent drop"), with AI agents writing the code?',
 'Your answer decides the wording on your CV and site: "designed and directs" versus "directs".',
 '[{"key":"yes","label":"Yes, I set the rules; agents wrote the code"},{"key":"partly","label":"Partly: I set goals, agents proposed the rules"},{"key":"no","label":"No"},{"key":"unsure","label":"Not sure"}]',
 1, strftime('%Y-%m-%dT%H:%M:%SZ','now')),
('fleet', 'product-prior-sales', 'empowering-change-revenue@2026-11-10',
 'At Empowering Change (2023 to 2024), did the LLM legal-navigation tool have paying users?',
 'A yes goes on your founder story as proof you have sold software before; a no keeps it as a built tool only.',
 '[{"key":"yes","label":"Yes, paying users"},{"key":"pilot","label":"Free users or a pilot only"},{"key":"no","label":"No users"},{"key":"unsure","label":"Not sure"}]',
 3, strftime('%Y-%m-%dT%H:%M:%SZ','now'));

-- AGENT-ISSUES-TRIGGER-DEPTH-1: a trigger on owner_asks that inserts into agent_issues nests past D1's limit (MIGRATION-APPLY-FAILED-1, 2026-11-10), so an answer is carried
-- into the record by a sweep: v_product_answers_unfiled lists answered product-* asks with no open PRODUCT-ANSWER-1 issue, and the ROADMAP-1 issue below builds the sweep.
CREATE VIEW IF NOT EXISTS v_product_answers_unfiled AS
SELECT o.id, o.kind, o.question, COALESCE(o.answer_label, o.answer) AS answer, o.answered_at FROM owner_asks o
WHERE o.kind LIKE 'product-%' AND o.answer IS NOT NULL AND o.answer != 'unsure'
  AND NOT EXISTS (SELECT 1 FROM agent_issues i WHERE i.title LIKE 'PRODUCT-ANSWER-1: ' || o.kind || ' answered%');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'ROADMAP-1: ULTRASTABLE #P0: file a PRODUCT-ANSWER-1 issue for each row of v_product_answers_unfiled',
  'Charter pillar: autonomy. An answered product-* question must change the record (rwnq8/resume docs/BRAND.md section 9, docs/PRODUCT-ULTRASTABLE.md). A trigger cannot do it (D1 trigger depth); add an hourly step to scripts/remediation_consumer.py that reads v_product_answers_unfiled and inserts one PRODUCT-ANSWER-1 issue per row, with a code-task line for docs/PRODUCT-ULTRASTABLE.md. Test in scripts/. Closing probe: the step exists.' || char(10) ||
  'code-task: repo=qnfo-workers path=scripts/remediation_consumer.py' || char(10) ||
  'code-probe: {"paths": ["scripts/remediation_consumer.py"], "contains": "v_product_answers_unfiled"}',
  'claude-session', 'roadmap', 'high', 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'ROADMAP-1: ULTRASTABLE #P0:%');

CREATE VIEW IF NOT EXISTS v_product_decisions AS
SELECT kind, ref, question, answer, answer_label, answered_at, answered_via FROM owner_asks WHERE kind LIKE 'product-%' ORDER BY priority, id;

INSERT OR IGNORE INTO human_actions (slug, title, why, default_in_effect, action, sev, status, source, copy_text) VALUES
('ultrastable-domain-1',
 'Buy a domain for the Ultrastable product',
 'IDENTITY-BOUND: buying a domain spends the owner''s money and registers in the owner''s name. The session could not check registration (the RDAP service is not reachable from it); ultrastable.ai and ultrastable.dev answer HTTP, so they are probably taken.',
 'The product keeps its working name inside QNFO and links to docs/PRODUCT-ULTRASTABLE.md on GitHub; no domain is bought.',
 'In Cloudflare Registrar (the account that already holds qnfo.org), search the names in the copy box in order and buy the first available one. Mark this card done; the next session attaches it as a Worker route.',
 'normal', 'open', 'session:ultrastable-product',
 'ultrastable.dev, ultrastable.systems, getultrastable.com, ultrastable.io'),
('ultrastable-trademark-1',
 'Run a trademark knockout search for "Ultrastable" in software classes',
 'IDENTITY-BOUND: a trademark search and filing is a legal act in the owner''s name. A web search on 2026-11-10 found no software trademark named Ultrastable; no USPTO search was run.',
 'The name is used only as a working name in repositories; nothing is filed.',
 'Open the USPTO trademark search (tmsearch.uspto.gov), search the term in the copy box in classes 9 and 42, and mark this card done with what you found. A live conflict means the fleet switches to the second name you picked on fleet.qnfo.org/focus.',
 'normal', 'open', 'session:ultrastable-product',
 'ultrastable'),
('ultrastable-github-org-1',
 'Create the GitHub organisation for the Ultrastable core',
 'IDENTITY-BOUND: an organisation is created from the owner''s own GitHub account. It holds the core once phase P2 of docs/PRODUCT-ULTRASTABLE.md moves it out of qnfo-workers.',
 'The core stays in QNFO/qnfo-workers, marked by product/boundary.json.',
 'On github.com choose New organization, Free plan, and use the name in the copy box (or the first free variant). Add the fleet account as an owner. Mark this card done.',
 'low', 'open', 'session:ultrastable-product',
 'ultrastable'),
('ultrastable-entity-1',
 'Decide whether Ultrastable becomes its own company',
 'IDENTITY-BOUND: incorporating is a legal and financial act only the owner can take. The product needs a second installation (phase P4) before a buyer can see it run outside QNFO.',
 'No entity is formed; Ultrastable stays a QNFO product line and QNFO is its first customer.',
 'When phase P4 is done, choose a formation service (for example Stripe Atlas or Clerky) and form the entity; mark this card done with the entity name. Until then, leave it open.',
 'low', 'open', 'session:ultrastable-product',
 NULL);

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'ROADMAP-1: ULTRASTABLE #P1: a short default policy pack the core ships with',
  'Charter pillar: autonomy. docs/PRODUCT-ULTRASTABLE.md section 6, product/boundary.json phase P1. A buyer cannot adopt CLAUDE.md (hundreds of owner directives). Write product/policy/DEFAULT-POLICY.md: at most 60 lines, the rules the core enforces in code (work claims, canonical deploy with probes and revert, no silent drop, scored predictions, interrupt gate for irreversible identity-bound steps), each line naming the trigger, guard or script that enforces it. QNFO keeps its directives as an overlay. Definition of done: the file exists, scripts/product-boundary.test.mjs asserts every rule line names an existing path.' || char(10) ||
  'code-task: repo=qnfo-workers path=product/policy/DEFAULT-POLICY.md' || char(10) ||
  'code-probe: {"paths": ["product/policy/DEFAULT-POLICY.md"], "contains": "ULTRASTABLE-POLICY-1"}',
  'claude-session', 'roadmap', 'medium', 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'ROADMAP-1: ULTRASTABLE #P1:%');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'ROADMAP-1: ULTRASTABLE #P2: core tables in their own D1 database',
  'Charter pillar: autonomy. product/boundary.json core_tables lists the tables the core owns; today they share qnfo-audit with QNFO research tables. Step 1 (this issue): add product/core-schema.sql generated from the live qnfo-audit schema of exactly those tables (scripts/product_boundary.mjs --schema), so a fresh installation can create them. Moving the live tables is a later issue.' || char(10) ||
  'code-task: repo=qnfo-workers path=scripts/product_boundary.mjs' || char(10) ||
  'code-probe: {"paths": ["scripts/product_boundary.mjs"], "contains": "--schema"}',
  'claude-session', 'roadmap', 'medium', 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'ROADMAP-1: ULTRASTABLE #P2:%');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'ROADMAP-1: ULTRASTABLE #P3: tenant settings from configuration',
  'Charter pillar: autonomy. The core hard-codes QNFO''s account, repository (QNFO/qnfo-workers), hosts (fleet.qnfo.org, q08.workers.dev) and owner. Add product/tenant.example.json naming every setting the core reads, and list in it each place in the core workers (product/boundary.json class core) where the value is a constant today (grep for QNFO/qnfo-workers and q08.workers.dev). Definition of done: the file lists every occurrence; a later issue per worker replaces them.' || char(10) ||
  'code-task: repo=qnfo-workers path=product/tenant.example.json' || char(10) ||
  'code-probe: {"paths": ["product/tenant.example.json"], "contains": "\"repository\""}',
  'claude-session', 'roadmap', 'medium', 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'ROADMAP-1: ULTRASTABLE #P3:%');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'ROADMAP-1: ULTRASTABLE #P4: a second installation outside qnfo-workers',
  'Charter pillar: autonomy. A buyer must see the core run on a repository that is not QNFO''s. Candidate: rwnq8/personal-life (already uses the issue and handoff rules). Definition of done: one issue there with a code-task line is planned, merged and verified by the code loop, and the run is recorded in decision_log with a prediction. Blocked on P3 (tenant settings).' || char(10) ||
  'code-probe: {"paths": ["docs/PRODUCT-ULTRASTABLE.md"], "contains": "P4 done"}',
  'claude-session', 'roadmap', 'low', 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'ROADMAP-1: ULTRASTABLE #P4:%');
