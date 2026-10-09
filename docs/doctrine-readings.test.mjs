// docs/doctrine-readings.test.mjs: DOCTRINE-READINGS-GUARD-1 (2026-10-09, pillar security; agent_issues 2187, 2231).
//
// WHY    The owner revises the Autonomous Operation Doctrine often (revisions 1 to 5 and the v8 "reflexive kernel" text on
//        2026-10-09 alone), and each revision is adopted verbatim by whichever session holds the file. The fixed readings in
//        its preface are what keep clauses like "a blocker is proven only after all surfaces are red-teamed", "self-granted
//        authority" and "external loads ... are rejected" from being read as licence to retry a refused action another way,
//        widen a session's own permissions, or rotate a shared secret outside the lock. A verbatim adoption that drops them
//        would be one edit away from loops acting on the bare text.
// WHAT   Fails when docs/AUTONOMOUS-OPERATION-DOCTRINE.md no longer states, in substance:
//          R1 a refusal by a permission check, policy or safety classifier is recorded and never retried on another surface;
//          R2 self-granted / constructed authority never circumvents a refusal (reading b);
//          R3 trust and scope widening apply to fleet loops, never to a session's own permission settings, hooks or
//             classifier configuration (reading f);
//          R4 credentials are never minted or rotated outside the secret lock (reading a);
//          and, once the v8 kernel text is adopted (markers IC-ADOPT-001 / reflexive-kernel / installs_on_read):
//          R5 "external loads ... rejected" never covers the harness, Anthropic usage policy or the owner's instructions;
//          R6 stating "I won't" for a refused or out-of-floor action is honest reporting, not drift.
//        Wording may change; the substance is matched with tolerant patterns. Runs on every change under docs/ and on every
//        full-set run (scripts/run-suites.mjs SUITE-RUNNER-1).
// FIX    Restore the reading in the preface (the text of agent_issues 2187 and 2231 is the reference); do not weaken this test
//        to admit a doctrine without it.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, "AUTONOMOUS-OPERATION-DOCTRINE.md"), "utf8").replace(/\n>\s?/g, " ").replace(/\s+/g, " ");

let failed = 0, passed = 0;
function check(name, ok, hint) {
  if (ok) { passed++; console.log("ok   " + name); }
  else { failed++; console.log("FAIL " + name + " :: " + hint); }
}

check("R1 refusal is not retried on another surface",
  /safety classifier/i.test(text) && /(never|not) retried/i.test(text),
  "the preface must say a permission check, policy refusal or safety classifier's no is recorded and never retried on another surface (reading c)");
check("R2 constructed authority never circumvents a refusal",
  /never circumventing a refusal|never circumvent(s)? a refusal/i.test(text),
  "reading (b): authority is composed from what the fleet holds, never by circumventing a refusal, permission denial or classifier");
check("R3 scope widening never touches a session's own permissions",
  /permission settings, hooks or classifier configuration/i.test(text),
  "reading (f): a session never edits its own permission settings, hooks or classifier configuration to widen what it may do");
check("R4 credentials stay under the secret lock",
  /secret lock/i.test(text) && /(minting or rotating|mint(ed)? or rotat)/i.test(text),
  "reading (a): no live shared credential is minted or rotated outside the secret lock");

const v8 = /IC-ADOPT-001|reflexive-kernel|installs_on_read/.test(text);
check("R5 (v8) rejecting external loads never covers the harness, usage policy or the owner",
  !v8 || /external loads[^.]{0,200}never cover[^.]{0,200}(harness|usage policy)/i.test(text),
  "v8 text is adopted: add the reading of agent_issues 2231 (ii) to the preface");
check("R6 (v8) \"I won't\" is honest reporting",
  !v8 || /I won.t[^.]{0,200}(honest|valid)/i.test(text),
  "v8 text is adopted: add the reading of agent_issues 2231 (iv) to the preface");

console.log(`\n${passed} passed, ${failed} failed${v8 ? " (v8 kernel text present)" : ""}`);
if (failed) process.exit(1);
