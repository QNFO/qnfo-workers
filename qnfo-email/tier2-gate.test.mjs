// EMAIL-TIER2-GATE-1 offline suite (qnfo-email 2.11.1, agent_issues 1000469, pillar personal). Tier 2 of the voice drafter marks a reply "cleared for auto-send" and the drain sends it
// from rowan.quni@qnfo.org with no owner reply. email_reply_queue 75 and 76 (2026-10-22) went out that way to a recipient of the fleet's own cold-outreach follow-up, the second one
// in answer to a mail that called the note spam from an incompetent AI agent. This suite loads the real worker.js the way voice-drafter.test.mjs does and drives tierReplyQueue over
// an in-memory SQLite AUDIT_DB with a stubbed model and mail binding. Proves: with ops_config email_tier2_autosend absent, off, unreadable or any value that is not on, a tier 2
// verdict is stored as tier 3 with no auto-send marker and the draft goes to the owner as a handoff; with it on, a tier 2 row keeps the marker and nothing is mailed to the owner;
// a reply from a recipient of the fleet's own outreach is never tier 2 even with the switch on; complaint and accusation wording in what the sender wrote is tier 3, the fleet's
// own quoted opt-out line and "spam folder" are not complaints; tier 1 and the older tier 3 rules are unchanged; the two real mails of 2026-10-22 route to the owner.
// Run: node qnfo-email/tier2-gate.test.mjs   -> prints "N passed, 0 failed"
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { stripWorkerDefaultExport } from "../scripts/worker-source-test.mjs";
const src = stripWorkerDefaultExport(fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8"));
const lib = new Function(src.replace(/export default\{/, "const __handler={") +
  "\nreturn { VERSION, VOICE_DEFAULT, VOICE_COMPLAINT_RX, tierByRules, tier2AutosendOn, tierReplyQueue };")();

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? "  -- " + JSON.stringify(x).slice(0, 600) : "")); } };

const vm = /^(\d+)\.(\d+)\.(\d+)/.exec(lib.VERSION);
ok(vm && (+vm[1] > 2 || (+vm[1] === 2 && (+vm[2] > 11 || (+vm[2] === 11 && +vm[3] >= 1)))), "VERSION at least 2.11.1", lib.VERSION);

// ---------- the switch ----------
const cfgEnv = (value, broken) => ({ AUDIT_DB: { prepare: (s) => ({ first: async () => { if (broken) throw new Error("D1 down"); return value === undefined ? null : { value }; } }) } });
for (const v of ["on", "ON", " On ", "1", "true", "yes"]) ok(await lib.tier2AutosendOn(cfgEnv(v)) === true, "switch '" + v + "' is on");
for (const v of [undefined, "off", "0", "false", "", "maybe", "no", null]) ok(await lib.tier2AutosendOn(cfgEnv(v)) === false, "switch " + JSON.stringify(v) + " is off");
{ const e = console.error; console.error = () => {}; ok(await lib.tier2AutosendOn(cfgEnv("on", true)) === false, "an unreadable config is off (fail closed)"); console.error = e; }

// ---------- the rules ----------
const RE = lib.VOICE_COMPLAINT_RX;
for (const t of ["you're a genuine source of spam", "an incompetent AI agent", "stop emailing me", "please remove me from your list", "this is unsolicited", "I am not interested", "you severely misunderstood", "do not contact me", "that was rude", "is this a bot?"]) ok(RE.test(t), "complaint wording: " + t);
for (const t of ["it was stuck in a deeper layer of spam folder", "check your spam filter", "where can I find the PDF of the phase 2 paper?", "thanks, that works", "robotics lab", "the abbot of the monastery"]) ok(!RE.test(t), "not a complaint: " + t);
const typedOnly = "Thanks Rowan, where is the PDF?\r\n\r\n________________________________\r\nFrom: Rowan Brad Quni-Gudzinas <rowan.quni@qnfo.org>\r\nSent: Wednesday, 21 October 2026 10:01:03\r\nSubject: Following up: QNFO\r\n\r\nHello,\r\n\r\nIf you would rather not hear from me again, reply “stop” and I will not write again. I am not an incompetent AI agent, not spam, and not a bot.";
ok(lib.tierByRules("Re: Following up: QNFO", typedOnly, "friend@example.org") === null, "the fleet's own quoted note is not read as the sender's complaint");
const mail76 = "Dear Rowan,\r\n\r\nIf your original note appeal to your earlier note, then you're a genuine source of spam. If not, however, you have severely misunderstood my message and there is a good reason to treat you as an incompetent AI agent operating without an ounce of understanding.\r\n\r\nAll the best,\r\nJakub Cz.\r\n\r\n________________________________\r\nFrom: rowan.quni@qnfo.org\r\nSent: Thursday, 22 October 2026 07:01:05\r\nSubject: Re: Re: Following up: QNFO";
const r76 = lib.tierByRules("Re: Re: Following up: QNFO the energy-efficiency benchmark for quantum computing", mail76, "jakub.czartowski@tcd.ie");
ok(r76 && r76.tier === "3" && /complaint or accusation/.test(r76.reason), "email 1096 (queue 76, the complaint) is tier 3 by rule", r76);
const mail75 = "Dear Rowan,\r\n\r\nUnfortunately, your previous message has been stuck in a deeper layer of spam folder and removed automatically. Could you resend the original mail, as I do not know what it contained?\r\n\r\nAll the best,\r\nJakub Czartowski";
ok(lib.tierByRules("Re: Following up: QNFO the energy-efficiency benchmark for quantum computing", mail75, "jakub.czartowski@tcd.ie") === null, "email 1090 (queue 75) is not a complaint by wording: the outreach-recipient rule, not the wording, keeps it from tier 2");
ok(lib.tierByRules("x", "anything", "noreply@service.example").tier === "1" && lib.tierByRules("Letter", "Could you write a letter of recommendation for my application?", "colleague@uni.example").tier === "3", "tier 1 and the older tier 3 rule are unchanged");
ok(lib.tierByRules("Re: paper", "Thanks Rowan, where can I find the PDF of the phase 2 paper?", "friend@example.org") === null, "a plain question is still left to the classifier");

// ---------- tierReplyQueue end to end ----------
function world(opts) {
  opts = opts || {};
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE email_reply_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, email_id INTEGER NOT NULL, sender TEXT NOT NULL, person_key TEXT, subject TEXT, received_at TEXT, human_score INTEGER, decision TEXT NOT NULL DEFAULT 'pending', skip_reason TEXT, draft_text TEXT, drafted_at TEXT, sent_at TEXT, attempt_count INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), tier TEXT, tier_reason TEXT, draft_proposed TEXT);
CREATE TABLE emails (id INTEGER PRIMARY KEY, sender TEXT, subject TEXT, body_text TEXT, body_html TEXT, status TEXT DEFAULT 'received');
CREATE TABLE contact_ledger (email TEXT, suppress INTEGER DEFAULT 0);
CREATE TABLE outreach_log (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, subject TEXT, message_id TEXT, sent_at TEXT, status TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE TABLE agent_mail_trace (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now')), surface TEXT, email_id INTEGER, queue_id INTEGER, goal TEXT, steps TEXT, injection_score REAL, hits TEXT, decision TEXT, detail TEXT);`);
  if (opts.switchValue !== undefined) db.prepare("INSERT INTO ops_config (key, value) VALUES ('email_tier2_autosend', ?)").run(opts.switchValue);
  let n = 0;
  const add = (sender, subject, body, outreached) => {
    n++;
    db.prepare("INSERT INTO emails (id, sender, subject, body_text, status) VALUES (?, ?, ?, ?, 'received')").run(n, sender, subject, body);
    db.prepare("INSERT INTO email_reply_queue (email_id, sender, subject, decision, skip_reason) VALUES (?, ?, ?, 'escalate', 'awaiting authored draft')").run(n, sender, subject);
    db.prepare("INSERT INTO contact_ledger (email, suppress) VALUES (?, 0)").run(sender);
    if (outreached) db.prepare("INSERT INTO outreach_log (email, subject, sent_at, status) VALUES (?, 'Following up: QNFO', datetime('now'), 'sent')").run(sender.toLowerCase());
    return n;
  };
  const sent = [];
  const draft = opts.draft || "The PDF is at the link in your mail.\n\nRowan";
  const env = {
    AUDIT_DB: {
      prepare(sql) {
        let args = [];
        const s = {
          bind(...x) { args = x; return s; },
          async all() { return { results: db.prepare(sql).all(...args) }; },
          async first() { return db.prepare(sql).get(...args) || null; },
          async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
        };
        return s;
      }
    },
    DASH: { fetch: async () => ({ status: 200, json: async () => ({ doc: { body_md: lib.VOICE_DEFAULT, updated_at: "t" } }) }) },
    AI: { run: async (model, req) => {
      const sys = String(req.messages[0].content);
      if (/You classify one inbound email/.test(sys)) return { response: JSON.stringify(opts.verdict || { machine_written: false, tier: 2, confident: true, reason: "a short question the thread answers" }) };
      return { response: draft };
    } },
    SEND_EMAIL: { send: async (m) => { sent.push(m); } }
  };
  return { db, env, add, sent };
}
const row = (db, id) => db.prepare("SELECT * FROM email_reply_queue WHERE id = ?").get(id);

{ // switch absent: a tier 2 verdict is held for the owner
  const w = world();
  const id = w.add("friend@example.org", "Re: paper", "Thanks Rowan, where can I find the PDF of the phase 2 paper?", false);
  const out = await lib.tierReplyQueue(w.env);
  const r = row(w.db, id);
  ok(out.seen === 1 && out.tier2 === 0 && out.tier2_held === 1 && out.tier3 === 1, "switch absent: the tier 2 verdict is counted as held, not sent", out);
  ok(r.tier === "3" && !/cleared for auto-send/.test(r.skip_reason) && /tier 3: owner sends/.test(r.skip_reason) && /email_tier2_autosend is not on/.test(r.tier_reason), "the row is tier 3 with no auto-send marker and says why", r);
  ok(r.draft_proposed && r.draft_text === r.draft_proposed && r.sent_at === null && r.decision === "escalate", "the draft is kept for the owner; nothing is sent; the row waits for his answer", r);
  ok(w.sent.length === 1 && /^\[handoff\]/.test(w.sent[0].subject) && /Draft in your voice/.test(w.sent[0].text) && w.sent[0].to === "rwnquni@outlook.com", "the owner gets the handoff with the draft (the only mail the worker sends)", w.sent.map((m) => m.subject));
}
{ // switch on: tier 2 keeps the marker, no owner mail
  const w = world({ switchValue: "on" });
  const id = w.add("friend@example.org", "Re: paper", "Thanks Rowan, where can I find the PDF of the phase 2 paper?", false);
  const out = await lib.tierReplyQueue(w.env);
  const r = row(w.db, id);
  ok(out.tier2 === 1 && out.tier2_held === 0 && r.tier === "2" && /cleared for auto-send/.test(r.skip_reason) && w.sent.length === 0, "switch on: tier 2 keeps the auto-send marker and the owner is not mailed (his own setting)", { out, r });
}
{ // switch off explicitly
  const w = world({ switchValue: "off" });
  const id = w.add("friend@example.org", "Re: paper", "Where is the PDF?", false);
  await lib.tierReplyQueue(w.env);
  ok(row(w.db, id).tier === "3" && !/cleared for auto-send/.test(row(w.db, id).skip_reason), "switch off: held");
}
{ // an outreach recipient is never tier 2, even with the switch on (the second real mail of 2026-10-22 asked to resend our note)
  const w = world({ switchValue: "on" });
  const id = w.add("Jakub.Czartowski@tcd.ie", "Re: Following up: QNFO the energy-efficiency benchmark for quantum computing", mail75, true);
  const out = await lib.tierReplyQueue(w.env);
  const r = row(w.db, id);
  ok(out.tier2 === 0 && r.tier === "3" && /recipient of the fleet's own outreach/.test(r.tier_reason) && !/cleared for auto-send/.test(r.skip_reason) && w.sent.length === 1, "queue 75 (a recipient of our outreach asks us to resend) goes to the owner even with the switch on", { out, r });
}
{ // the complaint is tier 3 by rule: no model call decides it, nothing is auto-sent
  const w = world({ switchValue: "on" });
  const id = w.add("Jakub.Czartowski@tcd.ie", "Re: Re: Following up: QNFO the energy-efficiency benchmark for quantum computing", mail76, true);
  const out = await lib.tierReplyQueue(w.env);
  const r = row(w.db, id);
  ok(out.tier3 === 1 && r.tier === "3" && /complaint or accusation/.test(r.tier_reason) && !/cleared for auto-send/.test(r.skip_reason), "queue 76 (the complaint) is tier 3 with the switch on", { out, r });
}
{ // tier 1 is unchanged: a machine-written verdict stays tier 1, no draft, no notice
  const w = world({ switchValue: "on" });
  const id = w.add("sales@vendor.example", "Re: hello", "Dear Sir, please see our offer.", true);
  w.env.AI.run = async () => ({ response: JSON.stringify({ machine_written: true, tier: 2, confident: true, reason: "templated" }) });
  const out = await lib.tierReplyQueue(w.env);
  ok(out.tier1 === 1 && row(w.db, id).tier === "1" && row(w.db, id).decision === "skip" && w.sent.length === 0, "a machine-written verdict is still tier 1 with no draft and no notice (also for an outreach recipient)", out);
}
{ // a tier 3 verdict stays tier 3 whatever the switch says
  const w = world({ switchValue: "on" });
  const id = w.add("friend@example.org", "Re: paper", "Could you join a call about the grant on Friday?", false);
  w.env.AI.run = async (m, req) => (/You classify one inbound email/.test(String(req.messages[0].content)) ? { response: JSON.stringify({ machine_written: false, tier: 3, confident: true, reason: "a meeting" }) } : { response: "Friday works.\n\nRowan" });
  const out = await lib.tierReplyQueue(w.env);
  ok(out.tier3 >= 1 && row(w.db, id).tier === "3" && w.sent.length === 1, "a tier 3 mail is handed to the owner with the switch on", out);
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
