// INHOUSE-PUBLISH-2 (#2137) offline suite. Runs the worker's own publishToZenodo against an in-memory SQLite D1 whose
// ops_config has the real key/value shape. Proves: with zenodo_enabled 0, missing, or ops_config unreadable, the paper is
// published in-house with no Zenodo call; only zenodo_enabled = '1' reaches the Zenodo path. The 0.10.0 fix queried a
// non-existent column and threw on every publish; this suite would have failed it.
// Run: node qnfo-research-exec/inhouse-publish.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const start = src.indexOf("async function publishToZenodo(");
let depth = 0, end = -1;
for (let i = src.indexOf("{", start); i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } } }
let zenodoCalls = 0;
const fn = new Function("zenodo", "buildProvenance", src.slice(start, end) + "\nreturn publishToZenodo;")(async () => { zenodoCalls++; return { _status: 403 }; }, () => ({ files: [] }));
const mk = (rows) => { const db = new DatabaseSync(":memory:"); db.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT)"); for (const [k, v] of rows) db.prepare("INSERT INTO ops_config (key, value) VALUES (?, ?)").run(k, v);
  return { prepare(sql) { let a = []; const st = { bind(...x) { a = x; return st; }, async first() { return db.prepare(sql).get(...a) ?? null; } }; return st; } }; };
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
let r = await fn({ QNFO_AUDIT: mk([["zenodo_enabled", "0"]]), ZENODO_TOKEN: "t" }, "T", "A", "body", "a-slug", {});
ok(r.ok === true && r.inhouse === true && r.doi === null && r.url === "https://papers.qnfo.org/papers/a-slug/" && zenodoCalls === 0, "zenodo_enabled 0 (key/value row): published in-house, no Zenodo call", r);
r = await fn({ QNFO_AUDIT: mk([]), ZENODO_TOKEN: "t" }, "T", "A", "body", "b", {});
ok(r.inhouse === true && zenodoCalls === 0, "no zenodo_enabled row: in-house (Zenodo off by default)", r);
r = await fn({ QNFO_AUDIT: { prepare() { throw new Error("no such table: ops_config"); } }, ZENODO_TOKEN: "t" }, "T", "A", "body", "c", {});
ok(r.inhouse === true && zenodoCalls === 0, "unreadable ops_config: in-house, never throws", r);
r = await fn({ QNFO_AUDIT: mk([["zenodo_enabled", "1"]]), ZENODO_TOKEN: "t" }, "T", "A", "body", "d", {});
ok(!r.inhouse && zenodoCalls === 1, "only zenodo_enabled = '1' reaches the Zenodo path", r);
// INHOUSE-PUBLISH-3: every caller binds pub.doi and pub.record (publishStageV2, publishStage, the first-deposit leg); D1 refuses
// undefined. The in-house result must carry each key the Zenodo result carries, with a bindable value.
r = await fn({ QNFO_AUDIT: mk([["zenodo_enabled", "0"]]), ZENODO_TOKEN: "t" }, "T", "A", "body", "e", {});
const keys = ["ok", "doi", "conceptdoi", "record"];
ok(keys.every((k) => k in r && r[k] !== undefined), "the in-house result defines ok, doi, conceptdoi and record (null, never undefined)", r);
// Only variables that receive publishToZenodo's result, read in the code that follows the call (3000 chars).
const binds = [];
for (const m of src.matchAll(/(?:const|var|let)\s+(\w+)\s*=\s*await publishToZenodo\(/g)) {
  const v = m[1], tail = src.slice(m.index, m.index + 3000);
  for (const b of tail.matchAll(/\.bind\(([^)]*)\)/g)) for (const x of b[1].matchAll(new RegExp("\\b" + v + "\\.([a-z]+)", "gi"))) binds.push(x[1]);
}
ok(binds.length >= 4 && binds.every((k) => keys.includes(k)), "every <result>.<field> a publishToZenodo caller binds is one the in-house result defines", [...new Set(binds)]);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
