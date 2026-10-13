-- ABSTRACT-CLEAN-1 (2026-10-13, agent_issues 2485, pillar research). Verifying ABSTRACT-BACKFILL-1 live found 343 published abstracts
-- that are raw body prefixes (headings, **Author:** / ORCID / Contact lines, YAML front matter). qnfo-research-exec 0.17.x
-- repairs them in the completeness sweep (bodySummary, old text kept in living-paper abstract_repair_bak). The detector of
-- failure mode paper-abstract-empty now counts a markup abstract as defective too.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM papers WHERE status IN (''published'',''distributed'') AND length(coalesce(body_md, '''')) >= 400 AND length(trim(coalesce(abstract, ''''))) < 40) AS TEXT) AS observed' WHERE class = 'fm-paper-abstract-empty'; UPDATE failure_modes SET failure_mode = 'a published paper has no abstract although its body is complete' WHERE fm_key = 'paper-abstract-empty'

UPDATE failure_modes SET failure_mode = 'a published paper has no abstract, or an abstract that is a raw body prefix (headings, metadata lines, front matter), although its body is complete',
  root_cause = root_cause || '; ABSTRACT-CLEAN-1: older imports and idea-hub stored raw body prefixes as the abstract, and the 0.17.0 backfill fallback kept a leading heading',
  detector = 'no published paper with a body of 400 or more characters has an abstract under 40 characters or one carrying markdown headings, **Author/ORCID/Contact** lines or front matter'
 WHERE fm_key = 'paper-abstract-empty';
UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM papers WHERE status IN (''published'',''distributed'') AND length(coalesce(body_md, '''')) >= 400 AND (length(trim(coalesce(abstract, ''''))) < 40 OR abstract LIKE ''#%'' OR instr(abstract, ''## '') > 0 OR instr(abstract, ''**Author'') > 0 OR instr(abstract, ''**ORCID'') > 0 OR instr(abstract, ''**Contact'') > 0 OR abstract LIKE ''---%'')) AS TEXT) AS observed' WHERE class = 'fm-paper-abstract-empty';
