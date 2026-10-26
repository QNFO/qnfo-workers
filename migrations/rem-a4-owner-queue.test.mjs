// REM-A4-OWNER-QUEUE-1 offline suite: replays migrations/2026-10-26-rem-a4-owner-queue.sql on node:sqlite over the live owner-queue objects, read from the migrations that define them (not copied):
// v_human_action_gate (2026-10-20-human-items-automatic), v_email_human_pending_v2 (2026-10-13-10-email-pending-view), and everything DEFAULT-APPROVE-1 made (default_approve_markers, v_human_action_decision, the three
// human_actions AFTER INSERT triggers, fm-card-default-denies-decision, 2026-10-19-default-approve). The base tables carry the live column lists; remediation_contracts carries the live semicolon-rewrite triggers.
// Proves, for agent_issues 100459: an IDENTITY-BOUND card with a default stays OPEN whatever its wording and whatever hard marker it matches (the before-state closes it at birth, the defect); a card without the label,
// a hard decision card and a closure notice keep the path they had; approve is graded exactly as before for every shape; the kill switch ops_config default_approve_gate = off restores the old behaviour; the
// detector fm-card-default-denies-decision does not read the 23-card history as a regression but still counts the old shape, the new detector fm-ib-card-closed-at-birth and the issue's contract fire on a
// closure after the baseline; the contract probe of the issue could never pass (documented) and the new one names each wrong state. For 100454: the new probe reads the owner mail queue, not the dead
// emails.processed_at column, and names a waiting mail, a stalled inbound and a finished card without resolved_at. Replay is a no-op, the Rollback line restores the old objects.
// Output MUST contain "0 failed" on success.   node migrations/rem-a4-owner-queue.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (f) => new URL("./" + f, import.meta.url);
const read = (f) => readFileSync(here(f), "utf8");
const FILE = "2026-10-26-rem-a4-owner-queue.sql";
const sql = read(FILE);
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

// "CREATE <kind> <name> ..." up to its terminator: the closing semicolon outside quotes (view) or the line "END;" (trigger)
function ddl(file, kind, name) {
  const t = read(file);
  const at = t.search(new RegExp("^CREATE " + kind + "(?: IF NOT EXISTS)? " + name + "\\b", "m"));
  if (at < 0) throw new Error(name + " not found in " + file);
  if (kind === "TRIGGER") { const end = t.indexOf("\nEND;", at); return t.slice(at, end + 5).replace(/CREATE TRIGGER IF NOT EXISTS/, "CREATE TRIGGER"); }
  let q = false, i = at;
  for (; i < t.length; i++) { const c = t[i]; if (c === "'") q = !q; else if (c === ";" && !q) break; }
  return t.slice(at, i + 1);
}
const q1 = (db, s, ...p) => db.prepare(s).get(...p);
const qa = (db, s, ...p) => db.prepare(s).all(...p);
const norm = (s) => String(s || "").replace(/\s+/g, "");

// ---- the header
const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1 && header.filter((l) => /^-- BACKUP: bak_20261026_v_human_action_decision\s*$/.test(l)).length === 1, "exactly one single-line Rollback header and the BACKUP header");
ok(/CREATE TABLE IF NOT EXISTS bak_20261026_v_human_action_decision AS SELECT/.test(body) && body.indexOf("bak_20261026_v_human_action_decision") < body.indexOf("DROP VIEW"), "the backup table is created before the first DROP");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link");
ok(!/(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+agent_issues\b/i.test(body), "the file never writes agent_issues (AGENT-ISSUES-TRIGGER-DEPTH-1)");
ok(!/(UPDATE|DELETE\s+FROM)\s+decision_log\b/i.test(body), "decision_log is only appended to");
ok(/DROP VIEW IF EXISTS v_human_action_decision;\nCREATE VIEW v_human_action_decision AS/.test(body), "DROP VIEW and CREATE VIEW are adjacent statements (the apply window is as short as the runner allows)");
for (const m of body.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)) ok(Buffer.byteLength(m[1].replace(/''/g, "'")) <= 50, "LIKE pattern within the D1 limit of 50 bytes: " + m[1].slice(0, 30));

// ---- the live objects
const BASE = `
CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT DEFAULT 'normal', due TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, resolution TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE autonomy_reroute_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, human_action_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT, priority TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), drained_at TEXT, issue_id INTEGER);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TRIGGER remediation_probe_semicolon_ins AFTER INSERT ON remediation_contracts WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0 BEGIN UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class; END;
CREATE TRIGGER remediation_probe_semicolon_upd AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0 BEGIN UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class; END;
CREATE TRIGGER remediation_probe_edit_rerun AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts WHEN NEW.verify_probe IS NOT OLD.verify_probe OR NEW.verify_transport IS NOT OLD.verify_transport BEGIN UPDATE remediation_contracts SET next_due_at = datetime('now') WHERE class = NEW.class; END;
CREATE TABLE emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT, body_text TEXT, body_html TEXT, headers_json TEXT, classification TEXT DEFAULT 'general', status TEXT DEFAULT 'received', processing_ms INTEGER, received_at TEXT DEFAULT (datetime('now')), processed_at TEXT, in_reply_to TEXT, references_hdr TEXT);
CREATE TABLE email_sender_policy (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT NOT NULL, kind TEXT NOT NULL, auto_reply_ok INTEGER NOT NULL DEFAULT 0, note TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE email_command_senders (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT NOT NULL UNIQUE, kind TEXT NOT NULL DEFAULT 'owner', note TEXT, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE email_commands (id INTEGER PRIMARY KEY AUTOINCREMENT, email_id INTEGER, message_id TEXT, in_reply_to TEXT, sender TEXT NOT NULL, recipient TEXT, subject TEXT, verb TEXT, command_text TEXT, status TEXT NOT NULL DEFAULT 'pending', result TEXT, reply_email_id INTEGER, attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE email_reply_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, email_id INTEGER NOT NULL, sender TEXT NOT NULL, person_key TEXT, subject TEXT, received_at TEXT, human_score INTEGER, decision TEXT NOT NULL DEFAULT 'pending', skip_reason TEXT, draft_text TEXT, drafted_at TEXT, sent_at TEXT, attempt_count INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), tier TEXT, tier_reason TEXT, draft_proposed TEXT);
INSERT INTO ops_config (key, value) VALUES ('autonomy_first_gate', 'on'), ('default_adopt_gate', 'on');`;

// production before this file: everything DEFAULT-APPROVE-1 installed, plus the two contracts the file rewrites with the probes they carry live
const OLD_PROBE_100459 = "SELECT 'decision_1_conjunct_absent_in_ib_held' AS expected, CASE WHEN (SELECT sql FROM sqlite_master WHERE type='view' AND name='v_human_action_decision') LIKE '%decision = 1%AND%ib = 1%' THEN 'decision_1_conjunct_present_in_ib_held' ELSE 'decision_1_conjunct_absent_in_ib_held' END AS observed";
const OLD_PROBE_100454 = "SELECT '0' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM emails WHERE classification='personal-unverified' AND processed_at IS NULL AND received_at < datetime('now','-1 hour')";
const VACUOUS = "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close. A doer that knows the defect replaces this probe with one that measures it.";
function oldWorld() {
  const db = new DatabaseSync(":memory:");
  db.exec(BASE);
  db.exec(ddl("2026-10-20-human-items-automatic.sql", "VIEW", "v_human_action_gate"));
  db.exec(ddl("2026-10-13-10-email-pending-view.sql", "VIEW", "v_email_human_pending_v2"));
  db.exec(ddl("2026-10-12-34-default-adopt-prediction.sql", "TRIGGER", "human_actions_default_adopt_ai"));
  db.exec(ddl("2026-10-19-owner-queue-triggers-versioned.sql", "TRIGGER", "human_actions_autonomy_first_ai"));
  db.exec(read("2026-10-19-default-approve.sql"));
  const ins = db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict, attempts, next_due_at) VALUES (?, ?, 'p', ?, ?, 'd1-query', 'qnfo-ops', 'active', 'fail', ?, '2026-10-26 17:00:00')");
  ins.run("issue-100459", 100459, VACUOUS, OLD_PROBE_100459, 13);
  ins.run("issue-100454", 100454, VACUOUS, OLD_PROBE_100454, 14);
  return db;
}
function newWorld() { const db = oldWorld(); db.exec(sql); return db; }

const COLS = "slug, title, why, default_in_effect, action, sev, status, source";
function add(db, c) {
  db.prepare("INSERT INTO human_actions (" + COLS + ") VALUES (?, ?, ?, ?, ?, ?, 'open', ?)").run(c.slug, c.title, c.why || "", c.def === undefined ? "" : c.def, c.action || "", c.sev || "normal", c.source || "session:test");
  return db.prepare("SELECT * FROM human_actions WHERE slug = ?").get(c.slug);
}
const st = (db, id) => db.prepare("SELECT status, resolution, default_in_effect FROM human_actions WHERE id = ?").get(id);
const queue = (db, id) => db.prepare("SELECT * FROM autonomy_reroute_queue WHERE human_action_id = ?").all(id);
const grade = (db, id) => db.prepare("SELECT decision, hard, ib, gate, approve, held FROM v_human_action_decision WHERE id = ?").get(id);
const probe = (db, cls) => { const r = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = ?").get(cls); return r ? db.prepare(r.verify_probe).get() : null; };
const closedAtBirth = (db, id) => { const s = st(db, id); return s.status === "resolved" && /^DEFAULT-ADOPTED-1/.test(s.resolution || ""); };

// the cards: the shapes of the 34 live IDENTITY-BOUND cards, plus the shapes around them
const IB_STEP = { slug: "ib-step", title: "Review the poster layout", why: "IDENTITY-BOUND: only the owner can approve the layout", def: "Nothing changes.", action: "Look at it and say if you want changes." };
const IB_MAIL = { slug: "ib-mail", title: "Personal inbound unanswered 9.8 days", why: "IDENTITY-BOUND: personal-plane inbound email from friend@example.org, never replied", def: "No reply sent. Nothing is lost by waiting.", action: "Read it and either reply in-thread or mark it archived." };
const IB_MONEY = { slug: "ib-money", title: "Decide whether QNFO joins Crossref (about USD 200 a year)", why: "IDENTITY-BOUND: money and a membership agreement in your name", def: "No DOIs. Papers keep versioned URLs.", action: "Reply 'join' to start the membership, or 'no DOIs' to keep the default." };
const IB_DECISION = { slug: "ib-decision", title: "Let the code loop change qnfo-fleet-control, the worker that judges its pull requests?", why: "The code loop may merge its own changes to qnfo-ai and qnfo-gateway. IDENTITY-BOUND: this lifts a deny the owner set for the system's own verifier.", def: "The deny stays. Changes keep going through session pull requests, as today.", action: "Approve: add qnfo-fleet-control to CM_LOOP_CANARIED, one pull request. Decline: nothing changes." };
const IB_CREDENTIAL = { slug: "ib-credential", title: "Create a token for the Mastodon app", why: "IDENTITY-BOUND: a credential only the owner can mint", def: "Mastodon stays on Buffer.", action: "Create the token in the Mastodon settings and hand it over." };
const NOTICE_IB = { slug: "notice-ib", title: "OWNER-TASK: decide the scope?", why: "IDENTITY-BOUND: the owner asked for this", def: "Closed on request.", action: "Approve: ok. Decline: no.", source: "owner-request-issue" };
const OWNER_STEP_PLAIN = { slug: "owner-step-plain", title: "Connect a Substack account in Buffer", why: "sign in to your own Buffer and connect the channel", def: "No Substack posts; the other channels carry the volume.", action: "buffer.com > Channels > Connect a channel > Substack." };
const MONEY_DECISION_PLAIN = { slug: "money-plain", title: "Payment decision: authorise a stronger code-loop model, or accept the growing queue", why: "spend", def: "No payment is made.", action: "Choose one: (a) authorise the payment, (b) accept the queue." };
const FLEET_DECISION = { slug: "fleet-decision", title: "Decide the cadence of the review loop", why: "measured 2026-10-26", def: "Keep the current cadence.", action: "Pick one: (a) every 10 minutes in worker.js, (b) leave it.", sev: "high" };
const FLEET_PLAIN = { slug: "fleet-plain", title: "Raise the threshold in worker.js", why: "fleet work", def: "", action: "set it" };
const IB_NO_DEFAULT = { slug: "ib-no-default", title: "Sign the data processing agreement", why: "IDENTITY-BOUND: a signing act in your name", def: "", action: "Sign or decline." };
const SHAPES = [IB_STEP, IB_MAIL, IB_MONEY, IB_DECISION, IB_CREDENTIAL, NOTICE_IB, OWNER_STEP_PLAIN, MONEY_DECISION_PLAIN, FLEET_DECISION, FLEET_PLAIN, IB_NO_DEFAULT];
function all(db) { const r = {}; for (const c of SHAPES) r[c.slug] = add(db, c); return r; }

// ---- before the file: the defect, on the live objects
{
  const db = oldWorld(); const r = all(db);
  ok(closedAtBirth(db, r["ib-step"].id), "before: an IDENTITY-BOUND card that is not decision-shaped is closed at birth by DEFAULT-ADOPTED-1 (the defect)", st(db, r["ib-step"].id));
  ok(closedAtBirth(db, r["ib-mail"].id) && grade(db, r["ib-mail"].id).hard === 1, "before: an IDENTITY-BOUND card with an e-mail address (hard) is closed at birth: the issue's one-line patch would not have kept it", grade(db, r["ib-mail"].id));
  ok(closedAtBirth(db, r["ib-money"].id) && grade(db, r["ib-money"].id).decision === 1 && grade(db, r["ib-money"].id).hard === 1, "before: an IDENTITY-BOUND money decision (hard) is closed at birth", grade(db, r["ib-money"].id));
  ok(closedAtBirth(db, r["ib-credential"].id), "before: an IDENTITY-BOUND credential step is closed at birth");
  ok(st(db, r["ib-decision"].id).status === "open" && grade(db, r["ib-decision"].id).held === 1, "before: the card-115 shape (decision, not hard, IDENTITY-BOUND) is the only one held", grade(db, r["ib-decision"].id));
  ok(probe(db, "issue-100459").observed === "decision_1_conjunct_present_in_ib_held", "before: the old contract probe reads present");
}

// ---- after the file
const db = newWorld();
const r = all(db);
const view = q1(db, "SELECT sql FROM sqlite_master WHERE type = 'view' AND name = 'v_human_action_decision'").sql;
ok(view.includes("AND ib = 1 AND COALESCE(source, '') <> 'owner-request-issue' THEN 1 ELSE 0 END AS held") && !view.includes("decision = 1 AND hard = 0 AND ib = 1") && view.includes("decision = 1 AND hard = 0 AND ib = 0 AND gate = 'fleet'"), "the stored view text: held needs only the label, approve is unchanged");
// every IDENTITY-BOUND card with a default stays open, untouched, queued nowhere
for (const slug of ["ib-step", "ib-mail", "ib-money", "ib-decision", "ib-credential"]) {
  const s = st(db, r[slug].id), g = grade(db, r[slug].id);
  ok(s.status === "open" && s.resolution === null && g.held === 1 && g.approve === 0 && queue(db, r[slug].id).length === 0 && s.default_in_effect === add_default(slug), slug + ": an IDENTITY-BOUND card with a default stays open, graded held, nothing queued, its default untouched", [s, g]);
}
function add_default(slug) { return SHAPES.find((c) => c.slug === slug).def; }
ok(q1(db, "SELECT COUNT(*) AS n FROM decision_log WHERE actor = 'trigger:human_actions_default_adopt_ai'").n === 3 && qa(db, "SELECT action FROM decision_log WHERE actor LIKE 'trigger:%'").every((x) => !/ib-/.test(x.action)), "the adopt trigger wrote a decision_log row only for the three cards it closed (plain owner step, hard money decision, closure notice), none for a held card", qa(db, "SELECT actor, action FROM decision_log WHERE actor LIKE 'trigger:%'"));
// the no-default IDENTITY-BOUND card was never closed (nothing to adopt)
ok(st(db, r["ib-no-default"].id).status === "open" && grade(db, r["ib-no-default"].id).held === 1, "an IDENTITY-BOUND card with an empty default is open and held");
// the paths that do not move
ok(closedAtBirth(db, r["owner-step-plain"].id) && queue(db, r["owner-step-plain"].id).length === 0 && grade(db, r["owner-step-plain"].id).held === 0, "a card without the label keeps DEFAULT-ADOPTED-1 (an owner step with a safe default)", st(db, r["owner-step-plain"].id));
ok(closedAtBirth(db, r["money-plain"].id) && grade(db, r["money-plain"].id).hard === 1 && grade(db, r["money-plain"].id).approve === 0, "a hard decision card without the label keeps its old path (closed on its default, never approved)", grade(db, r["money-plain"].id));
ok(closedAtBirth(db, r["notice-ib"].id) && grade(db, r["notice-ib"].id).held === 0 && grade(db, r["notice-ib"].id).approve === 0, "a closure notice (owner-request-issue) is never held, as before", grade(db, r["notice-ib"].id));
ok(st(db, r["fleet-decision"].id).status === "rerouted" && grade(db, r["fleet-decision"].id).approve === 1 && queue(db, r["fleet-decision"].id).length === 1 && /^DEFAULT-APPROVE-1: /.test(queue(db, r["fleet-decision"].id)[0].title), "a fleet decision is still approved and queued once", st(db, r["fleet-decision"].id));
ok(st(db, r["fleet-plain"].id).status === "rerouted" && /^AUTONOMY-FIRST-1/.test(st(db, r["fleet-plain"].id).resolution) && queue(db, r["fleet-plain"].id).length === 1, "a plain fleet card is still rerouted by AUTONOMY-FIRST-1");

// approve is graded as before for every shape, held differs exactly where ib = 1 and the source is not a closure notice
{
  const o = oldWorld(); const ro = all(o);
  const cols = (d) => d.prepare("SELECT slug, decision, hard, ib, gate, approve, held FROM v_human_action_decision ORDER BY slug").all();
  const a = cols(o), b = cols(db);
  ok(a.length === SHAPES.length && b.length === SHAPES.length, "both worlds graded every shape");
  ok(a.every((x, i) => x.slug === b[i].slug && x.decision === b[i].decision && x.hard === b[i].hard && x.ib === b[i].ib && x.gate === b[i].gate && x.approve === b[i].approve), "decision, hard, ib, gate and approve are identical before and after for every shape", { a, b });
  const src = Object.fromEntries(SHAPES.map((c) => [c.slug, c.source || "session:test"]));
  ok(b.every((x) => x.held === (x.ib === 1 && src[x.slug] !== "owner-request-issue" ? 1 : 0)), "held after the file is exactly: the label, and not a closure notice", b.map((x) => x.slug + ":" + x.held));
  ok(a.filter((x) => x.held === 1).map((x) => x.slug).join() === "ib-decision" && b.filter((x) => x.held === 1).map((x) => x.slug).sort().join() === ["ib-credential", "ib-decision", "ib-mail", "ib-money", "ib-no-default", "ib-step"].sort().join(), "held moves from one shape to the six IDENTITY-BOUND shapes", { before: a.filter((x) => x.held === 1).map((x) => x.slug), after: b.filter((x) => x.held === 1).map((x) => x.slug) });
  void ro;
}

// the kill switch: off restores DEFAULT-ADOPTED-1 for every card, on again holds
{
  const off = newWorld();
  off.prepare("UPDATE ops_config SET value = 'off' WHERE key = 'default_approve_gate'").run();
  const x = add(off, Object.assign({}, IB_STEP, { slug: "off-ib-step" }));
  ok(closedAtBirth(off, x.id) && grade(off, x.id).held === 0, "default_approve_gate = off: an IDENTITY-BOUND card is closed on its default again (the old behaviour, one switch)", st(off, x.id));
  off.prepare("UPDATE ops_config SET value = 'on' WHERE key = 'default_approve_gate'").run();
  const y = add(off, Object.assign({}, IB_STEP, { slug: "on-ib-step" }));
  ok(st(off, y.id).status === "open", "gate on again: held");
  off.exec("DELETE FROM ops_config WHERE key = 'default_approve_gate'");
  const z = add(off, Object.assign({}, IB_STEP, { slug: "nogate-ib-step" }));
  ok(st(off, z.id).status === "open", "with no default_approve_gate row the gate reads on");
}

// ---- the detectors
const baseline = Number(q1(db, "SELECT value FROM ops_config WHERE key = 'ib_held_since_card_id'").value);
ok(baseline === 0, "the baseline is the newest card id when the view was replaced (0 in the empty fixture, the newest id in production)", baseline);
{
  // history: IDENTITY-BOUND cards closed at birth before the file (ids at or below the baseline) must not read as a regression
  const h = oldWorld();
  const hist1 = add(h, Object.assign({}, IB_MAIL, { slug: "hist-mail" }));
  const hist2 = add(h, Object.assign({}, IB_STEP, { slug: "hist-step" }));
  ok(closedAtBirth(h, hist1.id) && closedAtBirth(h, hist2.id), "fixture: two historical IDENTITY-BOUND cards were closed at birth by the old view");
  const oldDet = h.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-card-default-denies-decision'").get().verify_probe;
  ok(h.prepare(oldDet).get().observed === "0", "before: the detector reads 0 on that history");
  h.exec(sql);
  ok(h.prepare(oldDet).get().observed === "2", "the unchanged detector text would read 2 on the history once held widens (the regression the baseline avoids)", h.prepare(oldDet).get());
  ok(probe(h, "fm-card-default-denies-decision").observed === "0" && probe(h, "fm-card-default-denies-decision").expected === "0", "the narrowed detector reads 0 on the history", probe(h, "fm-card-default-denies-decision"));
  ok(probe(h, "fm-ib-card-closed-at-birth").observed === "0", "fm-ib-card-closed-at-birth reads 0 on the history", probe(h, "fm-ib-card-closed-at-birth"));
  ok(probe(h, "issue-100459").observed === "held-by-ib-label", "the contract of 100459 reads held-by-ib-label on the history", probe(h, "issue-100459"));
  // the old shape stays visible for every card: a decision card, not hard, IDENTITY-BOUND, closed on a default (card 115 at birth) at or below the baseline
  const older = oldWorld();
  const c115 = add(older, Object.assign({}, IB_DECISION, { slug: "c115" }));
  older.prepare("UPDATE human_actions SET status = 'resolved', resolution = 'DEFAULT-ADOPTED-1: closed at birth on its stated default' WHERE id = ?").run(c115.id);
  older.exec(sql);
  ok(probe(older, "fm-card-default-denies-decision").observed === "1", "the detector still counts the old shape (a decision, not hard, labelled card) for a card at or below the baseline", probe(older, "fm-card-default-denies-decision"));
  // the other old shape: an approved decision closed on a default
  const appr = oldWorld(); appr.exec(sql);
  const fd = add(appr, Object.assign({}, FLEET_DECISION, { slug: "fd2" }));
  appr.prepare("UPDATE human_actions SET status = 'resolved', resolution = 'DEFAULT-ADOPTED-1: closed at birth on its stated default' WHERE id = ?").run(fd.id);
  ok(probe(appr, "fm-card-default-denies-decision").observed === "1", "the detector still counts an approvable decision card closed on a default", probe(appr, "fm-card-default-denies-decision"));
}
{
  // a regression after the baseline: a labelled card is closed at birth again (the view or the trigger was recreated without the hold)
  const g = newWorld();
  const fresh = add(g, Object.assign({}, IB_STEP, { slug: "fresh-ib" }));
  ok(st(g, fresh.id).status === "open" && Number(fresh.id) > Number(q1(g, "SELECT value FROM ops_config WHERE key = 'ib_held_since_card_id'").value) - 0, "fixture: a card filed after the file is above the baseline and held");
  ok(probe(g, "fm-ib-card-closed-at-birth").observed === "0" && probe(g, "fm-card-default-denies-decision").observed === "0" && probe(g, "issue-100459").observed === "held-by-ib-label", "all three read clean while the card is held");
  g.prepare("UPDATE human_actions SET status = 'resolved', resolution = 'DEFAULT-ADOPTED-1: closed at birth on its stated default' WHERE id = ?").run(fresh.id);
  ok(probe(g, "fm-ib-card-closed-at-birth").observed === "1", "fm-ib-card-closed-at-birth reads 1 when a labelled card above the baseline is closed by DEFAULT-ADOPTED-1", probe(g, "fm-ib-card-closed-at-birth"));
  ok(probe(g, "fm-card-default-denies-decision").observed === "1", "fm-card-default-denies-decision reads 1 for the same closure (held after the baseline)", probe(g, "fm-card-default-denies-decision"));
  ok(probe(g, "issue-100459").observed === "ib-card-closed-at-birth-after-the-fix", "the contract of 100459 names the regression", probe(g, "issue-100459"));
  // closure notices and a gate that is off are not regressions
  g.prepare("UPDATE ops_config SET value = 'off' WHERE key = 'default_approve_gate'").run();
  ok(probe(g, "fm-ib-card-closed-at-birth").observed === "0" && probe(g, "fm-card-default-denies-decision").observed === "0", "with default_approve_gate = off a closure on a default is intended: both detectors read 0");
  g.prepare("UPDATE ops_config SET value = 'on' WHERE key = 'default_approve_gate'").run();
  g.prepare("UPDATE human_actions SET source = 'owner-request-issue' WHERE id = ?").run(fresh.id);
  ok(probe(g, "fm-ib-card-closed-at-birth").observed === "0", "a closure notice carrying the label is not counted");
  g.prepare("UPDATE human_actions SET source = 'session:test' WHERE id = ?").run(fresh.id);
  // the baseline row deleted: the detectors count the history and read red (fail closed)
  g.prepare("DELETE FROM ops_config WHERE key = 'ib_held_since_card_id'").run();
  ok(Number(probe(g, "fm-ib-card-closed-at-birth").observed) >= 1, "without the baseline row the detector counts every labelled closure (fails closed)");
}

// ---- the contract of 100459: the old probe could never pass; the new one names each wrong state
{
  ok(db.prepare(OLD_PROBE_100459).get().observed === "decision_1_conjunct_present_in_ib_held", "the old probe still reads present on the fixed view: it could never pass (its LIKE spans the approve branch and the held branch)");
  const c = q1(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-100459'");
  ok(c.status === "active" && c.last_verdict === null && c.attempts === 0 && c.verify_transport === "d1-query" && !/VACUOUS/.test(c.action) && /^MEASURES the defect/.test(c.action), "the contract is active, reset, and its action text is honest", { status: c.status, v: c.last_verdict, a: c.attempts });
  const pr = probe(db, "issue-100459");
  ok(pr.expected === "held-by-ib-label" && pr.observed === "held-by-ib-label", "the new probe reads held-by-ib-label on the fixed view", pr);
  const o = oldWorld(); o.prepare("UPDATE remediation_contracts SET verify_probe = ? WHERE class = 'issue-100459'").run(c.verify_probe);
  ok(probe(o, "issue-100459").observed === "held-needs-decision", "on the old view text the new probe reads held-needs-decision", probe(o, "issue-100459"));
  const mid = newWorld(); // the issue's literal patch: drop only "decision = 1"
  mid.exec("DROP VIEW v_human_action_decision");
  mid.exec(view.replace("AND ib = 1 AND COALESCE(source, '') <> 'owner-request-issue' THEN 1 ELSE 0 END AS held", "AND hard = 0 AND ib = 1 AND COALESCE(source, '') <> 'owner-request-issue' THEN 1 ELSE 0 END AS held"));
  ok(probe(mid, "issue-100459").observed === "held-needs-no-hard", "on the issue's literal patch (hard = 0 kept) it reads held-needs-no-hard", probe(mid, "issue-100459"));
  const odd = newWorld();
  odd.exec("DROP VIEW v_human_action_decision");
  odd.exec("CREATE VIEW v_human_action_decision AS SELECT id, 0 AS approve, 1 AS held FROM human_actions");
  ok(probe(odd, "issue-100459").observed === "view-unrecognised", "an unrelated view text reads view-unrecognised", probe(odd, "issue-100459"));
  odd.exec("DROP VIEW v_human_action_decision");
  let missing = null;
  try { probe(odd, "issue-100459"); } catch (e) { missing = String(e.message || e); }
  ok(/no such table: v_human_action_decision/.test(missing || ""), "with no view the probe is an error (the consumer records probe-error and closes nothing)", missing);
}

// ---- 100454: the probe reads the owner mail queue, not the dead column
{
  const w = newWorld();
  const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();
  let n = 0;
  const mail = (o) => { n++; w.prepare("INSERT INTO emails (message_id, sender, recipient, subject, classification, status, received_at, processed_at) VALUES (?, ?, 'rowan.quni@qnfo.org', ?, ?, ?, ?, ?)").run("m" + n, o.sender || "friend" + n + "@example.org", "s" + n, o.cls || "personal-unverified", o.status || "archived", o.at || iso(3000), o.pa || null); return Number(w.prepare("SELECT id FROM emails WHERE message_id = ?").get("m" + n).id); };
  // the live shape: 90 personal-unverified rows with processed_at NULL and a terminal status
  for (let i = 0; i < 46; i++) mail({ status: "archived" });
  for (let i = 0; i < 38; i++) mail({ status: "spam", sender: "promo" + i + "@vendor.example" });
  mail({ status: "replied" });
  const oldP = w.prepare(OLD_PROBE_100454).get();
  ok(oldP.expected === "0" && Number(oldP.observed) === 85, "the old probe counts a dead column: 85 handled rows read as waiting", oldP);
  let pr = probe(w, "issue-100454");
  ok(pr.expected === "cards:0 mail:0 stuck:0" && pr.observed === "cards:0 mail:0 stuck:0", "the new probe reads clean on that data: every row has a terminal status and the owner queue is empty", pr);
  // a personal mail that waits in the owner queue: 30 hours old reads mail:1, 2 hours old does not (24 hours is the issue's threshold)
  const old30 = mail({ status: "processed", at: iso(30 * 60) });
  ok(q1(w, "SELECT COUNT(*) AS n FROM v_email_human_pending_v2 WHERE id = ?", old30).n === 1, "fixture: a processed personal mail from a person is in the owner queue view");
  ok(probe(w, "issue-100454").observed === "cards:0 mail:1 stuck:0", "a personal mail waiting 30 hours reads mail:1", probe(w, "issue-100454"));
  w.prepare("UPDATE emails SET received_at = ? WHERE id = ?").run(iso(120), old30);
  ok(probe(w, "issue-100454").observed === "cards:0 mail:0 stuck:0", "the same mail waiting 2 hours is within the 24-hour definition of done");
  w.prepare("UPDATE emails SET received_at = ? WHERE id = ?").run(iso(30 * 60), old30);
  w.prepare("INSERT INTO email_reply_queue (email_id, sender, decision) VALUES (?, 'x', 'sent')").run(old30);
  ok(probe(w, "issue-100454").observed === "cards:0 mail:0 stuck:0", "an answered mail (reply queue decision sent) is a disposition");
  w.prepare("DELETE FROM email_reply_queue WHERE email_id = ?").run(old30);
  w.prepare("UPDATE emails SET status = 'archived' WHERE id = ?").run(old30);
  ok(probe(w, "issue-100454").observed === "cards:0 mail:0 stuck:0", "an archived mail is a disposition");
  w.prepare("UPDATE emails SET status = 'processed', sender = 'noreply@vendor.example' WHERE id = ?").run(old30);
  ok(probe(w, "issue-100454").observed === "cards:0 mail:0 stuck:0", "a noreply sender never reaches the owner queue");
  w.prepare("UPDATE emails SET sender = 'friend@example.org', classification = 'general' WHERE id = ?").run(old30);
  ok(probe(w, "issue-100454").observed === "cards:0 mail:0 stuck:0", "a general-classified mail is not an owner-classified mail");
  w.prepare("UPDATE emails SET classification = 'personal' WHERE id = ?").run(old30);
  ok(probe(w, "issue-100454").observed === "cards:0 mail:1 stuck:0", "a verified-personal mail waiting 30 hours reads mail:1 too");
  w.prepare("UPDATE emails SET status = 'archived' WHERE id = ?").run(old30);
  // an inbound that stalled at receipt
  const stuck = mail({ status: "received", at: iso(90) });
  ok(probe(w, "issue-100454").observed === "cards:0 mail:0 stuck:1", "a personal-unverified mail stuck at status received for 90 minutes reads stuck:1", probe(w, "issue-100454"));
  w.prepare("UPDATE emails SET received_at = ? WHERE id = ?").run(iso(30), stuck);
  ok(probe(w, "issue-100454").observed === "cards:0 mail:0 stuck:0", "the same mail 30 minutes after receipt is not stalled yet");
  w.prepare("UPDATE emails SET status = 'processed' WHERE id = ?").run(stuck);
  // the retracted first root cause stays covered: a finished card without resolved_at counts as waiting
  const card = add(w, { slug: "done-card", title: "x", why: "y", def: "" });
  w.prepare("UPDATE human_actions SET status = 'rerouted', resolved_at = NULL WHERE id = ?").run(card.id);
  ok(probe(w, "issue-100454").observed === "cards:1 mail:0 stuck:0", "a rerouted card that never got resolved_at reads cards:1", probe(w, "issue-100454"));
  w.prepare("UPDATE human_actions SET resolved_at = datetime('now') WHERE id = ?").run(card.id);
  ok(probe(w, "issue-100454").observed === "cards:0 mail:0 stuck:0", "stamped, it reads clean");
  const c = q1(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-100454'");
  ok(c.status === "active" && c.last_verdict === null && c.attempts === 0 && !/VACUOUS/.test(c.action) && /emails\.processed_at is written by nothing since 2026-09-26/.test(c.action), "the contract is active, reset, and its action names the dead column", { s: c.status, v: c.last_verdict });
}

// ---- the three probes: one row, expected and observed, no semicolon (D1 rewrites it to a comma), no write keyword (the consumer refuses it), a single read
{
  const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
  for (const cls of ["issue-100459", "issue-100454", "fm-ib-card-closed-at-birth", "fm-card-default-denies-decision"]) {
    const p = q1(db, "SELECT verify_probe, verify_transport, status FROM remediation_contracts WHERE class = ?", cls);
    const low = p.verify_probe.toLowerCase();
    ok(/^(select|with)/.test(low.trim()) && !p.verify_probe.includes(";") && WRITE_KW.every((k) => !low.includes(k)), cls + ": a literal read-only probe, no semicolon, no write keyword", p.verify_probe.slice(0, 80));
    const rows = db.prepare(p.verify_probe).all();
    ok(rows.length === 1 && "expected" in rows[0] && "observed" in rows[0] && String(rows[0].expected).length > 0 && String(rows[0].observed).length > 0, cls + ": one row with a non-empty expected and observed", rows);
    ok(p.verify_transport === "d1-query" && p.status === "active", cls + ": d1-query, active");
  }
  for (const cls of ["issue-100459", "issue-100454"]) {
    const rs = db.prepare(q1(db, "SELECT verify_probe FROM remediation_contracts WHERE class = ?", cls).verify_probe).get();
    ok(rs.expected === rs.observed, cls + ": passes on the fixed state (the consumer closes the issue on this reading)", rs);
  }
}

// ---- failure mode, detector, registry
{
  ok(q1(db, "SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'ib-card-closed-at-birth' AND probe_class = 'fm-ib-card-closed-at-birth' AND issue_id = 100459").n === 1, "one failure mode row for the new detector");
  const f = q1(db, "SELECT * FROM remediation_contracts WHERE class = 'fm-ib-card-closed-at-birth'");
  ok(f && f.module === "failure-mode" && f.issue_id === null && f.escalate_to === "qnfo-fleet-control", "the detector is a standing failure-mode contract, not an issue contract", f);
  ok(q1(db, "SELECT COUNT(*) AS n FROM control_registry WHERE control = 'default-adopt-status-quo' AND instr(evidence, 'IB-HELD-1') > 0").n === 1, "the control_registry row of the adopt gate carries the IB-HELD-1 note");
  const dl = qa(db, "SELECT * FROM decision_log WHERE instr(action, 'REM-A4-OWNER-QUEUE-1:') = 1");
  ok(dl.length === 1 && dl[0].actor === "rem-a4-ownerq" && /rollback|Rollback/.test(dl[0].rollback_path) && dl[0].predicted_outcome.length > 200 && dl[0].reach_gain.length > 0 && dl[0].surfaces_tested.length > 0 && dl[0].capability_gain.length > 0, "one decision_log row with the prediction, the reach and the surfaces", dl.length);
  const bak = qa(db, "SELECT name, type, sql FROM bak_20261026_v_human_action_decision");
  ok(bak.length === 1 && bak[0].type === "view" && /AND decision = 1 AND hard = 0 AND ib = 1 AND COALESCE/.test(bak[0].sql), "the backup holds the old view text", bak.length);
}

// ---- replay changes nothing; the first baseline stays
{
  const rp = newWorld();
  add(rp, Object.assign({}, IB_STEP, { slug: "rp-before" }));
  const snap = () => JSON.stringify([rp.prepare("SELECT * FROM ops_config ORDER BY key").all(), rp.prepare("SELECT class, verify_probe, action, status, last_verdict, attempts FROM remediation_contracts ORDER BY class").all(), rp.prepare("SELECT fm_key FROM failure_modes ORDER BY 1").all(), rp.prepare("SELECT control, evidence FROM control_registry ORDER BY 1").all(), rp.prepare("SELECT COUNT(*) AS n FROM decision_log").get(), rp.prepare("SELECT name, sql FROM sqlite_master WHERE name IN ('v_human_action_decision', 'bak_20261026_v_human_action_decision') ORDER BY name").all(), rp.prepare("SELECT * FROM bak_20261026_v_human_action_decision").all()]);
  // the consumer has run once in between: the contracts hold a verdict that a replay must not reset
  rp.prepare("UPDATE remediation_contracts SET last_verdict = 'pass', attempts = 3 WHERE class IN ('issue-100459', 'issue-100454')").run();
  const s1 = snap();
  add(rp, Object.assign({}, IB_STEP, { slug: "rp-between" })); // a card filed between the two applications must not move the baseline
  const s1b = snap();
  rp.exec(sql);
  const s2 = snap();
  ok(JSON.stringify(rp.prepare("SELECT * FROM ops_config WHERE key = 'ib_held_since_card_id'").all()) === JSON.stringify(JSON.parse(s1)[0].filter((x) => x.key === "ib_held_since_card_id")), "a replay keeps the first baseline");
  ok(JSON.stringify(JSON.parse(s1b).slice(1)) === JSON.stringify(JSON.parse(s2).slice(1)) && JSON.stringify(JSON.parse(s1b)[0]) === JSON.stringify(JSON.parse(s2)[0]), "a replay changes nothing (contracts keep their verdicts, one failure mode, one decision, the first backup)");
}

// ---- the Rollback line, executed as written, restores the old objects and the old behaviour
{
  const rb = /^-- Rollback: (.*)$/m.exec(sql)[1];
  const x = newWorld();
  const oldView = q1(oldWorld(), "SELECT sql FROM sqlite_master WHERE name = 'v_human_action_decision'").sql;
  const oldDet = q1(oldWorld(), "SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-card-default-denies-decision'").verify_probe;
  for (const stmt of rb.split("; ")) x.exec(stmt);
  ok(norm(q1(x, "SELECT sql FROM sqlite_master WHERE name = 'v_human_action_decision'").sql) === norm(oldView), "after the Rollback line the view text is the old text (whitespace aside)");
  ok(q1(x, "SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-card-default-denies-decision'").verify_probe === oldDet, "the detector probe is the old probe");
  ok(q1(x, "SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-100459'").verify_probe === OLD_PROBE_100459 && q1(x, "SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-100454'").verify_probe === OLD_PROBE_100454, "the two issue probes are the old probes");
  ok(q1(x, "SELECT COUNT(*) AS n FROM remediation_contracts WHERE class = 'fm-ib-card-closed-at-birth'").n === 0 && q1(x, "SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'ib-card-closed-at-birth'").n === 0 && q1(x, "SELECT COUNT(*) AS n FROM ops_config WHERE key = 'ib_held_since_card_id'").n === 0, "the new rows and the baseline are gone");
  const k = add(x, Object.assign({}, IB_STEP, { slug: "rb-step" }));
  ok(closedAtBirth(x, k.id), "after the Rollback line an IDENTITY-BOUND card is closed on its default as before");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
