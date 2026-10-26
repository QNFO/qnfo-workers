// CANONICAL-REFRESH-1 (qnfo-ops 2.59.4, agent_issues 1000161 CANONICAL-REFRESH-GAP-1), offline suite. No network.
// Runs the worker's own opsDeploy (with cfWorkerDeploy, the compat gate and the new canonicalRefresh block) against a recorded Cloudflare, GitHub,
// deploy-guard, D1 and a fake R2 bucket. The defect: /ops/deploy had no binding to qnfo-canonical, so a deploy never refreshed qnfo-canonical/<worker>.js
// (on 2026-10-25 qnfo-deploy-guard went live at 1.3.29 while the object held 1.3.25 until a session wrote it by hand).
// Proves: after a deploy whose live /health version matches the requested one, the deployed source is in the bucket under <worker>.js byte for byte
// (non-ASCII included), with ts, version, sha256 and actor metadata in the shape qnfo-fleet-control canonical() reads; the answer carries
// canonical { ok, parity, bytes, sha256 } and one canonical_refresh row is recorded (status ok); a missing binding, a failed write, a failed read, a
// read-back that differs, a missing read-back, a non-main ref, another repository, a live version that is not the requested one and an empty source
// never fail the deploy and each leaves a skipped or error row; a refused deploy touches nothing; a broken event insert does not undo the write; the
// sha-256 helper agrees with node:crypto for 300 random inputs (zero-byte padding); wrangler.toml declares the binding; the mirror is identical.
// ADVERSARIAL: does not prove Cloudflare installs the binding (the canonical deploy of qnfo-ops does, as for the four other R2 bindings) or that R2
// accepts the put; the live proof is a canonical_refresh row with status ok after the first deploy by this version (migrations/2026-10-26-infra-canonical.sql).
// Run: node qnfo-ops/canonical-refresh.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { createHash, randomBytes, webcrypto } from "node:crypto";
import { versionAtLeast } from "../scripts/version-at-least.mjs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 1500) : "")); } };

ok(versionAtLeast((/var VERSION = "([^"]*)"/.exec(src) || [])[1] || "", "2.59.4"), "VERSION is at least 2.59.4");
ok(src.indexOf("CANONICAL-REFRESH-1") > 0 && (src.match(/CANONICAL-REFRESH-1:BEGIN/g) || []).length === 1 && (src.match(/CANONICAL-REFRESH-1:END/g) || []).length === 1, "the marker and one BEGIN and one END are in worker.js");
ok(src === mirror, "deployed-current.worker.js is identical to worker.js");
ok(/\[\[r2_buckets\]\]\s*\nbinding = "CANONICAL"\s*\nbucket_name = "qnfo-canonical"/.test(toml), "wrangler.toml declares the CANONICAL binding on the qnfo-canonical bucket");
ok(/binding = "RELEASES_R2"/.test(toml) && /binding = "SKILLS_R2"/.test(toml), "the four existing R2 bindings are still declared");

const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); ok(i > 0 && j > i, "anchor found: " + a); return i > 0 && j > i ? src.slice(i, j) : ""; };
const parts = [
  cut("var OPS_REDACT_MARK", "\n__name(redactLooksSecret"),
  cut("function b64Utf8(b64) {", "// ---- UTF8-DEPLOY-1:END"),
  cut("async function recordDeployLedger(env, row) {", "\n// CF-API-RETRY-1 (2.43.1"),
  cut("var CF_RETRY_MAX = ", "\nasync function cfWorkerDeploy("),
  cut("var COMPAT_FLIPS = [", "\nvar OBS_KEYS = "),
  cut("var OBS_KEYS = ", "\nasync function installDeclaredBindings("),
  cut("async function cfWorkerDeploy(env, args) {", "\n__name(cfWorkerDeploy"),
  cut("// ---- CANONICAL-REFRESH-1:BEGIN", "// ---- CANONICAL-REFRESH-1:END"),
  cut("async function opsDeploy(env, args) {", "\n__name(opsDeploy")
];
const harnessBody = (h) => [
  'var CF_ACCOUNT_ID = "acct"; var VERSION = "9.9.9-test"; var WORKER = "qnfo-ops";',
  "function iso() { return h.now || '2026-10-26T20:00:00.000Z'; }",
  "var FLEET = h.fleet || [];",
  "async function probeService(env, f, path) { return { http: 0, body: {}, error: 'no answer' }; }",
  "async function cfWorkerRead() { return { ok: true, version: h.liveVersion || '1.0.1', version_known: true }; }",
  "async function installDeclaredBindings(env, worker) { return { installed: 0, note: null, bindings: [], compat_flags: parseDeclaredCompat(h.toml).flags, observability: null, compat: parseDeclaredCompat(h.toml) }; }",
  "function tomlDeclaredCrons() { return []; }",
  "function randId(p) { h.ids++; return p + h.ids; }",
  "function __name() {}",
  ...parts,
  "return { opsDeploy, canonicalRefresh, canonicalRefreshEvent, canonicalSha256 };"
].join("\n");
const buildLib = (h) => new Function("h", "fetch", "setTimeout", "crypto", harnessBody(h))(h, (u, i) => h.fetch(u, i), (fn) => { fn(); return 0; }, webcrypto);

const SHA = "a".repeat(40);
const SRC = 'var VERSION = "1.0.1"; export default { fetch() { return new Response("ok"); } };';
const SRC_UTF8 = 'var VERSION = "1.0.1"; // café — 日本語 🚀 end\nexport default { fetch() { return new Response("ok"); } };\n';
const TOML = 'name = "w"\nmain = "worker.js"\ncompatibility_date = "2026-10-10"\n';
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const R = (o, s) => ({ ok: (s || 200) < 300, status: s || 200, json: async () => o, text: async () => JSON.stringify(o), clone() { return this; } });
const sha256 = (s) => createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");

// a fake R2 bucket: stores UTF-8 bytes like R2, returns an object with text(); switches for each failure
function bucket(sw) {
  sw = sw || {};
  const b = { store: new Map(), puts: 0, gets: 0 };
  b.put = async (key, value, opts) => {
    b.puts++;
    if (sw.putThrows) throw new Error(sw.putThrows);
    if (typeof value !== "string") throw new Error("this suite expects the string body the worker writes");
    b.store.set(key, { bytes: new TextEncoder().encode(sw.corrupt ? value + " " : value), httpMetadata: opts && opts.httpMetadata, customMetadata: opts && opts.customMetadata });
  };
  b.get = async (key) => {
    b.gets++;
    if (sw.getThrows) throw new Error(sw.getThrows);
    if (sw.missingBack) return null;
    const o = b.store.get(key);
    if (!o) return null;
    return { customMetadata: o.customMetadata, httpMetadata: o.httpMetadata, size: o.bytes.length, async text() { return new TextDecoder().decode(o.bytes); } };
  };
  return b;
}

function world(over) {
  const h = Object.assign({ toml: TOML, src: SRC, live: "2026-08-01", rows: [], events: [], puts: [], dg: [], ids: 0, bindBucket: true }, over || {});
  h.bucket = bucket(h.bucketSwitches);
  h.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith("https://api.github.com/")) {
      if (u.indexOf("/contents/w/worker.js") > 0) return R({ content: b64(h.src), sha: SHA });
      if (u.indexOf("/contents/w/wrangler.toml") > 0) return R({ content: b64(h.toml) });
      return R({ message: "Not Found" }, 404);
    }
    if (u.endsWith("/bindings")) return R({ result: [{ type: "d1", name: "DB", id: "x" }] });
    if (u.endsWith("/settings")) return R({ result: { compatibility_date: h.live, compatibility_flags: [] } });
    if (init && init.method === "PUT") {
      const body = String(init.body);
      const meta = JSON.parse(/name="metadata"\r\nContent-Type: application\/json\r\n\r\n([\s\S]*?)\r\n--/.exec(body)[1]);
      h.puts.push({ date: meta.compatibility_date });
      if (h.refuseAll) return R({ errors: [{ code: 10021, message: "upload refused" }] }, 400);
      h.live = meta.compatibility_date;
      return R({ result: { id: "w", etag: "e" } });
    }
    throw new Error("unexpected fetch " + u);
  };
  const db = {
    prepare(sql) {
      if (h.eventThrows && /cloud_ops_events/.test(sql)) throw new Error("d1 events down");
      return { bind(...p) { return {
        first: async () => null,
        run: async () => {
          if (/INSERT INTO deployment_history/.test(sql)) { h.rows.push({ resource_name: p[1], action: p[2], status: p[6], notes: p[7] }); return { meta: { changes: 1 } }; }
          if (/INSERT INTO cloud_ops_events/.test(sql)) { h.events.push({ kind: (/\?2, '([A-Za-z_-]+)'/.exec(sql) || [])[1], text: p[2], meta: JSON.parse(p[3]), status: p[4] }); return {}; }
          return {};
        }
      }; } };
    }
  };
  const guard = { fetch: async (u, o) => {
    const path = new URL(u).pathname;
    const b = JSON.parse(o.body);
    h.dg.push({ path, worker: b.worker });
    if (path === "/lock/acquire") return R({ acquired: true, token: "LT" });
    if (path === "/secret-lock/acquire") return R({ acquired: true, token: "ST" });
    if (path === "/ledger") return R({ ok: true, registry_version: b.to || null });
    return R({ ok: true });
  } };
  h.env = { CF_API_TOKEN: "t", QNFO_AUDIT: db, DEPLOY_GUARD: guard };
  if (h.bindBucket) h.env.CANONICAL = h.bucket;
  h.L = buildLib(h);
  return h;
}
const deploy = (h, extra) => h.L.opsDeploy(h.env, Object.assign({ worker: "w", path: "w/worker.js", ref: "main", to_version: "1.0.1" }, extra || {}));
const step = (r, name) => (r.log || []).filter((x) => x && x.step === name);
const canonEvents = (h) => h.events.filter((e) => e.kind === "canonical_refresh");

// ---- happy path: the object is the deployed source
{
  const h = world();
  const r = await deploy(h);
  const o = h.bucket.store.get("w.js");
  ok(r.ok === true, "the deploy succeeds", { ok: r.ok, error: r.error });
  ok(o && new TextDecoder().decode(o.bytes) === SRC, "qnfo-canonical/w.js holds the deployed source byte for byte", o && new TextDecoder().decode(o.bytes));
  ok(o && o.httpMetadata && o.httpMetadata.contentType === "text/plain", "content type text/plain, as qnfo-fleet-control canonical() writes", o && o.httpMetadata);
  const m = o && o.customMetadata || {};
  const ts = parseInt(m.ts, 10);
  ok(/^\d{13}$/.test(String(m.ts)) && Math.abs(Date.now() - ts) < 60000, "customMetadata.ts is the epoch milliseconds that canonical() r2Read parses", m.ts);
  ok(m.version === "1.0.1" && m.sha256 === sha256(SRC) && m.actor === "qnfo-ops/ops-deploy", "customMetadata carries version, sha256 (agrees with node:crypto) and the actor", m);
  ok(r.canonical && r.canonical.ok === true && r.canonical.parity === true && r.canonical.bytes === Buffer.byteLength(SRC) && r.canonical.sha256 === sha256(SRC) && r.canonical.skipped === null && r.canonical.error === null, "the answer carries canonical { ok, parity, bytes, sha256 }", r.canonical);
  const cs = step(r, "canonical");
  ok(cs.length === 1 && cs[0].ok === true && cs[0].key === "w.js", "one canonical log step", cs);
  const ev = canonEvents(h);
  ok(ev.length === 1 && ev[0].status === "ok" && /^w: refreshed qnfo-canonical\/w\.js \(\d+ bytes, sha-256 [0-9a-f]{12}, version 1\.0\.1\)$/.test(ev[0].text), "one canonical_refresh row with status ok", ev);
  ok(ev[0] && ev[0].meta.worker === "w" && ev[0].meta.key === "w.js" && ev[0].meta.version === "1.0.1" && ev[0].meta.parity === true && ev[0].meta.sha256 === sha256(SRC), "its meta names worker, key, version, parity and the hash", ev[0] && ev[0].meta);
  ok(h.bucket.puts === 1 && h.bucket.gets === 1, "one write and one read-back", { puts: h.bucket.puts, gets: h.bucket.gets });
  const order = h.dg.map((x) => x.path);
  ok(order.indexOf("/ledger") > 0 && order[order.length - 1] === "/lock/release", "the existing lock and ledger sequence still runs and ends with the lock release", order);
}

// ---- a non-ASCII source survives the round trip (UTF-8 bytes, not code units)
{
  const h = world({ src: SRC_UTF8 });
  const r = await deploy(h);
  const o = h.bucket.store.get("w.js");
  ok(r.ok && o && new TextDecoder().decode(o.bytes) === SRC_UTF8, "a source with accents, CJK and an emoji is stored unchanged", o && new TextDecoder().decode(o.bytes));
  ok(r.canonical && r.canonical.parity === true && r.canonical.bytes === Buffer.byteLength(SRC_UTF8) && r.canonical.bytes > SRC_UTF8.length && r.canonical.sha256 === sha256(SRC_UTF8), "bytes are UTF-8 bytes and the hash agrees with node:crypto", r.canonical);
}

// ---- no binding: skipped, never fatal
{
  const h = world({ bindBucket: false });
  const r = await deploy(h);
  ok(r.ok === true && r.canonical && r.canonical.skipped === "no-CANONICAL-binding" && r.canonical.ok === false, "without the binding the deploy succeeds and the refresh is skipped", r.canonical);
  const ev = canonEvents(h);
  ok(ev.length === 1 && ev[0].status === "skipped" && /skipped \(no-CANONICAL-binding\)/.test(ev[0].text), "and one canonical_refresh row says skipped", ev);
}

// ---- failure modes: each leaves an error row and the deploy answer is unchanged
for (const [name, sw, errRe, canon] of [
  ["a failed write", { putThrows: "R2 put failed: 503" }, /R2 put failed: 503/, { parity: null }],
  ["a failed read-back", { getThrows: "R2 get failed: timeout" }, /R2 get failed: timeout/, { parity: null }],
  ["a missing read-back", { missingBack: true }, /read-back-missing/, { parity: false }],
  ["a read-back that differs", { corrupt: true }, /read-back-differs: \d+ bytes, sha-256 [0-9a-f]{12} against \d+ bytes, [0-9a-f]{12}/, { parity: false }]
]) {
  const h = world({ bucketSwitches: sw });
  const r = await deploy(h);
  ok(r.ok === true && r.live === "1.0.1", name + ": the deploy still succeeds", { ok: r.ok, live: r.live });
  ok(r.canonical && r.canonical.ok === false && errRe.test(String(r.canonical.error)) && r.canonical.parity === canon.parity, name + ": canonical.ok false with the error and parity " + canon.parity, r.canonical);
  const ev = canonEvents(h);
  ok(ev.length === 1 && ev[0].status === "error" && /^w: failed \(/.test(ev[0].text), name + ": one canonical_refresh row with status error", ev);
}

// ---- preconditions
{
  const h = world();
  const r = await deploy(h, { ref: "feature-branch" });
  ok(r.ok === true && r.canonical && r.canonical.skipped === "not-main-of-qnfo-workers" && h.bucket.puts === 0 && !h.bucket.store.has("w.js"), "a deploy from another ref never writes the canonical object", r.canonical);
  const h2 = world();
  const r2 = await deploy(h2, { repo: "QNFO/some-other-repo" });
  ok(r2.canonical && r2.canonical.skipped === "not-main-of-qnfo-workers" && h2.bucket.puts === 0, "a deploy from another repository never writes it", r2.canonical);
  const h3 = world({ liveVersion: "0.9.9" });
  const r3 = await deploy(h3);
  ok(r3.ok === false && r3.canonical && r3.canonical.skipped === "deploy-not-verified" && h3.bucket.puts === 0, "a live /health version that is not the requested one is not refreshed and the deploy answer stays ok false", { ok: r3.ok, live: r3.live, canonical: r3.canonical });
  ok(canonEvents(h3).length === 1 && canonEvents(h3)[0].status === "skipped", "and it is recorded as skipped", canonEvents(h3));
  const h4 = world({ refuseAll: true });
  const r4 = await deploy(h4);
  ok(r4.ok === false && h4.bucket.puts === 0 && canonEvents(h4).length === 0 && step(r4, "canonical").length === 0, "a refused deploy touches nothing and records nothing", { ok: r4.ok, error: r4.error });
  const h5 = world({ src: "   \n" });
  const r5 = await deploy(h5, { to_version: undefined });
  ok(h5.bucket.puts === 0 && (!r5.canonical || r5.canonical.ok === false), "an empty source is never written", r5.canonical);
}

// ---- a broken event insert does not undo the write or fail the deploy
{
  const h = world({ eventThrows: true });
  const _err = console.error; console.error = () => {};
  let r; try { r = await deploy(h); } finally { console.error = _err; }
  ok(r && r.ok === true && h.bucket.store.has("w.js") && r.canonical && r.canonical.ok === true, "an events table that refuses the row leaves the object written and the deploy ok", r && r.canonical);
}

// ---- no to_version: the refresh follows dep.ok alone
{
  const h = world();
  const r = await deploy(h, { to_version: undefined });
  ok(r.ok === true && r.canonical && r.canonical.ok === true && h.bucket.store.has("w.js"), "a deploy without to_version refreshes after a successful upload", r.canonical);
}

// ---- the sha-256 helper agrees with node:crypto, including leading zero bytes
{
  const h = world();
  let bad = 0, zeroLead = 0;
  for (let i = 0; i < 300; i++) {
    const s = i < 3 ? ["", "a", "abc"][i] : randomBytes(1 + (i % 97)).toString("latin1") + "é—";
    const got = await h.L.canonicalSha256(s);
    if (got.sha256 !== sha256(s) || got.bytes !== Buffer.byteLength(s) || got.sha256.length !== 64) bad++;
    if (/^00/.test(got.sha256)) zeroLead++;
  }
  ok(bad === 0, "canonicalSha256 matches node:crypto for 300 inputs", bad);
  const r = await h.L.canonicalRefresh(h.env, { worker: "bad name", content: "x", deployed: true, repo: "QNFO/qnfo-workers", ref: "main" });
  ok(r.skipped === "bad-worker-name" && h.bucket.puts === 0, "a worker name with a space or slash is never a key", r);
  const r2 = await h.L.canonicalRefresh(h.env, { worker: "../x", content: "x", deployed: true, repo: "QNFO/qnfo-workers", ref: "main" });
  ok(r2.skipped === "bad-worker-name" && h.bucket.puts === 0, "a path-like worker name is refused", r2);
  void zeroLead;
}

// ---- the other suites' harnesses cut opsDeploy alone: the call must degrade, not throw
{
  const only = cut("async function opsDeploy(env, args) {", "\n__name(opsDeploy");
  ok(/try \{\s*\n\s*const _cr = await canonicalRefresh\(env,/.test(only) && /catch \(eCan\)/.test(only), "the call site is inside its own try and catch, so a harness that lacks the block degrades to a log step");
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
