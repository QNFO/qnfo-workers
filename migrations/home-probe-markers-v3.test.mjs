// HOME-PROBE-MARKERS-V3-1 offline suite: the four contract rows are repointed at markers the live pages carry, and nothing else changes.
// Run: node migrations/home-probe-markers-v3.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "2026-11-04-home-probe-markers-v3.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, verify_probe TEXT, status TEXT)");
const ins = db.prepare("INSERT INTO remediation_contracts VALUES (?,?,?)");
const OLD = {
  "rt-page-fleet-queue": '{"url": "https://fleet.qnfo.org/", "status": 200, "contains": "<title>QNFO fleet status", "max_ms": 15000}',
  "fm-page-css-never-sent": '{"url": "https://fleet.qnfo.org/", "status": 200, "contains": ".fx-r{"}',
  "issue-1000784": '{"url": "https://fleet.qnfo.org/", "status": 200, "contains": "Fix it"}',
  "rt-page-qwav-home": '{"url": "https://qwav.org/", "status": 200, "contains": "QWAV Research Papers", "max_ms": 10000}',
  "rt-page-fleet-kpi": '{"url": "https://fleet.qnfo.org/kpi", "status": 200, "contains": "Fleet metrics", "max_ms": 15000}'
};
for (const [c, p] of Object.entries(OLD)) ins.run(c, p, "active");
db.exec(sql);
const get = (c) => JSON.parse(db.prepare("SELECT verify_probe p FROM remediation_contracts WHERE class = ?").get(c).p);

ok(get("rt-page-fleet-queue").contains === "Readers</a>" && get("rt-page-fleet-queue").url === "https://fleet.qnfo.org/", "the home probe uses a marker of the three-screen shell");
ok(get("fm-page-css-never-sent").contains === ".hero{border-radius" && get("fm-page-css-never-sent").url === "https://fleet.qnfo.org/", "the CSS probe uses the shell's inline CSS");
ok(get("issue-1000784").url === "https://fleet.qnfo.org/overview" && get("issue-1000784").contains === "Fix it", "the Fix it probe moved to the page that has the buttons");
ok(get("rt-page-qwav-home").contains === "benchmarked in joules per solution", "the qwav home marker is the rebranded text");
ok(db.prepare("SELECT verify_probe p FROM remediation_contracts WHERE class = 'rt-page-fleet-kpi'").get().p === OLD["rt-page-fleet-kpi"], "an unrelated contract is untouched");
ok(db.prepare("SELECT COUNT(*) n FROM remediation_contracts WHERE status = 'active'").get().n === 5, "no contract changed status or was removed");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: /m.test(sql), "the migration carries the runner header lines");
ok(!/\b(DELETE|DROP)\b/i.test(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "the migration deletes and drops nothing");
// every marker is valid JSON text in the probe and short enough to be a substring match
ok(Object.keys(OLD).every((c) => { try { return typeof get(c).contains === "string"; } catch (e) { return false; } }), "every probe is valid JSON with a string marker");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
