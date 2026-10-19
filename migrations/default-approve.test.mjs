// DEFAULT-APPROVE-1 offline suite: replays the live text of human_actions_default_adopt_ai (2026-10-12-34), human_actions_autonomy_first_ai
// (2026-10-19-owner-queue-triggers-versioned) and v_human_action_gate (2026-10-19-owner-notice-gate) on SQLite, then runs
// migrations/2026-10-19-default-approve.sql. Proves: the shape of human_actions 115 (an IDENTITY-BOUND decision card whose stated default is
// "The deny stays") is queued for the fleet with the approve default in effect and is not closed on the deny; a decision card the autonomy
// gate grades fleet is queued once, not twice; a hard card (money, signing, one-time codes, the owner's account) and a card that offers no
// options keep DEFAULT-ADOPTED-1 or the old reroute; a closure notice is untouched; ops_config default_approve_gate = off restores the old
// behaviour for every shape; card 115 records the owner's approval; the fm detector reads 0 and fails on a decision card closed on a default;
// re-applying the file is harmless and keeps the first backup; the Rollback line restores the old behaviour.
// Run: node migrations/default-approve.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const sql = readFileSync(here("2026-10-19-default-approve.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };

// "CREATE <kind> <name> ..." up to its terminator: the closing semicolon outside quotes (view) or the line "END;" (trigger)
function ddl(file, kind, name) {
  const t = readFileSync(here(file), "utf8");
  const at = t.search(new RegExp("^CREATE " + kind + "(?: IF NOT EXISTS)? " + name + "\\b", "m"));
  if (at < 0) throw new Error(name + " not found in " + file);
  if (kind === "TRIGGER") { const end = t.indexOf("\nEND;", at); return t.slice(at, end + 5).replace(/CREATE TRIGGER IF NOT EXISTS/, "CREATE TRIGGER"); }
  let q = false, i = at;
  for (; i < t.length; i++) { const c = t[i]; if (c === "'") q = !q; else if (c === ";" && !q) break; }
  return t.slice(at, i + 1);
}

function build() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT DEFAULT 'normal', due TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, resolution TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE autonomy_reroute_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, human_action_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT, priority TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), drained_at TEXT, issue_id INTEGER);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '', verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL DEFAULT '', expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
INSERT INTO ops_config (key, value) VALUES ('autonomy_first_gate', 'on'), ('default_adopt_gate', 'on');
INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, evidence) VALUES ('control-plane-deny', 'qnfo-fleet-control CM_DENY', 'filter', 'x', 1, 'replace', 'applied', 'applied 2026-10-12 (CONTROL-PLANE-FUNCTIONAL-CANARY-1)');`);
  db.exec(ddl("2026-10-19-owner-notice-gate.sql", "VIEW", "v_human_action_gate"));
  db.exec(ddl("2026-10-12-34-default-adopt-prediction.sql", "TRIGGER", "human_actions_default_adopt_ai"));
  db.exec(ddl("2026-10-19-owner-queue-triggers-versioned.sql", "TRIGGER", "human_actions_autonomy_first_ai"));
  return db;
}

const COLS = "slug, title, why, default_in_effect, action, sev, status, source";
function add(db, c) {
  db.prepare("INSERT INTO human_actions (" + COLS + ") VALUES (?, ?, ?, ?, ?, ?, 'open', ?)").run(c.slug, c.title, c.why || "", c.def === undefined ? "" : c.def, c.action || "", c.sev || "normal", c.source || "session:test");
  return db.prepare("SELECT * FROM human_actions WHERE slug = ?").get(c.slug);
}
const queue = (db, id) => db.prepare("SELECT * FROM autonomy_reroute_queue WHERE human_action_id = ?").all(id);
const log = (db) => db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n;

// the cards: the shape of human_actions 115 and the shapes around it
const C115 = { slug: "code-loop-may-change-fleet-control", title: "Let the code loop change qnfo-fleet-control, the worker that judges its pull requests?", sev: "normal", source: "claude-session",
  why: "The code loop may merge its own changes to qnfo-ai and qnfo-gateway. IDENTITY-BOUND: this lifts a deny the owner set for the system's own verifier.",
  def: "The deny stays. Changes to the five workers keep going through session pull requests, as today.",
  action: "Approve: add qnfo-fleet-control to CM_LOOP_CANARIED, one pull request. Decline: nothing changes." };
// the same card without the IDENTITY-BOUND: line: a decision the fleet takes
const C115_PLAIN = Object.assign({}, C115, { slug: "code-loop-may-change-fleet-control-plain", why: C115.why.replace("IDENTITY-BOUND: ", "") });
const FLEET_DECISION = { slug: "pick-one-fleet", title: "Decide the cadence of the review loop", why: "measured 2026-10-19", def: "Keep the current cadence.", action: "Pick one: (a) every 10 minutes in worker.js, (b) leave it.", sev: "high" };
const HARD_MONEY = { slug: "pay-model", title: "Payment decision: authorise a stronger code-loop model, or accept the growing queue", why: "spend", def: "No payment is made.", action: "Choose one: (a) authorise the payment, (b) accept the queue." };
const HARD_CODES = { slug: "mail-codes", title: "Decide the scope of the qnfo-ai mail search", why: "IDENTITY-BOUND: one-time codes stay out of every automated path", def: "Nothing is built.", action: "Choose one: (a) build it, (b) drop the request." };
const OWNER_STEP = { slug: "substack-connect", title: "Connect a Substack account in Buffer", why: "IDENTITY-BOUND: signing in to the owner's own account", def: "No Substack posts; the other channels carry the volume.", action: "buffer.com > Channels > Connect a channel > Substack. Closes when posts read 1." };
const FLEET_PLAIN = { slug: "tune-threshold", title: "Raise the threshold in worker.js", why: "fleet work", def: "", action: "set it" };
const NOTICE = { slug: "issue-77", title: "OWNER-TASK: decide the scope?", why: "the owner asked", def: "Closed on request.", action: "Approve: ok. Decline: no.", source: "owner-request-issue" };

function scenario(db) {
  const r = {};
  r.c115 = add(db, C115); r.c115p = add(db, C115_PLAIN); r.fleet = add(db, FLEET_DECISION); r.money = add(db, HARD_MONEY); r.codes = add(db, HARD_CODES);
  r.step = add(db, OWNER_STEP); r.plain = add(db, FLEET_PLAIN); r.notice = add(db, NOTICE);
  return r;
}
const st = (db, id) => db.prepare("SELECT status, resolution, default_in_effect FROM human_actions WHERE id = ?").get(id);

// ---- base: what the live triggers do to those cards today (the defect)
{
  const db = build(); const r = scenario(db);
  const s115 = st(db, r.c115.id);
  ok(s115.status === "resolved" && /^DEFAULT-ADOPTED-1/.test(s115.resolution) && queue(db, r.c115.id).length === 0, "base: the card-115 shape is closed at birth on its deny default and never queued (the defect)", s115);
}

// ---- with the file
const db = build(); db.exec(sql);
const r = scenario(db);

// the view grades the shapes
const g = (id) => db.prepare("SELECT decision, hard, ib, gate, approve, held FROM v_human_action_decision WHERE id = ?").get(id);
ok(g(r.c115.id).decision === 1 && g(r.c115.id).hard === 0 && g(r.c115.id).ib === 1 && g(r.c115.id).approve === 0 && g(r.c115.id).held === 1, "the card-115 shape (IDENTITY-BOUND: line) is a decision, not hard, held for the owner and not approved", g(r.c115.id));
ok(g(r.c115p.id).decision === 1 && g(r.c115p.id).hard === 0 && g(r.c115p.id).ib === 0 && g(r.c115p.id).gate === "fleet" && g(r.c115p.id).approve === 1 && g(r.c115p.id).held === 0, "the same card without the IDENTITY-BOUND: line is approved", g(r.c115p.id));
ok(g(r.fleet.id).approve === 1, "a fleet decision with a Pick one list is approved", g(r.fleet.id));
ok(g(r.money.id).decision === 1 && g(r.money.id).hard === 1 && g(r.money.id).approve === 0, "a payment decision is hard and not approved", g(r.money.id));
ok(g(r.codes.id).hard === 1 && g(r.codes.id).approve === 0, "a one-time-codes decision is hard and not approved", g(r.codes.id));
ok(g(r.step.id).decision === 0 && g(r.step.id).approve === 0, "an owner step with no options is not a decision", g(r.step.id));
ok(g(r.notice.id).decision === 1 && g(r.notice.id).approve === 0, "a closure notice is never approved even when its words are a decision", g(r.notice.id));

// the card-115 shape: held. It is not closed on the deny and not handed to the fleet: it stays open for the owner, who labelled it.
const h115 = st(db, r.c115.id);
ok(h115.status === "open" && h115.resolution === null && queue(db, r.c115.id).length === 0 && h115.default_in_effect.includes("The deny stays"), "the card-115 shape stays open: its deny default is not adopted and the fleet is not told to execute an IDENTITY-BOUND card", h115);
ok(db.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE actor LIKE 'trigger:%' AND evidence LIKE '%The deny stays%'").get().n === 1, "only the approved twin wrote a decision_log row for that default (the held card wrote none)");
// the same card without the label: approved
const s115 = st(db, r.c115p.id), q115 = queue(db, r.c115p.id);
ok(s115.status === "rerouted" && /^DEFAULT-APPROVE-1/.test(s115.resolution) && /^APPROVE \(DEFAULT-APPROVE-1/.test(s115.default_in_effect), "the card-115 text without the label is rerouted with the approve default in effect and not closed on the deny", s115);
ok(s115.default_in_effect.includes("The deny stays"), "the stated default is kept in the card text as superseded context", s115.default_in_effect);
ok(q115.length === 1 && /^DEFAULT-APPROVE-1: /.test(q115[0].title) && /Execute the recommended option/.test(q115[0].description) && /IC-GATE-001/.test(q115[0].description) && q115[0].priority === "medium" && q115[0].category === "governance", "one queue row tells the fleet to execute the recommended option and names the limits that still win", q115);
// a fleet-gate decision: queued once, by the approve trigger
const qf = queue(db, r.fleet.id);
ok(st(db, r.fleet.id).status === "rerouted" && qf.length === 1 && /^DEFAULT-APPROVE-1: /.test(qf[0].title) && qf[0].priority === "high", "a fleet-gate decision card is queued once (not by both triggers), high priority from its sev", qf);
// hard cards and owner steps keep the old path
for (const [k, why] of [["money", "a payment decision"], ["codes", "a one-time-codes decision"], ["step", "an owner step"]]) {
  const s = st(db, r[k].id);
  ok(s.status === "resolved" && /^DEFAULT-ADOPTED-1/.test(s.resolution) && queue(db, r[k].id).length === 0, why + " keeps DEFAULT-ADOPTED-1 and is not queued", s);
}
// a plain fleet card still reroutes by AUTONOMY-FIRST-1
const sp = st(db, r.plain.id), qp = queue(db, r.plain.id);
ok(sp.status === "rerouted" && /^AUTONOMY-FIRST-1/.test(sp.resolution) && qp.length === 1 && /^AUTONOMY-FIRST-REROUTE-1: /.test(qp[0].title), "a plain fleet card is still rerouted by AUTONOMY-FIRST-1 with its own title", [sp, qp]);
// a closure notice with a default is adopted as before? it has a default and approve=0, so DEFAULT-ADOPTED-1 applies; never queued
const sn = st(db, r.notice.id);
ok(queue(db, r.notice.id).length === 0 && sn.status === "resolved" && /^DEFAULT-ADOPTED-1/.test(sn.resolution), "a closure notice is untouched by the approve path (old DEFAULT-ADOPTED-1 behaviour)", sn);
// decision log: one row per approved card, none for approvals of hard cards
const approvals = db.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE actor = 'trigger:human_actions_default_approve_ai'").get().n;
ok(approvals === 2, "one decision_log row per approved card (115 shape and the fleet decision)", approvals);

// ---- the gate off restores the old behaviour for every shape
{
  const off = build(); off.exec(sql);
  off.prepare("UPDATE ops_config SET value = 'off' WHERE key = 'default_approve_gate'").run();
  const x = scenario(off);
  const a = st(off, x.c115.id), f = st(off, x.fleet.id);
  ok(st(off, x.c115p.id).status === "resolved" && /^DEFAULT-ADOPTED-1/.test(st(off, x.c115p.id).resolution), "default_approve_gate = off: the approvable card-115 text is closed on its default again", st(off, x.c115p.id));
  ok(a.status === "resolved" && /^DEFAULT-ADOPTED-1/.test(a.resolution) && queue(off, x.c115.id).length === 0, "default_approve_gate = off: the card-115 shape is closed on its default again", a);
  ok(f.status === "resolved" && /^DEFAULT-ADOPTED-1/.test(f.resolution), "default_approve_gate = off: a fleet decision with a default is adopted as before", f);
  ok(off.prepare("SELECT approve FROM v_human_action_decision WHERE id = ?").get(x.c115.id).approve === 0, "default_approve_gate = off: the view grades nothing approved");
  // the fm detector fails on exactly that closure once the gate is on again
  const det = off.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-card-default-denies-decision'").get().verify_probe;
  ok(off.prepare(det).get().observed === "0", "the fm detector reads 0 while the gate is off (a closure on a default is then intended)");
  off.prepare("UPDATE ops_config SET value = 'on' WHERE key = 'default_approve_gate'").run();
  ok(off.prepare(det).get().observed === "3", "the fm detector reads 3 for the three decision cards (approvable, held, fleet) closed on a default while the gate was off, once it is on", off.prepare(det).get());
}

// ---- the same card under the gate: the detector reads 0
{
  const det = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-card-default-denies-decision'").get();
  const res = det && db.prepare(det.verify_probe).get();
  ok(res && res.expected === "0" && res.observed === "0", "the fm detector reads 0 with the file applied and the gate on (hard cards and owner steps are excluded)", res);
}

// ---- card 115 as it is in production: resolved at birth by DEFAULT-ADOPTED-1 before this file ran
{
  const pre = build();
  const old = add(pre, C115); // closed on the deny by the live trigger
  ok(/^DEFAULT-ADOPTED-1/.test(st(pre, old.id).resolution), "fixture: production card 115 is closed by DEFAULT-ADOPTED-1");
  // the card keeps its production id and slug
  pre.exec("UPDATE human_actions SET id = 115 WHERE id = " + old.id);
  pre.exec(sql);
  const s = st(pre, 115);
  ok(/^OWNER DECISION 2026-10-19/.test(s.resolution) && /qnfo-ops, qnfo-deploy-guard and qnfo-code-orchestrator/.test(s.default_in_effect) && s.status === "resolved", "the file records the owner's approval on card 115 (wider than the card asked)", s);
  const cp = pre.prepare("SELECT disposition, disposition_state, evidence FROM control_registry WHERE control = 'control-plane-deny'").get();
  ok(/OWNER DIRECTIVE 2026-10-19/.test(cp.evidence) && cp.disposition_state === "applied", "control_registry control-plane-deny carries the owner directive (its state is moved by the worker change, not by this file)", cp);
  const det = pre.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-card-default-denies-decision'").get().verify_probe;
  ok(pre.prepare(det).get().observed === "0", "after the file card 115 no longer reads as a decision closed on a default", pre.prepare(det).get());
}

// ---- the grading markers, pinned by an independent list: a deleted or an added marker fails here
const EXPECT = {
  decision_action: ["%approve:%", "%decline:%", "%pick one%", "%choose one%", "%choose between%", "%which of%", "%option (a)%", "%option a%", "%(a)%(b)%"],
  decision_title: ["decide %", "decide:%", "should %", "which of%", "pick %", "choose %", "%?"],
  decision_title_not: ["why %", "is %", "did %", "what %", "how %", "are %", "does %"],
  // one probe sentence per hard marker: a decision card whose text holds it must stay on the old path
  hard: {
    "% payment %": "pay the payment now", "% payments %": "the payments are due", "%payment decision%": "Payment decision: x", "%invoice%": "the invoice", "%bank %": "the bank card",
    "%credit card%": "a credit card", "%billing account%": "the billing account", "%billing plan%": "the billing plan", "%billing project%": "the billing project",
    "%purchase%": "a purchase", "%wire transfer%": "a wire transfer", "%top up%": "top up the balance", "%top-up%": "a top-up", "% fund %": "fund the wallet x", "%prepaid%": "prepaid credit",
    "%subscri%": "subscribe to the plan", "% pay %": "pay the vendor", "% paid %": "it is paid now", "% fee %": "a fee applies", "% fees %": "fees apply", "%renew%": "renew the domain",
    "%registrar%": "at the registrar", "%refund%": "a refund", "%wallet%": "the wallet", "%$_%": "costs $24 a year",
    "% legal %": "a legal review", "% signature %": "needs a signature here", "%signing%": "the signing of it", "% sign the %": "sign the agreement", "%patent applic%": "a patent application",
    "% dpa %": "the dpa is signed", "% dpa,%": "the dpa, signed",
    "%irreversible%": "this is irreversible", "%delete%": "delete the rows", "%wipe%": "wipe the volume", "%erase%": "erase the log", "%truncate%": "truncate the table",
    "%drop table%": "drop table x", "%destroy%": "destroy the backup", "%unbacked%": "unbacked data",
    "%api key%": "an api key", "%oauth%": "an oauth grant", "%sign in to%": "sign in to the console", "%sign-in%": "a sign-in step", "%log in to%": "log in to the account",
    "%login link%": "the login link", "%login code%": "the login code", "%password%": "a password", "%credential%": "a credential", "%rotate%": "rotate it", "%secret%": "a secret",
    "%token%": "a token", "%grant access%": "grant access to x", "%your name%": "in your name", "%owner's name%": "in the owner's name", "%mailbox%": "the mailbox",
    "%email from%": "an email from the owner", "%send an email%": "send an email to x", "%send email%": "send email to x", "%@_%._%": "write to a@b.co", "%visibility%": "change the visibility",
    "%make public%": "make public the repo", "%be public%": "stay or be public", "%one-time code%": "a one-time code", "%verification code%": "a verification code", "%privacy of %": "the privacy of users",
    "%gdpr%": "gdpr scope", "%personal data%": "personal data", "%suppress%": "suppress the address", "%opt-out%": "an opt-out", "%opt out%": "they opt out", "%unsubscribe%": "unsubscribe them", "%consent%": "their consent",
  },
};
{
  const rows = db.prepare("SELECT kind, pattern FROM default_approve_markers").all();
  const have = (k) => rows.filter((r) => r.kind === k).map((r) => r.pattern).sort();
  for (const k of ["decision_action", "decision_title", "decision_title_not"]) ok(JSON.stringify(have(k)) === JSON.stringify(EXPECT[k].slice().sort()), "the " + k + " markers are exactly the pinned list", { have: have(k), want: EXPECT[k] });
  ok(JSON.stringify(have("hard")) === JSON.stringify(Object.keys(EXPECT.hard).sort()), "the hard markers are exactly the pinned list (a deleted or an added marker fails)", { extra: have("hard").filter((x) => !(x in EXPECT.hard)), missing: Object.keys(EXPECT.hard).filter((x) => !have("hard").includes(x)) });
  let n = 0;
  for (const [pat, text] of Object.entries(EXPECT.hard)) {
    const c = add(db, { slug: "hard-" + (n++), title: "Pick one for x", why: "", def: "stays", action: "Approve: " + text + ". Decline: nothing." });
    const v = g(c.id);
    ok(v.hard === 1 && v.approve === 0, "hard marker " + pat + " keeps the card on the old path: " + text, v);
  }
  // the narrowed markers must not catch the plain words: reversible decisions stay approvable (false positives found in review)
  const FP = [
    ["Add a guard to the billing monitor?", "Approve: add it. Decline: no."], ["Let the code loop edit the PAYMENT-GUARD-1 test?", "Approve: yes. Decline: no."],
    ["Purge the CDN cache on deploy?", "Approve: purge the edge cache. Decline: no."], ["Keep the login redirect on fleet.qnfo.org?", "Approve: keep it. Decline: no."],
    ["Move the privacy-policy page link?", "Approve: move it. Decline: no."], ["Raise the review loop to every 10 minutes?", "Approve: set it. Decline: no."],
  ];
  FP.forEach(([title, action], i) => { const c = add(db, { slug: "fp-" + i, title, why: "reversible", def: "Nothing changes.", action }); const v = g(c.id); ok(v.decision === 1 && v.hard === 0 && v.approve === (v.gate === "fleet" ? 1 : 0), "the markers do not catch a plain word: " + title, v); });
  // decision false negatives found in review, and questions that are not choices
  const DN = [["Pick the retry policy", "Option A: three tries. Option B: five tries."], ["Cadence", "Choose between 10 and 20 minutes."], ["Model order", "Which of glm, qwen or kimi first?"], ["Should the fleet raise the window", "Set it."], ["Window", "Decide: 7 days or 24 hours (a) 7 days (b) 24 hours"]];
  DN.forEach(([title, action], i) => { const c = add(db, { slug: "dn-" + i, title, why: "r", def: "Keep.", action }); const v = g(c.id); ok(v.decision === 1, "a choice is a decision: " + title + " / " + action, v); });
  const NOT = [["Why did the drain stall?", "Read the log."], ["Is the cron firing?", "Check it."], ["What changed in the gateway?", "Read the diff."], ["How many papers are queued?", "Count them."]];
  NOT.forEach(([title, action], i) => { const c = add(db, { slug: "nd-" + i, title, why: "r", def: "", action }); ok(g(c.id).decision === 0, "a question about a fact is not a decision: " + title, g(c.id)); });
}

// ---- inserts that must not abort or be touched
{
  const n0 = db.prepare("SELECT COUNT(*) AS n FROM human_actions").get().n;
  let err = null;
  try { db.prepare("INSERT INTO human_actions (slug, title, why, default_in_effect, action, status, source) VALUES (NULL, 'Decide the cadence?', 'x', 'Keep it.', 'Approve: set it. Decline: no.', 'open', 'session:t')").run(); } catch (e) { err = String(e.message || e); }
  ok(err === null && db.prepare("SELECT COUNT(*) AS n FROM human_actions").get().n === n0 + 1, "a decision card with a NULL slug inserts (decision_log.action is NOT NULL)", err);
  const nullRow = db.prepare("SELECT id, status FROM human_actions WHERE slug IS NULL ORDER BY id DESC LIMIT 1").get();
  ok(nullRow.status === "rerouted" && queue(db, nullRow.id).length === 1, "the NULL-slug decision card is rerouted and queued", nullRow);
  err = null;
  try { db.prepare("INSERT INTO human_actions (slug, title, why, default_in_effect, action, status, source) VALUES (NULL, 'Owner step', 'x', 'Waits.', 'Do it on the console.', 'open', 'session:t')").run(); } catch (e) { err = String(e.message || e); }
  ok(err === null, "a NULL-slug card with a default still inserts (adopt trigger)", err);
  const closed = add(db, { slug: "already-closed", title: "Decide x?", why: "r", def: "d", action: "Approve: x. Decline: y." });
  const before = db.prepare("SELECT COUNT(*) AS n FROM autonomy_reroute_queue").get().n;
  db.prepare("INSERT INTO human_actions (slug, title, why, default_in_effect, action, status, source) VALUES ('born-done', 'Decide y?', 'r', 'd', 'Approve: x. Decline: y.', 'done', 'session:t')").run();
  ok(db.prepare("SELECT COUNT(*) AS n FROM autonomy_reroute_queue").get().n === before && db.prepare("SELECT status FROM human_actions WHERE slug = 'born-done'").get().status === "done", "a card inserted with a status other than open is not touched");
  const urgent = add(db, { slug: "urgent-one", title: "Decide the failover?", why: "r", def: "", action: "Approve: switch. Decline: stay.", sev: "urgent" });
  ok(queue(db, urgent.id)[0].priority === "critical", "an urgent decision card is queued critical");
  // the gate row missing means on (the default of every reader)
  db.exec("DELETE FROM ops_config WHERE key = 'default_approve_gate'");
  const nogate = add(db, { slug: "no-gate-row", title: "Decide z?", why: "r", def: "d", action: "Approve: x. Decline: y." });
  ok(st(db, nogate.id).status === "rerouted", "with no default_approve_gate row the gate reads on");
  db.exec("INSERT INTO ops_config (key, value) VALUES ('default_approve_gate', 'on')");
}

// ---- the card-115 statement touches only that card in the state production holds it
{
  const other = build();
  const o = add(other, { slug: "some-other-card", title: "Keep the thing?", why: "r", def: "Keep it.", action: "Nothing." });
  other.exec("UPDATE human_actions SET id = 115 WHERE id = " + o.id);
  const before = JSON.stringify(other.prepare("SELECT * FROM human_actions WHERE id = 115").get());
  other.exec(sql);
  ok(JSON.stringify(other.prepare("SELECT * FROM human_actions WHERE id = 115").get()) === before, "id 115 with another slug is untouched");
  const edited = build();
  const e = add(edited, C115);
  edited.exec("UPDATE human_actions SET id = 115, resolution = 'OWNER: decided by hand', status = 'done' WHERE id = " + e.id);
  const before2 = JSON.stringify(edited.prepare("SELECT * FROM human_actions WHERE id = 115").get());
  edited.exec(sql);
  ok(JSON.stringify(edited.prepare("SELECT * FROM human_actions WHERE id = 115").get()) === before2, "card 115 already resolved by hand (not by DEFAULT-ADOPTED-1) is untouched");
}

// ---- idempotent
{
  const n = log(db);
  const bak1 = db.prepare("SELECT COUNT(*) AS n FROM bak_20261019_default_approve_triggers").get().n;
  db.exec(sql);
  ok(db.prepare("SELECT COUNT(*) AS n FROM bak_20261019_default_approve_triggers").get().n === bak1 && bak1 === 2, "the backup holds the two original trigger texts and a re-apply keeps them", bak1);
  ok(log(db) === n, "re-applying the file writes no second DEFAULT-APPROVE-1 decision");
  ok(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'human_actions_%'").get().n === 3, "three human_actions triggers (adopt, autonomy, approve) after a re-apply");
  ok(db.prepare("SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'card-default-denies-decision'").get().n === 1 && db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts WHERE class = 'fm-card-default-denies-decision'").get().n === 1, "one failure mode and one detector");
  const bak = db.prepare("SELECT name, sql FROM bak_20261019_default_approve_triggers ORDER BY name").all();
  ok(bak.length === 2 && bak.every((b) => !/v_human_action_decision/.test(b.sql)), "the backup text is the pre-change text (it does not mention the new view)");
}

// ---- the Rollback line, executed as written, restores the old behaviour
{
  const rb = /^-- Rollback: (.*)$/m.exec(sql)[1];
  const x = build(); x.exec(sql); x.exec(rb);
  const k = add(x, C115);
  const s = st(x, k.id);
  ok(s.status === "resolved" && /^DEFAULT-ADOPTED-1/.test(s.resolution) && queue(x, k.id).length === 0, "after the Rollback line a decision card is closed on its default as before", s);
  ok(x.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 0 && x.prepare("SELECT COUNT(*) AS n FROM control_registry WHERE control = 'default-adopt-status-quo'").get().n === 0, "the Rollback line removes the registry rows");
}

// ---- no cycle through agent_issues, no write to a claude host
const statements = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
ok(!/(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+agent_issues\b/i.test(statements), "the file never writes agent_issues (AGENT-ISSUES-TRIGGER-DEPTH-1, QUEUE-BREAK-CYCLE-1)");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link (CLOUDFLARE-ONLY-HOST-1)");

console.log(`default-approve: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
