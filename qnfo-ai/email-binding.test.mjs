// EMAIL-BINDING-RESTORE-1 offline suite (human_actions 108, owner task op-mveqjo370c53). Run: node --no-warnings qnfo-ai/email-binding.test.mjs
// Proves: wrangler.toml declares the EMAIL service binding to qnfo-email with props caller qnfo-ai; callGatewayService calls through the
// binding with no EMAIL_API_KEY (props authenticates), still sends a configured key, reports a missing binding, and keeps the key
// requirement for the routes that do not take props (social, intent).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
function ok(c, m, d) { if (c) passed++; else { failed++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } }

const toml = readFileSync(join(here, "wrangler.toml"), "utf8");
const blocks = toml.split("[[services]]").slice(1).map((b) => b.split(/\n\[/)[0]);
const emailBlock = blocks.find((b) => /binding\s*=\s*"EMAIL"/.test(b)) || "";
ok(/service\s*=\s*"qnfo-email"/.test(emailBlock), "EMAIL binds the qnfo-email worker");
ok(/environment\s*=\s*"production"/.test(emailBlock), "EMAIL binds the production environment like every other fleet binding");
ok(/props\s*=\s*\{\s*caller\s*=\s*"qnfo-ai"\s*\}/.test(emailBlock), "EMAIL declares props caller qnfo-ai (CLAUDE.md internal calls)");
ok(!/EMAIL_API_KEY\s*=/.test(toml), "no key value is committed");

const src = readFileSync(join(here, "worker.js"), "utf8");
const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(vm && (Number(vm[1]) > 5 || (Number(vm[1]) === 5 && (Number(vm[2]) > 37 || (Number(vm[2]) === 37 && Number(vm[3]) >= 1)))), "VERSION is at least 5.37.1", vm && vm[0]);
const gs = src.indexOf("var GATEWAY_SERVICES = {");
const ge = src.indexOf("function wantsAgentTools(", gs);
ok(gs > 0 && ge > gs, "GATEWAY_SERVICES and callGatewayService found");
const names = "var __name = (f) => f, __name2 = __name, __name22 = __name, __name222 = __name;\n";
const make = new Function(names + src.slice(gs, ge) + "\nreturn { GATEWAY_SERVICES, callGatewayService };");
const { GATEWAY_SERVICES, callGatewayService } = make();

ok(GATEWAY_SERVICES.email.props === true && GATEWAY_SERVICES.email.internal === "EMAIL", "email takes props auth through the EMAIL binding");
ok(!GATEWAY_SERVICES.social.props && !GATEWAY_SERVICES.intent.props, "social and intent keep the key requirement");

function binding(status = 200, payload = { ok: true }) {
  const calls = [];
  return { calls, async fetch(url, init) { calls.push({ url, init }); return new Response(JSON.stringify(payload), { status }); } };
}

// 1. binding present, no key: the call goes through the binding without a bearer
let b = binding(200, { total: 7 });
let r = await callGatewayService({ EMAIL: b }, "email", "/stats");
ok(r.ok === true && r.status === 200 && r.data.total === 7, "no EMAIL_API_KEY: the stats call succeeds through the binding", r);
ok(b.calls.length === 1 && b.calls[0].url === "https://qnfo-email.internal/stats", "the request targets the internal qnfo-email host", b.calls[0] && b.calls[0].url);
ok(b.calls[0] && !("Authorization" in b.calls[0].init.headers), "no bearer is sent when there is no key");

// 2. binding and key: the key is still sent
b = binding();
r = await callGatewayService({ EMAIL: b, EMAIL_API_KEY: "k-test" }, "email", "/emails/recent?limit=3");
ok(r.ok === true && b.calls[0].init.headers.Authorization === "Bearer k-test", "a configured key is still sent as the bearer");

// 3. POST body passes through
b = binding();
r = await callGatewayService({ EMAIL: b }, "email", "/send", { method: "POST", body: { to: "a@example.org", subject: "s", body: "b" } });
ok(b.calls[0].init.method === "POST" && JSON.parse(b.calls[0].init.body).subject === "s", "email_send posts its payload through the binding");

// 4. no binding, no key: not configured, nothing is called
r = await callGatewayService({}, "email", "/stats");
ok(r.ok === false && r.notConfigured === true && /EMAIL_API_KEY/.test(r.error), "neither binding nor key: service not configured", r);

// 5. key but no binding: the missing binding is named
r = await callGatewayService({ EMAIL_API_KEY: "k" }, "email", "/stats");
ok(r.ok === false && /service binding missing: EMAIL/.test(r.error), "a key without the binding names the missing binding", r);

// 6. an upstream refusal is reported, not swallowed
b = binding(401, { error: "unauthorized" });
r = await callGatewayService({ EMAIL: b }, "email", "/stats");
ok(r.ok === false && r.status === 401, "a 401 from qnfo-email is returned as not ok", r);

// 7. social and intent still need their key even with the binding present
for (const [svc, bind] of [["social", "SOCIAL"], ["intent", "QNFO_INTENT"]]) {
  b = binding();
  r = await callGatewayService({ [bind]: b }, svc, "/x");
  ok(r.ok === false && r.notConfigured === true && b.calls.length === 0, svc + " without its key is not configured and calls nothing", r);
}

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
