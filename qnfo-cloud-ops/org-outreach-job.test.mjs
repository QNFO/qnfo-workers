// ORG-OUTREACH-1: the executor, run for real. Loads the generated block into a sandbox with the worker globals it needs, an in-memory SQLite behind a D1-shaped
// prepare/bind/first/all/run, and a recording SEND_EMAIL. Proves: draft is the default and sends nothing; drafts leave the queue; suppression and prior contact keep a
// target out; live needs mode, kill switch and postal address; a live send writes outreach_log and contact_ledger (so the shared cap and the first lane see it);
// the caps hold; a later opt-out closes the log row and the target.
// Run: node --no-warnings qnfo-cloud-ops/org-outreach-job.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildBlock } from "../scripts/inline-org-outreach.mjs";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };

function d1(db) {
  const wrap = (sql) => { let args = []; const o = {
    bind: (...a) => { args = a; return o; },
    first: async () => db.prepare(sql).get(...args) || null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; } }; return o; };
  return { prepare: wrap };
}
function setup(cfg = {}, kill = "1") {
  const audit = new DatabaseSync(":memory:"), outreach = new DatabaseSync(":memory:");
  audit.exec(`CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
    CREATE TABLE email_suppression (email TEXT); CREATE TABLE contact_ledger (email TEXT PRIMARY KEY, name TEXT, first_contact TEXT, last_contact TEXT, contact_count INTEGER, status TEXT, suppress INTEGER);
    CREATE TABLE outreach_log (id INTEGER PRIMARY KEY, email TEXT, subject TEXT, message_id TEXT, sent_at TEXT, status TEXT);
    CREATE TABLE emails (id INTEGER PRIMARY KEY, sender TEXT, recipient TEXT, subject TEXT, body_text TEXT, received_at TEXT, status TEXT);
    CREATE TABLE jobsearch_matches (id TEXT PRIMARY KEY, company TEXT, title TEXT, url TEXT, score INTEGER, last_seen TEXT);`);
  audit.exec("DROP TABLE email_suppression; CREATE TABLE email_suppression (email TEXT, reason TEXT, source TEXT);");
  audit.exec(readFileSync(new URL("../migrations/2026-11-14-org-outreach.sql", import.meta.url), "utf8"));
  audit.exec(readFileSync(new URL("../migrations/2026-11-14-org-targets-discovery.sql", import.meta.url), "utf8"));
  audit.exec(readFileSync(new URL("../migrations/2026-11-14-org-outreach-log-checked.sql", import.meta.url), "utf8"));
  for (const [k, v] of Object.entries(cfg)) audit.prepare("UPDATE ops_config SET value = ? WHERE key = ?").run(v, k);
  outreach.exec("CREATE TABLE pipeline_state (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE contacts (email TEXT, suppress INTEGER); CREATE TABLE sends (status TEXT, sent_at TEXT, contact_id INTEGER, kind TEXT);");
  outreach.prepare("INSERT INTO pipeline_state VALUES ('external_sends_enabled', ?)").run(kill);
  const mk = (i, seg, dom) => audit.prepare("INSERT INTO org_targets (org, email, segment, fit, fit_note, source_url, status) VALUES (?,?,?,?,?,?, 'queued')")
    .run("Org " + i, "info@" + dom, seg, 0.9 - i / 100, "your published mission is oversight of autonomous AI systems in deployment", "https://" + dom + "/about");
  mk(1, "ai-lab", "alpha.org"); mk(2, "funder", "beta.org"); mk(3, "third-sector", "gamma.org"); mk(4, "ai-firm", "delta.org");
  const sent = [];
  const env = { AUDIT: d1(audit), OUTREACH: d1(outreach), SEND_EMAIL: { send: async (m) => { sent.push(m); return { messageId: "m" + sent.length }; } } };
  const events = [];
  const ctx = vm.createContext({ console, URL, AbortSignal, __name: (f) => f, WORKER_NAME: "t", OUTREACH_ACTIVATION_AT: 0, OUTREACH_FROM: "qnfo@example.test", OUTREACH_SHARED_DAILY_CAP: 8, OUTREACH_SHARED_DOMAIN_CAP: 3,
    rndB36: () => "x", recordEvent: async (...a) => { events.push(a); }, outreachSendEvidence: () => ({}),
    outreachSuppressed: async (e, email) => !!(audit.prepare("SELECT 1 FROM email_suppression WHERE lower(email)=?").get(String(email).toLowerCase())),
    outreachSharedCount: async (e, day, email) => { const a = audit.prepare("SELECT COUNT(*) n FROM outreach_log WHERE sent_at LIKE ?").get(day + "%"); return { n: Number(a.n), d: 0 }; } });
  vm.runInContext(buildBlock(new URL("../", import.meta.url)).replace(/^\/\/ ----.*$/gm, "") + "\n;globalThis.jobOrgOutreach = jobOrgOutreach; globalThis.jobOrgDiscover = jobOrgDiscover;", ctx);
  return { audit, env, sent, run: () => ctx.jobOrgOutreach(env), discover: () => ctx.jobOrgDiscover(env) };
}

{ // default: draft, nothing sent
  const s = setup();
  const r = await s.run();
  ok(r.status === "ok" && r.notes.mode === "draft", "default mode is draft", r);
  ok(s.sent.length === 0, "draft sends nothing");
  ok(r.notes.drafted === 3 && s.audit.prepare("SELECT COUNT(*) n FROM org_outreach_log WHERE mode='draft'").get().n === 3, "drafts are the daily lane cap of 3", r.notes);
  ok(s.audit.prepare("SELECT COUNT(*) n FROM org_targets WHERE status='drafted'").get().n === 3, "drafted targets leave the queue");
  const r2 = await s.run();
  ok(r2.notes.drafted === 1, "a second run drafts the remaining target only", r2.notes);
}
{ // off
  const r = await setup({ org_outreach_mode: "off" }).run();
  ok(r.status === "gated" && r.notes.mode === "off", "off is gated", r);
}
{ // live without a postal address degrades to draft
  const s = setup({ org_outreach_mode: "live" });
  const r = await s.run();
  ok(r.notes.mode === "draft" && s.sent.length === 0, "live without a postal address stays draft", r.notes);
}
{ // live with the kill switch off degrades to draft
  const s = setup({ org_outreach_mode: "live", org_outreach_postal: "1 Example Street" }, "0");
  const r = await s.run();
  ok(r.notes.mode === "draft" && s.sent.length === 0, "live with the kill switch off stays draft", r.notes);
}
{ // live: sends, logs to both ledgers, honours suppression and prior contact
  const s = setup({ org_outreach_mode: "live", org_outreach_postal: "1 Example Street" });
  s.audit.prepare("INSERT INTO email_suppression (email) VALUES ('info@alpha.org')").run();
  s.audit.prepare("INSERT INTO contact_ledger (email) VALUES ('info@beta.org')").run();
  const r = await s.run();
  ok(r.notes.mode === "live" && r.notes.sent === 2, "live sends the two eligible targets", r.notes);
  ok(s.sent.length === 2 && s.sent.every((m) => m.text.includes("1 Example Street") && m.text.includes("reply “stop”")), "sent mail carries the postal address and opt-out");
  ok(!s.sent.some((m) => /alpha|beta/.test(m.to)), "suppressed and already-contacted addresses are not mailed", s.sent.map((m) => m.to));
  ok(s.audit.prepare("SELECT COUNT(*) n FROM outreach_log").get().n === 2 && s.audit.prepare("SELECT COUNT(*) n FROM contact_ledger").get().n === 3, "live sends are written to outreach_log and contact_ledger");
  s.audit.prepare("INSERT INTO email_suppression (email) VALUES ('info@gamma.org')").run();
  const r2 = await s.run();
  ok(r2.notes.stop_synced === 1, "a later opt-out closes its log row", r2.notes);
  ok(s.audit.prepare("SELECT reply_kind FROM org_outreach_log WHERE email='info@gamma.org'").get().reply_kind === "stop", "the log row reads stop");
}
{ // shared cap
  const s = setup({ org_outreach_mode: "live", org_outreach_postal: "1 Example Street" });
  for (let i = 0; i < 8; i++) s.audit.prepare("INSERT INTO outreach_log (email, subject, sent_at, status) VALUES (?, 's', datetime('now'), 'sent')").run("x" + i + "@other.org");
  const r = await s.run();
  ok(s.sent.length === 0 && r.notes.picked === 0, "the shared 8/day cap stops this lane", r.notes);
}

{ // reply write-back: interested is the segment's positive, stop suppresses, an auto-reply waits
  const s = setup({ org_outreach_mode: "live", org_outreach_postal: "1 Example Street" });
  await s.run(); // sends 3 (lane cap)
  const sentTo = s.sent.map((m) => m.to);
  ok(sentTo.length === 3, "three live sends to reply to", sentTo);
  const at = new Date(Date.now() + 60000).toISOString();
  const reply = (to, subject, body) => s.audit.prepare("INSERT INTO emails (sender, recipient, subject, body_text, received_at, status) VALUES (?, 'qnfo@example.test', ?, ?, ?, 'received')").run("Someone <" + to + ">", subject, body, at);
  reply(sentTo[0], "Re: A conversation", "Happy to talk. Let's schedule a call next week.");
  reply(sentTo[1], "Re: A conversation", "stop");
  reply(sentTo[2], "Automatic reply: A conversation", "I am out of office until Monday.");
  const r = await s.run();
  ok(r.notes.replies.interested === 1 && r.notes.replies.stop === 1 && !r.notes.replies.auto, "replies classified by intent; the auto-reply waits", r.notes.replies);
  const seg = Object.fromEntries(s.audit.prepare("SELECT segment, positive, negative FROM v_org_outreach_segments").all().map((x) => [x.segment, x]));
  ok(Object.values(seg).reduce((n, x) => n + Number(x.positive), 0) === 1, "the interested reply is a positive in the learner's view", seg);
  ok(s.audit.prepare("SELECT COUNT(*) n FROM email_suppression WHERE lower(email)=?").get(sentTo[1].toLowerCase()).n === 1, "a stop reply lands on the suppression list");
  ok(s.audit.prepare("SELECT COUNT(*) n FROM org_outreach_log WHERE reply_kind IS NULL AND mode='live'").get().n === 1, "the auto-reply row stays open for the real answer");
  const r2 = await s.run();
  ok(!r2.notes.replies.interested && !r2.notes.replies.stop, "a reply is counted once", r2.notes.replies);
}
{ // review-gate findings: exact sender match, a real reply behind an auto-reply, and a window that cannot fill
  const s = setup({ org_outreach_mode: "live", org_outreach_postal: "1 Example Street" });
  await s.run();
  const to = s.sent.map((m) => m.to);
  const t0 = new Date(Date.now() + 60000).toISOString(), t1 = new Date(Date.now() + 120000).toISOString();
  const mail = (sender, subject, body, at) => s.audit.prepare("INSERT INTO emails (sender, recipient, subject, body_text, received_at, status) VALUES (?, 'qnfo@example.test', ?, ?, ?, 'received')").run(sender, subject, body, at);
  mail("x" + to[0], "Re: hi", "stop", t0);                                                      // the address embedded in a longer one (prefix)
  mail(to[0] + ".evil.net", "Re: hi", "stop", t0);                                              // the address embedded in a longer one (suffix)
  mail("Look Alike <" + to[0] + ".evil.net>", "Re: hi", "stop", t0);
  mail(to[1], "Automatic reply: hi", "I am out of office until Monday.", t0);                    // auto first ...
  mail("Real Person <" + to[1] + ">", "Re: hi", "Happy to talk. Let's schedule a call.", t1);  // ... real answer after it, newest
  mail(to[1], "Automatic reply: hi", "I am out of office, back soon.", new Date(Date.now() + 180000).toISOString()); // newest is an auto again
  const r = await s.run();
  ok(!r.notes.replies.stop, "senders that merely contain the address are never counted", r.notes.replies);
  ok(r.notes.replies.interested === 1, "the newest non-auto reply wins even when an auto-reply arrived after it", r.notes.replies);
  ok(s.audit.prepare("SELECT COUNT(*) n FROM email_suppression WHERE lower(email) = ?").get(to[0].toLowerCase()).n === 0, "a lookalike sender cannot suppress an address");
  ok(s.audit.prepare("SELECT COUNT(*) n FROM org_outreach_log WHERE reply_kind IS NULL AND checked_at IS NOT NULL").get().n >= 1, "unanswered rows are stamped checked_at so they rotate out of the front of the window");
}
{ // wildcard characters in an address cannot widen the match
  const s = setup({ org_outreach_mode: "live", org_outreach_postal: "1 Example Street" });
  await s.run();
  s.audit.prepare("UPDATE org_outreach_log SET email = 'info_x@alpha.org' WHERE id = 1").run();
  s.audit.prepare("INSERT INTO emails (sender, recipient, subject, body_text, received_at, status) VALUES ('infoyx@alpha.org', 'q@example.test', 'Re', 'stop', ?, 'received')").run(new Date(Date.now() + 60000).toISOString());
  const r = await s.run();
  ok(!r.notes.replies.stop, "an underscore in the address does not match another character", r.notes.replies);
}
{ // discovery: seed from jobsearch, verify the site, read the public address, queue; robots and unverified sites are refused
  const s = setup();
  s.audit.exec("DELETE FROM org_targets");
  const ins = s.audit.prepare("INSERT INTO jobsearch_matches (id, company, title, url, score, last_seen) VALUES (?,?,?,?,?, '2026-11-14')");
  ins.run("a", "Example Institute", "Research Analyst", "https://boards.greenhouse.io/exampleinstitute/jobs/1", 90);
  ins.run("b", "Blocked Labs", "ML Engineer", "https://blocked.org/careers/1", 80);
  ins.run("c", "Ghost Institute", "Researcher", "https://jobs.lever.co/ghost/1", 70);
  ins.run("d", "Acme Plumbing", "Plumber", "https://acme.example/jobs", 60);
  const page = '<html><head><title>Example Institute</title><meta name="description" content="Example Institute is an independent research organisation evaluating autonomous systems and public policy, with evidence for the public interest."></head><body><h1>Example Institute</h1><a href="mailto:info@exampleinstitute.org">Contact</a></body></html>';
  const pages = { "https://exampleinstitute.org/": page, "https://exampleinstitute.org/about": page, "https://exampleinstitute.org/contact": page,
    "https://blocked.org/robots.txt": "User-agent: *\nDisallow: /", "https://blocked.org/": "<title>Blocked Labs</title><a href='mailto:info@blocked.org'>x</a>" };
  const calls = [];
  s.env.ORG_FETCH = async (url) => { calls.push(url); const body = pages[url]; return body == null ? { ok: false } : { ok: true, url, text: async () => body }; };
  const r = await s.discover();
  ok(r.notes.seeded === 3, "three classifiable organisations are seeded (the plumber is not)", r.notes);
  const row = s.audit.prepare("SELECT * FROM org_targets WHERE org = 'Example Institute'").get();
  ok(row.status === "queued" && row.email === "info@exampleinstitute.org" && row.website === "https://exampleinstitute.org" && row.fit >= 0.5, "a verified organisation is queued with its own address", row);
  ok(row.fit_note.startsWith("its own site describes its work as") && row.source_url.startsWith("https://exampleinstitute.org"), "the reason quotes the organisation and cites its page");
  ok(s.audit.prepare("SELECT status FROM org_targets WHERE org = 'Blocked Labs'").get().status === "no-contact", "robots.txt disallow ends the row without reading pages");
  ok(!calls.some((u) => u.startsWith("https://blocked.org/about")), "no page of a disallowing site is fetched");
  ok(s.audit.prepare("SELECT status, attempts FROM org_targets WHERE org = 'Ghost Institute'").get().attempts === 1, "an organisation with no verifiable site counts an attempt");
  await s.discover(); await s.discover();
  ok(s.audit.prepare("SELECT status FROM org_targets WHERE org = 'Ghost Institute'").get().status === "no-site", "three failed attempts end as no-site");
  // the queued row now flows through the sender
  const r2 = await s.run();
  ok(r2.notes.drafted === 1 && s.audit.prepare("SELECT body FROM org_outreach_log").get().body.includes("exampleinstitute.org"), "the discovered row is drafted by the sender", r2.notes);
}

console.log("org-outreach-job: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
