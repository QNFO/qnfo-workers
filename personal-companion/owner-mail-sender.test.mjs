// personal-companion 1.37.2 DOMAIN-PLANE-OWNER-MAIL-1 suite (agent_issues 100229, charter pillar: personal).
// Proves: an owner notice goes out from companion@q08.org first; when the SEND_EMAIL binding refuses that sender the notice is
// sent from rowan.quni@qnfo.org; when both are refused the error is returned (not swallowed); subscriber mail (sendOne) keeps
// the qnfo.org sender; worker.js names the q08.org sender first.
// Run: node personal-companion/owner-mail-sender.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { importWorker } from "./_harness-import-worker.mjs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const mod = await importWorker(() => (src.replace(IMPORT, "var WorkflowEntrypoint = class {};")), new URL("./", import.meta.url));
const { sendOwnerNotice } = mod;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const wrap = (db) => ({ prepare(sql) { const mk = (args) => ({
  bind: (...a) => mk(a),
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  first: async () => db.prepare(sql).get(...args) || null,
  all: async () => ({ results: db.prepare(sql).all(...args) }) }); return mk([]); } });
function setup(sendImpl) {
  const p = new DatabaseSync(":memory:"), a = new DatabaseSync(":memory:"), sent = [];
  p.exec("CREATE TABLE wellbeing_config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT); INSERT INTO wellbeing_config VALUES ('email_mode','\"all\"','x')");
  a.exec("CREATE TABLE email_suppression (email TEXT PRIMARY KEY, source TEXT); CREATE TABLE calendar_meta (k TEXT PRIMARY KEY, v TEXT); CREATE TABLE contact_ledger (email TEXT, status TEXT)");
  return { sent, env: { PERSONAL: wrap(p), AUDIT: wrap(a), SEND_EMAIL: { send: sendImpl ? (m) => sendImpl(m, sent) : async (m) => { sent.push(m); } } } };
}
const fromOf = (m) => typeof m.from === "string" ? m.from : m.from.email;

let T = setup();
let r = await sendOwnerNotice(T.env, "s", "t", "brief");
ok(r.ok && T.sent.length === 1 && fromOf(T.sent[0]) === "companion@q08.org" && r.from === "companion@q08.org", "owner notice leaves from companion@q08.org first (" + JSON.stringify(r) + ")");
ok(T.sent[0].to === "rwnquni@outlook.com", "to the owner only");

T = setup(async (m, sent) => { if (fromOf(m).endsWith("@q08.org")) throw new Error("sender domain not verified"); sent.push(m); });
r = await sendOwnerNotice(T.env, "s", "t", "brief");
ok(r.ok && T.sent.length === 1 && fromOf(T.sent[0]) === "rowan.quni@qnfo.org" && r.from === "rowan.quni@qnfo.org", "a refused q08.org sender falls back to rowan.quni@qnfo.org (" + JSON.stringify(r) + ")");

T = setup(async () => { throw new Error("both refused"); });
r = await sendOwnerNotice(T.env, "s", "t", "brief");
ok(!r.ok && /both refused/.test(r.error), "when both senders are refused the error comes back");

// sendOne (subscriber confirmation and broadcast mail) is not exported; its sender is pinned from the source text.
const so = src.slice(src.indexOf("async function sendOne("), src.indexOf("__name(sendOne"));
ok(so.includes('from: "rowan.quni@qnfo.org"') && !so.includes("q08.org"), "subscriber mail keeps its qnfo.org sender");

ok(/OWNER_NOTICE_FROM = \[\{ email: "companion@q08\.org"/.test(src), "worker.js names companion@q08.org as the first owner-notice sender");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
