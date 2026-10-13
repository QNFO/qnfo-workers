// COMPAT-VERIFY-RUNNER-1 (qnfo-ops 2.46.0, agent_issues 2411), offline suite. No network.
// Runs the worker's own opsDeploy, cfWorkerDeploy, compat gate and opsCompatVerify against a recorded Cloudflare, GitHub,
// deploy-guard and D1 (deployment_history rows are kept, so the pending row the deploy writes is the one the verify reads).
// Proves: a request without compat_verify behaves as before (a /health qnfo-ops cannot read refuses the advance, one upload at
// the live date); compat_verify "caller" advances such a date, answers compat.pending_verify with previous_date, new_date,
// expected_version and source_sha, writes the ledger note compat_date=<old>-><new> pending_verify and runs no in-account
// verify; every other precondition still refuses; POST /ops/compat-verify ok false uploads the deployed source again with the
// previous date under the deploy and secret locks (deployment_history compat-restore, which stops the next advance under the
// same review); ok true records compat-verify and uploads nothing; a settled advance, a wrong or missing input, a moved live
// date, a held lock and an unfetchable source upload nothing.
// ADVERSARIAL: does not prove Cloudflare accepts a date or that the GitHub runner reaches /health; the live proof is the
// deployment_history pair "compat_date=<old>-><new> ... pending_verify" then compat-verify or compat-restore, and GET /compat.
// Run: node qnfo-ops/compat-verify-runner.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 1500) : "")); } };

const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(vm && (Number(vm[1]) > 2 || (Number(vm[1]) === 2 && Number(vm[2]) >= 46)), "VERSION is at least 2.46.0", vm && vm[0]);
ok(src.indexOf("COMPAT-VERIFY-RUNNER-1") > 0, "the closing-probe token is in worker.js");
ok(src === mirror, "deployed-current.worker.js is identical to worker.js");

const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); ok(i > 0 && j > i, "anchor found: " + a); return i > 0 && j > i ? src.slice(i, j) : ""; };
const parts = [
  cut("function b64Utf8(b64) {", "// ---- UTF8-DEPLOY-1:END"),
  cut("async function recordDeployLedger(env, row) {", "\n// CF-API-RETRY-1 (2.43.1"),
  cut("var CF_RETRY_MAX = ", "\nasync function cfWorkerDeploy("),
  cut("var COMPAT_FLIPS = [", "\nvar OBS_KEYS = "),
  cut("var OBS_KEYS = ", "\nasync function installDeclaredBindings("),
  cut("async function cfWorkerDeploy(env, args) {", "\n__name(cfWorkerDeploy"),
  cut("async function opsDeploy(env, args) {", "\n__name(opsDeploy")
];

function harness(h) {
  const body = [
    'var CF_ACCOUNT_ID = "acct"; var VERSION = "9.9.9-test"; var WORKER = "qnfo-ops";',
    "function iso() { return h.now || '2026-10-13T08:00:00.000Z'; }",
    "var FLEET = h.fleet || [];",
    "async function probeService(env, f, path) { h.probes++; return h.probe ? h.probe(f, path) : { http: 0, body: {}, error: 'no answer' }; }",
    "async function cfWorkerRead() { return { ok: true, version: h.liveVersion || '1.0.1', version_known: true }; }",
    "async function installDeclaredBindings(env, worker) { return { installed: 0, note: null, bindings: [], compat_flags: parseDeclaredCompat(h.toml).flags, observability: null, compat: parseDeclaredCompat(h.toml) }; }",
    "function tomlDeclaredCrons() { return []; }",
    "function randId(p) { h.ids++; return p + h.ids; }",
    "function __name() {}",
    ...parts,
    "return { opsDeploy, opsCompatVerify, cfWorkerDeploy, compatAdvanceGate, compatPendingParse };"
  ].join("\n");
  return new Function("h", "fetch", "setTimeout", body)(h, (u, i) => h.fetch(u, i), (fn) => { fn(); return 0; });
}

const SHA = "a".repeat(40);
const SRC = 'var VERSION = "1.0.1"; export default { fetch() { return new Response("ok"); } };';
const MARK = "# compat-advance: reviewed 2026-10-12\n";
const TOML = 'name = "w"\nmain = "worker.js"\n' + MARK + 'compatibility_date = "2026-10-10"\n';
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const R = (o, s) => ({ ok: (s || 200) < 300, status: s || 200, json: async () => o, text: async () => JSON.stringify(o), clone() { return this; } });
const likeRe = (p) => new RegExp("^" + String(p).split("").map((ch) => ch === "%" ? "[\\s\\S]*" : ch === "_" ? "." : ch.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("") + "$");

// Cloudflare (live date changes with each accepted upload), GitHub, deploy-guard and a D1 that keeps deployment_history.
function world(over) {
  const h = Object.assign({ toml: TOML, src: SRC, live: "2026-08-01", rows: [], events: [], issues: [], puts: [], dg: [], probes: 0, ids: 0 }, over || {});
  h.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith("https://api.github.com/")) {
      h.gh = (h.gh || 0) + 1;
      if (h.githubDown) throw new Error("github unreachable");
      if (u.indexOf("/contents/w/worker.js") > 0) return R({ content: b64(h.contentsSrc || h.src), sha: SHA });
      if (u.indexOf("/contents/w/wrangler.toml") > 0) return R({ content: b64(h.toml) });
      if (u.indexOf("/git/blobs/" + SHA) > 0) return R({ content: b64(h.blobSrc || h.src) });
      return R({ message: "Not Found" }, 404);
    }
    if (u.endsWith("/bindings")) return R({ result: [{ type: "d1", name: "DB", id: "x" }] });
    if (u.endsWith("/settings")) return h.settingsFail ? R({}, 500) : R({ result: { compatibility_date: h.live, compatibility_flags: [] } });
    if (init && init.method === "PUT") {
      const b = String(init.body);
      const meta = JSON.parse(/name="metadata"\r\nContent-Type: application\/json\r\n\r\n([\s\S]*?)\r\n--/.exec(b)[1]);
      const content = /filename="worker\.js"\r\nContent-Type: application\/javascript\+module\r\n\r\n([\s\S]*?)\r\n--/.exec(b)[1];
      h.puts.push({ date: meta.compatibility_date, content });
      if (h.refuseDate && meta.compatibility_date === h.refuseDate) return R({ errors: [{ code: 10021, message: "compatibility date not supported" }] }, 400);
      if (h.refuseAll) return R({ errors: [{ code: 10021, message: "upload refused" }] }, 400);
      h.live = meta.compatibility_date;
      return R({ result: { id: "w", etag: "e" } });
    }
    throw new Error("unexpected fetch " + u);
  };
  const db = {
    prepare(sql) {
      if (h.dbThrows) throw new Error("d1 down");
      return { bind(...p) { return {
        first: async () => {
          const rev = h.rows.slice().reverse();
          if (/action = 'compat-restore' AND notes LIKE \?2/.test(sql)) return rev.find((r) => r.resource_name === p[0] && r.action === "compat-restore" && likeRe(p[1]).test(r.notes)) || null;
          if (/action = 'deploy' AND status = 'success' AND notes LIKE \?2/.test(sql)) return rev.find((r) => r.resource_name === p[0] && r.action === "deploy" && r.status === "success" && likeRe(p[1]).test(r.notes)) || null;
          if (/action IN \('compat-verify', 'compat-restore'\) AND id > \?2/.test(sql)) return rev.find((r) => r.resource_name === p[0] && (r.action === "compat-verify" || r.action === "compat-restore") && r.id > p[1]) || null;
          return null;
        },
        run: async () => {
          if (/INSERT INTO deployment_history/.test(sql)) { h.rows.push({ id: h.rows.length + 1, resource_name: p[1], action: p[2], version_id: p[3], deployed_by: p[4], status: p[6], notes: p[7] }); return { meta: { changes: 1 } }; }
          if (/INSERT INTO cloud_ops_events/.test(sql)) { h.events.push({ text: p[2], meta: JSON.parse(p[3]), status: p[4] }); return {}; }
          if (/INSERT INTO agent_issues/.test(sql)) { h.issues.push({ title: p[0], description: p[1] }); return {}; }
          return {};
        }
      }; } };
    }
  };
  const guard = { fetch: async (u, o) => {
    const path = new URL(u).pathname;
    const b = JSON.parse(o.body);
    h.dg.push({ path, worker: b.worker, owner: b.owner || b.actor || null, token: b.token || null });
    if (path === "/lock/acquire") return h.lockHeld ? R({ acquired: false, holder: "another-deploy" }, 409) : R({ acquired: true, token: "LT" });
    if (path === "/secret-lock/acquire") return R({ acquired: true, token: "ST" });
    if (path === "/ledger") return R({ ok: true, registry_version: b.to || null });
    return R({ ok: true });
  } };
  h.env = { CF_API_TOKEN: "t", QNFO_AUDIT: db, DEPLOY_GUARD: guard };
  h.L = harness(h);
  return h;
}
const deploy = (h, extra) => h.L.opsDeploy(h.env, Object.assign({ worker: "w", path: "w/worker.js", ref: "main" }, extra || {}));
const verify = (h, body) => h.L.opsCompatVerify(h.env, Object.assign({ worker: "w", previous_date: "2026-08-01" }, body));
const step = (r, name) => (r.log || []).filter((x) => x && x.step === name);

// ---- default mode: exactly as before
{
  const h = world();
  const r = await deploy(h);
  ok(r.ok === true && h.puts.length === 1 && h.puts[0].date === "2026-08-01" && h.live === "2026-08-01", "without compat_verify an unreadable /health keeps the live date (one upload)", [r.compat, h.puts.map((p) => p.date)]);
  ok(r.compat && r.compat.applied === false && !r.compat.pending_verify && /cannot be read from qnfo-ops before the upload .*so the advance could not be verified/.test(r.compat.reason), "and the reason is the unreadable /health", r.compat);
  ok(/ compat_date=2026-08-01 compat_not_advanced=not_advanced:_\/health_of_w_cannot_be_read/.test(h.rows[0].notes) && !/pending_verify/.test(h.rows[0].notes), "the ledger note is the 2.44.1 compat_not_advanced note", h.rows[0]);
  ok(step(r, "compat-pending-verify").length === 0 && step(r, "compat-verify").length === 0 && step(r, "compat-restore").length === 0, "no verify or restore step runs", r.log);
  const h2 = world();
  const r2 = await deploy(h2, { compat_verify: "yes" });
  ok(r2.ok && h2.puts.length === 1 && h2.puts[0].date === "2026-08-01" && !r2.compat.pending_verify, "only the exact value \"caller\" opts in", r2.compat);
}

// ---- caller-verified mode: advances, answers pending_verify, no in-account verify
{
  const h = world();
  const r = await deploy(h, { compat_verify: "caller" });
  const c = r.compat || {};
  ok(r.ok === true && h.puts.length === 1 && h.puts[0].date === "2026-10-10" && h.live === "2026-10-10", "compat_verify caller uploads the declared date (one upload)", [c, h.puts.map((p) => p.date)]);
  ok(c.pending_verify === true && c.previous_date === "2026-08-01" && c.new_date === "2026-10-10" && c.expected_version === "1.0.1" && c.source_sha === SHA && c.path === "w/worker.js" && c.verify_route === "/ops/compat-verify" && c.reviewed === "2026-10-12", "the answer carries compat.pending_verify, previous_date, new_date, expected_version and source_sha", c);
  ok(r.compatibility_date === "2026-10-10" && /the caller verifies it \(COMPAT-VERIFY-RUNNER-1\)/.test(c.reason), "the result names the advanced date and why it is pending", [r.compatibility_date, c.reason]);
  ok(h.rows.length === 1 && h.rows[0].action === "deploy" && / compat_date=2026-08-01->2026-10-10 reviewed=2026-10-12 pending_verify /.test(h.rows[0].notes) && h.rows[0].version_id === "1.0.1", "deployment_history records compat_date=<old>-><new> pending_verify", h.rows[0]);
  ok(step(r, "compat-pending-verify").length === 1 && step(r, "compat-verify").length === 0 && step(r, "compat-restore").length === 0, "no in-account verify or restore runs", r.log);
  ok(h.L.compatPendingParse(h.rows[0].notes).to === "2026-10-10" && h.L.compatPendingParse("compat_date=2026-08-01->2026-10-10 reviewed=2026-10-12") === null, "the pending note is parsed back, an ordinary advance note is not pending");
}
// readable /health in caller mode: the in-account verify stays in charge
{
  const h = world({ fleet: [{ name: "w", binding: "W" }], probe: async () => ({ ok: true, http: 200, body: { version: "1.0.1" } }) });
  h.env.W = { fetch() {} };
  const r = await deploy(h, { compat_verify: "caller" });
  ok(r.ok && h.puts.length === 1 && h.puts[0].date === "2026-10-10" && !r.compat.pending_verify && r.compat.kept === true && step(r, "compat-verify").length === 1, "a /health qnfo-ops can read is verified in the account, never left pending", r.compat);
  ok(!/pending_verify/.test(h.rows[0].notes), "and its ledger note is the ordinary advance note", h.rows[0].notes);
}
// every other precondition still refuses in caller mode
{
  let h = world({ toml: 'name = "w"\ncompatibility_date = "2026-10-10"\n' });
  let r = await deploy(h, { compat_verify: "caller" });
  ok(r.ok && h.puts[0].date === "2026-08-01" && !r.compat.pending_verify && /no compat-advance review line/.test(r.compat.reason), "no review line: not advanced in caller mode", r.compat);
  h = world({ toml: 'name = "w"\n# compat-advance: reviewed 2026-11-20\ncompatibility_date = "2026-11-20"\n' });
  r = await deploy(h, { compat_verify: "caller" });
  ok(r.ok && h.puts[0].date === "2026-08-01" && /future/.test(r.compat.reason), "a future date: not advanced in caller mode", r.compat);
  h = world({ src: 'export default { fetch() { return new Response("ok"); } };' });
  r = await deploy(h, { compat_verify: "caller" });
  ok(r.ok && h.puts[0].date === "2026-08-01" && /no VERSION to verify/.test(r.compat.reason), "a source without a VERSION: not advanced in caller mode", r.compat);
  h = world({ rows: [{ id: 1, resource_name: "w", action: "compat-restore", status: "success", notes: "cf_worker_deploy ok compat-restore from=2026-10-10 to=2026-10-10 reviewed=2026-10-12 why=x" }] });
  r = await deploy(h, { compat_verify: "caller" });
  ok(r.ok && h.puts[0].date === "2026-08-01" && /restored before \(deployment_history 1\)/.test(r.compat.reason), "an advance restored before under the same review: not retried in caller mode", r.compat);
  h = world();
  const g = await h.L.compatAdvanceGate({ QNFO_AUDIT: { prepare() { throw new Error("d1 down"); } } }, "w", { to: "2026-10-10", reviewed: "2026-10-12" }, { caller_verify: true });
  ok(g.allow === false && /gate error/.test(g.reason), "a gate error refuses in caller mode", g);
  h = world({ refuseDate: "2026-10-10" });
  r = await deploy(h, { compat_verify: "caller" });
  ok(r.ok && h.puts.length === 2 && h.puts[1].date === "2026-08-01" && r.compat.applied === false && !r.compat.pending_verify && !/pending_verify/.test(h.rows[0].notes), "Cloudflare refusing the date: deployed at the live date, nothing pending", [r.compat, h.rows[0]]);
}

// ---- POST /ops/compat-verify, ok false: the previous date goes back
{
  const h = world();
  await deploy(h, { compat_verify: "caller" });
  const before = h.puts.length;
  const r = await verify(h, { ok: false, observed_version: "1.0.0", new_date: "2026-10-10", expected_version: "1.0.1", source_sha: SHA, reviewed: "2026-10-12", via: "https://w.q08.workers.dev/health", run: "42" });
  ok(r.ok === true && r.status === 200 && r.restored === true && r.compatibility_date === "2026-08-01", "ok false restores and answers 200", r);
  ok(h.puts.length === before + 1 && h.puts[before].date === "2026-08-01" && h.puts[before].content === SRC && h.live === "2026-08-01", "the deployed source is uploaded again with the previous date", h.puts.map((p) => p.date));
  const last = h.rows[h.rows.length - 1];
  ok(last.action === "compat-restore" && /to=2026-10-10 reviewed=2026-10-12 why=the caller read \/health version 1\.0\.0/.test(last.notes) && last.version_id === "1.0.1", "deployment_history records compat-restore with the to= reviewed= text the gate reads", last);
  const dgp = h.dg.slice(-5).map((x) => x.path);
  ok(JSON.stringify(dgp) === JSON.stringify(["/lock/acquire", "/secret-lock/acquire", "/ledger", "/secret-lock/release", "/lock/release"]) && h.dg.slice(-5).every((x) => x.worker === "w"), "under the deploy and secret locks, with the guard ledger, both released", dgp);
  ok(h.events.length === 1 && h.events[0].status === "restored" && h.events[0].meta.run === "42", "cloud_ops_events records the restore", h.events);
  ok(r.source === "blob:" + SHA.slice(0, 12), "the restore source is the blob the deploy uploaded", r.source);
  const again = await verify(h, { ok: false, observed_version: "1.0.0" });
  ok(again.ok === true && again.already === "compat-restore" && h.puts.length === before + 1, "a repeated answer is settled, no second upload", again);
  h.live = "2026-08-01";
  const next = await deploy(h, { compat_verify: "caller" });
  ok(next.ok && h.puts[h.puts.length - 1].date === "2026-08-01" && /restored before/.test(next.compat.reason), "the next deploy does not retry the advance under the same review", next.compat);
}
// ok false with the pending row: the row's dates and VERSION win over the caller's
{
  const h = world();
  await deploy(h, { compat_verify: "caller" });
  const r = await verify(h, { ok: false, observed_version: "", new_date: "2026-09-09", expected_version: "0.0.1" });
  ok(r.ok && r.restored && r.new_date === "2026-10-10" && r.expected_version === "1.0.1" && h.live === "2026-08-01", "the pending row supplies new_date and the deployed VERSION", r);
  ok(r.source === "w/worker.js@main", "without source_sha the file at path and ref is used when it carries the deployed VERSION", r.source);
}
// ok true: recorded, nothing uploaded
{
  const h = world();
  await deploy(h, { compat_verify: "caller" });
  const before = h.puts.length;
  const r = await verify(h, { ok: true, observed_version: "1.0.1", new_date: "2026-10-10", expected_version: "1.0.1", via: "https://w.q08.workers.dev/health", run: "7" });
  ok(r.ok === true && r.status === 200 && r.kept === true && r.recorded === true && h.puts.length === before && h.live === "2026-10-10", "ok true records and uploads nothing; the date stays", r);
  const last = h.rows[h.rows.length - 1];
  ok(last.action === "compat-verify" && last.version_id === "1.0.1" && /COMPAT-VERIFY-RUNNER-1 kept compat_date=2026-08-01->2026-10-10 reviewed=2026-10-12: the caller read \/health version 1\.0\.1 via https:\/\/w\.q08\.workers\.dev\/health run=7 pending_row=1/.test(last.notes), "deployment_history records compat-verify", last);
  ok(h.events.length === 1 && h.events[0].status === "ok", "cloud_ops_events records the verification", h.events);
  ok(!h.dg.some((x) => x.owner === "qnfo-ops/compat-verify"), "no lock is taken for a record", h.dg);
  const again = await verify(h, { ok: true, observed_version: "1.0.1" });
  ok(again.ok && again.already === "compat-verify" && h.rows.length === 2, "a repeated ok true is settled, not recorded twice", again);
  const nogate = await deploy(h, { compat_verify: "caller" });
  ok(nogate.ok && /equals live/.test(nogate.compat.reason) && !nogate.compat.pending_verify, "a verified date is simply the live date on the next deploy", nogate.compat);
}
// refusals that upload nothing
{
  let h = world();
  await deploy(h, { compat_verify: "caller" });
  let n = h.puts.length;
  let r = await verify(h, { ok: true, observed_version: "1.0.0" });
  ok(r.status === 400 && /not the deployed VERSION 1\.0\.1/.test(r.error) && h.rows.length === 1 && h.puts.length === n, "ok true with another VERSION is refused", r);
  for (const [name, body, re] of [["no worker", { worker: "", ok: false }, /worker/], ["ok not boolean", { ok: "false" }, /ok must be true or false/], ["bad previous_date", { ok: false, previous_date: "yesterday" }, /previous_date/]]) {
    r = await verify(h, body);
    ok(r.status === 400 && re.test(r.error) && h.puts.length === n, "bad input (" + name + ") answers 400", r);
  }
  h = world();
  r = await verify(h, { ok: false, observed_version: "1.0.0" });
  ok(r.status === 409 && /no pending caller-verified advance/.test(r.error) && h.puts.length === 0, "ok false with no pending row and no new_date is refused", r);
  h = world();
  await deploy(h, { compat_verify: "caller" });
  h.live = "2026-08-01";
  n = h.puts.length;
  r = await verify(h, { ok: false });
  ok(r.ok && r.noop === true && h.puts.length === n && h.events.some((e) => e.status === "noop"), "the live date not after previous_date: nothing to restore", r);
  h.live = "2026-10-12";
  r = await verify(h, { ok: false });
  ok(r.status === 409 && /a later deploy changed it/.test(r.error) && h.puts.length === n && h.live === "2026-10-12", "a live date other than the advanced one is never moved", r);
  h = world();
  await deploy(h, { compat_verify: "caller" });
  h.lockHeld = true;
  n = h.puts.length;
  r = await verify(h, { ok: false, source_sha: SHA });
  ok(r.status === 409 && r.retryable === true && /deploy lock/.test(r.error) && h.puts.length === n && h.live === "2026-10-10", "a held deploy lock restores nothing and asks for a retry", r);
  h = world();
  await deploy(h, { compat_verify: "caller" });
  h.blobSrc = 'var VERSION = "0.9.0";';
  h.contentsSrc = 'var VERSION = "1.0.2";';
  n = h.puts.length;
  r = await verify(h, { ok: false, source_sha: SHA });
  ok(r.status === 502 && /could not be fetched/.test(r.error) && /carries VERSION 0\.9\.0/.test(r.error) && /carries VERSION 1\.0\.2/.test(r.error) && h.puts.length === n, "a source that is not the deployed VERSION is never uploaded", r);
  ok(h.issues.some((i) => /^COMPAT-RESTORE-FAILED-1: w runs at compatibility date 2026-10-10/.test(i.title)), "and COMPAT-RESTORE-FAILED-1 is filed", h.issues);
  h = world();
  await deploy(h, { compat_verify: "caller" });
  h.refuseAll = true;
  n = h.puts.length;
  r = await verify(h, { ok: false, source_sha: SHA });
  ok(r.status === 502 && r.restored === false && /upload refused/.test(r.restore_error) && h.live === "2026-10-10", "a refused restore upload answers 502 with the error", r);
  ok(h.issues.length === 1 && h.dg.slice(-2).map((x) => x.path).join(",") === "/secret-lock/release,/lock/release", "files the issue and still releases both locks", [h.issues, h.dg.slice(-3)]);
  h = world();
  await deploy(h, { compat_verify: "caller" });
  h.settingsFail = true;
  n = h.puts.length;
  r = await verify(h, { ok: false });
  ok(r.status === 502 && r.retryable === true && /live compatibility date/.test(r.error) && h.puts.length === n, "unreadable live settings restore nothing and ask for a retry", r);
  // D1 unreadable: the caller's new_date must equal the live date
  h = world();
  await deploy(h, { compat_verify: "caller" });
  h.dbThrows = true;
  r = await verify(h, { ok: false, new_date: "2026-10-10", expected_version: "1.0.1", reviewed: "2026-10-12", source_sha: SHA });
  ok(r.ok && r.restored && h.live === "2026-08-01", "with D1 unreadable the caller's new_date, matching the live date, is enough to restore", r);
}

// ---- wiring
ok(/"\/ops\/deploy", "\/ops\/compat-verify"\]/.test(src), "the route is listed in ROUTES");
const rt = src.indexOf('if (path === "/ops/compat-verify" && method === "POST") {');
ok(rt > src.indexOf('if (path === "/ops/deploy" && method === "POST") {') && /^\s*if \(path === "\/ops\/compat-verify" && method === "POST"\) \{\s+if \(!await authOk\(request\.headers\.get\("Authorization"\) \|\| "", env\)\) return json\(\{ error: "Unauthorized - set Bearer OPS_ROUTER_AUTH_KEY" \}, 401\);/.test(src.slice(rt, rt + 400)), "POST /ops/compat-verify takes the same router key as /ops/deploy");
ok(/_cv = await opsCompatVerify\(env, _cb \|\| \{\}\);/.test(src) && /return json\(_cv, _cv\.status \|\| \(_cv\.ok \? 200 : 502\)\);/.test(src), "the route answers with the verify's own status");
ok((src.match(/compat_gate:/g) || []).length === 1, "only /ops/deploy passes a gate");
ok(/const _callerVerify = String\(args && args\.compat_verify \|\| ""\) === "caller";/.test(src), "only compat_verify \"caller\" opts in");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
