// LIMITS-DECLARED-APPLY-1 + SEND-EMAIL-SENDER-RESTRICT-1 (qnfo-ops 2.45.0, agent_issues 2420 and 2421), offline suite. No network.
// Proves, by running the worker's own installDeclaredBindings and cfWorkerDeploy against a recorded fetch (GitHub contents
// API for wrangler.toml, Cloudflare GET /bindings, GET /settings, PUT script):
//   - a wrangler.toml without [limits] uploads metadata with no `limits` key, byte for byte what 2.44.1 uploaded;
//   - [limits] cpu_ms / subrequests reach the upload as `limits` (only the declared keys, positive integers only), the ledger
//     note says limits=applied, and a refusal by Cloudflare is retried once without them;
//   - a [[send_email]] block without restrictions installs exactly { type, name }; one with destination_address,
//     allowed_destination_addresses or allowed_sender_addresses carries them, on a new binding and on a live one (only the
//     declared keys; a live restriction the file does not name is kept; a refusal restores the live binding);
//   - the observability fallback now really drops the block (the metadata object is built fresh per attempt).
// ADVERSARIAL: does not prove Cloudflare accepts the fields; the live proof is a deployment_history success row whose notes
// read "limits=applied" or "send_email_restrict=applied:1", and GET /settings (limits) or GET /bindings (send_email) showing
// the declared values.
// Run: node --no-warnings qnfo-ops/deploy-limits-sender.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(vm && (Number(vm[1]) > 2 || (Number(vm[1]) === 2 && Number(vm[2]) >= 45)), "VERSION is at least 2.45.0", vm && vm[0]);

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
    "return { cfWorkerDeploy, installDeclaredBindings, parseDeclaredLimits, sendEmailRestrictions };"
  ].join("\n");
  return new Function("h", "fetch", "setTimeout", body)(h, h.fetch, (fn) => { fn(); return 0; });
}
// GitHub serves h.toml for worker "w"; Cloudflare serves h.live bindings and settings; each PUT's raw metadata is recorded.
// h.refuse(meta) returning true answers that PUT with a definite 400 refusal (code 10000, not retried by cfFetchRetry).
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
  const L = harness(h);
  return L.cfWorkerDeploy({ CF_API_TOKEN: "t" }, { worker: "w", content: SRC, version: "1.0.1" });
}
const BASE = 'name = "w"\nmain = "worker.js"\ncompatibility_date = "2026-08-01"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "db"\ndatabase_id = "d1-id"\n\n[[send_email]]\nname = "SEND_EMAIL"\n';
const OBS = '\n[observability]\nenabled = true\n';

// ---- pure: [limits]
{
  const P = harness(cf({ toml: "" })).parseDeclaredLimits;
  ok(P(BASE + OBS) === null, "no [limits] -> null");
  ok(eq(P(BASE + "\n[limits]\ncpu_ms = 50000\n"), { cpu_ms: 50000 }), "cpu_ms read");
  ok(eq(P("[limits]\ncpu_ms = 300_000 # five minutes\nsubrequests = +150\n"), { cpu_ms: 300000, subrequests: 150 }), "TOML underscores, a plus sign and a comment");
  ok(eq(P("[limits]\nsubrequests = 50\n"), { subrequests: 50 }), "subrequests alone, only the declared key");
  for (const bad of ["50000.5", "5e4", '"50000"', "0", "-1", "0x10", "050", "1__0", "_10", "10_", "true", "[1]", "{ x = 1 }"]) {
    ok(P("[limits]\ncpu_ms = " + bad + "\n") === null, "a non-integer or non-positive value is ignored: " + bad);
  }
  ok(eq(P("[limits]\ncpu_ms = 1.5\nsubrequests = 20\n"), { subrequests: 20 }), "a bad key does not take a good one with it");
  ok(P("[limits]\nwall_ms = 10\nmemory = 128\n") === null, "keys other than cpu_ms and subrequests are ignored");
  ok(P("[env.staging.limits]\ncpu_ms = 10\n") === null && P("[[limits]]\ncpu_ms = 10\n") === null && P("[vars]\ncpu_ms = 10\n") === null, "only the top-level [limits] table is the worker's");
  ok(eq(P('name = "w"\nlimits = { cpu_ms = 1_000, subrequests = 10 }\n[vars]\nX = "1"\n'), { cpu_ms: 1000, subrequests: 10 }), "the top-level inline-table form");
  ok(P('[vars]\nlimits = { cpu_ms = 1000 }\n') === null, "an inline limits key under another table is not the worker's");
  ok(eq(P("[limits]\ncpu_ms = 10\n[observability]\ncpu_ms = 99\n"), { cpu_ms: 10 }), "a later table's keys are not read");
  ok(P("") === null && P(null) === null, "empty input -> null");
}

// ---- pure: send_email restrictions
{
  const S = harness(cf({ toml: "" })).sendEmailRestrictions;
  ok(eq(S({ binding: "SEND_EMAIL", name: "SEND_EMAIL" }), {}), "no restriction keys -> {}");
  ok(eq(S({ name: "X", allowed_sender_addresses: '["a@qnfo.org", "b@qnfo.org"]' }), { allowed_sender_addresses: ["a@qnfo.org", "b@qnfo.org"] }), "allowed_sender_addresses");
  ok(eq(S({ name: "X", allowed_destination_addresses: '["o@outlook.com"]', destination_address: "ops@qnfo.org" }), { destination_address: "ops@qnfo.org", allowed_destination_addresses: ["o@outlook.com"] }), "destination_address and allowed_destination_addresses");
  ok(eq(S({ allowed_sender_addresses: "[]" }), {}) && eq(S({ allowed_sender_addresses: "[" }), {}), "an empty or multi-line array is dropped (never an allowlist of nothing)");
  ok(eq(S({ allowed_sender_addresses: '["a@qnfo.org", "not-an-address"]' }), {}), "an array with a malformed item is dropped whole");
  ok(eq(S({ destination_address: "nobody" }), {}) && eq(S({ destination_address: '["a@b.c"]' }), {}), "a malformed destination_address is dropped");
  ok(eq(S(null), {}), "no map -> {}");
}

// ---- installer: exactly the object it built before, or the declared restrictions
{
  const run = async (toml) => { const h = cf({ toml }); return (await harness(h).installDeclaredBindings({}, "w")); };
  let ins = await run(BASE);
  const se = ins.bindings.find((b) => b.type === "send_email");
  ok(JSON.stringify(se) === '{"type":"send_email","name":"SEND_EMAIL"}', "a block without restrictions installs exactly { type, name }", se);
  ok(ins.limits === null, "the installer surfaces limits: null without [limits]");
  ins = await run(BASE.replace('name = "SEND_EMAIL"\n', 'name = "SEND_EMAIL"\nallowed_sender_addresses = ["alerts@qnfo.org", "rowan.quni@qnfo.org"]\n') + "\n[limits]\ncpu_ms = 50000\n");
  ok(JSON.stringify(ins.bindings.find((b) => b.type === "send_email")) === '{"type":"send_email","name":"SEND_EMAIL","allowed_sender_addresses":["alerts@qnfo.org","rowan.quni@qnfo.org"]}', "a block with allowed_sender_addresses carries it", ins.bindings);
  ok(eq(ins.limits, { cpu_ms: 50000 }), "the installer surfaces the declared limits", ins.limits);
  const cloud = readFileSync(new URL("../qnfo-cloud-ops/wrangler.toml", import.meta.url), "utf8");
  ins = await run(cloud);
  ok(eq(ins.bindings.find((b) => b.type === "send_email"), { type: "send_email", name: "SEND_EMAIL", allowed_sender_addresses: ["alerts@qnfo.org", "rowan.quni@qnfo.org"] }), "qnfo-cloud-ops/wrangler.toml yields its two sender addresses", ins.bindings.filter((b) => b.type === "send_email"));
}

// ---- cfWorkerDeploy: limits
{
  // The exact metadata 2.44.1 uploaded for this fixture (captured from main before the change).
  const PINNED = '{"main_module":"worker.js","bindings":[{"type":"d1","name":"DB","id":"d1-id"},{"type":"send_email","name":"SEND_EMAIL"}],"compatibility_date":"2026-08-01","observability":{"enabled":true,"logs":{"enabled":true,"invocation_logs":true}}}';
  let h = { toml: BASE + OBS, live: [] };
  let r = await deploy(h);
  ok(r.ok && h.raw.length === 1 && h.raw[0] === PINNED, "no [limits]: the upload metadata is byte-identical to 2.44.1", h.raw);
  ok(!("limits" in h.puts[0]) && r.limits === null && r.limits_apply === "none declared", "no [limits]: no limits key at all");
  ok(!/ limits=/.test(h.ledger[0].notes) && !/send_email_restrict/.test(h.ledger[0].notes), "no [limits]: the ledger note is unchanged", h.ledger[0].notes);

  h = { toml: BASE + OBS + "\n[limits]\ncpu_ms = 50000\n", live: [] };
  r = await deploy(h);
  ok(r.ok && h.puts.length === 1 && eq(h.puts[0].limits, { cpu_ms: 50000 }), "[limits] cpu_ms = 50000 -> limits.cpu_ms 50000", h.puts[0]);
  ok(h.raw[0] === PINNED.replace('"invocation_logs":true}}}', '"invocation_logs":true}},"limits":{"cpu_ms":50000}}'), "only the limits key is added, after observability", h.raw[0]);
  ok(/ observability=applied limits=applied /.test(h.ledger[0].notes) && r.limits_apply === "applied", "ledger note limits=applied", h.ledger[0].notes);

  h = { toml: BASE + "\n[limits]\ncpu_ms = 300_000\nsubrequests = 150\n", live: [] };
  r = await deploy(h);
  ok(r.ok && eq(h.puts[0].limits, { cpu_ms: 300000, subrequests: 150 }), "cpu_ms and subrequests both reach the upload", h.puts[0].limits);

  h = { toml: BASE + "\n[limits]\ncpu_ms = 50000.5\n", live: [] };
  r = await deploy(h);
  ok(r.ok && !("limits" in h.puts[0]) && !/ limits=/.test(h.ledger[0].notes), "a non-integer is ignored: no limits key", h.puts[0]);

  h = { toml: BASE + "\n[limits]\ncpu_ms = 900000\n", live: [], refuse: (m) => !!m.limits };
  r = await deploy(h);
  ok(r.ok && h.puts.length === 2 && eq(h.puts[0].limits, { cpu_ms: 900000 }) && !("limits" in h.puts[1]) && r.limits === null && /^refused, deployed without it/.test(r.limits_apply), "a refusal is retried once without limits and the deploy succeeds", [h.puts.map((p) => p.limits), r.limits_apply]);
  ok(/ limits=refused, deployed without it/.test(h.ledger[0].notes) && h.ledger[0].status === "success", "and the ledger says so", h.ledger[0].notes);

  h = { toml: BASE + "\n[limits]\ncpu_ms = 1000\n", live: [], refuse: () => true };
  r = await deploy(h);
  ok(!r.ok && h.ledger.length === 1 && h.ledger[0].status === "failed", "a refusal of everything still fails and is recorded as failed", r);
}

// ---- cfWorkerDeploy: send_email
{
  const SE = (extra) => Object.assign({ name: "SEND_EMAIL", type: "send_email" }, extra || {});
  const D1 = { name: "DB", type: "d1", id: "d1-id" };
  const SENDERS = ["alerts@qnfo.org", "rowan.quni@qnfo.org"];
  const restricted = BASE.replace('name = "SEND_EMAIL"\n', 'name = "SEND_EMAIL"\nallowed_sender_addresses = ["alerts@qnfo.org", "rowan.quni@qnfo.org"]\n');

  // live binding without a restriction (qnfo-cloud-ops as read 2026-10-13) + a file that declares none: unchanged
  let h = { toml: BASE, live: [D1, SE()] };
  let r = await deploy(h);
  ok(r.ok && JSON.stringify(h.puts[0].bindings[1]) === '{"name":"SEND_EMAIL","type":"send_email"}' && r.send_email_restrict_applied === 0, "no restriction declared: the live binding goes out as read", h.puts[0].bindings);

  // live binding without a restriction + a file that declares allowed_sender_addresses: applied
  h = { toml: restricted, live: [D1, SE()] };
  r = await deploy(h);
  ok(r.ok && eq(h.puts[0].bindings[1], SE({ allowed_sender_addresses: SENDERS })) && r.send_email_restrict_applied === 1, "a declared allowed_sender_addresses reaches the live binding", h.puts[0].bindings);
  ok(/ send_email_restrict=applied:1 /.test(h.ledger[0].notes), "ledger note send_email_restrict=applied:1", h.ledger[0].notes);

  // the same restriction already live (qnfo-fleet-dashboard's allowed_destination_addresses): nothing changes
  const dashToml = BASE.replace('name = "SEND_EMAIL"\n', 'name = "SEND_EMAIL"\nallowed_destination_addresses = ["rwnquni@outlook.com"]\n');
  const dashLive = [D1, SE({ allowed_destination_addresses: ["rwnquni@outlook.com"] })];
  h = { toml: dashToml, live: dashLive };
  r = await deploy(h);
  ok(r.ok && JSON.stringify(h.puts[0].bindings) === JSON.stringify(dashLive) && r.send_email_restrict_applied === 0 && !/send_email_restrict/.test(h.ledger[0].notes), "a restriction already live is not counted or changed", h.puts[0].bindings);

  // a live restriction the file does not name is kept: a deploy never loosens one
  h = { toml: BASE, live: dashLive };
  r = await deploy(h);
  ok(r.ok && eq(h.puts[0].bindings[1].allowed_destination_addresses, ["rwnquni@outlook.com"]), "an undeclared live restriction is kept", h.puts[0].bindings);
  h = { toml: restricted, live: dashLive };
  r = await deploy(h);
  ok(r.ok && eq(h.puts[0].bindings[1], SE({ allowed_destination_addresses: ["rwnquni@outlook.com"], allowed_sender_addresses: SENDERS })), "a declared key is added beside a live one", h.puts[0].bindings);

  // nothing live: the declared binding is installed with its restriction
  h = { toml: restricted, live: [] };
  r = await deploy(h);
  ok(r.ok && JSON.stringify(h.puts[0].bindings[1]) === '{"type":"send_email","name":"SEND_EMAIL","allowed_sender_addresses":["alerts@qnfo.org","rowan.quni@qnfo.org"]}' && r.bindings_installed === 2, "a first install carries the declared restriction", h.puts[0].bindings);

  // Cloudflare refuses the restriction on a live binding: the binding goes back exactly as read and the deploy succeeds
  h = { toml: restricted, live: [D1, SE()], refuse: (m) => m.bindings.some((b) => b.allowed_sender_addresses) };
  r = await deploy(h);
  ok(r.ok && h.puts.length === 2 && JSON.stringify(h.puts[1].bindings[1]) === '{"name":"SEND_EMAIL","type":"send_email"}' && r.send_email_restrict_applied === 0 && /^refused, deployed with the live binding/.test(r.send_email_restrict_note), "a refusal restores the live binding and deploys", [h.puts.map((p) => p.bindings[1]), r.send_email_restrict_note]);
  ok(/ send_email_restrict=refused, deployed with the live binding/.test(h.ledger[0].notes), "and the ledger says so", h.ledger[0].notes);
}

// ---- the observability fallback really drops the block now (metadata built fresh per attempt)
{
  const h = { toml: BASE + OBS, live: [], refuse: (m) => !!m.observability };
  const r = await deploy(h);
  ok(r.ok && h.puts.length === 2 && !!h.puts[0].observability && !("observability" in h.puts[1]) && /^refused, deployed without it/.test(r.observability_apply), "a refused observability block is not re-sent on the retry", h.puts.map((p) => Object.keys(p)));
}

// ---- wiring
ok(/Object\.assign\(\{\}, _mp, \{ bindings: bindingsOut \}/.test(src) && !/Object\.assign\(_mp,/.test(src), "the metadata object is built fresh, _mp is never mutated");
ok(/_limitsOut \? \{ limits: _limitsOut \} : \{\}/.test(src), "the upload metadata carries limits only when declared");
const ko = src.indexOf("if (!resp.ok && _obsOut) {"), kl = src.indexOf("if (!resp.ok && _limitsOut) {"), ks = src.indexOf("if (!resp.ok && _sendEmailBefore.length) {"), kf = src.indexOf('status: "failed", notes: "cf_worker_deploy FAILED');
ok(ko > 0 && kl > ko && ks > kl && kf > ks, "the limits and send_email fallbacks run after the observability fallback and before a failure is recorded");
ok(src.indexOf("LIMITS-DECLARED-APPLY-1") > 0 && src.indexOf("SEND-EMAIL-SENDER-RESTRICT-1") > 0, "both closing-probe markers are in worker.js");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
