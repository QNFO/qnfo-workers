// OUTREACH-LOOKUP-120M-1 offline suite (qnfo-cloud-ops 1.29.0): the lookup job runs every 120 minutes, finds an address for a
// needs-email row and moves it to pending, counts a failed lookup exactly as jobOutreach does (terminal skipped-no-email at 3),
// leaves rows with an address or another status alone, never sends, and is on the schedule and in the dispatch map.
// Run: node --no-warnings qnfo-cloud-ops/outreach-lookup.test.mjs   -> prints "N passed, 0 failed" (Node 22: node:sqlite)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const IMPORT = 'import { connect } from "cloudflare:sockets";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const patched = src.replace(IMPORT, "var connect = function () { throw new Error('sockets are stubbed in this test'); };") +
  "\nexport { jobOutreachLookup as __lookup, AMS_SCHEDULE as __sched, tickDue as __tickDue };\n";
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const stmtOn = (dbx, sql) => {
  let args = [];
  const self = {
    bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return self; },
    async all() { return { results: dbx.prepare(sql).all(...args) }; },
    async first() { return dbx.prepare(sql).get(...args) || null; },
    async run() { const r = dbx.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
  };
  return self;
};
const audit = new DatabaseSync(":memory:");
audit.exec(`CREATE TABLE outreach_queue (id TEXT PRIMARY KEY, paper_id TEXT, author TEXT, email TEXT, reason TEXT, status TEXT, created_at TEXT, sent_at TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);`);
const q = (id, paper, email, status, attempts, created) => audit.prepare("INSERT INTO outreach_queue (id, paper_id, email, status, attempts, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, paper, email, status, attempts, created);
q("found", "2410.00001", null, "needs-email", 0, "2026-10-13 01:00:00");
q("miss1", "2410.00002", null, "needs-email", 0, "2026-10-13 02:00:00");
q("miss3", "2410.00003", null, "needs-contact", 2, "2026-10-13 03:00:00");
q("hasmail", "2410.00004", "a@uni.edu", "needs-email", 0, "2026-10-13 04:00:00");
q("pending", "2410.00005", null, "pending", 0, "2026-10-13 05:00:00");
let fetched = [];
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  if (String(url).includes("2410.00001")) return new Response("<html>Contact: jane.doe@uni.edu</html>", { status: 200 });
  return new Response("not found", { status: 404 });
};
const sends = [];
const env = { AUDIT: { prepare: (sql) => stmtOn(audit, sql) }, SEND_EMAIL: { send: async (m) => { sends.push(m); } } };
const r = await mod.__lookup(env);
const row = (id) => audit.prepare("SELECT * FROM outreach_queue WHERE id = ?").get(id);
ok(r.status === "ok" && r.notes.candidates === 3 && r.notes.found === 1 && r.notes.retry === 1 && r.notes.terminal === 1, "three candidates: one found, one retried, one terminal: " + JSON.stringify(r));
ok(row("found").status === "pending" && row("found").email === "jane.doe@uni.edu" && row("found").attempts === 0, "a found address moves the row to pending for jobOutreach");
ok(row("miss1").status === "needs-email" && row("miss1").attempts === 1 && /attempt 1 \(outreach-lookup\)/.test(row("miss1").error), "a failed lookup counts one attempt, with its reason");
ok(row("miss3").status === "skipped-no-email" && row("miss3").attempts === 3 && /terminal/.test(row("miss3").error), "the third failed lookup is terminal, as in jobOutreach");
ok(row("hasmail").status === "needs-email" && row("pending").status === "pending" && !fetched.some((u) => /2410\.0000[45]/.test(u)), "rows with an address or another status are not looked up");
ok(sends.length === 0, "the lookup never sends");
ok(audit.prepare("SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'job-run' AND job = 'outreach-lookup'").get().n === 1, "every run writes its job-run row");
const S = mod.__sched["outreach-lookup"];
ok(S && S.days === "*" && S.times.length === 12, "scheduled 12 times a day, every day");
const mins = S.times.map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));
ok(mins.every((m, i) => (i === 0 ? m + 1440 - mins[mins.length - 1] : m - mins[i - 1]) === 120), "the slots are exactly 120 minutes apart, around the clock");
ok(/"outreach-lookup": jobOutreachLookup/.test(src) && mod.__sched.outreach.times.join() === "11:00" && mod.__sched.outreach.days === "1-5", "dispatched by name; the send job keeps its weekday 11:00 slot");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
