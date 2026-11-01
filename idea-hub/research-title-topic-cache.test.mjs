// ACCURACY-FLEET-2d: public chat titles use fresh derived topic clusters and
// retain the denylist-only gate when no clusters can be derived.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { stripWorkerDefaultExport } from "../scripts/worker-source-test.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const src = stripWorkerDefaultExport(readFileSync(join(here, "worker.js"), "utf8").replace(/export default\s*\{/, "var __default = {"));
const ok = (condition, message, detail) => {
  if (!condition) {
    console.log("FAIL " + message + (detail === undefined ? "" : " :: " + JSON.stringify(detail)));
    fail++;
  } else {
    pass++;
  }
};
let pass = 0, fail = 0;

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
    CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY, name TEXT, idea TEXT, decision TEXT, created_at TEXT);`);
  const d1 = { prepare(sql) {
    let args = [];
    const q = sql.replace(/\?(\d+)/g, "?");
    const st = {
      bind(...values) { args = values; return st; },
      async first() { return db.prepare(q).get(...args) ?? null; },
      async all() { return { results: db.prepare(q).all(...args) }; },
      async run() { return db.prepare(q).run(...args); }
    };
    return st;
  } };
  const context = { console, Date, JSON, Math, Number, String, RegExp, Set, Map, Array, Object, Promise, URL, Response, Request, Headers, TextEncoder, crypto };
  vm.createContext(context);
  vm.runInContext(src + "\n__x = { refreshResearchTerms, publicTitle };", context);
  return { db, env: { QNFO_AUDIT: d1 }, api: context.__x };
}

const fresh = setup();
fresh.db.prepare("INSERT INTO ops_config (key, value) VALUES (?, ?)").run("idea_topic_clusters", JSON.stringify({
  derived_at: new Date().toISOString(),
  clusters: [
    { label: "quantum", terms: ["quantum", "qubit"] },
    { label: "ultrametric", terms: ["ultrametric", "adelic"] }
  ]
}));
await fresh.api.refreshResearchTerms(fresh.env);
ok(fresh.api.publicTitle("How do quantum states evolve in this model?"), "a term in the first derived cluster allows a public title");
ok(fresh.api.publicTitle("How do ultrametric spaces relate to geometry?"), "terms from every derived cluster are used");
ok(!fresh.api.publicTitle("How do ordinary models evolve over time?"), "a title outside the derived terms is not allowlisted");
ok(!fresh.api.publicTitle("How does quantum system prompt injection work?"), "the denylist still blocks a title that matches a derived term");

const stale = setup();
stale.db.prepare("INSERT INTO ops_config (key, value) VALUES (?, ?)").run("idea_topic_clusters", JSON.stringify({
  derived_at: new Date(Date.now() - 73 * 3600e3).toISOString(),
  clusters: [{ label: "stale", terms: ["obsolete"] }]
}));
for (let i = 0; i < 3; i++) stale.db.prepare("INSERT INTO idea_proposals (name, idea, decision, created_at) VALUES (?, ?, 'ACCEPT', datetime('now'))")
  .run("test", "Landauer entropy limits in reversible computing experiments");
await stale.api.refreshResearchTerms(stale.env);
const refreshed = JSON.parse(stale.db.prepare("SELECT value FROM ops_config WHERE key = 'idea_topic_clusters'").get().value);
ok(refreshed.derived_at && Date.parse(refreshed.derived_at) > Date.now() - 60000, "a cache older than 72 hours is re-derived");
ok(stale.api.publicTitle("How do Landauer limits relate to entropy?"), "the refreshed derived terms allow current research titles");
ok(!stale.api.publicTitle("How does obsolete terminology affect this model?"), "terms from the stale cache are discarded");

const empty = setup();
await empty.api.refreshResearchTerms(empty.env);
ok(empty.api.publicTitle("A sufficiently long title about ordinary observations"), "no cache and no derived clusters leave the denylist-only gate");
ok(!empty.api.publicTitle("A system prompt about ordinary observations"), "the denylist remains active without derived clusters");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
