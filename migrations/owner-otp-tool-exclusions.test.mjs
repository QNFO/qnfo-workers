// OWNER-OTP-TOOL-ERRORS-1 offline suite (agent_issues 100334 and 100335).
// Applies migrations/2026-10-20-owner-otp-tool-exclusions.sql on SQLite (node:sqlite) over fixtures and proves
//   1. the header (APPLY-BY ci, DB qnfo-audit, one single-line Rollback that never touches decision_log) and that apply_migrations.py --check accepts the file;
//   2. the four patterns are exactly the error strings qnfo-ops/worker.js returns from ownerOtpSend and ownerOtpVerify, each added once, and the exclusion test the
//      trigger tool_error_files_issue_v2 uses (instr(meta, pattern) > 0) matches the real event meta of the two filed issues and of the two other refusals, and does not match a crash or a send failure;
//   3. the file replays as a no-op, adds one decision row, and the Rollback removes the four rows and leaves the decision.
// Run: node --no-warnings migrations/owner-otp-tool-exclusions.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const FILE = join(here, "2026-10-20-owner-otp-tool-exclusions.sql");
const sql = readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");
const worker = readFileSync(join(root, "qnfo-ops", "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
const body = lines.filter((l) => !l.startsWith("--")).join("\n");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "opts in with APPLY-BY: ci and DB: qnfo-audit");
ok(lines.filter((l) => /^-- Rollback: /.test(l)).length === 1 && !/decision_log/i.test(hdr("Rollback")), "one single-line Rollback that never touches decision_log");
ok(!/\bDELETE\b|\bDROP\b/i.test(body) && hdr("BACKUP") === "", "the body has no DELETE or DROP, so no BACKUP header is needed");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai link and no skip-CI token");
const PY = ["python3", "python"].find((c) => spawnSync(c, ["-I", "-c", "print(1)"], { encoding: "utf8" }).status === 0);
if (PY) { const chk = spawnSync(PY, [join(root, "scripts", "apply_migrations.py"), "--check", FILE], { encoding: "utf8" }); ok(chk.status === 0, "apply_migrations.py --check accepts the file", String(chk.stdout) + String(chk.stderr)); }

const PATTERNS = ["too many codes this hour", "the code has 6 digits", "that code is not right", "no code is waiting"];
for (const p of PATTERNS) ok(worker.includes(p), "qnfo-ops/worker.js returns an error containing: " + p);

const DDL = `CREATE TABLE tool_error_exclusions (pattern TEXT PRIMARY KEY, err_class TEXT NOT NULL, rationale TEXT NOT NULL, added_at TEXT DEFAULT (datetime('now')));
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;`;
const q = (db, s, ...a) => db.prepare(s).all(...a);
const db = new DatabaseSync(":memory:");
db.exec(DDL);
db.prepare("INSERT INTO tool_error_exclusions (pattern, err_class, rationale) VALUES ('access to _cf_KV', 'correct-refusal', 'older row')").run();
db.exec(sql);
const rows = q(db, "SELECT pattern, err_class FROM tool_error_exclusions WHERE rationale LIKE 'OWNER-OTP-TOOL-ERRORS-1%' ORDER BY pattern");
ok(rows.length === 4 && PATTERNS.every((p) => rows.some((r) => r.pattern === p)), "the four patterns are added", rows);
ok(q(db, "SELECT * FROM tool_error_exclusions").length === 5, "and the older row is untouched");
// the trigger's own test: an event is skipped when instr(meta, pattern) > 0 or instr(text, pattern) > 0
const excluded = (meta, text = "") => q(db, "SELECT 1 FROM tool_error_exclusions x WHERE instr(?, x.pattern) > 0 OR instr(?, x.pattern) > 0", meta, text).length > 0;
ok(excluded('{"error":"the code has 6 digits","resultOk":false,"ms":41,"args":{}}'), "evt-f334af72b0ecf9 (owner_verify, the code has 6 digits) is excluded");
ok(excluded('{"error":"too many codes this hour; try again later","resultOk":false,"ms":14,"args":{}}'), "evt-9c336a35b97ce8 (owner_login, too many codes this hour) is excluded");
ok(excluded('{"error":"that code is not right","resultOk":false}') && excluded('{"error":"no code is waiting; call owner_login for a new one","resultOk":false}'), "the wrong-code and no-code refusals are excluded");
ok(!excluded('{"error":"send failed: HTTP 500","resultOk":false}') && !excluded('{"error":"TypeError: cannot read properties of undefined","resultOk":false}'), "a send failure and a crash are not excluded, so tool breakage still files");
const snap = () => JSON.stringify([q(db, "SELECT pattern, err_class, rationale FROM tool_error_exclusions ORDER BY pattern"), q(db, "SELECT action FROM decision_log")]);
ok(q(db, "SELECT * FROM decision_log").length === 1, "one decision row");
const once = snap();
db.exec(sql);
ok(snap() === once, "a replay changes nothing");
for (const stmt of hdr("Rollback").split(/;\s*/).filter(Boolean)) db.exec(stmt);
ok(q(db, "SELECT * FROM tool_error_exclusions").length === 1 && q(db, "SELECT * FROM decision_log").length === 1, "the Rollback removes the four rows and leaves the older row and the decision");
console.log("owner-otp-tool-exclusions: " + pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
