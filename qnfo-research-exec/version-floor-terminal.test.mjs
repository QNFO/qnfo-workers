// VERSION-FLOOR-TERMINAL-1 (qnfo-research-exec 0.40.1, agent_issues 1000630) offline suite. No network.
// Proves: versionErrorTerminal separates a refusal that can never pass on a retry (the living-paper floor trigger: PUBLISH-FLOOR-BLOCKED) from any other drain failure; the drainV2 catch block
// writes 'wontfix' for the first and 'error' for the others, marks the revision log row needs-substantive-revision, and logs one gov_gate_log RESOLVE row, in that block of the source.
// Run: node qnfo-research-exec/version-floor-terminal.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const i = src.indexOf("function versionErrorTerminal(msg) {");
const fn = i < 0 ? "" : src.slice(i, src.indexOf("\n}\n", i) + 3);
ok(fn.length > 40, "versionErrorTerminal is in the worker");
const vet = new Function(fn + "\nreturn versionErrorTerminal;")();
ok(vet("D1_ERROR: PUBLISH-FLOOR-BLOCKED MIN-PAPER-LENGTH-4 (update): a new paper needs 20000 chars") === true, "the floor trigger's refusal is terminal");
ok(vet("D1_ERROR: SQLITE_BUSY") === false && vet("network timeout") === false && vet("") === false && vet(null) === false && vet(undefined) === false, "other failures are not terminal");

const d = src.indexOf("async function drainV2(env) {");
const body = src.slice(d, src.indexOf('__name(drainV2, "drainV2");', d));
const c = body.indexOf("var vErrMsg = ");
const catchBlock = c < 0 ? "" : body.slice(c, c + 2600);
ok(/UPDATE version_queue SET status=\?, updated_at=datetime\('now'\) WHERE id=\?"\)\.bind\(vTerminal \? "wontfix" : "error", r\.id\)/.test(catchBlock), "the catch writes wontfix for a terminal refusal and error for the rest", catchBlock.slice(0, 200));
ok(/UPDATE paper_revision_log SET status='needs-substantive-revision'/.test(catchBlock) && /INSERT INTO gov_gate_log/.test(catchBlock) && /'MIN-PAPER-LENGTH-4'/.test(catchBlock) && /'RESOLVE'/.test(catchBlock), "a terminal row also marks the revision log and logs the gate decision");
ok(/if \(vTerminal\) \{/.test(catchBlock) && /terminal: vTerminal/.test(catchBlock), "the log and the revision-log update run only for a terminal refusal, and the result says so");
ok(!/status='error', updated_at=datetime\('now'\) WHERE id=\?"\)\.bind\(r\.id\)\.run\(\);\s*results\.push/.test(body), "the old unconditional error write is gone from drainV2");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
