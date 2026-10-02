// GRANT-FOLLOWUP-1 offline suite: replays the block between the GRANT-FOLLOWUP-1 markers in worker.js (plus the worker's own
// decodeHeader) against an in-memory SQLite D1 carrying the live agent_issues constraints (unique open title, the
// cloud_ops_events evidence trigger) and a fake Gmail IMAP server. Proves: sender-domain matching and its edge cases,
// reply/receipt/bulk classification, IMAP query and response parsing, that the mailbox is only ever opened read-only
// (EXAMINE + BODY.PEEK; no STORE, COPY, EXPUNGE, APPEND or SELECT), that body text is never stored, one row per message
// across runs, one issue per application, the tracking-issue route (Lightcone 1750), and 'degraded' without GMAIL_PASS.
// Run: node qnfo-cloud-ops/grant-followup.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("// GRANT-FOLLOWUP-1 begin");
const b = src.indexOf("// GRANT-FOLLOWUP-1 end");
const da = src.indexOf("function decodeHeader(");
const db_ = src.indexOf('__name(decodeHeader, "decodeHeader");');
if (a < 0 || b < a || da < 0 || db_ < da) throw new Error("GRANT-FOLLOWUP-1 markers or decodeHeader not found in worker.js");
const api = new Function(src.slice(da, db_) + "\n" + src.slice(a, b) + "\n;return { decodeHeader, GRANT_APPLICATIONS, grantAddress, grantDomain, grantDomainIn, grantMatch, grantKind, grantIso, grantActive, grantImapSearch, grantAllMailBox, grantUidValidity, grantSearchUids, grantParseFetch, grantParseHeaders, jobGrantFollowup };")();

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const APPS = api.GRANT_APPLICATIONS;
const app = (k) => APPS.find((x) => x.key === k);

// 1. Addresses and domains
ok(api.grantAddress("Oliver Habryka <Habryka@LightconeInfrastructure.com>") === "habryka@lightconeinfrastructure.com", "address from a display-name From header, lowercased");
ok(api.grantAddress("funds@effectivealtruism.com") === "funds@effectivealtruism.com" && api.grantAddress("no address here") === "", "bare address; none -> empty");
ok(api.grantDomainIn("em.foresight.org", ["foresight.org"]) && !api.grantDomainIn("notforesight.org", ["foresight.org"]) && !api.grantDomainIn("profil.org", ["fil.org"]), "subdomains match, look-alike suffixes do not");

// 2. Matching to an application
const NOW = Date.parse("2026-10-03T15:05:00Z");
const active = APPS.filter((x) => api.grantActive(x, NOW));
ok(active.length === APPS.length, "every listed application is inside its window on 2026-10-03");
ok(!api.grantActive({ submitted: "2026-01-01" }, NOW) && !api.grantActive({ submitted: "2026-12-01" }, NOW), "an application past its window or not yet submitted is not watched");
ok(api.grantMatch(active, { from: "habryka@lightconeinfrastructure.com", date: "2026-10-02T09:00:00.000Z" }).key === "lightcone-corrigibility", "a Lightcone sender maps to the Lightcone application");
ok(api.grantMatch(active, { from: "x@srs.example.net", envelope: "grants@foresight.org", date: "2026-10-02T00:00:00.000Z" }).key === "foresight-ai-nodes", "the envelope sender also counts");
ok(api.grantMatch(active, { from: "grants@foresight.org", date: "2026-09-30T23:00:00.000Z" }) === null, "mail dated before the submission day is not a reply");
ok(api.grantMatch(active, { from: "rwnquni@gmail.com", date: "2026-10-02T00:00:00.000Z" }) === null, "the owner's own sent mail never matches");

// 3. Classification
ok(api.grantKind({ subject: "Your application", in_reply: true }) === "reply" && api.grantKind({ subject: "RE: application introduction" }) === "reply", "In-Reply-To or a Re: subject is a reply");
ok(api.grantKind({ subject: "Foresight AI Nodes RFP: Thank you for your Submission!" }) === "receipt" && api.grantKind({ subject: "Application submitted: QNFO" }) === "receipt", "automatic acknowledgements are receipts");
ok(api.grantKind({ subject: "October newsletter", list: true }) === "bulk" && api.grantKind({ subject: "Decision on your application", list: true }) === "message", "list mail is bulk unless it reads like a decision");
ok(api.grantKind({ subject: "Corrigibility Research Fund: your application" }) === "message", "anything else from a funder is a message");

// 4. IMAP query building and response parsing
ok(api.grantImapSearch(app("lightcone-corrigibility")) === 'SINCE 1-Oct-2026 OR OR FROM "lightconeinfrastructure.com" FROM "lightconecommons.com" FROM "lightconecommons.org"', "n domains take n-1 prefix ORs");
ok(api.grantImapSearch(app("manifund")) === 'SINCE 13-Aug-2026 FROM "manifund.org"', "one domain takes no OR");
ok(api.grantAllMailBox(['* LIST (\\HasNoChildren) "/" "INBOX"', '* LIST (\\All \\HasNoChildren) "/" "[Gmail]/All Mail"']) === "[Gmail]/All Mail", "the \\All mailbox is found");
ok(api.grantAllMailBox(['* LIST (\\HasNoChildren \\All) "/" "[Gmail]/Alle berichten"']) === "[Gmail]/Alle berichten" && api.grantAllMailBox(['* LIST (\\HasNoChildren) "/" "INBOX"']) === null, "any UI language; null when absent");
ok(api.grantUidValidity(["* OK [UIDVALIDITY 11] UIDs valid."]) === "11" && api.grantSearchUids(["* SEARCH 4 17 230", "a5 OK"]).join(",") === "4,17,230" && api.grantSearchUids(["* SEARCH", "a5 OK"]).length === 0, "UIDVALIDITY and SEARCH results");
const lit = "From: A <a@x.org>\r\nSubject: =?UTF-8?B?w4Bww6lybw==?=\r\nIn-Reply-To:\r\n <m1@x.org>\r\n\r\n";
const pf = api.grantParseFetch(["* 3 FETCH (UID 77 BODY[HEADER.FIELDS (FROM SUBJECT)] {64}", lit, ")", "* 4 FETCH (BODY[HEADER.FIELDS (FROM)] {20}", "From: b@y.org\r\n\r\n", " UID 78)", "* 5 FETCH (FLAGS (\\Seen))", "a9 OK"]);
ok(pf.length === 2 && pf[0].uid === "77" && pf[0].headers["in-reply-to"] === "<m1@x.org>" && pf[1].uid === "78" && pf[1].headers.from === "b@y.org", "FETCH literals parse, folded headers unfold, a trailing UID is found, flag-only lines are ignored");
ok(api.decodeHeader(pf[0].headers.subject) === "Àpéro", "RFC 2047 subjects decode with the worker's decodeHeader");
ok(api.grantIso("Thu, 1 Oct 2026 22:07:00 +0000 (UTC)") === "2026-10-01T22:07:00.000Z" && api.grantIso("2026-08-19 17:42:13") === "2026-08-19T17:42:13.000Z" && api.grantIso("junk") === null, "RFC 2822, space-format and junk dates");

// 5. End to end against an in-memory D1 and a fake Gmail
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT, body_text TEXT, headers_json TEXT, received_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, linked_session TEXT, created_at INTEGER, updated_at INTEGER);
CREATE UNIQUE INDEX idx_agent_issues_open_title ON agent_issues(title) WHERE status = 'open';
CREATE TRIGGER agent_issues_evidence_must_exist_ins BEFORE INSERT ON agent_issues WHEN NEW.source LIKE 'cloud_ops_events:%' AND NOT EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.id = replace(NEW.source,'cloud_ops_events:','')) BEGIN SELECT RAISE(ABORT, 'EVIDENCE-REFERENTIAL-INTEGRITY-1'); END;`);
db.prepare("INSERT INTO agent_issues (id, title, description, status, created_at, updated_at) VALUES (1750, 'LIGHTCONE-APP-EMPTY-1: empty body', 'original text', 'open', 1, 1)").run();
const mail = (mid, sender, subject, received, headers) => db.prepare("INSERT INTO emails (message_id, sender, recipient, subject, body_text, headers_json, received_at) VALUES (?, ?, 'rowan.quni@qwav.tech', ?, 'SECRET-BODY-MARKER please keep private', ?, ?)").run(mid, sender, subject, JSON.stringify(Object.assign({ from: sender, subject }, headers || {})), received);
mail("<ea-1@effectivealtruism.com>", "funds@effectivealtruism.com", "Re: grant application - epistemic infrastructure", "2026-10-02T05:42:13.596Z", { "in-reply-to": "<CBot6@qwav.tech>" });
mail("<ea-h@effectivealtruism.com>", "funds@effectivealtruism.com", "Re: grant application - out of scope", "2026-08-19T17:42:13.596Z", { "in-reply-to": "<CBot5@qwav.tech>" });
mail("<ea-0@effectivealtruism.com>", "funds@effectivealtruism.com", "Re: an older thread", "2026-08-01T10:00:00.000Z", { "in-reply-to": "<old@qwav.tech>" });
mail("<fs-1@foresight.org>", "grants@foresight.org", "Foresight AI Nodes RFP: Thank you for your Submission!", "2026-10-01T22:02:05.891Z");
mail("<fs-2@foresight.org>", "news@foresight.org", "Foresight October newsletter", "2026-10-02T08:00:00.000Z", { "list-unsubscribe": "<mailto:u@foresight.org>" });
mail("<pf-1@profil.org>", "info@profil.org", "Re: profile", "2026-10-02T08:00:00.000Z", { "in-reply-to": "<x@qnfo.org>" });
mail("<rnd-1@example.com>", "someone@example.com", "Re: grant application", "2026-10-02T08:00:00.000Z", { "in-reply-to": "<y@qnfo.org>" });
db.prepare("INSERT INTO emails (message_id, sender, recipient, subject, body_text, headers_json, received_at) VALUES ('<bad-json@manifund.org>', 'austin@manifund.org', 'rowan.quni@qwav.tech', 'Re: open research infrastructure', 'SECRET-BODY-MARKER', '{not json', '2026-08-20 09:00:00')").run();

function stmtOn(sql) {
  let args = [];
  const self = {
    bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
  };
  return self;
}
const AUDIT = { prepare: (sql) => stmtOn(sql) };

const LC = { // Gmail All Mail, UIDs 501-503 from Lightcone domains
  501: "From: Oliver Habryka <habryka@lightconeinfrastructure.com>\r\nSubject: Re: Corrigibility application text\r\nDate: Fri, 2 Oct 2026 16:10:00 +0000\r\nMessage-ID: <lc-reply-1@lightconeinfrastructure.com>\r\nIn-Reply-To: <owner-1@gmail.com>\r\n\r\n",
  502: "From: Lightcone Commons <noreply@lightconecommons.com>\r\nSubject: Application submitted: QNFO (independent)\r\nDate: Thu, 1 Oct 2026 22:07:00 +0000\r\nMessage-ID: <lc-receipt@lightconecommons.com>\r\n\r\n",
  503: "From: LessWrong digest <digest@lightconeinfrastructure.com>\r\nSubject: Weekly digest\r\nDate: Fri, 2 Oct 2026 07:00:00 +0000\r\nMessage-ID: <lc-digest@lightconeinfrastructure.com>\r\nList-Id: <digest.lightconeinfrastructure.com>\r\n\r\n"
};
let gmailUids = [501, 502, 503];
const sent = [];
function fakeImap() {
  let t = 0;
  return {
    async cmd(c) {
      sent.push(c);
      const tag = "a" + ++t;
      if (/^LOGIN /.test(c)) return { ok: true, lines: [tag + " OK LOGIN completed"] };
      if (/^LIST /.test(c)) return { ok: true, lines: ['* LIST (\\HasNoChildren) "/" "INBOX"', '* LIST (\\All \\HasNoChildren) "/" "[Gmail]/All Mail"', tag + " OK"] };
      if (/^EXAMINE /.test(c)) return { ok: true, lines: ["* OK [UIDVALIDITY 11] UIDs valid.", tag + " OK [READ-ONLY] [Gmail]/All Mail selected."] };
      if (/^UID SEARCH /.test(c)) return { ok: true, lines: [(/lightcone/.test(c) ? "* SEARCH " + gmailUids.join(" ") : "* SEARCH"), tag + " OK"] };
      if (/^UID FETCH /.test(c)) {
        const lines = [];
        for (const u of c.split(" ")[2].split(",")) lines.push("* " + u + " FETCH (UID " + u + " BODY[HEADER.FIELDS (FROM)] {" + LC[u].length + "}", LC[u], ")");
        return { ok: true, lines: lines.concat(tag + " OK") };
      }
      return { ok: false, lines: [tag + " BAD unexpected"] };
    },
    async close() { sent.push("LOGOUT"); }
  };
}
const deps = (now) => ({ open: async () => fakeImap(), decode: api.decodeHeader, now });
const env = { AUDIT, GMAIL_PASS: "test-app-password" };
const events = () => db.prepare("SELECT id, status, text, meta FROM cloud_ops_events WHERE id >= 'grant-reply-' AND id < 'grant-reply.' ORDER BY id").all();
const issues = () => db.prepare("SELECT id, title, description, source, status FROM agent_issues ORDER BY id").all();

let r = await api.jobGrantFollowup(env, deps(NOW));
ok(r.status === "ok" && /^ok:/.test(r.notes.channels.qnfo_email) && r.notes.channels.gmail === "ok:3", "both mailboxes read: status ok (" + JSON.stringify(r.notes.channels) + ")");
let ev = events();
ok(ev.length === 6 && ev.map((e) => e.status).sort().join(",") === "handled,receipt,receipt,reply,reply,reply", "six funder messages recorded: 3 replies (EA, Manifund, Lightcone), 2 receipts and 1 reply already handled before the loop (got " + ev.map((e) => e.id).join(" ") + ")");
ok(!ev.some((e) => /ea-0@|fs-2@|pf-1@|rnd-1@|lc-digest@/.test(e.id)), "pre-submission mail, a newsletter, a look-alike domain, a stranger and list mail are not recorded");
ok(!JSON.stringify(ev).includes("SECRET-BODY-MARKER") && !JSON.stringify(issues()).includes("SECRET-BODY-MARKER"), "no body text is stored anywhere");
ok(sent.some((c) => /^EXAMINE "\[Gmail\]\/All Mail"$/.test(c)) && sent.filter((c) => /^UID FETCH/.test(c)).every((c) => /BODY\.PEEK\[HEADER\.FIELDS/.test(c)), "Gmail is opened with EXAMINE on All Mail and read with BODY.PEEK headers only");
ok(!sent.some((c) => /^(UID )?(STORE|COPY|MOVE|EXPUNGE|APPEND|SELECT|DELETE|CREATE)\b/i.test(c)), "no command can change the mailbox (sent: " + sent.filter((c) => !/^LOGIN/.test(c)).join(" | ") + ")");
let is = issues();
const ea = is.find((x) => /^GRANT-REPLY-EA-FUNDS-LTFF:/.test(x.title));
ok(ea && ea.status === "open" && ea.source === "cloud_ops_events:grant-reply-ea-1@effectivealtruism.com" && /Re: grant application/.test(ea.description) && /qnfo-audit\.emails id/.test(ea.description) && /Definition of done/.test(ea.description), "the EA Funds reply opens one issue citing its evidence row and where to read it");
ok(is.some((x) => /^GRANT-REPLY-MANIFUND:/.test(x.title)), "a reply whose stored headers are not JSON is still matched by envelope sender");
const lc = is.find((x) => x.id === 1750);
ok(/GRANT-FOLLOWUP-1/.test(lc.description) && /Re: Corrigibility application text/.test(lc.description) && /Gmail \[Gmail\]\/All Mail UID 501 \(UIDVALIDITY 11\)/.test(lc.description) && !is.some((x) => /GRANT-REPLY-LIGHTCONE/.test(x.title)), "the Lightcone reply is noted on tracking issue 1750, not filed twice");
ok(!is.some((x) => /FORESIGHT/.test(x.title)), "a receipt files no issue");
ok(ev.filter((e) => e.status !== "receipt" && e.status !== "handled").every((e) => JSON.parse(e.meta).issue_id), "every reply row carries the issue it went to");
const hd = ev.find((e) => /ea-h@/.test(e.id));
ok(hd && hd.status === "handled" && !JSON.parse(hd.meta).issue_id && /already recorded/.test(JSON.parse(hd.meta).handled) && (ea && !/out of scope/.test(ea.description)), "a reply dated on or before handled_through is recorded as handled and files no issue");
const issueCount = is.length, lcLen = lc.description.length;
sent.length = 0;

r = await api.jobGrantFollowup(env, deps(NOW + 12 * 36e5));
ok(r.notes.new_rows === 0 && events().length === 6 && issues().length === issueCount && issues().find((x) => x.id === 1750).description.length === lcLen, "a second run records nothing new and touches no issue");

db.prepare("INSERT INTO emails (message_id, sender, recipient, subject, body_text, headers_json, received_at) VALUES ('<ea-2@effectivealtruism.com>', 'funds@effectivealtruism.com', 'rowan.quni@qwav.tech', 'Re: grant application - one question', 'SECRET-BODY-MARKER', '{\"in-reply-to\":\"<z@qwav.tech>\"}', '2026-10-04T10:00:00.000Z')").run();
r = await api.jobGrantFollowup({ AUDIT }, deps(NOW + 24 * 36e5));
ok(r.status === "degraded" && /^no-credential/.test(r.notes.channels.gmail) && r.notes.new_rows === 1, "without GMAIL_PASS the job still reads qnfo.org mail and reports degraded");
is = issues();
ok(is.length === issueCount && (is.find((x) => /^GRANT-REPLY-EA-FUNDS-LTFF:/.test(x.title)).description.match(/GRANT-FOLLOWUP-1 /g) || []).length === 2, "a second EA reply extends the open EA issue instead of filing another");

db.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 1750").run();
gmailUids = [504];
LC[504] = "From: Oliver Habryka <habryka@lightconeinfrastructure.com>\r\nSubject: Re: Corrigibility application text\r\nDate: Mon, 5 Oct 2026 09:00:00 +0000\r\nMessage-ID: <lc-reply-2@lightconeinfrastructure.com>\r\nReferences: <owner-1@gmail.com>\r\n\r\n";
r = await api.jobGrantFollowup(env, deps(NOW + 48 * 36e5));
ok(issues().some((x) => /^GRANT-REPLY-LIGHTCONE-CORRIGIBILITY:/.test(x.title) && x.status === "open"), "once the tracking issue is closed, a new Lightcone reply opens its own issue");

const failing = { cmd: async () => { throw new Error("imap eof during LOGIN"); }, close: async () => {} };
r = await api.jobGrantFollowup(env, { open: async () => failing, decode: api.decodeHeader, now: NOW + 60 * 36e5 });
ok(r.status === "degraded" && /^error:imap eof/.test(r.notes.channels.gmail), "an IMAP failure degrades the run and is reported, never thrown");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
