// ISSUE-HYGIENE-1 (qnfo-observability 1.5.3) offline suite. No network.
// Measured 2026-10-25: evReview escalated an issue_ledger row into agent_issues keyed by the ledger TITLE. The qnfo-ops self-heal loop rewrites that
// title in place whenever its counts move ("[self-heal] tool git_clone_exec failing x3 (33.3% of 9 calls in 6h)" -> "x4 (20.0% of 20 calls in 6h)"), so
// the title match missed and four open agent_issues (source NULL) existed for one ledger row. This suite proves the escalation is keyed by the ledger
// fingerprint: one open ticket per ledger row however its title moves, a ticket that carries the fingerprint and a source, an exact-title ticket of the old
// shape still suppresses a duplicate, a closed ticket is not a duplicate (NO-SILENT-DROP-1 keeps working), and rows below the threshold are not escalated.
// Run: node --no-warnings qnfo-observability/ledger-escalation.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { evReview as __review, VERSION as __v };\n").toString("base64"));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);`);
const AUDIT = { prepare(sql) { let a = []; const s = { bind: (...x) => { a = x; return s; }, run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return s; } };
const env = { AUDIT };
const led = (fp, title, occ, level, status) => db.prepare("INSERT OR REPLACE INTO issue_ledger (fingerprint, source, level, category, title, status, first_seen, last_seen, occurrences, updated_at) VALUES (?, 'qnfo-ops', ?, 'telemetry-self-heal', ?, ?, '2026-10-25 06:00:00', '2026-10-25 11:00:00', ?, '2026-10-25 11:00:00')").run(fp, level, title, status || "open", occ);
const rows = () => db.prepare("SELECT id, title, description, source, category, priority, status FROM agent_issues ORDER BY id").all();

// the table is created by evEnsureSchema on first use
let r = await mod.__review(env);
ok(r.reviewed === 0 && r.escalated === 0 && !r.error, "an empty ledger escalates nothing", r);

led("selfheal:85ef1588", "[self-heal] tool git_clone_exec failing x3 (33.3% of 9 calls in 6h)", 5, "high");
led("selfheal:low", "[self-heal] tool run_code failing x3 (15.0% of 20 calls in 6h)", 2, "high");       // under 3 occurrences: not escalated
led("selfheal:warn", "a warning that repeats", 9, "warning");                                            // not high or error: not escalated
r = await mod.__review(env);
ok(r.escalated === 1 && rows().length === 1, "one ledger row at 3 or more occurrences and high is escalated once", { r, n: rows().length });
const first = rows()[0];
ok(first.source === "qnfo-observability:evReview" && first.category === "reliability" && first.priority === "high" && first.status === "open", "the ticket has a source, a category and a priority (it had NULL source)", first);
ok(first.description.startsWith("AUTO-ESCALATION from evReview ") && first.description.endsWith("fp=selfheal:85ef1588;"), "the description starts as before and ends with the fingerprint tag", first.description);
ok(first.title === "[self-heal] tool git_clone_exec failing x3 (33.3% of 9 calls in 6h)", "the ticket keeps the ledger title");

// the self-heal loop rewrites the ledger title in place as its counts move: no new ticket
for (const t of ["[self-heal] tool git_clone_exec failing x3 (30.0% of 10 calls in 6h)", "[self-heal] tool git_clone_exec failing x4 (21.1% of 19 calls in 6h)", "[self-heal] tool git_clone_exec failing x4 (20.0% of 20 calls in 6h)"]) {
  led("selfheal:85ef1588", t, 6, "high");
  r = await mod.__review(env);
  ok(r.escalated === 0 && rows().length === 1, "a title that moved with the counts is the same ledger row: no second ticket (" + t.slice(30, 60) + ")", { r, n: rows().length });
}

// a second ledger row is its own ticket
led("selfheal:3ddf9c26", "[self-heal] tool github_issue_get failing x5 (62.5% of 8 calls in 6h)", 4, "error");
r = await mod.__review(env);
ok(r.escalated === 1 && rows().length === 2 && rows()[1].description.endsWith("fp=selfheal:3ddf9c26;"), "another ledger row is its own ticket with its own fingerprint", rows().map((x) => x.description.slice(-24)));

// an exact-title ticket of the old shape (no fingerprint tag) still suppresses a duplicate
db.prepare("INSERT INTO agent_issues (title, description, status, created_at, updated_at) VALUES ('Old shape ticket', 'AUTO-ESCALATION from evReview 2026-10-20T00:00:00.000Z - 3x, src qnfo-ops', 'open', 1, 1)").run();
led("fp-old", "Old shape ticket", 3, "high");
r = await mod.__review(env);
ok(r.escalated === 0 && rows().length === 3, "an open ticket with the same title (old shape, no tag) suppresses the escalation", { r, n: rows().length });

// a closed ticket is not a duplicate: the recurrence escalates again (NO-SILENT-DROP-1)
db.prepare("UPDATE agent_issues SET status = 'closed' WHERE description LIKE '%fp=selfheal:3ddf9c26;'").run();
r = await mod.__review(env);
ok(r.escalated === 1 && rows().filter((x) => x.status === "open" && x.description.endsWith("fp=selfheal:3ddf9c26;")).length === 1, "once its ticket is closed, a recurring ledger row escalates again", { r, n: rows().length });

// the 500-character description cap never cuts the tag, even for a very long source
led("fp-long", "Row with a long source", 3, "high");
db.prepare("UPDATE issue_ledger SET source = ? WHERE fingerprint = 'fp-long'").run("s".repeat(900));
r = await mod.__review(env);
const lg = rows().find((x) => x.title === "Row with a long source");
ok(lg && lg.description.endsWith("fp=fp-long;") && lg.description.length <= 520, "a long source is truncated before the tag, the tag survives", lg && lg.description.length);

// the version is at least 1.5.3
const [maj, min, pat] = String(mod.__v).split("-")[0].split(".").map(Number);
ok(maj === 1 && (min > 5 || (min === 5 && pat >= 3)), "VERSION is at least 1.5.3", mod.__v);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
