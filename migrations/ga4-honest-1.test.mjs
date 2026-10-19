// GA4-HONEST-1 (agent_issues 2935): migrations/2026-10-19-ga4-honest-1.sql relabels GA4 rows of a property that carries no site host as quality
// unknown, says so on their ledger lines and gives issue-2935 a probe that measures the honest state. node:sqlite fixture, no network.
// Run: node migrations/ga4-honest-1.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "2026-10-19-ga4-honest-1.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.error("FAIL", m, d === undefined ? "" : JSON.stringify(d)); } };

function fixture(rows, events) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE reach_signals (date TEXT, source TEXT, channel TEXT, entity_type TEXT, entity_id TEXT, metric TEXT, value REAL, quality TEXT);
    CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
    CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, verify_probe TEXT, status TEXT, next_due_at TEXT, max_attempts INTEGER);
    INSERT INTO remediation_contracts (class, verify_probe, status) VALUES ('issue-2935', 'old', 'active');`);
  const ins = db.prepare("INSERT INTO reach_signals VALUES (?,?,?,?,?,?,?,?)");
  for (const r of rows) ins.run(r[0], "ga4", "web", r[1], r[2], r[3], r[4], r[5]);
  const ev = db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, status) VALUES (?, ?, 'ga4-ingest', ?, 'ok')");
  for (const e of events) ev.run(e[0], "2026-10-19T02:00:00Z", e[1]);
  return db;
}
const probeOf = (db) => db.prepare("SELECT verify_probe p FROM remediation_contracts WHERE class='issue-2935'").get().p;
const observed = (db) => db.prepare(probeOf(db)).get().observed;

// live shape: two days read from a property that carries only qnfo-publications.pages.dev
const live = () => fixture([
  ["2026-10-17", "host", "qnfo-publications.pages.dev", "screenPageViews", 1, "human"],
  ["2026-10-17", "source", "(direct)", "sessions", 1, "human"],
  ["2026-10-18", "host", "qnfo-publications.pages.dev", "screenPageViews", 2, "human"],
  ["2026-10-18", "source", "(direct)", "sessions", 1, "human"],
], [["ga4-ingest-2026-10-17", "GA4 ingest 2026-10-17: 6 rows"], ["ga4-ingest-2026-10-18", "GA4 ingest 2026-10-18: 6 rows (property discovery failed: accountSummaries 403; reading 486253526)"]]);

let db = live();
ok(db.prepare("SELECT COUNT(*) n FROM reach_signals WHERE quality='human'").get().n === 4, "sanity: the fixture holds human rows before the migration");
const old = db.prepare("SELECT verify_probe p FROM remediation_contracts").get().p;
ok(old === "old", "fixture contract starts with the placeholder probe");
db.exec(sql);
ok(db.prepare("SELECT COUNT(*) n FROM reach_signals WHERE quality='human'").get().n === 0, "every row of a property with no site host is relabelled unknown");
ok(db.prepare("SELECT COUNT(*) n FROM reach_signals WHERE quality='unknown'").get().n === 4, "the four rows are kept (nothing is deleted)");
const texts = db.prepare("SELECT text FROM cloud_ops_events ORDER BY id").all().map((r) => r.text);
ok(texts.every((t) => /quality unknown/.test(t)), "both ledger lines say quality unknown", texts);
ok(/refused|403/.test(texts[1]), "the original discovery warning is kept on the line", texts[1]);
ok(observed(db) === "ok", "the probe reads ok on the honest state", observed(db));
const c = db.prepare("SELECT status, max_attempts FROM remediation_contracts").get();
ok(c.status === "active" && c.max_attempts === 24, "the contract is active with 24 attempts", c);
ok(!/status\s*=\s*'(closed|resolved)'|FROM agent_issues/i.test(probeOf(db)), "the probe never reads the issue's own status");
db.exec(sql);
ok(db.prepare("SELECT text FROM cloud_ops_events WHERE id='ga4-ingest-2026-10-18'").get().text.split("quality unknown").length === 2, "a second apply does not append the reason twice");

// a human-quality row of a non-site host on the latest day keeps the probe pending
db = live(); db.exec(sql);
db.prepare("INSERT INTO reach_signals VALUES ('2026-10-19','ga4','web','host','other.example','screenPageViews',5,'human')").run();
ok(/^pending: GA4 stores a human-quality host row that is not a site host/.test(observed(db)), "a trusted non-site host is pending", observed(db));

// the property is fixed later: site host rows are human and the probe passes without any ledger wording
db = live(); db.exec(sql);
db.prepare("INSERT INTO reach_signals VALUES ('2026-10-19','ga4','web','host','qnfo.org','screenPageViews',900,'human')").run();
db.prepare("INSERT INTO reach_signals VALUES ('2026-10-19','ga4','web','host','ask.qwav.tech','screenPageViews',300,'human')").run();
ok(observed(db) === "ok", "site host rows with quality human pass", observed(db));

// unknown rows on a day whose ledger line does not say so stay pending (the claim must be on the record)
db = fixture([["2026-10-19", "host", "qnfo-publications.pages.dev", "screenPageViews", 2, "unknown"]], [["ga4-ingest-2026-10-19", "GA4 ingest 2026-10-19: 6 rows"]]);
db.exec(sql);
ok(/^pending: the latest GA4 day carries no site host/.test(observed(db)), "unknown rows without the ledger wording are pending", observed(db));

// no rows at all
db = fixture([], []); db.exec(sql);
ok(observed(db) === "pending: no GA4 host rows", "no GA4 rows is pending", observed(db));

console.log((fail ? "FAIL" : "PASS") + "  ga4-honest-1: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
