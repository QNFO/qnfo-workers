// D1-RESULT-CAP-1 (#9794): d1ReadAll pages on a result-size error and logs d1_result_cap_near. Run: node qnfo-infra/d1-result-cap.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8").split(String.fromCharCode(13)).join("");
const i = src.indexOf("var D1_RESULT_NEAR_BYTES"), j = src.indexOf("\n", src.indexOf("return out;\n}", i) + 13);
if (i < 0 || j < i) throw new Error("block not found");
const sb = { Date, Math, Number, String, JSON, Array, Promise, crypto: { randomUUID: () => "u" }, VERSION: "t" };
vm.createContext(sb);
vm.runInContext(src.slice(i, j) + "\n;__x = { d1ReadAll, d1ResultSizeError };", sb);
const X = sb.__x;
let fail = 0;
const ok = (c, m, x) => { if (!c) { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const events = [], calls = [];
const TOTAL = 1250;
const mkDb = (failFirst) => ({
  prepare(sql) {
    return { bind(...a) { return { async all() {
      calls.push([sql, a]);
      if (failFirst && !/^SELECT \* FROM \(/.test(sql)) throw new Error("D1_ERROR: result size exceeds the limit");
      if (/^SELECT \* FROM \(/.test(sql)) { const lim = a[a.length - 2], off = a[a.length - 1]; const rows = []; for (let k = off; k < Math.min(TOTAL, off + lim); k++) rows.push({ id: k }); return { results: rows }; }
      return { results: [{ id: 1 }] };
    }, async run() { events.push([sql, a]); return {}; } }; } };
  },
});
ok(X.d1ResultSizeError(new Error("D1_ERROR: result size exceeds limit")), "size error detected");
ok(!X.d1ResultSizeError(new Error("no such table")), "other errors are not size errors");
const env = { AUDIT: mkDb(true) };
const rows = await X.d1ReadAll(env, env.AUDIT, "SELECT id FROM t WHERE id > ?1", [0], { page: 500 });
ok(rows.length === TOTAL, "paging returns every row", rows.length);
ok(calls.some((c) => /LIMIT \?2 OFFSET \?3/.test(c[0])), "paged statement numbers its binds after the caller's");
ok(events.length === 1 && /d1_result_cap_near/.test(events[0][0]), "one d1_result_cap_near event row", events.length);
const env2 = { AUDIT: mkDb(false) };
events.length = 0;
const r2 = await X.d1ReadAll(env2, env2.AUDIT, "SELECT id FROM t", [], {});
ok(r2.length === 1 && events.length === 0, "a small result is returned with no event");
let threw = false;
try { await X.d1ReadAll({ AUDIT: { prepare() { return { bind() { return { all: async () => { throw new Error("no such table: t"); } }; } }; } } }, { prepare() { return { bind() { return { all: async () => { throw new Error("no such table: t"); } }; } }; } }, "SELECT 1", [], {}); } catch (e) { threw = true; }
ok(threw, "a non-size error still throws");
ok(/d1ReadAll\(env, env\.AUDIT, "SELECT " \+ cols/.test(src), "the lake export reads through d1ReadAll");
console.log(fail ? fail + " failed" : "all passed");
process.exit(fail ? 1 : 0);
