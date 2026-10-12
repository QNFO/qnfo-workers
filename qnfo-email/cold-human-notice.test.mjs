// NOTICE-REPLY-COLD-HUMAN-1 (qnfo-email 2.7.0, agent_issues 2444), offline suite, no network, synthetic data.
// Proves: a first-time sender with no solicitation wording is queued as escalate and the owner gets a [handoff] notice that
// names the queue id; a first-time solicitation (journal / call for papers wording) keeps the NOTICE-REPLY-1 skip and no
// notice; a reply subject (Re:/AW:) from a first-time sender escalates even with solicitation words; a known contact still
// escalates with the known-contact notice; a machine sender is never queued. The regex is the D1 trigger's wording list.
// ADVERSARIAL: it does not prove the deployed version; the closing probe on the issue reads live rows for that.
// Run: node qnfo-email/cold-human-notice.test.mjs
import fs from "node:fs";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const lib = new Function(src.replace(/export default\{/, "const __handler={") +
  "\nreturn {VERSION,enqueueHumanReply,NOTICE_COLD_SOLICIT_RX};")();
const fail = [];
let n = 0;
const eq = (l, g, w) => { n++; if (JSON.stringify(g) !== JSON.stringify(w)) fail.push(l + ": got " + JSON.stringify(g) + " want " + JSON.stringify(w)); };

const v = lib.VERSION.split("-")[0].split(".").map(Number);
eq("version is at least 2.7.0", v[0] > 2 || (v[0] === 2 && v[1] >= 7), true);

function env(known) {
  const inserts = [], sent = [];
  let rowId = 100;
  const stmt = (sql) => {
    let args = [];
    const s = {
      bind: (...a) => { args = a; return s; },
      async first() {
        if (/FROM email_reply_queue WHERE email_id/.test(sql)) return null;
        if (/FROM contact_ledger/.test(sql)) return known ? { v: 1 } : null;
        return null;
      },
      async run() {
        if (/INSERT INTO email_reply_queue/.test(sql)) {
          inserts.push({ sql, args });
          return { meta: { last_row_id: ++rowId } };
        }
        return { meta: { changes: 1 } };
      },
      async all() { return { results: [] }; },
    };
    return s;
  };
  return { env: { AUDIT_DB: { prepare: stmt }, SEND_EMAIL: { async send(m) { sent.push(m); } } }, inserts, sent };
}
const decision = (ins) => (/'escalate'/.test(ins.sql) ? "escalate" : /'skip'/.test(ins.sql) ? "skip" : "?");
const mail = (over) => Object.assign({ emailId: 984, from: "Jane Doe <jane@example.org>", to: "rowan.quni@qnfo.org", subject: "Request for a signed statement", receivedAt: "2026-10-11T09:00:00Z", bodyText: "Dear Rowan, I am preparing an EB-1A petition and would be grateful for a signed statement of facts about our work together." }, over || {});

// 1. a cold human: escalate + notice naming the queue id
{
  const t = env(false);
  const id = await lib.enqueueHumanReply(t.env, mail());
  eq("cold human queued as escalate", t.inserts.map(decision), ["escalate"]);
  eq("reason names the rule", /NOTICE-REPLY-COLD-HUMAN-1/.test(t.inserts[0].sql), true);
  eq("human_score 2 (a person waiting)", /,2,'escalate'/.test(t.inserts[0].sql), true);
  eq("one notice sent", t.sent.length, 1);
  eq("notice subject is the [handoff] form", t.sent[0] && /^\[handoff\] Request for a signed statement$/.test(String(t.sent[0].subject || (t.sent[0].headers && t.sent[0].headers.Subject) || "")), true);
  eq("the queue id is returned", id, 101);
}
// 2. a cold solicitation keeps the skip and sends nothing
{
  const t = env(false);
  await lib.enqueueHumanReply(t.env, mail({ from: "Editorial Office <editor@journal-mill.example>", subject: "Invitation to submit your research article", bodyText: "We invite your article to the International Journal of Quantum Technologies. ISSN 1234-5678. Submit your manuscript by Friday." }));
  eq("cold solicitation skipped", t.inserts.map(decision), ["skip"]);
  eq("skip reason keeps the NOTICE-REPLY-1 text the D1 trigger reads", /cold sender not in contact_ledger: no owner notice \(NOTICE-REPLY-1\)/.test(t.inserts[0].sql), true);
  eq("no notice for a solicitation", t.sent.length, 0);
}
// 3. a reply subject from a cold sender escalates even with solicitation words (a human answering a thread)
{
  const t = env(false);
  await lib.enqueueHumanReply(t.env, mail({ subject: "Re: your manuscript question", bodyText: "Thanks for writing back about the conference talk, here is the detail you asked for." }));
  eq("cold reply escalates", t.inserts.map(decision), ["escalate"]);
  eq("notice sent for the reply", t.sent.length, 1);
}
// 4. a known contact: unchanged path (escalate, notice)
{
  const t = env(true);
  await lib.enqueueHumanReply(t.env, mail());
  eq("known contact escalates", t.inserts.map(decision), ["escalate"]);
  eq("known-contact reason", /awaiting authored draft/.test(t.inserts[0].sql) || t.inserts[0].args.some((a) => /awaiting authored draft/.test(String(a))), true);
  eq("known-contact notice sent", t.sent.length, 1);
}
// 5. a machine sender is never queued
{
  const t = env(false);
  const id = await lib.enqueueHumanReply(t.env, mail({ from: "noreply@notifications.example" }));
  eq("machine sender: nothing queued", [id, t.inserts.length, t.sent.length], [null, 0, 0]);
}
// 6. the wording list
eq("regex: journal wording", lib.NOTICE_COLD_SOLICIT_RX.test("we invite you to our special issue"), true);
eq("regex: a plain request is not a solicitation", lib.NOTICE_COLD_SOLICIT_RX.test("could you send me the signed statement we discussed"), false);

console.log(fail.length ? fail.join("\n") : "", n + " checks, " + fail.length + " failed");
process.exit(fail.length ? 1 : 0);
