// JS-VERIFY-FAIL-CLOSED-1 offline test (GitHub #445): the Dynamic Workers syntax check passes a proposal only when the
// module started, or failed in a way that can only happen after it parsed. Any other start failure is "not verified".
// Run: node --no-warnings qnfo-code-orchestrator/verify-closed.test.mjs   (exit 0 = all passed)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vfc-"));
fs.writeFileSync(path.join(tmp, "w.mjs"), fs.readFileSync(path.join(here, "worker.js"), "utf8") + "\nexport { jsSyntaxCheck as __js };\n");
const { __js } = await import(pathToFileURL(path.join(tmp, "w.mjs")).href);
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + " -- " + JSON.stringify(x)); } };
const audits = [];
const envThrowing = (msg) => ({
  LOADER: { load: () => ({ getEntrypoint: () => ({ fetch: async () => { if (msg === null) return new Response("x"); throw new Error(msg); } }) }) },
  AUDIT_DB: { prepare: (sql) => ({ bind: (...a) => ({ run: async () => { audits.push(a); return {}; } }) }) },
});
const cases = [
  [null, "ok", "the module started"],
  ["Failed to start Worker:\nUncaught SyntaxError: Unexpected identifier 'https'\n  at m.js:934:545", "fail", "a syntax error fails"],
  ["TypeError: Cannot read properties of undefined (reading 'prepare')", "ok", "a runtime TypeError means it parsed"],
  ["ReferenceError: env is not defined", "ok", "a ReferenceError means it parsed"],
  ['No such module "cloudflare:email".', "ok", "an unresolved import means it parsed"],
  ["Network connection lost.", "ok", "a lost connection after start is not a syntax problem"],
  ["Failed to start Worker: Worker exceeded CPU time limit.", "no-verifier", "a CPU-limit start failure is NOT a pass (it was the fail-open hole)"],
  ["Failed to start Worker: script too large", "no-verifier", "an unknown start failure is NOT a pass"],
];
for (const [msg, want, label] of cases) {
  const r = await __js(envThrowing(msg), "export default {}");
  ok(r.verdict === want, label, { msg, r });
}
ok(audits.length === 2, "each unknown start failure is recorded for learning", audits.length);
// JS-VERIFY-RUNTIME-SHAPE-1: live, the class name does not cross the sandbox boundary (ct_qldqse7ngltdth, 08:20Z).
const envThrowingAs = (Ctor, msg) => ({
  LOADER: { load: () => ({ getEntrypoint: () => ({ fetch: async () => { throw new Ctor(msg); } }) }) },
  AUDIT_DB: { prepare: (sql) => ({ bind: (...a) => ({ run: async () => { audits.push(a); return {}; } }) }) },
});
for (const [Ctor, msg, want, label] of [
  [TypeError, "Cannot read properties of undefined (reading 'prepare')", "ok", "a TypeError object with the bare live message means it parsed"],
  [Error, "Cannot read properties of undefined (reading 'prepare')", "ok", "the bare live message with no class name means it parsed"],
  [Error, "env.DB.prepare is not a function", "ok", "'is not a function' means it parsed"],
  [Error, "Cannot access 'x' before initialization", "ok", "a TDZ error means it parsed"],
  [Error, "Failed to start Worker: script too large", "no-verifier", "an unknown start failure is still NOT a pass"],
]) {
  const r = await __js(envThrowingAs(Ctor, msg), "export default {}");
  ok(r.verdict === want, label, { msg, r });
}
// JS-VERIFY-PARSE-SHAPE-1 (0.3.19): V8 parse wording without the class name is a failed proposal (retried), not unverified.
for (const [msg, want, label] of [
  ["Unexpected identifier '__name'", "fail", "the live 07:41Z message (ct_lc6has32addg0m) is a failed proposal, not needs_human"],
  ["Failed to start Worker:\nUncaught Unexpected token '}'\n  at m.js:12:3", "fail", "bare Unexpected token behind the start prefix fails"],
  ["Invalid or unexpected token", "fail", "an unterminated string fails"],
  ["missing ) after argument list", "fail", "a missing paren fails"],
  ["Identifier 'x' has already been declared", "fail", "a redeclared binding is a parse-time error"],
  ["Unexpected end of input", "fail", "a truncated module fails"],
  ["Unexpected token '<', \"<html>\" is not valid JSON", "no-verifier", "JSON.parse wording at runtime is not a parse failure of the module"],
  ["Unexpected end of JSON input", "no-verifier", "JSON input wording is not a parse failure of the module"],
]) {
  const r = await __js(envThrowingAs(Error, msg), "export default {}");
  ok(r.verdict === want, label, { msg, r });
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
