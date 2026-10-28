// BP26-AI-GATEWAY-BUDGETS-1 (agent_issues 1000614, 1000351): every model call of q08-signal-engine goes through aiGatewayRun.
// Offline source check: env.AI.run appears exactly once (inside aiGatewayRun) and the helper passes the gateway option.
// Output MUST contain "0 failed" on success.   node q08-signal-engine/ai-gateway-routing.test.mjs
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const direct = src.match(/env\.AI\.run\(/g) || [];
ok(direct.length === 1, "env.AI.run is called in one place only (aiGatewayRun), found " + direct.length);
const helper = src.slice(src.indexOf("async function aiGatewayRun"), src.indexOf("async function readerTest"));
ok(/env\.AI\.run\(model, input, opts\)/.test(helper) && /gateway: gw/.test(helper), "that one call carries the gateway option");
for (const purpose of ["compose", "title-repair", "forecast", "factcheck", "judge", "panel"]) {
  ok(new RegExp("purpose: \"" + purpose + "\"").test(src), "purpose " + purpose + " is labelled for gateway logs");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
