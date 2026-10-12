// COMPAT-DATE-DECLARED-APPLY-1 and COMPAT-EXPOSURE-1 (qnfo-ops 2.42.0), offline suite. No network.
// Proves, by running the worker's own cfWorkerDeploy with a recorded fetch: a wrangler.toml date reaches the upload only
// with the review line, a later date, a date not after the review or today, and a caller gate that allows it; every other
// case uploads exactly the live date, as before 2.42.0; a refusal by Cloudflare or an error in the gate falls back to the
// live date and the deploy still succeeds; the restore upload pins the previous date and is recorded as compat-restore.
// Also: the health gate, the verify-or-restore step, the exposure row, and that every wrangler.toml with a review line passes
// the risk scan (scripts/compat-risk-scan.mjs) or carries the opt-out flags.
// ADVERSARIAL: does not prove Cloudflare accepts a date or that a worker runs correctly under it; the live proof is a
// deployment_history row "compat_date=<old>-><new>", GET /settings and the worker's /health.
// Run: node qnfo-ops/compat-date-apply.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync, readdirSync, existsSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(vm && (Number(vm[1]) > 2 || (Number(vm[1]) === 2 && Number(vm[2]) >= 42)), "VERSION is at least 2.42.0", vm && vm[0]);

const a = src.indexOf("var COMPAT_FLIPS = ["), b = src.indexOf("\nvar OBS_KEYS = ", a);
const c = src.indexOf("async function cfWorkerDeploy(env, args) {"), d = src.indexOf("\n__name(cfWorkerDeploy", c);
const o1 = src.indexOf("var OBS_KEYS = "), o2 = src.indexOf("\nasync function installDeclaredBindings(", o1);
ok(a > 0 && b > a && c > 0 && d > c && o1 > 0 && o2 > o1, "the compat block and cfWorkerDeploy are found in worker.js");

// A harness around the worker's own source. Everything outside the slices is a stub the test controls.
function harness(h) {
  const body = [
    'var CF_ACCOUNT_ID = "acct"; var VERSION = "9.9.9-test"; var WORKER = "qnfo-ops";',
    "function iso() { return h.now || '2026-10-12T10:00:00.000Z'; }",
    "var FLEET = h.fleet || [];",
    "async function probeService(env, f, path) { return h.probe(f, path); }",
    "async function cfWorkerRead() { return { ok: true, version: h.liveVersion || '1.0.0' }; }",
    "async function recordDeployLedger(env, row) { h.ledger.push(row); return { ok: true }; }",
    "async function installDeclaredBindings(env, worker) { return { installed: 0, note: null, bindings: [], compat_flags: parseDeclaredCompat(h.toml).flags, observability: null, compat: h.noCompat ? null : parseDeclaredCompat(h.toml) }; }",
    src.slice(a, b),
    src.slice(o1, o2),
    src.slice(c, d),
    "return { cfWorkerDeploy, parseDeclaredCompat, decideCompatAdvance, compatFlipsBetween, compatExposureRow, compatHealthProbe, compatAdvanceGate, compatVerifyAfter, compatAfterDeploy, compatDateValid, COMPAT_FLIPS };"
  ].join("\n");
  return new Function("h", "fetch", "setTimeout", body)(h, h.fetch, (fn) => { fn(); return 0; });
}
// Cloudflare as the deploy sees it: GET /bindings, GET /settings, PUT script. `puts` records each upload's metadata.
function cf(h) {
  h.puts = [];
  h.ledger = [];
  h.fetch = async (url, init) => {
    const u = String(url);
    const J = (o, s) => ({ ok: (s || 200) < 300, status: s || 200, json: async () => o, text: async () => JSON.stringify(o), clone() { return this; } });
    if (u.endsWith("/bindings")) return J({ result: [{ type: "d1", name: "DB", id: "x" }] });
    if (u.endsWith("/settings")) return h.settingsFail ? J({}, 500) : J({ result: { compatibility_date: h.live, compatibility_flags: h.liveFlags || [] } });
    if (init && init.method === "PUT") {
      const m = /name="metadata"\r\nContent-Type: application\/json\r\n\r\n([\s\S]*?)\r\n--/.exec(String(init.body));
      const meta = JSON.parse(m[1]);
      h.puts.push(meta);
      if (h.refuseDate && meta.compatibility_date === h.refuseDate) return J({ errors: [{ code: 10021, message: "compatibility date not supported" }] }, 400);
      return J({ result: { id: "w", etag: "e" } });
    }
    if (h.http) return h.http(u);
    throw new Error("unexpected fetch " + u);
  };
  return h;
}
const SRC = 'var VERSION = "1.0.1"; export default { fetch() { return new Response("ok"); } };';
const toml = (date, extra) => 'name = "w"\nmain = "worker.js"\n' + (extra && extra.pre || "") + 'compatibility_date = "' + date + '"\n' + (extra && extra.flags ? "compatibility_flags = " + extra.flags + "\n" : "") + (extra && extra.post || "") + "\n[observability]\nenabled = true\n";
const MARK = "# compat-advance: reviewed 2026-10-12\n";
const allow = async () => ({ allow: true, reason: "test" });
async function deploy(h, args) {
  cf(h);
  const L = harness(h);
  const r = await L.cfWorkerDeploy({ CF_API_TOKEN: "t" }, Object.assign({ worker: "w", content: SRC, version: "1.0.1" }, args || {}));
  return r;
}

// ---- pure: parse
{
  const L = harness(cf({ toml: "" }));
  const P = L.parseDeclaredCompat;
  ok(eq(P(toml("2026-10-10", { pre: MARK, flags: '["nodejs_compat", "x"]' })), { date: "2026-10-10", flags: ["nodejs_compat", "x"], reviewed: "2026-10-12" }), "date, flags and review line are read");
  ok(P(toml("2026-10-10")).reviewed === null, "no review line -> reviewed null");
  ok(P('name = "w"\n[env.staging]\ncompatibility_date = "2026-10-10"\n').date === null, "a date under a table is not the worker's");
  ok(P('compatibility_date = "2026-13-45"\n').date === null && P('compatibility_date = "soon"\n').date === null, "an impossible date is not a date");
  ok(P(toml("2026-10-10", { pre: "# note: compat-advance: reviewed 2026-10-12\n" })).reviewed === null, "the review line must start its own comment line");
  ok(P(toml("2026-10-10", { pre: "# compat-advance: reviewed 2026-10-1\n" })).reviewed === null && P(toml("2026-10-10", { pre: "# compat-advance: reviewed 2026-10-123\n" })).reviewed === null, "a malformed review date is no review");
  ok(P(toml("2026-10-10", { pre: "#compat-advance:   reviewed   2026-10-12 nodejs default read\n" })).reviewed === "2026-10-12", "spacing and a trailing note are accepted");

  // ---- pure: decide, one branch each
  const D = L.decideCompatAdvance, T = "2026-10-12";
  const dcl = (date, reviewed) => ({ date, flags: [], reviewed: reviewed === undefined ? "2026-10-12" : reviewed });
  ok(D("2026-08-01", dcl("2026-10-10"), T).apply === true && D("2026-08-01", dcl("2026-10-10"), T).to === "2026-10-10" && D("2026-08-01", dcl("2026-10-10"), T).from === "2026-08-01", "reviewed later date applies");
  ok(D("2026-08-01", dcl("2026-10-10", null), T).apply === false && /no compat-advance review line/.test(D("2026-08-01", dcl("2026-10-10", null), T).reason), "no review line: not applied");
  ok(D("2026-09-01", dcl("2026-08-01"), T).apply === false && /never moved back/.test(D("2026-09-01", dcl("2026-08-01"), T).reason), "an earlier date is never applied");
  ok(D("2026-08-01", dcl("2026-08-01"), T).apply === false, "same date: nothing to do");
  ok(D("2026-08-01", dcl("2026-10-12", "2026-10-10"), T).apply === false && /after its review date/.test(D("2026-08-01", dcl("2026-10-12", "2026-10-10"), T).reason), "a date after its review is not applied");
  ok(D("2026-08-01", dcl("2026-11-01", "2026-11-02"), T).apply === false && /future/.test(D("2026-08-01", dcl("2026-11-01", "2026-11-02"), T).reason), "a future date is not applied");
  ok(D(null, dcl("2026-10-10"), T).apply === false && D("garbage", dcl("2026-10-10"), T).apply === false, "live date unread: not applied");
  ok(D("2026-08-01", null, T).apply === false && D("2026-08-01", { date: null, flags: [], reviewed: "2026-10-12" }, T).apply === false, "nothing declared: not applied");
  ok(D("2026-08-01", dcl("2026-10-10"), "not-a-date").apply === false, "an unreadable clock applies nothing");

  // ---- pure: default changes
  const F = L.compatFlipsBetween;
  ok(eq(F("2026-08-01", "2026-10-12").map((x) => x.flag), ["nodejs_compat", "durable_object_io_tasks_prevent_eviction"]), "2026-08-01 -> today crosses the nodejs default and the DO eviction default", F("2026-08-01", "2026-10-12"));
  ok(eq(F("2026-08-04", "2026-10-12").map((x) => x.flag), ["durable_object_io_tasks_prevent_eviction"]) && F("2026-08-03", "2026-08-04").length === 1, "the default's own date is inclusive at the top and exclusive at the bottom");
  ok(F("2026-10-01", "2026-10-12").length === 0 && F("x", "2026-10-12").length === 0, "nothing after the newest default; bad input yields none");
  ok(F("2026-03-24", "2026-10-12").some((x) => x.flag === "enhanced_error_serialization") && F("2026-03-24", "2026-10-12").some((x) => x.flag === "web_socket_auto_reply_to_close"), "an older date also crosses the RPC error and WebSocket close defaults");
  ok(L.COMPAT_FLIPS.every((x) => L.compatDateValid(x.date) && x.flag && x.off && x.needs && x.note) && eq(L.COMPAT_FLIPS.map((x) => x.date), L.COMPAT_FLIPS.map((x) => x.date).slice().sort()), "the table is well-formed and in date order");

  // ---- pure: exposure row
  const R = L.compatExposureRow;
  const r1 = R("w", { compatibility_date: "2026-08-01", compatibility_flags: [] }, P(toml("2026-08-01")), T);
  ok(r1.live_date === "2026-08-01" && r1.flips_count === 2 && r1.nodejs_compat_live === false && r1.nodejs_compat_default_on === false && r1.days_behind === 72 && /equals live/.test(r1.advance), "a worker at 2026-08-01 is two defaults behind", r1);
  const r2 = R("w", { compatibility_date: "2026-09-08", compatibility_flags: ["nodejs_compat"] }, P(toml("2026-10-10", { pre: MARK })), T);
  ok(r2.nodejs_compat_live === true && r2.nodejs_compat_default_on === true && r2.flips_count === 1 && r2.advance === "next deploy advances to 2026-10-10", "flag and pending advance are reported", r2);
  const r3 = R("w", { compatibility_date: "2026-10-10", compatibility_flags: ["no_nodejs_compat"] }, null, T);
  ok(r3.flips_count === 0 && r3.nodejs_compat_default_on === false && r3.toml_date === null, "a current worker is not behind; the opt-out is read", r3);
  ok(R("w", null, null, T).live_date === null && R("w", null, null, T).flips_count === 0, "unreadable settings yield no claim");
}

// ---- cfWorkerDeploy: what date the upload carries
{
  let h = { toml: toml("2026-10-10"), live: "2026-08-01" };
  let r = await deploy(h, { compat_gate: allow });
  ok(r.ok && h.puts.length === 1 && h.puts[0].compatibility_date === "2026-08-01" && r.compat.applied === false && r.compatibility_date === "2026-08-01", "a later date without the review line changes nothing", [h.puts, r.compat]);
  ok(/ compat_date=2026-08-01 /.test(h.ledger[0].notes) && h.ledger[0].action === "deploy", "the ledger row names the date sent", h.ledger[0]);

  h = { toml: toml("2026-10-10", { pre: MARK }), live: "2026-08-01" };
  r = await deploy(h, { compat_gate: allow });
  ok(r.ok && h.puts.length === 1 && h.puts[0].compatibility_date === "2026-10-10" && r.compat.applied === true && r.compat.from === "2026-08-01" && r.compat.to === "2026-10-10" && r.compatibility_date === "2026-10-10", "review line + later date + gate: the declared date is uploaded", [h.puts, r.compat]);
  ok(/ compat_date=2026-08-01->2026-10-10 reviewed=2026-10-12 /.test(h.ledger[0].notes) && h.ledger[0].status === "success", "deployment_history records old and new date", h.ledger[0]);
  ok(h.puts[0].bindings.length === 1 && h.puts[0].main_module === "worker.js", "the rest of the upload is unchanged");

  h = { toml: toml("2026-10-10", { pre: MARK }), live: "2026-08-01" };
  r = await deploy(h, {});
  ok(r.ok && h.puts[0].compatibility_date === "2026-08-01" && r.compat.applied === false && /does not verify \/health/.test(r.compat.reason), "without a gate (the cf_worker_deploy tool) the date is not advanced", r.compat);

  h = { toml: toml("2026-10-10", { pre: MARK }), live: "2026-08-01" };
  r = await deploy(h, { compat_gate: async () => ({ allow: false, reason: "health unreadable" }) });
  ok(r.ok && h.puts[0].compatibility_date === "2026-08-01" && /not advanced: health unreadable/.test(r.compat.reason), "a refusing gate keeps the live date", r.compat);

  h = { toml: toml("2026-10-10", { pre: MARK }), live: "2026-08-01" };
  r = await deploy(h, { compat_gate: async () => { throw new Error("boom"); } });
  ok(r.ok && h.puts.length === 1 && h.puts[0].compatibility_date === "2026-08-01" && r.compat.applied === false && /boom/.test(r.compat.reason), "a throwing gate keeps the live date and the deploy succeeds", r.compat);

  h = { toml: toml("2026-10-10", { pre: MARK }), live: "2026-08-01" };
  r = await deploy(h, { compat_gate: async () => "yes" });
  ok(r.ok && h.puts[0].compatibility_date === "2026-08-01", "a gate answer that is not { allow: true } does not advance");

  let called = 0;
  h = { toml: toml("2026-08-01", { pre: MARK }), live: "2026-09-01" };
  r = await deploy(h, { compat_gate: async () => { called++; return { allow: true }; } });
  ok(r.ok && h.puts[0].compatibility_date === "2026-09-01" && called === 0 && /never moved back/.test(r.compat.reason), "a reviewed EARLIER date never moves the live date back, and the gate is not even asked", r.compat);

  h = { toml: toml("2026-11-20", { pre: "# compat-advance: reviewed 2026-11-20\n" }), live: "2026-08-01" };
  r = await deploy(h, { compat_gate: allow });
  ok(r.ok && h.puts[0].compatibility_date === "2026-08-01" && /future/.test(r.compat.reason), "a future date is not uploaded");

  h = { toml: toml("2026-10-10", { pre: MARK }), live: "2026-08-01", settingsFail: true };
  r = await deploy(h, { compat_gate: allow });
  ok(r.ok && h.puts[0].compatibility_date === "2026-08-01" && r.compat.applied === false && r.compat.live_date === null && /live date not read/.test(r.compat.reason), "unreadable live settings: the pre-2.42.0 fallback date, no advance", r.compat);

  h = { toml: toml("2026-10-10", { pre: MARK }), live: "2026-08-01", noCompat: true };
  r = await deploy(h, { compat_gate: allow });
  ok(r.ok && h.puts[0].compatibility_date === "2026-08-01", "a wrangler.toml that could not be read changes nothing");

  // Cloudflare refuses the new date: one more upload with the live date, and the deploy succeeds
  h = { toml: toml("2026-10-10", { pre: MARK }), live: "2026-08-01", refuseDate: "2026-10-10" };
  r = await deploy(h, { compat_gate: allow });
  ok(r.ok && h.puts.length === 2 && h.puts[1].compatibility_date === "2026-08-01" && r.compat.applied === false && /refused with 2026-10-10/.test(r.compat.reason) && r.compatibility_date === "2026-08-01", "a refusal of the date falls back to the live date", [h.puts.map((p) => p.compatibility_date), r.compat]);
  ok(h.ledger.length === 1 && h.ledger[0].status === "success" && / compat_date=2026-08-01 /.test(h.ledger[0].notes), "the fallback is recorded as a deploy at the live date", h.ledger);

  // flags: declared flags are still added and live flags kept, with or without an advance
  h = { toml: toml("2026-10-10", { pre: MARK, flags: '["no_nodejs_compat", "no_nodejs_compat_v2"]' }), live: "2026-08-01", liveFlags: ["global_fetch_strictly_public"] };
  r = await deploy(h, { compat_gate: allow });
  ok(eq(h.puts[0].compatibility_flags, ["global_fetch_strictly_public", "no_nodejs_compat", "no_nodejs_compat_v2"]) && h.puts[0].compatibility_date === "2026-10-10", "hold-back flags travel with the advanced date; live flags are kept", h.puts[0]);

  // restore upload
  h = { toml: toml("2026-10-10", { pre: MARK }), live: "2026-10-10" };
  r = await deploy(h, { compat_pin: "2026-08-01", compat_restore_note: "to=2026-10-10 reviewed=2026-10-12 why=health answered http 500", compat_gate: allow });
  ok(r.ok && h.puts.length === 1 && h.puts[0].compatibility_date === "2026-08-01" && r.compat.restore === true && r.compat.applied === false, "the restore upload pins the previous date", [h.puts, r.compat]);
  ok(h.ledger[0].action === "compat-restore" && /to=2026-10-10 reviewed=2026-10-12/.test(h.ledger[0].notes) && /compat-restore from=2026-10-10/.test(h.ledger[0].notes), "and is recorded as compat-restore with the date it undid", h.ledger[0]);
  h = { toml: toml("2026-10-10", { pre: MARK }), live: "2026-08-01" };
  r = await deploy(h, { compat_pin: "tomorrow" });
  ok(r.ok && h.puts[0].compatibility_date === "2026-08-01" && r.compat.restore === false && h.ledger[0].action === "deploy", "an invalid restore date is ignored");
}

// ---- health probe, gate, verify, restore
{
  const mk = (h) => harness(cf(Object.assign({ toml: "" }, h)));
  const d1 = (rows) => ({ prepare(sql) { return { _sql: sql, bind() { const self = this; return { first: async () => rows.first ? rows.first(sql) : null, run: async () => { (rows.runs = rows.runs || []).push(sql); return {}; } }; } }; } });
  const dec = { apply: true, from: "2026-08-01", to: "2026-10-10", reviewed: "2026-10-12" };

  let L = mk({ fleet: [{ name: "w", binding: "W" }], probe: async () => ({ ok: true, http: 200, body: { version: "1.0.1" } }) });
  let env = { W: { fetch() {} } };
  let p = await L.compatHealthProbe(env, "w");
  ok(p.state === "answered" && p.version === "1.0.1" && p.via === "binding:W", "health through a service binding", p);
  ok((await L.compatAdvanceGate(env, "w", dec)).allow === true, "the gate allows when /health answers with a version");
  ok((await L.compatVerifyAfter(env, "w", "1.0.1", 3, 0)).ok === true && (await L.compatVerifyAfter(env, "w", "1.0.2", 3, 0)).ok === false, "verify needs the deployed VERSION exactly");

  L = mk({ fleet: [{ name: "w", binding: "W" }], probe: async () => ({ ok: false, http: 0, body: {}, error: "timeout" }) });
  p = await L.compatHealthProbe(env, "w");
  ok(p.state === "unknown", "no answer through the binding is unknown, not a verdict", p);
  ok((await L.compatAdvanceGate(env, "w", dec)).allow === false, "the gate refuses when /health cannot be read");

  L = mk({ fleet: [], probe: async () => { throw new Error("no binding"); } });
  p = await L.compatHealthProbe({}, "unbound");
  ok(p.state === "unknown" && /1042/.test(p.error), "a worker with no binding and no custom domain cannot be verified", p);
  const g0 = await L.compatAdvanceGate({}, "unbound", dec);
  ok(g0.allow === false && /cannot be read from qnfo-ops/.test(g0.reason), "so its date is not advanced", g0);

  // custom domain from the registry; a 1042 body is unknown
  let body = '{"ok":true,"version":"3.0.0"}';
  L = mk({ fleet: [], probe: async () => ({}), http: async () => ({ ok: true, status: 200, text: async () => body }) });
  env = { QNFO_AUDIT: d1({ first: (sql) => /service_registry/.test(sql) ? { base_url: "https://ideas.example.org/" } : null }) };
  p = await L.compatHealthProbe(env, "idea");
  ok(p.state === "answered" && p.version === "3.0.0" && p.via === "https://ideas.example.org", "health through a custom domain", p);
  body = "error code: 1042";
  ok((await L.compatHealthProbe(env, "idea")).state === "unknown", "an error 1042 answer is unknown");
  env = { QNFO_AUDIT: d1({ first: (sql) => /service_registry/.test(sql) ? { base_url: "https://idea.q08.workers.dev" } : null }) };
  ok((await L.compatHealthProbe(env, "idea")).via === "none", "a workers.dev registry URL is not tried");

  // a restore recorded for the same date and review stops the retry
  L = mk({ fleet: [{ name: "w", binding: "W" }], probe: async () => ({ ok: true, http: 200, body: { version: "1.0.1" } }) });
  env = { W: { fetch() {} }, QNFO_AUDIT: d1({ first: (sql) => /compat-restore/.test(sql) ? { id: 77 } : null }) };
  const g1 = await L.compatAdvanceGate(env, "w", dec);
  ok(g1.allow === false && /restored before \(deployment_history 77\)/.test(g1.reason), "an advance that was restored is not retried under the same review", g1);
  ok(/notes LIKE \?2/.test(src) && /"%to=" \+ dec\.to \+ " reviewed=" \+ dec\.reviewed \+ "%"/.test(src) && /compat_restore_note: "to=" \+ a\.compat\.to \+ " reviewed=" \+ a\.compat\.reviewed/.test(src), "the gate reads the same text the restore writes");
  env = { W: { fetch() {} }, QNFO_AUDIT: { prepare() { throw new Error("d1 down"); } } };
  ok((await L.compatAdvanceGate(env, "w", dec)).allow === false, "a gate error refuses");

  // after the deploy
  const arg = { worker: "w", content: SRC, version: "1.0.1", compat: { applied: true, from: "2026-08-01", to: "2026-10-10", reviewed: "2026-10-12" } };
  let calls = [], log = [];
  L = mk({ fleet: [{ name: "w", binding: "W" }], probe: async () => ({ ok: true, http: 200, body: { version: "1.0.1" } }) });
  let o = await L.compatAfterDeploy({ W: { fetch() {} } }, arg, log, { tries: 2, sleepMs: 0, deploy: async (e, x) => { calls.push(x); return { ok: true }; } });
  ok(o.kept === true && o.restored === false && calls.length === 0 && log[0].step === "compat-verify" && log[0].ok === true, "/health answers with the new VERSION: the date is kept", [o, log]);

  for (const [name, probe] of [["the old VERSION", async () => ({ ok: true, http: 200, body: { version: "1.0.0" } })], ["HTTP 500", async () => ({ ok: false, http: 500, body: {} })], ["no answer", async () => ({ ok: false, http: 0, body: {}, error: "timeout" })]]) {
    calls = []; log = [];
    L = mk({ fleet: [{ name: "w", binding: "W" }], probe });
    o = await L.compatAfterDeploy({ W: { fetch() {} } }, arg, log, { tries: 2, sleepMs: 0, deploy: async (e, x) => { calls.push(x); return { ok: true }; } });
    ok(o.kept === false && o.restored === true && calls.length === 1 && calls[0].compat_pin === "2026-08-01" && calls[0].content === SRC && /^to=2026-10-10 reviewed=2026-10-12 why=/.test(calls[0].compat_restore_note) && !calls[0].compat_gate, "/health gives " + name + ": the previous date is uploaded again", [o, calls]);
    ok(log.some((x) => x.step === "compat-restore" && x.ok === true && x.compatibility_date === "2026-08-01"), "and the restore is in the deploy log (" + name + ")", log);
  }

  // the restore itself fails: an issue is filed, nothing throws
  log = [];
  const db = { first: () => null };
  L = mk({ fleet: [{ name: "w", binding: "W" }], probe: async () => ({ ok: false, http: 500, body: {} }) });
  o = await L.compatAfterDeploy({ W: { fetch() {} }, QNFO_AUDIT: d1(db) }, arg, log, { tries: 1, sleepMs: 0, deploy: async () => ({ ok: false, error: "CF API 500" }) });
  ok(o.restored === false && /CF API 500/.test(o.restore_error) && (db.runs || []).some((s) => /INSERT INTO agent_issues/.test(s)), "a failed restore files COMPAT-RESTORE-FAILED-1", [o, db.runs]);
  o = await L.compatAfterDeploy({ W: { fetch() {} } }, arg, [], { tries: 1, sleepMs: 0, deploy: async () => { throw new Error("x"); } });
  ok(o.kept === false && o.restored === false && o.error === "x", "an error inside the step is returned, never thrown", o);

  // end to end with the real cfWorkerDeploy as the restore upload
  const h = cf({ toml: toml("2026-10-10", { pre: MARK }), live: "2026-10-10", fleet: [{ name: "w", binding: "W" }], probe: async () => ({ ok: true, http: 200, body: { version: "0.9.0" } }) });
  L = harness(h);
  o = await L.compatAfterDeploy({ CF_API_TOKEN: "t", W: { fetch() {} } }, arg, [], { tries: 1, sleepMs: 0 });
  ok(o.restored === true && h.puts.length === 1 && h.puts[0].compatibility_date === "2026-08-01" && h.ledger[0].action === "compat-restore", "the real restore upload sends the previous date", [o, h.puts, h.ledger]);
}

// ---- wiring in worker.js
ok(/try \{ out\.compat = parseDeclaredCompat\(toml\); \} catch \(_ec\) \{ out\.compat = null; \}/.test(src), "the installer surfaces the declared date");
ok(/compat_gate: function\(_dec\) \{ return toVer \|\| srcVer \? compatAdvanceGate\(env, worker, _dec\) : \{ allow: false/.test(src), "/ops/deploy passes the health gate, and no gate without a VERSION");
ok((src.match(/compat_gate:/g) || []).length === 1, "only /ops/deploy passes a gate");
const k1 = src.indexOf("if (dep.compat && dep.compat.applied) {"), k0 = src.indexOf('log.push({ step: "verify", live_version: live });'), k2 = src.indexOf("// DEPLOY-GUARD-LEDGER-SYNC-1 (2026-09-26)");
ok(k0 > 0 && k1 > k0 && k2 > k1, "the verify-or-restore step runs after the live-version verification and before the guard ledger");
const kc = src.indexOf("if (!resp.ok && _compat.applied) {"), ko = src.indexOf("if (!resp.ok && _obsOut) {"), kf = src.indexOf('status: "failed", notes: "cf_worker_deploy FAILED');
ok(kc > 0 && kc < ko && ko < kf, "the date fallback runs before the observability fallback and before a failure is recorded");
ok(/if \(path === "\/compat" && method === "GET"\) return json\(await compatReport\(env\)\);/.test(src) && /"\/compat", "\/compat\/refresh"/.test(src), "GET /compat is routed and listed");
ok(/if \(path === "\/compat\/refresh" && method === "POST"\) \{\s+if \(!await regAuthOk\(/.test(src), "the refresh that spends subrequests takes the registry token");
ok(/const _cs = await compatSnapshot\(env\);/.test(src), "the cron refreshes the snapshot");
ok(/if \(batch\.length \* 2 >= names\.length\) \{/.test(src), "a snapshot that read under half the fleet is not written");

// ---- the repository's own wrangler.toml files
{
  const L = harness(cf({ toml: "" }));
  const root = new URL("../", import.meta.url);
  const { scan } = await import("../scripts/compat-risk-scan.mjs");
  let seen = 0;
  const marked = [];
  for (const dd of readdirSync(root, { withFileTypes: true })) {
    if (!dd.isDirectory()) continue;
    const t = new URL(dd.name + "/wrangler.toml", root);
    if (!existsSync(t) || !existsSync(new URL(dd.name + "/worker.js", root))) continue;
    if (existsSync(new URL(dd.name + "/RETIRED", root)) || existsSync(new URL(dd.name + "/FOLDED", root))) continue;
    const p = L.parseDeclaredCompat(readFileSync(t, "utf8"));
    seen++;
    ok(!!p.date, dd.name + "/wrangler.toml declares a readable compatibility_date", p);
    if (p.reviewed) {
      marked.push(dd.name);
      ok(p.date <= p.reviewed, dd.name + ": the declared date is not after its review", p);
      // A review line is only as good as the scan behind it: the worker is clean for the 2026-08-04 default, already sets
      // nodejs_compat, or carries both opt-out flags.
      const sc = scan(readFileSync(new URL(dd.name + "/worker.js", root), "utf8"), readFileSync(t, "utf8"));
      const held = p.flags.includes("no_nodejs_compat") && p.flags.includes("no_nodejs_compat_v2");
      ok(sc.verdict === "clean" || held, dd.name + ": reviewed for an advance, so the risk scan is clean or the opt-out flags are set", sc.risks);
    }
  }
  ok(seen >= 20, "the live worker directories were read", seen);
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
