// OWNER-MORNING-1 (1.19.0): the owner's 60-second morning check. Drives the real worker for /api/changes against an
// in-memory SQLite D1 and checks the pure runway helper and the page wiring:
//   R. credit runway = balance / (30-day spend / 30), shown on the KPI and as a card under 7 days;
//   C. /api/changes lists deploys by worker, issues closed/opened, code-loop merges and new owner cards since a time,
//      clamped to 7 days, with titles cut to 90 characters;
//   H. the health pill is not green when the verdict is not OK; pageviews exclude the dashboard host and bots;
//   P. the page polls every 60 s and a public 'refresh' re-reads state younger than 10 minutes instead of re-measuring.
// Run: node qnfo-fleet-dashboard/owner-morning.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "" });
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

// R. runway helper, evaluated from source
const fn = src.slice(src.indexOf("function creditDailyBurn("), src.indexOf("async function humanView("));
const sb = { Math, Number, isFinite }; vm.createContext(sb); vm.runInContext(fn + "\n__r = creditRunwayDays;", sb);
const runway = sb.__r;
ok(runway({ balance: 17.04, spend30: 224.55 }) === 2, "R1 $17.04 at $224.55/30d is about 2 days", runway({ balance: 17.04, spend30: 224.55 }));
ok(runway({ balance: 300, spend30: 150 }) === 60, "R2 $300 at $5/day is 60 days");
ok(runway({ balance: null, spend30: 100 }) === null && runway({ balance: 10, spend30: 0 }) === null && runway({}) === null, "R3 no balance, no spend or no data gives no runway");
ok(runway({ balance: 0, spend30: 90 }) === 0, "R4 an empty balance is 0 days");
ok(runway({ balance: 17.04, spend30: 224.55, credit_burn7: 144.26 }) === 0, "R7 the 7-day third-party burn wins over the 30-day average ($144/7d leaves under a day)", runway({ balance: 17.04, spend30: 224.55, credit_burn7: 144.26 }));
ok(runway({ balance: 17.04, spend30: 224.55, credit_burn7: 0 }) === null, "R8 no third-party spend in 7 days means the credit is not draining: no runway, no card");
ok(runway({ balance: 17.04, spend30: 224.55, credit_burn7: 7 }) === 17, "R9 $1/day of third-party spend gives 17 days");
ok(runway({ balance: 17.02, spend30: 224.55, credit_burn7: 133.86, credit_burn24: 2.76 }) === 6, "R11 the last 24 h rate wins when read and non-zero ($2.76/day: 6 days, not 0)");
ok(runway({ balance: 17.02, credit_burn7: 133.86, credit_burn24: 0 }) === 0, "R12 a zero 24 h read falls back to the 7-day average");
ok(/provider \} \} \} \} \}'\);/.test(src) && /!== "workers-ai"\) t \+=/.test(src), "R10 the burn counts third-party providers only (Workers AI is billed to the account)");
ok(/runway != null && runway < CREDIT_RUNWAY_WARN_DAYS\) items\.unshift\(\{ key: "credit-runway"/.test(src) && /CREDIT_RUNWAY_WARN_DAYS = 7;/.test(src), "R5 a runway under 7 days becomes a queue card");
ok(/sev: runway < 3 \? "urgent" : "normal"/.test(src), "R6 under 3 days it is urgent");

// C. /api/changes on an in-memory audit DB
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE deployment_history (resource_type TEXT, resource_name TEXT, action TEXT, version_id TEXT, deployed_by TEXT, deployed_at TEXT, status TEXT, notes TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE code_tasks (id TEXT, path TEXT, pr_url TEXT, merged_at TEXT);
CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, status TEXT, created_at TEXT);`);
const ago = (h) => new Date(Date.now() - h * 36e5);
const sqlTs = (d) => d.toISOString().slice(0, 19).replace("T", " ");
const ins = (t, cols, vals) => db.prepare("INSERT INTO " + t + " (" + cols + ") VALUES (" + vals.map(() => "?").join(",") + ")").run(...vals);
ins("deployment_history", "resource_type,resource_name,version_id,deployed_at,status", ["worker", "qnfo-gateway", "3.8.3", sqlTs(ago(5)), "success"]);
ins("deployment_history", "resource_type,resource_name,version_id,deployed_at,status", ["worker", "qnfo-gateway", "3.8.4", sqlTs(ago(2)), "success"]);
ins("deployment_history", "resource_type,resource_name,version_id,deployed_at,status", ["worker", "idea-hub", "1.4.0", sqlTs(ago(3)), "success"]);
ins("deployment_history", "resource_type,resource_name,version_id,deployed_at,status", ["worker", "q08-signal-engine", "0.7.1", sqlTs(ago(30)), "success"]);
ins("deployment_history", "resource_type,resource_name,version_id,deployed_at,status", ["worker_route", "archive.qnfo.org", "r1", sqlTs(ago(1)), "success"]);
ins("deployment_history", "resource_type,resource_name,version_id,deployed_at,status", ["worker", "broken", "x", sqlTs(ago(1)), "failed"]);
ins("agent_issues", "title,status,created_at,updated_at", ["METRIC-TRIGGER-7-ASK: " + "x".repeat(120), "closed", ago(40).getTime(), ago(1).getTime()]);
ins("agent_issues", "title,status,created_at,updated_at", ["old closed", "closed", ago(100).getTime(), ago(50).getTime()]);
ins("agent_issues", "title,status,created_at,updated_at", ["new open", "open", ago(2).getTime(), ago(2).getTime()]);
ins("code_tasks", "id,path,pr_url,merged_at", ["ct1", "q08-signal-engine/worker.js", "https://github.com/QNFO/qnfo-workers/pull/476", ago(4).toISOString()]);
ins("code_tasks", "id,path,pr_url,merged_at", ["ct0", "old.js", null, ago(60).toISOString()]);
db.exec("ALTER TABLE code_tasks ADD COLUMN status TEXT; ALTER TABLE code_tasks ADD COLUMN updated_at TEXT;");
ins("code_tasks", "id,path,pr_url,merged_at,status,updated_at", ["ct2", "idea-hub/worker.js", "https://github.com/QNFO/qnfo-workers/pull/500", null, "merged", ago(3).toISOString()]);
ins("human_actions", "title,status,created_at", ["Decide something new", "open", sqlTs(ago(3))]);
ins("human_actions", "title,status,created_at", ["Already done", "done", sqlTs(ago(3))]);
const d1 = { prepare(sql0) { const order = []; const sql = sql0.replace(/\?(\d+)/g, (m, n) => { order.push(+n - 1); return "?"; }); let a = []; const st = { bind(...x) { a = order.length ? order.map((i) => x[i]) : x; return st; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async first() { return db.prepare(sql).get(...a) ?? null; }, async run() { return {}; } }; return st; } };
const env = { AUDIT: d1 };
const get = async (q) => { const r = await worker.fetch(new Request("https://fleet.qnfo.org/api/changes" + q), env, { waitUntil() {} }); return { status: r.status, j: await r.json() }; };
const a = await get("?since=" + encodeURIComponent(ago(24).toISOString()));
ok(a.status === 200 && a.j.schema_version === "fleet-changes/v1", "C1 /api/changes answers JSON", a);
ok(a.j.deploy_count === 2 && a.j.deploys[0].worker === "qnfo-gateway" && a.j.deploys[0].version === "3.8.4", "C2 deploys group by worker, newest version first; failed deploys and routes are not workers", a.j.deploys);
ok(a.j.issues_closed === 1 && a.j.issues_opened === 1, "C3 issues closed and opened inside the window only", a.j);
ok(a.j.closed_sample[0].length <= 91 && a.j.closed_sample[0].endsWith("…"), "C4 long titles are cut to 90 characters", a.j.closed_sample);
ok(a.j.code_merged.length === 2 && a.j.code_merged.some((c) => /pull\/476$/.test(c.pr)) && a.j.code_merged.some((c) => /pull\/500$/.test(c.pr)), "C5 code-loop merges in the window (merged_at, or status merged with a fresh updated_at), with the PR link", a.j.code_merged);
ok(a.j.owner_new.length === 1 && a.j.owner_new[0] === "Decide something new", "C6 only open owner cards created in the window", a.j.owner_new);
const b = await get("?since=2020-01-01T00:00:00Z");
ok(Date.now() - Date.parse(b.j.since) <= 7 * 864e5 + 5e3, "C7 the window is clamped to 7 days", b.j.since);
ok(b.j.deploy_count === 3, "C8 within 7 days the older deploy appears", b.j.deploy_count);
const c = await get("?since=not-a-date");
ok(Math.abs(Date.now() - 864e5 - Date.parse(c.j.since)) < 5e3, "C9 an unreadable since means the last 24 hours");
const d = await get("?since=" + encodeURIComponent(new Date(Date.now() + 864e5).toISOString()));
ok(Math.abs(Date.now() - 864e5 - Date.parse(d.j.since)) < 5e3, "C10 a future since means the last 24 hours");

// H + P. page wiring
ok(/String\(s\.verdict\)\.toUpperCase\(\) !== "OK" \? "unk" : "ok"/.test(src), "H1 a non-OK verdict never shows a green pill");
ok(/bot: 0 \}\) \{ count dimensions \{ date requestHost \}/.test(src) && /h !== "fleet\.qnfo\.org" && !\/\\\.workers\\\.dev\$\/\.test\(h\)/.test(src), "H2 pageviews are bot-filtered and exclude the dashboard's own hosts");
ok(/setInterval\(tick,60000\)/.test(src) && !/setInterval\(tick,10000\)/.test(src), "P1 the page polls every 60 s");
ok(/if \(!\(owner && owner\.authed\)\) \{\s*const cached = await currentState\(env, ctx, 10 \* 6e4\)/.test(src), "P2 a public refresh re-reads state younger than 10 minutes");
ok(/<section id="since"[^>]*hidden><\/section>/.test(src) && src.indexOf('id="since"') < src.indexOf('<div id="live">'), "P3 the changes strip sits outside the refreshed area");
ok(/CHANGES_JS = "<script>/.test(src) && /localStorage\.setItem\(K/.test(src) && /catch\(e\)\{\}/.test(src), "P4 the last visit is kept in the browser and storage errors are ignored");
ok(/tr\("Papers in the corpus", t\.papers\)/.test(src), "P5 the trend row says what it counts");
ok(/String\(i\.title\)\.replace\(\/\^Decide:\\s\*\/i, ""\)/.test(src), "P6 'suggest' no longer prints 'Decide: Decide:'");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
