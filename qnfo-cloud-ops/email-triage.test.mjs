// EMAIL-TRIAGE-D1-1 offline suite (qnfo-cloud-ops 1.17.1). Replays jobEmailTriage from
// worker.js against in-memory SQLite D1s and a stubbed fetch. Proves: the triage reads qnfo-audit.emails itself (no
// qnfo-email call, no EMAIL_API_KEY), marks only noise as spam, leaves actionable mail alone and still flags outreach
// replies.
// Run: node qnfo-cloud-ops/email-triage.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
function slice(start, end) {
  const a = src.indexOf(start), b = src.indexOf(end);
  if (a < 0 || b < a) throw new Error("block not found in worker.js: " + start);
  return src.slice(a, b + end.length);
}
const VERSION = (/var VERSION = "([^"]+)"/.exec(src) || [])[1];
const triageSrc = slice("var EMAIL_TRIAGE_STATUSES", '__name(jobEmailTriage, "jobEmailTriage");');

let digests = [];
let fetchCalls = [];
let fetchImpl = async () => new Response("{}", { status: 500 });
const api = new Function("VERSION", "NL", "fetchStub", "digests",
  "var __name = function(f) { return f; };\n" +
  "var fetch = function(u, i) { return fetchStub(u, i); };\n" +
  "async function storeDigest(env, job, subject, text) { digests.push({ job: job, subject: subject, text: text }); return { stored: true, id: 'dg-' + job }; }\n" +
  "async function cfEmail() { throw new Error('qnfo-email must not be called by the triage'); }\n" +
  triageSrc + "\nreturn { jobEmailTriage, emailTriageSetStatus };"
)(VERSION, "\n", (u, i) => { fetchCalls.push({ u: String(u), i }); return fetchImpl(u, i); }, digests);

function d1(db) {
  return {
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
      };
      return st;
    }
  };
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// ---------- EMAIL-TRIAGE-D1-1 ----------
const audit = new DatabaseSync(":memory:");
audit.exec(`CREATE TABLE emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL,
  subject TEXT, body_text TEXT, classification TEXT DEFAULT 'general', status TEXT DEFAULT 'received', processing_ms INTEGER,
  received_at TEXT DEFAULT (datetime('now')), processed_at TEXT);
CREATE TABLE outreach_log (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, subject TEXT, message_id TEXT, sent_at TEXT, status TEXT);`);
const addMail = (mid, sender, subject, status) => audit.prepare("INSERT INTO emails (message_id, sender, recipient, subject, status) VALUES (?, ?, 'hello@qnfo.org', ?, ?)").run(mid, sender, subject, status);
addMail("m1", "Program Officer <po@funder.example>", "Your application", "processed");
addMail("m2", "news@mdpi.com", "Call for papers", "processed");
addMail("m3", "noreply@service.example", "Receipt", "processed");
addMail("m4", "srs0=abc@forwarder.example", "fwd", "processed");
addMail("m5", "Researcher <researcher@uni.example>", "Re: your paper", "processed");
addMail("m6", "someone@else.example", "already archived", "archived");
audit.prepare("INSERT INTO outreach_log (email, subject, status) VALUES ('researcher@uni.example', 'paper', 'sent')").run();
const env = { AUDIT: d1(audit) };   // no EMAIL binding, no EMAIL_API_KEY
const out = await api.jobEmailTriage(env);
ok(out.status === "ok" && out.notes.source === "d1", "the triage runs without EMAIL_API_KEY and reads D1 (" + JSON.stringify(out.notes) + ")");
ok(out.notes.checked === 5 && out.notes.actionable === 2 && out.notes.noise === 3 && out.notes.marked_spam === 3, "5 processed mails: 2 actionable, 3 noise marked spam");
const st = Object.fromEntries(audit.prepare("SELECT message_id, status FROM emails").all().map((r) => [r.message_id, r.status]));
ok(st.m1 === "processed" && st.m5 === "processed", "actionable mail keeps its status");
ok(st.m2 === "spam" && st.m3 === "spam" && st.m4 === "spam", "noise (spam sender, noreply, srs) is marked spam");
ok(st.m6 === "archived", "mail outside status 'processed' is not read or touched");
ok(audit.prepare("SELECT status FROM outreach_log").get().status === "replied", "an inbound mail from an outreach contact still marks the outreach row replied");
ok(fetchCalls.length === 0, "no network call at all (no qnfo-email route)");
ok(digests.length === 1 && /2 actionable, 3 noise/.test(digests[0].text) && /po@funder\.example/.test(digests[0].text), "the digest lists the actionable mail");
ok(!(await api.emailTriageSetStatus(env, 1, "deleted")) && !(await api.emailTriageSetStatus(env, 0, "spam")), "only qnfo-email's allowed statuses and a real id are written");
const broken = await api.jobEmailTriage({ AUDIT: { prepare() { throw new Error("no such table: emails"); } } });
ok(broken.status === "error" && /emails read: no such table/.test(broken.notes.error), "a D1 read failure is an error run, not a silent ok");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
