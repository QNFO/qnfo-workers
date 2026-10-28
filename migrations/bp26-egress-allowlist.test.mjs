// BP26-PROMPT-INJECTION-1 egress review: replays migrations/2026-10-28-bp26-egress-allowlist-and-ga-removal.sql on node:sqlite.
// Output MUST contain "0 failed" on success.   node migrations/bp26-egress-allowlist.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-28-bp26-egress-allowlist-and-ga-removal.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const hdr = sql.split("\n").filter((l) => l.startsWith("--"));
ok(hdr.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && hdr.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in");
ok(hdr.filter((l) => /^-- Rollback:/.test(l)).length === 1, "one Rollback line");
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(!/\b(DELETE\s+FROM|DROP)\b/i.test(body), "body deletes nothing");
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE agent_tool_allowlist (surface TEXT NOT NULL, kind TEXT NOT NULL, pattern TEXT NOT NULL, note TEXT, enabled INTEGER NOT NULL DEFAULT 1, added_at TEXT, PRIMARY KEY (surface, kind, pattern));
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);`);
db.exec(body); db.exec(body);
const rows = db.prepare("SELECT pattern, note FROM agent_tool_allowlist").all();
ok(rows.length === 13, "13 hosts, replay adds none", rows.length);
const need = "isitagentready.com academictransfer.com linkedin.com sre.google ubc.ca tilburguniversity.edu kit.edu sciforum.net open-meteo.com worldtimeapi.org cloudflarestatus.com agentskills.io example.com".split(" ");
ok(need.every((h) => rows.some((r) => r.pattern === h)), "every reviewed host is listed");
ok(rows.every((r) => /^BP26-EGRESS-REVIEW-2026-10-28: .{15,}/.test(r.note)), "each row has a note");
ok(!rows.some((r) => /webhook|requestbin|pastebin|ngrok|interact\.sh|github\.io|pages\.dev|herokuapp/.test(r.pattern)), "no exfil sink or shared host");
const iss = db.prepare("SELECT description FROM agent_issues").all();
ok(iss.length === 2 && iss.every((i) => /^code-task: repo=qnfo-workers path=\S+$/m.test(i.description) && /^code-anchor: /m.test(i.description)), "two issues with code-task lines, replay adds none", iss.length);
for (const f of ["idea-hub", "qnfo-gateway"]) {
  const w = readFileSync(new URL("../" + f + "/worker.js", import.meta.url), "utf8");
  const a = iss.find((i) => i.description.includes("path=" + f + "/worker.js"));
  const anchor = a && /^code-anchor: (.*)$/m.exec(a.description)[1];
  ok(anchor && w.split(anchor).length === 2, f + " anchor occurs exactly once");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
