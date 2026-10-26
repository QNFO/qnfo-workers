// HANDOFFS-VZ-PRODUCER-1 (qnfo-infra 1.9.0) offline suite. No network.
// Measured 2026-10-26: semantic handoff search was frozen at 2026-07 while qnfo-audit.handoffs held 1,706 rows. PR 4230 had added a producer to the 06:30
// indexer member that selected handoffs.content, a column the table does not have, so it threw into a catch every night. This suite replays the live
// handoffs columns in node:sqlite and proves indexHandoffs(): reads the real columns, writes handoff:<id>:<chunk> vectors with the metadata the readers use,
// moves the ops_config watermark only after the upsert succeeded, drains a backlog 100 rows per run, retries after a failure without skipping a row, and
// that the broken block is gone and the hourly fire calls it.
// Review round (independent reviewer, mutation runs): personal-plane handoffs are never embedded (the index is read by scope=research retrieval and has no
// metadata index to filter on later), a failure leaves a FAILED note and the state refresh still runs, a stalled call is cut at the timeout, the watermark never
// moves back, a later chunk shows its own text, and a short embedding answer throws.
// Run: node --no-warnings qnfo-infra/handoffs-index.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { indexHandoffs as __index, handoffText as __text, handoffChunks as __chunks, VERSION as __v, runScheduled as __run, handoffIsPersonalPlane as __personal };\n").toString("base64"));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 500) : "")); } };

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE handoffs (id INTEGER PRIMARY KEY, session_id TEXT, project_id TEXT, phase_completed TEXT, summary TEXT, pending_work TEXT, next_action TEXT, r2_handoff_path TEXT, timestamp TEXT, wbs_code TEXT, dod_verdict TEXT, claim_sheet TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);`);
const AUDIT = { prepare(sql) { let a = []; const s = { bind: (...x) => { a = x; return s; }, run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return s; } };
const upserts = [], aiCalls = [];
let failEmbedOnce = false, failUpsertOnce = false, shortEmbedOnce = false, hangEmbed = false, duringEmbed = null;
const env = {
  AUDIT,
  AI: { run: async (model, input) => { aiCalls.push({ model, n: input.text.length }); if (hangEmbed) { hangEmbed = false; return new Promise(() => {}); } if (failEmbedOnce) { failEmbedOnce = false; throw new Error("AI 5xx"); } if (duringEmbed) { const f = duringEmbed; duringEmbed = null; f(); } if (shortEmbedOnce) { shortEmbedOnce = false; return { data: input.text.slice(1).map((t) => [t.length, 1, 0]) }; } return { data: input.text.map((t) => [t.length, 1, 0]) }; } },
  HANDOFFS_VZ: { upsert: async (v) => { if (failUpsertOnce) { failUpsertOnce = false; throw new Error("vectorize 5xx"); } upserts.push(...v); return { count: v.length }; } }
};
const add = (id, o) => db.prepare("INSERT INTO handoffs (id, session_id, project_id, phase_completed, summary, pending_work, next_action, timestamp, wbs_code) VALUES (?,?,?,?,?,?,?,?,?)").run(id, o.session ?? "sess-" + id, o.project ?? "qnfo", o.phase ?? "p1", o.summary === undefined ? "summary of handoff " + id : o.summary, o.pending ?? null, o.next ?? null, o.ts ?? "2026-10-25T08:52:00Z", o.wbs ?? "OPS.001");
const setWmRow = (v) => db.prepare("INSERT INTO ops_config (key, value, note, updated_at) VALUES ('handoffs_vz_last_id', ?, 'n', '2026-01-01T00:00:00Z') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(v));
const wm = () => (db.prepare("SELECT value, note FROM ops_config WHERE key = 'handoffs_vz_last_id'").get() || {});

// no handoffs yet: nothing written, no watermark row invented
let r = await mod.__index(env);
ok(r.indexed === 0 && r.behind === 0 && !wm().value, "an empty table indexes nothing and writes no watermark", r);

// the live columns: the old query selected handoffs.content, which does not exist
add(1, { summary: "first handoff", pending: "wire the thing", next: "ship it" });
add(2, { summary: null, pending: "only pending work", ts: "2026-07-11 08:09:47" });
add(3, { summary: "x".repeat(2500), pending: "p".repeat(100) });
r = await mod.__index(env);
ok(r.indexed === 3 && r.last_id === 3 && r.behind === 0, "three handoffs are indexed from the real columns and the watermark is 3", r);
ok(wm().value === "3" && /indexed 3 handoffs/.test(wm().note) && /behind=0/.test(wm().note), "ops_config carries the watermark and the reconciliation note", wm());
const ids = upserts.map((v) => v.id);
ok(ids.includes("handoff:1:0") && ids.includes("handoff:2:0") && ids.includes("handoff:3:0") && ids.includes("handoff:3:1"), "ids are handoff:<id>:<chunk>, a long handoff gets several chunks", ids);
ok(new Set(ids).size === ids.length, "no id is written twice in one run");
const v1 = upserts.find((v) => v.id === "handoff:1:0");
ok(v1.metadata.doc === "handoffs" && v1.metadata.id === "1" && v1.metadata.session_id === "sess-1" && v1.metadata.ts === "2026-10-25T08:52:00Z" && v1.metadata.summary === "first handoff", "metadata carries doc, id, session_id, ts and the summary the readers show", v1.metadata);
const v2 = upserts.find((v) => v.id === "handoff:2:0");
ok(v2.metadata.summary.startsWith("Handoff 2 session sess-2"), "a handoff with an empty summary falls back to its text", v2.metadata.summary);
ok(upserts.every((v) => v.values.length === 3 && Object.values(v.metadata).every((x) => typeof x === "string")), "every vector has values and string-only metadata");
ok(aiCalls.every((c) => c.model === "@cf/baai/bge-base-en-v1.5"), "the embedding model is the one the readers query with", aiCalls[0]);

// nothing new: no embedding, no upsert, the watermark stays
const before = { ai: aiCalls.length, up: upserts.length };
r = await mod.__index(env);
ok(r.indexed === 0 && aiCalls.length === before.ai && upserts.length === before.up && wm().value === "3", "nothing new means no embedding call and no upsert", r);

// a new handoff is picked up on the next fire
add(4, { summary: "the one from this hour" });
r = await mod.__index(env);
ok(r.indexed === 1 && r.last_id === 4 && upserts.some((v) => v.id === "handoff:4:0"), "a handoff inserted after the last run is indexed on the next fire", r);

// a failed embedding or upsert leaves the watermark, and the retry loses no row
add(5, { summary: "five" }); add(6, { summary: "six" });
failEmbedOnce = true;
let threw = false; try { await mod.__index(env); } catch (e) { threw = /AI 5xx/.test(String(e.message)); }
ok(threw && wm().value === "4", "an embedding failure throws and the watermark stays at 4", wm());
failUpsertOnce = true;
threw = false; try { await mod.__index(env); } catch (e) { threw = /vectorize 5xx/.test(String(e.message)); }
ok(threw && wm().value === "4", "an upsert failure throws and the watermark stays at 4", wm());
r = await mod.__index(env);
ok(r.indexed === 2 && r.last_id === 6 && upserts.some((v) => v.id === "handoff:5:0") && upserts.some((v) => v.id === "handoff:6:0"), "the retry indexes both rows that failed", r);

// a backlog drains 100 rows per run, in id order, with the behind count falling
for (let i = 7; i < 7 + 250; i++) add(i * 10, { summary: "backlog " + i });
const runs = [];
for (let k = 0; k < 4; k++) runs.push(await mod.__index(env));
ok(runs[0].indexed === 100 && runs[0].behind === 150 && runs[1].indexed === 100 && runs[1].behind === 50 && runs[2].indexed === 50 && runs[2].behind === 0 && runs[3].indexed === 0, "250 backlog rows drain 100, 100, 50, 0 with behind 150, 50, 0", runs);
ok(wm().value === "2560", "the watermark is the highest id", wm());
ok(upserts.filter((v) => v.id.endsWith(":0")).length === 6 + 250, "every handoff has exactly one first-chunk vector", upserts.filter((v) => v.id.endsWith(":0")).length);

// personal/research separation: a personal-plane handoff is never embedded, the watermark moves past it, and the note counts it
const personalCases = [
  { id: 3001, project: "personal-twin-agentic-v4-2026-09-14" }, { id: 3002, project: "PERSONAL.EMAIL-TRIAGE" }, { id: 3003, project: "q08-reading-content-cycle-2026-09-14" },
  { id: 3004, project: "owner-queue-honesty" }, { id: 3005, project: "personal-api-msgraph-mail" }, { id: 3006, project: "QNFO.OPS.010C-twin-calendar-retrieval" },
  { id: 3007, project: "QNFO.OPS.Q08-RESTORE" }, { id: 3008, project: "qnfo-email", session: "email-strategic-77" }, { id: 3009, project: "qnfo-ops", wbs: "PERSONAL-CAL-BLANK" }, { id: 3010, project: "qnfo-ops", wbs: "q08.mind.1" }
];
personalCases.forEach((c) => add(c.id, { project: c.project, session: c.session, wbs: c.wbs ?? "OPS.001", summary: "PERSONAL-MARK " + c.id }));
add(3011, { project: "qnfo-email", summary: "email worker ops: inbox and mailbox handling of the outreach queue" });
const upBefore = upserts.length;
r = await mod.__index(env);
ok(r.indexed === 1 && r.skipped_personal === 10 && r.last_id === 3011 && r.behind === 0, "ten personal-plane handoffs are skipped and the ordinary one (it mentions an inbox) is indexed", r);
ok(upserts.slice(upBefore).every((v) => !/PERSONAL-MARK/.test(v.metadata.summary) && !/^handoff:30(0\d|10):/.test(v.id)), "no vector of a personal-plane handoff is written", upserts.slice(upBefore).map((v) => v.id));
ok(upserts.some((v) => v.id === "handoff:3011:0"), "an ops handoff that only mentions an inbox is indexed (the text is not scanned)");
ok(wm().value === "3011" && /skipped_personal=10/.test(wm().note), "the watermark passes the skipped rows and the note counts them", wm());
add(3020, { project: "personal-twin-x" }); add(3021, { project: "q08-mind" });
const aiBefore = aiCalls.length, upBefore2 = upserts.length;
r = await mod.__index(env);
ok(r.indexed === 0 && r.skipped_personal === 2 && r.vectors === 0 && aiCalls.length === aiBefore && upserts.length === upBefore2 && wm().value === "3021", "a batch of only personal handoffs makes no embedding call and no upsert, and the watermark still moves", r);
ok(["personal-twin-agentic-v4-2026-09-14", "Q08-ANTI-BANAL-2026-09-19", "PERSONAL-SELF-MONITOR-1", "owner-queue-inline-act", "QNFO.OPS.010B-personal-events-radar", "personal-api-maxout-remd"].every((p) => mod.__personal({ project_id: p })) && ["qnfo-email", "qnfo-ops", "QNFO.KAIZEN", "fleet-class-audit", "QNFO.RES.021 finite-distinction-quantum-mechanics"].every((p) => !mod.__personal({ project_id: p })) && mod.__personal({ project_id: "x", wbs_code: "Q08.1" }) && mod.__personal({ project_id: "x", session_id: "email-strategic-5" }) && !mod.__personal({ project_id: null, wbs_code: null, session_id: null }), "the deny-list matches the live personal project labels and none of the research ones");

// a later chunk shows its own text, so a hit on Pending displays the matched passage
add(3030, { summary: "short head " + "h".repeat(600), pending: "PENDING-LATE-MARK " + "w".repeat(1500) });
upserts.length = 0;
r = await mod.__index(env);
const late = upserts.filter((v) => v.id.startsWith("handoff:3030:"));
ok(late.length >= 2 && late[0].metadata.summary.startsWith("short head h") && !late[0].metadata.summary.includes("PENDING-LATE-MARK") && late.some((v) => v.metadata.summary.includes("PENDING-LATE-MARK")), "chunk 0 shows the handoff summary and a later chunk shows its own text", late.map((v) => v.metadata.summary));

// the embedding-count guard: a short answer throws and the watermark stays
add(3031, { summary: "a" }); add(3032, { summary: "b" });
shortEmbedOnce = true;
threw = false; try { await mod.__index(env); } catch (e) { threw = /returned 1 vectors for 2 chunks/.test(String(e.message)); }
ok(threw && wm().value === "3030", "an embedding answer with fewer vectors than chunks throws and the watermark stays", wm());
r = await mod.__index(env);
ok(r.indexed === 2 && wm().value === "3032", "the retry after a short answer indexes both rows", r);

// the watermark never moves back: a run that finishes after another run moved it further leaves the larger value
add(3040, { summary: "slow run" });
duringEmbed = () => setWmRow(9999);
r = await mod.__index(env);
ok(r.indexed === 1 && wm().value === "9999", "a late run cannot lower a watermark another run raised", wm());
setWmRow(3040);

// the index's own count goes into the note when the binding can describe itself, and a describe failure does not fail the run
add(3041, { summary: "described" });
env.HANDOFFS_VZ.describe = async () => ({ vectorCount: 4242 });
r = await mod.__index(env);
ok(r.indexed === 1 && /index_vectors=4242/.test(wm().note), "the note carries the index vector count", wm());
add(3042, { summary: "describe fails" });
env.HANDOFFS_VZ.describe = async () => { throw new Error("describe 5xx"); };
r = await mod.__index(env);
ok(r.indexed === 1 && wm().value === "3042" && !/index_vectors/.test(wm().note), "a failing describe() is ignored", wm());
delete env.HANDOFFS_VZ.describe;

// runScheduled: a failure does not stop the state refresh, is written to the watermark row's note, and a stalled call is cut at the timeout
const realFetch = globalThis.fetch;
let fetches = 0;
globalThis.fetch = async () => { fetches++; return new Response("{}", { status: 500 }); };
const fire = async (e) => { try { await mod.__run({ cron: "0 * * * *", scheduledTime: Date.now(), type: "scheduled" }, e, { waitUntil() {} }); return null; } catch (x) { return x; } };
add(3050, { summary: "will fail" });
failEmbedOnce = true;
const before3 = wm();
fetches = 0;
await fire(env);
ok(fetches > 0, "after a failed indexHandoffs the hourly state refresh still runs (it reached the network)", fetches);
ok(wm().value === before3.value && /^HANDOFFS-VZ-PRODUCER-1: FAILED \d{4}-\d\d-\d\dT[^ ]+ AI 5xx/.test(wm().note), "the failure is written to the watermark row's note and the value stays", wm());
const okAfter = await mod.__index(env);
ok(okAfter.indexed === 1 && !/FAILED/.test(wm().note), "the next successful run clears the failure note", wm());
add(3051, { summary: "will hang" });
hangEmbed = true;
fetches = 0;
const t0 = Date.now();
await fire({ ...env, HANDOFFS_VZ_TIMEOUT_MS: 50 });
ok(Date.now() - t0 < 5000 && fetches > 0 && /FAILED[^]*timed out after 50 ms/.test(wm().note), "a stalled embedding call is cut at the timeout, noted, and the refresh still runs", { ms: Date.now() - t0, fetches, note: wm().note });
globalThis.fetch = realFetch;

// missing bindings are skipped, not thrown
r = await mod.__index({ AUDIT });
ok(r.skipped === "binding missing", "without the vectorize or AI binding the step is skipped", r);

// text and chunk shape
const t = mod.__text({ id: 9, session_id: "s", project_id: "p", wbs_code: "W", phase_completed: "ph", timestamp: "t", summary: "S", pending_work: "P", next_action: "N" });
ok(t === "Handoff 9 session s project p wbs W phase ph at t\nSummary: S\nPending: P\nNext: N", "handoff text carries the header and the three fields", t);
const longT = mod.__text({ id: 1, summary: "z".repeat(50000), pending_work: "PEND-MARK", next_action: "NEXT-MARK" });
ok(longT.length <= 9000 && longT.includes("Pending: PEND-MARK") && longT.includes("Next: NEXT-MARK") && longT.split("z").length - 1 === 5000, "a 50,000-character summary is cut at 5000 and Pending and Next survive", longT.length);
ok(mod.__text({ id: 1, summary: "s", pending_work: "p".repeat(40000), next_action: "n".repeat(40000) }).length <= 9000, "the text is capped at 9000 characters whatever the fields hold");
const ch = mod.__chunks("a".repeat(2500));
ok(ch.length === 3 && ch.every((c) => c.length <= 1000) && ch.join("").length === 2500, "chunks are at most 1000 characters and lose nothing", ch.map((c) => c.length));
ok(mod.__chunks("").length === 0 && mod.__chunks("   \n  ").length === 0, "blank text makes no chunk");

// the source: the broken producer is gone and the hourly fire calls the new one
ok(!/SELECT id, content FROM handoffs/.test(src), "the query for the nonexistent handoffs.content column is gone");
ok(/async function runScheduled\(event, env, ctx\) \{\s*\n(\s*\/\/[^\n]*\n)+\s*try \{ const h = await withTimeout\(indexHandoffs\(env\)/.test(src), "runScheduled calls indexHandoffs first, on every fire, behind a timeout");
const [maj, min] = String(mod.__v).split("-")[0].split(".").map(Number);
ok(maj === 1 && min >= 9, "VERSION is at least 1.9.0", mod.__v);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
