// SCHEMA-ALTER-PROBE-1 offline suite (qnfo-ops 2.48.2, charter pillar: core; agent_issues 2562, failure mode ops-schema-alter-noise).
// Proves: ensureSchema reads the columns of ops_ai_log and llm_gateway_log first and runs an ALTER only for a missing column, so a
// new isolate whose tables already hold every column issues no ALTER (Workers telemetry records a failed D1 statement as an
// exception even when the code catches it); a missing column is still added; a failed column read falls back to the ALTERs.
// Run: node qnfo-ops/schema-alter-probe.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };

const a = src.indexOf("var schemaEnsured = false;"), b = src.indexOf("__name(ensureSchema, \"ensureSchema\");");
ok(a > 0 && b > a, "ensureSchema is present");
const make = () => new Function(src.slice(a, b) + "; return ensureSchema;")();

function fakeDb(cols, failRead) {
  const ran = [];
  return {
    ran,
    prepare(sql) {
      return {
        async run() { ran.push(sql); if (/^ALTER TABLE/.test(sql)) { const m = sql.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/); if (cols.includes(m[1] + "." + m[2])) throw new Error("D1_ERROR: duplicate column name: " + m[2]); } return {}; },
        async all() { ran.push(sql); if (failRead) throw new Error("D1_ERROR: read refused"); return { results: cols.map((x) => ({ t: x.split(".")[0], c: x.split(".")[1] })) }; },
      };
    },
  };
}
const all3 = ["ops_ai_log.upstream_model", "ops_ai_log.job_id", "llm_gateway_log.upstream_model"];
const origErr = console.error; const errs = []; console.error = (x) => errs.push(String(x));

let db = fakeDb(all3);
await make()({ QNFO_AUDIT: db });
ok(db.ran.filter((x) => /^ALTER/.test(x)).length === 0, "every column present: no ALTER runs", db.ran);
ok(db.ran.some((x) => /pragma_table_info/.test(x)), "the columns are read through pragma_table_info");

db = fakeDb(["ops_ai_log.upstream_model"]);
await make()({ QNFO_AUDIT: db });
const alters = db.ran.filter((x) => /^ALTER/.test(x));
ok(alters.length === 2 && alters.includes("ALTER TABLE ops_ai_log ADD COLUMN job_id TEXT") && alters.includes("ALTER TABLE llm_gateway_log ADD COLUMN upstream_model TEXT"), "only the missing columns are added", alters);

db = fakeDb(all3, true);
errs.length = 0;
await make()({ QNFO_AUDIT: db });
ok(db.ran.filter((x) => /^ALTER/.test(x)).length === 3, "a failed column read falls back to the three ALTERs");
ok(errs.some((x) => /ops:ensureSchema:columns/.test(x)) && !errs.some((x) => /duplicate column/.test(x)), "the failed read is logged; the expected duplicate-column answers are not", errs);
console.error = origErr;

ok(!/prepare\("ALTER TABLE " \+/.test(src.slice(a, b)), "the ALTER statements are literals, never assembled from strings");
const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 2 || (ver[0] === 2 && (ver[1] > 48 || (ver[1] === 48 && ver[2] >= 2)))), "VERSION is at least 2.48.2", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
