// SECRET-ONLY-LEDGER-1 (#1976): a ledgered secret rotation is not a worker's last code deploy for NON-CANONICAL-DEPLOY-1.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("function isSettingsOnly"), b = src.indexOf("var MUT_SLACK_MS");
if (a < 0 || b < a) throw new Error("isSettingsOnly / isSecretOnly block not found");
const cx = vm.createContext({});
vm.runInContext(src.slice(a, b) + "\nthis.__k = { isSettingsOnly, isSecretOnly };", cx);
const { isSettingsOnly, isSecretOnly } = cx.__k;
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

// fleet_deploys 3419, read 2026-10-05: the row that raised DEPLOY-NON-CANONICAL-DEPLOY: fleet (sample qnfo-ops)
const rot = { id: 3419, worker: "qnfo-ops", actor: "deepchat/ops secret-rotate", to_sha: "k1-rotated", ok: 1, note: "CANONICAL-DEPLOY-AUTH-DRIFT-1 remediation: rotated OPS_ROUTER_AUTH_KEY (k1) secret on qnfo-ops; updated ~/.env + GitHub Actions secret; verified /ops/deploy ok with new k1" };
ok(isSecretOnly(rot), "the k1 rotation row is a secret-only change");
ok(isSecretOnly({ actor: "session", note: "SECRET-ONLY: GMAIL_PASS set under the #1701 lease", to_sha: null }), "an explicit SECRET-ONLY note is a secret-only change");
ok(!isSecretOnly({ actor: "qnfo-ops/ops-deploy", note: "server-side deploy (opsDeploy route)", to_sha: null }), "a canonical deploy is a code deploy");
ok(!isSecretOnly({ actor: "wrangler", note: "deploy + secret put", to_sha: "2.38.41-x" }), "a row that carries a code version stays a code deploy even if it also set a secret");
ok(!isSecretOnly({ actor: "manual", note: "raw_put deploy", to_sha: "1.0.0" }), "a non-canonical code deploy is still caught");
ok(isSettingsOnly("SETTINGS-ONLY: observability reassert") && !isSettingsOnly("server-side deploy"), "SETTINGS-ONLY rule unchanged");
// the lastCode selection the detector uses
const ledger = [
  { worker: "qnfo-ops", actor: "qnfo-ops/ops-deploy", to_sha: null, ok: 1, note: "server-side deploy (opsDeploy route)" },
  { worker: "qnfo-ops", actor: "qnfo-fleet-control/obs-reassert", to_sha: null, ok: 1, note: "SETTINGS-ONLY: observability reassert" },
  rot,
];
const lastCode = {}; for (const r of ledger) if (!isSettingsOnly(r.note) && !isSecretOnly(r)) lastCode[r.worker] = r;
ok(lastCode["qnfo-ops"].note.indexOf("opsDeploy route") >= 0, "qnfo-ops's last code deploy is the canonical one, so it is not flagged");
console.log(fails + " failure(s)");
process.exit(fails ? 1 : 0);
