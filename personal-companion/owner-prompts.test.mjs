// personal-companion 1.9.0 OWNER-PROMPTS-1 suite (charter pillar: personal).
// Loads the real worker.js and drives deliverOwnerPrompts against an in-memory SQLite qnfo-audit and a stubbed EMAIL binding.
// Proves: a due row is mailed once as an owner notice (handoff:true, to the owner only) and marked sent; priority order;
// one mail per call; daily cap; quiet hours; not_before respected; failures are recorded on the row (attempts, last_error)
// and retried up to the limit; no EMAIL/AUDIT binding is a skip, not a throw; the opt-out table is never read or written.
// Run: node personal-companion/owner-prompts.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};")).toString("base64"));
const { deliverOwnerPrompts } = mod;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const wrap = (db) => ({ prepare(sql) { const mk = (args) => ({
  bind: (...a) => mk(a),
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  first: async () => db.prepare(sql).get(...args) || null,
  all: async () => ({ results: db.prepare(sql).all(...args) }) }); return mk([]); } });
function setup(emailResult) {
  const db = new DatabaseSync(":memory:"); const calls = [];
  const sqls = [];
  const audit = wrap(db); const orig = audit.prepare; audit.prepare = (q) => { sqls.push(q); return orig(q); };
  const EMAIL = { fetch: async (url, init) => { calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization }); return emailResult ? emailResult(calls.length) : new Response("{}", { status: 200 }); } };
  return { db, env: { AUDIT: audit, EMAIL }, calls, sqls };
}
const noon = new Date("2026-10-06T10:00:00Z").getTime();      // 12:00 Amsterdam
const lateNight = new Date("2026-10-06T21:30:00Z").getTime(); // 23:30 Amsterdam
const early = new Date("2026-10-06T04:30:00Z").getTime();     // 06:30 Amsterdam
const add = (db, kind, ref, subj, pri, nb) => db.prepare("INSERT INTO owner_questions (kind, ref, subject, body, priority, not_before) VALUES (?,?,?,?,?,?)").run(kind, ref, subj, "body of " + subj, pri, nb || null);

let T = setup(); await deliverOwnerPrompts(T.env, noon);
ok(T.calls.length === 0, "empty queue sends nothing");
add(T.db, "after-event", "a", "A: did you go?", 5); add(T.db, "after-event", "b", "B: did you go?", 1);
let r = await deliverOwnerPrompts(T.env, noon);
ok(r.sent === 1 && T.calls.length === 1, "exactly one mail per call (" + JSON.stringify(r) + ")");
ok(T.calls[0].body.subject === "B: did you go?", "lowest priority number goes first");
ok(T.calls[0].body.handoff === true && T.calls[0].body.to === "rwnquni@outlook.com" && T.calls[0].url === "https://email.internal/send" && T.calls[0].auth === undefined, "owner notice to the owner through the email binding, authenticated by binding props (no key header)");
ok(T.db.prepare("SELECT sent_at FROM owner_questions WHERE ref='b'").get().sent_at, "row marked sent");
await deliverOwnerPrompts(T.env, noon);
ok(T.calls.length === 2, "second row goes on the next call");
add(T.db, "after-event", "c", "C", 5);
r = await deliverOwnerPrompts(T.env, noon);
ok(r.skipped === "daily cap" && T.calls.length === 2, "daily cap of two stops a third mail (" + JSON.stringify(r) + ")");

T = setup(); await deliverOwnerPrompts(T.env, noon); add(T.db, "k", "q1", "Q", 5);
r = await deliverOwnerPrompts(T.env, lateNight); ok(r.skipped === "quiet hours" && T.calls.length === 0, "no mail at 23:30 Amsterdam");
r = await deliverOwnerPrompts(T.env, early); ok(r.skipped === "quiet hours" && T.calls.length === 0, "no mail at 06:30 Amsterdam");
T.db.exec("UPDATE owner_questions SET not_before = '2026-10-07 10:00:00'");
r = await deliverOwnerPrompts(T.env, noon); ok(T.calls.length === 0, "not_before in the future is held");
T.db.exec("UPDATE owner_questions SET not_before = '2026-10-06 08:00:00'");
r = await deliverOwnerPrompts(T.env, noon); ok(T.calls.length === 1, "not_before in the past is delivered");

T = setup(() => new Response("nope", { status: 401 })); await deliverOwnerPrompts(T.env, noon); add(T.db, "k", "f1", "F", 5);
r = await deliverOwnerPrompts(T.env, noon);
const row = T.db.prepare("SELECT sent_at, attempts, last_error FROM owner_questions WHERE ref='f1'").get();
ok(!row.sent_at && row.attempts === 1 && /email 401 nope/.test(row.last_error) && r.error, "a failed send is recorded verbatim on the row, not marked sent (" + JSON.stringify(row) + ")");
for (let i = 0; i < 6; i++) await deliverOwnerPrompts(T.env, noon);
ok(T.db.prepare("SELECT attempts FROM owner_questions WHERE ref='f1'").get().attempts === 5 && T.calls.length === 5, "gives up after five attempts");

T = setup(); r = await deliverOwnerPrompts({ AUDIT: T.env.AUDIT }, noon); ok(r.skipped === "no mail binding", "missing mail binding is a skip");
r = await deliverOwnerPrompts({ EMAIL: T.env.EMAIL }, noon); ok(r.skipped === "no AUDIT binding", "missing AUDIT binding is a skip");
await deliverOwnerPrompts(T.env, noon); add(T.db, "k", "z", "Z", 5); await deliverOwnerPrompts(T.env, noon);
ok(!T.sqls.some((q) => /email_suppression/i.test(q)), "the opt-out table is never touched by prompt delivery");

// direct send path
{
  const T2 = setup(); const sent = [];
  T2.env.SEND_EMAIL = { send: async (m) => { sent.push(m); } };
  await deliverOwnerPrompts(T2.env, noon); add(T2.db, "k", "d1", "D subject", 5);
  const r2 = await deliverOwnerPrompts(T2.env, noon);
  ok(r2.sent === 1 && sent.length === 1 && sent[0].to === "rwnquni@outlook.com" && sent[0].subject === "D subject" && sent[0].text === "body of D subject" && T2.calls.length === 0, "SEND_EMAIL is preferred and the email service is not called");
  const T3 = setup(); T3.env.SEND_EMAIL = { send: async () => { throw new Error("E_SEND rejected"); } };
  await deliverOwnerPrompts(T3.env, noon); add(T3.db, "k", "d2", "D2", 5); await deliverOwnerPrompts(T3.env, noon);
  const w = T3.db.prepare("SELECT sent_at, attempts, last_error FROM owner_questions WHERE ref='d2'").get();
  ok(!w.sent_at && w.attempts === 1 && w.last_error === "E_SEND rejected", "a SEND_EMAIL failure is recorded verbatim");
  console.log(pass + " passed, " + fail + " failed (incl. direct path)"); process.exit(fail ? 1 : 0);
}
