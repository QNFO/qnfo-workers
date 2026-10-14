// SLA-120M-RESEARCH-CLAIM-1 offline suite (qnfo-research-exec 0.18.2, charter pillar: research; agent_issues 2586).
// Proves: a stale researching claim is reclaimed after 120 minutes and a failed row re-armed after 120 minutes, both bound as minute
// constants in the SQL; the 4- and 6-hour cut-offs are gone; recover_count < 3 still bounds a poison row.
// Run: node qnfo-research-exec/sla-minutes.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
ok(/var RESEARCH_CLAIM_STALE_MIN = 120, RESEARCH_FAILED_REARM_MIN = 120;/.test(src), "both cut-offs are 120-minute constants");
ok(/claimed_at < strftime\('%Y-%m-%dT%H:%M:%SZ','now','-" \+ RESEARCH_CLAIM_STALE_MIN \+ " minutes'\)/.test(src), "the stale-claim reclaim binds the minute constant");
ok(/created_at < strftime\('%Y-%m-%dT%H:%M:%SZ','now','-" \+ RESEARCH_FAILED_REARM_MIN \+ " minutes'\)/.test(src), "the failed-row re-arm binds the minute constant");
ok(!/'now','-4 hours'\)/.test(src) && !/'now','-6 hours'\)/.test(src), "the 4- and 6-hour cut-offs are gone");
ok(/WHERE " \+ stale \+ " AND recover_count >= 3"/.test(src) && /WHERE " \+ stale \+ " AND recover_count < 3"/.test(src) && /status='failed' AND recover_count < 3 AND created_at </.test(src), "recover_count still bounds a poison row");
const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 0 || ver[1] > 18 || (ver[1] === 18 && ver[2] >= 2)), "VERSION is at least 0.18.2");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
