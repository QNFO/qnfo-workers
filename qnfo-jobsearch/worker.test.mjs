// qnfo-jobsearch offline suite. Run: node qnfo-jobsearch/worker.test.mjs
// Proves: the verifier rejects tampering, gates hold, a full run over stubbed feeds stores verified drafts, the API and UI answer,
// approval needs the token, an unverified draft cannot be approved, and the run cooldown holds.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const w = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const T = w.__test;
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const JOB = { id: "t:1", company: "Acme", title: "Research Program Manager", location: "Amsterdam, Netherlands", url: "https://x/1",
  desc: "Lead our research program and research operations. LLM evaluation, responsible AI, public sector work, government agencies. Audit and reproducibility." };
const m = T.evaluate(JOB), res = T.buildResume(JOB, m), note = T.buildNote(JOB, m);
ok(m.status === "ok", "clean job matches", m);
ok(T.verify(res, JOB).length === 0 && T.verify(note, JOB).length === 0, "clean artifacts verify");
ok(T.verify(res.replace("44+", "400+"), JOB).length > 0, "inflated number rejected");
ok(T.verify(res + "- Expert in Kubernetes. <!--F:F06-->\n", JOB).length > 0, "invented skill rejected");
ok(T.verify(note + "I also hold a PhD.\n", JOB).length > 0, "untagged line rejected");
ok(T.verify(note.replace(/"[^"]+"/, '"quantum cryptography"'), JOB).length > 0, "foreign quoted term rejected");
for (const [title, loc] of [["Sales Lead, Research", "Amsterdam"], ["Intern, Research Program", "Amsterdam"], ["Research Program Manager", "Remote - US only"], ["Staff Engineer, Research Platform", "Amsterdam"]])
  ok(T.evaluate({ ...JOB, title, location: loc }).status === "excluded", "gate " + title + " / " + loc);
const tk = T.evaluate({ ...JOB, location: "Tokyo, Japan" });
ok(tk.status === "ok" && tk.flags.some((f) => f.includes("visa")), "anywhere is flagged, not dropped", tk);
ok(T.evaluate({ ...JOB, location: "San Francisco, CA" }).flags.some((f) => f.startsWith("LOCATION")), "US flagged");
ok(T.evaluate({ ...JOB, desc: JOB.desc + " A PhD is required." }).flags.some((f) => f.startsWith("DEGREE")), "PhD flag");
ok(T.stripHtml("&lt;p&gt;Hello &amp;amp; <b>world</b>&lt;/p&gt;").includes("Hello & world"), "html decode");

// ---- D1 shim over node:sqlite
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(join(here, "../migrations/2026-10-27-jobsearch.sql"), "utf8"));
const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a),
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
  first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }) });
const env = { JOBS_DB: { prepare: (s) => stmt(s), batch: async (a) => { for (const x of a) await x.run(); return []; } }, LOOP_TOKEN: "secret-test-token" };

// ---- stub feeds: one good posting, one engineer; every other feed returns nothing
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => {
  const j = (o) => new Response(JSON.stringify(o), { status: 200 });
  if (u.includes("api.ashbyhq.com/posting-api/job-board/openai")) return j({ jobs: [
    { id: "a1", title: "Research Program Manager, Frontier Assurance", location: "Amsterdam", isRemote: false, jobUrl: "https://jobs/a1", descriptionPlain: JOB.desc },
    { id: "a2", title: "Staff Software Engineer", location: "Amsterdam", jobUrl: "https://jobs/a2", descriptionPlain: "code" }] });
  if (u.includes("boards-api.greenhouse.io/v1/boards/anthropic")) return j({ jobs: [] });
  return j(u.includes("lever") ? [] : { jobs: [], data: [] });
};
const call = async (path, init, e = env) => { const r = await w.fetch(new Request("https://x" + path, init), e, { waitUntil: (p) => p }); return [r.status, await r.json().catch(() => null), r]; };
await w.scheduled({}, env, { waitUntil: (p) => p });
await new Promise((r) => setTimeout(r, 50));
const runs = (await call("/api/runs"))[1].runs;
ok(runs.length === 1 && runs[0].stored === 1 && runs[0].blocked === 0, "run stored 1 verified match", runs[0]);
const list = (await call("/api/matches"))[1];
ok(list.count === 1 && list.matches[0].title.startsWith("Research Program Manager") && list.matches[0].status === "pending_owner_approval", "list", list);
const id = list.matches[0].id;
const one = (await call("/api/matches/" + encodeURIComponent(id)))[1];
ok(one.verified === 1 && one.resume_md.includes("Federal Highway") && !one.note_md.includes("<!--"), "detail has clean verified artifacts");
ok((await call("/api/matches?tier=A"))[1].count === 1 && (await call("/api/matches?tier=B"))[1].count === 0, "tier filter");
ok((await call("/api/ledger"))[1].facts.length >= 15, "ledger served");
ok((await call("/health"))[1].version.startsWith("1."), "health");
const ui = await call("/", undefined);
ok(ui[2].headers.get("content-type").includes("text/html"), "UI html");
// auth + state machine
const post = (hdr, body) => call("/api/matches/" + encodeURIComponent(id) + "/status", { method: "POST", headers: { "content-type": "application/json", ...hdr }, body: JSON.stringify(body) });
ok((await post({}, { status: "approved" }))[0] === 401, "no token -> 401");
ok((await post({ "x-loop-token": "wrong-token-xxx" }, { status: "approved" }))[0] === 401, "bad token -> 401");
ok((await post({ "x-loop-token": "secret-test-token" }, { status: "sent" }))[0] === 400, "bad status -> 400");
ok((await post({ "x-loop-token": "secret-test-token" }, { status: "approved" }))[0] === 200, "approve with token");
ok((await call("/api/matches?status=approved"))[1].count === 1, "status persisted");
ok((await call("/api/matches/" + id + "/status", { method: "POST", body: "{}" }, { ...env, LOOP_TOKEN: undefined }))[0] === 503, "writes disabled without secret");
db.prepare("UPDATE jobsearch_matches SET verified=0, blocked_reason='x', resume_md=NULL WHERE id=?").run(id);
ok((await post({ "x-loop-token": "secret-test-token" }, { status: "approved" }))[0] === 409, "unverified draft cannot be approved");
ok((await post({ "x-loop-token": "secret-test-token" }, { status: "rejected" }))[0] === 200, "unverified draft can be rejected");
// rerun keeps decision
await w.scheduled({}, env, { waitUntil: (p) => p }); await new Promise((r) => setTimeout(r, 50));
ok((await call("/api/matches"))[1].matches[0].status === "rejected", "rerun upsert keeps owner decision");
// cooldown
ok((await call("/api/run", { method: "POST" }))[0] === 429, "run cooldown");
globalThis.fetch = realFetch;
console.log(`qnfo-jobsearch: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
