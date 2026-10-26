// JOURNEY-CLOSE-CONTRACT-AWARE-1 + EVAPI-5XX-RETRY-1 offline suite: replays migrations/2026-10-26-journey-close-contract-aware.sql on SQLite.
// Proves: two open issues are filed, each with one code-task, one code-anchor and one code-probe line the code loop and the probe consumer read; a second apply adds nothing; an
// already open issue of the same title blocks a duplicate; a closed one is filed again; the Rollback line closes both and never deletes.
// Run: node --no-warnings migrations/journey-close-contract-aware.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-journey-close-contract-aware.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x === undefined ? "" : " :: " + JSON.stringify(x).slice(0, 300))); } };
ok(!/[^\x00-\x7F]/.test(sql), "the file is ASCII only (D1-WRITE-ASCII-1)");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql), "the opt-in and DB headers are present");
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(!/\b(DELETE|DROP)\b/i.test(body), "no statement deletes or drops, so no BACKUP header is needed");
const d = new DatabaseSync(":memory:");
d.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER, close_channel TEXT)");
d.exec(body);
const rows = d.prepare("SELECT * FROM agent_issues ORDER BY id").all();
ok(rows.length === 2 && rows.every((r) => r.status === "open" && r.source === "session"), "two open issues are filed", rows.map((r) => r.title.slice(0, 40)));
for (const r of rows) {
  const lines = r.description.split("\n");
  const one = (p) => lines.filter((l) => l.startsWith(p));
  ok(one("code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js").length === 1 && one("code-anchor: ").length === 1 && one("code-probe: ").length === 1, r.title.split(":")[0] + " carries one code-task, one code-anchor and one code-probe line");
  const probe = JSON.parse(one("code-probe: ")[0].slice("code-probe: ".length));
  ok(probe.paths[0] === "qnfo-fleet-control/worker.js" && probe.contains === r.title.split(":")[0], r.title.split(":")[0] + " probe reads the marker named in its title", probe);
  ok(/Definition of done:/.test(r.description) && /Doer: qnfo-code-orchestrator/.test(r.description), r.title.split(":")[0] + " names a doer and a definition of done");
}
d.exec(body);
ok(d.prepare("SELECT COUNT(*) AS n FROM agent_issues").get().n === 2, "a second apply adds nothing while both are open");
d.exec("UPDATE agent_issues SET status = 'closed' WHERE id = 1");
d.exec(body);
ok(d.prepare("SELECT COUNT(*) AS n FROM agent_issues").get().n === 3, "a closed issue of the same title is filed again");
const rb = /^-- Rollback: (.+)$/m.exec(sql)[1];
d.exec(rb);
ok(d.prepare("SELECT COUNT(*) AS n FROM agent_issues WHERE status = 'open'").get().n === 0 && d.prepare("SELECT COUNT(*) AS n FROM agent_issues").get().n === 3, "the Rollback line closes both open issues and deletes none");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
