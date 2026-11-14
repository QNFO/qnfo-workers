// ORG-OUTREACH-1: the executor, run for real. Loads the generated block into a sandbox with the worker globals it needs, an in-memory SQLite behind a D1-shaped
// prepare/bind/first/all/run, and a recording SEND_EMAIL. Proves: draft is the default and sends nothing; drafts leave the queue; suppression and prior contact keep a
// target out; live needs mode, kill switch and postal address; a live send writes outreach_log and contact_ledger (so the shared cap and the first lane see it);
// the caps hold; a later opt-out closes the log row and the target.
// Run: node --no-warnings qnfo-cloud-ops/org-outreach-job.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildBlock } from "../scripts/inline-org-outreach.mjs";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };

function d1(db) {
  const wrap = (sql) => { let args = []; const o = {
    bind: (...a) => { args = a; return o; },
    first: async () => db.prepare(sql).get(...args) || null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; } }; return o; };
  return { prepare: wrap };
}
function setup(cfg = {}, kill = "1") {
  const audit = new DatabaseSync(":memory:"), outreach = new DatabaseSync(":memory:");
  audit.exec(`CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
    CREATE TABLE email_suppression (email TEXT); CREATE TABLE contact_ledger (email TEXT PRIMARY KEY, name TEXT, first_contact TEXT, last_contact TEXT, contact_count INTEGER, status TEXT, suppress INTEGER);
    CREATE TABLE outreach_log (id INTEGER PRIMARY KEY, email TEXT, subject TEXT, message_id TEXT, sent_at TEXT, status TEXT);`);
  audit.exec(readFileSync(new URL("../migrations/2026-11-14-org-outreach.sql", import.meta.url), "utf8"));
  for (const [k, v] of Object.entries(cfg)) audit.prepare("UPDATE ops_config SET value = ? WHERE key = ?").run(v, k);
  outreach.exec("CREATE TABLE pipeline_state (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE contacts (email TEXT, suppress INTEGER); CREATE TABLE sends (status TEXT, sent_at TEXT, contact_id INTEGER, kind TEXT);");
  outreach.prepare("INSERT INTO pipeline_state VALUES ('external_sends_enabled', ?)").run(kill);
  const mk = (i, seg, dom) => audit.prepare("INSERT INTO org_targets (org, email, segment, fit, fit_note, source_url, status) VALUES (?,?,?,?,?,?, 'queued')")
    .run("Org " + i, "info@" + dom, seg, 0.9 - i / 100, "your published mission is oversight of autonomous AI systems in deployment", "https://" + dom + "/about");
  mk(1, "ai-lab", "alpha.org"); mk(2, "funder", "beta.org"); mk(3, "third-sector", "gamma.org"); mk(4, "ai-firm", "delta.org");
  const sent = [];
  const env = { AUDIT: d1(audit), OUTREACH: d1(outreach), SEND_EMAIL: { send: async (m) => { sent.push(m); return { messageId: "m" + sent.length }; } } };
  const events = [];
  const ctx = vm.createContext({ console, __name: (f) => f, WORKER_NAME: "t", OUTREACH_ACTIVATION_AT: 0, OUTREACH_FROM: "qnfo@example.test", OUTREACH_SHARED_DAILY_CAP: 8, OUTREACH_SHARED_DOMAIN_CAP: 3,
    rndB36: () => "x", recordEvent: async (...a) => { events.push(a); }, outreachSendEvidence: () => ({}),
    outreachSuppressed: async (e, email) => !!(audit.prepare("SELECT 1 FROM email_suppression WHERE lower(email)=?").get(String(email).toLowerCase())),
    outreachSharedCount: async (e, day, email) => { const a = audit.prepare("SELECT COUNT(*) n FROM outreach_log WHERE sent_at LIKE ?").get(day + "%"); return { n: Number(a.n), d: 0 }; } });
  vm.runInContext(buildBlock(new URL("../", import.meta.url)).replace(/^\/\/ ----.*$/gm, "") + "\n;globalThis.jobOrgOutreach = jobOrgOutreach;", ctx);
  return { audit, env, sent, run: () => ctx.jobOrgOutreach(env) };
}

{ // default: draft, nothing sent
  const s = setup();
  const r = await s.run();
  ok(r.status === "ok" && r.notes.mode === "draft", "default mode is draft", r);
  ok(s.sent.length === 0, "draft sends nothing");
  ok(r.notes.drafted === 3 && s.audit.prepare("SELECT COUNT(*) n FROM org_outreach_log WHERE mode='draft'").get().n === 3, "drafts are the daily lane cap of 3", r.notes);
  ok(s.audit.prepare("SELECT COUNT(*) n FROM org_targets WHERE status='drafted'").get().n === 3, "drafted targets leave the queue");
  const r2 = await s.run();
  ok(r2.notes.drafted === 1, "a second run drafts the remaining target only", r2.notes);
}
{ // off
  const r = await setup({ org_outreach_mode: "off" }).run();
  ok(r.status === "gated" && r.notes.mode === "off", "off is gated", r);
}
{ // live without a postal address degrades to draft
  const s = setup({ org_outreach_mode: "live" });
  const r = await s.run();
  ok(r.notes.mode === "draft" && s.sent.length === 0, "live without a postal address stays draft", r.notes);
}
{ // live with the kill switch off degrades to draft
  const s = setup({ org_outreach_mode: "live", org_outreach_postal: "1 Example Street" }, "0");
  const r = await s.run();
  ok(r.notes.mode === "draft" && s.sent.length === 0, "live with the kill switch off stays draft", r.notes);
}
{ // live: sends, logs to both ledgers, honours suppression and prior contact
  const s = setup({ org_outreach_mode: "live", org_outreach_postal: "1 Example Street" });
  s.audit.prepare("INSERT INTO email_suppression VALUES ('info@alpha.org')").run();
  s.audit.prepare("INSERT INTO contact_ledger (email) VALUES ('info@beta.org')").run();
  const r = await s.run();
  ok(r.notes.mode === "live" && r.notes.sent === 2, "live sends the two eligible targets", r.notes);
  ok(s.sent.length === 2 && s.sent.every((m) => m.text.includes("1 Example Street") && m.text.includes("reply “stop”")), "sent mail carries the postal address and opt-out");
  ok(!s.sent.some((m) => /alpha|beta/.test(m.to)), "suppressed and already-contacted addresses are not mailed", s.sent.map((m) => m.to));
  ok(s.audit.prepare("SELECT COUNT(*) n FROM outreach_log").get().n === 2 && s.audit.prepare("SELECT COUNT(*) n FROM contact_ledger").get().n === 3, "live sends are written to outreach_log and contact_ledger");
  s.audit.prepare("INSERT INTO email_suppression VALUES ('info@gamma.org')").run();
  const r2 = await s.run();
  ok(r2.notes.stop_synced === 1, "a later opt-out closes its log row", r2.notes);
  ok(s.audit.prepare("SELECT reply_kind FROM org_outreach_log WHERE email='info@gamma.org'").get().reply_kind === "stop", "the log row reads stop");
}
{ // shared cap
  const s = setup({ org_outreach_mode: "live", org_outreach_postal: "1 Example Street" });
  for (let i = 0; i < 8; i++) s.audit.prepare("INSERT INTO outreach_log (email, subject, sent_at, status) VALUES (?, 's', datetime('now'), 'sent')").run("x" + i + "@other.org");
  const r = await s.run();
  ok(s.sent.length === 0 && r.notes.picked === 0, "the shared 8/day cap stops this lane", r.notes);
}

console.log("org-outreach-job: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
