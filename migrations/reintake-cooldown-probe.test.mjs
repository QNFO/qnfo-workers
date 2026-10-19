// REINTAKE-PROBE-MARKER-1 offline suite: runs migrations/2026-10-19-reintake-cooldown-probe.sql on SQLite and checks the new code-read
// marker against qnfo-code-orchestrator/worker.js on this checkout: it occurs exactly once, and the old marker does not occur.
// Run: node migrations/reintake-cooldown-probe.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-reintake-cooldown-probe.sql", import.meta.url), "utf8");
const src = readFileSync(new URL("../qnfo-code-orchestrator/worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, verify_probe TEXT, next_due_at TEXT)");
const old = '{"paths": ["qnfo-code-orchestrator/worker.js"], "contains": "const INTAKE_RETRY_COOLDOWN_MIN = 120;"}';
db.prepare("INSERT INTO remediation_contracts VALUES (?,?,?)").run("fm-reintake-cooldown-over-120m", old, "2026-10-19 07:00:00");
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
db.exec(body);
const p = JSON.parse(db.prepare("SELECT verify_probe FROM remediation_contracts").get().verify_probe);
ok(src.split(p.contains).length - 1 === 1, "the new marker occurs exactly once in the orchestrator", p.contains);
ok(src.indexOf(JSON.parse(old).contains) < 0, "the old marker is absent (why the detector read recurring)");
const m = /const INTAKE_RETRY_COOLDOWN_MIN = (\d+);/.exec(src);
ok(m && Number(m[1]) <= 120, "the cooldown it pins is within the 120-minute SLA", m && m[1]);
db.exec(/^-- Rollback: (.+)$/m.exec(sql)[1]);
ok(db.prepare("SELECT verify_probe FROM remediation_contracts").get().verify_probe === old, "the Rollback header restores the old probe");
console.log("reintake-cooldown-probe: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
