/**
 * live-check-grace.test.mjs -- offline regression lock for LIVE-CHECK-PROPAGATION-GRACE-1 (qnfo-fleet-control 0.40.3, issue 100256).
 *
 * Slices evLiveCheck and its grace constant out of worker.js and runs them against an in-memory SQLite D1 (node:sqlite, Node 22).
 * Proves: the 2026-10-19 case (a live audit 93 seconds after the deploy read http 200 with the previous version, and qnfo-gateway
 * 3.28.3 was declared failed and a revert PR opened) is "waiting" now and was "failed" before; the grace is 15 minutes from the deploy
 * and ends exactly there; a non-200 answer, a missing version and an audit before the deploy are not helped by it; a later deploy
 * that superseded the version still verifies; the new version verifies at once; both callers (evAdvance, cmAdvance) wait on "waiting"
 * before they reach the revert path; the VERSION is at least 0.40.3 and the mirror is identical.
 *
 * Output MUST contain "0 failed" on success.
 *
 *   node qnfo-fleet-control/live-check-grace.test.mjs
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const A = src.indexOf("var EV_PROPAGATION_GRACE_MIN = ");
const endTok = '__name(evLiveCheck, "evLiveCheck");';
const B = src.indexOf(endTok);
if (A < 0 || B < A) { console.error("FAIL evLiveCheck block not found in worker.js"); console.log("1 failed"); process.exit(1); }
const block = src.slice(A, B + endTok.length);
const ctx = vm.createContext({ Date, Number, String, Math, __name: (f) => f });
vm.runInContext(block + "\nthis.evLiveCheck = evLiveCheck; this.GRACE = EV_PROPAGATION_GRACE_MIN;", ctx);
const { evLiveCheck, GRACE } = ctx;
ok(GRACE === 15, "the grace is 15 minutes", GRACE);

// The function as it was in 0.40.2, kept here as the reference for what the 2026-10-19 audit produced.
const oldCtx = vm.createContext({ Date, Number, String, __name: (f) => f });
vm.runInContext(`async function evLiveCheck(env, worker, versionTo, sinceIso) {
  var la = await env.AUDIT.prepare("SELECT http, live_version, probed_at FROM worker_live_audit WHERE worker=?1").bind(worker).first();
  var since = Date.parse(sinceIso);
  var probedAfter = la && la.probed_at && Date.parse(String(la.probed_at).replace(" ", "T") + (/[zZ]$/.test(la.probed_at) ? "" : "Z")) > since;
  if (!probedAfter) return { state: "waiting", la: la };
  var mine = await env.AUDIT.prepare("SELECT MAX(id) id FROM fleet_deploys WHERE worker=?1 AND to_sha=?2 AND ok=1").bind(worker, versionTo).first();
  var later = mine && mine.id ? await env.AUDIT.prepare("SELECT COUNT(*) n FROM fleet_deploys WHERE worker=?1 AND ok=1 AND to_sha IS NOT NULL AND to_sha != ?2 AND id > ?3").bind(worker, versionTo, mine.id).first() : null;
  var superseded = !!(later && Number(later.n) > 0);
  return { state: la.http === 200 && (la.live_version === versionTo || superseded) ? "ok" : "failed", la: la, superseded: superseded };
}
this.evLiveCheck = evLiveCheck;`, oldCtx);

let db;
const envOf = () => ({ AUDIT: { prepare: (sql) => ({ bind: (...a) => ({ first: async () => db.prepare(sql.replace(/\?(\d+)/g, "?")).get(...a) ?? null }) }) } });
const fresh = () => { db = new DatabaseSync(":memory:"); db.exec("CREATE TABLE worker_live_audit (worker TEXT PRIMARY KEY, note TEXT, http INTEGER, live_version TEXT, probed_at TEXT); CREATE TABLE fleet_deploys (id INTEGER PRIMARY KEY AUTOINCREMENT, worker TEXT, to_sha TEXT, ok INTEGER, ts TEXT);"); };
const DEPLOYED = "2026-10-19T18:59:02.851Z", T0 = Date.parse(DEPLOYED);
const sql = (ms) => new Date(T0 + ms).toISOString().slice(0, 19).replace("T", " ");
const audit = (http, ver, afterMs) => { db.prepare("DELETE FROM worker_live_audit").run(); db.prepare("INSERT INTO worker_live_audit (worker, http, live_version, probed_at) VALUES ('qnfo-gateway', ?, ?, ?)").run(http, ver, sql(afterMs)); };
const NEW = "3.28.3-codeagent", OLD = "3.28.2-codeagent";
const check = (fn) => fn(envOf(), "qnfo-gateway", NEW, DEPLOYED);

fresh();
db.prepare("INSERT INTO fleet_deploys (worker, to_sha, ok, ts) VALUES ('qnfo-gateway', ?, 1, ?)").run(NEW, DEPLOYED);
let r = await check(evLiveCheck);
ok(r.state === "waiting", "no audit yet: waiting", r);
audit(200, OLD, -60e3);
r = await check(evLiveCheck);
ok(r.state === "waiting", "an audit taken before the deploy: waiting", r);

// 2026-10-19: audit 93 s after the deploy, http 200, the previous version.
audit(200, OLD, 93e3);
const was = await check(oldCtx.evLiveCheck);
r = await check(evLiveCheck);
ok(was.state === "failed", "0.40.2 declared that audit failed (the defect: a revert PR followed)", was);
ok(r.state === "waiting" && r.grace === true && r.la.live_version === OLD, "the same audit is waiting now", r);

audit(200, OLD, 14 * 60e3 + 58e3);
r = await check(evLiveCheck);
ok(r.state === "waiting", "just under 15 minutes after the deploy the previous version is still propagation (probed_at has one second resolution)", r);
audit(200, OLD, 15 * 60e3 + 1e3);
r = await check(evLiveCheck);
ok(r.state === "failed", "15 minutes and a second after the deploy the previous version is a failed deploy", r);
audit(200, OLD, 50 * 60e3);
r = await check(evLiveCheck);
ok(r.state === "failed" && r.la.live_version === OLD, "an hour-scale audit that still shows the previous version fails (a deploy that never took)", r);

// What the grace does not touch.
audit(200, NEW, 93e3);
r = await check(evLiveCheck);
ok(r.state === "ok" && !r.grace, "the new version verifies at once", r);
audit(500, OLD, 93e3);
r = await check(evLiveCheck);
ok(r.state === "failed", "a 500 right after the deploy is failed, not waiting", r);
audit(null, null, 93e3);
r = await check(evLiveCheck);
ok(r.state === "failed", "no http answer right after the deploy is failed", r);
audit(200, null, 93e3);
r = await check(evLiveCheck);
ok(r.state === "failed", "http 200 with no version is failed (the grace needs a version that is another one)", r);
audit(404, NEW, 93e3);
r = await check(evLiveCheck);
ok(r.state === "failed", "a 404 with the right version is failed", r);

// A later deploy superseded this version: verified, with the marker.
audit(200, "3.28.4-codeagent", 93e3);
db.prepare("INSERT INTO fleet_deploys (worker, to_sha, ok, ts) VALUES ('qnfo-gateway', '3.28.4-codeagent', 1, ?)").run(new Date(T0 + 60e3).toISOString());
r = await check(evLiveCheck);
ok(r.state === "ok" && r.superseded === true, "a later deploy that superseded the version verifies", r);

// Both callers wait on "waiting" before the revert path.
const ev = src.slice(src.indexOf("async function evAdvance("), src.indexOf('__name(evAdvance, "evAdvance");'));
const cm = src.slice(src.indexOf("async function cmAdvance("), src.indexOf('__name(cmAdvance, "cmAdvance");'));
ok(ev.indexOf('lc.state === "waiting"') > 0 && ev.indexOf('lc.state === "waiting"') < ev.indexOf("evRevert(env, c, "), "evAdvance returns on waiting before it can open a revert");
ok(cm.indexOf('lc.state === "waiting"') > 0 && cm.indexOf('lc.state === "waiting"') < cm.indexOf("cmRevert(env, cx, t, why)"), "cmAdvance returns on waiting before it can open a revert");

// VERSION and mirror.
const v = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(v && (Number(v[1]) > 0 || Number(v[2]) > 40 || (Number(v[2]) === 40 && Number(v[3]) >= 3)), "VERSION is at least 0.40.3", v && v[0]);
ok(readFileSync(join(here, "deployed-current.worker.js"), "utf8") === src, "deployed-current.worker.js is identical to worker.js");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
