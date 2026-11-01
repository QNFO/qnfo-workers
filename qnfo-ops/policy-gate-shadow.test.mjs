import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
assert.equal(source, mirror, "deployed-current.worker.js mirrors worker.js");

const grab = (start, end) => {
  const i = source.indexOf(start), j = source.indexOf(end, i);
  return i >= 0 && j > i ? source.slice(i, j) : "";
};
const decisionSource = grab("function policyGateShadowDecision(", "\n__name(policyGateShadowDecision");
const shadowSource = grab("async function policyGateShadow(env,", "\n__name(policyGateShadow");
assert.ok(decisionSource && shadowSource, "policy shadow helpers are present");
const gate = new Function("randId", "iso", decisionSource + "\n" + shadowSource + "\nreturn { policyGateShadowDecision, policyGateShadow };")(
  (prefix) => prefix + "test",
  () => "2026-11-01T00:00:00.000Z"
);

const decision = gate.policyGateShadowDecision;
assert.equal(decision("email_respond", { reply_to_id: 17, body: "A reply" }).would_block, false, "complete existing-thread email reply passes");
assert.equal(decision("email_respond", { body: "No thread" }).would_block, true, "email reply without a thread is flagged");
assert.equal(decision("composio_execute", { tool_slug: "GMAIL_SEND_EMAIL", arguments: { confirm: true, body: "A message" } }).would_block, false, "confirmed Composio email with content passes");
assert.equal(decision("composio_execute", { tool_slug: "GMAIL_SEND_EMAIL", arguments: { body: "A message" } }).would_block, true, "unconfirmed Composio email is flagged");
assert.equal(decision("composio_execute", { tool_slug: "LINKEDIN_CREATE_POST", arguments: { confirm: true, text: "A post" } }).would_block, false, "confirmed publication with content passes");
assert.equal(decision("composio_execute", { tool_slug: "LINKEDIN_CREATE_POST", arguments: { text: "A post" } }).would_block, true, "unconfirmed publication is flagged");
assert.equal(decision("r2_delete", { confirm: true, key: "archive/item" }).would_block, false, "confirmed deletion with a named target passes");
assert.equal(decision("r2_delete", { key: "archive/item" }).would_block, true, "deletion without confirmation is flagged");
assert.equal(decision("workspace_delete", { confirm: true, path: "report.txt" }).would_block, false, "confirmed workspace deletion passes");
assert.equal(decision("github_branch_delete", { confirm: true, branch: "stale-branch" }).would_block, false, "confirmed branch deletion passes");
assert.equal(decision("ops_d1_write", { confirm: true, sql: "DELETE FROM example WHERE id = 1" }).would_block, false, "confirmed D1 deletion with a named table passes");
assert.equal(decision("fleet_status", {}), null, "unclassified read-only tools have no policy rule");

function auditStub(config, options = {}) {
  const events = [];
  return {
    events,
    QNFO_AUDIT: {
      prepare(sql) {
        return {
          bind(...values) {
            return {
              first: async () => {
                if (options.failConfig) throw new Error("config read failed");
                return config;
              },
              run: async () => {
                if (options.failInsert) throw new Error("event write failed");
                events.push({ sql, values });
              }
            };
          }
        };
      }
    }
  };
}

const defaultEnv = auditStub(null);
await gate.policyGateShadow(defaultEnv, "r2_delete", { confirm: false, key: "private-name" });
assert.equal(defaultEnv.events.length, 1, "missing config defaults to one shadow event");
const event = defaultEnv.events[0];
const [id, ts, kind, tool, meta, job, status] = event.values;
assert.match(event.sql, /INSERT INTO cloud_ops_events/);
assert.equal(id, "evt-test");
assert.equal(kind, "policy-gate-shadow");
assert.equal(tool, "r2_delete");
assert.equal(job, "qnfo-ops");
assert.equal(status, "shadow");
assert.deepEqual(JSON.parse(meta), {
  rule_id: "delete-explicit-confirmation",
  would_block: true,
  reason: "deletion requires explicit confirmation and a named target",
  mode: "shadow"
});
assert.equal(typeof ts, "string");
assert.ok(!meta.includes("private-name"), "event metadata excludes tool arguments");

const offEnv = auditStub({ value: "off" });
await gate.policyGateShadow(offEnv, "r2_delete", { key: "x" });
assert.equal(offEnv.events.length, 0, "policy_gate_mode=off disables shadow events");

await assert.doesNotReject(() => gate.policyGateShadow(auditStub(null, { failConfig: true }), "r2_delete", { key: "x" }));
await assert.doesNotReject(() => gate.policyGateShadow(auditStub(null, { failInsert: true }), "r2_delete", { key: "x" }));

console.log("POLICY-GATE-1 shadow checks passed");
