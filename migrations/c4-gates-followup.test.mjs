// C4-GATES-FOLLOWUP-1 offline suite: replays migrations/2026-11-05-c4-gates-followup.sql, which replaces the description of the open LOCAL-GUARD-HEARTBEAT-1 issue (filed by the merged
// migrations/2026-11-04-c4-gates-roadmap-closeout.sql, which is not edited) with the text that carries a machine code-probe line and an ISO-form heartbeat probe.
// Run: node migrations/c4-gates-followup.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const sql = readFileSync(join(here, "2026-11-05-c4-gates-followup.sql"), "utf8");
let fail = 0, pass = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const d = new DatabaseSync(":memory:");
d.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, status TEXT, updated_at INTEGER)");
const OLD = "code-task: repo=qnfo-workers path=docs/ops-governance/scripts/model_guard.py\ncode-anchor: def main():\nCharter pillar: autonomy. Closing probe: SELECT COUNT(*) FROM fleet_heartbeat WHERE ts >= datetime('now','-26 hours')";
d.prepare("INSERT INTO agent_issues (title, description, source, status, updated_at) VALUES (?, ?, ?, ?, 1)").run("LOCAL-GUARD-HEARTBEAT-1: x", OLD, "session:c4-gates", "open");
d.prepare("INSERT INTO agent_issues (title, description, source, status, updated_at) VALUES (?, ?, ?, ?, 1)").run("LOCAL-GUARD-HEARTBEAT-1: closed twin", OLD, "session:c4-gates", "closed");
d.prepare("INSERT INTO agent_issues (title, description, source, status, updated_at) VALUES (?, ?, ?, ?, 1)").run("LOCAL-GUARD-HEARTBEAT-1: someone else's", OLD, "session:other", "open");
d.prepare("INSERT INTO agent_issues (title, description, source, status, updated_at) VALUES (?, ?, ?, ?, 1)").run("OTHER-1: unrelated", "keep", "session:c4-gates", "open");
d.exec(sql);
const rows = d.prepare("SELECT id, description, updated_at u FROM agent_issues ORDER BY id").all();
const mg = readFileSync(join(repo, "docs/ops-governance/scripts/model_guard.py"), "utf8");
ok(rows[0].description.startsWith("code-task: repo=qnfo-workers path=docs/ops-governance/scripts/model_guard.py\ncode-anchor: def main():\ncode-probe: {\"paths\": [\"docs/ops-governance/scripts/model_guard.py\"], \"contains\": \"local-guard:model_guard\"}\n"), "the open issue carries the code-task, code-anchor and code-probe lines", rows[0].description.slice(0, 300));
ok(mg.split("def main():").length === 2, "the code-anchor occurs exactly once in model_guard.py");
ok(/strftime\('%Y-%m-%dT%H:%M:%SZ','now','-26 hours'\)/.test(rows[0].description) && !/datetime\('now'/.test(rows[0].description), "the heartbeat probe compares ISO text with an ISO cutoff");
ok(/Doer:/.test(rows[0].description) && rows[0].u > 1, "the doer is named and updated_at moved");
ok(rows[1].description === OLD && rows[2].description === OLD && rows[3].description === "keep", "a closed twin, another session's issue and an unrelated issue are untouched");
const first = JSON.stringify(rows);
d.exec(sql);
ok(JSON.stringify(d.prepare("SELECT id, description, updated_at u FROM agent_issues ORDER BY id").all()) === first, "a re-run changes nothing");
ok(d.prepare("SELECT COUNT(*) n FROM bak_20261105_c4gates_issue").get().n === 2, "the backup holds the two issues of that source (the open one and its closed twin)");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
