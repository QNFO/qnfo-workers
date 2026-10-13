// MAIL-DRAFT-1 offline suite (qnfo-fleet-dashboard 1.34.0). Replays the 2026-10-13 drafts the owner rejected ("Machine
// Learning Engineer", "QNFO Operations", "\n" shown as text) and proves: a draft request takes the grounded path, a title or
// unit no stored message contains becomes a [[FILL gap, the sign-off is code-written (name and address only), a draft with a
// gap offers no Send button and conMailReply refuses it, a clean draft offers Send, "send it" finds the last draft, and a
// visitor gets no message text.
// Run: node qnfo-fleet-dashboard/mail-draft.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error("cut " + a); return src.slice(i, j); };
const mod = cut("// MAIL-DRAFT-1 (1.34.0", "async function cmdAnswer(");
ok(/if \(MAIL_DRAFT_RX\.test\(text\)\) return await mailDraftReply\(env, text, c\);/.test(src), "cmdAnswer routes a draft request to mailDraftReply");
ok(/mailSendLastDraft\(env, text\)/.test(src), "the command route checks for send it");
ok(cut("async function conMailReply(", "async function conMailSpam(").includes("[[ FILL: ...]] gap".replace("[[ ", "[[")), "conMailReply refuses an unfilled gap");
ok(/maxlength="8000"/.test(src), "the command line takes a full reply");
const m = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(m && (Number(m[1]) > 1 || Number(m[2]) >= 34), "VERSION is at least 1.34.0", m && m[0]);

const VARUN = "Dear Rowan,\nI saw your recent commit to router_calibrate.py in qnfo-workers, which cites our UCCI paper (arXiv 2605.18796). For my EB-1A petition my attorney asks for a short signed statement of facts. Could you send one? I can send a draft.\nBest,\nVarun Kotte";
const FABRICATED = "Subject: Re: Your router_calibrate.py\\n\\nDear Varun,\\n\\nThank you for reaching out. I, Rowan Quni, am a Machine Learning Engineer at QNFO and work in QNFO Operations. I can provide a statement.\\n\\nBest regards,\\nRowan Quni\\nMachine Learning Engineer, QNFO\\n---\\nFeel free to edit the text above.";
const mk = (modelText, rows, logRows) => {
  const calls = [];
  const sb = { JSON, Math, String, Number, Array, Object, RegExp, Date, console, Promise,
    CMD_AI_BUDGET_MS: 24e3, MAIL_FLEET_FROM: /@(qnfo\.org|qwav\.org)$/i,
    mailDomainNamed: () => false,
    mailFacts: async (env, r) => r.map((x) => ({ address: String(x.sender).replace(/^.*<|>.*$/g, "") })),
    cmdAction: (op, args, why) => ({ op, args, label: op, destructive: true, why }),
    d1all: async (db, sql, b) => { calls.push({ sql, b }); if (/FROM cmd_log/.test(sql)) return logRows || []; if (/id <> \?2/.test(sql)) return []; return rows; },
    cmdRaceModels: async (env, messages) => { sb.__msgs = messages; return { ok: true, text: modelText, model: "glm-5.3-flash" }; } };
  vm.createContext(sb);
  vm.runInContext(mod + "\n__f = { mailDraftReply, mailSendLastDraft, mailDraftClean, mailDraftGuard, mailDraftGaps, MAIL_DRAFT_RX };", sb);
  return { f: sb.__f, sb, calls };
};
const row = [{ id: 4211, sender: "Varun Kotte <kottevarun@gmail.com>", recipient: "rowan.quni@qnfo.org", subject: "Your router_calibrate.py in qnfo-workers and the UCCI paper", received_at: "2026-10-12T21:04:00Z", body_text: VARUN }];
const ASK = "I'm not going back and forth with kottevarun@gmail.com. Draft a reply with items requested and show me before sending";
{
  const { f, sb, calls } = mk(FABRICATED, row);
  ok(f.MAIL_DRAFT_RX.test(ASK) && f.MAIL_DRAFT_RX.test("Show me drafted reply to kottevarun@gmail.com before sending"), "both of the owner's phrasings are draft requests");
  ok(!f.MAIL_DRAFT_RX.test("write a task to fix the email worker") && !f.MAIL_DRAFT_RX.test("what do they say?"), "other asks are not");
  const r = await f.mailDraftReply({}, ASK, { holder: true, v: { items: [] } });
  ok(calls.some((c) => /lower\(sender\) LIKE/.test(c.sql) && c.b && c.b[0] === "%kottevarun@gmail.com%"), "the message is found by the exact address, not by gmail.com", calls[0]);
  ok(/only facts about Rowan Quni you know are his name/.test(sb.__msgs[0].content) && /\[\[FILL: /.test(sb.__msgs[0].content), "the prompt allows only his name and asks for gaps");
  ok(/EB-1A/.test(sb.__msgs[1].content), "the model sees the stored message text");
  const sent = r.actions[0].fill.replace(/\[\[[^\]]*\]\]/g, "");
  ok(!/Machine Learning Engineer/.test(sent), "no invented title survives outside a gap in the reply", r.actions[0].fill);
  ok(!/QNFO Operations/.test(sent), "no invented unit survives outside a gap in the reply");
  ok(!/\\n/.test(r.answer) && /\n\nDear Varun,/.test(r.answer), "line breaks are real, not backslash-n", r.answer.slice(0, 200));
  ok(/Best regards,\nRowan Quni\nrowan\.quni@qnfo\.org\n/.test(r.answer), "the sign-off is name and sending address only");
  ok(!/Feel free to edit/.test(r.answer) && !/^Subject: Re: Your router_calibrate\.py$/m.test(r.answer.split("\n\n").slice(1).join("\n\n")), "the model's note and subject line are dropped");
  ok(/Only you can fill these 2 gaps/.test(r.answer), "the gaps are listed for the owner", r.answer);
  ok(r.actions.length === 1 && /^reply 4211 Dear Varun,/.test(r.actions[0].fill), "a draft with gaps offers Edit, then send and no Send button", r.actions);
  ok(/\(mail-draft\)$/.test(r.model), "the model tag marks it a draft for send it");
}
{
  const CLEAN = "Dear Varun,\n\nThank you for your note. Please send the draft statement you mentioned and I will review it.\n\nBest,\nRowan";
  const { f } = mk(CLEAN, row);
  const r = await f.mailDraftReply({}, ASK, { holder: true, v: { items: [] } });
  const send = r.actions.find((a) => a.op === "mailreply");
  ok(send && send.args.id === 4211 && /Please send the draft statement/.test(send.args.text) && !/\nRowan\n/.test(send.args.text), "a draft without gaps offers Send with the exact text", r.actions);
  ok(/Nothing in it goes beyond the stored messages/.test(r.answer), "it says nothing was added");
  const { f: f2 } = mk("", row, [{ actions_json: JSON.stringify(r.actions) }]);
  const s = await f2.mailSendLastDraft({}, "ok, send it");
  ok(s && s.actions[0].op === "mailreply" && s.actions[0].args.id === 4211, "send it offers the last draft's Send button", s);
  ok((await f2.mailSendLastDraft({}, "send the weekly digest")) === null, "an unrelated send is not taken");
}
{
  const { f } = mk("x", row);
  const r = await f.mailDraftReply({}, ASK, { holder: false, v: { items: [] } });
  ok(/only the signed-in owner/.test(r.answer) && !/EB-1A/.test(r.answer), "a visitor is asked to sign in and sees no text");
  const g = f.mailDraftGuard("I lead the Research Group. [[FILL: your title, e.g. Research Engineer]]", "nothing");
  ok(g.flagged.length === 1 && /\[\[FILL: your title, e\.g\. Research Engineer\]\]/.test(g.text), "a phrase inside a gap is left alone", g);
  ok(f.mailDraftGuard("As you said, the Machine Learning Engineer role", "machine learning engineer role").flagged.length === 0, "a phrase the thread contains is kept");
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
