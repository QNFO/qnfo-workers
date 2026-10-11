// PROBE-TRANSPORTS-1 offline suite (qnfo-fleet-control 0.6.0, agent_issues 2059): remediationContractsTick runs contracts on
// d1-query, d1-query@portfolio-state and external-https, against node:sqlite and a stubbed fetch. Proves: the spec parser
// refuses anything but https GET/HEAD on the allowlist with a known check and an expected value; a fleet-host contract is
// left untouched (no request, no verdict, no schedule change: the off-Cloudflare executor of agent_issues 2060 owns it);
// expected comes from the probe and observed from the response; a pass closes the issue through the live trigger;
// redirects are observed, not followed; the portfolio transport reads env.PORTFOLIO; verification rows record the transport.
// Run: node --no-warnings qnfo-fleet-control/remediation-transports.test.mjs   -> prints "N failure(s)"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("var __RT_WRITE_KW"), b = src.indexOf('__name(rtReopenOnRelapse, "rtReopenOnRelapse");');
if (a < 0 || b < a) throw new Error("remediation block not found in worker.js");
let fails = 0, n = 0;
const check = (c, m) => { n++; if (!c) { fails++; console.log("FAIL " + m); } };

const wrap = (db) => {
  const stmt = (sql, args) => ({
    bind: (...x) => stmt(sql, x),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
    first: async () => db.prepare(sql).get(...args) || null,
    all: async () => ({ results: db.prepare(sql).all(...args) })
  });
  return { prepare: (sql) => stmt(sql, []) };
};
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER DEFAULT 3, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, next_due_at TEXT, attempts INTEGER DEFAULT 0);
  CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT, close_channel TEXT, updated_at INTEGER);
  CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, triage_state TEXT, owner TEXT, sla_due_at TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
  CREATE TRIGGER remediation_verification_autoclose_ins AFTER INSERT ON remediation_verifications WHEN NEW.pass = 1 BEGIN UPDATE agent_issues SET status='closed', close_channel='auto:verified-remediation-trigger' WHERE id = NEW.issue_id AND status = 'open'; END;`);
const pdb = new DatabaseSync(":memory:");
pdb.exec("CREATE TABLE program_registry (repo TEXT PRIMARY KEY, tier TEXT); INSERT INTO program_registry VALUES ('ignorance-audit', 'research');");

const calls = [];
const routes = {
  "https://raw.githubusercontent.com/QNFO/license/main/VERSION": { status: 200, body: "2.1\n" },
  "https://pypi.org/pypi/ignorance-audit/json": { status: 200, body: JSON.stringify({ info: { version: "0.1.0", name: "ignorance-audit" } }) },
  "https://doi.org/10.9999/ext.1": { status: 302, headers: { location: "https://example.org/records/1" } },
  "https://api.openalex.org/authors/A1": { status: 404, body: "{}" }
};
const fetchStub = async (url, init) => {
  calls.push({ url, init });
  const r = routes[url] || { status: 599, body: "" };
  const h = Object.fromEntries(Object.entries(r.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  return { status: r.status, headers: { get: (k) => h[String(k).toLowerCase()] ?? null }, text: async () => r.body || "" };
};
const ctx = vm.createContext({ VERSION: "test", __name: (f) => f, Date, Math, Number, String, JSON, Object, Array, console, URL, AbortController, setTimeout, clearTimeout, fetch: fetchStub });
const W = vm.runInContext(src.slice(a, b) + "\n;({ remediationContractsTick, rtHttpSpec, rtHttpObserve, rtHttpFleetHost, RT_TRANSPORTS });", ctx, { filename: "fleet-control#PROBE-TRANSPORTS-1" });

// 1. spec parser
const S = (o) => W.rtHttpSpec(typeof o === "string" ? o : JSON.stringify(o));
check(S({ url: "https://pypi.org/pypi/x/json", check: "json:info.version", expected: "1" }).ok, "an allowlisted GET with a json check parses");
check(!S("SELECT 1").ok && S("SELECT 1").why === "probe is not JSON", "a SQL probe is not an external-https spec");
check(S({ url: "http://pypi.org/x", expected: "200" }).why === "https only", "plain http is refused");
check(/host not allowed/.test(S({ url: "https://example.com/", expected: "200" }).why), "a host off the allowlist is refused");
check(/host not allowed/.test(S({ url: "https://pypi.org.evil.com/", expected: "200" }).why), "a suffix-spoofed host is refused");
check(S({ url: "https://files.pypi.org/x", expected: "200" }).ok, "a subdomain of an allowlisted host is allowed");
check(S({ url: "https://pypi.org/x", method: "POST", expected: "200" }).why === "GET or HEAD only", "POST is refused");
check(S({ url: "https://pypi.org/x", check: "eval:x", expected: "1" }).why === "unknown check", "an unknown check is refused");
check(S({ url: "https://pypi.org/x" }).why === "expected missing", "a spec without expected is refused (never invent expected)");
const fl = S({ url: "https://legal.qnfo.org/license", expected: "200" });
check(!fl.ok && fl.same === true, "a fleet host is flagged same-account");
check(W.rtHttpFleetHost(JSON.stringify({ url: "https://x.q08.workers.dev/health" })) && !W.rtHttpFleetHost(JSON.stringify({ url: "https://doi.org/x" })), "rtHttpFleetHost tells fleet hosts apart");
// 2. observe
const sp = (check) => ({ check });
check(W.rtHttpObserve(sp("status"), 302, () => null, "") === "302", "status check observes the status");
check(W.rtHttpObserve(sp("header:location"), 302, (k) => (k === "location" ? " https://z/1 " : null), "") === "https://z/1", "header check observes the trimmed header");
check(W.rtHttpObserve(sp("header:etag"), 200, () => null, "") === "(absent)", "a missing header observes (absent), never empty");
check(W.rtHttpObserve(sp("body-contains:QNFO-ULA"), 200, () => null, "the QNFO-ULA v2.1") === "present", "body-contains present");
check(W.rtHttpObserve(sp("json:info.version"), 200, () => null, '{"info":{"version":"0.1.0"}}') === "0.1.0", "json path observed");
check(W.rtHttpObserve(sp("json:info.missing.deep"), 200, () => null, '{"info":{}}') === "(absent)", "a missing json path observes (absent)");
check(W.rtHttpObserve(sp("json:a"), 200, () => null, "<html>") === "(not json)", "a non-JSON body observes (not json)");

// 3. the tick
const issues = [[1, "license"], [2, "pypi"], [3, "doi"], [4, "fleet host"], [5, "portfolio"], [6, "openalex"], [7, "bad spec"], [8, "sql"]];
for (const [id, t] of issues) db.prepare("INSERT INTO agent_issues (id, title, status) VALUES (?, ?, 'open')").run(id, t);
const add = (cls, issue, transport, probe) => db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h) VALUES (?, ?, ?, ?, 3, 24)").run(cls, issue, typeof probe === "string" ? probe : JSON.stringify(probe), transport);
add("lic", 1, "external-https", { url: "https://raw.githubusercontent.com/QNFO/license/main/VERSION", check: "body-contains:2.1", expected: "present" });
add("pypi", 2, "external-https", { url: "https://pypi.org/pypi/ignorance-audit/json", check: "json:info.version", expected: "0.2.0" });
add("doi", 3, "external-https", { url: "https://doi.org/10.9999/ext.1", method: "HEAD", check: "status", expected: "302" });
add("fleet", 4, "external-https", { url: "https://legal.qnfo.org/license", check: "status", expected: "200" });
add("port", 5, "d1-query@portfolio-state", "SELECT 'research' AS expected, (SELECT tier FROM program_registry WHERE repo = 'ignorance-audit') AS observed");
add("oa", 6, "external-https", { url: "https://api.openalex.org/authors/A1", check: "status", expected: "200" });
add("bad", 7, "external-https", { url: "https://example.com/", expected: "200" });
add("sql", 8, "d1-query", "SELECT 'ok' AS expected, 'ok' AS observed");
const out = await W.remediationContractsTick({ AUDIT: wrap(db), PORTFOLIO: wrap(pdb) });
const ver = (cls) => db.prepare("SELECT transport, expected, observed, pass, probe_url FROM remediation_verifications WHERE class = ?").all(cls);
const st = (id) => db.prepare("SELECT status FROM agent_issues WHERE id = ?").get(id).status;
const con = (cls) => db.prepare("SELECT last_verdict, next_due_at, attempts, status FROM remediation_contracts WHERE class = ?").get(cls);
check(ver("lic").length === 1 && ver("lic")[0].pass === 1 && ver("lic")[0].transport === "external-https" && st(1) === "closed", "a passing external-https probe records a pass with its transport and closes the issue");
check(ver("lic")[0].probe_url === "https://raw.githubusercontent.com/QNFO/license/main/VERSION", "the verification row names the URL it read");
check(ver("pypi")[0].pass === 0 && ver("pypi")[0].expected === "0.2.0" && ver("pypi")[0].observed === "0.1.0" && st(2) === "open", "expected from the probe, observed from the response; a mismatch fails and the issue stays open");
check(ver("doi")[0].pass === 1 && ver("doi")[0].observed === "302", "a redirect is observed as its status");
const doiCall = calls.find((c) => c.url.startsWith("https://doi.org/"));
check(doiCall && doiCall.init.redirect === "manual" && doiCall.init.method === "HEAD", "redirects are not followed; HEAD is sent as HEAD");
check(calls.every((c) => !c.init.headers || !Object.keys(c.init.headers).some((k) => /authorization|cookie|token/i.test(k))), "no credentials are sent");
check(!calls.some((c) => /qnfo\.org/.test(c.url)) && ver("fleet").length === 0, "a fleet-host contract is never requested and gets no verdict");
const cf = con("fleet");
check(cf.last_verdict === null && cf.next_due_at === null && cf.attempts === 0 && cf.status === "active", "a fleet-host contract's schedule and state are untouched (the off-Cloudflare executor owns it)");
check(ver("port").length === 1 && ver("port")[0].pass === 1 && ver("port")[0].transport === "d1-query@portfolio-state" && st(5) === "closed", "d1-query@portfolio-state reads env.PORTFOLIO and records its transport");
check(ver("oa")[0].pass === 0 && ver("oa")[0].observed === "404", "a 404 is observed and fails");
check(ver("bad").length === 0 && con("bad").last_verdict === "probe-not-machine-executable", "a refused spec gets a verdict and no verification row");
check(ver("sql")[0].transport === "d1-query" && ver("sql")[0].probe_url === "d1:remediation_contracts/sql" && st(8) === "closed", "d1-query is unchanged");
check(out.pass === 4 && out.fail === 2, "the tick counts 4 passes and 2 fails (" + out.pass + "/" + out.fail + ")");
// 4. no PORTFOLIO binding -> verdict, no row
db.exec("INSERT INTO agent_issues (id, title, status) VALUES (9, 'unbound', 'open')");
add("port2", 9, "d1-query@portfolio-state", "SELECT 'x' AS expected, 'x' AS observed");
await W.remediationContractsTick({ AUDIT: wrap(db) });
check(ver("port2").length === 0 && con("port2").last_verdict === "probe-db-unbound", "an unbound portfolio DB yields probe-db-unbound, not a pass");
check(W.RT_TRANSPORTS.join(",") === "d1-query,d1-query@portfolio-state,external-https", "the transport list");
console.log(n + " checks, " + fails + " failure(s)");
if (fails) process.exit(1);
