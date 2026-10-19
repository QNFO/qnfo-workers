/**
 * container-own-deploy.test.mjs -- offline regression lock for CM-ORCH-OWN-DEPLOY-1 (qnfo-fleet-control 0.39.1, agent_issues 100237).
 *
 * cmIntegrityGate refused every code task on qnfo-code-orchestrator ("declares [[containers]]; the canonical deploy cannot carry it"),
 * although the owner put the orchestrator in CM_LOOP_CANARIED (CODE-LOOP-CONTROL-PLANE-1, 2026-10-19). A container worker with its own
 * deploy workflow that runs the canary and the automatic revert (scripts/canary_revert.py REDEPLOY_WORKFLOW) is deployed, canaried and
 * reverted like any canaried worker. Proves: CM_OWN_DEPLOY equals the REDEPLOY_WORKFLOW workers and sits inside CM_LOOP_CANARIED and outside
 * CM_DENY; each has a workflow that triggers on its directory and runs the canary with the grants it needs; the gate lets the orchestrator
 * through the containers check and still reaches the revertibility check; any other container worker is still refused with the old text;
 * a worker without containers is unaffected.
 *
 *   node qnfo-fleet-control/container-own-deploy.test.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const script = readFileSync(join(here, "..", "scripts", "canary_revert.py"), "utf8");
let fails = 0;
const check = (c, m, d) => { if (!c) { fails++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const list = (name) => { const m = new RegExp("var " + name + " = \\[([^\\]]*)\\]").exec(src); return m ? m[1].match(/"([^"]+)"/g).map((x) => x.replace(/"/g, "")) : null; };

const own = list("CM_OWN_DEPLOY"), canaried = list("CM_LOOP_CANARIED");
check(own && own.length >= 1, "CM_OWN_DEPLOY is declared and not empty", own);
check(canaried && own && own.every((w) => canaried.includes(w)), "every own-deploy worker is in CM_LOOP_CANARIED (the owner's list)", { own, canaried });

const red = /REDEPLOY_WORKFLOW = \{([^}]*)\}/.exec(script);
const redeploy = red ? Object.fromEntries([...red[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]])) : {};
check(own && Object.keys(redeploy).sort().join() === own.slice().sort().join(), "CM_OWN_DEPLOY equals the workers canary_revert.py REDEPLOY_WORKFLOW redeploys itself", { own, redeploy });
for (const [w, wf] of Object.entries(redeploy)) {
  const y = readFileSync(join(here, "..", ".github", "workflows", wf), "utf8");
  check(y.includes('"' + w + '/**"') && /scripts\/canary_revert\.py/.test(y) && /contents: write/.test(y) && /actions: write/.test(y), "the own deploy workflow of " + w + " (" + wf + ") triggers on its directory and runs the canary with the revert grants");
  const toml = readFileSync(join(here, "..", w, "wrangler.toml"), "utf8");
  check(/^\[\[containers\]\]/m.test(toml), w + " really declares [[containers]] (the exemption is for a container worker)");
}

// The gate itself, sliced from worker.js with its collaborators stubbed.
const a = src.indexOf("function cmIntegrityGate("), b = src.indexOf("__name(cmIntegrityGate");
check(a > 0 && b > a, "cmIntegrityGate is in worker.js");
const ctx = { CM_OWN_DEPLOY: own, __name: (f) => f, cmWait: (why) => ({ action: "wait", why }), cmRefuse: (why) => ({ action: "refuse", why }),
  cmScope: (p) => ({ ok: true, kind: "worker", worker: String(p).split("/")[0] }) };
vm.createContext(ctx);
vm.runInContext(src.slice(a, b) + "\nthis.gate = cmIntegrityGate;", ctx);
const gate = (path, integ) => ctx.gate({ path }, integ);
const base = { ok: true, revertible: true };

let r = gate("qnfo-code-orchestrator/worker.js", { ...base, containers: true });
check(r === null, "the orchestrator (containers, revertible) passes the integrity gate", r);
r = gate("qnfo-code-orchestrator/worker.js", { ...base, containers: true, revertible: false, revert_why: "no single var VERSION line" });
check(r && r.action === "refuse" && r.why.startsWith("not auto-revertible"), "the orchestrator still has to be revertible: the check after the containers check applies", r);
r = gate("qnfo-containers-pilot/worker.js", { ...base, containers: true });
check(r && r.action === "refuse" && r.why === "qnfo-containers-pilot declares [[containers]]; the canonical deploy cannot carry it", "another container worker is refused with the old text", r);
r = gate("qnfo-ai/worker.js", { ...base, containers: false });
check(r === null, "a worker without containers is unaffected", r);
r = gate("qnfo-code-orchestrator/worker.js", { ok: false, why: "stale", stale: true });
check(r && r.action === "refuse" && r.stale_patch === true, "an integrity failure is refused before the containers check", r);

const v = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
check(v && (Number(v[1]) > 0 || Number(v[2]) > 39 || (Number(v[2]) === 39 && Number(v[3]) >= 1)), "VERSION is at least 0.39.1", v && v[0]);

console.log(fails ? fails + " FAILED" : "container-own-deploy: all assertions passed (0 failed)");
process.exit(fails ? 1 : 0);
