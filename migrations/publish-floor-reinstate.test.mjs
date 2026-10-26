// PUBLISH-FLOOR-REINSTATE-1 offline suite: applies the trigger from migrations/2026-10-26-publish-floor-reinstate.sql to an in-memory
// papers table and proves which transitions it refuses. Run: node migrations/publish-floor-reinstate.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-publish-floor-reinstate.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE papers (identifier TEXT, status TEXT, body_md TEXT, paper_type TEXT, release_gate_pass INTEGER)");
db.exec(sql.slice(sql.lastIndexOf("CREATE TRIGGER")));
function move(ident, from, to, before, after, type) {
  db.exec("DELETE FROM papers");
  db.prepare("INSERT INTO papers VALUES (?, ?, ?, ?, 0)").run(ident, from, "x".repeat(before), type ?? null);
  try { db.prepare("UPDATE papers SET status = ?, body_md = ?").run(to, "x".repeat(after)); return "ok"; } catch { return "refused"; }
}
const cases = [
  ["qnf-a", "draft", "published", 0, 15000, null, "refused", "a new pipeline paper under 20,000 chars"],
  ["qnf-a", "draft", "published", 0, 25000, null, "ok", "a new pipeline paper over the floor"],
  ["qnf-a", "draft", "published", 0, 30000, "poster", "refused", "a poster"],
  ["qnf-a", "quarantined", "published", 9000, 9000, null, "ok", "a quarantined pipeline paper of 9,000 chars is restored"],
  ["qnf-a", "quarantined", "published", 5000, 5000, null, "refused", "a quarantined pipeline stub under 8,000 chars"],
  ["qnfo-2025-x", "quarantined", "published", 3000, 3000, "section", "ok", "an owner paper is restored whatever its length or type"],
  ["qnfo-2025-x", "retracted", "published", 100, 9000, null, "ok", "a retracted owner paper is restored from its backup"],
  ["qnf-a", "published", "published", 5000, 5000, null, "ok", "a write that leaves a short published body unchanged (a gate verdict)"],
  ["qnf-a", "published", "published", 30000, 12000, null, "refused", "halving a published paper"],
  ["qnf-a", "published", "published", 30000, 7000, null, "refused", "cutting a published paper below 8,000 chars"],
  ["qnfo-2025-x", "published", "published", 30000, 20000, null, "ok", "a modest edit"],
];
for (const [ident, from, to, before, after, type, want, what] of cases) {
  const got = move(ident, from, to, before, after, type);
  ok(got === want, what + " -> " + want, got);
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
