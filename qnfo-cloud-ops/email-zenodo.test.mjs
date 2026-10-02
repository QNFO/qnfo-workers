// EMAIL-TRIAGE-D1-1 + ZENODO-UA-1 offline suite (qnfo-cloud-ops 1.17.1). Replays jobEmailTriage and jobZenodoStats from
// worker.js against in-memory SQLite D1s and a stubbed fetch. Proves: the triage reads qnfo-audit.emails itself (no
// qnfo-email call, no EMAIL_API_KEY), marks only noise as spam, leaves actionable mail alone and still flags outreach
// replies; the Zenodo fetch sends an honest User-Agent (never a spoofed browser), and a refusal is counted by HTTP status.
// Run: node qnfo-cloud-ops/email-zenodo.test.mjs   -> prints "N passed, 0 failed"
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
const zenodoSrc = slice("var ZENODO_UA", '__name(jobZenodoStats, "jobZenodoStats");');

let digests = [];
let fetchCalls = [];
let fetchImpl = async () => new Response("{}", { status: 500 });
const api = new Function("VERSION", "NL", "fetchStub", "digests",
  "var __name = function(f) { return f; };\n" +
  "var fetch = function(u, i) { return fetchStub(u, i); };\n" +
  "async function storeDigest(env, job, subject, text) { digests.push({ job: job, subject: subject, text: text }); return { stored: true, id: 'dg-' + job }; }\n" +
  "async function cfEmail() { throw new Error('qnfo-email must not be called by the triage'); }\n" +
  triageSrc + "\n" + zenodoSrc + "\nreturn { jobEmailTriage, jobZenodoStats, ZENODO_UA, emailTriageSetStatus };"
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

// ---------- ZENODO-UA-1 ----------
ok(!/Chrome|Safari|Windows NT|AppleWebKit/.test(api.ZENODO_UA) && api.ZENODO_UA.startsWith("qnfo-cloud-ops/" + VERSION), "the Zenodo User-Agent names the worker honestly (" + api.ZENODO_UA + ")");
const living = new DatabaseSync(":memory:");
living.exec("CREATE TABLE papers (zenodo_doi TEXT, slug TEXT, status TEXT)");
for (const [doi, slug] of [["10.5281/zenodo.111", "a"], ["10.5281/zenodo.222", "b"], ["10.5281/zenodo.333", "c"], ["pending", "d"]]) living.prepare("INSERT INTO papers VALUES (?, ?, 'published')").run(doi, slug);
audit.exec(`CREATE TABLE zenodo_stats (doi TEXT PRIMARY KEY, conceptdoi TEXT, title TEXT, slug TEXT, downloads INTEGER, unique_downloads INTEGER, views INTEGER,
  unique_views INTEGER, version_downloads INTEGER, prev_downloads INTEGER, prev_views INTEGER, fetched_at TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE zenodo_attribution_audit (doi TEXT PRIMARY KEY, creators TEXT, related TEXT, creator_ok INTEGER, obsoleted_ok INTEGER, audited_at TEXT);`);
// Zenodo's behaviour as probed on 2026-10-02: a browser-like UA gets 403, an honest one gets the record.
fetchCalls = [];
fetchImpl = async (u, i) => {
  const ua = (i && i.headers && i.headers["User-Agent"]) || "";
  if (/Chrome|Safari/.test(ua)) return new Response("<html>403 Forbidden unusual traffic</html>", { status: 403 });
  const id = String(u).split("/").pop();
  if (id === "333") return new Response("{}", { status: 429 });
  return new Response(JSON.stringify({ doi: "10.5281/zenodo." + id, conceptdoi: null, metadata: { title: "Paper " + id, creators: [{ name: "Quni-Gudzinas, Rowan Brad" }] }, stats: { downloads: 10, unique_downloads: 8, views: 20, unique_views: 15, version_downloads: 10 } }), { status: 200, headers: { "Content-Type": "application/json" } });
};
digests.length = 0;
const z = await api.jobZenodoStats({ AUDIT: d1(audit), LIVING: d1(living) });
ok(fetchCalls.length === 3 && fetchCalls.every((c) => c.i.headers["User-Agent"] === api.ZENODO_UA && c.i.headers.Accept === "application/json"), "every record fetch carries the honest User-Agent");
ok(z.status === "ok" && z.notes.fetched === 2 && z.notes.errors === 1 && z.notes.failures["429"] === 1, "two records stored, the 429 counted by status (" + JSON.stringify(z.notes.failures) + ")");
ok(audit.prepare("SELECT COUNT(*) n FROM zenodo_stats").get().n === 2, "zenodo_stats holds the fetched records");
ok(/errors 1 \{"429":1\}/.test(digests[0].text), "the digest names the refusal status");
fetchImpl = async () => new Response("<html>403</html>", { status: 403 });
audit.exec("DELETE FROM zenodo_stats");
const zf = await api.jobZenodoStats({ AUDIT: d1(audit), LIVING: d1(living) });
ok(zf.status === "error" && zf.notes.fetched === 0 && zf.notes.failures["403"] === 3, "an all-refused run is an error with the 403s counted (the 2026-09-05..19 failure is now self-explaining)");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
