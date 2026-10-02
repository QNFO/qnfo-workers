// OUTREACH-LEARNER-1 + SENT-AS-YOU-DELIVERY-1 offline suite for qnfo-cloud-ops (1.18.0). Drives the real worker module
// (sockets stubbed) against in-memory SQLite D1 shims (qnfo-audit as AUDIT with the live METRIC-INTEGRITY-1 and
// METRIC-CADENCE-CANONICAL-1 triggers, qnfo-outreach as OUTREACH) with a recording SEND_EMAIL and a seeded RNG. Proves:
// segments and reply classification; per-send outcomes (same address, same thread from another address, SRS-wrapped,
// auto-reply ignored, opt-out suppresses, decline, bounce, no-reply after 21 days, a late reply upgrades) and the Beta
// posteriors they produce, each change logged once and a second run idempotent; Thompson allocation prefers the segment
// that answers while the 8/day shared cap, 3/day per domain and suppression still hold; the stop rule (>= 50 sends and
// < 1% positive) holds candidates and follow-ups, an ops_config override resumes and releases them; the kill switch gives
// the old oldest-first order and releases holds; an unreadable ops_config falls back without touching holds; the two
// metrics land in metric_registry idempotently and tolerate a centrally added row; the sent-as-you digest is mailed once a
// day to the owner's qnfo.org address only, and the email triage leaves that copy alone. Synthetic data only.
// Run: node qnfo-cloud-ops/outreach-learner.test.mjs   -> prints "N passed, 0 failed" (Node 22: node:sqlite)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const IMPORT = 'import { connect } from "cloudflare:sockets";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const patched = src.replace(IMPORT, "var connect = function () { throw new Error('sockets are stubbed in this test'); };") +
  "\nexport { jobOutreach as __jobOutreach, jobOutreachLearner as __tick, learnerTopic as __topic, learnerRtype as __rtype, learnerAddr as __addr," +
  " learnerClassify as __classify, learnerPlan as __plan, learnerBeta as __beta, LEARNER_RNG as __RNG, sentAsYouDigest as __digest," +
  " jobEmailTriage as __triage, OUTREACH_OPT_OUT as __OPT_OUT, CRON_COMPANIONS as __COMP, JOBS as __JOBS, LEARNER_METRICS as __METRICS, LEARNER_METRIC_ACTOR as __ACTOR };\n";
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// Seeded RNG (mulberry32) so every Thompson draw in this suite is reproducible.
function seeded(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
mod.__RNG.fn = seeded(42);

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
const NOW = Date.now();
const iso = (daysAgo) => new Date(NOW - daysAgo * 864e5).toISOString();
const sq = (daysAgo) => iso(daysAgo).slice(0, 19).replace("T", " ");
const TODAY = new Date(NOW).toISOString().slice(0, 10);

function fresh(opts) {
  opts = opts || {};
  const audit = new DatabaseSync(":memory:");
  audit.exec(`CREATE TABLE scheduler_state (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE outreach_queue (id TEXT PRIMARY KEY, paper_id TEXT, author TEXT, email TEXT, reason TEXT, status TEXT, created_at TEXT, sent_at TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE outreach_log (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, subject TEXT, message_id TEXT, sent_at TEXT, status TEXT);
    CREATE TABLE contact_ledger (email TEXT PRIMARY KEY, name TEXT, affiliation TEXT, first_contact TEXT, last_contact TEXT, contact_count INTEGER DEFAULT 0, status TEXT, suppress_reason TEXT, person_key TEXT, last_reply_at TEXT, suppress INTEGER DEFAULT 0, reply_count INTEGER DEFAULT 0);
    CREATE TABLE email_suppression (email TEXT PRIMARY KEY, reason TEXT, source TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
    CREATE TABLE emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT, body_text TEXT, body_html TEXT, headers_json TEXT, classification TEXT DEFAULT 'general', status TEXT DEFAULT 'received', processing_ms INTEGER, received_at TEXT DEFAULT (datetime('now')), processed_at TEXT, in_reply_to TEXT, references_hdr TEXT);
    CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
    CREATE TRIGGER metric_registry_source_required_ins BEFORE INSERT ON metric_registry FOR EACH ROW WHEN NEW.source_of_truth IS NULL OR trim(NEW.source_of_truth)='' OR NEW.disposition_actor IS NULL OR trim(NEW.disposition_actor)='' OR NEW.refresh_cadence IS NULL OR trim(NEW.refresh_cadence)='' BEGIN SELECT RAISE(ABORT,'METRIC-INTEGRITY-1'); END;
    CREATE TRIGGER metric_registry_cadence_canonical_ins BEFORE INSERT ON metric_registry FOR EACH ROW WHEN NEW.refresh_cadence IS NOT NULL AND trim(NEW.refresh_cadence) <> '' AND ( instr(trim(NEW.refresh_cadence),' ') > 0 OR NOT ( lower(trim(NEW.refresh_cadence)) IN ('hourly','daily','weekly','monthly') OR trim(NEW.refresh_cadence) GLOB '*/[0-9]*' OR trim(NEW.refresh_cadence) GLOB '[0-9]*m' OR trim(NEW.refresh_cadence) GLOB '[0-9]*h' ) ) BEGIN SELECT RAISE(ABORT,'METRIC-CADENCE-CANONICAL-1'); END;
    CREATE TABLE pipeline_flags (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT);
    CREATE TABLE social_threads (slug TEXT, title TEXT, posted_at TEXT, post_uri TEXT, status TEXT);
    CREATE TABLE dissemination_tracker (channel TEXT, paper_slug TEXT, post_url TEXT, posted_at TEXT, action TEXT);
    CREATE TABLE email_reply_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, sender TEXT, subject TEXT, sent_at TEXT);`);
  if (opts.opsConfig !== false) audit.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT)");
  const outreach = new DatabaseSync(":memory:");
  outreach.exec(`CREATE TABLE pipeline_state (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT, suppress INTEGER DEFAULT 0, suppress_reason TEXT, contact_count INTEGER NOT NULL DEFAULT 0, status TEXT DEFAULT 'new');
    CREATE TABLE sends (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id TEXT, contact_id INTEGER, kind TEXT, subject TEXT, body TEXT, status TEXT DEFAULT 'draft', message_id TEXT, sent_at TEXT, created_at TEXT);`);
  outreach.prepare("INSERT INTO pipeline_state (key, value, updated_at) VALUES ('external_sends_enabled', '1', datetime('now'))").run();
  const sent = [];
  const env = { AUDIT: shim(audit), OUTREACH: shim(outreach), SEND_EMAIL: { async send(m) { sent.push(m); return { messageId: "<t" + sent.length + "@qnfo.org>" }; } } };
  let n = 0, mid = 0;
  const t = {
    audit, outreach, env, sent,
    queue(email, reason, status, ageMin) {
      const id = "aq-" + (++n);
      audit.prepare("INSERT INTO outreach_queue (id, paper_id, author, email, reason, status, created_at) VALUES (?, ?, 'A. Author', ?, ?, ?, datetime('now', ?))")
        .run(id, "2609." + String(10000 + n) + "v1", email, "arxiv-radar widened: " + reason, status || "pending", "-" + (ageMin == null ? 1000 - n : ageMin) + " minutes");
      return id;
    },
    // A historical first contact by this engine: queue row 'sent' + outreach_log row with its Message-ID.
    past(email, reason, daysAgo) {
      const id = t.queue(email, reason, "sent");
      const m = "<m" + (++mid) + "@qnfo.org>";
      audit.prepare("UPDATE outreach_queue SET sent_at = ? WHERE id = ?").run(sq(daysAgo), id);
      audit.prepare("INSERT INTO outreach_log (email, subject, message_id, sent_at, status) VALUES (?, 'QNFO - the energy-efficiency benchmark for quantum computing', ?, ?, 'sent')").run(email, m, sq(daysAgo));
      audit.prepare("INSERT OR IGNORE INTO contact_ledger (email, status) VALUES (?, 'outreach')").run(email);
      return { id, mid: m };
    },
    mail(sender, subject, body, daysAgo, extra) {
      extra = extra || {};
      audit.prepare("INSERT INTO emails (message_id, sender, recipient, subject, body_text, headers_json, status, received_at, in_reply_to, references_hdr) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run("<in" + Math.random().toString(36).slice(2) + "@x>", sender, extra.to || "rowan.quni@qnfo.org", subject, body, JSON.stringify(extra.headers || {}), extra.status || "processed", iso(daysAgo), extra.irt || null, extra.irt || null);
    },
    cfg(key, value) { audit.prepare("INSERT INTO ops_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value); },
    uncfg(key) { audit.prepare("DELETE FROM ops_config WHERE key = ?").run(key); },
    sendRow: (qid) => audit.prepare("SELECT * FROM outreach_learner_sends WHERE queue_id = ?").get(qid),
    arm: (seg) => audit.prepare("SELECT * FROM outreach_learner_arms WHERE segment = ?").get(seg),
    qs: (email) => (audit.prepare("SELECT status FROM outreach_queue WHERE email = ?").get(email) || {}).status,
    events: (prefix) => audit.prepare("SELECT id, meta, status FROM cloud_ops_events WHERE id >= ? AND id < ? ORDER BY ts, id").all(prefix, prefix + "￿").map((r) => ({ id: r.id, status: r.status, meta: JSON.parse(r.meta || "{}") }))
  };
  return t;
}
// Ledger rows for one segment, written directly (a long history the stop rule reads).
function history(t, seg, n, positives, daysAgo) {
  const [topic, rtype] = seg.split(":");
  for (let i = 0; i < n; i++) {
    t.audit.prepare("INSERT INTO outreach_learner_sends (queue_id, email, segment, topic, rtype, template, sent_at, message_id, source, outcome) VALUES (?, ?, ?, ?, ?, 'jpcub-first-v1', ?, ?, 'test', ?)")
      .run("h-" + seg + "-" + i, "h" + i + "." + topic + "@" + (rtype === "personal" ? "gmail.com" : "hist" + i + ".edu"), seg, topic, rtype, iso(daysAgo || 40), "<h" + i + seg + "@qnfo.org>", i < positives ? "positive" : "no-reply");
  }
}
async function ensureTables(t) { await mod.__tick(t.env); }

const OPT_OUT = mod.__OPT_OUT;

// 1. Segments and normalisation
ok(mod.__topic("arxiv-radar widened: Dissipative Quantum Battery from Many-Body Scars") === "energy", "a quantum-battery paper is the energy topic");
ok(mod.__topic("arxiv-radar widened: Threshold Behavior of ZX and ZY Surface Codes Under Circuit-Level Bias") === "qec", "a surface-code paper is the qec topic");
ok(mod.__topic("arxiv-radar widened: Energetic Costs of Subspace Quantum Error Correction") === "energy", "QEC with an energy angle counts as energy (the lead pillar)");
ok(mod.__topic("arxiv-radar widened: Python in the front, party in the Backline") === "other" && mod.__topic("") === "other", "anything else is other");
ok(mod.__rtype("x@gmail.com") === "personal" && mod.__rtype("x@hotmail.co.uk") === "personal" && mod.__rtype("x@qq.com") === "personal", "webmail domains are personal");
ok(mod.__rtype("kaixu@iphy.ac.cn") === "institutional" && mod.__rtype("2120230195@mail.nankai.edu.cn") === "institutional" && mod.__rtype("backline@xanadu.ai") === "institutional", "university, institute and company domains are institutional");
ok(mod.__addr("Ann Lee <Ann.Lee@Uni-A.edu>") === "ann.lee@uni-a.edu" && mod.__addr("prvs=712997f3d=Manuel.Mekonnen@oeaw.ac.at") === "manuel.mekonnen@oeaw.ac.at", "display names and BATV wrappers are removed");
ok(mod.__addr("SRS0=YOB6=mg=mdpi.com=riley.liu@qnfo.org") === "riley.liu@mdpi.com" && mod.__addr("not an address") === "", "SRS0 forwarding is undone; junk is empty");

// 2. Reply classification
const cls = (subject, body, auto) => mod.__classify({ subject, body, auto });
ok(cls("Re: QNFO", "Dear Rowan,\nThank you for reaching out, happy to talk.\n") === "positive", "a human answer is positive");
ok(cls("Re: QNFO", "stop\n\n> " + OPT_OUT) === "optout" && cls("STOP", "") === "optout" && cls("Re: QNFO", "Please unsubscribe me from this list.") === "optout", "stop / unsubscribe is an opt-out");
ok(cls("Re: QNFO", "Sounds good, send the spec.\n> " + OPT_OUT + "\n> unsubscribe") === "positive", "a reply that only quotes our opt-out line is not an opt-out");
ok(cls("RE: QNFO", "Happy to help.\n________________________________\nFrom: rowan.quni@qnfo.org\nSent: Monday\nIf you would rather not hear from me again, unsubscribe") === "positive", "an Outlook quote block is cut before matching");
ok(cls("Re: QNFO: Higher anomalies", "Dear Rowan,\nThank you for your email.\nI am sorry, but I don't see any connection between the two topics.\nBest regards") === "negative", "a decline is negative");
ok(cls("Automatic reply: QNFO", "I am out of the office until Monday.") === "auto" && cls("Re: QNFO", "Thanks", true) === "auto", "auto-replies (subject or Auto-Submitted) are ignored");
ok(cls("Re: QNFO", "--_000_X\nContent-Type: text/plain\n\nQXBwcmVjaWF0ZSBSb3dhbi4=") === "positive", "an undecodable (base64) human reply reads as positive");

// 3. Beta sampling and the pure plan
{
  const rng = seeded(7);
  let s = 0;
  for (let i = 0; i < 4000; i++) s += mod.__beta(3, 7, rng);
  ok(Math.abs(s / 4000 - 0.3) < 0.02, "Beta(3,7) draws average 0.3 (" + (s / 4000).toFixed(3) + ")");
  const arms = { "energy:institutional": { alpha: 30, beta: 10, stopped: 0 }, "qec:institutional": { alpha: 1, beta: 60, stopped: 0 }, "other:personal": { alpha: 1, beta: 51, stopped: 1 } };
  const rows = [];
  for (let i = 0; i < 5; i++) rows.push({ id: "q" + i, email: "q" + i + "@u" + i + ".edu", reason: "arxiv-radar widened: Surface codes " + i });
  for (let i = 0; i < 5; i++) rows.push({ id: "e" + i, email: "e" + i + "@v" + i + ".edu", reason: "arxiv-radar widened: Quantum battery " + i });
  rows.push({ id: "p0", email: "p0@gmail.com", reason: "arxiv-radar widened: Python compilers" });
  rows.push({ id: "n0", email: null, paper_id: "2609.1", reason: "arxiv-radar widened: Quantum heat engine" });
  const plan = mod.__plan(rows, arms, seeded(3));
  ok(plan.ordered.slice(0, 6).every((r) => r.id[0] === "e" || r.id === "n0") && plan.ordered.length === 11, "the segment that answers is offered first; its oldest candidate first (" + plan.ordered.map((r) => r.id).join(",") + ")");
  ok(plan.ordered.filter((r) => r.id[0] === "e").map((r) => r.id).join(",") === "e0,e1,e2,e3,e4", "inside a segment the order stays oldest first");
  ok(plan.held.length === 1 && plan.held[0].row.id === "p0" && plan.held[0].segment === "other:personal", "a known candidate of a stopped segment is held, not offered");
  ok(plan.groups["energy:?"] === 1 && typeof plan.first_draw["energy:?"] === "number", "a candidate without an address yet draws from its topic's live arms");
}

// 4. Outcomes, posteriors and their log (daily tick)
{
  const t = fresh();
  const a = t.past("ann@uni-a.edu", "Quantum battery charging", 25);
  const b = t.past("bob@uni-b.edu", "Surface codes", 25);
  const c = t.past("cy@uni-c.edu", "LDPC decoders", 25);
  const d = t.past("dee@gmail.com", "Fault-tolerant compilation", 3);
  const e = t.past("eve@corp.example", "Python in the front", 25);
  const f = t.past("fay@gmail.com", "Landauer limit in qubits", 10);
  const g = t.past("gus@uni-g.edu", "Python in the front", 25);
  t.mail("Ann <ann@uni-a.edu>", "Earlier note", "Hello before we ever wrote", 30);                                   // before the send: not a reply
  t.mail("Ann <ann@uni-a.edu>", "Re: QNFO", "Thank you, happy to share our numbers.", 24, { irt: a.mid });
  t.mail("robert@lab.uni-b.edu", "Re: QNFO", "stop\n> " + OPT_OUT, 24, { irt: b.mid });                              // same thread, another address
  t.mail("dee@gmail.com", "Automatic reply: QNFO", "I am out of the office.", 2, { headers: { "auto-submitted": "auto-replied" } });
  t.mail("eve@corp.example", "Re: QNFO", "Not interested, thanks.", 24);
  t.mail("SRS0=ab=cd=gmail.com=fay@qnfo.org", "Re: QNFO", "Interesting, tell me more.", 9);
  t.mail("mailer-daemon@uni-g.edu", "Undeliverable: QNFO", "Delivery to gus@uni-g.edu failed permanently.", 24.9);
  const r = await mod.__tick(t.env);
  ok(r.status === "ok" && r.notes.backfilled === 7, "the tick backfills every sent queue row into the ledger (" + JSON.stringify(r.notes).slice(0, 200) + ")");
  ok(t.sendRow(a.id).outcome === "positive" && t.sendRow(a.id).segment === "energy:institutional", "a reply from the same address is positive, in the paper's segment");
  ok(t.sendRow(b.id).outcome === "optout" && t.audit.prepare("SELECT COUNT(*) n FROM email_suppression WHERE email IN ('bob@uni-b.edu','robert@lab.uni-b.edu') AND reason = 'reply-stop'").get().n === 2, "a stop in the same thread (other address) is an opt-out and suppresses both addresses");
  ok(t.audit.prepare("SELECT status FROM outreach_log WHERE email = 'bob@uni-b.edu'").get().status === "replied", "an answered send leaves the follow-up queue (outreach_log replied)");
  ok(t.sendRow(c.id).outcome === "no-reply" && t.sendRow(d.id).outcome === null, "21 days of silence is no-reply; an auto-reply 3 days in leaves the send open");
  ok(t.sendRow(e.id).outcome === "negative" && t.sendRow(f.id).outcome === "positive", "a decline is negative; an SRS-forwarded reply is matched");
  ok(t.sendRow(g.id).outcome === "bounce" && t.audit.prepare("SELECT reason FROM email_suppression WHERE email = 'gus@uni-g.edu'").get().reason === "bounce", "a bounce naming the address is recorded and suppressed");
  const ei = t.arm("energy:institutional"), qi = t.arm("qec:institutional"), qp = t.arm("qec:personal"), oi = t.arm("other:institutional"), ep = t.arm("energy:personal");
  ok(ei.alpha === 2 && ei.beta === 1 && ep.alpha === 2 && ep.beta === 1, "positives move alpha: Beta(2,1)");
  ok(qi.alpha === 1 && qi.beta === 3 && qi.sends === 2 && qi.optouts === 1, "opt-out and no-reply move beta: Beta(1,3)");
  ok(qp.alpha === 1 && qp.beta === 1 && qp.sends === 1 && qp.unresolved === 1, "an open send counts as a send but moves no posterior");
  ok(oi.alpha === 1 && oi.beta === 3 && oi.stopped === 0, "decline and bounce are failures; 2 sends never trip the stop rule");
  const post = t.events("ol-post-");
  ok(post.length === 4 && post.every((x) => x.meta.from && x.meta.to && x.meta.moved.length >= 1), "one posterior-update event per segment that moved, naming the sends (" + post.length + ")");
  const r2 = await mod.__tick(t.env);
  ok(r2.notes.resolved === 0 && t.events("ol-post-").length === 4 && t.arm("qec:institutional").beta === 3 && t.events("ol-tick-").length === 1, "a second tick with no new mail changes nothing and keeps one heartbeat per day");
  t.mail("cy@uni-c.edu", "Re: QNFO", "Sorry for the delay - yes, let's talk.", 0.1);
  await mod.__tick(t.env);
  ok(t.sendRow(c.id).outcome === "positive" && t.arm("qec:institutional").alpha === 2 && t.events("ol-post-").length === 5, "a late reply upgrades no-reply to positive and is logged");
  const hb = t.audit.prepare("SELECT MAX(ts) AS last FROM cloud_ops_events WHERE id >= 'ol-tick-' AND id < 'ol-tick.' AND status IN ('ok', 'degraded')").get();
  ok(hb && hb.last && Date.parse(hb.last) > NOW - 6e4, "the WATCHMAKER_OPS proof query reads today's heartbeat");
}

// 5. Allocation: Thompson prefers the segment that answers; caps, per-domain and suppression unchanged; kill switch
{
  const run = async (switchOff) => {
    const t = fresh();
    await ensureTables(t);
    history(t, "energy:institutional", 10, 6);
    history(t, "qec:institutional", 40, 0);
    await mod.__tick(t.env);
    if (switchOff) t.cfg("outreach_learner_enabled", "0");
    for (let i = 0; i < 6; i++) t.queue("q" + i + "@qd" + i + ".edu", "Surface codes " + i, "pending", 500 - i);
    for (let i = 0; i < 4; i++) t.queue("s" + i + "@same.edu", "Quantum battery " + i, "pending", 300 - i);
    t.queue("e9@ed9.edu", "Quantum heat transport", "pending", 200);
    t.queue("opted@ed8.edu", "Thermodynamic cost", "pending", 199);
    t.audit.prepare("INSERT INTO email_suppression (email, reason, source) VALUES ('opted@ed8.edu', 'reply-stop', 'reply-scan')").run();
    mod.__RNG.fn = seeded(11);
    const out = await mod.__jobOutreach(t.env);
    return { t, out, to: t.sent.map((m) => m.to) };
  };
  const on = await run(false);
  ok(on.to.length === 8 && on.out.status === "capped", "learner on: still exactly 8 mails (" + on.to.join(",") + ")");
  ok(on.to.filter((x) => x.endsWith("@same.edu")).length === 3 && on.to.includes("e9@ed9.edu") && !on.to.includes("opted@ed8.edu"), "learner on: 3/day per domain and suppression hold; the answering topic is mailed");
  ok(on.to.filter((x) => /^q/.test(x)).length === 4 && on.t.qs("opted@ed8.edu") === "skipped-suppressed", "learner on: the energy candidates fill the cap first, qec gets the rest");
  ok(on.t.sent.every((m) => String(m.text).includes(OPT_OUT)), "learner on: every mail still carries the opt-out line");
  const alloc = on.t.events("ol-alloc-");
  ok(alloc.length === 1 && alloc[0].meta.mode === "thompson" && alloc[0].meta.picks["energy:institutional"] === 4 && alloc[0].meta.picks["qec:institutional"] === 4, "the day's allocation is logged with picks per segment (" + JSON.stringify(alloc[0] && alloc[0].meta.picks) + ")");
  ok(on.t.audit.prepare("SELECT COUNT(*) n FROM outreach_learner_sends WHERE source = 'live'").get().n === 8, "every live send enters the ledger with its segment");
  const off = await run(true);
  ok(off.to.length === 8 && off.to.slice(0, 6).every((x) => /^q/.test(x)) && off.to.filter((x) => x.endsWith("@same.edu")).length === 2, "kill switch 0: the previous oldest-first order (" + off.to.join(",") + ")");
  const alloc2 = off.t.events("ol-alloc-");
  ok(alloc2.length === 1 && alloc2[0].meta.mode === "oldest-first" && /outreach_learner_enabled = 0/.test(alloc2[0].meta.why), "kill switch: the run is logged as oldest-first with the reason");
}

// 6. Stop rule: hold, follow-ups, override, kill switch, unreadable ops_config
{
  const t = fresh();
  await ensureTables(t);
  history(t, "other:personal", 49, 0);
  let r = await mod.__tick(t.env);
  ok(t.arm("other:personal").stopped === 0 && t.arm("other:personal").sends === 49, "49 sends with no positive: not yet stopped");
  history(t, "qec:personal", 50, 1);
  history(t, "energy:personal", 150, 1, 45);
  t.audit.prepare("INSERT INTO outreach_learner_sends (queue_id, email, segment, topic, rtype, template, sent_at, source, outcome) VALUES ('h-last', 'last@gmail.com', 'other:personal', 'other', 'personal', 'jpcub-first-v1', ?, 'test', 'no-reply')").run(iso(30));
  r = await mod.__tick(t.env);
  ok(t.arm("other:personal").stopped === 1 && t.arm("other:personal").rule_stop === 1 && t.events("ol-stop-other:personal-").length === 1, "50 sends with no positive reply: stopped and logged");
  ok(t.arm("qec:personal").stopped === 0, "50 sends with 1 positive (2%) keeps running");
  ok(t.arm("energy:personal").stopped === 1, "150 sends with 1 positive (0.7%) is under 1%: stopped");
  ok(r.notes.stopped.join(",") === "energy:personal,other:personal", "the tick reports the stopped segments");
  // Candidates and a follow-up in the stopped segment
  t.queue("held1@gmail.com", "Python compilers", "pending", 400);
  t.queue("live1@uni-l.edu", "Python compilers", "pending", 300);
  t.audit.prepare("INSERT INTO outreach_log (email, subject, message_id, sent_at, status) VALUES ('h3.other@gmail.com', 'QNFO', '<fh@qnfo.org>', ?, 'sent')").run(sq(20));
  t.audit.prepare("INSERT INTO outreach_log (email, subject, message_id, sent_at, status) VALUES ('fl@uni-f.edu', 'QNFO', '<fl@qnfo.org>', ?, 'sent')").run(sq(19));
  mod.__RNG.fn = seeded(5);
  let out = await mod.__jobOutreach(t.env);
  const to = t.sent.map((m) => m.to);
  ok(!to.includes("held1@gmail.com") && t.qs("held1@gmail.com") === "held-segment-stopped" && to.includes("live1@uni-l.edu"), "a candidate of a stopped segment is held, others are mailed (" + to.join(",") + ")");
  ok(/\[seg=other:personal\]/.test(t.audit.prepare("SELECT error FROM outreach_queue WHERE email = 'held1@gmail.com'").get().error), "the hold names its segment and how to resume");
  ok(!to.includes("h3.other@gmail.com") && to.includes("fl@uni-f.edu") && out.notes.learner_followups_held === 1, "a follow-up to a stopped segment is held; a live one is sent");
  ok(t.audit.prepare("SELECT status FROM outreach_log WHERE email = 'h3.other@gmail.com'").get().status === "sent", "a held follow-up keeps its outreach_log row as contacted (no status change)");
  // Override resumes and releases
  t.cfg("outreach_learner_resume:other:personal", "1");
  r = await mod.__tick(t.env);
  ok(t.arm("other:personal").stopped === 0 && t.arm("other:personal").override === 1 && t.events("ol-resume-other:personal-").length === 1, "an ops_config override resumes the segment (logged)");
  ok(t.qs("held1@gmail.com") === "pending" && r.notes.released === 1, "its held candidates are released to pending");
  t.uncfg("outreach_learner_resume:other:personal");
  await mod.__tick(t.env);
  ok(t.arm("other:personal").stopped === 1 && t.events("ol-stop-other:personal-").length === 2, "removing the override stops it again");
  await mod.__jobOutreach(t.env);
  ok(t.qs("held1@gmail.com") === "held-segment-stopped", "and the candidate is held again");
  // Unreadable ops_config: oldest-first, holds untouched, stop state kept
  t.audit.exec("ALTER TABLE ops_config RENAME TO ops_config_x");
  r = await mod.__tick(t.env);
  ok(r.status === "degraded" && /ops_config unreadable/.test(r.notes.config_error) && t.arm("other:personal").stopped === 1 && t.qs("held1@gmail.com") === "held-segment-stopped", "an unreadable ops_config degrades the tick and changes no stop or hold");
  t.queue("late@uni-q.edu", "Surface codes", "pending", 10);
  out = await mod.__jobOutreach(t.env);
  ok(out.notes.learner.mode === "oldest-first" && /ops_config unreadable/.test(out.notes.learner.why), "jobOutreach falls back to oldest-first when ops_config is unreadable");
  t.audit.exec("ALTER TABLE ops_config_x RENAME TO ops_config");
  // Kill switch off: holds released, old order
  t.cfg("outreach_learner_enabled", "off");
  r = await mod.__tick(t.env);
  ok(r.notes.enabled === false && t.qs("held1@gmail.com") === "pending", "kill switch off releases held candidates");
}

// 7. Metrics: outreach_reply_rate_30d and warm_conversations_30d
{
  const t = fresh();
  // Another change may register the row centrally first: it must be tolerated, not overwritten.
  t.audit.prepare("INSERT INTO metric_registry (metric, layer, kind, formula, source_of_truth, owner, disposition_actor, refresh_cadence, state) VALUES ('warm_conversations_30d', 'fleet', 'leading', 'central formula', 'central source', 'qnfo-fleet-control', 'central actor', 'daily', 'RATIFIED')").run();
  await ensureTables(t);
  const a = t.past("ra@uni-r.edu", "Surface codes", 20);
  t.past("rb@uni-r2.edu", "Surface codes", 20);
  t.past("rc@uni-r3.edu", "Surface codes", 12);
  t.past("rd@uni-r4.edu", "Surface codes", 5);
  t.past("old@uni-o.edu", "Surface codes", 45);                                        // outside the 30-day window
  t.outreach.prepare("INSERT INTO contacts (email, contact_count, status) VALUES ('arne@green.example', 1, 'contacted')").run();
  t.outreach.prepare("INSERT INTO sends (contact_id, kind, status, message_id, sent_at) VALUES (1, 'rfc', 'sent', '<s1@qnfo.org>', ?)").run(sq(14));
  t.outreach.prepare("INSERT INTO sends (contact_id, kind, status, sent_at) VALUES (NULL, 'selfcheck', 'sent', ?)").run(sq(1));
  t.mail("ra@uni-r.edu", "Re: QNFO", "Thanks - glad to talk.", 19, { irt: a.mid });
  t.mail("Arne <arne@green.example>", "Re: Energy per compute", "Hey Rowan, sure, send the benchmark.", 13, { irt: "<s1@qnfo.org>" });
  t.mail("rb@uni-r2.edu", "Automatic reply", "Out of office", 19, { headers: { "auto-submitted": "auto-replied" } });
  t.audit.prepare("INSERT INTO contact_ledger (email, status) VALUES ('manual@uni-m.edu', 'sent-ledger')").run();
  t.mail("manual@uni-m.edu", "Re: your note", "Thanks for the note, glad it helped.", 8);
  // Inbound contacts: one real first message; everything else must not count
  t.mail("New Person <new.person@uni-z.edu>", "Question about your JPCUB benchmark", "Hi, could I run JPCUB on our cluster?", 6);
  t.mail("new.person@uni-z.edu", "Question about your JPCUB benchmark (2)", "Following my mail", 5);
  t.mail("pred@journal.example", "Invitation to Submit Your Research Article", "Dear Dr.", 4);
  t.mail("spammer@x.example", "Hello", "Buy now", 4, { status: "spam" });
  t.mail("list@news.example", "Weekly", "Hello", 4, { headers: { "list-unsubscribe": "<mailto:u@news.example>" } });
  t.mail("grants@funder.example", "Thank you for your submission!", "Received", 4);
  t.mail("info@conf.example", "Hello Rowan", "We would like to invite you", 4);
  // qnfo.org/work-with-me (WORK-WITH-ME-1): a tagged mail is an inbound contact whatever its wording; a bounce of one is not.
  t.mail("Dana <dana@lab-d.example>", "[work-with-me:talk] Invitation to speak at our conference", "Would you give a talk?", 3);
  t.mail("mailer-daemon@lab-e.example", "Undeliverable: Re: [work-with-me:jpcub] Measuring our cluster", "failed", 3);
  t.mail("other@uni-y.edu", "Hello", "A message to the general box", 4, { to: "qnfo@qnfo.org" });
  t.mail("stranger@uni-w.edu", "Re: something", "A reply to a thread we cannot see", 4);
  t.mail("veteran@uni-v.edu", "Long-time correspondent", "Old mail", 60);
  t.mail("veteran@uni-v.edu", "Another note", "A second note", 3);
  t.mail("SRS0=JnTJ=th=cf-bounce.qnfo.org=bounces@qnfo.org", "QNFO sent as you - " + TODAY + " (1 item)", "digest", 1);
  let r = await mod.__tick(t.env);
  let m = r.notes.metrics;
  ok(m && m.sends_30d === 5 && m.positive_to_sends_30d === 2 && m.outreach_reply_rate_30d === "n/a", "reply rate under 20 first contacts in 30 days is n/a, never 0 (" + JSON.stringify(m) + ")");
  ok(t.audit.prepare("SELECT last_value FROM metric_registry WHERE metric = 'outreach_reply_rate_30d'").get().last_value === "n/a", "the registry carries n/a (unreadable for METRIC-CLOSED-LOOP-1, so a paused stream fires nothing)");
  for (let i = 0; i < 16; i++) t.past("quiet" + i + "@uni-q" + i + ".edu", "Surface codes", 6);
  r = await mod.__tick(t.env);
  m = r.notes.metrics;
  ok(m && m.sends_30d === 21 && m.positive_to_sends_30d === 2 && m.outreach_reply_rate_30d === 9.5, "reply rate: 2 positive of 21 first contacts in 30 days across both engines = 9.5% (" + JSON.stringify(m) + ")");
  ok(m.positive_replies_30d === 3 && m.inbound_contacts_30d === 2 && m.warm_conversations_30d === 5, "warm conversations: 3 positive replies + 2 inbound contacts (one untagged first message, one [work-with-me] mail) = 5");
  const rr = t.audit.prepare("SELECT * FROM metric_registry WHERE metric = 'outreach_reply_rate_30d'").get();
  ok(rr && rr.last_value === "9.5" && rr.refresh_cadence === "daily" && rr.source_of_truth && rr.disposition_actor && rr.owner === "qnfo-cloud-ops" && rr.warning_band === "< 2" && /4\.1/.test(rr.baseline), "outreach_reply_rate_30d is created with the METRIC-INTEGRITY-1 fields, bands, baseline and its value");
  const wr = t.audit.prepare("SELECT * FROM metric_registry WHERE metric = 'warm_conversations_30d'").get();
  ok(wr.last_value === "5" && wr.formula === "central formula" && wr.state === "RATIFIED" && wr.owner === "qnfo-fleet-control", "a centrally added row is tolerated: only its value and refresh time change");
  await mod.__tick(t.env);
  ok(t.audit.prepare("SELECT COUNT(*) n FROM metric_registry").get().n === 2 && t.audit.prepare("SELECT last_value FROM metric_registry WHERE metric = 'outreach_reply_rate_30d'").get().last_value === "9.5", "a second tick is idempotent");
  // The migration that registers the metrics centrally and adds their METRIC-CLOSED-LOOP-1 triggers: same rows, idempotent.
  const mig = readFileSync(new URL("../migrations/2026-10-02-outreach-learner-metrics.sql", import.meta.url), "utf8");
  t.audit.exec("CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')))");
  const lit = (x) => "'" + String(x).replace(/'/g, "''") + "'";
  ok(mod.__METRICS.every((x) => mig.includes("(" + [x[0], "fleet", x[1], x[2], x[3], x[4], x[5], "qnfo-cloud-ops", mod.__ACTOR, "daily", x[6], x[7], "MEASURED"].map(lit).join(", ") + ")")), "the migration's registry rows are byte-identical to LEARNER_METRICS in worker.js");
  t.audit.exec(mig);
  t.audit.exec(mig);
  const trig = t.audit.prepare("SELECT metric_key, operator, threshold, owner, queue_target, enabled, action FROM analytics_metric_triggers ORDER BY metric_key").all();
  ok(trig.length === 2 && trig.every((x) => x.enabled === 1 && x.queue_target === "agent_issues" && x.owner === "qnfo-cloud-ops" && /Definition of done/.test(x.action) && /raise (the 8\/day|a cap)/i.test(x.action)), "the migration adds one enabled trigger per metric with owner, lever and definition of done (twice applied, still 2)");
  ok(trig[0].metric_key === "outreach_reply_rate_30d" && trig[0].operator === "lt" && trig[0].threshold === 2 && trig[1].metric_key === "warm_conversations_30d" && trig[1].operator === "lt" && trig[1].threshold === 2, "thresholds: reply rate under 2%, fewer than 2 warm conversations in 30 days");
  ok(t.audit.prepare("SELECT formula FROM metric_registry WHERE metric = 'warm_conversations_30d'").get().formula === "central formula", "the migration's INSERT OR IGNORE leaves an existing registry row alone");
  const fresh2 = fresh();
  fresh2.audit.exec("CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')))");
  fresh2.audit.exec(mig);
  await mod.__tick(fresh2.env);
  const a1 = fresh2.audit.prepare("SELECT metric, formula, refresh_cadence, warning_band, kill_band, baseline, target FROM metric_registry ORDER BY metric").all();
  ok(a1.length === 2 && a1[0].refresh_cadence === "daily" && a1[0].warning_band === "< 2" && a1[1].kill_band === "< 1", "the migration's registry rows pass METRIC-INTEGRITY-1 and the worker then only updates their values");
}

// 8. Sent-as-you digest delivery and the triage exemption
{
  const t = fresh();
  await mod.__tick(t.env);
  t.audit.prepare("INSERT INTO outreach_log (email, subject, message_id, sent_at, status) VALUES ('x@uni-x.edu', 'QNFO - benchmark', '<x@qnfo.org>', datetime('now', '-1 hours'), 'sent')").run();
  const d1 = await mod.__digest(t.env);
  ok(d1.delivered === "ok" && t.sent.length === 1 && t.sent[0].to === "rowan.quni@qnfo.org" && t.sent[0].from.email === "alerts@qnfo.org", "the digest is mailed to the owner's qnfo.org address from alerts@qnfo.org (" + d1.delivered + ")");
  ok(/^[\x20-\x7e]+$/.test(t.sent[0].subject) && /^QNFO sent as you - \d{4}-\d{2}-\d{2} \(1 item\)$/.test(t.sent[0].subject), "the subject is ASCII (no mojibake-prone dash): " + t.sent[0].subject);
  ok(/Outreach learner \(on, ok\): reply rate 30d/.test(t.sent[0].text) && /x@uni-x\.edu/.test(t.sent[0].text), "the digest lists the send and today's learner tick");
  const SCAN_STOP = /\b(unsubscribe|opt[\s-]?out|remove me|stop emailing|do not contact|don'?t contact|take me off|no further (emails?|contact)|leave me alone)\b/i;   // qnfo-outreach scanReplies
  ok(!SCAN_STOP.test(t.sent[0].subject + " " + t.sent[0].text), "the copy that lands in qnfo.org mail cannot trip qnfo-outreach's opt-out scan");
  const d2 = await mod.__digest(t.env);
  ok(t.sent.length === 1 && /already delivered/.test(d2.delivered), "one message a day: a second run the same day does not mail again");
  const t2 = fresh();
  delete t2.env.SEND_EMAIL;
  const d3 = await mod.__digest(t2.env);
  ok(/^error: SEND_EMAIL binding missing/.test(d3.delivered) && d3.stored, "without the binding the digest is still stored and the reason is named");
  // Triage leaves the delivered copy alone, still marks other bounce mail as noise
  t.mail("SRS0=JnTJ=th=cf-bounce.qnfo.org=bounces@qnfo.org", "QNFO sent as you - " + TODAY + " (1 item)", "digest", 0.01);
  t.mail("bounces@other.example", "Delivery report", "x", 0.01);
  await mod.__triage(t.env);
  const st = Object.fromEntries(t.audit.prepare("SELECT sender, status FROM emails").all().map((x) => [x.sender, x.status]));
  ok(st["SRS0=JnTJ=th=cf-bounce.qnfo.org=bounces@qnfo.org"] === "processed" && st["bounces@other.example"] === "spam", "email triage leaves the owner's digest copy unmarked, other bounce mail is still spam");
}

// 9. Wiring: a companion in the daily engagement slot, no new cron
ok(mod.__COMP.engagement && mod.__COMP.engagement.includes("outreach-learner") && typeof mod.__JOBS["outreach-learner"] === "function", "outreach-learner runs as a companion of the daily engagement job");
ok(!/"outreach-learner":\s*\{\s*times/.test(src), "no AMS_SCHEDULE entry (no new cron) for the learner");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
