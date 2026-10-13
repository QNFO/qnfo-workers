// 0.26.4: PORTFOLIO-PUT-RETRY-1 (agent_issues 2523), OBS-REASSERT-LEDGER-1 (2520) and COE-NULL-ID-WRITER-1 (2519).
// Slices pfPutConflict and pfRetryPut out of worker.js and runs them without Workers bindings; checks the ledger and id rules
// on the source text.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("function pfPutConflict("), b = src.indexOf("async function charterCommit(");
assert.ok(a > 0 && b > a, "pfPutConflict and pfRetryPut precede charterCommit");
const { pfPutConflict, pfRetryPut } = new Function(src.slice(a, b) + "\nreturn { pfPutConflict, pfRetryPut };")();

let pass = 0, fail = 0;
function ok(cond, msg, got) { if (cond) pass++; else { fail++; console.log("FAIL", msg, got === undefined ? "" : JSON.stringify(got)); } }

const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(vm && (Number(vm[1]) > 0 || Number(vm[2]) > 26 || (Number(vm[2]) === 26 && Number(vm[3]) >= 4)), "VERSION is at least 0.26.4");

// 1. Which results count as a conflict.
ok(pfPutConflict({ status: "write-failed", note: "PUT HTTP 409 on main" }), "409 from pfCommit is a conflict");
ok(pfPutConflict({ status: "write-failed", note: "PUT contents HTTP 422" }), "422 from charterCommit is a conflict");
ok(!pfPutConflict({ status: "write-failed", note: "PUT HTTP 403 on main" }), "403 is not retried");
ok(!pfPutConflict({ status: "write-failed", note: "PUT HTTP 4090 on main" }), "a longer code is not 409");
ok(!pfPutConflict({ status: "committed", sha: "x" }), "a commit is not a conflict");
ok(!pfPutConflict(null), "null is not a conflict");

// 2. Retry: a conflict then a commit commits on attempt 2 and says so; a non-conflict failure is not retried; three
// conflicts stop at 3. The 1 s pause is real, so the suite waits about 4 s in all.
let calls = 0;
const seq = [{ status: "write-failed", note: "PUT HTTP 409 on main" }, { status: "committed", sha: "abc" }];
const r1 = await pfRetryPut(async () => seq[calls++]);
ok(calls === 2 && r1.status === "committed" && /attempts 2 \(PORTFOLIO-PUT-RETRY-1\)/.test(r1.note), "409 then commit: 2 attempts, committed", r1);

calls = 0;
const r2 = await pfRetryPut(async () => { calls++; return { status: "write-failed", note: "PUT HTTP 403 on main" }; });
ok(calls === 1 && r2.note === "PUT HTTP 403 on main", "403: one attempt, note unchanged", r2);

calls = 0;
const r3 = await pfRetryPut(async () => { calls++; return { status: "write-failed", note: "PUT HTTP 409 on master" }; });
ok(calls === 3 && r3.status === "write-failed" && /attempts 3/.test(r3.note), "three conflicts: 3 attempts, still write-failed", r3);

calls = 0;
const r4 = await pfRetryPut(async () => { calls++; return { status: "unchanged" }; });
ok(calls === 1 && r4.note === undefined, "unchanged: one attempt, no note added", r4);

// 3. Both writers go through the retry.
ok(/async function charterCommit\(env, block, day, force\) \{\s*return pfRetryPut\(/.test(src), "charterCommit wraps charterCommitOnce in pfRetryPut");
ok(/async function pfCommit\(env, repo, path, content, message, mode\) \{\s*return pfRetryPut\(/.test(src), "pfCommit wraps pfCommitOnce in pfRetryPut");

// 4. OBS-REASSERT-LEDGER-1: the SETTINGS-ONLY row is written under pr.ok, not under the verification.
const ro = src.slice(src.indexOf("async function reassertObservability("), src.indexOf("__name(reassertObservability"));
const iOk = ro.indexOf("if (pr.ok) {"), iIns = ro.indexOf("INSERT INTO fleet_deploys"), iVer = ro.indexOf("if (verified) {");
ok(iOk > 0 && iIns > iOk && iVer > 0 && iVer < iOk, "fleet_deploys insert sits under if (pr.ok), after the verified block", { iOk, iIns, iVer });
ok(ro.indexOf('" verified=" + verified') > 0, "the ledger note records whether the PATCH verified");

// 5. COE-NULL-ID-WRITER-1: no cloud_ops_events write without an id, and the two dedupes read through datetime(ts).
ok(src.indexOf("(ts, kind, job, text) VALUES (datetime('now')") < 0, "no id-less cloud_ops_events insert left");
ok((src.match(/\(id, ts, kind, job, text\) VALUES \('fc-' \|\| lower\(hex\(randomblob\(8\)\)\), strftime\('%Y-%m-%dT%H:%M:%fZ', 'now'\),/g) || []).length >= 6, "six inserts carry an fc- id and an ISO ts");
ok(src.indexOf("kind='dispose-blocked' AND text LIKE ? AND ts > datetime(") < 0, "dispose-blocked dedupe compares through datetime(ts)");

// 6. HOLDING-OPEN-REARM-2: an open issue's contract is re-armed before the pass/hold branches run.
const tick = src.slice(src.indexOf("async function remediationContractsTick("), src.indexOf("async function remediationContractsTick(") + 20000);
const iDet = tick.indexOf("if (rtStandingDetector(c.class))"), iOpen = tick.indexOf('} else if (c.issue_status === "open" && (verdict !== "pass" || await rtIssueOpen(db, c.issue_id))) {'), iPass = tick.indexOf('} else if (verdict === "pass") {');
ok(iDet > 0 && iOpen > iDet && iPass > iOpen, "open-issue branch sits between the detector branch and the pass/hold branch", { iDet, iOpen, iPass });
ok(/rtIssueOpen\(db, c\.issue_id\)\)\) \{[\s\S]{0,900}if \(c\.contract_status === "holding"\) nextStatus = "active";/.test(tick), "a holding contract on an open issue becomes active");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
