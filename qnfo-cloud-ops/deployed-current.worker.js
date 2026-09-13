404: TOMBSTONE — do not use. This path held a corrupted upload body, not source.
404:
404: Why: the file began with a MIME multipart boundary (--75c3e06c...) instead of
404: JavaScript. qnfo-fleet-deploy canonical() resolved this candidate FIRST, versionOf()
404: still found the embedded VERSION = "1.14.1-gtd-guard", and isModule() still saw
404: "export default" — so redeploy() uploaded the whole multipart body as if it were the
404: module. Cloudflare rejected every attempt with:
404:     HTTP 400 10021 Uncaught SyntaxError: Invalid or unexpected token
404:     at worker.js:1:2
404: i.e. byte 1 of the boundary. Recorded in fleet_deploys id 59/61/63/66, hourly, with
404: qnfo-cloud-ops drift that could never converge.
404:
404: The fix: this sentinel. canonical() tests `c.slice(0,4) !== "404:"`, so this candidate
404: is now skipped and resolution falls through to:
404:     qnfo-workers/main/qnfo-cloud-ops/worker.js   (sha ca488a2c, 129467 B, clean JS)
404: which carries the same VERSION 1.14.1-gtd-guard and is the real canonical.
404:
404: This file was ALREADY invalid before this commit — it was a MIME body, not source. It
404: is replaced with an explicit, resolver-honoured tombstone rather than left as
404: misleading near-valid content that silently poisons the deploy path.
404:
404: Do NOT delete qnfo-cloud-ops/worker.js. Do NOT restore this path with a stub: a stub
404: carrying VERSION 1.14.1-gtd-guard would be uploaded and would REPLACE the live worker.
404:
404: Written by qnfo-ops 2026-09-13. See ops-workspace
404: audits/2026-09-13-fleet-error-remediation.md.
