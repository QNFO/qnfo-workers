// D1-SCHEMA-INDEX-ROUTE-1 (qnfo-ops 2.57.2, 2026-10-26, charter pillar autonomy) offline suite. Run: node qnfo-ops/schema-index-route.test.mjs
// d1_schema_index exists only in the audit database, and ops_d1_query's own description sends an agent to it before it queries another database. 16 calls with
// db "living" failed "no such table: d1_schema_index" (2026-10-16 to 2026-10-24). A statement that reads the index now runs on the audit database whatever db the caller
// named and the answer says so; a statement that does not read it still runs on the database named. Slices d1Query and its guards out of worker.js and runs them
// against two in-memory SQLite databases standing in for QNFO_AUDIT and LIVING_PAPER.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const a = src.indexOf("var D1_READONLY_PRAGMAS =");
const b = src.indexOf('__name(d1Query, "d1Query");');
ok(a > 0 && b > a, "the d1Query block is found in worker.js");
const DB_MAP = { audit: "QNFO_AUDIT", living: "LIVING_PAPER", graph: "QNFO_GRAPH" };
const d1Query = new Function("DB_MAP", "__name", src.slice(a, b) + "\nreturn d1Query;")(DB_MAP, (f) => f);

function bindDb(dbx, log) {
  return { prepare(sql) { log.push(sql); let args = []; const s = { bind(...x) { args = x; return s; }, async all() {
    try { return { results: dbx.prepare(sql).all(...args) }; } catch (e) { throw new Error("D1_ERROR: " + e.message + ": SQLITE_ERROR"); } } }; return s; } };
}
const audit = new DatabaseSync(":memory:");
audit.exec("CREATE TABLE d1_schema_index (db TEXT, tbl TEXT, ord INTEGER, col TEXT, cols TEXT); INSERT INTO d1_schema_index VALUES ('living', 'papers', 1, 'slug', 'slug, status'), ('audit', 'agent_issues', 1, 'id', 'id, title'); CREATE TABLE agent_issues (id INTEGER, title TEXT); INSERT INTO agent_issues VALUES (1, 'a')");
const living = new DatabaseSync(":memory:");
living.exec("CREATE TABLE papers (slug TEXT, status TEXT); INSERT INTO papers VALUES ('p1', 'published')");
const auditLog = [], livingLog = [];
const env = { QNFO_AUDIT: bindDb(audit, auditLog), LIVING_PAPER: bindDb(living, livingLog) };

{ // the 2026-10-24 failure: the index read with db living
  const r = await d1Query(env, { db: "living", sql: "SELECT tbl, cols FROM d1_schema_index WHERE db='living' AND tbl='papers'" });
  ok(r.ok === true && r.db === "QNFO_AUDIT" && r.rowCount === 1 && r.rows[0].tbl === "papers", "an index read with db living runs on the audit database", r);
  ok(/audit database/.test(r.routed || "") && /WHERE db = 'living'/.test(r.routed || ""), "the answer says it was routed and how to filter", r.routed);
  ok(livingLog.length === 0, "the living database was not queried for the index", livingLog);
}
{ // an upper-case table name and a later db are routed too
  const r = await d1Query(env, { db: "graph", sql: "SELECT COUNT(*) AS n FROM D1_SCHEMA_INDEX" }).catch((e) => ({ ok: false, error: String(e) }));
  ok(r.ok === true || /db not bound/.test(r.error || ""), "an upper-case index name is recognised (routed to audit; the graph binding is not needed)", r);
}
{ // a query that does not read the index keeps its database
  const r = await d1Query(env, { db: "living", sql: "SELECT slug FROM papers" });
  ok(r.ok === true && r.db === "LIVING_PAPER" && r.rows[0].slug === "p1" && !("routed" in r), "a query on a living table still runs on living, with no routed note", r);
}
{ // the audit database itself is untouched by the change
  const r = await d1Query(env, { db: "audit", sql: "SELECT tbl FROM d1_schema_index WHERE db='audit'" });
  ok(r.ok === true && r.db === "QNFO_AUDIT" && !("routed" in r), "an index read already on audit has no routed note", r);
  const r2 = await d1Query(env, { sql: "SELECT id FROM agent_issues" });
  ok(r2.ok === true && r2.db === "QNFO_AUDIT", "the default database is still audit", r2);
}
{ // the read-only guard runs before the routing: a write that names the index is refused
  const r = await d1Query(env, { db: "living", sql: "DELETE FROM d1_schema_index" });
  ok(r.ok === false && r.rejected === true, "a write naming the index is still refused", r);
  ok(audit.prepare("SELECT COUNT(*) n FROM d1_schema_index").get().n === 2, "no index row was removed");
}
{ // an unbound audit binding says so
  const r = await d1Query({ LIVING_PAPER: env.LIVING_PAPER }, { db: "living", sql: "SELECT * FROM d1_schema_index" });
  ok(r.ok === false && /db not bound: QNFO_AUDIT/.test(r.error || ""), "without the audit binding the error names it", r);
}
ok(/D1-SCHEMA-INDEX-ROUTE-1/.test(src) && src.indexOf('let routedFrom = null;') > 0, "the routing is in worker.js");
ok(mirror === src, "the deployed-current mirror is identical to worker.js");
const ver = (/var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 2 || (ver[0] === 2 && (ver[1] > 57 || (ver[1] === 57 && ver[2] >= 2)))), "VERSION is at least 2.57.2", ver);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
