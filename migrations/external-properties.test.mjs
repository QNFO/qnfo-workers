// EXTERNAL-PROPERTIES-1 offline suite: runs migrations/2026-10-14-13-external-properties.sql on SQLite. Proves: v_content_stage_summary
// lists q08.org and reading.q08.org from content_external_items next to the properties of v_content_pipeline, with the same columns and
// counts; the old view is backed up; an in-flight external item past its stage SLA is counted; re-applying adds no second decision row.
// Run: node migrations/external-properties.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-14-13-external-properties.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE content_stages (stage TEXT PRIMARY KEY, ord INTEGER, label TEXT, definition TEXT, exit_gate TEXT, enforced_by TEXT, sla_min INTEGER, terminal INTEGER);
INSERT INTO content_stages VALUES ('queued', 3, 'Queued', 'd', 'g', 'w', 120, 0), ('draft', 5, 'Draft', 'd', 'g', 'w', 120, 0), ('published', 9, 'Published', 'd', 'g', 'w', NULL, 1), ('rejected', 99, 'Rejected', 'd', 'g', 'w', NULL, 1);
CREATE TABLE pipeline_rows (property TEXT, flow TEXT, item_id TEXT, title TEXT, raw_status TEXT, stage TEXT, state TEXT, since TEXT, age_h REAL, sla_min INTEGER, over_sla INTEGER);
CREATE VIEW v_content_pipeline AS SELECT * FROM pipeline_rows;
CREATE VIEW v_content_stage_summary AS SELECT property, stage, COUNT(*) AS in_flight FROM v_content_pipeline GROUP BY property, stage;
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
const now = new Date().toISOString();
db.prepare("INSERT INTO pipeline_rows VALUES ('papers.qnfo.org', 'research', '1', 't', 'queued', 'queued', 'waiting', ?, 1.0, 120, 0)").run(now);
db.prepare("INSERT INTO pipeline_rows VALUES ('papers.qnfo.org', 'research', '2', 't', 'published', 'published', 'done', ?, 1.0, NULL, 0)").run(now);
db.exec(sql);
const ins = db.prepare("INSERT INTO content_external_items (property, flow, item_id, title, raw_status, stage, state, since) VALUES (?, ?, ?, 't', 'x', ?, ?, ?)");
ins.run("q08.org", "essay", "run-1", "published", "done", now);
ins.run("q08.org", "essay", "run-2", "rejected", "rejected", now);
ins.run("q08.org", "essay", "run-3", "rejected", "rejected", now);
ins.run("reading.q08.org", "essay", "cr-1", "rejected", "rejected", now);
ins.run("reading.q08.org", "essay", "cr-2", "draft", "active", new Date(Date.now() - 200 * 6e4).toISOString());
const rows = db.prepare("SELECT * FROM v_content_stage_summary ORDER BY property, stage").all();
const props = [...new Set(rows.map((r) => r.property))];
ok(props.join(",") === "papers.qnfo.org,q08.org,reading.q08.org", "By property lists the content-table properties and q08.org and reading.q08.org", props);
const q = (p, s) => rows.find((r) => r.property === p && r.stage === s) || {};
ok(q("q08.org", "published").finished_all === 1 && q("q08.org", "rejected").finished_all === 2 && q("q08.org", "rejected").finished_24h === 2, "q08.org published and rejected counts", rows.filter((r) => r.property === "q08.org"));
ok(q("reading.q08.org", "draft").in_flight === 1 && q("reading.q08.org", "draft").active === 1 && q("reading.q08.org", "draft").over_sla === 1 && q("reading.q08.org", "draft").oldest_age_h >= 3.3, "an in-flight external item is counted, with its age and its stage SLA", q("reading.q08.org", "draft"));
ok(q("papers.qnfo.org", "queued").in_flight === 1 && q("papers.qnfo.org", "published").finished_all === 1 && q("papers.qnfo.org", "queued").label === "Queued", "the content-table properties keep their counts and labels");
ok(Object.keys(rows[0]).join(",") === "property,stage,ord,label,sla_min,enforced_by,in_flight,waiting,active,held,blocked,parked,over_sla,oldest_age_h,finished_24h,finished_7d,finished_all", "the summary keeps the columns the dashboard reads", Object.keys(rows[0]));
ok(db.prepare("SELECT COUNT(*) n FROM bak_20261014_external_properties WHERE name = 'v_content_stage_summary'").get().n === 1, "the old view is backed up");
db.exec(sql);
ok(db.prepare("SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'EXTERNAL-PROPERTIES-1:') = 1").get().n === 1 && db.prepare("SELECT COUNT(*) n FROM content_external_items").get().n === 5, "re-applying adds no second decision row and keeps the mirrored rows");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
