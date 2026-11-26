// NOTICE-REPLY-1 (2026-10-09, qnfo-email 2.6.0), offline suite, no network.
// Live failure this reproduces: email 966 (a journal solicitation from a freemail address, "Editorial update and paper
// inquiry") slipped past heuristicSpam, produced a "[handoff]" notice whose only instruction was to edit a D1 column, and
// the owner's reply (email 967) was run as an ops-exec task that died with HTTP 401.
// ADVERSARIAL: proves the guards in worker.js against a fake D1; it does not prove the deployed version or that the OPS
// service binding is installed (that needs a live /health version read and a live "job" command).
import fs from "node:fs";
import { stripWorkerDefaultExport } from "../scripts/worker-source-test.mjs";
const src = stripWorkerDefaultExport(fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8"));
const lib = new Function(src.replace(/export default\{/, "const __handler={") +
  "\nreturn {VERSION,parseTierJson,heuristicSpam,noticeTyped,noticeIntent,noticeReply,enqueueHumanReply,opsFetch,isHandoffNoticeReply};")();
const fail = [];
const eq = (l, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) fail.push(l + ": got " + JSON.stringify(g) + " want " + JSON.stringify(w)); };

// 1. the exact mail that got through, and look-alikes that must not be caught
const spamBody = "Dear Rowan Quni,\r\n\r\nI am contacting you from our editorial office as we organize our upcoming  \r\npublishing cycle. We welcome relevant submissions if you have anything  \r\nactive right now.\r\n\r\nAuthor guidelines:\r\nð https://kexuexuebao.org\r\n\r\nBest regards,\r\n\r\nEditorial Office";
eq("journal pitch from gmail is spam", lib.heuristicSpam("kavithakavi6162@gmail.com", "Editorial update and paper inquiry", spamBody), true);
eq("same pitch from a .edu sender is exempt", lib.heuristicSpam("a@uni.edu", "Editorial update and paper inquiry", spamBody), false);
eq("ordinary human mail is not spam", lib.heuristicSpam("friend@gmail.com", "dinner on friday", "Hi Rowan, are you free on Friday? The editorial office of my newspaper moved, see www.example.org"), false);

// 2. typed text extraction and intent
const quoted = "\r\n\r\n________________________________\r\nFrom: qnfo@qnfo.org <qnfo@qnfo.org>\r\nSent: Friday\r\nTo: x\r\nSubject: [handoff] Editorial update\r\n\r\nA person you have corresponded with wrote (queue id 61).";
eq("typed text stops at the quote", lib.noticeTyped("Is this really a human email? You need to improve your filtering and stop bothering me with junk-journal spam" + quoted), "Is this really a human email? You need to improve your filtering and stop bothering me with junk-journal spam");
eq("multi-paragraph answer kept", lib.noticeTyped("Hello,\n\nThanks, Friday works.\n" + quoted), "Hello,\n\nThanks, Friday works.");
eq("intent: the owner's real reply blocks", lib.noticeIntent("Is this really a human email? ... junk-journal spam"), "block");
eq("intent: SPAM", lib.noticeIntent("SPAM"), "block");
eq("intent: ignore", lib.noticeIntent("Ignore this one"), "ignore");
eq("intent: typed answer is feedback, never a send", lib.noticeIntent("Thanks, Friday at 7 works for me."), "feedback");
eq("intent: not corresponded", lib.noticeIntent("I haven't corresponded with this person before"), "unknown-sender");
eq("intent: bare SEND approves the draft", lib.noticeIntent("SEND"), "send-draft");
eq("intent: send plus words is feedback", lib.noticeIntent("send them a polite no"), "feedback");
eq("intent: empty", lib.noticeIntent("  "), "none");

// 3. noticeReply against a fake D1
const fake = (queueRow) => {
  const calls = { sql: [], send: [] };
  const mk = (q) => { const s = { bind: (...a) => { calls.sql.push([q, a]); return s; }, first: async () => (/FROM email_reply_queue/.test(q) ? queueRow : null), all: async () => ({ results: [] }), run: async () => ({ meta: { last_row_id: 7 } }) }; return s; };
  return { calls, env: { AUDIT_DB: { prepare: mk }, SEND_EMAIL: { send: async (m) => { calls.send.push(m); } } } };
};
const q61 = { id: 61, email_id: 966, sender: "kavithakavi6162@gmail.com", subject: "Editorial update and paper inquiry", sent_at: null, decision: "escalate" };
const mail = (body) => ({ from: "rwnquni@outlook.com", subject: "Re: Re: [handoff] Editorial update and paper inquiry", bodyText: body });
let f = fake(q61);
let r = await lib.noticeReply(f.env, mail("junk-journal spam" + quoted), "rwnquni@outlook.com", { ok: true });
eq("block: intent", r.intent, "block");
eq("block: filter row for the sender", f.calls.sql.some(([q, a]) => /INSERT INTO email_filters/.test(q) && a[0] === "kavithakavi6162@gmail.com"), true);
eq("block: email marked spam", f.calls.sql.some(([q, a]) => /UPDATE emails SET status='spam'/.test(q) && a[0] === 966), true);
eq("block: exactly one [done] mail to the owner", f.calls.send.map((m) => m.to + "|" + /^\[done\] blocked/.test(m.subject)), ["rwnquni@outlook.com|true"]);

// NOTICE-REPLY-NEVER-VERBATIM-1: the owner's words are never mailed to the sender
f = fake(q61);
r = await lib.noticeReply(f.env, mail("Thanks, but not interested." + quoted), "rwnquni@outlook.com", { ok: true });
eq("a decline note is understood, not echoed", r.intent, "redraft-no");
eq("feedback: nothing reaches the sender", f.calls.send.filter((m) => m.to === "kavithakavi6162@gmail.com").length, 0);
eq("feedback: queue row not marked sent", f.calls.sql.some(([q]) => /decision='sent'/.test(q)), false);

f = fake(q61);
r = await lib.noticeReply(f.env, mail("I haven't corresponded with this person before" + quoted), "rwnquni@outlook.com", { ok: true });
eq("never corresponded: intent", r.intent, "unknown-sender");
eq("never corresponded: nothing reaches the sender", f.calls.send.filter((m) => m.to === "kavithakavi6162@gmail.com").length, 0);
eq("never corresponded: sender blocked", f.calls.sql.some(([q, a]) => /INSERT INTO email_filters/.test(q) && a[0] === "kavithakavi6162@gmail.com"), true);
eq("never corresponded: misclassification logged", f.calls.sql.some(([q]) => /NOTICE-REPLY-NEVER-VERBATIM-1/.test(q)) && f.calls.sql.some(([q, a]) => /INSERT INTO agent_issues/.test(q) && /NOTICE-MISCLASSIFIED-1/.test(a[0])), true);
eq("never corresponded: one [done] to the owner", f.calls.send.map((m) => m.to), ["rwnquni@outlook.com"]);

f = fake({ ...q61, draft_text: "Thanks, not for us." });
r = await lib.noticeReply(f.env, mail("SEND" + quoted), "rwnquni@outlook.com", { ok: true });
eq("SEND by email no longer sends: the draft goes through the companion", f.calls.send.filter((m) => m.to === "kavithakavi6162@gmail.com").length, 0);
eq("SEND by email: one [done] to the owner pointing at the companion", f.calls.send.map((m) => m.to + "|" + /Drafts waiting/.test(m.text)), ["rwnquni@outlook.com|true"]);
f = fake(q61);
r = await lib.noticeReply(f.env, mail("SEND" + quoted), "rwnquni@outlook.com", { ok: true });
eq("SEND with no draft sends nothing", f.calls.send.filter((m) => m.to === "kavithakavi6162@gmail.com").length, 0);

f = fake(q61);
r = await lib.noticeReply(f.env, mail("SPAM" + quoted), "rwnquni@outlook.com", { ok: false, why: "dmarc=fail" });
eq("unauthenticated owner mail changes nothing", f.calls.sql.length, 0);

f = fake(null);
r = await lib.noticeReply(f.env, mail("SPAM\n\nno quote here"), "rwnquni@outlook.com", { ok: true });
eq("no queue id: nothing written, one [done] mail", [f.calls.sql.length, f.calls.send.length], [0, 1]);

f = fake({ ...q61, sent_at: "2026-10-09 09:00:00", decision: "sent" });
await lib.noticeReply(f.env, mail("SPAM" + quoted), "rwnquni@outlook.com", { ok: true });
eq("already-sent row is left alone", f.calls.sql.some(([q]) => /INSERT INTO email_filters|UPDATE emails/.test(q)), false);

// 4. cold sender without solicitation wording: queued as escalate with one owner notice (NOTICE-REPLY-COLD-HUMAN-1, 2.7.0; was skip)
const cold = (() => { const calls = { sql: [], send: [] }; const mk = (q) => { const s = { bind: (...a) => { calls.sql.push([q, a]); return s; }, first: async () => null, run: async () => ({ meta: { last_row_id: 9 } }) }; return s; }; return { calls, env: { AUDIT_DB: { prepare: mk }, SEND_EMAIL: { send: async (m) => { calls.send.push(m); } } } }; })();
const id = await lib.enqueueHumanReply(cold.env, { emailId: 966, from: "kavithakavi6162@gmail.com", to: "qnfo@qnfo.org", subject: "Editorial update", bodyText: "x", bodyHtml: "", receivedAt: "2026-10-09T09:15:48Z" });
eq("cold sender: queue row id", id, 9);
eq("cold sender: inserted as escalate", cold.calls.sql.some(([q]) => /INSERT INTO email_reply_queue/.test(q) && /'escalate'/.test(q) && /NOTICE-REPLY-COLD-HUMAN-1/.test(q)), true);
eq("cold sender: one owner notice", cold.calls.send.length, 1);
eq("cold notice does not claim a past correspondence", /corresponded/.test(cold.calls.send[0].text), false);
eq("cold notice never says a reply is sent to them", /sent to them as you/.test(cold.calls.send[0].text), false);
const relay = (() => { const calls = { sql: [], send: [] }; const mk = (q) => { const s = { bind: (...a) => { calls.sql.push([q, a]); return s; }, first: async () => null, run: async () => ({ meta: { last_row_id: 9 } }) }; return s; }; return { calls, env: { AUDIT_DB: { prepare: mk }, SEND_EMAIL: { send: async (m) => { calls.send.push(m); } } } }; })();
const rid = await lib.enqueueHumanReply(relay.env, { emailId: 970, from: "Daichi Toyoda <x@rsend.orbion.bond>", to: "qnfo@qnfo.org", subject: "quick idea", bodyText: "hello", bodyHtml: "", receivedAt: "2026-11-26T09:00:00Z" });
eq("bulk relay sender: no queue row, no notice", [rid, relay.calls.sql.length, relay.calls.send.length], [null, 0, 0]);

// 5. the hook and the binding
if (!/row\.kind === "owner" && isHandoffNoticeReply\(c\.subject\)\) return await noticeReply\(/.test(src)) fail.push("processCommand does not route handoff replies to noticeReply");
const hits = []; const fakeOps = { fetch: async (u, i) => { hits.push(u); return new Response('{"ok":1}', { status: 202 }); } };
const res = await lib.opsFetch("/v1/jobs", { method: "POST" }, { OPS: fakeOps });
eq("opsFetch uses the OPS binding first", [res.status, hits], [202, ["https://ops.qnfo.org/v1/jobs"]]);


// NOTICE-OPPORTUNITY-1: understood feedback rewrites the draft (one model call) and still sends nothing
eq("intent: interested", lib.noticeIntent("Yes I am interested in this"), "redraft-yes");
eq("intent: warmer", lib.noticeIntent("Make it warmer and shorter"), "redraft-tone");
eq("intent: not interested is not yes", lib.noticeIntent("I'm not interested"), "redraft-no");
{
  const calls = { sql: [], send: [], ai: [] };
  const mk = (q) => { const st = { bind: (...a) => { calls.sql.push([q, a]); return st; }, first: async () => (/FROM email_reply_queue/.test(q) ? q61 : /FROM emails/.test(q) ? { body_text: "Hi Rowan, we would love to talk about auditing autonomous agents.", subject: "x" } : null), all: async () => ({ results: [] }), run: async () => ({ meta: { last_row_id: 7 } }) }; return st; };
  const env = { AUDIT_DB: { prepare: mk }, SEND_EMAIL: { send: async (m) => { calls.send.push(m); } }, AI: { run: async (model, a) => { calls.ai.push(model); return { response: "Hi,\n\nThank you for the thoughtful note about auditing autonomous agents. Would a short call next week suit you?\n\nRowan" }; } } };
  const r2 = await lib.noticeReply(env, mail("Yes, I'm interested" + quoted), "rwnquni@outlook.com", { ok: true });
  eq("redraft: intent", r2.intent, "redraft-yes");
  eq("redraft: exactly one model call", calls.ai.length, 1);
  eq("redraft: nothing reaches the sender", calls.send.filter((m) => m.to === "kavithakavi6162@gmail.com").length, 0);
  eq("redraft: the new draft is stored for the tap", calls.sql.some(([q, a]) => /SET draft_text=\?2/.test(q) && /auditing autonomous agents/.test(a[1])), true);
  eq("redraft: the owner is told where to tap", calls.send.some((m) => m.to === "rwnquni@outlook.com" && /Drafts waiting/.test(m.text)), true);
}
// a real person writing about the owner's field is an opportunity, not tier 1 by uncertainty
eq("opportunity real overrides an uncertain tier 1", lib.parseTierJson('{"machine_written":false,"tier":1,"confident":false,"opportunity":"real","reason":"asks about audit work"}').tier, "3");
eq("opportunity none keeps tier 1", lib.parseTierJson('{"machine_written":false,"tier":1,"confident":false,"opportunity":"none","reason":"mass pitch"}').tier, "1");
eq("machine written stays tier 1 even if flagged real", lib.parseTierJson('{"machine_written":true,"tier":1,"confident":true,"opportunity":"real","reason":"x"}').tier, "1");

console.log(JSON.stringify({ version: lib.VERSION, failures: fail }));
if (fail.length) process.exit(1);
