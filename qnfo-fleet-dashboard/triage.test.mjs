// FLEET-TRIAGE-1 offline suite: GET /api/triage and GET /triage.
// Proves: (A) breaches group by root cause and the unmapped list names the breaching metric no cause maps; (B) recurring
// failure modes are listed; (C) a view that cannot be read is named in `blind` and its section is null, never an empty list;
// (D) the ETag/since contract works; (E) /api lists the route; (F) the guide page is HTML and carries no inline data.
// Run: node qnfo-fleet-dashboard/triage.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "" });

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL: " + m); } }

function mk(opts) {
  const o = opts || {};
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE metric_breach_cause (metric_key TEXT PRIMARY KEY, cause_key TEXT NOT NULL, note TEXT);
  CREATE TABLE breach_causes (cause_key TEXT PRIMARY KEY, title TEXT, plain TEXT, lever TEXT, doer TEXT, needs_owner INTEGER DEFAULT 0);
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT);
  CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY, metric_key TEXT, title TEXT, operator TEXT, threshold REAL, owner TEXT);
  CREATE VIEW v_metric_trigger_state AS SELECT t.id, t.metric_key, t.owner,
    CAST((SELECT last_value FROM metric_registry WHERE metric = t.metric_key) AS REAL) AS val,
    CASE WHEN CAST((SELECT last_value FROM metric_registry WHERE metric = t.metric_key) AS REAL) > t.threshold THEN 1 ELSE 0 END AS hit
    FROM analytics_metric_triggers t;
  CREATE VIEW v_breach_by_cause AS SELECT COALESCE(c.cause_key,'unmapped') AS cause_key, COALESCE(c.title,'Breach with no root cause recorded') AS title,
    COALESCE(c.plain,'p') AS plain, COALESCE(c.lever,'l') AS lever, COALESCE(c.doer,'qnfo-fleet-control') AS doer, COALESCE(c.needs_owner,0) AS needs_owner,
    COUNT(*) AS breaches, group_concat(s.metric_key || '=' || s.val, ', ') AS metrics
    FROM v_metric_trigger_state s LEFT JOIN metric_breach_cause m ON m.metric_key = s.metric_key LEFT JOIN breach_causes c ON c.cause_key = m.cause_key
    WHERE s.hit = 1 GROUP BY 1,2,3,4,5,6;`);
  if (!o.noFm) db.exec(`CREATE VIEW v_failure_mode_status AS SELECT 'a-key' AS fm_key, 'a mode recurred' AS failure_mode, 'fm-a' AS probe_class, '2026-10-28 10:00:00' AS last_probed, 'recurring' AS status
    UNION ALL SELECT 'b-key','absent mode','fm-b','2026-10-28 10:00:00','absent'`);
  db.exec(`INSERT INTO breach_causes VALUES ('spend','AI spend above the ceiling','plain','cheaper models','qnfo-ai',1);
  INSERT INTO analytics_metric_triggers VALUES (1,'cost',NULL,'gt',300,'x'),(2,'orphan_metric',NULL,'gt',0,'y'),(3,'fine',NULL,'gt',10,'z');
  INSERT INTO metric_registry VALUES ('cost','330'),('orphan_metric','4'),('fine','1');
  INSERT INTO metric_breach_cause VALUES ('cost','spend',NULL);`);
  const wrap = {
    prepare(sql) {
      const st = db.prepare(sql);
      const b = { bind() { return b; }, async all() { return { results: st.all() }; }, async first() { return st.get() || null; }, async run() { st.run(); return { success: true }; } };
      return b;
    },
  };
  return { AUDIT: wrap };
}
const ctx = { waitUntil() {}, passThroughOnException() {} };
const call = (env, path, init) => worker.fetch(new Request("https://fleet.qnfo.org" + path, init), env, ctx);

const env = mk();
const r = await call(env, "/api/triage");
ok(r.status === 200, "GET /api/triage answers 200, got " + r.status);
const d = await r.json();
ok(d.schema_version === "fleet-triage/v1", "schema_version");
ok(Array.isArray(d.by_cause) && d.by_cause.length === 2, "two causes: spend and unmapped");
const sp = (d.by_cause || []).find((c) => c.cause === "spend");
ok(sp && sp.breaches === 1 && sp.needs_owner === 1 && sp.metrics[0] === "cost=330.0", "spend row carries its metric");
ok(d.unmapped && d.unmapped.length === 1 && d.unmapped[0].metric === "orphan_metric", "unmapped names the metric no cause maps");
ok(d.recurring_failure_modes && d.recurring_failure_modes.length === 1 && d.recurring_failure_modes[0].key === "a-key", "only recurring modes listed");
ok(d.totals && d.totals.breaches === 2 && d.totals.unmapped === 1 && d.totals.recurring_failure_modes === 1, "totals");
ok(Array.isArray(d.blind) && d.blind.length === 0, "nothing blind when every view reads");

const etag = r.headers.get("etag");
ok(!!etag, "ETag issued");
const r304 = await call(env, "/api/triage", { headers: { "if-none-match": etag } });
ok(r304.status === 304, "If-None-Match answers 304, got " + r304.status);
const rs = await (await call(env, "/api/triage?since=" + d.revision)).json();
ok(rs.not_modified === true, "?since=<revision> answers not_modified");

const blindEnv = mk({ noFm: true });
const db2 = await (await call(blindEnv, "/api/triage")).json();
ok(db2.recurring_failure_modes === null, "an unreadable view leaves its section null, not []");
ok(db2.blind.some((b) => b.source === "v_failure_mode_status"), "the unreadable view is named in blind");
ok(db2.by_cause && db2.by_cause.length === 2, "the other sections still answer");

const idx = await (await call(env, "/api")).json();
const flat = JSON.stringify(idx);
ok(flat.includes("/api/triage"), "/api indexes /api/triage");

const pg = await call(env, "/triage");
const html = await pg.text();
ok(pg.status === 200 && (pg.headers.get("content-type") || "").includes("text/html"), "/triage is HTML");
ok(html.includes("/api/triage") && html.includes("textContent") && !html.includes("innerHTML"), "page fetches the JSON and writes with textContent only");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
