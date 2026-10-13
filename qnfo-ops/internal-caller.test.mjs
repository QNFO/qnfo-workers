// OPS-INTERNAL-CALLER-1 (qnfo-ops 2.40.0) and its DEPLOY-DRIFT-CF-1 extension (2.47.0), offline. No network.
// Proves the guard exists, only trusts the declared caller names, rewrites Authorization to the router key, and trusts
// qnfo-fleet-control on POST /ops/deploy alone (the guard line is executed against real Request objects); the deploy route
// answers a preflight body before opsDeploy.
// ADVERSARIAL: does not prove the deployed worker carries it, or that the callers' bindings carry the props live; the live
// proof for qnfo-email is a "job <id>" or an action command by email answering without "HTTP 401", and for qnfo-fleet-control
// a cloud_ops_events kind deploy-drift-cf tick with status ok.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const toml = readFileSync(new URL("../qnfo-email/wrangler.toml", import.meta.url), "utf8");
const fcToml = readFileSync(new URL("../qnfo-fleet-control/wrangler.toml", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const i = src.indexOf("OPS-INTERNAL-CALLER-1: only a service binding");
ok(i > 0, "guard present in fetch");
const g = src.slice(i, i + 1200);
ok(/_ic === "qnfo-email"/.test(g) && /env\.OPS_ROUTER_AUTH_KEY/.test(g), "trusts qnfo-email and only when the router key is bound");
ok(/ctx && ctx\.props/.test(g), "reads ctx.props, not a header");
ok(src.indexOf("OPS-INTERNAL-CALLER-1: only a service binding") < src.indexOf("const url = new URL(request.url);", i - 10), "runs before routing");
ok(/\[\[services\]\]\nbinding = "OPS"\nservice = "qnfo-ops"[\s\S]*props = \{ caller = "qnfo-email" \}/.test(toml), "qnfo-email declares the OPS binding with props");

// DEPLOY-DRIFT-CF-1: execute the guard line itself.
const lines = src.slice(i).split("\n");
const guard = lines.find((l) => /^\s*try \{ const _ic = /.test(l));
ok(!!guard, "the guard is one try line");
const callers = (src.match(/var OPS_INTERNAL_DEPLOY_CALLERS = (\[[^\]]*\]);/) || [])[1];
ok(callers === '["qnfo-fleet-control"]', "OPS_INTERNAL_DEPLOY_CALLERS names qnfo-fleet-control only");
const run = new Function("request", "ctx", "env", "OPS_INTERNAL_DEPLOY_CALLERS", guard.trim() + "\nreturn request.headers.get(\"Authorization\");");
const KEY = "router-key-for-test";
const auth = (caller, method, url, env) => run(new Request(url, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? "{}" : undefined }), caller === null ? {} : { props: { caller } }, env || { OPS_ROUTER_AUTH_KEY: KEY }, JSON.parse(callers));
ok(auth("qnfo-fleet-control", "POST", "https://qnfo-ops/ops/deploy") === "Bearer " + KEY, "qnfo-fleet-control on POST /ops/deploy is authenticated");
ok(auth("qnfo-fleet-control", "POST", "https://qnfo-ops/ops/deploy/") === "Bearer " + KEY, "a trailing slash routes the same way and is trusted the same way");
ok(auth("qnfo-fleet-control", "POST", "https://qnfo-ops/v1/chat/completions") === null, "qnfo-fleet-control on the chat route is not authenticated");
ok(auth("qnfo-fleet-control", "POST", "https://qnfo-ops/ops/compat-verify") === null, "qnfo-fleet-control on /ops/compat-verify is not authenticated");
ok(auth("qnfo-fleet-control", "GET", "https://qnfo-ops/ops/deploy") === null, "qnfo-fleet-control with GET is not authenticated");
ok(auth("qnfo-fleet-control", "POST", "https://qnfo-ops/ops/deploy", {}) === null, "no router key bound: nothing is set");
ok(auth("qnfo-email", "POST", "https://qnfo-ops/v1/chat/completions") === "Bearer " + KEY, "qnfo-email keeps its full trust");
ok(auth("qnfo-dashboard", "POST", "https://qnfo-ops/ops/deploy") === null && auth(null, "POST", "https://qnfo-ops/ops/deploy") === null, "any other caller, or no props, is not authenticated");
ok(/catch \(_e\) \{ console\.error\(/.test(guard), "a guard error is logged, not swallowed");

// The route: preflight answered after auth and before opsDeploy.
const r0 = src.indexOf('if (path === "/ops/deploy" && method === "POST") {');
const r1 = src.indexOf("const _dr = await opsDeploy(env, _db || {});", r0);
const route = src.slice(r0, r1);
ok(r0 > 0 && r1 > r0 && route.indexOf("authOk(") > 0 && route.indexOf("authOk(") < route.indexOf("_db.preflight === true"), "the preflight answer follows the auth check and precedes opsDeploy");
ok(/_db\.preflight === true\) return json\(\{ ok: true, preflight: true, caller: /.test(route), "the preflight answers 200 with the caller");
ok(/\[\[services\]\]\nbinding = "SVC_QNFO_OPS"\nservice = "qnfo-ops"\nenvironment = "production"\nprops = \{ caller = "qnfo-fleet-control" \}/.test(fcToml), "qnfo-fleet-control declares the SVC_QNFO_OPS binding with props");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
