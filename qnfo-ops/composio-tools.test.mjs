// RM-COMPOSIO-BRIDGE-1 offline suite. Exercises the real handlers with mocked fetch; no credentials or network access.
// Proves: account ownership/configuration and ACTIVE status are enforced, inputs and remote calls are bounded,
// execution results are available to the caller, and Composio payloads are absent from audit metadata.
// Run: node qnfo-ops/composio-tools.test.mjs -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";

const IMPORT = 'import { WorkflowEntrypoint, DurableObject, tracing } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const stubs = 'var WorkflowEntrypoint = class {}; var DurableObject = class {}; var tracing = { enterSpan(_name, callback) { return callback({ setAttribute() {} }); } };';
const mod = await import("data:text/javascript;base64," + Buffer.from(
  src.replace(IMPORT, stubs) + "\nexport { composioStatus, composioExecute, composioAuditPayload };\n"
).toString("base64"));

let pass = 0, fail = 0;
const ok = (condition, message, value) => {
  if (condition) pass++;
  else { fail++; console.log("FAIL " + message + (value !== undefined ? " :: " + JSON.stringify(value).slice(0, 400) : "")); }
};
const env = { COMPOSIO_API_KEY: "test-key", COMPOSIO_USER_ID: "qnfo-ops-nonpersonal" };
const account = (overrides = {}) => ({ data: { id: "ca_test_123", user_id: env.COMPOSIO_USER_ID, status: "ACTIVE", toolkit: { slug: "gmail" }, ...overrides } });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const scriptFetch = (handler) => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls.length);
  };
  return calls;
};

const noConfigCalls = scriptFetch(() => { throw new Error("unexpected network call"); });
const noConfig = await mod.composioStatus({ COMPOSIO_API_KEY: env.COMPOSIO_API_KEY }, { connected_account_id: "ca_test_123" });
ok(!noConfig.ok && noConfigCalls.length === 0, "missing configured user fails closed without a request", noConfig);

const invalidIdCalls = scriptFetch(() => { throw new Error("unexpected network call"); });
const invalidId = await mod.composioStatus(env, { connected_account_id: "../other" });
ok(!invalidId.ok && invalidId.rejected && invalidIdCalls.length === 0, "account IDs cannot select another endpoint", invalidId);

const foreignCalls = scriptFetch(() => response(account({ user_id: "personal-user" })));
const foreignStatus = await mod.composioStatus(env, { connected_account_id: "ca_test_123" });
ok(!foreignStatus.ok && foreignStatus.rejected && foreignCalls.length === 1, "status refuses an account belonging to a different Composio user", foreignStatus);

const inactiveCalls = scriptFetch(() => response(account({ status: "INACTIVE" })));
const inactiveStatus = await mod.composioStatus(env, { connected_account_id: "ca_test_123" });
ok(inactiveStatus.ok && inactiveStatus.status === "INACTIVE", "status reports a valid inactive connection without exposing account data", inactiveStatus);
const inactiveExecution = await mod.composioExecute(env, { connected_account_id: "ca_test_123", tool_slug: "GMAIL_SEND_EMAIL", arguments: { to: "reader@example.test" } });
ok(!inactiveExecution.ok && inactiveExecution.rejected && inactiveCalls.length === 2, "inactive accounts are never used to execute a tool", inactiveExecution);

const validCalls = scriptFetch((url, init, call) => call === 1
  ? response(account())
  : response({ successful: true, data: { run_id: "run_test", status: "COMPLETED", output: { id: "message_test" } } }));
const args = { to: "reader@example.test", subject: "hello", body: "payload must not be logged" };
const executed = await mod.composioExecute(env, { connected_account_id: "ca_test_123", tool_slug: "GMAIL_SEND_EMAIL", arguments: args });
ok(executed.ok && executed.result.run_id === "run_test", "successful Composio execution returns the provider result", executed);
ok(validCalls.length === 2 && validCalls[0].init.method === "GET" && validCalls[1].init.method === "POST", "execution checks account ownership before the execute request", validCalls.map((call) => call.init.method));
ok(validCalls[0].url === "https://backend.composio.dev/api/v3.1/connected_accounts/ca_test_123", "account lookup uses the fixed Composio API host and encoded account ID", validCalls[0].url);
ok(validCalls[1].url === "https://backend.composio.dev/api/v3.1/tools/execute/GMAIL_SEND_EMAIL", "tool execution uses the fixed Composio API host and validated slug", validCalls[1].url);
ok(validCalls.every((call) => call.init.headers["x-api-key"] === env.COMPOSIO_API_KEY), "the key is sent only in the Composio authorization header");
ok(JSON.parse(validCalls[1].init.body).connected_account_id === "ca_test_123" && JSON.parse(validCalls[1].init.body).arguments.body === args.body, "the connected account and arguments reach Composio");
ok(validCalls.every((call) => call.init.signal instanceof AbortSignal), "both external calls have an abort deadline");

const badSlugCalls = scriptFetch(() => { throw new Error("unexpected network call"); });
const badSlug = await mod.composioExecute(env, { connected_account_id: "ca_test_123", tool_slug: "../execute", arguments: {} });
ok(!badSlug.ok && badSlug.rejected && badSlugCalls.length === 0, "tool slugs cannot alter the fixed endpoint path", badSlug);
const arrayArgs = await mod.composioExecute(env, { connected_account_id: "ca_test_123", tool_slug: "GMAIL_SEND_EMAIL", arguments: [] });
ok(!arrayArgs.ok && arrayArgs.rejected && badSlugCalls.length === 0, "arguments must be a JSON object", arrayArgs);
const largeArgs = await mod.composioExecute(env, { connected_account_id: "ca_test_123", tool_slug: "GMAIL_SEND_EMAIL", arguments: { body: "x".repeat(32769) } });
ok(!largeArgs.ok && /32 KiB/.test(largeArgs.error) && badSlugCalls.length === 0, "arguments above the 32 KiB limit are rejected before network access");

const failedCalls = scriptFetch((url) => url.includes("/connected_accounts/")
  ? response(account())
  : response({ message: "do not expose this provider response body" }, 401));
const failed = await mod.composioExecute(env, { connected_account_id: "ca_test_123", tool_slug: "GMAIL_SEND_EMAIL", arguments: {} });
ok(!failed.ok && /HTTP 401/.test(failed.error) && !JSON.stringify(failed).includes("provider response body"), "provider errors expose status only, not response payloads", failed);

const sample = mod.composioAuditPayload("composio_execute", {
  connected_account_id: "ca_test_123",
  tool_slug: "GMAIL_SEND_EMAIL",
  arguments: args
}, { ok: true, result: { body: "secret payload" } });
ok(!JSON.stringify(sample).includes("ca_test_123") && !JSON.stringify(sample).includes("reader@example.test") && !JSON.stringify(sample).includes("payload must not be logged"), "audit metadata omits account IDs, argument values, and provider results", sample);
ok(sample.args.tool_slug === "GMAIL_SEND_EMAIL" && sample.args.argument_keys.includes("body") && sample.result.ok, "audit metadata retains only bounded action metadata", sample);

ok(/name: "composio_execute"/.test(src) && /name: "composio_status"/.test(src), "both tools are registered in the qnfo-ops tool catalog");
ok(/else if \(name === "composio_execute"\) res = await composioExecute\(env, args\)/.test(src) && /else if \(name === "composio_status"\) res = await composioStatus\(env, args\)/.test(src), "both registered tools reach their real handlers");
ok(/composioAuditPayload\(name, args, res\)/.test(src) && /logToolEvent\(env, name, audit\.args, audit\.result, ms\)/.test(src), "tool events use the metadata-only audit payload");
ok(/api\/v3\.1\/connected_accounts\/[\s\S]{0,300}AbortSignal\.timeout\(15000\)/.test(src) && /api\/v3\.1\/tools\/execute\/[\s\S]{0,400}AbortSignal\.timeout\(60000\)/.test(src), "account lookups and executions have bounded 15- and 60-second deadlines");
ok(/2\.61\.0 RM-COMPOSIO-BRIDGE-1/.test(src.slice(src.indexOf("var VERSION"))), "the VERSION history records the added capability");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
