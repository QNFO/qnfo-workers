// MAIL-DRAFT-1 / MAIL-DRAFT-COMPLETE-1 offline suite (qnfo-fleet-dashboard 1.35.0). Replays the 2026-10-13 drafts the owner
// rejected ("Machine Learning Engineer", "QNFO Operations", "\n" shown as text, then [[FILL]] gaps) and proves: a draft request
// takes the grounded path; the model receives the owner's public profile, the identity document and the repository record of
// the file the thread names; the reply is complete (no placeholder, no gap, no question to the owner) and an unsupported title
// or unit is dropped with its sentence; the sign-off is code-written; every draft offers Send reply; "send it" finds the last
// draft; a visitor gets no message text.
// Run: node qnfo-fleet-dashboard/mail-draft.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error("cut " + a); return src.slice(i, j); };
const mod = cut("// MAIL-DRAFT-1 (1.34.0", "async function cmdAnswer(");
ok(/if \(MAIL_DRAFT_RX\.test\(text\)\) return await mailDraftReply\(env, text, c\);/.test(src), "cmdAnswer routes a draft request to mailDraftReply");
ok(/mailSendLastDraft\(env, text\)/.test(src), "the command route checks for send it");
ok(/maxlength="8000"/.test(src), "the command line takes a full reply");
const m = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(m && (Number(m[1]) > 1 || Number(m[2]) >= 35), "VERSION is at least 1.35.0", m && m[0]);
ok(!/\[\[FILL/.test(cut("var MAIL_DRAFT_SYS", "function mailDraftPlain(")), "the prompt no longer asks for gaps");

const VARUN = "Dear Rowan,\nI saw your recent commit to router_calibrate.py in qnfo-workers, which cites our UCCI paper (arXiv 2605.18796). For my EB-1A petition my attorney asks for a short signed statement of facts. Could you send one?\nBest,\nVarun Kotte";
const FABRICATED = "Subject: Re: Your router_calibrate.py\\n\\nDear Varun,\\n\\nThank you for reaching out. I am a Machine Learning Engineer at QNFO. I work in QNFO Operations. The script was added in commit b33509a on 26 September 2026 and cites arXiv 2605.18796. I first read it when [[FILL: how]].\\n\\nStatement of Facts\\n\\nI, Rowan Quni, confirm that router_calibrate.py in QNFO/qnfo-workers cites your paper.\\n\\nBest regards,\\nRowan Quni\\nMachine Learning Engineer, QNFO\\n---\\nFeel free to edit the text above.";
const mk = (modelText, rows, logRows) => {
  const calls = [], gh = [];
  const sb = { JSON, Math, String, Number, Array, Object, RegExp, Date, console, Promise, atob, encodeURIComponent, AbortSignal,
    CMD_AI_BUDGET_MS: 24e3, GH_API: "https://api.github.com", MAIL_FLEET_FROM: /@(qnfo\.org|qwav\.org)$/i,
    ghHeaders: () => ({}), mailDomainNamed: () => false,
    ownerStore: async () => "IDENTITY",
    mailFacts: async (env, r) => r.map((x) => ({ address: String(x.sender).replace(/^.*<|>.*$/g, "") })),
    cmdAction: (op, args, why) => ({ op, args, label: op, destructive: true, why }),
    fetch: async (u) => { gh.push(u); const j = /search\/code/.test(u) ? { items: [{ path: "scripts/router_calibrate.py" }] } : /commits\?path/.test(u) ? [{ sha: "b33509a0000", commit: { author: { date: "2026-09-26T10:00:00Z", name: "QNFO" }, message: "router_calibrate.py: UCCI calibration (arXiv 2605.18796)" } }] : /contents/.test(u) ? { content: btoa('"""Calibration-first routing after UCCI (arXiv 2605.18796)."""') } : null; return { ok: !!j, json: async () => j }; },
    d1all: async (db, sql, b) => { calls.push({ db, sql, b }); if (/owner_docs/.test(sql)) return [{ body_md: "Rowan Quni builds research systems at QNFO." }]; if (/FROM cmd_log/.test(sql)) return logRows || []; if (/id <> \?2/.test(sql)) return []; return rows; },
    cmdRaceModels: async (env, messages, ms) => { sb.__msgs = messages; sb.__ms = ms; return { ok: true, text: modelText, model: "glm-5.3-flash" }; } };
  vm.createContext(sb);
  vm.runInContext(mod + "\n__f = { mailDraftReply, mailSendLastDraft, mailDraftClean, mailDraftGuard, MAIL_DRAFT_RX };", sb);
  return { f: sb.__f, sb, calls, gh };
};
const row = [{ id: 4211, sender: "Varun Kotte <kottevarun@gmail.com>", recipient: "rowan.quni@qnfo.org", subject: "Your router_calibrate.py in qnfo-workers and the UCCI paper", received_at: "2026-10-12T21:04:00Z", body_text: VARUN }];
const ASK = "I'm not going back and forth with kottevarun@gmail.com. Draft a reply with items requested and show me before sending";
{
  const { f, sb, calls, gh } = mk(FABRICATED, row);
  ok(f.MAIL_DRAFT_RX.test(ASK) && f.MAIL_DRAFT_RX.test("Show me drafted reply to kottevarun@gmail.com before sending"), "both of the owner's phrasings are draft requests");
  ok(!f.MAIL_DRAFT_RX.test("write a task to fix the email worker") && !f.MAIL_DRAFT_RX.test("what do they say?"), "other asks are not");
  const r = await f.mailDraftReply({}, ASK, { holder: true, v: { items: [] } });
  ok(calls.some((c) => /lower\(sender\) LIKE/.test(c.sql) && c.b && c.b[0] === "%kottevarun@gmail.com%"), "the message is found by the exact address");
  ok(calls.some((c) => c.db === "IDENTITY" && /key = 'identity'/.test(c.sql)), "the identity document is read from the private store");
  const u = sb.__msgs[1].content;
  ok(/OWNER_FACTS:[\s\S]*research systems builder[\s\S]*builds research systems at QNFO/.test(u), "the model gets the public profile and the identity document");
  ok(/REPO_FACTS:[\s\S]*scripts\/router_calibrate\.py[\s\S]*b33509a 2026-09-26[\s\S]*Calibration-first routing/.test(u), "the model gets the file's path, commits and opening from GitHub", u.slice(0, 900));
  ok(gh.some((x) => /filename%3Arouter_calibrate\.py/.test(x)), "the file named in the thread is looked up in the repository");
  ok(/ready to send/.test(sb.__msgs[0].content) && /never write a placeholder/.test(sb.__msgs[0].content) && /never ask/.test(sb.__msgs[0].content), "the prompt demands a complete reply with no gaps and no questions");
  ok(sb.__ms <= 2e4, "the model budget leaves room for the fact reads under the 30 s limit");
  const send = r.actions.find((a) => a.op === "mailreply");
  ok(send && send.args.id === 4211, "every draft offers Send reply", r.actions);
  const body = send.args.text;
  ok(!/\[\[|FILL/.test(body), "no gap or placeholder reaches the reply", body);
  ok(!/Machine Learning Engineer|QNFO Operations/.test(body), "invented title and unit are gone with their sentences", body);
  ok(/commit b33509a on 26 September 2026/.test(body) && /Statement of Facts/.test(body) && /I, Rowan Quni, confirm/.test(body), "supported sentences and the requested statement stay", body);
  ok(!/\\n/.test(r.answer) && /\n\nDear Varun,/.test(r.answer), "line breaks are real");
  ok(/Best regards,\nRowan Quni\nrowan\.quni@qnfo\.org$/.test(body), "the sign-off is name and sending address only");
  ok(!/Feel free to edit/.test(body) && !/^Subject:/m.test(body), "the model's note and subject line are dropped");
  ok(/Ready to send\./.test(r.answer) && /3 sentences/.test(r.answer) && !/Only you can fill/.test(r.answer), "the answer says it is ready and asks the owner for nothing", r.answer.slice(-300));
  ok(r.actions.some((a) => a.fill && /^reply 4211 Dear Varun,/.test(a.fill)), "Edit, then send stays available");
  const { f: f2 } = mk("", row, [{ actions_json: JSON.stringify(r.actions) }]);
  const s = await f2.mailSendLastDraft({}, "ok, send it");
  ok(s && s.actions[0].op === "mailreply" && s.actions[0].args.id === 4211, "send it offers the last draft's Send button", s);
  ok((await f2.mailSendLastDraft({}, "send the weekly digest")) === null, "an unrelated send is not taken");
}
{
  const { f } = mk("x", row);
  const r = await f.mailDraftReply({}, ASK, { holder: false, v: { items: [] } });
  ok(/only the signed-in owner/.test(r.answer) && !/EB-1A/.test(r.answer), "a visitor is asked to sign in and sees no text");
  ok(f.mailDraftGuard("As you said, the Machine Learning Engineer role is open.", "machine learning engineer role").dropped.length === 0, "a phrase a record contains is kept");
}
// MAIL-REPLY-INSTRUCTION-1 (1.36.0): the owner's "reply 984 always show me draft first before sending" is an instruction.
{
  const { f } = mk("x", row);
  const sb2 = { RegExp, Number, String }; vm.createContext(sb2);
  vm.runInContext(cut("var MAIL_REPLY_LITERAL_RX", "// \"send it\" after a draft") + "\n__g = mailReplyInstruction;", sb2);
  const g = sb2.__g;
  const a = g("reply 984 always show me draft first before sending");
  ok(a && a.id === 984 && a.instruction === "always show me draft first before sending", "the screenshot's text is an instruction, not the email", a);
  ok(g("reply 984 thank him and decline politely").id === 984, "a short instruction is a draft request");
  ok(g("reply 4211 Dear Varun,\n\nThanks.\n\nBest regards,\nRowan Quni\nrowan.quni@qnfo.org") === null, "a filled draft (Edit, then send) is sent as written");
  ok(g("reply 7 Hi Ana, Tuesday works for me.") === null, "text that opens with a greeting is sent as written");
  ok(g("mail 984") === null, "other commands are untouched");
  ok(/const ri = mailReplyInstruction\(text\);\s*if \(ri\) text = "draft a reply to message #" \+ ri\.id/.test(src), "the command route turns the instruction into a draft request");
  ok(f.MAIL_DRAFT_RX.test("draft a reply to message #984. Owner's instruction: always show me draft first before sending"), "the rewritten text takes the draft path");
  ok(/data-fleet-cmd="draft a reply to message #' \+ Math\.max\.apply\(null, mids\) \+ '">Reply<\/button>/.test(src) && !/data-fleet-fill="reply '/.test(src), "the inbox card's Reply runs a complete draft");
  ok(/conCmd\("draft a reply to message #" \+ e\.id, "Reply"\)/.test(src), "mail <id>'s Reply runs a complete draft");
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
