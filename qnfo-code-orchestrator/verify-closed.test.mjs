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
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
