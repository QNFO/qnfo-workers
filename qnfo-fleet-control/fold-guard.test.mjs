// FOLD-GUARD-PARITY-1 (qnfo-fleet-control 0.4.133, SCORER-HOST-DENY-1) offline suite. No network.
// A worker on the never-auto-merge list keeps that protection when it is folded: SCORER-FOLD-1 moved qnfo-autonomy-scorer
// (denied, because it computes the scores the fleet is graded by) into qnfo-observability, which no list named, so the
// planner and the merge runner accepted changes to the scoring formula. This suite reads every FOLDED marker in the
// repository ("<guest> is FOLDED into <host>" or "folded into <host>") and fails when a denied guest's host is not denied;
// it also holds the three copies of the list equal: fleet-control EVOLVE_DENY + the code loop (CM_DENY), the transformation
// loop's TP_CONTROL_PLANE and the code orchestrator's PLAN_DENY_WORKERS.
// Run: node qnfo-fleet-control/fold-guard.test.mjs   -> prints "N passed, 0 failed"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fc = fs.readFileSync(path.join(root, "qnfo-fleet-control/worker.js"), "utf8");
const co = fs.readFileSync(path.join(root, "qnfo-code-orchestrator/worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const list = (src, re) => { const m = re.exec(src); return m ? JSON.parse(m[1]) : null; };
const evolveDeny = list(fc, /^var EVOLVE_DENY = (\[[^\]]*\]);$/m);
const cmExtra = list(fc, /^var CM_DENY = EVOLVE_DENY\.concat\((\[[^\]]*\])\);$/m);
const tpCp = list(fc, /^var TP_CONTROL_PLANE = (\[[^\]]*\]);$/m);
const planDeny = list(co, /^const PLAN_DENY_WORKERS = (\[[^\]]*\]);$/m);
ok(Array.isArray(evolveDeny) && Array.isArray(cmExtra) && Array.isArray(tpCp) && Array.isArray(planDeny), "the four lists parse", { evolveDeny, cmExtra, tpCp, planDeny });
const cm = (evolveDeny || []).concat(cmExtra || []);
const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
ok(same(cm, tpCp || []), "TP_CONTROL_PLANE equals CM_DENY (EVOLVE_DENY + the code loop)", { cm, tpCp });
ok(same(cm, planDeny || []), "PLAN_DENY_WORKERS equals CM_DENY", { cm, planDeny });
// Every FOLDED marker that names a host.
const folds = [];
for (const d of fs.readdirSync(root)) {
  const f = path.join(root, d, "FOLDED");
  if (!fs.existsSync(f)) continue;
  const txt = fs.readFileSync(f, "utf8");
  const m = /\bis FOLDED into ([a-z0-9][a-z0-9-]+)/.exec(txt) || /\bfolded into ([a-z0-9][a-z0-9-]+)/i.exec(txt);
  if (m) folds.push({ guest: d, host: m[1] });
}
ok(folds.length >= 8, "the FOLDED markers that name a host are read (8 on 2026-10-06)", folds.length);
ok(folds.some((x) => x.guest === "qnfo-autonomy-scorer" && x.host === "qnfo-observability"), "the scorer's marker names qnfo-observability");
const holes = folds.filter((x) => cm.includes(x.guest) && !cm.includes(x.host));
ok(holes.length === 0, "every denied guest's host is denied (a fold never lifts the protection)", holes);
ok(cm.includes("qnfo-observability"), "qnfo-observability (the scorer's host) is on the list");
// The merge runner refuses the host path, and the transformation loop routes its levers to a session.
const scope = new Function(fc.slice(fc.indexOf("var EVOLVE_DENY = "), fc.indexOf("\n", fc.indexOf("var EVOLVE_DENY = "))) + "\n" +
  fc.slice(fc.indexOf("var CM_DENY = "), fc.indexOf("\n", fc.indexOf("var CM_DENY = "))) + "\n" +
  fc.slice(fc.indexOf("function cmScope(path) {"), fc.indexOf("__name(cmScope")) + "\nreturn cmScope;")();
const r = scope("qnfo-observability/worker.js");
ok(r && r.ok === false && /never auto-merges/.test(r.why), "cmScope refuses qnfo-observability/worker.js", r);
ok(scope("qnfo-infra/worker.js").ok === true, "an ordinary worker is still in scope");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
