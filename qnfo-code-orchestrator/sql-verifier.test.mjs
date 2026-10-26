// SQL-VERIFY-1 (qnfo-code-orchestrator 0.29.0, LOOP-BREAKER-1 issue 1000330, 2026-10-26): a code-loop task on a migrations/*.sql file parked as needs_human
// "no deterministic verifier for .sql" three times in 24 h. verify() now checks a .sql proposal: the statements scan (quotes with '' escapes, -- and block comments,
// parentheses), the last statement ends in ';', the header lines the base opts in with survive, and the size stays within 0.5x to 4x of the base.
// Run: node --no-warnings qnfo-code-orchestrator/sql-verifier.test.mjs   (exit 0 = all passed)
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orch-sql-"));
fs.writeFileSync(path.join(tmp, "w.mjs"), fs.readFileSync(path.join(here, "worker.js"), "utf8") + "\nexport { verify as __verify, VERIFIABLE as __VERIFIABLE, VERSION as __version };\n");
const mod = await import(pathToFileURL(path.join(tmp, "w.mjs")).href);

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? "  -- " + JSON.stringify(x).slice(0, 500) : "")); } };

const task = { path: "migrations/2026-10-26-example.sql" };
const BASE = [
  "-- EXAMPLE (2026-10-26): an example migration with enough lines to give the size check a base.",
  "-- APPLY-BY: ci",
  "-- DB: qnfo-audit",
  "-- Rollback: DELETE FROM example WHERE id = 1",
  "-- BACKUP: example",
  "CREATE TABLE IF NOT EXISTS example (id INTEGER PRIMARY KEY, note TEXT);",
  "INSERT OR IGNORE INTO example (id, note) VALUES (1, 'it''s fine -- not a comment; (still text)');",
  "",
].join("\n");
const v = (proposal, base) => mod.__verify({}, task, base === undefined ? BASE : base, proposal);

ok(/^0\.(29|[3-9]\d)\.|^[1-9]/.test(mod.__version), "the worker is 0.29.0 or later", mod.__version);
ok(mod.__VERIFIABLE.indexOf("sql") >= 0, "sql is a verifiable extension");

// good proposals
ok((await v(BASE + "UPDATE example SET note = 'x' WHERE id = 1;\n")).verdict === "ok", "a base with one more statement verifies");
ok((await v(BASE.replace("'it''s fine -- not a comment; (still text)'", "'a ''quoted'' -- value; with (parens'"))).verdict === "ok", "'' escapes, -- and ; and an open ( inside a string are text, not syntax");
ok((await v(BASE + "-- a comment with a quote ' and a paren (\nSELECT 1;\n")).verdict === "ok", "a quote or paren inside a -- comment is ignored");
ok((await v(BASE + "/* block ' ( */ SELECT 2;\n")).verdict === "ok", "a block comment is skipped");
ok((await v(BASE + "CREATE TRIGGER t AFTER INSERT ON example BEGIN UPDATE example SET note = 'y'; END;\n")).verdict === "ok", "a trigger body with inner semicolons verifies when it ends in ';'");
ok((await v("SELECT 1;\n", "")).verdict === "ok", "a new file with no base verifies (no size bound without a base)");
ok((await v("-- APPLY-BY: ci\n" + "SELECT 1;\n".repeat(100), "-- APPLY-BY: ci\nSELECT 1;\n")).verdict === "ok", "a small base (under 400 characters) may grow without a bound");

// broken proposals
let r = await v(BASE + "INSERT INTO example VALUES (2, 'unterminated);\n");
ok(r.verdict === "fail" && /unterminated quote/.test(r.error), "an unterminated quote fails", r);
r = await v(BASE + "INSERT INTO example VALUES (2, 'x';\n");
ok(r.verdict === "fail" && /unbalanced '\('/.test(r.error), "an unclosed parenthesis fails", r);
r = await v(BASE + "INSERT INTO example VALUES 2, 'x');\n");
ok(r.verdict === "fail" && /unbalanced '\)'/.test(r.error), "a stray ')' fails", r);
r = await v(BASE + "SELECT 1\n");
ok(r.verdict === "fail" && /not terminated/.test(r.error), "a last statement with no ';' fails (a truncated rewrite)", r);
r = await v(BASE + "/* never closed\nSELECT 1;\n");
ok(r.verdict === "fail" && /block comment/.test(r.error), "an unterminated block comment fails", r);
r = await v(BASE.replace("-- APPLY-BY: ci\n", ""));
ok(r.verdict === "fail" && /APPLY-BY/.test(r.error), "dropping the APPLY-BY header fails (message names it in capitals)", r);
r = await v(BASE.replace(/-- Rollback:.*\n/, "").replace(/-- BACKUP:.*\n/, ""));
ok(r.verdict === "fail" && /rollback|backup/i.test(r.error), "dropping the Rollback or BACKUP header fails", r);
const HEAD = BASE.split("\n").slice(0, 5).join("\n") + "\n";
const big = BASE + "-- pad\n".repeat(5);
r = await v(HEAD + "SELECT 1;\n", big + big + big);
ok(r.verdict === "fail" && /size changed/.test(r.error), "a rewrite under half the base fails", r);
const BIGBASE = BASE + "-- pad\n".repeat(20);
ok(BIGBASE.length >= 400, "the size cases use a base of 400 characters or more", BIGBASE.length);
r = await v(BIGBASE + "SELECT 1;\n".repeat(200), BIGBASE);
ok(r.verdict === "fail" && /size changed/.test(r.error), "a rewrite past four times the base fails", r);
r = await v(BASE.replace("\n", "\u0000\n"));
ok(r.verdict === "fail" && /NUL/.test(r.error), "NUL bytes still fail", r);
r = await v("");
ok(r.verdict === "fail", "an empty proposal still fails", r);

// the earlier extensions still behave
r = await mod.__verify({}, { path: "docs/x.toml2" }, "a\n", "a\n");
ok(r.verdict === "no-verifier" && /no deterministic verifier for \.toml2/.test(r.error) && /sql/.test(r.error), "an unknown extension still parks, and the message lists sql", r);
r = await mod.__verify({}, { path: "docs/x.json" }, "{}", "{\"a\":1}");
ok(r.verdict === "ok", "json still verifies", r);

console.log("sql-verifier: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
