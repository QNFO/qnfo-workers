// personal-companion 1.12.2 BROADCAST-BATCH-1 suite (agent_issues 2042, charter pillar: personal).
// Failure mode: a piece broadcast or the daily digest did two opt-out lookups and one send per subscriber in one invocation,
// about 3 subrequests each, so a list above about 330 confirmed subscribers ran into the per-invocation subrequest limit and
// stopped part way with no record of who had been mailed. Proven here: opt-outs are read in batches, one invocation sends at
// most SEND_CAP_PER_RUN, the hourly tick resumes from a cursor until every confirmed subscriber is reached exactly once,
// suppressed addresses are never mailed, an unreadable opt-out list sends nothing (fail closed), and a finished run is not
// sent again.
// Run: node personal-companion/broadcast-batch.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};")).toString("base64"));
const { broadcast, sendDigest, resumeSendRuns, suppressedSet } = mod;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const SUBREQ_LIMIT = 900; // under the platform's 1000, with room for the rest of the hourly tick
const CAP = 250;

function setup(opts) {
  opts = opts || {};
  const p = new DatabaseSync(":memory:"), a = new DatabaseSync(":memory:"), sent = [];
  const T = { p, a, sent, calls: 0 };
  const wrap = (db, deny) => ({ prepare(sql) { const mk = (args) => ({
    bind: (...x) => mk(x),
    run: async () => { T.calls++; if (deny && deny(sql)) throw new Error("D1_ERROR: unavailable"); const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
    first: async () => { T.calls++; if (deny && deny(sql)) throw new Error("D1_ERROR: unavailable"); return db.prepare(sql).get(...args) || null; },
    all: async () => { T.calls++; if (deny && deny(sql)) throw new Error("D1_ERROR: unavailable"); return { results: db.prepare(sql).all(...args) }; } }); return mk([]); } });
  p.exec("CREATE TABLE companion_subscribers (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, status TEXT NOT NULL DEFAULT 'pending', token TEXT NOT NULL, created_at TEXT NOT NULL, confirmed_at TEXT)");
  p.exec("CREATE TABLE companion_pieces (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, form TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT, lede TEXT, body_md TEXT NOT NULL, anchor_json TEXT, quality_json TEXT, word_count INTEGER, day TEXT, created_at TEXT NOT NULL)");
  a.exec("CREATE TABLE email_suppression (email TEXT PRIMARY KEY, reason TEXT)");
  a.exec("CREATE TABLE contact_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, suppress INTEGER DEFAULT 0)");
  const ins = p.prepare("INSERT INTO companion_subscribers (email,status,token,created_at) VALUES (?,?,?,'x')");
  for (let i = 0; i < (opts.n || 1203); i++) ins.run("s" + i + "@x.test", i % 10 === 0 ? "pending" : "confirmed", "t" + i);
  // opt-outs: ten in email_suppression (one written in capitals), five in contact_ledger (one overlaps), three ledger rows not suppressed
  for (const i of [1, 2, 3, 11, 255, 256, 501, 777, 1001, 1202]) a.prepare("INSERT INTO email_suppression VALUES (?, 'unsub')").run(i === 777 ? "S777@X.TEST" : "s" + i + "@x.test");
  for (const i of [4, 5, 299, 812, 1001]) a.prepare("INSERT INTO contact_ledger (email, suppress) VALUES (?, 1)").run("s" + i + "@x.test");
  for (const i of [6, 7, 8]) a.prepare("INSERT INTO contact_ledger (email, suppress) VALUES (?, 0)").run("s" + i + "@x.test");
  T.optedOut = new Set([1, 2, 3, 11, 255, 256, 501, 777, 1001, 1202, 4, 5, 299, 812].map((i) => "s" + i + "@x.test"));
  T.env = {
    PERSONAL: wrap(p),
    AUDIT: wrap(a, opts.denyAudit),
    EMAIL: {},
    SEND_EMAIL: { send: async (m) => { T.calls++; if (opts.failFor && opts.failFor(m.to)) throw new Error("bounce"); sent.push(m); } }
  };
  T.confirmed = p.prepare("SELECT email FROM companion_subscribers WHERE status='confirmed'").all().map((r) => r.email);
  T.expected = T.confirmed.filter((e) => !T.optedOut.has(e));
  return T;
}
const state = (T, key) => T.p.prepare("SELECT * FROM companion_broadcasts WHERE key = ?").get(key);

// ---- (1) suppressedSet reads in batches and matches case-insensitively
let T = setup();
T.calls = 0;
const set = await suppressedSet(T.env, T.confirmed);
ok(T.calls === 2 * Math.ceil(T.confirmed.length / 50), "opt-outs are read two queries per 50 addresses (" + T.calls + " calls for " + T.confirmed.length + ")");
ok(set.has("s777@x.test") && set.has("s812@x.test") && set.has("s1001@x.test"), "both opt-out lists count, capitals included");
ok(!set.has("s6@x.test") && !set.has("s9@x.test"), "a ledger row with suppress = 0 and an unlisted address are not suppressed");

// ---- (2) a broadcast sends at most CAP per invocation, within the subrequest budget
T = setup();
T.p.prepare("INSERT INTO companion_pieces (slug, form, title, lede, body_md, day, created_at) VALUES ('p1','essay','Piece one','A lede.','Body text.','2026-10-06','x')").run();
T.calls = 0;
let r = await broadcast(T.env, "p1", "https://reading.q08.org");
ok(r.ok && r.batch === CAP && r.sent + r.suppressed + r.failed === CAP && r.resume === true, "first invocation handles one capped batch and asks to resume (" + JSON.stringify(r) + ")");
ok(T.calls < SUBREQ_LIMIT && T.calls <= CAP + 20, "first invocation stays within the subrequest budget (" + T.calls + " calls; the per-subscriber path would have spent about " + 3 * CAP + ")");
let st = state(T, "p1");
ok(st && st.done === 0 && st.last_id > 0 && st.sent === r.sent, "the cursor row records progress (" + JSON.stringify(st) + ")");
ok(T.sent.every((m) => /Unsubscribe: https:\/\/reading\.q08\.org\/unsubscribe\?t=t\d+/.test(m.text) && /Read online: https:\/\/reading\.q08\.org\/p\/p1/.test(m.text) && m.subject === "Piece one"), "piece mail keeps title, lede, link and the recipient's own unsubscribe token");

// ---- (3) the hourly tick resumes until every confirmed subscriber is reached exactly once
let ticks = 0, maxCalls = 0;
for (;;) {
  T.calls = 0;
  const t = await resumeSendRuns(T.env);
  maxCalls = Math.max(maxCalls, T.calls);
  if (t.idle) break;
  if (++ticks > 10) break;
}
st = state(T, "p1");
const to = T.sent.map((m) => m.to);
ok(st.done === 1, "the run finishes (" + JSON.stringify(st) + ")");
ok(ticks === Math.ceil(T.confirmed.length / CAP) - 1, "remaining batches take one tick each (" + ticks + " ticks)");
ok(maxCalls <= CAP + 20, "no resume tick exceeds the budget (" + maxCalls + " calls max)");
ok(to.length === T.expected.length && new Set(to).size === to.length, "each subscriber is mailed once (" + to.length + " sent, " + T.expected.length + " expected)");
ok(T.expected.every((e) => to.includes(e)), "nobody who should be mailed is left out");
ok(!to.some((e) => T.optedOut.has(e.toLowerCase())), "no opted-out address is mailed");
ok(!to.some((e) => !T.confirmed.includes(e)), "no pending subscriber is mailed");
ok(st.sent === T.expected.length && st.suppressed === T.optedOut.size && st.failed === 0, "totals add up (" + st.sent + " sent, " + st.suppressed + " suppressed)");

// ---- (4) a finished run is not sent again
T.sent.length = 0;
r = await broadcast(T.env, "p1", "https://reading.q08.org");
ok(r.ok && r.already && T.sent.length === 0, "a second broadcast of the same piece sends nothing (" + JSON.stringify(r) + ")");

// ---- (5) fail closed: unreadable opt-out lists mean nobody is mailed and the cursor stays
T = setup({ denyAudit: (sql) => /email_suppression/.test(sql) });
T.p.prepare("INSERT INTO companion_pieces (slug, form, title, lede, body_md, day, created_at) VALUES ('p2','essay','Piece two','','Body.','2026-10-06','x')").run();
r = await broadcast(T.env, "p2", null);
st = state(T, "p2");
ok(!r.ok && /fail closed/.test(r.error) && T.sent.length === 0, "no send when email_suppression cannot be read (" + JSON.stringify(r) + ")");
ok(st && st.done === 0 && st.last_id === 0 && st.sent === 0, "the cursor does not move, so the next tick retries (" + JSON.stringify(st) + ")");
T.env.AUDIT = setup().env.AUDIT; // the lists are readable again
r = await resumeSendRuns(T.env);
ok(r.ok && r.batch === CAP && T.sent.length > 0, "the retry on the next tick sends (" + JSON.stringify(r) + ")");

// ---- (6) a failed send is counted and does not stop the batch
T = setup({ failFor: (e) => e === "s21@x.test", n: 60 });
T.p.prepare("INSERT INTO companion_pieces (slug, form, title, lede, body_md, day, created_at) VALUES ('p3','essay','Piece three','','Body.','2026-10-06','x')").run();
r = await broadcast(T.env, "p3", null);
ok(r.ok && r.done && r.failed === 1 && r.sent === T.expected.length - 1, "one bounce is counted, the rest go out, a short list finishes in one run (" + JSON.stringify(r) + ")");

// ---- (7) the digest uses the same capped, resumable run
T = setup();
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
T.p.prepare("INSERT INTO companion_pieces (slug, form, title, lede, body_md, day, created_at) VALUES ('d1','essay','Digest piece','','Body.',?,'x')").run(day);
r = await sendDigest(T.env);
ok(r.ok && r.key === "digest:" + day && r.batch === CAP && r.pieces === 1 && r.resume, "the digest sends one capped batch keyed by day (" + JSON.stringify(r) + ")");
for (let i = 0; i < 10; i++) { const t = await resumeSendRuns(T.env); if (t.idle) break; }
ok(state(T, "digest:" + day).done === 1 && T.sent.length === T.expected.length && new Set(T.sent.map((m) => m.to)).size === T.sent.length, "the tick completes the digest, each subscriber once (" + T.sent.length + ")");
ok(T.sent.every((m) => m.subject === "Reading — daily digest" && m.text.includes("- Digest piece — https://reading.q08.org/p/d1") && /unsubscribe\?t=t\d+/.test(m.text)), "resumed digest mail carries the day's list and the recipient's token");
T.sent.length = 0;
r = await sendDigest(T.env);
ok(r.already && T.sent.length === 0, "a second digest on the same day sends nothing (" + JSON.stringify(r) + ")");

// ---- (8) a run whose piece was deleted closes instead of blocking the queue
T = setup({ n: 30 });
T.p.exec("CREATE TABLE companion_broadcasts (key TEXT PRIMARY KEY, last_id INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, suppressed INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0, origin TEXT, started_at TEXT, updated_at TEXT)");
T.p.prepare("INSERT INTO companion_broadcasts (key, started_at) VALUES ('gone', '2026-10-01')").run();
r = await resumeSendRuns(T.env);
ok(!r.ok && state(T, "gone").done === 1 && T.sent.length === 0, "a missing piece closes its run without mailing (" + JSON.stringify(r) + ")");
ok((await resumeSendRuns(T.env)).idle === true, "then the tick is idle");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
