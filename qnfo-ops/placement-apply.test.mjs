// FLEET-HARDENING-3 / PLACEMENT-DECLARED-APPLY-1 (qnfo-ops 2.48.0, agent_issues 2398), offline suite. No network.
// Proves, by running the worker's own installDeclaredBindings and cfWorkerDeploy against a recorded fetch (GitHub contents
// API for wrangler.toml, Cloudflare GET /bindings, GET /settings, PUT script):
//   - a wrangler.toml without [placement] uploads metadata with no `placement` key, byte for byte what 2.47.x uploaded, and the
//     ledger note is unchanged;
//   - [placement] mode = "smart" reaches the upload as `placement: { mode: "smart" }`, the ledger note says placement=applied,
//     and a refusal by Cloudflare is retried once without it;
//   - any other mode (or none, or an unquoted value) is ignored and noted, with no `placement` key in the upload.
// ADVERSARIAL: does not prove Cloudflare places the worker; the live proof is a deployment_history success row whose notes read
// "placement=applied" and GET /settings showing placement.mode "smart" for that worker.
// Run: node --no-warnings qnfo-ops/placement-apply.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(vm && (Number(vm[1]) > 2 || (Number(vm[1]) === 2 && Number(vm[2]) >= 48)), "VERSION is at least 2.48.0", vm && vm[0]);

const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); ok(i > 0 && j > i, "anchor found: " + a); return i > 0 && j > i ? src.slice(i, j) : ""; };
function harness(h) {
  const body = [
    'var CF_ACCOUNT_ID = "acct"; var VERSION = "9.9.9-test";',
    "function iso() { return '2026-10-13T10:00:00.000Z'; }",
    "var FLEET = [];",
    "async function probeService() { return {}; }",
    "async function cfWorkerRead() { return { ok: true, version: '1.0.0' }; }",
    "async function recordDeployLedger(env, row) { h.ledger.push(row); return { ok: true }; }",
    "function __name() {} function __name2() {} function __name22() {}",
    cut("function b64Utf8(", "// ---- UTF8-DEPLOY-1:END"),
    cut("var CF_RETRY_MAX = ", "\nasync function cfWorkerDeploy("),
    cut("var COMPAT_FLIPS = [", "\nvar OBS_KEYS = "),
    cut("var OBS_KEYS = ", "\n__name(installDeclaredBindings"),
    cut("async function cfWorkerDeploy(env, args) {", "\n__name(cfWorkerDeploy"),
    "return { cfWorkerDeploy, installDeclaredBindings, parseDeclaredPlacement };"
  ].join("\n");
  return new Function("h", "fetch", "setTimeout", body)(h, h.fetch, (fn) => { fn(); return 0; });
}
function cf(h) {
  h.raw = []; h.puts = []; h.ledger = [];
  h.fetch = async (url, init) => {
    const u = String(url);
    const J = (o, s) => ({ ok: (s || 200) < 300, status: s || 200, json: async () => o, text: async () => JSON.stringify(o), clone() { return this; }, headers: { get() { return null; } } });
    if (u.startsWith("https://api.github.com/")) return /\/contents\/w\/wrangler\.toml\?ref=main$/.test(u) ? J({ content: Buffer.from(h.toml, "utf8").toString("base64") }) : J({ message: "Not Found" }, 404);
    if (u.endsWith("/bindings")) return J({ result: JSON.parse(JSON.stringify(h.live || [])) });
    if (u.endsWith("/settings")) return J({ result: { compatibility_date: "2026-08-01", compatibility_flags: [], observability: { enabled: true, logs: { enabled: true, invocation_logs: true } } } });
    if (init && init.method === "PUT") {
      const m = /name="metadata"\r\nContent-Type: application\/json\r\n\r\n([\s\S]*?)\r\n--/.exec(String(init.body));
      h.raw.push(m[1]);
      const meta = JSON.parse(m[1]);
      h.puts.push(meta);
      if (h.refuse && h.refuse(meta)) return J({ success: false, errors: [{ code: 10000, message: "refused by test" }] }, 400);
      return J({ success: true, result: { id: "w", etag: "e" } });
    }
    throw new Error("unexpected fetch " + u);
  };
  return h;
}
const SRC = 'var VERSION = "1.0.1"; export default { fetch() { return new Response("ok"); } };';
async function deploy(h) {
  cf(h);
  return harness(h).cfWorkerDeploy({ CF_API_TOKEN: "t" }, { worker: "w", content: SRC, version: "1.0.1" });
}
const BASE = 'name = "w"\nmain = "worker.js"\ncompatibility_date = "2026-08-01"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "db"\ndatabase_id = "d1-id"\n';
const OBS = '\n[observability]\nenabled = true\n';
const SMART = '\n[placement]\nmode = "smart"\n';

// ---- pure: [placement]
{
  const P = harness(cf({ toml: "" })).parseDeclaredPlacement;
  ok(P(BASE + OBS) === null, "no [placement] -> null");
  ok(eq(P(BASE + SMART), { placement: { mode: "smart" }, note: "smart" }), "[placement] mode = \"smart\" -> { mode: smart }", P(BASE + SMART));
  ok(eq(P("[placement]\nmode = 'smart' # comment\n").placement, { mode: "smart" }), "a literal string and a comment");
  ok(eq(P('name = "w"\nplacement = { mode = "smart" }\n[vars]\nX = "1"\n').placement, { mode: "smart" }), "the top-level inline-table form");
  for (const bad of ['"off"', '"Smart"', '"targeted"', "smart", '""', "true", "1"]) {
    const r = P("[placement]\nmode = " + bad + "\n");
    ok(r && r.placement === null && /^ignored: mode=/.test(r.note), "an invalid mode is ignored and noted: " + bad, r);
  }
  const nm = P("[placement]\nregion = \"aws:us-east-1\"\n");
  ok(nm && nm.placement === null && nm.note === "ignored: mode=missing ignored_keys=region", "no mode is ignored and noted, other keys named", nm);
  ok(eq(P('[placement]\nmode = "smart"\nhint = "wnam"\n'), { placement: { mode: "smart" }, note: "smart ignored_keys=hint" }), "smart with another key: smart is sent, the other key only noted");
  ok(P('[vars]\nplacement = { mode = "smart" }\n') === null, "an inline placement key under another table is not the worker's");
  ok(P('[env.staging.placement]\nmode = "smart"\n') === null && P('[[placement]]\nmode = "smart"\n') === null, "only the top-level [placement] table is the worker's");
  ok(eq(P('[placement]\nmode = "smart"\n[vars]\nmode = "off"\n').placement, { mode: "smart" }), "a later table's keys are not read");
  ok(P("") === null && P(null) === null, "empty input -> null");
}

// ---- installer surfaces it
{
  const run = async (toml) => { const h = cf({ toml }); return harness(h).installDeclaredBindings({}, "w"); };
  ok((await run(BASE)).placement === null, "the installer surfaces placement: null without [placement]");
  ok(eq((await run(BASE + SMART)).placement, { placement: { mode: "smart" }, note: "smart" }), "the installer surfaces the declared placement");
}

// ---- cfWorkerDeploy
{
  // The exact metadata 2.47.x uploads for this fixture (captured from main before the change).
  const PINNED = '{"main_module":"worker.js","bindings":[{"type":"d1","name":"DB","id":"d1-id"}],"compatibility_date":"2026-08-01","observability":{"enabled":true,"logs":{"enabled":true,"invocation_logs":true}}}';
  let h = { toml: BASE + OBS, live: [] };
  let r = await deploy(h);
  ok(r.ok && h.raw.length === 1 && h.raw[0] === PINNED, "no [placement]: the upload metadata is byte-identical to 2.47.x", h.raw);
  ok(!("placement" in h.puts[0]) && r.placement === null && r.placement_apply === "none declared", "no [placement]: no placement key at all", r.placement_apply);
  ok(!/ placement=/.test(h.ledger[0].notes), "no [placement]: the ledger note is unchanged", h.ledger[0].notes);

  h = { toml: BASE + OBS + SMART, live: [] };
  r = await deploy(h);
  ok(r.ok && h.puts.length === 1 && eq(h.puts[0].placement, { mode: "smart" }), "[placement] mode = smart -> metadata placement { mode: smart }", h.puts[0]);
  ok(h.raw[0] === PINNED.replace('"invocation_logs":true}}}', '"invocation_logs":true}},"placement":{"mode":"smart"}}'), "only the placement key is added, after observability", h.raw[0]);
  ok(/ observability=applied placement=applied /.test(h.ledger[0].notes) && r.placement_apply === "applied" && eq(r.placement, { mode: "smart" }), "ledger note placement=applied", h.ledger[0].notes);

  h = { toml: BASE + OBS + '\n[placement]\nmode = "off"\n', live: [] };
  r = await deploy(h);
  ok(r.ok && h.raw[0] === PINNED && r.placement === null && r.placement_apply === "ignored: mode=off", "an invalid mode is ignored: metadata byte-identical, noted", [h.raw[0], r.placement_apply]);
  ok(/ placement=ignored: mode=off /.test(h.ledger[0].notes), "and the ledger notes it", h.ledger[0].notes);

  h = { toml: BASE + SMART + "\n[limits]\ncpu_ms = 50000\n", live: [] };
  r = await deploy(h);
  ok(r.ok && eq(h.puts[0].limits, { cpu_ms: 50000 }) && eq(h.puts[0].placement, { mode: "smart" }), "placement and limits travel together", h.puts[0]);

  h = { toml: BASE + SMART, live: [], refuse: (m) => !!m.placement };
  r = await deploy(h);
  ok(r.ok && h.puts.length === 2 && eq(h.puts[0].placement, { mode: "smart" }) && !("placement" in h.puts[1]) && r.placement === null && /^refused, deployed without it/.test(r.placement_apply), "a refusal is retried once without placement and the deploy succeeds", [h.puts.map((p) => p.placement), r.placement_apply]);
  ok(/ placement=refused, deployed without it/.test(h.ledger[0].notes) && h.ledger[0].status === "success", "and the ledger says so", h.ledger[0].notes);

  h = { toml: BASE + SMART, live: [], refuse: () => true };
  r = await deploy(h);
  ok(!r.ok && h.ledger.length === 1 && h.ledger[0].status === "failed", "a refusal of everything still fails and is recorded as failed", r);
}

// ---- wiring
ok(/_placementOut \? \{ placement: _placementOut \} : \{\}/.test(src), "the upload metadata carries placement only when declared smart");
const kl = src.indexOf("if (!resp.ok && _limitsOut) {"), kp = src.indexOf("if (!resp.ok && _placementOut) {"), kf = src.indexOf('status: "failed", notes: "cf_worker_deploy FAILED');
ok(kl > 0 && kp > kl && kf > kp, "the placement fallback runs after the limits fallback and before a failure is recorded");
ok(src.indexOf("FLEET-HARDENING-3") > 0 && src.indexOf("PLACEMENT-DECLARED-APPLY-1") > 0, "both closing-probe markers are in worker.js");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
