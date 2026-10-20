-- OWNER-OTP-TOOL-ERRORS-1 (2026-10-20, charter pillar: security; agent_issues 100334 and 100335, both auto-filed TOOL-FAILURE issues for the new owner login tools of qnfo-ops 2.54.0, PR 3296).
-- owner_login and owner_verify answer four expected refusals as {"ok": false, "error": ...}: "too many codes this hour; try again later" (the rate limit OTP_MAX_PER_HOUR),
-- "the code has 6 digits" (input validation), "that code is not right" and "no code is waiting; call owner_login for a new one" (state). Each is the tool working: a refusal
-- the caller must read, not a defect. The trigger tool_error_files_issue_v2 files a TOOL-FAILURE issue for every error class that is not in tool_error_exclusions
-- (evt-f334af72b0ecf9 at 2026-10-20T09:42:32Z: owner_verify "the code has 6 digits"; evt-9c336a35b97ce8 at 09:51:53Z: owner_login "too many codes this hour"), so each wrong or repeated
-- attempt of the owner would file another issue. This file adds the four patterns, class correct-refusal for the rate limit and the state errors and agent-input-error for the input
-- check, as the earlier rows do (TOOL-ERROR-CLASSIFY-6, TOOL-NOTFOUND-READ-1). Tool breakage still files: a tool crash or a failed send carries a different error text.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM tool_error_exclusions WHERE rationale LIKE 'OWNER-OTP-TOOL-ERRORS-1%'; 

INSERT OR IGNORE INTO tool_error_exclusions (pattern, err_class, rationale) VALUES
  ('too many codes this hour', 'correct-refusal', 'OWNER-OTP-TOOL-ERRORS-1 (2026-10-20, #100335): owner_login answers {"ok": false, "error": "too many codes this hour; try again later"} when OTP_MAX_PER_HOUR codes were already sent; the rate limit working as designed.'),
  ('the code has 6 digits', 'agent-input-error', 'OWNER-OTP-TOOL-ERRORS-1 (2026-10-20, #100334): owner_verify answers {"ok": false, "error": "the code has 6 digits"} when the caller passed a code of another length; the caller''s input, not the tool.'),
  ('that code is not right', 'correct-refusal', 'OWNER-OTP-TOOL-ERRORS-1 (2026-10-20): owner_verify answers {"ok": false, "error": "that code is not right"} for a wrong code; a correct refusal.'),
  ('no code is waiting', 'correct-refusal', 'OWNER-OTP-TOOL-ERRORS-1 (2026-10-20): owner_verify answers {"ok": false, "error": "no code is waiting; call owner_login for a new one"} when no unexpired code exists; a correct refusal.');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'a refusal that a tool is built to give is not a failure of the tool, and every wrong or repeated attempt of the owner at a login would otherwise file a new TOOL-FAILURE issue',
  'OWNER-OTP-TOOL-ERRORS-1: four patterns added to tool_error_exclusions for the owner_login and owner_verify refusals (rate limit, code length, wrong code, no code waiting)',
  'qnfo-audit 2026-10-20: issues 100334 (owner_verify, "the code has 6 digits", evt-f334af72b0ecf9) and 100335 (owner_login, "too many codes this hour", evt-9c336a35b97ce8) were filed by tool_error_files_issue_v2 within 30 minutes of qnfo-ops 2.54.0; qnfo-ops/worker.js ownerOtpSend and ownerOtpVerify return exactly these four error strings',
  'applied through the canonical path on merge; the exclusion table is read by the trigger on each tool error event',
  'four rows in tool_error_exclusions; an owner_login or owner_verify call that fails for another reason still files an issue; no worker, secret or schedule change',
  'run the migration Rollback header: it removes the four rows (decision_log is append-only and keeps this row)',
  'the owner login tools can refuse a wrong, short or repeated attempt without filing an issue each time',
  'no new TOOL-FAILURE issue for owner_login or owner_verify with one of the four error texts after the merge',
  'none',
  'migrations/owner-otp-tool-exclusions.test.mjs, qnfo-ops/worker.js ownerOtpSend and ownerOtpVerify read for the error strings, the live tool_error_exclusions rows and the two filed issues'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'OWNER-OTP-TOOL-ERRORS-1:') = 1);
