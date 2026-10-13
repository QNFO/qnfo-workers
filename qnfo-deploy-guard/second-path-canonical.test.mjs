// SECOND-PATH-CANONICAL-1 (qnfo-deploy-guard 1.3.25, agent_issues 2391): a successful deploy by canonical-deploy.yml's second path
// (scripts/direct_content_deploy.py, DEPLOY-SECOND-PATH-1) is the canonical workflow's own path, not a non-canonical deploy.
// Run: node qnfo-deploy-guard/second-path-canonical.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("function isSettingsOnly"), b = src.indexOf("var MUT_SLACK_MS");
if (a < 0 || b < a) throw new Error("ledger helper block not found");
const cx = vm.createContext({});
vm.runInContext(src.slice(a, b) + "\nthis.__k = { isSettingsOnly, isSecretOnly, isSecondPath, SECOND_PATH_ACTOR };", cx);
const { isSettingsOnly, isSecretOnly, isSecondPath, SECOND_PATH_ACTOR } = cx.__k;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
// fleet_deploys 5795, read 2026-10-13 15:17Z: the row behind the reopened DEPLOY-NON-CANONICAL-DEPLOY: fleet (sample idea-hub)
const row5795 = { id: 5795, worker: "idea-hub", actor: "canonical-deploy/direct_content_deploy", to_sha: "1.8.5-zaraz-load", ok: 1, note: "MIRRORED-FROM-DEPLOYMENT-HISTORY-1" };
ok(SECOND_PATH_ACTOR === "canonical-deploy/direct_content_deploy", "the actor is the DEPLOYED_BY of scripts/direct_content_deploy.py");
ok(readFileSync(join(here, "..", "scripts", "direct_content_deploy.py"), "utf8").indexOf('DEPLOYED_BY = "' + SECOND_PATH_ACTOR + '"') >= 0, "the deployer still writes that actor");
ok(isSecondPath(row5795), "the idea-hub fallback row is the second path");
ok(!isSecondPath({ actor: "qnfo-ops/ops-deploy", note: "server-side deploy (opsDeploy route)" }), "an /ops/deploy row is not the second path");
ok(!isSecondPath({ actor: "manual raw_put", note: "raw_put deploy" }), "a hand deploy is not the second path");
ok(!isSecondPath({ actor: "canonical-deploy/direct_content_deploy-x" }), "only the exact actor counts");
// the detector's selection, as in scan(): last code row per worker, then the canonical rules
function nonCanonical(ledger, containers) {
  const lastCode = {}; for (const r of ledger) if (!isSettingsOnly(r.note) && !isSecretOnly(r)) lastCode[r.worker] = r;
  const out = [];
  for (const w in lastCode) {
    const nlr = lastCode[w], nnote = String(nlr.note || "");
    if ((containers || []).indexOf(w) >= 0) { if (nlr.ok === 0) out.push(w); continue; }
    if (isSecondPath(nlr)) { if (nlr.ok === 0) out.push(w); continue; }
    if (nnote.indexOf("opsDeploy route") < 0 || nlr.ok === 0) out.push(w);
  }
  return out;
}
const ledger = [
  { worker: "idea-hub", actor: "qnfo-ops/ops-deploy", ok: 1, note: "server-side deploy (opsDeploy route)" },
  row5795,
  { worker: "qnfo-social", actor: "qnfo-ops/ops-deploy", ok: 1, note: "server-side deploy (opsDeploy route)" },
];
ok(nonCanonical(ledger).length === 0, "a successful second-path deploy leaves the fleet canonical");
ok(nonCanonical(ledger.concat([{ worker: "qnfo-social", actor: SECOND_PATH_ACTOR, ok: 0, note: "MIRRORED-FROM-DEPLOYMENT-HISTORY-1" }])).join() === "qnfo-social", "a failed second-path attempt is still flagged");
ok(nonCanonical(ledger.concat([{ worker: "idea-hub", actor: "manual", ok: 1, note: "raw_put deploy", to_sha: "1.8.6" }])).join() === "idea-hub", "a hand deploy after the second path is still flagged");
const loop = src.slice(src.indexOf("var nonCanon = [];"), src.indexOf('if (nonCanon.length) anomalies.push('));
ok(/if \(isSecondPath\(nlr\)\) \{ if \(nlr\.ok === 0\) nonCanon\.push\(ncw\); continue; \}/.test(loop), "scan() applies the second-path rule before the opsDeploy-route rule");
ok(loop.indexOf("isSecondPath(nlr)") < loop.indexOf('nnote.indexOf("opsDeploy route") < 0'), "the rule runs before the route check");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
