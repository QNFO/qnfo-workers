// REGISTRY-SYNC-FOLDED-1 (#2031) and OPS-D1-LIMIT-WORD-1 (#2033), qnfo-ops 2.38.47 offline suite. No network.
// Proves: (1) ops_d1_query's LIMIT detection takes only a trailing LIMIT clause, so the 07:53:42Z query (a column named
// limited, ending in LIMIT 10) gets no second LIMIT, a query without one still gets LIMIT 100, and a subquery LIMIT does not
// count for the outer query; (2) a folded FLEET member is written to service_registry as kind member with its host route,
// while an ordinary FLEET worker keeps kind worker and its own URL.
// Run: node qnfo-ops/registry-folded.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const grab = (start, end) => { const i = src.indexOf(start), j = src.indexOf(end, i); return i >= 0 && j > i ? src.slice(i, j) : ""; };
const has = new Function(grab("function d1HasTrailingLimit(sql) {", "\nasync function d1Query") + "\nreturn d1HasTrailingLimit;")();
const q2033 = "SELECT ts, limited, error, total_ms FROM ask_events WHERE limited IS NOT NULL OR error IS NOT NULL ORDER BY ts DESC LIMIT 10";
ok(has(q2033) === true, "the #2033 query (column limited, trailing LIMIT 10) is seen as limited");
ok(has("SELECT limited FROM ask_events") === false, "a column named limited alone is not a LIMIT clause");
ok(has("SELECT * FROM t LIMIT 5 OFFSET 10") && has("SELECT * FROM t LIMIT 10, 5") && has("SELECT * FROM t limit ?1"), "LIMIT n OFFSET m, LIMIT m, n and a bound limit count");
ok(has("SELECT * FROM t WHERE id IN (SELECT id FROM u LIMIT 5)") === false, "a subquery LIMIT does not cap the outer query");
ok(/var _hasLimit = d1HasTrailingLimit\(sqlEff\);\n\s*if \(!_hasLimit && !_agg\) sqlEff = sqlEff \+ " LIMIT 100";/.test(src), "d1Query appends LIMIT 100 only when no trailing LIMIT exists");
ok(!/_lo\.indexOf\("limit"\)/.test(src), "the first-substring detection is gone");

const fleet = new Function(grab("var FLEET = [", "\nvar CF_ACCOUNT_ID") + "\nreturn FLEET;")();
const backlog = fleet.find((f) => f.name === "qnfo-backlog-exec");
ok(backlog && backlog.kind === "member" && backlog.base === "https://qnfo-lifecycle.q08.workers.dev/backlog" && backlog.binding === "BACKLOG", "the folded backlog member names its host route and kind member", backlog);
ok(fleet.filter((f) => f.name !== "qnfo-backlog-exec").every((f) => !f.kind && !f.base), "ordinary FLEET workers keep the defaults");
ok(/await upsert\(f\.name, f\.kind \|\| "worker", \{ version: exVer, base_url: f\.base \|\| CANON_BASE\[f\.name\] \|\| "https:\/\/" \+ f\.name \+ "\.q08\.workers\.dev",/.test(src), "registryRefresh writes the entry's kind and base");
const dirs = (await import("node:fs")).readdirSync(new URL("..", import.meta.url));
const folded = new Set(dirs.filter((d) => { try { return readFileSync(new URL("../" + d + "/FOLDED", import.meta.url)); } catch (e) { return false; } }));
ok(fleet.every((f) => !folded.has(f.name) || f.kind === "member"), "every FLEET entry whose directory is FOLDED is a member (no dead URL can be written)", fleet.filter((f) => folded.has(f.name) && f.kind !== "member").map((f) => f.name));
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
