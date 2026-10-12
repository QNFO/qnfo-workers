// NOTICE-REPLY-MATCH-1 (qnfo-email 2.6.1, agent_issues 2109 and 2161), offline suite, no network, synthetic data.
// Proves: an RFC 2047 encoded "Re: [handoff] ..." subject is a notice reply; a reply without the quoted "queue id" line
// is matched to the single waiting queue row of that subject and never to one of two; the owner's reply to a notice is not
// filed as ITINERARY-PARSE-MISS-1; an ops 401 names what was refused; keyEq accepts the configured key and nothing else.
// ADVERSARIAL: it does not prove the deployed version; the closing probes on the issues read live rows for that.
// Run: node qnfo-email/notice-match.test.mjs
import fs from "node:fs";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const lib = new Function(src.replace(/export default\{/, "const __handler={") +
  "\nreturn {VERSION,isHandoffNoticeReply,noticeSubjectOf,noticeQueueBySubject,noticeReply,itineraryIngest,keyEq,cmdAgent};")();
const fail = [];
let n = 0;
const eq = (l, g, w) => { n++; if (JSON.stringify(g) !== JSON.stringify(w)) fail.push(l + ": got " + JSON.stringify(g) + " want " + JSON.stringify(w)); };

const v = lib.VERSION.split("-")[0].split(".").map(Number);
eq("version is at least 2.6.1", v[0] > 2 || (v[0] === 2 && (v[1] > 6 || (v[1] === 6 && v[2] >= 1))), true);

// 1. encoded subjects
const b64 = (s) => "=?UTF-8?B?" + Buffer.from(s, "utf8").toString("base64") + "?=";
eq("plain reply subject", lib.isHandoffNoticeReply("Re: [handoff] A question about turns"), true);
eq("Q-encoded reply subject", lib.isHandoffNoticeReply("=?Windows-1252?Q?Re:_[handoff]_A_question_about_turns?="), true);
eq("B-encoded reply subject", lib.isHandoffNoticeReply(b64("RE: [handoff] A question about turns")), true);
eq("the notice itself is not a reply", lib.isHandoffNoticeReply("[handoff] A question about turns"), false);
eq("an ordinary reply is not a notice reply", lib.isHandoffNoticeReply("Re: A question about turns"), false);
eq("subject read back from a reply", lib.noticeSubjectOf("Re: RE: [handoff] A question about turns"), "A question about turns");
eq("subject read back from an encoded reply", lib.noticeSubjectOf(b64("Re: [handoff] A question about turns")), "A question about turns");

// 2. matching by subject
const fake = (rows) => {
  const calls = { sql: [], send: [] };
  const mk = (q) => { const s = { bind: (...a) => { calls.sql.push([q, a]); return s; }, first: async () => null, all: async () => ({ results: rows }), run: async () => { calls.sql.push([q, "run"]); return { meta: { last_row_id: 7 } }; } }; return s; };
  return { calls, env: { AUDIT_DB: { prepare: mk }, SEND_EMAIL: { send: async (m) => { calls.send.push(m); } } } };
};
const row = (id, subject) => ({ id, email_id: 900 + id, sender: "person" + id + "@uni.example", subject, sent_at: null, decision: "escalate" });
let f = fake([row(1, "A question about turns"), row(2, "Something else")]);
eq("one waiting row with the subject is matched", (await lib.noticeQueueBySubject(f.env.AUDIT_DB, "Re: [handoff] a question about TURNS") || {}).id, 1);
f = fake([row(1, "A question about turns"), row(3, "A question about turns")]);
eq("two candidates are never guessed between", await lib.noticeQueueBySubject(f.env.AUDIT_DB, "Re: [handoff] A question about turns"), null);
f = fake([row(2, "Something else")]);
eq("no candidate, no match", await lib.noticeQueueBySubject(f.env.AUDIT_DB, "Re: [handoff] A question about turns"), null);

// 3. noticeReply end to end without the quoted notice
f = fake([row(1, "A question about turns")]);
let r = await lib.noticeReply(f.env, { from: "rwnquni@outlook.com", subject: "Re: [handoff] A question about turns", bodyText: "Odd turns are handled in section two." }, "rwnquni@outlook.com", { ok: true });
eq("unquoted reply: matched by subject", [r.matched_by, r.intent, r.queue_id], ["subject", "send", 1]);
eq("unquoted reply: the typed text goes to the correspondent and a confirmation to the owner", f.calls.send.map((m) => [m.to, m.from]), [["person1@uni.example", "rowan.quni@qnfo.org"], ["rwnquni@outlook.com", "qnfo@qnfo.org"]]);
eq("unquoted reply: only the typed text is sent", f.calls.send[0].text, "Odd turns are handled in section two.");
f = fake([row(1, "A question about turns"), row(3, "A question about turns")]);
r = await lib.noticeReply(f.env, { from: "rwnquni@outlook.com", subject: "Re: [handoff] A question about turns", bodyText: "Odd turns are handled in section two." }, "rwnquni@outlook.com", { ok: true });
eq("ambiguous reply: nothing is sent to a correspondent", [r.skipped, f.calls.send.length, f.calls.send[0].to], ["no queue id", 1, "rwnquni@outlook.com"]);
f = fake([row(1, "A question about turns")]);
r = await lib.noticeReply(f.env, { from: "rwnquni@outlook.com", subject: "Re: [handoff] A question about turns", bodyText: "fine\n\nA person wrote (queue id 999)." }, "rwnquni@outlook.com", { ok: true });
eq("a quoted id that finds no row is not replaced by a subject guess", [r.skipped, r.matched_by], ["no queue id", undefined]);

// 4. the owner's reply to a notice is not an itinerary parse miss
const auth = "mx.cloudflare.net; dmarc=pass header.from=outlook.com";
f = fake([]);
r = await lib.itineraryIngest(f.env, { emailId: 1, from: "rwnquni@outlook.com", subject: "Re: [handoff] Team order confirmation", bodyText: "what is this about?", bodyHtml: "", authResults: auth, sentAt: "" });
eq("notice reply: parsed nothing, filed nothing", [r.parsed, f.calls.sql.filter((c) => /INSERT OR IGNORE INTO agent_issues/.test(c[0])).length], [0, 0]);
f = fake([]);
r = await lib.itineraryIngest(f.env, { emailId: 2, from: "rwnquni@outlook.com", subject: "Fwd: Your booking confirmation", bodyText: "no parsable content here", bodyHtml: "", authResults: auth, sentAt: "" });
eq("a real unparsed confirmation still files the parse miss", f.calls.sql.filter((c) => /INSERT OR IGNORE INTO agent_issues/.test(c[0])).length >= 1, true);

// 5. ops 401 text and key comparison
const env401 = { OPS_KEY: "k", AGENT_POLLS: "0", OPS: { fetch: async () => new Response('{"error":"Unauthorized"}', { status: 401 }) } };
const realFetch = globalThis.fetch, realTimeout = globalThis.setTimeout;
globalThis.fetch = async () => new Response('{"error":"Unauthorized"}', { status: 401 });
globalThis.setTimeout = (fn) => realTimeout(fn, 0);
r = await lib.cmdAgent(env401, "list", "drift", "owner");
globalThis.fetch = realFetch; globalThis.setTimeout = realTimeout;
eq("401 names the binding caller and OPS_KEY", r.ok === false && /HTTP 401/.test(r.error) && /OPS service binding caller/.test(r.error) && /OPS_KEY/.test(r.error), true);
eq("keyEq: equal", lib.keyEq("Bearer abc123", "Bearer abc123"), true);
eq("keyEq: different, same length", lib.keyEq("Bearer abc124", "Bearer abc123"), false);
eq("keyEq: prefix", lib.keyEq("Bearer abc", "Bearer abc123"), false);
eq("keyEq: longer", lib.keyEq("Bearer abc1234", "Bearer abc123"), false);
eq("keyEq: empty against empty is refused", lib.keyEq("", ""), false);

if (fail.length) { console.log(fail.join("\n")); console.log((n - fail.length) + " passed, " + fail.length + " failed"); process.exit(1); }
console.log(n + " passed, 0 failed");
