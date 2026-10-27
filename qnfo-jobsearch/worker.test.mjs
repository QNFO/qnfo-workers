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

// ---------------- JOBSEARCH-OPS-1
{
  // ledger embedded in the worker equals jobsearch/facts.json (root cause of ledger drift)
  const file = JSON.parse(readFileSync(join(here, "../jobsearch/facts.json"), "utf8"));
  ok(JSON.stringify(file) === JSON.stringify(T.LEDGER) || JSON.stringify(file.facts) === JSON.stringify(T.LEDGER.facts), "embedded ledger facts equal jobsearch/facts.json");
  ok(T.LEDGER.ledger_verified_on === file.ledger_verified_on, "ledger date parity");
  ok(T.dedupeKey({ company: "A", title: "X  Y", location: "NL" }) === T.dedupeKey({ company: "a", title: "x y", location: "nl" }), "dedupe key normalises");
  ok(T.feedPrefix("greenhouse:anthropic") === "gh:anthropic:" && T.feedPrefix("remotive:data") === "rm:", "feed prefixes");

  // e-mailed-code sign-in with a stubbed qnfo-email
  const sent = [];
  const env2 = { ...env, LOOP_TOKEN: undefined, EMAIL: { fetch: async (u, init) => { sent.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); } } };
  const [s1, b1] = await call("/api/auth/request", { method: "POST" }, env2);
  ok(s1 === 200 && b1.sent && /\*\*\*@/.test(b1.to) && !JSON.stringify(b1).includes("rowan"), "request sends a code and masks the address", b1);
  const code = (sent[0].body.match(/\b(\d{6})\b/) || [])[1];
  ok(sent.length === 1 && sent[0].to === "rowan.quni@qnfo.org" && sent[0].notify === true && /^\d{6}$/.test(code), "mail goes to the owner only", sent[0]);
  const [s2] = await call("/api/auth/request", { method: "POST" }, env2);
  ok(s2 === 200 && sent.length === 1, "second request within a minute sends nothing");
  const wrong = String((+code + 1) % 1000000).padStart(6, "0");
  const ver = (c) => call("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: c }) }, env2);
  ok((await ver(wrong))[0] === 401, "wrong code refused");
  ok((await ver("12ab"))[0] === 400, "malformed code refused");
  const [s3, b3, r3] = await ver(code);
  const cookie = r3.headers.get("set-cookie") || "";
  ok(s3 === 200 && /jobs_session=[0-9a-f]{64}/.test(cookie) && /HttpOnly/.test(cookie) && /Secure/.test(cookie) && /SameSite=Strict/.test(cookie) && b3.token.length === 64, "correct code opens a session cookie", cookie);
  ok((await ver(code))[0] !== 200, "a code works once");
  const sess = cookie.split(";")[0];
  ok(db.prepare("SELECT token_hash FROM jobsearch_sessions").all().every((r) => r.token_hash !== b3.token), "only a hash of the session token is stored");
  ok((await call("/api/auth/me", { headers: { cookie: sess } }, env2))[1].signed_in === true, "me: signed in");
  ok((await call("/api/auth/me", {}, env2))[1].signed_in === false, "me: signed out without cookie");
  db.prepare("UPDATE jobsearch_matches SET verified=1, resume_md='r', note_md='n', status='pending_owner_approval' WHERE id=?").run(id);
  const stat = (hdr, st) => call("/api/matches/" + encodeURIComponent(id) + "/status", { method: "POST", headers: { "content-type": "application/json", ...hdr }, body: JSON.stringify({ status: st }) }, env2);
  ok((await stat({}, "approved"))[0] === 401, "no session -> 401");
  ok((await stat({ cookie: sess }, "approved"))[0] === 200, "session cookie approves");
  ok((await stat({ authorization: "Bearer " + b3.token }, "applied"))[0] === 200, "bearer token works for API clients");
  await call("/api/auth/logout", { method: "POST", headers: { cookie: sess } }, env2);
  ok((await stat({ cookie: sess }, "rejected"))[0] === 401, "logout revokes the session");
  // brute force: 5 wrong tries kill the code
  db.prepare("DELETE FROM jobsearch_codes").run();
  db.prepare("INSERT INTO jobsearch_codes (code_hash, salt, created_ms, expires_ms) VALUES ('x','s',?,?)").run(Date.now(), Date.now() + 60000);
  for (let k = 0; k < 5; k++) await ver("000000");
  ok((await ver("000000"))[0] === 429, "5 wrong tries lock the code");
  // request cap: 3 per hour
  db.prepare("DELETE FROM jobsearch_codes").run();
  const t = Date.now();
  for (let k = 0; k < 3; k++) db.prepare("INSERT INTO jobsearch_codes (code_hash, salt, created_ms, expires_ms, used) VALUES ('x','s',?,?,1)").run(t - (k + 2) * 120000, t + 1);
  ok((await call("/api/auth/request", { method: "POST" }, env2))[0] === 429, "code requests capped at 3 per hour");
  ok((await call("/api/auth/request", { method: "POST" }, { ...env, EMAIL: undefined }))[0] === 503, "no EMAIL binding -> 503, not a crash");

  // lifecycle, feed health, self-heal
  db.prepare("INSERT INTO jobsearch_runs (started_at) VALUES (?)").run(new Date(Date.now() - 3600000).toISOString());
  db.prepare("INSERT INTO jobsearch_matches (id, first_seen, last_seen, company, title, location, url, tier, score, why_json, flags_json, verified, status) VALUES ('gh:anthropic:gone', ?1, ?1, 'A', 'Old role', 'x', 'u', 'B', 50, '[]', '[]', 1, 'pending_owner_approval')").run(new Date(Date.now() - 5 * 86400000).toISOString());
  db.prepare("INSERT INTO jobsearch_matches (id, first_seen, last_seen, company, title, location, url, tier, score, why_json, flags_json, verified, status) VALUES ('lv:palantir:keep', ?1, ?1, 'P', 'Old role 2', 'x', 'u', 'B', 50, '[]', '[]', 1, 'pending_owner_approval')").run(new Date(Date.now() - 5 * 86400000).toISOString());
  globalThis.fetch = async (u) => {
    if (u.includes("lever.co")) throw new Error("boom");               // palantir feed down: its match must survive
    if (u.includes("boards-api.greenhouse.io/v1/boards/anthropic")) return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
    return new Response(JSON.stringify({ jobs: [], data: [] }), { status: 200 });
  };
  db.prepare("DELETE FROM jobsearch_codes").run();
  await w.scheduled({}, env2, { waitUntil: (p) => p }); await new Promise((r) => setTimeout(r, 4000));
  const st = (i) => db.prepare("SELECT status FROM jobsearch_matches WHERE id=?").get(i)?.status;
  ok(st("gh:anthropic:gone") === "expired", "match gone from an answering feed expires", st("gh:anthropic:gone"));
  ok(st("lv:palantir:keep") === "pending_owner_approval", "a failed feed expires nothing");
  const feed = db.prepare("SELECT * FROM jobsearch_feeds WHERE feed='lever:palantir'").get();
  ok(feed && feed.consecutive_fail >= 1 && /boom/.test(feed.last_error), "feed failure recorded", feed);
  const stuck = db.prepare("SELECT finished_at, errors_json FROM jobsearch_runs WHERE finished_at IS NOT NULL AND errors_json LIKE '%did not finish%'").get();
  ok(!!stuck, "run left open for an hour is closed by the next run");
  const ops = (await call("/api/ops", {}, env2));
  ok(ops[1].checks.length === 8 && ops[1].checks.find((c) => c.fm === "jobsearch-auth-unavailable").ok, "ops report lists 8 checks, auth ok", ops[1].checks.filter((c) => !c.ok));
  ok(ops[1].checks.find((c) => c.fm === "jobsearch-cron-stalled").ok, "ops: cron fresh");
  ok(db.prepare("SELECT v FROM jobsearch_meta WHERE k='ledger_verified_on'").get().v === "2026-10-01", "ledger date recorded each run");
  ok((await call("/health", {}, env2))[1].ledger_verified_on === "2026-10-01", "health shows ledger date");
}

globalThis.fetch = realFetch;
console.log(`qnfo-jobsearch: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
