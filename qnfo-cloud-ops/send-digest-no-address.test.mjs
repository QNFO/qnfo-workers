// BP26-PII-LOGS-3 (agent_issues 1001984): sendDigest results are logged by the briefing step, so none may carry an address.
// Run: node --no-warnings qnfo-cloud-ops/send-digest-no-address.test.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const start = src.indexOf("async function sendDigest(");
const end = src.indexOf('__name(sendDigest, "sendDigest");');
ok(start > 0 && end > start, "sendDigest is found");
const hd = /var HUMAN_DOMAINS = new Set\([^\n]*\);/.exec(src);
ok(!!hd, "HUMAN_DOMAINS is found");
const mk = new Function(hd[0] + "\n" + src.slice(start, end) + "\nreturn sendDigest;");
const sendDigest = mk();
const addr = "owner@example.org";
const cases = [
  ["ok", { SEND_EMAIL: { send: async () => ({ messageId: "m1" }) }, DIGEST_TO: addr }],
  ["error", { SEND_EMAIL: { send: async () => { throw new Error("boom"); } }, DIGEST_TO: addr }],
  ["personal-domain", { SEND_EMAIL: { send: async () => ({}) }, DIGEST_TO: "someone@gmail.com" }],
];
for (const [name, env] of cases) {
  const r = await sendDigest(env, "s", "t");
  ok(!JSON.stringify(r).includes("@"), name + ": result carries no @", r);
  ok(!("to" in r), name + ": result has no .to", r);
  ok(typeof r.to_domain === "string" && r.to_domain.length > 0, name + ": result names to_domain", r);
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
