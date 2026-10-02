// ERRATA-HUB-CRONS-UNDECLARED-1 + ERRATA-PUBLISH-GATE-1 offline suite (#1747): drives the real scheduled() and fetch handlers
// of errata-hub/worker.js against in-memory SQLite D1s, a stub AI, a recording SEND_EMAIL and a recording fetch, and proves:
// the :00 watch tick triages email into errata_queue and writes tick:errata-watch; the :15 respond tick drafts a correction
// that discloses AI drafting, mails only the owner's receipt address and never touches an internal-open item; the :30 publish
// tick, with the pipeline_flags row absent, '0' or anything but '1', makes no Zenodo call, no store re-point and no mail, and
// records the would-publish action; the token-protected live route is forced dry the same way; with the flag at '1' the
// publish path is reached; a failed tick keeps the previous last_ok; /health states the gate.
// Run: node errata-hub/errata-crons.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function d1(db) {
  return {
    prepare(sql) {
      let args = [];
      const self = {
        bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
      };
      return self;
    }
  };
}

const audit = new DatabaseSync(":memory:");
audit.exec(`CREATE TABLE emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT, body_text TEXT, classification TEXT DEFAULT 'general', received_at TEXT DEFAULT (datetime('now')));
CREATE TABLE errata_watch (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE errata_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, email_id INTEGER UNIQUE, source TEXT NOT NULL DEFAULT 'inbound-email', sender TEXT, subject TEXT, paper_doi TEXT, claim TEXT, confidence REAL, status TEXT DEFAULT 'detected', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE errata_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, queue_id INTEGER NOT NULL, email_id INTEGER, paper_doi TEXT, slug TEXT, version_from TEXT, version_to TEXT, risk TEXT DEFAULT 'low', clarification TEXT, acknowledgement TEXT, changelog TEXT, corrected_md TEXT, status TEXT DEFAULT 'drafted', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE email_suppression (email TEXT PRIMARY KEY, reason TEXT, source TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE pipeline_flags (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT);`);
const papers = new DatabaseSync(":memory:");
papers.exec("CREATE TABLE papers (slug TEXT PRIMARY KEY, title TEXT, version TEXT, doi TEXT, zenodo_doi TEXT, body_md TEXT, r2_path TEXT, r2_key TEXT, updated_at TEXT)");
const graph = new DatabaseSync(":memory:");
graph.exec("CREATE TABLE nodes (id TEXT PRIMARY KEY, properties TEXT, updated_at TEXT)");

const SENDER = "author@example.edu";
const DOI = "10.5281/zenodo.1000001";
const ANCHOR = "Equation (3) is taken from Doe et al.";
const BODY = "# A paper\n\n**Version:** 1.0 (this version).\n\n" + ANCHOR + " It follows.\n\n## References\n\n1. Doe.\n";
papers.prepare("INSERT INTO papers (slug, title, version, doi, zenodo_doi, body_md, r2_path) VALUES ('a-paper', 'A paper', '1.0', ?1, ?1, ?2, 'papers/a-paper')").run(DOI, BODY);
graph.prepare("INSERT INTO nodes (id, properties) VALUES ('paper:a-paper', '{}')").run();
audit.prepare("INSERT INTO errata_watch (key, value) VALUES ('last_email_id', '0')").run();
audit.prepare("INSERT INTO emails (message_id, sender, recipient, subject, body_text, classification) VALUES ('m1', ?1, 'qnfo@qnfo.org', 'Your paper ' || ?2, 'Equation (3) is nowhere mentioned in our work. Please correct.', 'personal')").run(SENDER, DOI);
audit.prepare("INSERT INTO emails (message_id, sender, recipient, subject, body_text, classification) VALUES ('m2', 'friend@example.org', 'qnfo@qnfo.org', 'Coffee?', 'Thanks for sharing, I will take a look.', 'personal-unverified')").run();
audit.prepare("INSERT INTO emails (message_id, sender, recipient, subject, body_text, classification) VALUES ('m3', 'news@example.com', 'qnfo@qnfo.org', 'Newsletter', 'Please correct your subscription.', 'general')").run();
// An internal errata item: respond and publish must never act on it.
audit.prepare("INSERT INTO errata_queue (email_id, source, sender, subject, claim, confidence, status) VALUES (NULL, 'internal_audit', 'internal_audit', 'err-x', 'internal claim', 1.0, 'internal-open')").run();
// A correction published earlier: the :30 tick still verifies it while the gate is off.
audit.prepare("INSERT INTO errata_actions (queue_id, paper_doi, slug, version_from, version_to, status, updated_at) VALUES (99, '10.5281/zenodo.900', 'old-paper', '0.4', '0.5', 'published', datetime('now', '-3 days'))").run();
papers.prepare("INSERT INTO papers (slug, version, doi, zenodo_doi, body_md) VALUES ('old-paper', '0.5', '10.5281/zenodo.901', '10.5281/zenodo.901', 'x')").run();

const aiCalls = [];
const AI = {
  async run(model, input) {
    const p = input.messages[0].content;
    aiCalls.push(p.slice(0, 40));
    if (p.includes("errata-detection")) {
      const yes = (p.split("\nBody: ")[1] || "").includes("nowhere mentioned");
      return { response: JSON.stringify({ errata: yes, paper_doi: yes ? DOI : null, claim: yes ? "Equation (3) is not in Doe et al." : null, confidence: yes ? 0.9 : 0.1 }) };
    }
    return { response: JSON.stringify({ risk: "low", clarification: "Equation (3) is QNFO's own reformulation, not a result of Doe et al.", anchor: ANCHOR, position: "after", acknowledgement: "We thank the correspondent for the correction.", changelog: "Attribution of Equation (3) corrected.", version: "1.1" }) };
  }
};
const sends = [];
const SEND_EMAIL = { async send(m) { sends.push(m); } };
const mirrorPuts = [];
const MIRROR = { async put(k) { mirrorPuts.push(k); } };
const fetches = [];
globalThis.fetch = async (url, init) => {
  const u = String(url && url.url || url);
  fetches.push({ url: u, method: (init && init.method) || "GET" });
  if (u.startsWith("https://doi.org/api/handles/")) return new Response(JSON.stringify({ responseCode: 1 }), { status: 200 });
  if (u.startsWith("https://zenodo.org/api/deposit/")) return new Response("stub: deposit refused in test", { status: 500 });
  return new Response("{}", { status: 404 });
};
const env = { AI, SEND_EMAIL, MIRROR, ERRATA_TOKEN: "t0k", ZENODO_TOKEN: "test-zenodo", WATCH_DB: d1(audit), AUDIT_DB: d1(audit), PAPERS_DB: d1(papers), GRAPH_DB: d1(graph) };
const ctx = { waitUntil() {}, passThroughOnException() {} };

const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const quiet = async (fn) => { const l = console.log, e = console.error; console.log = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.error = e; } };
// CRON-SINGLE-TRIGGER-1: the worker holds one hourly trigger; tickEntry runs one former cron's member, as the tick does.
const tick = async (cron) => quiet(() => worker.scheduled({ cron, scheduledTime: Date.now(), tickEntry: true }, env, ctx));
const tickRow = (m) => { const r = audit.prepare("SELECT value FROM errata_watch WHERE key = ?").get("tick:" + m); return r ? JSON.parse(r.value) : null; };
const isZenodoDeposit = (u) => { try { const x = new URL(u); return x.hostname === "zenodo.org" && x.pathname.startsWith("/api/deposit"); } catch (e) { return false; } };
const deposits = () => fetches.filter((f) => isZenodoDeposit(f.url));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// :00 watch
await tick("0 * * * *");
const q = audit.prepare("SELECT * FROM errata_queue WHERE status = 'detected'").all();
ok(q.length === 1 && q[0].sender === SENDER && q[0].paper_doi === DOI, "the watch tick files the errata email as detected (" + q.length + ")");
ok(aiCalls.length === 2, "only personal email is classified (" + aiCalls.length + " AI calls)");
let w = tickRow("errata-watch");
ok(w && w.ok === true && w.last_ok === w.ts && w.scanned === 2 && w.detected === 1, "tick:errata-watch records the run");
ok(audit.prepare("SELECT value FROM errata_watch WHERE key = 'last_email_id'").get().value === "2", "the email cursor advances");
ok(sends.length === 0 && fetches.length === 0, "the watch tick sends nothing and calls nothing outside");

// :15 respond
await tick("15 * * * *");
const acts = audit.prepare("SELECT * FROM errata_actions WHERE status = 'drafted'").all();
ok(acts.length === 1 && acts[0].risk === "low" && acts[0].version_to === "1.1", "the respond tick drafts one correction");
ok(acts[0].corrected_md.includes("drafted with AI assistance (@cf/") && acts[0].corrected_md.includes("Equation (3) is QNFO's own reformulation"), "the corrected text discloses AI drafting");
ok(audit.prepare("SELECT status FROM errata_queue WHERE status = 'internal-open'").all().length === 1, "the internal-open item is untouched");
ok(sends.length === 1 && sends.every((s) => s.to !== SENDER && !/@example\.edu$/i.test(String(s.to).trim())), "the only mail is the owner receipt, never the errata sender");
ok(/pipeline_flags\.errata_publish_enabled/.test(sends[0].text) && /AI model/.test(sends[0].text), "the receipt names the AI drafting and the publish gate");
ok(tickRow("errata-respond").ok === true && tickRow("errata-respond").processed === 1, "tick:errata-respond records the run");
const sendsBeforePublish = sends.length;

// :30 publish, gate off three ways
let verified = 0;
for (const flag of [null, "0", "yes"]) {
  audit.exec("DELETE FROM pipeline_flags");
  if (flag != null) audit.prepare("INSERT INTO pipeline_flags (key, value) VALUES ('errata_publish_enabled', ?)").run(flag);
  await tick("30 * * * *");
  const p = tickRow("errata-publish");
  ok(p && p.ok === true && p.dry === true && p.gate.enabled === false && p.gate.value === flag, "flag " + JSON.stringify(flag) + ": the publish tick runs dry");
  ok(p.would_publish.length === 1 && p.would_publish[0].action_id === acts[0].id && p.published.length === 0, "flag " + JSON.stringify(flag) + ": the tick lists the would-publish action");
  verified += p.verify.verified;
}
ok(deposits().length === 0, "gate off: no Zenodo deposit call (" + deposits().length + ")");
ok(audit.prepare("SELECT status FROM errata_actions WHERE id = ?").get(acts[0].id).status === "drafted", "gate off: the draft stays drafted");
ok(papers.prepare("SELECT version, doi FROM papers WHERE slug = 'a-paper'").get().version === "1.0" && mirrorPuts.length === 0 && graph.prepare("SELECT properties FROM nodes").get().properties === "{}", "gate off: papers, KG and R2 are untouched");
ok(sends.length === sendsBeforePublish, "gate off: the publish tick sends no mail");
ok(audit.prepare("SELECT status FROM errata_actions WHERE slug = 'old-paper'").get().status === "verified" && verified === 1, "gate off: the DOI check of an earlier publication still runs");

// The token-protected manual route cannot bypass the gate.
audit.exec("DELETE FROM pipeline_flags");
const man = await quiet(async () => (await worker.fetch(new Request("https://errata-hub.example/errata-publish/run/publish?mode=live", { headers: { "X-Erratta-Token": "t0k" } }), env, ctx)).json());
ok(man.dry === true && man.gate.enabled === false && deposits().length === 0, "a manual mode=live run is forced dry while the gate is off");

// Gate on: the publish path is reached (the stub refuses the deposit, so the action ends in error).
audit.prepare("INSERT INTO pipeline_flags (key, value) VALUES ('errata_publish_enabled', '1')").run();
await tick("30 * * * *");
const p1 = tickRow("errata-publish");
ok(p1.dry === false && p1.gate.enabled === true && deposits().length === 1 && /actions\/newversion/.test(deposits()[0].url), "flag '1': errata-publish calls Zenodo");
ok(audit.prepare("SELECT status FROM errata_actions WHERE id = ?").get(acts[0].id).status === "error" && p1.errors.length === 1, "flag '1': a refused deposit marks the action error");
audit.exec("DELETE FROM pipeline_flags");

// A failed tick keeps the previous last_ok.
const lastOk = tickRow("errata-watch").last_ok;
audit.exec("ALTER TABLE emails RENAME TO emails_gone");
await tick("0 * * * *");
w = tickRow("errata-watch");
ok(w.ok === false && /emails/.test(w.error) && w.last_ok === lastOk, "a failed tick records the error and keeps last_ok");
audit.exec("ALTER TABLE emails_gone RENAME TO emails");

// /health states the crons and the gate.
const h = await (await worker.fetch(new Request("https://errata-hub.example/health"), env, ctx)).json();
const lim = h.limitations.join(" | ");
ok(/pipeline_flags\.errata_publish_enabled/.test(lim) && /run hourly/.test(lim) && !/no cron is declared/.test(lim), "/health states the hourly crons and the publish gate");

// CRON-SINGLE-TRIGGER-1: the real hourly tick (no tickEntry) runs all three members: watch, then respond, then publish.
audit.exec("DELETE FROM errata_watch WHERE key LIKE 'tick:%'");
await quiet(() => worker.scheduled({ cron: "0 * * * *", scheduledTime: Date.UTC(2026, 9, 2, 12, 0) }, env, ctx));
const tr = ["errata-watch", "errata-respond", "errata-publish"].map(tickRow);
ok(tr.every((r) => r && r.ts) && tr[0].ts <= tr[1].ts && tr[1].ts <= tr[2].ts, "one hourly tick runs watch, respond and publish in that order (" + tr.map((r) => r && r.ts).join(" <= ") + ")");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
