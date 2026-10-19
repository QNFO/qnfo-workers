// MASTODON-PROBE-GRAMMAR-1 offline suite: replays migrations/2026-10-19-mastodon-probe-grammar.sql on SQLite.
// Proves: the issue-2925 probe is restated in the qnfo-fleet-control external-https grammar (url, method, check, expected) and passes that runner's own parser rules (https, allowed host, GET,
// known check, expected present); the earlier consumer-grammar text is replaced and a contract already in the new grammar is left alone; the schedule is reset; the Rollback line restores the earlier text.
// Run: node migrations/mastodon-probe-grammar.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-mastodon-probe-grammar.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
const OLD = '{"url": "https://mstdn.science/api/v1/accounts/lookup?acct=QNFO", "status": 200, "contains": "\\"verified_at\\":\\"20"}';
const d = new DatabaseSync(":memory:");
d.exec("CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, verify_probe TEXT, verify_transport TEXT, last_verdict TEXT, attempts INTEGER DEFAULT 0, next_due_at TEXT)");
d.prepare("INSERT INTO remediation_contracts VALUES ('issue-2925', ?, 'external-https', 'probe-not-machine-executable', 3, NULL)").run(OLD);
d.prepare("INSERT INTO remediation_contracts VALUES ('issue-1', 'keep', 'd1-query', 'pass', 2, NULL)").run();
d.exec(sql);
const r = d.prepare("SELECT * FROM remediation_contracts WHERE class = 'issue-2925'").get();
const p = JSON.parse(r.verify_probe);
// the rules of rtHttpSpec in qnfo-fleet-control/worker.js
const RT_HTTP_HOSTS = ["raw.githubusercontent.com", "api.github.com", "github.com", "pypi.org", "doi.org", "api.openalex.org", "api.crossref.org", "api.datacite.org", "mstdn.science"];
const u = new URL(p.url);
ok(u.protocol === "https:" && RT_HTTP_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h)), "https and an allowed host", u.hostname);
ok(["GET", "HEAD"].includes(String(p.method || "GET").toUpperCase()) && /^(status|header:[A-Za-z0-9-]+|body-contains:.+|json:[A-Za-z0-9_.-]+)$/.test(p.check) && String(p.expected).trim() === "present", "GET, a known check, expected present", p);
ok(r.verify_transport === "external-https" && r.last_verdict === null && r.attempts === 0 && r.next_due_at !== null, "the verdict is cleared and the contract is due now", r);
ok(!("contains" in p) && !("status" in p), "none of the consumer-grammar keys remain");
ok(d.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-1'").get().verify_probe === "keep", "an unrelated contract is untouched");
d.prepare("UPDATE remediation_contracts SET attempts = 5 WHERE class = 'issue-2925'").run();
d.exec(sql);
ok(d.prepare("SELECT attempts FROM remediation_contracts WHERE class = 'issue-2925'").get().attempts === 5, "a second apply leaves a contract already in the new grammar alone");
d.exec(rollback);
ok(d.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-2925'").get().verify_probe === OLD, "Rollback restores the earlier text byte for byte");
console.log("mastodon-probe-grammar: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
