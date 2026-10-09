// OPS-INTERNAL-CALLER-1 (qnfo-ops 2.40.0), offline source check. No network.
// Proves the guard exists, only trusts the declared caller name, and rewrites Authorization to the router key.
// ADVERSARIAL: does not prove the deployed worker carries it, or that qnfo-email's OPS binding declares the prop; the live
// proof is a "job <id>" or an action command by email answering without "HTTP 401".
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const toml = readFileSync(new URL("../qnfo-email/wrangler.toml", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const i = src.indexOf("OPS-INTERNAL-CALLER-1: only a service binding");
ok(i > 0, "guard present in fetch");
const g = src.slice(i, i + 600);
ok(/_ic === "qnfo-email"/.test(g) && /env\.OPS_ROUTER_AUTH_KEY/.test(g), "trusts only qnfo-email and only when the router key is bound");
ok(/ctx && ctx\.props/.test(g), "reads ctx.props, not a header");
ok(src.indexOf("OPS-INTERNAL-CALLER-1: only a service binding") < src.indexOf("const url = new URL(request.url);", i - 10), "runs before routing");
ok(/\[\[services\]\]\nbinding = "OPS"\nservice = "qnfo-ops"[\s\S]*props = \{ caller = "qnfo-email" \}/.test(toml), "qnfo-email declares the OPS binding with props");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
