// OWNER-SENDER-NO-REPLY-1 (2026-10-03, qnfo-email 2.2.5): mail FROM the owner's own address, or a reply to a fleet
// handoff notice, must never be queued as "a nuanced human email held for your reply" and must never fire a new
// notifyOwner handoff notice back at the owner. Live loop this reproduces: inbound spam -> queue 52 -> notice ->
// owner reply (email 916) -> queue 53 -> notice -> owner reply (email 917) -> queue 54 -> ...
// ADVERSARIAL: this is an offline behavioural test of the two guards only. It does not prove the deployed worker
// carries them (that needs a live version read) and it does not cover an owner alias absent from OWNER_SENDERS
// whose subject is not a [handoff] reply.
import fs from "node:fs";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const { isOwnerSender, isHandoffNoticeReply, enqueueHumanReply, enqueueHandoff, VERSION } =
  new Function(src.replace(/export default\{/, "const __handler={") +
    "\nreturn {isOwnerSender,isHandoffNoticeReply,enqueueHumanReply,enqueueHandoff,VERSION};")();

const fake = () => {
  const calls = { prepare: [], send: [] };
  // NOTICE-REPLY-1: only a sender in contact_ledger gets an owner notice, so the fake knows the realHuman correspondent.
  const mk = (q) => { const s = { bind: () => s, first: async () => (/contact_ledger/.test(q) ? { v: 1 } : null), run: async () => ({ meta: { last_row_id: 1 } }) }; return s; };
  const env = {
    AUDIT_DB: { prepare: (q) => { calls.prepare.push(q); return mk(q); } },
    SEND_EMAIL: { send: async (m) => { calls.send.push(m); return { ok: true }; } },
  };
  return { env, calls };
};
const fail = [];
const eq = (label, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fail.push(label + ": got " + JSON.stringify(got) + " want " + JSON.stringify(want)); };

eq("version is a 2.x tagged release", /^2\.\d+\.\d+-[a-z-]+$/.test(VERSION), true);
for (const [v, want] of [["rwnquni@outlook.com", true], ["Rowan <rowan.quni@outlook.com>", true], ["rowan.quni@qnfo.org", true],
                         ["ameliahughes@advancedresearchpub.com", false], ["", false], ["arne@green-coding.io", false]]) eq("isOwnerSender(" + v + ")", isOwnerSender(v), want);
for (const [v, want] of [["Re: [handoff] A journal for interdisciplinary research", true],
                         ["Re: [handoff] Re: [handoff] A journal for interdisciplinary research", true],
                         ["A journal for interdisciplinary research", false],
                         ["Re: QNFO sent as you - 2026-10-03 (9 items)", false]]) eq("isHandoffNoticeReply(" + v + ")", isHandoffNoticeReply(v), want);

const ownerReply = { emailId: 917, from: "rwnquni@outlook.com", to: "qnfo@qnfo.org", subject: "Re: [handoff] Re: [handoff] A journal for interdisciplinary research", bodyText: "Don't spam me about my own replies!", receivedAt: "2026-10-03T13:11:24.849Z" };
const o = fake();
eq("owner reply -> no queue id", await enqueueHumanReply(o.env, ownerReply), null);
eq("owner reply -> zero DB writes", o.calls.prepare.length, 0);
eq("owner reply -> zero owner notices", o.calls.send.length, 0);

const thirdPartyNoticeReply = { emailId: 1, from: "arne@green-coding.io", to: "qnfo@qnfo.org", subject: "Re: [handoff] Energy per compute", bodyText: "ok", receivedAt: "2026-10-03T00:00:00Z" };
const t = fake();
eq("handoff-notice reply -> no queue id", await enqueueHumanReply(t.env, thirdPartyNoticeReply), null);
eq("handoff-notice reply -> zero owner notices", t.calls.send.length, 0);

const realHuman = { emailId: 915, from: "ameliahughes@advancedresearchpub.com", to: "qnfo@qnfo.org", subject: "A journal for interdisciplinary research", bodyText: "please submit", receivedAt: "2026-10-03T10:09:26.020Z" };
const h = fake();
eq("real human -> queue id", await enqueueHumanReply(h.env, realHuman), 1);
if (!h.calls.prepare.some((q) => /INSERT INTO email_reply_queue/.test(q))) fail.push("real human: no email_reply_queue insert");
if (h.calls.send.length !== 1) fail.push("real human: expected exactly one owner notice, got " + h.calls.send.length);

const oh = fake();
await enqueueHandoff(oh.env, { emailId: 917, from: "rwnquni@outlook.com", subject: "Re: [handoff] licensing", receivedAt: "2026-10-03T13:11:24.849Z" });
eq("owner mail -> no strategic handoff row", oh.calls.prepare.length, 0);

console.log(JSON.stringify({ version: VERSION, failures: fail }));
if (fail.length) process.exit(1);
