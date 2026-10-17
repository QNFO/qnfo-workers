// EXTERNAL-PROPERTIES-1 offline suite (personal-companion 1.28.0, charter pillar: personal).
// Proves: mirrorPipeline copies finished compose attempts (ok -> published, rejected -> rejected) of the last 7 days from the companion's
// run log into qnfo-audit.content_external_items with property reading.q08.org, public fields only (the topic title without its wiki:
// prefix, the stage and the first part of the reason), new rows only, steward and stage rows skipped; the hourly tick calls it.
// Run: node personal-companion/pipeline-mirror.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { importWorker } from "./_harness-import-worker.mjs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await importWorker(() => (src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()), new URL("./", import.meta.url));
const V = mod.__verify;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };
function d1(db) {
  const stmt = (sql, args) => ({ bind: (...a) => stmt(sql, a), first: async () => db.prepare(sql).get(...(args || [])) || null, all: async () => ({ results: db.prepare(sql).all(...(args || [])) }), run: async () => db.prepare(sql).run(...(args || [])) });
  return { prepare: (sql) => stmt(sql, []), batch: async (list) => { for (const s of list) await s.run(); return []; } };
}
const audit = new DatabaseSync(":memory:"), personal = new DatabaseSync(":memory:");
audit.exec("CREATE TABLE content_external_items (property TEXT NOT NULL, flow TEXT NOT NULL, item_id TEXT NOT NULL, title TEXT, raw_status TEXT, stage TEXT NOT NULL, state TEXT NOT NULL, since TEXT NOT NULL, updated_at TEXT, PRIMARY KEY (property, item_id))");
personal.exec("CREATE TABLE companion_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_at TEXT, form TEXT, model TEXT, topic TEXT, status TEXT, detail TEXT, ms INTEGER)");
const at = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString();
const ins = personal.prepare("INSERT INTO companion_runs (run_at, form, model, topic, status, detail, ms) VALUES (?, ?, 'm', ?, ?, ?, 1)");
ins.run(at(60 * 24 * 8), "essay", "wiki:Old", "rejected", "critique grounding=0 :: old");
ins.run(at(120), "essay", "wiki:Second Opium War", "stage", "compose attempt 1");
ins.run(at(118), "essay", "wiki:Second Opium War", "rejected", "critique grounding=0 :: The invented sentence ...");
ins.run(at(110), "essay", "wiki:Second Opium War", "failed", "no piece survived the gate");
ins.run(at(100), "steward", "steward", "alert", "stall: no successful piece");
ins.run(at(60), "notes", "wiki:Kyoto Protocol", "rejected", "fact-check factcheck: FACT: ...");
ins.run(at(10), "essay", "wiki:1950 United Kingdom general election", "ok", "1950-uk-general-election-x");
const env = { AUDIT: d1(audit), PERSONAL: d1(personal) };
let r = await V.mirrorPipeline(env);
const rows = audit.prepare("SELECT * FROM content_external_items ORDER BY item_id").all();
ok(r.ok === true && r.mirrored === 3 && rows.length === 3, "three finished attempts of the last 7 days are mirrored (stage, failed-run, steward and 8-day-old rows are not)", { r, rows });
ok(rows.every((x) => x.property === "reading.q08.org" && /^cr-\d+$/.test(x.item_id)), "property reading.q08.org, ids from the run log");
const pub = rows.find((x) => x.stage === "published");
ok(pub && pub.state === "done" && pub.title === "1950 United Kingdom general election" && pub.flow === "essay", "ok -> published/done with the topic title", pub);
ok(rows.filter((x) => x.stage === "rejected" && x.state === "rejected").length === 2 && rows.some((x) => x.flow === "notes"), "rejected -> rejected; the form is the flow");
ok(/^rejected: critique grounding=0/.test(rows.find((x) => x.title === "Second Opium War").raw_status), "the reason's first part is kept");
ins.run(at(1), "essay", "wiki:New", "rejected", "critique argument=3 :: x");
r = await V.mirrorPipeline(env);
ok(r.mirrored === 1 && audit.prepare("SELECT COUNT(*) n FROM content_external_items").get().n === 4, "the next tick mirrors only the new attempt", r);
ok(/await steward\(env\);\n        await mirrorPipeline\(env\);/.test(src), "the hourly tick mirrors after the steward");
ok(/var PIPE_SELECT = "SELECT id, run_at, form, topic, status, detail FROM companion_runs WHERE id > \?1 AND run_at >= \?2 AND status IN \('ok', 'rejected'\) AND form <> 'steward' ORDER BY id LIMIT \?3";/.test(src), "only finished attempts are read from the run log");
const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 1 || (ver[0] === 1 && ver[1] >= 28)), "VERSION is at least 1.28.0", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
