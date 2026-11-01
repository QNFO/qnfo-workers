import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const retired = await readFile(new URL("./RETIRED", import.meta.url), "utf8");
const observability = await readFile(new URL("../qnfo-observability/worker.js", import.meta.url), "utf8");
const dashboardRegistry = await readFile(new URL("../qnfo-fleet-dashboard/registry.js", import.meta.url), "utf8");

test("the absent agent websocket worker is explicitly archived", () => {
  assert.match(retired, /^qnfo-agent-ws is archived under RM-AGENT-WS-DECISION-1/m);
  assert.match(retired, /do not redeploy without a consumer and capacity/i);
});

test("the retired worker is absent from active health-monitor inventories", () => {
  const fallback = observability.match(/const FLEET = \[([\s\S]*?)\n\];/);
  assert.ok(fallback, "observability fallback inventory exists");
  assert.doesNotMatch(fallback[1], /qnfo-agent-ws/);
  assert.doesNotMatch(dashboardRegistry, /qnfo-agent-ws/);
});
