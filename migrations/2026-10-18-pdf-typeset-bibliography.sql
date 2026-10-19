-- TYPESET-PRO-CLOSEOUT-1 (2026-10-18, owner directive: a paper PDF needs professional typesetting that includes the
-- full bibliographic information and the author/affiliation; issues 100001-100003 below). The paper renderer shipped
-- 1.5.0 with three defects that no unit test caught because the fixtures were cleaner than the corpus:
--   (1) a citation wrapped across a source line break printed as raw text (paragraphs were inline-rendered line by line);
--   (2) the numbered reference list most papers carry in their own body was ignored, so their keys printed as raw text
--       and every citation read as unresolved (adelic-synthesis-pattern-particle: 34; paper-the-qubit-delusion: 46);
--   (3) an unmatched key was styled as an error even in papers that carry no bibliography at all.
-- Rendering is not a queue and holds no leases, so this file registers the durable guard rather than a control loop:
--   failure mode pdf-typeset-bibliography-dropped with its remediation contract, the control row for the typesetter,
--   and the capability it protects. The recurrence guard is executable, not a promise: scripts/pdf_corpus_audit.mjs
--   renders a spread of published papers through the live worker's /html endpoint and exits 1 when a page carries a raw
--   [@key] marker, mojibake, a duplicated title or a bare References heading, and qnfo-pdf/typeset.test.mjs pins each of
--   the three behaviours above (33 tests at 1.5.2).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM failure_modes WHERE fm_key = 'pdf-typeset-bibliography-dropped'; DELETE FROM remediation_contracts WHERE class = 'fm-pdf-typeset-bibliography-dropped'; DELETE FROM control_registry WHERE control = 'paper-pdf-typesetting'; DELETE FROM capability_ledger WHERE capability = 'paper-pdf-citable'

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES (
 'pdf-typeset-bibliography-dropped',
 'the rendered paper (PDF/HTML) drops or mangles its bibliography and author record, so the artifact is not citable',
 'the renderer was written against clean fixtures: it inline-rendered markdown line by line (a citation wrapped across a line break never matched), it read a bibliography only from a references.bib that most papers do not ship (their list is the numbered section in their own body, whose entries end in the pandoc key that cites them), and it had no metadata contract, so authors/affiliations/DOI never reached the page',
 'parse every bibliography source in order (BibTeX in R2, then the numbered list the body carries), map keys to entry numbers case-insensitively, strip key annotations from printed entries, print the author''s own wording, and style an unmatched key as an error only where a bibliography exists to be missing from',
 'scripts/pdf_corpus_audit.mjs (live /html render of a spread of published papers: fails on raw [@key], mojibake, double title, bare References heading) plus qnfo-pdf/typeset.test.mjs (33 tests)',
 'structural', '2026-10-18', 100001,
 'a published paper renders with a raw [@key] marker, an empty References heading, or zero reference entries where its body carries a keyed or numbered bibliography',
 'the paper page and its PDF show citation keys instead of numbers and carry no reference list, so a reader and an indexer cannot follow or cite the work',
 'every published paper (618 public records) and every downstream copy: PDF in R2, the Scholar citation_pdf_url surface, Zenodo deposits built from the same markdown');

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, ts, module, budget_ms, max_items, requires_container)
VALUES (
 'fm-pdf-typeset-bibliography-dropped', 100001,
 'a published paper whose render carries a raw citation marker or no reference list',
 're-render the paper (GET /pdf/<slug> on qnfo-pdf overwrites the stored PDF and stamps the renderer) and, when the body itself has no bibliography, record it against the paper rather than inventing entries',
 'scripts/pdf_corpus_audit.mjs --limit 40 exits 0 and reports the reference-entry total', 'agent-runtime', 3, 'owner', 24, 'active',
 strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'qnfo-pdf', 120000, 40, 0);

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES (
 'paper-pdf-typesetting', 'qnfo-pdf/worker.js + qnfo-pdf/renderer.js (TYPESET-PRO-1/2, 1.5.2, renderer 2.2.0)', 'gate',
 'a published paper PDF that is not citable: no bibliography, no author/affiliation record, no page numbers', 0, 'keep', 'applied',
 'GET /pdf/<slug> renders on demand and overwrites the stored PDF, so a reader never waits for the sweep; the */10 backlog loop re-renders stored PDFs whose customMetadata.renderer stamp is older than the running renderer',
 '2026-10-18T21:10:00Z',
 'qnfo-pdf/typeset.test.mjs (33 tests: BibTeX parse, numbering, entry formatting, body-carried list, unkeyed list, checklist rejection, byline lifting, plain-vs-flagged unresolved, templates, metadata plumbing, UTF-8); scripts/pdf_corpus_audit.mjs measured 2026-10-18 against 74 published papers: raw markers 4 -> 0, papers with a reference list 3 -> 10, entries 69 -> 201 before the unkeyed-list pass',
 100001, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR REPLACE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES (
 'paper-pdf-citable',
 'TYPESET-PRO-1/2 (qnfo-pdf 1.5.0-1.5.2, renderer 2.0.0-2.2.0), PRs #2531 and #2536, owner directive 2026-10-18',
 'living-paper.papers row with body_md; R2 qnfo-releases for references.bib; Browser Rendering binding BROWSER',
 'verified on the live worker: a 4-page PDF carrying 13 numbered references, running head and page x / y; the corpus sample renders 74/74 with a title block and 0 raw markers',
 '2026-10-18T20:15:00Z', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
 'https://qnfo.org/papers/completeness-senses-levi-civita.pdf (text extracted with pdf.js: References present, 13 entries, page counter 1/4)');
