// _shared/pipeline-engine.test.mjs: PIPELINE-ENGINE-1. Run: node _shared/pipeline-engine.test.mjs
import { DatabaseSync } from "node:sqlite";
import * as E from "./pipeline-engine.js";
import { researchPipeline, jobsPipeline } from "./pipeline-defs.js";

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok   " + n); } else { fail++; console.log("  FAIL " + n + (x !== undefined ? "  -> " + JSON.stringify(x) : "")); } };
const throws = (n, fn) => { try { fn(); fail++; console.log("  FAIL " + n + " (no throw)"); } catch (e) { pass++; console.log("  ok   " + n); } };
function d1(db) {
  return { prepare(sql) { let a = []; const api = { bind(...x) { a = x; return api; },
    async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: r.changes } }; },
    async all() { return { results: db.prepare(sql).all(...a) }; }, async first() { return db.prepare(sql).get(...a) ?? null; } }; return api; } };
}

console.log("[schema and contracts]");
const db = d1(new DatabaseSync(":memory:"));
await E.ensureEngine(db);
ok("DDL accepted one statement per prepare", true);
ok("validate: good object", E.validate({ type: "object", required: ["a"], props: { a: { type: "integer", min: 1, max: 5 } } }, { a: 3 }).ok);
ok("validate: out of range", !E.validate({ type: "object", props: { a: { type: "integer", max: 5 } } }, { a: 9 }).ok);
ok("validate: missing required", !E.validate({ type: "object", required: ["a"] }, {}).ok);
ok("validate: enum", !E.validate({ type: "string", enum: ["x"] }, "y").ok);
ok("validate: nullable", E.validate({ type: "integer", nullable: true }, null).ok);
throws("definePipeline: bad name", () => E.definePipeline({ name: "X", version: "1", plane: "personal", stages: [{ key: "a", run() {} }] }));
throws("definePipeline: unknown plane", () => E.definePipeline({ name: "x", version: "1", plane: "other", stages: [{ key: "a", run() {} }] }));
throws("definePipeline: duplicate stage", () => E.definePipeline({ name: "x", version: "1", plane: "personal", stages: [{ key: "a", run() {} }, { key: "a", run() {} }] }));
throws("definePipeline: wait without poll", () => E.definePipeline({ name: "x", version: "1", plane: "personal", stages: [{ key: "a", run() {}, wait: {} }] }));
ok("durationMs", E.durationMs("6 hours") === 216e5 && E.durationMs("1 day") === 864e5);
ok("runId is deterministic", E.runId("p", "a") === E.runId("p", "a") && E.runId("p", "a") !== E.runId("p", "b"));

console.log("[inline executor: wait, resume, finish]");
let t = Date.parse("2026-11-12T10:00:00Z");
const now = () => new Date(t).toISOString();
let answer = null, calls = 0;
const def = E.definePipeline({
  name: "demo", version: "1.0.0", plane: "personal", input: { type: "object", required: ["x"], props: { x: { type: "integer" } } },
  stages: [
    { key: "double", out: { type: "object", required: ["y"] }, async run(s) { calls++; return { out: { y: s.x * 2 }, state: { y: s.x * 2 } }; } },
    { key: "ask", async run() { return { wait: true }; }, wait: { every: "1 hour", max: 3, poll: async () => answer, resume: async (s, got, c, info) => ({ out: { got, timedOut: info.timedOut }, state: { got } }) } },
    { key: "end", async run(s) { return { out: { sum: s.y + (s.got || 0) }, state: { sum: s.y + (s.got || 0) } }; } }
  ],
  output: (s) => ({ sum: s.sum })
});
await E.ensureEngine(db);
let o = await E.openRun(db, def, { x: 3 }, { subjectRef: "s1", now: now() });
ok("openRun creates", o.created);
ok("openRun twice is one run", !(await E.openRun(db, def, { x: 3 }, { subjectRef: "s1", now: now() })).created);
let threw = false; try { await E.openRun(db, def, { x: "no" }, { subjectRef: "s2" }); } catch (e) { threw = true; }
ok("openRun rejects input that breaks the schema", threw);
let r = await E.runPipeline(db, def, o.id, E.inlineStep(), { now });
ok("run pauses at the wait", r.status === "waiting", r);
let row = await db.prepare("SELECT * FROM pipeline_runs WHERE id = ?").bind(o.id).first();
ok("waiting row keeps the stage and its next check", row.stage === "ask" && row.next_check_at === "2026-11-12T11:00:00.000Z" && row.wait_n === 1, row);
ok("resumeDue skips a run that is not due", (await E.resumeDue(db, def, { now })).resumed === 0);
t += 36e5; answer = 10;
r = await E.resumeDue(db, def, { now });
ok("resumeDue finishes it once answered", r.done === 1, r);
row = await db.prepare("SELECT * FROM pipeline_runs WHERE id = ?").bind(o.id).first();
ok("output is typed and stored", JSON.parse(row.output_json).sum === 16 && row.status === "done", row.output_json);
ok("stage 1 ran once across the pause", calls === 1, calls);
const ev = (await db.prepare("SELECT stage, ok FROM pipeline_evidence WHERE run_id = ? ORDER BY id").bind(o.id).all()).results.map((e) => e.stage);
ok("evidence: open, each stage, finish", JSON.stringify(ev) === JSON.stringify(["open", "double", "ask", "ask", "end", "finish"]), ev);

console.log("[timeout and failure]");
answer = null;
o = await E.openRun(db, def, { x: 1 }, { subjectRef: "s3", now: now() });
await E.runPipeline(db, def, o.id, E.inlineStep(), { now });
for (let k = 0; k < 4; k++) { t += 36e5; await E.resumeDue(db, def, { now }); }
row = await db.prepare("SELECT * FROM pipeline_runs WHERE id = ?").bind(o.id).first();
ok("a wait that is never answered ends on its default", row.status === "done" && JSON.parse(row.output_json).sum === 2, row);
const bad = E.definePipeline({ name: "bad", version: "1", plane: "personal", stages: [{ key: "boom", async run() { throw new Error("broken stage"); } }] });
o = await E.openRun(db, bad, {}, { subjectRef: "b1", now: now() });
r = await E.runPipeline(db, bad, o.id, E.inlineStep(), { now });
ok("a failing stage marks the run failed with evidence", r.status === "failed" && (await db.prepare("SELECT ok FROM pipeline_evidence WHERE run_id = ? AND stage = 'boom'").bind(o.id).first()).ok === 0);
const typed = E.definePipeline({ name: "typed", version: "1", plane: "personal", stages: [{ key: "a", out: { type: "object", required: ["z"] }, async run() { return { out: {} }; } }] });
o = await E.openRun(db, typed, {}, { subjectRef: "t1", now: now() });
ok("a stage output that breaks its schema fails the run", (await E.runPipeline(db, typed, o.id, E.inlineStep(), { now })).status === "failed");
const st = await E.statusOf(db, def, t);
ok("statusOf counts by state", st.by_state.done === 2 && st.total === 2, st);

console.log("[workflow step: same code, cached replay]");
const cache = new Map(); let sleeps = 0;
const wf = { async do(name, opts, fn) { if (typeof opts === "function") fn = opts; if (cache.has(name)) return cache.get(name); const v = await fn(); cache.set(name, v); return v; }, async sleep() { sleeps++; } };
answer = null; let polls = 0;
const def2 = E.definePipeline({ name: "wf", version: "1", plane: "personal", stages: [{ key: "w", async run() { return { wait: true }; }, wait: { every: "1 hour", max: 5, poll: async () => (++polls >= 3 ? "yes" : null), resume: async (s, g) => ({ out: { g }, state: { g } }) } }] });
o = await E.openRun(db, def2, {}, { subjectRef: "w1", now: now() });
r = await E.runPipeline(db, def2, o.id, wf, { now });
ok("Workflows path sleeps between polls and finishes", r.status === "done" && sleeps === 2 && r.output.g === "yes", { r, sleeps });

console.log("[observed peers]");
const rs = E.projectStatus(researchPipeline(E), [{ status: "queued", n: 152 }, { status: "researching", n: 2 }, { status: "published", n: 546 }, { status: "owner_paused", n: 956 }]);
ok("research projects onto idea -> publication", rs.stages.find((s) => s.key === "idea").active === 1108 && rs.by_state.done === 546 && rs.stages.find((s) => s.key === "research").active === 2, rs);
const js = E.projectStatus(jobsPipeline(E), [{ status: "applied", n: 9 }, { status: "expired", n: 453 }]);
ok("jobs projects applied as active, expired as dropped", js.stages.find((s) => s.key === "applied").active === 9 && js.by_state.dropped === 453, js);

console.log("[WORKFLOW-FIRST-READ-RETRY-1: no D1 call outside a retried step]");
{
  const raw = new DatabaseSync(":memory:");
  const inner = { prepare(sql) { let a = []; const api = { bind(...x) { a = x; return api; },
    async run() { const r = raw.prepare(sql).run(...a); return { success: true, meta: { changes: r.changes } }; },
    async all() { return { results: raw.prepare(sql).all(...a) }; }, async first() { return raw.prepare(sql).get(...a) ?? null; } }; return api; },
    async exec(q) { raw.exec(q); }, async batch(xs) { return Promise.all(xs.map((x) => x.run())); } };
  const tiny = E.definePipeline({ name: "tiny", label: "Tiny", plane: "personal", version: "1.0.0", input: { type: "object", props: {} },
    stages: [{ key: "one", label: "One", async run() { return { out: { ok: 1 } }; } }], output: () => ({ ok: 1 }) });
  const o = await E.openRun(inner, tiny, {}, { subjectRef: "t1", now: "2026-11-12T17:00:00Z" });
  let inStep = false, outside = 0, failOnce = true;
  const guarded = { prepare(sql) { if (!inStep) outside++; if (failOnce && inStep) { failOnce = false; throw new Error("D1_ERROR: D1 DB is overloaded."); } return inner.prepare(sql); },
    exec: inner.exec, batch: inner.batch };
  const step = { async do(name, a, b) { const fn = typeof a === "function" ? a : b; for (let t = 0; ; t++) { inStep = true; try { return await fn(); } catch (e) { if (t >= 2) throw e; } finally { inStep = false; } } },
    async sleep() {} };
  const res = await E.runPipeline(guarded, tiny, o.id, step, {});
  ok("an overload on the first read is retried by the step and the run finishes", res && res.status === "done", res);
  ok("no D1 call happens outside a step", outside === 0, outside);
}

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
