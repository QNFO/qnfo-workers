import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roadmapStatements, insertRoadmap } from "./r2_file_issues.mjs";

const rows = [{ id: "DOC-A-MD", source: "r2://qnfo-ddocs/a.md", doer: "qnfo-code-orchestrator", probe: "r2_doc_audit orphan=false" }];
const st = roadmapStatements(rows);
assert.equal(st.length, 1);
assert.match(st[0].sql, /WHERE NOT EXISTS/);
assert.equal(st[0].params[0], "DOC-A-MD");

// no credentials: skipped, never throws
assert.equal((await insertRoadmap(rows, { tok: "", acct: "" })).skipped, "no Cloudflare credentials");

// inserted vs already present vs failed
const calls = [];
const fake = (changes, success = true) => async (url, init) => { calls.push([url, init.method]); const n = JSON.parse(init.body).batch.length; return { json: async () => ({ success, result: Array.from({ length: n }, () => ({ meta: { changes } })) }) }; };
assert.deepEqual(await insertRoadmap(rows, { fetchImpl: fake(1), tok: "t", acct: "a" }), { rows: 1, inserted: 1, already_present: 0, failed: 0 });
assert.deepEqual(await insertRoadmap(rows, { fetchImpl: fake(0), tok: "t", acct: "a" }), { rows: 1, inserted: 0, already_present: 1, failed: 0 });
assert.equal((await insertRoadmap(rows, { fetchImpl: fake(0, false), tok: "t", acct: "a" })).failed, 1);
assert.match(calls[0][0], /\/d1\/database\/35e2e573-92f3-46ac-83c6-22f6429fc5e5\/query$/);

// 120 rows go out as 3 batched requests of at most 50 statements
const many = Array.from({ length: 120 }, (_, i) => ({ ...rows[0], id: "DOC-" + i }));
calls.length = 0;
assert.deepEqual(await insertRoadmap(many, { fetchImpl: fake(1), tok: "t", acct: "a" }), { rows: 120, inserted: 120, already_present: 0, failed: 0 });
assert.equal(calls.length, 3);

// qnfo-ops dispatcher: period keys and idempotence, evaluated from the real worker source
const src = readFileSync(new URL("../qnfo-ops/worker.js", import.meta.url), "utf8");
const body = src.slice(src.indexOf("const SWEEP_WORKFLOWS"), src.indexOf('__name(sweepWorkflowDispatch'));
const { sweepPeriodKey, sweepWorkflowDispatch } = new Function("fetch", `${body}; return { sweepPeriodKey, sweepWorkflowDispatch };`)(async () => ({ status: 204 }));
assert.equal(sweepPeriodKey("week", new Date("2026-11-09T04:00:00Z")), "2026W46");
assert.equal(sweepPeriodKey("day", new Date("2026-11-09T23:00:00Z")), "2026-11-09");
assert.equal(sweepPeriodKey("6h", new Date("2026-11-09T13:10:00Z")), "2026-11-09-2");
const rowsDb = new Map();
const env = { GITHUB_TOKEN: "x", QNFO_AUDIT: { prepare: (sql) => ({ bind: (...a) => ({ first: async () => (rowsDb.has(a[0]) ? { status: rowsDb.get(a[0]) } : null), run: async () => { if (/INSERT/.test(sql)) rowsDb.set(a[0], a[4]); } }) }) } };
const d1 = await sweepWorkflowDispatch(env, new Date("2026-11-09T04:00:00Z"));
assert.deepEqual(d1.map((x) => x.dispatched), [true, true]);
assert.equal(d1[0].wf, "r2-doc-audit.yml");
const d2 = await sweepWorkflowDispatch(env, new Date("2026-11-09T05:00:00Z"));
assert.deepEqual(d2.map((x) => x.skipped), ["already dispatched this period", "already dispatched this period"]);
console.log("r2_file_issues.test ok");
