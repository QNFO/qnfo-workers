// INTERNAL-HOST-TRUST-1: service-binding callers (host qnfo-ai.internal) are authenticated without a key copy;
// public callers with a wrong key are still rejected.
import fs from "node:fs";
const src = fs.readFileSync(new URL("../qnfo-ai/worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const env = { ROUTER_AUTH_KEY: "real-key" };
async function models(host, bearer) {
  const h = bearer ? { Authorization: "Bearer " + bearer } : {};
  const r = await mod.default.fetch(new Request("https://" + host + "/v1/models", { headers: h }), env, { waitUntil() {} });
  const j = await r.json();
  return j.data.length;
}
const internalStale = await models("qnfo-ai.internal", "stale-key");
const internalNone = await models("qnfo-ai.internal", null);
const publicStale = await models("qnfo-ai.q08.workers.dev", "stale-key");
const publicReal = await models("qnfo-ai.q08.workers.dev", "real-key");
if (!(internalStale > 1 && internalNone > 1)) throw new Error("internal caller not authenticated: " + internalStale + "/" + internalNone);
if (publicStale !== 1) throw new Error("public stale key was accepted: " + publicStale);
if (publicReal <= 1) throw new Error("public real key rejected");
console.log("internal-host ok", internalStale, publicStale, publicReal);
