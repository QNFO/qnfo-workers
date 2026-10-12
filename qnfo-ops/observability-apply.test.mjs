// OBSERVABILITY-DECLARED-APPLY-1 (qnfo-ops 2.41.0), offline suite. No network.
// Proves: the [observability] blocks of a wrangler.toml are parsed into the fields the Workers script-upload metadata
// documents, the declared keys are overlaid on the live settings without switching off what the file does not name, the
// upload metadata carries the result, a file that declares nothing leaves the upload as it was, and a refusal by
// Cloudflare falls back to the upload without the block.
// ADVERSARIAL: does not prove Cloudflare accepts the block; the live proof is a deployment_history success row whose
// notes read "observability=applied" and GET /settings showing the declared values.
// Run: node qnfo-ops/observability-apply.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync, readdirSync, existsSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const i = src.indexOf("var OBS_KEYS = "), j = src.indexOf("\nasync function installDeclaredBindings(", i);
ok(i > 0 && j > i, "the pure functions are found in worker.js");
const lib = new Function(src.slice(i, j) + "\nreturn { parseDeclaredObservability, mergeObservability };")();
const P = lib.parseDeclaredObservability, M = lib.mergeObservability;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(vm && (Number(vm[1]) > 2 || (Number(vm[1]) === 2 && Number(vm[2]) >= 41)), "VERSION is at least 2.41.0", vm && vm[0]);

// parse
ok(P("name = \"x\"\n[limits]\ncpu_ms = 1\n") === null, "no block declares nothing");
ok(eq(P("[observability]\nenabled = true\nhead_sampling_rate = 1\n"), { enabled: true, head_sampling_rate: 1 }), "plain block");
const full = P("[observability]\nenabled = true # on\n\n  [observability.logs]\n  enabled = true\n  invocation_logs = false\n  head_sampling_rate = 0.6\n  destinations = [\"cloudflare\", \"x\"]\n\n[observability.traces]\nenabled = true\nhead_sampling_rate = 0.05\n[observability.issues]\nenabled = true\n[vars]\nenabled = false\n");
ok(eq(full, { enabled: true, logs: { enabled: true, invocation_logs: false, head_sampling_rate: 0.6, destinations: ["cloudflare", "x"] }, traces: { enabled: true, head_sampling_rate: 0.05 }, issues: { enabled: true } }), "sub-blocks, comments, arrays; a later section's keys are not read", full);
const inl = P("[observability]\nenabled = true\nlogs = { enabled = true, invocation_logs = true }\ntraces = { enabled = true, head_sampling_rate = 0.5 }\n");
ok(eq(inl, { enabled: true, logs: { enabled: true, invocation_logs: true }, traces: { enabled: true, head_sampling_rate: 0.5 } }), "inline tables", inl);
ok(eq(P("[observability]\nenabled = yes\nhead_sampling_rate = 7\nbogus = true\n[observability.other]\nenabled = true\n"), null), "bad values and unknown keys are dropped");
ok(eq(P("[env.staging.observability]\nenabled = false\n"), null), "an environment's block is not the worker's");

// merge
const live = { enabled: true, head_sampling_rate: 1, redact_query_string: false, logs: { enabled: true, destinations: ["cloudflare"], head_sampling_rate: 1, persist: true, invocation_logs: true }, traces: { enabled: true, destinations: ["cloudflare"], persist: true, head_sampling_rate: 1 }, issues: { enabled: true } };
ok(M(live, null) === null && M(live, {}) === null, "nothing declared -> nothing sent");
const m1 = M(live, { enabled: true, head_sampling_rate: 1 });
ok(m1.traces.enabled === true && m1.logs.enabled === true && m1.logs.invocation_logs === true && m1.issues.enabled === true && eq(m1.traces.destinations, ["cloudflare"]), "a file that says only enabled = true keeps live traces, logs and issues", m1);
const m2 = M(live, { enabled: true, traces: { enabled: true, head_sampling_rate: 0.1 } });
ok(m2.traces.head_sampling_rate === 0.1 && m2.traces.persist === true && m2.logs.invocation_logs === true, "declared key wins, undeclared keys keep live values", m2);
const m3 = M(null, { enabled: true, traces: { enabled: true } });
ok(eq(m3, { enabled: true, traces: { enabled: true } }), "no live settings: only what is declared", m3);
const m4 = M({}, { logs: { head_sampling_rate: 1 }, traces: { enabled: true } });
ok(m4.enabled === true && m4.logs.enabled === true && m4.logs.invocation_logs === true, "the fields the API requires on logs are filled", m4);
const m5 = M({ enabled: true, head_sampling_rate: null, logs: null, junk: 1, traces: { enabled: true, junk: 2 } }, { enabled: true });
ok(eq(m5, { enabled: true, traces: { enabled: true } }), "nulls and undocumented live keys are not echoed", m5);
ok(M(live, { enabled: false }).enabled === false, "an explicit false is sent");
ok(eq(live.traces, { enabled: true, destinations: ["cloudflare"], persist: true, head_sampling_rate: 1 }), "the live object is not mutated");

// wiring in cfWorkerDeploy
ok(/out\.observability = parseDeclaredObservability\(toml\);/.test(src), "the installer surfaces the declared block");
ok(/let _obsOut = _declObs && _settingsRead \? mergeObservability\(_liveObs, _declObs\) : null;/.test(src), "merged only when the live settings were read");
ok(/_obsOut \? \{ observability: _obsOut \} : \{\}/.test(src), "the upload metadata carries it");
const k = src.indexOf("if (!resp.ok && _obsOut) {");
ok(k > 0 && /_obsOut = null;\s+resp = await fetch\(_putUrl, \{ method: "PUT", headers: _putHeaders, body: _buildBody\(\) \}\);/.test(src.slice(k, k + 600)), "a refusal is retried once without the block");
ok(k > src.indexOf("for (let _pr = 0; _pr < 3") && k < src.indexOf('status: "failed", notes: "cf_worker_deploy FAILED'), "the fallback runs after the dangling-binding retries and before the failure is recorded");

// every worker's wrangler.toml in the repo parses to something the merge accepts
const root = new URL("../", import.meta.url);
let seen = 0;
for (const d of readdirSync(root, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const t = new URL(d.name + "/wrangler.toml", root);
  if (!existsSync(t)) continue;
  const decl = P(readFileSync(t, "utf8"));
  if (!decl) continue;
  seen++;
  const mm = M(live, decl);
  ok(mm && typeof mm.enabled === "boolean" && (!mm.logs || (typeof mm.logs.enabled === "boolean" && typeof mm.logs.invocation_logs === "boolean")), d.name + " yields valid metadata", mm);
}
ok(seen >= 1, "at least one repo wrangler.toml declares observability");
const own = P(readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8"));
ok(own && own.logs && own.logs.enabled === true && own.traces && own.traces.enabled === true, "qnfo-ops declares logs and traces", own);

// RAND-ID-CRYPTO-1
ok(!/function randId\(prefix\) \{[^}]*Math\.random/.test(src) && /function rndHex8\(\) \{[\s\S]{0,80}crypto\.getRandomValues/.test(src), "randId draws from crypto.getRandomValues");
const r = new Function(src.slice(src.indexOf("function rndHex8() {"), src.indexOf("\n__name(randId")) + "\nreturn randId;")();
ok(/^job-[0-9a-f]{14}$/.test(r("job-")) && r("a") !== r("a"), "randId keeps its shape: prefix + 8 hex + 6 hex");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
