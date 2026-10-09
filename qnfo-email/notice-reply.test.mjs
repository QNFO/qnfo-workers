// NOTICE-REPLY-1 (2026-10-09, qnfo-email 2.6.0), offline suite, no network.
// Live failure this reproduces: email 966 (a journal solicitation from a freemail address, "Editorial update and paper
// inquiry") slipped past heuristicSpam, produced a "[handoff]" notice whose only instruction was to edit a D1 column, and
// the owner's reply (email 967) was run as an ops-exec task that died with HTTP 401.
// ADVERSARIAL: proves the guards in worker.js against a fake D1; it does not prove the deployed version or that the OPS
// service binding is installed (that needs a live /health version read and a live "job" command).
import fs from "node:fs";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const lib = new Function(src.replace(/export default\{/, "const __handler={") +
  "\nreturn {VERSION,heuristicSpam,noticeTyped,noticeIntent,noticeReply,enqueueHumanReply,opsFetch,isHandoffNoticeReply};")();
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
eq("intent: answer", lib.noticeIntent("Thanks, Friday at 7 works for me."), "send");
eq("intent: empty", lib.noticeIntent("  "), "none");

// 3. noticeReply against a fake D1
const fake = (queueRow) => {
  const calls = { sql: [], send: [] };
  const mk = (q) => { const s = { bind: (...a) => { calls.sql.push([q, a]); return s; }, first: async () => (/FROM email_reply_queue/.test(q) ? queueRow : null), run: async () => ({ meta: { last_row_id: 7 } }) }; return s; };
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

f = fake(q61);
r = await lib.noticeReply(f.env, mail("Thanks, but not interested." + quoted), "rwnquni@outlook.com", { ok: true });
eq("send: intent", r.intent, "send");
eq("send: reply goes to the sender as the owner alias", f.calls.send.filter((m) => m.to === "kavithakavi6162@gmail.com").map((m) => m.from + "|" + m.text), ["rowan.quni@qnfo.org|Thanks, but not interested."]);
eq("send: queue row marked sent", f.calls.sql.some(([q]) => /decision='sent'/.test(q)), true);

f = fake(q61);
r = await lib.noticeReply(f.env, mail("SPAM" + quoted), "rwnquni@outlook.com", { ok: false, why: "dmarc=fail" });
eq("unauthenticated owner mail changes nothing", f.calls.sql.length, 0);

f = fake(null);
r = await lib.noticeReply(f.env, mail("SPAM\n\nno quote here"), "rwnquni@outlook.com", { ok: true });
eq("no queue id: nothing written, one [done] mail", [f.calls.sql.length, f.calls.send.length], [0, 1]);

f = fake({ ...q61, sent_at: "2026-10-09 09:00:00", decision: "sent" });
await lib.noticeReply(f.env, mail("SPAM" + quoted), "rwnquni@outlook.com", { ok: true });
eq("already-sent row is left alone", f.calls.sql.some(([q]) => /INSERT INTO email_filters|UPDATE emails/.test(q)), false);

// 4. cold sender: queued as skip, no owner notice
const cold = (() => { const calls = { sql: [], send: [] }; const mk = (q) => { const s = { bind: (...a) => { calls.sql.push([q, a]); return s; }, first: async () => null, run: async () => ({ meta: { last_row_id: 9 } }) }; return s; }; return { calls, env: { AUDIT_DB: { prepare: mk }, SEND_EMAIL: { send: async (m) => { calls.send.push(m); } } } }; })();
const id = await lib.enqueueHumanReply(cold.env, { emailId: 966, from: "kavithakavi6162@gmail.com", to: "qnfo@qnfo.org", subject: "Editorial update", bodyText: "x", bodyHtml: "", receivedAt: "2026-10-09T09:15:48Z" });
eq("cold sender: queue row id", id, 9);
eq("cold sender: inserted as skip", cold.calls.sql.some(([q]) => /INSERT INTO email_reply_queue/.test(q) && /'skip'/.test(q)), true);
eq("cold sender: zero owner notices", cold.calls.send.length, 0);

// 5. the hook and the binding
if (!/row\.kind === "owner" && isHandoffNoticeReply\(c\.subject\)\) return await noticeReply\(/.test(src)) fail.push("processCommand does not route handoff replies to noticeReply");
const hits = []; const fakeOps = { fetch: async (u, i) => { hits.push(u); return new Response('{"ok":1}', { status: 202 }); } };
const res = await lib.opsFetch("/v1/jobs", { method: "POST" }, { OPS: fakeOps });
eq("opsFetch uses the OPS binding first", [res.status, hits], [202, ["https://ops.qnfo.org/v1/jobs"]]);

console.log(JSON.stringify({ version: lib.VERSION, failures: fail }));
if (fail.length) process.exit(1);
