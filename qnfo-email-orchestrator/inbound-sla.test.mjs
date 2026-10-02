// INBOUND-SLA-1 offline suite for qnfo-email-orchestrator (pillar: reach). Drives the real inboundSlaStep and
// inboundSlaMetrics from worker.js against in-memory SQLite D1 shims (qnfo-audit as AUDIT_DB with the live
// email_reply_queue tone and terminal-parent triggers and the metric_registry integrity triggers, qnfo-outreach as
// OUTREACH_DB), a recording qnfo-email /send and a scripted Workers AI. It proves: category routing; nothing is ever sent
// to a no-reply, automated, list or internal sender; at most one holding acknowledgement per thread (also under two
// concurrent runs); reserved categories (legal, personal, money, press) never get a substantive answer and funders,
// hiring managers, commercial senders and people outside the research-outreach campaign get no mail at all; the ops_config
// kill switch inbound_sla_enabled (absent = on) and external_sends_enabled; cadence caps; send failures; the decision log
// and run ledger; and the two metrics, written idempotently. Synthetic data only.
// Run: node qnfo-email-orchestrator/inbound-sla.test.mjs   -> prints "N passed, 0 failed" (Node 22: node:sqlite)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const patched = src + "\nexport { inboundSlaStep as __step, inboundSlaMetrics as __metrics, slaCategorize as __categorize, slaGateText as __gate, slaPlainText as __plain, slaNewText as __newText, INBOUND_SLA_RULES as __RULES, SLA_ACK_TEXT as __ACK, VERSION as __VERSION, worker_default as __worker };\n";
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));
const { __step: step, __metrics: metrics, __categorize: categorize, __gate: gate, __plain: plain, __newText: newText, __RULES: RULES, __ACK: ACK, __worker: worker } = mod;

let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (extra !== undefined ? " :: " + JSON.stringify(extra) : "")); } };

function stmtOn(dbx, sql) {
  let args = [];
  const self = {
    bind(...a) { args = a.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v)); return self; },
    async all() { return { results: dbx.prepare(sql).all(...args) }; },
    async first() { return dbx.prepare(sql).get(...args) || null; },
    async run() { const r = dbx.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
  };
  return self;
}
const shim = (dbx) => ({ prepare: (sql) => stmtOn(dbx, sql) });
const H = 36e5;
const iso = (hAgo) => new Date(Date.now() - hAgo * H).toISOString();

function fresh(opts) {
  opts = opts || {};
  const audit = new DatabaseSync(":memory:");
  audit.exec(`CREATE TABLE emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT, body_text TEXT, body_html TEXT, headers_json TEXT, classification TEXT DEFAULT 'general', status TEXT DEFAULT 'received', processing_ms INTEGER, received_at TEXT DEFAULT (datetime('now')), processed_at TEXT, in_reply_to TEXT, references_hdr TEXT);
    CREATE TABLE email_reply_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, email_id INTEGER NOT NULL, sender TEXT NOT NULL, person_key TEXT, subject TEXT, received_at TEXT, human_score INTEGER, decision TEXT NOT NULL DEFAULT 'pending', skip_reason TEXT, draft_text TEXT, drafted_at TEXT, sent_at TEXT, attempt_count INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TRIGGER email_reply_queue_terminal_parent AFTER UPDATE OF decision ON email_reply_queue WHEN NEW.decision IN ('sent','skip','closed') BEGIN UPDATE emails SET status = CASE WHEN NEW.decision='sent' THEN 'replied' WHEN status IN ('received','read','processed') THEN 'archived' ELSE status END WHERE id=NEW.email_id; END;
    CREATE TRIGGER email_reply_queue_tone_gate_draft BEFORE UPDATE OF draft_text ON email_reply_queue WHEN NEW.draft_text IS NOT NULL AND (lower(NEW.draft_text) LIKE '%cannot support%' OR lower(NEW.draft_text) LIKE '%not interested%' OR lower(NEW.draft_text) LIKE '%unfortunately%' OR lower(NEW.draft_text) LIKE '%reject%' OR lower(NEW.draft_text) LIKE '%decline%' OR lower(NEW.draft_text) LIKE '%not a fit%' OR lower(NEW.draft_text) LIKE '%unable to help%' OR lower(NEW.draft_text) LIKE '%do not contact%') BEGIN SELECT RAISE(ABORT, 'GOOD-VIBES-REPLY-TONE-1: negative/rejection draft blocked at DB layer'); END;
    CREATE TABLE contact_ledger (email TEXT PRIMARY KEY, name TEXT, affiliation TEXT, first_contact TEXT, last_contact TEXT, contact_count INTEGER DEFAULT 0, status TEXT, suppress_reason TEXT, person_key TEXT, last_reply_at TEXT, suppress INTEGER DEFAULT 0, reply_count INTEGER DEFAULT 0);
    CREATE TABLE email_suppression (email TEXT PRIMARY KEY, reason TEXT, source TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
    CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE fleet_heartbeat (worker TEXT PRIMARY KEY, version TEXT, ts TEXT, ok INTEGER);
    CREATE TABLE capability_audit_snapshot (service TEXT PRIMARY KEY, version TEXT, capabilities TEXT, limitations TEXT, ts TEXT);
    CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
    CREATE TRIGGER metric_registry_source_required_ins BEFORE INSERT ON metric_registry FOR EACH ROW WHEN NEW.source_of_truth IS NULL OR trim(NEW.source_of_truth)='' OR NEW.disposition_actor IS NULL OR trim(NEW.disposition_actor)='' OR NEW.refresh_cadence IS NULL OR trim(NEW.refresh_cadence)='' BEGIN SELECT RAISE(ABORT,'METRIC-INTEGRITY-1'); END;
    CREATE TRIGGER metric_registry_cadence_canonical_ins BEFORE INSERT ON metric_registry FOR EACH ROW WHEN NEW.refresh_cadence IS NOT NULL AND trim(NEW.refresh_cadence) <> '' AND ( instr(trim(NEW.refresh_cadence),' ') > 0 OR NOT ( lower(trim(NEW.refresh_cadence)) IN ('hourly','daily','weekly','monthly') OR trim(NEW.refresh_cadence) GLOB '*/[0-9]*' OR trim(NEW.refresh_cadence) GLOB '[0-9]*m' OR trim(NEW.refresh_cadence) GLOB '[0-9]*h' ) ) BEGIN SELECT RAISE(ABORT,'METRIC-CADENCE-CANONICAL-1'); END;`);
  const outreach = new DatabaseSync(":memory:");
  outreach.exec(`CREATE TABLE pipeline_state (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE contacts (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, suppress INTEGER NOT NULL DEFAULT 0, status TEXT);`);
  if (opts.sends != null) outreach.prepare("INSERT INTO pipeline_state (key, value, updated_at) VALUES ('external_sends_enabled', ?, datetime('now'))").run(String(opts.sends));
  const sent = [];
  const ai = { calls: 0, reply: opts.ai || "ESCALATE" };
  const email = { status: opts.sendStatus || 200 };
  let mid = 0;
  const env = {
    AUDIT_DB: shim(audit), OUTREACH_DB: shim(outreach), EMAIL_API_KEY: "test-key",
    AI: { async run() { ai.calls++; return { response: ai.reply }; } },
    EMAIL: { async fetch(url, init) {
      const b = JSON.parse(init.body);
      if (email.status !== 200) return { ok: false, status: email.status, json: async () => ({ error: "unauthorized" }) };
      sent.push(b);
      // qnfo-email /send records the outbound mail, as the real route does.
      audit.prepare("INSERT INTO emails (message_id, sender, recipient, subject, body_text, headers_json, received_at, status) VALUES (?, ?, ?, ?, ?, '{}', ?, 'sent')").run("out-" + (++mid), b.from, b.to, b.subject, b.body, new Date().toISOString());
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    } }
  };
  let n = 0;
  const inbound = (o) => {
    const recv = iso(o.h == null ? 30 : o.h);
    const e = audit.prepare("INSERT INTO emails (message_id, sender, recipient, subject, body_text, headers_json, received_at, status) VALUES (?, ?, 'rowan.quni@qnfo.org', ?, ?, ?, ?, 'processed')").run("in-" + (++n) + "@x", o.from, o.subject || "Question", o.body || "", JSON.stringify(o.headers || {}), recv);
    const q = audit.prepare("INSERT INTO email_reply_queue (email_id, sender, subject, received_at, human_score, decision, skip_reason, created_at) VALUES (?, ?, ?, ?, 2, ?, ?, ?)").run(Number(e.lastInsertRowid), o.from, o.subject || "Question", recv, o.decision || "escalate", o.skip || "awaiting authored draft", recv.slice(0, 19).replace("T", " "));
    return Number(q.lastInsertRowid);
  };
  const correspondent = (addr) => audit.prepare("INSERT OR REPLACE INTO contact_ledger (email, status, suppress) VALUES (?, 'outreach', 0)").run(addr);
  const q = (id) => audit.prepare("SELECT * FROM email_reply_queue WHERE id = ?").get(id);
  const decision = (id) => { const r = audit.prepare("SELECT * FROM cloud_ops_events WHERE id = ?").get("inbound-sla-q-" + id); return r ? Object.assign({ status: r.status }, JSON.parse(r.meta)) : null; };
  return { audit, outreach, env, sent, ai, email, inbound, correspondent, q, decision };
}

// 1. Category routing (deterministic, no model).
{
  const base = { sender: "a.researcher@uni.example", subject: "Question", text: "", headers: {}, receivedAt: iso(30), correspondent: true, answered: false };
  const cat = (o) => categorize(Object.assign({}, base, o)).category;
  ok(cat({ answered: true, text: "invoice attached" }) === "answered", "an answered message is closed before anything else");
  ok(cat({ sender: "team@foresight.org", subject: "Foresight RFP: Thank you for your Submission!" }) === "funder_receipt", "a funder's submission receipt");
  ok(cat({ sender: "ops@effectivealtruism.com", receivedAt: "2026-08-19T17:42:13.596Z", text: "Out of scope." }) === "funder_handled", "a funder decision already recorded (handled_through)");
  ok(cat({ sender: "grants@manifund.org", text: "Can you share more detail?" }) === "funder", "a funder reply is held");
  ok(cat({ sender: "noreply@foresight.org", subject: "Decision on your application" }) === "funder", "a funder decision from a no-reply address is held, not closed as automated");
  ok(cat({ sender: "stranger@corp.example", subject: "About your grant application", text: "The fund has a question." , correspondent: false }) === "funder", "a funding subject from outside the campaign is held as a funder");
  ok(cat({ sender: "noreply@journal.example" }) === "automated", "no-reply address");
  ok(cat({ sender: "notifications@service.example" }) === "automated", "notifications address");
  ok(cat({ headers: { "auto-submitted": "auto-replied" } }) === "automated", "Auto-Submitted header");
  ok(cat({ headers: { "list-unsubscribe": "<mailto:x>" } }) === "automated", "list mail");
  ok(cat({ headers: { precedence: "bulk" } }) === "automated", "Precedence: bulk");
  ok(cat({ subject: "Thanks for your inquiry (Ticket#123)", text: "Your request (Ticket#3327646) has been received and will be reviewed." }) === "automated", "ticket autoresponder");
  ok(cat({ sender: "someone@qwav.tech" }) === "automated", "internal sender");
  ok(cat({ subject: "Invitation to submit your manuscript" , correspondent: false}) === "solicitation", "solicitation");
  ok(cat({ text: "Please remove me from your list." }) === "opt_out", "opt-out");
  ok(cat({ text: "We would like to discuss a full-time position and salary." }) === "employment", "employment");
  ok(cat({ text: "This is a notice of copyright infringement." }) === "legal", "legal");
  ok(cat({ text: "I am on medical leave until next month." }) === "personal", "health or personal");
  ok(cat({ text: "Please find the invoice attached." }) === "money", "money");
  ok(cat({ text: "I am a journalist writing a story on AI energy use." }) === "press", "press");
  ok(cat({ text: "We offer SEO services for research sites.", correspondent: false }) === "commercial", "commercial offer");
  ok(cat({ text: "Thank you for the note on my paper. Best wishes." }) === "thread_close", "thanks with no question closes the thread");
  ok(cat({ text: "Thank you for the paper. " + "I think the derivation in section 3 changes sign between the second and third lines, which affects the bound. ".repeat(4) }) === "research_reply", "a long comment that starts with thanks is not a thread close");
  ok(cat({ text: "I don't see any connection between the two topics. Best regards" }) === "thread_close", "a decline closes the thread");
  ok(cat({ text: "Could you send the measurement table?" }) === "research_reply", "a correspondent's question");
  ok(cat({ text: "That would be helpful information for us" }) === "research_reply", "a correspondent's request without a question mark");
  ok(cat({ text: "Could you send the measurement table?", correspondent: false }) === "unknown_human", "the same question from outside the campaign");
  const actions = Object.keys(RULES).map((k) => RULES[k].action);
  ok(actions.every((a) => ["close", "skip", "hold", "hold_ack", "answer"].includes(a)) && RULES.funder.action === "hold" && RULES.employment.action === "hold" && RULES.unknown_human.action === "hold" && RULES.commercial.action === "hold", "the map: funders, employment, commercial and outsiders are hold (no mail)");
  ok(["legal", "personal", "money", "press"].every((k) => RULES[k].action === "hold_ack"), "the map: reserved topics are hold_ack (never an answer)");
}

// 2. MIME bodies stored raw by the pre-2026-09-21 parser, and quoted history.
{
  const b64 = Buffer.from("Appreciate it, thanks.\r\n\r\nOn Aug 27, 2026, at 2:03 am, rowan.quni@qnfo.org wrote:\r\n\r\nHi,\r\nlong quoted text here ...").toString("base64");
  const raw = "--_000_ABCDEF123456_\r\nContent-Type: text/plain; charset=\"utf-8\"\r\nContent-Transfer-Encoding: base64\r\n\r\n" + b64.replace(/(.{76})/g, "$1\r\n").slice(0, 110) + "\r\n";
  ok(newText(plain(raw)) === "Appreciate it, thanks.", "a truncated base64 part decodes and the quote is cut", newText(plain(raw)));
  const qp = "--000000000000616a\r\nContent-Type: text/plain; charset=\"UTF-8\"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nHi,\r\nIt doesn=E2=80=99t fit.\r\nBest\r\n________________________________\r\nFrom: someone\r\n";
  ok(/doesn\u2019t fit/.test(newText(plain(qp))) && !/From:/.test(newText(plain(qp))), "quoted-printable decodes as UTF-8; the Outlook header block is cut");
  ok(newText("Thank you.\n\nBest wishes,\nN.\n\nx@qnfo.org \u043f\u0438\u0441\u0430\u043b(\u0430) 2026-08-27 21:58:\n> quoted") === "Thank you.\n\nBest wishes,\nN.", "a non-English quote header is cut");
}

// 3. Gates on what the fleet would send.
{
  ok(gate(ACK, null) === null && /sent automatically/.test(ACK) && !/[^\x09\x0a\x0d\x20-\x7e]/.test(ACK), "the holding acknowledgement passes every gate, is ASCII and discloses automation");
  ok(!/\b(will|tomorrow|next week|reply soon|get back)\b/i.test(ACK.replace(/makes no commitment/, "")), "the acknowledgement promises nothing");
  ok(/^gate 3/.test(gate("Caf\u00c3\u00a9 note", null)), "mojibake refused");
  ok(/^gate 3/.test(gate("Thanks \u2014 noted", "x")), "non-ASCII refused");
  ok(/^gate 4/.test(gate("See https://example.org", "x")), "links refused");
  ok(/^gate 2/.test(gate("Our patent portfolio covers this.", "x")), "identity lexicon");
  ok(/commits/.test(gate("Thanks, I will send it tomorrow.", "send it")), "a draft that commits the owner's time is refused");
  ok(/^gate 1/.test(gate("Thanks for the 42 samples.", "thanks for the samples")), "a number not in the inbound message is refused");
  ok(gate("Thanks for the 42 samples.", "here are 42 samples") === null, "a number present in the inbound message passes");
  ok(gate("This is unfortunately not a fit.", "x") === "tone gate", "the tone gate is applied before the DB trigger");
}

// 4. The ten live shapes of 2026-10-02 (synthetic stand-ins, no real content): 9 closed, 1 held, nothing sent.
{
  const t = fresh({ sends: 1, ai: "DRAFT: Thanks." });
  const corr = ["a@uni-it.example", "b@corp-us.example", "c@uni-us.example", "d@inst-ru.example", "e@bench.example", "f@uni-fr.example"];
  corr.forEach(t.correspondent);
  const ids = {};
  ids.r14 = t.inbound({ from: corr[0], subject: "Re: Fwd: a long thread", body: "This is a multi-part message in MIME format.\n--------------BOUNDARY123456\nContent-Type: text/plain; charset=UTF-8\nContent-Transfer-Encoding: 8bit\n\nThat would be helpful information for us\n\nRegards\n\nA and B\n\nIl 06/08/2026 09:16, A ha scritto:\n> quoted\n", h: 57 * 24, skip: "REOPENED 2026-10-01 (#1158): closed by the terminal-parent sweep with no outbound reply after the inbound; owner-authored reply required, never auto-draft" });
  ids.r25 = t.inbound({ from: "ops@effectivealtruism.com", subject: "Re: grant application", body: "The fund is no longer accepting applications; out of scope.", h: 0 });
  t.audit.prepare("UPDATE email_reply_queue SET received_at = '2026-08-19T17:42:13.596Z' WHERE id = ?").run(ids.r25);
  ids.r33 = t.inbound({ from: corr[1], subject: "Re: a benchmark", body: "--_000_IDIDIDID_\r\nContent-Type: text/plain; charset=\"utf-8\"\r\nContent-Transfer-Encoding: base64\r\n\r\n" + Buffer.from("Appreciate it.\r\n\r\nOn Aug 27, 2026, at 2:03 am, rowan.quni@qnfo.org wrote:\r\nold").toString("base64") + "\r\n", h: 36 * 24 });
  ids.r35 = t.inbound({ from: corr[2], subject: "Re: QNFO: a related result", body: "Dear R,\n\nThank you for your email.\n\nI don't see any connection between the two topics.\n\nBest regards,\nS\n\n________________________________\nFrom: rowan.quni@qnfo.org", h: 25 * 24 });
  ids.r36 = t.inbound({ from: corr[3], subject: "=?UTF-8?Q?Re=3A_Dynamics_?= =?UTF-8?Q?=E2=80=94_a_note?=", body: "Dear Dr.,\n\nThank you for your recent publication and a note on my paper.\n\nBest wishes,\nN.\n\nrowan.quni@qnfo.org \u043f\u0438\u0441\u0430\u043b(\u0430) 2026-08-27 21:58:\n> quoted", h: 23 * 24 });
  ids.r46 = t.inbound({ from: corr[4], subject: "Re: Re: Energy per compute", body: "Can you create energy numbers for a demo workload?", h: 4 * 24 });
  ids.r48 = t.inbound({ from: corr[5], subject: "Re: Braiding", body: "Regarding our discussion: the phase is quantised.", h: 36 });
  ids.r49 = t.inbound({ from: corr[4], subject: "Re: Re: Energy per compute", body: "So none of your initial offers are still valid?", h: 25 });
  // the session replies of 2026-10-01 21:02 (after 46, 48 and 49 arrived)
  for (const a of [corr[4], corr[5]]) t.audit.prepare("INSERT INTO emails (message_id, sender, recipient, subject, body_text, received_at, status) VALUES (?, 'rowan.quni@qnfo.org', ?, 'Re: x', 'a substantive reply', ?, 'sent')").run("sess-" + a, a, iso(10));
  ids.r50 = t.inbound({ from: "support@datarepo.example", subject: "Thanks for your inquiry (Removal request: files)", body: "Your request (Ticket#3327646) has been received and will be reviewed by our support staff.", headers: { "auto-submitted": "auto-generated", precedence: "bulk" }, h: 9 });
  ids.r51 = t.inbound({ from: "rfp@foresight.org", subject: "Foresight AI Nodes RFP: Thank you for your Submission!", body: "We will evaluate your proposal after the deadline.", h: 8 });
  const r = await step(t.env, {});
  const want = { r14: ["research_reply", "held"], r25: ["funder_handled", "closed"], r33: ["thread_close", "closed"], r35: ["thread_close", "closed"], r36: ["thread_close", "closed"], r46: ["answered", "closed"], r48: ["answered", "closed"], r49: ["answered", "closed"], r50: ["automated", "closed"], r51: ["funder_receipt", "closed"] };
  for (const k of Object.keys(want)) {
    const d = t.decision(ids[k]);
    ok(d && d.category === want[k][0] && d.outcome === want[k][1], "live shape " + k + " -> " + want[k].join("/"), d);
  }
  ok(t.sent.length === 0 && t.ai.calls === 0, "the ten live shapes send nothing and call no model", { sent: t.sent.length, ai: t.ai.calls });
  ok(r.counts.closed === 9 && r.counts.held === 1, "9 closed, 1 held", r.counts);
  ok(t.q(ids.r14).decision === "held" && /never auto-draft|older than 14 d/.test(t.q(ids.r14).skip_reason) && /weekly identity review/.test(t.q(ids.r14).skip_reason), "the 57-day research thread is held for the weekly identity review, no late note", t.q(ids.r14).skip_reason);
  ok(t.q(ids.r25).decision === "closed" && /^INBOUND-SLA-1 funder_handled\/closed/.test(t.q(ids.r25).skip_reason), "the EA Funds-shaped decision is closed with its reason");
  ok(t.audit.prepare("SELECT status FROM emails WHERE id = (SELECT email_id FROM email_reply_queue WHERE id = ?)").get(ids.r50).status === "archived", "closing archives the parent (terminal-parent trigger)");
  const d = t.decision(ids.r46);
  ok(d && d.domain === "bench.example" && !("body" in d) && !JSON.stringify(d).includes("e@bench.example"), "the decision row carries the domain only, never the address or body");
  const r2 = await step(t.env, {});
  ok(r2.scanned === 0, "a decided row is never scanned again");
  const led = t.audit.prepare("SELECT * FROM cloud_ops_events WHERE id = ?").get("inbound-sla-run-" + new Date().toISOString().slice(0, 10));
  const lm = JSON.parse(led.meta);
  ok(led.status === "ok" && lm.last_ok && lm.runs === 2 && led.kind === "inbound-sla-run", "the run ledger upserts one row per day with meta.last_ok and a run count", lm);
}

// 5. Never a reply to no-reply, automated, list or internal senders, whatever the topic or age.
{
  const t = fresh({ sends: 1, ai: "DRAFT: Thanks." });
  const senders = [["noreply@uni.example", {}], ["alerts@uni.example", {}], ["prof@uni.example", { "auto-submitted": "auto-replied" }], ["prof2@uni.example", { "list-id": "<l.example>" }], ["ops@qnfo.org", {}]];
  const ids = senders.map(([a, h]) => { t.correspondent(a); return t.inbound({ from: a, subject: "Legal notice", body: "A copyright question: could you reply?", headers: h, h: 30 }); });
  await step(t.env, {});
  ok(t.sent.length === 0 && ids.every((id) => t.decision(id).category === "automated" && t.decision(id).outcome === "closed"), "automated senders are closed and never mailed", ids.map(t.decision));
}

// 6. One holding acknowledgement per thread, also under two concurrent runs.
{
  const t = fresh({ sends: 1, ai: "DRAFT: Sure." });
  t.correspondent("lawyer@firm.example");
  const a = t.inbound({ from: "lawyer@firm.example", subject: "Copyright question", body: "A copyright question about figure 3: may we reuse it?", h: 30 });
  const b = t.inbound({ from: "lawyer@firm.example", subject: "Re: Copyright question", body: "Following up on the copyright question.", h: 29 });
  await Promise.all([step(t.env, {}), step(t.env, {})]);
  ok(t.sent.length === 1 && t.sent[0].body === ACK && t.sent[0].from === "rowan.quni@qnfo.org" && t.sent[0].subject === "Re: Copyright question", "two concurrent runs send exactly one acknowledgement for the thread", t.sent.map((s) => s.subject));
  ok(t.decision(a).outcome === "acked" && t.decision(b).outcome === "held" && /already had (its one|an automatic) acknowledgement/.test(t.decision(b).reason), "the second message in the thread is held, not acknowledged again", [t.decision(a), t.decision(b)]);
  ok(t.q(a).sent_at && t.q(a).decision === "held" && t.q(a).draft_text === ACK, "an acknowledged row is held with sent_at set (the sent-as-you digest lists it)");
  ok(t.ai.calls === 0, "a reserved topic never reaches the drafter");
  const c = t.inbound({ from: "lawyer@firm.example", subject: "A different legal topic", body: "A second copyright matter.", h: 28 });
  await step(t.env, {});
  ok(t.sent.length === 1 && t.decision(c).outcome === "held" && /already had an automatic acknowledgement/.test(t.decision(c).reason), "one acknowledgement per sender per 30 days, even in a new thread");
}

// 7. Reserved categories never get a substantive answer; funders, employment, commercial and outsiders get no mail.
{
  const t = fresh({ sends: 1, ai: "DRAFT: Of course, here is the answer." });
  const cases = [["l@x1.example", "legal", "A trademark question for you?"], ["p@x2.example", "personal", "About my medical leave, any news?"], ["m@x3.example", "money", "Can you send an invoice?"], ["j@x4.example", "press", "I am a journalist: may I quote you?"]];
  const ids = cases.map(([a, , body]) => { t.correspondent(a); return t.inbound({ from: a, subject: "Topic " + a, body, h: 30 }); });
  await step(t.env, {});
  ok(t.sent.length === 2 && ids.filter((id) => t.decision(id)).length === 2, "two acknowledgements per run (cadence cap), the rest wait for the next run", t.sent.length);
  await step(t.env, {});
  ok(t.ai.calls === 0 && t.sent.length === 4 && t.sent.every((s) => s.body === ACK), "reserved topics: no drafter call and only the acknowledgement text", t.sent.map((s) => s.body.slice(0, 30)));
  ok(ids.every((id, i) => t.decision(id).category === cases[i][1] && t.decision(id).outcome === "acked"), "each reserved topic is recognised and acknowledged once", ids.map(t.decision));
  const t2 = fresh({ sends: 1, ai: "DRAFT: Of course." });
  t2.correspondent("hr@company.example");
  const none = [t2.inbound({ from: "grants@manifund.org", subject: "Your application", body: "One question about the budget?", h: 30 }),
    t2.inbound({ from: "hr@company.example", subject: "Role", body: "We would like to offer you a full-time position.", h: 30 }),
    t2.inbound({ from: "sales@vendor.example", subject: "Offer", body: "We offer SEO services, interested?", h: 30 }),
    t2.inbound({ from: "curious@reader.example", subject: "Your paper", body: "Could you explain section 2?", h: 30 })];
  await step(t2.env, {});
  ok(t2.sent.length === 0 && t2.ai.calls === 0, "funder, employment, commercial and outside-campaign senders get no mail and no draft");
  ok(none.every((id) => t2.decision(id).outcome === "held" && /weekly identity review/.test(t2.decision(id).reason)), "they are held and recorded for the weekly identity review", none.map(t2.decision));
  ok(["funder", "employment", "commercial", "unknown_human"].every((c, i) => t2.decision(none[i]).category === c), "and categorised as such", none.map((id) => t2.decision(id).category));
}

// 8. Research correspondents: a gated short answer, else one acknowledgement; grace; never-auto-draft rows.
{
  const t = fresh({ sends: 1, ai: "DRAFT: Thank you for the measurement table." });
  t.correspondent("r1@uni1.example");
  const a = t.inbound({ from: "r1@uni1.example", subject: "Re: benchmark", body: "Here is the measurement table you asked about. Does it help?", h: 30 });
  await step(t.env, {});
  ok(t.ai.calls === 1 && t.sent.length === 1 && t.sent[0].body.startsWith("Thank you for the measurement table.") && /Drafted with AI assistance and sent automatically/.test(t.sent[0].body), "a gated answer is sent with the automation disclosure", t.sent[0] && t.sent[0].body);
  ok(t.decision(a).outcome === "answered" && t.q(a).decision === "sent" && t.q(a).sent_at, "the answered row is sent with sent_at");
  t.ai.reply = "DRAFT: Thanks, see https://qnfo.org for details.";
  t.correspondent("r2@uni2.example");
  const b = t.inbound({ from: "r2@uni2.example", subject: "Re: other", body: "Where can I read more?", h: 30 });
  await step(t.env, {});
  ok(t.sent.length === 2 && t.sent[1].body === ACK && t.decision(b).outcome === "acked" && /gate 4/.test(t.decision(b).reason), "a draft that fails a gate falls back to the acknowledgement", t.decision(b));
  t.ai.reply = "ESCALATE";
  t.correspondent("r3@uni3.example");
  const c = t.inbound({ from: "r3@uni3.example", subject: "Re: theory", body: "What is the exchange phase for odd turns?", h: 30 });
  const young = t.inbound({ from: "r3@uni3.example", subject: "Re: another", body: "And for even turns?", h: 5 });
  const calls = t.ai.calls;
  await step(t.env, {});
  ok(t.decision(c).outcome === "acked" && /drafter escalated/.test(t.decision(c).reason) && t.ai.calls === calls + 1, "a technical question the drafter escalates gets the acknowledgement");
  ok(!t.decision(young) && t.q(young).decision === "escalate", "inside the 24h grace nothing is decided");
  t.correspondent("r4@uni4.example");
  const nd = t.inbound({ from: "r4@uni4.example", subject: "Re: x", body: "Could you share the data?", h: 30, skip: "owner-authored reply required, never auto-draft" });
  const calls2 = t.ai.calls;
  await step(t.env, {});
  ok(t.ai.calls === calls2 && t.decision(nd).outcome === "acked" && /never auto-draft/.test(t.decision(nd).reason), "a never-auto-draft row gets no draft, only the acknowledgement", t.decision(nd));
  t.audit.prepare("INSERT INTO email_suppression (email, reason) VALUES ('r5@uni5.example', 'opt-out')").run();
  t.correspondent("r5@uni5.example");
  const sup = t.inbound({ from: "r5@uni5.example", subject: "Re: y", body: "One more question?", h: 30 });
  const sentBefore = t.sent.length;
  await step(t.env, {});
  ok(t.sent.length === sentBefore && t.decision(sup).outcome === "held" && /suppressed/.test(t.decision(sup).reason), "a suppressed correspondent is never mailed");
}

// 9. Kill switches.
{
  const t = fresh({ sends: 1 });
  t.correspondent("k@uni.example");
  const a = t.inbound({ from: "k@uni.example", subject: "Copyright", body: "A copyright question?", h: 30 });
  t.audit.prepare("INSERT INTO ops_config (key, value) VALUES ('inbound_sla_enabled', '0')").run();
  const r = await step(t.env, {});
  ok(r.disabled && !t.decision(a) && t.sent.length === 0, "inbound_sla_enabled=0 stops the step");
  const led = t.audit.prepare("SELECT status, meta FROM cloud_ops_events WHERE id LIKE 'inbound-sla-run-%'").get();
  ok(led.status === "disabled" && JSON.parse(led.meta).last_ok === null, "the ledger records 'disabled' and no last_ok");
  t.audit.prepare("UPDATE ops_config SET value = 'off' WHERE key = 'inbound_sla_enabled'").run();
  ok((await step(t.env, {})).disabled, "'off' also stops it");
  t.audit.prepare("DELETE FROM ops_config").run();
  await step(t.env, {});
  ok(t.decision(a) && t.decision(a).outcome === "acked", "absent = on");
  const t2 = fresh({ sends: 0 });
  t2.correspondent("k2@uni.example");
  const c = t2.inbound({ from: "k2@uni.example", subject: "Copyright", body: "A copyright question?", h: 30 });
  const auto = t2.inbound({ from: "noreply@x.example", subject: "Notice", body: "n", h: 1 });
  await step(t2.env, {});
  ok(t2.sent.length === 0 && !t2.decision(c) && t2.decision(auto).outcome === "closed", "external_sends_enabled=0: closes still happen, sends wait");
  t2.audit.prepare("UPDATE email_reply_queue SET received_at = ? WHERE id = ?").run(iso(70), c);
  await step(t2.env, {});
  ok(t2.sent.length === 0 && t2.decision(c).outcome === "held" && /sends paused/.test(t2.decision(c).reason), "near the 72h deadline with sends paused the item is held without a note", t2.decision(c));
}

// 10. Send failures free the thread claim; after two failures the item is held.
{
  const t = fresh({ sends: 1, sendStatus: 401 });
  t.correspondent("f@uni.example");
  const a = t.inbound({ from: "f@uni.example", subject: "Copyright", body: "A copyright question?", h: 30 });
  const r = await step(t.env, {});
  ok(r.counts.send_failed === 1 && !t.decision(a) && t.q(a).decision === "escalate" && t.q(a).draft_text === null, "a failed send is not a decision; the draft is cleared", r.counts);
  ok(!t.audit.prepare("SELECT 1 FROM cloud_ops_events WHERE id LIKE 'inbound-sla-ack-%'").get() && t.audit.prepare("SELECT COUNT(*) n FROM cloud_ops_events WHERE id LIKE 'inbound-sla-fail-%'").get().n === 1, "the claim is freed and the failure recorded");
  await step(t.env, {});
  await step(t.env, {});
  ok(t.decision(a) && t.decision(a).outcome === "held" && /send failed 2 times/.test(t.decision(a).reason) && t.sent.length === 0, "after two failures the item is held", t.decision(a));
}

// 11. Opt-out: closed and suppressed; automated mail never mailed.
{
  const t = fresh({ sends: 1 });
  t.correspondent("o@uni.example");
  const a = t.inbound({ from: "o@uni.example", subject: "Re: hello", body: "Please remove me from your list.", h: 2 });
  await step(t.env, {});
  ok(t.decision(a).outcome === "closed" && t.audit.prepare("SELECT source FROM email_suppression WHERE email = 'o@uni.example'").get().source === "INBOUND-SLA-1" && t.sent.length === 0, "an opt-out is closed at once and the sender suppressed");
}

// 12. Metrics: two metric_registry rows, written idempotently, honest about waiting rows.
{
  const t = fresh({ sends: 1 });
  const sql = (s, ...a) => t.audit.prepare(s).run(...a);
  // five human rows: answered after 2h, decided by INBOUND-SLA-1 after 25h, legacy closed after 10h, waiting 80h, waiting 5h; one machine row
  const r1 = t.inbound({ from: "h1@u.example", h: 100 });
  sql("INSERT INTO emails (message_id, sender, recipient, subject, body_text, received_at, status) VALUES ('o1', 'rowan.quni@qnfo.org', 'h1@u.example', 'Re', 'x', ?, 'sent')", iso(98));
  const r2 = t.inbound({ from: "h2@u.example", h: 90 });
  sql("INSERT INTO cloud_ops_events (id, ts, kind, meta, status) VALUES (?, ?, 'inbound-sla-decision', '{}', 'held')", "inbound-sla-q-" + r2, iso(65));
  sql("UPDATE email_reply_queue SET decision = 'held' WHERE id = ?", r2);
  const r3 = t.inbound({ from: "h3@u.example", h: 50 });
  sql("UPDATE email_reply_queue SET decision = 'closed', skip_reason = 'closed by user', updated_at = ? WHERE id = ?", iso(40).slice(0, 19).replace("T", " "), r3);
  t.inbound({ from: "h4@u.example", h: 80 });
  t.inbound({ from: "h5@u.example", h: 5 });
  const m6 = t.inbound({ from: "noreply@m.example", h: 70 });
  sql("UPDATE email_reply_queue SET decision = 'skip', skip_reason = 'db-trigger: machine/marketing sender terminalized on first touch' WHERE id = ?", m6);
  t.inbound({ from: "old@u.example", h: 40 * 24 });   // outside the 30-day median window, still waiting
  const oldDone = t.inbound({ from: "done@u.example", h: 45 * 24 });
  sql("UPDATE email_reply_queue SET decision = 'closed', skip_reason = 'closed by user' WHERE id = ?", oldDone);
  const out = await metrics(t.env, {});
  ok(out.human_30d === 5 && out.waiting === 2, "five human rows in the 30-day window, two still waiting", out);
  ok(out.unactioned_72h === 2, "unactioned counts every waiting row older than 72h, the 40-day-old one included (80h + 40d)", out.unactioned_72h);
  ok(Math.abs(out.median_h - 10) < 0.2, "the median counts waiting rows at their age (2, 5, 10, 25, 80 -> 10)", out.median_h);
  const rows = t.audit.prepare("SELECT * FROM metric_registry ORDER BY metric").all();
  ok(rows.length === 2 && rows[0].metric === "inbound_first_response_h_median_30d" && rows[1].metric === "inbound_unactioned_72h" && rows[1].last_value === "2" && rows.every((x) => x.refresh_cadence === "*/3h" && x.source_of_truth && x.disposition_actor === "fleet"), "both metrics carry the METRIC-INTEGRITY-1 fields", rows);
  const first = rows[0].last_refreshed;
  await new Promise((r) => setTimeout(r, 5));
  await metrics(t.env, {});
  const again = t.audit.prepare("SELECT * FROM metric_registry ORDER BY metric").all();
  ok(again.length === 2 && again[0].last_refreshed > first, "a second refresh updates in place (idempotent)");
  const empty = fresh({});
  await metrics(empty.env, {});
  ok(/^n\/a/.test(empty.audit.prepare("SELECT last_value FROM metric_registry WHERE metric = 'inbound_first_response_h_median_30d'").get().last_value), "no inbound in 30 days reads n/a, not 0");
}

// 13. 'pending' rows no longer go through the ungated legacy drafter; the cron routes the step and the metrics.
{
  const t = fresh({ sends: 1, ai: "DRAFT: Thanks, happy to." });
  const p = t.inbound({ from: "grants@manifund.org", subject: "Your application", body: "A question about the budget?", h: 30, decision: "pending", skip: null });
  const legacy = await worker.runRepliesInternal(t.env, false);
  ok(legacy.scanned === 0 && t.sent.length === 0 && t.q(p).decision === "pending", "the legacy drafter no longer mails 'pending' rows (it mailed funders and outsiders ungated)");
  await worker.scheduled({ cron: "0 */3 * * *" }, t.env, {});
  ok(!t.decision(p) && t.audit.prepare("SELECT COUNT(*) n FROM metric_registry").get().n === 2, "the 3-hourly cron refreshes the metrics and does not run the step");
  await worker.scheduled({ cron: "*/15 * * * *" }, t.env, {});
  ok(t.decision(p) && t.decision(p).category === "funder" && t.decision(p).outcome === "held" && t.sent.length === 0, "the 15-minute cron runs the step: the pending funder row is held, nothing sent");
  const hb = t.audit.prepare("SELECT version, ok FROM fleet_heartbeat WHERE worker = 'qnfo-email-orchestrator'").get();
  const cap = t.audit.prepare("SELECT capabilities FROM capability_audit_snapshot WHERE service = 'qnfo-email-orchestrator'").get();
  ok(hb && hb.version === mod.__VERSION && hb.ok === 1 && /inbound-sla/.test(cap.capabilities), "the heartbeat and capability row carry the new version and the inbound-sla capability");
}

// 14. migrations/2026-10-02-inbound-sla.sql (METRIC-CLOSED-LOOP-1): it applies twice cleanly, registers the same metric
// text the worker writes, adds one enabled trigger per metric with a definition of done, and makes the kill switch visible.
{
  const mig = readFileSync(new URL("../migrations/2026-10-02-inbound-sla.sql", import.meta.url), "utf8");
  const a = fresh({}), b = fresh({});
  a.audit.exec("CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')))");
  a.audit.exec(mig);
  a.audit.exec(mig);
  await metrics(b.env, {});
  await metrics(a.env, {});
  const ra = a.audit.prepare("SELECT metric, layer, kind, formula, source_of_truth, target, owner, refresh_cadence, last_value FROM metric_registry ORDER BY metric").all();
  const rb = b.audit.prepare("SELECT metric, layer, kind, formula, source_of_truth, target, owner, refresh_cadence FROM metric_registry ORDER BY metric").all();
  ok(ra.length === 2 && ra.every((r, i) => ["metric", "layer", "kind", "formula", "source_of_truth", "target", "owner", "refresh_cadence"].every((k) => r[k] === rb[i][k])), "the migration registers exactly the metric text the worker writes", { ra, rb });
  ok(ra[1].last_value === "0", "the worker refreshes the value of the migration's row");
  const tr = a.audit.prepare("SELECT metric_key, operator, threshold, owner, enabled, action FROM analytics_metric_triggers ORDER BY metric_key").all();
  ok(tr.length === 2 && tr.every((t) => t.enabled === 1 && t.owner === "qnfo-email-orchestrator" && /Definition of done/.test(t.action)) && tr[0].metric_key === "inbound_first_response_h_median_30d" && tr[0].operator === "gt" && tr[0].threshold === 48 && tr[1].metric_key === "inbound_unactioned_72h" && tr[1].threshold === 0, "one enabled trigger per metric, with its lever and definition of done", tr.map((t) => [t.metric_key, t.operator, t.threshold]));
  const ks = a.audit.prepare("SELECT value FROM ops_config WHERE key = 'inbound_sla_enabled'").get();
  ok(ks && ks.value === "1", "the kill switch row is visible and on");
  const r = await step(a.env, {});
  ok(!r.disabled, "the visible kill switch row ('1') leaves the step on");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
