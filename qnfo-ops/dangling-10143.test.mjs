// DANGLING-BINDING-10143-1 (qnfo-ops 2.38.43, #1756) offline check. No network.
// Proves: the canonical deploy's dangling-binding prune (DANGLING-BINDING-PRUNE-1) recognises both Cloudflare rejections of a
// binding to a deleted worker: 10144 ("... references environment 'production' on Worker 'X' which was not found") and
// 10143 ("... references Worker '' which was not found", seen 2026-10-06), and extracts the binding name from each; any
// other error code or wording is not treated as dangling.
// Run: node qnfo-ops/dangling-10143.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const cond = /if \(_er && \(Number\(_er\.code\) === 10144 \|\| Number\(_er\.code\) === 10143\)\) \{\n\s*const _dm = (\/Service binding[^\n]*?which was not found\/)\.exec/.exec(src);
ok(!!cond, "the prune accepts codes 10144 and 10143");
const re = cond ? eval(cond[1]) : /$^/;
const m1 = re.exec("Service binding 'KAIZEN' references Worker '' which was not found. Verify the Worker exists in your account");
const m2 = re.exec("Service binding 'FLEET_FEED' references environment 'production' on Worker 'qnfo-fleet-feed' which was not found");
ok(m1 && m1[1] === "KAIZEN", "10143 wording yields the binding name", m1);
ok(m2 && m2[1] === "FLEET_FEED", "10144 wording still yields the binding name", m2);
ok(!re.exec("Service binding 'X' is invalid"), "other wordings are not dangling");
ok(/existingBindings\.some\(function \(b\) \{ return b && b\.type === "service" && b\.name === _dead; \}\)/.test(src), "only a live pre-existing service binding is dropped");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
