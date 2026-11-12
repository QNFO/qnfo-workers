// qnfo-ops/workflow-binding-name.test.mjs: WORKFLOW-NAME-BIND-1. installDeclaredBindings must carry a [[workflows]] block's `name`
// as workflow_name: without it the upload stored "" and every create() answered "Workflow does not exist".
// Run: node qnfo-ops/workflow-binding-name.test.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); ok(i > 0 && j > i, "anchor found: " + a); return i > 0 && j > i ? src.slice(i, j) : ""; };
const body = [
  'var CF_ACCOUNT_ID = "acct"; var VERSION = "9.9.9-test";',
  "function iso() { return '2026-11-12T10:00:00.000Z'; }", "var FLEET = [];",
  "async function probeService() { return {}; }", "async function cfWorkerRead() { return { ok: true, version: '1.0.0' }; }",
  "async function recordDeployLedger() { return { ok: true }; }", "function __name() {} function __name2() {} function __name22() {}",
  cut("function b64Utf8(", "// ---- UTF8-DEPLOY-1:END"),
  cut("var CF_RETRY_MAX = ", "\nasync function cfWorkerDeploy("),
  cut("var COMPAT_FLIPS = [", "\nvar OBS_KEYS = "),
  cut("var OBS_KEYS = ", "\n__name(installDeclaredBindings"),
  "return { installDeclaredBindings };"
].join("\n");
const TOML = 'name = "w"\nmain = "worker.js"\n\n[[workflows]]\nname = "personal-pipeline"\nbinding = "PERSONAL_FLOW"\nclass_name = "PersonalPipelineFlow"\n\n[[workflows]]\nname = "remote-flow"\nbinding = "REMOTE"\nclass_name = "RemoteFlow"\nscript_name = "other-worker"\n';
const J = (o, s) => ({ ok: (s || 200) < 300, status: s || 200, json: async () => o, text: async () => JSON.stringify(o), clone() { return this; }, headers: { get() { return null; } } });
const fetchStub = async (url) => /\/contents\/w\/wrangler\.toml\?ref=main$/.test(String(url)) ? J({ content: Buffer.from(TOML, "utf8").toString("base64") }) : J({ message: "Not Found" }, 404);
const H = new Function("h", "fetch", "setTimeout", body)({}, fetchStub, (fn) => { fn(); return 0; });
const ins = await H.installDeclaredBindings({ CF_API_TOKEN: "t", QNFO_AUDIT: { prepare() { return { async first() { return null; } }; } } }, "w");
const wf = (ins.bindings || []).filter((b) => b.type === "workflow");
ok(wf.length === 2, "both workflow blocks are installed", ins);
ok(wf[0] && wf[0].workflow_name === "personal-pipeline" && wf[0].class_name === "PersonalPipelineFlow" && wf[0].name === "PERSONAL_FLOW" && !("script_name" in wf[0]), "workflow_name is the block's name", wf[0]);
ok(wf[1] && wf[1].workflow_name === "remote-flow" && wf[1].script_name === "other-worker", "script_name is kept for a class in another worker", wf[1]);
ok(/var VERSION = "2\.(7[2-9]|[89]\d)\./.test(src), "qnfo-ops VERSION is at least 2.72.0");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
