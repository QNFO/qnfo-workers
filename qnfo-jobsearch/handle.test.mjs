// HANDLE-1: paste a job, get a candid verdict, answer one question at a time, approve. Run: node worker/handle.test.mjs
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const w = (await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href)).default;
const db = new DatabaseSync(":memory:");
const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a),
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
  first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }) });
const env = { LOOP_TOKEN: "t", JOBS_DB: { prepare: (s) => stmt(s), batch: async (a) => { for (const x of a) await x.run(); return []; } } };
const ctx = { waitUntil() {} };
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL " + m); } };
const call = async (path, body) => { const r = await w.fetch(new Request("http://x" + path, { method: body ? "POST" : "GET", headers: { "x-loop-token": "t", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }), env, ctx); return { status: r.status, json: await r.json() }; };
const page = await w.fetch(new Request("http://x/"), env, ctx); const html = await page.text();
ok(/Handle it/.test(html) && !/Filters and search runs/.test(html), "front page is the single paste box");
ok((await w.fetch(new Request("http://x/matches"), env, ctx)).status === 200, "old list still at /matches");
ok((await w.fetch(new Request("http://x/api/handle", { method: "POST", body: "{}" }), env, ctx)).status === 401, "handle needs sign-in");
ok(w.__test.gemIds("https://jobs.gem.com/s32/abc?utm=1").board === "s32", "gem link parsed");
ok(w.__test.atsOf("https://jobs.gem.com/s32/abc").ats === "gem", "gem recognised");
const posting = `AI Evaluation Researcher
Acme Labs
Location: Amsterdam, Netherlands
We are hiring a researcher to design evaluation methods for autonomous AI systems, assess risk and assurance, and publish findings. You will lead research programs, write technical reports and work with policy stakeholders on AI governance.`;
const a = await call("/api/handle", { input: posting });
ok(a.status === 200 && a.json.job && a.json.job.id, "job tracked: " + JSON.stringify(a.json).slice(0, 200));
ok(a.json.messages && a.json.messages.some((m) => m.kind === "verdict"), "verdict comes first");
ok(a.json.next && ["ask", "choice"].includes(a.json.next.type), "one next step: " + (a.json.next && a.json.next.type));
let n = a.json.next, guard = 0;
while (n && n.type === "ask" && guard++ < 6) { const r = await call("/api/handle/act", { job: a.json.job.id, act: n.key ? "answer" : "x", key: n.key, answer: "no" }); n = r.json.next; }
ok(n && n.type === "choice", "after questions the decision is asked: " + JSON.stringify(n));
const b = await call("/api/handle/act", { job: a.json.job.id, act: "approve" });
ok(b.status === 200 && b.json.next && b.json.next.type === "done", "approve ends in done: " + JSON.stringify(b.json).slice(0, 200));
const dup = await call("/api/handle", { input: posting });
ok(dup.json.job && dup.json.job.id === a.json.job.id, "same job is not tracked twice");
const li = await call("/api/handle", { input: "https://www.linkedin.com/jobs/view/4012345678/" });
ok(li.json.next && li.json.next.type === "text", "LinkedIn link asks for the pasted text, never fetched");
// review-gate findings: track ends the flow, skip advice survives the question step, open jobs are listed
const p2 = await call("/api/handle", { input: "Backend Engineer\nBigCo\nWe need Go, Kubernetes, Terraform, on-call, 6+ years of coding experience building distributed systems." });
const t = await call("/api/handle/act", { job: p2.json.job.id, act: "track" });
ok(t.json.next && t.json.next.type === "done", "track ends the flow: " + JSON.stringify(t.json.next));
const js = await call("/api/handle/jobs");
ok(js.json.jobs.some((j) => j.id === p2.json.job.id), "tracked job is listed");
console.log(fail ? fail + " failed" : "handle: all passed"); process.exit(fail ? 1 : 0);
