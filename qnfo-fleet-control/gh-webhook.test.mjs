// GH-WEBHOOK-INTAKE-1 and GH-APP-FLEET-2 (qnfo-fleet-control 0.44.0) offline suite. POST /gh/webhook: HMAC signature check against GH_WEBHOOK_SECRET (the real SHA-256 digest of node:crypto),
// classification of pull_request, check_suite and push, one row per delivery (a redelivery is a no-op), the merge lane run at once for a decidable pull request and debounced, 503 with
// nothing accepted while the secret is unset. POST /gh-app/token: answers only a service binding whose props.caller is a listed fleet worker, never a public host, never the personal token,
// and records no token text. The handlers are sliced from worker.js and run against a real SQLite table, so what is tested is the shipped code.
// Run: node qnfo-fleet-control/gh-webhook.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createHmac, webcrypto } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { versionAtLeast } from "../scripts/version-at-least.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let fails = 0;
const check = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); if (!c) fails++; };
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); check(i > 0 && j > i, "slice " + a.slice(0, 40) + " is present"); return src.slice(i, j); };

const pure1 = cut("// ---- GH-WEBHOOK-INTAKE-1:BEGIN", "// ---- GH-WEBHOOK-INTAKE-1:END");
const pure2 = cut("// ---- GH-APP-FLEET-2:BEGIN", "// ---- GH-APP-FLEET-2:END");
const handleSrc = cut("async function ghWebhookHandle(", "async function ghWebhookStatus(");
const statusSrc = cut("async function ghWebhookStatus(", "// ---- GH-APP-FLEET-2:BEGIN");
const brokerSrc = cut("async function ghAppBrokerHandle(", '__name(ghAppBrokerHandle, "ghAppBrokerHandle");');

// ---- real database, D1-shaped statements ----
function mkDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT)");
  const prepare = (sql) => {
    let args = [];
    const q = sql.replace(/\?(\d+)/g, "?");
    const self = {
      bind(...a) { args = a; return self; },
      async all() { return { results: db.prepare(q).all(...args) }; },
      async first() { return db.prepare(q).get(...args) || null; },
      async run() { const r = db.prepare(q).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
    };
    return self;
  };
  return { db, AUDIT: { prepare } };
}
const lane = [];
class FakeResponse { constructor(b, i) { this.body = b; this.status = (i && i.status) || 200; this.headers = (i && i.headers) || {}; } }
function sandboxWith(extra) {
  const sb = Object.assign({
    crypto: webcrypto, TextEncoder, Uint8Array, JSON, String, Math, Number, Date, Promise, URL, Array, console,
    __name: () => {}, VERSION: "0.44.0-test", EVOLVE_REPO: "QNFO/qnfo-workers",
    json: (d, s) => ({ body: d, status: s || 200 }),
    Response: FakeResponse,
    branchHygieneTick: async (env, o) => { lane.push(o); return { ok: true }; },
    ghAppCache: { state: "ok", why: null, exp: Date.parse("2026-10-20T07:00:00Z") },
    ghAppToken: async () => "ghs_FAKE_INSTALLATION_TOKEN",
  }, extra || {});
  vm.createContext(sb);
  vm.runInContext(pure1 + "\n" + pure2 + "\n" + handleSrc + "\n" + statusSrc + "\n" + brokerSrc + "\n__export = { ghWebhookSign, ghWebhookVerify, ghWebhookEqual, ghWebhookClassify, ghWebhookHandle, ghWebhookStatus, ghAppBrokerCaller, ghAppBrokerHandle, GH_APP_BROKER_CALLERS, GH_WEBHOOK_EVENTS };", sb);
  return sb.__export;
}
const X = sandboxWith();

// ---- signature ----
const SECRET = "test-webhook-secret-not-real";
const bodyText = JSON.stringify({ zen: "x", hook_id: 1, repository: { full_name: "QNFO/qnfo-workers" } });
const expected = "sha256=" + createHmac("sha256", SECRET).update(bodyText).digest("hex");
check(await X.ghWebhookSign(SECRET, bodyText) === expected, "the signature is the HMAC-SHA256 hex digest GitHub sends (matches node:crypto)");
check(await X.ghWebhookVerify(SECRET, bodyText, expected) === true, "a correct signature verifies");
check(await X.ghWebhookVerify(SECRET, bodyText + " ", expected) === false, "a changed body fails");
check(await X.ghWebhookVerify("other", bodyText, expected) === false, "another secret fails");
check(await X.ghWebhookVerify(SECRET, bodyText, "") === false && await X.ghWebhookVerify(SECRET, bodyText, "sha1=abc") === false && await X.ghWebhookVerify("", bodyText, expected) === false, "an empty or sha1 header and an empty secret fail");
check(X.ghWebhookEqual("abc", "abc") && !X.ghWebhookEqual("abc", "abd") && !X.ghWebhookEqual("abc", "abcd"), "the comparison reads every character and the length");

// ---- classification ----
const csOk = { action: "completed", check_suite: { conclusion: "success", head_sha: "a".repeat(40), pull_requests: [{ number: 3211 }] }, repository: { full_name: "QNFO/qnfo-workers" } };
let c = X.ghWebhookClassify("check_suite", csOk);
check(c && c.lane === true && c.pr === 3211 && c.conclusion === "success", "a completed successful check_suite on a pull request runs the lane", c);
c = X.ghWebhookClassify("check_suite", { action: "completed", check_suite: { conclusion: "failure", head_sha: "b".repeat(40), pull_requests: [{ number: 5 }] } });
check(c && c.lane === false, "a failed check_suite is recorded and does not run the lane");
c = X.ghWebhookClassify("check_suite", { action: "completed", check_suite: { conclusion: "success", head_sha: "c".repeat(40), pull_requests: [] } });
check(c && c.lane === false && /no pull request/.test(c.summary), "a check_suite on a branch without a pull request does not run the lane");
check(X.ghWebhookClassify("check_suite", { action: "requested", check_suite: { head_sha: "d".repeat(40), pull_requests: [{ number: 5 }] } }).lane === false, "a requested check_suite does not");
for (const [a, laneRun] of [["opened", true], ["reopened", true], ["ready_for_review", true], ["synchronize", false], ["closed", false], ["edited", false]]) {
  const r = X.ghWebhookClassify("pull_request", { action: a, number: 77, pull_request: { number: 77, head: { sha: "e".repeat(40), ref: "codeagent-xyz" } } });
  check(r && r.lane === laneRun && r.pr === 77, "pull_request " + a + " lane=" + laneRun, r);
}
c = X.ghWebhookClassify("push", { ref: "refs/heads/main", after: "f".repeat(40), commits: [{}, {}] });
check(c && c.lane === false && /2 commits/.test(c.summary), "a push is recorded and never runs the lane (main moves every few seconds)", c);
check(X.ghWebhookClassify("issues", {}) === null && X.ghWebhookClassify("star", {}) === null, "other events are not taken");

// ---- the handler over a real table ----
const req = (body, headers) => ({ headers: { get: (k) => (headers || {})[k] ?? (headers || {})[k.toLowerCase()] ?? null }, text: async () => body });
const signed = (obj, ev, delivery, secret) => { const t = JSON.stringify(obj); return req(t, { "X-Hub-Signature-256": "sha256=" + createHmac("sha256", secret || SECRET).update(t).digest("hex"), "X-GitHub-Event": ev, "X-GitHub-Delivery": delivery }); };
const waits = [];
const ctx = { waitUntil: (p) => { waits.push(p); } };

{
  const { db, AUDIT } = mkDb();
  let r = await X.ghWebhookHandle(signed(csOk, "check_suite", "d-1"), { AUDIT }, ctx);
  check(r.status === 503 && /not configured/.test(r.body.error) && db.prepare("SELECT COUNT(*) n FROM cloud_ops_events").get().n === 0, "without GH_WEBHOOK_SECRET: 503 and nothing recorded", r);
  const env = { AUDIT, GH_WEBHOOK_SECRET: SECRET };
  r = await X.ghWebhookHandle(signed(csOk, "check_suite", "d-1", "wrong-secret"), env, ctx);
  check(r.status === 401 && db.prepare("SELECT COUNT(*) n FROM cloud_ops_events").get().n === 0 && lane.length === 0, "a bad signature: 401, no row, no lane run", r);
  r = await X.ghWebhookHandle(req(bodyText, { "X-GitHub-Event": "ping" }), env, ctx);
  check(r.status === 401, "an unsigned request: 401");
  r = await X.ghWebhookHandle(signed(csOk, "check_suite", "d-1"), env, ctx);
  await Promise.all(waits);
  const row = db.prepare("SELECT * FROM cloud_ops_events WHERE id = 'gh-webhook-d-1'").get();
  check(r.status === 200 && r.body.recorded === true && r.body.lane === true && r.body.pr === 3211, "a signed successful check_suite: 200, recorded, lane run", r);
  check(row && row.kind === "gh-webhook" && row.status === "lane-run" && row.job === "qnfo-fleet-control" && /GH-WEBHOOK-INTAKE-1: check_suite completed success/.test(row.text) && JSON.parse(row.meta).delivery === "d-1", "the row: kind gh-webhook, id gh-webhook-<delivery>, status lane-run", row);
  check(lane.length === 1 && lane[0].laneOnly === true, "the merge lane ran once, lane-only", lane);
  r = await X.ghWebhookHandle(signed(csOk, "check_suite", "d-1"), env, ctx);
  await Promise.all(waits);
  check(r.body.duplicate === true && db.prepare("SELECT COUNT(*) n FROM cloud_ops_events").get().n === 1 && lane.length === 1, "a redelivery of the same delivery id is a no-op (no second row, no second lane run)", r);
  r = await X.ghWebhookHandle(signed(csOk, "check_suite", "d-2"), env, ctx);
  await Promise.all(waits);
  const row2 = db.prepare("SELECT status FROM cloud_ops_events WHERE id = 'gh-webhook-d-2'").get();
  check(r.body.recorded === true && r.body.lane === false && row2.status === "ok" && lane.length === 1, "a second decidable event inside 60 seconds is recorded with status ok and does not run the lane again (debounce)", { r, row2, lane: lane.length });
  db.prepare("UPDATE cloud_ops_events SET ts = ? WHERE id = 'gh-webhook-d-1'").run(new Date(Date.now() - 61000).toISOString());
  r = await X.ghWebhookHandle(signed(csOk, "check_suite", "d-3"), env, ctx);
  await Promise.all(waits);
  check(r.body.lane === true && lane.length === 2, "61 seconds later the lane runs again");
  r = await X.ghWebhookHandle(signed({ ref: "refs/heads/main", after: "9".repeat(40), commits: [{}], repository: { full_name: "QNFO/qnfo-workers" } }, "push", "d-4"), env, ctx);
  check(r.body.recorded === true && r.body.lane === false && lane.length === 2, "a push is recorded and runs no lane");
  r = await X.ghWebhookHandle(signed({ zen: "x", hook_id: 9, repository: { full_name: "QNFO/qnfo-workers" } }, "ping", "d-5"), env, ctx);
  check(r.status === 200 && r.body.pong === true && db.prepare("SELECT kind FROM cloud_ops_events WHERE id = 'gh-webhook-d-5'").get().kind === "ping", "a ping answers pong and is recorded as kind ping (not gh-webhook, so it cannot satisfy the live probe)");
  r = await X.ghWebhookHandle(signed({ action: "opened", number: 1, pull_request: { number: 1, head: {} }, repository: { full_name: "someone/else" } }, "pull_request", "d-6"), env, ctx);
  check(r.status === 202 && /not QNFO\/qnfo-workers/.test(r.body.ignored) && !db.prepare("SELECT 1 FROM cloud_ops_events WHERE id = 'gh-webhook-d-6'").get(), "another repository is ignored and not recorded", r);
  r = await X.ghWebhookHandle(signed({ repository: { full_name: "QNFO/qnfo-workers" } }, "issues", "d-7"), env, ctx);
  check(r.status === 202 && /not taken/.test(r.body.ignored), "an event the route does not take is answered 202", r);
  const bad = req("not json", { "X-Hub-Signature-256": "sha256=" + createHmac("sha256", SECRET).update("not json").digest("hex"), "X-GitHub-Event": "push" });
  r = await X.ghWebhookHandle(bad, env, ctx);
  check(r.status === 400, "a signed body that is not JSON is 400");
  r = await X.ghWebhookHandle({ headers: { get: (k) => (k === "Content-Length" ? "9000000" : null) }, text: async () => "" }, env, ctx);
  check(r.status === 413, "a declared body over 5 MB is 413 before it is read");
  const st = await X.ghWebhookStatus(env);
  check(st.ok && st.route === "gh-webhook-intake" && st.configured === true && st.last && /push|check_suite/.test(st.last.text) && st.events.join() === "pull_request,check_suite,push", "GET status: route, configured, the last delivery", st);
  check((await X.ghWebhookStatus({ AUDIT })).configured === false, "GET status reports configured=false while the secret is unset");
}

// ---- the broker ----
{
  const { db, AUDIT } = mkDb();
  const env = { AUDIT };
  const mkreq = (host) => ({ url: "https://" + host + "/gh-app/token" });
  let r = await X.ghAppBrokerHandle(mkreq("qnfo-fleet-control.internal"), env, { props: { caller: "qnfo-ops" } });
  const jb = typeof r.body === "string" ? JSON.parse(r.body) : r.body;
  check(r.status === 200 && jb.ok && jb.token === "ghs_FAKE_INSTALLATION_TOKEN" && jb.caller === "qnfo-ops" && jb.expires_at === "2026-10-20T07:00:00.000Z" && r.headers["Cache-Control"] === "no-store", "a listed caller through a service binding gets the installation token, no-store", { status: r.status, headers: r.headers });
  const row = db.prepare("SELECT * FROM cloud_ops_events WHERE kind = 'gh-app-broker'").get();
  check(row && /qnfo-ops/.test(row.text) && !/ghs_/.test(row.text + row.meta + row.id), "the audit row names the caller and carries no token text", row);
  await X.ghAppBrokerHandle(mkreq("qnfo-fleet-control.internal"), env, { props: { caller: "qnfo-ops" } });
  check(db.prepare("SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'gh-app-broker'").get().n === 1, "one audit row per caller and hour");
  r = await X.ghAppBrokerHandle(mkreq("qnfo-fleet-control.q08.workers.dev"), env, { props: { caller: "qnfo-ops" } });
  check(r.status === 403, "a request on a public host is refused even with props");
  r = await X.ghAppBrokerHandle(mkreq("qnfo-fleet-control.internal"), env, {});
  check(r.status === 403, "no props: refused");
  r = await X.ghAppBrokerHandle(mkreq("qnfo-fleet-control.internal"), env, { props: { caller: "qnfo-evil" } });
  check(r.status === 403, "a caller not on the list: refused");
  r = await X.ghAppBrokerHandle(mkreq("qnfo-fleet-control.internal"), env, { props: { caller: ["qnfo-ops"] } });
  check(r.status === 403, "a non-string caller: refused");
  const X2 = sandboxWith({ ghAppToken: async () => null, ghAppCache: { state: "missing", why: "GH_APP_PRIVATE_KEY, GH_APP_ID or GH_APP_INSTALLATION_ID is not set", exp: 0 } });
  r = await X2.ghAppBrokerHandle(mkreq("qnfo-fleet-control.internal"), env, { props: { caller: "qnfo-ops" } });
  check(r.status === 503 && r.body.ok === false && r.body.state === "missing" && !("token" in r.body), "no App token: 503 with the state, and no token (the personal token is never served)", r);
  check(X.GH_APP_BROKER_CALLERS.length === 13 && ["qnfo-ops", "qnfo-code-orchestrator", "qnfo-cloud-ops"].every((w) => X.GH_APP_BROKER_CALLERS.includes(w)), "the list is the 13 workers of issue 2596, qnfo-ops, qnfo-code-orchestrator and qnfo-cloud-ops among them", X.GH_APP_BROKER_CALLERS);
  check(!src.slice(src.indexOf("async function ghAppBrokerHandle("), src.indexOf('__name(ghAppBrokerHandle, "ghAppBrokerHandle");')).match(/console\.(log|error)\([^)]*\bt\b[^)]*\)/), "the broker never logs the token variable");
}

// ---- wiring ----
check(/p === "\/gh\/webhook" && request\.method === "POST"\) return ghWebhookHandle\(request, env, ctx\)/.test(src), "POST /gh/webhook is routed");
check(/p === "\/gh\/webhook" && request\.method === "GET"\) return json\(await ghWebhookStatus\(env\)\)/.test(src), "GET /gh/webhook is the open status read");
check(/p === "\/gh-app\/token" && request\.method === "POST"\) return ghAppBrokerHandle\(request, env, ctx\)/.test(src), "POST /gh-app/token is routed");
check(/broker: "service-binding", broker_callers: GH_APP_BROKER_CALLERS\.length/.test(src), "GET /gh-app reports the broker (the runtime probe marker)");
const ver = /var VERSION = "([^"]+)"/.exec(src)[1];
check(versionAtLeast(ver, "0.44.0"), "VERSION is at least 0.44.0 (two new routes raise the minor)", ver);
const mirror = readFileSync(join(here, "deployed-current.worker.js"), "utf8");
check(mirror === src, "deployed-current.worker.js is identical to worker.js");
check(!/claude\.ai|anthropic\.com/i.test(pure1 + pure2 + handleSrc + brokerSrc), "no claude.ai link in the new code");
console.log(fails ? fails + " FAILED" : "gh-webhook: all assertions passed");
process.exit(fails ? 1 : 0);
