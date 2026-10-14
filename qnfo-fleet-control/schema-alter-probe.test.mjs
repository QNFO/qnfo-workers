// SCHEMA-ALTER-PROBE-1 offline suite (qnfo-fleet-control 0.31.0, charter pillar: core; agent_issues 2562).
// Proves: evSchema and cfcSchema read their table's columns (PRAGMA table_info) before an ALTER and add only a missing column, so an
// hourly tick whose tables hold every column issues no ALTER (Workers telemetry recorded each caught "duplicate column" ALTER as an
// exception, 14 a tick); a missing column is still added; an unreadable table keeps the old path and logs the read failure.
// Run: node qnfo-fleet-control/schema-alter-probe.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };
const fn = (name) => { const a = src.indexOf("async function " + name + "(env) {"); const b = src.indexOf("\n}\n", a); return src.slice(a, b + 2); };
const ev = new Function(fn("evSchema") + "; return evSchema;")(), cfc = new Function(fn("cfcSchema") + "; return cfcSchema;")();
const EV_COLS = ["id", "worker", "ts", "status", "proposal", "sha256", "deployed_at", "kind", "issue_id", "pr_number", "branch", "head_sha", "merged_sha", "version_from", "version_to", "path", "note", "updated_at", "parent_id"];
function db(tables, failRead) {
  const ran = [];
  return { ran, AUDIT: { prepare(sql) { return {
    async run() { ran.push(sql); const m = sql.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/); if (m && (tables[m[1]] || []).includes(m[2])) throw new Error("D1_ERROR: duplicate column name: " + m[2]); return {}; },
    async all() { ran.push(sql); const m = sql.match(/PRAGMA table_info\((\w+)\)/); if (failRead) throw new Error("D1_ERROR: refused"); return { results: (tables[m[1]] || []).map((n) => ({ name: n })) }; },
  }; } } };
}
const errs = []; const orig = console.error; console.error = (x) => errs.push(String(x));
let d = db({ evolve_candidates: EV_COLS, cf_changelog_items: ["guid", "excerpt"] });
await ev(d); await cfc(d);
ok(d.ran.filter((x) => /^ALTER/.test(x)).length === 0, "every column present: neither function issues an ALTER", d.ran.filter((x) => /^ALTER/.test(x)));
d = db({ evolve_candidates: EV_COLS.filter((c) => c !== "parent_id"), cf_changelog_items: ["guid"] });
await ev(d); await cfc(d);
const al = d.ran.filter((x) => /^ALTER/.test(x));
ok(al.length === 2 && al.includes("ALTER TABLE evolve_candidates ADD COLUMN parent_id INTEGER") && al.includes("ALTER TABLE cf_changelog_items ADD COLUMN excerpt TEXT"), "only the missing columns are added", al);
errs.length = 0;
d = db({ evolve_candidates: EV_COLS, cf_changelog_items: ["guid", "excerpt"] }, true);
await ev(d); await cfc(d);
ok(d.ran.filter((x) => /^ALTER/.test(x)).length === 14, "an unreadable table keeps the old path (13 + 1 ALTERs)");
ok(errs.some((x) => /evSchema:columns/.test(x)) && errs.some((x) => /cfcSchema:columns/.test(x)) && !errs.some((x) => /duplicate column/.test(x)), "the failed reads are logged; duplicate-column answers are not", errs);
console.error = orig;
const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 0 || ver[1] >= 31), "VERSION is at least 0.31.0", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
