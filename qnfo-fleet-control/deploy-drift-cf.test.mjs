// DEPLOY-DRIFT-CF-1 (qnfo-fleet-control 0.26.0) offline suite. No network, no D1: an in-memory D1 stub and scripted GitHub,
// Cloudflare and qnfo-ops answers drive the step tick by tick.
// Proves: a worker whose main VERSION is ahead of live for longer than the 45-minute grace, with no canonical-deploy run active,
// is deployed through qnfo-ops /ops/deploy with to_version; inside the grace it is not; an active run created within the hour
// blocks it and a stuck older one does not; live ahead of main is never deployed (from D1 or from the live script); the off
// switch stops everything; at most 2 deploys a tick; control-plane, container, marked and never-deployed workers are skipped;
// a refused route deploys nothing; a failed deploy backs off; the step is wired into the 20-minute tick.
// Run: node --no-warnings qnfo-fleet-control/deploy-drift-cf.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("// BEGIN DEPLOY-DRIFT-CF-1"), b = src.indexOf("// END DEPLOY-DRIFT-CF-1");
ok(a > 0 && b > a, "the DEPLOY-DRIFT-CF-1 block is present");
const sb = { __name: (f) => f, console: { log() {}, error() {} }, atob, TextDecoder };
vm.createContext(sb);
vm.runInContext(src.slice(a, b) + "\n__x = { deployDriftCf, ddcCompare, ddcDecide, ddcRunsBlock, ddcRoute, ddcToml, ddcLivePick, ddcExclusion, ddcControlPlane, DDC_COLS, DDC_GRACE_MIN, DDC_MAX_PER_TICK, DDC_PROBE_COMPONENT };", sb);
const X = sb.__x;
const T0 = Date.parse("2026-10-13T07:00:00Z");
const at = (min) => T0 + min * 60000;
const iso = (min) => new Date(at(min)).toISOString();
const sqlTs = (min) => iso(min).slice(0, 19).replace("T", " ");

// ---- pure helpers ----
ok(X.ddcCompare("1.10.0", "1.9.9") === 1 && X.ddcCompare("2.0", "2.0.1") === -1, "numeric core comparison, not string order");
ok(X.ddcCompare("0.26.0-deploy-drift-cf", "0.25.0-metric-refresher-2") === 1, "suffixes are ignored when the cores differ");
ok(X.ddcCompare("1.2.0-a", "1.2.0-b") === 0 && X.ddcCompare("v1.2.0", "1.2.0") === 0, "an equal core is never ahead, whatever the suffix or a leading v");
ok(X.ddcCompare("fleet-executor/0.3.1", "1.0.1") === null && X.ddcCompare("1.0", null) === null, "no numeric core: unorderable (null)");
ok(X.ddcToml('# c\nname = "qnfo-x"\nmain = "worker.js"\n[[containers]]\nname = "inner"\n').name === "qnfo-x", "the first name line is the declared name");
ok(X.ddcToml('name = "a"\n[[containers]]\n').containers === true && X.ddcToml('name = "a"\n# [[containers]]\n').containers === false, "[[containers]] at line start marks a container worker");
ok(X.ddcLivePick([{ version: "1.0.0", ts: "2026-10-13 06:00:00" }, { version: "1.1.0", ts: "2026-10-13T06:30:00Z" }]).version === "1.1.0", "the newest observation wins across timestamp formats");
ok(X.ddcLivePick([{ version: "1.0.0", ts: "2026-10-13T06:00:00Z" }, { absent: true, ts: "2026-10-13 06:30:00" }]) === null, "a newer NOT_DEPLOYED probe means no live worker");
const cp = X.ddcControlPlane();
ok(["qnfo-ops", "qnfo-fleet-control", "qnfo-deploy-guard", "qnfo-ai", "qnfo-gateway", "qnfo-code-orchestrator"].every((w) => cp.indexOf(w) >= 0), "the control-plane list covers CM_CONTROL_PLANE and CP_CANARY_WORKERS");
ok(/duplicate-name/.test(X.ddcExclusion({ toml_sha: "t", worker: "x-legacy-dup" }, cp)) && X.ddcExclusion({ toml_sha: "t", worker: "alpha", containers: 0 }, cp) === null, "a -legacy-dup name is excluded; an ordinary worker is a target");
ok(X.ddcRunsBlock([{ id: 1, status: "completed", created_at: iso(-5) }, { id: 2, status: "queued", created_at: iso(-120) }], at(0), 60) === null, "completed runs and a stuck run older than an hour do not block");
ok(X.ddcRunsBlock([{ id: 3, status: "pending", created_at: iso(-10) }], at(0), 60).id === 3, "any active status created within the hour blocks");
ok(X.ddcRoute(401, { error: "Unauthorized" }).indexOf("refused") === 0 && X.ddcRoute(200, { ok: true, preflight: true }) === "ready", "route: 401 refused, preflight 200 ready");
ok(X.ddcRoute(502, { ok: false, error: "worker and path are required" }) === "ready" && X.ddcRoute(0, { error: "no SVC_QNFO_OPS binding" }).indexOf("unreachable") === 0, "route: the argument refusal proves the caller; no binding is unreachable");
let dec = X.ddcDecide({ main_version: "1.2.0", drift_since: iso(-30), drift_live: "1.1.0" }, { version: "1.1.0" }, at(0), 45);
ok(dec.state === "wait" && dec.drift_since === iso(-30), "30 minutes of drift: wait, drift_since kept", dec);
dec = X.ddcDecide({ main_version: "1.2.0", drift_since: iso(-50), drift_live: "1.1.0" }, { version: "1.1.0" }, at(0), 45);
ok(dec.state === "due", "50 minutes of drift: due", dec);
dec = X.ddcDecide({ main_version: "1.2.0", drift_since: iso(-50), drift_live: "1.1.0" }, { version: "1.1.5" }, at(0), 45);
ok(dec.state === "wait" && dec.drift_since === iso(0), "a live version that moved restarts the drift clock", dec);

// ---- the step, against an in-memory D1 and scripted I/O ----
const COLS = Array.from(X.DDC_COLS);
const sha = (s) => createHash("sha1").update(s).digest("hex");
const wjs = (v) => `// worker\nvar VERSION = "${v}"; // note\nexport default {};\n`;
const toml = (n, extra) => `name = "${n}"\nmain = "worker.js"\n${extra || ""}`;
function repo(spec) {
  const files = {};
  for (const [dir, f] of Object.entries(spec)) for (const [name, text] of Object.entries(f)) files[dir + "/" + name] = text;
  files["README.md"] = "root"; files["docs/notes.md"] = "x"; files[".github/workflows/canonical-deploy.yml"] = "name: canonical-deploy";
  return files;
}
function makeIo(o) {
  const calls = { gh: [], live: [], ops: [], preflight: 0 };
  const io = {
    calls,
    gh: async (path) => {
      calls.gh.push(path);
      const files = o.files;
      if (path === "/git/ref/heads/main") return { status: 200, ok: true, j: { object: { sha: o.head } } };
      if (path.indexOf("/git/trees/") === 0) return { status: 200, ok: true, j: { truncated: false, tree: Object.keys(files).map((p) => ({ path: p, type: "blob", sha: sha(p + "\n" + files[p]) })) } };
      if (path.indexOf("/git/blobs/") === 0) {
        const want = path.slice("/git/blobs/".length);
        const p = Object.keys(files).find((k) => sha(k + "\n" + files[k]) === want);
        return p ? { status: 200, ok: true, j: { encoding: "base64", content: Buffer.from(files[p]).toString("base64").replace(/(.{60})/g, "$1\n") } } : { status: 404, ok: false, j: null };
      }
      if (path.indexOf("/actions/workflows/canonical-deploy.yml/runs") === 0) return o.runsHttp ? { status: o.runsHttp, ok: false, j: null } : { status: 200, ok: true, j: { workflow_runs: o.runs || [] } };
      return { status: 404, ok: false, j: null };
    },
    liveVersion: async (w) => { calls.live.push(w); return (o.cfLive || {})[w] || null; },
    ops: async (body) => {
      if (body && body.preflight) { calls.preflight++; return o.route || { status: 502, j: { ok: false, error: "worker and path are required", log: [] } }; }
      calls.ops.push(body);
      return o.deployRes ? o.deployRes(body) : { status: 200, j: { ok: true, worker: body.worker, live: body.to_version } };
    },
  };
  return io;
}
function makeDb(init) {
  const st = { table: {}, lws: {}, flag: init.flag, wla: init.wla || [], dh: init.dh || [], events: [], armed: 0 };
  return {
    st,
    prepare(sql) {
      const s = { sql, args: [] };
      s.bind = (...args) => { s.args = args; return s; };
      s.first = async () => {
        if (/FROM ops_config/.test(sql)) return st.flag === undefined ? null : { value: st.flag };
        if (/FROM loop_watch_state/.test(sql)) return st.lws.head === undefined ? null : { value: st.lws.head };
        throw new Error("unexpected first: " + sql);
      };
      s.all = async () => {
        if (/FROM worker_live_audit/.test(sql)) return { results: st.wla };
        if (/FROM deployment_history/.test(sql)) return { results: st.dh };
        if (/^SELECT \* FROM deploy_drift_cf$/.test(sql)) return { results: Object.values(st.table).map((r) => ({ ...r })) };
        throw new Error("unexpected all: " + sql);
      };
      s.run = async () => {
        if (/^CREATE TABLE IF NOT EXISTS deploy_drift_cf/.test(sql)) return {};
        if (/^INSERT OR REPLACE INTO loop_watch_state/.test(sql)) { st.lws.head = s.args[0]; return {}; }
        if (/^INSERT INTO deploy_drift_cf .* ON CONFLICT\(dir\) DO UPDATE/.test(sql)) { const r = {}; COLS.forEach((c, i) => { r[c] = s.args[i]; }); st.table[r.dir] = r; return {}; }
        if (/^INSERT INTO cloud_ops_events/.test(sql) && /'deploy-drift-cf'/.test(sql)) { st.events.push({ id: s.args[0], ts: s.args[1], text: s.args[2], status: s.args[3] }); return {}; }
        if (/^UPDATE spof_alternate_probes SET enabled = 1/.test(sql)) { if (s.args[0] === X.DDC_PROBE_COMPONENT) st.armed++; return {}; }
        throw new Error("unexpected run: " + sql);
      };
      return s;
    },
  };
}
const wla = (worker, v, min) => ({ worker, http: 200, live_version: v, note: "SYNC", probed_at: sqlTs(min == null ? -60 : min) });
const absent = (worker) => ({ worker, http: 404, live_version: null, note: "NOT_DEPLOYED", probed_at: sqlTs(-60) });
const FLEET = repo({
  alpha: { "worker.js": wjs("1.2.0-new"), "wrangler.toml": toml("alpha") },
  beta: { "worker.js": wjs("2.0.0"), "wrangler.toml": toml("beta") },
  gamma: { "worker.js": wjs("1.0.0"), "wrangler.toml": toml("gamma") },
  "qnfo-ops": { "worker.js": wjs("2.46.0"), "wrangler.toml": toml("qnfo-ops") },
  "qnfo-fleet-control": { "worker.js": wjs("0.26.0"), "wrangler.toml": toml("qnfo-fleet-control") },
  pilot: { "worker.js": wjs("1.1.0"), "wrangler.toml": toml("pilot", "[[containers]]\nclass_name = \"P\"\n") },
  oldie: { "worker.js": wjs("9.0.0"), "wrangler.toml": toml("oldie"), RETIRED: "retired 2026-10-01" },
  ghost: { "worker.js": wjs("3.0.0"), "wrangler.toml": toml("ghost") },
  dup: { "worker.js": wjs("5.0.0"), "wrangler.toml": toml("dup-legacy-dup") },
});
const FLEET_WLA = [wla("alpha", "1.1.0"), wla("beta", "2.0.0"), wla("gamma", "1.1.0"), wla("qnfo-ops", "2.45.0"), wla("qnfo-fleet-control", "0.25.0"), wla("pilot", "1.0.0"), wla("oldie", "1.0.0"), absent("ghost"), wla("dup-legacy-dup", "1.0.0")];
const env = (db) => ({ AUDIT_DB: db });
const deploys = (io) => io.calls.ops.map((b) => b.worker);
const lastEvent = (db) => db.st.events.filter((e) => /^deploy-drift-cf-\d{4}-/.test(e.id)).slice(-1)[0];

// 1. Inside the grace: drift is stamped, nothing is deployed; the tree is read once while main is unchanged.
let db = makeDb({ wla: FLEET_WLA });
let io = makeIo({ files: FLEET, head: "h1", cfLive: { alpha: "1.1.0" } });
let r = await X.deployDriftCf(env(db), at(0), io);
ok(r.ok && r.route === "ready" && deploys(io).length === 0, "first sight of drift: no deploy", r);
ok(db.st.table.alpha.state === "wait" && db.st.table.alpha.drift_since === iso(0) && db.st.table.alpha.main_version === "1.2.0-new", "alpha: wait, drift stamped at the first tick", db.st.table.alpha);
ok(lastEvent(db).status === "ok" && db.st.armed === 1, "an ok tick writes an ok event and arms the chaos-drill probe", lastEvent(db));
r = await X.deployDriftCf(env(db), at(30), io);
ok(deploys(io).length === 0 && db.st.table.alpha.state === "wait" && db.st.table.alpha.drift_since === iso(0), "30 minutes in: still inside the grace, not deployed", db.st.table.alpha);
ok(io.calls.gh.filter((p) => p.indexOf("/git/trees/") === 0).length === 1 && r.main === "unchanged", "main unchanged: the tree is not read again", io.calls.gh);
ok(io.calls.gh.filter((p) => p.indexOf("/actions/") === 0).length === 0 && io.calls.live.length === 0, "nothing due: no runs read, no live script read");

// 2. Past the grace, no run active: deployed through /ops/deploy with to_version.
r = await X.deployDriftCf(env(db), at(50), io);
ok(deploys(io).join(",") === "alpha", "50 minutes in, no run active: alpha is deployed", io.calls.ops);
const body = io.calls.ops[0];
ok(body.path === "alpha/worker.js" && body.ref === "main" && body.to_version === "1.2.0-new", "the deploy call names path, ref main and to_version", body);
ok(io.calls.live.join(",") === "alpha", "the live script is read before the deploy", io.calls.live);
ok(r.deployed.length === 1 && db.st.table.alpha.state === "deployed" && /^deployed 1\.1\.0 -> 1\.2\.0-new$/.test(db.st.table.alpha.last_action), "the row records the deploy", db.st.table.alpha);
const dev = db.st.events.find((e) => e.id.indexOf("deploy-drift-cf-alpha-") === 0);
ok(dev && dev.status === "ok" && /deployed alpha 1\.1\.0 -> 1\.2\.0-new/.test(dev.text), "one ok ledger row per deploy", dev);
ok(["qnfo-ops", "qnfo-fleet-control", "gamma", "pilot", "oldie", "ghost", "dup"].every((d) => deploys(io).indexOf(d) < 0), "no excluded or live-ahead worker is deployed");

// 3. Exclusions as recorded on the rows.
ok(/^skip: control-plane worker/.test(db.st.table["qnfo-ops"].state) && /^skip: control-plane worker/.test(db.st.table["qnfo-fleet-control"].state), "control-plane workers are skipped", [db.st.table["qnfo-ops"].state]);
ok(/container worker/.test(db.st.table.pilot.state) && /RETIRED marker/.test(db.st.table.oldie.state) && /no live version/.test(db.st.table.ghost.state) && /duplicate-name/.test(db.st.table.dup.state), "container, RETIRED, never-deployed and -legacy-dup directories are skipped");
ok(db.st.table.gamma.state === "live-ahead" && db.st.table.beta.state === "sync", "live ahead of main is recorded, never deployed; equal is sync");
ok(!("docs" in db.st.table) && !(".github" in db.st.table), "directories without worker.js and wrangler.toml are not tracked");

// 4. An active canonical-deploy run blocks; a stuck one does not; an unreadable run list does not.
for (const [runs, blocked, label] of [
  [[{ id: 7, status: "in_progress", created_at: iso(45) }], true, "an in-progress run created 5 minutes ago blocks"],
  [[{ id: 8, status: "queued", created_at: iso(40) }], true, "a queued run created 10 minutes ago blocks"],
  [[{ id: 9, status: "queued", created_at: iso(-120) }], false, "a run queued for 170 minutes is stuck and does not block"],
]) {
  db = makeDb({ wla: FLEET_WLA });
  io = makeIo({ files: FLEET, head: "h1", runs, cfLive: { alpha: "1.1.0" } });
  await X.deployDriftCf(env(db), at(0), io);
  r = await X.deployDriftCf(env(db), at(50), io);
  ok((deploys(io).length === 0) === blocked && (r.blocked !== null) === blocked, label, { blocked: r.blocked, deploys: deploys(io) });
  if (blocked) ok(io.calls.live.length === 0 && db.st.table.alpha.state === "due" && db.st.table.alpha.drift_since === iso(0), "blocked: no live read, the drift clock keeps running", db.st.table.alpha);
}
db = makeDb({ wla: FLEET_WLA });
io = makeIo({ files: FLEET, head: "h1", runsHttp: 503, cfLive: { alpha: "1.1.0" } });
await X.deployDriftCf(env(db), at(0), io);
r = await X.deployDriftCf(env(db), at(50), io);
ok(deploys(io).join(",") === "alpha" && /runs unreadable/.test(r.notes.join(" ")), "an unreadable run list is noted and does not stop the second runner", r.notes);

// 5. Live ahead of main read from the live script: never deployed, and not read again for the same pair.
db = makeDb({ wla: FLEET_WLA });
io = makeIo({ files: FLEET, head: "h1", cfLive: { alpha: "1.3.0" } });
await X.deployDriftCf(env(db), at(0), io);
r = await X.deployDriftCf(env(db), at(50), io);
ok(deploys(io).length === 0 && db.st.table.alpha.state === "live-ahead" && db.st.table.alpha.synced_key === "1.2.0-new|1.1.0", "the live script ahead of main is never deployed", db.st.table.alpha);
r = await X.deployDriftCf(env(db), at(70), io);
ok(deploys(io).length === 0 && io.calls.live.length === 1 && db.st.table.alpha.state === "confirmed-sync", "the confirmed pair is not read or deployed again", { live: io.calls.live, state: db.st.table.alpha.state });

// 6. The off switch: nothing read, nothing deployed, an off event.
db = makeDb({ wla: FLEET_WLA, flag: "off" });
io = makeIo({ files: FLEET, head: "h1", cfLive: { alpha: "1.1.0" } });
r = await X.deployDriftCf(env(db), at(0), io);
r = await X.deployDriftCf(env(db), at(60), io);
ok(!r.on && io.calls.gh.length === 0 && io.calls.preflight === 0 && deploys(io).length === 0, "ops_config deploy_drift_cf = off: no read, no preflight, no deploy", io.calls);
ok(db.st.events.length === 2 && db.st.events.every((e) => e.status === "off") && db.st.armed === 0, "each off tick writes an off event and arms nothing");
db = makeDb({ wla: FLEET_WLA, flag: " OFF " });
r = await X.deployDriftCf(env(db), at(0), makeIo({ files: FLEET, head: "h1" }));
ok(!r.on, "the switch is read trimmed and case-insensitively");

// 7. At most two deploys a tick; the oldest drift goes first; the rest follow on the next tick.
const MANY = {}, MANY_WLA = [];
for (let i = 1; i <= 5; i++) { MANY["w" + i] = { "worker.js": wjs("1." + i + ".0"), "wrangler.toml": toml("w" + i) }; MANY_WLA.push(wla("w" + i, "1.0.0")); }
db = makeDb({ wla: MANY_WLA });
io = makeIo({ files: repo(MANY), head: "h2", cfLive: { w1: "1.0.0", w2: "1.0.0", w3: "1.0.0", w4: "1.0.0", w5: "1.0.0" } });
await X.deployDriftCf(env(db), at(0), io);
db.st.table.w4.drift_since = iso(-30); db.st.table.w5.drift_since = iso(-20);
r = await X.deployDriftCf(env(db), at(50), io);
ok(deploys(io).length === X.DDC_MAX_PER_TICK && deploys(io).join(",") === "w4,w5", "five due: two deploys, the oldest drift first", deploys(io));
ok(r.skipped.filter((s) => /per-tick cap 2/.test(s)).length === 3, "the other three wait for the cap", r.skipped);
r = await X.deployDriftCf(env(db), at(70), io);
ok(deploys(io).length === 4, "the next tick takes two more", deploys(io));

// 8. A refused route deploys nothing and the tick is a warning, not ok.
db = makeDb({ wla: FLEET_WLA });
io = makeIo({ files: FLEET, head: "h1", route: { status: 401, j: { error: "Unauthorized - set Bearer OPS_ROUTER_AUTH_KEY" } }, cfLive: { alpha: "1.1.0" } });
await X.deployDriftCf(env(db), at(0), io);
r = await X.deployDriftCf(env(db), at(50), io);
ok(deploys(io).length === 0 && /^refused/.test(r.route) && r.skipped.some((s) => /^alpha: route refused/.test(s)), "route refused: alpha is due but not deployed", r.skipped);
ok(lastEvent(db).status === "warn" && db.st.armed === 0 && io.calls.live.length === 0, "a refused route is a warn tick, arms nothing and reads no live script", lastEvent(db));

// 9. A failed deploy is an error, backs off for an hour, then retries; a held lock is not a failure.
db = makeDb({ wla: FLEET_WLA });
io = makeIo({ files: FLEET, head: "h1", cfLive: { alpha: "1.1.0" }, deployRes: () => ({ status: 502, j: { ok: false, error: "CF API 400: bad script" } }) });
await X.deployDriftCf(env(db), at(0), io);
r = await X.deployDriftCf(env(db), at(50), io);
ok(!r.ok && r.failed.length === 1 && lastEvent(db).status === "error" && /^deploy-failed/.test(db.st.table.alpha.last_action), "a failed deploy is recorded as an error", db.st.table.alpha.last_action);
r = await X.deployDriftCf(env(db), at(70), io);
ok(deploys(io).length === 1 && r.skipped.some((s) => /backoff/.test(s)), "20 minutes later: backoff, no second call", r.skipped);
r = await X.deployDriftCf(env(db), at(115), io);
ok(deploys(io).length === 2, "after the backoff the deploy is tried again", deploys(io));
db = makeDb({ wla: FLEET_WLA });
io = makeIo({ files: FLEET, head: "h1", cfLive: { alpha: "1.1.0" }, deployRes: () => ({ status: 502, j: { ok: false, error: "lock not acquired (fail-closed)" } }) });
await X.deployDriftCf(env(db), at(0), io);
r = await X.deployDriftCf(env(db), at(50), io);
ok(r.ok && r.failed.length === 0 && lastEvent(db).status === "ok" && !db.st.table.alpha.last_action, "a held deploy lock is another deployer at work, not a failure", r.skipped);

// 9b. The upload landed but the route's own live read lagged (502 with no error, deploy step ok): a deploy, not a failure.
db = makeDb({ wla: FLEET_WLA });
io = makeIo({ files: FLEET, head: "h1", cfLive: { alpha: "1.1.0" }, deployRes: () => ({ status: 502, j: { ok: false, worker: "alpha", live: "1.1.0", log: [{ step: "lock", acquired: true }, { step: "deploy", ok: true, error: null }, { step: "verify", live_version: "1.1.0" }] } }) });
await X.deployDriftCf(env(db), at(0), io);
r = await X.deployDriftCf(env(db), at(50), io);
ok(r.ok && r.deployed.length === 1 && r.failed.length === 0 && db.st.table.alpha.state === "deployed" && /live read showed 1\.1\.0/.test(db.st.table.alpha.last_action), "a lagging live read after a landed upload counts as deployed", db.st.table.alpha);
db = makeDb({ wla: FLEET_WLA });
io = makeIo({ files: FLEET, head: "h1", cfLive: { alpha: "1.1.0" }, deployRes: () => ({ status: 502, j: { ok: false, error: "CF API 400", log: [{ step: "deploy", ok: false, error: "CF API 400" }] } }) });
await X.deployDriftCf(env(db), at(0), io);
r = await X.deployDriftCf(env(db), at(50), io);
ok(r.failed.length === 1 && r.deployed.length === 0, "a refused upload stays a failure");

// 10. The drift clock follows D1: a newer deploy row that matches main ends the drift.
db = makeDb({ wla: FLEET_WLA });
io = makeIo({ files: FLEET, head: "h1", cfLive: { alpha: "1.1.0" } });
await X.deployDriftCf(env(db), at(0), io);
db.st.dh = [{ worker: "alpha", version: "1.2.0-new", ts: iso(10), action: "deploy" }];
r = await X.deployDriftCf(env(db), at(50), io);
ok(deploys(io).length === 0 && db.st.table.alpha.state === "sync" && db.st.table.alpha.drift_since === null, "the canonical path deployed it: sync, nothing to do", db.st.table.alpha);

// 11. A new main head re-reads only the changed blobs.
io.calls.gh.length = 0;
const NEXT = Object.assign({}, FLEET, { "beta/worker.js": wjs("2.1.0") });
io = makeIo({ files: NEXT, head: "h3", cfLive: {} });
r = await X.deployDriftCf(env(db), at(60), io);
const blobs = io.calls.gh.filter((p) => p.indexOf("/git/blobs/") === 0);
ok(blobs.length === 1 && db.st.table.beta.main_version === "2.1.0" && db.st.table.beta.state === "wait", "one changed worker.js: one blob read, beta drifts", { blobs, beta: db.st.table.beta });

// 12. The read budget: a large first scan finishes over several ticks and stores the head only when complete.
const BIG = {}, BIG_WLA = [];
for (let i = 0; i < 30; i++) { BIG["b" + i] = { "worker.js": wjs("1.0." + i), "wrangler.toml": toml("b" + i) }; BIG_WLA.push(wla("b" + i, "1.0." + i)); }
db = makeDb({ wla: BIG_WLA });
io = makeIo({ files: repo(BIG), head: "h4" });
r = await X.deployDriftCf(env(db), at(0), io);
ok(r.incomplete && r.reads === 40 && db.st.lws.head === "h4", "30 tomls and 10 worker.js in the first tick's 40 reads; the tree itself was complete", { reads: r.reads, head: db.st.lws.head });
r = await X.deployDriftCf(env(db), at(20), io);
ok(!r.incomplete && Object.values(db.st.table).every((x) => x.state === "sync"), "the second tick reads the rest: all 30 in sync", Object.values(db.st.table).map((x) => x.state));
db = makeDb({ wla: [] });
const BIGGER = {};
for (let i = 0; i < 45; i++) BIGGER["c" + i] = { "worker.js": wjs("1.0.0"), "wrangler.toml": toml("c" + i) };
io = makeIo({ files: repo(BIGGER), head: "h5" });
r = await X.deployDriftCf(env(db), at(0), io);
ok(r.incomplete && db.st.lws.head === undefined, "45 tomls exceed the budget: the head is not stored, so the next tick scans again", db.st.lws);
r = await X.deployDriftCf(env(db), at(20), io);
ok(db.st.lws.head === "h5" && Object.values(db.st.table).every((x) => /no live version/.test(x.state)), "the next tick finishes the scan", db.st.lws);

// 13. Wiring: the */20 tick, the binding with its caller props, the migration's probe component.
const tick = src.slice(src.indexOf('if (cron === "*/20 * * * *")'), src.indexOf('if (cron === "0 3 * * *")'));
ok(/deployDriftCf\(env\)\.catch/.test(tick), "deployDriftCf runs in the */20 block");
const wt = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
ok(/\[\[services\]\]\s*\nbinding = "SVC_QNFO_OPS"\nservice = "qnfo-ops"\nenvironment = "production"\nprops = \{ caller = "qnfo-fleet-control" \}/.test(wt), "wrangler.toml binds SVC_QNFO_OPS with props.caller");
const mig = readFileSync(new URL("../migrations/2026-10-13-16-deploy-drift-cf.sql", import.meta.url), "utf8");
ok(mig.indexOf("'" + X.DDC_PROBE_COMPONENT + "'") > 0 && /kind = ''deploy-drift-cf'' AND status = ''ok''/.test(mig), "the migration's probe row names the component the step arms and reads its ok ticks");
const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver[0] > 0 || ver[1] >= 26, "VERSION is at least 0.26.0", ver);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
