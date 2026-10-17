// Offline smoke test for migrations/2026-10-17-evolve-organ.sql.
// Proves it applies to an empty database with a process_contracts stub, seeds the expected targets,
// and is re-appliable without changing anything.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-17-evolve-organ.sql", import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE process_contracts (process TEXT PRIMARY KEY, owner TEXT, sla_min INTEGER,
  definition_of_done TEXT, paths_json TEXT);
  CREATE TABLE spof_registry (component TEXT PRIMARY KEY, critical_path TEXT NOT NULL, alternate_path TEXT,
  alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT);
  INSERT INTO process_contracts VALUES ('research-ground','qnfo-research-exec',120,'x','["a","b"]');
  INSERT INTO process_contracts VALUES ('deploy','qnfo-cloud-ops',120,'x','["a","b"]');`);

db.exec(sql);
const count = () => db.prepare("SELECT COUNT(*) AS n FROM evolve_targets").get().n;
const first = count();
const seeded = db.prepare("SELECT worker FROM evolve_targets WHERE kind='process' AND key='queue:research-head-stalled'").get();
const comp = db.prepare("SELECT worker FROM evolve_targets WHERE kind='component' AND key='GitHub Actions'").get();
db.exec(sql);
const second = count();

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
ok(first === 8, "seeds 8 targets on a fresh database (2 contracts + 3 queue + 3 spof)", first);
ok(seeded && seeded.worker === "qnfo-research-exec", "queue gap targets research-exec", seeded);
ok(comp && comp.worker === "qnfo-cloud-ops", "GitHub Actions targets cloud-ops", comp);
ok(second === first, "re-applying the file changes nothing", { first, second });

const probe = db.prepare("SELECT name FROM sqlite_master WHERE name IN ('evolve_filings','evolve_runs') ORDER BY name").all();
ok(probe.length === 2, "files and runs tables exist", probe);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
